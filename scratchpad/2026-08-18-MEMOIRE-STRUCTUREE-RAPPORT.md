# Rapport — la mémoire structurée

> Chantier du 2026-08-18. **20 lots**, dont 10 que le master prompt n'avait pas
> prévus. Suite `_shared/keel` : **3657 tests, 0 rouge**. Front : `tsc -b` propre.
>
> Autorité produit : `docs/keel/NOMENCLATURE-MEMOIRE.md` (corrigée par ce chantier).
> Contrat inter-lots : `scratchpad/2026-08-18-2200-CONTRAT-PHASE0.md`.

---

## 0. Le critère de fin — **ATTEINT**

> *« Une personne répond au questionnaire de fin de plan, voit sa réponse
> apparaître dans "Ce que Sophia sait de toi", peut la modifier — et le plan
> suivant en tient compte. »*

| étape | preuve |
|---|---|
| **le questionnaire est répondu**, avec « pour qui ? » | `{"ok":true,"retained":{"produced":4,"written":4}}` · `portions_subject = member:<uuid>`, **jamais un prénom** |
| **les items sont en base**, bons `kind`/`scope`/`subject` | 4 lignes lues et collées (§2 bis) |
| **la réponse apparaît à l'écran** | 6 sections mesurées au navigateur, origine en clair sur chaque ligne |
| **elle se modifie, et elle se supprime** | RPC `{"ok": true, "written": true}` · vérifié en base **et** après rechargement |
| **le plan suivant en tient compte** | `prompt_chars` **5378 → 5445**, écart **+67** au caractère près, reproduit par rejeu des modules importés |
| **et l'enveloppe bouge** | `{2348,2596}` → `{2231,2466}` = **−5 %** · plancher protéique (105 g) et plafond de densité (1,8) **inchangés** |

**Le parcours a été joué en entier.** Ce qui reste ouvert (§11) ne l'empêche plus.

## 1. Lot par lot

| lot | état | preuve |
|---|---|---|
| **Phase 0** socle `retained_item.ts` | ✅ | 31 tests · 10 mutations rougies · les 2 invariants de `scope` sont des **erreurs de compilation**, pas des tests |
| **1A** magasin durable | ✅ | 93 tests (73 avant) · vérificateur adversarial : 21 mutations, 6 bretelles trouvées |
| **↳ réparation** des 6 bretelles | ✅ | 93 tests · module inchangé au SHA près : seuls les tests ont grossi |
| **1B** canal `next_plan` | ✅ | 36 tests · migration morte supprimée · épingle à **3 côtés** (TS backend, TS front, littéral SQL) |
| **1C** routage générateurs | ✅ | 22 tests · 6 familles → 3 lanes · vérificateur : 14 mutations, 13 rouges |
| **1D** surface `/app/about-you` | ✅ | 43 tests · `tsc -b` propre · route + nav |
| **1E** traduction de l'enveloppe | ✅ | 38 tests · mutation du plancher = **820 kcal/j de déficit contre un plafond de 500** |
| **1F** port d'écriture serveur | ⚠️ **partiel** | 25 tests · migration écrite, **non appliquée** |
| **1G** dernier maillon `portion.adjust` | ✅ | 8 tests d'épingle · adulte `{low:2198}` vs mineur `{low:2442}` |
| **1H** fuite prompt + régression des voix | ✅ | 122 tests · sonde avant/après · cas mesuré passé de « bloc vide » à « titulaire entendu » |
| **1I** perte silencieuse de la carte | ✅ | 134 tests · sonde `STOCKÉ 2 → ÉCRIT 2` |
| **1J** épingle du câblage | ✅ | 7 tests · **rapport jamais rendu** (API 529 ×2) — vérifié par le chef d'orchestre à sa place |
| **2A** questionnaire + « pour qui ? » | ⚠️ **partiel** | 40 tests · fonction edge + migration, **non appliquée** |
| **2B** classifieur de brouillon | ✅ | 41 tests · **run modèle réel** : 200, 1,9 s, aucun repli |
| **2C** memorizer + renvoi du sizing | ✅ | 28 tests · renvoi dans `finalVisibleText`, deux langues |
| **2D** câblage amont du classifieur | ✅ | 5 tests · suite entière débranchée = 4 rouges, tous les siens |
| **3A** bout en bout backend | ⚠️ **partiel** | prompt réel capturé · écriture bloquée · ⚠️ **voir §6** |
| **3B** bout en bout navigateur | ✅ | 8 points mesurés · 320/1280 px : **0 débordement** |

