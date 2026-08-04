-- DE-WHATSAPP — P8 : les reliques, celles que le renommage laisse toujours derrière.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QU'UN `ALTER TABLE ... RENAME TO` NE RENOMME PAS
--
-- P5 a renommé `whatsapp_outbound_messages` → `outbound_messages` et
-- `whatsapp_pending_actions` → `pending_actions`. Postgres a suivi les données,
-- pas les NOMS de ce qui les entoure : trois index et deux policies portent
-- encore l'ancien nom, sur les nouvelles tables.
--
-- Ce n'est pas cosmétique. Le prochain qui lit `\d outbound_messages` voit
-- `whatsapp_outbound_messages_user_id_idx` et en conclut, raisonnablement, que
-- la table est encore un truc WhatsApp. Un nom qui ment est une dette qui se
-- paie en relecture, à chaque fois.
--
-- Même raisonnement pour les fonctions : `cleanup_whatsapp_scheduling_for_user`
-- ne nettoie plus rien de WhatsApp — elle annule des `scheduled_checkins` et
-- des `pending_actions`, ce qu'elle faisait déjà, sous un nom devenu faux.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── §1 — INDEX ET POLICIES SUR LES TABLES RENOMMÉES ─────────────────────────

-- IDEMPOTENT par construction: une migration qui échoue à mi-parcours doit
-- pouvoir être relancée. `ALTER POLICY ... RENAME` et `ALTER FUNCTION ...
-- RENAME` lèvent si la cible existe déjà — d'où les gardes.
do $$
begin
  if to_regclass('public.whatsapp_outbound_messages_provider_message_id_key') is not null then
    execute 'alter index public.whatsapp_outbound_messages_provider_message_id_key '
         || 'rename to outbound_messages_provider_message_id_key';
  end if;
  if to_regclass('public.whatsapp_outbound_messages_status_next_retry_idx') is not null then
    execute 'alter index public.whatsapp_outbound_messages_status_next_retry_idx '
         || 'rename to outbound_messages_status_next_retry_idx';
  end if;
  if to_regclass('public.whatsapp_outbound_messages_user_id_idx') is not null then
    execute 'alter index public.whatsapp_outbound_messages_user_id_idx '
         || 'rename to outbound_messages_user_id_idx';
  end if;

  if exists (select 1 from pg_policy
              where polrelid = 'public.outbound_messages'::regclass
                and polname = 'rls_whatsapp_outbound_messages_select_own') then
    execute 'alter policy "rls_whatsapp_outbound_messages_select_own" '
         || 'on public.outbound_messages rename to rls_outbound_messages_select_own';
  end if;
  if exists (select 1 from pg_policy
              where polrelid = 'public.pending_actions'::regclass
                and polname = 'No direct access to whatsapp_pending_actions (select none)') then
    execute 'alter policy "No direct access to whatsapp_pending_actions (select none)" '
         || 'on public.pending_actions '
         || 'rename to "No direct access to pending_actions (select none)"';
  end if;
end $$;

-- ── §2 — UNE COLONNE MORTE, PROUVÉE MORTE ───────────────────────────────────
--
-- `student_meal_documents.whatsapp_message_id` gardait l'identifiant Meta du
-- message qui portait le PDF. Son unique writer était `meal-document-v1`, qui
-- ne fait plus d'envoi Graph depuis P3 : le document s'ANNONCE dans la bulle,
-- il ne se transporte plus.
--
-- Épreuve d'absence : `grep -rn "whatsapp_message_id"` sur `supabase/functions`
-- et `frontend/src` → **0 résultat**. Ni lecteur, ni écrivain.
alter table public.student_meal_documents
  drop column if exists whatsapp_message_id;

-- ── §3 — DES FONCTIONS QUI NE FONT PLUS CE QUE LEUR NOM DIT ─────────────────
--
-- Renommées, pas réécrites. Les triggers suivent l'OID, pas le nom : ils
-- continuent de pointer sur la même fonction.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'cleanup_whatsapp_scheduling_for_user') then
    execute 'alter function public.cleanup_whatsapp_scheduling_for_user(uuid) '
         || 'rename to cleanup_scheduling_for_user';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'handle_whatsapp_scheduling_access_tier_change') then
    execute 'alter function public.handle_whatsapp_scheduling_access_tier_change() '
         || 'rename to handle_scheduling_access_tier_change';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'queue_whatsapp_access_ended_notification') then
    execute 'alter function public.queue_whatsapp_access_ended_notification(uuid, text, text) '
         || 'rename to queue_access_ended_notification';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'whatsapp_scheduling_access_eligible') then
    execute 'alter function public.whatsapp_scheduling_access_eligible(text) '
         || 'rename to scheduling_access_eligible';
  end if;
  if exists (select 1 from pg_trigger
              where tgname = 'trg_refresh_whatsapp_scheduling_on_access_tier_change'
                and tgrelid = 'public.profiles'::regclass) then
    execute 'alter trigger trg_refresh_whatsapp_scheduling_on_access_tier_change '
         || 'on public.profiles rename to trg_refresh_scheduling_on_access_tier_change';
  end if;
end $$;

