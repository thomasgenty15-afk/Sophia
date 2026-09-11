# Enquête sur les deux générations du 11 septembre 2026

## Conclusion

Les écarts ont plusieurs origines. Le rapport initial mélange deux modes de mesure des portions et surestime donc certains échecs. Les réparations améliorent effectivement les recettes. Mais le référentiel reconnaît certains aliments français comme d’autres aliments, la fusion des réparations peut dissocier le titre d’un plat de ses préparations, et le calcul de masse change selon que les préparations sont mesurées ensemble ou séparément.

**Changer de modèle ou ajouter un troisième rattrapage ne corrigerait pas ces défauts déterministes.** Pour réussir dès la première génération, il faut d’abord rendre fiables l’identité des aliments et la mesure, puis donner au compositeur les données numériques qu’il doit effectivement respecter.

## Méthode et limites

- Lecture seule des deux plans `5fad22ce-d181-4a0c-b0b5-77caf65092b5` et `a18f522e-41f9-469e-9c50-1d693d892ce6`, de leurs six réponses modèle, six consignes et journaux de requête.
- Aucun nouvel appel modèle, aucune modification de base ou de code applicatif.
- Rejeu hors ligne avec les fonctions de production : `parseGeneratedMeal`, `spliceReworkableUnits`, `standardPortionOf`, `plateBoundsFor`, `sizeDishForMouth`, `clampToBounds`, `applySizing`, `planEnergy` et `boxEnergies`.
- Les plats acceptés à chaque fusion sont ceux des traces réelles. Ce rejeu ciblé ne remplace pas un test intégral du handler et de ses gardes.
- Sur les 18 plats après deuxième réparation, les kcal, grammes cuits et densités des parts standards reproduisent **exactement** les journaux de génération. Cela ancre la comparaison malgré le travail simultané dans le dépôt.
- Le référentiel utilisé pour le rejeu est celui exporté lors de l’enquête, pas un index historiquement enregistré par chaque requête. L’accord exact avec les journaux établit la reproduction des cas étudiés ; il ne prouve pas que tout le référentiel était identique.
- Preuves, consignes, entrées et script : `scratchpad/2026-09-11-ENQUETE-DEUX-DIRECTIONS/`. Empreintes des principaux modules figés dans `preuves.json`.

## 1. Le rapport mesure parfois une autre portion que celle servie

`scripts/2026-09-11-mesure-grille.ts` appelle `planEnergy(readDishes(...))`. Ce lecteur exploite `uses.servings / servingsMade` : une part conventionnelle de chaque préparation. Mais le grammage du rapport vient des **boîtes personnalisées**, dont les prélèvements peuvent différer de cette part.

Le rapport divise donc parfois les calories d’une part par la masse d’une autre. La fonction existante `boxEnergies(readEnergyBoxDishes(...))` suit les items effectivement présents dans chaque boîte.

| Assiette | Cible moteur | Kcal du rapport | Kcal des items de boîte | Densité rapport → boîte |
|---|---:|---:|---:|---:|
| PERTE vendredi dîner | 858,9 | 757 | 857,9 | 114,7 → **130,0** |
| PERTE samedi dîner | 858,9 | 788 | 859,0 | 114,2 → **124,5** |
| GAIN samedi déjeuner | 1 164,8 | 1 067 | 1 162,4 | 146,8 → **159,9** |

Les deux dîners PERTE respectent ainsi leur minimum de 123 kcal/100 g. Le déjeuner GAIN reste sous 167, mais **son énergie est presque à la cible** : son problème est la masse de 727 g, supérieure à 700 g.

Avec le référentiel actuel, les totaux des boîtes sont :

| Jour | PERTE | GAIN |
|---|---:|---:|
| Vendredi | 2 452,9 | 2 910,3 |
| Samedi | 2 454,7 | 2 905,4 |
| Dimanche | 2 451,6 | 2 904,8 |

PERTE vise 2 454 kcal/j : les différences de quelques kcal après arrondi ne sont pas le manque de 102 kcal annoncé vendredi. Au sens strict de la bande affichée, vendredi et dimanche restent légèrement sous sa borne basse. Ce constat ne valide pas les aliments utilisés pour calculer ces nombres : voir le défaut suivant.

**Autre erreur de cible dans le rapport :** la moyenne de la bande affichée n’est pas nécessairement la cible moteur. Pour PERTE, le moteur vise 2 454 ; la bande est 2 454–2 602, car le plafond de déficit relève son bord bas. Le rapport utilise son milieu, 2 528, et crée ainsi un écart apparent d’environ 3 % jusque sur les petits-déjeuners correctement dimensionnés.

