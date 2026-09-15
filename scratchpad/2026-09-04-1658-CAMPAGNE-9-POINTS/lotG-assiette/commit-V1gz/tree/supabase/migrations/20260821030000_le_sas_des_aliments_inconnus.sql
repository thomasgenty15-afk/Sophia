-- ============================================================================
-- LOT 18 · LE SAS DES ALIMENTS INCONNUS — et les compteurs qui disent s'il sert
--
-- Prompt: scratchpad/2026-08-21-0040-PROMPT-AUTOREMPLISSAGE-REFERENTIEL.md
-- Module: supabase/functions/_shared/keel/composition_fill.ts
--
-- CE QUE CETTE MIGRATION INSTALLE, ET DANS QUEL ORDRE
-- --------------------------------------------------
--   1. `food_composition_pending`  — le SAS. Une ligne par terme inconnu.
--   2. `food_composition_refs.source` accepte `'sas'` — la provenance d'une
--      ligne PROMUE, et donc le compteur ③.
--   3. deux colonnes de compteurs sur `student_generated_meals`.
--   4. `food_composition_group_bands` — la bande MESURÉE de chaque groupe.
--   5. `promote_pending_food_compositions()` — la promotion, HORS chemin chaud.
--   6. `composition_fill_weekly` — la LECTURE des compteurs, semaine par
--      semaine. Un compteur qu'aucune requête ne lit est un compteur mort.
--
-- ⛔ LA RÈGLE NON NÉGOCIABLE DE CE LOT, ET ELLE EST STRUCTURELLE ICI
-- -----------------------------------------------------------------
-- « IL CRÉE UN ALIMENT NEUF. JAMAIS UN ALIAS VERS UN ALIMENT EXISTANT. »
--
-- Ce fichier n'écrit NULLE PART dans `food_composition_aliases`. Pas une
-- fois, pas dans une branche, pas dans la fonction de promotion. C'est
-- vérifiable d'un `grep` sur le fichier, et c'est le seul niveau de garantie
-- qui tienne: un alias `laitue -> lait` remplace un aliment par un autre pour
-- tout le monde, définitivement, et ne ressemble pas à un bug — il ressemble à
-- une donnée. Le dépôt a mesuré ce mode d'échec à 12 faux positifs sur 12.
--
-- La promotion pose donc le slug ÉGAL au terme normalisé (espaces -> `_`), ce
-- que `resolveIngredient` retrouve par égalité de slug, sans alias. Et elle
-- REFUSE la ligne dont le slug existe déjà, ou dont le terme est déjà porté
-- par un alias: dans les deux cas elle écraserait un aliment réel.
--
-- RGPD — LA RÉCLAMATION, DANS LE MÊME FICHIER
-- -------------------------------------------
-- ⚠️ Le dépôt a la cicatrice « le lifecycle RGPD ne réclame pas les tables
-- neuves » (neuf tables hors export). La réclamation de `food_composition_pending`
-- est donc écrite ici, et elle est d'une NATURE différente de celle des tables
-- d'élève: **cette table ne porte aucune personne, par construction.**
--
--   · aucune colonne `user_id`, `household_id`, `coach_id`, `member_id`;
--   · aucune clé étrangère vers `profiles`, `households` ou un plan;
--   · aucune date de génération, aucun identifiant de plan, aucun compteur
--     par personne — `sightings` compte des PLANS, pas des gens, et il est
--     incrémenté sans qu'on sache lequel;
--   · le seul texte libre est un NOM D'ALIMENT normalisé, plafonné à 80
--     caractères comme `food_composition_refs.label`, écrit par le modèle.
--
-- Elle est donc dans la MÊME catégorie que `food_composition_refs` et
-- `food_composition_aliases`, qui ne sont pas non plus exportées ni purgées:
-- c'est un RÉFÉRENTIEL. Une table de référentiel réclamée par l'export RGPD
-- rendrait à chaque élève le catalogue d'aliments du produit — ce qui n'est
-- pas sa donnée — et une purge la viderait pour tout le monde au premier
-- départ. La contrainte `..._carries_no_person_check` plus bas est ce qui rend
-- cette promesse VÉRIFIABLE plutôt que déclarative.
--
-- ⚠️ Les DEUX colonnes ajoutées à `student_generated_meals`, elles, sont bien
-- de la donnée d'élève — et elles sont réclamées SANS RIEN AJOUTER: la table
-- est déjà exportée en entier par `account-export-v1` (`SCOPE.studentGeneratedMeals`)
-- et déjà purgée par la cascade de `profiles`. Une colonne de plus sur une
-- table déjà réclamée voyage avec elle.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) LE SAS
-- ---------------------------------------------------------------------------

