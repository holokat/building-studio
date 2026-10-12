// Render-only native interactions. Collision remains authored by the separate
// triangle GLB: shutters are exterior dressing, never a route-opening mechanism.
const finitePoint=(value,name)=>{
 if(!Array.isArray(value)||value.length!==3||value.some(part=>!Number.isFinite(part)))throw new Error(`The ${name} point is invalid.`);
 return [...value];
};

export function normalizeNativeInteractions(value,buildingId='building'){
 if(value===undefined)return [];
 if(!Array.isArray(value))throw new Error(`The interactions for ${buildingId} are invalid.`);
 const ids=new Set();
 return value.map(item=>{
  if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||item.kind!=='shutter'||typeof item.label!=='string'||!item.label.trim()||item.axis!=='Z'||!Number.isFinite(item.closedAngle)||!Number.isFinite(item.openAngle)||Math.abs(item.openAngle-item.closedAngle)<1e-6||!Array.isArray(item.nodeNames)||!item.nodeNames.length||item.nodeNames.some(name=>typeof name!=='string'||!name))throw new Error(`The shutter interaction for ${buildingId} is invalid.`);
  const nodeNames=[...item.nodeNames],names=new Set(nodeNames);if(names.size!==nodeNames.length)throw new Error(`The shutter interaction for ${buildingId} repeats a mesh name.`);
  ids.add(item.id);
  return {id:item.id,kind:'shutter',label:item.label.trim(),hinge:finitePoint(item.hinge,`shutter hinge for ${buildingId}`),axis:'Z',closedAngle:item.closedAngle,openAngle:item.openAngle,nodeNames};
 });
}

function visible(node){for(let current=node;current;current=current.parent)if(current.visible===false)return false;return true;}
function point(THREE,value){return Array.isArray(value)?new THREE.Vector3(...value):value.clone();}
function ownerFor(node,owners){for(let current=node;current;current=current.parent){const owner=owners.get(current);if(owner)return owner;}return null;}
function ancestorOf(ancestor,node){for(let current=node.parent;current;current=current.parent)if(current===ancestor)return true;return false;}

