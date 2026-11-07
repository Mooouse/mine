/* MINE Survival — UI adapter only. All game rules are validated by Rust/WASM.
   Browser code never creates items, applies damage, or crafts without Rust approval. */
export const SURVIVAL_ITEMS={
  33:{name:"WORKBENCH",hex:"#997352",symbol:"▤"},
  40:{name:"STICKS",hex:"#b69d68",symbol:"⚒"},
  41:{name:"WOOD PICK",hex:"#b89562",symbol:"⛏"},
  42:{name:"STONE PICK",hex:"#aeb1a6",symbol:"⛏"},
  43:{name:"WOOD AXE",hex:"#b89562",symbol:"🪓"},
  44:{name:"STONE AXE",hex:"#aeb1a6",symbol:"🪓"},
  45:{name:"WOOD SHOVEL",hex:"#b89562",symbol:"♠"},
  46:{name:"STONE SHOVEL",hex:"#aeb1a6",symbol:"♠"},
  47:{name:"FOREST BERRIES",hex:"#e3827e",symbol:"●"}
};
const RECIPES=[
  {name:"Wooden Planks",out:11,count:4,need:[[5,1]],table:false},
  {name:"Sticks",out:40,count:4,need:[[11,2]],table:false},
  {name:"Workbench",out:33,count:1,need:[[11,4]],table:false},
  {name:"Wooden Pick",out:41,count:1,need:[[11,3],[40,2]],table:true},
  {name:"Stone Pick",out:42,count:1,need:[[25,3],[40,2]],table:true},
  {name:"Wooden Axe",out:43,count:1,need:[[11,3],[40,2]],table:true},
  {name:"Stone Axe",out:44,count:1,need:[[25,3],[40,2]],table:true},
  {name:"Wooden Shovel",out:45,count:1,need:[[11,1],[40,2]],table:true},
  {name:"Stone Shovel",out:46,count:1,need:[[25,1],[40,2]],table:true}
];
const $=id=>document.getElementById(id);
const tool=id=>id>=41&&id<=46;
const maxWear=id=>[41,43,45].includes(id)?60:tool(id)?132:0;
export class SurvivalUI {
  constructor(api){
    this.api=api;
    this.lastStatus="";
    $("survivalRespawn").addEventListener("click",()=>{
      this.api.game().survival_respawn();
      $("survivalDeath").classList.add("hidden");
      this.api.respawn();
      this.refreshHUD();
    });
    $("survivalDeathMenu").addEventListener("click",()=>{
      // Restore a valid spawn state before saving and returning to the title.
      this.api.game().survival_respawn();
      $("survivalDeath").classList.add("hidden");
      this.api.returnMenu();
    });
  }
  itemName(id){
    return this.api.blocks[id]?.name||SURVIVAL_ITEMS[id]?.name||"ITEM";
  }
  icon(id){
    if(!id)return "";
    if(id<40)return this.api.blockIcon(id);
    const t=SURVIVAL_ITEMS[id];
    if(!t)return "";
    return '<span class="tool-symbol" style="color:'+t.hex+'">'+t.symbol+'</span>';
  }
  slots(){
    const values=this.api.game()?.survival_items()||[];
    return Array.from({length:37},(_,i)=>({
      id:values[i*3]||0,count:values[i*3+1]||0,wear:values[i*3+2]||0
    }));
  }
  stackCount(s){
    return s.count>1?'<span class="stack-count">'+s.count+'</span>':"";
  }
  durability(s){
    if(!tool(s.id))return "";
    const mx=maxWear(s.id);
    return '<span class="durability"><span class="durability-fill" style="width:'+
      (100*(mx-s.wear)/mx).toFixed(2)+'%"></span></span>';
  }
  itemButton(i,slot,selected=false){
    const button=document.createElement("button");
    button.className="inv-slot"+(!slot.id?" empty":"")+(selected?" active":"");
    button.dataset.index=String(i);
    button.title=slot.id?this.itemName(slot.id)+" ×"+slot.count:"Empty slot";
    button.setAttribute("aria-label",slot.id?this.itemName(slot.id)+" "+slot.count:"Empty slot");
    button.innerHTML=this.icon(slot.id)+this.stackCount(slot)+this.durability(slot)+
      (i<9?'<span class="small-num">'+(i+1)+'</span>':"");
    return button;
  }
  renderHotbar(){
    const bar=$("hotbar");bar.replaceChildren();
    $("offhandHud").classList.add("hidden");
    for(const [i,slot] of this.slots().slice(0,9).entries()){
      const button=document.createElement("button");
      const active=i===this.api.selected();
      button.className="slot"+(active?" selected":"");
      button.title=slot.id?this.itemName(slot.id)+" ×"+slot.count:"Empty slot";
      button.setAttribute("aria-label",button.title);
      button.innerHTML='<span class="num">'+(i+1)+'</span>'+this.icon(slot.id)+
        this.stackCount(slot)+this.durability(slot)+
        '<span class="name">'+(slot.id?this.itemName(slot.id):"")+'</span>';
      button.addEventListener("click",()=>this.api.select(i));
      bar.appendChild(button);
    }
  }
  inventoryClick(index,event){
    const g=this.api.game();
    const from=g.survival_items();
    if(event.shiftKey&&index!==36) {
      const range=index<9?[...Array(27)].map((_,i)=>i+9):[...Array(9)].map((_,i)=>i);
      // Prefer combining partial stacks, then empty slots.
      const id=from[index*3],targets=range.filter(i=>from[i*3]===id&&id!==0)
        .concat(range.filter(i=>from[i*3]===0));
      for(const dest of targets)if(g.survival_transfer(index,dest,false))break;
    }else if(index===36){
      // Click the cursor: try to put all the held items away safely.
      g.survival_close_inventory();
    }else{
      const cursorId=from[36*3],slotId=from[index*3];
      const half=event.button===2;
      if(half&&cursorId===0)g.survival_transfer(index,36,true);
      else if(half&&cursorId!==0)g.survival_transfer(36,index,true);
      else if(cursorId!==0)g.survival_transfer(36,index,false);
      else if(slotId!==0)g.survival_transfer(index,36,false);
    }
    this.renderInventory();this.renderHotbar();
  }
  renderInventory(){
    const storage=$("storageSlots"),bar=$("inventoryHotbar"),off=$("inventoryOffhand");
    const catalog=$("creativeBlocks");catalog.replaceChildren();
    storage.replaceChildren();bar.replaceChildren();off.replaceChildren();
    $("inventoryKicker").textContent="SURVIVAL WORLD";
    $("inventoryTitle").textContent="Inventory & Crafting";
    $("inventory").classList.add("survival-inventory");
    $("survivalCraft").classList.remove("hidden");
    const slots=this.slots();
    const add=(container,index)=>{
      const btn=this.itemButton(index,slots[index],index===this.api.selected());
      btn.addEventListener("click",e=>this.inventoryClick(index,e));
      btn.addEventListener("contextmenu",e=>{e.preventDefault();this.inventoryClick(index,e);});
      container.appendChild(btn);
    };
    for(let i=9;i<36;i++)add(storage,i);
    for(let i=0;i<9;i++)add(bar,i);
    // Cursor item follows the mouse via the existing overlay.
    const cur=$("cursorItem"),cursor=slots[36];
    cur.innerHTML=this.icon(cursor.id)+this.stackCount(cursor);
    cur.classList.toggle("hidden",!cursor.id);
    const counts={};
    for(const slot of slots.slice(0,36))counts[slot.id]=(counts[slot.id]||0)+slot.count;
    const bench=!!this.api.game().survival_has_workbench();
    $("survivalBenchHint").textContent=bench?
      "WORKBENCH NEARBY — ADVANCED RECIPES UNLOCKED":
      "PORTABLE CRAFTING — PLACE A WORKBENCH FOR TOOLS";
    const list=$("survivalRecipeList");list.replaceChildren();
    for(let i=0;i<RECIPES.length;i++){
      const recipe=RECIPES[i];
      const owned=recipe.need.every(([id,n])=>(counts[id]||0)>=n);
      const button=document.createElement("button");
      button.className="survival-recipe";
      button.disabled=!owned||(recipe.table&&!bench);
      button.setAttribute("aria-label","Craft "+recipe.name);
      button.innerHTML=this.icon(recipe.out)+
        '<span class="recipe-info"><strong>'+recipe.name+'</strong><small>'+
        recipe.need.map(([id,n])=>n+' × '+this.itemName(id)).join(' · ')+
        (recipe.table?' · WORKBENCH':'')+'</small></span>'+
        '<span class="recipe-output">×'+recipe.count+'</span>';
      button.addEventListener("click",()=>{
        if(!this.api.game().survival_craft(i)){
          this.api.toast("NOT ENOUGH MATERIALS OR INVENTORY SPACE");
          return;
        }
        this.api.sound(true);
        this.renderInventory();this.renderHotbar();this.api.toast("CRAFTED "+recipe.name.toUpperCase());
      });
      list.appendChild(button);
    }
    const footer=$("inventory").querySelector(".inv-bottom span:first-child");
    if(footer)footer.textContent="SURVIVAL · EARN EVERY RESOURCE";
  }
  leaveInventory(){
    this.api.game()?.survival_close_inventory();
    $("cursorItem").classList.add("hidden");
  }
  leaveSurvival(){
    $("inventory").classList.remove("survival-inventory");
    $("survivalCraft").classList.add("hidden");
    $("survivalVitals").classList.add("hidden");
    $("miningProgress").classList.add("hidden");
    $("survivalDeath").classList.add("hidden");
    $("offhandHud").classList.remove("hidden");
    $("inventoryKicker").textContent="CREATIVE WORLD";
    $("inventoryTitle").textContent="Inventory";
    const footer=$("inventory").querySelector(".inv-bottom span:first-child");
    if(footer)footer.textContent="CREATIVE · UNLIMITED MATERIALS";
    this.lastStatus="";
  }
  enterSurvival(){
    $("survivalVitals").classList.remove("hidden");
    this.renderHotbar();this.refreshHUD();
  }
  refreshHUD(){
    const status=this.api.game().survival_status();
    const health=status[0]??20,hunger=status[1]??20;
    const state=health+","+hunger;
    if(this.lastStatus!==state){
      const hearts=$("survivalHearts"),food=$("survivalHunger");
      hearts.innerHTML=[...Array(10)].map((_,i)=>i*2<health?"♥":'<span class="vital-empty">♥</span>').join("");
      food.innerHTML=[...Array(10)].map((_,i)=>i*2<hunger?"◆":'<span class="vital-empty">◆</span>').join("");
      hearts.setAttribute("aria-label","Health "+health+" of 20");
      food.setAttribute("aria-label","Hunger "+hunger+" of 20");
      this.lastStatus=state;
    }
    if(status[2]&&!this.api.isDead()&&this.api.isPlaying()){
      $("survivalDeath").classList.remove("hidden");
      this.api.die();
    }
  }
  mine(target,dt){
    const prog=$("miningProgress");
    if(target.length!==7){
      this.api.game().survival_reset_mining();
      prog.classList.add("hidden");return;
    }
    const [x,y,z,,,,id]=target;
    const p=this.api.game().survival_mine(x,y,z,this.api.selected(),dt);
    if(p<0){
      prog.classList.add("hidden");return;
    }
    if(p===101){
      prog.classList.add("hidden");
      this.api.invalidate(x,z);
      this.api.debris(id);
      this.api.sound(false);
      this.renderHotbar();
      return;
    }
    prog.classList.remove("hidden");
    $("miningProgressBar").style.width=Math.max(2,p)+"%";
  }
  cancelMining(){
    this.api.game()?.survival_reset_mining();
    $("miningProgress").classList.add("hidden");
  }
  place(target){
    const g=this.api.game();
    const s=this.slots()[this.api.selected()];
    if(s.id===47){
      if(g.survival_eat(this.api.selected())){
        this.api.toast("ATE FOREST BERRIES");
        this.renderHotbar();this.refreshHUD();
      }else this.api.toast("NOT HUNGRY");
      return;
    }
    if(target.length!==7)return;
    const [x,y,z,tx,ty,tz,id]=target;
    if(id===33){
      this.api.openInventory();
      return;
    }
    if(!g.survival_place(tx,ty,tz,this.api.selected()))return;
    this.api.invalidate(tx,tz);
    this.api.sound(true);
    this.renderHotbar();
  }
}
