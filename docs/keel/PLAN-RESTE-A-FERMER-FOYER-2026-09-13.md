# Fermer le reste du parcours foyer — plan d'exécution pour Opus

Base : `RAPPORT-CIBLES-ET-VALIDATION-FOYER-2026-09-13.md`, en particulier §3.5, §4.2–4.5 et §6. Code relu avant rédaction. **Trois lots, dans cet ordre.** Ce plan poursuit les corrections existantes ; les travaux et résultats précédents restent conservés.

## Résultat attendu et contraintes

- Un membre sans âge connu ne doit plus faire disparaître sa part puis bloquer mécaniquement tout le foyer. Les protections doivent continuer de décider quels calculs et quels affichages sont permis.
- L'isolation d'une préparation, le complément et la panne de validation doivent être éprouvés jusqu'à leur effet sur le plan publié ou refusé.
- Les manques protéiques et les défauts de réparation doivent être suivis depuis le contrat jusqu'aux données livrées, sans attribuer un défaut au modèle avant de vérifier les entrées et transformations.
- La réparation réelle utile à plusieurs doit être testée sur la version corrigée du schéma et du transport, avec **les deux appels réels de réparation encore disponibles, pas un nouveau budget**.

Conserver : lane foyer unique, génération par le maître uniquement, équations et tolérances existantes, suppression des forfaits extras, apports fixes explicites, proportions culinaires, quantités entières, configurations modèle/fast et protections. Ne pas transformer tous les membres en personnes en perte/prise pour obtenir des portions testables.

Conserver `repair.v2`, les identités par personne, le contrôle des sessions/explications, l'atomicité, la priorité du groupe issu d'une référence résolue, la correction de grille et les corrections de l'instrument. Un bac partagé divisé par son nombre de consommateurs reste **une estimation par personne**, pas une pesée individuelle.

Deux réparations maximum par demande pour le foyer entier. Après épuisement, la politique actuelle reste : version sûre et complète avec écarts autorisés explicités ; refus si personne non nourrie, violation de sécurité ou validation indisponible. Un HTTP 200 n'est jamais une preuve de conformité nutritionnelle.

Lire `AGENTS.md`, figer l'état/diff des fichiers testés, préserver le travail des autres sessions. Aucun déploiement, db push/reset, secret ou nettoyage destructif. Pas de nouveau barème clinique, changement de modèle ou relèvement de timeout dans ces lots. Aucun appel payant avant la sortie des lots 1 et 2.

## Lot 1 — Nourrir chaque personne sans contourner les protections

### 1.1 Reproduire le blocage sur la bonne variante

Reprendre la référence N=4 valide du chantier précédent. Retirer uniquement la date de naissance d'un membre secondaire ; garder constantes la demande, les autres personnes, les recettes et l'horloge. Ne pas changer son objectif en `maintenance` pour contourner le cas.

Le défaut rapporté est précis : `dayTargetFor` s'abstient, aucune part n'est construite pour cette personne, `mouth_unfed` constate `not_named`, et tout le foyer est refusé. Le reproduire dans le vrai handler à transport contrôlé avant correction. Distinguer **âge inconnu**, **mineur connu** et **autre protection** : le test d'un seul de ces états ne prouve pas les deux autres.

### 1.2 Séparer trois décisions actuellement confondues

Tracer, pour la personne concernée :

1. Est-elle attendue à ce repas ?
2. Le moteur peut-il calculer une cible et adapter sa part numériquement ?
3. Quels chiffres peuvent être affichés ou attribués à cette personne ?

L'abstention à la deuxième question ne doit pas signifier « cette personne ne mange pas ». Un contenant nominatif peut servir à organiser le foyer ; sa présence ne prouve pas qu'une cible de poids ou un affichage chiffré soit autorisé.

Points à examiner :

