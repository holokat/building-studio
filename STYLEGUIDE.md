# Building Studio style guide

Building Studio retains the Skyborn inspector's restrained workshop interface. The 3D asset is the primary content. Use the existing renderer and previews rather than decorative effects.

## Layout and type

Use the existing Inter and system sans-serif stack. Keep the library beside the viewport on desktop and below it on narrow screens. The asset title comes first; view mode and floor information sit below it. Group building and prop navigation together, and keep download actions visible outside the scrolling asset list.

Use sentence case, short labels, and consistent spacing. The desktop header is 82 px tall and the library is 266 px wide. Narrow layouts use a 70 px header. Avoid shadows, ornamental headings, and added shader effects in the interface.

## Color

The library uses `#181b1c` with `#e6e5e0` text, `#949c9d` secondary text, and `#d6b68b` for the active mode and keyboard focus. Selected library items use `#303434`. The viewport uses `#dcd8cf`, with dark green-gray controls. Preserve the renderer's material colors independently of interface colors.

## Controls and accessibility

Use at least 40 px control targets. Retain visible keyboard focus, text labels or accessible names, a focus-only skip link, and reduced-motion support. Asset lists scroll independently of download actions. Downloads identify the selected asset and the complete pack.

The standalone open-source app uses text controls. The owned 21 Media deployment supplies licensed Central Icons for viewport actions through its build integration. Those SVG exports remain outside this repository and the asset archives.

## Shared behavior

Reuse the existing library cards, tabs, viewport controls, and footer. The footer links to the 21 Media tools directory and the public repository. Individual downloads and the full pack come from the versioned catalogue, which records release URLs, sizes, and checksums.
