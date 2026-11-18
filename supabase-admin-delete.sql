-- เพิ่มฟังก์ชันลบรายการเช็กชื่อ (วางใน Supabase > SQL Editor แล้วกด Run รันซ้ำได้)
-- ลบแถวใน checkins ตาม id; อันดับเกมของแถวนั้นถูกลบตามอัตโนมัติ (on delete cascade)
create or replace function public.admin_delete_checkin(p_pass text, p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not _admin_ok(p_pass) then return false; end if;
  delete from checkins where id = p_id;
  get diagnostics n = row_count;
  return n > 0;
end $$;

grant execute on function public.admin_delete_checkin(text, bigint) to anon, authenticated;
