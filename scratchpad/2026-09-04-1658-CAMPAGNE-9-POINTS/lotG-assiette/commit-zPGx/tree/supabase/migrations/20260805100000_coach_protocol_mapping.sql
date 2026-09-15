-- ============================================================================
-- LE PROTOCOLE DU COACH — la SAISIE change, la STRUCTURE ne change pas
-- ============================================================================
-- Autorité: docs/nutrition-pivot/PROMPT-COACH-PROTOCOL.md, docs/keel/CONTRACT.md.
--
-- CE QUE CETTE MIGRATION FAIT
-- ---------------------------
-- Elle donne au coach de quoi exprimer sa méthode en trois minutes: un MAPPING
-- D'ALIMENTS (une posture par groupe) et une poignée de RÈGLES TEMPORELLES à
-- gabarits fermés. Les `plan_commitments` — la structure contre laquelle
-- l'analyse photo se compare, l'évaluateur note et `generate-week-plan-v1`
-- construit la semaine — restent EXACTEMENT ce qu'ils sont; ils deviennent
-- DÉRIVÉS de ce qui est écrit ici, par un compilateur pur et testé
-- (`_shared/keel/protocol_compiler.ts`).
--
-- On ne supprime donc rien de la couche prescription. Supprimer la structure
-- obligerait à réécrire ses trois consommateurs et retirerait à Sophia tout ce
-- contre quoi elle vérifie une photo.
--
-- ⚠️ CE QUI N'EST PAS ICI, ET C'EST LE POINT LE PLUS IMPORTANT DU LOT
-- -------------------------------------------------------------------
-- Un `stance = 'excluded'` de coach n'est PAS une allergie d'élève.
--
-- Les allergies vivent dans `student_safety_constraints`: déclarées par
-- l'élève, jamais inférées, avec un double verrou (prompt + écran déterministe
-- post-génération). Ce qui est écrit ici est une MÉTHODE, avec une sévérité de
-- méthode: ça oriente ce que Sophia propose et ce qu'elle commente, ça
-- n'arrête jamais rien au titre du risque vital.
--
-- Deux tables, deux sévérités, deux verrous. Aucune colonne de ce fichier ne
-- référence `student_safety_constraints`, aucun chemin de lecture ne fusionne
-- les deux, et un test le prouve DANS LES DEUX SENS (l'aversion du coach n'est
-- jamais durcie en risque vital; l'allergie n'est jamais ramollie en
-- préférence).
--
-- POURQUOI LE VOCABULAIRE RESTE FERMÉ
-- -----------------------------------
-- `food_group_ref` porte une FK vers `food_groups(slug)`; le prompt de vision
-- énumère les slugs et interdit d'en inventer; `parseFoodGroupRef` rejette
-- l'inconnu. C'est cette fermeture qui rend la jointure photo↔protocole
-- possible SANS modèle. Un slug privé par coach casserait deux choses: la
-- vision ne saurait pas le détecter (il faudrait un prompt par coach, donc la
-- fin du cache de prompt), et la jointure deviendrait partielle sans que
-- personne ne le voie.
--
-- La réponse au besoin réel ("le coach doit pouvoir en ajouter") est
-- `coach_terms`: le coach ajoute un TERME (« kéfir »), pas un slug, et ce terme
-- est RATTACHÉ à un groupe existant. Le pipeline continue de travailler sur le
-- groupe de base; le coach lit et écrit dans ses mots. Le vocabulaire partagé,
-- lui, ne grandit que globalement et de façon curée — d'où
-- `vocabulary_extension_requests`, qui enregistre la demande sans jamais créer
-- le slug à la volée.
-- ============================================================================


-- ============================================================================
-- LE CONTENEUR — versionné et publiable, comme la doctrine
-- ============================================================================
-- Le mapping se sauvegarde en continu mais ne s'applique pas en continu: un
-- coach au milieu d'une modification ne doit pas pousser une demi-méthode à
-- 200 élèves. D'où brouillon → publication explicite, exactement le geste de
-- `coach_doctrines`.
create table if not exists public.coach_protocols (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  version int not null check (version >= 1),

  status text not null default 'draft'
    check (status in ('draft', 'published', 'superseded')),

  -- R2: la locale dans laquelle le coach a écrit ses `rationale`.
  content_locale text not null,

  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un « publié » sans horodatage est une publication qu'on ne peut ni dater
  -- ni auditer. Même motif que la CHECK de rétractation sur les contraintes.
  constraint coach_protocols_published_needs_timestamp check (
    status <> 'published' or published_at is not null
  ),

  unique (coach_id, version)
);