create table if not exists public.food_composition_pending (
  -- LE TERME NORMALISÉ (`normalizeTerm`), et c'est la clé. Pas la prose brute:
  -- « Chipotle paste », « chipotle  paste » et « chipotle paste, » sont le même
  -- inconnu, et trois lignes séparées ne compteraient jamais jusqu'à 3.
  term text primary key check (length(btrim(term)) between 1 and 80),

  -- LE GROUPE, tel qu'il a été DÉCLARÉ — par le modèle de secours, ou par la
  -- ligne d'ingrédient quand un régime est déclaré. `null` = personne ne l'a
  -- dit, et la ligne n'est alors JAMAIS promouvable (aucune bande à opposer).
  food_group_ref text references public.food_groups(slug),

  label text not null check (length(btrim(label)) between 1 and 80),

  -- Pour 100 g CRUS, comme `food_composition_refs`. Même unité, même base,
  -- sans quoi la promotion mélangerait deux référentiels.
  energy_kcal numeric not null check (energy_kcal >= 0),
  protein_g numeric check (protein_g >= 0),
  carbs_g numeric check (carbs_g >= 0),
  fat_g numeric check (fat_g >= 0),
  fiber_g numeric check (fiber_g >= 0),

  yield_class text not null check (
    yield_class in ('neutral', 'grain_absorbs', 'legume_absorbs',
                    'meat_shrinks', 'fish_shrinks', 'veg_shrinks')
  ),

  -- D'OÙ VIENNENT CES VALEURS. `group_bounds` = l'appel de secours a échoué et
  -- on a pris le milieu de la bande du groupe. Une telle ligne n'est JAMAIS
  -- promue: elle porte une convention, pas une valeur, et la promouvoir
  -- figerait un milieu de bande dans le référentiel sous les traits d'une
  -- mesure. Elle est gardée pour être COMPTÉE, et pour qu'un futur appel
  -- réussi la remplace.
  fill_source text not null check (fill_source in ('model', 'group_bounds')),

  -- COMBIEN DE PLANS DISTINCTS ONT ÉCRIT CE TERME.
  --
  -- ⚠️ C'est un compte de PLANS et pas d'occurrences, et ça tient à l'écrivain:
  -- une génération dédoublonne ses termes et n'incrémente qu'une fois. Compter
  -- les occurrences ferait promouvoir à la 3e ligne d'un même plan — c'est-à-dire
  -- sur le tirage d'UN modèle, un seul jour, ce que la règle des 3 existe pour
  -- ne pas faire.
  sightings integer not null default 1 check (sightings >= 1),

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  --   `pending`       en attente d'un 3e plan
  --   `promoted`      passée dans `food_composition_refs`
  --   `needs_review`  hors bande, slug pris, ou terme déjà aliasé: un humain
  --                   tranche. Elle ne repassera jamais en `pending` toute seule.
  status text not null default 'pending'
    check (status in ('pending', 'promoted', 'needs_review')),
  review_reason text,
  promoted_at timestamptz,

  -- ⛔ LA PREUVE QUE LA TABLE NE PORTE PERSONNE, ÉCRITE EN CONTRAINTE.
  -- Un UUID dans le terme ou le libellé serait le premier signe qu'un
  -- identifiant a fui jusqu'ici. La contrainte est bête exprès: elle ne
  -- protège pas de tout, elle rend le cas le plus probable IMPOSSIBLE au lieu
  -- d'invisible.
  constraint food_composition_pending_carries_no_person_check check (
    term !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    and label !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    and term !~ '@'
    and label !~ '@'
  )
);

comment on table public.food_composition_pending is
  'LOT 18 · Le SAS des aliments que le référentiel ne connaît pas. RÉFÉRENTIEL, '
  'pas donnée d''élève: aucune colonne ne porte de personne (contrainte '
  'food_composition_pending_carries_no_person_check). Ni exportée ni purgée par '
  'le lifecycle RGPD, pour la même raison que food_composition_refs.';

comment on column public.food_composition_pending.sightings is
  'Nombre de PLANS distincts ayant écrit ce terme. La promotion en demande 3.';

comment on column public.food_composition_pending.fill_source is
  'model = l''appel de secours a répondu · group_bounds = il a échoué et on a '
  'pris le milieu de la bande du groupe. Une ligne group_bounds n''est jamais promue.';

create index if not exists food_composition_pending_promotable_idx
  on public.food_composition_pending (status, sightings desc)
  where status = 'pending';

