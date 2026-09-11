# Deux générations réelles après le chantier — mesure du 11 septembre 2026, 15 h

> ## ⛔ CORRECTIF DU 2026-09-11, 16 h — SIX CONCLUSIONS DE CE RAPPORT SONT FAUSSES
>
> Établi par [la revue](REVUE-CAMPAGNE-ET-SAVEUR-2026-09-11.md) et ses preuves
> (`scratchpad/2026-09-11-REVUE-CAMPAGNE/`), rejeu hors ligne avec les fonctions de production.
> **Lire le correctif avant les chiffres ci-dessous.**
>
> | Ce que ce rapport dit | Ce qui est vrai |
> |---|---|
> | PERTE dimanche : 2 370 kcal, **sous** la bande | **2 455,69 kcal** pour une cible de 2 454 — **+0,07 %** |
> | GAIN dimanche : 3 075 kcal, **au-dessus** de la bande | **2 916,14 kcal** pour une cible de 2 912 — **+0,14 %** |
> | « Des ingrédients servis ne sont pas sur la liste de courses » (2 + 7 refus) | **8 des 9 sont des faux positifs de singulier/pluriel** (`citron`/`citrons`, `tomate`/`tomates`…). Le 9ᵉ est une classification absente, pas un achat absent |
> | Durées **−51 %** et **−52 %**, attribuées au chantier | La baisse est réelle, mais les anciens plans portaient **9 créneaux** et les nouveaux **7**. **À charge différente, aucun pourcentage de gain n'est attribuable.** Il faut publier la durée absolue et la charge |
> | Protéines « non applicables » | L'absence de contrôle sur ce chemin est **une exigence non satisfaite**, pas une inapplicabilité |
> | « Aucune tolérance de créneau n'est déclarée dans le dépôt » | Le plan moteur unique écrit **±10 % par repas et ±5 % par journée couverte**. Que la garde soit branchée reste à prouver |
>
> **La cause commune des deux premières lignes est mon erreur de méthode** : le contrôle 1 mesure
> les items des boîtes, le contrôle 5 sommait une autre base (parts conventionnelles). **Un
> rapport ne peut pas mélanger deux bases de mesure** — c'est exactement le reproche que
> l'enquête du matin adressait au rapport précédent, et je l'ai refait.
>
> **Et ce rapport a manqué le défaut le plus grave**, confirmé par les données et le lecteur UI :
> les quantités **affichées** divergent des quantités **calculées**. `PERTE poulet` — 458,66 g
> en données, **360 g dans le texte de la recette**. `GAIN lentilles` — 0,770 cuillère d'huile
> en données, **2 cuillères dans le texte** : le rapport huile/lentilles montré à la personne
> vaut **2,6 fois** celui du calcul.
>
> Reste vrai : zéro réparation modèle de densité, 12 portions dimensionnées dans leurs bornes,
> 11 mesurables à moins de 0,6 % de leur cible, cinq défauts de densité fermés par l'ajusteur.
> **Cela ne fait pas 14 créneaux conformes**, et le premier jet portait encore ces cinq défauts.


