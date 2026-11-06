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
mkdir -p dist && cp -r web/. dist/ && cp -r pkg dist/pkg
cd dist && python3 -m http.server 8000
```

Open http://localhost:8000 after building, or use the hosted GitHub Pages site.

GitHub Actions compiles and deploys to GitHub Pages.

### Credits and rights
This is a standalone sandbox, not affiliated with Minecraft or Mojang.
No Minecraft textures, code, or downloadable assets are included.
For background inspiration, see [Horizon](https://github.com/horizon-rust/horizon) (MIT).

## Alpha 0.2 — controls and features

The game is a standalone **creative voxel sandbox**. Its source code and
textures/shaders are original; it does not include Minecraft assets.

- **W / A / S / D:** move; mouse: look
- **Space:** jump or rise while flying; press twice quickly to toggle flight
- **Left Shift:** sneak / avoid walking off ledges, or descend while flying
- **Left Control:** sprint; **F:** optional accessible flight toggle
- **Left click:** break blocks; **right click:** place the selected block
- **Middle click:** select the targeted block for creative building
- **1–9 / mouse wheel:** choose a hotbar slot
- **E:** open/close the creative inventory (27 storage slots, nine hotbar slots);
  **Esc:** close inventory / pause game
- **Inventory:** pick any of 16 materials, click a slot to swap with the
  cursor item, right-click a catalog block to put it directly on the hotbar,
  Shift-click to quick move, or drag and drop.
- **Water:** sources spread down and across nearby ground in Rust, and the
  flow recedes after its source is removed. Updated water surfaces render with
  varied heights and animated ripples.
- **Graphics:** procedural atmospheric sky with moving clouds, sunrise/sunset,
  a moon and stars.
- **Mobile:** joystick, touch look, build / break / jump and inventory buttons.

Inventory and edited blocks are saved locally per world seed.
GitHub Actions checks Rust world/fluid tests and a headless Chrome browser test
before publishing to Pages.
