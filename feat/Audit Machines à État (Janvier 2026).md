# Audit Machines à État — Janvier 2026

## Objectif
Vérifier que chaque machine d'état est correctement implémentée, indexée, et que les priorités sont respectées.

---

## 📊 MATRICE D'AUDIT

| Machine | Source de vérité | Indexée queue? | Priorité RFC | Priorité CODE | ✅/⚠️ |
|---------|------------------|----------------|--------------|---------------|-------|
| **Sentry** | runtime (dispatcher) | Non | safety (1) | safety (1) | ✅ |
| **Firefighter** | runtime (dispatcher) | Non | safety (1) | safety (1) | ✅ |
| **Investigator/Bilan** | `investigation_state` | `pending:post_checkup_parking_lot` (post only) | hard_blocker (2) | hard_blocker (2) | ✅ |
| **Architect toolflow** | `temp_memory.architect_tool_flow` | `queued_due_to_irrelevant_active_session:*` | foreground (3) | foreground (3) | ✅ |
| **User profile confirm** | `temp_memory.user_profile_confirm.pending` | `pending:user_profile_confirm` | pending (4) | pending (4) | ✅ |
| **Global deferred** | `temp_memory.global_deferred_topics` | `pending:global_deferred_nudge` | opportunistic (5) | opportunistic (5) | ✅ |
| **Topic session** | `temp_memory.supervisor.stack[type=topic_session]` | Non (stack only) | foreground (3) | foreground (3) | ✅ |

---

## 🔍 AUDIT DÉTAILLÉ PAR MACHINE

### 1. SENTRY (safety overlay)
**Source de vérité**: Décision runtime (dispatcher signals)

| Aspect | RFC | Code | Status |
|--------|-----|------|--------|
| Détection | `signal.safety=SENTRY` | `dispatcherSignals.safety.level === "SENTRY" && confidence >= 0.75` | ✅ |
| Préemption | Préempte tout | `targetMode = "sentry"` en premier dans la chaîne | ✅ |
| Cancel policy | n/a | n/a | ✅ |
| Resume | Proposer reprise flow précédent | ⚠️ Non implémenté explicitement | ⚠️ |

**Gap identifié**: Après stabilisation sentry, on ne propose pas explicitement de reprendre le flow précédent.

---

### 2. FIREFIGHTER (safety overlay)
**Source de vérité**: Décision runtime (dispatcher signals)

| Aspect | RFC | Code | Status |
|--------|-----|------|--------|
| Détection | `signal.safety=FIREFIGHTER` | `dispatcherSignals.safety.level === "FIREFIGHTER" && confidence >= 0.75` | ✅ |
| Préemption | Préempte tout | Oui, mais après sentry | ✅ |
| Guard bilan | Ne pas casser le bilan pour "stress" mineur | `checkupActive && riskScore <= 1 && !looksLikeAcuteDistress → investigator` | ✅ |
| Resume | Revenir au flow quand user ok | ⚠️ Non implémenté explicitement | ⚠️ |

**Gap identifié**: Même que sentry — pas de reprise explicite.

---

### 3. INVESTIGATOR / BILAN
**Source de vérité**: `user_chat_states.investigation_state`

| Aspect | RFC | Code | Status |
|--------|-----|------|--------|
| Détection active | `status in {init, checking, closing}` | `state?.investigation_state && status !== "post_checkup"` | ✅ |
| Hard guard | Investigator foreground sauf safety | `checkupActive && !stopCheckup → investigator` | ✅ |
| Stop explicite | User peut arrêter | `isExplicitStopCheckup()` + `dispatcherSignals.interrupt.kind === "EXPLICIT_STOP"` | ✅ |
| Préemption par safety | Oui | Sentry/firefighter passent avant le hard guard | ✅ |
| Indexation queue | `pending:post_checkup_parking_lot` (post only) | Oui, quand `status === "post_checkup"` | ✅ |

**Status**: ✅ Complet

---

### 4. POST-CHECKUP PARKING LOT
**Source de vérité**: `investigation_state.status === "post_checkup"`

| Aspect | RFC | Code | Status |
|--------|-----|------|--------|
| Détection | `status=post_checkup` | `isPostCheckup = state?.investigation_state?.status === "post_checkup"` | ✅ |
| Indexation queue | `pending:post_checkup_parking_lot` | Oui | ✅ |
| Nudge low-stakes | Reprendre au prochain turn calme | `pickPendingFromSupervisorQueue` priorité 1 | ✅ |
| Priorité nudge | Post-checkup > profile_confirm > global_deferred | Oui, dans `pickPendingFromSupervisorQueue` | ✅ |

**Status**: ✅ Complet

---

### 5. ARCHITECT TOOL FLOW
**Source de vérité**: `temp_memory.architect_tool_flow`

| Aspect | RFC | Code | Status |
|--------|-----|------|--------|
| Détection active | `flow présent + stage non terminal` | `toolFlowActiveGlobal = Boolean(tempMemory.architect_tool_flow)` | ✅ |
| Sync supervisor | Session dans stack | `syncLegacyArchitectToolFlowSession()` | ✅ |
| Cancel on stop/boredom | Oui, sans friction | `boredOrStop && toolFlowActiveGlobal → setArchitectToolFlowInTempMemory(null)` | ✅ |
| Pause on digression | Queue l'intent | `queued_due_to_irrelevant_active_session:architect_tool_flow` | ✅ |
| Resume nudge | "Reprendre ?" sur low-stakes | `ENABLE_SUPERVISOR_RESUME_NUDGES_V1` + `__router_resume_prompt_v1` | ✅ |
| TTL | 60 min | `TTL_ARCHITECT_TOOL_FLOW_MS = 60 * 60 * 1000` | ✅ |
| Stale cleanup | Automatique | `pruneStaleArchitectToolFlow()` | ✅ |

