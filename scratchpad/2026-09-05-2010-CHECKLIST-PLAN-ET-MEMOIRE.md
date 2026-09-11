# Ce qui doit bien se passer — plan et mémoire (checklist de vérification, 2026-09-05)

Chaque ligne est une vérification à faire en conditions réelles (une génération, un écran,
une note), avec le point d'attention qui va avec et, quand il existe, le compteur ou l'endroit
où lire la preuve. « ⚠ » = trou connu ou fragilité mesurée aujourd'hui ; « ❓ » = jamais
vérifié à ma connaissance. Les compteurs cités vivent dans la réponse `draft`
(`household.*`) ou dans `generated_from.household.*` d'un plan écrit.

---

## A. Courses et sessions de cuisine

1. **Une seule course, deux sessions de cuisine** : les aliments de la seconde session qui ne
   tiennent pas jusqu'à sa date au frigo sont marqués « à congeler » sur la liste de courses,
   à la bonne vague, et le plan dit quel jour on les sort. Point d'attention : la règle vit
   dans `cooking_plan.ts` (`maxFridgeDays`, `grocery waves`) ; vérifier la liste ET la carte du
   jour (`PlanDayBlock` marque « part au congélateur » depuis `a58af9f6`).
2. **Le style de cuisine choisi** (« le moins possible / équilibré / j'aime cuisiner ») et le
   **nombre de courses** sont visibles dans le plan : nombre de sessions, minutes par session,
   jours de cuisine, nombre de vagues de courses. ⚠ La variété et la difficulté du style
   n'atteignaient pas le brief avant `d4cbf20a` ; vérifier qu'un foyer « keen » reçoit des
   recettes différentes chaque jour et au moins deux préparations par session (compteur : nombre
   de titres distincts / repas principaux, nombre de casseroles par session).
3. **Style « le moins possible »** : sessions de 30 min, répétition acceptée, mais **jamais
   un pot carné où la végétarienne est servie** (C07 v28 : le modèle a fait UN pot et y a mis
   tout le monde). Lire `regime_belt.refused` et `separated`.
4. **Une seule session pour 7 jours** : les barquettes des jours 4 à 7 sont indiquées « au
   congélateur » dans la section barquettes de la session, avec le jour où les sortir (« clé de
   la part congelée »). ⚠ On nomme les jours hors de portée du frigo, on n'ajoute jamais une
   session ; ❓ vérifier que l'écran de session le montre, pas seulement la donnée.
5. **La liste de courses ne contient que ce que le plan cuisine** : pas de ligne d'un plat
   remplacé par une relance (élagage rejoué après fusion depuis `d4cbf20a`), pas de casserole
   orpheline dans une session, quantités cohérentes avec les casseroles grossies
   (`pot_growth.shopping`, `unrewritable` doit tendre vers 0).
6. **L'eau de cuisson** listée à côté d'un riz ne double pas la masse du pot (`f489cb17`) ;
   point d'attention : elle reste dans la masse d'une soupe.
7. **Garde-manger et « déjà à la maison »** : ❓ vérifier qu'une ligne `in_pantry` sort de la
   liste sans sortir de la recette.
8. **Les jours de cuisine déclarés sont respectés** (« je cuisine dimanche et mercredi ») et,
   quand ils ne le sont pas, la rationale le dit (« déclarés : dimanche, mercredi ; posés :
   samedi »).
9. **Une session ne dépasse pas son temps** : `session_overruns` à 0 pour `minimal`, ou dit.
10. **Les préparations citées existent et sont cuites** : aucune boîte ne cite une casserole
    absente d'une session ; aucune casserole cuite dimanche n'est mangée samedi (`fridge_window`,
    fusion par parties : `samePreparation` lit le jour depuis `d4cbf20a`).

## B. Barquettes (boîtes)

11. **Une personne** : les barquettes existent (`soloBoxes`), une par repas cuisiné, avec
    leurs grammes ; **deux personnes** : une boîte à deux noms par plat commun ; **trois et
    plus** : un contenant par groupe, les noms sur le couvercle, jamais deux fois le même nom
    sur un repas (`box_counts`, `double` dans `meals_delivered.by_cause`).
12. **Le gramme sur la boîte est une prescription pour qui suit un objectif, une quantité de
    bac pour les autres** ; ❓ vérifier le rendu des deux formes sur `/app/plan`.
13. **Personne sans repas** : à chaque case (jour × moment) où une bouche mange, elle est
    nommée sur exactement une boîte (`meals_delivered.missing = 0`). En composition réelle, un
    manque résiduel donne un refus `422 mouth_unfed` nommant la bouche et le repas ; en
    aperçu, le trou est montré. Lire `retry_attempts`, `retry_accepted`, `retry_merged_cells`.
14. **La relance « personne sans repas » est partielle** (ne rend que les cellules à réparer,
    `P0.4`) : mesurer les jetons de sortie et la latence par relance (`llm_usage_events`,
    source `*.unfed_retry`) — attendu : moitié d'un plan entier.
15. **Un plat sans boîte ne nourrit pas la bouche dont la ligne le mord** (R2-D, `d4cbf20a`).
16. **La boîte cite la bonne casserole** : quand le modèle cuit le tofu pour la végétarienne
    mais fait citer le poulet, la ceinture ré-adresse (`regime_belt.citation_repaired`,
    `item_repaired`) au lieu de retirer la bouche. ⚠ Pas encore vu tirer en réel : chercher un
    plan avec un pot orphelin.
17. **Le titre du plat nomme la base, pas le composant échangé** (« Riz aux légumes », pas
    « Riz au poulet ») : un couvercle « saumon » chez la végane est un défaut d'écran même si la
    boîte est juste. ❓ Compter les titres qui nomment le composant échangé.
18. **Les boîtes sont nourries à la hauteur du besoin** : `box_sizing.unmet_band.gte_200` à 0
    (ou dit), `anchor.clamped` faible, `densify.remaining_gte_200` à 0. Après `ec3645e6` sur
    C03 : 0/12. Vérifier sur solo, couple, cinq bouches.
19. **Les casseroles suffisent à leurs boîtes** : masse prête ≥ somme des tirages
    (`pot_clamped` → 0), `pot_growth.regrammed` > 0 quand un pot a grossi.
20. **La densification ne remplace pas le modèle** : elle déplace des grammes vers le plus
    dense dans les bornes (`VEG_FLOOR`, `PROTEIN_CEILING`), jamais au-delà du pot
    (`pot_exhausted`), et `closed_kcal ≤ moved_g × 4`.
21. **Quantité de bac cohérente avec ses items** : la somme des items est la boîte
    (`BOX_SUM_TOLERANCE`), un bac de 1 309 g pour trois adultes est nominal, 427 g pour un
    enfant aussi — mais un bac de 240 g de pain complet pour un dîner d'adulte (DENS-9) est un
    défaut à attraper (`protein_anchor_missing`, `remaining_gte_200`).
22. **Congélation par barquette** : quand une boîte est mangée hors fenêtre de frigo, elle est
    marquée « congeler / sortir le … » sur le couvercle ET dans la session (recoupe A4).

## C. Régimes, allergies, dégoûts — à 1, 2, 3 personnes et plus

23. **Allergie déclarée** (soi ou un membre) : aucun plat, aucune casserole, aucune ligne de
    courses ne la touche ; un seul plat qui la touche vide la relance entière (verrou binaire).
    Vérifier à 1, 2, 5 bouches, et **avec l'allergie d'un enfant sans compte dite dans une
    note** (`7af3ad91` : atteint enfin `household_members`).
24. **Régime d'une minorité** (une végane sur quatre) : la BASE commune suit la ligne la plus
    stricte ; le composant qui sépare est servi par boîte : boîte commune avec poulet/œufs,
    boîte végane avec tofu/légumineuses — même plat, même base, une casserole de plus. Compter
    `swap.cells_carrying / cells_checked` (les omnivores gardent leur composant à la plupart
    des déjeuners/dîners), `regime_belt.separated`, `not_separated = 0`, `refused = 0`.
25. **L'inverse** : un omnivore seul parmi des végétariens a sa boîte poulet ; tout le monde
    végétarien : un seul bac, `swap.cells_checked = 0` sans être un défaut.
26. **Jamais toute la table au régime de la minorité** (`swap.flagrant = false`) — mesuré
    deux fois avant v28 ; la rationale dit « toute la table mange végétarien » si c'est vrai.
27. **Recettes scindées** : cannelloni jambon d'un côté / ricotta-épinards de l'autre, dans le
    même plat, deux boîtes, deux préparations à part (« cooked in a preparation of its own,
    never inside the one that carries the original »). ⚠ Tenue ~2/5 tirs ; lire `separated`.
28. **Perte de poids et prise de masse dans le même foyer** : même plat, boîtes de tailles
    différentes, grammes prescrits à chacun selon son objectif et son corps
    (`box_factor_source anchor`), jamais un plat dédié pour une différence de portion.
29. **Dégoût nommé** (« Marc n'aime pas les lentilles ») : hors du plat commun quand rien ne
    l'appelle ; si la table l'a demandé (envie, liste du coach), il est servi ET Marc a sa boîte
    d'échange (`exclusion_belt.separated`) ; jamais un plat dédié pour un goût, jamais une
    interdiction pour tous ; dernier recours : Marc reste sur la boîte commune et la rationale le
    dit (« gardée bien que… »).
30. **Exclusion de table** (« pas de pain complet ») tenue à zéro sur tout le plan ; ⚠ un
    terme multi-mots a été resservi deux cycles (tokenisation) — à re-mesurer.
31. **Régime de la table vs régime d'une bouche** : « on mange végétarien » écrit dans une
    note pose une QUESTION de portée (tout le monde / seulement moi) avant d'écrire une
    contrainte stricte sur tout le foyer (`7af3ad91`) ; ⚠ la branche « non, pas toujours » n'a
    pas été vue en réel.
32. **Tous les moments** : la ceinture lit les petits-déjeuners et collations aussi (œufs chez
    la végane au petit-déjeuner, vu ce soir) — le dénominateur `swap` ne compte que
    déjeuner/dîner, exprès.
33. **Traces lisibles** : chaque retrait est dans `issues` avec la bouche, le plat, le terme
    (`via: items | preparation`), et la personne concernée est prévenue sur la carte
    « Ce que Sophia sait » (« noté pour Marc : le plat commun l'évite, ou sa boîte change »).

## D. Le plan du jour même : le temps des courses

34. **Fait à 12 h** : le déjeuner du jour n'est pas au plan (il faut les courses) ; le dîner
    l'est ; la rationale le dit (« Pour aujourd'hui, le petit-déjeuner et le déjeuner ne sont
    plus au plan : la journée est déjà entamée » + « la collation … il faut le temps de faire les
    courses »).
35. **Fait à 16 h** (déjeuner + dîner habituels) : le goûter saute, le dîner reste ; petit
    déjeuner et déjeuner pas prévus le jour même.
36. **Fait à 21 h** : trop tard pour les courses → le plan démarre le lendemain
    (`suggested_window.shifted = shopping_cutoff`) et l'explication de l'aperçu le dit.
37. **Fuseau horaire** : l'heure est celle du profil (`Etc/GMT+7` en fixture) — vérifier une
    personne à Montréal et une à Paris ; ⚠ mutation de fixture à restaurer après test.
38. **Fenêtre demandée vs rendue** : 3 jours demandés → 3 jours, jamais 7 « par sécurité » ;
    `MAX_WINDOW_DAYS` respecté ; les jours d'absence déclarés (`away_days`) n'ont pas de repas
    pour cette bouche et la rationale le dit.
39. **Après minuit / changement de date** : un plan vivant qui chevauche minuit ne renvoie pas
    409/400 au lendemain (vu en tir : `prepare_next` / retrait de fixture nécessaires).

## E. L'explication de l'aperçu (IA, pas déterministe)

40. **Une sortie supplémentaire du modèle de plan**, `explanation.lines`, ≤ 8 lignes,
    mélange d'information et d'éducation, qui nomme les ARBITRAGES : ce qui a été troqué, pour
    qui, pourquoi. Aujourd'hui : « La pizza demandée devient un dîner de tofu, plus léger » (C06)
    — présente, mais l'arbitrage est FAUX (v29 : « serve it as asked, a pizza is a pizza » —
    à re-mesurer). ⚠ Tu l'as demandé plusieurs fois : vérifier à CHAQUE tir que
    `explanation.lines` n'est ni vide ni un gabarit, sur les trois surfaces (aperçu, plan écrit,
    fusion).
