const express = require('express');
const router = express.Router();

router.post('/generate-skills', async (req, res) => {
  try {
    var { domain, education } = req.body;
    if (!domain) return res.json({ skills: getFallbackSkills('') });
    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.json({ skills: getFallbackSkills(domain) });
    var prompt = 'Generate exactly 6-8 specific technical skills that a ' + (education || '') + ' student studying ' + domain + ' should know. Return ONLY a JSON array of strings. No explanation.';
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
    });
    var data = await response.json();
    if (data.error || !data.content || !data.content[0]) return res.json({ skills: getFallbackSkills(domain) });
    var text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    var skills = JSON.parse(text);
    if (Array.isArray(skills) && skills.length >= 6) return res.json({ skills: skills.slice(0, 8) });
    return res.json({ skills: getFallbackSkills(domain) });
  } catch (err) {
    return res.json({ skills: getFallbackSkills(req.body.domain || '') });
  }
});

router.post('/generate-quiz', async (req, res) => {
  try {
    var { domain, education, selfRatings } = req.body;
    if (!domain || !selfRatings) return res.json({ questions: getFallbackQuiz(domain) });
    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.json({ questions: getFallbackQuiz(domain) });
    var ratingsSummary = Object.entries(selfRatings).map(function(entry) {
      var lvl = { 1: 'never heard', 2: 'heard never used', 3: 'knows basics', 4: 'comfortable', 5: 'can teach' };
      return entry[0] + ': ' + (lvl[entry[1]] || 'unknown');
    }).join(', ');
    var prompt = 'You are an elite assessment AI. Generate exactly 20 UNGOOGLEABLE quiz questions for a ' + (education || '') + ' student studying ' + domain + '.\n\nStudent self-rated: ' + ratingsSummary + '\n\nRULES:\n- Skills rated 4-5: HARD questions\n- Skills rated 3: MEDIUM questions\n- Skills rated 1-2: EASY but scenario-based\n\nBANNED: "What is X?", "Define Y", True/False, anything googleable\n\nREQUIRED MIX:\n1. CODE OUTPUT (5+): Show code snippet in <code> tags, ask what it outputs. Tricky edge cases.\n2. BUG HUNT (3+): Show code with subtle bug in <code> tags.\n3. PRODUCTION SCENARIO (4+): Real-world production problems.\n4. ARCHITECTURE (3+): System design decisions.\n5. WHAT BREAKS (3+): Change one thing, what fails?\n6. EDGE CASES (2+): Language quirks.\n\nAll 4 options must be plausible. Use common misconceptions as wrong answers.\n\nReturn ONLY a JSON array of 20 objects:\n[{"id":1,"type":"code_output","difficulty":"hard","skill":"JavaScript","category":"Code Analysis","question":"What does this code output?\\n<code>const a=[1,2,3];a[10]=11;console.log(a.length);</code>","options":["3","10","11","undefined"],"correct":2,"time":60}]\n\ncorrect=index 0-3, time=30/45/60 for easy/medium/hard, category=skill area tested.\nNo markdown. No backticks. ONLY the JSON array.';
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] })
    });
    var data = await response.json();
    if (data.error || !data.content || !data.content[0]) return res.json({ questions: getFallbackQuiz(domain) });
    var text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
    var questions = JSON.parse(text);
    if (Array.isArray(questions) && questions.length >= 10) {
      questions = questions.slice(0, 20).map(function(q, i) {
        q.id = i + 1;
        if (!q.time) q.time = q.difficulty === 'easy' ? 30 : q.difficulty === 'hard' ? 60 : 45;
        if (typeof q.correct !== 'number') q.correct = 0;
        if (!q.category) q.category = q.skill || 'General';
        return q;
      });
      return res.json({ questions: questions });
    }
    return res.json({ questions: getFallbackQuiz(domain) });
  } catch (err) {
    return res.json({ questions: getFallbackQuiz(req.body.domain || '') });
  }
});

router.post('/analyze-score', async (req, res) => {
  try {
    var { domain, questions, answers, score, total, ratings, behaviorData } = req.body;
    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.json({ analysis: getBasicAnalysis(questions, answers, score, total) });
    var cats = {};
    questions.forEach(function(q, i) {
      var cat = q.category || q.skill || 'General';
      if (!cats[cat]) cats[cat] = { correct: 0, total: 0 };
      cats[cat].total++;
      if (answers[i] === q.correct) cats[cat].correct++;
    });
    var prompt = 'Analyze this ' + domain + ' assessment.\nScore: ' + score + '/' + total + ' (' + Math.round(score/total*100) + '%)\nCategories: ' + JSON.stringify(cats) + '\nBehavior confidence: ' + (behaviorData.confidenceScore || 'N/A') + '\n\nReturn ONLY JSON:\n{"overallGrade":"A/B/C/D/F","overallMessage":"2-3 sentences","strengths":["str1","str2"],"weaknesses":["weak1"],"categories":[{"name":"cat","score":"X/Y","percentage":80,"verdict":"Strong/Moderate/Weak","tip":"improvement tip"}],"nextSteps":"2-3 sentences"}\nNo markdown. No backticks.';
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
    });
    var data = await response.json();
    if (data.content && data.content[0] && data.content[0].text) {
      var text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
      return res.json({ analysis: JSON.parse(text) });
    }
    return res.json({ analysis: getBasicAnalysis(questions, answers, score, total) });
  } catch (err) {
    return res.json({ analysis: getBasicAnalysis(req.body.questions || [], req.body.answers || {}, req.body.score || 0, req.body.total || 20) });
  }
});

