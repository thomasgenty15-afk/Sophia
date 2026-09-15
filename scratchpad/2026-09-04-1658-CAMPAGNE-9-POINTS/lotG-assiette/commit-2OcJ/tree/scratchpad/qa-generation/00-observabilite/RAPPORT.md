# 0A — le prompt envoyé au modèle se relit

**2026-08-18** · branche `ff-001-quotidien-du-coach` · pile locale

Avant ce lot, `llm_raw_response_events` archivait la **réponse** du modèle et, de la question,
seulement sa **longueur** (`metadata.system_prompt_chars`, `metadata.prompt_chars`). Prouver
qu'un bloc de doctrine atteignait le modèle se faisait donc par **écart de compteur**. C'est fini :
le texte exact des deux morceaux du prompt est en base, et un script le pose sur disque.

---

## 1. Le script de vidage — à copier-coller

```bash
# 1) VOIR les derniers runs qui portent un prompt (aucun fichier écrit)
node scripts/export_llm_prompt_dump.mjs --list
node scripts/export_llm_prompt_dump.mjs --list --source generate-household-meal-v1 --limit 40

# 2) VIDER un run précis  →  prompt-system.txt / prompt-user.txt / output.json
node scripts/export_llm_prompt_dump.mjs --request-id ba70208e-39bf-447e-a4c3-672a0d96f664 --out /tmp/dump

# 3) VIDER le dernier run d'un élève (le geste le plus courant)
node scripts/export_llm_prompt_dump.mjs --user-id 08050000-0000-4000-8000-000000000022 --out /tmp/dump

# 4) VIDER le dernier run d'une lane, tous élèves confondus
node scripts/export_llm_prompt_dump.mjs --source generate-meal-v1

# 5) Un request_id peut porter DEUX appels modèle (cf. §6). --source choisit lequel :
node scripts/export_llm_prompt_dump.mjs --request-id 556c5037-35d4-4525-8121-ae5b9fbae4af \
  --source generate-meal-v1.composition_retry --out /tmp/dump-retry
```

`--out` est optionnel : sans lui le dossier atterrit dans
`scratchpad/qa-generation/prompt-dumps/<horodatage>-<lane>-<id>/`. Deux vidages d'exemple y sont
déjà, produits par les commandes ci-dessus — le prompt solo et sa reprise `composition_retry`.

Connexion : `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` s'ils sont dans l'environnement, sinon
`supabase status --output json`. **N'exporte pas ces variables dans le shell qui lancera ensuite
`deno test`** — cicatrice connue du dépôt (114 faux rouges).

Sortie type, sur un vrai run :

```
request_id : ba70208e-39bf-447e-a4c3-672a0d96f664   (--request-id)
lane       : generate-household-meal-v1   modèle: gpt-5.4-mini
système    : 15486 car. → …/dump-household/prompt-system.txt
utilisateur: 7158 car. → …/dump-household/prompt-user.txt
sortie     : success/text → …/dump-household/output.json

Longueurs confirmées par le compteur indépendant de gemini.ts.
```

Cette dernière ligne est une **garde** : elle compare la longueur écrite dans la colonne au
compteur que `gemini.ts` calcule séparément dans `metadata`. En cas d'écart, le script crie et
sort en code 2. Elle n'a jamais été fausse sur les runs de ce lot.

---

## 2. Ce qui est capturé, où, sous quel drapeau

| quoi | où |
|---|---|
| `systemPrompt` (1er param. de `generateWithGemini`) | `llm_raw_response_events.system_prompt` |
| sa longueur **avant bornage** | `.system_prompt_chars` |
| a-t-il été coupé | `.system_prompt_truncated` |
| `userMessage` (2e param.) | `.user_message` |
| idem | `.user_message_chars`, `.user_message_truncated` |

- **Drapeau** : `SOPHIA_LLM_RAW_TRACE_ENABLED` — celui qui existait déjà. Éteint, les six colonnes
  restent `NULL` ; `logLlmRawResponseEvent` sort avant toute allocation.
