# Cas 04 — cinq jours, sans congélateur

**Le cas 03 étendu à cinq jours, congélateur retiré.** Le corps, l'activité,
l'appétit, les interdits, le shaker, les forfaits et le plat de tradition ne
bougent pas. Ce qui change est **au-dessus** de tout ça : la fenêtre du plan.

C'est le premier cas de la série qui exerce le **niveau plan**. Les trois
précédents ne touchaient qu'à la journée, à l'occasion, au plat ou à la portion.

Socle : `2026-08-21-CAS-03-EQUIPEMENT-ET-PLAT-TRADITION.md`.
Design : `2026-08-20-1900-DESIGN-CALCUL-ET-COMPOSITION.md`, partie 5 — lots 27 à 29.

---

## 1. La journée ne bouge pas

Chacun des cinq jours porte les mêmes cibles que le cas 03 :

```
3 152 kcal/j      petit-déj  826   déjeuner 1 205   shaker  70   dîner 1 051
                                                              (791 composés + 260 de forfait)
```

⇒ **Tout ce document parle du PLAN, jamais de la journée.** Pour le détail d'une
journée — Mifflin, le croisement d'activité, les quatre moments, les portes de
densité et de protéine — voir le cas 03. Rien n'y change.

---

## 2. La règle de conservation — TRANCHÉE

> **`MAX_FRIDGE_DAYS = 3` veut dire : jour de cuisson + 2.**
> Un plat cuisiné **vendredi** se mange **vendredi, samedi, dimanche**.
> Lundi est trop tard.

⚠️ **Les deux lectures existaient et donnaient des plans différents** — « J, J+1,
J+2 » ou « J+1 à J+3 » — et rien dans le dépôt ne les départageait. Décidé le
2026-08-21 : la lecture prudente. Sans congélateur, **rien ne repousse cette
borne.**

---

## 3. ⛔ La fenêtre ne concerne PAS toutes les occasions

C'est le point qui change tout le compte, et il est facile à rater.

| occasion | état | consomme la fenêtre ? |
|---|---|---|
| petit-déjeuner | **assemblé le matin même** | **non** |
| déjeuner | **cuisiné à l'avance** | **oui** |
| après-midi *(shaker)* | pris tel quel | **non** |
| dîner | **cuisiné à l'avance** | **oui** |
| fromage, dessert | forfait | **non** |

```
5 jours x 3 repas + 5 shakers   =   20 occasions
dont CUISINÉES À L'AVANCE       =   10   (5 déjeuners + 5 dîners)
```

⇒ **Une occasion porte un cinquième attribut** — *cuisinée à l'avance* ou
*assemblée sur le moment* — à côté de composée, estimée, résolue et forfaitaire.
Sans lui, on cherche à faire tenir **20 occasions** dans une fenêtre qui n'en
concerne que **10**, et on conclut à tort qu'il faut trois sessions.

---

## 4. Les deux sessions

```
fenêtre demandée                                    5 jours
conservation                       jour + 2    ->   3 jours couverts par session

    session 1  ->  vendredi   couvre  vendredi · samedi · dimanche
    session 2  ->  lundi      couvre  lundi · mardi
```

| session | plats et portions | énergie | masse prête |
|---|---|---|---|
| **vendredi** | tradition **× 2** · pois chiches **× 1** · dhal **× 3** | 5 988 kcal | ~3 612 g |
| **lundi** | poulet-légumes **× 2** · riz-œufs **× 2** | 3 992 kcal | ~2 408 g |

`5 988 + 3 992 = 9 980 kcal` — soit les 10 occasions cuisinées.
*(Le reste des `5 × 3 152 = 15 760` kcal du plan passe par les petits-déjeuners
assemblés, les shakers et les forfaits.)*

⚠️ **Cinq plats distincts pour dix occasions.** Le batch cooking produit peu de
plats en plusieurs portions — c'est son principe. Mais ça pèse sur la **variété
dirigée** du §2.10 : elle doit être obtenue **entre les plats**, pas entre les
jours, puisque deux jours consécutifs mangent souvent le même.

---

## 5. Les cinq jours

