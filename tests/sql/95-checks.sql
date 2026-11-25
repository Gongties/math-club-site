-- ตรวจผลหลังใส่ข้อมูลตัวอย่าง (90-sample-data.sql): ถ้าผิดจะหยุดด้วย error
do $$
declare n int;
begin
  -- คะแนนรวมในหน้าอันดับแบบใหม่ต้องตรงกับ get_leaderboard เดิมทุกคน
  select count(*) into n from (select x->>'nick' k, (x->>'points')::int p from json_array_elements(get_leaderboard()) x) a
    full join (select x->>'nick' k, (x->>'points')::int p from json_array_elements(get_leaderboard_weeks()->'rows') x) b using (k)
    where a.p is distinct from b.p;
  if n > 0 then raise exception 'get_leaderboard_weeks ไม่ตรงกับ get_leaderboard % คน', n; end if;
  -- Calcu ส่ง place: ผู้ชนะ (place 1) อยู่อันดับ 1 แม้คะแนนในเกมน้อยกว่า
  if (select count(*) from game_results where run_id = 'CA-1' and place is not null) <> 4 then raise exception 'place ไม่ถูกบันทึก'; end if;
  if (select g.rank from game_ranks g join checkins c on c.id = g.checkin_id where g.week = 4 and c.student_id = '10002') <> 1 then raise exception 'อันดับสัปดาห์ 4 ผิด'; end if;
  -- my_scores
  if (my_scores('10001')->>'points')::int <> 26 then raise exception 'my_scores คะแนนผิด'; end if;
  if (my_scores('99999')->>'found')::boolean then raise exception 'my_scores เจอเลขที่ไม่มี'; end if;
  if admin_attendance('wrong') is not null then raise exception 'admin_attendance ไม่ตรวจรหัส'; end if;
  if json_array_length(admin_attendance('testpass')->'rows') <> 8 then raise exception 'admin_attendance จำนวนแถวผิด'; end if;
  raise notice 'SQL checks: ผ่านทั้งหมด';
end $$;
