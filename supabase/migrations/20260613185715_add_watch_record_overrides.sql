alter table public.watch_records
add column if not exists manual_title text,
add column if not exists manual_media_type text,
add column if not exists manual_season integer,
add column if not exists manual_episode integer,
add column if not exists deleted_at timestamptz;

alter table public.watch_records
drop constraint if exists watch_records_manual_media_type_check;

alter table public.watch_records
add constraint watch_records_manual_media_type_check
check (
  manual_media_type is null
  or manual_media_type in ('anime', 'movie', 'youtube', 'unknown')
);

alter table public.watch_records
drop constraint if exists watch_records_manual_season_check;

alter table public.watch_records
add constraint watch_records_manual_season_check
check (manual_season is null or manual_season >= 0);

alter table public.watch_records
drop constraint if exists watch_records_manual_episode_check;

alter table public.watch_records
add constraint watch_records_manual_episode_check
check (manual_episode is null or manual_episode >= 0);

create index if not exists watch_records_user_deleted_idx
  on public.watch_records (user_id, deleted_at);
