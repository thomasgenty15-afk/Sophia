# Fermer les défauts restants de génération — foyers de 1, 2 et 4 personnes

Plan d'exécution pour l'agent, fondé sur le code relu le 2026-09-13 et sur `REVUE-FERMETURE-TROIS-LOTS-2026-09-12.md`. Les trois défauts de cette revue sont toujours présents. **Trois lots, dans l'ordre 1 → 2 → 3.** Ce document décrit du travail à réaliser ; il ne constitue pas un rapport de tests réussis.

## Résultat attendu et périmètre

Le compte maître génère le plan de tout le foyer, y compris lorsqu'il est seul. Une correction doit conserver les repas sains, respecter les contrats de chaque personne et permettre de réparer une instruction de cuisine sans recomposer toutes les recettes.

Conserver les décisions déjà prises :

- Une seule lane foyer, aucune nouvelle lane solo. Les membres secondaires ne peuvent pas générer : un appel direct non autorisé doit rester refusé.
- Conserver les équations, les contrats calories/masse/densité par personne-date-créneau, les apports fixes explicites, les préférences et les protections existantes. Ne pas réintroduire les forfaits pain/fromage/dessert.
- Conserver le dimensionnement et l'arrondi aux quantités entières existants, les proportions culinaires et les contrôles des préparations partagées. Ne pas augmenter les tolérances pour faire passer les tests.
- Deux appels de réparation du plan au maximum **par demande du foyer**, erreurs et réponses rejetées comprises. Ce plafond ne se multiplie ni par personne, ni par créneau, ni par session de cuisine. Conserver la configuration fournisseur et les réglages fast existants.
- Après épuisement : meilleure version sûre et complète, écarts nutritionnels visibles selon la politique actuelle. Une portion obligatoire manquante, une violation de sécurité ou une validation indisponible empêchent l'activation ; l'ancien plan valide reste intact. Appliquer aussi les protections à l'aperçu.
- Aucun chantier 546, migration ou changement de barème dans ces lots. Respecter `AGENTS.md` : les commandes de déploiement, db push/reset et secrets restent à l'humain. Ne pas réinitialiser le dépôt partagé ni les données pour préparer un test.

Avant les modifications, relever les fichiers déjà modifiés et figer les entrées des scénarios : corps, objectifs, préférences, contraintes, personnes attendues par créneau, horloge et référentiel. Ne pas réutiliser une fiche utilisateur qui change entre deux mesures sans archiver ce changement.

## Lot 1 — Contrôler les textes de cuisine pour tout le foyer

### 1.1 Reproduire le défaut avant de le corriger

Dans `supabase/functions/_shared/keel/meal_generation_test.ts`, reprendre la sonde de la revue : préparation valide de **deux portions**, plat qui la référence, session qui référence cette préparation, contrainte `peanut` médicale. Une préparation d'une portion peut être rejetée par le parseur et rendrait cette sonde sans valeur.

Mettre « Ajouter du beurre de cacahuète au riz. » uniquement dans `cooking_sessions[].run_through`. Avant correctif, le texte et la session survivent sans `unsafe_candidate`. Le même texte dans `dishes[].method` est déjà bloqué. Garder les deux cas, plus le témoin anglais. **Ne pas modifier le lexique d'allergènes pour réparer une omission de champ.**

### 1.2 Utiliser les mêmes surfaces au contrôle initial et final

Points actuels :

- `meal_generation.ts` : `UnsafeViolation`, `localizeOutputLockBites`, concaténation `rendered` dans `parseGeneratedMeal`, construction de `unsafe_candidate`.
- `generate-household-meal-v1/index.ts` : adoption interne de `unsafe_candidate`, `c4LockBites`, `c4UpstreamDefects`, refus `output_lock_violation` avant publication.
- `final_plan_gate.ts` : `GateSession` ne contient actuellement que jour et identifiants de préparations ; cette garde ne remplace pas un contrôle du déroulé.

