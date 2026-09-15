# FF-062 · Quand Sophia parle la première

| | |
|---|---|
| **Identifiant** | `FF-062-quand-sophia-parle-la-premiere` |
| **Statut** | 🟢 C1 et C2 livrés (2026-09-02) · C6 autonome · le reste en place |
| **Date** | 2026-09-01 |
| **Autorité produit** | Décisions humaines du 2026-09-01 (§3) · [conversation/README.md](README.md) (T1–T9, **T3 et T4 amendés par cette fiche**) · [FF-061](../suivi-quotidien/FF-061-le-bilan-du-jour.md) (le bilan du soir) |
| **Dépend de** | `keel-daily-pulse-v1` · `keel-reengage-v1` · `keel-weekly-flow-v1` · `_shared/keel/weight_divergence_engine.ts` · `_shared/keel/household_presence.ts` (`work_lunch`, l'état `outside`) · `_shared/chat/delivery_policy.ts` |
| **Effort estimé** | 5 jours — dont 1 de retrait, 2 pour le créneau déclaré, 1 pour la pesée, 1 pour sortir la divergence |

---

> ## ✅ CE QUI EST LIVRÉ, ET OÙ
>
> | | Canal | État | Code |
> |---|---|---|---|
> | **C1** | le repas d'un créneau `eating_out` | **livré** 2026-09-02 | `_shared/keel/slot_meal_ask.ts` (pur) · `slot_meal_io.ts` · le tap dans `deterministic_buttons.ts` · `api/slotMeal.ts` + le créneau forcé affiché dans `ChatPage` |
> | **C2** | le rappel de pesée | **livré** 2026-09-02 | `_shared/keel/weigh_in.ts` (pur) · `weigh_in_io.ts` · `components/WeighInDialog.tsx` · source `weigh_in` (migration `20260902090000`) |
> | **C3** | le bilan du jour | **livré** 2026-09-02 | `keel-daily-pulse-v1` + la chaîne `day_review.ts` — voir [FF-061](../suivi-quotidien/FF-061-le-bilan-du-jour.md) |
> | **C4** | le point de la semaine | existant | `keel-weekly-flow-v1` |
> | **C5** | la relance | existant | `keel-reengage-v1` |
> | **C6** | la divergence | **autonome** 2026-09-01 | `keel-weight-divergence-v1` |
>
> **L'émetteur de C1 et C2 est UN job**, `keel-proactive-v1`, cron `:30`
> (migration `20260902100000`). C'est la leçon de §1 appliquée à ce lot: deux
> crons se coordonnent par une convention écrite dans le commentaire d'un seul
> des deux. Les deux fenêtres vivent maintenant dans le même fichier.
>
> **R16 est exécuté** : `keel_slot_meal` et `keel_weigh_in` sont entrés dans
> `GUARANTEED_PURPOSES`, et le plafond des non sollicités reste à deux. R1 en
> devient **structurel** — les trois canaux garantis consomment chacun un
> créneau, donc le plafond tombe à zéro et la relance du jour est refusée
> derrière eux. Aucun compteur neuf n'a été écrit.
>
> ⚠️ **Ce que R3 coûte, et il faudra le regarder** : C1 part à chaque
> occurrence. Un créneau déjà demandé le même jour ne se redemande pas
> (idempotence par `(date, créneau)`), mais cinq déjeuners dehors font bien cinq
> questions. §10 est la contre-mesure, et elle n'est pas instrumentée: le taux
> de `skip` se lit aujourd'hui dans les journaux, pas dans un tableau.
>
> **Le retour de fin de plan est déplacé** (2026-09-02): il part à 22h locales,
> le dernier jour de la fenêtre, depuis `keel-proactive-v1`
> (`runPlanFeedbackStep`), sous son propre purpose `keel_plan_feedback` — au
> lieu de PRENDRE LA PLACE du message du soir le lendemain de la clôture.
>
> **R11 est livré** (2026-09-02) : l'accusé d'une photo qui porte un chiffre
> porte aussi un bouton « Modifier », qui ouvre un dialogue à un champ
> (`KEEL_KCAL_<eventId>`, neuvième vocabulaire). La correction fait basculer la
> base `photo_estimate` → `declared_quantities` et remonte la bande à `high`.
> Code : `_shared/keel/energy_correction.ts` (pur) + `energy_correction_io.ts` +
> `components/EnergyFixDialog.tsx`.
>
> ⛔ **Ce que R11 ne peut PAS créer** : un chiffre là où il n'y en avait pas.
> Une ligne sans `energy_estimate` est une ligne dont les quatre gardes étaient
> FERMÉES à l'ingestion (plancher TCA, mineur, coach qui ne compte pas,
> affichage éteint) ; y écrire par ce chemin les contournerait, avec un jeton
> que le client a forgé. Absence de chiffre ⇒ refus, et l'écriture ne part pas.
>
> ⚠️ 🔴 **UNE PHRASE DE R11 EST FAUSSE, ET LE CODE NE LA REPREND PAS.** R11 dit
> *« la mesure gagne 24 points de fiabilité »*. Les 24 points sont l'écart entre
> `photo_estimate` (−26,6 % de biais) et `declared_quantities` (2,3 % de MAPE) —
> mais ces 2,3 % ont été mesurés sur des **grammes recalculés par une table**,
> pas sur quelqu'un qui tape un nombre de calories pour un plat de restaurant.
> Personne n'a mesuré ce geste-là. Ce que la correction établit avec certitude
> est plus modeste et suffit : **le chiffre ne vient plus d'une photo**, donc le
> biais de −26,6 % disparaît. Aucun chiffre de fiabilité n'est écrit nulle part
> dans le code, et la phrase rendue a été corrigée en conséquence : la base
> `declared_quantities` se dit maintenant « le chiffre que tu m'as donné », plus
> « d'après les quantités que tu m'as données » — la personne n'en donne aucune.

