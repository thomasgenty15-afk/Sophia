# Fiche — le rattrapage d'un plat, dans les deux sens

*Écrite le 2026-09-09. Autorité du calcul :
[`METHODE-GENERATION-DE-PLAN-SOLO.md`](METHODE-GENERATION-DE-PLAN-SOLO.md).
Code : `supabase/functions/_shared/keel/portion_sizing.ts`.*

---

## À quoi ça sert

Le modèle écrit **une recette standard**. Le moteur la multiplie par un facteur
propre à chaque personne pour atteindre sa cible du moment. Ce facteur est borné
par la taille d'une assiette (`PLATE_MASS_BOUNDS_G`, 700 g au plafond pour un
repas d'adulte, un plancher selon l'âge et l'appétit).

Quand la recette est **trop peu dense**, atteindre la cible demanderait une
assiette de 1 000 g : le moteur rabote à 700 g et les calories manquantes sont
perdues. Quand elle est **trop dense**, la part tient dans trois cuillères et
passe sous le plancher.

Le rattrapage est le moment où le moteur **redemande au modèle de réécrire cette
recette-là**, avec un objectif de densité chiffré.

⚠️ **Ce n'est pas « changer les portions ».** Faire varier la portion est
exactement ce que le facteur fait déjà, et c'est ce qui bute sur la borne.
On change la **recette**.

---

## Les deux sens

|  | **Densifier** | **Alléger** |
|---|---|---|
| Déclencheur | au moins un mangeur `over_max` | **tous** les mangeurs `under_min` |
| Ce qui ne va pas | l'assiette dépasserait 700 g | la part passe sous le plancher |
| Cible demandée | `max(cible ÷ masse max) × 1,10` | `min(cible ÷ masse min) ÷ 1,10` |
| Deuxième borne | aucune — le plafond de masse borne déjà | **plancher obligatoire** (voir plus bas) |
| Consigne au modèle | plus de féculent, protéine, gras ; moins d'eau et de légume aqueux | moins de gras et de féculent dense ; plus de légume |
| Symétrie | — | ce n'est **pas** un cas d'enfant : un plat riche servi à quelqu'un en perte de poids tombe sous son plancher |

### Pourquoi la règle est dissymétrique

**Un seul `over_max` suffit à densifier.** Cette personne-là ne peut pas manger
sa part ; les autres n'y perdent rien, leur facteur baisse d'autant.

**Alléger exige l'unanimité** (`REPAIR_SHARED_LIGHTEN_REQUIRES_ALL`). Diluer un
plat coûte à tout le monde : celui qui était bien servi se retrouve avec plus de
volume pour la même énergie. Un seul mangeur hors de ce besoin bloque la demande
(`partial_under_min`), et chacun est simplement borné individuellement.

**Un mineur à table bloque toujours l'allègement**
(`REPAIR_MINOR_NEVER_LIGHTEN`) : `minor_blocks_lighten`.

**Les deux à la fois** — quelqu'un `over_max`, quelqu'un `under_min` — :
densifier gagne, et le cas est compté `conflict`.

### Le plancher de l'allègement — appris à l'usage

Mesuré au tir SPLICE3 : un adulte en perte de gras sous son plancher a reçu
« reste sous 145 kcal/100 g », et un bouillon à **57,8** est revenu. Son assiette
est passée de trop petite à trop grosse.

Toute demande « alléger » porte donc un **`floorPer100G`** = la densité sous
laquelle l'assiette dépasserait son plafond de masse. La consigne dit une
**bande** : « entre F et A kcal/100 g ; en dessous de F, l'assiette devient
énorme ». Densifier n'en a pas besoin : le plafond de masse borne déjà.

---

## Ce que le modèle reçoit

La relance lui renvoie **sa propre recette avec ses quantités** — les ingrédients
frais du plat **et** chaque casserole qu'il tire —, chaque unité marquée
**REWORKABLE** ou **FROZEN**.

⚠️ Une unité gelée est **nommée quand même**, avec son contenu, et déclarée
intouchable. La passer sous silence donnerait un plat dont la moitié des
ingrédients semble absente — et un modèle à qui manque la moitié d'une recette
la réinvente.

### ⛔ Le modèle voit tout, on ne lit que ce qu'on a autorisé

