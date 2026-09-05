import './style.css';
import * as THREE from 'three';
import {CoastTrack} from './track.js';
import {VehiclePhysics,DriverAI,CARS,MODES,clamp} from './physics.js';
import {createCar,loadCarModels} from './car.js';
import {DrivingInput} from './driving-input.js';
import {GameWorld} from './world.js';
import {DriveAudio} from './audio.js';

const $=id=>document.getElementById(id),show=(id,visible)=>$(id).classList.toggle('hidden',!visible);
const fmt=seconds=>{const n=Math.max(0,seconds);return `${String(Math.floor(n/60)).padStart(2,'0')}:${(n%60).toFixed(3).padStart(6,'0')}`;};
let world,track,player,car,state='menu',pausedState='race',config=CARS[0],raceMode=MODES[0],cameraMode=0,paint='#e85824';
let opponents=[],traffic=[],raceTime=0,countdown=3.7,lastCount=4,startS=45,finishS=0,score=0,nearMisses=0,collisionCooldown=0,noticeTime=0,assist=true,bust=0,sessionBest=null;
const keys=new Set(),audio=new DriveAudio(),drivingInput=new DrivingInput();let accumulator=0,lastFrame=0,frames=0,frameTime=0,fps=60;
const rpmBars=Array.from({length:24},()=>{const el=document.createElement('i');$('rpm-bars').append(el);return el;});
let storage={};try{storage=JSON.parse(localStorage.getItem('velocity-zero-settings')||'{}');}catch{}
function saveSettings(){try{localStorage.setItem('velocity-zero-settings',JSON.stringify({car:config.id,paint,camera:cameraMode,weather:$('weather').value,assists:$('assists').value,quality:$('quality').value,volume:$('volume').value,music:$('music').value}));}catch{}}
const cameraLabels=['CHASE CAM','HOOD CAM','DRIVER CAM','CINEMA CAM'];
function setCamera(mode){cameraMode=Number.isInteger(Number(mode))?clamp(Number(mode),0,3):0;$('camera').value=String(cameraMode);$('camera-label').textContent=cameraLabels[cameraMode];world.initializedCamera=false;saveSettings();}
function fail(error){console.error(error);show('loading',false);show('error',true);$('error-message').textContent='The road could not be loaded. Please use a recent browser with hardware acceleration enabled. '+error.message;}
function selectPanel(name){document.querySelectorAll('.menu-panel').forEach(p=>p.classList.add('hidden'));$(name+'-panel').classList.remove('hidden');document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.panel===name));}
function rebuildCar(){
  if(car){world.scene.remove(car.root);car.dispose();}
  drivingInput.reset();player=new VehiclePhysics(config);player.reset(startS,-2.6);car=createCar(config,paint);world.scene.add(car.root);
  $('selected-name').innerHTML=config.name.replace(/ (GT|R|V8)$/,' <i>$1</i>');$('selected-specs').innerHTML=`${config.hp} HP <span>/</span> ${config.drive} <span>/</span> ${config.mass.toLocaleString('en-US')} KG`;
}
function refreshGarage(){
  $('car-options').innerHTML=CARS.map((c,i)=>`<button class="car-option ${c.id===config.id?'selected':''}" data-car="${c.id}"><span>0${i+1} / ${c.type}</span><strong>${c.name}</strong><p>${c.description}</p><div class="car-stats">${c.hp} HP &nbsp; / &nbsp; ${c.mass.toLocaleString('en-US')} KG &nbsp; / &nbsp; ${Math.round(c.maxSpeed*3.6)} KM/H</div></button>`).join('');
  document.querySelectorAll('[data-car]').forEach(b=>b.addEventListener('click',()=>{config=CARS.find(c=>c.id===b.dataset.car);rebuildCar();refreshGarage();saveSettings();}));
  document.querySelector('.vehicle-caption .micro span').textContent=`0${CARS.indexOf(config)+1} / 03`;
}
function refreshModes(){
  $('mode-options').innerHTML=MODES.map((m,i)=>`<button class="mode-option ${m.id===raceMode.id?'selected':''}" data-mode="${m.id}"><b>0${i+1}</b><span><strong>${m.name}</strong><small>${m.desc}</small></span></button>`).join('');
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{raceMode=MODES.find(m=>m.id===b.dataset.mode);refreshModes();}));
  document.querySelector('.tag').textContent=raceMode.name;document.querySelector('.route-info strong').textContent=raceMode.id==='touge'||raceMode.id==='drift'?'THE MOUNTAIN PASS':'THE COASTAL RUN';
  const length=track.length*(raceMode.length||raceMode.laps)/1000;$('route-length').textContent=raceMode.timer?`${raceMode.timer} SEC`:length.toFixed(1)+' KM';
}
function notice(text){$('reward').textContent=text;$('reward').style.opacity='1';noticeTime=2.4;}
function clearOpponents(){for(const o of[...opponents,...traffic]){world.scene.remove(o.mesh.root);o.mesh.dispose();}opponents=[];traffic=[];}
function addOpponent(s,d,index,patrol=false){const cfg=CARS[patrol?0:index%3],p=new VehiclePhysics(cfg);p.reset(s,d);const mesh=createCar(cfg,patrol?'#202d37':['#d8d6bd','#467b79','#9e3d2b'][index%3],true);world.scene.add(mesh.root);if(patrol){const light=new THREE.Mesh(new THREE.BoxGeometry(.85,.1,.25),new THREE.MeshStandardMaterial({color:'#438bff',emissive:'#235dff',emissiveIntensity:3}));light.position.set(0,1.57,-.2);mesh.root.add(light);mesh.siren=light;}opponents.push({p,mesh,ai:new DriverAI(p,patrol?'aggressor':['precision','risk','drifter'][index%3],index+1),finished:false});}
async function startRace(){
  if(state!=='menu'&&state!=='finished'&&state!=='paused')return;
  clearOpponents();keys.clear();drivingInput.reset();startS=raceMode.start?track.length*raceMode.start:45;finishS=startS+track.length*(raceMode.length||raceMode.laps)-40;
  player.reset(startS,-2.6);raceTime=0;countdown=3.7;lastCount=4;score=0;nearMisses=0;bust=0;collisionCooldown=0;noticeTime=0;accumulator=0;
  for(let i=0;i<raceMode.rivals;i++)addOpponent(startS+(raceMode.id==='pursuit'?-35-i*24:8+i*10),i%2?-2.7:2.7,i,raceMode.id==='pursuit');
  for(let i=0;i<raceMode.traffic;i++){const p=new VehiclePhysics(CARS[2]);p.reset(startS+100+i*(track.length-150)/raceMode.traffic,i%2?-5.6:5.6);p.u=18+(i%4)*3;const mesh=createCar(CARS[2],['#b6c4b7','#686e71','#a29276','#465d6e'][i%4],true);world.scene.add(mesh.root);traffic.push({p,mesh,passed:false});}
  if(raceMode.id==='midnight')world.weather='night';else world.weather=$('weather').value;
  state='countdown';document.body.classList.add('racing');show('menu',false);show('results',false);show('pause-screen',false);show('hud',true);
  $('hud-mode').textContent=raceMode.name==='SPRINT'?'COASTAL SPRINT':raceMode.name;$('camera-label').textContent=cameraLabels[cameraMode];$('countdown').textContent='';world.initializedCamera=false;
  await audio.init();audio.setEnabled(true);$('audio-toggle').setAttribute('aria-label','Mute audio');document.querySelector('.audio-slash').style.display='none';
}
function pause(){if(state==='race'||state==='countdown'){pausedState=state;state='paused';keys.clear();drivingInput.reset();show('pause-screen',true);}else if(state==='paused'){state=pausedState;show('pause-screen',false);lastFrame=performance.now();}}
function toMenu(){state='menu';keys.clear();drivingInput.reset();clearOpponents();show('hud',false);show('pause-screen',false);show('results',false);show('menu',true);document.body.classList.remove('racing');startS=45;player.reset(startS,-2.6);world.weather=$('weather').value;world.initializedCamera=false;selectPanel('drive');}
function finish(caught=false){
  if(state!=='race')return;state='finished';keys.clear();drivingInput.reset();show('results',true);show('hud',false);
  const position=1+opponents.filter(o=>o.p.s>player.s).length,total=opponents.length+1;
  const key=`velocity-best-${raceMode.id}-${config.id}-${world.weather}-${assist}`;let best=null;try{best=Number(localStorage.getItem(key))||null;}catch{}
  const metric=raceMode.id==='drift'?Math.round(player.score+score):raceTime;const record=!caught&&(best===null||(raceMode.id==='drift'?metric>best:metric<best));
  if(record){try{localStorage.setItem(key,String(metric));}catch{}sessionBest=metric;}
  $('result-eyebrow').textContent=caught?'THE PATROL CAUGHT UP':record?'A NEW PERSONAL BEST':'THE COAST IS YOURS';
  $('result-title').innerHTML=caught?'END OF<br>THE ROAD.':raceMode.id==='pursuit'?'YOU GOT<br>AWAY.':raceMode.id==='drift'?'SIDEWAYS.<br>SMILING.':position===1?'WHAT<br>A DRIVE.':'NICE<br>DRIVING.';
  const rows=[['RACE TIME',fmt(raceTime)],['FINISH',raceMode.id==='pursuit'?(caught?'CAUGHT':'ESCAPED'):raceMode.id==='drift'?`${metric.toLocaleString()} PTS`:raceMode.rivals?`${position} / ${total}`:'COMPLETE'],['TOP SPEED',`${Math.round(player.topSpeed)} KM/H`],['CLEAN PASSES',String(nearMisses)],['PERSONAL BEST',raceMode.id==='drift'?`${Math.round(record?metric:best||0)} PTS`:fmt(record?metric:best||metric)]];
  $('result-stats').innerHTML=rows.map(([a,b])=>`<div class="result-row"><span>${a}</span><strong>${b}</strong></div>`).join('');audio.reward();
}
function readInput(){return {steer:(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0),throttle:keys.has('KeyW')||keys.has('ArrowUp')?1:0,brake:keys.has('KeyS')||keys.has('ArrowDown')?1:0,handbrake:keys.has('Space'),nitro:keys.has('ShiftLeft')||keys.has('ShiftRight')};}
function step(dt){
  if(state==='countdown'){
    countdown-=dt;const n=Math.ceil(countdown);if(n!==lastCount){lastCount=n;if(n>0&&n<=3){$('countdown').textContent=n;audio.count();}else if(n===0){$('countdown').textContent='GO';audio.count(true);}}
    player.rpm=900+readInput().throttle*3500;if(countdown<=0){state='race';notice('FIND YOUR LINE.');}
    return;
  }
  if(state!=='race')return;
  raceTime+=dt;if(raceTime>.7)$('countdown').textContent='';
  const q=track.sample(player.s);player.step(dt,drivingInput.sample(readInput(),player.u,dt,player.config),{curvature:q.curvature,slope:q.slope,wet:world.wet},assist);
  const all=[player,...opponents.map(o=>o.p),...traffic.map(o=>o.p)];
  for(const o of opponents){if(o.finished)continue;const q=track.sample(o.p.s);const input=o.ai.controls(track,player,all,raceTime);o.p.step(dt,input,{curvature:q.curvature,slope:q.slope,wet:world.wet},true);if(o.p.s>=finishS&&raceMode.id!=='pursuit'){o.finished=true;o.p.u=0;}}
  for(const o of traffic){o.p.s+=o.p.u*dt;if(o.p.s-player.s<-160){o.p.s+=track.length;o.passed=false;}}
  collisionCooldown=Math.max(0,collisionCooldown-dt);
  for(const o of[...opponents,...traffic]){
    const gap=o.p.s-player.s,lateral=o.p.d-player.d;
    if(Math.abs(gap)<4.2&&Math.abs(lateral)<1.95&&collisionCooldown<=0){const force=clamp(Math.abs(player.u-o.p.u)/45+.1,.13,.9);player.collide(force);o.p.collide(force*(player.config.mass/o.p.config.mass));player.d-=Math.sign(lateral||1)*.32;o.p.d+=Math.sign(lateral||1)*.25;player.r+=Math.sign(-lateral||1)*force*.18;collisionCooldown=.7;audio.collision(force);world.emit(car.root.position,'#ffc373',20);}
    if(traffic.includes(o)&&gap< -4&&!o.passed){o.passed=true;if(Math.abs(lateral)>1.95&&Math.abs(lateral)<3.7&&player.u-o.p.u>15){nearMisses++;score+=250;player.nitro=clamp(player.nitro+13,0,100);notice('NEAR MISS  +250');audio.reward();}}
    if(gap>5&&gap<25&&Math.abs(lateral)<1.5&&player.u>30){player.nitro=clamp(player.nitro+dt*3,0,100);player.u+=dt*.25;}
  }
  if(player.impact>.75&&collisionCooldown===0){collisionCooldown=.3;audio.collision(player.impact);world.emit(car.root.position,'#ffd383',12);}
  if(raceMode.id==='pursuit'){const close=opponents.some(o=>Math.abs(o.p.s-player.s)<12);bust=clamp(bust+(close&&player.u<9?dt:-dt*.5),0,3);if(bust>1)notice('KEEP MOVING  ·  PATROL CLOSE');if(bust>=3)finish(true);}
  if(raceMode.timer&&raceTime>=raceMode.timer)finish();else if(!raceMode.timer&&player.s>=finishS)finish();
}
function updateMesh(o,dt){const q=track.sample(o.p.s);o.mesh.root.position.copy(q.p).addScaledVector(q.right,o.p.d);o.mesh.root.rotation.set(-Math.asin(q.slope),q.heading+o.p.yaw,0,'YXZ');o.mesh.update(o.p,dt);o.mesh.root.visible=Math.abs(o.p.s-player.s)<650;if(o.mesh.siren)o.mesh.siren.material.emissive.set(Math.sin(raceTime*18)>0?'#326dff':'#ff3224');}
function drawMap(){const c=$('minimap'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);const points=track.samples,minX=-200,maxX=1400,minZ=-950,maxZ=1220;const project=p=>[25+(p.x-minX)/(maxX-minX)*170,158-(p.z-minZ)/(maxZ-minZ)*140];ctx.lineJoin='round';ctx.beginPath();for(let i=0;i<points.length;i+=9){const[x,y]=project(points[i].p);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.strokeStyle='#aebfac5c';ctx.lineWidth=3;ctx.stroke();
  for(const o of opponents){const[x,y]=project(track.sample(o.p.s).p);ctx.beginPath();ctx.arc(x,y,2.7,0,Math.PI*2);ctx.fillStyle='#e5ce9f';ctx.fill();}
  const q=track.sample(player.s),[x,y]=project(q.p);ctx.save();ctx.translate(x,y);ctx.rotate(-q.heading+Math.PI);ctx.beginPath();ctx.moveTo(0,5);ctx.lineTo(-4,-4);ctx.lineTo(0,-2);ctx.lineTo(4,-4);ctx.closePath();ctx.fillStyle='#ff8950';ctx.fill();ctx.restore();
  const [fx,fy]=project(track.sample(finishS).p);ctx.fillStyle='#f0e9cd';ctx.fillRect(fx-2,fy-2,4,4);
}
function updateHUD(dt){
  const progress=clamp((player.s-startS)/(finishS-startS),0,1);$('speed').textContent=String(Math.round(Math.abs(player.u)*3.6)).padStart(3,'0');$('gear').textContent=player.gear===-1?'R':player.gear===0?'N':player.gear;
  $('race-time').textContent=fmt(raceMode.timer?raceMode.timer-raceTime:raceTime);$('place').innerHTML=`${1+opponents.filter(o=>o.p.s>player.s).length}<small>/ ${opponents.length+1}</small>`;
  $('hud-region').textContent=track.region(player.s);$('progress-fill').style.width=progress*100+'%';$('nitro-fill').style.width=player.nitro+'%';$('nitro-value').textContent=Math.floor(player.nitro);
  const region=raceMode.id==='circuit'?`LAP ${clamp(Math.floor((player.s-startS)/track.length)+1,1,2)} / 2`:`${Math.max(0,(finishS-player.s)/1000).toFixed(1)} KM TO FINISH`;$('remaining').textContent=region;
  $('grip-status').textContent=player.slip>.1?'TIRES SLIDING':world.wet>.4?'WET SURFACE':'GRIP OPTIMAL';$('grip-status').style.color=player.slip>.1?'#ffa060':'';
  rpmBars.forEach((b,i)=>b.classList.toggle('lit',i<player.rpm/8000*24));$('drift-score').textContent=player.driftTime>.4?`${Math.round(player.score).toLocaleString()}  ×${player.combo}`:raceMode.id==='drift'?`${Math.round(player.score).toLocaleString()} PTS`:'';
  noticeTime-=dt;if(noticeTime<0)$('reward').style.opacity='0';$('impact').style.opacity=state==='race'?player.impact*.5:0;$('rain-glass').style.opacity=world.wet*.65;drawMap();
}
function frame(time){
  const rawDt=(time-(lastFrame||time))/1000,dt=Math.min(.05,rawDt);lastFrame=time;frames++;frameTime+=rawDt;if(frameTime>1){fps=Math.round(frames/frameTime);frames=0;frameTime=0;}
  if(state!=='paused'&&state!=='finished'){accumulator+=dt;while(accumulator>=1/120){step(1/120);accumulator-=1/120;}}
  if(state!=='paused'){
    const moving=state==='race'||state==='countdown';car.update(player,moving?dt:0);for(const o of[...opponents,...traffic])updateMesh(o,moving?dt:0);
    world.update(dt,player,car,state==='menu'?'menu':state==='race'?'race':'idle',cameraMode);
    if(state==='race'||state==='countdown')updateHUD(dt);
  }
  audio.update(player,track,opponents.map(o=>o.p),state==='race',clamp((player.s-startS)/(finishS-startS),0,1));world.render();
  requestAnimationFrame(frame);
}
function controls(open){show('controls',open);}
function bindUI(){
  document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>selectPanel(b.dataset.panel));document.querySelector('.brand').onclick=e=>{e.preventDefault();selectPanel('drive');};document.querySelectorAll('.return-drive').forEach(b=>b.onclick=()=>selectPanel('drive'));
  $('change-car').onclick=()=>selectPanel('garage');$('route-open').onclick=()=>selectPanel('routes');$('start').onclick=startRace;
  for(const id of['show-controls','controls-footer'])$(id).onclick=()=>controls(true);for(const id of['close-controls','controls-done'])$(id).onclick=()=>controls(false);
  $('pause-button').onclick=pause;$('resume').onclick=pause;$('restart').onclick=startRace;$('quit').onclick=toMenu;$('race-again').onclick=startRace;$('result-menu').onclick=toMenu;
  $('audio-toggle').onclick=async()=>{const desired=!audio.enabled;await audio.init();audio.setEnabled(desired);document.querySelector('.audio-slash').style.display=audio.enabled?'none':'';$('audio-toggle').setAttribute('aria-label',audio.enabled?'Mute audio':'Enable audio');};
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}};
  document.querySelectorAll('[data-paint]').forEach(b=>b.onclick=()=>{paint=b.dataset.paint;car.paint.color.set(paint);document.querySelectorAll('[data-paint]').forEach(s=>s.classList.toggle('selected',s===b));saveSettings();});
  $('weather').onchange=()=>{world.weather=$('weather').value;const labels={sunset:'GOLDEN HOUR',clear:'CLEAR SKIES',night:'MIDNIGHT',rain:'LIGHT RAIN',storm:'STORM FRONT',fog:'COASTAL FOG',dynamic:'CHANGING SKIES'};$('world-weather').textContent=labels[world.weather];$('world-temp').textContent=world.weather==='clear'?'24°C':world.weather==='night'?'14°C':'19°C';saveSettings();};
  $('camera').onchange=()=>setCamera($('camera').value);
  $('assists').onchange=()=>{assist=$('assists').value==='on';saveSettings();};$('quality').onchange=()=>{world.setQuality($('quality').value);saveSettings();};$('volume').oninput=()=>{audio.volume=$('volume').value/100;saveSettings();};$('music').oninput=()=>{audio.musicVolume=$('music').value/100;saveSettings();};
  window.addEventListener('keydown',e=>{
    if(['INPUT','SELECT'].includes(document.activeElement.tagName))return;
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code)&&state!=='menu'&&e.code!=='Tab')e.preventDefault();
    if(e.repeat){keys.add(e.code);return;}
    if(e.code==='Escape'){if(!$('controls').classList.contains('hidden'))controls(false);else pause();return;}
    if(e.code==='Enter'&&state==='menu'&&$('controls').classList.contains('hidden'))startRace();
    if(e.code==='KeyC'&&(state==='race'||state==='countdown')){setCamera((cameraMode+1)%4);}
    if(e.code==='KeyR'&&state==='race'){drivingInput.reset();player.steer=0;player.d=-2.6;player.yaw=0;player.v=0;player.r=0;player.u=Math.min(player.u,12);raceTime+=3;notice('BACK ON THE ROAD  +3 SEC');world.initializedCamera=false;}
    keys.add(e.code);
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();drivingInput.reset();if(state==='race'||state==='countdown')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&(state==='race'||state==='countdown'))pause();});window.addEventListener('resize',()=>world.resize());
  document.querySelectorAll('[data-key]').forEach(b=>{const code=b.dataset.key;b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(code);});for(const type of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>keys.delete(code));});
  $('world').addEventListener('webglcontextlost',e=>{e.preventDefault();if(state==='race'||state==='countdown')pause();show('error',true);$('error-message').textContent='The graphics connection was interrupted. Reload to get back on the road.';});
}
async function init(){
  try{
    track=new CoastTrack();world=new GameWorld($('world'),track);config=CARS.find(c=>c.id===storage.car)||CARS[0];paint=storage.paint||paint;await loadCarModels();rebuildCar();refreshGarage();refreshModes();bindUI();
    for(const id of['weather','assists','quality','volume','music'])if(storage[id]!==undefined)$(id).value=storage[id];
    setCamera(storage.camera??0);world.weather=$('weather').value;$('weather').onchange();assist=$('assists').value==='on';world.setQuality($('quality').value);audio.volume=$('volume').value/100;audio.musicVolume=$('music').value/100;
    document.querySelectorAll('[data-paint]').forEach(b=>b.classList.toggle('selected',b.dataset.paint===paint));
    finishS=startS+track.length-40;world.update(.016,player,car,'menu');world.render();$('loading').style.opacity='0';setTimeout(()=>show('loading',false),650);requestAnimationFrame(frame);
    window.__velocity={getState:()=>({state,s:player.s,d:player.d,speed:player.u*3.6,yaw:player.yaw,slip:player.slip,rpm:player.rpm,nitro:player.nitro,weather:world.weather,wet:world.wet,camera:cameraMode,mode:raceMode.id,car:config.id,time:raceTime,fps,drawCalls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles,geometries:world.renderer.info.memory.geometries,textures:world.renderer.info.memory.textures,musicStatus:audio.musicStatus,musicPlaying:!!audio.musicSource,audioReady:audio.ready,audioState:audio.ctx?.state,trackLength:track.length,startS,finishS,opponents:opponents.map(o=>({s:o.p.s,d:o.p.d,speed:o.p.u*3.6})),best:sessionBest})};
    // Explicit local verification hook; omitted from production builds.
    if(import.meta.env.DEV&&new URLSearchParams(location.search).has('test'))window.__velocity.test={setPlayer:values=>{Object.assign(player,values);world.initializedCamera=false;},setTime:t=>{raceTime=t;},advance:seconds=>{for(let i=0;i<seconds*120;i++)step(1/120);},input:(code,on)=>on?keys.add(code):keys.delete(code)};
  }catch(error){fail(error);}
}
init();
