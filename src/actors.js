// actors.js — ghosts and the jar.
// Placeholder art is drawn in code; painted art drops in via assets/ghosts/ghost.json (see docs/GHOST_DESIGN_BRIEF.md).
// Globals used from engine.js: TAU, lerp, clamp, easeIO, rrPath.  From hunt.js (at call time): HUNT, hunt, shake, haptic, canvas, DPR.

// ---------- painted art hooks ----------
const GHOSTART={body:null,props:{},cfg:null,ready:false};
async function loadGhostArt(base){
  try{const r=await fetch(base+'/ghost.json');if(!r.ok)return;const cfg=await r.json();GHOSTART.cfg=cfg;
    const li=src=>new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src;});
    if(cfg.body)GHOSTART.body=await li(base+'/'+cfg.body);
    for(const k of Object.keys(cfg.props||{}))GHOSTART.props[k]=await li(base+'/'+cfg.props[k]);
    GHOSTART.ready=!!GHOSTART.body;
  }catch(e){}
}

// ---------- ghost personalities ----------
const GTRAITS={
  mustard:{lid:0.40,idle:'bite'}, snacker:{lid:0.10,idle:'hop'}, browser:{lid:0.34,idle:'fuss'}, reader:{lid:0.55,idle:'read'},
  nibbler:{lid:0.22,idle:'dart'}, groundskeeper:{lid:0.30,idle:'mow'}, diva:{lid:0.58,idle:'sway'}, boss:{lid:0.50,idle:'stamp'}};
const hashStr=s=>{let h=7;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return h;};
// offsets are in "ghost size" units so they scale with the screen
function ghostIdle(id,T){
  const o={dx:0,dy:0,rot:0,sx:1,sy:1,gx:-0.5,gy:0.1,lidAdd:0};
  const b=Math.sin(T*1.6);o.dy=b*0.07;o.sx=1+b*0.03;o.sy=1-b*0.03;o.rot=Math.sin(T*0.9)*0.05;
  switch(GTRAITS[id]&&GTRAITS[id].idle){
    case 'bite':{const p=(T%3.2)/3.2,k=p>0.7?Math.sin((p-0.7)/0.3*Math.PI):0;o.dy+=k*0.12;o.rot+=k*0.12;o.sy-=k*0.08;o.gx=p<0.7?-0.6:0.5;o.gy=p<0.7?0:0.3;break;}
    case 'hop':{const p=(T%2.2)/2.2,h=p<0.5?Math.sin(p/0.5*Math.PI):0,land=(p>0.5&&p<0.62)?Math.sin((p-0.5)/0.12*Math.PI):0;o.dy=-h*0.28+land*0.03;o.sy=1+h*0.08-land*0.14;o.sx=1-h*0.04+land*0.1;o.gx=-0.3;o.gy=0.4+h*0.3;break;}
    case 'fuss':{o.rot=Math.sin(T*2.2)*0.1;o.dx=Math.sin(T*1.1)*0.05;o.gx=Math.sin(T*1.1)>0?0.6:-0.6;o.gy=-0.2;break;}
    case 'read':{o.gx=0;o.gy=0.75;o.rot=Math.sin(T*0.6)*0.03;if((T%4)<0.25)o.rot+=0.08;break;}
    case 'dart':{const steps=[-1,1,-0.4,0.8,0],i=Math.floor(T*1.3),f=(T*1.3)%1,e=Math.min(1,f*4);const cur=steps[i%5],prev=steps[(i+4)%5];o.dx=lerp(prev,cur,e)*0.2;o.gx=cur*0.7;o.gy=0;break;}
    case 'mow':{o.dx=(Math.sin(T*0.9)-1)*0.24;o.rot=Math.cos(T*0.9)*0.05;o.gx=Math.cos(T*0.9)>0?0.6:-0.6;o.gy=0.2;break;}
    case 'sway':{o.rot=Math.sin(T*0.7)*0.14;o.dy-=0.05;o.lidAdd=(Math.sin(T*0.8)>0.2)?0.4:0;o.gx=0;o.gy=-0.5;break;}
    case 'stamp':{const p=(T%2.6)/2.6,st=(p>0.55&&p<0.7)?Math.sin((p-0.55)/0.15*Math.PI):0;o.dy+=st*0.14;o.sy-=st*0.1;if(p>0.8){o.gx=0.7;o.gy=0.4;}else{o.gx=-0.3;o.gy=0.3;}break;}
  }
  return o;
}

