// Agatha character engine — rig, animator, painted-layer loader, compositors. Shared by lab/ and the hunt.
'use strict';
/* ===================================================================
   Phase 1 character lab. Single file for phone testing.
   Sections map to the planned modules:
     core/Params, core/Rig, core/Renderer2D, anim/*, Character API, lab UI
   Rules: one RAF loop, one clock, no setTimeout in animation code.
   =================================================================== */

// ---------- utils ----------
const TAU=Math.PI*2, D2R=Math.PI/180;
const clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;
const easeOut=t=>1-(1-t)*(1-t), easeIO=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rng=mulberry32(1031);

// ---------- core/Params: the parameter bus ----------
// name: [default, min, max]
const PARAMS={
 'body.x':[0,-200,200],'body.y':[0,-200,200],'body.rot':[0,-15,15],'body.squash':[0,-1,1],'body.breath':[0,0,1],'body.hover':[0,0,1],'body.hunch':[0.5,0,1],
 'head.x':[0,-80,80],'head.y':[0,-80,80],'head.rot':[0,-25,25],'head.yaw':[0,-1,1],'head.pitch':[0,-1,1],
 'eye.L.size':[1,0.7,1.3],'eye.R.size':[0.92,0.7,1.3],'eye.L.openU':[0.75,0,1],'eye.R.openU':[0.75,0,1],'eye.L.openL':[1,0,1],'eye.R.openL':[1,0,1],
 'eye.L.lidTilt':[0,-1,1],'eye.R.lidTilt':[0,-1,1],'eye.squint':[0,0,1],'eye.scale':[1,0.9,1.2],'pupil.size':[1,0.6,1.4],'gaze.x':[0,-1,1],'gaze.y':[0,-1,1],
 'brow.L.raise':[0,-1,1],'brow.R.raise':[0,-1,1],'brow.L.angle':[0,-30,30],'brow.R.angle':[0,-30,30],
 'nose.rot':[0,-15,15],
 'mouth.open':[0,0,1],'jaw.scale':[1,0,1],'jaw.drop':[0,0,1],
 'arm.L.shoulder':[0,-60,170],'arm.L.elbow':[0,-140,60],'arm.R.shoulder':[8,-60,170],'arm.R.elbow':[-15,-140,60],'flask.glow':[0,0,1],
 'hat.squash':[0,-0.3,0.3],'hat.lift':[0,0,80],'leg.L.rot':[0,-40,40],'leg.R.rot':[0,-40,40],'fx.stars':[0,0,1],
 'hatTip.rot':[0,-40,40],'charm.rot':[0,-60,60],'hair.L.rot':[0,-20,20],'hair.R.rot':[0,-20,20],'nose.jiggle':[0,-10,10],'shawl.rot':[0,-10,10],'skirt.rot':[0,-10,10],'leg.lag':[0,-20,20],
};
const ENUMS={'mouth.shape':'neutral','hand.L.pose':'rest','hand.R.pose':'grip'};
const SPRING_OUT=new Set(['hatTip.rot','charm.rot','hair.L.rot','hair.R.rot','nose.jiggle','shawl.rot','skirt.rot','leg.lag']);
function defaults(){const o={};for(const k in PARAMS)o[k]=PARAMS[k][0];for(const k in ENUMS)o[k]=ENUMS[k];return o;}

// Mouth variant table. Each variant declares its own jaw drop.
// Rule: every variant is >= 110 units wide so it covers the jaw's visible top edge.
const MOUTH={
 'neutral':{w:150,baseH:0,jaw:0,lip:'sly',tooth:1},
 'grin':{w:190,baseH:0,jaw:0.05,lip:'smile',tooth:2},
 'grin-open':{w:200,baseH:16,jaw:0.35,lip:'smile',teeth:'top'},
 'hmm':{w:130,dx:10,baseH:0,jaw:0,lip:'sly'},
 'surprise':{w:120,baseH:30,jaw:0.7,lip:'round',round:true},
 'scared':{w:190,baseH:6,jaw:0.1,lip:'wavy',teeth:'top'},
 'scared-talk':{w:190,baseH:12,jaw:0.3,lip:'wavy',teeth:'top'},
 'laugh':{w:240,baseH:40,jaw:1,lip:'smile',teeth:'both',tongue:true},
 'excited':{w:220,baseH:24,jaw:0.5,lip:'smile',teeth:'top'},
 'talk-m':{w:130,baseH:3,jaw:0.05,lip:'flat'},
 'talk-e':{w:180,baseH:10,jaw:0.2,lip:'flat',teeth:'top'},
 'talk-a':{w:150,baseH:16,jaw:0.45,lip:'flat'},
 'talk-o':{w:115,baseH:28,jaw:0.4,lip:'round',round:true},
 'talk-wide-a':{w:210,baseH:24,jaw:0.7,lip:'flat',teeth:'top'},
 'talk-wide-o':{w:130,baseH:40,jaw:0.65,lip:'round',round:true},
};
const JAW_TRAVEL=110;

// ---------- core/Rig: nodes, pivots, parent/child transforms ----------
// Rig space 1000 x 1600, y down. Pivots in rig coords. Draw fns draw at rest positions.
const C={skin:'#a9a9a9',skinDark:'#909090',cloth:'#7d7a74',cloth2:'#6b6762',hair:'#c7c5c0',hat:'#5e5c59',boot:'#5a524a',
  eye:'#f1eee6',iris:'#6b4f2e',pupil:'#1c1616',mouth:'#3a1c22',tooth:'#e9e2cf',tongue:'#c26a74',flask:'#7cff4a',glass:'rgba(215,232,220,0.5)'};
let seamMode=false;
function edge(ctx){ if(seamMode){ctx.strokeStyle='#ff3b3b';ctx.lineWidth=3;}else{ctx.strokeStyle='rgba(0,0,0,0.28)';ctx.lineWidth=2;} ctx.stroke(); }
const MX=(x,m)=>m?1000-x:x;
function poly(ctx,pts,fill,m){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(MX(p[0],m),p[1]):ctx.moveTo(MX(p[0],m),p[1]));ctx.closePath();ctx.fillStyle=fill;ctx.fill();edge(ctx);}
function ell(ctx,cx,cy,rx,ry,fill,m){ctx.beginPath();ctx.ellipse(MX(cx,m),cy,rx,ry,0,0,TAU);ctx.fillStyle=fill;ctx.fill();edge(ctx);}
function rrPath(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
function rrect(ctx,x,y,w,h,r,fill,m){if(m)x=1000-x-w;rrPath(ctx,x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();edge(ctx);}

// ===== Phase 2 art: witch head/face (vector path art, rig-native) =====
const A={skin:'#A3B45E',skinD:'#6F7F3A',skinL:'#CBD58C',skinDD:'#4A5527',nose:'#D9A58A',noseD:'#AF7458',noseL:'#F1CDB6',
 sclera:'#F3EFE3',scleraD:'#B9B09A',iris:'#6B4F2E',irisD:'#3A2612',pupil:'#1A1414',hair:['#77756F','#96948E','#B4B2AC','#CECCC6','#E3E1DB'],
 hat:'#4E4B48',hatD:'#2E2C2A',hatL:'#6D6965',twine:'#A08660',twineD:'#75603F',lip:'#5C6A2C',lipD:'#39441B',mouth:'#4A1E2A',mouthD:'#2B0F17',
 tooth:'#EDE3C8',toothD:'#BDAE86',tongue:'#D0707A',tongueD:'#A54B58',mush:'#8A5A3A',mushL:'#B98A63',stem:'#E6DCC4',cloth:'#5E5A55',cloth2:'#454340',shawl:'#77736D',boot:'#5A3E2A',stock:'#2F2C30'};
const CONTOUR='rgba(35,30,24,0.42)';
function edge(ctx,w){if(seamMode){ctx.strokeStyle='#ff3b3b';ctx.lineWidth=3;}else{ctx.strokeStyle=CONTOUR;ctx.lineWidth=w||2;}ctx.stroke();}
function rgrad(ctx,x0,y0,r0,x1,y1,r1,stops){const g=ctx.createRadialGradient(x0,y0,r0,x1,y1,r1);stops.forEach(s=>g.addColorStop(s[0],s[1]));return g;}
function lgrad(ctx,x0,y0,x1,y1,stops){const g=ctx.createLinearGradient(x0,y0,x1,y1);stops.forEach(s=>g.addColorStop(s[0],s[1]));return g;}
function pathPts(ctx,pts,m){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(MX(p[0],m),p[1]):ctx.moveTo(MX(p[0],m),p[1]));ctx.closePath();}
function strand(ctx,x,y,len,ang,w,col,bend,m){const ex=x+Math.cos(ang)*len,ey=y+Math.sin(ang)*len,mx=(x+ex)/2-Math.sin(ang)*bend,my=(y+ey)/2+Math.cos(ang)*bend;
 ctx.strokeStyle=col;ctx.lineCap='round';ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(MX(x,m),y);ctx.quadraticCurveTo(MX(mx,m),my,MX(ex,m),ey);ctx.stroke();
 ctx.lineWidth=w*0.45;ctx.beginPath();ctx.moveTo(MX(mx,m),my);ctx.quadraticCurveTo(MX((mx+ex)/2,m),(my+ey)/2,MX(ex+Math.cos(ang)*w*0.6,m),ey+Math.sin(ang)*w*0.6);ctx.stroke();}
const HAIR_BACK=(()=>{const r=mulberry32(7),a=[];for(let i=0;i<40;i++){const f=i/39;a.push({x:430-f*24,y:436+f*270,len:150+r()*190,ang:(136+f*96+(r()-0.5)*20)*D2R,w:8+r()*13,c:1+Math.floor(r()*4),bend:(r()-0.5)*100});}return a;})();
const HAIR_FRONT=(()=>{const r=mulberry32(11),a=[];for(let i=0;i<8;i++){const f=i/7,left=i<4;a.push({x:left?344+i*14:614+(i-4)*14,y:404+r()*10,len:90+r()*110,ang:((left?118:62)+(r()-0.5)*26)*D2R,w:9+r()*9,c:2+Math.floor(r()*3),bend:(r()-0.5)*50});}for(let i=0;i<5;i++)a.push({x:440+i*30,y:404,len:22+r()*22,ang:(80+(r()-0.5)*40)*D2R,w:7,c:3,bend:0});return a;})();
function drawHairBack(ctx,m){pathPts(ctx,[[430,430],[350,440],[292,486],[240,522],[262,586],[212,650],[262,676],[232,750],[300,730],[316,800],[360,752],[430,730]],m);ctx.fillStyle=A.hair[1];ctx.fill();edge(ctx,1.5);
 for(const s of HAIR_BACK)strand(ctx,s.x,s.y,s.len,s.ang,s.w,A.hair[s.c],s.bend,m);}
function drawHairFront(ctx){for(const s of HAIR_FRONT)strand(ctx,s.x,s.y,s.len,s.ang,s.w,A.hair[s.c],s.bend,false);}
function drawHeadBase(ctx){ctx.beginPath();ctx.ellipse(500,585,172,168,0,0,TAU);ctx.fillStyle=rgrad(ctx,440,500,40,500,585,230,[[0,A.skinL],[0.45,A.skin],[1,A.skinD]]);ctx.fill();edge(ctx,2.5);
 ctx.fillStyle='rgba(60,70,30,0.35)';[[372,520,7],[392,660,5],[610,505,6],[636,600,5],[560,470,4],[470,690,4]].forEach(d=>{ctx.beginPath();ctx.arc(d[0],d[1],d[2],0,TAU);ctx.fill();});}
function drawCheek(ctx,m){ctx.beginPath();ctx.ellipse(MX(395,m),620,52,45,0,0,TAU);ctx.fillStyle=rgrad(ctx,MX(380,m),602,6,MX(395,m),620,60,[[0,A.skinL],[0.6,A.skin],[1,A.skinD]]);ctx.fill();edge(ctx,1.5);}
function drawJaw(ctx){ctx.beginPath();ctx.moveTo(400,650);ctx.lineTo(600,650);ctx.quadraticCurveTo(636,700,588,782);ctx.quadraticCurveTo(500,812,412,782);ctx.quadraticCurveTo(364,700,400,650);ctx.closePath();
 ctx.fillStyle=rgrad(ctx,480,690,20,500,720,140,[[0,A.skin],[0.7,A.skinD],[1,A.skinDD]]);ctx.fill();edge(ctx,2.5);
 ctx.beginPath();ctx.arc(548,762,11,0,TAU);ctx.fillStyle=A.skinD;ctx.fill();ctx.beginPath();ctx.arc(545,758,4,0,TAU);ctx.fillStyle=A.skinL;ctx.fill();}
function drawEar(ctx,m){pathPts(ctx,[[352,538],[290,494],[300,560],[336,610]],m);ctx.fillStyle=A.skin;ctx.fill();edge(ctx,2);pathPts(ctx,[[344,548],[310,520],[318,566],[338,592]],m);ctx.fillStyle=A.skinD;ctx.fill();}
function drawNose(ctx){pathPts(ctx,[[484,540],[528,540],[604,652],[550,690]]);ctx.fillStyle=lgrad(ctx,480,540,600,690,[[0,A.nose],[1,A.noseD]]);ctx.fill();edge(ctx,2);
 ctx.beginPath();ctx.ellipse(580,668,46,40,-0.3,0,TAU);ctx.fillStyle=rgrad(ctx,566,650,6,580,668,52,[[0,A.noseL],[0.5,A.nose],[1,A.noseD]]);ctx.fill();edge(ctx,2);
 ctx.beginPath();ctx.ellipse(556,696,12,7,0.4,0,TAU);ctx.fillStyle='rgba(70,35,30,0.55)';ctx.fill();
 ctx.beginPath();ctx.arc(524,588,9,0,TAU);ctx.fillStyle=A.noseD;ctx.fill();ctx.beginPath();ctx.arc(521,585,3,0,TAU);ctx.fillStyle=A.noseL;ctx.fill();}
function drawEye(ctx,P,side,cx,cy,r0){const s='eye.'+side,r=r0*P[s+'.size']*P['eye.scale'],sg=side==='L'?1:-1;
 ctx.beginPath();ctx.arc(cx,cy,r+6,0,TAU);ctx.fillStyle=A.skinDD;ctx.fill();
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.clip();
 ctx.fillStyle=rgrad(ctx,cx-r*0.35,cy-r*0.4,r*0.1,cx,cy,r*1.05,[[0,'#FFFDF6'],[0.55,A.sclera],[1,A.scleraD]]);ctx.fillRect(cx-r,cy-r,2*r,2*r);
 const ix=cx+P['gaze.x']*r*0.5,iy=cy+P['gaze.y']*r*0.45,ir=r*0.36;
 ctx.beginPath();ctx.arc(ix,iy,ir,0,TAU);ctx.fillStyle=rgrad(ctx,ix,iy,ir*0.2,ix,iy,ir,[[0,'#8C6A3E'],[0.7,A.iris],[1,A.irisD]]);ctx.fill();
 ctx.beginPath();ctx.arc(ix,iy,ir*0.55*P['pupil.size'],0,TAU);ctx.fillStyle=A.pupil;ctx.fill();
 ctx.beginPath();ctx.arc(cx-r*0.32,cy-r*0.36,r*0.12,0,TAU);ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fill();
 const openU=P[s+'.openU'],lidY=lerp(cy+r*0.15,cy-r,openU),lidG=rgrad(ctx,cx,lidY-r,r*0.2,cx,lidY,r*1.6,[[0,A.skin],[1,A.skinD]]);
 ctx.save();ctx.translate(cx,lidY);ctx.rotate(P[s+'.lidTilt']*0.35*sg);ctx.fillStyle=lidG;ctx.fillRect(-r*1.7,-r*3.4,r*3.4,r*3.4);ctx.strokeStyle=A.skinDD;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-r*1.2,0);ctx.lineTo(r*1.2,0);ctx.stroke();ctx.restore();
 const lowY=lerp(cy-r*0.1,cy+r,P[s+'.openL'])-P['eye.squint']*r*0.5;ctx.fillStyle=A.skin;ctx.fillRect(cx-r*1.7,lowY,r*3.4,r*3.4);ctx.strokeStyle=A.skinDD;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(cx-r*1.2,lowY);ctx.lineTo(cx+r*1.2,lowY);ctx.stroke();
 ctx.restore();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);edge(ctx,2);}
