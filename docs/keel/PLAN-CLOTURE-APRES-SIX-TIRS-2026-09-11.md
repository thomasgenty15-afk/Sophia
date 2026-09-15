# Clôture après la campagne des six tirs

**Nouveau plan, établi après l'implémentation du chantier précédent.** Ne pas reprendre ses lots depuis zéro. Réutiliser les résolveurs, contrats par créneau, composants culinaires, finalisation des quantités, audits et transport de test désormais présents. Ce document prescrit les corrections restantes ; il ne les déclare pas réalisées.

Sources : [campagne des six tirs](CAMPAGNE-SIX-TIRS-2026-09-11.md), ses réponses brutes dans `scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/`, et `NON-BRANCHE.md` dans ce même dossier de chantier. Vérifier les changements intervenus depuis ces preuves avant chaque modification.

**Décision ajoutée par l'utilisateur : arrondir les quantités au plus proche.** Les quantités arrondies sont celles réellement calculées, cuisinées, achetées et affichées. Pas de recherche du kcal exact au prix de fractions d'œufs ou de morceaux de viande.

## 1. Résultat attendu et périmètre

- Un plan complet comporte une portion pour chaque personne/date/créneau demandé. Sa mesure finale respecte simultanément les calories, les grammes, les densités et les planchers protéiques applicables.
- La première génération reçoit toutes ces contraintes. La correction déterministe reste limitée ; les rappels modèle sont un recours, avec le budget commun existant de deux réparations au maximum.
- Une personne seule et un foyer utilisent le moteur actuel ; seul le compte maître génère. Pas de réouverture de la lane solo ni de refonte de l'UI.
- Conserver les équations, protections individuelles, règles d'appétit et composants culinaires déjà implémentés. Conserver la suppression des forfaits pain/fromage/dessert hors plan ; les apports fixes déclarés restent pris en compte.
- Tolérances existantes : **±10 % par créneau et ±5 % par journée couverte**, sans affaiblir les gardes plus strictes. Mesurer contre la cible initiale, jamais contre une cible déplacée vers le résultat pour le faire passer.
- Un écart résiduel utilisable reste explicitement visible. Une sortie non livrable n'est pas activée et ne remplace pas le plan valide précédent. Un résultat rejeté correctement constitue une preuve de contrôle, pas un plan réussi.
- Garder les réglages fast actuellement configurés. Le diagnostic 546 reste séparé comme convenu ; les durées restent publiées et un dépassement du délai de l'environnement cible empêche de conclure à une livraison fiable dans cet environnement.
- Respecter `AGENTS.md`. Ne pas déployer, appliquer une migration ou exécuter une suppression réservée à l'humain. Les essais utilisent des fixtures isolées sans nettoyage destructif nécessaire. Aucune limite de « propriétaire du lot précédent » ne justifie de laisser une correction de ce plan non branchée.

## 2. État de départ : acquis et défauts restants

| Acquis à conserver | Correction restante |
|---|---|
| Référence explicite traversant les lecteurs | Nouveau plan encore accepté avec des identifiants omis ; tir 2 sans portion au dîner du dimanche. |
| Contrat énergétique par case | Harnais qui reconstruit un appétit moyen et une seule bouche, ignore les apports fixes et déduit la grille des plats produits. |
| Affichage depuis les quantités structurées | Quantités dénombrables fractionnaires après multiplication ; certaines lignes sans unité lisible. |
| Audit de courses par identité | `retry_merge.ts` supprime encore par comparaison de libellés ; payload d'achats sans identité/quantité structurée. |
| Mesure des planchers protéiques | Déficits détectés tardivement, sans correction effective ; quatre tirs touchés. |
| Causes de refus et budget de réparation existants | `defectsFromRefusals` non appelé ; handler encore sur `FINAL_GATE_POLICY_LOT_1`. |
| Statut serveur « avec écarts » | Aucune surface UI ne restitue les écarts persistés. |
| Tests de rendu et transport contrôlé | Refus final non exercé, allergène volontairement introduit non testé, repas léger mal configuré, fenêtre partielle non testée en intégration fidèle. |