> ## ⟳ SECOND CORRECTIF — 2026-09-11, 20 h : CE QUI A ÉTÉ REFAIT, ET CE QUI RESTE OUVERT
>
> Le correctif de 16 h ci-dessus **n'est pas touché** : ses six lignes restent vraies. Celui-ci
> s'y ajoute, après le chantier « Fiabiliser les portions et préserver les recettes » (lots 0
> à F) et **six nouveaux tirs réels** le même soir.
> Preuves : `scratchpad/2026-09-11-FIABILITE-RECETTES/RAPPORT-LOT-F-2026-09-11.md`,
> sorties dans `sorties-lot-F/`.
>
> **Les trois défauts que ce rapport décrivait sont fermés sur le chemin réel :**
>
> | ce que le rapport du matin a mesuré | ce que les six tirs du soir mesurent |
> |---|---|
> | 2 cases livrées **sans portion** (identité alimentaire perdue) | **35 parts sur 36** ; la seule manquante vient d'un `ref` que le modèle n'a pas écrit |
> | **deux cibles** pour la même case, facteur **2,86** | **une seule**, comparée case par case par l'instrument |
> | dîners servis à **241 · 244 · 247 · 228** kcal/100 g, collés au plafond d'un couloir `[250–250]` | dîners à **125 à 138** pour une visée de **135**, sous `[123–250]` — **34 densités sur 36 dans leur couloir** |
> | **64 lignes sur 96** affichaient une quantité qui n'était plus celle du calcul | **1 sur 239**, et c'est un arrondi (« 2 pitas complets » pour 2,00 unit) |
> | 8 alertes d'achats, dont 8 faux positifs de pluriel | **0 faux positif de pluriel** ; à la place, de vrais manques chiffrés (`citron` 104,7 g requis, rien acheté) |
>
> **Et quatre choses restent fausses si on lit ce rapport seul :**
>
> - **« Livré » ne veut toujours pas dire « conforme ».** Les six tirs sortent
>   `deliverable_with_gaps`. La porte finale **voit** désormais `cell_without_portion` et
>   `protein_floor_short` — et ne bloque pas : `FINAL_GATE_POLICY_LOT_4`, qui le ferait, est
>   **écrite et non branchée**.
> - **Le plancher protéique est manqué une journée sur deux.** **7 journées sur 12** sous le
>   plancher applicable, jusqu'à **−43 %**. Le rapport du matin classait les protéines « non
>   applicables » ; le correctif de 16 h a dit que c'était une exigence non satisfaite. Elle
>   l'est toujours, et elle est maintenant **chiffrée**.
> - **Les durées n'ont pas baissé.** À charge identique (6 cases) : **104 · 107 · 134 · 175 ·
>   206 · 207 s**. **Trois tirs sur six dépasseraient le plafond de l'hébergé (150 000 ms)** et
>   ne seraient jamais rendus au client. La variance interne (×2 sur le même chemin) interdit
>   d'attribuer un pourcentage à quoi que ce soit.
> - **Aucune de ces recettes n'a été cuisinée ni goûtée.** Les fiches avant/après sont prêtes
>   (§ 7 du rapport du lot F) ; **la dégustation reste à faire.**

Deux tirs solo, séquentiels, par le vrai handler, sur la pile locale. Kong relevé à 600 s pour
**connaître** la durée ; `functions serve` redémarré à 15:02, donc après toutes les
modifications. Aucune retouche du code entre les deux tirs.

| | plan | request_id |
|---|---|---|
| PERTE · Paul, 178 cm / 88 kg, fat_loss → 78 kg à 0,5 kg/sem | `1f8a8988-b3ed-4b83-a4d0-93297ac0d652` | `f5a3dd19…` |
| GAIN · Max, 178 cm / 62 kg, muscle_gain → 70 kg à 0,25 kg/sem | `1eada05b-2c3d-4ed5-aa85-14edf2840b77` | `ecaf04b2…` |

---

## 0 · Bilan de livraison

| | avant le chantier | après | |
|---|---:|---:|---|
| PERTE | 237 902 ms | **116 860 ms** | **−51 %** |
| GAIN | 286 914 ms | **137 569 ms** | **−52 %** |

**Les deux passent sous le plafond de 150 s de la passerelle.** Aucun ne passait avant.

### D'où vient la durée — appel par appel (`llm_usage_events`)

| | appel | latence | jetons entrée | jetons sortie |
|---|---|---:|---:|---:|
| PERTE | génération | 114 354 ms | 11 055 | 20 386 |
| PERTE | `composition_fill` | 1 666 ms | 550 | 11 |
| GAIN | génération | 133 562 ms | 11 054 | 22 602 |
| GAIN | `composition_fill` | 3 698 ms | 556 | 179 |

