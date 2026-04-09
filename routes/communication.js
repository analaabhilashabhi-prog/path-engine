const express = require('express');
const router = express.Router();

// Store chat histories in memory (per user session)
var chatSessions = {};

// PRE-CHECK: Calibrate student's English level
router.post('/calibrate', async (req, res) => {
  try {
    var { userId, intro, domain } = req.body;
    if (!intro || intro.trim().length < 5) return res.json({ level: 'beginner', message: 'Tell me a bit more about yourself!', error: 'Too short' });
    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.json({ level: 'intermediate', message: 'Great! Let\'s begin the chat.', calibrated: true });

    var prompt = 'A student wrote this self-introduction:\n"' + intro + '"\n\nAnalyze their English level. Return ONLY JSON:\n{"level":"beginner/intermediate/advanced","grammar_score":1-10,"vocabulary_score":1-10,"message":"A friendly 1-sentence response acknowledging their intro and saying let\'s begin"}\nNo markdown. No backticks.';

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
    });
    var data = await response.json();
    if (data.content && data.content[0] && data.content[0].text) {
      var text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
      var result = JSON.parse(text);
      // Initialize chat session
      chatSessions[userId] = { level: result.level, domain: domain, history: [], startTime: Date.now() };
      return res.json({ level: result.level, message: result.message, grammar_score: result.grammar_score, vocabulary_score: result.vocabulary_score, calibrated: true });
    }
    return res.json({ level: 'intermediate', message: 'Nice intro! Let\'s begin.', calibrated: true });
  } catch (err) {
    console.log('Calibrate error:', err.message);
    return res.json({ level: 'intermediate', message: 'Let\'s get started!', calibrated: true });
  }
});

// ROUND 1: AI Chat - send message and get response
router.post('/chat', async (req, res) => {
  try {
    var { userId, message, domain, level, messageNumber, typingTime } = req.body;
    if (!message || message.trim().length === 0) return res.json({ reply: 'I didn\'t catch that. Could you try again?', done: false });
    var apiKey = process.env.ANTHROPIC_API_KEY;

    // Get or create session
    if (!chatSessions[userId]) {
      chatSessions[userId] = { level: level || 'intermediate', domain: domain || '', history: [], startTime: Date.now() };
    }
    var session = chatSessions[userId];

    // Track typing data
    session.history.push({ role: 'user', content: message, typingTime: typingTime || 0, messageNumber: messageNumber });

    // Calculate words per minute
    var wordCount = message.trim().split(/\s+/).length;
    var wpm = typingTime > 0 ? Math.round((wordCount / typingTime) * 60) : 0;

    if (!apiKey) {
      var fallbackReplies = [
        'That\'s interesting! Can you tell me more about why you think that way?',
        'Good point. How would you explain this to someone who has never heard of it?',
        'I see. If you had to convince your team to adopt this approach, what would you say?',
        'Interesting perspective! What challenges do you think you might face with that?',
        'Great response. One last thing - how does this relate to your career goals?'
      ];
      var idx = Math.min(messageNumber - 1, fallbackReplies.length - 1);
      var done = messageNumber >= 5;
      return res.json({ reply: fallbackReplies[idx], done: done, wpm: wpm });
    }

    // Determine how many messages based on level
    var maxMessages = session.level === 'beginner' ? 5 : session.level === 'advanced' ? 8 : 6;
    var isDone = messageNumber >= maxMessages;

    // Build conversation for Claude
    var systemPrompt = 'You are a friendly communication assessor for Path Engine. You are chatting with a ' + (session.level || 'intermediate') + '-level English student studying ' + (session.domain || 'technology') + '.\n\nRULES:\n- Have a natural, flowing conversation (NOT an interview)\n- Ask open-ended questions that require explanation\n- Mix general topics with ' + (session.domain || 'tech') + '-related topics\n- If student gives one-word answers, gently push: "Could you tell me a bit more?"\n- If student writes gibberish or nonsense, say: "I didn\'t quite understand that. Could you rephrase?"\n- If English is very weak, simplify YOUR language (shorter sentences, simpler words)\n- Be warm and encouraging, never condescending\n- Keep your responses to 2-3 sentences max\n- For beginner: ask about daily life, hobbies, simple opinions\n- For intermediate: ask about projects, experiences, explanations\n- For advanced: ask about debates, complex scenarios, professional situations\n- This is message ' + messageNumber + ' of ' + maxMessages + '.' + (isDone ? ' This is the LAST exchange. Wrap up warmly.' : '') + '\n\nRespond naturally. No markdown. No bullet points. Just conversational text.';

    var messages = [];
    session.history.forEach(function(h) {
      if (h.role === 'user') messages.push({ role: 'user', content: h.content });
      if (h.role === 'assistant') messages.push({ role: 'assistant', content: h.content });
    });

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 200, system: systemPrompt, messages: messages })
    });

    var data = await response.json();
    if (data.content && data.content[0] && data.content[0].text) {
      var reply = data.content[0].text.trim();
      session.history.push({ role: 'assistant', content: reply });
      return res.json({ reply: reply, done: isDone, wpm: wpm, messageNumber: messageNumber, maxMessages: maxMessages });
    }

    return res.json({ reply: 'That\'s great! Tell me more about your experience with ' + (session.domain || 'this topic') + '.', done: isDone, wpm: wpm });
  } catch (err) {
    console.log('Chat error:', err.message);
    return res.json({ reply: 'Interesting! Could you elaborate on that?', done: false, wpm: 0 });
  }
});

