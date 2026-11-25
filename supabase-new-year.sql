-- ขึ้นปีการศึกษาใหม่: นำเข้ารายชื่อสมาชิกปีใหม่ทับรายชื่อเดิม (จับคู่ด้วยเลขประจำตัว) คนที่ไม่อยู่ในรายชื่อใหม่เป็นศิษย์เก่า
-- (ไฟล์นี้ไม่มีรายชื่อนักเรียน ห้ามเอาชื่อจริงขึ้น GitHub)
--
-- ขั้นตอน (ทำตอนขึ้นปีใหม่ หรือตอนรายชื่อสมาชิกเปลี่ยนทั้งชุด):
--   0) สำรองก่อน: Supabase > Table Editor > students และ checkins > Export CSV เก็บไว้
--   1) SQL Editor: วางไฟล์นี้ทั้งไฟล์แล้วกด Run (รันซ้ำได้ ไฟล์นี้ยังไม่เปลี่ยนรายชื่อ แค่เตรียมระบบ)
--      ต้องรันหลัง supabase-weekly.sql และถ้ารันไฟล์ SQL เก่าซ้ำภายหลัง ให้รันไฟล์นี้อีกครั้ง (ฟังก์ชันเช็กชื่อจะกลับไปรับศิษย์เก่า)
--   2) Table Editor > students_import > Insert > Import data from CSV
--      คอลัมน์: student_id, first_name, last_name, grade, room, number, nickname (nickname เว้นว่างได้ = ใช้ชื่อเล่นเดิม)
--      ใส่ทุกคนที่เป็นสมาชิกปีใหม่ ทั้งคนเก่าที่อยู่ต่อ (เลขประจำตัวเดิม ชั้น ห้อง เลขที่ใหม่) และคนใหม่
--   3) SQL Editor: select apply_new_roster();
--      ได้ข้อความสรุป เช่น "อัปเดต 20 คน เพิ่มใหม่ 15 คน ย้ายเป็นศิษย์เก่า 4 คน"
--      ถ้าข้อมูลผิด (เลขซ้ำ ชั้นห้องเลขที่ซ้ำ ช่องว่าง) ระบบหยุดและไม่เปลี่ยนอะไร แก้ students_import แล้วรันข้อ 3 ใหม่
--
-- ศิษย์เก่า (students.alumni = true): ช่องชั้น ห้อง เลขที่ถูกล้าง เพื่อไม่ให้ชนกับนักเรียนใหม่
--   คะแนนเก่ายังอยู่บนกระดานอันดับด้วยชื่อเล่นเดิม และหน้าคะแนนของฉันยังค้นเจอ
--   เช็กชื่อ เล่นเกมแบบนับคะแนน และค้นชื่อในหน้าเช็กชื่อไม่ได้ (ขึ้นว่าไม่พบ) และไม่ขึ้นในตารางการเข้าร่วมของหน้าแอดมิน
--   ถ้าศิษย์เก่ากลับมาเป็นสมาชิก ใส่ชื่อใน students_import รอบถัดไป ระบบจะคืนสถานะให้

alter table public.students add column if not exists alumni boolean not null default false;
alter table public.students alter column grade drop not null;
alter table public.students alter column room drop not null;
alter table public.students alter column number drop not null;

create table if not exists public.students_import (
  student_id text, first_name text, last_name text, grade smallint, room smallint, number smallint, nickname text
);
alter table public.students_import enable row level security;
revoke all on public.students_import from anon, authenticated;

-- ฟังก์ชันที่ต้องไม่รับศิษย์เก่า (เหมือนเดิมทุกอย่าง เพิ่มแค่เงื่อนไข not alumni)
create or replace function public.lookup_student(p_id text) returns json
language plpgsql stable security definer set search_path = public as $$
declare s students%rowtype; ln text;
begin
  if p_id is null or p_id !~ '^[0-9]{5}$' then return json_build_object('found', false); end if;
  select * into s from students where student_id = p_id and not alumni;   -- ศิษย์เก่า = ไม่พบ
  if not found then return json_build_object('found', false); end if;
  ln := btrim(s.last_name);
  -- นามสกุลที่ขึ้นต้นด้วยสระนำ (เ แ โ ใ ไ) เอา 2 ตัวอักษร ไม่งั้นเหลือแค่สระ
  ln := left(ln, case when left(ln, 1) in ('เ', 'แ', 'โ', 'ใ', 'ไ') then 2 else 1 end) || '…';
  return json_build_object('found', true, 'name', btrim(s.first_name) || ' ' || ln,
                           'grade', s.grade, 'room', s.room, 'number', s.number);
