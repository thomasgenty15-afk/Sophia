-- PIVOT NUTRITION — N0 : le socle du PLAN DE L'ÉLÈVE.
--
-- ── LE CHANGEMENT DE MODÈLE QUE CETTE MIGRATION MATÉRIALISE ──────────────
-- Jusqu'ici KEEL supposait : le coach PRESCRIT à un élève (`plan_versions` +
-- `plan_commitments`), l'évaluateur note l'adhérence à cette prescription.
--
-- Le modèle 1:N décidé le 2026-08-03 est différent, et l'inversion est totale :
--
--     LE COACH RECOMMANDE (son programme + sa doctrine).
--     L'ÉLÈVE DÉCIDE (son plan de la semaine, à lui).
--     PERSONNE NE NOTE.
--
-- Conséquence directe, et c'est elle qui explique la forme des tables ci-
-- dessous : le plan de l'élève n'est PAS une prescription. Il n'entre pas dans
-- `plan_commitments`, donc l'évaluateur ne le voit jamais, donc il ne produit
-- ni `met` ni `missed`. C'est ce qui rend possible le « Sophia suit de très
-- loin » demandé au produit — sans ça on récupère l'oversurveillance et des
-- `missed` sur des choses que personne n'a prescrites.
--
-- ── LA RÈGLE D'AUTORITÉ, RENDUE STRUCTURELLE ─────────────────────────────
-- Sophia aide à composer, elle n'invente pas de contenu nutrition. Cette règle
-- est habituellement tenue par du code et des tests ; ici elle est en plus
-- tenue par un CHECK (voir `student_week_plans_nutrition_traceable_check`) :
-- une ligne de type `nutrition` SANS référence au programme du coach ne peut
-- pas être écrite. Un bug du générateur échoue à l'insert, il ne se découvre
-- pas dans l'assiette d'un élève.

-- ===========================================================================
-- 1. STUDENT_GOALS — l'objectif et la situation, entrées de la génération
-- ===========================================================================

create table if not exists public.student_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- R1: tokens ASCII. R6: chaque valeur est lue par une branche nommée du
  -- générateur (elle change ce qui est mis en avant dans la semaine).
  goal text not null check (goal in (
    'fat_loss', 'recomposition', 'performance', 'health', 'maintenance'
  )),

  -- La situation, en prose, dans les mots de l'élève. R2: content_locale.
  -- C'est ce qui permet à la semaine d'être PLAUSIBLE ("je mange à la cantine
  -- le midi", "je cuisine jamais le soir") — sans ça on propose une semaine
  -- parfaite et inapplicable, qui est la première cause d'abandon.
  situation text,

  -- Contraintes pratiques, structurées : { cooking_time_min, budget_band,
  -- eats_out_per_week, no_cook_days[] }. Séparées de la prose parce que le
  -- générateur BRANCHE dessus, alors qu'il ne fait que lire `situation`.
  practical_constraints jsonb not null default '{}'::jsonb,

  content_locale text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un objectif courant par élève. L'historique n'apporte rien ici: un
  -- objectif est un état, pas un journal, et le plan de chaque semaine porte
  -- déjà une copie de l'objectif qui l'a produit (`generated_from`).
  unique (user_id)
);

comment on table public.student_goals is
  'PIVOT: objectif + situation de l''élève. Entrée de la génération de plan. '
  'L''élève décide, le coach recommande.';

-- ===========================================================================
-- 2. STUDENT_WEEK_PLANS — le plan de l'élève. PAS une prescription.
-- ===========================================================================