// ROUND 1: Analyze chat transcript
router.post('/analyze-chat', async (req, res) => {
  try {
    var { userId, chatHistory, typingData } = req.body;
    var apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) return res.json({ analysis: getBasicChatAnalysis(chatHistory, typingData) });

    var transcript = chatHistory.map(function(m) { return (m.role === 'user' ? 'STUDENT' : 'AI') + ': ' + m.content; }).join('\n');
    var avgWpm = typingData.length > 0 ? Math.round(typingData.reduce(function(a, b) { return a + b }, 0) / typingData.length) : 0;

    var prompt = 'Analyze this student\'s English communication from a chat conversation.\n\nTranscript:\n' + transcript + '\n\nAverage typing speed: ' + avgWpm + ' WPM\n\nReturn ONLY JSON:\n{"grammar_score":1-10,"vocabulary_level":"basic/intermediate/advanced","vocabulary_score":1-10,"clarity_score":1-10,"effort_score":1-10,"avg_response_length":"short/medium/detailed","common_errors":["error1","error2"],"strengths":["str1","str2"],"suggestions":["sug1","sug2"],"overall_written_grade":"A/B/C/D/F","summary":"2-3 sentence summary of their written communication ability"}\nNo markdown. No backticks.';

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
    });

    var data = await response.json();
    if (data.content && data.content[0] && data.content[0].text) {
      var text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
      return res.json({ analysis: JSON.parse(text) });
    }
    return res.json({ analysis: getBasicChatAnalysis(chatHistory, typingData) });
  } catch (err) {
    console.log('Chat analysis error:', err.message);
    return res.json({ analysis: getBasicChatAnalysis(req.body.chatHistory || [], req.body.typingData || []) });
  }
});

// ROUND 2: Generate debate topics
router.post('/debate-topics', async (req, res) => {
  try {
    var { domain, level } = req.body;
    var apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return res.json({ topics: [
        { id: 1, topic: 'AI will replace most software developers within 10 years', type: 'general' },
        { id: 2, topic: 'Remote work is better than office work for productivity', type: 'general' },
        { id: 3, topic: 'College degrees are becoming less important in tech', type: 'domain' }
      ]});
    }

    var prompt = 'Generate 3 debate topics for a ' + (level || 'intermediate') + '-level English student studying ' + (domain || 'technology') + '.\n\nRules:\n- 2 general topics (technology, education, society)\n- 1 domain-specific topic related to ' + (domain || 'technology') + '\n- Topics should be debatable (two clear sides)\n- ' + (level === 'beginner' ? 'Keep topics simple and relatable' : level === 'advanced' ? 'Make topics complex and nuanced' : 'Keep topics moderately challenging') + '\n\nReturn ONLY JSON array:\n[{"id":1,"topic":"Topic statement here","type":"general"},{"id":2,"topic":"...","type":"general"},{"id":3,"topic":"...","type":"domain"}]\nNo markdown. No backticks.';

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
    });

    var data = await response.json();
    if (data.content && data.content[0] && data.content[0].text) {
      var text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
      return res.json({ topics: JSON.parse(text) });
    }
    return res.json({ topics: [{ id: 1, topic: 'AI will make traditional education obsolete', type: 'general' }, { id: 2, topic: 'Social media does more harm than good', type: 'general' }, { id: 3, topic: 'Open source software is better than proprietary', type: 'domain' }] });
  } catch (err) {
    console.log('Debate topics error:', err.message);
    return res.json({ topics: [{ id: 1, topic: 'Technology is making us less social', type: 'general' }, { id: 2, topic: 'Online learning is as effective as classroom learning', type: 'general' }, { id: 3, topic: 'Every developer should learn AI/ML', type: 'domain' }] });
  }
});