⛔ **ZÉRO rattrapage de densité.** Avant : un appel de génération **plus deux réparations**
chacun, soit 347 s de rattrapage sur les deux plans. `repairs_asked 0 · used 0 · allowed 2`.

⚠️ **L'appel unique a grossi.** 11 055 jetons d'entrée contre 8 592 avant (+28,7 %), ce qui
colle au coût mesuré du prompt (`prompt_cost` : 18 285 → 23 002 caractères côté message
utilisateur, **+25,8 %**, dont 4 715 de catalogue pour 121 références). La génération de base
passe de 97 à 114 s (PERTE) et de 79 à 134 s (GAIN).

**Le net est très positif, mais le mécanisme a changé de nature :** on a échangé « un appel
court + deux réparations » contre « un seul appel, plus long ». **GAIN est à 133,6 s pour un
plafond à 150 s.** Il n'y a plus de marge, et elle ne dépend plus du nombre de réparations mais
de la taille du prompt.

---

## 1 · L'ajusteur déterministe, en conditions réelles

```
PERTE  outcome=closed  15 ms  moves_paired=3  consumers_off_before=3 → after=0
       consumers_degraded=0  rejected_would_degrade=0   measure_calls=51
GAIN   outcome=closed  12 ms  moves_paired=5  consumers_off_before=2 → after=0
       consumers_degraded=0  rejected_would_degrade=13  measure_calls=61
```

**Cinq défauts de densité fermés en 27 ms, sans un seul appel modèle.** Zéro portion conforme
dégradée, et sur GAIN 13 candidats refusés précisément parce qu'ils en auraient dégradé une.

⚠️ `reverted_after_measure = 0` sur les deux : la prédiction de densité de l'ajusteur n'a jamais
été démentie par la vraie mesure. C'est le compteur que le lot D disait ne jamais avoir exercé.
**Il l'est maintenant, et il tient.**

---

## 2 · La grille de `docs/keel/mesure.md`

### ⚠️ Avertissement sur l'instrument, à lire avant les chiffres

`scripts/2026-09-11-mesure-grille.ts` **s'est trompé sur deux contrôles** et je le corrige ici
plutôt que de publier ses nombres :

- son **contrôle 1** mesure la part conventionnelle (`planEnergy`), pas les **items écrits dans
  la boîte**. C'est exactement l'erreur que l'enquête du matin avait relevée (§ 1) ;
- son **contrôle 6** extrait les couloirs par une expression régulière qui avale la fin de la
  phrase : il n'a vu qu'un créneau sur trois et a conclu « aucun couloir envoyé » ;
- il charge le référentiel **sans replier le sas** (`indexForReading`), donc il invente des
  trous que le run n'avait pas.

Les chiffres ci-dessous viennent des **compteurs du moteur** et de `boxEnergies` — les
instruments du produit.

### Contrôle 1 · Calories du créneau — mesuré sur les items écrits

| PERTE | cible | boîte | écart | | GAIN | cible | boîte | écart |
|---|---:|---:|---:|---|---|---:|---:|---:|
| ven dîner | 859 | **859** | 0,0 % | | ven dîner | 1019 | — | ⚪ |
| sam p-déj | 614 | **613** | −0,2 % | | sam p-déj | 728 | — | ⚪ |
| sam déj | 982 | — | ⚪ | | sam déj | 1165 | **1162** | −0,3 % |
| sam dîner | 859 | **859** | 0,0 % | | sam dîner | 1019 | **1019** | 0,0 % |
| dim p-déj | 614 | **614** | 0,0 % | | dim p-déj | 728 | **727** | −0,1 % |
| dim déj | 982 | **982** | 0,0 % | | dim déj | 1165 | **1164** | −0,1 % |
| dim dîner | 859 | **859** | 0,0 % | | dim dîner | 1019 | **1025** | +0,6 % |

**✅ PROUVÉ — 11 créneaux mesurables sur 11 tapent leur cible à moins de 0,6 %**, et 9 à moins
de 0,3 %. C'est la mesure des **items réellement enregistrés**, pas d'une intention.

