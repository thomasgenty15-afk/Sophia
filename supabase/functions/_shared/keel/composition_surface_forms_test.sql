-- ============================================================================
-- UN ALIMENT, UN SLUG, DEUX SURFACES — ÉPROUVÉ EN BASE.
--
-- Prompt: docs/keel/PROMPT-AGENT-SAS-REFERENTIEL.md
-- Migrations: 20260910180000 · 20260910181000 · 20260910182000
--
-- Ce que le module TS ne PEUT pas prouver: l'addition atomique des vues sous un
-- terme canonique, les quatre `not exists` qui gardent l'écriture d'une forme,
-- le passage des formes vers `food_composition_aliases` À LA PROMOTION, et
-- l'existence du job cron.
--
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f /tmp/composition_surface_forms_test.sql
--
-- ⚠️ Tout se passe dans une transaction ROLLBACK: la base ressort intacte.
-- LE CAS ⑧ EST HORS TRANSACTION PAR NATURE (il lit `cron.job`), mais il ne
-- fait que lire.
-- ============================================================================

begin;

create temporary table t_probe(name text, ok boolean, detail text) on commit drop;

-- ── ① TROIS FORMES, TROIS PLANS, UNE LIGNE, TROIS VUES ─────────────────────
--
-- MUTATION QUI DOIT ROUGIR: écrire `term` = la forme rencontrée au lieu du
-- terme canonique côté appelant. On retrouve 1 + 1 + 1 sur trois lignes, et le
-- seuil de trois n'est jamais atteint — c'est le défaut mesuré le 2026-09-10.
select public.record_food_composition_sightings(
  '[{"term":"zzz beurre damande","food_group_ref":"nuts_seeds","label":"zzz beurre damande",
     "energy_kcal":531,"protein_g":21,"carbs_g":15,"fat_g":50,"fiber_g":10,
     "yield_class":"neutral","fill_source":"model",
     "forms":[{"form":"zzz puree damande","source":"label_fr"}]}]'::jsonb);
select public.record_food_composition_sightings(
  '[{"term":"zzz beurre damande","food_group_ref":"nuts_seeds","label":"zzz beurre damande",
     "energy_kcal":531,"yield_class":"neutral","fill_source":"model",
     "forms":[{"form":"zzz purees damandes","source":"encountered"}]}]'::jsonb);
select public.record_food_composition_sightings(
  '[{"term":"zzz beurre damande","food_group_ref":"nuts_seeds","label":"zzz beurre damande",
     "energy_kcal":531,"yield_class":"neutral","fill_source":"model",
     "forms":[{"form":"zzz beurre de amande","source":"label_en"}]}]'::jsonb);

insert into t_probe
select '① 3 formes -> 1 ligne, 3 vues',
  (select count(*) from public.food_composition_pending
   where term like 'zzz%amande%') = 1
  and (select sightings from public.food_composition_pending
       where term = 'zzz beurre damande') = 3,
  format('lignes=%s sightings=%s',
    (select count(*) from public.food_composition_pending where term like 'zzz%amande%'),
    (select sightings from public.food_composition_pending where term = 'zzz beurre damande'));

-- ── ② LES TROIS FORMES SE RANGENT À CÔTÉ, ET LA VUE LES REND ───────────────
insert into t_probe
select '② la vue rend la ligne par chacun de ses noms',
  (select count(*) from public.food_composition_pending_by_form
   where term = 'zzz beurre damande') = 4
  and (select count(distinct energy_kcal) from public.food_composition_pending_by_form
       where term = 'zzz beurre damande') = 1,
  format('%s formes, %s valeur(s)',
    (select count(*) from public.food_composition_pending_by_form
     where term = 'zzz beurre damande'),
    (select count(distinct energy_kcal) from public.food_composition_pending_by_form
     where term = 'zzz beurre damande'));

-- ── ③ ⛔ UNE FORME QUI DÉSIGNE DÉJÀ UN ALIMENT N'EST PAS ÉCRITE ────────────
--
-- MUTATION QUI DOIT ROUGIR: retirer l'un des `not exists` de l'insertion des
-- formes. `olive oil` est un alias CURÉ; le reprendre remplacerait l'huile
-- d'olive par du beurre d'amande, pour tout le monde, définitivement — et ça ne
-- ressemblerait pas à un bug, ça ressemblerait à une donnée.
select public.record_food_composition_sightings(
  '[{"term":"zzz beurre damande","food_group_ref":"nuts_seeds","label":"zzz beurre damande",
     "energy_kcal":531,"yield_class":"neutral","fill_source":"model",
     "forms":[{"form":"olive oil","source":"label_en"},
              {"form":"almonds","source":"label_en"}]}]'::jsonb);
