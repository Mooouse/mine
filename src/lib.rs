//! MINE: an original Rust voxel simulation compiled to WebAssembly.
mod noise;

use noise::Noise;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

const SIDE: usize = 16;
const HEIGHT: usize = 64;
const VOLUME: usize = SIDE * SIDE * HEIGHT;
const SEA: i32 = 19;

const AIR: u8 = 0;
const GRASS: u8 = 1;
const DIRT: u8 = 2;
const STONE: u8 = 3;
const SAND: u8 = 4;
const LOG: u8 = 5;
const LEAVES: u8 = 6;
const SNOW: u8 = 7;
const WATER: u8 = 8;
const FLOWER: u8 = 14;
const CACTUS: u8 = 16;

#[inline]
fn idx(x: usize, y: usize, z: usize) -> usize {
    (y * SIDE + z) * SIDE + x
}
#[inline]
fn chunk_key(cx: i32, cz: i32) -> i64 {
    ((cx as i64) << 32) ^ (cz as u32 as i64)
}
#[inline]
fn hash(x:i32,z:i32,seed:u32) -> u32 {
    let mut v = (x as u32).wrapping_mul(0x9e3779b9)
        ^ (z as u32).wrapping_mul(0x85ebca6b)
        ^ seed.wrapping_mul(0xc2b2ae35);
    v ^= v >> 16;
    v = v.wrapping_mul(0x7feb352d);
    v ^= v >> 15;
    v = v.wrapping_mul(0x846ca68b);
    v ^ (v >> 16)
}

#[wasm_bindgen]
pub struct Game {
    seed: u32,
    noise: Noise,
    chunks: HashMap<i64, Vec<u8>>,
    edits: HashMap<(i32,i32,i32),u8>,
    px:f32, py:f32, pz:f32,
    vx:f32, vy:f32, vz:f32,
    grounded:bool,
    flying:bool,
    time:f32,
}

