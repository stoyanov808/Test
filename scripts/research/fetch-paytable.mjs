import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
const require=createRequire(path.resolve(process.cwd(),'package.json'));
const {chromium}=require('playwright');
import fs from 'node:fs/promises';
const root=path.resolve(process.argv[2]??'duck-hunters-public-evidence');
await fs.mkdir(root,{recursive:true});
function decodeLzw(value){
 if(!value.startsWith('lzw:'))return value;
 const code=value.slice(4),dict={};let phrase=code[0],old=phrase,next=256;const out=[phrase];
 for(let i=1;i<code.length;i++){const n=code.charCodeAt(i);phrase=n<256?code[i]:(dict[n]??old+old[0]);out.push(phrase);dict[next++]=old+phrase[0];old=phrase;}
 return out.join('');
}
function findData(value,path='$'){
 if(!value||typeof value!=='object')return;
 if(value.symbolValues){const filtered={source:'official public guest demo initialization',retrievedAt:new Date().toISOString(),path,symbolValues:value.symbolValues};for(const key of ['featureBuyTimesBetValue','betLevels','defaultBet','rtp','rtpValues','returnToPlayer'])if(value[key]!==undefined)filtered[key]=value[key];filtered.baseBetMultipliers=Object.fromEntries(Object.entries(value.symbolValues).map(([symbol,counts])=>[symbol,Object.fromEntries([8,9,10,11,12].map(count=>[count,counts[count]/20]))]));return filtered;}
 for(const [key,item] of Object.entries(value)){const found=findData(item,path+'.'+key);if(found)return found;}
}
const options={headless:true};
const override=process.env.CHROMIUM_PATH;
if(override){
 const executable=path.resolve(override);
 if(!existsSync(executable)||!statSync(executable).isFile())throw new Error('CHROMIUM_PATH must point to an existing Chromium executable.');
 options.executablePath=executable;
}else if(process.platform==='linux'&&existsSync('/usr/bin/chromium'))options.executablePath='/usr/bin/chromium';
const b=await chromium.launch(options);
const p=await b.newPage({viewport:{width:1440,height:900},ignoreHTTPSErrors:true});
let captured;
p.on('websocket',ws=>{console.log('Websocket connected to',new URL(ws.url()).hostname);ws.on('framereceived',event=>{try{const decoded=decodeLzw(String(event.payload));const found=findData(JSON.parse(decoded));if(found){captured=found;console.log('PAYTABLE',JSON.stringify(found.baseBetMultipliers));}}catch(e){console.log('Websocket frame could not be decoded as public JSON.');}});});
p.on('response',async r=>{if(r.url().includes('/EjsFrontWeb/fs')){const raw=await r.text();let status;try{const obj=JSON.parse(raw);status={status:r.status(),urlHost:obj.url?new URL(obj.url).hostname:null,error:obj.error,code:obj.code,keyPresent:!!obj.key};}catch{status={status:r.status(),message:'Non-JSON guest initialization response'};}console.log('Guest init',JSON.stringify(status));}});
p.on('requestfailed',r=>{if(r.url().includes('/EjsFrontWeb/')||r.url().includes('DuckHunters'))console.log('FAILED',new URL(r.url()).hostname,r.failure()?.errorText);});
const url='https://demo.nolimitcdn.com/loader/game-loader.html?game=DuckHunters&operator=FANPAGE_DEMO&language=en&device=desktop&playForFunCurrency=EUR';
try{
 await p.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
 for(let i=0;i<20&&!captured;i++)await p.waitForTimeout(2000);
 await p.screenshot({path:root+'/official-demo-current.png'});
 console.log('FRAMES',p.frames().map(f=>{const u=new URL(f.url());return u.origin+u.pathname;}));
 if(captured)await fs.writeFile(root+'/official-paytable-init.json',JSON.stringify(captured,null,2)+'\n');
 else throw new Error('No public symbolValues received within 40 seconds. Check access to demo.nolimitcdn.com and demo.nolimitcity.com.');
}finally{await b.close();}
