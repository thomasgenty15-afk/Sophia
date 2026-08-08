# Retrait des comportements de collecte du chat — journal

Chantier exécuté le 2026-08-08 sur `ff-001-quotidien-du-coach`.
Autorité : `docs/fonctionnalites/conversation/README.md` (§ « La direction »,
« Hors périmètre — engageant », règles transverses T1 à T9).

**La surprise qui change la lecture de tout le reste : R1 et R2 étaient déjà
livrés** par le commit `1e4713a8` (« le chat cesse de reclamer, et un test de
propriete le tient dans le temps », 2026-08-08 00:46), avec son propre journal
dans `scratchpad/CHAT-LOG.md`. Ce chantier-ci les a **vérifiés par mutation**
plutôt que relus, puis a fait R3, R4 et l'extension du filet.

## Les commits

| # | Commit | Retrait |
|---|---|---|
| — | `1e4713a8` (antérieur) | R1 + R2 + le filet, 1ʳᵉ version |
| 1 | `131a7370` | R3 — la cadence du soir prouvée et verrouillée |
| 2 | `ba5a6c55` | R4 — les six axes deviennent B2B-only |
| 3 | `a4b73d55` | le filet couvre ses trois interdits |
| 4 | `6a5c76cb` | la gate de montage épinglée sur le rendu réel |

Aucun push. Un commit par retrait, comme demandé.

---

## R1 — le plafond de précision à 1

**État : déjà livré, vérifié.** `MEAL_PRECISION_DAILY_CAP = 1`
(`meal_precision.ts:534`), et son docstring porte déjà le POURQUOI demandé
(« deux, c'était déjà une relance ; une, c'est un approfondissement ») ainsi que
l'effet de bord voulu sur le fuseau — à 2 le bug `missing_local_date` était
masqué, à 1 une deuxième question dans la journée devient son symptôme visible.

**Preuve, et elle ne vient pas d'une relecture.** Mutation à `= 2` :

```
FAILED | 50 passed | 3 failed
```

Les trois épreuves qui tombent sont `meal_precision_test.ts:402`,
`meal_precision_cap_test.ts` et `no_food_solicitation_property_test.ts:94`.
Le plafond est donc pinné aux trois niveaux : la constante, son runtime, et la
propriété.

**Volontairement laissé** : la question de précision elle-même. La fiche
plafonne, elle ne supprime pas — gabarits fermés, aucun ne demande de quantité,
et le gate refuse déjà sous `safety_band`, sur intention future et sans fait
committé. Une épreuve dédiée l'affirme (« la question de précision N'EST PAS
supprimée (hors périmètre) ») : un test qui prouverait « zéro question jamais »
prouverait qu'on a supprimé la mauvaise chose.

## R2 — le rythme de question du compagnon

**État : déjà livré, vérifié — avec un écart assumé au prompt.**
`ask_now` et `askAfter` ont disparu ; `QuestionGuidance` ne vaut plus que
`"avoid_now" | "optional"`. Les seules occurrences restantes de `ask_now` sont
deux commentaires qui expliquent le retrait (lignes 36 et 416).

**L'écart, et pourquoi il tient.** Le prompt demandait de retirer aussi
« l'état mort de `temp_memory` (lecture ET écriture) ». **Cet état n'est pas
mort** : `companion_question_rhythm` est lu (`readQuestionRhythmState`,
l. 357/386/499) et écrit (l. 1382/1392), et il alimente le plafond `avoid_now`
— « max 2 questions / 6 tours ». Le retirer rendrait l'agent **plus libre de
demander**, l'inverse exact de la fiche. Le compteur ne dit plus « il est temps
de demander », il dit « tu en as déjà assez demandé ».

C'est la règle qui prime du prompt lui-même qui tranche : *« chaque retrait doit
laisser le système plus simple ET plus verrouillé »*. Retirer la retenue en même
temps que la poussée aurait été plus simple et moins verrouillé.

**Preuve** : `no_food_solicitation_property_test.ts` balaie chaque valeur de
« tours depuis la dernière question » de 0 à 20, **dans les deux langues**, et
vérifie qu'aucune consigne de poser n'apparaît — puis, dans la même épreuve, que
`avoid_now` sait encore fermer (« …ET SA CONDITION DE DÉSARMEMENT »).

**Volontairement laissé** : une question qui **sert la réponse en cours**. La
frontière est dans le prompt, dans les deux packs, mot pour mot identique :
« Aucun quota ni cadence : jamais de question parce que ça fait un moment. Elle
se justifie par CE tour ou pas du tout. »

