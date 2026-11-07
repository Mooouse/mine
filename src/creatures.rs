//! Original local wildlife for MINE. The Rust simulation owns movement,
//! aggression, combat and loot; WebGL receives only render snapshots.

#[derive(Clone,Copy,Debug)]
pub struct Creature {
    pub id:u32,
    pub kind:u8, // 1 moss grazer, 2 dusk prowler
    pub x:f32,
    pub y:f32,
    pub z:f32,
    pub heading:f32,
    pub stride:f32,
    pub health:i32,
    pub cooldown:f32,
    pub flee:f32,
    pub wander:f32,
}
impl Creature {
    pub fn new(id:u32,kind:u8,x:f32,y:f32,z:f32,heading:f32)->Self {
        Self{id,kind,x,y,z,heading,stride:0.0,
            health:if kind==1{5}else{8},
            cooldown:0.0,flee:0.0,wander:0.0}
    }
    pub fn pack(&self)->[f32;8]{
        [self.id as f32,self.kind as f32,self.x,self.y,self.z,
         self.heading,self.stride,self.health as f32]
    }
}

pub fn daylight(time:f32)->f32{
    (0.42+(time/1200.0*std::f32::consts::TAU).sin()*0.67).clamp(0.0,1.0)
}
pub fn is_night(time:f32)->bool{ daylight(time)<0.24 }

#[cfg(test)]
mod tests{
    use super::*;
    #[test] fn day_cycle_has_both_phases() {
        assert!(!is_night(300.0));
        assert!(is_night(900.0));
    }
    #[test] fn creature_snapshot_is_finite_and_stable() {
        let c=Creature::new(7,2,10.0,24.0,3.0,0.0);
        assert_eq!(c.pack()[0],7.0);
        assert_eq!(c.pack()[1],2.0);
        assert!(c.pack().iter().all(|v|v.is_finite()));
    }
}