## 1. Le problème

Sophia écrit de sa propre initiative depuis **huit** endroits différents, écrits
à huit moments différents, et **aucun document ne les liste**. Personne ne peut
répondre à la question : *« qu'est-ce qu'un élève peut recevoir le même jour ? »*

La conséquence n'est pas théorique. Deux canaux se coordonnent par une
**convention entre deux crons** — la fenêtre 19h-20h contre 20h-22h — et cette
convention n'est écrite que dans le commentaire de l'un des deux. Un troisième
canal ajouté sans la connaître produit deux notifications le même soir, et
personne ne le verrait avant de le mesurer.

Dans le même temps, deux besoins réels n'ont **aucun** canal :

- **la pesée.** L'enveloppe énergétique d'un objectif de perte ou de maintien se
  recalcule sur le poids, et le poids ne se demande **qu'une fois par semaine**,
  le dimanche. Six jours sur sept, le produit pilote sur une valeur périmée ;
- **le créneau déclaré mais non composé.** Quelqu'un qui dit manger le midi et
  dont le plan ne compose rien ce midi-là mange quand même. Ce repas n'existe
  nulle part.

**Ce que ça coûte.** Un canal de trop fatigue et se fait couper — et il emporte
avec lui les canaux utiles, parce que c'est *l'app* qu'on mute, pas un message.
Un canal manquant laisse un trou dans la seule mesure qui pilote le plan. Les
deux erreurs se paient au même endroit : la porte se ferme.

## 2. Job stories

> **Quand** je veux perdre du poids, **je veux** qu'on me redemande mon poids
> tous les deux jours sans que j'aie à y penser, **pour que** mon plan soit
> calculé sur ce que je pèse aujourd'hui et pas la semaine dernière.

> **Quand** je mange dehors tous les midis, **je veux** qu'on me demande ce que
> j'ai pris, **pour que** ma journée soit vraie plutôt que trouée cinq fois par
> semaine.

> **Quand** j'ouvre l'app après une journée normale, **je veux** ne pas trouver
> quatre notifications, **pour que** je continue de les lire.

## 3. Périmètre

### ⚠️ LA RÈGLE QUI GOUVERNE LES SIX : LE DERNIER MESSAGE TUE LE PRÉCÉDENT

**Décision du 2026-09-01.** Quand un message proactif part et que le précédent
n'a **pas** obtenu sa réponse, le nouveau **remplace** l'ancien : les boutons de
l'ancien cessent d'être honorés.

