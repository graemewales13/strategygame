// UI smoke test: serve the repo (python3 -m http.server 8123) then `node tools/ui-smoke.cjs` (needs playwright). Clicks every menu path with real mouse events; must print no errors.
const { chromium } = require('playwright');
(async()=>{ const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1400,height:850}});
 const errs=[]; p.on('pageerror',e=>errs.push('PAGE '+e)); p.on('console',m=>{if(/auld-world/.test(m.text()))errs.push(m.text())});
 await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500);
 const vis=()=>p.evaluate(()=>[...document.querySelectorAll('.screen')].filter(s=>!s.classList.contains('hidden')).map(s=>s.id).join(','));
 const clickHot=async(id)=>{const r=await p.locator('#'+id).boundingBox(); await p.mouse.click(r.x+r.width/2,r.y+r.height/2); await p.waitForTimeout(700);};
 const step=async(n)=>console.log(n.padEnd(34), '->', await vis(), '| paused:', await p.evaluate(()=>!!window.__seven.game.paused));
 await step('load'); await p.mouse.click(700,425); await p.waitForTimeout(900); await step('after splash click');
 await clickHot('hSkirmish'); await step('Skirmish'); 
 await p.click('#mBegin'); await p.waitForTimeout(900); await step('Begin the Valley');
 await p.keyboard.press('Escape'); await p.waitForTimeout(500); await step('Esc');
 await clickHot('hOptions'); await step('Options'); await p.click('#mBack'); await p.waitForTimeout(500); await step('Back');
 await clickHot('hMap'); await step('Campaign'); await p.keyboard.press('Escape'); await p.waitForTimeout(500); await step('Esc from campaign');
 const vis2=await vis(); 
 if(vis2.includes('mainmenu')) {await clickHot('hNew'); await step('New game'); }
 console.log('menu btn visible?', await p.locator('#btnMenu, button:has-text("Menu")').first().isVisible());
 await p.locator('button:has-text("Menu")').first().click().catch(e=>console.log('Menu btn',e.message.slice(0,80))); await p.waitForTimeout(500); await step('HUD Menu');
 const cont = await vis(); if(cont.includes('mainmenu')){ await clickHot('hContinue'); await step('Continue'); }
 await p.locator('#btnSpeed').click(); console.log('speed', await p.locator('#btnSpeed').innerText());
 await p.locator('#houses > *').nth(1).click(); await p.waitForTimeout(400); console.log('diplo open', await p.evaluate(()=>!document.getElementById('diplo').classList.contains('hidden')));
 await p.click('#btnCouncil'); await p.waitForTimeout(400); console.log('council open', await p.evaluate(()=>!document.getElementById('council').classList.contains('hidden') && document.querySelectorAll('#council .hcard').length));
 await p.keyboard.press('Escape'); await p.waitForTimeout(200); console.log('council closed by Esc', await p.evaluate(()=>document.getElementById('council').classList.contains('hidden')));
 await p.keyboard.press('c'); await p.waitForTimeout(200); await p.keyboard.press('c'); await p.waitForTimeout(200); console.log('council toggles with C', await p.evaluate(()=>document.getElementById('council').classList.contains('hidden')));
 await p.locator('button:has-text("Map")').first().click(); await p.waitForTimeout(600); await step('HUD Map'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
 await p.screenshot({path:'/tmp/ui-smoke.png'});
 console.log('errors', errs); await b.close();})();