*Décision du propriétaire, 2026-09-08 : « si c'est nous qui donnons les
instructions, pourquoi il change les plats si on sait d'avance ce qu'il peut
changer ? Ça devrait être envoyé comme contexte, pas comme quelque chose sur
quoi influer. »*

Avant, la relance disait « rends le plan JSON complet », le modèle rendait tout,
la lane **fusionnait la case entière**, puis vérifiait après coup qu'il n'avait
pas touché aux casseroles gelées. Mesuré : **quatre tirs sur quatre, il les
réécrivait**. Ce n'était pas de la désobéissance — on lui avait laissé la main
sur ce qui ne devait pas être à sa main.

Deux couches, désormais (`spliceReworkableUnits`) :

1. **Le modèle voit le plat entier.** Il en a besoin : pour écrire un frais qui
   atteigne la densité, il faut tenir compte du riz déjà dedans.
2. **Le code ne lit que le frais et les casseroles marquées réécrivables**, par
   identifiant. Une casserole réécrite garde son `id` et son `servingsMade`.
   Casseroles gelées, autres plats, sessions, courses : la base, octet pour
   octet.

« Rien d'autre ne change » est **garanti par construction, pas demandé**.

Ce que ça a rendu sans objet — compteurs gardés à zéro, mécanismes retirés : le
défourchage (`pot_forked` / `pot_unforked`), le refus « casserole gelée
réécrite », la garde « plat dédié perdu », le refus « casserole introuvable ».

### Deux phrases qui ont coûté cher

**« The plate stays the same size »** — retirée le 2026-09-08. Elle contredisait
la phrase d'avant : on demande « moins de légume aqueux », c'est-à-dire retirer
400 g de tomates, puis on interdit de rétrécir. Mesuré : le modèle a composé un
autre plat, faute de manœuvre praticable (111 g de survie sur 1 341). Ce qui la
remplace dit que **la recette n'est pas une assiette** : elle a le droit de
maigrir, la portion servie n'est pas l'affaire du modèle.

**La position de l'instruction.** Le bloc d'arbitrage se place automatiquement en
queue de message et dit « nothing in this message outranks it », puis « compose
the nearest dish the higher rule DOES allow ». Tant que la consigne de
réparation passait avant lui, le modèle obéissait au dernier bloc lu — et
remplaçait le plat. La relance de densité parle désormais **après** lui, et elle
seule : les cinq autres relances demandent bien de recomposer, elles gardent
l'assemblage d'origine.

---

## Qui a le droit d'être réécrit — la règle des mangeurs

Une **unité** est le frais d'un plat **ou** une casserole. Ses **mangeurs** sont
l'union, sur les plats qui la tirent, de : le porteur si le plat est dédié,
sinon toute la table.

> Une unité est **réécrivable** dans la direction D si et seulement si **chacun**
> de ses mangeurs a besoin de D. Sinon elle est **gelée**.

⛔ « Pas besoin » n'est pas « besoin du contraire ». Quelqu'un dans ses bornes
compte comme dissident. Sans cette lecture, on répare quelqu'un en enrichissant
l'assiette de son voisin, qui ne le saura jamais.

### Les cinq cas

| Situation | Ce qui se passe |
|---|---|
| **Solo** | Rien ne peut être gelé. Tout est réécrivable ; le plat dédié ne se déclenche jamais. |
| **Plat commun, tous dans le même sens** | La recette est réécrite pour tout le monde ; les facteurs suivent. |
| **Plat commun, sens opposés** | La casserole est gelée dans les **deux** sens. |
| **Base commune + variable spécialisée** | On travaille la partie que la personne est seule à manger. Si son frais est partagé avec quelqu'un dans ses bornes, ce frais est gelé aussi. |
| **Tout est gelé** | Le modèle ajoute **un plat à son nom** (`for_member_id`) : dense (noix, fromage, huile, pain) si elle dépasse, volumineux (légumes, bouillon, salade) si elle est sous son plancher. |

---

## Quand tout est gelé — le complément

*Décision du propriétaire, 2026-09-09 : « dans le cas où tout est gelé, on
diminue la portion et on ajoute de la calorie dans l'entrée ». Puis, sur le cas
qui l'a déclenchée : « il faut qu'on permette d'ajouter une entrée, genre carotte
huile d'olive, qui est le last resort ».*

### Ce qui ne marchait pas