- **Plafond** : `SOPHIA_LLM_RAW_TRACE_MAX_CHARS`, **120 000** par défaut — celui qui existait déjà.
  Les prompts mesurés font 3 k à 16 k caractères : on est loin du plafond, mais le bornage est
  armé et prouvé (§5).
- **Une seule ligne par appel modèle.** `generateWithGemini` peut journaliser une trentaine
  d'événements ; seul le **premier** porte le prompt. En pratique c'est l'`attempt_start` posé
  juste avant l'appel HTTP. Les chemins de sortie anticipée (breaker ouvert, clé absente) passent
  par le même helper, donc aucun appel réel ne peut finir sans sa ligne de prompt.
- **Zéro effet sur la production.** Rien n'a été ajouté hors du `try/catch` muet existant ;
  `takePromptOnce()` ne fait que lire deux chaînes déjà en portée et basculer un booléen.

### Fichiers touchés

- `supabase/migrations/20260818271500_le_prompt_exact_se_relit.sql` (neuf)
- `supabase/functions/_shared/llm-raw-trace.ts` — `boundedPrompt()` + 6 colonnes à l'insert
- `supabase/functions/_shared/gemini.ts` — `takePromptOnce()` dans `logRawGenerationEvent`
- `supabase/functions/_shared/llm-raw-trace_test.ts` (neuf, 6 tests)
- `scripts/export_llm_prompt_dump.mjs` (neuf)

---

## 3. Preuve — les privilèges

La table reçoit désormais **taille, poids, sexe, âge et allergies**, y compris ceux des enfants
d'un foyer. L'état des octrois a donc été **lu avant**, pas supposé — et il était ouvert :

```
    grantee    | privilege_type
---------------+----------------
 anon          | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
 authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
...
 has_table_privilege('anon','public.llm_raw_response_events','select')  ->  t
```

Le fichier d'origine (`20260612170000`) n'accordait pourtant que `select` à `authenticated`.
Le reste venait des **privilèges par défaut Supabase**. La RLS bloquait la lecture d'`anon`,
mais **`TRUNCATE` ne passe pas par la RLS** : `anon` pouvait vider la table.

État final, mesuré après `supabase migration up` :

```
     role      | sel | ins | upd | del | trunc
---------------+-----+-----+-----+-----+-------
 anon          | f   | f   | f   | f   | f
 public        | f   | f   | f   | f   | f
 authenticated | t   | f   | f   | f   | f
 service_role  | t   | t   | t   | t   | t
(4 rows)
```

```
    grantee    |                       string_agg
---------------+---------------------------------------------------------
 authenticated | SELECT
 postgres      | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
(3 rows)
```

**Aucun rôle ne gagne un accès. Deux en perdent.** La migration porte un bloc `do $$` qui
re-vérifie ces privilèges *et* le cas passant (`authenticated` garde `select`, `service_role`
garde `insert`, RLS active) : une garde qui fermerait le lecteur admin ou l'écrivain de la trace
échouerait bruyamment au lieu de ressembler à une garde qui marche.

Aucune policy n'a été ajoutée : les deux existantes (`service_role` + `internal_admins`) sont
inchangées, il n'y a **aucune nouvelle porte de lecture**.

---

## 4. Preuve — runs réels, lane par lane

Trois lanes, trois runs HTTP réels sur la pile locale (`MEGA_TEST_MODE=0`, vrai appel modèle).

| lane | `request_id` | modèle | sys / meta | usr / meta | HTTP |
|---|---|---|---|---|---|
| solo repas | `556c5037-35d4-4525-8121-ae5b9fbae4af` | `gpt-5.6-sol` | 14382 / 14382 | 5752 / 5752 | 200 en 158 s |
| foyer | `ba70208e-39bf-447e-a4c3-672a0d96f664` | `gpt-5.4-mini` | 15486 / 15486 | 7158 / 7158 | 200 en 17,7 s |
| solo semaine | `30dcdf21-3fe0-4094-8e03-695904aa4be5` | `gpt-5.6-sol` | 3285 / 3285 | 2349 / 2349 | 429 fournisseur, cf. §7-9 |