41. **Cas obligatoires d'explication** : envie contraire à l'objectif (pizza, hamburger en
    perte de poids → servi, et dit comment) ; dégoût contre envie de la table (raviolis aux
    champignons voulus, Marc n'aime pas → il en a, boîte d'échange ou non, dit) ; régime
    minoritaire ; jour même et courses ; jours de cuisine déplacés ; allergie qui a fait sauter
    un plat ; budget ; matériel manquant (pas de four).
42. **Ce que l'explication ne fait jamais** : culpabiliser (« malgré », « à cause de », « grâce
    à » ; porte `findGuiltTripping`), dire qu'une semaine est impossible, dévoiler les calories à
    qui ne doit pas les voir, inventer une contrainte.
43. **Rationale (déterministe) et explication (IA) sont deux blocs distincts** et ne se
    contredisent pas : si la rationale dit « toute la table mange végétarien », l'explication ne
    dit pas « le reste de la table garde la sienne ».
44. **Langue** : l'explication sort dans la langue du contenu de la personne (`fr-FR` par
    défaut), pas en anglais quand la doctrine est anglaise.

## F. Énergie, objectifs, calories

45. **Calories par repas affichées pour qui suit un objectif** (direction déclarée + interrupteur
    ouvert), cohérentes : la somme des boîtes d'un jour ≈ enveloppe du jour (`unmet_band`),
    et la boîte d'une bouche à l'objectif ≠ la boîte d'une bouche en maintenance.
