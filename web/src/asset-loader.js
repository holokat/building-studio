export const ASSET_ROOT = './assets/';

export function validRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('..') && !value.includes('\\');
}

function assetUrl(path, base = ASSET_ROOT) {
  if (!validRelativePath(path)) throw new Error('The asset path is invalid.');
  return new URL(path, new URL(base, window.location.href));
}

export function isPartManifest(value) {
  return Boolean(value && typeof value === 'object' && value.version === 1 && Array.isArray(value.parts));
}

export function normalizePartManifest(value) {
  if (!isPartManifest(value) || value.parts.length === 0 || value.parts.some(part => !validRelativePath(part))) {
    throw new Error('The split asset manifest is invalid.');
  }
  if (value.bytes !== undefined && (!Number.isSafeInteger(value.bytes) || value.bytes <= 0)) throw new Error('The split asset size is invalid.');
  return { parts: [...value.parts], bytes: value.bytes };
}

export function joinArrayBuffers(buffers, expectedBytes) {
  const bytes = buffers.reduce((total, buffer) => total + buffer.byteLength, 0);
  if (expectedBytes !== undefined && bytes !== expectedBytes) throw new Error('The split asset is incomplete.');
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const buffer of buffers) { joined.set(new Uint8Array(buffer), offset); offset += buffer.byteLength; }
  return joined.buffer;
}

async function fetchResponse(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset request failed (${response.status}).`);
  return response;
}

export async function loadAssetBuffer(path, base = ASSET_ROOT) {
  const url = assetUrl(path, base);
  if (!path.endsWith('.parts.json')) return (await fetchResponse(url)).arrayBuffer();
  const descriptor = normalizePartManifest(await (await fetchResponse(url)).json());
  const prefix = new URL('.', url);
  const buffers = await Promise.all(descriptor.parts.map(part => fetchResponse(new URL(part, prefix)).then(response => response.arrayBuffer())));
  return joinArrayBuffers(buffers, descriptor.bytes);
}

export async function loadJson(path, base = ASSET_ROOT) {
  return (await fetchResponse(assetUrl(path, base))).json();
}
