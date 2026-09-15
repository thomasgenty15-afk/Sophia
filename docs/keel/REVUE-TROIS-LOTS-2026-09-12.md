# Revue après implémentation des trois lots

Revue locale du 2026-09-12 : compte rendu transmis, `CHANTIER-TROIS-LOTS-2026-09-12.md`, code actuel et archives réelles. Aucun changement du moteur, aucune génération payante, aucun déploiement pendant cette revue.

**Verdict : amélioration réelle et importante des sorties finales. La génération nominale progresse ; la réparation générale et la conservation des achats ne sont pas encore complètement fiabilisées.**

## Résultats vérifiés

Le rapport présent dans le dépôt est plus récent que l'extrait transmis. Sa sélection finale comprend le tir 1 de 05:17 UTC et les tirs 2–6 de 14:19–14:28 UTC, suffixe `lot3c`. J'ai relancé séparément l'instrument de production `analyse-lot-F.ts` sur chacune des six fixtures correspondantes.

| Tir | Créneaux | Personnes | Portions conformes calories + masse + densité | Appels initiaux / réparation / auxiliaires | Durée |
|---|---:|---:|---:|---|---:|
| 1 | 8 | 1 | 8/8 | 1/0/0 | 110,2 s |
| 2 | 7 | 1 | 7/7 | 1/1/1 | 191,2 s |
| 3 | 7 | 1 | 7/7 | 1/0/0 | 109,1 s |
| 4 | 7 | 1 | 7/7 | 1/0/0 | 137,9 s |
| 5 | 7 | 1 | 7/7 | 1/0/0 | 111,3 s |
| 6 | 7 | 2 | 14/14 | 1/0/0 | 99,3 s |

**Total : 43 créneaux, 50 portions, 50/50 conformes sur ces trois dimensions.** Le rapport écrit 43/43 en prétendant y inclure les deux personnes : c'est une erreur de dénominateur, pas une dégradation des résultats. L'instrument donne bien 14/14 pour le foyer de deux.

Les six plans sont livrés. Cinq n'ont aucun défaut dans leur validation persistée ; le tir 2 conserve `session_day_mismatch`. Les trois contrôles protéiques incomplets de la seconde personne restent distincts de la conformité des portions.

**Limite de comparaison :** les nouveaux essais portent sur 7 ou 8 créneaux contre 9 au C6. Ils suivent plusieurs corrections et reprises. Les archives précédentes contiennent notamment un refus de conservation et un 546 ; elles ne doivent pas disparaître de l'historique. On peut conclure que cette sélection finale fonctionne mieux, pas mesurer un gain causal exact ni un taux de réussite général.

## Améliorations effectivement branchées

- Les courses sont produites depuis les ingrédients finaux ; la demande de liste au modèle a été retirée. Les achats oubliés sont créés, les doublons regroupés, les dates recalculées et les blancs d'œuf conservent leur identité propre.
- Les réparations reçoivent les titres, identifiants et ingrédients des unités visées. C'est une correction substantielle de l'ancien contexte sans plan.
- La fusion conserve les unités hors périmètre au lieu d'adopter toute la réponse du modèle.
- Un rejet par le juge n'arrête plus systématiquement la boucle ; budget et temps sont réévalués.
- `cell_bounds_off` distingue les défauts de masse/densité de l'écart calorique ; le contrat est transmis dès le premier jet.
- La frontière d'arrondi dispose d'un traitement déterministe ; une exception de validation finale empêche désormais l'activation silencieuse.

## Trois défauts précis à corriger

### 1. Les défauts journaliers n'ouvrent aucun périmètre réparable

`plan_repair_context.ts:155` (`repairScopeOf`) ne retient que les adresses exactes jour/créneau déjà présentes dans les plats. Un `protein_floor_short` porte une date et aucun créneau ; il aboutit à `cells: []`, toutes les cases gelées et `defectsWithoutCell: 1`. `day_energy_off` présente la même difficulté d'adressage. Le handler utilise directement ce périmètre pour le message et la fusion.

**Reproduction exécutée avec la fonction de production :** deux plats le dimanche + un déficit protéique sur cette journée → zéro case et zéro préparation modifiables.

La correction du premier jet rend ce défaut moins fréquent, mais elle ne répare pas ce recours. Il faut convertir un défaut journalier en unités modifiables de la bonne journée/personne, avec le contexte de demande, puis valider tous leurs dépendants. Les défauts de session/préparation doivent aussi disposer d'un périmètre approprié ; une fusion de plats ne peut pas corriger tous les objets du plan.

### 2. Le prompt autorise une nouvelle préparation que la fusion refuse

