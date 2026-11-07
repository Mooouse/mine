/* tslint:disable */
/* eslint-disable */

export class Game {
    free(): void;
    [Symbol.dispose](): void;
    block(x: number, y: number, z: number): number;
    chunk(cx: number, cz: number): Uint8Array;
    edits_count(): number;
    /**
     * Opt-in survival for a separate world namespace; existing creative worlds are unchanged.
     */
    enable_survival(): void;
    export_save(): string;
    export_survival(): string;
    flying(): boolean;
    height_at(x: number, z: number): number;
    import_save(txt: string): boolean;
    import_survival(txt: string): boolean;
    is_survival(): boolean;
    constructor(seed: number);
    player(): Float32Array;
    raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, reach: number): Int32Array;
    seed(): number;
    set_block(x: number, y: number, z: number, value: number): boolean;
    set_flying(fly: boolean): void;
    set_time(t: number): void;
    step(dt: number, mx: number, mz: number, jump: boolean, sprint: boolean, up: number, sneak: boolean): void;
    survival_add_item(id: number, count: number): boolean;
    /**
     * Combat never accepts a client-supplied target id. Server/game logic
     * chooses the nearest visible entity along the camera ray.
     * 0 miss, 1 hit, 2 defeated (loot is added if backpack has space).
     */
    survival_attack_creature(dx: number, dy: number, dz: number, slot: number): number;
    survival_close_inventory(): void;
    /**
     * Craft recipes are indexed by the static Rust recipe registry, never by JS-provided ingredients.
     */
    survival_craft(index: number): boolean;
    /**
     * Local Rust-driven wildlife state: [id,type,x,y,z,heading,stride,hp] per creature.
     */
    survival_creatures(): Float32Array;
    survival_damage(amount: number): void;
    survival_eat(index: number): boolean;
    survival_grid_craft(): boolean;
    /**
     * id, count, tool wear for the positional 3x3 crafting grid.
     */
    survival_grid_items(): Int32Array;
    /**
     * [output id, output count, recipe index] or [0,0,-1].
     */
    survival_grid_result(): Int32Array;
    /**
     * Whether the player is close to a placed workbench (crafting is still validated here).
     */
    survival_has_workbench(): boolean;
    survival_items(): Int32Array;
    /**
     * 0..100: mining progress, 101: mined successfully, negative: blocked/no target.
     * Called while the attack button is held; distance and tool rules are enforced in Rust.
     */
    survival_mine(x: number, y: number, z: number, slot: number, dt: number): number;
    survival_place(x: number, y: number, z: number, slot: number): boolean;
    survival_reset_mining(): void;
    survival_respawn(): void;
    survival_status(): Int32Array;
    survival_tick(dt: number, moving: boolean, sprinting: boolean): void;
    survival_transfer(from: number, to: number, half: boolean): boolean;
    teleport(x: number, y: number, z: number): void;
    tick_water(budget: number): Int32Array;
    time(): number;
    water_pending(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_game_free: (a: number, b: number) => void;
    readonly game_block: (a: number, b: number, c: number, d: number) => number;
    readonly game_chunk: (a: number, b: number, c: number, d: number) => void;
    readonly game_edits_count: (a: number) => number;
    readonly game_enable_survival: (a: number) => void;
    readonly game_export_save: (a: number, b: number) => void;
    readonly game_export_survival: (a: number, b: number) => void;
    readonly game_flying: (a: number) => number;
    readonly game_height_at: (a: number, b: number, c: number) => number;
    readonly game_import_save: (a: number, b: number, c: number) => number;
    readonly game_import_survival: (a: number, b: number, c: number) => number;
    readonly game_is_survival: (a: number) => number;
    readonly game_new: (a: number) => number;
    readonly game_player: (a: number, b: number) => void;
    readonly game_raycast: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly game_seed: (a: number) => number;
    readonly game_set_block: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly game_set_flying: (a: number, b: number) => void;
    readonly game_set_time: (a: number, b: number) => void;
    readonly game_step: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly game_survival_add_item: (a: number, b: number, c: number) => number;
    readonly game_survival_attack_creature: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly game_survival_close_inventory: (a: number) => void;
    readonly game_survival_craft: (a: number, b: number) => number;
    readonly game_survival_creatures: (a: number, b: number) => void;
    readonly game_survival_damage: (a: number, b: number) => void;
    readonly game_survival_eat: (a: number, b: number) => number;
    readonly game_survival_grid_craft: (a: number) => number;
    readonly game_survival_grid_items: (a: number, b: number) => void;
    readonly game_survival_grid_result: (a: number, b: number) => void;
    readonly game_survival_has_workbench: (a: number) => number;
    readonly game_survival_items: (a: number, b: number) => void;
    readonly game_survival_mine: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly game_survival_place: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly game_survival_reset_mining: (a: number) => void;
    readonly game_survival_respawn: (a: number) => void;
    readonly game_survival_status: (a: number, b: number) => void;
    readonly game_survival_tick: (a: number, b: number, c: number, d: number) => void;
    readonly game_survival_transfer: (a: number, b: number, c: number, d: number) => number;
    readonly game_teleport: (a: number, b: number, c: number, d: number) => void;
    readonly game_tick_water: (a: number, b: number, c: number) => void;
    readonly game_time: (a: number) => number;
    readonly game_water_pending: (a: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export2: (a: number, b: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
