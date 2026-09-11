-- ===========================================================================
-- FF-063 LOT 0 — LE CYCLE DE VIE A UN INTERRUPTEUR, ET UN TÉMOIN DE PRÉSENCE.
--
-- Autorité produit: docs/fonctionnalites/acquisition-et-acces/README.md ·
-- docs/keel/LEGAL.md §6.1 et §6.2 (ce qu'une copie de contrôle du poids n'a
-- pas le droit de dire) · CLAUDE.md « le modèle produit ».
--
-- Ce lot ne fait PARTIR aucun e-mail. Il pose les quatre faits sans lesquels
-- une séquence de cycle de vie ne peut pas exister honnêtement.
--
-- ── 1. LE DROIT DE NE PLUS RECEVOIR ────────────────────────────────────────
-- Le dépôt envoie aujourd'hui quatre e-mails, tous TRANSACTIONNELS (bienvenue,
-- départ de coach, invitation, export). `_shared/resend.ts` ne pose aucun
-- en-tête `List-Unsubscribe`, et aucune colonne ne dit « cette personne ne veut
-- plus de mails ». Tant que c'est vrai, un mail « ton plan se termine demain »
-- n'a pas de sortie de secours — sauf le bouton *spam*, qui dégrade la
-- réputation du domaine d'envoi pour TOUT ce qui part, reçus compris.
--
-- ⚠️ UN SEUL INTERRUPTEUR, pas trois familles. Décision du propriétaire le
-- 2026-09-09. Une préférence par famille demanderait une page de préférences,
-- et surtout obligerait chaque nouveau mail à CHOISIR sa famille — un choix que
-- personne ne vérifierait. Un booléen daté se tient tout seul.
--
-- ── 2. LE JETON QUI PORTE LE LIEN ─────────────────────────────────────────
-- Se désinscrire ne demande pas de se connecter: quelqu'un qui ne veut plus de
-- nos mails ne va pas retrouver son mot de passe pour nous le dire. C'est la
-- forme de `/join?token=` et de `/join-household?token=`: une page publique,
-- une RPC `anon`, un jeton opaque. Le jeton vit sur la ligne plutôt que dans
-- une table à part parce qu'il est PERMANENT — il n'expire pas, ne se consomme
-- pas, et le même lien doit marcher dans un mail d'il y a six mois.
--
-- ── 3. LE TÉMOIN DE PRÉSENCE ──────────────────────────────────────────────
-- Vérifié le 2026-09-09: AUCUNE colonne du dépôt n'enregistre qu'une personne
-- a ouvert l'app. Toutes les traces existantes sont des ÉCRITURES (une case de
-- cuisson, une case de courses, un message, une pesée). Lire son plan — le
-- geste le plus fréquent du produit — ne laisse rien.
--
-- Conséquence, et c'est elle qui a dicté ce lot: « cette personne n'utilise
-- plus l'app » n'est pas mesurable. Une séquence bâtie sur le silence enverrait
-- « on ne te voit plus » au jour 3 à quelqu'un qui a un plan de sept jours en
-- cours, c'est-à-dire au comportement NOMINAL du produit. Le curseur des
-- relances reste `student_generated_meals.ends_on` (la fin de couverture);
-- `last_seen_at` n'est qu'un second garde-fou, jamais le déclencheur.
--
-- ── 4. L'ESSAI DIT SEPT ET LA BASE DIT QUATORZE ───────────────────────────
-- `keel_household_trial_days()` vaut 7 depuis le 2026-09-01 et la page de vente
-- l'annonce. `profiles.trial_end` — la seule horloge d'un compte SANS foyer, et
-- celle du MAÎTRE d'un foyer (que `recompute_profile_access_tier` exclut de
-- `household_member`, cf. 20260811050000) — vaut toujours `now() + 14 days`.
-- Deux dates coexistent sur la même personne et ne disent pas la même chose.
--
-- ⛔ AUCUN BACKFILL, exactement pour le motif écrit en
-- 20260901200000_the_trial_is_a_week.sql:20-25: un compte garde ce qui LUI a
-- été promis. Le nouveau nombre ne vaut que pour les comptes NÉS APRÈS.
-- `handle_new_user` (dernière version: 20260811060000) ne nomme pas
-- `trial_end` dans son `insert` — c'est bien le DÉFAUT de la colonne qui décide.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ────────────────────────────────────
-- ❌ Aucun trigger (donc rien à ajouter à la liste `expected` du second `it()`
--    de frontend/src/edge/coverage-guard.int.test.ts).
-- ❌ Aucune table neuve.
-- ❌ Aucun envoi, aucun cron, aucune fonction edge.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. LES TROIS COLONNES
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists lifecycle_emails_opted_out_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists unsubscribe_token uuid;