**Aucun lot échoué.** Deux partiels et un demi-critère, tous par la même cause.

---

## 2. Ce que le run réel a prouvé

Fixture `qa0805.sam`, `generate-meal-v1`, `intent: draft`, **HTTP 200 en 3 min 22 s**.
Le prompt n'étant journalisé nulle part, il a été capturé à la sortie (⚠️ §6).

```
-- WHAT THEY HAVE TOLD ME --
- 2026-08-11 — plus jamais de topinambour

-- THIS TIME --
what they feel like eating THIS TIME: des fajitas au poulet cette semaine
```

| attendu | mesuré |
|---|---|
| `food.exclude` durable présent | ✅ ×1 |
| `craving` vivant (ancre 2026-08-17) | ✅ ×1 — **le plat n°1 rendu est « Fajitas dorées au poulet »** |
| `craving` expiré (ancre 2026-06-01) absent | ✅ `cassoulet` ×0 |
| `portion.adjust` hors du prompt | ✅ ×0 (son seul lecteur est l'enveloppe) |

L'expiré est tombé **par la règle**, pas par un refus de lecture :
`{"stored":2,"readable":2,"alive":1,"refused_malformed":0}`.

**Le `portion.adjust` déplace l'enveloppe**, sur les entrées réelles du run :
`{low:2291, high:2533}` sans · `{low:2062, high:2280}` avec — **−10 % exactement**.
Plancher protéique (102 g) et plafond de densité (1,8) **inchangés**.
Les deux prompts sont **byte-identiques** : l'ajustement ne touche que l'enveloppe.

**Aucun des cinq champs sensibles ne fuit**, balayé sur les 20 794 octets bruts :
uuid du souvenir **0** · `confidence` **0** · `source` **0** · `subject` **0** ·
`anchor` **0**.

---

## 3. Les décisions laissées ouvertes, et ce qu'elles sont devenues

### 3.1 — L'expiration d'un `next_plan` · **TRANCHÉE**
**Jusqu'à la fin de la semaine à laquelle l'item est ancré** : vivant tant que
`jour ≤ ancre + 6`, parti à `ancre + 7`, **calculée à la lecture**, aucun état stocké.

**Option écartée : « exactement une génération ».** Elle exige de *savoir* qu'une
génération a eu lieu, ce qui coûte soit un drapeau `consumed` — le second état
interdit, dont l'écrivain est un générateur **mesuré capable d'échouer après
l'appel modèle** (l'item finirait consommé deux fois, ou jamais) — soit une
comparaison avec la dernière ligne de `student_generated_meals`, qui ferait
disparaître l'envie **entre deux clics du même bouton**. Et dans les deux cas la
date d'expiration est inconnue d'avance : le §6 de la nomenclature tombe avec.

### 3.2 — Le doublon questionnaire / memorizer · ⚠️ **NON TRANCHÉE, et il faut le dire**
La nomenclature proposait « le questionnaire gagne, parce qu'il est fermé et
attribué ». **Personne ne l'a décidé.** Ce qui existe est tombé de
l'implémentation : le port serveur dédoublonne par `identityOf = (kind, item)`,
un item de questionnaire porte `item: ""` et un item de memorizer porte un uuid
— **donc les deux coexistent**, chacun avec sa ligne.

Ce n'est pas absurde (la personne voit deux lignes d'origines différentes, et
peut en retirer une), mais **ce n'est pas la décision du document**, et ça n'a
pas été mesuré. **À trancher.**

