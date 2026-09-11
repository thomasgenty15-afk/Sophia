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

---

## 7. ⟳ SUITE DU MÊME JOUR — ce que la relecture des refus a changé (commit `4697fe30`)

**La cause des refus n'était pas celle du §1.** La sortie brute du modèle est archivée
(`llm_raw_response_events`) ; la ceinture rejouée dessus, boîte par boîte, sur les douze
sorties de mes quatre refus :

| Boîtes à Léa seule, déjeuners et dîners | 89 |
|---|---|
| Sa boîte contient elle-même un terme carné | 4 |
| **Sa boîte est propre, mais cite une préparation carnée** | **60** |
| dont : cette préparation fait AUSSI le tofu | 40 |
| Léa mise sur une boîte commune qui mord | 17 |
| Léa sur aucune boîte | 11 |

**Soixante fois sur quatre-vingt-neuf, le modèle avait composé la boîte** — « tofu rôti »,
les autres au poulet — et il avait cuit le tofu dans la fiche du poulet ; l'item citait cette
fiche ; la ceinture lisait la fiche et retirait Léa de sa propre boîte. Trois foyers mesurés
par une session voisine donnent la même cause (10/10, 12/13), un quatrième la donne sur un
**dégoût** (raviolis aux champignons et aux épinards dans une seule fiche).

⛔ **La faute d'instrument** : la ceinture retire le nom AVANT la sérialisation. Sur le plan
rendu, une bouche écartée est indiscernable d'une bouche oubliée. Deux sessions ont mesuré le
moteur en croyant mesurer le modèle — le « 36 % » du §1 et le « 12/12 puis 0/10 » voisin
comptaient tous deux le retrait, pas la composition.

**Les erreurs réelles du modèle (28/89) viennent surtout des relances** : chaque relance
réécrivait tout et régressait autrement (sans boîte → cite le poulet → sur la boîte commune).

### Décisions prises par l'utilisateur, et livrées

| | Décision | Livré |
|---|---|---|
| ①·1 | le prompt exige une **préparation à part** pour le composant échangé | `v27_the_swap_cooks_apart` ; règle des dégoûts alignée |
| ①·2 | la relance **nomme le lien fautif** au lieu de redemander une boîte | `BoxHeldOff.via / preparationId / matched`, deux ceintures ; consigne chirurgicale |
| ①·3 | faire taire la ceinture quand les items sont propres | **refusé** : du tofu cuit dans la fiche du poulet ne convient pas à un végétarien strict |
| ② | la fiche d'un titulaire sert quand sa série est vide | oui ; une lecture ratée reste fail-closed |
| ③ | le plafond d'un repas suit le besoin, plus le kilo | `mealMassCapGrams` = cible / 1,35 kcal/g ; `unmet_band` archivé |

### Le ③, vérifié pas à pas

| Léa | 12 ans, 36 kg, entraînement intensif |
|---|---|
| Plafond à 8 g/kg | 288 g par repas |
| Ce que le modèle avait écrit pour son dîner | 500 g |
| Ce que le moteur servait après plafond | 300 g |
| Ce que chaque adulte recevait | 446 g |

Le moteur RÉDUISAIT la boîte, puis comptait qu'elle manque de 200 kcal : il créait le manque
qu'il rapportait. Le calcul était juste ; la constante, calibrée sur des adultes, ne l'était
pas pour une enfant. Le plafond est maintenant ce que pèse le besoin du repas à la densité
d'un plat ordinaire — pour Léa ~520 g ; pour l'iku de 3 570 kcal de la fixture, 925 g, et le
1,2 kg d'origine reste refusé.

### Ce que ce commit ne prouve pas encore

1. **Que le modèle fait DEUX préparations sous v27.** Aucun test ne peut le dire ; un tir réel
   sur le foyer de campagne est prévu dès que la pile est libre.
2. **Que la relance chirurgicale converge.** Elle est testée sur sa phrase, pas sur un modèle.
3. **La phrase « c'était ça ou pas de repas »** (dernier recours d'un dégoût) reste fausse
   dans le cas `via === "preparation"` — le fait existe maintenant pour la réécrire ; non fait,
   `plan_rationale.ts` étant sous une autre session ce soir.
4. **L'histoire commitée saute v26** (lot voisin non commité, sur décision de son
   utilisateur) : ce lot devra se poser sous un v28.

---

## 8. ⟳ LA PREUVE EN RÉEL DU COMMIT `4697fe30` — et le défaut qu'elle a d'abord révélé

### 8.1 Deux premiers tirs : tout le monde végétarien, et ce n'était pas v27

Deux générations de cinq jours sur le foyer de campagne, sous v27 : `200`, 0 manquant,
`unmet_band` présent (le code neuf a tourné) — et **les deux plans entièrement végétariens**
pour quatre omnivores. Le message utilisateur portait, sous les contraintes dures :

    - Claire: vegetarian — diet, severity=strict (declared by student)

Claire est la titulaire omnivore. La ligne vient de `student_safety_constraints`, écrite à
15:13 par le classifieur de notes à partir de la note du cycle **M3C1 : « On mange végétarien
le lundi soir. »** — un rythme d'UN dîner par semaine, rendu comme
`safety: {kind: "diet", ref: "vegetarian", member_id: null}`. Trois couches, chacune juste
seule : `member_id: null` = la personne qui écrit (la titulaire) ; `DEFAULT_SEVERITY.diet =
strict` ; « ONE MOUTH'S HARD CONSTRAINT GOVERNS EVERYTHING this household cooks ».

⛔ **Le symptôme ressemblait à une amélioration.** Depuis 15:13, les deux derniers plans de la
campagne étaient déjà végétariens ; je les avais lus au §3 (`common_pot_day: 25`) comme « le
plat est commun partout », et les refus s'étaient arrêtés parce qu'il n'y avait plus rien à
échanger. Le §1 compte donc onze tirs dont les deux derniers sous une contrainte fausse.

**Cause de fond :** `SAFETY_DECLARATION_PROMPT_BLOCK` n'a aucune notion de PORTÉE. Un régime
valable un soir par semaine est un rythme, pas un régime, et rien ne le dit au modèle.
**Chantier à ouvrir, non fait** ; la fausse ligne a été rétractée sur la fixture (motif écrit).

Une session voisine l'a vérifié chez elle : zéro ligne, parce que son banc écrit l'état par
RPC et n'exerce jamais le classifieur — *un banc qui écrit l'état est immunisé contre les
défauts du chemin qui l'écrit d'ordinaire, sans le savoir.*

### 8.2 Deux tirs sur la fixture réparée : le vrai cas du régime

| | V27-3 | V27-4 |
|---|---|---|
| HTTP · durée | 200 · 389 s | 200 · 195 s |
| Préparations carnées / tofu | `prep_chicken`, `prep_beef` / **`prep_tofu_sun`** | `prep_chicken`, `prep_beef` / **`prep_tofu`** |
| Régime : morsures · séparées · refusées | 6 · **6** · 0 | 7 · **7** · 0 |
| Boîtes de Léa à elle · citant une fiche carnée | 6 · **0** | 7 · **0** |
| Dégoûts : morsures · séparées · refusées | 8 · 3 · 5 → relance ×2, 1 acceptée, 1 restauré | 0 |
| Bouches sans repas | 0 | 0 |

