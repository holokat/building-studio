import {normalizeNativeInteractions} from './native-interactions.js';
import {loadAssetBuffer,validRelativePath} from './asset-loader.js';
import {TriangleWorld,triangle} from './triangle-world.js';
const ROOT='./assets/exploration/',MANIFEST='manifest.json';
const finitePoint=(value,name)=>{if(!Array.isArray(value)||value.length!==3||value.some(v=>!Number.isFinite(v)))throw new Error(`The ${name} point is invalid.`);return [...value];};
const positive=(value,name)=>{if(!Number.isFinite(value)||value<=0)throw new Error(`The ${name} is invalid.`);return value;};
export function validNativeDownloadUrl(value){
 if(typeof value!=='string')return false;
 if(!/^[a-z][a-z0-9+.-]*:/i.test(value))return validRelativePath(value);
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='github.com'&&url.username===''&&url.password===''&&url.search===''&&url.hash===''&&url.pathname.startsWith('/holokat/building-studio/releases/download/')&&url.pathname.length>'/holokat/building-studio/releases/download/'.length;}catch{return false;}
}
export function normalizeExplorationManifest(payload){
 if(!payload||payload.version!==1||!Array.isArray(payload.buildings))throw new Error('The native exploration manifest is unavailable or unsupported.');
 const ids=new Set();return payload.buildings.map(item=>{
  if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||typeof item.name!=='string'||!item.name||!validRelativePath(item.model)||(item.walkable!==undefined&&typeof item.walkable!=='boolean')||((item.walkable!==false)&&!validRelativePath(item.collision))||(item.collision!==undefined&&!validRelativePath(item.collision)))throw new Error('The native exploration manifest contains an invalid building.');
  if(item.preview!==undefined&&!validRelativePath(item.preview))throw new Error(`The preview path for ${item.id} is invalid.`);
  if(!Array.isArray(item.dimensions)||item.dimensions.length!==3)throw new Error(`The dimensions for ${item.id} are invalid.`);
  const dimensions=item.dimensions.map((v,i)=>positive(v,`dimension ${i + 1} for ${item.id}`));
  const marks=item.bookmarks;if(!marks||typeof marks!=='object'||!marks.outside||!marks.inside)throw new Error(`The bookmarks for ${item.id} are invalid.`);
  const outside={target:finitePoint(marks.outside.target,`outside target for ${item.id}`),distance:positive(marks.outside.distance,`outside distance for ${item.id}`)};
  const bookmark=(value,label)=>{
   if(!value)return null;
   const yaw=value.yaw===undefined?0:value.yaw;
   if(!Number.isFinite(yaw))throw new Error(`The ${label} yaw for ${item.id} is invalid.`);
   return {feet:finitePoint(value.feet,`${label} feet for ${item.id}`),yaw};
  };
  const inside=bookmark(marks.inside,'inside'),upstairs=bookmark(marks.upstairs,'upstairs');
  if(item.workInProgress!==undefined&&typeof item.workInProgress!=='boolean')throw new Error(`The work-in-progress state for ${item.id} is invalid.`);
  if(item.download&&(!validNativeDownloadUrl(item.download.url)||(item.download.bytes!==undefined&&(!Number.isSafeInteger(item.download.bytes)||item.download.bytes<=0))))throw new Error(`The download for ${item.id} is invalid.`);
  if(item.routes!==undefined&&(!Array.isArray(item.routes)||item.routes.some(route=>!route||typeof route.id!=='string'||!route.id||!Array.isArray(route.feet)||route.feet.length<2||route.feet.some(point=>!Array.isArray(point)||point.length!==3||point.some(value=>!Number.isFinite(value))))))throw new Error(`The routes for ${item.id} are invalid.`);
  const routes=(item.routes||[]).map(route=>({id:route.id,feet:route.feet.map(point=>[...point])}));
  if(item.collisionComponents!==undefined&&(!Array.isArray(item.collisionComponents)||item.collisionComponents.some(component=>!component||typeof component.node!=='string'||!component.node||component.solid!==true)))throw new Error(`The collision components for ${item.id} are invalid.`);
  const componentNames=new Set();for(const component of item.collisionComponents||[]){if(componentNames.has(component.node))throw new Error(`The collision components for ${item.id} are duplicated.`);componentNames.add(component.node);}
  const interactions=normalizeNativeInteractions(item.interactions,item.id);if(item.lights!==undefined&&(!Array.isArray(item.lights)||item.lights.length>16||item.lights.some(light=>!light||typeof light.id!=='string'||!Array.isArray(light.position)||light.position.length!==3||light.position.some(value=>!Number.isFinite(value))||!Array.isArray(light.color)||light.color.length!==3||light.color.some(value=>!Number.isFinite(value)||value<0||value>1)||!Number.isFinite(light.intensity)||light.intensity<0||!Number.isFinite(light.distance)||light.distance<=0)))throw new Error('The building lights are invalid.');ids.add(item.id);return {...item,interactions,walkable:item.walkable!==false,dimensions,bookmarks:{outside,inside,upstairs},routes,collisionComponents:[...(item.collisionComponents||[])],native:true};
 });
}
export function nextNativeSelection(selection,id){return {id,request:(selection?.request||0)+1};}
export function isCurrentNativeSelection(state,selection){return state.id===selection.id&&state.request===selection.request;}
function multiplyMatrices(a,b){const out=Array(16).fill(0);for(let column=0;column<4;column++)for(let row=0;row<4;row++)for(let index=0;index<4;index++)out[column*4+row]+=a[index*4+row]*b[column*4+index];return out;}
function instanceMatrix(node,index){const array=node.instanceMatrix?.array;if(!array||array.length<(index+1)*16)throw new Error(`The instance transform for ${node.name||'collision mesh'} is unavailable.`);return Array.from(array.slice(index*16,index*16+16));}
function collisionComponentName(node){return node.userData?.collisionComponentName||node.name;}
export function annotateCollisionComponents(gltf){
 const root=gltf.scene||gltf.scenes?.[0],associations=gltf.parser?.associations;
 if(!root||!associations)throw new Error('Collision node associations are unavailable.');
 root.traverse(node=>{if(!node.isMesh)return;let owner=node;while(owner&&!Number.isInteger(associations.get(owner)?.nodes))owner=owner.parent;if(!owner)throw new Error(`Collision mesh ${node.name} has no authored node.`);node.userData.collisionComponentName=owner.userData?.fast_group_id||owner.name;});
 return root;
}
export function trianglesFromObject(root){
 const triangles=[];root.updateMatrixWorld(true);root.traverse(node=>{if(!node.isMesh||!node.geometry?.getAttribute('position'))return;const geometry=node.geometry,position=geometry.getAttribute('position'),index=geometry.index;
  const count=index?index.count:position.count,instances=node.isInstancedMesh?node.count:1;
  for(let instance=0;instance<instances;instance++){const matrix=node.isInstancedMesh?multiplyMatrices(node.matrixWorld.elements,instanceMatrix(node,instance)):node.matrixWorld.elements,componentName=collisionComponentName(node),component=node.isInstancedMesh?`${componentName}::${instance}`:componentName;
   const point=attributeIndex=>{const p=[position.getX(attributeIndex),position.getY(attributeIndex),position.getZ(attributeIndex)];return [matrix[0]*p[0]+matrix[4]*p[1]+matrix[8]*p[2]+matrix[12],matrix[1]*p[0]+matrix[5]*p[1]+matrix[9]*p[2]+matrix[13],matrix[2]*p[0]+matrix[6]*p[1]+matrix[10]*p[2]+matrix[14]];};
   for(let i=0;i+2<count;i+=3){const ids=index?[index.getX(i),index.getX(i+1),index.getX(i+2)]:[i,i+1,i+2],a=point(ids[0]),b=point(ids[1]),c=point(ids[2]),abx=b[0]-a[0],aby=b[1]-a[1],abz=b[2]-a[2],acx=c[0]-a[0],acy=c[1]-a[1],acz=c[2]-a[2],nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;if(nx*nx+ny*ny+nz*nz>1e-20)triangles.push(triangle(a,b,c,component));}
  }
 });return triangles;
}
export function assertCollisionComponents(triangles,components,buildingName='building'){
 const available=new Set(triangles.map(item=>item.component));for(const component of components||[])if(!available.has(component.node))throw new Error(`The collision component ${component.node} for ${buildingName} has no triangles.`);
}
export function disposeObject(root,{preserveTextures=[]}={}){const geometries=new Set(),materials=new Set(),kept=new Set(preserveTextures);root?.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)materials.add(material);});geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>{for(const value of Object.values(material))if(value?.isTexture&&!kept.has(value)){value.dispose();value.source?.data?.close?.();}material.dispose();});}
async function dependencies(){const [THREE,{GLTFLoader}]=await Promise.all([import('three'),import('../vendor/three/examples/jsm/loaders/GLTFLoader.js')]);return {THREE,GLTFLoader};}
async function loadGlb(loader,path){return path.endsWith('.parts.json')?loadAssetBuffer(`exploration/${path}`).then(buffer=>new Promise((resolve,reject)=>loader.parse(buffer,ROOT,resolve,reject))):loader.loadAsync(ROOT+path);}
export class NativeBuildingLibrary{
 constructor({scene,onActivate,onError,onBeforeClearActive,onLoading,environmentMap,list,manifestUrl=ROOT+MANIFEST}={}){this.scene=scene;this.onActivate=onActivate;this.onError=onError;this.onBeforeClearActive=onBeforeClearActive;this.onLoading=onLoading;this.environmentMap=environmentMap;this.list=list;this.manifestUrl=manifestUrl;this.buildings=[];this.activeRoot=null;this.activeBuilding=null;this.selection={id:null,request:0};this.loader=null;}
 async boot(){
  try{const response=await fetch(this.manifestUrl);if(response.status===404)return this;if(!response.ok)throw new Error('The native exploration export is unavailable.');this.buildings=normalizeExplorationManifest(await response.json());this.render();}
  catch(error){this.error(error);}return this;
 }
 render(){if(!this.list||!this.buildings.length)return;const section=document.createElement('section');section.className='building-collection';section.setAttribute('aria-label','Castle and village');const heading=document.createElement('h2');heading.textContent='Castle and village';section.append(heading);for(const building of this.buildings){const card=document.createElement('button');card.type='button';card.className='house-card native-building-card';card.dataset.id=building.id;card.dataset.native='true';card.setAttribute('aria-pressed','false');if(building.preview){const image=document.createElement('img');image.src=ROOT+building.preview;image.alt='';image.addEventListener('error',()=>image.remove());card.append(image);}const label=document.createElement('span');label.textContent=building.name;const detail=document.createElement('small');detail.textContent=building.workInProgress?'In progress':building.walkable?(building.bookmarks.upstairs?'Walk inside · Upper level':'Walk inside'):'Exterior inspection';label.append(detail);card.append(label);card.addEventListener('click',()=>this.select(building));section.append(card);}this.list.append(section);}
 markSelected(id){for(const card of this.list?.querySelectorAll('.native-building-card')||[]){const selected=card.dataset.id===id;card.classList.toggle('selected',selected);card.setAttribute('aria-pressed',String(selected));}}
 setBusy(id,busy){for(const card of this.list?.querySelectorAll('.native-building-card')||[]){const selected=card.dataset.id===id;card.disabled=selected&&busy;card.setAttribute('aria-busy',String(selected&&busy));}}
 async select(building){
  if(!building)return;this.setBusy(null,false);const selection=nextNativeSelection(this.selection,building.id);this.selection=selection;this.setBusy(building.id,true);this.onLoading?.(building,true);
  try{const {THREE,GLTFLoader}=await dependencies();this.loader??=new GLTFLoader();const [render,collision]=await Promise.all([loadGlb(this.loader,building.model),building.walkable?loadGlb(this.loader,building.collision):Promise.resolve(null)]);const root=render.scene||render.scenes?.[0],collisionRoot=collision&&annotateCollisionComponents(collision);if(root){root.traverse(node=>{if(node.userData?.interaction_id)node.name=node.userData.interaction_id;});for(const interaction of building.interactions||[])for(const expected of interaction.nodeNames){const matches=[];root.traverse(node=>{if(node.name===expected||(node.name.startsWith(expected)&&/^\d{3,}$/.test(node.name.slice(expected.length))))matches.push(node);});if(matches.length===1)matches[0].name=expected;}}if(!root||(building.walkable&&!collisionRoot))throw new Error(`${building.name} is missing a native scene.`);const triangles=collisionRoot?trianglesFromObject(collisionRoot):[];if(collisionRoot)disposeObject(collisionRoot);if(building.walkable&&!triangles.length)throw new Error(`${building.name} has no collision triangles.`);assertCollisionComponents(triangles,building.collisionComponents,building.name);if(!isCurrentNativeSelection(this.selection,selection)){disposeObject(root,{preserveTextures:[this.environmentMap]});return;}
   this.clearActive(false,false);root.traverse(node=>{if(!node.isMesh)return;node.castShadow=true;node.receiveShadow=true;for(const material of Array.isArray(node.material)?node.material:[node.material])if(material?.metalness>0&&this.environmentMap){material.envMap=this.environmentMap;material.envMapIntensity=.65;material.needsUpdate=true;}});for(const spec of building.lights||[]){const light=new THREE.PointLight(new THREE.Color(...spec.color),spec.intensity,spec.distance,2);light.name=spec.id;light.position.fromArray(spec.position);root.add(light);}this.scene.add(root);this.activeRoot=root;this.activeBuilding=building;this.markSelected(building.id);this.onActivate?.({building,root,world:building.walkable?new TriangleWorld(triangles,{solidComponents:building.collisionComponents.filter(component=>component.solid).map(component=>component.node)}):null});
  }catch(error){if(isCurrentNativeSelection(this.selection,selection))this.error(error);}finally{if(isCurrentNativeSelection(this.selection,selection)){this.setBusy(building.id,false);this.onLoading?.(building,false);}}
 }
 clearActive(notify=true,cancel=true){if(cancel)this.selection=nextNativeSelection(this.selection,null);this.setBusy(null,false);if(!this.activeRoot)return;this.onBeforeClearActive?.();this.scene.remove(this.activeRoot);disposeObject(this.activeRoot,{preserveTextures:[this.environmentMap]});this.activeRoot=null;this.activeBuilding=null;this.markSelected(null);if(notify)this.onActivate?.(null);}
 error(error){console.error(error);this.onError?.(error);}
}
