// Logic over Luck: เลขประจำตัวตอนเข้าห้อง (เข้ารหัส), เครื่องใหม่แทนเครื่องเก่า, ส่งผลเข้าระบบคะแนน
// ต้องเปิดเช็กชื่อสัปดาห์ 5 แบบเกมไว้ก่อน และมีตัวแทน Supabase (ดู run.sh)
const L = require('../lib');
const { execSync } = require('child_process');
(async () => {
  const b = await L.launch(), errs = [], ctx = await L.ctx(b, 390, 844);
  const host = await ctx.newPage(); host.on('pageerror', e => errs.push('host ' + e.message));
  await host.setViewportSize({ width: 1920, height: 1080 }); await host.goto(L.BASE + '/logic-over-luck/'); await host.evaluate(() => localStorage.clear());
  await host.goto(L.BASE + '/logic-over-luck/?test#host'); await host.waitForFunction(() => window.H && H.code);
  const code = await host.evaluate(() => H.code);
  /* spy: every message in the room */
  const spy = await ctx.newPage(); await spy.goto(L.BASE + '/logic-over-luck/engine.js');
  await spy.evaluate(c => { window.LOG = []; for (const n of ['lol-' + c, 'lol-' + c + '-up']) { const ch = new BroadcastChannel(n); ch.onmessage = e => LOG.push(JSON.stringify(e.data)); } }, code);
  async function join(name, sid) {
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + ' ' + e.message));
    await p.goto(L.BASE + '/logic-over-luck/#join=' + code); await p.waitForSelector('#jn');
    await p.waitForFunction(() => document.getElementById('sidbox').style.display !== 'none', null, { timeout: 15000 });
    await p.fill('#jn', name);
    if (sid) { await p.fill('#jsid', sid); await L.sleep(800); }
    await p.click('[data-p=join]'); await L.sleep(2500); return p;
  }
  const A = await join('เอ', '10001');
  L.check((await A.innerText('body')).includes('นับคะแนนชมรม'), 'มือถือเห็นว่านับคะแนนชมรม');
  await join('บี', '10002'); await join('ซี', '');
  const bad = await join('ผิด', '99999');
  L.check((await bad.innerText('body')).includes('ไม่พบเลขประจำตัวนี้'), 'เลขที่ไม่มีในรายชื่อ: มือถือบอกว่าไม่พบ');
  await L.sleep(1500);
  L.check(JSON.stringify(await host.evaluate(() => H.players.map(p => p.name + ':' + (p.sid || '-')))) === JSON.stringify(['เอ:10001', 'บี:10002', 'ซี:-']), 'เลขที่ไม่พบเข้าห้องไม่ได้ และคนไม่ใส่เลขเข้าได้');
  L.check(await host.evaluate(() => document.querySelectorAll('.chip [title="นับคะแนนชมรม"]').length) === 2, 'ล็อบบี้จอใหญ่มี ✓ ที่คนนับคะแนน 2 คน');
  await join('เอใหม่', '10001'); await L.sleep(1500);
  L.check(await host.evaluate(() => H.players.filter(p => p.sid === '10001').map(p => p.name).join()) === 'เอใหม่' && await host.evaluate(() => H.players.length) === 3, 'เลขเดียวกันจากเครื่องใหม่แทนเครื่องเก่า');
  L.check((await A.innerText('body')).includes('เลขประจำตัวนี้เข้าห้องจากเครื่องอื่นแล้ว'), 'เครื่องเก่าได้ข้อความว่าถูกตัดออก');
  const log = await spy.evaluate(() => LOG);
  L.check(log.length > 0 && !log.some(m => /1000[12]/.test(m)), 'เลขประจำตัวไม่ปรากฏในข้อความที่ใครก็อ่านได้ (' + log.length + ' ข้อความ)');
  /* start, then end after round 1 with chosen totals: เอใหม่ and บี tied in every round = shared place */
  await host.evaluate(() => { addBots(2); H.cfg.tBuild = 3; H.cfg.tPick = 2; H.cfg.tRr = 2; H.cfg.tRev = 2; HACT.start(); H.evDone = true; });
  await host.waitForFunction(() => H.phase === 'reveal' && H.round === 1, null, { timeout: 30000 });
  await host.evaluate(() => { const v = [9, 20, 9, 30, 1]; H.players.forEach((p, i) => { p.acc = v[i]; p.hist = [v[i]]; }); HACT.end(); HACT.end(); });
  const pl = await host.evaluate(() => H.players.map(p => [p.name, p.acc, H.places[p.idx]]));
  L.check(JSON.stringify(pl.map(x => x[2])) === '[3,2,3,1,5]', 'อันดับตอนจบ: คะแนนและทุกรอบเท่ากัน = อันดับร่วม ' + JSON.stringify(pl));
  L.check(await host.locator('[data-h=subOpen]').count() === 1, 'จอจบเกมมีปุ่มส่งผลเข้าระบบคะแนนชมรม');
  await host.click('[data-h=subOpen]'); await host.waitForSelector('#subpw', { timeout: 10000 });
  const ovText = await host.evaluate(() => document.getElementById('subov').innerText);
  L.check(ovText.includes('สัปดาห์ที่ 5') && ovText.includes('นับคะแนนชมรม 2 คน'), 'หน้าต่างส่งผล: สัปดาห์ 5 นับ 2 คน');
  await host.screenshot({ path: '/tmp/lol_sub.png' });
  await host.fill('#subpw', 'wrong'); await host.click('[data-s=send]'); await L.sleep(1200);
  L.check((await host.evaluate(() => document.getElementById('subov').innerText)).includes('รหัสผ่านไม่ถูกต้อง'), 'รหัสผิดถูกปฏิเสธ');
  await host.fill('#subpw', 'testpass'); await host.click('[data-s=send]'); await L.sleep(1500);
  L.check((await host.evaluate(() => document.getElementById('subov').innerText)).includes('บันทึกแล้ว 2 คน'), 'ส่งผลสำเร็จ 2 คน');
  const run = await host.evaluate(() => H.runId);
  const rows = execSync(`psql -h /tmp -p ${process.env.PGPORT || 5499} -U postgres -At -c "select student_id||':'||score||':'||place from game_results where run_id='${run}' order by student_id"`).toString().trim();
  L.check(rows === '10001:9:3\n10002:9:3', 'ฐานข้อมูลได้คะแนนสะสมและอันดับถูก (' + rows.replace(/\n/g, ', ') + ')');
  await host.click('[data-s=close]');
  L.check((await host.locator('[data-h=subOpen]').innerText()).includes('ส่งผลแล้ว'), 'ปุ่มเปลี่ยนเป็น "ส่งผลแล้ว ✓"');
  L.errors(errs); await b.close();
})();