`sys / meta` = colonne neuve / compteur calculé indépendamment dans `gemini.ts`. **Identiques
partout.**

Le troisième run est le meilleur cas de figure pour la règle « une seule ligne par appel » :
le fournisseur a rendu 429 sur toute la chaîne, `generateWithGemini` a rejoué et ouvert son
disjoncteur, et le `request_id` porte donc **28 événements** — dont **exactement 1** avec le
prompt, le tout premier `attempt_start` :

```
 evenements | lignes_portant_le_prompt
------------+--------------------------
         28 |                        1
```

Le prompt reste intégralement relisible alors même que l'appel n'a jamais abouti : c'est
précisément le cas où la reconstitution par le code aurait été impossible.

### Lane solo — `generate-meal-v1`, élève `qa0805.zoe@keeltest.dev`

`prompt-user.txt`, début du bloc élève, relu tel quel :

```
== THIS STUDENT ==

-- WHO THEY ARE --
- height: 170 cm
- age band: 30 to 44
- gender, as they picked it: female
These are here for ONE thing: the SIZE of a portion. …

-- WHAT THEY ARE AFTER --
goal: maintenance
their situation, in their words: Office job in London, cooks most evenings, trains twice a week.

-- WHERE THEY ARE NOW --
- weight: 65.7 kg, measured week of 2026-08-17
```

### Lane foyer — `generate-household-meal-v1`, titulaire `l2p-owner-…@test.dev`

`prompt-user.txt`, premier bloc :

```
== MARLOW'S METHOD — YOU SPEAK AS THIS COACH'S AGENT ==
…
-- WHAT THIS COACH BELIEVES --
- Every plate is built on a protein anchor.

-- THIS COACH'S WORDS — use them, do not translate them away --
- "anchor": the protein base of a plate

== THE CONVICTION KEYS YOU MAY NAME ==
["protein_anchor"]
```

**Vérification mot pour mot** (l'étape qui compte) — la doctrine publiée en base pour le coach
de ce foyer :

```json
{"beliefs":[{"key":"protein_anchor",
             "claim":"Every plate is built on a protein anchor.",
             "reason":"It is what makes a meal hold until the next one.",
             "instead":"Start from the protein, then add vegetables for volume."}],
 "vocabulary":[{"term":"anchor","meaning":"the protein base of a plate"}]}
```

`claim` et `vocabulary` se retrouvent **caractère pour caractère** dans le prompt archivé.
Et le premier constat que cette lisibilité rend gratuit : **`reason` et `instead` ne sont PAS
injectés** — seul `claim` l'est. C'était jusqu'ici une hypothèse à reconstituer ; c'est
désormais une lecture.

Le bloc foyer est complet lui aussi (ids de bouches, consignes de service) :

```
== THE HOUSEHOLD ==
Exact ids to use in member_portions and in every preparation's boxes:
- Paul = 30730edf-846c-4ea4-901d-39c9caaf7fee
- Lea  = e62e2bbd-b675-4fe2-be7d-9dd98510ee98
- Tom  = 8183690c-96c2-4ded-a818-f1edc36862c0
- Nina = e3d77550-6f51-411e-9d0c-8bd36c3d07a2
```

---

## 5. Preuve — le bornage

Deux niveaux, parce que les prompts réels (3 k–16 k) ne touchent pas le plafond de 120 000.

**a) Unitaire** — `supabase/functions/_shared/llm-raw-trace_test.ts`, 6 tests, tous verts.
Ils vérifient les **trois états qu'on doit pouvoir distinguer** : absent (`null/null/false`),
entier (`texte/|texte|/false`), coupé (`début/|original|/true`). Plus le cas pile-au-plafond
(un `>=` au lieu d'un `>` marquerait tronqué un texte complet) et l'absence de `trim()`
(qui ferait diverger la colonne du compteur indépendant et déclencherait une fausse alerte).

**b) Bout en bout, à travers le vrai écrivain**, avec un plafond volontairement bas
(`SOPHIA_LLM_RAW_TRACE_MAX_CHARS=500`), ligne relue en base puis supprimée :