⚠️ Aucune tolérance de créneau n'existe dans ce dépôt : ces écarts sont un **repère**, le verdict
d'énergie vit au contrôle 5.

### Contrôle 2 · Grammage de l'assiette

`final_sizing` — le contrôle qui **ne s'abstient plus pour une bouche** :

```
PERTE  measured=true  reason=remeasured_after_apply  judged=6/6
       verdicts {in_bounds:6, over_max:0, under_min:0, unmeasurable:0}  out_of_bounds=[]
GAIN   idem, 6/6
```

**✅ PROUVÉ — 12 assiettes sur 12 dans leurs bornes de masse, remesurées après application.**
Avant le chantier, ce contrôle s'abstenait entièrement à une bouche (`single_mouth`) et c'est
lui qui avait laissé passer les 727 g.

### Contrôle 3 · Ingrédients comptabilisés

| | lignes | avec identifiant | refusés | non résolus |
|---|---:|---:|---:|---|
| PERTE | 33 | **33 (100 %)** | 0 | 1 · `pita complète` |
| GAIN | 28 | **28 (100 %)** | 0 | 2 · `pita complète`, `petits suisses nature` |

**✅ Le contrat d'identifiant est honoré à 100 %** — le modèle écrit un `ref` sur chaque
ingrédient, et aucun n'est refusé. Provenance des kcal : `table` 100 % (PERTE), 95,7 % table +
4,3 % bornes de groupe (GAIN). **Aucune estimation modèle.**

⛔ **ET POURTANT LA MESURE JETTE CET IDENTIFIANT — voir le § 3.**

### Contrôle 4 · Couverture

**✅ CONFORME.** 7 cases attendues, 7 servies, 0 manquante, 0 doublon, sur les deux plans.

### Contrôle 5 · Cohérence de la journée

| | jour | plats | servi | cible du jour |
|---|---|---|---:|---|
| PERTE | ven | 1/1 | 855 | journée **partielle** (le plan démarre à 15 h) |
| PERTE | sam | 2/3 | 1 601 | **une case perdue** |
| PERTE | dim | 3/3 | **2 370** | bande 2 454–2 602 → **−3,4 %** |
| GAIN | ven | 0/1 | — | case perdue |
| GAIN | sam | 2/3 | 1 997 | case perdue |
| GAIN | dim | 3/3 | **3 075** | bande 2 846–2 978 → **+3,3 %** |

**Le seul jour complet et intact de chaque plan tombe à ±3,4 % de sa bande.** Les autres sont
amputés d'une case — voir § 3.

### Contrôle 6 · Densité — les couloirs réellement transmis

PERTE : `up to 245 kcal per 100 g at breakfast (aim 110, not 142), 141 to 250 at lunch (aim 154, not 207), 250 at dinner — its share does not fit the plate`
GAIN : `104 to 250 at breakfast (aim 114, not 153), 167 to 250 at lunch (aim 183, not 245), 250 at dinner — its share does not fit the plate`

| | couloir | mesuré | |
|---|---|---:|---|
| PERTE p-déj ×2 | ≤ 245, visée 110 | 111,3 · 110,6 | ✅ **à 1,2 % de la visée** |
| PERTE déjeuner | 141–250, visée 154 | 145,7 | ✅ |
| PERTE dîners ×3 | **250, déclaré impossible** | 241,3 · 243,9 · 240,8 | ⚪ couloir intenable |
| GAIN p-déj | 104–250, visée 114 | 126,2 | ✅ |
| GAIN déjeuners ×2 | 167–250, visée 183 | 168,1 · 167,1 | ✅ |
| GAIN dîners ×2 | **250, déclaré impossible** | 246,7 · 228,2 | ⚪ couloir intenable |

**✅ PROUVÉ — tous les couloirs atteignables sont respectés.** `clamped {max:0, min:0}` :
aucune portion n'a eu besoin d'être rabattue.

