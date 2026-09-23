-- ═══════════════════════════════════════════════════════════════════════════
-- LE RÉFÉRENTIEL DES À-CÔTÉS — 2026-09-23
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Chantier: plan « assiettes normales » du 2026-09-23, piste « données ».
-- Constat: `scratchpad/a-cotes/fallback_slugs.md` (vérification en base du
-- socle); détail des sources: `scratchpad/a-cotes/donnees.md`.
--
-- ── POURQUOI CETTE MIGRATION EXISTE ──────────────────────────────────────
-- Le moteur sert désormais un à-côté au déjeuner et au dîner, et c'est le
-- MODÈLE qui nomme l'aliment (« comté », « un chèvre », « un yaourt »). Un
-- aliment que le référentiel ne connaît pas est refusé (`unresolved`) et
-- remplacé par la liste de secours. Mesuré le 2026-09-23: comté, emmental,
-- camembert et brie ne se résolvaient pas du tout — le plateau de fromages
-- français n'existait pas, et le premier fromage nommé à la française
-- tombait. Pire: « chèvre » se résolvait, sur de la VIANDE de chevreau.
--
-- ── LA SOURCE, ET POURQUOI 2025 ET PAS 2020 ──────────────────────────────
-- Table CIQUAL de l'ANSES, lue sur ciqual.anses.fr le 2026-09-23 par la
-- recherche publique du site (3 484 aliments: l'édition 2025). La table 2020
-- n'est disponible qu'en fichier à télécharger (XLS/XML), et aucun
-- téléchargement n'a été fait. Les codes CIQUAL ont changé entre les deux
-- éditions (la pomme 13050 de 2020 n'existe plus en 2025): chaque ligne porte
-- donc SON code 2025, et sa provenance `ciqual2025:<code>`, jamais
-- `ciqual2020`.
--
-- ⛔ AUCUNE VALEUR N'EST ÉCRITE À LA MAIN. Les nombres ont été recopiés par
-- script depuis l'extrait (`scratchpad/a-cotes/ciqual_2025_extract.jsonl`,
-- `gen_rows.py`), avec la lecture des cellules de
-- `scratchpad/build_ciqual_migration.py` (l'import CIQUAL d'origine):
--   · protéines = « Protéines, N x facteur de Jones »;
--   · « traces » ⇒ NULL, « < x » ⇒ x;
--   · les sentinelles `*_source` = 15 % de la VNR pour 100 g (Règlement UE
--     1169/2011): calcium ≥ 120 mg, fer ≥ 2,1 mg, iode ≥ 22,5 µg, zinc ≥
--     1,5 mg, B12 ≥ 0,375 µg, folates ≥ 30 µg;
--   · `energy_dense` = 250 kcal/100 g et plus (`ENERGY_DENSE_MIN` de l'import,
--     le même nombre que `FILLED_DENSE_KCAL`).
-- ⚠️ ÉCART CONNU ET NOMMÉ: `cheddar` et `parmesan` (lignes manuelles plus
-- anciennes) portent `energy_dense = false` à 399 et 406 kcal. Cette migration
-- suit la règle écrite de l'import, pas l'exception; elle ne touche pas ces
-- deux lignes.
--
-- ── CE QUE LA MIGRATION FAIT ─────────────────────────────────────────────
--   ① ouvre la famille de provenance `ciqual2025` (contrainte fermée);
--   ② AJOUTE treize fromages (`on conflict do nothing`);
--   ③ CORRIGE `goat_cheese`: « Chevreau, cru » (viande) ⇒ « Fromage de
--      chèvre bûche », et range le chèvre FRAIS sur sa propre ligne;
--   ④ CORRIGE `emmental_rape` (estimation du sas ⇒ CIQUAL);
--   ⑤ CONFIRME `pear` (le lot A du 2026-09-11 demandait la ligne générique
--      ANSES et son code: la voici) et lève son `a_verifier`;
--   ⑥ pose le poids d'UN pot: yaourt nature, skyr, fromage blanc;
--   ⑦ ajoute les alias français et anglais (`on conflict do nothing`);
--   ⑧ vérifie tout ce qui précède dans un bloc de contrôle.
--
-- ⚠️ EFFET SUR LES PLANS DÉJÀ ÉCRITS, ET IL EST VOULU: un plan qui citait
-- « chèvre » était lu comme de la viande à 103 kcal/100 g; il se lira comme du
-- fromage (285). Un « 1 yaourt nature » sans grammes n'avait pas de masse; il
-- en a une (125 g). Le contrôle « meal-energy-v1 rend les mêmes kcal sur les
-- anciens plans » doit en tenir compte: un écart sur ces aliments-là est la
-- correction, pas une régression.
--
-- ⚠️ HORODATAGE: le dernier registre appliqué en local est `20260922201500`;
-- une migration antérieure serait SAUTÉE EN SILENCE par la CLI.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- ① LA FAMILLE DE PROVENANCE `ciqual2025`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⛔ LA FAMILLE RESTE FERMÉE: on y ajoute UN nom, pour une raison écrite ici.
-- `ciqual2020:<code>` sur une valeur lue dans la table 2025 serait une
-- provenance fausse — et les codes des deux éditions ne se recouvrent pas.
alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_micronutrient_source_family_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_micronutrient_source_family_check
  check (
    micronutrient_source is null
    or micronutrient_source ~ '^(interne|ciqual2020|ciqual2025|usda|convention|nul):[a-z0-9_\/]+$'
  );

comment on column public.food_composition_refs.micronutrient_source is
  'La provenance des trois colonnes sodium/sucres/vitamine K, UNE par ligne '
  'parce que les trois valeurs viennent de la même ligne de table. Familles: '
  'interne: (seule re-vérifiable ici, par select) · ciqual2020:<code> · '
  'ciqual2020:libelle · ciqual2025:<code> (table CIQUAL 2025, lue sur '
  'ciqual.anses.fr; codes différents de 2020) · usda:<fdc> · '
  'convention:<motif> · nul:<motif>.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ② LES FROMAGES DU PLATEAU
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Les fromages qu'un modèle nomme en français pour un à-côté « fromage », et
-- que le référentiel ne connaissait pas. Un par ligne CIQUAL « sans
-- précision » quand elle existe (camembert, brie, saint-nectaire, mimolette),
-- la ligne la plus générale sinon (tomme de vache, cantal).
--
-- ⛔ PAS DE `unit_grams`: une « unité » de camembert est la boîte entière
-- (250 g), et le pain et le concombre ont déjà montré ce que coûte une unité
-- qui dépasse la borne d'un à-côté. Le fromage se pèse en grammes.
insert into public.food_composition_refs
  (slug, food_group_ref, label, source, ciqual_code, ciqual_name,
   energy_kcal, protein_g, carbs_g, fat_g, fiber_g,
   omega3_marine, iron_source, calcium_source, iodine_source, zinc_source,
   b12_source, folate_source, yield_class, atwater_discount, energy_dense,
   sodium_mg, sugars_g, micronutrient_source)
values
  ('comte','dairy_cheese','Comté cheese','ciqual','12110','Comté',413,27.8,null,33.8,0,false,false,true,true,true,true,false,'neutral',1,true,403,0,'ciqual2025:12110'),
  ('emmental','dairy_cheese','Emmental cheese','ciqual','12115','Emmental ou emmenthal',373,27.9,null,28.8,0,false,false,true,true,true,true,false,'neutral',1,true,245,null,'ciqual2025:12115'),
  ('camembert','dairy_cheese','Camembert cheese','ciqual','12001','Camembert, sans précision sur le type de lait (pasteurisé ou cru)',280,19.5,null,22.5,0,false,false,true,false,true,true,true,'neutral',1,true,579,null,'ciqual2025:12001'),
  ('brie','dairy_cheese','Brie cheese','ciqual','12020','Brie, sans précision',345,17.6,0.68,30.4,0.056,false,false,true,false,true,true,true,'neutral',1,true,655,0.15,'ciqual2025:12020'),
  ('fresh_goat_cheese','dairy_cheese','Fresh goat cheese','ciqual','12805','Fromage de chèvre frais, type palet, crottin ou bûchette',194,12,2.5,15.2,0.000017,false,false,true,true,false,false,true,'neutral',1,false,377,2.17,'ciqual2025:12805'),
  ('reblochon','dairy_cheese','Reblochon cheese','ciqual','12045','Reblochon',322,20.3,null,26.9,0,false,false,true,false,true,false,false,'neutral',1,true,509,0,'ciqual2025:12045'),
  ('tomme','dairy_cheese','Tomme cheese','ciqual','12758','Tomme ou tome de vache',364,21.6,3.37,29.4,0,false,false,true,false,true,false,false,'neutral',1,true,510,null,'ciqual2025:12758'),
  ('saint_nectaire','dairy_cheese','Saint-Nectaire cheese','ciqual','12752','Saint-Nectaire, sans précision',342,23.5,0.5,27.5,0,false,false,true,true,true,true,false,'neutral',1,true,620,0,'ciqual2025:12752'),
  ('coulommiers','dairy_cheese','Coulommiers cheese','ciqual','12010','Coulommiers',280,18.8,null,23,0.043,false,false,true,true,true,false,false,'neutral',1,true,590,0,'ciqual2025:12010'),
  ('cantal','dairy_cheese','Cantal cheese','ciqual','12724','Cantal',378,25.3,null,31,0,false,false,true,false,false,false,false,'neutral',1,true,768,0.5,'ciqual2025:12724'),
  ('gouda','dairy_cheese','Gouda cheese','ciqual','12736','Gouda',369,24.7,null,30.2,0,false,false,true,true,true,true,false,'neutral',1,true,810,0,'ciqual2025:12736'),
  ('roquefort','dairy_cheese','Roquefort cheese','ciqual','12500','Roquefort (fromage de brebis)',384,19.5,null,33.9,0,false,false,true,true,true,true,false,'neutral',1,true,1290,null,'ciqual2025:12500'),
  ('mimolette','dairy_cheese','Mimolette cheese','ciqual','12740','Mimolette, sans précision',319,25.8,null,24.2,0,false,false,true,false,true,true,false,'neutral',1,true,880,0,'ciqual2025:12740')
on conflict (slug) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ LE CHÈVRE N'EST PLUS DE LA VIANDE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Constat (SELECT du 2026-09-23): `goat_cheese`, libellé « Goat cheese »,
-- portait le code CIQUAL 21800 « Chevreau, cru » — 103 kcal, 20,6 g de
-- protéines, 2,3 g de lipides: de la VIANDE de chevreau, rangée en
-- `dairy_cheese`. Les alias « chevre », « fromage de chevre », « goat
-- cheese », « goats cheese » et « soft goat cheese » y menaient. Un à-côté
-- « chèvre » passait donc le contrôle de groupe et le moteur pesait de la
-- viande.
--
-- ⛔ ON CORRIGE LA LIGNE, PAS LES ALIAS. Le slug et son libellé disent
-- « fromage de chèvre »; ce sont ses NOMBRES qui mentaient. Les corriger
-- répare d'un coup les cinq alias, et le moindre `ref: goat_cheese` écrit par
-- un modèle. La viande a déjà sa propre ligne (`young_goat`, « chevreau cru »).
--
-- ⚠️ « Fromage de chèvre bûche » (12812) ET PAS le chèvre frais: « un
-- chèvre » sur un plateau est la bûche affinée. Le chèvre FRAIS (palet,
-- faisselle, « soft goat cheese ») est une autre ligne (194 kcal), posée en ②
-- sous `fresh_goat_cheese`; l'alias « soft goat cheese » y est redirigé en ⑦.
update public.food_composition_refs
set label = 'Goat cheese, log',
    ciqual_code = '12812',
    ciqual_name = 'Fromage de chèvre bûche',
    energy_kcal = 285,
    protein_g = 18.8,
    carbs_g = null,
    fat_g = 23.3,
    fiber_g = 0,
    iron_source = false,
    calcium_source = true,
    iodine_source = true,
    zinc_source = false,
    b12_source = false,
    folate_source = true,
    energy_dense = true,
    sodium_mg = 630,
    sugars_g = null,
    micronutrient_source = 'ciqual2025:12812'
where slug = 'goat_cheese';

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ L'EMMENTAL RÂPÉ QUITTE LE SAS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `emmental_rape` avait été promu par le sas (une estimation de MODÈLE, donc
-- `a_verifier` par provenance et refusé à la composition). La ligne CIQUAL
-- existe (12118): on la recopie, et la provenance devient `ciqual`.
--
-- ⚠️ La ligne n'existe QUE dans une base où le sas l'a promue au runtime:
-- aucune migration ne la crée. Un `update` seul ne touchait rien ailleurs,
-- et l'alias « grated emmental » du ⑦ tombait sur la clé étrangère. On
-- l'écrit donc si elle manque, et on la corrige si elle est là.
insert into public.food_composition_refs
  (slug, food_group_ref, label, source, ciqual_code, ciqual_name,
   energy_kcal, protein_g, carbs_g, fat_g, fiber_g,
   omega3_marine, iron_source, calcium_source, iodine_source, zinc_source,
   b12_source, folate_source, yield_class, atwater_discount, energy_dense,
   sodium_mg, sugars_g, micronutrient_source)
