import { chromium } from "playwright";

const url = process.env.GAME_URL || "http://127.0.0.1:8765/";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
  args: [
    "--no-sandbox",
    "--enable-webgl",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage"
  ],
});
const page = await browser.newPage({viewport:{width:1280,height:720}});
const errors = [];
page.on("pageerror",e=>errors.push(e.message));
page.on("console",m=>{ if(m.type()==="error")errors.push(m.text()); });

try{
  if(url.includes("raw.githack.com")){
    // This static mirror asks visitors to confirm HTML once per repository.
    // The automated smoke test opts in through the documented cookie.
    await page.context().addCookies([{name:"__Http-phish",value:"1",domain:"raw.githack.com",path:"/",secure:true,httpOnly:true}]);
  }
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});
  try {
    await page.locator("#loading").waitFor({state:"detached",timeout:18000});
  } catch(e) {
    console.error("LOADING STATUS:", await page.locator("#loading-message").textContent());
    console.error("BROWSER ERRORS:", errors.join(" | "));
    throw e;
  }
  if(!await page.locator("#menu").isVisible())throw new Error("Main menu did not appear");
  const dimensions=await page.locator("#game").evaluate(el=>[el.width,el.height]);
  if(dimensions[0]<100||dimensions[1]<100)throw new Error("Game canvas is empty");
  await page.locator("#playButton").click();
  await page.locator("#hud").waitFor({state:"visible"});
  await page.waitForTimeout(350);
  await page.keyboard.press("e");
  await page.locator("#inventory").waitFor({state:"visible",timeout:4000});
  if(await page.locator("#storageSlots .inv-slot").count()!==27)throw new Error("Expected 27 storage slots");
  if(await page.locator("#inventoryHotbar .inv-slot").count()!==9)throw new Error("Expected 9 hotbar slots");
  if(await page.locator("#creativeBlocks .inv-slot").count()!==24)throw new Error("Expected 24 creative materials");
  await page.locator('#creativeBlocks .inv-slot[aria-label="WATER"]').click();
  await page.locator("#inventoryHotbar .inv-slot").nth(2).click();
  const assigned=await page.locator("#inventoryHotbar .inv-slot").nth(2).getAttribute("aria-label");
  if(assigned!=="WATER")throw new Error("Creative inventory transfer did not work");
  await page.keyboard.press("Escape");
  await page.locator("#inventory").waitFor({state:"hidden"});

  // Every minigame must launch the 3D Rust world, spawn real NPC meshes,
  // exit to the mode lobby, and leave the player's sandbox save unchanged.
  await page.locator("#pauseButton").evaluate(el=>el.click());
  await page.locator("#leaveButton").evaluate(el=>el.click());
  await page.locator("#menu").waitFor({state:"visible"});
  const currentSeed=await page.locator("#seedInput").inputValue();
  const sandboxSave=await page.evaluate(seed=>localStorage.getItem("mine_world_"+seed),currentSeed);
  await page.locator("#miniGamesButton").evaluate(el=>el.click());
  await page.locator("#miniLobby").waitFor({state:"visible"});
  for(const id of ["spleef","tntrun","parkour","blockparty","sumo"]){
    await page.locator('[data-minigame="'+id+'"]').evaluate(el=>el.click());
    await page.locator("#miniHud").waitFor({state:"visible",timeout:9000});
    if(!await page.locator("#hud").evaluate(el=>el.classList.contains("minigame-active")))
      throw new Error("Minigame HUD did not activate: "+id);
    await page.waitForTimeout(300);
    if(await page.locator("#miniBotLabels .mini-bot-label").count()!==4)
      throw new Error("Missing 4 pseudo-player bots: "+id);
    if(await page.locator("#miniHudTitle").textContent()!==id.toUpperCase().replace("TNTRUN","TNT RUN").replace("BLOCKPARTY","BLOCK PARTY").replace("PARKOUR","PARKOUR RACE"))
      throw new Error("Wrong minigame title: "+id);
    await page.locator("#miniScoreBack").evaluate(el=>el.click());
    await page.locator("#miniLobby").waitFor({state:"visible",timeout:5000});
    if(await page.locator("#seedInput").inputValue()!==currentSeed)
      throw new Error("Minigame changed the saved sandbox seed: "+id);
    const afterSave=await page.evaluate(seed=>localStorage.getItem("mine_world_"+seed),currentSeed);
    if(afterSave!==sandboxSave)
      throw new Error("Minigame overwrote sandbox world save: "+id);
  }
  await page.locator("#miniClose").evaluate(el=>el.click());
  if(!await page.locator("#menu").isVisible())throw new Error("Main menu did not return after minigames");

  // Switch between modes without changing the original creative world.
  await page.locator('[data-world-mode="survival"]').click();
  await page.locator("#playButton").click();
  await page.locator("#survivalVitals").waitFor({state:"visible",timeout:9000});
  if(!await page.locator("#mode").textContent().then(t=>t.includes("SURVIVAL")))
    throw new Error("World mode selector failed to enter Survival");
  if(await page.locator("#hotbar .slot").count()!==9)throw new Error("Survival hotbar must have 9 slots");
  await page.keyboard.press("e");
  await page.locator("#inventory").waitFor({state:"visible"});
  await page.locator("#survivalCraft").waitFor({state:"visible"});
  if(await page.locator("#survivalRecipeList .survival-recipe").count()!==9)
    throw new Error("Expected 9 Rust-backed recipes");
  if(await page.locator("#craftGrid .inv-slot").count()!==4)
    throw new Error("Portable crafting must display four 2x2 grid cells");
  if(!await page.locator("#craftResult").isDisabled())
    throw new Error("Crafting result should be disabled for an empty grid");
  if(await page.locator("#inventoryHotbar .inv-slot").count()!==9)
    throw new Error("Survival inventory missing hotbar");
  if(await page.locator("#storageSlots .inv-slot").count()!==27)
    throw new Error("Survival inventory missing backpack");
  await page.keyboard.press("Escape");
  await page.locator("#inventory").waitFor({state:"hidden"});
  await page.locator("#pauseButton").evaluate(el=>el.click());
  await page.locator("#leaveButton").evaluate(el=>el.click());
  await page.locator("#menu").waitFor({state:"visible"});
  const creativeAfter=await page.evaluate(seed=>localStorage.getItem("mine_world_"+seed),currentSeed);
  if(creativeAfter!==sandboxSave)throw new Error("Survival mode overwrote creative world");

  // Exercise the exported Rust gameplay rules directly, including crafting,
  // block placement/harvesting, health, persistence and respawn.
  const rules=await page.evaluate(async()=>{
    const {Game}=await import("./pkg/mine_web.js");
    const g=new Game(9941);g.enable_survival();
    const first=g.survival_status();
    if(first[0]!==20||first[1]!==20)throw Error("Fresh survival stats wrong");
    if(!g.survival_add_item(5,3))throw Error("Cannot add testing logs");
    for(let i=0;i<3;i++)if(!g.survival_craft(0))throw Error("Cannot make planks");
    if(!g.survival_craft(1))throw Error("Cannot make sticks");
    if(!g.survival_craft(2))throw Error("Cannot make bench");
    if(g.survival_craft(3))throw Error("Workbench restriction bypassed");
    const pos=g.player(),x=Math.floor(pos[0])+2,y=Math.floor(pos[1]),z=Math.floor(pos[2]);
    g.set_block(x,y,z,0);
    const items=g.survival_items();
    const benchIndex=Array.from({length:9},(_,i)=>i).find(i=>items[i*3]===33);
    if(benchIndex===undefined)throw Error("Workbench not in hotbar");
    if(!g.survival_place(x,y,z,benchIndex))throw Error("Workbench placement failed");
    if(g.block(x,y,z)!==33 || !g.survival_has_workbench())
      throw Error("Placed workbench not registered");
    if(!g.survival_craft(3))throw Error("Cannot craft wood pick near bench");
    const updated=g.survival_items();
    const toolIndex=Array.from({length:9},(_,i)=>i).find(i=>updated[i*3]===41);
    if(toolIndex===undefined)throw Error("Wooden pick not on hotbar");
    const rockX=x+1;
    g.set_block(rockX,y,z,3);
    let result=-1;
    for(let k=0;k<240;k++){
      result=g.survival_mine(rockX,y,z,toolIndex,.05);
      if(result===101)break;
    }
    if(result!==101 || g.block(rockX,y,z)!==0)
      throw Error("Rust timed block mining did not finish");
    const before=g.survival_status()[0];
    g.survival_damage(4);
    if(g.survival_status()[0]!==before-4)throw Error("Health does not change on damage");
    const exported=g.export_survival();
    const copy=new Game(9941);copy.enable_survival();
    if(!copy.import_survival(exported))throw Error("Survival state import failed");
    if(copy.survival_status()[0]!==before-4)throw Error("Health not persisted");
    g.survival_damage(100);
    if(g.survival_status()[2]!==1)throw Error("Death state not set");
    g.survival_respawn();
    if(g.survival_status()[0]!==20||g.survival_status()[2]!==0)throw Error("Respawn failed");
    // Position-based 2x2 crafting, from inventory to grid, then persisted.
    const manual=new Game(9942);manual.enable_survival();
    if(!manual.survival_add_item(11,2))throw Error("Unable to test crafting grid");
    if(!manual.survival_transfer(0,37,true)||
       !manual.survival_transfer(0,40,false))throw Error("Manual ingredient transfer failed");
    const gridResult=manual.survival_grid_result();
    if(gridResult[0]!==40||gridResult[1]!==4)throw Error("2x2 recipe layout not recognized");
    const savedGrid=manual.export_survival();
    if(!savedGrid.startsWith("S2|"))throw Error("Crafting grid save format is not S2");
    const restored=new Game(9942);restored.enable_survival();
    if(!restored.import_survival(savedGrid))throw Error("Cannot restore crafted items to 2x2 grid");
    if(restored.survival_grid_result()[0]!==40||!restored.survival_grid_craft())
      throw Error("Manual crafting failed after save/reload");
    if(restored.survival_items()[1]!==4)throw Error("Manual crafted output not collected");
    if(!g.export_save().startsWith("M2|"))throw Error("New world generator not versioned");
    const legacy=new Game(9941);
    if(!legacy.import_save(g.export_save().replace(/^M2/,"M1")))
      throw Error("Older M1 world files must remain readable");
    legacy.free();restored.free();manual.free();
    copy.free();g.free();
    return "Rust shaped 2x2 crafting, S2 save, M1 compatibility, mining, tool, health, respawn";
  });
  await page.locator('[data-world-mode="creative"]').click();
  await page.locator("#playButton").click();
  await page.locator("#survivalVitals").waitFor({state:"hidden"});
  await page.keyboard.press("e");
  await page.locator("#creativeBlocks").waitFor({state:"visible"});
  if(await page.locator("#creativeBlocks .inv-slot").count()!==24)
    throw new Error("Creative inventory was not restored");

  if(errors.length) throw new Error("Browser errors: "+errors.join(" | "));
  console.log("PASS: WASM + WebGL2, creative + Survival, shaped crafting grid, 9 recipes, resource mining, tools, health, independent saves, 5 arcade arenas and bots; "+rules);
}finally{
  await browser.close();
}
