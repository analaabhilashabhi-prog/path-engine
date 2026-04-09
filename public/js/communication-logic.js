var currentUser=null,userDomain='',userName='',userLevel='intermediate';
var chatHistory=[],typingData=[],messageNumber=0,maxMessages=6;
var chatTimer=null,chatTimeLeft=180,msgStartTime=0;
var debateHistory=[],debateTopic='',debateTimer=null,debateTimeLeft=180,debateTurn=0;
var recognition=null,synthesis=window.speechSynthesis,isRecording=false;
var silenceTimer=null,silenceCount=0,micAttempts=0,micStream=null;
var chatAnalysis=null,debateAnalysis=null,calibrationData=null;
var fillerWords=[],debateTranscript='';

// DISABLE COPY PASTE in chat
document.addEventListener('paste',function(e){
  var active=document.activeElement;
  if(active&&(active.id==='chatInput')){e.preventDefault();showToast('Copy-paste is disabled during chat.','warn')}
});
document.addEventListener('copy',function(e){if(document.getElementById('chatSection').classList.contains('show'))e.preventDefault()});

function showToast(msg,type){var t=document.getElementById('toast');t.textContent=msg;t.className='toast '+type+' show';setTimeout(function(){t.classList.remove('show')},3000)}
function showSection(id){document.querySelectorAll('.section').forEach(function(s){s.classList.remove('show')});document.getElementById(id).classList.add('show')}
function formatTime(s){var m=Math.floor(s/60);var sec=s%60;return m+':'+(sec<10?'0':'')+sec}

// INTRO
function startPrecheck(){showSection('precheckSection')}

// PRE-CHECK
function updateCharCount(){
  var inp=document.getElementById('precheckInput');
  var count=inp.value.length;
  document.getElementById('charCount').textContent=count+' / 500';
  document.getElementById('precheckBtn').disabled=count<20;
}

async function submitPrecheck(){
  var intro=document.getElementById('precheckInput').value.trim();
  if(intro.length<20){showToast('Please write at least 2-3 sentences.','warn');return}
  var btn=document.getElementById('precheckBtn');
  btn.disabled=true;btn.textContent='Analyzing...';
  try{
    var r=await fetch('/api/communication/calibrate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,intro:intro,domain:userDomain})});
    var d=await r.json();
    calibrationData=d;
    userLevel=d.level||'intermediate';
    maxMessages=userLevel==='beginner'?5:userLevel==='advanced'?8:6;
    showToast('Level: '+userLevel.charAt(0).toUpperCase()+userLevel.slice(1)+'. Let\'s chat!','success');
    setTimeout(function(){startChat(d.message||'Nice to meet you! Let\'s have a conversation.')},1000);
  }catch(err){
    userLevel='intermediate';maxMessages=6;
    setTimeout(function(){startChat('Nice intro! Let\'s start chatting.')},1000);
  }
}

// ROUND 1: CHAT
function startChat(firstMsg){
  showSection('chatSection');
  document.getElementById('msgCounter').textContent='Message 0 / '+maxMessages;
  chatHistory=[];typingData=[];messageNumber=0;
  addChatMessage('ai',firstMsg);
  chatHistory.push({role:'assistant',content:firstMsg});
  startChatTimer();
  document.getElementById('chatInput').focus();
}

function startChatTimer(){
  chatTimeLeft=180;
  var el=document.getElementById('chatTimer');
  el.textContent=formatTime(chatTimeLeft);
  el.classList.remove('urgent');
  chatTimer=setInterval(function(){
    chatTimeLeft--;el.textContent=formatTime(chatTimeLeft);
    if(chatTimeLeft<=30)el.classList.add('urgent');
    if(chatTimeLeft<=0){clearInterval(chatTimer);endChat()}
  },1000);
}

function addChatMessage(role,text){
  var container=document.getElementById('chatMessages');
  var div=document.createElement('div');
  div.className='chat-msg '+role;
  div.innerHTML='<div class="chat-avatar">'+(role==='ai'?'AI':'U')+'</div><div class="chat-bubble">'+text+'</div>';
  container.appendChild(div);
  container.scrollTop=container.scrollHeight;
}

function addTypingIndicator(){
  var container=document.getElementById('chatMessages');
  var div=document.createElement('div');
  div.className='chat-msg ai';div.id='typingIndicator';
  div.innerHTML='<div class="chat-avatar">AI</div><div class="chat-bubble"><div class="chat-typing"><span></span><span></span><span></span></div></div>';
  container.appendChild(div);
  container.scrollTop=container.scrollHeight;
}

function removeTypingIndicator(){var el=document.getElementById('typingIndicator');if(el)el.remove()}

function handleChatKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMessage()}}

