# Supervisor Scheduler RFC (OS conversationnel)
Objectif: transformer l’orchestration actuelle (mix heuristiques locales + hard guards) en un **scheduler central déterministe** (Supervisor) qui coordonne plusieurs machines d’état **sans dupliquer** leurs états métiers.

## Contexte / problème
On a aujourd’hui plusieurs “mini machines” qui peuvent être actives/pending en même temps:
- `investigation_state` (bilan + breakdown + post-checkup parking lot)
- `temp_memory.architect_tool_flow` (tool flows multi-turn)
- `temp_memory.user_profile_confirm.pending` (confirmation de fait)
- `temp_memory.global_deferred_topics` (parking-lot léger)
- `temp_memory.supervisor.stack/queue` (topic_session + orchestration)
- `temp_memory.architect` (plan_focus / anti-loop)

Le risque: laisser le comportement “émerger” via des heuristiques dispersées → bugs de reprise, sessions fantômes, priorité incohérente, loops, toolflow qui bloque un handoff, etc.

## Modèle mental (à figer)
### Supervisor = OS scheduler
Le Supervisor ne contient pas l’état métier. Il contient le **plan d’exécution**:
- qui est **foreground** (ce qui pilote la réponse maintenant),
- qui est **paused** (interrompu, reprenable),
- qui est **queued** (à traiter plus tard),
- pourquoi (reason codes),
- comment reprendre (resume brief).

### Machines = “processus”
Chaque machine garde son état dans son stockage actuel (source de vérité):
- bilan/post-checkup: `user_chat_states.investigation_state`
- toolflow architect: `user_chat_states.temp_memory.architect_tool_flow`
- profile confirm: `user_chat_states.temp_memory.user_profile_confirm.pending`
- global deferred: `user_chat_states.temp_memory.global_deferred_topics`
- topic session: `user_chat_states.temp_memory.supervisor.stack` (type=`topic_session`)

### Overlay / préemption
Certains agents (ex: firefighter/sentry) sont des **overlays**:
- ils préemptent le foreground,
- puis on doit pouvoir reprendre (resume) le précédent flow.

## Définitions (terminologie)
- **present**: la machine existe (state non-null, ou conditions détectées).
- **active**: la machine est engagée dans un flow multi-turn (ex: toolflow stage != done).
- **pending**: la machine a “un truc à faire” mais n’est pas foreground (ex: profile confirm en attente).
- **foreground**: la machine choisie pour guider la réponse ce tour.
- **paused**: machine active mais suspendue (préemption ou digression).
- **queued**: intention à traiter quand opportun (ex: “reprendre profile confirm”).
- **stale**: machine “fantôme” (inactive trop longtemps / conditions invalidées) → à nettoyer.

## Contrat standard machine ↔ supervisor (conceptuel)
Chaque machine doit pouvoir être “observée” et “pilotée” via un contrat minimal.

## Contrat standard — matrice des machines (v0)
But: rendre explicite “qui gagne” quand plusieurs machines sont présentes, **sans dupliquer l’état métier**.

> Lecture: `present/active/pending` viennent du détecteur (state snapshot). Le supervisor n’exécute pas la machine; il décide si elle est foreground/paused/queued.

