/* MINE Arcade — five original voxel arena challenges against local NPC bots.
 * No networking or misleading human-player indicators. Free-roam saves remain isolated.
 */
export const MODES = Object.freeze([
  {id:"spleef",name:"SPLEEF",symbol:"❄",tag:"BREAK THE FLOOR",description:"Break the snow beneath rivals. Be the last one standing.",bots:4,time:95,accent:"#c6e9ef"},
  {id:"tntrun",name:"TNT RUN",symbol:"⚡",tag:"KEEP MOVING",description:"Every block you run over disappears. Don't look down.",bots:4,time:100,accent:"#f7a46c"},
  {id:"parkour",name:"PARKOUR RACE",symbol:"◈",tag:"REACH THE FINISH",description:"Jump between floating islands. Race four computer rivals.",bots:4,time:115,accent:"#c3e89d"},
  {id:"blockparty",name:"BLOCK PARTY",symbol:"▦",tag:"FIND THE COLOR",description:"Stand on the announced color before the other tiles vanish.",bots:4,time:105,accent:"#e9b6ee"},
  {id:"sumo",name:"SUMO",symbol:"✦",tag:"KNOCK THEM OUT",description:"Punch rivals off the platform. Don't get pushed over the edge.",bots:4,time:95,accent:"#f4d58f"}
]);
// Terrain reaches at most y=55. Floating arenas stay above the tallest hills.
const FLOOR=58, TOP=FLOOR+1, CENTER=8.5;
const GRID_MIN=1,GRID_MAX=16;
const NAMES=["NOVA","KUBO","MOSS","BYTE"];
const COLORS=[{name:"RED",block:9,hex:"#da7160"},{name:"GREEN",block:6,hex:"#85b96e"},{name:"YELLOW",block:4,hex:"#efcd80"},{name:"DARK",block:12,hex:"#53627e"}];
const dist=(a,b,c,d)=>Math.hypot(a-c,b-d);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rand=(n)=>{const v=Math.sin(n*127.1+19.31)*43758.545;return v-Math.floor(v);};
const tileKey=(x,z)=>x+","+z;

