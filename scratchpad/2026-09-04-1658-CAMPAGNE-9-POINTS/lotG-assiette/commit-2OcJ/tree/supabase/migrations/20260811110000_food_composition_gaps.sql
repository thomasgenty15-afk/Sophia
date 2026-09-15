-- LES TROUS DU RÉFÉRENTIEL, COMBLÉS — mesurés en run réel le 2026-08-11.
--
-- ── COMMENT ILS ONT ÉTÉ TROUVÉS ────────────────────────────────────────────
-- Trois campagnes de génération réelle, énergie et protéines recalculées
-- ingrédient par ingrédient. Les termes que le modèle écrit spontanément et
-- que le référentiel ne connaissait pas:
--
--   wholemeal pita · wholegrain tortilla · crispbreads · red bell pepper
--   cabbage and carrot slaw mix
--
-- ── POURQUOI CE N'EST PAS COSMÉTIQUE ───────────────────────────────────────
-- La règle d'abstention de `meal_verdict.ts` coupe le verdict sous 80 % de
-- résolution. On a MESURÉ 79 % sur un plan: le moteur était à un ingrédient
-- près de ne plus rien pouvoir dire. Et les manques portaient sur des
-- FÉCULENTS — donc sur l'énergie, ce qui faisait passer les plans pour bien
-- plus légers qu'ils n'étaient.
--
-- ── LES VALEURS ────────────────────────────────────────────────────────────
-- Ordres de grandeur usuels pour 100 g, cohérents avec les entrées voisines
-- déjà en table (`source = 'manual'` les distingue des lignes
-- extraites de Ciqual, pour qu'une reprise ultérieure sache lesquelles
-- réviser).
--
-- ── RÉ-APPLICABLE ──────────────────────────────────────────────────────────
-- `db reset` est interdit: `on conflict do nothing` sur les deux tables.

begin;

insert into public.food_composition_refs
  (slug, food_group_ref, label, source, energy_kcal, protein_g, carbs_g, fat_g,
   fiber_g, iron_source, calcium_source, zinc_source, folate_source,
   yield_class, atwater_discount, energy_dense, unit_grams)
values
  -- ── FÉCULENTS DE TYPE PAIN — les plus gros manques mesurés ──────────────
  ('tortilla_wrap', 'refined_grain', 'Tortilla wrap (wheat)', 'manual',
   305, 8.5, 52, 6.5, 3.0, true, false, true, true, 'neutral', 1, false, 60),
  ('tortilla_wholemeal', 'whole_grain', 'Wholemeal tortilla wrap', 'manual',
   290, 9.5, 45, 6.5, 6.5, true, false, true, true, 'neutral', 1, false, 60),
  ('pita_bread', 'refined_grain', 'Pita bread', 'manual',
   275, 9.0, 55, 1.2, 2.5, true, false, true, true, 'neutral', 1, false, 60),
  ('pita_wholemeal', 'whole_grain', 'Wholemeal pita bread', 'manual',
   265, 10.0, 48, 1.6, 6.0, true, false, true, true, 'neutral', 1, false, 60),
  ('crispbread_rye', 'whole_grain', 'Rye crispbread', 'manual',
   340, 9.5, 65, 1.5, 16.0, true, false, true, true, 'neutral', 1, false, 10),
  ('couscous_wholemeal', 'whole_grain', 'Wholemeal couscous', 'manual',
   345, 12.0, 65, 1.8, 8.0, true, false, true, true, 'grain_absorbs', 1, false, null),
  ('bagel', 'refined_grain', 'Bagel', 'manual',
   275, 10.5, 52, 1.5, 2.3, true, false, true, true, 'neutral', 1, false, 85),
  ('naan_bread', 'refined_grain', 'Naan bread', 'manual',
   320, 8.5, 50, 9.0, 2.2, true, false, false, true, 'neutral', 1, false, 90),

  -- ── LÉGUMES ET MÉLANGES ────────────────────────────────────────────────
  ('coleslaw_mix', 'non_starchy_veg', 'Cabbage and carrot slaw mix (undressed)',
   'manual', 30, 1.2, 5.0, 0.2, 2.4, false, false, false, true,
   'neutral', 1, false, null),
  ('mixed_leaves', 'leafy_greens', 'Mixed salad leaves', 'manual',
   17, 1.5, 1.5, 0.3, 1.8, true, false, false, true, 'neutral', 1, false, null),
  ('rocket', 'leafy_greens', 'Rocket', 'manual',
   25, 2.6, 2.0, 0.7, 1.6, true, true, false, true, 'neutral', 1, false, null),

  -- ── SOURCES DE PROTÉINE fréquemment écrites et absentes ────────────────
  ('turkey_breast', 'poultry', 'Turkey breast', 'manual',
   105, 24.0, 0, 1.0, 0, true, false, true, false, 'meat_shrinks', 1, false, null),
  ('smoked_salmon', 'fatty_fish', 'Smoked salmon', 'manual',
   180, 22.0, 0, 10.0, 0, true, false, false, false, 'neutral', 1, false, null),
  ('halloumi', 'dairy_cheese', 'Halloumi', 'manual',
   330, 22.0, 2.0, 26.0, 0, false, true, true, false, 'neutral', 1, true, null),
  ('mozzarella', 'dairy_cheese', 'Mozzarella', 'manual',
   250, 18.0, 1.5, 19.0, 0, false, true, true, false, 'neutral', 1, false, null)
