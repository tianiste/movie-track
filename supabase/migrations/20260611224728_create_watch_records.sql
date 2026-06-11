create extension if not exists pgcrypto with schema extensions;

create table if not exists public.watch_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_record_id text not null,
  url text not null,
  hostname text not null,
  raw_title text not null,
  title text not null,
  media_type text not null check (media_type in ('anime', 'movie', 'unknown')),
  season integer,
  episode integer,
  confidence integer not null default 0,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_sec integer not null default 0 check (duration_sec >= 0),
  last_playback_time integer check (last_playback_time is null or last_playback_time >= 0),
  video_duration_sec integer check (video_duration_sec is null or video_duration_sec >= 0),
  identity_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, identity_key)
);

create index if not exists watch_records_user_started_idx
  on public.watch_records (user_id, started_at desc);

create index if not exists watch_records_user_media_idx
  on public.watch_records (user_id, media_type);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public;
revoke execute on function public.set_updated_at() from anon;
revoke execute on function public.set_updated_at() from authenticated;

drop trigger if exists watch_records_set_updated_at on public.watch_records;

create trigger watch_records_set_updated_at
before update on public.watch_records
for each row
execute function public.set_updated_at();

alter table public.watch_records enable row level security;
alter table public.watch_records force row level security;

revoke all on table public.watch_records from anon;
revoke all on table public.watch_records from authenticated;

grant select, insert, update, delete
on table public.watch_records
to authenticated;

create policy "watch_records_select_own"
on public.watch_records
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "watch_records_insert_own"
on public.watch_records
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "watch_records_update_own"
on public.watch_records
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "watch_records_delete_own"
on public.watch_records
for delete
to authenticated
using ((select auth.uid()) = user_id);
