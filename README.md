# MINE

An original, independent voxel sandbox built with **Rust + WebAssembly**, with a lightweight WebGL2 front end. Inspired by Horizon's Rust approach, but **not** a redistribution of Minecraft or its game assets.

### Project goals
- Infinite procedural voxel terrain, with several biomes
- Mining, placing blocks, first-person exploration
- Persistent local save and a creative building palette
- Desktop and touch controls
- Play from GitHub Pages, no installation

### Build and run
Build requires Rust, the wasm32-unknown-unknown target, and wasm-pack:

```sh
cargo install wasm-pack
wasm-pack build --target web --release --out-dir pkg
python3 -m http.server 8000
```

Open http://localhost:8000/web/ **only after** copying or serving `pkg/` alongside `web/`, or use the generated `dist/` folder from GitHub Actions.

GitHub Actions compiles and deploys to GitHub Pages.

### Credits and rights
This is a standalone sandbox, not affiliated with Minecraft or Mojang.
No Minecraft textures, code, or downloadable assets are included.
For background inspiration, see [Horizon](https://github.com/horizon-rust/horizon) (MIT).