| Machine | Source de vérité | present / active / pending (détection) | Priority class | Préemption | Cancel policy (stop/boredom) | Resume protocol | Stale / cleanup |
|---|---|---|---|---|---|---|---|
| **Sentry** (overlay) | n/a (décision runtime) | `signal.safety=SENTRY` | safety | préempte tout | n/a | après stabilisation, proposer reprise du flow précédent (ou abandon) | n/a |
| **Firefighter** (overlay) | n/a (décision runtime) | `signal.safety=FIREFIGHTER` ou détresse confirmée | safety | préempte tout | n/a | idem sentry; revenir au flow quand user ok/low risk | n/a |
| **Bilan / Investigator** | `investigation_state` | `present=status!=null`, `active=status in {init,checking,closing}`, `pending=false` | hard_blocker | préemptable seulement par safety | stop user: close bilan (ou `post_checkup_done` en eval) | si preempté par safety: reprendre investigator automatiquement quand stable | TTL long + close explicite (end) |
| **Post-checkup parking lot** | `investigation_state.status=post_checkup` | `active=true` tant que topics restants | hard_blocker (dans sa phase) | préemptable par safety | stop user: close parking lot | reprendre au prochain low-stakes turn si pas clos | TTL court (ex: 24h) + close si empty |
| **Architect tool flow** (create/update/activate) | `temp_memory.architect_tool_flow` | `active=true` si flow présent + stage non terminal | foreground | préemptable par safety; peut être “paused” par digression | **stop/boredom/switch topic ⇒ cancel** (sans friction) si pas commit; sinon mark done | si digression légère: pause + nudge “reprendre ?” plus tard | TTL court (ex: 30–60min) + cancel si stale |
| **User profile confirm** | `temp_memory.user_profile_confirm.pending` | `pending=true` si pending!=null | pending | préemptable par tout (jamais hard blocker) | stop/switch: ne pas forcer; garder pending | nudge opportuniste (“au fait…”) quand low-stakes | TTL moyen (ex: 7 jours) + drop si ignoré N fois |
| **Global deferred topics** | `temp_memory.global_deferred_topics` | `pending=true` si items>0 | opportunistic | préemptable par tout | stop: ne pas forcer | nudge opportuniste (déjà implémenté) | TTL (7 jours) + prune |
| **Topic session** (supervisor session) | `temp_memory.supervisor.stack[type=topic_session]` | `active=true` si session top-of-stack | foreground (mais non bloquant) | préemptable par safety | bored/stop ⇒ phase closing + handoff possible | une fois closing: soit close, soit handoff (selon policy) | cleanup si stale; éviter topic="merci c’est bon" |
| **Architect anti-loop / plan-focus** | `temp_memory.architect` | `present=true` si structure existe | support (non schedulé) | n/a | n/a | n/a | n/a |

### 1) Détection (déterministe)
La machine expose un détecteur à partir d’un snapshot d’état:
- `present: boolean`
- `active: boolean`
- `pending: boolean`
- `stale: boolean`
- `priority_class: "safety" | "hard_blocker" | "foreground" | "pending" | "opportunistic"`
- `resume_brief: string` (fallback déterministe possible)
- `cancel_policy` (voir plus bas)
- `preemptability` (voir plus bas)

### 2) Policies (déterministes)
La machine déclare:
- **preemptable_by**: ex `{ sentry: always, firefighter: always, bored_stop: pause_or_cancel }`
- **cancel_policy**:
  - `cancel_on_explicit_stop: true/false`
  - `pause_on_digression: true/false`
  - `needs_user_consent_to_commit: true/false` (tool flows)
- **resume_protocol**:
  - “quand reprendre” (low-stakes turn, ou quand user revient au plan)
  - prompt template (fallback) → “Tu veux reprendre X ou abandonner ?”
- **staleness_policy**:
  - TTL (ex: 30 min / 20 tours)
  - conditions de cleanup (ex: “stop explicite → cancel toolflow immédiatement”)

### 3) Events (issus IA + heuristiques)
Le dispatcher produit une liste **fermée** d’événements/signal (schema strict):
- safety: `NONE | FIREFIGHTER | SENTRY` (+ confidence)
- user intent: `STOP | BORED | SWITCH_TOPIC | WANTS_PLAN | WANTS_CHECKUP | ACK_DONE | ...`
- meta: `TOOLFLOW_COMMIT_REQUESTED`, `TOOLFLOW_IN_PROGRESS`, etc. (si besoin)

**Important**: on n’envoie pas “toutes les règles” au dispatcher. On lui envoie (a) snapshot minimal + (b) liste de signaux attendus.

## Politique de scheduling (déterministe)
On fixe une politique stable (priorités + préemption + reprise).

### Priorités (ordre strict)
1. **Safety override**: `sentry/firefighter` préemptent tout.
2. **Hard blockers**: bilan actif (`investigation_state`) garde investigator au foreground, sauf safety overlay.
3. **Foreground sessions**: top-of-stack supervisor (toolflow/topic session) si compatible avec signaux user.
4. **Pending obligations**: profile confirm, post-checkup, etc. → nudge/reprise au bon timing.
5. **Opportunistic**: global deferred nudge (si turn low-stakes).

### Reprise après overlay
Après firefighter/sentry:
- le supervisor doit proposer un “resume choice” au bon moment (pas immédiatement si user reste en détresse),
- sinon: downgrade en “pending”.

### Annulation toolflow
Si `USER_EXPLICIT_STOP` ou `SWITCH_TOPIC`:
- cancel immédiat (sans friction) des toolflows “transactionnels”,
- sauf si commit déjà fait (alors c’est “done”, pas “active”).

