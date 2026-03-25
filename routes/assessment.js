const express = require('express');
const router = express.Router();

router.post('/generate-skills', async (req, res) => {
  try {
    var { domain, education, userId } = req.body;
    
    if (!domain) {
      return res.json({ skills: [] });
    }

    var apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return res.json({ skills: getFallbackSkills(domain) });
    }

    var prompt = 'You are an education AI. Generate exactly 6-8 specific technical skills/topics that a ' + education + ' student studying ' + domain + ' should know. Return ONLY a JSON array of strings, nothing else. Example: ["HTML","CSS","JavaScript","React","Node.js","Git"]. Make them specific to the domain and appropriate for the education level. No explanations, just the JSON array.';

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    var data = await response.json();
    var text = data.content[0].text.trim();
    
    var clean = text.replace(/```json|```/g, '').trim();
    var skills = JSON.parse(clean);
    
    if (Array.isArray(skills) && skills.length >= 6) {
      return res.json({ skills: skills.slice(0, 8) });
    }
    
    return res.json({ skills: getFallbackSkills(domain) });
    
  } catch (err) {
    console.log('Skill generation error:', err.message);
    return res.json({ skills: getFallbackSkills(req.body.domain || '') });
  }
});

function getFallbackSkills(domain) {
  var map = {
    'Web Development': ['HTML', 'CSS', 'JavaScript', 'React/Vue/Angular', 'Node.js', 'REST APIs', 'Git', 'SQL'],
    'Mobile App Development': ['Java/Kotlin', 'Swift/Flutter', 'UI Design', 'REST APIs', 'Local Storage', 'App Deployment', 'Git', 'Testing'],
    'AI & Machine Learning': ['Python', 'Linear Algebra', 'Statistics', 'Supervised Learning', 'Neural Networks', 'Data Preprocessing', 'TensorFlow/PyTorch', 'Model Evaluation'],
    'Data Science': ['Python/R', 'Statistics', 'Data Cleaning', 'SQL', 'Data Visualization', 'Pandas/NumPy', 'ML Basics', 'Data Storytelling'],
    'Cloud & DevOps': ['Linux', 'Docker', 'CI/CD', 'AWS/Azure/GCP', 'Networking', 'Shell Scripting', 'Kubernetes', 'Monitoring'],
    'Cybersecurity': ['Networking', 'Linux', 'Cryptography', 'Web Security', 'Firewalls', 'Ethical Hacking', 'Risk Assessment', 'Incident Response'],
    'Blockchain': ['Distributed Systems', 'Cryptography', 'Solidity', 'Smart Contracts', 'DeFi', 'Web3.js', 'Consensus', 'Token Standards'],
    'UI/UX Design': ['Figma', 'Color Theory', 'Typography', 'Wireframing', 'Prototyping', 'User Research', 'Design Systems', 'Responsive Design'],
    'Competitive Programming': ['Arrays & Strings', 'Linked Lists', 'Trees & Graphs', 'Dynamic Programming', 'Sorting', 'Time Complexity', 'Recursion', 'Greedy'],
    'Digital Marketing': ['SEO', 'Google Ads', 'Social Media', 'Content Marketing', 'Email Marketing', 'Analytics', 'Copywriting', 'CRO'],
    'Game Development': ['Unity/Unreal', '2D/3D Graphics', 'Physics', 'Game Logic', 'Animation', 'Sound Design', 'Level Design', 'Optimization']
  };
  return map[domain] || ['Problem Solving', 'Critical Thinking', 'Technical Writing', 'Research', 'Communication', 'Project Management'];
}

module.exports = router;