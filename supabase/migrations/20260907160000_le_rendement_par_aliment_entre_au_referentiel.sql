-- ============================================================================
-- LE RENDEMENT PAR ALIMENT ENTRE AU RÉFÉRENTIEL — 2026-09-07
--
-- Chantier : `docs/keel/METHODE-GENERATION-DE-PLAN-SOLO.md`, section
-- « Cru et cuit ». Lot 1 du plan solo.
--
-- ⛔ CE QUE CETTE MIGRATION TOUCHE, ET RIEN D'AUTRE
-- ------------------------------------------------
-- DEUX COLONNES NEUVES sur `food_composition_refs` — `yield_factor` et
-- `yield_factor_source` — trois CHECK, le COMMENTAIRE de `yield_class`, et
-- SIX lignes seedées. Ni `energy_kcal`, ni les macros, ni `yield_class`
-- lui-même, ni `unit_grams`, ni un prix, ni un alias.
--
-- Le facteur par CLASSE (`YIELD_FACTORS`, `food_composition.ts:48`) n'est ni
-- supprimé ni déplacé : il devient la table de SECOURS. `NULL` ici veut dire
-- « retombe sur la classe », et c'est le cas de 919 lignes sur 925.
--
-- ============================================================================
-- ⛔ POURQUOI SIX LIGNES ET PAS VINGT-HUIT — LIS ÇA AVANT DE « COMPLÉTER »
-- ============================================================================
--
-- Le plan nommait 28 slugs à remplir : 8 céréales, 2 légumineuses, 10 légumes,
-- 6 viandes, 2 poissons. Il posait aussi la règle qui a décidé du résultat :
--
--     « Chaque valeur transcrite d'une table nommée […] ; source introuvable
--       ⇒ la ligne reste NULL. »
--
-- ⓐ LES SIX VIANDES SONT TRANSCRITES, une par une, d'une table réelle :
--    **USDA Table of Cooking Yields for Meat and Poultry, Release 2**
--    (Roseland, Nguyen, Williams, Patterson, Showell, Pehrsson — Nutrient Data
--    Laboratory, Beltsville Human Nutrition Research Center, ARS/USDA,
--    septembre 2014). Fichier :
--    `https://www.ars.usda.gov/ARSUserFiles/80400535/Data/retn/USDA_CookingYields_MeatPoultry02.xlsx`
--    — 175 lignes, colonne « Cooking Yield % » = poids CUIT en % du poids CRU.
--    Chaque valeur ci-dessous cite son **numéro NDB** et sa méthode de cuisson.
--    Le facteur EST le pourcentage divisé par 100 : aucune conversion, aucune
--    moyenne, aucun arrondi maison.
--
-- ⓑ LES DEUX POISSONS RESTENT NULL. Cette table couvre « meat and poultry » et
--    ne porte **aucune** ligne de poisson (vérifié : 0 sur 175). `salmon` et
--    `cod` gardent donc le facteur de classe (0,8). Inventer un rendement de
--    poisson « parce qu'on est dans le lot » serait exactement le geste que
--    `L-C` a payé cher.
--
-- ⓒ LES CÉRÉALES, LÉGUMINEUSES ET LÉGUMES RESTENT NULL — vingt lignes. Leur
--    source désignée est l'**USDA Agriculture Handbook 102, « Food Yields
--    Summarized by Different Stages of Preparation »** (éd. 1975). Elle
--    existe, elle est la bonne, et elle n'est disponible qu'en fac-similé
--    numérisé : il n'en existe aucune version lisible par machine à cette
--    date. Transcrire de mémoire des rendements de riz et d'épinards serait
--    écrire vingt nombres inventés sur la grandeur que le couvercle affiche.
--
--    ⚠️ ET C'EST LA POPULATION QUI COMPTE LE PLUS. Le doc dit que l'écart de
--    classe est le plus grossier précisément là : « riz, pâtes, semoule,
--    quinoa partagent 2,6 quand des pâtes font plutôt 2,2 ; tous les légumes
--    font 0,9 quand des épinards ou des champignons perdent 30 à 40 % ». Ce
--    lot livre donc la MÉCANIQUE complète et la plus petite part de la
--    matière. Le reste demande la table, pas une session de plus.
--
-- ============================================================================
-- ⛔ CE QUE LES TROIS CHECK TIENNENT, ET POURQUOI CHACUN EXISTE
-- ============================================================================
--
-- ① `_yield_factor_is_sourced_check` — un facteur sans source ne rentre pas.
--    Précédent exact : `20260822122500:216` (`unit_grams_is_sourced_check`).
--    Sans lui, « les valeurs portent leur source » serait une intention.
--
-- ② `_yield_factor_source_family_check` — la source appartient à une famille
--    FERMÉE. Précédent : `20260822165500:200`. Une sixième famille inventée en
--    passant rendrait la colonne aussi muette que son absence.
--    ⚠️ Le motif interdit l'espace : une source est un JETON, pas une phrase.
--
-- ③ `_yield_factor_agrees_with_class_check` — LE PLUS IMPORTANT, et il protège
--    du code qui n'est PAS dans ce lot :
--
--      · `neutral ⇒ facteur = 1,0`. `meal_cost.ts:411` définit
--        `cooked_label_dry_input` comme « libellé cuit ET rendement = 1,0 » et
--        **111 prix** sont posés dessus. Ce CHECK est la raison pour laquelle
--        `meal_cost` peut rester sur la CLASSE sans jamais diverger.
--      · `*_shrinks ⇒ facteur < 1` et `*_absorbs ⇒ facteur > 1`. C'est ce qui
--        rend sûr de laisser `stateMattersFor` (`food_composition.ts:74`) sur
--        la classe : une classe non neutre garde un facteur ≠ 1, donc l'état
--        reste EXIGÉ. Un `veg_shrinks` à qui on poserait 1,0 par aliment
--        accepterait soudain un `state` absent tout en divisant par 1 — un
--        aliment qui change de règle sans que personne l'ait demandé.
--      · borné à `(0, 6]`. Un facteur nul ou négatif ferait une division par
--        zéro dans `gramsRawOf`; 6 est très au-dessus de tout rendement
--        plausible (le plus haut du produit est 2,6).
--
--    ⛔ ET IL A UNE CONSÉQUENCE QU'IL FAUT ÉCRIRE : les quatre lignes qui
--    RÉHYDRATENT — `potato_flakes`, `potato_flakes_milk_cream`,
--    `shiitake_mushroom`, `tapioca` — sont en `veg_shrinks` alors qu'elles
--    gagnent de l'eau. Ce CHECK **leur refuse** un facteur > 1. Ce n'est pas
--    un trou : elles demandent d'abord un changement de CLASSE, c'est-à-dire
--    la fiche `L-C-b`, et pas ce lot-ci. Écrit ici pour que la prochaine
--    session ne perde pas une heure à comprendre le refus.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- ⓐ LA GARDE D'ENTRÉE — les six lignes portent-elles la classe attendue ?
--
-- ⛔ Elle existe parce que ce dépôt a déjà mesuré le contraire : `L-C` a
-- déplacé 57 `yield_class` le 2026-08-22, et trois lots ont touché cette table
-- le même jour. Si `yield_class` a bougé sur une de ces six lignes depuis la
-- mesure, le facteur transcrit ne s'accorde plus à sa classe et le CHECK ③
-- lèvera — mieux vaut s'arrêter ici, en nommant la ligne.
-- ---------------------------------------------------------------------------
do $$
declare ecart text;
begin
  select string_agg(v.slug || ' (base=' || r.yield_class || ', attendu=' || v.attendu || ')', ', ')
    into ecart
  from (values
    ('chicken_breast', 'meat_shrinks'),
    ('chicken_thigh',  'meat_shrinks'),
    ('beef_mince',     'meat_shrinks'),
    ('beef_braising',  'meat_shrinks'),
    ('pork_loin',      'meat_shrinks'),
    ('pork_chop',      'meat_shrinks')
  ) as v(slug, attendu)
  join public.food_composition_refs r on r.slug = v.slug
  where r.yield_class <> v.attendu;
  if ecart is not null then
    raise exception 'rendement: yield_class deplace depuis la mesure: %', ecart;
  end if;

  -- ⛔ ET LE MIROIR: un slug de la liste qui n'existerait plus. Une liste qui
  -- nomme un absent est une liste qui a l'air complète et ne l'est pas.
  select string_agg(v.slug, ', ') into ecart
  from (values
    ('chicken_breast'), ('chicken_thigh'), ('beef_mince'),
    ('beef_braising'), ('pork_loin'), ('pork_chop')
  ) as v(slug)
  left join public.food_composition_refs r on r.slug = v.slug
  where r.slug is null;
  if ecart is not null then
    raise exception 'rendement: slug absent du referentiel: %', ecart;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ⓑ LES DEUX COLONNES
