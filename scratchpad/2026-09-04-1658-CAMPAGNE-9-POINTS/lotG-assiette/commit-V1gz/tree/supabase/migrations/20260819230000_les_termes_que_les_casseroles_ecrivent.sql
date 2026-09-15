-- LOT 0-B (3/3) — LES TERMES QUE LES CASSEROLES ÉCRIVENT
--
-- ── CE QUE LA MESURE PAR PLAT NE VOYAIT PAS ───────────────────────────────
-- Les deux migrations précédentes travaillent la liste des termes inconnus vue
-- sur `dishes[].ingredients` — 1 204 plats, 112 termes. Le master prompt
-- demandait de refaire la mesure APRÈS `foldPreparationsIntoDishes`, et le
-- résultat renverse une hypothèse : le taux DESCEND, il ne monte pas.
--
--     par plat, sans pliage : 455 / 1 204   (37,8 %)
--     après pliage          : 344 / 1 204   (28,6 %)   ← le vrai point de départ
--
-- 193 plats de reprise récupèrent bien une énergie, mais les casseroles
-- apportent 51 termes inconnus de plus (163 au lieu de 112) et éteignent plus
-- de plats qu'elles n'en rallument. C'est le chiffre de recette du LOT 0.
--
-- Cette migration traite les termes que SEULES les casseroles écrivent, avec
-- la même règle que les deux précédentes : une quantité présente, un
-- appariement qui ne crée aucun nombre, un compte de plats en face.
--
-- ── LE FAIT LE PLUS UTILE DE LA MESURE PLIÉE, ET IL N'EST PAS ICI ─────────
-- `pepper` passe de 16 à 93 plats une fois les casseroles pliées — de loin le
-- premier terme inconnu du produit. Il reste NON TRAITÉ, et maintenant c'est
-- mesuré des deux côtés : sur les 93 plats, il n'est le SEUL obstacle que dans
-- 5. Trancher poivre (330 kcal/100 g) contre poivron (26) rapporterait 5 plats
-- et mettrait un facteur 13 sur 88 autres. Il appartient au LOT 0-A : la
-- consigne doit faire écrire « black pepper », que le référentiel connaît
-- déjà.

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- ① DEUX ÉPICES, LES DERNIÈRES MANQUANTES D'UNE FAMILLE DÉJÀ LÀ
-- ───────────────────────────────────────────────────────────────────────────
--
-- Le référentiel porte cumin, paprika, cannelle, piment en poudre, herbes
-- séchées, thym, poivre noir. Il ne porte ni le curcuma ni la feuille de
-- laurier, que le générateur écrit 15 et 26 fois.
--
-- ⚠️ `energy_dense` FALSE sur les deux, à 312 et 313 kcal/100 g. Ce n'est pas
-- une exception : AUCUNE épice du référentiel ne le porte (cumin 427, poivre
-- noir 330, paprika 319, thym 285 — toutes `false`). Le drapeau existe pour
-- attraper l'omission qui déplace une assiette de dizaines de pour cent, et
-- ce qui sépare le poivre du riz n'est pas la densité mais la MASSE
-- PLAUSIBLE : une pincée pèse 0,5 g, une portion de riz 150 g.

insert into public.food_composition_refs
  (slug, food_group_ref, label, source, energy_kcal, protein_g, carbs_g, fat_g,
   fiber_g, omega3_marine, iron_source, calcium_source, iodine_source,
   zinc_source, b12_source, folate_source, yield_class, atwater_discount,
   energy_dense, unit_grams)
values
  -- `turmeric` ×15 plats pliés, dont 6 où il est le seul obstacle. Toujours
  -- écrit en cuillères, donc pesable dès qu'il est reconnu. « ground turmeric »
  -- (×3) se réduit tout seul : « ground » est un modificateur reconnu.
  ('turmeric','sauce_dressing','Turmeric, ground','manual',312,9.7,44.4,3.3,22.7,
   false,true,false,false,true,false,false,'neutral',1,false,null),

  -- `bay leaf` ×22 et `bay leaves` ×4, écrits « n unit » — d'où le poids de
  -- pièce. 0,2 g : CONVENTION, celle d'une feuille de laurier séchée, du même
  -- ordre que le brin de thym déjà conventionné ici à 1 g. Enjeu énergétique
  -- réel : 0,6 kcal. Ce qui manquait n'était pas la valeur, c'était que le
  -- terme cesse d'éteindre son plat.
  ('herbs_bay_leaf','leafy_greens','Bay leaf, dried','manual',313,7.6,48.7,8.4,26.3,
   false,true,true,false,false,false,false,'neutral',1,false,0.2)