function drawBrow(ctx,m){const r=mulberry32(m?5:3);pathPts(ctx,[[392,498],[420,476],[452,470],[486,476],[506,492],[500,506],[398,508]],m);ctx.fillStyle=A.hair[1];ctx.fill();for(let i=0;i<14;i++){const f=i/13;strand(ctx,398+f*104,498-Math.sin(f*Math.PI)*14,30+r()*30,(-150+f*40+(r()-0.5)*50)*D2R,8+r()*7,A.hair[2+Math.floor(r()*3)],(r()-0.5)*12,m);}}
function drawHat(ctx){pathPts(ctx,[[382,394],[416,336],[446,298],[452,238],[472,178],[474,122],[526,122],[532,188],[556,236],[574,300],[602,342],[618,394]]);
 ctx.fillStyle=lgrad(ctx,400,150,620,420,[[0,A.hatL],[0.5,A.hat],[1,A.hatD]]);ctx.fill();edge(ctx,2.5);
 const pts=[];for(let i=0;i<32;i++){const a=i*TAU/32,r=1+((i%3)?0.03:-0.05);pts.push([500+Math.cos(a)*255*r,395+Math.sin(a)*38*r]);}pathPts(ctx,pts);ctx.fillStyle=lgrad(ctx,300,360,700,430,[[0,A.hat],[0.5,A.hatL],[1,A.hatD]]);ctx.fill();edge(ctx,2.5);
 ctx.beginPath();ctx.ellipse(500,398,250,34,0,0.1,Math.PI-0.1);ctx.fillStyle='rgba(0,0,0,0.28)';ctx.fill();
 ctx.fillStyle=A.twine;rrPath(ctx,436,322,128,36,8);ctx.fill();edge(ctx,1.5);ctx.strokeStyle=A.twineD;ctx.lineWidth=2;for(let x=444;x<560;x+=10){ctx.beginPath();ctx.moveTo(x,324);ctx.lineTo(x+8,356);ctx.stroke();}
 ctx.beginPath();ctx.ellipse(560,340,16,12,0,0,TAU);ctx.fillStyle=A.twineD;ctx.fill();
 [[402,372,1],[588,380,0.8]].forEach(([x,y,k])=>{ctx.fillStyle=A.stem;ctx.fillRect(x-4*k,y-14*k,8*k,16*k);ctx.beginPath();ctx.ellipse(x,y-14*k,16*k,10*k,0,Math.PI,TAU);ctx.fillStyle=A.mush;ctx.fill();edge(ctx,1);ctx.fillStyle=A.mushL;[[-6,-16],[4,-20],[8,-12]].forEach(d=>{ctx.beginPath();ctx.arc(x+d[0]*k,y+d[1]*k,2.2*k,0,TAU);ctx.fill();});});}
function drawHatTip(ctx){ctx.lineCap='round';[[A.hatD,42,0],[A.hat,30,-4],[A.hatL,14,-9]].forEach(([c,w,o])=>{ctx.strokeStyle=c;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(500+o*0.3,124);ctx.bezierCurveTo(500+o,50+o,600+o,20+o,636+o*0.3,74+o);ctx.stroke();ctx.lineWidth=w*0.7;ctx.beginPath();ctx.moveTo(636+o*0.3,74+o);ctx.bezierCurveTo(660+o,112+o,610+o,150+o,584+o,120+o);ctx.stroke();});}
function drawCharm(ctx){ctx.strokeStyle=A.twineD;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(584,122);ctx.lineTo(584,168);ctx.stroke();ctx.beginPath();ctx.arc(584,180,13,0,TAU);ctx.fillStyle=rgrad(ctx,579,175,2,584,180,14,[[0,A.mushL],[1,A.mush]]);ctx.fill();edge(ctx,1.5);}
function drawMouthBack(ctx,P){const g=mouthGeom(P);if(g.h<2)return;ctx.fillStyle=lgrad(ctx,0,g.top,0,g.bottom,[[0,A.mouthD],[1,A.mouth]]);
 if(g.sh.round){ctx.beginPath();ctx.ellipse(g.x,(g.top+g.bottom)/2,g.w/2,g.h/2,0,0,TAU);ctx.fill();}else{rrPath(ctx,g.x-g.w/2,g.top,g.w,g.h,Math.min(30,g.h/2));ctx.fill();}}
function tooth(ctx,x,y,w,h,tilt,up){ctx.save();ctx.translate(x,y);ctx.rotate(tilt);ctx.beginPath();if(up){ctx.moveTo(-w/2,0);ctx.lineTo(w/2,0);ctx.lineTo(w*0.32,h);ctx.lineTo(-w*0.32,h);}else{ctx.moveTo(-w/2,0);ctx.lineTo(w/2,0);ctx.lineTo(w*0.32,-h);ctx.lineTo(-w*0.32,-h);}ctx.closePath();ctx.fillStyle=lgrad(ctx,-w/2,0,w/2,0,[[0,A.tooth],[1,A.toothD]]);ctx.fill();ctx.strokeStyle='rgba(60,45,20,0.5)';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();}
function lipPath(ctx,g,which){const sh=g.sh,hw=g.w/2,x=g.x;ctx.beginPath();
 if(which==='top'){if(sh.lip==='sly'){ctx.moveTo(x-hw,g.top+8);ctx.quadraticCurveTo(x,g.top-4,x+hw,g.top-14);}else if(sh.lip==='smile'){ctx.moveTo(x-hw,g.top-14);ctx.quadraticCurveTo(x,g.top+10,x+hw,g.top-14);}
  else if(sh.lip==='wavy'){ctx.moveTo(x-hw,g.top);for(let i=1;i<=6;i++)ctx.lineTo(x-hw+i*(g.w/6),g.top+(i%2?-8:8));}else if(sh.lip==='round'){ctx.ellipse(x,(g.top+g.bottom)/2,hw,g.h/2+2,0,0,TAU);}else{ctx.moveTo(x-hw,g.top);ctx.lineTo(x+hw,g.top);}}
 else{if(sh.lip==='smile'){ctx.moveTo(x-hw,g.top-14);ctx.quadraticCurveTo(x,g.bottom+14,x+hw,g.top-14);}else if(sh.lip==='wavy'){ctx.moveTo(x-hw,g.bottom);for(let i=1;i<=6;i++)ctx.lineTo(x-hw+i*(g.w/6),g.bottom+(i%2?6:-6));}else{ctx.moveTo(x-hw,g.bottom);ctx.lineTo(x+hw,g.bottom);}}}
function drawMouth(ctx,P){const g=mouthGeom(P),sh=g.sh,hw=g.w/2,x=g.x;ctx.lineCap='round';ctx.lineJoin='round';
 if(sh.tongue&&g.h>50){ctx.beginPath();ctx.ellipse(x,g.bottom-18,hw*0.5,Math.min(30,g.h*0.3),0,0,TAU);ctx.fillStyle=rgrad(ctx,x-10,g.bottom-30,4,x,g.bottom-18,hw*0.5,[[0,A.tongue],[1,A.tongueD]]);ctx.fill();}
 if((sh.teeth==='top'||sh.teeth==='both')&&g.h>8){const th=Math.min(34,g.h*0.7);[[-0.55,-0.08],[-0.12,0.05],[0.4,-0.1]].forEach(([f,t])=>tooth(ctx,x+f*hw,g.top+1,20,th,t,true));}
 if(sh.teeth==='both'&&g.h>60){[[-0.38,0.08],[0.3,-0.06]].forEach(([f,t])=>tooth(ctx,x+f*hw,g.bottom-2,18,24,t,false));}
 lipPath(ctx,g,'top');ctx.strokeStyle=A.lipD;ctx.lineWidth=13;ctx.stroke();ctx.strokeStyle=A.lip;ctx.lineWidth=7;ctx.stroke();
 if(g.h>=2&&sh.lip!=='round'){lipPath(ctx,g,'bottom');ctx.strokeStyle=A.lipD;ctx.lineWidth=12;ctx.stroke();ctx.strokeStyle=A.lip;ctx.lineWidth=6;ctx.stroke();}
 if(sh.tooth){tooth(ctx,x+hw*0.25,g.top-2,18,26,0.06,true);if(sh.tooth>1)tooth(ctx,x-hw*0.4,g.top-4,16,22,-0.08,true);}}