-- ---------------------------------------------------------------------------
alter table public.food_composition_refs
  add column if not exists yield_factor numeric;
alter table public.food_composition_refs
  add column if not exists yield_factor_source text;

comment on column public.food_composition_refs.yield_factor is
  'Le rendement cru → cuit de CET aliment: grammes cuits pour 1 gramme cru. '
  'NULL = pas de mesure pour cette ligne ⇒ repli sur le facteur de la CLASSE. '
  'Lu par yieldFactorOf() dans _shared/keel/food_composition.ts, et par elle '
  'seule. Ne corrige PAS les calories (elles se comptent sur les grammes '
  'crus), à une exception nommée: nutrientsOf multiplie par le rendement pour '
  'imputer 12 % d''huile de friture sur un plat FRIT.';
comment on column public.food_composition_refs.yield_factor_source is
  'D''où vient le facteur. Jeton « famille:référence », famille fermée par '
  'CHECK. usda_yields = USDA Table of Cooking Yields for Meat and Poultry '
  'Release 2 (2014), la référence est le numéro NDB et la méthode. '
  'usda_ah102 = Agriculture Handbook 102. Un facteur sans source est REFUSÉ.';

-- ⛔ LE COMMENTAIRE DE `yield_class` MENTAIT À PARTIR D'AUJOURD'HUI. Il disait
-- « le FACTEUR vit dans food_composition.ts » — c'était vrai, et ce lot le rend
-- faux à moitié. Le corriger ici, plutôt que de laisser deux affirmations
-- contradictoires dans la même table (précédent: §⑨ n° 54 du plan L-C).
comment on column public.food_composition_refs.yield_class is
  'La classe de rendement cru→cuit. C''est la table de SECOURS: le facteur de '
  'la classe (YIELD_FACTORS, _shared/keel/food_composition.ts) s''applique '
  'quand yield_factor est NULL — le cas de la grande majorité des lignes. '
  'Une seule lecture résout les deux: yieldFactorOf(ref). La classe reste '
  'SEULE maîtresse de deux décisions: stateMattersFor (un état est-il exigé) '
  'et la grille de prix de meal_cost.ts, toutes deux tenues par le CHECK '
  'yield_factor_agrees_with_class.';

