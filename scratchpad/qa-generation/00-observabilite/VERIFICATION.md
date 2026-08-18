# 0V — vérification de l'instrument du lot 0A

**2026-08-18, 21:00–21:15 UTC** · branche `ff-001-quotidien-du-coach` · pile locale
Périmètre : l'instrument, pas le produit. Aucun correctif de code livré ; deux mutations
temporaires, remises en état et prouvées par empreinte.

---

## VERDICT

**Oui, on peut bâtir cinq étapes de mesure dessus — après un geste d'exploitation et avec
deux réserves écrites.**

Ce qui est archivé **est** le texte qui a produit la sortie, y compris quand le modèle
retombe : je l'ai provoqué et tranché sur les empreintes, pas sur le code. Le piège n°1 est
**écarté**.

Ce qui manque avant de mesurer :

1. **⛔ BLOQUANT D'EXPLOITATION (déjà réparé par moi, à connaître)** — l'instrument était
   **mort** en arrivant : `service_role` n'avait plus `INSERT` sur la table. 52 écritures
   refusées, aucune trace nulle part. Rendu à l'état que la migration appliquée déclare.
2. **La garde du script ne mord que d'un côté** (défaut réel, mesuré par mutation) : elle
   voit une capture raccourcie **en amont**, elle est **muette** sur une capture raccourcie
   **en aval**. Correctif : 3 lignes, décrit au §3.
3. **Un écart archive↔fil existe, latent** : le mode JSON d'OpenAI **réécrit les deux
   textes après la capture**. Nul aujourd'hui sur les trois lanes (mesuré), mais rien ne le
   tient : un prompt qui perdrait le mot « json » ferait diverger l'archive en silence.

---

## Les 7 pièges

| # | Piège | État |
|---|---|---|
| 1 | Repli de modèle | ✅ **vérifié — pas de défaut** (repli réel provoqué) |
| 2 | Capture au mauvais moment | ⚠️ **défaut trouvé** — mutation nommée, impact nul ce jour, non gardé |
| 3 | Compteur circulaire | ⚠️ **défaut trouvé** — garde borgne, prouvée par deux mutations |
| 4 | Sources dérivées | ✅ **vérifié** — chaque appel porte son prompt |
| 5 | Troncature muette | ✅ **vérifié** |
| 6 | Effet de bord sur la production | ✅ **vérifié deux fois**, dont une en conditions réelles subies |
| 7 | Script de vidage | ⚠️ **défaut mineur** — `--source` sans correspondance vide silencieusement une autre lane |

Hors grille, trouvé en chemin : ⛔ **l'écriture était coupée en base** (§0) et
📌 **le BRIEFING attribue le repli à la mauvaise lane** (§8).

---

## §0 — ⛔ L'instrument était mort en arrivant

Ma toute première écriture est revenue en `42501 permission denied for table
llm_raw_response_events`, **avec la clé `service_role`**.

```
    grantee    |                  string_agg                       <- état trouvé
---------------+---------------------------------------------------
 authenticated | SELECT
 service_role  | DELETE,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE   <- INSERT absent
```

Origine, dans les journaux du conteneur — une commande **manuelle**, jamais annulée :

```
[local] 2026-08-18 20:29:45.176 UTC [15554] postgres@postgres LOG:  statement:
        revoke insert on public.llm_raw_response_events from service_role;
```

Aucun `grant` ne suit. Entre 20:29:45 et 21:00 UTC : **52 `permission denied`** côté
PostgREST, et **zéro signal ailleurs** — pas d'exception, pas de log applicatif, rien.
`llm-raw-trace.ts:167` fait `await admin.from(...).insert({...})` **sans lire `.error`** :
un refus PostgREST n'atteint même pas le `catch`, il est simplement jeté. L'instrument
tombe donc **sans bruit**, et la seule façon de s'en apercevoir est d'interroger la table
et de n'y rien trouver.

Il reste en base une ligne `request_id = 0v-trunc-2030`, source `0v-verification.truncation`,
posée à **20:28:17 UTC** — soit 88 secondes avant le `revoke`. Ce n'est pas moi (j'ai
commencé à 20:57). Un run de vérification antérieur a donc été interrompu juste après avoir
coupé l'écriture. Je l'ai laissée : ce n'est pas ma ligne.