const NODES=[]; const NODE={};
function node(d){NODES.push(d);NODE[d.id]=d;if(!d.pivot)d.pivot=[500,760];return d;}
const HAND_POSES={rest:{a:[-12,-4,4,12],len:78},open:{a:[-40,-14,14,40],len:85},point:{a:[-30,-6,6,14],len:[40,90,38,34]},grip:{a:[-24,-8,8,24],len:42,curl:70},splayed:{a:[-60,-22,22,60],len:92},casting:{a:[-38,-13,13,38],len:80,curl:55}};
function drawHand(ctx,P,side){
  const m=side==='R'; const px=MX(410,m), py=1205; const pose=HAND_POSES[P['hand.'+side+'.pose']]||HAND_POSES.rest;
  ell(ctx,410,1262,42,48,A.skin,m);
  const base=[px,1300];
  pose.a.forEach((ang,i)=>{const L=Array.isArray(pose.len)?pose.len[i]:pose.len; const a=(m?-ang:ang)*D2R;
    ctx.save();ctx.translate(base[0]+(i-1.5)*22*(m?-1:1),base[1]);ctx.rotate(a);rrPath(ctx,-9,-6,18,L,9);ctx.fillStyle=A.skin;ctx.fill();edge(ctx);
    if(pose.curl){ctx.translate(0,L-8);ctx.rotate((m?-1:1)*(i<2?-pose.curl:pose.curl)*0.5*D2R+(m?1:-1)*pose.curl*0.5*D2R);rrPath(ctx,-9,-6,18,40,9);ctx.fillStyle=A.skin;ctx.fill();edge(ctx);}
    ctx.restore();});
}
function drawEye(ctx,P,side,cx,cy,r0){
  const s='eye.'+side, r=r0*P[s+'.size']*P['eye.scale'], sg=side==='L'?1:-1;
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.clip();
  ctx.fillStyle=C.eye;ctx.fillRect(cx-r,cy-r,2*r,2*r);
  ctx.fillStyle='rgba(0,0,0,0.08)';ctx.beginPath();ctx.arc(cx+r*0.15,cy+r*0.2,r,0,TAU);ctx.fill();
  const ix=cx+P['gaze.x']*r*0.48, iy=cy+P['gaze.y']*r*0.42;
  ctx.fillStyle=C.iris;ctx.beginPath();ctx.arc(ix,iy,r*0.42,0,TAU);ctx.fill();
  ctx.fillStyle=C.pupil;ctx.beginPath();ctx.arc(ix,iy,r*0.2*P['pupil.size'],0,TAU);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.85)';ctx.beginPath();ctx.arc(cx-r*0.3,cy-r*0.35,r*0.11,0,TAU);ctx.fill();
  const openU=P[s+'.openU'], lidY=lerp(cy+r*0.15,cy-r,openU);
  ctx.save();ctx.translate(cx,lidY);ctx.rotate(P[s+'.lidTilt']*0.35*sg);ctx.fillStyle=C.skinDark;ctx.fillRect(-r*1.6,-r*3.2,r*3.2,r*3.2);ctx.restore();
  const lowY=lerp(cy-r*0.1,cy+r,P[s+'.openL'])-P['eye.squint']*r*0.5;
  ctx.fillStyle=C.skinDark;ctx.fillRect(cx-r*1.6,lowY,r*3.2,r*3.2);
  ctx.restore();
  ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);edge(ctx);
  ctx.save();ctx.translate(cx,lidY);ctx.rotate(P[s+'.lidTilt']*0.35*sg);ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-r,0);ctx.lineTo(r,0);ctx.stroke();ctx.restore();
}
function mouthGeom(P){const sh=MOUTH[P['mouth.shape']]||MOUTH.neutral,sc=ART.on?ART.mouth.scale:1,top=ART.on?ART.mouth.top:642,jt=ART.on?ART.jawTravel:JAW_TRAVEL;const bottom=top+8*sc+sh.baseH*sc+P['jaw.drop']*jt;return{sh,top,bottom,x:(ART.on?ART.mouth.x:500)+(sh.dx||0)*sc,w:Math.max(sh.w,110)*sc,h:bottom-top};}
function drawMouthBack(ctx,P){const g=mouthGeom(P);if(g.h<2)return;ctx.fillStyle=C.mouth;if(g.sh.round){ctx.beginPath();ctx.ellipse(g.x,(g.top+g.bottom)/2,g.w/2,g.h/2,0,0,TAU);ctx.fill();}else{rrPath(ctx,g.x-g.w/2,g.top,g.w,g.h,Math.min(30,g.h/2));ctx.fill();}}
function drawMouth(ctx,P){
  const g=mouthGeom(P), sh=g.sh, hw=g.w/2, x=g.x;
  ctx.strokeStyle='rgba(40,20,25,0.9)';ctx.lineWidth=5;ctx.lineCap='round';
  ctx.beginPath();
  if(sh.lip==='sly'){ctx.moveTo(x-hw,g.top+8);ctx.quadraticCurveTo(x,g.top-4,x+hw,g.top-14);}
  else if(sh.lip==='smile'){ctx.moveTo(x-hw,g.top-14);ctx.quadraticCurveTo(x,g.top+10,x+hw,g.top-14);}
  else if(sh.lip==='wavy'){ctx.moveTo(x-hw,g.top);for(let i=1;i<=6;i++)ctx.lineTo(x-hw+i*(g.w/6),g.top+(i%2?-8:8));}
  else if(sh.lip==='round'){ctx.ellipse(x,(g.top+g.bottom)/2,hw,g.h/2+2,0,0,TAU);}
  else {ctx.moveTo(x-hw,g.top);ctx.lineTo(x+hw,g.top);}
  ctx.stroke();
  if(g.h>=2&&sh.lip!=='round'){ctx.beginPath();if(sh.lip==='smile'){ctx.moveTo(x-hw,g.top-14);ctx.quadraticCurveTo(x,g.bottom+14,x+hw,g.top-14);}else{ctx.moveTo(x-hw,g.bottom);ctx.lineTo(x+hw,g.bottom);}ctx.stroke();}
  if(sh.tongue&&g.h>50){ctx.fillStyle=C.tongue;ctx.beginPath();ctx.ellipse(x,g.bottom-18,hw*0.5,Math.min(28,g.h*0.3),0,0,TAU);ctx.fill();}
  if((sh.teeth==='top'||sh.teeth==='both')&&g.h>8){ctx.fillStyle=C.tooth;const th=Math.min(30,g.h*0.7);[-0.55,-0.1,0.42].forEach(f=>{ctx.fillRect(x+f*hw-9,g.top+2,18,th);});}
  if(sh.teeth==='both'&&g.h>60){ctx.fillStyle=C.tooth;[-0.35,0.3].forEach(f=>{ctx.fillRect(x+f*hw-8,g.bottom-24,16,22);});}
  if(sh.tooth){ctx.fillStyle=C.tooth;ctx.fillRect(x+hw*0.25-8,g.top-2,16,24);if(sh.tooth>1)ctx.fillRect(x-hw*0.4-8,g.top-6,16,22);}
}
function hairPts(){return [[400,430],[330,440],[286,500],[228,520],[256,580],[214,640],[262,668],[236,740],[300,720],[318,790],[356,740],[420,720]];}

// root
node({id:'w-root',kind:'group',pivot:[500,1560]});
node({id:'w-shadow',parent:'w-root',z:0,kind:'procedural',draw(ctx,P){const h=P['body.hover'];ctx.globalAlpha=0.35*(1-0.5*h);ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(500,1560,190*(1-0.35*h),22*(1-0.35*h),0,0,TAU);ctx.fill();ctx.globalAlpha=1;}});
node({id:'w-body',parent:'w-root',kind:'group',pivot:[500,1040],pose:P=>({x:P['body.x'],y:P['body.y']-P['body.hover']*70,rot:P['body.rot'],sx:1+P['body.squash']*0.15,sy:1-P['body.squash']*0.15})});
for(const s of ['L','R']){const m=s==='R';
 node({id:'w-leg-'+s,parent:'w-body',z:5,kind:'sprite',pivot:[MX(455,m),1270],pose:P=>({rot:(m?-1:1)*(P['leg.'+s+'.rot']+P['leg.lag']*(0.3+P['body.hover']))}),
  draw(ctx,P){rrect(ctx,440,1250,30,260,12,A.stock,m);poly(ctx,[[436,1482],[482,1480],[486,1560],[360,1560],[318,1546],[344,1520],[430,1522]],A.boot,m);ell(ctx,318,1532,11,11,A.boot,m);}});
}
node({id:'w-skirt',parent:'w-body',z:10,kind:'sprite',pivot:[500,1040],pose:P=>({rot:P['skirt.rot']}),draw(ctx,P){const pts=[[405,1030],[595,1030],[690,1300]];for(let x=660;x>=340;x-=40)pts.push([x,(x/40)%2?1272:1306]);pts.push([310,1300]);poly(ctx,pts,A.cloth);ell(ctx,650,1290,14,14,A.mush);ell(ctx,668,1296,10,10,A.mush);}});
node({id:'w-torso',parent:'w-body',z:12,kind:'sprite',pivot:[500,1040],pose:P=>({sy:1+P['body.breath']*0.015}),draw(ctx){rrect(ctx,405,770,190,280,40,A.cloth2);ctx.strokeStyle='rgba(0,0,0,0.35)';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(405,1036);ctx.lineTo(595,1036);ctx.stroke();}});
for(const s of ['L','R']){const m=s==='R';
 node({id:'w-arm-'+s+'-upper',parent:'w-body',z:14,kind:'sprite',pivot:[MX(410,m),810],pose:P=>({y:-P['body.hunch']*20,rot:(m?-1:1)*P['arm.'+s+'.shoulder']}),draw(ctx){poly(ctx,[[378,798],[442,798],[452,1022],[368,1022]],A.cloth,m);}});
 node({id:'w-arm-'+s+'-fore',parent:'w-arm-'+s+'-upper',z:15,kind:'sprite',pivot:[MX(410,m),1010],pose:P=>({rot:(m?-1:1)*P['arm.'+s+'.elbow']}),draw(ctx){poly(ctx,[[366,998],[454,998],[478,1212],[342,1212]],A.cloth,m);}});
 node({id:'w-hand-'+s,parent:'w-arm-'+s+'-fore',z:14.5,kind:'variant',pivot:[MX(410,m),1205],draw(ctx,P){drawHand(ctx,P,s);}});
}
node({id:'w-flask',parent:'w-hand-R',z:19,kind:'sprite',pivot:[590,1205],draw(ctx,P){const g=P['flask.glow'];if(g>0.02){ctx.fillStyle=C.flask;for(let i=3;i>=1;i--){ctx.globalAlpha=0.08*g;ctx.beginPath();ctx.arc(600,1300,52+i*22,0,TAU);ctx.fill();}ctx.globalAlpha=1;}
  ctx.fillStyle=C.glass;ctx.beginPath();ctx.arc(600,1300,52,0,TAU);ctx.fill();ctx.save();ctx.beginPath();ctx.arc(600,1300,52,0,TAU);ctx.clip();ctx.fillStyle=C.flask;ctx.globalAlpha=0.55+0.45*g;ctx.fillRect(540,1300,120,60);ctx.globalAlpha=1;ctx.restore();ctx.beginPath();ctx.arc(600,1300,52,0,TAU);edge(ctx);rrect(ctx,588,1226,24,44,6,C.glass);rrect(ctx,584,1212,32,18,4,'#8a6a48');}});
node({id:'w-flask-mouth',parent:'w-flask',kind:'anchor',pivot:[600,1215]});
node({id:'w-shawl',parent:'w-body',z:25,kind:'sprite',pivot:[500,770],pose:P=>({y:-P['body.hunch']*25,rot:P['shawl.rot']}),draw(ctx){const pts=[[350,790],[370,760],[430,748],[500,742],[570,748],[630,760],[650,790]];for(let x=650;x>=350;x-=30)pts.push([x,(x/30)%2?840:870]);poly(ctx,pts,A.shawl);}});
node({id:'w-mount-frog',parent:'w-body',kind:'anchor',pivot:[392,772]});
node({id:'w-head',parent:'w-body',kind:'group',pivot:[500,760],pose:P=>({x:P['head.x'],y:P['head.y']+P['body.hunch']*55,rot:P['head.rot']})});
const PARALLAX={x:46,y:24};const HX=(P,d)=>P['head.yaw']*PARALLAX.x*d, HY=(P,d)=>(P['head.pitch']+(P['body.hunch']-0.5)*0.4)*PARALLAX.y*d;
function headChild(d){d.parent='w-head';const inner=d.pose;d.pose=P=>{const o=inner?inner(P):{};const dep=d.depth||0;o.x=(o.x||0)+HX(P,dep);o.y=(o.y||0)+HY(P,dep);return o;};return node(d);}
headChild({id:'w-hair-back-L',z:30,depth:-0.35,kind:'sprite',pivot:[400,470],pose:P=>({rot:P['hair.L.rot']}),draw(ctx){drawHairBack(ctx,false);}});
headChild({id:'w-hair-back-R',z:30,depth:-0.35,kind:'sprite',pivot:[600,470],pose:P=>({rot:-P['hair.R.rot']}),draw(ctx){drawHairBack(ctx,true);}});
headChild({id:'w-ear-L',z:32,depth:-0.15,kind:'sprite',pivot:[345,560],draw(ctx){if(!ART.on)drawEar(ctx,false);}});
headChild({id:'w-ear-R',z:32,depth:-0.15,kind:'sprite',pivot:[655,560],draw(ctx){if(!ART.on)drawEar(ctx,true);}});
headChild({id:'w-head-base',z:33,depth:0,kind:'sprite',pivot:[500,585],draw(ctx){drawHeadBase(ctx);}});
headChild({id:'w-mouth-back',z:34,depth:0.4,kind:'procedural',pivot:[500,660],draw(ctx,P){if(ART.on)drawMouthPlate(ctx,P);else if(!(MOUTHKIT.on&&MOUTHKIT.pieces))drawMouthBack(ctx,P);}});
headChild({id:'w-jaw',z:35,depth:0.3,kind:'sprite',pivot:[500,640],pose:P=>(ART.on?{}:{y:P['jaw.drop']*JAW_TRAVEL}),draw(ctx,P){if(ART.on&&RASTER['w-jaw'])drawJawStretched(ctx,P);else drawJaw(ctx);}});
headChild({id:'w-cheek-L',z:36,depth:0.2,kind:'sprite',pivot:[395,620],draw(ctx){drawCheek(ctx,false);}});
headChild({id:'w-cheek-R',z:36,depth:0.2,kind:'sprite',pivot:[605,620],draw(ctx){drawCheek(ctx,true);}});
headChild({id:'w-mouth',z:45,depth:0.4,kind:'variant',pivot:[500,642],draw(ctx,P){if(ART.on)drawMouthPainted(ctx,P);else if(MOUTHKIT.on&&MOUTHKIT.pieces)drawMouthKit(ctx,P);else drawMouth(ctx,P);}});
headChild({id:'w-eye-L',z:50,depth:0.55,kind:'procedural',pivot:[444,548],draw(ctx,P){const e=ART.on?ART.eyeL:[444,548,52];(ART.on?drawEyePainted:EYEKIT.on?drawEyeKit:drawEye)(ctx,P,'L',e[0],e[1],e[2]);}});
headChild({id:'w-eye-R',z:50,depth:0.55,kind:'procedural',pivot:[558,542],draw(ctx,P){const e=ART.on?ART.eyeR:[558,542,52];(ART.on?drawEyePainted:EYEKIT.on?drawEyeKit:drawEye)(ctx,P,'R',e[0],e[1],e[2]);}});
headChild({id:'w-brow-L',z:55,depth:0.6,kind:'sprite',pivot:[447,486],pose:P=>({y:-P['brow.L.raise']*22,rot:P['brow.L.angle']}),draw(ctx){drawBrow(ctx,false);}});
headChild({id:'w-brow-R',z:55,depth:0.6,kind:'sprite',pivot:[557,480],pose:P=>({y:-P['brow.R.raise']*22,rot:-P['brow.R.angle']}),draw(ctx){drawBrow(ctx,true);}});
headChild({id:'w-nose',z:60,depth:1,kind:'sprite',pivot:[505,545],pose:P=>({rot:P['nose.rot']+P['nose.jiggle']}),draw(ctx){drawNose(ctx);}});
headChild({id:'w-hair-front',z:70,depth:0.25,kind:'sprite',pivot:[500,430],draw(ctx){if(!ART.on)drawHairFront(ctx);}});
headChild({id:'w-hat',z:80,depth:0.1,kind:'sprite',pivot:[500,395],pose:P=>({y:-P['hat.lift'],sx:1+P['hat.squash'],sy:1-P['hat.squash']*1.3}),draw(ctx){drawHat(ctx);}});
node({id:'w-hat-tip',parent:'w-hat',z:81,kind:'sprite',pivot:[500,125],pose:P=>({rot:P['hatTip.rot']}),draw(ctx){drawHatTip(ctx);}});
node({id:'w-hat-charm',parent:'w-hat-tip',z:82,kind:'sprite',pivot:[584,122],pose:P=>({rot:P['charm.rot']}),draw(ctx){drawCharm(ctx);}});
node({id:'w-fx',parent:'w-root',z:100,kind:'procedural',pivot:[500,1560],draw(ctx){}});

