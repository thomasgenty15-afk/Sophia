# Fermer les défauts restants — plan détaillé en trois lots

Document d'implémentation établi après relecture du code local le 2026-09-12. Il complète les trois lots déjà implémentés : **ne pas les recommencer**. Référence : [revue des trois lots](REVUE-TROIS-LOTS-2026-09-12.md).

## Contrat de travail

- Exécuter **lot 1 → lot 2 → lot 3**. Garder un seul écrivain sur `generate-household-meal-v1/index.ts`. Ne pas modifier les fichiers de fonctions pendant un essai edge en cours.
- Résultat produit déjà choisi : livrer la meilleure version **sûre et complète**, avec les écarts nutritionnels résiduels visibles. Une portion obligatoire absente, une incompatibilité de sécurité non résolue ou une validation finale indisponible empêchent l'activation ; préserver l'ancien plan valide.
- Conserver : équations et protections nutritionnelles, cibles initiales, ±10 % par créneau et ±5 % par journée couverte, bornes de masse/densité, planchers protéiques existants, arrondi au plus proche, règles culinaires, moteur unique, droits du compte maître, suppression des extras forfaitaires, apports fixes explicites et modèles/réglages fast.
- Ne pas ouvrir une nouvelle lane, inventer un barème nutritionnel, refaire l'UI, ajouter un troisième rappel modèle ou remplacer un défaut par une tolérance plus large.
- Aucun chantier général de découpage du handler. Les extractions nécessaires à l'unification des réparations font partie du lot 1 et doivent aboutir ; « sera corrigé quand on découpera le fichier » n'est pas une sortie acceptable.
- Pas de migration nécessaire à cette version du plan. Respecter `AGENTS.md` : aucun déploiement, db push/reset, secret ou suppression de données réservée à l'humain. Ne pas appliquer les migrations en attente au passage. Les fixtures restent isolées, sans nettoyage destructif.
- Avant de commencer, relever le commit et les différences locales des fichiers concernés. Préserver les changements des autres sessions. Chaque défaut ci-dessous doit être reproduit sur cet état ; s'il a été corrigé entre-temps, conserver sa preuve et ne pas réimplémenter.

## Faits de départ vérifiés

| Fait dans le code actuel | Conséquence pour ce plan |
|---|---|
| `RepairDefect` conserve `kind/day/slot/dish/memberId`, mais `defectsFromRefusals` perd `cause` et `preparation_id`. | Préserver une adresse structurée avant de déterminer le périmètre ; ne pas extraire l'adresse d'une phrase. |
| `repairScopeOf` accepte uniquement les `day/slot` des plats présents. | Un déficit journalier et un plat absent peuvent aboutir à zéro unité modifiable. |
| `cellAddress` ignore le propriétaire du plat ; `candidateParCase` conserve le premier plat trouvé. | Deux plats dédiés au même moment ne doivent pas être fusionnés par cette seule clé. |
| Le prompt propose une nouvelle préparation, mais `mergeRepairedUnits` rejette `uses_changed` et ne sait pas ajouter de préparation. | Faire correspondre le contrat demandé au modèle et les opérations réellement applicables. |
| Après fusion, `mealSourceText` devient encore la réponse brute de la candidate. | `extractMemberPortions`, `extractExplanation` et `countWhyRuleAttributions` peuvent relire des objets rejetés par la fusion. |
| Sept sites demandent une réparation avant la passe finale : `protein_anchor_retry`, `exclusion_retry`, `swap_retry`, `preference_split_retry`, `unfed_retry`, `density_repair`, `dedicated_repair`. | Le compteur partagé ne suffit pas : leurs décisions doivent rejoindre la collecte commune. |
| Le parseur agrège toutes les surfaces visibles et rend `dishes/preparations/cooking_sessions/shopping_list: []` lorsque `clean` est faux. | La réparation locale doit conserver une candidate interne non livrable et des violations localisées, sans désarmer le verrou public. |
| Une conserve est classée `pantry`, mais le contrôle final lit encore `rawWindowDaysFor(food_group)` après le calcul de `perishable`. | Le classement en rayon seul ne corrige pas tous les lecteurs de conservation. |
| La datation finale est conditionnée à `shoppingRebuild.synthesized > 0` ; des explications sont fabriquées plus tôt. | Changer un jour de cuisson sans ajouter d'ingrédient doit aussi redater les achats et actualiser les explications. |

