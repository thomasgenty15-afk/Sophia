-- ============================================================================
-- « RECOMMENDED FOOD » — LE COACH PARLE EN ALIMENTS, LE PIPELINE EN GROUPES
-- ============================================================================
-- Autorité: docs/nutrition-pivot/PROMPT-COACH-PROTOCOL.md, docs/keel/MODEL.md.
-- Suite directe de `20260805100000_coach_protocol_mapping.sql`, qu'elle ne
-- remplace pas: elle pose la couche que le coach TOUCHE, au-dessus de celle que
-- le pipeline LIT.
--
-- ── LE DÉFAUT MESURÉ ──────────────────────────────────────────────────────
-- L'écran `/coach/protocol` demandait au coach une posture sur 30 GROUPES
-- abstraits (« matière grasse ajoutée », « légumes non féculents »). Un coach
-- ne pense pas comme ça: il pense « huile de coco », « carotte », « saumon ».
-- Trente cases abstraites, c'est peu de choix ET c'est illisible — les deux
-- reproches à la fois.
--
-- ── LA LIGNE DE PARTAGE: GRAMMAIRE vs OPINION ─────────────────────────────
-- C'est la décision structurante de ce lot, et tout le reste en découle.
--
--   `food_items` (GLOBAL, curé) porte la GRAMMAIRE d'un aliment:
--     à quel groupe il appartient, et SUR QUEL AXE on le compte.
--     « une huile se compte en millilitres, pas en portions » est un fait de
--     mesure. Ça ne dit RIEN sur le fait qu'elle soit bonne.
--
--   `coach_food_items` (PAR COACH) porte l'OPINION:
--     posture, fréquence, et le pourquoi.
--     Huile de coco et huile d'avocat ont la MÊME grammaire (`volume`, ml) et
--     peuvent porter des opinions opposées. C'est exactement le cas qui a
--     motivé ce découpage.
--
-- Aucune colonne de `food_items` n'exprime un jugement — à une exception
-- assumée, `default_why`, traitée plus bas.
--
-- ── POURQUOI LE VOCABULAIRE FERMÉ N'EST PAS TOUCHÉ ────────────────────────
-- `food_groups` garde ses 30 slugs et sa FK. Le prompt de vision les énumère,
-- `parseFoodGroupRef` rejette l'inconnu, et c'est CETTE fermeture qui rend la
-- jointure photo↔méthode possible sans modèle. Un aliment n'est donc jamais un
-- slug de groupe: il PORTE un `food_group_ref`, et la posture de groupe que
-- lit le compilateur est DÉRIVÉE de ce que le coach coche
-- (`_shared/keel/food_items.ts`, pur et testé).
--
-- ⚠️ CONSÉQUENCE QU'IL FAUT DIRE, ET QUI EST ÉCRITE À L'ÉCRAN
-- -----------------------------------------------------------
-- Une règle de fréquence PAR ALIMENT n'est PAS vérifiable sur une photo.
-- L'analyse photo rend des GROUPES; elle ne saura jamais dire « c'était de
-- l'huile de coco » plutôt que « de la matière grasse ajoutée ». Donc:
--
--   * les postures de GROUPE (dérivées) = ce que Sophia VÉRIFIE dans l'assiette;
--   * les règles par ALIMENT             = ce que Sophia CONSTRUIT et DIT
--     (générateur de repas, plan de semaine, réponses de l'agent).
--
-- Compiler une règle d'aliment en règle de groupe (« max 2 portions de matière
-- grasse ajoutée » pour « max 2 c. à s. d'huile de coco ») donnerait au coach
-- une garantie fausse. On ne le fait pas, et l'écran le dit.
--
-- ── `default_why`: L'EXCEPTION, ASSUMÉE, ET SES GARDE-FOUS ────────────────
-- Un « pourquoi » livré par KEEL et affiché sous le nom du coach fait de KEEL
-- l'autorité nutritionnelle — ce que ce produit existe pour ne pas être
-- (`coachProtocol.ts`: « des préréglages de STRUCTURE et jamais de CONTENU »).
-- Arbitrage produit du 2026-08-05, pris en connaissance de cause: le
-- pré-remplissage reste, parce qu'un champ vide sur 115 aliments ne serait
-- jamais rempli et que le coach sera d'accord l'essentiel du temps.
--
-- Trois garde-fous le rendent tenable, et ils sont structurels:
--
--   1. `default_why` décrit un RÔLE DANS L'ASSIETTE, jamais un effet sur la
--      santé. « De la fibre et du volume pour peu d'énergie » se discute;
--      « fait baisser le cholestérol » est une allégation médicale et n'a rien
--      à faire ici. Aucune ligne de ce fichier n'en contient.
--   2. Rien n'atteint un élève avant PUBLICATION, qui est un geste explicite du
--      coach avec son diff. Un texte non retouché mais publié est un texte
--      qu'il a validé.
--   3. `why_source` trace l'origine. L'écriture IA est conditionnée
--      (`where why_source <> 'coach'`), donc une régénération ne peut pas
--      écraser ce que le coach a écrit. Ce dépôt a déjà payé ce défaut exact
--      sur la carte de défense.
-- ============================================================================


-- ============================================================================
-- LE CATALOGUE — global, curé, sans opinion (à `default_why` près)
-- ============================================================================
-- POURQUOI `label` EN COLONNE ET PAS UN `label_i18n_key` comme `food_groups`.
-- Les libellés de GROUPE entrent dans des phrases compilées que l'élève lit
-- traduites — ils appartiennent donc à la couche i18n. Un libellé d'ALIMENT
-- n'apparaît que dans le sélecteur du coach, à côté des aliments qu'il ajoute
-- lui-même, qui sont du texte libre par nature. Mettre 115 clés dans `en.ts`
-- transformerait un jeu de DONNÉES en table de traduction, et obligerait toute
-- migration ajoutant un aliment à embarquer un changement de front pour être
-- lisible. Le catalogue est de la donnée.
create table if not exists public.food_items (
  slug text primary key,

  -- Le rattachement au vocabulaire fermé. C'est lui qui fait tourner le
  -- pipeline; il n'est JAMAIS silencieux à l'écran.
  food_group_ref text not null references public.food_groups(slug),

  label text not null check (length(btrim(label)) between 1 and 80),
  content_locale text not null default 'en-GB',

  -- L'AXE DE COMPTAGE — le cœur de ce lot.
  --   portion : « 3 portions par semaine »        (la plupart des aliments)
  --   volume  : « 30 ml par semaine »             (huiles, boissons)
  --   count   : « 2 par jour »                    (œufs, fruits à l'unité)
  -- C'est ce qui fait qu'une huile ne se règle pas comme une carotte, sans
  -- qu'aucune des deux ne soit jugée.
  count_axis text not null check (count_axis in ('portion', 'volume', 'count')),

  -- Ce que vaut UNE unité de l'axe. Facultatif: le catalogue n'est pas une
  -- table nutritionnelle, il n'a pas à connaître la masse de tout.
  typical_amount numeric check (typical_amount > 0),
  typical_unit text check (typical_unit in ('g', 'ml', 'unit')),

  -- Le pourquoi pré-rempli. RÔLE DANS L'ASSIETTE, jamais allégation de santé.
  default_why text,

  sort_order int not null default 100,

  created_at timestamptz not null default now(),

  -- Un axe `volume` qui n'annonce pas des millilitres est un axe que le rendu
  -- ne sait pas phraser: « 30 g d'huile par semaine » n'est pas ce que le
  -- coach a en tête, et rien en aval ne saurait le convertir.
  constraint food_items_volume_is_ml check (
    count_axis <> 'volume' or typical_unit = 'ml'
  )
);

create index if not exists food_items_group_idx
  on public.food_items (food_group_ref, sort_order, slug);


-- ============================================================================
-- LES ALIMENTS DU COACH — sa liste, sa fréquence, son pourquoi
-- ============================================================================
-- NEUTRE = ABSENCE DE LIGNE, comme pour `coach_food_rules`. Un aliment sur
-- lequel le coach n'a pas d'avis n'a pas de ligne; 115 lignes par coach pour
-- n'en vouloir dire que douze rendrait « je n'ai pas d'avis » indistinguable
-- de « je n'ai pas fini ».
--
-- La ligne vit sur le PROTOCOLE et pas sur le coach: c'est de la méthode, donc
-- ça se versionne et ça se publie. (`coach_terms`, à l'inverse, est un lexique
-- et vit bien au niveau du coach — les deux ne sont pas la même chose.)
create table if not exists public.coach_food_items (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.coach_protocols(id) on delete cascade,
  -- Dénormalisé pour que la RLS reste une comparaison locale; le trigger
  -- `coach_rule_matches_protocol` (20260805100000) garantit l'accord.
  coach_id uuid not null references public.coaches(id) on delete cascade,

  -- L'aliment du catalogue, ou NULL quand c'est un aliment que le coach a
  -- ajouté lui-même. Les deux cas coexistent dans la même liste, exprès: à
  -- l'écran il n'y a qu'une liste d'aliments, pas « les nôtres » et « les
  -- vôtres ».
  food_item_ref text references public.food_items(slug),

  -- Recopié du catalogue à la création, ou saisi par le coach. Dénormalisé
  -- pour que la ligne reste lisible si un item de catalogue disparaît, et
  -- parce qu'un coach peut vouloir son propre mot pour un aliment connu.
  label text not null check (length(btrim(label)) between 1 and 80),

  -- Le rattachement au vocabulaire fermé. Sur un ajout du coach il est
  -- PROPOSÉ (par `coach-protocol-v1`), jamais imposé en silence: l'écran
  -- affiche « traité comme <groupe> » et le coach corrige.
  food_group_ref text not null references public.food_groups(slug),

  -- Même vocabulaire que `coach_food_rules.stance`, et ce n'est pas un hasard:
  -- la posture de groupe en est DÉRIVÉE. Deux échelles différentes rendraient
  -- la dérivation arbitraire.
  stance text not null check (stance in ('encouraged', 'discouraged', 'excluded')),

  -- --- LA RÈGLE DE FRÉQUENCE, facultative, à gabarits FERMÉS ---------------
  -- NULL = aucune règle, et c'est le cas de l'écrasante majorité. Un aliment
  -- coché sans fréquence ni pourquoi est une ligne parfaitement valide: le
  -- panneau se remplit si le coach en a envie.
  --
  -- R5: les trous sont des COLONNES typées, jamais du jsonb. R6: chaque valeur
  -- est lue par une branche NOMMÉE côté rendu et côté générateur.
  frequency_template text check (frequency_template in (
    -- [au moins | au plus] [N] [portions | g | ml | unités] par [jour | semaine]
    'amount_per_period',
    -- à chaque repas
    'every_meal',
    -- pas après [heure]
    'not_after',
    -- au [petit-déjeuner | déjeuner | dîner | ...]
    'at_slot'
  )),
  direction text check (direction in ('at_least', 'at_most')),
  amount numeric check (amount > 0),
  amount_unit text check (amount_unit in ('portion', 'g', 'ml', 'unit')),
  period text check (period in ('day', 'week')),
  cutoff_local time,
  slot_key text references public.slot_vocabulary(key),

  -- --- LE POURQUOI --------------------------------------------------------
  why text,
  -- D'OÙ IL VIENT. `coach` est un cliquet: l'écriture IA est conditionnée
  -- dessus (`where why_source <> 'coach'`), donc une régénération ne peut pas
  -- écraser une édition du coach. C'est la garde structurelle, pas une
  -- convention côté client.
  why_source text not null default 'coach'
    check (why_source in ('seeded', 'ai', 'coach')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- COHÉRENCE PAR GABARIT: chaque gabarit exige SES trous et INTERDIT les
  -- autres. Sans elle, une ligne `every_meal` pourrait traîner un
  -- `cutoff_local` que rien ne lirait — le coach aurait écrit une heure que
  -- Sophia n'appliquerait jamais. Motif: `coach_timing_rules_slots_match_template`.
  --
  -- ⚠️ Le nom ÉVITE `coach_food_items_frequency_template_check`, que Postgres
  -- génère tout seul pour le `check` de la colonne `frequency_template`
  -- (`<table>_<colonne>_check`). La collision fait échouer le CREATE TABLE
  -- entier — mesuré sur `coach_timing_rules` au lot précédent.
  constraint coach_food_items_slots_match_frequency check (
    (frequency_template is null
      and direction is null and amount is null and amount_unit is null
      and period is null and cutoff_local is null and slot_key is null)
    or
    (frequency_template = 'amount_per_period'
      and direction is not null and amount is not null
      and amount_unit is not null and period is not null
      and cutoff_local is null and slot_key is null)
    or
    (frequency_template = 'every_meal'
      and direction is null and amount is null and amount_unit is null
      and period is null and cutoff_local is null and slot_key is null)
    or
    (frequency_template = 'not_after'
      and cutoff_local is not null
      and direction is null and amount is null and amount_unit is null
      and period is null and slot_key is null)
    or
    (frequency_template = 'at_slot'
      and slot_key is not null
      and direction is null and amount is null and amount_unit is null
      and period is null and cutoff_local is null)
  )
);

create index if not exists coach_food_items_protocol_idx
  on public.coach_food_items (protocol_id);

-- UN ALIMENT, UNE FOIS, PAR PROTOCOLE.
-- `food_item_ref` étant nullable, un index unique nu laisserait passer deux
-- lignes « olive oil » ajoutées à la main. On norme donc sur la référence
-- quand elle existe, sur le libellé replié sinon — deux postures sur le même
-- aliment se dériveraient en deux postures de groupe contradictoires, et le
-- coach en recevrait une au hasard de l'ordre de lecture.
create unique index if not exists coach_food_items_unique_per_protocol_idx
  on public.coach_food_items (
    protocol_id,
    coalesce(food_item_ref, lower(btrim(label)))
  );


-- ============================================================================
-- ACCORD coach_id ↔ protocol_id — la fonction existe déjà, on la réutilise
-- ============================================================================
-- Écrire un second trigger équivalent créerait deux implémentations d'une même
-- garantie, qui divergeraient au premier changement.
drop trigger if exists coach_food_items_owner_check on public.coach_food_items;
create trigger coach_food_items_owner_check
  before insert or update on public.coach_food_items
  for each row execute function public.coach_rule_matches_protocol();


-- ============================================================================
-- RLS
-- ============================================================================
alter table public.food_items       enable row level security;
alter table public.coach_food_items enable row level security;

-- Le catalogue est un vocabulaire de référence: lisible par tout authentifié,
-- écrit par personne (aucune policy d'écriture ⇒ service_role only, comme
-- `food_groups_read`). Il grandit par migration, curé, globalement.
drop policy if exists food_items_read on public.food_items;
create policy food_items_read on public.food_items
  for select to authenticated using (true);

-- Le coach est propriétaire de SES lignes. L'élève n'a aucune policy ici: il
-- ne lit jamais le protocole brut, il reçoit ce que le compilateur en dérive.
drop policy if exists coach_food_items_coach_all on public.coach_food_items;
create policy coach_food_items_coach_all on public.coach_food_items
  for all to authenticated
  using (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  )
  with check (
    coach_id in (
      select c.id from public.coaches c
      where c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );


-- ============================================================================
-- PRIVILÈGES — `revoke from public` laisse `anon` debout
-- ============================================================================
-- Les default privileges Supabase accordent à `anon` sur toute table neuve du
-- schéma public. Vérification: has_table_privilege sur 'anon', jamais 'public'.
revoke all on public.coach_food_items from anon;
revoke all on public.food_items       from anon;


-- ============================================================================
-- LE CATALOGUE — ~115 aliments
-- ============================================================================
-- POURQUOI ~115 ET PAS 300. Chaque aliment porte un panneau dépliable
-- (fréquence + pourquoi). Trois cents aliments × un panneau, c'est une corvée
-- déguisée en écran. ~115 (3 à 8 par groupe) couvrent la quasi-totalité des
-- assiettes réelles; le « + » prend la queue de distribution, et c'est là que
-- l'IA de classement gagne sa place.
--
-- `default_why` — lire l'en-tête. Rôle dans l'assiette, jamais allégation de
-- santé, jamais de chiffre d'énergie ou de macro (le produit refuse les cibles
-- chiffrées par construction: `meal_generation.ts`, garantie 1).
insert into public.food_items
  (slug, food_group_ref, label, count_axis, typical_amount, typical_unit, sort_order, default_why)
values
  -- ── PROTÉINES ───────────────────────────────────────────────────────────
  ('turkey_breast',   'lean_protein', 'Turkey breast',   'portion', 120, 'g',    10, 'A lean anchor that leaves room on the plate for everything else.'),
  ('pork_loin',       'lean_protein', 'Pork loin',       'portion', 120, 'g',    20, 'A lean anchor when the usual ones are getting boring.'),
  ('whey_protein',    'lean_protein', 'Whey protein',    'portion', 30,  'g',    30, 'A way to hit a protein anchor when there was no time to cook one.'),

  ('salmon',          'fatty_fish',   'Salmon',          'portion', 140, 'g',    10, 'An oily fish that most people will actually eat twice a week.'),
  ('mackerel',        'fatty_fish',   'Mackerel',        'portion', 140, 'g',    20, 'Cheap oily fish — tinned counts, which is what makes it repeatable.'),
  ('sardines',        'fatty_fish',   'Sardines',        'portion', 100, 'g',    30, 'Store-cupboard oily fish, no cooking, no excuse.'),
  ('trout',           'fatty_fish',   'Trout',           'portion', 140, 'g',    40, 'A milder oily fish for people who say they do not like fish.'),

  ('cod',             'white_fish',   'Cod',             'portion', 140, 'g',    10, 'A light protein anchor for evenings when a heavy plate is not wanted.'),
  ('haddock',         'white_fish',   'Haddock',         'portion', 140, 'g',    20, 'Interchangeable with cod — useful when one of the two is expensive.'),
  ('sea_bass',        'white_fish',   'Sea bass',        'portion', 140, 'g',    30, 'A white fish that survives being cooked plainly.'),

  ('prawns',          'shellfish',    'Prawns',          'portion', 100, 'g',    10, 'Cooks in three minutes, which is often the whole problem solved.'),
  ('mussels',         'shellfish',    'Mussels',         'portion', 100, 'g',    20, 'A protein anchor that turns a plate into a proper meal.'),
  ('squid',           'shellfish',    'Squid',           'portion', 100, 'g',    30, 'A change of texture when chicken has become the default.'),

  ('chicken_breast',  'poultry',      'Chicken breast',  'portion', 120, 'g',    10, 'The default anchor — it works, and it is why it gets boring.'),
  ('chicken_thigh',   'poultry',      'Chicken thigh',   'portion', 120, 'g',    20, 'More forgiving than breast, and harder to ruin.'),
  ('turkey_mince',    'poultry',      'Turkey mince',    'portion', 120, 'g',    30, 'Batch-cooks well, which is what makes a week repeatable.'),
  ('duck_breast',     'poultry',      'Duck breast',     'portion', 120, 'g',    40, 'A richer plate for the meal that is meant to feel like one.'),

  ('beef_steak',      'red_meat',     'Beef steak',      'portion', 120, 'g',    10, 'A dense anchor for a plate that has to hold for a long evening.'),
  ('beef_mince',      'red_meat',     'Beef mince',      'portion', 120, 'g',    20, 'The base of the meals people already know how to cook.'),
  ('lamb',            'red_meat',     'Lamb',            'portion', 120, 'g',    30, 'A richer red meat, usually for the weekend plate.'),
  ('pork_chop',       'red_meat',     'Pork chop',       'portion', 120, 'g',    40, 'A quick red-meat anchor that does not need a recipe.'),

  ('whole_eggs',      'eggs',         'Eggs',            'count',   50,  'unit', 10, 'The fastest protein anchor in the house, at any time of day.'),
  ('egg_whites',      'eggs',         'Egg whites',      'volume',  30,  'ml',   20, 'A way to add to an anchor without adding to the plate.'),

  ('tofu',            'tofu_tempeh',  'Tofu',            'portion', 100, 'g',    10, 'A plant anchor that takes on whatever it is cooked with.'),
  ('tempeh',          'tofu_tempeh',  'Tempeh',          'portion', 100, 'g',    20, 'A firmer plant anchor for people who find tofu too soft.'),
  ('seitan',          'tofu_tempeh',  'Seitan',          'portion', 100, 'g',    30, 'A chewy plant anchor — closest thing to meat texture.'),

  -- ── LÉGUMINEUSES ────────────────────────────────────────────────────────
  ('lentils',         'legumes',      'Lentils',         'portion', 150, 'g',    10, 'Fills a plate and holds an evening together at almost no cost.'),
  ('chickpeas',       'legumes',      'Chickpeas',       'portion', 150, 'g',    20, 'Tinned, drained, done — the least demanding thing in the cupboard.'),
  ('black_beans',     'legumes',      'Black beans',     'portion', 150, 'g',    30, 'Turns a small amount of meat into a full plate.'),
  ('kidney_beans',    'legumes',      'Kidney beans',    'portion', 150, 'g',    40, 'The bean most people already have a recipe for.'),
  ('white_beans',     'legumes',      'White beans',     'portion', 150, 'g',    50, 'Creamy enough to carry a plate without a sauce.'),
  ('green_peas',      'legumes',      'Peas',            'portion', 150, 'g',    60, 'Frozen, always there, and nobody has to plan for them.'),
  ('edamame',         'legumes',      'Edamame',         'portion', 150, 'g',    70, 'A legume that gets eaten as a snack, which is rare and useful.'),

  -- ── PRODUITS LAITIERS ───────────────────────────────────────────────────
  ('greek_yogurt',    'dairy_yogurt', 'Greek yogurt',    'portion', 150, 'g',    10, 'A protein anchor that needs no cooking and no decision.'),
  ('plain_yogurt',    'dairy_yogurt', 'Plain yogurt',    'portion', 150, 'g',    20, 'A base that takes whatever fruit is in the house.'),
  ('skyr',            'dairy_yogurt', 'Skyr',            'portion', 150, 'g',    30, 'Thicker than yogurt, and it holds someone until the next meal.'),
  ('kefir',           'dairy_yogurt', 'Kefir',           'volume',  200, 'ml',   40, 'A drinkable version for people who will not sit down to eat.'),
  ('cottage_cheese',  'dairy_yogurt', 'Cottage cheese',  'portion', 150, 'g',    50, 'A savoury protein anchor for people who do not want sweet.'),

  ('parmesan',        'dairy_cheese', 'Parmesan',        'portion', 30,  'g',    10, 'A little of it makes plain vegetables get eaten.'),
  ('feta',            'dairy_cheese', 'Feta',            'portion', 30,  'g',    20, 'Turns a salad into something someone looks forward to.'),
  ('cheddar',         'dairy_cheese', 'Cheddar',         'portion', 30,  'g',    30, 'The cheese that is already in the fridge.'),
  ('mozzarella',      'dairy_cheese', 'Mozzarella',      'portion', 30,  'g',    40, 'Mild enough to add without taking the plate over.'),
  ('goat_cheese',     'dairy_cheese', 'Goat cheese',     'portion', 30,  'g',    50, 'A strong flavour, so a small amount does the work.'),

  -- ── CÉRÉALES ────────────────────────────────────────────────────────────
  ('oats',            'whole_grain',  'Oats',            'portion', 60,  'g',    10, 'A breakfast that can be decided the night before.'),
  ('brown_rice',      'whole_grain',  'Brown rice',      'portion', 150, 'g',    20, 'Batch-cooks, keeps, and carries the rest of the plate.'),
  ('quinoa',          'whole_grain',  'Quinoa',          'portion', 150, 'g',    30, 'A grain that also brings a protein anchor with it.'),
  ('wholemeal_bread', 'whole_grain',  'Wholemeal bread', 'count',   40,  'g',    40, 'Bread is not going anywhere — this is the version worth having.'),
  ('wholewheat_pasta','whole_grain',  'Wholewheat pasta','portion', 150, 'g',    50, 'The weeknight meal people will actually cook.'),
  ('buckwheat',       'whole_grain',  'Buckwheat',       'portion', 150, 'g',    60, 'A change from rice, and it is naturally gluten free.'),
  ('barley',          'whole_grain',  'Barley',          'portion', 150, 'g',    70, 'Holds a soup together and makes it a meal.'),

  ('white_rice',      'refined_grain','White rice',      'portion', 150, 'g',    10, 'Easy to digest, which matters more on some days than others.'),
  ('white_bread',     'refined_grain','White bread',     'count',   40,  'g',    20, 'The bread most people are actually eating.'),
  ('white_pasta',     'refined_grain','White pasta',     'portion', 150, 'g',    30, 'Fast, cheap, and it is what is in the cupboard.'),
  ('couscous',        'refined_grain','Couscous',        'portion', 150, 'g',    40, 'Ready in five minutes with a kettle.'),

  -- ── LÉGUMES ─────────────────────────────────────────────────────────────
  ('potato',          'starchy_veg',  'Potato',          'portion', 150, 'g',    10, 'Filling, cheap, and nobody needs to be taught how to cook it.'),
  ('sweet_potato',    'starchy_veg',  'Sweet potato',    'portion', 150, 'g',    20, 'A starch that gets eaten without a sauce to make it work.'),
  ('butternut_squash','starchy_veg',  'Butternut squash','portion', 150, 'g',    30, 'Roasts once and feeds three meals.'),
  ('sweetcorn',       'starchy_veg',  'Sweetcorn',       'portion', 150, 'g',    40, 'Frozen or tinned, it makes a plate look finished.'),
  ('beetroot',        'starchy_veg',  'Beetroot',        'portion', 150, 'g',    50, 'Pre-cooked and ready, which is why it gets used.'),

  ('broccoli',        'cruciferous_veg','Broccoli',      'portion', 80,  'g',    10, 'The vegetable most people will eat without negotiating.'),
  ('cauliflower',     'cruciferous_veg','Cauliflower',   'portion', 80,  'g',    20, 'Takes on flavour, so it survives a plain plate.'),
  ('brussels_sprouts','cruciferous_veg','Brussels sprouts','portion',80, 'g',    30, 'Roasted rather than boiled, and the argument is over.'),
  ('cabbage',         'cruciferous_veg','Cabbage',       'portion', 80,  'g',    40, 'Keeps for weeks, which makes it the vegetable of a bad week.'),
  ('kale',            'cruciferous_veg','Kale',          'portion', 80,  'g',    50, 'Holds up in a pan without collapsing to nothing.'),

  ('spinach',         'leafy_greens', 'Spinach',         'portion', 80,  'g',    10, 'Wilts into almost anything without changing the meal.'),
  ('rocket',          'leafy_greens', 'Rocket',          'portion', 80,  'g',    20, 'A handful turns a plate into a plate with a salad on it.'),
  ('lettuce',         'leafy_greens', 'Lettuce',         'portion', 80,  'g',    30, 'The bulk that makes a lunch feel like enough.'),
  ('swiss_chard',     'leafy_greens', 'Swiss chard',     'portion', 80,  'g',    40, 'A sturdier green when spinach disappears in the pan.'),

  ('carrot',          'non_starchy_veg','Carrot',        'portion', 80,  'g',    10, 'Volume and fibre for very little, raw or cooked, all year round.'),
  ('courgette',       'non_starchy_veg','Courgette',     'portion', 80,  'g',    20, 'Bulks out a plate without anyone noticing it is there.'),
  ('bell_pepper',     'non_starchy_veg','Bell pepper',   'portion', 80,  'g',    30, 'Colour and crunch, and it gets eaten raw between meals.'),
  ('tomato',          'non_starchy_veg','Tomato',        'portion', 80,  'g',    40, 'Already in every kitchen, and it needs no preparation.'),
  ('cucumber',        'non_starchy_veg','Cucumber',      'portion', 80,  'g',    50, 'Volume with no effort — the vegetable of a rushed lunch.'),
  ('mushroom',        'non_starchy_veg','Mushrooms',     'portion', 80,  'g',    60, 'Savoury enough to make a smaller piece of meat feel like more.'),
  ('onion',           'non_starchy_veg','Onion',         'portion', 80,  'g',    70, 'The reason a plain meal tastes like it was cooked.'),
  ('green_beans',     'non_starchy_veg','Green beans',   'portion', 80,  'g',    80, 'Frozen, four minutes, and the plate has a vegetable on it.'),

  -- ── FRUITS ──────────────────────────────────────────────────────────────
  ('blueberries',     'berries',      'Blueberries',     'portion', 125, 'g',    10, 'Frozen works, so this one survives a week nobody planned.'),
  ('strawberries',    'berries',      'Strawberries',    'portion', 125, 'g',    20, 'The fruit people eat instead of being told to.'),
  ('raspberries',     'berries',      'Raspberries',     'portion', 125, 'g',    30, 'Sharp enough to finish a meal without wanting something sweet after.'),

  ('orange',          'citrus',       'Orange',          'count',   150, 'g',    10, 'Portable, no washing up, and it ends a meal.'),
  ('lemon',           'citrus',       'Lemon',           'count',   60,  'g',    20, 'Makes plain food taste like it was seasoned.'),
  ('grapefruit',      'citrus',       'Grapefruit',      'count',   200, 'g',    30, 'A breakfast that is not sweet, for people who do not want sweet.'),
  ('clementine',      'citrus',       'Clementine',      'count',   80,  'g',    40, 'The fruit that fits in a coat pocket.'),

  ('banana',          'other_fruit',  'Banana',          'count',   120, 'g',    10, 'The food that gets eaten when there was no time to eat.'),
  ('apple',           'other_fruit',  'Apple',           'count',   150, 'g',    20, 'Keeps for a week and needs nothing done to it.'),
  ('kiwi',            'other_fruit',  'Kiwi',            'count',   80,  'g',    30, 'Small, sharp, and it finishes a plate.'),
  ('mango',           'other_fruit',  'Mango',           'portion', 150, 'g',    40, 'Sweet enough to replace the thing someone was going to have instead.'),
  ('grapes',          'other_fruit',  'Grapes',          'portion', 150, 'g',    50, 'Eaten by the handful, which cuts both ways — say which you mean.'),
  ('avocado',         'other_fruit',  'Avocado',         'count',   100, 'g',    60, 'Makes a plain plate satisfying, and it does it quickly.'),

  -- ── MATIÈRES GRASSES ────────────────────────────────────────────────────
  ('almonds',         'nuts_seeds',   'Almonds',         'portion', 30,  'g',    10, 'A handful holds someone between two meals.'),
  ('walnuts',         'nuts_seeds',   'Walnuts',         'portion', 30,  'g',    20, 'Goes into a salad or a bowl of yogurt without a recipe.'),
  ('peanut_butter',   'nuts_seeds',   'Peanut butter',   'portion', 30,  'g',    30, 'Easy to love and easy to lose count of — a good place for a rule.'),
  ('chia_seeds',      'nuts_seeds',   'Chia seeds',      'portion', 15,  'g',    40, 'Thickens a breakfast that was made the night before.'),
  ('pumpkin_seeds',   'nuts_seeds',   'Pumpkin seeds',   'portion', 30,  'g',    50, 'Adds crunch to a plate that would otherwise be soft.'),
  ('cashews',         'nuts_seeds',   'Cashews',         'portion', 30,  'g',    60, 'The nut people snack on, so it is worth having a view on it.'),

  ('extra_virgin_olive_oil','olive_oil','Extra virgin olive oil','volume', 15, 'ml', 10, 'The default cooking and dressing fat in most kitchens.'),

  ('butter',          'other_added_fat','Butter',        'volume',  15,  'ml',   10, 'It is going in anyway — the question is how much.'),
  ('coconut_oil',     'other_added_fat','Coconut oil',   'volume',  15,  'ml',   20, 'A strong flavour and a fat that adds up fast — count it in millilitres.'),
  ('avocado_oil',     'other_added_fat','Avocado oil',   'volume',  15,  'ml',   30, 'Takes high heat without smoking, which is what it is for.'),
  ('rapeseed_oil',    'other_added_fat','Rapeseed oil',  'volume',  15,  'ml',   40, 'The neutral everyday oil most people already cook with.'),
  ('sunflower_oil',   'other_added_fat','Sunflower oil', 'volume',  15,  'ml',   50, 'The cheapest oil on the shelf, and the one in most processed food.'),
  ('ghee',            'other_added_fat','Ghee',          'volume',  15,  'ml',   60, 'Butter that takes heat — same amounts, same question.'),

  -- ── DISCRÉTIONNAIRE ─────────────────────────────────────────────────────
  ('mayonnaise',      'sauce_dressing','Mayonnaise',     'volume',  30,  'ml',   10, 'A spoonful changes a plate more than anything else on it.'),
  ('ketchup',         'sauce_dressing','Ketchup',        'volume',  30,  'ml',   20, 'Small amounts, often — worth saying where you stand.'),
  ('soy_sauce',       'sauce_dressing','Soy sauce',      'volume',  15,  'ml',   30, 'Salt in liquid form, and it makes plain food get eaten.'),
  ('vinaigrette',     'sauce_dressing','Vinaigrette',    'volume',  30,  'ml',   40, 'What makes a salad a meal someone chooses.'),
  ('pesto',           'sauce_dressing','Pesto',          'volume',  30,  'ml',   50, 'Turns plain pasta into dinner in one spoon.'),

  ('dark_chocolate',  'sugar_sweets', 'Dark chocolate',  'portion', 30,  'g',    10, 'The small planned thing that stops the unplanned one.'),
  ('biscuits',        'sugar_sweets', 'Biscuits',        'count',   15,  'g',    20, 'Eaten standing up, and rarely one — a good place for a rule.'),
  ('ice_cream',       'sugar_sweets', 'Ice cream',       'portion', 100, 'g',    30, 'An evening habit more often than a dessert.'),
  ('honey',           'sugar_sweets', 'Honey',           'volume',  15,  'ml',   40, 'Sugar that feels like it is not, so it goes uncounted.'),

  ('chips_fries',     'fried_food',   'Chips / fries',   'portion', 100, 'g',    10, 'The side that decides what the rest of the plate was for.'),
  ('fried_chicken',   'fried_food',   'Fried chicken',   'portion', 100, 'g',    20, 'A protein anchor wrapped in the thing you were avoiding.'),
  ('crisps',          'fried_food',   'Crisps',          'portion', 30,  'g',    30, 'Eaten from the bag, so portions are not really the unit.'),

  -- ── BOISSONS ────────────────────────────────────────────────────────────
  ('beer',            'alcohol',      'Beer',            'volume',  330, 'ml',   10, 'Volume and habit — it is the second one that matters.'),
  ('wine',            'alcohol',      'Wine',            'volume',  150, 'ml',   20, 'A glass with dinner is a routine, not an event.'),
  ('spirits',         'alcohol',      'Spirits',         'volume',  40,  'ml',   30, 'Small measures, usually alongside something sweet.'),

  ('cola',            'sweetened_beverage','Cola',       'volume',  330, 'ml',   10, 'Sugar you drink without it registering as eating.'),
  ('fruit_juice',     'sweetened_beverage','Fruit juice','volume',  250, 'ml',   20, 'Reads as fruit, drinks like a soft drink.'),
  ('energy_drink',    'sweetened_beverage','Energy drink','volume', 250, 'ml',   30, 'Caffeine and sugar together, usually to patch a bad night.'),
  ('sports_drink',    'sweetened_beverage','Sports drink','volume', 500, 'ml',   40, 'Made for sessions that most days are not.'),

  ('still_water',     'water',        'Water',           'volume',  250, 'ml',   10, 'The one that fixes the afternoon nobody blamed on thirst.'),
  ('sparkling_water', 'water',        'Sparkling water', 'volume',  250, 'ml',   20, 'What people drink instead when the alternative was a soft drink.'),

  ('coffee',          'coffee_tea',   'Coffee',          'count',   250, 'ml',   10, 'Rarely the problem — the time of the last one sometimes is.'),
  ('black_tea',       'coffee_tea',   'Black tea',       'count',   250, 'ml',   20, 'A warm drink with a fraction of the caffeine.'),
  ('green_tea',       'coffee_tea',   'Green tea',       'count',   250, 'ml',   30, 'The afternoon drink for someone who wants to stop at one coffee.'),
  ('herbal_tea',      'coffee_tea',   'Herbal tea',      'count',   250, 'ml',   40, 'Something to hold in the evening that is not a snack.')
on conflict (slug) do nothing;
