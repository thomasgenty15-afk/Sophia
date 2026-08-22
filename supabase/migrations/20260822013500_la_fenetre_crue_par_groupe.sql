-- ═══════════════════════════════════════════════════════════════════════════
-- LA FENÊTRE CRUE — UNE VALEUR PAR GROUPE, ET `anon` LÂCHE `food_groups`
-- Lot `L0-a`, 2026-08-22.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── LE DÉFAUT QUE CETTE COLONNE FERME ────────────────────────────────────
-- La conservation, c'est DEUX fenêtres qui se chaînent:
--
--     achat ──[ FENÊTRE CRUE ]──► cuisson ──[ FENÊTRE CUITE ]──► dernière part
--
-- `MAX_FRIDGE_DAYS = 3` (`_shared/keel/meal_generation.ts`) ne couvrait que la
-- SECONDE. La première n'avait **aucune constante, aucune colonne, aucun
-- lecteur** — et `grocery_waves.ts:211` accordait donc TROIS JOURS À TOUT pour
-- fixer la date de courses. Mesuré sur le cas 04: le poulet attendait trois
-- jours cru, alors qu'une volaille fraîche en tient un à deux. Le plan était
-- déclaré valide et il ne l'était pas.
--
-- ── LE SENS DE LA COLONNE, ÉCRIT ICI POUR QUE PERSONNE NE LE DEVINE ──────
-- C'est un ÉCART MAXIMAL entre l'ACHAT et la CUISSON, pas une durée de vie:
-- `2` veut dire « acheté lundi, cuisiné lundi, mardi ou mercredi ». C'est
-- exactement le sens qu'avait déjà `MAX_FRIDGE_DAYS` en
-- `grocery_waves.ts:211` (`earliest = cuisson − MAX_FRIDGE_DAYS`): ce lot
-- remplace un nombre UNIQUE par un nombre PAR GROUPE, il ne change pas la
-- façon dont ce fichier le lit.
--
-- ⚠️ CE SONT DES ORDRES DE GRANDEUR ASSUMÉS, pas des mesures — même posture
-- que `YIELD_FACTORS` dans `food_composition.ts`, et c'est écrit pour que
-- personne ne les lise comme une donnée sourcée. Elles viennent des cinq
-- familles de la fiche `L0-a`: poisson ~1 j · volaille et viande hachée ~2 j ·
-- viande en pièce ~3 j · légumes frais ~7 j · œufs, secs et conserves ~très
-- long, étendues aux trente groupes.
--
-- ⚠️ AU-DELÀ DE SEPT, LA VALEUR NE MORD JAMAIS: une fenêtre de plan fait au
-- plus sept jours (`MAX_WINDOW_DAYS`). Tout ce qui est « très long » est donc
-- écrit **21** — un seul nombre pour « ça ne contraint rien », plutôt que dix
-- valeurs inventées qu'on croirait mesurées.
--
-- ⛔ LE MIROIR CÔTÉ CODE EST `RAW_WINDOW_DAYS` dans
-- `_shared/keel/fridge_window.ts`, exactement comme `FOOD_GROUP_REFS` est le
-- miroir du seed des trente lignes. `fridge_window_test.ts` porte un test PAR
-- GROUPE, avec des littéraux: un groupe ajouté sans fenêtre crue rougit.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.food_groups
  add column if not exists raw_window_days smallint;