// matrices [a,b,c,d,e,f]
function mmul(p,q){return[p[0]*q[0]+p[2]*q[1],p[1]*q[0]+p[3]*q[1],p[0]*q[2]+p[2]*q[3],p[1]*q[2]+p[3]*q[3],p[0]*q[4]+p[2]*q[5]+p[4],p[1]*q[4]+p[3]*q[5]+p[5]];}
function mlocal(pv,o){const x=o.x||0,y=o.y||0,r=(o.rot||0)*D2R,sx=o.sx==null?1:o.sx,sy=o.sy==null?1:o.sy,c=Math.cos(r),s=Math.sin(r);const a=c*sx,b=s*sx,cc=-s*sy,d=c*sy;return[a,b,cc,d,pv[0]+x-(a*pv[0]+cc*pv[1]),pv[1]+y-(b*pv[0]+d*pv[1])];}
function mpt(m,x,y){return[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];}
const ID=[1,0,0,1,0,0];
// ===== Raster layer system (Phase 2 pipeline): full-canvas painted layers → rig nodes =====
// Layer space: layer pixel (px,py) → rig units (ox + px/ppu, oy + py/ppu). Set once from the aligned master.
const LAYER_SPACE={ppu:1,ox:0,oy:0,w:1240,h:1700};
const RASTER={}; let rasterEnabled=true, standinMode=false;
const STANDIN_IDS=new Set(['w-shadow','w-fx','standin-body','standin-hat']);
function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src;});}
function keyOut(x,w,h,thr){const d=x.getImageData(0,0,w,h),p=d.data,r0=p[4*(5*w+5)],g0=p[4*(5*w+5)+1],b0=p[4*(5*w+5)+2];
 for(let i=0;i<p.length;i+=4){const dd=Math.abs(p[i]-r0)+Math.abs(p[i+1]-g0)+Math.abs(p[i+2]-b0);if(dd<thr)p[i+3]=0;else if(dd<thr*2)p[i+3]=Math.min(p[i+3],Math.round(255*(dd-thr)/thr));}x.putImageData(d,0,0);}
function alphaBBox(c){const s=Math.min(1,512/Math.max(c.width,c.height)),w=Math.max(1,Math.round(c.width*s)),h=Math.max(1,Math.round(c.height*s));const t=document.createElement('canvas');t.width=w;t.height=h;const x=t.getContext('2d');x.drawImage(c,0,0,w,h);
 const p=x.getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;for(let y=0;y<h;y++)for(let X=0;X<w;X++){if(p[4*(y*w+X)+3]>8){if(X<x0)x0=X;if(X>x1)x1=X;if(y<y0)y0=y;if(y>y1)y1=y;}}
 if(x1<0)return null;const m=2/s;return[Math.max(0,Math.floor(x0/s-m)),Math.max(0,Math.floor(y0/s-m)),Math.min(c.width,Math.ceil((x1+1)/s+m)),Math.min(c.height,Math.ceil((y1+1)/s+m))].map((v,i)=>v);}
function rasterBytes(){let n=0;for(const k in RASTER){const L=RASTER[k];n+=L.src.width*L.src.height*4+(L.scaled&&L.scaled!==L.src?L.scaled.width*L.scaled.height*4:0);}return n;}
// Install an image (or canvas) as the raster art of a node. opts: {keyBg:thr, crop:[x,y,w,h] in layer px}
function installRaster(nodeId,img,opts={}){let c=document.createElement('canvas');c.width=img.width;c.height=img.height;let x=c.getContext('2d');x.drawImage(img,0,0);
 if(opts.keyBg)keyOut(x,c.width,c.height,opts.keyBg);
 if(opts.crop){const [cx,cy,cw,ch]=opts.crop,c2=document.createElement('canvas');c2.width=cw;c2.height=ch;c2.getContext('2d').drawImage(c,cx,cy,cw,ch,0,0,cw,ch);c=c2;var offx=cx,offy=cy;}else if(opts.offset){var offx=opts.offset[0],offy=opts.offset[1];}else{var offx=0,offy=0;}
 const bb=alphaBBox(c);if(!bb){anim.log('raster '+nodeId+': empty alpha',true);return null;}
 const [x0,y0,x1,y1]=bb,cc=document.createElement('canvas');cc.width=x1-x0;cc.height=y1-y0;cc.getContext('2d').drawImage(c,x0,y0,cc.width,cc.height,0,0,cc.width,cc.height);
 const S=LAYER_SPACE,px=offx+x0,py=offy+y0;
 RASTER[nodeId]={src:cc,bboxPx:[px,py,cc.width,cc.height],rig:[S.ox+px/S.ppu,S.oy+py/S.ppu,cc.width/S.ppu,cc.height/S.ppu],scaled:null,scaleKey:0};
 anim.log('raster '+nodeId+': '+cc.width+'×'+cc.height+' px, cache '+(rasterBytes()/1048576).toFixed(1)+' MB');return RASTER[nodeId];}
function drawRaster(ctx,nodeId){const L=RASTER[nodeId],target=view[0],key=Math.round(target*200);
 if(L.scaleKey!==key){const w=Math.max(1,Math.round(L.rig[2]*target)),h=Math.max(1,Math.round(L.rig[3]*target));if(w<L.src.width){const s=document.createElement('canvas');s.width=w;s.height=h;s.getContext('2d').drawImage(L.src,0,0,w,h);L.scaled=s;}else L.scaled=L.src;L.scaleKey=key;}
 ctx.drawImage(L.scaled,L.rig[0],L.rig[1],L.rig[2],L.rig[3]);}
// Fit layer space so the master's figure bbox maps onto the rig figure (hat tip y≈40 … soles y≈1560, centred at x 500)
function fitLayerSpace(bb,imgW,imgH){const [x0,y0,x1,y1]=bb;LAYER_SPACE.ppu=(y1-y0)/1520;LAYER_SPACE.ox=500-((x0+x1)/2)/LAYER_SPACE.ppu;LAYER_SPACE.oy=40-y0/LAYER_SPACE.ppu;LAYER_SPACE.w=imgW;LAYER_SPACE.h=imgH;
 anim.log('layer space: '+imgW+'×'+imgH+' px, '+LAYER_SPACE.ppu.toFixed(3)+' px/unit, origin ('+LAYER_SPACE.ox.toFixed(0)+','+LAYER_SPACE.oy.toFixed(0)+')');}
// Stand-in test: the master as two crude raster layers (body under root, hat under w-hat) to prove the loader, scaling and node binding.
async function loadStandin(){if(typeof MASTER_STANDIN==='undefined')return;const img=await loadImg(MASTER_STANDIN);const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);keyOut(x,c.width,c.height,36);
 const bb=alphaBBox(c);fitLayerSpace(bb,c.width,c.height);const brimY=Math.round(bb[1]+(bb[3]-bb[1])*0.36);
 installRaster('standin-hat',c,{crop:[0,0,c.width,brimY+20]});installRaster('standin-body',c,{crop:[0,brimY-10,c.width,c.height-(brimY-10)]});
 // re-fit the hat pivot to the art: brim centre in rig units
 NODE['standin-hat'].pivot=[500,LAYER_SPACE.oy+brimY/LAYER_SPACE.ppu];standinMode=true;anim.log('stand-in master loaded (crude 2-layer cut, not production art)');}
// Layer file validator: drop real full-canvas PNGs named by node id.
const ZONES={'w-head-base':[328,300,344,470],'w-jaw':[368,596,264,220],'w-hair-back-L':[200,400,270,420],'w-hair-back-R':[530,400,270,420],'w-hat':[236,80,528,360],'w-hat-tip':[470,20,220,160],'w-nose':[470,510,150,200],
 'w-arm-L-upper':[350,740,120,300],'w-arm-R-upper':[530,740,120,300],'w-arm-L-fore':[330,960,160,270],'w-arm-R-fore':[510,960,160,270],'w-hand-L':[340,1170,140,200],'w-hand-R':[520,1170,140,200],'w-skirt':[300,990,400,330],'w-leg-L':[300,1150,200,420],'w-leg-R':[500,1150,200,420],'w-shawl':[340,730,320,160],'w-torso':[395,760,210,300],'w-flask':[540,1200,120,170]};
async function validateLayerFiles(files){for(const f of files){const id=f.name.replace(/\.(png|webp)$/i,'');const url=URL.createObjectURL(f);let img;try{img=await loadImg(url);}catch(e){anim.log(f.name+': cannot decode',true);continue;}
 const probs=[];if(img.width!==LAYER_SPACE.w||img.height!==LAYER_SPACE.h)probs.push('size '+img.width+'×'+img.height+' ≠ '+LAYER_SPACE.w+'×'+LAYER_SPACE.h);
 if(!NODE[id])probs.push('no rig node named '+id);
 const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);
 const z=ZONES[id];if(z&&!probs.length){const S=LAYER_SPACE,zx=Math.round((z[0]-S.ox)*S.ppu),zy=Math.round((z[1]-S.oy)*S.ppu),zw=Math.round(z[2]*S.ppu),zh=Math.round(z[3]*S.ppu);
  const d=x.getImageData(Math.max(0,zx),Math.max(0,zy),Math.min(zw,c.width-zx),Math.min(zh,c.height-zy)).data;let n=0,t=0;for(let i=3;i<d.length;i+=16){t++;if(d[i]>200)n++;}const cov=n/t;if(cov<0.95)probs.push('hidden-paint coverage '+(cov*100).toFixed(0)+'% < 95%');}
 const d=x.getImageData(0,0,c.width,c.height).data;let edge=0,halo=0;for(let i=0;i<d.length;i+=64){const a=d[i+3];if(a>20&&a<235){edge++;const l=(d[i]+d[i+1]+d[i+2])/3;if(l>225)halo++;}}if(edge>50&&halo/edge>0.4)probs.push('possible white halo on edges');
 if(probs.length){anim.log(f.name+': '+probs.join('; '),true);}else{installRaster(id,img);anim.log(f.name+': OK, installed');}
 URL.revokeObjectURL(url);}}
// ===== Mouth and eye compositors (painted kits; stub pieces generated from the vector art for testing) =====
const MOUTHKIT={on:false,pieces:null}, EYEKIT={on:false,ball:null,iris:null};
function mk(w,h,fn){const c=document.createElement('canvas');c.width=w;c.height=h;fn(c.getContext('2d'),w,h);return c;}
function buildStubKits(){
 MOUTHKIT.pieces={
  lipUpper:mk(300,28,(x,w,h)=>{x.fillStyle=A.lipD;x.fillRect(0,0,w,h);x.fillStyle=A.lip;x.fillRect(0,7,w,12);}),
  lipLower:mk(300,26,(x,w,h)=>{x.fillStyle=A.lipD;x.fillRect(0,0,w,h);x.fillStyle=A.lip;x.fillRect(0,8,w,10);}),
  teethTop:mk(240,40,(x,w,h)=>{[40,110,190].forEach((tx,i)=>tooth(x,tx,0,20,36,[-0.08,0.05,-0.1][i],true));}),
  teethBottom:mk(240,30,(x,w,h)=>{[70,170].forEach((tx,i)=>tooth(x,tx,28,18,24,[0.08,-0.06][i],false));}),
  tongue:mk(160,90,(x,w,h)=>{x.fillStyle=rgrad(x,60,30,4,80,45,80,[[0,A.tongue],[1,A.tongueD]]);x.beginPath();x.ellipse(80,45,78,44,0,0,TAU);x.fill();}),
  interior:mk(300,200,(x,w,h)=>{x.fillStyle=lgrad(x,0,0,0,h,[[0,A.mouthD],[1,A.mouth]]);x.fillRect(0,0,w,h);})};
 EYEKIT.ball=mk(128,128,(x)=>{x.fillStyle=rgrad(x,44,40,6,64,64,68,[[0,'#FFFDF6'],[0.55,A.sclera],[1,A.scleraD]]);x.beginPath();x.arc(64,64,64,0,TAU);x.fill();});
 EYEKIT.iris=mk(64,64,(x)=>{x.fillStyle=rgrad(x,32,32,4,32,32,32,[[0,'#8C6A3E'],[0.7,A.iris],[1,A.irisD]]);x.beginPath();x.arc(32,32,32,0,TAU);x.fill();});}
function drawMouthKit(ctx,P){const g=mouthGeom(P),sh=g.sh,hw=g.w/2,x=g.x,K=MOUTHKIT.pieces;
 if(g.h>=2){ctx.save();ctx.beginPath();if(sh.round)ctx.ellipse(x,(g.top+g.bottom)/2,hw,g.h/2,0,0,TAU);else rrPath(ctx,x-hw,g.top,g.w,g.h,Math.min(30,g.h/2));ctx.clip();
  ctx.drawImage(K.interior,x-hw,g.top,g.w,g.h);
  if((sh.teeth==='top'||sh.teeth==='both')&&g.h>8)ctx.drawImage(K.teethTop,x-hw*0.85,g.top,hw*1.7,Math.min(36,g.h*0.7));
  if(sh.tongue&&g.h>50)ctx.drawImage(K.tongue,x-hw*0.5,g.bottom-Math.min(60,g.h*0.6),hw,Math.min(60,g.h*0.6));
  if(sh.teeth==='both'&&g.h>60)ctx.drawImage(K.teethBottom,x-hw*0.7,g.bottom-26,hw*1.4,26);ctx.restore();}
 // lips as 3-slice strips: outer thirds rotate for smile/sly curvature
 const curl=sh.lip==='smile'?-0.35:sh.lip==='sly'?0.18:0;
 const strip=(img,y,thick,c)=>{const seg=g.w/3;for(let i=0;i<3;i++){const ang=i===0?c:i===2?-c:0,sx=x-hw+i*seg;ctx.save();ctx.translate(sx+seg/2,y);ctx.rotate(ang*(sh.lip==='sly'&&i===2?-1.6:1));ctx.drawImage(img,i*100,0,100,img.height,-seg/2-1,-thick/2,seg+2,thick);ctx.restore();}};
 strip(K.lipUpper,g.top,14,curl);if(g.h>=2&&sh.lip!=='round')strip(K.lipLower,g.bottom,13,-curl*0.6);
 if(sh.tooth)tooth(ctx,x+hw*0.25,g.top-2,18,26,0.06,true);}