Introduire une collecte commune, pure et typée des surfaces à contrôler, réutilisée par les deux passages. Ajouter les sessions avec `runThrough` et leurs références de préparations. Conserver le détecteur de production `applyKeelOutputLocks` ; ne pas coder un second matcher.

Faire l'inventaire des autres textes effectivement livrés : nom/titre/méthode/justification des plats, méthodes des préparations, termes d'ingrédients et de contenants, notes de portion, explications et courses. Utiliser notamment `MEAL_TRANSLATABLE_FIELDS` pour repérer les champs ; vérifier les lecteurs API/UI pour distinguer champs visibles et contexte interne. Couvrir les champs visibles oubliés par la même collecte, sans analyser comme sortie le prompt interne qui énumère légitimement les exclusions.

Le contrôle final doit lire la version fusionnée réellement sérialisée après les transformations de texte. Vérifier qu'aucune mutation ultérieure d'une surface visible n'échappe à ce contrôle. Une erreur de collecte/validation doit produire un état indisponible bloquant, jamais une liste vide interprétée comme sûre.

### 1.3 Localiser sans attribuer arbitrairement à une personne

Étendre `UnsafeViolation` avec une identité de surface structurée et, pour une session, ses préparations liées. Une session n'est pas un repas : ne pas lui inventer `slot: dinner` pour satisfaire `repairScopeOf`.

Pour une préparation partagée, suivre toutes ses utilisations sur toutes les dates et identifier ses consommateurs. Pour une session partagée, conserver l'adresse de la session et les consommateurs potentiellement concernés par les préparations liées. Si la portée exacte du texte est ambiguë, contrôler l'ensemble concerné ; ne pas sélectionner le premier membre rencontré.

Conserver la politique actuelle des contraintes individuelles et de maison. Une allergie individuelle ne devient pas une nouvelle interdiction globale inventée par ce chantier ; une règle de maison existante ne doit pas être affaiblie. Une préparation commune servie à une personne incompatible reste bloquante.

À ce lot, une session dangereuse doit au minimum empêcher aperçu publiable et activation. Son chemin de réparation ciblée est obligatoire dans le lot 2. Ne pas consommer une tentative annoncée comme réparable si aucun objet adressable ne part au modèle.

### 1.4 Tests de sortie du lot 1

- Français accentué/non accentué et anglais reconnus aux emplacements réellement contrôlés ; cas négatif légitime conservant les règles de négation existantes.
- Allergène uniquement dans le déroulé, dans un nom affiché, dans une méthode de préparation et dans une note réellement livrée : blocage à chaque surface, adresse identifiable.
- Foyer de deux puis quatre personnes : violation uniquement dans une session commune ou un lot partagé ; tous les consommateurs concernés sont retrouvés, aucune attribution arbitraire au maître.
- Une version interne non publiable conserve les recettes nécessaires à la réparation ; ces données ne sont pas renvoyées dans une réponse publique d'erreur.
- La violation persistante bloque aussi lorsque le budget modèle est épuisé ou que la validation a échoué. Les preuves d'absence d'écriture par le vrai handler seront exécutées au lot 3.

**Lot 1 terminé :** les surfaces ciblées par les tests passent réellement par le contrôle initial et final. Une alerte simplement ajoutée aux logs ne remplit pas ce critère.

## Lot 2 — Un patch cohérent, ciblé et applicable entièrement

### 2.1 Un seul format demandé au modèle

Dans `index.ts`, l'appel `final_repair` utilise toujours `built.systemPrompt + household.systemSuffix`. `MEAL_SYSTEM_PROMPT` demande un plan complet, alors que `repairPatchContractLines` exige un patch. Corriger **les deux messages transmis**, pas uniquement une phrase de la projection.

Créer un constructeur de messages de réparation, par exemple `plan_repair_prompt.ts`, en réutilisant des blocs communs explicites : méthode du coach, conventions CIQUAL/cru-cuit, structure culinaire, contraintes par personne, langue, contrats utiles et contexte de la meilleure candidate. Séparer proprement règles métier communes et schéma de génération. Éviter une suppression par expression régulière de morceaux du prompt monolithique.