-- ---------------------------------------------------------------------------
-- ⓒ LES TROIS CHECK — `drop if exists` d'abord: une migration doit pouvoir
-- être relue sur une base qui a déjà vu une version antérieure du lot.
-- ---------------------------------------------------------------------------
alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_yield_factor_is_sourced_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_yield_factor_is_sourced_check
  check (yield_factor is null or yield_factor_source is not null);

alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_yield_factor_source_family_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_yield_factor_source_family_check
  check (
    yield_factor_source is null
    or yield_factor_source ~ '^(usda_yields|usda_ah102|anses|interne|convention):[a-z0-9_/.-]+$'
  );

alter table public.food_composition_refs
  drop constraint if exists food_composition_refs_yield_factor_agrees_with_class_check;
alter table public.food_composition_refs
  add constraint food_composition_refs_yield_factor_agrees_with_class_check
  check (
    yield_factor is null
    or (
      yield_factor > 0 and yield_factor <= 6
      and case yield_class
        when 'neutral'        then yield_factor = 1.0
        when 'grain_absorbs'  then yield_factor > 1
        when 'legume_absorbs' then yield_factor > 1
        when 'meat_shrinks'   then yield_factor < 1
        when 'fish_shrinks'   then yield_factor < 1
        when 'veg_shrinks'    then yield_factor < 1
        else false
      end
    )
  );

