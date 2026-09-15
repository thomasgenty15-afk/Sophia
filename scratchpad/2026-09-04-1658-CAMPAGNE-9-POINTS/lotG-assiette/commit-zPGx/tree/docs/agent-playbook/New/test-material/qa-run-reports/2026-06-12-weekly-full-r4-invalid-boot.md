# QA Run Report — Weekly Full R4 Invalid Boot

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `weekly-full-20260612-r4-rose`
- Persona: Rose, connexion locale `tests/real-personas/rose/connection.json`
- Objectif: lancer un weekly complet en IA reelle locale, avec au moins 8 tours si le flow restait exploitable.
- Trajectoire: weekly actif prepare avec trois actions du plan `Libération progressive du cannabis`, puis premier tour utilisateur choisi apres preparation du contexte.
- Surfaces visees: `weekly_review`, dispatcher local actif, reducer local, visible agent, bridges vers detours, routing local `/functions/v1/test-send-message`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback `processMessage`, run hors sandbox.
- Validite QA: invalide pour juger la conversation weekly; valide comme run rouge technique, car le chemin IA reel renvoie `503 BOOT_ERROR` avant toute trace conversationnelle.

Tentatives de preparation non exploitees: Alex, Paul et Nina n'avaient pas assez de plan items decouverts pour construire l'etat weekly QA. Rose a ete retenue car le runner a trouve trois actions: `Ranger le matériel hors de vue`, `Cibler le joint réflexe`, `Faire un sas de décompression (sans fumer)`.

Nettoyage: effectue. Le `user_chat_states` cree pour le scope QA a ete supprime, les messages du scope ont ete supprimes, `remaining_scope_messages=0`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 — Trace/test incoherent ou suite malsaine

**User**
> Oui, on peut faire le weekly. Globalement la semaine a été un peu bizarre : j’ai eu deux bons débuts de journée, mais le soir j’étais fatiguée et j’ai encore eu des automatismes. Je ne sais pas trop si je dois voir ça comme un progrès ou comme un échec.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: `503`
- response_owner: `null`
- selected_handler: `null`
- route_reason: `null`
- safety: `null`
- direct_effects: `[]`
- operation: `null`
- pending_confirmation: `null`
- memory_plan: `null`
- executed_tools: `[]`
- durable_effect: aucun message cree, aucune trace creee, aucun effet durable du tour
- error: `{"code":"BOOT_ERROR","message":"Worker failed to boot (please check logs)"}`

**Analyse si yellow/red**
- Symptome: le worker Sophia ne boote pas; le run s'arrete au premier appel reel.
- Source amont probable: import legacy restant dans `supabase/functions/sophia-brain/router/adjust_plan_operation_bridge.ts`.
- Preuve systeme: `/usr/local/bin/deno check ...` echoue avec `TS2305: Module ... weekly_review/runtime.ts has no exported member 'isExplicitPendingApplyConfirmation'` a la ligne 14 de `adjust_plan_operation_bridge.ts`.
- Owner runtime: bridge operationnel `adjust_plan_operation_bridge`, avec dependance vers `weekly_review/runtime`.
- Meilleure correction selon les guidelines: supprimer ou remplacer l'import legacy au niveau owner du bridge, puis verifier que la logique de confirmation adjust-plan ne depend plus du vieux weekly plan patch. Ne pas ajouter de regex, de fallback ou de renderer de secours.
- Pourquoi ce n'est pas un patch local: le bug casse le boot global de la fonction Edge; la correction doit restaurer le contrat de compilation entre le bridge adjust-plan et le runtime weekly, pas contourner le test.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Rien d'evaluable cote conversation: Sophia ne produit aucune reponse visible.
- Le message utilisateur etait adapte a l'objectif weekly: ressenti de semaine, fatigue, automatismes, doute sur la progression.

**Problemes**
- Tour 1: reponse vide a cause du boot worker. Famille: BF-TEST-01. Impact: impossible de juger si le weekly lead correctement les etapes, les approfondissements, les detours ou la cloture. Severite: red.

**Fix propose**
- Source amont: contrat d'exports/imports entre `weekly_review/runtime.ts` et `router/adjust_plan_operation_bridge.ts`.
- Correction recommandee: retirer la dependance au helper supprime `isExplicitPendingApplyConfirmation` ou la remplacer par le mecanisme de confirmation IA/structuree actuel du bridge, en gardant la responsabilite adjust-plan hors du renderer visible.
- Tests d'invariant attendus: `deno check` du worker complet, test integration du bridge adjust-plan, puis rerun weekly full reel avec au moins 8 tours.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Aucun routage n'a pu etre observe. Le worker a echoue avant production de `conversation_turn_trace`.
- Le dispatcher local weekly n'a donc pas pu prouver que le global dispatcher etait bien skippe pendant le flow actif.

**Skills / Operations / Tools**
- Aucun skill conversationnel, tool ou operation n'a ete execute.
- L'echec est anterieur au dispatcher: boot de fonction Edge casse par import invalide.

**Memory / Effets durables**
- Le runner a prepare un active skill state weekly pour Rose.
- Apres le `503`, l'inspection durable indique `messages=0`, `traces=0`.
- Cleanup scoped effectue: le scope QA cree a ete supprime et `remaining_scope_messages=0`.

**Problemes**
- Tour 1: boot worker casse par reference legacy. Famille: BF-TEST-01. Impact systeme: tout run IA reel local de Sophia est bloque tant que cet import invalide existe. Severite: red.

**Fix propose**
- Source amont: `supabase/functions/sophia-brain/router/adjust_plan_operation_bridge.ts:14`.
- Correction recommandee: aligner le bridge sur le nouveau contrat weekly sans restaurer le helper legacy supprime. Si une confirmation pending adjust-plan reste necessaire, elle doit venir du contrat de confirmation operationnel actuel, pas d'une fonction weekly legacy.
- Tests d'invariant attendus:
  - `deno check supabase/functions/sophia-brain/index.ts ...`
  - test integration du bridge adjust-plan sans import weekly legacy;
  - run weekly reel complet reprenant ce scenario Rose;
  - anti-regression: aucune reapparition de `prepare_plan_handoff`, `plan_patch`, `isExplicitPendingApplyConfirmation` dans le runtime weekly V1.

## Verdict Global

- Verdict: red
- Raison principale: le chemin IA reel local ne boote pas a cause d'un import legacy supprime mais encore reference par le bridge adjust-plan.
- Follow-up prioritaire: corriger l'import/contrat du bridge, relancer `deno check`, puis refaire le weekly full run reel jusqu'a la synthese et la cloture.
