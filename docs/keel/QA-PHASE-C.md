# Phase C — la campagne, flow par flow

> Écrit le 2026-08-06, à la fin du chantier de démolition. La phase A a retiré
> huit lanes ; la phase B a écrit le flow de reprise. **Rien de tout ça n'a
> tourné sur la stack.** Ce fichier est la campagne qui le juge.

## La règle qui rend cette campagne utile

Ce dépôt a mesuré deux choses qui invalident la façon naturelle de tester :

- **les correctifs prompt-only régressent en run réel** (`p8-revalidation-rose-reds`) ;
- **des probes vertes ne valent pas un tour réel** (`p4-safety-deferred-gate-leak`).

D'où : **la vérité est en base, jamais dans la réponse.** Chaque assertion se
prouve par une ligne SQL. Une réponse qui dit « c'est noté » sans ligne est un
accusé fantôme, et c'est le défaut le plus cher de ce dépôt.

Et : **3 passes par cas.** Le dispatcher est un classifieur stochastique ; la
même phrase a déjà donné `[0,3,3,0]`. Un cas qui passe 1 fois sur 3 est un RED.
**FR *et* EN** : une garde testée dans une seule langue est une garde à moitié
testée.

## État de la stack (vérifié 2026-08-06)

- 10 conteneurs Supabase debout ;
- cron `keel-reengage` actif, `25 * * * *` ;
- **377 élèves** silencieux depuis plus de 72 h — la population candidate existe.

⚠️ Une fonction edge **modifiée** demande `docker restart
supabase_edge_runtime_Sophia_2` ; un répertoire **neuf**
(`skills/keel_reengagement_resume/`) demande un redémarrage du **CLI**.

---

## C1 — LE FLOW DE REPRISE (priorité absolue : il n'a jamais tourné)

Écrit en phase B, vérifié en tests unitaires et par le type-checker seulement.
Six appelants de production, `wiring-check` vert — mais aucun tour réel.

### Les cas, dans l'ordre

| # | Cas | Ce qui doit être vrai | La preuve |
|---|---|---|---|
| 1 | Relance envoyée | 1 ligne `chat_messages` `metadata.purpose='keel_reengage'` **et** 1 `reengagement_episodes` ouvert | `select id, closed_at, days_inactive_at_open from reengagement_episodes where user_id=… and closed_at is null` |
| 2 | L'élève répond | l'épisode se **ferme** (`exit_status='reengaged'`, `entry_kind='replied_to_template'`) **et** le flow est armé | `select temp_memory->'__active_conversation_skill_v1' from user_states where user_id=… and scope='app'` — attendu `skill_id='keel_reengagement_resume_v1'`, `awaiting_first_reply=true` |
| 3 | **Le scope** | armé sur **`app`**, jamais `whatsapp` | même requête ; un `scope='whatsapp'` = flow invisible, c'est le piège du winback |
| 4 | **Le carve-out** | réponse **3 jours** après l'armement → le flow possède quand même le tour | horloge simulée (`client_now_iso`) ; sans le carve-out il expire à 4 h |
| 5 | Borne à 2 tours | 3ᵉ tour → `normal_reply`, état purgé | `temp_memory` ne porte plus `__active_conversation_skill_v1` |
| 6 | **Safety préempte** | « je vais pas bien du tout » → owner `safety`, **zéro** texte de reprise | trace du tour + absence du gabarit dans `chat_messages` |
| 7 | **Zéro effet durable** | « j'ai repris le magnésium hier » pendant le flow → la ligne `protocol_events` **existe** et le cadre est rendu | `select count(*) from protocol_events where user_id=…` |
| 8 | Aucun reproche | la réponse ne contient aucun mot du lexique interdit | lecture du texte rendu, FR **et** EN |

### Comment déclencher

```bash
docker restart supabase_edge_runtime_Sophia_2
```