// ---------- ghost figure: body + eyes (+ prop). Used for the main ghost, the jar minis and the finale party ----------
function drawGhostEyes(ctx,s,look,lid,blink,col,geo){
  const ex=geo?[geo.cx-geo.dx,geo.cx+geo.dx]:[-s*0.2,s*0.17],ey=geo?geo.y:-s*0.34,er=geo?[geo.r,geo.r*0.9]:[s*0.15,s*0.13];
  ex.forEach((x,i)=>{const r=er[i];
    ctx.fillStyle='rgba(60,54,70,0.35)';ctx.beginPath();ctx.arc(x,ey+r*0.08,r*1.12,0,TAU);ctx.fill();
    const g=ctx.createRadialGradient(x-r*0.35,ey-r*0.4,r*0.1,x,ey,r);g.addColorStop(0,'#ffffff');g.addColorStop(0.6,'#f3efe3');g.addColorStop(1,'#cfc7b4');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,ey,r,0,TAU);ctx.fill();
    const px=x+look[0]*r*0.42,py=ey+look[1]*r*0.38;ctx.fillStyle='#1a1414';ctx.beginPath();ctx.arc(px,py,r*0.42,0,TAU);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.9)';ctx.beginPath();ctx.arc(px-r*0.14,py-r*0.16,r*0.12,0,TAU);ctx.fill();
    const cover=Math.min(1,lid+blink*(1-lid)),yl=ey-r+2*r*cover;
    ctx.save();ctx.beginPath();ctx.arc(x,ey,r+1,0,TAU);ctx.clip();ctx.fillStyle=col;ctx.fillRect(x-r-2,ey-r-2,2*r+4,yl-(ey-r-2));
    ctx.strokeStyle='rgba(42,36,48,0.65)';ctx.lineWidth=Math.max(1,s*0.012);ctx.beginPath();ctx.moveTo(x-r,yl);ctx.quadraticCurveTo(x,yl+r*0.18,x+r,yl);ctx.stroke();ctx.restore();
  });
}
function drawGhostProp(ctx,w,T,s){
  ctx.save();ctx.translate(w*0.5,-w*0.06+Math.sin(T*1.6)*w*0.02);ctx.rotate(-0.3+Math.sin(T*1.2)*0.08);
  const img=GHOSTART.props[s.ghost];
  if(img){const ph=w*((GHOSTART.cfg&&GHOSTART.cfg.propScale)||0.5),pw=ph*img.width/img.height;ctx.drawImage(img,-pw/2,-ph/2,pw,ph);ctx.restore();return;}
  ctx.fillStyle=s.accent;ctx.strokeStyle='rgba(0,0,0,0.35)';ctx.lineWidth=1.5;const pr=s.prop;
  if(pr==='hotdog'){rrPath(ctx,-w*0.22,-w*0.08,w*0.44,w*0.16,w*0.08);ctx.fill();ctx.stroke();}
  else if(pr==='book'){ctx.fillRect(-w*0.18,-w*0.12,w*0.36,w*0.26);ctx.strokeRect(-w*0.18,-w*0.12,w*0.36,w*0.26);ctx.beginPath();ctx.moveTo(0,-w*0.12);ctx.lineTo(0,w*0.14);ctx.stroke();}
  else if(pr==='cheese'){ctx.beginPath();ctx.moveTo(-w*0.2,w*0.1);ctx.lineTo(w*0.2,w*0.1);ctx.lineTo(w*0.05,-w*0.14);ctx.closePath();ctx.fill();ctx.stroke();}
  else if(pr==='mic'){ctx.beginPath();ctx.arc(0,-w*0.08,w*0.09,0,TAU);ctx.fill();ctx.stroke();ctx.fillRect(-w*0.03,0,w*0.06,w*0.22);}
  else if(pr==='clipboard'){ctx.fillRect(-w*0.14,-w*0.16,w*0.28,w*0.34);ctx.strokeRect(-w*0.14,-w*0.16,w*0.28,w*0.34);ctx.fillStyle='#fff';ctx.fillRect(-w*0.1,-w*0.1,w*0.2,w*0.22);}
  else if(pr==='mower'){ctx.fillRect(-w*0.2,-w*0.05,w*0.3,w*0.14);ctx.beginPath();ctx.arc(-w*0.16,w*0.12,w*0.06,0,TAU);ctx.arc(w*0.06,w*0.12,w*0.06,0,TAU);ctx.fill();ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(w*0.08,-w*0.05);ctx.lineTo(w*0.26,-w*0.3);ctx.stroke();}
  else if(pr==='fork'){ctx.lineWidth=3;ctx.strokeStyle=s.accent;ctx.beginPath();ctx.moveTo(0,w*0.22);ctx.lineTo(0,-w*0.1);ctx.stroke();[-w*0.06,0,w*0.06].forEach(x=>{ctx.beginPath();ctx.moveTo(x,-w*0.1);ctx.lineTo(x,-w*0.24);ctx.stroke();});}
  else{rrPath(ctx,-w*0.1,-w*0.14,w*0.2,w*0.28,w*0.03);ctx.fill();ctx.stroke();ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(0,-w*0.14);ctx.lineTo(0,-w*0.26);ctx.stroke();}
  ctx.restore();
}
// o: {size,T,station,look:[x,y],lid,blink,prop:true}
function drawGhostFigure(ctx,o){
  const size=o.size,T=o.T,s=o.station,w=size*0.78,h=size*1.25,bodyCol='rgba(230,227,218,0.97)';
  let geo=null,pw=w;
  if(GHOSTART.body){const img=GHOSTART.body,c=GHOSTART.cfg||{},bh=size*(c.bodyHeight||1.35),bw=bh*img.width/img.height,top=size*0.55-bh,E=c.eyes||{y:0.31,dx:0.045,r:0.034,cx:-0.02,veil:0.3},eb=o.eyeBoost||1;pw=bw*0.9;
    ctx.drawImage(img,-bw/2,top,bw,bh);geo={y:top+bh*E.y,dx:bh*E.dx*(0.6+0.4*eb),r:bh*E.r*eb,cx:bh*(E.cx||0),top,bh,bw,veil:E.veil};}
  else{
    const g=ctx.createLinearGradient(0,-h*0.6,0,h*0.5);g.addColorStop(0,'rgba(236,233,224,0.96)');g.addColorStop(0.7,'rgba(222,220,212,0.9)');g.addColorStop(1,'rgba(222,220,212,0.15)');
    ctx.beginPath();ctx.moveTo(-w*0.46,h*0.1);ctx.bezierCurveTo(-w*0.55,-h*0.35,-w*0.3,-h*0.62,0,-h*0.62);ctx.bezierCurveTo(w*0.3,-h*0.62,w*0.55,-h*0.35,w*0.46,h*0.1);
    ctx.quadraticCurveTo(w*0.5,h*0.3,w*0.42,h*0.42);for(let i=0;i<7;i++){const f=i/6,x=w*0.42-f*w*0.84,yy=h*0.42+(i%2?-h*0.07:h*0.02)+Math.sin(T*2+i)*h*0.02;ctx.quadraticCurveTo(x+w*0.06,yy+h*0.04,x,yy);}
    ctx.quadraticCurveTo(-w*0.5,h*0.3,-w*0.46,h*0.1);ctx.closePath();ctx.fillStyle=g;ctx.fill();
    const sh=ctx.createRadialGradient(-w*0.2,-h*0.35,w*0.1,0,-h*0.1,w*0.9);sh.addColorStop(0,'rgba(255,255,255,0.35)');sh.addColorStop(1,'rgba(60,50,70,0.22)');ctx.fillStyle=sh;ctx.fill();
  }
  drawGhostEyes(ctx,size,o.look,o.lid,o.blink,(GHOSTART.cfg&&GHOSTART.cfg.lidColor)||bodyCol,geo);
  if(geo&&geo.veil){const img=GHOSTART.body;ctx.save();ctx.beginPath();ctx.rect(geo.cx-geo.dx*2.2,geo.y-geo.r*1.6,geo.dx*4.4,geo.r*3.2);ctx.clip();ctx.globalAlpha=geo.veil;ctx.drawImage(img,-geo.bw/2,geo.top,geo.bw,geo.bh);ctx.restore();}   // the gauze lies over the eyes
  if(o.prop!==false&&s)drawGhostProp(ctx,pw,T,s);
}