Les derniers six cas retenus donnent **43 créneaux et 50 portions conformes** sur calories, masse et densité ; cinq n'ont pas nécessité de réparation. Ils comportent 7 ou 8 créneaux par plan et ne sont pas une comparaison à charge égale avec les neuf créneaux du C6. Conserver également les essais antérieurs refusés/interrompus.

## Lot 1 — Une réparation adressée, partielle et cohérente jusqu'à la livraison

### 1.1 Fichiers et responsabilité

Noyau : `_shared/keel/plan_repair_context.ts`, `plan_repair_loop.ts`, `plan_defect_pass.ts`, `plan_budget.ts` et leur branchement dans `generate-household-meal-v1/index.ts`.

Lecteurs à préserver : `meal_generation.ts`, `household_portions.ts`, `retry_merge.ts`, `cell_edit.ts`. Ne pas réutiliser une fusion existante sans vérifier ses clés : `cell_edit.ts` utilise aussi jour/créneau et ne résout donc pas automatiquement les plats dédiés.

### 1.2 Conserver l'identité du défaut et des unités

1. Ajouter aux défauts internes la cause structurée, la source du constat et les identifiants d'objets disponibles : préparation/session, date, jour, créneau, personne, plat. Les constructeurs doivent renseigner explicitement les absences. Ne jamais retrouver une préparation par recherche dans `detail` ou par rapprochement de titres.
2. Construire un index de réparation depuis la **demande figée**, `householdGrid.byMouth`, `contractDates`, les contrats et les plats/preparations effectivement présents. `auditCells` dispose déjà de date, jour, créneau et personne : transmettre cette donnée plutôt que recalculer la semaine.
3. Attribuer aux unités de réparation des identifiants internes immuables dans la génération (`unit_id`). Leur table conserve date, créneau, propriétaire éventuel, convives et identifiants de préparations/boîtes. Ne pas les recalculer depuis le titre ou l'index courant du tableau après mutation. Aucune nouvelle colonne en base n'est requise.
4. Réserver aussi une unité pour une portion/plat attendu mais absent. L'absence dans `meal.dishes` ne doit pas empêcher sa création dans une réparation. La création n'est autorisée que dans la grille attendue ; aucun nouveau créneau improvisé.

### 1.3 Déterminer exactement le périmètre modifiable

| Défaut | Périmètre autorisé |
|---|---|
| Calories/masse/densité d'une portion | Plat qui sert cette personne dans cette case, ses composants et préparations concernés. |
| Protéines ou énergie d'une journée | Les repas couverts de cette personne à cette date, en employant les cibles déjà nettes des apports fixes. Les apports fixes restent non modifiables. |
| Plat/portion attendu absent | L'unité réservée correspondante et les dépendances indispensables à sa création. |
| Préparation en défaut | Cette préparation et ses consommateurs identifiés par les références `uses`/boîtes. |
| Violation alimentaire localisée | Unité en cause et toutes les unités dépendantes du lot contaminé ; pas les plats sans dépendance. |
| Session mal référencée | Correction déterministe si `cook_on` et les sessions existantes désignent un choix unique ; sinon défaut explicite de planning, sans autoriser une réécriture générale des recettes. |
| Adresse inconnue/ambiguë | Défaut conservé avec raison `scope_unresolved` ; ne pas envoyer un appel annoncé comme réparable avec un périmètre vide. Un autre défaut adressable peut néanmoins déclencher l'appel. |

Un défaut journalier ouvre toutes les unités couvertes nécessaires au modèle pour recomposer la journée, mais ne donne aucun droit sur les autres jours/personnes. Les portions dépendantes d'une préparation partagée entrent dans la **validation**, même si leur plat est gelé.

### 1.4 Contrat interne de correction partielle

Introduire un contrat de réparation versionné, indépendant du JSON public de génération. La génération initiale et la réponse HTTP au front conservent leur forme actuelle.

