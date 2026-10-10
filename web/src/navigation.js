// Collision bounds come from evaluated Blender pieces. Door matrices are closed
// world matrices and are rotated around the manifest's world-space pivot.
export const EYE=1.65, RADIUS=.18, UP=.32, DOWN=.38;
const cellSize=2;
export function inverse(m){
 const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10],det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
 if(Math.abs(det)<1e-12)return null;
 const o=[(e*i-f*h)/det,(f*g-d*i)/det,(d*h-e*g)/det,0,(c*h-b*i)/det,(a*i-c*g)/det,(b*g-a*h)/det,0,(b*f-c*e)/det,(c*d-a*f)/det,(a*e-b*d)/det,0,0,0,0,1];
 for(let r=0;r<3;r++)o[12+r]=-(o[r]*m[12]+o[4+r]*m[13]+o[8+r]*m[14]);return o;
}
export function transform(m,p,w=1){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12]*w,m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13]*w,m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]*w];}
export function collider(instance,mesh,matrix=instance.matrix){
 const inv=inverse(matrix);if(!inv)return null;const box=mesh.bounds,corners=[];
 for(let n=0;n<8;n++)corners.push(transform(matrix,[box[n&1?1:0][0],box[n&2?1:0][1],box[n&4?1:0][2]]));
 return {inverse:inv,box,matrix,doorId:instance.doorId||null,roof:instance.roof,name:instance.name,min:[0,1,2].map(a=>Math.min(...corners.map(p=>p[a]))),max:[0,1,2].map(a=>Math.max(...corners.map(p=>p[a])))};
}
function multiply(a,b){const o=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
function translation([x,y,z]){return [1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];}
function rotation([x,y,z],angle){const length=Math.hypot(x,y,z)||1;x/=length;y/=length;z/=length;const c=Math.cos(angle),s=Math.sin(angle),t=1-c;return [t*x*x+c,t*x*y+s*z,t*x*z-s*y,0,t*x*y-s*z,t*y*y+c,t*y*z+s*x,0,t*x*z+s*y,t*y*z-s*x,t*z*z+c,0,0,0,0,1];}
export function doorMatrix(matrix,door,angle){return multiply(multiply(multiply(translation(door.pivot),rotation(door.axis,angle)),translation(door.pivot.map(v=>-v))),matrix);}
export function intersect(c,start,dir,limit){
 const p=transform(c.inverse,start),d=transform(c.inverse,dir,0);let near=-Infinity,far=Infinity,axis=-1,sign=0;
 for(let a=0;a<3;a++){
  if(Math.abs(d[a])<1e-10){if(p[a]<c.box[0][a]||p[a]>c.box[1][a])return null;continue;}
  let t0=(c.box[0][a]-p[a])/d[a],t1=(c.box[1][a]-p[a])/d[a],s=-1;if(t0>t1){[t0,t1]=[t1,t0];s=1;}
  if(t0>near){near=t0;axis=a;sign=s;}far=Math.min(far,t1);if(near>far)return null;
 }
 if(near<-.00001||near>limit||far<0)return null;
 let n=[c.inverse[axis],c.inverse[4+axis],c.inverse[8+axis]].map(v=>v*sign),len=Math.hypot(...n);n=n.map(v=>v/len);
 return {distance:Math.max(0,near),normal:n,name:c.name};
}
export class World{
 constructor(house,meshes){
  this.house=house;this.meshes=meshes;this.instances=house.instances;this.roofsHidden=false;this.grid=new Map();this.doors=new Map();this.doorByInstance=new Map();
  for(const spec of Array.isArray(house.doors)?house.doors:[])if(spec?.id&&Array.isArray(spec.pivot)&&Array.isArray(spec.axis)&&Array.isArray(spec.instanceIndices))this.doors.set(spec.id,{...spec,instanceIndices:[...spec.instanceIndices],angle:spec.defaultOpen?spec.openAngle:0});
  // Compatibility for the current pre-contract export. New exports only use
  // explicit doorId membership and never inherit this broad legacy behavior.
  if(!this.doors.size)this.instances.forEach((instance,index)=>{if(instance.door)this.doors.set(`legacy-${index}`,{id:`legacy-${index}`,label:'Door',pivot:instance.matrix.slice(12,15),axis:[0,0,1],openAngle:Math.PI/2,defaultOpen:false,instanceIndices:[index],angle:0,legacy:true});});
  for(const door of this.doors.values())for(const index of door.instanceIndices){const instance=this.instances[index];if(instance&&((door.legacy&&instance.door)||(!door.legacy&&instance.doorId===door.id)))this.doorByInstance.set(index,door.id);}
  // Aim interaction rays at the leaf, since a recessed hinge can sit behind masonry.
  for(const door of this.doors.values()){
   const leaves=door.instanceIndices.filter(index=>this.doorByInstance.get(index)===door.id&&!this.instances[index].hardware).map(index=>collider(this.instances[index],this.meshes[this.instances[index].g])).filter(Boolean);
   door.interactionPoint=leaves.length?[0,1,2].map(axis=>(Math.min(...leaves.map(c=>c.min[axis]))+Math.max(...leaves.map(c=>c.max[axis])))/2):[door.pivot[0],door.pivot[1],door.pivot[2]+1];
  }
  this.staticColliders=[];this.doorColliders=[];this.staticGrid=new Map();this.doorGrid=new Map();
  this.instances.forEach((instance,index)=>{if(this.doorByInstance.has(index))return;const c=collider(instance,this.meshes[instance.g]);if(c)this.staticColliders.push(c);});
  this.staticGrid=this.gridFor(this.staticColliders);this.rebuildDoorColliders();
 }
 gridFor(colliders){const grid=new Map();for(const c of colliders)for(let x=Math.floor(c.min[0]/cellSize);x<=Math.floor(c.max[0]/cellSize);x++)for(let y=Math.floor(c.min[1]/cellSize);y<=Math.floor(c.max[1]/cellSize);y++)for(let z=Math.floor(c.min[2]/cellSize);z<=Math.floor(c.max[2]/cellSize);z++){const key=`${x},${y},${z}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(c);}return grid;}
 rebuildDoorColliders(){
  this.doorColliders=[];for(const [index,id] of this.doorByInstance){const instance=this.instances[index],door=this.doors.get(id),c=collider({...instance,doorId:id},this.meshes[instance.g],doorMatrix(instance.matrix,door,door.angle));if(c)this.doorColliders.push(c);}
  this.doorGrid=this.gridFor(this.doorColliders);this.colliders=[...this.staticColliders,...this.doorColliders];
 }
 matrixForInstance(index){const instance=this.instances[index],id=this.doorByInstance.get(index),door=id&&this.doors.get(id);return door?doorMatrix(instance.matrix,door,door.angle):instance.matrix;}
 doorIdForInstance(index){return this.doorByInstance.get(index)||null;}
 doorState(id){const door=this.doors.get(id);return door&&{id:door.id,label:door.label||'Door',angle:door.angle,openAngle:door.openAngle,locked:Boolean(door.locked),open:Math.abs(door.angle-door.openAngle)<.01};}
 nearestDoor(position,range=2.2){let best=null;const eye=[position[0],position[1],position[2]+EYE];for(const door of this.doors.values()){const target=transform(doorMatrix(translation([0,0,0]),door,door.angle),door.interactionPoint),delta=target.map((v,i)=>v-eye[i]),distance=Math.hypot(...delta);if(distance>range)continue;const hit=this.ray(eye,delta.map(v=>v/distance),distance+.03,door.id);if(hit&&hit.distance<distance-.03)continue;if(!best||distance<best.distance)best={...this.doorState(door.id),distance};}return best;}
 setDoorAngle(id,angle,occupant=null){
  const door=this.doors.get(id);if(!door||door.locked)return false;const next=Math.sign(door.openAngle||1)*Math.min(Math.abs(door.openAngle),Math.abs(angle));
  if(occupant&&this.doorWouldHit(id,next,occupant))return false;door.angle=next;this.rebuildDoorColliders();return true;
 }
 setDoorOpen(id,open,occupant=null){const door=this.doors.get(id);return door?this.setDoorAngle(id,open?door.openAngle:0,occupant):false;}
 openAllDoors(){for(const door of this.doors.values())this.setDoorOpen(door.id,true);}
 doorWouldHit(id,angle,position){
  const door=this.doors.get(id);if(!door)return false;for(const index of door.instanceIndices){const instance=this.instances[index];if(!instance||this.doorByInstance.get(index)!==id)continue;const c=collider({...instance,doorId:id},this.meshes[instance.g],doorMatrix(instance.matrix,door,angle));if(!c)continue;
   const pad=[0,1,2].map(axis=>RADIUS*Math.hypot(c.inverse[axis],c.inverse[4+axis],c.inverse[8+axis]));
   for(const height of [.12,.9,EYE]){const p=transform(c.inverse,[position[0],position[1],position[2]+height]);if(p[0]>=c.box[0][0]-pad[0]&&p[0]<=c.box[1][0]+pad[0]&&p[1]>=c.box[0][1]-pad[1]&&p[1]<=c.box[1][1]+pad[1]&&p[2]>=c.box[0][2]-pad[2]&&p[2]<=c.box[1][2]+pad[2])return true;}
  }return false;
 }
 ray(p,d,length,ignoreDoorId=null){
  const end=p.map((v,i)=>v+d[i]*length),candidates=new Set();let best=null;
  for(let x=Math.floor(Math.min(p[0],end[0])/cellSize);x<=Math.floor(Math.max(p[0],end[0])/cellSize);x++)for(let y=Math.floor(Math.min(p[1],end[1])/cellSize);y<=Math.floor(Math.max(p[1],end[1])/cellSize);y++)for(let z=Math.floor(Math.min(p[2],end[2])/cellSize);z<=Math.floor(Math.max(p[2],end[2])/cellSize);z++)for(const grid of [this.staticGrid,this.doorGrid])for(const c of grid.get(`${x},${y},${z}`)||[])candidates.add(c);
  for(const c of candidates){if(ignoreDoorId!==null&&c.doorId===ignoreDoorId||c.roof&&this.roofsHidden)continue;const hit=intersect(c,p,d,best?best.distance:length);if(hit)best=hit;}
  if(d[2]<0){const z=-.58,dist=(z-p[2])/d[2];if(dist>=0&&dist<=length&&(!best||dist<best.distance))best={distance:dist,normal:[0,0,1],name:'Inspection ground'};}return best;
 }
 floor(p,up=UP,down=DOWN){let z=null;for(const [x,y]of[[0,0],[.055,0],[-.055,0],[0,.055],[0,-.055]]){const start=[p[0]+x,p[1]+y,p[2]+up+.015],hit=this.ray(start,[0,0,-1],up+down+.03);if(hit&&hit.normal[2]>.6)z=Math.max(z??-Infinity,start[2]-hit.distance);}return z;}
 clear(p){if(this.ray([p[0],p[1],p[2]+.04],[0,0,1],EYE+.1))return false;for(const h of[UP+.035,.9,EYE])for(let i=0;i<8;i++)if(this.ray([p[0],p[1],p[2]+h],[Math.cos(i*Math.PI/4),Math.sin(i*Math.PI/4),0],RADIUS))return false;return true;}
 step(p,d){const q=[p[0]+d[0],p[1]+d[1],p[2]],z=this.floor(q);if(z===null||Math.abs(q[0])>40||Math.abs(q[1])>40)return p;q[2]=z+.006;const delta=q.map((v,i)=>v-p[i]),len=Math.hypot(...delta);if(len>1e-5)for(const h of[.65,EYE])if(this.ray([p[0],p[1],p[2]+h],delta.map(v=>v/len),len))return p;return this.clear(q)?q:p;}
 move(position,delta){let p=[...position];const count=Math.max(1,Math.ceil(Math.hypot(...delta)/.06)),d=delta.map(v=>v/count);for(let i=0;i<count;i++){let q=this.step(p,d);if(Math.hypot(...q.map((v,j)=>v-p[j]))<.0001)for(const a of[[d[0],0,0],[0,d[1],0]]){if(Math.hypot(...a)<.0001)continue;q=this.step(p,a);if(Math.hypot(...q.map((v,j)=>v-p[j]))>.0001)break;}p=q;}return p;}
 ground(p){const q=[...p],z=this.floor(q,.35,2);if(z!==null)q[2]=z+.006;return q;}
}
