-- ══════════════════════════════════════════════════════════════════════════
-- LE SAS ÉCRIT SES FORMES, ET LA PROMOTION LES EMPORTE (2026-09-10)
--
-- Suite immédiate de 20260910180000. Séparée pour la même raison que
-- 20260821031000 l'était de 20260821030000: on ne réécrit pas une migration
-- déjà enregistrée, on en ajoute une.
--
-- DEUX FONCTIONS CHANGENT, ET UNE SEULE RÈGLE BOUGE
-- -------------------------------------------------
--   · `record_food_composition_sightings` accepte `forms` — la forme
--     rencontrée et les deux libellés. La clé de la ligne devient le terme
--     CANONIQUE, et les formes se rangent à côté.
--   · `promote_pending_food_compositions` cesse de refuser `alias_exists`
--     (il devient `covered`), et emporte les formes vers
--     `food_composition_aliases` À LA PROMOTION — c'est-à-dire hors chemin
--     chaud, après trois observations, et jamais avant.
--
-- ⛔ CE QUI NE BOUGE PAS: LE CHEMIN CHAUD N'ÉCRIT NI `food_composition_refs`
-- NI `food_composition_aliases`. « Une génération qui écrit le référentiel
-- qu'elle vient de lire rend le résultat du plan suivant dépendant du tirage du
-- précédent. » Les formes écrites en génération vont dans
-- `food_composition_pending_aliases`, qui n'est lue par aucun résolveur —
-- seulement par le cache du sas, pour les termes du plan qu'on calcule.
-- ══════════════════════════════════════════════════════════════════════════

begin;

-- ---------------------------------------------------------------------------
-- ① L'ÉCRITURE — le terme canonique porte la ligne, les formes se rangent
-- ---------------------------------------------------------------------------
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
    and not exists (
      select 1 from public.food_composition_pending p2 where p2.term = a.alias
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

-- ---------------------------------------------------------------------------
-- ② LA PROMOTION — `alias_exists` cesse d'être un refus, les formes suivent
-- ---------------------------------------------------------------------------
create or replace function public.promote_pending_food_compositions(
  p_min_sightings integer default 3,
  p_dry_run boolean default false,
  p_terms text[] default null
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
      and (
        (p_terms is null and p.sightings >= greatest(1, p_min_sightings))
        or (p_terms is not null and p.term = any (p_terms))
      )
    order by p.sightings desc, p.term
  loop
    v_slug := replace(btrim(r.term), ' ', '_');
    v_outcome := null;
    v_reason := null;

    if r.fill_source <> 'model' then
      -- ⛔ UNE BANDE DE GROUPE N'EST PAS UNE MESURE. Elle dépanne un plan, elle
      -- n'entre pas dans le référentiel. Ce refus-ci ne change pas.
      v_outcome := 'skipped'; v_reason := 'group_bounds_never_promoted';
    elsif exists (select 1 from public.food_composition_refs f where f.slug = v_slug) then
      v_outcome := 'needs_review'; v_reason := 'slug_taken';
    elsif exists (select 1 from public.food_composition_aliases a where a.alias = r.term) then
      -- ⚠️ CE N'EST PLUS UN REFUS, ET C'EST LE SEUL VERDICT QUI CHANGE.
      -- Le terme est déjà un alias CURÉ vers une ligne existante: le
      -- référentiel l'atteint, il n'y a aucun aliment à créer et rien à
      -- trancher. Le laisser en `needs_review` mettait sept lignes sur une file
      -- humaine où il n'y avait rien à faire — et une file bruyante finit par
      -- ne plus être lue.
      v_outcome := 'covered'; v_reason := 'alias_exists';
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
        insert into public.food_composition_refs (
          slug, food_group_ref, label, source,
          energy_kcal, protein_g, carbs_g, fat_g, fiber_g,
          yield_class, atwater_discount, energy_dense,
          unit_grams, condiment_grams
        ) values (
          v_slug, r.food_group_ref, left(r.label, 80), 'sas',
          r.energy_kcal, r.protein_g, r.carbs_g, r.fat_g, r.fiber_g,
          r.yield_class, 1.0, r.energy_kcal >= c_dense_kcal,
          -- ⛔ NI POIDS D'UNITÉ NI MASSE DE CONDIMENT.
          null, null
        );

        -- ── LES FORMES DE SURFACE SUIVENT L'ALIMENT ────────────────────────
        --
        -- ⚠️ C'EST LA SEULE ÉCRITURE DE `food_composition_aliases` DE TOUTE LA
        -- CHAÎNE, et elle est ici pour trois raisons qui tiennent ensemble:
        -- hors chemin chaud, après trois observations, et sur un slug qu'on
        -- vient de créer — donc jamais sur un aliment que quelqu'un d'autre a
        -- écrit. Sans elle, un aliment promu sous son nom anglais redeviendrait
        -- inconnu à la première ligne de plan écrite en français, et le sas
        -- rouvrirait une file pour un aliment qu'il vient de fermer.
        --
        -- ⛔ LES DEUX `not exists` NE SONT PAS REDONDANTS AVEC L'ÉCRITURE. Une
        -- forme posée il y a trois semaines a pu devenir un alias curé ou un
        -- slug depuis: c'est le référentiel HUMAIN qui gagne, à chaque fois.
        insert into public.food_composition_aliases (alias, slug, note)
        select pa.alias, v_slug,
               format('forme de surface promue depuis le sas (%s)', pa.form_source)
        from public.food_composition_pending_aliases pa
        where pa.term = r.term
          and not exists (
            select 1 from public.food_composition_aliases a2 where a2.alias = pa.alias
          )
          and not exists (
            select 1 from public.food_composition_refs f2
            where f2.slug = replace(pa.alias, ' ', '_')
          )
        on conflict (alias) do nothing;

        update public.food_composition_pending
          set status = 'promoted', promoted_at = now(), review_reason = null
          where public.food_composition_pending.term = r.term;
      elsif v_outcome = 'covered' then
        update public.food_composition_pending
          set status = 'covered', review_reason = v_reason
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

revoke all on function public.promote_pending_food_compositions(integer, boolean, text[])
  from anon, authenticated;

comment on function public.promote_pending_food_compositions(integer, boolean, text[]) is
  'Promeut les lignes du sas vues >= p_min_sightings fois ET dont les valeurs '
  'tiennent dans la bande mesuree de leur groupe. p_terms nomme une liste curee '
  'a la main: il leve la REPETITION, jamais les bandes. Ecrit dans '
  'food_composition_aliases UNIQUEMENT les formes de surface d''un aliment '
  'qu''elle vient elle-meme de creer. Hors chemin chaud.';

commit;