**Correction du rapport à conserver :** les petits-déjeuners du tir 3 à 94 et 99 kcal/100 g ne constituent pas les deux violations annoncées. `analyse-lot-F.ts` force `appetite: "average"`. Avec l'appétit réel `large`, `plateBoundsFor` puis `densityCorridorFor` donnent un minimum de **91** pour 613,5 kcal. Ne pas réparer ces recettes sur la base du faux seuil de 100.

## 3. Ordre d'exécution

**C0 → C1 → C2 → C3 → C4 → C5 → C6.** Chaque étape apporte son correctif, ses tests de régression et une preuve de branchement. C6 valide ensuite la chaîne entière. Ne pas créer de nouvel orchestrateur ou réécrire les modules qui fonctionnent déjà pour contourner leurs appelants actuels.

### C0 — Un banc fidèle à la demande et à chaque personne

Fichiers : `analyse-lot-F.ts`, `campagne-lot-F.ts`, `banc-lot-F.ts`, `transport-lot-F.ts`, `scripts/2026-09-11-mesure-grille.ts` et fixtures correspondantes.

1. Figer dans chaque fixture, **avant la génération**, l'heure, le fuseau, la fenêtre, les cases attendues par personne, les profils, habitudes, apports fixes et contrats transmis. Ne pas construire les cases attendues à partir des plats retournés : un plat manquant disparaîtrait du contrôle.
2. Lire l'appétit réel ; retirer `appetite: "average"` imposé. Mesurer toutes les bouches, leurs propres bornes et objectifs. Ne pas assimiler « douze portions présentes » à « douze portions conformes » lorsque seules six ont été mesurées.
3. Conserver les contextes spécifiques de repas léger, apports fixes et restrictions. Utiliser les contrats structurés enregistrés par le run plutôt qu'en reconstruire de différents après coup.
4. Capturer séparément génération brute, ajustement, chaque réparation, finalisation et payload relu. Les identifiants absents du tir 2 se comptent séparément au premier jet et après réparation ; ne pas attribuer les champs finaux au premier jet.
5. Pour le transport contrôlé, injecter l'horloge et les identifiants de fixture au niveau du harness, sans interrupteur accessible depuis une requête produit. Les tests d'après-midi ne doivent pas dépendre de l'heure réelle de lancement.
6. Les fiches culinaires comparent des quantités converties sur une base cohérente, ou des facteurs par ligne. Un pourcentage de nombres de pièces hétérogènes ne constitue pas une proportion massique ; les rapports internes seuls ne prouvent pas le rapport sauce/plat.

**Sortie exigée :** grand appétit relu correctement, deux bouches évaluées intégralement, une case volontairement retirée toujours attendue et signalée, fenêtre partielle reproductible. Le rapport rectifié distingue conformité calorique, conformité complète et contrôles incomplets.

### C1 — Fermer les omissions d'identité et les entrées ignorées

Fichiers : `meal_generation.ts`, `composition_contract.ts`, résolveur commun de composition, `household_fixed_intakes.ts`, RPC de réglage des apports fixes/habitudes, leurs lecteurs UI, `slot_nutrition_contract.ts`.

**Références :**

- Pour une nouvelle génération ou réparation, exiger `ref` et `amount`/`unit` sur chaque ligne pesée. L'inclure dans le contrat de sortie et le valider avant de dimensionner. Réutiliser les conventions explicites pour les condiments non pesés.
- La compatibilité des anciens plans sans `ref` reste un mode de lecture historique ; elle ne doit pas servir d'autorisation implicite aux nouvelles sorties.
- Identifiant absent/refusé : produire un défaut structuré destiné au recours existant. Ne pas livrer silencieusement une recette sans portion ni remplacer une valeur inconnue par une moyenne de groupe.
- Lors d'une réparation, seuls les identifiants déjà établis et les lignes stables inchangées peuvent être conservés sans nouvelle déclaration ; ne pas inventer une identité depuis un rapprochement approximatif de noms.
- Régression obligatoire sur « pita complète » du tir 2 : référence correcte → portion calculable ; référence absente → réparation ou refus explicite, jamais un succès à cinq portions sur six.

**Apports fixes et repas léger :**

