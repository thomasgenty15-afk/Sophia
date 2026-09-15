# Fermer les défauts restants — consignes pour Opus

## Mandat et limites

Corriger les défauts identifiés, puis les vérifier sur les réponses enregistrées et les fonctions de production. Trois lots, dans cet ordre. Ne pas relancer de génération ni de réparation payante dans ce chantier. Ne pas déployer, modifier les secrets ou écrire dans les données réelles. Respecter AGENTS.md ; préserver les changements des autres agents.

Conserver la lane foyer unique, y compris à une personne, et la génération par le compte maître uniquement. Conserver les protections, les tolérances actuelles, les grammages finaux arrondis et les références alimentaires canoniques. Ne pas abaisser les objectifs pour faire passer les tests. Les extras hors plan restent exclus ; un complément explicitement prévu dans le plan est une composante du repas, pas le retour des extras.

Ne pas considérer un compteur ajouté, un HTTP 200 ou une ancienne version restaurée comme une réparation réussie. Ne pas attribuer une panne au modèle avant de localiser sa première apparition dans la chaîne.

## Lot 1 — Corriger la réparation à partir des deux réponses déjà payées

### 1.1 Figer et rejouer les preuves

Lire `RAPPORT-RESTE-A-FERMER-FOYER-2026-09-13.md`, notamment § 4 et § 6. Archiver comme fixtures les entrées, prompts et réponses exacts des deux appels, avec leurs empreintes. Les artefacts de départ sont dans `scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/` :

- `gain-lot3b-2026-09-13T17-00-55-236Z.json` et `.prompts.txt` : N=2, huile injectée aux deux petits-déjeuners.
- `perte-lot3a-2026-09-13T17-00-38-299Z.json` et `.prompts.txt` : N=4, préparation partagée. Retrouver aussi le rejeu après correction de l'adresse plat/complément ; distinguer l'échec d'adresse initial de l'échec après fusion.

Faire passer ces réponses dans le vrai parseur, la vraie fusion et la vraie finalisation, au moyen du transport contrôlé existant. Aucun substitut silencieux si une fixture manque. Garder séparés les réponses fournisseur originales, les patches corrigés à la main pour tester une hypothèse et les fixtures synthétiques.

### 1.2 Corriger d'abord l'attribution de la cause

Sur N=2, le prompt ordonne explicitement la création de U2, U3, U7 et U8 : `must be written from nothing`. Il demande aussi quatre accompagnements via `dedicatedDishLine`. La création de ces unités n'est donc pas une initiative non autorisée du modèle.

Examiner `plan_repair_patch.ts:repairPatchScopeLines`, `portion_sizing.ts:dedicatedDishInstruction` / `dedicatedDishLine`, la construction de `RepairScope`, des unités réservées et du contexte envoyé. Retrouver le premier calcul qui transforme une recette trop dense en obligation de créer quatre compléments.

Pour chaque repas affecté, relever successivement :

1. Plan avant réparation : personnes attendues, plats/compléments, recettes, préparations et consommateurs, calories, grammes, densité, cibles, bornes et défauts.
2. Décision et prompt : action demandée, unités modifiables/créables, préparations modifiables, consommateurs à préserver et raison de chaque création.
3. Réponse brute puis objet parsé : mêmes identifiants, ingrédients et quantités ; signaler exactement toute donnée perdue ou transformée.
4. Plan fusionné avant dimensionnement, puis après les étapes qui modifient recettes, parts et quantités, puis plan validé et sérialisé.

Localiser la première disparition de chacun des six repas N=2 et des neuf repas N=4 signalés dans le rapport. Distinguer un plat réellement absent d'une part non attribuée ou d'un contrôle qui ne reconnaît plus son adresse. Détailler les causes de `safety_added` ; ce nombre ne désigne pas nécessairement des allergènes.

### 1.3 Corriger la décision, pas seulement sa formulation

Produire une décision cohérente par unité partagée : recomposer la recette commune, isoler une variante, ou ajouter un complément. Ne pas envoyer simultanément « conserve ces préparations » et « réécris-les », ni obliger à ajouter un accompagnement uniquement parce qu'une réservation technique existe.

