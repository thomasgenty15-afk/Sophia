-- ============================================================================
-- LE FOYER — la fondation
-- ============================================================================
-- Autorité produit: docs/keel/PIVOT-FOYER.md.
--
-- Le produit planifiait pour UNE personne. Il doit planifier pour un FOYER:
-- une cuisson, N jours, M personnes, et des portions qui BIFURQUENT selon
-- l'objectif de chacun (PIVOT-FOYER §3). Rien de tout ça n'existait: pas de
-- table, pas d'appartenance, pas d'invitation, pas de mise en commun.
--
-- Cette migration ne touche à AUCUN chemin existant. `student_generated_meals`
-- gagne deux colonnes nullables; tout ce qui la lit aujourd'hui continue de
-- lire exactement ce qu'il lisait.
--
-- ── LES DEUX AUTORITÉS, EN BASE (PIVOT-FOYER §8.5) ───────────────────────
-- Il y a deux pouvoirs de nature différente dans ce produit, et les confondre
-- casse les deux:
--
--   SOPHIA        épistémique  — explique, ne BLOQUE JAMAIS, dans aucun mode.
--   COMPTE MAÎTRE domestique   — restreint, sous conditions strictes.
--
-- Rien ici ne donne à un modèle le pouvoir d'interdire quoi que ce soit:
-- `household_food_restrictions` est un fait DOMESTIQUE, posé par un humain,
-- attribué à cet humain, et lu comme tel. C'est pour ça que la table porte
-- `created_by` et qu'aucune colonne ne porte de « raison nutritionnelle »:
-- présenter une décision parentale comme une vérité de santé est le mensonge
-- que §8.5 règle 4 interdit, et une colonne `reason` serait l'invitation à le
-- commettre.
--
-- ── LE MINEUR N'EST PAS UNE CIBLE ────────────────────────────────────────
-- `student_age.ts` REFUSE déjà un plan nutritionnel à un mineur
-- (`weekPlanAgeGate`). Le foyer ne contourne pas cette ceinture, il l'étend:
-- un enfant du foyer est un MANGEUR — allergies, goûts, restrictions
-- parentales, portions adaptées — jamais quelqu'un pour qui on vise un
-- objectif. Aucune table d'ici ne porte d'objectif par membre, et c'est
-- délibéré: `student_goals` reste la seule source, et le générateur ne la lit
-- que pour les majeurs (PIVOT-FOYER §8.4).
--
-- ── CE QUE LE FOYER DONNE ACCÈS, ET CE QU'IL NE DONNE PAS ────────────────
-- Le foyer ouvre l'accès à CE QUE LE FOYER MANGE. Il n'ouvre JAMAIS l'accès à
-- ce qu'un membre pèse ou vise: `student_goals`, `student_body`,
-- `student_safety_constraints` ne gagnent aucune policy ici. Un colocataire
-- ne doit pas apprendre que l'autre est en sèche parce qu'ils partagent des
-- courses — et la protection n'est pas une règle d'écran, c'est l'absence de
-- policy.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Les tables
-- ---------------------------------------------------------------------------

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  -- LA BASCULE QUI GOUVERNE DEUX CHOSES (§8.5, « ce qui reste ouvert »):
  -- le droit de restreindre, ET ce que l'écran montre des objectifs d'autrui.
  kind text not null,
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint households_kind_check check (kind in ('family', 'shared')),
  constraint households_name_check check (char_length(name) between 1 and 80)
);

comment on table public.households is
  'Un foyer: les gens pour qui on cuisine ensemble. `kind` = ''family'' '
  'autorise la restriction parentale et l''affichage des objectifs entre '
  'membres; ''shared'' (couple, colocation) n''autorise NI l''un NI l''autre.';

comment on column public.households.kind is
  'family | shared. UNE bascule, DEUX conséquences (PIVOT-FOYER §8.5): le '
  'droit du compte maître de restreindre un membre, et la visibilité des '
  'objectifs entre membres. Les séparer en deux colonnes inviterait un foyer '
  'à être « famille pour restreindre » et « partagé pour ne rien montrer ».';

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  -- LE CONSENTEMENT DU MAJEUR (§8.5 règle 1). Un mineur n'a PAS ce champ à
  -- porter: sa restreignabilité se relit de `profiles.birth_date` à chaque
  -- décision, parce qu'un enfant grandit et qu'un booléen figé au jour de
  -- l'entrée survivrait à ses seize ans.
  restriction_consent_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  constraint household_members_role_check check (role in ('owner', 'member'))
);