- Conserver la source canonique actuelle du titulaire : `student_goals.practical_constraints.fixed_intakes`. Faire écrire la RPC destinée au titulaire dans cette source, avec les permissions existantes. Pour un membre sans compte, conserver `household_members.fixed_intakes`.
- Traiter les anciennes valeurs orphelines sans les additionner : priorité explicite à la source canonique ; repli documenté si seule l'ancienne colonne est renseignée. Préparer toute migration nécessaire, sans l'exécuter en contournant `AGENTS.md`.
- Le test suit le vrai trajet UI/RPC → lecteur → prompt → cible. Il ne valide pas seulement la présence d'une ligne dans une table.
- Déclarer « léger » par les habitudes réellement consommées, pas par `eating_rhythm[].size`. Vérifier son effet sur le budget et les bornes avec les fonctions existantes.
- Mesurer calories **et protéines** des apports fixes depuis leurs références. Calculer la part protéique couverte avant la soustraction des apports fixes, puis retirer leurs protéines une fois ; ne pas réduire simultanément le besoin par un ratio énergétique déjà net et par une deuxième soustraction protéique.

**Sortie exigée :** apport fixe du titulaire et du membre sans compte lu une seule fois ; même réglage sauvegardé/rechargé ; repas léger réellement présent dans le contrat ; aucune omission de référence transformée en réussite partielle silencieuse.

### C2 — Arrondir simplement les quantités réelles au plus proche

Fichiers : `portion_sizing.ts::scaleIngredients`, `applySizing`/`applySizingForEaters`, transformations ultérieures de lots dans le handler, `quantity_render.ts`, sérialisation, `ingredientQuantity` côté UI.

**Règle choisie par l'utilisateur :**

| Nature | Quantité finale |
|---|---|
| Aliment cuisiné/servi en pièces entières | Entier le plus proche : **3,76 œufs → 4**, **2,13 morceaux de poulet → 2**, **1,86 pita → 2**. |
| Aliment pesé | Gramme entier le plus proche : **458,66 g → 459 g**. |
| Volume mesuré | Millilitre entier le plus proche. Convertir les grandes unités de mesure ou cuillères vers g/ml avant arrondi avec les conversions connues du référentiel. |
| Portion prélevée dans une préparation divisée | Grammes prêts entiers ; les pièces nécessaires à cuisiner le lot restent entières. Une omelette de quatre œufs peut donner plusieurs portions en grammes. |
| Condiment déclaré « une pincée » | Conserver cette convention textuelle ; ne pas transformer une absence de mesure en zéro. |

- Pour les quantités positives exactement à mi-distance, arrondir vers l'entier supérieur. Ne pas arrondir aveuglément 0,77 cuillère à une cuillère : utiliser une unité plus fine connue, puis appliquer la règle. L'UI conserve toujours le nom de l'aliment et l'unité de la quantité.
- Si l'arrondi donne zéro à un ingrédient nécessaire, ne pas le supprimer silencieusement. Employer une présentation divisible mesurable lorsqu'elle est déjà compatible avec la recette ; sinon rendre le cas à la réparation. Aucune conversion inventée.
- Appliquer l'arrondi après le dimensionnement et les changements de proportions. L'arrondi modifie les données structurées, **pas uniquement leur affichage**.
- Pour les préparations partagées : arrondir les ingrédients du lot une fois, remesurer sa composition, puis calculer les portions entières en grammes et contrôler leur somme face au lot disponible. Ne pas arrondir séparément plusieurs copies du même lot.
- Recalculer ensuite les calories, protéines, masses et densités, puis les courses et la prose depuis cette version. Toute mutation ultérieure passe par cette même finalisation. La finalisation doit être idempotente : un second passage ne change rien.
- Accepter les petits écarts dans les tolérances existantes ; ne pas rouvrir une optimisation pour retrouver le kcal exact. Si les quantités arrondies sortent des bornes, transmettre le défaut à C4. Aucun aller-retour caché entre arrondi et multiplication qui recrée des fractions.
- Conserver les composants culinaires déjà protégés. Identifier dans les traces la variation due à l'arrondi ; ne pas présenter une rupture de proportions autre qu'un arrondi comme une mise à l'échelle uniforme.