| | vendredi | samedi | dimanche | lundi | mardi |
|---|---|---|---|---|---|
| **matin** | assemblé | assemblé | assemblé | assemblé | assemblé |
| **midi** | **tradition** | tradition | pois chiches | **poulet-légumes** | poulet-légumes |
| après-midi | shaker | shaker | shaker | shaker | shaker |
| **soir** | **dhal** | dhal | dhal | **riz-œufs** | riz-œufs |
| | *session 1* | | | *session 2* | |

---

## 6. La conservation, plat par plat

| plat | cuisiné | dernière portion | écart | verdict |
|---|---|---|---|---|
| tradition | vendredi | samedi | **J+1** | passe |
| pois chiches | vendredi | dimanche | **J+2** | passe — à la limite |
| dhal | vendredi | dimanche | **J+2** | passe — à la limite |
| poulet-légumes | lundi | mardi | **J+1** | passe |
| riz-œufs | lundi | mardi | **J+1** | passe |

⚠️ **Deux plats sont exactement à la borne.** Il n'y a **aucune marge** : un jour de
retard sur la session, un plan qui glisse d'une journée, et deux plats sortent de
la fenêtre. Sans congélateur, **la fenêtre est le plan** — elle ne se rattrape pas.

---

## 7. Les jours de cuisine sont DÉRIVÉS, jamais choisis

⚠️ **L'écran demande aujourd'hui « les jours où tu cuisines ». Cette question n'a
pas de réponse libre :**

- il faut **toujours** cuisiner le **premier jour du plan** — rien n'est prêt avant ;
- il faut **re-cuisiner dès que la conservation expire** — ce n'est pas un souhait,
  c'est physique.

Sur ce cas, vendredi et lundi ne sont pas un choix : ce sont **les deux seules
réponses possibles**.

⇒ **Ce qui reste légitime, c'est la question inverse** : *« je ne peux pas cuisiner
le mercredi »*. Ça n'est pas un choix de jour de cuisine — c'est une **contrainte
qui déforme le plan** : son jour de départ, sa longueur, son nombre de sessions.
La question doit être posée dans ce sens-là, ou pas du tout.

---

## 8. ⛔ Ce qu'on a décidé de NE PAS faire — la capacité

Le cas 03 avait trouvé que le facteur casse la faisabilité : la part ordinaire tient
dans un panier d'air fryer, la part corrigée non. **Sur cinq jours, ça empire** —
le plat de tradition est produit en **deux portions dans la même session** :

```
cuisses de poulet   278 g x 2   =   556 g
pommes dauphine     209 g x 2   =   418 g
                                    -------
                                     974 g   dans un panier de ~4 L
```

**DÉCISION DU 2026-08-21 : on ne modélise pas la capacité des appareils.** La
quantité est proportionnelle au nombre de bouches, et **la façon de la cuire est un
problème que la personne résout dans sa cuisine** — pas un problème du produit.

⚠️ **LE COÛT ACCEPTÉ.** Le temps de cuisson annoncé est **faux dès qu'un appareil à
panier entre en jeu**, et faux d'un facteur qui **croît avec le nombre de
portions**. Une casserole se moque du nombre de portions ; un panier, non.

⇒ **Ce qui survit, et c'est tout** : **ne pas afficher un temps qu'on n'a pas
vérifié.** Soit il est donné **pour une portion**, avec le nombre de portions à
côté, soit il n'est pas donné. Un « 20 min » affiché pour une cuisson qui en prend
80 est pire qu'aucun chiffre — surtout sur un produit dont l'argument est le temps
gagné.

---

## 9. Les portes, et leurs niveaux

| porte | niveau | sur ce plan |
|---|---|---|
| densité `>= 0,80 kcal/g` | **le repas** | 10 verdicts — un par repas cuisiné |
| protéine `>= 37 g / 1 000 kcal` | **la journée** | **5 verdicts**, un par jour |
| ceinture allergènes | **le plat** | 5 verdicts — un par plat distinct |
| les sept drapeaux | **le plan** | **1 verdict**, sur les cinq jours |
| **conservation** | **le plat, dans sa session** | 5 verdicts — voir §6 |