comment on column public.household_members.restriction_consent_at is
  'Le majeur a explicitement accepté que le compte maître puisse restreindre '
  'des aliments pour lui. NULL = non, et c''est le DÉFAUT: un produit où un '
  'adulte contrôle en silence l''alimentation d''un autre adulte est un outil '
  'de contrôle coercitif. Révocable par lui seul '
  '(keel_household_revoke_consent), et la révocation SUPPRIME les '
  'restrictions déjà posées — sinon retirer son accord ne retire rien.';

-- UN SEUL FOYER PAR PERSONNE, en V1. La cause est écrite parce qu'une
-- contrainte documentée survit à sa cause: elle rend la résolution du foyer
-- SCALAIRE (`keel_household_of`), ce dont dépendent toutes les policies plus
-- bas. Le jour où quelqu'un veut deux foyers, il devra d'abord réécrire les
-- policies — et cet index est là pour qu'il le sache avant, pas après.
create unique index if not exists household_members_one_per_user
  on public.household_members (user_id);

create table if not exists public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- L'INVITATION EST LIÉE À UNE ADRESSE. Un lien qui fuite ne fait donc rien
  -- entre les mains d'un inconnu: `keel_household_join` compare l'adresse du
  -- compte qui rejoint à celle-ci. Le dépôt a déjà payé « token /join
  -- rejouable » (student_onboarding_parcours_gaps); on ne le recopie pas.
  email text not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint household_invitations_email_lower_check check (email = lower(email))
);

comment on table public.household_invitations is
  'Invitation à rejoindre un foyer. USAGE UNIQUE (`consumed_at`), liée à une '
  'adresse, expirante. La base ne stocke que sha256(jeton) via '
  'public.coach_invite_token_hash — un dump ne rend rien d''utilisable.';

create index if not exists household_invitations_pending_idx
  on public.household_invitations (household_id, created_at)
  where consumed_at is null;

create table if not exists public.household_food_restrictions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  -- QUI A DÉCIDÉ. Pas de la traçabilité décorative: §8.5 règle 3 exige que la
  -- personne restreinte voie QUI l'a restreinte, et règle 4 interdit de faire
  -- passer cette décision pour une vérité nutritionnelle. Sans cette colonne,
  -- l'écran n'aurait d'autre choix que d'écrire une phrase impersonnelle,
  -- c'est-à-dire de laisser croire que c'est le produit qui juge.
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint household_food_restrictions_label_check
    check (char_length(label) between 1 and 120),
  unique (household_id, member_user_id, label)
);

comment on table public.household_food_restrictions is
  'Le POUVOIR DOMESTIQUE: « pas de Nutella pour Léa ». Un fait de foyer, posé '
  'par un humain, attribué à cet humain. AUCUNE colonne de raison, et c''est '
  'délibéré: une décision parentale présentée comme un conseil de santé est '
  'le mensonge que PIVOT-FOYER §8.5 règle 4 interdit.';

create index if not exists household_food_restrictions_member_idx
  on public.household_food_restrictions (household_id, member_user_id);

create table if not exists public.household_envy_submissions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_envy_body_check check (char_length(body) between 1 and 500),
  -- Une envie par personne et par semaine. La dernière REMPLACE: on change
  -- d'avis le samedi, ce n'est pas un journal.
  unique (household_id, user_id, week_start)
);

comment on table public.household_envy_submissions is
  'Le conseil de famille (PIVOT-FOYER §8): ce dont chacun a envie pour la '
  'semaine. L''ABSENCE DE LIGNE EST L''ÉTAT — « le silence est une réponse '
  'valide » (§8.4). Aucun statut « en attente » n''est inventé ici, sinon un '
  'membre muet gèlerait les courses de tout le foyer.';

-- ---------------------------------------------------------------------------
-- 2. Les deux colonnes additives sur la composition
-- ---------------------------------------------------------------------------
--
-- ADDITIVES, pas substitutives: `user_id` reste l'auteur de la ligne et
-- `student_generated_meals_owner_read` continue de mordre exactement comme
-- avant. Une composition de foyer est une composition, plus un foyer.

alter table public.student_generated_meals
  add column if not exists household_id uuid references public.households(id);

