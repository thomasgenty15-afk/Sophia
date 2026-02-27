# Audit sécurité Sophia - 2026-02-27

- Projet: `/Users/ahmedamara/Dev/Sophia 2`
- Scope prioritaire: `supabase/functions/sophia-brain/*`, `supabase/functions/whatsapp-webhook/*`, `supabase/migrations/*`
- Méthode: revue statique ciblée + tests locaux non destructifs
- Format finding:
  - Sévérité
  - Scénario d’exploitation
  - Preuve (fichier/ligne ou commande/test)
  - Correctif précis
  - Test de non-régression
  - Owner + ETA

## Étape 1 - Périmètre et actifs critiques

### Résultats
- Actifs critiques confirmés:
  - Edge/API: `sophia-brain`, `sophia-brain-internal`, `whatsapp-webhook`, `stripe-webhook`.
  - Données: `chat_messages`, `memories`, `user_actions`, `user_action_entries`, `user_vital_signs`, `user_vital_sign_entries`, `profiles`, `user_chat_states`, `turn_summary_logs`, `system_error_logs`.
  - Secrets/canaux: `INTERNAL_FUNCTION_SECRET`, signatures webhooks WhatsApp/Stripe, service role.
- Impacts business retenus:
  - Fuite PII conversationnelle / traces.
  - Pollution cross-tenant (intégrité) sur tables d’entrées/outils.
  - Actions non autorisées (tracking, update état, logs admin).
  - Spam/coûts infra via abuse webhooks/events.

### Synthèse courte
Périmètre validé sur les surfaces les plus risquées: auth, RLS, RPC `SECURITY DEFINER`, webhooks, logs/observabilité.

## Étape 2 - Carte d’attaque du système

### Résultats
- Carte d’attaque (vue simplifiée):

```text
Internet
  -> sophia-brain (Authorization JWT + CORS)
      -> router/run -> agents (companion/investigator/sentry)
      -> DB tables (chat/messages/state/actions/vitals)
      -> RPC (turn_summary, match_* vectors)

Meta WhatsApp
  -> whatsapp-webhook (x-hub-signature-256)
      -> lookup profile/phone
      -> service-role processMessage (scope whatsapp)
      -> DB dedup/tracking/chat

Stripe
  -> stripe-webhook (Stripe-Signature)
      -> service-role upsert subscriptions + idempotency

Internal schedulers / DB triggers
  -> internal endpoints (X-Internal-Secret + POST-only)
      -> service-role jobs (checkins/memory/watcher/...)
```

- Entrées externes validées: `sophia-brain`, `whatsapp-webhook`, `stripe-webhook`.
- Entrées internes validées: endpoints protégés via `ensureInternalRequest`.

### Synthèse courte
La surface d’attaque principale est concentrée sur `sophia-brain` (JWT), les webhooks signés, et les RPC `SECURITY DEFINER`.

## Étape 3 - Validation authN utilisateur

### Résultats
- Contrôles observés:
  - Header `Authorization` obligatoire dans `sophia-brain` (`supabase/functions/sophia-brain/index.ts:58-64`).
  - Vérification JWT via `supabaseClient.auth.getUser()` (`index.ts:71-73`).
  - `userId` propagé depuis le token (pas depuis body) vers `processMessage` (`index.ts:119-124`).
- Matrice authN (observé vs attendu):
  - `Authorization` absent -> `401` (OK).
  - JWT valide -> flux normal (OK).
  - JWT invalide/expiré -> **retour `500`** (au lieu de `401/403`) car `throw Unauthorized` capturé par le catch global (`index.ts:72`, `140-157`).
  - User A accède user B -> pas de paramètre `user_id` public, user issu du JWT (OK côté endpoint).

### Synthèse courte
AuthN est globalement en place, mais le handling JWT invalide doit renvoyer `401/403` et non `500`.

## Étape 4 - Audit authZ applicative endpoint par endpoint