// ---------- the main ghost at the current station ----------
const ghost={st:'idle',x:0,y:0,sx:1,sy:1,alpha:1,t:0,idx:-1,appear:1,notice:0,panic:0,size:0};
const GSIZE=0.2;   // ghost size as a fraction of screen height (was 0.13; props scale with it)
function ghostHome(W,H){return [W*0.73,H*0.74-H*0.30];}
function ghostNotice(){ghost.notice=1.4;}
function blinkAmt(seed,T){const ph=(T*0.31+seed/97)%1;return ph<0.035?Math.sin(ph/0.035*Math.PI):0;}
const easeOutBack=t=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2);};
function drawGhost(ctx,W,H,dt){
  const s=HUNT.stations[hunt.step];if(!s)return;
  if(ghost.idx!==hunt.step){ghost.idx=hunt.step;ghost.appear=0;ghost.t=0;ghost.notice=0;ghost.panic=0;}
  if(ghost.st==='gone'||ghost.st==='captured')return;                 // captured ghosts are drawn by the jar (in front of it)
  ghost.t+=dt;ghost.appear=Math.min(1,ghost.appear+dt/0.7);ghost.notice=Math.max(0,ghost.notice-dt);
  const size=H*GSIZE,[hx,hy]=ghostHome(W,H),T=ghost.t,id=s.ghost,tr=GTRAITS[id]||{lid:0.3};
  const o=ghostIdle(id,T);let look=[o.gx,o.gy],lid=Math.min(0.85,tr.lid+o.lidAdd),jx=0,jy=0;
  if(ghost.notice>0){look=[-0.7,0.5];lid=Math.max(0,lid-0.3);jy=-Math.sin(Math.min(1,(1.4-ghost.notice)/0.25)*Math.PI)*0.06;}   // a wrong scan: it peeks at the witch, startled
  ghost.x=Math.min(hx+o.dx*size+jx*size,W-size*0.62);ghost.y=hy+(o.dy+jy)*size;ghost.sx=o.sx;ghost.sy=o.sy;ghost.size=size;
  const k=ghost.appear<1?easeOutBack(ghost.appear):1;ghost.alpha=Math.min(1,ghost.appear*2);
  // the diva brings her own spotlight
  if(id==='diva'){const g=ctx.createLinearGradient(0,ghost.y-H*0.5,0,ghost.y+size*0.5);g.addColorStop(0,'rgba(168,107,216,0.0)');g.addColorStop(1,'rgba(168,107,216,0.22)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(ghost.x-size*0.15,ghost.y-H*0.5);ctx.lineTo(ghost.x+size*0.15,ghost.y-H*0.5);ctx.lineTo(ghost.x+size*0.9,ghost.y+size*0.55);ctx.lineTo(ghost.x-size*0.9,ghost.y+size*0.55);ctx.closePath();ctx.fill();}
  // arrival puff
  if(ghost.appear<1){ctx.fillStyle='rgba(200,215,200,'+(0.25*(1-ghost.appear))+')';for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(ghost.x+Math.cos(i*1.3)*size*0.5*ghost.appear,ghost.y+size*0.3+Math.sin(i*2.1)*size*0.12,size*0.22*(0.6+ghost.appear),0,TAU);ctx.fill();}}
  ctx.save();ctx.globalAlpha=ghost.alpha;ctx.translate(ghost.x,ghost.y);ctx.scale(ghost.sx*k,ghost.sy*k);ctx.rotate(o.rot);
  drawGhostFigure(ctx,{size,T,station:s,look,lid,blink:blinkAmt(hashStr(id),T)});ctx.restore();
}

// ---------- jar ----------
const jar={count:0,rattle:0,glow:0,lidO:1,park:1,closing:false,sq:0,fly:null,released:false,party:[],fx:[],init:false,t:0,blow:null,autoRattle:0};
const JSLOTS=[[-.24,-.16],[.22,-.18],[0,-.3],[-.26,-.42],[.25,-.44],[-.08,-.52],[.1,-.62],[-.14,-.62]];
function jarGeom(W,H){const h=H*0.17,wb=h*0.78,wn=wb*0.5;return{x:W*0.83,y:H*0.74,h,wb,wn};}
function jarPath(ctx,g){const{h,wb,wn}=g;ctx.beginPath();ctx.moveTo(-wn/2,-h);ctx.lineTo(-wn/2,-h*0.84);ctx.bezierCurveTo(-wn/2,-h*0.74,-wb/2,-h*0.74,-wb/2,-h*0.5);ctx.bezierCurveTo(-wb/2,-h*0.12,-wb*0.36,0,0,0);ctx.bezierCurveTo(wb*0.36,0,wb/2,-h*0.12,wb/2,-h*0.5);ctx.bezierCurveTo(wb/2,-h*0.74,wn/2,-h*0.74,wn/2,-h*0.84);ctx.lineTo(wn/2,-h);ctx.closePath();}
function jarSlot(g,i){const s=JSLOTS[i%8];return [s[0]*g.wb,s[1]*g.h];}
function jarFx(x,y,n,col,spd,life){for(let i=0;i<n;i++){const a=Math.random()*TAU,v=spd*(0.3+Math.random());jar.fx.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-spd*0.4,age:0,life:life*(0.6+Math.random()*0.6),col,r:2+Math.random()*3});}}
function jarCapture(){if(ghost.st==='captured'||ghost.st==='gone')return;ghost.st='captured';jar.fly={phase:'panic',t:0,x0:ghost.x,y0:ghost.y,trail:[]};}
function jarRelease(){if(jar.released)return;jar.released=true;jar.glow=1;jar.blow={x:0,y:0,vx:(Math.random()-0.3)*60,vy:-260,rot:0,vr:6,t:0};shake();haptic(120);
  const W=canvas.width/DPR,H=canvas.height/DPR,g=jarGeom(W,H);jarFx(g.x,g.y-g.h,70,'rgba(124,255,74,0.9)',260,1.2);
  for(let i=0;i<Math.min(8,HUNT.stations.length);i++){const st=HUNT.stations[i];jar.party.push({i,st,x:g.x+(Math.random()-0.5)*g.wn,y:g.y-g.h,vx:(Math.random()-0.5)*W*1.1,vy:-H*(0.5+Math.random()*0.5),ph:Math.random()*TAU,r:0.18+Math.random()*0.2,t:0});}}
