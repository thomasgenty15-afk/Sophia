# Fiabiliser les portions et préserver les recettes

Plan d'implémentation à transmettre à l'agent. État de départ vérifié le 11 septembre 2026. **Ce document décrit le travail à faire ; il ne déclare aucun lot implémenté ou testé.**

Objectif : le modèle reçoit les bons budgets, propose une recette cohérente, puis le moteur calcule des portions dont les calories, les grammes, les références alimentaires et les quantités affichées concordent. L'ajustement des proportions reste limité par la structure culinaire de la recette. Un résultat incomplet ne reçoit pas un verdict conforme.

Référence : [revue et preuves](REVUE-CAMPAGNE-ET-SAVEUR-2026-09-11.md), dossier `scratchpad/2026-09-11-REVUE-CAMPAGNE/`. Ce plan complète le chantier précédent ; ne pas reconstruire les modules déjà fonctionnels.

## Décisions de périmètre

1. Un seul moteur de génération, `generate-household-meal-v1`, pour une ou plusieurs personnes. **Seul le compte maître génère.**
2. Conserver les équations et protections énergétiques existantes. Ce chantier corrige leur transmission, leur application et leur contrôle ; il ne modifie pas les barèmes médicaux ou les besoins estimés.
3. Aucun forfait automatique pain/fromage/dessert hors plan. Ces aliments restent autorisés comme ingrédients. Conserver les apports fixes explicitement déclarés.
4. Conserver l'appétit, le repas léger, les présences et les bornes personnelles. Le statut « journée partielle » ne signifie pas « manger toute la journée sur les créneaux restants ».
5. Garder les réglages de modèle/fast actuellement configurés. Pas de nouveau chantier 546 dans ce plan ; mesurer néanmoins les délais et les échecs.
6. Préserver les recettes sensibles à leurs proportions. Les accompagnements explicitement séparables sont les premiers leviers d'ajustement. Une convention numérique ne constitue pas une garantie de goût.
7. Garder le budget commun de **deux réparations modèle au maximum** et l'échéance commune. Les réparations de densité, protéines, références et sécurité ne reçoivent pas chacune leur propre budget.
8. Modifier les lecteurs UI nécessaires, sans refonte visuelle. Les anciens plans restent lisibles ; aucune réécriture massive de leurs quantités.
9. Le dépôt est partagé et comporte des changements en cours : relever les versions, inspecter les modifications pertinentes et ne pas écraser le travail voisin. Respecter `AGENTS.md` pour les migrations et déploiements : préparer les fichiers, laisser les commandes réservées à l'humain. Le présent plan ne demande pas de déployer.

## Lot 0 — Figer les preuves et réparer l'instrument de mesure

**But :** pouvoir distinguer un moteur amélioré d'un rapport simplement devenu plus optimiste.

Fichiers : `scripts/2026-09-11-mesure-grille.ts`, `scripts/2026-09-11-campagne-premier-jet.ts`, `scratchpad/2026-09-11-REVUE-CAMPAGNE/revue.ts`, `docs/keel/mesure.md`.

- Copier les deux réponses brutes et leurs contextes dans des fixtures immuables ; préserver les preuves existantes. Ajouter les données de profil/habitudes nécessaires et l'heure/fuseau de référence. Ne pas déduire les préférences d'un prénom ou d'un titre de recette.
- Mesurer la portion finale par les fonctions du produit qui lisent ses items et les prélèvements réels dans les préparations. **La journée est la somme de ces mêmes portions.** `planEnergy` avec des parts conventionnelles ne remplace pas cette mesure.
- Utiliser le même index de références que le chemin testé ; transmettre correctement les arguments de `indexForReading`. Séparer explicitement index historique, index de génération et index de relecture si leurs règles diffèrent.
- Remplacer l'extraction des couloirs par regex sur le prompt par une trace structurée issue du contrat transmis au prompt, avec clé personne/date/créneau.
- Publier les dénominateurs séparément : cases attendues, plats présents, portions calculées, portions mesurables, portions conformes. Une portion absente ne sort pas du dénominateur attendu.
- Séparer référence vérifiée, estimation de groupe, valeur en attente de validation et ingrédient non mesurable. Ne pas appeler « 100 % vérifié » le simple taux de présence d'un champ `ref`.

