# Cas 05 — les variables de confection : date, durée de session, budget

**Le cas 03 plus trois variables de plan.** Le corps, l'activité, l'appétit, les
interdits, le shaker, les forfaits et le plat de tradition ne bougent pas. Une
seule journée, trois repas, équipement **four + plaques + congélateur**.

Socle : `2026-08-21-CAS-03-EQUIPEMENT-ET-PLAT-TRADITION.md`.
Design : `2026-08-20-1900-DESIGN-CALCUL-ET-COMPOSITION.md`, partie 5 — § ⑩ à ⑮,
lots 30 à 35.

> ⚠️ **Ce cas ne peut pas tourner aujourd'hui**, et pour une raison plus dure que
> les précédents : **il n'existe aucun prix d'aliment dans la base**. Tout ce
> document est un déroulé de ce qui se passera **quand le lot 30 aura livré sa
> grille**.

---

## 1. Ce qui s'ajoute

| variable | valeur | ce que ça touche |
|---|---|---|
| **date** | vendredi, une journée | la **fenêtre**, le **jour de la semaine** — donc le plat de tradition tombe — et la **saison**, que personne ne lit |
| **durée d'une session** | 45 minutes | un **plafond envoyé au modèle**, jamais vérifié |
| **budget** | 12 € pour la journée | ⛔ **la seule porte du produit qui dépend de l'échelle** |

---

## 2. Qui traite quoi

| | **MOTEUR — avant** | **LE MODÈLE** | **MOTEUR — après** |
|---|---|---|---|
| **date** | fixe la fenêtre, le jour de semaine, la saison | compose de saison | *rien* |
| **durée** | entre comme **plafond de session** | choisit des méthodes qui tiennent dans 45 min | ⚠️ **ne vérifie rien**, exprès |
| **budget** | pose un **plafond par portion** | compose en dessous | **chiffre le panier réel** et compare — **après** le facteur |

---

## 3. ⛔ Le périmètre du budget — décidé le 2026-08-21

> **Le budget couvre le PANIER DU PLAN, pas les courses de la personne.**

| dans le budget | hors budget |
|---|---|
| ce que le plan compose et fait acheter | le **shaker**, le **pain**, le **fromage**, le **dessert** |

Ce sont ses achats à lui, récurrents et déjà faits. Les compter dans un plafond
que le plan doit respecter reviendrait à **lui facturer deux fois ses propres
habitudes**.

---

## 4. La journée chiffrée

| poste | kcal | coût | € / 1 000 kcal |
|---|---:|---:|---:|
| petit-déjeuner | 825 | 1,55 € | 1,88 |
| **déjeuner — la tradition** | 1 205 | **3,78 €** | **3,14** |
| dîner *(sans le pain)* | 675 | 1,35 € | 2,00 |
| **le panier du plan** | **2 705** | **6,68 €** | **2,47** |

**Plafond 12 € — il reste 5,32 €.** *(Hors panier, ses achats propres : shaker
0,50 · pain 0,22 · fromage 0,66 · dessert 0,55 = 1,93 €.)*

### Deux choses que le chiffrage fait apparaître

⚠️ **Le plat de tradition mange 57 % du budget pour 45 % des calories** — et il est
**imposé**. Le moteur ne peut pas arbitrer dessus : un budget serré ne se rattrape
que sur les deux autres repas.

⚠️ **L'huile d'algue coûte 0,24 € pour 2,4 g** — 100 €/kg, quarante fois le prix
des légumes, **3,6 % du budget de la journée**. Et elle n'est là ni pour un besoin
propre ni pour un goût : elle vient d'un **dégoût** (le poisson). **Une exclusion a
un prix**, et personne ne le compte aujourd'hui.

---

## 5. La durée de session — envoyée, jamais vérifiée

```
préparation                                          10 min
FOUR     poulet 35 min  ||  pommes dauphine à T+15
PLAQUE   dhal 25 min    ||  riz 15 min  ||  haricots 8 min
chemin critique                                      45 min      tient
```

⛔ **Et on n'en fait rien — décision du 2026-08-21.** On ne modélise ni la
parallélisation, ni la simultanéité des appareils, ni le temps réel.

**La raison est empirique** : le temps qu'une personne met à cuisiner dépend de son
expérience, de son organisation, d'une plaque qui chauffe mal, d'un enfant qui
appelle. **La dispersion réelle écrase de très loin ce qu'un modèle de
parallélisation gagnerait.**

⇒ La durée reste une **entrée** — un plafond, pour qu'on ne propose pas trois
heures de cuisine à quelqu'un qui en a quarante-cinq minutes. **Jamais un chiffre
qu'on vérifie ni qu'on promet.**

⚠️ Le champ existe déjà à moitié : `timeAllowsASecondDish(minutes)` gate **déjà**
la divergence R5 — le temps décide si une bouche peut recevoir son propre plat.

---

## 6. Les portes — le budget rejoint la carte, à part

```
densité   E/M     invariante d'échelle    ->  AVANT le facteur, sur la composition
protéine  P/E     invariante d'échelle    ->  AVANT le facteur, sur la composition
capacité          dépend de l'échelle     ->  ÉCARTÉE  (§ ⑥)
BUDGET    Σ q·p   dépend de l'échelle     ->  APRÈS le facteur   <- la seule qui reste
```

Sur cette journée : **6,68 € contre 12 € — passe largement.**

---

## 7. ⛔ La même journée à 5 € — et tout se met à tirer

