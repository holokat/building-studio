import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {World} from '../web/src/navigation.js';
const root=new URL('../web/',import.meta.url);
const assets=new URL('assets/',root);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',assets)));
function route(world,p,targets){
 for(const target of targets){
  for(let n=0;n<800;n++){
   const d=[target[0]-p[0],target[1]-p[1],0],len=Math.hypot(...d);if(len<.035)break;
   const q=world.move(p,d.map(v=>v/len*Math.min(.055,len)));
   if(Math.hypot(...q.map((v,i)=>v-p[i]))<1e-5)break;p=q;
  }
  assert.ok(Math.hypot(p[0]-target[0],p[1]-target[1])<.07,`Route stopped at ${p}, expected ${target}`);
 }return p;
}
function walkWorld(house){const world=new World(house,manifest.meshes);world.openAllDoors();return world;}
test('The public export contains the six original scenes, three Bridgehaven buildings, and packed texture exports',()=>{
 assert.equal(manifest.buildings.filter(h=>h.sourceScene.startsWith('RKReference_')).length,6);assert.equal(manifest.multiresDisplayLevel,2);
 assert.equal(manifest.buildings.length,9);
 const size=statSync(new URL(manifest.geometry,assets)).size;
 for(const g of manifest.meshes){assert.ok(g.count>0);assert.ok(g.offset+g.count*manifest.stride*4<=size);}
 const names=new Set();for(const mat of manifest.materials)for(const kind of['map','paint','normal','overlay'])if(mat[kind]){names.add(mat[kind]);assert.ok(statSync(new URL(mat[kind],assets)).size>0);}
 assert.ok([...names].some(n=>n.includes('Weathering_ART_Fieldstone')));assert.ok([...names].some(n=>n.includes('Weathering_ART_Slate')));assert.ok([...names].some(n=>n.includes('SculptNormal')));
});
for(const house of manifest.buildings.filter(h=>h.sourceScene.startsWith('RKReference_'))){
 test(`${house.name}: walk through the entrance and back outside`,()=>{
  const w=walkWorld(house),start=w.ground(house.entry);
  const inside=route(w,start,[house.inside]);assert.ok(inside[2]>-.15);
  const back=route(w,inside,[house.entry]);assert.ok(back[2]<-.4);
 });
 if(house.upstairs)test(`${house.name}: ascend, turn onto landing, return and descend`,()=>{
  const w=walkWorld(house),x=house.upstairs[0];
  // Approach across the lower landing before turning onto the flight.
  const approach=route(w,w.ground([x-.8,.65,0]),[[x,.65,0]]);
  assert.ok(Math.abs(approach[2])<.08,'The lower landing must remain level');
  const top=route(w,approach,[[x,5.3,3]]);assert.ok(Math.abs(top[2]-3)<.15,top.join(','));
  const turn=route(w,top,[[x-1.3,5.3,3]]);assert.ok(Math.abs(turn[2]-3)<.15);
  const bottom=route(w,turn,[[x,5.3,3],[x,.35,0]]);assert.ok(bottom[2]<.5);
 });
}
test('Wall collision blocks movement; explicitly opening leaves clears the entrance',()=>{
 const w=new World(manifest.buildings[0],manifest.meshes);let p=w.ground([1,1.5,0]);
 for(let i=0;i<80;i++)p=w.move(p,[-.055,0,0]);assert.ok(p[0]>.15&&p[0]<.65,p.join(','));
 const ray=[[1,-.4,1.1],[0,1,0],1];assert.ok(w.ray(...ray),'closed leaf is a collider');w.openAllDoors();assert.equal(w.ray(...ray),null);
});
test('Movement cannot tunnel through a wall with a long frame',()=>{
 const w=new World(manifest.buildings[0],manifest.meshes),p=w.ground([1,1.5,0]),after=w.move(p,[-3,0,0]);assert.ok(after[0]>.15);
});
test('Blacksmith: side door connects the room to the equipped forge bay; adjoining walls remain solid',()=>{
 const house=manifest.buildings.find(h=>h.id==='Blacksmith'),w=walkWorld(house);
 const start=w.ground([2.8,3,0]),bay=route(w,start,[[5.35,3,0],[5.35,3.7,0]]);
 route(w,bay,[[5.35,3,0],[2.8,3,0]]);
 for(const y of [1,5])assert.ok(w.ray([3.3,y,1.4],[1,0,0],1.4),'The shared wall must enclose the room');
 assert.equal(w.ray([3.3,3,1.4],[1,0,0],1.4),null);
 const closed=new World(house,manifest.meshes);assert.ok(closed.ray([3.3,3,1.4],[1,0,0],1.4),'Closed side door is the positive control');
 for(const path of ['/Smithy_Anvil','/Smithy_Bellows','/Smithy_ForgeHearth'])assert.ok(house.instances.some(i=>i.path===path),path);
});
test('Stable: the authored timber ramp supports walking from ground to threshold and back',()=>{
 const house=manifest.buildings.find(h=>h.id==='Stable'),w=walkWorld(house);
 const hit=w.ray([-1.3,2.45,1],[0,0,-1],2);
 assert.ok(hit?.name.startsWith('Stable_Ramp_'),'The floor must come from the Blender ramp');
 const start=w.ground([-3.1,2.45,-.58]),inside=route(w,start,[[.65,2.45,0],[.65,2.85,0],[8,2.85,0]]);
 assert.ok(Math.abs(inside[2])<.08);
 const back=route(w,inside,[[.65,2.85,0],[.65,2.45,0],[-3.1,2.45,-.58]]);assert.ok(Math.abs(back[2]+.58)<.02);
});
test('Stable: the former front opening is fenced and the horse entrance has width and headroom',()=>{
 const house=manifest.buildings.find(h=>h.id==='Stable'),w=walkWorld(house);
 assert.ok(house.instances.some(i=>i.path==='/Stable_ClosedFrontBay'&&!i.door));
 for(const x of [6.3,6.6,7,7.4,7.7])assert.ok(w.ray([x,-.4,.7],[0,1,0],.8),'Front infill must remain closed in walkthrough mode');
 for(const y of [1.5,2,2.45,3,3.4])for(const z of [.15,1.2,2.4])assert.equal(w.ray([-.4,y,z],[1,0,0],.8),null,`Horse entrance obstructed at ${y},${z}`);
 for(const y of [2.5,2.85,3.2])route(w,w.ground([.65,y,0]),[[8,y,0]]);
 route(w,w.ground([9,-1.4,-.58]),[[9,.9,0]]);
});
