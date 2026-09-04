# Trois mois d'un même foyer — ce que la campagne a mesuré

**Question posée :** est-ce que le plan s'améliore quand la mémoire du foyer se
remplit ? Et est-ce que ce qui est retenu remonte bien dans le chat, que les
questions sont posées quand c'est flou, et que les réponses sont prises en compte ?

**Foyer :** `qa-mois-20260904`, cinq bouches — Claire (titulaire), Marc, Tom, Léa
(végétarienne), Zoé. Style `balanced`, deux courses, congélateur. Douze générations
de **cinq jours**, quatre par mois sur trois mois simulés, mémoire repartie de zéro.

**Fuseau épinglé** sur une heure locale matinale pour toute la campagne. Sans ça, un
tir qui franchit le seuil du soir rend quatre jours au lieu de cinq — moins de plats,
moins de contenants — et la courbe fléchirait pour une raison sans rapport avec la
mémoire. Parade signalée par une session voisine, appliquée avant le premier tir.

---

## 1. LA RÉPONSE COURTE

**Non. Le plan ne s'améliore pas quand la mémoire se remplit — il devient plus dur à
composer.**

| | |
|---|---|
| Tirs | 12 |
| Valides | 11 (un 546 `WORKER_LIMIT`, hors mesure) |
| Plans écrits | 7 |
| **Plans refusés** | **4 — 36 %** |
| Cause des refus | le **régime**, toujours ; jamais un dégoût |

Les quatre premiers tirs passent, avec une mémoire vide ou à une ligne. Les refus
commencent quand la mémoire atteint trois lignes.

⚠️ **Le facteur n'est pas l'ancienneté du foyer, c'est le nombre de contraintes à
honorer simultanément.** Une hypothèse à vérifier sur un second foyer : c'est la
LARGEUR de la ligne qui domine (un végane exclut plus large qu'un végétarien, donc
mord plus de plats), pas le nombre de porteurs.

---

## 2. CE QUI MARCHE, ET C'EST PROUVÉ EN RÉEL

### La chaîne de la mémoire, de bout en bout

| Comportement | Vérifié |
|---|---|
| Une phrase claire s'écrit seule | « mon fils » → Tom, « mon mari » → Marc, sans question |
| Elle remonte dans le chat | 4 notifications, chacune avec son bouton **Voir** |
| Une phrase floue pose une question | « les courgettes » → `[Léa] [Zoé] [Personne de la liste]` |
| La réponse est prise en compte | `keel_memory_clarification_answered`, ligne écrite au nom de Zoé |
| Le refus de répondre n'écrit rien | `keel_memory_clarification_declined`, « D'accord, je n'ai rien noté. » |
| Le pluriel produit deux lignes | « Les petites adorent les pâtes » → Léa **et** Zoé, une seule notification |

La mémoire est passée de 0 à **6 lignes sur 4 bouches**, sans jamais rien perdre — y
compris à travers quatre refus de plan.

### La qualité des plans ÉCRITS

Sur les 8 plans écrits :

| | |
|---|---|
| Morsures de régime | 49 · **séparées par le modèle 49** |
| Morsures de dégoût | 4 · séparées par le modèle 2 |
| Bouches sans repas | **0** |
| Parts rendues par le dernier recours | 2, **dites nommément à l'écran** |

Quand le modèle réussit, il réussit complètement.

### L'écran

`/app/about-you` range chaque ligne sous le prénom de sa bouche, avec sa provenance
et la phrase d'origine :

> **Tom** — le poisson · *parce que tu as dit : Mon fils n'aime pas le poisson.*

Le bouton « Voir » navigue vers le bon bloc avec le jeton validé (`?focus=…&at=…`),
et il est intercepté localement — jamais envoyé au serveur.

---

## 3. CE QUI A ÉTÉ RÉPARÉ PENDANT LA CAMPAGNE

### ⛔ Un refus effaçait ce que la personne avait écrit

Le refus `mouth_unfed` sortait ~2 800 lignes AVANT le rangement de la note. La
personne écrivait « mon fils n'aime pas le poisson », le plan était refusé pour une
raison sans rapport, **et sa phrase était perdue** — pas de mémoire, pas de
notification, pas de question.

Corrigé : second site d'appel sur le chemin du refus, avec `planFoods: []` (sur un
refus il n'y a aucun plan servi ; proposer ses aliments serait une question sur du
vide). **Vérifié en réel** : le tir `M2C1` a été refusé et « Marc : ne veut plus de
lentilles » est écrit et annoncé.

### Une seule relance ne suffit pas sur cinq jours

`missing_before: 6 → 5`, puis refus. Une relance réécrit le plan ENTIER : elle répare
des cases et en casse d'autres. Elle insiste maintenant jusqu'à deux fois sur ce qui
manque encore, et s'arrête dès qu'un tour n'améliore rien.

---

## 4. LES QUATRE DÉCISIONS QUI ATTENDENT

### ① L'arbitrage du régime — 36 % des plans refusés

L'invariant est juste : refuser vaut mieux que laisser quelqu'un sans repas. Mais un
écran vide un plan sur trois n'est pas livrable.

Trois pistes, par coût croissant :