function drawEyeKit(ctx,P,side,cx,cy,r0){const s='eye.'+side,r=r0*P[s+'.size']*P['eye.scale'],sg=side==='L'?1:-1;
 ctx.beginPath();ctx.arc(cx,cy,r+6,0,TAU);ctx.fillStyle=A.skinDD;ctx.fill();
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.clip();ctx.drawImage(EYEKIT.ball,cx-r,cy-r,2*r,2*r);
 const ix=cx+P['gaze.x']*r*0.5,iy=cy+P['gaze.y']*r*0.45,ir=r*0.36;ctx.drawImage(EYEKIT.iris,ix-ir,iy-ir,2*ir,2*ir);
 ctx.beginPath();ctx.arc(ix,iy,ir*0.55*P['pupil.size'],0,TAU);ctx.fillStyle=A.pupil;ctx.fill();
 ctx.beginPath();ctx.arc(cx-r*0.32,cy-r*0.36,r*0.12,0,TAU);ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fill();
 const openU=P[s+'.openU'],lidY=lerp(cy+r*0.15,cy-r,openU);
 ctx.save();ctx.translate(cx,lidY);ctx.rotate(P[s+'.lidTilt']*0.35*sg);ctx.fillStyle=rgrad(ctx,0,-r,r*0.2,0,0,r*1.6,[[0,A.skin],[1,A.skinD]]);ctx.fillRect(-r*1.7,-r*3.4,r*3.4,r*3.4);ctx.strokeStyle=A.skinDD;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-r*1.2,0);ctx.lineTo(r*1.2,0);ctx.stroke();ctx.restore();
 const lowY=lerp(cy-r*0.1,cy+r,P[s+'.openL'])-P['eye.squint']*r*0.5;ctx.fillStyle=A.skin;ctx.fillRect(cx-r*1.7,lowY,r*3.4,r*3.4);ctx.strokeStyle=A.skinDD;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(cx-r*1.2,lowY);ctx.lineTo(cx+r*1.2,lowY);ctx.stroke();
 ctx.restore();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);edge(ctx,2);}

node({id:'standin-body',parent:'w-root',z:15,kind:'raster',pivot:[500,1560],draw(){}});
node({id:'standin-hat',parent:'w-hat',z:81.5,kind:'raster',pivot:[500,395],draw(){}});
const DRAWLIST=NODES.filter(n=>n.draw).sort((a,b)=>(a.z||0)-(b.z||0));
function dynZ(n,P){if(n.id.startsWith('w-arm-')||n.id.startsWith('w-hand-')||n.id==='w-flask'){const s=n.id.includes('-L')||n.id==='w-hand-L'?'L':'R';return P['arm.'+s+'.shoulder']>55?(n.z||0)+80:(n.z||0);}return n.z||0;}
function sortedDrawList(P){return DRAWLIST.slice().sort((a,b)=>dynZ(a,P)-dynZ(b,P));}
function rigUpdate(P){for(const n of NODES){const o=n.pose?n.pose(P):{};const L=mlocal(n.pivot,o);n.world=n.parent?mmul(NODE[n.parent].world,L):L;}}
function worldPoint(id,x,y){const n=NODE[id];return mpt(n.world,x==null?n.pivot[0]:x,y==null?n.pivot[1]:y);}

// ---------- anim: layers ----------
const MOODS={
 neutral:{talkStyle:'normal',gaze:'wander',fn(t,o){o['body.breath']=0.5+0.5*Math.sin(t*TAU*0.25);o['head.rot']=1.5*Math.sin(t*TAU/7);}},
 happy:{talkStyle:'grin',gaze:'wander',fn(t,o,st){o['body.breath']=0.5+0.5*Math.sin(t*TAU*0.35);o['eye.squint']=0.35;o['brow.L.raise']=0.3;o['brow.R.raise']=0.3;o['head.rot']=4+1.5*Math.sin(t*TAU/5);if(st.next==null||t>st.next){st.big=!st.big;st.next=t+3+rng()*2;}o['mouth.shape']=st.big?'grin-open':'grin';}},
 suspicious:{talkStyle:'normal',gaze:'sweep',fn(t,o){o['eye.L.openU']=0.45;o['eye.R.openU']=0.45;o['eye.L.lidTilt']=0.6;o['eye.R.lidTilt']=0.6;o['brow.L.raise']=-0.5;o['brow.R.raise']=0.4;o['brow.L.angle']=-12;o['brow.R.angle']=10;o['mouth.shape']='hmm';o['head.x']=12;o['head.rot']=-3;o['body.breath']=0.5+0.5*Math.sin(t*TAU*0.2);}},
 scared:{talkStyle:'shaky',gaze:'dart',fn(t,o){o['eye.L.openU']=1;o['eye.R.openU']=1;o['pupil.size']=0.7;o['brow.L.raise']=0.6;o['brow.R.raise']=0.6;o['brow.L.angle']=-15;o['brow.R.angle']=-15;o['mouth.shape']='scared';const tr=Math.sin(t*TAU*9);o['head.rot']=0.8*tr;o['body.x']=3*tr;o['hat.lift']=10;o['arm.L.shoulder']=40;o['arm.R.shoulder']=40;o['hand.L.pose']='splayed';o['body.breath']=0.5+0.5*Math.sin(t*TAU*0.6);}},
};
function sweepFn(u,e,o,st){const seg=Math.floor(e/1.5),s=(e%1.5)/1.5,w=Math.sin(s*TAU),h=0.5-0.5*Math.cos(s*TAU);st.seg=seg;
 switch(seg){case 0:o['head.rot']=22*w;break;case 1:o['head.yaw']=w;o['head.pitch']=0.6*Math.sin(s*TAU*2);break;
 case 2:o['mouth.shape']='laugh';o['jaw.scale']=h;break;case 3:o['arm.L.shoulder']=140*h;o['arm.R.shoulder']=140*h;o['arm.L.elbow']=-100*h;o['arm.R.elbow']=-15-70*h;o['hand.L.pose']='open';break;
 case 4:o['leg.L.rot']=30*w;o['leg.R.rot']=-30*w;o['body.hover']=Math.abs(w)*0.6;break;case 5:o['hat.squash']=0.3*w;o['hat.lift']=60*Math.abs(w);o['body.squash']=0.5*w;break;
 case 6:o['brow.L.raise']=w;o['brow.R.raise']=-w;o['brow.L.angle']=25*w;o['brow.R.angle']=25*w;o['eye.L.openU']=0.5+0.5*w;o['eye.R.openU']=0.5-0.5*w;o['eye.squint']=h;break;
 case 7:o['body.hunch']=h;break;}}
const ACTIONS={
 fidget:{priority:5,duration:0.6,interruptibleAfter:0,fn(u,e,o){o['nose.rot']=6*Math.sin(u*TAU*2);}},
 surprised:{priority:30,duration:0.9,interruptibleAfter:0.3,locks:{blink:true},talkStyle:'wide',snap:true,fn(u,e,o){const b=Math.min(1,e/0.08);o['head.y']=-25*b;o['head.rot']=-3*b;o['eye.scale']=1.15;o['pupil.size']=0.75;o['eye.L.openU']=1;o['eye.R.openU']=1;o['brow.L.raise']=1;o['brow.R.raise']=1;o['mouth.shape']='surprise';o['hat.lift']=(ART.on?12:30)*Math.max(0,Math.sin(Math.min(1,e/0.35)*Math.PI));o['body.squash']=-0.1*b;}},
 laughing:{priority:40,duration:1.8,interruptibleAfter:0.6,locks:{mouth:true},fn(u,e,o){const dec=1-u*0.6,sh=Math.sin(e*TAU*6)*dec;o['head.rot']=-8+2*sh;o['head.pitch']=-0.4;o['eye.L.openU']=0.15;o['eye.R.openU']=0.15;o['eye.squint']=1;o['brow.L.raise']=0.8;o['brow.R.raise']=0.8;o['mouth.shape']='laugh';o['body.rot']=1.5*sh;o['body.squash']=0.12*Math.abs(sh);o['head.x']=6*sh;o['arm.L.shoulder']=20+10*sh;}},
 magic:{priority:50,duration:2.4,interruptibleAfter:1.2,locks:{gaze:true},talkStyle:'wide',fn(u,e,o){const ant=e<0.2?e/0.2:Math.max(0,1-(e-0.2)/0.3);o['body.squash']=0.3*ant-0.08*(1-ant);const up=easeOut(clamp((e-0.15)/0.5,0,1));o['arm.R.shoulder']=8+112*up;o['arm.R.elbow']=-15-55*up;o['arm.L.shoulder']=35*up;o['hand.L.pose']='casting';o['flask.glow']=up;o['body.hover']=0.4*up;o['gaze.x']=0.55*up;o['gaze.y']=-0.7*up;o['head.rot']=-6*up;o['brow.L.raise']=0.9;o['brow.R.raise']=0.9;o['mouth.shape']=e<0.6?'talk-wide-o':'excited';o['eye.scale']=1.08;}},
 celebrating:{priority:60,duration:3,interruptibleAfter:1,locks:{gaze:true},talkStyle:'grin',fn(u,e,o){const b=e<1.6?Math.abs(Math.sin(e*TAU*0.66)):0;o['body.y']=-90*b;o['body.squash']=e<1.6?-0.25*b+0.15*(1-b):0;o['arm.L.shoulder']=150;o['arm.R.shoulder']=150;o['arm.L.elbow']=-20;o['arm.R.elbow']=-20;o['hand.L.pose']='open';o['hand.R.pose']='open';o['mouth.shape']='excited';o['gaze.x']=0;o['gaze.y']=0.1;o['brow.L.raise']=0.9;o['brow.R.raise']=0.9;o['head.rot']=5*Math.sin(e*TAU*1.3);o['fx.stars']=e<2?1:0;o['eye.squint']=0.3;}},
 hop:{priority:35,duration:0.9,interruptibleAfter:0.3,fn(u,e,o){const a=u<0.2?u/0.2:0,air=u>0.2&&u<0.78?Math.sin((u-0.2)/0.58*Math.PI):0,land=u>=0.78?Math.sin((u-0.78)/0.22*Math.PI):0;o['body.squash']=0.28*a*(1-0.1*a)-0.2*air+0.22*land;o['body.y']=-80*air;o['arm.L.shoulder']=20+70*air;o['arm.R.shoulder']=14+40*air;o['hat.lift']=22*air;o['eye.scale']=1.1;o['brow.L.raise']=0.8*air;o['brow.R.raise']=0.8*air;o['head.pitch']=-0.2*air;}},
 point:{priority:35,duration:1.15,interruptibleAfter:0.3,fn(u,e,o){const k=Math.sin(Math.PI*Math.min(1,u*1.05)),j=Math.sin(e*TAU*3)*k;o['arm.L.shoulder']=105*k;o['arm.L.elbow']=-8*k;o['hand.L.pose']='open';o['body.rot']=-3*k;o['head.pitch']=0.25*k;o['head.y']=8*k;o['brow.L.angle']=14*k;o['brow.R.angle']=14*k;o['brow.L.raise']=0.3*k;o['body.squash']=0.06*k+0.05*j;o['head.rot']=-4*k+2*j;}},
 flourish:{priority:35,duration:1.7,interruptibleAfter:0.4,fn(u,e,o){const k=Math.sin(Math.PI*Math.min(1,u*1.02)),w=Math.sin(e*TAU*0.9);o['arm.L.shoulder']=115*k;o['arm.R.shoulder']=8+105*k;o['arm.L.elbow']=-15*k;o['arm.R.elbow']=-15-10*k;o['hand.L.pose']='open';o['hand.R.pose']='open';o['body.rot']=5*w*k;o['body.y']=-16*k;o['head.pitch']=-0.3*k;o['head.rot']=6*w*k;o['hat.lift']=18*k;o['flask.glow']=k;o['fx.stars']=k>0.5?1:0;o['brow.L.raise']=0.7*k;o['brow.R.raise']=0.7*k;o['mouth.shape']=o['mouth.shape'];}},
 wobble:{priority:35,duration:1.5,interruptibleAfter:0.4,fn(u,e,o){const k=Math.sin(Math.PI*u),w=Math.sin(e*TAU*1.6);o['body.hunch']=0.5+0.5*k;o['body.rot']=7*w*k;o['body.x']=10*w*k;o['arm.L.shoulder']=-25*k;o['arm.L.elbow']=-70*k;o['arm.R.shoulder']=8+25*k*Math.abs(w);o['head.rot']=-9*w*k;o['head.pitch']=0.15*k;o['brow.L.angle']=-14*k;o['brow.R.angle']=-14*k;o['brow.L.raise']=0.5*k;o['brow.R.raise']=0.5*k;o['leg.R.rot']=4*w*k;}},
 sweep:{priority:100,duration:12,interruptibleAfter:0,locks:{mouth:true,gaze:true,blink:true},fn:sweepFn},
};
const TALK_SETS={
 normal:{closed:'talk-m',low:['talk-e','talk-m'],mid:['talk-e','talk-a'],high:['talk-a','talk-o']},
 wide:{closed:'talk-m',low:['talk-e'],mid:['talk-a','talk-wide-o'],high:['talk-wide-a','talk-wide-o']},
 grin:{closed:'grin',low:['grin','talk-e'],mid:['talk-e','grin-open'],high:['grin-open','excited']},
 shaky:{closed:'scared',low:['scared','scared-talk'],mid:['scared-talk','talk-e'],high:['scared-talk','talk-a']},
};
class Spring{constructor(k,d){this.k=k;this.d=d;this.x=0;this.v=0;}update(dt,target){const a=this.k*(target-this.x)-this.d*this.v;this.v+=a*dt;this.x+=this.v*dt;return this.x;}}

