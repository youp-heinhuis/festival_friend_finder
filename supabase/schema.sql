
-- Rabbit Finder Supabase schema
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_at timestamptz default now()
);

create table if not exists public.pins (
  id uuid primary key default gen_random_uuid(),
  group_code text not null references public.groups(code) on delete cascade,
  member_id text not null,
  name text not null,
  x numeric not null,
  y numeric not null,
  message text,
  colour text not null default 'blue',
  updated_at timestamptz default now(),
  expires_at timestamptz default now() + interval '2 hours',
  unique(group_code, member_id)
);

alter table public.groups enable row level security;
alter table public.pins enable row level security;

drop policy if exists "groups_insert_anon" on public.groups;
drop policy if exists "groups_select_anon" on public.groups;
drop policy if exists "pins_select_anon" on public.pins;
drop policy if exists "pins_insert_anon" on public.pins;
drop policy if exists "pins_update_anon" on public.pins;
drop policy if exists "pins_delete_anon" on public.pins;

create policy "groups_insert_anon" on public.groups for insert to anon with check (true);
create policy "groups_select_anon" on public.groups for select to anon using (true);
create policy "pins_select_anon" on public.pins for select to anon using (expires_at > now());
create policy "pins_insert_anon" on public.pins for insert to anon with check (expires_at > now());
create policy "pins_update_anon" on public.pins for update to anon using (expires_at > now()) with check (expires_at > now());
create policy "pins_delete_anon" on public.pins for delete to anon using (true);

-- Enable realtime for pins. If this errors because the table is already added, ignore it.
alter publication supabase_realtime add table public.pins;