comment on column public.student_generated_meals.household_id is
  'Le foyer pour lequel cette composition a été faite. NULL = composition '
  'individuelle, le cas de toute la table avant le 2026-08-08 et le cas '
  'majoritaire ensuite (l''entrée du produit est à 1, PIVOT-FOYER §5).';

alter table public.student_generated_meals
  add column if not exists member_portions jsonb not null default '[]'::jsonb;

comment on column public.student_generated_meals.member_portions is
  'LA BIFURCATION: [{user_id, display_name, portion_note, '
  'preparation_shares:[{preparation_id, note}]}]. `portion_note` est une '
  'CONSIGNE DE SERVICE (« 1,5 part, féculent en plus »), jamais un chiffre de '
  'calories et JAMAIS la raison — « parce que tu es en sèche » sur une ligne '
  'que tout le foyer peut lire divulguerait l''objectif d''un membre à ses '
  'colocataires. L''instruction est publique, le pourquoi ne l''est pas.';

alter table public.student_generated_meals
  add constraint student_generated_meals_member_portions_check
    check (jsonb_typeof(member_portions) = 'array')
  not valid;

alter table public.student_generated_meals
  validate constraint student_generated_meals_member_portions_check;

create index if not exists student_generated_meals_household_idx
  on public.student_generated_meals (household_id, starts_on)
  where household_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Les deux résolveurs — SECURITY DEFINER, pour casser la récursion RLS
-- ---------------------------------------------------------------------------
--
-- Une policy sur `household_members` qui lirait `household_members` boucle.
-- La sortie standard est un résolveur `security definer` qui court-circuite
-- RLS. Il est SCALAIRE grâce à `household_members_one_per_user`.

