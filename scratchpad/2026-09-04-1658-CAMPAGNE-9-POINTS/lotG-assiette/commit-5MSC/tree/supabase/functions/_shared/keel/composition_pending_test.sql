-- ============================================================================
-- LOT 18 · LE SAS, ÉPROUVÉ EN BASE.
--
-- Ce que le module TS ne PEUT pas prouver: l'atomicité de l'incrémentation, la
-- règle de conflit, et la promotion réelle dans `food_composition_refs`.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f /tmp/composition_pending_test.sql
--
-- ⚠️ Tout se passe dans une transaction ROLLBACK: la base ressort intacte.
-- ============================================================================

begin;

-- Un terme qui n'existe nulle part, et qui ne ressemble à rien du référentiel.
create temporary table t_probe(name text, ok boolean, detail text) on commit drop;

-- ── ① UNE PREMIÈRE OBSERVATION CRÉE LA LIGNE ───────────────────────────────
select public.record_food_composition_sightings(
  '[{"term":"zzz test yuzu","food_group_ref":"citrus","label":"zzz test yuzu",
     "energy_kcal":40,"protein_g":1,"carbs_g":9,"fat_g":0.3,"fiber_g":2,
     "yield_class":"neutral","fill_source":"model"}]'::jsonb);
insert into t_probe select '① création', count(*) = 1 and max(sightings) = 1,
  format('n=%s sightings=%s', count(*), coalesce(max(sightings), -1))
from public.food_composition_pending where term = 'zzz test yuzu';

-- ── ② À DEUX OBSERVATIONS, RIEN N'EST PROMU ────────────────────────────────
select public.record_food_composition_sightings(
  '[{"term":"zzz test yuzu","food_group_ref":"citrus","label":"zzz test yuzu",
     "energy_kcal":40,"protein_g":1,"carbs_g":9,"fat_g":0.3,"fiber_g":2,
     "yield_class":"neutral","fill_source":"model"}]'::jsonb);
insert into t_probe
select '② 2 vues -> aucune promotion',
  not exists (select 1 from public.promote_pending_food_compositions(3, true)
              where term = 'zzz test yuzu'),
  format('sightings=%s', (select sightings from public.food_composition_pending
                          where term = 'zzz test yuzu'));

-- ── ③ LA 3e OBSERVATION PROMEUT, ET LE SLUG EST LE TERME ───────────────────
select public.record_food_composition_sightings(
  '[{"term":"zzz test yuzu","food_group_ref":"citrus","label":"zzz test yuzu",
     "energy_kcal":40,"protein_g":1,"carbs_g":9,"fat_g":0.3,"fiber_g":2,
     "yield_class":"neutral","fill_source":"model"}]'::jsonb);
create temporary table t_promo on commit drop as
  select * from public.promote_pending_food_compositions(3, false);

insert into t_probe
select '③ 3e vue -> promue',
  (select outcome from t_promo where term = 'zzz test yuzu') = 'promoted',
  coalesce((select outcome || ' / ' || coalesce(reason, '-') from t_promo
            where term = 'zzz test yuzu'), 'absente');

insert into t_probe
select '③ la ligne existe, source=sas, slug=terme',
  exists (select 1 from public.food_composition_refs
          where slug = 'zzz_test_yuzu' and source = 'sas'),
  coalesce((select source || ' / dense=' || energy_dense
            from public.food_composition_refs where slug = 'zzz_test_yuzu'), 'absente');

-- ⛔ LA RÈGLE 3 DU LOT: AUCUN ALIAS N'A ÉTÉ ÉCRIT.
insert into t_probe
select '③ AUCUN alias créé (règle 3)',
  not exists (select 1 from public.food_composition_aliases
              where slug = 'zzz_test_yuzu' or alias = 'zzz test yuzu'),
  format('%s alias', (select count(*) from public.food_composition_aliases
                      where slug = 'zzz_test_yuzu' or alias = 'zzz test yuzu'));

-- ── ④ UNE VALEUR HORS BANDE RESTE EN SAS ───────────────────────────────────
-- `citrus` va de 27,6 à 47,3 kcal/100 g. 400 est très au-dessus.
-- ⚠️ UN APPEL = UN PLAN = UNE INCRÉMENTATION. Trois appels, pas un tableau de
-- trois lignes: `record_food_composition_sightings` dédoublonne par terme, très
-- exactement pour qu'un plan ne puisse pas se compter trois fois lui-même.
select public.record_food_composition_sightings(
  '[{"term":"zzz test hors bande","food_group_ref":"citrus","label":"zzz test hors bande",
     "energy_kcal":400,"protein_g":1,"carbs_g":9,"fat_g":0.3,"fiber_g":2,
     "yield_class":"neutral","fill_source":"model"}]'::jsonb);
select public.record_food_composition_sightings(
  '[{"term":"zzz test hors bande","food_group_ref":"citrus","label":"zzz test hors bande",
     "energy_kcal":400,"protein_g":1,"carbs_g":9,"fat_g":0.3,"fiber_g":2,
     "yield_class":"neutral","fill_source":"model"}]'::jsonb);
select public.record_food_composition_sightings(
  '[{"term":"zzz test hors bande","food_group_ref":"citrus","label":"zzz test hors bande",
     "energy_kcal":400,"protein_g":1,"carbs_g":9,"fat_g":0.3,"fiber_g":2,
     "yield_class":"neutral","fill_source":"model"}]'::jsonb);
create temporary table t_promo2 on commit drop as
  select * from public.promote_pending_food_compositions(3, false);
