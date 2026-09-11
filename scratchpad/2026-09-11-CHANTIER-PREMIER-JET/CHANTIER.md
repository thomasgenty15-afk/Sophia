# Fiabiliser la composition des repas dès la première génération

> Texte de l'utilisateur, reproduit tel quel. C'est l'autorité du chantier.

## 1. Objectif et décisions retenues

Obtenir des recettes qui respectent les calories, les grammes, les contraintes alimentaires et les objectifs protéiques applicables, **sans appel modèle de rattrapage dans le fonctionnement nominal**.

Décisions confirmées :

- Le modèle compose avec des **références alimentaires vérifiées**.
- Le moteur peut **ajuster les proportions des ingrédients présents**, dans des limites explicites.
- Le rattrapage modèle sert à une recomposition que cet ajustement ne permet pas de résoudre.
- Deux tentatives supplémentaires maximum, pour l'ensemble des défauts.
- Même calcul et mêmes contrôles pour une personne seule et plusieurs personnes.
- Seul le compte maître génère.
- Aucun changement de modèle dans ce chantier ; Fast est déjà actif.
- Aucun travail sur le diagnostic du 546, aucune grande campagne payante.

Le point de départ est l'enquête et ses preuves (`docs/keel/ENQUETE-DEUX-DIRECTIONS-2026-09-11.md`). Les résultats erronés du rapport précédent ne doivent pas devenir des attentes de tests.

## 2. Contrat commun à la génération, au calcul et à l'affichage

Faire circuler une représentation unique et versionnée :

| Objet | Informations nécessaires |
|---|---|
| Ingrédient | Identifiant de référence vérifiée, forme alimentaire, quantité structurée, unité, état cru/cuit, libellé localisé distinct de l'identifiant. |
| Préparation | Identifiant stable, ingrédients, mode de traitement de l'eau et consommateurs réels. |
| Plat | Identifiant stable, date, créneau, destinataires, ingrédients frais et liens explicites vers les préparations. |
| Objectif individuel | Cible quotidienne, bande autorisée, budget du créneau, bornes min/préféré/max de grammes, couloir de densité, contraintes protéiques applicables. |
| Mesure finale | Calories, protéines et grammes des items effectivement enregistrés dans chaque portion ; état et raisons de non-conformité. |

Les nouveaux champs internes sont persistés dans les structures JSON et métadonnées existantes lorsque possible. Les identifiants et détails techniques restent invisibles dans l'UI.

**Règles :**

- Une valeur absente reste inconnue.
- Une référence trouvée n'est pas automatiquement une référence correcte ou vérifiée.
- La cible du moteur est explicite ; personne ne la reconstruit depuis le milieu de la bande.
- La densité utilise les calories et les grammes de **la même portion**.
- Une modification de recette, préparation, quantité ou attribution invalide sa mesure précédente.
- Les données personnelles nécessaires au calcul restent côté moteur. Le prompt reçoit les contraintes utiles au plat.

## 3. Implémentation, dans cet ordre

### Lot A — Corriger l'identité et la validation alimentaires

1. Auditer les références effectivement utilisées dans les deux plans, puis l'ensemble du catalogue autorisé pour les nouvelles générations : aliment, forme, code source, valeurs, unités et rendements.
2. Corriger les collisions français/anglais : `raisin`, `raisins`, `prune`, `prunes`. Distinguer explicitement fruit frais et fruit séché.
3. Corriger le rattachement `pear → Poireau, cru` et rechercher les autres références dont le code source désigne un aliment différent.
4. Séparer la résolution d'un **identifiant structuré** de celle d'un **terme libre localisé**. Un terme français ne doit plus être accepté comme slug anglais par priorité implicite.
5. Introduire un manifeste de validation versionné avec trois états : vérifié, à vérifier, rejeté. Le seul champ `source: ciqual` ne donne pas le statut vérifié.
6. Autoriser la composition uniquement avec les références vérifiées. Une référence manuelle peut être admise si ses valeurs et sa provenance ont été explicitement validées ; une estimation modèle ne l'est pas.
7. Préparer une migration corrective explicite et reproductible, sans modifier les migrations historiques.

**Fin du lot :** les trois défauts connus sont détectés par les tests ; aucune génération nouvelle ne peut utiliser silencieusement une référence non validée.

### Lot B — Unifier les masses, les calories et les portions

