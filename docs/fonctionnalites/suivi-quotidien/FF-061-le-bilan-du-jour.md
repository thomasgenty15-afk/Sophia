# FF-061 · Le bilan du jour

| | |
|---|---|
| **Identifiant** | `FF-061-le-bilan-du-jour` |
| **Statut** | 🟢 Les trois étapes livrées (2026-09-02) |
| **Date** | 2026-09-01 |
| **Autorité produit** | [conversation/README.md](../conversation/README.md) (T1–T9) · [FF-058](FF-058-la-bande-du-soir.md) (le véhicule, qu'elle étend) · [FF-057](../composition-des-repas/FF-057-la-procedure-accident.md) (la réparation, qu'elle déclenche) |
| **Dépend de** | `_shared/keel/evening_strip*.ts` · `_shared/keel/accident*.ts` · `_shared/keel/grocery_waves.ts` (`servesCookOn`) · `keel-daily-pulse-v1` (le cron du soir) · `meal_tick.ts` |
| **Effort estimé** | 3 jours (dont 1 pour la cascade de courses, qui n'existe pas) |

---

> ## ✅ CE QUI EST LIVRÉ, ET OÙ (2026-09-02)
>
> | | Étape | État | Code |
> |---|---|---|---|
> | **①** | les courses | **livrée** | `evening_strip.ts::buildShoppingStep` — elle sort de la bande et devient un tour à elle |
> | **②** | la cuisson | **livrée** | 🔴 elle n'avait **aucun émetteur**: `buildSessionQuestion` existait depuis FF-057, mais seule une décoche pouvait l'atteindre. Le message du soir la pose enfin |
> | **③** | les repas | existante | `evening_strip.ts::buildEveningStrip`, inchangée — sauf que la ligne de courses n'y voyage plus |
> | la chaîne | | **livrée** | `day_review.ts` (pur) + `day_review_io.ts` (relit l'état APRÈS l'écriture) |
> | l'extinction | | **livrée au lot 3** | `loadSkippedDishIndexes` lit désormais les cascades de VAGUE aussi |
>
> **Ce que la chaîne change pour la personne**, et c'est un vrai changement:
> le soir d'une vague de courses, le message ne nomme plus les plats — il pose
> ①, et ② puis ③ arrivent en réponse au tap. Le motif est mécanique et vaut
> d'être relu: **① éteint ③**. Nommer les plats dans la même bulle que la
> question des courses, c'est armer les boutons de repas qu'un « pas encore »
> est en train de rendre impossibles.
>
> **Ce que ça coûte** : un tap de plus les soirs de courses et les soirs de
> cuisson (un à deux par semaine sur un plan de sept jours). C'est le prix de ne
> pas montrer un plan faux, et il est assumé.
>
> **Le retour de fin de plan a quitté le message du soir** ([FF-062](../conversation/FF-062-quand-sophia-parle-la-premiere.md)):
> il partait le LENDEMAIN de la clôture, en 20h-22h, **en remplacement** du
> bilan — donc le dernier jour d'un plan perdait ses trois faits pour gagner un
> questionnaire. Il part maintenant à **22h locales, le dernier jour**, depuis
> `keel-proactive-v1`, sous son propre purpose (`keel_plan_feedback`).
>
> ⚠️ **Ce qui reste ouvert** : ② ne porte que la cuisson **du jour**. Une session
> de l'avant-veille jamais déclarée n'est pas demandée par ce canal — R11 dit
> qu'on constate sur du passé, et une question sans réparation possible
> promettrait ce qui n'arrivera pas. La procédure accident, elle, continue de
> remonter aux sessions antérieures après une décoche: là, la personne sait de
> quelle cuisson on parle.

## 1. Le problème

Trois faits gouvernent une semaine de cuisine : **les courses ont-elles été
faites**, **la session de cuisine a-t-elle eu lieu**, **les repas ont-ils été
mangés**. Le premier conditionne le deuxième, le deuxième conditionne le
troisième. Aujourd'hui, un seul des trois se rapporte librement.

| Fait | Où on peut le dire | Rétrospectif ? |
|---|---|---|
| Repas mangé / sauté | la bande du soir · `/app/plan` · `/app/today` | ✅ jusqu'à 6 jours |
| Cuisson faite / sautée | **uniquement** après avoir décoché un plat, dans le chat | ❌ aucune |
| Courses faites / pas faites | **uniquement** le soir du jour d'achat prévu | ❌ aucune |

Les deux faits de **foyer** n'ont donc aucune porte. Rate le message du soir un
mardi, et « je n'ai pas fait les courses » est perdu pour toujours : le plan
continuera d'annoncer une cuisson mercredi et trois repas jusqu'à vendredi,
tous impossibles.

**Ce que ça coûte.** C'est le mode d'échec structurel de la catégorie, déjà
nommé par FF-057 : *le plan meurt au premier contact avec la vraie vie, et on
cesse d'ouvrir l'app*. Et il se paie deux fois : la personne perd un plan qui
ment, le coach lit une semaine où trois soirs sont vides sans savoir si c'est
un silence ou un jeûne.

## 2. Job stories

> **Quand** je rentre à 21h sans avoir eu le temps de passer au magasin, **je
> veux** le dire en un geste, **pour que** mon plan cesse de me promettre un
> dîner que je ne peux pas cuisiner.

> **Quand** ma session de cuisine du dimanche est tombée à l'eau, **je veux**
> que les quatre repas qui en dépendaient disparaissent d'eux-mêmes, **pour
> que** je n'aie pas à les décocher un par un pour comprendre ma semaine.

> **Quand** j'ouvre l'app le mercredi soir alors que je n'ai rien dit depuis
> lundi, **je veux** pouvoir rattraper sans qu'on me repose douze questions,
> **pour que** dire la vérité coûte moins cher que se taire.

## 3. Périmètre

### Dans le périmètre

- **Un message par jour, le soir**, qui pose au plus **trois étapes
  enchaînées** : les courses, la cuisson, les repas. Il remplace la bande
  actuelle de FF-058 — il ne s'y ajoute pas.
- L'**extinction conditionnelle** : chaque étape éteint ce qui descend d'elle
  dans le graphe du plan, et **rien d'autre**.
- La **cascade de courses** (`cascadeSkippedWave`), qui n'existe pas : une
  vague ratée doit invalider **toutes** les cuissons qu'elle sert et les plats
  qui en descendent, comme `cascadeSkippedSession` le fait pour une session.
- Le **décalage de la VAGUE**, et non de la cuisson : ce que la personne a raté,
  c'est un passage au magasin. Les cuissons qui en dépendent suivent, une par
  une, et **seulement celles qui tomberaient avant le nouvel achat**.
- La **résolution des cuissons servies par une vague**, qui n'existe pas non
  plus : `servesCookOn` n'en nomme qu'une (voir §5).
- L'**invalidation même sur refus de décalage** : décliner le glissement ne
  doit pas laisser le plan mentir.
- Le **rattrapage des REPAS uniquement**, sur `/app/plan` et `/app/today`, où
  il existe déjà (`useMealTicks`). Voir R13/R14 pour la ligne de partage.

### Hors périmètre — engageant

- ❌ **V3 — recomposer le plan.** « Refaire un plan » depuis le bilan est
  exactement le rabbit hole que FF-057 nomme (« V3 par la petite porte », « le
  glissement qui devient V3 »). Le décalage est sûr **parce qu'il ne fait que
  déplacer des dates** ; y adjoindre une recomposition lui retire cette
  propriété. Refaire un plan reste un geste que la personne fait depuis
  `/app/plan`. **Décision du 2026-09-01, à lever par une fiche, jamais en
  passant.**
- ❌ **Toute question ouverte sur une intention.** « Tu peux cuisiner quand ? »
  est refusé par une ceinture armée dans les deux langues : texte libre à
  classer, information invérifiable, un tap remplacé par une phrase. La date
  est **calculée**, puis proposée.
- ❌ **Un second message le même jour.** Les étapes ② et ③ sont des réponses à
  un tap (`isReply: true`), jamais des notifications.
- ❌ **Interroger une bouche sans compte.** La fille de huit ans qui saute son
  goûter n'a aucune ligne à remplir (FF-058 R12).
- ❌ **Un score, une série, un compte fondu.** Inchangé.
- ❌ **Le bouton de bilan dans le chat.** *Retiré du périmètre le 2026-09-01,
  après la décision de désarmement ([FF-062](../conversation/FF-062-quand-sophia-parle-la-premiere.md)
  R13).* Il devait ouvrir le bilan d'un jour écoulé ; or courses et cuisson ne
  se rattrapent plus, et les repas se rattrapent **déjà** depuis `/app/plan`. Un
  bouton qui ne servirait qu'à refaire ce que l'écran fait est une seconde
  surface pour un seul geste — et c'est le défaut n°1 de ce dépôt.

## 4. Le circuit

```
                    keel-daily-pulse-v1  ·  20h-22h locales  ·  1 message
                                     │
                    ┌────────────────┴────────────────┐
                    │  QUE RESTE-T-IL À DEMANDER ?    │
                    │  (dérivé du plan + des états)   │
                    └────────────────┬────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        ▼ une vague tombe aujourd'hui│                            │
  ① LES COURSES  ── maître seul ──   │                            │
  « Tu as pu faire les courses ? »   │                            │
        │                            │                            │
   [Oui]│         [Pas encore]       │                            │
        │              │             │                            │
        │              ▼             │                            │
        │     ▸ wave_state = false   │                            │
        │     ✕ la cuisson servie    │                            │
        │       + ce qui en descend  │                            │
        │              │             │                            │
        │              ▼             │                            │
        │  « On décale les courses   │                            │
        │    à mardi ? »             │                            │
        │      [Oui] ▸ la vague passe à mardi; SEULES les cuissons│
        │              qu'elle sert et qui tombaient AVANT mardi  │
        │              glissent, avec leurs plats                 │
        │      [Non] ▸ plats invalidés (le plan dit la vérité)    │
        │      refusé ▸ motif + repli sans-cuisson                │
        │                            │                            │
        └──────────────┬─────────────┘                            │
                       ▼ si ① ne l'a pas éteinte                  │
                 ② LA CUISSON  ── maître seul ──                  │
                 « Tu as fait la session de cuisine ? »           │
                       │                                          │
                  [Oui]│      [Non]                               │
                       │        │                                 │
                       │        ▼                                 │
                       │  ▸ session_state = false                 │
                       │  ✕ cascadeSkippedSession                 │
                       │  → « On décale la cuisson à mardi ? »    │
                       │        │                                 │
                       └────────┴─────────────────────────────────┤
                                                                  ▼
                                              ③ LES REPAS  ── chacun pour soi ──
                                              « Aujourd'hui : X · Y »   ← PAS une question
                                              [Tout comme prévu] [Pas tout]
                                                          │
                                                     [Pas tout]
                                                          ▼
                                              ✓/✗ par plat (deux boutons chacun)
                                                          │
                                                        [✗]
                                                          ▼
                                              « Pourquoi ? »
                                              [commandé] [pas eu le temps] [mangé autre chose]
                                                          │
                                              → FF-057, procédure accident
```

**Le point où les deux chemins se rejoignent, et donc l'endroit qui casse** :
③ reçoit une liste de plats déjà amputée par ① et ②. Si l'amputation est trop
large, on efface des repas qui ont eu lieu ; trop étroite, on redemande ce
qu'on sait déjà. C'est `cascadeSkippedSession` / `cascadeSkippedWave` qui la
calcule, et rien d'autre.

## 5. Modèle de données

**Aucune table neuve.** Les trois faits ont déjà leur maison, et les trois sont
des jumeaux : même clé (personne, plan, date), même « l'absence de ligne EST
inconnu », même « dernière réponse gagne ».

| Fait | Table | Écrit par |
|---|---|---|
| Courses | `grocery_wave_states` (`buyOn`, `done`, `answered_local_date`) | `writeGroceryWaveState` |
| Cuisson | `cooking_session_states` (`cookOn`, `happened`, `answered_local_date`) | `writeSessionState` |
| Repas | `protocol_events` (`source_message_id = mealTickKey(...)`) | `tickMeal` / `applyStripTicks` |

**Rien d'autre ne se stocke.** Quels plats tombent d'une session ou d'une vague
ratée se **dérive à la lecture** — la doctrine que `grocery_waves.ts` énonce
déjà : *« les vagues se calculent à la lecture, elles ne se stockent pas »*. Un
second état à invalider est un état dont l'écrivain finit par disparaître.

**Le graphe de dépendance est déjà écrit par le générateur**, et c'est le seul
qui dise la vérité :

```
vague ──servesCookOn──▶ session ──preparation_ids──▶ préparations
                                                          │
                                      dishes[].uses[].preparation_id
                                                          ▼
                                                        plats
```

⚠️ **La date d'achat RÉELLE, jamais le `buyOn` théorique.** Quelqu'un qui a fait
la vague de lundi le samedi d'avant a du poulet au frigo *depuis samedi* :
compter depuis lundi donnerait deux jours de marge qui n'existent pas.

### 🔴 `servesCookOn` ne suffit pas, et c'est le trou de cette fiche

Une vague est un **paquet d'articles qui tombent le même jour d'achat** — leur
`buyOn` se calcule par article (`cuisson la plus précoce qui le consomme` moins
`la fenêtre de fraîcheur de son groupe`). Rien n'empêche deux articles d'une
même vague de servir **deux cuissons différentes**.

Or `GroceryWave.servesCookOn` n'en porte **qu'une seule** — sa propre
définition le dit : *« la cuisson la plus PROCHE que cette vague sert »*. Deux
conséquences, toutes deux vérifiées dans le code :

1. **Une vague qui sert mardi ET vendredi n'annonce que mardi.** Un décalage
   fondé sur `servesCookOn` laisserait vendredi sans ingrédients, sans qu'aucune
   erreur ne soit levée.
2. **La première vague ne sert JAMAIS rien.** `planGroceryWaves` ne pose
   `serves` que lorsque `buyOn > startsOn`; toute vague datée du premier jour du
   plan porte donc `servesCookOn = null`. Et
   `shiftProposalAfterShoppingLater` rend `null` dans ce cas — donc **rater la
   grosse course du début de plan ne propose rien du tout aujourd'hui.** C'est
   le cas le plus fréquent de tous.

**Ce qu'il faut à la place** : une fonction qui rend, pour une vague,
**l'ensemble** des dates de cuisson que ses articles servent. Elle se dérive des
mêmes entrées que `planGroceryWaves` (les termes des préparations et leur
`cook_on`) — c'est une projection, pas une donnée neuve, et elle ne se stocke
pas.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | **Un seul message par jour**, toutes étapes confondues. ② et ③ sont des réponses à un tap | T4 (« une seule demande par jour, toutes surfaces confondues »). Deux notifications, c'est le harcèlement que ce domaine est construit pour éviter |
| **R2** | On **interroge** ① et ②, on **offre** ③ | à 20h, les courses et la cuisson sont faites ou pas — il n'y a pas d'« en cours ». Le dîner, si. « Tu as mangé ? » à 20h05 pour un dîner à 20h30 apprend à ignorer le message. `[✓ poulet-riz]` offre, « Tu as mangé le poulet ? » interroge — la frontière de FF-058 R2, tenue par un test armé |
| **R3** | L'extinction suit **le graphe écrit par le générateur**, jamais « tout le jour » | un plat sans préparation (une salade), ou nourri par un batch antérieur, a bel et bien eu lieu. L'éteindre efface un repas réel — et ce sont précisément ceux qui ont survécu |
| **R4** | **Une coche vivante gagne toujours** sur une déclaration de session ou de vague | si le plat a été mangé, la préparation existait : c'est la déclaration qui est partiellement fausse. On croit le fait, jamais la déclaration |
| **R5** | Un plat dont la date est **antérieure** à la cuisson ne tombe jamais | il ne pouvait pas en dépendre. L'invalider serait réécrire un repas déjà passé |
| **R6** | Refuser le décalage **invalide quand même** les plats calculés | « je ne veux pas déplacer mes dates » ≠ « fais comme si tout allait bien ». Sans ça la question est décorative, et le plan continue de mentir |
| **R7** | Chaque étape est **abandonnable sans coût** | fermer après ① a déjà écrit le fait des courses. C'est la règle de FF-057 (« la décoche nue part d'abord, le formulaire s'ouvre après ») |
| **R6bis** | Ce qui se décale après des courses ratées, c'est **la vague**, pas la cuisson | ce que la personne a raté est un passage au magasin. Lui proposer de décaler la cuisson lui fait porter la conséquence à la place du fait, et la phrase ne décrit plus son geste |
| **R6ter** | Une cuisson servie par la vague ne glisse **que si elle tombait avant la nouvelle date d'achat** ; les autres ne bougent pas | une vague de milieu de semaine peut servir deux cuissons. Décaler celle du vendredi parce que celle du mardi a bougé déplace un plan que rien ne menaçait — et fait payer à la personne la compréhension d'un changement inutile |
| **R6quater** | Une cuisson servie par une **autre** vague ne bouge jamais | c'est la borne qui empêche « une course ratée » de devenir « toute ma semaine a changé » |
| **R8** | La date de décalage est **calculée**, jamais demandée | une question ouverte sur une intention rend du texte libre à classer et demande une information invérifiable. Ceinture armée, deux langues |
| **R9** | ① et ② ne partent **qu'au maître** du foyer ; ③ ne part **qu'à soi** | FF-058 R10 : la cuisson est un fait de foyer, la consommation un fait de personne. Un profil réclamé n'a pas à savoir si les courses sont faites, et sa réponse serait du bruit |
| **R10** | **Zéro plat, zéro cuisson, zéro vague ⇒ aucun bilan** | un message du soir qui ne porte rien est une notification sans objet. Le message reste exactement ce qu'il était |
| **R11** | Sur un jour **passé**, on **constate** : aucun décalage n'est proposé | décaler la cuisson de lundi à mardi, un mercredi, propose une date déjà écoulée. La cascade s'applique, la réparation non |
| **R12** | Sous **plancher de restriction**, aucun bilan | T7 : les planchers priment sur tout. Nommer des plats à quelqu'un dont on vient de décider qu'on ne lui parle pas de nourriture |
| **R13** | **UN FAIT DE RÉPARATION MEURT AVEC SON MESSAGE ; UN FAIT DE MESURE SURVIT.** Courses et cuisson ne se rattrapent **pas** ; les repas se rattrapent sur l'écran, jusqu'à la fenêtre de la composition | *tranché le 2026-09-01.* La ligne suit ce que chaque fait SERT, pas une préférence : courses et cuisson n'existent que pour **réparer** le plan, et sur du passé la réparation n'existe plus (R11) — une porte qui reste ouverte promet donc quelque chose qui n'arrivera pas. Un repas, lui, est une **mesure** : rapporté deux jours après, il reste exact et le coach le lit |
| **R14** | **Le MESSAGE du bilan est désarmé dès qu'un autre message proactif part** ([FF-062](../conversation/FF-062-quand-sophia-parle-la-premiere.md) R13) | une question qui reste tapable trois jours enseigne « j'ai le temps », qui est l'inverse de ce que la boucle demande. R13 et R14 ne se contredisent pas : R14 ferme **le message**, R13 dit ce qui garde une **autre** porte — et seuls les repas en ont une |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Le plan n'est pas lisible | **aucun bilan**, et le message du soir reste ce qu'il était. Compté (`bilan_plan_unreadable`), jamais silencieux |
| La cascade échoue en cours | l'état déjà écrit **reste** (la personne a répondu), les plats ne sont pas invalidés, et le refus est **dit** : « c'est noté, je n'ai pas pu mettre le plan à jour ». Jamais un accusé qui prétend |
| Le décalage se refuse (périssable, hors fenêtre, déjà cuisiné) | le **motif** est dit, plus ce qui reste (« du sans-cuisson pour tenir »). R15 de FF-057 : un refus n'est jamais un silence |
| Deux taps simultanés sur la même étape | dernier gagne. Les trois tables ont leur clé (personne, plan, date) ; Postgres arbitre, pas un booléen côté client |
| Le plan a changé entre la proposition et le tap | l'empreinte optimiste refuse le glissement et le dit. On n'écrase jamais un plan qu'on n'a pas relu |
| La personne ignore le message | **rien ne se passe.** Aucune relance, ni le lendemain ni au repas suivant. L'absence de ligne veut dire « on ne sait pas », et c'est une réponse |
| Un tap arrive le lendemain | il est traité : `buyOn`/`cookOn` règnent, pas le jour du tap. `answered_local_date` garde la distinction |

## 8. Critères d'acceptation

```gherkin
Étant donné un plan avec une vague de courses le mardi qui sert la cuisson du mardi
  Et trois plats du mercredi au vendredi qui consomment ses préparations
  Et un plat du mardi soir qui ne consomme aucune préparation
Quand la personne répond « pas encore » aux courses du mardi soir
Alors `grocery_wave_states` porte done = false
  Et les trois plats du mercredi au vendredi sont invalidés
  Et le plat du mardi soir reste demandé
  Et la question de cuisson n'est PAS posée
```

```gherkin
Étant donné une session du dimanche et quatre plats qui en descendent
  Et une coche vivante sur l'un d'eux
Quand la personne déclare que la session n'a pas eu lieu
Alors les trois plats non cochés sont invalidés
  Et le plat coché survit
```

```gherkin
Étant donné une cuisson ratée dont le décalage est possible
Quand la personne répond « non » à la proposition de décalage
Alors les dates du plan ne bougent pas
  Et les plats calculés par la cascade sont invalidés quand même
```

```gherkin
Étant donné un bilan ouvert un mercredi sur la cuisson du lundi
Quand la personne déclare que la session n'a pas eu lieu
Alors la cascade s'applique
  Et AUCUNE proposition de décalage n'est faite
```

```gherkin
Étant donné une personne qui a répondu aux courses puis a fermé l'app
Quand on relit la base
Alors `grocery_wave_states` porte sa réponse
  Et aucune relance n'est programmée
```

```gherkin
Étant donné un foyer de trois bouches dont une sans compte
Quand le maître reçoit son bilan
Alors il ne voit AUCUNE ligne pour la bouche sans compte
  Et le conjoint au profil réclamé ne reçoit ni la question de courses ni celle de cuisson
```

## 9. Rabbit holes

- **V3 par la petite porte.** « Tant qu'on décale, autant recomposer les trois
  jours restants. » Le glissement est sûr parce qu'il **déplace des dates** ;
  une recomposition doit tenir compte de ce qui est déjà cuit et déjà acheté,
  c'est un autre problème. Le jour où ces deux chemins se touchent, la propriété
  qui rend le décalage vérifiable disparaît.
- **L'extinction paresseuse.** « Les courses ont sauté, éteignons tout le
  jour. » Deux plats survivent toujours (sans préparation, ou nourris par un
  batch antérieur) et ce sont **ceux qui ont eu lieu**. Le plan se met alors à
  mentir dans l'autre sens, ce qui est pire : on efface du réel.
- **La question de trop.** Trois étapes, c'est déjà le maximum d'un soir chargé.
  Ajouter « et le petit-déjeuner de demain, tu le prépares ? » transforme le
  bilan en formulaire quotidien — celui que ce produit a retiré, avec sa
  mesure : *un formulaire quotidien se fait ignorer, puis couper, et la mesure
  qu'il servait se détruit elle-même*.
- **Le bilan qui devient un écran.** La tentation de rendre les trois étapes
  dans une seule bulle repliable. Une bulle qui liste 7 jours × 3 faits est le
  « sapin de Noël » que FF-058 mesure (`message_chars`, `interactive_count`) et
  refuse.
- **Faire confiance à `servesCookOn`.** Il rend UNE cuisson là où une vague peut
  en servir plusieurs, et `null` pour toute vague du premier jour. Un décalage
  bâti dessus est vert en test (le cas nominal a une seule cuisson) et faux sur
  la vague la plus importante de la semaine. Voir §5.
- **Le décalage en bloc.** « La vague a bougé, décalons tout ce qu'elle sert. »
  Une cuisson de vendredi qui a ses ingrédients n'a aucune raison de bouger, et
  la faire bouger est exactement le coût que cette fiche existe pour éviter :
  la personne dépense son énergie à comprendre un plan qui a changé sans motif.
- **Le décalage sur du passé.** `planSessionShift` n'a **aucune notion de
  « aujourd'hui »** — il n'en a jamais eu besoin, la seule porte étant le soir
  même. Le rattrapage ouvre ce cas, et sans R11 il proposerait de décaler vers
  une date écoulée.

## 10. Ce qu'on mesure

**La mesure principale** — la part des trois faits qui est **connue** en fin de
semaine, par personne :

- `wave_states` écrits / vagues du plan ;
- `session_states` écrits / sessions du plan ;
- coches vivantes ou décoches / plats écoulés.

Aujourd'hui les deux premiers sont structurellement proches de zéro hors du
soir exact. L'objectif est qu'ils rejoignent le troisième.

**Les mesures de santé du message** : `message_chars` et `interactive_count`
(FF-058 R6, déjà journalisés), plus le nombre d'étapes réellement atteintes —
`{1: 40, 2: 22, 3: 18}` se lit ; un `sent: 40` ne dit rien.

**⚠️ La contre-mesure, celle qui dirait que cette fiche coûte plus qu'elle ne
rapporte** : le **taux d'abandon après ①**. Si les gens répondent aux courses
puis ne touchent plus jamais aux deux étapes suivantes, le bilan est devenu le
formulaire qu'on a retiré, et il faut le couper à une seule question. Seuil à
surveiller : plus de 50 % d'abandon après ① sur deux semaines.

**La seconde contre-mesure** : le nombre de plats invalidés par la cascade
qui sont **recochés à la main** dans les 48h. S'il monte, l'extinction est trop
large — on efface des repas qui ont eu lieu, ce que R3 existe pour empêcher.

## 11. Questions ouvertes

- **🔴 Le bouton du chat, et il est maintenant en tension.** Le rattrapage
  devait être atteignable hors du message du soir — arbitré : c'est le **même
  bilan**, pas une seconde surface. Mais [FF-062](../conversation/FF-062-quand-sophia-parle-la-premiere.md)
  R13 (2026-09-01) désarme un message non répondu dès qu'un autre part, avec ce
  motif : *le produit ne saura pas traiter quelqu'un qui déclare mercredi qu'il
  n'a pas fait les courses de lundi*.

  Si cette logique vaut aussi pour l'écran, ce bouton n'a plus d'objet pour les
  courses et la cuisson — et il ne garde que les repas, qui se rattrapent déjà
  depuis `/app/plan`. **À trancher avant d'écrire quoi que ce soit** : c'est la
  différence entre une surface à construire et une surface à ne pas construire.
- **La deuxième vague, côté QUESTION.** FF-058 §7 fusionne « les courses du
  jour » en UNE ligne quand deux vagues tombent le même jour. Côté cascade le
  problème est réglé (§5 : on résout l'ensemble des cuissons servies), mais si
  deux vagues distinctes du même jour sont fusionnées à l'affichage, un seul
  « pas encore » vaut pour les deux. Acceptable ? Probablement oui — la personne
  n'est pas allée au magasin, donc aucune des deux n'est faite. À confirmer.
- **Le foyer à deux comptes.** Si le maître déclare la cuisson ratée, le
  conjoint reçoit-il ③ amputé le même soir, ou son bilan est-il déjà parti ? Le
  cron balaie les deux dans le même tick, et rien ne garantit l'ordre.
