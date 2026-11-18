-- ตัวกรองชื่อเล่นไม่เหมาะสม (วางใน Supabase > SQL Editor แล้วกด Run รันซ้ำได้)
-- ต้องรันหลังจากรัน supabase-checkin.sql แล้ว  รายคำต้องตรงกับ sigmaBadNick ใน assets/site.js
-- แก้รายคำ: เพิ่ม/ลบใน array ด้านล่างทั้งในไฟล์นี้และใน assets/site.js

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

create or replace function public.submit_checkin(
  p_week int, p_name text, p_grade int, p_room int, p_no int, p_nick text, p_solver text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  s settings%rowtype;
  v_kind text;
  v_name text := btrim(coalesce(p_name, ''));
  v_nick text := nullif(btrim(coalesce(p_nick, '')), '');
  v_solved timestamptz;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 80 then return 'invalid'; end if;
  if v_nick is not null and char_length(v_nick) > 20 then return 'invalid'; end if;
  if v_nick is not null and not _nick_ok(v_nick) then return 'bad_nick'; end if;
  if p_grade is null or p_grade not between 1 and 6 then return 'invalid'; end if;
  if p_room is null or p_room not between 1 and 30 then return 'invalid'; end if;
  if p_no is null or p_no not between 1 and 99 then return 'invalid'; end if;

  select * into s from settings where id = 1;
  if not s.checkin_open or p_week is distinct from s.current_week then return 'closed'; end if;

  select coalesce((select kind from weeks where week = p_week), 'puzzle') into v_kind;
  if v_kind = 'puzzle' then
    select solved_at into v_solved from solves where week = p_week and solver_id = p_solver;
    if v_solved is null then return 'not_solved'; end if;
  end if;

  insert into checkins (week, student_name, grade, room, number, nickname, solver_id, solved_at)
  values (p_week, v_name, p_grade, p_room, p_no, v_nick, p_solver, v_solved);
  return 'ok';
exception when unique_violation then
  return 'already';
end $$;
