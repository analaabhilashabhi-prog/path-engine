var currentUser=null,userDomain='',userEdu='',userName='',skills=[],ratings={},currentSkillIdx=0,pledgeChecked=false;
var questions=[],currentQIdx=0,answers={},flagged={},questionTimes={};
var quizTimer=null,qTimer=null,overallTimeLeft=1500,qTimeLeft=0,tabWarnings=0,quizActive=false;
var behaviorLog=[],questionStartTime=0,mouseLeaveCount=0;
var cameraGranted=false,webcamStream=null,faceDetectionInterval=null;
var noFaceCount=0,multiFaceCount=0,noFaceStreak=0,faceWarningGiven=false,faceApiLoaded=false;
var restartCount=0,maxRestarts=2,lockedQuestions={};
var levels=[{value:1,label:'Never heard of it'},{value:2,label:'Heard of it, never used'},{value:3,label:'Know the basics'},{value:4,label:'Comfortable using it'},{value:5,label:'Can teach others'}];

function highlightCode(text){
  return text.replace(/<code>([\s\S]*?)<\/code>/g,function(m,code){
    var h=code
      .replace(/\b(var|let|const|function|return|if|else|for|while|async|await|new|typeof|instanceof|class|import|export|from|try|catch|throw|switch|case|break|default|this|null|undefined|true|false|console|document|window)\b/g,'<span class="kw">$1</span>')
      .replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g,'<span class="str">$&</span>')
      .replace(/\b(\d+\.?\d*)\b/g,'<span class="num">$1</span>')
      .replace(/(\/\/.*)/g,'<span class="cm">$1</span>')
      .replace(/(\.\w+)\s*\(/g,'<span class="fn">$1</span>(');
    return '<div class="code-block">'+h+'</div>';
  });
}

function shuffleOptions(q){
  var opts=q.options.map(function(o,i){return{text:o,wasCorrect:i===q.correct}});
  for(var i=opts.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var tmp=opts[i];opts[i]=opts[j];opts[j]=tmp}
  q.options=opts.map(function(o){return o.text});
  q.correct=opts.findIndex(function(o){return o.wasCorrect});
  return q;
}

function showWatermark(name){
  var el=document.getElementById('watermark');el.innerHTML='';
  var pos=[[10,10],[30,25],[50,40],[70,55],[20,70],[60,15],[80,80],[40,60],[15,45],[65,35]];
  pos.forEach(function(p){var s=document.createElement('div');s.className='watermark-text';s.textContent=name+' \u2022 Path Engine';s.style.left=p[0]+'%';s.style.top=p[1]+'%';el.appendChild(s)});
  el.classList.add('active');
}

function analyzeBehavior(){
  var flags=[],cs=100,fhc=0;
  behaviorLog.filter(function(l){return l.event==='answer_submitted'}).forEach(function(l){
    var q=questions[l.question-1];if(q&&q.difficulty==='hard'){var tt=q.time-l.timeRemaining;if(tt<5){fhc++;flags.push('Hard Q'+l.question+' in '+tt+'s')}}
  });
  if(fhc>=3){cs-=25;flags.push('Multiple hard Qs fast')}
  var pos={};Object.values(answers).forEach(function(a){pos[a]=(pos[a]||0)+1});
  var v=Object.values(pos);if(v.length&&Math.max.apply(null,v)>=15){cs-=20;flags.push('Same position bias')}
  if(tabWarnings>=1){cs-=15*tabWarnings;flags.push(tabWarnings+' tab switches')}
  if(mouseLeaveCount>=5){cs-=10;flags.push('Mouse left '+mouseLeaveCount+'x')}
  var sc2=0;questions.forEach(function(q,i){if(answers[i]===q.correct)sc2++});
  var sp=Math.round((sc2/questions.length)*100);
  var hrs=Object.entries(ratings).filter(function(e){return e[1]>=4}).length;
  if(hrs>=4&&sp<30){cs-=15;flags.push('High self-rate low score')}
  if(noFaceCount>=10){cs-=15;flags.push('No face '+noFaceCount+'x')}
  else if(noFaceCount>=5){cs-=8;flags.push('Face absent '+noFaceCount+'x')}
  if(multiFaceCount>0){cs-=25;flags.push('Multi-face '+multiFaceCount+'x')}
  if(restartCount>0){cs-=15*restartCount;flags.push(restartCount+' restarts')}
  if(!cameraGranted){cs-=20;flags.push('No camera')}
  return{confidenceScore:Math.max(0,Math.min(100,cs)),flags:flags};
}