## Invariants (release blockers)
Des invariants testables par evals (doivent tenir en prod):
- Safety préempte toujours.
- Un toolflow ne reste jamais actif après stop explicite.
- Bilan actif ⇒ investigator (hors safety).
- Max 1 switch de mode par tour (hors safety overlay).
- Toute session active a un `resume_brief` + `last_active_at` à jour.

## Observabilité minimale (DB events)
On ne loggue pas “tout”, mais:
- decision event per turn: chosen_mode + reason codes + signal set
- snapshot supervisor (stack top + queue size)
- machine presence flags (bilan active? toolflow active? profile confirm pending?)

## Reason codes (v0)
But: expliquer *pourquoi* on a routé/pausé/annulé, sans dump du prompt.
- `SAFETY_SENTRY_OVERRIDE`
- `SAFETY_FIREFIGHTER_OVERRIDE`
- `BILAN_HARD_GUARD_ACTIVE`
- `POST_CHECKUP_ACTIVE`
- `TOOLFLOW_ACTIVE_FOREGROUND`
- `TOOLFLOW_CANCELLED_ON_STOP`
- `TOPIC_SESSION_HANDOFF`
- `PROFILE_CONFIRM_PENDING_NUDGE`
- `GLOBAL_DEFERRED_NUDGE`
- `RESUME_PREVIOUS_FLOW`

## Dispatcher spec (v0) — snapshot minimal + signaux fermés
But: l’IA sert à **interpréter** le tour (safety / intent / “done vs pause”), pas à décider la politique. Le supervisor reste déterministe.

### A) Contexte minimal à envoyer au dispatcher (pas de “full state dump”)
Envoyer un snapshot **compact** et stable:
- `conversation_excerpt`: derniers N tours (ex: 10–20), ou un résumé + 6 derniers messages.
- `state_snapshot` (minimal, sans payloads lourds):
  - `risk_level_current`: string/enum si dispo
  - `bilan`: `{ active: boolean, status?: string, is_post_checkup?: boolean }`
  - `toolflow`: `{ active: boolean, kind?: string, stage?: string }`
  - `profile_confirm`: `{ pending: boolean, key?: string }`
  - `topic_session`: `{ active: boolean, phase?: string, focus_mode?: string, topic?: string, handoff_to?: string }`
  - `global_deferred`: `{ has_items: boolean, last_topic?: string }`
  - `supervisor`: `{ stack_top_type?: string, stack_top_owner?: string, queue_size?: number }`

Important:
- on évite d’envoyer `temp_memory` complet (bruit + risque).
- on évite d’envoyer des règles de scheduling détaillées (sinon duplication).

### B) Sortie attendue (strict JSON)
Le dispatcher doit retourner **uniquement** un JSON conforme, sans prose.

Schema conceptuel:
- `safety`: `{ level: "NONE"|"FIREFIGHTER"|"SENTRY", confidence: 0..1, target?: "self"|"other"|"unknown", immediacy?: "acute"|"non_acute"|"unknown" }`
- `user_intent_primary`: `"CHECKUP"|"PLAN"|"EMOTIONAL_SUPPORT"|"SMALL_TALK"|"UNKNOWN"`
- `user_interrupt`: `{ kind: "NONE"|"EXPLICIT_STOP"|"BORED"|"SWITCH_TOPIC"|"DIGRESSION", confidence: 0..1 }`
- `flow_resolution`: `{ kind: "NONE"|"ACK_DONE"|"WANTS_RESUME"|"DECLINES_RESUME"|"WANTS_PAUSE", confidence: 0..1 }`
- `tooling`: `{ wants_tools: boolean, confidence: 0..1 }`
- `notes`: string (optionnel, max 200 chars, debug only)

### C) Liste fermée de signaux (12–15 max)
On la garde volontairement petite pour stabilité.

1. `SAFETY_SENTRY` (level=SENTRY, conf>=t)
2. `SAFETY_FIREFIGHTER` (level=FIREFIGHTER, conf>=t)
3. `INTENT_CHECKUP`
4. `INTENT_PLAN`
5. `INTENT_EMOTIONAL_SUPPORT`
6. `INTERRUPT_EXPLICIT_STOP`
7. `INTERRUPT_BORED`
8. `INTERRUPT_SWITCH_TOPIC`
9. `INTERRUPT_DIGRESSION`
10. `FLOW_ACK_DONE`
11. `FLOW_WANTS_RESUME`
12. `FLOW_DECLINES_RESUME`
13. `FLOW_WANTS_PAUSE`
14. `WANTS_TOOLS`
15. `UNKNOWN` (fallback)

