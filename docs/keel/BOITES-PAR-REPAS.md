# La pesée est pour qui la demande

**Décidé le 2026-08-20** par l'utilisateur, après trois modèles précédents.
Ce document remplace les trois. Ils sont résumés plus bas pour que personne ne
les reconstruise en croyant corriger un oubli.

⚠️ **v3 (2026-08-19) N'A JAMAIS ÉTÉ CONSTRUITE.** Le code qui tourne est encore
en **v2** (`MealBox.shares[]`). Ce document renverse v3 **avant** son
implémentation : il n'y a donc rien à défaire, seulement un lot à écrire une
fois. Ne lis pas le code d'aujourd'hui comme l'application de la doctrine
d'hier — il ne l'est pas.

---

## La règle

> **Un objectif de poids ouvre une portion millimétrée. Tout le monde d'autre
> a un contenant, et ce contenant n'est la portion de personne.**

À la session de cuisine, pour chaque repas couvert par le lot :

| | contenant | ce qui est écrit dessus |
|---|---|---|
| bouche avec un **objectif** (`fat_loss`, `muscle_gain`) | **sa** boîte, à elle seule | `Fabrice — jeudi soir — Riz sauté aux champignons` · `poulet 140 g · riz 100 g · courgettes 120 g` |
| tout le reste **présent à ce repas** | **un** contenant commun | `Mathilde + Thomas + Christèle — jeudi soir — Riz sauté aux champignons` · `poulet 400 g · riz 330 g · courgettes 360 g` |
| plat cuisiné **de zéro le jour même** (`uses: []`) | aucun | rien. L'écran se tait, il n'invente pas de boîte. |

Le jour J : chacun sort **son** contenant et le réchauffe. Fabrice ouvre et
mange — sa boîte **est** sa portion. Les trois autres ouvrent le leur et se
servent. **Personne ne pèse à table**, ni lui, ni eux.

---

## ⛔ LES DEUX GRAMMES NE DISENT PAS LA MÊME CHOSE, ET C'EST TOUTE LA SPEC

C'est la **condition** à laquelle ce renversement ne coûte rien, actée le
2026-08-20 :

> **Sur la boîte à objectif, le gramme est une PRESCRIPTION.
> Sur le contenant commun, c'est une QUANTITÉ DE BAC.**

`Fabrice · poulet 140 g` = ce que Fabrice mange.
`Mathilde + Thomas + Christèle · poulet 400 g` = ce qu'on **met dans le bac**
pour trois. Personne n'y reçoit de chiffre, personne n'y est comparé à personne.

⛔ **JAMAIS UNE PART PAR PERSONNE DANS LE CONTENANT COMMUN.** C'est très
exactement ce qui a tué v2 : trois personnes autour d'un bac étiqueté
`total 900 g · Mathilde 300 · Thomas 300 · Christèle 300`, c'est la balance de
retour à table. Le contenant commun porte **une** série de nombres, celle du
bac, et rien qui vise quelqu'un.

⚠️ **ET C'EST CE QUI PRÉSERVE LA VICTOIRE DE v3.** L'argument de v3 était :
*« une personne qui se maintient recevait un grammage que personne n'avait
demandé »*. Sous v4, elle n'en reçoit toujours aucun — le nombre qu'elle voit
décrit un récipient, pas elle. La contrainte reste **volontaire**.

⚠️ **`items[]`, PAS UN TOTAL — POUR LES DEUX.** « 1,2 kg » ne se sert pas et ne
dit pas si c'est du riz ou du poulet. Le total est **dérivé**, jamais déclaré :
deux nombres qui doivent s'accorder finissent par diverger.

**Même forme de données, même rendu. Seul le NOMBRE DE NOMS sur le couvercle
distingue les deux lectures** — et c'est voulu : une seule structure, un seul
parseur, un seul composant.

---

## Le nombre de boîtes est DÉRIVÉ, jamais déclaré

```
boîtes = Σ  sur chaque repas couvert par le lot ( nombre de groupes présents )

groupes(repas) = { chaque bouche à objectif présente, SEULE }
               ∪ partition( le reste présent, par LIGNE ALIMENTAIRE que CE plat mord )
```

### ⚠️ LE RÉGIME GROUPE, IL NE RETIRE PAS (arbitré le 2026-08-20)

Deuxième critère de séparation, et il a la **même forme** que le premier.

