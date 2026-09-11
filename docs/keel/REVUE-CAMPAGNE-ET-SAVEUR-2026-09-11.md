# Revue des deux tirs et de l'ajustement des recettes — 11 septembre 2026

**Avis : progrès réel, chantier encore ouvert. L'ajustement automatique peut modifier le goût. Sur ces deux tirs, les dîners excessivement concentrés viennent déjà du prompt et de la réponse initiale ; l'ajusteur en allège plusieurs. Un autre défaut, confirmé dans les données et le lecteur UI, laisse des quantités affichées différentes des quantités utilisées pour les calculs.**

Revue de `CAMPAGNE-DEUX-SOLO-2026-09-11.md`, des deux plans enregistrés, des réponses brutes et des journaux du handler. Aucun nouvel appel modèle, aucune modification du moteur ou de la base. Rejeu hors ligne avec `boxEnergies`, `indexForReading` et `finalPlanGate` de production.

**1. Ce que la campagne confirme**

- Deux réponses livrées en 116,9 et 137,6 s sur la pile locale configurée pour cette campagne.
- Aucun appel de réparation de densité ; un appel `composition_fill` subsiste sur chacun des deux plans.
- L'ajusteur modifie 6 lignes sur PERTE et 5 sur GAIN : cinq défauts de densité fermés, 27 ms cumulées annoncées par les journaux.
- 12 portions dimensionnées sur 14 créneaux attendus. Ces 12 portions ont une masse dans leurs bornes.
- 11 portions sur ces 12 restent mesurables énergétiquement par le lecteur des boîtes ; elles sont à moins de 0,6 % de leur cible.

Cela prouve une amélioration du traitement des cas observés. Cela ne prouve ni 14 créneaux entièrement conformes, ni la qualité gustative, ni un taux de réussite général. Le premier jet comporte encore cinq défauts de densité corrigés par le moteur ; « zéro réparation modèle » ne veut donc pas dire « premier jet parfait ».

**2. Plusieurs conclusions du rapport sont à corriger**

| Sujet | Rapport | Vérification |
|---|---|---|
| Calories du dimanche PERTE | 2 370 kcal, sous la bande | **2 455,69 kcal** dans les boîtes, cible moteur **2 454** : +0,07 %. |
| Calories du dimanche GAIN | 3 075 kcal, au-dessus de la bande | **2 916,14 kcal**, cible moteur **2 912** : +0,14 %. |
| Ingrédients absents des courses | 2 sur PERTE, 7 sur GAIN | Les 2 alertes PERTE et les **6** alertes `ingredient_not_bought` GAIN sont des **faux positifs de libellé au singulier/pluriel**. La septième alerte GAIN est une classification absente, pas un achat absent. |
| Durée réduite de moitié | Attribuée au chantier | Baisse observée, mais **9 créneaux par ancien plan contre 7 par nouveau plan**. La comparaison ne mesure pas un effet causal de 51–52 % à charge identique. |
| Protéines « non applicables » | Pas de cible appliquée | L'absence de contrôle sur ce chemin est une exigence encore non satisfaite ; elle ne rend pas le sujet non applicable à ces deux objectifs. |
| Absence de tolérance par créneau dans le dépôt | Affirmée | Le plan moteur unique, ligne 530 au moment de cette revue, écrit **±10 % par repas et ±5 % par journée couverte**. Cela ne prouve pas que la garde est branchée. |

Les alertes de courses rejouées sont :

- PERTE : `citron` / `citrons`, `tomate` / `tomates`.
- GAIN : `carotte` / `carottes`, `citron` / `citrons`, `oignon` / `oignons`, `pita complète` / `pitas complètes`, `pomme de terre` / `pommes de terre`, `tomate` / `tomates`.

Les produits sont présents dans les listes enregistrées. Cela vérifie leur présence, pas la suffisance exacte de chaque quantité achetée. La garde compare les mots avec `normalizePantryTerm` et `covers`, sans identité nutritionnelle commune (`final_plan_gate.ts`, autour de 1320–1384).

Les totaux journaliers du rapport ne correspondent donc toujours pas à la somme des portions finales, alors que son contrôle 1 utilise les bonnes portions. Le rapport ne peut pas mélanger ces deux bases de mesure.

**3. Le défaut des identifiants est confirmé et touche aussi le petit-suisse**

Le modèle a bien rendu `ref: pita_wholemeal`. Cette référence figure dans son catalogue. Pourtant les lecteurs qui décident de la mesure repartent du terme français : `preparation_mass.ts` utilise `resolveIngredients`, `plan_proportion_units.ts` construit ses lignes avec `resolveIngredient(term)` et le lecteur `plan_energy_read.ts::readIngredient` ne transmet pas `ref`.