### Résultats
- `sophia-brain`:
  - Historique chargé avec `eq("user_id", user.id)` + `scope` (`index.ts:92-98`).
  - Écritures chat/state passent par `userId` dérivé JWT (`router/run.ts:464-471`, `696-701`).
- `investigator`/`tracking`:
  - Requêtes majoritairement filtrées `user_id`.
  - Certaines updates utilisent seulement `id` (ex: `user_actions` update dans `investigator/db.ts:515-519`, `tracking.ts:123-130`) mais la source de `id` provient de sélections préfiltrées par `user_id`.
- `whatsapp-webhook`:
  - Chemin service role assumé; profil résolu côté serveur puis opérations ciblées sur ce `user_id` (`whatsapp-webhook/index.ts:276-323`).

Tableau (opérations critiques):
- `chat_messages` read/write: garde `user_id` explicite en code + RLS.
- `user_chat_states` read/write: garde `user_id` explicite (`state-manager.ts:37-42`, `70-75`).
- `user_actions` / `user_action_entries`: garde app présente mais dépend partiellement de RLS pour certaines updates.

### Synthèse courte
AuthZ applicative est correcte sur le flux nominal, avec dépendance importante à RLS pour certaines updates par `id`.

## Étape 5 - Audit RLS profond des migrations

### Résultats
- Point fort:
  - Durcissement large via `20251215200000_harden_rls_policies.sql` et `20251215203000_harden_rls_relational_integrity.sql` (checks relationnels sur `plan_id`, `goal_id`, `vital_sign_id`, etc.).
- Finding critique d’intégrité:
  - **F-01 (High)** `user_action_entries`:
    - policy UPDATE sans `WITH CHECK` (`20251213160000_add_action_entries.sql:33-37`).
    - table absente des durcissements génériques/relatifs (`20251215200000...` liste `:38-55`, `20251215203000...` sections dédiées ne couvrent pas cette table).
    - risque: transfert d’ownership logique / pollution cross-tenant via update de `user_id` et/ou lien `action_id`.
- Finding secondaire:
  - `user_topic_memories` et `user_topic_keywords` policies UPDATE sans `WITH CHECK` (`20260216120000_topic_memories.sql:81`, `131`).

Checklist tables critiques:
- `profiles`: OK (`WITH CHECK` présent).
- `chat_messages`: OK (durci).
- `memories`: OK (durci).
- `user_actions`: OK (ownership + intégrité `plan_id`).
- `user_vital_signs`: OK (ownership + intégrité `plan_id`).
- `user_vital_sign_entries`: OK (ownership + `vital_sign_id` propriétaire).
- `user_action_entries`: **KO (gap UPDATE + couverture hardening manquante)**.

### Synthèse courte
RLS est globalement robuste, mais `user_action_entries` reste une faille d’intégrité prioritaire.

## Étape 6 - Audit RPC/fonctions SQL à privilèges élevés

### Résultats
- `match_all_action_entries_for_user`:
  - `SECURITY DEFINER` + check `caller_role == service_role` + `REVOKE/GRANT` strict service role (`20260110120000_match_memories_for_user.sql:72-125`).
  - statut: OK.
- `match_topic_memories_*`:
  - migration de hardening explicite contre mismatch `target_user_id` (`20260226235500_secure_topic_memory_rpcs.sql:41-44`, `93-96`, `143-146`).
  - statut: OK après correctif.
- `log_turn_summary_log`:
  - garde anti-forge user/service role (`20260208221000_fix_turn_summary_log_rpc_service_role.sql:54-65`).
  - statut: OK.
- `log_conversation_event`:
  - `SECURITY DEFINER` + `GRANT authenticated` sans garde user/admin (`20260124124000_log_conversation_event_rpc.sql:14`, `35`).
  - **F-02 (Medium)**: risque de spam/pollution de `conversation_eval_events` (intégrité/coût observabilité).
