import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { splitLargeAssets } from '../scripts/build.mjs';

test('build splitter replaces assets above the Pages limit with bounded parts', () => {
  const root = mkdtempSync(join(tmpdir(), 'building-studio-parts-')); mkdirSync(join(root, 'props'));
  writeFileSync(join(root, 'geometry.bin'), Buffer.alloc(11, 7));
  const replacements = splitLargeAssets({ assets: root, partSize: 4 });
  assert.equal(replacements.get('geometry.bin'), 'geometry.bin.parts.json');
  const descriptor = JSON.parse(readFileSync(join(root, 'geometry.bin.parts.json'), 'utf8'));
  assert.deepEqual(descriptor.parts, ['geometry.bin.part-001', 'geometry.bin.part-002', 'geometry.bin.part-003']);
  assert.equal(descriptor.bytes, 11);
});
