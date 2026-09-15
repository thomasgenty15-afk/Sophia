# Cas 07 — la mémoire : deux sources, trois destinations

**Le cas 06 plus tout ce que le produit peut retenir d'une personne.** Corps,
activité, appétit, interdits, shaker, forfaits, tradition, équipement, grille de
présence, gamelle et objectif de prise ne bougent pas.

C'est le dernier étage : **ce que le produit se rappelle d'une semaine sur
l'autre.**

Socle : `2026-08-21-CAS-06-PRESENCE-GAMELLE-ET-OBJECTIF.md`.
Design : `2026-08-21-DESIGN-MEMOIRE.md` — lots M1 à M8.

> ⚠️ **Ce déroulé décrit l'architecture DÉCIDÉE, pas celle qui tourne.**
> Aujourd'hui le chat écrit dans un magasin parallèle, les indices n'existent
> pas, le mémo non plus, et il n'y a pas de centre de notifications.

---

## 1. Les trois entrées de la semaine

| d'où | ce qui est dit | où ça va |
|---|---|---|
| **le bilan** *(plan précédent)* | « as-tu cuisiné ? » → **en partie** | **indice** de rapidité ↓ |
| | « les portions ? » → **trop**, pour **lui** | **indice** de portions ↓ |
| | plus jamais → **dhal de lentilles rouges** | **champ** · aliments évités |
| | encore → **poulet rôti aux herbes** | **champ** · aliments aimés |
| | « eu faim entre les repas ? » → non | l'accent de la génération suivante |
| **le brouillon** *(2 notes)* | « pas de friture cette semaine » | **ce plan-ci seulement** — rien ne persiste |
| | « Mathilde danse le mardi, il lui faut un gros repas » | **le mémo** |
| **le chat** | « je crois que je suis aussi sensible aux fruits à coque » | ⛔ **RIEN** — bouton vers la section allergies |
| | « je n'aime pas trop le topinambour » | ⛔ **RIEN** — bouton vers les aliments évités |

⚠️ **Le chat n'a rien écrit.** Deux phrases importantes, zéro ligne en base.
C'est le prix du design, et la contrepartie de tout le reste : **rien n'arrive
dans un plan sans qu'un écran le montre.**

⚠️ **Les N notes de brouillon sont analysées UNE FOIS, après validation** — pas à
chaque note, sinon on classe des allers-retours.

---

## 2. La règle qui range les trois destinations

> **Un fait singulier va au mémo. Un degré va à un indice. Tout le reste va dans
> son champ.**

| ce qui est dit | pourquoi cette destination |
|---|---|
| « dhal de lentilles rouges, plus jamais » | un **champ existe** — aliments évités |
| « c'était trop long » | un **degré**, il reviendra → un indice |
| « Mathilde danse le mardi » | un **fait singulier**, aucun champ ne le porte |
| « pas de friture cette semaine » | ni l'un ni l'autre — **une contrainte de ce plan** |

---

## 3. Les indices — ce qui a bougé

```
                            avant        après      ce que ça change

rapidité de cuisine         milieu   ->   −1 cran   il déclare 45 min, on vise 38
portions                    milieu   ->   −1 cran   l'ESTIMATION d'entretien baisse de 5 %
compétence en cuisine       milieu        milieu    inchangé
variété                     milieu        milieu    inchangé
```

### ⛔ Et le conflit du cas 06 disparaît

Hier, *« les portions étaient trop grosses »* dit par quelqu'un qui veut **prendre
du poids** était une contradiction qu'il fallait arbitrer.

Avec un indice, il n'y a plus de conflit — **les deux ne parlent pas de la même
chose** :

```
l'indice corrige   l'ESTIMATION d'entretien     ( ±580 kcal/j d'erreur )
l'objectif fixe    l'ÉCART au-dessus            ( +385 kcal/j )
```

« Trop gros » ne veut pas dire *« je veux manger moins »*. Ça veut dire *« mon
entretien est plus bas que tu ne le crois »*. **L'indice le corrige, le surplus
reste entier.**