Un plat fait **de casseroles seules**, toutes partagées avec des gens qui vont
bien : toutes gelées, aucun ingrédient frais. La consigne disait « atteins 146
par ton frais et tes casseroles réécrivables » — il n'y avait ni l'un ni l'autre.
C'est le cas 5 à la lettre, et sa sortie n'avait **aucun appelant**.

Et quand un plat dédié partait quand même, il **remplaçait** l'assiette partagée,
dimensionné à la cible entière : « une petite entrée riche » de 700 kcal, ou un
bouillon accepté parce qu'il ne dégradait rien.

### Le calcul — deux inconnues, deux équations

On **rabote la part partagée à la borne** et **le complément porte le reste**.
Pour une personne dont la part du plat partagé a la densité ρs, avec un
complément de densité ρc :

```
masse   : gS + gC = borne          (max si trop gros, min si trop petit)
énergie : gS·ρs + gC·ρc = cible

⇒  gC = (cible − borne·ρs) ÷ (ρc − ρs)      gS = borne − gC
```

**Trop gros** ⇒ le numérateur est positif, donc il faut ρc **>** ρs : un
complément plus dense (pain-fromage, noix, huile). La part du plat commun
descend d'autant.

**Trop petit** ⇒ le numérateur est négatif, donc ρc **<** ρs : un complément
plus léger (carotte, salade, bouillon) qui remplit le volume manquant sans
ajouter l'énergie qui ferait déborder la cible.

⚠️ **Augmenter simplement les quantités du plat partagé ne marche pas** dans le
sens « trop petit » : la densité ne bouge pas, l'énergie monte avec la masse, et
on reste au même point. Il faut un complément d'une **autre densité**.

### Ce qu'on demande au modèle

`COMPLEMENT_PLATE_SHARE = 0.2` — le complément prend **un cinquième** de
l'assiette quand le modèle atteint la densité demandée. C'est ce qui en fait une
**entrée** et pas un second plat : 140 g à côté de 560 g.

La densité demandée n'est pas celle du plat entier :

```
trop gros  :  ρc = ρs + (cible − max·ρs) ÷ (part · max)
trop petit :  ρc = ρs ÷ 2        (⇒ le complément fait 2× la masse manquante)
```

⛔ Ni cible, ni borne, ni prénom ne sortent : **une densité, propriété du plat**.

### Quand ça ne résout pas

Un complément du mauvais côté, ou qui prendrait toute l'assiette (`gC ≥ borne`),
ne résout rien : le calcul rend `null`, l'appelant **retire le plat** et le
compte (`complement_unsolvable`). Pas de « presque ».

Un complément que le référentiel ne sait pas peser est retiré aussi
(`complement_unmeasurable:<motif>`) : un plat ajouté qu'on ne peut pas peser est
servi au facteur 1, c'est-à-dire à la recette brute.

⚠️ **Aucune casserole n'entre par cette porte.** La consigne dit « small and
rich, beside the shared dish ». Un plat ajouté qui cite une casserole est une
relance qui a changé la cuisine : il est refusé (`rejected_citing_pot`). Les
autres plats ajoutés de la même relance entrent quand même — ils sont
indépendants.

⚠️ **On n'importe que les plats ajoutés, jamais la case entière.** Mesuré au tir
CATCH3 : le modèle a ajouté le plat demandé au bon nom, et rendu la case **sans**
le plat dédié qui y était déjà (celui de la végane). Fusionner la case aurait
retiré son plat à quelqu'un pour en donner un à un autre.

---

## Ce qui décide d'accepter la réponse

Deux gardes seulement, parce que la lecture sélective a rendu les autres sans
objet. Celles-ci restent parce qu'elles portent sur **le fond**.

**1. L'identité du plat tient.** Au moins la moitié de la masse d'origine survit
(`REPAIR_MIN_MASS_SURVIVAL = 0.5`). En dessous, c'est un remplacement : la
personne avait choisi ce plat, on garde l'ancien.

⚠️ `for_member_id` fait partie de l'**identité**, pas seulement de
l'attribution. À table, une case porte le plat commun **et** le plat dédié, et
leurs titres se ressemblent : chercher « le plat revenu dans cette case » par la
case seule a donné 4 refus `title_changed`, 0 accepté, 6 assiettes sur 12 hors
bornes. Les tirs d'avant passaient **par chance**, selon l'ordre où le modèle
rendait les deux plats.