Le motif, dans les mots de la décision : *« ça laisse pas les gens se dire j'ai
le temps »*. Le produit ne saura pas traiter quelqu'un qui déclare mercredi
qu'il n'a pas fait les courses de lundi — la réparation n'existe plus à ce
moment-là ([FF-061](../suivi-quotidien/FF-061-le-bilan-du-jour.md) R11 : sur du
passé, on constate). Une question qui reste tapable trois jours promet donc une
réparation qui n'arrivera pas.

**Ce que « remplace » veut dire exactement**, parce que trois lectures étaient
possibles :

| | |
|---|---|
| La bulle **reste visible** | on ne réécrit pas une conversation. La personne l'a peut-être lue et pas répondu ; l'effacer lui retirerait ce qu'elle a vu |
| Ses **boutons sont désarmés** | un tap dessus rend une phrase qui le dit — jamais un silence, jamais un accusé qui prétend |
| Ce qui était **déjà écrit reste écrit** | un bilan dont ① a été répondu garde son fait de courses. Seules les étapes non répondues meurent |
| Les **transactionnels** sont hors règle | une fin d'accès ne remplace rien et ne se fait pas remplacer |

**« Répondu » = un tap dont l'effet a été écrit.** Pas « la personne a écrit
quelque chose après » : un « ok merci » n'est pas une réponse à une question de
courses, et le traiter comme telle laisserait le fait manquant en croyant
l'avoir.

#### Ce que le désarmement ferme, et ce qu'il ne ferme pas

Il porte sur **le message**. Reste alors la question de l'écran, et la réponse
suit ce que chaque fait SERT — pas une préférence :

| Fait | Ce qu'il sert | Rattrapable ? |
|---|---|---|
| **courses, cuisson** | **réparer** le plan | **non.** Sur du passé la réparation n'existe plus ([FF-061](../suivi-quotidien/FF-061-le-bilan-du-jour.md) R11) : une porte ouverte promettrait quelque chose qui n'arrivera pas |
| **repas** | **mesurer** | **oui**, sur `/app/plan` et `/app/today`, où le rattrapage existe déjà. Rapporté deux jours après, un repas reste exact et le coach le lit |

**Conséquence directe** : le bouton de bilan dans le chat, qu'on avait cadré,
**sort du périmètre**. Il ne garderait que les repas, et l'écran les couvre
déjà.

### Les six canaux gardés

| # | Canal | Quand | Cadence |
|---|---|---|---|
| **C1** | **Le repas d'un créneau déclaré non composé** | à l'heure où le créneau est écoulé — **10h** petit-déj, **14h** déjeuner, **21h** dîner (l'heure déclarée de la personne l'emporte) | **à chaque occurrence** (voir §6 R3) |
| **C2** | **Le rappel de pesée** | dans la journée | **perte de poids : tous les 2 jours** · **maintien : tous les 2 jours** · **prise de masse : tous les 5 jours** |
| **C3** | **Le bilan du jour** ([FF-061](../suivi-quotidien/FF-061-le-bilan-du-jour.md)) | 20h-22h locales | quotidien, s'il y a quelque chose à demander |
| **C4** | **Le point de la semaine** | dimanche 18h-21h | hebdomadaire |
| **C5** | **La relance après silence** | 72h sans un mot | **une seule par épisode** |
| **C6** | **La divergence de poids constatée** | quand elle est constatée | **un cycle de plan ET 42 jours au minimum** — doublé à 84 après un refus |

Plus deux canaux **transactionnels**, qui ne sont pas de la relation : fin
d'accès et facturation (`account_lifecycle`, `stripe-webhook`). Ils répondent à
un fait contractuel, pas à un état de l'élève, et ils ne sont pas plafonnés.

### Le retour de fin de plan — corrigé

⚠️ **Il n'est PAS quotidien.** Il part **à 22h30, le dernier jour de la fenêtre
du plan** — une seule fois, à la fermeture. Le lot livré le 2026-09-01 l'a
accroché au message du soir (20h-22h, en remplacement de la bande) ; c'est à
corriger.

22h30 et pas minuit : « quand la fenêtre s'achève » est une borne de calendrier,
pas une heure où l'on pose une question. 22h30 est **après** le bilan du jour
(20h-22h), donc le dernier soir porte les deux — et c'est voulu : le bilan
ferme la journée, le retour ferme la semaine.