create or replace function public.keel_household_of(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select hm.household_id
  from public.household_members hm
  where hm.user_id = p_user
  limit 1;
$function$;

comment on function public.keel_household_of(uuid) is
  'Le foyer de cette personne, ou NULL. SECURITY DEFINER pour que les policies '
  'de household_members puissent l''appeler sans récursion. Scalaire parce '
  'que household_members_one_per_user garantit l''unicité.';

-- L'ÂGE, LU À CHAQUE DÉCISION — jamais figé.
--
-- Un enfant grandit. Un booléen `is_minor` écrit au jour de l'entrée serait
-- encore vrai à ses dix-huit ans, et la restriction parentale lui survivrait
-- (PIVOT-FOYER §8.5, « les enfants grandissent »).
--
-- UNE DATE ABSENTE REND `false`, c'est-à-dire « traité comme majeur ». C'est
-- la direction SÛRE ici, et elle mérite d'être dite parce qu'elle est
-- l'inverse de l'intuition: « majeur » veut dire NON restreignable sans son
-- accord explicite. Rendre `true` par prudence donnerait au compte maître un
-- pouvoir sur tout adulte qui n'a pas renseigné sa date de naissance.
create or replace function public.keel_household_is_minor(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (
      select p.birth_date is not null
         and p.birth_date > (current_date - interval '18 years')
         and p.birth_date <= current_date
      from public.profiles p
      where p.id = p_user
    ),
    false
  );
$function$;

comment on function public.keel_household_is_minor(uuid) is
  'Moins de 18 ans, relu à chaque appel. Une date ABSENTE ou future rend '
  'false = « traité comme majeur » = NON restreignable sans accord explicite. '
  'Le seuil est celui de KEEL_MINOR_AGE dans _shared/keel/student_age.ts.';

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invitations enable row level security;
alter table public.household_food_restrictions enable row level security;
alter table public.household_envy_submissions enable row level security;

-- LECTURE SEULE PARTOUT. Toute écriture passe par une RPC à porte étroite
-- (section 5), pour la raison exacte de `coach_clients`: une policy RLS ne
-- restreint pas les COLONNES. Ouvrir l'UPDATE de `household_members` pour que
-- quelqu'un pose son consentement ouvrirait du même geste `role` — c'est-à-dire
-- laisserait n'importe quel membre se promouvoir compte maître.

drop policy if exists households_member_read on public.households;
create policy households_member_read on public.households
  for select to authenticated
  using (id = public.keel_household_of((select auth.uid())));

drop policy if exists household_members_member_read on public.household_members;
create policy household_members_member_read on public.household_members
  for select to authenticated
  using (household_id = public.keel_household_of((select auth.uid())));

-- Les invitations ne se lisent QUE par le foyer qui les a émises, et le jeton
-- n'y est présent que haché. Un invité ne lit pas la ligne: il la consomme par
-- la RPC, avec le jeton en clair qu'il détient déjà.
drop policy if exists household_invitations_member_read on public.household_invitations;
create policy household_invitations_member_read on public.household_invitations
  for select to authenticated
  using (household_id = public.keel_household_of((select auth.uid())));

-- LA RESTRICTION EST VISIBLE DE TOUT LE FOYER, y compris de la personne
-- qu'elle vise — c'est §8.5 règle 3, et c'est la moitié qui rend le pouvoir
-- domestique acceptable: il est nommé et attribué, jamais silencieux.
drop policy if exists household_food_restrictions_member_read
  on public.household_food_restrictions;
create policy household_food_restrictions_member_read
  on public.household_food_restrictions
  for select to authenticated
  using (household_id = public.keel_household_of((select auth.uid())));

-- Les envies sont lisibles de tout le foyer, dans les DEUX modes. « J'ai envie
-- d'un curry » n'est pas une donnée sensible; c'est même l'objet du rituel. Ce
-- qui reste privé — objectif, poids, contraintes de sécurité — n'est pas dans
-- cette table et ne gagne aucune policy dans cette migration.
drop policy if exists household_envy_member_read on public.household_envy_submissions;
create policy household_envy_member_read on public.household_envy_submissions
  for select to authenticated
  using (household_id = public.keel_household_of((select auth.uid())));

-- La composition du foyer se lit par tout le foyer. ADDITIVE: la policy
-- `student_generated_meals_owner_read` existante n'est pas touchée, et une
-- ligne sans `household_id` reste lisible de son seul auteur.
drop policy if exists student_generated_meals_household_read
  on public.student_generated_meals;
create policy student_generated_meals_household_read
  on public.student_generated_meals
  for select to authenticated
  using (
    household_id is not null
    and household_id = public.keel_household_of((select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 5. Les RPC
-- ---------------------------------------------------------------------------
--
-- ⚠️ `auth.uid()` EST NULL SOUS service_role. Toutes ces fonctions sont faites
-- pour le JWT du navigateur et refusent proprement sinon. Un job serveur qui
-- voudrait le même effet écrit les tables directement.

-- 5.1 Créer un foyer -------------------------------------------------------

create or replace function public.keel_household_create(
  p_name text,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if v_kind not in ('family', 'shared') then
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  if public.keel_household_of(v_user) is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_in_household');
  end if;

  insert into public.households (kind, name, created_by)
  values (v_kind, v_name, v_user)
  returning id into v_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_id, v_user, 'owner');

  return jsonb_build_object('ok', true, 'household_id', v_id, 'kind', v_kind);
end;
$function$;

-- 5.2 Inviter --------------------------------------------------------------
--
-- Le jeton en clair n'est rendu QU'ICI, une fois. La base n'en garde que le
-- sha256, via `public.coach_invite_token_hash` — la fonction existante, pas
-- une seconde définition du même hachage: deux implémentations de « le même
-- sha256 » divergent au premier ajustement et personne ne sait alors laquelle
-- ment.

create or replace function public.keel_household_invite(
  p_email text
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
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_today_count integer;
  v_token text;
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
  if v_email !~ '^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$' or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'reason', 'bad_email');
  end if;

  -- PLAFOND. Un foyer n'invite pas vingt personnes par jour; ce qui le ferait,
  -- c'est un script. Le plafond est ici et pas dans l'écran, parce qu'une
  -- limite d'UI n'est pas une limite.
  select count(*) into v_today_count
  from public.household_invitations hi
  where hi.household_id = v_household
    and hi.created_at >= (now() - interval '1 day');

  if v_today_count >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  v_token := translate(
    encode(extensions.gen_random_bytes(32), 'base64'),
    '+/=', '-_'
  );

  insert into public.household_invitations
    (household_id, email, token_hash, invited_by, expires_at)
  values
    (v_household, v_email, public.coach_invite_token_hash(v_token), v_user,
     now() + interval '14 days');

  return jsonb_build_object('ok', true, 'token', v_token, 'email', v_email);
end;
$function$;

-- 5.3 Rejoindre ------------------------------------------------------------
--
-- USAGE UNIQUE, garanti par `for update` + `consumed_at`. Et l'adresse du
-- compte qui rejoint doit être celle de l'invitation: un lien qui fuite ne
-- fait donc rien entre les mains d'un inconnu.

create or replace function public.keel_household_join(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_inv record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if public.keel_household_of(v_user) is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_in_household');
  end if;

  select lower(btrim(coalesce(u.email, ''))) into v_email
  from auth.users u where u.id = v_user;

  select * into v_inv
  from public.household_invitations hi
  where hi.token_hash = public.coach_invite_token_hash(coalesce(p_token, ''))
  for update;

  if v_inv.id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_token');
  end if;
  if v_inv.consumed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_email is null or v_email <> v_inv.email then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_inv.household_id, v_user, 'member');

  update public.household_invitations
     set consumed_at = now()
   where id = v_inv.id;

  return jsonb_build_object('ok', true, 'household_id', v_inv.household_id);
end;
$function$;

-- 5.4 Le consentement du majeur -------------------------------------------
--
-- POSÉ ET RETIRÉ PAR LUI SEUL. Aucun paramètre `p_user`: la fonction agit sur
-- l'appelant, point. Un paramètre serait la porte par laquelle le compte
-- maître consentirait à la place de l'autre.

create or replace function public.keel_household_grant_consent()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  update public.household_members
     set restriction_consent_at = coalesce(restriction_consent_at, now())
   where user_id = v_user
  returning household_id into v_household;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- LA RÉVOCATION SUPPRIME CE QUI EXISTE DÉJÀ.
--
-- C'est le seul arbitrage subtil de ce lot, et il est écrit en toutes lettres
-- dans PIVOT-FOYER §8.5: ne retirer que le droit de poser de NOUVELLES
-- restrictions laisserait en place toutes les anciennes — c'est-à-dire ferait
-- d'un retrait de consentement un geste sans effet, ce qui est pire qu'un
-- consentement qu'on n'aurait jamais demandé.
create or replace function public.keel_household_revoke_consent()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_removed integer := 0;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  update public.household_members
     set restriction_consent_at = null
   where user_id = v_user
  returning household_id into v_household;

  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;

  with gone as (
    delete from public.household_food_restrictions
     where household_id = v_household
       and member_user_id = v_user
    returning 1
  )
  select count(*) into v_removed from gone;

  return jsonb_build_object('ok', true, 'restrictions_removed', v_removed);
end;
$function$;

-- 5.5 Poser une restriction ------------------------------------------------
--
-- POURQUOI L'ÉLIGIBILITÉ VIT ICI ET PAS DANS UNE POLICY: une policy rend
-- « autorisé » ou « zéro ligne », jamais POURQUOI. Or l'écran doit dire
-- laquelle des trois raisons a mordu — « ce foyer n'est pas une famille »,
-- « tu n'es pas le compte maître », « cette personne majeure ne l'a pas
-- accepté » — et une raison muette produit un produit mystérieusement cassé.

create or replace function public.keel_household_add_restriction(
  p_member uuid,
  p_label text
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
  v_kind text;
  v_label text := btrim(coalesce(p_label, ''));
  v_target record;
  v_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if char_length(v_label) < 1 or char_length(v_label) > 120 then
    return jsonb_build_object('ok', false, 'reason', 'bad_label');
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

  select h.kind into v_kind from public.households h where h.id = v_household;

  -- §8.5 règle 1: hors mode famille, AUCUN verrouillage. Ni sur un mineur, ni
  -- sur un consentant. Une colocation n'est pas un foyer où quelqu'un décide
  -- pour les autres.
  if v_kind <> 'family' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_family');
  end if;

  select hm.user_id, hm.restriction_consent_at into v_target
  from public.household_members hm
  where hm.household_id = v_household and hm.user_id = p_member;

  if v_target.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- MEMBRE PAR MEMBRE, jamais au niveau du foyer: on restreint l'enfant de
  -- huit ans, pas son conjoint. Un majeur n'est restreignable QUE s'il l'a
  -- explicitement accepté.
  if not public.keel_household_is_minor(p_member)
     and v_target.restriction_consent_at is null then
    return jsonb_build_object('ok', false, 'reason', 'adult_without_consent');
  end if;

  insert into public.household_food_restrictions
    (household_id, member_user_id, label, created_by)
  values (v_household, p_member, v_label, v_user)
  on conflict (household_id, member_user_id, label) do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'restriction_id', v_id);
end;
$function$;

create or replace function public.keel_household_remove_restriction(
  p_id uuid
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
  v_deleted integer;
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

  with gone as (
    delete from public.household_food_restrictions
     where id = p_id and household_id = v_household
    returning 1
  )
  select count(*) into v_deleted from gone;

  return jsonb_build_object('ok', v_deleted > 0, 'reason',
    case when v_deleted > 0 then 'removed' else 'not_found' end);
end;
$function$;

-- 5.6 Déposer son envie ----------------------------------------------------

create or replace function public.keel_household_submit_envy(
  p_week_start date,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_household uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_week_start is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_week');
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'bad_body');
  end if;

  v_household := public.keel_household_of(v_user);
  if v_household is null then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;

  insert into public.household_envy_submissions
    (household_id, user_id, week_start, body)
  values (v_household, v_user, p_week_start, v_body)
  on conflict (household_id, user_id, week_start)
  do update set body = excluded.body, updated_at = now();

  return jsonb_build_object('ok', true);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Les droits
-- ---------------------------------------------------------------------------
--
-- DEUX PIÈGES ICI, ET LE SECOND A ÉTÉ MESURÉ, PAS SUPPOSÉ.
--
-- 1. `revoke from public` ne retire pas `anon` (leçon déjà payée par ce dépôt).
--
-- 2. `alter default privileges` de Supabase donne **TOUT** à `authenticated`
--    sur chaque table neuve de `public` — INSERT, UPDATE, DELETE, TRUNCATE
--    compris. Un `grant select` par-dessus n'enlève RIEN: il s'ajoute à un
--    ensemble déjà total. La première rédaction de cette migration ne
--    révoquait que `public, anon`, et `authenticated` gardait les sept
--    privilèges.
--
--    Pourquoi ça compte alors que RLS bloque déjà les écritures: **TRUNCATE
--    N'EST PAS SOUMIS À RLS**. Mesuré sur la base locale — un simple compte
--    connecté vidait `household_envy_submissions`. Et pour les autres verbes,
--    la seule chose qui protégeait `role` était l'ABSENCE de policy d'UPDATE:
--    le jour où quelqu'un en ajoute une pour une raison légitime (laisser un
--    membre éditer sa propre envie), il ouvre `role` du même geste, parce
--    qu'une policy ne restreint pas les colonnes.
--
-- On révoque donc d'abord, on accorde ensuite, et le test l'affirme.

revoke all on public.households from public, anon, authenticated;
revoke all on public.household_members from public, anon, authenticated;
revoke all on public.household_invitations from public, anon, authenticated;
revoke all on public.household_food_restrictions from public, anon, authenticated;
revoke all on public.household_envy_submissions from public, anon, authenticated;

grant select on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select on public.household_invitations to authenticated;
grant select on public.household_food_restrictions to authenticated;
grant select on public.household_envy_submissions to authenticated;

revoke all on function public.keel_household_create(text, text) from public, anon;
revoke all on function public.keel_household_invite(text) from public, anon;
revoke all on function public.keel_household_join(text) from public, anon;
revoke all on function public.keel_household_grant_consent() from public, anon;
revoke all on function public.keel_household_revoke_consent() from public, anon;
revoke all on function public.keel_household_add_restriction(uuid, text) from public, anon;
revoke all on function public.keel_household_remove_restriction(uuid) from public, anon;
revoke all on function public.keel_household_submit_envy(date, text) from public, anon;

grant execute on function public.keel_household_create(text, text) to authenticated;
grant execute on function public.keel_household_invite(text) to authenticated;
grant execute on function public.keel_household_join(text) to authenticated;
grant execute on function public.keel_household_grant_consent() to authenticated;
grant execute on function public.keel_household_revoke_consent() to authenticated;
grant execute on function public.keel_household_add_restriction(uuid, text) to authenticated;
grant execute on function public.keel_household_remove_restriction(uuid) to authenticated;
grant execute on function public.keel_household_submit_envy(date, text) to authenticated;

-- Les résolveurs sont appelés PAR LES POLICIES, donc par `authenticated`.
grant execute on function public.keel_household_of(uuid) to authenticated;
grant execute on function public.keel_household_is_minor(uuid) to authenticated;
