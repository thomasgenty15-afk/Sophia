-- ══════════════════════════════════════════════════════════════════════════
-- LE SAS, CURÉ À LA MAIN — les formes que le produit écrit vraiment (2026-08-24)
-- ══════════════════════════════════════════════════════════════════════════
--
-- `food_composition_pending` a fait son travail: 29 termes, 42 apparitions, tous
-- écrits par le générateur en conditions réelles. Il n'avait simplement jamais
-- de LECTEUR — `source = 'sas'` valait 0 sur les 923 lignes du référentiel, et
-- aucun cron n'appelle `promote_pending_food_compositions()`.
--
-- ⛔ ON NE BRANCHE PAS CE CRON, ET C'EST LA DÉCISION DE CE LOT.
--
-- La promotion automatique ferait entrer dans le référentiel des valeurs
-- DEVINÉES PAR UN MODÈLE, définitivement, pour tout le monde. C'est exactement
-- ce que le lot 19b interdit en toutes lettres: « un alias plausible non
-- vérifié est un alias faux pas encore découvert, et un alias faux remplace un
-- aliment par un autre — en ayant l'air d'une donnée, pas d'un bug. » Le seuil
-- de trois apparitions compte la RÉPÉTITION du modèle, pas sa justesse.
--
-- Ce que le sas est vraiment: une LISTE DE TRAVAIL. On la lit, et on écrit des
-- alias vérifiés vers des lignes qui existent déjà. C'est ce que fait ce lot.
--
-- ⚠️ CE QU'IL CONFIRME AU PASSAGE: la moitié de la file est du FRANÇAIS
-- (`figues`, `yaourt de soja`, `pitas completes`, `ciboulette`…) pour des
-- aliments que le référentiel porte en anglais. Le corpus mesure 2,9
-- formulations par aliment, ~1,4 par langue.
--
-- ── LES CINQ ÉPREUVES, PASSÉES UNE PAR UNE ────────────────────────────────
-- Patron: `20260822113000_lot19b_les_alias_verifies.sql`. Vérifié sur l'export
-- live: ① la ligne visée existe · ② l'alias n'est pas déjà là · ③ il ne serait
-- pas mort · ④ on sait ce que la chaîne atteint aujourd'hui (toutes: `—`) ·
-- ⑤ après ajout, elle atteint la ligne visée.
--
-- ── ⛔ LES DIX TERMES DU SAS QU'ON REFUSE D'ALIASER, ET POURQUOI ───────────
-- Nommés plutôt que passés sous silence: une liste de travail dont on ne dit
-- pas ce qu'on a écarté est une liste qu'on relira sans savoir où elle en est.
--
--   `tofu soyeux`            le tofu soyeux fait ~55 kcal, `tofu` en fait 164.
--                            Un facteur TROIS: il lui faut sa propre ligne.
--   `jus de citron vert`     un JUS n'est pas son fruit. Aliaser un dérivé sur
--                            sa source est le début d'une table qui ment.
--   `curry doux`,            de la poudre n'est pas une pâte (`curry_paste`):
--   `curry en poudre`        densité et énergie n'ont rien à voir.
--   `baked potato`           aucune ligne de pomme de terre nature au four; les
--                            voisines sont des préparations (dauphine, duchesse).
--   `roasted vegetables`     ce n'est pas un aliment, c'est un mélange.
--   `riz cuit du jour`       de la prose, pas un nom d'aliment. `state:"cooked"`
--                            est le champ prévu pour ça.
--   `farine de ble`,         aucune ligne n'existe pour ces trois-là. Un alias
--   `levure boulangere seche`, vers rien est jeté à la construction de l'index;
--   `galette complete`       il leur faut une ligne, pas un alias.
--   `pepper`                 ambigu EXPRÈS (`20260810160000` : « retiré des deux
--                            listes »), et le prompt le dit déjà au modèle.

insert into public.food_composition_aliases (alias, slug, note) values
  ('figues', 'fig',
   '2026-08-24 (sas, 5 apparitions): le pluriel francais de « Fig, raw ». La ligne est anglaise, aucune forme francaise ne l''atteint.'),
  ('figue', 'fig',
   '2026-08-24 (sas): le singulier francais, vu lui aussi dans la file.'),
  ('soy yoghurt', 'soy_yogurt',
   '2026-08-24 (sas): la ligne est creee par la migration 20260824090000. Forme anglaise nue.'),
  ('yaourt de soja', 'soy_yogurt',
   '2026-08-24 (sas, 2 apparitions): forme francaise du meme produit.'),
  ('yaourt de soja nature', 'soy_yogurt',
   '2026-08-24 (sas, 2 apparitions): forme francaise qualifiee ; « nature » n''est pas un modificateur.'),
  ('wholemeal pitta breads', 'pita_wholemeal',
   '2026-08-24 (sas, 2 apparitions): meme defaut que « wholemeal tortilla wraps » — la forme COMPOSEE au pluriel n''atteint pas la ligne.'),
  ('wholemeal pitta bread', 'pita_wholemeal',
   '2026-08-24: le singulier de la meme forme, ecrit par le meme plan.'),
  ('pitas completes', 'pita_wholemeal',
   '2026-08-24 (sas): forme francaise ; « complet » designe la farine integrale, comme « wholemeal ».'),
  ('british raspberries', 'raspberries',
   '2026-08-24 (sas): « british » n''est pas un modificateur (refus date du 2026-08-19), donc la forme qualifiee rate la ligne generique.'),
  ('sourdough bread', 'bread',
   '2026-08-24 (sas): « Bread (average) » est la ligne generique du pain ; le levain ne deplace ni l''energie ni la proteine de facon utile ici.')
on conflict (alias) do nothing;

-- ---------------------------------------------------------------------------
-- LA CONTRE-LECTURE — relue depuis la base, jamais supposée
-- ---------------------------------------------------------------------------
do $$
declare v_alias int;
begin
  select count(*) into v_alias
    from public.food_composition_aliases a
    join public.food_composition_refs r on r.slug = a.slug
   where a.alias in ('figues', 'figue', 'soy yoghurt', 'yaourt de soja',
                     'yaourt de soja nature', 'wholemeal pitta breads',
                     'wholemeal pitta bread', 'pitas completes',
                     'british raspberries', 'sourdough bread');
  if v_alias <> 10 then
    raise exception 'les dix alias ne pointent pas tous vers une ligne vivante (%)', v_alias;
  end if;
end $$;