Le message système de réparation porte un seul schéma de sortie. Le message utilisateur porte demande, état courant, périmètre autorisé, contrats de chaque personne affectée, écarts mesurés et raison du précédent rejet. Ne pas réinjecter le brief initial contenant des ordres incompatibles tels que « couvrir tous les jours dans cette réponse ».

Préserver le format du premier jet et celui de l'API publique. Préserver dans le contexte les ingrédients, états, quantités et références utiles des lots partagés ; le modèle doit pouvoir prévoir l'effet d'une modification sur les autres consommateurs. Si le contexte indispensable ne tient pas, produire un motif explicite avant l'appel plutôt que retirer silencieusement des personnes.

### 2.2 Permettre une correction de session sans réécrire les repas

Étendre le contrat interne de patch, avec version de contrat mise à jour, par une opération bornée :

```json
{
  "repair": {
    "base_version": "version annoncée par le serveur",
    "units": [],
    "preparations": [],
    "sessions": [
      { "session_id": "S1", "run_through": "Déroulé corrigé et cohérent avec les recettes." }
    ]
  }
}
```

`sessions` est une extension interne proposée, absente du contrat actuel. Les identifiants sont attribués par le serveur et liés à la table de la meilleure candidate annoncée dans `base_version`. Une adresse reste immuable pendant une tentative ; ne pas promettre que `S1` ou `U1` garde son sens entre deux versions si les tables sont reconstruites.

Le modèle peut remplacer le déroulé des seules sessions autorisées. Il ne peut pas déplacer leur jour, changer leurs références de préparations, créer/supprimer une session ou modifier les durées par cette opération. Le nouveau texte doit décrire les recettes réellement conservées, sans ajouter une consigne alimentaire incompatible. Une session contenant plusieurs préparations peut être corrigée comme texte complet, sans donner le droit de modifier tous les repas associés.

Adapter le transport de cette adresse dans les défauts, `repairScopeOf`, la projection, `planRepairMessage`, le lecteur et l'application de patch. Le garde de contexte actuellement limité à `unitIds`/`preparationIds` doit accepter un périmètre composé seulement de sessions. Une réparation de session seule doit réellement partir et être appliquée.

Fichiers concernés : `plan_repair_loop.ts`, `plan_repair_context.ts`, `plan_repair_patch.ts`, les types nécessaires de `meal_generation.ts` et le handler. Éviter une nouvelle boucle spécialisée pour les textes.

Mettre à jour `fusedSourceText` et la sérialisation des sessions : le déroulé corrigé doit se retrouver dans le plan fusionné, sa source canonique, l'aperçu et les lecteurs API/UI. Un retour à la meilleure candidate restaure aussi les sessions et leur texte. Une violation de sécurité persistante ne devient pas acceptable parce qu'un autre défaut a disparu.

### 2.3 Rendre l'application atomique sans interdire les omissions légitimes

Dans `parseRepairPatch`, `patchDishPayloads` et `applyRepairPatch`, distinguer :

- Tableau d'opérations racine omis ou vide : aucune modification de cette famille. Un patch entièrement vide n'est pas une réparation appliquée.
- Opération explicitement fournie mais invalide : rejet du patch entier.
- Champs d'une recette renvoyée : conserver les conventions du parseur, mais définir ses champs obligatoires dans le schéma et rejeter la perte structurelle d'une opération. Ne pas interpréter une opération rejetée par le parseur comme une omission volontaire du modèle.

Fermer précisément les passages actuels : erreurs d'enveloppe ignorées lorsqu'une unité valide subsiste ; entrées sans identifiant sautées ; objets écartés par `patchDishPayloads` sans propagation ; unité existante non parsée ignorée ; préparation existante absente de la carte parsée sautée à l'application. Contrôler les doublons de préparations et sessions comme ceux des unités.

