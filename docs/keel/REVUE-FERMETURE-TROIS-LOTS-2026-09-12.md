# Revue de la fermeture des trois lots — 2026-09-12

**Verdict : amélioration réelle, résultats nutritionnels finaux confirmés sur les trois nouvelles sorties ; fermeture complète non validée.** Trois points concrets restent à traiter : une surface de texte absente du contrôle de sécurité, deux formats de réponse contradictoires pendant la réparation, et une application de patch moins stricte que le contrat prévu.

Revue du code local et du rapport `FERMETURE-TROIS-LOTS-2026-09-12.md`, après lecture du retour d'agent joint par Ahmed. Aucun changement du moteur, appel fournisseur, déploiement ou écriture en base pendant cette revue. Les résultats ci-dessous ne certifient pas la version déployée.

## 1. Les progrès vérifiés

- Le handler `generate-household-meal-v1/index.ts` ne contient plus que deux sites `generateWithGemini` : génération initiale et réparation finale. Les anciennes recompositions ne sont plus réparties entre sept sites supplémentaires.
- `plan_repair_unit.ts` / `plan_repair_context.ts` permettent d'adresser les repas par personne et créneau, les portions manquantes, et les défauts journaliers. `plan_repair_patch.ts` accepte une réparation partielle et une nouvelle préparation partagée ou isolée, avec contrôle du périmètre.
- La politique `perishable_bought_too_early` est bien revenue à `refuse` dans `final_plan_gate.ts`. Le classement de conservation dispose désormais d'un module partagé `food_keeping.ts`.
- **65 tests ciblés relancés : 65 réussis, zéro échec**, dans `plan_repair_unit_test.ts`, `plan_repair_context_test.ts`, `plan_repair_patch_test.ts`, `food_keeping_test.ts`, `shopping_purchases_test.ts`. Je n'ai pas relancé les 6 971 tests annoncés par l'agent.
- Les trois fixtures `lot3f` ont été remesurées séparément avec `analyse-lot-F.ts`, sans réimplémenter les équations :

| Tir | Portions conformes : calories + masse + densité | Réparations modèle archivées | Durée du run archivé |
|---|---:|---:|---:|
| 5 | 6/6 | 0 | 110,859 s |
| 6, deux personnes | 12/12 | 0 | 112,028 s |
| 3 | 6/6 | 0 | 118,183 s |

**24/24 est confirmé pour ces critères, après finalisation par le moteur.** Ce n'est pas une mesure du JSON brut du premier jet, ni une preuve de compétence du modèle à réparer. Trois demandes réussies constituent un signal favorable, pas une estimation fiable du taux de réussite général.

## 2. P1 — Le déroulé d'une session échappe au contrôle de texte

**Reproduit avec `parseGeneratedMeal`, pas simplement déduit d'un commentaire.** Une contrainte `allergenRef: "peanut"`, `severity: "medical"`, locale `fr-FR` est fournie au parseur.

| Emplacement de « Ajouter du beurre de cacahuète au riz. » | Résultat |
|---|---|
| `dishes[].method` | Plat public retiré, `unsafe_candidate` présent, violation localisée au plat. |
| `cooking_sessions[].run_through`, session liée à une préparation valide | Plat et session conservés, texte conservé, `unsafe_candidate: null`. |

La sonde de session utilise une préparation valide de deux portions, un plat qui la référence et une session qui référence cette préparation. Les ingrédients et méthodes des recettes ne nomment pas l'allergène ; seul le déroulé le suggère.

**Cause :** le texte concaténé de contrôle, dans `meal_generation.ts:9100`, inclut plats, préparations, notes de portion et courses, mais pas `cooking_sessions[].runThrough`. `localizeOutputLockBites` ne reçoit pas les sessions non plus. Son appel dans le handler (`index.ts:12652`) conserve cette omission. `GateSession` dans `final_plan_gate.ts:178` ne porte que le jour et les identifiants de préparations.

**Conséquence établie :** cette instruction passe le parseur et ne peut pas être vue par cette localisation finale. Je n'ai pas simulé sa publication par le handler complet ; je ne prétends donc pas avoir observé un plan dangereux écrit en base.

**Correction attendue :** inclure le déroulé dans le contrôle initial et final, localiser la violation, permettre sa correction ou empêcher l'activation tant qu'elle reste. Ajouter un test du vrai handler à transport contrôlé : même allergène uniquement dans la session, aucune activation si le texte persiste, y compris budget épuisé.

**Correction du rapport d'agent :** le problème général de reconnaissance de « beurre de cacahuète » n'est pas reproduit dans le code actuel. La fonction de détection reconnaît le français accentué et non accentué ; le parseur bloque aussi la phrase lorsqu'elle est dans une méthode de recette. Il faut obtenir son exemple exact avant d'accuser le lexique français. Le trou confirmé ici concerne la surface contrôlée.