**Geste que j'ai fait** (retour à ce que la migration `20260818271500` déclare en toutes
lettres, ligne 107 `grant all ... to service_role`) :

```bash
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
  -c "grant insert on public.llm_raw_response_events to service_role;"
```

État après, revérifié : `anon` et `public` à zéro sur les cinq privilèges,
`authenticated` = `SELECT` seul, `service_role` complet. **Aucun rôle n'a gagné d'accès.**

> **À retenir pour la suite du chantier** : avant tout run de mesure, faire
> `select has_table_privilege('service_role','public.llm_raw_response_events','insert');`
> Une capture morte et une capture vide rendent exactement le même écran.

---

## §1 — ⚠️ LE REPLI DE MODÈLE : provoqué pour de bon, tranché sur les octets

**Réponse : le texte archivé est bien celui qui a produit la sortie. Pas de défaut.**

### Le montage

Je n'ai pas simulé le repli, je l'ai **fait arriver**, sur le vrai `generateWithGemini`
importé du dépôt et non modifié. Le harnais
(`2026-08-18-2300-0v-wire-vs-archive.ts`) lève un **vrai serveur HTTP** sur
`127.0.0.1:8899`, le désigne comme `OPENAI_BASE_URL`, et **enregistre les octets lus sur la
socket**. L'écriture de trace, elle, part dans la **vraie** table locale. La comparaison est
donc : *ce que le serveur a reçu* contre *ce que la base a gardé*, par SHA-256.

`gpt-5.6-sol` ne répond pas avant l'expiration ; la chaîne passe au maillon suivant.
(Le délai est ramené à 1,5 s au lieu de 240 s : c'est **le même chemin de code**,
`makeTimeoutSignal` → `AbortError` → `continue`.)

### Ce que le fil a emporté — les deux appels

```
n=1  model=gpt-5.6-sol   servi: expiration (aucune réponse)
     instructions sha256 = 69f5f274…791d34f   (66 car.)
     input        sha256 = 307870c8…c8112099  (68 car.)

n=2  model=gpt-5.4-mini  servi: 200 — C'EST CET APPEL QUI A PRODUIT LA SORTIE
     instructions sha256 = 69f5f274…791d34f   (66 car.)   ← IDENTIQUE
     input        sha256 = 307870c8…c8112099  (68 car.)   ← IDENTIQUE
```

### Ce que la base a gardé

```
    t     |      status      |    model     | ci | sc |             sys_sha
----------+------------------+--------------+----+----+---------------------------------
 20:59:47 | attempt_start    | gpt-5.6-sol  |  0 | 66 | 69f5f274…791d34f   ← porte le prompt
 20:59:49 | timeout_or_abort | gpt-5.6-sol  |  0 |    |
 20:59:49 | attempt_start    | gpt-5.4-mini |  1 |    |
 20:59:49 | success          | gpt-5.4-mini |  1 |    |
```

`69f5f274…` en base **=** `69f5f274…` sur le fil du **second** appel, celui qui a rendu le
texte. Le repli **ne reconstruit ni ne raccourcit** le prompt.

**Pourquoi, et c'est structurel** : `systemPrompt` et `userMessage` sont les paramètres de
`generateWithGemini` et **ne sont réassignés nulle part** (vérifié : `grep -n "systemPrompt =\|
userMessage ="` sur les 2828 lignes → **aucune occurrence**). La charge Gemini (`payload`,
`gemini.ts:921`) est construite **avant** la boucle et n'est mutée dans aucune itération.
Chaque maillon de la chaîne repart des mêmes deux chaînes en mémoire.

### Testé aussi : le repli qui **change de fournisseur**

`gpt-5.4-mini` → 500 → `gemini-3-flash-preview` (URL en dur, interceptée au niveau `fetch`) :
empreintes **identiques** sur les deux jambes et en base. Le passage OpenAI→Gemini ne
déforme pas non plus le texte.

### Le seul reste, et il est d'étiquette

La ligne qui porte le prompt nomme `gpt-5.6-sol` — **le modèle qui a échoué**. Le script,
lui, annonce le bon (`modèle: gpt-5.4-mini`, il lit `resultRow`), et `output.json` porte les
deux (`prompt.captured_on_event.model` vs `result.model`) plus la liste des événements avec
`carries_prompt`. Un lecteur qui interroge **la base directement** en tirant `model` de la
ligne du prompt lira le mauvais modèle. **À dire aux agents 1–5** ; pas un défaut du lot.