Le message fournisseur contient :

- version de la meilleure candidate (`base_version`) et identifiants autorisés ;
- défauts structurés et mesures actuelles/cibles : énergie, masse, densité et protéines séparées ;
- contenu complet des seules unités modifiables : ingrédients avec `ref/amount/unit/state`, composants, méthode, quantités/parts, liens de préparation, contraintes de session/conservation et personnes servies ;
- pour les unités dépendantes gelées, les prélèvements et contraintes nécessaires pour éviter une régression ;
- résultat de la tentative précédente avec les causes réelles. `safety_regression` ne doit pas être automatiquement traduit par « vous avez ajouté un aliment interdit » : cette famille inclut aussi les violations de calendrier ;
- liste fermée des opérations autorisées et réponse **partielle uniquement**.

Opérations à supporter : remplacement d'une unité existante ; remplissage d'une unité attendue absente ; remplacement d'une préparation autorisée ; création d'une préparation réservée à des unités autorisées ; mise à jour des liens et rattachements de cuisson concernés. Chaque opération désigne explicitement l'objet cible ; aucun champ global libre et aucun achat fourni par le modèle.

Réutiliser les champs de recette existants pour les charges utiles. Donner aux nouvelles préparations des identifiants autorisés pour cette tentative ; rejeter collisions, références inconnues, objets hors périmètre et `base_version` périmée avant application. Un tableau omis ne signifie jamais « supprimer les données existantes ».

Retirer des **deux** messages, système et utilisateur, les consignes de réparation demandant encore de renvoyer tout le plan ou de recopier des objets invisibles. Adapter le parseur de réponse partielle : ne pas lui appliquer le test actuel `parsed.dishes.length < meal.dishes.length`, qui rejetterait justement un patch local valide.

Ne pas tronquer les ingrédients/contraintes d'une unité sélectionnée pour tenir sous les 9 000 caractères de la projection actuelle. Ce plafond devient souple : retirer d'abord les répétitions et les unités sans dépendance. Si un plafond dur du fournisseur est atteint, déclarer `context_too_large` avant l'appel ; ne pas envoyer un contexte incomplet en prétendant qu'il est exploitable.

### 1.5 Fusion atomique et préparations partagées

1. Appliquer un patch validé sur une copie de la meilleure candidate. Si une opération est invalide, rejeter la candidate entière et conserver la version précédente ; pas de demi-patch laissé en place.
2. Autoriser les changements de `uses` seulement vers une préparation existante autorisée ou une nouvelle préparation déclarée dans le même patch. Le rejet global `uses_changed` doit devenir une validation du graphe.
3. Pour isoler une portion, garder le lot original et les prélèvements des convives non concernés, créer le nouveau lot et rerouter uniquement les unités autorisées. Recalculer les quantités à cuisiner avec les fonctions de production. Si un lot restant ne peut pas être réduit sans casser une pièce entière, conserver un surplus explicite ; ne pas inventer un ingrédient fractionnaire ni supprimer une portion.
4. Valider équipement, temps, cadence et capacité de préparation avec les règles existantes. Une nouvelle casserole n'est pas automatiquement faisable. Si elle ne l'est pas, rejeter la candidate avec ce motif ; ne pas augmenter silencieusement les capacités déclarées.
5. Ne pas supprimer un lot encore référencé. Retirer un lot devenu sans consommateur uniquement par le nettoyage de dépendances, en recalculant ses achats et ses sessions.
6. Le meilleur état doit contenir ensemble le plan structuré, les portions individuelles et les champs narratifs retenus. **Ne plus remplacer `mealSourceText` par le texte brut du patch.** Adapter la sérialisation/relecture pour que `extractMemberPortions`, `extractExplanation`, `countWhyRuleAttributions`, les brouillons et les snapshots lisent le même état fusionné. Le texte fournisseur brut ne sert plus qu'à l'archive technique du tour.

### 1.6 Une seule décision de rappel

Transformer les sept sites amont en producteurs de constats/contexte et conserver leurs calculs et protections utiles. Réutiliser notamment les diagnostics de réparabilité culinaire/densité ; ne pas perdre leurs contraintes en supprimant leurs appels.