end $$;

create or replace function public.submit_checkin(
  p_week int, p_student text, p_nick text, p_solver text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  s settings%rowtype;
  st students%rowtype;
  v_kind text;
  v_nick text := nullif(btrim(coalesce(p_nick, '')), '');
  v_solved timestamptz;
begin
  if p_student is null or p_student !~ '^[0-9]{5}$' then return 'invalid'; end if;
  if v_nick is not null and char_length(v_nick) > 20 then return 'invalid'; end if;
  if v_nick is not null and not _nick_ok(v_nick) then return 'bad_nick'; end if;

  select * into st from students where student_id = p_student and not alumni;   -- ศิษย์เก่าเช็กชื่อไม่ได้
  if not found then return 'unknown_student'; end if;

  select * into s from settings where id = 1;
  if not s.checkin_open or p_week is distinct from s.current_week then return 'closed'; end if;

  select coalesce((select kind from weeks where week = p_week), 'puzzle') into v_kind;
  if v_kind = 'puzzle' then
    select solved_at into v_solved from solves where week = p_week and solver_id = p_solver;
    if v_solved is null then return 'not_solved'; end if;
  end if;

  if v_nick is not null then
    update students set nickname = v_nick where student_id = p_student;
  else
    v_nick := nullif(btrim(coalesce(st.nickname, '')), '');
  end if;

  insert into checkins (week, student_name, grade, room, number, nickname, solver_id, solved_at, student_id)
  values (p_week, btrim(st.first_name) || ' ' || btrim(st.last_name), st.grade, st.room, st.number,
          v_nick, p_solver, v_solved, p_student);
  return 'ok';
exception when unique_violation then
  return 'already';  -- การเปลี่ยนแปลงทั้งหมดในฟังก์ชัน (รวมการเปลี่ยนชื่อเล่น) ถูกย้อนกลับ
end $$;

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

  select * into st from students where student_id = p_student and not alumni;
  if not found then return json_build_object('r', 'unknown_student'); end if;
  v_name := btrim(st.first_name) || ' ' || btrim(st.last_name);

  select coalesce((select kind from weeks where week = p_week), 'puzzle') into v_kind;
  if v_kind = 'puzzle' then v_solved := now(); end if;

  if v_nick is not null then
    update students set nickname = v_nick where student_id = p_student;
  else
    v_nick := nullif(btrim(coalesce(st.nickname, '')), '');
  end if;

  insert into checkins (week, student_name, grade, room, number, nickname, solver_id, solved_at, student_id)
  values (p_week, v_name, st.grade, st.room, st.number, v_nick, null, v_solved, p_student);
  return json_build_object('r', 'ok', 'name', v_name);
exception when unique_violation then
  return json_build_object('r', 'already', 'name', v_name);
end $$;

create or replace function public.admin_submit_game(p_pass text, p_week int, p_run text, p_items jsonb)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
  v_run text := btrim(coalesce(p_run, ''));
  it jsonb;
  sid text;
  v_score numeric;
  v_place int;
  v_nick text;
  st students%rowtype;
  v_id bigint;
  v_saved int := 0;
  v_invalid int := 0;
  v_bad_nick int := 0;
  v_unknown text[] := '{}';
  v_rounds int;
begin
  if not _admin_ok(p_pass) then return json_build_object('r', 'forbidden'); end if;
  if p_week is null or p_week < 1 or v_run = '' or char_length(v_run) > 60
     or p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 300 then
    return json_build_object('r', 'invalid');
  end if;

  select kind into v_kind from weeks where week = p_week;
  if v_kind is distinct from 'game' then return json_build_object('r', 'not_game_week'); end if;

  -- อันดับที่ครูกรอกเองในหน้าแอดมิน (คนที่ยังไม่มีผลจากเกม) ห้ามเขียนทับ
  if exists (
    select 1 from game_ranks gr join checkins c on c.id = gr.checkin_id
    where gr.week = p_week
      and not exists (select 1 from game_results r where r.week = p_week and r.student_id = c.student_id)
  ) then
    return json_build_object('r', 'has_manual_ranks');
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    sid := it ->> 'student_id';
    begin v_score := (it ->> 'score')::numeric; exception when others then v_score := null; end;
    v_place := null;
    if it ? 'place' and jsonb_typeof(it -> 'place') <> 'null' then
      begin v_place := (it ->> 'place')::int; exception when others then v_place := -1; end;
      if v_place is null or v_place < 1 or v_place > 1000 then v_invalid := v_invalid + 1; continue; end if;
    end if;
    if sid is null or sid !~ '^[0-9]{5}$' or v_score is null or v_score < -100000 or v_score > 100000 then
      v_invalid := v_invalid + 1; continue;
    end if;

    select * into st from students where student_id = sid and not alumni;   -- ศิษย์เก่าไม่นับ (ขึ้นในรายการไม่พบ)
    if not found then v_unknown := v_unknown || sid; continue; end if;

    v_nick := nullif(btrim(coalesce(it ->> 'nick', '')), '');
    if v_nick is not null and (char_length(v_nick) > 20 or not _nick_ok(v_nick)) then
      v_nick := null; v_bad_nick := v_bad_nick + 1;
    end if;

    -- เช็กชื่อให้ (ถ้ามีแถวของสัปดาห์นี้อยู่แล้วใช้แถวเดิม)
    insert into checkins (week, student_name, grade, room, number, nickname, solver_id, solved_at, student_id)
    values (p_week, btrim(st.first_name) || ' ' || btrim(st.last_name), st.grade, st.room, st.number, v_nick, null, null, sid)
    on conflict do nothing;
    select id into v_id from checkins where week = p_week and student_id = sid;
    if v_id is null then   -- แถวเก่าที่ไม่มีเลขประจำตัวแต่ชั้น/ห้อง/เลขที่ตรงกัน
      update checkins set student_id = sid
      where id = (select id from checkins where week = p_week and grade = st.grade and room = st.room
                  and number = st.number and student_id is null limit 1)
      returning id into v_id;
    end if;
    if v_id is null then v_invalid := v_invalid + 1; continue; end if;

    if v_nick is not null then
      update checkins set nickname = v_nick where id = v_id;
      update students set nickname = v_nick where student_id = sid;
    end if;

    insert into game_results (week, student_id, run_id, score, place) values (p_week, sid, v_run, v_score, v_place)
    on conflict (week, student_id, run_id) do update set score = excluded.score, place = excluded.place;
    v_saved := v_saved + 1;
  end loop;

  if v_saved > 0 then
    -- อันดับของสัปดาห์: ในแต่ละรอบจัดอันดับตามลำดับที่เกมส่งมา (place) ถ้าไม่มีใช้คะแนนในเกม แปลงเป็นคะแนนชมรม (อันดับ 1 = 10, อื่น ๆ = max(1, 10 - อันดับ))
    -- แล้วรวมคะแนนชมรมของทุกรอบ จัดอันดับสัปดาห์จากผลรวมนี้ (เท่ากันได้อันดับร่วม) รอบที่ไม่ได้เล่นได้ 0 ของรอบนั้น
    delete from game_ranks where week = p_week;
    insert into game_ranks (week, rank, checkin_id)
    select p_week, (rank() over (order by t.total desc))::int, c.id
    from (
      select student_id, sum(case when r = 1 then 10 else greatest(1, 10 - r) end) as total
      from (
        select student_id, rank() over (partition by run_id order by coalesce(place::numeric, -score)) as r
        from game_results where week = p_week
      ) x group by student_id
    ) t
    join checkins c on c.week = p_week and c.student_id = t.student_id;
  end if;

  select count(distinct run_id) into v_rounds from game_results where week = p_week;
  return json_build_object('r', 'ok', 'saved', v_saved, 'rounds', v_rounds,
                           'unknown', to_json(v_unknown), 'invalid', v_invalid, 'bad_nick', v_bad_nick);
end $$;

create or replace function public.my_scores(p_id text) returns json
language plpgsql stable security definer set search_path = public as $$
declare me record; v_rank int; v_of int;
begin
  if p_id is null or p_id !~ '^[0-9]{5}$' then return json_build_object('found', false); end if;
  if not exists (select 1 from students where student_id = p_id) then return json_build_object('found', false); end if;
  select * into me from public._club_people() where pkey = p_id;
  select count(*) into v_of from public._club_people() where nick is not null;
  if me.pkey is not null and me.nick is not null then
    select 1 + count(*) into v_rank from public._club_people() where nick is not null and points > me.points;
  end if;
  return json_build_object('found', true,
    'points', coalesce(me.points, 0), 'rank', v_rank, 'of', v_of,
    'on_board', me.nick is not null,
    'alumni', (select alumni from students where student_id = p_id),
    'weeks', public._club_weeks(),
    'by', coalesce(me.wk, '[]'::json));
end $$;

create or replace function public.admin_attendance(p_pass text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _admin_ok(p_pass) then return null; end if;
  return json_build_object(
    'weeks', public._club_weeks(),
    'rows', (
      select coalesce(json_agg(json_build_object(
        'sid', t.sid, 'name', t.name, 'grade', t.grade, 'room', t.room, 'number', t.num,
        'nick', t.nick, 'points', t.points, 'by', t.wk) order by t.grade, t.room, t.num, t.name), '[]'::json)
      from (
        select s.student_id as sid, btrim(s.first_name) || ' ' || btrim(s.last_name) as name,
               s.grade, s.room, s.number as num,
               coalesce(cp.nick, nullif(btrim(s.nickname), '')) as nick,
               coalesce(cp.points, 0) as points, coalesce(cp.wk, '[]'::json) as wk
        from students s left join public._club_people() cp on cp.pkey = s.student_id
        where not s.alumni
        union all
        select null, x.cname, x.grade, x.room, x.num, cp.nick, cp.points, cp.wk
        from public._club_people() cp
        join lateral (select cname, grade, room, num from public._club_points() z where z.pkey = cp.pkey
                      order by z.created_at desc limit 1) x on true
        where cp.pkey not in (select student_id from students)
      ) t
    )
  );
end $$;

-- ใช้รายชื่อปีใหม่ (รันจาก SQL Editor เท่านั้น เว็บเรียกไม่ได้)
create or replace function public.apply_new_roster() returns text
language plpgsql security definer set search_path = public as $$
declare n_upd int; n_new int; n_alum int; bad int;
begin
  if not exists (select 1 from students_import) then raise exception 'students_import ว่างอยู่ นำเข้า CSV รายชื่อปีใหม่ก่อน'; end if;
  select count(*) into bad from students_import
  where student_id is null or student_id !~ '^[0-9]{5}$' or coalesce(btrim(first_name), '') = '' or coalesce(btrim(last_name), '') = ''
     or grade is null or room is null or number is null or grade not between 1 and 6 or room not between 1 and 30 or number not between 1 and 99;
  if bad > 0 then raise exception 'ข้อมูลใน students_import ไม่ครบหรือไม่ถูกต้อง % แถว (เลขประจำตัว 5 หลัก ชื่อ นามสกุล ชั้น 1-6 ห้อง 1-30 เลขที่ 1-99)', bad; end if;
  if exists (select 1 from students_import group by student_id having count(*) > 1) then raise exception 'มีเลขประจำตัวซ้ำใน students_import'; end if;
  if exists (select 1 from students_import group by grade, room, number having count(*) > 1) then raise exception 'มีชั้น ห้อง เลขที่ซ้ำกันใน students_import'; end if;
  -- แถวเช็กชื่อเก่าที่ไม่มีเลขประจำตัว: ผูกกับนักเรียนตามชั้น ห้อง เลขที่ "เดิม" ก่อนเปลี่ยน ไม่ให้ไปติดกับนักเรียนใหม่ที่ได้ชั้นห้องเลขที่นั้น
  update checkins c set student_id = s.student_id from students s
  where c.student_id is null and s.grade = c.grade and s.room = c.room and s.number = c.number
    and not exists (select 1 from checkins x where x.week = c.week and x.student_id = s.student_id);
  select count(*) into n_alum from students s where not s.alumni and not exists (select 1 from students_import i where i.student_id = s.student_id);
  update students set grade = null, room = null, number = null;   -- ล้างชั้นห้องเลขที่ทุกคนก่อน คนที่สลับเลขที่กันจะได้ไม่ชน
  update students s set alumni = true where not exists (select 1 from students_import i where i.student_id = s.student_id);
  update students s set first_name = btrim(i.first_name), last_name = btrim(i.last_name), grade = i.grade, room = i.room, number = i.number,
         alumni = false, nickname = coalesce(nullif(btrim(i.nickname), ''), s.nickname)
  from students_import i where i.student_id = s.student_id;
  get diagnostics n_upd = row_count;
  insert into students (student_id, first_name, last_name, grade, room, number, nickname, alumni)
  select i.student_id, btrim(i.first_name), btrim(i.last_name), i.grade, i.room, i.number, nullif(btrim(i.nickname), ''), false
  from students_import i where not exists (select 1 from students s where s.student_id = i.student_id);
  get diagnostics n_new = row_count;
  delete from students_import;
  return format('อัปเดต %s คน เพิ่มใหม่ %s คน ย้ายเป็นศิษย์เก่า %s คน', n_upd, n_new, n_alum);
end $$;
revoke all on function public.apply_new_roster() from public, anon, authenticated;

grant execute on function public.lookup_student(text), public.submit_checkin(int, text, text, text), public.my_scores(text) to anon, authenticated;
grant execute on function public.admin_add_checkin(text, int, text, text), public.admin_submit_game(text, int, text, jsonb), public.admin_attendance(text) to anon, authenticated;