function getBasicAnalysis(questions, answers, score, total) {
  var pct = Math.round((score / total) * 100);
  var grade = pct >= 90 ? 'A' : pct >= 75 ? 'B' : pct >= 60 ? 'C' : pct >= 40 ? 'D' : 'F';
  var cats = {};
  questions.forEach(function(q, i) {
    var c = q.category || q.skill || 'General';
    if (!cats[c]) cats[c] = { correct: 0, total: 0 };
    cats[c].total++;
    if (answers[i] === q.correct) cats[c].correct++;
  });
  var catArr = Object.entries(cats).map(function(e) {
    var p = Math.round(e[1].correct / e[1].total * 100);
    return { name: e[0], score: e[1].correct + '/' + e[1].total, percentage: p, verdict: p >= 70 ? 'Strong' : p >= 40 ? 'Moderate' : 'Weak', tip: p >= 70 ? 'Keep practicing' : 'Focus more here' };
  });
  return { overallGrade: grade, overallMessage: 'You scored ' + score + '/' + total + ' (' + pct + '%).', strengths: catArr.filter(function(c) { return c.percentage >= 70 }).map(function(c) { return c.name }), weaknesses: catArr.filter(function(c) { return c.percentage < 50 }).map(function(c) { return c.name }), categories: catArr, nextSteps: 'Your personalized AI roadmap will focus on your weak areas.' };
}

function getFallbackSkills(domain) {
  var map = {
    'Web Development': ['HTML', 'CSS', 'JavaScript', 'React/Vue/Angular', 'Node.js', 'REST APIs', 'Git', 'SQL'],
    'AI & Machine Learning': ['Python', 'Linear Algebra', 'Statistics', 'Supervised Learning', 'Neural Networks', 'Data Preprocessing', 'TensorFlow/PyTorch', 'Model Evaluation'],
    'Data Science': ['Python/R', 'Statistics', 'Data Cleaning', 'SQL', 'Data Visualization', 'Pandas/NumPy', 'ML Basics', 'Data Storytelling'],
    'Cybersecurity': ['Networking', 'Linux', 'Cryptography', 'Web Security', 'Firewalls', 'Ethical Hacking', 'Risk Assessment', 'Incident Response']
  };
  return map[domain] || ['Problem Solving', 'Critical Thinking', 'Technical Writing', 'Research', 'Communication', 'Project Management'];
}

