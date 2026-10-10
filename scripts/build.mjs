import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGES_PART_SIZE = 20 * 1024 * 1024;

function walk(root, files = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) walk(path, files); else if (entry.isFile()) files.push(path);
  }
  return files;
}

function writeParts(source, destination, partSize = PAGES_PART_SIZE) {
  const bytes = readFileSync(source); const parts = [];
  for (let offset = 0, number = 1; offset < bytes.length; offset += partSize, number += 1) {
    const name = `${source.split('/').pop()}.part-${String(number).padStart(3, '0')}`;
    writeFileSync(join(destination, name), bytes.subarray(offset, Math.min(offset + partSize, bytes.length)));
    parts.push(name);
  }
  const descriptor = `${source.split('/').pop()}.parts.json`;
  writeFileSync(join(destination, descriptor), `${JSON.stringify({ version: 1, bytes: bytes.length, parts })}\n`);
  return descriptor;
}

function removePrivateMetadata(value) {
  if (Array.isArray(value)) return value.map(removePrivateMetadata);
  if (!value || typeof value !== 'object') return value;
  const privateFields = new Set(['source', 'sourceSHA256', 'sourceParts', 'seconds', 'additionalSources', 'sourceFile']);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !privateFields.has(key))
    .map(([key, child]) => [key, key === 'preview' && typeof child === 'string' && child.startsWith('/') ? `.${child}` : removePrivateMetadata(child)]));
}

export function splitLargeAssets({ assets, destination = assets, partSize = PAGES_PART_SIZE } = {}) {
  if (!assets || !existsSync(assets)) throw new Error('The runtime assets directory is unavailable.');
  const output = new Map();
  for (const file of walk(assets)) {
    if (statSync(file).size <= partSize) continue;
    const relativeFile = relative(assets, file);
    const targetDirectory = join(destination, dirname(relativeFile));
    mkdirSync(targetDirectory, { recursive: true });
    const descriptor = writeParts(file, targetDirectory, partSize);
    output.set(relativeFile.split('\\').join('/'), join(dirname(relativeFile), descriptor).split('\\').join('/'));
  }
  return output;
}

function rewriteManifests(assets, replacements) {
  const buildingManifest = join(assets, 'manifest.json');
  if (existsSync(buildingManifest)) {
    const manifest = removePrivateMetadata(JSON.parse(readFileSync(buildingManifest, 'utf8')));
    if (replacements.has(manifest.geometry)) manifest.geometry = replacements.get(manifest.geometry);
    writeFileSync(buildingManifest, `${JSON.stringify(manifest)}\n`);
  }
  const propsManifest = join(assets, 'props', 'manifest.json');
  if (existsSync(propsManifest)) {
    const manifest = removePrivateMetadata(JSON.parse(readFileSync(propsManifest, 'utf8')));
    for (const prop of manifest.props || []) {
      const key = `props/${prop.model}`;
      if (replacements.has(key)) prop.model = replacements.get(key).replace(/^props\//, '');
    }
    writeFileSync(propsManifest, `${JSON.stringify(manifest)}\n`);
  }
}

export function buildBuildingStudio({ source = resolve(fileURLToPath(new URL('../', import.meta.url))), output = join(source, 'dist') } = {}) {
  const runtime = join(source, 'web');
  if (!existsSync(join(runtime, 'assets'))) throw new Error('Expected runtime assets under web/assets. Run scripts/download-runtime.py first.');
  mkdirSync(output, { recursive: true });
  cpSync(runtime, output, {
    recursive: true,
    filter(path) {
      const name = path.split('/').pop();
      if (['.git', 'dist', 'node_modules', 'export-report.json'].includes(name)) return false;
      return !statSync(path).isFile() || !path.startsWith(runtime) || statSync(path).size <= PAGES_PART_SIZE;
    },
  });
  const catalog = join(source, 'downloads.json');
  if (existsSync(catalog)) copyFileSync(catalog, join(output, 'downloads.json'));
  const assets = join(output, 'assets');
  const replacements = splitLargeAssets({ assets: join(runtime, 'assets'), destination: assets });
  rewriteManifests(assets, replacements);
  return { output, replacements };
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const outputFlag = process.argv.indexOf('--out-dir');
  const output = outputFlag >= 0 ? resolve(process.argv[outputFlag + 1]) : undefined;
  const result = buildBuildingStudio({ output });
  console.log(`Built standalone studio: ${result.output}`);
}
