# Revue de C6 — progrès réels, clôture non acquise

Revue du 2026-09-12, en lecture du code local, du rapport C6, des prompts et réponses archivés, et des journaux du transport contrôlé. Aucune nouvelle génération payante, aucun changement du moteur, aucun déploiement. Les résultats locaux ne prouvent pas l'état de la production.

**Verdict : conserver les corrections. Les sorties livrées sont mieux encadrées, mais la réparation finale reste mal alimentée et les courses ne sont pas intégralement produites depuis les recettes. Déclarer le chantier clos est prématuré.**

## 1. Ce qui est acquis et ce que les nombres signifient

Source : `CLOTURE-C6-2026-09-12.md`, § 5, confronté aux archives de campagne.

| Mesure | Résultat | Portée |
|---|---|---|
| Livraison | 4 plans sur 6 ; deux refus | Ne pas exclure les refus de la mesure de réussite globale. |
| Calories des portions livrées | 45/45 dans la tolérance | Résultat final après traitement ; ne prouve pas un premier jet correct. |
| Masse des portions livrées | 44/45 dans les bornes | Un dépassement : 631 g pour 630 g. |
| Densité des portions livrées | 41/45 dans le couloir | Quatre écarts : 115 au lieu de ≥116, 181/185, 94/100 et 136/141 kcal/100 g. |
| Protéines | 12 journées évaluées sur 12 au-dessus du plancher | Les anciennes archives avaient 7 journées sur 12 sous le plancher. Les profils, la charge et la sélection des plans livrés empêchent une comparaison causale à conditions identiques. |
| Références au premier jet | 271 lignes pesées sans référence absente ou refusée | Progrès sur le contrat de sortie ; une référence acceptée n'est pas une validation indépendante de chaque valeur nutritionnelle. |
| Quantités persistées | 211 lignes, aucune quantité fractionnaire, trois conventions « pincée » | L'arrondi agit sur les données livrées, pas seulement l'affichage. |
| Courses des quatre plans livrés | Aucun achat déclaré manquant/court ; deux contrôles incomplets | Résultat conditionnel à la livraison : les deux refus concernent précisément les courses. |
| Génération sans réparation du plan | 1 tir sur 6 | Le recours reste fréquent sur cet échantillon. |

Le rapport distingue correctement plusieurs dénominateurs. En revanche, « conformité complète » de la table des portions ne signifie pas que toutes les propriétés du plan ont été vérifiées : des contrôles restent incomplets ou non exécutés.

## 2. Défaut principal : la réparation finale ne reçoit pas le plan à réparer

Chaîne actuelle :

- `generate-household-meal-v1/index.ts:7489` : `householdUserMessage` reconstruit le brief initial et ajoute `extra`.
- `index.ts:17366` : la réparation finale appelle ce constructeur avec la seule instruction de réparation ; ni `meal` ni `mealSourceText` ne sont transmis.
- `plan_defect_pass.ts:453` exige pourtant de conserver exactement noms, aliments, cuisson et identifiants, puis de renvoyer le plan complet avec seulement les changements demandés.
- `_shared/gemini.ts:681` envoie ce message comme `input` ; ce chemin ne rattache pas l'appel à la réponse initiale par un historique ou `previous_response_id`.

**Vérification sur les messages réellement archivés :**

- Tir 1 : le supplément au brief dit « champignons de Paris non achetés » et « mon/breakfast : −19 % contre 614 kcal ». Il ne contient aucun des neuf titres de plats du premier jet, ni son JSON.
- Tir 3 : le supplément dit uniquement « blancs d'œuf non achetés », puis exige de garder tous les autres plats identiques. Aucun des neuf titres initiaux n'y figure.
- Les deux réponses de réparation conservent **0/9 titres exacts** et seulement **2/5 identifiants de préparation**. Ce décompte établit la non-conservation ; il ne mesure pas à lui seul le changement culinaire de chaque recette.

L'absence du plan est un défaut certain du contexte fourni. Son rôle dans les recompositions est fortement étayé, mais la taille du gain apporté par sa correction demandera un essai contrôlé. Ces essais ne permettent pas d'attribuer l'échec à une incapacité intrinsèque du modèle.

**Correction attendue :** transmettre la version finalisée retenue, les contrats et mesures des éléments concernés ; demander des modifications identifiées ; fusionner en conservant les éléments sains, puis remesurer. La consigne « ne change rien d'autre » ne remplace pas ces données.