> Si le plat porte ce qu'une ligne refuse, cette bouche a **son** contenant.
> Si rien ne mord, tout le monde partage le même — un seul bac commun.

⛔ **ET C'EST UN GROUPEMENT À L'ASSEMBLAGE, PAS UN RETRAIT APRÈS COUP.** La
question posée était : « le bac restait dimensionné pour trois, que fait-on des
grammes quand la ceinture en sort une bouche ? » La réponse est que **la
question ne doit pas se poser** : *« si ce n'est pas le même régime, ça se joue
au niveau de l'assemblage des boxes, et donc il y aura une boîte différente »*.
Un bac dont on retire un nom est un bac mal composé ; on le compose bien.

⚠️ **SEULEMENT QUAND LE PLAT MORD VRAIMENT.** Un végétarien et un omnivore qui
mangent le même dahl sont dans le **même** bac : c'est le plat qui décide, pas
l'étiquette de la personne. `scanMealForRegime` calcule déjà cette morsure,
bouche par bouche — c'est lui qui dit s'il faut séparer.

⚠️ **LA CEINTURE RESTE, ET ELLE CHANGE DE STATUT.** Retirer la bouche d'un bac
n'est plus le modèle : c'est le **filet**, pour le cas où le modèle n'a pas
séparé. Il reste armé, et il se **compte** — un compteur `bacs séparés par une
ligne / morsures détectées` dit à quelle fréquence la composition a échoué.
Sans lui, un modèle qui ne sépare jamais ressemblerait à un foyer sans régime.

⛔ **ET LE PARSEUR NE FABRIQUE PAS LE BAC DE TINO.** Retirer « la viande » de ses
`items` demande de savoir ce qui est la viande, et surtout de décider si ce qui
reste est un repas ou une assiette de riz. C'est une décision de composition :
elle appartient au modèle, à qui la consigne doit demander la séparation. Le
parseur **valide**, il n'invente pas.

Foyer Mathilde / Thomas / Christèle / **Fabrice** (`fat_loss`), un lot qui
couvre 2 repas : `2 repas × 2 groupes` = **4 contenants**. C'est le cas de
référence de ce document.

- **Deux objectifs** dans le foyer ⇒ 3 groupes (chacun le sien, plus le commun).
- **Aucun objectif** ⇒ 1 groupe, et le foyer a **quand même** ses contenants.
  C'est nouveau : v3 lui en donnait zéro, et « plat commun » ne disait ni
  combien de bacs remplir dimanche, ni lequel ouvrir jeudi.
- **Une seule bouche** dans le foyer ⇒ 1 contenant, et le libellé n'a pas de
  prénom à porter (`jeudi soir — Riz sauté`).

⚠️ **LA PRÉSENCE DÉCIDE DES NOMS.** Si Christèle dîne dehors jeudi, le
contenant commun porte `Mathilde + Thomas` et rétrécit. Le libellé dit qui
mange ; il dit donc aussi qui n'est pas là.

⚠️ **COMPTEUR OBLIGATOIRE : `boîtes rendues / boîtes attendues`.** Le nombre
attendu est calculable par le moteur sans le modèle — donc l'écart est
mesurable. Sans ce compteur, un modèle qui n'écrit aucune boîte est
indiscernable d'un foyer sans objectif, et un lot désarmé ressemble à un lot qui
marche.

---

## La forme

Un plat porte **ses** contenants — pluriel, un par groupe :

```jsonc
"boxes": [
  {
    "id": "box_thu_dinner_fabrice",
    "member_ids": ["<un id de THE MEMBER IDS>"],
    "items": [
      { "preparation_id": "prep_chicken", "term": "poulet rôti", "grams": 140 },
      { "preparation_id": "prep_rice",    "term": "riz",         "grams": 100 },
      { "preparation_id": null,           "term": "pain complet", "grams": 60 }
    ]
  },
  {
    "id": "box_thu_dinner_rest",
    "member_ids": ["<id>", "<id>", "<id>"],
    "items": [ … ]
  }
]
```

⚠️ **`boxes`, AU PLURIEL, SUR LE PLAT.** C'est le changement de forme par
rapport à v2/v3 (`box` singulier). Un repas produit désormais **N contenants**,
et c'est la seule façon d'avoir la boîte de Fabrice séparée de celle des autres
sans partager un bac.