export class NativeInteractionController {
 constructor({THREE,root,interactions=[],range=2.5,speed=14}={}){
  if(!THREE?.Group||!THREE?.Vector3||!THREE?.Box3||!THREE?.Raycaster||!root?.traverse)throw new Error('Native shutter interactions need a Three.js scene root.');
  this.THREE=THREE;this.root=root;this.range=range;this.speed=speed;this.raycaster=new THREE.Raycaster();this.byId=new Map();this.owners=new Map();this.disposed=false;
  const specs=normalizeNativeInteractions(interactions);
  root.updateMatrixWorld?.(true);
  const named=new Map();root.traverse(node=>{if(node.name){const list=named.get(node.name)||[];list.push(node);named.set(node.name,list);}});
  for(const spec of specs)this.#attach(spec,named);
 }
 #attach(spec,named){
  const parts=spec.nodeNames.map(name=>{
   const matches=named.get(name)||[];
   if(matches.length!==1)throw new Error(`Shutter ${spec.id} needs exactly one mesh named ${name}.`);
   return matches[0];
  });
  for(let left=0;left<parts.length;left++)for(let right=left+1;right<parts.length;right++)if(ancestorOf(parts[left],parts[right])||ancestorOf(parts[right],parts[left]))throw new Error(`Shutter ${spec.id} cannot attach both a mesh and its child.`);
  const {THREE,root}=this,worldHinge=new THREE.Vector3(...spec.hinge),localHinge=root.worldToLocal?root.worldToLocal(worldHinge.clone()):worldHinge.clone(),worldAxis=new THREE.Vector3(0,0,1),worldEnd=worldHinge.clone().add(worldAxis),localEnd=root.worldToLocal?root.worldToLocal(worldEnd):worldEnd,localAxis=localEnd.sub(localHinge).normalize();
  const pivot=new THREE.Group();pivot.name=`native-shutter-pivot:${spec.id}`;pivot.position.copy(localHinge);root.add(pivot);root.updateMatrixWorld?.(true);
  const originals=parts.map(part=>({part,parent:part.parent}));
  for(const {part} of originals)pivot.attach(part);
  const state={...spec,pivot,parts,originals,axis:localAxis,angle:spec.closedAngle,target:spec.closedAngle};
  this.byId.set(spec.id,state);for(const part of parts)this.owners.set(part,state);this.#apply(state,spec.closedAngle);
 }
 #apply(state,angle){state.angle=angle;state.pivot.quaternion.setFromAxisAngle(state.axis,angle-state.closedAngle);state.pivot.updateMatrixWorld?.(true);}
 #setRay(origin,target){const direction=target.clone().sub(origin),distance=direction.lengthSq?.()**.5;if(!distance)return null;direction.normalize();this.raycaster.set(origin,direction);return distance;}
 #intersections(objects){return this.raycaster.intersectObjects?this.raycaster.intersectObjects(objects,true):[];}
 #rootIntersections(){return this.raycaster.intersectObject?this.raycaster.intersectObject(this.root,true):this.#intersections([this.root]);}
 #unoccluded(origin,state){
  const first=this.#rootIntersections().find(hit=>visible(hit.object));
  return Boolean(first&&ownerFor(first.object,this.owners)===state);
 }
 #hitState(origin,state){
  const parts=state.parts.filter(visible);if(!parts.length)return null;
  const box=new this.THREE.Box3();for(const part of parts)box.union(new this.THREE.Box3().setFromObject(part));
  const centre=box.getCenter(new this.THREE.Vector3());if(!this.#setRay(origin,centre))return null;
  const hit=this.#intersections(parts).find(entry=>visible(entry.object));
  return hit&&ownerFor(hit.object,this.owners)===state&&this.#unoccluded(origin,state)?hit:null;
 }
 state(id){const state=this.byId.get(id);if(!state)return null;return {id:state.id,label:state.label,angle:state.angle,closedAngle:state.closedAngle,openAngle:state.openAngle,open:Math.abs(state.angle-state.openAngle)<.008,target:state.target};}
 setOpen(id,open){const state=this.byId.get(id);if(!state||this.disposed)return false;state.target=open?state.openAngle:state.closedAngle;return true;}
 toggle(id){const state=this.byId.get(id);if(!state||this.disposed)return false;const towardOpen=Math.abs(state.target-state.openAngle)>Math.abs(state.target-state.closedAngle);state.target=towardOpen?state.openAngle:state.closedAngle;return true;}
 advance(dt){if(this.disposed||!Number.isFinite(dt)||dt<=0)return false;const blend=1-Math.exp(-this.speed*Math.min(dt,.1));let changed=false;for(const state of this.byId.values()){const next=state.angle+(state.target-state.angle)*blend;if(Math.abs(next-state.angle)>.00001){this.#apply(state,next);changed=true;}if(Math.abs(state.target-state.angle)<.001)this.#apply(state,state.target);}return changed;}
 pick(origin,direction,range=this.range){
  if(this.disposed||!origin||!direction)return null;
  const {THREE}=this,from=point(THREE,origin),ray=point(THREE,direction);if(ray.lengthSq?.()===0)return null;ray.normalize();this.root.updateMatrixWorld?.(true);this.raycaster.set(from,ray);
  const parts=[...this.byId.values()].flatMap(state=>state.parts.filter(visible));
  for(const hit of this.#intersections(parts)){if(hit.distance>range)break;const state=ownerFor(hit.object,this.owners);if(state&&visible(hit.object)&&this.#unoccluded(from,state))return {...this.state(state.id),distance:hit.distance};}
  return null;
 }
 nearest(position,range=this.range){
  if(this.disposed||!position)return null;
  const {THREE}=this,from=point(THREE,position),candidates=[];this.root.updateMatrixWorld?.(true);
  for(const state of this.byId.values()){
   if(!state.parts.some(visible))continue;
   const box=new THREE.Box3();for(const part of state.parts)box.union(new THREE.Box3().setFromObject(part));const closest=box.clampPoint(from,new THREE.Vector3()),distance=closest.distanceTo(from);
   if(distance<=range)candidates.push({state,distance});
  }
  candidates.sort((left,right)=>left.distance-right.distance);
  for(const candidate of candidates){const hit=this.#hitState(from,candidate.state);if(hit)return {...this.state(candidate.state.id),distance:Math.min(candidate.distance,hit.distance)};}
  return null;
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.root.updateMatrixWorld?.(true);
  for(const state of this.byId.values()){
   this.#apply(state,state.closedAngle);
   for(const {part,parent} of state.originals)if(parent){parent.updateMatrixWorld?.(true);parent.attach(part);}
   state.pivot.parent?.remove(state.pivot);
  }
  this.byId.clear();this.owners.clear();
 }
}