**Preuve de départ à reproduire avant modification :** 14 cases, 12 portions calculées, 11 énergies finales mesurables ; les deux dimanches valent environ 2 455,69 et 2 916,14 kcal. Le contrefactuel petit-suisse vaut 546 kcal à quantités constantes. Les alertes d'achats par pluriel sont reproduites nominativement. Ces nombres attestent l'ancien cas, ce ne sont pas les cibles à imposer au moteur corrigé.

## Lot A — Une identité alimentaire jusqu'au dernier lecteur

**Défaut visé :** `ref` est accepté à l'entrée puis perdu au moment de mesurer, convertir, ajuster ou relire une portion.

Fichiers : `food_composition.ts`, `composition_contract.ts`, `meal_generation.ts::refForIngredient`, `preparation_mass.ts`, `plan_proportion_units.ts`, `plan_energy_read.ts`, `mouth_energy.ts`, `composition_fill*.ts` et leurs appelants. Tous ces modules sont sous `supabase/functions/_shared/keel/`.

Travail :

1. Déplacer la résolution d'une ligne dans le module commun de composition, sans dépendance au parseur de génération. Faire évoluer `CompositionInput` et ses adaptateurs pour porter l'identifiant et l'état de refus. Conserver un seul résolveur de cette décision.
2. Pour un nouveau plan : `ref` explicite → recherche exacte de la référence autorisée/vérifiée pour le run. Une référence inexistante, refusée ou non composable produit une erreur nommée ; **aucun repli silencieux vers le terme, une moyenne de groupe ou une estimation modèle**.
3. Pour un plan ancien sans identifiant : conserver le lecteur historique, avec langue et provenance explicites. Ce repli de compatibilité ne doit pas permettre au modèle d'omettre `ref` sur un nouveau plan. Prévoir les exceptions explicites des lignes non pesées, telles que les condiments, sans les compter comme des références énergétiques vérifiées.
4. Transmettre l'identité à chaque transformation : parseur, conversion cru/cuit et unités, préparation, part standard, ajustement, portion finale, sérialisation, relecture énergétique. Pour une ligne fraîche d'une boîte, conserver un identifiant stable de ligne/référence ; ne plus retrouver son aliment uniquement par son libellé. Pour une préparation, conserver son identifiant et son prélèvement effectif.
5. Ne pas appeler `composition_fill` pour un aliment dont l'identifiant valide existe déjà. Le catalogue doit fournir la forme, les valeurs utiles et les conversions disponibles. Un aliment hors catalogue ne devient pas composable par une estimation du modèle.
6. Détecter les contradictions entre identités structurées ou formes connues : une ligne refusée ne devient pas valide parce que sa référence a disparu à la sérialisation. Ne pas imposer une égalité textuelle entre un libellé français et un libellé anglais.

**Tests de sortie :**

- Les deux `pita_wholemeal` deviennent mesurables ; `1 unit` utilise les 60 g de la fixture vérifiée.
- Le petit-suisse emploie la même référence à la génération, à l'ajustement et à la relecture. À quantités historiques constantes, retrouver le contrefactuel ; après nouveau dimensionnement, mesurer la nouvelle portion contre sa vraie cible, pas contre 546.
- Identifiant valide + libellé inconnu/pluriel/accentué : même référence. Identifiant invalide + libellé connu : refus explicite, sans secours par alias.
- Cas raisin frais/sec, prune fraîche/séchée, aliment cru/cuit et ancienne ligne sans `ref`.
- Un aller-retour parseur → transformation → payload → lecteurs préserve les identités et les valeurs, y compris une préparation partagée et deux lignes portant le même nom.

## Lot B — Un contrat de budget par personne, date et créneau

**Défaut visé :** le prompt et le dimensionnement attribuent des calories différentes à la même case ; le dîner du vendredi impose ensuite son couloir aux autres jours.

Fichiers : `portion_sizing.ts::{requiredDensityFor,plateBoundsFor,densityCorridorFor}`, `slotPlanTargets` et ses appelants, `mouth_anchor.ts`, `household_prompt_v34.ts`, `generate-household-meal-v1/index.ts`.

Créer un contrat partagé, nommé par exemple `SlotNutritionContract` — **nom proposé, pas module existant** — construit avant le prompt puis consommé par le dimensionnement et les contrôles. Il porte au minimum :

