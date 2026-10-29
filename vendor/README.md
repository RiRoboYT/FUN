# Vendored libraries

| File | Library | Version | License |
|---|---|---|---|
| `three.min.js` | [three.js](https://threejs.org) | r158 (`three@0.158.0`, `build/three.min.js`) | MIT — see `three.LICENSE` |

r158 is used because it is the last release that ships a classic (non-module) build, so the
app keeps working when `index.html` is opened directly from disk (`file://`), where ES modules
are blocked. The only change from upstream: the leading `console.warn(...)` deprecation notice about
that classic build is replaced by `void`, so the rest of the file is byte-for-byte upstream.

Loaded lazily by `js/vault.js` the first time the Forge Hall is opened.