⚠️ **`member_ids` EST LA CLÉ DE LECTURE.** Un seul id ⇒ c'est une portion, on
ouvre et on mange. Plusieurs ⇒ c'est un bac, on se sert. Il n'y a **aucun autre
marqueur**, aucun booléen `is_common`, aucun type : le nombre de noms suffit, et
un champ redondant finirait par contredire la liste.

⚠️ **DES ID, JAMAIS DES PRÉNOMS.** Validés contre le roster. Deux bouches
peuvent porter le même prénom ; aucune ne porte le même id. « Jamais de matcher
maison », quatorzième fois.

⚠️ **`preparation_id` EST LA JOINTURE, `term` EST L'ÉTIQUETTE.** `null` =
ajouté frais le jour même (le pain), donc hors du contrôle de fournée. Le `term`
ne sert **jamais** à retrouver quoi que ce soit.

⚠️ **LECTURE DÉFENSIVE DES PLANS DÉJÀ EN BASE.** Un plan écrit avant ce lot
porte `box` au singulier avec `shares[]`. Le lecteur le rend comme **un**
contenant à N noms — c'est ce qu'il était. Aucun plan vivant ne doit perdre ses
grammes parce que la forme a changé sous lui.

---

## Les portes, et ce qu'elles coupent

`fat_loss` et `muscle_gain` ouvrent la portion millimétrée. `maintenance`
**non** — c'est le cœur de la décision, pas un oubli.

Les gardes existantes restent, et leur effet est désormais **un déplacement, pas
un silence** :

- **plancher TCA levé** sur Fabrice → il perd sa boîte pesée et **rejoint le
  groupe commun**. Il a toujours un contenant, il n'a plus de chiffre à lui.
- **mineur** → jamais de portion millimétrée, donc toujours dans le commun.
- **doctrine qui interdit de compter** → idem.

⛔ **UNE GARDE COÛTE À QUI ELLE PROTÈGE, ET À PERSONNE D'AUTRE.** C'est la
victoire de v3 et elle est conservée telle quelle : sous v2, une ceinture posée
sur une personne faisait tomber le calcul d'une autre (mesuré : Christèle en
`no_reference` à cause d'iku). Ici, retirer Fabrice du calcul ne touche aucun
autre nombre — le contenant commun était déjà dimensionné sans lui.

⚠️ **CE QUE CE MODÈLE DIVULGUE, ET C'EST ASSUMÉ.** Une boîte séparée au nom de
Fabrice dit au foyer que Fabrice a *quelque chose de particulier*. Elle ne dit
**pas quoi** : ni objectif, ni corps, ni calorie, ni comparaison. La frontière
reste celle de F7/F8 — des aliments et des grammes, jamais un pourquoi.

---

## ⚠️ CE QUI N'EST PAS PESÉ EST QUAND MÊME DIMENSIONNÉ

Repris de v3 **sans changement** — c'est l'étage du dessous, et v4 ne le touche
pas.

> **La SOMME survit, la DIVISION meurt.**

```
appétit de la table = Σ entretien estimé(corps) / entretien d'un adulte de référence
```

Ce scalaire remplace le compte de têtes dans la consigne : sans lui, un homme de
73 kg qui s'entraîne et un enfant de 8 ans comptent tous les deux pour **1**, et
le gaspillage comme le manque sont structurels.

⛔ **UN SEUL SCALAIRE DANS LE PROMPT**, arrondi au demi. Pas un corps, pas une
liste, pas une ventilation par convive — elle remettrait dans le prompt
exactement ce que ce modèle vient d'en retirer. L'arrondi **est** une garde : au
centième, un foyer de deux laisse deviner un corps par soustraction.

⚠️ **REPLI SUR LE COMPTE DE TÊTES, NOMMÉ.** Aucun corps connu ⇒ `servings`. Un
foyer qui n'a rien saisi ne doit pas voir sa casserole rétrécir parce qu'on ne
sait pas.

⚠️ **ET CE NOMBRE NE SORT JAMAIS VERS L'ÉCRAN.** Il dimensionne une fournée ; il
n'a rien à dire à table.

---

## Où ça se lit

### Le bloc du jour suit l'ordre des gestes

**Acheter → cuisiner → manger.**

1. **Les courses du jour** (la vague qui tombe ce jour-là) — **en tête**, pliée,
   avec son compte. Dépliée, elle enterrerait la cuisine sous vingt lignes.
