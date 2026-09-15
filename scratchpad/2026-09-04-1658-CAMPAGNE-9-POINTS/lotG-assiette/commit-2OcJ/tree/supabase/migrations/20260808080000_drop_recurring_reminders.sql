-- RETRAIT DES RAPPELS RÉCURRENTS — lot 2 du retrait des résidus grand public.
--
-- `user_recurring_reminders` portait les « rendez-vous » du dashboard grand
-- public : séries de messages proactifs configurées, livrées par
-- `process-checkins`, classifiées par `classify-recurring-reminder`.
-- Les rappels PONCTUELS du chat (outil one_shot_reminder → `scheduled_checkins`)
-- sont un système distinct et NE SONT PAS touchés.
--
-- POURQUOI ELLE PART — les preuves, pas l'intuition :
--
--   1. DÉCISION HUMAINE du 2026-08-08, à deux titres. Produit : le verdict
--      « garder ou retirer la commodité » a été posé à l'humain, réponse
--      « Retirer ». Périmètre : le produit grand public (« coach de vie ») a
--      0 utilisateur — ce qui renverse le verdict « GARDÉE » posé la veille
--      par `20260808060000_retrait_residus_raisons_de_conservation.sql`.
--
--   2. AUCUN ÉCRIVAIN VIVANT. `classify-recurring-reminder`, seule créatrice
--      de lignes, n'avait AUCUN appelant (zéro invocation dans tout le dépôt,
--      commentaires exclus — son client était le dashboard `/dashboard`,
--      démonté et supprimé au pivot). L'autre source (`source_kind =
--      'potion_generated'`) part avec le lot attaque/potions, décision humaine
--      « Retirer les deux ».
--
--   3. LE CHEMIN DE LIVRAISON ÉTAIT DÉJÀ CASSÉ. La livraison hors fenêtre 24h
--      appelait `consume_whatsapp_monthly_quota` / `release_whatsapp_monthly_quota`
--      — deux RPC qui N'EXISTENT PLUS en base (parties avec le chantier
--      de-whatsapp) : `pg_proc` ne les connaît pas. Toute livraison template
--      aurait jeté une erreur.
--
--   4. CODE RETIRÉ D'ABORD, dans le commit qui porte cette migration :
--      pipeline complet de `process-checkins` (~380 lignes), bloc de prompt
--      « RAPPELS RÉCURRENTS CONFIGURÉS » du loader, lecture E6 du récap
--      durable, requête et champs de `checkin_scope.ts`, signal dispatcher
--      `dashboard_recurring_reminder_intent`, surface `dashboard.reminders`,
--      fonction edge `classify-recurring-reminder/`.
--
--   5. DONNÉES. 0 ligne en local. Épreuves : prosrc = zéro fonction, vues =
--      zéro, cron = aucun job dédié (la table n'était traversée que par
--      `process-checkins`, qui reste pour les check-ins du chat).
--
-- EXPORT RGPD : `account-export-v1` n'a jamais exporté cette table (elle est
-- antérieure au pivot et n'a pas été reprise dans l'export KEEL) — rien à
-- débrancher, et après ce drop il n'y a plus rien à réclamer.
--
-- ORDRE — la colonne étrangère d'abord (même motif que la carte de défense),
-- la table ensuite, en RESTRICT : un dépendant inattendu doit faire ÉCHOUER
-- cette migration, pas partir avec elle.

begin;

-- `scheduled_checkins` (infrastructure du chat, GARDÉE) référençait la série
-- mère via cette colonne (`on delete set null`). Plus aucun code ne la lit ni
-- ne l'écrit après ce lot.
alter table public.scheduled_checkins
  drop column if exists recurring_reminder_id;

drop table public.user_recurring_reminders;

-- ── LES QUATRE FONCTIONS SQL QUE LE GREP APPLICATIF NE VOIT PAS ─────────────
-- C'est l'épreuve « prosrc » qui les a attrapées, APRÈS le drop de colonne :
-- `scheduled_checkins_enforce_min_gap_1h` lisait `new.recurring_reminder_id`
-- — avec la colonne droppée, CHAQUE insert de `scheduled_checkins` aurait
-- jeté une erreur. Un trigger sur une table gardée qui référence une colonne
-- droppée est une bombe silencieuse jusqu'au premier insert.

-- 1) min-gap : la clause récurrente part, les engagements one-shot restent
-- protégés.
create or replace function public.scheduled_checkins_enforce_min_gap_1h()
 returns trigger
 language plpgsql
as $function$
declare
  conflicting_scheduled_for timestamptz;
  attempts int := 0;
begin
  -- Explicit user reminders are commitments. Do not rewrite the time after
  -- Sophia confirmed it. (retrait résidus 2026-08-08: la clause
  -- recurring_reminder est partie avec sa colonne et sa table.)
  if new.event_context like 'one_shot_reminder:%'
    or new.message_payload->>'reminder_kind' = 'one_shot' then
    return new;
  end if;

  -- Only enforce on active/sent checkins.
  if new.status::text not in ('pending', 'awaiting_user', 'sent') then
    return new;
  end if;

  -- Ensure deterministic convergence in pathological cases.
  while attempts < 48 loop
    select max(sc.scheduled_for)
      into conflicting_scheduled_for
    from public.scheduled_checkins sc
    where sc.user_id = new.user_id
      and sc.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and sc.status::text in ('pending', 'awaiting_user', 'sent')
      and abs(extract(epoch from (sc.scheduled_for - new.scheduled_for))) < 3600;

    exit when conflicting_scheduled_for is null;

    -- Move after the latest conflicting checkin to guarantee >= 1h spacing.
    new.scheduled_for := conflicting_scheduled_for + interval '1 hour';
    attempts := attempts + 1;
  end loop;

  return new;
end;
$function$;

-- 2) tier-change : ne rafraîchit plus des séries qui n'existent plus. Le
-- corps est l'original à l'octet près, moins l'appel à
-- request_recurring_reminder_checkins_refresh (droppée ci-dessous).
create or replace function public.handle_scheduling_access_tier_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  was_eligible boolean := false;
  is_eligible boolean := false;
  should_queue_access_ended boolean := false;
begin
  was_eligible := public.scheduling_access_eligible(old.access_tier);
  is_eligible := public.scheduling_access_eligible(new.access_tier);
  should_queue_access_ended :=
    lower(coalesce(new.access_tier, '')) = 'none'
    and lower(coalesce(old.access_tier, '')) in ('trial', 'system', 'alliance', 'architecte');

  if should_queue_access_ended then
    perform public.queue_access_ended_notification(new.id, old.access_tier, new.access_tier);
  end if;

  if was_eligible = is_eligible then
    return new;
  end if;

  if not is_eligible then
    perform public.cleanup_scheduling_for_user(new.id);
    return new;
  end if;

  -- 🔴 LE MÊME DÉFAUT QUE LES TROIS CRONS PROACTIFS, TROUVÉ ICI AU BALAYAGE.
  --
  -- La condition était `coalesce(new.whatsapp_opted_in, false)`. Cette colonne
  -- vaut `false` par défaut et plus personne ne la met à `true` depuis la
  -- suppression de `whatsapp-optin`: un élève qui REDEVIENT éligible (reprise
  -- d'abonnement, fin de pause) ne voyait donc JAMAIS ses rappels reprogrammés.
  -- Il repayait, et le silence continuait.
  --
  -- Le mute produit est `proactive_muted_at`, et son absence veut dire
  -- « il accepte les relances ».
  -- (retrait résidus 2026-08-08: l'appel à
  -- request_recurring_reminder_checkins_refresh est parti avec les rappels
  -- récurrents; la fonction est droppée ci-dessous.)
  if new.proactive_muted_at is null then
    perform public.request_morning_active_action_checkins_refresh(new.id);
  end if;

  return new;
end;
$function$;

-- 3) La fonction de refresh des séries récurrentes n'a plus d'objet — et elle
-- POSTait vers `schedule-whatsapp-v2-checkins`, une edge function qui n'existe
-- plus depuis le chantier de-whatsapp : le chemin était déjà mort.
drop function public.request_recurring_reminder_checkins_refresh(uuid, boolean);

-- 4) cleanup_scheduling_for_user : corps ORIGINAL (20260804140000, « recopiés
-- depuis pg_get_functiondef plutôt que réécrits »), moins les seules clauses
-- recurring_reminder. Le périmètre d'annulation reste scopé au nudge du matin
-- — l'élargir annulerait les bilans KEEL au premier changement de tier.
create or replace function public.cleanup_scheduling_for_user(p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if p_user_id is null then
    return;
  end if;

  update public.scheduled_checkins
  set
    status = 'cancelled',
    processed_at = now()
  where user_id = p_user_id
    and status::text in ('pending', 'retrying', 'awaiting_user')
    and scheduled_for >= now()
    and event_context = 'morning_active_actions_nudge';

  update public.pending_actions
  set
    status = 'cancelled',
    processed_at = now()
  where user_id = p_user_id
    and status = 'pending'
    and kind = 'scheduled_checkin'
    and coalesce(payload->>'event_context', '') = 'morning_active_actions_nudge';
end;
$function$;

do $$
begin
  if to_regclass('public.user_recurring_reminders') is not null then
    raise exception 'drop_recurring_reminders: la table existe encore';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scheduled_checkins'
      and column_name = 'recurring_reminder_id'
  ) then
    raise exception 'drop_recurring_reminders: la colonne scheduled_checkins.recurring_reminder_id existe encore';
  end if;
end $$;

commit;