```text
clé : memberId + date locale + slot
rythme complet de la journée / créneaux couverts / créneaux verrouillés
cible du jour / budget couvert / apports fixes déjà pris en compte
cible du repas / cible à composer
grammes min, préférés, max et source des bornes
densité min, préférée, max / incompatibilité éventuelle et motif
statut de calcul et raisons d'abstention
```

Règles :

- Distinguer le rythme alimentaire complet de la fenêtre demandée. Un repas déjà passé ou mangé ailleurs ne transfère pas implicitement son énergie au dîner généré.
- Appeler les fonctions existantes sur ces entrées une fois par case ; ne pas reconstruire la cible depuis le milieu de la bande affichée.
- Conserver le traitement existant des apports fixes et éviter toute double soustraction. Une case couverte par ces apports peut avoir zéro énergie à composer sans être une case oubliée.
- Réutiliser `densityCorridorFor` et ses conventions d'arrondi. La préférence part de la masse préférée, puis est projetée dans le couloir réalisable. Ne pas substituer `Dmin × 1,10` à cette préférence.
- Le prompt reçoit les contrats par case, avec leurs unités explicites, notamment kcal/100 g **prêts à manger**. Ne pas fusionner tous les dîners par leur valeur maximale. Une consigne commune n'est possible que si les contrats sont effectivement compatibles et les cases concernées restent identifiables.
- Pour un plat partagé, contrôler tous ses consommateurs. Une intersection vide n'est pas réparée en élargissant une borne : utiliser les accompagnements autorisés ou les mécanismes existants de séparation/recomposition.
- Toute redistribution autorisée reste dans la même personne/journée et les créneaux modifiables acceptés ; elle met à jour le contrat consommé partout. Une journée partielle ne sert pas à récupérer le budget des repas passés.

**Tests de sortie :**

- Sur les fixtures de la campagne et leur rythme identique, vendredi soir garde sa part de dîner : environ 859 kcal pour PERTE, 1 019 pour GAIN. Vérifier ces résultats avec les fonctions de production et les profils figés.
- Ajouter/retirer le vendredi partiel ne modifie aucun contrat samedi/dimanche inchangé.
- Horaire du matin/après-midi, fuseau, journée complète, un vrai rythme à un seul repas, repas extérieur, case fixe, repas léger, petits/grands appétits et deux personnes aux objectifs différents.
- Le contrat capturé avant le modèle est égal à celui consommé par le dimensionnement et le verdict. Conservation des budgets avant arrondi ; pas de journée complète facturée à un seul repas restant.

## Lot C — Une quantité finale commune au calcul et à la cuisine

**Défaut visé :** les données structurées changent, mais le texte de recette reste ancien ou n'est actualisé que sur certaines lignes.

Fichiers : `meal_generation.ts` et sa sérialisation, `portion_sizing.ts::{applySizing,applySizingForEaters}`, `plan_proportion_units.ts::applyAdjustment`, transformations ultérieures des préparations/courses dans le handler ; côté UI `frontend/src/keel/api/mealGeneration.ts`, `CookingSessions.tsx`, `ShoppingListPanel.tsx`, lecteurs des recettes et fonctions i18n de formatage.

- Les quantités structurées finales font autorité : nombre, unité, état cru/cuit/prêt, identité alimentaire et périmètre (lot cuisiné ou portion).
- L'UI transporte ces champs et en dérive l'affichage ; elle ne choisit plus un ancien `quantity` face à une quantité structurée complète. Si le champ de compatibilité `quantity` reste persisté, le régénérer depuis la même version finale.
- Centraliser cette finalisation **après la dernière mutation**, y compris croissance/réduction d'une préparation, reconstruction des courses et arrondis. Rejouer ensuite les mesures sur le payload qui sera effectivement enregistré.
- Séparer clairement les grammes crus à cuisiner des grammes prêts à servir. Une préparation de plusieurs portions affiche les quantités du lot, une assiette celles de la personne.
- Utiliser le formateur localisé et des conversions connues. Ne pas convertir ml, cuillères et grammes avec une densité inventée. Une simplification culinaire de quantité modifie la donnée structurée avant la dernière mesure ; elle ne peut être un changement numérique caché dans l'affichage.
- Conserver le texte historique lorsqu'une ancienne ligne ne possède pas les données nécessaires, avec un état de lecture explicite. Pas de réécriture en base des anciens plans.
- La méthode ne répète pas de quantités libres susceptibles de devenir fausses. Si elle en porte, utiliser des références structurées aux ingrédients ou garder la recette non ajustable jusqu'à une réécriture atomique de sa méthode. La regex actuelle ne couvre pas les fractions, nombres en lettres et rapports de cuisson : elle ne constitue pas une preuve suffisante.

