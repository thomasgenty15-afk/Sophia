# Plan pour Opus — cibles par personne, consignes cohérentes et validation du foyer

À appliquer sur le code courant. Référence : `REVUE-RESULTAT-REPARATIONS-FOYER-2026-09-13.md`. Ce plan reprend les défauts confirmés et la validation restée inachevée ; il ne demande pas de réimplémenter les lots précédents. **Trois lots séquentiels : 1 → 2 → 3.**

## Mission et règles d'exécution

Terminer la transmission correcte des besoins individuels au modèle, supprimer les consignes contradictoires encore injectées, puis démontrer le parcours pour des foyers de 1, 2 et 4 personnes. Le compte maître reste le seul compte autorisé à générer.

- Avant toute modification, lire `AGENTS.md`, relever l'état du dépôt partagé et conserver les travaux des autres sessions. Archiver le diff pertinent et les empreintes des fichiers effectivement testés : le commit de départ seul ne représente pas un arbre modifié.
- Conserver la lane foyer unique, les équations, les protections, les tolérances, les apports fixes explicites, les réglages fournisseur/fast et les arrondis entiers. Les forfaits pain/fromage/dessert restent supprimés.
- Conserver `repair.v2`, les opérations de session, les contrôles de surfaces, l'atomicité du patch et la restauration de `cook_on` déjà réalisés. Corriger leurs régressions éventuelles si un test les reproduit ; ne pas les reconstruire sans cause.
- Deux réparations du plan au maximum **par demande du foyer**, jamais deux par personne. Une réponse rejetée ou un appel en erreur compte. Aucun retour des boucles de réparation spécialisées.
- Une portion obligatoire absente, une violation de sécurité ou une validation indisponible interdit l'activation et préserve l'ancien plan. Une meilleure version sûre et complète peut rester livrable avec des écarts nutritionnels selon la politique existante ; elle doit être annoncée comme telle, pas « pleinement conforme ».
- Aucun déploiement, db push/reset, secret ou nettoyage destructif. Respecter les opérations réservées à l'humain dans `AGENTS.md`. Utiliser les fixtures et le périmètre QA existants. Le chantier 546 et un changement de modèle restent hors périmètre.
- Continuer jusqu'aux vérifications prévues. Un rapport doit séparer les critères satisfaits, échoués et non testés ; une ligne verte ne peut pas reposer uniquement sur un commentaire ou un nombre de tests.

## Lot 1 — Donner au modèle des objectifs attribués et une seule consigne de réponse

### 1.1 Reproduire les deux défauts avec les messages finaux

Archiver comme contre-exemple la requête de réparation dans :

`scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/perte-h4n4-2026-09-11T12-30-45-131Z.prompts.txt`.

Deux tests doivent d'abord montrer le défaut actuel :

1. Trois objectifs de journée, 1826 / 3824 / 2459 kcal, apparaissent pour le même jour sans indiquer leur personne. Les objectifs de créneau souffrent de la même omission.
2. Un complément fait entrer `Return the full plan JSON with only these dishes added.` dans le message utilisateur de réparation, alors que le système exige un patch.

Tester les messages assemblés comme ils partent au transport, pas seulement `repairSystemPrompt`. Ne pas faire échouer la génération initiale, qui doit conserver son schéma de plan complet.

### 1.2 Conserver l'identité du besoin jusqu'au texte envoyé

Fichiers principaux :

- `supabase/functions/_shared/keel/plan_defect_pass.ts` : `nutritionReadout`, `RepairDayContext`, `repairDefectLines`, `where`, `planRepairMessage`.
- `plan_repair_loop.ts` : type `RepairDefect` et transport de `memberId`, date, créneau, mesure, cause.
- `plan_repair_context.ts` / `plan_repair_unit.ts` : projection, unités, dépendances et périmètre.
- `generate-household-meal-v1/index.ts` : `c4ProteinContexts`, `c4UpstreamDefects`, construction du message et appel `final_repair`.

Aujourd'hui `where(d)` ne rend que jour/créneau/titre. La section protéique sélectionne un contexte avec `memberId`, puis omet cette identité dans sa phrase. Corriger les deux chemins, y compris les replis lorsque le contexte détaillé manque.

Toute consigne nutritionnelle individuelle doit porter explicitement :

- identifiant canonique de la personne ; prénom facultatif pour la lisibilité, jamais clé de jointure ;
- date réelle, et créneau lorsqu'il existe ;
- identifiant(s) d'unité associés ou liste d'unités pour un défaut journalier ;
- nature et unité de la mesure, valeur servie, cible ou bornes, tolérance venant du contrat existant ;
- préparation concernée et consommateurs dépendants lorsqu'un lot partagé est impliqué.