class Animator{
 constructor(){this.t=0;this.mood='neutral';this.prevMood=null;this.moodT=1;this.moodState={};this.action=null;this.queue=null;this.fading=[];this.snapUntil=0;this.speech=null;this.S=defaults();
  this.gaze={mode:'auto',tx:0,ty:0.1,cx:0,cy:0,next:0};this.blink={next:2,phase:false,t0:0,amount:0,queued:false};this.nextFidget=8;
  this.sp={hat:new Spring(120,10),charm:new Spring(90,7),hairL:new Spring(80,8),hairR:new Spring(80,8),nose:new Spring(160,12),shawl:new Spring(60,8),skirt:new Spring(40,7),leg:new Spring(50,6)};
  this.pins={};this.events=[];this.spam=null;}
 log(s,bad){this.events.push({t:this.t,s,bad});if(this.events.length>200)this.events.shift();}
 setMood(m){if(!MOODS[m]||m===this.mood)return;this.prevMood=this.mood;this.mood=m;this.moodT=0;this.log('mood → '+m);}
 play(id,opts={}){const def=ACTIONS[id];return new Promise(res=>{if(!def){res({status:'rejected',reason:'unknown'});return;}
  const cur=this.action,start=()=>{if(cur)this.interrupt();this.action={id,def,elapsed:0,res,st:{},snap:{}};if(def.snap)this.snapUntil=this.t+0.05;this.log('action start '+id);};
  if(!cur)start();else if(def.priority>cur.def.priority){if(cur.elapsed>=cur.def.interruptibleAfter||opts.force)start();else{this.log('action '+id+' rejected (current not yet interruptible)');res({status:'rejected',reason:'not-interruptible'});}}
  else if(def.priority===cur.def.priority)start();
  else{if(opts.queue){if(this.queue)this.queue.res({status:'rejected',reason:'replaced'});this.queue={id,opts,res};this.log('action '+id+' queued');}else{this.log('action '+id+' rejected (lower priority than '+cur.id+')');res({status:'rejected',reason:'priority'});}}});}
 interrupt(){const a=this.action;if(!a)return;this.fading.push({snap:a.snap,w0:a.w||0,age:0,dur:0.15});a.res({status:'interrupted'});this.log('action '+a.id+' interrupted');this.action=null;}
 finish(){const a=this.action;a.res({status:'completed'});this.log('action '+a.id+' completed → mood '+this.mood);this.action=null;if(this.queue){const q=this.queue;this.queue=null;this.play(q.id,q.opts).then(q.res);}}
 say(dur,style){if(this.speech)this.speech.res({status:'interrupted'});const env=new Float32Array(Math.ceil(dur*100));let t=0.1;while(t<dur){const amp=0.4+rng()*0.6,w=0.13;for(let i=Math.max(0,Math.floor((t-w)*100));i<Math.min(env.length,Math.ceil((t+w)*100));i++){const d=(i/100-t)/w;env[i]=Math.max(env[i],amp*0.5*(1+Math.cos(d*Math.PI)));}t+=0.18+rng()*0.1;if(rng()<0.22)t+=0.3;}
  return new Promise(res=>{this.speech={env,dur,t:0,style,lastTick:-1,shape:null,prevOpen:null,emph:0,lastPeak:-1,pv:0,res};this.log('speech start ('+dur.toFixed(1)+'s)');});}
 stopSpeaking(){if(this.speech){this.speech.res({status:'stopped'});this.speech=null;this.log('speech stopped');}}
 triggerBlink(){if(!this.blink.phase)this.blink.next=this.t;else this.blink.queued=true;}
 lookAt(mode,p){this.gaze.mode=mode;if(p)this.gaze.point=p;this.gaze.next=0;this.log('gaze '+mode);}
 applyLayer(out,tmp,w){for(const k in tmp){const v=tmp[k];if(k[0]==='+')out[k.slice(1)]+=v*w;else if(typeof v==='number')out[k]=lerp(out[k],v,w);else if(w>0.5)out[k]=v;}}
 update(dt){this.t+=dt;const t=this.t,out=defaults();
  // mood (crossfade)
  this.moodT=Math.min(1,this.moodT+dt/0.25);
  const ms=id=>(this.moodState[id]||(this.moodState[id]={}));
  if(this.prevMood&&this.moodT<1){const A=defaults(),B=defaults();MOODS[this.prevMood].fn(t,A,ms(this.prevMood));MOODS[this.mood].fn(t,B,ms(this.mood));const w=easeIO(this.moodT);for(const k in out)out[k]=typeof A[k]==='number'?lerp(A[k],B[k],w):(w>0.5?B[k]:A[k]);}
  else MOODS[this.mood].fn(t,out,ms(this.mood));
  // idle fidget scheduling
  if(this.mood==='neutral'&&!this.action&&!this.speech&&t>this.nextFidget){this.nextFidget=t+10+rng()*10;this.play('fidget');}
  // fading interrupted actions
  this.fading=this.fading.filter(f=>{f.age+=dt;if(f.age>=f.dur)return false;this.applyLayer(out,f.snap,f.w0*(1-f.age/f.dur));return true;});
  // action
  const a=this.action;let locks={};
  if(a){a.elapsed+=dt;const d=a.def,e=a.elapsed;if(e>=d.duration){this.finish();}else{const w=Math.min(easeIO(clamp(e/(d.blendIn||0.15),0,1)),easeIO(clamp((d.duration-e)/(d.blendOut||0.2),0,1)));a.w=w;const tmp={};d.fn(e/d.duration,e,tmp,a.st);a.snap=tmp;this.applyLayer(out,tmp,w);locks=d.locks||{};}}
  const act=this.action;
  // speech overlay
  const sp=this.speech;
  if(sp){if(sp.clock)sp.t=Math.max(0,sp.clock());else sp.t+=dt;if(sp.clock&&cueTrack){cueTrack.cues.forEach((c,i)=>{if(c.t!=null&&!sp.fired.has(i)&&sp.t>=c.t){sp.fired.add(i);runCue(c);}});}
   if(sp.t>=sp.dur){sp.res({status:'completed'});this.speech=null;this.log('speech completed');}
   else{const style=(act&&act.def.talkStyle)||sp.style||MOODS[this.mood].talkStyle;const set=TALK_SETS[style]||TALK_SETS.normal;const lv=sp.env[Math.min(sp.env.length-1,Math.floor(sp.t*100))];
    const tick=style==='shaky'?0.09+(rng()-0.5)*0.06:0.09;
    if(sp.t-sp.lastTick>=tick){sp.lastTick=sp.t;let ns;if(lv<0.08)ns=set.closed;else{const arr=lv<0.35?set.low:lv<0.7?set.mid:set.high;const c=arr.filter(s=>s!==sp.prevOpen);ns=c[Math.floor(rng()*c.length)]||arr[0];sp.prevOpen=ns;}sp.shape=ns;}
    if(lv-sp.pv>0.35&&sp.t-sp.lastPeak>0.35){sp.lastPeak=sp.t;sp.emph=1;}sp.pv=lerp(sp.pv,lv,0.5);sp.emph=Math.max(0,sp.emph-dt/0.25);
    if(!locks.mouth){out['mouth.shape']=sp.shape||set.closed;out['mouth.open']=lv;out['jaw.scale']=0.5+0.5*lv;}
    out['head.rot']+=-2*sp.emph;out['brow.L.raise']+=0.25*sp.emph;out['brow.R.raise']+=0.25*sp.emph;}}
  // ---- liveliness: continuous cartoon secondary motion + random idle gags (additive; calmer while a scripted action runs) ----
  {const amp=(this.action?0.35:1)*(this.live==null?1:this.live)*(this.big?1.7:1),sp3=this.speech,lvl=sp3?clamp(sp3.pv*1.6,0,1):0,em=sp3?sp3.emph:0,st=sp3?sp3.t:t,sn=(f,ph)=>Math.sin(t*f+(ph||0)),pos=x=>x>0?x:0;
   if(this.big&&sp3){if(em>0.9&&(this.lastEm||0)<=0.9&&!this.action)this.hopT=0;this.lastEm=em;}else this.lastEm=0;
   if(this.hopT!=null){this.hopT+=dt;const hu=this.hopT/0.42;if(hu>=1)this.hopT=null;else{const hs=Math.sin(Math.PI*hu);out['body.y']+=-48*hs;out['body.squash']+=-0.1*hs+(hu>0.85?0.12:0);out['arm.L.shoulder']+=34*hs;out['arm.R.shoulder']+=22*hs;out['hat.lift']+=12*hs;}}
   out['body.rot']+=amp*(1.5*sn(0.7,2)+0.5*sn(1.9));out['body.x']+=amp*3*sn(0.55);out['body.y']+=amp*2.5*sn(1.6);
   out['body.squash']+=amp*(0.03*sn(2.4)+em*0.12);out['body.hunch']+=amp*0.06*sn(0.8);
   out['head.rot']+=amp*(2.4*sn(0.9)+1*sn(2.1,1))+(sp3?4*Math.sin(st*4.1)*lvl+(-3)*em:0);
   out['head.x']+=amp*(4*sn(0.7,1)+(sp3?5*Math.sin(st*2.6)*lvl:0));out['head.y']+=amp*3*sn(1.5)+(sp3?-12*em+3*lvl*Math.sin(st*7):0);
   out['head.pitch']+=amp*0.1*sn(0.6,1)+(sp3?0.18*Math.sin(st*3.3)*lvl:0);out['head.yaw']+=amp*0.1*sn(0.45);
   out['brow.L.raise']+=amp*0.3*Math.pow(pos(sn(0.9)),3)+(sp3?0.3*lvl*pos(Math.sin(st*5.3)):0);out['brow.R.raise']+=amp*0.3*Math.pow(pos(sn(1.1,2)),3)+(sp3?0.3*lvl*pos(Math.sin(st*4.7+1)):0);
   out['brow.L.angle']+=amp*3*sn(0.8,1);out['brow.R.angle']+=amp*3*sn(0.7,3);
   out['nose.rot']+=amp*(1.4*sn(3.1)+7*Math.pow(pos(sn(0.33)),10)*sn(19));
   out['arm.L.shoulder']+=amp*(5*sn(0.9,1)+4*sn(2.3))+(sp3?28*lvl*(0.5+0.5*Math.sin(st*2.3)):0);out['arm.L.elbow']+=amp*4*sn(1.1)+(sp3?-18*lvl*(0.5+0.5*Math.sin(st*2.3+1)):0);
   out['arm.R.shoulder']+=amp*(3*sn(0.8)+2*sn(2.7))+(sp3?9*lvl*Math.sin(st*2.9):0);out['arm.R.elbow']+=amp*3*sn(1.3,2);
   out['hat.lift']+=amp*3*pos(sn(1.2))+8*em;out['hat.squash']+=amp*0.012*sn(1.4)-0.045*em;
   const tap=clamp((sn(0.22)-0.5)*4,0,1);out['leg.L.rot']+=amp*(tap*7*pos(Math.sin(t*7.5)));out['leg.R.rot']+=amp*(2*sn(0.5)+tap*0);
   out['flask.glow']+=amp*0.5*Math.pow(pos(sn(0.45)),2);
   out['eye.L.size']+=amp*0.015*sn(1.7);out['eye.R.size']+=amp*0.015*sn(1.7,1);
   // random idle gags: only when nothing scripted is happening
   const g=this.gag;
   if(!g&&!this.action&&!sp3&&(this.mood==='neutral'||this.mood==='happy')&&t>=(this.nextGag==null?(this.nextGag=t+4):this.nextGag)){const ids=['doubletake','shiver','hop','hatwiggle','sniff','shrug','peek'];let id;do{id=ids[Math.floor(rng()*ids.length)];}while(id===this.lastGag);this.lastGag=id;this.gag={id,t0:t,dur:{doubletake:1.5,shiver:1.0,hop:0.8,hatwiggle:1.3,sniff:1.3,shrug:1.2,peek:1.8}[id]};this.nextGag=t+5+rng()*5;this.log('gag '+id);}
   const G=this.gag;if(G){if(this.action||sp3){this.gag=null;}else{const u=(t-G.t0)/G.dur;if(u>=1)this.gag=null;else{const e=Math.sin(Math.PI*u),w=Math.sin(u*TAU);
    if(G.id==='doubletake'){out['head.rot']+=-7*e*(u<0.5?1:-0.6)*1;out['head.yaw']+=(u<0.4?-0.5:0.5)*e;out['eye.scale']=lerp(out['eye.scale'],1.12,e);out['brow.L.raise']+=e;out['brow.R.raise']+=e;out['head.y']+=-14*e;}
    else if(G.id==='shiver'){const sh=e*Math.sin(t*55);out['head.x']+=4*sh;out['body.rot']+=1.5*sh;out['brow.L.angle']+=8*e;out['brow.R.angle']+=8*e;out['arm.L.shoulder']+=6*sh;}
    else if(G.id==='hop'){const a=u<0.2?u/0.2:0;out['body.squash']+=0.25*a*(1-a*0.2)+(u>0.75?0.2*Math.sin((u-0.75)/0.25*Math.PI):0)-0.18*(u>0.2&&u<0.75?e:0);out['body.y']+=-45*(u>0.2&&u<0.8?Math.sin((u-0.2)/0.6*Math.PI):0);out['arm.L.shoulder']+=30*e;out['arm.R.shoulder']+=18*e;out['hat.lift']+=10*e;}
    else if(G.id==='hatwiggle'){out['hat.lift']+=16*e;out['hat.squash']+=0.05*Math.sin(u*TAU*3)*e;out['head.rot']+=3*Math.sin(u*TAU*2)*e;out['brow.L.raise']+=0.6*e;out['brow.R.raise']+=0.6*e;}
    else if(G.id==='sniff'){out['nose.rot']+=9*Math.sin(u*TAU*4)*e;out['head.pitch']+=-0.35*e;out['head.y']+=-6*e;out['body.squash']+=-0.05*e*Math.abs(Math.sin(u*TAU*2));}
    else if(G.id==='shrug'){out['arm.L.shoulder']+=20*e;out['arm.R.shoulder']+=12*e;out['head.rot']+=6*e;out['brow.L.raise']+=0.7*e;out['brow.R.raise']+=0.2*e;out['body.hunch']+=-0.2*e;out['body.y']+=-10*e;}
    else if(G.id==='peek'){out['head.yaw']+=0.9*Math.sin(u*TAU)*(u<0.5?1:1);out['head.rot']+=-5*Math.sin(u*TAU);out['brow.L.angle']+=-10*e;out['brow.R.angle']+=-10*e;out['eye.squint']=lerp(out['eye.squint'],0.5,e);}
   }}}
  }
  for(const p in this.pins)if(p in out)out[p]=this.pins[p];
  // jaw derived from mouth shape
  out['jaw.drop']=(MOUTH[out['mouth.shape']]||MOUTH.neutral).jaw*out['jaw.scale'];
  // gaze overlay
  if(!locks.gaze){const g=this.gaze,mode=g.mode==='auto'?MOODS[this.mood].gaze:g.mode;
   if(mode==='wander'){if(t>=g.next){g.next=t+1.5+rng()*2.5;if(rng()<0.6){g.tx=(rng()-0.5)*0.6;g.ty=0.1+(rng()-0.5)*0.4;}else{g.tx=(rng()-0.5)*1.8;g.ty=(rng()-0.5)*1.4;}}}
   else if(mode==='dart'){if(t>=g.next){g.next=t+0.4;g.tx=(rng()-0.5)*1.8;g.ty=(rng()-0.5)*1.2;}}
   else if(mode==='sweep'){g.tx=0.8*Math.sin(t*TAU/6);g.ty=0.1;}
   else if(mode==='player'){g.tx=0;g.ty=0.1;}else if(mode==='left'){g.tx=-1;g.ty=0;}else if(mode==='right'){g.tx=1;g.ty=0;}else if(mode==='up'){g.tx=0;g.ty=-1;}else if(mode==='down'){g.tx=0;g.ty=1;}
   else if(mode==='point'&&g.point){g.tx=g.point[0];g.ty=g.point[1];}
   const k=Math.min(1,dt/0.08);g.cx+=(g.tx-g.cx)*k;g.cy+=(g.ty-g.cy)*k;out['gaze.x']=g.cx;out['gaze.y']=g.cy;out['head.yaw']+=0.35*g.cx;out['head.pitch']+=0.3*g.cy;}
  // smoothing follower
  const S=this.S,tau=this.snapUntil>t?0.004:0.06,k=1-Math.exp(-dt/tau);
  for(const p in PARAMS){if(SPRING_OUT.has(p))continue;S[p]=lerp(S[p],clamp(out[p],PARAMS[p][1],PARAMS[p][2]),k);}
  for(const p in ENUMS)S[p]=out[p];
  // blink (multiplicative, after smoothing)
  const b=this.blink;if(!b.phase&&t>=b.next){b.phase=true;b.t0=t;}
  if(b.phase){const e=t-b.t0;b.amount=e<0.06?e/0.06:e<0.10?1:e<0.20?1-(e-0.10)/0.10:0;if(e>=0.20){b.phase=false;b.amount=0;const dbl=b.queued||rng()<0.15;b.queued=false;b.next=t+(dbl?0.25:2+rng()*4);}}
  const bl=(locks.blink||S['eye.L.openU']<0.2)?0:b.amount;
  S['eye.L.openU']*=1-bl;S['eye.R.openU']*=1-bl;S['eye.L.openL']*=1-0.3*bl;S['eye.R.openL']*=1-0.3*bl;
  // secondary springs (follow-through lag)
  const sp2=this.sp,hs=S['head.rot']+S['head.x']*0.15;
  S['hatTip.rot']=clamp((sp2.hat.update(dt,hs)-hs)*1.2,-40,40);
  S['charm.rot']=clamp((sp2.charm.update(dt,S['hatTip.rot']+hs)-(S['hatTip.rot']+hs))*1.5,-60,60);
  const hh=S['head.rot']+S['head.x']*0.2;S['hair.L.rot']=clamp((sp2.hairL.update(dt,hh)-hh)*0.8,-20,20);S['hair.R.rot']=S['hair.L.rot'];
  const nh=S['head.y']*0.2+S['head.rot'];S['nose.jiggle']=clamp((sp2.nose.update(dt,nh)-nh)*0.4,-10,10);
  const bs=S['body.rot']+S['body.x']*0.1;S['shawl.rot']=clamp((sp2.shawl.update(dt,bs)-bs)*0.5,-10,10);S['skirt.rot']=clamp((sp2.skirt.update(dt,S['body.rot'])-S['body.rot'])*0.6,-10,10);
  const ls=S['body.x']*0.15+S['body.rot'];S['leg.lag']=clamp((sp2.leg.update(dt,ls)-ls)*0.8,-20,20);
  // pins (debug overrides)
  for(const p in this.pins)S[p]=this.pins[p];
  // spam test
  if(this.spam){const sm=this.spam;if(t<sm.until){if(t>=sm.nextAt){sm.nextAt=t+0.1;const r=rng();if(r<0.25)this.setMood(['neutral','happy','suspicious','scared'][Math.floor(rng()*4)]);else if(r<0.7)this.play(['surprised','laughing','magic','celebrating'][Math.floor(rng()*4)]);else if(r<0.85)this.triggerBlink();else this.lookAt(['wander','left','right','player'][Math.floor(rng()*4)]);sm.n++;}}
   else if(t>=sm.until+3.5){const ok=!this.action&&!sm.nan;this.log('SPAM TEST '+(ok?'PASS':'FAIL')+': '+sm.n+' requests, action='+(this.action?this.action.id:'none')+', NaN='+sm.nan,!ok);this.spam=null;}
   for(const p in PARAMS)if(Number.isNaN(S[p]))sm.nan=true;}
  return S;}
}

