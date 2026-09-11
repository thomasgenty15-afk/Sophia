-- ═══════════════════════════════════════════════════════════════════════════
-- PLANCHER DU BUDGET — LA MESURE QUI PRODUIT LES DEUX TABLES
-- Lancée le 2026-09-11 sur la base locale (`supabase_db_Sophia_2`).
-- Les nombres rendus ici sont ceux de
-- `supabase/functions/_shared/keel/budget_floor.ts`.
--
-- Relancer:
--   docker cp scratchpad/2026-09-11-PLANCHER-BUDGET/mesure.sql \
--     supabase_db_Sophia_2:/tmp/m.sql && \
--   docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -f /tmp/m.sql
--
-- ⚠️ CE QU'ELLE MESURE: six paniers NOMMÉS, pas des centiles de groupe. Le
-- safran et les lentilles vivent dans le même groupe à quatre ordres de
-- grandeur d'écart; un centile n'y désigne aucun repas réel, un panier si.
-- ⚠️ NORMALISÉS À 2 000 kcal (`BUDGET_FLOOR_REFERENCE_KCAL`): les six paniers
-- ne font pas la même énergie, et les comparer en euros bruts ferait passer le
-- panier végane (2 644 kcal) pour le plus cher alors qu'il est le moins cher.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① COUVERTURE DE LA GRILLE ─────────────────────────────────────────────
select count(*) as lignes,
       count(price_eur_per_100g_fr) as chiffrees_fr,
       count(price_usd_per_100g_us) as chiffrees_us
  from public.food_composition_refs;
-- 2026-09-11 → 943 | 893 | 843

