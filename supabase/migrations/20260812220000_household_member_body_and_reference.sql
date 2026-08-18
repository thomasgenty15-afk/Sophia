-- ============================================================================
-- LE FOYER — CHAQUE BOUCHE A UN CORPS, ET LE COMPTE MAÎTRE DÉCLARE LE RÉFÉRENT
--
-- Fiches: docs/fonctionnalites/le-foyer/FF-043-la-resolution-foyer.md
--         docs/fonctionnalites/le-foyer/FF-047-le-corps-dans-la-part-du-foyer.md
-- Amont:  20260810120000 (member_id, l'âge à trois états)
--         20260811010000 (households.reference_member_id — la colonne)
--         20260811040000 (détachement et purge RGPD)
--         20260812180000 (keel_age_state, keel_household_member_age)
--
-- ── LES DEUX DÉCISIONS HUMAINES, DATÉES ET NOMMÉES ─────────────────────────
--
-- Prises le 2026-08-12, par l'utilisateur, APRÈS que la contrainte et sa raison
-- lui ont été exposées. Elles RENVERSENT deux règles écrites, et un lot qui
-- taierait ce qu'il renverse serait pire qu'absent:
--
--   D-A · « il faut la taille le poids et l'âge et le gender OBLIGATOIREMENT
--          (même quand ils ont pas de compte secondaire !) »
--        RENVERSE FF-047 §3 (« aucun fait corporel pour un mineur, ni pour un
--        âge inconnu ») et la table des crans d'intake du README du foyer
--        (« cran 2 — le corps: compte REQUIS »).
--
--   D-B · « les deltas n'ont pas d'objectif donc ils ont juste un objectif
--          normal de manger selon leur poids, âge, taille c'est tout »
--        RENVERSE FF-043 §3 (« aucune enveloppe pour un mineur ») et R5.
--
-- ── CE QUE ÇA RÉPARE, MESURÉ DANS LE CODE ──────────────────────────────────
--
-- `trunkSizing` prenait le MIN sur les enveloppes des seuls ADULTES, et la
-- boucle des deltas commençait par `if (m.ageState !== "adult") continue`. Dans
-- le foyer « une mère en fat_loss + deux enfants », elle est la seule adulte:
-- la casserole ÉTAIT une casserole de déficit, et les enfants la mangeaient
-- SANS AUCUN ADD-ON. C'est le préjudice que FF-043 §1 nomme en toutes lettres —
-- « la troisième mange la restriction d'un autre sans l'avoir demandée » — et il
-- n'était fermé que pour les adultes.
--
-- ── CE QUI NE BOUGE PAS, ET C'EST LA LIGNE DE PARTAGE DU LOT ───────────────
--
-- La raison de l'interdit de FF-047 n'était pas de ne pas SAVOIR, c'était de ne
-- pas DIRE: « poser 152 cm, 41 kg à côté du prénom d'un enfant rend la
-- direction fat_loss dérivable sans qu'on l'ait demandée » (meal_body.ts:247).
-- Cette moitié-là garde tout son sens et ne bouge PAS d'un pouce:
--
--   * aucun fait corporel de mineur n'entre dans le prompt — la suppression de
--     `meal_body.ts:247-248` (`householdBodyFacts` rend `[]` hors adulte) RESTE
--     EN PLACE;
--   * aucun fait corporel de mineur ne sort à l'écran ni dans un log nominatif;
--   * on CALCULE dans le moteur, on n'ÉMET que des grammes d'aliment.
--
-- Collecter et calculer, jamais énoncer.
--
-- ============================================================================
-- ⚠️ POURQUOI UNE TABLE À PART, ALORS QUE `household_members` EXISTE
-- ============================================================================
--
-- Le lot devait poser `height_cm`, `weight_kg`, `gender` SUR `household_members`.
-- Sondé avant d'écrire, sur la base réelle, le 2026-08-12:
--
--   grant : `authenticated` a SELECT sur public.household_members
--   policy: household_members_member_read — `using (household_id =
--           keel_household_of(auth.uid()))`, donc TOUTE LA TABLE DU FOYER
--   sonde : un membre NON-MAÎTRE, sous son propre rôle, lit 3 lignes de son
--           foyer — celles des autres bouches, colonnes comprises.
--
-- Une colonne `weight_kg` là-dedans aurait été LISIBLE PAR PostgREST, en clair,
-- par tout co-membre ayant un compte: l'adolescent qui a réclamé son profil lit
-- le poids de sa mère et celui de son frère. C'est exactement le dégât que
-- FF-047 existe pour empêcher, livré par la porte de derrière et en silence.
--
-- Deux réparations possibles, et la seconde est retenue:
--
--   ① un `revoke select (weight_kg, …)` colonne par colonne. Ça marche, et ça
--      se défait tout seul: le premier `grant select on public.household_members
--      to authenticated` d'une migration future — le réflexe le plus banal du
--      monde — rouvre tout, sans que rien ne le dise.
--   ② UNE TABLE À PART, sans AUCUN grant à `authenticated`. Rien ne passe par
--      PostgREST; on n'y accède que par des RPC `security definer` gardées au
--      compte maître, et par `service_role` pour le générateur. Reposer le
--      droit demande alors d'écrire le grant en toutes lettres sur une table qui
--      n'en a jamais eu.
--
-- C'est aussi la forme que le domaine a déjà choisie pour un fait par bouche
-- (`household_member_allergies`, FF-046). ⚠️ Avec UNE différence, et elle est
-- le tout: une allergie DOIT être lisible par le foyer (on sert à table), un
-- poids ne doit l'être par personne. D'où le grant que celle-ci n'a pas.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. LE CORPS D'UNE BOUCHE
-- ---------------------------------------------------------------------------
--
-- ── OÙ MORD « OBLIGATOIRE », ET POURQUOI PAS AILLEURS ─────────────────────
--
-- `NOT NULL` sur `household_members` était impossible: 39 lignes existent en
-- local, 29 sans compte, aucune n'a de corps (compté avant d'écrire). Rendre la
-- colonne obligatoire là-bas aurait exigé un DÉFAUT NUMÉRIQUE — c'est-à-dire un
-- poids inventé sur une personne réelle, qui serait ensuite entré dans une
-- équation et ressorti en grammes dans une assiette. Jamais.
--
-- L'obligation mord donc en TROIS endroits, et le premier est celui qui compte:
--
--   1. LA LIGNE EST TOUT-OU-RIEN. Les trois colonnes sont `not null` DANS CETTE
--      TABLE. Il n'existe pas de demi-corps: soit une bouche a taille + poids +
--      sexe, soit elle n'a pas de ligne. Un corps partiel ne peut pas exister,
--      donc aucun lecteur n'a à s'en défendre.
--   2. L'ÉCRITURE REFUSE LE PARTIEL (`body_incomplete`, section 3).
--   3. L'ÉCRAN exige les trois champs.
--
-- ── ET IL N'Y A PAS DE BACKFILL, PARCE QU'IL NE PEUT PAS Y EN AVOIR ───────
-- On ne sait pas combien pèsent ces 29 bouches. Une bouche sans corps n'a donc
-- PAS d'enveloppe, compte pour une part STANDARD (jamais réduite) et ne pèse pas
-- dans le MIN du tronc — la direction d'erreur sûre du domaine. Le compte est
-- affiché en fin de migration plutôt que tu: un trou silencieux serait lu comme
-- « tout le monde a un corps ».

