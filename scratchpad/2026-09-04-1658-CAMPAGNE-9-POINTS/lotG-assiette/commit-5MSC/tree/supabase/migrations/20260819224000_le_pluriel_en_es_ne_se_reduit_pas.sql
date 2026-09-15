-- LOT 0-B (suite) — LE PLURIEL EN « -ES » NE SE RÉDUIT PAS
--
-- ── LE DÉFAUT, MESURÉ APRÈS COUP ──────────────────────────────────────────
-- La migration précédente a créé `corn_cake` et `lemon_wedge` et compté sur
-- `candidateForms` pour ramener le pluriel au singulier. Rejeu sur l'index
-- vivant : `corn cakes` et `lemon wedges` restaient INCONNUS.
--
-- `candidateForms` réduit le pluriel anglais par `replace(/e?s$/, "")` sur le
-- dernier mot. Le `e?` est optionnel MAIS gourmand : « cakes » donne « cak »
-- et non « cake », « wedges » donne « wedg ». La réduction est donc muette sur
-- TOUT singulier terminé par « e » — c'est aussi pourquoi la migration
-- précédente écrivait déjà `aubergines`, `cherries`, `blackberries` et
-- `nectarines` en clair. J'avais nommé le piège et je suis tombé dedans sur
-- mes deux propres slugs.
--
-- ⚠️ Le matcher n'est PAS corrigé ici, et c'est délibéré. `candidateForms` est
-- partagé par les 921 lignes du référentiel ; changer sa règle de pluriel
-- depuis un lot de données ferait bouger des appariements que personne n'a
-- mesurés. La forme exacte s'écrit en alias, comme le fait déjà la table pour
-- les pluriels français.
--
-- Cette migration est SÉPARÉE plutôt que fondue dans la précédente : celle-ci
-- est déjà enregistrée dans `supabase_migrations.schema_migrations`. La
-- corriger sur le disque laisserait le fichier et la base divergents, et le
-- correctif serait « sauté en silence » ici tout en s'appliquant ailleurs.

begin;

insert into public.food_composition_aliases (alias, slug, note) values
  -- Le correctif du pluriel, sur mes deux slugs de la migration précédente.
  ('corn cakes','corn_cake','LOT 0-B: 8 plats; le pluriel en -es ne se reduit pas'),
  ('lemon wedges','lemon_wedge','LOT 0-B: 4 plats; le pluriel en -es ne se reduit pas'),

  -- `rye toast` ×1 plat, ecrit « 6 unit ». `rye_bread` porte deja 40 g de
  -- piece et la classe `neutral`. Precedent exact deja dans la table :
  -- « wholemeal toast » → `wholemeal_bread`.
  ('rye toast','rye_bread','LOT 0-B: cf. wholemeal toast deja alias'),

  -- `buckwheat flakes` ×1 plat, ecrit « 90 g ». Des flocons sont le meme
  -- grain aplati : la composition ne bouge pas. Meme geste que
  -- « oat flour » → `oats` a la migration precedente.
  ('buckwheat flakes','buckwheat','LOT 0-B: aplatir ne change pas la composition')
on conflict (alias) do nothing;

commit;