Pour GAIN, les « 66 kcal inexpliquées » de l’annexe sont simplement la différence entre le centre 2 912 et le bord bas 2 846. Le bord haut vaut 2 978 : la bande est bien centrée sur 2 912. Ces chiffres ne démontrent aucune divergence d’estimateur.

## 2. Le référentiel fournit des chiffres pour le mauvais aliment

Le résultat « zéro ingrédient non résolu » est exact. Sa conclusion « référentiel vérifié, tout est correct » est fausse.

| Terme du plan français | Référence utilisée | Problème constaté |
|---|---|---|
| `raisin` | `raisin`, 321 kcal/100 g | Référence de fruit sec ; le plan décrit du raisin coupé. La référence `grapes`, « Raisin, cru », existe à 68,9. |
| `raisins` | `raisins`, CIQUAL « Raisin, sec », 321 | Le nom français ne spécifie pas des raisins secs. Le contexte de ce petit-déjeuner ne lève pas cette ambiguïté. |
| `prune`, `prunes` | `prune`, 229 | Collision avec l’anglais *prune*. Les recettes françaises décrivent des prunes coupées. La référence fraîche `plum` existe à 46, source manuelle. |
| `poire` | `pear`, code CIQUAL 20039 | La ligne porte littéralement **« Poireau, cru »**, 32,3. Le problème est dans le rattachement de la référence elle-même. |

`resolveIngredient` essaie le slug direct avant les alias. Les mots français `raisin` et `prune` rencontrent donc des identifiants anglais valides : aucune erreur de résolution ne peut apparaître. Une correction des alias seule ne suffirait pas nécessairement.

### Impact mesuré sans changer les quantités

Contrefactuel local : conserver toutes les quantités enregistrées et remplacer seulement les termes de raisin/prune par les références fraîches déjà présentes. Il ne s’agit pas d’une nouvelle génération, ni d’une mesure de consommation réelle.

| Petit-déjeuner | Kcal avec les références actuellement choisies | Kcal avec les références fraîches |
|---|---:|---:|
| PERTE samedi | 614 | **388** |
| PERTE dimanche | 613 | **356** |
| GAIN samedi | 728 | **427** |
| GAIN dimanche | 728 | **475** |

La correction sur GAIN samedi suppose que « raisins » désigne ici le fruit frais ; elle doit être confirmée par une désignation non ambiguë dans le contrat. Les mentions de fruits coupés étayent directement les autres cas. Le contrefactuel ne corrige pas la poire, ni toutes les autres références.

**Conséquence :** le moteur croit avoir beaucoup d’énergie, applique un facteur trop petit et sert une portion trop faible pour l’aliment réellement décrit. Ce défaut est présent dès la première génération et reste invisible aux réparations, puisqu’elles utilisent le même référentiel.

Les écarts `density_check` du modèle ne peuvent donc pas tous être interprétés comme des erreurs du modèle : certaines comparaisons opposent du fruit frais à du fruit sec.

## 3. Ce que font réellement les trois étapes

Le tableau suivant applique les calculs du moteur, avec les références actuelles. Il décrit l’état **avant application finale**, pas une validation nutritionnelle indépendante.

| Plan | Première génération | Après rattrapage 1 | Après rattrapage 2 |
|---|---:|---:|---:|
| PERTE : plats dont la portion cible dépasserait les bornes | **3** | **3** | **0** |
| PERTE : kcal perdues si on bornait ces portions à cette étape, sur trois jours | 366 | 91 | 0 |
| GAIN : plats dont la portion cible dépasserait les bornes | **5** | **2** | **0** |
| GAIN : kcal perdues si on bornait ces portions à cette étape, sur trois jours | 697 | 137 | 0 |

### Première génération : le modèle déclare des densités qu’il ne sait pas vérifier exactement

Deux exemples où le moteur demande ensuite une réparation :

- PERTE poulet/quinoa/yaourt : **141 déclarés**, **105,4 mesurés**, minimum demandé 123.
- GAIN lentilles/pain/feta : **159 déclarés**, **92,2 mesurés**, minimum demandé 146.

Le couloir est réellement présent. CIQUAL et le poids cuit sont explicitement nommés. En revanche, le modèle ne reçoit ni les références effectivement sélectionnées, ni leurs valeurs et rendements exacts ; **aucun outil de calcul n’est fourni** (`has_tools: false`). Il doit deviner une partie de la table, de la conversion des quantités et des masses cuites, puis s’autocontrôler.

Le bloc de calcul n’explicite pas non plus, dans ses étapes, le prorata de chaque préparation partagée. Le contrat général parle d’un tirage par plat, mais la réparation cite des quantités de casseroles entières sans afficher le nombre de tirages ni la contribution calorique et massique de chaque composant. Cela laisse une ambiguïté évitable. Son impact exact n’est pas isolé par ces deux seuls runs.

