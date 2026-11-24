-- ตารางสถิติโหมดเล่นคนเดียวของเกม "ภาพจำยังชัดเจน" (/mathmory/#solo)
-- วางใน Supabase > SQL Editor แล้วกด Run (รันซ้ำได้) ต้องรันหลัง supabase-nick-filter.sql (ใช้ฟังก์ชัน _nick_ok)
-- เก็บเฉพาะชื่อเล่น ขนาดกระดาน คะแนน และเวลา (ไม่มีข้อมูลส่วนตัว) ทุกเกมเป็นแถวแยก
-- นับเฉพาะเกมที่ใช้ค่ามาตรฐาน (จำ 10 วิ ตอบ 15 วิ 10 ข้อ) ซึ่งหน้าเว็บตรวจก่อนส่ง คะแนนสูงสุดที่เป็นไปได้ = 15 × (1+1+1+1+2+2+2+3+3+4) = 300
-- ข้อจำกัด: คะแนนคิดในมือถือ คนที่เก่งโค้ดส่งคะแนนปลอม (ไม่เกิน 300) ได้ ลบแถวที่ผิดปกติได้ที่ Table Editor > mm_solo

create table if not exists public.mm_solo (
  id bigserial primary key,
  nick text not null check (char_length(nick) between 1 and 20),
  size int not null check (size in (3, 4, 5)),
  score numeric(5, 1) not null check (score >= 0 and score <= 300),
  created_at timestamptz not null default now()
);
create index if not exists mm_solo_top_idx on public.mm_solo (size, score desc, created_at);
alter table public.mm_solo enable row level security;
revoke all on public.mm_solo from anon, authenticated;

-- บันทึกคะแนน 1 เกม คืนค่า (json): { "r": "ok", "id": เลขแถว, "rank": อันดับของคะแนนนี้ } หรือ { "r": "invalid" | "bad_nick" | "busy" }
create or replace function public.mm_solo_submit(p_nick text, p_size int, p_score numeric)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_nick text := btrim(coalesce(p_nick, ''));
  v_score numeric := round(coalesce(p_score, -1), 1);
  v_id bigint;
  v_rank int;
begin
  if p_size is null or p_size not in (3, 4, 5) or v_score < 0 or v_score > 300 or char_length(v_nick) < 1 or char_length(v_nick) > 20 then
    return json_build_object('r', 'invalid');
  end if;
  if not _nick_ok(v_nick) then return json_build_object('r', 'bad_nick'); end if;
  -- กันส่งรัว: ชื่อเดียวกันไม่เกิน 5 เกมต่อนาที (เกม 10 ข้อใช้เวลาจริงหลายนาที)
  if (select count(*) from mm_solo where nick = v_nick and created_at > now() - interval '1 minute') >= 5 then
    return json_build_object('r', 'busy');
  end if;
  insert into mm_solo (nick, size, score) values (v_nick, p_size, v_score) returning id into v_id;
  select count(*) + 1 into v_rank from mm_solo where size = p_size and score > v_score;
  return json_build_object('r', 'ok', 'id', v_id, 'rank', v_rank);
end $$;
revoke all on function public.mm_solo_submit(text, int, numeric) from public;
grant execute on function public.mm_solo_submit(text, int, numeric) to anon, authenticated;

-- 10 อันดับแรกของขนาดกระดานหนึ่ง (คะแนนเท่ากัน คนที่ทำได้ก่อนอยู่บน)
create or replace function public.mm_solo_top(p_size int)
returns table (id bigint, nick text, score numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.nick, m.score, m.created_at from mm_solo m
  where m.size = p_size
  order by m.score desc, m.created_at asc
  limit 10;
$$;
revoke all on function public.mm_solo_top(int) from public;
grant execute on function public.mm_solo_top(int) to anon, authenticated;
