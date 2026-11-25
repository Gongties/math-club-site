-- ส่งผลเกม Mathmory เข้าระบบคะแนนชมรม + นักเรียนเปลี่ยนชื่อเล่นได้
-- วางใน Supabase > SQL Editor แล้วกด Run (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
-- ต้องรันหลัง supabase-roster.sql, supabase-admin-checkin.sql, supabase-nick-ok-only.sql และ supabase-tied-ranks.sql แล้ว
-- (ไฟล์นี้ไม่มีรายชื่อนักเรียน ห้ามเอาชื่อจริงขึ้น GitHub)
--
-- 1) ตาราง game_results เก็บคะแนนของแต่ละรอบเกม (หนึ่งแถวต่อคนต่อรอบ)
-- 2) admin_submit_game: หน้าจอใหญ่ของ Mathmory เรียกตอนครูกด "ส่งผลเข้าระบบ" และใส่รหัสแอดมิน
--      - เช็กชื่อให้ทุกคนที่มีเลขประจำตัว (สัปดาห์ปัจจุบัน ต้องตั้งเป็นประเภท "เกม" ในหน้าแอดมินก่อน)
--      - แต่ละรอบจัดอันดับตามคะแนนในเกม แปลงเป็นคะแนนชมรม (อันดับ 1 = 10, 2 = 8, 3 = 7 ... ต่ำสุด 1)
--        แล้วรวมคะแนนชมรมทุกรอบของสัปดาห์เดียวกัน จัดเป็นอันดับของสัปดาห์ (เท่ากันได้อันดับร่วม 1, 2, 2, 4)
--      - ส่งรอบเดียวกันซ้ำ = เขียนทับผลเดิมของรอบนั้น ไม่นับซ้ำ
--      - ถ้าสัปดาห์นั้นมีอันดับที่ครูกรอกเองในหน้าแอดมินอยู่แล้ว ระบบหยุดและไม่เขียนทับ (has_manual_ranks)
--      - ชื่อเล่นที่ผู้เล่นใช้ในเกมกลายเป็นชื่อเล่นบนกระดานอันดับ (ชื่อที่ไม่ผ่านตัวกรองจะไม่ถูกบันทึก แต่ยังนับคะแนน)
--      - คืนค่า (json): { r: ok | forbidden | invalid | not_game_week | has_manual_ranks,
--                          saved, rounds, unknown: [เลขประจำตัวที่ไม่พบ], invalid, bad_nick }
-- 3) submit_checkin และ admin_add_checkin: เลิกล็อกชื่อเล่น ชื่อที่กรอกครั้งล่าสุดเป็นชื่อบนกระดานอันดับ
--    (get_leaderboard ใช้ students.nickname อยู่แล้ว จึงไม่ต้องแก้)

create table if not exists public.game_results (
  week int not null,
  student_id text not null check (student_id ~ '^[0-9]{5}$'),
  run_id text not null check (char_length(run_id) between 1 and 60),
  score numeric not null check (score >= 0 and score <= 100000),
  created_at timestamptz not null default now(),
  primary key (week, student_id, run_id)
);
alter table public.game_results enable row level security;
revoke all on public.game_results from anon, authenticated;

create or replace function public.admin_submit_game(p_pass text, p_week int, p_run text, p_items jsonb)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
  v_run text := btrim(coalesce(p_run, ''));
  it jsonb;
  sid text;
  v_score numeric;
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
    if sid is null or sid !~ '^[0-9]{5}$' or v_score is null or v_score < 0 or v_score > 100000 then
      v_invalid := v_invalid + 1; continue;
    end if;

    select * into st from students where student_id = sid;
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

    insert into game_results (week, student_id, run_id, score) values (p_week, sid, v_run, v_score)
    on conflict (week, student_id, run_id) do update set score = excluded.score;
    v_saved := v_saved + 1;
  end loop;

  if v_saved > 0 then
    -- อันดับของสัปดาห์: ในแต่ละรอบจัดอันดับตามคะแนนในเกม แปลงเป็นคะแนนชมรม (อันดับ 1 = 10, อื่น ๆ = max(1, 10 - อันดับ))
    -- แล้วรวมคะแนนชมรมของทุกรอบ จัดอันดับสัปดาห์จากผลรวมนี้ (เท่ากันได้อันดับร่วม) รอบที่ไม่ได้เล่นได้ 0 ของรอบนั้น
    delete from game_ranks where week = p_week;
    insert into game_ranks (week, rank, checkin_id)
    select p_week, (rank() over (order by t.total desc))::int, c.id
    from (
      select student_id, sum(case when r = 1 then 10 else greatest(1, 10 - r) end) as total
      from (
        select student_id, rank() over (partition by run_id order by score desc) as r
        from game_results where week = p_week
      ) x group by student_id
    ) t
    join checkins c on c.week = p_week and c.student_id = t.student_id;
  end if;

  select count(distinct run_id) into v_rounds from game_results where week = p_week;
  return json_build_object('r', 'ok', 'saved', v_saved, 'rounds', v_rounds,
                           'unknown', to_json(v_unknown), 'invalid', v_invalid, 'bad_nick', v_bad_nick);
end $$;
revoke all on function public.admin_submit_game(text, int, text, jsonb) from public;
grant execute on function public.admin_submit_game(text, int, text, jsonb) to anon, authenticated;

-- เช็กชื่อด้วยตัวเอง: เลิกล็อกชื่อเล่น (กรอกชื่อใหม่ = เปลี่ยนชื่อบนกระดานอันดับ ไม่กรอก = ใช้ชื่อเดิม)
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

  select * into st from students where student_id = p_student;
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

-- ครูเช็กชื่อแทน: เลิกล็อกชื่อเล่นเช่นกัน
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