Puis invoquer `keel-reengage-v1` (auth par `x-internal-secret`, `verify_jwt=false`),
et répondre via `POST /functions/v1/test-send-message`.

---

## Le profil réel, mesuré (2026-08-06, 90 min de trafic)

C'est la carte d'entrée de C3 à C8. Elle a déjà livré un défaut à elle seule.

| source | n | tok in | en cache | tok out | ms |
|---|---|---|---|---|---|
| `dispatcher-v2-llm` | 8 | 14 575 | **8 363** | 206 | 4 098 |
| `safety_crisis.local_dispatcher` | 1 | 6 592 | — | 494 | 5 102 |
| `sophia-brain:companion` | 3 | 5 528 | — | 42 | 3 246 |
| `generate-meal-v1` | 5 | 3 140 | — | 3 567 | **25 687** |
| `safety_crisis.visible.immediate_risk_check` | 1 | 1 921 | — | 114 | 2 072 |
| `keel_week_review` | 6 | 919 | — | 54 | **90 558** |
| `keel_reengage` | 12 | 619 | — | 23 | 1 881 |
| `winback_reengagement_extractor_v1` | 6 | 566 | — | 102 | 2 441 |

**Ce que la colonne « en cache » dit du reste.** Seul `dispatcher-v2-llm`
rapporte un taux de cache : c'est le seul à passer par le chemin OpenAI
Responses. Tous les autres sont sur Gemini, qui ne rend pas ce champ — d'où le
`NULL`, qui veut dire « pas de mesure », pas « pas de cache ».

**Ce que la ligne 8 a livré.** `winback_reengagement_extractor_v1` : 6 appels en
90 min pour **zéro information**. L'extraction du motif de décrochage lisait
`chat_messages` en `scope: "whatsapp"` — 0 ligne sur 30 jours contre 1 255 en
`app`. Le transcript était toujours vide, le modèle rendait honnêtement
`other / low / null`, et la ligne passait en `extraction_status = "done"`. 100 %
des épisodes extraits portaient ces trois valeurs. Corrigé (scope partagé +
garde « rien à lire ⇒ rien à payer ») et prouvé en run : la même relance, avec
« j'étais en déplacement pro toute la semaine », rend désormais
`context / high` et cite l'élève mot pour mot.

**Deux latences à regarder en C3+** : `keel_week_review` à **90 s** et
`generate-meal-v1` à **26 s**. Aucune des deux n'est sur le chemin d'un tour de
conversation, mais 90 s dans un cron est un budget qui se consomme.

## C2 à C8 — l'ordre, et pourquoi

2. **Dispatcher global** — c'est ici que sont les tokens. Mesuré : le prompt est
   désormais dominé par `create_one_shot_reminder`, **18 910 caractères**
   interpolés depuis `one_shot_reminder_prompt_contract.ts`, sur une lane
   conservée. C'est la vraie cible d'optimisation, et elle n'avait rien à voir
   avec les lanes B2C supprimées. Deux gains structurels identifiés :
   les règles **3g** (3 134 car.) et **3g-ter** (858 car.) sont conditionnées à
   un état runtime (`pending_direct_effect_clarification`,
   `pending_safety_deferred_reminder`) presque toujours absent — les gater sur
   sa présence réelle est le même mécanisme que l'assemblage par blocs, et ne
   touche aucune doctrine.
3. **Effets durables KEEL ×4** — la plus large surface d'edge cases.
4. **`safety_crisis`** — 6 537 tok / **5 075 ms** mesurés, le plus lent.
5. **`normal_reply` / composeur** — bloc doctrine + verrous de sortie.
6. **`meal_precision`** (photo + texte) — déjà sobre, 361 tok / 1 257 ms.
7. **`disordered_eating_guard`** — entrée déterministe, peu à optimiser.
8. **`plan_question`** — zéro LLM, sert de référence.

## La mesure, à chaque fois