Extraire la finalisation/collecte nécessaire en une passe réutilisable avec un contexte explicite. Cette passe ne déclenche pas de recomposition modèle et n'écrit pas de plan actif. Les sorties de sécurité ne doivent pas retourner avant le point de réparation tant qu'une candidate interne est réparable ; le lot 2 précise leur confinement.

Chemin unique attendu :

`candidate → résolution des ingrédients → dimensionnement/finalisation → achats/planning → contrôles → corrections déterministes → recontrôle → décision commune → patch éventuel → nouvelle candidate`.

- Un seul compteur des appels de réparation réellement lancés, maximum **deux pour la requête entière**, plus l'appel initial. Un appel rejeté, mal formé ou interrompu compte. Aucun ancien site ne contourne ce compteur ; aucune retransmission cachée de recomposition dans le wrapper fournisseur.
- Vérifier le contexte et construire l'instruction avant de consommer la tentative. L'incrément effectif accompagne le départ fournisseur.
- Les appels auxiliaires de résolution alimentaire restent distincts, groupés sur les inconnus, comptés et soumis à l'échéance commune ; ils ne recomposent pas le plan.
- Après rejet, revenir à la meilleure version et réévaluer défauts, appels et temps restants. Après adoption, conserver l'amélioration partielle mesurée et réévaluer de la même façon.
- Comparer toutes les portions précédemment conformes : une baisse du nombre total de défauts ne permet pas de dégrader une autre personne ou un autre repas. Conserver le comparateur d'amélioration existant pour les défauts appariés.
- Une règle non corrigeable déterministement et sans contexte modèle exploitable reste nommée ; elle ne consomme pas deux appels vides.

**Sortie du lot 1 :** aucun rappel de recomposition hors de la décision commune ; patch réellement partiel ; déficit journalier, plat absent et préparation isolée réparables ; plan, portions et explications issus d'une même version. Le lot n'est pas livré tant que les anciens sites consomment encore le budget.

## Lot 2 — Sécurité locale et calendrier d'achat cohérent

### 2.1 Fichiers et responsabilité

Parseur et protections : `meal_generation.ts`, détecteurs existants appelés par `sophia-brain/skills/_shared/keel_output_locks.ts`, tests de sécurité et branchement du handler.

Achats : `shopping_rebuild.ts`, `shopping_identity.ts`, `grocery_waves.ts`, `fridge_window.ts`, `final_plan_audit.ts`, `final_plan_gate.ts`, lecteurs de validation et de liste de courses.

### 2.2 Conserver une candidate non livrable pour réparer une violation

- Séparer dans le chemin de génération le résultat structuré analysé, les violations localisées et le verdict de publication. La candidate non sûre reste interne, avec un type/état distinct ; elle n'est ni un aperçu public ni un plan activable.
- Réutiliser les détecteurs actuels de texte et de groupes alimentaires, leurs règles de négation et leurs contraintes par personne/table. Ne pas désactiver `safetyConstraints`, ajouter une requête utilisateur `skip_safety` ou assouplir le verrou commun du chat.
- Localiser les violations par plat, préparation, note de portion, méthode, session, courses ou autre surface visible. Une préparation en cause marque tous ses consommateurs. Une violation de texte doit être corrigée sur sa surface sans faire disparaître une recette saine sans lien.
- Lorsque la localisation échoue, garder un blocage global explicite ; ne pas distribuer arbitrairement les responsabilités. Préserver les données internes nécessaires au diagnostic, jamais les publier comme un plan sûr.
- Avant livraison, contrôler l'ensemble de la version fusionnée et toutes les surfaces visibles avec les mêmes protections. La sécurité s'applique même si le budget modèle est épuisé. Toute violation bloquante résiduelle interdit l'activation.
- Vérifier que les autres appelants de `parseGeneratedMeal` conservent leur comportement de publication protégé : la nouvelle lecture interne ne doit pas ouvrir un chemin non validé pour les brouillons, éditions ou autres générateurs.

### 2.3 Une même décision de conservation pour dater et contrôler