- `portion_sizing.ts` : `dayTargetFor`, lecture des lignes `sized`, construction des contenants et compteurs `tubs_authored` / `eaters_unsized`.
- `generate-household-meal-v1/index.ts` : contrat par personne, `perMouth`, branche `dayTargetFor(...).kcal === null`, `platedMembers`, `weighedPortionMembers`, création des contenants, contrôle `mouth_unfed` et sérialisation.
- `slot_nutrition_contract.ts`, `mouth_anchor.ts`, `meal_envelope.ts`, `energy_gate.ts` : états d'abstention et voie existante de portions sans objectif numérique.
- Lecteurs des portions dans `frontend/src/keel/api/mealGeneration.ts`, du brouillon dans `planDraft.ts` et des écrans de plan : affichage final, pas seulement états backend.

### 1.3 Comportement à implémenter

Réutiliser la voie existante de portion de recette lorsque la personnalisation énergétique est indisponible ou protégée. Si son raccordement manque, le compléter explicitement : une part identifiable et des ingrédients/uses valides, sans cible personnelle inventée. Les quantités nécessaires pour cuisiner et la cible nutritionnelle de la personne sont deux données différentes.

- Ne pas attribuer un âge adulte par défaut pour forcer une équation, ni copier les calories/grammes du maître ou d'un voisin.
- Ne pas débloquer `count_calories`, une cible de perte/prise ou un plancher protéique interdit par les portes existantes.
- Ne pas remplacer une cible inconnue par zéro. Conserver un motif d'abstention typé et le rendre observable dans les traces internes.
- La part non personnalisée doit participer aux quantités à cuisiner, aux utilisations des préparations et aux achats. Elle ne peut pas être seulement un nom ajouté à un contenant vide.
- Si un contrat énergétique n'est pas applicable, son contrôle n'est pas un succès ni un échec calorique : il est non applicable avec raison. Les contrôles de présence, ingrédients, références, quantités de lots et sécurité restent actifs.
- Si la recette elle-même est inutilisable ou dangereuse, garder le refus légitime ; ne pas désarmer `mouth_unfed` globalement.

Si la voie qualitative existante ne permet pas de construire une part cohérente, documenter le maillon manquant et l'implémenter dans cette voie. Ne pas inventer un barème d'âge ou un objectif énergétique pour combler ce manque.

### 1.4 Tests et sortie du lot

| Cas | Résultat attendu |
|---|---|
| N=4, âge inconnu pour un seul secondaire | Une part réelle pour chaque personne attendue ; aucun refus causé seulement par une cible absente ; aucune cible inventée. |
| N=4, membre en maintien | Part et affichage conformes à sa politique ; aucun passage forcé à perte/prise ; autres personnes inchangées. |
| Mineur connu, puis protection existante | Branche et chiffres autorisés conformes aux portes de production ; aucune généralisation du cas d'âge inconnu. |
| Présences différentes selon le créneau | Part uniquement aux moments demandés ; aucun membre perdu dans l'union de la grille. |
| Part réellement absente ou recette dangereuse | Refus conservé ; ancien plan intact. |
| Lecture API/UI | La bonne personne voit sa part ; aucune cible ou indication chiffrée interdite ne fuit par les notes, l'explication ou le brouillon. |

Mesurer les quantités de la recette et des lots après ajout de la part ; vérifier l'absence de double comptage. **Lot terminé seulement après relecture de la sortie du handler**, pas lorsqu'un compteur de contenants devient non nul.

## Lot 2 — Terminer les parcours locaux et corriger la chaîne du premier jet

### 2.1 Isolation d'une préparation partagée jusqu'à adoption

Partir de la référence N=4 validée, avec un lot utilisé par plusieurs personnes sur plusieurs repas. Introduire un besoin de variante pour une seule personne. Le banc doit pouvoir fournir un patch explicite créant un nouveau lot et rattachant les seules unités autorisées à ce lot. « Le banc ne sait pas forker » désigne du travail à faire dans le banc, pas une impossibilité du produit.

Vérifier après toute la finalisation :