-- ⛔ LES PRIVILÈGES PAR DÉFAUT DONNENT **TOUT** À `authenticated` SUR TOUTE
-- TABLE NEUVE (cicatrice `supabase-default-privileges-grant-all-to-authenticated`).
-- Même posture que ses deux voisines du référentiel: service_role seulement.
revoke all on public.food_composition_pending from anon, authenticated;
alter table public.food_composition_pending enable row level security;
-- Aucune politique: RLS activée sans policy = zéro ligne pour tout rôle non
-- service_role, y compris si un `grant` revenait par une autre porte.

-- ---------------------------------------------------------------------------
-- 2) LA PROVENANCE `'sas'` SUR LE RÉFÉRENTIEL — le compteur ③
-- ---------------------------------------------------------------------------
--
-- Sans elle, une ligne promue est indiscernable d'une ligne CIQUAL, et le
-- compteur « part de l'énergie venant d'une ligne promue » n'a aucune source.
-- Un champ que rien ne compte est un lot désarmé qui ressemble à un lot qui
-- marche.
alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_source_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_source_check
  check (source in ('ciqual', 'manual', 'sas'));

comment on column public.food_composition_refs.source is
  'ciqual | manual | sas. `sas` = promue depuis food_composition_pending par '
  'promote_pending_food_compositions(). Lue par le compteur ③ du lot 18.';

-- ---------------------------------------------------------------------------
-- 3) LES COMPTEURS, SUR LE PLAN LUI-MÊME
-- ---------------------------------------------------------------------------
--
-- ⚠️ POURQUOI DES COLONNES ET PAS `generated_from`. Le voisin `box_sizing`
-- écrit déjà, en toutes lettres, que `generated_from` NE SORT QUE pour un
-- `intent` autre que `draft` — et que « toute vérification en situation réelle
-- se fait en draft ». Un compteur rangé là serait aveugle très exactement
-- pendant qu'on le regarde. Deux colonnes sont écrites sur CHAQUE plan
-- persisté, quel que soit l'intent.
alter table public.student_generated_meals
  add column if not exists composition_unknowns smallint not null default 0
    check (composition_unknowns >= 0);
alter table public.student_generated_meals
  add column if not exists composition_energy_sources jsonb not null default '{}'::jsonb;

comment on column public.student_generated_meals.composition_unknowns is
  'LOT 18 compteur ④ — nombre de termes DISTINCTS que le référentiel de base '
  'n''a pas su lire sur ce plan, mesuré AVANT tout remplissage. C''est le seul '
  'chiffre qui dise si le lot réussit: il doit BAISSER semaine après semaine.';

comment on column public.student_generated_meals.composition_energy_sources is
  'LOT 18 compteurs ①②③ — part de l''énergie du plan par provenance: '
  '{table, promoted, model, group_bounds} en fractions de 0 à 1, plus `kcal`.';

-- ---------------------------------------------------------------------------
-- 4) LA BANDE MESURÉE DE CHAQUE GROUPE
-- ---------------------------------------------------------------------------
--
-- ⛔ CALCULÉE DEPUIS LA TABLE, JAMAIS ÉCRITE À LA MAIN. Le prompt du lot le
-- demande en toutes lettres, et la raison est mesurable: `red_meat` va de 81 à
-- 744 kcal/100 g. Une bande recopiée dans une constante serait fausse le jour
-- où le référentiel grossit — et c'est ce lot-ci qui le fait grossir.
--
-- ⚠️ p05/p95 ET PAS min/max. Le référentiel porte des lignes extrêmes (une
-- « poudre de » à 744 dans `red_meat`), et une bande [min, max] n'exclut plus
-- rien: elle a l'air d'une garde et n'en est pas une.
--
-- ⚠️ ET LE MODULE TS RECALCULE LA MÊME BANDE DEPUIS L'INDEX QU'IL A DÉJÀ EN
-- MÉMOIRE (`groupBandsFrom`). Deux écritures d'une même formule divergent; un
-- test d'intégration compare les deux groupe par groupe et échoue si elles
-- s'écartent. C'est la seule façon d'avoir la bande dans un module PUR sans
-- lui donner une base de données.
create or replace view public.food_composition_group_bands as
select
  food_group_ref,
  count(*)::int as refs,
  percentile_cont(0.05) within group (order by energy_kcal)::numeric as energy_low,
  percentile_cont(0.95) within group (order by energy_kcal)::numeric as energy_high,
  percentile_cont(0.05) within group (order by protein_g)
    filter (where protein_g is not null)::numeric as protein_low,
  percentile_cont(0.95) within group (order by protein_g)
    filter (where protein_g is not null)::numeric as protein_high,
  percentile_cont(0.05) within group (order by carbs_g)
    filter (where carbs_g is not null)::numeric as carbs_low,
  percentile_cont(0.95) within group (order by carbs_g)
    filter (where carbs_g is not null)::numeric as carbs_high,
  percentile_cont(0.05) within group (order by fat_g)
    filter (where fat_g is not null)::numeric as fat_low,
  percentile_cont(0.95) within group (order by fat_g)
    filter (where fat_g is not null)::numeric as fat_high