**Tests :** œufs, viande en pièces, pita, huile en cuillères, citron écrit en lettres, petite quantité qui tomberait à zéro, repas juste au plafond de masse, casserole de plusieurs personnes. Vérifier les valeurs structurées, les courses, le rendu UI et les mesures **après** arrondi. Aucune ligne quantitative nouvelle affichée avec une fraction décimale ; aucune quantité manquante masquée.

### C3 — Reconstruire des courses exactes après toute réparation

Fichiers : **tous** les chemins de filtrage de `retry_merge.ts`, `meal_generation.ts::mealShoppingPayload`, `final_plan_audit.ts`, lecture des achats et groupes de fraîcheur, `ShoppingListPanel` et lecteurs API.

1. Supprimer la décision de conservation/suppression fondée sur l'égalité des libellés. Réutiliser les identités établies ; si le module reste pur, lui passer les identités ou le contexte résolu en argument, sans I/O ni second résolveur.
2. Produire les achats depuis le plan final arrondi et les lots réellement cuisinés. Après un patch modèle, ne pas garder une ancienne quantité de courses faute de champ actualisé.
3. Transmettre et persister `ref`, quantité, unité, état/base achetable, date et éventuel conditionnement. Le texte est dérivé ; le contrôle quantitatif ne dépend plus de sa réinterprétation.
4. Respecter les stocks connus et conditionnements. Si le garde-manger déclare seulement une présence, nommer la quantité non vérifiée ; ne pas inventer un stock suffisant. Pour les repas planifiés dont tout le besoin doit être acheté, un contrôle quantitatif incomplet est un défaut restant à traiter.
5. Classer explicitement l'eau de cuisson du robinet comme non achetable, tout en la conservant dans la mesure de préparation. Ne pas exclure indistinctement toutes les boissons ou eaux conditionnées.
6. Le groupe de fraîcheur d'une référence connue vient de cette référence, pas de `foodGroupOfTerm`. Maintenir les contraintes de date/conservation existantes.

**Tests :** les six lignes pluriels supprimées par l'ancien `retry_merge` survivent ; un ingrédient réellement retiré de la recette cesse d'être acheté ; feta/huile sous-achetées détectées ; stock/conditionnement pris en compte ; eau de cuisson sans alerte d'achat. Tester après une puis deux réparations, et après arrondi des lots partagés.

### C4 — Corriger les déficits avant la livraison, avec la boucle existante

Fichiers : `slot_nutrition_contract.ts`, prompt/contrat de génération standard, `final_plan_audit.ts`, `plan_repair_loop.ts::{defectsFromRefusals,judgeCandidate}`, `plan_budget.ts`, `generate-household-meal-v1/index.ts`.

- **Avant la première génération**, transmettre les contraintes protéiques existantes par personne et journée couverte, ainsi que les minimums par repas lorsqu'ils s'appliquent. Rendre leur répartition lisible au modèle, avec calories, grammes et densité, sans nouveau barème ni changement des protections individuelles.
- Prévoir de composer les sources de protéines dès le premier jet. Ne pas utiliser une phrase vague « une protéine dans chaque repas » comme substitut à la cible numérique disponible.
- Extraire/réutiliser une passe commune qui finalise une candidate et collecte **tous** ses défauts applicables : identités, portions, nutrition, courses, restrictions, structure culinaire et quantités. Conserver les contrôles précoces utiles, mais aucun ne possède une boucle de réparation indépendante.
- Brancher `defectsFromRefusals` au budget réel. Les défauts détectés ne doivent plus attendre une garde exécutée après le dernier point où une réparation était possible.
- Demander une correction ciblée avec identifiants stables, mesures actuelles et contrats attendus. Pour le déficit protéique, recomposer à calories et masse compatibles ; ne pas ajouter mécaniquement de la viande ou augmenter tout le plat.
- Appliquer chaque réponse sur une copie, puis refaire toute la finalisation et tous les contrôles, pour chaque personne affectée. Rejeter les nouveaux défauts durs et les régressions de portions déjà conformes, même si le nombre global de défauts baisse.
- Garder la comparaison d'amélioration mesurée déjà disponible et l'ancre initiale des ratios. Deux réparations maximum pour le plan entier, échéance commune, réserve d'écriture. Les retransmissions et appels annexes restent observables et ne constituent pas une réserve cachée de réparations.
- Après épuisement : choisir explicitement la dernière version utilisable avec ses écarts, ou le refus si aucune version n'est livrable. Ne pas déclarer la campagne réussie parce que le système sait désormais refuser tous les plans.

