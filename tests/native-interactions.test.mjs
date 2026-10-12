import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import test from 'node:test';
const interactionModule=existsSync(new URL('../web/src/native-interactions.js',import.meta.url))?'../web/src/native-interactions.js':'../src/native-interactions.js';
const {NativeInteractionController,normalizeNativeInteractions}=await import(interactionModule);

class Vector3 {constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} clone(){return new Vector3(this.x,this.y,this.z);} add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;} sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;} normalize(){const n=Math.hypot(this.x,this.y,this.z)||1;this.x/=n;this.y/=n;this.z/=n;return this;} lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;} distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);} copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}}
class Quaternion {setFromAxisAngle(axis,angle){this.axis=axis.clone();this.angle=angle;return this;}}
class Box3 {constructor(min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity)){this.min=min;this.max=max;} setFromObject(node){this.min=node.box.min.clone();this.max=node.box.max.clone();return this;} union(box){this.min.x=Math.min(this.min.x,box.min.x);this.min.y=Math.min(this.min.y,box.min.y);this.min.z=Math.min(this.min.z,box.min.z);this.max.x=Math.max(this.max.x,box.max.x);this.max.y=Math.max(this.max.y,box.max.y);this.max.z=Math.max(this.max.z,box.max.z);return this;} getCenter(target){return target.copy(new Vector3((this.min.x+this.max.x)/2,(this.min.y+this.max.y)/2,(this.min.z+this.max.z)/2));} clampPoint(point,target){return target.copy(new Vector3(Math.max(this.min.x,Math.min(this.max.x,point.x)),Math.max(this.min.y,Math.min(this.max.y,point.y)),Math.max(this.min.z,Math.min(this.max.z,point.z))));}}
class Group {constructor(name=''){this.name=name;this.children=[];this.parent=null;this.visible=true;this.position=new Vector3();this.quaternion=new Quaternion();this.box={min:new Vector3(),max:new Vector3()};} add(node){node.parent?.remove(node);this.children.push(node);node.parent=this;return this;} remove(node){this.children=this.children.filter(child=>child!==node);if(node.parent===this)node.parent=null;} attach(node){return this.add(node);} traverse(visit){visit(this);for(const child of [...this.children])child.traverse(visit);} updateMatrixWorld(){} worldToLocal(value){return value;} getWorldPosition(target){return target.copy(this.position);}}
class Raycaster {static partHits=[];static rootHits=[];set(origin,direction){this.origin=origin;this.direction=direction;} intersectObjects(){return Raycaster.partHits;} intersectObject(){return Raycaster.rootHits;}}
const THREE={Vector3,Group,Box3,Raycaster};
function shutter(){const root=new Group('root'),left=new Group('window_shutter_left'),right=new Group('window_shutter_right');left.position=new Vector3(1,0,1);right.position=new Vector3(2,0,1);left.box={min:new Vector3(10,-.2,.8),max:new Vector3(11,.2,1.2)};right.box={min:new Vector3(12,-.2,.8),max:new Vector3(13,.2,1.2)};root.add(left);root.add(right);return {root,left,right};}
const spec={id:'upper-window',kind:'shutter',label:'Upper window shutters',hinge:[1,0,1],axis:'Z',closedAngle:0,openAngle:-1.75,nodeNames:['window_shutter_left','window_shutter_right']};

test('named shutter leaves are reparented around their authored hinge without moving their closed pose',()=>{
 const {root,left,right}=shutter(),controller=new NativeInteractionController({THREE,root,interactions:[spec]});
 const state=controller.byId.get(spec.id);assert.equal(left.parent,state.pivot);assert.equal(right.parent,state.pivot);assert.deepEqual([left.position.x,left.position.y,left.position.z],[1,0,1]);assert.equal(state.angle,0);
});
test('shutters animate open, reverse immediately, and round-trip to the closed angle',()=>{
 const {root}=shutter(),controller=new NativeInteractionController({THREE,root,interactions:[spec]});
 assert.equal(controller.toggle(spec.id),true);controller.advance(.05);const partial=controller.state(spec.id).angle;assert.ok(partial<0&&partial>-1.75);
 controller.toggle(spec.id);for(let frame=0;frame<10;frame++)controller.advance(.1);assert.equal(controller.state(spec.id).angle,0);assert.equal(controller.byId.get(spec.id).pivot.quaternion.angle,0);
});
test('only visible nearby or ray-hit shutters can be selected, and disposal restores leaf ownership',()=>{
 const {root,left,right}=shutter(),controller=new NativeInteractionController({THREE,root,interactions:[spec],range:2.5});
 Raycaster.partHits=[{object:right,distance:1.2}];Raycaster.rootHits=[{object:right,distance:1.2}];assert.equal(controller.nearest([10.1,0,1])?.id,spec.id,'evaluated vertices, rather than node origins, set nearby range');assert.equal(controller.nearest([20,0,1]),null);
 assert.equal(controller.pick([0,0,0],[1,0,0])?.id,spec.id);
 Raycaster.rootHits=[{object:new Group('stone-wall'),distance:.4}];assert.equal(controller.pick([0,0,0],[1,0,0]),null,'an opaque wall before the leaf blocks a ray interaction');assert.equal(controller.nearest([10.1,0,1]),null,'nearby selection also respects the wall');Raycaster.rootHits=[{object:right,distance:1.2}];
 right.visible=false;left.visible=false;assert.equal(controller.nearest([1,0,1]),null);assert.equal(controller.pick([0,0,0],[1,0,0]),null);
 left.visible=true;right.visible=true;controller.dispose();assert.equal(left.parent,root);assert.equal(right.parent,root);assert.equal(controller.toggle(spec.id),false);
});
test('manifest interaction contract rejects malformed axes, missing leaves, and duplicate ids',()=>{
 assert.throws(()=>normalizeNativeInteractions([{...spec,axis:'Y'}]));assert.throws(()=>normalizeNativeInteractions([{...spec,nodeNames:['same','same']} ]));assert.throws(()=>normalizeNativeInteractions([spec,{...spec}]));
 const {root}=shutter();assert.throws(()=>new NativeInteractionController({THREE,root,interactions:[{...spec,nodeNames:['missing']}]}));
});
