-- Rabbit Finder Supabase schema with group ownership and shared group map

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  owner_id uuid,
  map_image text,
  map_updated_at timestamptz,
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

-- If your tables already existed, add missing columns
alter table public.groups
add column if not exists owner_id uuid,
add column if not exists map_image text,
add column if not exists map_updated_at timestamptz;

alter table public.groups enable row level security;
alter table public.pins enable row level security;

-- Drop old policies
drop policy if exists "groups_insert_anon" on public.groups;
drop policy if exists "groups_select_anon" on public.groups;
drop policy if exists "pins_select_anon" on public.pins;
drop policy if exists "pins_insert_anon" on public.pins;
drop policy if exists "pins_update_anon" on public.pins;
drop policy if exists "pins_delete_anon" on public.pins;

drop policy if exists "groups_select_authenticated" on public.groups;
drop policy if exists "groups_insert_owner" on public.groups;
drop policy if exists "groups_update_owner" on public.groups;

drop policy if exists "pins_select_authenticated" on public.pins;
drop policy if exists "pins_insert_own" on public.pins;
drop policy if exists "pins_update_own" on public.pins;
drop policy if exists "pins_delete_own" on public.pins;

-- Groups
create policy "groups_select_authenticated"
on public.groups
for select
to authenticated
using (true);

create policy "groups_insert_owner"
on public.groups
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "groups_update_owner"
on public.groups
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- Pins
create policy "pins_select_authenticated"
on public.pins
for select
to authenticated
using (expires_at > now());

create policy "pins_insert_own"
on public.pins
for insert
to authenticated
with check (
  member_id = auth.uid()::text
  and expires_at > now()
);

create policy "pins_update_own"
on public.pins
for update
to authenticated
using (
  member_id = auth.uid()::text
  and expires_at > now()
)
with check (
  member_id = auth.uid()::text
  and expires_at > now()
);

create policy "pins_delete_own"
on public.pins
for delete
to authenticated
using (member_id = auth.uid()::text);

-- Enable realtime.
-- If these commands error because the table is already part of the publication, that is fine.
do $$
begin
  begin
    alter publication supabase_realtime add table public.pins;
  exception
    when duplicate_object then null;
    when others then null;
  end;

  begin
    alter publication supabase_realtime add table public.groups;
  exception
    when duplicate_object then null;
    when others then null;
  end;
end $$;
