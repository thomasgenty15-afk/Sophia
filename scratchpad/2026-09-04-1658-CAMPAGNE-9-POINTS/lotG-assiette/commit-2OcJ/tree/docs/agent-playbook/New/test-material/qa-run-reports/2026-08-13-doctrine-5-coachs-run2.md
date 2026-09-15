# Run QA — La doctrine du coach, du chat jusqu'à l'assiette (5 coachs) · **run 2, après correctifs**

> Run 1 : `2026-08-13-doctrine-5-coachs.md` (verdict `red`).
> Ce rapport mesure les **mêmes** 5 doctrines, les **mêmes** informations
> utilisateur et les **mêmes** 5 intentions, après les correctifs de `R1-B01`,
> `R1-B02`, `R1-B03`, `R1-B07` et `R1-B09`.

## 1. Contexte Du Test

- **Date** : 2026-08-13, 02:53 → 04:10 CEST
- **Run** : `doctrine5-run2` (scénario global `1`, variantes `1.2`/`1.3` = rejeux
  D2, `1.4` = adversarial)
- **Persona** : cinq comptes jetables neufs, un par coach, `is_test_persona=true`,
  `fr-FR` / `Europe/Paris` / `FR`. Aucun compte nommé touché. Aucun jeton affiché.
- **Objectif** : les correctifs font-ils parler la doctrine dans le chat, sans
  rien casser dans l'assiette ?
- **Trajectoire** : 25 tours (5 × 5), 10 rejeux sur D2, 7 sondes adversariales,
  2 générations de 4 jours. **42 tours exploitables**, aucun tour perdu.
- **Cadre IA réel** : entrée produit `chat-inbound-v1`, doctrines publiées par
  `coach-doctrine-v1`, Supabase local. `docker restart` du runtime edge **avant**
  le run (code edge modifié), suivi de `local_extend_kong_functions_timeout.sh`.
  Aucune correction de code **pendant** le run.
- **Validité QA** : **valide**.

### 1-bis. Un run intermédiaire a été ABANDONNÉ, et il n'est pas mélangé ici

Un premier essai post-correctif a été lancé, puis **jeté après 10 tours** : il
avait révélé un défaut résiduel (§4-bis, cas *a*), et le corriger en cours de
route aurait mélangé deux états de code dans une même matrice — ce que le cadre
interdit. Les fixtures ont été supprimées (219 → 0 lignes), le correctif appliqué,
le runtime redémarré, et **tout** le run ci-dessous rejoué à neuf. Les tours de
l'essai abandonné n'apparaissent nulle part dans les comptes.

### 1-ter. Réserve conservée

`generate-meal-v1/index.ts` et `_shared/keel/meal_generation.ts` restent **sales**
dans le dépôt (lot « locale d'artefact » d'une autre session, non commité).
L'étape 2 tourne donc contre cet état de disque, comme au run 1. Ce lot ne touche
ni le chargement de doctrine ni le mapping ; la mesure reste valable.

---

## 2. Ce qui a été corrigé

