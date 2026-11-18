-- ระบบรายชื่อนักเรียน + เช็กชื่อด้วยเลขประจำตัว 5 หลัก
-- วางใน Supabase > SQL Editor แล้วกด Run (รันซ้ำได้)
-- ต้องรันหลังจาก supabase-checkin.sql, supabase-nick-filter.sql และ supabase-admin-delete.sql แล้ว
--
-- หลังรันไฟล์นี้: นำเข้ารายชื่อที่ Table Editor > students > Insert > Import data from CSV
--   คอลัมน์: student_id, first_name, last_name, grade, room, number, nickname (nickname เว้นว่างได้)
--   ห้ามเอารายชื่อจริงขึ้น GitHub (repo เป็นสาธารณะ)
--
-- ชื่อเล่นบนกระดานอันดับ: ล็อกตามที่นักเรียนกรอกตอนเช็กชื่อครั้งแรก เก็บในช่อง students.nickname
--   ถ้านักเรียนอยากเปลี่ยน ให้ครูแก้ช่องนี้ใน Table Editor ที่เดียว (ใส่ชื่อเล่นล่วงหน้าใน CSV ก็ได้)

create table if not exists public.students (
  student_id text primary key check (student_id ~ '^[0-9]{5}$'),
  first_name text not null,
  last_name  text not null,
  grade  smallint not null check (grade between 1 and 6),
  room   smallint not null check (room between 1 and 30),
  number smallint not null check (number between 1 and 99),
  nickname text,
  unique (grade, room, number)
);
alter table public.students enable row level security;
revoke all on public.students from anon, authenticated;

alter table public.checkins add column if not exists student_id text;
create unique index if not exists checkins_week_student_uq on public.checkins (week, student_id);

-- ค้นหานักเรียนจากเลขประจำตัว: ส่งกลับชื่อเต็ม + นามสกุลเฉพาะตัวอักษรแรก + ชั้น ห้อง เลขที่
create or replace function public.lookup_student(p_id text) returns json
language plpgsql stable security definer set search_path = public as $$
declare s students%rowtype; ln text;
begin
  if p_id is null or p_id !~ '^[0-9]{5}$' then return json_build_object('found', false); end if;
  select * into s from students where student_id = p_id;
  if not found then return json_build_object('found', false); end if;
  ln := btrim(s.last_name);
  -- นามสกุลที่ขึ้นต้นด้วยสระนำ (เ แ โ ใ ไ) เอา 2 ตัวอักษร ไม่งั้นเหลือแค่สระ
  ln := left(ln, case when left(ln, 1) in ('เ', 'แ', 'โ', 'ใ', 'ไ') then 2 else 1 end) || '…';
  return json_build_object('found', true, 'name', btrim(s.first_name) || ' ' || ln,
                           'grade', s.grade, 'room', s.room, 'number', s.number);
end $$;

-- เช็กชื่อ: ใช้เลขประจำตัวแทนการกรอกชื่อ/ชั้น/ห้อง/เลขที่
-- คืนค่า: ok | already | closed | not_solved | invalid | bad_nick | unknown_student
drop function if exists public.submit_checkin(int, text, int, int, int, text, text);
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

  -- ล็อกชื่อเล่น: มีชื่อเล่นของนักเรียนคนนี้แล้ว ใช้ชื่อเดิมเสมอ ยังไม่มีค่อยบันทึกที่กรอกมา
  if nullif(btrim(coalesce(st.nickname, '')), '') is not null then
    v_nick := btrim(st.nickname);
  elsif v_nick is not null then
    update students set nickname = v_nick where student_id = p_student;
  end if;

  insert into checkins (week, student_name, grade, room, number, nickname, solver_id, solved_at, student_id)
  values (p_week, btrim(st.first_name) || ' ' || btrim(st.last_name), st.grade, st.room, st.number,
          v_nick, p_solver, v_solved, p_student);
  return 'ok';
exception when unique_violation then
  return 'already';  -- การเปลี่ยนแปลงทั้งหมดในฟังก์ชัน (รวมการบันทึกชื่อเล่น) ถูกย้อนกลับ
end $$;

-- อันดับรวม: รวมคะแนนตามนักเรียน (เลขประจำตัว) ชื่อเล่นใช้จาก students.nickname
-- แถวเช็กชื่อเก่าที่ไม่มีเลขประจำตัว จะจับคู่กับนักเรียนด้วย ชั้น+ห้อง+เลขที่ ถ้าไม่พบใช้ชื่อเล่นแรกที่กรอก
create or replace function public.get_leaderboard() returns json
language sql stable security definer set search_path = public as $$
  with cw as (
    select c.*, coalesce(w.kind, 'puzzle') as kind,
           coalesce(s.student_id, 'g' || c.grade || '-' || c.room || '-' || c.number) as pkey,
           s.nickname as s_nick
    from checkins c
    left join weeks w on w.week = c.week
    left join students s on s.student_id = c.student_id
      or (c.student_id is null and s.grade = c.grade and s.room = c.room and s.number = c.number)
  ),
  pz as (
    select id, row_number() over (partition by week order by solved_at nulls last, id) as r
    from cw where kind = 'puzzle'
  ),
  pts as (
    select cw.id, cw.pkey, cw.nickname, cw.s_nick, cw.created_at,
      case
        when cw.kind = 'game' then
          case when gr.rank is null then 1 when gr.rank = 1 then 10 else greatest(1, 10 - gr.rank) end
        else
          case when pz.r = 1 then 10 else greatest(1, 10 - pz.r) end
      end as p
    from cw
    left join pz on pz.id = cw.id
    left join game_ranks gr on gr.checkin_id = cw.id
  ),
  per as (
    select pkey,
      sum(p)::int as points,
      count(*)::int as weeks,
      coalesce(
        nullif(btrim(max(s_nick)), ''),
        (array_agg(nickname order by created_at, id) filter (where nickname is not null))[1]
      ) as nick
    from pts group by pkey
  )
  select coalesce(json_agg(json_build_object('nick', nick, 'points', points, 'weeks', weeks)
         order by points desc, weeks desc, nick), '[]'::json)
  from (select * from per where nick is not null order by points desc, weeks desc, nick limit 200) t;
$$;

grant execute on function
  public.lookup_student(text),
  public.submit_checkin(int, text, text, text),
  public.get_leaderboard()
to anon, authenticated;