46. **Jamais de chiffre** pour un mineur, une personne sous plancher TCA, un coach « on ne
    compte pas », ou sans direction (`boxes_gate.refused.*` ; `4575f94d`).
47. **La doctrine kcal sur un plan de foyer est celle du foyer** (arbitrage 5) — vérifier qu'un
    membre avec son propre coach est protégé par son interrupteur, pas par une doctrine mixte.
48. **Le corps d'une bouche sans compte atteint le calcul** (poids de la fiche, `body_from_sheet`)
    ; un enfant reçoit une part d'enfant ; une femme enceinte/allaitante : `anchor.pregnancy`.
49. **Plafond de masse** : arbitrage 1 (par densité mesurée) → avant/après sur C03 avec
    `capped_by_pot`, `anchor.clamped`, `share_clamped`, compteur du plafond qui mord.
50. **Note datée** (« Léa danse mardi ») → +25 % fixe ce jour-là (arbitrage 3) ; aujourd'hui la
    note change les mots, pas les grammes (mesuré : 350 g partout).
51. **Fourchette kcal publique** sans porte d'âge, poids × activité seulement.

## G. Variété, envies, style

52. **Pas de plat principal six fois dans la semaine** sous « équilibré » ou « keen » ;
    sous « le moins possible », répétition acceptée mais dite.
