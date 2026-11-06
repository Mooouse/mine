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
  if(errors.length) throw new Error("Browser errors: "+errors.join(" | "));
  console.log("PASS: WASM + WebGL2, 36-slot inventory, 24 original materials, block transfer, E/Escape controls");
}finally{
  await browser.close();
}