1. Créer une lecture partagée de conservation à partir de la référence alimentaire et des règles existantes : `stable`, `refrigerated` avec fenêtre connue, `frozen`, ou `unknown`. Réutiliser `SHELF_STABLE_SLUGS` pour ses références explicites et `rawWindowDaysFor` pour les groupes concernés. Ne pas créer une liste de mots, une durée clinique nouvelle ou une équivalence entre groupe nutritionnel et conservation.
2. Faire utiliser cette lecture par le calcul des dates **et** par `finalPlanGate`. Un aliment explicitement stable ne traverse plus la fenêtre du poisson frais uniquement parce qu'il partage `white_fish`. Le rayon demeure un champ d'affichage, pas une deuxième autorité de sécurité.
3. Une conservation inconnue reste explicitement non vérifiée ; ne pas écrire « stable » ni « aucune contrainte » faute de donnée. Conserver le repli existant là où il est documenté, en le signalant. Aucune nouvelle migration de catalogue dans ce chantier ; documenter les limites des références reconnues.

### 2.4 Recalculer les achats depuis leurs usages finaux

- Conserver pour chaque besoin sa référence, sa quantité achetable et ses usages datés : préparation cuisinée ou ingrédient direct consommé. Les contenants qui prélèvent un lot ne comptent pas une seconde fois comme achats.
- Relier les usages par référence/id, pas par égalité de libellés. Un alias ou pluriel ne doit pas effacer une date de besoin ; en l'absence d'identité fiable, marquer l'appariement incomplet.
- Réutiliser `buyDatesByIndex` et les règles de cadence/congélateur existantes, en les adaptant aux usages datés. Vérifier chaque usage, pas uniquement la première cuisson d'un ingrédient utilisé plusieurs fois.
- Regrouper les achats dont les fenêtres de conservation sont compatibles ; scinder la quantité d'une même référence quand une ligne unique ne couvre pas ses différentes cuissons. La somme des lignes doit égaler le besoin net, sans double achat.
- Si la cadence souhaitée est incompatible, conserver une vague supplémentaire comme les règles de fraîcheur actuelles le permettent. Congeler uniquement si l'équipement et la règle alimentaire le permettent, avec geste explicite dans le plan. Ne jamais déplacer un achat après sa cuisson ni avancer une cuisson dans le passé.
- Ne pas se contenter de redater lorsque `synthesized > 0`. Un changement de jour de cuisson, de conservation, de dépendance ou de quantité peut exiger un nouveau calendrier sans ajouter d'aliment.
- Déduire le stock quantifié une seule fois sur l'ensemble des usages. Faire lire le même stock/besoin net à l'audit des achats. La simple présence reste « stock à vérifier » avec le besoin visible ; aucun nouvel écran de garde-manger.
- Après le dernier calcul des lignes et dates, reconstruire `shoppingDays`, `describeWrittenWaves`, gestes de congélation, explications et payload UI. Ne pas conserver une prose périmée et simplement ajouter `shopping_day_added_after_prose`.

### 2.5 Politique finale et confidentialité

- Réarmer le refus d'une incompatibilité **réelle** de conservation après correction et recontrôle. Le fait que notre code ait produit la date ne rend pas son résultat acceptable.
- Conserver les autres protections de livraison. Les écarts nutritionnels mesurés peuvent rester livrables et visibles ; une exception de validation reste `plan_validation_unavailable`, avec ancien plan intact.
- Traiter les protections d'affichage de `cell_bounds_off` des deux côtés, serveur et front, avant d'ajouter des détails : ne pas laisser les nouvelles mesures de réparation réapparaître dans une réponse publique lorsque la protection énergétique les masque.
- Une candidate unsafe/une date impossible ne doivent jamais atteindre `completeDraft` comme aperçu livrable ni `write_student_meal_plan` comme plan actif. Les raisons lisibles restent présentes sans les nombres protégés.

**Sortie du lot 2 :** une violation localisée est réparable sans perdre les unités saines ; une conserve ne suit plus une règle de frais ; un achat périssable respecte tous ses usages ou empêche l'activation ; les dates et explications relues correspondent aux achats finaux.

## Lot 3 — Preuves reproductibles et campagne courte