2. **La session de cuisine**, si elle tombe ce jour : la matière et la méthode
   par casserole, le déroulé dépliable, puis le **Boxing** en dernier bloc.
3. **Les repas, moment par moment.**

⛔ **CE N'EST PAS L'ORDRE D'AUJOURD'HUI.** `PlanDayBlock` rend session **puis**
courses. L'inversion est le changement, et sa raison est écrite ici pour qu'elle
ne se re-inverse pas au prochain lot qui touche ce fichier.

### Le Boxing

Dernier bloc de la carte de session. Clé de traduction — **FR et EN disent tous
deux « Boxing »**, décidé le 2026-08-20.

- **« 6 contenants à remplir »** en tête : on sort ses boîtes avant de
  commencer, pas au milieu.
- **Une ligne par contenant** : le libellé, puis ses `items`.
- ⚠️ **LE BLOC DIT SON UNITÉ UNE FOIS.** Trois centimètres au-dessus, la carte
  de session affiche déjà les quantités de la casserole — qui sont du **CRU**,
  pour la fournée entière. Les grammes du Boxing sont du **PRÊT**, par
  contenant. Deux séries voisines sans une ligne qui les distingue, c'est le
  prochain « on comprend pas à quoi ça correspond ».

### La carte d'un repas

Contrat **obligatoire**, dans cet ordre :

1. **le geste du jour + sa durée** — `same_day.kind` / `minutes` (existe)
2. **ce qu'on ajoute le jour même** — `dish.ingredients` (existe). ⚠️
   L'intitulé doit dire que c'est **en plus du lot** : lu tel quel, ça ressemble
   à la recette entière.
3. **les instructions du jour** — `method` (existe)
4. **qui mange quoi** — une ligne par contenant : les prénoms, puis le libellé
5. **le lien vers la session** (existe)

⛔ **AUCUN GRAMME SUR LA CARTE D'UN REPAS**, arbitré le 2026-08-20. Le contenant
**est** la portion — c'est toute la promesse « on pèse une fois ». Le détail des
grammes vit dans le Boxing, où le geste se fait. Seule exception : un plat
cuisiné de zéro le jour même n'a pas de boîte, et ses grammes sont ceux de sa
recette.

⚠️ **DEUX CARTES QUAND LES PLATS DIFFÈRENT**, et le mécanisme existe déjà
(`dish.member_id` → `groupDayBySlot` → `DayPersonSplit`). Chaque carte porte ses
propres ingrédients du jour, ses propres instructions, et **sa** ligne de
contenants.

### Le libellé d'un contenant

```
prénoms — jour moment — plat
Mathilde + Thomas + Christèle — jeudi soir — Riz sauté aux champignons
```

⛔ **UN SEUL CONSTRUCTEUR, PUR, TESTÉ.** Le même libellé s'affiche dans le
Boxing **et** sur la carte du repas. Deux constructions divergeront, et la
divergence tombera sur un couvercle de frigo — l'objet dont le seul travail est
de trancher.

⛔ **IL NE DÉPEND QUE DE `dish` ET DE `member_portions`.** Jamais de
`preparations` : `/app/today` — l'écran où l'on **ouvre** la boîte — ne les
reçoit pas. Un libellé qui en dépendrait serait complet sur `/app/plan` et
amputé là où on le lit vraiment.

---

## L'énergie par bouche s'arrête où la division s'arrête

Arbitré le 2026-08-20, en découvrant `mouth_energy.dishSlices` — le module qui
répartit les kcal d'un plat **au prorata des parts d'une boîte** :

```
share = grams / total   →   kcal * share
```

> **Un kcal par bouche n'existe que pour un contenant à UN nom.**

Pour un bac commun, `dishSlices` rend un **silence nommé** (`gap: "common_pot"`),
jamais une division. Diviser le bac par le nombre de mangeurs ferait revenir par
la porte de l'énergie exactement la division que v3 et v4 existent pour
supprimer — et le nombre aurait l'air personnel alors qu'il ne l'est pas.

⚠️ **CE QUE ÇA COÛTE, ÉCRIT ICI POUR QUE PERSONNE NE LE REDÉCOUVRE :** une
bouche en `maintenance` **perd sa lecture calorique**. C'est cohérent — elle n'a
demandé aucun chiffre — mais c'est une régression visible pour qui la lisait.