**Le mécanisme est visible dans les préparations** : le tofu a sa fiche dans les deux tirs, là
où il partageait celle du poulet quarante fois sur soixante avant. Treize morsures de régime
sur treize séparées par le modèle, zéro refus — contre quatre refus sur onze en campagne. Deux
tirs ne font pas un taux ; la scission est structurelle, pas statistique.

⚠️ Mon lecteur disait « Léa SANS BOÎTE » sur trois plats de V27-4 : ce sont des plats sans
AUCUNE boîte (œufs, pois chiches), où tout le monde mange — l'invariant les compte nourris, à
raison. *Lire les plats, pas les compteurs.*

### 8.3 Le ③ en réel — la boîte de l'enfant

| V27-4 | Léa, écrit par le modèle | Léa, servi | un adulte, servi |
|---|---|---|---|
| ven. dîner | 150 g | **433 g** | 518 g |
| sam. déjeuner | 350 g | **530 g** | 592 g |
| dim. déjeuner | 350 g | **496 g** | 592 g |

Là où le kilo la rabotait à 300 g, l'ancre monte maintenant sa boîte à ce que porte son besoin.
`unmet gte_200` reste à 4 sur les jours ancrés : à la densité de ces plats, son besoin ne tient
pas dans le volume — c'est désormais le vrai message du compteur, **composer plus dense pour
elle**, et personne ne le demande encore au modèle. Reste ouvert.

### 8.4 Non exercé ce soir

- **La relance chirurgicale** (`via === "preparation"`) : aucun `held_off_regime` n'est apparu,
  donc rien à nommer. Tenue par ses tests, pas par un tir.
- **La phrase « c'était ça ou pas de repas »** : sortie une fois (V27-3, dégoût restauré) ; le
  fait pour la réécrire existe, la réécriture non.
- **Le canal `safety` sans portée** (§8.1) : le défaut le plus grave de la journée, et un
  chantier à part entière.
  ⟳ 19:45 — **pris à la source par la session voisine** (`draft_note_safety.ts`, non commité) :
  un second discriminant dans la consigne — une ligne de sécurité vaut à CHAQUE repas ; attachée
  à un jour, un moment ou une fréquence, ce n'en est pas une —, sans matcher de refus (fail-open
  sur la sécurité est interdit), mesuré par un tir réel avec une note de rythme. **La sortie dure
  reste la CLARIFICATION** — « tu manges végétarien le lundi soir : ça vaut pour tous tes repas ? »
  — et c'est le lot suivant côté mémoire : une note qui hésite entre régime et rythme ne s'écrit
  nulle part tant que la réponse n'est pas là, sous le budget de deux questions par jour.

---

## 9. ⟳ « Densifier dans la boîte » — l'autre geste, côté moteur (commit `55afbbfb`)

**La question de l'utilisateur** : « ce n'est pas le modèle qui doit composer plus dense,
c'est notre algo après le modèle ». Juste : l'ancre applique un facteur uniforme par boîte et
ne change jamais les proportions. `box_densify.ts` déplace des grammes, à masse constante,
des items les moins denses vers les plus denses de la boîte d'une bouche dont le jour est
`factor_clamped`, la meilleure paire d'abord, sous quatre gardes nommées et testées chacune
par une mutation : plancher de légumes 70 %, plafond de protéine 150 % (200 % ailleurs,
400 g absolu), jamais vers un item non résolu, masse conservée à l'octet. Chaque arrêt est
compté par sa garde (`box_sizing.densify.stopped`). Il n'ajoute rien, ne touche pas aux
boîtes partagées, et ne ferme pas un écart de protéine.

**Non prouvé en réel.** Le tir de preuve a été refusé en amont, `mouth_unfed`, deux cases
de Léa :
- **un faux positif de la ceinture de régime** — « pâtes » lu comme « pâté » dans
  `prep_pasta_veg`, une préparation de pâtes aux légumes. L'homographe au pluriel, la forme
  la plus fréquente d'une cuisine française, n'est pas dans la liste posée ce soir par la
  session voisine ; signalé, c'est leur mécanisme ;
