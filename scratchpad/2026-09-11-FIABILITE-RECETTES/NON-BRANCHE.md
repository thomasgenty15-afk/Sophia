# Ce qui est écrit, éprouvé, et **n'a pas d'appelant de production**

Le plan l'exige : « Une étape laissée non branchée, un test sauté ou une dégustation non
réalisée reste **nommé comme tel**. » Cette liste est tenue pour que le rapport final ne puisse
pas la contourner.

⛔ **Un module testé mais non appelé ne clôt pas un lot.** C'est écrit dans le plan, et c'est la
cicatrice « ceinture armée sur coffre vide » de ce dépôt.

## ① `FINAL_GATE_POLICY_LOT_4` — écrite, non branchée (lot E)

Le handler reste sur `LOT_1`. **La branche de refus 422 est donc inatteignable aujourd'hui**,
et c'est elle qui doit empêcher l'écriture d'un plan non livrable.

⚠️ Le plan interdit explicitement le raccourci : « Ne pas activer globalement
`FINAL_GATE_POLICY_LOT_3` pour obtenir un label plus strict : corriger les faux positifs **puis**
armer les causes documentées. Vérifier que la branche de refus **empêche réellement
l'écriture/activation** ; ajouter un message ou compter `blocking` ne suffit pas. »

Le lot E a corrigé les faux positifs (8 faux manques par pluriel disparus, un vrai sous-achat
révélé à −10,5 %). **L'armement reste à faire.**

## ② `defectsFromRefusals` — posée et testée, sans appelant (lot E)

C'est le pont **garde → budget de réparation** qui manquait : sans lui, un refus du portail
final ne peut pas déclencher une réparation. Le brancher demande de restructurer le cœur du
handler — ce que les lots C et D écrivaient au même moment.

## ③ `Z1` — `portion_scaling_inputs.ts::proteinFoodPredicate` (l. 69) et `scalingInputsFor` (l. 112)

Aucun appelant de production : **garde entière désarmée** (trouvée par le lot A).
⚠️ Le lot E l'a laissée morte **exprès** : elle classe **par libellé**, exactement ce que son lot
supprime. La rebrancher telle quelle réintroduirait le défaut. À retirer ou à réécrire sur
l'identité, pas à réveiller.

## ④ `Z2` — `index.ts::tubServed` garde un oubli de repli (lot B)

## ⑤ `Z3` — `empty_intersection` a un rendu **sans producteur** (lot B)

## ⑥ Demandes au voisin encore ouvertes (lot E)

- `mealShoppingPayload` doit porter `ref` + `amount`/`unit`. **Sans quoi 26 identités sur 26 de
  GAIN restent incontrôlables en quantité** — le contrôle rend « incomplet », honnêtement, mais
  il ne contrôle rien.
- `meal_generation.ts:6200::foodGroupOfTerm` est le **dernier lecteur de mesure qui part du
  libellé** (fenêtre de fraîcheur d'un achat).
- La **lecture UI des écarts** (corps 422 + `final_gate_delivery:*`), avec la règle que
  `refusals` / `incomplete` / `unevaluated` **ne se fondent jamais** en un seul nombre.

## ⑦ La vérification culinaire — non faite, et elle ne peut pas l'être par un agent

Le plan : « L'agent fournit les fiches et la grille ; il ne prétend ni avoir cuisiné ni avoir
prouvé la saveur avec un score modèle. Les tests automatiques peuvent être terminés alors que
cette validation gustative reste explicitement à faire. »

**Aucune recette n'a été cuisinée.** `consumers_degraded = 0` veut dire « aucune portion déjà
conforme **en densité** rendue non conforme », **pas** « aucune recette dégradée gustativement ».
