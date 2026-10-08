'use strict';
// ===================================================================
//  HUNT ENGINE 6a — content, state machine, director, scene, jar, scanner, audio, HUD, persistence, dev
//  Design: one clock (the frame loop + audio clock), no setTimeout choreography.
// ===================================================================

// ---------- content package (hunt.json inline for the artifact) ----------
const HUNT={id:'haunted-block-2026',title:'The Block Is Haunted',
 stations:[
  {n:1,code:'hb1',scene:'assets/scenes/01-hotdog.jpg',name:'Entry Hot Dog Stand',ghost:'mustard',accent:'#e4c33a',prop:'hotdog',color:'#2b2230',
   clue:"He steals first bites where the hot dogs steam —\nRight where you walked in. Go make him scream.",
   capture:"GOTCHA! Into the jar, mustard-breath! …He brought a hot dog in with him. Fine."},
  {n:2,code:'hb2',scene:'assets/scenes/02-stairs.jpg',name:'Eatery by the Stairs',ghost:'snacker',accent:'#d84a3a',prop:'fork',color:'#24262f',
   clue:"At the bottom of the stairs, where the hungry go to eat —\nDon't climb, that's the bar. Careful — she bites feet.",
   capture:"Caught her at the bottom of the stairs, mid-snack! In you go. Watch the feet, everyone."},
  {n:3,code:'hb3',scene:'assets/scenes/03-collective.jpg',name:'The Block Collective',ghost:'browser',accent:'#3fb8b0',prop:'tag',color:'#2a2a24',
   clue:"Fifteen shops, one roof, and one ghost with a plan —\nShe's tidying the shelves. Catch her if you can.",
   capture:"The Browser! Fifteen shops will finally stay TIDY. Into the jar, shopaholic."},
  {n:4,code:'hb4',scene:'assets/scenes/04-bookstore.jpg',name:'Bookstore',ghost:'reader',accent:'#e6dcc4',prop:'book',color:'#2c2420',
   clue:"She shushes the shoppers and reads all night through —\nSlip between the bookshelves. She's waiting for you.",
   capture:"SHHH yourself! The Reader, captured — she's still holding the book. Let her."},
  {n:5,code:'hb5',scene:'assets/scenes/05-hive.jpg',name:'Hive & Honey',ghost:'nibbler',accent:'#e0a526',prop:'cheese',color:'#2e2618',
   clue:"Sweet as honey, sharp as cheese —\nHe's nibbling the charcuterie. Get him, please.",
   capture:"Got the Nibbler! …There's cheese in my jar now. Worth it. Moving on!"},
  {n:6,code:'hb6',scene:'assets/scenes/06-grass.jpg',name:'The Grass',ghost:'groundskeeper',accent:'#6fbf4a',prop:'mower',color:'#1e2a1c',
   clue:"He mows at midnight, though nothing needs mowing —\nStand out on the grass and you'll catch him going.",
   capture:"Snagged him mid-mow! The grass will survive without you. NEXT."},
  {n:7,code:'hb7',scene:'assets/scenes/07-stage_1.jpg',name:'Main Stage',ghost:'diva',accent:'#a86bd8',prop:'mic',color:'#1c1826',
   clue:"You'll hear her before you see her — that wail's no mistake.\nShe's been singing since 1987. Get to the stage, for pity's sake.",
   capture:"One FINAL encore — from inside the jar! Beautiful. Tragic. CAUGHT."},
  {n:8,code:'hb8',scene:'assets/scenes/08-office.jpg',name:'The Office',ghost:'boss',accent:'#4a6fd8',prop:'clipboard',color:'#1f2230',
   clue:"The last one's the BOSS — she thinks she runs this place.\nMarch into the office and meet her face to face.",
   capture:"THE BOSS HERSELF! That's all EIGHT — oh, this jar is positively RATTLING…"}],
 opening:"Agatha Bramble, keeper of The Block's ghosts — at your service. And PERFECT timing. Some FOOL left my ghost jar open, and now eight spirits are loose all over The Block. The party can't start till they're back in this jar — and my knees are three hundred years old, so YOU'RE doing the walking. Find where each ghost hides, scan my magic circle, and I'll do the rest. First ghost — listen up.",
 chatter:["Any day now…","My knees were young once. Three hundred years ago.","I can smell that ghost from here. Smells like trouble.","Don't dawdle — ghosts get BORED, and bored ghosts get ideas.","If you see my cat, tell him I'm NOT speaking to him.","Keep walking. The jar's not going to fill itself.","Ooh, I felt a shiver. Either a ghost… or a draft.","Heh heh heh. You're doing better than the last lot.","Lost? Tap my nose. It won't help, but it's funny.","Psst — read the clue again. I put a hint in it. Probably."],
 wrong:["Wrong circle, clever-clogs. LISTEN to the rhyme.","Nope. Do I look like I have all night? …Don't answer that.","Not it — even the ghosts are shaking their heads. Try again!"],
 final:"EIGHT ghosts! You actually did it. And now — OUT you go, you rowdy lot, the party's starting and you're invited THIS time! As for you, ghost-hunter — you're standing right where your reward lives. Show this screen to the humans in the office, and they'll hand you a little of my potion's glow. Wear it. Keeps the ghosts off you till morning. Happy Halloween from The Block… heh heh heh… HEH HEH HEH!"};