// ROUND 2: AI counter-point during debate
router.post('/debate-counter', async (req, res) => {
  try {
    var { topic, studentArgument, debateHistory, level, turnNumber } = req.body;
    var apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      var fallbacks = [
        'That\'s one way to look at it, but have you considered the opposite? Many experts would disagree because the evidence suggests otherwise.',
        'Interesting point, but I\'d push back on that. The real question is whether the benefits truly outweigh the costs in the long run.',
        'I see your perspective, but let me challenge you. What about the people who are negatively affected? How do you address their concerns?'
      ];
      return res.json({ counter: fallbacks[Math.min(turnNumber - 1, fallbacks.length - 1)], done: turnNumber >= 3 });
    }

    var historyText = (debateHistory || []).map(function(h) { return (h.role === 'student' ? 'STUDENT' : 'AI') + ': ' + h.content; }).join('\n');

    var prompt = 'You are debating a ' + (level || 'intermediate') + '-level English student.\nTopic: "' + topic + '"\nThe student is arguing their position. Your job is to give strong counter-arguments.\n\nDebate so far:\n' + historyText + '\n\nStudent just said: "' + studentArgument + '"\n\nRules:\n- Give a strong counter-argument in 2-3 sentences\n- Be respectful but challenging\n- Use real examples or logic to counter their point\n- ' + (level === 'beginner' ? 'Use simple language' : level === 'advanced' ? 'Use sophisticated arguments' : 'Use clear but substantive arguments') + '\n- This is turn ' + turnNumber + '. ' + (turnNumber >= 3 ? 'Make your final strong point.' : 'Keep the debate going.') + '\n\nRespond with ONLY your counter-argument. No labels, no markdown.';

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 200, messages: [{ role: 'user', content: prompt }] })
    });

    var data = await response.json();
    if (data.content && data.content[0] && data.content[0].text) {
      return res.json({ counter: data.content[0].text.trim(), done: turnNumber >= 3 });
    }
    return res.json({ counter: 'That\'s a fair point, but consider the other side of this argument.', done: turnNumber >= 3 });
  } catch (err) {
    console.log('Debate counter error:', err.message);
    return res.json({ counter: 'Interesting perspective. But what about the potential downsides?', done: false });
  }
});

// ROUND 2: Analyze debate transcript
router.post('/analyze-debate', async (req, res) => {
  try {
    var { topic, transcript, level, silenceEvents, fillerWords } = req.body;
    var apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) return res.json({ analysis: getBasicDebateAnalysis(transcript) });

    var prompt = 'Analyze this student\'s spoken debate performance.\n\nTopic: "' + topic + '"\nStudent level: ' + (level || 'intermediate') + '\nTranscript:\n' + transcript + '\nSilence events: ' + (silenceEvents || 0) + '\nFiller words detected: ' + JSON.stringify(fillerWords || []) + '\n\nReturn ONLY JSON:\n{"fluency_score":1-10,"confidence_score":1-10,"argument_score":1-10,"vocabulary_score":1-10,"filler_word_count":0,"filler_words_list":["um","uh"],"speaking_strengths":["str1","str2"],"speaking_weaknesses":["weak1"],"suggestions":["sug1","sug2"],"overall_spoken_grade":"A/B/C/D/F","summary":"2-3 sentence summary of their debate performance"}\nNo markdown. No backticks.';

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
    });

    var data = await response.json();
    if (data.content && data.content[0] && data.content[0].text) {
      var text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
      return res.json({ analysis: JSON.parse(text) });
    }
    return res.json({ analysis: getBasicDebateAnalysis(transcript) });
  } catch (err) {
    console.log('Debate analysis error:', err.message);
    return res.json({ analysis: getBasicDebateAnalysis(req.body.transcript || '') });
  }
});

