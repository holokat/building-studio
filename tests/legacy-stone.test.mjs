import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import test from 'node:test';
const source=existsSync(new URL('../web/src/legacy-stone.js',import.meta.url))?'../web/src/legacy-stone.js':'../src/legacy-stone.js';
const {isLegacyStoneMaterial,weatherLegacyMaterialList}=await import(source);
const utility=await import('../scripts/rewrite-legacy-stone-downloads.mjs');
function glb(json,bin=Buffer.from([1,2,3,4])){const text=Buffer.from(JSON.stringify(json)),pad=(value)=>(value+3)&~3,jsonLength=pad(text.length),out=Buffer.alloc(12+8+jsonLength+8+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jsonLength,12);out.writeUInt32LE(0x4e4f534a,16);text.copy(out,20);out.fill(0x20,20+text.length,20+jsonLength);out.writeUInt32LE(bin.length,20+jsonLength);out.writeUInt32LE(0x004e4942,24+jsonLength);bin.copy(out,28+jsonLength);return out;}
function readJson(bytes){return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8').trim());}
test('only explicit manifest stone receives the legacy weathering profile',()=>{
 const [stone,wood,plaster,slate]=weatherLegacyMaterialList([{kind:'stone',name:'Stone'},{kind:'timber',name:'Wood'},{kind:'plaster',name:'Plaster'},{kind:'slate',name:'Slate'}]);assert.equal(isLegacyStoneMaterial(stone),true);assert.deepEqual(stone.color,[.76,.72,.65]);assert.equal(stone.roughness,.98);assert.ok(stone.roughnessMap.includes('weathered-stone'));assert.equal(wood.roughnessMap,undefined);assert.equal(plaster.roughnessMap,undefined);assert.equal(slate.roughnessMap,undefined);
});
test('download rewrite touches only materials with the browser stone marker and embeds reusable maps',()=>{
 const marked={name:'V3_Surface_ART_Stone',pbrMetallicRoughness:{},extras:{skybornBrowserMaterial:{name:'V3_Surface_ART_Stone',kind:'stone'}}},wood={name:'Oak',pbrMetallicRoughness:{roughnessFactor:.5},extras:{skybornBrowserMaterial:{name:'Oak',kind:'timber'}}},result=utility.rewriteWeatheredStoneGlb(glb({asset:{version:'2.0'},buffers:[{byteLength:4}],bufferViews:[],images:[],textures:[],materials:[marked,wood]}),{baseColor:Buffer.from([1]),roughness:Buffer.from([2]),normal:Buffer.from([3])}),json=readJson(result.bytes);
 assert.equal(result.changed,1);assert.equal(json.materials[0].pbrMetallicRoughness.roughnessFactor,.98);assert.equal(json.materials[0].pbrMetallicRoughness.metallicFactor,0);assert.equal(json.materials[0].normalTexture.scale,.78);assert.equal(json.materials[0].extras.skybornWeatheredStone.roughnessTexture,2);assert.equal(json.materials[1].name,'Oak');assert.equal(json.materials[0].pbrMetallicRoughness.metallicRoughnessTexture.index,2);assert.equal(json.images.length,3);assert.equal(json.buffers[0].byteLength,16);
});