### Ce qui est SUPPRIMÉ

- ❌ **La recommandation quotidienne (FF-028).** *Décision du 2026-09-01 :
  il n'y a pas de recommandation en plein milieu de plan.* Le retour de fin de
  plan est fait pour ça — il corrige le plan **suivant**, ce qui est le seul
  moment où une correction ne demande à personne de comprendre un changement en
  cours de route.
  **⚠️ Ce retrait emporte un passager** : `keel-daily-recommendation-v1` porte
  aussi `runWeightDivergenceStep`. C6 doit être sorti **avant** le retrait, pas
  après.

### Hors périmètre — engageant

- ❌ **Le message de cohorte du coach.** Le coach est mis de côté (2026-09-01).
  Le canal reste dans le code, il ne fait pas partie de cet inventaire.
- ❌ **La notification de PDF prêt.** Elle répond à une demande de l'élève : ce
  n'est pas Sophia qui vient vers lui.
- ❌ **Toute relance d'un canal ignoré.** Un message sans réponse ne se répète
  jamais. C'est la règle qui rend les six acceptables.
- ❌ **Un canal sans plafond.** C1 excepté, et son exception est écrite en R3.

## 4. Le circuit

La journée d'un élève en perte de poids qui déjeune dehors, un jour où sa
pesée est due — **le pire cas de charge, et il fait trois messages** :

```
   14h01    C1  « Qu'est-ce que tu as mangé ce midi ? »
               [ Photo ]  [ Décrire ]  [ Passer ]
                  │           │
                  │           └──▶ plancher de déclaration ▸ protocol_events (off_plan)
                  │
                  └──▶ analyse ▸ ce qui est vu + une ESTIMATION d'énergie
                       ┌──────────────────────────────────────────┐
                       │  ~620 kcal  (estimé d'après la photo)    │
                       │  [ modifier ]                            │
                       └──────────────────────────────────────────┘
                            corriger ⇒ le chiffre change de BASE:
                            photo_estimate → declared_quantities

   ~17h     C2  « Ça fait deux jours — on en est où ? »   (5 jours en prise de masse)
               [ 78,4 kg ]  ← l'ancien poids en placeholder, jamais pré-rempli
                            ▸ student_body_measures

   20h-22h  C3  Le bilan du jour  (FF-061)
               ① courses  ② cuisson  ③ repas
```

Les autres jours en portent **un** (C3), ou **zéro** s'il n'y a rien à demander.

## 5. Modèle de données

**Aucune table neuve.** Chaque canal écrit là où son fait vit déjà.

| Canal | Écrit | Lit pour décider |
|---|---|---|
| C1 | `protocol_events` (`plan_relation = off_plan`, `slot_key` **forcé** au créneau visé) | `eating_rhythm` ∩ (créneaux non composés) ∩ objectif |
| C2 | `student_body_measures` (une ligne par pesée, FF-031) | la dernière pesée + l'objectif |
| C3 | les trois tables de FF-061 | le plan et ses états |
| C6 | rien de neuf | la série de poids |