- nouvelle préparation parsée et appliquée ; `cook_on` placé sur une session autorisée ; références de session et de recette cohérentes ;
- ancienne préparation conservée pour ses autres consommateurs ; aucune quantité de ceux-ci réattribuée à la personne isolée ;
- production, prélèvements et éventuels restes cohérents ; ingrédients et achats reconstruits ; stock soustrait une seule fois ;
- portion de la personne corrigée, toutes les autres portions auparavant conformes toujours conformes ;
- verdict **adopt**, plan écrit et relu. Une création dans une candidate ensuite rejetée ne satisfait pas ce cas.

Points d'entrée : `plan_repair_patch.ts`, `patchPreparationPayloads`, `fusedSourceText`, graphe de `uses`, sessions, `judgeCandidate` et banc de transport. Respecter le schéma existant : l'opération de session modifie son texte, pas arbitrairement son calendrier. Si la création d'un lot exige une mise à jour dérivée de ses références de session, la faire côté serveur et la valider.

### 2.2 Complément sans double portion

Construire un cas faisable N=4 où une personne conserve une part du plat commun et reçoit un complément ; les trois autres gardent leurs portions. Garder les contrats de production figés.

Vérifier numériquement, avec les lecteurs de production :

```text
énergie réellement servie à la personne = part commune + complément
quantité prélevée du lot commun = somme des parts communes réellement servies
```

Contrôler la masse et la densité selon le contrat existant du repas composé ; ne pas exiger arbitrairement que chaque élément du repas remplisse à lui seul toute la cible du créneau. Vérifier `complementsShared`, `splitPlateWithComplement`, l'arrondi entier, les courses et le rendu commun + complément. Le test doit atteindre une candidate adoptée, sans doubler la part commune ni la cible.

### 2.3 Forcer une vraie panne de validation

Ne pas s'arrêter au test pur `candidateStateOf(null)`. Exercer le passage où la validation lève une exception, son `catch`, puis la décision de publication du handler.

Employer un point d'injection local de dépendance dans le harnais ou extraire le bloc d'orchestration minimal avec sa fonction de validation passée comme dépendance ; la production lui transmet toujours le vrai validateur. Aucun drapeau HTTP, secret ou variable de production permettant de désactiver le contrôle.

Cas attendus : génération et brouillon ; avant une réparation et après une candidate ; ancien plan déjà actif. L'exception doit conduire au refus technique et à zéro nouvelle activation/publication. Vérifier les écritures capturées et la relecture de l'ancien plan, pas seulement la chaîne du motif. Une erreur de journalisation ne doit pas être confondue avec une panne du validateur.

### 2.4 Protéines : auditer ce qui existe avant de changer le prompt

Le brief initial **existe déjà** dans `plan_protein_brief.ts`. Le handler construit `proteinBriefByMember` avec `proteinBriefFor`, `proteinFloorAllocation`, les enveloppes et les contrats. Ne pas créer une seconde fonction de calcul ou une nouvelle constante g/kg.

Sur le premier jet réel N=2 archivé et les personnes concernées, produire une table d'enquête :

| Étape | Donnée à relever |
|---|---|
| Calcul amont | Plancher applicable, part de journée couverte, apports fixes et plancher restant à composer, par personne/date. |
| Message réellement envoyé | Présence de ces informations, identité de personne et échelle de quantité — portion standard ou lot entier. |
| Réponse brute | Ingrédients, quantités, états et références permettant d'estimer la protéine avant finalisation. |
| Finalisation | Quantités après adaptation et arrondi, distribution des lots/parts, protéines servies par personne. |
| Contrôle final | Plancher utilisé, valeur mesurée, cause et écart. Vérifier l'égalité des entrées avec le calcul amont. |

Classer chaque manque : donnée absente du prompt, cible ambiguë ou contradictoire, ingrédients insuffisants dans la réponse, quantité/référence perdue au parsing, effet de la finalisation, ou mesure erronée. Une consigne présente n'est pas une preuve que le modèle l'a satisfaite ; un déficit final n'est pas une preuve qu'il avait reçu la bonne consigne.