values
  ('emmental_rape','dairy_cheese','Emmental cheese, grated','ciqual','12118','Emmental ou emmenthal, râpé',368,27.6,0.58,28.2,0.042,false,false,true,false,true,true,false,'neutral',1,true,272,null,'ciqual2025:12118')
on conflict (slug) do update
set label = excluded.label,
    source = excluded.source,
    ciqual_code = excluded.ciqual_code,
    ciqual_name = excluded.ciqual_name,
    energy_kcal = excluded.energy_kcal,
    protein_g = excluded.protein_g,
    carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g,
    fiber_g = excluded.fiber_g,
    iron_source = excluded.iron_source,
    calcium_source = excluded.calcium_source,
    iodine_source = excluded.iodine_source,
    zinc_source = excluded.zinc_source,
    b12_source = excluded.b12_source,
    folate_source = excluded.folate_source,
    energy_dense = excluded.energy_dense,
    sodium_mg = excluded.sodium_mg,
    sugars_g = excluded.sugars_g,
    micronutrient_source = excluded.micronutrient_source;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ LA POIRE, CONFIRMÉE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le lot A (2026-09-11) a marqué `pear` `a_verifier`: la ligne portait le code
-- et les macros du POIREAU. Il a recopié la poire Conférence et écrit « A
-- CONFIRMER: la ligne ANSES générique « Poire, pulpe et peau, crue » et son
-- code ». La voici: CIQUAL 2025, 13037 « Poire, chair et peau, crue ». La
-- poire est le premier fruit de dessert que la liste de secours a dû retirer.
update public.food_composition_refs
set ciqual_code = '13037',
    ciqual_name = 'Poire, chair et peau, crue',
    energy_kcal = 56.6,
    protein_g = 0.36,
    carbs_g = 12.3,
    fat_g = 0.27,
    fiber_g = 2.9,
    iron_source = false,
    calcium_source = false,
    iodine_source = false,
    zinc_source = false,
    b12_source = false,
    folate_source = false,
    energy_dense = false,
    sodium_mg = 1.8,
    sugars_g = 9.75,
    micronutrient_source = 'ciqual2025:13037',
    validation_state = 'verifie',
    validation_reason = '2026-09-23: confirmée sur la table CIQUAL 2025 '
      '(ciqual.anses.fr), code 13037 « Poire, chair et peau, crue », valeurs '
      'recopiées. Lève le a_verifier du lot A du 2026-09-11.',
    validation_decided_on = date '2026-09-23'
