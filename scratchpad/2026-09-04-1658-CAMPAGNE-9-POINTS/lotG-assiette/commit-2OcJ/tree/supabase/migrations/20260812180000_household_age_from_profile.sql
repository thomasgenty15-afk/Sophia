-- ============================================================================
-- D18 (L9) — LA DATE DE NAISSANCE D'UNE BOUCHE QUI A UN COMPTE VIENT DE SON
--            « ABOUT YOU », PAS DE LA FICHE QUE LE MAÎTRE A REMPLIE
--
-- Autorité: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md, D18, lot L9.
-- Amont: 20260810120000 (l'âge à trois états), 20260811070000 (D1, l'objectif
--        d'un titulaire vient de `student_goals`), 20260812150000 (la dernière
--        réécriture de `keel_household_roster_for`).
--
-- ── LE TROU, EN UNE PHRASE ─────────────────────────────────────────────────
--
-- L'écran « about you » (`/app/plan`) demande la date de naissance depuis
-- toujours et l'écrit dans `profiles.birth_date`. `keel_household_member_age`
-- ne lisait QUE `household_members.birth_date`. Un maître qui remplit sa date
-- là où le produit la lui demande restait donc `unknown` à sa propre table:
-- `goalApplies` refuse `unknown`, et SON OBJECTIF DÉCLARÉ N'ATTEIGNAIT JAMAIS
-- SON ASSIETTE. Il ne pouvait pas le savoir — rien ne le disait, la part
-- standard n'a l'air de rien.
--
-- C'est exactement la forme de D1, un cran plus loin: ce que quelqu'un déclare
-- SUR LUI-MÊME fait autorité sur ce que le maître a saisi POUR lui.
--
-- ── LA RÈGLE, ÉCRITE UNE FOIS ──────────────────────────────────────────────
--
--   1. La bouche a un compte, et son profil porte une date UTILISABLE
--      → c'est elle. (Le cas D18: « about you » gouverne.)
--   2. Sinon → la date de la ligne membre, celle que le maître a saisie.
--   3. Ni l'une ni l'autre → `unknown`, et donc part standard.
--
-- ── POURQUOI UN REPLI, ET PAS L'AUTORITÉ SÈCHE DE D1 ───────────────────────
--
-- D1 écrit `case when hm.user_id is null then hm.goal else sg.goal end`: pour
-- un titulaire, la ligne membre ne compte PLUS. Le transposer tel quel ici
-- ferait REDESCENDRE à `unknown` tout titulaire dont le maître avait saisi la
-- date sur sa fiche et qui n'a jamais rempli son « about you » — c'est-à-dire
-- ÉTEINDRE des objectifs qui s'appliquent aujourd'hui, en silence, le jour du
-- déploiement. Un lot dont la raison d'être est « l'objectif déclaré doit
-- atteindre l'assiette » ne peut pas commencer par en débrancher.
--
-- La résolution est donc MONOTONE: aucune bouche ne perd un âge connu.
--   · profil utilisable + ligne membre datée   → le PROFIL gagne (D18)
--   · profil vide + ligne membre datée         → la ligne membre (inchangé)
--   · profil daté + ligne membre vide          → le profil (LE TROU COMBLÉ)
--   · profil ABERRANT + ligne membre datée     → la ligne membre
--
-- Ce dernier cas est le seul qui demande une justification. `profiles.
-- birth_date` n'a AUCUN CHECK (vérifié le 2026-08-12: neuf contraintes sur
-- `profiles`, aucune sur cette colonne) — une date au siècle près y entre.
-- Faire gagner une date future contre une date vraie ferait perdre un âge
-- CONNU à cause d'un doigt qui a glissé, et le premier symptôme serait une
-- part standard servie à quelqu'un qui a un objectif. On préfère la donnée
-- utilisable, d'où qu'elle vienne.
--
-- ── CE QUE ÇA NE FAIT PAS ──────────────────────────────────────────────────
--
--   · Le roster ne rend TOUJOURS PAS la date, seulement `minor|adult|unknown`.
--     Le foyer doit savoir qu'il y a un enfant à table, pas l'âge exact de
--     chacun. Aucune surface nouvelle, aucune colonne nouvelle.
--   · Aucune donnée personnelle nouvelle n'est stockée: `profiles.birth_date`
--     existe et est DÉJÀ réclamée par l'export RGPD (`account-export-v1`,
--     `date_de_naissance`) et par la purge (cascade de `purge_auth_user`).
--   · Les gardes de non-divulgation (`household_voices.ts`,
--     `household_portions.ts`) ne bougent pas: elles interdisent de DIRE l'âge
--     à table, et rien ici ne le fait sortir.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LA RÈGLE D'ÂGE, EXTRAITE — une date, trois états
-- ---------------------------------------------------------------------------
--
-- Elle vivait en un seul exemplaire, inline dans `keel_household_member_age`.
-- Il en faut maintenant DEUX applications (le profil, puis la ligne membre):
-- les recopier ferait deux `case` à maintenir ensemble, et le jour où l'un des
-- deux perd la borne des 120 ans, un seul des deux chemins refuse une date
-- aberrante. La règle est donc nommée.
--
-- `stable` et pas `immutable`: elle lit `current_date`. Un enfant grandit, et
-- un résultat mis en cache pour toujours survivrait à ses dix-huit ans.
create or replace function public.keel_age_state(p_birth date)
returns text
language sql
stable
set search_path to ''
as $function$
  select case
    when p_birth is null then 'unknown'
    -- Une date FUTURE ou aberrante n'est pas une date: elle vaut « inconnu »,
    -- pas « majeur ». C'est l'inversion du lot 2, et elle se lit ici.
    when p_birth > current_date then 'unknown'
    when p_birth < (current_date - interval '120 years') then 'unknown'
    when p_birth > (current_date - interval '18 years') then 'minor'
    else 'adult'
  end;