Le prompt comporte aussi des consignes concurrentes : un plat principal générique de 600–750 g dans le système, un ordre individuel demandant d’écrire les grammes, puis un bloc demandant de ne produire que la recette standard et aucune portion individuelle. Ce sont des défauts de contrat établis ; leur contribution chiffrée aux écarts n’est pas démontrée ici.

**Diagnostic :** la première composition manque parfois de densité, mais le dispositif d’autovérification ne lui donne pas les mêmes nombres qu’au moteur. Deux générations ne permettent pas de conclure qu’un autre modèle réglerait cela.

### Premier rattrapage : amélioration réelle, correction encore insuffisante

PERTE : le plat poulet/quinoa/yaourt passe de **105,4 à 118,4**, encore sous 123. Les deux autres plats visés passent de **119,9 à 133,6** et de **125,5 à 138,1**, encore sous 141. Le modèle réduit les légumes aqueux et augmente l’huile ; il va dans le bon sens, mais s’arrête trop tôt.

GAIN : le plat lentilles/pain/feta passe de **92,2 à 139,0**, encore sous 146. Plusieurs autres plats rentrent dans leurs bornes. Le premier appel est limité à quatre plats alors que cinq dépassaient : le cinquième n’est pas explicitement demandé, mais bénéficie de préparations communes corrigées.

Dire que les réparations n’ont « rien acheté de mesurable » contredit donc les traces.

### Deuxième rattrapage : il ferme le contrôle intermédiaire, mais produit aussi des incohérences

La réparation reçoit le brief initial et les recettes à corriger, pas le JSON complet du plan courant. Les demandes identifient les plats par **titre**, sans date/créneau ni identifiant stable de plat, et demandent pourtant de rendre **tout le plan JSON** en laissant le reste inchangé.

Les réponses réorganisent effectivement des cases et réécrivent des plats non concernés :

- PERTE : au deuxième appel, le déjeuner poulet/feta est déplacé au vendredi ; la case du samedi reçoit la variante poulet/tomate/pain. Une autre case devient un plat de saumon et est rejetée par la garde.
- GAIN : au premier appel, les plats du samedi midi et soir sont intervertis.

`spliceReworkableUnits` retrouve le plat par case et copie son **titre, sa méthode et ses ingrédients frais**, mais conserve ses **anciens liens `uses`**. Les préparations sont remplacées séparément par identifiant.

Résultat enregistré pour GAIN :

- samedi déjeuner, titre « Saumon avec couscous, légumes rôtis et amandes », mais liens vers **`prep_lentil_ratatouille` + `prep_couscous`**, aucun saumon ;
- samedi dîner, titre « Lentilles, couscous, feta, amandes et pain », mais liens vers **`prep_salmon` + `prep_couscous` + `prep_roasted_vegetables`**.

La garde d’identité tolère ces changements parce qu’une proportion suffisante des ingrédients subsiste. Elle ne garantit pas que l’aliment principal nommé dans le titre est toujours présent dans le plat effectivement assemblé.

Au deuxième appel GAIN, une modification d’une casserole partagée améliore même le dîner dont la réécriture directe a été rejetée. Une réparation doit donc être évaluée sur **tous les plats qui consomment les unités modifiées**, pas seulement sur les cases acceptées.

Enfin, la fusion ne met pas à jour `densityCheck`. Une déclaration du premier jet reste attachée à une recette remaniée : comparer ce champ final à la mesure finale n’évalue pas forcément la dernière réponse du modèle.

## 4. Les 727 g : un défaut déterministe de traitement de l’eau

Cas GAIN samedi déjeuner, après deuxième réparation :

| Mesure de la part standard | Masse |
|---|---:|
| Frais mesuré séparément | 20 g |
| Préparation de lentilles mesurée séparément | 548,5 g |
| Préparation de couscous mesurée séparément | 332,5 g |
| **Somme des composants** | **901 g** |
| **Même contenu mesuré en une liste aplatie** | **811 g** |

Les **90 g** de différence sont de l’eau dans la préparation de lentilles.

`weighedReadyGrams` retire toutes les lignes d’eau dès qu’il voit un ingrédient `grain_absorbs`. Quand `standardPortionOf` aplatit les deux casseroles dans une seule liste, le couscous fait donc disparaître aussi l’eau de l’autre casserole. Quand `applySizing` mesure chaque casserole séparément, cette eau reste comptée.

Le moteur dimensionne sur une part de 811 g et annonce **657 g**. L’applicateur compose les boîtes depuis les préparations séparées et écrit **727 g** après mise à l’échelle et arrondis. Le défaut est reproduit dès `applySizing`, sans génération ni mutation ultérieure.

