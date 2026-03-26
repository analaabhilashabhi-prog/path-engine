const express = require('express');
const router = express.Router();

router.post('/generate-skills', async (req, res) => {
  try {
    var { domain, education } = req.body;
    if (!domain) return res.json({ skills: getFallbackSkills('') });
    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log('No API key, using fallback skills');
      return res.json({ skills: getFallbackSkills(domain) });
    }

    var prompt = 'Generate exactly 6-8 specific technical skills that a ' + (education || '') + ' student studying ' + domain + ' should know. Return ONLY a JSON array of strings. Example: ["HTML","CSS","JavaScript"]. No explanation.';

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
    });

    var data = await response.json();
    console.log('Skills API response status:', response.status);

    if (data.error) {
      console.log('Skills API error:', data.error.message || data.error);
      return res.json({ skills: getFallbackSkills(domain) });
    }

    if (!data.content || !data.content[0] || !data.content[0].text) {
      console.log('Skills API unexpected response:', JSON.stringify(data).substring(0, 200));
      return res.json({ skills: getFallbackSkills(domain) });
    }

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
    if (!domain || !selfRatings) return res.json({ questions: getFallbackQuiz(domain) });
    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log('No API key, using fallback quiz');
      return res.json({ questions: getFallbackQuiz(domain) });
    }

    var ratingsSummary = Object.entries(selfRatings).map(function(entry) {
      var lvl = { 1: 'never heard', 2: 'heard never used', 3: 'knows basics', 4: 'comfortable', 5: 'can teach' };
      return entry[0] + ': ' + (lvl[entry[1]] || 'unknown');
    }).join(', ');

    var prompt = 'You are an assessment AI. Generate exactly 20 quiz questions for a ' + (education || '') + ' student studying ' + domain + '.\n\nStudent self-rated: ' + ratingsSummary + '\n\nRULES:\n- Skills rated 4-5: HARD questions\n- Skills rated 3: MEDIUM questions\n- Skills rated 1-2: EASY questions\n- Mix types: mcq (4 options), truefalse (2 options), scenario (4 options)\n- Questions should test understanding, not memorization\n- Shuffle difficulty throughout\n\nReturn ONLY a JSON array of 20 objects:\n[{"id":1,"type":"mcq","difficulty":"easy","skill":"HTML","question":"...","options":["A","B","C","D"],"correct":0,"time":30}]\n\n- correct = index (0-3) of right answer\n- time = 30 for easy, 45 for medium, 60 for hard\n- type = "mcq", "truefalse", or "scenario"\n- Return ONLY the JSON array. No markdown. No explanation.';

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] })
    });

    var data = await response.json();
    console.log('Quiz API response status:', response.status);

    if (data.error) {
      console.log('Quiz API error:', data.error.message || data.error);
      return res.json({ questions: getFallbackQuiz(domain) });
    }

    if (!data.content || !data.content[0] || !data.content[0].text) {
      console.log('Quiz API unexpected response:', JSON.stringify(data).substring(0, 200));
      return res.json({ questions: getFallbackQuiz(domain) });
    }

    var text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    var questions = JSON.parse(text);

    if (Array.isArray(questions) && questions.length >= 10) {
      questions = questions.slice(0, 20).map(function(q, i) {
        q.id = i + 1;
        if (!q.time) q.time = q.difficulty === 'easy' ? 30 : q.difficulty === 'hard' ? 60 : 45;
        if (typeof q.correct !== 'number') q.correct = 0;
        return q;
      });
      return res.json({ questions: questions });
    }

    console.log('Quiz: parsed but not enough questions, using fallback');
    return res.json({ questions: getFallbackQuiz(domain) });

  } catch (err) {
    console.log('Quiz generation error:', err.message);
    return res.json({ questions: getFallbackQuiz(req.body.domain || '') });
  }
});

function getFallbackSkills(domain) {
  var map = {
    'Web Development': ['HTML', 'CSS', 'JavaScript', 'React/Vue/Angular', 'Node.js', 'REST APIs', 'Git', 'SQL'],
    'AI & Machine Learning': ['Python', 'Linear Algebra', 'Statistics', 'Supervised Learning', 'Neural Networks', 'Data Preprocessing', 'TensorFlow/PyTorch', 'Model Evaluation'],
    'Data Science': ['Python/R', 'Statistics', 'Data Cleaning', 'SQL', 'Data Visualization', 'Pandas/NumPy', 'ML Basics', 'Data Storytelling'],
    'Cybersecurity': ['Networking', 'Linux', 'Cryptography', 'Web Security', 'Firewalls', 'Ethical Hacking', 'Risk Assessment', 'Incident Response'],
    'UI/UX Design': ['Figma', 'Color Theory', 'Typography', 'Wireframing', 'Prototyping', 'User Research', 'Design Systems', 'Responsive Design'],
    'Competitive Programming': ['Arrays & Strings', 'Linked Lists', 'Trees & Graphs', 'Dynamic Programming', 'Sorting', 'Time Complexity', 'Recursion', 'Greedy']
  };
  return map[domain] || ['Problem Solving', 'Critical Thinking', 'Technical Writing', 'Research', 'Communication', 'Project Management'];
}

