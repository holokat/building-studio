# Building Studio

Browse 9 Skyborn buildings and 28 interior and exterior props in 3D. Orbit around a building, walk inside, use doors, and download individual assets or the complete GLB pack.

[Open Building Studio](https://21media.to/tools/building-studio/) · [Download the complete asset pack](https://github.com/holokat/building-studio/releases/download/v1.0.0/skyborn-buildings-and-props.zip)

## Run locally

The app uses native JavaScript modules and the vendored Three.js runtime. No package installation is required. Use Python 3 and Node.js to download the runtime, build the static app, and serve it:

```sh
python3 scripts/download-runtime.py
node scripts/build.mjs
python3 -m http.server 8773 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8773/. The runtime downloader verifies the release ZIP's size and SHA-256 before extracting it. Large runtime binaries are split during the build and reassembled by the browser without changing their bytes.

## Controls

Drag to orbit, scroll to zoom, and right-drag to pan. Select **Walk inside**, then use WASD or the arrow keys to move. Shift moves faster. E operates a nearby door; Esc releases the mouse. Props support orbit inspection. Downloads are self-contained GLB files.

## Assets

The release contains one GLB per building and prop, a complete ZIP, and a separate browser runtime ZIP. The catalogue records file sizes and SHA-256 checksums. Buildings retain the exported component geometry, transforms, material inputs, and textures. The standalone GLB materials use standard glTF PBR, so renderer-specific procedural details can differ from the browser inspector.

These are art assets. Engine-specific collision, LODs, retopology, and gameplay integration are separate work.

## Licenses

Application code is released under the [MIT License](LICENSE). The buildings, props, asset textures, and previews are released under [CC0 1.0](licenses/CC0-1.0.txt), as selected by the owner. Attribution is not required for those assets.

Three.js retains its own MIT license in the runtime archive at `vendor/three/LICENSE`. The 21 Media integration can supply its licensed Central Icons separately; those icon exports are excluded from this open-source repository and its downloadable archives. The standalone app uses text controls when those icons are unavailable.

## Rebuild asset downloads

After fetching the runtime, regenerate the GLBs, catalogue, and pack in a fresh output directory:

```sh
node scripts/build-downloads.mjs --assets web/assets --license licenses/CC0-1.0.txt --out work/downloads
```

The exporter uses the browser geometry and material records directly. Prop GLBs are copied byte for byte. Existing output files are preserved; choose a fresh output directory for another export.