Format illustratif, à alimenter exclusivement depuis les structures de production :

```text
member_id=<A> | date=2026-09-12 | scope=day | units=U1,U2,U3
energy_served_kcal=2702 | target_kcal=1826 | tolerance_pct=5

member_id=<B> | date=2026-09-12 | scope=day | units=U1,U2,U3
energy_served_kcal=2702 | target_kcal=3824 | tolerance_pct=5
```

Le partage des mêmes unités ne signifie pas le partage des mêmes portions ou objectifs. Une date seule, un titre de plat ou « quelqu'un dans le foyer » ne suffit pas pour adresser un besoin individuel. Deux personnes portant le même prénom doivent rester distinctes.

Ne pas extraire une identité d'une phrase libre. Si un défaut supposé individuel n'a pas de propriétaire résolvable, le compter comme contexte incomplet et empêcher un appel prétendant le réparer sans cette information. Un défaut collectif de session reste collectif, avec ses références et consommateurs ; ne pas lui attribuer arbitrairement le maître.

### 1.3 Donner les contraintes des autres consommateurs et garder la bonne responsabilité

Lorsque la préparation modifiée nourrit plusieurs personnes ou plusieurs jours, inclure les contrats nécessaires de **tous ses consommateurs**, y compris ceux déjà conformes. Donner les quantités réellement mesurées de chacun, pas les quantités du maître recopiées sur les autres. Identifier les éléments modifiables et les dépendances à préserver.

Le modèle compose les recettes et leur densité ; le moteur calcule les quantités finales par personne. Ne pas demander qu'une portion standard ait simultanément plusieurs valeurs énergétiques individuelles. Préciser dans les messages l'échelle des quantités projetées et attendues : portion standard ou lot entier. Réutiliser les conventions de production CIQUAL, références et cru/cuit ; vérifier qu'elles sont toujours présentes après assemblage.

Faire suivre à chaque cible énergétique son propre couloir de masse/densité et son état actuel lorsqu'ils sont nécessaires à la réparation. Une consigne « conserver les calories déjà correctes » doit désigner les portions concernées ; elle ne peut pas être une interdiction globale quand d'autres personnes ont un écart calorique. Même règle pour « ne pas changer le poids » lorsque le poids est justement hors bornes.

Si plusieurs contrats ne sont pas compatibles avec une préparation commune, conserver le mécanisme existant d'isolation ou de complément. Ne pas moyenner les objectifs du foyer et ne pas élargir les bornes pour obtenir artificiellement une intersection.

### 1.4 Remplacer les mini-prompts d'amont par des constats structurés

Cause confirmée : `portion_sizing.ts::dedicatedDishInstruction` porte encore l'ordre de réponse complète. Le handler le stocke dans `c4DedicatedAsk.text` et il rejoint les défauts d'amont. `c4DensityAsk` transporte aussi du texte d'instruction préassemblé : auditer ce chemin et les autres producteurs alimentant `c4UpstreamDefects`.

Modifications :

1. Les sites de mesure conservent leurs calculs mais transmettent des données typées : cause, personne, date/créneau, unités, direction de densité, cible/plancher/plafond, rôle du complément, préparations et dépendances.
2. Pour `c4DedicatedAsk`, conserver les valeurs utiles de `DedicatedRepair` ; la projection actuelle limitée à `{memberId, day, slot}` perdrait les densités si l'on supprimait seulement `text`. Pour `c4DensityAsk`, conserver les bornes et les identités actuellement enfermées dans la prose.
3. Le constructeur commun rend ces faits en instructions compatibles avec le périmètre final. Un seul endroit décide du schéma de retour : `REPAIR_PATCH_SCHEMA_LINES` et les lignes dynamiques du contrat.
4. Les anciennes fonctions de formulation peuvent rester pour d'autres appelants si nécessaire ; leur texte de réponse complète ne doit plus atteindre `final_repair`. Vérifier les appelants avant suppression.
5. Supprimer aussi les interdictions globales contradictoires du type « ne changer aucune autre préparation » injectées par un seul complément alors que le périmètre autorise d'autres changements. Préserver l'interdiction **locale** de modifier une préparation partagée gelée.

Ne pas résoudre cela par une regex qui retire une phrase à la fin du prompt : elle masquerait le mélange des responsabilités et laisserait les autres contradictions intactes.

### 1.5 Aucune personne ne doit disparaître par troncature

