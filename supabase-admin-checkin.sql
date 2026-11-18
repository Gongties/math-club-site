-- ครูเช็กชื่อแทนนักเรียนจากหน้าแอดมิน (วางใน Supabase > SQL Editor แล้วกด Run รันซ้ำได้)
-- ต้องรันหลัง supabase-roster.sql  ใช้ได้แม้ปิดเช็กชื่ออยู่ และไม่ต้องตอบโจทย์ก่อน
-- สัปดาห์โจทย์: เวลาตอบถูกถูกตั้งเป็น "ตอนที่ครูกดเพิ่ม" (นับเป็นลำดับหลังคนที่ตอบก่อนหน้า)
-- ชื่อเล่น: ใช้กติกาล็อกเดียวกับ submit_checkin (ถ้านักเรียนมีชื่อเล่นอยู่แล้วใช้ชื่อเดิม)
-- คืนค่า (json): { "r": "ok"|"already"|"unknown_student"|"invalid"|"bad_nick"|"forbidden", "name": ชื่อเต็ม (เมื่อ ok/already) }

create or replace function public.admin_add_checkin(
  p_pass text, p_week int, p_student text, p_nick text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  st students%rowtype;
  v_kind text;
  v_nick text := nullif(btrim(coalesce(p_nick, '')), '');
  v_name text;
  v_solved timestamptz := null;
begin
  if not _admin_ok(p_pass) then return json_build_object('r', 'forbidden'); end if;
  if p_week is null or p_week < 1 then return json_build_object('r', 'invalid'); end if;
  if p_student is null or p_student !~ '^[0-9]{5}$' then return json_build_object('r', 'invalid'); end if;
  if v_nick is not null and char_length(v_nick) > 20 then return json_build_object('r', 'invalid'); end if;
  if v_nick is not null and not _nick_ok(v_nick) then return json_build_object('r', 'bad_nick'); end if;

  select * into st from students where student_id = p_student;
  if not found then return json_build_object('r', 'unknown_student'); end if;
  v_name := btrim(st.first_name) || ' ' || btrim(st.last_name);

  select coalesce((select kind from weeks where week = p_week), 'puzzle') into v_kind;
  if v_kind = 'puzzle' then v_solved := now(); end if;

  if nullif(btrim(coalesce(st.nickname, '')), '') is not null then
    v_nick := btrim(st.nickname);
  elsif v_nick is not null then
    update students set nickname = v_nick where student_id = p_student;
  end if;

  insert into checkins (week, student_name, grade, room, number, nickname, solver_id, solved_at, student_id)
  values (p_week, v_name, st.grade, st.room, st.number, v_nick, null, v_solved, p_student);
  return json_build_object('r', 'ok', 'name', v_name);
exception when unique_violation then
  return json_build_object('r', 'already', 'name', v_name);
end $$;

grant execute on function public.admin_add_checkin(text, int, text, text) to anon, authenticated;