1. Mesurer chaque unité de préparation séparément, puis sommer ses contributions réelles aux assiettes. Supprimer le calcul qui aplatit les casseroles avant de décider quelles lignes d'eau compter.
2. Attacher le traitement de l'eau à sa préparation : eau déjà comprise dans le rendement, eau conservée dans le plat, eau éliminée. Une situation indéterminée reste explicitement non mesurable.
3. Faire utiliser cette même mesure au dimensionnement, aux applicateurs de boîtes, aux contrôles, à l'écran et au banc.
4. Conserver les prélèvements personnalisés : une boîte ne reçoit pas nécessairement `1 / servingsMade` de chaque casserole.
5. Après application et arrondis, remesurer les items réellement écrits. Activer ce contrôle pour **N = 1**, sans abstention `single_mouth`.
6. Garantir que les prélèvements de toutes les portions correspondent aux quantités préparées, aux usages et aux courses.
7. Conserver la cible quotidienne explicite. Réutiliser les budgets de créneaux calculés, avec repas légers, apports fixes et couverture partielle. Aucune déduction d'extras hors plan.
8. Réutiliser les planchers protéiques existants, avec leurs gardes et leur poids de référence ; mesurer les préparations au prorata réellement servi. Ne pas inventer un second barème.

**Fin du lot :** mesurer une assiette avant application et mesurer les composants appliqués donne le même résultat, hors arrondis explicitement contrôlés. Le cas 811/901 g ne peut plus exister.

### Lot C — Rendre la première composition vérifiable

1. Fournir au modèle une vue compacte des ingrédients vérifiés et compatibles avec le contexte : identifiant, nom non ambigu, forme, kcal, protéines et règles de conversion nécessaires.
2. Exiger ces identifiants dans la réponse. Un identifiant inconnu, incompatible ou inventé est refusé, sans rapprochement approximatif de secours.
3. Donner les couloirs par case et, pour une préparation partagée, ses consommateurs et les contraintes communes. Conserver explicitement les conflits quand l'intersection est vide.
4. Aligner la densité préférée sur le contrat accepté : `100 × cible / grammage préféré`, projetée dans le couloir réalisable. Ne pas lui substituer silencieusement `Dmin × 1,10`.
5. Supprimer les consignes génériques contradictoires de grammage et les demandes de portions ou de boîtes au modèle. Son livrable est la recette standard.
6. Expliciter les parts de préparations dans l'autocontrôle demandé. `density_check` reste une déclaration, jamais une preuve.
7. Faire porter les quantités affichées par les données structurées. Les instructions utilisent des références aux ingrédients et à leurs quantités, afin qu'un ajustement ne laisse pas une ancienne quantité dans le texte.

**Fin du lot :** le modèle connaît les aliments et coefficients que le moteur utilisera ; le parseur vérifie ce contrat.

### Lot D — Ajuster les proportions sans appel modèle

Étendre le mécanisme déterministe existant dans les deux directions : densifier et alléger.

**Limites initiales, versionnées comme conventions produit :**

- aucun ingrédient ajouté, supprimé ou remplacé ;
- légumes : au moins 70 % de leur quantité initiale ;
- autres ingrédients : au moins 50 % ;
- ingrédients des groupes protéiques : au plus 150 % ;
- huiles, beurres et graisses ajoutées : entre 75 et 125 % ;
- autres ingrédients : au plus 200 % ;
- condiments et traitement de l'eau fixes ;
- toutes les bornes individuelles, restrictions et contraintes existantes restent prioritaires.

Les ratios sont toujours rapportés à la recette initiale acceptée. Ils ne se cumulent pas au fil des passes.

**Algorithme :**

- Reprendre le principe existant de transferts de masse entre composants, dans le sens qui réduit l'écart de densité.
- Choisir de façon déterministe le déplacement qui améliore le plus le défaut ; départager les égalités par identifiant.
- Employer des déplacements de 5 g cuits, réduits si nécessaire pour atteindre une limite ou fermer l'écart.
- Limiter la recherche à 200 déplacements par composante de préparations partagées.
- Réévaluer tous les consommateurs des unités modifiées. Ne pas dégrader une portion déjà conforme.
- S'arrêter dès que les contraintes sont satisfaites ; la proximité du grammage préféré reste un objectif secondaire.
- Si la recherche s'arrête sans solution, retourner « aucune solution trouvée dans ces limites », sans prétendre avoir prouvé l'impossibilité.

Les unités dont les proportions ou instructions ne peuvent pas être ajustées de manière fiable restent fixes et passent, si nécessaire, par une recomposition modèle.

Après ajustement : recalculer les portions, les préparations, les courses et les instructions, puis contrôler le résultat appliqué.

**Fin du lot :** une correction numérique réalisable dans ces limites consomme zéro appel modèle.

### Lot E — Une réparation ciblée, transactionnelle et réellement utile

