// Calcu: เลขประจำตัวตอนเข้าห้อง, เครื่องใหม่แทนเครื่องเก่า, ส่งผลเข้าระบบคะแนน (ต้องเปิดเช็กชื่อสัปดาห์ 5 แบบเกมไว้ก่อน ดู run.sh)
const L = require('../lib');
(async () => {
  const b = await L.launch(), errs = [], ctx = await L.ctx(b, 390, 844);
  const host = await ctx.newPage(); host.on('pageerror', e => errs.push('host ' + e.message));
  await host.setViewportSize({ width: 1920, height: 1080 }); await host.goto(L.BASE + '/calcu/#host'); await L.sleep(1500);
  const code = await host.evaluate(() => H.code);
  async function join(name, sid) {
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + ' ' + e.message));
    await p.goto(L.BASE + '/calcu/#join=' + code); await L.sleep(1200); await p.fill('#nick', name);
    if (sid) { await p.fill('#sid', sid); await L.sleep(800); }
    await p.click('[data-a=join]'); await L.sleep(1500); return p;
  }
  const A = await join('เอ', '10001'); await join('บี', '10002'); await join('ซี', ''); await join('ผิด', '99999');
  L.check(JSON.stringify(await host.evaluate(() => H.players.map(p => p.name + ':' + (p.sid || '-')))) === JSON.stringify(['เอ:10001', 'บี:10002', 'ซี:-']), 'เลขที่ไม่พบเข้าห้องไม่ได้ และคนไม่ใส่เลขเข้าได้');
  L.check(!/10001|10002/.test(await host.evaluate(() => JSON.stringify(publicState()))), 'เลขประจำตัวไม่ถูกส่งไปมือถือ');
  await join('เอใหม่', '10001');
  L.check(await host.evaluate(() => H.players.filter(p => p.sid === '10001').map(p => p.name).join()) === 'เอใหม่', 'เลขเดียวกันจากเครื่องใหม่แทนเครื่องเก่า');
  await host.evaluate(() => { H.cfg.howto = 0; HACT.start(); }); await L.sleep(400);
  await host.evaluate(() => { const ids = H.players.map(p => p.pid); G.scores[ids[0]] = 35; G.scores[ids[1]] = 35; G.scores[ids[2]] = 20; H.phase = 'end'; G.deadline = 0; changed(); });
  L.check(JSON.stringify(await host.evaluate(() => { const pl = subPlaces(); return H.players.map(p => pl[p.pid]); })) === '[1,1,3]', 'ศึกชิงมง: คะแนนเท่ากันชนะร่วม = อันดับ 1 ทั้งคู่');
  await host.click('[data-a=subOpen]'); await L.sleep(1500); await host.fill('#subpw', 'wrong'); await host.click('[data-s=send]'); await L.sleep(1200);
  L.check((await host.evaluate(() => document.getElementById('subov').innerText)).includes('รหัสผ่านไม่ถูกต้อง'), 'รหัสผิดถูกปฏิเสธ');
  await host.fill('#subpw', 'testpass'); await host.click('[data-s=send]'); await L.sleep(1500);
  L.check((await host.evaluate(() => document.getElementById('subov').innerText)).includes('บันทึกแล้ว 2 คน'), 'ส่งผลสำเร็จ 2 คน');
  await host.evaluate(() => { H.cfg.endMode = 'kingsd'; const ids = H.players.map(p => p.pid); G.sd = { ps: [ids[0], ids[2]], pts: {}, cur: {}, used: {}, over: true, winners: [ids[2]] }; changed(); });
  L.check(JSON.stringify(await host.evaluate(() => { const pl = subPlaces(); return H.players.map(p => pl[p.pid]); })) === '[2,2,1]', 'Sudden Death: ผู้ชนะ SD อันดับ 1 แล้วเรียงตามคะแนน');
  L.errors(errs); await b.close();
})();
