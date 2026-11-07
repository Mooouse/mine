//! Positional crafting, independent of the browser. No JS-provided recipes or outputs.
//! Recipe shapes are normalized, never rotated: the horizontal/mirrored axe is intentional.
use crate::survival::{Stack, STICK,WOOD_PICK,STONE_PICK,WOOD_AXE,STONE_AXE,WOOD_SHOVEL,STONE_SHOVEL,WORKBENCH};

pub const SIZE:usize=9;

/// Index is the existing recipe book order.
pub fn match_grid(grid:&[Stack;SIZE],bench:bool)->Option<(usize,u8,u8)>{
    let occupied:Vec<(usize,usize,u8)>=grid.iter().enumerate()
        .filter(|(_,s)|s.id!=0&&s.count>0)
        .map(|(i,s)|(i/3,i%3,s.id)).collect();
    if occupied.is_empty(){return None;}
    if !bench && occupied.iter().any(|&(r,c,_)|r>=2||c>=2){return None;}
    let min_r=occupied.iter().map(|v|v.0).min().unwrap();
    let min_c=occupied.iter().map(|v|v.1).min().unwrap();
    let cells:Vec<(usize,usize,u8)>=occupied.iter()
        .map(|&(r,c,id)|(r-min_r,c-min_c,id)).collect();

    let same=|pattern:&[(usize,usize,u8)]| -> bool{
        cells.len()==pattern.len() && cells.iter().all(|cell|pattern.contains(cell))
    };
    if same(&[(0,0,5)]) {return Some((0,11,4));}
    if same(&[(0,0,11),(1,0,11)]){return Some((1,STICK,4));}
    if same(&[(0,0,11),(0,1,11),(1,0,11),(1,1,11)]){return Some((2,WORKBENCH,1));}
    if !bench{return None;}

    for (raw,kind,pick,axe,shovel) in [
        (11,0,WOOD_PICK,WOOD_AXE,WOOD_SHOVEL),
        (25,1,STONE_PICK,STONE_AXE,STONE_SHOVEL)
    ] {
        if same(&[
            (0,0,raw),(0,1,raw),(0,2,raw),
            (1,1,STICK),(2,1,STICK)
        ]) {return Some((if kind==0{3}else{4},pick,1));}
        if same(&[
            (0,0,raw),(0,1,raw),(1,0,raw),
            (1,1,STICK),(2,1,STICK)
        ]) || same(&[
            (0,0,raw),(0,1,raw),(1,1,raw),
            (1,0,STICK),(2,0,STICK)
        ]) {return Some((if kind==0{5}else{6},axe,1));}
        if same(&[
            (0,0,raw),(1,0,STICK),(2,0,STICK)
        ]) {return Some((if kind==0{7}else{8},shovel,1));}
    }
    None
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test] fn shaped_recipes_validate_positions(){
        let mut grid=[Stack::default();SIZE];
        grid[0]=Stack::new(11,5);
        grid[3]=Stack::new(11,1);
        assert_eq!(match_grid(&grid,false),Some((1,STICK,4)));
        grid[3]=Stack::default();grid[1]=Stack::new(11,1);
        assert_eq!(match_grid(&grid,false),None); // no shapeless short circuit
        grid=[Stack::default();SIZE];
        for i in 0..3{grid[i]=Stack::new(11,1);}
        grid[4]=Stack::new(STICK,1);grid[7]=Stack::new(STICK,1);
        assert_eq!(match_grid(&grid,false),None);
        assert_eq!(match_grid(&grid,true),Some((3,WOOD_PICK,1)));
        grid[8]=Stack::new(11,1);
        assert_eq!(match_grid(&grid,true),None);
    }
    #[test] fn sliding_and_mirrored_axe_are_supported(){
        let mut grid=[Stack::default();SIZE];
        grid[1]=Stack::new(5,2);
        assert_eq!(match_grid(&grid,false),Some((0,11,4)));
        grid=[Stack::default();SIZE];
        for i in [0,1,4] {grid[i]=Stack::new(25,1);}
        for i in [3,6]{grid[i]=Stack::new(STICK,1);}
        assert_eq!(match_grid(&grid,true),Some((6,STONE_AXE,1)));
    }
}