**Le compteur d'envoi n'existe pas et il en faut un.** Aujourd'hui chaque canal
tient sa propre garde (`wasPulseSentToday`, `hasAskedWeek`, l'épisode de
relance). Six gardes séparées ne peuvent pas répondre à « combien de messages
cette personne a-t-elle reçus aujourd'hui ». `chat_messages` porte déjà
`purpose` : le compte se **dérive** de là, il ne se stocke pas.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | **Trois messages par jour au grand maximum**, et seulement pour l'élève qui a un objectif ET un créneau déclaré non composé ET une pesée due | c'est le plafond que cette fiche pose à la place de T4. Il est haut, il est assumé, et c'est LE chiffre à surveiller (§10) |
| **R2** | **Un canal ignoré ne se répète jamais** | c'est ce qui rend six canaux tenables. Deux messages dans un silence, et l'élève apprend que se taire déclenche un ping — la mesure de `reengagement.ts` |
| **R3** | **C1 part à CHAQUE occurrence du créneau**, sans plafond quotidien ni hebdomadaire | ⚠️ **décision explicite du 2026-09-01, contre l'avis rédigé.** Quelqu'un qui déjeune dehors cinq jours par semaine reçoit cinq questions. L'argument retenu : un objectif de poids sans le déjeuner est un objectif piloté sur les deux tiers de la journée. L'argument écarté : c'est la forme du formulaire quotidien que ce produit a retiré. **La contre-mesure de §10 existe pour trancher ce désaccord par la donnée** |
| **R4** | C1 ne part **que** si l'objectif est `fat_loss` ou `muscle_gain` | sur `maintenance`, le trou ne change aucun chiffre qui pilote quoi que ce soit. T1 : on ne collecte que ce qu'un aval consomme |
| **R5** | C1 se déclenche sur **`away_days[].kind === 'eating_out'`**, jamais sur `work_lunch` ni sur « rythme ∖ plan » | ⚠️ *corrigé après vérification du code.* Le produit porte déjà **trois** états de présence, et le deuxième dit exactement ce que C1 cherche : `at_table` (le plan compose), **`eating_out`** (« le plan ne compose pas, MAIS il a le droit de dire un nombre »), `away` (« le plan ne compose pas et ne dit rien »). Le rythme seul ne distingue pas « je mange ailleurs » de « je ne mange pas » — il ferait partir C1 pendant des vacances. Et lire `work_lunch` raterait l'autre moitié des cas : c'est un pré-remplissage des cinq midis, pas la source. L'élève choisit l'état dans `MealPickerGrid`; une entrée sans `kind` vaut `away`, la direction sûre |
| **R6** | Le `slot_key` de C1 est **forcé** au créneau visé | l'inférence de créneau (FF-018 §11) range au dernier créneau écoulé. Sur une question qui NOMME le midi, elle tomberait juste par accident — c'est-à-dire faux le jour où l'heure change |
| **R7** | C2 ne part que si l'objectif est `fat_loss`, `muscle_gain` ou `maintenance`, et **jamais** sous plancher de restriction | T7. Redemander son poids tous les deux jours à quelqu'un sous plancher TCA est exactement le comportement que le plancher existe pour empêcher |
| **R8** | Le champ de C2 porte l'ancien poids **en placeholder**, jamais pré-rempli | un champ pré-rempli se valide sans être lu : on enregistrerait la valeur de la semaine dernière comme une pesée d'aujourd'hui, et la série mentirait sans qu'aucune erreur ne soit levée |
| **R9** | C6 est un **module autonome**, plus un passager de la recommandation | il a sa propre cadence et sa propre condition (la divergence est constatée). Le brancher sur un canal quotidien lui fait hériter d'une fenêtre et d'un plafond qui ne sont pas les siens. ⚠️ **Le chiffre réel est 42 jours, pas 30** : `DIVERGENCE_COOLDOWN_MIN_DAYS` vaut six semaines, et son commentaire dit pourquoi — *« six et pas quatre, parce que quatre EST le mensuel que la fiche nomme comme le mode de défaillance »*. « Une fois par mois maximum » est donc satisfait **et dépassé** ; c'est le code qui fait foi ici, pas cette ligne |
| **R10** | **Un chiffre d'énergie porte sa base, ou il n'existe pas** | `CALORIE_REVERSAL.md`. Une estimation de photo porte −26,6 % de biais **dans le sens flatteur** ; une quantité déclarée, 2,3 %. Les afficher pareil, c'est mentir sur la fiabilité |
| **R11** | **Corriger le chiffre le fait changer de base** | c'est ce qui rend l'option « modifier » utile plutôt que cosmétique : une correction humaine transforme une estimation en déclaration, et la mesure gagne 24 points de fiabilité |
| **R12** | Les canaux transactionnels ne comptent pas dans R1 | on ne fait pas taire une fin d'accès parce que le bilan du soir est parti |
| **R16** | **Les canaux adossés à un fait du plan entrent dans `GUARANTEED_PURPOSES` ; le plafond des non-sollicités reste à deux** | *tranché le 2026-09-01.* `DAILY_UNSOLICITED_CAP = 2` contredisait le pire cas de R1 (trois messages) : le troisième aurait été refusé par la politique de livraison, et le canal aurait eu l'air de marcher — un refus se compte comme une décision produit, pas comme une panne. Monter le plafond aurait relâché la garde pour TOUS les non-sollicités, relances comprises ; on fait donc grandir la liste des garantis, qui **réservent** leur créneau au lieu de s'y ajouter. ⚠️ **Ce que ça coûte** : un jour à trois canaux garantis ne laisse plus de créneau à une relance. C'est le bon sens de l'échange — qui reçoit déjà trois messages n'a pas besoin d'être relancé — mais c'est un arbitrage. Les purposes de C1 et C2 s'ajoutent **avec** leur canal, jamais avant |
| **R13** | **Un message proactif non répondu est désarmé dès qu'un autre part** (§3) | une question qui reste tapable trois jours promet une réparation que le produit ne peut plus faire. Et elle enseigne « j'ai le temps », qui est l'inverse de ce que la boucle demande |
| **R14** | Un tap sur un message désarmé **rend une phrase**, jamais un silence | un bouton mort et muet se lit comme une panne. R15 de FF-057 : un refus n'est jamais un silence |
| **R15** | Le désarmement ne touche que **les étapes non répondues** | ce qui a été écrit est un fait, et un fait ne s'annule pas parce que la conversation a avancé |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Deux canaux tombent la même minute | **le plus contraint gagne** et l'autre se retire, comme la reco et le tap le font aujourd'hui. Le retrait est **compté**, jamais silencieux |
| L'objectif n'est pas lisible | **aucun C1, aucun C2.** Fail-closed : on ne demande pas ce qu'on ne saura pas exploiter |
| La photo de C1 n'est pas analysable | le fait est **quand même écrit** (une photo enregistrée sans verdict bat une photo perdue), et l'accusé le dit sans prétendre |
| Le poids saisi est hors bornes | refusé avec son motif, la ligne n'est pas écrite. Les bornes existent déjà (`weight_bounds.ts`) |
| L'élève a coupé ses relances | **aucun des six.** `proactive_muted_at` est le seul interrupteur, et il vaut pour tous |
| L'élève tape sur un message désarmé | « Ce message n'est plus d'actualité » + rien d'écrit. **Compté** : un taux élevé dit que la fenêtre est trop courte, et c'est la seule façon de le savoir |
| Deux messages partent dans la même minute | le second désarme le premier **avant** d'être livré. Sinon l'élève voit deux questions vivantes et le produit n'en honore qu'une |
| C6 est sorti de la reco mais son cron n'est pas posé | la divergence **cesse silencieusement**. C'est le mode d'échec le plus probable de ce lot : le retrait est facile, la repose ne l'est pas |

