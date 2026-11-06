import { chromium } from "playwright";

const url = "http://127.0.0.1:8765/";
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
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:30000});
  await page.locator("#loading").waitFor({state:"detached",timeout:45000});
  if(!await page.locator("#menu").isVisible())throw new Error("Main menu did not appear");
  const dimensions=await page.locator("#game").evaluate(el=>[el.width,el.height]);
  if(dimensions[0]<100||dimensions[1]<100)throw new Error("Game canvas is empty");
  await page.locator("#playButton").click();
  await page.locator("#hud").waitFor({state:"visible"});
  await page.waitForTimeout(750);
  if(errors.length) throw new Error("Browser errors: "+errors.join(" | "));
  console.log("PASS: WASM loaded, WebGL initialized, canvas dimensions",dimensions,
    "and the game HUD became visible.");
}finally{
  await browser.close();
}
