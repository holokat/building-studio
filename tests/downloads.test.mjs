import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { findDownload } from '../web/src/downloads.js';

const catalog = JSON.parse(readFileSync(new URL('../downloads.json', import.meta.url)));
const buildings = JSON.parse(readFileSync(new URL('../web/assets/manifest.json', import.meta.url))).buildings;
const native = JSON.parse(readFileSync(new URL('../web/assets/exploration/manifest.json', import.meta.url))).buildings;
const props = JSON.parse(readFileSync(new URL('../web/assets/props/manifest.json', import.meta.url))).props;

test('the catalog exposes an exact selected download for every building and prop', () => {
  assert.equal(catalog.assets.length, 48);
  for (const asset of [...buildings, ...props, ...native]) {
    const match = findDownload(catalog.assets, [asset.id, asset.name]);
    assert.equal(match?.id, asset.id, `Missing exact download mapping for ${asset.id}`);
    assert.match(match.url, /^https:\/\/github\.com\/holokat\/building-studio\/releases\/download\/v1\.1\.0\//);
  }
});
