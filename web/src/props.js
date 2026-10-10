import {loadAssetBuffer,validRelativePath} from './asset-loader.js';
const DEFAULT_MANIFEST_URL='./assets/props/manifest.json';
const PROP_ROOT='./assets/props/';

export const validAssetPath=validRelativePath;

export function normalizePropsManifest(payload){
 if(!payload||payload.version!==1||!Array.isArray(payload.props))throw new Error('The prop export manifest is unavailable or unsupported.');
 const ids=new Set();
 return payload.props.map(prop=>{
  if(!prop||typeof prop.id!=='string'||!prop.id||ids.has(prop.id)||typeof prop.name!=='string'||!prop.name||typeof prop.category!=='string'||!prop.category||!validAssetPath(prop.model))throw new Error('The prop export manifest contains an invalid asset.');
  if(prop.preview&&!validAssetPath(prop.preview))throw new Error(`The preview path for ${prop.id} is invalid.`);
  if(!Array.isArray(prop.dimensions)||prop.dimensions.length!==3||prop.dimensions.some(value=>!Number.isFinite(value)||value<=0))throw new Error(`The dimensions for ${prop.id} are invalid.`);
  ids.add(prop.id);
  return {...prop,dimensions:[...prop.dimensions]};
 }).sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));
}

export function propCategories(props){
 return ['All',...new Set(props.map(prop=>prop.category).sort((a,b)=>a.localeCompare(b)))];
}

export function filterProps(props,query='',category='All'){
 const terms=query.trim().toLocaleLowerCase();
 return props.filter(prop=>(category==='All'||prop.category===category)&&(!terms||`${prop.name} ${prop.id} ${prop.category}`.toLocaleLowerCase().includes(terms)));
}

export function nextSelection(state,id){
 return {id,request:(state.request||0)+1};
}

export function isCurrentSelection(state,selection){
 return state.id===selection.id&&state.request===selection.request;
}

function disposeMaterial(material,preserveTextures){
 const textures=new Set();
 for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
 for(const value of Object.values(material.uniforms||{}))if(value?.value?.isTexture)textures.add(value.value);
 textures.forEach(texture=>{if(preserveTextures.has(texture))return;texture.dispose();texture.source?.data?.close?.();});
 material.dispose();
}

export function disposePropObject(root,{preserveTextures=[]}={}){
 const geometries=new Set(),materials=new Set();
 root.traverse(node=>{
  if(node.geometry)geometries.add(node.geometry);
  for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)materials.add(material);
 });
 geometries.forEach(geometry=>geometry.dispose());
 const preserved=new Set(preserveTextures);materials.forEach(material=>disposeMaterial(material,preserved));
}

async function dependencies(){
 const [THREE,{GLTFLoader}]=await Promise.all([import('three'),import('../vendor/three/examples/jsm/loaders/GLTFLoader.js')]);
 return {THREE,GLTFLoader};
}

export class PropsLibrary {
 constructor({scene,camera,onActivate,onDeactivate,onError,environmentMap,manifestUrl=DEFAULT_MANIFEST_URL,groundZ=-.575}={}){
  this.scene=scene;this.camera=camera;this.onActivate=onActivate;this.onDeactivate=onDeactivate;this.onError=onError;this.environmentMap=environmentMap;this.manifestUrl=manifestUrl;this.groundZ=groundZ;
  this.props=[];this.activeRoot=null;this.activeProp=null;this.selection={id:null,request:0};this.library='buildings';this.loader=null;this.THREE=null;
  this.elements={buildings:document.getElementById('library-buildings'),propsTab:document.getElementById('library-props'),buildingPanel:document.getElementById('building-library'),propPanel:document.getElementById('prop-library'),count:document.getElementById('prop-count'),list:document.getElementById('props'),empty:document.getElementById('props-empty'),search:document.getElementById('prop-search'),category:document.getElementById('prop-category')};
  this.bind();
 }

 bind(){
  const {buildings,propsTab,search,category}=this.elements;
  buildings?.addEventListener('click',()=>this.showBuildings());
  propsTab?.addEventListener('click',()=>this.showProps());
  search?.addEventListener('input',()=>this.render());
  category?.addEventListener('change',()=>this.render());
 }

 async boot(){
  try{
   const response=await fetch(this.manifestUrl);if(!response.ok)throw new Error('The prop export is unavailable.');
   this.props=normalizePropsManifest(await response.json());
   this.populateCategories();this.render();
   this.elements.count.textContent=this.props.length;
  }catch(error){this.error(error,true);}
  return this;
 }

 populateCategories(){
  const select=this.elements.category;if(!select)return;
  select.replaceChildren(...propCategories(this.props).map(category=>{
   const option=document.createElement('option');option.value=category;option.textContent=category==='All'?'All categories':category;return option;
  }));
 }

