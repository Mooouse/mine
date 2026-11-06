//! Original implementation of classic permutation-based 2D simplex noise.
//! Structure of gradient sampling follows the same technique used by the
//! MIT-licensed Horizon project (https://github.com/horizon-rust/horizon),
//! crates/horizon-core/src/noise/simplex.rs, Copyright 2026 Ludovic Marie
//! and Horizon contributors. The implementation below is adapted for this
//! standalone sandbox and does not require Horizon's engine or game assets.

pub struct Noise {
    perm: [u8; 512],
}

const GRAD: [(f64, f64); 12] = [
    (1.0,1.0),(-1.0,1.0),(1.0,-1.0),(-1.0,-1.0),
    (1.0,0.0),(-1.0,0.0),(1.0,0.0),(-1.0,0.0),
    (0.0,1.0),(0.0,-1.0),(0.0,1.0),(0.0,-1.0),
];

impl Noise {
    pub fn new(seed: u32) -> Self {
        let mut table = [0u8; 256];
        for (i, v) in table.iter_mut().enumerate() { *v = i as u8; }
        let mut rng = seed ^ 0x9e37_79b9;
        for i in (1..256).rev() {
            rng ^= rng << 13;
            rng ^= rng >> 17;
            rng ^= rng << 5;
            let j = rng as usize % (i + 1);
            table.swap(i, j);
        }
        let mut perm = [0u8; 512];
        for i in 0..512 { perm[i] = table[i & 255]; }
        Self { perm }
    }

    #[inline]
    fn grad(&self, i: i32, j: i32) -> usize {
        let a = self.perm[(i & 255) as usize] as usize;
        (self.perm[a + (j & 255) as usize] % 12) as usize
    }

    #[inline]
    fn corner(&self, g: usize, x: f64, y: f64) -> f64 {
        let r = 0.5 - x*x - y*y;
        if r < 0.0 { 0.0 } else {
            let r2 = r*r;
            r2*r2*(GRAD[g].0*x + GRAD[g].1*y)
        }
    }

    pub fn get(&self, x: f64, y: f64) -> f64 {
        let skew = 0.36602540378443864676; // (sqrt(3)-1)/2
        let unskew = 0.21132486540518711775; // (3-sqrt(3))/6
        let s = (x + y)*skew;
        let i = (x + s).floor() as i32;
        let j = (y + s).floor() as i32;
        let t = (i as f64 + j as f64)*unskew;
        let x0 = x - (i as f64 - t);
        let y0 = y - (j as f64 - t);
        let (a,b) = if x0 > y0 { (1,0) } else { (0,1) };
        let c0 = self.corner(self.grad(i,j),x0,y0);
        let c1 = self.corner(self.grad(i+a,j+b),x0-a as f64+unskew,y0-b as f64+unskew);
        let c2 = self.corner(self.grad(i+1,j+1),x0-1.0+2.0*unskew,y0-1.0+2.0*unskew);
        70.0*(c0+c1+c2)
    }

    pub fn fractal(&self, x:f64,z:f64, octaves:usize, persistence:f64) -> f64 {
        let mut sum = 0.0;
        let mut amp = 1.0;
        let mut freq = 1.0;
        let mut max = 0.0;
        for _ in 0..octaves {
            sum += self.get(x*freq,z*freq)*amp;
            max += amp;
            amp *= persistence;
            freq *= 2.0;
        }
        sum/max
    }
}