⚠️ **Cinq portes, cinq niveaux différents.** C'est le cas qui les fait toutes
apparaître en même temps, et il montre pourquoi le niveau compte : la même règle
posée un cran trop haut ou trop bas refuse ce qui est légitime.

**Les sept drapeaux, sur le plan entier :** `omega3_marine` l'huile d'algue du dhal
· `iron` et `folate` lentilles et pois chiches · `calcium` et `iodine` le lait des
cinq petits-déjeuners · `b12` œufs et poulet · `zinc` poulet, lentilles, pois
chiches.

---

## 10. ⛔ Les courses — et ce plan ne tient pas

⟳ **Corrigé le 2026-08-21.** J'avais d'abord écrit qu'un seul passage aux courses
suffisait. **C'est vrai pour les légumes et faux pour la viande.**

**Il y a DEUX fenêtres de conservation, et elles se CHAÎNENT :**

```
achat  --[ fenêtre CRUE ]-->  cuisson  --[ fenêtre CUITE ]-->  dernière portion
```

`MAX_FRIDGE_DAYS = 3` ne couvre que la seconde. Sur ce plan :

| | |
|---|---|
| le poulet de la session 2 attend **cru** | vendredi → lundi = **3 jours** |
| puis il attend **cuit** | lundi → mardi = **1 jour** |
| **total depuis l'achat** | **4 jours** |

⛔ **Une volaille fraîche tient 1 à 2 jours au réfrigérateur.** Le plan du §4 est
donc **invalide en l'état**, et rien dans le produit ne le dit.

**La règle : sans congélateur, la liste de courses se SCINDE.**

| ce qu'on achète | quand |
|---|---|
| secs, conserves, œufs, légumes durs, surgelés du commerce | **un passage**, au début |
| **viande, poisson, frais** | **un passage par session** |

⇒ Sur ce plan : **un passage vendredi** pour tout ce qui se garde et pour la
session 1, **un second lundi matin** pour la viande de la session 2.

⚠️ **Porte de sécurité, donc fail-closed** — même famille que la conservation du
cuit (§2.11 ①). Et la durée crue n'existe pas en base : voir le **lot 34**, où une
valeur **par groupe** suffit.

⚠️ Rappel du §1 du design : **la liste de courses est déjà une addition que le
modèle fait et que personne ne vérifie.**

---

## 11. Ce que ce cas ne teste PAS — la suite

| cas | ce que ça ajoute | ce que ça devrait faire bouger |
|---|---|---|
| **05** | un **objectif de poids** | l'écart, le plafond 500 kcal/j, la porte TCA, la **boîte pesée**, l'**affichage du nombre** |
| **06** | un **aliment inconnu** | l'abstention pesée et l'auto-remplissage *(lots 17-18)* |
| **07** | un **foyer** de plusieurs bouches | une casserole, N portions, l'union des interdits, la **variante de plat** *(lot 26)* |
| **08** | un **mineur**, ou une **grossesse** | des portes qui **refusent**, pas des cibles qui bougent |

⚠️ **Le cas 07 croisé avec celui-ci est le vrai mur** : quatre bouches sur cinq
jours, c'est 40 portions cuisinées en deux sessions, sous la même fenêtre de trois
jours et sans congélateur. **C'est là que le modèle produit doit tenir ou casser**,
et aucun cas plus simple ne le dira.

---

## 12. Les identifiants du code

En plus de ceux des cas 01 à 03 :

| ce que ce cas ajoute | où |
|---|---|
| la fenêtre du plan | `MAX_WINDOW_DAYS` *(1 à 7)* |
| la conservation | `MAX_FRIDGE_DAYS = 3` — ⚠️ **son sens n'était pas écrit**, voir §2 |
| les sessions de cuisine | `CookingSessions.tsx` *(front)* |
| les jours de cuisine | ⚠️ **posés comme un choix** dans l'écran — voir §7, lot 28 |
| l'attribut *cuisinée / assemblée* | ⛔ **n'existe nulle part** — lot 29 |
| la capacité d'un appareil | ⛔ **écartée exprès** — lot 27, §8 |