```sql
select source, count(*), round(avg(prompt_tokens)) as tok,
       round(avg(cached_prompt_tokens)) as cached, round(avg(latency_ms)) as ms,
       round(sum(cost_usd)::numeric, 6) as usd
from llm_usage_events where request_id = '…' group by 1;
```

Avant/après, en tokens et en ms.

### `cached_tokens` — CÂBLÉ (2026-08-06)

`normalizeOpenAIUsage` (`_shared/gemini.ts`) jetait
`usage.input_tokens_details.cached_tokens`, donc `computeCostUsd` facturait tout
le prompt au plein tarif alors qu'OpenAI facture l'entrée en cache à **10 %**.

Mesuré en run réel, même tour répété pour réchauffer le cache :

| appel | prompt | en cache | % | `cost_usd` |
|---|---|---|---|---|
| froid | 14 580 | 0 | 0 % | **0,012029** |
| chaud | 14 576 | 12 544 | **86 %** | **0,003491** |

Le coût du dispatcher était donc **surestimé 3,4×** — sur le chiffre même qui
sert à décider quoi optimiser. (L'estimation antérieure de « ~7× » supposait
88 % de cache appliqué à l'entrée seule ; 3,4× est la mesure, sortie comprise.)

`cached_prompt_tokens` distingue **`NULL`** (le fournisseur n'a rien dit — c'est
le cas de toutes les lignes Gemini, et de tout l'historique d'avant le câblage)
de **`0`** (cache réellement vide). Les confondre inventerait un taux de cache
de 0 % là où il n'y a pas de mesure.

⚠️ **Ordre de déploiement** : la migration
`20260806220000_llm_usage_cached_prompt_tokens.sql` doit partir **avant** les
fonctions. Colonne absente ⇒ l'insert entier de `llm_usage_events` échoue, et
cet insert vit dans un `try/catch` « best effort » : la télémétrie s'éteindrait
**en silence**, sans casser un seul tour.

---

## RÉSULTAT C1 — PASSE 1 (2026-08-06, run réel)

**Le cas 1 (« la relance part ») est ROUGE, et il bloque tous les autres.**

```
POST keel-reengage-v1 → HTTP 200
{"candidates":115,"sent":0,"armed":0,
 "body_sources":{"composed":7},
 "skipped_by_reason":{"no_active_plan":85,"already_nudged_this_episode":18,"opted_out":5},
 "failures":[7× "delivery refused: unsolicited_daily_cap (episode rolled back)"]}
```

### Le défaut : l'ordre entre composer et vérifier le plafond

`sendReengageNudge` (`_shared/keel/reengagement_io.ts`) fait, dans cet ordre :

1. `openReengagementEpisode` — écrit une ligne ;
2. `composeReengageBody` — **charge la doctrine du coach et appelle un modèle** ;
3. `assertNoGuiltTripping` ;
4. `deliverChatMessage` — **c'est SEULEMENT ici** que `decideChatDelivery`
   consulte le plafond `DAILY_UNSOLICITED_CAP = 2` ;
5. refus → `rollbackReengagementEpisode`, la ligne est **supprimée**.

`keel_reengage` n'est dans aucun des trois ensembles privilégiés
(`GUARANTEED_PURPOSES`, `OPT_IN_PURPOSES`, `TRANSACTIONAL_PURPOSES`) : il tombe
en `unsolicited_within_cap`, donc `subjectToCap: true`.

**Coût mesuré sur CE tick** : `llm_usage_events` sur les 5 dernières minutes →
**8 appels, 8 221 tokens de prompt**, intégralement jetés. Le job tourne
**toutes les heures**.

### Pourquoi c'est structurel et pas un hasard de fixtures

Le plafond est journalier et **partagé** avec tous les autres messages non
sollicités (pulse du soir, point hebdo). Un élève qui a déjà reçu ses deux
messages du jour ne peut pas recevoir de relance — mais le job le découvre
après avoir payé sa composition. Plus la boucle proactive est vivante, plus la
relance paie pour rien.

### La correction, et ce qu'elle ne doit pas casser

Consulter le plafond **avant** l'étape 2, sans dupliquer la décision :
`decideChatDelivery` (`_shared/chat/delivery_policy.ts`) est déjà un **module
pur**. L'appeler en pré-vérification puis laisser `deliverChatMessage` trancher
pour de bon garde une seule source de vérité — deux implémentations du plafond
seraient le vrai piège.

⚠️ Ne PAS transformer `keel_reengage` en purpose garanti pour contourner : le
plafond de 2/jour est une protection produit, pas un obstacle technique.

### Ce que la passe 1 n'a donc PAS pu juger

Les cas 2 à 8 (armement, scope, carve-out, borne, safety, effet durable,
lexique) attendent qu'une relance parte réellement. Le flow de reprise reste
**non vérifié en conditions réelles**.

---

## RÉSULTAT C1 — PASSE 2 (2026-08-06, run réel) : **8/8 VERT**

Le correctif de plafond a débloqué l'envoi. Les huit cas ont tourné sur la stack
locale. **Quatre défauts trouvés, tous corrigés, tous re-vérifiés en run.**

### Comment cibler UN élève (le job balaie la flotte par défaut)

`keel-reengage-v1` n'a pas de paramètre « un seul élève ». Il ordonne les
profils par `id` et accepte `after_user_id` + `limit` : passer l'`id` de l'élève
**juste avant** la cible, avec `limit: 1`, ne charge qu'elle. Sans ça, un tick
compose pour 100+ candidats.

Deux pièges d'appel, tous deux payés :

- Kong veut un en-tête **`apikey`** en plus de `x-internal-secret` — sinon
  `{"msg":"Error: Missing authorization header"}`, qui ressemble à un problème
  de secret interne et n'en est pas un.
- La réponse de l'élève doit passer par **`chat-inbound-v1`** (JWT élève, mot de
  passe `1234567`). `test-send-message` appelle `processMessage` directement et
  **saute la garde 4** — donc il ne peut pas juger la phase B.

