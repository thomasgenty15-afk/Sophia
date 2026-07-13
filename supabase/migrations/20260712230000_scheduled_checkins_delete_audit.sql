-- Chantier P0 rappels (2026-07-12) — audit des suppressions de scheduled_checkins.
-- Contexte: des one-shot reminders créés et vérifiés pending ont disparu en
-- dur (0 ligne tous statuts) pendant les runs QA du 12/07 (Nina R1-B01,
-- Rose RMR-B01, Eva T6). Aucun hard-delete produit ne cible les one-shots ;
-- ce trigger enregistre CHAQUE delete avec la requête appelante pour trancher
-- entre bug produit et cleanup/env concurrent. Additif et sans impact produit.

create table if not exists public.scheduled_checkins_delete_audit (
  id uuid primary key default gen_random_uuid(),
  deleted_row_id uuid not null,
  user_id uuid,
  event_context text,
  status text,
  scheduled_for timestamptz,
  origin text,
  message_payload jsonb,
  deleted_at timestamptz not null default now(),
  db_user text not null default current_user,
  application_name text default current_setting('application_name', true),
  deleting_query text
);

comment on table public.scheduled_checkins_delete_audit is
  'Audit AFTER DELETE de scheduled_checkins (chantier P0 rappels 12/07): qui supprime quoi, avec la requête appelante. Lecture service-role uniquement.';

alter table public.scheduled_checkins_delete_audit enable row level security;
-- Aucune policy: lisible/écrivable uniquement en service-role (RLS bypass).

create or replace function public.audit_scheduled_checkins_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.scheduled_checkins_delete_audit (
    deleted_row_id,
    user_id,
    event_context,
    status,
    scheduled_for,
    origin,
    message_payload,
    deleting_query
  ) values (
    old.id,
    old.user_id,
    old.event_context,
    old.status::text,
    old.scheduled_for,
    old.origin,
    old.message_payload,
    left(current_query(), 4000)
  );
  return old;
end;
$$;

drop trigger if exists trg_scheduled_checkins_delete_audit
  on public.scheduled_checkins;
create trigger trg_scheduled_checkins_delete_audit
  after delete on public.scheduled_checkins
  for each row
  execute function public.audit_scheduled_checkins_delete();