## 8. Critères d'acceptation

```gherkin
Étant donné un élève en perte de poids qui déclare déjeuner
  Et un plan qui ne compose rien à midi lundi
Quand le créneau du midi est écoulé lundi
Alors il reçoit UN message avec trois options
  Et le fait écrit porte slot_key = "lunch"
  Et plan_relation = "off_plan"
```

```gherkin
Étant donné un élève en maintien de poids dans la même situation
Quand le créneau du midi est écoulé
Alors il ne reçoit RIEN
```

```gherkin
Étant donné un élève dont la dernière pesée date de deux jours
Quand le rappel de pesée part
Alors le champ affiche son dernier poids en PLACEHOLDER
  Et le champ est VIDE
  Et valider sans saisir n'écrit aucune ligne
```

```gherkin
Étant donné un élève sous plancher de restriction alimentaire
Quand sa pesée est due depuis quatre jours
Alors aucun rappel ne part
```

```gherkin
Étant donné une photo de C1 dont l'énergie est estimée
Quand l'élève corrige le chiffre
Alors la base passe de "photo_estimate" à "declared_quantities"
  Et le chiffre affiché est celui qu'il a saisi
```

```gherkin
Étant donné un élève qui ignore le message du midi
Quand le lendemain arrive
Alors aucune relance de CE message ne part
  Et le message du midi du lendemain part normalement
```

```gherkin
Étant donné un message du midi resté sans réponse
Quand le bilan du soir part le même jour
Alors les boutons du message du midi ne sont plus honorés
  Et un tap dessus rend « ce message n'est plus d'actualité »
  Et aucune ligne n'est écrite
```