### Le tableau

| # | Cas | Verdict | Preuve |
|---|-----|---------|--------|
| 1 | Relance envoyée | ✅ | `sent: 1`, `body_sources: {composed: 1}` ; 1 ligne `chat_messages` `purpose='keel_reengage'` scope `app` |
| 2 | Épisode fermé + flow armé | ✅ | `exit_status='reengaged'`, `entry_kind='replied_to_template'` |
| 3 | Scope `app` | ✅ | l'état est écrit sur `scope='app'`, jamais `whatsapp` |
| 4 | Réponse 3 jours après | ✅ | épisode ouvert 3 j → `response_owner = keel_reengagement_resume_v1` |
| 5 | Borne de tours + purge | ✅ *après correctif* | `temp_memory` ne porte plus `__active_conversation_skill_v1` |
| 6 | Safety préempte | ✅ | trace : `response_owner=safety`, `reason=distress_ideation_safety_priority` |
| 7 | Effet durable pendant le flow | ✅ *après correctif* | 1 ligne `protocol_events`, `substance_ref=magnesium_glycinate` |
| 8 | Aucun reproche | ✅ | rendu = `WELCOME_BACK.en` au caractère près |

### Les quatre défauts, par ordre de gravité

**D1 — le cadre écrivait dans une table qui n'existe pas.** La garde 4 écrivait
`user_states` ; tout le dépôt lit `user_chat_states`. Le client PostgREST ne
throw pas sur une table absente — il rend `{ error }`, et cet `error` n'était pas
lu. Le bloc journalisait `keel_reengagement_resume_armed` à chaque réponse
d'élève **tout en n'écrivant rien**. Ni le type-checker (client non typé par
nécessité) ni les tests unitaires (reducer pur, jamais appelé) ne pouvaient le
voir. Seul symptôme : l'absence du cadre, c'est-à-dire rien.