Si tous les consommateurs concernés peuvent conserver une recette commune, vérifier d'abord cette option avec leurs contrats et restrictions. L'intersection de leurs couloirs de densité est un premier contrôle de faisabilité, pas une preuve suffisante : protéines, ingrédients autorisés et quantités doivent aussi passer. Une recette commune validée sur une fixture démontre la faisabilité du cas ; elle ne prouve pas qu'un futur appel la produira.

Réserver le complément ou l'isolation aux situations qui en ont besoin, en traçant pourquoi la recomposition commune n'a pas été retenue. Distinguer une création autorisée d'une création requise dans le contrat et le texte. Ne pas simplement supprimer toutes les créations : une part réellement absente doit encore pouvoir être créée.

Le modèle compose les proportions et les ingrédients ; le moteur dimensionne la part servie. Les consignes doivent permettre une baisse de densité qui augmente les grammes servis à calories constantes, sans confondre poids de la recette et poids de la part.

Corriger ensuite les pertes constatées dans le parseur, la fusion ou la finalisation si le rejeu en démontre. Une réponse intrinsèquement incorrecte doit rester rejetée : aucun assouplissement du validateur pour adopter les deux réponses à tout prix.

### Acceptation du lot 1

- Cause documentée de chaque repas manquant et de chaque refus ajouté, avec l'étape et les données avant/après.
- N=2 : une recomposition commune compatible ne force pas quatre créations ; test du contexte complet réellement envoyé, pas seulement d'une fonction de texte.
- N=4 : tous les consommateurs d'une préparation modifiée sont remesurés ; références, parts, cuisine et courses restent cohérentes.
- Un candidat valide est adopté ; un candidat invalide est rejeté sans altérer la meilleure version. Les deux comportements traversent la finalisation de production.
- Rapport antérieur corrigé : retirer l'affirmation selon laquelle créer ces quatre unités prouverait un élargissement spontané du modèle.

## Lot 2 — Fermer les défauts fonctionnels déjà reconnus

### 2.1 Personne seule sans cible

Dans `portion_sizing.ts`, rapprocher la voie multi-personnes utilisant `recipeShareReasonFor` de `applySizing`, qui conserve le retour anticipé `if (!row || !row.sized)`. Corriger également les données passées par le handler si nécessaire ; ne pas faire de « non dimensionné » un synonyme automatique de « part qualitative valide ».

Une personne attendue sans cible autorisée reçoit une part de recette selon la règle existante ; sa part participe à la cuisine et aux courses. Une recette illisible ou dangereuse reste refusée. Ne pas inventer d'âge, de cible ou de quantité pour lever le refus. L'absence de cible reste « non applicable » pour les contrôles numériques concernés.

Tester N=1, N=2 et N=4, dont âge inconnu, âge connu, recette non mesurable et part réellement absente. Pour le profil sans date de naissance, utiliser un chargeur contrôlé ou une fixture du handler : aucun UPDATE réel n'est nécessaire. Vérifier aussi l'affichage protégé dans la réponse.

### 2.2 Variante de régime qui arrive réellement dans l'assiette

Suivre, dans `generate-household-meal-v1/index.ts`, `dishBearingMembers`, la grille des plats dédiés, `v34DishBearers`, le prompt, le parseur, puis le remplacement des boîtes par le dimensionnement `portion_v1`.

Établir une décision commune de qui reçoit quel plat, réutilisée par ces étapes. Conserver les règles produit déjà établies ; ne pas ouvrir arbitrairement un plat dédié à chaque personne. Une recette commune compatible peut suffire. Si les règles accordent une variante, elle doit être enseignée, parsée, conservée et servie à la bonne personne. Un compteur « promis mais non enseigné » ne clôture pas le défaut.

Tester une personne végane dans un foyer omnivore, puis un foyer à quatre avec présences différentes. Vérifier les ingrédients finaux, les protéines selon le contrat réel, l'attribution des portions et les quantités communes. Vérifier qu'une adaptation ne modifie pas les autres personnes de manière incompatible.

### 2.3 Contrat protéique identique dans le produit et le banc