C'est la variante qui exerce vraiment la mécanique.

```
budget                                                  5,00 €
le plat de tradition est IMPOSÉ                       − 3,78 €
                                                        ------
reste pour le petit-déjeuner et le dîner                1,22 €
   ...pour 1 500 kcal, soit 0,81 € / 1 000 kcal
```

Le petit-déjeuner seul en coûte 1,55. **Le plan ne peut pas être composé sans
sacrifier quelque chose.** Ce qui saute en premier, ce sont les deux postes les
plus chers au gramme :

| sacrifié | gagne | conséquence |
|---|---|---|
| purée de tournesol | 0,26 € | le petit-déjeuner perd sa matière grasse — recomposé |
| **huile d'algue** | 0,24 € | ⛔ **`omega3_marine` tombe à zéro** |

⇒ **Et voilà la chaîne complète, sur un seul cas :**

```
budget serré  ->  l'huile d'algue saute  ->  le drapeau oméga-3 tombe
              ->  aucun substitut accepté (il refuse le poisson)
              ->  TROISIÈME ÉTAT : « impossible à couvrir dans ce que cette
                  personne accepte, à ce budget »
```

⚠️ **Sans le troisième état d'un nutriment (§ ②), ce plan sort muet** — et rien ne
distingue « pas encore couvert » de « ne peut pas l'être ». C'est le cas qui rend
ce lot indispensable au lieu d'élégant.

---

## 8. Ce qui se DIT — et les deux moitiés

Le §⑩ montre que la tension prix/santé **ne se résout pas**. Le travail du produit
n'est donc pas de la résoudre : c'est de **faire au mieux et de dire ce qu'il a
sacrifié**.

> **La règle : personne n'explique la décision d'un autre.**

| ce qui est dit, à 5 € | par qui | pourquoi lui |
|---|---|---|
| « ton budget ne couvre pas la journée entière, il manque 1,68 € » | **le moteur** | il tient les nombres, le modèle ne les voit même pas |
| « l'oméga-3 marin n'est pas atteignable à ce budget sans poisson » | **le moteur** | c'est un verdict de porte |
| « j'ai retiré l'huile d'algue et la purée de tournesol, ce sont les deux postes les plus chers au gramme » | **le modèle** | c'est **son** arbitrage — le moteur ne voit que la sortie |

⛔ **Deux gardes sur la moitié du modèle :**
1. **falsifiable contre le plan** — si le modèle dit avoir retiré l'huile d'algue,
   le moteur vérifie qu'elle est absente. Une affirmation invérifiable ne
   s'affiche pas ;
2. **aucun nombre qui vise une personne** — la fuite est mesurée : sur un run réel
   le modèle avait recopié un facteur dans le texte visible, *« Zoé : 0,85 de la
   part de Marc »*, lu à voix haute à table.

---

## 9. ⛔ Ce qui manque pour que ce cas tourne

| ce qui manque | où |
|---|---|
| **les prix des aliments** | ⛔ **rien en base** — les colonnes `cost_*` sont du LLM, du WhatsApp et du Stripe. Lot 30 |
| **deux colonnes**, France et États-Unis | le prix est la **seule** valeur du référentiel qui dépend du lecteur. ⛔ Jamais l'une convertie depuis l'autre : les écarts sont **structurels** |
| **le troisième état d'un nutriment** | lot 21 — sans lui, la variante à 5 € sort muette |
| **le vocabulaire des compromis** | lot 35 — `plan_rationale.ts` ne sait parler que de calendrier |
| **la saison** | lot 32 — la date la porte, personne ne la lit |

⚠️ **Et un prix n'est pas une constante** : il change par pays, par enseigne, par
saison. Une colonne ne suffit pas — il faut une **source et une fraîcheur**, donc
une date de relevé sur chaque valeur.

---

## 10. Ce que ce cas ne teste PAS — la suite

| cas | ce que ça ajoute | ce que ça devrait faire bouger |
|---|---|---|
| **06** | un **objectif de poids** | l'écart, le plafond 500 kcal/j, la porte TCA, la **boîte pesée**, l'**affichage du nombre** |
| **07** | un **aliment inconnu** | l'abstention pesée et l'auto-remplissage *(lots 17-18)* |
| **08** | un **foyer** de plusieurs bouches | une casserole, N portions, l'union des interdits, la **variante de plat** *(lot 26)* — **et le budget divisé par N** |
| **09** | un **mineur**, ou une **grossesse** | des portes qui **refusent**, pas des cibles qui bougent |

⚠️ **Le budget en foyer n'est pas le budget × N.** Une casserole partagée coûte
moins cher par bouche qu'une portion solo — les gros conditionnements, les restes
qui ne se perdent pas. **C'est le seul endroit où le foyer est moins cher que le
solo**, et rien ne le modélise.

---

## 11. Les identifiants du code

| ce que ce cas ajoute | où |
|---|---|
| la durée de session | `timeAllowsASecondDish` · `SEPARATE_DISH_MIN_WEEKLY_MINUTES` — `household_portions.ts` |
| l'explication du moteur | `plan_rationale.ts` — ⚠️ **vocabulaire limité au calendrier** |
| ⛔ les prix | **n'existent nulle part** — lot 30, prompt : `2026-08-21-PROMPT-GRILLE-DE-PRIX-FR-US.md` |
| ⛔ le champ d'explication du modèle | **n'existe pas** — lot 35 |
| ⛔ la saison | **n'est lue nulle part** — lot 32 |