-- ---------------------------------------------------------------------------
-- ⓓ LES SIX VALEURS, TRANSCRITES UNE PAR UNE
--
-- Colonne « Cooking Yield % » de la table USDA, divisée par 100. Le libellé du
-- référentiel est rappelé en commentaire pour que le CHOIX de la ligne USDA
-- soit relisible — c'est le seul endroit où un jugement humain intervient, et
-- il doit être visible.
--
-- ⚠️ `where yield_factor is null`: ce lot ne réécrit JAMAIS une valeur déjà
-- posée. Si une session voisine en a écrit une, elle gagne, et la garde de
-- sortie le dira.
-- ---------------------------------------------------------------------------
update public.food_composition_refs r
   set yield_factor = v.f, yield_factor_source = v.src
  from (values
    -- « Chicken breast » ⇒ blanc de poulet rôti au four, avec peau.
    ('chicken_breast', 0.72, 'usda_yields:ndb_5060/baked_or_roasted'),
    -- « Chicken thigh » ⇒ cuisse rôtie au four. (La ligne braisée, NDB 5677,
    -- donne 68 % — l'écart entre les deux méthodes est d'un point.)
    ('chicken_thigh',  0.69, 'usda_yields:ndb_5094/baked_or_roasted'),
    -- « Beef mince (5%) » ⇒ le libellé DIT 5 % de matière grasse: c'est la
    -- bande « low fat (<12%) », pas la moyenne des trois bandes. Steak haché
    -- grillé. (Pan-broiled, NDB 23564, donnerait 77 %.)
    ('beef_mince',     0.73, 'usda_yields:ndb_23563/broiled_or_grilled'),
    -- « Braising beef » ⇒ paleron/macreuse braisé. NDB 13373 est le
    -- « chuck, arm pot roast » braisé, la coupe à braiser par excellence.
    ('beef_braising',  0.71, 'usda_yields:ndb_13373/braised'),
    -- « Pork loin » ⇒ rôti de longe avec os.
    ('pork_loin',      0.77, 'usda_yields:ndb_10039/baked_or_roasted'),
    -- « Pork chop » ⇒ côte de longe avec os, poêlée.
    ('pork_chop',      0.76, 'usda_yields:ndb_10179/pan_fried')
  ) as v(slug, f, src)
 where r.slug = v.slug and r.yield_factor is null;