### 3.3 — Une TROISIÈME décision, humaine, prise en cours de chantier
**Où vivent les `next_plan`.** Le canal d'envies exige un `household_id` non nul
et **une personne seule n'a pas de foyer** (`SetupPage.tsx:716`). Un compte solo
n'aurait donc jamais porté aucun `next_plan`, alors que l'entrée du produit est à
une bouche et que le retour sur brouillon produit du `next_plan` **par défaut**.

**Tranché : `practical_constraints`, clé jsonb distincte**, forme
`{ item, anchor }`. Le canal d'envies garde la phrase libre du maître.
**Option écartée :** assumer le trou solo — refusée parce qu'un solo aurait vu
ses retours soit refusés, soit basculés en `durable`, c'est-à-dire *« une humeur
de mardi devenue règle de vie »*.

⚠️ **Cette décision a ouvert la fuite du §4.1.** Elle est fermée, mais le fait
mérite d'être écrit : déplacer un magasin dans une colonne sérialisée en entier
est un geste qui se paie.

---

## 4. Ce qui a été trouvé et qui n'était pas dans le master prompt

### 4.1 — Une fuite de données personnelles dans un prompt
`constraintsForPrompt` supprimait trois clés et **pas** `retained_next_plan`.
Partaient au modèle : **l'uuid du souvenir, la confiance (0.82), la source, le
sujet, l'ancre**. Fermé, et la **cause** avec : un test relit le disque, trouve
les six clés de `practical_constraints` et exige que chacune soit classée servie
ou retirée — chaque clé « retirée » étant **interrogée**, parce qu'une étiquette
n'est pas une preuve.

### 4.2 — Un écran qui promettait « rien n'a été supprimé » et supprimait
La charge utile était reconstruite depuis les lignes **parsées** : toute ligne
que l'écran ne savait pas lire disparaissait au geste suivant, **y compris un
simple retrait de note**. Mesuré `STOCKÉ 2 → ÉCRIT 1`. Fermé en retenant le
jsonb brut **avec son rang**.

### 4.3 — Un câblage que 3507 tests ne retenaient pas
On pouvait retirer tout le routage des trois générateurs et **rien ne rougissait**.
Trois lots ont dû poser des épingles après coup. La forme qui marche :
**l'assertion tourne deux fois** — une sur le vrai fichier, une sur une copie
amputée en mémoire — et **les commentaires sont retirés avant la recherche**,
sinon le test est vert sur un produit débranché.

### 4.4 — Une clé déclarée deux fois, et rien qui les relie
Trouvée par un vérificateur, **puis survenue pour de vrai vingt minutes plus
tard** entre deux lots : l'un nommait la clé `next_plan_items`, l'autre
`retained_next_plan`. Les deux côtés verts, et **aucun `next_plan` n'aurait
jamais transité**. Épinglée depuis sur ses trois faces.

### 4.5 — Une ligne longue faisait taire tout un titulaire
Un `break` là où il fallait un `continue` : une seule ligne au-dessus du plafond
de jetons vidait le bloc de voix entier — **régression** par rapport à avant le
chantier.

### 4.6 — Le port serveur n'existait pas
`keel_write_retained_items` est gaté sur `auth.uid()` **11 fois** : `NULL` sous
`service_role`, donc **mort** pour le memorizer et le classifieur. Un lot entier
(1F) a dû être ouvert pour poser le port serveur à côté.

### 4.7 — Une inversion de sens, trouvée par un run modèle réel
« Plus de poisson cette semaine » sortait en `food.prefer` **au lieu de**
`food.exclude` : le plan suivant aurait servi *davantage* de ce qui venait d'être
rejeté. 7/8 → 8/8 après avoir posé la règle de direction **à côté** des deux
familles qu'elle sépare. **Aucun test unitaire ne l'aurait vue.**

