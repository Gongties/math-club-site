// Calcu ห้องจอใหญ่: สไลด์ในล็อบบี้ (คนเข้าห้องได้ระหว่างสไลด์), สไลด์ก่อนรอบ 1, ป้ายเข้าเฟส, จอง, ท้า, หน้ามือถือคนไม่ถูกท้า, เฉลย, สรุป, หน้ามือถือหลังสรุป
const L = require('../lib'), SHOT = process.env.SHOTS || '/tmp';
(async () => {
  const b = await L.launch(), errs = [], ctx = await L.ctx(b, 390, 844, { noStub: true });
  const host = await ctx.newPage(); host.on('pageerror', e => errs.push('host ' + e.message));
  await host.setViewportSize({ width: 1920, height: 1080 }); await host.goto(L.BASE + '/calcu/#host'); await L.sleep(6500);
  const code = await host.evaluate(() => H.code), ps = [];
  for (const n of ['เอ', 'บี', 'ซี']) { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(n + ' ' + e.message)); await p.goto(L.BASE + '/calcu/#join=' + code); await L.sleep(800); await p.fill('#nick', n); await p.click('[data-a=join]'); await L.sleep(900); ps.push(p); }
  await host.bringToFront(); await host.click('[data-a=lslOpen]'); await L.sleep(1500);
  const late = await ctx.newPage(); late.on('pageerror', e => errs.push('late ' + e.message));
  await late.goto(L.BASE + '/calcu/#join=' + code); await L.sleep(800); await late.fill('#nick', 'ดี'); await late.click('[data-a=join]'); await L.sleep(1200);
  L.check(await host.evaluate(() => H.players.length === 4 && !!H.lsl), 'เข้าห้องได้ระหว่างสไลด์ในล็อบบี้');
  L.check((await late.evaluate(() => document.body.innerText)).includes('ครูกำลังอธิบายวิธีเล่นบนจอใหญ่'), 'มือถือคนที่เข้าระหว่างสไลด์เห็นข้อความ');
  await host.bringToFront();
  for (let i = 0; i < 12 && await host.evaluate(() => !!H.lsl); i++) { await host.click('[data-a=lslNext]'); await L.sleep(200); }
  L.check(await host.evaluate(() => Number(H.cfg.howto)) === 0, 'ดูสไลด์ครบในล็อบบี้แล้วสวิตช์ปิดเอง');
  await host.click('[data-a=howToggle]'); await host.click('[data-a=start]'); await L.sleep(1200);
  L.check(await host.evaluate(() => H.phase) === 'howto', 'เปิดสวิตช์แล้วเริ่มเกม = สไลด์ก่อนรอบ 1');
  L.check((await ps[0].evaluate(() => document.body.innerText)).includes('กำลังอธิบายวิธีเล่นบนจอใหญ่'), 'มือถือระหว่างสไลด์ก่อนเกม');
  await host.screenshot({ path: SHOT + '/calcu-slide.png' });
  await host.click('[data-a=howSkip]'); await L.sleep(600);
  L.check(await host.evaluate(() => !!document.querySelector('#stage .ban')), 'ป้าย "จอง!" ขึ้น');
  L.check(await host.evaluate(() => G.deadline - Date.now() > 20000), 'เวลาเฟสเริ่มนับหลังป้าย');
  await L.sleep(3500);
  const cells = await host.evaluate(() => G.cells.map(c => c.id));
  for (let i = 0; i < ps.length; i++) { await ps[i].bringToFront(); await ps[i].click('[data-a=pick][data-id="' + cells[5 + i] + '"]'); await L.sleep(150); }
  await host.evaluate(() => { HACT.skip(); }); await L.sleep(2000);
  const pids = await host.evaluate(() => H.players.map(p => p.pid));
  await ps[1].bringToFront(); await ps[1].click('[data-a=chal][data-id="' + pids[0] + '"]'); await L.sleep(150); await ps[2].bringToFront(); await ps[2].click('[data-a=chal][data-id="' + pids[0] + '"]'); await L.sleep(100);
  await host.bringToFront(); L.check(await host.evaluate(() => !!document.querySelector('#stage .hc .slash') && !!document.querySelector('#stage .hc .mx')), 'ท้าแล้วมีรอยฟันและป้าย ×n');
  await L.sleep(1200); await host.evaluate(() => { HACT.skip(); }); await L.sleep(2200);
  await ps[1].bringToFront(); L.check((await ps[1].evaluate(() => document.body.innerText)).includes('ไขได้แล้ว 0 / 1'), 'มือถือคนไม่ถูกท้าเห็นรายการและตัวนับ');
  const sent = await host.evaluate(() => { const t = H.players[0].pid, n = sysNode(cellOf(t).value); if (!n) return false; onHostMsg({ type: 'submit', pid: t, node: n }); return true; });
  await host.bringToFront(); if (sent) L.check(await host.evaluate(() => !!document.querySelector('#stage .toast')), 'มีคนไขได้ = ป้าย "มีคนไขได้แล้ว!"');
  await host.evaluate(() => { HACT.skip(); }); await L.sleep(300);
  for (let i = 0; i < 6 && await host.evaluate(() => G.steps[G.rev - 1].type) !== 'chal'; i++) { await host.evaluate(() => HACT.next()); await L.sleep(200); }
  await L.sleep(4200); await host.screenshot({ path: SHOT + '/calcu-reveal.png' });
  L.check(await host.evaluate(() => !!document.querySelector('#stage .dl[data-p]') && !!document.querySelector('#stage .lv[data-p]')), 'ชิปคะแนนและแถวอันดับสดผูก pid (ชิปลอย)');
  await host.evaluate(() => { while (G.rev < G.steps.length) HACT.next(); HACT.toSum(); }); await L.sleep(2500);
  await ps[0].bringToFront(); L.check(await ps[0].evaluate(() => !!document.querySelector('#pw .rcirc')), 'มือถือหลังสรุปมีวงกลม ✓/✗');
  await ps[0].screenshot({ path: SHOT + '/calcu-phone-result.png' });
  L.errors(errs); await b.close();
})();
