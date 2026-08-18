begin;
insert into public.food_composition_refs
  (slug, food_group_ref, label, source, energy_kcal, protein_g, carbs_g, fat_g,
   fiber_g, iron_source, calcium_source, zinc_source, folate_source,
   yield_class, atwater_discount, energy_dense, unit_grams)
values
  ('bulgur_wheat','whole_grain','Bulgur wheat','manual',347,12.3,63,1.3,12.5,true,false,true,true,'grain_absorbs',1,false,null),
  ('noodles_wholewheat','whole_grain','Wholewheat noodles','manual',350,13.4,62,2.0,8.0,true,false,true,true,'grain_absorbs',1,false,null),
  ('vegetable_stock','sauce_dressing','Vegetable stock (low salt)','manual',4,0.2,0.6,0.1,0,false,false,false,false,'neutral',1,false,null),
  ('dried_herbs','sauce_dressing','Dried mixed herbs','manual',265,9.0,45,7.0,25.0,true,true,true,true,'neutral',1,false,null)
on conflict (slug) do nothing;

insert into public.food_composition_aliases (alias, slug)
values
  ('wholewheat couscous','couscous_wholemeal'),
  ('whole wheat couscous','couscous_wholemeal'),
  ('bulgur','bulgur_wheat'),
  ('bulghur','bulgur_wheat'),
  ('boulgour','bulgur_wheat'),
  ('wholewheat noodles','noodles_wholewheat'),
  ('whole wheat noodles','noodles_wholewheat'),
  ('low salt vegetable stock','vegetable_stock'),
  ('vegetable stock','vegetable_stock'),
  ('bouillon de legumes','vegetable_stock'),
  ('dried mixed herbs','dried_herbs'),
  ('mixed herbs','dried_herbs'),
  ('dried oregano','dried_herbs'),
  ('herbes de provence','dried_herbs'),
  ('garlic granules','garlic'),
  ('garlic powder','garlic'),
  ('romaine lettuce','lettuce'),
  ('cos lettuce','lettuce'),
  ('laitue romaine','lettuce'),
  ('chilli oil','olive_oil'),
  ('chili oil','olive_oil')
on conflict (alias) do nothing;
commit;