## 3. Les instructions perdent parfois la nature réelle du défaut

Dans `final_plan_gate.ts:1957`, `energy_off` et `bounds_off` produisent le même code `cell_energy_off`. Si `deltaPct` existe, le texte décrit seulement l'écart calorique, même quand le problème est la masse ou la densité.

Preuve : le prompt de réparation finale du tir 4 demande de corriger :

> sun/breakfast : 0 % contre 728 kcal visées
> sun/lunch : −3 % contre 1 165 kcal visées

La masse 631/630 est décrite séparément, mais le déficit de densité du déjeuner n'est pas exposé numériquement dans cette instruction. Le modèle relit les contraintes générales ; il n'obtient pas le diagnostic précis que le moteur possède.

Il faut transporter séparément : calories réelles/cible/tolérance, masse réelle/bornes, densité réelle/couloir. Ne pas demander une correction calorique quand ces calories sont déjà acceptables.

## 4. Une candidate rejetée peut arrêter la réparation avant épuisement

`index.ts:17277` positionne `c4Stop = true` après le rejet par `judgeCandidate`, restaure la meilleure version et la refinalise. La condition `!c4Stop` empêche un nouvel appel. Un rejet avant finalisation ou une absence de candidate produit aussi un arrêt (`index.ts:17431`).

Les tirs 1 et 3 ont chacun effectué **une seule réparation finale**, puis ont été refusés. Ils n'ont pas épuisé deux réparations de plan. Le code actuel ne réessaie pas après ce rejet, indépendamment de la disponibilité éventuelle du budget.

La formulation « deux adoptions possibles » n'est donc pas une description fiable du contrat. Le budget compte des tentatives ; un appel rejeté consomme bien une tentative. L'arrêt précoce est une règle supplémentaire.

**Correction attendue :** rejeter la candidate dégradée, conserver la meilleure version, puis réévaluer l'intérêt et la faisabilité d'une seconde tentative avec le budget et le temps restants. Ne pas assurer qu'un second essai réussira.

## 5. Les courses sont seulement partiellement reconstruites

`shoppingNeedsOf` calcule bien les besoins depuis les ingrédients des plats et préparations. Mais `rebuildShoppingQuantities` parcourt les lignes existantes et en recalcule les quantités. À `shopping_rebuild.ts:344`, le code refuse explicitement d'ajouter une ligne absente du modèle pour conserver le signal d'omission.

Cela ne remplit pas entièrement C3, qui demandait de produire les achats depuis le plan final. Le modèle décide encore quels achats existent ; le calcul ne fait que corriger leurs quantités.

- **Tir 1 :** les champignons étaient présents. Faux refus d'identité introduit par l'interaction des lecteurs ; correction présente et même réponse rejouée avec succès. Conserver le refus historique dans la campagne.
- **Tir 3 :** quinze blancs d'œuf demandés, dix-neuf œufs entiers listés. Le catalogue ne déclare pas leur relation d'approvisionnement. Ce défaut ne prouve pas que la recette est nutritionnellement mauvaise ; il expose une représentation d'achat incomplète.

**Correction attendue :** produire toutes les lignes nécessaires depuis les besoins finaux, conserver le lien vers leurs ingrédients, traiter explicitement conversions cru/cuit, unités, lots et éventuelles substitutions d'achat. Les œufs entiers/blancs nécessitent une règle déclarée ou un achat de blancs, pas une équivalence de noms inventée.

Passer `ingredient_not_bought` de `refuse` à `count` peut modifier la politique de livraison, mais ne construit aucun achat. La solution n'est pas de choisir entre « tout refuser » et « masquer le manque ». Les omissions initiales peuvent rester mesurées même après leur correction déterministe.

## 6. Le tableau des appels du rapport est incomplet

Les `echanges_resume` des JSON réels, événements `attempt_start`, donnent :

| Tir | Génération initiale | Réparations du plan | Résolution alimentaire supplémentaire | Total fournisseur observé |
|---|---:|---:|---:|---:|
| 1 | 1 | 1 finale | 0 | 2 |
| 2 | 1 | 0 | 0 | 1 |
| 3 | 1 | 1 finale | 0 | 2 |
| 4 | 1 | 1 densité + 1 finale | 1 `density_repair_fill` | 4 |
| 5 | 1 | 1 densité + 1 finale | 1 `density_repair_fill` | 4 |
| 6 | 1 | 1 finale | 0 | 2 |