⇒ C'est ce qu'un système sans état ne pouvait pas faire : il n'avait **nulle part
où ranger** « l'estimation est trop haute pour cette personne ».

⚠️ **Trois bornes sur un indice**, sans quoi il dérive mal : un **bas et un haut**
non négociables · il **se voit** *(« Sophia te pense plutôt rapide en cuisine »)* ·
et il est **par personne**, jamais par foyer — la compétence en cuisine appartient
à qui cuisine.

---

## 4. Le mémo — une ligne sur cinq

```
ce que Sophia a retenu d'autre                                      1 / 5

· Mathilde danse le mardi — gros repas ce jour-là          ajouté le 18 août
```

Les **trois conditions** sont réunies : **factuelle**, **actionnable**, et
**aucun champ ne la porte**.

⚠️ Ce qui n'y entre **pas** : « pas de friture » *(contrainte de ce plan)* ·
« j'aime le croustillant » *(un degré, donc un indice)* · « le dîner de mardi
n'était pas terrible » *(un champ le porte)*.

---

## 5. Le calcul, avec les indices appliqués

```
1 758 × 1,63 (activité) × 1,10 (appétit)              =  3 152 kcal/j   estimation
      × 0,95   indice de portions, −1 cran            =  2 994 kcal/j   entretien RÉVISÉ
      + 385    objectif 0,35 kg/sem                   =  3 379 kcal/j   CIBLE

3 379 − 70 (shaker résolu)                            =  3 309 à répartir
        petit-déjeuner   0,268   ->    887 kcal
        déjeuner         0,391   ->  1 294 kcal   en gamelle
        dîner            0,341   ->  1 128 kcal   dont 868 composés + 260 de forfait

plancher protéique   117 ÷ 3 379                      =  35 g / 1 000 kcal
session de cuisine   45 min déclarées, indice −1      ->  on vise 38 min
ce plan-ci           pas de friture · pas de dhal · Mathilde mardi
```

⚠️ **La cible est passée de 3 537 à 3 379** — et c'est un retour de la personne
qui l'a déplacée, pas un réglage. C'est la première fois de la série que
**l'observé corrige l'estimé.**

---

## 6. Le centre de notifications

```
✓  Dhal de lentilles rouges ajouté aux aliments évités                [Défaire]
   parce que tu as répondu « je ne le referais pas » — bilan du 14 août

✓  Poulet rôti aux herbes ajouté aux aliments aimés                   [Défaire]
   parce que tu as répondu « je le referais » — bilan du 14 août

↓  Indice de rapidité en cuisine ajusté vers le bas                   [Défaire]
   parce que tu as répondu « en partie » à « as-tu cuisiné ? » — 14 août

↓  Indice de portions ajusté vers le bas                              [Défaire]
   parce que tu as répondu « trop » — bilan du 14 août

+  Note ajoutée : « Mathilde danse le mardi, gros repas ce jour-là »  [Défaire]
   parce que tu l'as écrit sur le brouillon du 18 août
```

**Cinq écritures, cinq causes citées, cinq gestes inverses.**

⛔ **La citation de la phrase source est obligatoire, pas décorative.** Sans elle,
« Défaire » est un pari. Avec elle, *« pourquoi il n'y a jamais de dhal ? »* a sa
réponse ici dans six mois, datée.

⚠️ **Pourquoi une notification et pas une confirmation bloquante** : quelqu'un de
pressé clique « oui » à tout, et on retombe sur de l'opt-out avec des étapes en
plus. Une notification ne demande rien et laisse la trace.

---

## 7. ⛔ Ce que la redirection coûte

**Les fruits à coque ne sont pas exclus de ce plan.** Il l'a dit dans le chat,
Sophia l'a renvoyé, il n'y est pas allé. **Aucune protection tant qu'il ne
remplit pas.**

C'est le **seul endroit** où ce design recule par rapport à la captation
automatique. Deux choses le rendent tenable :

