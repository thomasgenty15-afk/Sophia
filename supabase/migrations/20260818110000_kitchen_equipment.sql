-- ===========================================================================
-- LOT L2-A — AVEC QUOI CE FOYER CUISINE.
--
-- Conception: scratchpad/2026-08-18-FORMULAIRE-PERSONNE-ET-PLANNING.md §2.1
--
-- ── CE QUE CETTE MIGRATION CHANGE, ET CE QU'ELLE NE CHANGE PAS ─────────────
-- Elle ne touche AUCUNE donnée et n'ajoute aucune colonne: `practical_constraints`
-- est un jsonb, et la clé `kitchen_equipment` y entre sans DDL. Elle AJOUTE un
-- paragraphe au COMMENTAIRE de la colonne, et rien d'autre.
--
-- ── POURQUOI C'EST QUAND MÊME UNE MIGRATION ───────────────────────────────
-- Ce commentaire est la SEULE documentation des clés connues de ce jsonb. Le
-- 2026-08-13, `budget_band` y est resté nommé longtemps après avoir perdu son
-- dernier lecteur, et la migration qui l'a corrigé écrit pourquoi: « le
-- prochain qui ouvrira cette colonne lira une clé morte comme une clé vivante,
-- l'écrira, et personne ne le verra ». Le symétrique est vrai — une clé
-- VIVANTE absente du commentaire est une clé que le prochain lot écrasera en
-- croyant la place libre.
--
-- ⚠️ LE TEXTE EXISTANT EST REPRIS MOT POUR MOT. `comment on column` REMPLACE:
-- réécrire la phrase du rythme ou celle du budget « en passant » ferait perdre
-- deux arbitrages qui ne sont pas les miens. Une seule chose est ajoutée.
--
-- ── CE QUE `kitchen_equipment` VEUT DIRE ──────────────────────────────────
-- Une liste FERMÉE de sept jetons — `oven`, `stovetop`, `microwave`,
-- `freezer`, `air_fryer`, `pressure_cooker`, `blender` — écrite dans l'ordre
-- de cette liste, jamais dans celui des clics. C'est un fait de la CUISINE, pas
-- une demande de plan: contrairement au budget et au mode de cuisson (sortis du
-- profil les 2026-08-13 et 15 parce qu'ils décrivent UNE semaine), un four ne
-- change pas d'une semaine à l'autre. Il a donc le droit d'être durable.
--
-- La question se pose UNE FOIS POUR LE FOYER: une cuisine est partagée. Le
-- seul équipement individuel du produit est ailleurs et n'est pas dans ce lot
-- (le micro-ondes DU BUREAU, §2.2 ⓐ, qui vit sur la bouche).
--
-- ── ⚠️ LA GARDE, ET ELLE EST DANS LE LECTEUR, PAS DANS UN CHECK ───────────
-- ABSENCE DE CLÉ ≠ TABLEAU VIDE, et c'est tout ce lot:
--
--   · clé absente      → « on ne m'a rien demandé » ⇒ le moteur se comporte
--                        EXACTEMENT comme avant ce lot;
--   · liste non vide   → ce qui est dedans existe, ce qui n'y est pas est
--                        DÉCLARÉ ABSENT;
--   · `[]`             → n'est pas une réponse. Un foyer sans aucun des sept
--                        ne cuisine pas, et ce produit n'a rien à lui composer.
--                        L'écrivain le refuse, le lecteur le relit comme une
--                        absence.
--
-- Tous les comptes qui existent aujourd'hui sont dans le premier cas. Si
-- l'absence se lisait « ni four ni congélateur », le premier plan généré après
-- ce lot retirerait le batch cooking et la congélation à TOUT LE MONDE — un lot
-- de collecte qui dégrade le produit pour ceux à qui il n'a rien demandé.
--
-- AUCUN CHECK SQL SUR LA VALEUR, pour la raison exacte de la clé du rythme: le
-- parseur borne (liste fermée, jeton inconnu ignoré, tableau illisible traité
-- comme une absence), et une contrainte SQL ferait échouer une écriture que le
-- lecteur sait vraiment réparer — c'est testé des deux côtés
-- (`_shared/keel/kitchen_equipment_test.ts`, `api/kitchenEquipment.int.test.ts`).
--
-- ── ⛔ CE QUE CE LOT NE FAIT PAS ──────────────────────────────────────────
-- Il COLLECTE. Aucune ligne de consigne ne lit encore cette clé: l'exploitation
-- par le modèle est groupée dans le lot L7, qui la branche en un seul bump de
-- version de prompt. Jusque-là, la clé est écrite, lue, testée, et sans effet
-- sur un plan — c'est assumé, daté, et nommé ici pour que personne ne conclue
-- à un lecteur perdu.
-- ===========================================================================

begin;

comment on column public.student_goals.practical_constraints is
  'Contraintes pratiques STRUCTURÉES, sur lesquelles le générateur branche '
  '(par opposition à `situation`, qu''il ne fait que lire). Clés connues: '
  'cooking_time_min, cook_days[], recipe_difficulty, variety, budget_amount, '
  'eats_out_per_week, no_cook_days[], away_days[], kitchen_equipment[], et '
  'eating_rhythm[] = [{"slot":"breakfast"|"snack_am"|"lunch"|"snack_pm"'
  '|"dinner"|"before_bed", "at":"HH:MM"|null}] — les moments où l''élève mange '
  'sur une journée normale. L''heure est FACULTATIVE: « je grignote '
  'l''après-midi » vaut sans « à 17h », et une heure inventée deviendrait une '
  'contrainte que personne n''a exprimée. `budget_amount` est un MONTANT '
  '(monnaie du pays de l''élève) qui couvre la liste de courses entière du plan '
  'composé; il remplace `budget_band` (« tight/normal/comfortable »), qui n''a '
  'plus aucun lecteur depuis le 2026-08-13 et n''est PAS converti — un adjectif '
  'ne désigne pas une somme. Sa persistance ne sert qu''à pré-remplir la '
  'question posée à la composition suivante. `kitchen_equipment[]` (2026-08-18) '
  'est une liste FERMÉE de sept jetons — oven, stovetop, microwave, freezer, '
  'air_fryer, pressure_cooker, blender — décrivant ce avec quoi le FOYER peut '
  'cuisiner; c''est une propriété de la cuisine (partagée, durable), pas de la '
  'personne ni de la semaine. ⚠️ L''ABSENCE DE LA CLÉ N''EST PAS UNE LISTE '
  'VIDE: absente = la question n''a jamais été posée, et le moteur se comporte '
  'comme avant le 2026-08-18; une liste non vide déclare que ce qui n''y '
  'figure PAS est absent de cette cuisine; `[]` n''est pas une réponse (un '
  'foyer sans aucun des sept ne cuisine pas) et se relit comme une absence. '
  'Trois jetons changent réellement un plan: freezer (sans lui « une seule '
  'course, je congèle » et toute conservation au-delà de 3 jours sont '
  'impossibles), microwave (le geste « à réchauffer » suppose un moyen de '
  'réchauffer, sinon le temps du jour J change) et oven (l''essentiel du batch '
  'cooking). Lecteur unique: '
  'supabase/functions/_shared/keel/kitchen_equipment.ts. À la date d''écriture '
  'de ce commentaire la clé est COLLECTÉE et pas encore lue par une consigne — '
  'le branchement au prompt est groupé dans le lot suivant, en un seul bump de '
  'version.';

commit;