// SECURITY
document.addEventListener('contextmenu',function(e){e.preventDefault()});
document.addEventListener('keydown',function(e){
  if(e.ctrlKey&&'cvasCVAS'.indexOf(e.key)!==-1)e.preventDefault();
  if(e.key==='F12'){e.preventDefault();e.stopPropagation()}
  if(e.ctrlKey&&e.shiftKey&&'IiJjCc'.indexOf(e.key)!==-1)e.preventDefault();
  if(e.ctrlKey&&(e.key==='u'||e.key==='U'))e.preventDefault();
  if(e.key==='Escape'&&quizActive){e.preventDefault();e.stopPropagation();showToast('Escape is blocked during quiz.','warn');return false}
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&quizActive){e.preventDefault();e.stopImmediatePropagation();return false}},true);
window.addEventListener('offline',function(){document.getElementById('disconnectOverlay').classList.add('show');if(quizTimer)clearInterval(quizTimer);if(qTimer)clearInterval(qTimer)});
window.addEventListener('online',function(){document.getElementById('disconnectOverlay').classList.remove('show');if(quizActive)startOverallTimer(overallTimeLeft)});
document.addEventListener('mouseleave',function(){if(!quizActive)return;mouseLeaveCount++;behaviorLog.push({event:'mouse_leave',question:currentQIdx+1,count:mouseLeaveCount,time:new Date().toISOString()})});