on conflict (slug) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- ② LES ALIAS DE LA VUE PLIÉE
-- ───────────────────────────────────────────────────────────────────────────

insert into public.food_composition_aliases (alias, slug, note) values
  -- ⚠️ L'APOSTROPHE TYPOGRAPHIQUE. « huile d'olive » (U+0027) est DÉJÀ un
  -- alias et se résout ; « huile d’olive » (U+2019) ne se résout PAS.
  -- `normalizeTerm` déplie les ligatures et remplace « .,;:()-–— » par une
  -- espace, mais laisse l'apostraphe courbe intacte — les deux formes sont donc
  -- deux clés différentes. 21 plats pliés portent la forme courbe, et c'est une
  -- HUILE : le premier poste de perte d'énergie du produit.
  -- Le correctif de fond est dans `normalizeTerm`, pas ici ; je ne touche pas
  -- au matcher partagé depuis un lot de données, et je le signale.
  ('huile d’olive','olive_oil','LOT 0-B: apostrophe typographique U+2019; cf. huile d''olive deja alias'),

  -- Épices et mélanges. `curry powder` → `curry_paste` est une decision DEJA
  -- prise par le referentiel ; on la suit pour ses deux variantes plutot que
  -- d'en poser une seconde a cote.
  ('oregano','dried_herbs','LOT 0-B: cf. dried oregano deja alias'),
  ('mild curry powder','curry_paste','LOT 0-B: cf. curry powder deja alias'),
  ('garam masala','curry_paste','LOT 0-B: melange d epices, meme cible que curry powder'),
  ('bay leaf','herbs_bay_leaf','LOT 0-B: 22 plats plies'),
  ('bay leaves','herbs_bay_leaf','LOT 0-B: le pluriel en -es ne se reduit pas'),

  -- Féculents, tous écrits en grammes.
  ('white potato','potato','LOT 0-B'),
  ('white potatoes','potato','LOT 0-B: 3 plats plies'),
  ('giant couscous','couscous','LOT 0-B: 3 plats plies'),
  ('wholewheat fusilli','wholewheat_pasta','LOT 0-B: cf. wholewheat pasta deja alias'),

  -- Volaille : `chicken_thigh` porte deja 90 g de piece et `chicken_breast`
  -- est la ligne du blanc. Les formes « bone in / bone out / boneless » sont
  -- des precisions de decoupe qui ne changent pas la chair pesee.
  ('chicken mini fillet','chicken_breast','LOT 0-B'),
  ('chicken mini fillets','chicken_breast','LOT 0-B: 4 plats plies'),
  ('chicken thighs bone in','chicken_thigh','LOT 0-B'),
  ('chicken thighs bone out','chicken_thigh','LOT 0-B'),
  ('chicken thighs boneless/skinless','chicken_thigh','LOT 0-B'),
  ('hauts de cuisse de poulet','chicken_thigh','LOT 0-B: forme francaise'),

  -- Formes ecrites avec leur decoupe accolee : « cubed », « sliced into
  -- rounds », « finely chopped » ne sont pas des modificateurs reconnus
  -- (« chopped » seul l'est, pas « finely chopped »).
  ('sweet potatoes cubed','sweet_potato','LOT 0-B: 13 plats plies'),
  ('courgettes sliced into rounds','courgette','LOT 0-B'),
  ('onion finely chopped','onion','LOT 0-B'),
  ('onion finely diced','onion','LOT 0-B'),
  ('celery sticks','celery_stalk','LOT 0-B'),
  ('green peppers','sweet_pepper_green','LOT 0-B: ici le terme LEVE lui-meme lambiguite poivre/poivron'),

  -- Formes francaises que les casseroles ecrivent.
  ('oignons rouges','red_onion','LOT 0-B: pluriel francais, ecrit en clair'),
  ('boeuf hache','beef_mince','LOT 0-B: forme francaise'),
  ('mais','sweetcorn','LOT 0-B: cf. corn deja alias')
on conflict (alias) do nothing;

commit;