`planProjection` propose explicitement de donner au plat une préparation séparée avec un nouvel identifiant lorsque le lot partagé ne peut pas être modifié pour tous. Mais `mergeRepairedUnits` refuse tout changement de `uses` (`plan_repair_context.ts:483`) et ne parcourt que les préparations déjà existantes pour les remplacer.

**Reproduction exécutée :** deux plats partagent `p1`, un seul doit changer ; la candidate le relie à `p2`. Le prompt autorise ce geste, la fusion rend `uses_changed`, aucune case appliquée, seule `p1` conservée.

Il faut permettre une nouvelle préparation explicitement reliée au périmètre autorisé et vérifier ses portions, quantités, courses et conservation, en préservant le lot des autres convives. Le nouveau périmètre doit distinguer les plats dédiés à plusieurs personnes au même créneau : la clé actuelle ne contient que jour/créneau.

### 3. Une règle de conservation a été assouplie

Le code courant de `FINAL_GATE_POLICY_LOT_4` passe `perishable_bought_too_early` en `count`. L'explication « la date a été calculée par nous » justifie une correction déterministe de cette date ; elle ne justifie pas de traiter une incompatibilité réelle de conservation comme un simple écart nutritionnel.

Le faux positif sur le thon en conserve devait être corrigé dans sa classification, ce qui a été fait pour deux références. Pour un produit effectivement périssable, il faut déplacer l'achat, adapter la cuisson/congélation si le plan le permet, puis contrôler à nouveau. Une impossibilité de conservation non résolue ne satisfait pas la règle de livraison d'un plan sûr.

Les causes d'achat ont également changé de sévérité. Dire que les anciens refus ont été corrigés à la source peut être vrai sur les cas rejoués ; dire que les gardes n'ont pas été assouplies en général est faux. Les deux faits doivent rester séparés.

## Réserves déjà admises et encore ouvertes

- Des réparations amont consomment encore le budget avant la collecte complète des défauts. La taille du handler explique la difficulté, mais n'achève pas cette exigence du lot 2. Un découpage général du fichier et la correction de cet ordre d'exécution sont deux travaux à distinguer.
- Le verrou médical peut encore rendre tout le plan indisponible pour un allergène introduit dans une seule unité. Le nouveau périmètre local ne résout pas ce comportement en amont.
- Le stock quantifié est déduit par la reconstruction, mais pas de la même façon par l'audit. Le parcours UI actuel ne l'exerce pas ; ce décalage doit être résolu avant son activation.
- La projection compacte liste les plats sains sans leur contenu complet, tout en demandant encore de renvoyer le plan entier. Elle peut aussi tronquer des lignes. La fusion limite les dommages, mais le modèle reste invité à réécrire des données qu'il n'a pas toutes. Un contrat de sortie réellement limité aux objets modifiables fermerait cette contradiction.

## Latence : mesure utile, conclusion excessive

Les chronologies montrent que l'essentiel du temps écoulé est passé dans les appels fournisseur. Optimiser quelques boucles de calcul ne suffira donc pas à gagner des dizaines de secondes.

Mais « aucune optimisation de notre côté ne peut aider » ne découle pas de cette mesure. Le nombre d'appels, le volume de sortie demandé, la réécriture d'un plan entier pour une petite correction et les budgets autorisés dépendent de notre pipeline. L'attente réseau mesurée ne distingue pas à elle seule file d'attente, raisonnement et génération de la réponse.

Les chiffres comparés ne décrivent d'ailleurs pas tous une demande identique : le tir 2 C6 avait neuf créneaux et un appel initial ; le dernier en a sept, une réparation et un appel auxiliaire. Le plafond fournisseur actuel est de 300 s et le budget de requête de 380 s ; leur compatibilité avec le seuil de 150 s utilisé par le banc reste à traiter dans le chantier de délai.

## Vérifications de cette revue

- Six rejeux de mesure des fixtures finales, sans fournisseur ni écriture en base : tous terminés, total 50/50 portions.
- Deux reproductions ciblées via les fonctions de production : défaut journalier sans périmètre ; nouvelle préparation proposée puis rejetée.
- **87 tests passés, 0 échec** : courses du lot 1, branchement du lot 1, contexte de réparation, collecte des défauts et boucle de réparation. La réussite de ces tests n'invalide pas les deux défauts reproduits : certains tests épinglent précisément le comportement trop restrictif.

Les progrès permettent de conserver l'architecture mise en place. La suite utile est de fermer ces défauts ciblés et de les exercer au transport contrôlé avant une nouvelle campagne coûteuse. Aucune garantie de goût ni de livraison en production ne ressort de cette revue locale.