const CUES=CUE_DRAFTS; // from the engine core (assets/cues drafts); t may be null → fired by text position

// ---------- clock ----------
let now=0; const waiters=[];
function waitSec(s){return new Promise(r=>waiters.push({at:now+s,r}));}
function tickWaiters(){for(let i=waiters.length-1;i>=0;i--)if(now>=waiters[i].at){waiters[i].r();waiters.splice(i,1);}}

// ---------- persistence ----------
const SAVE='hb2026';
function load(){try{return JSON.parse(localStorage.getItem(SAVE)||'null');}catch(e){return null;}}
function save(o){try{localStorage.setItem(SAVE,JSON.stringify(o));}catch(e){}}
function clearSave(){try{localStorage.removeItem(SAVE);}catch(e){}}

// ---------- hunt state ----------
const hunt={state:'BOOT',step:0,captured:0,wrongIdx:0,done:false,busy:false,log:[]};let artError=null;
function hlog(s){hunt.log.push(s);if(hunt.log.length>12)hunt.log.shift();}

// ---------- audio (voice via Web Audio when a clip exists; synthetic fallback) ----------
let ACTX=null,music=null,finaleAudio=null,finaleTarget=0;
// music: both tracks play through Web Audio (sample-accurate, gapless looping; <audio loop> leaves a click/gap at the mp3 seam).
// The background loop ducks under narration; the finale track fades in when the ghosts are released and the loop fades out.
function musicTrack(name,vol0){const t={gain:null,buf:null,src:null,vol:vol0,target:vol0,on:false};loadClip(name).then(buf=>{if(!buf||t.on)return;t.buf=buf;t.gain=ACTX.createGain();t.gain.gain.value=t.vol;t.gain.connect(ACTX.destination);const s=ACTX.createBufferSource();s.buffer=buf;s.loop=true;s.connect(t.gain);s.start();t.src=s;t.on=true;});return t;}
function startFinaleMusic(){if(finaleAudio||!ACTX)return;finaleAudio=musicTrack('finale',0);finaleAudio.target=0.55;hunt.finaleMusic=true;}
function audioMix(dt){const k=Math.min(1,dt*2.5),cl=v=>Math.max(0,Math.min(1,v));
 if(music){music.target=hunt.finaleMusic?0:(anim.speech?0.15:0.35);music.vol=cl(music.vol+(music.target-music.vol)*k);if(music.gain)music.gain.gain.value=music.vol;}
 if(finaleAudio){finaleAudio.vol=cl(finaleAudio.vol+(finaleAudio.target-finaleAudio.vol)*k);if(finaleAudio.gain)finaleAudio.gain.gain.value=finaleAudio.vol;}}
function audioUnlock(){if(!ACTX){try{ACTX=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}}if(ACTX&&ACTX.state==='suspended')ACTX.resume();
 if(!music&&ACTX)music=musicTrack('bg_loop',0.35);}
