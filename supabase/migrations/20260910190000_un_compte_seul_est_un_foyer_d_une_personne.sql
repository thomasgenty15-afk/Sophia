-- ===========================================================================
-- LOT 1 · UN COMPTE SEUL EST UN FOYER D'UNE PERSONNE
--
-- Plan: docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md, lot 1.
--
-- CE QUE CETTE MIGRATION INSTALLE
-- -------------------------------
--   1. `households.origin` — d'où vient ce foyer: constitué à la main, ou posé
--      par le provisionnement automatique. Il ne décide d'AUCUN droit.
--   2. `keel_ensure_personal_household(p_user)` — la primitive idempotente.
--
-- ⛔ LA RÈGLE QUI GOUVERNE TOUT CE FICHIER
-- ---------------------------------------
-- « Un compte sans rattachement reçoit un foyer personnel avec un membre
--   titulaire. Un compte déjà membre d'un foyer conserve ce rattachement. Ne
--   pas créer de double appartenance. »
--
-- La non-duplication ne repose PAS sur la bonne volonté de l'appelant: elle est
-- tenue par un verrou consultatif par compte ET par l'index unique
-- `household_members_one_per_user` qui existe déjà. Deux appels concurrents
-- rendent les mêmes identifiants; le second n'insère rien.
--
-- ⛔⛔ L'ESSAI — DÉCISION DU PROPRIÉTAIRE DU 2026-09-10, QUI RENVERSE LE § 1.4
-- --------------------------------------------------------------------------
-- Le plan écrivait « créer un foyer technique n'accorde ni nouvel essai ni
-- abonnement collectif ». Le propriétaire a tranché l'inverse, en connaissance
-- de la conséquence, après lecture de ce qui suit:
--
--   · `generate-meal-v1:820` dit en toutes lettres « UN APPELANT SANS FOYER
--     PASSE, et ce n'est pas un oubli (arbitrage D13) ». Aujourd'hui, un compte
--     sans foyer ne passe AUCUNE porte de facturation;
--   · `keel_household_is_covered` traite `free_until IS NULL` comme couvert
--     POUR TOUJOURS. Poser `NULL` pour « ne rien accorder » accorderait donc
--     l'accès à vie;
--   · le défaut de la colonne est `CURRENT_DATE + keel_household_trial_days()`,
--     soit sept jours.
--
-- ⚠️ IL N'Y A PAS DE CHOIX NEUTRE, et c'est pour ça que la décision est ici et
-- pas dans le code applicatif. **Cette fonction laisse le DÉFAUT s'appliquer**:
-- sept jours à compter du jour de la création. Conséquence assumée et mesurée
-- le 2026-09-10: **1 437 comptes n'ont pas de foyer, dont 17 ont déjà généré un
-- plan**; ces dix-sept voient apparaître une porte qui n'existait pas pour eux.
--
-- ⛔ CE N'EST PAS UN OUBLI D'IMPLÉMENTATION. Quiconque lit ce fichier en
-- cherchant « pourquoi personne n'a préservé le droit d'avant » a trouvé la
-- réponse: le droit d'avant était « aucune porte », et le reconduire aurait
-- voulu dire « aucune porte, pour toujours ».
--
-- RGPD — cette migration ne crée aucune donnée personnelle nouvelle. Le prénom
-- et la date de naissance viennent de `profiles`, déjà réclamés par le cycle de
-- vie existant. Aucun consentement, objectif, mesure ni référence n'est inventé.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) L'ORIGINE D'UN FOYER — un fait, jamais un droit
-- ---------------------------------------------------------------------------
--
-- ⚠️ ELLE NE DÉCIDE DE RIEN. Le plan l'exige: « Ce marqueur ne décide pas des
-- droits commerciaux. » Il sert à répondre à une question de lecture — « ce
-- foyer a-t-il été voulu, ou posé par la machine ? » — que rien d'autre ne peut
-- répondre une fois la ligne écrite. Sans lui, un foyer d'une personne et un
-- foyer dont tout le monde est parti sont le même objet.
alter table public.households
  add column if not exists origin text not null default 'created';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'households_origin_check'
  ) then
    alter table public.households
      add constraint households_origin_check
      check (origin in ('created', 'personal_auto'));
  end if;
end
$$;

comment on column public.households.origin is
  'LOT 1 — `created`: foyer constitué par quelqu''un. `personal_auto`: foyer '
  'd''une personne posé par `keel_ensure_personal_household`. Un FAIT de '
  'provenance, jamais un droit: la couverture se lit dans '
  '`keel_household_is_covered`, et elle seule.';

