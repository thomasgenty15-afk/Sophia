# Campagne de mesure — arbitrage 7 (2026-09-05, soir)

Mesurer avant de coder. Douze cas en première passe, un tirage chacun, puis rejeux sur les
cas exposés. Fixtures de la campagne 9 points (mêmes portes que l'écran), `intent: draft`
(rien n'est écrit), une génération à la fois, Kong à 900 s. Lecture : `lire.py` (compteurs du
moteur, jamais recalculés, sauf variété / courses orphelines / explication IA) ; lectures
parallèles : `lecture-74-*` (énergie par bouche, densité, explication) et celles de la
troisième session (mémoire servie, sécurité, clarifications).

**Ce que cette campagne mesure** : la génération et la LECTURE de la mémoire (ce qui est
servi au modèle, les ceintures). **Ce qu'elle ne mesure pas** : l'ÉCRITURE de la mémoire
(classement des notes, clarifications, sécurité) — en `draft` sans note, le classifieur n'est
jamais appelé ; c'est la seconde moitié (banc des trois portes, banc des clarifications).

## Les cas et leurs attendus (écrits avant le tir)

| cas | fixture | style / courses / jours | attendus principaux |
|---|---|---|---|
| M01 | solo (perte de poids) | balanced / 2 / 7 | plan complet, boîtes solo, kcal cohérentes, explication IA ≤ 8 lignes |
| M02 | solo | minimal / 1 / 3 | sessions ≤ 30 min, répétition acceptée, une course |
| M03 | duo (Julie maintenance, Marc perte + « pas de champignons ») | balanced / 2 / 7 | boîtes à deux noms, portions qui divergent, champignons hors du plat commun (`exclusion_belt.refused 0`) |
| M04 | duo | minimal / 1 / 7 | une course pour sept jours : congélation marquée |
| M05 | quatre (Nora végane) | balanced / 2 / 7 | base commune + boîte végane, omnivores servis ≥ 50 % des déjeuners-dîners, `refused 0`, `flagrant false`, personne sans repas |
| M06 | quatre | minimal / 1 / 7 | idem sous « le moins possible » (C07 v28 s'était renversé) |
| M07 | cinq (Léa végétarienne, Tom œuf, Zoé arachide, Marc prise de masse, champignons/lentilles) | keen / 3 / 7 | variété (aucun plat > 2×), ≥ 2 casseroles/session, allergies à zéro, Marc plus servi que Zoé |
| M08 | cinq | minimal / 2 / 7 | tenue de la séparation sous minimal |
| M09 | cinq | balanced / 1 / 3 | fenêtre courte, une course |
| M10 | quatre | keen / 2 / 7 | variété sous keen avec une végane |
| M11 | duo, 12 h locales | balanced / 2 / 7 | le plan démarre aujourd'hui sans le déjeuner ; la rationale le dit |
| M12 | duo, 21 h locales | balanced / 2 / 7 | décalé à demain (`shopping_cutoff`), dit |

Verdict par cas : FAIL dès qu'un attendu tient à l'inverse ; INCONCLUSIVE si un chemin
manque ; WARN pour un ratio partiel ; PASS sinon.

## Résultats

(remplis au fil de l'eau — voir `passe1.log`)

### M01 — solo, balanced, 7 j (77 s) : **FAIL**
- **Aucune explication IA sur la lane solo** : la clé `explanation` n'existe pas dans la
  réponse de `generate-meal-v1` (elle n'existe que sur le foyer). C'est la demande répétée de
  l'utilisateur (E40) ; elle n'a jamais été livrée pour une personne seule.
- Jour même à 21 h 56 : plan décalé à demain (`shopping_cutoff`), 6 jours au lieu de 7, dit
  dans la rationale — attendu (D36).
- « 5 repas n'ont pas été composés » sur 6 jours : à instruire (voir plus bas).
- Variété, sessions, courses : propres (7 titres / 7 principaux ; 0 orpheline ;
  `freeze_on_purchase` présent, 0 marque avec 2 courses).
- **Cinq cases vides sur six jours** (`empty_slots: sun/lunch, mon/dinner, tue/lunch,
  wed/dinner, fri/dinner`) : 13 plats pour 18 attendus, sans repas dehors ni déjeuner au
  travail déclarés. La rationale le dit (« 5 repas n'ont pas été composés »), mais la
  personne n'a rien à manger cinq fois. Le remplissage (`composition_fill`, 2e appel) n'a pas
  comblé. À suivre sur M02 (solo, 3 j) pour savoir si c'est la lane solo ou ce tirage.

### M02 — solo, minimal, 3 j, 1 course (115 s) : **FAIL (explication seule)**
2 jours composés (samedi entamé), 6 cases sur 6 remplies, une session de 30 min, une course,
0 orpheline. Les cinq cases vides de M01 ne sont donc pas la règle de la lane solo : c'est un
tirage. À rejouer M01. Toujours aucune explication IA (lane solo).

### M03, M04 — duo : **refus 409 `plan_overlaps_existing`**
Le foyer duo avait un plan vivant (un tir non-`draft` antérieur d'une autre session). Retiré
à la main (`retired_at`, fixture QA) ; M03/M04/M11/M12 seront rejoués après la passe. Point
de méthode : en `draft`, la lane foyer refuse quand même un chevauchement — un aperçu qui
refuse alors qu'il n'écrit rien est une question à poser (le solo, lui, a rendu).

### M05 — quatre (Nora végane), balanced, 2 courses (212 s, une relance) : **FAIL (énergie)**
- **Régime : parfait.** 12 déjeuners-dîners sur 12 portent le composant carné pour les trois
  omnivores, Nora séparée 12/12, aucun retrait, personne sans repas (une relance, trois
  cellules fusionnées). La ceinture et le dénominateur font ce qu'ils promettent.
- **Énergie : 9 journées-bouche sur 10 encore ≥ 200 kcal sous le besoin**, ancrage plafonné
  10/10, densification arrêtée par les plafonds d'item (ceiling 6, floor 3), pas par les pots
  (`pot_exhausted 1`). Deux heures plus tôt, le MÊME foyer sur `54a1114a` finissait à 0/12.
  Ici les boîtes sont PLUS LOURDES (Paul 1 146 g/jour contre 972) et pourtant plus loin du
  besoin : le plan est moins dense (couscous et quinoa aux légumes dominent, 3 286 et 4 142 g
  tirés), et la densification bute sur le plafond ×2 par item dense. C'est exactement le cas
  de l'arbitrage 1 : un plafond par densité mesurée laisserait grossir la part dense au lieu
  d'ajouter des légumes. `pot_growth` n'est pas rendu dans la réponse `draft` (à ajouter).
- Variété propre (10 titres / 12 principaux, 24/24 collations), sessions 60 min, 0 orpheline.
- Explication IA : 2 lignes, présente, mais générique (« j'ai gardé les mêmes bases… ») —
  elle ne nomme aucun arbitrage réel. À juger plus sévèrement que mon lecteur (E40/E41).
  → **Lot à poser après la campagne** : (a) la règle de la boîte d'échange dans le prompt
  couvre aussi petits-déjeuners et collations (base qui suit la ligne la plus stricte : lait
  végétal, flocons ; œufs/laitages en boîte pour les autres, ou un petit-déjeuner à elle) ;
  (b) la consigne de relance pour une case SANS boîte (`via: null`) ne demande plus « une
  boîte à elle sur ce plat » mais « un plat à elle à ce moment, ou des boîtes sur ce plat » ;
  (c) compteur `held_off_regime` par moment (principal / autre) dans `meals_delivered`.

### M07 — cinq (Léa végétarienne, Tom œuf, Zoé arachide, Marc prise de masse), keen, 3 courses (315 s) : **FAIL**
- **Toute la table au régime de la minorité, encore** : 0 déjeuner-dîner sur 12 avec viande
  pour quatre omnivores (`swap.flagrant true`, 12 cellules absentes) — malgré v28/v29 ; la
  relance du flagrant a tiré une fois et n'a pas été acceptée. Les six casseroles sont
  toutes végétales (quinoa-pois chiches, orzo-tofu, polenta-haricots, couscous-pois chiches,
  pizza, raviolis). La phrase de prompt réduit le cas (C06 réparé plus tôt), elle ne le ferme
  pas ; sous « keen » avec cinq bouches il revient. **Le levier restant est un refus ou une
  relance plus dure** — décision produit.
- Allergies (œuf, arachide) : aucune trace dans les plats ✓ ; dégoût champignons : Marc
  séparé sur les raviolis (1/1) ✓ ; personne sans repas ✓ (une relance, 4 cellules fusionnées
  sur `not_named`).
- **L'explication IA nomme enfin des arbitrages réels** : « Les raviolis aux champignons
  demandés sont servis au groupe, avec une préparation séparée aux épinards pour la boîte
  individuelle concernée » ; « La pizza du vendredi reste au menu ». C'est la forme demandée
  (E40-E41) ; deux lignes seulement.
- Variété keen : 12 titres pour 13 principaux ✓, sessions 110-115 min ✓.
- Énergie : 8/8 journées-bouche sous le besoin, densification `no_dense_target` 8 (rien de
  dense à déplacer dans un plan 100 % végétal) — la conséquence directe du point 1.

### M08 — cinq, minimal, 2 courses (238 s) : **FAIL** — même défaut que M07
Toute la table végétarienne (flagrant), relance du flagrant non acceptée ; 8/12 journées-bouche
sous le besoin. Deux tirages sur deux pour ce foyer ce soir, contre 9/11 cellules avec viande
à 18 h (C06 sur v28). Le cas n'est pas fermé par le prompt.

### M09 — cinq, balanced, 3 j, 1 course (171 s) : **FAIL** — flagrant (3/3), et un dégoût refusé
Troisième tirage tout végétarien sur ce foyer. Un retrait pour dégoût (`exclusion_belt.refused
1`) : voir le détail ci-dessous.
Détail : la boîte À SON NOM de Marc (« box_mon_dinner_marc ») contenait des lentilles — le
modèle a écrit le dégoût dans la boîte de la personne qui l'a exprimé ; la ceinture l'a
retiré, la relance (1/1, une cellule fusionnée) l'a resservi : plan final sans manque. Le
compteur `refused` compte les retraits AVANT relance ; le lecteur le note désormais en WARN
et juge le plan final sur `missing`. Explication IA : « La demande de raviolis a été remplacée
par des bols de quinoa… » — sur deux jours, l'envie n'est pas servie et le modèle le dit ;
c'est un arbitrage nommé, mais contraire à « a pizza is a pizza » (v29), à trancher.

### M10 — quatre (Nora végane), keen, 2 courses (192 s, deux essais HTTP) : **FAIL (plan tronqué)**
- **Six jours demandés, deux composés** : plats sur dimanche et lundi seulement, 24 cases
  sans plat, UNE session au lieu des trois annoncées par la rationale (« Le plan pose 3
  sessions : dimanche, mardi, jeudi » — faux). L'invariant dit « personne sans repas » parce
  qu'une case sans plat n'est pas un manque : le trou du plan passait sous mon lecteur (corrigé
  : FAIL désormais) et sous le produit (aucun refus, aucun compteur en tête de réponse).
  → **À poser** : un plan qui couvre moins de jours que la fenêtre est refusé ou relancé, et
  la rationale ne peut pas annoncer trois sessions quand il y en a une.
- Sur les deux jours composés : régime tenu (Nora séparée 1/1, 2/4 cellules avec viande),
  variété keen ✓, session 110 min ✓. Énergie 2/2 sous le besoin.

### M11 — duo, plan du jour même (14 h 32 locales, Mexico) : **PASS sur le jour même**, FAIL énergie
- Le plan démarre aujourd'hui, le petit-déjeuner et le déjeuner du jour sautent, le dîner
  reste ; la rationale le dit mot pour mot (« Pour aujourd'hui, le petit-déjeuner et le
  déjeuner ne sont plus au plan : la journée est déjà entamée » ; « Courses et cuisson dès
  le matin, pour être prêt à midi » — cette dernière phrase est à relire : à 14 h 32 on n'est
  pas « prêt à midi »). Les deux « cases sans plat » sont ces deux moments passés (lecteur
  corrigé : tolérés le jour même). D34 ✓, D37 ✓ (fuseau du profil).
- Dégoût de Marc (champignons) : séparé 1/1, l'explication IA le nomme (« les raviolis aux
  champignons restent au menu, avec une préparation de courgettes dans l'autre boîte ») ✓.
- Énergie : 10/10 journées-bouche sous le besoin, rien de dense à déplacer (`no_dense_target`).

### M12 — duo, plan à 23 h 35 locales (Istanbul) : **PASS sur le décalage**, un trou, énergie
- Trop tard pour les courses : le plan démarre demain (`shopping_cutoff`), 6 jours au lieu
  de 7, la rationale le dit (« samedi était déjà entamé, le plan commence donc demain »). D36 ✓.
- **Un trou** : « Sur lundi, le déjeuner n'a pas été composé » — dit, mais pas comblé
  (le remplissage n'a rien fait). Même famille que M01 (5 trous) et M10 (24) : le plan
  incomplet est accepté et seulement annoncé.
- Dégoût de Marc séparé 1/1 ✓ ; explication IA nomme les raviolis ✓.
- Énergie : 6/8 journées-bouche sous le besoin.

## Bilan de la première passe (12 tirs, 22 h 38)

| cas | verdict | ce qui a tenu | ce qui a cassé |
|---|---|---|---|
| M01 solo balanced | FAIL | variété, courses, décalage 21 h | **pas d'explication IA (lane solo)**, 5 cases vides |
| M02 solo minimal 3 j | FAIL | 6/6 cases, 30 min, 1 course | pas d'explication IA |
| M03, M04 duo | refus 409 | — | plan vivant d'un autre tir (fixture) — rejoués |
| M05 quatre balanced | FAIL | régime 12/12, personne sans repas, variété, explication | énergie 9/10 (peu dense) |
| M06 quatre minimal | FAIL | déjeuners-dîners 11/11 | **10 petits-déjeuners/goûters sans la végane**, énergie 12/12 |
| M07 cinq keen | FAIL | allergies, dégoût, variété, **explication qui nomme les arbitrages** | **table 100 % végétarienne**, énergie 8/8 |
| M08 cinq minimal | FAIL | dégoût, personne sans repas | table 100 % végétarienne, énergie 8/12 |
| M09 cinq balanced 3 j | FAIL | dégoût resservi par relance | table 100 % végétarienne, envie non servie |
| M10 quatre keen | FAIL | régime sur ce qui existe | **2 jours composés sur 6**, rationale fausse (3 sessions) |
| M11 duo jour même 14 h | PASS/FAIL | **jour même juste**, dégoût, explication | énergie 10/10 |
| M12 duo jour même 23 h | PASS/FAIL | **décalage juste**, dégoût, explication | 1 trou, énergie 6/8 |

**Ce qui tient partout** : personne sans repas aux déjeuners-dîners (relances + fusion), les
dégoûts (Marc et ses champignons, séparé à chaque fois), les allergies, la variété selon le
style, le temps des sessions, les courses sans orpheline, le jour même dans les deux sens.

**Ce qui casse, par gravité** :
1. **L'énergie** : 11 tirs sur 11, la majorité des journées-bouche ≥ 200 kcal sous le besoin —
   les plans sont peu denses et la densification bute (plafond ×2 par item dense, plancher de
   légumes, ou rien de dense à déplacer). C'est l'arbitrage 1, et il est le premier.
2. **La table entière au régime de la minorité** sur le foyer de cinq (3/3 tirs ce soir, sous
   keen, minimal et balanced) — v28/v29 ne suffisent pas ; la relance du flagrant n'est jamais
   acceptée, et le journal ne dit pas pourquoi. Décision : refus, ou relance plus dure.
3. **Le plan incomplet accepté** : M10 (2 jours sur 6), M01 (5 cases), M12 (1 case) — annoncé
   par la rationale, jamais refusé ni relancé ; et M10 annonce trois sessions pour une.
4. **Les petits-déjeuners et goûters de la bouche liée** (M06) : la boîte d'échange ne connaît
   pas les moments sans boîte.
5. **Aucune explication IA sur la lane solo** — la demande répétée ; sur le foyer elle existe,
   nomme les arbitrages 4 fois sur 9, reste générique sinon.

## Lots à poser après la campagne (dans l'ordre des arbitrages, mesurés avant)

1. **Plafond par densité mesurée** (arbitrage 1) — la cause commune des 11 échecs d'énergie :
   `densify` s'arrête sur `ceiling` (×2 par item dense, M05), `floor` (légumes, M06) ou
   `no_dense_target` (rien de dense dans un plan 100 % végétal, M07-M09, M11). Le plafond
   d'assiette 1,35 kcal/g et le plafond ×2 par item deviennent un plafond par densité réelle
   du plat ; compteur avant/après obligatoire ; un tir C03/M05 avant/après.
2. **Le plan incomplet n'est ni refusé ni relancé** : `empty_slots` est compté
   (`emptySlotsIn`), dit dans la rationale (« 5 repas n'ont pas été composés »), archivé
   (`shown_plan_gaps`), et c'est tout — M10 a rendu 2 jours sur 6 avec un 200. Le remplissage
   (`fillPlanComposition`) ne comble que la composition des plats existants, jamais une case
   vide. À poser : une relance partielle « compose these cells » sur les cases vides (la même
   voie que la relance « personne sans repas », qui sait déjà fusionner par cellule), et un
   refus au-delà d'un seuil en compose réel ; la rationale ne peut pas annoncer trois sessions
   quand le plan en porte une.
3. **La table entière au régime de la minorité, foyer de cinq** (3/3 ce soir) : instrumenter
   d'abord la relance du flagrant (journaliser `after.cells_carrying`, `missing`, `refused`,
   nombre de plats — aujourd'hui une relance non acceptée est muette), puis décider : refus
   en compose, ou relance qui exige N cellules nommées avec le composant, ou prompt qui
   sépare l'envie de table (raviolis, pizza) de la ligne des omnivores.
4. **Petits-déjeuners et goûters de la bouche liée** (M06, 10 manques) : la boîte d'échange
   couvre tous les moments ; la relance pour une case sans boîte demande un plat à elle.
5. **Explication IA sur la lane solo** : câbler `plan_explanation` (le module existe, seule
   la lane foyer l'appelle) ; sur le foyer, exiger qu'elle nomme les arbitrages (elle reste
   générique 5 fois sur 9).
6. `pot_growth` et `pot` rendus dans la réponse `draft` (aujourd'hui `null`).

### M03 (rejeu) — duo, balanced, 2 courses (177 s) : FAIL énergie seule
Boîtes à deux noms, dégoût de Marc séparé, personne sans repas, variété et courses propres,
explication IA présente. Énergie : 8/8 journées-bouche sous le besoin.

### M04 (rejeu) — duo, minimal, UNE course pour sept jours (148 s) : FAIL énergie seule
- **La congélation à l'achat marche** (A1) : deux sessions (dimanche, mercredi), une seule
  course dimanche, et la « dinde hachée » cuisinée mercredi est marquée `freeze_on_purchase`
  sur la liste (1/37). Un compteur dit qu'une préparation sur cinq aurait besoin d'une course
  plus tardive (`raw_keeping_needs_later_shop 1/5`) : à regarder, c'est peut-être une ligne
  fraîche non congelable prévue pour mercredi.
- Aucune boîte marquée « congélateur » (`uses_kept_freezer 0/13`) : chaque session couvre
  trois jours, ce qui tient au frigo ; le cas « une session pour sept jours » (A4) n'est pas
  produit par ce style (deux sessions) — à forcer par une fixture `cook_days` à un seul jour.
- Dégoût séparé 2/2 ✓, personne sans repas ✓, 30 min ✓, variété minimal (×3) ✓, explication
  IA présente (raviolis) ✓. Énergie 12/12 sous le besoin (ceiling 6, rien de dense 6).

### M01 (rejeu) — solo, balanced (295 s) : FAIL — un trou (mercredi midi), pas d'explication IA
Un seul repas non composé cette fois (contre 5 au premier tirage) : le trou solo est
fréquent mais variable ; 295 s pour un solo (deux appels modèle). Toujours pas d'explication
IA sur la lane solo.

## Lecture énergie de la voisine (lecture-74-lot1.md) — ce qui change le bilan

**Le « sous le besoin » est en partie une convention d'attribution, pas l'assiette.** Le
pliage des casseroles dans les plats (`foldPreparationsIntoDishes`) attribue à un plat
`uses.servings / servingsMade` de la casserole ; le modèle écrit `uses.servings: 1` presque
partout (36/39 plats de M05, 44/44 de M06, 11/11 de M11, 19/19 de M12), quel que soit le
nombre de bouches. Sur M07, les boîtes tirent 34 417 g des casseroles quand le pliage n'en
attribue que 5 826 g aux plats (×5,9) : 1/15 de casserole pour un repas de 3 kg, 0,2 kcal/g
lu. L'ancre d'énergie lit ce même pliage : « 8/8 sous le besoin » et `no_dense_target` sur
M07 sont des conséquences de l'attribution. Écart tiré/attribué par plan : M05 ×1,1 · M06
×1,0 · M07 ×5,9 · M08 ×1,0 · M09 ×1,3 · M10 ×1,3 · M11 ×1,3 · M12 ×1,6.

**Conséquence sur l'ordre des lots** : AVANT le plafond par densité mesurée (arbitrage 1),
rendre l'énergie d'une boîte indépendante de `uses.servings` — grammes tirés × (kcal de la
casserole / grammes prêts de la casserole), ou `uses.servings` dérivé de ce que les boîtes
tirent — et poser le compteur Σ tiré / Σ attribué par plan. Sinon le nouveau plafond se
calcule sur un livré faux d'un facteur 1,3 à 6. Le lot 1 de la liste ci-dessus devient le
lot 0.

Autres faits de sa lecture : M02 (solo) à 111 % de l'enveloppe — premier plan solo ≥ 100 %
depuis le 23/08 ; M01 à 70 % ; densité réelle des boîtes du foyer de quatre 1,57–1,69 kcal/g
(au-dessus du plafond fixe 1,35), duos 0,84–1,02 ; aucune boîte à énergie illisible ; M10 deux
jours sur six confirmé.

### M13 — duo, `cook_days = [dimanche]` seul, 1 course (200 s) : **le jour de cuisine déclaré n'est pas respecté**
Un seul jour de cuisine déclaré, et le plan pose TROIS sessions (dimanche, mardi, jeudi)
sans le dire : `resolveCookingCapacity` remplace les jours déclarés par ceux que le style et
le nombre de courses dérivent (`cookDays: plan.cookDays`). A8 tient à l'envers, en silence ;
et A4 (barquettes au congélateur pour une seule session) n'a pas pu être observé. À poser :
les jours déclarés gagnent sur la dérivation, ou la rationale dit « déclaré : dimanche ;
posé : dimanche, mardi, jeudi ».

## Fin de campagne (22 h 53) — 15 tirs, 13 plans lus

| ce qui tient | ce qui casse (par gravité) |
|---|---|
| personne sans repas aux déjeuners-dîners (relance + fusion) · dégoûts séparés à chaque tir · allergies · variété selon le style · temps de session · courses sans orpheline · congélation à l'achat (une course, deux sessions) · jour même à midi et à 23 h · explication IA sur le foyer, qui nomme les arbitrages 5 fois sur 13 | **0.** l'énergie livrée est lue ×1,3 à ×6 trop bas (`uses.servings: 1`) — à poser avant tout **1.** plafond par densité (arbitrage 1) **2.** table 100 % végétarienne sur le foyer de cinq (3/3) **3.** plan incomplet accepté (M10 2 j/6, M01 5 puis 1 trou, M12 1) **4.** petits-déjeuners/goûters de la bouche liée (M06, 10 manques) **5.** pas d'explication IA en solo **6.** jours de cuisine déclarés ignorés (M13) **7.** `pot_growth`/`pot` absents de la réponse draft |

Latence : solo 77–295 s (jusqu'à trois appels), foyer 148–315 s (une à deux relances). Un
tirage par cas (deux pour M01) : des directions, pas des taux.

## Seconde moitié — l'ÉCRITURE de la mémoire (banc SC de la troisième session, 23 h)

Cinq phrases sur un compte neuf (`qa-scope-20260905`), 3/5 :
- PASS : « On mange végétarien » → question de portée, RIEN d'écrit avant le tap (vérifié),
  « Oui » ⇒ contrainte par la porte de sécurité ; « … le lundi soir » → note datée, aucune
  contrainte ; « Passer » ⇒ refus propre.
- FAIL : « Je suis végétarienne » → le modèle pose la question au lieu d'écrire le régime
  (question de trop) ; « On essaie de manger vegan en ce moment » → `daily_cap` (deux
  questions déjà consommées) et **la phrase est perdue, sans note ni question** — quand le
  plafond refuse une question de portée, l'information tombe. Correctif en cours par la
  troisième session (règle SCOPE), rejeu des deux cas ensuite.
Rejeu après correction (`316d0dd8`, règle SCOPE resserrée par un contre-exemple à la
première personne) : « Je suis végétarienne » ⇒ sécurité directe sans question ; « On essaie
de manger vegan » ⇒ question puis « Non, pas toujours » ⇒ note. **5/5 cas de portée tiennent.**
Observation produit à porter demain : quand le plafond de deux questions par jour refuse une
question de portée, la phrase tombe entièrement — ni contrainte, ni note, ni accusé. À
décider : la garder en note « à clarifier » plutôt que la perdre.

## Posés dans la nuit (à relire avec la mesure finale de la voisine)
- Lot 0 `092b2bba` + `fa224681` (énergie par grammes tirés ; frais non résolu jugé contre la
  boîte) — voisine.
- Arbitrage 1 `a9de04dc` (plafond par densité mesurée, bornes 1,0–1,35) — voisine. Duo : 0
  journée-bouche sous le besoin (hier 10/10). Quatre : plafond muet, mais Nora remise sur
  les pots carnés (17 manques) — le cas 2 de la liste reste entier.
- Lot 3 `3d00d6e2` (jours de cuisine déclarés) — voisine.
- Arbitrage 2 `ede40358` (« Garder » → ligne retenue) — moi.
- Lot 5 `e8709708` (explication IA en solo, prouvée sur M02) — moi.
- Restent : plan incomplet accepté (2), table 100 % végétarienne (3), petits-déjeuners de la
  bouche liée (4), lecteurs morts (arbitrage 6), `pot_growth` dans la réponse draft (6).

## Mesure finale de la nuit (voisine, 02 h 30, tous les lots posés) — `lotG-assiette/mesure-finale.txt`
- **Solo** : 2 361 kcal/jour = 115 % de la borne basse, protéine 115 %, verdict « within » ;
  explication IA présente (« Le poisson est placé jeudi… »). Mais **3 jours pleins sur 7** :
  le plan incomplet reste le défaut du solo.
- **Duo** : Julie 1 454 / Marc 1 592 kcal/jour en boîtes, 3 journées-bouche sur 12 encore
  ≥ 200 kcal sous le besoin (hier 10/10) ; ce qui borne maintenant : `pot_ceiling` 5 (la
  croissance des casseroles reste sous les boîtes dimensionnées) et le plafond par densité 5.
- **Quatre** : Nora séparée 14/16, personne sans repas, 52 % de la table couverte (37 %
  hier), `pot_ceiling` 4.

**Leviers suivants, par ordre** : `pot_ceiling` (faire grossir la casserole jusqu'aux boîtes
dimensionnées, pas seulement jusqu'aux tirages d'avant dimensionnement — la croissance
tourne avant le dimensionnement, voir a75cfd5a/ec3645e6) ; le plan incomplet (solo 3/7,
relance partielle sur les cases vides) ; puis les petits-déjeuners de la bouche liée et la
table végétarienne sur cinq bouches.

## ⟳ 2026-09-06 · 16 h — M07 r3, FC2/FC4 de 0f, et ce que le moteur sait faire sans le modèle

**M07 r3 (cinq, keen, 3 courses)** — FAIL : `flagrant`, 9 repas manquants (`held_off_exclusion 4`,
`no_dish 5`), et cette fois le modèle a composé **sans aucune casserole ni boîte** (`delivery:
no_batch_cooking`, 0 préparation) sur un foyer de cinq en keen. La relance du flagrant (désormais
AVANT la boucle, bb0e217f) a été rejetée par `carrying` : 42 plats rendus, 0 → 0 cellule carnée,
9 → 2 manquants. Le modèle refuse la viande même relancé ; ce tir est la variance du modèle, pas
un plafond. `exclusion_belt.retried: false` avec `bites_before 5` : le booléen n'était posé qu'à
l'acceptation — « rejetée » et « jamais partie » se lisaient pareil (corrigé : tentatives + motif).

**FC2 (0f) — Nora végane retirée de 13 boîtes.** Le modèle l'avait nommée sur la boîte « dinde »
de chaque repas ; la ceinture l'a retirée 13 fois ; trois relances n'ont rien rendu. Or CHACUN de
ces plats portait une boîte de tofu, à un nom, qui passait sa ligne. « Écris-lui une boîte à
elle » à un modèle qui l'a déjà écrite ne répare rien. → `rehomeHeldOff` : le moteur déplace le
nom sur la boîte du même plat, à la même case, que sa ligne accepte (ceinture PAR BOÎTE, même
scan que le parseur), avant toute relance. Zéro appel modèle.

**FC4 (0f) — la table exclut poulet/saumon/thon.** 7 déjeuners-dîners sur 13 composés avec ;
relance d'exclusion rejetée en bloc (« pas meilleure en entier »), relance par parties à 0
cellule fusionnée, 21 repas manquants. Deux causes : la relance d'exclusion ne gardait pas les
cellules qu'elle avait réparées (→ `mergeRetryCells`) ; et la relance par parties demandait à
Paul, Claire et Léo « une boîte à soi, composant échangé » — trois boîtes de tofu à côté d'un
poulet que personne ne mange (→ `tableTerms` : un mot de la TABLE demande le plat pour tous).

Mesure à suivre : rejeu FC2/FC4/FC8 par 0f après pose.

## ⟳ 2026-09-06 · 17 h — ce qui a été posé, et ce que la série FD a mesuré

| commit | quoi | mesuré |
|---|---|---|
| bb0e217f | relance du flagrant AVANT la boucle « personne sans repas », retour en arrière si elle ne répare pas | M07 r3 : rejetée par `carrying` (0 → 0 cellule carnée ; le modèle a composé sans casserole ni boîte) |
| 6a104f86 | relogement sur la boîte du même plat qui passe la ligne ; relance d'exclusion par parties ; `tableTerms` ; motifs de rejet | FD4 : 18 relogées sur 22, 0 protéine exclue servie, 4 manquants tous `no_dish` — réglé. FD2 : 6 goûters restaient (voir dessous). FD8 : 0 relogée (aucune boîte acceptable pour une végane sans tofu) |
| 10d74992 | analogue déclaré → mot nu éteint ; fusion par cellule dès que MOINS de bouches manquent ; la relance nomme la boîte et l'item ; `missing_rows`, `not_rehomed`, « no_cell » | FE2/FE8 en cours (0f) |
| (en pose) | relance du flagrant par parties : les cellules qui portent enfin sont prises | M07 r4 à tirer |

Ce qui reste au-dessus de tout ça : la **variance du modèle** (M07 r3 sans casserole ; FC4 de
74 à 3 471 kcal de table contre 6 359 au tir d'avant). À mesurer n ≥ 3 par cas avant de
conclure sur un correctif ; un tir vert n'est pas une preuve, un tir rouge non plus.

**M07 r4 (17:27, 0407a771)** — premier tir VERT du foyer de cinq : relance du flagrant acceptée
en entier (1/1), 6/13 déjeuners-dîners carnés pour les omnivores, `flagrant false`, 164/164
nourris, `missing_rows []`, 0 case vide, 3 sessions ≤ 115 min, 0/8 journées-bouche ≥ 200 kcal
sous le besoin après densification. Reste WARN : ancrage plafonné 8/8, explication sans
arbitrage. Un tir, pas une preuve : rejouer n ≥ 3.

**N3 (17:43, a5d1b636) — arbitrage 3, mémo daté « Claire a du sport le mardi soir » (when tue/dinner)** :
la note est servie (`notes served=1`), l'explication la nomme (« Le dîner du mardi est gardé chaud,
complet et plus consistant pour accompagner la soirée sportive de Claire »), `note_boost
{member_days 1, applied 0}` — et la boîte de Claire au dîner du mardi fait 913 g, comme lundi.
Cause : Claire partage un bac avec Léo (2 noms), sans objectif → sa journée est `common_pot_day`
(14 journées-bouche sur 28 sur ce foyer) : l'ancre ne la dimensionne pas, donc le cran de la note
ne l'atteint pas. La phrase bouge les mots, pas les grammes — mesuré une fois de plus. Le cran
doit aussi passer par le dimensionnement du BAC (lane 74, `tubServed`/`potFactorFor`) : +25 % ×
la part de la bouche dans le bac, ce jour-là.

**N3b / N3c (17:53, 17:59 — 0ae22b5a de 74 : le cran passe aussi par le bac ; f7621b64 : détail par
clé)** : `note_boost {applied 1, applied_pot 1→3}` ; N3b, Claire a SA boîte le mardi (337 g) à côté
de celle de Léo (662 g), plus petite que sa part des autres soirs (~475 g) ; N3c, `detail
["620d… tue:clamped:0.62:790:1063"]` — la cible du jour porte le cran (790 = 632 × 1,25), la boîte
du modèle livrait 1 063 kcal, et le facteur a été rabattu à 0,62 (659 kcal) : le PLAFOND DE
MASSE borne le plus gros repas sur la répartition SANS le cran (`shared.bySlot`), il reprend
d'une main ce que la note donne de l'autre. Correctif prêt (mouth_anchor.ts : le plafond voit
le cran), à poser après le tir de 0f ; N3d à tirer.

**N3d (18:14, 6f9385d3 : le plafond voit le cran)** : Claire repartage un bac (`common_pot_day`,
`applied 0`), le côté BAC de 74 (0ae22b5a) mord : `applied_pot 2` ; bac du mardi soir 1 029 g à
deux (≈ 514 g) contre 980 g lundi (≈ 490 g) : **+5 %** pour +12,5 % attendus sur le bac. Direction
juste, amplitude sous l'arbitrage ; l'explication n'a pas nommé la note cette fois. Quatre tirs
N3 : la note est servie 4/4 et nommée 3/4 ; les grammes suivent depuis N3b, sous le quart.

**2901b046 — l'accusé dit le sens.** Cas mesuré par 0f (« Léa n'aime pas trop les asperges mais
Marc adore ») : classé juste, accusé muet sur le sens. Désormais « Léa : à éviter — « les
asperges » · Marc : à servir plus souvent — « les asperges » » (FR/EN). Points 1 (0f, classer
avant la ceinture) et 2 (74, v31 : composant séparé par boîte quand une bouche préfère ce qu'une
autre exclut, 5fa06ef6) posés ou en pose ; rejeu du cas par 0f à suivre.

**769856a2 — relance « préférence contre exclusion ».** ASP4 (74) : Paul veut des asperges,
Claire n'en veut pas ; brief v31 servi, le modèle promet « un ajout séparé dans les boîtes de
Paul » et n'en met dans aucune boîte (`composed 0`). Posé : une mesure unique (« qui porte le
composant dans sa boîte, à quelles cellules »), une relance qui nomme la bouche, le mot, le
plancher de deux repas et interdit la boîte de l'autre, et la prise par parties des cellules
rendues avec le composant (jamais une cellule où le refusant le porte, jamais une cellule qui
coûte un repas). **ASP5 (18:49)** : composé du premier coup — asperges dans la boîte de Paul à
4 repas, 0 chez Claire, `retry_attempts 0`, 102/102 nourris. La relance est câblée et comptée,
pas encore exercée en réel (ASP6 en cours pour la voir mordre).
**ASP6 (18:52)** : le modèle a composé 0 → la relance a mordu : `preference_split_retry_merged
{cells [mon/dinner, mon/lunch, tue/lunch], composed [0, 1], missing [0, 0], imported
prep_asparagus}` ; plan final : asperges dans la boîte de Paul à 3 repas, 0 chez Claire, 0 fuite,
102/102 nourris, `retry_attempts 1, retry_accepted 1, retry_merged_cells 3`. **Prouvé en réel.**
Reste : l'explication du plan est celle du plan de BASE (« Les asperges n'ont pas été retenues
cette semaine ») — elle contredit le plan fusionné (point 43 de la checklist) ; à réparer : après
une fusion par parties, retirer les lignes périmées sur le terme et reprendre celles de la relance.
**c686417e — l'explication après une fusion par parties.** `reconcileExplanationAfterMerge` :
les lignes de la base qui nomment le terme fusionné tombent, celles de la relance entrent (même
porte), plafond 8 ; journal `plan_explanation.merged_dropped/merged_added`. ASP7 en cours.
**ASP7 (19:09, c686417e)** : composé 0 → relance fusionnée sur 2 cellules (`prep_asparagus_mon`
importée), `preference_split {composed 1, retry_accepted 1, retry_merged_cells 2}`, 0 fuite,
102/102 ; `plan_explanation {merged_dropped 1, merged_added 1}` — l'explication finale nomme
les asperges dans les boîtes de Paul. **Relance et réconciliation prouvées en réel** (ASP6, ASP7).