where slug = 'pear';

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑥ LE POIDS D'UN POT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sans lui, « 1 yaourt » ne se compte pas: la liste de courses ne peut pas
-- dire « 7 yaourts », et un à-côté « 1 skyr » n'a pas de masse. CIQUAL ne
-- donne pas de portion: ce sont des FORMATS DE RAYON, écrits comme tels.
update public.food_composition_refs
set unit_grams = 125,
    unit_grams_source = 'usage courant: le pot individuel de yaourt nature pèse 125 g'
where slug = 'plain_yogurt' and unit_grams is null;

update public.food_composition_refs
set unit_grams = 150,
    unit_grams_source = 'format: pot individuel de skyr nature 150 g (Carrefour Sensation, Auchan); Danone 140 g'
where slug = 'skyr' and unit_grams is null;

update public.food_composition_refs
set unit_grams = 100,
    unit_grams_source = 'format: pot individuel de fromage blanc nature 100 g (lots de 8 x 100 g, Carrefour Classic)'
where slug = 'fromage_blanc' and unit_grams is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑦ LES FORMES QUE LE MODÈLE ÉCRIT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Écrites repliées (minuscules, sans accent), comme les 2 739 autres: le
-- résolveur replie de toute façon (`normalizeTerm`), et une forme accentuée
-- ici serait une seconde écriture du même alias.
--
-- ⚠️ « soft goat cheese » EST REDIRIGÉ, pas ajouté: il menait à
-- `goat_cheese` avec la note « la ligne Goat cheese est le chevre frais (103
-- kcal) » — c'était la viande. Il mène désormais au chèvre frais.
update public.food_composition_aliases
set slug = 'fresh_goat_cheese',
    note = '2026-09-23: redirigé vers le chèvre frais (CIQUAL 2025 12805); goat_cheese était du chevreau'
