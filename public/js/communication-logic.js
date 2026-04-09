var currentUser=null,userDomain='',userName='',userLevel='intermediate';
var chatHistory=[],typingData=[],messageNumber=0,maxMessages=6;
var chatTimer=null,chatTimeLeft=180,chatTimerPaused=false,msgStartTime=0;
var debateHistory=[],debateTopic='',debateTimer=null,debateTimeLeft=180,debateTimerPaused=false,debateTurn=0;
var recognition=null,synthesis=window.speechSynthesis,isRecording=false;
var silenceTimer=null,silenceCount=0,micAttempts=0,micStream=null;
var chatAnalysis=null,debateAnalysis=null,calibrationData=null;
var fillerWords=[],debateTranscript='';
var speechTimeout=null,speechBuffer='';

document.addEventListener('paste',function(e){var a=document.activeElement;if(a&&a.id==='chatInput'){e.preventDefault();showToast('Copy-paste is disabled during chat.','warn')}});
document.addEventListener('copy',function(e){if(document.getElementById('chatSection').classList.contains('show'))e.preventDefault()});

function showToast(msg,type){var t=document.getElementById('toast');t.textContent=msg;t.className='toast '+type+' show';setTimeout(function(){t.classList.remove('show')},3000)}
function showSection(id){document.querySelectorAll('.section').forEach(function(s){s.classList.remove('show')});document.getElementById(id).classList.add('show')}
function formatTime(s){var m=Math.floor(s/60);var sec=s%60;return m+':'+(sec<10?'0':'')+sec}
function pauseChatTimer(){chatTimerPaused=true}
function resumeChatTimer(){chatTimerPaused=false;msgStartTime=Date.now()}
function pauseDebateTimer(){debateTimerPaused=true}
function resumeDebateTimer(){debateTimerPaused=false}

function startPrecheck(){showSection('precheckSection')}
function updateCharCount(){var inp=document.getElementById('precheckInput');var c=inp.value.length;document.getElementById('charCount').textContent=c+' / 500';document.getElementById('precheckBtn').disabled=c<20}

async function submitPrecheck(){
  var intro=document.getElementById('precheckInput').value.trim();
  if(intro.length<20){showToast('Write at least 2-3 sentences.','warn');return}
  var btn=document.getElementById('precheckBtn');btn.disabled=true;btn.textContent='Analyzing...';
  try{var r=await fetch('/api/communication/calibrate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,intro:intro,domain:userDomain})});var d=await r.json();calibrationData=d;userLevel=d.level||'intermediate';maxMessages=userLevel==='beginner'?5:userLevel==='advanced'?8:6;showToast('Level: '+userLevel.charAt(0).toUpperCase()+userLevel.slice(1),'success');setTimeout(function(){startChat(d.message||'Nice to meet you!')},1000)}
  catch(err){userLevel='intermediate';maxMessages=6;setTimeout(function(){startChat('Nice intro! Let\'s chat.')},1000)}
}

function startChat(firstMsg){showSection('chatSection');document.getElementById('msgCounter').textContent='Message 0 / '+maxMessages;chatHistory=[];typingData=[];messageNumber=0;addChatMessage('ai',firstMsg);chatHistory.push({role:'assistant',content:firstMsg});startChatTimer();pauseChatTimer();document.getElementById('chatInput').focus()}

function startChatTimer(){chatTimeLeft=180;chatTimerPaused=true;var el=document.getElementById('chatTimer');el.textContent=formatTime(chatTimeLeft);el.classList.remove('urgent');chatTimer=setInterval(function(){if(chatTimerPaused)return;chatTimeLeft--;el.textContent=formatTime(chatTimeLeft);if(chatTimeLeft<=30)el.classList.add('urgent');if(chatTimeLeft<=0){clearInterval(chatTimer);endChat()}},1000)}

function addChatMessage(role,text){var c=document.getElementById('chatMessages');var d=document.createElement('div');d.className='chat-msg '+role;d.innerHTML='<div class="chat-avatar">'+(role==='ai'?'AI':'U')+'</div><div class="chat-bubble">'+text+'</div>';c.appendChild(d);c.scrollTop=c.scrollHeight}
function addTypingIndicator(){var c=document.getElementById('chatMessages');var d=document.createElement('div');d.className='chat-msg ai';d.id='typingIndicator';d.innerHTML='<div class="chat-avatar">AI</div><div class="chat-bubble"><div class="chat-typing"><span></span><span></span><span></span></div></div>';c.appendChild(d);c.scrollTop=c.scrollHeight}
function removeTypingIndicator(){var el=document.getElementById('typingIndicator');if(el)el.remove()}
function handleChatKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMessage()}}
function autoGrow(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,80)+'px'}