**Tests contrôlés obligatoires :** déficit protéique du tir 1 corrigé sans dépasser calories/grammes ; première réparation insuffisante puis seconde suffisante ; deux réparations insuffisantes ; candidat améliorant les calories mais introduisant un allergène ; amélioration d'une bouche dégradant l'autre ; portion sans référence détectée avant livraison. Compter les appels réellement effectués, pas seulement le nombre demandé à la fonction de budget.

### C5 — Activer le refus réel et afficher les écarts persistés

Fichiers : handler, `final_plan_gate.ts`, politique `FINAL_GATE_POLICY_LOT_4`, contrat de réponse/persistance, lecteurs de plan et composants d'affichage.

1. Examiner la politique déjà écrite et la brancher avec les causes validées par C1–C4. Ne pas changer simplement son numéro : tester chaque comportement attendu. Un défaut de sécurité ou une portion obligatoire absente doit empêcher l'activation.
2. Vérifier le retour effectif **avant** l'écriture/activation, et le maintien de l'ancien plan valide. Le test injecte précisément le cas `cell_without_portion` du tir 2 et exige `422 plan_not_deliverable`, puis relit la base pour prouver qu'aucun remplacement invalide n'a eu lieu.
3. Persister un résultat de validation structuré et versionné : `conforme`, `livrable_avec_ecarts` ou `non_livrable`, avec défauts, contrôles incomplets et contrôles non applicables séparés. Les `issues[]` textuelles seules ne suffisent pas pour la relecture durable.
4. Afficher ce statut sur le plan dès réception et après rechargement, avec les repas/personnes concernés et des explications courtes. Respecter les portes d'affichage calorique : pas de chiffres masqués par une protection réintroduits dans un message d'erreur.
5. Une sortie utilisable mais sous un plancher nutritionnel ne peut pas être présentée comme ayant atteint l'objectif. Une sortie incomplète ne peut pas être présentée comme complète. Les messages de refus traduits existent déjà : réutiliser leur copie et brancher la surface manquante.
6. Actualiser les listes `NON-BRANCHE.md` et les appels morts Z1/Z2/Z3 : prouver leur usage, supprimer les chemins obsolètes sans régression ou nommer le défaut encore ouvert. Ne pas réactiver une ancienne classification par libellé pour obtenir un compteur vert.

**Tests :** refus sans écriture ; version avec écart visible à réception puis après vraie relecture API ; version conforme sans faux avertissement ; plusieurs personnes ; absence de fuite de chiffres protégés ; état serveur perdu à la sérialisation détecté par le test. Un rendu React depuis une fixture est utile mais ne remplace pas le parcours complet sauvegarde/relecture.

### C6 — Validation finale : quelques preuves décisives, puis les vrais tirs

**D'abord sans nouveau coût modèle :**

- Rejouer les six réponses de la campagne sur le code corrigé, avec le bon contexte. Elles peuvent révéler des recettes à recomposer : documenter le résultat, sans attendre que les mêmes anciennes quantités atteignent les nouveaux contrôles.
- Au niveau du vrai handler et du transport contrôlé : injecter un allergène dans une génération puis dans une réparation ; les deux doivent être rejetés. Vérifier aussi une réponse saine acceptée. L'absence d'arachide dans une réponse saine ne prouve pas le blocage.
- Exécuter le cas d'après-midi avec horloge injectée, le vrai repas léger, les apports fixes du titulaire et d'un membre sans compte, une portion sans référence, le grand/petit appétit et un foyer de deux. Chaque test vérifie demande → contrat → réponse → quantités finales → persistance → relecture.
- Tests ciblés des modules et consommateurs modifiés, vérification de types des handlers, tests frontend et build. Les tests ignorés ne prouvent rien ; les erreurs préexistantes sont distinguées des régressions avec leurs résultats exacts.