### 3.1 Tests de comportement avant appels réels

Étendre les tests existants au lieu de constituer un second moteur de calcul. Modifier les tests qui épinglent le comportement défectueux, avec un cas opposé qui conserve la protection. Exemples : `uses_changed` arbitraire reste refusé ; nouvelle préparation explicitement autorisée passe. Ne pas supprimer des assertions uniquement pour obtenir du vert.

| Cas obligatoire | Résultat exigé |
|---|---|
| Déficit protéique d'une journée, créneaux individuellement corrects | Périmètre non vide pour la bonne date/personne ; patch applicable ; jour et autres personnes préservés. |
| Écart énergétique journalier sans gros écart d'un repas | Même routage journalier ; cibles initiales et apports fixes inchangés. |
| Deux plats dédiés au même jour/moment | La réparation de l'un ne remplace ni sa recette ni la portion de l'autre. |
| Plat attendu totalement absent | Unité réservée créée, sans ajouter de créneau hors demande. |
| Préparation partagée, isolation nécessaire | Nouvel id et liens acceptés ; ancien lot préservé pour les autres ; quantités et achats exacts. |
| Nouvelle préparation inconnue/hors périmètre, collision d'id, mauvaise version | Candidate rejetée atomiquement, meilleur plan inchangé. |
| Patch partiel avec moins de plats que le plan | Accepté s'il satisfait son contrat ; aucun `shorter_plan` fondé sur la longueur totale. |
| Patch modifiant du texte/portions hors périmètre | Données non retenues absentes de tous les lecteurs de la version livrée, y compris `mealSourceText`/brouillon. |
| Première candidate rejetée, seconde réussie | Deux appels réels ; meilleure version sûre livrée. |
| Deux candidates insuffisantes, ou réponse illisible puis réponse correcte | Plafond respecté ; sortie conforme au contrat de livraison ; motif d'arrêt exact. |
| Densité + référence absente + déficit protéique présents ensemble | Constat commun avant premier rappel ; pas de budget vidé par un site amont. |
| Amélioration d'un repas qui dégrade un repas auparavant conforme | Rejet malgré la baisse du nombre total de défauts. |
| Allergène initial sur un plat / sur un lot partagé | Unités dépendantes identifiées ; unités saines conservées ; seule version finale sûre publiable. |
| Allergène introduit par réparation + témoin sain avec ceinture armée | Candidate dangereuse rejetée ; témoin accepté ; aucune preuve fondée uniquement sur zéro violation. |
| Négation autorisée et surface narrative interdite | Règles des détecteurs existants préservées ; aucune surface visible oubliée. |
| Thon en conserve et poisson frais du même groupe | Conservation distincte dans la datation ET le contrôle final. |
| Même ingrédient dans deux cuissons éloignées | Deux achats si nécessaire ; somme des quantités exacte ; aucun usage tardif ignoré. |
| Jour de cuisson changé sans nouvel ingrédient | Dates d'achat et explications recalculées malgré `synthesized = 0`. |
| Cadence courte avec/sans congélateur déclaré | Choix existants respectés ; geste explicite ; impossibilité résiduelle bloquante. |
| Stock connu et simple présence au garde-manger | Déduction et audit d'accord ; inconnu jamais déclaré suffisant. |
| Exception de validation / erreur de conservation après deux appels | Aucune activation ; relecture de l'ancien plan identique. |
| Protection énergétique active | Aucun chiffre protégé dans statut, erreur, explication publique ou UI. |

### 3.2 Vrai handler, réponses contrôlées

Utiliser `banc-lot-F.ts` et `transport-lot-F.ts` existants. Le banc possède déjà `--horloge`, `--reponse`, `--allergene`, `--sans-portion`, `--duo` et des scénarios protéiques. Ajouter le support des **réponses de patch** et de leur séquence sans ajouter de paramètre produit permettant de contourner le fournisseur ou la sécurité.

Exécuter au minimum au vrai handler : déficit journalier corrigé ; portion absente créée ; préparation partagée isolée ; rejet puis succès ; allergène local ; conservation corrigée ; exception de validation. Suivre demande → contrat fournisseur → fusion → finalisation → persistance → relecture API/UI. Les réponses contrôlées prouvent le trajet, pas la compétence du modèle.