function getFallbackQuiz(domain) {
  var q = [
    {id:1,type:'mcq',difficulty:'easy',skill:'General',question:'What does API stand for?',options:['Application Programming Interface','Advanced Program Integration','Application Process Interface','Automated Programming Interface'],correct:0,time:30},
    {id:2,type:'truefalse',difficulty:'easy',skill:'General',question:'HTTP is a stateless protocol.',options:['True','False'],correct:0,time:30},
    {id:3,type:'mcq',difficulty:'easy',skill:'General',question:'Which of these is NOT a programming language?',options:['Python','HTML','Java','C++'],correct:1,time:30},
    {id:4,type:'mcq',difficulty:'medium',skill:'General',question:'What is the time complexity of binary search?',options:['O(n)','O(log n)','O(n²)','O(1)'],correct:1,time:45},
    {id:5,type:'truefalse',difficulty:'medium',skill:'General',question:'In most programming languages, array indexing starts at 1.',options:['True','False'],correct:1,time:30},
    {id:6,type:'scenario',difficulty:'medium',skill:'General',question:'A website loads slowly for users in India but fast in the US. What is the most likely cause?',options:['Server is located in the US with no CDN','The code has bugs','Indian users have old browsers','The database is too small'],correct:0,time:45},
    {id:7,type:'mcq',difficulty:'easy',skill:'General',question:'What does CSS stand for?',options:['Cascading Style Sheets','Computer Style Sheets','Creative Style System','Cascading System Sheets'],correct:0,time:30},
    {id:8,type:'mcq',difficulty:'medium',skill:'General',question:'Which data structure uses FIFO (First In First Out)?',options:['Stack','Queue','Tree','Graph'],correct:1,time:45},
    {id:9,type:'truefalse',difficulty:'easy',skill:'General',question:'Git and GitHub are the same thing.',options:['True','False'],correct:1,time:30},
    {id:10,type:'scenario',difficulty:'hard',skill:'General',question:'Your team pushes code to production and the app crashes. Logs show a null pointer exception in the payment module. What should you do FIRST?',options:['Rollback to previous version immediately','Debug the null pointer in production','Call a team meeting to discuss','Add more try-catch blocks'],correct:0,time:60},
    {id:11,type:'mcq',difficulty:'medium',skill:'General',question:'What is the purpose of an index in a database?',options:['To make queries faster','To store backup data','To encrypt data','To compress tables'],correct:0,time:45},
    {id:12,type:'mcq',difficulty:'easy',skill:'General',question:'Which HTTP method is used to retrieve data?',options:['POST','GET','PUT','DELETE'],correct:1,time:30},
    {id:13,type:'truefalse',difficulty:'medium',skill:'General',question:'A recursive function always needs a base case to avoid infinite loops.',options:['True','False'],correct:0,time:30},
    {id:14,type:'scenario',difficulty:'hard',skill:'General',question:'You notice your web app memory usage keeps increasing over time until it crashes. What is this problem called?',options:['Memory leak','Buffer overflow','Stack overflow','Deadlock'],correct:0,time:60},
    {id:15,type:'mcq',difficulty:'easy',skill:'General',question:'What does JSON stand for?',options:['JavaScript Object Notation','Java Standard Object Notation','JavaScript Online Notation','Java Source Object Network'],correct:0,time:30},
    {id:16,type:'mcq',difficulty:'hard',skill:'General',question:'In a microservices architecture, which pattern is used when one service needs to wait for responses from multiple other services?',options:['Saga pattern','API Gateway','Circuit Breaker','Aggregator pattern'],correct:3,time:60},
    {id:17,type:'truefalse',difficulty:'easy',skill:'General',question:'SQL is used to manage relational databases.',options:['True','False'],correct:0,time:30},
    {id:18,type:'scenario',difficulty:'medium',skill:'General',question:'Two developers edit the same file and push to Git. Developer B gets a merge conflict. What should Developer B do?',options:['Manually resolve the conflict and commit','Force push their changes','Delete the file and recreate it','Revert to the original version'],correct:0,time:45},
    {id:19,type:'mcq',difficulty:'hard',skill:'General',question:'What is the CAP theorem in distributed systems?',options:['You can only guarantee 2 of: Consistency, Availability, Partition tolerance','A caching strategy for APIs','A method to calculate API performance','A security protocol for cloud systems'],correct:0,time:60},
    {id:20,type:'mcq',difficulty:'medium',skill:'General',question:'Which of these is a NoSQL database?',options:['MySQL','PostgreSQL','MongoDB','SQLite'],correct:2,time:45}
  ];
  return q;
}

module.exports = router;