-- Un seul publié par coach: c'est LE protocole que la cohorte reçoit.
-- Index unique PARTIEL — motif `plan_versions_one_published_per_student_idx`.
create unique index if not exists coach_protocols_one_published_per_coach_idx
  on public.coach_protocols (coach_id)
  where status = 'published';

-- Un seul brouillon par coach: deux onglets qui éditent en même temps doivent
-- se disputer LA MÊME ligne (dernier écrit gagne, visiblement), pas fabriquer
-- deux brouillons divergents dont un seul serait publié.
create unique index if not exists coach_protocols_one_draft_per_coach_idx
  on public.coach_protocols (coach_id)
  where status = 'draft';


-- ============================================================================
-- LE MAPPING — une posture par groupe d'aliments
-- ============================================================================
-- NEUTRE = ABSENCE DE LIGNE, et c'est délibéré.
--
-- L'écrasante majorité des 30 groupes n'appelle aucune opinion. Encoder
-- « neutre » comme une ligne obligerait à écrire 30 lignes par coach pour n'en
-- vouloir dire que quatre, et rendrait indistinguables « je n'ai pas d'avis »
-- et « je n'ai pas fini ». L'écran, lui, affiche bien neutre comme une VALEUR
-- (le coach ne doit pas croire son travail inachevé) — c'est un choix de rendu,
-- pas de stockage.
create table if not exists public.coach_food_rules (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.coach_protocols(id) on delete cascade,
  -- Dénormalisé depuis `coach_protocols` pour que la policy RLS n'ait pas à
  -- faire une jointure à chaque ligne. Le trigger plus bas garantit l'accord.
  coach_id uuid not null references public.coaches(id) on delete cascade,

  food_group_ref text not null references public.food_groups(slug),

  -- R6: chaque valeur est lue par une branche NOMMÉE du compilateur.
  --   encouraged  -> une ligne `do`    (le coach veut en voir)
  --   discouraged -> une ligne `avoid` souple
  --   excluded    -> une ligne `avoid` stricte — méthode, JAMAIS sécurité
  stance text not null check (stance in ('encouraged', 'discouraged', 'excluded')),

  -- Tableau VIDE = global (le défaut, et le cas de l'écrasante majorité).
  -- Non vide = l'entrée ne vise que ces objectifs.
  goal_scope text[] not null default '{}'::text[]
    check (goal_scope <@ array[
      'fat_loss', 'recomposition', 'performance', 'health', 'maintenance'
    ]::text[]),

  -- Le « pourquoi », facultatif. Il donne à Sophia de quoi EXPLIQUER au lieu
  -- d'asséner. R2: écrit dans `coach_protocols.content_locale`.
  rationale text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Une posture par groupe et par protocole. Deux postures contradictoires sur
  -- le même groupe compileraient en deux engagements qui se contredisent, et
  -- l'élève recevrait l'un des deux au hasard de l'ordre de lecture.
  unique (protocol_id, food_group_ref)
);

create index if not exists coach_food_rules_protocol_idx
  on public.coach_food_rules (protocol_id);


-- ============================================================================
-- LES RÈGLES TEMPORELLES — quatre gabarits fermés, à trous
-- ============================================================================
-- Ce qu'un mapping ne sait pas dire: la FRÉQUENCE et le MOMENT. Elles se
-- comptent sur les doigts d'une main — d'où quatre gabarits nommés et pas un
-- éditeur de règles générique, et surtout pas du texte libre: le texte libre ne
-- se compile pas de façon déterministe.
--
-- R5: les trous sont des COLONNES typées, jamais du jsonb. Ce qui branche dans
-- le compilateur doit être contraignable par la base.
create table if not exists public.coach_timing_rules (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.coach_protocols(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,

  template text not null check (template in (
    -- [au moins | au plus] [1..N] portion(s) de [groupe] par [jour | semaine]
    'portions_per_period',
    -- [groupe] à chaque repas
    'group_every_meal',
    -- pas de [groupe] après [heure]
    'no_group_after',
    -- [groupe] au [petit-déjeuner | déjeuner | dîner]
    'group_at_slot'
  )),

  food_group_ref text not null references public.food_groups(slug),

  -- --- les trous, un par gabarit ---
  direction text check (direction in ('at_least', 'at_most')),
  portions int check (portions between 1 and 12),
  period text check (period in ('day', 'week')),
  cutoff_local time,
  slot_key text references public.slot_vocabulary(key),

  goal_scope text[] not null default '{}'::text[]
    check (goal_scope <@ array[
      'fat_loss', 'recomposition', 'performance', 'health', 'maintenance'
    ]::text[]),

  rationale text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- COHÉRENCE PAR GABARIT: chaque gabarit exige SES trous et INTERDIT les
  -- autres. Sans cette contrainte, une ligne `group_every_meal` pourrait
  -- traîner un `cutoff_local` que le compilateur ignorerait en silence — le
  -- coach aurait écrit une heure que Sophia ne vérifierait jamais.
  -- Motif: `plan_commitments_anchor_check`.
  --
  -- ⚠️ PAS `coach_timing_rules_template_check`: c'est le nom que Postgres
  -- génère TOUT SEUL pour le `check` de la colonne `template` ci-dessus
  -- (`<table>_<colonne>_check`), et la collision fait échouer le CREATE TABLE
  -- entier. Mesuré à l'application locale.
  constraint coach_timing_rules_slots_match_template check (
    (template = 'portions_per_period'
      and direction is not null and portions is not null and period is not null
      and cutoff_local is null and slot_key is null)
    or
    (template = 'group_every_meal'
      and direction is null and portions is null and period is null
      and cutoff_local is null and slot_key is null)
    or
    (template = 'no_group_after'
      and cutoff_local is not null
      and direction is null and portions is null and period is null
      and slot_key is null)
    or
    (template = 'group_at_slot'
      and slot_key is not null
      and direction is null and portions is null and period is null
      and cutoff_local is null)
  )
);

create index if not exists coach_timing_rules_protocol_idx
  on public.coach_timing_rules (protocol_id);

-- Le même gabarit, deux fois, sur le même groupe et le même créneau, compile en
-- doublon. `slot_key` et `cutoff_local` étant nullables, un index unique nu
-- laisserait passer les doublons de `group_every_meal`; on norme les NULL.
create unique index if not exists coach_timing_rules_no_duplicate_idx
  on public.coach_timing_rules (
    protocol_id, template, food_group_ref,
    coalesce(slot_key, ''), coalesce(cutoff_local, '00:00'::time)
  );


-- ============================================================================
-- LES TERMES DU COACH — ses mots, rattachés au vocabulaire partagé
-- ============================================================================
-- Motif repris de `coach_doctrines.vocabulary` ([{term, meaning}]), qui existe
-- déjà: on ne réinvente pas un second mécanisme de vocabulaire. La différence
-- tient en une colonne — ici le terme porte un RATTACHEMENT contraint par FK,
-- parce que c'est ce rattachement qui fait tourner le pipeline.
--
-- Le rattachement n'est jamais silencieux: l'écran affiche « traité comme
-- <groupe> » et le coach peut le corriger. Un rattachement muet serait un
-- mensonge sur ce que Sophia vérifiera vraiment.
create table if not exists public.coach_terms (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,

  -- Libre, dans les mots du coach: « kéfir », « huiles de graines ».
  term text not null check (length(btrim(term)) between 1 and 80),

  -- Le groupe de base sur lequel le pipeline continue de travailler.
  food_group_ref text not null references public.food_groups(slug),

  content_locale text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un terme par coach, insensible à la casse et aux espaces de bord: « Kéfir »
-- et « kéfir » sont le même mot, et deux rattachements divergents du même mot
-- rendraient le rendu non déterministe.
create unique index if not exists coach_terms_unique_per_coach_idx
  on public.coach_terms (coach_id, lower(btrim(term)));

-- Les termes du coach vivent au niveau du COACH, pas du protocole: ils sont son
-- lexique, ils survivent à une republication et n'ont pas à être recopiés à
-- chaque version.


-- ============================================================================
-- LA DEMANDE D'EXTENSION — le signal, jamais la création
-- ============================================================================
-- Quand un terme ne se rattache à RIEN de satisfaisant, on enregistre la
-- demande. On ne crée pas le slug: l'ajout effectif au vocabulaire partagé
-- reste une migration, curée, globale. Cette table est la trace qui rend cette
-- curation possible — sans elle, le besoin ne remonte jamais et le coach
-- contourne en tordant un rattachement.
create table if not exists public.vocabulary_extension_requests (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,

  term text not null check (length(btrim(term)) between 1 and 80),
  content_locale text not null,

  -- Ce que le coach a essayé, et pourquoi rien ne convenait.
  note text,

  status text not null default 'open'
    check (status in ('open', 'accepted', 'declined')),

  -- Renseigné quand la demande a été honorée par une migration.
  resolved_slug text references public.food_groups(slug),
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vocabulary_extension_requests_resolution_check check (
    (status = 'open'     and resolved_slug is null and resolved_at is null)
    or
    (status = 'accepted' and resolved_slug is not null and resolved_at is not null)
    or
    (status = 'declined' and resolved_slug is null and resolved_at is not null)
  )
);

create index if not exists vocabulary_extension_requests_open_idx
  on public.vocabulary_extension_requests (status, created_at desc)
  where status = 'open';


-- ============================================================================
-- ACCORD coach_id ↔ protocol_id
-- ============================================================================
-- `coach_id` est dénormalisé sur les deux tables de règles pour que la RLS
-- reste une comparaison locale. Dénormaliser sans garde, c'est offrir un
-- chemin d'écriture où une règle porte le coach A et pointe vers le protocole
-- du coach B: la RLS de A laisserait passer, et la règle atterrirait dans le
-- protocole de B.
create or replace function public.coach_rule_matches_protocol()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner uuid;
begin
  select p.coach_id into owner
  from public.coach_protocols p
  where p.id = new.protocol_id;

  if owner is null then
    raise exception 'protocol % introuvable', new.protocol_id;
  end if;

  if owner <> new.coach_id then
    raise exception
      'coach_id % ne correspond pas au coach % du protocole %',
      new.coach_id, owner, new.protocol_id;
  end if;

  return new;
end;
$$;

drop trigger if exists coach_food_rules_owner_check on public.coach_food_rules;
create trigger coach_food_rules_owner_check
  before insert or update on public.coach_food_rules
  for each row execute function public.coach_rule_matches_protocol();

drop trigger if exists coach_timing_rules_owner_check on public.coach_timing_rules;
create trigger coach_timing_rules_owner_check
  before insert or update on public.coach_timing_rules
  for each row execute function public.coach_rule_matches_protocol();


-- ============================================================================
-- RLS — le coach est propriétaire de SES tables
-- ============================================================================
-- Motif `coach_doctrines_coach_all` (20260803031000): le coach a un ALL sur ce
-- qui lui appartient, l'élève n'a AUCUNE policy ici (il ne lit jamais le
-- protocole brut — il reçoit ce que le compilateur en dérive, via ses
-- `plan_commitments`).
alter table public.coach_protocols               enable row level security;
alter table public.coach_food_rules              enable row level security;
alter table public.coach_timing_rules            enable row level security;
alter table public.coach_terms                   enable row level security;
alter table public.vocabulary_extension_requests enable row level security;

drop policy if exists coach_protocols_coach_all on public.coach_protocols;
create policy coach_protocols_coach_all on public.coach_protocols
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

drop policy if exists coach_food_rules_coach_all on public.coach_food_rules;
create policy coach_food_rules_coach_all on public.coach_food_rules
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

drop policy if exists coach_timing_rules_coach_all on public.coach_timing_rules;
create policy coach_timing_rules_coach_all on public.coach_timing_rules
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

drop policy if exists coach_terms_coach_all on public.coach_terms;
create policy coach_terms_coach_all on public.coach_terms
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

-- La demande d'extension: le coach l'ouvre et relit les siennes; il ne la
-- résout pas lui-même (la résolution est une migration + service_role).
drop policy if exists vocabulary_extension_requests_coach_read
  on public.vocabulary_extension_requests;
create policy vocabulary_extension_requests_coach_read
  on public.vocabulary_extension_requests
  for select to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

drop policy if exists vocabulary_extension_requests_coach_insert
  on public.vocabulary_extension_requests;
create policy vocabulary_extension_requests_coach_insert
  on public.vocabulary_extension_requests
  for insert to authenticated
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
    -- Un coach n'ouvre que des demandes ouvertes: il ne s'auto-accorde pas un
    -- slug en écrivant directement status='accepted'.
    and status = 'open'
  );


-- ============================================================================
-- PRIVILÈGES — `revoke from public` laisse `anon` debout
-- ============================================================================
-- Les default privileges Supabase accordent à `anon` et `authenticated` sur
-- toute table neuve du schéma public. `revoke ... from public` ne retire RIEN à
-- ces rôles nommés: il faut les nommer. Vérification: has_table_privilege sur
-- 'anon', jamais sur 'public'.
revoke all on public.coach_protocols               from anon;
revoke all on public.coach_food_rules              from anon;
revoke all on public.coach_timing_rules            from anon;
revoke all on public.coach_terms                   from anon;
revoke all on public.vocabulary_extension_requests from anon;