**Tests de sortie :**

- Fixture poulet : l'affichage correspond à la quantité finale structurée (458,66 g avant éventuel arrondi décidé), jamais à l'ancien 360 g.
- Fixture lentilles : 60 g de lentilles ne restent pas accompagnés de 2 cuillères d'huile lorsque le calcul en utilise 0,770. Vérifier le nombre, l'unité et le rapport affiché après toutes les transformations.
- Grammes, ml, cuillères, unité comptée, virgule décimale FR et rendu EN, lots partagés, portion individuelle, ancienne ligne textuelle.
- Test de rendu réel de la recette et des courses depuis le payload final, puis après rechargement du plan. Une recherche de chaînes dans le code n'est pas suffisante.

## Lot D — Ajuster des composants culinaires sans déformer leurs recettes

**Défaut visé :** les bornes par groupe alimentaire autorisent des changements de proportions sans savoir ce qui tient une sauce, une farce ou une pâte.

Fichiers : `proportion_adjust.ts`, `plan_proportion_units.ts`, contrat et prompt de recette standard dans `meal_generation.ts`/`composition_contract.ts`, gestion des préparations partagées et des réparations dans le handler.

### Politique retenue pour cette première version

- **Mise à l'échelle globale :** autorisée avec les protections existantes ; les rapports d'ingrédients sont conservés.
- **Accompagnement explicitement séparable :** quantité ajustable dans les bornes existantes et contraintes de chaque consommateur. Exemple : riz nature à côté d'un poulet en sauce.
- **Sauce, assaisonnement, farce, appareil/pâte, liant et préparation à hydratation liée :** rapports internes conservés. Par défaut, garder aussi leur proportion par rapport au composant qu'ils accompagnent ; une sauce ne devient pas le levier permettant de doubler les calories.
- **Huile, tahini, fromage ou fruits à coque employés comme garniture/assaisonnement :** liés au composant assaisonné, et non promus en accompagnement libre pour exploiter leur densité. L'aliment reste autorisé dans la recette.
- **Rôle ou lien absent/ambigu :** composant non ajustable en proportions ; conserver la possibilité de mise à l'échelle globale et de recomposition par le modèle.

Cette politique est volontairement plus restrictive que le plafond générique actuel de 200 %. Elle peut augmenter les cas nécessitant une recomposition ; mesurer ce coût. Ne pas assouplir les protections uniquement pour conserver le nombre de fermetures de l'ancien banc.

### Contrat et exécution

1. Ajouter une structure compacte de composants culinaires, référencée par identifiants stables de lignes : rôle, lignes appartenant au composant, éventuel composant auquel il est lié, permission d'ajustement. Une ligne appartient exactement à un composant ; les références sont valides, les liens sans cycle. Ne pas découper les phrases de recette avec des mots-clés pour deviner ces liens.
2. Le modèle décrit la structure de cuisson ; le moteur valide le contrat et applique la politique restrictive. Une étiquette du modèle ne peut pas élargir les protections du référentiel. Les mélanges sans structure fiable restent liés, particulièrement dans les réponses archivées antérieures au contrat.
3. Faire travailler l'ajusteur sur ces composants ou groupes liés. Leur mise à l'échelle commune conserve les rapports internes ; leurs facteurs autorisés sont l'intersection des bornes de leurs ingrédients. Conserver un état initial accepté immuable pour les ratios : les passes successives ne cumulent pas les autorisations.
4. Ne créer, supprimer ou substituer aucun ingrédient dans l'ajusteur déterministe. Tout changement de recette ou de méthode appartient à la recomposition modèle.
5. Optimiser dans cet ordre : contraintes dures, réduction des écarts mesurés, puis modification minimale de la recette initiale et proximité de la masse préférée. Ne pas déplacer une recette déjà conforme seulement pour exploiter le minimum de densité.
6. Remesurer tous les consommateurs d'une préparation touchée. Ne pas détériorer une portion précédemment conforme en calories/masse/protéines applicables pour en corriger une autre. Conserver les limites de recherche et les arrêts nommés.
7. Invalider les anciennes déclarations `density_check` des recettes affectées. Après modification, rejouer finalisation des quantités, courses, mesures, restrictions et validation finale. Une étape antérieure « verte » ne dispense pas de cette dernière passe.
8. Si aucune solution n'est trouvée dans les limites culinaires, fournir au modèle les écarts numériques et les composants verrouillés, dans le budget existant. Ne pas appeler cette issue « mathématiquement impossible ».

