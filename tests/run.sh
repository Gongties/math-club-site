#!/usr/bin/env bash
# รันการทดสอบทั้งหมดในเครื่องทดสอบ (sandbox ของแชท) ไม่แตะ Supabase จริงและเว็บจริง
# ต้องมี: Postgres 16 (/usr/lib/postgresql/16/bin), psql, Node + playwright, Google Chrome, Python 3 (+ opencv ถ้าจะถอด QR)
# ใช้: bash tests/run.sh   (จากรากของ repo)  ผลลัพธ์: บรรทัด "ผ่าน" / "ไม่ผ่าน" แล้วสรุปท้ายสุด
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
export PGPORT=${PGPORT:-5499} WEB_PORT=${WEB_PORT:-8765} RPC_PORT=8766
PGBIN=/usr/lib/postgresql/16/bin; DATA=/tmp/sigma-test-pg; FAIL=0
note() { echo; echo "== $*"; }
# 1) Postgres ชั่วคราว (รันด้วยผู้ใช้ที่ไม่ใช่ root)
note "เตรียมฐานข้อมูลทดสอบ"
id pgtest >/dev/null 2>&1 || useradd -m pgtest
su pgtest -c "$PGBIN/pg_ctl -D $DATA stop -m fast" >/dev/null 2>&1; rm -rf "$DATA"
su pgtest -c "$PGBIN/initdb -D $DATA -U postgres -A trust >/dev/null && $PGBIN/pg_ctl -D $DATA -o '-p $PGPORT -k /tmp' -l /tmp/sigma-test-pg.log start >/dev/null"; sleep 2
for i in 1 2 3 4 5; do pg_isready -h /tmp -p "$PGPORT" >/dev/null 2>&1 && break; sleep 1; done
pg_isready -h /tmp -p "$PGPORT" >/dev/null 2>&1 || { echo "ไม่ผ่าน เปิด Postgres ทดสอบไม่ได้ (พอร์ต $PGPORT ถูกใช้อยู่?)"; exit 1; }
P="psql -h /tmp -p $PGPORT -U postgres -q -v ON_ERROR_STOP=1"
for f in tests/sql/00-base.sql supabase-nick-ok-only.sql supabase-admin-delete.sql supabase-roster.sql supabase-admin-checkin.sql supabase-tied-ranks.sql supabase-game-results.sql tests/sql/01-admin-base.sql supabase-weekly.sql supabase-weekly.sql tests/sql/90-sample-data.sql tests/sql/95-checks.sql; do
  $P -f "$f" >/dev/null 2>/tmp/sql-err.txt || { echo "ไม่ผ่าน SQL $f"; cat /tmp/sql-err.txt; FAIL=1; }
done
grep -q "SQL checks: ผ่านทั้งหมด" /tmp/sql-err.txt && echo "ผ่าน  SQL checks (คะแนนรายสัปดาห์ คะแนนของฉัน การส่งผล Calcu และรันไฟล์ซ้ำได้)"
$P -c "grant usage on schema public to anon; select admin_set('testpass', true, 5, 'game');" >/dev/null
# 2) เว็บและตัวแทน Supabase
note "เปิดเว็บในเครื่อง"
(python3 -m http.server "$WEB_PORT" >/tmp/sigma-http.log 2>&1 &) ; (node tests/rpcserver.js >/tmp/sigma-rpc.log 2>&1 &) ; sleep 1
# 3) หน้าเว็บและเกม
for t in site-pages calcu-submit calcu-round calcu-head lol-submit; do note "browser/$t"; node "tests/browser/$t.js" || FAIL=1; done
if python3 -c "import cv2" 2>/dev/null; then
  got=$(python3 -c "import cv2;print(cv2.QRCodeDetector().detectAndDecode(cv2.imread('/tmp/mm_qr.png'))[0])"); want="http://localhost:$WEB_PORT/mathmory/#join=$(cat /tmp/mm_code.txt)"
  [ "$got" = "$want" ] && echo "ผ่าน  QR ล็อบบี้ Mathmory ถอดได้ $got" || { echo "ไม่ผ่าน QR ได้ '$got'"; FAIL=1; }
fi
# 4) ขึ้นปีการศึกษาใหม่ (เปลี่ยนรายชื่อ จึงรันหลังการทดสอบหน้าเว็บ)
note "ขึ้นปีการศึกษาใหม่"
{ $P -f supabase-new-year.sql >/dev/null && $P -f supabase-new-year.sql >/dev/null && $P -f tests/sql/96-new-year.sql >/dev/null 2>/tmp/ny.txt; } 2>>/tmp/ny.txt
grep -q "new-year checks: ผ่านทั้งหมด" /tmp/ny.txt && echo "ผ่าน  ขึ้นปีใหม่: ศิษย์เก่า สลับเลขที่ ผูกแถวเก่า คะแนนเดิมไม่หาย ข้อมูลซ้ำถูกปฏิเสธ" || { echo "ไม่ผ่าน ขึ้นปีใหม่"; cat /tmp/ny.txt; FAIL=1; }
# 5) ตรวจไฟล์
note "ตรวจไฟล์"
python3 tools/layout.py --check || FAIL=1
n=$(grep -rln $'\xc2\xb7' --include=*.html --include=*.js --include=*.sql --include=*.css --include=*.md . | grep -v "^./factor/index.html$" | wc -l)
[ "$n" = "0" ] && echo "ผ่าน  ไม่มีเครื่องหมายจุดกลาง (ยกเว้น normIn ใน factor)" || { echo "ไม่ผ่าน มีจุดกลางใน $n ไฟล์"; FAIL=1; }
for f in calcu mathmory factor; do node -e "const h=require('fs').readFileSync('$f/index.html','utf8');[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m=>new Function(m[1]))" && echo "ผ่าน  สคริปต์ $f ไม่มี syntax error" || FAIL=1; done
pkill -f "http.server $WEB_PORT" ; pkill -f tests/rpcserver.js ; su pgtest -c "$PGBIN/pg_ctl -D $DATA stop -m fast" >/dev/null 2>&1
echo; [ $FAIL = 0 ] && echo "สรุป: ผ่านทั้งหมด" || echo "สรุป: มีรายการไม่ผ่าน ดูด้านบน"; exit $FAIL