`repairDefectLines` tronque actuellement à `REPAIR_MAX_LINES = 24`. Vérifier la version assemblée pour N=4 avec défauts de sécurité, portions, densité et protéines sur plusieurs jours. Le plafond de la projection ne couvre pas nécessairement cette première troncature.

Regrouper les données sans perdre le lien personne/date/créneau ni les contraintes de sécurité. Si le contexte obligatoire ne tient toujours pas, remonter un état explicite `tooLarge`/contexte incomplet avant l'appel. Ne pas augmenter simplement tous les plafonds et ne pas remplacer les personnes omises par « davantage de défauts du même type ».

### 1.6 Critères de sortie du lot 1

- Les mêmes dates/créneaux avec deux puis quatre objectifs différents rendent des instructions attribuables sans ambiguïté. Vérifier aussi les protéines, les prénoms identiques et les présences variables.
- Le prompt final « complément + défaut de densité + lot partagé + session » demande uniquement le patch, contient toutes les données utiles et aucun ordre global incompatible avec le périmètre.
- Pour une session seule en défaut, seuls son texte et son périmètre sont modifiables. Des recettes saines ne sont pas ouvertes par défaut.
- Pour un lot commun, les contrats des consommateurs sains sont présents et mesurables après réparation ; aucun défaut individuel n'est fusionné par simple jour/créneau.
- Une nouvelle section ou un nouveau producteur de défauts incompatible fait échouer un test de message final. Une recherche textuelle du code seule ne constitue pas ce test.

## Lot 2 — Terminer les preuves déterministes avec des plans adaptés aux foyers

### 2.1 Constituer deux corpus explicitement distincts

**Corpus déterministe :** fixtures construites ou adaptées pour vérifier le code, avec réponse fournisseur contrôlée. C'est autorisé et nécessaire ; cela ne mesure pas la capacité créative du modèle. Valider d'abord le plan de référence avec les fonctions de production, puis introduire un défaut précis, sans modifier les attentes d'après la sortie obtenue.

**Corpus fournisseur réel :** premiers jets réellement produits pour leurs foyers, puis figés. Il sera constitué ou complété au lot 3. Un ancien plan solo confronté à quatre personnes peut rester un test difficile, mais pas servir de scénario nominal N=4.

Outils existants : `scratchpad/2026-09-11-FIABILITE-RECETTES/banc-lot-F.ts`, `transport-lot-F.ts`, `fiches-lot-F.ts`, `campagne-lot-F.ts` ; gel via `scratchpad/2026-09-11-CLOTURE/figer-demande.ts`, mesure via `analyse-lot-F.ts`. Étendre cet outillage, sans ajouter d'interrupteur QA au handler de production.

### 2.2 Trois références réellement conformes avant injection

Figer une horloge et une demande donnant deux journées complètes et trois créneaux par journée. Vérifier la fenêtre réellement acceptée avant les assertions ; éviter un cutoff de courses ou un moment passé qui change discrètement la grille.

| Référence | Propriétés obligatoires | Portions attendues sur la grille commune |
|---|---|---:|
| N=1 | Objectif applicable, apport fixe explicite, un repas léger | 6 |
| N=2 | Besoins/appétits différents, préparation partagée et plat dédié, contrainte individuelle | 12 |
| N=4 | Quatre profils distincts, lot partagé sur plusieurs créneaux, plat dédié, contrainte individuelle | 24 |

Les contrats viennent du moteur. Choisir des recettes réalisables pour ces contrats ; s'ils ne permettent pas un lot commun pour tous, utiliser un plat dédié. Ne pas modifier les profils ou les seuils après coup pour faire passer une recette échouée.

Chaque référence doit passer **sans réparation** : présence, calories, grammes, densité, références, production des lots, achats et sécurité. Vérifier les protéines lorsqu'un plancher s'applique. Après cette validation, figer la référence ; les assertions attendues ne se déduisent jamais du nombre de plats retournés.

Ajouter une variante protégée/mineur appliquant les règles existantes et une variante où les personnes présentes changent selon le créneau. Leur dénominateur est la somme des cases personne-date-créneau réellement demandées, pas la taille du foyer multipliée aveuglément par les créneaux.

### 2.3 Terminer les cas manquants jusqu'à la relecture

Les fixtures et le transport exécutent le vrai handler, la finalisation, les validations, la sérialisation, puis les lecteurs API/UI. Les mutations de défaut sont faites dans le banc, pas par un mode spécial de production.