53. **Collations et petits-déjeuners variés** : 30 plats au yaourt sur 42 (C06) est un plan
    qu'on ne suit pas — compter les titres distincts hors repas principaux.
54. **L'envie de la semaine est servie telle quelle** (v29) : pizza = pizza, raviolis =
    raviolis ; troquée seulement contre une règle nommée, et l'explication le dit.
55. **La liste « à privilégier » du coach** atteint le plan ; ⚠ les aliments encouragés
    individuels n'ont pas de lecteur (seul le groupe arrive).
56. **Budget** : montant respecté ou dit ; matériel de cuisine (pas de four) respecté.

## H. Mémoire — ce que Sophia sait, et ce qu'elle en fait

57. **Trois destinations, deux sources** : une phrase écrite (retour sur brouillon, bilan)
    finit dans la bonne famille (préférence durable / prochain plan / mémo), jamais dans une
    quatrième ; l'accusé nomme CE qui a été écrit et CE qui ne l'a pas été (« je n'ai pas pu
    enregistrer … » depuis `7af3ad91`).
58. **La ligne d'une bouche atteint le prompt sous son nom** (« THIS PERSON ONLY ») et jamais
    comme règle de table ; le titulaire porte celles de la table.
59. **« Voir » allume la ligne écrite**, pas toutes celles du jour (`4d43ff41`, tap de
    clarification `f489cb17`) ; ❓ à voir dans un navigateur.
60. **« Pour le prochain plan »** : vivante jusqu'au prochain plan VALIDÉ, même règle des deux
    côtés, `written_at` conservé par l'écran (`b388df83`) ; la carte dit « jusqu'au prochain
    plan validé » et c'est vrai.