**Tests de sortie :**

- Même multiplicateur global : rapports identiques avant/après, à l'arrondi documenté près.
- Poulet en sauce + riz : le riz peut varier, les rapports internes de la sauce et son lien au poulet restent constants.
- Vinaigrette, sauce tahini, farce avec liant, pâte et cuisson à liquide lié : aucun ingrédient isolé ne sert de variable libre.
- Faux rôle « accompagnement » sur un assaisonnement dense connu : pas d'ouverture des bornes. Contrat absent, lignes oubliées/doublonnées, liens invalides : traitement conservateur explicite.
- Préparation partagée : aucun consommateur dégradé ; deux ajustements ne dépassent pas les ratios de la recette initiale.
- Un cas volontairement irréalisable avec ces contraintes reste non conforme ou part en recomposition. Le test échoue si le moteur le « résout » en modifiant un composant verrouillé.
- Rejouer les cinq corrections de densité archivées et décrire lesquelles restent autorisées. Il n'est pas exigé que les cinq ferment sous la nouvelle politique.

## Lot E — Contrôler le plan réellement livrable

**Défauts visés :** présence d'un titre confondue avec portion disponible ; courses contrôlées par libellés ; contrôle final incomplet rendu comme un succès.

Fichiers : `final_plan_gate.ts`, `mouth_energy.ts`, `meal_envelope.ts`, `protein_reference_weight.ts`, `plan_repair_loop.ts`, `plan_budget.ts`, `generate-household-meal-v1/index.ts`, sérialisation et restitution UI des écarts.

### Courses

- Agréger les besoins par identité alimentaire et unités compatibles, depuis les recettes finales et les vrais lots à cuisiner. Employer le poids cru/achetable approprié, pas la masse cuite de la boîte.
- Le libellé localisé sert à afficher ; il ne décide plus si un ingrédient est acheté. Transporter l'identité jusque dans les lignes de courses ; utiliser les alias explicites pour la compatibilité historique.
- Respecter le garde-manger déclaré, les quantités connues, conditionnements, dates et stocks réutilisés. Ne pas inventer une quantité de stock si seule sa présence est déclarée : rendre ce cas distinct de « quantité couverte mesurée ».
- Vérifier présence **et quantité suffisante** ; un paquet acheté peut excéder le besoin. Une conversion ou un conditionnement inconnu produit un contrôle incomplet, pas un manque quantifié inventé.

### Portions et nutrition

- Produire un tableau final par personne/date/créneau depuis le payload final : portion attendue, portion présente, ingrédients résolus, kcal, grammes, densité, protéines applicables, écarts et motifs. Une portion partagée doit être attribuable à chacun de ses consommateurs.
- Brancher ces résultats dans la validation finale au lieu des actuels `energy: null` et `boxContract: null` lorsque le contrat les exige. Les seuls agrégats par personne actuellement disponibles dans `GateContext.energy` ne suffisent pas : conserver les dates/créneaux pour éviter la compensation entre jours ou personnes.
- Utiliser les planchers protéiques **existants** et leurs conditions d'application, poids de référence et protections. Ne pas créer de nouveau barème. Pour une fenêtre partielle, allouer le besoin couvert explicitement sans mettre toute la journée protéique sur le dîner ; respecter les éventuels minimums par repas déjà applicables et compter les apports fixes une seule fois.
- Un groupe d'ingrédients contenant des protéines ne prouve pas que le plancher en grammes est atteint. Alimenter le même défaut mesuré dans la génération/réparation et le verdict final.
- Critères énergétiques existants : **±10 % par repas, ±5 % par journée couverte**, avec priorité aux gardes plus strictes. Tous les grammages et couloirs applicables doivent tenir simultanément. Ne pas élargir ces tolérances pour faire passer le banc.
- Les cas où les portes interdisent ou rendent inapplicable un calcul chiffré conservent leur comportement protégé, avec raison explicite. Ne pas confondre cette abstention légitime avec une donnée perdue sur un adulte dont le calcul est autorisé.

