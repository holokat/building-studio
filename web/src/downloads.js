const CATALOG_URL = './downloads.json';

function humanBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB']; let index = 0; let value = bytes;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function key(value) { return String(value || '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ''); }

export function findDownload(assets, candidates) {
  const matches = new Set(candidates.filter(Boolean).map(key));
  return assets.find(item => matches.has(key(item.id))) || assets.find(item => matches.has(key(item.name)));
}

export class DownloadLibrary {
  constructor({ status, selectedLink, packLink } = {}) {
    this.status = status; this.selectedLink = selectedLink; this.packLink = packLink; this.assets = []; this.pack = null;
  }

  async boot() {
    try {
      const response = await fetch(CATALOG_URL);
      if (!response.ok) throw new Error('The download catalog is unavailable.');
      const catalog = await response.json();
      if (!Array.isArray(catalog.assets) || !catalog.pack?.url) throw new Error('The download catalog is invalid.');
      this.assets = catalog.assets; this.pack = catalog.pack;
      this.packLink.href = this.pack.url; this.packLink.hidden = false;
      this.packLink.textContent = `Download all assets (${humanBytes(this.pack.bytes)})`;
      this.status.textContent = 'CC0 assets';
    } catch {
      this.status.textContent = 'Downloads are currently unavailable.';
    }
  }

  select(...candidates) {
    const asset = findDownload(this.assets, candidates);
    if (asset?.url) {
      this.selectedLink.href = asset.url; this.selectedLink.hidden = false;
      this.selectedLink.textContent = `Download selected asset${asset.bytes ? ` (${humanBytes(asset.bytes)})` : ''}`;
      this.status.textContent = 'CC0 asset';
    } else { this.selectedLink.hidden = true; this.status.textContent = 'CC0 assets'; }
  }

  selectExternal(asset) {
    if (!asset?.url) { this.select(); return; }
    this.selectedLink.href = asset.url; this.selectedLink.hidden = false;
    this.selectedLink.textContent = `Download selected asset${asset.bytes ? ` (${humanBytes(asset.bytes)})` : ''}`;
    this.status.textContent = 'CC0 asset';
  }
}
