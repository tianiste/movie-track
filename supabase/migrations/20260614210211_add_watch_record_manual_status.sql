alter table public.watch_records
add column if not exists manual_status text;

alter table public.watch_records
drop constraint if exists watch_records_manual_status_check;

alter table public.watch_records
add constraint watch_records_manual_status_check
check (
  manual_status is null
  or manual_status in ('continue', 'finished')
);
