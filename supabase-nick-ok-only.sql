-- เฉพาะฟังก์ชันตัวกรองชื่อเล่น _nick_ok (ตัดมาจาก supabase-nick-filter.sql บรรทัด 1–20 ไม่มีการเปลี่ยนแปลง)
-- รันใน Supabase > SQL Editor ได้ซ้ำ ไม่แตะตารางหรือระบบเช็กชื่อ
create or replace function public._nick_ok(p_nick text) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  n text := regexp_replace(lower(coalesce(p_nick, '')), '[[:space:][:punct:]]', '', 'g');
  exact_words text[] := array['หี', 'ห่า'];
  part_words text[] := array['ควย', 'เหี้ย', 'เชี่ย', 'สัส', 'แม่ง', 'เย็ด', 'ชิบหาย', 'ระยำ', 'ตอแหล', 'อีดอก', 'ไอ้สัตว์', 'ไอ้ควาย', 'ปัญญาอ่อน', 'ไอ้โง่', 'ไอ้บ้า', 'นิโกร', 'ไอ้อ้วน', 'fuck', 'shit', 'bitch', 'dick', 'pussy', 'porn', 'sex', 'เซ็กส์', 'admin', 'แอดมิน', 'ครู', 'อาจารย์'];
  w text;
begin
  if n = '' then return true; end if;
  if n = any(exact_words) then return false; end if;
  foreach w in array part_words loop
    if position(w in n) > 0 then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public._nick_ok(text) from public, anon, authenticated;
