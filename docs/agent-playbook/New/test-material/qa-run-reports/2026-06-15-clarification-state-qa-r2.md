# QA Run Report — Clarification State QA R2

## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `clarif_state_qa_20260615_r2` + variante `clarif_state_qa_20260615_r2b`
- Persona: `qa-skill`, connexions temporaires `clarification_clarif_state_qa_20260615_r2` et `clarification_clarif_state_qa_20260615_r2b`
- Objectif: vérifier en conditions IA réelles que le flow clarification garde ses candidats actifs, résout vers le bon flow local, et ne produit aucun effet durable faux.
- Trajectoire:
  - N.1: ambiguïté attaque/défense formulée naturellement -> choix défense.
  - N.2: conflit explicite attaque + défense -> réponse encore ambiguë -> choix défense.
- Surfaces visées: dispatcher global, `orientation_clarification`, reducer/state clarification, `note_information`, `prepare_defense_card`, effect ledger, temp memory.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback déterministe.
- Validité QA: valide. Runs locaux IA réels, transcript exact, traces et DB vérifiées, connexions temporaires nettoyées après capture.
- Artefacts:
  - N.1 raw: `tests/real-personas/qa-skill/runs/clarification/2026-06-15-clarification-local-flow-clarif_state_qa_20260615_r2.raw.json`
  - N.1 summary: `tests/real-personas/qa-skill/runs/clarification/2026-06-15-clarification-local-flow-clarif_state_qa_20260615_r2.summary.json`
  - N.1 durable: `tests/real-personas/qa-skill/runs/clarification/2026-06-15-clarification-local-flow-clarif_state_qa_20260615_r2.durable.json`
  - N.2 raw: `tests/real-personas/qa-skill/runs/clarification/2026-06-15-clarification-local-flow-clarif_state_qa_20260615_r2b.raw.json`
  - N.2 summary: `tests/real-personas/qa-skill/runs/clarification/2026-06-15-clarification-local-flow-clarif_state_qa_20260615_r2b.summary.json`
  - N.2 durable: `tests/real-personas/qa-skill/runs/clarification/2026-06-15-clarification-local-flow-clarif_state_qa_20260615_r2b.durable.json`

## 2. Tours De Conversation

### N.1 — Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 — Mauvais owner sélectionné

**User**
> Demain matin je veux préparer une carte, mais j'hésite : est-ce que je dois m'aider à sortir du lit ou me protéger du réflexe téléphone au réveil ?

**Sophia**
> Je te comprends : c’est pile le choix entre “attaquer” (sortir du lit) et “te protéger” (éviter le piège du téléphone). Et en vrai, pour demain matin, tu peux trancher comme ça 😊
>
> - Carte d’attaque (sortir du lit) : utile si ton vrai blocage, c’est l’inertie + “encore 5 minutes”. Ton plan doit rendre le premier pas évident et automatique.
> - Carte de défense (réflexe téléphone) : utile si ton vrai danger, c’est que tu te fais aspirer dès que tu ouvres les yeux. Ton plan doit te donner une barrière immédiate.
>
> Si tu veux une règle simple (souvent la plus efficace) : choisis la carte qui cible la “première chute”.
> - Si la première chute, c’est rester dans le lit → carte d’attaque.
> - Si la première chute, c’est le téléphone dès le réveil → carte de défense.
>
> Ce que je te propose pour que ça colle pile à ton cas : demain matin, c’est quoi qui te fait dérailler en premier, le lit… ou ton téléphone ? 📱🛏️

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: none
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: aucun ; effect ledger `committed=0`

**Analyse si red**
- Symptôme: le user exprime une intention de préparer une carte et hésite entre deux cibles qui correspondent à deux flows locaux plausibles: `prepare_attack_card` et `prepare_defense_card`.
- Attendu: ouvrir `orientation_clarification` et poser une question de clarification courte pour choisir entre les deux flows.
- Obtenu: `normal_reply_default`, avec une réponse explicative longue qui n'installe aucun état de clarification.
- Source amont probable: dispatcher global / arbitrator ne transforme pas cette ambiguïté naturelle en clarification structurée.
- Meilleure correction selon les guidelines: renforcer la détection structurée “intention tool + candidats tool concurrents” sans regex métier, sans renderer déterministe, et avec note_information exploitable vers clarification.

### N.1 — Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-01 — Mauvais owner initial, récupération directe tool

**User**
> C'est le téléphone qui me fait tomber en premier, donc plutôt une carte de défense.

**Sophia**
> Je suis ravie de t'aider à contrer ce réflexe avec ton téléphone. Quel est le tout premier signal ou le geste précis qui déclenche cette envie dès le réveil ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- safety: none
- direct_effects: `[]`
- operation: `prepare_defense_card`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: aucun ; effect ledger `committed=0`

**Analyse si yellow**
- Symptôme: le système récupère vers le bon flow défense, mais pas via résolution d'une clarification active.
- Source amont probable: conséquence directe du tour 1 sans `orientation_clarification`.
- Owner runtime: dispatcher/arbitrator initial.
- Meilleure correction selon les guidelines: même correction que N.1 T1 ; le tour 2 montre que le flow cible fonctionne quand l'intention devient explicite.

### N.2 — Tour 1

**Verdict du tour:** green

**User**
> Je veux créer une carte d'attaque et une carte de défense pour demain matin, mais je ne sais pas par laquelle commencer.

