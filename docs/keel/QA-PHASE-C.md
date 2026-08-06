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
select source, count(*), round(avg(prompt_tokens)), round(avg(latency_ms))
from llm_usage_events where request_id = '…' group by 1;
```

Avant/après, en tokens et en ms. **Le `cached_tokens` n'est toujours pas lu**
(`input_tokens_details` dans la réponse brute) : `cost_usd` surestime le
dispatcher d'environ 7×. À câbler pendant C2.