where alias = 'soft goat cheese';

insert into public.food_composition_aliases (alias, slug, note) values
  ('comte', 'comte', '2026-09-23 à-côtés'),
  ('comte cheese', 'comte', '2026-09-23 à-côtés'),
  ('emmental', 'emmental', '2026-09-23 à-côtés'),
  ('emmenthal', 'emmental', '2026-09-23 à-côtés'),
  ('emmental cheese', 'emmental', '2026-09-23 à-côtés'),
  ('fromage emmental', 'emmental', '2026-09-23 à-côtés — forme vue au sas'),
  ('emmenthal rape', 'emmental_rape', '2026-09-23 à-côtés'),
  ('grated emmental', 'emmental_rape', '2026-09-23 à-côtés'),
  ('camembert', 'camembert', '2026-09-23 à-côtés'),
  ('camembert cheese', 'camembert', '2026-09-23 à-côtés'),
  ('brie', 'brie', '2026-09-23 à-côtés'),
  ('brie cheese', 'brie', '2026-09-23 à-côtés'),
  ('chevre frais', 'fresh_goat_cheese', '2026-09-23 à-côtés'),
  ('fromage de chevre frais', 'fresh_goat_cheese', '2026-09-23 à-côtés'),
  ('fresh goat cheese', 'fresh_goat_cheese', '2026-09-23 à-côtés'),
  ('buche de chevre', 'goat_cheese', '2026-09-23 à-côtés'),
  ('goat cheese log', 'goat_cheese', '2026-09-23 à-côtés'),
  ('reblochon', 'reblochon', '2026-09-23 à-côtés'),
  ('tomme', 'tomme', '2026-09-23 à-côtés'),
  ('tomme de vache', 'tomme', '2026-09-23 à-côtés'),
  ('saint nectaire', 'saint_nectaire', '2026-09-23 à-côtés'),
  ('coulommiers', 'coulommiers', '2026-09-23 à-côtés'),
  ('cantal', 'cantal', '2026-09-23 à-côtés'),
  ('gouda', 'gouda', '2026-09-23 à-côtés'),
  ('gouda cheese', 'gouda', '2026-09-23 à-côtés'),
  ('roquefort', 'roquefort', '2026-09-23 à-côtés'),
  ('mimolette', 'mimolette', '2026-09-23 à-côtés'),
  -- Le slug existait (CIQUAL « Pain de campagne », mêmes valeurs que la
  -- ligne 7100 de 2025) et AUCUNE forme française n'y menait.
  ('pain de campagne', 'country_style_bread_french', '2026-09-23 à-côtés'),
  ('country bread', 'country_style_bread_french', '2026-09-23 à-côtés')