Lire les préparations explicitement renvoyées même lorsqu'aucune unité de plat n'est renvoyée : le handler les recueille actuellement dans sa boucle de lecture des unités. Une réparation portant uniquement sur une préparation ne doit pas être annoncée appliquée sans l'avoir parsée. Réutiliser le lecteur de production, sans inventer un plat public pour contourner ce cas.

Quand le serveur annonce `base_version`, exiger un écho présent et identique ; absence et version différente ont des motifs distincts. Garder les éventuels modes sans version uniquement pour les appelants qui les demandent explicitement, pas pour `final_repair`.

Tout valider avant d'appliquer sur une copie : opérations, périmètre, identités, graphe des préparations et sécurité. Une normalisation autorisée des unités ou des quantités n'est pas une opération invalide ; une composition nutritionnelle encore à compléter continue de suivre le mécanisme existant. Ne pas transformer chaque avertissement du parseur en rejet structurel.

### 2.4 Protéger chaque personne lorsque la recette est partagée

Une modification d'ingrédients d'un lot partagé peut changer l'énergie, la densité et les quantités de toutes ses utilisations. Après fusion, refaire la finalisation et les contrôles pour **tous** ses consommateurs, puis comparer la candidate à la meilleure version par personne-date-créneau. Un total de défauts plus faible ne permet pas de dégrader une portion auparavant conforme d'une autre personne.

Le patch peut isoler une nouvelle préparation pour la personne en défaut selon le mécanisme déjà implémenté. Vérifier alors : ancien lot conservé pour ses autres consommateurs, nouvelles références valides, quantités produites suffisantes, sessions cohérentes, courses recalculées, stock déduit une seule fois. Le contrôle de session ne doit pas se limiter au texte si le graphe des préparations change par les opérations existantes.

Deux plats dédiés au même créneau restent distingués par leurs unités/propriétaires. Un complément reste un complément : préserver `complementsShared` et vérifier que la personne ne reçoit pas deux fois sa cible. L'omission d'un plat dans un patch ne supprime jamais sa portion.

### 2.5 Tests de sortie du lot 2

| Cas | Résultat exigé |
|---|---|
| Messages réels de réparation N=1, N=2, N=4 | Un schéma de patch, règles utiles et identités conservées, aucun ordre contradictoire de réponse complète. |
| Session seule en défaut | Contexte non vide, patch de session applicable, recettes/quantités inchangées, texte final corrigé. |
| Bonne unité + opération `null` ou sans id | Rejet entier ; meilleure version inchangée, motif précis. |
| Bonne unité + préparation rejetée par le parseur | Même rejet entier, préparation ancienne intacte. |
| Version absente/périmée, id inconnu/hors périmètre/dupliqué | Rejet avant mutation pour unités, préparations et sessions. |
| Tableau racine omis, patch partiel valide, préparation seule valide | Données omises conservées ; seules les opérations présentes sont appliquées. |
| Deux personnes, mêmes date/créneau, deux plats dédiés | La bonne unité change ; aucune portion transférée à l'autre. |
| Quatre personnes, une préparation commune utilisée sur plusieurs jours | Chaque consommateur est remesuré ; une régression sur une autre portion conforme fait rejeter la candidate. |
| Isolation d'un lot ou création d'un complément | Graphe, sessions, production, portions et courses cohérents ; aucun double comptage. |
| Premier patch rejeté, second utile | Deux appels au plus pour tout le foyer ; meilleure version retenue, motifs du rejet présents au deuxième appel. |

Tester les messages capturés au transport et le comportement des fonctions, pas seulement la présence de noms de fonctions dans le fichier source.

## Lot 3 — Prouver le parcours complet, dont les foyers à plusieurs

### 3.1 Scénarios et dénominateurs figés