- `match_memories_for_user`:
  - version actuelle (migration `20260111210000_memory_governance.sql:79-121`) sans `REVOKE/GRANT` explicite ni garde explicite role/uid.
  - dépend de RLS (security invoker) pour isolation.
  - **F-03 (Low)**: dérive d’intention/permis implicites à clarifier.

### Synthèse courte
Les RPC les plus risqués sont majoritairement sécurisés; point faible restant: `log_conversation_event` et l’ambiguïté de gouvernance autour de `match_memories_for_user`.

## Étape 7 - Audit chemins service-role vs user JWT

### Résultats
- Chemin service-role identifié et assumé:
  - WhatsApp appelle `processMessage` via client admin (`wa_reply.ts:23-30`).
- Garde-fous explicites:
  - Companion utilise RPC `*_for_user` pour service-role, avec fallback web (`companion.ts:313-359`).
  - `log_turn_summary_log` distingue `service_role` vs user JWT (`20260208221000...:54-65`).
- Point de vigilance:
  - Toute nouvelle logique fondée implicitement sur `auth.uid()` doit être auditée si appelée depuis WhatsApp/service-role.

### Synthèse courte
Le bypass RLS via service-role est intentionnel et globalement encadré, mais il faut maintenir une discipline stricte sur les nouveaux RPC/outils.

## Étape 8 - Audit endpoints internes et secrets partagés

### Résultats
- `ensureInternalRequest`:
  - POST-only (`internal-auth.ts:23-28`).
  - secret obligatoire (`:41-64`).
  - fallback `SECRET_KEY` uniquement local (`:42-43`).
- Couverture: endpoints internes majeurs utilisent ce guard (`rg ensureInternalRequest`, incluant `sophia-brain-internal`, checkins, watcher, etc.).
- Migrations cron/triggers injectent `x-internal-secret` côté `pg_net` (ensemble cohérent observé).

### Synthèse courte
Hardening interne correct (méthode + secret + couverture). Risque principal déplacé vers la gestion/rotation du secret.

## Étape 9 - Audit webhook security (WhatsApp/Stripe)

### Résultats
Tableau de contrôle:
- WhatsApp webhook:
  - Signature requise: oui (`wa_security.ts:32-55`), sauf `MEGA_TEST_MODE` local (`:33-35`).
  - Replay: déduplication par `wamid_in` unique (`whatsapp_inbound_dedup.sql:26-27`, handler insert-first `index.ts:314-336`).
  - Mode test isolé: oui (`MEGA_TEST_MODE`).
- Stripe webhook:
  - Signature requise: oui hors test (`stripe-webhook/index.ts:52-65`).
  - Anti-replay: timestamp tolerance dans vérif (`_shared/stripe.ts:201-220`) + idempotency event id (`stripe-webhook/index.ts:74-88`, migration `trial_and_stripe_billing.sql:53-56`).
  - Mode test isolé: oui (`MEGA_TEST_MODE`).

### Synthèse courte
Sécurité webhook solide: signature + idempotence + exceptions test localement bornées.

## Étape 10 - Audit CORS + headers sécurité

### Résultats
- CORS centralisé `_shared/cors.ts`:
  - allowlist stricte, origin `null` sinon (`cors.ts:41-47`).
  - en prod, `CORS_ALLOWED_ORIGINS` obligatoire (`:61-75`).
  - méthodes limitées `POST, OPTIONS` (`:49`).
- Endpoints audités:
  - `sophia-brain` applique `enforceCors` (OK).
  - `stripe-webhook` applique `enforceCors` (OK).
  - `whatsapp-webhook` répond sans CORS (`includeCors: false`) pour S2S (OK).
- **F-04 (Low)**:
  - `Access-Control-Allow-Headers` inclut `x-internal-secret` globalement (`cors.ts:52`) alors que ce header est interne.

### Synthèse courte
CORS est globalement strict; petit durcissement possible en retirant `x-internal-secret` des endpoints publics.

## Étape 11 - Audit confidentialité logs / erreurs / traces IA