**Status**: ✅ Complet

---

### 6. USER PROFILE CONFIRM
**Source de vérité**: `temp_memory.user_profile_confirm.pending`

| Aspect | RFC | Code | Status |
|--------|-----|------|--------|
| Détection pending | `pending !== null` | `Boolean(tempMemory.user_profile_confirm?.pending)` | ✅ |
| Hard guard companion | Route vers companion | `pending && targetMode not safety/investigator → companion` | ✅ |
| Indexation queue | `pending:user_profile_confirm` | Oui, avec `message_excerpt` = key | ✅ |
| Nudge low-stakes | "Au fait, confirmation..." | `pickPendingFromSupervisorQueue` priorité 2 | ✅ |
| TTL | 7 jours | `TTL_USER_PROFILE_CONFIRM_MS = 7 * 24 * 60 * 60 * 1000` | ✅ |
| Stale cleanup | Automatique | `pruneStaleUserProfileConfirm()` | ✅ |

**Status**: ✅ Complet

---

### 7. GLOBAL DEFERRED TOPICS
**Source de vérité**: `temp_memory.global_deferred_topics`

| Aspect | RFC | Code | Status |
|--------|-----|------|--------|
| Détection pending | `items.length > 0` | `Array.isArray(items) && items.length > 0` | ✅ |
| Indexation queue | `pending:global_deferred_nudge` | Oui, seulement si low-stakes turn | ✅ |
| Nudge | "Au fait, on avait parlé de..." | `maybeInjectGlobalDeferredNudge()` | ✅ |
| Priorité nudge | Dernière (après post-checkup et profile_confirm) | Oui, priorité 3 dans `pickPendingFromSupervisorQueue` | ✅ |
| TTL | 7 jours par item | `pruneGlobalDeferredTopics()` | ✅ |

**Status**: ✅ Complet

---

### 8. TOPIC SESSION
**Source de vérité**: `temp_memory.supervisor.stack[type=topic_session]`

| Aspect | RFC | Code | Status |
|--------|-----|------|--------|
| Création | Automatique chaque turn | `upsertTopicSession()` | ✅ |
| Phases | opening → exploring → converging → closing | Oui, basé sur `loopCount` et `bored` | ✅ |
| Handoff on stop | phase=closing + handoff_to=companion | `handoffTo = phase === "closing" && targetMode === "architect" ? "companion" : undefined` | ✅ |
| Auto-close | Si phase=closing et user continue sans boredom | `closeTopicSession()` appelé | ✅ |
| resume_brief | Généré automatiquement | `"On parlait de: ${topic}"` | ✅ |
| TTL | 2 heures | `TTL_TOPIC_SESSION_MS = 2 * 60 * 60 * 1000` | ✅ |
| Topic filtering | Éviter topics génériques | `guessTopicLabel()` filtre "ok", "merci", etc. | ✅ |

**Status**: ✅ Complet

---

## 🎯 ORDRE DE PRIORITÉ VÉRIFIÉ

```
1. SAFETY (sentry/firefighter) — préempte tout
   ↓
2. HARD_BLOCKER (bilan actif) — sauf safety et explicit_stop
   ↓
3. FOREGROUND (toolflow architect / topic_session) — cancel/pause possible
   ↓
4. PENDING (profile_confirm) — nudge opportuniste
   ↓
5. OPPORTUNISTIC (global_deferred) — nudge très conservateur
```

**Code vérifié**: L'ordre dans `buildRouterDecisionV1` et la logique de routing respectent cette hiérarchie.

---

## ⚠️ GAPS IDENTIFIÉS

### ~~Gap 1: Reprise après safety overlay (sentry/firefighter)~~ ✅ CORRIGÉ
**RFC dit**: "Après stabilisation, proposer reprise du flow précédent (ou abandon)"
**Solution implémentée** (22 jan 2026):
- Quand firefighter/sentry préempte un toolflow actif, on stocke `__router_safety_preempted_v1`
- Au prochain low-stakes turn (risk=0, companion), on propose: "Tu as l'air d'aller mieux. Tu veux qu'on reprenne ce qu'on faisait avant, ou on laisse tomber ?"
- TTL: 30 minutes
- Reason code: `SAFETY_PREEMPTED_FLOW`

### Gap 2: Investigation state pas dans supervisor.stack (mineur)
**RFC dit**: Bilan pourrait avoir une session dans le stack pour cohérence
**Code actuel**: Bilan est détecté via `investigation_state` directement, pas via supervisor

**Impact**: Faible — le hard guard fonctionne parfaitement. La sync n'est pas nécessaire car `investigation_state` EST la source de vérité et le supervisor n'a pas besoin de la dupliquer.

---

## ✅ CONCLUSION

**8/8 machines correctement indexées et prioritisées.**

**1 gap corrigé** (reprise safety), **1 gap mineur non bloquant** (sync investigator optionnel).

Le système est **production-ready** avec:
- Priorités correctes
- TTL uniformes
- Cleanup automatique
- Nudges conditionnels
- Reason codes complets
- Logs détaillés (`router_decision_v1`)

---

*Audit réalisé le 22 janvier 2026*