**La déclaration du modèle s'est rapprochée de la mesure.** `density_check` déclaré contre
mesuré, quand le modèle le déclare :

| | avant (enquête) | après |
|---|---|---|
| écarts | **−25 %** et **−42 %** | −0,2 % · +0,1 % · +3,2 % · −0,2 % · +5,3 % · +11 % · **−21,8 %** |

Cinq déclarations sur sept sont à moins de 5,3 %. C'est le catalogue qui fait ça : le modèle
reçoit désormais les valeurs que le moteur emploiera.

### Contrôle 7 · Sécurité

**⚪ NON APPLICABLE** — aucune allergie, aucun régime, aucune exclusion sur ces deux fixtures.
Les ceintures tournent à vide (`checked: 0`). **Cette campagne ne dit rien de la sécurité** ;
il faut une fixture qui porte une contrainte.

### Contrôle 8 · Protéines

Mesurées, préparations repliées au prorata — PERTE 61 / 146 / 124 g par jour ; GAIN 42 / 111 /
111 g. **⚪ NON APPLICABLE au sens du verdict** : aucune cible de grammage protéine n'est
appliquée sur ce chemin. `protein_anchor_missing []`.

### Contrôle 9 · Recette ↔ stockage

PERTE 7 plats · 3 préparations · 23 lignes de courses · 2 sessions.
GAIN 7 plats · 6 préparations · 26 lignes · 3 sessions.

`final_gate ok=true, blocking=0`, mais **des refus non bloquants** :
`ingredient_not_bought` (PERTE 2, GAIN 7) et `unclassified_perishable` (GAIN).
**❌ Des ingrédients servis ne sont pas sur la liste de courses.** Non bloquant aujourd'hui ;
c'est un vrai défaut de cohérence recette ↔ courses.

### Contrôle 10 · Réparations et livraison

`repairs_asked 0 · used 0 · allowed 2` sur les deux. **Deux plans livrés, zéro réparation, zéro
refus.**

---

## 3 · ⛔ LE DÉFAUT PRINCIPAL — l'identifiant n'atteint pas la mesure

**Deux assiettes sur quatorze n'ont ni énergie, ni dimensionnement, ni boîte.** La personne n'a
donc **aucune portion** pour ces repas.

```
PERTE  sat/lunch   unmeasurable_by = {"unknown_ingredient": 1}   boxes_authored 6/7
GAIN   fri/dinner  unmeasurable_by = {"missing_quantity": 1}     boxes_authored 6/7
```

**Le même ingrédient dans les deux cas, et le modèle avait écrit le bon identifiant :**

| plan | terme écrit | `ref` écrit | ce que la mesure en fait |
|---|---|---|---|
| PERTE | `pita complète` | **`pita_wholemeal`** | terme non résolu ⇒ `unknown_ingredient` |
| GAIN | `pita complète` (1 unit) | **`pita_wholemeal`** | terme non résolu ⇒ pas de conversion ⇒ `missing_quantity` |

`pita_wholemeal` **existe**, il est vérifié, il vaut 265 kcal/100 g et `unit_grams = 60`. Il
était **dans le catalogue envoyé au modèle**. Le modèle a fait exactement ce que le nouveau
contrat demande — il a nommé la référence complète, évitant le piège documenté où
« pita complète » se réduit à `pita_bread` (raffiné).

**Et le moteur a jeté la réponse pour re-résoudre les mots français.**

La cause est un écart de câblage entre deux lots :

- le lot C a posé `refForIngredient()` et l'a branché sur **trois** lecteurs de
  `meal_generation.ts` (`gramsRawForIngredient`, `preparationReadyGrams`, `preparationReadyKcal`) ;
- le lot B mesure l'assiette dans `preparation_mass.ts`, qui appelle `resolveIngredients()` —
  **par terme, jamais par identifiant**.

C'est ce lecteur-là qui rend le verdict. **L'identifiant atteint trois lecteurs et pas celui qui
décide.**

