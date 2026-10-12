# Building Studio

Browse 20 Skyborn buildings and 28 props in 3D. The castle and ten village structures have furnished interiors, collision-aware walking, stairs and upper-floor viewpoints. The collection uses darker weathered stone with reusable albedo, roughness and normal maps.

[Open Building Studio](https://21media.to/tools/building-studio/) · [Download the complete asset pack](https://github.com/holokat/building-studio/releases/download/v1.1.0/skyborn-buildings-and-props.zip) · [Download the material library](https://github.com/holokat/building-studio/releases/download/v1.1.0/skyborn-material-library.zip)

## Run locally

The app uses native JavaScript modules and vendored Three.js. No package installation is required. Use Python 3.9 or newer and Node.js:

```sh
python3 scripts/download-runtime.py
node scripts/build.mjs
python3 -m http.server 8773 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8773/. The downloader checks the runtime ZIP's size and SHA-256 before extracting it. The static build splits large binaries into parts which the browser reassembles.

## Controls

Drag to orbit, scroll to zoom, and right-drag to pan. Select **Walk inside**, then use WASD or the arrow keys. Shift moves faster. E opens a nearby door or decorated castle shutter; Esc releases the mouse. **Interior** and **Upstairs** jump to fitted viewpoints. The inspection light provides a soft fill without bleaching nearby stone.

## Assets

Each building and prop has a self-contained GLB download. The complete pack contains all 48 GLBs, the new structures' collision meshes and exploration metadata, previews, and the reusable material library. Separate release downloads provide the material library, editable Blender project and browser runtime. The catalogue records byte sizes and SHA-256 checksums.

The castle includes connected wall walks and towers, three fitted floors, stair rails, solid finials, wall torches, a hanging chandelier and hinged Gothic shutters. Village interiors include their stairs, rooms and furnishings. The models remain available as working drafts for close inspection and further art refinement.

The browser checks a 0.60 m-wide, 1.80 m-tall character against exported triangles. All authored room and stair routes are verified in both directions. This preview controller does not replace integration into a game's own physics, navigation or LOD system.

The native Blender project retains procedural material graphs. Standard glTF uses baked PBR maps; its lighting and surface projection can differ from Blender.

## Licenses

Application code uses the [MIT License](LICENSE). Buildings, props, textures and previews use [CC0 1.0](licenses/CC0-1.0.txt), as selected by the owner. Attribution is not required for those assets.

Three.js retains its MIT license at `vendor/three/LICENSE` in the runtime archive. Licensed Central Icons are supplied separately by the owned 21 Media integration and are excluded from this public repository and its downloads. Standalone controls use text.

## Rebuild downloads

The original building exporter reads the runtime geometry and material records:

```sh
node scripts/build-downloads.mjs --assets web/assets --license licenses/CC0-1.0.txt --out work/downloads
```

`scripts/rewrite-legacy-stone-downloads.mjs` embeds the saved weathered maps in the original building GLBs. `scripts/package-exploration.py --help` packages those files with existing native exports and a portable texture library. These tools preserve source geometry; native exports and the editable project are supplied in the release. Choose a fresh packaging directory to preserve previous releases.
