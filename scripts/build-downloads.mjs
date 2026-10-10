#!/usr/bin/env node
/**
 * Build portable Skyborn Building Studio download artifacts from the browser
 * runtime export. It has no package dependency: source geometry, texture
 * bytes, transforms, UVs, and material parameters are read directly from the
 * existing runtime manifest.
 *
 * Usage:
 *   node scripts/build-downloads.mjs \
 *     --assets ../public/web/assets --license ../LICENSE-CC0-1.0.txt \
 *     --out ../dist
 *
 * The output directory must not already contain files with generated names.
 * Existing prop GLBs are copied byte-for-byte. Building GLBs use standard PBR
 * for their base map and normal map. The source paint and weathering inputs,
 * including UV transforms, are embedded in each material's
 * `extras.skybornBrowserMaterial` for renderer-specific reconstruction.
 */

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const defaults = {
  assets: resolve(here, '../web/assets'),
  license: resolve(here, '../licenses/CC0-1.0.txt'),
  out: resolve(here, '../work/downloads'),
};

function parseArgs(argv) {
  const values = { ...defaults };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--help') {
      console.log('Usage: node build-downloads.mjs [--assets PATH] [--license PATH] [--out PATH]');
      process.exit(0);
    }
    if (!['--assets', '--license', '--out'].includes(key) || !argv[i + 1]) {
      throw new Error(`Unknown or incomplete argument: ${key}`);
    }
    values[key.slice(2)] = resolve(argv[++i]);
  }
  return values;
}

const pad4 = (n) => (n + 3) & ~3;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hashFile = async (path) => sha256(await readFile(path));
const clamp = (n) => Math.min(1, Math.max(0, n));