## 3. P1 — La réparation reçoit encore deux schémas contradictoires

Dans `index.ts:17478`, l'appel de réparation transmet toujours :

```ts
generateWithGemini(
  built.systemPrompt + household.systemSuffix,
  householdUserMessage(`\n\n${c4Composed.text}`),
  // ...
)
```

Or `built.systemPrompt` contient `MEAL_SYSTEM_PROMPT` et son bloc `OUTPUT JSON SCHEMA` (`meal_generation.ts:3574`) avec `dishes`, `preparations`, `cooking_sessions`. Il demande aussi de couvrir toute la période. Le contexte utilisateur exige, via `repairPatchContractLines` (`plan_repair_patch.ts:494`), uniquement `{repair:{base_version,units,preparations}}`.

Le transport conserve cette séparation : `gemini.ts` transmet le système dans `instructions` pour Responses ou dans un message de rôle `system` pour Chat Completions. Ce n'est donc pas seulement une vieille chaîne inutilisée.

**Risque :** le modèle peut rendre le plan complet que le système lui demande ; le lecteur de patch n'en extrait aucune unité applicable. Le conflit est établi ; sa fréquence d'échec avec le fournisseur actuel ne l'est pas, puisque les trois vrais runs n'ont fait aucune réparation.

**Correction attendue :** construire un prompt système de réparation ayant un seul schéma de sortie. Conserver la méthode culinaire, CIQUAL, les conventions cru/cuit et les protections utiles. Tester les deux messages réellement transmis, puis une réparation réelle ciblée lorsque le banc est prêt. Retirer uniquement la phrase `Return the full plan JSON` du contexte utilisateur ne ferme pas ce point.

## 4. P2 — Un patch partiellement mal formé peut être appliqué

Sonde exécutée avec `buildRepairUnits`, `repairScopeOf`, `parseRepairPatch` et `applyRepairPatch` : un plan possède une unité valide en défaut ; la réponse contient une modification valide de cette unité **et** une seconde opération `null`.

```text
parseErrors: ["unit_not_an_object"]
applied: true
rejections: []
title: "Changed"
```

**Cause :** `plan_repair_patch.ts:283` ne rejette les erreurs de lecture que si aucune unité valide n'a survécu. Plus bas, une unité existante explicitement renvoyée mais non parsée est ignorée ; les autres peuvent être appliquées. Une préparation existante annoncée mais absente de la carte parsée est également sautée à l'application.

Ce comportement n'est pas celui du plan §1.5 : « Si une opération est invalide, rejeter la candidate entière ». **Omettre volontairement une unité et fournir une opération invalide sont deux cas différents.** La validation nutritionnelle ultérieure réduit le risque, mais ne rend pas ce contrat atomique.

**Correction attendue :** conserver l'omission autorisée ; rejeter une opération explicitement fournie mais invalide, sur plats comme préparations. Tester une bonne opération accompagnée d'une mauvaise et vérifier que la meilleure version reste intacte.

Autre assouplissement observé : un `base_version` absent est accepté même si le serveur en attend un ; seule une version présente mais différente est rejetée. Le code assume ce choix. Ce n'est pas une preuve de corruption en exécution séquentielle, mais il faut le nommer comme contrôle conditionnel, pas comme vérification systématique de version.

## 5. Ce que les preuves permettent de conclure

- Les six anciennes archives `lot3c` ont été **remesurées**. `analyse-lot-F.ts` relit des résultats persistés ; il ne rejoue pas les réponses à travers la nouvelle orchestration et la reconstruction des achats. Le 50/50 confirme leur conformité actuelle à l'instrument, pas l'absence de régression de tous les chemins modifiés.
- La table §5.3 mélange `composition_fill` et `final_repair` sous « réparations du modèle ». Ce sont un appel auxiliaire de composition et une réparation du plan, à compter séparément.
- Les trois nouveaux runs prouvent une génération complète sans réparation modèle sur leurs scénarios. Les réponses fabriquées du banc prouvent certains comportements du code ; elles ne prouvent pas encore que le modèle sait écrire le nouveau patch utile.
- Le tir 6 remesuré signale deux contrôles protéiques « non jugeables » pour une personne sans objectif déclaré, donc sans plancher applicable dans ce calcul. Ce n'est pas un déficit protéique observé et cela n'annule pas le 12/12 sur calories, masse et densité.
- L'instrument affiche encore des avertissements historiques sur une garde recevant `energy: null`, même sans journal de garde dans la fixture. Ces textes ne constituent pas une nouvelle preuve sur le branchement actuel du handler.

**Décision proposée :** garder cette architecture et les corrections réalisées. Fermer les trois défauts précis ci-dessus, puis éprouver le patch avec le vrai modèle sur une entrée connue en défaut, en archivant messages et réponse. Inutile de reprendre les équations ou d'ouvrir une nouvelle refonte pour traiter ces points.