create table if not exists public.student_week_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Le lundi de la semaine couverte. Une semaine, un plan.
  week_start date not null,

  -- Traçabilité de la génération : de quel programme coach, de quelle version
  -- de doctrine, et avec quel objectif ce plan est sorti. Sans ça, « pourquoi
  -- Sophia m'a proposé ça » est irrépondable trois semaines plus tard.
  generated_from jsonb not null default '{}'::jsonb,

  -- LES LIGNES. Forme d'un item :
  --   { "kind": "nutrition" | "action",
  --     "label": "...",                       -- ce que l'élève lit
  --     "rationale": "...",                   -- pourquoi, en une phrase
  --     "source_commitment_key": "..."|null,  -- OBLIGATOIRE si kind=nutrition
  --     "days": ["mon","wed","fri"] }
  items jsonb not null default '[]'::jsonb,

  -- R6, branches nommées :
  --   'draft'    -> généré, pas encore adopté par l'élève
  --   'adopted'  -> l'élève l'a fait sien; c'est celui que Sophia suit de loin
  --   'archived' -> une semaine passée
  status text not null default 'draft'
    check (status in ('draft', 'adopted', 'archived')),
  adopted_at timestamptz,
  check (status <> 'adopted' or adopted_at is not null),

  content_locale text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, week_start),

  -- ─────────────────────────────────────────────────────────────────────
  -- LA RÈGLE D'AUTORITÉ, EN CONTRAINTE.
  --
  -- Toute ligne `nutrition` doit porter une `source_commitment_key` non nulle
  -- pointant vers le programme du coach. Sophia sélectionne et agence ce que
  -- le coach a écrit ; elle n'ajoute jamais de contenu alimentaire de son
  -- propre chef. Ce qu'elle peut ajouter est de type `action` (marche, eau,
  -- sommeil, prep), et ces lignes-là n'ont pas besoin de source.
  --
  -- Pourquoi un CHECK et pas seulement un test : un test protège le chemin
  -- qu'il exerce. Ici la garantie doit tenir pour TOUT écrivain futur —
  -- l'edge function, une reprise manuelle, un backfill. Le CHECK est le seul
  -- endroit qui les couvre tous.
  -- ─────────────────────────────────────────────────────────────────────
  constraint student_week_plans_nutrition_traceable_check check (
    not jsonb_path_exists(
      items,
      '$[*] ? (@.kind == "nutrition" && (!exists(@.source_commitment_key) || @.source_commitment_key == null))'
    )
  ),

  -- Le vocabulaire des lignes est fermé (R1/R6) : un `kind` inconnu est un
  -- bug de générateur, pas une extension silencieuse du modèle.
  constraint student_week_plans_kind_closed_check check (
    not jsonb_path_exists(
      items,
      '$[*] ? (@.kind != "nutrition" && @.kind != "action")'
    )
  )
);

create index if not exists student_week_plans_user_week_idx
  on public.student_week_plans (user_id, week_start desc);

comment on table public.student_week_plans is
  'PIVOT: le plan que l''ÉLÈVE se fixe, à partir des recommandations du coach. '
  'JAMAIS une prescription: n''entre pas dans plan_commitments, donc jamais '
  'évalué, jamais noté. Une ligne nutrition sans source coach est refusée.';

-- ===========================================================================
-- 3. STUDENT_DAILY_CHECKINS — le tap du soir
-- ===========================================================================

create table if not exists public.student_daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,

  -- Trois niveaux, pas dix. WhatsApp plafonne à 3 boutons de réponse (limite
  -- Meta, appliquée dans whatsapp-send), et sur une échelle 0-10 remplie tous
  -- les jours les réponses se massent sur 7-8: l'échelle a l'air précise et ne
  -- transporte presque rien. La finesse (1-5 sur 6 axes) vit dans le point
  -- hebdomadaire, où l'élève a une minute et un vrai écran.
  overall text not null check (overall in ('good', 'mixed', 'hard')),

  -- L'axe qui a coincé, demandé UNIQUEMENT quand ce n'est pas 'good'.
  axis text check (axis in ('energy', 'hunger', 'sleep')),

  -- Un bon jour n'a pas de coupable. Attribuer un axe à une journée qui va
  -- bien produit une statistique fausse ("l'énergie ressort 40 fois") à partir
  -- de journées où rien ne coinçait.
  constraint student_daily_checkins_axis_coherent_check check (
    (overall = 'good' and axis is null) or (overall <> 'good')
  ),

  source text not null default 'whatsapp_button'
    check (source in ('whatsapp_button', 'app', 'chat')),

  created_at timestamptz not null default now(),

  -- Un tap par jour. Idempotence du bouton: un double-tap ou une re-livraison
  -- WhatsApp met à jour la ligne du jour, il n'en crée pas une seconde.
  unique (user_id, local_date)
);

create index if not exists student_daily_checkins_user_date_idx
  on public.student_daily_checkins (user_id, local_date desc);

comment on table public.student_daily_checkins is
  'PIVOT: le tap du soir. 3 niveaux (contrainte Meta: 3 boutons max), axe '
  'demandé seulement si ça ne va pas. Répond à "ce protocole est-il vivable", '
  'ce que la couverture ne dit pas.';

-- ===========================================================================
-- 4. WEEKLY_REVIEWS — rendre `plan_version_id` nullable
-- ===========================================================================
-- La colonne était NOT NULL pour garantir « ne jamais moyenner deux versions
-- de contrat ». Cette règle n'a de sens que s'il EXISTE des versions publiées.
-- Dans le modèle 1:N il n'y en a aucune (le coach recommande, il ne prescrit
-- pas), donc la contrainte ne garde plus rien et rend la table inécrivable —
-- c'est-à-dire qu'elle bloque le point hebdomadaire de l'élève, qui est
-- précisément ce qu'on veut collecter.
--
-- Nullable, et rien d'autre : quand un plan_version existe (mode 1:1), la
-- colonne est remplie et la règle d'origine s'applique telle quelle.