Le compteur `c4CallsMade` décrit uniquement la passe finale. Le tableau § 5.7 le présente comme un total de réparations et omet notamment la réparation finale du tir 4. La limite de deux recompositions n'est pas dépassée dans ces archives ; il existe néanmoins un autre appel fournisseur sur les tirs 4 et 5. **Six tirs = six demandes de plan, pas six appels fournisseur.**

La consommation anticipée du budget par la densité reste possible. Le fait qu'un scénario contrôlé répète une mauvaise réponse accentue cette situation ; son absence sur six générations nouvelles ne prouve pas qu'elle soit impossible en usage réel.

## 7. Sécurité, arrondi, protéines et qualité culinaire

- **Sécurité : progrès réel.** Les essais contrôlés exercent les exclusions dans une réparation et conservent la version saine. Pour l'allergène initial, le journal contient bien un `unfed_retry` avant le refus ; il serait faux de dire qu'aucune réparation n'a été tentée. En revanche, le verrou médical rend les six plats indisponibles pour une injection sur un plat : le comportement n'est pas une réparation locale conservant les cinq plats sains.
- **Une exception de la garde finale laisse continuer la livraison** avec `validation: null`. L'absence d'un verdict « conforme » ne remplace pas le contrôle manquant. Cela ne démontre pas que les autres protections ont échoué, mais interdit de garantir que toute livraison a passé la validation finale.
- **Arrondi : conserver le principe choisi.** Le dépassement de 1 g est un petit défaut de cohérence entre arrondi et borne ; il ne justifie pas de revenir aux fractions ni de demander une recomposition complète. Définir le traitement déterministe de frontière, puis remesurer énergie et masse.
- **Protéines : le plancher est atteint, pas l'optimalité démontrée.** Le rapport donne notamment environ 276–292 g pour un plancher de 176 g. Sans conclure à un risque médical, cette marge n'est pas un critère de meilleure recette. Contrôler si les instructions conduisent à surcharger certains composants.
- **Saveur : non prouvée.** Aucun plat cuisiné. Préserver les proportions et mesurer les transformations est utile, mais n'établit pas que le plat est savoureux. L'exemple « poulet 440 → 762 g » décrit dimensionnement plus arrondi, pas l'effet du seul arrondi au gramme.
- **Repas léger :** testé avec la bonne source au transport contrôlé, mais toujours mal configuré dans la campagne réelle.
- **Délai :** cinq durées dépassent le seuil de 150 s utilisé par le banc. Aucun nouveau contrôle de l'hébergement n'a été fait dans cette revue ; la fiabilité dans son délai reste à démontrer. Le diagnostic 546 peut rester séparé comme demandé.

## 8. Priorité des suites

1. Achever les achats calculés depuis les recettes finales ; supprimer les refus dus à cette dépendance au modèle.
2. Fournir le plan actuel aux réparations et les mesures de chaque contrainte réellement violée ; préserver les unités saines à la fusion.
3. Retirer l'arrêt systématique sur une première candidate rejetée, sous le même plafond d'appels et de temps.
4. Régler la frontière d'arrondi sans recomposition ; distinguer validation échouée, non exécutée et écart toléré.
5. Rejouer les cas fautifs puis mesurer une petite campagne à demandes identiques : premier jet, après calcul, chaque réparation, version livrée, appels totaux. Conserver les échecs dans le dénominateur.

La proposition finale de l'autre agent (courses entièrement calculées, politique de livraison revue) n'est pas implémentée dans le code examiné. Elle ne suffit pas, à elle seule, à corriger l'absence du plan dans le contexte de réparation.

## Vérification effectuée pour cette revue

97 tests locaux passés, 0 échec : `shopping_c3_test.ts`, `quantity_render_test.ts`, `plan_defect_pass_test.ts`, `plan_repair_loop_test.ts`. Ces tests vérifient les modules actuels ; leur réussite ne prouve pas le bon assemblage du contexte envoyé au modèle. Aucune campagne complète relancée.

Preuves primaires : `scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/campagne-tir{1..6}-c6-*.json` ; `scratchpad/2026-09-11-CLOTURE/c6/allergene-generation-medicale.txt` ; code cité ci-dessus. Les liens de ligne désignent l'état local lu pendant cette revue et peuvent bouger avec les travaux concurrents.