// FINAL: Generate combined communication report
router.post('/generate-report', async (req, res) => {
  try {
    var { chatAnalysis, debateAnalysis, calibration, typingData } = req.body;
    var apiKey = process.env.ANTHROPIC_API_KEY;

    var avgWpm = typingData && typingData.length > 0 ? Math.round(typingData.reduce(function(a, b) { return a + b }, 0) / typingData.length) : 0;

    if (!apiKey) {
      var chatGrade = (chatAnalysis && chatAnalysis.overall_written_grade) || 'C';
      var debateGrade = (debateAnalysis && debateAnalysis.overall_spoken_grade) || 'C';
      var gradeMap = { 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'F': 0 };
      var avg = Math.round(((gradeMap[chatGrade] || 2) + (gradeMap[debateGrade] || 2)) / 2);
      var overallGrade = ['F', 'D', 'C', 'B', 'A'][avg];
      return res.json({ report: { overallGrade: overallGrade, writtenGrade: chatGrade, spokenGrade: debateGrade, typingSpeed: avgWpm + ' WPM', summary: 'Assessment complete. Your roadmap will include communication improvement resources.', recommendations: ['Practice writing daily', 'Join English speaking groups'] } });
    }

    var prompt = 'Generate a final communication report card.\n\nChat analysis: ' + JSON.stringify(chatAnalysis) + '\nDebate analysis: ' + JSON.stringify(debateAnalysis) + '\nCalibration level: ' + ((calibration && calibration.level) || 'intermediate') + '\nTyping speed: ' + avgWpm + ' WPM\n\nReturn ONLY JSON:\n{"overallGrade":"A/B/C/D/F","writtenGrade":"A-F","spokenGrade":"A-F","typingSpeed":"X WPM","overallMessage":"3-4 sentence personalized summary","writtenStrengths":["str1"],"writtenWeaknesses":["weak1"],"spokenStrengths":["str1"],"spokenWeaknesses":["weak1"],"recommendations":["rec1","rec2","rec3"],"communicationLevel":"beginner/intermediate/advanced","roadmapNote":"1-2 sentences about what communication resources to add to their learning roadmap"}\nNo markdown. No backticks.';

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
    });

    var data = await response.json();
    if (data.content && data.content[0] && data.content[0].text) {
      var text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
      return res.json({ report: JSON.parse(text) });
    }
    return res.json({ report: { overallGrade: 'C', summary: 'Assessment complete.', recommendations: ['Keep practicing'] } });
  } catch (err) {
    console.log('Report generation error:', err.message);
    return res.json({ report: { overallGrade: 'C', summary: 'Assessment complete.', recommendations: ['Keep practicing'] } });
  }
});

function getBasicChatAnalysis(history, typingData) {
  var userMsgs = (history || []).filter(function(m) { return m.role === 'user' });
  var totalWords = userMsgs.reduce(function(a, m) { return a + m.content.split(/\s+/).length }, 0);
  var avgLen = userMsgs.length > 0 ? Math.round(totalWords / userMsgs.length) : 0;
  return { grammar_score: 5, vocabulary_level: 'intermediate', vocabulary_score: 5, clarity_score: 5, effort_score: avgLen > 10 ? 7 : 4, avg_response_length: avgLen > 15 ? 'detailed' : avgLen > 7 ? 'medium' : 'short', common_errors: [], strengths: ['Completed the chat'], suggestions: ['Try using more varied vocabulary'], overall_written_grade: 'C', summary: 'Basic analysis completed. AI analysis unavailable.' };
}

function getBasicDebateAnalysis(transcript) {
  var words = (transcript || '').split(/\s+/).length;
  return { fluency_score: 5, confidence_score: 5, argument_score: 5, vocabulary_score: 5, filler_word_count: 0, filler_words_list: [], speaking_strengths: ['Participated in debate'], speaking_weaknesses: ['Could not fully analyze without AI'], suggestions: ['Practice speaking regularly'], overall_spoken_grade: 'C', summary: 'Basic analysis completed.' };
}

module.exports = router;