import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World,doorMatrix,transform} from '../web/src/navigation.js';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const mesh={bounds:[[0,-.1,0],[1,.1,2]]};
function fixture(locked=false){return {instances:[
 {g:0,m:0,name:'Leaf',matrix:identity,door:false,doorId:'front'},
 {g:0,m:0,name:'Ring pull',matrix:[...identity.slice(0,12),.6,0,1,1],door:false,doorId:'front',hardware:true},
 {g:0,m:0,name:'Frame',matrix:[...identity.slice(0,12),2,0,0,1],door:false}
],doors:[{id:'front',pivot:[0,0,0],axis:[0,0,1],openAngle:Math.PI/2,defaultOpen:false,label:'Front door',locked,instanceIndices:[0,1]}]};}

test('manifest leaf and attached hardware hinge together while static frames retain closed matrices',()=>{
 const house=fixture(),world=new World(house,[mesh]);
 assert.equal(world.ray([.5,-1,1],[0,1,0],2)?.name,'Leaf');
 const closedFrame=world.matrixForInstance(2),closedHardware=world.matrixForInstance(1);
 assert.ok(world.setDoorOpen('front',true));
 assert.equal(world.ray([.5,-1,1],[0,1,0],2),null,'open leaf leaves the threshold clear');
 assert.deepEqual(world.matrixForInstance(2),closedFrame,'frame never receives door motion');
 assert.notDeepEqual(world.matrixForInstance(1),closedHardware,'door hardware follows the leaf');
 assert.deepEqual(transform(world.matrixForInstance(0),[1,0,0]).map(v=>Math.round(v*1000)/1000),[0,1,0]);
});

test('each leaf owns its collider, and a closing leaf stops for the walker',()=>{
 const world=new World(fixture(),[mesh]);
 assert.ok(world.setDoorOpen('front',true));
 assert.equal(world.setDoorAngle('front',0,[.5,0,0]),false,'occupant blocks the closing sweep');
 assert.ok(world.doorState('front').open);
 assert.ok(world.setDoorAngle('front',0,[2,2,0]));
 assert.ok(world.ray([.5,-1,1],[0,1,0],2),'closed leaf restores collision');
});

test('opening also stops when the walker stands in the swing arc',()=>{
 const world=new World(fixture(),[mesh]);
 assert.equal(world.setDoorOpen('front',true,[0,.5,0]),false);
 assert.equal(world.doorState('front').open,false);
});

test('nearby doors need a clear sightline from the walker',()=>{
 const house=fixture();house.instances.push({g:0,m:0,name:'Wall',matrix:[...identity.slice(0,12),-.5,-.5,0,1],door:false});
 const blocked=new World(house,[mesh]);
 assert.equal(blocked.nearestDoor([0,-1,0]),null);
 assert.equal(new World(fixture(),[mesh]).nearestDoor([0,-1,0])?.id,'front');
});

test('locked leaves stay visible and collidable, and cannot be opened through global state',()=>{
 const world=new World(fixture(true),[mesh]);
 assert.equal(world.setDoorOpen('front',true),false);
 assert.equal(world.doorState('front').locked,true);
 assert.ok(world.ray([.5,-1,1],[0,1,0],2));
 assert.equal('doorsOpen' in world,false);
});

test('doorMatrix uses the declared world pivot and axis',()=>{
 const door={pivot:[3,4,0],axis:[0,0,1]};
 const shifted=[...identity.slice(0,12),3,4,0,1];
 assert.deepEqual(transform(doorMatrix(shifted,door,Math.PI/2),[1,0,0]).map(v=>Math.round(v*1000)/1000),[3,5,0]);
});

test('exported leaves use explicit ownership and preserve the secured loading hatch',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../web/assets/manifest.json',import.meta.url)));
 const leaves=manifest.buildings.flatMap(house=>(house.doors||[]).map(door=>({house,door})));
 assert.equal(leaves.filter(({house})=>house.sourceScene.startsWith('RKReference_')).length,13);
 for(const {house,door} of leaves){
  assert.deepEqual(door.axis,[0,0,1]);assert.equal(door.defaultOpen,false);assert.equal(typeof door.openAngle,'number');
  for(const index of door.instanceIndices)assert.equal(house.instances[index]?.doorId,door.id,`${house.id}:${door.id}:${index}`);
 }
 const hatch=leaves.find(({door})=>door.locked);assert.equal(hatch?.house.id,'Storehouse');
 const world=new World(hatch.house,manifest.meshes);assert.equal(world.setDoorOpen(hatch.door.id,true),false);
});