1. Brancher la boucle commune existante après collecte de **tous** les défauts. Retirer les anciennes relances indépendantes du chemin actif.
2. Envoyer uniquement les unités à corriger, avec identifiants stables, cases, consommateurs, composition courante, valeurs mesurées, écarts et limites autorisées.
3. Demander un patch ciblé, jamais un nouveau plan complet.
4. Appliquer le patch à une copie. Vérifier ensemble ingrédients, préparations, titre, méthode et destinataires. Interdire la fusion partielle qui conserve les anciens `uses` sous un nouveau plat.
5. Remesurer toutes les portions dépendantes et rejouer les gardes alimentaires après modification.
6. Accepter une amélioration quantifiée même si le nombre de défauts ne baisse pas : le passage PERTE de 3 défauts importants à 3 défauts plus faibles doit pouvoir être conservé.
7. Refuser une nouvelle violation de sécurité, une référence invalide, une case perdue, une identité incohérente ou la dégradation d'une portion conforme. La réduction d'un simple compteur ne suffit pas.
8. Mettre à jour ou invalider la déclaration `density_check` lors d'une modification.
9. Compter les transmissions fournisseur réelles, replis compris, dans le maximum de deux tentatives supplémentaires. Respecter l'échéance et la réserve d'écriture existantes.

À épuisement du budget, conserver la dernière version utilisable et rendre ses écarts explicites. Une version présentant une violation bloquante n'est pas livrée.

## 4. Tests et critères d'acceptation

### Régressions obligatoires, sans appel modèle

| Cas | Résultat attendu |
|---|---|
| Raisin/prune en français, frais et séchés | Références distinctes et correctes ; aucun succès trompeur par slug anglais. |
| Poire | Aucun rattachement au poireau. |
| Lentilles avec eau + couscous | Masse identique par somme des préparations et par assiette ; aucun effacement transversal de l'eau. |
| Boîtes avec prélèvements différents | Calories calculées depuis chaque prélèvement, pas depuis des parts égales. |
| Bande PERTE asymétrique | Cible moteur 2 454 conservée ; aucun objectif reconstruit à 2 528. |
| Réparation qui intervertit midi et soir | Patch rejeté ; aucune combinaison titre saumon/préparation lentilles. |
| Trois défauts devenus moins importants | Amélioration mesurée admissible sans exiger une baisse du nombre. |
| Allergène introduit par réparation | Candidat rejeté après contrôle de toutes les préparations touchées. |
| Ajustement déterministe | Bornes respectées, ratios non cumulables, aucune inflation arbitraire de graisse. |
| Une personne / plusieurs personnes | Même mesure finale et mêmes propriétés, sans exception de validation. |

Compléter par : créneau léger, petit/grand appétit, apports fixes, journée partielle, cases gelées, données manquantes, protections existantes et cible protéique non atteinte.

**Intégration :** réponses fournisseur contrôlées passant par les vrais handlers jusqu'au payload persisté. Vérifier l'UI et les chiffres retournés par les endpoints, pas seulement les fonctions pures.

**Critères :**

- zéro référence invalide, violation de sécurité ou case manquante ;
- tous les grammages mesurables dans leurs bornes ;
- repas à ±10 % et journée couverte à ±5 %, selon le contrat existant ; les gardes plus strictes restent prioritaires ;
- couloirs de densité et planchers protéiques applicables respectés ;
- aucune mesure antérieure utilisée pour déclarer conforme un payload modifié.

Rejouer les six réponses archivées, puis lancer indépendamment les contrôles TypeScript, lint, tests d'intégration et build.

Après ces vérifications, prévoir **six générations séquentielles de trois jours**, couvrant les deux directions, N = 1/N > 1, appétit et repas léger. Publier séparément le succès brut du modèle, le succès après ajustement sans rattrapage, après un et après deux rattrapages. Ce petit échantillon ne constitue pas une estimation fiable du taux de réussite en production.

## 5. Traçabilité et mise en service

- Enregistrer les versions du prompt, du référentiel, des coefficients et de l'ajusteur, ainsi que les mesures des étapes successives et les motifs d'acceptation/rejet.
- Suivre les dix contrôles de `docs/keel/mesure.md`, avec leurs dénominateurs et anomalies par assiette.
- Préserver les grammes des plans historiques. Ne pas les réécrire automatiquement après correction du référentiel ; signaler une mesure historique non reproductible lorsque nécessaire.
- Mettre à jour la documentation à partir du comportement vérifié. Un module testé mais non appelé ne clôt pas un lot.
- Préparer migrations et déploiement après validation. Leur exécution revient à l'utilisateur conformément à `AGENTS.md`.