Utiliser `banc-lot-F.ts` et `transport-lot-F.ts` dans `scratchpad/2026-09-11-FIABILITE-RECETTES/`. Les étendre au besoin ; ne pas ajouter de drapeau de test aux requêtes de production. Le transport contrôlé intercepte le fournisseur tout en exécutant le vrai handler et la finalisation réelle.

Préparer trois foyers de référence. Pour la grille commune simple, figer deux journées complètes, trois créneaux par jour :

| Foyer | Composition de la fixture | Créneaux communs | Portions attendues |
|---|---|---:|---:|
| N=1 | Titulaire avec objectif, apport fixe explicite et un repas léger | 6 | 6 |
| N=2 | Titulaire et adulte secondaire, besoins et appétits différents ; plat partagé et plat dédié ; contrainte alimentaire individuelle | 6 | 12 |
| N=4 | Titulaire et trois secondaires ; profils de besoins différents, lot commun sur plusieurs créneaux, au moins un plat dédié et une contrainte individuelle | 6 | 24 |

Prévoir aussi une variante contrôlée avec un membre mineur ou protégé et une variante de présences différentes selon le créneau. Appliquer les règles existantes : ne pas exiger un chiffre masqué par une protection, ni transformer un plancher non applicable en échec nutritionnel.

Pour les présences différentes, le dénominateur est la somme des cases **personne-date-créneau demandées**, pas `créneaux × taille du foyer`. Ne jamais reconstruire la demande depuis les plats retournés. Ne pas associer implicitement une génération au compte d'un secondaire : seul le maître lance ces scénarios.

### 3.2 Parcours déterministes obligatoires

Exécuter dans le vrai handler, avec réponses fournisseur contrôlées et écritures confinées aux fixtures ou au périmètre QA isolé existant :

1. Premier jet valide pour N=1, N=2 et N=4 : zéro réparation, toutes les portions attendues conservées et mesurées.
2. N=2 puis N=4, allergène uniquement dans une session : correction de cette session, recettes saines conservées ; puis variante où la violation persiste deux fois, aucune activation/écriture du nouveau plan ni aperçu dangereux.
3. N=2, bonne opération et opération mal formée dans la première réponse ; deuxième réponse valide : première rejetée entièrement, seconde évaluée sur la meilleure candidate, deux appels au maximum.
4. N=4, réparation d'un lot commun améliorant une personne mais dégradant une autre portion conforme : rejet. Variante isolant une nouvelle préparation : adoption seulement si chaque dépendance est valide après finalisation.
5. N=4, portion absente pour un seul membre et créneau partagé ; puis complément pour ce membre : bonne unité créée, pas de duplication ni disparition chez les autres.
6. Exception de validation ou budget épuisé avec défaut dur persistant : refus et ancien plan inchangé. Version sûre et complète avec écart nutritionnel résiduel : application de la politique de livraison existante et écart visible pour la bonne personne.
7. Lecture API/UI des sorties N=2/N=4 : bonnes personnes, quantités finales entières, texte corrigé, répartition et courses cohérentes. Appel de génération par un secondaire : refus d'autorisation avant appel fournisseur et écriture.

Les tests ne doivent pas « réussir » simplement parce que le handler retourne 422 : distinguer réparation réussie, rejet protecteur attendu et échec de génération. Ne pas réécrire les seuils ni les données attendues d'après la réponse obtenue.

### 3.3 Rejeu des archives et réparation avec le vrai modèle

Séparer les deux preuves :

- **Rejeu du moteur :** réponses brutes archivées du premier jet injectées au transport contrôlé, puis nouvelle finalisation, écriture de fixture et relecture. Les anciennes réponses de réparation au format plan complet ne constituent pas des patchs valides du nouveau protocole ; utiliser une réponse contrôlée déclarée comme telle si le rejeu en a besoin.
- **Remesure :** `analyse-lot-F.ts` exécuté séparément sur chaque résultat final. Ne pas appeler une remesure des anciennes sorties « rejeu de la nouvelle boucle ».