-- ── ② LES SIX PANIERS ─────────────────────────────────────────────────────
with panier(panier, slug, g) as (values
 -- ① LE MINIMUM (déjà végétalien: c'est le fait qui gouverne tout le module)
 ('MIN_base','white_pasta',250),('MIN_base','lentils_dry',150),('MIN_base','sunflower_oil',30),
 ('MIN_base','carrot',200),('MIN_base','onion',100),('MIN_base','tinned_tomatoes',200),('MIN_base','potato',300),
 -- ① bis LE MINIMUM SANS GLUTEN (les pâtes deviennent du riz)
 ('MIN_gf','white_rice',250),('MIN_gf','lentils_dry',150),('MIN_gf','sunflower_oil',35),
 ('MIN_gf','carrot',200),('MIN_gf','onion',100),('MIN_gf','tinned_tomatoes',200),('MIN_gf','potato',350),
 -- ② LE FRUGAL, PAR RÉGIME
 ('FRU_omni','white_pasta',120),('FRU_omni','white_rice',80),('FRU_omni','country_style_bread',100),
 ('FRU_omni','lentils_dry',60),('FRU_omni','egg',100),('FRU_omni','chicken_drumstick',130),
 ('FRU_omni','plain_yogurt',125),('FRU_omni','carrot',150),('FRU_omni','onion',80),
 ('FRU_omni','tinned_tomatoes',200),('FRU_omni','potato',200),('FRU_omni','sunflower_oil',25),
 ('FRU_vege','white_pasta',120),('FRU_vege','white_rice',80),('FRU_vege','country_style_bread',100),
 ('FRU_vege','lentils_dry',90),('FRU_vege','chickpeas_dry',60),('FRU_vege','egg',150),
 ('FRU_vege','plain_yogurt',200),('FRU_vege','carrot',150),('FRU_vege','onion',80),
 ('FRU_vege','tinned_tomatoes',200),('FRU_vege','potato',200),('FRU_vege','sunflower_oil',25),
 ('FRU_vegan','white_pasta',140),('FRU_vegan','white_rice',80),('FRU_vegan','country_style_bread',100),
 ('FRU_vegan','lentils_dry',110),('FRU_vegan','chickpeas_dry',90),('FRU_vegan','tofu',150),
 ('FRU_vegan','oats',60),('FRU_vegan','carrot',150),('FRU_vegan','onion',80),
 ('FRU_vegan','tinned_tomatoes',200),('FRU_vegan','potato',200),('FRU_vegan','sunflower_oil',25),
 ('FRU_gf','white_rice',180),('FRU_gf','potato',350),('FRU_gf','lentils_dry',80),
 ('FRU_gf','egg',100),('FRU_gf','chicken_drumstick',130),('FRU_gf','plain_yogurt',200),
 ('FRU_gf','carrot',150),('FRU_gf','onion',80),('FRU_gf','tinned_tomatoes',200),
 ('FRU_gf','sunflower_oil',30),('FRU_gf','chickpeas_dry',60))
select p.panier,
       -- ⛔ LE TÉMOIN: une ligne sans prix rendrait un panier AMPUTÉ qui a
       -- l'air d'un total. Zéro est la seule valeur acceptable ici.
       count(*) filter (
         where r.price_eur_per_100g_fr is null or r.price_usd_per_100g_us is null
       ) as trous,
       round(sum(r.energy_kcal * p.g / 100.0), 0) as kcal,
       round(sum(r.protein_g * p.g / 100.0), 0) as proteines_g,
       round(sum(r.price_eur_per_100g_fr * p.g / 100.0), 2) as eur_panier,
       round(sum(r.price_usd_per_100g_us * p.g / 100.0), 2) as usd_panier,
       round((sum(r.price_eur_per_100g_fr * p.g / 100.0) * 2000
              / sum(r.energy_kcal * p.g / 100.0))::numeric, 2) as fr_par_bouche_jour,
       round((sum(r.price_usd_per_100g_us * p.g / 100.0) * 2000
              / sum(r.energy_kcal * p.g / 100.0))::numeric, 2) as us_par_bouche_jour
  from panier p
  join public.food_composition_refs r on r.slug = p.slug
 group by 1
 order by 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- SORTIE DU 2026-09-11 (trous = 0 sur les six)
--
--   panier     | kcal | prot | eur   | usd   | fr/bouche/j | us/bouche/j
--   -----------+------+------+-------+-------+-------------+------------
--   FRU_gf     | 2234 |   99 |  4.38 |  4.77 |        3.92 |       4.27
--   FRU_omni   | 2045 |   91 |  3.86 |  4.24 |        3.77 |       4.15
--   FRU_vegan  | 2644 |  114 |  4.22 |  4.57 |        3.19 |       3.46
--   FRU_vege   | 2267 |   96 |  3.91 |  4.45 |        3.45 |       3.92
--   MIN_base   | 1992 |   77 |  2.64 |  3.75 |        2.65 |       3.77
--   MIN_gf     | 2115 |   67 |  2.93 |  3.65 |        2.77 |       3.45
--
-- ── COMMENT ON PASSE DE CETTE SORTIE AUX DEUX TABLES ──────────────────────
--
-- PLANCHER = le panier le moins cher que le régime AUTORISE.
--   · fr, sans restriction .... min(2.65, 2.77) = 2.65
--   · fr, sans gluten ......... 2.77  (le riz coûte plus cher que les pâtes)
--   · us, sans restriction .... min(3.77, 3.45) = 3.45
--   · us, sans gluten ......... 3.45  (le riz y coûte MOINS cher: le panier
--                                      sans gluten devient le moins cher des
--                                      deux, pour tout le monde)
--   ⚠️ omnivore = végétarien = végane = pescétarien, sur les deux marchés: le
--   panier minimum ne contient aucun produit animal, donc les quatre
--   l'autorisent. Le régime ne durcit le plancher que là où il retire un
--   aliment BON MARCHÉ.
--
-- SEUIL DE CE QU'ON DIT = le panier frugal du régime déclaré, tel quel.
--   Le pescétarien prend la ligne du végétarien: il autorise tout ce qu'elle
--   contient, et le poisson (5,11 €/1 000 kcal au moins cher) ne peut pas
--   BAISSER son jour frugal.
-- ═══════════════════════════════════════════════════════════════════════════