-- ---------------------------------------------------------------------------
-- ⓔ LES GARDES DE SORTIE — la base refuse ce que l'en-tête promet
-- ---------------------------------------------------------------------------
do $$
declare n int; d text;
begin
  -- ① exactement six lignes portent un facteur, et ce sont les six nommées.
  select count(*) into n from public.food_composition_refs where yield_factor is not null;
  if n <> 6 then
    raise exception 'rendement: % ligne(s) avec facteur, 6 attendues', n;
  end if;
  select string_agg(slug, ', ' order by slug) into d
    from public.food_composition_refs
   where yield_factor is not null
     and slug not in ('chicken_breast','chicken_thigh','beef_mince','beef_braising','pork_loin','pork_chop');
  if d is not null then
    raise exception 'rendement: facteur pose hors de la liste publiee: %', d;
  end if;

  -- ② aucun facteur sans source (le CHECK ① le tient déjà; on le MESURE ici,
  --    parce qu'une contrainte qu'aucune ligne n'exerce n'a jamais été armée).
  select count(*) into n from public.food_composition_refs
   where yield_factor is not null and yield_factor_source is null;
  if n <> 0 then raise exception 'rendement: % facteur(s) sans source', n; end if;

  -- ③ toutes les sources sont de la famille usda_yields, et portent un NDB.
  select count(*) into n from public.food_composition_refs
   where yield_factor_source is not null
     and yield_factor_source !~ '^usda_yields:ndb_[0-9]+/[a-z_]+$';
  if n <> 0 then raise exception 'rendement: % source(s) hors forme NDB', n; end if;

  -- ④ ⛔ LA DISTRIBUTION DES CLASSES N'A PAS BOUGÉ. C'est la garde qui prouve
  --    que ce lot n'a touché AUCUN `yield_class` — la colonne dont dépendent
  --    `stateMattersFor` et les 111 prix.
  select string_agg(yield_class || '=' || c, ', ' order by yield_class) into d
    from (select yield_class, count(*) c from public.food_composition_refs group by 1) t;
  if d <> 'fish_shrinks=13, grain_absorbs=13, legume_absorbs=2, meat_shrinks=289, neutral=530, veg_shrinks=78' then
    raise exception 'rendement: distribution des classes changee: %', d;
  end if;

  -- ⑤ les quatre lignes qui réhydratent n'ont PAS reçu de facteur (elles ne
  --    peuvent pas en recevoir; on vérifie que personne n'a contourné).
  select count(*) into n from public.food_composition_refs
   where slug in ('potato_flakes','potato_flakes_milk_cream','shiitake_mushroom','tapioca')
     and yield_factor is not null;
  if n <> 0 then raise exception 'rendement: % ligne(s) rehydratante(s) ont un facteur', n; end if;
end $$;

commit;

-- ============================================================================
-- ROLLBACK_DU_CONTROLE — ce que la base REFUSE maintenant, à rejouer à la main
--
-- ⛔ Chacune de ces trois doit LEVER. Une garde qu'on n'a jamais vue mordre
-- est une garde dont on ne sait pas si elle est branchée — ce dépôt le paie en
-- boucle. Copier-coller dans psql, une par une:
--
--   -- ① un facteur nu, sans source ⇒ refusé par _is_sourced_check
--   update public.food_composition_refs set yield_factor = 0.75 where slug = 'cod';
--
--   -- ② 2,6 sur une ligne neutre ⇒ refusé par _agrees_with_class_check
--   --    (c'est la protection des 111 prix de meal_cost.ts)
--   update public.food_composition_refs
--      set yield_factor = 2.6, yield_factor_source = 'usda_ah102:x'
--    where slug = 'olive_oil';
--
--   -- ③ 0,9 sur une classe qui absorbe ⇒ refusé par _agrees_with_class_check
--   update public.food_composition_refs
--      set yield_factor = 0.9, yield_factor_source = 'usda_ah102:x'
--    where slug = 'white_rice';
--
--   -- ④ une source hors famille ⇒ refusée par _source_family_check
--   update public.food_composition_refs
--      set yield_factor = 0.75, yield_factor_source = 'de memoire, a peu pres'
--    where slug = 'cod';
--
--   -- ⑤ et la contre-épreuve: une valeur BIEN formée passe. Sans elle, une
--   --    garde cassée qui refuse TOUT ressemblerait à une garde qui marche.
--   update public.food_composition_refs
--      set yield_factor = 0.8, yield_factor_source = 'usda_yields:ndb_1/braised'
--    where slug = 'cod';
--   -- puis: update … set yield_factor = null, yield_factor_source = null where slug='cod';
-- ============================================================================