61. **« Garder » sur la carte foyer** : arbitrage 2, à rebrancher sur `retained_items` ;
    aujourd'hui le geste n'atteint aucun plan et le sous-titre promet le contraire.
62. **Une préférence périssable** (allergie dite dans un retour de plan) expire, et le sujet
    est le bon (foyer vs bouche) ; une allergie vraie va en table de sécurité, pas en préférence.
63. **Doublons et remplacements** : « superseded » vérifié pour plausibilité ; deux fois
    « Marc n'aime pas les lentilles » = une ligne.
64. **Le récap du soir ne redit pas la mémoire**, seulement la sécurité (§6 de la
    nomenclature à corriger) ; le message du soir donne un fait avant de demander.
65. **La langue de la ligne retenue** est celle de la personne, et le matcher n'est jamais
    fait maison (« laitue » ≠ « lait »).
66. **Les lecteurs morts** (`rhythmOverlayFor`, `logisticsOverlayFor`) sont retirés
    (arbitrage 6) ; la ligne `logistics.set` en base migrée ou laissée mourir.
67. **Réglages écrits par le chat** (« moins de variété », « 45 minutes ») : visibles sur la
    carte comme changements de réglage, défaisables (« Défaire »), et lus par le générateur au
    tir suivant (`variety` de `practical_constraints` a priorité sur celui du style ? à trancher).

## I. Latence, robustesse, codes

68. **Une génération ≤ ~2 min sans relance, ≤ ~6 min avec deux** ; lire `latency_ms` et
    `output_tokens` par appel ; Kong à 900 s en local ; runtime redémarré avant tout tir
    (module `_shared` périmé sinon).
69. **Codes** : `422 mouth_unfed` (nommé, en compose seulement), `409` plan vivant
    (`prepare_next` / `replace_current`), `400` fenêtre illisible, `546` limite worker
    (infra) — chaque refus a sa copie front (`planRefusals.ts`) dans les deux langues.
70. **Le modèle de génération** est `keelGenerationModel()` (pas celui du chat) — ⚠ un
    timeout de 4 min sur le foyer a été mesuré en le branchant ; à retester.