update public.food_groups set raw_window_days = v.days
from (values
  -- ── PROTÉINES ANIMALES: la famille qui a motivé le lot ────────────────
  ('fatty_fish',          1),   -- poisson: le jour même ou le lendemain
  ('white_fish',          1),
  ('shellfish',           1),   -- la plus courte de toutes
  ('poultry',             2),   -- volaille fraîche: le cas 04, mot pour mot
  ('lean_protein',        2),   -- viande maigre et hachée: le haché s'oxyde
  ('red_meat',            3),   -- viande en pièce: la valeur historique
  ('eggs',               21),
  ('tofu_tempeh',         5),   -- sous vide, DLC courte mais pas une chair
  ('legumes',            21),   -- sec ou conserve
  -- ── LAITAGES ──────────────────────────────────────────────────────────
  ('dairy_yogurt',        7),
  ('dairy_cheese',       14),
  -- ── CÉRÉALES: sec, donc hors sujet ────────────────────────────────────
  ('whole_grain',        21),
  ('refined_grain',      21),
  -- ── LÉGUMES: « frais ~7 j », sauf la feuille, qui est le cas fragile ──
  ('leafy_greens',        3),   -- salades et herbes, et c'est déjà optimiste
  ('cruciferous_veg',     7),
  ('non_starchy_veg',     7),
  ('starchy_veg',        14),   -- pomme de terre, courge: semaines, pas jours
  -- ── FRUITS ────────────────────────────────────────────────────────────
  ('berries',             3),   -- aussi fragiles qu'une salade
  ('citrus',             14),
  ('other_fruit',         7),
  -- ── MATIÈRES GRASSES ──────────────────────────────────────────────────
  ('nuts_seeds',         21),
  ('olive_oil',          21),
  ('other_added_fat',    14),   -- beurre, crème
  -- ── DISCRÉTIONNAIRE ───────────────────────────────────────────────────
  ('sauce_dressing',     21),
  ('sugar_sweets',       21),
  ('fried_food',          1),   -- un fritté se mange le jour où il est fait
  -- ── BOISSONS ──────────────────────────────────────────────────────────
  ('alcohol',            21),
  ('sweetened_beverage', 21),
  ('water',              21),
  ('coffee_tea',         21)
) as v(slug, days)
where public.food_groups.slug = v.slug;

-- ⛔ `not null` APRÈS le seed, et c'est la garde: si un slug de la liste
-- ci-dessus ne correspondait à aucune ligne, ou si un groupe de la table
-- manquait à la liste, cette contrainte ÉCHOUE et la migration s'arrête. Une
-- colonne à moitié remplie ressemblerait à une colonne remplie.
alter table public.food_groups
  alter column raw_window_days set not null;

alter table public.food_groups
  drop constraint if exists food_groups_raw_window_days_check;
alter table public.food_groups
  add constraint food_groups_raw_window_days_check
  check (raw_window_days >= 0 and raw_window_days <= 60);

comment on column public.food_groups.raw_window_days is
  'Écart MAXIMAL en jours entre l''achat et la cuisson pour ce groupe, cru. '
  '2 = acheté lundi, cuisiné lundi, mardi ou mercredi. Lu par '
  '`_shared/keel/grocery_waves.ts` pour fixer la date de courses; miroir de '
  '`RAW_WINDOW_DAYS` dans `_shared/keel/fridge_window.ts`. Ordres de grandeur '
  'assumés, pas des mesures. Au-delà de 7 la valeur ne mord jamais: une '
  'fenêtre de plan fait au plus 7 jours.';

-- ═══════════════════════════════════════════════════════════════════════════
-- LES DROITS — `food_groups` accordait S/I/U/D/TRUNCATE JUSQU'À `anon`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Règle de l'ANNEXE du plan: toute table qu'on touche part avec ses droits
-- révoqués dans la MÊME migration. `food_groups` est un vocabulaire de
-- référence: seul `service_role` l'écrit, et les migrations.
--
-- ⛔ `revoke ... from public` NE SUFFIT PAS — il laisse `anon` en place. Les
-- droits sont donc révoqués NOMMÉMENT, et se vérifient par
-- `has_table_privilege('anon', 'public.food_groups', 'INSERT')`, jamais par
-- l'absence d'un `grant`.
--
-- ⚠️ `TRUNCATE` ÉCHAPPE À RLS. C'était le vrai trou: la policy
-- `food_groups_read` bloque déjà `insert`/`update`/`delete` faute de policy
-- d'écriture, mais aucune policy n'arrête un `truncate`.
--
-- ⚠️ `SELECT` EST GARDÉ POUR `authenticated`, ET LUI SEUL. La policy
-- `food_groups_read` est `to authenticated`; `CoachProtocolPage` et
-- `CoachMealsPage` la lisent. `anon` perd aussi `SELECT`: RLS lui rendait déjà
-- zéro ligne (aucune policy ne le vise), donc rien ne peut en dépendre.
revoke insert, update, delete, truncate, references, trigger
  on public.food_groups from anon, authenticated;
revoke select on public.food_groups from anon;
