/* Logic over Luck: reconnecting after a lost connection (fake Realtime tests/lol/fake-rt.js in place of Supabase).
   Needs: python3 -m http.server 8765 at the repo root. */
"use strict";
const fs = require("fs");
const { chromium } = require("playwright");
const BASE = "http://localhost:8765/logic-over-luck/";
const FAKE = fs.readFileSync(__dirname + "/../lol/fake-rt.js", "utf8");
let fails = 0;
function ok(c, m) { console.log((c ? "ผ่าน  " : "ไม่ผ่าน ") + m); if (!c) fails++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const ctx = await browser.newContext();
  await ctx.route(/fonts\.g/, (r) => r.abort());
  await ctx.route(/cdn\.jsdelivr/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: FAKE }));
  const errors = [], local = [];
  function watch(p, n) {
    p.on("pageerror", (e) => errors.push(n + ": " + e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|net::/.test(m.text())) errors.push(n + " console: " + m.text()); });
  }
  const host = await ctx.newPage(); watch(host, "host");
  await host.setViewportSize({ width: 1920, height: 1080 });
  await host.goto(BASE); await host.evaluate(() => localStorage.clear());
  await host.goto(BASE + "?test#host");
  await host.waitForFunction(() => window.H && H.code && Net.ready);
  ok(await host.evaluate(() => Net.mode === "supabase" && document.getElementById("netb").className === "ok"), "จอใหญ่ต่อ Realtime (จำลอง) ได้ ป้ายขึ้นว่าเชื่อมต่อแล้ว");
  const code = await host.evaluate(() => H.code);
  const ph = [];
  for (let i = 0; i < 2; i++) {
    const p = await ctx.newPage(); watch(p, "phone" + i);
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(BASE + "#join=" + code); await p.waitForSelector("#jn");
    ph.push(p);
  }
  /* 1) no network when joining: keeps trying (no test mode), joins once the network is back */
  await ph[1].evaluate(() => FAKE_RT.setDown(true));
  for (let i = 0; i < 2; i++) { await ph[i].fill("#jn", ["แพรว", "บอส"][i]); await ph[i].click("[data-p=join]"); }
  await ph[0].waitForSelector("text=เข้าห้องแล้ว", { timeout: 15000 });
  await sleep(4000);
  const s1 = await ph[1].evaluate(() => ({ joined: P.joined, mode: Net.mode, cls: document.getElementById("netb").className, err: P.err, txt: document.getElementById("netb").textContent }));
  ok(!s1.joined && s1.mode === "supabase" && s1.cls === "bad" && !s1.err, "ไม่มีเน็ตตอนเข้าห้อง: ไม่ตกไปโหมดทดสอบ ขึ้น \"" + s1.txt + "\" และยังไม่ขึ้นว่าไม่พบห้อง");
  await ph[1].evaluate(() => FAKE_RT.setDown(false));
  await ph[1].waitForSelector("text=เข้าห้องแล้ว", { timeout: 20000 });
  ok(true, "เน็ตกลับมา: ต่อใหม่เองแล้วเข้าห้องได้");

  await host.bringToFront();
  await host.evaluate(() => { addBots(3); H.cfg.tBuild = 4; H.cfg.tPick = 14; H.cfg.tRr = 3; H.cfg.tRev = 3; HACT.start(); H.evDone = true; });
  /* 2) the phone loses the network in the middle of picking: its pick waits, then arrives after reconnecting */
  await host.waitForFunction(() => H.phase === "pick" && H.round === 1, null, { timeout: 30000 });
  await ph[0].bringToFront(); await ph[0].waitForSelector("[data-p=die]", { timeout: 10000 });
  const g0 = await ph[0].evaluate(() => Net.gen);
  await ph[0].evaluate(() => FAKE_RT.setDown(true));
  await ph[0].click('[data-p=die][data-v="risk"]');
  await sleep(3000);
  ok(await host.evaluate(() => H.players[0].die === null), "ระหว่างหลุด จอใหญ่ยังไม่ได้เต๋าที่มือถือเลือก");
  ok(await ph[0].evaluate(() => document.getElementById("netb").textContent.includes("ขาดการเชื่อมต่อ")), "มือถือขึ้นป้าย \"ขาดการเชื่อมต่อ กำลังลองใหม่\"");
  await ph[0].evaluate(() => FAKE_RT.setDown(false));
  await host.waitForFunction(() => H.players[0].die === "risk", null, { timeout: 20000 });
  ok(await ph[0].evaluate((g) => Net.gen > g && Net.ready, g0), "เน็ตกลับมา: มือถือต่อใหม่ แล้วเต๋าที่เลือกไว้ถึงจอใหญ่ (เต๋าเสี่ยงสูง)");

  /* 3) dead connection without any error (phone slept): 12 s of silence -> reconnects by itself */
  await host.waitForFunction(() => H.phase === "reveal" && H.round === 1, null, { timeout: 40000 });
  await host.evaluate(() => HACT.pause());
  const g1 = await ph[1].evaluate(() => Net.gen);
  await ph[1].evaluate(() => FAKE_RT.setSilent(true));
  await sleep(9000);
  ok(await ph[1].evaluate((g) => Net.gen === g, g1), "เงียบ 9 วินาที: ยังไม่ต่อใหม่ (จอใหญ่ส่งทุก 3 วินาที รอให้แน่ใจก่อน)");
  await ph[1].evaluate(() => FAKE_RT.setSilent(false));
  await ph[1].evaluate(() => { FAKE_RT.setSilent(true); });
  await sleep(8000);
  const k = await ph[1].evaluate((g) => (Net.gen - g) / 2, g1);   /* each reconnect raises the generation twice (close + open) */
  ok(k >= 1, "เงียบเกิน 12 วินาที: มือถือต่อใหม่เอง (" + k + " ครั้ง)");
  await ph[1].evaluate(() => FAKE_RT.setSilent(false));
  await ph[1].waitForFunction(() => Date.now() - P.recvAt < 4000, null, { timeout: 15000 });
  ok(true, "ต่อใหม่แล้วได้สถานะจากจอใหญ่อีกครั้ง");

  /* 4) back on screen after sleeping: reconnects right away when nothing came for 6 s */
  const g2 = await ph[0].evaluate(() => Net.gen);
  await ph[0].evaluate(() => FAKE_RT.setSilent(true));
  await sleep(7000);
  await ph[0].evaluate(() => { FAKE_RT.setSilent(false); document.dispatchEvent(new Event("visibilitychange")); });
  ok(await ph[0].evaluate((g) => Net.gen > g, g2), "กลับมาเปิดจอหลังเงียบเกิน 6 วินาที: ต่อใหม่ทันที");
  const g3 = await ph[1].evaluate(() => Net.gen);
  await ph[1].evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  ok(await ph[1].evaluate((g) => Net.gen === g, g3), "กลับมาเปิดจอตอนที่ยังได้ข้อมูลปกติ: ไม่ต่อใหม่โดยไม่จำเป็น");

  /* 5) the Host loses the network: retries, then the game goes on and the phones get their secret part again */
  await host.evaluate(() => { FAKE_RT.setDown(true); });
  await sleep(5000);
  ok(await host.evaluate(() => !Net.ready && Net.mode === "supabase" && document.getElementById("netb").className === "bad"), "จอใหญ่หลุด: ลองใหม่เรื่อย ๆ ไม่ตกไปโหมดทดสอบ");
  await host.evaluate(() => { FAKE_RT.setDown(false); });
  await host.waitForFunction(() => Net.ready, null, { timeout: 20000 });
  await host.evaluate(() => HACT.pause());
  await host.waitForFunction(() => H.phase === "pick" && H.round === 2, null, { timeout: 30000 });
  for (let i = 0; i < 2; i++) await ph[i].waitForFunction(() => P.st && P.st.phase === "pick" && P.st.round === 2 && P.priv && P.priv.cond, null, { timeout: 15000 });
  ok(true, "จอใหญ่ต่อใหม่แล้วเกมเดินต่อ มือถือทั้ง 2 เครื่องได้รอบ 2 พร้อมกฎของตัวเอง");
  for (let i = 0; i < 2; i++) { await ph[i].bringToFront(); await ph[i].click('[data-p=die][data-v="con"]'); }
  await host.waitForFunction(() => H.phase === "reveal" && H.round === 2, null, { timeout: 40000 });
  ok(await host.evaluate(() => H.players[0].prevDie === "con" && H.players[1].prevDie === "con"), "รอบ 2 เลือกเต๋าจากมือถือได้ตามปกติ");
  const cls = [];
  for (const p of [host].concat(ph)) cls.push(await p.evaluate(() => document.getElementById("netb").className));
  ok(cls.every((c) => c === "ok"), "ทุกหน้ากลับมาเชื่อมต่อแล้ว " + cls.join(","));
  ok(errors.length === 0, "ไม่มี JavaScript error" + (errors.length ? ": " + errors.slice(0, 5).join(" | ") : ""));
  await browser.close();
  console.log(fails ? "ไม่ผ่าน " + fails + " รายการ" : "ผ่านทั้งหมด");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