- **un vrai cas** (`prep_chicken` cité par l'item de Léa) : la relance chirurgicale a nommé
  le lien, le terme et l'interdit de réécrire, exactement comme prévu — et le modèle a quand
  même tout réécrit (Léa sur six boîtes partagées). Rejetée, donc 422.

Sur trois tirs v27 du soir : deux plans à 13/13, un refus dont la moitié est ce faux positif.
Et `issues` porte `body_from_sheet:` — la fiche de la titulaire sert, en réel.
  ⟳ `5a676578` — **la casserole n'est pas sur-tirée** (relecture de la session voisine) : la masse
  d'une boîte était conservée, pas le tirage sur chaque casserole, et le compteur `sum_over`
  tourne avant la densification. Chaque déplacement est désormais borné par ce qu'il reste
  dans la casserole cible ; une casserole déjà sur-tirée n'est jamais une cible ;
  `pot_exhausted` est la sixième garde comptée.

### 9.1 ⟳ Ce que le tir de preuve a révélé avant de mesurer quoi que ce soit

Trois tentatives, aucun plan écrit : un 502 et un 503 (le conteneur recréé par une écriture
voisine pendant le tir), puis un refus `mouth_unfed` — et ce refus a montré **un défaut de
l'invariant « personne sans repas »**, pas du modèle :

- Zoé (courgettes) avait **sa propre boîte** au dîner de dimanche, items propres, mais un item
  citait la préparation « Semoule aux courgettes ». La ceinture l'a retirée ; sa boîte, vidée de
  son seul nom, a été **jetée** ; le dernier recours cherchait alors une boîte absente, rendait
  zéro, et le plan partait en refus pour trois cases de **dégoût** — la cause que le produit a
  décidé de ne jamais refuser.
- Le deuxième essai du modèle avait pourtant composé la bonne chose pour elle (« semoule aux
  poivrons ») ; rejeté parce qu'il remettait Léa sur la boîte au poulet. **Une acceptation
  tout-ou-rien fait payer la partie juste par la partie fautive** — cause nommée, non traitée.

**Corrigé (en attente de commit, gate voisin rouge)** : quand la boîte enregistrée manque, la
bouche revient sur la boîte de table du même plat, à la même case, et c'est compté à part
(`restored_fallback`). Et la phrase « c'était ça ou pas de repas » a disparu des issues et de
la rationale : un repas était composé, et une relance en avait composé un meilleur. Le test qui
l'épinglait épingle son absence.

Deux leçons d'instrument de plus, apprises des deux côtés : **lire les items d'une boîte ne dit
pas ce que la bouche mange, il faut suivre la citation de préparation** ; et une écriture sous
`supabase/functions/` recrée le conteneur, donc **tue le tir de l'autre** — le gel a été
formalisé dans les deux sens.

**La densification reste non mesurée en réel** : trois tentatives, zéro plan écrit. Prochain
tir dès que l'arbre partagé est vert.

### 9.2 ⟳ Le repli est commité (`1718a377`) et le tir suivant l'a vu tenir

DENS-3, même foyer : refusé, quatre cases, **toutes de régime** pour Léa. Et le journal dit la
moitié qui est réparée : `missing_before 12 → 4`, `retry_on {held_off_exclusion: 8,
held_off_regime: 4}`, **`restored: 8, restored_fallback: 0`** — les huit dégoûts revenus sur
leur boîte, aucun refus de dégoût. Ce qui reste est la consigne de séparation que le modèle ne
tient pas à chaque tir : sur les trois sorties, Léa a quinze boîtes à elle, **zéro terme carné
dedans**, sept citent la fiche du poulet, sept fois elle est sur une boîte partagée. Sur ce
foyer, la « préparation à part » tient deux tirs sur cinq ce soir. C'est le modèle, et ce
n'est pas un taux.

**Ce que ça laisse ouvert, nommé** : l'acceptation d'une relance est tout-ou-rien — un essai
qui répare trois cases et en casse deux est rejeté en entier. Réparer la cause serait accepter
par parties ; non fait ce soir.

Pour mesurer la densification malgré ça, le tir suivant isole l'énergie du régime : même foyer,
Léa **sans** ligne végétarienne (mutation de fixture, restaurée), 12 ans, 36 kg, entraînement
intensif — l'ancre plafonne toujours sa boîte, et c'est ce que le lot doit faire bouger.

### 9.3 ⟳ La densification, exercée en réel — et ce qu'elle a trouvé sur son chemin

Cinq tentatives de tir pour un plan écrit avec une boîte plafonnée :

| Tir | Résultat | Ce que ça a montré |
|---|---|---|
| DENS-1 | refusé (régime) | le modèle n'a pas séparé la casserole ; relance régressée |
| DENS-2 | 502 / 503 | conteneur recréé par une écriture voisine pendant le tir |
| DENS-2 ter | refusé (régime + dégoût) | **le dernier recours cherchait une boîte jetée** → corrigé `1718a377` |
| DENS-3 | refusé (régime seul) | `restored: 8` — le recours des dégoûts tient ; la casserole non séparée reste |
| DENS-4 (Léa sans régime) | **écrit**, densification exercée une fois | **`no_density`** : une pincée de sel rendait la casserole inconnue → corrigé `4b115c1c` |
| DENS-5 (Léa `own_usual`) | écrit, un seul jour composé | un plat dédié n'a pas de boîte, donc n'est ni ancré ni densifiable |

**Le rejeu hors ligne** de la boîte réelle de DENS-4 (Marc, vendredi soir) avec le vrai
référentiel, après le correctif : « poulet rôti » citant `prep_chicken` vaut maintenant
**1,89 kcal/g** (résolu, `poultry`), là où le tir voyait `no_density`. Le second item, « bœuf
rôti » citant `prep_beef`, reste inconnu : **le référentiel ne résout aucune forme de bœuf** —
« bœuf », « bœuf à rôtir », « rôti de bœuf », « bœuf mijoté » sont tous non résolus. La boîte
s'arrête donc sur `no_dense_target`, à raison : rien de plus dense que le poulet n'est connu.
Sur la boîte de table du même plat, poulet 1,89 contre lentilles 0,98 : le module y déplacerait.

**État honnête du lot.** Câblé, prouvé par 18 tests et 8 mutations (une équivalente, dite),
états commités prouvés seuls ; exercé en réel une fois, où il a révélé son propre défaut par le
compteur prévu pour ça ; corrigé ; rejoué sur données réelles avec des densités qui se
résolvent. **Aucun plan réel n'a encore montré des grammes déplacés** : il faut une boîte à un
nom sur un plat partagé, plafonnée, dont deux items au moins ont une densité connue. Le
prochain obstacle n'est pas dans le module : c'est **le bœuf absent du référentiel**, qui
bloque aussi l'ancrage d'énergie de tout plat au bœuf (`day_incomplete`).

**Corrections de la journée hors lot initial** : `1718a377` (repli du dernier recours + phrase
fausse retirée), `55afbbfb` / `5a676578` (densifier, borné par la casserole), `4b115c1c`
(densité adossée à `condimentMassFor`).

---

## 10. ⟳ « Améliore ça » — ce qui a été fait après le bilan (commit `6c001880`)

**Le bœuf est dans le référentiel.** Le référentiel portait 288 lignes de viande rouge et 78
alias « boeuf … », tous aux formes LONGUES de CIQUAL que le modèle n'écrit jamais. Les
modificateurs que `candidateForms` retire sont anglais : « rôti », « émincé », « cuit » ne
réduisent rien. La voie du dépôt est l'alias vérifié, jamais une règle de grammaire :
dix-sept alias vers des lignes existantes — huit formes de bœuf, `poulet`/`poulet rôti`,
poisson blanc, tomate concassée/passata, compote sans sucre, fromage frais — pris pour moitié
dans le haut du sas des inconnus. Refusés exprès : « tofu soyeux » (le ferme fait trois fois
son énergie), « salsa de tomates », « galettes de blé complet » (aucune ligne). Appliqué en
local ; le `db push` distant reste à ta main.

**La boîte réelle de Marc bouge en rejeu.** Poulet 1,89 kcal/g, bœuf **1,71** (était inconnu),
86 g déplacés du bœuf vers le poulet, +15 kcal, arrêt sur le plafond de protéine. Peu de
gain — deux protéines de densité voisine — mais le mécanisme s'exécute de bout en bout sur
des données réelles, chaque garde comptée.

⚠️ **Fait mesuré par une autre session (`sophia-2-74`), à connaître avant tout commit :** HEAD
est déjà incohérent, indépendamment de mes lots — `SetupPage.tsx` a été commité le 04/09 à
15:06 (`d33aae13`) en passant des props (`style`, `oneCookingSession`, `daysToEat`) qui ne
vivent que dans le `GroceryRunsField.tsx` NON commité du lot « offre de courses ». `tsc` sur
HEAD nu échoue sur cette ligne, et trois tests vitest sont rouges dans HEAD nu. Le hook ne le
voit pas parce qu'il gate l'arbre de travail, où les deux moitiés sont présentes. Ni à moi, ni
à elle ; le propriétaire de ce lot n'est plus joignable.

### 10.1 ⟳ Le premier plan réel densifié a menti, et le compteur l'a dit

Le tir de 16 h 13 (coupé en 504 par Kong, dont le délai était retombé à 150 s avec le
redémarrage de la pile) a quand même écrit son plan, `161a04de`. Densification exercée sur
trois journées-bouche, deux boîtes touchées — et **`moved_g: 25`, `closed_kcal: 393`**.
Vingt-cinq grammes ne ferment pas 393 kcal ; une densité mentait.

La cause, lue dans l'archive : **la lane foyer ne remplit pas `gramsRaw`** (nul sur vingt
ingrédients sur quarante-trois, « tofu ferme 370 g » compris), pendant que `dishEnergy`
recalcule ses grammes depuis quantité, unité et état. Mon dénominateur lisait le champ : il ne
voyait que l'huile convertie et les condiments — une casserole de tofu rapportée à quinze
grammes, ~50 kcal/g. Mon rejeu hors ligne ne pouvait pas le voir : il reconstruisait
`gramsRaw` avec la fonction même du numérateur. **Un rejeu qui remplit un champ que le runtime
laisse vide prouve le rejeu, pas le runtime.**

