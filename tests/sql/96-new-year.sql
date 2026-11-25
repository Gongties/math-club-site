-- ทดสอบขั้นตอนขึ้นปีใหม่ (supabase-new-year.sql ถูกรันก่อนไฟล์นี้ใน run.sh)
create temp table before_lb as select x->>'nick' k, (x->>'points')::int p from json_array_elements(get_leaderboard()) x;
insert into students_import values
 ('10001','เอ','ทดสอบ',2,1,1,null),      -- ย้ายไปช่องเดิมของ 10004
 ('10004','ดี','ทดสอบ',1,1,1,'ดีใหม่'),   -- สลับกัน และเปลี่ยนชื่อเล่น
 ('10008','เอช','ใหม่',1,1,2,null);       -- คนใหม่ ได้ช่องเดิมของ 10002
do $$
declare r text; n int;
begin
  r := apply_new_roster(); raise notice '%', r;
  if r <> 'อัปเดต 2 คน เพิ่มใหม่ 1 คน ย้ายเป็นศิษย์เก่า 5 คน' then raise exception 'สรุปผิด: %', r; end if;
  if (select count(*) from students where alumni) <> 5 then raise exception 'จำนวนศิษย์เก่าผิด'; end if;
  if (select grade from students where student_id = '10002') is not null then raise exception 'ศิษย์เก่ายังมีชั้น'; end if;
  if (lookup_student('10002')->>'found')::boolean then raise exception 'ศิษย์เก่ายังค้นเจอในหน้าเช็กชื่อ'; end if;
  if not (my_scores('10002')->>'alumni')::boolean or not (my_scores('10002')->>'found')::boolean then raise exception 'คะแนนของฉันของศิษย์เก่าผิด'; end if;
  if submit_checkin(5, '10002', null, null) <> 'unknown_student' then raise exception 'ศิษย์เก่าเช็กชื่อได้'; end if;
  if json_array_length(admin_attendance('testpass')->'rows') <> 4 then raise exception 'ตารางการเข้าร่วมยังมีศิษย์เก่า (ได้ %)', json_array_length(admin_attendance('testpass')->'rows'); end if;
  -- แถวเช็กชื่อเก่าของ ดี (ไม่มีเลขประจำตัว ชั้นเดิม 2/1/1) ต้องผูกกับ 10004 ไม่ใช่ 10001 ที่ได้ช่องนั้นไป
  if (select student_id from checkins where week = 2 and student_name = 'ดี ทดสอบ') <> '10004' then raise exception 'แถวเก่าผูกผิดคน'; end if;
  select count(*) into n from (select x->>'nick' k, (x->>'points')::int p from json_array_elements(get_leaderboard()) x) a full join before_lb b using (k) where a.p is distinct from b.p and a.k <> 'ดีใหม่' and b.k <> 'ดี';
  if n > 0 then raise exception 'คะแนนบนกระดานเปลี่ยน % คน', n; end if;
  if (select points from (select x->>'nick' k, (x->>'points')::int points from json_array_elements(get_leaderboard()) x) t where k = 'ดีใหม่') <> (select p from before_lb where k = 'ดี') then raise exception 'คะแนนของคนที่เปลี่ยนชื่อเล่นหาย'; end if;
  if (select count(*) from students_import) <> 0 then raise exception 'students_import ไม่ถูกล้าง'; end if;
  begin
    insert into students_import values ('10001','เอ','ทดสอบ',1,1,1,null), ('10008','เอช','ใหม่',1,1,1,null);
    perform apply_new_roster(); raise exception 'ชั้นห้องเลขที่ซ้ำแต่ไม่หยุด';
  exception when others then if sqlerrm not like 'มีชั้น ห้อง เลขที่ซ้ำ%' then raise; end if;
  end;
  raise notice 'new-year checks: ผ่านทั้งหมด';
end $$;