insert into t_probe
select '④ hors bande -> needs_review, jamais promue',
  (select status from public.food_composition_pending where term = 'zzz test hors bande')
    = 'needs_review'
  and not exists (select 1 from public.food_composition_refs where slug = 'zzz_test_hors_bande'),
  coalesce((select status || ' / ' || coalesce(review_reason, '-')
            from public.food_composition_pending where term = 'zzz test hors bande'), 'absente');

-- ── ④bis UN PLAN NE SE COMPTE PAS TROIS FOIS LUI-MÊME ─────────────────────
select public.record_food_composition_sightings(
  '[{"term":"zzz test dedup","food_group_ref":"citrus","label":"zzz test dedup",
     "energy_kcal":40,"yield_class":"neutral","fill_source":"model"},
    {"term":"zzz test dedup","food_group_ref":"citrus","label":"zzz test dedup",
     "energy_kcal":40,"yield_class":"neutral","fill_source":"model"},
    {"term":"zzz test dedup","food_group_ref":"citrus","label":"zzz test dedup",
     "energy_kcal":40,"yield_class":"neutral","fill_source":"model"}]'::jsonb);
insert into t_probe
select '④bis 3 lignes d''un même appel -> 1 seule vue',
  (select sightings from public.food_composition_pending where term = 'zzz test dedup') = 1,
  format('sightings=%s', (select sightings from public.food_composition_pending
                          where term = 'zzz test dedup'));

-- ── ⑤ UNE LIGNE `group_bounds` N'EST JAMAIS PROMUE ─────────────────────────
select public.record_food_composition_sightings(
  '[{"term":"zzz test convention","food_group_ref":"citrus","label":"zzz test convention",
     "energy_kcal":37,"yield_class":"neutral","fill_source":"group_bounds"}]'::jsonb);
select public.record_food_composition_sightings(
  '[{"term":"zzz test convention","food_group_ref":"citrus","label":"zzz test convention",
     "energy_kcal":37,"yield_class":"neutral","fill_source":"group_bounds"}]'::jsonb);
select public.record_food_composition_sightings(
  '[{"term":"zzz test convention","food_group_ref":"citrus","label":"zzz test convention",
     "energy_kcal":37,"yield_class":"neutral","fill_source":"group_bounds"}]'::jsonb);
create temporary table t_promo3 on commit drop as
  select * from public.promote_pending_food_compositions(3, false);
insert into t_probe
select '⑤ group_bounds -> jamais promue',
  (select outcome from t_promo3 where term = 'zzz test convention') = 'skipped'
  and not exists (select 1 from public.food_composition_refs where slug = 'zzz_test_convention'),
  coalesce((select outcome || ' / ' || coalesce(reason, '-') from t_promo3
            where term = 'zzz test convention'), 'absente');

-- ── ⑥ UNE RÉPONSE DE MODÈLE DÉLOGE UNE CONVENTION ──────────────────────────
select public.record_food_composition_sightings(
  '[{"term":"zzz test convention","food_group_ref":"citrus","label":"zzz test convention",
     "energy_kcal":41,"protein_g":1,"carbs_g":9,"fat_g":0.2,"fiber_g":2,
     "yield_class":"neutral","fill_source":"model"}]'::jsonb);
insert into t_probe
select '⑥ model déloge group_bounds',
  (select fill_source from public.food_composition_pending where term = 'zzz test convention') = 'model'
  and (select energy_kcal from public.food_composition_pending where term = 'zzz test convention') = 41,
  format('%s / %s', (select fill_source from public.food_composition_pending
                     where term = 'zzz test convention'),
                    (select energy_kcal from public.food_composition_pending
                     where term = 'zzz test convention'));

-- ── ⑦ UN TERME QUE LE RÉFÉRENTIEL CONNAÎT N'ENTRE PAS ──────────────────────
select public.record_food_composition_sightings(
  '[{"term":"olive oil","food_group_ref":"olive_oil","label":"olive oil",
     "energy_kcal":900,"yield_class":"neutral","fill_source":"model"}]'::jsonb);
insert into t_probe
select '⑦ terme déjà aliasé -> refusé à l''entrée',
  not exists (select 1 from public.food_composition_pending where term = 'olive oil'),
  format('%s ligne(s)', (select count(*) from public.food_composition_pending
                         where term = 'olive oil'));

-- ── ⑧ UNE LIGNE PROMUE NE SE RÉVEILLE PAS ──────────────────────────────────
select public.record_food_composition_sightings(
  '[{"term":"zzz test yuzu","food_group_ref":"citrus","label":"zzz test yuzu",
     "energy_kcal":40,"yield_class":"neutral","fill_source":"model"}]'::jsonb);
insert into t_probe
select '⑧ promue -> compteur figé',
  (select sightings from public.food_composition_pending where term = 'zzz test yuzu') = 3
  and (select status from public.food_composition_pending where term = 'zzz test yuzu') = 'promoted',
  format('sightings=%s status=%s',
    (select sightings from public.food_composition_pending where term = 'zzz test yuzu'),
    (select status from public.food_composition_pending where term = 'zzz test yuzu'));

-- ── LE VERDICT ─────────────────────────────────────────────────────────────
select case when ok then '  OK  ' else ' ÉCHEC' end as verdict, name, detail from t_probe order by name;
do $$
declare n integer;
begin
  select count(*) into n from t_probe where not ok;
  if n > 0 then raise exception 'LOT 18 · % cas en échec', n; end if;
  raise notice 'LOT 18 · sas SQL: tous les cas passent';
end $$;

rollback;