// CAMERA & FACE DETECTION
async function requestCamera(){
  var s=document.getElementById('camStatus');
  try{webcamStream=await navigator.mediaDevices.getUserMedia({video:{width:320,height:240,facingMode:'user'},audio:false});document.getElementById('webcamVideo').srcObject=webcamStream;cameraGranted=true;s.textContent='\u2713 Camera granted. Loading face detection...';s.className='cam-status-text granted';await loadFaceApi();checkStartReady()}
  catch(err){cameraGranted=false;s.textContent='\u2717 Camera denied \u2014 REQUIRED';s.className='cam-status-text denied'}
}
function showWebcam(){if(!cameraGranted)return;document.getElementById('webcamBox').classList.add('active');startFaceDetection()}
function hideWebcam(){document.getElementById('webcamBox').classList.remove('active');stopFaceDetection()}
async function loadFaceApi(){
  var s=document.getElementById('camStatus');
  try{await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights');faceApiLoaded=true;s.textContent='\u2713 Face detection loaded.';s.className='cam-status-text granted'}
  catch(err){s.textContent='\u2713 Camera ready (basic mode)';s.className='cam-status-text granted'}
}
function startFaceDetection(){
  var video=document.getElementById('webcamVideo');
  faceDetectionInterval=setInterval(async function(){
    if(!quizActive)return;var sEl=document.getElementById('webcamStatus');
    if(faceApiLoaded){
      try{var det=await faceapi.detectAllFaces(video,new faceapi.TinyFaceDetectorOptions({scoreThreshold:0.4}));var fc=det.length;
        if(fc===1){noFaceStreak=0;faceWarningGiven=false;sEl.textContent='Face detected';sEl.className='webcam-status ok'}
        else if(fc===0){noFaceStreak++;noFaceCount++;behaviorLog.push({event:'no_face',question:currentQIdx+1,streak:noFaceStreak,time:new Date().toISOString()});
          if(noFaceStreak>=3&&!faceWarningGiven){faceWarningGiven=true;sEl.textContent='WARNING!';sEl.className='webcam-status danger';showToast('\u26a0 Face not detected!','danger')}
          else if(noFaceStreak>=6&&faceWarningGiven){handleProctorViolation('Face not detected too long')}
          else{sEl.textContent='No face!';sEl.className='webcam-status danger'}}
        else if(fc>=2){multiFaceCount++;behaviorLog.push({event:'multiple_faces',question:currentQIdx+1,count:fc,time:new Date().toISOString()});sEl.textContent='MULTIPLE FACES!';sEl.className='webcam-status danger';handleProctorViolation('Multiple faces ('+fc+') - ZERO TOLERANCE')}
      }catch(err){}
    }else{
      var canvas=document.getElementById('faceCanvas');var ctx=canvas.getContext('2d');canvas.width=320;canvas.height=240;ctx.drawImage(video,0,0,320,240);var id=ctx.getImageData(80,40,160,160);var px=id.data;var bp2=0;var tp=px.length/4;
      for(var i=0;i<px.length;i+=4){if((px[i]+px[i+1]+px[i+2])/3>60)bp2++}
      if(bp2/tp>0.15){noFaceStreak=0;faceWarningGiven=false;sEl.textContent='Face detected';sEl.className='webcam-status ok'}
      else{noFaceStreak++;noFaceCount++;if(noFaceStreak>=3&&!faceWarningGiven){faceWarningGiven=true;showToast('\u26a0 Stay in front of camera!','danger')}else if(noFaceStreak>=6&&faceWarningGiven){handleProctorViolation('Face not detected')}sEl.textContent='No face!';sEl.className='webcam-status danger'}
    }
  },2000);
}
function handleProctorViolation(reason){
  restartCount++;behaviorLog.push({event:'proctor_violation',reason:reason,restartCount:restartCount,time:new Date().toISOString()});
  if(restartCount>maxRestarts){showToast('Max violations. Auto-submitted.','danger');autoSubmitQuiz();return}
  quizActive=false;if(quizTimer)clearInterval(quizTimer);if(qTimer)clearInterval(qTimer);stopFaceDetection();
  showSection('restartSection');document.getElementById('restartReason').textContent=reason;document.getElementById('restartNum').textContent=restartCount;document.getElementById('restartMax').textContent=maxRestarts;
}
async function restartQuizWithNewQuestions(){showSection('quizLoadingSection');questions=[];currentQIdx=0;answers={};flagged={};lockedQuestions={};questionTimes={};noFaceStreak=0;faceWarningGiven=false;overallTimeLeft=1500;await generateQuiz()}
function stopFaceDetection(){if(faceDetectionInterval){clearInterval(faceDetectionInterval);faceDetectionInterval=null}}
function stopWebcam(){hideWebcam();if(webcamStream){webcamStream.getTracks().forEach(function(t){t.stop()});webcamStream=null}}
function checkStartReady(){document.getElementById('btnStart').disabled=!(pledgeChecked&&cameraGranted)}

// TAB & FULLSCREEN
document.addEventListener('visibilitychange',function(){if(!quizActive||!document.hidden)return;tabWarnings++;behaviorLog.push({event:'tab_switch',question:currentQIdx+1,time:new Date().toISOString()});if(tabWarnings>=2){autoSubmitQuiz();return}document.getElementById('warningMsg').textContent='Tab switch! Warning '+tabWarnings+'/2.';document.getElementById('warningOverlay').classList.add('show')});
document.addEventListener('fullscreenchange',function(){if(!quizActive||document.fullscreenElement)return;tabWarnings++;behaviorLog.push({event:'fullscreen_exit',question:currentQIdx+1,time:new Date().toISOString()});if(tabWarnings>=2){autoSubmitQuiz();return}document.getElementById('warningMsg').textContent='Fullscreen exited! Warning '+tabWarnings+'/2.';document.getElementById('warningOverlay').classList.add('show')});
function dismissWarning(){document.getElementById('warningOverlay').classList.remove('show');try{document.documentElement.requestFullscreen()}catch(e){}}

// UTILS
function showToast(msg,type){var t=document.getElementById('toast');t.textContent=msg;t.className='toast '+type+' show';setTimeout(function(){t.classList.remove('show')},3000)}
function showSection(id){document.querySelectorAll('.section').forEach(function(s){s.classList.remove('show')});document.getElementById(id).classList.add('show')}
function formatTime(s){var m=Math.floor(s/60);var sec=s%60;return m+':'+(sec<10?'0':'')+sec}

// LOBBY
function animateLobby(){document.querySelectorAll('.rule-item').forEach(function(r){setTimeout(function(){r.classList.add('show')},parseInt(r.getAttribute('data-delay')))});setTimeout(function(){document.getElementById('lobbyLayers').classList.add('show')},1600);setTimeout(function(){document.getElementById('lobbyTime').classList.add('show')},1900);setTimeout(function(){document.getElementById('camRequest').classList.add('show')},2200);setTimeout(function(){document.getElementById('pledgeBox').classList.add('show')},2600);setTimeout(function(){document.getElementById('btnStart').classList.add('show')},3000)}
function togglePledge(){pledgeChecked=!pledgeChecked;document.getElementById('pledgeBox').classList.toggle('checked',pledgeChecked);checkStartReady()}
async function startAssessment(){showSection('layer1Section');await generateSkills()}

// LAYER 1
async function generateSkills(){document.getElementById('loadingSkills').style.display='block';try{var r=await fetch('/api/generate-skills',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({domain:userDomain,education:userEdu})});var d=await r.json();skills=d.skills&&d.skills.length>0?d.skills:getFB()}catch(err){skills=getFB()}document.getElementById('l1Total').textContent=skills.length;showSkill(0);function getFB(){return['Problem Solving','Critical Thinking','Technical Writing','Research','Communication','Project Management']}}
function showSkill(idx){
  currentSkillIdx=idx;var area=document.getElementById('skillArea');var lEl=document.getElementById('loadingSkills');if(lEl)lEl.style.display='none';
  var sn=skills[idx],er=ratings[sn]||0;document.getElementById('l1BarFill').style.width=Math.round(idx/skills.length*100)+'%';document.getElementById('l1Current').textContent=idx+1;
  var h='<div class="skill-card"><p class="skill-label">Skill '+(idx+1)+' of '+skills.length+'</p><h2 class="skill-name">'+sn+'</h2><div class="level-options">';
  levels.forEach(function(l){h+='<div class="level-option'+(er===l.value?' selected':'')+'" onclick="selectLevel('+l.value+',this)"><div class="level-dot"></div><div class="level-text">'+l.label+'</div></div>'});
  h+='</div><div class="l1-nav"><button class="btn-prev" onclick="prevSkill()"'+(idx===0?' disabled':'')+'>← Back</button>';
  h+=idx===skills.length-1?'<button class="btn-next" id="btnNext" onclick="finishLayer1()"'+(er?'':' disabled')+'>Complete →</button>':'<button class="btn-next" id="btnNext" onclick="nextSkill()"'+(er?'':' disabled')+'>Next →</button>';
  h+='</div></div>';area.innerHTML=h;
}
function selectLevel(val,el){ratings[skills[currentSkillIdx]]=val;document.querySelectorAll('.level-option').forEach(function(o){o.classList.remove('selected')});el.classList.add('selected');document.getElementById('btnNext').disabled=false}
function nextSkill(){if(currentSkillIdx<skills.length-1)showSkill(currentSkillIdx+1)}
function prevSkill(){if(currentSkillIdx>0)showSkill(currentSkillIdx-1)}
async function finishLayer1(){var ok=true;skills.forEach(function(s){if(!ratings[s])ok=false});if(!ok){showToast('Rate all skills first.','warn');return}var btn=document.getElementById('btnNext');btn.disabled=true;btn.textContent='Saving...';try{await supabaseClient.from('assessment_responses').insert({user_id:currentUser.id,layer:'self_evaluation',response_data:ratings,created_at:new Date().toISOString()})}catch(err){}document.getElementById('l1BarFill').style.width='100%';showSection('transitionSection')}