**Ce n’est pas une densité ratée par le modèle à cette étape : le même moteur donne deux masses au même assemblage.** La règle d’eau doit s’appliquer à l’unité de cuisson concernée. Remplacer simplement `grain_absorbs` par « tout aliment absorbant » ne suffirait pas : il faut aussi distinguer l’eau absorbée de l’eau conservée dans une sauce ou un bouillon.

Le contrôle final appelle un chemin qui s’abstient pour `single_mouth`. Il laisse donc passer ce dépassement réel sans reprendre le verdict établi sur les 657 g théoriques.

## 5. D’autres conclusions du rapport à retirer ou nuancer

- **Absence de boîtes émises par le modèle : comportement demandé.** La consigne archivée dit explicitement de ne jamais écrire de boîte, puisque l’application les calcule. Ce n’est pas une désobéissance à réparer.
- **Les trois petits-déjeuners GAIN sont différents.** Ils atteignent chacun environ 728 kcal parce que le moteur les redimensionne vers la même cible, pas parce que la recette est répétée.
- **Les bornes sont disponibles dans les journaux.** Leur absence dans la ligne de plan est une lacune de traçabilité, mais elles sont récupérables pour ces runs : notamment 250–700 g sur les repas concernés.
- **« Aucune constante protéique en g/kg dans le dépôt » est faux.** `meal_envelope.ts` contient notamment `PROTEIN_FLOOR_G_PER_KG` et `proteinFloorG`. Leur présence ne prouve pas que le chemin livré contrôle effectivement ces objectifs ; cette intégration reste à vérifier séparément. Les protéines par boîte doivent aussi suivre les vrais prélèvements de préparations.
- **Fast est déjà actif.** Les six appels sont `gpt-5.6-luna`, effort `high`, `service_tier_sent: fast`, accepté sous `priority`. Proposer d’activer Fast ne changerait donc rien à ces runs.
- **Les réparations expliquent une grande partie du temps de ces deux requêtes**, mais deux observations ne prouvent pas qu’elles expliquent toute la variance historique. La compatibilité avec le délai de la production doit être vérifiée sur sa configuration effective ; un commentaire de configuration locale ne constitue pas cette preuve.

## 6. Ordre de correction pour viser la réussite au premier jet

1. **Fiabiliser l’identité alimentaire.** Séparer termes localisés et identifiants de référence, lever frais/sec, auditer les rattachements CIQUAL des aliments effectivement utilisés. Ajouter des cas `raisin`, `prune`, `poire` ; mesurer la justesse du rapprochement, pas seulement son existence.
2. **Unifier la mesure de l’assiette finale.** Même composition, mêmes prélèvements de préparations et même règle d’eau pour le calcul des facteurs, l’écriture des boîtes, les contrôles, l’écran et le banc. Un verdict calculé avant application ne valide pas les quantités écrites.
3. **Rendre le contrat de composition calculable dès le départ.** Fournir les références alimentaires sélectionnées, coefficients et rendements pertinents ou un accès à un calculateur déterministe. Le modèle compose la recette ; une mesure réelle décide de la conformité. Nettoyer les consignes concurrentes de recette standard, portion et boîte.
4. **Éviter que toute correction numérique exige une nouvelle génération complète.** Étudier un ajustement déterministe borné des proportions d’ingrédients autorisés, après résolution du référentiel, avec contrôle du goût/identité par règles explicites. Une simple multiplication uniforme change la portion, pas la densité ; elle ne suffit pas à ce travail.
5. **Réserver le rattrapage modèle à une vraie recomposition.** Envoyer seulement les unités à corriger, leurs identifiants immuables, cases, consommateurs, grammes/kcal mesurés et écarts. Demander un patch limité. Vérifier ensemble titre, méthode, ingrédients et liens de préparations ; remesurer tous les consommateurs touchés.
6. **Fermer le contrôle final pour N = 1 comme N > 1.** Calories, masse et références sur le payload écrit ; anomalie résiduelle explicite. Traiter les arrondis avec une règle déclarée, sans faux objectif reconstruit depuis le milieu d’une bande asymétrique.
7. **Mesurer séparément le succès sans rattrapage, après un et après deux.** Réutiliser d’abord ces six réponses archivées pour vérifier les corrections déterministes. Une nouvelle petite campagne sera nécessaire pour mesurer l’effet d’un nouveau prompt ; elle ne doit pas être remplacée par une promesse de réussite.

L’augmentation du nombre de rattrapages ou le changement de modèle ne sont pas les premières actions justifiées par ces preuves.