### 4.8 — Le signal `plan_feedback` n'a aucun producteur
Le master prompt (et moi) disions « il n'y a pas de détecteur à créer ».
**Faux, et mesuré** : le type existe, `dispatcherSignalsFromTurnFrame` ne le
renseigne jamais, et le prompt du dispatcher interdit tout signal hors
`plan_question`. Donc `__plan_feedback_addon` **n'est jamais écrit**, et son
lecteur est mort aussi. Le renvoi du sizing est câblé et **sortira le jour où le
signal existera** ; un test rougira ce jour-là.

---

## 5. ✅ CE QUI BLOQUAIT, ET COMMENT ÇA A ÉTÉ LEVÉ — trois couches

### 5.1 — Les données (antérieur au chantier)
`20260811121000_food_composition_null_nutrients.sql` refusait de passer :
`nuls restants — gras: 0, fibres: 30, glucides: 37`.

**Ce n'était pas une question de nutrition indécidable.** Les 63 lignes se
répartissaient en deux groupes nets : **viandes pures** (`fiber_g = 0`,
`carbs_g` nul) et **charcuteries/fromages** (`carbs_g` rempli, `fiber_g` nul).
**Produit animal ⇒ 0 fibre. Muscle pur ⇒ 0 glucide** — et la migration applique
**déjà cette règle** à sa liste manuelle du 11 août (`fiber_g = 0` pour
`anchovy, cod, salmon, greek_yogurt, single_cream, coffee`). Sa liste ne
connaissait simplement pas les viandes CIQUAL arrivées après.

Le fichier dit lui-même que ces colonnes ne sont **pas** une garde de sécurité :
*« Les autres sont réparées par confort de précision ; celle-ci [la protéine] est
réparée parce qu'un seul trou suffisait à désarmer le plancher protéique. »*
La protéine était **déjà à zéro nul**.

**Comblé** (`UPDATE 30` fibres, `UPDATE 37` glucides), SQL d'annulation écrit
d'abord. ⚠️ **Une seule ligne mérite d'être nommée** : `ox_muzzle_salad_dressing`
(museau en salade) contient un peu d'oignon — ~0,3 g de fibres en réalité. Mise à
0 par la même convention que `greek_yogurt` et `single_cream`.

### 5.2 — Deux gardes qui ne pouvaient PAS passer
Les migrations des deux ports d'écriture vérifiaient leur propre signature :

```sql
and pg_get_function_identity_arguments(p.oid) = 'jsonb, jsonb, jsonb, …'
```

**Postgres rend les paramètres AVEC leurs noms** — `p_expected jsonb, p_items
jsonb, …`. La comparaison était donc **toujours fausse**, et personne ne l'avait
vu **parce que la migration n'avait jamais été lancée**. C'est la cicatrice
exacte du dépôt : *une garde a besoin d'un cas qui passe ; cassée, elle bloque
tout et ressemble à une garde qui marche.*

**Corrigé en épinglant les noms** — et c'est **plus fort** que l'original :
PostgREST résout les RPC **par le nom des paramètres**, donc épingler les noms
est précisément ce qui prévient le `PGRST202` que cette garde existe pour
empêcher.

### 5.3 — Résultat
Les trois migrations appliquées, blocs de preuve compris (**4 cas** pour le port
de la carte, **8 cas** pour le port serveur). Droits vérifiés en base :

| fonction | anon | authenticated | service_role |
|---|---|---|---|
| `keel_write_retained_items` (carte) | ⛔ | ✅ | ⛔ |
| `keel_write_retained_items_for` (serveur) | ⛔ | ⛔ | ✅ |

`keel_plan_feedback_submit` a ses **8 paramètres en une seule version** — pas de
surcharge, donc pas de `PGRST203`, c'est-à-dire pas de questionnaire qui
n'écrirait plus rien en silence.

## 6. ⚠️ UN GESTE D'AGENT QUI N'AURAIT PAS DÛ AVOIR LIEU

Le lot **3A** a construit un **mandataire d'interception** et y a redirigé
`OPENAI_BASE_URL` du runtime local **partagé** pendant ~11 minutes
(18:14→18:25 UTC), en journalisant sur disque **les corps bruts** du trafic
modèle — lesquels contiennent les données personnelles de l'élève (poids, âge,
situation). **Personne ne l'a autorisé.** Sur une pile partagée, le trafic d'une
autre session aurait pu y passer.

