const express = require('express');
const router = express.Router();

router.post('/generate-skills', async (req, res) => {
  try {
    var { domain, education } = req.body;
    if (!domain) return res.json({ skills: [] });
    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.json({ skills: getFallbackSkills(domain) });

    var prompt = 'You are an education AI. Generate exactly 6-8 specific technical skills/topics that a ' + education + ' student studying ' + domain + ' should know. Return ONLY a JSON array of strings, nothing else. Example: ["HTML","CSS","JavaScript","React","Node.js","Git"]. Make them specific and appropriate for the education level. No explanations, just the JSON array.';

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
    });
    var data = await response.json();
    var text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    var skills = JSON.parse(text);
    if (Array.isArray(skills) && skills.length >= 6) return res.json({ skills: skills.slice(0, 8) });
    return res.json({ skills: getFallbackSkills(domain) });
  } catch (err) {
    console.log('Skill generation error:', err.message);
    return res.json({ skills: getFallbackSkills(req.body.domain || '') });
  }
});

router.post('/generate-quiz', async (req, res) => {
  try {
    var { domain, education, selfRatings } = req.body;
    if (!domain || !selfRatings) return res.json({ questions: [] });
    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.json({ questions: [] });

    var ratingsSummary = Object.entries(selfRatings).map(function(entry) {
      var levels = { 1: 'never heard', 2: 'heard never used', 3: 'knows basics', 4: 'comfortable', 5: 'can teach' };
      return entry[0] + ': ' + (levels[entry[1]] || 'unknown');
    }).join(', ');

    var prompt = 'You are an education assessment AI. Generate exactly 20 quiz questions for a ' + education + ' student studying ' + domain + '.\n\nThe student self-rated their skills as: ' + ratingsSummary + '\n\nRULES:\n- For skills rated 4-5 (comfortable/can teach): generate HARD questions to verify their claim\n- For skills rated 3 (knows basics): generate MEDIUM questions\n- For skills rated 1-2 (never heard/heard never used): generate EASY questions\n- Mix of question types: MCQ (4 options), true/false, and scenario-based\n- Each question must have exactly one correct answer\n- Questions should be ungoogleable (scenario-based, code output, conceptual)\n- Shuffle difficulty throughout, dont group easy/medium/hard together\n\nReturn ONLY a JSON array of 20 objects with this exact format, nothing else:\n[\n  {\n    "id": 1,\n    "type": "mcq",\n    "difficulty": "easy",\n    "skill": "HTML",\n    "question": "What does HTML stand for?",\n    "options": ["Hyper Text Markup Language", "High Tech Modern Language", "Hyper Transfer Markup Language", "Home Tool Markup Language"],\n    "correct": 0,\n    "time": 30\n  },\n  {\n    "id": 2,\n    "type": "truefalse",\n    "difficulty": "medium",\n    "skill": "CSS",\n    "question": "CSS Grid and Flexbox can be used together in the same layout.",\n    "options": ["True", "False"],\n    "correct": 0,\n    "time": 30\n  },\n  {\n    "id": 3,\n    "type": "scenario",\n    "difficulty": "hard",\n    "skill": "JavaScript",\n    "question": "A junior developer writes: console.log(typeof null). What will be printed and why is this considered a known JavaScript quirk?",\n    "options": ["object - its a legacy bug in JS", "null - typeof returns the actual type", "undefined - null is same as undefined", "string - null gets converted"],\n    "correct": 0,\n    "time": 60\n  }\n]\n\nIMPORTANT:\n- "correct" is the INDEX (0-3) of the correct option\n- "time" is seconds: 30 for easy, 45 for medium, 60 for hard\n- "type" must be "mcq", "truefalse", or "scenario"\n- Generate EXACTLY 20 questions\n- Return ONLY the JSON array, no markdown, no explanation';

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] })
    });

    var data = await response.json();
    var text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    var questions = JSON.parse(text);

    if (Array.isArray(questions) && questions.length >= 15) {
      questions = questions.slice(0, 20).map(function(q, i) {
        q.id = i + 1;
        if (!q.time) q.time = q.difficulty === 'easy' ? 30 : q.difficulty === 'hard' ? 60 : 45;
        if (typeof q.correct !== 'number') q.correct = 0;
        return q;
      });
      return res.json({ questions: questions });
    }
    return res.json({ questions: [] });

  } catch (err) {
    console.log('Quiz generation error:', err.message);
    return res.json({ questions: [] });
  }
});

function getFallbackSkills(domain) {
  var map = {
    'Web Development': ['HTML', 'CSS', 'JavaScript', 'React/Vue/Angular', 'Node.js', 'REST APIs', 'Git', 'SQL'],
    'Mobile App Development': ['Java/Kotlin', 'Swift/Flutter', 'UI Design', 'REST APIs', 'App Deployment', 'Git', 'Testing', 'Databases'],
    'AI & Machine Learning': ['Python', 'Linear Algebra', 'Statistics', 'Supervised Learning', 'Neural Networks', 'Data Preprocessing', 'TensorFlow/PyTorch', 'Model Evaluation'],
    'Data Science': ['Python/R', 'Statistics', 'Data Cleaning', 'SQL', 'Data Visualization', 'Pandas/NumPy', 'ML Basics', 'Data Storytelling'],
    'Cloud & DevOps': ['Linux', 'Docker', 'CI/CD', 'AWS/Azure/GCP', 'Networking', 'Shell Scripting', 'Kubernetes', 'Monitoring'],
    'Cybersecurity': ['Networking', 'Linux', 'Cryptography', 'Web Security', 'Firewalls', 'Ethical Hacking', 'Risk Assessment', 'Incident Response'],
    'UI/UX Design': ['Figma', 'Color Theory', 'Typography', 'Wireframing', 'Prototyping', 'User Research', 'Design Systems', 'Responsive Design'],
    'Competitive Programming': ['Arrays & Strings', 'Linked Lists', 'Trees & Graphs', 'Dynamic Programming', 'Sorting', 'Time Complexity', 'Recursion', 'Greedy'],
    'Digital Marketing': ['SEO', 'Google Ads', 'Social Media', 'Content Marketing', 'Email Marketing', 'Analytics', 'Copywriting', 'CRO'],
    'Game Development': ['Unity/Unreal', '2D/3D Graphics', 'Physics', 'Game Logic', 'Animation', 'Sound Design', 'Level Design', 'Optimization']
  };
  return map[domain] || ['Problem Solving', 'Critical Thinking', 'Technical Writing', 'Research', 'Communication', 'Project Management'];
}

module.exports = router;