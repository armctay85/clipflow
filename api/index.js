const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Extract YouTube video ID
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^\&\s?]+)/,
    /youtube\.com\/shorts\/([^\&\s?]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Fetch transcript from YouTube
async function fetchTranscript(videoId) {
  try {
    const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const html = response.data;
    const match = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!match) {
      throw new Error('No captions available');
    }

    const captionTracks = JSON.parse(match[1].replace(/\\u0026/g, '&'));
    const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
    
    if (!track || !track.baseUrl) {
      throw new Error('No transcript available');
    }

    const transcriptResponse = await axios.get(track.baseUrl);
    const textMatches = transcriptResponse.data.match(/<text[^>]*>([^<]*)/g) || [];
    const segments = textMatches.map(t => {
      const text = t.replace(/<text[^>]*>/, '').replace(/<\/text>/, '');
      return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    });

    return {
      text: segments.join(' '),
      segments: segments.length,
      language: track.languageCode
    };
  } catch (error) {
    throw new Error(`Transcript fetch failed: ${error.message}`);
  }
}

// Generate content with Claude
async function generateContent(transcript, platforms) {
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
        messages: [{ role: 'user', content: prompts[platform] }]
      });
      results[platform] = response.content[0].text;
    }
  }

  return results;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { url } = req;
  
  // Health check
  if (url === '/api/health' || url === '/health') {
    return res.json({ status: 'ok', service: 'clipflow-api', timestamp: new Date().toISOString() });
  }
  
  // Transform endpoint
  if (url === '/api/transform' && req.method === 'POST') {
    try {
      const { videoUrl, platforms = ['linkedin', 'twitter'] } = req.body;
      
      if (!videoUrl) {
        return res.status(400).json({ error: 'Video URL required' });
      }

      const videoId = extractVideoId(videoUrl);
      if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
      }

      const transcriptData = await fetchTranscript(videoId);
      const content = await generateContent(transcriptData.text, platforms);

      return res.json({
        videoId,
        transcript: transcriptData.text.substring(0, 500) + '...',
        content,
        platforms,
        success: true
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Extract endpoint
  if (url === '/api/extract' && req.method === 'POST') {
    try {
      const { videoUrl } = req.body;
      if (!videoUrl) {
        return res.status(400).json({ error: 'Video URL required' });
      }

      const videoId = extractVideoId(videoUrl);
      if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
      }

      const transcript = await fetchTranscript(videoId);
      return res.json({ videoId, ...transcript, success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  
  // Default
  res.json({ 
    message: 'ClipFlow API', 
    endpoints: ['/api/health', '/api/extract', '/api/transform'],
    docs: 'https://github.com/armctay85/clipflow'
  });
};