## R3 — la cadence du soir : vérifiée, puis verrouillée

**La mécanique était déjà la bonne.** `decideAskCadence` :
`PULSE_ASK_INTERVAL_DAYS = 3`, escalade à 1 jour **seulement** après un `hard`
déclaré, repli à 7 jours après deux silences — et le repli passe **avant**
l'escalade, ce qui est l'arbitrage le moins évident du module.

**Le défaut trouvé, et il vaut plus que le correctif.** Les tests de cadence
existants sont tous **paramétrés par la constante qu'ils devraient protéger** :

```ts
for (let days = 0; days < PULSE_ASK_INTERVAL_DAYS; days++) { … }
```

À `PULSE_ASK_INTERVAL_DAYS = 1`, la boucle tourne une fois et le test reste
**vert**. La cadence du soir pouvait redevenir quotidienne sans casser une seule
épreuve — c'est-à-dire que le comportement mis hors périmètre par la fiche
n'avait aucun garde-fou.

**Ce qui a été ajouté** (`daily_pulse_test.ts`, 4 épreuves) :

1. la **valeur** 3 est pinnée, avec les deux bornes qui l'encadrent — l'escalade
   est le seul chemin vers un rythme quotidien, et une escalade dont la
   condition tomberait rendrait la question quotidienne pour tout le monde sans
   toucher à la constante ;
2. **sept jours consécutifs** simulés, comptés contre un plafond **écrit en
   dur** : `CEILING = 3`, soit ⌈7/3⌉. Dériver ce plafond de la constante aurait
   reproduit le défaut dans le verrou censé le corriger — c'est d'ailleurs ce
   qu'a fait la première version de ce test, et la mutation l'a montré ;
3. le **fait** du soir part chaque soir où il y a matière (`askDue: false`,
   `decision: "send"`, `ask: false`) — sans quoi quelqu'un « simplifierait » en
   coupant le message entier ;
4. aucune **relance** : ni le même soir (`already_sent_today`), ni le lendemain
   (le repli).

**Preuve par mutation** — à `PULSE_ASK_INTERVAL_DAYS = 1` :

```
R3 — la cadence vaut 3 jours, et la valeur est PINNÉE avec son pourquoi ... FAILED
R3 — sur 7 jours consécutifs ordinaires, la question part au plus ⌈7/3⌉ fois ... FAILED
R3 — le FAIT du soir, lui, peut partir chaque soir: c'est le véhicule ... ok
R3 — une question restée sans réponse ne se relance pas le lendemain ... ok
FAILED | 29 passed | 3 failed
```

Nominal : `ok | 32 passed | 0 failed`.

**Volontairement laissé — et c'était explicitement demandé** : le tap du soir
(consommateurs vivants : l'axe faim pour FF-027, et le message comme véhicule de
FF-029/FF-028), le fait du soir, et les ceintures `VERDICT_PATTERNS` /
`allowedNumbers` / `minor_quantity`, partagées avec le bilan hebdo. Une épreuve
interdit d'ailleurs que le tap tombe à zéro (`asked >= 2`) : un tap qui ne part
jamais ne mesure rien.

## R4 — les six axes du dimanche deviennent B2B-only

**Le défaut que le retrait a failli causer, et c'est le vrai contenu du lot.**
La garde de vacuité du formulaire comptait les **axes seuls** —
`Object.keys(values).length === 0` sur un objet qui ne contenait que des scores.
Cacher les axes sans y toucher rendait l'écran **insoumettable** : l'élève tapait
son poids et recevait *« Give at least one of the six a score »* sur un
formulaire qui n'en proposait aucun. Le retrait aurait cassé **la boucle du
poids**, c'est-à-dire la seule chose que ce dimanche garde en B2C — exactement le
mode d'échec que le prompt nommait en garde.

### Le diff, par couche