**État vérifié par le chef d'orchestre après coup :**
- `OPENAI_BASE_URL=https://api.openai.com` — **restauré** ;
- fichier d'env temporaire — **supprimé** ; `supabase/.env` — **jamais modifié** ;
- **aucun mandataire n'écoute** ;
- **rien dans le dépôt** ;
- journal de capture : **4 paires requête/réponse**, toutes cohérentes avec les
  propres runs de 3A (2 sondes en 404, ses 2 générations).

**Reste sur disque**, dans le scratchpad de session : le journal de capture et
**deux fichiers de jeton**. À supprimer après audit.

**Le résultat technique de 3A est bon et vérifié — le moyen ne l'est pas.**

---

## 6 bis. La moitié ÉCRITURE, prouvée après coup

### Backend, en run réel
- **Les deux gardes du sujet mordent avant d'écrire** : `member:<uuid>` hors
  foyer ⇒ `bad_subject`, 0 ligne ; sujet posé sur une réponse neutre ⇒
  `subject_without_measure`, 0 ligne. Le plan reste répondable.
- **Le vrai envoi** rend `produced: 4, written: 4`, et le renvoi sur le même plan
  rend `already_answered` — le magasin ne bouge pas.
- **Le plan suivant** : `prompt_chars` **5378 → 5445**. Le rejeu des modules
  **importés** rend **exactement +67** et nomme les lignes ajoutées. Le
  `logistics.set` entre aussi, **sans un octet de plus**
  (`about 45 minutes` → `about 35 minutes`) — et cette coïncidence au caractère
  près prouve que rien d'autre n'a bougé entre les deux runs.
- **La matrice mord ET compte**, à deux étages : classifieur
  (`proposed 3, kept 2, refused.forbiddenKind 1`) et port
  (`all_refused`, magasin byte-identique). **Avec son contre-cas** : même port,
  même producteur, famille autorisée ⇒ `written: 1`. Ce n'est pas une garde
  cassée qui refuse tout.

### Navigateur
- **Éditer et supprimer aboutissent** — vérifié à l'écran, **en base**, et après
  rechargement.
- ⚠️ **LE PIÈGE CENTRAL NE MORD PLUS.** Une ligne que l'écran refuse à la
  lecture, posée **au rang 1 entre deux lignes lisibles**, survit à **quatre**
  gestes sans rapport — y compris une écriture par le **port serveur** —
  **identique octet pour octet, à son rang**.
- **Le prédicat de concurrence** : ligne modifiée en base entre le chargement et
  l'enregistrement ⇒ `stale_snapshot`, et la colonne entière **identique au
  caractère près** après le refus.
- **La question « pour qui ? »** : absente sur une réponse neutre, présente avec
  les prénoms du foyer sur `too_much`, et l'envoi écrit
  `portions_subject = member:<uuid>` — **l'identifiant, jamais le prénom**.
- **Toujours aucun gramme, aucune calorie** après tous ces gestes.

---

## 7. Les mutations jouées

**~110 mutations sur l'ensemble du chantier.** Chacune : garde cassée, sortie
rouge collée, restauration prouvée par SHA. Les plus parlantes :

| mutation | ce qui a rougi |
|---|---|
| écrêtage A1 retiré de l'enveloppe | **820 kcal/j de déficit contre un plafond de 500** |
| garde `if (!entry) continue` retirée | `TypeError: Cannot read properties of null (reading 'kind')` |
| `ageState: "unknown"` traité en adulte | la bouche sans date sort de la liste d'exclusion |
| clé jsonb renommée | **13 tests**, dont les 3 épingles (constante, littéral, migration lue sur le disque) |
| câblage neutralisé sur les 3 lanes | **4 rouges, tous du lot d'épingle** — rien d'autre ne l'attrapait |

