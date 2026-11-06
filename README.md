# MINE

**Play the current MINE Alpha 0.4:** [Open the latest compiled Rust/WebAssembly build](https://raw.githack.com/Mooouse/mine/site/index.html)

**GitHub Pages notice:** `https://mooouse.github.io/mine/` currently serves **Alpha 0.2**, because GitHub Pages deployment is stuck on `updating_pages`. The latest compiled game is pushed to the `site` branch and verified in headless Chrome using its live mirror link.

To restore the original GitHub Pages address, repository administrator:
1. Open **Settings → Pages → Build and deployment**.
2. Change **Source** to **Deploy from a branch**.
3. Choose branch **site** and folder **/(root)**; click **Save**.
4. After the site is published, verify `ALPHA 0.4` in the menu. A force reload (Ctrl+F5) can clear the previous asset cache.

An original, independent voxel sandbox built with **Rust + WebAssembly**, with a lightweight WebGL2 front end. Inspired by Horizon's Rust approach, but **not** a redistribution of Minecraft or its game assets.

## MINE ARCADE — five mini-games (Alpha 0.4)

Choose **MINIGAMES** from the title screen. All matches are **offline** and
feature four clearly labeled AI bots with animated blocky avatars; no real
online players or network matchmaking are implied.

| Mode | Objective |
|---|---|
| Spleef | Remove snow beneath bots; last on the platform wins. |
| TNT Run | Floor tiles disappear shortly after being stepped on. |
| Parkour Race | Sprint and jump between elevated pads; checkpoints save your run. |
| Block Party | Find and stand on the named color before other tiles vanish. |
| Sumo | Punch computer rivals and knock them off the floating ring. |

**Controls:** WASD move, mouse look, Space jump, Ctrl sprint,
left-click or touch **BREAK/PUNCH** for relevant actions, Escape pause.
**RULES** and **EXIT** buttons appear on the in-match scoreboard. Replays,
results, personal win counts, and game selection are available after matches.

Arcade matches run in temporary Rust Game instances; normal worlds and
inventories are not overwritten. Automated Chrome tests exercise **all five
arena entries, four NPC bot instances per match, the mode lobby, and world
save isolation**.

### Project goals
- Infinite procedural voxel terrain, with several biomes
- Mining, placing blocks, first-person exploration
- Persistent local save and a creative building palette
- Desktop and touch controls
- Play from a static preview, no installation

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

## Alpha 0.4 — controls and features

The game is a standalone **creative voxel sandbox**. Its source code and
textures/shaders are original; it does not include Minecraft assets.

- **W / A / S / D:** move; mouse: look
- **Space:** jump or rise while flying; press twice quickly to toggle flight
- **Left Shift:** sneak / avoid walking off ledges, or descend while flying
- **Left Control:** sprint; **F:** swap the selected hotbar block with the offhand
- **Left click:** break blocks; **right click:** place the selected block
- **Middle click:** select the targeted block for creative building
- **1–9 / mouse wheel:** choose a hotbar slot
- **E:** open/close the creative inventory (27 storage slots, nine hotbar slots, offhand);
  **Esc:** close inventory / pause game
- **Inventory:** pick any of 24 materials, click a slot to swap with the
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