#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Game {
        let seed = if seed == 0 { 42042 } else { seed };
        let mut game = Game {
            seed, noise: Noise::new(seed), chunks: HashMap::new(),
            edits: HashMap::new(),
            px:8.5, py:34.0, pz:8.5,
            vx:0.0, vy:0.0, vz:0.0,
            grounded:false, flying:false, time:90.0,
        };
        let h = game.height_at(8,8);
        game.py = (h + 3) as f32;
        game
    }

    pub fn seed(&self) -> u32 { self.seed }
    pub fn time(&self) -> f32 { self.time }
    pub fn set_time(&mut self, t:f32) { self.time = t.rem_euclid(1200.0); }
    pub fn flying(&self) -> bool { self.flying }
    pub fn set_flying(&mut self, fly: bool) {
        self.flying = fly;
        self.vy = 0.0;
    }
    pub fn edits_count(&self) -> usize { self.edits.len() }

    pub fn height_at(&self,x:i32,z:i32) -> i32 {
        let xf = x as f64;
        let zf = z as f64;
        let continent = self.noise.fractal(xf * 0.0055, zf * 0.0055, 4, 0.5);
        let hills = self.noise.fractal(xf * 0.018, zf * 0.018, 4, 0.53);
        let detail = self.noise.fractal(xf * 0.072, zf * 0.072, 3, 0.46);
        let peaks = self.noise.fractal((xf+400.0)*0.009, (zf-500.0)*0.009, 3, 0.55).abs();
        let mountain = ((continent - 0.08) * 1.4).clamp(0.0,1.0);
        let level = 22.0 + continent*12.0 + hills*6.0 + detail*1.8 + peaks*mountain*23.0;
        (level.round() as i32).clamp(5, HEIGHT as i32 - 9)
    }

    fn biome(&self,x:i32,z:i32) -> u8 {
        let xf = x as f64;
        let zf = z as f64;
        let heat = self.noise.fractal((xf+800.0)*0.007, (zf-700.0)*0.007, 3, 0.5);
        let humidity = self.noise.fractal((xf-400.0)*0.009, (zf+900.0)*0.009, 3, 0.5);
        if heat > 0.22 && humidity < 0.1 { 1 } // desert
        else if heat < -0.3 { 2 } // snowy
        else { 0 }
    }

    fn build_chunk(&self, cx:i32,cz:i32) -> Vec<u8> {
        let mut b = vec![AIR; VOLUME];
        for lx in 0..SIDE {
            for lz in 0..SIDE {
                let x = cx*SIDE as i32 + lx as i32;
                let z = cz*SIDE as i32 + lz as i32;
                let h = self.height_at(x,z);
                let biome = self.biome(x,z);
                let top = if h <= SEA+1 || biome == 1 { SAND }
                    else if biome == 2 || h >= 42 { SNOW }
                    else { GRASS };
                for y in 0..=h as usize {
                    let v = if y == 0 { 12 }
                        else if y == h as usize { top }
                        else if y > (h - 4).max(0) as usize {
                            if top == SAND { SAND } else { DIRT }
                        } else { STONE };
                    b[idx(lx,y,lz)] = v;
                }
                if h < SEA {
                    for y in h+1..=SEA { b[idx(lx,y as usize,lz)] = WATER; }
                }
            }
        }
        // All structures stay inside their own chunk, avoiding cut-off trees.
        for lx in 2..14usize {
            for lz in 2..14usize {
                let x = cx*SIDE as i32 + lx as i32;
                let z = cz*SIDE as i32 + lz as i32;
                let h = self.height_at(x,z);
                if h < SEA+2 || h > 39 { continue; }
                let biome = self.biome(x,z);
                let roll = hash(x,z,self.seed);
                if biome == 1 {
                    if roll % 270 == 7 && lx >= 3 && lx <= 12 && lz >= 3 && lz <= 12 {
                        for y in (h+1)..=(h+3) {
                            b[idx(lx,y as usize,lz)] = CACTUS;
                        }
                    }
                } else if biome != 2 && roll % 285 == 5 && lx >= 4 && lx <= 11 && lz >= 4 && lz <= 11 {
                    let height = 4 + (roll >> 8) % 3;
                    for dy in 1..=height {
                        b[idx(lx,(h+dy as i32) as usize,lz)] = LOG;
                    }
                    let crown = h + height as i32;
                    for dy in -2i32..=2 {
                        for dx in -2i32..=2 {
                            for dz in -2i32..=2 {
                                if dx.abs()+dz.abs()+dy.abs() > 4 { continue; }
                                let xx=(lx as i32+dx) as usize;
                                let zz=(lz as i32+dz) as usize;
                                let yy=(crown+dy) as usize;
                                let pos = idx(xx,yy,zz);
                                if b[pos] == AIR { b[pos] = LEAVES; }
                            }
                        }
                    }
                } else if biome == 0 && roll % 42 == 2 && h < 38 {
                    b[idx(lx,(h+1) as usize,lz)] = FLOWER;
                }
            }
        }
        b
    }

    fn ensure_chunk(&mut self,cx:i32,cz:i32) {
        let key = chunk_key(cx,cz);
        if !self.chunks.contains_key(&key) {
            let chunk = self.build_chunk(cx,cz);
            self.chunks.insert(key,chunk);
        }
    }

    pub fn chunk(&mut self,cx:i32,cz:i32) -> Vec<u8> {
        self.ensure_chunk(cx,cz);
        self.chunks.get(&chunk_key(cx,cz)).unwrap().clone()
    }

    pub fn block(&mut self,x:i32,y:i32,z:i32) -> u8 {
        if y < 0 { return 12; }
        if y >= HEIGHT as i32 { return 0; }
        let cx=x.div_euclid(SIDE as i32);
        let cz=z.div_euclid(SIDE as i32);
        let lx=x.rem_euclid(SIDE as i32) as usize;
        let lz=z.rem_euclid(SIDE as i32) as usize;
        self.ensure_chunk(cx,cz);
        self.chunks[&chunk_key(cx,cz)][idx(lx,y as usize,lz)]
    }

    pub fn set_block(&mut self,x:i32,y:i32,z:i32,value:u8) -> bool {
        if y <= 0 || y >= HEIGHT as i32 || value > 16 { return false; }
        let prev = self.block(x,y,z);
        if prev == value { return false; }
        let cx=x.div_euclid(SIDE as i32);
        let cz=z.div_euclid(SIDE as i32);
        let lx=x.rem_euclid(SIDE as i32) as usize;
        let lz=z.rem_euclid(SIDE as i32) as usize;
        let key = chunk_key(cx,cz);
        self.chunks.get_mut(&key).unwrap()[idx(lx,y as usize,lz)] = value;
        self.edits.insert((x,y,z),value);
        true
    }

    fn solid(&mut self,x:i32,y:i32,z:i32) -> bool {
        !matches!(self.block(x,y,z), AIR | WATER | FLOWER)
    }

    fn collides(&mut self,x:f32,y:f32,z:f32) -> bool {
        // Position y is player's feet. AABB is 0.58 x 1.76 x 0.58.
        let left = (x - 0.29).floor() as i32;
        let right = (x + 0.29).floor() as i32;
        let back = (z - 0.29).floor() as i32;
        let front = (z + 0.29).floor() as i32;
        let bottom = (y + 0.03).floor() as i32;
        let top = (y + 1.74).floor() as i32;
        for ix in left..=right {
            for iz in back..=front {
                for iy in bottom..=top {
                    if self.solid(ix,iy,iz) { return true; }
                }
            }
        }
        false
    }

    pub fn step(&mut self,dt:f32,mx:f32,mz:f32,jump:bool,sprint:bool,up:f32) {
        let dt = dt.clamp(0.0,0.05);
        self.time = (self.time + dt).rem_euclid(1200.0);
        let mut x=mx; let mut z=mz;
        let len=(x*x+z*z).sqrt();
        if len > 1.0 { x/=len; z/=len; }
        let speed = if self.flying { if sprint { 16.0 } else { 9.0 } }
                    else if sprint { 7.2 } else { 4.8 };
        let blend = (dt * if self.grounded || self.flying { 15.0 } else { 5.0 }).min(1.0);
        self.vx += (x*speed-self.vx)*blend;
        self.vz += (z*speed-self.vz)*blend;
        if self.flying {
            self.vy += ((if jump { 1.0 } else { 0.0 } - up)*speed - self.vy)*blend;
        } else {
            if self.grounded && jump { self.vy = 8.4; self.grounded = false; }
            self.vy = (self.vy - 24.0*dt).max(-36.0);
        }

        let nx = self.px + self.vx*dt;
        if !self.collides(nx,self.py,self.pz) { self.px=nx; }
        else if self.grounded && !self.collides(nx,self.py+1.05,self.pz) {
            self.px=nx; self.py+=1.05;
        } else { self.vx=0.0; }
        let nz = self.pz + self.vz*dt;
        if !self.collides(self.px,self.py,nz) { self.pz=nz; }
        else if self.grounded && !self.collides(self.px,self.py+1.05,nz) {
            self.pz=nz; self.py+=1.05;
        } else { self.vz=0.0; }
        let ny=self.py+self.vy*dt;
        if !self.collides(self.px,ny,self.pz) {
            self.py=ny; self.grounded=false;
        } else {
            if self.vy < 0.0 { self.grounded=true; }
            self.vy=0.0;
        }
        if self.py < -10.0 { self.py=(self.height_at(self.px as i32,self.pz as i32)+4) as f32; self.vy=0.0; }
    }

    pub fn player(&self)->Vec<f32> {
        vec![self.px,self.py,self.pz,self.vx,self.vy,self.vz,if self.grounded {1.0}else{0.0}]
    }

    pub fn teleport(&mut self,x:f32,y:f32,z:f32) {
        self.px=x;self.py=y;self.pz=z;
        self.vx=0.0;self.vy=0.0;self.vz=0.0;
    }

    pub fn raycast(&mut self,ox:f32,oy:f32,oz:f32,dx:f32,dy:f32,dz:f32,reach:f32) -> Vec<i32> {
        let mut px=ox.floor() as i32;
        let mut py=oy.floor() as i32;
        let mut pz=oz.floor() as i32;
        let mut prev=(px,py,pz);
        let steps=(reach/0.08).ceil() as i32;
        for i in 0..=steps {
            let d = i as f32 * 0.08;
            let x=(ox+dx*d).floor() as i32;
            let y=(oy+dy*d).floor() as i32;
            let z=(oz+dz*d).floor() as i32;
            if (x,y,z)!=(px,py,pz) { prev=(px,py,pz);px=x;py=y;pz=z; }
            let id=self.block(x,y,z);
            if id!=AIR && id!=WATER && id!=FLOWER {
                return vec![x,y,z,prev.0,prev.1,prev.2,id as i32];
            }
        }
        Vec::new()
    }

    pub fn export_save(&self)->String {
        // Stable versioned, whitespace-free format; edited blocks only.
        let mut s = format!("M1|{}|{}|{}|{}|{}|",self.seed,self.px,self.py,self.pz,self.time);
        for ((x,y,z),v) in &self.edits {
            s.push_str(&format!("{},{},{},{};",x,y,z,v));
        }
        s
    }

    pub fn import_save(&mut self,txt:&str) -> bool {
        let mut parts=txt.splitn(7,'|');
        if parts.next()!=Some("M1") { return false; }
        let seed=parts.next().and_then(|v|v.parse::<u32>().ok());
        if seed!=Some(self.seed) { return false; }
        let px=parts.next().and_then(|v|v.parse::<f32>().ok());
        let py=parts.next().and_then(|v|v.parse::<f32>().ok());
        let pz=parts.next().and_then(|v|v.parse::<f32>().ok());
        let time=parts.next().and_then(|v|v.parse::<f32>().ok());
        let data=parts.next();
        if let (Some(px),Some(py),Some(pz),Some(time),Some(data))=(px,py,pz,time,data) {
            if px.is_finite() && py.is_finite() && pz.is_finite() && time.is_finite() {
                self.teleport(px,py,pz);
                self.time=time.rem_euclid(1200.0);
                for r in data.split(';') {
                    let nums:Vec<i32>=r.split(',').filter_map(|v|v.parse().ok()).collect();
                    if nums.len()==4 {
                        self.set_block(nums[0],nums[1],nums[2],nums[3] as u8);
                    }
                }
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn generated_world_is_deterministic() {
        let mut a=Game::new(123);
        let mut b=Game::new(123);
        for x in -4..20 { for z in -4..20 {
            assert_eq!(a.block(x,20,z),b.block(x,20,z));
        }}
    }
    #[test]
    fn edits_survive_save() {
        let mut a=Game::new(98);
        assert!(a.set_block(3,60,3,9));
        let save=a.export_save();
        let mut b=Game::new(98);
        assert!(b.import_save(&save));
        assert_eq!(b.block(3,60,3),9);
    }
    #[test]
    fn negative_chunk_coords_work() {
        let mut a=Game::new(1);
        assert_eq!(a.block(-1,23,-1),a.chunk(-1,-1)[idx(15,23,15)]);
    }
}