on conflict (slug) do nothing;

-- ── LES ALIAS ──────────────────────────────────────────────────────────────
-- Écrits à la main, jamais dérivés. Les qualificatifs de COULEUR passent par
-- ici plutôt que par la liste des modificateurs, et c'est délibéré: retirer
-- « green » ferait de « green beans » (haricots verts, un légume) des
-- « beans » (légumineuses) — un faux appariement indiscernable d'un bon dans
-- tout ce qui se calcule derrière.
insert into public.food_composition_aliases (alias, slug)
values
  ('red bell pepper', 'bell_pepper'),
  ('green bell pepper', 'bell_pepper'),
  ('yellow bell pepper', 'bell_pepper'),
  ('red pepper', 'bell_pepper'),
  ('poivron rouge', 'bell_pepper'),
  ('poivron vert', 'bell_pepper'),
  ('poivron jaune', 'bell_pepper'),
  ('tortilla', 'tortilla_wrap'),
  ('wheat tortilla', 'tortilla_wrap'),
  ('flour tortilla', 'tortilla_wrap'),
  ('wrap', 'tortilla_wrap'),
  ('wholemeal tortilla', 'tortilla_wholemeal'),
  ('wholegrain tortilla', 'tortilla_wholemeal'),
  ('wholewheat tortilla', 'tortilla_wholemeal'),
  ('wholemeal wrap', 'tortilla_wholemeal'),
  ('wholegrain wrap', 'tortilla_wholemeal'),
  ('tortilla de ble', 'tortilla_wrap'),
  ('pita', 'pita_bread'),
  ('pitta', 'pita_bread'),
  ('pita pocket', 'pita_bread'),
  ('pain pita', 'pita_bread'),
  ('wholemeal pita', 'pita_wholemeal'),
  ('wholemeal pitta', 'pita_wholemeal'),
  ('wholegrain pita', 'pita_wholemeal'),
  ('crispbread', 'crispbread_rye'),
  ('crispbreads', 'crispbread_rye'),
  ('wholegrain crispbread', 'crispbread_rye'),
  ('wholegrain crispbreads', 'crispbread_rye'),
  ('rye crispbread', 'crispbread_rye'),
  ('pain croustillant', 'crispbread_rye'),
  ('wholemeal couscous', 'couscous_wholemeal'),
  ('wholegrain couscous', 'couscous_wholemeal'),
  ('slaw mix', 'coleslaw_mix'),
  ('coleslaw mix', 'coleslaw_mix'),
  ('cabbage and carrot slaw mix', 'coleslaw_mix'),
  ('crunchy slaw', 'coleslaw_mix'),
  ('mixed salad leaves', 'mixed_leaves'),
  ('salad leaves', 'mixed_leaves'),
  ('mixed leaves', 'mixed_leaves'),
  ('mesclun', 'mixed_leaves'),
  ('roquette', 'rocket'),
  ('arugula', 'rocket'),
  ('turkey', 'turkey_breast'),
  ('turkey mince', 'turkey_breast'),
  ('dinde', 'turkey_breast'),
  ('blanc de dinde', 'turkey_breast'),
  ('saumon fume', 'smoked_salmon'),
  ('mozzarella light', 'mozzarella')
on conflict (alias) do nothing;

-- ===========================================================================
-- LA PREUVE — les termes qui échouaient se résolvent, et rien ne s'est cassé
-- ===========================================================================

do $$
declare
  missing text;
begin
  -- Chaque alias pointe vers un slug qui existe (sinon il est jeté en
  -- silence à la construction de l'index, et la couverture ne monte pas).
  select string_agg(a.alias, ', ') into missing
    from public.food_composition_aliases a
    left join public.food_composition_refs r on r.slug = a.slug
   where r.slug is null;
  if missing is not null then
    raise exception 'alias orphelins: %', missing;
  end if;

  -- Les aliments neufs sont bien là.
  if (select count(*) from public.food_composition_refs
       where slug in ('tortilla_wholemeal','pita_wholemeal','crispbread_rye')) <> 3 then
    raise exception 'les féculents de type pain n''ont pas été insérés';
  end if;
end;
$$;

commit;
