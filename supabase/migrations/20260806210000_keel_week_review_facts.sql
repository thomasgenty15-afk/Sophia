-- ============================================================================
-- KEEL — `weekly_reviews.week_facts` : LA LECTURE DE LA SEMAINE, GELÉE.
--
-- Autorité : docs/keel/MODEL.md (« ce que le coach lit le lundi : couverture ·
-- vivabilité · portions · intentions »), docs/keel/CONTRACT.md R5/R6/R7.
--
-- ── CE QUE ÇA STOCKE, ET POURQUOI ÇA NE SE RECALCULE PAS ───────────────────
-- Le point du dimanche part entre 18 h et 21 h dans le fuseau de l'élève, et sa
-- réponse revient quand elle revient — parfois le lendemain. Entre les deux, le
-- même chiffre doit rester le même : celui qui a DÉCIDÉ la question posée est
-- celui qu'on DISCUTE ensuite, et celui que la conversation cite toute la
-- semaine suivante. Recalculer à chaque lecture donnerait trois valeurs pour un
-- même « tu as vu du poisson deux fois », toutes justes au moment de leur
-- calcul, et incompréhensibles ensemble.
--
-- La lecture est donc CALCULÉE UNE FOIS, en amont de l'envoi
-- (`keel-weekly-flow-v1`), et relue partout ailleurs.
--
-- ── POURQUOI UN JSONB ICI, ALORS QUE R5 DIT « UNE COLONNE » ────────────────
-- R5 vise ce que l'ÉVALUATEUR lit : « si l'évaluateur a besoin d'une valeur,
-- c'est une colonne », parce qu'un CHECK n'atteint pas une clé de jsonb. Rien
-- ici n'est lu par l'évaluateur, et rien ici n'est noté : c'est un ARTEFACT DE
-- RENDU, au même rang que `coach_syntheses.body` — une photographie datée d'un
-- calcul, pas une donnée de décision. Un schéma en colonnes en ferait trente,
-- dont la moitié changerait à la prochaine règle de coach.
--
-- Le vocabulaire fermé qui compte (`food_group_ref`, les bandes de portion, les
-- statuts d'alignement) reste contraint là où il est ÉCRIT — `protocol_events`,
-- `coach_food_rules` — et le module pur `_shared/keel/week_review.ts` refuse un
-- token inconnu à la lecture (R7). Le jsonb ne fabrique aucun vocabulaire.
--
-- ── PAS D'UPSERT SUR CETTE TABLE, JAMAIS ───────────────────────────────────
-- L'unicité (élève, semaine) du pivot est portée par un index PARTIEL
-- (`weekly_reviews_user_week_no_plan_uidx ... where plan_version_id is null`).
-- `ON CONFLICT (a, b)` ne peut pas choisir un index partiel, et le paramètre
-- `on_conflict` de PostgREST n'émet jamais le `WHERE` qu'il faudrait : le seul
-- écrivain de cette table a passé sa vie à répondre 42P10 sans que rien ne le
-- dise. L'écrivain de `week_facts` fait donc SELECT puis UPDATE-par-id ou
-- INSERT, exactement comme `writeWeeklyFlowReply`, et rattrape 23505.
--
-- APPLICATION : locale uniquement par un agent (`supabase db reset --local`).
-- Le push distant reste humain.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Les deux colonnes.
--
-- `week_facts_computed_at` n'est PAS décoratif et n'est pas `created_at` : la
-- ligne existe souvent avant le calcul (le point du dimanche l'a créée pour y
-- poser le biofeedback), et une lecture qui ne saurait pas distinguer « pas
-- encore calculé » de « calculé et vide » injecterait un bilan blanc dans la
-- conversation. NULL ⇒ il n'y a rien à dire, et on ne dit rien.
-- ---------------------------------------------------------------------------
alter table public.weekly_reviews
  add column if not exists week_facts jsonb;

alter table public.weekly_reviews
  add column if not exists week_facts_computed_at timestamptz;

comment on column public.weekly_reviews.week_facts is
  'La lecture de la semaine, GELÉE au moment où le point hebdomadaire part '
  '(keel-weekly-flow-v1). Forme: { version, window, coverage, portions, '
  'livability, alignment[], branch, question, asked_group }. Artefact de '
  'RENDU, jamais une entrée d''évaluateur: aucune ligne d''adhérence n''en '
  'dérive, et le modèle ne peut citer que des nombres qui s''y trouvent '
  '(_shared/keel/week_review.ts). Recalculer au lieu de relire donnerait trois '
  'valeurs pour un même chiffre entre l''envoi, la réponse et la semaine '
  'suivante.';

comment on column public.weekly_reviews.week_facts_computed_at is
  'Quand week_facts a été calculé. NULL est un état DISTINCT de « calculé et '
  'vide »: la ligne préexiste souvent au calcul (le biofeedback l''a créée). '
  'NULL ⇒ aucun bloc injecté, aucun bilan composé.';


-- ---------------------------------------------------------------------------
-- 2. L'index de relecture.
--
-- Le lecteur de contexte de tour demande « le dernier bilan CALCULÉ de cet
-- élève » à chaque message, sur la lane la plus chaude du produit. Partiel sur
-- `week_facts_computed_at is not null` : les lignes sans calcul sont la
-- majorité (toute ligne de biofeedback antérieure à ce lot) et n'ont rien à
-- faire dans l'index qui sert à en trouver un.
-- ---------------------------------------------------------------------------
create index if not exists weekly_reviews_week_facts_idx
  on public.weekly_reviews (user_id, week_start_date desc)
  where week_facts_computed_at is not null;


-- ---------------------------------------------------------------------------
-- GARDE — l'index partiel d'unicité doit toujours être là.
--
-- Il n'est pas posé par cette migration, il est POSÉ SUR ELLE : tout l'arbitrage
-- « pas d'upsert » de l'en-tête n'a de sens que s'il existe. Une migration
-- future qui le remplacerait par un index total rendrait l'upsert possible et
-- ce commentaire faux — mieux vaut échouer ici.
-- ---------------------------------------------------------------------------
do $$
declare
  v_uidx int;
  v_cols int;
begin
  select count(*) into v_uidx
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'weekly_reviews'
    and indexname = 'weekly_reviews_user_week_no_plan_uidx';
  if v_uidx <> 1 then
    raise exception
      'week_review guard: weekly_reviews_user_week_no_plan_uidx absent (trouvé %) — '
      'lire l''en-tête de cette migration avant de toucher à l''unicité', v_uidx;
  end if;

  select count(*) into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'weekly_reviews'
    and column_name in ('week_facts', 'week_facts_computed_at');
  if v_cols <> 2 then
    raise exception 'week_review guard: colonnes week_facts absentes (trouvé %)', v_cols;
  end if;

  raise notice 'week_review: week_facts posé sur weekly_reviews (unicité partielle intacte)';
end
$$;