Conséquence confirmée dans les payloads : PERTE samedi déjeuner et GAIN vendredi dîner ont bien une recette, mais **aucune boîte et aucune portion personnalisée calculée**. « Plat présent » et « portion calculée » sont deux contrôles distincts.

Le petit-déjeuner GAIN du samedi révèle la même famille de défauts :

- le modèle reçoit et écrit `petit_suisse_cream_cheese`, autour de **89 kcal/100 g** ;
- le journal du dimensionnement annonce une cible de 728 kcal et une mesure standard de 564 kcal ;
- le lecteur des boîtes rend ensuite `dish_incomplete` pour cette portion de 523 g ;
- **contrefactuel mesuré avec la fonction de production :** mêmes quantités enregistrées, seul le petit-suisse est relié à son identifiant déjà choisi par le modèle → **546 kcal**, soit environ **25 % sous 728**.

Ce dernier chiffre est une mesure du plan enregistré contre la référence demandée, pas une mesure de nourriture effectivement cuisinée ou mangée. Il prouve néanmoins que l'écart déclaré de −21,8 % ne peut pas être attribué au modèle seul : les lectures n'utilisent pas toutes la même identité alimentaire.

La correction doit faire traverser l'identifiant vérifié à **tous** les lecteurs, aux conversions, aux ajustements et à la relecture finale. Ajouter seulement un alias pour « pita complète » laisserait le défaut structurel intact.

**4. La consigne des dîners pousse déjà le modèle vers des plats très concentrés**

Les deux prompts archivés contiennent bien `250 at dinner — its share does not fit the plate`. Le code de `requiredDensityFor` utilise les seuls moments présents dans le jour comme `wholeSlots`, puis agrège les contraintes par nom de créneau. Le vendredi partiel peut ainsi charger le dîner de toute la journée et contaminer les dîners des jours complets.

Le dimensionnement du vendredi vise pourtant 859 kcal sur PERTE et 1 019 kcal sur GAIN. Un budget calculé une fois par personne/jour/créneau doit alimenter à la fois le prompt et la mesure.

Effet concret dans les portions PERTE finales :

- vendredi dîner : **52 g de tahini**, 32 g de tomate et 26 g de laitue, avec le poulet et le pain ;
- dimanche dîner : **48 g de tahini + 16 g d'huile + 31 g de fromage de chèvre**, contre 35 g de tomate et 23 g de laitue, avec le bœuf et le pain.

Ces assemblages peuvent être voulus dans certaines recettes, mais leur caractère très concentré n'est pas expliqué par le seul objectif de perte de poids. Ils sont cohérents avec la mauvaise consigne de densité. Le dimanche, le modèle avait déjà proposé 62 g de tahini, 25 g d'huile et 40 g de chèvre avant ajustement et mise à l'échelle.

**5. Ajuster la taille et changer les proportions sont deux opérations différentes**

Multiplier tous les ingrédients d'une recette par le même facteur conserve leurs rapports, à l'arrondi près. Cela ne garantit pas à lui seul les temps de cuisson, la taille du récipient ou l'assaisonnement, mais ne change pas volontairement la composition relative.

`proportion_adjust.ts` change réellement ces rapports. Comparaison des réponses brutes et des quantités réécrites avant la mise à l'échelle :

| Recette | Ajustement observé |
|---|---|
| PERTE vendredi dîner | Tahini **45 → 40 g**, tomate **20 → 25 g**. |
| PERTE samedi dîner | Huile **15 → 11,3 g**, tomate **30 → 33,7 g**. |
| PERTE dimanche dîner | Huile **25 → 20 g**, tomate **40 → 45 g**. |
| GAIN samedi dîner | Tahini **60 → 45 g**, huile **15 → 11,3 ml**, laitue **50 → 68,7 g**. |

Les chiffres ci-dessus sont ceux de la recette ajustée avant son redimensionnement final, pas les grammages de la portion servie. Les quantités finales dans les boîtes sont différentes.

Sur ces exemples, l'ajusteur allège les dîners ; rien ne démontre qu'il les rend moins bons. Il **peut** cependant changer leur goût et leur texture. Ce risque ne disparaît pas parce que les calories deviennent conformes.