function getFallbackQuiz(domain) {
  return [
    {id:1,type:'scenario',difficulty:'easy',skill:'General',category:'Web Basics',question:'A form uses method="GET" for a password field. What happens?',options:['Password appears in the URL and browser history','Form won\'t submit','Data is encrypted automatically','Server rejects it'],correct:0,time:30},
    {id:2,type:'code_output',difficulty:'medium',skill:'General',category:'Code Analysis',question:'What does this code output?\n<code>var x = 1;\nfunction foo() {\n  console.log(x);\n  var x = 2;\n}\nfoo();</code>',options:['1','2','undefined','ReferenceError'],correct:2,time:45},
    {id:3,type:'scenario',difficulty:'easy',skill:'General',category:'Web Basics',question:'Site works on Chrome but broken on Safari. Most likely cause?',options:['CSS properties not supported by WebKit','Safari doesn\'t support HTML5','Server blocks Safari','JS disabled in Safari'],correct:0,time:30},
    {id:4,type:'bug_hunt',difficulty:'medium',skill:'General',category:'Debugging',question:'This should filter adults but has a bug:\n<code>const users = [{name:"A",age:25},{name:"B",age:17}];\nconst adults = users.filter(u => u.age > 18);</code>',options:['Should be >= 18 (18-year-olds are adults)','filter doesn\'t work on objects','Arrow function syntax wrong','console.log can\'t print arrays'],correct:0,time:45},
    {id:5,type:'architecture',difficulty:'hard',skill:'General',category:'System Design',question:'10,000 users making real-time chat. Best approach?',options:['WebSocket + Redis message broker','REST API polling every second','Email for each message','Long-polling with setTimeout'],correct:0,time:60},
    {id:6,type:'scenario',difficulty:'medium',skill:'General',category:'Web Basics',question:'Node.js app works locally, crashes on server with "EADDRINUSE". What happened?',options:['Another process using the same port','Node.js not installed','Syntax error','Database connection failed'],correct:0,time:45},
    {id:7,type:'code_output',difficulty:'easy',skill:'General',category:'Code Analysis',question:'What does this output?\n<code>console.log(typeof null);</code>',options:['"null"','"undefined"','"object"','TypeError'],correct:2,time:30},
    {id:8,type:'what_breaks',difficulty:'hard',skill:'General',category:'Architecture',question:'App uses JWT in localStorage. New requirement: multiple tabs with different sessions. What breaks?',options:['localStorage shared across tabs - all get same session','Each tab gets own localStorage','JWTs don\'t work in tabs','Browser blocks localStorage'],correct:0,time:60},
    {id:9,type:'scenario',difficulty:'easy',skill:'General',category:'Version Control',question:'Two devs edit same file. Dev A pushes first. Dev B\'s push rejected. What should Dev B do?',options:['Pull, resolve conflicts, then push','Force push','Delete and recreate file','Abandon old branch'],correct:0,time:30},
    {id:10,type:'bug_hunt',difficulty:'hard',skill:'General',category:'Debugging',question:'This async function sometimes returns undefined:\n<code>async function getUser(id) {\n  fetch("/api/user/"+id)\n    .then(res => res.json())\n    .then(data => { return data; });\n}</code>',options:['Missing return before fetch()','fetch doesn\'t work in async','.then() syntax wrong','.json() doesn\'t return data'],correct:0,time:60},
    {id:11,type:'scenario',difficulty:'medium',skill:'General',category:'Security',question:'API puts user input directly into SQL. User types: \' OR 1=1 --. What happens?',options:['SQL injection - returns all records','Database ignores special chars','Server crashes','Authentication error'],correct:0,time:45},
    {id:12,type:'architecture',difficulty:'medium',skill:'General',category:'System Design',question:'E-commerce app needs confirmation emails after orders. Sync or async?',options:['Async with message queue','Sync so user sees email sent','Doesn\'t matter','Cron job at midnight'],correct:0,time:45},
    {id:13,type:'code_output',difficulty:'hard',skill:'General',category:'Code Analysis',question:'What does this output?\n<code>const a = [1, 2, 3];\nconst b = a;\nb.push(4);\nconsole.log(a.length);</code>',options:['3','4','undefined','Error'],correct:1,time:60},
    {id:14,type:'what_breaks',difficulty:'medium',skill:'General',category:'Architecture',question:'App stores sessions in server memory. You add second server + load balancer. What breaks?',options:['Users logged out randomly - session on wrong server','Sessions auto-sync','Load balancer stores sessions','Second server copies memory'],correct:0,time:45},
    {id:15,type:'edge_case',difficulty:'hard',skill:'General',category:'Language Quirks',question:'What does this evaluate to?\n<code>[] == ![]</code>',options:['true','false','TypeError','undefined'],correct:0,time:60},
    {id:16,type:'scenario',difficulty:'medium',skill:'General',category:'Performance',question:'Website takes 8s to load. DevTools shows 4MB images, 2MB JS. Highest-impact fix?',options:['Compress and lazy-load images','Minify JavaScript first','Add more servers','Faster programming language'],correct:0,time:45},
    {id:17,type:'bug_hunt',difficulty:'easy',skill:'General',category:'Debugging',question:'Always returns true. Why?\n<code>function isAdmin(role) {\n  if (role = "admin") return true;\n  return false;\n}</code>',options:['Uses = instead of === (assignment not comparison)','Function name wrong','return false never executes','Strings can\'t be compared'],correct:0,time:30},
    {id:18,type:'architecture',difficulty:'hard',skill:'General',category:'System Design',question:'Building real-time collaborative editor like Google Docs. Most critical technology?',options:['OT or CRDT for conflict-free editing','Faster database','WebSockets alone','REST with polling'],correct:0,time:60},
    {id:19,type:'what_breaks',difficulty:'medium',skill:'General',category:'Architecture',question:'App uses HTTP (not HTTPS). You add a login form. Critical security issue?',options:['Passwords sent as plain text on network','HTTP forms don\'t support passwords','Browser blocks login on HTTP','Passwords auto-hashed by HTTP'],correct:0,time:45},
    {id:20,type:'scenario',difficulty:'hard',skill:'General',category:'Performance',question:'Query takes 30s on 10M row table. Column has no index. What to do first?',options:['Add index on filtered column','Buy faster server','Rewrite in different language','Split into 10 tables'],correct:0,time:60}
  ];
}

module.exports = router;