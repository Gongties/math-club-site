/* Browser test of /logic-over-luck/: Host + 3 phones + 5 bots, full 12 rounds, a spy tab that records every message.
   Needs: python3 -m http.server 8765 at the repo root. Realtime falls back to BroadcastChannel (the CDN is blocked). */
"use strict";
const { chromium } = require("playwright");
const BASE = "http://localhost:8765/logic-over-luck/";
/* LOL_FORCE=ban,lucky,crowded,robin : after each vote is checked, set the rule of rounds 4, 7, 10 and the special rule to these
   (so the rules that a random vote may skip get tested too) */
const FORCE = process.env.LOL_FORCE ? process.env.LOL_FORCE.split(",") : null;
const START = 15;   /* the default starting score (the test settings do not change it) */
let fails = 0;
function ok(cond, msg) { console.log((cond ? "ผ่าน  " : "ไม่ผ่าน ") + msg); if (!cond) fails++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const ctx = await browser.newContext();
  await ctx.route(/cdn\.jsdelivr|fonts\.g/, (r) => r.abort());
  const errors = [];
  function watch(p, name) { p.on("pageerror", (e) => errors.push(name + ": " + e.message)); p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|net::/.test(m.text())) errors.push(name + " console: " + m.text()); }); }

  const host = await ctx.newPage(); watch(host, "host");
  await host.setViewportSize({ width: 1920, height: 1080 });
  await host.goto(BASE);
  await host.evaluate(() => { localStorage.clear(); localStorage.setItem("lol-cfg", JSON.stringify({ room: "ทดสอบ", tBuild: 12, tPick: 6, tRr: 5, tRev: 3, tVote: 8, tBreak: 10, special: 1, votePct: 50, voteCount: 0, cap: 3, crowdX: 0 })); });
  await host.goto(BASE + "?test#host");
  await host.waitForFunction(() => window.H && H.code);
  const code = await host.evaluate(() => H.code);
  ok(/^\d{4}$/.test(code), "จอใหญ่สร้างห้อง รหัส " + code);
  ok(await host.locator(".qr svg").count() === 1, "ล็อบบี้มี QR code");

  /* spy: records every message in the room's channel */
  const spy = await ctx.newPage();
  await spy.goto(BASE + "engine.js");
  await spy.evaluate((c) => { window.LOG = []; const b = new BroadcastChannel("lol-" + c); b.onmessage = (e) => LOG.push(JSON.parse(JSON.stringify(e.data))); }, code);

  const phones = [];
  for (let i = 0; i < 3; i++) {
    const p = await ctx.newPage(); watch(p, "phone" + i);
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(BASE + "#join=" + code);
    await p.waitForSelector("#jn");
    await p.fill("#jn", ["แพรว", "บอส", "มิ้นท์"][i]);
    await p.click("[data-p=join]");
    phones.push(p);
  }
  for (const p of phones) await p.waitForSelector("text=เข้าห้องแล้ว", { timeout: 15000 });
  ok(true, "มือถือ 3 เครื่องเข้าห้องได้");
  await host.bringToFront();
  await host.click("[data-h=bots]");
  await host.waitForFunction(() => H.players.length === 8);
  ok(true, "เพิ่มบอท 5 ตัว รวม 8 คน");
  /* kick: one tap does nothing, two taps remove; then the phone joins again */
  const k0 = await host.evaluate(() => H.players.filter((p) => p.bot)[0].pid);
  await host.click(`[data-h=kick][data-p="${k0}"]`);
  ok(await host.evaluate(() => H.players.length) === 8, "แตะลบครั้งเดียวยังไม่ลบ");
  await host.click(`[data-h=kick][data-p="${k0}"]`);
  ok(await host.evaluate(() => H.players.length) === 7, "แตะลบ 2 ครั้ง ลบผู้เล่นออก");
  await host.screenshot({ path: "/tmp/lol_h_lobby.png" });
  await host.click("[data-h=start]");
  await host.waitForFunction(() => H.phase === "build");
  await host.evaluate(() => { H.evDone = true; });   /* this test plays without The 67 Event (tests/browser/lol-67.js tests the events) */

  /* build: phone 0 and 1 build, phone 2 lets the timer run out */
  const builds = [["gtmean", "random"], ["notrep", "+2"]];
  for (let i = 0; i < 2; i++) {
    const p = phones[i]; await p.bringToFront();
    await p.waitForSelector("text=สร้างกฎส่วนตัว");
    await p.click(`[data-p=cond][data-v="${builds[i][0]}"]`);
    await p.click(`[data-p=eff][data-v="${builds[i][1]}"]`);
    await p.click("[data-p=build]");
    await p.waitForSelector("text=ส่งกฎแล้ว", { timeout: 10000 });
    if (i === 0) await p.screenshot({ path: "/tmp/lol_p0_build.png" });
  }
  /* over-budget option is disabled */
  await phones[2].bringToFront();
  await phones[2].click('[data-p=cond][data-v="notrep"]');
  ok(await phones[2].locator('[data-p=eff][data-v="+7"]').isDisabled(), "ผลที่เกินงบ 5 เหรียญกดไม่ได้");
  await host.bringToFront();
  await host.waitForFunction(() => H.phase === "pick", null, { timeout: 30000 });
  const hb = await host.evaluate(() => H.players.map((p) => [p.name, p.cond, p.eff, p.autoBuilt || false]));
  ok(hb[0][1] === "gtmean" && hb[0][2] === "random" && hb[1][1] === "notrep" && hb[1][2] === "+2", "จอใหญ่ได้กฎที่มือถือส่ง (ผ่านการเข้ารหัส)");
  ok(hb[2][3] === true && hb[2][1], "คนไม่ส่งกฎ ระบบสุ่มกฎให้: " + hb[2][1] + " + " + hb[2][2]);
  ok(hb.every((b) => b[1] && b[2]), "ทุกคนมีกฎ");

  /* rounds */
  const dice = ["std", "con", "risk", "prime"];
  let rerolledOnce = false, checks = { roll: 0, total: 0, replay: 0 };
  const L = require(__dirname + "/../../logic-over-luck/engine.js");
  let mine = null;   /* independent replay of every round from the Host's own data */
  const ruleLog = []; let r1 = null, rulesBefore = [];
  for (let t = 1; t <= 12; t++) {
    if (t === 7) {   /* mid-game break: phone 0 changes its rule, phone 1 keeps it, phone 2 does nothing */
      await host.waitForFunction(() => H.phase === "break", null, { timeout: 40000 });
      /* top half after round 6 (ties at the line too) got 1 more re-roll */
      const rb = await host.evaluate(() => { const acc = H.players.map((p) => p.acc), c = engCfg(), k = c.voteCount || Math.ceil(acc.length * c.voteFrac), thr = acc.slice().sort((a, b) => b - a)[k - 1];
        return H.players.map((p) => ({ top: p.acc >= thr, bonus: p.rrBonus, left: p.rrLeft, used: p.pid })); });
      ok(rb.every((q) => q.top === q.bonus) && rb.filter((q) => q.bonus).length >= Math.ceil(rb.length / 2), "พักครึ่ง: ครึ่งบน " + rb.filter((q) => q.bonus).length + " คนได้ทอยใหม่เพิ่ม (สิทธิ์ที่เหลือ " + rb.map((q) => q.left).join(",") + ")");
      ok(rb.every((q) => q.left >= (q.bonus ? 1 : 0) && q.left <= (q.bonus ? 2 : 1)), "จำนวนทอยใหม่ที่เหลือถูก (ครึ่งบน 1–2, คนอื่น 0–1)");
      const sp = await host.evaluate(() => H.special);
      ok(!!sp, "พักครึ่ง เปิดกฎพิเศษรอบสุดท้าย: " + sp);
      if (FORCE) await host.evaluate((r) => { H.special = r; }, FORCE[3]);
      await phones[0].bringToFront(); await phones[0].waitForSelector("[data-p=bkeep]", { timeout: 15000 });
      await host.evaluate(() => HACT.pause());
      await host.screenshot({ path: "/tmp/lol_h_break.png" }); await phones[0].screenshot({ path: "/tmp/lol_p0_break.png" });
      await host.evaluate(() => HACT.pause());
      ok(await phones[0].locator('[data-p=eff][data-v="interest"]').isDisabled(), "พักครึ่ง เลือกดอกเบี้ยทบต้นใหม่ไม่ได้");
      await phones[0].click('[data-p=cond][data-v="odd"]'); await phones[0].click('[data-p=eff][data-v="+2"]'); await phones[0].click("[data-p=bsend]");
      await phones[1].bringToFront(); await phones[1].waitForSelector("[data-p=bkeep]", { timeout: 15000 }); await phones[1].click("[data-p=bkeep]");
      await phones[0].waitForSelector("text=เปลี่ยนกฎแล้ว", { timeout: 15000 });
      await host.waitForFunction(() => H.phase === "vote", null, { timeout: 30000 });
      const r = await host.evaluate(() => H.players.slice(0, 3).map((p) => [p.cond, p.eff, p.brkChanged]));
      ok(r[0][0] === "odd" && r[0][1] === "+2" && r[0][2] && r[1][0] === "notrep" && !r[1][2] && !r[2][2], "พักครึ่ง: เปลี่ยนกฎ/ใช้กฎเดิม/ไม่ตัดสินใจ ได้ผลถูก");
    }
    if (t === 4 || t === 7 || t === 10) {   /* vote: every phone in the voting group votes for its first option */
      await host.waitForFunction((tt) => H.phase === "vote" && H.vote.round === tt, t, { timeout: 40000 });
      const vi = await host.evaluate((tt) => {
        const acc = H.players.map((p) => p.acc), top = Math.max.apply(null, acc);
        const grp = tt === 7 ? H.players.filter((p) => p.acc === top).map((p) => p.pid) : LOL.votingGroup(acc, engCfg()).map((i) => H.players[i].pid);   /* before round 7: rank 1 (ties all) */
        return { voters: H.vote.voters, opts: H.vote.opts, rules: H.rules.slice(), special: H.special, grp: grp, kind: H.vote.kind };
      }, t);
      ok(vi.kind === (t === 7 ? "top1" : "lower"), "ก่อนรอบ " + t + " ผู้โหวต = " + (t === 7 ? "อันดับ 1" : "ครึ่งล่าง"));
      ok(JSON.stringify(vi.voters) === JSON.stringify(vi.grp) && vi.opts.length === 3 && new Set(vi.opts).size === 3 && vi.opts.every((o) => vi.rules.indexOf(o) < 0) && vi.opts.indexOf(vi.special) < 0,
        "โหวตก่อนรอบ " + t + ": กลุ่มโหวต " + vi.voters.length + " คน ตัวเลือก 3 ข้อไม่ซ้ำ ไม่ใช่กฎที่ใช้อยู่ (" + vi.rules.join("+") + ") และไม่ใช่กฎพิเศษ");
      rulesBefore = vi.rules;
      const myPids = await host.evaluate(() => H.players.slice(0, 3).map((p) => p.pid));
      if (t === 4) { await host.evaluate(() => HACT.pause()); await host.screenshot({ path: "/tmp/lol_h_vote.png" }); for (let i = 0; i < 3; i++) await phones[i].screenshot({ path: "/tmp/lol_p" + i + "_vote.png" }); await host.evaluate(() => HACT.pause()); }
      for (let i = 0; i < 3; i++) {
        if (vi.voters.indexOf(myPids[i]) < 0) continue;
        const p = phones[i]; await p.bringToFront();
        await p.waitForSelector("[data-p=vsel]:not([disabled])", { timeout: 15000 });
        await p.locator("[data-p=vsel]").first().click(); await p.click("[data-p=vote]");
        await p.waitForSelector("text=โหวต", { timeout: 10000 });
      }
      await host.waitForFunction(() => H.phase === "voted", null, { timeout: 30000 });
      if (t === 4) { await host.evaluate(() => HACT.pause()); await host.screenshot({ path: "/tmp/lol_h_voted.png" }); await host.evaluate(() => HACT.pause()); }
      const vr = await host.evaluate(() => ({ res: H.vote.res, rule: H.rules[H.rules.length - 1], rules: H.rules.slice(), n: Object.keys(H.vote.votes).length, list: Object.keys(H.vote.votes).map((k) => ({ opt: H.vote.votes[k][0], t: H.vote.votes[k][1] })), opts: H.vote.opts }));
      const again = L.voteWinner(vr.opts, vr.list);
      ok(vr.rule === vr.res.win && (vr.res.how === "random" || again.win === vr.rule) && Object.values(vr.res.tally).reduce((a, b) => a + b, 0) === vr.n, "ผลโหวต " + vr.rule + " (" + vr.res.how + ") ตรงกับการนับใหม่");
      ok(JSON.stringify(vr.rules) === JSON.stringify(rulesBefore.concat([vr.rule]).slice(-2)), "กฎที่ชนะเพิ่มเข้ามา เก็บ 2 ข้อล่าสุด: " + vr.rules.join(" + "));
      if (FORCE) await host.evaluate((r) => { H.rules[H.rules.length - 1] = r; }, FORCE[[4, 7, 10].indexOf(t)]);
      ruleLog.push(FORCE ? FORCE[[4, 7, 10].indexOf(t)] : vr.rule);
    }
    await host.waitForFunction((tt) => H.round === tt && H.phase === "pick", t, { timeout: 40000 });
    const rinfo = await host.evaluate(() => ({ cur: H.curRules, banned: H.banned, lucky: H.lucky, rules: H.rules.slice(), special: H.special }));
    if (t === 1) { r1 = rinfo.cur[0]; ok(rinfo.cur.length === 1 && ["robin", "underdog"].indexOf(r1) < 0, "รอบ 1 สุ่มกฎส่วนรวม 1 ข้อ (ไม่ใช่โรบินฮู้ด/Never Gonna Give You Up): " + r1); }
    if (t <= 3) ok(JSON.stringify(rinfo.cur) === JSON.stringify([r1]), "รอบ " + t + " ใช้กฎรอบ 1 ข้อเดียว");
    else if (t < 12) ok(rinfo.cur.length === 2 && JSON.stringify(rinfo.cur) === JSON.stringify(rinfo.rules), "รอบ " + t + " ใช้ 2 กฎล่าสุด: " + rinfo.cur);
    else ok(rinfo.cur.length === 3 && JSON.stringify(rinfo.cur) === JSON.stringify(rinfo.rules.concat([rinfo.special])), "รอบ 12 ใช้ 3 กฎ: " + rinfo.cur);
    if (t === 4) ok(rinfo.cur[0] === r1, "รอบ 4–6 = กฎรอบ 1 + กฎที่โหวตก่อนรอบ 4");
    if (t === 7) ok(rinfo.cur[0] === ruleLog[0], "รอบ 7–9 = กฎรอบ 4 + กฎรอบ 7 (กฎรอบ 1 หลุดออก)");
    if (rinfo.cur.indexOf("lucky") >= 0) ok(rinfo.lucky >= 1 && rinfo.lucky <= 7, "เลขนำโชครอบ " + t + " = " + rinfo.lucky); else ok(rinfo.lucky === null, "ไม่มีเลขนำโชคเมื่อกฎไม่ใช้");
    if (t === 12) { await host.evaluate(() => HACT.pause()); await host.screenshot({ path: "/tmp/lol_h_r12.png" }); await phones[0].screenshot({ path: "/tmp/lol_p0_r12.png", fullPage: true }); await host.evaluate(() => HACT.pause()); }
    if (rinfo.banned.length) {
      await phones[0].bringToFront(); await phones[0].waitForSelector(".die", { timeout: 15000 });
      ok(await phones[0].locator(`[data-p=die][data-v="${rinfo.banned[0]}"]`).isDisabled(), "ลูกเต๋าต้องห้าม " + rinfo.banned + " กดไม่ได้บนมือถือ");
    }
    for (let i = 0; i < 3; i++) {
      if (i === 2 && t % 3 === 0) continue;   /* phone 2 sometimes misses the pick: keeps last die */
      const p = phones[i]; await p.bringToFront();
      await p.waitForSelector(".die", { timeout: 15000 });
      const allowed = dice.filter((d) => rinfo.banned.indexOf(d) < 0);
      await p.click(`[data-p=die][data-v="${allowed[(i + t) % allowed.length]}"]`);
      if (t === 1 && i === 0) await p.screenshot({ path: "/tmp/lol_p0_pick.png" });
    }
    await host.waitForFunction(() => H.phase === "reroll" || H.phase === "reveal", null, { timeout: 30000 });
    if (await host.evaluate(() => H.phase === "reroll")) {
      for (let i = 0; i < 3; i++) {
        const p = phones[i]; await p.bringToFront();
        const btn = p.locator('[data-p=rr][data-v="' + (i === 1 && t === 2 && !rerolledOnce ? "1" : "0") + '"]');
        if (await btn.count()) {
          const hostX = await host.evaluate((k) => H.players[k].x, i);
          const shown = Number(await p.locator(".roll").textContent());
          checks.roll += shown === hostX ? 1 : 0; if (shown !== hostX) ok(false, "มือถือเห็นเลขไม่ตรงจอใหญ่ รอบ " + t);
          if (t === 1 && i === 0) await p.screenshot({ path: "/tmp/lol_p0_reroll.png" });
          await btn.click(); if (i === 1 && t === 2) rerolledOnce = true;
        }
      }
    }
    await host.waitForFunction(() => H.phase === "reveal", null, { timeout: 30000 });
    if (t === 1) await host.evaluate(() => HACT.pause());   /* hold the reveal while taking pictures */
    const snap = await host.evaluate(() => H.players.map((p) => ({ die: p.prevDie, x: p.prevX, rerolled: p.rerolled, cond: p.cond, eff: p.eff, reff: p.reff, acc: p.acc, rp: p.rp, tie: p.tie })));
    const env = await host.evaluate(() => ({ rules: H.curRules, banned: H.banned, lucky: H.lucky, cfg: engCfg() }));
    if (env.banned.length) ok(snap.every((q) => env.banned.indexOf(q.die) < 0), "รอบ " + t + " ไม่มีใครใช้ลูกเต๋าต้องห้าม");
    if (!mine) mine = snap.map(() => ({ acc: START, prevX: null, next6: false, hist: [] }));
    const res = L.scoreRound({ round: t, final: t === 12, rules: env.rules.map((id) => ({ id: id, scope: null })), banned: env.banned, lucky: env.lucky, cfg: env.cfg,
      players: snap.map((q, k) => ({ die: q.die, x: q.x, rerolled: q.rerolled, cond: q.cond,
      eff: q.eff === "random" ? q.reff : q.eff, acc: mine[k].acc, prevX: mine[k].prevX, next6: mine[k].next6, hist: mine[k].hist.slice(), tie: q.tie })) });
    snap.forEach((q, k) => { mine[k].acc = res.acc[k]; mine[k].prevX = q.x; mine[k].next6 = res.players[k].next6Next; mine[k].hist.push(res.roundPts[k]); });
    if (JSON.stringify(res.acc) === JSON.stringify(snap.map((q) => q.acc))) checks.replay++; else console.log("รอบ", t, "คิดใหม่", JSON.stringify(res.acc), "จอใหญ่", JSON.stringify(snap.map((q) => q.acc)));
    if (t === 1) for (let i = 0; i < 3; i++) await phones[i].screenshot({ path: "/tmp/lol_p" + i + "_reveal.png", fullPage: true });
    if (t === 1) await host.screenshot({ path: "/tmp/lol_h_reveal.png" });
    if (t === 2) ok(await host.evaluate(() => H.players[1].rerolled && !H.players[1].rrLeft), "รอบ 2 บอสทอยใหม่ ใช้สิทธิ์แล้ว");
    if (t === 3) ok(await host.evaluate(() => H.players[2].autoDie && H.players[2].die === H.players[2].prevDie), "ไม่เลือกเต๋า ระบบใช้ลูกเดิม");
    /* phone's own breakdown matches the Host */
    for (let i = 0; i < 3; i++) {
      const p = phones[i];
      const hv = await host.evaluate((k) => ({ acc: H.players[k].acc, rp: H.players[k].rp }), i);
      await p.waitForFunction((a) => document.body.innerText.includes("→ " + (a < 0 ? "−" + (-a) : a)), hv.acc, { timeout: 15000 });
      checks.total++;
    }
    if (t === 1) await host.evaluate(() => HACT.pause());
    if (t === 4) {   /* reload the Host in the middle of the game: it comes back paused, then continues */
      await host.reload();
      await host.waitForFunction(() => window.H && H.round === 4 && H.paused);
      ok(true, "รีโหลดจอใหญ่กลางเกม กลับมาที่รอบเดิม (หยุดเวลารอครู)");
      await host.click("[data-h=pause]");
    }
    if (t === 6) {   /* reload a phone: it comes back to the room with its secret data */
      await phones[0].reload();
      await phones[0].waitForSelector(".sbar", { timeout: 20000 });
      ok(true, "รีโหลดมือถือกลางเกม กลับเข้าห้องเดิม");
    }
  }
  console.log("กฎที่โหวตได้: " + ruleLog.join(", "));
  ok(checks.replay === 12, "คิดคะแนนใหม่แยกต่างหากจากข้อมูลจริงของจอใหญ่ ตรงกันทุกรอบ (" + checks.replay + "/12)");
  ok(checks.total === 36, "คะแนนสะสมบนมือถือตรงจอใหญ่ทุกรอบ (" + checks.total + " ครั้ง)");
  await host.waitForFunction(() => H.phase === "end", null, { timeout: 30000 });
  const end = await host.evaluate(() => ({ pl: H.places, acc: H.players.map((p) => p.acc), hist: H.players.map((p) => p.hist) }));
  /* recompute the places from the totals and round points */
  ok(JSON.stringify(L.finalPlaces(end.acc, end.hist)) === JSON.stringify(end.pl), "อันดับตอนจบ = finalPlaces ของคะแนนจริง " + JSON.stringify(end.pl));
  ok(end.hist.every((h, i) => h.length === 12 && h.reduce((a, b) => a + b, 0) >= -999), "ทุกคนมีคะแนนรอบครบ 12 รอบ");
  for (let i = 0; i < 3; i++) {
    await phones[i].waitForSelector("text=อันดับของคุณ", { timeout: 15000 });
    const shown = Number(await phones[i].locator(".roll").textContent());
    ok(shown === end.pl[i], "มือถือ " + i + " เห็นอันดับ " + shown);
  }
  await host.screenshot({ path: "/tmp/lol_end.png" });

  /* what anyone listening to the room could read */
  const log = await spy.evaluate(() => LOG);
  const fromPhones = log.filter((m) => m.from === "p");
  ok(fromPhones.every((m) => ["join", "sec", "need"].indexOf(m.type) >= 0), "มือถือส่งแค่ join, sec (เข้ารหัส), need (" + fromPhones.length + " ข้อความ)");
  const leakP = fromPhones.filter((m) => m.type === "sec" && (m.die || m.cond || m.eff || m.use !== undefined));
  ok(leakP.length === 0, "ข้อความ sec จากมือถือไม่มีข้อมูลเปิด");
  const states = log.filter((m) => m.type === "state");
  const voteStates = states.filter((m) => m.vote && m.phase === "vote");
  ok(voteStates.length > 0 && voteStates.every((m) => !m.vote.res), "ระหว่างโหวต สถานะบอกแค่จำนวนคนโหวต ไม่บอกคะแนน");
  const secretWords = /"(cond|eff|reff|die|x|rerolled|rrLeft|rrDone|det|votes|myVote|brkChanged)":/;
  const leakS = states.filter((m) => { const c = Object.assign({}, m); delete c.sec; delete c.rev; delete c.hpub; return secretWords.test(JSON.stringify(c)); });
  if (leakS.length) console.log("พบ", JSON.stringify(leakS[0]).match(secretWords));
  ok(states.every((m) => Object.keys(m.hpub || {}).sort().join() === "crv,kty,x,y"), "hpub มีแค่กุญแจสาธารณะ (crv, kty, x, y) ไม่มีกุญแจลับ d");
  ok(leakS.length === 0, "สถานะจากจอใหญ่ (นอกส่วนเข้ารหัส) ไม่มีกฎ เต๋า หรือผลทอย (" + states.length + " ข้อความ)");
  const early = states.filter((m) => m.rev && m.phase !== "reveal" && m.phase !== "end");
  ok(early.length === 0, "ผลทอยของทุกคน (rev) ออกเฉพาะตอนเปิดผล");
  const secOnly = states.filter((m) => m.sec && Object.keys(m.sec).length).length;
  ok(secOnly > 0 && secOnly < states.length, "ส่วนเข้ารหัสส่งเฉพาะตอนข้อมูลเปลี่ยน (" + secOnly + " จาก " + states.length + ")");
  const maxLen = Math.max.apply(null, states.map((m) => JSON.stringify(m).length));
  console.log("ขนาดข้อความสถานะใหญ่สุด " + maxLen + " ไบต์");
  ok(errors.length === 0, "ไม่มี JavaScript error" + (errors.length ? ": " + errors.slice(0, 5).join(" | ") : ""));
  await browser.close();
  console.log(fails ? "ไม่ผ่าน " + fails + " รายการ" : "ผ่านทั้งหมด");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