### Livraison et réparations

- Distinguer explicitement `conforme`, `livrable avec écarts` et `non livrable`, avec la liste des contrôles non évalués. Réutiliser les structures existantes si elles portent réellement cette distinction ; sinon étendre le contrat d'API et sa lecture UI.
- Ingrédient interdit, référence refusée nécessaire au calcul, portion requise absente ou quantités contradictoires : pas de livraison annoncée complète/conforme. Réparer dans le budget ou rendre un échec explicite ; préserver l'ancien plan valide tant que le remplacement n'est pas livrable.
- Une version utilisable avec un écart nutritionnel résiduel peut suivre la politique déjà acceptée de livraison avec écarts, **sans** masquer les motifs ni violer une borne physique ou une protection dure. Elle ne passe pas le critère de fin du banc.
- Ne pas activer globalement `FINAL_GATE_POLICY_LOT_3` pour obtenir un label plus strict : corriger les faux positifs puis armer les causes documentées. Vérifier que la branche de refus empêche réellement l'écriture/activation ; ajouter un message ou compter `blocking` ne suffit pas.
- Réutiliser la boucle/budget communs et `judgeCandidate`. Comparer chaque candidate à tous ses consommateurs et à la dernière version utilisable. Une amélioration du nombre global de défauts ne doit pas masquer une nouvelle portion non conforme ou une régression de sécurité.
- Compter séparément les appels de génération, les réparations de plan, `composition_fill` et les éventuelles retransmissions fournisseur. Aucun appel imbriqué ne contourne le budget ou l'échéance du run.

**Tests de sortie :** les huit faux manques par pluriel disparaissent ; retirer réellement un ingrédient ou sous-acheter sa quantité déclenche le bon défaut. Calories conformes mais protéines insuffisantes : non conforme si le plancher s'applique. Une case sans portion ne passe pas parce que son titre existe. Une candidate apportant un allergène est rejetée, même si sa densité est meilleure. Après deux réparations insuffisantes : état explicite, pas troisième appel caché ni écrasement d'un plan valide par une sortie non livrable.

## Lot F — Prouver les branchements et mesurer le résultat

Ordre d'exécution : **0 → A → B → C → D → E → F**. Chaque lot fournit ses tests et résultats avant de passer au suivant. Les tests de branchement transversaux du lot F restent nécessaires même si chaque module a sa suite verte.

1. **Hors ligne :** rejouer les deux réponses archivées avec contexte/référentiel figés et les fonctions de production. Capturer avant/après à chaque étape. Ne pas recoder les équations dans le script du banc.
2. **Intégration sans dépense modèle :** utiliser un adaptateur fournisseur contrôlé au niveau transport sur une pile de test, ou extraire le service de traitement derrière le vrai handler pour injecter ce transport. Aller jusqu'à la sérialisation, l'écriture de fixtures et leur relecture par les lecteurs API/UI. Aucun interrupteur de contournement exposé aux requêtes de production. Les tests existants d'admission seuls ne prouvent pas ce parcours.
3. **UI :** ouvrir un plan corrigé, ses recettes de cuisine, ses portions et ses courses ; recharger. Tester une personne et un foyer de deux. Vérifier les quantités structurées/rendues, le cru/cuit et les états d'écart. Un compte secondaire reste refusé à la génération.
4. **Contrôles du dépôt :** tests Deno des modules modifiés et de leurs consommateurs, vérification de types du handler, tests UI pertinents puis build frontend. Utiliser les commandes du dépôt ; documenter séparément une erreur préexistante. Un test ignoré faute de pile ne vaut pas une preuve d'intégration.
5. **Petite campagne réelle après réussite des preuves précédentes :** six tirs séquentiels au maximum pour cette validation initiale, avec contextes horodatés et nombre de cases annoncé à l'avance. Ne pas relancer en silence les échecs.