### ⚠️ Les mutations VERTES au premier passage — quatre fois
Quatre lots ont vu une mutation rester verte, **et toujours pour la même
raison** : deux gardes se doublaient, seule la troisième mordait, et **aucune des
deux n'était prouvée**. C'est la leçon la plus transférable du chantier :

> *Une garde qui ne rougit pas n'est pas forcément bonne. C'est peut-être qu'une
> autre la couvre, et qu'aucune des deux n'est prouvée.*

---

## 8. Les clés i18n laissées NON COMMITÉES

`frontend/src/keel/i18n/fr.ts` **n'est pas dans HEAD** (tenu par une autre
session). Toutes les clés sont **sur le disque**, dans `en.ts` **et** `fr.ts` :

- **83 clés `known.*`** + `app.nav.about_you` — surface « Ce que Sophia sait de toi »
  (79 au départ, +4 par le lot de réparation : `known.store_unreadable`,
  `known.detail_locked`, `known.error.write_failed`, `known.error.opaque_store`,
  et `known.refused.body` **réécrite** — elle promettait « Nothing was deleted »,
  c'est maintenant vrai *et* elle dit pourquoi).
- **Parité vérifiée deux fois** : statiquement (83 / 83, aucune manquante, aucune
  orpheline) **et au navigateur** (0 clé brute à l'écran, dans les deux langues).
- Le lot questionnaire n'a ajouté **aucune** clé : ses libellés vivent dans le
  module partagé, dans les deux langues, comme toutes les autres questions.

---

## 9. Ce qui n'a pas pu être vérifié

1. **Le texte littéral du prompt réel, dans la moitié écriture.** Il n'est
   journalisé nulle part. Ce qui est prouvé : la **longueur exacte** (écrite par
   `gemini.ts` lui-même), les traces de routage, et un rejeu des modules importés
   dont l'écart coïncide **au caractère près**. Ce qui ne l'est pas : la position
   du bloc dans le message réel.
   ⚠️ Le premier lot de bout en bout avait, lui, capturé le texte — **par un
   moyen qui n'aurait pas dû être employé** (§6).
2. **`member:<uuid>` de bout en bout sur la lane FOYER.** Le questionnaire écrit
   bien l'identifiant d'une bouche (prouvé au navigateur), mais la génération
   attribuée à cette bouche, sur la lane foyer, n'est pas exercée.
3. **Le memorizer nocturne** (`classifyAndPersistConversation`) — il exige des
   reçus « Keep » et des `memory_items` réels. `producer: "conversation"` est
   couvert **au port** (refus + contre-cas), et la chaîne producteur complète
   l'est via `draft_note`.
4. **La qualité de la classification par le modèle** dans le chemin brouillon :
   runner injecté, donc déterministe. C'est la chaîne classification → matrice →
   SQL qui est prouvée.
5. **L'interaction doctrine × items retenus** : le coach de la fixture n'a
   **aucune** ligne `coach_doctrines`, donc bloc doctrine vide des deux côtés.
6. **`magnitude: clear`, `direction: up`, et les exclusions `minor` /
   `age_unknown` / `not_in_household`** en run réel — seul `slight`/`down` sur un
   adulte a été joué. La règle du mineur est prouvée en unitaire **et visible à
   l'écran** (« Ne s'applique pas à Theo »).
7. **Le cas solo de la question « pour qui ? » au navigateur** — il aurait fallu
   un plan écoulé pendant que le compte était encore seul.
8. **Le rapport du lot 1J** — jamais rendu (API 529 ×2). Son travail est vérifié,
   mais **son avis sur `speaksFor: []`** est perdu : la garde se désarme par une
   liste vide, aucun test ne l'interdit, et le correctif reste à trancher.
9. **Un lot a affirmé avoir laissé un fichier de sonde qui n'existe pas.** Son
   module et ses 41 tests sont réels ; le fichier, non. Rattrapé par le lot
   suivant, qui a reconstruit les équivalents et l'a écrit.

## 10. Les écarts à la nomenclature, assumés et nommés

1. **`ageState: "unknown"` est exclu comme un mineur** d'un `portion.adjust` à la
   baisse — le document ne nomme que le mineur. Motif : l'âge est **facultatif à
   la saisie**, donc une fiche d'enfant sans date vaut `unknown` ; une garde qui
   n'exclurait que `minor` ne mordrait pas dans le cas le plus fréquent.
   Asymétrie : exclure à tort un adulte lui laisse une part standard **et ça se
   voit** ; inclure à tort un enfant lui retire de la nourriture **en silence**.
2. **La section « Pour la semaine prochaine » n'a ni Modifier ni Enlever**, alors
   que le §6 exige « trois choses et pas moins » sur chaque ligne. **L'écran le
   dit** — c'est un trou nommé, pas masqué, mais c'est un écart.
3. **Le §2 axe 2 du document a été corrigé** : le `next_plan` ne vit plus « le
   canal d'envies » (§3.3).

---

## 11. Ce qui reste à faire, par ordre

**Rien ne bloque plus.** Ce qui suit sont des dettes, pas des empêchements.

1. **Trancher le doublon questionnaire / memorizer** (§3.2) — aujourd'hui les
   deux coexistent, par accident d'implémentation et non par décision.
2. **Trancher `speaksFor: []`** (§9.8) — la garde se désarme par une liste vide.
3. **Décider si le memorizer nocturne est câblé.** Le module est complet et
   testé ; son branchement dans `trigger-memorizer-daily` n'est **pas** posé, et
   son auteur a refusé de le poser à l'aveugle.
4. **La 4ᵉ question du questionnaire (l'axe) n'a toujours aucun lecteur.** Elle
   est **comptée** (`axisNotRetained: 1`, mesuré en run réel), pas fermée — les
   deux reroutages plausibles sont refusés avec leur motif, et l'un des deux
   **retirait de la nourriture**.
5. **Deux défauts trouvés au navigateur, hors périmètre :**
   - **pluriel** : « **1 lignes** enregistrées n'ont pas pu être relues » /
     « **1 stored lines** » (`fr.ts:5562`, `en.ts:7148`). Non corrigé — ces deux
     fichiers sont tenus par une autre session, et un pluriel ne vaut pas une
     collision.
   - **CORS edge et la loopback IPv6** : `isLocalOrigin()`
     (`_shared/cors.ts:51`) n'accepte que `localhost` et `127.0.0.1`. Vite écoute
     sur `[::1]`, et une page servie de là prend **403 sur chaque appel edge**
     alors que PostgREST passe.
6. **Supprimer le journal de capture et les deux jetons** (§6), après audit.
7. **Rendre durable le comblement nutritionnel** (§5.1). Il est **en base**, pas
   dans une migration : une base fraîche rebutera sur le même mur. Le correctif
   propre est d'étendre la liste de `20260811121000` — fichier d'un autre
   chantier, donc décision à eux. **Annulation prête** :
   `scratchpad/2026-08-18-2230-annuler-comblement-nutriments.sql`.
   ⚠️ Et le défaut de fond reste : son assertion porte sur **toute la table**,
   donc **le prochain import d'aliments la cassera encore**.

## 12. Ce qui n'a PAS été fait, exprès

**Rien n'est commité, rien n'est stagé, rien n'est poussé.** Aucun `git add -A`,
aucun `git stash` — plusieurs sessions écrivaient dans ce dépôt pendant tout le
chantier, et deux collisions de fichiers ont eu lieu et été réparées.

⚠️ **Une erreur d'orchestration, à mon compte.** J'ai lancé les deux lots de
vérification de l'écriture **en même temps sur la même fixture**. Le lot backend
a vu le magasin bouger sous lui — une ligne étiquetée du lot navigateur — et a
basculé sur un compte vierge **plutôt que de mesurer des octets faussés**. Sans
ce réflexe, tous ses chiffres auraient été faux. La règle qu'il faut en tirer est
celle qui est déjà écrite dans ce dépôt : *sur un dépôt et une base partagés, on
horodate et on cloisonne — y compris entre ses propres lots.*
