import { chromium } from 'playwright';
const BASE = process.env.URL;
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--mute-audio'] });
let bad = 0;
const W=(p,f,t=420000)=>p.waitForFunction(f,{timeout:t});

for (const path of ['', 'play/', 'a/b/c/', 'index.html']) {
  // fresh context each time = cold cache, no storage
  const c = await b.newContext({ viewport:{width:1000,height:640} });
  const p = await c.newPage();
  const net = [], errs = [];
  p.on('response', r => net.push({ url:new URL(r.url()).pathname, status:r.status(), ct:r.headers()['content-type']||'', cc:r.headers()['cache-control']||'' }));
  p.on('requestfailed', r => errs.push('REQFAIL '+r.url()));
  p.on('console', m => { if (m.type()==='error') errs.push('CONSOLE '+m.text()); });
  p.on('pageerror', e => errs.push('PAGEERROR '+e.message));

  const target = BASE + path;
  await p.goto(target, { waitUntil:'networkidle' });
  let booted = false;
  try { await W(p, ()=>!!window.NURSE_RUSH, 60000); booted = true; } catch {}

  const footer = booted ? await p.evaluate(()=>({
    text: document.getElementById('dev-footer').innerText.replace(/\s+/g,' ').trim(),
    tt: getComputedStyle(document.querySelector('.dev-footer__text')).textTransform,
    visible: document.getElementById('dev-footer').getBoundingClientRect().height>0,
  })) : null;

  const failures = net.filter(r => r.status >= 400);
  const okFooter = footer && footer.visible && footer.tt==='none' &&
    footer.text.includes('Developed by Wejdan Boharam') &&
    footer.text.includes('\u00a9 Wejdan Boharam. All Rights Reserved.');
  const ok = booted && failures.length===0 && errs.length===0 && okFooter;
  if (!ok) bad++;
  console.log(`${ok?'  PASS':'✗ FAIL'}  boot from "/${path}"  — booted=${booted}, requests=${net.length}, 4xx/5xx=${failures.length}, errors=${errs.length}, footer="${footer?footer.text:'n/a'}"`);
  net.forEach(r => console.log(`         ${r.status} ${r.ct.split(';')[0].padEnd(24)} ${r.cc.padEnd(42)} ${r.url}`));
  failures.forEach(f => console.log('         !!', JSON.stringify(f)));
  errs.forEach(e => console.log('         !!', e));

  // play a short round from the deep path to prove functionality survives
  if (booted && path === 'play/') {
    await p.click('#btn-play'); await W(p, ()=>window.NURSE_RUSH.game.state==='intro', 60000);
    await p.click('#btn-skip'); await W(p, ()=>window.NURSE_RUSH.game.state==='running');
    await p.waitForTimeout(1500);
    await p.evaluate(()=>{window.NURSE_RUSH.game.roundTime=34.5;});
    await W(p, ()=>window.NURSE_RUSH.game.state==='question', 90000);
    await p.evaluate(()=>{const g=window.NURSE_RUSH.game;document.querySelectorAll('.opt')[g.correctIndex].click();});
    await W(p, ()=>window.NURSE_RUSH.game.state==='running', 90000);
    const s = await p.evaluate(()=>({score:window.NURSE_RUSH.game.score, correct:window.NURSE_RUSH.game.correctAnswers}));
    const played = s.correct===1 && s.score>=100;
    if (!played) bad++;
    console.log(`${played?'  PASS':'✗ FAIL'}  full round playable from a deep URL  — score ${s.score}, ${s.correct}/2 correct`);
    await p.screenshot({path:'d-deep-url.png'});
  }
  await c.close();
}
await b.close();
console.log(bad===0 ? '\nDEPLOYMENT SMOKE: ALL PASS' : `\nDEPLOYMENT SMOKE: ${bad} FAILURE(S)`);
process.exit(bad===0?0:1);