on conflict (alias) do nothing;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑧ BLOC DE CONTRÔLE — ce que la migration promet, relu en base
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `on conflict do nothing` NE DIT RIEN QUAND IL NE FAIT RIEN. Un alias qui
-- existait déjà vers un AUTRE aliment, ou un slug déjà pris par une autre
-- ligne, passerait en silence. On relit donc la DESTINATION de chaque forme,
-- et les nombres de chaque ligne.
do $$
declare
  v_bad text;
  v_n int;
begin
  -- ① Les treize fromages, chacun à son code et à son énergie.
  select string_agg(e.slug, ', ') into v_bad
  from (values
    ('comte', '12110', 413),
    ('emmental', '12115', 373),
    ('camembert', '12001', 280),
    ('brie', '12020', 345),
    ('fresh_goat_cheese', '12805', 194),
    ('reblochon', '12045', 322),
    ('tomme', '12758', 364),
    ('saint_nectaire', '12752', 342),
    ('coulommiers', '12010', 280),
    ('cantal', '12724', 378),
    ('gouda', '12736', 369),
    ('roquefort', '12500', 384),
    ('mimolette', '12740', 319)
  ) as e(slug, code, kcal)
  left join public.food_composition_refs r on r.slug = e.slug
  where r.slug is null
     or r.food_group_ref <> 'dairy_cheese'
     or r.ciqual_code is distinct from e.code
     or r.energy_kcal is distinct from e.kcal;
  if v_bad is not null then
    raise exception 'référentiel des à-côtés: fromages absents ou différents: %', v_bad;
  end if;

  -- ② Le chèvre n'est plus de la viande.
  select count(*) into v_n from public.food_composition_refs
  where slug = 'goat_cheese' and ciqual_code = '12812'
    and energy_kcal = 285 and food_group_ref = 'dairy_cheese';
  if v_n <> 1 then
    raise exception 'référentiel des à-côtés: goat_cheese n''a pas été corrigé';
  end if;

  -- ③ Chaque forme mène là où la migration le promet.
  select string_agg(e.alias || '→' || coalesce(a.slug, '∅'), ', ') into v_bad
  from (values
    ('chevre', 'goat_cheese'), ('fromage de chevre', 'goat_cheese'),
    ('soft goat cheese', 'fresh_goat_cheese'), ('chevre frais', 'fresh_goat_cheese'),
    ('comte', 'comte'), ('emmental', 'emmental'), ('camembert', 'camembert'),
    ('brie', 'brie'), ('reblochon', 'reblochon'), ('tomme', 'tomme'),
    ('saint nectaire', 'saint_nectaire'), ('coulommiers', 'coulommiers'),
    ('cantal', 'cantal'), ('gouda', 'gouda'), ('roquefort', 'roquefort'),
    ('mimolette', 'mimolette'), ('grated emmental', 'emmental_rape'),
    ('pain de campagne', 'country_style_bread_french')
  ) as e(alias, slug)
  left join public.food_composition_aliases a on a.alias = e.alias
  where a.slug is distinct from e.slug;
  if v_bad is not null then
    raise exception 'référentiel des à-côtés: alias mal dirigés: %', v_bad;
  end if;

  -- ④ Le poids d'un pot, sur les trois laitages.
  select count(*) into v_n from public.food_composition_refs
  where (slug, unit_grams) in (('plain_yogurt', 125), ('skyr', 150), ('fromage_blanc', 100));
  if v_n <> 3 then
    raise exception 'référentiel des à-côtés: % pot(s) pesé(s) sur 3', v_n;
  end if;

  -- ⑤ La poire est confirmée, l'emmental râpé a quitté le sas.
  select count(*) into v_n from public.food_composition_refs
  where (slug = 'pear' and validation_state = 'verifie' and ciqual_code = '13037')
     or (slug = 'emmental_rape' and source = 'ciqual' and ciqual_code = '12118');
  if v_n <> 2 then
    raise exception 'référentiel des à-côtés: poire ou emmental râpé non corrigés (%/2)', v_n;
  end if;

  -- ⑥ Aucun code CIQUAL posé ici n'est partagé: un code sur deux lignes les
  -- fait tomber TOUTES LES DEUX en `a_verifier` (`food_composition_io.ts`).
  select string_agg(ciqual_code, ', ') into v_bad from (
    select ciqual_code from public.food_composition_refs
    where ciqual_code in ('12110', '12115', '12001', '12020', '12805', '12045', '12758', '12752', '12010', '12724', '12736', '12500', '12740', '12812', '12118', '13037')
    group by ciqual_code having count(*) > 1
  ) d;
  if v_bad is not null then
    raise exception 'référentiel des à-côtés: codes CIQUAL partagés: %', v_bad;
  end if;
end;
$$;