alter table public.weekly_reviews
  alter column plan_version_id drop not null;

comment on column public.weekly_reviews.plan_version_id is
  'NULL en modèle 1:N (le coach recommande, il ne prescrit pas: aucune '
  'plan_version n''existe). Rempli en 1:1, où la règle "jamais deux versions '
  'moyennées" s''applique.';

-- ===========================================================================
-- 5. RLS
-- ===========================================================================
-- Doctrine KEEL inchangée: l'élève lit SES lignes, le service_role écrit.
-- Nouveauté assumée: l'élève a désormais une app, et ces trois tables sont
-- les seules qu'il ÉCRIT (son objectif, son plan, son tap) — ce sont ses
-- données, pas celles du coach.

alter table public.student_goals          enable row level security;
alter table public.student_week_plans     enable row level security;
alter table public.student_daily_checkins enable row level security;

drop policy if exists student_goals_owner_all on public.student_goals;
create policy student_goals_owner_all on public.student_goals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists student_week_plans_owner_all on public.student_week_plans;
create policy student_week_plans_owner_all on public.student_week_plans
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists student_daily_checkins_owner_all on public.student_daily_checkins;
create policy student_daily_checkins_owner_all on public.student_daily_checkins
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ===========================================================================
-- 6. VUE TIER B — ce que le coach voit du pouls de son élève
-- ===========================================================================
-- Le coach n'a AUCUNE policy sur `student_daily_checkins`, et c'est voulu: le
-- détail jour par jour de l'humeur d'un élève est de l'intime (§1.5). Ce dont
-- il a besoin est l'AGRÉGAT — combien de jours durs cette semaine, et ce qui
-- lâche en premier chez cette personne.
--
-- Motif repris de coach_student_directory / coach_student_events, pas
-- réinventé: PostgREST applique les droits par RÔLE (coach et élève sont tous
-- deux `authenticated`), donc restreindre des colonnes ne se fait que par une
-- vue SECURITY DEFINER.

create or replace view public.coach_student_pulse
with (security_invoker = off) as
  with scoped as (
    select
      c.user_id,
      date_trunc('week', c.local_date)::date as week_start,
      c.overall,
      c.axis
    from public.student_daily_checkins c
    where c.user_id = any ((select public.coached_student_ids())::uuid[])
  ),
  -- L'axe DOMINANT des mauvais jours, calculé à part. Plus actionnable qu'une
  -- moyenne: « énergie moyenne 6,4 » ne dit rien à un coach, « ce qui la casse
  -- c'est la faim » lui dit quoi changer.
  -- `distinct on` plutôt qu'un sous-select corrélé: la corrélation portait sur
  -- une colonne non groupée et Postgres la refusait (42803).
  dominant as (
    select distinct on (user_id, week_start)
      user_id, week_start, axis
    from scoped
    where axis is not null
    group by user_id, week_start, axis
    order by user_id, week_start, count(*) desc, axis
  )
  select
    s.user_id as student_user_id,
    s.week_start,
    count(*) filter (where s.overall = 'good')  as days_good,
    count(*) filter (where s.overall = 'mixed') as days_mixed,
    count(*) filter (where s.overall = 'hard')  as days_hard,
    d.axis as dominant_axis
  from scoped s
  left join dominant d
    on d.user_id = s.user_id and d.week_start = s.week_start
  group by s.user_id, s.week_start, d.axis;

comment on view public.coach_student_pulse is
  'PIVOT §1.5: l''agrégat hebdomadaire du tap, jamais le détail par jour. '
  'Le coach voit combien de jours durs et quel axe lâche, pas l''humeur '
  'quotidienne de son élève.';

revoke all on public.coach_student_pulse from public;
grant select on public.coach_student_pulse to authenticated;

-- ===========================================================================
-- 7. updated_at
-- ===========================================================================

do $$
declare
  target text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_set_updated_at'
  ) then
    raise exception 'pivot: public.tg_set_updated_at() introuvable';
  end if;

  foreach target in array array['student_goals', 'student_week_plans'] loop
    execute format('drop trigger if exists %I on public.%I',
                   target || '_set_updated_at', target);
    execute format(
      'create trigger %I before update on public.%I '
      'for each row execute function public.tg_set_updated_at()',
      target || '_set_updated_at', target
    );
  end loop;
end $$;
