-- คะแนนรายสัปดาห์ (หน้าอันดับ, หน้าคะแนนของฉัน, ตารางการเข้าร่วมในหน้าแอดมิน) + Calcu ส่งผลเข้าระบบคะแนน
-- วางใน Supabase > SQL Editor แล้วกด Run (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
-- ต้องรันหลัง supabase-game-results.sql แล้ว
-- (ไฟล์นี้ไม่มีรายชื่อนักเรียน ห้ามเอาชื่อจริงขึ้น GitHub)
--
-- 1) game_results: คะแนนในเกมติดลบได้ (Calcu มีคะแนนติดลบ) และเพิ่มช่อง place (ลำดับตอนจบเกมที่เกมส่งมา)
-- 2) admin_submit_game: รับ place เพิ่ม (ไม่บังคับ) รอบที่มี place จัดอันดับตาม place
--    รอบที่ไม่มี place (Mathmory) จัดอันดับตามคะแนนในเกมเหมือนเดิม
-- 3) get_leaderboard_weeks: อันดับรวม + คะแนนและอันดับของแต่ละสัปดาห์ (แสดงเฉพาะชื่อเล่น)
-- 4) my_scores: ใส่เลขประจำตัว ได้คะแนนรวม อันดับรวม และผลรายสัปดาห์ของคนนั้น
-- 5) admin_attendance: ตารางการเข้าร่วม นักเรียน x สัปดาห์ (ต้องใช้รหัสแอดมิน)
-- คะแนนคิดสูตรเดียวกับ get_leaderboard (ไม่ได้แก้ get_leaderboard)
-- อันดับรายสัปดาห์ของสัปดาห์โจทย์: เวลาตอบถูกเท่ากันได้อันดับร่วม (คะแนนยังคิดแบบเดิม)

alter table public.game_results add column if not exists place int;
alter table public.game_results drop constraint if exists game_results_score_check;
alter table public.game_results add constraint game_results_score_check check (score >= -100000 and score <= 100000);
alter table public.game_results drop constraint if exists game_results_place_check;
alter table public.game_results add constraint game_results_place_check check (place is null or (place between 1 and 1000));

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

revoke all on function public.admin_submit_game(text, int, text, jsonb) from public;
grant execute on function public.admin_submit_game(text, int, text, jsonb) to anon, authenticated;

-- ฟังก์ชันภายใน: คะแนนชมรมและอันดับของทุกแถวเช็กชื่อ (สูตรเดียวกับ get_leaderboard)
create or replace function public._club_points()
returns table (pkey text, sid text, week int, kind text, p int, r int, nick text, s_nick text,
               created_at timestamptz, cid bigint, cname text, grade smallint, room smallint, num smallint)
language sql stable security definer set search_path = public as $$
  with cw as (
    select c.*, coalesce(w.kind, 'puzzle') as kind,
           coalesce(s.student_id, 'g' || c.grade || '-' || c.room || '-' || c.number) as pkey,
           s.student_id as sid0, s.nickname as s_nick0
    from checkins c
    left join weeks w on w.week = c.week
    left join students s on s.student_id = c.student_id
      or (c.student_id is null and s.grade = c.grade and s.room = c.room and s.number = c.number)
  ),
  pz as (
    select id,
           row_number() over (partition by week order by solved_at nulls last, id) as rn,
           rank() over (partition by week order by solved_at nulls last) as rk
    from cw where kind = 'puzzle'
  )
  select cw.pkey, cw.sid0, cw.week, cw.kind,
    (case
      when cw.kind = 'game' then
        case when gr.rank is null then 1 when gr.rank = 1 then 10 else greatest(1, 10 - gr.rank) end
      else
        case when pz.rn = 1 then 10 else greatest(1, 10 - pz.rn) end
    end)::int,
    (case when cw.kind = 'game' then gr.rank else pz.rk end)::int,
    cw.nickname, cw.s_nick0, cw.created_at, cw.id, cw.student_name, cw.grade, cw.room, cw.number
  from cw
  left join pz on pz.id = cw.id
  left join game_ranks gr on gr.checkin_id = cw.id;
$$;
revoke all on function public._club_points() from public, anon, authenticated;

-- ฟังก์ชันภายใน: รวมต่อคน (ชื่อเล่นแบบเดียวกับ get_leaderboard)
drop function if exists public._club_people();
create or replace function public._club_people()
returns table (pkey text, sid text, points int, weeks int, nick text, wk json)
language sql stable security definer set search_path = public as $$
  select pkey, max(sid), sum(p)::int, count(*)::int,
    coalesce(
      nullif(btrim(max(s_nick)), ''),
      (array_agg(nick order by created_at, cid) filter (where nick is not null))[1]
    ),
    json_agg(json_build_object('w', week, 'p', p, 'r', r) order by week)
  from public._club_points() group by pkey;
$$;
revoke all on function public._club_people() from public, anon, authenticated;

-- ฟังก์ชันภายใน: สัปดาห์ที่มีการเช็กชื่อ
create or replace function public._club_weeks() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('week', x.week, 'kind', coalesce(w.kind, 'puzzle'), 'title', w.title) order by x.week), '[]'::json)
  from (select distinct week from checkins) x left join weeks w on w.week = x.week;
$$;
revoke all on function public._club_weeks() from public, anon, authenticated;

-- อันดับรวม + รายสัปดาห์ (สำหรับหน้าอันดับ เห็นเฉพาะชื่อเล่น)
create or replace function public.get_leaderboard_weeks() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'weeks', public._club_weeks(),
    'rows', (
      select coalesce(json_agg(json_build_object('nick', nick, 'points', points, 'weeks', weeks, 'by', wk)
             order by points desc, weeks desc, nick), '[]'::json)
      from (select * from public._club_people() where nick is not null
            order by points desc, weeks desc, nick limit 200) t
    )
  );
$$;

-- คะแนนของฉัน: ใส่เลขประจำตัว ได้คะแนนรวม อันดับรวม (นับเหมือนหน้าอันดับ) และผลรายสัปดาห์
-- คืนค่า { found: false } หรือ { found: true, points, rank, of, on_board, weeks: [...], by: [...] }
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
    'weeks', public._club_weeks(),
    'by', coalesce(me.wk, '[]'::json));
end $$;

-- ตารางการเข้าร่วม (แอดมิน): นักเรียนทุกคนในรายชื่อ + แถวเช็กชื่อเก่าที่จับคู่รายชื่อไม่ได้
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

grant execute on function public.get_leaderboard_weeks(), public.my_scores(text), public.admin_attendance(text)
to anon, authenticated;
