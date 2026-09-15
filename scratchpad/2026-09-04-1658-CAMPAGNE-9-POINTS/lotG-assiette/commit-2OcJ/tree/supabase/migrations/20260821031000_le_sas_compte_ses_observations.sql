-- ============================================================================
-- LOT 18 · L'ÉCRITURE DU SAS — une observation, un plan, une incrémentation.
--
-- Suite immédiate de 20260821030000. Séparée parce que la précédente est déjà
-- appliquée et enregistrée: on ne réécrit pas une migration passée, on en
-- ajoute une.
--
-- POURQUOI UNE RPC ET PAS UN `upsert` DEPUIS LE CODE
-- --------------------------------------------------
-- La règle de conflit n'est pas « écrase » : elle dépend de l'ÉTAT de la ligne
-- et de la PROVENANCE des deux valeurs. Écrite côté code, elle voyagerait en
-- trois requêtes (lire, décider, écrire) sur un chemin où deux générations
-- simultanées écrivent le même terme — et le compteur qui décide d'une
-- promotion serait alors faux dans le sens qui promeut trop tôt. `insert ...
-- on conflict` la rend atomique, et une seule écriture la porte.
-- ============================================================================

begin;

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
      r->>'fill_source' as fill_source
    from jsonb_array_elements(p_rows) r
  ),
  clean as (
    -- ⛔ `distinct on (term)`, ET CE N'EST PAS DE LA PRUDENCE DÉCORATIVE.
    -- `on conflict do update` LÈVE quand la même commande propose deux fois la
    -- même clé (« cannot affect row a second time ») — mesuré à la première
    -- exécution du test de ce lot. L'appelant dédoublonne déjà
    -- (`fillRequestsFor`), et c'est justement pour ça qu'il ne faut pas s'y
    -- fier: le jour où un second appelant arrive, la panne serait une
    -- EXCEPTION sur le chemin de génération, c'est-à-dire tout ce que la règle
    -- 2 du lot interdit.
    select distinct on (i.term) i.* from incoming i
    where i.term is not null
      and length(i.term) between 1 and 80
      and i.energy_kcal is not null
      and i.energy_kcal >= 0
      and i.fill_source in ('model', 'group_bounds')
      and i.yield_class in ('neutral', 'grain_absorbs', 'legume_absorbs',
                            'meat_shrinks', 'fish_shrinks', 'veg_shrinks')
      -- ⛔ LE RÉFÉRENTIEL GAGNE TOUJOURS. Un terme que la table connaît déjà,
      -- par slug OU par alias, n'a rien à faire dans le sas: l'y laisser
      -- fabriquerait un second aliment pour un nom qui en a déjà un, et la
      -- promotion trancherait entre les deux. C'est la même garde que côté
      -- code (`withFilledRefs` refuse `already_resolved`), et elle est ici
      -- parce qu'un index chargé il y a dix minutes peut être périmé.
      and not exists (
        select 1 from public.food_composition_refs f
        where f.slug = replace(i.term, ' ', '_')
      )
      and not exists (
        select 1 from public.food_composition_aliases a where a.alias = i.term
      )
      -- Un groupe hors vocabulaire est mis à `null` plutôt que refusé: la ligne
      -- garde sa valeur d'énergie (donc son utilité de comptage) et devient
      -- simplement non promouvable, faute de bande.
      and (i.food_group_ref is null
           or exists (select 1 from public.food_groups g where g.slug = i.food_group_ref))
    order by i.term
  )
  insert into public.food_composition_pending as p (
    term, food_group_ref, label, energy_kcal, protein_g, carbs_g, fat_g,
    fiber_g, yield_class, fill_source
  )
  select term, food_group_ref, label, energy_kcal, protein_g, carbs_g, fat_g,
         fiber_g, yield_class, fill_source
  from clean
  on conflict (term) do update set
    -- ① LE COMPTEUR MONTE TOUJOURS, quel que soit l'état. C'est lui qui dit
    -- « ce terme revient », y compris sur une ligne déjà refusée: une ligne en
    -- revue qu'on revoit trente fois est une revue à faire en priorité.
    sightings = p.sightings + 1,
    last_seen_at = now(),
    -- ② UNE VRAIE RÉPONSE REMPLACE UNE CONVENTION, JAMAIS L'INVERSE.
    -- `group_bounds` est un milieu de bande posé faute de mieux; la première
    -- réponse du modèle doit pouvoir la déloger, sinon un incident de quelques
    -- minutes figerait une convention dans le sas pour toujours.
    --
    -- ⛔ ET UNE RÉPONSE DE MODÈLE N'EN REMPLACE PAS UNE AUTRE. La deuxième et
    -- la troisième observation ne réécrivent rien: on promeut la valeur qui a
    -- été COMPTÉE trois fois, pas la dernière arrivée. Sans ça, `sightings = 3`
    -- certifierait une valeur que deux des trois plans n'ont jamais vue.
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
        then excluded.yield_class else p.yield_class end
  -- ⛔ UNE LIGNE DÉJÀ PROMUE NE SE RÉVEILLE PAS. Elle vit dans
  -- `food_composition_refs` maintenant; la recompter ferait monter un compteur
  -- que plus personne ne lit et rendrait `promoted_at` mensonger.
  where p.status <> 'promoted';

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

revoke all on function public.record_food_composition_sightings(jsonb)
  from anon, authenticated;

comment on function public.record_food_composition_sightings(jsonb) is
  'LOT 18 — une observation de plan par terme inconnu. Incrémente sightings, '
  'laisse une réponse de modèle déloger une convention group_bounds, ne réveille '
  'jamais une ligne promue. Refuse tout terme que le référentiel connaît déjà.';

commit;
