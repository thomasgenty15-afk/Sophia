-- ══════════════════════════════════════════════════════════════════════════
-- ⟳ 2026-09-25 — LES PÂTES BLANCHES NE SONT PAS DU BOUDIN BLANC
-- ══════════════════════════════════════════════════════════════════════════
--
-- Relu sur un plan réel (brouillon `54aec009`, compte mathilde8774) : les deux
-- casseroles de « pâtes blanches » portaient `white_pudding_truffled`
-- (« White pudding, truffled, raw », groupe `red_meat`). Les pâtes étaient
-- donc comptées comme de la viande rouge : énergie, fenêtre de conservation
-- (« pâtes blanches … 5d>3d ») et règle « viande rouge au plus deux plats ».
--
-- ── D'OÙ ÇA VIENT ─────────────────────────────────────────────────────────
-- « pates blanches » n'avait pas d'alias (« pates » en a un). Le petit appel
-- d'identification (`composition_identify.ts`) l'a rattaché au boudin blanc le
-- 2026-09-25 à 01:09 UTC, et la réponse a été retenue en `active` dans
-- `food_composition_identified_names` : chaque plan suivant la relisait sans
-- repayer l'appel. Relecture des 56 noms retenus ce jour-là : c'est le seul
-- rattachement faux.
--
-- ── CE QUE FAIT CETTE MIGRATION ───────────────────────────────────────────
--   · un alias « pates blanches » → `white_pasta`, comme « pates » : un nom que
--     l'index résout par alias ne part plus à l'identification ;
--   · la ligne retenue passe en `rejected` (« une lecture humaine l'a jugée
--     fausse ») : elle n'est plus relue, et aucune écriture ne la réactive.

insert into public.food_composition_aliases (alias, slug, note) values
  ('pates blanches', 'white_pasta',
   '2026-09-25: rattache au boudin blanc truffe (white_pudding_truffled) par l''appel d''identification')
on conflict (alias) do nothing;

update public.food_composition_identified_names
   set status = 'rejected', updated_at = now()
 where form = 'pates blanches'
   and slug = 'white_pudding_truffled';