comment on column public.profiles.lifecycle_emails_opted_out_at is
  'L''instant où la personne a demandé à ne plus recevoir les e-mails de CYCLE '
  'DE VIE (relances, fin de couverture, fin d''essai). NULL = elle les reçoit. '
  'Un INSTANT et pas un booléen: « depuis quand » est la seule chose qu''on '
  'aura besoin de savoir le jour d''une réclamation. Les e-mails '
  'TRANSACTIONNELS (bienvenue, reçu Stripe, sécurité, export, suppression) '
  'l''ignorent — ils ne relèvent pas du consentement, ils exécutent une demande.';

comment on column public.profiles.last_seen_at is
  'Le dernier démarrage d''app constaté, posé par public.keel_touch_last_seen(). '
  'Le seul témoin de LECTURE du dépôt: toutes les autres traces sont des '
  'écritures (cuisson, courses, message, pesée), et lire son plan n''en laisse '
  'aucune. Second garde-fou des relances, JAMAIS leur déclencheur — celui-là '
  'reste student_generated_meals.ends_on. NULL = jamais mesuré (comptes '
  'antérieurs à ce lot), et « jamais mesuré » ne veut pas dire « absent ».';

comment on column public.profiles.unsubscribe_token is
  'Le jeton opaque que porte le lien de désinscription de chaque e-mail. '
  'PERMANENT: il n''expire pas et ne se consomme pas, parce qu''un lien reçu il '
  'y a six mois doit encore marcher. Lu par public.keel_lifecycle_unsubscribe() '
  'et par elle seule. Ce n''est pas un secret d''authentification: le connaître '
  'ne permet que de couper des e-mails, jamais de lire ou d''écrire autre chose.';

