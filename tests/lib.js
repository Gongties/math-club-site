// shared helpers for the browser tests (Node + Playwright + Google Chrome)
const fs = require('fs'), path = require('path');
const STUB = fs.readFileSync(path.join(__dirname, 'stub.js'), 'utf8');
exports.BASE = 'http://localhost:' + (process.env.WEB_PORT || 8765);
exports.sleep = ms => new Promise(r => setTimeout(r, ms));
exports.launch = () => require('playwright').chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
/* stub = Supabase replaced by tests/rpcserver.js (RPC on the local Postgres, no Realtime -> the games use BroadcastChannel) */
exports.ctx = async (b, w, h, opts = {}) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true, reducedMotion: opts.reduce ? 'reduce' : 'no-preference' });
  await ctx.route(/googleapis|gstatic/, r => r.abort());
  await ctx.route(/jsdelivr/, r => opts.noStub ? r.abort() : r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB }));
  return ctx;
};
let fails = 0;
exports.check = (cond, msg) => { console.log((cond ? 'ผ่าน  ' : 'ไม่ผ่าน ') + msg); if (!cond) { fails++; process.exitCode = 1; } };
exports.errors = errs => exports.check(errs.filter(e => !/ERR_FAILED/.test(e)).length === 0, 'ไม่มี JS error ' + JSON.stringify(errs.filter(e => !/ERR_FAILED/.test(e))));
