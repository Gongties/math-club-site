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
