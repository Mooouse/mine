//! Original survival systems for MINE. Item counts, crafting and health are authoritative in Rust.
//! Creative inventory and old M1 world saves are intentionally independent from these rules.

pub const SLOT_COUNT: usize = 37; // 9 hotbar, 27 backpack, one internal cursor slot
pub const STICK: u8 = 40;
pub const WOOD_PICK: u8 = 41;
pub const STONE_PICK: u8 = 42;
pub const WOOD_AXE: u8 = 43;
pub const STONE_AXE: u8 = 44;
pub const WOOD_SHOVEL: u8 = 45;
pub const STONE_SHOVEL: u8 = 46;
pub const BERRIES: u8 = 47;
pub const WORKBENCH: u8 = 33;

#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct Stack {
    pub id: u8,
    pub count: u8,
    pub wear: u16,
}
impl Stack {
    pub fn new(id:u8,count:u8) -> Self { Self{id,count,wear:0} }
}
pub fn valid_item(id:u8)->bool {
    matches!(id,1..=16|25..=33|40..=47) && id!=8 && id!=14
}
pub fn is_tool(id:u8)->bool { matches!(id,WOOD_PICK..=STONE_SHOVEL) }
pub fn max_stack(id:u8)->u8 { if is_tool(id){1}else{64} }
pub fn max_wear(id:u8)->u16 {if matches!(id,WOOD_PICK|WOOD_AXE|WOOD_SHOVEL){60}else if is_tool(id){132}else{0} }
pub fn tool_kind(id:u8)->u8 {match id {
    WOOD_PICK|STONE_PICK=>1, WOOD_AXE|STONE_AXE=>2,
    WOOD_SHOVEL|STONE_SHOVEL=>3,_=>0,
}}
pub fn block_kind(id:u8)->u8 {match id{
    3|12|13|15|25|29|30|32=>1,
    5|11|28|33=>2,
    1|2|4|7|26|31=>3,
    _=>0
}}
pub fn hardness(id:u8)->f32 {match id{
    0=>0.0,1|2|4|7|26|31=>.75,5|28|11|33=>1.8,
    3|12|15|25=>2.8,13|29|30|32=>3.2,
    6|16=>.35,10=>.35,9=>1.9,14=>.05,_=>1.0,
}}
pub fn mine_seconds(id:u8, tool:u8)->f32 {
    let hardness=hardness(id);
    if hardness<=0.0 {return 0.0;}
    if tool_kind(tool)==block_kind(id)&&block_kind(id)!=0 {
        if matches!(tool,STONE_PICK|STONE_AXE|STONE_SHOVEL){hardness*.18}
        else {hardness*.28}
    }else { hardness * if block_kind(id)==1 {2.0}else{1.15} }
}
pub fn drop_for(id:u8,seed:u32,x:i32,y:i32,z:i32,tool:u8)->u8 {
    let rock=matches!(id,3|12|13|15|25|29|30|32);
    if rock&&tool_kind(tool)!=1{return 0;}
    match id {
        1=>2, 3=>25, 6=>{
            let hash=(x as u32).wrapping_mul(0x9e37)
                ^(y as u32).wrapping_mul(0x7767)
                ^(z as u32).wrapping_mul(0x27d4)^seed;
            if hash%3==0 {BERRIES}else{0}
        },8|10|14=>0,
        33=>WORKBENCH,
        other=>other,
    }
}
#[derive(Clone,Copy)]
pub struct Recipe{
    pub name:&'static str,
    pub ingredients:&'static [(u8,u8)],
    pub output:(u8,u8),
    pub workstation:bool,
}
pub const RECIPES:[Recipe;9]=[
    Recipe{name:"Planks",ingredients:&[(5,1)],output:(11,4),workstation:false},
    Recipe{name:"Sticks",ingredients:&[(11,2)],output:(STICK,4),workstation:false},
    Recipe{name:"Workbench",ingredients:&[(11,4)],output:(WORKBENCH,1),workstation:false},
    Recipe{name:"Wooden Pick",ingredients:&[(11,3),(STICK,2)],output:(WOOD_PICK,1),workstation:true},
    Recipe{name:"Stone Pick",ingredients:&[(25,3),(STICK,2)],output:(STONE_PICK,1),workstation:true},
    Recipe{name:"Wooden Axe",ingredients:&[(11,3),(STICK,2)],output:(WOOD_AXE,1),workstation:true},
    Recipe{name:"Stone Axe",ingredients:&[(25,3),(STICK,2)],output:(STONE_AXE,1),workstation:true},
    Recipe{name:"Wooden Shovel",ingredients:&[(11,1),(STICK,2)],output:(WOOD_SHOVEL,1),workstation:true},
    Recipe{name:"Stone Shovel",ingredients:&[(25,1),(STICK,2)],output:(STONE_SHOVEL,1),workstation:true},
];