create table if not exists public.household_member_bodies (
  member_id uuid primary key
    references public.household_members(member_id) on delete cascade,
  -- ⚠️ Redondant avec `household_members.household_id`, et voulu: toutes les
  -- gardes de ce domaine se scopent au foyer, et une garde qui doit joindre
  -- pour savoir de quel foyer elle parle est une garde qu'on écrit à moitié.
  household_id uuid not null
    references public.households(id) on delete cascade,
  height_cm numeric(5, 1) not null,
  weight_kg numeric(5, 1) not null,
  gender text not null,
  -- QUI A SAISI, ET QUAND. Pas de la traçabilité décorative: c'est le compte
  -- maître qui saisit le corps d'autrui, et le domaine tient sa légitimité de
  -- ce que rien n'y est secret (README, « le consentement à se faire
  -- restreindre » ⇒ la contrepartie est la transparence).
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ── LES BORNES DE PLAUSIBILITÉ, EN BASE ET PAS À L'ÉCRAN ───────────────
  -- « Une limite d'UI n'est pas une limite »: elles doivent tenir face à un
  -- appel direct de la RPC. Larges exprès — elles refusent une FAUTE DE SAISIE
  -- (20 cm, 700 kg), pas un gabarit rare. Un nourrisson (50 cm, 3 kg) et le
  -- plus grand humain vérifié (272 cm) tiennent tous les deux dedans.
  constraint household_member_bodies_height_check
    check (height_cm >= 30 and height_cm <= 260),
  constraint household_member_bodies_weight_check
    check (weight_kg >= 2 and weight_kg <= 400),
  -- Le MÊME vocabulaire fermé que `profiles_gender_check`. Une septième valeur
  -- ici serait un sexe que les équations ne savent pas lire.
  constraint household_member_bodies_gender_check
    check (gender in ('male', 'female', 'other'))
);

comment on table public.household_member_bodies is
  'Le corps de CHAQUE bouche — taille, poids, sexe — y compris sans compte '
  '(décision humaine du 2026-08-12, qui renverse FF-047 §3 et le « cran 2 » du '
  'README du foyer). Il sert à DIMENSIONNER dans le moteur: le MIN du tronc et '
  'les add-ons par bouche. Il ne sort JAMAIS — ni au prompt pour un mineur, ni '
  'à l''écran, ni dans un log nominatif. TABLE À PART et sans grant à '
  '`authenticated` EXPRÈS: la policy de lecture de household_members est '
  'household-wide, donc une colonne posée là-bas aurait rendu le poids de '
  'chacun lisible par tout co-membre ayant un compte (sondé, 3 lignes lues).';

comment on column public.household_member_bodies.gender is
  'male | female | other. Les équations de métabolisme ont des coefficients PAR '
  'SEXE; `other` prend la MOYENNE des deux jeux, jamais un repli sur `male` — '
  'choisir serait assigner, et la décision porterait ici sur le corps d''un '
  'enfant. Même arbitrage que estimatedMaintenanceKcal pour Mifflin-St Jeor.';

create index if not exists household_member_bodies_household_idx
  on public.household_member_bodies (household_id);

-- ── RLS: ARMÉE ET SANS AUCUNE POLICY ────────────────────────────────────────
-- Une table RLS sans policy ne rend RIEN à personne d'autre que `service_role`
-- (qui la contourne) et au propriétaire. C'est la garde de fond; les grants
-- ci-dessous en sont la seconde couche. Les deux, parce qu'une seule se défait.
alter table public.household_member_bodies enable row level security;

-- ⚠️ « `authenticated` reçoit TOUT sur toute table neuve » est une cicatrice de
-- ce dépôt (privilèges par défaut Supabase). Elle ne mord pas sur CE projet —
-- vérifié: `authenticated` n'a que SELECT sur household_members et sur
-- household_member_allergies — mais on ne parie pas sur une configuration qu'un
-- futur `alter default privileges` peut changer. On révoque, et la section 8
-- ASSERTE le résultat.
revoke all on public.household_member_bodies from public, anon, authenticated;
grant select, insert, update, delete on public.household_member_bodies to service_role;

-- ---------------------------------------------------------------------------
-- 2. LE TOUCHE-À-JOUR
-- ---------------------------------------------------------------------------