**Ensuite : une campagne réelle de six cas au maximum pour cette passe de validation**, séquentielle, avec fixtures correctement configurées et contrôlées avant l'appel :

| Cas | Propriété principale |
|---|---|
| PERTE, rythme ordinaire | Calories et protéines simultanément atteintes ; quantités arrondies. |
| GAIN, rythme ordinaire | Toutes les portions présentes ; identifiants sur toutes les lignes pesées. |
| Grand appétit | Contrats réellement personnalisés et mesure avec ce même appétit. |
| Petit appétit | Masse maximale respectée après arrondi, sans assiette minuscule artificielle. |
| Repas léger + apport fixe réel | Habitudes relues et apport inclus une seule fois en calories/protéines. |
| Foyer de deux + restriction | Les deux personnes entièrement mesurées, préparation partagée cohérente. |

Le cas partiel est obligatoirement prouvé au transport contrôlé ; un tir réel partiel n'est revendiqué que si la fenêtre effectivement acceptée le contient. Ne pas attendre un humain pour les tests d'horloge pouvant être injectés. Les fixtures sont isolées par run, sans supprimer largement les plans d'un ancien compte de test.

Capturer pour chaque run : cases **attendues**/présentes/mesurables/conformes, cibles et valeurs par personne et case, totaux couverts, déficit protéique applicable, références omises/refusées, quantités avant/après arrondi, achats manquants/sous-achetés/incomplets, composants modifiés, nombre réel de rappels, latences et résultat de livraison. Les résultats du premier jet, après déterminisme, après chaque réparation et après relecture restent séparés.

Un échec connu bloque la clôture de sa correction : reproduire hors ligne, corriger, relancer le test ciblé. Une éventuelle nouvelle génération payante après correction est un essai distinct justifié et conservé, pas le remplacement silencieux d'un rouge par un vert. Ne pas étendre automatiquement la campagne pour obtenir une meilleure moyenne.

## 4. Conditions de clôture

Le rapport final fournit une ligne par condition avec preuve et résultat. **« Codé », « testé en isolation » et « branché jusqu'à la livraison » sont trois états différents.**

| Condition | Preuve attendue |
|---|---|
| Quantités pratiques | Entiers dans la bonne unité ; données calculées = cuisine = écran ; finalisation idempotente. |
| Couverture | Toutes les cases demandées et toutes les personnes ont leur portion, ou refus explicite avant activation. |
| Nutrition | Calories, grammes, densités et protéines applicables contrôlés simultanément après arrondi ; aucun défaut silencieux. |
| Entrées personnelles | Appétit, léger et apports fixes réellement transmis et consommés. |
| Courses | Identités et quantités structurées, aucune suppression par pluriel, suffisance contrôlée sur les nouveaux plans concernés. |
| Réparation | Tous les défauts réparables alimentent le budget commun ; aucun troisième rappel caché. |
| Sécurité | Cas interdits initial/après réparation rejetés ; cas sain accepté ; droits du compte maître inchangés. |
| Livraison/UI | Refus effectif sans remplacement invalide ; écarts visibles et conservés après rechargement. |
| Campagne | Plans des cas réalisables effectivement produits conformes ; échecs, abstentions et dénominateurs conservés. Six tirs ne garantissent pas un taux général de succès. |
| Délai | Mesuré par étape et comparé à la limite vérifiée de l'environnement cible. Dépassement ouvert = fiabilité de livraison encore ouverte. |

Fournir un **nouveau rapport de clôture**, distinct de la campagne existante. Corriger cette dernière par un addendum daté pour les erreurs de mesure, sans effacer les résultats historiques. Mettre à jour `docs/keel/mesure.md` et seulement le chemin réellement branché de `docs/SOCLE.md`.

La dégustation reste une validation humaine distincte : fournir des fiches avant/après sur les mêmes portions, ne pas revendiquer une saveur prouvée. Elle ne doit pas servir de prétexte pour laisser les arrondis, les réparations, les achats ou la validation finale inachevés.
