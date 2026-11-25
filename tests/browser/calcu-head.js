// Calcu ห้องเล่นกับเพื่อน: ลบผู้เล่น 2 แตะ, สไลด์บนมือถือ (ปุ่มเฉพาะหัวห้อง), รอบใหม่เริ่มเองหลังเฉลย; จอใหญ่: Sudden Death เปิดฉาก, ลดการเคลื่อนไหว
const L = require('../lib');
(async () => {
  const b = await L.launch(), errs = [], ctx = await L.ctx(b, 390, 844, { noStub: true });
  const head = await ctx.newPage(); head.on('pageerror', e => errs.push('head ' + e.message));
  await head.goto(L.BASE + '/calcu/#head'); await L.sleep(600); await head.fill('#hname', 'หัว'); await head.click('[data-a=make]'); await L.sleep(6000);
  const code = await head.evaluate(() => H.code), ps = [];
  for (const n of ['เอ', 'แกล้ง']) { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(n + ' ' + e.message)); await p.goto(L.BASE + '/calcu/#join=' + code); await L.sleep(700); await p.fill('#nick', n); await p.click('[data-a=join]'); await L.sleep(900); ps.push(p); }
  await head.bringToFront();
  const kp = await head.evaluate(() => H.players.filter(p => p.name === 'แกล้ง')[0].pid);
  await head.click('[data-a=kick][data-p="' + kp + '"]'); await L.sleep(200);
  L.check(await head.evaluate(() => H.players.length) === 3, 'แตะ ✕ ครั้งแรกยังไม่ลบ');
  await head.click('[data-a=kick][data-p="' + kp + '"]'); await L.sleep(800);
  L.check(await head.evaluate(() => H.players.length) === 2, 'แตะครั้งที่สองลบแล้ว');
  await head.click('[data-a=start]'); await L.sleep(1500);
  L.check(!(await ps[0].evaluate(() => !!document.querySelector('[data-a=howNext]'))) && await head.evaluate(() => !!document.querySelector('[data-a=howNext]')), 'สไลด์: ปุ่มควบคุมเฉพาะหัวห้อง');
  await head.click('[data-a=howSkip]'); await L.sleep(500);
  await head.evaluate(() => { onHostMsg({ type: 'pick', pid: H.players[1].pid, cell: G.cells[3].id }); advance(); changed(); }); await L.sleep(300);
  await head.evaluate(() => { advance(); changed(); }); await L.sleep(12000);
  L.check(await head.evaluate(() => G.round === 2 && H.phase === 'p1'), 'ห้องเพื่อน: รอบใหม่เริ่มเองหลังเฉลย');
  await b.close();
  const b2 = await L.launch(), c2 = await L.ctx(b2, 1920, 1080, { noStub: true }), host = await c2.newPage(); host.on('pageerror', e => errs.push('host ' + e.message));
  await host.goto(L.BASE + '/calcu/#host'); await L.sleep(6000);
  const c3 = await host.evaluate(() => H.code);
  for (const n of ['เอ', 'บี']) { const p = await c2.newPage(); await p.goto(L.BASE + '/calcu/#join=' + c3); await L.sleep(700); await p.fill('#nick', n); await p.click('[data-a=join]'); await L.sleep(900); }
  await host.bringToFront(); await host.evaluate(() => { H.cfg.howto = 0; HACT.start(); }); await L.sleep(400);
  await host.evaluate(() => { const ids = H.players.map(p => p.pid); H.cfg.endMode = 'kingsd'; G.king = { pid: ids[0], n: 1 }; G.sdPending = { ps: ids.slice() }; G.summarized = true; startSD(); changed(); });
  await L.sleep(800);
  L.check(await host.evaluate(() => document.querySelector('#stage').innerText.includes('SUDDEN DEATH')), 'Sudden Death เปิดฉาก');
  L.check(await host.evaluate(() => G.deadline - Date.now() > 60000), 'เวลา Sudden Death เริ่มหลังเปิดฉาก');
  await b2.close();
  const b3 = await L.launch(), c4 = await L.ctx(b3, 1920, 1080, { noStub: true, reduce: true }), h3 = await c4.newPage(); h3.on('pageerror', e => errs.push('rm ' + e.message));
  await h3.goto(L.BASE + '/calcu/#host'); await L.sleep(6000); await h3.evaluate(() => HACT.lslOpen()); await L.sleep(300);
  L.check(await h3.evaluate(() => getComputedStyle(document.querySelector('#stage .slx h2')).opacity === '1'), 'ลดการเคลื่อนไหว: สไลด์แสดงครบโดยไม่มีอนิเมชัน');
  await b3.close();
  L.errors(errs);
})();
