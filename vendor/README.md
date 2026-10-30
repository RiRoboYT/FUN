# Vendored build output

| File | What it is |
|---|---|
| `studyforge3d.bundle.js` | The Vault (Forge Hall) and the live session forge, built from `src/` with esbuild |

The bundle contains, all MIT-licensed (see the `*.LICENSE` files):

- [three.js](https://threejs.org) r170 — renderer plus the official add-ons used: `RoundedBoxGeometry`,
  `RectAreaLightUniformsLib`, `EffectComposer`, `RenderPass`, `GTAOPass`, `BokehPass`,
  `UnrealBloomPass`, `SMAAPass`, `OutputPass`, `ShaderPass` and the blur shaders.
- [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg) 0.0.17 and
  [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) 0.8.3 — constructive solid geometry
  used to carve the ingot-shaped cavity out of each mould.

Why a bundle: three.js add-ons ship as ES modules, which browsers refuse to load from `file://`.
Bundling into one classic script keeps "double-click `index.html`" working.

Rebuild after editing `src/vault/`:

```
npm install
npm run build:3d
```

`js/scene3d.js` loads the bundle on demand, the first time the Forge Hall or a session is opened.