// QUIZ
async function enterFullscreenAndStartQuiz(){try{await document.documentElement.requestFullscreen()}catch(e){}showWatermark(userName||currentUser.email);showSection('quizLoadingSection');await generateQuiz()}
async function generateQuiz(){
  try{var r=await fetch('/api/generate-quiz',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({domain:userDomain,education:userEdu,selfRatings:ratings})});var d=await r.json();
    if(d.questions&&d.questions.length>0)questions=d.questions.map(shuffleOptions);else{showToast('Quiz generation failed.','danger');return}
  }catch(err){showToast('Error generating quiz.','danger');return}
  document.getElementById('qTotal').textContent=questions.length;currentQIdx=0;answers={};flagged={};lockedQuestions={};questionTimes={};quizActive=true;
  showWebcam();showSection('quizSection');startOverallTimer(overallTimeLeft);showQuestion(0);
}
function showQuestion(idx){
  currentQIdx=idx;var q=questions[idx],area=document.getElementById('quizArea'),isL=lockedQuestions[idx],sa=answers[idx],iF=flagged[idx],lb=['A','B','C','D'];
  document.getElementById('qNum').textContent=idx+1;document.getElementById('quizBarFill').style.width=Math.round(idx/questions.length*100)+'%';
  var h='<div class="quiz-card"><div class="quiz-flag-row"><span class="quiz-diff '+q.difficulty+'">'+q.difficulty+'</span>';
  if(!isL)h+='<button class="flag-btn'+(iF?' flagged':'')+'" id="flagBtn" onclick="toggleFlag('+idx+')">\u2691 '+(iF?'Flagged':'Flag')+'</button>';
  h+='</div><p class="quiz-question">'+highlightCode(q.question)+'</p><div class="quiz-options">';
  for(var i=0;i<q.options.length;i++)h+='<div class="quiz-option'+(sa===i?' selected':'')+(isL?' locked':'')+'" onclick="'+(isL?'':'selectQuizOption('+i+',this)')+'"><div class="quiz-option-label">'+lb[i]+'</div><span>'+q.options[i]+'</span></div>';
  h+='</div>';
  if(!isL)h+='<button class="quiz-submit" id="quizSubmitBtn" '+(sa!==undefined?'':'disabled')+' onclick="submitAnswer()">'+(idx===questions.length-1?'Go to Review \u2192':'Submit & Next \u2192')+'</button>';
  else h+='<button class="quiz-submit" onclick="showReviewScreen()">\u2190 Back to Review</button>';
  h+='</div>';area.innerHTML=h;
  behaviorLog.push({event:'question_shown',question:idx+1,time:new Date().toISOString()});questionStartTime=Date.now();
  if(!isL)startQuestionTimer(q.time||45);else{var qt=document.getElementById('qTimer');if(qt)qt.style.display='none'}
}
function toggleFlag(idx){flagged[idx]=!flagged[idx];var b=document.getElementById('flagBtn');if(b){b.className='flag-btn'+(flagged[idx]?' flagged':'');b.innerHTML='\u2691 '+(flagged[idx]?'Flagged':'Flag')}}
function selectQuizOption(idx,el){if(lockedQuestions[currentQIdx])return;answers[currentQIdx]=idx;document.querySelectorAll('.quiz-option').forEach(function(o){o.classList.remove('selected')});el.classList.add('selected');var b=document.getElementById('quizSubmitBtn');if(b)b.disabled=false}
function startOverallTimer(s){if(quizTimer)clearInterval(quizTimer);overallTimeLeft=s;var tEl=document.getElementById('timerCount'),tB=document.getElementById('quizTimer');tEl.textContent=formatTime(overallTimeLeft);quizTimer=setInterval(function(){overallTimeLeft--;tEl.textContent=formatTime(overallTimeLeft);if(overallTimeLeft<=300)tB.classList.add('urgent');if(overallTimeLeft<=0){clearInterval(quizTimer);autoSubmitQuiz()}},1000)}
function startQuestionTimer(s){if(qTimer)clearInterval(qTimer);qTimeLeft=s;var tEl=document.getElementById('qTimerCount'),tB=document.getElementById('qTimer');tB.style.display='';tEl.textContent=qTimeLeft;tB.classList.remove('urgent');qTimer=setInterval(function(){qTimeLeft--;tEl.textContent=qTimeLeft;if(qTimeLeft<=10)tB.classList.add('urgent');if(qTimeLeft<=0){clearInterval(qTimer);submitAnswer()}},1000)}
function submitAnswer(){
  if(qTimer)clearInterval(qTimer);var ts=Math.round((Date.now()-questionStartTime)/1000);questionTimes[currentQIdx]=ts;questions[currentQIdx].timeSpent=ts;
  behaviorLog.push({event:'answer_submitted',question:currentQIdx+1,selected:answers[currentQIdx]!==undefined?answers[currentQIdx]:-1,correct:questions[currentQIdx].correct,timeRemaining:qTimeLeft,timeSpent:ts,time:new Date().toISOString()});
  lockedQuestions[currentQIdx]=true;
  if(currentQIdx<questions.length-1){var card=document.querySelector('.quiz-card');if(card){card.classList.add('exiting');setTimeout(function(){showQuestion(currentQIdx+1)},300)}else showQuestion(currentQIdx+1)}
  else showReviewScreen();
}