```gherkin
Étant donné un bilan du soir dont l'étape des courses a été répondue
  Et dont les étapes cuisson et repas ne l'ont pas été
Quand le bilan du lendemain part
Alors le fait des courses d'hier est TOUJOURS en base
  Et les boutons des étapes cuisson et repas d'hier sont désarmés
```

```gherkin
Étant donné un message de fin d'accès non lu
Quand le bilan du soir part
Alors le message de fin d'accès n'est pas désarmé
```

## 9. Rabbit holes

- **Retirer la recommandation avant d'avoir sorti la divergence.** Elle en est
  le passager (`runWeightDivergenceStep`). Le retrait est une suppression de
  fichier ; la repose demande un cron, une fenêtre, un plafond mensuel et un
  compte-rendu. Fait dans le mauvais ordre, la divergence disparaît sans qu'un
  seul test ne tombe.
- **Le chiffre affiché sans sa base.** `CALORIE_REVERSAL.md` le dit en une
  phrase : *« un chiffre affiché sans son marqueur est la seule façon de rater
  ce chantier en ayant écrit tout le reste correctement »*. Et **rien de ce
  chantier n'est fait** à part la garde TCA — les six étapes sont écrites, dans
  un ordre déclaré non négociable.
- **Le placeholder qui devient une valeur.** Un champ de poids pré-rempli est
  la façon la plus simple de fabriquer une série de mesures fausses : la
  personne valide sans lire, et la courbe devient plate au lieu d'être vide.
  Une courbe plate se lit comme une stagnation ; une courbe vide se lit comme
  une absence de mesure. Ce ne sont pas les mêmes conseils.
- **Six gardes séparées.** Chaque canal tient déjà la sienne. Tant qu'aucune ne
  connaît les autres, R1 est une intention et pas une garantie — et le septième
  canal, quel qu'il soit, la cassera sans le savoir.
- **C1 sur le petit-déjeuner.** Le rythme peut déclarer un petit-déjeuner que le
  plan ne compose pas. La question part alors à 10h30. Personne n'a demandé ça,
  et rien dans R3 ne l'empêche.

## 10. Ce qu'on mesure

**La mesure de charge** — la seule qui dit si cette fiche est allée trop loin :
la distribution du nombre de messages proactifs reçus par élève et par jour.
`{0: 40, 1: 210, 2: 55, 3: 12}` se lit ; un total mensuel ne dit rien.

**La mesure de valeur** : la part des créneaux déclarés non composés qui
finissent avec un fait, et la fraîcheur médiane de la dernière pesée pour les
élèves à objectif. Aujourd'hui : ~0 % pour le premier, ~3,5 jours pour le second
(un point du dimanche, une fois par semaine).

**⚠️ Les deux contre-mesures.** Elles portent sur R3, qui est la décision la
plus discutée de cette fiche :

1. **Le taux de `proactive_muted_at`.** Si les coupures de relance montent après
   la mise en service de C1, le produit est en train de perdre *tous* ses
   canaux pour en avoir ajouté un. C'est l'échec le plus cher, parce qu'il est
   irréversible côté élève.
2. **Le taux de « Passer » sur C1.** Au-delà de 70 % sur deux semaines, la
   question ne collecte plus rien et ne fait que coûter — elle doit alors passer
   à une cadence hebdomadaire, ou rejoindre le bilan du soir comme une ligne.

## 11. Questions ouvertes

**Tranchées le 2026-09-01** (gardées ici pour que la décision se relise) :
l'heure de C1 est celle du créneau écoulé, petit-déjeuner **compris** (10h) ;
C2 passe à 5 jours en prise de masse et reste à 2 en perte et en maintien ; le
retour de fin de plan part à **22h30 le dernier jour**.

Restent ouvertes :

- **La fenêtre de désarmement quand aucun autre message ne part.** R13 dit
  « dès qu'un autre part ». Un élève sans objectif ne reçoit que le bilan du
  soir : son message d'hier reste-t-il tapable 24h, ou expire-t-il à minuit ?
- **C2 et la balance connectée.** Un rappel tous les deux jours à quelqu'un qui
  se pèse tous les matins est une question dont on connaît déjà la réponse.
