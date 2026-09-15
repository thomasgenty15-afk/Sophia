# Revue du résultat des réparations de foyer — 2026-09-13

**Verdict : progrès confirmés, clôture refusée.** Le contrôle des surfaces et l'application de patch sont renforcés. La génération/réparation satisfaisante d'un foyer de quatre personnes n'est pas démontrée. Deux défauts de consigne sont encore visibles dans une requête réellement envoyée au fournisseur ; attribuer les échecs uniquement au modèle est prématuré.

Revue du rapport `RAPPORT-FERMETURE-REPARATIONS-FOYER-2026-09-13.md`, du code courant et des prompts archivés `h2n2`/`h4n4`. Aucun changement du moteur, appel fournisseur ou écriture en base pendant cette revue.

## 1. Progrès vérifiés

- `output_surfaces.ts` est utilisé par le contrôle initial et le contrôle final. Les sessions sont maintenant recensées ; le dernier contrôle dans le handler inclut aussi `explanation.lines` et les notes de portions finales. Une erreur du contrôle final retourne `plan_validation_unavailable`.
- `repairSystemPrompt` remplace effectivement l'ancien système complet à l'appel de réparation. Le schéma interne comporte les opérations de session.
- `applyRepairPatch` rejette désormais les erreurs d'enveloppe, exige la version lorsqu'elle est annoncée et contrôle les opérations non parsées. Les cas problématiques de la précédente revue ont reçu des corrections ciblées.
- **61 tests ciblés relancés, 61 réussis, zéro échec** : `output_surfaces_test.ts`, `plan_repair_patch_test.ts`, `plan_repair_prompt_test.ts`, `plan_repair_prompt_wiring_test.ts`. Les 7 055 tests annoncés par l'agent n'ont pas tous été relancés dans cette revue.
- Le rapport archive une réparation réelle adoptée à une personne et une utilisation réelle de l'opération de session. Ce sont des preuves utiles du fonctionnement du protocole, sans constituer une preuve de conformité de toutes les portions.

## 2. P1 — Les objectifs de plusieurs personnes perdent leur propriétaire dans le prompt

**Preuve :** deuxième requête dans `scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/perte-h4n4-2026-09-11T12-30-45-131Z.prompts.txt`.

Le message utilisateur envoyé au fournisseur contient, pour le même jour :

```text
- 2026-09-12: across that day the plates carry 2702 kcal and they must carry 1826 kcal, within 5%.
- 2026-09-12: across that day the plates carry 2702 kcal and they must carry 3824 kcal, within 5%.
- 2026-09-12: across that day the plates carry 2702 kcal and they must carry 2459 kcal, within 5%.
```

Même problème au créneau : pour `fri/dinner`, 947 kcal sont comparées successivement à 639, 1338 et 861 kcal sans membre identifié sur les instructions. La projection du plat partagé liste ses quatre consommateurs, mais ne rattache pas chacune de ces cibles à son consommateur. La cible 3824 ne réapparaît pas ailleurs dans ce message avec un propriétaire.

**Cause actuelle :** `plan_defect_pass.ts::where` (vers 1054) ne rend que jour, créneau et titre ; `memberId` est absent. `repairDefectLines` concatène cette adresse aux détails. La section protéique trouve bien un contexte par `memberId`, puis omet également cette identité dans son texte de journée.

**Conséquence :** le serveur possède une information que le modèle ne reçoit pas sous une forme attribuable. Cela rend les demandes ambiguës pour un plat commun. Cette omission est établie ; la fraction des échecs qu'elle explique n'a pas été mesurée.

**Correction attendue :** conserver dans chaque instruction l'identité de la personne, sa date, son créneau lorsqu'il existe, et le lien aux unités/lots concernés. Fournir aussi le contexte des autres consommateurs lorsqu'un lot commun change. Tester le message réellement transmis avec plusieurs cibles différentes le même jour : chaque valeur doit être reliée sans ambiguïté à sa personne. Les protéines doivent suivre la même règle.

## 3. P1 — L'ordre de renvoyer un plan complet revient par les compléments

Dans cette même requête `h4n4`, le message utilisateur contient encore :

```text
Return the full plan JSON with only these dishes added.
```

