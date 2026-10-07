'use strict';
// ===================================================================
//  HUNT ENGINE 6a — content, state machine, director, scene, jar, scanner, audio, HUD, persistence, dev
//  Design: one clock (the frame loop + audio clock), no setTimeout choreography.
// ===================================================================

// ---------- content package (hunt.json inline for the artifact) ----------
const HUNT={id:'haunted-block-2026',title:'The Block Is Haunted',
 stations:[
  {n:1,code:'hb1',name:'Entry Hot Dog Stand',ghost:'mustard',accent:'#e4c33a',prop:'hotdog',color:'#2b2230',
   clue:"He steals first bites where the hot dogs steam —\nRight where you walked in. Go make him scream.",
   capture:"GOTCHA! Into the jar, mustard-breath! …He brought a hot dog in with him. Fine."},
  {n:2,code:'hb2',name:'Eatery by the Stairs',ghost:'snacker',accent:'#d84a3a',prop:'fork',color:'#24262f',
   clue:"She haunts where the hungry climb up to eat —\nTake the stairs to the food. Careful — she bites feet.",
   capture:"Caught her on the stairs mid-snack! In you go. Watch the feet, everyone."},
  {n:3,code:'hb3',name:'The Block Collective',ghost:'browser',accent:'#3fb8b0',prop:'tag',color:'#2a2a24',
   clue:"Fifteen shops, one roof, and one ghost with a plan —\nShe's tidying the shelves. Catch her if you can.",
   capture:"The Browser! Fifteen shops will finally stay TIDY. Into the jar, shopaholic."},
  {n:4,code:'hb4',name:'Bookstore',ghost:'reader',accent:'#e6dcc4',prop:'book',color:'#2c2420',
   clue:"She shushes the shoppers and reads all night through —\nSlip between the bookshelves. She's waiting for you.",
   capture:"SHHH yourself! The Reader, captured — she's still holding the book. Let her."},
  {n:5,code:'hb5',name:'Hive & Honey',ghost:'nibbler',accent:'#e0a526',prop:'cheese',color:'#2e2618',
   clue:"Sweet as honey, sharp as cheese —\nHe's nibbling the charcuterie. Get him, please.",
   capture:"Got the Nibbler! …There's cheese in my jar now. Worth it. Moving on!"},
  {n:6,code:'hb6',name:'The Grass',ghost:'groundskeeper',accent:'#6fbf4a',prop:'mower',color:'#1e2a1c',
   clue:"He mows at midnight, though nothing needs mowing —\nStand out on the grass and you'll catch him going.",
   capture:"Snagged him mid-mow! The grass will survive without you. NEXT."},
  {n:7,code:'hb7',name:'Main Stage',ghost:'diva',accent:'#a86bd8',prop:'mic',color:'#1c1826',
   clue:"You'll hear her before you see her — that wail's no mistake.\nShe's been singing since 1987. Get to the stage, for pity's sake.",
   capture:"One FINAL encore — from inside the jar! Beautiful. Tragic. CAUGHT."},
  {n:8,code:'hb8',name:'The Office',ghost:'boss',accent:'#4a6fd8',prop:'clipboard',color:'#1f2230',
   clue:"The last one's the BOSS — she thinks she runs this place.\nMarch into the office and meet her face to face.",
   capture:"THE BOSS HERSELF! That's all EIGHT — oh, this jar is positively RATTLING…"}],
 opening:"Agatha Bramble, keeper of The Block's ghosts — at your service. And PERFECT timing. Some FOOL left my ghost jar open, and now eight spirits are loose all over The Block. The party can't start till they're back in this jar — and my knees are three hundred years old, so YOU'RE doing the walking. Find where each ghost hides, scan my magic circle, and I'll do the rest. First ghost — listen up.",
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
let ACTX=null,music=null;
function audioUnlock(){if(!ACTX){try{ACTX=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}}if(ACTX&&ACTX.state==='suspended')ACTX.resume();
 if(!music){music=new Audio();music.loop=true;music.volume=0.35;music.src='assets/audio/bg_loop.mp3';music.play().catch(()=>{});}}
const clipCache={};
async function loadClip(name){if(clipCache[name]!==undefined)return clipCache[name];let buf=null;try{const r=await fetch('assets/audio/'+name+'.mp3');if(r.ok&&ACTX)buf=await ACTX.decodeAudioData(await r.arrayBuffer());}catch(e){}clipCache[name]=buf;return buf;}
// say(): returns when the line ends. Fires cue track; t null → position in text.
async function say(name,text,opts={}){const cue=CUES[name]||{mood:opts.mood||'neutral',cues:[]};anim.setMood(opts.mood||cue.mood||'neutral');
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
function drawScene(ctx,W,H,dt){ctx.fillStyle=sceneCol;ctx.fillRect(0,0,W,H);
 const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'rgba(0,0,0,0.35)');g.addColorStop(0.55,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,0.5)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
 const gy=H*0.74;ctx.fillStyle='rgba(0,0,0,0.25)';ctx.fillRect(0,gy,W,H-gy);
 for(const f of fog){f.x+=f.v*dt;if(f.x>1.3)f.x=-0.3;if(f.x<-0.3)f.x=1.3;const r=ctx.createRadialGradient(f.x*W,f.y*H,0,f.x*W,f.y*H,f.w*W*0.5);r.addColorStop(0,'rgba(200,210,200,'+f.a+')');r.addColorStop(1,'rgba(200,210,200,0)');ctx.fillStyle=r;ctx.fillRect(0,0,W,H);}
 for(const b of flies){b.p+=dt*b.s;const x=b.x*W+Math.sin(b.p)*18,y=b.y*H+Math.cos(b.p*0.7)*12,a=0.3+0.5*Math.abs(Math.sin(b.p*1.3));ctx.fillStyle='rgba(180,255,120,'+a+')';ctx.beginPath();ctx.arc(x,y,2.2,0,TAU);ctx.fill();}
 if(Math.random()<0.02){ctx.fillStyle='rgba(255,240,200,0.06)';ctx.fillRect(0,0,W,H);}}

// ghost + jar live in actors.js

// ---------- fx: shake + haptics ----------
function shake(){const el=$('shake');el.classList.remove('on');void el.offsetWidth;el.classList.add('on');}
function haptic(ms){try{if(navigator.vibrate)navigator.vibrate(ms);}catch(e){}}

// ---------- stage ----------
const canvas=$('stage'),ctx=canvas.getContext('2d');let DPR=1,view=[1,0,0,1,0,0];
function layout(){const W=window.innerWidth,H=window.innerHeight;DPR=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(W*DPR);canvas.height=Math.round(H*DPR);
 const s=(H*0.5)/1520;view=[s*DPR,0,0,s*DPR,(W*0.30-500*s)*DPR,(H*0.74-1560*s)*DPR];}
window.addEventListener('resize',layout);
function render(P,dt){const W=canvas.width/DPR,H=canvas.height/DPR;ctx.setTransform(DPR,0,0,DPR,0,0);drawScene(ctx,W,H,dt);drawGhost(ctx,W,H,dt);
 rigUpdate(P);for(const n of sortedDrawList(P)){if(!ART.on&&!artError&&hunt.state!=='BOOT'&&hunt.state!=='START')continue;if(n.kind==='raster'&&!RASTER[n.id])continue;const m=mmul(view,n.world);ctx.setTransform(m[0],m[1],m[2],m[3],m[4],m[5]);if(n.id==='w-fx')fxDraw(ctx);else if(rasterEnabled&&RASTER[n.id]&&n.id!=='w-jaw')drawRaster(ctx,n.id);else n.draw(ctx,P,n);}
 ctx.setTransform(DPR,0,0,DPR,0,0);drawJar(ctx,W,H,dt);}
const anim=new Animator();let P=defaults(),last=performance.now(),hidden=false;
function loop(t){let dt=Math.min((t-last)/1000,0.05);last=t;if(!hidden){now+=dt;P=anim.update(dt);fxUpdate(dt,P);render(P,dt);tickWaiters();}devRefresh();requestAnimationFrame(loop);}
document.addEventListener('visibilitychange',()=>{hidden=document.hidden;if(!hidden)last=performance.now();if(ACTX){if(hidden)ACTX.suspend();else ACTX.resume();}if(music){if(hidden)music.pause();else if(hunt.state!=='BOOT'&&hunt.state!=='START')music.play().catch(()=>{});}});

// ---------- director: the sequences ----------
function setState(s){hunt.state=s;hlog('→ '+s);}
async function runOpening(){setState('OPENING');hunt.busy=true;$('hud').classList.add('show');$('scanner').classList.add('show');stationLabel();await anim.play('surprised');await say('opening',HUNT.opening,{mood:'suspicious'});await waitSec(0.4);hunt.busy=false;await runClue();}
async function runClue(){const s=HUNT.stations[hunt.step];setState('STATION');sceneCol=s.color;ghost.st='idle';ghost.t=0;stationLabel();hunt.busy=true;await say('clue_0'+s.n,s.clue,{mood:'suspicious'});anim.lookAt('down');hunt.busy=false;save({step:hunt.step,count:jar.count});}
async function onCorrect(){if(hunt.busy||hunt.state!=='STATION')return;const s=HUNT.stations[hunt.step];setState('CAPTURING');hunt.busy=true;$('scanwin').classList.add('pulse');haptic(30);
 anim.play('surprised');await waitSec(0.3);await say('correct_0'+s.n,s.capture,{mood:'happy'});
 if(!jar.fly&&ghost.st!=='gone')jarCapture();while(ghost.st!=='gone')await waitSec(0.05);await waitSec(0.4);$('scanwin').classList.remove('pulse');
 if(hunt.step>=7){await runFinale();return;}hunt.step++;hunt.busy=false;await runClue();}
async function onWrong(){if(hunt.busy||hunt.state!=='STATION')return;hunt.busy=true;const i=hunt.wrongIdx;hunt.wrongIdx=(i+1)%3;ghost.st='idle';ghostNotice();await say('wrong_'+(i+1),HUNT.wrong[i],{mood:'suspicious'});hunt.busy=false;}
async function runFinale(){setState('FINALE');hunt.busy=true;$('scanner').classList.remove('show');anim.play('celebrating');await say('final',HUNT.final,{mood:'happy'});if(!jar.released)jarRelease();await anim.play('laughing');setState('DONE');hunt.done=true;save({done:true});$('final').classList.add('show');}

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
async function begin(resume){audioUnlock();wakeLock();$('startbtn').textContent='Waking Agatha…';try{if(!ART.on){await loadCues('assets/cues',['opening','final','wrong_1','wrong_2','wrong_3',...Array.from({length:8},(_,i)=>'clue_0'+(i+1)),...Array.from({length:8},(_,i)=>'correct_0'+(i+1))]);await loadPaintedFrom('assets/witch');}await loadGhostArt('assets/ghosts');}catch(e){hlog('PAINTED ART FAILED: '+(e&&e.message||e));artError=String(e&&e.message||e);}$('start').classList.remove('show');if(resume&&saved){hunt.step=saved.step;jar.count=saved.count||0;$('hud').classList.add('show');$('scanner').classList.add('show');runClue();}else{clearSave();runOpening();}}
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

layout();requestAnimationFrame(loop);