**Corrigé** : le dénominateur passe par `resolveIngredients`, la règle d'admission du
numérateur ; un test rejoue le cas du runtime (`gramsRaw` nul partout) et tient
`closed_kcal ≤ moved_g × 4`. Mutation : le dénominateur qui exige `gramsRaw` → rouge.

**Biais connu, non traité** : l'eau de cuisson d'un riz compte dans les grammes prêts alors que
le rendement du grain l'absorbe déjà — un riz sort à 0,77 kcal/g au lieu de ~1,3. C'est aussi
`preparationReadyGrams`. Un lot à part.

**Après le correctif (`567585ae`), tir DENS-9** : `200`, 5 jours, 0 sans repas, `restored: 2`.
Densification exercée sur une journée-bouche — la boîte de Marc, samedi soir, un seul item
(« pain complet 240 g ») — et arrêtée sur `no_dense_target`, `closed_kcal: 0`. Les compteurs
disent vrai : rien à déplacer dans une boîte à un item. **La densification n'a pas encore
déplacé de grammes sur un plan réel avec des nombres justes** ; il faut une boîte à un nom,
plafonnée, à deux items résolus — le bœuf désormais connu rend ce cas possible, et le rejeu
sur la boîte de Marc de la veille le montre (86 g, +15 kcal, arrêt sur le plafond de protéine).

### Ce que « améliore ça » n'a PAS fait

- **Le taux de tenue de « tofu cuit à part »** (2 tirs sur 5) : non amélioré. Les deux leviers
  identifiés — la consigne dans le bloc des préparations, et l'acceptation PAR PARTIES d'une
  relance qui répare trois cases et en casse deux — sont nommés, pas faits.
- **La question de clarification** quand une note hésite entre rythme et régime : non faite.
- **Le déploiement** et le `db push` de la migration des alias : à ta main.

---

## 11. ⟳ Mandat « production ready », en binôme — pas de recul n°1 (2026-09-05, 17 h 20)

