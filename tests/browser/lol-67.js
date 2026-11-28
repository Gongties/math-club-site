/* Browser test of The 67 Event in /logic-over-luck/: one short game per event (Host + 2 phones + 7 bots).
   The Host's ?test hook H.force67 makes phone 0 (and phone 1 for Fanum Tax) Sigma Lord after round 2 with the event in the draw.
   Every round is scored again independently from the Host's data. A spy tab checks that no secret travels unencrypted.
   Needs: python3 -m http.server 8765 at the repo root. LOL_EV=fanum,god runs only some events. */
"use strict";
const { chromium } = require("playwright");
const L = require(__dirname + "/../../logic-over-luck/engine.js");
const BASE = "http://localhost:8765/logic-over-luck/";
const EVS = (process.env.LOL_EV || "fanum,aura,cook,god,locked,delulu,brainrot,npc").split(",");
let fails = 0;
function ok(cond, msg) { console.log((cond ? "ผ่าน  " : "ไม่ผ่าน ") + msg); if (!cond) fails++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runOne(browser, ev) {
  console.log("\n===== " + ev + " =====");
  const ctx = await browser.newContext();
  await ctx.route(/cdn\.jsdelivr|fonts\.g/, (r) => r.abort());
  const errors = [];
  function watch(p, name) { p.on("pageerror", (e) => errors.push(name + ": " + e.message)); p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|net::/.test(m.text())) errors.push(name + " console: " + m.text()); }); }
  const host = await ctx.newPage(); watch(host, "host");
  await host.setViewportSize({ width: 1920, height: 1080 });
  await host.goto(BASE);
  await host.evaluate(() => { localStorage.clear(); localStorage.setItem("lol-cfg", JSON.stringify({ room: "ทดสอบ", tBuild: 4, tPick: 4, tRr: 2, tRev: 2, tVote: 3, tBreak: 3, special: 1, votePct: 50, voteCount: 0, cap: 3, crowdX: 0,
    tEv: 20, tEvVote: 20, tCook: 20, tAura: 20, tGod: 12, tGuess: 8, tNpc: 10, tLocked: 25 })); });
  await host.goto(BASE + "?test#host");
  await host.waitForFunction(() => window.H && H.code);
  const code = await host.evaluate(() => H.code);
  const spy = await ctx.newPage();
  await spy.goto(BASE + "engine.js");
  await spy.evaluate((c) => { window.LOG = []; const b = new BroadcastChannel("lol-" + c); b.onmessage = (e) => LOG.push(JSON.parse(JSON.stringify(e.data))); }, code);
  const ph = [];
  for (let i = 0; i < 2; i++) {
    const p = await ctx.newPage(); watch(p, "phone" + i);
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(BASE + "#join=" + code); await p.waitForSelector("#jn");
    await p.fill("#jn", ["แพรว", "บอส"][i]); await p.click("[data-p=join]");
    await p.waitForSelector("text=เข้าห้องแล้ว", { timeout: 15000 });
    ph.push(p);
  }
  await host.bringToFront();
  await host.evaluate(() => addBots(7));
  await host.click("[data-h=start]");
  const lordsIdx = ev === "fanum" ? [0, 1] : [0];
  await host.evaluate((a) => { H.force67 = { round: 2, idx: a[0], ev: a[1] }; }, [lordsIdx, ev]);
  const waitPh = (p, r, to) => host.waitForFunction((a) => H.phase === a[0] && (a[1] == null || H.round === a[1]), [p, r], { timeout: to || 60000 });
  const hv = (fn, arg) => host.evaluate(fn, arg);
  const END = ev === "god" || ev === "npc" || ev === "cook" ? 5 : 4;
  let prev = null, before2 = null;
  for (let t = 1; t <= END; t++) {
    /* ---- inside the round ---- */
    if (ev === "fanum" && t === 2) {   /* give the bots totals over 67 so Fanum Tax has people to tax */
      await waitPh("pick", 2);
      await hv(() => { [95, 88, 80, 76, 72, 72, 72].forEach((v, k) => { H.players[2 + k].acc = v; }); });
    }
    if (ev === "npc" && (t === 3 || t === 4)) {
      await waitPh("npc", t);
      ok(true, "รอบ " + t + " เริ่มด้วยขั้น NPC Mode");
      await ph[1].bringToFront(); await ph[1].waitForSelector("text=Sigma Lord กำลังเลือกลูกเต๋าที่คุณต้องใช้", { timeout: 10000 });
      if (t === 3) {   /* the Sigma Lord picks; round 4: lets the time run out */
        await ph[0].bringToFront(); await ph[0].waitForSelector("[data-p=npcsel]", { timeout: 10000 });
        const al = await hv(() => npcAllowed());
        const want = al.indexOf("risk") >= 0 ? "risk" : al[0];
        await ph[0].click(`[data-p=npcsel][data-v="${want}"]`); await ph[0].click("[data-p=npcgo]");
        await waitPh("pick", t);
        const r = await hv(() => ({ d: H.npcDie, pl: H.players.map((p) => [p.lord, p.die, p.npcForced]) }));
        ok(r.d === want && r.pl.every((q) => q[0] ? !q[2] : q[1] === want && q[2]), "NPC Mode: ทุกคนยกเว้น Sigma Lord ต้องใช้ " + want);
        await ph[1].bringToFront(); await ph[1].waitForSelector("text=Sigma Lord เลือกให้ทุกคนใช้", { timeout: 10000 });
        await host.screenshot({ path: "/tmp/lol67_npc_pick.png" }); await ph[1].screenshot({ path: "/tmp/lol67_npc_p1.png" });
      } else {
        await waitPh("pick", t, 30000);
        const r = await hv(() => ({ d: H.npcDie, al: npcAllowed(), pl: H.players.map((p) => [p.lord, p.die]) }));
        ok(r.al.indexOf(r.d) >= 0 && r.pl.every((q) => q[0] || q[1] === r.d), "NPC Mode ไม่เลือกทันเวลา: ระบบสุ่มเต๋าที่ใช้ได้ (" + r.d + ") ให้ทุกคนยกเว้น Sigma Lord");
      }
    }
    if (ev === "npc" && t === 5) { await waitPh("pick", 5); ok(await hv(() => H.npcDie === null), "รอบ 5 หมด NPC Mode แล้ว"); }
    if (ev === "cook" && t >= 3) {
      await waitPh("pick", t);
      const r = await hv(() => ({ now: H.cookNow, C: H.ev.cook, others: H.players.filter((p) => !p.lord).map((p) => p.pid) }));
      if (t <= 4) ok(r.now && r.now.id === r.C.id && JSON.stringify(r.now.scope) === JSON.stringify(r.others), "รอบ " + t + " มีกฎ Let Him Cook " + r.C.id + " ใช้กับทุกคนยกเว้น Sigma Lord");
      else ok(r.now === null, "รอบ 5 กฎ Let Him Cook หมดแล้ว (ใช้ 2 รอบ)");
      if (t === 3) { await ph[1].bringToFront(); await ph[1].waitForSelector("text=Let Him Cook:", { timeout: 10000 }); await host.screenshot({ path: "/tmp/lol67_cook_pick.png" }); }
    }
    if (ev === "god" && t === 3) {
      await waitPh("pick", 3);
      await ph[0].bringToFront(); await ph[0].waitForSelector("[data-p=god]", { timeout: 10000 });
      await ph[0].click("[data-p=god]"); await ph[0].click('[data-p=die][data-v="std"]');
      await ph[0].screenshot({ path: "/tmp/lol67_god_pick.png" });
      await waitPh("god", 3, 20000);
      await host.screenshot({ path: "/tmp/lol67_god_host.png" });
      await ph[1].bringToFront(); await ph[1].waitForSelector("text=Sigma Lord กำลังเลือกหน้าเต๋า", { timeout: 10000 });
      await ph[0].bringToFront(); await ph[0].waitForSelector('[data-p=face][data-v="6"]', { timeout: 10000 });
      await ph[0].screenshot({ path: "/tmp/lol67_god_face.png" });
      await ph[0].click('[data-p=face][data-v="6"]');
    }
    if (ev === "god" && t === 4) {
      await waitPh("pick", 4); await ph[0].bringToFront(); await ph[0].waitForSelector(".die", { timeout: 10000 });
      ok(await ph[0].locator("[data-p=god]").count() === 0, "ใช้ GOD MODE แล้ว รอบถัดไปไม่มีปุ่มอีก");
    }
    if (ev === "delulu" && t === 3) {
      await waitPh("pick", 3);
      await ph[1].bringToFront(); await ph[1].waitForSelector("text=ต้องทายเลขที่จะทอยได้", { timeout: 10000 });
      await waitPh("guess", 3, 20000);
      await host.screenshot({ path: "/tmp/lol67_delulu_host.png" });
      await ph[0].bringToFront(); await ph[0].waitForSelector("text=ไม่ต้องทาย", { timeout: 10000 });
      await ph[1].bringToFront(); await ph[1].waitForSelector("[data-p=guess]", { timeout: 10000 });
      const f = await ph[1].locator("[data-p=guess]").first().getAttribute("data-v");
      await ph[1].click(`[data-p=guess][data-v="${f}"]`);
      await ph[1].waitForSelector("text=✓ ทาย " + f, { timeout: 10000 });
      await ph[1].screenshot({ path: "/tmp/lol67_delulu_p1.png" });
      const g = await hv(() => H.players.map((p) => [p.lord, p.guess]));
      ok(g[1][1] === Number(f) && g[0][1] === null, "Delulu: มือถือทาย " + f + " ถึงจอใหญ่, Sigma Lord ไม่ได้ทาย");
    }
    if (ev === "brainrot" && t === 3) {
      await waitPh("pick", 3);
      ok(/Brainrot, No Cap/.test(await host.locator("#stage").innerText()), "กฎที่เปิดเผยค้างบนจอใหญ่ในรอบถัดไป");
      await host.screenshot({ path: "/tmp/lol67_brain_pick.png" });
      await host.click("[data-h=brain]");
      ok(!/Brainrot, No Cap \(กฎที่เปิดเผย/.test(await host.locator("#stage").innerText()), "กดซ่อนแล้วกฎที่เปิดเผยหายจากจอ");
      await host.click("[data-h=brain]");
      ok(/Brainrot, No Cap \(กฎที่เปิดเผย/.test(await host.locator("#stage").innerText()), "กดแสดงแล้วกลับมา");
    }
    /* ---- the reveal: score the round again from the Host's data ---- */
    await waitPh("reveal", t, 90000);
    await hv(() => HACT.pause());
    const s = await hv(() => ({ rules: rulesFor(), banned: H.banned, lucky: H.lucky, cfg: engCfg(), delulu: H.delulu,
      pl: H.players.map((p) => ({ die: p.die, x: p.x, rerolled: p.rerolled, cond: p.cond, eff: p.eff, reff: p.reff, acc0: p.acc0, acc: p.acc, aura: !!p.aura, lord: !!p.lord, guess: p.guess,
        hist: p.hist.slice(0, -1), tie: p.tie, shield: !!p.shLast, rrBlock: !!p.rrBlock, god: p.god, det: p.det })) }));
    const res = L.scoreRound({ round: t, final: t === 12, rules: s.rules, banned: s.banned, lucky: s.lucky, cfg: s.cfg, delulu: s.delulu,
      players: s.pl.map((q, k) => ({ die: q.die, x: q.x, rerolled: q.rerolled, cond: q.cond, eff: q.eff === "random" ? q.reff : q.eff, acc: q.acc0,
        prevX: prev ? prev.x[k] : null, next6: prev ? prev.n6[k] : false, aura: q.aura, lord: q.lord, guess: q.guess, hist: q.hist, tie: q.tie })) });
    ok(JSON.stringify(res.acc) === JSON.stringify(s.pl.map((q) => q.acc)), "รอบ " + t + " คิดคะแนนใหม่ตรงกับจอใหญ่" + (s.rules.length ? " (กฎ " + s.rules.map((r) => r.id + (r.scope ? "[" + r.scope.length + " คน]" : "")).join(", ") + ")" : "") + (s.delulu ? " (Delulu)" : ""));
    if (s.delulu) {
      const d = s.pl.map((q) => q.lord ? "lord" : q.guess === q.x ? "ok" : q.shield ? "shield" : -6);
      ok(s.pl.every((q, k) => q.lord ? !q.det.delulu : q.guess === q.x || q.shield ? !q.det.delulu : q.det.delulu === -6), "Delulu: ทายผิดหรือไม่ทายเสีย 6, ทายถูก/มีโล่/Sigma Lord ไม่เสีย " + JSON.stringify(d));
    }
    if (ev === "god" && t === 3) ok(s.pl[0].x === 6 && s.pl[0].rrBlock && s.pl[0].god === 2 && s.pl[0].det.god, "GOD MODE: Sigma Lord ได้ 6 ตามที่เลือก ทอยใหม่ไม่ได้ ใช้สิทธิ์แล้ว");
    if (ev === "aura" && t >= 3) ok(s.pl[0].aura && s.pl[0].shield, "รอบ " + t + " Sigma Lord มีโล่ (Aura Farming)");
    if (t === 2) before2 = s;
    prev = { x: s.pl.map((q) => q.x), n6: res.players.map((o) => o.next6Next) };
    await hv(() => HACT.pause());

    /* ---- The 67 Event after round 2 ---- */
    if (t === 2) {
      await waitPh("ev", 2, 20000);
      const E = await hv(() => ({ opts: H.ev.opts, lords: H.ev.lords, pl: H.players.map((p) => p.lord) }));
      ok(E.opts.indexOf(ev) >= 0 && L.EV_SELF.indexOf(E.opts[0]) >= 0 && L.EV_ROOM.indexOf(E.opts[1]) >= 0, "จับ Event 2 ใบ: " + E.opts.join(" / ") + " (เพื่อตัวเอง 1, ป่วนทั้งห้อง 1)");
      ok(JSON.stringify(E.pl.map((v, i) => v ? i : -1).filter((i) => i >= 0)) === JSON.stringify(lordsIdx), "Sigma Lord = " + lordsIdx.join(", "));
      if (lordsIdx.length > 1) ok(E.opts[0] !== "cook", "Sigma Lord หลายคน ไม่มี Let Him Cook");
      if (lordsIdx.length === 1) { await ph[1].bringToFront(); await ph[1].waitForSelector("text=Sigma Lord กำลังเลือก 1 Event", { timeout: 10000 }); }
      for (const i of lordsIdx) {
        const p = ph[i]; await p.bringToFront();
        await p.waitForSelector(`[data-p=evsel][data-v="${ev}"]`, { timeout: 10000 });
        if (i === 0) await p.screenshot({ path: "/tmp/lol67_" + ev + "_choose.png", fullPage: true });
        await p.click(`[data-p=evsel][data-v="${ev}"]`); await p.click("[data-p=evgo]");
        await p.waitForSelector("text=✓ เลือก", { timeout: 10000 });
        if (i === 0 && lordsIdx.length > 1) { await host.bringToFront(); await host.screenshot({ path: "/tmp/lol67_vote_host.png" }); }
      }
      if (ev === "cook") {
        await waitPh("cook", 2, 20000);
        await host.screenshot({ path: "/tmp/lol67_cook_host.png" });
        await ph[0].bringToFront(); await ph[0].waitForSelector("[data-p=cksel]", { timeout: 10000 });
        const first = await ph[0].locator("[data-p=cksel]").first().getAttribute("data-v");
        await ph[0].click(`[data-p=cksel][data-v="${first}"]`); await ph[0].click('[data-p=ckscope][data-v="others"]');
        await ph[0].screenshot({ path: "/tmp/lol67_cook_p0.png", fullPage: true });
        await ph[0].click("[data-p=ckgo]");
        await waitPh("evd", 2, 20000);
        const C = await hv(() => H.ev.cook);
        ok(C.id === first && C.scope === "others" && C.from === 3 && C.to === 4 && C.opts.length === 3 && new Set(C.opts).size === 3, "Let Him Cook: เลือก " + first + " ใช้กับคนอื่น รอบ 3–4 (ตัวเลือก " + C.opts.join(", ") + ")");
      } else await waitPh("evd", 2, 20000);
      await hv(() => HACT.pause());
      await host.screenshot({ path: "/tmp/lol67_" + ev + "_evd.png" });
      await ph[0].bringToFront(); await ph[0].screenshot({ path: "/tmp/lol67_" + ev + "_evd_p0.png", fullPage: true });
      await ph[1].bringToFront(); await ph[1].screenshot({ path: "/tmp/lol67_" + ev + "_evd_p1.png", fullPage: true });
      const D = await hv(() => ({ pick: H.ev.pick, how: H.ev.how, fanum: H.ev.fanum, fTie: H.ev.fTie, brain: H.ev.brain, acc: H.players.map((p) => p.acc), cond: H.players.map((p) => [p.cond, p.eff]), sw: H.players.map((p) => p.swapped), hist: H.players.map((p) => p.hist) }));
      ok(D.pick === ev && D.how === "pick", "Sigma Lord เลือก " + ev + " (" + D.how + ")");
      if (ev === "fanum") {
        const sh = before2.pl.map((q) => q.shield), acc2 = before2.pl.map((q) => q.acc);
        const want = L.applyFanum(acc2, lordsIdx, sh, {}, D.hist, D.fTie);
        ok(JSON.stringify(want.acc) === JSON.stringify(D.acc), "Fanum Tax: คิดใหม่ตรงกับจอใหญ่ " + JSON.stringify(D.fanum));
        const elig = acc2.filter((v, i) => v > 67 && !sh[i]).length;
        const payers = Object.keys(D.fanum).filter((k) => D.fanum[k] < 0).length;
        ok(payers === Math.min(5, elig), "Fanum Tax: มีคนเกิน 67 ที่ไม่มีโล่ " + elig + " คน จ่าย " + payers + " คน");
      }
      if (ev === "brainrot") {
        const others = D.cond.map((r, i) => i).filter((i) => lordsIdx.indexOf(i) < 0);
        const old = others.map((i) => before2.pl[i].cond + "/" + before2.pl[i].eff).sort().join(), now = others.map((i) => D.cond[i].join("/")).sort().join();
        ok(old === now && others.every((i) => D.sw[i] === 2) && D.sw[0] === 0, "Brainrot: กฎของคนที่ไม่ใช่ Sigma Lord สลับกันเอง (กฎชุดเดิมครบ) Sigma Lord ไม่ถูกสลับ");
        const pids = await hv(() => H.players.map((p) => p.pid));
        const shownI = D.brain.shown.map((r) => pids.indexOf(r.pid)), rest = others.filter((i) => shownI.indexOf(i) < 0);
        ok(D.brain.shown.length === 3 && shownI.every((i) => lordsIdx.indexOf(i) < 0 && rest.every((j) => D.acc[i] >= D.acc[j])) && D.brain.shown.every((r, k) => r.c === D.cond[shownI[k]][0] && r.e === D.cond[shownI[k]][1]),
          "Brainrot: เปิดเผยกฎใหม่ของ 3 อันดับแรกที่ไม่ใช่ Sigma Lord (คะแนนสะสม " + shownI.map((i) => D.acc[i]).join(", ") + ")");
      }
      await hv(() => HACT.pause());
      if (ev === "aura") {
        await waitPh("aura", 2, 20000);
        await ph[1].bringToFront(); await ph[1].waitForSelector("text=Sigma Lord กำลังเลือกกฎใหม่", { timeout: 10000 });
        await ph[0].bringToFront(); await ph[0].waitForSelector('[data-p=ausel][data-v="1"]', { timeout: 10000 });
        await ph[0].screenshot({ path: "/tmp/lol67_aura_p0.png", fullPage: true });
        await ph[0].click('[data-p=ausel][data-v="1"]'); await ph[0].click("[data-p=augo]");
        await host.waitForFunction(() => H.phase !== "aura", null, { timeout: 20000 });
        const A = await hv(() => ({ o: H.players[0].auraOpts, c: H.players[0].cond, e: H.players[0].eff, a: H.players[0].aura }));
        const c0 = L.buildCost(A.o[0][0], A.o[0][1]), c1 = L.buildCost(A.o[1][0], A.o[1][1]);
        ok(A.a && A.c === A.o[1][0] && A.e === A.o[1][1] && A.o[0].join() !== A.o[1].join() && c0 >= 6 && c0 <= 7 && c1 >= 6 && c1 <= 7 && A.o.every((b) => b[1] !== "shield" && b[1] !== "interest"),
          "Aura Farming: ได้โล่ เลือกกฎที่ 2 (" + A.o[1].join(" + ") + ") จาก 2 กฎไม่ซ้ำ ราคา " + c0 + "/" + c1 + " เหรียญ");
      }
      if (ev === "locked") {
        await waitPh("locked", 2, 20000);
        const old = await hv(() => H.players.slice(0, 2).map((p) => p.lockOld));
        for (let i = 0; i < 2; i++) {
          const p = ph[i]; await p.bringToFront(); await p.waitForSelector("[data-p=lock]", { timeout: 10000 });
          ok(await p.locator(`[data-p=cond][data-v="${old[i].cond}"]`).isDisabled() && await p.locator('[data-p=eff][data-v="interest"]').isDisabled(), "Locked In มือถือ " + i + ": เงื่อนไขเดิมและดอกเบี้ยทบต้นกดไม่ได้");
          const opts = L.allBuilds({ when: "locked", old: old[i], budget: i === 0 ? 6 : 5 });
          const b = i === 0 ? opts.filter((x) => L.buildCost(x[0], x[1]) === 6)[0] : opts[opts.length - 1];
          await p.click(`[data-p=cond][data-v="${b[0]}"]`); await p.click(`[data-p=eff][data-v="${b[1]}"]`);
          if (i === 0) await p.screenshot({ path: "/tmp/lol67_locked_p0.png" });
          await p.click("[data-p=lock]"); await p.waitForSelector("text=เปลี่ยนกฎแล้ว", { timeout: 10000 });
          const got = await hv((k) => [H.players[k].cond, H.players[k].eff], i);
          ok(got[0] === b[0] && got[1] === b[1], "Locked In มือถือ " + i + " ส่งกฎ " + b.join(" + ") + " (" + L.buildCost(b[0], b[1]) + " เหรียญ" + (i === 0 ? ", Sigma Lord งบ 6" : "") + ")");
        }
        await host.screenshot({ path: "/tmp/lol67_locked_host.png" });
        await host.waitForFunction(() => H.phase !== "locked", null, { timeout: 30000 });
        const r = await hv(() => H.players.map((p) => ({ o: p.lockOld, c: p.cond, e: p.eff, lord: p.lord })));
        ok(r.every((q) => q.c !== q.o.cond && q.e !== q.o.eff && q.e !== "interest" && L.buildCost(q.c, q.e) <= (q.lord ? 6 : 5)), "Locked In: ทุกคนเปลี่ยนทั้งเงื่อนไขและผล ไม่มีดอกเบี้ยทบต้น อยู่ในงบ");
      }
    }
  }
  await hv(() => { HACT.end(); HACT.end(); });
  await host.waitForFunction(() => H.phase === "end", null, { timeout: 10000 });

  const log = await spy.evaluate(() => LOG);
  const states = log.filter((m) => m.type === "state");
  const secretWords = /"(cond|eff|reff|die|x|rerolled|rrLeft|rrDone|det|votes|myVote|brkChanged|auraOpts|auraPick|guess|godX|godNow|lockOld|myEv|myNpc|npcVotes)":/;
  const leak = states.filter((m) => { const c = Object.assign({}, m); delete c.sec; delete c.rev; delete c.hpub; return secretWords.test(JSON.stringify(c)); });
  if (leak.length) console.log("พบ", JSON.stringify(leak[0]).match(secretWords));
  ok(leak.length === 0, "สถานะนอกส่วนเข้ารหัสไม่มีข้อมูลลับ (" + states.length + " ข้อความ)");
  const evStates = states.filter((m) => m.phase === "ev");
  ok(evStates.length > 0 && evStates.every((m) => !m.ev.tally), "ระหว่างเลือก Event ไม่บอกว่าใครเลือกอะไร");
  ok(errors.length === 0, "ไม่มี JavaScript error" + (errors.length ? ": " + errors.slice(0, 5).join(" | ") : ""));
  await ctx.close();

}

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  for (const ev of EVS) await runOne(browser, ev);
  await browser.close();
  console.log(fails ? "\nไม่ผ่าน " + fails + " รายการ" : "\nผ่านทั้งหมด");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