Corriger le premier maillon fautif reproduit. Si le problème est bien la composition de la réponse, préciser dans le brief existant la contrainte protéique de la **part servie**, conjointement aux calories, à la masse et à la densité. Ne pas imposer que toute préparation partagée ait la valeur personnelle de chaque consommateur. Ne pas augmenter mécaniquement viande ou volume, ni abaisser le plancher pour faire passer le cas.

Faire les tests de cohérence du brief et du contrôle pour N=1/N=2/N=4, apports fixes connus/inconnus, journée partielle, part collective estimée et personne protégée. Une nouvelle rédaction du prompt peut être validée localement comme cohérente ; son effet sur un **nouveau premier jet du modèle** reste non mesuré tant qu'aucun nouveau premier jet n'est payé. Ne pas confondre les deux preuves.

### 2.5 Finir l'audit du schéma et du transport avant les deux derniers appels

Vérifier les corrections récemment ajoutées : schéma complet d'ingrédient (`amount`, `unit`, état, référence), parsing des unités et préparations, routage des replis fournisseur et budget.

- Toute quantité numérique requise doit être exploitable ; champ présent avec `null` ne doit pas être compté comme une quantité mesurée. Conserver les exceptions de condiments déjà autorisées, sans les étendre aux aliments énergétiques.
- Un tableau `units` contenant une chaîne est un JSON potentiellement syntaxiquement valide mais une réponse **non conforme au schéma**. Garder le rejet atomique ; ne pas supprimer la chaîne puis prétendre avoir accepté un patch complet.
- Une quantité ou une référence perdue ne doit pas produire une portion apparemment conforme mesurée sur un sous-ensemble des ingrédients.
- Tester le repli fournisseur avec une réponse contrôlée : même demande de réparation, bonne origine de réponse, aucune conserve de remplissage injectée à sa place. Les appels auxiliaires sont identifiés comme auxiliaires, pas par une supposition fragile sur le seul nom du modèle.
- Un repli ou un réessai peut être un appel facturé supplémentaire. Le compteur de campagne doit les observer au transport ; aucune tentative cachée au-delà des deux disponibles.

Rejouer les réponses problématiques déjà archivées gratuitement. Ces rejeux prouvent le comportement du parseur, de la finalisation et du banc ; ils ne prouvent pas que le nouveau prompt fera produire une meilleure réponse.

### 2.6 Sortie du lot 2

Tous les parcours locaux ci-dessus doivent être verts avec preuves liées : isolation adoptée, complément mesuré, panne de validation réellement exécutée, brief protéique cohérent avec la garde, schéma/transport éprouvés. Relancer les références N=1/N=2/N=4 et la variante de présences ; conserver les distinctions entre contrats numériques applicables et portions protégées.

Utiliser `banc-lot-F.ts`, `transport-lot-F.ts` et les références de `scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/`. Étendre les réponses contrôlées pour les cas manquants. Une fixture construite pour éprouver le code est légitime si elle est déclarée comme telle, validée indépendamment par le moteur et figée avant injection du défaut.

## Lot 3 — Deux réparations réelles, puis un verdict fondé sur les preuves

### 3.1 Préparation et affectation du budget

**Aucune nouvelle génération initiale payante dans ce plan. Deux appels réels de réparation restants au total.** Les premiers jets réels N=1/N=2/N=4 et les références valides existent déjà : les réutiliser, en indiquant toujours leur origine et les modifications de test éventuelles.

Préparer deux parcours hybrides dont les versions contrôlées ont déjà réussi :

- **N=2 :** un défaut protéique précisément attribué et faisable à calories/grammes compatibles ; mesurer l'amélioration attendue et les autres portions à préserver.
- **N=4 :** un défaut local sur une recette/portion ayant des dépendances partagées, avec le choix d'isolation ou de complément déjà prouvé au lot 2. Ne pas utiliser comme seul cas un ancien plan solo inadapté à quatre personnes.

Un appel réel prévu par parcours, séquentiellement. Conserver le plafond de deux réparations du handler, mais plafonner le transport payant au budget effectivement affecté. Toute réponse contrôlée servie après ce plafond reste étiquetée comme telle et ne peut pas compléter artificiellement la preuve du modèle.

