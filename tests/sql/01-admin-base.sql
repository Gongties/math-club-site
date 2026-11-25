create or replace function public.admin_state(p_pass text) returns json language plpgsql security definer set search_path = public as $$
declare s settings%rowtype; v_kind text; v_count int;
begin
  if not _admin_ok(p_pass) then return json_build_object('ok', false); end if;
  select * into s from settings where id = 1;
  select coalesce((select kind from weeks where week = s.current_week), 'puzzle') into v_kind;
  select count(*) into v_count from checkins where week = s.current_week;
  return json_build_object('ok', true, 'open', s.checkin_open, 'week', s.current_week, 'kind', v_kind, 'count', v_count);
end $$;
create or replace function public.admin_set(p_pass text, p_open boolean, p_week int, p_kind text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not _admin_ok(p_pass) then return false; end if;
  if p_week is null or p_week < 1 or p_kind not in ('puzzle', 'game') then return false; end if;
  insert into weeks (week, kind) values (p_week, p_kind) on conflict (week) do update set kind = excluded.kind;
  update settings set checkin_open = coalesce(p_open, false), current_week = p_week where id = 1;
  return true;
end $$;
create or replace function public.admin_checkins(p_pass text, p_week int) returns json language plpgsql security definer set search_path = public as $$
begin
  if not _admin_ok(p_pass) then return null; end if;
  return (select coalesce(json_agg(json_build_object('id', c.id, 'name', c.student_name, 'grade', c.grade, 'room', c.room, 'number', c.number,
      'nick', c.nickname, 'solved_at', c.solved_at, 'created_at', c.created_at, 'rank', g.rank) order by c.created_at), '[]'::json)
    from checkins c left join game_ranks g on g.checkin_id = c.id where c.week = p_week);
end $$;
grant execute on function public.admin_state(text), public.admin_set(text, boolean, int, text), public.admin_checkins(text, int), public.get_state() to anon;