⚠️ **UN SILENCE NOMMÉ, PAS UN `null` DE PLUS.** `common_pot` se compte, donc on
sait la différence entre « on ne sait pas » et « il n'y a rien à savoir ».
La chaîne aval (`mouth_anchor`, `pot_demand`) le lit comme tel.

## Ce que ça remplace

**v1 — une boîte par CASSEROLE, par personne** (« Boîte iku — 340 g » sous le
poulet, puis sous le quinoa). Trois défauts mesurés sur le run `76be8ce3` : 8
boîtes sur 16 qu'aucun repas ne citait, une boîte citée par 3 repas, et un nom
qui ne disait pas quand ouvrir.

**v2 — une boîte assemblée par REPAS, la répartition sur l'étiquette**
(`total 500 g · iku 300 g · Christèle 200 g`). ⛔ **Ne pas la ressusciter :** la
part par personne dans un bac partagé remet la balance au service, et elle est
incompatible avec la portion millimétrée — on ne sort pas 100 g de riz d'un bac
où il est mélangé au poulet. C'est la forme qui tourne aujourd'hui.

**v3 — une boîte pour la bouche à objectif, RIEN pour les autres.** Sa règle de
portion est conservée en entier ; ce qui est renversé le 2026-08-20 est
uniquement le **silence** sur les autres. Défaut de v3 : « plat commun » ne
disait ni combien de contenants remplir dimanche, ni lequel ouvrir jeudi. Devant
le frigo, elle ne décidait rien pour trois personnes sur quatre.

---

## Ce que ça touche

- **`boxSchemaBlock`** (prompt système) — `box` singulier devient `boxes[]`,
  chaque entrée `member_ids[]` + `items[]`.
- **`boxingOrderLines`** (brief de portions) — la consigne demande **un
  contenant par groupe présent**, nomme les bouches à objectif, et distingue
  explicitement les deux grammes. ⛔ **La ligne « Give every share of a meal the
  SAME ordinary figure » DISPARAÎT** : elle ordonnait au modèle le même chiffre
  pour tout le monde, et elle n'a plus d'objet dès lors que le commun est un bac
  et non une somme de parts.
- **Le parseur** — valider `member_ids` contre le roster, `grams > 0`,
  `preparation_id` contre les préparations du plan, et l'unicité des `id` de
  boîte dans le plan. Compteur `boîtes rendues / attendues`.
- **`sizeBoxesFromTarget`** — s'applique aux `items` de la boîte **à objectif**,
  avec le plafond de fournée par `preparation_id`. Le contenant commun reçoit le
  **reste** de la fournée, réparti par composant.
- **`lib/mealBoxes.ts`** — `boxLineForDish` rend désormais **N lignes**, plus
  une. Le constructeur de libellé y vit, seul.
- **`plan/BoxTable.tsx`** — une ligne par contenant, ses `items` dessous. Le
  contexte `dish` ne rend plus de grammes du tout.
- **`plan/PlanDayBlock.tsx`** — courses au-dessus de la session ; Boxing en
  dernier bloc de la carte de session.
- **`DishCard.tsx`** — la ligne « qui mange quoi », sans gramme ; l'intitulé des
  ingrédients du jour.
- **Les trois surfaces** — `/app/plan`, la preview (`MealBuilder` /
  `PlanDraftDialog`, qui montent déjà le même `PlanResult`) et **`/app/today`**,
  qui est la vraie troisième et qu'il faut tenir **dans** le lot, pas après.

---

## Ce qui ne change pas

**Un objectif n'est pas un régime.** Quelqu'un qui a un objectif *et* un régime
incompatible garde son plat dédié : deux mécanismes, deux raisons, ils se
composent.

**Les grammes restent des grammes d'ALIMENT** — même famille que « 400 g de
cuisses de poulet » sur une liste de courses. Aucun kcal, aucun poids de corps,
aucun objectif ne sort vers l'écran. `member_portions` reste lisible par tout le
foyer ; une boîte nommée l'est aussi, et c'est pour ça qu'elle ne porte QUE des
aliments et des grammes.

**Le déroulé de session ne porte aucun poids.** Les grammes vivent dans les
boîtes, où chacun est déjà attaché à un aliment et à un nom. Un poids écrit dans
le `run_through` ne nomme aucun aliment et ne correspond à aucun couvercle.
