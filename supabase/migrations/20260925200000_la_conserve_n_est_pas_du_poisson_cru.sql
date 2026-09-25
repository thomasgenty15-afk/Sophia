-- ═══════════════════════════════════════════════════════════════════════════
-- LA CONSERVE N'EST PAS DU POISSON CRU — 2026-09-25
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Banc des trois foyers (`scratchpad/2026-09-25-BANC-TROIS-FOYERS/`), foyer B.
-- Deux plans complets sur trois refusés pour des défauts qui n'existaient pas :
--
--   · B-3 : « maquereau en conserve » au déjeuner du mardi. Aucun alias exact ;
--     la lecture coupe « en conserve » et tombe sur `mackerel` (« Maquereau,
--     cru », `fish_shrinks`) ; `raw_protein_uncooked` refuse le plan : un
--     poisson cru que rien ne cuit. C'était sa SEULE cause de refus (garde
--     finale OK, 103 repas sur 103).
--   · B-1, relance : « sardines en conserve égouttées » lu comme `sardines`,
--     groupe `fatty_fish`, fenêtre crue d'UN jour ; `perishable_bought_too_early`
--     refuse la conserve achetée samedi pour jeudi.
--
-- La cause est la même : le référentiel ne sépare pas le poisson PRÊT À MANGER
-- (conserve, fumé) du poisson frais. `tinned mackerel` pointait sur le
-- maquereau cru, et la sardine n'avait qu'une ligne.
--
-- ── CE QUE LA MIGRATION FAIT ─────────────────────────────────────────────
--   ① AJOUTE cinq poissons prêts à manger, `neutral` (rien ne fond à la
--     cuisson, rien n'est à cuire) : maquereau en conserve, maquereau fumé,
--     saumon en conserve, hareng fumé, sardines en conserve ;
--   ② DÉPLACE les alias qui nommaient une conserve vers la conserve
--     (`tinned mackerel`, `tinned sardines`, `sardines a l'huile`) ;
--   ③ AJOUTE les noms français et anglais de ces conserves et de ces fumés ;
--   ④ vérifie tout ce qui précède dans un bloc de contrôle.
--
-- ⛔ SEULS LES NOMS QUI DISENT LA CONSERVE OU LE FUMÉ. « maquereau »,
-- « sardines », « filets de maquereau » restent où ils étaient : un nom
-- ambigu qui mène au poisson cru peut refuser un plan à tort (récupérable), un
-- nom ambigu qui mènerait à la conserve laisserait passer du poisson cru que
-- personne ne cuit (pas récupérable).
--
-- ⚠️ La conservation se lit dans le code, pas ici : `SHELF_STABLE_SLUGS`
-- (`shopping_identity.ts`) nomme les conserves, et la liste gagne les trois
-- conserves de ce fichier. Les fumés restent au frais (fenêtre du groupe).
--
-- ── LA SOURCE ────────────────────────────────────────────────────────────
-- Table CIQUAL 2025 de l'ANSES, lue sur ciqual.anses.fr le 2026-09-25 par la
-- recherche publique du site (même lecture que `20260923110000`). Chaque ligne
-- porte son code 2025 et sa provenance `ciqual2025:<code>`. Mêmes règles de
-- lecture que l'import d'origine :
--   · protéines = « Protéines, N x facteur de Jones » ;
--   · « traces » ⇒ NULL, « < x » ⇒ x ; une teneur non publiée ⇒ NULL ;
--   · `omega3_marine` = EPA + DHA > 0,05 g/100 g ;
--   · les sentinelles `*_source` = 15 % de la VNR pour 100 g (Règlement UE
--     1169/2011) : calcium ≥ 120 mg, fer ≥ 2,1 mg, iode ≥ 22,5 µg,
--     zinc ≥ 1,5 mg, B12 ≥ 0,375 µg, folates ≥ 30 µg ;
--   · `energy_dense` = 250 kcal/100 g et plus.
-- ⚠️ `sardines` (la ligne d'origine, code 26034, sardine à l'huile) n'est pas
-- touchée : des plans écrits la citent. `sardines_tinned` porte un AUTRE code
-- (26040, à l'huile d'olive) : deux slugs sur un même code tombent tous deux en
-- `a_verifier` au chargement de l'index.
--
-- ⚠️ HORODATAGE : le dernier registre appliqué en local est `20260925120000`.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- ① LES CINQ POISSONS PRÊTS À MANGER
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.food_composition_refs
  (slug, food_group_ref, label, source, ciqual_code, ciqual_name,
   energy_kcal, protein_g, carbs_g, fat_g, fiber_g,
   omega3_marine, iron_source, calcium_source, iodine_source, zinc_source,
   b12_source, folate_source, yield_class, atwater_discount, energy_dense,
   sodium_mg, sugars_g, micronutrient_source, family)
values
  -- EPA 1,25 + DHA 2,11 ; fer 1,1 ; calcium 38 ; iode « < 20 » ; zinc 0,8 ;
  -- B12 10,5 ; folates 8,37.
  ('mackerel_tinned','fatty_fish','Tinned mackerel','ciqual','26123',
   'Maquereau, filet (grillé ou non), au naturel, appertisé, égoutté',
   221,18.8,0.018,16.2,0,
   true,false,false,false,false,true,false,'neutral',1,false,
   337,0,'ciqual2025:26123','mackerel'),
  -- EPA 1,29 + DHA 2,45 ; fer 1,1 ; calcium 19 ; iode 109 ; zinc 0,72 ;
  -- B12 7,3 ; folates 13,3 ; fibres non publiées ; sucres « traces ».
  ('mackerel_smoked','fatty_fish','Smoked mackerel','ciqual','26087',
   'Maquereau, fumé',
   289,19.8,0.92,22.9,null,
   true,false,false,true,false,true,false,'neutral',1,true,
   616,null,'ciqual2025:26087','mackerel'),
  -- EPA 0,53 + DHA 0,72 ; fer 0,53 ; calcium 181 ; iode 49,3 ; zinc 0,75 ;
  -- B12 3,55 ; folates 12 ; sucres « traces ».
  ('salmon_tinned','fatty_fish','Tinned salmon','ciqual','26119',
   'Saumon, appertisé, égoutté',
   144,21,4.9,4.5,0,
   true,false,true,true,false,true,false,'neutral',1,false,
   406,null,'ciqual2025:26119','salmon'),
  -- EPA 2,98 + DHA 1,11 ; fer 1 ; calcium 62,4 ; iode 40 ; zinc 0,6 ;
  -- B12 11,8 ; folates 12.
  ('herring_smoked','fatty_fish','Smoked herring','ciqual','26013',
   'Hareng fumé, au naturel',
   167,16.5,0.5,11,0,
   true,false,false,true,false,true,false,'neutral',1,false,
   1590,0,'ciqual2025:26013','herring'),
  -- ⚠️ 26040 (à l'huile d'olive), PAS 26034 (à l'huile) : 26034 est déjà le
  -- code de `sardines`, et deux slugs sur un même code tombent tous deux en
  -- `a_verifier` (`food_composition_io.ts`, `slugsWithADuplicateCiqualCode`).
  -- La boîte la plus vendue en France, et un aliment CIQUAL distinct.
  -- EPA 0,91 + DHA 0,86 ; fer 2,5 ; calcium 432 ; iode 21,2 ; zinc 1,8 ;
  -- B12 20 ; folates non publiés.
  ('sardines_tinned','fatty_fish','Tinned sardines','ciqual','26040',
   'Sardine, à l''huile d''olive, appertisée, égouttée',
   224,23.3,0.11,14.5,0,
   true,true,true,false,true,true,false,'neutral',1,false,
   291,0,'ciqual2025:26040','sardines')
on conflict (slug) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- ② LES ALIAS QUI NOMMAIENT UNE CONSERVE, RENDUS À LA CONSERVE
-- ═══════════════════════════════════════════════════════════════════════════
update public.food_composition_aliases
   set slug = 'mackerel_tinned'
 where alias = 'tinned mackerel' and slug = 'mackerel';

update public.food_composition_aliases
   set slug = 'sardines_tinned'
 where alias in ('tinned sardines', 'sardines a l''huile') and slug = 'sardines';

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ LES NOMS DE LA CONSERVE ET DU FUMÉ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sans accent : l'index normalise les deux côtés (`normalizeTerm`), et la
-- table d'origine s'écrit ainsi. « au vin blanc », « à la tomate », « à la
-- moutarde » sont les conserves du rayon ; un maquereau frais qu'on cuit au
-- vin blanc est une préparation, et sa ligne cuite n'est pas lue par la garde
-- du cru.
insert into public.food_composition_aliases (alias, slug) values
  ('canned mackerel', 'mackerel_tinned'),
  ('tinned mackerel fillets', 'mackerel_tinned'),
  ('canned mackerel fillets', 'mackerel_tinned'),
  ('maquereau en conserve', 'mackerel_tinned'),
  ('maquereaux en conserve', 'mackerel_tinned'),
  ('maquereau en boite', 'mackerel_tinned'),
  ('maquereaux en boite', 'mackerel_tinned'),
  ('filet de maquereau en conserve', 'mackerel_tinned'),
  ('filets de maquereau en conserve', 'mackerel_tinned'),
  ('maquereau au naturel', 'mackerel_tinned'),
  ('filets de maquereau au naturel', 'mackerel_tinned'),
  ('maquereau a la tomate', 'mackerel_tinned'),
  ('filets de maquereau a la tomate', 'mackerel_tinned'),
  ('maquereau au vin blanc', 'mackerel_tinned'),
  ('filets de maquereau au vin blanc', 'mackerel_tinned'),
  ('maquereau a la moutarde', 'mackerel_tinned'),
  ('filets de maquereau a la moutarde', 'mackerel_tinned'),

  ('smoked mackerel', 'mackerel_smoked'),
  ('smoked mackerel fillet', 'mackerel_smoked'),
  ('smoked mackerel fillets', 'mackerel_smoked'),
  ('maquereau fume', 'mackerel_smoked'),
  ('maquereaux fumes', 'mackerel_smoked'),
  ('filet de maquereau fume', 'mackerel_smoked'),
  ('filets de maquereau fume', 'mackerel_smoked'),
  ('filets de maquereau fumes', 'mackerel_smoked'),
  ('maquereau fume au poivre', 'mackerel_smoked'),
  ('filets de maquereau fumes au poivre', 'mackerel_smoked'),

  ('tinned salmon', 'salmon_tinned'),
  ('canned salmon', 'salmon_tinned'),
  ('saumon en conserve', 'salmon_tinned'),
  ('saumon en boite', 'salmon_tinned'),

  ('smoked herring', 'herring_smoked'),
  ('kipper', 'herring_smoked'),
  ('kippers', 'herring_smoked'),
  ('hareng fume', 'herring_smoked'),
  ('harengs fumes', 'herring_smoked'),
  ('filet de hareng fume', 'herring_smoked'),
  ('filets de hareng fume', 'herring_smoked'),
  ('filets de harengs fumes', 'herring_smoked'),
  ('hareng saur', 'herring_smoked'),
  ('harengs saurs', 'herring_smoked'),

  ('canned sardines', 'sardines_tinned'),
  ('sardines en conserve', 'sardines_tinned'),
  ('sardine en conserve', 'sardines_tinned'),
  ('sardines en conserve egouttees', 'sardines_tinned'),
  ('sardines en boite', 'sardines_tinned'),
  ('sardines a l''huile d''olive', 'sardines_tinned'),
  ('sardines a la tomate', 'sardines_tinned'),
  ('sardines a la sauce tomate', 'sardines_tinned')
on conflict (alias) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ LE CONTRÔLE
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  n int;
begin
  select count(*) into n from public.food_composition_refs
   where slug in ('mackerel_tinned','mackerel_smoked','salmon_tinned','herring_smoked','sardines_tinned')
     and yield_class = 'neutral' and food_group_ref = 'fatty_fish'
     and micronutrient_source like 'ciqual2025:%';
  if n <> 5 then
    raise exception 'conserves: % ligne(s) sur 5', n;
  end if;

  -- Aucun code CIQUAL partagé : le chargeur rendrait les deux lignes
  -- non composables.
  select count(*) into n from (
    select ciqual_code from public.food_composition_refs
     where coalesce(ciqual_code, '') <> ''
     group by ciqual_code having count(*) > 1) d;
  if n <> 0 then
    raise exception 'codes CIQUAL partagés: %', n;
  end if;

  -- Les noms de la conserve mènent à la conserve…
  select count(*) into n from public.food_composition_aliases
   where (alias, slug) in (('tinned mackerel','mackerel_tinned'),
                           ('maquereau en conserve','mackerel_tinned'),
                           ('tinned sardines','sardines_tinned'),
                           ('sardines a l''huile','sardines_tinned'),
                           ('sardines en conserve egouttees','sardines_tinned'),
                           ('saumon en conserve','salmon_tinned'),
                           ('hareng fume','herring_smoked'),
                           ('maquereau fume','mackerel_smoked'));
  if n <> 8 then
    raise exception 'alias de conserve: % sur 8', n;
  end if;

  -- … et les noms nus restent au poisson frais.
  select count(*) into n from public.food_composition_aliases
   where (alias, slug) in (('maquereau','mackerel'), ('mackerel','mackerel'),
                           ('sardines','sardines'), ('sardine','sardines'),
                           ('saumon','salmon'), ('hareng','herring'));
  if n <> 6 then
    raise exception 'noms nus: % sur 6 restent au frais', n;
  end if;
end $$;

commit;
