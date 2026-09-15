-- DE-WHATSAPP — P5 : la démolition des tables, après l'épreuve d'absence.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- L'ORDRE EST LE CONTRAT : le CODE est parti AVANT cette migration.
--
-- Les 7 fonctions qui lisaient ces tables sont supprimées dans le même commit
-- (`whatsapp-webhook`, `whatsapp-send`, `whatsapp-optin`, `whatsapp-sim-inbound`,
-- `whatsapp-sim-trigger`, `process-whatsapp-outbound-retries`,
-- `process-whatsapp-optin-recovery`). Dropper d'abord et retirer le code
-- ensuite, c'est se donner une fenêtre pendant laquelle la production lève sur
-- chaque tour.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ÉPREUVE D'ABSENCE, table par table (grep sur le code vivant, hors migrations
-- et hors docs, APRÈS suppression des fonctions) :
--
--   whatsapp_inbound_dedup            0 lecteur  → DROP
--   whatsapp_link_requests            1, la purge RGPD (mise à jour ici) → DROP
--   whatsapp_link_tokens              0 lecteur (hors test réécrit) → DROP
--   whatsapp_monthly_quotas           0 lecteur  → DROP
--   whatsapp_optin_recovery           0 lecteur  → DROP
--   whatsapp_outbound_status_events   1, la purge RGPD (mise à jour ici) → DROP
--   whatsapp_unlinked_inbound_messages 0 lecteur → DROP
--   whatsapp_cost_events              GELÉE — voir §2
--
-- ─────────────────────────────────────────────────────────────────────────────
-- §1 — LES VUES DE COMPATIBILITÉ MEURENT ICI, COMME ANNONCÉ
--
-- `20260804120000` les a créées en écrivant « leur suppression est un livrable
-- de P5, pas une option ». Leurs six consommateurs n'existent plus.
drop view if exists public.whatsapp_outbound_messages;
drop view if exists public.whatsapp_pending_actions;

-- §2 — `whatsapp_cost_events` est GELÉE, PAS SUPPRIMÉE.
--
-- Elle porte le coût réel payé à Meta, mois par mois, sur de vrais élèves.
-- C'est la donnée qui a JUSTIFIÉ ce chantier (« au 1er octobre 2026, chaque
-- message sortant devient payant »), et la dropper effacerait la preuve du
-- raisonnement en même temps que la dépendance.
--
-- Gelée veut dire: plus aucun writer, et le CHECK ci-dessous le rend
-- structurel. La purge RGPD continue d'en retirer les lignes d'un compte
-- supprimé — un gel n'est pas une exemption au droit à l'effacement.
comment on table public.whatsapp_cost_events is
  'GELÉE (de-whatsapp, 2026-08-04). Historique des coûts Meta, conservé parce '
  'qu''il justifie l''abandon du canal. Plus aucun writer applicatif; la purge '
  'RGPD y supprime toujours les lignes d''un compte effacé.';

revoke insert, update on public.whatsapp_cost_events from authenticated, anon;

-- §3 — LES TABLES MORTES.
--
-- `cascade` sur les FK entrantes uniquement — chacune de ces tables est une
-- FEUILLE du graphe (rien ne dépend d'elles), ce que le contrôle final vérifie.
drop table if exists public.whatsapp_inbound_dedup cascade;
drop table if exists public.whatsapp_link_requests cascade;
drop table if exists public.whatsapp_link_tokens cascade;
drop table if exists public.whatsapp_monthly_quotas cascade;
drop table if exists public.whatsapp_optin_recovery cascade;
drop table if exists public.whatsapp_outbound_status_events cascade;
drop table if exists public.whatsapp_unlinked_inbound_messages cascade;

-- §4 — LES CRONS MORTS.
--
-- Déprogrammés par NOUVELLE migration, jamais en réécrivant l'ancienne: la
-- production a déjà appliqué celles-là.
do $$
declare
  j record;
  n int := 0;
begin
  if to_regclass('cron.job') is null then
    raise notice 'dewhatsapp: pg_cron absent, rien a deprogrammer';
    return;
  end if;
  for j in
    select jobid, jobname from cron.job
     where jobname in (
       'process-whatsapp-outbound-retries',
       'process-whatsapp-optin-recovery',
       'whatsapp-outbound-retries',
       'whatsapp-optin-recovery'
     )
  loop
    perform cron.unschedule(j.jobid);
    n := n + 1;
    raise notice 'dewhatsapp: cron deprogramme -> %', j.jobname;
  end loop;
  raise notice 'dewhatsapp: % cron(s) deprogramme(s)', n;
end $$;

-- §5 — FAIL LOUD (R7).
do $$
declare
  leftovers text;
begin
  -- Les 7 tables mortes ont disparu, et les 2 vues avec.
  select string_agg(c.relname, ', ' order by c.relname) into leftovers
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'v')
     and c.relname like 'whatsapp%'
     and c.relname <> 'whatsapp_cost_events';
  if leftovers is not null then
    raise exception 'dewhatsapp: objets whatsapp_* encore debout: %', leftovers;
  end if;

  -- La gelée est TOUJOURS là: un gel qui droppe n'est pas un gel.
  if to_regclass('public.whatsapp_cost_events') is null then
    raise exception 'dewhatsapp: whatsapp_cost_events a ete droppee au lieu d''etre gelee';
  end if;

  -- Les tables neuves ont survécu au `cascade`.
  if to_regclass('public.outbound_messages') is null then
    raise exception 'dewhatsapp: outbound_messages perdue';
  end if;
  if to_regclass('public.pending_actions') is null then
    raise exception 'dewhatsapp: pending_actions perdue';
  end if;
  if to_regclass('public.inbound_dedup') is null then
    raise exception 'dewhatsapp: inbound_dedup perdue';
  end if;
  if to_regclass('public.chat_messages') is null then
    raise exception 'dewhatsapp: chat_messages perdue';
  end if;

  -- Et le temps réel n'a pas été emporté par un `cascade`.
  perform 1 from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename = 'chat_messages';
  if not found then
    raise exception 'dewhatsapp: chat_messages est sortie de la publication realtime';
  end if;

  raise notice 'dewhatsapp: 7 tables droppees, 2 vues de compat retirees, cost_events gelee';
end $$;