71. **Les compteurs sont écrits même à zéro** (`boxes_gate`, `swap`, `meals_delivered`) et
    rendus dans la réponse `draft` (qui n'archive rien).

## J. Écrans à ouvrir (personne ne l'a fait aujourd'hui)

72. `/app/plan` : couvercles à un et plusieurs noms, deux boîtes sous un titre neutre, marque
    « congeler », kcal visibles/invisibles selon la porte, rationale + explication, refus.
73. `/app/about-you` : anneau sur la ligne nommée après « Voir », encart « prochain plan »
    qui disparaît après validation, « noté pour Marc … ».
74. `/app/household` : carte « Ce que tu m'as dit » après rebranchement de « Garder ».
75. Mobile 320 px : barre d'onglets, champs qui rétrécissent, session de cuisine.

## K. La campagne de mesure (arbitrage 7) — proposition de banc

76. **Fixtures** : solo (perte de poids), couple (l'un en perte, l'autre en prise de masse),
    cinq bouches (une végétarienne, deux enfants), quatre avec une végane, un foyer avec une
    allergie d'enfant, un foyer avec un dégoût + l'envie qui le contredit ; styles minimal /
    balanced / keen ; 1 et 2 courses ; fenêtres 3 et 7 jours ; plan du jour même à 12 h et 21 h.
77. **Par tir, lire** : `http`, latence totale et par appel, `retry_attempts/accepted/merged`,
    `meals_delivered.missing`, `regime_belt.{bites,separated,refused,citation_repaired,
    item_repaired}`, `exclusion_belt`, `swap.{cells_checked,cells_carrying,flagrant}`,
    `box_sizing.{anchor.clamped, unmet_band, densify.remaining_gte_200, pot_growth}`,
    `explanation.lines` (non vide, ≤ 8, arbitrages nommés), titres distincts / repas
    principaux, plats au yaourt / collations, `session_overruns`, courses orphelines.
78. **Verdicts écrits avant le tir** (PASS / FAIL / INCONCLUSIVE), un tir par cas puis trois
    rejeux sur les cas exposés, une génération à la fois, empreinte de fixture restaurée.
79. **Ce que la campagne ne prouve pas** : la stabilité du modèle au-delà de trois tirages,
    l'écran, le déploiement.

---

## État au 2026-09-06, 15 h — ce que la campagne et la nuit ont changé

Légende : ✅ tenu et mesuré en réel · 🔧 corrigé, mesuré une fois · ⚠ mesuré en défaut, ouvert ·
❓ toujours pas observé · 🧭 décision humaine.

- A1 (congélation, 1 course / 2 sessions) ✅ M04 — A2 (style visible) 🔧 le style atteint le brief
  depuis `d4cbf20a` — A4 (1 session / 7 jours, barquettes au congélateur) ❓ M13 : les jours
  déclarés étaient ignorés, corrigé par la voisine (`3d00d6e2`), pas retiré depuis — A5 (courses
  sans orpheline) ✅ — A8 (jours déclarés) 🔧 `3d00d6e2`.
- B11 (barquettes à 1/2/3+) ✅ — B13 (personne sans repas) ✅ aux repas principaux, relances +
  fusion ; 🔧 la case sans plat est un manque depuis `31ad30ca` — B14 (relance partielle) ✅
  mesurée (12,6 k → 6,5 k jetons) — B16 (citation réparée) 🔧 posé, jamais vu tirer — B17
  (titre neutre) ❓ — B18 (boîtes nourries) 🔧 de 12/12 sous le besoin à 0–2/12 sur le duo et le
  quatre après lot 0, arbitrage 1, regram, masse du pot, marge ; ⚠ variance du modèle ~30 pts
  entre témoins — B19 (casseroles qui suffisent) 🔧 `pot_ceiling` 7 → 1 sur le quatre — B22 ❓.
- C23 (allergies) ✅ cinq bouches — C24/C25 (minorité végane, base commune + boîtes) ✅ quatre
  (12/12 cellules, séparée 12/12) ; ⚠ le modèle remet parfois la végane sur le pot carné,
  réparé par relance/fusion — C26 (jamais toute la table au régime) ⚠ **ouvert sur cinq bouches
  (3/3)**, relance instrumentée `c77842b4` — C29 (dégoût nommé) ✅ séparé à chaque tir ; ⚠ le
  repli remet la bouche sur ce qu'elle évite (FB2, FB8) → en cours (0f) — C30 (exclusion de
  TABLE) ⚠ **tenue par rien** (4/4) → en cours (0f) — C31 (question de portée) ✅ 5/5 — C32
  (petits-déjeuners de la bouche liée) 🔧 v30, M06 : 10 manques → 0.
- D34–D37 (jour même 12 h / 21 h / fuseau) ✅ M11, M12 — D38 (fenêtre) ✅ — D39 (minuit) ✅ 409
  documenté (fixture).
- E40 (explication IA) 🔧 foyer : présente, nomme un arbitrage 5/13 ; solo : câblée `e8709708`,
  vue en réel ; ⚠ générique une fois sur deux — E41/E42 ✅ pizza/raviolis nommés, jamais de
  culpabilisation mesurée.
- F45 (kcal par repas) 🔧 `boxes_gate` (voisine) ; F49 (plafond par densité) 🔧 `a9de04dc` ;
  F50 (note datée +25 %) 🧭 arbitrage 3, non posé ; F48 ✅.
- G52/G53 (variété) ✅ selon le style ; G54 (envie servie telle quelle) ✅ mesuré (raviolis,
  pizza, fajitas).
- H57 (trois destinations, accusé) ✅ — H58 ✅ — H59 (Voir → ligne) 🔧 `4d43ff41`, ❓ écran —
  H60 (prochain plan) 🔧 `b388df83` — H61 (« Garder ») 🔧 `ede40358` — H63 ⚠ non mesuré —
  H66 (lecteurs morts) ✅ `c3561425`.
- I68 (latence) ⚠ 77–384 s ; jusqu'à quatre appels par plan — I69 ✅ — I71 ✅ ; `pot_growth`
  ❓ pas dans la réponse draft.
- J72–J75 (écrans) ❓ **personne n'a ouvert un écran**.
- K76–K79 (campagne) ✅ faite : 15 + 14 + 5 tirs ; rapports dans `2026-09-05-2020-…` et
  `2026-09-06-1400-…`.

**Encore ouvert, par gravité** : la table 100 % végétarienne sur cinq bouches ; l'exclusion de
table et le repli aveugle (en cours) ; la variance du modèle sur l'énergie (mesurer à n ≥ 3) ;
la note datée (arbitrage 3) ; les écrans.