-- ---------------------------------------------------------------------------
-- 2) LA PRIMITIVE — idempotente, verrouillée, et muette sur les droits
-- ---------------------------------------------------------------------------
--
-- ⛔ DEUX APPELANTS, UNE SEULE FONCTION, ET LE GARDE EST DANS LE CORPS.
--   · le CLIENT appelle sans argument: `p_user` vaut `null`, on prend
--     `auth.uid()`. Il ne peut donc provisionner que lui-même;
--   · le SERVEUR (rattrapage) passe `p_user` explicitement, et ce chemin exige
--     `auth.role() = 'service_role'`.
-- Un `p_user` arbitraire depuis un jeton d'utilisateur est refusé — c'est la
-- seule façon d'empêcher qu'on fabrique un foyer au nom de quelqu'un d'autre.
create or replace function public.keel_ensure_personal_household(
  p_user uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor   uuid := (select auth.uid());
  v_role    text := coalesce((select auth.role()), '');
  v_user    uuid;
  v_hh      uuid;
  v_member  uuid;
  v_first   text;
  v_birth   date;
  v_deleted timestamptz;
  v_free    date;
  v_origin  text;
begin
  -- ── QUI PROVISIONNE-T-ON ? ───────────────────────────────────────────────
  if p_user is not null and p_user is distinct from v_actor and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  v_user := coalesce(p_user, v_actor);
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- ── UN COMPTE SUPPRIMÉ NE SE RECRÉE PAS ─────────────────────────────────
  -- ⛔ Le plan l'exige nommément. Sans cette garde, le rattrapage — ou un
  -- appel d'entrée de générateur — ressusciterait un foyer pour un compte que
  -- quelqu'un a demandé à effacer.
  select u.deleted_at into v_deleted from auth.users u where u.id = v_user;
  if v_deleted is not null then
    return jsonb_build_object('ok', false, 'reason', 'account_deleted');
  end if;

  -- ── LE VERROU, AVANT LA LECTURE ─────────────────────────────────────────
  -- ⚠️ AVANT, PAS APRÈS. Lire puis créer sans verrou laisse deux appels
  -- concurrents lire « aucun foyer » tous les deux. L'index unique les
  -- rattraperait par une ERREUR; le verrou les fait s'attendre et rendre le
  -- même identifiant, ce qui est ce que « idempotent » veut dire.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select hm.household_id, hm.member_id into v_hh, v_member
  from public.household_members hm
  where hm.user_id = v_user
  limit 1;

  if v_hh is not null then
    select h.origin, h.free_until into v_origin, v_free
    from public.households h where h.id = v_hh;
    -- ⛔ ON NE TOUCHE À RIEN. Ni rôle, ni référence, ni échéance, ni origine.
    -- Un compte déjà rattaché est rendu tel quel: c'est la moitié « ne pas
    -- créer de double appartenance », et c'est aussi la moitié « ne pas
    -- réinitialiser un essai ».
    return jsonb_build_object(
      'ok', true, 'created', false,
      'household_id', v_hh, 'member_id', v_member,
      'origin', v_origin, 'free_until', v_free
    );
  end if;

  -- ── L'IDENTITÉ VIENT DE `profiles`, ET DE NULLE PART AILLEURS ───────────
  -- ⚠️ LE PROFIL PEUT NE PAS EXISTER ENCORE. À l'inscription, ce provisionnement
  -- est branché APRÈS la disponibilité du profil; mais l'entrée du générateur,
  -- elle, peut tomber sur un profil absent. `'Me'` est le même repli que
  -- `keel_household_create`, recopié d'ici pour que les deux chemins nomment
  -- une personne de la même façon.
  select
    coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), 'Me'),
    p.birth_date
    into v_first, v_birth
  from public.profiles p where p.id = v_user;

  -- ⛔ AUCUNE ÉCHÉANCE ÉCRITE ICI — le DÉFAUT de la colonne s'applique, et
  -- c'est la décision du propriétaire (voir l'en-tête). Écrire `free_until`
  -- explicitement ferait de cette fonction un second endroit qui décide de la
  -- facturation, et le dépôt en a déjà un: `keel_household_is_covered`.
  insert into public.households (name, created_by, origin)
  values (coalesce(v_first, 'Me'), v_user, 'personal_auto')
  returning id, free_until into v_hh, v_free;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date)
  values
    (v_hh, v_user, 'owner', coalesce(v_first, 'Me'), v_birth)
  returning member_id into v_member;

  return jsonb_build_object(
    'ok', true, 'created', true,
    'household_id', v_hh, 'member_id', v_member,
    'origin', 'personal_auto', 'free_until', v_free
  );
end;
$function$;

comment on function public.keel_ensure_personal_household(uuid) is
  'LOT 1 — rend le foyer de ce compte, en le créant s''il n''en a pas. '
  'Idempotente et verrouillée par compte. Sans argument: `auth.uid()`. Avec '
  'argument différent de l''acteur: réservée à `service_role`. Ne modifie JAMAIS '
  'un rattachement existant, et n''écrit pas `free_until` — le défaut de la '
  'colonne s''applique (décision du propriétaire, 2026-09-10).';

revoke all on function public.keel_ensure_personal_household(uuid) from public, anon;
grant execute on function public.keel_ensure_personal_household(uuid) to authenticated, service_role;
