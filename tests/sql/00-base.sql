create role anon; create role authenticated;
create table if not exists public.settings (id int primary key default 1 check (id = 1), checkin_open boolean not null default false, current_week int not null default 3, admin_hash text not null);
create table if not exists public.weeks (week int primary key, kind text not null check (kind in ('puzzle','game')), title text);
create table if not exists public.solves (week int not null, solver_id text not null, solved_at timestamptz not null default now(), primary key (week, solver_id));
create table if not exists public.checkins (id bigserial primary key, week int not null, student_name text not null, grade smallint not null check (grade between 1 and 6), room smallint not null check (room between 1 and 30), number smallint not null check (number between 1 and 99), nickname text, solver_id text, solved_at timestamptz, created_at timestamptz not null default now(), unique (week, grade, room, number));
create table if not exists public.game_ranks (week int not null, rank int not null check (rank >= 1), checkin_id bigint not null references public.checkins(id) on delete cascade, primary key (week, rank), unique (week, checkin_id));
alter table public.settings enable row level security; alter table public.weeks enable row level security; alter table public.solves enable row level security; alter table public.checkins enable row level security; alter table public.game_ranks enable row level security;
revoke all on public.settings, public.weeks, public.solves, public.checkins, public.game_ranks from anon, authenticated;
insert into public.settings (id, checkin_open, current_week, admin_hash) values (1, false, 3, encode(sha256(convert_to('testpass', 'UTF8')), 'hex')) on conflict (id) do nothing;
insert into public.weeks (week, kind, title) values (1, 'puzzle', 'Mathdle'), (2, 'puzzle', 'เจาะรหัสลับ ฉบับ67'), (3, 'game', 'Calcuเหรอ?') on conflict (week) do nothing;
create or replace function public._admin_ok(p_pass text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from settings where id = 1 and admin_hash = encode(sha256(convert_to(coalesce(p_pass, ''), 'UTF8')), 'hex')); $$;
create or replace function public.get_state() returns json language sql stable security definer set search_path = public as $$
  select json_build_object('open', s.checkin_open, 'week', s.current_week, 'kind', coalesce(w.kind, 'puzzle')) from settings s left join weeks w on w.week = s.current_week where s.id = 1; $$;