// This matches the browser's deterministic instance tint exactly.
function instanceShade(instance, kind) {
  const text = `${instance.path}/${instance.name}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const random = (h >>> 0) / 4294967295;
  return ['stone', 'slate'].includes(kind) ? 0.72 + random * 0.5 : 0.84 + random * 0.26;
}

function pngMime(path) {
  if (path.toLowerCase().endsWith('.png')) return 'image/png';
  if (path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg')) return 'image/jpeg';
  throw new Error(`Unsupported embedded texture type: ${path}`);
}

function append(parts, offsetRef, bytes) {
  const offset = offsetRef.value;
  parts.push(bytes);
  offsetRef.value += bytes.length;
  const padding = pad4(bytes.length) - bytes.length;
  if (padding) {
    parts.push(Buffer.alloc(padding));
    offsetRef.value += padding;
  }
  return offset;
}

function glbFromJsonAndBin(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonLength = pad4(jsonBytes.length);
  const binLength = pad4(bin.length);
  const output = Buffer.alloc(12 + 8 + jsonLength + 8 + binLength);
  output.writeUInt32LE(0x46546c67, 0); // glTF
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16); // JSON
  jsonBytes.copy(output, 20);
  output.fill(0x20, 20 + jsonBytes.length, 20 + jsonLength);
  const binHeader = 20 + jsonLength;
  output.writeUInt32LE(binLength, binHeader);
  output.writeUInt32LE(0x004e4942, binHeader + 4); // BIN\0
  bin.copy(output, binHeader + 8);
  return output;
}

function parseGlb(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error('Not a GLB v2 file');
  }
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB header length does not match file length');
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('GLB lacks a JSON chunk');
  const jsonEnd = 20 + jsonLength;
  const json = JSON.parse(bytes.subarray(20, jsonEnd).toString('utf8').trim());
  if (bytes.readUInt32LE(jsonEnd + 4) !== 0x004e4942) throw new Error('GLB lacks a BIN chunk');
  if (jsonEnd + 8 + bytes.readUInt32LE(jsonEnd) !== bytes.length) throw new Error('GLB BIN length does not match file length');
  return json;
}

function glbFilename(id) {
  return `skyborn-building-${id.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/_/g, '-').toLowerCase()}.glb`;
}

function propFilename(id) {
  return `skyborn-prop-${id}.glb`;
}

async function buildBuilding({ building, manifest, geometry, assetsRoot }) {
  const usedGeometry = [...new Set(building.instances.map((instance) => instance.g))].sort((a, b) => a - b);
  const usedMaterial = [...new Set(building.instances.map((instance) => instance.m))].sort((a, b) => a - b);
  const texturePaths = [...new Set(usedMaterial.flatMap((index) => {
    const material = manifest.materials[index];
    return [material.map, material.paint, material.overlay, material.normal].filter(Boolean);
  }))].sort();
  const binParts = [];
  const offset = { value: 0 };
  const bufferViews = [];
  const accessors = [];
  const geometryAccessors = new Map();

  for (const index of usedGeometry) {
    const source = manifest.meshes[index];
    const bytes = geometry.subarray(source.offset, source.offset + source.count * manifest.stride * 4);
    if (bytes.length !== source.count * manifest.stride * 4) throw new Error(`Geometry ${index} is incomplete`);
    const byteOffset = append(binParts, offset, bytes);
    const view = bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, byteStride: manifest.stride * 4, target: 34962 }) - 1;
    const position = accessors.push({ bufferView: view, byteOffset: 0, componentType: 5126, count: source.count, type: 'VEC3', min: source.bounds[0], max: source.bounds[1] }) - 1;
    const normal = accessors.push({ bufferView: view, byteOffset: 12, componentType: 5126, count: source.count, type: 'VEC3' }) - 1;
    const uv = accessors.push({ bufferView: view, byteOffset: 24, componentType: 5126, count: source.count, type: 'VEC2' }) - 1;
    const paintUv = accessors.push({ bufferView: view, byteOffset: 32, componentType: 5126, count: source.count, type: 'VEC2' }) - 1;
    geometryAccessors.set(index, { position, normal, uv, paintUv, source });
  }

  const images = [];
  const textures = [];
  const textureIndex = new Map();
  for (const texturePath of texturePaths) {
    const bytes = await readFile(join(assetsRoot, texturePath));
    if (pngMime(texturePath) === 'image/png' && bytes.readUInt32BE(0) !== 0x89504e47) {
      throw new Error(`Texture is not a PNG: ${texturePath}`);
    }
    const byteOffset = append(binParts, offset, bytes);
    const view = bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length }) - 1;
    const image = images.push({ bufferView: view, mimeType: pngMime(texturePath), name: basename(texturePath), extras: { skybornRuntimePath: texturePath } }) - 1;
    textureIndex.set(texturePath, textures.push({ sampler: 0, source: image, name: basename(texturePath) }) - 1);
  }

  const materials = [];
  const materialIndex = new Map();
  const meshIndex = new Map();
  const meshes = [];
  const nodes = [];
  for (const instance of building.instances) {
    const sourceMaterial = manifest.materials[instance.m];
    const shade = instanceShade(instance, sourceMaterial.kind);
    // Every browser instance may have a different deterministic tint.
    const materialKey = `${instance.m}:${shade}`;
    let material = materialIndex.get(materialKey);
    if (material === undefined) {
      const materialDef = {
        name: sourceMaterial.name,
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: sourceMaterial.color.map((value) => clamp(value * shade)).concat(1),
          metallicFactor: sourceMaterial.metalness,
          roughnessFactor: sourceMaterial.roughness,
        },
        extras: {
          skybornBrowserMaterial: {
            ...sourceMaterial,
            instanceShade: shade,
            // These indices point to embedded image data, not a local runtime path.
            embeddedTextureIndices: Object.fromEntries(
              ['map', 'paint', 'overlay', 'normal']
                .filter((slot) => sourceMaterial[slot])
                .map((slot) => [slot, textureIndex.get(sourceMaterial[slot])]),
            ),
            paintTexCoord: 1,
          },
        },
      };
      if (sourceMaterial.map) {
        const transform = sourceMaterial.surfaceUVTransform || [1, 1, 0, 0];
        materialDef.pbrMetallicRoughness.baseColorTexture = {
          index: textureIndex.get(sourceMaterial.map),
          texCoord: 0,
          extensions: { KHR_texture_transform: { offset: [transform[2], transform[3]], scale: [transform[0], transform[1]], texCoord: 0 } },
        };
      }
      if (sourceMaterial.normal) materialDef.normalTexture = { index: textureIndex.get(sourceMaterial.normal), texCoord: 0, scale: 0.6 };
      material = materials.push(materialDef) - 1;
      materialIndex.set(materialKey, material);
    }
    const meshKey = `${instance.g}:${material}`;
    let mesh = meshIndex.get(meshKey);
    if (mesh === undefined) {
      const source = geometryAccessors.get(instance.g);
      mesh = meshes.push({
        name: source.source.name,
        primitives: [{ attributes: { POSITION: source.position, NORMAL: source.normal, TEXCOORD_0: source.uv, TEXCOORD_1: source.paintUv }, material, mode: 4 }],
        extras: { sourceGeometryIndex: instance.g, sourceMaterialIndex: instance.m },
      }) - 1;
      meshIndex.set(meshKey, mesh);
    }
    nodes.push({
      name: instance.name || `${building.id}-${nodes.length + 1}`,
      mesh,
      matrix: instance.matrix,
      extras: {
        sourcePath: instance.path || '',
        sourceComponent: instance.sourceComponent || '',
        sourceObject: instance.sourceObject || '',
        roof: Boolean(instance.roof),
        door: Boolean(instance.door),
      },
    });
  }

  const bin = Buffer.concat(binParts, offset.value);
  const json = {
    asset: { version: '2.0', generator: 'Skyborn Building Studio download generator', copyright: 'CC0 1.0 Universal' },
    extensionsUsed: ['KHR_texture_transform'],
    extras: {
      skybornBuilding: { id: building.id, name: building.name, category: 'Buildings', source: manifest.source, sourceSHA256: manifest.sourceSHA256 },
      materialRenderingNote: 'Standard PBR uses source base and normal maps. Browser paint and overlay shader inputs are retained in material extras for compatible renderers.',
    },
    scene: 0,
    scenes: [{ name: building.name, nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
    images,
    textures,
    samplers: [{ wrapS: 10497, wrapT: 10497, magFilter: 9729, minFilter: 9987 }],
  };
  return { bytes: glbFromJsonAndBin(json, bin), expected: { nodes: nodes.length, meshes: meshes.length, materials: materials.length, images: images.length, textures: textures.length } };
}

function validateBuildingGlb(bytes, expected) {
  const json = parseGlb(bytes);
  for (const [key, count] of Object.entries(expected)) {
    const actual = (json[key] || []).length;
    if (actual !== count) throw new Error(`Building GLB ${key} count ${actual} does not match ${count}`);
  }
  if (!json.materials.every((material) => material.extras?.skybornBrowserMaterial)) throw new Error('A building GLB lost browser material metadata');
  if (!json.accessors.every((accessor) => accessor.count > 0)) throw new Error('A building GLB has an empty geometry accessor');
  return json;
}

function validatePropGlb(bytes) {
  const json = parseGlb(bytes);
  if (!json.meshes?.length || !json.materials?.length) throw new Error('Prop GLB has no mesh or material');
  return { meshes: json.meshes.length, materials: json.materials.length, textures: json.textures?.length || 0, images: json.images?.length || 0 };
}

async function ensureNew(path) {
  if (existsSync(path)) throw new Error(`Refusing to overwrite existing output: ${path}`);
  await mkdir(dirname(path), { recursive: true });
}

async function main() {
  const paths = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(join(paths.assets, 'manifest.json'), 'utf8'));
  const propsManifest = JSON.parse(await readFile(join(paths.assets, 'props/manifest.json'), 'utf8'));
  if (manifest.buildings.length !== 9 || propsManifest.props.length !== 28) throw new Error('Expected 9 buildings and 28 props');
  const geometry = await readFile(join(paths.assets, manifest.geometry));
  const assetsDir = join(paths.out, 'assets');
  await mkdir(assetsDir, { recursive: true });
  const assets = [];

  for (const building of manifest.buildings) {
    const filename = glbFilename(building.id);
    const destination = join(assetsDir, filename);
    await ensureNew(destination);
    const { bytes, expected } = await buildBuilding({ building, manifest, geometry, assetsRoot: paths.assets });
    const parsed = validateBuildingGlb(bytes, expected);
    await writeFile(destination, bytes);
    const details = await stat(destination);
    assets.push({ id: building.id, name: building.name, category: 'Buildings', filename, bytes: details.size, sha256: sha256(bytes), url: null, validation: { nodes: parsed.nodes.length, meshes: parsed.meshes.length, materials: parsed.materials.length, textures: parsed.textures.length, images: parsed.images.length } });
    console.log(`built ${filename} (${details.size} bytes; ${parsed.nodes.length} nodes)`);
  }

  for (const prop of propsManifest.props) {
    const filename = propFilename(prop.id);
    const source = join(paths.assets, 'props', prop.model);
    const destination = join(assetsDir, filename);
    await ensureNew(destination);
    await copyFile(source, destination);
    const copied = await readFile(destination);
    const sourceHash = await hashFile(source);
    if (sha256(copied) !== sourceHash) throw new Error(`Copied prop does not match source: ${prop.id}`);
    const validation = validatePropGlb(copied);
    const details = await stat(destination);
    assets.push({ id: prop.id, name: prop.name, category: prop.category, filename, bytes: details.size, sha256: sourceHash, url: null, validation });
  }

  const packAssetManifest = { version: 1, name: 'Skyborn Building Studio', license: 'CC0-1.0', assets };
  const packManifestPath = join(paths.out, 'asset-manifest.json');
  await ensureNew(packManifestPath);
  await writeFile(packManifestPath, `${JSON.stringify(packAssetManifest, null, 2)}\n`);
  const licenseDestination = join(paths.out, 'CC0-1.0.txt');
  await ensureNew(licenseDestination);
  await copyFile(paths.license, licenseDestination);
  if (await hashFile(paths.license) !== await hashFile(licenseDestination)) throw new Error('CC0 legal text changed while copying');

  const packFilename = 'skyborn-buildings-and-props.zip';
  const packPath = join(paths.out, packFilename);
  await ensureNew(packPath);
  const zip = spawnSync('zip', ['-q', '-r', packFilename, 'assets', 'asset-manifest.json', 'CC0-1.0.txt'], { cwd: paths.out, encoding: 'utf8' });
  if (zip.status !== 0) throw new Error(`zip failed: ${zip.stderr || zip.stdout}`);
  const zipCheck = spawnSync('unzip', ['-t', packPath], { encoding: 'utf8' });
  if (zipCheck.status !== 0) throw new Error(`ZIP integrity validation failed: ${zipCheck.stderr || zipCheck.stdout}`);
  const packStats = await stat(packPath);

  const baseUrl = 'https://github.com/holokat/building-studio/releases/download/v1.0.0';
  for (const asset of assets) asset.url = `${baseUrl}/${asset.filename}`;
  const catalog = {
    version: 1,
    license: 'CC0-1.0',
    assets: assets.map(({ validation, ...asset }) => asset),
    pack: { filename: packFilename, bytes: packStats.size, sha256: await hashFile(packPath), url: `${baseUrl}/${packFilename}` },
    notes: ['Building GLBs preserve browser geometry, transforms, UV sets, per-instance shade values, material parameters, and embedded source textures.', 'Standard glTF viewers render the source base PBR map and normal map. Browser-specific paint and weathering composition data is retained in material extras and requires a compatible renderer for the full studio appearance.'],
  };
  const catalogPath = join(paths.out, 'downloads-manifest.json');
  await ensureNew(catalogPath);
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(JSON.stringify({ assets: assets.length, buildings: manifest.buildings.length, props: propsManifest.props.length, pack: { filename: packFilename, bytes: packStats.size, sha256: catalog.pack.sha256 }, catalog: basename(catalogPath) }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