### D) Thresholds (garde-fous)
Recommandation v0 (à ajuster via evals):
- safety override si `confidence >= 0.75`
- interrupt (stop/bored/switch) si `confidence >= 0.65`
- resume/decline si `confidence >= 0.60`
En dessous: le supervisor peut demander clarification ou rester sur fallback.

### E) Mapping signaux → actions supervisor (déterministe) + reason codes
But: le dispatcher “décrit”, le supervisor “agit”.

- `SAFETY_SENTRY` ⇒ `targetMode="sentry"`, marquer session foreground précédente `paused`, reason: `SAFETY_SENTRY_OVERRIDE`
- `SAFETY_FIREFIGHTER` ⇒ `targetMode="firefighter"`, idem pause, reason: `SAFETY_FIREFIGHTER_OVERRIDE`
- `INTENT_CHECKUP` + pas de checkup actif ⇒ router peut démarrer investigator (selon règles produit), reason: `BILAN_HARD_GUARD_ACTIVE` (quand actif)
- `INTERRUPT_EXPLICIT_STOP|INTERRUPT_BORED|INTERRUPT_SWITCH_TOPIC`:
  - si toolflow active ⇒ cancel toolflow, reason: `TOOLFLOW_CANCELLED_ON_STOP`
  - topic_session ⇒ phase=`closing` + handoff possible, reason: `TOPIC_SESSION_HANDOFF`
- `FLOW_ACK_DONE`:
  - post-checkup active ⇒ avancer index / close si fini, reason: `POST_CHECKUP_ACTIVE`
  - sinon: peut close la session foreground si c’est le bon pattern (option produit)
- `FLOW_WANTS_RESUME` ⇒ reprendre session paused top-of-stack, reason: `RESUME_PREVIOUS_FLOW`
- `FLOW_DECLINES_RESUME` ⇒ cancel/close la session paused (ou drop), reason: `RESUME_PREVIOUS_FLOW` (ou reason dédié plus tard)
- `WANTS_TOOLS` ⇒ autorise architect toolflow *si* pas de blockers et si user consent/flow stage ok (sinon ignore)

## Plan d’implémentation incrémental (proposé)
1) **Registry read-only**: détecter machines présentes/actives/pending + reason codes (sans changer routing).
2) **Scheduler v1**: appliquer politique sur 2-3 machines uniquement (ex: toolflow + topic_session + safety).
3) Étendre progressivement: profile confirm, global deferred, post-checkup, etc.

## Implémentation incrémentale (PR plan)
Objectif: améliorer la fiabilité **sans casser prod** et sans “big bang refactor”.

### PR1 — Registry + decision event (read-only)
- Ajouter une fonction “collect snapshot” dans `router/run.ts` (ou module dédié) qui calcule:
  - présence/active/pending: bilan, post-checkup, toolflow, profile confirm, topic_session, global_deferred
  - signaux IA déjà existants (risk, bored/stop, etc.)
  - reason codes v0 (sans changer la décision finale)
- Écrire un **decision event** (DB ou logs) par tour:
  - `chosen_mode`
  - `signals`
  - `reason_codes`
  - `supervisor.stack_top` + `queue_size`
  - `latency/error`
- Ajouter 2–3 evals “invariants” (gates) si pas déjà:
  - stop ⇒ toolflow cancelled
  - safety ⇒ override
  - bilan active ⇒ investigator

**Valeur**: tu peux déboguer en prod et voir les conflits de machines immédiatement, sans changement comportemental.

### PR2 — Scheduler v1 (scope minimal)
Appliquer le scheduler uniquement à un sous-ensemble où on a déjà vu des bugs:
- safety overlay (déjà conceptuellement)
- toolflow architect (cancel/pause)
- topic_session handoff (déjà partiellement)

Règles v1 proposées:
- `safety != NONE` ⇒ mode sentry/firefighter (préemption), et marquer le flow courant “paused” dans supervisor.
- `USER_EXPLICIT_STOP|BORED|SWITCH_TOPIC` + toolflow active ⇒ cancel toolflow (déjà fait mais on le centralise).
- sinon, si toolflow active ⇒ foreground = toolflow.
- sinon, suivre routing actuel (fallback).

**Valeur**: on limite la surface de régression et on élimine les pires “sessions fantômes”/blocages.

### PR3+ — Pending obligations + reprise (progressif)
- Ajouter `user_profile_confirm` en “pending obligation” (nudge opportuniste).
- Ajouter reprise post-checkup via supervisor (option A: `bilan_ref` + overlay).
- Ajouter TTL/staleness uniformes + cleanup automatique.