const clipCache={};
async function loadClip(name){if(clipCache[name]!==undefined)return clipCache[name];let buf=null;try{const r=await fetch('assets/audio/'+name+'.mp3');if(r.ok&&ACTX)buf=await ACTX.decodeAudioData(await r.arrayBuffer());}catch(e){}clipCache[name]=buf;return buf;}
// say(): returns when the line ends. Fires cue track; t null → position in text.
async function say(name,text,opts={}){chatterReset();const cue=CUES[name]||{mood:opts.mood||'neutral',cues:[]};anim.setMood(opts.mood||cue.mood||'neutral');
 captionShow(text);const buf=await loadClip(name);let dur,clock;
 if(buf){const src=ACTX.createBufferSource();src.buffer=buf;src.connect(ACTX.destination);const t0=ACTX.currentTime;src.start();dur=buf.duration;clock=()=>ACTX.currentTime-t0-(ACTX.outputLatency||ACTX.baseLatency||0);
  anim.speech={env:envFromBuffer(buf),dur,t:0,style:null,lastTick:-1,shape:null,prevOpen:null,emph:0,lastPeak:-1,pv:0,clock,res:()=>{},fired:new Set()};}
 else{dur=Math.max(2,text.length*0.058);const p=anim.say(dur,null);clock=()=>anim.speech?anim.speech.t:dur;}
 const fired=new Set();const total=text.length;
 const timed=cue.cues.map(c=>({...c,at_t:c.t!=null?c.t:(Math.max(0,text.indexOf(c.at))/total)*dur}));
 while(clock()<dur&&anim.speech){const t=clock();captionTick(t/dur);timed.forEach((c,i)=>{if(!fired.has(i)&&t>=c.at_t){fired.add(i);applyCue(c);}});await waitSec(0.05);}
 anim.stopSpeaking();return;}
function applyCue(c){const [k,a]=(c.do||'').split(':');if(k==='mood')anim.setMood(a);else if(k==='play')anim.play(a);else if(k==='look')anim.lookAt(a==='scanner'?'down':a);else if(k==='hunt'){if(a==='capture')jarCapture();if(a==='release')jarRelease();}else if(k==='sfx'&&a==='jar_rattle')jar.rattle=1.2;}