| Bug | Correction | Où |
|---|---|---|
| `R1-B01` | Le gate FF-010 (« aucun remplacement nommé ⇒ chemin général ») **perd sa condition `household !== null`**. Le foyer était le décor où le défaut avait été vu, pas sa cause. Et « nommé » se juge désormais avec **la même résolution que le resolver** (`resolveFoodGroupToken`) : un jeton qui ne résout sur aucun `food_groups.slug` ne nomme aucun remplacement. | `sophia-brain/router/run.ts` |
| `R1-B01` (amont) | Le contre-exemple mesuré ajouté au contrat `plan_question` du dispatcher, dans le style de celui du « resto » déjà présent. | `dispatcher/dispatcher.prompts.ts` |
| `R1-B02` | **Nouveau gate déterministe** : si le groupe demandé est `excluded` ou `discouraged` dans le protocole publié du coach, la question est **déjà tranchée** — elle ne s'escalade pas vers lui, elle part au chemin général où la doctrine répond. Slugs contre slugs, aucune prose, aucune lecture de plus (`keelTurn.protocol` est déjà chargé). | `sophia-brain/router/run.ts` |
| `R1-B03` | Les phrases du renderer sortent des littéraux anglais et deviennent des **données de locale**, résolues par `localePackKey` — la même fonction que les étiquettes, donc phrases et étiquettes ne peuvent plus tomber dans deux langues. | `skills/plan_question/renderer.ts` |
| `R1-B07` | Le `select` sur `coach_food_items` porte `frequency_template`, `cutoff_local`, `slot_key` et `why`. La borne va dans `reason`, **jamais dans `term`** (c'est `term` que le verrou déterministe matche). | `_shared/keel/doctrine_loader.ts` |
| `R1-B09` | Les pronoms masculins codés en dur (`HE BUILDS`, `he does not build`, `HIS RULES`) deviennent `this coach` / `they`. | `_shared/keel/protocol_compiler.ts` |

**Tests** : 4 nouveaux tests de locale (positif FR sur les 5 formes, anti-faux-positif
« l'anglais est inchangé octet pour octet »), 3 nouveaux tests de borne d'exclusion
(bornée / absolue inchangée / gabarit incomplet ⇒ exclusion absolue).
Suites complètes : **`_shared/keel` 2 861 ✅ · `sophia-brain` 1 293 ✅ · 0 rouge.**
`deno check` propre sur les quatre modules touchés.

**Non corrigé volontairement** : `R1-B08` (le verrou poste l'`instead` nu),
`R1-B04` (`reason_code`), `R1-B05` (les `encouraged` nommés sans lecteur), et la
moitié `doctrine.ts` de `R1-B09` — ce fichier appartient à une session parallèle
(FF-041 en cours), donc **non touché**. Voir §7.

---

## 3. Le résultat, run 1 contre run 2

**Mesure mécanique sur les 42 tours de chaque run** (classement par la forme du
texte rendu, pas par appréciation) :

| | run 1 | **run 2** |
|---|---|---|
| tours répondus **par le composeur** (la doctrine parle) | 22 | **28** |
| tours avalés par l'**escalade** `plan_question` | **16** | **4** |
| tours remplacés par le **verrou de sortie** | 4 | 10 |
| **réponses en anglais** à un élève `fr-FR` | **16** | **0** |
| lignes `contract_change_requests` écrites | **18** | **4** |

### La matrice 5 coachs × 5 intentions

| | I1 · petit-déj | I2 · protéines | I3 · l'exclu nommé | I4 · dîner rapide | I5 · pourquoi |
|---|---|---|---|---|---|
| **D1** jeûne | 🟢 | 🟢 *(🔴 au run 1)* | 🟡 verrou | 🟡 verrou *(🔴)* | 🟢 |
| **D2** animal | 🟢 | 🟢 | 🟡 verrou | 🟢 *(🔴)* | 🟡 verrou |
| **D3** végétal | 🟢 *(🟡)* | 🟢 | 🔴 | 🟢 | 🟢 |
| **D4** brut | 🟢 | 🟢 *(🟡)* | 🟢 *(🔴)* | 🟢 *(🔴)* | 🟢 |
| **D5** matin | 🟢 | 🟢 *(🔴)* | 🔴 | 🟢 *(🔴)* | 🟢 |

**Matrice principale : 19 🟢 · 4 🟡 · 2 🔴** (run 1 : 12 / 5 / 8).
**Sur les 42 tours : 28 🟢 · 10 🟡 · 4 🔴** (run 1 : 19 / 7 / 16).

**Rejeu ×3 sur D2** — le dispatcheur est stochastique, un échec sur trois reste un rouge :

| Intention | run 1 | **run 2** |
|---|---|---|
| I1 petit-déj | 🟢 🔴 🔴 | 🟢 🟡 🟢 |
| I2 protéines | 🟢 🟢 🟢 | 🟢 🟢 🟡 |
| I3 l'exclu | 🟡 🔴 🔴 | 🟡 🟡 🟡 |
| I4 dîner | 🔴 🔴 🟡 | 🟢 🟢 🟢 |
| I5 pourquoi | 🟡 🟢 🟢 | 🟡 🟡 🟡 |

**Zéro rouge sur les 10 rejeux** (run 1 : 5 rouges). Le reste des jaunes est
**entièrement** le verrou de sortie (`R1-B08`, non corrigé).

---

## 4. Tours De Conversation

> Trace commune à **42/42** tours : `http_status 200`, `delivery_reason: reply`,
> `keel.doctrine.variant → reason:"loaded", variant:"fat_loss", delegated:false,
> beliefs_kept 3/3, arbitrations_kept 2/2`. Aucun `no_published_doctrine`.
> `chat_messages.metadata` ne porte toujours ni `response_owner` ni `handled_by`
> (`R1-B06`, non corrigé) : le propriétaire du tour est reconstitué depuis
> `conversation_turn_traces.route_decision`, qui, lui, est complet.

### I1 — une idée de petit-déjeuner · **5 🟢**

**D1** > Baptiste Rouve ne fait pas de petit-déjeuner le matin : la matinée se passe à jeun, avec seulement un café noir ou un grand verre d'eau au réveil. Le premier vrai repas est à midi, et il porte la protéine pour tenir la fenêtre.

**D2** > Pour demain matin, Hélène Vasseur construirait un petit-déj autour d'une pièce de chair animale : œufs en priorité, ou poisson gras si tu préfères. Le point simple à garder en tête, c'est que la pièce tient l'assiette ; le reste est secondaire.

**D3** > Oui : garde ta base habituelle, et change juste un seul levier demain […] fais-le tourner vers un bol avec lentilles + pain complet + tomates, ou tofu + flocons d'avoine salés + champignons.

**D4** > Margot Delaunay construit le petit-déj avec du brut, pas avec un produit industriel : œufs, légumes cuits, huile d'olive […]

**D5** > Le grand matin, tu pars sur un petit-déjeuner copieux et simple : œufs, flocons d'avoine, fruit. Si tu manques de temps, garde au moins les œufs au réveil […]

D3 passe de 🟡 à 🟢 : au run 1 la réponse ne nommait aucun aliment.

### I2 — « comment je mets assez de protéines ? » · **5 🟢**

**D1** — 🔴 au run 1, 🟢 ici :
> Baptiste Rouve cale la protéine au déjeuner, qui est le premier vrai repas de la journée. Le dîner est le deuxième repas copieux […] l'idée, c'est que le déjeuner tienne huit heures, pas de grignotage entre les deux.

**D2** > […] une vraie pièce animale qui tient l'assiette […] les légumes viennent à côté, pas à la place.
**D3** > […] la légumineuse à chaque repas […] une céréale complète en plus pour faire une protéine complète.
**D4** > Margot Delaunay construit les protéines au quotidien avec une source maigre à chaque repas utile […] sans produit à l'étiquette longue.
**D5** — 🔴 au run 1, 🟢 ici :
> […] la protéine au petit-déjeuner et au déjeuner, avec le matin comme socle. Le soir, tu restes léger — soupe ou légumes — donc tu ne comptes pas sur le dîner pour faire le plein de protéines.

D2 et D3, même question, mêmes informations utilisateur, positions frontalement
incompatibles. C'est la démonstration centrale, et elle tient.

### I3 — l'aliment que SA doctrine exclut nommément · **1 🟢 · 2 🟡 · 2 🔴**

#### D4 — **`green`** (🔴 au run 1) — le gate de doctrine a mordu

**User** > Je rentre lessivé. Un plat préparé industriel du supermarché, ça passe pour une fois ?

**Sophia**
> Margot Delaunay ne pose pas de plat préparé industriel sur l'assiette. Si tu rentres lessivé, la version qui rentre dans sa méthode, c'est du brut en 10 minutes : deux œufs, une poêlée de légumes natures, un filet d'huile d'olive. Le « ça passe pour une fois » ne change pas la règle ici.

`route_decision.reason_code = plan_question_coach_already_ruled_general_path`.
Le refus est motivé **par la position du coach**, l'alternative est son
arbitrage, et **aucune ligne `contract_change_requests` n'a été écrite**.

#### D1 et D2 — **`yellow`** — Famille `BF-LEDGER-02` (`R1-B08`, non corrigé)

> un café noir ou un grand verre d'eau au réveil, et le premier vrai repas à midi
> — Baptiste Rouve

> de la viande rouge, des œufs, du poisson gras ou des abats à la place
> — Hélène Vasseur

Le verrou de sortie remplace la réponse entière par `forbidden[].instead`.
⚠️ **Pour D2 le routage est désormais CORRECT** — le gate de doctrine a envoyé le
tour au chemin général (`plan_question_coach_already_ruled_general_path`) et
**aucune escalade n'a été écrite** ; c'est le verrou, en aval, qui a mangé la
phrase. Le défaut a donc changé de couche : `R1-B02` est réglé, `R1-B08` reste.

#### D3 — **`red`** — Famille `BF-ROUTE-01` (résiduel, cas *a*)

**User** > Là franchement j'ai envie de poulet ce soir. Je peux ou pas ?

**Sophia** > Ça sort de ce que ton coach a posé sur cette ligne […]

Signal relu dans `conversation_turn_traces` :
`{kind: food_swap, requested_food_group: "lean_protein", prescribed_food_group: "lean_protein"}`.
Le dispatcher a mappé « poulet » sur `lean_protein` (au lieu de `poultry`, qui
existe) **et** recopié le même slug des deux côtés. Le gate de doctrine ne peut
donc pas mordre : `lean_protein` n'est pas un groupe que D3 écarte — il ne
l'écarte pas, il l'encourage.

#### D5 — **`red`** — Famille `BF-ROUTE-01` (résiduel, cas *b*)

**User** > Ce soir j'ai envie de me faire des pâtes au dîner. C'est jouable ?

Signal : `{requested: "refined_grain", prescribed: "whole_grain"}`. Le plan de
cet élève ne porte **ni l'un ni l'autre** (ses deux lignes sont `lean_protein` et
`non_starchy_veg`) → `commitment_not_identified` → escalade sur une ligne qui
n'existe pas (`commitment_id: null` dans la ligne écrite).

### I4 — un dîner rapide ce soir · **4 🟢 · 1 🟡** (run 1 : 1 🟢 · 4 🔴)

**D2** > Prends une vraie pièce tout de suite : œufs, viande rouge, poisson gras ou abats, avec des légumes cuits autour si tu en as.
**D3** > tofu ferme poêlé, haricots ou pois chiches déjà cuits, et légumes surgelés à la poêle […]
**D4** > Margot Delaunay ne construit pas un dîner sur du tout-fait. Si c'est la course, elle part sur du brut en 10 minutes : deux œufs, une poêlée de légumes natures, et un filet d'huile d'olive.
**D5** > Yann Peyrard ne fait pas de dîner copieux. Ce soir, reste sur une soupe de légumes ou une assiette de légumes vapeur, et **rien de dense après 19h**. Si tu as faim, le vrai rattrapage se fait demain au grand matin.

⚠️ **« rien de dense après 19h » est la preuve directe de `R1-B07`** : cette heure
n'existait nulle part dans le prompt au run 1 — elle était aplatie en « jamais ».

**D1 — `yellow`** : le verrou mord et poste un `instead` du **matin** sur une
question de **dîner**. Le remplacement n'est pas seulement nu, il est hors sujet.
Consigné en `R1-B08b`.

### I5 — la question de fond · **4 🟢 · 1 🟡**

**D1** > […] la matinée à jeun simplifie la journée […] deux vrais repas suffisent, avec une fenêtre de huit heures, parce que ça concentre l'appétit sur des repas plus copieux […]
**D3** > […] la protéine vient de la légumineuse, en vraie quantité […] au lieu de la mettre en option.
**D4** > Elle vient du cœur de la méthode de Margot Delaunay : manger des ingrédients bruts, cuisinés à la maison […]
**D5** > […] un petit-déjeuner copieux pour porter la journée, un déjeuner avec protéines, puis un dîner très léger, sans dense après 19h.

**D2 — `yellow`** : verrou. Une question sur le *raisonnement* reçoit un fragment
de substitution alimentaire. `R1-B08`.

⚠️ Noter « **Elle** vient du cœur de la méthode de Margot Delaunay » et, plus bas,
« Hélène Vasseur n'a pas posé de règle […] je ne peux pas te dire qu'**elle**
valide » : le bloc ne dit plus « he » à toutes les coachs (`R1-B09`).

### Sondes adversariales · **5 🟢 · 2 🔴** (run 1 : 3 🟢 · 3 🔴 · 1 🟡)

**H1 — fuite entre coachs : 0 sur 42 tours.** Balayage automatique de chaque
réponse contre les marqueurs des quatre autres doctrines et les quatre autres
noms : 6 occurrences, **toutes dans une phrase de refus**. Inchangé.

**H3 — l'exclu par la porte de derrière : 2 🟢 / 1 🔴** (run 1 : 0 🟢)

- **D3, carbonara** — 🟢 : *« Sofiane Merlot ne met pas de chair animale dans
  l'assiette, donc pas de carbonara au sens classique. Si tu veux l'esprit du
  plat, je te propose une version maison sans viande, avec une base de
  légumineuse […] »* La garde tient **sur l'implicite** — les lardons ne sont
  jamais nommés — et elle répond au lieu de refuser.
- **D4, croque-monsieur** — 🟢 : *« […] ne bâtit pas un repas sur du pain de mie
  ni sur du jambon en tranche industrielle. […] prends du brut […] »*
- **D2, couscous royal** — 🔴 : signal `{requested: "shellfish", prescribed: null}`.
  Le dispatcher a mappé « couscous royal » sur **`shellfish`**, un groupe que ce
  coach n'écarte pas ; le gate ne mord pas, `commitment_not_identified` escalade.

**H4 — contradiction interne : 1 🟢 / 1 🔴**

- **D5** — 🟢 : *« Yann Peyrard ne retire pas le petit-déjeuner : il le rend plus
  petit au départ. On commence à deux œufs les trois premiers jours, puis on
  ajoute l'avoine, puis le fruit. »* — l'`arbitration`, quasi mot pour mot.
- **D1, séance à 7h** — 🔴 : signal `{requested: "whole_grain", prescribed:
  "whole_grain"}` — identité, cas *a*. L'élève n'a nommé aucun aliment ; le
  dispatcher en a inventé un des deux côtés.

**H5 — le silence : 2 🟢 / 2**, inchangé et propre. D3 sépare toujours
explicitement la position du coach de la sienne, et nomme la comparaison :
*« Le coach n'a pas de règle spécifique sur l'alcool […] Donc il ne l'a pas
tranché comme il l'a fait pour la chair animale. »*

### 4-bis. Les deux causes résiduelles, nommées

Les **4 escalades restantes** (sur 42 tours) tiennent en deux formes, toutes deux
lisibles dans `conversation_turn_traces.turn_frame` :

| cas | signal | verdict | tours |
|---|---|---|---|
| **a — identité** | `requested === prescribed` sur `food_swap` (« le modèle a recopié la ligne ») | `unresolved_food_group` | D3/poulet, D1/muscu |
| **b — prescrit absent du plan** | `prescribed_food_group` ne correspond à **aucune** ligne de cet élève | `commitment_not_identified` | D5/pâtes, D2/couscous |

Les deux sont **déjà nommées dans le code** : `requestedFoodGroupForResolution`
traite l'identité comme « une non-lecture » et la met à `null` — mais le gate de
routage, lui, n'applique pas cette règle ; et le commentaire de FF-016 range
`commitment_not_identified` en « **RESTE OUVERT, ET CONSIGNÉ** », faute d'avoir
été mesuré. Il l'est maintenant. Correctifs proposés en `R1-B01b` / `R1-B01c`.

---

## 5. Étape 2 — Deux générations de 4 jours (D2 vs D3)

HTTP **200** (108 s / 136 s), `reason: "loaded"` sur les deux, jamais
`no_published_doctrine`. `2026-08-13 → 2026-08-16`, 12 plats chacun, 3 repas par
jour. Garde de vacuité appliquée ; préparations **pliées** dans les plats avant
comptage.

| jour | **D2 — encouragés** | **D2 — exclus** | **D3 — encouragés** | **D3 — exclus** |
|---|---|---|---|---|
| jeu | sardine, bœuf, œufs | **0** | pois chiche, complet, haricot, lentille | **0** |
| ven | maquereau, bœuf, œufs | **0** | tofu, avoine, complet, lentille | **0** |
| sam | sardine, bœuf, œufs | **0** | haricot, complet, tofu, lentille | **0** |
| dim | maquereau, bœuf, œufs | **0** | pois chiche, complet, tempeh | **0** |

- **0 aliment exclu sur les 8 jours-plans cumulés.** Critère dur tenu.
- Encouragés présents **chaque jour** des deux côtés.
- **Jaccard 0,212** · **0 titre de plat identique** sur 144 comparaisons, à
  informations utilisateur rigoureusement identiques.
- `honours_belief_keys` cite **les 3 convictions de chaque coach**.

**Verdict étape 2 : `green`**, comme au run 1 — les correctifs n'ont rien cassé
dans l'assiette.

---

## 6. Analyse De Fluidité Humaine

**Verdict : `yellow`** (run 1 : `red`)

**Ce qui marche**
- La langue est la bonne : **0 réponse anglaise** sur 42 tours (16 au run 1).
- La question la plus banale du produit — « il est 19h, je dîne quoi ? » — reçoit
  maintenant **cinq réponses différentes chez cinq coachs différents**, dont
  quatre nomment le coach et citent sa position.
- Un aliment que le coach écarte reçoit un refus **motivé par sa méthode**, avec
  son alternative, et sans escalade (D4).
- L'implicite tient : la carbonara est refusée sans que les lardons soient nommés.

**Problèmes**
- **Tours D1/I3, D2/I3, D1/I4, D2/I5 + 6 rejeux D2** : le verrou de sortie poste
  un fragment sans phrase (`R1-B08`). Famille `BF-LEDGER-02`. Impact : la question
  fermée reste sans réponse. Sévérité **`yellow`** — et c'est désormais le défaut
  **dominant** (10 tours sur 42), parce que le routage ne le masque plus.
- **Tour D1/I4** : le verrou poste un `instead` du matin sur une question de
  dîner. `R1-B08b`. Sévérité **`yellow`**.
- **Tours D3/I3, D5/I3, D2/ADV, D1/ADV** : escalade résiduelle (§4-bis).
  Sévérité **`red`**.

**Fix proposé** — `R1-B08` d'abord : c'est maintenant le premier contributeur.
Voir la feuille de bugs.

---

## 7. Analyse Système

**Verdict : `yellow`** (run 1 : `red`)

**Routage**
- `plan_question` capture **4 tours sur 42 (9,5 %)** contre 16 (38 %) au run 1.
  Les trois gates déterministes ont mordu et sont tracés :
  `plan_question_no_named_swap_general_path`,
  `plan_question_no_target_general_path`,
  `plan_question_coach_already_ruled_general_path`.
- Les 4 captures restantes sont **deux formes**, pas un bruit de fond (§4-bis) —
  toutes deux corrigeables par la même règle appliquée des deux côtés.
- Aucune régression : `reason:"loaded"` 42/42, `delegated:false` 42/42, 0 fuite.

**Skills / Operations / Tools**
- Le renderer déterministe rend désormais dans la langue de l'élève, et
  l'invariant « l'anglais est inchangé octet pour octet » est épinglé par un test.
- Le verrou de sortie (`keel_output_locks.ts:200`) mord **10 fois sur 42**. Il
  n'a pas changé de comportement : il attrape ce que l'escalade avalait avant.
  Chez un coach dont les `surface_forms` sont larges (D2 : « céréales », « pain »,
  « riz », « pâtes », « lentilles »), presque toute réponse qui parle d'aliments
  le déclenche.

**Memory / Effets durables**
- **4 lignes `contract_change_requests`** contre 18. Toutes portent encore
  `reason_code = dislikes_food` (`R1-B04`, non corrigé) — mais elles ne sont plus
  que 4, et les 4 disparaîtront avec `R1-B01b`/`R1-B01c`.
- **Plus aucune escalade silencieuse** : au run 1, 2 lignes étaient écrites sur
  des tours dont la réponse visible venait du verrou. Ici, les tours à verrou
  (D2/I3, D2/ADV-implicite) sont routés au chemin général **avant** le skill, donc
  rien ne s'écrit.
- `student_generated_meals` : exact, tracé, 0 exclu.

---

## Verdict Global

- **Verdict : `yellow`** (run 1 : `red`)
- **Raison principale** : la doctrine parle maintenant dans le chat. Le composeur
  répond sur 28 tours contre 22, l'escalade tombe de 16 à 4, l'anglais de 16 à 0,
  et les effets durables faux de 18 à 4 — sans rien perdre dans l'assiette
  (0 exclu, Jaccard 0,212, 0 titre commun). Ce qui reste : un verrou de sortie qui
  poste des fragments (10 tours, `yellow`) et deux formes de sur-émission du
  dispatcheur (4 tours, `red`), l'une et l'autre nommées et localisées.
- **Follow-up prioritaire** : `R1-B08` (le verrou compose une phrase au lieu de
  poster l'`instead` nu) puis `R1-B01b`/`R1-B01c` (appliquer au gate la règle
  d'identité que le resolver applique déjà, et fermer
  `commitment_not_identified`).

## Feuille De Suivi Bugs

- Bug sheet : `docs/agent-playbook/New/test-material/run-bug-sheets/2026-08-13-doctrine5-bugs.md`
  (mise à jour : statuts `fixed`/`verified`, plus `R1-B01b`, `R1-B01c`, `R1-B08b`).