insert into t_probe
select '③ une forme déjà prise n''est jamais volée',
  not exists (select 1 from public.food_composition_pending_aliases
              where alias in ('olive oil', 'almonds')),
  format('%s forme(s) volée(s)',
    (select count(*) from public.food_composition_pending_aliases
     where alias in ('olive oil', 'almonds')));

-- ── ④ ⛔ LE PREMIER ÉCRIVAIN GAGNE ─────────────────────────────────────────
--
-- MUTATION QUI DOIT ROUGIR: passer l'insertion des formes en `on conflict do
-- update`. Un nom changerait d'aliment à la deuxième réponse du modèle.
select public.record_food_composition_sightings(
  '[{"term":"zzz autre aliment","food_group_ref":"nuts_seeds","label":"zzz autre aliment",
     "energy_kcal":400,"yield_class":"neutral","fill_source":"model",
     "forms":[{"form":"zzz puree damande","source":"label_fr"}]}]'::jsonb);
insert into t_probe
select '④ une forme ne change pas d''aliment',
  (select term from public.food_composition_pending_aliases
   where alias = 'zzz puree damande') = 'zzz beurre damande',
  format('pointe vers %s', (select term from public.food_composition_pending_aliases
                            where alias = 'zzz puree damande'));

-- ── ⑤ ⛔ UN TERME DÉJÀ FORME D'UN AUTRE ALIMENT NE DEVIENT PAS UN ALIMENT ──
select public.record_food_composition_sightings(
  '[{"term":"zzz puree damande","food_group_ref":"nuts_seeds","label":"zzz puree damande",
     "energy_kcal":300,"yield_class":"neutral","fill_source":"model"}]'::jsonb);
insert into t_probe
select '⑤ une forme ne devient pas un aliment de plus',
  not exists (select 1 from public.food_composition_pending where term = 'zzz puree damande'),
  format('%s ligne(s)', (select count(*) from public.food_composition_pending
                         where term = 'zzz puree damande'));

-- ── ⑥ LA PROMOTION EMPORTE LES FORMES VERS LE RÉFÉRENTIEL ──────────────────
--
-- MUTATION QUI DOIT ROUGIR: retirer l'insertion dans `food_composition_aliases`
-- de la branche `promoted`. L'aliment promu sous son nom anglais redeviendrait
-- inconnu à la première ligne de plan écrite en français, et le sas rouvrirait
-- une file pour un aliment qu'il vient de fermer.
select * from public.promote_pending_food_compositions(3, false, array['zzz beurre damande']);
insert into t_probe
select '⑥ promotion -> l''aliment ET ses formes',
  exists (select 1 from public.food_composition_refs
          where slug = 'zzz_beurre_damande' and source = 'sas')
  and (select count(*) from public.food_composition_aliases
       where slug = 'zzz_beurre_damande') = 3,
  format('ref=%s alias=%s',
    (select count(*) from public.food_composition_refs where slug = 'zzz_beurre_damande'),
    (select count(*) from public.food_composition_aliases where slug = 'zzz_beurre_damande'));

-- ── ⑦ `alias_exists` N'EST PLUS UN REFUS ──────────────────────────────────
--
-- MUTATION QUI DOIT ROUGIR: remettre `needs_review` sur cette branche. Sept
-- lignes retournent sur une file humaine où il n'y a rien à trancher.
insert into public.food_composition_pending
  (term, food_group_ref, label, energy_kcal, yield_class, fill_source, sightings)
values ('zzz deja alias', 'nuts_seeds', 'zzz deja alias', 500, 'neutral', 'model', 5);
insert into public.food_composition_aliases (alias, slug, note)
values ('zzz deja alias', 'almonds', 'test');
select * from public.promote_pending_food_compositions(3, false, array['zzz deja alias']);
insert into t_probe
select '⑦ terme déjà atteint -> covered, pas une revue',
  (select status from public.food_composition_pending where term = 'zzz deja alias') = 'covered'
  and not exists (select 1 from public.food_composition_refs where slug = 'zzz_deja_alias'),
  format('status=%s ref=%s',
    (select status from public.food_composition_pending where term = 'zzz deja alias'),
    (select count(*) from public.food_composition_refs where slug = 'zzz_deja_alias'));

-- ── ⑧ ⛔ UNE LIGNE `group_bounds` N'EST TOUJOURS PAS PROMUE ───────────────
insert into public.food_composition_pending
  (term, food_group_ref, label, energy_kcal, yield_class, fill_source, sightings)
values ('zzz convention', 'nuts_seeds', 'zzz convention', 500, 'neutral', 'group_bounds', 9);
insert into t_probe
select '⑧ une bande de groupe n''entre pas au référentiel',
  (select outcome || '/' || coalesce(reason, '-')
   from public.promote_pending_food_compositions(3, true, array['zzz convention']))
   = 'skipped/group_bounds_never_promoted',
  coalesce((select outcome || '/' || coalesce(reason, '-')
            from public.promote_pending_food_compositions(3, true, array['zzz convention'])),
           'absente');

-- ── ⑨bis LA MISE EN REVUE VOYAGE, ET ELLE FERME LA PROMOTION ──────────────
--
-- MUTATION QUI DOIT ROUGIR: ignorer le champ `review` à l'insertion. La ligne
-- entrerait en `pending`, donc promouvable par le cron — et le référentiel
-- gagnerait un doublon d'un aliment que des humains ont écrit.
select public.record_food_composition_sightings(
  '[{"term":"zzz laitue","food_group_ref":"nuts_seeds","label":"zzz laitue",
     "energy_kcal":500,"protein_g":20,"carbs_g":15,"fat_g":45,"fiber_g":5,
     "yield_class":"neutral","fill_source":"model",
     "review":"canonical_is_curated_food"}]'::jsonb);
select public.record_food_composition_sightings(
  '[{"term":"zzz laitue","food_group_ref":"nuts_seeds","label":"zzz laitue",
     "energy_kcal":500,"yield_class":"neutral","fill_source":"model",
     "review":"canonical_is_curated_food"}]'::jsonb);
select public.record_food_composition_sightings(
  '[{"term":"zzz laitue","food_group_ref":"nuts_seeds","label":"zzz laitue",
     "energy_kcal":500,"yield_class":"neutral","fill_source":"model",
     "review":"canonical_is_curated_food"}]'::jsonb);
insert into t_probe
select '⑨bis review -> needs_review, et hors de la promotion',
  (select status from public.food_composition_pending where term = 'zzz laitue') = 'needs_review'
  and (select sightings from public.food_composition_pending where term = 'zzz laitue') = 3
  -- ⛔ TROIS VUES, ET POURTANT RIEN: la boucle ne lit que `pending`.
  and not exists (select 1 from public.promote_pending_food_compositions(3, true)
                  where term = 'zzz laitue'),
  format('status=%s sightings=%s',
    (select status from public.food_composition_pending where term = 'zzz laitue'),
    (select sightings from public.food_composition_pending where term = 'zzz laitue'));

-- ── ⑨ LE CRON EXISTE, ET IL APPELLE LA BONNE FONCTION ─────────────────────
--
-- MUTATION QUI DOIT ROUGIR: déprogrammer le job, ou lui faire appeler autre
-- chose. Un lot dont le producteur n'est branché nulle part ressemble trait
-- pour trait à un lot qui marche.
insert into t_probe
select '⑨ le cron hebdomadaire est planifié',
  exists (
    select 1 from cron.job
    where jobname = 'keel-promote-pending-compositions'
      and active
      and command like '%promote_pending_food_compositions%'
      -- Hebdomadaire: le 5e champ nomme un jour de la semaine.
      and schedule ~ '^[0-9]+ [0-9]+ \* \* [0-6]$'
  ),
  coalesce((select schedule || ' | ' || left(command, 60) from cron.job
            where jobname = 'keel-promote-pending-compositions'), 'aucun job');

-- ── LE VERDICT ─────────────────────────────────────────────────────────────
select case when ok then '  OK  ' else ' ÉCHEC' end as verdict, name, detail from t_probe order by name;
do $$
declare n integer;
begin
  select count(*) into n from t_probe where not ok;
  if n > 0 then raise exception 'FORMES DE SURFACE · % cas en échec', n; end if;
  raise notice 'FORMES DE SURFACE · tous les cas passent';
end $$;

rollback;