export class MiniGames{
  constructor(api){
    this.api=api;this.active=false;this.ended=false;
    this.mode=null;this.elapsed=0;this.remaining=0;
    this.round=0;this.phase="";this.phaseTimer=0;
    this.bots=[];this.dirty=new Set();this.fuses=new Map();
    this.tiles=new Map();this.pads=[];this.checkpoint=0;
    this.stats=this.readStats();
    const $=id=>document.getElementById(id);
    this.$=$;
    $("miniGamesButton").addEventListener("click",()=>this.openLobby());
    $("miniClose").addEventListener("click",()=>this.closeLobby());
    $("miniLobby").addEventListener("click",e=>{if(e.target===$("miniLobby"))this.closeLobby();});
    $("miniCards").addEventListener("click",e=>{
      const card=e.target.closest("[data-minigame]");
      if(card)this.start(card.dataset.minigame);
    });
    $("miniReplay").addEventListener("click",()=>this.start(this.mode.id));
    $("miniChoose").addEventListener("click",()=>this.leave(true));
    $("miniReturn").addEventListener("click",()=>this.leave(false));
    $("miniScoreBack").addEventListener("click",()=>this.leave(true));
    $("miniHelpButton").addEventListener("click",()=>this.showRules());
    this.fillCards();
  }
  readStats(){
    try {return JSON.parse(localStorage.getItem("mine_arcade_stats_v1"))||{};}
    catch(e){return {};}
  }
  saveStats(){
    try{localStorage.setItem("mine_arcade_stats_v1",JSON.stringify(this.stats));}catch(e){}
  }
  fillCards(){
    const grid=this.$("miniCards");
    grid.replaceChildren();
    for(const m of MODES){
      const item=document.createElement("button");
      const score=this.stats[m.id]||{played:0,wins:0};
      item.className="mini-card";item.dataset.minigame=m.id;
      item.style.setProperty("--mini-accent",m.accent);
      item.innerHTML='<span class="mini-card-icon">'+m.symbol+'</span>'+
        '<span class="mini-card-body"><strong>'+m.name+'</strong><em>'+m.tag+'</em><small>'+m.description+'</small>'+
        '<span class="mini-card-meta">YOU + '+m.bots+' BOTS · '+score.wins+' WINS / '+score.played+' MATCHES</span></span>'+
        '<span class="mini-card-arrow">↗</span>';
      grid.appendChild(item);
    }
  }
  openLobby(){
    if(this.active)return;
    this.fillCards();
    this.$("miniLobby").classList.remove("hidden");
  }
  closeLobby(){this.$("miniLobby").classList.add("hidden");}
  showRules(){
    if(!this.mode)return;
    this.api.toast(this.mode.description+" — "+this.mode.time+"s. Bots are computer-controlled.");
  }
  resetScore(){
    this.elapsed=0;this.remaining=this.mode.time;
    this.round=1;this.phase="ready";this.phaseTimer=3.1;
    this.ended=false;this.dirty.clear();this.fuses.clear();
    this.tiles.clear();this.pads=[];this.checkpoint=0;
    this.safe=COLORS[0];this.lastMessage="";
    this.playerAlive=true;
    this.attackCooldown=0;this.lastBotAttack=0;
  }
  start(id){
    const mode=MODES.find(m=>m.id===id);
    if(!mode)return;
    if(this.active) {this.active=false;this.api.stopRound();}
    this.closeLobby();
    this.mode=mode;
    this.resetScore();
    // Save the sandbox before creating an isolated temporary game instance.
    this.api.enterArena(mode.id);
    this.active=true;
    const g=this.api.game();
    g.set_flying(false);
    g.set_time(325); // afternoon and clear daylight for fair arena visibility
    this.createArena();
    this.bots=Array.from({length:mode.bots},(_,i)=>this.makeBot(i));
    const spawn=this.getSpawn();
    g.teleport(spawn[0],spawn[1],spawn[2]);
    this.api.syncPlayer();
    this.api.startRound();
    this.$("miniResult").classList.add("hidden");
    this.$("miniHud").classList.remove("hidden");
    this.$("hud").classList.add("minigame-active");
    this.$("touch-inventory").setAttribute("aria-label","Round rules");
    this.$("touch-inventory").querySelector("small").textContent="RULES";
    this.$("touch-break").querySelector("small").textContent=id==="sumo"?"PUNCH":id==="spleef"?"DIG":"ACTION";
    this.refreshUI();
  }
  getSpawn(){
    if(this.mode.id==="parkour"){
      const p=this.pads[0];return [p.x,p.y+1.06,p.z];
    }
    return [CENTER,TOP+.06,CENTER];
  }
  makeBot(i){
    const angle=i*2*Math.PI/4+Math.PI/4;
    const m=this.mode.id;
    const radius=m==="parkour"?0:m==="sumo"?5.2:3.4;
    const spawn=m==="parkour"?this.pads[0]:null;
    return {
      id:i,name:NAMES[i],color:[9,6,12,29][i],
      x:spawn?spawn.x:CENTER+Math.cos(angle)*radius,
      z:spawn?spawn.z:CENTER+Math.sin(angle)*radius,
      y:spawn?spawn.y+1:TOP+.02,
      targetX:CENTER,targetZ:CENTER,heading:angle,
      speed:2.15+rand(i+7)*1.2,
      progress:0,alive:true,aiTimer:.25+i*.16,
      cooldown:1.0+i*.25,skill:rand(i+31),
      knocked:0,step:0
    };
  }
  set(x,y,z,id){
    const ax=Math.floor(x),az=Math.floor(z),ay=Math.floor(y);
    if(!this.api.game().set_block(ax,ay,az,id))return;
    const cx=Math.floor(ax/16),cz=Math.floor(az/16);
    this.dirty.add(tileKey(cx,cz));
    if(ax%16===0)this.dirty.add(tileKey(cx-1,cz));
    if(ax%16===15)this.dirty.add(tileKey(cx+1,cz));
    if(az%16===0)this.dirty.add(tileKey(cx,cz-1));
    if(az%16===15)this.dirty.add(tileKey(cx,cz+1));
  }
  flushDirty(){
    if(!this.dirty.size)return;
    const list=[...this.dirty].slice(0,5);
    for(const key of list){this.dirty.delete(key);this.api.rebuildArenaChunk(...key.split(",").map(Number));}
  }
  arenaDeco(){
    // Decorative isolated corner pylons emphasize a distinct minigame arena.
    for(const [x,z] of [[-1,-1],[-1,18],[18,-1],[18,18]]){
      for(let y=FLOOR-3;y<=FLOOR+2;y++)this.set(x,y,z,y===FLOOR+2?13:12);
    }
    for(let x=-1;x<=18;x++){
      this.set(x,FLOOR-3,-1,12);
      this.set(x,FLOOR-3,18,12);
    }
    for(let z=-1;z<=18;z++){
      this.set(-1,FLOOR-3,z,12);
      this.set(18,FLOOR-3,z,12);
    }
  }
  createArena(){
    const g=this.api.game();
    this.arenaDeco();
    if(this.mode.id==="parkour"){
      this.pads=[];
      for(let i=0;i<15;i++){
        const x=3+i*3.2;
        const z=8.5+(i===0?0:Math.sin(i*1.17)*1.75);
        // A player jump only reaches ~1.5 blocks high; never require +2.
        const y=FLOOR+(i%4===2?0:1);
        this.pads.push({x,z,y,checkpoint:i%4===0});
        for(let dx=-1;dx<=1;dx++)
          for(let dz=-1;dz<=1;dz++)
            this.set(Math.floor(x)+dx,y,Math.floor(z)+dz,i===14?13:(i%4===0?27:11));
        if(i%4===0){
          this.set(Math.floor(x),y-1,Math.floor(z),13);
        }
      }
      // Finishing marker at the far edge.
      const p=this.pads[this.pads.length-1];
      for(let h=1;h<=3;h++){
        this.set(Math.floor(p.x)-1,p.y+h,Math.floor(p.z)-2,12);
        this.set(Math.floor(p.x)+1,p.y+h,Math.floor(p.z)-2,12);
      }
      this.set(Math.floor(p.x),p.y+3,Math.floor(p.z)-2,13);
      return;
    }
    for(let x=GRID_MIN;x<=GRID_MAX;x++){
      for(let z=GRID_MIN;z<=GRID_MAX;z++){
        if(this.mode.id==="sumo"&&dist(x+.5,z+.5,CENTER,CENTER)>7.35)continue;
        const material=this.mode.id==="spleef"?7:this.mode.id==="tntrun"?31:
          this.mode.id==="sumo"?((x+z)%8===0?25:3):
          COLORS[(x+z*3+Math.floor(x*z/4))%COLORS.length].block;
        this.tiles.set(tileKey(x,z),material);
        this.set(x,FLOOR,z,material);
      }
    }
    if(this.mode.id==="blockparty"){
      this.safe=COLORS[0];
      // Preserve the shared three-second round countdown.
    }
  }
  paintParty(){
    const old=this.tiles;
    this.tiles=new Map();
    for(let x=GRID_MIN;x<=GRID_MAX;x++)for(let z=GRID_MIN;z<=GRID_MAX;z++){
      const material=COLORS[(x*2+z*3+this.round+Math.floor((x*z)/5))%4].block;
      this.tiles.set(tileKey(x,z),material);
      if(old.get(tileKey(x,z))!==material||this.api.game().block(x,FLOOR,z)!==material)
        this.set(x,FLOOR,z,material);
    }
  }
  floorAt(x,z){
    const tx=Math.floor(x),tz=Math.floor(z);
    return this.api.game().block(tx,FLOOR,tz);
  }
  inBounds(x,z){
    return x>GRID_MIN+.4&&x<GRID_MAX+.6&&z>GRID_MIN+.4&&z<GRID_MAX+.6;
  }
  randomTarget(bot){
    let best=null;
    for(let a=0;a<16;a++){
      const nx=2+rand((bot.id+1)*311+this.elapsed*41+a*17)*14;
      const nz=2+rand((bot.id+2)*717+this.elapsed*27+a*31)*14;
      if(this.mode.id==="sumo"&&dist(nx,nz,CENTER,CENTER)>6.5)continue;
      if(this.floorAt(nx,nz)===0)continue;
      best=[nx,nz];break;
    }
    bot.targetX=best?best[0]:CENTER;
    bot.targetZ=best?best[1]:CENTER;
    bot.aiTimer=1.1+bot.skill*.6;
  }
  chase(bot,x,z,dt,mult=1){
    const dx=x-bot.x,dz=z-bot.z,l=Math.hypot(dx,dz);
    if(l<.06)return;
    const step=Math.min(l,bot.speed*dt*mult);
    const nx=bot.x+dx/l*step,nz=bot.z+dz/l*step;
    bot.heading=Math.atan2(dx,-dz);
    // NPCs react to holes rather than immediately running into every gap.
    const floor=this.floorAt(nx,nz);
    if(this.mode.id==="spleef"&&floor===0&&this.floorAt(bot.x,bot.z)!==0){
      this.randomTarget(bot);return;
    }
    bot.x=nx;bot.z=nz;
    bot.step+=step*6;
  }
  updateBot(bot,dt){
    if(!bot.alive)return;
    bot.cooldown-=dt;
    bot.aiTimer-=dt;
    const m=this.mode.id;
    if(m==="parkour"){
      const progress=bot.progress;
      const i=Math.floor(progress), t=progress-i;
      if(i>=this.pads.length-1)return;
      const a=this.pads[i],b=this.pads[i+1];
      bot.progress=Math.min(this.pads.length-1,progress+dt*(.24+bot.skill*.095));
      const now=Math.floor(bot.progress), p=bot.progress-now;
      const from=this.pads[Math.min(now,this.pads.length-1)];
      const to=this.pads[Math.min(now+1,this.pads.length-1)];
      bot.x=from.x+(to.x-from.x)*p;
      bot.z=from.z+(to.z-from.z)*p;
      bot.y=from.y+1+(to.y-from.y)*p+Math.sin(Math.PI*p)*1.3;
      bot.heading=Math.atan2(to.x-from.x,-(to.z-from.z));
      bot.step+=dt*9;
      if(bot.progress>=this.pads.length-1){
        this.end(false,bot.name+" crossed the finish line first.");
      }
      return;
    }
    if(m==="sumo"){
      if(bot.knocked>0){
        bot.knocked-=dt;
      }else{
        const p=this.api.player();
        const dx=p[0]-bot.x,dz=p[2]-bot.z,range=Math.hypot(dx,dz);
        if(range<7.3)this.chase(bot,p[0],p[2],dt,.82);
        else this.chase(bot,CENTER,CENTER,dt,.75);
        if(range<1.45&&bot.cooldown<=0){
          bot.cooldown=1.1+bot.skill*.35;
          const angle=Math.atan2(p[2]-bot.z,p[0]-bot.x);
          this.api.knockPlayer(Math.cos(angle)*1.02,Math.sin(angle)*1.02);
          this.api.toast(bot.name+" pushed you!");
        }
      }
      if(dist(bot.x,bot.z,CENTER,CENTER)>7.65)this.knockOut(bot);
      return;
    }
    if(m==="blockparty"){
      if(this.phase==="choose"){
        const safe=this.safe.block;
        if(bot.aiTimer<=0||this.floorAt(bot.targetX,bot.targetZ)!==safe){
          let best=null,bestD=Infinity;
          for(let x=2;x<=15;x++)for(let z=2;z<=15;z++){
            if(this.tiles.get(tileKey(x,z))!==safe)continue;
            const d=dist(bot.x,bot.z,x+.5,z+.5);
            if(d<bestD){bestD=d;best=[x+.5,z+.5];}
          }
          if(best){bot.targetX=best[0];bot.targetZ=best[1];}
          bot.aiTimer=3;
        }
        if(bot.targetX)this.chase(bot,bot.targetX,bot.targetZ,dt,.98);
      }
    }else if(m==="spleef"||m==="tntrun"){
      if(bot.aiTimer<=0||dist(bot.x,bot.z,bot.targetX,bot.targetZ)<.75)this.randomTarget(bot);
      this.chase(bot,bot.targetX,bot.targetZ,dt,m==="tntrun"?1.16:.85);
      if(m==="tntrun")this.triggerFuse(bot.x,bot.z);
      if(m==="spleef"&&bot.cooldown<=0){
        bot.cooldown=.9+bot.skill*.55;
        const p=this.api.player();
        // Prefer holes along a rival's path, but sometimes bot targets an empty tile.
        const target=dist(bot.x,bot.z,p[0],p[2])<5?p:
          this.bots.find(v=>v!==bot&&v.alive&&dist(bot.x,bot.z,v.x,v.z)<4);
        if(target){
          const tx=Math.floor(target.x??target[0]),tz=Math.floor(target.z??target[2]);
          if(this.floorAt(tx+.5,tz+.5)===7 && this.inBounds(tx+.5,tz+.5))
            this.removeFloor(tx,tz);
        }
      }
    }
    bot.y=TOP+.035+Math.abs(Math.sin(bot.step))*0.045;
    if(!this.inBounds(bot.x,bot.z) || this.floorAt(bot.x,bot.z)===0)this.knockOut(bot);
  }
  knockOut(bot){
    if(!bot.alive)return;
    bot.alive=false;
    bot.y=FLOOR-6;
    this.api.toast("BOT "+bot.name+" eliminated");
  }
  removeFloor(x,z){
    if(!this.floorAt(x+.5,z+.5))return;
    this.set(x,FLOOR,z,0);
    this.tiles.delete(tileKey(x,z));
  }
  triggerFuse(x,z){
    const tx=Math.floor(x),tz=Math.floor(z);
    if(this.floorAt(x,z)===0)return;
    const key=tileKey(tx,tz);
    if(!this.fuses.has(key))this.fuses.set(key,.6);
  }
  updateFuses(dt){
    for(const [key,left] of [...this.fuses]){
      if(left>dt){this.fuses.set(key,left-dt);continue;}
      this.fuses.delete(key);
      const [x,z]=key.split(",").map(Number);
      this.removeFloor(x,z);
    }
  }
  updateParty(dt){
    this.phaseTimer-=dt;
    if(this.phaseTimer>0)return;
    if(this.phase==="choose"){
      this.phase="drop";this.phaseTimer=2.7;
      for(const [key,id] of [...this.tiles]){
        if(id===this.safe.block)continue;
        const [x,z]=key.split(",").map(Number);
        this.set(x,FLOOR,z,0);
      }
      for(const bot of this.bots){
        if(bot.alive&&this.floorAt(bot.x,bot.z)!==this.safe.block)this.knockOut(bot);
      }
      this.api.toast("DROP! Only "+this.safe.name+" stays.");
    }else{
      if(this.round>=7){
        this.end(true,"You survived all 7 color rounds.");
        return;
      }
      this.round++;
      this.paintParty();
      this.safe=COLORS[(this.round+Math.floor(rand(this.round*17)*7))%4];
      this.phase="choose";this.phaseTimer=7.7;
      this.api.toast("ROUND "+this.round+" — STAND ON "+this.safe.name);
    }
  }
  updateParkourPlayer(){
    const p=this.api.player();
    const target=this.pads[this.pads.length-1];
    if(dist(p[0],p[2],target.x,target.z)<1.3 && p[1]>target.y+.55){
      this.end(true,"You reached the finish line!");
      return;
    }
    for(let i=this.checkpoint+1;i<this.pads.length;i++){
      const pad=this.pads[i];
      if(dist(p[0],p[2],pad.x,pad.z)<1.1 && p[1]>pad.y+.54&&p[1]<pad.y+2.2){
        if(pad.checkpoint) {
          this.checkpoint=i;
          this.api.toast("CHECKPOINT "+(Math.floor(i/4)+1)+" REACHED");
        }
        break;
      }
    }
    if(p[1]<FLOOR-.7 || p[0]<0 || p[0]>51||p[2]<-3||p[2]>22){
      const pad=this.pads[this.checkpoint];
      this.api.game().teleport(pad.x,pad.y+1.08,pad.z);
      this.api.syncPlayer();
      this.api.toast("RESPAWN AT CHECKPOINT");
    }
  }
  tick(dt){
    if(!this.active||this.ended)return;
    dt=clamp(dt,0,.05);
    this.attackCooldown=Math.max(0,this.attackCooldown-dt);
    if(this.phase==="ready"){
      this.phaseTimer-=dt;
      if(this.phaseTimer<=0){
        this.phase=this.mode.id==="blockparty"?"choose":"playing";
        this.phaseTimer=this.mode.id==="blockparty"?7.7:0;
        this.api.toast(this.mode.id==="blockparty"?
          "STAND ON "+this.safe.name:"GO! "+this.mode.tag);
      }
      this.refreshUI();return;
    }
    this.remaining=Math.max(0,this.remaining-dt);
    this.elapsed+=dt;
    const mode=this.mode.id;
    if(mode==="tntrun"){
      const p=this.api.player();
      this.triggerFuse(p[0],p[2]);
      this.updateFuses(dt);
    }
    if(mode==="blockparty")this.updateParty(dt);
    if(this.ended)return;
    for(const bot of this.bots){
      this.updateBot(bot,dt);
      if(this.ended)return;
    }
    if(mode==="parkour")this.updateParkourPlayer();
    else {
      const p=this.api.player();
      if(p[1]<FLOOR-.55 ||
        mode==="sumo"&&dist(p[0],p[2],CENTER,CENTER)>7.76||
        (mode==="spleef"||mode==="tntrun"||mode==="blockparty")&&!this.inBounds(p[0],p[2])){
        this.end(false,"You fell out of the arena.");
        return;
      }
      if(this.bots.every(b=>!b.alive))this.end(true,"All computer opponents were eliminated.");
    }
    if(this.remaining<=0)this.end(mode==="parkour"?false:
      mode==="blockparty"&&this.round>=7,
      "The round timer has expired.");
    this.refreshUI();
  }
  action(place,look){
    if(!this.active||this.ended||this.phase==="ready")return true;
    const mode=this.mode.id;
    if(mode==="spleef"){
      if(place)return true;
      const f=this.api.game().raycast(...[this.api.player()[0],this.api.player()[1]+1.62,this.api.player()[2]],...look,6);
      if(f.length===7&&f[1]===FLOOR&&f[6]===7&&this.inBounds(f[0]+.5,f[2]+.5)){
        this.removeFloor(f[0],f[2]);this.api.sound(false);
      }
      return true;
    }
    if(mode==="sumo"){
      if(this.attackCooldown>0)return true;
      this.attackCooldown=.43;
      const p=this.api.player();
      let victim=null,best=Infinity;
      for(const bot of this.bots){
        if(!bot.alive)continue;
        const dx=bot.x-p[0],dz=bot.z-p[2];
        const along=dx*look[0]+dz*look[2];
        const side=Math.abs(dx*look[2]-dz*look[0]);
        if(along<0||along>3.4||side>.9||along>best)continue;
        best=along;victim=bot;
      }
      if(victim){
        const len=dist(p[0],p[2],victim.x,victim.z)||1;
        victim.x+=(victim.x-p[0])/len*2.0;
        victim.z+=(victim.z-p[2])/len*2.0;
        victim.knocked=.36;
        this.api.sound(false);
        if(dist(victim.x,victim.z,CENTER,CENTER)>7.65)this.knockOut(victim);
      }
      return true;
    }
    return true; // Mini-game arenas do not allow unlimited creative editing.
  }
  refreshUI(){
    if(!this.active)return;
    const alive=this.bots.filter(b=>b.alive).length;
    const t=this.phase==="ready"?Math.ceil(this.phaseTimer):Math.ceil(this.remaining);
    this.$("miniHudTitle").textContent=this.mode.name;
    this.$("miniHudTime").textContent=this.phase==="ready"?"START "+t:
      Math.floor(t/60)+":"+String(t%60).padStart(2,"0");
    this.$("miniHudBots").textContent=alive+" BOTS LEFT";
    this.$("miniHudBadge").textContent="OFFLINE · AI MATCH";
    let note=this.mode.tag;
    if(this.phase==="ready")note="STARTING IN "+Math.ceil(this.phaseTimer);
    else if(this.mode.id==="parkour")note="CHECKPOINT "+(Math.floor(this.checkpoint/4)+1)+"/4 • REACH THE GLOWSTONE";
    else if(this.mode.id==="blockparty")note=(this.phase==="drop"?"FLOOR DROPPED — ":"STAND ON ")+this.safe.name+" • ROUND "+this.round+"/7 • "+Math.ceil(this.phaseTimer)+"s";
    this.$("miniHudGoal").textContent=note;
    this.$("miniHudGoal").style.color=this.mode.id==="blockparty"?this.safe.hex:"";
    for(const bot of this.bots){
      const tag=this.$("miniBotTag"+bot.id);
      if(!tag)continue;
      tag.classList.toggle("hidden",!bot.alive);
      tag.textContent="BOT · "+bot.name;
    }
  }
  end(won,detail){
    if(this.ended)return;
    this.ended=true;
    const score=this.stats[this.mode.id]||{played:0,wins:0};
    score.played++;
    if(won)score.wins++;
    this.stats[this.mode.id]=score;this.saveStats();
    this.$("miniResult").classList.remove("hidden");
    this.$("miniResultTitle").textContent=won?"VICTORY!":"ROUND OVER";
    this.$("miniResultTitle").classList.toggle("victory",won);
    this.$("miniResultDetail").textContent=detail;
    this.$("miniResultMode").textContent=this.mode.name;
    this.$("miniResultTime").textContent=Math.floor(this.elapsed)+"s";
    this.$("miniResultBots").textContent=this.bots.filter(b=>b.alive).length+" remaining";
    this.api.finishRound();
  }
  leave(showLobby=false){
    if(!this.active)return;
    this.active=false;this.ended=false;
    this.$("miniResult").classList.add("hidden");
    this.$("miniHud").classList.add("hidden");
    this.$("hud").classList.remove("minigame-active");
    this.$("touch-inventory").setAttribute("aria-label","Inventory");
    this.$("touch-inventory").querySelector("small").textContent="ITEMS";
    this.$("touch-break").querySelector("small").textContent="BREAK";
    this.api.exitArena();
    if(showLobby)this.openLobby();
  }
  getBots(){return this.active?this.bots.filter(b=>b.alive):[];}
  updateTags(vp,w,h){
    if(!this.active)return;
    const wrap=this.$("miniBotLabels");
    for(const bot of this.bots){
      let tag=this.$("miniBotTag"+bot.id);
      if(!tag){
        tag=document.createElement("span");
        tag.id="miniBotTag"+bot.id;tag.className="mini-bot-label";
        wrap.appendChild(tag);
      }
      if(!bot.alive){tag.classList.add("hidden");continue;}
      const x=bot.x,y=bot.y+2.1,z=bot.z;
      const px=vp[0]*x+vp[4]*y+vp[8]*z+vp[12],
            py=vp[1]*x+vp[5]*y+vp[9]*z+vp[13],
            pz=vp[3]*x+vp[7]*y+vp[11]*z+vp[15];
      if(pz<=.05||Math.abs(px/pz)>1.25||Math.abs(py/pz)>1.3){
        tag.classList.add("hidden");continue;
      }
      tag.textContent="BOT · "+bot.name;
      tag.classList.remove("hidden");
      tag.style.left=((px/pz*.5+.5)*w)+"px";
      tag.style.top=((.5-py/pz*.5)*h)+"px";
    }
  }
}