| Cas | Injection / réponse contrôlée | Preuve attendue |
|---|---|---|
| Validation indisponible | Forcer une exception de validation finale via le harnais local, jamais un paramètre public | Refus technique explicite ; aucune activation ni publication de la candidate ; ancien plan intact. |
| Isolation d'un lot, N=4 | Une seule personne exige une variante ; patch créant une préparation dédiée | Candidate adoptée, autres consommateurs préservés ; références, `cook_on`, sessions, quantités et achats cohérents. |
| Portion manquante, N=4 | Retirer une seule portion/unité obligatoire d'une référence valide, puis fournir sa réparation | Bonne personne/date/créneau retrouvés ; unité créée **et adoptée**, sérialisée et relue ; aucune perte chez les autres. |
| Complément, N=4 | Cas réellement faisable où une personne conserve une part commune et reçoit un complément | Mesurer commun + complément pour cette personne ; pas de double cible, pas de double consommation du lot, autres parts intactes. |
| Régression d'un autre consommateur | Patch améliorant A mais dégradant une portion auparavant conforme de B | Rejet entier, meilleure candidate restaurée avec recettes, sessions et source canonique. |
| Écart résiduel visible | Candidate sûre et complète gardant un écart autorisé pour une seule personne | Livraison selon politique actuelle ; nature, personne et créneau correctement portés dans la donnée et visibles au lecteur concerné. Les personnes protégées ne reçoivent pas de chiffres interdits. |
| Session dangereuse puis réparée | Texte incompatible uniquement dans le déroulé ; patch de session seule | Texte corrigé, recettes saines inchangées ; variante persistante refusée après épuisement du budget. |
| Patch mal formé puis valide | Bonne opération accompagnée d'une opération invalide ; deuxième réponse valide | Première rejetée entièrement ; seconde évaluée sur la meilleure version ; plafond de deux appels commun au foyer. |
| Autorisation | Appel du maître puis appel d'un secondaire | Maître autorisé ; secondaire refusé avant appel fournisseur et écriture. |

Un test qui prouve seulement « l'unité a été créée dans une candidate ensuite rejetée » ne couvre pas l'adoption. Un drapeau `complementsShared` présent dans le source ne prouve pas l'absence de double comptage : additionner les quantités et énergies finales avec les lecteurs de production.

Si les informations d'écart résiduel sont actuellement agrégées seulement par nature, conserver leur identité depuis `RepairDefect` jusqu'à la donnée publique autorisée et au rendu. Modifier les types et lecteurs API/UI nécessaires, sans introduire une seconde représentation incompatible des personnes. Ajouter un test de rendu pour deux personnes avec un seul écart.

### 2.4 Exigence avant le fournisseur réel

Les références nominales doivent produire 6/6, 12/12 et 24/24 conformes sur les critères applicables, sans rattrapage. Les défauts isolés doivent produire les adoptions ou refus attendus dans le tableau. Corriger dans ce lot toute erreur de code effectivement reproduite par ces cas ; ne pas remplacer la fixture nominale par une candidate défaillante pour déclarer le refus protecteur suffisant.

Conserver aussi les anciens contre-exemples `h2n2`/`h4n4` et rejouer la construction de leurs messages après correction : les identités doivent être visibles et les consignes contradictoires absentes. Ne pas prétendre que relire leurs anciennes réponses valide le nouveau prompt.

## Lot 3 — Mesurer le modèle avec les bonnes entrées et clôturer honnêtement

### 3.1 Campagne limitée et séquentielle

Après les lots déterministes verts, lancer un premier jet réel pour chacune des trois références si aucun premier jet réel existant ne correspond exactement à sa demande figée. Passer par le vrai handler ; conserver chaque premier jet avant toute transformation et les sorties de finalisation.

Prévoir au plus **trois générations initiales réelles et six appels réels de réparation pour cette nouvelle campagne**, les réparations des runs initiaux et des parcours hybrides se partageant ce même budget. Compter à part les éventuelles complétions auxiliaires du référentiel : elles ne sont ni gratuites ni des réparations du plan. Ne pas multiplier les essais jusqu'à obtenir une sortie favorable.

Exécuter séquentiellement, avec la configuration modèle/fast de production. Mesurer la durée du premier run avant de dimensionner la suite ; aucune modification de timeout ou de moteur pour rendre la campagne artificiellement verte. Un timeout reste un échec observé du parcours, sans ouvrir ici le chantier 546.

Si le premier jet échoue, conserver l'échec et localiser le premier stade de divergence : message transmis, réponse brute, parsing, mise à l'échelle, arrondi, graphe partagé, validation ou rendu. Ne pas conclure « le modèle ne sait pas » tant qu'une information manquante ou une transformation incorrecte n'a pas été exclue.

### 3.2 Mesurer une vraie réparation utile à plusieurs