## État au 2026-09-06, 17 h — bloc C (régimes, dégoûts) après la série FD

- **C · exclusion de table** (« la table évite poulet/saumon/thon ») ✅ mesuré réglé sur FD4 :
  24 morsures, 18 bouches relogées sur la boîte du même plat qui passe leur ligne, 0 boîte
  portant une protéine exclue, 4 manquants restants tous `no_dish` (plan incomplet, pas régime).
  Relance d'exclusion par parties (`mergeRetryCells`) et remède « le plat pour tous » quand le
  mot mordu est un mot de la TABLE (6a104f86).
- **C · dégoût d'une bouche** (« Paul n'aime pas le poulet ») ✅ FD2 : Paul 0 poulet, Nora 12
  boîtes propres. Restait 6 goûters sans la végane : « yaourt » nu dans la MÉTHODE alors que
  l'item disait « yaourt de soja » — corrigé (lot 2, en pose) : l'analogue déclaré éteint son
  mot nu dans la prose du même plat.
- **C · végane qui refuse le tofu** (FD8) 🔧 en pose : sa boîte existait et portait du tofu ;
  deux relances rendaient du tofu ; la relance nomme désormais la boîte, l'item et le rôle du
  remplaçant (légumineuse) qui suit aussi sa ligne. À mesurer sur FE8.
- **C · table 100 % végétarienne sur cinq** 🔧 M07 r4 (17:27, 0407a771) : relance acceptée, 6/13 cellules carnées, 164/164 nourris — premier vert, à confirmer n ≥ 3. Avant : M07 r3 relancé AVANT la boucle
  (bb0e217f) et refusé par `carrying` — le modèle ne remet pas de viande même relancé, et a
  composé sans casserole ni boîte (`no_batch_cooking`). Variance de modèle ; prochain levier :
  relance du flagrant par parties (prendre les cellules qui portent enfin), à mesurer n ≥ 3.
- **Plan incomplet (foyer)** : `no_dish` restant 4/107 (FD4), 4/107 (FD2) — lundi soir / lundi
  petit-déjeuner ; la fusion par cellule prend maintenant une cellule partiellement réparée
  (lot 2) ; à mesurer.
- **Journaux** : `meals_delivered.missing_rows`, `rehomed.not_rehomed`, motifs de rejet des
  trois relances — un compte sans ses cases a coûté une heure de lecture aujourd'hui.
- **H · note datée → la part grossit ce jour-là (arbitrage 3)** 🔧 à moitié : côté ANCRE posé
  (a5d1b636, `DATED_NOTE_BOOST = 0.25`, `note_boost` compté) ; mesuré N3 : la note est servie et
  nommée dans l'explication, mais Claire partage un bac sans objectif (`common_pot_day`) → 913 g
  mardi comme lundi. Le côté BAC (`potFactorFor`, lane 74) est demandé ; à remesurer sur N3.
- **H · l'accusé dit le sens** (cas « Léa n'aime pas les asperges, Marc adore ») 🔧 appliqué,
  commit en attente du « posé » de 74 : « Léa : à éviter — « les asperges » · Marc : à servir
  plus souvent — « les asperges » », FR + EN ; la carte « Voir » n'a pas le défaut (sections =
  sens). Points 1 (classer avant la ceinture, 0f) et 2 (composant séparé par boîte quand une
  bouche préfère ce qu'une autre exclut, 74) en cours.
- **C · une bouche préfère ce qu'une autre exclut** (asperges Léa/Marc, points 1-2-3) ✅ posés à
  trois : classer la note avant la ceinture (0f), brief v31 + `preference_split` (74), accusé
  qui dit le sens + relance par parties quand `composed 0` (moi, 769856a2). ASP5 : composé du
  premier coup ; ASP6 et ASP7 : la relance a mordu (3 puis 2 cellules), 0 fuite, 102/102. ✅
- **E43 · rationale et explication ne se contredisent pas** 🔧 ASP6 : l'explication de base disait
  « les asperges n'ont pas été retenues » sous trois boîtes d'asperges fusionnées → c686417e :
  après une fusion par parties, les lignes périmées sur le terme tombent, celles de la relance
  entrent. ✅ ASP7 : `merged_dropped 1, merged_added 1`, l'explication finale nomme les asperges de Paul.