**D2 — le second tour avalait une vraie demande.** Séquence mesurée :

```
T1  élève  « Ah oui pardon, j'ai un peu lâché. Je reprends aujourd'hui. »
    flow   « Content de te lire. On reprend où tu veux : … »        ✔
T2  élève  « Je voudrais surtout gérer les dîners cette semaine »
    flow   « Très bien, on continue là-dessus. »                    ✘ AVALÉ
T3  élève  « Du coup je fais quoi ce soir pour le dîner ? »
    normal « Pour ce soir, garde la même ancre : protéine d'abord… » ✔
```

Le reducer est **pur** : il ne peut pas distinguer une réentrée sèche d'une
question. Tout second tour possédé est un pari, et ce pari perd au premier essai
réel. → le flow ne possède plus qu'**un** tour, le gabarit `handed_back`
disparaît, la sortie est silencieuse. Re-vérifié : la même phrase obtient
désormais une réponse groundée sur la doctrine.

**D3 — pendant la reprise, plus personne ne classait le tour.**
`shouldSkipGlobalDispatcherForActiveLocalFlow` rendait `true` pour **tout** flow
actif ; son commentaire nommait encore `presence_conversation`, supprimé en
phase A. Or un flow ne peut se passer du dispatcher global que s'il porte son
propre classifieur — `safety_crisis` en a un, ce cadre est un renderer
déterministe et n'en a pas.

```
pendant le flow : « J'ai repris le magnésium hier soir »  → protocol_events: 0  ROUGE
flow purgé, même phrase                                   → protocol_events: 1  VERT
```

Le fait rapporté par l'élève était **perdu**, précisément sur le tour où il
revient. `routers.ts` portait pourtant « les effets directs passent SANS fermer
le flow » : il décrivait un code qui ne pouvait pas s'exécuter, `turn_frame`
étant vide. → liste **positive** `FLOWS_WITH_THEIR_OWN_DISPATCHER`.

**D4 — la purge ne survivait pas au composeur.** Sur la sortie silencieuse, le
companion reconstruit `tempMemory` depuis l'état PRÉ-routing. `if
(localFlowExitSkillRun)` existe pour rattraper ça — mais ce drapeau n'avait plus
**aucun écrivain** depuis la phase A. Après trois tours, l'état portait encore
`turns_in_flow: 2`.

### Deux constats structurels, au-delà des correctifs

**Le carve-out de fraîcheur est INERTE.** Restauré en phase B sur l'argument du
winback (« l'élève répond des jours après l'armement »), juste — *pour le
winback, qui armait à l'ENVOI*. Ce flow arme à la **réponse** : mesuré, entre la
relance et la réponse `temp_memory` ne porte aucun état de flow, donc la borne
de 4 h ne peut pas être franchie. C'est l'**épisode** qui porte l'attente. Gardé
avec sa condition de suppression écrite, pas décrit comme une protection.

**La suite ne compilait plus.** 16 fixtures citaient encore les lanes
supprimées ; un seul site suffit à faire échouer le type-check du programme
entier, donc la suite ne rendait aucun signal — ni vert ni rouge. Réparé et
rebasé (7 fichiers). Suite : **3031 passed / 1 failed**, le rouge appartenant à
la session concurrente.

### Ce que la passe 2 ne peut pas juger

**Le volet FR.** `_shared/keel/locale.ts` porte
`PILOT_FORCED_LOCALE = "en-US"` — une épingle **assumée et documentée** qui force
une langue unique pour toute la flotte. Un élève `fr-FR` reçoit donc l'anglais,
et c'est le comportement voulu. La couverture FR des gabarits reste prouvée par
`reducer_test.ts` (lexique interdit appliqué aux deux langues) ; elle ne peut
pas l'être en run tant que l'épingle est en place.