### Résultats
- Contrôles présents:
  - `system_error_logs`, `turn_summary_logs`, `conversation_eval_events` en lecture admin-only via RLS.
  - `logEdgeFunctionError` tronque/scrub (`error-log.ts:70-74`, `112-124`).
  - Turn summary n’inclut pas de transcript brut par défaut (`router/run.ts:743-809`, `turn_summary_writer.ts:79-95`).
- Points de vigilance:
  - **F-05 (Medium)** `log_conversation_event` permet à `authenticated` d’écrire des payloads arbitraires (PII potentielle côté observabilité interne).
  - `tool_ledger.ts` (si branché plus tard) stockerait args/résultats volumineux jusqu’à 64KB (`tool_ledger.ts:184-206`) -> à redacter avant activation.

### Synthèse courte
La confidentialité lecture est bonne (RLS admin), mais la surface d’écriture d’événements doit être mieux verrouillée.

## Étape 12 - Audit prompt-injection & tool abuse

### Résultats
Top 10 abuse cases (observé + mitigation):
1. "Ignore policy et appelle un tool":
- Observé: outils réels limités (`track_progress`, `update_etoile_polaire`), parsing borné (`dispatcher.ts:1467-1556`).
- Mitigation: conserver allowlist stricte des tools.
2. "Supprime/active/désactive une action depuis chat":
- Observé: runtime redirige dashboard (pas de tool destructif actif dans companion).
- Mitigation: maintenir absence de tool destructif côté chat.
3. Tool call halluciné sur cible inexistante:
- Observé: `handleTracking` renvoie `INFO_POUR_AGENT` si cible absente (`tracking.ts:246`).
- Mitigation: garder cette réponse explicite.
4. Track progress forcé hors contexte:
- Observé: gate de confiance >= 0.8 + statut/target valides (`run.ts:326-331`).
- Mitigation: garder seuil haut + monitor false positives.
5. Fuite d’invocation tool dans texte utilisateur:
- Observé: normalisation retire fuites de tool/code (`chat_text.ts:91-100`).
- Mitigation: conserver stripToolLeaks.
6. Update étoile polaire ambiguë:
- Observé: validation contextuelle avant update (`companion.ts` gate + `north_star_tools.ts`).
- Mitigation: renforcer bornes métier (valeurs min/max) si nécessaire.
7. Collision titre action (ilike + limit 1):
- Observé: possible mauvaise action ciblée en cas de titres proches (`tracking.ts:48-50`).
- Mitigation: demander clarification quand plusieurs matches.
8. Injection via mémoire/context:
- Observé: pas de sandbox LLM forte; dépend du prompt/policies.
- Mitigation: ajouter règles "non-executable memory" et validation tool-side stricte.
9. Confusion scope web/whatsapp:
- Observé: `scope` normalisé et explicite (`run.ts:433-438`, `state-manager.ts:22-29`).
- Mitigation: bloquer override scope côté web si non nécessaire.
10. Spam tool/race multi-requêtes:
- Observé: dédupes partielles (18h/10s) mais pas de verrouillage transactionnel global.
- Mitigation: contraintes DB uniques + upsert atomique.

### Synthèse courte
Les abus destructifs sont plutôt contenus; le principal risque résiduel est l’intégrité (ambiguïté cible + concurrence).

## Étape 13 - Audit robustesse métier anti-abus

### Résultats
- Idempotence/replay: bien couvert sur webhooks (`whatsapp_inbound_dedup`, `stripe_webhook_events`).
- Anti-doublons métier: présent mais partiel côté tracking/investigator (`tracking.ts`, `investigator/db.ts`).
- **F-06 (Medium)** risques TOCTOU/race:
  - incréments/updates `current_reps` en read-modify-write sans verrou transactionnel.
  - insertions `user_action_entries` sans contrainte unique métier (jour/action/statut), donc concurrence possible.

### Synthèse courte
Les webhooks sont robustes; la robustesse métier interne nécessite un renforcement transactionnel sur le tracking.