 showBuildings(){
  this.selection=nextSelection(this.selection,null);this.setBusy(null,false);this.library='buildings';this.setLibraryUI();this.clearActive();
 }

 showProps(){
  this.library='props';this.setLibraryUI();
 }

 setLibraryUI(){
  const active=this.library==='props',el=this.elements;
  el.buildings?.classList.toggle('active',!active);el.buildings?.setAttribute('aria-selected',String(!active));el.propsTab?.classList.toggle('active',active);el.propsTab?.setAttribute('aria-selected',String(active));
  if(el.buildingPanel)el.buildingPanel.hidden=active;if(el.propPanel)el.propPanel.hidden=!active;
 }

 render(){
  const {list,search,category,empty}=this.elements;if(!list)return;
  const visible=filterProps(this.props,search?.value||'',category?.value||'All');
  list.replaceChildren(...visible.map(prop=>this.card(prop)));
  if(empty)empty.hidden=visible.length!==0;
 }

 card(prop){
  const card=document.createElement('button');card.type='button';card.className='prop-card';card.dataset.id=prop.id;card.setAttribute('aria-pressed',String(this.activeProp?.id===prop.id));
  if(prop.preview){const image=document.createElement('img');image.src=PROP_ROOT+prop.preview;image.alt='';image.addEventListener('error',()=>image.remove());card.append(image);}
  const label=document.createElement('span');label.textContent=prop.name;const detail=document.createElement('small');detail.textContent=prop.category;label.append(detail);card.append(label);
  card.addEventListener('click',()=>this.select(prop));return card;
 }

 async select(prop){
  if(!prop)return;
  this.showProps();this.setBusy(null,false);
  const selection=nextSelection(this.selection,prop.id);this.selection=selection;this.setBusy(prop.id,true);
  try{
   const {THREE,GLTFLoader}=await dependencies();this.THREE=THREE;this.loader??=new GLTFLoader();
   const source=PROP_ROOT+prop.model;
   const gltf=prop.model.endsWith('.parts.json')
    ?await (()=>loadAssetBuffer(`props/${prop.model}`).then(buffer=>new Promise((resolve,reject)=>this.loader.parse(buffer,PROP_ROOT,resolve,reject))))()
    :await this.loader.loadAsync(source);
   const root=gltf.scene||gltf.scenes?.[0];if(!root)throw new Error(`The ${prop.name} model has no scene.`);
   if(!isCurrentSelection(this.selection,selection)){disposePropObject(root);return;}
   this.clearActive(false);this.prepareRoot(root,THREE);this.scene.add(root);this.activeRoot=root;this.activeProp=prop;this.markSelected(prop.id);
   const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),radius=Math.max(size.length()*.5,.08),distance=Math.max(.35,radius/Math.sin(THREE.MathUtils.degToRad(this.camera.fov*.5))*1.24);
   this.onActivate?.({prop,target:bounds.getCenter(new THREE.Vector3()),distance});
  }catch(error){if(isCurrentSelection(this.selection,selection))this.error(error);}
  finally{if(isCurrentSelection(this.selection,selection))this.setBusy(prop.id,false);}
 }

 prepareRoot(root,THREE){
  root.rotation.x=Math.PI/2;root.updateMatrixWorld(true);
  const initial=new THREE.Box3().setFromObject(root),center=initial.getCenter(new THREE.Vector3());root.position.set(-center.x,-center.y,this.groundZ-initial.min.z);root.updateMatrixWorld(true);
  root.traverse(node=>{if(!node.isMesh)return;node.castShadow=true;node.receiveShadow=true;for(const material of Array.isArray(node.material)?node.material:[node.material])if(material?.metalness>0&&this.environmentMap){material.envMap=this.environmentMap;material.envMapIntensity=.65;material.needsUpdate=true;}});
 }

 clearActive(notify=true){
  if(!this.activeRoot)return;
  this.scene.remove(this.activeRoot);disposePropObject(this.activeRoot,{preserveTextures:[this.environmentMap]});this.activeRoot=null;this.activeProp=null;this.markSelected(null);if(notify)this.onDeactivate?.();
 }

 setBusy(id,busy){
  for(const card of this.elements.list?.querySelectorAll('.prop-card')||[]){const selected=card.dataset.id===id;card.disabled=busy&&selected;card.setAttribute('aria-busy',String(busy&&selected));}
 }

 markSelected(id){
  for(const card of this.elements.list?.querySelectorAll('.prop-card')||[]){const selected=card.dataset.id===id;card.classList.toggle('selected',selected);card.setAttribute('aria-pressed',String(selected));}
 }

 error(error,manifest=false){
  console.error(error);this.onError?.(error);if(manifest)this.elements.count.textContent='–';
 }

 dispose(){this.selection=nextSelection(this.selection,null);this.clearActive(false);}
}
