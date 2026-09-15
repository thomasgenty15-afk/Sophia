# QA Run Report - product-help-local-bridges-20260612-r2-invalid

## 1. Contexte Du Test

- Date: 2026-06-12.
- Runs: `product-help-local-bridges-20260612-r1-attack`, puis reprise `product-help-local-bridges-20260612-r2-attack`.
- Persona: users QA temporaires dedies.
- Objectif: verifier en conditions reelles que `product_help` explique sans creer, puis peut sortir vers les flows/outils locaux attendus, notamment `prepare_attack_card`.
- Trajectoire visee: question produit sur cartes attaque/defense, puis demande operationnelle de carte d'attaque.
- Surfaces visees: `/functions/v1/test-send-message`, dispatcher global, flow local `product_help`, handoff local vers `prepare_attack_card`, traces, effets durables.
- Cadre IA reel: Supabase local, endpoint local, `force_full_ai=true`, hors sandbox, pas de staging, pas de renderer deterministe, pas de fallback `processMessage`.
- Validite QA: invalide. Les deux tentatives echouent avant tout routage avec HTTP 503 `BOOT_ERROR`.
- Nettoyage: effectue pour R1 et R2. Les users QA temporaires et tables principales du scope ont ete nettoyes. `user_memories` a retourne 404 dans les deux cleanups, sans artefact QA restant signale par le runner.

## 2. Tours De Conversation

### Tour 1 - R1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> Je suis un peu perdu dans Sophia : une carte d'attaque et une carte de defense, ce n'est pas la meme chose ? Explique-moi juste la difference, sans rien creer.

**Sophia**
> Reponse vide.

**Trace courte**
- http_status: `503`
- raw_response: `{"code":"BOOT_ERROR","message":"Worker failed to boot (please check logs)"}`
- response_owner: `null`
- selected_handler: `null`
- route_reason: `null`
- safety: `null`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- memory_plan: `null`
- executed_tools: `[]`
- durable_effect: aucun observe

**Analyse si yellow/red**
- Symptome: le worker Edge ne boote pas, donc aucun dispatcher, skill ou prompt local n'est atteint.
- Source amont probable: runtime local Edge Function / boot de `sophia-brain`, avant `test-send-message` exploitable.
- Owner runtime: testability / Edge runtime local / fonction `sophia-brain`.
- Meilleure correction selon les guidelines: inspecter les logs du process local qui sert les functions et corriger l'erreur de boot amont. Ne pas remplacer par un runner direct, un fallback deterministe ou staging.
- Pourquoi ce n'est pas un patch local: le flow product_help n'a pas ete execute, donc le run ne prouve ni un bug ni un succes du bridge product_help.

### Tour 1 - R2 Reprise

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> Je suis un peu perdu dans Sophia : une carte d'attaque et une carte de defense, ce n'est pas la meme chose ? Explique-moi juste la difference, sans rien creer.

**Sophia**
> Reponse vide.

**Trace courte**
- http_status: `503`
- raw_response: `{"code":"BOOT_ERROR","message":"Worker failed to boot (please check logs)"}`
- response_owner: `null`
- selected_handler: `null`
- route_reason: `null`
- safety: `null`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- memory_plan: `null`
- executed_tools: `[]`
- durable_effect: aucun observe

**Analyse si yellow/red**
- Symptome: meme echec que R1 sur un nouveau user QA temporaire avec auth locale valide.
- Source amont probable: boot local de la fonction, pas donnees user.
- Owner runtime: testability / Edge runtime local / fonction `sophia-brain`.
- Meilleure correction selon les guidelines: recuperer les logs du process `supabase functions serve` deja lance, corriger le boot, puis relancer un nouveau run QA reel.
- Pourquoi ce n'est pas un patch local: l'echec se produit avant selection de handler; aucun signal ne permet d'auditer `product_help.local_flow`.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Rien de conversationnellement exploitable: Sophia ne repond pas.

**Problemes**
- Tour 1 R1/R2: reponse vide avec HTTP 503. Famille: `BF-TEST-01`. Impact: conversation impossible. Severite: red.

**Fix propose**
- Source amont: Edge runtime local / boot de la fonction `sophia-brain`.
- Correction recommandee: lire les logs du process local qui sert les functions, corriger l'erreur de boot sans redemarrage interdit pendant le run, puis refaire un run QA complet.
- Tests d'invariant attendus: un appel `/functions/v1/test-send-message` avec `force_full_ai=true` doit produire `http_status=200`, un `response_owner` non nul, un `selected_handler` exploitable, et aucune reponse reconstruite hors chemin IA.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Aucun routage observable. `response_owner`, `selected_handler` et `route_reason` restent `null` sur R1 et R2.
- L'auth locale du user QA est valide (`auth_check.status=200`) dans les deux tentatives.
- Un probe HTTP sans authorization sur l'endpoint local retourne un 401 gateway, ce qui indique que l'API locale repond, mais pas que le worker boote correctement.

**Skills / Operations / Tools**
- Aucun skill actif.
- Aucun `product_help` observable.
- Aucun handoff vers `prepare_attack_card` observable.
- Aucun tool appele.

**Effets Durables**
- Aucun effet durable observe.
- Cleanup cible execute pour les deux runs:
  - `chat_messages`: 204
  - `scheduled_checkins`: 204
  - `user_chat_states`: 204
  - `user_topic_memories`: 204
  - `memory_items`: 204
  - `auth.users`: 200
  - `user_memories`: 404, table ou ressource absente dans ce perimeter cleanup.

**Fix propose**
- Source amont: boot local de la Edge Function, a diagnostiquer dans les logs du process local.
- Correction recommandee: resoudre le `BOOT_ERROR`, puis relancer exactement le meme objectif QA avec un nouveau run id. Ne pas conclure sur les bridges product_help depuis ce run.
- Tests d'invariant attendus: demarrage worker OK, T1 product_help explicatif sans effet, T2 sortie vers flow cible ou global selon contrat, trace de `note_information`/handoff, pas de renderer deterministe.

## 5. Verdict Global

**Verdict: red - run techniquement invalide.**

Le test reel a bien ete lance localement avec `force_full_ai=true`, mais Sophia n'a jamais atteint le runtime conversationnel. Le fix product_help ne peut pas etre valide ni invalide par ce run. La prochaine action est de corriger le `BOOT_ERROR` du worker local, puis de relancer un run complet.