function autoGrow(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,80)+'px'}

async function sendChatMessage(){
  var input=document.getElementById('chatInput');
  var msg=input.value.trim();
  if(!msg)return;

  var typingTime=(Date.now()-msgStartTime)/1000;
  var words=msg.split(/\s+/).length;
  var wpm=typingTime>0?Math.round((words/typingTime)*60):0;
  typingData.push(wpm);
  document.getElementById('wpmDisplay').textContent='Typing speed: '+wpm+' WPM';

  messageNumber++;
  addChatMessage('user',msg);
  chatHistory.push({role:'user',content:msg,typingTime:typingTime});
  input.value='';input.style.height='auto';
  document.getElementById('chatSendBtn').disabled=true;
  document.getElementById('msgCounter').textContent='Message '+messageNumber+' / '+maxMessages;

  addTypingIndicator();

  try{
    var r=await fetch('/api/communication/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,message:msg,domain:userDomain,level:userLevel,messageNumber:messageNumber,typingTime:typingTime})});
    var d=await r.json();
    removeTypingIndicator();

    if(d.done||messageNumber>=maxMessages){
      if(d.reply)addChatMessage('ai',d.reply);
      chatHistory.push({role:'assistant',content:d.reply||'Thanks for chatting!'});
      setTimeout(function(){endChat()},1500);
      return;
    }

    addChatMessage('ai',d.reply);
    chatHistory.push({role:'assistant',content:d.reply});
    document.getElementById('chatSendBtn').disabled=false;
    msgStartTime=Date.now();
    input.focus();
  }catch(err){
    removeTypingIndicator();
    addChatMessage('ai','That\'s interesting! Tell me more.');
    chatHistory.push({role:'assistant',content:'That\'s interesting! Tell me more.'});
    document.getElementById('chatSendBtn').disabled=false;
    msgStartTime=Date.now();
  }
}

async function endChat(){
  if(chatTimer)clearInterval(chatTimer);
  document.getElementById('chatSendBtn').disabled=true;
  document.getElementById('chatInput').disabled=true;

  try{
    var r=await fetch('/api/communication/analyze-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:currentUser.id,chatHistory:chatHistory,typingData:typingData})});
    var d=await r.json();
    chatAnalysis=d.analysis;
  }catch(err){chatAnalysis={overall_written_grade:'C',summary:'Chat completed.'}}

  showSection('chatDoneSection');
}

// MIC TEST
function startMicTest(){showSection('micTestSection');micAttempts=0}

async function startMicTest2(){
  micAttempts++;
  var visual=document.getElementById('micVisual');
  var status=document.getElementById('micTestStatus');
  var btn=document.getElementById('micTestBtn');
  var passBtn=document.getElementById('micTestPass');

  btn.disabled=true;btn.textContent='Listening...';
  visual.classList.add('recording');
  status.textContent='Speak now: "Hello, my name is..."';status.className='mic-status';

  try{
    micStream=await navigator.mediaDevices.getUserMedia({audio:true});
    var audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    var analyser=audioCtx.createAnalyser();
    var source=audioCtx.createMediaStreamSource(micStream);
    source.connect(analyser);
    analyser.fftSize=256;
    var dataArray=new Uint8Array(analyser.frequencyBinCount);
    var detected=false;
    var levelEl=document.getElementById('micLevelFill');

    var checkInterval=setInterval(function(){
      analyser.getByteFrequencyData(dataArray);
      var avg=dataArray.reduce(function(a,b){return a+b},0)/dataArray.length;
      levelEl.style.width=Math.min(avg*2,100)+'%';
      if(avg>20)detected=true;
    },100);

    setTimeout(function(){
      clearInterval(checkInterval);
      visual.classList.remove('recording');
      micStream.getTracks().forEach(function(t){t.stop()});
      audioCtx.close();

      if(detected){
        status.textContent='\u2713 Microphone working! Audio detected.';status.className='mic-status ok';
        btn.style.display='none';
        passBtn.style.display='block';
      }else{
        status.textContent='\u2717 No audio detected. Try again.';status.className='mic-status fail';
        btn.disabled=false;btn.textContent='Try Again ('+(2-micAttempts)+' left)';
        if(micAttempts>=2){
          document.getElementById('micSkipInfo').textContent='Mic test failed. You can skip but debate score will have a penalty.';
          passBtn.style.display='block';passBtn.textContent='Skip Debate (with penalty)';passBtn.onclick=function(){skipDebate()};
        }
      }
    },3000);
  }catch(err){
    visual.classList.remove('recording');
    status.textContent='\u2717 Microphone access denied.';status.className='mic-status fail';
    btn.disabled=false;btn.textContent='Try Again';
    if(micAttempts>=2){
      document.getElementById('micSkipInfo').textContent='Mic denied. Debate will be skipped with penalty.';
      passBtn.style.display='block';passBtn.textContent='Skip Debate (with penalty)';passBtn.onclick=function(){skipDebate()};
    }
  }
}

function skipDebate(){
  debateAnalysis={overall_spoken_grade:'F',summary:'Debate skipped. Microphone not available.',fluency_score:0,confidence_score:0,argument_score:0};
  generateFinalReport();
}

// TOPIC SELECT
async function goToTopicSelect(){
  showSection('topicSection');
  var list=document.getElementById('topicList');
  list.innerHTML='<div class="loading-dots"><span></span><span></span><span></span></div>';

  try{
    var r=await fetch('/api/communication/debate-topics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({domain:userDomain,level:userLevel})});
    var d=await r.json();
    var topics=d.topics||[];
    var html='';
    topics.forEach(function(t,i){
      html+='<div class="topic-card" id="topic'+i+'" onclick="selectTopic('+i+',\''+t.topic.replace(/'/g,"\\'")+'\')">';
      html+='<h4>'+t.topic+'</h4><p>'+t.type.toUpperCase()+'</p></div>';
    });
    list.innerHTML=html;
  }catch(err){
    list.innerHTML='<div class="topic-card" onclick="selectTopic(0,\'AI will replace most jobs\')"><h4>AI will replace most jobs in the next decade</h4><p>GENERAL</p></div><div class="topic-card" onclick="selectTopic(1,\'Online learning is better than classroom\')"><h4>Online learning is better than classroom learning</h4><p>GENERAL</p></div><div class="topic-card" onclick="selectTopic(2,\'Open source is better than proprietary\')"><h4>Open source software is better than proprietary</h4><p>DOMAIN</p></div>';
  }
}

var selectedTopicIdx=-1;
function selectTopic(idx,topic){
  document.querySelectorAll('.topic-card').forEach(function(c){c.classList.remove('selected')});
  var el=document.getElementById('topic'+idx);
  if(el)el.classList.add('selected');
  debateTopic=topic;
  selectedTopicIdx=idx;
  document.getElementById('customTopic').value='';
  document.getElementById('topicBtn').disabled=false;
}

function handleCustomTopic(){
  var val=document.getElementById('customTopic').value.trim();
  if(val.length>10){
    document.querySelectorAll('.topic-card').forEach(function(c){c.classList.remove('selected')});
    selectedTopicIdx=-1;
    debateTopic=val;
    document.getElementById('topicBtn').disabled=false;
  }else if(selectedTopicIdx===-1){
    document.getElementById('topicBtn').disabled=true;
  }
}

function confirmTopic(){
  if(!debateTopic){showToast('Pick a topic first!','warn');return}
  startPrep();
}

// PREP
function startPrep(){
  showSection('prepSection');
  document.getElementById('prepTopic').textContent='"'+debateTopic+'"';
  var countdown=30;
  var el=document.getElementById('prepCountdown');
  el.textContent=countdown;
  var prepTimer=setInterval(function(){
    countdown--;el.textContent=countdown;
    if(countdown<=0){clearInterval(prepTimer);startDebate()}
  },1000);
}

// DEBATE
function startDebate(){
  showSection('debateSection');
  document.getElementById('debateTopicText').textContent=debateTopic;
  debateHistory=[];debateTurn=0;debateTranscript='';fillerWords=[];silenceCount=0;
  debateTimeLeft=180;
  var el=document.getElementById('debateTimer');
  el.textContent=formatTime(debateTimeLeft);el.classList.remove('urgent');
  debateTimer=setInterval(function(){
    debateTimeLeft--;el.textContent=formatTime(debateTimeLeft);
    if(debateTimeLeft<=30)el.classList.add('urgent');
    if(debateTimeLeft<=0){clearInterval(debateTimer);endDebate()}
  },1000);

  initSpeechRecognition();
  addDebateLine('ai','I\'m ready to debate "'+debateTopic+'" with you. Make your opening argument! Press the red button to start speaking.');
}

function initSpeechRecognition(){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){showToast('Speech recognition not supported in this browser.','danger');return}
  recognition=new SR();
  recognition.continuous=true;
  recognition.interimResults=true;
  recognition.lang='en-US';

  var currentTranscript='';
  recognition.onresult=function(e){
    currentTranscript='';
    for(var i=e.resultIndex;i<e.results.length;i++){
      currentTranscript+=e.results[i][0].transcript;
    }
    if(e.results[e.results.length-1].isFinal){
      var text=currentTranscript.trim();
      if(text){
        resetSilenceTimer();
        detectFillers(text);
        addDebateLine('you',text);
        debateHistory.push({role:'student',content:text});
        debateTranscript+='STUDENT: '+text+'\n';
        debateTurn++;
        if(debateTurn<=3){getAICounter(text)}
        else{endDebate()}
      }
    }
    // Detect non-English
    if(currentTranscript&&!/^[a-zA-Z0-9\s.,!?'";\-:()]+$/.test(currentTranscript.trim())){
      showToast('Please respond in English.','warn');
    }
  };
  recognition.onerror=function(e){console.log('Speech error:',e.error)};
  recognition.onend=function(){if(isRecording){try{recognition.start()}catch(e){}}};
}

function toggleRecording(){
  if(!recognition){showToast('Speech recognition not available.','danger');return}
  var btn=document.getElementById('recBtn');
  var label=document.getElementById('recLabel');
  if(isRecording){
    isRecording=false;btn.classList.remove('recording');label.textContent='Tap to speak';
    try{recognition.stop()}catch(e){}
    clearSilenceTimer();
  }else{
    isRecording=true;btn.classList.add('recording');label.textContent='Speaking... tap to pause';
    try{recognition.start()}catch(e){try{recognition.stop();setTimeout(function(){recognition.start()},100)}catch(e2){}}
    startSilenceTimer();
  }
}

function startSilenceTimer(){
  clearSilenceTimer();
  silenceTimer=setInterval(function(){
    silenceCount++;
    if(silenceCount>=5){
      document.getElementById('silenceWarning').classList.add('show');
      if(silenceCount>=10){showToast('Share your thoughts! The clock is ticking.','warn')}
    }
  },2000);
}
function resetSilenceTimer(){silenceCount=0;document.getElementById('silenceWarning').classList.remove('show')}
function clearSilenceTimer(){if(silenceTimer){clearInterval(silenceTimer);silenceTimer=null}}

function detectFillers(text){
  var words=text.toLowerCase().split(/\s+/);
  var fl=['um','uh','uhh','umm','like','you know','basically','actually','literally','so','well'];
  words.forEach(function(w){if(fl.indexOf(w)!==-1)fillerWords.push(w)});
}

function addDebateLine(speaker,text){
  var container=document.getElementById('debateTranscript');
  var div=document.createElement('div');
  div.className='debate-line';
  div.innerHTML='<div class="speaker '+(speaker==='you'?'you':'ai')+'">'+(speaker==='you'?'YOU':'AI')+'</div><div class="text">'+text+'</div>';
  container.appendChild(div);
  container.scrollTop=container.scrollHeight;
}

async function getAICounter(studentText){
  // Stop recording while AI speaks
  var wasRecording=isRecording;
  if(isRecording){toggleRecording()}

  document.getElementById('aiSpeaking').classList.add('show');

  try{
    var r=await fetch('/api/communication/debate-counter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic:debateTopic,studentArgument:studentText,debateHistory:debateHistory,level:userLevel,turnNumber:debateTurn})});
    var d=await r.json();
    var counter=d.counter||'That\'s an interesting point, but I disagree.';

    document.getElementById('aiSpeakingText').textContent=counter;
    addDebateLine('ai',counter);
    debateHistory.push({role:'ai',content:counter});
    debateTranscript+='AI: '+counter+'\n';

    // Text-to-speech
    speakText(counter,function(){
      document.getElementById('aiSpeaking').classList.remove('show');
      if(d.done){setTimeout(function(){endDebate()},1000)}
      else if(wasRecording){toggleRecording()}
    });
  }catch(err){
    document.getElementById('aiSpeaking').classList.remove('show');
    var fb='That\'s a fair point, but consider the other side.';
    addDebateLine('ai',fb);
    debateHistory.push({role:'ai',content:fb});
    debateTranscript+='AI: '+fb+'\n';
    speakText(fb,function(){if(wasRecording)toggleRecording()});
  }
}

function speakText(text,callback){
  if(!synthesis){if(callback)callback();return}
  synthesis.cancel();
  var utter=new SpeechSynthesisUtterance(text);
  utter.lang='en-US';utter.rate=0.95;utter.pitch=1;
  utter.onend=function(){if(callback)callback()};
  utter.onerror=function(){if(callback)callback()};
  synthesis.speak(utter);
}

async function endDebate(){
  if(debateTimer)clearInterval(debateTimer);
  if(isRecording)toggleRecording();
  clearSilenceTimer();
  if(synthesis)synthesis.cancel();

  // Analyze debate
  try{
    var r=await fetch('/api/communication/analyze-debate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic:debateTopic,transcript:debateTranscript,level:userLevel,silenceEvents:silenceCount,fillerWords:fillerWords})});
    var d=await r.json();
    debateAnalysis=d.analysis;
  }catch(err){debateAnalysis={overall_spoken_grade:'C',summary:'Debate completed.'}}

  generateFinalReport();
}

// FINAL REPORT
async function generateFinalReport(){
  showSection('analyzingSection');
  var bar=document.getElementById('commAnalyzeBar');
  var prog=0;
  var ai=setInterval(function(){prog+=Math.random()*8+2;if(prog>90)prog=90;bar.style.width=prog+'%'},500);

  try{
    var r=await fetch('/api/communication/generate-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chatAnalysis:chatAnalysis,debateAnalysis:debateAnalysis,calibration:calibrationData,typingData:typingData})});
    var d=await r.json();
    clearInterval(ai);bar.style.width='100%';

    // Save to DB
    try{await supabaseClient.from('assessment_responses').insert({user_id:currentUser.id,layer:'communication',response_data:{chatAnalysis:chatAnalysis,debateAnalysis:debateAnalysis,report:d.report,calibration:calibrationData,typingData:typingData,chatHistory:chatHistory,debateTranscript:debateTranscript,fillerWords:fillerWords},created_at:new Date().toISOString()})}catch(err){}

    setTimeout(function(){showReport(d.report)},800);
  }catch(err){
    clearInterval(ai);bar.style.width='100%';
    setTimeout(function(){showReport({overallGrade:'C',writtenGrade:'C',spokenGrade:'C',overallMessage:'Assessment complete.',recommendations:['Keep practicing']})},800);
  }
}

function showReport(rpt){
  showSection('reportSection');
  var g=(rpt.overallGrade||'C').toLowerCase();
  var h='<h2 class="report-title">Communication <span style="color:var(--accent)">Report</span></h2>';
  h+='<div class="report-grade '+g+'">'+(rpt.overallGrade||'C')+'</div>';
  h+='<div class="report-grades" style="animation:fadeUp .6s ease .5s both">';
  h+='<div class="report-grade-card"><div class="label">Written</div><div class="grade" style="color:var(--blue)">'+(rpt.writtenGrade||'C')+'</div></div>';
  h+='<div class="report-grade-card"><div class="label">Spoken</div><div class="grade" style="color:#8b5cf6">'+(rpt.spokenGrade||'C')+'</div></div>';
  if(rpt.typingSpeed)h+='<div class="report-grade-card"><div class="label">Speed</div><div class="grade" style="color:var(--accent);font-size:18px">'+rpt.typingSpeed+'</div></div>';
  h+='</div>';
  if(rpt.overallMessage)h+='<p class="report-msg" style="animation:fadeUp .6s ease .7s both">'+rpt.overallMessage+'</p>';

  // Score bars
  var scores=[
    {name:'Grammar',val:chatAnalysis?chatAnalysis.grammar_score*10:50},
    {name:'Vocabulary',val:chatAnalysis?chatAnalysis.vocabulary_score*10:50},
    {name:'Clarity',val:chatAnalysis?chatAnalysis.clarity_score*10:50},
    {name:'Fluency',val:debateAnalysis?debateAnalysis.fluency_score*10:50},
    {name:'Confidence',val:debateAnalysis?debateAnalysis.confidence_score*10:50},
    {name:'Argument Quality',val:debateAnalysis?debateAnalysis.argument_score*10:50}
  ];
  h+='<div class="report-cats" style="animation:fadeUp .6s ease .9s both">';
  scores.forEach(function(s,i){
    var cls=s.val>=70?'high':s.val>=40?'mid':'low';
    h+='<div class="report-cat"><div class="report-cat-header"><span class="report-cat-name">'+s.name+'</span><span class="report-cat-score">'+Math.round(s.val)+'%</span></div><div class="report-cat-bar"><div class="report-cat-fill '+cls+'" style="--target-w:'+s.val+'%;animation-delay:'+(1+i*0.15)+'s"></div></div></div>';
  });
  h+='</div>';

  // Strengths
  var allStr=(rpt.writtenStrengths||[]).concat(rpt.spokenStrengths||[]);
  if(allStr.length){h+='<div class="report-insights str" style="animation:fadeUp .6s ease 1.5s both"><h4>\ud83d\udcaa Strengths</h4><ul>';allStr.forEach(function(s){h+='<li>'+s+'</li>'});h+='</ul></div>'}

  // Weaknesses
  var allWeak=(rpt.writtenWeaknesses||[]).concat(rpt.spokenWeaknesses||[]);
  if(allWeak.length){h+='<div class="report-insights weak" style="animation:fadeUp .6s ease 1.7s both"><h4>\ud83d\udcc8 Areas to Improve</h4><ul>';allWeak.forEach(function(w){h+='<li>'+w+'</li>'});h+='</ul></div>'}

  // Recommendations
  if(rpt.recommendations&&rpt.recommendations.length){h+='<div class="report-insights rec" style="animation:fadeUp .6s ease 1.9s both"><h4>\ud83d\udca1 Recommendations</h4><ul>';rpt.recommendations.forEach(function(r){h+='<li>'+r+'</li>'});h+='</ul></div>'}

  if(rpt.roadmapNote)h+='<div class="report-next" style="animation:fadeUp .6s ease 2.1s both">'+rpt.roadmapNote+'</div>';

  h+='<button class="btn-main" style="animation:fadeUp .6s ease 2.3s both" onclick="goToDashboard()">Continue to Dashboard \u2192</button>';
  document.getElementById('reportContent').innerHTML=h;
}

function goToDashboard(){window.location.href='/pages/dashboard.html'}

// Chat input enable on focus
document.addEventListener('DOMContentLoaded',function(){
  var inp=document.getElementById('chatInput');
  if(inp){
    inp.addEventListener('input',function(){
      document.getElementById('chatSendBtn').disabled=!inp.value.trim();
      if(!msgStartTime)msgStartTime=Date.now();
    });
    inp.addEventListener('focus',function(){if(!msgStartTime)msgStartTime=Date.now()});
  }
});

// INIT
(async function(){
  var session=await getSession();
  if(!session){window.location.href='/pages/auth.html';return}
  currentUser=session.user;
  userName=currentUser.user_metadata?currentUser.user_metadata.full_name||currentUser.user_metadata.name||'':'';
  var r1=await supabaseClient.from('profiles').select('domain,full_name').eq('id',currentUser.id).single();
  userDomain=r1.data?r1.data.domain:'';
  if(r1.data&&r1.data.full_name)userName=r1.data.full_name;
  if(!userDomain){window.location.href='/pages/academic-profile.html';return}
})();