create or replace function public.keel_household_body_touch()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists household_member_bodies_touch on public.household_member_bodies;
create trigger household_member_bodies_touch
  before update on public.household_member_bodies
  for each row execute function public.keel_household_body_touch();

revoke all on function public.keel_household_body_touch() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. ÉCRIRE UN CORPS — COMPTE MAÎTRE UNIQUEMENT
-- ---------------------------------------------------------------------------
--
-- Les refus sont NOMMÉS, dans l'ordre, et l'ordre est une garde — même forme
-- que `keel_household_detach_member`:
--
--   not_authenticated  aucun appelant;
--   no_household       l'appelant n'est dans aucun foyer;
--   not_owner          il n'est pas le maître du sien. LA GARDE EST ICI, dans
--                      la fonction, et pas seulement à l'écran: un écran n'est
--                      pas une garde;
--   not_a_member       la cible n'existe pas OU vit dans le foyer d'à côté —
--                      indiscernables de l'extérieur, sinon la RPC devient un
--                      moyen de tester l'existence d'un member_id;
--   body_incomplete    un des trois manque. C'est ICI que mord « obligatoire »:
--                      il n'existe pas de demi-corps;
--   bad_height / bad_weight / bad_gender  hors bornes de plausibilité. Nommés
--                      SÉPARÉMENT parce que l'écran doit pouvoir dire QUEL
--                      champ reprendre — un « bad_body » ferait relire les
--                      trois.
create or replace function public.keel_household_set_member_body(
  p_member uuid,
  p_height_cm numeric,
  p_weight_kg numeric,
  p_gender text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_target uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  select hm.member_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  if p_height_cm is null or p_weight_kg is null
     or btrim(coalesce(p_gender, '')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'body_incomplete');
  end if;
  if p_height_cm < 30 or p_height_cm > 260 then
    return jsonb_build_object('ok', false, 'reason', 'bad_height');
  end if;
  if p_weight_kg < 2 or p_weight_kg > 400 then
    return jsonb_build_object('ok', false, 'reason', 'bad_weight');
  end if;
  if p_gender not in ('male', 'female', 'other') then
    return jsonb_build_object('ok', false, 'reason', 'bad_gender');
  end if;

  insert into public.household_member_bodies as b
    (member_id, household_id, height_cm, weight_kg, gender, recorded_by)
  values
    (p_member, v_household, round(p_height_cm, 1), round(p_weight_kg, 1),
     p_gender, v_user)
  on conflict (member_id) do update
    set height_cm = excluded.height_cm,
        weight_kg = excluded.weight_kg,
        gender = excluded.gender,
        recorded_by = excluded.recorded_by
    where b.member_id = excluded.member_id;

  return jsonb_build_object('ok', true, 'member_id', p_member);
end;
$function$;

comment on function public.keel_household_set_member_body(uuid, numeric, numeric, text) is
  'Enregistre le corps d''une bouche — taille, poids, sexe, TOUT-OU-RIEN. '
  'Compte maître uniquement, garde DANS la fonction. Bornes de plausibilité en '
  'base et pas seulement à l''écran. Ce corps DIMENSIONNE (le MIN du tronc, les '
  'add-ons); il ne s''énonce nulle part.';

-- ---------------------------------------------------------------------------
-- 4. LIRE LES CORPS — COMPTE MAÎTRE UNIQUEMENT, ET C'EST LA MOITIÉ QUI COMPTE
-- ---------------------------------------------------------------------------
--
-- L'écran du maître doit savoir quelles bouches ont un corps, et rappeler ce
-- qu'il a saisi. Personne d'autre n'a à le lire — ni un co-membre qui a réclamé
-- son profil, ni la bouche elle-même par PostgREST.
--
-- Un NON-MAÎTRE reçoit ZÉRO LIGNE, pas une erreur: une erreur dirait « il y a
-- quelque chose ici et tu n'y as pas droit », ce qui est déjà un renseignement
-- sur ce que le foyer détient.
create or replace function public.keel_household_member_bodies()
returns table (
  member_id uuid,
  height_cm numeric,
  weight_kg numeric,
  gender text,
  recorded_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select b.member_id, b.height_cm, b.weight_kg, b.gender, b.recorded_at
  from public.household_member_bodies b
  join public.household_members me
    on me.user_id = (select auth.uid())
   and me.role = 'owner'
   and me.household_id = b.household_id;
$function$;

comment on function public.keel_household_member_bodies() is
  'Les corps saisis du foyer, POUR SON COMPTE MAÎTRE SEUL. Un non-maître reçoit '
  'zéro ligne — pas une erreur, qui serait déjà un renseignement. C''est le '
  'seul chemin de lecture ouvert à un navigateur: la table n''a aucun grant à '
  '`authenticated`, exprès (voir son commentaire).';

-- ---------------------------------------------------------------------------
-- 4 bis. LA PORTE DU SERVEUR — les corps ET l'âge en ANNÉES, en une lecture
-- ---------------------------------------------------------------------------
--
-- ── POURQUOI L'ÂGE EN ANNÉES, ALORS QUE LE ROSTER REND TROIS ÉTATS ───────
-- Les équations ne prennent pas un état, elles prennent une tranche: 0-3, 3-10,
-- 10-18 pour l'enfant (Schofield), 18-29 … 60+ pour l'adulte (Mifflin). Un
-- `minor` de trois ans et un `minor` de dix-sept ans n'ont pas les mêmes
-- coefficients, et servir les mauvais serait exactement le défaut que le chemin
-- pédiatrique existe pour ne pas commettre.
--
-- ⚠️ ET IL NE SORT QUE VERS LE SERVEUR. `grant execute … to service_role`, et
-- rien à `authenticated`: le roster du navigateur continue de ne rendre QUE
-- `minor | adult | unknown`. Le foyer doit savoir qu'il y a un enfant à table,
-- pas l'âge exact de chacun (D18, section « ce que ça ne fait pas »).
--
-- ── ET LA DATE SE RÉSOUT EN UN SEUL ENDROIT ──────────────────────────────
-- La règle « le profil d'abord, la fiche du maître ensuite » (D18) vivait
-- INLINE dans `keel_household_member_age`. Il en faut maintenant une seconde
-- application — l'âge en années — et recopier le `coalesce/nullif` ferait deux
-- résolutions à maintenir ensemble, dont l'une finirait par préférer l'autre
-- source. Elle est donc EXTRAITE, et `keel_household_member_age` la consomme:
-- les deux ne peuvent plus diverger, par construction.

create or replace function public.keel_household_member_birth_date(p_member uuid)
returns date
language sql
stable
security definer
set search_path to ''
as $function$
  -- Le `case … when <> 'unknown'` est le `nullif` de D18, écrit sur la DATE au
  -- lieu de l'état: une date de profil aberrante n'écrase pas une date de fiche
  -- valide, et l'âge CONNU n'est jamais perdu à cause d'un doigt qui a glissé.
  select coalesce(
    case when public.keel_age_state(p.birth_date) <> 'unknown' then p.birth_date end,
    case when public.keel_age_state(hm.birth_date) <> 'unknown' then hm.birth_date end
  )
  from public.household_members hm
  left join public.profiles p on p.id = hm.user_id
  where hm.member_id = p_member;
$function$;

comment on function public.keel_household_member_birth_date(uuid) is
  'LA DATE QUI FAIT AUTORITÉ pour une bouche (D18): `profiles.birth_date` dès '
  'qu''elle est UTILISABLE, la fiche du maître à défaut, NULL si ni l''une ni '
  'l''autre. Extraite de keel_household_member_age le 2026-08-12 pour que '
  'l''état d''âge et l''âge en années ne puissent pas résoudre deux sources '
  'différentes. FERMÉE à authenticated: aucune date ne sort vers un navigateur.';

-- `create or replace`: le type de retour ne change pas, donc les privilèges de
-- 20260810120000 / 20260812180000 survivent. La section 7 les redit quand même.
--
-- ⚠️ LE `from … where` EST CONSERVÉ, ET CE N'EST PAS DU STYLE. Sans lui, un
-- `member_id` INEXISTANT rendrait 'unknown' (keel_age_state(NULL)) au lieu de
-- AUCUNE LIGNE — et un appelant qui teste `is null` pour « cette bouche
-- n'existe pas » lirait « cette bouche existe et on ne connaît pas son âge ».
create or replace function public.keel_household_member_age(p_member uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select public.keel_age_state(public.keel_household_member_birth_date(p_member))
  from public.household_members hm
  where hm.member_id = p_member;
$function$;

-- LA PORTE DU SERVEUR.
--
-- ⚠️ ELLE PREND LE FOYER EN ARGUMENT, ET NE LIT PAS `auth.uid()`. Cicatrice
-- documentée: `auth.uid()` est NULL sous `service_role`, donc une RPC gatée
-- dessus et appelée par une fonction edge avec la clé de service est MORTE.
-- Sa seule garde est le GRANT: `service_role` uniquement.
--
-- Elle rend une ligne PAR BOUCHE, corps ou pas: le générateur doit distinguer
-- « pas de corps » (part standard) de « bouche absente du foyer ».
create or replace function public.keel_household_bodies_for(p_household uuid)
returns table (
  member_id uuid,
  height_cm numeric,
  weight_kg numeric,
  gender text,
  age_years integer
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    hm.member_id,
    b.height_cm,
    b.weight_kg,
    b.gender,
    case
      when public.keel_household_member_birth_date(hm.member_id) is null then null
      else extract(
        year from age(
          current_date,
          public.keel_household_member_birth_date(hm.member_id)
        )
      )::integer
    end as age_years
  from public.household_members hm
  left join public.household_member_bodies b on b.member_id = hm.member_id
  -- Un `p_household` nul rend zéro ligne: `= null` n'est jamais vrai.
  where hm.household_id = p_household;
$function$;

comment on function public.keel_household_bodies_for(uuid) is
  'LE CORPS ET L''ÂGE EN ANNÉES de chaque bouche d''un foyer, POUR LE SERVEUR. '
  'Une ligne par bouche, corps ou pas — « pas de corps » et « bouche absente » '
  'ne doivent pas se confondre. Réservée à `service_role`: l''âge exact ne sort '
  'jamais vers un navigateur, le roster continue de ne rendre que '
  'minor|adult|unknown.';

-- ---------------------------------------------------------------------------
-- 5. LE MEMBRE DE RÉFÉRENCE — LE MAÎTRE LE DÉCLARE, ET PERSONNE D'AUTRE
-- ---------------------------------------------------------------------------
--
-- `households.reference_member_id` existe depuis 20260811010000, le moteur la
-- lit (`resolveHousehold` → `referenceMemberId`), et RIEN DANS L'APP NE
-- L'ÉCRIVAIT. Elle valait donc NULL partout, c'est-à-dire « le compositeur »,
-- c'est-à-dire toujours le maître.
--
-- ── LES DEUX ALTERNATIVES SONT ÉCARTÉES, ET LE RESTENT ────────────────────
--   ❌ LE COACH — il n'a aucun canal 1:1 vers un élève (docs/keel/MODEL.md).
--   ❌ UN RÉFÉRENT DÉRIVÉ d'une métrique ou d'un ordre d'objectifs — déjà hors
--      périmètre FF-043 §3: combiné à la citation de la doctrine du référent,
--      ça rendrait l'objectif d'un membre INFÉRABLE par tout le foyer.
--
-- ── ⚠️ CE QUE LE RÉFÉRENT NE FAIT PAS ────────────────────────────────────
-- Il ne change PAS la taille de la casserole. Il décide quelle DOCTRINE
-- gouverne le tronc (`trunkSafety`); le dimensionnement reste le MIN de
-- `trunkSizing`. Un référent qui dimensionnerait le tronc imposerait son
-- déficit à tous — le défaut exact que FF-043 §1 existe pour éviter.
--
-- ── LES REFUS, DANS L'ORDRE ──────────────────────────────────────────────
--   not_authenticated · no_household · not_your_household · not_owner
--   not_a_member
--   minor_cannot_be_reference   R3/R5: sa doctrine gouvernerait l'assiette
--                               d'adultes, et son objectif n'existe pas.
--   age_unknown_cannot_be_reference
--                               ⚠️ DÉCIDÉ ICI, et c'est un choix. Le code
--                               (`referenceMemberId`) filtre `!== "minor"`,
--                               donc `unknown` PASSAIT. On le refuse, parce que
--                               `goalApplies` refuse déjà `unknown` pour
--                               l'objectif: deux gardes qui divergent sur le
--                               même état finissent par se contredire, et
--                               celle qui reste ouverte devient le chemin.
--                               Coût assumé: le maître doit renseigner une date
--                               avant de désigner quelqu'un. C'est la même
--                               incitation que partout ailleurs dans ce domaine.
--
-- `p_member = null` est AUTORISÉ: c'est le retour au défaut (le compositeur).
-- Il ne passe par aucune des gardes de cible — il n'y a pas de cible.
create or replace function public.keel_household_set_reference_member(
  p_household uuid,
  p_member uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_role text;
  v_target uuid;
  v_age text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select hm.household_id, hm.role into v_household, v_role
  from public.household_members hm
  where hm.user_id = v_user;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;
  -- Le foyer est SCALAIRE par personne (`household_members_one_per_user`), donc
  -- l'argument est redondant — et c'est justement pourquoi il est VÉRIFIÉ et
  -- pas ignoré: un appelant qui se trompe de foyer doit l'apprendre, pas voir
  -- son geste appliqué ailleurs en silence.
  if p_household is null or p_household <> v_household then
    return jsonb_build_object('ok', false, 'reason', 'not_your_household');
  end if;
  if v_role <> 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if p_member is null then
    update public.households set reference_member_id = null where id = v_household;
    return jsonb_build_object('ok', true, 'reference_member_id', null);
  end if;

  select hm.member_id into v_target
  from public.household_members hm
  where hm.member_id = p_member and hm.household_id = v_household;

  if v_target is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  v_age := public.keel_household_member_age(p_member);
  if v_age = 'minor' then
    return jsonb_build_object('ok', false, 'reason', 'minor_cannot_be_reference');
  end if;
  if v_age <> 'adult' then
    return jsonb_build_object('ok', false, 'reason', 'age_unknown_cannot_be_reference');
  end if;

  update public.households
     set reference_member_id = p_member
   where id = v_household;

  return jsonb_build_object('ok', true, 'reference_member_id', p_member);
end;
$function$;

comment on function public.keel_household_set_reference_member(uuid, uuid) is
  'DÉCLARE la bouche dont la DOCTRINE gouverne le tronc commun (FF-043 §3 n°2). '
  'Compte maître uniquement. NULL = retour au défaut, le membre qui compose la '
  'session. Un mineur est refusé, et un âge INCONNU aussi — `goalApplies` le '
  'refuse déjà pour l''objectif, et deux gardes qui divergent sur le même état '
  'finissent par se contredire. ⚠️ Le référent ne change PAS la taille de la '
  'casserole: le dimensionnement reste le MIN de trunkSizing.';

-- ---------------------------------------------------------------------------
-- 6. LA PURGE RGPD RÉCLAME LE CORPS — DÈS SA MIGRATION, PAS APRÈS
-- ---------------------------------------------------------------------------
--
-- Corps IDENTIQUE à 20260811040000 à un `delete` près.
--
-- ── ET C'EST UN ARBITRAGE DIFFÉRENT DE CELUI DE `birth_date` ─────────────
-- D3 a tranché que le prénom et la date de naissance SURVIVENT au détachement:
-- ils répondent à « pour qui je cuisine », et les effacer dégraderait la
-- composition d'un foyer que la personne quitte. La taille et le poids, non:
--
--   * DÉTACHEMENT (`keel_household_detach_member`, retrait d'ACCÈS) — le corps
--     RESTE. La personne est toujours une bouche à cette table, le maître l'a
--     saisi, et rien ne s'efface parce qu'un accès a été révoqué.
--   * PURGE (suppression du COMPTE) — le corps PART. C'est l'événement « droit
--     à l'effacement », et une métrique corporelle d'une personne qui a quitté
--     le produit n'a aucune raison d'y survivre. Le coût est une part standard
--     jusqu'à ce que le maître resaisisse — sûr, et visible.
create or replace function public.keel_household_purge_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target record;
begin
  if p_user is null then
    return jsonb_build_object('ok', true, 'action', 'none');
  end if;

  select hm.member_id, hm.role, hm.household_id, hm.departs_with_account
    into v_target
  from public.household_members hm
  where hm.user_id = p_user;

  if v_target.member_id is null then
    return jsonb_build_object('ok', true, 'action', 'none');
  end if;

  -- LE MAÎTRE N'EST JAMAIS SUPPRIMÉ, même s'il a coché: `keel_household_set_
  -- departure` refuse déjà de poser l'intention sur lui, et cette seconde
  -- vérification couvre une ligne écrite avant ce lot ou par un chemin futur.
  if v_target.departs_with_account and v_target.role <> 'owner' then
    -- La cascade de la FK emporte déjà le corps; le `delete` explicite est là
    -- pour que « ce que la purge efface » se lise dans la fonction et pas dans
    -- une clause de contrainte qu'il faut aller chercher.
    delete from public.household_member_bodies where member_id = v_target.member_id;
    delete from public.household_members where member_id = v_target.member_id;
    return jsonb_build_object(
      'ok', true, 'action', 'removed',
      'member_id', v_target.member_id, 'household_id', v_target.household_id);
  end if;

  delete from public.household_member_bodies where member_id = v_target.member_id;

  update public.household_members
     set user_id = null,
         departs_with_account = false
   where member_id = v_target.member_id;

  return jsonb_build_object(
    'ok', true, 'action', 'detached',
    'member_id', v_target.member_id, 'household_id', v_target.household_id);
end;
$function$;

comment on function public.keel_household_purge_user(uuid) is
  'Ce que la purge RGPD fait du FOYER d''un compte effacé: sa ligne est '
  'DÉTACHÉE (D3) — elle reste une bouche du foyer — sauf si la personne a '
  'coché « retirer aussi ma place », auquel cas elle part. SON CORPS, LUI, PART '
  'DANS LES DEUX CAS (2026-08-12): prénom et date répondent à « pour qui je '
  'cuisine », une taille et un poids sont des métriques d''une personne qui a '
  'quitté le produit. Appelée AVANT purge_auth_user. Réservée au SERVEUR.';

-- ---------------------------------------------------------------------------
-- 7. LES PRIVILÈGES — écrits, y compris ceux qu'on ne donne pas
-- ---------------------------------------------------------------------------
--
-- `revoke from public` NE RETIRE PAS `anon`: il a son propre GRANT implicite, et
-- toute fonction neuve est exécutable par tout le monde par défaut.

revoke all on function
  public.keel_household_set_member_body(uuid, numeric, numeric, text)
  from public, anon;
grant execute on function
  public.keel_household_set_member_body(uuid, numeric, numeric, text)
  to authenticated;

revoke all on function public.keel_household_member_bodies() from public, anon;
grant execute on function public.keel_household_member_bodies() to authenticated;

-- La résolution de date est INTERNE: elle rend une DATE, et aucune date ne sort
-- vers un navigateur dans ce domaine. Même traitement que `keel_age_state`.
revoke all on function public.keel_household_member_birth_date(uuid)
  from public, anon, authenticated;

-- L'âge en ANNÉES et les corps: le SERVEUR seul.
revoke all on function public.keel_household_bodies_for(uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_bodies_for(uuid) to service_role;

revoke all on function public.keel_household_member_age(uuid) from public, anon;
grant execute on function public.keel_household_member_age(uuid) to authenticated;

revoke all on function public.keel_household_set_reference_member(uuid, uuid)
  from public, anon;
grant execute on function public.keel_household_set_reference_member(uuid, uuid)
  to authenticated;

-- ⚠️ `auth.uid()` EST NULL SOUS `service_role`. Les trois ci-dessus sont des
-- GESTES HUMAINS et sont gatées dessus: aucune n'est appelable par un cron ou
-- une fonction edge, et c'est voulu. Le générateur lit la TABLE directement
-- avec la clé de service (grant de la section 1).

revoke all on function public.keel_household_purge_user(uuid)
  from public, anon, authenticated;
grant execute on function public.keel_household_purge_user(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. LES PRIVILÈGES, ASSERTÉS — pas relus, ASSERTÉS
-- ---------------------------------------------------------------------------
--
-- Le dépôt a la cicatrice « revoke from public laisse anon » et celle des
-- privilèges par défaut. Une migration qui écrit un `revoke` et n'en vérifie
-- pas l'effet est une migration qui croit avoir fermé une porte.
do $$
begin
  if has_table_privilege('authenticated', 'public.household_member_bodies', 'SELECT') then
    raise exception
      '`authenticated` peut LIRE household_member_bodies — le poids de chaque '
      'bouche redevient lisible par tout co-membre, ce que cette table existe '
      'pour empêcher';
  end if;
  if has_table_privilege('anon', 'public.household_member_bodies', 'SELECT') then
    raise exception '`anon` peut lire household_member_bodies';
  end if;
  if has_table_privilege('authenticated', 'public.household_member_bodies', 'INSERT')
     or has_table_privilege('authenticated', 'public.household_member_bodies', 'UPDATE')
     or has_table_privilege('authenticated', 'public.household_member_bodies', 'DELETE') then
    raise exception
      '`authenticated` peut ÉCRIRE household_member_bodies en direct — la garde '
      'du compte maître de keel_household_set_member_body est contournable';
  end if;
  if not has_table_privilege('service_role', 'public.household_member_bodies', 'SELECT') then
    raise exception
      '`service_role` ne peut PAS lire household_member_bodies — le générateur '
      'du foyer ne verrait aucun corps, et tout le lot serait inerte';
  end if;
  if has_function_privilege('anon',
       'public.keel_household_set_member_body(uuid, numeric, numeric, text)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.keel_household_set_reference_member(uuid, uuid)', 'EXECUTE') then
    raise exception '`anon` peut exécuter une RPC d''écriture du foyer';
  end if;
  -- L'ÂGE EXACT NE SORT PAS VERS UN NAVIGATEUR. C'est la seule chose que ce lot
  -- ajoute qui pourrait, si on l'ouvrait, faire d'un roster une fiche d'état
  -- civil — et le README du foyer dit que le foyer doit savoir qu'il y a un
  -- enfant à table, pas l'âge de chacun.
  if has_function_privilege('authenticated',
       'public.keel_household_bodies_for(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.keel_household_member_birth_date(uuid)', 'EXECUTE') then
    raise exception
      '`authenticated` peut lire l''âge exact ou la date d''une bouche — le '
      'roster ne rend que trois états EXPRÈS, et cette porte le contournerait';
  end if;
  if not has_function_privilege('service_role',
       'public.keel_household_bodies_for(uuid)', 'EXECUTE') then
    raise exception
      '`service_role` ne peut PAS lire les corps — le générateur du foyer ne '
      'dimensionnerait rien, et tout le lot serait inerte';
  end if;
  raise notice 'privilèges: assertés (authenticated ne lit ni n''écrit la table des corps)';
end $$;

-- ---------------------------------------------------------------------------
-- 9. CONTRÔLE FINAL — LES DEUX DÉCISIONS, SUR UN VRAI FOYER, PUIS ROLLBACK
-- ---------------------------------------------------------------------------
--
-- Lire le catalogue prouverait que les fonctions existent, pas qu'elles
-- décident juste. On monte un foyer jetable et on joue chaque refus AVEC son
-- cas passant — « une garde a besoin d'un cas qui passe », sinon on ne sait pas
-- si l'on a gardé quelque chose ou tout bloqué.
--
-- ⚠️ Le bloc entier est une sous-transaction qui se termine par un `raise`
-- attrapé: rien de ce qui suit ne survit à la migration.
do $$
declare
  v_owner uuid;
  v_stranger uuid;
  v_house uuid;
  v_house2 uuid;
  v_m_owner uuid;
  v_m_kid uuid;
  v_m_nodate uuid;
  v_m_far uuid;
  v_res jsonb;
  v_seen int;
  v_age text;
begin
  select u.id into v_owner from auth.users u
   join public.profiles p on p.id = u.id
   where public.keel_household_of(u.id) is null
   order by u.created_at limit 1;
  select u.id into v_stranger from auth.users u
   where u.id <> v_owner and public.keel_household_of(u.id) is null
   order by u.created_at limit 1;
  if v_owner is null or v_stranger is null then
    raise notice 'household_member_body: moins de deux comptes libres, contrôle sauté';
    return;
  end if;

  insert into public.households (name, created_by)
  values ('__qa_body_ref__', v_owner) returning id into v_house;
  insert into public.households (name, created_by)
  values ('__qa_body_ref_2__', v_owner) returning id into v_house2;

  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date, goal)
  values (v_house, v_owner, 'owner', 'Mere', date '1988-03-04', 'fat_loss')
  returning member_id into v_m_owner;
  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date, goal)
  values (v_house, null, 'member', 'Lea', current_date - interval '8 years', 'fat_loss')
  returning member_id into v_m_kid;
  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date, goal)
  values (v_house, null, 'member', 'Sans date', null, null)
  returning member_id into v_m_nodate;
  insert into public.household_members
    (household_id, user_id, role, first_name, birth_date, goal)
  values (v_house2, null, 'member', 'Ailleurs', date '1990-01-01', null)
  returning member_id into v_m_far;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- ══ D-A · LE CORPS ══════════════════════════════════════════════════════

  -- LE CAS PASSANT D'ABORD. Sans lui, six refus verts ne prouveraient que
  -- « tout est bloqué ».
  v_res := public.keel_household_set_member_body(v_m_kid, 128, 26, 'male');
  if v_res->>'ok' <> 'true' then
    raise exception 'corps cas passant: le maître ne peut pas saisir un corps (%)',
      v_res->>'reason';
  end if;
  -- ET IL EST RELISIBLE PAR SON AUTEUR.
  select count(*) into v_seen from public.keel_household_member_bodies()
   where member_id = v_m_kid;
  if v_seen <> 1 then
    raise exception 'corps: le maître ne relit pas ce qu''il vient de saisir (% lignes)', v_seen;
  end if;

  -- L'IDEMPOTENCE: resaisir met à jour, ne double pas.
  v_res := public.keel_household_set_member_body(v_m_kid, 129, 26.5, 'male');
  select count(*) into v_seen from public.household_member_bodies where member_id = v_m_kid;
  if v_seen <> 1 then
    raise exception 'corps: une seconde saisie crée une seconde ligne (% lignes)', v_seen;
  end if;

  -- LES REFUS.
  if (public.keel_household_set_member_body(v_m_kid, 128, null, 'male'))->>'reason'
     <> 'body_incomplete' then
    raise exception 'corps: un DEMI-corps (sans poids) est accepté — « obligatoire » ne mord nulle part';
  end if;
  if (public.keel_household_set_member_body(v_m_kid, 20, 26, 'male'))->>'reason'
     <> 'bad_height' then
    raise exception 'corps: une taille de 20 cm est acceptée';
  end if;
  if (public.keel_household_set_member_body(v_m_kid, 128, 700, 'male'))->>'reason'
     <> 'bad_weight' then
    raise exception 'corps: un poids de 700 kg est accepté';
  end if;
  if (public.keel_household_set_member_body(v_m_kid, 128, 26, 'martian'))->>'reason'
     <> 'bad_gender' then
    raise exception 'corps: un sexe hors vocabulaire est accepté';
  end if;
  if (public.keel_household_set_member_body(v_m_far, 170, 60, 'female'))->>'reason'
     <> 'not_a_member' then
    raise exception 'corps: le maître écrit le corps d''une bouche d''un AUTRE foyer';
  end if;

  -- LE NON-MAÎTRE. Il n'existe pas de non-maître avec compte dans ce foyer
  -- jetable; on prend un compte SANS foyer, qui doit recevoir `no_household`.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  if (public.keel_household_set_member_body(v_m_kid, 128, 26, 'male'))->>'reason'
     <> 'no_household' then
    raise exception 'corps: un compte étranger au foyer écrit un corps';
  end if;
  -- ET IL NE LIT RIEN — zéro ligne, pas une erreur.
  select count(*) into v_seen from public.keel_household_member_bodies();
  if v_seen <> 0 then
    raise exception 'corps: un compte étranger lit % corps', v_seen;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- ══ LA PORTE DU SERVEUR ═════════════════════════════════════════════════
  --
  -- Elle rend une ligne PAR BOUCHE, avec ou sans corps, et un âge en ANNÉES.
  select count(*) into v_seen from public.keel_household_bodies_for(v_house);
  if v_seen <> 3 then
    raise exception
      'serveur: keel_household_bodies_for rend % lignes pour 3 bouches — une '
      'bouche sans corps doit rester visible, sinon « pas de corps » et '
      '« absente du foyer » se confondent', v_seen;
  end if;
  -- L'ÂGE EN ANNÉES EST JUSTE, et c'est lui qui choisit l'ÉQUATION.
  select age_years into v_seen from public.keel_household_bodies_for(v_house)
   where member_id = v_m_kid;
  if v_seen <> 8 then
    raise exception
      'serveur: un enfant né il y a 8 ans rend % années — la tranche de '
      'Schofield serait choisie sur un âge faux', v_seen;
  end if;
  -- ET LA RÉSOLUTION D18 EST INTACTE: la fiche décide pour une bouche sans
  -- compte, et l'état d'âge continue de dire la même chose que les années.
  if public.keel_household_member_age(v_m_kid) <> 'minor' then
    raise exception
      'serveur: l''extraction de keel_household_member_birth_date a changé '
      'l''état d''âge d''une bouche sans compte';
  end if;
  if public.keel_household_member_age(v_m_nodate) <> 'unknown' then
    raise exception 'serveur: une bouche sans date ne rend plus `unknown`';
  end if;
  -- ⚠️ L'ASSERTION PORTE SUR `is null`, PAS SUR UN `count(*)`. Une fonction SQL
  -- SCALAIRE placée en `from` rend TOUJOURS une ligne, même quand son corps n'en
  -- sélectionne aucune: le `count(*)` valait 1 des deux côtés et n'aurait rien
  -- distingué. Ce qui se lit vraiment est la VALEUR — corps vide ⇒ NULL.
  v_age := public.keel_household_member_age(gen_random_uuid());
  if v_age is not null then
    raise exception
      'serveur: keel_household_member_age rend « % » pour un member_id '
      'INEXISTANT — « n''existe pas » devient « âge inconnu »', v_age;
  end if;
  select age_years into v_seen from public.keel_household_bodies_for(v_house)
   where member_id = v_m_nodate;
  if v_seen is not null then
    raise exception 'serveur: une bouche sans date rend un âge (%)', v_seen;
  end if;

  -- ══ D-1 · LE RÉFÉRENT ═══════════════════════════════════════════════════

  -- LE CAS PASSANT: un adulte de son foyer.
  v_res := public.keel_household_set_reference_member(v_house, v_m_owner);
  if v_res->>'ok' <> 'true' then
    raise exception 'référent cas passant: le maître ne peut désigner personne (%)',
      v_res->>'reason';
  end if;
  if (select reference_member_id from public.households where id = v_house)
     is distinct from v_m_owner then
    raise exception 'référent: la RPC rend ok et la colonne n''a pas bougé';
  end if;

  -- LE RETOUR AU DÉFAUT.
  v_res := public.keel_household_set_reference_member(v_house, null);
  if v_res->>'ok' <> 'true'
     or (select reference_member_id from public.households where id = v_house) is not null then
    raise exception 'référent: le retour au défaut (NULL) ne repasse pas la colonne à NULL';
  end if;

  -- LE MINEUR.
  if (public.keel_household_set_reference_member(v_house, v_m_kid))->>'reason'
     <> 'minor_cannot_be_reference' then
    raise exception
      'référent: un MINEUR est accepté — sa doctrine gouvernerait l''assiette d''adultes';
  end if;

  -- L'ÂGE INCONNU — le cas que `referenceMemberId` laissait passer.
  if (public.keel_household_set_reference_member(v_house, v_m_nodate))->>'reason'
     <> 'age_unknown_cannot_be_reference' then
    raise exception
      'référent: une bouche d''âge INCONNU est acceptée — `goalApplies` la '
      'refuse pour l''objectif, les deux gardes divergent';
  end if;

  -- LA BOUCHE D'UN AUTRE FOYER.
  if (public.keel_household_set_reference_member(v_house, v_m_far))->>'reason'
     <> 'not_a_member' then
    raise exception 'référent: une bouche d''un AUTRE foyer est acceptée';
  end if;

  -- LE MAUVAIS FOYER EN ARGUMENT.
  if (public.keel_household_set_reference_member(v_house2, v_m_owner))->>'reason'
     <> 'not_your_household' then
    raise exception 'référent: un p_household qui n''est pas le sien est accepté';
  end if;

  -- LE NON-MAÎTRE.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  if (public.keel_household_set_reference_member(v_house, v_m_owner))->>'reason'
     <> 'no_household' then
    raise exception 'référent: un compte étranger au foyer désigne un référent';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  raise notice
    'household_member_body_and_reference: cas passants + 11 refus vérifiés sur un vrai foyer';
  raise exception using errcode = 'triggered_action_exception', message = '__qa_rollback__';
exception
  when triggered_action_exception then
    if sqlerrm <> '__qa_rollback__' then raise; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. LE TROU QUI RESTE, COMPTÉ ET NOMMÉ
-- ---------------------------------------------------------------------------
do $$
declare v_total int; v_with int;
begin
  select count(*) into v_total from public.household_members;
  select count(*) into v_with from public.household_member_bodies;
  raise notice
    'corps du foyer: % bouches, % avec un corps. Les % sans corps comptent pour '
    'une part STANDARD (jamais réduite) et ne pèsent pas dans le MIN du tronc. '
    'Aucun backfill n''est possible: on ne sait pas combien elles pèsent, et un '
    'poids par défaut serait un nombre inventé sur une personne réelle.',
    v_total, v_with, v_total - v_with;
end $$;

commit;
