# QA Run — Clarification Local Flow Real R1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `clarification-local-flow-real-20260608-r1`
- Persona: Alex, connexion locale existante, scope isolé `qa-clarification-local-flow-real-r1-20260608`
- Objectif: vérifier en conditions réelles le trajet clarification `product_help` vs `prepare_attack_card`, puis résolution vers préparation sans création durable depuis clarification.
- Trajectoire: 2 tours via `/functions/v1/test-send-message`, `force_full_ai=true`, pilotés après lecture de la réponse précédente.
- Surfaces visees: dispatcher L1, `orientation_clarification`, clarification active, target dispatcher `prepare_attack_card`, EffectLedger, temp memory, DB.
- Cadre IA reel: Supabase local, endpoint local, vrai chemin Sophia, pas de renderer déterministe appelé comme QA, pas de fallback `processMessage`.
- Validite QA: valide. Incidents initiaux documentés: création de connexion temporaire impossible car `qa-create-run-connection.sh` ne parse pas la sortie `supabase status` préfixée; premier call curl connect KO; tentative suivante 401 par ANON_KEY recopiée avec faute. Run final exploitable à partir de `t1-retry3` et `t2`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PREF-01 — préférence de tutoiement non appliquée

**User**
> Je ne sais pas si je veux juste comprendre la carte attaque ou en préparer une pour mon blocage de demain matin.

**Sophia**
> Préférez-vous que je vous explique le fonctionnement de la carte attaque ou que nous commencions directement à en préparer une pour demain ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: clarification, no execution
- pending_confirmation: none
- memory_plan: no DB-visible active state captured in trace
- executed_tools: `[]`
- durable_effect: none
- EffectLedger: `asked=1`, `kind=clarification`, `effect_type=clarification.intent`, `no_chat_mutation=true`

**Analyse si yellow/red**
- Symptome: la clarification est pertinente et non-mutante, mais elle vouvoie (`Préférez-vous`, `vous`) alors que Sophia doit tutoyer.
- Source amont probable: visible agent / prompt de clarification ne force pas encore le tutoiement dans le chemin réel.
- Owner runtime: `clarification.visible_agent` / prompt visible clarification.
- Meilleure correction selon les guidelines: renforcer le contrat visible clarification pour tutoiement et ajouter un guard/test visible sur `vous/souhaitez-vous/préférez-vous`.
- Pourquoi ce n'est pas un patch local: le problème est un invariant de ton cross-flow, pas une phrase exacte de ce scénario.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-TEST-01 — preuve runtime/trace insuffisante pour le contrat local

**User**
> Préparons-la pour demain matin : je risque de repousser dès le réveil.

**Sophia**
> C'est une excellente idée d'anticiper ce moment. Est-ce que votre action de demain matin est bien la cible que vous voulez viser pour cette carte ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `orientation_clarification_resolved_tool_skill`
- safety: `low`
- direct_effects: `[]`
- operation: `prepare_attack_card`
- pending_confirmation: none
- memory_plan: `__active_attack_card_handoff` present after turn
- executed_tools: `[]`
- durable_effect: none; `user_attack_cards` count for user: `0`
- EffectLedger: `blocked=1`, `effect_type=attack_card.create`, `reason_code=collecting`, `executed_tool=false`

**Analyse si yellow/red**
- Symptome: la résolution va bien vers `prepare_attack_card` et ne crée pas de carte, mais la preuve runtime ne montre pas explicitement `__clarification_flow_state` ni `note_information` transmise au target dispatcher. Le texte visible continue aussi à vouvoyer.
- Source amont probable: trace/final runtime integration autour de `clarification_arbitrator`; `run.ts` consomme la résolution de compatibilité mais ne rend pas la note observable dans la trace courte.
- Owner runtime: clarification arbitration + router trace/testability.
- Meilleure correction selon les guidelines: exposer la `note_information` de clarification dans trace/EffectLedger ou dans le handoff runtime target, et vérifier que l'état local `__clarification_flow_state` est observable au tour ask avant résolution.
- Pourquoi ce n'est pas un patch local: le comportement visible peut sembler OK, mais le contrat architecture exige une preuve de transfert d'ownership, pas seulement un bon handler final.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia repère bien l'ambiguïté entre comprendre et préparer.
- Elle pose une seule question au tour 1.
- Après le choix user, elle reprend naturellement vers la préparation.
- Elle ne prétend pas avoir créé une carte.

