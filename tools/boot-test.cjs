// Boot test: click the splash at once (also under CPU throttle: node tools/boot-test.cjs 6) - the menu must open as soon as the game is ready, then Skirmish > Begin must start play. Serve the repo on :8123 first.
const { chromium } = require('playwright');
const RATE=+process.argv[2]||1;
(async()=>{ const b = await chromium.launch(); const ctx=await b.newContext({viewport:{width:1400,height:850}}); const p = await ctx.newPage();
 const cdp=await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate',{rate:RATE});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGE '+e)); p.on('console',m=>{if(m.type()==='error'&&!/TUNNEL/.test(m.text()))errs.push(m.text())});
 await p.goto('http://localhost:8123/',{waitUntil:'commit'}); await p.waitForSelector('.splashhint',{state:'attached'});
 const vis=()=>p.evaluate(()=>[...document.querySelectorAll('.screen')].filter(s=>!s.classList.contains('hidden')).map(s=>s.id).join(','));
 const t=Date.now(); await p.mouse.click(700,425); await p.waitForTimeout(300);
 console.log('300ms after click: hint =', await p.evaluate(()=>document.querySelector('.splashhint').textContent), '| screens', await vis());
 await p.waitForFunction(()=>!document.getElementById('mainmenu').classList.contains('hidden'),{timeout:90000}); console.log('menu auto-opened after',Date.now()-t,'ms');
 await p.waitForTimeout(900); const r=await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x+r.width/2,r.y+r.height/2); await p.waitForTimeout(800); console.log('skirmish ->',await vis());
 await p.click('#mBegin'); await p.waitForTimeout(1200); console.log('begin ->',JSON.stringify(await vis()));
 console.log('errors',errs); await b.close();})();
