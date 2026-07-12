-- TEMPORARY spike table (72h-rule groundwork, 2026-07-12): daily capture of the
-- T+3d advertised timetable for 6 stations (works-affected pendeltåg Hu/Sta/
-- Hgv/Sol + controls Cst/Lu), to diff against execution and learn how
-- Trafikverket represents pre-announced amendments (retimed vs cancelled+
-- replaced). Drop together with the tmp-planned-timetable-spike edge function
-- + the tmp-planned-spike-daily pg_cron job (jobid 16) once the
-- timetable_amendments design is decided.
--
-- NB (CLAUDE.md §11 Option A): applied to the live DB via MCP apply_migration
-- on 2026-07-12; this file is the repo record, not a CLI-replayable migration.

create table public.tmp_planned_announcements_spike (
    activity_id       text not null,
    capture_date      date not null,
    activity_type     text,
    location_signature text,
    advertised_train_ident text,
    scheduled_time    timestamptz,
    canceled          boolean,
    deviation         text[],
    planned_estimated_time timestamptz,
    modified_time     timestamptz,
    information_owner text,
    captured_at       timestamptz not null default now(),
    primary key (activity_id, capture_date)
);

alter table public.tmp_planned_announcements_spike enable row level security;