// ---------- fx particles ----------
const FX=[];function emit(x,y,kind){if(FX.length>60)FX.shift();FX.push({x,y,vx:(rng()-0.5)*(kind==='star'?260:60),vy:kind==='star'?-200-rng()*160:-60-rng()*80,age:0,life:0.9+rng()*0.6,kind});}
function fxUpdate(dt,P){if(P['flask.glow']>0.3&&rng()<P['flask.glow']*0.6){const [x,y]=worldPoint('w-flask-mouth');emit(x,y,'bubble');}
 if(P['fx.stars']>0.5&&rng()<0.5){const [x,y]=worldPoint('w-head',500,585);emit(x+(rng()-0.5)*500,y+(rng()-0.5)*200,'star');}
 for(let i=FX.length-1;i>=0;i--){const f=FX[i];f.age+=dt;if(f.age>f.life){FX.splice(i,1);continue;}f.x+=f.vx*dt;f.y+=f.vy*dt;if(f.kind==='star')f.vy+=400*dt;}}
function fxDraw(ctx){for(const f of FX){const a=1-f.age/f.life;ctx.globalAlpha=a;if(f.kind==='bubble'){ctx.fillStyle=C.flask;ctx.beginPath();ctx.arc(f.x,f.y,8+f.age*10,0,TAU);ctx.fill();}else{ctx.fillStyle='#ffd866';ctx.beginPath();for(let i=0;i<5;i++){const A=i*TAU/5-Math.PI/2,r=14;ctx.lineTo(f.x+Math.cos(A)*r,f.y+Math.sin(A)*r);ctx.lineTo(f.x+Math.cos(A+TAU/10)*r*0.45,f.y+Math.sin(A+TAU/10)*r*0.45);}ctx.closePath();ctx.fill();}}ctx.globalAlpha=1;}

const CUE_DRAFTS={}; // filled by loadCues() from assets/cues/*.json
// ===== Cue editor + real-audio speech (Phase 4 preview) =====
let actx=null,cueBuf=null,cueSrc=null,cueStart=0,cueOffset=0,cuePlaying=false,cueTrack=null,cueName='',cueIdx=0,cueEnv=null;
function envFromBuffer(buf){const ch=buf.getChannelData(0),sr=buf.sampleRate,win=Math.round(sr*0.01),n=Math.ceil(ch.length/win),e=new Float32Array(n);
 for(let i=0;i<n;i++){let s=0,c=0;for(let j=i*win;j<Math.min(ch.length,(i+1)*win);j++){s+=ch[j]*ch[j];c++;}e[i]=Math.sqrt(s/Math.max(1,c));}
 const sorted=Array.from(e).sort((a,b)=>a-b),p95=sorted[Math.floor(sorted.length*0.95)]||1;for(let i=0;i<n;i++)e[i]=Math.min(1,e[i]/p95);
 let v=0;for(let i=0;i<n;i++){const k=e[i]>v?0.45:0.12;v+=(e[i]-v)*k;e[i]=v;}return e;}
function cueClock(){if(!actx)return 0;return cuePlaying?actx.currentTime-cueStart+cueOffset-(actx.outputLatency||actx.baseLatency||0):cueOffset;}
function runCue(c){const [kind,arg]=(c.do||'').split(':');if(kind==='mood')anim.setMood(arg);else if(kind==='play')anim.play(arg);else if(kind==='look')anim.lookAt(arg==='scanner'?'down':arg);else if(kind==='hunt'||kind==='sfx')anim.log('cue '+c.do+' (hunt hook)');}
function cueLoadFile(file){if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();
 return file.arrayBuffer().then(ab=>actx.decodeAudioData(ab)).then(buf=>{cueBuf=buf;cueEnv=envFromBuffer(buf);cueStop();cueOffset=0;anim.log('audio loaded: '+file.name+' '+buf.duration.toFixed(2)+'s');
  const base=file.name.replace(/\.[^.]+$/,'');if(CUE_DRAFTS[base]&&!cueTrack)cueSelect(base);cueRender();});}
function cueSelect(name){cueName=name;cueTrack=JSON.parse(JSON.stringify(CUE_DRAFTS[name]||{clip:name+'.mp3',mood:'neutral',cues:[]}));cueIdx=cueTrack.cues.findIndex(c=>c.t==null);if(cueIdx<0)cueIdx=cueTrack.cues.length;cueRender();}
function cuePlay(){if(!cueBuf)return;if(actx.state==='suspended')actx.resume();if(cuePlaying)return;cueSrc=actx.createBufferSource();cueSrc.buffer=cueBuf;cueSrc.connect(actx.destination);cueStart=actx.currentTime;cueSrc.start(0,cueOffset);cuePlaying=true;
 if(cueTrack)anim.setMood(cueTrack.mood||'neutral');
 anim.speech&&anim.speech.res({status:'interrupted'});const sp={env:cueEnv,dur:cueBuf.duration,t:cueOffset,style:null,lastTick:-1,shape:null,prevOpen:null,emph:0,lastPeak:-1,pv:0,clock:cueClock,res:()=>{},fired:new Set()};
 if(cueTrack)cueTrack.cues.forEach((c,i)=>{if(c.t!=null&&c.t<cueOffset)sp.fired.add(i);});anim.speech=sp;
 cueSrc.onended=()=>{if(cuePlaying){cueOffset=0;cuePlaying=false;anim.stopSpeaking();cueRender();}};anim.log('play '+(cueName||'clip'));cueRender();}
function cuePause(){if(!cuePlaying)return;cueOffset=cueClock();cueSrc.onended=null;try{cueSrc.stop();}catch(e){}cuePlaying=false;anim.stopSpeaking();cueRender();}
function cueStop(){if(cueSrc){cueSrc.onended=null;try{cueSrc.stop();}catch(e){}}cuePlaying=false;cueOffset=0;anim.stopSpeaking();cueRender();}
function cueStamp(){if(!cueTrack||cueIdx>=cueTrack.cues.length)return;const c=cueTrack.cues[cueIdx];c.t=Math.round(cueClock()*100)/100;runCue(c);anim.log('stamped "'+c.at+'" → '+c.do+' @ '+c.t+'s');cueIdx++;cueRender();}
function cueUndo(){if(!cueTrack||cueIdx===0)return;cueIdx--;cueTrack.cues[cueIdx].t=null;cueRender();}
function cueRender(){const el=document.getElementById('cuelist');if(!el)return;const t=cueClock();
 el.innerHTML=(cueTrack?cueTrack.cues.map((c,i)=>'<div class="cue'+(i===cueIdx?' cur':'')+(c.t!=null?' done':'')+'"><span>'+(c.t!=null?c.t.toFixed(2)+'s':'—')+'</span><span>'+c.at+'</span><span>'+c.do+'</span></div>').join(''):'<div class="small">Pick a line, load its recording, press Play, tap Stamp as each cue\'s words are spoken.</div>');
 document.getElementById('cuetime').textContent=(cueBuf?t.toFixed(2)+' / '+cueBuf.duration.toFixed(2)+'s':'no audio')+(cuePlaying?' ▶':'');
 document.getElementById('cuejson').value=cueTrack?JSON.stringify(cueTrack,null,1):'';}

let PAINTED=null; // loaded from assets/witch/witch.json by loadPaintedFrom()
// ===== Painted art: layer loading + rig re-fit to the master's anatomy =====
const ART={on:false,eyeL:[444,548,52],eyeR:[558,542,52],mouth:{x:500,top:642,scale:1},jawTravel:JAW_TRAVEL,closed:null,pieces:null};
function R(px,py){const S=LAYER_SPACE;return [S.ox+px/S.ppu,S.oy+py/S.ppu];}
function Ru(px){return px/LAYER_SPACE.ppu;}
async function loadPaintedFrom(base){const r=await fetch(base+'/witch.json');PAINTED=await r.json();PAINTED.data={};for(const n of Object.keys(PAINTED.manifest))PAINTED.data[n]=base+'/layers/'+n+'.png';return loadPainted();}
async function loadCues(base,names){await Promise.all(names.map(async n=>{try{const r=await fetch(base+'/'+n+'.cues.json');if(r.ok)CUE_DRAFTS[n]=await r.json();}catch(e){}}));}
async function loadPainted(){const bb=PAINTED.landmarks.figure_bbox;
 // phase 1: decode everything (no visible change yet)
 const names=Object.keys(PAINTED.manifest).filter(n=>PAINTED.data[n]);const imgs={};
 await Promise.all(names.map(n=>loadImg(PAINTED.data[n]).then(i=>{imgs[n]=i;}).catch(e=>{console.warn('layer failed',n,e);})));
 // phase 2: fit, install, re-fit — synchronously, so no frame mixes vector geometry with painted layers
 fitLayerSpace([bb[0],bb[1],bb[2],bb[3]],1240,1700);let n=0;
 for(const name of names){if(!imgs[name]||!name.startsWith('w-'))continue;const m=PAINTED.manifest[name];installRaster(name,imgs[name],{offset:[m.x,m.y]});n++;}
 const need=['mouth-interior','mouth-tongue','mouth-teeth-top','mouth-teeth-bottom','eye-L-ball','eye-R-ball','eye-iris'].filter(k=>!imgs[k]);
 if(need.length)throw new Error('missing kit pieces: '+need.join(','));
 MOUTHKIT.pieces={interior:imgs['mouth-interior'],tongue:imgs['mouth-tongue'],teethTop:imgs['mouth-teeth-top'],teethBottom:imgs['mouth-teeth-bottom']};MOUTHKIT.on=true;
 EYEKIT.ballL=imgs['eye-L-ball'];EYEKIT.ballR=imgs['eye-R-ball'];EYEKIT.iris=imgs['eye-iris'];EYEKIT.on=true;
 applyArtFit();JAWCOLS=null;ART.on=true;anim.log('painted layers: '+n+' installed, rig re-fitted');}