| Tir | Cas ciblé |
|---|---|
| 1 | PERTE, une personne, fenêtre commençant l'après-midi, puis deux jours complets. |
| 2 | GAIN, même fenêtre et rythme, petit-suisse/pita possibles dans le catalogue. |
| 3 | PERTE, grand appétit, journées complètes. |
| 4 | GAIN, petit appétit, journées complètes. |
| 5 | Repas léger et apport fixe, sans réintroduire les extras. |
| 6 | Deux personnes aux besoins différents, préparation partagée, contrainte alimentaire réelle de fixture. |

Pour comparer la durée à un avant, utiliser le même nombre de cases, les mêmes horaires/fenêtres, mêmes réglages fournisseur et même environnement. Sans témoin équivalent, publier la durée absolue et la charge ; ne pas attribuer un pourcentage de gain au chantier. Séparer limite locale configurée et limite réellement vérifiée de la cible de déploiement.

Le script de campagne actuel comporte des suppressions larges par utilisateur de fixture : **ne pas le relancer tel quel**. Employer des comptes/runs isolés, des identifiants de run, et un harness sans suppression nécessaire. Toute éventuelle purge suit l'exception QA de `AGENTS.md` et ne concerne que les données du run explicitement autorisé.

### Tableau demandé pour chaque run

```text
versions : code, modèle/réglages, catalogue, contexte, contrat de calcul
étapes : réponse brute → ajustement → réparation 1 → réparation 2 → payload relu
cases : attendues / plats / portions / mesurables / conformes
nutrition : cible et livré par case + somme par journée couverte
références : résolues par ID / historiques / refusées / non mesurables
recettes : composants touchés, ratios avant/après, liens préservés, amplitude
quantités : écart structuré/affiché, cru/cuit, recettes/courses
contrôles : protéines applicables, restrictions, cases manquantes, achats
coût : appels réels par nature, latences par appel, durée totale, échéance
livraison : conforme / avec écarts / non livrable, motifs exacts
```

La conformité au premier jet, après ajustement et après réparation se publie séparément. Une série de six tirs ne constitue pas une estimation fiable du taux général de réussite.

### Vérification culinaire

Sélectionner dans les résultats au moins trois recettes représentatives : sauce avec accompagnement, assemblage au tahini/fromage et préparation à liant ou liquide lié. Fournir les fiches avant/après **ramenées à une même taille de portion** pour comparer les proportions, puis les fiches réellement proposées à la personne.

Vérifier d'abord leur faisabilité (méthode, quantités, hydratation connue, équipement, assemblage). Une dégustation comparative par l'humain peut ensuite évaluer goût, texture et équilibre de sauce/assaisonnement. L'agent fournit les fiches et la grille ; il ne prétend ni avoir cuisiné ni avoir prouvé la saveur avec un score modèle. Les tests automatiques peuvent être terminés alors que cette validation gustative reste explicitement à faire.

## Critère de fin et compte rendu de l'agent

Le lot technique est terminé lorsque les nouveaux plans ciblés traversent le même contrat de référence, budget et quantité jusqu'à la relecture ; que tous les consommateurs requis ont une portion mesurable ; que les contraintes applicables sont contrôlées ; que l'UI affiche les quantités réellement calculées ; et que les essais montrent les défauts restants sans les transformer en conformité.

Le rapport final énumère : changements et fichiers, preuves par lot, résultats par run, écarts encore ouverts et commandes réservées à l'humain s'il en reste. Il met à jour `docs/keel/mesure.md`, le rapport de campagne par un correctif clairement daté et `docs/SOCLE.md` avec **uniquement le chemin réellement branché**, sous une forme courte :

`portes → références → budgets par case → bornes/couloirs → recette structurée → mesure → ajustement culinaire autorisé → recours modèle borné → quantités finales → contrôles → stockage et UI`.

Ne pas annoncer « aucune perte de saveur », « tous les ingrédients vérifiés » ou « premier jet parfait » à partir de compteurs qui mesurent autre chose. Une étape laissée non branchée, un test sauté ou une dégustation non réalisée reste nommé comme tel.
