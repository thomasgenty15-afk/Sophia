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