function applyArtFit(){const L=PAINTED.landmarks,set=(id,px)=>{if(NODE[id])NODE[id].pivot=R(px[0],px[1]);};
 set('w-root',[L.neck[0],L.ground]);set('w-body',L.waist);set('w-torso',L.waist);set('w-skirt',L.waist);set('w-shawl',[L.neck[0],L.neck[1]-20]);
 set('w-head',L.neck);set('w-head-base',[L.eyeL[0]+65,L.eyeL[1]+80]);set('w-jaw',[675,800]);set('w-mouth-back',L.jaw_hinge);set('w-mouth',L.jaw_hinge);set('w-nose',L.nose_bridge);
 set('w-brow-L',[L.eyeL[0],L.eyeL[1]-75]);set('w-brow-R',[L.eyeR[0],L.eyeR[1]-85]);set('w-eye-L',[L.eyeL[0],L.eyeL[1]]);set('w-eye-R',[L.eyeR[0],L.eyeR[1]]);
 set('w-cheek-L',[560,790]);set('w-cheek-R',[800,795]);set('w-hair-back-L',[520,640]);set('w-hair-back-R',[820,640]);set('w-ear-L',[470,700]);set('w-ear-R',[880,700]);set('w-hair-front',[660,580]);
 set('w-hat',L.hat_pivot);set('w-hat-tip',L.hat_bend);set('w-hat-charm',L.charm);
 set('w-arm-L-upper',L.shoulderL);set('w-arm-L-fore',L.elbowL);set('w-hand-L',L.wristL);set('w-arm-R-upper',L.shoulderR);set('w-arm-R-fore',L.elbowR);set('w-hand-R',L.wristR);set('w-flask',L.wristR);set('w-flask-mouth',L.flask_mouth);
 set('w-leg-L',L.kneeL);set('w-leg-R',L.kneeR);set('w-mount-frog',[470,990]);set('w-shadow',[L.neck[0],L.ground]);
 const eL=R(L.eyeL[0],L.eyeL[1]),eR=R(L.eyeR[0],L.eyeR[1]);ART.eyeL=[eL[0],eL[1],Ru(L.eyeL[2])];ART.eyeR=[eR[0],eR[1],Ru(L.eyeR[2])];
 const m=R(L.mouth.x,L.mouth.top);ART.mouth={x:m[0],top:m[1],scale:Ru(L.mouth.w)/230,cl:R(540,810),cr:R(775,822),mid:R(700,855),pts:PAINTED.lip.map(q=>R(q[0],q[1]))};ART.jawTravel=Ru(150);ART.lidCols={"L": {"mid": "#7a6947", "dark": "#554831", "light": "#a89379"}, "R": {"mid": "#796743", "dark": "#5c4d2f", "light": "#b3976d"}};const tt=PAINTED.manifest['mouth-teeth-top'];ART.toothRect=[...R(tt.x,tt.y),Ru(tt.w),Ru(tt.h)];
 Object.assign(A,PAINTED.skin);PARALLAX.x=24;PARALLAX.y=14;NODE['w-nose'].depth=0.55;NODE['w-eye-L'].depth=0.35;NODE['w-eye-R'].depth=0.35;NODE['w-brow-L'].depth=0.4;NODE['w-brow-R'].depth=0.4;NODE['w-mouth'].depth=0.3;NODE['w-jaw'].depth=0.25;}
// hands draw under the cuffs with painted art
function drawEyePainted(ctx,P,side,cx,cy,r0){const s='eye.'+side,r=r0*P[s+'.size']*P['eye.scale'],sg=side==='L'?1:-1,ball=side==='L'?EYEKIT.ballL:EYEKIT.ballR,HB=RASTER['w-head-base'];
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.clip();ctx.drawImage(ball,cx-r,cy-r,2*r,2*r);
 const ix=cx+P['gaze.x']*r*0.28,iy=cy+P['gaze.y']*r*0.26,ir=r*0.34;ctx.drawImage(EYEKIT.iris,ix-ir,iy-ir,2*ir,2*ir);
 ctx.beginPath();ctx.arc(ix,iy,ir*0.42*P['pupil.size'],0,TAU);ctx.fillStyle='#1a1414';ctx.fill();ctx.beginPath();ctx.arc(ix-ir*0.35,iy-ir*0.4,ir*0.18,0,TAU);ctx.fillStyle='rgba(255,255,255,0.85)';ctx.fill();
 // smooth lids in sampled skin tones (socket shadow at the lid edge → lighter outward), no texture to misread
 const LC=ART.lidCols&&ART.lidCols[side]||{mid:A.skin,dark:A.skinD,light:A.skinL};
 const openU=P[s+'.openU'],lidY=lerp(cy+r*0.42,cy-r,openU),lowY=lerp(cy-r*0.1,cy+r,P[s+'.openL'])-P['eye.squint']*r*0.5-Math.max(0,0.35-openU)*r*1.2;
 ctx.save();ctx.translate(cx,lidY);ctx.rotate(P[s+'.lidTilt']*0.35*sg);ctx.translate(-cx,-lidY);ctx.beginPath();ctx.ellipse(cx,lidY-r*1.25,r*1.75,r*1.25,0,0,TAU);ctx.clip();
 const gU=ctx.createLinearGradient(0,lidY-r*1.1,0,lidY);gU.addColorStop(0,LC.mid);gU.addColorStop(0.55,LC.mid);gU.addColorStop(1,LC.dark);ctx.fillStyle=gU;ctx.fillRect(cx-r*1.8,lidY-r*2.6,r*3.6,r*2.6);
 ctx.strokeStyle='rgba(25,18,12,0.35)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(cx,lidY-r*1.25,r*1.75,r*1.25,0,0,TAU);ctx.stroke();ctx.restore();
 if(lowY<cy+r){ctx.save();ctx.beginPath();ctx.ellipse(cx,lowY+r*1.25,r*1.75,r*1.25,0,0,TAU);ctx.clip();const gL=ctx.createLinearGradient(0,lowY,0,lowY+r*0.9);gL.addColorStop(0,LC.dark);gL.addColorStop(0.5,LC.mid);gL.addColorStop(1,LC.mid);ctx.fillStyle=gL;ctx.fillRect(cx-r*1.8,lowY,r*3.6,r*2.6);ctx.strokeStyle='rgba(25,18,12,0.3)';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(cx,lowY+r*1.25,r*1.75,r*1.25,0,0,TAU);ctx.stroke();ctx.restore();}
 ctx.restore();}
// Muppet jaw: the opening is simply the region between the fixed lip curve and the jaw's current top edge.
function lipPathPainted(ctx,Mo,extra){const P=Mo.pts,x0=P[0][0],x1=P[P.length-1][0],prof=x=>{const t=(x-x0)/(x1-x0);return Math.pow(Math.sin(Math.PI*Math.min(1,Math.max(0,t))),0.6);};
 ctx.beginPath();ctx.moveTo(P[0][0],P[0][1]);for(let i=1;i<P.length;i++)ctx.lineTo(P[i][0],P[i][1]);
 const N=24;for(let i=N;i>=0;i--){const x=x0+(x1-x0)*i/N;let y=P[0][1];for(let j=1;j<P.length;j++){if(x<=P[j][0]){const a=P[j-1],b=P[j];y=a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);break;}else if(j===P.length-1)y=b===undefined?P[j][1]:P[j][1];}
  ctx.lineTo(x,y+extra*prof(x)+(extra>0?2:0));}
 ctx.closePath();}
let JAWCOLS=null;const JSTRIP=2;
function buildJawCols(){const L=RASTER['w-jaw'],src=L.src,sw=src.width,sh=src.height,fL=0.2,fR=0.2,fade=Math.round(sw*0.06);
 const mk=(x0,x1,fadeL,fadeR)=>{const c=document.createElement('canvas');c.width=x1-x0;c.height=sh;const x=c.getContext('2d');x.drawImage(src,x0,0,x1-x0,sh,0,0,x1-x0,sh);
  if(!fadeL&&!fadeR)return c;const y0=Math.round(sh*0.42),m=document.createElement('canvas');m.width=c.width;m.height=sh;const mx=m.getContext('2d');mx.fillStyle='#000';mx.fillRect(0,0,c.width,y0);   // lip zone opaque
  const g=mx.createLinearGradient(0,0,c.width,0);g.addColorStop(0,fadeL?'rgba(0,0,0,0)':'#000');g.addColorStop(fadeL?fade/c.width:0,'#000');g.addColorStop(fadeR?1-fade/c.width:1,'#000');g.addColorStop(1,fadeR?'rgba(0,0,0,0)':'#000');mx.fillStyle=g;mx.fillRect(0,y0,c.width,sh-y0);
  x.globalCompositeOperation='destination-in';x.drawImage(m,0,0);return c;};
 const xL=Math.round(sw*fL),xR=Math.round(sw*(1-fR));
 const topRow=c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let y=0;y<c.height;y++){for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>40)return y;}return 0;};
 const left=mk(0,xL+fade,false,true),mid=mk(xL,xR,false,false),right=mk(xR-fade,sw,true,false);
 JAWCOLS={src,left,mid,right,xL,xR,fade,sw,sh,topL:topRow(left),topR:topRow(right)};}
function drawJawStretched(ctx,P){const L=RASTER['w-jaw'];if(!JAWCOLS)buildJawCols();const J=JAWCOLS,drop=P['jaw.drop']*ART.jawTravel,[rx,ry,rw,rh]=L.rig,k=rw/J.sw,Mo=ART.mouth;
 // Continuous warp: every 4px strip of the jaw moves by its own amount. Top edge follows the lens profile (0 at the mouth corners, full in the middle),
 // the bottom (chin/jawline) follows a broader profile, so there are no column seams anywhere.
 if(!J.tops){const x=J.src.getContext('2d'),d=x.getImageData(0,0,J.sw,J.sh).data;J.tops=[];for(let sx=0;sx<J.sw;sx+=JSTRIP){let t=J.sh-1;for(let y=0;y<J.sh&&t===J.sh-1;y++){for(let xx=sx;xx<Math.min(J.sw,sx+JSTRIP);xx++)if(d[(y*J.sw+xx)*4+3]>40){t=y;break;}}J.tops.push(t);}}
 const cl=Mo.cl[0],cr=Mo.cr[0],ss=(e0,e1,v)=>{const q=clamp((v-e0)/(e1-e0),0,1);return q*q*(3-2*q);};
 for(let n=0,sx=0;sx<J.sw;sx+=JSTRIP,n++){const w=Math.min(JSTRIP,J.sw-sx),cx=rx+(sx+w/2)*k,t=(cx-cl)/(cr-cl);
  const a=t>0&&t<1?Math.pow(Math.sin(Math.PI*t),0.6):0;
  const u=(cx-rx)/rw,bb=0.35+0.65*ss(0.0,0.45,u)*ss(0.0,0.45,1-u)*1.0+0*u;   // bottom edge: full drop in the middle, easing to 35% at the ends
  const top=J.tops[n],dy=ry+top*k+drop*a,dh=(J.sh-top)*k+drop*(Math.min(1,bb)-a);
  if(dh<=0)continue;ctx.drawImage(J.src,sx,top,w,J.sh-top,rx+sx*k,dy,w*k+0.8,dh);}
}
function drawMouthPlate(ctx,P){const Mo=ART.mouth,K=MOUTHKIT.pieces;if(!Mo.cl)return;const drop=P['jaw.drop']*ART.jawTravel;if(drop<3)return;ctx.save();lipPathPainted(ctx,Mo,drop+16);ctx.clip();if(!JAWCOLS&&RASTER['w-jaw'])buildJawCols();if(JAWCOLS){const L=RASTER['w-jaw'],k=L.rig[2]/JAWCOLS.sw,x0=L.rig[0]+JAWCOLS.xL*k,x1=L.rig[0]+JAWCOLS.xR*k;ctx.beginPath();ctx.rect(x0,Mo.cl[1]-20,x1-x0,ART.jawTravel+80);ctx.clip();}
 ctx.drawImage(K.interior,Mo.cl[0]-14,Mo.cl[1]-6,(Mo.cr[0]-Mo.cl[0])+28,ART.jawTravel+60);ctx.restore();}
function drawMouthPainted(ctx,P){const Mo=ART.mouth,K=MOUTHKIT.pieces,drop=P['jaw.drop']*ART.jawTravel;if(!Mo.cl)return;
 // lower teeth + tongue ride on the jaw's top edge, clipped to the opening
 if(drop>8){ctx.save();lipPathPainted(ctx,Mo,drop+2);ctx.clip();const w=Mo.cr[0]-Mo.cl[0];
  const tongueH=Math.min(60,drop*0.9),mx=(Mo.cl[0]+Mo.cr[0])/2;if(drop>30)ctx.drawImage(K.tongue,mx-w*0.26,Mo.mid[1]+drop-tongueH+4,w*0.5,tongueH);
  if(drop>40)ctx.drawImage(K.teethBottom,mx-w*0.17,Mo.mid[1]+drop-34,w*0.34,36);
  ctx.restore();}
 const tr=ART.toothRect;if(tr)ctx.drawImage(K.teethTop,tr[0],tr[1],tr[2],tr[3]);}