// REVIEW
function showReviewScreen(){if(qTimer)clearInterval(qTimer);showSection('reviewSection');var grid=document.getElementById('reviewGrid'),list=document.getElementById('reviewList'),gh='',lh='';
  for(var i=0;i<questions.length;i++){var ha=answers[i]!==undefined,iF=flagged[i]&&!lockedQuestions[i],iU=!ha&&!lockedQuestions[i],cls=iF?'flagged':iU?'unanswered':'answered',cc=iF||iU;
    gh+='<div class="review-cell '+cls+'" '+(cc?'onclick="reviewGoTo('+i+')"':'')+'>'+(i+1)+'</div>';
    var st=iF?'Flagged':iU?'Unanswered':'Answered',sc2=iF?'flagged-s':iU?'unanswered-s':'answered-s';
    lh+='<div class="review-list-item" '+(cc?'onclick="reviewGoTo('+i+')"':'')+'><span class="rnum">'+(i+1)+'</span><span class="rq">'+questions[i].question.replace(/<code>[\s\S]*?<\/code>/g,'[code]').substring(0,55)+'</span><span class="rstatus '+sc2+'">'+st+'</span></div>'}
  grid.innerHTML=gh;list.innerHTML=lh}
function reviewGoTo(idx){if(lockedQuestions[idx]&&!flagged[idx])return;showSection('quizSection');showQuestion(idx)}
async function submitFromReview(){await finishQuiz()}

