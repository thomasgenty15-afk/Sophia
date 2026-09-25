// ═══════════════════════════════════════════════════════════════════════════
// REPAS GÉNÉRÉS — LE TEXTE FIXE DU PROMPT : VERSION, ARBITRAGE, PROMPT SYSTÈME
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `meal_generation.ts` (découpage des gros
// fichiers, lot 2d-2). Aucune logique changée, aucun octet de prompt changé.
// `meal_generation.ts` ré-exporte tout ce qui y était exporté : les appelants
// continuent d'importer depuis lui.
//
// Ce qui est ici : l'historique des versions du prompt et `MEAL_PROMPT_VERSION`,
// `SOLO_BOX_BLOCK`, les deux blocs d'arbitrage (`SEVERITY_READING_BLOCK`,
// `PRECEDENCE_BLOCK`), `rhythmLines`, les sections du prompt système
// (`MEAL_PROMPT_SECTION_KEYS`, `MEAL_PROMPT_SECTIONS`, `MEAL_SYSTEM_PROMPT`),
// les deux listes de champs (`MEAL_TRANSLATABLE_FIELDS`, `MEAL_TOKEN_FIELDS`)
// et les indices de recette et de variété (`RECIPE_LEVEL_HINT`,
// `VARIETY_HINT`).
//
// ⚠️ `MEAL_PROMPT_VERSION` ET `SOLO_BOX_BLOCK` SONT ICI, PAS DANS
// `meal_generation.ts` : `buildMealPrompt` (`meal_prompt.ts`) lit
// `SOLO_BOX_BLOCK`, et un module sorti n'importe jamais une valeur du fichier
// qui le ré-exporte. L'historique des versions reste juste au-dessus de la
// constante qu'il explique.
//
// ⚠️ UN SEUL MOT A CHANGÉ, CINQ FOIS : `export` devant
// `SEVERITY_READING_BLOCK`, `PRECEDENCE_BLOCK`, `rhythmLines`,
// `RECIPE_LEVEL_HINT` et `VARIETY_HINT`, qui étaient privés. `buildMealPrompt`
// les lit. Le fichier d'origine ne les ré-exporte pas.

// ── `D3′` (2026-08-22) — LE BLOC D'ARBITRAGE SORT D'ICI ────────────────────
// Il vivait en constante locale de ce fichier, qui porte +2 872 lignes non
// commitées de six sessions: sa garde n'était donc exécutable par personne
// d'autre. Il est désormais dans un module NEUF, COMMITÉ, qui n'importe RIEN
// (règle §⑨ n° 92), avec 15 épreuves et 9 mutations attrapées sur 9.
//
// ⛔ LA VARIANTE SOLO EST GELÉE OCTET POUR OCTET, et un test le tient. Le
// périmètre de `D3′` est le FOYER: c'est là que le bloc était enterré sous 2 à
// 9 blocs, et là que son rang 1 pointait vers un régime qui n'y est pas.
import { buildPrecedenceBlock } from "./precedence_tail.ts";
import { PROTEIN_ANCHOR_PROMPT_LINE } from "./protein_anchor.ts";
import { type EatingOccasionSlot, OCCASION_PROSE } from "./meal_vocabulary.ts";

/**
 * ── POURQUOI CETTE VERSION BOUGE (FF-030, volet élève) ────────────────────
 * Elle est écrite sur chaque ligne `student_generated_meals.generated_from`, et
 * c'est le seul moyen de dire d'un plan s'il a été composé AVANT ou APRÈS que
 * le modèle connaisse les contraintes dures et le corps de l'élève. Sans
 * bascule, les deux populations se mélangent dans la même colonne et la mesure
 * du §10 de la fiche (« la part de `empty_meal` médicaux a-t-elle baissé ? »)
 * devient impossible à faire après coup.
 *
 * ── POURQUOI ELLE BOUGE ENCORE (FF-037) ──────────────────────────────────
 * La consigne gagne une section: chaque repas principal est bâti autour d'un
 * aliment protéique. Le §10 de la fiche compare la part de plats principaux
 * porteurs d'une ancre AVANT et APRÈS — et cette comparaison n'est faisable que
 * si la colonne sait séparer les deux populations. Bumper est donc la moitié
 * mesurable du lot, pas une formalité.
 *
 * ── ET ENCORE (FF-038, étage B) ──────────────────────────────────────────
 * Le contrat de sortie gagne `amount` / `unit` / `state` sur chaque
 * ingrédient. Le §10 de FF-038 demande de surveiller `rejected_numeric` après
 * ce bump — un contrat qui gagne trois champs NUMÉRIQUES est exactement le
 * genre de changement qui pousse un modèle à écrire des chiffres ailleurs — et
 * la part d'ingrédients qui arrivent sans quantité structurée. Ni l'une ni
 * l'autre n'est lisible si les deux populations se mélangent dans la colonne.
 */
// ── UN SEUL BUMP POUR FF-051 ET FF-052 ────────────────────────────────────
// Les apports fixes et les propriétés de jour touchent tous deux la consigne.
// Deux bumps successifs invalideraient deux fois le cache et rendraient
// illisible toute comparaison avant/après entre les deux lots — c'est pour ça
// que les propriétés de jour ont été faites EN DERNIER.
//
// ── v8 (2026-08-11) — `health` A UNE DIRECTION À LUI ──────────────────────
// Le brief de portions du foyer appartient à cette lignée (`household_portions
// .ts` écrit en anglais POUR ce prompt). `SERVING_DIRECTION.health` rendait la
// chaîne de `maintenance`: la consigne servie change, donc la version bouge —
// sans quoi le cache continuerait de rendre l'ancienne assiette.
//
// ⚠️ CETTE VERSION NE COUVRE QUE LE TRONC PARTAGÉ. Depuis le 2026-08-12, la
// lane FOYER a son propre numéro — `HOUSEHOLD_PROMPT_VERSION`, dans
// `household_meal_generation.ts` — et la clé écrite en base est
// `meal.en.v8…+household.v2_presence`. Ce qui ne touche QUE le foyer (la liste
// d'ids, l'envie, les règles de maison, la présence) se bumpe LÀ-BAS. Ce qui
// touche les deux lanes (brief de portions, propriétés de jour, apports fixes)
// se bumpe ICI. L2 a dû poser cet axe parce que greffer la présence avait
// changé le prompt du foyer SANS que rien ne bouge: deux plans stampés pareil
// portaient des consignes différentes, et rien n'échouait.
//
// ── v9 (2026-08-12) — LE CONTRAT DE COMPOSITION CESSE D'ÊTRE « UN SEUL PLAT »
//
// C'est le bump que v8 annonçait comme dû, et il est arrivé par L4 (le moteur
// de fusion, D6). Jusqu'ici `buildPortionBrief` disait à TOUTE composition de
// foyer, sans condition: « Cook ONE set of preparations for everyone. Do NOT
// propose separate dishes. » L'échelle de fusion a besoin de deux barreaux de
// plus — deux plats dans UNE session, puis deux sessions — donc cette ligne
// devient une VARIABLE (`CookingShape`), et c'est un changement de contrat, pas
// de formulation.
//
// ⚠️ POURQUOI ICI ET PAS SUR L'AXE FOYER. `buildPortionBrief` vit dans
// `household_portions.ts`, que ce fichier-ci définit comme du TRONC (« brief de
// portions, propriétés de jour, apports fixes »). La lane INDIVIDUELLE ne
// l'appelle pas et son prompt ne bouge pas d'un octet — mais elle est stampée
// par cette constante, et c'est le prix nommé d'avance: mieux vaut une
// population individuelle qui change de numéro sans changer de consigne qu'un
// foyer où deux consignes portent le même numéro. C'est exactement ce que L2 a
// mesuré et ce que le second axe existe pour éviter.
//
// UNE COMPOSITION ORDINAIRE REND LA MÊME CONSIGNE, À L'OCTET PRÈS: `one_dish`
// rend la ligne d'avant, mot pour mot, et un test le tient.
//
// ── CE QUI N'A PAS BUMPÉ ICI, ET POURQUOI (2026-08-12, aval de L4) ────────
// Le budget de plats d'une FUSION compte désormais la bouche reprise
// (`dishBudgetFor`), et le parseur accepte la préparation d'UNE portion que les
// barreaux ② et ③ demandent. Le code changé vit dans ce fichier — donc dans le
// tronc — et pourtant la version du tronc NE BOUGE PAS. La règle n'est pas « où
// vit le code », c'est « quelle population voit une consigne différente »:
//
//   · `merge: null` (lane individuelle, ET composition de foyer ordinaire) rend
//     EXACTEMENT le plafond d'avant, la même phrase, le même budget de
//     sessions. Deux tests le tiennent, dont un qui compare le nombre annoncé
//     au nombre appliqué.
//   · seule une FUSION voit la ligne « at most N dishes » changer de nombre, et
//     une fusion n'existe que sur la lane foyer.
//
// Le bump est donc allé sur `HOUSEHOLD_PROMPT_VERSION` (v3 → v4), qui a
// exactement la portée du changement. Bumper ici aurait re-stampé toute la
// population individuelle pour un changement qu'elle ne voit jamais — c'est
// précisément ce que le second axe existe pour éviter, et le prix que v9 a payé
// une fois est un prix qu'on ne repaie pas sans raison.
//
// ── C8 ③ · L'ORDRE DE SACRIFICE A CHANGÉ LA LANE INDIVIDUELLE, ET LA
//           VERSION NE BOUGE TOUJOURS PAS — CE N'EST PAS LE MÊME CAS QUE v4
//
// ⚠️ LE FAIT, MESURÉ LE 2026-08-12 sur le MÊME flot brut, `merge: null`,
// plafond 9:
//   · avant C7 ②, le parseur jetait `dishes[10,12,14,16]` et rendait
//     `empty_slots: sat/dinner, sun/breakfast, sun/lunch, sun/dinner`;
//   · depuis C7 ②, il les GARDE et évince quatre seconds plats de cases déjà
//     servies.
// Hors fusion, `dedicatedCells` est vide — donc aucun rang 1 — mais le rang 0
// (« premier plat d'une case ») existe toujours, et c'est lui qui fait qu'un
// second plat cède la place à un premier. Le changement est FAVORABLE: il
// remplit des cases au lieu de les laisser vides.
//
// ⚠️ ET POURTANT AUCUNE VERSION NE BOUGE, parce que ce cas n'est PAS celui de
// v4. En v4, un NOMBRE ÉCRIT DANS LA CONSIGNE changeait (« at most N dishes »)
// pour une population donnée: le modèle lisait autre chose, donc le cache
// devait tomber. Ici la consigne est byte-identique POUR TOUT LE MONDE — la
// lane individuelle, la composition de foyer ordinaire, la fusion — et c'est le
// CONTRAT DE SORTIE du parseur qui change. Une version de prompt qui bougerait
// sur un prompt identique invaliderait le cache d'une population entière sans
// qu'un seul octet servi ait changé, et le numéro cesserait de vouloir dire ce
// qu'il dit.
//
// ⚠️ LA CONTREPARTIE EST NOMMÉE, ET ELLE EST PAYÉE AILLEURS: deux plans
// stampés `v9` peuvent avoir été écrêtés par deux ordres différents. Le
// précédent invoqué est celui de L3, mot pour mot — « une seconde raison qu'une
// ligne n'apparaisse pas, relisible sur `generated_from`, pas sur la version »:
// chaque éviction est NOMMÉE dans les `issues` archivées (« surplus dish "…"
// (jour/moment) was dropped instead »), donc un plan dit lui-même quel ordre
// l'a écrêté. C'est la lecture par plan, pas par colonne — et c'est ce que ce
// chantier choisit à chaque fois que le prompt n'a pas bougé.
//
// ── v10 (2026-08-17) — LE COMMENTAIRE DU JOUR J (LOT 2 / P2) ──────────────
//
// C'est le tronc, et c'est bien le bon axe: la consigne `WHAT TODAY ACTUALLY
// TAKES` et le champ `same_day` du schéma de sortie sont servis à TOUTES les
// populations — lane individuelle, foyer ordinaire, fusion, secondaire. Il n'y a
// pas ici de « population neuve » étroite comme sur l'axe foyer: tout le monde
// voit une consigne différente, donc le cache de tout le monde doit tomber.
//
// ⚠️ `HOUSEHOLD_PROMPT_VERSION` NE BOUGE PAS, et le test le tient par égalité de
// chaîne: l'enveloppe foyer (`buildHouseholdPromptBlocks`, `buildPortionBrief`)
// ne gagne pas un octet dans ce lot — le champ demandé l'est par le schéma du
// tronc, et il est lu par le parseur partagé.
//
// ⚠️ CE BUMP PAIE AUSSI UN DÉFAUT MESURÉ QUI VOYAGEAIT DANS LE MÊME BLOC: la clé
// `"uses"` était déclarée DEUX FOIS dans `== OUTPUT JSON SCHEMA ==` (une fois
// avant `honours_belief_keys`, une fois après). Un objet JSON à clé répétée est
// légal et la seconde écrase la première — le modèle lisait donc un exemple
// contradictoire sur le champ qui porte toute la jointure des lots. Corrigé ici
// plutôt que dans un lot à part: le bloc change de toute façon, et un second
// bump pour une accolade serait un cache invalidé pour rien.
//
// ── v11 (2026-08-17) — LES QUANTITÉS DU JOUR, PESÉES OU DÉNOMBRÉES (LOT 4/P4)
//
// La décision produit renverse une orientation ancienne: les parts redeviennent
// PRÉCISES. « Prendre une poignée », « une grosse portion » ne veulent rien
// dire, et c'est le tronc qui porte la moitié qui concerne TOUT LE MONDE — ce
// qu'un plat ajoute au moment de manger s'écrit en grammes ou en unités
// dénombrables. Lane individuelle, foyer ordinaire, fusion, secondaire: les
// quatre populations voient la section `WHAT A DISH ADDS ON THE DAY`, donc le
// cache des quatre doit tomber. C'est le bon axe, sans discussion.
//
// ⚠️ `MEAL_TOKEN_FIELDS` GAGNE DEUX LIGNES DANS LE MÊME BUMP, et c'est le même
// prompt qui change: la liste est rendue dans le bloc de langue du message
// utilisateur, sur les DEUX lanes. Les identifiants de boîte y entrent parce
// qu'ils sont INVENTÉS par le modèle — piège `preparations[].id`, mot pour mot:
// en français il écrirait `boite_zoe`, cohérent avec lui-même, et l'identifiant
// traduit ne se rapprocherait plus de rien.
//
// ⚠️ ET LE PROTOCOLE DES BOÎTES, LUI, NE BOUGE PAS ICI. Le bloc qui RÉCLAME les
// boîtes vit dans l'enveloppe foyer (`HOUSEHOLD_PROMPT_VERSION`), parce que les
// ids de bouches n'existent que là et qu'une boîte par personne n'a de sujet
// qu'à partir de deux bouches. C'est exactement le partage de `for_member_id`:
// le CHAMP est dans le contrat du tronc et le parseur partagé le lit, la
// CONSIGNE est dans l'enveloppe qui connaît le roster. Servir à une personne
// seule un bloc qui nomme des bouches lui apprendrait qu'un marquage existe et
// l'inviterait à en inventer un — le raisonnement de `dishOwnerSchemaBlock`,
// deuxième fois — et alourdirait une lane dont on a mesuré le 2026-08-17
// qu'elle frôle déjà le mur de temps du worker.
//
// ── v12 (2026-08-18) — LE PLAT PORTE UN NOM, EN PLUS DE SON TITRE (L7 ③) ───
//
// La demande produit: des plats qui donnent envie, au lieu de « Chicken,
// courgette and pepper rice bowls ». La façon de la satisfaire qui CASSE le
// produit est de rendre `title` plus joli — ce champ est lu à voix haute à
// table, remplit les cases étroites de la grille, et est ce à quoi on
// reconnaît son plat au moment de le cuisiner. D'où DEUX champs, jamais un
// champ transformé: `name` (court, appétissant, facultatif au contrat) et
// `title` (descriptif, inchangé au caractère près).
//
// ⚠️ LE BON AXE EST LE TRONC, SANS DISCUSSION. La section
// `EVERY DISH HAS TWO LINES` et la clé `"name"` du schéma de sortie sont
// servies aux QUATRE populations — lane individuelle, foyer ordinaire, fusion,
// secondaire — parce qu'elles vivent dans `MEAL_SYSTEM_PROMPT`. Il n'existe
// donc AUCUNE population byte-identique sur cet axe, et c'est le cas de v10 et
// de v11 mot pour mot. `HOUSEHOLD_PROMPT_VERSION` bouge dans le même lot, pour
// l'autre moitié (équipement de cuisine, déjeuner dehors), qui ne concerne QUE
// le foyer: deux changements, deux portées, deux axes.
//
// ⚠️ `MEAL_TRANSLATABLE_FIELDS` GAGNE UNE LIGNE DANS LE MÊME BUMP, et c'est le
// même prompt qui change: la liste est rendue dans le bloc de langue du message
// utilisateur, sur les deux lanes. Un `name` anglais sous un `title` français
// serait la seule ligne visible de la grille dans la mauvaise langue.
//
// ⚠️ LA PROMESSE ET LA CLÉ SE TOUCHENT, ET C'EST LA MOITIÉ QUI COMPTE. La
// section qui ORDONNE le nom est collée juste au-dessus de
// `== OUTPUT JSON SCHEMA ==`, et `"name"` est la PREMIÈRE clé du plat. C'est la
// leçon mesurée du LOT 3C: une promesse dans un souffle et une clé dans un
// autre rendent zéro déclaration sur 291 plats. Elle porte aussi le NOMBRE
// attendu (« as many names as you have dishes. Count them ») et NOMME
// l'échappatoire que le modèle prendrait à la place (enjoliver le titre) — les
// deux leviers que 3C a mesurés, l'un après l'autre.
// ── v13 (2026-08-18) — CE QU'IL PEUT VRAIMENT FAIRE, ET CE QU'IL VEUT ──────
//
// QA 01-injection, lane solo. Quatre changements du MESSAGE UTILISATEUR, tous
// mesurés sur le run réel `798c5cd6-acbf-43e3-8dcc-97128d3edd78` avant d'être
// écrits — le prompt archivé de ce run est la preuve de chaque absence:
//
//   ① LES MOYENS DE CUISSON (`kitchenEquipmentPromptLines`). L'élève avait
//     coché « plaque, micro-ondes, blender »; le plan rendu ouvre par « Heat
//     the oven » et sert des « roast potatoes ». Le champ était collecté,
//     stocké et lu par la lane foyer, jamais dit à cette lane-ci.
//   ② LE CRAN D'ACTIVITÉ (`meal_body.ts`). Collecté par quatre tuiles qui
//     PROMETTENT de dimensionner les portions, il n'entrait que dans
//     l'enveloppe déterministe, APRÈS l'appel modèle.
//   ③ L'ASPIRATION (`student_goals.aspiration`). Écrite par `/app/plan`,
//     injectée par la lane semaine, pas même SÉLECTIONNÉE ici.
//   ④ L'EN-TÊTE DU GARDE-MANGER. `-- WHAT THEY ALREADY HAVE --` était écrit
//     DEUX FOIS dans le même message (apports fixes / placard), avec deux
//     consignes opposées. Le placard devient `WHAT IS ALREADY IN THEIR
//     CUPBOARDS`.
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE, axe par axe: ① et ② ne
// touchent que la LANE SOLO (le foyer ne passe pas `kitchenEquipment`, et son
// bloc de corps est `mealBodyBlocksForMember`, inchangé); ③ n'existe que sur
// la lane solo; ④ traverse les deux, et c'est voulu — la collision d'en-tête
// est la même des deux côtés. Un compte qui n'a répondu à AUCUNE des trois
// questions reçoit un message byte-identique à v12.
// ═══════════════════════════════════════════════════════════════════════════
// v14 — LA HIÉRARCHIE EST DITE, ET ELLE EST DITE EN DERNIER (agent 2A, ②).
// ═══════════════════════════════════════════════════════════════════════════
// Trois axes, et chacun répond à une question mesurée sur cinq scénarios réels
// (`scratchpad/qa-generation/02-ponderation-solo/`):
//
//   ① L'ORDRE. Ce prompt établissait sa hiérarchie UNIQUEMENT par la position:
//     les contraintes dures en tête, la saison plus bas, la commande en
//     dernier. Aucune phrase ne dit ce qui prime sur quoi. Et la seule phrase
//     du message qui dise « X gagne » est celle de la DOCTRINE (« Where this
//     block and your own knowledge disagree, this block wins ») — c'est-à-dire
//     que le seul rang ÉCRIT du prompt donne le sommet au coach, pas à
//     l'allergie. Le bloc `-- WHEN TWO LINES ABOVE WANT DIFFERENT THINGS --`
//     l'écrit, une fois, et il est posé dans le CRAN DE RÉCENCE (fin de
//     `== WHAT TO COOK ==`) parce que ce dépôt a mesuré qu'un modèle lit la
//     consigne la plus proche de la fin comme la plus contraignante.
//
//   ② LA FORMULATION DE L'ENVIE. `what they feel like eating THIS TIME` était
//     la SEULE ligne de désir du message sans un mot de rang — l'aspiration
//     porte « never at the cost of a hard constraint », la saison porte « It
//     ranks your choices; it does not veto anything », l'envie ne portait
//     rien. Et elle est servie à trois lignes de la fin, c'est-à-dire à la
//     place la plus contraignante du message. Mesuré (run
//     `2a000000-3100-…`): une envie qui nomme l'allergène médical de l'élève
//     ressort 21 fois dans la sortie.
//
//   ③ LA SÉVÉRITÉ EST LUE. `safetyConstraintsPromptBlock` imprime
//     `severity=medical` / `strict` / `preference` sur chaque ligne, sous
//     « These are not preferences », et AUCUNE consigne ne lit ce mot: un
//     dégoût déclaré reçoit mot pour mot l'interdiction d'une anaphylaxie
//     (R15 de la checklist ①). Le déséquilibre est double, parce que la
//     ceinture de sortie, elle, ne s'arme QUE sur `medical`
//     (`findMedicalConstraintViolations`): le prompt traite les trois pareil
//     et le code ne traite comme dur que le premier.
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE, axe par axe: ① touche TOUT
// LE MONDE (c'est le but — un ordre de priorité ne peut pas être conditionnel);
// ② ne touche que les compositions où une envie a été TAPÉE; ③ ne touche que
// les élèves qui ont au moins une contrainte déclarée. Un compte sans
// contrainte et sans envie ne voit donc QUE le bloc ①.
//
// ⚠️ TRONC PARTAGÉ AVEC LA LANE FOYER. Les trois axes traversent
// `buildMealPrompt`, donc `generate-household-meal-v1` les reçoit aussi. C'est
// VOULU pour ① et ③ (la question « qu'est-ce qui prime » ne change pas de
// réponse quand la table grandit, et la sévérité y est même plus utile:
// l'étape ① a mesuré un foyer où l'allergène d'une bouche est servi à elle).
// ⚠️ POUR ②, CETTE NOTE DISAIT « la lane foyer n'appelle jamais `preferences`
// — la ligne n'existe pas dans son message, et l'axe y est inerte ». C'était
// vrai le 2026-08-18 et FAUX depuis le 2026-08-19 (lot D): le champ d'envie de
// `MealBuilder` est rendu SANS garde de lane, et il partait nulle part sur la
// branche foyer. Il traverse maintenant (`api/household.ts` →
// `body.preferences` → ce paramètre), donc l'axe ② y est ARMÉ — et il fallait
// qu'il le soit AVANT, pas après: c'est une table entière qui lit la sortie.
// La population concernée est celle qui a tapé quelque chose dans ce champ;
// sans envie, `preferences` vaut `null` et aucune ligne n'est écrite.
// Versionné sur l'axe foyer (`HOUSEHOLD_PROMPT_VERSION` v18), pas ici: pas un
// octet de ce tronc ne change.
// ── v16 (2026-08-19) · LE GROUPE ALIMENTAIRE EST DÉCLARÉ, PLUS DEVINÉ ──────
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: celle qui a un RÉGIME
// déclaré, sur les deux lanes. Le bloc voyage avec `dietaryRegimePromptLine`
// (`dietary_regime.ts`) et pas dans `MEAL_SYSTEM_PROMPT`, donc une composition
// sans régime rend un prompt BYTE-IDENTIQUE à celui de v15 — et deux tests le
// tiennent (`dietary_regime_solo_lane_test.ts :: « sans régime déclaré, le
// prompt est INCHANGÉ »`, et le test de v16 qui compare les deux messages).
//
// ⚠️ LE BUMP VAUT QUAND MÊME, et c'est la règle déjà écrite pour `v3` et `v5`
// de l'axe foyer: c'est la PRÉSENCE du bloc qui distingue deux populations
// dans la colonne, et une version qui ne bouge que « quand ça se voit » ne se
// relit pas. Le coût assumé est que la population sans régime change de numéro
// sans changer de consigne.
//
// CE QUE LE BLOC AJOUTE: une clé `"group"` sur chaque ingrédient, prise dans
// les trente `FOOD_GROUP_REFS` — c'est-à-dire la correction honnête du
// compteur de régime. Il restait faux sur une classe résiduelle nommée, les
// homonymes (« butter beans » compté sur `butter`) et les marqueurs végétaux
// dans un titre (« Vegan sausage » compté sur `sausage`), et aucun
// appariement plus malin ne l'aurait réparée sans rejouer « laitue ≠ lait ».
// ── v17 (2026-08-19) · LA BOÎTE APPARTIENT AU REPAS ───────────────────────
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: TOUT LE MONDE, et sur une
// seule ligne — celle des jetons (`MEAL_TOKEN_FIELDS`, imprimée dans le bloc de
// langue). Deux entrées en sortent (`preparations[].boxes[].id`,
// `dishes[].uses[].box_id`) et une seule y entre (`dishes[].box.id`), parce que
// la jointure a disparu: le repas PORTE sa boîte, plus personne ne la cite.
//
// ⚠️ LE BUMP VAUT MÊME POUR LA LANE INDIVIDUELLE, qui ne demande aucune boîte:
// elle voit quand même une ligne de jetons différente, donc son prompt n'est
// pas byte-identique. C'est la règle déjà écrite pour v3, v5 et v16 — c'est la
// PRÉSENCE du bloc qui distingue deux populations dans la colonne.
//
// ⚠️ `HOUSEHOLD_PROMPT_VERSION` BOUGE AUSSI, ET CE N'EST PAS UN DOUBLON. Le
// SCHÉMA de la boîte et l'ORDRE de peser vivent tous deux dans l'enveloppe
// foyer, et leur population est celle des foyers d'au moins deux bouches. Deux
// changements, deux portées, deux axes: la règle « quelle population voit une
// consigne différente », appliquée deux fois dans le même lot. Précédent exact:
// v14 (2026-08-17).
//
// ── v18 (2026-08-20) · UN CONTENANT PAR GROUPE DE MANGEURS ────────────────
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: TOUT LE MONDE, et sur la même
// ligne de jetons — `dishes[].box.id` devient `dishes[].boxes[].id`, parce que
// le repas porte désormais N contenants et non plus un. Même règle que v17, à
// une lettre près, et le bump vaut pour la lane individuelle qui ne demande
// aucune boîte: elle voit quand même une ligne de jetons différente.
//
// ── v19 (2026-08-24) · UN TERME NOMME UN SEUL ALIMENT ─────────────────────
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: TOUT LE MONDE. La ligne
// s'ajoute au bloc `== SAY THE SAME QUANTITY TWICE ==`, que les deux lanes
// assemblent — elle interdit l'alternative dans `term` (« green or brown
// lentils », « butter or olive oil »).
//
// ⚠️ POURQUOI CE BUMP N'EST PAS COSMÉTIQUE. Mesuré le 2026-08-23: une
// alternative dans `term` ne résout pas, donc son plat ne porte aucun chiffre,
// et sur `plan-F3` c'était la SEULE protéine des trois jours — neuf
// journées-bouche sans énergie. Le résolveur a appris à lire les alternatives
// SANS CONSÉQUENCE le même jour (`resolveAlternative`), mais il refuse toujours
// les vraies; la consigne tarit la source, le résolveur rattrape le reste.
//
// ⛔ LE MILLÉSIME EST CE QUI SÉPARE LES DEUX POPULATIONS dans la colonne
// `generated_from->>'prompt_version'`. Sans lui, un plan écrit hier et un plan
// écrit demain se compteraient dans le même dénominateur, et aucun seuil ne
// serait relisible. C'est la règle déjà appliquée à v3, v5, v16, v17 et v18.
//
// ── v20 (2026-09-01) · LA PART CONGELÉE A UNE CLÉ ─────────────────────────
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: TOUT LE MONDE. Le schéma de
// sortie gagne `dishes[].uses[].kept`, et le bloc
// `== NOTHING SITS IN THE FRIDGE FOR A WEEK ==` gagne le paragraphe qui dit
// PAR QUEL CHAMP on déclare la troisième sortie. Les deux vivent dans le tronc,
// donc les deux lanes les voient.
//
// ⚠️ POURQUOI CE BUMP N'EST PAS COSMÉTIQUE. Mesuré le 2026-09-01 sur le décor
// « une session de cuisine, un congélateur, sept jours »: 8 plats sur 21 jetés
// par la fenêtre du cuit, quatre journées réduites à leur petit-déjeuner. Le
// modèle avait pourtant écrit le congélateur TROIS fois — dans la méthode du
// plat, dans celle de la casserole, dans le déroulé de la session — parce que
// la consigne le lui demandait déjà. C'était de la prose; rien ne la lisait.
// La consigne d'avant promettait une sortie que le parseur ne pouvait pas
// entendre, ce qui est la définition d'une promesse sans clé.
//
// ⚠️ CE QUE LE BUMP NE FAIT PAS: relâcher la garde. `kept: "freezer"` n'ouvre
// la fenêtre que si le foyer a DÉCLARÉ un congélateur, et un modèle qui
// n'écrit jamais le champ produit exactement le plan de v19, au plat près.
//
// ── v21 (2026-09-01) · LES JOURS HORS DE PORTÉE SONT NOMMÉS ───────────────
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: celle dont la fenêtre porte
// des journées qu'aucun lot n'atteint — c'est-à-dire, sans congélateur, tout
// plan plus long que trois jours par jour de cuisine. Deux lignes s'ajoutent
// sous les jours de cuisine (`canCookLines`, dans le tronc):
//   ① les journées hors de portée, NOMMÉES, avec leur sortie (cuisiner sur le
//      moment) et l'avertissement que le plat de lot y sera jeté;
//   ② la permission BORNÉE de faire déborder la session, quand elle est seule.
// Et le bloc statique du temps gagne le cas où « cuisiner moins » n'existe pas.
//
// ⚠️ POURQUOI CE BUMP N'EST PAS COSMÉTIQUE. La règle ① existait déjà, en
// général, dans `== NOTHING IS EATEN BEFORE IT IS COOKED ==` — et elle ne
// mordait pas: mesuré le 2026-09-01, le modèle a écrit huit plats de lot sur
// des journées hors de portée, tous jetés par le parseur. C'est la leçon
// d'`addedCookDays`: une règle générale ne se compare pas, un jour NOMMÉ si.
//
// ⚠️ ET ② RENVERSE UNE CONSIGNE. Jusqu'ici les minutes étaient un plafond sec
// (« cook LESS and put the rest on another cooking day »), ce qui, sur un seul
// jour de cuisine, faisait sous-nourrir la semaine — le « rest » n'avait nulle
// part où aller. La permission est bornée par `SESSION_OVERRUN_FACTOR` et
// conditionnelle: elle ne sort QUE là où l'autre sortie n'existe pas.
//
// ⛔ UN PLAN SANS TENSION REND v20 AU CARACTÈRE PRÈS. Aucune journée hors de
// portée ⇒ aucune des deux lignes, et un test le tient.
// ══════════════════════════════════════════════════════════════════════════
// v21 → v22 — L'OPTION « TOUT DANS UNE SESSION DE CUISINE » (2026-09-01)
// ══════════════════════════════════════════════════════════════════════════
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: celle qui a COCHÉ l'option,
// et elle seule. Sans la case, le prompt est byte-identique à v21 — un test le
// tient, et c'est ce qui rend les deux populations comparables dans
// `generated_from->>'prompt_version'`.
//
// ⚠️ CE N'EST PAS « UN JOUR DE CUISINE DE PLUS OU DE MOINS ». Trois choses
// changent ensemble, et aucune ne se déduit des deux autres:
//   ① les jours de cuisine sont RAMENÉS À UN — le premier coché que la fenêtre
//      contient —, et la consigne le NOMME au lieu de laisser le modèle
//      répartir (« put every cooking session on those days » en autorisait
//      trois);
//   ② la conservation devient EXPLICITE: tout ce qui ne se mange pas dans les
//      `MAX_FRIDGE_DAYS` jours doit porter `kept: "freezer"` sur son lien —
//      la clé existe depuis v20, mais rien ne la RÉCLAMAIT;
//   ③ la session a le droit de déborder (`sessionCeilingMinutes`), parce
//      qu'elle porte seule la semaine PAR CONSTRUCTION.
//
// ⛔ ET L'OPTION NE PART QU'AVEC UN CONGÉLATEUR DÉCLARÉ. La porte est chez
// l'appelant (`hasFreezerDeclared`), pas ici: ce module reçoit un booléen déjà
// tranché. Sans congélateur, ② est une instruction que la garde d'aval
// (`freezerClaimedWithoutOne`) refuserait lien par lien — on aurait écrit un
// prompt qui demande ce que le parseur jette.
// ══════════════════════════════════════════════════════════════════════════
// v22 → v23 — « JE CUISINE LA VEILLE », ET LA FIN DES JOURS DE CUISINE COCHÉS
// ══════════════════════════════════════════════════════════════════════════
//
// DEUX CHANGEMENTS, ET ILS SE TIENNENT. Le champ « les jours où tu cuisines » a
// été retiré des deux écrans le 2026-09-01: le plan ne demande plus QUELS jours
// on cuisine, seulement QUAND tombe la session. `cook_days` est désormais écrit
// vide par les deux écrivains, donc `cookDayLines` sort sur
// `declared.length === 0` — le modèle pose ses sessions lui-même — et la
// population qui voyait « they can only cook on: … » s'éteint.
//
// À sa place, `cookOnlyDay`: le plan peut commencer UN JOUR PLUS TÔT, et ce
// jour-là est une journée de cuisine où RIEN ne se mange. Ce qui change dans le
// message:
//   ① la liste « days to fill » ne le contient pas, et le plafond de plats est
//      calculé sur les jours qui portent des repas — le laisser sur la fenêtre
//      entière aurait autorisé un jour de plats de plus que le plan n'en porte;
//   ② une phrase le NOMME et interdit d'y écrire un plat (une absence ne
//      s'obéit pas: le modèle connaît le jour par la date de départ);
//   ③ il entre dans les jours de cuisine effectifs, donc `singleSessionCookDay`
//      le désigne et `daysOutOfBatchReach` sait compter à partir de lui.
//
// ⛔ SANS VEILLE ET SANS JOURS COCHÉS, LE MESSAGE EST CELUI DE v22 MOINS LA
// LIGNE DES JOURS DE CUISINE. Un test le tient.
// ══════════════════════════════════════════════════════════════════════════
// v23 → v24 — LA FENÊTRE CRUE ATTEINT ENFIN LE MODÈLE (2026-09-01)
// ══════════════════════════════════════════════════════════════════════════
//
// LA POPULATION QUI CHANGE: tout plan dont la fenêtre est assez longue pour
// qu'une famille fragile morde — c'est-à-dire tout plan de plus de deux jours.
// Un bloc s'ajoute sous les moyens de cuisson (`rawReachLines`), qui NOMME le
// dernier jour qu'une course du premier jour peut nourrir, famille par famille.
//
// ⚠️ CE N'EST PAS UNE RÈGLE NEUVE, C'EST UNE RÈGLE QUI N'ÉTAIT DITE À PERSONNE.
// `RAW_WINDOW_DAYS` date l'achat de chaque article depuis le 2026-08-22, et
// `grocery_waves.ts` en déduit correctement qu'il faudra une seconde course.
// Mais ça tourne APRÈS la composition: le modèle posait le poulet le samedi
// sans savoir, et la personne lisait une liste sans date. Rapporté sur un plan
// réel: « cuisiner le poulet acheté le lundi, le samedi ».
//
// ⛔ ELLE N'INTERDIT PAS, ELLE OBLIGE À LE DIRE. La sortie honnête — une course
// plus proche de la session — existe déjà dans le moteur; ce que le lot refuse
// est le silence.
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LES CONTENANTS D'UNE PERSONNE SEULE — 2026-09-01.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, RAPPORTÉ SUR UN PLAN RÉEL ──────────────────────────────────
 *     « je viens de créer un plan en mode solo et il n'y a pas l'histoire des
 *       barquettes »
 *
 * ⛔ ET C'ÉTAIT UNE DÉCISION ÉCRITE, PAS UN OUBLI. `generate-meal-v1` passait
 * `boxMemberIds: []` avec ce motif, mot pour mot: « une personne seule a bien
 * des boîtes dans sa vraie cuisine; ce qu'elle n'a pas, c'est deux bouches à
 * départager — et le protocole des boîtes n'existe que pour ça ». Vérifié en
 * base: le dernier plan solo porte `with_box: 0` sur quatre plats.
 *
 * Le raisonnement était juste sur le PROTOCOLE et faux sur le PRODUIT. Ce que
 * le protocole foyer fait — départager des mangeurs — n'a effectivement aucun
 * sujet ici. Mais ce que la PERSONNE lit — « dimanche, tu remplis quatre
 * barquettes, voilà ce qu'il y a dedans » — n'a rien à voir avec le nombre de
 * bouches: c'est ce que la cuisine du dimanche produit, et ça manquait.
 *
 * ── CE QUI CHANGE PAR RAPPORT AU BLOC FOYER, ET POURQUOI ──────────────────
 * ⛔ AUCUN `member_ids`, ET C'EST LA MOITIÉ QUI COMPTE. Servir un bloc qui
 * nomme des bouches à quelqu'un qui mange seul lui apprendrait qu'un marquage
 * par personne existe et l'inviterait à en inventer un — le raisonnement de
 * `dishOwnerSchemaBlock`, et le motif exact pour lequel la lane solo n'avait
 * rien. Ici le couvercle ne porte pas de nom parce qu'il n'y a personne à
 * distinguer, et le bloc le DIT.
 *
 * ⚠️ IL S'AJOUTE AU `systemPrompt`, donc il fait une SECONDE variante
 * cacheable. C'est le prix, et il est assumé: le bloc doit être lu comme un
 * schéma (il décrit une clé de sortie), et un schéma qui vivrait dans le
 * message utilisateur serait la seule règle de forme à ne pas être avec les
 * autres.
 */
export const SOLO_BOX_BLOCK = [
  "== ONE CONTAINER PER PORTION PUT ASIDE ==",
  'Every dish that takes from a preparation carries one more key: "boxes" --',
  "the container that portion goes into on the day the batch is cooked.",
  '  "boxes": [{ "id": "box_<day>_<slot>",',
  '              "items": [{ "preparation_id": "prep_x" or null,',
  '                          "term": "what is in it",',
  '                          "grams": <whole grams of READY food> }] }]',
  "Exactly ONE box per dish that draws on a preparation. They eat alone, so no",
  "lid carries a name: the day and the meal are what tells them which one to",
  "open. Ids are lowercase ASCII, invented by you, and each one is used once in",
  "the whole plan.",
  "The grams are what goes IN the container once cooked, not the raw weight of",
  "the shopping. preparation_id is null when that item is added fresh on the",
  "day, so no batch holds it.",
  "One box holds that WHOLE meal -- every preparation the dish takes from goes",
  "in the same container, not one tub per pan. A dish that cooks from scratch",
  'on the day has no "boxes": nothing was weighed ahead for it.',
].join("\n");

// ⟳ v28 (2026-09-06) — LA LISTE DES JOURS EST ANCRÉE SUR LA DATE D'OUVERTURE
// DE LA FENÊTRE, plus sur « aujourd'hui ». Le message ne peut donc plus se
// contredire quand la fenêtre démarre la semaine prochaine, et la garde qui
// interdisait ce départ (`window_beyond_this_week`) est retirée. Le prompt
// change pour TOUTE la population — les deux lanes passent par
// `buildMealPrompt` —, et c'est très exactement le prix que le lot du
// 2026-08-12 avait refusé de payer parce que « l'écran n'a jamais proposé »
// cette fenêtre. L'écran la propose depuis aujourd'hui.
// ⟳ v29 (2026-09-07) — UNE RECETTE SE CUISINE UNE FOIS DANS LA FENÊTRE. Un lot
// couvre plusieurs jours; une seconde session ne refait pas la même
// préparation, et la renommer par son jour ne la rend pas différente. Les
// petits-déjeuners comptent. Mesuré avant: trois casseroles de muffins aux
// œufs, six matins identiques. Le tronc change pour les deux lanes.
// ⟳ v30 (2026-09-09) — LA CADENCE DE COURSES ATTEINT LA CONSIGNE. Population
// qui voit une consigne différente: celle qui a répondu aux deux questions de
// P2 ET dont le plan s'appuie sur le congélateur (`usesFreezer`) — une course
// pour plusieurs sessions. Pour elle, la sortie de la fenêtre crue devient
// « congelé à l'achat, sorti la veille » au lieu de « racheté la veille ».
// Mesuré avant: la liste disait « dinde achetée mercredi, à congeler », le
// déroulé de dimanche disait « acheter la dinde fraîche le jour même ». Pour
// tous les autres, la consigne est celle de v29 au caractère près.
// ⟳ v32 (2026-09-11, LOT D) — LA RECETTE DIT CE QUI LA TIENT. Le tronc gagne le
// bloc `== SAY WHAT HOLDS THE RECIPE TOGETHER ==`, la clé `components` sur les
// plats et les préparations, et `part` sur chaque ligne. Population concernée:
// TOUTE, les deux lanes passent par `buildMealPrompt`. Ce que ça achète est
// mesuré (revue du 2026-09-11 §5): sans cette structure, l'ajusteur de
// proportions a réécrit quatre recettes de la campagne — tahini 45 → 40 g,
// huile 25 → 20 g, laitue 50 → 68,7 g — parce qu'aucune contrainte ne portait
// le rapport sauce/base. Sans `components`, un bloc reste désormais NON
// AJUSTABLE en proportions: le prompt et le moteur changent ensemble, dans le
// même lot, et la promesse touche sa clé de schéma.
// ⟳ v33 (2026-09-12, LOT 1) — LE MODÈLE N'ÉCRIT PLUS LA LISTE DE COURSES.
// La clé `shopping_list` quitte le schéma de sortie, les deux lignes
// `shopping_list[].*` quittent `MEAL_TRANSLATABLE_FIELDS`, et la consigne
// `mode = to_shop` dit désormais d'où vient la liste. Population concernée:
// TOUTE — le bloc vit dans `MEAL_SYSTEM_PROMPT`, donc les deux lanes.
// Ce que ça achète est mesuré (revue de clôture C6 § 5): sur la campagne des
// six tirs, **2 plans sur 6 ont été refusés** parce que le modèle avait oublié
// un achat que sa propre recette demandait. La liste est maintenant PRODUITE
// depuis les ingrédients finaux (`rebuildShoppingQuantities`), donc un oubli
// du modèle ne peut plus coûter un plan — il se compte (`model_omitted`).
// ⚠️ LA LECTURE RESTE. `parseGeneratedMeal` lit toujours `root.shopping_list`
// quand elle est là: les réponses d'archive et les plans déjà écrits la
// portent, et la refuser les rendrait illisibles.
// ⟳ v35 (2026-09-25) — LA BOÎTE EST DÉJÀ FAITE. Le bloc `same_day` dit que
// le plat qui tire sur des casseroles sort d'UNE boîte remplie à la session
// (plat et féculent côte à côte): sa `method` dit chaud ou froid et ce qu'on
// ajoute, jamais ce qui est déjà dedans. Le déroulé de session s'arrête à la
// cuisson (le Boxing liste les boîtes), l'exemple « reheat a portion » et les
// deux lignes du schéma (`method`, `run_through`) suivent. Mesuré avant, 7
// derniers plans: 59 repas en boîte sur deux casseroles, 59 méthodes qui
// réunissent ou réchauffent séparément la viande et le féculent (« Assembler
// le porc et les pâtes », « dans deux poêles couvertes »). Population: TOUTE.
// ⟳ v36 (2026-09-25) — CHAUD OU FROID, PLAT PAR PLAT. La consigne v35 citait
// une phrase de repli entière (« Eat it cold, straight from the container. »):
// au premier run qui l'a servie, 14 méthodes sur 14 la recopiaient mot pour
// mot, dîners de bœuf et de lentilles compris (brouillon `6b9be1e0`). Le run
// d'avant avait tout réchauffé (14 sur 14, `299f5f82`): le choix n'était pas
// fait par plat. La phrase citée est retirée; le bloc dit ce qui se réchauffe,
// ce qui peut se manger froid, et qu'une même phrase partout est un choix non
// fait.
// ⟳ v37 (2026-09-25) — AUCUN ALIMENT DANS LES EXEMPLES, ET LES MINUTES DANS
// LE DÉROULÉ. Mesuré sur les 3 plans servis en v35/v36 contre les 42 d'avant:
// l'huile ajoutée sous 2,5 ml passe de 3/305 lignes à 10/13 — les exemples
// « drizzle the olive oil and grate the parmesan », « squeeze the lemon » et
// « add the salad and the lemon » étaient recopiés, puis l'huile réduite à
// 0,3 ml pour tenir « never both at full size ». Les déroulés qui renvoient à
// un temps non dit (« selon son temps indiqué ») passent de 0/116 à 4/12:
// la ligne de schéma `run_through` exige désormais la chaleur ET les minutes,
// et le bloc des sessions le redit, féculent compris.
// ⟳ v38 (2026-09-25) — LE DÎNER SE RÉCHAUFFE TOUJOURS. En v37, « a dinner is
// reheated unless the dish itself is meant cold » laissait une porte: sur
// `ffad99ae`, 4 dîners sur 7 servis froids « comme une salade de riz et de
// saumon » — le modèle rebaptisait le plat pour passer. Le froid n'est plus
// permis qu'au DÉJEUNER, sur un plat aussi bon froid que chaud, et la phrase
// du froid ne nomme pas le contenu de la boîte.
// ⟳ v39 (2026-09-25) — LES SESSIONS QU'ILS ONT CHOISIES. Quand la personne a
// choisi un nombre de sessions et une plage de temps (`cooking_plan.ts`), le
// message dit « cooking sessions: exactly N … on fri, sun » au lieu de « at
// most 7 », et « at most N minutes — the top of the range they chose » au lieu
// de « about N minutes ». Mesuré sur `a0481b9c`: deux sessions demandées, et
// trois nombres dans la consigne (les jours, « at most 7 », le conseil système
// « two or three »). Population: les plans à cadence dérivée; les autres
// reçoivent les phrases d'avant, au caractère près.
// Le soir même, MÊME VERSION: « the top of the range they chose » devient « the
// time they chose » (les plages sont remplacées par des durées « environ »).
// Aucune génération n'avait encore tourné sous v39.
// ⟳ v40 (2026-09-25) — TOUT PLAT EN BOÎTE SE RÉCHAUFFE. v38 permettait le
// froid au DÉJEUNER « quand le plat est aussi bon froid », avec « a grain
// salad » en exemple: sur `a0481b9c` puis `54aec009`, 5 et 7 déjeuners sur
// 5 et 7 servis froids « comme une salade de céréales », poulet mijoté
// compris, et le même plat froid à midi puis chaud le soir. Le froid n'est
// plus permis qu'à un plat composé comme une salade froide, et son titre le
// dit — l'écart se voit. La phrase « one sentence repeated… » est retirée:
// un réchauffage identique sur chaque plat est juste, pas un choix manqué.
// Même version, même jour (écrit avant le bump): quand la personne a choisi
// son nombre de courses sans s'appuyer sur le congélateur, `rawReachLines`
// dit les jours de courses et ce que chaque session peut cuisiner frais
// (`plannedShopLines`), au lieu de « the app schedules a later shop ».
// Mesuré sur `54aec009`: deux courses choisies, quatre faites.
// ⟳ v41 (2026-09-25) — LE POISSON CUIT SUIT LA RÈGLE COMMUNE. La phrase
// « cooked rice and cooked seafood … same day or the day after » posait pour
// le poisson une limite que rien ne vérifiait et qui contredisait le code:
// décision produit n° 14 (« conservation = jour de cuisson + 2 »,
// `MAX_FRIDGE_DAYS`) et `PLATE_WINDOW_DAYS` (poisson: 2 jours de l'achat au
// dernier repas). Décision du propriétaire le 2026-09-25: « garde J+2 et
// retire la phrase du prompt ». Le riz, qui n'était pas dans la question,
// garde sa ligne.
// ⟳ v42 (2026-09-25) — UNE EXCLUSION AU MOMENT DIT « NOT at », PLUS « ONLY AT ».
// `retained_items_routing.ts#occasionSuffix`: « OFF the table: œufs -- ONLY AT
// breakfast » a été lu « des œufs, seulement au petit-déjeuner » (`31aef694`,
// trois petits-déjeuners aux œufs; `6ef02747`, trois au tofu). La ligne dit
// maintenant « -- NOT at breakfast; the other meals may keep it ».
// ⟳ v43 (2026-09-25) — LE GESTE DU JOUR DÉCIDÉ PAR LE MOMENT, SANS EXEMPLE
// CITÉ, ET LA FENÊTRE DU FRIGO DITE DEPUIS LE NOMBRE DU CODE. Banc des trois
// foyers: des œufs durs du matin « réchauffés 8 min à la casserole couverte »
// (l'exemple cité, recopié partout, micro-ondes coché), et « Cooked on
// Thursday means eaten by Sunday » pendant que le code jetait le dimanche.
export const MEAL_PROMPT_VERSION = "meal.en.v43_no_false_promise";

/**
 * ③ — CE QUE `severity` VEUT DIRE, posé JUSTE SOUS la liste qui le porte.
 *
 * ⚠️ IL N'EST PAS DANS `safetyConstraintsPromptBlock`, ET C'EST DÉLIBÉRÉ. Cette
 * fonction-là est partagée par la conversation (`sophia-brain/router/run.ts`)
 * et par la lane semaine. Dans une CONVERSATION, un dégoût et une allergie
 * s'arbitrent en parlant à la personne; ici on compose une assiette sans elle,
 * et le mot `preference` doit pouvoir céder. Écrire la nuance dans la fonction
 * partagée la servirait à trois lanes dont deux ne l'ont pas demandée.
 *
 * ⚠️ CE BLOC N'ASSOUPLIT AUCUNE CEINTURE. Les trois sévérités restent
 * INTERDITES d'assiette — la seule chose qu'il change est ce qu'un dégoût a le
 * droit de COÛTER: il ne justifie pas de supprimer un repas, et il cède quand
 * il entre en collision avec une contrainte médicale, un régime ou la faisabilité.
 * Côté code, rien ne bouge: `findMedicalConstraintViolations` filtre déjà
 * `severity !== "medical"`, donc un `preference` n'a jamais armé le verrou
 * binaire et n'en perd pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * v15 — LA QUEUE DU BLOC: NE PAS NOMMER L'ALLERGÈNE DANS UN PLAN.
 * ═══════════════════════════════════════════════════════════════════════════
 * ── CE QUE ÇA COÛTAIT, MESURÉ EN RUN RÉEL ────────────────────────────────
 * Run `2a000000-3100-4000-8000-000000000001` (lane solo, v13). L'envie du
 * moment nommait l'allergène MÉDICAL de l'élève (« a proper tahini and sesame
 * noodle bowl »). Le modèle a fait EXACTEMENT ce qu'il fallait: neuf plats,
 * zéro sésame, zéro tahini, zéro viande pour une végétarienne — et il l'a
 * expliqué dans le `why` du plat concerné:
 *
 *     "I cannot honour the requested tahini and sesame because of your
 *      medical allergy, or the cold-only dinner…"
 *
 * Réponse du produit: **HTTP 422 `empty_meal`, `lock:
 * blocked_medical_constraint`**. La semaine entière détruite, sans un mot à
 * l'élève. Le verrou rejoué sur le texte exact que `parseGeneratedMeal`
 * construit rend DEUX morsures, et les deux sont dans cette phrase-là:
 * `tahini` @953 et `sesame` @964. Aucun ingrédient, aucun titre, aucune ligne
 * de courses ne mord.
 *
 * ── ET LE PROMPT ORDONNAIT CE GESTE, DE TROIS ENDROITS ───────────────────
 *   · le bloc de sécurité: « You MAY name them to warn, to exclude… »;
 *   · `-- WHAT THEY HAVE TOLD ME --`: « name the thing you could not do »;
 *   · le schéma: `"why": "one sentence: why THIS dish for THIS student"`.
 * Plus le modèle obéissait à la hiérarchie, plus sûrement son plan mourait.
 *
 * ── POURQUOI LA CEINTURE N'EST PAS TOUCHÉE ───────────────────────────────
 * Parce qu'elle a raison. « Les consignes sont consultatives, donc la garantie
 * ne peut pas vivre dans le prompt » — et le lot voisin
 * (`06-attribution-allergies`) le pose noir sur blanc: « le 422 n'est pas le
 * défaut qu'on répare, c'est le comportement CORRECT devant un plan qui NOMME
 * un jeton médical ». On ne desserre donc rien. On retire la CONSIGNE qui
 * poussait le modèle dans la phrase fatale.
 *
 * ── LA FORMULATION DE REMPLACEMENT EST MESURÉE, PAS SUPPOSÉE ─────────────
 * `findMedicalConstraintViolations` sur `sesame`/`medical`:
 *     "plain ready-cooked noodles labelled sesame-free"      → 0
 *     "noodles with no sesame"                               → 0
 *     "one of the foods on your medical list"                → 0
 *     "swapped for a seed you can eat"                       → 0
 *     "contains sesame"                                      → 1
 *     "I cannot honour the requested sesame because of your medical allergy" → 1
 * La négation ne désarme que quand elle porte sur L'ALIMENT. Dans une phrase
 * de refus elle porte sur le VERBE (« cannot honour »), et le nom reste nu.
 * C'est la cicatrice `forbidden-matcher-explanation-word-order` du dépôt, vue
 * par son autre bout. La phrase proposée est donc celle dont on a MESURÉ
 * qu'elle rend zéro morsure.
 */
export const SEVERITY_READING_BLOCK = [
  "Each of those lines carries a `severity`, and it is not decoration:",
  "- severity=medical — a health event, not a taste. Never on a plate, in any",
  "  amount, in any form, cooked or raw, and never hidden in a stock or a fat.",
  "- severity=strict — off the plate too, for the same practical purpose.",
  "- severity=preference — they simply do not like it. Keep it off the plate,",
  "  but it is NOT a safety matter: it never justifies leaving a meal out, and",
  "  it is the first thing that gives way when it collides with anything above",
  "  it. Do not write about it as if it were dangerous.",
  "",
  // ── v15 ── CE QU'UN PLAN N'A PAS LE DROIT D'ÉCRIRE, ET POURQUOI ─────────
  // Voir l'en-tête `NAMING_IN_A_PLAN` juste au-dessous pour la mesure.
  "NAMING ONE OF THEM IN A PLAN IS NOT A WARNING — IT DESTROYS THE PLAN.",
  // ⚠️ LA PERMISSION DE NOMMER EST DOUZE LIGNES PLUS HAUT, DANS LE MÊME
  // MESSAGE, et elle vient d'une fonction partagée avec la CONVERSATION, où
  // elle est juste (un allergique a le droit de demander « est-ce qu'il y a
  // des arachides dedans ? »). On ne la retire donc pas: on dit, plus bas,
  // sur quelle surface elle ne vaut pas. Deux consignes qui se contredisent
  // sans que rien ne les départage, c'est le défaut que ce lot mesure.
  "The permission to name them, twelve lines above, is for a CONVERSATION.",
  // ⛔ S2 (2026-08-22) — « severity=medical » SEUL ÉTAIT DEVENU FAUX ICI.
  //
  // La ceinture de sortie couvre `medical` ET `strict` depuis
  // `BELT_BLOCKING_SEVERITIES` (`safety_constraints.ts`). Ce paragraphe
  // annonçait au modèle que seul un nom `severity=medical` détruit la semaine
  // — donc, mot pour mot, qu'un nom `severity=strict` est sans danger dans un
  // plat. Six contraintes actives (`dairy`, `lactose`, `gluten`, `fructose`,
  // `fruits_de_mer`, `mustard`) sont entrées sous la ceinture ce jour-là.
  //
  // ⚠️ CE N'EST PAS UNE PRÉCAUTION, C'EST UNE CORRECTION DE FAIT MESURÉE. Le
  // run `2a000000-3100-4000-8000-000000000001` (voir l'en-tête juste au-dessus)
  // a détruit une semaine entière parce que le modèle OBÉISSAIT au reste du
  // prompt et nommait l'allergène dans son `why`. Laisser la phrase telle
  // quelle après `S2`, c'était rouvrir ce trou pour une population neuve, avec
  // la consigne qui pousse dedans écrite dans le même message.
  "This is a plan somebody cooks from, not a conversation. A severity=medical",
  "or severity=strict name written in a dish — its title, its method, its",
  "`why`, its ingredients — or in the shopping list is caught by a",
  "deterministic belt AFTER you, and the belt does not remove that sentence:",
  "it empties the WHOLE week, and the student is shown nothing at all.",
  "So: pick a food they can eat, write the dish you DID pick, and when you have",
  "to explain the swap, write \"one of the foods on your medical list\" and never",
  "the food. That phrasing is safe; \"I cannot use <the food> because of your",
  "allergy\" is the exact sentence that empties the week.",
  // La formulation jumelle pour le cran `strict`: « medical list » serait faux
  // pour une intolérance, et un modèle à qui on donne une phrase fausse en
  // invente une autre. Mesurée à ZÉRO morsure contre les 58 contraintes
  // actives de la base, ceinture élargie comprise.
  "For a severity=strict line, the safe phrasing is \"one of the foods you keep",
  "off your plate\" — same rule, same belt, and never the food itself.",
].join("\n");

/**
 * ① — LA HIÉRARCHIE, ÉCRITE UNE FOIS, DANS LE CRAN DE RÉCENCE.
 *
 * ── POURQUOI ELLE MANQUAIT, ET CE QUE ÇA COÛTAIT ─────────────────────────
 * Ce prompt porte SIX familles de désirs qui peuvent se contredire — les
 * contraintes dures, le régime, la méthode du coach, ce que la cuisine peut
 * faire, ce que l'élève a écrit, ce dont il a envie ce soir — et il n'écrivait
 * nulle part laquelle gagne. La hiérarchie n'était portée que par la POSITION,
 * et la position dit l'inverse de ce qu'on veut: la sécurité est en TÊTE,
 * c'est-à-dire au rang que ce dépôt a mesuré comme le MOINS contraignant,
 * pendant que l'envie du soir est trois lignes avant la fin.
 *
 * Pire, la seule phrase du message qui affirme un rang est celle de la
 * doctrine: « Where this block and your own knowledge disagree, this block
 * wins ». Lue seule — et elle l'était — elle donne le sommet au coach.
 *
 * ── OÙ ELLE EST POSÉE, ET POURQUOI PAS AILLEURS ──────────────────────────
 * En queue de `== WHAT TO COOK ==`, juste avant le bloc de langue. C'est le
 * même raisonnement que celui qui a fait descendre le bloc satiété du foyer
 * après un run rouge, et que celui qui garde la commande en dernier: la
 * consigne la plus proche de la fin est lue comme la plus contraignante. Une
 * règle d'arbitrage doit occuper ce cran, sinon elle arbitre depuis le rang
 * qu'elle est censée corriger.
 *
 * ── CE QU'ELLE NE FAIT PAS ────────────────────────────────────────────────
 * Elle ne DÉPLACE rien. Les contraintes dures restent en tête du message (une
 * troncature de budget de prompt ne doit pas emporter la ligne « pas
 * d'arachide »), la saison reste où elle est. Elle ajoute la seule chose qui
 * manquait: la phrase qui dit dans quel ordre les lire.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ `D3′` (2026-08-22) — CE PARAGRAPHE-CI N'ÉTAIT VRAI QUE SUR LA LANE SOLO.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * « En queue de `== WHAT TO COOK ==`, juste avant le bloc de langue » est vrai
 * pour `generate-meal-v1` — 0 bloc après, sur 74 prompts archivés. Sur
 * `generate-household-meal-v1` c'est FAUX: le suffixe de foyer est concaténé
 * APRÈS `built.userMessage`, et la mesure du 2026-08-22 rend 2 à 9 blocs de
 * contenu après l'arbitrage (`scripts/keel_d3_position_du_bloc_20260822.ts`).
 *
 * ⛔ ET LE RANG 1 Y ÉTAIT FACTUELLEMENT FAUX. « The hard constraints and the
 * diet at the VERY TOP of this message » envoyait le modèle chercher le régime
 * en tête, alors que `== WHAT THE SHARED BASE MUST RESPECT ==` est 63 à 101
 * lignes PLUS BAS. La lane foyer a donc sa propre variante, qui NOMME ses
 * blocs de verrou au lieu de désigner une position.
 *
 * ⚠️ LE TEXTE VIT MAINTENANT DANS `precedence_tail.ts`, module NEUF et COMMITÉ
 * qui n'importe rien. Cette ligne-ci n'est plus qu'un point de câblage: le
 * texte solo est GELÉ octet pour octet et un test l'exige — ne pas
 * l'« harmoniser » avec la variante foyer par symétrie.
 */
export const PRECEDENCE_BLOCK = buildPrecedenceBlock("solo");

/**
 * Les moments, un par ligne, avec leur taille quand elle a été donnée.
 *
 * LA TAILLE EST REPRISE TELLE QUELLE et jamais complétée: « large » quand il
 * l'a dit, rien quand il ne l'a pas dit. Écrire « medium » par défaut sur les
 * moments muets poserait une contrainte que personne n'a exprimée, et le modèle
 * la respecterait — c'est bien le problème. Un moment sans taille est un moment
 * que le modèle compose comme il l'entend.
 *
 * « for them » et pas « large » tout court: sans le possessif, le modèle lit
 * une consigne de portion absolue. C'est la journée de CET élève qu'on décrit,
 * et gros pour lui n'est pas gros dans l'absolu.
 */
export function rhythmLines(rhythm: readonly EatingOccasionSlot[]): string {
  return rhythm
    .map((o) =>
      o.size
        ? `- ${OCCASION_PROSE[o.slot]} (${o.size} for them)`
        : `- ${OCCASION_PROSE[o.slot]}`
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Le prompt
// ---------------------------------------------------------------------------

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-13 · LOT 2 — LE PROMPT SYSTÈME, EN SECTIONS NOMMÉES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QUE CE DÉCOUPAGE FERME (revue du 2026-09-12, P1 §3). L'appel de
 * réparation transmettait `built.systemPrompt`, donc CE prompt entier — qui
 * demande un PLAN COMPLET, son `OUTPUT JSON SCHEMA` et la couverture de tous
 * les jours — pendant que le message utilisateur exigeait un PATCH. Deux
 * schémas contradictoires dans le même appel : le modèle peut rendre le plan
 * que le système lui demande, et le lecteur de patch n'en tire rien.
 *
 * ⛔ ET LA RÉPARATION N'EST PAS UNE DÉCOUPE PAR EXPRESSION RÉGULIÈRE. Le plan
 * l'interdit en toutes lettres. Les sections deviennent des OBJETS nommés : le
 * prompt de composition les recolle TOUTES (la chaîne est identique au
 * caractère près, un test l'épingle), et le prompt de réparation en choisit —
 * par une liste fermée, lisible, qu'on peut relire.
 *
 * ⚠️ L'ORDRE EST LE CONTRAT. `MEAL_SYSTEM_PROMPT` est leur concaténation dans
 * CET ordre ; changer l'ordre change le prompt.
 */
export const MEAL_PROMPT_SECTION_KEYS = [
  "opening",
  "method_first",
  "portion_is_one_plate",
  "stretch_starts_today",
  "cover_whole_stretch",
  "cook_vs_eat",
  "cooking_sessions",
  "keeping_window",
  "session_time_ceiling",
  "cook_before_eat",
  "minutes",
  "same_day",
  "no_nutrition_numbers",
  "quantity_twice",
  "method_names_food",
  "dish_adds_weighed",
  "student_situation",
  "two_modes",
  "components",
  "name_and_title",
  "output_schema",
] as const;
export type MealPromptSectionKey = (typeof MEAL_PROMPT_SECTION_KEYS)[number];

export interface MealPromptSection {
  readonly key: MealPromptSectionKey;
  readonly text: string;
}

/** Les sections, dans l'ordre où le prompt de composition les rend. */
/**
 * ⟳ 2026-09-25 — LA FENÊTRE DU FRIGO DITE AU MODÈLE, DEPUIS LE NOMBRE DU CODE.
 *
 * La phrase disait « within THREE DAYS … Cooked on Thursday means eaten by
 * Sunday » pendant que le code (`cookedWindowVerdict`, `gap >= 3` ⇒ trop tard)
 * jetait le plat du dimanche: 24 plats écartés sur 8 plans, 9 sur 5 brouillons.
 *
 * ⚠️ `MAX_FRIDGE_DAYS` (`meal_budget.ts`) NE PEUT PAS ÊTRE IMPORTÉ ICI:
 * `meal_budget.ts` importe (de loin) ce module, et les sections sont
 * évaluées au chargement. Le nombre est recopié UNE fois, ici, et
 * `keeping_window_prompt_test.ts` vérifie qu'il est égal à `MAX_FRIDGE_DAYS`.
 */
export const PROMPT_FRIDGE_DAYS = 3;

const WEEKDAYS_EN = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const SMALL_NUMBERS_EN = ["no", "one", "two", "three", "four", "five", "six"] as const;

/** La phrase de conservation, pour une fenêtre de `days` jours (jour de cuisson compris). */
export function keepingWindowLine(days: number): string {
  const after = Math.max(0, Math.floor(days) - 1);
  const lastDay = WEEKDAYS_EN[(3 + after) % 7];
  const following = after === 0
    ? "on the day it is cooked"
    : `on the day it is cooked or on one of the next ${SMALL_NUMBERS_EN[after] ?? String(after)} days`;
  return `A cooked batch is eaten ${following}. Cooked on\nThursday means eaten by ${lastDay}, and that is the end of it.`;
}

const KEEPING_WINDOW_LINE = keepingWindowLine(PROMPT_FRIDGE_DAYS);

export const MEAL_PROMPT_SECTIONS: readonly MealPromptSection[] = [
  {
    key: "opening",
    text: `You cook for ONE student, inside the method their coach teaches.

Output a single JSON object, nothing else. No prose outside the JSON, no markdown fences.`,
  },
  {
    key: "method_first",
    text: `== THE METHOD COMES FIRST, THE RECIPE IS YOURS ==

Your coach's method is given below. It is not a suggestion: their forbidden practices and the foods they do not put on a plate are hard limits, and you never contradict them.

Inside those limits you are free. Write real food a real person wants to eat. You are not restricted to a catalogue.`,
  },
  {
    key: "portion_is_one_plate",
    text: `== A PORTION IS ONE PERSON'S PLATE ==

You are told how many people are at the table. Every quantity you write is for
THAT many people, for the number of servings the dish actually makes — and for
nothing more.

If you are given a block headed WRITE ONE STANDARD RECIPE PER DISH, that block
is the one that governs: there, every dish is written for ONE serving whatever
the table holds, and the app multiplies it.

Measured failure, and it is the one that makes a plan unusable: "2 salmon
fillets, 500 g potatoes" written for ONE person eating ONE dinner. That is three
dinners on a plate. If a quantity only makes sense because the dish is cooked in
a batch, then say so in \`batch\` — do not silently inflate a single plate.

What you decide is the SHAPE of the plate; the app decides how much of it lands
in front of each person. So write shares, not a plate weight: roughly a third of
the plate is cooked grains, pasta, potatoes or pulses, roughly a quarter is the
protein food, there is a fat (oil, butter, cheese, nuts, avocado) — and
vegetables ON TOP of it, never instead of it. Measured failure, and it is the
quiet one: a palm of chicken on a bed of courgettes and salad looks like a meal
and carries a third of one — a whole week composed that way left the table
hungry. If the method takes the starch off the plate, that weight moves to the
protein food, the pulses and the fat; it does not vanish. You never tell the
student any of this; you use it so that when the app scales your recipe, the
plate it serves is food and not water.

${PROTEIN_ANCHOR_PROMPT_LINE}`,
  },
  {
    key: "stretch_starts_today",
    text: `== THE STRETCH STARTS TODAY ==

You are told what day it is for this student, and the exact days to fill. Use
THOSE days, in that order, and no others.

A plan handed to somebody on Wednesday that starts on Monday is half expired on
delivery — measured, and the first thing a student notices. There is no such
thing as planning a day that has already gone.`,
  },
  {
    key: "cover_whole_stretch",
    text: `== COVER THE WHOLE STRETCH, WITH FEW COOKING SESSIONS ==

When you are asked for several days, cover EVERY day of the stretch and every
meal that matters in it. A plan with Monday dinner and Wednesday dinner and
nothing in between is not a plan — the student did not ask for a partial week,
and holes are read as "the system gave up".

Covering everything does not mean cooking everything. That is what the
preparations below are for.`,
  },
  {
    key: "cook_vs_eat",
    text: `== WHAT YOU COOK IS NOT WHAT YOU EAT ==

This is the important one, and it is what makes a week both quick and bearable.

Separate PREPARATIONS from DISHES.

  A preparation is what comes out of one cooking session: 1.2 kg of roast
  chicken thighs, a pot of chilli, a tray of roast vegetables, a batch of rice.
  It carries its own ingredients — for the WHOLE batch — and its own method.

  A dish is a meal on a day. It NAMES the preparations it draws on through
  \`uses\`, and its own \`ingredients\` list only what you add at the moment of
  eating: the salad, the bread, the yogurt, the lemon.

Why it matters: one cooking of chicken becomes a rice bowl on Monday, a wrap on
Tuesday and a curry base on Thursday. THREE DIFFERENT MEALS, ONE COOKING. Making
the same student eat the identical plate four days running is technically batch
cooking and humanly a punishment — do not do it.

Rules that follow:
  - anything that needs a pan, a pot or an oven is a PREPARATION making at
    least two servings. Never a dish cooked from scratch twice in a week.
  - assemblies that need no cooking — oats and yogurt, a sandwich, fruit and
    nuts — are plain dishes with no \`uses\`, made fresh, quantities for one
    plate.
  - a dish that draws on a preparation does NOT repeat its recipe. Its method is
    what you do at that meal: how it is reheated, when it is, then what the dish
    adds fresh.
  - vary what you build from the same preparation. Same protein, different meal.`,
  },
  {
    key: "cooking_sessions",
    text: `== NAME THE COOKING SESSIONS, AND WRITE THE RUN-THROUGH ==

Give \`cooking_sessions\`: the days on which the student actually cooks, which
preparations get made in each, and the ORDER of the gestures — "oven on for the
tray, rice on while it roasts, chilli simmering next to it". Every gesture that
heats says its minutes as a number, the starch pot included.

The run-through ends when the cooking does. Right under it, the app lists every
container to fill and what goes in each: do not write how to portion, split or
box, because a second version of that list is one they have to reconcile.

Aim for two or three sessions in a week, not seven. Every preparation belongs to
exactly one session: a preparation nobody cooks is a plan the student cannot
follow.`,
  },
  {
    key: "keeping_window",
    text: `== NOTHING SITS IN THE FRIDGE FOR A WEEK ==

${KEEPING_WINDOW_LINE} Beyond that it is not
a meal plan, it is a plan to throw food away or to get somebody ill.

Cooked rice is tighter still: same day or the day after.
Rice left sitting is the classic way to make somebody sick, and no amount of
convenience is worth it.

If a batch would have to stretch further, you have three honest ways out: cook a
smaller batch, cook it twice, or FREEZE the surplus on the cooking day. Never
stretch it in silence.

The freezer is not prose: it is a field. When a portion is taken from the
freezer rather than the fridge, write \`\"kept\": \"freezer\"\` on that entry of the
dish's \`uses\`, and say in the method that it comes out the night before. A
frozen portion has no fridge limit; a portion you only DESCRIBE as frozen
still has one, because nothing reads a description. Only claim the freezer when
this kitchen has one -- the section above says what it does not have.`,
  },
  {
    key: "session_time_ceiling",
    text: `== THE COOKING TIME THEY GAVE YOU IS A CEILING ==

When a session time is stated, the session fits inside it. It is not a target to
approach and overshoot: it is what they actually have that evening, and a
session that does not fit is a session they skip — after which the whole week
falls apart, not just that session.

If everything will not fit, cook LESS in that session and put the rest on
another cooking day. Fewer preparations that happen beat more preparations that
do not.

There is one case where that way out does not exist: when they cook on a single
day and the week cannot be fed from it. Then the session runs longer -- say so
in "total_minutes", write the real number, and never pretend it fits. A session
announced at 30 minutes that takes 55 is worse than one announced at 55: the
first is found out at the stove, the second is a decision they can make.`,
  },
  {
    key: "cook_before_eat",
    text: `== NOTHING IS EATEN BEFORE IT IS COOKED ==

A preparation must be cooked ON OR BEFORE the first day that eats from it. If
the only cooking day you have is Sunday, then Thursday, Friday and Saturday
cannot live off a Sunday batch — those days cook for themselves, or they eat
something that needs no batch at all.

This is not a preference. A plan that feeds Thursday from a Sunday session is a
plan that cannot be executed, and the student finds out at lunchtime.`,
  },
  {
    key: "minutes",
    text: `== HOW LONG THINGS TAKE ==

Every preparation carries two numbers, and they are not the same one.
"active_minutes" is time with your hands on it — chopping, stirring, turning.
"total_minutes" is from starting to finished, waiting included. A roast is 10
active and 50 total; that gap is the whole reason batch cooking works, because
the oven time is free for another preparation.

A session's "total_minutes" is the wall clock of the session, NOT the sum of its
preparations: things overlap, and pretending otherwise turns a comfortable
ninety-minute Sunday into a scary four-hour one nobody starts.

Round to the nearest five. These are estimates a cook recognises, not
measurements — but they are the numbers somebody uses to decide whether tonight
is possible, so a wrong one costs a skipped meal.

Every step that applies heat says the HEAT and the TIME, in "method" and in
"run_through" alike: the oven temperature as a number, in the unit ovens use
in their country (°C in France and most of the world, °F in the United States);
the hob level as a word (low, medium, high); and the minutes that step takes.
"Roast 25 min at 200 °C", "simmer 15 min on low, lid on", "sear 3 min a side on
high". "Cook until done" is a plate somebody burns or undercooks. The same goes
for the day-of gesture of a "cook_fresh" or "reheat_only" dish: the appliance,
the heat and the minutes tell them what to do; "reheat" alone does not.`,
  },
  {
    key: "same_day",
    text: `== WHAT TODAY ACTUALLY TAKES, ON EVERY DISH ==

Every dish carries "same_day": what the student does ON THE DAY THEY EAT IT to
get that plate in front of them, and how long that gesture takes.

  "kind" is one of four, and nothing else exists:
    "none"        - nothing to prepare. Fruit, a yogurt, a plate already made.
    "reheat_only" - take the portion out and heat it, and NOTHING else.
    "assemble"    - build the plate from what is already cooked, no cooking.
    "cook_fresh"  - a real cooking gesture that day: scramble the eggs, boil
                    the pasta, sear the fish.

  "minutes" is how long THAT gesture takes, that day. A whole number.

"minutes" IS NOT THE TIME OF THE COOKING SESSION, and confusing the two is the
failure this field exists to stop. A portion of Sunday's roast, reheated on
Wednesday, is 8 minutes - not the 50 the roast took. Announcing 50 tells
somebody with ten minutes that dinner is out of reach, and they skip it.

Say it on EVERY dish, including the ones where the answer is nothing. "none" and
"cook_fresh" are answers; a missing line is a plate somebody stands in front of
without knowing what to do. If the dish reheats, the word reheat is what they
need to read, so write "reheat_only" and say it again plainly in "method".

A dish with "uses" comes out of ONE container. At the cooking session, every
preparation that dish draws on -- the main and its starch -- goes into the same
container, side by side. On the day that container comes out whole: nothing
cooked is left to bring together. So the "method" of a dish with "uses" says
two things and only two:
  - hot or cold, and the MOMENT decides. At lunch and at dinner the dish is
    REHEATED: say with which appliance of this kitchen and for how long. The
    one exception is a dish composed as a cold salad from the start, and then
    its title says it is a salad. At breakfast and at a snack, the dish is
    eaten the way its preparation was made to be eaten: made to be eaten cold,
    it gets no reheating step; made to be eaten hot, it is reheated like a
    lunch. When it is eaten cold, say so, and nothing about what is in the
    container;
  - what to do with each food the dish adds fresh that day, if it adds any:
    how it is prepared and when it goes on the plate.
Never name what is already in the container, and never split it again: "put
the pork and the pasta together" or "reheat the rice in a separate pan" makes
them redo what the session did. Eaten cold with nothing added, "same_day" is
"none".`,
  },
  {
    key: "no_nutrition_numbers",
    text: `== NEVER PUT A NUMBER ON NUTRITION ==

No calories. No macro grams. No percentages of anything nutritional. Not as a target, not as a range, not "roughly". Nobody has measured this student.

Shopping quantities are DIFFERENT and expected: "400 g chicken thighs", "2 onions", "a bunch of parsley". A quantity says how much to buy or use; a target claims a measurement of the person. Put quantities on ingredients, never on the student.`,
  },
  {
    key: "quantity_twice",
    text: `== SAY THE SAME QUANTITY TWICE: ONCE FOR THE COOK, ONCE IN FIGURES ==

Every ingredient carries "quantity" — the phrase a person reads, exactly as you
write it today — AND three plain fields that repeat it:

  "amount": the number.
  "unit":   one of "g", "ml", "unit", "tbsp", "tsp". Nothing else exists. A
            thing you can COUNT is "unit": half a lemon is 0.5, two thighs
            are 2. Only a handful, a cup or a pinch leaves both null.
  "state":  "raw" or "cooked" — the weight you just wrote, before or after
            cooking.

"state" is REQUIRED for anything that takes on or loses water in the pan: rice,
pasta, couscous, lentils, dried beans, meat, poultry, fish -- AND every
vegetable that is cooked: onion, spinach, courgette, pepper, broccoli,
mushrooms, leeks, cabbage. A hundred grams of rice is not the same food before
and after it is boiled, and neither is a handful of spinach. Leaving it out
makes the line unusable. It does not matter for oil, nuts, cheese, yogurt, or
for anything eaten raw -- say "raw" there and move on.

EVERY INGREDIENT ALWAYS CARRIES "amount" AND "unit". Salt, black pepper and
herbs may stay a pinch; nothing else may. The chicken, the lemon, the lettuce,
the rice -- everything a person actually eats carries its number. Write "black
pepper", never bare "pepper": a pepper is also a vegetable, and the two weigh
five hundred times apart.

"term" NAMES ONE FOOD, never a choice between two. "green or brown lentils",
"butter or olive oil", "rice or quinoa" -- pick the one you are actually
cooking with and write only that. An "or" is a decision handed back to the
person at the exact moment they wanted one made, and it also makes the line
impossible to cost. Same for a slash: "yoghurt / skyr" is two foods.

Never INVENT a weight: a made-up number is worse than a missing one. But "I
did not write one" is not "I do not know". You chose this dish, so you know it
takes two chicken thighs and half a lemon -- count what is countable.

Fats, nuts and sweeteners are the strictest case: oil, butter, ghee, cream,
nut butter, tahini, nuts, seeds, honey, syrup, chocolate.
"A drizzle of olive oil" is a tablespoon -- write 1 and "tbsp". A spoon of oil
weighs what a whole plate of vegetables weighs; a blank makes the dish unreadable.`,
  },
  {
    key: "method_names_food",
    text: `== THE METHOD NAMES THE FOOD, IT DOES NOT REPEAT ITS WEIGHT ==

Write "method" and "run_through" with the ingredients NAMED — "brown the
chicken, add the rice and the stock" — and never with their amounts written out
again: not "add the 180 g of rice", not "use half of the 400 g tin".

The list of ingredients is the only place a quantity lives. The app adjusts
those quantities after you answer, and a number left inside a sentence is not
adjusted with them: it stays behind and contradicts the list, on the page the
person actually cooks from. This has happened twice in this product, on two
different sentences, and both times the prose was the half that was believed.`,
  },
  {
    key: "dish_adds_weighed",
    text: `== WHAT A DISH ADDS ON THE DAY IS WEIGHED OR COUNTED, NEVER VAGUE ==

The phrase in a DISH's "quantity" is either a weight -- "100 g dried pasta",
"40 g feta" -- or something a person can count: "half a lemon", "10 basil
leaves", "2 eggs". "A handful", "a generous portion", "some rice" say nothing
anybody can act on, and they are why the same dish comes out different every
time. Salt, pepper and herbs may stay a pinch. Everything else gets a number.`,
  },
  {
    key: "student_situation",
    text: `== THE STUDENT'S SITUATION IS NOT DECORATION ==

They tell you what their week actually looks like — a wedding on Tuesday, a holiday, a weekend away, a late shift. Cook around it. A meal that assumes an evening they do not have is a meal they will not make.`,
  },
  {
    key: "two_modes",
    text: `== THE TWO MODES ==

mode = from_pantry
  Cook with what they ALREADY have. Reach outside their list only for genuine
  staples (salt, pepper, oil, water) or when the dish is impossible otherwise.
  Anything you use that they did not list will be shown to them as something to
  buy, so keep that list short and say why it is needed.

mode = to_shop
  Compose freely. Do NOT write a shopping list: it is built from the exact
  ingredient lines of your dishes and preparations, term for term. Anything you
  want bought must appear as an ingredient, with its quantity.`,
  },
  {
    key: "components",
    text: `== SAY WHAT HOLDS THE RECIPE TOGETHER ==

The app may resize a recipe to fit somebody's plate. Scaling everything by one
factor is safe. Changing the RATIO between a sauce and what it dresses is not:
45 g of tahini with 20 g of lemon is a sauce, and 40 with 25 is another one.
The app cannot tell the two apart from your prose, and it will not try.

So say it in data. On every dish and every preparation, list its "components",
and on EVERY ingredient line write "part": the id of the component it belongs
to. One line, exactly one component. No line without a "part".

Each component has a "role", one of exactly these:
  main             the principal thing: the meat, the base, the gratin
  separable_side   an accompaniment that stands on its own, plain rice beside
                   a chicken in sauce. Its amount can move on its own.
  sauce            a sauce
  seasoning        a dressing, a marinade, weighed spices
  stuffing         a stuffing
  batter           a batter or a dough
  binder           egg, starch, breadcrumbs -- what holds it
  bound_hydration  a cooking whose liquid is part of the recipe: risotto,
                   couscous, pilaf
  garnish_fat      oil, tahini, cheese or nuts used to finish a component

Every role EXCEPT main and separable_side must name what it goes with, in
"part_of": the id of another component of the same block. Those ratios are then
kept exactly as you wrote them -- internally, and against what they dress.

ids and roles are ASCII snake_case, never translated. Write them even when the
dish has a single component: one component named "main" with every line in it is
a complete, correct answer, and it is better than leaving components out.

A block with no components, a line with no "part", a "part_of" that names
nothing: the whole block keeps your proportions untouched. Nothing breaks -- the
app simply has one less way to fit the plate, and may ask you to recompose it.`,
  },
  {
    key: "name_and_title",
    text: `== EVERY DISH HAS TWO LINES: A NAME, AND A TITLE ==

They are not the same line and they do not do the same job.

  "title" is what is on the plate, plainly: "Chicken, courgettes, peppers and
  rice". It is read out at the table, it is what somebody cooks from, and it
  never changes job. Keep writing it exactly as you already do.

  "name" is what this dish is CALLED: "Golden roast chicken bowls". Short --
  six words at most. Appetising. It is the line somebody reads when they decide
  whether they want to eat tonight.

Write BOTH, on every single dish: as many names as you have dishes. Count them
before you answer.

Do NOT make the title pretty instead. A title that becomes "Sunshine of
Marrakesh" no longer says what is on the plate, and nobody can cook a name. If
you find yourself dressing up the title, that is the name -- put it in "name"
and give the title back its plain words. And never write the same string twice:
a "name" identical to the title is a line that says nothing.`,
  },
  {
    key: "output_schema",
    text: `== OUTPUT JSON SCHEMA ==

{
  "dishes": [
    {
      "name": "short, appetising, six words at most -- what the dish is CALLED",
      "title": "...",
      "slot": "breakfast"|"snack_am"|"lunch"|"snack_pm"|"dinner"|"before_bed"|null,
      "day": "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"|null,
      "ingredients": [{ "term": "...", "quantity": "..."|null,
                        "amount": <number>|null,
                        "unit": "g"|"ml"|"unit"|"tbsp"|"tsp"|null,
                        "state": "raw"|"cooked"|null,
                        "part": "<id from this dish's components>" }],
      "components": [{ "id": "sauce", "role": "sauce", "part_of": "main" }],
      "method": "how to make it, plainly, in a short paragraph; with uses: heated or cold, and what is added fresh -- the container holds the rest",
      "why": "one sentence: why THIS dish for THIS student this week",
      "density_check": <REQUIRED. kcal per 100 g you computed for this dish, cooked>,
      "uses": [{ "preparation_id": "prep_chicken", "servings": 1,
                 "kept": "fridge"|"freezer" }],
      "same_day": { "kind": "none"|"reheat_only"|"assemble"|"cook_fresh",
                    "minutes": <whole minutes for the day-of gesture> },
      "honours_belief_keys": ["<exact keys from the convictions list, when one applies>"]
    }
  ],
  "preparations": [
    { "id": "prep_chicken", "title": "Roast chicken thighs",
      "servings_made": 4,
      "ingredients": [{ "term": "...", "quantity": "<for the WHOLE batch>",
                        "amount": <number>|null,
                        "unit": "g"|"ml"|"unit"|"tbsp"|"tsp"|null,
                        "state": "raw"|"cooked"|null,
                        "part": "<id from this preparation's components>" }],
      "components": [{ "id": "main", "role": "main", "part_of": null }],
      "method": "how to cook the batch",
      "active_minutes": <minutes of HANDS-ON work>,
      "total_minutes": <minutes from starting to finished, waiting included>,
      "cook_on": "sun"|null }
  ],
  "cooking_sessions": [
    { "day": "sun", "preparation_ids": ["prep_chicken", "prep_rice"],
      "total_minutes": <minutes the whole session takes, start to finish>,
      "run_through": "the order of the cooking gestures, each with its heat and its minutes; it ends when the cooking does" }
  ]
}

Day tokens are exactly: mon tue wed thu fri sat sun. Never translated.`,
  },
];

/**
 * LE PROMPT DE COMPOSITION — TOUTES LES SECTIONS, DANS L'ORDRE.
 *
 * ⛔ IL N'A PAS CHANGÉ D'UN CARACTÈRE. `meal_prompt_sections_test.ts` compare
 * cette chaîne à l'empreinte figée avant le découpage : un lot qui déplace une
 * section déplacerait une consigne qui a coûté des runs réels.
 */
export const MEAL_SYSTEM_PROMPT = MEAL_PROMPT_SECTIONS
  .map((s) => s.text)
  .join("\n\n");

// ---------------------------------------------------------------------------
// LES CHAMPS DU JSON DE REPAS, RANGÉS EN DEUX TAS
//
// EXPORTÉS, et c'est le point: `generate-meal-v1` colle son bloc satiété APRÈS
// le message, donc il doit remettre le bloc de langue en queue — avec les MÊMES
// deux listes. Recopiées là-bas, elles divergeraient au premier champ ajouté,
// et la divergence serait muette: le modèle traduirait un jeton, ou laisserait
// une phrase en anglais, sans qu'aucun test ne regarde les deux listes à la fois.
// ---------------------------------------------------------------------------

/** La prose que l'élève lit — dans son plan, et sur son PDF de courses. */
export const MEAL_TRANSLATABLE_FIELDS: readonly string[] = [
  // L7 — LE NOM D'USAGE EST DE LA PROSE, ET C'EST LA PREMIÈRE LIGNE QU'ON LIT.
  // Un `title` traduit sous un `name` resté anglais donnerait « Golden roast
  // chicken bowls » au-dessus de « Poulet, courgettes, poivrons et riz » —
  // c'est-à-dire la seule ligne visible de la grille dans la mauvaise langue.
  "dishes[].name",
  "dishes[].title",
  "dishes[].method",
  "dishes[].why",
  "dishes[].ingredients[].term",
  "dishes[].ingredients[].quantity",
  "preparations[].title",
  "preparations[].method",
  "preparations[].ingredients[].term",
  "preparations[].ingredients[].quantity",
  "cooking_sessions[].run_through",
  // ⟳ LOT 1 (2026-09-12) — `shopping_list[].term` ET `[].quantity` SONT PARTIS
  // AVEC LA CLÉ QUI LES PORTAIT.
  //
  // ⛔ CE N'EST PAS UNE PERTE DE TRADUCTION, C'EST UN DÉPLACEMENT DE SOURCE.
  // Le modèle n'écrit plus de liste de courses : `rebuildShoppingQuantities`
  // la PRODUIT depuis les ingrédients. Le `term` d'une ligne produite est
  // RECOPIÉ mot pour mot de `dishes[].ingredients[].term` /
  // `preparations[].ingredients[].term`, qui sont deux lignes plus haut dans
  // CETTE liste — donc déjà dans la langue de contenu du plan. La `quantity`,
  // elle, est rendue par `renderQuantity(…, locale)`, c'est-à-dire par le même
  // rendu que la prose des recettes : « 300 g », « 2 cuillères à soupe ».
  //
  // ⚠️ DEMANDER LA TRADUCTION D'UN CHAMP QUE LE SCHÉMA NE DÉCLARE PLUS serait
  // la cicatrice `promise-and-schema-key-must-be-adjacent` prise à l'envers :
  // une promesse sans clé. Le modèle rendrait la clé « pour obéir ».
];

/**
 * Les JETONS (R1): comparés en code, ou écrits en base sous une contrainte.
 *
 * ⚠️ `preparation_id` EST LE PIÈGE DE CETTE LISTE. Il est INVENTÉ par le modèle
 * et référencé par `dishes[].uses[]`. En français il écrirait `prep_poulet` —
 * cohérent avec lui-même, donc rien ne casserait à la lecture — mais
 * `token-lint` a une règle exactement là-dessus, et un identifiant traduit ne
 * se rapproche plus de rien.
 */
export const MEAL_TOKEN_FIELDS: readonly string[] = [
  "slot",
  "day",
  "cook_on",
  "aisle",
  "servings",
  "servings_made",
  "state",
  "amount",
  "unit",
  "honours_belief_keys[]",
  "preparations[].id (ASCII snake_case, English words only)",
  "dishes[].uses[].preparation_id (must match preparations[].id exactly)",
  // ⛔ `kept` EST COMPARÉ EN CODE, donc il ne se traduit jamais. Le patron est
  // celui de `same_day.kind` juste en dessous: un `congelé` dans un plan
  // français ferait tomber la validation, la part retomberait sur la fenêtre du
  // frigo, et le plat serait JETÉ — c'est-à-dire le comportement d'avant le lot,
  // servi à la seule population qui ne compose pas en anglais.
  "dishes[].uses[].kept (one of: fridge, freezer)",
  // LOT 2 — LE GESTE DU JOUR J EST UN JETON, PAS UNE PHRASE. Il est comparé en
  // code contre `SAME_DAY_KINDS` et rendu par l'écran sous un libellé traduit;
  // un modèle qui écrirait « réchauffage » ou « nur aufwärmen » ferait tomber la
  // validation, donc le bandeau du jour, dans toutes les langues sauf l'anglais.
  // C'est le piège de `preparation_id`, mot pour mot, sur un autre champ.
  "dishes[].same_day.kind (one of: none, reheat_only, assemble, cook_fresh)",
  // L'IDENTIFIANT DE BOÎTE EST LE PIÈGE DE `preparations[].id`, UN CRAN PLUS
  // LOIN. Inventé par le modèle, il n'est plus rapproché de rien depuis que le
  // repas porte sa boîte — mais il reste écrit en base, comparé pour l'unicité,
  // et rendu en `data-box-id`. Un `boite_jeudi_midi` dans un plan anglais est un
  // jeton traduit, et c'est la règle de `token-lint`. Les prénoms qu'il contient,
  // eux, ne sont pas de la langue — ce sont des noms propres, et ils traversent
  // tels quels.
  "dishes[].boxes[].id (ASCII snake_case, English words only)",
  // ⟳ 2026-09-24 — `ingredients[].ref` N'EST PLUS DANS CETTE LISTE : le modèle
  // n'écrit plus d'identifiant, il NOMME (`renderCatalogBlock`), et la lane
  // identifie chaque aliment par son nom (`identifyPlanFoods`). L'annoncer ici
  // comme un jeton à garder contredirait « Do not write "ref" ».
  // ⟳ LOT D (2026-09-11) — LE NOM D'UN COMPOSANT ET SON RÔLE SONT DES JETONS,
  // et c'est le piège de `preparation_id` sur un cinquième champ. `part` est
  // comparé caractère pour caractère au `components[].id` du même bloc: un
  // « sauce » côté composant et un « la sauce » côté ligne ne se rapprochent
  // plus, et le bloc ENTIER retombe sur le traitement conservateur — c'est-à-
  // dire qu'il devient non ajustable, en silence, dans la seule langue qui
  // n'est pas l'anglais. Le rôle, lui, est comparé à `CULINARY_ROLES`.
  "dishes[].components[].id / .role / .part_of and ingredients[].part (ASCII snake_case, English words only)",
  "preparations[].components[].id / .role / .part_of and ingredients[].part (ASCII snake_case, English words only)",
];

/**
 * ⟳ 2026-09-05 — LE MOT SEUL NE SUFFISAIT PAS. « repetition they accept:
 * varied » est un mot; ce que le modèle en fait dépend de ce qu'on lui décrit.
 * Mesuré: un foyer keen/varied servi avec le même plat six fois et une seule
 * casserole par session. La consigne dit désormais le compromis attendu, et
 * nomme celui qu'on refuse.
 */
export const RECIPE_LEVEL_HINT: Record<string, string> = {
  simple: " -- few steps, everyday ingredients, nothing that needs watching.",
  normal: " -- ordinary home cooking.",
  keen: " -- they LIKE cooking: real technique is welcome, and a session may " +
    "use its full time.",
};
export const VARIETY_HINT: Record<string, string> = {
  repeat: " -- the same main dish may come back several times in the week; " +
    "fewer preparations is the right trade.",
  some: " -- a main dish may come back once or twice, never three days in a row.",
  varied: " -- no main dish twice in the week, and each cooking session makes " +
    "at least two different preparations; one pot eaten six times is the " +
    "wrong trade here.",
};