Preuve : `2026-08-18-2310-0v-preuves/0v-fallback-0v0000aa.json`,
`0v-gemini-leg-0v0000aa.json`.

---

## §2 — ⚠️ Capture au mauvais moment : une mutation existe entre la capture et le `fetch`

**Défaut trouvé.** La capture (`takePromptOnce`, `gemini.ts:1043-1053`) prend les chaînes
**telles que reçues en paramètre**. Le chemin OpenAI les **réécrit ensuite**, dans
`ensureOpenAIJsonModeInstruction` (`gemini.ts:549-567`), appelé depuis
`callOpenAIResponses` (`:586`) et `callOpenAI` (`:663`) — c'est-à-dire **après** la capture
et **avant** le `fetch`.

Quand `jsonMode` est vrai et que le texte ne contient pas `\bjson\b` (insensible à la casse) :

- système : `"\n\nReturn valid JSON only."` **ajouté à la fin** ;
- utilisateur : `"Return valid JSON only.\n\n"` **ajouté au début**.

Mesuré, scénario `jsonmode` (mêmes prompts, mot « json » retiré) :

| | archive (base) | fil (socket) |
|---|---|---|
| système | 77 car. — `112e5d11…5ff62bdb` | **102 car.** — `94a89942…3fcd1ab8` |
| utilisateur | 69 car. — `525bfcd7…e430b386` | **94 car.** — `f15795f6…9d657d0f3` |

L'archive et le fil ne portent **pas** le même texte. La colonne est le **paramètre**, pas
l'octet envoyé.

Second écart, plus petit, sur le chemin Gemini : `gemini.ts:959` fait
`systemPrompt.toString().trim()` avant de le poser en `systemInstruction`. Un prompt bordé
d'espaces partirait donc rogné, l'archive non.

### Ce que ça vaut aujourd'hui — mesuré, pas supposé

Sur les **8 lignes réelles** archivées (les 3 lanes), les deux champs contiennent le mot
« json » et aucun n'a d'espace de bordure :

```
               source               |  sc   |  uc  | sys_json_ci | usr_json_ci | sys_trim | usr_trim
------------------------------------+-------+------+-------------+-------------+----------+----------
 generate-meal-v1                   | 14382 | 5752 | t           | t           | f        | f
 generate-meal-v1.composition_retry | 14382 | 5988 | t           | t           | f        | f
 generate-household-meal-v1         | 15486 | 7158 | t           | t           | f        | f
 generate-week-plan-v1              |  3285 | 2349 | t           | t           | f        | f
 …
```

⚠️ Le mot est en **MAJUSCULES** dans les prompts : `~ '\yjson\y'` (sensible à la casse) rend
`false` partout et ferait conclure l'inverse. Il faut `~*`. `containsJsonWord` utilise
`/\bjson\b/i`.

**Donc : écart = 0 octet aujourd'hui sur les trois lanes.** Mais c'est un invariant **non
gardé** : un agent qui reformule un prompt et en retire le mot « json » fait diverger
l'archive du fil de 25 caractères par champ, **sans que rien ne le dise** — et un chantier
qui mesure l'effet des mots du prompt commenterait alors un texte que le modèle n'a pas eu.