**Sophia**
> On commence par laquelle pour demain : la carte d'attaque ou la carte de défense ?

**Trace courte**
- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: none
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: aucun ; effect ledger `committed=0`

### N.2 — Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-01 — Slot fourni mais redemandé

**User**
> Je ne sais pas trop, les deux me semblent utiles, mais le téléphone me fait vraiment perdre du temps.

**Sophia**
> On commence par laquelle : la carte d'attaque ou la carte de défense ?

**Trace courte**
- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: none
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: aucun ; effect ledger `committed=0`

**Analyse si yellow**
- Symptôme: l'état de clarification est conservé, mais Sophia répète presque la même question au lieu d'utiliser le signal fort “téléphone” pour confirmer/proposer défense.
- Source amont probable: dispatcher local clarification trop prudent sur réponse partiellement ambiguë avec indice cible fort.
- Owner runtime: `clarification.local_dispatcher` / visible task `ask_simpler_choice` ou `confirm_candidate`.
- Meilleure correction selon les guidelines: quand un tour ambigu contient un indice fort associé à un candidat existant, poser une confirmation ciblée plutôt que répéter le choix complet.
- Pourquoi ce n'est pas un patch local de phrase: l'invariant porte sur la transition `still_ambiguous` -> `confirm_candidate` avec candidate evidence, pas sur ce wording exact.

### N.2 — Tour 3

**Verdict du tour:** green

**User**
> Carte de défense, je veux gérer le réflexe téléphone au réveil.

**Sophia**
> C'est une excellente idée de s'attaquer à ce réflexe. Quel est le tout premier signal ou l'élément déclencheur qui te pousse à attraper ton téléphone dès le réveil ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `orientation_clarification_resolved_tool_skill`
- safety: none
- direct_effects: `[]`
- operation: `prepare_defense_card`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: aucun ; effect ledger `committed=0`
- note_information: présente, `source_flow_id=clarification`, `target_dispatcher=prepare_defense_card`, `resolved_candidate=prepare_defense_card`, `rejected_candidates=[prepare_attack_card]`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- N.2 donne une clarification courte et naturelle.
- La réponse claire “carte de défense” porte bien vers le flow défense.
- Aucun message ne prétend avoir créé une carte.

**Problemes**
- N.1 T1: mauvais owner initial. Famille: BF-ROUTE-01. Impact: le user reçoit une réponse de conseil/conversation alors qu'un choix entre deux flows tool devait être clarifié. Sévérité: red.
- N.2 T2: répétition de la question malgré l'indice “téléphone”. Famille: BF-INTAKE-01. Impact: friction UX, le user doit répondre de façon plus explicite. Sévérité: yellow.

**Fix propose**
- Source amont: entrée en clarification depuis dispatcher/arbitrator pour N.1 ; décision locale `still_ambiguous` pour N.2.
- Correction recommandée: renforcer l'invariant “intention tool + candidats tool concurrents -> orientation_clarification” et ajouter une branche “strong candidate evidence -> confirm_candidate”.
- Tests d'invariant attendus: paraphrases attaque/défense naturelles, ambiguïté partielle avec indice fort, anti-faux-positif demande d'explication produit simple.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- N.1 T1 échoue le routing attendu: `normal_reply_default` au lieu de `clarification_required`.
- N.1 T2 récupère vers `prepare_defense_card`, mais sans active clarification.
- N.2 T1-T3 valide le chemin attendu: `orientation_clarification` -> conservation clarification -> `orientation_clarification_resolved_tool_skill`.

**Skills / Operations / Tools**
- `prepare_defense_card` démarre correctement quand le candidat est clair.
- Aucun executor durable n'est appelé.
- Les réponses tool restent en collecte de slot, pas en création.

**Memory / Effets durables**
- Durable N.1: `scheduled_checkins_count=0`, `recurring_count=0`, active defense handoff présent.
- Durable N.2: `scheduled_checkins_count=0`, `recurring_count=0`, `__last_clarification_note_information` présent.
- Effect ledger: `committed=0` sur tous les tours.

**Problemes**
- N.1 T1: mauvais owner initial. Famille BF-ROUTE-01. Impact système: pas d'état `__clarification_flow_state`, donc pas de stateful merge possible.
- N.2 T2: evidence utilisateur non exploitée pour confirmer défense. Famille BF-INTAKE-01. Impact système: flow conserve l'état mais reste trop rigide.

**Fix propose**
- Source amont: dispatcher/arbitrator candidate conflict detection + local dispatcher clarification decision.
- Correction recommandée: ajouter tests réels/contractuels couvrant N.1 wording et N.2 evidence-to-confirmation.
- Tests d'invariant attendus: `orientation_clarification` quand une intention tool doit choisir entre `prepare_attack_card` et `prepare_defense_card`; `confirm_candidate` quand une clarification active reçoit un indice fort mais pas encore une sélection totalement explicite.

## Verdict Global

Yellow avec un point red localisé. Le stateful clarification fonctionne quand il est activé: candidats conservés, résolution avec note, pas d'effet durable faux. Mais tout ne fonctionne pas encore bien: une formulation naturelle attaque/défense contourne la clarification et part en `normal_reply`, puis une réponse ambiguë avec signal fort répète la question au lieu de confirmer le meilleur candidat.
