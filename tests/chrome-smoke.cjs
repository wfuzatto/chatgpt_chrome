"use strict";
const path=require("node:path");
const assert=require("node:assert/strict");
const puppeteer=require("puppeteer-core");
(async()=>{
 const extension=path.resolve(__dirname,"../extension");
 const browser=await puppeteer.launch({
   executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",
   headless:false,
   pipe:true,
   enableExtensions:[extension],
   args:["--no-sandbox","--disable-dev-shm-usage"]
 });
 try{
   console.log("Chrome targets:",browser.targets().map(t=>({type:t.type(),url:t.url()})));
   const target=await browser.waitForTarget(t=>t.type()==="service_worker"&&t.url().startsWith("chrome-extension://"),{timeout:20000});
   const id=new URL(target.url()).hostname;
   assert.match(id,/^[a-p]{32}$/);
   const page=await browser.newPage();
   const errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   const response=await page.goto("chrome-extension://"+id+"/options.html",{waitUntil:"load"});
   assert.equal(response.status(),200);
   await page.waitForSelector("#bridgeKey");
   for(const field of ["bridgeKey","outputDeviceId","includeMic","model","voice","consentConfirmed","save","respond","stop"]){
     assert.ok(await page.$("#"+field),"Elemento ausente: "+field);
   }
   await page.type("#bridgeKey","chave-apenas-teste");
   await page.click("#save");
   const saved=await page.evaluate(async()=> (await chrome.storage.local.get("bridgeKey")).bridgeKey);
   assert.equal(saved,"chave-apenas-teste");
   assert.deepEqual(errors,[]);
   console.log("PASS: Chrome MV3 instala, painel carrega e configurações persistem.");
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
