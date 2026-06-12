alter table public.watch_records
drop constraint if exists watch_records_media_type_check;

alter table public.watch_records
add constraint watch_records_media_type_check
check (media_type in ('anime', 'movie', 'youtube', 'unknown'));