**2. Le plan reste mesurable — la remesure.** Une réparation qui fait monter
`unmeasurable` est refusée **en bloc** : le plan d'avant revient — plats,
casseroles, créneaux vides, sessions de cuisine, liste de courses **et** texte
source — puis il est **remesuré**.

⛔ **« Moins de dépassements » n'est pas le critère.** Mesuré : après une
réparation, `over_max 3 → 0`, `still_out 0`, aucun refus, 2 acceptées sur 2. Et
le plan était **pire** — les trois assiettes qui dépassaient étaient devenues
**immesurables**, donc servies au facteur 1, c'est-à-dire à la recette brute :
1 121 g au déjeuner, 1 056 g au dîner, pour quatre personnes. Le critère est :
le moteur peut-il encore **peser** ce plat ?

Deux motifs de refus, comptés séparément : `blinded` (le plan est devenu moins
mesurable) et `degraded` (il est mesurable mais plus loin des cibles qu'avant).

## Les bornes du dispositif

| Constante | Valeur | Ce qu'elle tient |
|---|---|---|
| `REPAIR_CALLS_PER_DISH` | `1` | un seul essai par plat — décision produit |
| `REPAIR_MAX_DISHES_PER_PLAN` | `4` | plafond de coût par plan |
| `REPAIR_DENSITY_HEADROOM` | `1.10` | marge : on demande 10 % de plus que le strict nécessaire |
| `MAX_ASKABLE_DENSITY_PER_100G` | `250` | une consigne intenable rend toutes les autres décoratives |
| `REPAIR_MIN_MASS_SURVIVAL` | `0.5` | seuil d'identité |
| `NORMAL_DISH_MIN_KCAL_PER_100G` | `100` | plancher de densité annoncé d'entrée (60 pour un moment « léger ») |

---

## Les compteurs, et comment les lire

| Compteur | Ce qu'il dit |
|---|---|
| `asked` / `accepted` | demandées / retenues après les deux gardes |
| `still_out` | acceptées **mais toujours hors bornes** après réécriture |
| `rejected.title_changed` | le modèle a rendu un autre plat |
| `rejected.blinded` | le plan est devenu moins mesurable — refus en bloc |
| `rejected.degraded` | mesurable, mais plus loin des cibles qu'avant |
| `skipped_stuck` | plat bloqué : rien de réécrivable, **ou déjà réparé une fois sans effet** — il part directement au complément |
| `missed_aim` | complément accepté **sans** atteindre sa cible : « accepté » veut dire « n'a pas dégradé le plan » |
| `complement_unsolvable` | aucun découpage ne résout — le plat ajouté est retiré |
| `complement_unmeasurable:<motif>` | le complément n'est pas pesable — retiré |
| `rejected_citing_pot` | le plat ajouté cite une casserole : il a changé la cuisine |
| `unmet_kcal` | ce que le plafond d'assiette a coupé, par plat |

⚠️ **`unmet_kcal` est la vérité du rabotage.** Le taux de précision d'un plan se
lit `servi = cible − unmet`. Un pourcentage seul endort : le lire avec le nombre
de plats hors bornes et les kcal perdues.

⛔ **Sans objet depuis la lecture sélective, gardés à zéro** : `pot_forked`,
`pot_unforked`, le refus « casserole gelée réécrite », la garde « plat dédié
perdu », le refus « casserole introuvable ». Un compteur retiré et un compteur à
zéro ne se lisent pas pareil — le second dit « la règle existe et n'avait rien à
faire ».

## Ce que ça donne en vrai

Fixture `qa-genty-clone` (187 cm / 72 kg, `muscle_gain`, 3 080 kcal portés par
les plats), sept tirs consécutifs du 2026-09-08, aucun changement entre eux :

```
avant le chantier    87,6 %   ·  383 kcal perdues
après                95,1 – 100 %  ·  médiane 100 %, 4 tirs sur 7 à 100 %
                     14 réparations demandées, 14 acceptées, 0 rejet
```

Ce qui reste : le modèle écrit parfois une recette sous la densité demandée
(122,9 au lieu de 159), et il n'a **qu'un seul essai**. Trois tirs sur sept
laissent alors 14 à 151 kcal au plafond.

Sur la table à quatre bouches, après les trois corrections de la bascule :
**12 assiettes sur 12 dans les bornes**, 4 bouches-jours sur 4 à ±5 % de leur
cible.