function drawMini(ctx,x,y,size,i,T,hop){const st=HUNT.stations[i];ctx.save();ctx.translate(x,y+hop);ctx.rotate(Math.sin(T*1.3+i)*0.08);ctx.globalAlpha=0.95;drawGhostFigure(ctx,{size,T:T+i,station:st,look:[Math.sin(T*0.7+i)*0.6,0.2],lid:(GTRAITS[st.ghost]||{lid:0.3}).lid*0.6,blink:blinkAmt(i*13+5,T),prop:size>jarMiniProp,eyeBoost:1.7});ctx.restore();}
const jarMiniProp=0; // props visible on every mini
function drawJar(ctx,W,H,dt){
  const g=jarGeom(W,H);jar.t+=dt;const T=jar.t;
  if(!jar.init){jar.init=true;jar.lidO=jar.count===0?1:0;jar.park=jar.count===0?1:0;}
  jar.rattle=Math.max(0,jar.rattle-dt);jar.glow=Math.max(0,jar.glow-dt*0.5);jar.sq=Math.max(0,jar.sq-dt*3.5);
  if(jar.count>=7&&!jar.released){jar.autoRattle-=dt;if(jar.autoRattle<=0){jar.autoRattle=jar.count>=8?1.2:2.6;jar.rattle=Math.max(jar.rattle,0.45);}}
  // flight state machine
  const f=jar.fly,mx=g.x,my=g.y-g.h*1.02;let flyGhost=null;
  if(f){f.t+=dt;
    if(f.phase==='panic'){ghost.panic=1;if(f.t>=0.35){f.phase='fly';f.t=0;}flyGhost={x:f.x0+(Math.random()-0.5)*6,y:f.y0,sx:1,sy:1,k:1,look:[0,0.3],lid:0,alpha:1};}
    else if(f.phase==='fly'){const u=Math.min(1,f.t/1.0),e=easeIO(u),cx=lerp(f.x0,mx,0.4),cy=Math.min(f.y0,my)-H*0.16,x=(1-e)*(1-e)*f.x0+2*(1-e)*e*cx+e*e*mx,y=(1-e)*(1-e)*f.y0+2*(1-e)*e*cy+e*e*my;
      const mini=g.wb*0.3/(ghost.size||H*GSIZE);flyGhost={x,y,sx:1-0.35*Math.sin(Math.PI*u),sy:1+0.5*Math.sin(Math.PI*u),k:lerp(1,mini,e),look:[Math.cos(u*3)*0.5,-0.4],lid:0,alpha:1};
      f.trail.push([x,y]);if(f.trail.length>20)f.trail.shift();if(Math.random()<0.6)jarFx(x,y,1,'rgba(124,255,74,0.9)',60,0.6);
      if(u>=1){f.phase='drop';f.t=0;}}
    else if(f.phase==='drop'){const u=Math.min(1,f.t/0.35),[sx,sy]=jarSlot(g,jar.count),x=mx+(g.x+sx-mx)*u,y=my+(g.y+sy-my)*u*u+Math.sin(u*Math.PI)*-4,mini=g.wb*0.3/(ghost.size||H*GSIZE);
      flyGhost={x,y,sx:1,sy:1,k:mini,look:[0,0.5],lid:0.1,alpha:1};
      if(u>=1){jar.fly=null;ghost.st='gone';ghost.panic=0;jar.count++;jar.closing=true;jarFx(mx,my,26,'rgba(124,255,74,0.9)',180,0.8);}}
    jar.lidTarget=1;}
  if(f||jar.closing||jar.released)jar.park=Math.max(0,jar.park-dt*4);
  if(jar.closing){jar.lidO-=dt*7;if(jar.lidO<=0){jar.lidO=0;jar.closing=false;jar.sq=1;jar.rattle=0.6;shake();haptic(60);jarFx(mx,my,16,'rgba(255,240,180,0.9)',140,0.5);}}
  else if(f)jar.lidO=Math.min(1,jar.lidO+dt*6);
  // ---- draw jar ----
  const rx=(jar.rattle>0||jar.count>=8&&!jar.released)?(Math.random()-0.5)*(jar.rattle>0?5:1.6):0,sq=jar.sq;
  ctx.save();ctx.translate(g.x+rx,g.y);ctx.scale(1+sq*0.07,1-sq*0.09);
  // contact shadow
  ctx.fillStyle='rgba(0,0,0,0.35)';ctx.beginPath();ctx.ellipse(0,2,g.wb*0.58,g.h*0.05,0,0,TAU);ctx.fill();
  // back glow
  const gl=0.1+0.04*jar.count+(jar.count>=8?0.18+0.1*Math.sin(T*6):0)+jar.glow*0.4;
  const bg=ctx.createRadialGradient(0,-g.h*0.45,0,0,-g.h*0.45,g.h*0.95);bg.addColorStop(0,'rgba(124,255,74,'+Math.min(0.7,gl)+')');bg.addColorStop(1,'rgba(124,255,74,0)');ctx.fillStyle=bg;ctx.fillRect(-g.h,-g.h*1.5,g.h*2,g.h*1.6);
  // contents, clipped to the glass
  ctx.save();jarPath(ctx,g);ctx.clip();
  const gi=ctx.createLinearGradient(0,-g.h,0,0);gi.addColorStop(0,'rgba(124,255,74,0.0)');gi.addColorStop(1,'rgba(124,255,74,'+Math.min(0.5,0.08+0.03*jar.count)+')');ctx.fillStyle=gi;ctx.fillRect(-g.wb,-g.h,g.wb*2,g.h);
  const bump=jar.count>=4?0.25*(jar.count-3):0;
  for(let i=0;i<jar.count&&i<8;i++){const[sx,sy]=jarSlot(g,i);const hopPh=(T*0.7+i*1.3)%4,hop=bump&&hopPh<0.3?-Math.sin(hopPh/0.3*Math.PI)*g.wb*0.12*bump:0;const wob=Math.sin(T*(2+i*0.3))*g.wb*0.012*(1+bump*2);drawMini(ctx,sx+wob,sy,g.wb*0.3,i,T,hop);}
  ctx.restore();
  // glass: tint, edge light, highlights (key light from the upper left)
  jarPath(ctx,g);const gg=ctx.createLinearGradient(-g.wb/2,0,g.wb/2,0);gg.addColorStop(0,'rgba(235,248,240,0.30)');gg.addColorStop(0.2,'rgba(200,225,215,0.08)');gg.addColorStop(0.75,'rgba(190,215,205,0.05)');gg.addColorStop(1,'rgba(235,248,240,0.22)');ctx.fillStyle=gg;ctx.fill();
  ctx.strokeStyle='rgba(225,245,235,0.6)';ctx.lineWidth=Math.max(2,g.h*0.016);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.4)';rrPath(ctx,-g.wb*0.38,-g.h*0.66,g.wb*0.07,g.h*0.42,g.wb*0.035);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.28)';ctx.beginPath();ctx.ellipse(-g.wb*0.26,-g.h*0.72,g.wb*0.07,g.h*0.025,-0.5,0,TAU);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.14)';rrPath(ctx,g.wb*0.33,-g.h*0.5,g.wb*0.04,g.h*0.3,g.wb*0.02);ctx.fill();
  // rim
  ctx.fillStyle='rgba(235,248,240,0.45)';ctx.strokeStyle='rgba(225,245,235,0.7)';ctx.lineWidth=2;rrPath(ctx,-g.wn*0.58,-g.h-g.h*0.025,g.wn*1.16,g.h*0.05,g.h*0.02);ctx.fill();ctx.stroke();
  // cork lid: lies in the neck when closed, floats up and tilts when open (the jar is "open" at the start of the story)
  let lo=jar.lidO,ly=-g.h-lo*g.h*0.45,lrot=lo*(0.35+0.12*Math.sin(T*2.4)),lx=lo*g.wn*0.25;
  if(jar.count>=8&&!jar.released){ly-=g.h*0.02*(1+Math.sin(T*9));lrot+=0.05*Math.sin(T*13);}
  if(jar.blow){const b=jar.blow;b.t+=dt;b.vy+=420*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.rot+=b.vr*dt;lx=b.x;ly=-g.h+b.y;lrot=b.rot;}
  const cw=g.wn*1.02,ch=g.h*0.15;if(jar.park>0&&!jar.blow){lx=lerp(lx,-g.wb*0.74,jar.park);ly=lerp(ly,-ch*0.2,jar.park);lrot=lerp(lrot,-1.45,jar.park);}   // before the first capture the cork lies on the ground: the jar was left open
  if(!(jar.blow&&jar.blow.t>2.2)){ctx.save();ctx.translate(lx,ly);ctx.rotate(lrot);
    const cg=ctx.createLinearGradient(-cw/2,0,cw/2,0);cg.addColorStop(0,'#8a6a48');cg.addColorStop(0.35,'#b58d5e');cg.addColorStop(1,'#6e5236');
    ctx.beginPath();ctx.moveTo(-cw*0.5,-ch);ctx.lineTo(cw*0.5,-ch);ctx.lineTo(cw*0.42,0);ctx.lineTo(-cw*0.42,0);ctx.closePath();ctx.fillStyle=cg;ctx.fill();ctx.strokeStyle='rgba(40,25,10,0.5)';ctx.lineWidth=1.5;ctx.stroke();
    ctx.strokeStyle='rgba(60,40,20,0.35)';ctx.lineWidth=1;for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-cw*0.4+i*cw*0.2,-ch*0.9);ctx.quadraticCurveTo(-cw*0.36+i*cw*0.2,-ch*0.5,-cw*0.38+i*cw*0.2,-ch*0.1);ctx.stroke();}
    ctx.fillStyle='rgba(255,230,190,0.25)';ctx.beginPath();ctx.ellipse(0,-ch,cw*0.5,ch*0.18,0,0,TAU);ctx.fill();ctx.restore();}
  // label
  ctx.fillStyle='rgba(255,255,255,0.85)';ctx.font='700 '+Math.round(g.h*0.15)+'px Georgia';ctx.textAlign='center';ctx.fillText(jar.count+' / 8',0,g.h*0.22);
  ctx.restore();
  // flying ghost: drawn in front of the jar, with a green ribbon behind it
  if(f&&flyGhost){
    if(f.trail&&f.trail.length>2){ctx.save();ctx.lineCap='round';for(let i=1;i<f.trail.length;i++){const a=i/f.trail.length;ctx.strokeStyle='rgba(124,255,74,'+(0.55*a)+')';ctx.lineWidth=2+a*7;ctx.beginPath();ctx.moveTo(f.trail[i-1][0],f.trail[i-1][1]);ctx.lineTo(f.trail[i][0],f.trail[i][1]);ctx.stroke();}ctx.restore();}
    const size=ghost.size||H*GSIZE,s=HUNT.stations[hunt.step];ctx.save();ctx.translate(flyGhost.x,flyGhost.y);ctx.scale(flyGhost.sx*flyGhost.k,flyGhost.sy*flyGhost.k);
    if(f.phase==='panic'){ctx.shadowColor='rgba(124,255,74,0.9)';ctx.shadowBlur=18;}
    drawGhostFigure(ctx,{size,T:ghost.t,station:s,look:flyGhost.look,lid:flyGhost.lid,blink:0});ctx.restore();}
  // finale: the lid has blown, the ghosts are out and partying
  if(jar.released){for(const p of jar.party){p.t+=dt;const tx=W*(0.5+0.36*Math.cos(p.ph+p.t*p.r*3)),ty=H*(0.2+0.12*Math.sin(p.ph*1.7+p.t*p.r*2.3));
      p.vx+=((tx-p.x)*2.2-p.vx*1.4)*dt;p.vy+=((ty-p.y)*2.2-p.vy*1.4)*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.sin(p.t*2+p.ph)*0.2);ctx.shadowColor=p.st.accent;ctx.shadowBlur=12;
      drawGhostFigure(ctx,{size:H*0.095,T:p.t+p.i,station:p.st,look:[0,0.15],lid:0.05,blink:blinkAmt(p.i*17,p.t),eyeBoost:1.35});ctx.restore();
      if(Math.random()<0.15)jarFx(p.x,p.y+H*0.03,1,p.st.accent,40,0.8);}}
  // particles
  for(let i=jar.fx.length-1;i>=0;i--){const q=jar.fx[i];q.age+=dt;if(q.age>q.life){jar.fx.splice(i,1);continue;}q.x+=q.vx*dt;q.y+=q.vy*dt;q.vy+=120*dt;ctx.globalAlpha=1-q.age/q.life;ctx.fillStyle=q.col;ctx.beginPath();ctx.arc(q.x,q.y,q.r*(1-q.age/q.life*0.5),0,TAU);ctx.fill();}
  ctx.globalAlpha=1;if(jar.fx.length>260)jar.fx.splice(0,jar.fx.length-260);
}