```
 sys_written | sys_original | system_prompt_truncated | usr_written | usr_original | user_message_truncated
-------------+--------------+-------------------------+-------------+--------------+------------------------
         500 |         1500 | t                       |         200 |          200 | f
```

La longueur rendue est celle de **l'original**, pas celle du morceau écrit : un prompt tronqué
ne peut pas se faire passer pour un prompt court.

---

## 6. Ce qui n'est PAS capturé, et pourquoi

- **`tools` et `toolChoice`** — la table portait déjà `has_tools` (booléen) et `tool_choice`.
  Le schéma JSON complet des outils est statique dans le code : l'archiver à chaque appel
  doublerait le volume sans rien apprendre. `output.json` porte le champ
  `prompt.not_captured` qui le dit explicitement, pour qu'on ne le cherche pas.
- **La température** — constante par appelant, lisible dans le code. Même raison.
- **Le `response_schema` / `responseMimeType`** — même raison.
- **Le mode stub** — quand `MEGA_TEST_MODE` renvoie `MEGA_TEST_STUB`, **aucun appel modèle n'a
  lieu**, donc rien n'est archivé. Une absence de ligne est un run stubé, pas une capture cassée.
- **`searchWithGeminiGrounding` et `generateEmbedding`** — ils journalisent dans la même table
  mais ne passent pas par `generateWithGemini`. Hors périmètre : ce ne sont pas des lanes de
  génération de plan.

Deux limites assumées, dites ici pour qu'elles ne se découvrent pas en enquête :

- **Le `redacted()` de `llm-raw-trace.ts` ne s'applique PAS aux deux champs de prompt.** Il
  masque des *clés d'objet* (`api_key`, `authorization`, …) ; les prompts sont du texte plat, et
  le passer à la moulinette d'expressions régulières abîmerait précisément ce qu'on vient de
  rendre lisible — une relecture « mot pour mot » qui a été retouchée ne prouve plus rien.
  La protection de ces champs est donc **entièrement** celle du §3 : `anon` et `public` à zéro,
  RLS `internal_admins`/`service_role`, drapeau éteint par défaut.
