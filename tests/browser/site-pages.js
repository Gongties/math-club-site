// หน้าเว็บทั่วไป: การ์ดสัปดาห์ 4, กล่องเช็กชื่อใน /games/, คะแนนของฉัน, ตารางการเข้าร่วม + CSV, QR ล็อบบี้ Mathmory
const L = require('../lib'), fs = require('fs');
(async () => {
  const b = await L.launch(), errs = [];
  for (const w of [360, 1366]) {
    const ctx = await L.ctx(b, w, 900), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(L.BASE + '/puzzles/'); await L.sleep(600);
    L.check(await p.evaluate(() => document.body.innerText.includes('สัปดาห์ที่ 4')), w + ' คลังโจทย์มีการ์ดสัปดาห์ 4');
    L.check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), w + ' คลังโจทย์ไม่ล้นจอ');
    await p.goto(L.BASE + '/games/'); await L.sleep(1200);
    L.check(await p.evaluate(() => document.getElementById('ckGame').hidden), w + ' /games/ ไม่โชว์กล่องเช็กชื่อ');
    await p.goto(L.BASE + '/leaderboard/'); await L.sleep(1200);
    L.check(await p.evaluate(() => document.querySelectorAll('#lbTabs button').length) === 4, w + ' หน้าอันดับมีแท็บ รวม + 3 สัปดาห์');
    await p.click('#lbBody .nb[data-k="0"]'); await L.sleep(200);
    L.check(await p.evaluate(() => document.querySelectorAll('#lbBody tr.det .wl').length) === 3, w + ' แตะชื่อแล้วเห็นผล 3 สัปดาห์');
    await p.click('#lbTabs button:nth-child(2)'); await L.sleep(200);
    L.check(await p.evaluate(() => document.getElementById('lbHt').textContent.startsWith('สัปดาห์ที่ 4')), w + ' แท็บสัปดาห์ 4');
    L.check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), w + ' หน้าอันดับไม่ล้นจอ');
    await p.goto(L.BASE + '/halloffame/'); await L.sleep(1200);
    L.check(await p.evaluate(() => document.querySelectorAll('#hfChamp > div').length === 3 && document.body.innerText.includes('มาครบทุกสัปดาห์')), w + ' หอเกียรติยศแสดงแชมป์ 3 สัปดาห์และสถิติ');
    L.check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), w + ' หอเกียรติยศไม่ล้นจอ');
    await p.screenshot({ path: '/tmp/hof-' + w + '.png', fullPage: true });
    await p.goto(L.BASE + '/myscore/'); await L.sleep(400);
    await p.fill('#sid', ''); await p.type('#sid', '10001'); await L.sleep(1200);
    L.check(await p.evaluate(() => !document.getElementById('res').hidden && document.getElementById('pts').textContent === '26'), w + ' คะแนนของฉัน 10001 = 26');
    await p.fill('#sid', ''); await p.type('#sid', '99999'); await L.sleep(1200);
    L.check(await p.evaluate(() => document.getElementById('res').hidden && /ไม่พบ/.test(document.getElementById('msg').textContent)), w + ' เลขที่ไม่มีขึ้นว่าไม่พบ');
    L.check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), w + ' คะแนนของฉันไม่ล้นจอ');
    await p.goto(L.BASE + '/admin/'); await p.fill('#pw', 'testpass'); await p.click('#lg button'); await L.sleep(1200);
    await p.click('#bAtt'); await L.sleep(1200);
    L.check(await p.evaluate(() => document.querySelectorAll('#attTb tbody tr').length) === 8, w + ' ตารางการเข้าร่วม 8 แถว');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bCsv')]); const f = '/tmp/att-' + w + '.csv'; await dl.saveAs(f);
    L.check(fs.readFileSync(f, 'utf8').startsWith('﻿เลขประจำตัว'), w + ' CSV มี BOM และหัวตาราง');
    await ctx.close();
  }
  const ctx = await L.ctx(b, 1920, 1080, { noStub: true }), h = await ctx.newPage(); h.on('pageerror', e => errs.push(e.message));
  await h.goto(L.BASE + '/mathmory/#host'); await L.sleep(6500);
  await h.locator('#stage .qrbox').screenshot({ path: '/tmp/mm_qr.png' });
  L.check(await h.evaluate(() => !!document.querySelector('#stage .qrbox svg')), 'ล็อบบี้ Mathmory มี QR (ถอดด้วย OpenCV ใน run.sh)');
  fs.writeFileSync('/tmp/mm_code.txt', await h.evaluate(() => H.code));
  L.errors(errs); await b.close();
})();
