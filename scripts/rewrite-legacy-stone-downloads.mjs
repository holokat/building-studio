#!/usr/bin/env node
// Rewrites only the explicit legacy-building stone materials in portable GLBs.
// It embeds the selected native weathered albedo and normal maps and records the
// matching roughness map in glTF PBR's metallic-roughness G channel. Metallic
// factor zero keeps the stone non-metallic regardless of the texture B channel.
import {createHash} from 'node:crypto';
import {cp,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {existsSync,readdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const sourceModule=existsSync(new URL('../web/src/legacy-stone.js',import.meta.url))?'../web/src/legacy-stone.js':'../src/legacy-stone.js';
const {WEATHERED_LEGACY_STONE,isLegacyStoneDownloadMaterial}=await import(sourceModule);

const here=dirname(fileURLToPath(import.meta.url)),pad4=value=>(value+3)&~3;
function parseGlb(bytes){
 if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Expected a valid glTF 2.0 binary.');
 const jsonLength=bytes.readUInt32LE(12),jsonStart=20,jsonEnd=jsonStart+jsonLength;if(bytes.readUInt32LE(16)!==0x4e4f534a||jsonEnd+8>bytes.length||bytes.readUInt32LE(jsonEnd+4)!==0x004e4942)throw new Error('The GLB chunks are invalid.');
 const binLength=bytes.readUInt32LE(jsonEnd),binStart=jsonEnd+8;if(binStart+binLength!==bytes.length)throw new Error('The GLB binary chunk is invalid.');
 return {json:JSON.parse(bytes.subarray(jsonStart,jsonEnd).toString('utf8').trim()),bin:bytes.subarray(binStart)};
}
function buildGlb(json,bin){
 const source=Buffer.from(JSON.stringify(json)),jsonLength=pad4(source.length),binLength=pad4(bin.length),out=Buffer.alloc(12+8+jsonLength+8+binLength);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jsonLength,12);out.writeUInt32LE(0x4e4f534a,16);source.copy(out,20);out.fill(0x20,20+source.length,20+jsonLength);const binHeader=20+jsonLength;out.writeUInt32LE(binLength,binHeader);out.writeUInt32LE(0x004e4942,binHeader+4);bin.copy(out,binHeader+8);return out;
}
function append(parts,offset,bytes){const start=offset.value;parts.push(bytes);offset.value+=bytes.length;const padding=pad4(bytes.length)-bytes.length;if(padding){parts.push(Buffer.alloc(padding));offset.value+=padding;}return start;}
function addImage(json,parts,offset,bytes,name){
 const view=(json.bufferViews??=[]).push({buffer:0,byteOffset:append(parts,offset,bytes),byteLength:bytes.length})-1;
 const image=(json.images??=[]).push({name,bufferView:view,mimeType:'image/png'})-1;
 return (json.textures??=[]).push({name,source:image})-1;
}
export function rewriteWeatheredStoneGlb(bytes,{baseColor,roughness,normal,source='SKYBORN_WeatheredStone__REF_stone_dark'}={}){
 if(!Buffer.isBuffer(baseColor)||!Buffer.isBuffer(roughness)||!Buffer.isBuffer(normal))throw new Error('Weathered stone needs base-color, roughness, and normal PNG bytes.');
 const {json,bin}=parseGlb(bytes),targets=(json.materials||[]).filter(isLegacyStoneDownloadMaterial);if(!targets.length)return {bytes,changed:0,json};
 const parts=[bin],offset={value:bin.length},baseTexture=addImage(json,parts,offset,baseColor,'Weathered stone albedo'),normalTexture=addImage(json,parts,offset,normal,'Weathered stone normal'),roughnessTexture=addImage(json,parts,offset,roughness,'Weathered stone roughness');
 for(const material of targets){
  const browser=material.extras.skybornBrowserMaterial,previousName=browser.name;material.name=`${previousName} · weathered stone`;
  const originalColor=browser.color||[1,1,1],factor=material.pbrMetallicRoughness?.baseColorFactor||[...originalColor,1],color=[.76,.72,.65].map((value,index)=>value*factor[index]/Math.max(.001,originalColor[index]));
  material.pbrMetallicRoughness={...(material.pbrMetallicRoughness||{}),baseColorFactor:[...color,1],baseColorTexture:{index:baseTexture,texCoord:0},metallicFactor:0,roughnessFactor:.98,metallicRoughnessTexture:{index:roughnessTexture,texCoord:0}};
  material.normalTexture={index:normalTexture,texCoord:0,scale:.78};
  material.extras={...material.extras,skybornBrowserMaterial:{...browser,color:[.76,.72,.65],map:'weathered-stone/'+source+'_base_color.png',normal:'weathered-stone/'+source+'_normal.png',roughnessMap:'weathered-stone/'+source+'_roughness.png',roughness:.98,metalness:0},skybornWeatheredStone:{source,baseColorTexture:baseTexture,normalTexture,roughnessTexture,roughnessFallback:.98}};
 }
 json.buffers??=[{byteLength:0}];json.buffers[0].byteLength=offset.value;return {bytes:buildGlb(json,Buffer.concat(parts,offset.value)),changed:targets.length,json};
}
function options(argv){const value={};for(let index=0;index<argv.length;index+=1){const key=argv[index];if(key==='--help'){console.log('Usage: node rewrite-legacy-stone-downloads.mjs --assets DIR --out DIR --textures DIR [--install-runtime-maps DIR]');process.exit(0);}if(!['--assets','--out','--textures','--install-runtime-maps'].includes(key)||!argv[index+1])throw new Error(`Unknown or incomplete option: ${key}`);value[key.slice(2)]=resolve(argv[++index]);}for(const key of['assets','out','textures'])if(!value[key])throw new Error(`Missing --${key}.`);return value;}
async function main(){
 const args=options(process.argv.slice(2)),paths=Object.fromEntries(Object.entries(WEATHERED_LEGACY_STONE).map(([key,value])=>[key,join(args.textures,value.replace(/^textures\//,''))]));for(const file of Object.values(paths))if(!existsSync(file))throw new Error(`Missing active-library stone map: ${file}`);
 const maps=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,file])=>[key,await readFile(file)]))),files=readdirSync(args.assets).filter(file=>file.endsWith('.glb')).sort();await mkdir(args.out,{recursive:true});const report=[];
 for(const file of files){const input=await readFile(join(args.assets,file)),result=rewriteWeatheredStoneGlb(input,maps);if(!result.changed)continue;const output=join(args.out,file);await writeFile(output,result.bytes);report.push({file,stoneMaterials:result.changed,bytes:result.bytes.length,sha256:createHash('sha256').update(result.bytes).digest('hex')});}
 if(args['install-runtime-maps']){const destination=join(args['install-runtime-maps'],'weathered-stone');await mkdir(destination,{recursive:true});for(const [key,file]of Object.entries(paths))await cp(file,join(destination,WEATHERED_LEGACY_STONE[key].split('/').pop()));}
 await writeFile(join(args.out,'weathered-stone-download-report.json'),JSON.stringify({source:'SKYBORN_WeatheredStone__REF_stone_dark',assets:report},null,2)+'\n');console.log(`Rewrote ${report.length} GLBs with ${report.reduce((count,item)=>count+item.stoneMaterials,0)} explicit stone materials.`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