Rejouer aussi les six archives finales `lot3c` : 8, 7, 7, 7, 7 et 14 portions, soit **50**. Ne pas publier 43 portions. Mesurer chaque fichier séparément : `analyse-lot-F.ts` lit son argument de fixture, une liste de chemins dans un seul appel ne constitue pas six mesures.

Pour toute régression connue, garder côte à côte le cas qui échouait avant et celui qui passe après, sur la même demande. Aucun écrasement d'archive.

### 3.3 Trois demandes réelles, sans campagne incontrôlée

Après réussite des tests et rejeux : **trois demandes réelles séquentielles**, plus leurs deux réparations maximum si nécessaires. Compter séparément les appels auxiliaires. Ne pas déclencher une nouvelle génération complète parce qu'un tir échoue.

1. Une personne avec objectif protéique applicable et apports fixes, pour vérifier le contrat journalier et une correction si elle est nécessaire.
2. Deux personnes aux contraintes différentes avec préparation partagée et portions dédiées, pour vérifier les identités et la non-régression entre convives.
3. Un plan avec plusieurs dates de cuisson, produit stable et produit frais, pour vérifier achats, conservation et explications.

Figer le contexte avant chaque appel. Pour les comparaisons à fenêtre identique, utiliser le transport local avec horloge injectée et passage au vrai fournisseur, en conservant la restriction locale du banc. Ce n'est pas une validation du timeout HTTP hébergé ; si le chemin Kong réel est utilisé, publier sa fenêtre réelle et ne pas prétendre qu'elle est identique à une autre heure.

Ne pas fabriquer un déficit dans une réponse réelle pour la déclarer ensuite « génération spontanément défaillante ». Les cas de réparation forcée appartiennent au banc contrôlé. Si le modèle ne produit aucun défaut, publier « aucune réparation nécessaire » ; cela ne prouve pas la réparation, dont la preuve reste au banc.

### 3.4 Mesures et critères de fin

Archiver par run : version du code, scénario et horloge, demande, contrats, état avant finalisation, état après finalisation, contexte/patch de chaque appel, verdict d'application, mesures de la candidate, meilleure version retenue, données écrites et données relues. Garder les états intermédiaires internes dangereux hors des réponses publiques.

Compter : demandes de plan ; appels initiaux ; appels de réparation ; auxiliaires ; résultats rejetés ; défauts par nature/adresse ; raisons d'arrêt ; créneaux attendus ; portions par personne ; calories/grammes/densités/protéines ; achats complets/incomplets ; durées et dépassements. Une mesure non applicable ou non exécutée ne devient pas un succès.

Fin fonctionnelle : tous les cas contrôlés passent, les archives nominales n'ont pas régressé, les trois demandes réalisables livrent un plan sûr et complet, leurs portions finales respectent les tolérances/contrats, aucune incohérence d'achat ou de texte introduite par la réparation, et aucun troisième rappel de plan. Une livraison « avec écarts » reste autorisée par le produit mais **ne valide pas la clôture de la correction du défaut concerné**.

Exécuter les tests Deno des modules modifiés, les tests de branchement de génération, `deno check` du handler, les tests front de validation/courses/quantités/relecture, puis la compilation front. Une seule vérification élargie en sortie ; documenter séparément les échecs préexistants. Ne pas présenter un test de présence de chaîne ou de position dans le source comme la preuve principale du comportement.

Mettre à jour `docs/SOCLE.md`, la grille de mesure, le rapport du chantier et `RESTE-A-FAIRE.md` avec le comportement réellement livré. Ne retirer un défaut de la liste qu'avec sa preuve de fermeture. Publier les durées sans attribuer automatiquement toute latence à une cause indépendante du pipeline.

**Livrables finaux :** modifications des trois lots et tests ; archives contrôlées et réelles séparées ; tableau de résultats avec dénominateurs exacts ; état local versus production ; limites restantes. Le goût et la fiabilité sous le délai hébergé ne sont pas déclarés acquis par ces seuls essais.