Si les générations nominales ne sollicitent pas de réparation, utiliser les références validées du lot 2 comme premiers jets contrôlés et introduire **un défaut connu**, puis laisser le vrai fournisseur écrire le patch. Priorité aux foyers N=2 et N=4 ; le budget de réparation est commun avec §3.1, pas renouvelé pour cette phase.

Utiliser le mode existant `--reparation-reelle=<n>` (0 à 2) du banc pour les parcours hybrides. Le premier jet y est contrôlé et le patch réel : les étiqueter explicitement « hybrides ». Vérifier dans la trace qu'une reprise du transport contrôlé après le plafond réel n'est jamais présentée comme une deuxième réussite du modèle.

Pour N=2, choisir une correction de session ou d'une unité dédiée. Pour N=4, choisir une correction locale dont les effets sur un lot partagé sont connus, avec contrats attribués à chaque consommateur. Mesurer la candidate de réparation avant/après finalisation et son impact sur chaque personne, puis le plan effectivement retenu et relu.

Une réponse au bon format n'est qu'une étape. La preuve recherchée est un patch réel appliqué, adopté après mesure, corrigeant le défaut prévu sans perdre de portion ni dégrader les autres. Si le budget est consommé sans cette preuve, publier « non validé » et l'analyse des essais ; ne pas déclarer le lot fermé parce que les appels ont eu lieu.

### 3.3 Vérifications de code et artefacts

Tests ciblés : `plan_defect_pass_test.ts`, `plan_repair_context_test.ts`, `plan_repair_prompt_test.ts` et tests de câblage, tests des producteurs de dimensionnement modifiés, tests de patch et surfaces, puis tests API/UI concernés. Vérifier les noms présents dans le dépôt avant de composer les commandes. Exécuter le `deno check` du handler et les contrôles du dépôt via `scripts/agent-gate.sh`. Ne pas modifier les listes d'échecs tolérés pour accepter une régression de ce chantier ; ne pas relancer deux fois une suite déjà couverte sans nouvelle modification.

Archiver pour chaque scénario :

- demande et fenêtre réellement acceptée, personnes et présences, corps/objectifs/préférences/protections, référentiel et horloge ;
- empreintes/diff du code testé, messages système et utilisateur effectivement transmis ;
- premier jet brut, défaut injecté éventuel, version/adresses du patch, réponses brutes et origine réelle ou contrôlée de chaque appel ;
- état après parsing, après dimensionnement/arrondi, après garde, meilleure candidate retenue ;
- adoptions/rejets avec causes et personnes concernées, écritures effectuées ou bloquées, données relues et vérification UI ;
- durées et appels facturés, y compris auxiliaires, avec chaque tentative échouée conservée.

Geler les demandes avec `figer-demande.ts`, puis exécuter `analyse-lot-F.ts` **sur chaque fichier séparément**. Lier le tableau détaillé par personne-date-créneau au rapport : cible et énergie, bornes et grammes, couloir et densité, état des ingrédients, protéines applicables, sécurité et couverture. Ne pas recopier des avertissements historiques de l'instrument comme preuves d'une garde absente ; journal indisponible = information indisponible.

### 3.4 Rapport final et critères de clôture

Écrire `docs/keel/RAPPORT-CIBLES-ET-VALIDATION-FOYER-2026-09-13.md`. Pour chaque exigence, donner état, test/run précis et lien de preuve. Mettre à jour brièvement `docs/SOCLE.md` uniquement pour le parcours effectivement implémenté.

La clôture exige :

1. Aucun objectif individuel anonyme dans les messages testés, notamment quand plusieurs personnes ont des objectifs différents le même jour.
2. Aucun ordre de plan complet dans une réparation, y compris quand un complément ou une demande de densité alimente les défauts d'amont ; périmètre et instructions cohérents.
3. Les références déterministes N=1/N=2/N=4 conformes avant injection, et tous les cas manquants éprouvés jusqu'à leur effet sur la version livrée.
4. Les résultats du modèle mesurés séparément du bon fonctionnement du code ; une réparation réelle utile à plusieurs démontrée sur les scénarios prévus, ou explicitement laissée non validée.
5. Un succès HTTP, une candidate rejetée correctement et un plan pleinement conforme publiés sous trois états différents. Les écarts résiduels autorisés restent visibles pour la bonne personne.

Ne pas annoncer « terminé » si l'un de ces critères reste sans preuve. Le rapport doit permettre de voir immédiatement ce qui fonctionne, ce qui échoue et à quel stade, sans nécessiter une nouvelle question pour découvrir les cas omis.