**Cadre posé avec `sophia-2-74`** (l'ex-`3f`, redémarrée) et `sophia-2-0f` (troisième session,
arrivée sur ordre de l'utilisateur) : un backlog P0/P1, une répartition par lane, un protocole
(une génération à la fois annoncée ; aucune écriture sous `supabase/functions/` pendant, tests
compris ; commits depuis un index dont le compte de fichiers est lu au premier plan ; état
commité matérialisé et testé à part ; relecture croisée par des faits ou des mutations ; agents
d'audit en lecture seule).

**P0.1 — HEAD ne construisait pas, et c'était MA faute pour la moitié la plus grave.** Un agent
d'audit (HEAD nu matérialisé) a trouvé que mon commit `567585ae` avait emporté `cooking_plan.ts`
et son test dans une version périmée que l'index partagé tenait — `runs` disparu sous ses deux
consommateurs, la suite deno keel qui ne démarrait plus sur HEAD. Réparé index seul
(`f673945f`, blob exact de `36871f48`), prouvé : deno vert sur trois lanes, 5 443 tests. Règle
durcie : le compte de fichiers de l'index s'écrit DANS la commande de commit.
L'autre moitié : `d33aae13` (04/09) a commité `SetupPage.tsx` sans l'extension de
`GroceryRunsField` — le lot « offre de courses », orphelin, SIX fichiers en travaux (dont
`MealBuilder.tsx` +413/−408, qui casse un test). Réparation prête, index seul : retirer les trois
props mortes ; l'arbre garde le lot intact.

**P0.2 — la relance par parties** (`f81ce212`) : quand le plan relancé n'est pas meilleur en
entier, ses seules cellules réparées sont prises, avec casseroles, sessions et courses. Mesurée
en ce moment par `sophia-2-74` sur ses cinq foyers (avant : `mouth_unfed` sur trois d'entre
eux).

**P0.3 — la clarification « rythme ou régime ? »** : confiée à `sophia-2-0f` avec le brief.

**P0.4 — la latence** : 85 s par appel modèle, 10–12 k jetons, une génération en enchaîne un à
quatre. Bloc prêt : la relance ne rendra que les cellules à réparer.

**Lot F** (`fc1642f0`, `sophia-2-74`) : le kcal d'une boîte à un nom sous la ceinture de sa
bouche, prouvé sur le plan vivant du duo sans générer ; un agent le relit en ce moment.

**Ce qui n'a pas bougé** : la tenue de « tofu cuit à part » (le modèle) ; l'écran du lot F que
personne n'a ouvert ; P2/P3/P4 (trois tests et une baseline, décisions humaines).

## 12. Pas de recul n°2 (2026-09-05, 18 h 30) — ce qui a été trouvé sur le produit, pas sur les commits

**Ce que l'utilisateur a rappelé à 18 h :** l'énergie allait aux commits et à leur
coordination ; le but est d'améliorer le système. Acté : plus de HEAD nu matérialisé à chaque
pas, chaque message entre sessions porte un fait produit ou une mutation.

**Corrigé dans §11** : le lot « offre de courses » n'était pas « en travaux » — son auteur
(session morte le 04/09) l'avait déclaré fini et testé, sans que personne ne dise « commite ».
Le rouge de `householdEnvyWiring` venait d'un test d'un lot voisin mesuré sans son code. La
troisième session relit les deux lots en adversaire (trois mutations rouges exigées) avant de
les poser ; s'ils entrent, `a0f6af7d` est renversé par construction.

**Le fait le plus lourd de la journée, mesuré deux fois par la session voisine (C06, C07) :**
cinq bouches, une végétarienne, quatre omnivores → une semaine sans UNE casserole carnée, 42
plats, avec `bites: 0, refused: 0, missing: 0` — le journal d'un plan parfait. Un zéro de
ceinture sans dénominateur. Posé (`9f40c025`) : `swap_presence` par cellule (déjeuner/dîner),
`regimeBites` posé par la ceinture sur chaque plat, relance du cas flagrant seulement, v28 qui
nomme la sortie attendue au lieu de fermer l'échappatoire. **Mesure réelle en cours** sur les
mêmes foyers (v28, un tirage chacun) ; hier : 0/3 et 0/5 casseroles carnées.

**Trouvé en lisant C06, pas encore posé (scripts prêts, ancres vérifiées) :**
- Le foyer C06 est réglé « keen » (120 min, recettes soignées, variété) et reçoit 3 casseroles
  pour 13 repas principaux, le même plat six fois, des sessions de 55 min. La lane foyer ne
  passe **ni `recipeDifficulty` ni `variety`** à `buildMealPrompt` : la ligne « repetition they
  accept » n'a jamais été émise pour un foyer, quel que soit le style. Les valeurs dérivées du
  style existent (`resolveCookingCapacity`) et ne sont lues par personne. Le correctif passe
  les deux, et la consigne dit le compromis attendu (« no main dish twice in the week, at least
  two preparations per session ») au lieu du mot seul.
- La rationale de C06 disait « le reste de la table garde la sienne » sur un plan sans viande :
  `swapped` était « il existe des omnivores », pas « la viande existe ». Trois états lus sur le
  plan cuisiné : `none` / `boxes` / `whole_table` → « Cette semaine, toute la table mange
  végétarien : c'est la ligne de Lea. »
- Le brief demandait aussi la pizza voulue par le foyer ; l'explication dit « la pizza demandée
  devient un dîner de tofu ». Non traité : à regarder après la mesure v28.

**Relecture R2 de la fusion par parties (`f81ce212`), par la troisième session** — trois
défauts réels, correctifs prêts : la casserole du plat remplacé restait dans le plan, sa
session et les courses (on cuit et on achète un poulet que personne ne mange) ; la même fiche
cuite un autre jour était réutilisée (mangée samedi, cuite dimanche, 1 200 g tirés sur 500 g) ;
le tout-ou-rien n'était épinglé que par la position du texte. Et un trou préexistant : un plat
sans boîte nourrit tout le monde pour l'invariant, y compris une végétarienne devant un poulet.

**Voir → ligne** (`4d43ff41`) : le bouton « Voir » allumait toutes les lignes du jour ; il
allume les lignes écrites (les textes voyagent dans la metadata de la bulle). Le chemin du tap
de clarification retombe encore sur le jour.

**Lot S (troisième session, en cours) :** « Tom est allergique aux arachides » écrit dans une
note → les deux RPC par bouche rendent `not_authenticated` sous `service_role`, `failed=1`, un
log, et la personne n'est pas prévenue. Une allergie d'enfant perdue en silence. Migration
`_for(p_user, …)` + accusé qui dit ce qui n'a PAS été écrit.

**Décisions humaines qui attendent** : P2/P3/P4 (trois vitest rouges et la baseline vidée,
propriété du lot β) ; `keel_properties/` hors du filet du gate alors que TESTING.md le promet —
et la suite ne typecheck pas sur l'arbre pour une dérive étrangère ; le déploiement.

### 12.1 Mémoire — deux gestes de la personne qui ne produisent rien (audit de la troisième session, vérifié)

**« Garder » ment sur l'écran du foyer.** La carte « Ce que tu m'as dit sur ton alimentation »
(`/app/household`) promet : « ce que tu gardes sert quand ta semaine est composée », et
range les lignes gardées sous « Dans ton plan ». Depuis le lot C (2026-09-03), le générateur
solo ne lit plus `practical_constraints.food_preferences` — retiré exprès du prompt comme
« troisième source déguisée en bouton » — et le générateur foyer ne l'a jamais lu. Le bouton
écrit encore cette liste. **La personne garde, rien n'atteint un plan, et l'écran dit le
contraire.** Décision humaine à prendre, deux voies : (a) retirer la carte et sa promesse
(cohérent avec la décision du 03/09, mais on perd la seule surface où la conversation propose
des souvenirs à confirmer) ; (b) rebrancher « Garder » sur `keel_write_retained_items` — une
ligne retenue durable, sujet foyer, kind `food.prefer`/`food.exclude`, la même RPC et le même
vocabulaire que l'écran « Ce que Sophia sait » — ce qui fait de la confirmation de la
personne une source reconnue, pas une phrase plate. Recommandation : (b), parce que
l'objection du 03/09 portait sur les phrases plates hors vocabulaire, pas sur le fait que la
personne confirme un souvenir. Dans les deux cas, le sous-titre actuel doit partir.

**L'encart « pour le prochain plan » ne vit pas pareil des deux côtés.** Serveur : mort dès
qu'un plan est validé après son écriture (`validated_at > written_at`). Écran : vivant jusqu'à
ancre + 6 jours, sans regarder `validated_at`. La carte montre donc encore une ligne que le
générateur ne lira plus, jusqu'à six jours. Réparation : la lecture de la carte lit aussi le
dernier `validated_at` du compte (une requête) et rend la ligne comme « servie » plutôt que
de la cacher. Non fait ; à poser après la mesure v28.

## 13. Mesure v28 et lot d4cbf20a (2026-09-05, 18 h 45)

**v28 mesuré par la session voisine, un tirage par foyer :**
- C06 (keen) : 9 cellules sur 11 portent la viande, Léa séparée 9/9, personne sans repas,
  aucune relance — hier 0/42. Réparé sur ce tirage.
- C07 (minimal) : **renversé**. La viande est partout, y compris dans la boîte de Léa
  (`refused 11, separated 0`). En lisant le plan : le modèle avait cuit un pot de tofu POUR
  Léa (`prep_sat_tofu`, cité par personne) et fait citer le pot de poulet par sa boîte. La
  ceinture la retirait 11 fois ; deux relances (dont une partielle, P0.4) et la fusion par
  parties — exercée en réel pour la première fois — ont resservi 8 cellules ; 3 repas
  restaient sans elle. Le dénominateur `swap` ne voit pas ce cas (le pot existe ; c'est la
  boîte de la bouche liée qui le cite).

**Ce que d4cbf20a change, et pourquoi c'est le moteur et pas le modèle :** la ceinture
répare la citation avant de retirer la bouche — casserole orpheline du même jour, avec une
protéine, acceptée par la ligne, une seule candidate, compté. Sur C07 v28 cela aurait valu
11 réparations et zéro relance. Ce n'est pas faire taire la ceinture (écarté le 04/09) : la
boîte cite désormais le tofu cuit à part. Décision prise en autonomie, réversible, dite ici
pour être contestée.

**Le reste du lot :** le style atteint le brief (jamais passé avant, pour aucun foyer) ; la
rationale dit « toute la table mange végétarien » quand c'est vrai ; la fusion par parties
défait ce qu'elle remplace (R2) ; un plat sans boîte ne nourrit plus la bouche que sa ligne
mord ; v29 (« never cited by the box of the person that line binds », l'envie servie telle
quelle). Non prouvé en réel : v29 et la réparation. La voisine tire C06/C07.

**Fait à garder :** `resolveCookingCapacity` ne dérive le style que si des courses sont
déclarées (`grocery_runs`) ; sans elles, difficulté et variété restent nulles même avec un
style. Épinglé par un test, pas changé — à décider.

### 13.1 Énergie — le facteur d'ancrage bute sur ×3 sur 5 plans sur 5

Sur C03–C07 (v27/v28), `box_sizing.anchor.anchored = 0`, `clamped = 100 %` des bouche-jours,
`unmet.factor_clamped = 100 %`, `unmet_band.gte_200 = 100 %` — après densification (C03 :
2 684 g déplacés, 2 954 kcal fermés, 11/12 bouche-jours encore à ≥ 200 kcal sous le besoin).
`ANCHOR_FACTOR_MAX = 3.00` (`mouth_anchor.ts:497`), et le code le sait depuis le 04/09
(« qa-mois : anchored 0, clamped 5/5 »). Les boîtes du modèle sont trop petites d'un facteur
que le plafond ne rattrape pas ; la session voisine mesure C03 à 3 200 kcal/jour pour QUATRE
bouches (cible 8 571) et remplace « a palm of protein, a fist of starch » par une taille de
repas en grammes (tronc, `MEAL_PROMPT_VERSION` v27). On lit `anchor.clamped` et `unmet_band`
sur ses tirs avant de toucher au plafond.

### 13.2 Mémoire — « pour le prochain plan » (lot front, en attente de commit)

Le second défaut de l'audit était plus profond que « deux définitions de vivant » : le serveur
pose `written_at` dans l'enveloppe de chaque envie, et **l'écran le perdait à chaque
enregistrement** (ses deux écrivains réécrivaient `{item, anchor}` seuls). D'où les 12 entrées
sur 19 sans `written_at`, et un serveur retombant sur la règle du jour. Réparé : l'écran lit,
garde et rend `written_at` ; la carte lit le dernier `validated_at` du compte et applique la
règle du serveur mot pour mot (`isNextPlanItemServed`). Le commit attend qu'un test rouge du
lot voisin (classifieur, porte ③) repasse : le gate teste l'arbre partagé.

### 13.3 P0.4 mesuré en passant (C07 v28)

Deux relances « personne sans repas » sur le même plan : la première (avant le bloc partiel,
plan entier) 87 s et 12 614 jetons de sortie ; la seconde (bloc « RETURN ONLY THE MEALS
NAMED ABOVE ») 52 s et 6 516 jetons — la moitié. La fusion par parties a pris 8 cellules sur
la seconde. Un seul plan, pas un taux ; mais le sens est celui attendu.

Sur qa-3portes (tirs de la troisième session, 18 h 09) : un `swap_retry` a tiré (47 s,
5 491 jetons) — le cas flagrant existe aussi hors des fixtures C06/C07.

### 13.4 Lot S + P0.3 commités par la troisième session (`7af3ad91`) — et une mutation verte

Prouvé en réel par elle : « Mon fils est devenu végétarien » dans une note →
`household_members.diet` de Tom = vegetarian (`written=1 attributed=1`) ; « On mange
végétarien » → question à trois boutons, contrainte posée seulement par la porte de sécurité
après le tap « toujours », rien d'écrit avant. Non prouvé : la branche « Non, pas toujours »
en réel ; aucun taux (le banc des clarifications n'a pas de cas `scope`) ; `db push` de deux
migrations et le déploiement, à la main de l'humain.

Relecture par mutation (copie de HEAD) : retirer le filtre `SCOPE_HELD_KINDS` de
`withoutSafetyHeldForScope` laisse « L'ALLERGIE PASSE » **vert** — la garde réelle est le
`ref` (seuls les refs des questions de portée, des régimes, retiennent) ; le filtre de kind
est une ceinture non épinglée. Pas un défaut ; une affirmation de la voisine corrigée.

**Prêt, en attente de la lane :** l'eau de cuisson listée à côté d'un grain absorbant
(4 casseroles réelles sur 13, 1,7 à 3,7 L) comptait deux fois dans les grammes prêts —
densité d'un riz à 0,77 kcal/g au lieu de ~1,3, donc trop de grammes déplacés pour la même
énergie. Correctif dans `weighedReadyGrams` et `preparationReadyGrams`, testé sur fixture.

**Tronc corrigé (« a plate weighs what it feeds », `meal.en.v27`), C03 retiré à 18 h 35 :**
`anchor.anchored 3, clamped 6` (avant : 0 et 12), `unmet_band.gte_200 6` (avant 12),
densification 0 g déplacé (rien de dense à portée). Le plafond ×3 ne mord plus que sur la
moitié des bouche-jours : le prompt était bien la première cause, pas le clamp. Sur le même
plan : `swap.cells_checked 8, carrying 3` — cinq déjeuners/dîners sans le composant carné pour
les trois omnivores (Nora végane), pas flagrant, mais le ratio partiel qu'on ne répare pas
encore est là ; `citation_repaired 0` (rien à réparer, séparation 3/3).

### 13.5 Posé : `f489cb17` — eau de cuisson et tap « Voir »

L'eau listée à côté d'un grain absorbant ne compte plus deux fois dans les grammes prêts
(densité et masse) ; la réponse du tap de clarification porte les lignes écrites, comme la
bulle d'accusé. Fait remonté par la voisine, à instruire : `grams_raw` est nul sur les 78
lignes d'ingrédients d'un plan de foyer (le solo les a toutes) ; les lecteurs stricts du champ
(`preparationReadyGrams`, et ce qui en dérive côté pot) lisent du vide. Le geste juste, si
c'est la cause de `pot_growth.unrewritable`, est de remplir `gramsRaw` au parse de la lane
foyer avec la même fonction que le solo, pas de contourner lecteur par lecteur.

### 13.6 Posé : `a75cfd5a` — regrammer après avoir grossi les casseroles ; et une faute à moi

La voisine a trouvé la cause du `grams_raw` nul côté foyer : pas le parse (les 78 lignes de
plats l'ont), mais la croissance des pots — `scaleIngredients` remet `gramsRaw` à null par
contrat et personne ne regrammait après (13 lignes de casserole sur 16). Un second
`regramMeal` suit maintenant la boucle de croissance, compté (`pot_growth.regrammed`),
ordre épinglé. Effet sur `pot_growth.unrewritable` et `unmet_band` : à mesurer sur C03.

**Faute à moi, dite ici :** `f489cb17` a emporté quatre hunks non commités de la voisine dans
`meal_generation.ts` (le paragraphe « a plate weighs what it feeds » et sa constante) parce que
j'ai fait `git add` du fichier entier — la règle que j'avais écrite le matin même interdit
exactement cela. HEAD a été rouge sur huit pins pendant six minutes, jusqu'à son `0533adfa`,
et mon message de commit ne nomme pas un changement de prompt qu'il contient. Rien à
refaire ; la mémoire est durcie (le `--stat` contre HEAD doit être MES lignes avant tout add).

### 13.7 C03 sur `a75cfd5a` (regram après croissance) — ce que le vide masquait

Un tirage (274 s) : `grams_raw` 0 nul / 33 lignes de casserole (avant 13/16) ;
`pot_growth.unrewritable` 2 (avant 11), `regrammed 5`. Et maintenant que la masse des
casseroles est lisible, **le plafond de pot mord sur les 12 journées-bouche** (`unmet.both
12`, `pot_clamped 11`), le densifieur s'arrête 9 fois sur `pot_exhausted`, et les kcal par
bouche dans les boîtes BAISSENT (Paul 706 → 502, Claire/Léo 586 → 398). Avant, le pot vide
laissait les boîtes grossir au-delà de ce que la casserole contenait : le plan promettait des
grammes que la cuisine ne produisait pas. La correction rend le défaut visible : les
casseroles du modèle sont trop petites pour les cibles. Le levier suivant est la TAILLE DES
CASSEROLES — et la croissance des pots existe déjà (`neededPotFactor`, 3 pots grossis sur 6) :
à instruire pourquoi elle ne suffit pas (elle grossit par rapport aux tirages actuels, pas par
rapport à la masse réelle du pot, qui était nulle jusqu'ici).

### 13.8 Posé : `ec3645e6` — la casserole grossit par rapport à sa masse réelle

Lu sur le JSON de 13.7 : le quinoa faisait ~3 900 g prêts pour 4 506 g tirés par les boîtes
dès le plan du modèle ; `neededPotFactor` grossissait par rapport aux TIRAGES (jamais à la
masse), donc un pot déjà trop petit ne rattrapait pas son écart, et le plafond de récipient
rabotait ensuite les boîtes. La masse regrammée devient la base de la croissance. Tir C03 en
cours (par moi) pour lire `pot_clamped`, `unmet.both`, et les kcal par bouche.

### 13.9 C03 sur `ec3645e6` — tiré par moi (un tirage, 269 s)

**Énergie, le sens prédit :** `unmet.both` 12 → 2, `anchor.clamped` 12 → 5,
`densify.remaining_gte_200` 12 → 5 (640 g déplacés, `pot_exhausted` 9 → 1), grammes par
bouche et par jour +50 % (Paul 702 → 1 043 g, Claire/Léo 1 113 → 1 749, Nora 651 → 810). Les
pots ont grossi sur leur masse (poulet 3 458 g bruts pour 2 094 g tirés). Un tirage, pas un
taux ; mais deux leviers déterministes posés à une heure d'intervalle (regram, masse du pot)
ont déplacé les compteurs exactement dans le sens annoncé.

**Ceinture, un autre plan du modèle :** `refused 5`, `missing 8` (avant 4). Nora (végane) a
des boîtes à son nom citant « saumon » et « dinde » — le terme mord, pas seulement la
casserole — pendant que `prep_tue_tofu` et `prep_thu_tofu`, cuits ces jours-là, ne sont
cités par personne. La réparation de citation ne tire pas quand le terme mord (borne
« un poulet voulu reste un poulet »). Même évidence qu'à C07 : une boîte à un nom lié, un pot
de tofu orphelin du même jour. Extension en cours : terme ET citation réécrits, compté à
part (`item_repaired`), bornée à une boîte dont toutes les bouches portent la ligne.

### 13.10 Posé : `54a1114a` — l'item qui mord est réécrit quand le pot de la bouche attend

Terme ET citation, compté `item_repaired`, mêmes bornes (couvercle entièrement lié, pot
orphelin du jour avec protéine, une seule candidate). Tir C03 de mesure en cours (par moi).

### 13.11 C03 sur `54a1114a` (un tirage, 384 s dont deux relances)

**Énergie : le fixture est couvert.** `unmet.both` 0, `anchor.anchored` 8 / `clamped` 4,
`densify.remaining_gte_200` **0** (843 kcal fermés), `pot_exhausted` 0. Trois leviers
déterministes en deux heures (regram après croissance, croissance sur la masse du pot,
densification qui trouve enfin ses pots) : la journée-bouche sous le besoin de 200 kcal
passe de 12/12 à 0/12 sur ce foyer. Un tirage par étape, pas un taux.

**Ceinture : personne sans repas (`missing 0`)**, mais par deux relances et la fusion de six
cellules (`refused 6`), pas par la réparation (`item_repaired 0`) : ce plan-ci n'avait pas de
pot de tofu orphelin à réadresser (le modèle a cité ses pots de tofu, et mis Nora sur les
mauvais dans six cellules). Coût : 384 s. Le levier suivant côté modèle reste la relance
partielle ; côté moteur il n'y a rien à réparer quand aucun pot n'attend.

## 14. Arbitrages de l'utilisateur (19 h 30) — autorité : `2026-09-05-1930-ARBITRAGES-PRODUIT.md`

Sept décisions, dont trois pour cette lane : « Garder » rebranché sur `retained_items` (la
carte reste), lecteurs rythme/logistique retirés, et — avant tout code sur le grammage ou la
note datée — une **campagne de mesure** de 20 à 30 générations sur des foyers variés. Rien
n'est attendu ce soir ; la campagne se conçoit à trois demain.

## 15. Campagne de mesure (arbitrage 7), 21 h 56 – 22 h 53 — `scratchpad/2026-09-05-2020-CAMPAGNE-MESURE/rapport.md`

Quinze tirs, treize plans lus, verdicts écrits avant les tirs. Tient partout : personne sans
repas aux repas principaux, dégoûts, allergies, variété par style, sessions, courses,
congélation à l'achat, jour même. Casse, par gravité : l'énergie livrée lue ×1,3 à ×6 trop
bas (`uses.servings: 1`, lecture de la voisine) — lot 0 avant le plafond par densité ; la
table 100 % végétarienne sur le foyer de cinq (3/3) ; le plan incomplet accepté (2 jours
sur 6) ; les petits-déjeuners de la bouche liée ; aucune explication IA en solo ; les jours
de cuisine déclarés ignorés. Les lots sont listés dans le rapport de campagne, dans l'ordre.
Seconde moitié (écriture de la mémoire, banc des cinq cas de portée, troisième session) :
5/5 après `316d0dd8`. Reste à décider : une phrase refusée par le plafond de deux questions
par jour tombe sans note ni accusé.

## 16. Arbitrage 2 posé (2026-09-06, 0 h 30)
« Garder » écrit une ligne retenue (« j'aime » / « à éviter »), au sujet de la bouche du
titulaire, par la porte de l'écran « Ce que Sophia sait » ; la carte reste ; les anciennes
notes se disent anciennes ; nomenclature §2.1/§2.6 réécrites. Front seul, aucun redémarrage
du conteneur. La voisine tient les lots 0, 1 et 3 (énergie, plafond par densité, jours de
cuisine) ; les lots par les index (plan incomplet, petits-déjeuners de la bouche liée,
explication solo) attendent ses « posé ».
Posés par la voisine dans la nuit : lot 0 `092b2bba` (l'énergie d'une boîte suit ses grammes
tirés, compteur `pot_attribution`), arbitrage 1 `a9de04dc` (plafond = kcal du repas / densité
mesurée bornée entre 1,0 et 1,35, histogrammes `anchor_cap` / `pot_cap`, mutation « 1,35
fixe » = 7 rouges). Mesure sur quatre et duo en cours ; puis les jours de cuisine déclarés.
Mon arbitrage 2 : `ede40358`.
`e8709708` (moi) : l'explication IA existe aussi pour une personne seule (lane solo :
bloc de schéma sur les trois appels, texte accepté après relance, même garde que le foyer,
trois sorties, compteur même à zéro). `3d00d6e2` (voisine) : les jours de cuisine déclarés
placent les sessions. Tir de preuve solo en cours.
Preuve réelle (M02 solo, 3 j, `e8709708`, 98 s) : « Avec seulement deux sessions d'environ
30 minutes, j'ai choisi deux préparations en boîtes et des petits-déjeuners sans cuisson pour
couvrir les trois jours sans rendre le planning irréaliste. » Une ligne, un vrai choix, aucun
chiffre interdit. Reste un trou (dimanche midi) : le lot « plan incomplet » n'est pas posé.
Voisine : `fa224681` (un frais non résolu se juge contre la boîte entière) ; mesure finale
quatre + duo + solo en cours avec tous les lots de la nuit.
Mesure finale de la nuit (voisine) : solo à 115 % de la borne basse avec explication IA ;
duo 3/12 journées-bouche sous le besoin (hier 10/10) ; quatre 52 % de table couverte, Nora
séparée 14/16. Leviers suivants : `pot_ceiling` (croissance avant dimensionnement), le plan
incomplet (solo 3 jours pleins sur 7). Fin de nuit à 02 h 30.

## 17. Sur ordre « continue avec pot_ceiling et le plan incomplet » (2026-09-06, 03 h)
`81812ad9` : la casserole grossit avec une marge de 5 % et une seconde passe sur la masse
regrammée ; `pot_growth.passes` / `short_after`. `31ad30ca` : une case sans plat est un
manque `no_dish` par bouche (relancé, refusé en compose, dit dans la rationale) ; le solo
relance ses cases vides (`empty_slots_retry`) et fusionne par cellule (`mergeRetryCells`,
sorti de l'invariant). Tirs de mesure : quatre (M05) puis solo (M01).
Tir M05 r2 sur les deux lots : `pot_growth {scaled 11, capped 4, passes 2, short_after 3}`,
`unmet.pot_ceiling 7` — le plafond par ingrédient (500 g × parts ÉCRITES par le modèle)
bornait la croissance ; et `missing 9` tous `no_dish` : les moments passés du jour entamé
(plan fait à 13 h) comptaient comme des repas manquants, trois relances pour rien (344 s).
`875e18e7` corrige les deux (parts = max(écrites, tirages) ; moments passés hors des
cellules). Solo M01 r3 : aucune case vide cette fois (relance non exercée), explication
vide (`declared 0` : rien à trancher). Tir M05 r3 en cours.
M05 r3 sur `875e18e7` : `unmet.pot_ceiling` 7 → 1, `pot_growth {capped 2, passes 2,
short_after 2}`, `capped_by_pot` 1, personne sans repas (`no_dish 0`), régime réparé par deux
relances et douze cellules fusionnées. Premier verdict WARN sans FAIL sur le foyer de quatre.
`e112c1e0` : v30 — la ligne la plus stricte gouverne la base de CHAQUE repas, petits-déjeuners
et goûters compris ; la relance d'une case sans boîte demande un plat à elle ou des boîtes.
Voisine : `ea641803` (cause `tub_estimate` dans `unmetDemand`, alias 20260906030000),
`e9000a60` (bacs relus après dimensionnement → `tubServed`). Restent : table 100 %
végétarienne sur cinq bouches, note datée +25 % (arbitrage 3), α+β (4), lecteurs morts (6),
`pot_growth` dans la réponse draft. Mesure M06 (petits-déjeuners) à suivre après le tir de
la voisine.
Quatre C03 sur `e112c1e0` (voisine) : toutes les journées-bouche enfin comptées (`tub_estimate`
11, `not_anchored` 0), `unmet_band gte_200` 17/24, `pot_ceiling` 10/24 — le plafond de pot
domine maintenant sur les bacs à deux bouches (429–660 kcal par bouche et par repas) ; v30 a
porté (les bacs portent féculent + protéine). Résidu à instruire : `short_after 2` malgré
deux passes — les besoins ×3 à ×5 sur des bacs minuscules butent sur le plafond par
ingrédient (500 g × parts) ; le levier est en amont (bacs écrits trop petits) ou dans un
plafond par ingrédient indexé sur la masse prête voulue plutôt que sur les parts.
`c3561425` : arbitrage 6 — `rhythmOverlayFor` / `logisticsOverlayFor` retirés des deux lanes,
du module et de leurs tests (0/0 en campagne) ; le test de câblage épingle leur absence.
Voisine : `2b5e4f83` (« orge perlé » résolu). Tir M06 (petits-déjeuners sous v30) en cours ;
la troisième session enchaîne ensuite une série de dix brouillons sur le quatre (chaîne
post-modèle d'un retour).
M06 r2 sur v30 (`e112c1e0`+) : **personne sans repas** (hier 10 petits-déjeuners et goûters
manquants pour la végane), une relance, trois cellules fusionnées, régime réparé — verdict
WARN sans FAIL. ⚠ Le tir a chevauché un brouillon de la troisième session sur la même
fixture (nos messages se sont croisés) : un tirage, à confirmer. Reste en tête de liste : la
table 100 % végétarienne sur cinq bouches (relance du flagrant muette : à instrumenter).

## 18. Rapport « retours et calories » de la troisième session (14 brouillons sur le quatre) — `scratchpad/2026-09-06-1400-RETOURS-ET-CALORIES/RAPPORT.md`
Trois défauts structurels, tous reproduits : (1) une exclusion de TABLE n'est tenue par rien
de déterministe (4/4 tirs, saumon et poulet servis à tous, le plan l'écrit dans `issues` et
rend 200) ; (2) le repli « personne sans repas » (`restoreHeldOff`) remet la bouche sur la
boîte partagée sans regarder ce qu'elle porte — Nora végane remise sur du chili de dinde
(FB8) ; (3) une bouche qui obéit à son dégoût perd des calories en silence (cible recalculée
sur les moments restants). Méthode : la variance du modèle seul vaut ~30 points d'énergie
entre trois témoins identiques ; un plan dégénéré (76 cellules vides sur 110) est passé en 200
avant `31ad30ca`. Répartition : 0f corrige (1) et (2) et la morsure qui recalcule la journée
(fenêtre annoncée, worktree) ; 74 pose le compteur `lostSlotEnergy` pour (3) ; moi :
`c77842b4` (la relance du flagrant journalise son motif de rejet), puis un tir cinq (M07)
après leurs « posé » pour lire ce motif.
Troisième session, correctifs des trois défauts (posés 15 h 15, mesurés sur 4 brouillons) :
exclusion de table ⇒ 0 item exclu servi (avant 12–20) ; végane sans tofu ⇒ 11 boîtes sans
produit animal, 0 repli, 51 % de sa cible (avant 31 %) ; « Paul sans poulet » ⇒ 0 boîte au
poulet, 0 repli. Restent dans ma lane : le modèle qui compose 7 repas principaux sur 13 avec
les protéines exclues (FC4 : relances sans effet, 21 cases manquantes dites, refus en compose
— contrat voulu) et la variance de la lane régime (FC2 : Nora retirée de 13 boîtes, 3
relances sans effet). Tir M07 (cinq, keen) en cours pour lire `swap.retry_rejected_by`.
M07 r2 (cinq, keen, 320 s) : toujours 100 % végétarien (0/13), **et le motif de rejet de la
relance est lu** : `rejected_by: "missing"` — la relance rendait 11 cellules sur 13 avec le
composant carné, mais 17 repas manquants (`missing 0 → 17`), donc refusée en bloc. La
relance du flagrant tourne APRÈS la boucle « personne sans repas » : ce qu'elle casse n'est
jamais réparé. Correctif : la passer AVANT la boucle, accepter sur le composant, laisser la
boucle réparer les manques, et REVENIR au plan d'avant si la boucle n'y arrive pas.