**La formulation.** Sophia ne dit **jamais** « je le note ». Elle dit :

> *« Je n'ai pas enregistré ça — c'est important. Mets-le dans tes allergies :
> fruits à coque. »*  `[ Ouvrir mes allergies ]`

C'est exactement la phrase qui a coûté cher au dépôt qu'on évite ici :
`student_safety_constraints` avait **six lecteurs et zéro écrivain**, et quelqu'un
qui déclarait une **anaphylaxie** recevait *« Noted, I'll keep it in mind »*
pendant que la base restait vide.

**Le bouton est une NAVIGATION, jamais une écriture.** Un bouton qui écrirait
n'aurait **aucun point d'arrêt** : s'il peut poser une allergie en un tap,
pourquoi pas un aliment évité, puis l'équipement ? Six mois plus tard le chat
écrit tout à nouveau, **un bouton à la fois**.

> **Une règle avec une exception n'est pas une règle que l'utilisateur peut
> apprendre.** « Le chat parle, les préférences retiennent » se retient en une
> fois.

⚠️ **Deux conditions pour que le bouton marche** : il atterrit **sur la section**
et pas sur la page de réglages — ce qui tue une redirection n'est pas le tap, c'est
de devoir **chercher où mettre la chose** — et Sophia **répète ce qu'elle a
entendu**, pour qu'on n'ait pas à le reformuler.

---

## 8. Ce que ce cas ne teste PAS

| cas | ce que ça ajoute | ce que ça devrait faire bouger |
|---|---|---|
| **08** | un objectif de **PERTE** | ⛔ le plancher TCA, `MAX_DAILY_DEFICIT_KCAL`, et le repas réellement sauté |
| **09** | un **aliment inconnu** | l'abstention pesée et l'auto-remplissage *(lots 17-18)* |
| **10** | un **foyer** de plusieurs bouches | ⚠️ **les indices par personne**, la variante de plat, le budget non linéaire |
| **11** | un **mineur**, ou une **grossesse** | des portes qui **refusent**, pas des cibles qui bougent |

⚠️ **Le cas 10 est celui qui teste vraiment les indices.** Un indice par personne
dans un foyer de quatre, avec **une seule personne qui cuisine** : l'indice de
compétence appartient au cuisinier, celui de portions à chaque mangeur. Aucun cas
plus simple ne le dira.

---

## 9. Les identifiants du code

| ce que ce cas touche | où | état |
|---|---|---|
| le bilan de fin de plan | `plan_feedback.ts` *(`effectOf`)* · `meal_plan_feedback` | ✅ vivant, 4 lignes |
| le classement d'un brouillon | `draft_note_classify.ts` · `..._io.ts` | ✅ vivant |
| le magasin structuré | `student_goals.practical_constraints` → `retained_items` | ⚠️ **2 lignes** |
| l'ancienne liste plate | `practical_constraints.food_preferences` | ⚠️ **10 lignes** — 5× plus |
| les seuils | `MIN_CONFIDENCE = 0.7` · `PROMOTABLE_STATUSES = ["active","candidate"]` | ⛔ opt-out |
| le plafond de prompt | `MAX_PROMPT_PREFERENCES = 20`, privé à l'ancien magasin | ⛔ **aucun sur le nouveau** |
| la forme d'indice existante | `PORTION_ANSWER_ADJUST` *(5 crans)* · `PORTION_ADJUST_STEP` | ⚠️ appliquée **une fois**, jamais cumulée |
| l'écran de révocation | `KnownAboutYouCard.tsx` · `StudentKnownPage.tsx` | ✅ existe — devient le centre de notifications |
| la sécurité en conversation | `sophia-brain/tools/always_on/declare_safety_constraint/` | ⚠️ **à retirer** — le chat n'écrit plus |
| ⛔ les indices | **n'existent pas** | lot M3 |
| ⛔ le mémo | **n'existe pas** | lot M4 |
| ⛔ le centre de notifications | **n'existe pas** | lot M2 |