pub struct Survival{
    pub slots:[Stack;SLOT_COUNT],
    pub health:i32,
    pub hunger:i32,
    pub exhausted:f32,
    pub regen:f32,
    pub dead:bool,
    pub mine_at:Option<(i32,i32,i32)>,
    pub mine_progress:f32,
}
impl Default for Survival{
    fn default()->Self {
        Self{slots:[Stack::default();SLOT_COUNT],health:20,hunger:20,
            exhausted:0.0,regen:0.0,dead:false,mine_at:None,mine_progress:0.0}
    }
}
impl Survival{
    pub fn slot(&self,index:usize)->Stack{self.slots.get(index).copied().unwrap_or_default()}
    pub fn packed(&self)->Vec<i32>{
        self.slots.iter().flat_map(|s|[s.id as i32,s.count as i32,s.wear as i32]).collect()
    }
    pub fn count(&self,id:u8)->u32{
        self.slots[..36].iter().filter(|s|s.id==id).map(|s|s.count as u32).sum()
    }
    pub fn add(&mut self,id:u8,mut count:u8)->bool{
        if !valid_item(id)||count==0{return false;}
        let free:u32=self.slots[..36].iter().map(|s|
            if s.id==id {(max_stack(id)-s.count) as u32}
            else if s.id==0 {max_stack(id) as u32}
            else {0}).sum();
        if free<count as u32{return false;}
        for s in &mut self.slots[..36]{
            if s.id!=id||s.count==max_stack(id){continue;}
            let n=count.min(max_stack(id)-s.count);s.count+=n;count-=n;if count==0{return true;}
        }
        for s in &mut self.slots[..36]{
            if s.id!=0{continue;}
            let n=count.min(max_stack(id));
            *s=Stack::new(id,n);count-=n;if count==0{return true;}
        }
        false
    }
    pub fn use_one(&mut self,index:usize)->bool{
        let Some(s)=self.slots.get_mut(index)else{return false;};
        if s.id==0||s.count==0{return false;}
        s.count-=1;
        if s.count==0{*s=Stack::default();}
        true
    }
    pub fn damage_tool(&mut self,index:usize){
        let Some(s)=self.slots.get_mut(index)else{return;};
        if !is_tool(s.id){return;}
        s.wear=s.wear.saturating_add(1);
        if s.wear>=max_wear(s.id){*s=Stack::default();}
    }
    pub fn transfer(&mut self,from:usize,to:usize,half:bool)->bool{
        if from>=SLOT_COUNT||to>=SLOT_COUNT||from==to{return false;}
        let a=self.slots[from];let b=self.slots[to];
        if a.id==0{return false;}
        if b.id!=0&&b.id!=a.id {
            if half {return false;}
            self.slots[from]=b;self.slots[to]=a;return true;
        }
        if b.id==0 {
            let n=if half {(a.count+1)/2}else{a.count};
            self.slots[to]=Stack{id:a.id,count:n,wear:a.wear};
            self.slots[from].count-=n;
            if self.slots[from].count==0{self.slots[from]=Stack::default();}
            return true;
        }
        if is_tool(a.id){return false;}
        let n=(max_stack(a.id)-b.count).min(if half {1}else{a.count});
        if n==0{return false;}
        self.slots[to].count+=n;
        self.slots[from].count-=n;
        if self.slots[from].count==0{self.slots[from]=Stack::default();}
        true
    }
    pub fn craft(&mut self,recipe_index:usize,near_bench:bool)->bool{
        let Some(recipe)=RECIPES.get(recipe_index)else{return false;};
        if recipe.workstation&&!near_bench{return false;}
        if recipe.ingredients.iter().any(|&(id,count)|self.count(id)<count as u32){return false;}
        // Transaction: validate the whole result on a clone before consuming inputs.
        let mut temp=self.slots;
        for &(id,mut count) in recipe.ingredients {
            for slot in &mut temp[..36]{
                if slot.id!=id{continue;}
                let n=count.min(slot.count);
                slot.count-=n;count-=n;
                if slot.count==0{*slot=Stack::default();}
                if count==0{break;}
            }
        }
        let mut candidate=Self{slots:temp,..Self::default()};
        if !candidate.add(recipe.output.0,recipe.output.1){return false;}
        self.slots=candidate.slots;
        true
    }
    pub fn eat(&mut self,index:usize)->bool{
        if self.dead||self.hunger>=20||self.slot(index).id!=BERRIES{return false;}
        if !self.use_one(index){return false;}
        self.hunger=(self.hunger+5).min(20);true
    }
    pub fn damage(&mut self,amount:i32){
        if self.dead||amount<=0{return;}
        self.health=(self.health-amount).max(0);
        if self.health==0{self.dead=true;}
    }
    pub fn tick(&mut self,dt:f32,moving:bool,sprinting:bool){
        if self.dead{return;}
        let dt=dt.clamp(0.0,0.1);
        self.exhausted+=dt*(if moving {if sprinting {.09}else{.038}}else{.012});
        while self.exhausted>=1.0{
            self.exhausted-=1.0;
            if self.hunger>0{self.hunger-=1;}else{self.damage(1);}
        }
        if self.hunger>=17&&self.health<20{
            self.regen+=dt;
            if self.regen>=3.7{
                self.health=(self.health+1).min(20);
                self.regen=0.0;
                self.exhausted+=.35;
            }
        }else{self.regen=0.0;}
    }
    pub fn respawn(&mut self){
        self.health=20;self.hunger=20;self.dead=false;
        self.exhausted=0.0;self.regen=0.0;
        self.mine_at=None;self.mine_progress=0.0;
    }
    pub fn export(&self)->String{
        let mut s=format!("S1|{}|{}|{}|",self.health,self.hunger,self.exhausted);
        for (i,slot) in self.slots.iter().enumerate() {
            if i>0{s.push(';');}
            s.push_str(&format!("{},{},{}",slot.id,slot.count,slot.wear));
        }
        s
    }
    pub fn import(&mut self,data:&str)->bool{
        if data.len()>5000{return false;}
        let mut p=data.splitn(5,'|');
        if p.next()!=Some("S1"){return false;}
        let Some(h)=p.next().and_then(|s|s.parse::<i32>().ok())else{return false;};
        let Some(n)=p.next().and_then(|s|s.parse::<i32>().ok())else{return false;};
        let Some(e)=p.next().and_then(|s|s.parse::<f32>().ok())else{return false;};
        if !(0..=20).contains(&h)||!(0..=20).contains(&n)||!e.is_finite()||!(0.0..=1.5).contains(&e){return false;}
        let Some(items)=p.next()else{return false;};
        let rows:Vec<_>=items.split(';').collect();
        if rows.len()!=SLOT_COUNT{return false;}
        let mut temp=[Stack::default();SLOT_COUNT];
        for (i,line) in rows.iter().enumerate(){
            let mut parts=line.split(',');
            let Some(id)=parts.next().and_then(|s|s.parse::<u8>().ok())else{return false;};
            let Some(count)=parts.next().and_then(|s|s.parse::<u8>().ok())else{return false;};
            let Some(wear)=parts.next().and_then(|s|s.parse::<u16>().ok())else{return false;};
            if parts.next().is_some(){return false;}
            if id==0 {
                if count!=0||wear!=0{return false;}
            }else if !valid_item(id)||count==0||count>max_stack(id)||wear>=max_wear(id).max(1){return false;}
            temp[i]=Stack{id,count,wear};
        }
        self.slots=temp;self.health=h;self.hunger=n;self.exhausted=e;
        self.dead=h==0;self.mine_at=None;self.mine_progress=0.0;
        true
    }
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test] fn stacks_and_transfer_keep_counts(){
        let mut s=Survival::default();assert!(s.add(5,64));assert!(s.add(5,15));
        assert_eq!(s.count(5),79);
        assert!(s.transfer(0,36,true));
        assert_eq!(s.slot(36).count,32);
        assert!(s.transfer(36,2,false));
        assert_eq!(s.count(5),47);
    }
    #[test] fn recipes_are_atomic_and_require_workbench(){
        let mut s=Survival::default();
        assert!(s.add(5,2));assert!(s.craft(0,false));
        assert!(s.craft(0,false));assert!(s.craft(1,false));
        assert!(!s.craft(3,false));
        assert!(s.craft(3,true));
        assert_eq!(s.count(WOOD_PICK),1);
        assert_eq!(s.count(11),3);
    }
    #[test] fn damage_health_and_import_are_safe(){
        let mut s=Survival::default();s.damage(100);
        assert!(s.dead);s.respawn();assert_eq!(s.health,20);
        assert!(s.add(BERRIES,6));s.hunger=10;assert!(s.eat(0));
        let data=s.export();let mut b=Survival::default();assert!(b.import(&data));
        assert_eq!(b.hunger,15);assert_eq!(b.count(BERRIES),5);
        assert!(!b.import("S1|999|20|0|invalid"));
    }
    #[test] fn mining_speed_depends_on_tools(){
        assert!(mine_seconds(3,41)<mine_seconds(3,0));
        assert!(mine_seconds(3,42)<mine_seconds(3,41));
        assert_eq!(drop_for(3,1,1,1,1,0),0);
        assert_eq!(drop_for(3,1,1,1,1,41),25);
    }
}
