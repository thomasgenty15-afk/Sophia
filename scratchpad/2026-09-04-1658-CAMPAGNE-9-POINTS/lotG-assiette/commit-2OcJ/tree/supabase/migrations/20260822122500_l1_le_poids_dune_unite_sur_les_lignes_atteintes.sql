-- ============================================================================
-- L-1 — LE POIDS D'UNE UNITÉ, SUR LES LIGNES QUE LES PLANS ATTEIGNENT.
--
-- Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L-1`.
--
-- ⛔ CE QUE CETTE MIGRATION TOUCHE, ET RIEN D'AUTRE
-- ------------------------------------------------
-- `food_composition_refs.unit_grams`, plus UNE colonne neuve qui n'existe que
-- pour la porter: `unit_grams_source`. Ni `yield_class`, ni `energy_kcal`, ni
-- `condiment_grams`, ni `atwater_discount`, ni un alias.
--
-- C'est une contrainte de PLAN, pas une pudeur: le lot `L-C` (« les lignes
-- cuites lues comme du cru ») met à jour la MÊME table sur `yield_class` et
-- `energy_kcal`, et le plan impose une seule migration de référentiel à la
-- fois. Ce fichier est écrit pour que `L-C` puisse arriver derrière lui sans
-- rien démêler.
--
-- ⛔ CE QUE LA MESURE A RÉFUTÉ — À LIRE AVANT DE CROIRE AU TITRE DU LOT
-- --------------------------------------------------------------------
-- La fiche `L-1` promettait de faire tomber les lignes « résolues et non
-- pesées » de 25,7 % à 15 % en écrivant des `unit_grams`. LA PRÉMISSE EST
-- FAUSSE, et elle est fausse d'un facteur 70. Mesuré le 2026-08-22 à 12:11
-- CEST (`scripts/keel_l1_non_pesees_20260822.sh`, sortie archivée dans
-- `scratchpad/2026-08-22-L-1-AVANT-non-pesees.txt`), sur 15 644 lignes pliées:
--
--     résolues et NON PESÉES        3 356   (21,5 %)
--       · sans_amount               3 271   (97,5 %)  ⇐ aucune quantité écrite
--       · state_manquant               28
--       · sans_unit                      9
--       · unit_sans_poids               48   (1,4 %)  ⇐ CE QUE CE FICHIER RÉPARE
--
-- `gramsRawOf` ne consulte `unit_grams` QUE lorsque la ligne porte à la fois
-- un `amount` et `unit = 'unit'`. Une ligne sans quantité ne le lit jamais.
-- Or les vingt termes que la fiche citait — `olive oil` ×246, `garlic` ×172,
-- `lemon` ×143 — sont à 100 % des `sans_amount`. Pas un seul n'est réparable
-- par cette colonne, et le seul autre levier (`condiment_grams`) leur est
-- fermé PAR RÈGLE: le lot 0-C (`20260819234000`) a écrit noir sur blanc
-- pourquoi l'ail, le citron, le cube de bouillon, la sauce soja et toutes les
-- huiles en sont refusés. Cette migration ne rouvre aucun de ces refus.
--
-- ⇒ Le seuil de la fiche est MANQUÉ, et il est manqué pour une raison
--   mesurable, pas pour un défaut d'exécution. Le détail est dans la fiche.
--
-- CE QUE CE FICHIER FAIT DONC, ET CE QU'IL VAUT
-- --------------------------------------------
-- Il pose 22 poids d'unité sur des lignes que les plans ATTEIGNENT (207 slugs
-- sur 923 sont atteints; 146 n'avaient pas de `unit_grams`). 12 débloquent une
-- ligne vivante aujourd'hui; 10 sont PRÉVENTIFS et ne changent rien de
-- mesurable — c'est écrit ligne par ligne, aucun n'est présenté comme un gain.
--
-- LA RÈGLE D'ADMISSION — ⛔ ET LE RISQUE QU'ELLE TIENT
-- ---------------------------------------------------
-- Le risque du lot est nommé dans sa fiche: « une masse d'usage fausse PÈSE au
-- lieu de s'abstenir — l'erreur passe de "je ne sais pas" à "je crois savoir" ».
-- Une ligne ne reçoit donc un `unit_grams` que si les trois tiennent:
--
--   ① le calibre est une PROPRIÉTÉ de l'aliment, pas une convention de recette
--      (c'est la règle que `20260812200000` a écrite en refusant le melon);
--   ② la valeur porte sa SOURCE, dans la colonne `unit_grams_source`, et la
--      source appartient à l'une de trois familles VÉRIFIABLES:
--        `interne:` une autre ligne de CE référentiel porte déjà ce calibre
--                   pour le même objet — la source se relit par un `select`;
--        `format:`  un format de rayon DÉJÀ écrit par une migration d'ici;
--        `calibre:` un calibre déclaré, avec sa dérivation écrite sur la ligne;
--   ③ en cas d'ambiguïté, on prend la LECTURE BASSE — la direction que
--      `20260812200000` a fixée et qui n'est pas rouverte ici.
--
-- Ce qui n'entre pas est écrit AUSSI, avec son motif, en bas de ce fichier.
-- Une liste de refus muette est une liste qu'on refait.
--
-- REJOUABLE: des `update` à valeur littérale, gardés par `unit_grams is null`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ① LA COLONNE QUI PORTE LA SOURCE
--
-- C'est la forme du lot 30, qui fait déjà porter `price_fr_source` et
-- `price_us_source` à côté de chaque prix. Une valeur de portion sans source
-- est indiscernable d'un nombre inventé six mois plus tard — et ce référentiel
-- a déjà payé ce genre d'oubli (« 450 g venait de "one plate's worth" »).
-- ---------------------------------------------------------------------------
alter table public.food_composition_refs
  add column if not exists unit_grams_source text;

comment on column public.food_composition_refs.unit_grams_source is
  'D''où vient le poids d''unité. Trois familles: `interne:` (une autre ligne '
  'de cette table porte déjà ce calibre), `format:` (un format de rayon écrit '
  'par une migration de ce dépôt), `calibre:` (un calibre déclaré, avec sa '
  'dérivation). Rendue OBLIGATOIRE dès qu''`unit_grams` est posé, par le CHECK '
  '`food_composition_refs_unit_grams_is_sourced_check` (lot L-1).';

-- ---------------------------------------------------------------------------
-- ② LES 72 VALEURS D'AVANT — marquées pour ce qu'elles sont
--
-- ⛔ ELLES NE SONT PAS SOURCÉES, ET ON NE LEUR INVENTE PAS DE SOURCE.
-- Elles ont été posées par six migrations différentes entre le 2026-08-10 et
-- le 2026-08-19, certaines par un `update` nommé, d'autres à l'intérieur d'un
-- `insert` d'import CIQUAL. Retrouver laquelle a écrit laquelle demanderait de
-- deviner sur les lignes importées — et une attribution devinée est exactement
-- ce que la colonne existe pour empêcher.
--
-- Elles portent donc un marqueur qui DIT qu'elles ne sont pas sourcées. C'est
-- lisible d'un `select`, ça se compte, et ça ne se confond avec aucune des
-- trois familles. Le CHECK ci-dessous peut ainsi être VALIDE pour tout le
-- monde plutôt que `not valid` — un `not valid` aurait exempté ces 72 lignes
-- en silence, et un auditeur aurait conclu que tout est sourcé.
-- ---------------------------------------------------------------------------
update public.food_composition_refs
   set unit_grams_source = 'héritage: posé avant 2026-08-22, source non tracée'
 where unit_grams is not null
   and unit_grams_source is null;

-- ---------------------------------------------------------------------------
-- ③ LES 12 LIGNES QUI DÉBLOQUENT UNE LIGNE VIVANTE
--
-- « Vivante » = une ligne d'ingrédient d'un plan EN BASE porte `unit = 'unit'`
-- et un `amount`, tombe sur cette ligne du référentiel, et `gramsRawOf` rend
-- `null` faute de poids d'unité. Les 28 lignes concernées (40 après pliage)
-- ont été listées une par une avant d'écrire ces valeurs, avec la masse et
-- l'énergie que chacune recevrait: aucune ne rend une masse invraisemblable.
-- ---------------------------------------------------------------------------
update public.food_composition_refs as r
   set unit_grams = v.g, unit_grams_source = v.src
  from (values
  -- ── Légumes à la pièce ────────────────────────────────────────────────────
  ('yellow_onion', 110.0,
   'interne: onion et red_onion portent déjà 110 g dans cette table'),
  ('sweet_pepper_green', 150.0,
   'interne: bell_pepper porte déjà 150 g dans cette table'),
  -- Une tête de chou-fleur pèse plus qu''une tête de brocoli. On écrit quand
  -- même 300 g: c''est l''unité d''achat déjà chiffrée ici, et la LECTURE
  -- BASSE. Se tromper vers le bas sur un légume à 26 kcal/100 g coûte
  -- quelques dizaines de kcal; se tromper vers le haut doublerait le plat.
  ('cauliflower', 300.0,
   'interne: broccoli porte 300 g, même unité d''achat — LECTURE BASSE'),
  ('pak_choi', 100.0,
   'interne: leek porte 100 g, même ordre pour un légume-tige entier — LECTURE BASSE'),
  ('radish', 10.0,
   'interne: chilli porte 10 g, la plus petite pièce déjà écrite ici'),
  -- ── Viande à la pièce ─────────────────────────────────────────────────────
  ('pork_chop', 150.0,
   'interne: beef_steak porte 150 g, famille « une pièce = une portion »'),
  -- ── Conserves — la famille du 400 g égoutté, déjà écrite ──────────────────
  -- `20260812200000` a posé 240 g pour chickpeas_tinned, white_beans et
  -- black_beans: le poids net égoutté d''une boîte de 400 g.
  ('kidney_beans', 240.0,
   'format: boîte de 400 g, poids égoutté 240 g — famille écrite par 20260812200000'),
  -- ⚠️ Le maïs se vend en 198 g ET en 340 g. 240 g est la valeur de la
  -- famille, entre les deux, et l''écart au format réel est borné à ±45 g.
  ('sweetcorn', 240.0,
   'format: conserve égouttée 240 g, même famille que kidney_beans — ⚠️ boîtes de 198 g et 340 g existent'),
  ('coconut_milk', 400.0,
   'format: boîte de 400 ml; tinned_tomatoes porte déjà 400 g pour la même boîte'),
  -- ── Fruits secs et pains ──────────────────────────────────────────────────
  ('prune', 8.0,
   'interne: dates porte 8 g, même objet — un fruit sec à la pièce'),
  ('toasted_bread', 35.0,
   'interne: bread et white_bread portent 35 g — un toast est une tranche'),
  -- ⟳ CETTE LIGNE EST UNE DETTE NOMMÉE PAR `L19b` (20260822113000): en
  -- corrigeant l''alias `baguette` il a écrit qu''il « ÉCHANGE UNE ERREUR
  -- CONTRE UNE ABSTENTION », parce que la ligne visée n''avait pas de
  -- `unit_grams`. La voici.
  ('bread_french_bread_baguette', 250.0,
   'calibre: la baguette de tradition pèse 250 g — dette nommée par la migration 20260822113000')
) as v(slug, g, src)
 where r.slug = v.slug and r.unit_grams is null;

-- ---------------------------------------------------------------------------
-- ④ LES 10 LIGNES PRÉVENTIVES — ⛔ ELLES NE CHANGENT RIEN AUJOURD'HUI
--
-- Aucun plan en base n'écrit « 2 tofu ». Ces valeurs ne débloquent donc AUCUNE
-- ligne mesurable, et il faut le dire ici plutôt que de les compter dans un
-- gain: elles existent parce que les générations de prompt VIVANTES écrivent
-- 2 196 lignes en `unit = 'unit'` (contre 2 135 déjà pesées grâce aux 72
-- valeurs d'avant), et que chaque ligne atteinte sans poids d'unité est une
-- abstention future.
--
-- Elles tiennent la même règle d'admission que les précédentes. Une valeur qui
-- ne tenait pas la règle a été REFUSÉE, pas arrondie — voir ⑥.
-- ---------------------------------------------------------------------------
update public.food_composition_refs as r
   set unit_grams = v.g, unit_grams_source = v.src
  from (values
  -- La valeur était DÉJÀ DÉCIDÉE par le lot 0-C, qui s'en servait pour refuser
  -- le cube de la classe des condiments (« un cube pèse ~10 g. Refusé par ① »).
  -- Elle n'était simplement jamais entrée en base.
  ('stock_cube', 10.0,
   'interne: « un cube pèse ~10 g », écrit par la migration 20260819234000 pour le REFUSER des condiments'),
  ('ham', 30.0,
   'calibre: une tranche de jambon blanc de rayon pèse 30 g'),
  ('smoked_salmon', 25.0,
   'calibre: une tranche de saumon fumé pèse 25 g'),
  -- Le slug NOMME déjà la tranche: l'unité n'est pas ambiguë.
  ('turkey_ham_slices', 20.0,
   'calibre: une tranche de blanc de dinde pèse 20 g — le slug nomme la tranche'),
  ('tofu', 250.0,
   'format: le bloc de tofu de rayon pèse 250 g'),
  ('halloumi', 225.0,
   'format: le bloc de halloumi de rayon pèse 225 g'),
  ('olives', 4.0,
   'calibre: une olive dénoyautée pèse 4 g'),
  ('tomato_cherry', 10.0,
   'calibre: une tomate cerise pèse 10 g; tomato porte 100 g pour la tomate entière'),
  ('wheat_crackers', 7.0,
   'interne: crispbread_rye et corn_cake portent 10 g; un cracker est plus petit — LECTURE BASSE'),
  ('parsnip', 100.0,
   'interne: leek porte 100 g, carrot 70 g; un panais est entre les deux — LECTURE BASSE')
) as v(slug, g, src)
 where r.slug = v.slug and r.unit_grams is null;

-- ---------------------------------------------------------------------------
-- ⑤ LES TROIS GARDES — la base refuse ce que le commentaire promet
-- ---------------------------------------------------------------------------

-- ⓐ UNE VALEUR SANS SOURCE NE RENTRE PLUS.
-- C'est la traduction en base de la ligne `risque` de la fiche. Sans ce CHECK,
-- « les valeurs portent leur source » serait une intention, et la prochaine
-- migration qui pose un `unit_grams` nu passerait sans que rien ne morde.
alter table public.food_composition_refs
  add constraint food_composition_refs_unit_grams_is_sourced_check
  check (unit_grams is null or unit_grams_source is not null);

-- ⓑ AUCUNE DES 22 LIGNES NE PORTE DE `condiment_grams`.
-- Poser un `unit_grams` sur un condiment CHANGERAIT sa masse: `gramsRawOf`
-- rendrait une valeur, et `condimentMassFor` — qui n'intervient qu'après un
-- `null` — cesserait d'être consulté. Une convention ARMÉE serait remplacée
-- par un calibre deviné, en silence. Les herbes fraîches sont dans ce cas et
-- elles sont refusées pour ça (⑥).
do $$
declare conflits text;
begin
  select string_agg(slug, ', ' order by slug) into conflits
    from public.food_composition_refs
   where unit_grams_source is not null
     and unit_grams_source not like 'héritage:%'
     and condiment_grams is not null;
  if conflits is not null then
    raise exception 'L-1: unit_grams posé sur une ligne à condiment_grams: %', conflits;
  end if;
end $$;

-- ⓒ LES 22 LIGNES SONT BIEN ARRIVÉES.
-- La leçon de `V0-B-bis`: un `update` qui ne touche aucune ligne rend `UPDATE 0`
-- et ne dit rien. Un slug mal orthographié ici passerait inaperçu, et la mesure
-- APRÈS l'imputerait au corpus.
do $$
declare manquants text; poses int;
begin
  select string_agg(s, ', ' order by s) into manquants
    from unnest(array[
      'yellow_onion','sweet_pepper_green','cauliflower','pak_choi','radish',
      'pork_chop','kidney_beans','sweetcorn','coconut_milk','prune',
      'toasted_bread','bread_french_bread_baguette','stock_cube','ham',
      'smoked_salmon','turkey_ham_slices','tofu','halloumi','olives',
      'tomato_cherry','wheat_crackers','parsnip'
    ]) as s
   where not exists (
     select 1 from public.food_composition_refs r
      where r.slug = s and r.unit_grams is not null
        and r.unit_grams_source is not null
        and r.unit_grams_source not like 'héritage:%'
   );
  if manquants is not null then
    raise exception 'L-1: unit_grams absent après migration: %', manquants;
  end if;

  select count(*) into poses from public.food_composition_refs
   where unit_grams is not null;
  if poses <> 94 then
    raise exception 'L-1: % lignes portent unit_grams, 94 attendues (72 + 22)', poses;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ⑥ CE QUI EST REFUSÉ, ET POURQUOI — ⛔ LA MOITIÉ QUI SE PERD SI ON NE L'ÉCRIT PAS
--
-- Chacune de ces lignes est ATTEINTE par un plan et n'a pas de `unit_grams`.
-- Aucune n'entre, et le motif est ici pour qu'un lot suivant n'ait pas à le
-- redécouvrir — ou pire, à conclure à un oubli.
--
--   melon              ⛔ REFUSÉ PAR `20260812200000`, EN TOUTES LETTRES:
--                      « 1 melon va de 400 g à 2 kg selon la variété, et un
--                      chiffre posé au milieu serait un nombre inventé ». Le
--                      refus est plus vieux que ce lot et il est reconduit.
--   fruit              slug GÉNÉRIQUE. « 1 fruit » n'a pas de calibre: c'est
--                      une catégorie, pas un aliment.
--   cabbage ·          un chou entier pèse ~1 kg. La lecture haute ferait
--   white_cabbage ·    entrer 360 kcal de faux sur un plat; la lecture basse
--   red_cabbage        n'a aucune borne défendable. On s'abstient.
--   mackerel           « tinned mackerel » désigne la BOÎTE, le slug désigne
--                      le POISSON. Deux calibres (une boîte de 120 g, un filet
--                      de 90 g) pour un seul mot: hors de la règle ①.
--   beef_mince ·       une viande hachée se pèse, elle ne se compte pas. Le
--   turkey_mince ·     « unit » écrit par le modèle est une ERREUR DE FORME,
--   lamb               pas un calibre manquant. Lui donner un poids
--                      d'unité rendrait cette erreur invisible.
--   noodles            ⚠️ DIFFÉRÉ À `L-C`, pas refusé: la ligne porte
--                      104 kcal/100 g en `grain_absorbs`, c'est-à-dire une
--                      valeur CUITE lue comme du cru (« ×3,3 trop léger », fiche
--                      `L-C`). Poser un poids de nid dessus multiplierait
--                      l'erreur au lieu de la corriger.
--   goat_cheese        format ambigu: le crottin fait 60 g, la bûche 150 g.
--                      Aucune lecture basse défendable entre les deux.
--   herbs_parsley ·    ⛔ ELLES SONT DÉJÀ PESÉES, par `condiment_grams` (lot
--   herbs_coriander ·  0-C). Leur poser un `unit_grams` REMPLACERAIT une
--   herbs_basil ·      convention armée par un calibre deviné — voir la garde
--   herbs_mint         ⓑ ci-dessus, qui refuse ce geste en base.
--   soy_sauce ·        ⛔ REFUSÉS PAR LE LOT 0-C, qui a écrit pourquoi: « des
--   vinegar ·          sauces qu'on sert à la cuillère, pas qu'on pince ». Le
--   mustard ·          refus portait sur `condiment_grams`; il vaut ici aussi,
--   hot_sauce ·        pour la même raison: ces lignes ne se comptent pas à
--   curry_paste        l'unité.
--   olive_oil ·        les 246 lignes d'huile sans quantité NE SONT PAS un
--   toutes les huiles  problème d'unité: elles n'ont pas d'`amount` du tout.
--                      `unweighedEnergyDense` doit continuer à éteindre leur
--                      plat, et c'est la contre-épreuve du lot 0-C.
-- ---------------------------------------------------------------------------