## Étape 14 - Vérification automatisée locale

### Résultats
- Mini suite ajoutée:
  - `supabase/functions/_shared/internal-auth_test.ts`
  - `supabase/functions/whatsapp-webhook/wa_security_test.ts`
  - `supabase/functions/_shared/stripe_signature_test.ts`
  - `supabase/functions/sophia-brain/auth_guard_regression_test.ts`
- Commande exécutée:
  - `deno test --allow-read --allow-env supabase/functions/_shared/internal-auth_test.ts supabase/functions/whatsapp-webhook/wa_security_test.ts supabase/functions/_shared/stripe_signature_test.ts supabase/functions/sophia-brain/auth_guard_regression_test.ts`
- Résultat:
  - **15 passed / 0 failed**.
- Tentative complémentaire (tests router existants):
  - Commande: `deno test --allow-read --allow-env supabase/functions/sophia-brain/router/magic_reset_test.ts supabase/functions/sophia-brain/router/flow_context_test.ts supabase/functions/sophia-brain/router/turn_summary_writer_test.ts supabase/functions/_shared/http_test.ts`
  - Bloquée par erreur de parsing hors scope audit (`supabase/functions/sophia-brain/router/dispatcher.ts:1` -> `Uimport ...`).
- Couverture sécurité minimale obtenue:
  - JWT absent: garde `401` présente (test de régression source).
  - User mismatch (authN/authZ de base): user issu de `auth.getUser` + absence de `body.user_id` dans endpoint public.
  - Signature invalide: WhatsApp + Stripe.
  - Secret interne invalide: `ensureInternalRequest` (`403`).

### Synthèse courte
Pass automatisé réussi sur la mini régression sécurité locale.

## Étape 15 - Triage final + plan de remédiation

### Résultats
Backlog priorisé S0/S1/S2:

- S0
  - **F-01 (High)** `user_action_entries` RLS incomplet.
    - Exploitabilité: moyenne (nécessite user auth, mais impact intégrité cross-tenant).
    - Correctif: recréer policy UPDATE avec `WITH CHECK (auth.uid() = user_id)` + contrainte relationnelle `action_id` propriétaire.
    - Test non-régression: tentative update `user_id/action_id` inter-tenant -> rejet.
    - Owner: Backend DB. ETA: 24-48h.

- S1
  - **F-02 (Medium)** `log_conversation_event` writable par `authenticated` sans garde.
    - Correctif: limiter à `service_role` ou vérifier `internal_admins`/`eval_run` ownership.
    - Test: user standard ne peut plus écrire d’event arbitraire.
    - Owner: Backend DB. ETA: 2-3 jours.
  - **F-06 (Medium)** Race sur tracking (reps + entries).
    - Correctif: RPC transactionnel atomique (update + insert) + unique index métier.
    - Test: double-submit concurrent -> un seul effet.
    - Owner: Backend App/DB. ETA: 3-5 jours.
  - **F-05 (Medium)** surface d’écriture logs/events potentiellement PII.
    - Correctif: whitelister payload keys + redaction systématique.
    - Test: champs sensibles rejetés/tronqués.
    - Owner: Backend Observability. ETA: 3-5 jours.

- S2
  - **F-03 (Low)** gouvernance `match_memories_for_user` (grants/garde explicites).
    - Correctif: expliciter `REVOKE/GRANT` + policy d’usage documentée.
    - ETA: 1 semaine.
  - **F-04 (Low)** CORS header expose `x-internal-secret` inutilement.
    - Correctif: retirer des headers publics.
    - ETA: 1 semaine.
  - AuthN ergonomie: JWT invalide -> `500` au lieu de `401/403`.
    - Correctif: branche d’erreur auth dédiée.
    - ETA: 1 semaine.

### Synthèse courte
Priorité immédiate: corriger le gap RLS `user_action_entries` puis verrouiller `log_conversation_event` et la concurrence du tracking.