Rejouer les trois premières réponses `lot3f` et le cas `lot3c` connu avec réparation. Les autres archives restent un corpus de mesure ; inutile de regénérer six plans payants pour chaque modification.

Après passage des tests contrôlés, préparer **trois parcours hybrides** N=1, N=2, N=4 : contexte et premier jet en défaut figés, puis réponse de réparation réellement produite par le fournisseur actuel, avec les messages construits par le handler. Pour N=4, choisir un défaut de densité ou de quantité impliquant des consommateurs d'un lot partagé ; pour N=2, une correction de session ou de plat dédié.

Le banc actuel à transport contrôlé interdit les sorties fournisseur réelles. Ajouter ce mode uniquement dans l'outillage de test, avec une autorisation explicite du mode, une liste limitée d'hôtes et le plafond de deux réparations. Ne pas confondre cette extension avec un réglage déjà disponible. Chaque parcours est donc explicitement **hybride**, pas une nouvelle génération intégralement réelle.

Exécuter les parcours séquentiellement et mesurer la durée du premier avant de lancer les suivants. Au plus six appels réels de réparation pour cette campagne, pas de reprises silencieuses au-delà du budget. Séparer le chantier 546 des conclusions fonctionnelles : un dépassement de durée reste publié comme tel et empêche de dire que le parcours a abouti. Ne pas déclarer la compétence du modèle prouvée si aucune réponse utile n'a été adoptée ; analyser la trace et nommer ce qui reste au lieu de multiplier les tirs jusqu'à obtenir un succès.

### 3.4 Mesures, vérifications et rapport final

Pour chaque parcours, archiver : version/diff du code, horloge, demande par personne, référentiel, premier jet, version et adresses annoncées, messages système/utilisateur exacts, réponse brute de chaque réparation, rejet/adoption, état après chaque finalisation, meilleure candidate, données écrites et relues. Utiliser le périmètre QA existant sans exposer de secrets ni des données de comptes réels dans un nouveau rapport public.

Publier par personne-date-créneau : cible calorique et énergie mesurée, Gmin/Gmax et grammes servis, Dmin/Dmax et densité mesurée, état des références, présence de la portion, protéines lorsque le plancher s'applique. Publier aussi les effets sur les autres consommateurs, les quantités de lots, la couverture des achats et l'intégrité des textes corrigés. Les contrôles non applicables ou indisponibles restent distincts d'un succès.

Compter séparément premier appel, complétion auxiliaire du référentiel, réparations réellement lancées, réponses rejetées et durées. Corriger les libellés historiques de l'instrument uniquement lorsqu'ils contredisent les données effectivement disponibles ; absence de journal de garde = indisponible, pas preuve que la garde a reçu `energy: null`.

Vérifications de code : tests ciblés des modules modifiés, tests de `meal_generation`, `plan_repair_*` et garde finale ; `deno check` du handler ; tests API/UI touchés ; puis `scripts/agent-gate.sh` selon le fonctionnement actuel du dépôt. Ne pas lancer la même suite deux fois si le gate vient déjà de la couvrir. Ne pas modifier les listes de rouges tolérés pour accepter une régression de ce chantier. Documenter les échecs préexistants identifiés.

Rédiger `docs/keel/RAPPORT-FERMETURE-REPARATIONS-FOYER-2026-09-13.md`, avec un tableau d'état par exigence et les chemins des preuves. Mettre à jour brièvement `docs/SOCLE.md` pour le parcours réellement livré et les documents de contrat concernés, sans transformer le SOCLE en journal de campagne.

**Critère final :** aucun des trois défauts reproduits ne subsiste ; les parcours contrôlés vérifient les refus et les réparations ; les parcours avec fournisseur réel montrent ce que le modèle sait effectivement corriger pour 1, 2 et 4 personnes. Chaque résultat respecte les contrats individuels applicables ou rend un écart explicitement autorisé. Aucun succès global du foyer ne masque une portion perdue, une régression chez un autre membre ou une violation de sécurité.