**Problemes**
- Tour 1: vouvoiement dans une clarification. Famille: BF-PREF-01. Impact: ton incohérent avec Sophia et avec les attentes de clarification. Severite: yellow.
- Tour 2: vouvoiement encore présent et question un peu redondante, car le user a déjà donné une cible assez claire (`blocage de demain matin`, `repousser dès le réveil`). Famille: BF-INTAKE-01. Impact: friction légère; l'utilisateur doit confirmer une cible déjà formulée. Severite: yellow.

**Fix propose**
- Source amont: visible agent clarification + intake `prepare_attack_card`.
- Correction recommandee: forcer le tutoiement dans les prompts/guards visibles; transmettre à `prepare_attack_card` la note/cible structurée issue de la clarification pour éviter de redemander la cible quand elle est suffisante.
- Tests d'invariant attendus: clarification product_help vs attack card sans vouvoiement; résolution avec cible fournie -> pas de redemande générique de cible; anti-FP où cible vraiment absente -> question ciblée autorisée.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tour 1 route correctement vers `orientation_clarification`.
- Tour 2 résout vers `tool_skill/prepare_attack_card` via `orientation_clarification_resolved_tool_skill`.
- Aucun global normal visible pendant le tour de clarification dans la trace courte, mais la preuve du nouveau state local n'est pas observable.

**Skills / Operations / Tools**
- `prepare_attack_card` démarre en collecte après résolution.
- Aucun executor n'est appelé depuis clarification.
- Aucun outil durable n'est exécuté; EffectLedger bloque `attack_card.create` avec `reason_code=collecting`.

**Memory / Effets durables**
- `chat_messages`: 4 messages créés dans le scope QA puis nettoyés.
- `user_chat_states`: `__active_attack_card_handoff` créé après T2 puis retiré par cleanup ciblé; autres clés temp_memory préservées.
- `user_attack_cards`: aucun enregistrement créé.
- Cleanup ciblé: OK, `messages_remaining=0`, `active_attack_handoff_present=false`.

**Problemes**
- Tour 1-T2: absence de preuve explicite `note_information` dans la trace courte malgré changement de dispatcher. Famille: BF-TEST-01. Impact systeme: le contrat architectural n'est pas vérifiable en QA réelle sans inspection plus profonde. Severite: yellow.
- Tour 2: cible redemandée malgré indices fournis. Famille: BF-INTAKE-01. Impact systeme: la note/cible clarifiée ne semble pas suffisamment consommée par le dispatcher cible. Severite: yellow.

**Fix propose**
- Source amont: `clarification_arbitrator` -> `run.ts` handoff metadata -> target dispatcher context.
- Correction recommandee: rendre la note de clarification observable et consommable par le dispatcher cible; enrichir le handoff attack card avec `selected_candidate_payload_hint`, `user_words`, `original_conflict_summary`.
- Tests d'invariant attendus: run réel résolution clarification vers attack card avec trace `note_information.target_dispatcher=prepare_attack_card`; DB no card; active handoff reçoit la cible user sans redemande quand suffisante.

## Verdict Global

- Verdict: yellow
- Raison principale: le chemin réel clarifie puis résout vers `prepare_attack_card` sans effet durable, mais le visible agent vouvoie et la preuve `note_information/__clarification_flow_state` reste insuffisante.
- Follow-up prioritaire: fixer le tutoiement clarification et rendre le handoff `note_information` observable/consommé par le dispatcher cible.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-08-clarification-local-flow-real-r1-bugs.md`