1. **Rendre un plat dédié à une bouche à régime au-delà d'un seuil d'échanges.**
   Rétablit le filet que `dietDiverges` portait — délibérément laissé en place.
2. **Raccourcir la fenêtre par défaut quand un régime est déclaré.** Moins de cases,
   moins d'occasions de rater une boîte.
3. **Accepter le retrait pour un régime en le disant** — explicitement refusé lors de
   l'arbitrage initial, et je ne le rouvre que pour mémoire.

### ② La fiche de corps d'un titulaire est ignorée quand sa série est vide

`household_bodies.ts` : `if (entry.member.userId) continue;` — une bouche AVEC un
compte ne reçoit jamais le relais de la fiche. Son corps doit venir de sa série
`student_body_measures`.

Ma titulaire porte **62 kg** dans la fiche du foyer, rendus par
`keel_household_bodies_for`, et **zéro** ligne de série. Son poids est écrit, stocké,
rendu — et invisible au dimensionnement. La phrase servie le dit sans dire pourquoi :
« Claire n'a pas dit ce qu'il lui faut. »

**Mesuré en base : 15 titulaires sur 38 qui portent une fiche n'ont aucune série.**
Une session voisine compte 22 sur 58 sans fiche du tout — les deux bouts de la même
mesure.

⚠️ Le trou ne se voit que si l'on écrit UNE seule des deux sources, ce que fait tout
script normal.

**La question :** la fiche d'un titulaire doit-elle servir quand sa série est vide ?
Défendable pour une lecture ratée, beaucoup moins quand il n'y a rien à lire.

### ③ L'ancrage énergétique ne mord jamais, et personne ne le sait

Sur toute la campagne : **`anchored: 0`**. Sur les journées où l'ancre est sollicitée,
elle plafonne cinq fois sur cinq.

    anchored 0 · clamped 5 · common_pot_day 20 · unmet_band {lt_200: 2, gte_200: 3}
    anchored 0 · clamped 5 · common_pot_day 20 · unmet_band {lt_200: 0, gte_200: 5}

**Huit journées-bouche sur dix manquent de 200 kcal ou plus.** Le moteur le calcule,
le compte, et `unmet_band` ne sort **que par le journal** — jamais dans
`generated_from`, jamais à l'écran. Une mesure qui ne survit pas à la génération n'est
lisible que par quelqu'un qui regardait au bon moment.

Constaté sur **deux foyers indépendants** (l'autre : 4 journées-bouche ≥200 sur 10,
2 bouches × 7 jours). Le compteur vient du commit `0a5279e7`, ni de mon lot ni du leur.

⚠️ `common_pot_day` n'est PAS « l'ancre a échoué » — c'est « l'ancre n'a pas été
sollicitée ». Ne pas additionner les deux.

### ④ Le déploiement

`supabase functions deploy generate-household-meal-v1 generate-meal-v1
keel-plan-feedback-v1` — hors de portée de l'agent, à lancer à la main.

---

## 5. CE QUE CETTE CAMPAGNE NE PROUVE PAS

1. **Un seul foyer, un seul modèle, une seule taille de fenêtre.** Douze tirs ne font
   pas un taux stable ; ils font un ordre de grandeur.
2. **Une bouche sur cinq n'était pas dimensionnée** (voir ②) : la campagne mesure
   quatre bouches servies à leur cible et une servie « comme la table ».
3. **Le passage réel du temps n'est pas exercé.** Trois mois sont simulés par douze
   générations dans la même heure ; l'horloge du générateur reste réelle.
4. **Le surlignage de « Voir » n'est pas fidèle** : il éclaire toutes les lignes du
   jour, pas celle dont la bulle parlait. L'ancre est une DATE, pas une identité de
   ligne. Sur un jour chargé, la promesse du bouton n'est pas tenue.
5. **Un tir perdu en 546** (collision de worker avec une campagne voisine) est compté
   hors mesure, pas comme un refus.

## 6. LES ERREURS DE MÉTHODE, ÉCRITES POUR LA PROCHAINE FOIS

- **Script édité pendant qu'il tournait.** Bash relit par offset : la campagne est
  repartie au premier cycle et a écrasé sa courbe. ~13 min d'appels modèle. On exécute
  une COPIE FIGÉE. Voir la mémoire `never-edit-a-running-bash-script`.
- **Remise à zéro incomplète.** `meal_precision_questions` n'était pas vidé, donc le
  budget de deux questions par jour était déjà consommé par un banc antérieur : la
  question du cycle 3 a été composée (`clarify_kept: 1`) et jamais posée
  (`daily_cap`). Le produit avait raison, la fixture avait tort.
- **Un commentaire décrivait une garde inexistante.** « On ne rejoue jamais sans avoir
  relu le compte » laissait croire à une boucle de reprise ; il n'y en avait aucune.
  Commentaire corrigé — ne PAS rejouer est le bon comportement pour un banc
  d'accumulation, un tir rejoué ne part pas à la même heure locale.
- **Deux inférences hâtives sur des sessions voisines**, corrigées après vérification :
  attribuer un compte sans lire `auth.users`, et lire un compteur (`no_direction`)
  sans lire ce qu'il compte.
