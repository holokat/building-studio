import {NativeInteractionController} from './native-interactions.js';
import {weatherLegacyMaterialList} from './legacy-stone.js';
import * as THREE from 'three';
import {World,EYE} from './navigation.js';
import {createMetalReflections} from './inspection-lighting.js';
import {PropsLibrary} from './props.js';
import {DownloadLibrary} from './downloads.js';
import {loadAssetBuffer} from './asset-loader.js';
import {NativeBuildingLibrary} from './native-buildings.js';
const $=id=>document.getElementById(id),canvas=$('view'),viewport=$('viewport');
const state={mode:'orbit',house:null,prop:null,feet:[0,0,0],yaw:0,pitch:0,theta:.65,phi:1.12,distance:17,target:new THREE.Vector3(),keys:new Set(),history:[],errors:[],ready:false};
let renderer,manifest,geometries,materials,world,buildingGroup,normalDistance,metalReflections,frameTime=0,shownZ=0,doorMeshes=new Map(),doorMotion=new Map(),propsLibrary,nativeLibrary,propOrbit,downloads,nativeInteractions,shutterTarget=null,shutterRefresh=0;
const scene=new THREE.Scene();scene.background=new THREE.Color('#dcd8cf');scene.fog=new THREE.Fog('#dcd8cf',38,100);
const camera=new THREE.PerspectiveCamera(48,1,.035,150);camera.up.set(0,0,1);
const sun=new THREE.DirectionalLight('#fff0d5',3.1);sun.position.set(-8,-12,18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-16;sun.shadow.camera.right=16;sun.shadow.camera.top=16;sun.shadow.camera.bottom=-16;sun.shadow.camera.near=.5;sun.shadow.camera.far=60;sun.shadow.normalBias=.025;sun.shadow.bias=-.0003;scene.add(sun,sun.target);
const hemi=new THREE.HemisphereLight('#e5e8e6','#807c69',2.0);hemi.position.set(0,0,20);scene.add(hemi);
const fill=new THREE.AmbientLight('#fff0d4',.45);scene.add(fill);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#b9b9a9',roughness:1}));ground.position.z=-.585;ground.receiveShadow=true;scene.add(ground);
const loader=new THREE.TextureLoader(),textureCache=new Map();
async function texture(path,color=true){
 if(!path)return null;
 if(!textureCache.has(path))textureCache.set(path,loader.loadAsync('./assets/'+path).then(t=>{t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;}).catch(error=>{throw new Error('Texture could not load: '+path+' ('+(error.message||error.type||'decode error')+')');}));
 return textureCache.get(path);
}
async function makeMaterial(spec){
 const [map,paint,overlay,normal,roughnessMap]=await Promise.all([texture(spec.map),texture(spec.paint),texture(spec.overlay),texture(spec.normal,false),texture(spec.roughnessMap,false)]);
 if(normal)normal.channel=spec.weatheredStone?0:1;
 const strength=spec.normalScale??.6;
 const mat=new THREE.MeshStandardMaterial({color:new THREE.Color().fromArray(spec.color),map,normalMap:normal,roughnessMap,normalScale:new THREE.Vector2(strength,strength),roughness:THREE.MathUtils.clamp(spec.roughness,.04,1),metalness:spec.metalness,side:THREE.DoubleSide});
 mat.name=spec.name;
 if(spec.metalness>.1){mat.envMap=metalReflections.texture;mat.envMapIntensity=.65;}
 // Preserve the author's separate UVs for source albedo and native paint.
 const normalize=spec.paintNormalize||[1,1,1],tint=spec.tint||[1,1,1],factor=spec.tintFactor||0;
 mat.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 paintUv;\nvarying vec2 vPaintUv;\nuniform vec4 uSurfaceUV;\nuniform vec4 uPaintUV;').replace('#include <uv_vertex>','#include <uv_vertex>\nvPaintUv = paintUv * uPaintUV.xy + uPaintUV.zw;\n#ifdef USE_MAP\nvMapUv = vMapUv * uSurfaceUV.xy + uSurfaceUV.zw;\n#endif');
  const uniforms={uSurfaceUV:{value:new THREE.Vector4(...(spec.surfaceUVTransform||[1,1,0,0]))},uPaintUV:{value:new THREE.Vector4(...(spec.paintUVTransform||[1,1,0,0]))},uPaint:{value:paint},uOverlay:{value:overlay},uNormalize:{value:new THREE.Vector3(...normalize)},uFinish:{value:new THREE.Vector3(...tint)},uFinishFactor:{value:factor}};
  Object.assign(shader.uniforms,uniforms);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec2 vPaintUv;\nuniform sampler2D uPaint;\nuniform sampler2D uOverlay;\nuniform vec3 uNormalize;\nuniform vec3 uFinish;\nuniform float uFinishFactor;`);
  let code='#include <map_fragment>\n';
  if(paint&&map)code+='diffuseColor.rgb *= mix(vec3(1.),clamp(texture2D(uPaint,vPaintUv).rgb*uNormalize,vec3(.55),vec3(1.8)),.45);\n';
  code+='diffuseColor.rgb *= mix(vec3(1.),uFinish,uFinishFactor);\n';
  if(overlay)code+=`vec4 weather = texture2D(uOverlay,${spec.overlayMirrored?'vec2(1.-vPaintUv.x,vPaintUv.y)':'vPaintUv'}); diffuseColor.rgb = mix(diffuseColor.rgb,weather.rgb,weather.a*${Number(spec.overlayStrength??1).toFixed(5)});\n`;
  if(spec.cloth){
   const a=spec.clothColors?.[0]||[.28,.15,.075],b=spec.clothColors?.[1]||[.78,.67,.45];
   code+=`diffuseColor.rgb = mix(vec3(${a.join(',')}),vec3(${b.join(',')}),step(.5,1.-abs(mod(vPaintUv.x*${Number(spec.clothScale).toFixed(4)},2.)-1.)));\n`;
  }
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',code);
 };
 mat.customProgramCacheKey=()=>`${Boolean(paint)}-${Boolean(map)}-${Boolean(overlay)}-${Boolean(spec.cloth)}-${spec.name}`;
 return mat;
}
function makeGeometry(spec,buffer){
 const inter=new THREE.InterleavedBuffer(new Float32Array(buffer,spec.offset,spec.count*manifest.stride),manifest.stride);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.InterleavedBufferAttribute(inter,3,0));g.setAttribute('normal',new THREE.InterleavedBufferAttribute(inter,3,3));g.setAttribute('uv',new THREE.InterleavedBufferAttribute(inter,2,6));g.setAttribute('uv1',new THREE.InterleavedBufferAttribute(inter,2,8));g.setAttribute('paintUv',new THREE.InterleavedBufferAttribute(inter,2,8));g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0)/4294967295;}
function buildHouse(house){
 if(buildingGroup){scene.remove(buildingGroup);buildingGroup.traverse(o=>{if(o.isInstancedMesh)o.dispose();});}
 world=new World(house,manifest.meshes);doorMeshes=new Map();doorMotion=new Map();buildingGroup=new THREE.Group();const groups=new Map();
 house.instances.forEach((instance,sourceIndex)=>{const doorId=world.doorIdForInstance(sourceIndex),key=`${instance.g}:${instance.m}:${doorId||'static'}:${instance.roof}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({instance,sourceIndex,doorId});});
 for(const list of groups.values()){
  const first=list[0].instance,mesh=new THREE.InstancedMesh(geometries[first.g],materials[first.m],list.length);
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.roof=first.roof;
  list.forEach(({instance,sourceIndex,doorId},i)=>{mesh.setMatrixAt(i,new THREE.Matrix4().fromArray(world.matrixForInstance(sourceIndex)));const kind=manifest.materials[instance.m].kind,r=hash(instance.path+'/'+instance.name),shade=['stone','slate'].includes(kind)?.72+r*.5:.84+r*.26;mesh.setColorAt(i,new THREE.Color(shade,shade,shade));if(doorId){if(!doorMeshes.has(doorId))doorMeshes.set(doorId,[]);doorMeshes.get(doorId).push({mesh,index:i,sourceIndex});}});
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();buildingGroup.add(mesh);
 }
 scene.add(buildingGroup);
}
function syncDoorMeshes(id){for(const binding of doorMeshes.get(id)||[]){binding.mesh.setMatrixAt(binding.index,new THREE.Matrix4().fromArray(world.matrixForInstance(binding.sourceIndex)));binding.mesh.instanceMatrix.needsUpdate=true;binding.mesh.computeBoundingSphere();}renderer.shadowMap.needsUpdate=true;}
function updateDoorControl(){
 const nearby=state.mode==='walk'&&world?.nearestDoor(state.feet);const control=$('door-control');control.hidden=!nearby;if(!nearby)return;
 const label=nearby.label.charAt(0).toLowerCase()+nearby.label.slice(1),action=nearby.locked?'Locked':nearby.open?'Close':'Open';$('door-toggle').textContent=`${action} ${label}`;$('door-toggle').disabled=nearby.locked;$('door-detail').textContent=nearby.locked?'This door is secured.':`${Math.round(nearby.distance*10)/10} m away`;$('door-toggle').setAttribute('aria-label',`${action} ${label}`);
}
function refreshShutters(force=false){
 const control=$('shutter-control');if(!nativeInteractions){control.hidden=true;shutterTarget=null;return;}
 const time=performance.now();if(!force&&time-shutterRefresh<250)return;shutterRefresh=time;
 const direction=camera.getWorldDirection(new THREE.Vector3());shutterTarget=nativeInteractions.pick(camera.position,direction)||(state.mode==='walk'?nativeInteractions.nearest(camera.position):null);
 control.hidden=!shutterTarget;if(!shutterTarget)return;const target=nativeInteractions.state(shutterTarget.id);$('shutter-toggle').textContent=Math.abs(target.target-target.openAngle)<.01?'Close shutter':'Open shutter';$('shutter-detail').textContent=target.label;
}
function requestShutter(){refreshShutters(true);if(!shutterTarget)return false;nativeInteractions.toggle(shutterTarget.id);refreshShutters(true);renderer.shadowMap.needsUpdate=true;return true;}
function requestDoor(id=null){
 const door=id?world.doorState(id):world.nearestDoor(state.feet);if(!door)return notice('Move closer to a door.');if(door.locked)return notice(`${door.label} is secured.`);
 const moving=doorMotion.get(door.id),target=moving?(moving.target===0?door.openAngle:0):(door.open?0:door.openAngle);doorMotion.set(door.id,{target,latch:true,blocked:false});log(target===0?'close door':'open door');
}
function advanceDoors(dt){for(const [id,motion]of doorMotion){const door=world.doorState(id);if(!door){doorMotion.delete(id);continue;}const next=THREE.MathUtils.damp(door.angle,motion.target,12,dt);if(Math.abs(next-door.angle)>.0001){if(!world.setDoorAngle(id,next,state.feet)){if(!motion.blocked)notice('The door cannot move while you are in its swing.');motion.blocked=true;motion.latch=false;motion.target=door.angle;continue;}syncDoorMeshes(id);}if(Math.abs(world.doorState(id).angle-motion.target)<.008){world.setDoorAngle(id,motion.target,state.feet);syncDoorMeshes(id);doorMotion.delete(id);}}
}
function log(action){state.history.push({action,house:state.house?.id,mode:state.mode,feet:[...state.feet]});state.history=state.history.slice(-80);}
function buildingNote(h){return h.native?(!h.walkable?'Exterior inspection':h.bookmarks.upstairs?'Walk inside · Upper level':'Walk inside')+(h.workInProgress?' · In progress':''):[h.upstairs?'Two storeys · Interior staircase':'Single storey',h.workInProgress?'Bridgehaven · In progress':null].filter(Boolean).join(' · ');}
function selectHouse(id){
 const house=manifest.buildings.find(h=>h.id===id);if(!house)return;
 if(document.pointerLockElement)document.exitPointerLock();state.keys.clear();propsLibrary?.clearActive(false);nativeLibrary?.clearActive(false);state.prop=null;propOrbit=null;state.house=house;downloads?.select(house.id,house.name);canvas.setAttribute('aria-label','Drag to rotate the building. Scroll to zoom. Choose Walk inside to explore.');buildHouse(house);
 $('house-title').textContent=house.name;$('floor-note').textContent=buildingNote(house);$('upstairs').hidden=!house.upstairs;$('walk').disabled=false;$('interior').disabled=false;
 document.querySelectorAll('.house-card').forEach(el=>{el.classList.toggle('selected',el.dataset.id===id);el.setAttribute('aria-pressed',String(el.dataset.id===id));});
 resetOrbit();log('select building');
}
function selectNative({building,root,world:nextWorld}){
 if(!building)return;nativeInteractions=building.interactions?.length?new NativeInteractionController({THREE,root,interactions:building.interactions}):null;shutterTarget=null;shutterRefresh=0;if(document.pointerLockElement)document.exitPointerLock();state.keys.clear();doorMotion.clear();propsLibrary?.clearActive(false);state.prop=null;propOrbit=null;state.house=building;world=nextWorld;if(buildingGroup)buildingGroup.visible=false;
 canvas.setAttribute('aria-label','Drag to rotate the building. Scroll to zoom. Choose Walk inside to explore.');downloads?.selectExternal(building.download?{...building.download,url:building.download.url.startsWith('https://')?building.download.url:`./assets/exploration/${building.download.url}`} : null);$('house-title').textContent=building.name;$('floor-note').textContent=buildingNote(building);$('upstairs').hidden=!building.walkable||!building.bookmarks.upstairs;$('walk').disabled=!building.walkable;$('interior').disabled=!building.walkable;
 document.querySelectorAll('.house-card:not(.native-building-card)').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false');});resetOrbit();log('select native building');
}
function enterProp({prop,target,distance}){
 if(document.pointerLockElement)document.exitPointerLock();state.keys.clear();if(buildingGroup)buildingGroup.visible=false;if(nativeLibrary?.activeRoot)nativeLibrary.activeRoot.visible=false;state.mode='prop';state.prop=prop;downloads?.select(prop.id,prop.name);propOrbit={target:target.clone(),distance};state.target.copy(target);state.theta=.69;state.phi=1.13;state.distance=normalDistance=distance;
 camera.fov=45;camera.updateProjectionMatrix();canvas.setAttribute('aria-label',`Drag to rotate ${prop.name.toLowerCase()}. Scroll to zoom.`);$('house-title').textContent=prop.name;$('floor-note').textContent=prop.category;setModeUI();log('select prop');
}
function leaveProp(){
 if(state.mode!=='prop')return;canvas.setAttribute('aria-label','Drag to rotate the building. Scroll to zoom. Choose Walk inside to explore.');if(buildingGroup)buildingGroup.visible=!state.house?.native;if(nativeLibrary?.activeRoot)nativeLibrary.activeRoot.visible=Boolean(state.house?.native);state.prop=null;propOrbit=null;$('house-title').textContent=state.house.name;$('floor-note').textContent=buildingNote(state.house);$('upstairs').hidden=state.house.native?(!state.house.walkable||!state.house.bookmarks.upstairs):!state.house.upstairs;$('walk').disabled=Boolean(state.house.native&&!state.house.walkable);$('interior').disabled=Boolean(state.house.native&&!state.house.walkable);resetOrbit();
}
function resetOrbit(){
 if(document.pointerLockElement)document.exitPointerLock();state.keys.clear();state.mode='orbit';const h=state.house;
 if(propOrbit){state.mode='prop';state.target.copy(propOrbit.target);state.theta=.69;state.phi=1.13;state.distance=normalDistance=propOrbit.distance;camera.fov=45;camera.updateProjectionMatrix();setModeUI();log('prop orbit');return;}
 if(h.native){state.target.fromArray(h.bookmarks.outside.target);state.theta=.69;state.phi=1.13;state.distance=normalDistance=h.bookmarks.outside.distance;}
 else {state.target.fromArray(h.orbitTarget||[h.size[0]/2,h.size[1]/2,h.upstairs?3.2:2.0]);state.theta=.69;state.phi=1.13;state.distance=normalDistance=Math.max(13,Math.hypot(...h.size)*1.48+(h.upstairs?3:1));}
 camera.fov=45;camera.updateProjectionMatrix();setModeUI();log('orbit');
}
function setModeUI(){
 const walk=state.mode==='walk',prop=state.mode==='prop',native=Boolean(state.house?.native);viewport.classList.toggle('walking',walk);$('orbit').classList.toggle('active',!walk);$('walk').classList.toggle('active',walk);$('outside').classList.toggle('active',!walk);$('interior').classList.toggle('active',walk&&state.bookmark!=='upstairs');$('upstairs').classList.toggle('active',walk&&state.bookmark==='upstairs');$('navigation-switch').hidden=prop;$('viewpoints').hidden=prop;$('help-toggle').hidden=prop;if(prop)$('help').hidden=true;
 $('view-mode').textContent=walk?'Walkthrough':prop?'Prop inspection':'Exterior inspection';$('hint').innerHTML=walk?'WASD to walk <span>·</span> Mouse to look <span>·</span> Esc to release':'Drag to orbit <span>·</span> Scroll to zoom <span>·</span> Right-drag to pan';
 $('walk-prompt').hidden=!walk||Boolean(document.pointerLockElement);$('crosshair').hidden=!walk||!document.pointerLockElement;$('touch-controls').hidden=!walk||!matchMedia('(pointer:coarse)').matches;
 $('zoom-in').disabled=$('zoom-out').disabled=walk;
 renderer.shadowMap.needsUpdate=true;
 updateDoorControl();
}
function enter(place='inside',capture=true){
 const house=state.house;if(!world||!house)return;const native=Boolean(house.native),bookmark=native?house.bookmarks[place]:null,spawn=native?bookmark?.feet:(house[place]||house.inside);if(!spawn)return;const feet=world.ground(spawn);if(native&&!world.validSpawn(feet)){notice('This viewpoint is inside a structural solid.');return;}state.mode='walk';state.keys.clear();state.bookmark=place;state.feet=feet;shownZ=state.feet[2];state.yaw=native?(bookmark.yaw??0):(place==='upstairs'?-Math.PI/2:(house.insideYaw??0));state.pitch=-.04;camera.fov=68;camera.updateProjectionMatrix();setModeUI();canvas.focus();log(place);
 if(capture)lockPointer();
}
function lockPointer(){if(matchMedia('(pointer:coarse)').matches)return;try{const p=canvas.requestPointerLock();p?.catch(()=>notice('Drag to look around. Use WASD to move.'));}catch{notice('Drag to look around. Use WASD to move.');}}
let noticeTimer;
function notice(message){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,4500);}
function resize(){if(!renderer)return;const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
let drag=null,touches=new Map(),pinchDistance=0;
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{canvas.focus();if(e.pointerType==='touch'){touches.set(e.pointerId,[e.clientX,e.clientY]);}if(!document.pointerLockElement){drag={id:e.pointerId,x:e.clientX,y:e.clientY,pan:e.button===2||e.shiftKey};canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{
 if(!state.ready)return;
 if(document.pointerLockElement===canvas){state.yaw+=e.movementX*.0024;state.pitch=THREE.MathUtils.clamp(state.pitch-e.movementY*.0024,-1.45,1.45);return;}
 if(e.pointerType==='touch'&&touches.has(e.pointerId)){
  touches.set(e.pointerId,[e.clientX,e.clientY]);if(touches.size===2){const pts=[...touches.values()],dist=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);if(pinchDistance&&state.mode!=='walk')state.distance=THREE.MathUtils.clamp(state.distance*pinchDistance/dist,.18,50);pinchDistance=dist;return;}
 }
 if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
 if(state.mode==='walk'){state.yaw+=dx*.004;state.pitch=THREE.MathUtils.clamp(state.pitch-dy*.004,-1.45,1.45);$('walk-prompt').hidden=true;}
 else if(drag.pan){const r=state.distance*.0013;state.target.x-=Math.cos(state.theta)*dx*r;state.target.y-=Math.sin(state.theta)*dx*r;state.target.z+=dy*r;}
 else{state.theta-=dx*.006;state.phi=THREE.MathUtils.clamp(state.phi+dy*.006,.15,1.52);}
});
function pointerEnd(e){drag=null;touches.delete(e.pointerId);pinchDistance=0;if(state.ready)log('view gesture');}
canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);
canvas.addEventListener('wheel',e=>{if(state.mode!=='walk'){e.preventDefault();state.distance=THREE.MathUtils.clamp(state.distance*Math.exp(e.deltaY*.001),.18,50);}},{passive:false});
document.addEventListener('pointerlockchange',()=>{if(!state.ready)return;state.keys.clear();setModeUI();log(document.pointerLockElement?'mouse captured':'mouse released');});
document.addEventListener('pointerlockerror',()=>notice('Drag to look around. Use WASD to move.'));
window.addEventListener('keydown',e=>{if(!state.ready)return;if(e.key==='?'&&!e.repeat){$('help-toggle').click();return;}if(state.mode==='walk'&&e.code==='KeyE'&&!e.repeat&&(document.activeElement===canvas||document.pointerLockElement===canvas)){e.preventDefault();if(!requestShutter())requestDoor();return;}if(state.mode==='walk'&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){if(document.activeElement===canvas||document.pointerLockElement===canvas){e.preventDefault();if(!e.repeat&&!state.keys.has(e.code)){const mx=['KeyD','ArrowRight'].includes(e.code)?1:['KeyA','ArrowLeft'].includes(e.code)?-1:0,my=['KeyW','ArrowUp'].includes(e.code)?1:['KeyS','ArrowDown'].includes(e.code)?-1:0;if(mx||my)state.feet=world.move(state.feet,[(Math.cos(state.yaw)*mx+Math.sin(state.yaw)*my)*.04,(-Math.sin(state.yaw)*mx+Math.cos(state.yaw)*my)*.04,0]);}state.keys.add(e.code);$('walk-prompt').hidden=true;}}});
window.addEventListener('keyup',e=>{const moved=state.keys.delete(e.code);if(moved)log('keyboard movement');});window.addEventListener('blur',()=>state.keys.clear());document.addEventListener('visibilitychange',()=>state.keys.clear());
for(const button of document.querySelectorAll('[data-move]')){
 const key={forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD'}[button.dataset.move];button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);state.keys.add(key);$('walk-prompt').hidden=true;});for(const evt of['pointerup','pointercancel','lostpointercapture'])button.addEventListener(evt,()=>state.keys.delete(key));
}
$('orbit').onclick=$('outside').onclick=$('reset').onclick=()=>state.ready&&resetOrbit();$('walk').onclick=$('interior').onclick=()=>state.ready&&enter('inside');$('upstairs').onclick=()=>state.ready&&enter('upstairs');$('resume').onclick=()=>{canvas.focus();lockPointer();};
$('zoom-in').onclick=()=>{state.distance=Math.max(2,state.distance*.8);log('zoom in');};$('zoom-out').onclick=()=>{state.distance=Math.min(50,state.distance*1.25);log('zoom out');};
$('door-toggle').onclick=()=>state.ready&&requestDoor();$('shutter-toggle').onclick=()=>state.ready&&requestShutter();
$('light').onchange=()=>log('inspection light');$('help-toggle').onclick=()=>{$('help').hidden=!$('help').hidden;$('help-toggle').setAttribute('aria-expanded',String(!$('help').hidden));};
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else viewport.requestFullscreen().catch(()=>notice('Full screen is unavailable in this browser.'));};
function frame(time){
 requestAnimationFrame(frame);if(!state.ready)return;const dt=Math.min(.05,(time-frameTime)/1000||0);frameTime=time;
 advanceDoors(dt);
 if(state.mode!=='walk'){
  camera.position.set(state.target.x+state.distance*Math.sin(state.phi)*Math.sin(state.theta),state.target.y-state.distance*Math.sin(state.phi)*Math.cos(state.theta),state.target.z+state.distance*Math.cos(state.phi));camera.lookAt(state.target);
 }else{
  const k=state.keys,x=Number(k.has('KeyD')||k.has('ArrowRight'))-Number(k.has('KeyA')||k.has('ArrowLeft')),y=Number(k.has('KeyW')||k.has('ArrowUp'))-Number(k.has('KeyS')||k.has('ArrowDown'));
  if(x||y){const speed=(k.has('ShiftLeft')||k.has('ShiftRight')?3:1.6)*dt/Math.hypot(x,y);state.feet=world.move(state.feet,[(Math.cos(state.yaw)*x+Math.sin(state.yaw)*y)*speed,(-Math.sin(state.yaw)*x+Math.cos(state.yaw)*y)*speed,0],{dt});}else if(state.house?.native)state.feet=world.move(state.feet,[0,0,0],{dt});
  shownZ=THREE.MathUtils.lerp(shownZ,state.feet[2],1-Math.exp(-dt*18));camera.position.set(state.feet[0],state.feet[1],shownZ+EYE);
  camera.lookAt(camera.position.x+Math.sin(state.yaw)*Math.cos(state.pitch),camera.position.y+Math.cos(state.yaw)*Math.cos(state.pitch),camera.position.z+Math.sin(state.pitch));
 }
 if(nativeInteractions?.advance(dt))renderer.shadowMap.needsUpdate=true;refreshShutters();updateDoorControl();fill.visible=$('light').checked&&state.mode==='walk';fill.position.copy(camera.position);renderer.render(scene,camera);
}
async function boot(){
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 renderer.debug.onShaderError=(gl,program,vs,fs)=>{const error=gl.getProgramInfoLog(program)+' '+gl.getShaderInfoLog(vs)+' '+gl.getShaderInfoLog(fs);state.errors.push(error);console.error(error);};
 metalReflections=createMetalReflections(renderer);
 manifest=await fetch('./assets/manifest.json').then(r=>{if(!r.ok)throw Error('The Blender export is unavailable.');return r.json();});
 $('loading-text').textContent='Loading geometry and painted surfaces…';
 manifest.materials=weatherLegacyMaterialList(manifest.materials);
 const [buffer,mats]=await Promise.all([loadAssetBuffer(manifest.geometry),Promise.all(manifest.materials.map(makeMaterial))]);
 materials=mats;geometries=manifest.meshes.map(m=>makeGeometry(m,buffer));
 const previewIds=['01-caretaker-hut','02-two-storey-inn','03-blacksmith','04-stable','05-herbalist-shop','06-storehouse'];
 const groups=new Map();
 manifest.buildings.forEach((h,i)=>{const groupName=h.library==='Bridgehaven'?(h.workInProgress?'Bridgehaven · In progress':'Bridgehaven'):'Original buildings';if(!groups.has(groupName)){const group=document.createElement('section');group.className='building-collection';group.setAttribute('aria-label',groupName);const heading=document.createElement('h2');heading.textContent=groupName;group.append(heading);$('houses').append(group);groups.set(groupName,group);}const b=document.createElement('button');b.className='house-card';b.dataset.id=h.id;b.setAttribute('aria-pressed','false');const img=document.createElement('img');img.src=h.preview||(`./previews/${previewIds[i]}-revised.png`);img.alt='';const label=document.createElement('span');label.textContent=h.name;const small=document.createElement('small');const reused=Object.entries(manifest.bridgehavenReuse||{}).filter(([,id])=>id===h.id).length;small.textContent=(h.upstairs?'Two storeys':'Single storey')+(reused?' · Used in Bridgehaven':'');label.append(small);b.append(img,label);b.onclick=()=>selectHouse(h.id);groups.get(groupName).append(b);});
 nativeLibrary=new NativeBuildingLibrary({scene,environmentMap:metalReflections.texture,list:$('houses'),onBeforeClearActive:()=>{nativeInteractions?.dispose();nativeInteractions=null;shutterTarget=null;$('shutter-control').hidden=true;},onLoading:(building,busy)=>{$('loading-text').textContent='Loading '+building.name+'…';$('loading').hidden=!busy;},onActivate:selection=>{if(selection)selectNative(selection);},onError:error=>{state.errors.push(String(error.message||error));notice(String(error.message||error));}});await nativeLibrary.boot();downloads=new DownloadLibrary({status:$('download-status'),selectedLink:$('download-selected'),packLink:$('download-pack')});await downloads.boot();$('house-count').textContent=manifest.buildings.length+nativeLibrary.buildings.length;selectHouse(manifest.buildings[0].id);propsLibrary=new PropsLibrary({scene,camera,environmentMap:metalReflections.texture,onActivate:enterProp,onDeactivate:leaveProp,onError:error=>{state.errors.push(String(error.message||error));notice(String(error.message||error));}});propsLibrary.boot();resize();new ResizeObserver(resize).observe(viewport);state.ready=true;$('loading').hidden=true;requestAnimationFrame(frame);log('ready');const requestedModel=new URLSearchParams(location.search).get('model');if(requestedModel){const requestedBuilding=nativeLibrary.buildings.find(building=>building.id===requestedModel);if(requestedBuilding)nativeLibrary.select(requestedBuilding);}
 window.buildingStudio={shutters:()=>nativeInteractions,selectHouse,selectNative:id=>nativeLibrary?.select(nativeLibrary.buildings.find(building=>building.id===id)),selectProp:id=>propsLibrary?.select(propsLibrary.props.find(prop=>prop.id===id)),enter,resetOrbit,toggleDoor:requestDoor,validateRoute:id=>{const route=state.house?.native&&state.house.routes.find(entry=>entry.id===id);return route&&world?.walkRoute?world.walkRoute(route.feet):{ok:false,reason:'The selected native building has no such route.'};},state,props:()=>propsLibrary,native:()=>nativeLibrary,world:()=>world,renderer,camera};
}
window.addEventListener('error',e=>state.errors.push(e.message));
boot().catch(error=>{state.errors.push(String(error.message||error));$('loading-text').textContent=String(error.message||error)+' Reload to retry.';document.querySelector('.spinner').hidden=true;console.error(error);});