-- Le corps s'appelle lui-même par les anciens noms: on le repointe. Il est
-- RECOPIÉ depuis `pg_get_functiondef`, pas réécrit — réécrire à la main une
-- logique de bascule d'éligibilité, c'est réintroduire un bug pour corriger un
-- renommage (leçon de P6).
CREATE OR REPLACE FUNCTION public.handle_scheduling_access_tier_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if new.proactive_muted_at is null then
    perform public.request_morning_active_action_checkins_refresh(new.id);
    perform public.request_recurring_reminder_checkins_refresh(new.id, true);
  end if;

  return new;
end;
$function$;

-- ── §4 — LE TRIGGER D'OPT-IN, MORT AVEC SON DÉCLENCHEUR ─────────────────────
--
-- `sync_phone_verified_on_whatsapp_optin` posait `phone_verified_at` quand
-- `whatsapp_opted_in` passait à `true`. Plus personne ne met cette colonne à
-- `true` : `whatsapp-optin` est supprimée, et aucun parcours KEEL ne la touche.
-- Le trigger ne peut donc plus se déclencher.
--
-- ⚠️ CE QUE ÇA LAISSE OUVERT, ET IL FAUT LE DIRE :
-- `profiles.phone_verified_at` n'a désormais AUCUN writer automatique. La
-- décision P0.0 (identité élève = `auth.users` fantôme par numéro) notait déjà
-- que « le provisionnement devra poser `phone_verified_at` » — ce trigger était
-- la seule chose qui le faisait, par ricochet. Le supprimer sans le dire
-- laisserait une colonne éternellement nulle avec l'air d'être renseignée par
-- quelqu'un. C'est un reste de P4, et il est nommé dans STATUS.
drop trigger if exists sync_phone_verified_on_whatsapp_optin_trigger on public.profiles;
drop function if exists public.sync_phone_verified_on_whatsapp_optin();

comment on column public.profiles.phone_verified_at is
  'PLUS AUCUN WRITER AUTOMATIQUE depuis de-whatsapp (le trigger d''opt-in Meta '
  'qui la posait est supprime). A poser par le parcours de provisionnement '
  'eleve — voir P0.0 et STATUS-DEWHATSAPP.';

-- ── §5 — FAIL LOUD (R7) ─────────────────────────────────────────────────────
do $$
declare
  leftovers text;
begin
  -- Plus AUCUN objet nommé whatsapp_* — À DEUX EXEMPTIONS PRÈS, et les deux
  -- sont des noms qui disent la VÉRITÉ :
  --
  --   1. `whatsapp_cost_events` et ses index/policy. La table est gelée sous
  --      son nom, parce que ce qu'elle contient EST de l'historique WhatsApp.
  --   2. `profiles_whatsapp_*_idx`. Ces index portent sur les 17 colonnes
  --      gelées (`whatsapp_opted_in`, `whatsapp_state`…) qui existent toujours
  --      et gardent leur nom. Un index nommé d'après la colonne qu'il indexe
  --      ne ment pas; le renommer, si, puisqu'il ne correspondrait plus.
  --
  -- L'exemption est ÉNUMÉRÉE, pas large: tout objet whatsapp_* qui ne tombe pas
  -- dans ces deux cas fait échouer la migration.
  select string_agg(name, ', ' order by name) into leftovers from (
    select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind in ('r','v','m','i') and c.relname ilike '%whatsapp%'
       and c.relname not like 'whatsapp_cost_events%'
       and c.relname not like 'profiles_whatsapp\_%'
    union all
    select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname ilike '%whatsapp%'
    union all
    select t.tgname from pg_trigger t where not t.tgisinternal and t.tgname ilike '%whatsapp%'
    union all
    select pol.polname from pg_policy pol
     where pol.polname ilike '%whatsapp%' and pol.polname not like 'whatsapp_cost_events%'
  ) x;
  if leftovers is not null then
    raise exception 'dewhatsapp: reliques encore nommees whatsapp_*: %', leftovers;
  end if;

  -- La colonne morte est partie, la table est intacte.
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='student_meal_documents'
     and column_name='whatsapp_message_id';
  if found then raise exception 'dewhatsapp: whatsapp_message_id survit'; end if;
  if to_regclass('public.student_meal_documents') is null then
    raise exception 'dewhatsapp: student_meal_documents perdue';
  end if;

  -- La chaîne de triggers renommée FONCTIONNE ENCORE. On la rejoue pour de
  -- vrai (c'est elle qui avait cassé l'ajout d'un élève en P6), dans une
  -- sous-transaction annulée.
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values ('5a17beef-0000-4000-8000-00000000d0d0','00000000-0000-0000-0000-000000000000',
            'authenticated','authenticated','dewhatsapp.relic@test.invalid','x',
            now(),now(),now(),'{}','{}')
    on conflict (id) do nothing;
    update public.profiles set access_tier = 'alliance'
     where id = '5a17beef-0000-4000-8000-00000000d0d0';
    -- LA bascule qui déclenche la chaîne renommée.
    update public.profiles set access_tier = 'none'
     where id = '5a17beef-0000-4000-8000-00000000d0d0';
    raise exception 'dewhatsapp_relic_rollback';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'dewhatsapp_relic_rollback' then
        raise exception 'dewhatsapp: la chaine de scheduling renommee est cassee: %', sqlerrm;
      end if;
      raise notice 'dewhatsapp: chaine de scheduling renommee OK (sonde annulee)';
    when others then
      raise exception 'dewhatsapp: la chaine de scheduling renommee est cassee: % (%)', sqlerrm, sqlstate;
  end;

  raise notice 'dewhatsapp: reliques nettoyees';
end $$;