Il contient aussi `Do not touch any other dish, any preparation, or anyone else's plate`, alors que d'autres lignes du même message ouvrent plusieurs plats et préparations à la réparation.

**Source actuelle :** `portion_sizing.ts::dedicatedDishInstruction`, notamment la ligne 3333. Le handler récupère ce texte dans `dedicatedInstruction` ; il rejoint les défauts d'amont, puis le message de réparation. Ce n'est pas seulement un commentaire ou une fonction inutilisée : la chaîne figure dans l'archive fournisseur.

Le nouveau système demande correctement un patch. **Le conflit de consignes n'est donc que partiellement fermé**, puisqu'une instruction auxiliaire réintroduit le format ancien. Le modèle a néanmoins rendu un patch lors de ces essais : on ne peut pas attribuer leur rejet au mauvais format, mais on ne peut pas certifier non plus un prompt sans contradictions.

**Correction attendue :** les producteurs de défauts transmettent la nature du besoin, l'identité et les mesures, pas un ancien mini-prompt complet avec son propre format de retour. Le constructeur commun décide du schéma et du périmètre. Ajouter le cas « complément + autres défauts + foyer de quatre » à la vérification des messages finaux capturés au transport.

## 4. La campagne ne valide pas encore le résultat à plusieurs

Le rapport reconnaît que les rosters de plusieurs personnes ont reçu comme premier jet une recette de plan initialement composée pour une personne. Cela constitue un scénario de réparation difficile, mais pas une mesure de la génération normale pour ces foyers.

Les chiffres du rapport doivent rester séparés :

| Parcours mesuré | Calories | Calories + masse + densité |
|---|---:|---:|
| Banc de référence N=1, `l3b01` | 8/8 | 5/8 |
| Banc de référence N=2, `l3e02` et associés | 14/14 | 6/14 |
| Banc de référence N=4, `l3e04` et associés | 7/28 | 4/28 |
| Réparation réelle adoptée N=1, `h1n1c` | 7/7 | 4/7 |

L'adoption de `h1n1c` montre une amélioration admise par la politique `deliverable_with_gaps`, **pas sept portions pleinement conformes**. Le rejet de la candidate N=4 protège la meilleure version ; le 200 qui livre cette meilleure version ne transforme pas ses écarts en réussite nutritionnelle.

Les rejeux d'archives adaptées à leurs foyers restent favorables : 6/6 et 6/6 à une personne, 12/12 à deux. Ils ne constituent pas une nouvelle preuve à quatre personnes.

Les cas encore manquants sont utiles : validation forcée en panne, isolation d'un lot jusqu'à adoption, création adoptée à quatre personnes, absence de double comptage d'un complément, affichage d'un écart pour la bonne personne, membre protégé et présences variables. Le détail par personne peut être un artefact lié au rapport ; le recopier intégralement n'est pas nécessaire si la preuve est accessible et identifiée.

## 5. Deux conclusions de l'agent à corriger

**« Aucune ligne de ce dépôt ne répare la compétence du modèle » : non établi.** Les prompts observés perdent encore des identités et contiennent un ancien ordre contradictoire. Le périmètre de correction dépend aussi des nombreux défauts de la fixture de départ. Ces variables sont modifiables dans le code et le banc. Les quelques essais présents ne permettent pas de séparer leurs effets d'une limite du modèle.

**« Fabriquer une fixture valide reviendrait à écrire la réponse qu'on prétend mesurer » : confusion de deux tests.** Une fixture construite explicitement, validée avec les fonctions de production, est adaptée à un test déterministe de non-régression. On peut ensuite introduire un défaut connu et vérifier sa réparation sans modifier les attentes d'après le résultat. Elle ne mesure simplement pas la compétence générative du modèle. Pour cette compétence, il faut un premier jet réellement généré pour le foyer considéré, déclaré comme tel, puis figé.

## Décision

Conserver les corrections réalisées. Fermer les deux défauts du message réellement envoyé, terminer les cas déterministes manquants, puis mesurer un parcours adapté à chaque taille de foyer, notamment quatre personnes. La priorité est un protocole attribuant clairement chaque objectif et des entrées représentatives, avant de décider de changer de modèle ou de conclure qu'il ne sait pas faire.