-- Le backfill, puis le NOT NULL, plutôt qu'un `add column ... not null default
-- gen_random_uuid()`: même coût (un défaut VOLATILE réécrit la table de toute
-- façon, il faut une valeur distincte par ligne), mais les trois temps se
-- relisent. C'est le patron de 20260810200000_household_profile_claim.sql:96-121.
update public.profiles
set unsubscribe_token = gen_random_uuid()
where unsubscribe_token is null;

alter table public.profiles
  alter column unsubscribe_token set default gen_random_uuid(),
  alter column unsubscribe_token set not null;

-- Unique, et c'est la garde: la RPC de désinscription cherche PAR ce jeton, et
-- deux lignes qui le partageraient rendraient son `update` non déterministe.
create unique index if not exists profiles_unsubscribe_token_key
  on public.profiles (unsubscribe_token);

-- ---------------------------------------------------------------------------
-- 2. L'ESSAI PASSE À SEPT JOURS — POUR LES COMPTES À VENIR SEULEMENT
-- ---------------------------------------------------------------------------

alter table public.profiles
  alter column trial_end set default (now() + interval '7 days');

comment on column public.profiles.trial_end is
  'La fin d''essai d''un COMPTE. SEPT jours depuis le 2026-09-09, quatorze '
  'auparavant; aucun backfill, un compte garde ce qui lui a été promis. Doit '
  'valoir keel_household_trial_days() et HOUSEHOLD_TRIAL_DAYS de '
  '_shared/billing-tier.ts. ⚠️ Ce n''est PAS la seule horloge d''essai: un '
  'membre de foyer (role <> ''owner'') est couvert par households.free_until, '
  'et free_until IS NULL veut dire COUVERT, jamais expiré. Toute lecture de '
  '« l''essai de cette personne finit le X » passe par keel_household_of() '
  'd''abord et ne retombe ici que pour un compte sans foyer.';

-- ---------------------------------------------------------------------------
-- 3. L'INDEX QUE LE PLAFOND VA LIRE
-- ---------------------------------------------------------------------------
-- Les deux règles de cadence — quatre e-mails sur trente jours glissants, et
-- jamais deux en soixante-douze heures — se posent la MÊME question pour chaque
-- candidat: « les lignes récentes de cette personne ». `communication_logs` n'a
-- aujourd'hui que deux index simples (`type`, `user_id`), donc cette question
-- se paie un tri à chaque appel.
create index if not exists communication_logs_user_created_idx
  on public.communication_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. LA DÉSINSCRIPTION — UNE RPC ANONYME, IDEMPOTENTE
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER parce que l'appelant est `anon`: il n'a — et ne doit avoir —
-- aucun droit sur `profiles`. Le seul pouvoir conféré par cette fonction est
-- celui de poser une date sur la ligne qui porte le jeton présenté.
--
-- Elle rend un booléen et rien d'autre. Pas de prénom, pas d'e-mail, pas de
-- « ce jeton a expiré »: une page publique qui rendrait un fait sur le compte
-- transformerait un jeton de confort en oracle.
create or replace function public.keel_lifecycle_unsubscribe(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_token is null then
    return false;
  end if;

  select id into v_id
  from public.profiles
  where unsubscribe_token = p_token;

  if v_id is null then
    return false;
  end if;

  -- Idempotente: un second clic ne réécrit pas la date. « Depuis quand » doit
  -- rester la date du PREMIER refus, c'est elle qui a une valeur juridique.
  update public.profiles
  set lifecycle_emails_opted_out_at = now()
  where id = v_id
    and lifecycle_emails_opted_out_at is null;

  return true;
end;
$$;

comment on function public.keel_lifecycle_unsubscribe(uuid) is
  'Coupe les e-mails de CYCLE DE VIE de la ligne qui porte ce jeton. Rend true '
  'si le jeton désigne quelqu''un, false sinon — et rien d''autre, jamais un '
  'fait sur le compte. Idempotente: la date reste celle du premier refus. '
  'Appelée SANS session depuis la page publique /unsubscribe.';

-- Les privilèges PAR DÉFAUT de ce projet accordent `execute` à `anon`,
-- `authenticated` et `service_role` sur toute fonction neuve — DIRECTEMENT, pas
-- via `public`. `revoke ... from public` seul ne retire donc rien. On révoque
-- aux rôles nommés, puis on rend ce qui est voulu.
revoke all on function public.keel_lifecycle_unsubscribe(uuid)
  from public, anon, authenticated;
grant execute on function public.keel_lifecycle_unsubscribe(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. LE TÉMOIN DE PRÉSENCE — UNE RPC DE SESSION
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER, volontairement: la policy « Users own profiles » scope déjà
-- l'écriture à la ligne de l'appelant, et un SECURITY DEFINER ici ferait de
-- cette fonction un écrivain capable de toucher n'importe qui — pour un gain
-- nul. `auth.uid()` est la seule cible, et l'horloge est celle du serveur:
-- ni l'un ni l'autre ne se passe en argument.
create or replace function public.keel_touch_last_seen()
returns void
language sql
security invoker
set search_path = public
as $$
  update public.profiles
  set last_seen_at = now()
  where id = (select auth.uid());
$$;

comment on function public.keel_touch_last_seen() is
  'Pose profiles.last_seen_at = now() sur la ligne de l''appelant. Le SEUL '
  'écrivain de cette colonne. Appelée une fois par démarrage d''app, freinée '
  'côté navigateur à une fois par jour: c''est une présence, pas un journal.';

-- Même piège qu'au-dessus, et ici il MORD: sans le `revoke` nommé sur `anon`,
-- une requête sans session pourrait appeler cette fonction. Elle n'écrirait
-- rien (`auth.uid()` est NULL, le `where` ne trouve aucune ligne), mais un
-- droit qui ne sert à rien est un droit qu'on retire.
revoke all on function public.keel_touch_last_seen()
  from public, anon;
grant execute on function public.keel_touch_last_seen() to authenticated;

-- ---------------------------------------------------------------------------
-- LA PREUVE — fail loud (R7)
-- ---------------------------------------------------------------------------
-- « Les colonnes existent » est la vérification qui ne prouve rien. On assert
-- donc aussi le DÉFAUT (c'est lui, et pas la constante, qui décide de l'essai),
-- l'unicité du jeton, et les DROITS des deux fonctions — un `grant` oublié sur
-- `anon` ne se verrait qu'au premier clic d'un vrai destinataire.
do $$
declare
  v_default text;
  v_notnull boolean;
begin
  -- 1. Les trois colonnes.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'lifecycle_emails_opted_out_at'
  ) then
    raise exception 'ff063 lot0: profiles.lifecycle_emails_opted_out_at absente';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'last_seen_at'
  ) then
    raise exception 'ff063 lot0: profiles.last_seen_at absente';
  end if;

  -- 2. Le jeton: présent, NOT NULL, unique, et posé sur TOUTES les lignes.
  select is_nullable = 'NO' into v_notnull
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name = 'unsubscribe_token';
  if v_notnull is distinct from true then
    raise exception 'ff063 lot0: profiles.unsubscribe_token n''est pas NOT NULL';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'profiles_unsubscribe_token_key'
  ) then
    raise exception 'ff063 lot0: l''index unique du jeton est absent';
  end if;

  if exists (select 1 from public.profiles where unsubscribe_token is null) then
    raise exception 'ff063 lot0: des lignes de profiles n''ont pas de jeton';
  end if;

  -- 3. L'essai. C'est le DÉFAUT qui décide — `handle_new_user` ne nomme pas la
  -- colonne. Un test sur la constante Deno ne verrait pas cette ligne-ci.
  select column_default into v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name = 'trial_end';
  if v_default is null or position('7 days' in v_default) = 0 then
    raise exception
      'ff063 lot0: le défaut de profiles.trial_end ne dit pas 7 jours (%)', v_default;
  end if;

  -- 4. L'index de cadence.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'communication_logs_user_created_idx'
  ) then
    raise exception 'ff063 lot0: communication_logs_user_created_idx absent';
  end if;

  -- 5. Les droits. `anon` DOIT pouvoir se désinscrire, et ne DOIT PAS pouvoir
  -- écrire une présence sur le compte de quelqu'un d'autre.
  if not has_function_privilege(
    'anon', 'public.keel_lifecycle_unsubscribe(uuid)', 'execute'
  ) then
    raise exception 'ff063 lot0: anon ne peut pas exécuter keel_lifecycle_unsubscribe';
  end if;

  if has_function_privilege(
    'anon', 'public.keel_touch_last_seen()', 'execute'
  ) then
    raise exception 'ff063 lot0: anon peut exécuter keel_touch_last_seen';
  end if;

  if not has_function_privilege(
    'authenticated', 'public.keel_touch_last_seen()', 'execute'
  ) then
    raise exception 'ff063 lot0: authenticated ne peut pas exécuter keel_touch_last_seen';
  end if;

  -- 6. Le régime des deux fonctions. Inverser les deux serait invisible en
  -- lecture et grave: une désinscription en INVOKER ne marcherait jamais pour
  -- `anon`, et une présence en DEFINER pourrait écrire chez n'importe qui.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'keel_lifecycle_unsubscribe'
      and p.prosecdef
  ) then
    raise exception 'ff063 lot0: keel_lifecycle_unsubscribe n''est pas SECURITY DEFINER';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'keel_touch_last_seen'
      and p.prosecdef
  ) then
    raise exception 'ff063 lot0: keel_touch_last_seen est SECURITY DEFINER';
  end if;

  raise notice 'ff063 lot0: interrupteur, jeton, présence et essai à 7 jours en place';
end $$;
