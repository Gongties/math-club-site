#!/usr/bin/env python3
"""เมนูด้านบน (nav) และ footer ของเว็บชมรม เก็บไว้ที่ไฟล์นี้ที่เดียว

วิธีใช้ (Claude เป็นคนรัน ผู้ใช้ไม่ต้องทำเอง):
  python3 tools/layout.py          เขียนเมนูและ footer ลงทุกหน้าในรายการ PAGES ให้ตรงกับแม่แบบด้านล่าง
  python3 tools/layout.py --check  ตรวจอย่างเดียว ถ้ามีหน้าไหนไม่ตรงแม่แบบจะบอกชื่อหน้าและจบด้วย exit code 1

อยากแก้เมนูหรือ footer: แก้ NAV หรือ FOOT ด้านล่าง แล้วรัน python3 tools/layout.py แล้วตรวจผลก่อน push
เพิ่มหน้าใหม่ที่มีเมนู: ใส่ชื่อไฟล์ใน PAGES พร้อมลิงก์เมนูที่ต้องขีดเส้นใต้ (หรือ None)
ในหน้า HTML เมนูอยู่ระหว่าง <!--nav--> กับ <!--/nav--> และ footer อยู่ระหว่าง <!--foot--> กับ <!--/foot-->
(ครั้งแรกที่รัน สคริปต์ใส่เครื่องหมายเหล่านี้ให้เอง) หน้าเว็บที่ผู้ใช้เห็นไม่เปลี่ยน
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ลิงก์ในเมนู (ลำดับตามที่แสดง)
LINKS = [("/", "หน้าแรก"), ("/puzzles/", "โจทย์ประจำสัปดาห์"), ("/games/", "เกม"), ("/leaderboard/", "อันดับ")]

NAV_HEAD = '<div class="wrap"><div class="nav"><a class="logo" href="/"><span class="sig" aria-hidden="true">Σ</span><b>67 Math Problems<br>with Sigma Boys</b></a><div class="links">'
NAV_TAIL = ('<button class="tg" id="themeBtn" type="button" aria-label="สลับโหมดมืดและสว่าง"><span class="to-light"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7"/></svg>โหมดสว่าง</span>'
            '<span class="to-dark"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z"/></svg>โหมดมืด</span></button></div></div></div>')

CLUB = "67 Math Problems with Sigma Boys"
FOOT = '<div class="foot"><div class="wrap"><span class="pf" style="font-weight:700">' + CLUB + '</span><span>' + CLUB.upper() + '</span></div></div>'
FOOT_MONO = '<div class="foot"><div class="wrap mono"><span>' + CLUB + '</span><span>' + CLUB.upper() + '</span></div></div>'   # หน้าเจาะรหัสลับ (ธีมแฮกเกอร์)

# หน้า -> (ลิงก์เมนูที่ขีดเส้นใต้ หรือ None, มีเมนูไหม, แบบ footer)
PAGES = {
    "index.html": ("/", True, FOOT),
    "puzzles/index.html": ("/puzzles/", True, FOOT),
    "games/index.html": ("/games/", True, FOOT),
    "leaderboard/index.html": ("/leaderboard/", True, FOOT),
    "myscore/index.html": ("/leaderboard/", True, FOOT),
    "halloffame/index.html": ("/leaderboard/", True, FOOT),
    "checkin/index.html": ("/puzzles/", True, FOOT),
    "admin/index.html": (None, True, FOOT),
    "week/1/index.html": ("/puzzles/", True, FOOT),
    "week/2/index.html": (None, False, FOOT_MONO),   # หน้านี้มีหัวเว็บธีมแฮกเกอร์ของตัวเอง จึงมีแค่ footer
}

def nav(active):
    return NAV_HEAD + "".join('<a class="nl%s" href="%s">%s</a>' % (" on" if href == active else "", href, label) for href, label in LINKS) + NAV_TAIL

NAV_RE = re.compile(r'(?:<!--nav-->)?<div class="wrap"><div class="nav">.*?</button></div></div></div>(?:<!--/nav-->)?', re.S)
FOOT_RE = re.compile(r'(?:<!--foot-->)?<div class="foot">.*?</div></div>(?:<!--/foot-->)?', re.S)

def build(src, active, has_nav, foot):
    out = src
    if has_nav:
        if len(NAV_RE.findall(out)) != 1: raise ValueError("หาเมนูไม่เจอ หรือเจอมากกว่า 1 ที่")
        out = NAV_RE.sub(lambda m: "<!--nav-->" + nav(active) + "<!--/nav-->", out)
    if len(FOOT_RE.findall(out)) != 1: raise ValueError("หา footer ไม่เจอ หรือเจอมากกว่า 1 ที่")
    out = FOOT_RE.sub(lambda m: "<!--foot-->" + foot + "<!--/foot-->", out)
    return out

def main():
    check = "--check" in sys.argv
    bad = []
    for rel, (active, has_nav, foot) in PAGES.items():
        path = os.path.join(ROOT, rel)
        src = open(path, encoding="utf-8").read()
        try:
            out = build(src, active, has_nav, foot)
        except ValueError as e:
            bad.append(rel + ": " + str(e)); continue
        if out != src:
            if check: bad.append(rel + ": ไม่ตรงแม่แบบ")
            else:
                open(path, "w", encoding="utf-8").write(out); print("เขียนใหม่:", rel)
    if bad:
        print("\n".join(bad)); sys.exit(1)
    print("ตรวจแล้ว: ทุกหน้าตรงแม่แบบ" if check else "เสร็จ")

if __name__ == "__main__":
    main()
