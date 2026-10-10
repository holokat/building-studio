import assert from 'node:assert/strict';
import test from 'node:test';
import { isPartManifest, joinArrayBuffers, normalizePartManifest, validRelativePath } from '../web/src/asset-loader.js';

test('split asset descriptors accept only safe relative parts', () => {
  assert.equal(validRelativePath('props/int-bed.glb.part-001'), true);
  assert.equal(validRelativePath('../private.bin'), false);
  assert.equal(isPartManifest({ version: 1, parts: ['one.bin'] }), true);
  assert.deepEqual(normalizePartManifest({ version: 1, bytes: 3, parts: ['one.bin', 'two.bin'] }), { bytes: 3, parts: ['one.bin', 'two.bin'] });
  assert.throws(() => normalizePartManifest({ version: 1, parts: ['../private.bin'] }));
});

test('split asset buffers preserve order and reject a partial download', () => {
  const bytes = joinArrayBuffers([Uint8Array.from([1, 2]).buffer, Uint8Array.from([3]).buffer], 3);
  assert.deepEqual([...new Uint8Array(bytes)], [1, 2, 3]);
  assert.throws(() => joinArrayBuffers([Uint8Array.from([1]).buffer], 2));
});
