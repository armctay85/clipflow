const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.url === '/health') {
    return res.json({ status: 'ok', service: 'clipflow-api' });
  }
  
  if (req.url === '/api/transform' && req.method === 'POST') {
    // Simplified transform endpoint
    return res.json({ 
      success: true, 
      message: 'Transform endpoint ready',
      videoUrl: req.body?.videoUrl 
    });
  }
  
  res.json({ message: 'ClipFlow API', endpoints: ['/health', '/api/transform'] });
};