// FINISH
async function finishQuiz(){
  quizActive=false;if(quizTimer)clearInterval(quizTimer);if(qTimer)clearInterval(qTimer);stopWebcam();document.getElementById('watermark').classList.remove('active');try{if(document.fullscreenElement)document.exitFullscreen()}catch(e){}
  var score=0;questions.forEach(function(q,i){if(answers[i]===q.correct)score++});var analysis=analyzeBehavior();
  try{await supabaseClient.from('assessment_responses').insert({user_id:currentUser.id,layer:'skill_quiz',response_data:{answers:answers,score:score,total:questions.length,tabWarnings:tabWarnings,mouseLeaves:mouseLeaveCount,noFaceEvents:noFaceCount,multiFaceEvents:multiFaceCount,restartCount:restartCount,confidenceScore:analysis.confidenceScore,flags:analysis.flags,questionTimes:questionTimes,behaviorLog:behaviorLog},created_at:new Date().toISOString()})}catch(err){}
  showSection('analyzingSection');var bar=document.getElementById('analyzeBarFill'),prog=0;
  var ai=setInterval(function(){prog+=Math.random()*8+2;if(prog>90)prog=90;bar.style.width=prog+'%'},500);
  try{var r=await fetch('/api/analyze-score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({domain:userDomain,questions:questions,answers:answers,score:score,total:questions.length,ratings:ratings,behaviorData:analysis})});var d=await r.json();clearInterval(ai);bar.style.width='100%';setTimeout(function(){showScoreBreakdown(d.analysis,score,questions.length)},800)}
  catch(err){clearInterval(ai);bar.style.width='100%';var pct=Math.round(score/questions.length*100);setTimeout(function(){showScoreBreakdown({overallGrade:pct>=90?'A':pct>=75?'B':pct>=60?'C':pct>=40?'D':'F',overallMessage:'You scored '+score+'/'+questions.length+'.',strengths:[],weaknesses:[],categories:[],nextSteps:'AI roadmap will be generated.'},score,questions.length)},800)}
}

// PARTICLES & SCORE
function createParticles(){var c=document.getElementById('particleContainer');c.innerHTML='';var cols=['#10b981','#34d399','#3b82f6','#60a5fa','#f59e0b','#fbbf24','#ef4444','#fff'];for(var i=0;i<60;i++){var p=document.createElement('div');p.className='particle';var a=Math.random()*Math.PI*2,dist=100+Math.random()*300;p.style.cssText='left:50%;top:40%;background:'+cols[Math.floor(Math.random()*cols.length)]+';--tx:'+Math.cos(a)*dist+'px;--ty:'+(Math.sin(a)*dist-200)+'px;animation-duration:'+(1+Math.random())+'s;animation-delay:'+(Math.random()*0.3)+'s;width:'+(4+Math.random()*6)+'px;height:'+(4+Math.random()*6)+'px';c.appendChild(p)}setTimeout(function(){c.innerHTML=''},3000)}
function showScoreBreakdown(a,score,total){
  createParticles();showSection('scoreSection');var pct=Math.round(score/total*100),g=(a.overallGrade||'C').toLowerCase();
  var h='<h2 style="font-family:var(--font-display);font-size:20px;font-weight:700;margin-bottom:4px;animation:fadeUp .6s ease both">Quiz <span style="color:var(--accent)">Complete!</span></h2>';
  h+='<div class="score-grade '+g+'">'+(a.overallGrade||'C')+'</div>';
  h+='<p class="score-pct" style="animation:fadeUp .6s ease .5s both">'+score+'/'+total+' correct ('+pct+'%)</p>';
  h+='<p class="score-msg" style="animation:fadeUp .6s ease .7s both">'+(a.overallMessage||'')+'</p>';
  if(a.categories&&a.categories.length){h+='<div class="score-cats" style="animation:fadeUp .6s ease .9s both">';a.categories.forEach(function(c,i){var vc=(c.verdict||'moderate').toLowerCase();h+='<div class="score-cat"><div class="score-cat-header"><span class="score-cat-name">'+c.name+'</span><span class="score-cat-val">'+c.score+' <span class="score-verdict '+vc+'">'+c.verdict+'</span></span></div><div class="score-cat-bar"><div class="score-cat-fill '+vc+'" style="--target-w:'+c.percentage+'%;animation-delay:'+(1+i*0.15)+'s"></div></div>'+(c.tip?'<p class="score-cat-tip">'+c.tip+'</p>':'')+'</div>'});h+='</div>'}
  if(a.strengths&&a.strengths.length){h+='<div class="score-insights strengths" style="animation:fadeUp .6s ease 1.5s both"><h4>\ud83d\udcaa Strengths</h4><ul>';a.strengths.forEach(function(s){h+='<li>'+s+'</li>'});h+='</ul></div>'}
  if(a.weaknesses&&a.weaknesses.length){h+='<div class="score-insights weaknesses" style="animation:fadeUp .6s ease 1.7s both"><h4>\ud83d\udcc8 Areas to improve</h4><ul>';a.weaknesses.forEach(function(w){h+='<li>'+w+'</li>'});h+='</ul></div>'}
  if(a.nextSteps)h+='<div class="score-next" style="animation:fadeUp .6s ease 1.9s both">'+a.nextSteps+'</div>';
  h+='<button class="btn-main" style="animation:fadeUp .6s ease 2.1s both" onclick="goToLayer3()">Continue to Goals \u2192</button>';
  document.getElementById('scoreContent').innerHTML=h;
}
async function autoSubmitQuiz(){showToast('Quiz auto-submitted.','danger');await finishQuiz()}
function goToLayer3(){showToast('Goals & Preferences coming soon!','success')}

// INIT
(async function(){
  var session=await getSession();if(!session){window.location.href='/pages/auth.html';return}
  currentUser=session.user;userName=currentUser.user_metadata?currentUser.user_metadata.full_name||currentUser.user_metadata.name||'':'';
  var r1=await supabaseClient.from('profiles').select('domain,full_name').eq('id',currentUser.id).single();
  userDomain=r1.data?r1.data.domain:'';if(r1.data&&r1.data.full_name)userName=r1.data.full_name;
  var r2=await supabaseClient.from('academic_profiles').select('education_level').eq('user_id',currentUser.id).single();
  userEdu=r2.data?r2.data.education_level:'';
  if(!userDomain){window.location.href='/pages/academic-profile.html';return}
  animateLobby();
})();