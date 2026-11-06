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
  if(errors.length) throw new Error("Browser errors: "+errors.join(" | "));
  console.log("PASS: WASM + WebGL2, creative inventory, 5 playable minigame arenas, 4 bot rivals per mode, sandbox save isolation");
}finally{
  await browser.close();
}
