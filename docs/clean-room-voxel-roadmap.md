# MINE: clean-room voxel sandbox roadmap

Research date: 2026-11-07.

## Goal

Create an independent Minecraft-like survival sandbox using Rust for world
simulation and WebAssembly, with a lightweight WebGL2 browser frontend.

**Do not redistribute Minecraft Java or Bedrock code, textures, sounds,
skins, fonts, menus, branding, proprietary maps or other Mojang assets.**
Reimplement publicly observable gameplay ideas with original code and assets.

## Research method adapted from storyteller/craft-anything

The project at https://github.com/storytold/craft-anything is a Rust
reverse-engineering and agent-orchestration tool, NOT an engine for Minecraft.
It offers four steps:

1. STUDY: Observe the target's publicly visible behavior, interactions,
   layouts and timing. Record evidence and uncertainty in a feature dossier.
2. BUILD: Implement an original subsystem based on the observation.
3. CHECK: Compare expected and observed behaviors with browser tests,
   screenshots at multiple viewport sizes and reproducible input sequences.
4. REFINE: Address errors, write regression tests, repeat.

Craft Anything itself is early alpha: its README reports game behavior
comparisons as partial. Running its autonomous coding workflow requires a
coding agent on the host computer, not merely reading its GitHub source.
This roadmap adapts the method; it does not claim Craft Anything is installed.

## Baseline audit: MINE Alpha 0.4

Already present:
- Rust/WASM deterministic terrain, blocks, collision, gravity and raycasts
- 16x16x64 chunks, water flow, world edits and local saves
- WebGL2 rendering, a simple day/night sky, creative inventory and HUD
- Desktop/mobile input, five offline minigames with four AI rivals each
- Rust tests, browser smoke tests, an independent compiled site branch

Major gaps to original voxel survival gameplay:
- No counted item stacks, drop tables, tools or durability
- No Survival mode, health, hunger, combat, respawn or progression
- No crafting system (portable 2x2 or workbench 3x3)
- No passive/hostile mobs or environmental threat
- No block-light and sky-light propagation, textured atlas or greedy meshing
- Limited world height and biome/structure diversity
- No authoritative multiplayer networking

## Delivery sequence

### Phase 1: Playable Survival
- Separate Creative and Survival worlds and saves; never overwrite legacy
  creative worlds and inventories.
- Move item registry, stack counts and durability rules into Rust.
- Mine with hardness and tools; yield original item drops.
- Craft planks, sticks, starter tools and other original recipes via 2x2/3x3.
- Add health, hunger, fall damage, food, death and respawn.
- Verify the loop: gather => craft => build => survive => save => reload.

### Phase 2: Authentic voxel rendering and world generation
- Introduce stable block/item ids and per-face 16px original atlas textures.
- Add meaningful biomes, deeper caves, deposits, rivers and structures.
- Migrate to wider vertical ranges without corrupting existing worlds.
- Add greedy mesh generation, chunk boundaries, sunlight propagation,
  block lighting, better water surfaces and frustum culling.
- Verify on mobile and desktop under strict frame/memory budgets.

### Phase 3: Living world and progression
- Implement creatures, NPC AI, farming, combat, loot and cooking in Rust.
- Add weather, lighting and hostile behavior to the day/night cycle.
- Expand original crafts, structures, collectibles and achievements.

### Phase 4: Complex mechanics
- Add independent wiring/automation, building machines, portals or distinct
  dimensions, without copying Minecraft assets or branded names.
- Keep creative building and offline minigames intact.

### Phase 5: Multiplayer (optional)
- Introduce a server-authoritative Rust backend, network tick, player
  entities, login/session safety, synchronization and reconnects.
- Never describe offline bots as human network players.

## Architecture and test gates

Rust owns generation, physics, water, lighting, inventory, recipes, health,
entities, combat and save formats. Browser JS owns input, WebGL, UI and audio.
A stable Rust API exposes each subsystem; avoid duplicated game rules.

Each feature must pass:
1. Native Rust unit tests and property/regression scenarios.
2. Release wasm-pack build plus Chromium smoke test using real WebGL2.
3. Browser validation at desktop and mobile sizes.
4. Save migration / restore tests across game modes.
5. Verification from published static site branch, not GitHub Pages build
   status alone.

**First actual implementation target:** Survival world selector and item
stacks, mining hardness, drops, crafting, health/hunger, and separate
persistent saves. This document does not imply those are implemented yet.

## Source and limitations

https://github.com/storytold/craft-anything (MIT OR Apache-2.0,
reverse-engineering toolkit, early alpha). The tool is neither a copy of
Minecraft nor an automatic one-click Minecraft port. A reference client
could be inspected with permitted clean-room observation, but Minecraft
itself is not part of the cited repository.