**Correctif proposé (à arbitrer, je ne l'ai pas fait)** — capturer **après** le façonnage,
ou, moins invasif : deux colonnes `*_wire_chars` remplies par `callOpenAI`, et une garde
d'égalité. À défaut : un test qui affirme que les prompts des 3 lanes contiennent `\bjson\b/i`
dans les deux champs — 5 lignes, et il mord au premier reformulage.

---

## §3 — ⚠️ Le compteur « indépendant » : la garde ne mord que d'un côté

### Les deux nombres viennent-ils de deux origines distinctes ?

**Non — de deux expressions, dans le même fichier, sur la même variable en mémoire :**

- colonne : `boundedPrompt(evt.system_prompt, limit).chars`, où
  `evt.system_prompt = String(systemPrompt ?? "")` (`gemini.ts:1050`) ;
- « compteur indépendant » : `metadata.system_prompt_chars = String(systemPrompt ?? "").length`
  (`gemini.ts:1018`).

Les deux sont évalués **dans le même appel synchrone** de `logRawGenerationEvent`
(`:1085` et `:1086`), sur la même chaîne. Ils ne peuvent diverger que si quelque chose
s'intercale **entre** eux. Ce qui est **en aval** de `boundedPrompt` — c'est-à-dire tout ce
qui pourrait raccourcir le **texte** sans toucher au **nombre** — leur est invisible : la
garde compare `chars` à `chars`, jamais `length(system_prompt)` à `chars`.

### Mutation A — raccourcir en amont : **la garde crie** ✅

`gemini.ts:1050` → `String(systemPrompt ?? "").slice(0, -1)`

```
système    : 76 car. → /tmp/0v-dump-mutA/prompt-system.txt

⚠️ ÉCART avec le compteur indépendant — la capture ment:
  - system_prompt: colonne=76 vs compteur indépendant=77
SCRIPT EXIT=2
```

Elle nomme le champ et sort en 2. **Garde vue mordre.**

### Mutation B — raccourcir en aval : **la garde est muette** ⚠️

`llm-raw-trace.ts:67` → `return { text: text.slice(0, -1), chars: text.length, truncated: false }`
(le texte perd un caractère, le nombre garde l'original — exactement ce que ferait une
troncature de transport, de colonne, ou d'un futur `redacted()` appliqué aux prompts).

En base, les **deux** champs sont amputés et le drapeau reste faux :

```
 sc | sw | uc | uw | st
----+----+----+----+----
 77 | 76 | 69 | 68 | f
```

Le script, lui :

```
système    : 77 car. → /tmp/0v-dump-mutB/prompt-system.txt   (fichier = 76 car.)
utilisateur: 69 car. → /tmp/0v-dump-mutB/prompt-user.txt     (fichier = 68 car.)

Longueurs confirmées par le compteur indépendant de gemini.ts.
SCRIPT EXIT=0
```

**« Longueurs confirmées » sur deux fichiers amputés.** Et le plus net : `output.json`
**contient déjà le nombre qui aurait crié** — `system_prompt_written_chars: 76` face à
`system_prompt_chars: 77` — mais il n'est **jamais comparé**.

**Correctif proposé (3 lignes, `scripts/export_llm_prompt_dump.mjs:362`)** : ajouter à
`mismatch` le cas `!truncated && written_chars !== chars`. Ce test-là n'est pas circulaire :
il oppose le **texte réellement rendu** au nombre déclaré.

### Remise en état — prouvée

```
supabase/functions/_shared/gemini.ts: OK
supabase/functions/_shared/llm-raw-trace.ts: OK      (shasum -a 256 -c, empreintes d'avant)
```

Le `git diff` restant sur ces deux fichiers (29 + 41 lignes) est **le lot 0A lui-même**,
non commité ; aucune ligne de moi. Aucun autre run n'a touché la table pendant les ~2 minutes
de mutation (vérifié : 0 ligne non-`0v` entre 20:58 et 21:03 UTC).

### Les 6 tests unitaires de 0A

Verts (`6 passed`), et **non circulaires** : valeurs attendues littérales, plafond passé en
dur (`120_000`, `100`), jamais tiré de `maxChars()`. Ils couvrent bien les trois états
absent/entier/coupé. Ils ne disent **rien** du fil ni de l'écrivain réel — c'est la brèche
que la mutation B occupe.

---

## §4 — ✅ Sources dérivées : chaque appel modèle porte son prompt

`promptTraceWritten` est déclaré **à l'intérieur** de `generateWithGemini` (`gemini.ts:1042`) :
le jeton est **par appel**, pas par requête. Chaque relance étant un appel distinct, elle
obtient sa propre ligne.

Confirmé en base sur un run réel — deux lignes de prompt pour un seul `request_id`, avec un
message utilisateur **différent** :

```
 generate-meal-v1                   | sys 14382 | usr 5752
 generate-meal-v1.composition_retry | sys 14382 | usr 5988   ← +236 car. (le 1er plan recollé)
```

Les **6** points d'appel modèle des trois lanes passent tous par `generateWithGemini`
(`generate-meal-v1` : 1825, 1940, 2225 ; `generate-household-meal-v1` : 3822, 3990 ;
`generate-week-plan-v1` : 793). Aucun autre chemin vers un fournisseur (`generateEmbedding`,
`searchWithGeminiGrounding` : absents de ces trois fichiers). **Aucun second appel non capturé.**

`generate-household-meal-v1.protein_anchor_retry` n'a pas de ligne réelle en base — il ne
s'est pas déclenché sur les runs de 0A. Le mécanisme est le même que `composition_retry`,
qui est prouvé.

---

## §5 — ✅ Troncature muette : le drapeau se lève, la longueur est celle d'avant

Bout en bout, à travers le vrai écrivain, plafond posé à 500 :

```
   sc  | sw  | st |  uc  | uw  | ut | meta_sc | meta_uc
 ------+-----+----+------+-----+----+---------+---------
  1267 | 500 | t  | 1269 | 500 | t  | 1267    | 1269
```

`chars` porte **1267**, la longueur **avant** bornage, pas 500. `truncated` est vrai sur les
deux champs. Le script le rend visible :

```
système    : 1267 car. ⚠️ COUPÉ au plafond → …/prompt-system.txt
utilisateur: 1269 car. ⚠️ COUPÉ au plafond → …/prompt-user.txt
```

Réserve de forme : il imprime quand même « Longueurs confirmées » **après** les deux ⚠️, et
sort en 0. La ligne d'acquittement finale peut se lire comme un feu vert. Cosmétique.

En exploitation : `SOPHIA_LLM_RAW_TRACE_MAX_CHARS=120000` dans le conteneur edge, prompts
réels 3 k–16 k. Marge ×7.

---

## §6 — ✅ Effet de bord sur la production : nul, prouvé deux fois

**(a) En conditions réelles subies.** Mon premier run est passé **pendant** la coupure du
§0 : chaque insert refusé en `42501`, et pourtant

```
"returned": "{\"ok\":true,\"produced_by\":\"gpt-5.4-mini\"}",
"threw": null
```

La génération aboutit, l'appel modèle a lieu, la valeur remonte. Zéro ligne en base.

**(b) Capture injoignable.** `SUPABASE_URL` pointé sur un port mort (`127.0.0.1:59999`) :
génération rendue en **314 ms**, `threw: null`, aucune ligne écrite.

Le drapeau éteint est propre aussi : `logLlmRawResponseEvent` sort au premier test
(`llm-raw-trace.ts:158`) avant toute allocation.

**Contrepartie, et c'est le point du §0** : la panne est **totalement silencieuse**. Le code
ne lit pas `.error` de l'insert — un refus PostgREST (`42501`, `PGRST204` après migration)
n'est même pas une exception, il est ignoré. Rien ne distingue « capture cassée » de
« aucun run n'a eu lieu ». Le geste de 0A reste juste et nécessaire :

```bash
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"
```

---

## §7 — ⚠️ Le script de vidage : honnête sur 5 cas, silencieux sur 1

Lancé pour de vrai, sept fois.

| cas | comportement | verdict |
|---|---|---|
| `--request-id` inexistant | `Aucun événement pour request_id=…`, **exit 1**, aucun fichier | ✅ |
| `--user-id` inexistant | erreur + 3 pistes (drapeau, `MEGA_TEST_MODE`, `--list`), **exit 1** | ✅ |
| requête existante **sans** prompt | `existe (2 événements) mais AUCUN ne porte de prompt`, **exit 1** | ✅ |
| ligne **tronquée** | `⚠️ COUPÉ au plafond` sur les deux lignes | ✅ |
| **deux** appels dans la requête | `Cette requête porte 2 appels modèle. Vidé: « generate-meal-v1 ». Les autres, avec --source : …composition_retry` | ✅ |
| run avec **repli** | annonce `modèle: gpt-5.4-mini` (le vrai producteur), pas celui de la ligne de prompt | ✅ |
| **`--source` sans correspondance** | **vide silencieusement une autre lane, exit 0** | ⚠️ |

Le dernier, mesuré :

```
$ node scripts/export_llm_prompt_dump.mjs --request-id 556c5037-… --source generate-week-plan-v1
lane       : generate-meal-v1   modèle: gpt-5.6-sol      ← ce n'est pas ce qui a été demandé
système    : 14382 car. → …/prompt-system.txt
EXIT=0
```

`export_llm_prompt_dump.mjs:266` — `(args.source && promptRows.find(…)) || promptRows[0]` :
un `--source` qui ne correspond à rien **retombe sans le dire** sur le premier appel venu.
La ligne `lane :` trahit la substitution pour qui la lit, mais un usage en boucle
(`for lane in …; do … --source $lane`) produirait des vidages confiants de la mauvaise lane.
**Correctif proposé** : si `args.source` est posé et qu'aucune ligne ne correspond, sortir en
erreur en nommant les sources disponibles.

Réserve mineure sur `--list` : il **affiche** l'écart (`sys= 76 … meta(sys=77)`) mais ne le
**marque pas** et sort en 0 — la garde d'écart n'existe qu'en mode vidage.

---

## §8 — 📌 Correction au BRIEFING : le repli n'est pas sur la lane que le tableau désigne

Le BRIEFING (§ « Les trois lanes ») met « `gpt-5.6-sol` expire à 4 min → retombe sur
`gpt-5.4-mini` » en face de la lane **foyer**. Mesuré, c'est l'inverse.

Environnement réel du conteneur edge :

```
GLOBAL_AI_MODEL=gpt-5.4-mini      SOPHIA_LLM_RAW_TRACE_ENABLED=1
MEGA_TEST_MODE=0                  SOPHIA_LLM_RAW_TRACE_MAX_CHARS=120000
(KEEL_GENERATION_MODEL absent → gpt-5.6-sol ; OPENAI_HTTP_TIMEOUT_MS absent → 240 000 ms)
```

- `generate-meal-v1` **et** `generate-week-plan-v1` passent `model: keelGenerationModel()`
  = **`gpt-5.6-sol`**, expiration **240 s**, chaîne `gpt-5.6-sol → gpt-5.4-mini → gpt-5.4-nano`.
  **Ce sont elles qui peuvent replier.**
- `generate-household-meal-v1` (`index.ts:3822`) ne passe **aucun** `model` → part
  directement sur `GLOBAL_AI_MODEL` = `gpt-5.4-mini`. **Pas de `gpt-5.6-sol`, donc pas ce
  repli-là.**

Les lignes archivées le confirment : `generate-meal-v1` et `generate-week-plan-v1` sur
`gpt-5.6-sol`, `generate-household-meal-v1` sur `gpt-5.4-mini`. (Cohérent avec 0A §7.7 et
avec la mémoire « le générateur de foyer saute `keelGenerationModel()` ».)

Conséquence pour les agents suivants : **toute latence lue sur la lane foyer n'est pas celle
du modèle de composition**, et la lane solo repas (~160 s mesurés, plafond 240 s) est celle
qui peut basculer sur un modèle plus faible sans le dire dans son résultat.

---

## Ce que je propose, par gravité (aucun geste pris, sauf le §0)

| # | Défaut | Gravité | Correctif |
|---|---|---|---|
| A | `service_role` privé d'`INSERT` ; panne **muette** | ⛔ exploitation | fait (§0) ; **en plus** : lire `.error` de l'insert et poser un `console.warn` — aujourd'hui la seule capture morte possible est une capture invisible |
| B | Garde du script aveugle en aval | ⚠️ haute | `export_llm_prompt_dump.mjs:362` : comparer aussi `written_chars` à `chars` quand `truncated` est faux |
| C | Mode JSON réécrit le prompt après la capture | ⚠️ moyenne (latente) | capturer après façonnage, ou test verrouillant `\bjson\b/i` dans les deux champs des 3 lanes |
| D | `--source` sans correspondance vide une autre lane | ⚠️ moyenne | `:266` : erreur explicite au lieu du repli silencieux |
| E | La ligne de prompt nomme le modèle **échoué** | 📌 à documenter | rien à coder ; le dire aux agents 1–5 (le script, lui, est correct) |
| F | BRIEFING : repli attribué à la lane foyer | 📌 à corriger | §8 |

---

## Annexes

- Harnais : `scratchpad/qa-generation/00-observabilite/2026-08-18-2300-0v-wire-vs-archive.ts`
  (5 scénarios : `fallback`, `jsonmode`, `truncate`, `gemini-leg`, `capture-down`).
- Preuves brutes fil↔archive : `2026-08-18-2310-0v-preuves/*.json` (empreintes SHA-256 des
  paramètres, des `instructions`/`input` reçus sur la socket, et des corps complets).
- Mes 18 lignes synthétiques (`request_id like '0v0000aa-%'`) ont été **supprimées** de
  `llm_raw_response_events`. Les **9** lignes portant un prompt qui restent sont les 8 runs
  réels de 0A **plus** la ligne orpheline `0v-trunc-2030` du §0, qui n'est pas de moi.
