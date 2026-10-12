import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import test from 'node:test';
const nativeModule=existsSync(new URL('../web/src/native-buildings.js',import.meta.url))?'../web/src/native-buildings.js':'../src/native-buildings.js';
const {annotateCollisionComponents,assertCollisionComponents,isCurrentNativeSelection,nextNativeSelection,normalizeExplorationManifest,trianglesFromObject,validNativeDownloadUrl}=await import(nativeModule);

test('collision ownership uses authored glTF nodes, never the enclosing scene name',()=>{
 const root={name:'Scene',isGroup:true,parent:null},direct={name:'Direct',isMesh:true,isInstancedMesh:true,parent:root,userData:{}},group={name:'MultiPrimitive',isGroup:true,parent:root},child={name:'Primitive',isMesh:true,isInstancedMesh:true,parent:group,userData:{}};
 root.traverse=visit=>[root,direct,group,child].forEach(visit);
 const associations=new Map([[root,{scenes:0}],[direct,{nodes:1}],[group,{nodes:2}]]);
 annotateCollisionComponents({scene:root,parser:{associations}});
 assert.equal(direct.userData.collisionComponentName,'Direct');assert.equal(child.userData.collisionComponentName,'MultiPrimitive');
});

const building={id:'castle',name:'Castle',model:'castle.glb',collision:'castle-collision.glb',dimensions:[24,18,12],bookmarks:{outside:{target:[0,0,4],distance:24},inside:{feet:[1,1,0],yaw:0},upstairs:{feet:[1,1,3],yaw:1}},routes:[{id:'hall',feet:[[1,1,0],[2,1,0]]}],collisionComponents:[{node:'Castle_ClosedSolid',solid:true}]};
test('native manifest accepts authored routes and safe split GLB descriptors',()=>{
 const [native]=normalizeExplorationManifest({version:1,buildings:[{...building,model:'castle.glb.parts.json',collision:'collision.glb.parts.json'}]});assert.equal(native.routes[0].feet.length,2);assert.equal(native.collisionComponents[0].node,'Castle_ClosedSolid');assert.equal(native.native,true);
});
test('native manifest rejects unmarked or duplicated solid components',()=>{
 assert.throws(()=>normalizeExplorationManifest({version:1,buildings:[{...building,collisionComponents:[{node:'solid',solid:false}]}]}));
 assert.throws(()=>normalizeExplorationManifest({version:1,buildings:[{...building,collisionComponents:[{node:'solid',solid:true},{node:'solid',solid:true}]}]}));
});
test('native manifest rejects unsafe collision paths and incomplete bookmarks',()=>{
 assert.throws(()=>normalizeExplorationManifest({version:1,buildings:[{...building,collision:'../collision.glb'}]}));
 assert.throws(()=>normalizeExplorationManifest({version:1,buildings:[{...building,bookmarks:{outside:building.bookmarks.outside}}]}));
});
test('native downloads accept only safe relative assets or the project GitHub releases',()=>{
 assert.equal(validNativeDownloadUrl('castle.glb'),true);
 assert.equal(validNativeDownloadUrl('https://github.com/holokat/building-studio/releases/download/v1.0.0/castle.glb'),true);
 for(const url of['http://github.com/holokat/building-studio/releases/download/v1/a.glb','https://github.com/other/building-studio/releases/download/v1/a.glb','https://github.com/holokat/building-studio/releases/download/v1/a.glb?redirect=bad','https://evil.test/holokat/building-studio/releases/download/v1/a.glb','../castle.glb'])assert.equal(validNativeDownloadUrl(url),false,url);
 assert.throws(()=>normalizeExplorationManifest({version:1,buildings:[{...building,download:{url:'https://evil.test/file.glb'}}]}));
});
test('an explicitly non-walkable native model remains an honest exterior preview',()=>{
 const [preview]=normalizeExplorationManifest({version:1,buildings:[{...building,id:'unfinished',walkable:false,collision:undefined}]});assert.equal(preview.walkable,false);
});
test('only the newest native GLB selection can commit',()=>{
 const first=nextNativeSelection({id:null,request:0},'castle'),second=nextNativeSelection(first,'tower');assert.equal(isCurrentNativeSelection(second,first),false);assert.equal(isCurrentNativeSelection(second,second),true);
});
test('instanced collision meshes emit a world-space triangle for every instance',()=>{
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],translated=[1,0,0,0,0,1,0,0,0,0,1,0,3,4,5,1];
 const position={count:4,getX:()=>0,getY:index=>[0,1,1,0][index],getZ:index=>[0,0,1,1][index]},index={count:6,getX:value=>[0,1,2,0,2,3][value]};
 const mesh={isMesh:true,isInstancedMesh:true,name:'PrimitiveName',parent:{isGroup:true,name:'WallSolid'},count:2,matrixWorld:{elements:identity},instanceMatrix:{array:Float32Array.from([...identity,...translated])},geometry:{index,getAttribute:name=>name==='position'?position:null}};
 const root={updateMatrixWorld(){},traverse(visit){visit(mesh);}};
 mesh.userData={collisionComponentName:'WallSolid'};
 const triangles=trianglesFromObject(root);assert.equal(triangles.length,4);assert.ok(triangles[0].normal[0]>.99,'YZ-plane X-normal wall must not be removed');assert.deepEqual(triangles[2].a,[3,4,5]);assert.equal(triangles[2].component,'WallSolid::1');
});
test('collision parser retains every axis normal and roof/ceiling winding',()=>{
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],points=[[0,0,0],[0,1,0],[0,0,1],[0,0,0],[0,0,1],[0,1,0],[0,0,0],[0,0,1],[1,0,0],[0,0,0],[1,0,0],[0,0,1],[0,0,0],[1,0,0],[0,1,0],[0,0,0],[0,1,0],[1,0,0]],position={count:18,getX:index=>points[index][0],getY:index=>points[index][1],getZ:index=>points[index][2]};
 const mesh={isMesh:true,name:'AllAxes',matrixWorld:{elements:identity},geometry:{index:null,getAttribute:name=>name==='position'?position:null}},root={updateMatrixWorld(){},traverse(visit){visit(mesh);}},triangles=trianglesFromObject(root),normals=triangles.map(item=>item.normal);
 assert.equal(triangles.length,6);for(const axis of[0,1,2]){assert.ok(normals.some(normal=>normal[axis]>.99));assert.ok(normals.some(normal=>normal[axis]<-.99));}assert.ok(normals[4][2]>.99,'roof/floor faces retain upward normals');assert.ok(normals[5][2]<-.99,'ceiling faces retain downward normals');
});
test('declared solid components must name emitted collision triangles',()=>{
 assert.doesNotThrow(()=>assertCollisionComponents([{component:'WallSolid::0'}],[{node:'WallSolid::0',solid:true}],'Castle'));
 assert.throws(()=>assertCollisionComponents([{component:'WallSolid::0'}],[{node:'WallSolid::1',solid:true}],'Castle'),/has no triangles/);
});
