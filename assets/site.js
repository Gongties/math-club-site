/* ธีมสว่าง/มืด: จำค่าไว้ในเบราว์เซอร์ */
document.addEventListener("DOMContentLoaded", function () {
  var btn = document.getElementById("themeBtn");
  if (btn) btn.addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    var nx = cur === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", nx);
    try { localStorage.setItem("sigma-theme", nx); } catch (e) {}
  });
  /* ปุ่มกติกา: data-rule="id" สลับการแสดงกล่องกติกา */
  var rbs = document.querySelectorAll("[data-rule]");
  for (var i = 0; i < rbs.length; i++) rbs[i].addEventListener("click", function (e) {
    var b = e.currentTarget, box = document.getElementById(b.getAttribute("data-rule"));
    box.hidden = !box.hidden;
    b.textContent = box.hidden ? "กติกา ▾" : "ซ่อนกติกา ▴";
  });
});

/* ตรวจคำตอบ: เก็บเฉพาะค่าแฮช ไม่เก็บคำตอบตรง ๆ */
function sigmaHash(s) {
  var a = 0xdeadbeef, b = 0x41c6ce57;
  for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
}
function sigmaStore(key, val) {
  try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
}

/* ---------- Supabase (เช็กชื่อ/อันดับ) ---------- */
var SIGMA_SB = { url: "https://pmiwrnbpoumkpmbbylvw.supabase.co", key: "sb_publishable_XhPC1F8vvNzOt7KoaEaQKw_C_0pJksR" };
var _sbClient = null, _sbLoading = null;
function sigmaLoadSB() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve();
  if (_sbLoading) return _sbLoading;
  _sbLoading = new Promise(function (res, rej) {
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
    s.onload = function () { res(); };
    s.onerror = function () { _sbLoading = null; rej(new Error("load")); };
    document.head.appendChild(s);
  });
  return _sbLoading;
}
function sigmaRpc(name, args) {
  return sigmaLoadSB().then(function () {
    if (!_sbClient) _sbClient = window.supabase.createClient(SIGMA_SB.url, SIGMA_SB.key);
    return _sbClient.rpc(name, args || {});
  }).then(function (r) { if (r.error) throw r.error; return r.data; });
}
function sigmaSolverId() {
  var v = sigmaStore("sigma-solver");
  if (!v || v.length < 8) {
    v = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (String(Math.random()).slice(2) + Date.now());
    sigmaStore("sigma-solver", v);
  }
  return v;
}
/* เรียกเมื่อโจทย์สัปดาห์นี้ถูกตอบถูก: บันทึกเวลาถ้าเปิดเช็กชื่ออยู่ และโชว์กล่องเช็กชื่อ */
function sigmaAfterSolve(week, boxId) {
  sigmaRpc("get_state").then(function (st) {
    if (!st || !st.open || st.week !== week) return;
    return sigmaRpc("record_solve", { p_week: week, p_solver: sigmaSolverId() }).then(function () {
      var b = document.getElementById(boxId); if (b) b.hidden = false;
    });
  }).catch(function () {});
}