`scripts/2026-09-11-mesure-grille.ts` fournit `latestWeight` alors que le chemin de production d'une personne sans compte ne le fournit pas. Reconstituer les mêmes données et appeler les mêmes règles de production ; ne pas simplement remplacer 116 par 93 ou choisir le seuil le plus facile.

Épingler le cas Lea et comparer les entrées, la branche de calcul, la cible journalière et sa distribution. Toute absence légitime de cible reste explicite. Si le calcul produit est lui-même incorrect, le démontrer séparément ; ce chantier ne change pas les barèmes nutritionnels par opportunité.

### 2.4 Complément : les bornes concernent le repas total

Rejouer le cas du rapport § 3.2 dans `splitPlateWithComplement`, puis `portion_boundary.ts:fitPortionsToBounds` et ses appelants. Le repas est la somme de la part commune et du complément. Ne pas réappliquer indépendamment à la part commune le minimum qui concerne leur somme.

Conserver les limites propres à un composant lorsqu'elles existent et sont justifiées par son contrat. Après arrondi et toutes les corrections, remesurer le total réellement servi : calories, grammes et protéines. Ne pas déduire la conformité des valeurs avant arrondi, ni faire compter un composant deux fois.

Tests : cas 216 g + 9 g du rapport, complément dense, complément léger, ingrédient non mesurable, limite après arrondi et repas partagé. Les contraintes doivent être satisfaites simultanément selon les tolérances actuelles, ou le résultat rester explicitement non conforme.

### Acceptation du lot 2

Aucune part perdue dans le foyer à une personne sans cible ; aucun écart de régime masqué par le retaillage ; mêmes contrats dans le banc et le produit ; pas de remontée artificielle de la part commune lorsqu'un repas complété respecte déjà ses bornes.

## Lot 3 — Prouver la fermeture sans nouvelle dépense

Étendre le banc existant avec les fixtures précédentes plutôt que construire une nouvelle chaîne de calcul. Exécuter le handler avec ses dépendances externes contrôlées, sa validation réelle et des écritures capturées. Pour la panne de validation, provoquer une exception dans le validateur appelé par le handler et constater zéro publication ; distinguer cette panne d'une panne de journalisation.

La matrice minimale réutilise :

- Les références N=1, N=2, N=4 sans défaut injecté : aucune réparation, aucune régression.
- Les deux réponses fournisseur conservées : étapes de transformation observables et verdict expliqué ; adoption seulement si le résultat final est conforme.
- N=2 trop dense, avec candidat commun valide contrôlé : réparation utile sans compléments inutiles.
- N=4 avec préparation partagée et isolation nécessaire : adoption, consommateurs et courses vérifiés.
- Variante de régime, personne sans âge connu, complément, erreur de validation et candidat dangereux.

Pour chaque cas, fournir une ligne contenant : source de la réponse (réelle enregistrée/synthétique), personnes et créneaux attendus, défauts avant/après, unités demandées/créées, parts présentes, contrôles applicables/non applicables, verdict, statut réellement livré et publication ou absence de publication. Les comptes se font par personne et créneau, en additionnant les composantes de son repas.

Exécuter les tests des modules modifiés et du banc, `deno check` du handler, puis `scripts/agent-gate.sh` selon les instructions du dépôt. Ne pas modifier les listes de tests tolérés pour obtenir un feu vert. Rapporter les échecs préexistants séparément.

Mettre à jour `docs/SOCLE.md` uniquement sur les comportements effectivement changés et vérifiés. Produire un rapport final court, avec chaque exigence reliée à son test ou artefact.

### Critère de clôture et limite de preuve

« Correctifs vérifiés hors ligne » exige la fermeture des défauts ci-dessus et le passage de la matrice. Un rejeu de réponse réelle prouve le traitement de cette réponse ; une réponse synthétique prouve un chemin technique ; aucun des deux ne prouve que le nouveau prompt améliore les futurs premiers jets.

Ne pas écrire « génération fiable » ou « réparation réelle validée avec le nouveau prompt » sans essai correspondant. Préparer, sans les lancer, deux validations réelles ciblées N=2 et N=4, avec coût/temps estimés et limite explicite d'appels pour une autorisation distincte. Réutiliser les plans existants si l'objectif est seulement de tester la réparation. Évaluer le premier jet constitue une preuve séparée.