### 3.2 Ne pas répéter le parcours à 352 secondes

Avant de payer, vérifier dans le banc les bornes effectives du transport, les réessais/replis et la réserve nécessaire à la finalisation/écriture. Conserver les limites de production ; ne pas relever un timeout ou supposer qu'un appel interrompu n'est pas facturé.

Lancer le second parcours uniquement après inspection du premier : bonne requête, schéma actuel, provenance correcte de la réponse et budget restant exact. Si le premier révèle une erreur de banc ou de contrat, la reproduire et la corriger hors ligne avant de dépenser le dernier appel.

Un dépassement de durée ou un repli technique est publié comme tel. Ne pas conclure sur le moteur culinaire à partir d'une réponse que le fournisseur n'a jamais produite ; ne pas annoncer une réussite opérationnelle à partir d'un traitement qui dépasserait les contraintes de la voie utilisateur.

### 3.3 Ce qui constitue une réparation utile

Archiver les messages exacts et la réponse brute, puis prouver successivement :

1. réponse de patch valide et attribuable à la bonne version ;
2. application atomique des seules opérations autorisées ;
3. finalisation et mesure de tous les consommateurs affectés ;
4. défaut ciblé corrigé ou amélioration précisément admise par la politique existante, sans nouvelle perte de portion, violation de sécurité ou régression d'une portion auparavant conforme ;
5. candidate adoptée, données retenues sérialisées puis relues, bonne personne au bon créneau.

Publier séparément « amélioration adoptée avec écarts restants » et « toutes les contraintes applicables satisfaites ». Un patch correct en syntaxe, un HTTP 200 ou le retour à l'ancien plan ne suffit pas à démontrer une réparation utile.

Si les deux appels ne fournissent pas cette preuve, conserver les corrections de code validées et laisser **réparation réelle à plusieurs : non validée**, avec stade exact d'échec. Aucun nouvel appel, changement de modèle ou élargissement de seuil automatique.

## Vérifications et livrable final

Pendant chaque lot : tests ciblés des fonctions modifiées et tests de comportement du handler via le harnais. À la fin : `deno check` du handler, tests de mesure, tests API/UI concernés, puis `scripts/agent-gate.sh` selon le fonctionnement actuel du dépôt. Ne pas répéter une suite déjà passée sans changement nouveau et ne pas modifier les listes de rouges tolérés pour accepter une régression du chantier.

Écrire `docs/keel/RAPPORT-RESTE-A-FERMER-FOYER-2026-09-13.md`, avec l'état de chaque exigence et les liens vers les preuves. Mettre à jour brièvement `docs/SOCLE.md` pour le comportement réellement implémenté.

Le rapport doit donner quatre conclusions distinctes :

| Question | Preuve attendue |
|---|---|
| Le code nourrit-il le foyer avec un âge inconnu, en respectant les protections ? | Parcours complet N=4, portions présentes et affichage conforme. |
| Isolation, complément et panne de validation fonctionnent-ils ? | Cas contrôlés menés jusqu'à adoption/relecture ou refus sans publication. |
| Le brief et les contrôles protéiques sont-ils cohérents ? | Traçabilité par personne/date, tests d'égalité des entrées et limites reconnues des anciens premiers jets. |
| Le modèle sait-il réparer utilement à plusieurs dans la version actuelle ? | Résultats des deux derniers appels, sans les confondre avec les réponses contrôlées. |

Pour chaque mesure, distinguer : cible applicable ou non ; portion pesée ou part collective estimée ; calories/masse/densité et protéines ; résultat avant/après finalisation ; premier jet ou réparation ; réponse réelle ou contrôlée. Les contrôles non applicables ne deviennent ni des échecs artificiels ni des succès numériques.

Ne pas annoncer « tout est terminé » parce que le gate passe. La clôture fonctionnelle doit être prouvée, et les limites empiriques du modèle restent nommées même si le code est corrigé.