Ses bornes actuelles sont des conventions de quantité : légumes au moins 70 % de l'initial, autres ingrédients au moins 50 %, sources protéiques au plus 150 %, huiles/graisses ajoutées 75–125 %, plafond générique 200 %. Le fromage, le tahini et les fruits à coque ne bénéficient pas du plafond de l'huile. Une autorisation de doubler un ingrédient ou de diviser un autre par deux ne garantit pas l'équilibre d'une sauce ou d'une farce.

Le verrou d'unité du branchement inspecté repose notamment sur la présence de quantités chiffrées dans la méthode. Il ne reconnaît pas une proportion essentielle à la recette. Aucune contrainte de rapport sauce/base, matière grasse/acide ou liquide/féculent n'est portée par les contraintes de consommateurs, qui décrivent des densités.

`consumers_degraded = 0` signifie donc « aucune portion déjà conforme en densité rendue non conforme par l'ajusteur ». Il ne signifie pas « aucune recette dégradée gustativement ». De même, `reverted_after_measure = 0` valide la prédiction numérique locale, pas une préparation culinaire réelle ni l'ensemble des écritures ultérieures.

**6. Un défaut avéré peut faire cuisiner une recette disproportionnée**

Certaines étapes mettent à jour `amount` et les boîtes sans synchroniser le texte `quantity` lu dans l'UI. Exemples enregistrés :

| Préparation | Données structurées finales | Texte de recette |
|---|---|---|
| PERTE poulet | **458,66 g** de poulet | **360 g** de poulet. |
| GAIN lentilles | **60 g** de lentilles et **0,770 cuillère à soupe d'huile** | **60 g** de lentilles et **2 cuillères à soupe d'huile**. |

Le second exemple est particulièrement important : le texte des lentilles a été réécrit, celui de l'huile est resté ancien. Le rapport huile/lentilles indiqué à la personne est environ **2,6 fois** celui utilisé pour le calcul. Ce n'est donc même plus une simple différence de taille globale du lot.

Vérification du chemin UI : `frontend/src/keel/api/mealGeneration.ts::readIngredients` conserve `quantity` et ne transmet pas les quantités structurées ; `CookingSessions.tsx` affiche directement `ing.quantity`. C'est une preuve par données persistées et code du lecteur ; aucun test visuel du navigateur n'a été réalisé dans cette revue.

Le compteur `prose_stale = 0` de l'ajusteur n'invalide pas ce constat : il ne contrôle que sa propre étape, pas toutes les transformations ultérieures. Les quantités affichées doivent provenir de la version **finale** des données structurées.

**7. Ce qu'il reste à corriger, dans l'ordre**

1. Faire suivre les identifiants vérifiés et leurs conversions jusqu'à la portion enregistrée puis relue. Rejouer les deux pitas et le petit-suisse à quantités contrôlées.
2. Utiliser les mêmes budgets par personne/jour/créneau pour le prompt, le dimensionnement et le verdict final. Le vendredi partiel ne doit modifier aucun samedi/dimanche inchangé.
3. Synchroniser toutes les quantités de cuisine et de courses avec les données finales ; tester une préparation partagée et une quantité en cuillères, pas seulement des lignes en grammes.
4. Encadrer l'ajustement selon le rôle culinaire des ingrédients : préserver les proportions des sauces et préparations sensibles, privilégier les accompagnements ajustables, compter l'amplitude du changement. Si cela ne suffit pas, demander une recomposition cohérente. Ne pas ajouter arbitrairement un nouveau pourcentage présenté comme une garantie de goût.
5. Corriger le contrôle des achats par identité alimentaire, puis contrôler aussi leurs quantités. Brancher les exigences finales manquantes, dont les protéines applicables et la présence d'une portion pour chaque case. Le `final_gate` actuel reçoit `energy: null`, `boxContract: null` et une politique qui compte ses défauts ; son `ok=true` ne certifie pas cette conformité complète.
6. Rejouer les recettes archivées avant de repayer une campagne. Ensuite comparer de vrais runs à mêmes horaires/fenêtres/créneaux et distinguer premier jet, ajustement déterministe, réparations modèle. Tester aussi les contraintes alimentaires, N > 1, l'appétit et le repas léger. Pour juger le goût, cuisiner quelques recettes avant/après ; les compteurs seuls ne pourront jamais établir ce résultat.

Les preuves et le script de rejeu sont dans `scratchpad/2026-09-11-REVUE-CAMPAGNE/`. Le référentiel y est une photographie locale prise lors de la revue, pas un instantané attesté de chacun des deux appels. Les compteurs historiques sont conservés séparément ; les empreintes des modules utilisés permettent de repérer un changement ultérieur.