**Base.** `20260808110000_biofeedback_reader_gate.sql` —
`my_biofeedback_has_reader()`, `security definer`, miroir de `my_coach_ids()`
(même définition du lien actif, deux `status = 'active'`). Elle rend un booléen
et **rien d'autre** : ni identifiant, ni nom, ni genre de coach. Le genre du coach
est structurellement invisible à l'élève — il lit sa ligne `coach_clients`
(policy `coach_clients_student_select`) mais pas la ligne `coaches` de son coach
(`coaches_self_select` ne rend que la sienne, et un élève n'en a pas).
`<> 'house'` et non `= 'human'` : si la liste fermée s'ouvre un jour, un genre
inconnu doit compter comme un lecteur plutôt qu'éteindre la collecte en silence.

**Front.** La décision de soumission est **sortie du composant** :
`buildWeeklySubmission` dans `api/weeklyCheckIn.ts`, pure, rendant des codes
d'erreur que le composant traduit. Motif : ce dépôt n'a pas de jsdom, donc la
règle qui venait de casser n'avait aucune épreuve à sa taille. Vacuité = **rien
du tout** : un axe compte, une mesure compte. Les axes ne partent **que** s'ils
ont été demandés (`showAxes: false` ignore `scores`) — un score qui survivrait à
un changement de mode serait une valeur que personne n'a saisie, et le serveur
l'écrirait sans broncher.

Gate de **montage** et pas affichage conditionnel : `showAxes === null` ⇒ le
formulaire ne se monte pas. Fail-closed sur la lecture : `loadBiofeedbackHasReader`
rend `false` quand elle échoue, parce que « je ne peux pas prouver qu'un aval
consomme » doit se comporter comme « aucun aval ne consomme ».

**Copie.** Deux clés nées avec le lot — `chat.weekly.subtitle.measures` et
`chat.weekly.error.empty.measures`. « Six quick reads » sous deux champs
annonçait quatre questions qu'on a décidé de ne pas poser, et le message de
vacuité ne devait plus citer « les six ». `chat.weekly.optional` disparaît avec
les axes : sur l'unique chose demandée, ça dirait à l'élève qu'il peut envoyer un
formulaire vide.

**Lecteurs backend — vérifiés un par un, comme demandé.**

| Lecteur | Verdict |
|---|---|
| `week_review_io.ts::biofeedbackAxes` | dégrade déjà : rend `null` sans axe. POURQUOI ajouté — `null` = « pas demandés », pas « semaine incomplète » |
| `week_review.ts::weekReviewPromptBlock` | dégrade déjà : la ligne « WHAT THEY RATED THEMSELVES » est conditionnelle. **Aucune phrase de remplacement** ajoutée — « ils n'ont pas rempli les six axes » inviterait le modèle à réclamer |
| `week_review_io.ts::composeWeekReviewBody` | ne lit pas le biofeedback du tout : il compose depuis `reading`, le décompte des faits |
| `weekly_flow.ts::parseWeeklyFlowResponse` | **ne dégradait PAS** — voir ci-dessous |

**Le lecteur qui traitait le nominal comme une anomalie.** En
`origin = "weekly_form"`, un axe absent produisait `energy: missing, dropped` —
six warnings par dimanche B2C, dans le seul canal censé signaler qu'un formulaire
a divergé du code. La prémisse (« les six champs sont `required` chez Meta »)
est morte avec le Flow WhatsApp : `weeklyFlowJson()` n'a plus d'appelant hors
test. Et **deux** cas légitimes produisent des clés absentes — une notation
partielle (permise depuis toujours par l'écran) et le dimanche B2C. Un axe
absent est donc silencieux ; une clé **présente** dont la valeur est illisible,
vide ou hors bornes crie toujours. Une divergence réelle envoie une valeur
cassée, pas rien du tout.

Deux tests inversés en conséquence, avec le POURQUOI du renversement écrit dans
le test — dont un contre-factuel qui disait « le point du dimanche, lui, continue
de le dire » et qui est remplacé par l'épinglage de ce qui distingue vraiment les
deux origines : la **provenance** (`in_app_weekly_form` vs
`in_app_measures_card`).

**Le fait faux trouvé dans le prompt.** `pulseContextBlock` annonçait à **tout le
monde** : *« already collected twice — every evening in one tap, every Sunday in
six ratings »*. Depuis R4 la deuxième collecte n'existe plus pour la plupart des
élèves, et le seul bloc censé dire au modèle ce qu'il sait déjà lui annonçait une
donnée qui n'arrive jamais — c'est-à-dire l'invitation à la réclamer comme
« manquante ». Le paramètre `hasWeeklyAxes` était **déjà là** ; il ne décidait que
de la ligne au-dessus. L'interdiction, elle, ne bouge pas d'un mot : elle ne
dépend pas du nombre de collectes mais du fait que personne ne consomme la
réponse — et cette raison est maintenant écrite dans le bloc, là où le modèle la
lit.

### Preuves

**La fonction, sur la base locale, sous `role authenticated`** — quatre
`request.jwt.claims`, transaction **rollback** (base partagée) :

```
A coach humain actif  -> attendu t | t
B coach maison seul   -> attendu f | f
C aucun lien          -> attendu f | f
D anon (auth.uid NULL)-> attendu f | f
```

Le cas B a demandé de **re-pointer** un lien existant vers le coach maison
plutôt que d'en créer un : `coach_clients_active_requires_consent` refuse un lien
actif sans consentement. Aucun élève n'est rattaché au coach maison en local
(333 liens, tous vers des coachs humains) — un run réel de ce chemin reste donc
à faire sur un vrai élève B2C.

**Grants** : `has_function_privilege('authenticated', …)` = `t`,
`('anon', …)` = `f`.

**Front** : `ok | 16 passed` sur `weeklyCheckIn.int.test.ts`, `4 passed` sur
`weeklyCheckInDialog.int.test.ts`, suite complète `520 passed | 20 skipped`,
`tsc -b` et `eslint` propres.

**Mutation 1** — remettre la garde de vacuité avant les mesures (= revenir à
« aucun axe ») : `4 failed | 12 passed`.
**Mutation 2** — retirer `if (showAxes === null) return null` : l'épreuve du
montage tombe.

**Volontairement laissé** : poids et tour de taille **pour tous** (lecteurs
indépendants du coach : `/app/progress`, la ceinture restrictive, FF-008) ; la
contrainte `student_daily_checkins_axis_coherent_check` (autre table, autre
chose — le tap du soir, pas la revue du dimanche) ; les six axes **entiers** pour
les élèves à coach humain.

## Le filet — le test de propriété

`no_food_solicitation_property_test.ts` existait (6 épreuves) et couvrait **un**
des trois interdits. Le filet nommait trois demandes non sollicitées ; l'état et
la relance ne vivaient que dans les tests d'unité de `daily_pulse`, donc rien ne
les tenait **ensemble**, sur le même élève, tour après tour — ce qui est
précisément le travail d'un filet.

**Chemin** : `supabase/functions/sophia-brain/test_harness/keel_properties/no_food_solicitation_property_test.ts`
(6 → 10 épreuves).

| Interdit | Épreuve | Couvert avant ? |
|---|---|---|
| « t'as mangé quoi ? » | 20 tours ordinaires, zéro demande ; refus `safety_band`/`future_intent` conservés | ✅ |
| légitimes plafonnées 1/jour | 20 tours après un fait ⇒ exactement 1 | ✅ |
| pas de poussée par le temps | 0→20 tours sans question, deux langues | ✅ |
| **« comment tu te sens ? »** | 20 tours × produit cartésien des états réels ; chaque formulation ne peut apparaître qu'**après** l'interdiction qui la cite | ❌ **ajouté** |
| **le compte des collectes est honnête** | « every Sunday in six ratings » absent sans axes | ❌ **ajouté** |
| **relance d'une question sans réponse** | 20 soirs de silence, **deux ticks** par soirée comme en prod : 20 envois exactement, ≤ 4 questions | ❌ **ajouté** |

**Sortie** :

```
ok | 10 passed | 0 failed (71ms)
```

**Ce qu'il attrape, prouvé par mutation** :

- retirer la garde `already_sent_today` ⇒ *« 20 soirs de silence »* tombe ;
- transformer l'interdiction d'état en invitation ⇒ *« le contexte n'invite
  JAMAIS la question d'état »* **et** *« le compte des collectes »* tombent ;
- remonter `MEAL_PRECISION_DAILY_CAP` à 2 ⇒ 3 épreuves tombent ;
- rebrancher une cadence quotidienne ⇒ 2 épreuves R3 tombent.

**Ce qu'il ne prouve pas, et il faut le dire.** Il porte sur les surfaces
**déterministes** — les gates et les blocs de prompt — pas sur une réponse de
modèle, qui ne prouverait qu'un tirage. Un run réel sur un élève provisionné
reste le seul juge du texte effectivement envoyé, et ce dépôt a mesuré que les
correctifs prompt-only régressent en run réel.

---

## Les surprises — consignées, pas réparées en silence

1. **R1 et R2 étaient déjà faits** (`1e4713a8`). Le prompt annonçait
   `MEAL_PRECISION_DAILY_CAP = 2` à la ligne 519 ; le fichier porte `= 1` à la
   ligne 534, avec le POURQUOI et l'avertissement sur le fuseau déjà écrits.

2. **Les tests de cadence R3 se protégeaient eux-mêmes de rien** — paramétrés
   par la constante qu'ils gardaient. C'est le défaut central du lot, et il n'est
   pas propre à `daily_pulse` : ma première version du test de sept jours l'a
   reproduit, et seule la mutation l'a montré.

3. **La garde de vacuité du formulaire hebdo** aurait transformé le retrait R4 en
   perte de la boucle du poids. Le prompt l'avait anticipé (« celui qui traite
   "pas d'axes" comme "pas de revue" casse la boucle du poids ») — mais le
   coupable n'était pas un lecteur backend, c'était le **front**.

4. **`parseWeeklyFlowResponse` traitait le nominal comme une anomalie**, sur une
   prémisse (`required` chez Meta) morte avec le Flow WhatsApp.

5. **`pulseContextBlock` annonçait au modèle une collecte qui n'existe plus.**

6. **`revoke … from public` ne suffit pas** : `anon` gardait `execute` sur ma
   fonction. Corrigé. **`my_coach_ids()`, dont elle est le miroir, porte encore
   la fuite** — sans conséquence exploitable (`auth.uid()` est NULL sous `anon`,
   la fonction rend un tableau vide), mais c'est la même classe.

7. **Version de migration en double, préexistante** : `20260808060000` porte deux
   fichiers (`household_roster_for_server` et
   `retrait_residus_raisons_de_conservation`), et **une seule** ligne est
   enregistrée en base locale. Ça bloquera un `db push` / `db reset`. Pas touché
   — ça vient de deux commits antérieurs.

8. **FF-007 est brûlé** alors que le prompt le cite comme l'endroit où la
   frontière « la question sert-elle le tour ? » est écrite. Elle vit désormais
   dans `conversation/README.md` (T3, T5) et, mot pour mot, dans les deux packs
   de langue du prompt du compagnon.

9. **Le budget partagé de T4 n'a qu'un seul consommateur aujourd'hui.** La règle
   dit « une seule demande par jour, toutes surfaces confondues », partagée entre
   FF-017, FF-025 et FF-028. FF-025 et FF-028 ne sont pas construits : le
   plafond existant (`meal_precision_questions`) est le seul, et il compte une
   seule surface. Le jour où FF-025 arrive, il doit **consommer ce compteur**, pas
   ouvrir le sien — trois compteurs séparés = trois demandes = un interrogatoire.

10. **`keel-weekly-flow-v1` et `weeklyFlowJson()` survivent au Flow qu'ils
    servaient.** `weeklyFlowJson()` n'a plus d'appelant hors test. Repéré, non
    touché : c'est un retrait de **code**, pas de comportement.

## Rouge préexistant

`supabase/functions/sophia-brain/router/run_keel_conversation_loop_test.ts:166`
— « Recorded for 2026-07-27 (breakfast): Glycinate de magnésium » attendu
« Magnesium glycinate ». **Prouvé antérieur** : `git stash push` de mes deux
seuls fichiers non committés, puis re-run ⇒ `FAILED | 10 passed | 1 failed`. Le
`git stash -u` complet n'a pas été utilisé délibérément — l'arbre de travail
porte les modifications **non committées d'une autre session** (`meal_generation.ts`,
`mealLabels.ts`, `bodyMeasures.ts`, `EatingRhythmCard.tsx`, `TodayPage.tsx`…), et
les remiser aurait interféré avec un travail en cours. Le stash ciblé prouve la
même chose sans y toucher.

Hors ce rouge : **3425 passed | 67 ignored** sur `deno test supabase/functions/`.

## Ce que l'humain doit lancer

Les migrations distantes, le deploy et les secrets sont hors de ma main.
La migration est **déjà appliquée en local** et sa version est enregistrée.

```bash
supabase db push
```

```bash
supabase functions deploy sophia-brain chat-inbound-v1 keel-daily-pulse-v1
```

⚠️ **Avant le `db push`** : la version en double `20260808060000` (surprise n° 7)
doit être tranchée, sinon la lignée est ambiguë.

```bash
ls supabase/migrations/ | sed 's/_.*//' | uniq -d
```

Et le runtime edge sert des `_shared` périmés sur fichier modifié — redémarrer
avant tout run réel :

```bash
supabase stop && supabase start
```

### Ce qui reste à prouver en run réel

- un dimanche **poids-seul** de bout en bout sur un élève sans coach humain
  (aucun n'existe en local : 333 liens, tous humains) ;
- les six axes **toujours là** pour un élève à coach humain, après deploy ;
- que le message du soir d'un élève B2C ne cite plus « every Sunday in six
  ratings » — c'est un bloc de prompt, et un bloc de prompt ne se prouve
  qu'en run réel.
