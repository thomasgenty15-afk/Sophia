-- ============================================================================
-- ⟳ 2026-09-24 — UNE RÉPONSE DU MODÈLE DÉLOGE LA CONVENTION QUI OCCUPE SON NOM
--
-- Reprise À L'IDENTIQUE de `record_food_composition_sightings`
-- (20260910181000), plus deux gestes :
--   1. une ligne `group_bounds` encore `pending` dont le terme est une FORME
--      d'une réponse `model` passe `covered` (`dislodged_by_model:<terme>`) ;
--   2. la garde des formes laisse alors écrire l'alias sur ce nom.
-- `loadPendingFills` ignore déjà `covered` : la lecture trouve l'alias, donc
-- la valeur du modèle.
--
-- Pourquoi : sans ça, « purée d'amandes » restait à 531,1 kcal de convention
-- (refusée par `meal-energy-v1`) même quand le modèle répondait 614 sous
-- « almond butter » — et le tableau de la semaine marquait la journée « * ».
-- ============================================================================

create or replace function public.record_food_composition_sightings(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_written integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  with incoming as (
    select
      btrim(r->>'term') as term,
      nullif(r->>'food_group_ref', '') as food_group_ref,
      left(coalesce(nullif(btrim(r->>'label'), ''), btrim(r->>'term')), 80) as label,
      (r->>'energy_kcal')::numeric as energy_kcal,
      (r->>'protein_g')::numeric as protein_g,
      (r->>'carbs_g')::numeric as carbs_g,
      (r->>'fat_g')::numeric as fat_g,
      (r->>'fiber_g')::numeric as fiber_g,
      r->>'yield_class' as yield_class,
      r->>'fill_source' as fill_source,
      -- ⚠️ LA MISE EN REVUE, DÉCIDÉE PAR LE CODE ET PORTÉE JUSQU'ICI. Une ligne
      -- dont le modèle a revendiqué l'identité d'un aliment déjà curé
      -- (`canonical_is_curated_food`) entre en `needs_review`: sa composition
      -- sert le plan qui la cite, et elle n'est JAMAIS promouvable — la boucle
      -- de promotion ne lit que `status = 'pending'`. Sans ce champ, elle
      -- entrerait en file normale et le cron créerait un doublon d'un aliment
      -- que des humains ont écrit.
      nullif(btrim(coalesce(r->>'review', '')), '') as review
    from jsonb_array_elements(p_rows) r
  ),
  clean as (
    -- ⛔ `distinct on (term)`, ET CE N'EST PAS DE LA PRUDENCE DÉCORATIVE.
    -- `on conflict do update` LÈVE quand la même commande propose deux fois la
    -- même clé (« cannot affect row a second time »). Et depuis les formes de
    -- surface, ce n'est PLUS un cas théorique: deux formes du même aliment dans
    -- un même plan rendent le même terme canonique, donc la même clé.
    select distinct on (i.term) i.* from incoming i
    where i.term is not null
      and length(i.term) between 1 and 80
      and i.energy_kcal is not null
      and i.energy_kcal >= 0
      and i.fill_source in ('model', 'group_bounds')
      and i.yield_class in ('neutral', 'grain_absorbs', 'legume_absorbs',
                            'meat_shrinks', 'fish_shrinks', 'veg_shrinks')
      -- ⛔ LE RÉFÉRENTIEL GAGNE TOUJOURS.
      and not exists (
        select 1 from public.food_composition_refs f
        where f.slug = replace(i.term, ' ', '_')
      )
      and not exists (
        select 1 from public.food_composition_aliases a where a.alias = i.term
      )
      -- ⛔ ET UNE FORME DE SURFACE DÉJÀ PRISE GAGNE AUSSI. Un terme qui est
      -- déjà la forme d'un AUTRE aliment du sas ne devient pas un aliment de
      -- plus: ce serait fabriquer le doublon que ce lot existe pour retirer.
      and not exists (
        select 1 from public.food_composition_pending_aliases pa
        where pa.alias = i.term
      )
      and (i.food_group_ref is null
           or exists (select 1 from public.food_groups g where g.slug = i.food_group_ref))
    order by i.term
  )
  insert into public.food_composition_pending as p (
    term, food_group_ref, label, energy_kcal, protein_g, carbs_g, fat_g,
    fiber_g, yield_class, fill_source, status, review_reason
  )
  select term, food_group_ref, label, energy_kcal, protein_g, carbs_g, fat_g,
         fiber_g, yield_class, fill_source,
         case when review is null then 'pending' else 'needs_review' end,
         review
  from clean
  on conflict (term) do update set
    -- ① LE COMPTEUR MONTE TOUJOURS, quel que soit l'état.
    --
    -- ⚠️ ET C'EST ICI QUE LES VUES S'ADDITIONNENT. La clé est le terme
    -- CANONIQUE: trois plans qui écrivent « puree d'amande », « puree
    -- d'amandes » et « almond butter » tombent sur la même ligne et font 3, au
    -- lieu de 1 + 1 + 1 sur trois lignes qui n'atteignaient jamais le seuil.
    sightings = p.sightings + 1,
    last_seen_at = now(),
    -- ② UNE VRAIE RÉPONSE REMPLACE UNE CONVENTION, JAMAIS L'INVERSE.
    -- ⛔ ET UNE RÉPONSE DE MODÈLE N'EN REMPLACE PAS UNE AUTRE: on promeut la
    -- valeur COMPTÉE trois fois, pas la dernière arrivée.
    fill_source = case
      when p.fill_source = 'group_bounds' and excluded.fill_source = 'model'
        then 'model' else p.fill_source end,
    food_group_ref = case
      when p.fill_source = 'group_bounds' and excluded.fill_source = 'model'
        then excluded.food_group_ref else p.food_group_ref end,
    energy_kcal = case
      when p.fill_source = 'group_bounds' and excluded.fill_source = 'model'
        then excluded.energy_kcal else p.energy_kcal end,
    protein_g = case
      when p.fill_source = 'group_bounds' and excluded.fill_source = 'model'
        then excluded.protein_g else p.protein_g end,
    carbs_g = case
      when p.fill_source = 'group_bounds' and excluded.fill_source = 'model'
        then excluded.carbs_g else p.carbs_g end,
    fat_g = case
      when p.fill_source = 'group_bounds' and excluded.fill_source = 'model'
        then excluded.fat_g else p.fat_g end,
    fiber_g = case
      when p.fill_source = 'group_bounds' and excluded.fill_source = 'model'
        then excluded.fiber_g else p.fiber_g end,
    yield_class = case
      when p.fill_source = 'group_bounds' and excluded.fill_source = 'model'
        then excluded.yield_class else p.yield_class end,
    -- ③ UNE MISE EN REVUE NE SE DÉFAIT PAS TOUTE SEULE, ET ELLE NE SE POSE QUE
    -- SUR UNE LIGNE EN FILE. Une ligne `pending` qu'un plan signale passe en
    -- revue; une ligne déjà en revue, `rejected` ou `covered` ne bouge pas. Le
    -- sens de circulation est à sens unique exprès: c'est une lecture HUMAINE
    -- qui remet une ligne en file, jamais un tirage de modèle.
    status = case
      when p.status = 'pending' and excluded.review_reason is not null
        then 'needs_review' else p.status end,
    review_reason = case
      when p.status = 'pending' and excluded.review_reason is not null
        then excluded.review_reason else p.review_reason end
  -- ⛔ UNE LIGNE DÉJÀ PROMUE NE SE RÉVEILLE PAS.
  where p.status <> 'promoted';

  get diagnostics v_written = row_count;

  -- ⟳ 2026-09-24 — UNE RÉPONSE DU MODÈLE DÉLOGE LA CONVENTION QUI OCCUPE SON NOM.
  --
  -- Mesuré sur le plan local `59b06fd6` : le modèle répond « almond butter,
  -- 614 kcal » pour la forme « purée d'amandes » ; la ligne est écrite sous son
  -- terme canonique, mais la forme « purée d'amandes » n'est JAMAIS rangée en
  -- alias, parce qu'une ligne `group_bounds` (531,1 kcal, milieu de bande)
  -- porte déjà ce terme. `meal-energy-v1` cherche « purée d'amandes », trouve
  -- la convention, la refuse (elle n'est pas l'énergie de l'aliment), et la
  -- boîte sort du total du jour — à chaque plan, pour toujours.
  --
  -- ⛔ SEULEMENT une ligne `group_bounds` ENCORE `pending`, et seulement par une
  -- réponse `model` qui la nomme parmi ses formes. Une valeur de modèle n'est
  -- jamais délogée ; un alias curé non plus (`food_composition_aliases` n'est
  -- pas touché) ; une ligne promue non plus.
  update public.food_composition_pending sq
    set status = 'covered',
        review_reason = 'dislodged_by_model:' || m.term
  from (
    select distinct btrim(r->>'term') as term, btrim(f.value->>'form') as form
    from jsonb_array_elements(p_rows) r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r->'forms') = 'array' then r->'forms' else '[]'::jsonb end
    ) f(value)
    where r->>'fill_source' = 'model'
  ) m
  where sq.term = m.form
    and sq.term <> m.term
    and sq.fill_source = 'group_bounds'
    and sq.status = 'pending'
    and exists (
      select 1 from public.food_composition_pending w
      where w.term = m.term and w.fill_source = 'model'
    );

  -- ── LES FORMES DE SURFACE, EN SECONDE INSTRUCTION ────────────────────────
  --
  -- ⚠️ APRÈS L'UPSERT, ET PAS DANS LA MÊME CTE. La clé étrangère exige que la
  -- ligne canonique EXISTE; la faire dépendre de l'ordre d'exécution des CTE
  -- modifiantes serait un pari sur un détail du planificateur.
  --
  -- ⛔ LES QUATRE `not exists` SONT LA GARDE, ET IL N'Y EN A PAS DE CINQUIÈME
  -- QUI DEVINE. Une forme n'est écrite que si elle ne désigne RIEN aujourd'hui:
  -- ni un alias curé, ni un slug du référentiel, ni un autre terme du sas. Elle
  -- ne remplace donc jamais un aliment par un autre — le seul mode d'échec qui
  -- ressemble à une donnée plutôt qu'à un bug.
  insert into public.food_composition_pending_aliases (alias, term, form_source)
  select distinct on (a.alias) a.alias, a.term, a.form_source
  from (
    select
      btrim(r->>'term') as term,
      btrim(f.value->>'form') as alias,
      coalesce(nullif(f.value->>'source', ''), 'encountered') as form_source
    from jsonb_array_elements(p_rows) r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r->'forms') = 'array' then r->'forms' else '[]'::jsonb end
    ) f(value)
  ) a
  where a.alias is not null
    and length(a.alias) between 1 and 80
    and a.alias <> a.term
    and a.form_source in ('encountered', 'label_fr', 'label_en')
    and exists (select 1 from public.food_composition_pending p where p.term = a.term)
    and not exists (
      select 1 from public.food_composition_aliases x where x.alias = a.alias
    )
    and not exists (
      select 1 from public.food_composition_refs fr
      where fr.slug = replace(a.alias, ' ', '_')
    )
    -- ⟳ 2026-09-24 — une ligne `group_bounds` COUVERTE ne garde plus le nom.
    and not exists (
      select 1 from public.food_composition_pending p2
      where p2.term = a.alias
        and not (p2.fill_source = 'group_bounds' and p2.status = 'covered')
    )
  order by a.alias, a.term
  -- ⛔ LE PREMIER ÉCRIVAIN GAGNE. Une forme déjà posée ne change pas d'aliment:
  -- déplacer un nom d'un aliment vers un autre est très exactement ce que
  -- `laitue -> lait` décrit, et ça ne ressemble pas à un bug.
  on conflict (alias) do nothing;

  return v_written;
end;
$$;

revoke all on function public.record_food_composition_sightings(jsonb)
  from anon, authenticated;

comment on function public.record_food_composition_sightings(jsonb) is
  'Une observation de plan par aliment inconnu, sous son terme CANONIQUE. '
  'Incremente sightings, range les formes de surface dans '
  'food_composition_pending_aliases, laisse une reponse de modele deloger une '
  'convention group_bounds, ne reveille jamais une ligne promue. N''ecrit '
  'JAMAIS dans food_composition_aliases.';
