import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {existsSync} from 'node:fs';
const buildModule=existsSync(new URL('../scripts/build.mjs',import.meta.url))?'../scripts/build.mjs':'../build.mjs';
const {splitLargeAssets,rewriteManifests}=await import(buildModule);

test('build splitter replaces assets above the Pages limit with bounded parts', () => {
  const root = mkdtempSync(join(tmpdir(), 'building-studio-parts-')); mkdirSync(join(root, 'props'));
  writeFileSync(join(root, 'geometry.bin'), Buffer.alloc(11, 7));
  const replacements = splitLargeAssets({ assets: root, partSize: 4 });
  assert.equal(replacements.get('geometry.bin'), 'geometry.bin.parts.json');
  const descriptor = JSON.parse(readFileSync(join(root, 'geometry.bin.parts.json'), 'utf8'));
  assert.deepEqual(descriptor.parts, ['geometry.bin.part-001', 'geometry.bin.part-002', 'geometry.bin.part-003']);
  assert.equal(descriptor.bytes, 11);
});

test('build splitter rewrites native render and triangle collision GLB paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'building-studio-native-'));
  const assets = join(root, 'exploration'); mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, 'manifest.json'), JSON.stringify({ version: 1, buildings: [{ id: 'castle', model: 'castle.glb', collision: 'castle-collision.glb' }] }));
  rewriteManifests(root, new Map([['exploration/castle.glb', 'exploration/castle.glb.parts.json'], ['exploration/castle-collision.glb', 'exploration/castle-collision.glb.parts.json']]));
  const manifest = JSON.parse(readFileSync(join(assets, 'manifest.json'), 'utf8'));
  assert.equal(manifest.buildings[0].model, 'castle.glb.parts.json');
  assert.equal(manifest.buildings[0].collision, 'castle-collision.glb.parts.json');
});

test('splitter follows the locally linked native export and writes portable model parts',()=>{
 const root=mkdtempSync(join(tmpdir(),'building-studio-linked-'));const source=join(root,'source.glb');const assets=join(root,'assets'),out=join(root,'output');mkdirSync(assets);writeFileSync(source,Buffer.alloc(11,9));symlinkSync(source,join(assets,'castle.glb'));const parts=splitLargeAssets({assets,destination:out,partSize:4});assert.equal(parts.get('castle.glb'),'castle.glb.parts.json');const d=JSON.parse(readFileSync(join(out,'castle.glb.parts.json'),'utf8'));assert.equal(d.bytes,11);assert.deepEqual([...readFileSync(join(out,d.parts[0]))],[9,9,9,9]);
});