async function sendChatMessage(){
  var input=document.getElementById('chatInput');var msg=input.value.trim();if(!msg)return;
  var typingTime=(Date.now()-msgStartTime)/1000;var words=msg.split(/\s+/).length;var wpm=typingTime>0?Math.round((words/typingTime)*60):0;
  typingData.push(wpm);document.getElementById('wpmDisplay').textContent='Speed: '+wpm+' WPM';
  messageNumber++;addChatMessage('user',msg);chatHistory.push({role:'user',content:msg,typingTime:typingTime});
  input.value='';input.style.height='auto';document.getElementById('chatSendBtn').disabled=true;
  document.getElementById('msgCounter').textContent='Message '+messageNumber+' / '+maxMessages;
  pauseChatTimer();addTypingIndicator();
  try{var r=await fetch('/api/communication/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,message:msg,domain:userDomain,level:userLevel,messageNumber:messageNumber,typingTime:typingTime})});var d=await r.json();removeTypingIndicator();
    if(d.done||messageNumber>=maxMessages){if(d.reply)addChatMessage('ai',d.reply);chatHistory.push({role:'assistant',content:d.reply||'Thanks!'});setTimeout(function(){endChat()},1500);return}
    addChatMessage('ai',d.reply);chatHistory.push({role:'assistant',content:d.reply});document.getElementById('chatSendBtn').disabled=false;resumeChatTimer();input.focus()}
  catch(err){removeTypingIndicator();addChatMessage('ai','Interesting! Tell me more.');chatHistory.push({role:'assistant',content:'Interesting! Tell me more.'});document.getElementById('chatSendBtn').disabled=false;resumeChatTimer()}
}

document.addEventListener('DOMContentLoaded',function(){var inp=document.getElementById('chatInput');if(inp){inp.addEventListener('input',function(){document.getElementById('chatSendBtn').disabled=!inp.value.trim();if(!msgStartTime||chatTimerPaused){msgStartTime=Date.now();resumeChatTimer()}});inp.addEventListener('focus',function(){if(!msgStartTime)msgStartTime=Date.now()})}});

async function endChat(){if(chatTimer)clearInterval(chatTimer);document.getElementById('chatSendBtn').disabled=true;document.getElementById('chatInput').disabled=true;
  try{var r=await fetch('/api/communication/analyze-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,chatHistory:chatHistory,typingData:typingData})});var d=await r.json();chatAnalysis=d.analysis}catch(err){chatAnalysis={overall_written_grade:'C',summary:'Chat completed.'}}
  showSection('chatDoneSection')}

function startMicTest(){showSection('micTestSection');micAttempts=0}
async function startMicTest2(){
  micAttempts++;var visual=document.getElementById('micVisual');var status=document.getElementById('micTestStatus');var btn=document.getElementById('micTestBtn');var passBtn=document.getElementById('micTestPass');
  btn.disabled=true;btn.textContent='Listening...';visual.classList.add('recording');status.textContent='Speak now: "Hello, my name is..."';status.className='mic-status';
  try{micStream=await navigator.mediaDevices.getUserMedia({audio:true});var ac=new(window.AudioContext||window.webkitAudioContext)();var an=ac.createAnalyser();ac.createMediaStreamSource(micStream).connect(an);an.fftSize=256;var da=new Uint8Array(an.frequencyBinCount);var det=false;var lv=document.getElementById('micLevelFill');
    var ci=setInterval(function(){an.getByteFrequencyData(da);var avg=da.reduce(function(a,b){return a+b},0)/da.length;lv.style.width=Math.min(avg*2,100)+'%';if(avg>20)det=true},100);
    setTimeout(function(){clearInterval(ci);visual.classList.remove('recording');micStream.getTracks().forEach(function(t){t.stop()});ac.close();
      if(det){status.textContent='\u2713 Mic working!';status.className='mic-status ok';btn.style.display='none';passBtn.style.display='block'}
      else{status.textContent='\u2717 No audio. Try again.';status.className='mic-status fail';btn.disabled=false;btn.textContent='Try Again ('+(2-micAttempts)+' left)';
        if(micAttempts>=2){document.getElementById('micSkipInfo').textContent='Mic failed. Skip with penalty.';passBtn.style.display='block';passBtn.textContent='Skip Debate';passBtn.onclick=function(){skipDebate()}}}
    },3000)}
  catch(err){visual.classList.remove('recording');status.textContent='\u2717 Mic denied.';status.className='mic-status fail';btn.disabled=false;btn.textContent='Try Again';
    if(micAttempts>=2){passBtn.style.display='block';passBtn.textContent='Skip Debate';passBtn.onclick=function(){skipDebate()}}}
}
function skipDebate(){debateAnalysis={overall_spoken_grade:'F',summary:'Skipped.',fluency_score:0,confidence_score:0,argument_score:0};generateFinalReport()}

async function goToTopicSelect(){
  showSection('topicSection');var list=document.getElementById('topicList');list.innerHTML='<div class="loading-dots"><span></span><span></span><span></span></div>';
  try{var r=await fetch('/api/communication/debate-topics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({domain:userDomain,level:userLevel})});var d=await r.json();var topics=d.topics||[];var html='';
    topics.forEach(function(t,i){html+='<div class="topic-card" id="topic'+i+'" onclick="selectTopic('+i+',\''+t.topic.replace(/'/g,"\\'")+'\')">'+'<h4>'+t.topic+'</h4><p>'+t.type.toUpperCase()+'</p></div>'});list.innerHTML=html}
  catch(err){list.innerHTML='<div class="topic-card" onclick="selectTopic(0,\'AI will replace most jobs\')"><h4>AI will replace most jobs</h4><p>GENERAL</p></div><div class="topic-card" onclick="selectTopic(1,\'Online learning beats classroom\')"><h4>Online learning beats classroom</h4><p>GENERAL</p></div><div class="topic-card" onclick="selectTopic(2,\'Open source beats proprietary\')"><h4>Open source beats proprietary</h4><p>DOMAIN</p></div>'}
}
var selectedTopicIdx=-1;
function selectTopic(idx,topic){document.querySelectorAll('.topic-card').forEach(function(c){c.classList.remove('selected')});var el=document.getElementById('topic'+idx);if(el)el.classList.add('selected');debateTopic=topic;selectedTopicIdx=idx;document.getElementById('customTopic').value='';document.getElementById('topicBtn').disabled=false}
function handleCustomTopic(){var v=document.getElementById('customTopic').value.trim();if(v.length>10){document.querySelectorAll('.topic-card').forEach(function(c){c.classList.remove('selected')});selectedTopicIdx=-1;debateTopic=v;document.getElementById('topicBtn').disabled=false}else if(selectedTopicIdx===-1){document.getElementById('topicBtn').disabled=true}}
function confirmTopic(){if(!debateTopic){showToast('Pick a topic!','warn');return}startPrep()}

function startPrep(){showSection('prepSection');document.getElementById('prepTopic').textContent='"'+debateTopic+'"';var cd=30;var el=document.getElementById('prepCountdown');el.textContent=cd;var pt=setInterval(function(){cd--;el.textContent=cd;if(cd<=0){clearInterval(pt);startDebate()}},1000)}

function startDebate(){
  showSection('debateSection');document.getElementById('debateTopicText').textContent=debateTopic;
  debateHistory=[];debateTurn=0;debateTranscript='';fillerWords=[];silenceCount=0;debateTimeLeft=180;debateTimerPaused=true;
  var el=document.getElementById('debateTimer');el.textContent=formatTime(debateTimeLeft);el.classList.remove('urgent');
  debateTimer=setInterval(function(){if(debateTimerPaused)return;debateTimeLeft--;el.textContent=formatTime(debateTimeLeft);if(debateTimeLeft<=30)el.classList.add('urgent');if(debateTimeLeft<=0){clearInterval(debateTimer);endDebate()}},1000);
  initSpeechRecognition();
  addDebateLine('ai','I\'m ready to debate "'+debateTopic+'". Make your opening argument! Press the red button and speak clearly. Take your time \u2014 I\'ll wait until you finish.');
}

function initSpeechRecognition(){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){showToast('Speech recognition not supported.','danger');return}
  recognition=new SR();recognition.continuous=true;recognition.interimResults=true;recognition.lang='en-US';speechBuffer='';
  recognition.onresult=function(e){
    var interim='';for(var i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal){speechBuffer+=e.results[i][0].transcript+' '}else{interim+=e.results[i][0].transcript}}
    if(speechTimeout)clearTimeout(speechTimeout);
    speechTimeout=setTimeout(function(){
      var ft=speechBuffer.trim();if(ft){resetSilenceTimer();detectFillers(ft);addDebateLine('you',ft);debateHistory.push({role:'student',content:ft});debateTranscript+='STUDENT: '+ft+'\n';speechBuffer='';debateTurn++;pauseDebateTimer();
        if(debateTurn<=3){getAICounter(ft)}else{endDebate()}}
    },2500);
    if(interim&&!/^[a-zA-Z0-9\s.,!?'";\-:()]+$/.test(interim.trim())){showToast('Please respond in English.','warn')}
  };
  recognition.onerror=function(e){console.log('Speech err:',e.error)};
  recognition.onend=function(){if(isRecording){try{recognition.start()}catch(e){}}};
}

function toggleRecording(){
  if(!recognition){showToast('Speech not available.','danger');return}
  var btn=document.getElementById('recBtn');var label=document.getElementById('recLabel');
  if(isRecording){isRecording=false;btn.classList.remove('recording');label.textContent='Tap to speak';try{recognition.stop()}catch(e){}clearSilenceTimer();pauseDebateTimer()}
  else{isRecording=true;btn.classList.add('recording');label.textContent='Speaking... tap to pause';speechBuffer='';try{recognition.start()}catch(e){try{recognition.stop();setTimeout(function(){recognition.start()},100)}catch(e2){}}startSilenceTimer();resumeDebateTimer()}
}

function startSilenceTimer(){clearSilenceTimer();silenceTimer=setInterval(function(){silenceCount++;if(silenceCount>=5){document.getElementById('silenceWarning').classList.add('show');if(silenceCount>=10)showToast('Share your thoughts!','warn')}},2000)}
function resetSilenceTimer(){silenceCount=0;document.getElementById('silenceWarning').classList.remove('show')}
function clearSilenceTimer(){if(silenceTimer){clearInterval(silenceTimer);silenceTimer=null}}
function detectFillers(text){var w=text.toLowerCase().split(/\s+/);['um','uh','uhh','umm','like','basically','actually','literally'].forEach(function(f){w.forEach(function(x){if(x===f)fillerWords.push(f)})})}
function addDebateLine(speaker,text){var c=document.getElementById('debateTranscript');var d=document.createElement('div');d.className='debate-line';d.innerHTML='<div class="speaker '+(speaker==='you'?'you':'ai')+'">'+(speaker==='you'?'YOU':'AI')+'</div><div class="text">'+text+'</div>';c.appendChild(d);c.scrollTop=c.scrollHeight}

async function getAICounter(studentText){
  var wasRec=isRecording;if(isRecording){isRecording=false;document.getElementById('recBtn').classList.remove('recording');document.getElementById('recLabel').textContent='Wait for AI...';try{recognition.stop()}catch(e){}clearSilenceTimer()}
  document.getElementById('aiSpeaking').classList.add('show');
  try{var r=await fetch('/api/communication/debate-counter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic:debateTopic,studentArgument:studentText,debateHistory:debateHistory,level:userLevel,turnNumber:debateTurn})});var d=await r.json();var counter=d.counter||'Interesting, but I disagree.';
    document.getElementById('aiSpeakingText').textContent=counter;addDebateLine('ai',counter);debateHistory.push({role:'ai',content:counter});debateTranscript+='AI: '+counter+'\n';
    speakText(counter,function(){document.getElementById('aiSpeaking').classList.remove('show');if(d.done){setTimeout(function(){endDebate()},1000)}else{document.getElementById('recLabel').textContent='Your turn! Tap to speak'}})}
  catch(err){document.getElementById('aiSpeaking').classList.remove('show');var fb='Fair point, but consider the other side.';addDebateLine('ai',fb);debateHistory.push({role:'ai',content:fb});debateTranscript+='AI: '+fb+'\n';speakText(fb,function(){document.getElementById('recLabel').textContent='Your turn! Tap to speak'})}
}

function speakText(text,cb){if(!synthesis){if(cb)cb();return}synthesis.cancel();var u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=0.95;u.pitch=1;u.onend=function(){if(cb)cb()};u.onerror=function(){if(cb)cb()};synthesis.speak(u)}

async function endDebate(){
  if(debateTimer)clearInterval(debateTimer);if(isRecording){isRecording=false;try{recognition.stop()}catch(e){}}clearSilenceTimer();if(synthesis)synthesis.cancel();
  try{var r=await fetch('/api/communication/analyze-debate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic:debateTopic,transcript:debateTranscript,level:userLevel,silenceEvents:silenceCount,fillerWords:fillerWords})});var d=await r.json();debateAnalysis=d.analysis}catch(err){debateAnalysis={overall_spoken_grade:'C',summary:'Debate completed.'}}
  generateFinalReport();
}

async function generateFinalReport(){
  showSection('analyzingSection');var bar=document.getElementById('commAnalyzeBar');var prog=0;
  var ai=setInterval(function(){prog+=Math.random()*8+2;if(prog>90)prog=90;bar.style.width=prog+'%'},500);
  try{var r=await fetch('/api/communication/generate-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chatAnalysis:chatAnalysis,debateAnalysis:debateAnalysis,calibration:calibrationData,typingData:typingData})});var d=await r.json();clearInterval(ai);bar.style.width='100%';
    try{await supabaseClient.from('assessment_responses').insert({user_id:currentUser.id,layer:'communication',response_data:{chatAnalysis:chatAnalysis,debateAnalysis:debateAnalysis,report:d.report,calibration:calibrationData,typingData:typingData,chatHistory:chatHistory,debateTranscript:debateTranscript,fillerWords:fillerWords},created_at:new Date().toISOString()})}catch(err){}
    setTimeout(function(){showReport(d.report)},800)}
  catch(err){clearInterval(ai);bar.style.width='100%';setTimeout(function(){showReport({overallGrade:'C',writtenGrade:'C',spokenGrade:'C',overallMessage:'Assessment complete.',recommendations:['Keep practicing']})},800)}
}

function showReport(rpt){
  document.querySelector('.page').classList.add('report-mode');
  showSection('reportSection');var g=(rpt.overallGrade||'C').toLowerCase();
  var h='<h2 class="report-title">Communication <span style="color:var(--accent)">Report Card</span></h2><p class="report-sub">Your personalized communication assessment results</p>';
  h+='<div class="report-grade '+g+'">'+(rpt.overallGrade||'C')+'</div>';
  h+='<div class="report-grades" style="animation:fadeUp .6s ease .5s both"><div class="report-grade-card"><div class="label">Written</div><div class="grade" style="color:var(--blue)">'+(rpt.writtenGrade||'C')+'</div></div><div class="report-grade-card"><div class="label">Spoken</div><div class="grade" style="color:#8b5cf6">'+(rpt.spokenGrade||'C')+'</div></div>';
  if(rpt.typingSpeed)h+='<div class="report-grade-card"><div class="label">Speed</div><div class="grade" style="color:var(--accent);font-size:18px">'+rpt.typingSpeed+'</div></div>';
  h+='</div>';
  if(rpt.overallMessage)h+='<p class="report-msg" style="animation:fadeUp .6s ease .7s both">'+rpt.overallMessage+'</p>';
  var scores=[{name:'Grammar',val:chatAnalysis&&chatAnalysis.grammar_score?chatAnalysis.grammar_score*10:50},{name:'Vocabulary',val:chatAnalysis&&chatAnalysis.vocabulary_score?chatAnalysis.vocabulary_score*10:50},{name:'Clarity',val:chatAnalysis&&chatAnalysis.clarity_score?chatAnalysis.clarity_score*10:50},{name:'Fluency',val:debateAnalysis&&debateAnalysis.fluency_score?debateAnalysis.fluency_score*10:50},{name:'Confidence',val:debateAnalysis&&debateAnalysis.confidence_score?debateAnalysis.confidence_score*10:50},{name:'Argument Quality',val:debateAnalysis&&debateAnalysis.argument_score?debateAnalysis.argument_score*10:50}];
  h+='<div class="report-cats" style="animation:fadeUp .6s ease .9s both">';
  scores.forEach(function(s,i){var cls=s.val>=70?'high':s.val>=40?'mid':'low';h+='<div class="report-cat"><div class="report-cat-header"><span class="report-cat-name">'+s.name+'</span><span class="report-cat-score">'+Math.round(s.val)+'%</span></div><div class="report-cat-bar"><div class="report-cat-fill '+cls+'" style="--target-w:'+s.val+'%;animation-delay:'+(1+i*0.15)+'s"></div></div></div>'});
  h+='</div>';
  if(fillerWords.length>0){h+='<div class="report-insights weak" style="animation:fadeUp .6s ease 1.3s both"><h4>\ud83d\udde3 Filler Words ('+fillerWords.length+')</h4><ul>';var fc={};fillerWords.forEach(function(f){fc[f]=(fc[f]||0)+1});Object.entries(fc).forEach(function(e){h+='<li>"'+e[0]+'" \u2014 '+e[1]+'x</li>'});h+='</ul></div>'}
  var aS=(rpt.writtenStrengths||[]).concat(rpt.spokenStrengths||[]);
  if(aS.length){h+='<div class="report-insights str" style="animation:fadeUp .6s ease 1.5s both"><h4>\ud83d\udcaa Strengths</h4><ul>';aS.forEach(function(s){h+='<li>'+s+'</li>'});h+='</ul></div>'}
  var aW=(rpt.writtenWeaknesses||[]).concat(rpt.spokenWeaknesses||[]);
  if(aW.length){h+='<div class="report-insights weak" style="animation:fadeUp .6s ease 1.7s both"><h4>\ud83d\udcc8 Improve</h4><ul>';aW.forEach(function(w){h+='<li>'+w+'</li>'});h+='</ul></div>'}
  if(rpt.recommendations&&rpt.recommendations.length){h+='<div class="report-insights rec" style="animation:fadeUp .6s ease 1.9s both"><h4>\ud83d\udca1 Recommendations</h4><ul>';rpt.recommendations.forEach(function(r){h+='<li>'+r+'</li>'});h+='</ul></div>'}
  if(rpt.roadmapNote)h+='<div class="report-next" style="animation:fadeUp .6s ease 2.1s both">'+rpt.roadmapNote+'</div>';
  h+='<button class="btn-main" style="animation:fadeUp .6s ease 2.3s both;max-width:400px;margin:0 auto;display:block" onclick="goToDashboard()">Continue to Dashboard \u2192</button>';
  document.getElementById('reportContent').innerHTML=h;
}

function goToDashboard(){window.location.href='/pages/dashboard.html'}

(async function(){
  var session=await getSession();if(!session){window.location.href='/pages/auth.html';return}
  currentUser=session.user;userName=currentUser.user_metadata?currentUser.user_metadata.full_name||currentUser.user_metadata.name||'':'';
  var r1=await supabaseClient.from('profiles').select('domain,full_name').eq('id',currentUser.id).single();
  userDomain=r1.data?r1.data.domain:'';if(r1.data&&r1.data.full_name)userName=r1.data.full_name;
  if(!userDomain){window.location.href='/pages/academic-profile.html';return}
})();