⚠️ **Le coût est double.** Sur GAIN, le sas de réparation a été appelé pour combler le trou et a
**inventé** une ligne `whole wheat pita bread` à 258 kcal, `fill_source: model`, donc
`a_verifier`, donc **non composable**. On a payé un appel modèle pour ré-estimer une valeur
qu'on avait déjà, vérifiée, à 265.

**Correction :** faire passer `preparation_mass.ts` par l'identifiant quand il est présent,
c'est-à-dire hisser `refForIngredient` hors de `meal_generation.ts` pour que les deux lecteurs
partagent la même porte. C'est le premier travail à faire.

---

## 4 · ⚠️ Deuxième défaut — une journée partielle empoisonne le couloir des autres jours

Les **trois** dîners de PERTE et les **deux** de GAIN reçoivent un couloir
« 250 — sa part ne tient pas dans l'assiette », c'est-à-dire **déclaré impossible**.

Or le dîner d'un jour complet vaut 859 kcal (PERTE) : dans une assiette plafonnée à 700 g, il
demande **123 kcal/100 g**, pas 250.

D'où viennent les 250 ? Du **vendredi**, où le plan ne couvre que le dîner parce qu'il démarre à
15 h. `requiredDensityFor` calcule alors « ce dîner porte toute la journée » — 2 454 kcal sur
700 g ⇒ **351 kcal/100 g**, rabattu au plafond de demande de 250 et marqué `above_askable_cap`.
Comme le couloir retient **le plus exigeant de tous les jours**, le vendredi impose sa valeur à
samedi et dimanche.

Pendant ce temps, le **dimensionnement** vise 859 kcal pour ce même vendredi soir, pas 2 454.
**Deux arithmétiques de la même case.**

Conséquence servie : des dîners de **352 à 449 g à 228–247 kcal/100 g** là où un dîner de jour
complet aurait pu faire ~700 g à 123. L'énergie est juste, la forme de l'assiette ne l'est pas.

`docs/keel/mesure.md` demande précisément ceci : « Pour une génération partielle, distinguer la
cible quotidienne du budget des créneaux couverts. » Le dimensionnement le fait. Le couloir non.

---

## 5 · Ce qui est prouvé, ce qui échoue, ce qui n'est pas mesurable

**Prouvé**
- Les rattrapages de densité ont disparu : **0 sur 2 plans**, contre 4 avant.
- Durées **−51 %** et **−52 %**, les deux sous le plafond de la passerelle.
- L'ajusteur ferme **5 défauts en 27 ms**, sans dégrader une seule portion conforme, et sa
  prédiction n'est jamais démentie par la mesure.
- **11 créneaux mesurables sur 11 à moins de 0,6 % de leur cible**, mesurés sur les items écrits.
- **12 assiettes sur 12 dans leurs bornes de masse**, par un contrôle qui s'abstenait avant.
- **Tous les couloirs atteignables respectés**, aucune portion rabattue.
- **100 % des ingrédients portent un identifiant vérifié**, aucune estimation modèle retenue.
- La déclaration du modèle passe de −25 %/−42 % d'écart à ±5 % sur cinq cas sur sept.

**Échoue**
- **2 assiettes sur 14 sans portion du tout**, par un identifiant correct que la mesure ignore.
- **Les dîners reçoivent un couloir impossible** hérité d'une journée partielle.
- **Des ingrédients servis ne sont pas sur la liste de courses** (2 et 7 refus non bloquants).
- Un `density_check` à **−21,8 %** subsiste (GAIN samedi petit-déjeuner).

**Non mesurable**
- **La sécurité** : ces fixtures ne portent ni allergie, ni régime, ni exclusion. Les ceintures
  ont tourné à vide. Il faut une fixture contrainte.
- **Les protéines** : aucune cible n'est appliquée sur ce chemin.
- **N > 1, appétit, repas léger** : non tirés. Quatre cas du § 4 du chantier restent ouverts.
- **Le taux de réussite** : deux tirs disent ce qui s'est passé deux fois. Rien de plus.