- **Si le tout premier insert échoue**, le prompt est perdu pour cet appel : le jeton
  « déjà écrit » est consommé avant que l'insert ne réussisse. C'est le prix de la garantie
  « une seule copie par appel » ; l'insert échouant est de toute façon avalé en silence par
  conception (`try/catch` muet, l'observabilité ne casse pas une génération). Symptôme :
  un `request_id` avec des événements mais `lignes_portant_le_prompt = 0` — le script le dit
  explicitement au lieu d'écrire des fichiers vides.

---

## 7. Pièges rencontrés — pour les agents suivants

1. **PostgREST met le schéma en cache.** Après `supabase migration up`, l'insert de
   `llm-raw-trace.ts` (qui passe par PostgREST) aurait échoué en `PGRST204` sur les colonnes
   neuves — **et le `try/catch` muet l'aurait avalé**. La capture aurait eu l'air désarmée sans
   la moindre erreur. Geste obligatoire après toute migration qui ajoute une colonne écrite par
   une edge function :
   ```bash
   docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"
   ```
2. **Le runtime edge sert des `_shared` périmés.** Après modification de `gemini.ts` /
   `llm-raw-trace.ts` : `docker restart supabase_edge_runtime_Sophia_2`, puis attendre la ligne
   `Serving functions on …` dans `docker logs --tail 40 --timestamps supabase_edge_runtime_Sophia_2`.
3. **Un `request_id` ≠ un appel modèle.** La lane solo rejoue sous
   `generate-meal-v1.composition_retry`, avec un **message utilisateur différent** (5988 au lieu
   de 5752 caractères : le premier plan y est recollé). Le script vide le premier appel par
   défaut, signale la présence des autres, et `--source` les sélectionne. Un agent qui lirait
   « le prompt » sans savoir ça mesurerait le mauvais tour.
4. **`anon` avait tout sur cette table.** Le patron `revoke … from public` **seul** ne suffit
   jamais ici : `anon` est un rôle nommé. Et `TRUNCATE` échappe à la RLS, donc une RLS active
   n'est pas une preuve de fermeture. Toujours conclure par `has_table_privilege`.
5. **Fixtures : le coach de Zoe n'a pas de doctrine publiée.** `generate-week-plan-v1` refuse
   `qa0805.zoe@keeltest.dev` en `409 coach_has_no_doctrine`, et son prompt solo sort avec
   `== THE CONVICTION KEYS YOU MAY NAME == []`. **Pour tout test de doctrine, prendre
   `l2p-owner-1786493429016cdbc78@test.dev`** (coach Marlow, doctrine `protein_anchor` publiée).
   Mot de passe des fixtures QA locales : `1234567`.
6. **La lane foyer refuse une fenêtre qui chevauche un plan vivant** (`409
   plan_overlaps_existing`), y compris en `intent: "draft"`. Viser une fenêtre `exact` **après**
   le dernier plan non retiré du foyer :
   ```sql
   select id, starts_on, duration_days from public.student_generated_meals
   where household_id = '…' and retired_at is null order by created_at desc;
   ```
7. **Lane foyer : le modèle est `gpt-5.4-mini` dès le premier `attempt_start`**, pas un repli
   après timeout — `generate-household-meal-v1` n'appelle pas `keelGenerationModel()`. C'est
   désormais lisible dans la ligne archivée, plus à déduire.
8. **La lane solo repas prend ~160 s** (deux appels modèle enchaînés). Lancer les runs en tâche
   de fond : un `curl` tué en cours laisse une ligne `attempt_start` sans succès, qui ressemble
   à une panne.
9. ⛔ **À 20:05 le 2026-08-18, la clé `OPENAI_API_KEY` du conteneur edge n'a plus de crédit.**
   Tous les modèles rendent `429 « You have no credits remaining »`, `gpt-5.6-sol` comme
   `gpt-5.4-mini` et `gpt-5.4-nano`. Les deux runs verts de ce lot (19:56 et 19:58) sont passés
   juste avant. **Tout agent suivant qui tente un run réel touchera ce mur** — et le verra
   maintenant en une requête, ce qui est exactement le point de ce lot :
   ```sql
   select status, model, http_status, left(error_message, 60)
   from public.llm_raw_response_events
   where created_at > now() - interval '1 hour' and outcome = 'error'
   order by created_at desc limit 5;
   ```
   Recharger le compte est une action humaine : je ne l'ai pas faite et ne peux pas la faire.
   Effet de bord à connaître : après trois 429 le **disjoncteur** de `gemini.ts` s'ouvre par
   `provider:model` pour toute l'isolate, et les appels suivants sortent en `breaker_skip` sans
   toucher le réseau — un run lancé juste après ressemble alors à une panne différente de la
   vraie.

---

## 8. Contrôles passés

- `supabase migration up` — `20260818271500` appliquée, en tête du registre.
- `deno test supabase/functions/_shared/llm-raw-trace_test.ts` — 6/6.
- `deno check` sur `llm-raw-trace.ts`, `gemini.ts`, le test, le script — vert.
- `deno lint` — **aucune** alerte nouvelle (les 3 `no-explicit-any` de `llm-raw-trace.ts` et le
  `no-import-prefix` du test sont pré-existants / conformes aux autres tests du dossier).
- `npx tsc -b --force tsconfig.app.json` — vert.
- `scripts/agent-gate.sh` — **pass**, 3657 tests, 0 échec.

## 9. Critère de sortie

| exigence | état |
|---|---|
| prompt système + message utilisateur relisibles en entier, lane **solo** | ✅ `556c5037…` |
| idem lane **foyer** | ✅ `ba70208e…` |
| idem lane **semaine** (bonus) | ✅ `30dcdf21…` — prompt complet, appel refusé 429 par le fournisseur |
| le script produit les 3 fichiers | ✅ `prompt-system.txt`, `prompt-user.txt`, `output.json` |
| privilèges `anon` / `public` prouvés nuls | ✅ §3 |
| bornage visible (longueur d'origine + booléen) | ✅ §5 |
| éteint par défaut, zéro effet sur la génération | ✅ §2 |