from public.food_composition_refs
-- ⛔ LES LIGNES PROMUES SONT EXCLUES DE LA BANDE QUI DÉCIDE DES PROMOTIONS.
-- Sans ce filtre, chaque promotion élargirait la bande, qui autoriserait la
-- promotion suivante: une boucle qui s'ouvre toute seule et dont personne ne
-- voit le premier cran. La bande reste celle du référentiel HUMAIN.
where source in ('ciqual', 'manual')
group by food_group_ref;

comment on view public.food_composition_group_bands is
  'LOT 18 — la bande p05/p95 de chaque groupe, mesurée sur les seules lignes '
  'ciqual/manual. Miroir SQL de groupBandsFrom() (composition_fill.ts).';

revoke all on public.food_composition_group_bands from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) LA PROMOTION — hors du chemin chaud, et elle refuse plus qu'elle n'admet
-- ---------------------------------------------------------------------------
--
-- ⛔ ELLE N'EST APPELÉE PAR AUCUNE LANE DE GÉNÉRATION, ET C'EST LE POINT.
-- « écrire directement dans food_composition_refs depuis le chemin chaud » est
-- interdit par le prompt du lot: une génération qui écrit le référentiel qu'elle
-- vient de lire rend le résultat du plan suivant dépendant du tirage du
-- précédent. Cette fonction se lance à la main ou par cron.
create or replace function public.promote_pending_food_compositions(
  p_min_sightings integer default 3,
  p_dry_run boolean default false
)
returns table (term text, outcome text, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_slug text;
  v_outcome text;
  v_reason text;
  -- Le seuil de densité des lignes PROMUES. Voir le module TS: `energy_dense`
  -- du référentiel humain est CURÉ et ne se dérive pas d'un seuil (faux max
  -- 433, vrai min 85,7). On sur-détecte donc volontairement — un faux positif
  -- coûte une ABSTENTION de plus (`unweighedEnergyDense`), un faux négatif
  -- coûte une huile qui disparaît en silence. Même direction d'erreur que
  -- `DENSE_CLASS_WORDS`, choisie pour la même raison.
  c_dense_kcal constant numeric := 250;