$function$;

comment on function public.keel_age_state(date) is
  'minor | adult | unknown à partir d''une date de naissance. LA règle d''âge '
  'du produit, en un seul exemplaire — jumelle de assessBirthDate + '
  'ageStateFromVerdict dans _shared/keel/student_age.ts et household.ts. '
  'UNKNOWN n''est PAS un synonyme de majeur: sans âge utilisable, aucune '
  'direction d''objectif n''est appliquée (part standard).';

-- ---------------------------------------------------------------------------
-- 2. L'ÂGE D'UNE BOUCHE — le profil d'abord, la fiche ensuite
-- ---------------------------------------------------------------------------
--
-- `create or replace`: le type de retour ne change pas, donc les privilèges
-- posés en 20260810120000 survivent. La section 3 les REDIT quand même — une
-- fonction dont on ne relit pas l'ACL après réécriture est une fonction dont
-- on ne sait plus qui l'exécute.
--
-- ⚠️ LA LECTURE DE `profiles` PASSE PAR LE `security definer`, donc au-dessus
-- de RLS. Ce n'est pas un élargissement: cette fonction rendait DÉJÀ l'état
-- d'âge de n'importe quel `member_id` à tout `authenticated` (elle n'a jamais
-- été scopée au foyer de l'appelant), et ce qui sort reste les trois mêmes
-- jetons. Aucune date n'en sort, ni ici ni par le roster.
create or replace function public.keel_household_member_age(p_member uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  -- `nullif(..., 'unknown')` EST LA RÉSOLUTION, et elle se lit dans cet ordre:
  -- si le profil de la personne dit quelque chose d'utilisable, c'est ça; sinon
  -- on retombe sur ce que le maître a saisi. Un `coalesce(p.birth_date,
  -- hm.birth_date)` sur les DATES ferait autre chose — une date de profil
  -- aberrante y écraserait une date de fiche valide, et l'âge connu serait
  -- perdu.
  select coalesce(
    nullif(public.keel_age_state(p.birth_date), 'unknown'),
    public.keel_age_state(hm.birth_date)
  )
  from public.household_members hm
  -- Une bouche SANS COMPTE n'a pas de profil: le left join rend NULL, la
  -- première branche vaut 'unknown', et la fiche décide seule. Aucun `case`
  -- n'est nécessaire pour distinguer les deux natures de bouche.
  left join public.profiles p on p.id = hm.user_id
  where hm.member_id = p_member;
$function$;

comment on function public.keel_household_member_age(uuid) is
  'minor | adult | unknown, RELU à chaque appel — un enfant grandit, et un '
  'booléen figé au jour de l''entrée survivrait à ses dix-huit ans. '
  'LA SOURCE DE LA DATE (D18, 2026-08-12): `profiles.birth_date` — ce que la '
  'personne a rempli dans son « about you » — dès qu''elle est UTILISABLE; à '
  'défaut la date de la ligne membre, celle que le compte maître a saisie. '
  'Le repli n''est pas de la politesse: sans lui, tout titulaire daté par son '
  'maître et jamais passé par « about you » retomberait à `unknown` le jour du '
  'déploiement, c''est-à-dire perdrait sa direction d''objectif en silence. '
  'UNKNOWN n''est PAS un synonyme de majeur: sans âge, aucune direction '
  'd''objectif n''est appliquée (part standard), ce qui est la direction sûre '
  'du jour où le compte maître saisit les bouches à la main.';

-- ---------------------------------------------------------------------------
-- 3. LES PRIVILÈGES — redits, y compris ceux qu'on n'a pas donnés
-- ---------------------------------------------------------------------------
--
-- Rappel des deux cicatrices du dépôt: toute fonction NEUVE est exécutable par
-- `public` par défaut, et `revoke from public` ne retire pas une ligne posée
-- explicitement sur `anon`. `keel_age_state` est neuve: elle est fermée à tout
-- le monde sauf à son propriétaire, qui est le seul à en avoir besoin —
-- `keel_household_member_age` l'appelle en `security definer`.
revoke all on function public.keel_age_state(date) from public, anon, authenticated;

revoke all on function public.keel_household_member_age(uuid) from public, anon;
grant execute on function public.keel_household_member_age(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. CONTRÔLE FINAL — LES CINQ CAS, SUR UN VRAI FOYER, PUIS ROLLBACK
-- ---------------------------------------------------------------------------
--
-- Lire le catalogue prouverait que la fonction a changé, pas qu'elle décide
-- juste. On monte un foyer jetable, on bouge les deux dates l'une après
-- l'autre, et on regarde le roster — parce que c'est LUI que le générateur lit,
-- pas la fonction d'âge.
do $$
declare
  v_user uuid;
  v_old_birth date;
  v_house uuid;
  v_owner uuid;
  v_kid uuid;
  v_age text;
begin
  -- Un compte AVEC profil et SANS foyer. Sans lui, rien à vérifier: on le dit
  -- plutôt que de laisser croire que le contrôle a tourné.
  select u.id into v_user
  from auth.users u
  join public.profiles p on p.id = u.id
  where public.keel_household_of(u.id) is null
  order by u.created_at
  limit 1;

  if v_user is null then
    raise notice 'household_age_from_profile: aucun compte libre, contrôle sauté';
    return;
  end if;

  select birth_date into v_old_birth from public.profiles where id = v_user;

  insert into public.households (name, created_by)
  values ('__qa_age_d18__', v_user) returning id into v_house;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date, goal)
  values (v_house, v_user, 'owner', 'Owner', null, null)
  returning member_id into v_owner;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date, goal)
  values (v_house, null, 'member', 'Lea', current_date - interval '8 years', null)
  returning member_id into v_kid;

  -- ── CAS 1: rien nulle part → `unknown`. Le cas sûr, et il doit le rester.
  update public.profiles set birth_date = null where id = v_user;
  v_age := public.keel_household_member_age(v_owner);
  if v_age <> 'unknown' then
    raise exception
      'age D18 cas 1: sans date NI au profil NI à la fiche, le maître rend %, '
      'pas ''unknown'' — une bouche inconnue recevrait une direction d''adulte',
      v_age;
  end if;

  -- ── CAS 2: LE TROU QUE CE LOT COMBLE. La date est dans « about you » et
  --    NULLE PART AILLEURS. Avant cette migration, ce cas rendait `unknown`,
  --    et l'objectif du maître ne quittait jamais sa fiche.
  update public.profiles set birth_date = date '1985-04-02' where id = v_user;
  v_age := public.keel_household_member_age(v_owner);
  if v_age <> 'adult' then
    raise exception
      'age D18 cas 2: une date posée dans « about you » rend % — l''écran où '
      'le produit demande la date de naissance ne l''amène toujours pas à '
      'table, et l''objectif du maître reste inactif', v_age;
  end if;

  -- ── CAS 3: LES DEUX PARLENT, ET LE PROFIL GAGNE. C'est l'assertion qui
  --    SÉPARE ce lot d'un simple repli: si la fiche l'emportait, la personne
  --    ne pourrait pas corriger chez elle ce que le maître a mal saisi.
  update public.household_members
     set birth_date = date '1990-01-01' where member_id = v_owner;
  update public.profiles
     set birth_date = current_date - interval '10 years' where id = v_user;
  v_age := public.keel_household_member_age(v_owner);
  if v_age <> 'minor' then
    raise exception
      'age D18 cas 3: profil (10 ans) contre fiche (adulte), la fonction rend '
      '% — la fiche du maître écrase la déclaration de la personne', v_age;
  end if;

  -- ── CAS 4: PROFIL ABERRANT, FICHE VALIDE → la fiche. Une date au siècle
  --    près ne doit pas ÉTEINDRE un âge connu.
  update public.profiles
     set birth_date = current_date + 1 where id = v_user;
  v_age := public.keel_household_member_age(v_owner);
  if v_age <> 'adult' then
    raise exception
      'age D18 cas 4: une date de profil FUTURE rend % au lieu de retomber sur '
      'la fiche — un lapsus de saisie débranche une direction d''objectif',
      v_age;
  end if;

  -- ── CAS 5: LA BOUCHE SANS COMPTE NE BOUGE PAS D'UN POUCE. Elle n'a pas de
  --    profil; sa fiche est et reste sa seule source.
  v_age := public.keel_household_member_age(v_kid);
  if v_age <> 'minor' then
    raise exception
      'age D18 cas 5: une bouche sans compte de 8 ans rend % — le left join '
      'sur profiles a changé le sort des bouches qu''il ne concerne pas', v_age;
  end if;

  -- ── ET LE ROSTER, parce que c'est lui que le générateur lit. La fonction
  --    d'âge pourrait être juste et la colonne du roster figée ailleurs.
  update public.household_members
     set birth_date = null where member_id = v_owner;
  update public.profiles set birth_date = date '1985-04-02' where id = v_user;
  select r.age_state into v_age
  from public.keel_household_roster_for(v_user) r
  where r.member_id = v_owner;
  if v_age <> 'adult' then
    raise exception
      'age D18 roster: la fonction d''âge dit adulte et le roster dit % — '
      'c''est le roster que generate-household-meal-v1 lit, donc c''est lui '
      'qui décide de l''assiette', v_age;
  end if;

  -- Reposé explicitement, même si le rollback suit: laisser une valeur de
  -- contrôle dans une variable de sortie est le genre de détail qui survit à
  -- un copier-coller.
  update public.profiles set birth_date = v_old_birth where id = v_user;

  raise notice
    'household_age_from_profile: cinq cas + le roster vérifiés — « about you » '
    'atteint l''assiette, et rien de connu n''a été perdu';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

commit;