// ---------- HUD ----------
const $=id=>document.getElementById(id);
let capChunks=null,capHidden=false;
function chunkText(t){const MAX=76;const sentences=t.replace(/\s+/g,' ').trim().match(/[^.!?…]+[.!?…]+["')\]]*(\s|$)|[^.!?…]+$/g)||[t];
 const split=x=>{x=x.trim();if(x.length<=MAX)return [x];const mid=x.length/2;let best=-1,bd=1e9;const re=/(— |, |; |: | and | so | but )/g;let m;while((m=re.exec(x))){const at=m.index+m[0].length-(m[0].endsWith(' ')&&m[0].length>1?0:0);const d=Math.abs(at-mid);if(at>12&&at<x.length-12&&d<bd){bd=d;best=at;}}
  if(best<0){for(let k=0;k<x.length;k++){if(x[k]===' '){const d=Math.abs(k-mid);if(d<bd){bd=d;best=k+1;}}}}
  if(best<0)return [x];return split(x.slice(0,best)).concat(split(x.slice(best)));};
 const pieces=[];sentences.forEach(sn=>split(sn).forEach(x=>pieces.push(x)));
 const out=[];let cur='';for(const p of pieces){if(cur&&(cur+' '+p).length>MAX){out.push(cur);cur=p;}else cur=cur?cur+' '+p:p;}if(cur)out.push(cur);return out;}
function captionShow(t){capChunks=chunkText(t);const total=capChunks.reduce((a,c)=>a+c.length,0);let acc=0;capChunks=capChunks.map(c=>{const start=acc/total;acc+=c.length;return {text:c,start};});captionSet(0);if(!capHidden)$('caption').classList.add('show');}
function captionSet(i){$('captext').textContent=capChunks[i].text;$('caption').dataset.i=i;$('capwho').textContent='🧪 Agatha Bramble'+(capChunks.length>1?'  ·  '+(i+1)+' / '+capChunks.length:'');}
function captionTick(progress){if(!capChunks||capChunks.length<2)return;let i=0;for(let k=0;k<capChunks.length;k++)if(progress>=capChunks[k].start)i=k;if(String(i)!==$('caption').dataset.i)captionSet(i);}
$('caption').addEventListener('click',e=>{if(e.target.id==='replay')return;capHidden=!capHidden;$('caption').classList.toggle('show',!capHidden);});
function stationLabel(){const s=HUNT.stations[hunt.step];$('station').textContent=s?('Station '+s.n+' · '+s.name):'';}

// ---------- scene (flat colour + living layers; photos come in 6b) ----------
const fog=[],flies=[];for(let i=0;i<6;i++)fog.push({x:Math.random(),y:0.5+Math.random()*0.4,w:0.5+Math.random()*0.5,v:(0.01+Math.random()*0.02)*(i%2?1:-1),a:0.05+Math.random()*0.05});
for(let i=0;i<14;i++)flies.push({x:Math.random(),y:0.2+Math.random()*0.5,p:Math.random()*TAU,s:0.6+Math.random()*0.8});
let sceneCol='#2b2230',sceneTarget='#2b2230',sceneMix=1;
// photo scenes: graded stills (assets/scenes), cover-fit anchored a little above centre so the landmark stays in the upper two-thirds,
// slow breathing zoom, 0.8 s crossfade between stations, next station's photo preloaded while you walk.
const SCENES={};function sceneLoad(url){if(!url)return null;if(!SCENES[url]){const im=new Image();im.decoding='async';im.src=url;SCENES[url]={im,ok:false};im.onload=()=>{SCENES[url].ok=true;};}return SCENES[url];}
let sceneCur=null,scenePrev=null,sceneFade=1,sceneT=0;
function sceneSet(url){if(url===sceneCur)return;scenePrev=sceneCur;sceneCur=url;sceneFade=0;sceneLoad(url);}
function scenePreload(i){const s=HUNT.stations[i];if(s&&s.scene)sceneLoad(s.scene);}
function drawPhoto(ctx,W,H,url,alpha,t){const S=url&&SCENES[url];if(!S||!S.ok)return false;const im=S.im,z=1.03+0.03*Math.sin(t*0.12),sc=Math.max(W/im.width,H/im.height)*z,w=im.width*sc,hh=im.height*sc;
 ctx.globalAlpha=alpha;ctx.drawImage(im,(W-w)/2+Math.sin(t*0.07)*W*0.01,(H-hh)*0.35,w,hh);ctx.globalAlpha=1;return true;}
function drawScene(ctx,W,H,dt){sceneT+=dt;ctx.fillStyle=sceneCol;ctx.fillRect(0,0,W,H);
 if(sceneFade<1)sceneFade=Math.min(1,sceneFade+dt/0.8);
 if(scenePrev&&sceneFade<1)drawPhoto(ctx,W,H,scenePrev,1,sceneT);
 if(sceneCur)drawPhoto(ctx,W,H,sceneCur,sceneFade<1?easeIO(sceneFade):1,sceneT);
 const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'rgba(0,0,0,0.35)');g.addColorStop(0.55,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,0.5)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
 const gy=H*0.74;ctx.fillStyle='rgba(0,0,0,0.25)';ctx.fillRect(0,gy,W,H-gy);
 for(const f of fog){f.x+=f.v*dt;if(f.x>1.3)f.x=-0.3;if(f.x<-0.3)f.x=1.3;const r=ctx.createRadialGradient(f.x*W,f.y*H,0,f.x*W,f.y*H,f.w*W*0.5);r.addColorStop(0,'rgba(200,210,200,'+f.a+')');r.addColorStop(1,'rgba(200,210,200,0)');ctx.fillStyle=r;ctx.fillRect(0,0,W,H);}
 for(const b of flies){b.p+=dt*b.s;const x=b.x*W+Math.sin(b.p)*18,y=b.y*H+Math.cos(b.p*0.7)*12,a=0.3+0.5*Math.abs(Math.sin(b.p*1.3));ctx.fillStyle='rgba(180,255,120,'+a+')';ctx.beginPath();ctx.arc(x,y,2.2,0,TAU);ctx.fill();}
 if(Math.random()<0.02){ctx.fillStyle='rgba(255,240,200,0.06)';ctx.fillRect(0,0,W,H);}}

// ghost + jar live in actors.js

// ---------- fx: shake + haptics ----------
function shake(){const el=$('shake');el.classList.remove('on');void el.offsetWidth;el.classList.add('on');}
function haptic(ms){try{if(navigator.vibrate)navigator.vibrate(ms);}catch(e){}}   // ms or a pattern [on,off,on,…]; a no-op on iPhone (Safari has no vibration API)

// ---------- stage ----------
const canvas=$('stage'),ctx=canvas.getContext('2d');let DPR=1,view=[1,0,0,1,0,0];
function layout(){const W=window.innerWidth,H=window.innerHeight;DPR=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(W*DPR);canvas.height=Math.round(H*DPR);
 const s=(H*0.5)/1520;view=[s*DPR,0,0,s*DPR,(W*0.30-500*s)*DPR,(H*0.74-1560*s)*DPR];}
window.addEventListener('resize',layout);
function render(P,dt){audioMix(dt);const W=canvas.width/DPR,H=canvas.height/DPR;ctx.setTransform(DPR,0,0,DPR,0,0);drawScene(ctx,W,H,dt);drawGhost(ctx,W,H,dt);
 rigUpdate(P);for(const n of sortedDrawList(P)){if(!ART.on&&!artError&&hunt.state!=='BOOT'&&hunt.state!=='START')continue;if(n.kind==='raster'&&!RASTER[n.id])continue;const m=mmul(view,n.world);ctx.setTransform(m[0],m[1],m[2],m[3],m[4],m[5]);if(n.id==='w-fx')fxDraw(ctx);else if(rasterEnabled&&RASTER[n.id]&&n.id!=='w-jaw')drawRaster(ctx,n.id);else n.draw(ctx,P,n);}
 ctx.setTransform(DPR,0,0,DPR,0,0);drawJar(ctx,W,H,dt);}
const anim=new Animator();let P=defaults(),last=performance.now(),hidden=false;
function loop(t){let dt=Math.min((t-last)/1000,0.05);last=t;if(!hidden){now+=dt;P=anim.update(dt);fxUpdate(dt,P);render(P,dt);tickWaiters();chatterTick();}devRefresh();requestAnimationFrame(loop);}
document.addEventListener('visibilitychange',()=>{hidden=document.hidden;if(!hidden)last=performance.now();if(ACTX){if(hidden)ACTX.suspend();else ACTX.resume();}});

// ---------- director: the sequences ----------
function setState(s){hunt.state=s;hlog('→ '+s);}
async function runOpening(){setState('OPENING');sceneSet('assets/scenes/00-entrance-wide.jpg');scenePreload(0);hunt.busy=true;$('hud').classList.add('show');$('scanner').classList.add('show');stationLabel();anim.big=true;await anim.play('hop');await say('opening',HUNT.opening,{mood:'suspicious'});anim.big=false;await waitSec(0.4);hunt.busy=false;await runClue();}
async function runClue(){const s=HUNT.stations[hunt.step];setState('STATION');if(hunt.step>0)haptic(20);sceneCol=s.color;sceneSet(s.scene);scenePreload(hunt.step+1);ghost.st='idle';ghost.t=0;stationLabel();hunt.busy=true;await say('clue_0'+s.n,s.clue,{mood:'suspicious'});anim.lookAt('down');hunt.busy=false;save({step:hunt.step,count:jar.count});}
async function onCorrect(){if(hunt.busy||hunt.state!=='STATION')return;const s=HUNT.stations[hunt.step];setState('CAPTURING');hunt.busy=true;$('scanwin').classList.add('pulse');haptic(30);
 anim.play('surprised');await waitSec(0.3);await say('correct_0'+s.n,s.capture,{mood:'happy'});
 if(!jar.fly&&ghost.st!=='gone')jarCapture();while(ghost.st!=='gone')await waitSec(0.05);await waitSec(0.4);$('scanwin').classList.remove('pulse');
 if(hunt.step>=7){await runFinale();return;}hunt.step++;hunt.busy=false;await runClue();}
async function onWrong(){if(hunt.busy||hunt.state!=='STATION')return;hunt.busy=true;haptic([60,40,60]);const i=hunt.wrongIdx;hunt.wrongIdx=(i+1)%3;ghost.st='idle';ghostNotice();await say('wrong_'+(i+1),HUNT.wrong[i],{mood:'suspicious'});hunt.busy=false;}
async function runFinale(){setState('FINALE');hunt.busy=true;$('scanner').classList.remove('show');anim.play('celebrating');await say('final',HUNT.final,{mood:'happy'});if(!jar.released)jarRelease();await anim.play('laughing');for(const a of ['celebrating','magic','celebrating','laughing','celebrating']){await anim.play(a);}setState('DONE');hunt.done=true;save({done:true});haptic([30,30,30,30,120]);$('final').classList.add('show');}

// ---------- scanner ----------
let scanning=false,lastScan='',lastScanAt=-9;
function parseCode(text){text=(text||'').trim();let m=text.match(/hb([1-8])/i);if(m)return +m[1]-1;try{const u=new URL(text.includes('http')?text:'https://x/?'+text);const c=parseInt(u.searchParams.get('c')||u.searchParams.get('step'),10);if(c>=1&&c<=8)return c-1;}catch(e){}const d=parseInt(text,10);if(d>=1&&d<=8)return d-1;return null;}
function onScanText(text){const idx=parseCode(text);if(idx===null)return;if(text===lastScan&&now-lastScanAt<3)return;lastScan=text;lastScanAt=now;if(idx===hunt.step)onCorrect();else onWrong();}
async function startScanner(){if(scanning)return;const video=$('scanvid');try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});video.srcObject=stream;await video.play();scanning=true;$('scanwin').classList.add('ok');
  if('BarcodeDetector' in window){const det=new BarcodeDetector({formats:['qr_code']});const tick=async()=>{if(!scanning)return;try{const codes=await det.detect(video);if(codes.length)onScanText(codes[0].rawValue);}catch(e){}await waitSec(0.25);tick();};tick();}
  else{await new Promise((res,rej)=>{const s=document.createElement('script');s.src='assets/vendor/zxing.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});const reader=new ZXing.BrowserMultiFormatReader();reader.decodeFromStream(stream,video,(r)=>{if(r)onScanText(r.getText());});}
 }catch(e){$('scanbtn').textContent='Camera unavailable here — use dev mode';hlog('camera: '+(e&&e.name));}}
$('scanbtn').onclick=startScanner;

// ---------- wake lock ----------
let wl=null;async function wakeLock(){try{if('wakeLock' in navigator){wl=await navigator.wakeLock.request('screen');document.addEventListener('visibilitychange',async()=>{if(!document.hidden&&wl&&wl.released)wl=await navigator.wakeLock.request('screen');});}}catch(e){}}

// ---------- start / resume / close ----------
const saved=load();if(saved&&!saved.done&&saved.step>0)$('resumebtn').style.display='';
async function begin(resume){audioUnlock();wakeLock();sceneLoad('assets/scenes/00-entrance-wide.jpg');$('startbtn').textContent='Waking Agatha…';try{if(!ART.on){await loadCues('assets/cues',['opening','final','wrong_1','wrong_2','wrong_3',...Array.from({length:8},(_,i)=>'clue_0'+(i+1)),...Array.from({length:8},(_,i)=>'correct_0'+(i+1))]);await loadPaintedFrom('assets/witch');}await loadGhostArt('assets/ghosts');}catch(e){hlog('PAINTED ART FAILED: '+(e&&e.message||e));artError=String(e&&e.message||e);}$('start').classList.remove('show');if(resume&&saved){hunt.step=saved.step;jar.count=saved.count||0;$('hud').classList.add('show');$('scanner').classList.add('show');runClue();}else{clearSave();runOpening();}}
$('startbtn').onclick=()=>begin(false);$('resumebtn').onclick=()=>begin(true);
$('replay').onclick=()=>{if(hunt.busy)return;const s=HUNT.stations[hunt.step];if(hunt.state==='STATION')say('clue_0'+s.n,s.clue,{mood:'suspicious'});};
$('closebtn').onclick=()=>{save({done:true});window.close();$('final').querySelector('.card').innerHTML='<h2>All done</h2><div class="big">You can close this tab now.</div>';};

// ---------- dev mode ----------
let devTaps=0;const devOn=()=>{$('dev').classList.add('show');};
if(new URLSearchParams(location.search).get('dev')==='1')devOn();
$('devtap').addEventListener('pointerdown',()=>{if(++devTaps>=5)devOn();});
$('devcorrect').onclick=()=>onScanText(HUNT.stations[hunt.step].code);$('devwrong').onclick=()=>onScanText('hb'+(((hunt.step+3)%8)+1));
$('devnext').onclick=()=>{if(hunt.busy)return;if(hunt.step<7){hunt.step++;jar.count=hunt.step;runClue();}};
$('devreset').onclick=()=>{clearSave();location.reload();};
function devRefresh(){const d=$('devstate');if(!$('dev').classList.contains('show'))return;d.textContent='art '+(ART.on?'painted':'VECTOR'+(artError?' ('+artError+')':' (loading)'))+'\nstate '+hunt.state+'  step '+(hunt.step+1)+'  jar '+jar.count+'\nwitch '+anim.mood+(anim.action?' / '+anim.action.id:'')+(anim.speech?' / speaking':'')+'\n'+hunt.log.slice(-4).join('\n');}

// ---------- walking chatter: a random short line every 45–70 s of quiet between scans (only if its recording exists; always in dev mode) ----------
let chatterAt=0,lastChatter=-1,quietSince=0;
function chatterReset(){quietSince=now;chatterAt=now+45+Math.random()*25;}
async function chatterTick(){if(hunt.state!=='STATION'||hunt.busy||anim.speech||anim.action||hidden)return;if(now<chatterAt)return;
 let i;do{i=Math.floor(Math.random()*HUNT.chatter.length);}while(i===lastChatter);const name='chatter_'+String(i+1).padStart(2,'0');
 const buf=await loadClip(name);if(!buf&&!$('dev').classList.contains('show')){chatterAt=now+30;return;}lastChatter=i;hunt.busy=true;await say(name,HUNT.chatter[i],{mood:Math.random()<0.5?'suspicious':'happy'});hunt.busy=false;anim.lookAt('down');chatterReset();}
// ---------- tap reactions ----------
function screenOf(id,px,py){const S=LAYER_SPACE,[wx,wy]=worldPoint(id,S.ox+px/S.ppu,S.oy+py/S.ppu);return[(view[0]*wx+view[2]*wy+view[4])/DPR,(view[1]*wx+view[3]*wy+view[5])/DPR,view[0]/DPR/S.ppu];}
const TAPS=[['w-nose',690,875,95,'sneeze'],['w-eye-L',600,690,72,'winkL'],['w-eye-R',730,705,66,'winkR'],['w-hat',560,280,240,'hatbump'],['w-flask',700,1395,115,'bubble'],['w-torso',620,1120,175,'laughing']];
function tapAt(cx,cy){if(hunt.state!=='STATION'&&hunt.state!=='DONE')return;
 // ghost first (it floats over everything), then the jar, then the witch zones
 if(ghost.st==='idle'&&ghost.size&&Math.hypot(cx-ghost.x,cy-(ghost.y-ghost.size*0.25))<ghost.size*0.6){if(ghostPoke()){anim.lookAt('right');setTimeout(()=>anim.lookAt('down'),1200);}return;}
 const W=canvas.width/DPR,H=canvas.height/DPR,g=jarGeom(W,H);if(Math.abs(cx-g.x)<g.wb*0.8&&cy<g.y+g.h*0.1&&cy>g.y-g.h*1.1){jarPoke();anim.lookAt('right');setTimeout(()=>anim.lookAt('down'),900);return;}
 if(anim.speech||hunt.busy)return;
 for(const [id,px,py,r,act] of TAPS){const [sx,sy,k]=screenOf(id,px,py);if(Math.hypot(cx-sx,cy-sy)<r*k){haptic(20);if(act==='winkL'||act==='winkR')anim.play('wink',{st:{side:act.slice(-1)}});else anim.play(act);if(act==='sneeze')setTimeout(()=>{const [fx,fy]=worldPoint('w-flask-mouth');for(let i=0;i<8;i++)emit(fx,fy,'bubble');},700);chatterAt=Math.max(chatterAt,now+20);return;}}}
canvas.addEventListener('pointerdown',e=>{if(e.target!==canvas)return;tapAt(e.clientX,e.clientY);},{passive:true});
layout();requestAnimationFrame(loop);