begin
  for r in
    select p.*, b.refs, b.energy_low, b.energy_high,
           b.protein_low, b.protein_high, b.carbs_low, b.carbs_high,
           b.fat_low, b.fat_high
    from public.food_composition_pending p
    left join public.food_composition_group_bands b
      on b.food_group_ref = p.food_group_ref
    where p.status = 'pending'
      and p.sightings >= greatest(1, p_min_sightings)
    order by p.sightings desc, p.term
  loop
    v_slug := replace(btrim(r.term), ' ', '_');
    v_outcome := null;
    v_reason := null;

    -- ⛔ LES QUATRE REFUS, DANS CET ORDRE. Les deux premiers protègent un
    -- aliment RÉEL d'être remplacé; les deux suivants protègent le référentiel
    -- d'une valeur qui n'a jamais été mesurée.
    if r.fill_source <> 'model' then
      v_outcome := 'skipped'; v_reason := 'group_bounds_never_promoted';
    elsif exists (select 1 from public.food_composition_refs f where f.slug = v_slug) then
      v_outcome := 'needs_review'; v_reason := 'slug_taken';
    elsif exists (select 1 from public.food_composition_aliases a where a.alias = r.term) then
      -- Le terme est DÉJÀ le nom d'un aliment existant. Le promouvoir créerait
      -- deux aliments pour un seul nom, et le résolveur trancherait par l'ordre
      -- de consultation — c'est-à-dire au hasard, du point de vue du produit.
      v_outcome := 'needs_review'; v_reason := 'alias_exists';
    elsif r.food_group_ref is null or r.refs is null or r.refs < 3 then
      v_outcome := 'needs_review'; v_reason := 'no_band';
    elsif r.energy_kcal < r.energy_low or r.energy_kcal > r.energy_high then
      v_outcome := 'needs_review';
      v_reason := format('energy_out_of_band:%s not in [%s,%s]',
                         round(r.energy_kcal, 1), round(r.energy_low, 1), round(r.energy_high, 1));
    elsif r.protein_g is not null and r.protein_low is not null
          and (r.protein_g < r.protein_low or r.protein_g > r.protein_high) then
      v_outcome := 'needs_review'; v_reason := 'protein_out_of_band';
    elsif r.carbs_g is not null and r.carbs_low is not null
          and (r.carbs_g < r.carbs_low or r.carbs_g > r.carbs_high) then
      v_outcome := 'needs_review'; v_reason := 'carbs_out_of_band';
    elsif r.fat_g is not null and r.fat_low is not null
          and (r.fat_g < r.fat_low or r.fat_g > r.fat_high) then
      v_outcome := 'needs_review'; v_reason := 'fat_out_of_band';
    else
      v_outcome := 'promoted'; v_reason := null;
    end if;

    if not p_dry_run then
      if v_outcome = 'promoted' then
        -- ⛔ AUCUNE LIGNE D'ALIAS N'EST ÉCRITE ICI, NI AILLEURS DANS CE FICHIER.
        -- Le slug EST le terme normalisé: `resolveIngredient` le retrouve par
        -- égalité de slug (`form.replace(/ /g, "_")`). C'est ce qui rend la
        -- règle 3 du lot structurelle plutôt que surveillée.
        insert into public.food_composition_refs (
          slug, food_group_ref, label, source,
          energy_kcal, protein_g, carbs_g, fat_g, fiber_g,
          yield_class, atwater_discount, energy_dense,
          unit_grams, condiment_grams
        ) values (
          v_slug, r.food_group_ref, left(r.label, 80), 'sas',
          r.energy_kcal, r.protein_g, r.carbs_g, r.fat_g, r.fiber_g,
          r.yield_class, 1.0, r.energy_kcal >= c_dense_kcal,
          -- ⛔ NI POIDS D'UNITÉ NI MASSE DE CONDIMENT. Les deux font PESER
          -- quelque chose que personne n'a mesuré: `unit_grams` convertit
          -- « 2 courgettes » en grammes, `condiment_grams` fait entrer un
          -- terme sans quantité dans les sommes. Une ligne promue a le droit
          -- de porter une composition; elle n'a pas le droit de porter une
          -- portion.
          null, null
        );
        update public.food_composition_pending
          set status = 'promoted', promoted_at = now(), review_reason = null
          where public.food_composition_pending.term = r.term;
      elsif v_outcome = 'needs_review' then
        update public.food_composition_pending
          set status = 'needs_review', review_reason = v_reason
          where public.food_composition_pending.term = r.term;
      end if;
    end if;

    term := r.term; outcome := v_outcome; reason := v_reason;
    return next;
  end loop;
end;
$$;

revoke all on function public.promote_pending_food_compositions(integer, boolean)
  from anon, authenticated;

comment on function public.promote_pending_food_compositions(integer, boolean) is
  'LOT 18 — promeut les lignes du sas vues >= p_min_sightings fois ET dont les '
  'valeurs tiennent dans la bande mesurée de leur groupe. N''écrit JAMAIS dans '
  'food_composition_aliases. Hors chemin chaud: à lancer par cron ou à la main.';

-- ---------------------------------------------------------------------------
-- 6) LA LECTURE — sans elle, les compteurs ne sont que des colonnes
-- ---------------------------------------------------------------------------
--
-- Le chiffre à regarder est `unknowns_median`: s'il ne BAISSE pas de semaine en
-- semaine, la table ne se remplit pas et on paie un appel de plus pour rien.
create or replace view public.composition_fill_weekly as
select
  date_trunc('week', created_at)::date as week,
  plan_kind,
  count(*)::int as plans,
  percentile_cont(0.5) within group (order by composition_unknowns)::numeric
    as unknowns_median,
  max(composition_unknowns)::int as unknowns_max,
  round(avg((composition_energy_sources->>'table')::numeric), 3) as share_table,
  round(avg((composition_energy_sources->>'promoted')::numeric), 3) as share_promoted,
  round(avg((composition_energy_sources->>'model')::numeric), 3) as share_model,
  round(avg((composition_energy_sources->>'group_bounds')::numeric), 3) as share_group_bounds
from public.student_generated_meals
group by 1, 2;

comment on view public.composition_fill_weekly is
  'LOT 18 — la lecture des quatre compteurs, par semaine et par lane. '
  'unknowns_median doit BAISSER; sinon le sas ne remplit pas la table.';

revoke all on public.composition_fill_weekly from anon, authenticated;

commit;
