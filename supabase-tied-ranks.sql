-- อันดับเกมแบบ "อันดับร่วม" (เช่น 1, 2, 2, 4): คนที่เท่ากันได้อันดับเดียวกันและคะแนนเท่ากัน คนถัดไปข้ามอันดับ
-- วางใน Supabase > SQL Editor แล้วกด Run (รันซ้ำได้) ไม่ลบข้อมูลเดิม อันดับที่บันทึกไว้แล้วยังอยู่ครบ
-- หลังรัน หน้าแอดมินจะใช้ฟังก์ชันใหม่ admin_set_ranks2 ส่วนสูตรคะแนนในหน้าอันดับ (get_leaderboard) ไม่ต้องแก้

-- 1) ให้ตาราง game_ranks เก็บอันดับซ้ำได้: เปลี่ยนคีย์หลักจาก (week, rank) เป็น (week, checkin_id)
--    (หนึ่งคนยังมีได้อันดับเดียวต่อสัปดาห์เหมือนเดิม)
do $$
declare v_cols text;
begin
  select string_agg(a.attname, ',' order by a.attname) into v_cols
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.game_ranks'::regclass and c.contype = 'p';
  if v_cols = 'rank,week' then
    execute (select 'alter table public.game_ranks drop constraint ' || quote_ident(conname)
             from pg_constraint where conrelid = 'public.game_ranks'::regclass and contype = 'p');
    alter table public.game_ranks add primary key (week, checkin_id);
  end if;
end $$;

-- 2) บันทึกอันดับ: ครูกรอกตัวเลขของแต่ละคน (อันดับ หรือผลรวมอันดับหลายรอบก็ได้ น้อย = ดีกว่า)
--    ระบบเรียงให้เป็นอันดับแบบแข่งขัน: อันดับของคนหนึ่ง = 1 + จำนวนคนที่ตัวเลขน้อยกว่าคนนั้น
--    เช่น กรอก 3, 5, 5, 8 -> อันดับ 1, 2, 2, 4 คนที่เว้นว่างไม่มีอันดับ (ได้ 1 คะแนนเหมือนเดิม)
create or replace function public.admin_set_ranks2(p_pass text, p_week int, p_ids bigint[], p_vals int[])
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not _admin_ok(p_pass) then return false; end if;
  if p_ids is null or p_vals is null or array_length(p_ids, 1) is distinct from array_length(p_vals, 1) then return false; end if;
  if exists (select 1 from unnest(p_vals) v where v is null or v < 1) then return false; end if;
  delete from game_ranks where week = p_week;
  insert into game_ranks (week, rank, checkin_id)
  select p_week, (rank() over (order by t.val))::int, t.id
  from (
    select distinct on (u.id) u.id, u.val
    from unnest(p_ids, p_vals) as u(id, val)
    order by u.id, u.val
  ) t
  join checkins c on c.id = t.id and c.week = p_week;
  return true;
end $$;
revoke all on function public.admin_set_ranks2(text, int, bigint[], int[]) from public;
grant execute on function public.admin_set_ranks2(text, int, bigint[], int[]) to anon, authenticated;
