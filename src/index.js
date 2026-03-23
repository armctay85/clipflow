require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'clipflow-api'
  });
});

// Extract YouTube transcript using direct API
app.post('/api/extract', async (req, res) => {
  try {
    const { videoUrl } = req.body;
    
    if (!videoUrl) {
      return res.status(400).json({ error: 'Video URL required' });
    }

    // Extract video ID
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Fetch transcript via YouTube's timedtext API
    const transcript = await fetchTranscript(videoId);

    res.json({
      videoId,
      transcript: transcript.text,
      segments: transcript.segments,
      success: true
    });
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ 
      error: 'Failed to extract transcript',
      details: error.message 
    });
  }
});

// Generate social content
app.post('/api/generate', async (req, res) => {
  try {
    const { transcript, platforms = ['linkedin', 'twitter'], tone = 'professional' } = req.body;
    
    if (!transcript) {
      return res.status(400).json({ error: 'Transcript required' });
    }

    const content = await generateContent(transcript, platforms, tone);

    res.json({
      content,
      platforms,
      generatedAt: new Date().toISOString(),
      success: true
    });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate content',
      details: error.message 
    });
  }
});

// Full pipeline: URL → Content
app.post('/api/transform', async (req, res) => {
  try {
    const { videoUrl, platforms = ['linkedin', 'twitter'], tone = 'professional' } = req.body;
    
    if (!videoUrl) {
      return res.status(400).json({ error: 'Video URL required' });
    }

    // Step 1: Extract
    const videoId = extractVideoId(videoUrl);
    const transcriptData = await fetchTranscript(videoId);
    const transcript = transcriptData.text;

    // Step 2: Generate
    const content = await generateContent(transcript, platforms, tone);

    res.json({
      videoId,
      transcript: transcript.substring(0, 500) + '...',
      content,
      platforms,
      success: true
    });
  } catch (error) {
    console.error('Transform error:', error);
    res.status(500).json({ 
      error: 'Failed to transform video',
      details: error.message 
    });
  }
});

// Helper: Extract video ID
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /youtube\.com\/shorts\/([^&\s?]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Helper: Fetch transcript from YouTube
async function fetchTranscript(videoId) {
  try {
    // Try to get captions from YouTube's player API
    const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const html = response.data;
    
    // Extract caption tracks from player response
    const match = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!match) {
      throw new Error('No captions available for this video');
    }

    const captionTracks = JSON.parse(match[1].replace(/\\u0026/g, '&'));
    const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
    
    if (!track || !track.baseUrl) {
      throw new Error('No transcript available');
    }

    // Fetch the actual transcript
    const transcriptResponse = await axios.get(track.baseUrl);
    const transcriptXml = transcriptResponse.data;
    
    // Parse XML to text
    const textMatches = transcriptXml.match(/<text[^>]*>([^<]*)/g) || [];
    const segments = textMatches.map(t => {
      const text = t.replace(/<text[^>]*>/, '').replace(/<\/text>/, '');
      return decodeHtmlEntities(text);
    });

    const fullText = segments.join(' ');

    return {
      text: fullText,
      segments: segments.length,
      language: track.languageCode
    };
  } catch (error) {
    console.error('Transcript fetch error:', error.message);
    throw new Error(`Failed to fetch transcript: ${error.message}`);
  }
}

// Helper: Decode HTML entities
function decodeHtmlEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'"
  };
  return text.replace(/&[^;]+;/g, entity => entities[entity] || entity);
}

// Helper: Generate content with Claude
async function generateContent(transcript, platforms, tone) {
  const prompts = {
    linkedin: `Transform this video transcript into 3 LinkedIn posts. Each should be 150-300 words, professional, include 3-5 relevant hashtags, and have a hook that drives engagement. Add line breaks for readability.\n\nTranscript:\n${transcript}`,
    twitter: `Transform this video transcript into 5 Twitter/X posts. Each should be under 280 characters, punchy, and include 1-2 relevant hashtags. Make them thread-worthy.\n\nTranscript:\n${transcript}`,
    instagram: `Transform this video transcript into 3 Instagram captions. Each should be 100-200 words, conversational, include 5-10 hashtags, and have a call-to-action.\n\nTranscript:\n${transcript}`
  };

  const results = {};

  for (const platform of platforms) {
    if (prompts[platform]) {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompts[platform]
        }]
      });
      
      results[platform] = response.content[0].text;
    }
  }

  return results;
}

// Waitlist endpoint
app.post('/api/waitlist', async (req, res) => {
  try {
    const { email, plan = 'pro' } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    // TODO: Store in Supabase
    console.log('Waitlist signup:', { email, plan });

    res.json({
      success: true,
      message: 'Welcome to the waitlist!',
      position: Math.floor(Math.random() * 50) + 1 // Mock position
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to join waitlist' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 ClipFlow API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
