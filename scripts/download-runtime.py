#!/usr/bin/env python3
"""Fetch the verified release runtime without requiring a package installation."""
import hashlib
import json
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
release = json.loads((ROOT / 'runtime.json').read_text())
cache = ROOT / 'work' / release['filename']
cache.parent.mkdir(parents=True, exist_ok=True)
with cache.open('w+b') as download:
    with urllib.request.urlopen(release['url']) as response:
        digest = hashlib.sha256()
        size = 0
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            download.write(chunk)
            size += len(chunk)
    if size != release['bytes'] or digest.hexdigest() != release['sha256']:
        raise RuntimeError('Runtime download failed its size or SHA-256 check.')
    download.seek(0)
    with zipfile.ZipFile(download) as archive:
        for item in archive.infolist():
            target = (ROOT / 'web' / item.filename).resolve()
            if not target.is_relative_to((ROOT / 'web').resolve()):
                raise RuntimeError('Unsafe path in runtime archive.')
        archive.extractall(ROOT / 'web')
print('Verified Building Studio runtime is ready in web/.')
