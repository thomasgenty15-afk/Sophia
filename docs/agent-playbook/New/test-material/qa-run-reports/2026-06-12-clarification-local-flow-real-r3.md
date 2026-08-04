# QA Run Report — Clarification Local Flow Real R3

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `clarif_local_20260612_r3`
- Persona: `qa-skill`, connexion temporaire `clarification_clarif_local_20260612_r3`
- Objectif: vérifier que le flow de clarification s'active sur une ambiguïté attaque/défense, pose une question utile, puis porte vers le bon flow local une fois le choix utilisateur donné.
- Trajectoire: ambiguïté `prepare_attack_card` vs `prepare_defense_card` -> question de clarification -> résolution vers `prepare_attack_card`.
- Surfaces visées: dispatcher global, `orientation_clarification`, `note_information`, `prepare_attack_card`, effect ledger, état temporaire.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer déterministe, aucun fallback `processMessage`.
- Validité QA: valide. Deux tours réels IA, transcript exact capturé, traces et DB vérifiées. Connexion temporaire reset puis supprimée après capture des artefacts.
- Artefacts:
  - Raw: `tests/real-personas/qa-skill/runs/clarification/2026-06-12-clarification-local-flow-clarif_local_20260612_r3.raw.json`
  - Summary: `tests/real-personas/qa-skill/runs/clarification/2026-06-12-clarification-local-flow-clarif_local_20260612_r3.summary.json`
  - Durable: `tests/real-personas/qa-skill/runs/clarification/2026-06-12-clarification-local-flow-clarif_local_20260612_r3.durable.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Demain matin je veux préparer une carte, mais j'hésite : est-ce que je dois plutôt m'aider à me lancer quand le réveil sonne, ou me protéger du réflexe téléphone au lit ?

**Sophia**
> C'est un dilemme classique ! Pour demain, tu préfères te concentrer sur l'élan pour sortir du lit ou sur le fait de ne pas toucher ton téléphone ?

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
- durable_effect: aucun effet commis ; effect ledger `committed=0`

**Analyse**
- Le routing est correct : Sophia ne part pas directement sur une carte d'attaque ou de défense.
- La question visible est ciblée sur le vrai axe d'ambiguïté : élan d'action vs protection du réflexe téléphone.
- Le tutoiement est respecté.

### Tour 2

**Verdict du tour:** green

**User**
> L'élan pour sortir du lit. Donc oui, carte d'attaque pour me lever sans snoozer.

**Sophia**
> Pour t'aider à trouver l'élan nécessaire et arrêter de snoozer, quelle technique te tente le plus : un Mantra de force, un Mot de bascule ou Preparer le terrain ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `orientation_clarification_resolved_tool_skill`
- safety: none
- direct_effects: `[]`
- operation: `prepare_attack_card`
- tool_flow_action: `choose_technique`
- visible_task: `ask_or_confirm_technique`
- pending_confirmation: none
- executed_tools: `[]`
- durable_effect: aucun effet commis ; effect ledger `committed=0`
- note_information: présente sur le `turn_frame`, `source_flow_id=clarification`, `target_dispatcher=prepare_attack_card`, `handoff_reason=clarification_resolved`
- trace cible: `prepare_attack_card.local_flow` indique `global_dispatcher_skipped`, `note_information_consumed`, puis décision locale `choose_technique`

**Analyse**
- La clarification résout correctement vers `prepare_attack_card`.
- Le flow cible reprend le tour visible : Sophia ne refait pas une réponse générale de clarification.
- Le contexte utilisateur est bien repris : objectif `me lever sans snoozer`, piège `le réflexe de snoozer`.
- Aucun effet durable n'est appliqué avant choix de technique/confirmation.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- La question de clarification est courte, naturelle et actionnable.
- La résolution est fluide : le user choisit l'axe, Sophia passe directement à l'étape suivante utile.
- Le message reste au format conversationnel court, compatible WhatsApp.

**Problemes**
- Aucun problème bloquant observé.
- Observation mineure non bloquante: `Preparer le terrain` sort sans accent dans la réponse visible. Impact faible, pas un bug de flow clarification.

**Fix propose**
- Aucun fix clarification requis pour ce scénario.
- Invariant à conserver: ambiguïté attaque/défense -> `orientation_clarification` -> note `clarification` -> flow cible local.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tour 1: `orientation_clarification` sélectionné avec `clarification_required`.
- Tour 2: résolution vers `tool_skill / prepare_attack_card` avec `orientation_clarification_resolved_tool_skill`.
- Le dispatcher global normal ne produit pas la réponse finale pendant la reprise du flow cible.

**Skills / Operations / Tools**
- `prepare_attack_card` démarre en mode local.
- Le flow cible consomme une note et choisit `choose_technique`.
- Aucun executor ni side effect n'est lancé directement depuis la clarification.

**Memory / Effets durables**
- `temp_memory.__last_clarification_note_information` contient une note structurée avec les deux candidats (`prepare_attack_card`, `prepare_defense_card`) et le candidat sélectionné.
- `__active_attack_card_handoff` est installé pour poursuivre le flow.
- Effect ledger: aucune demande, aucun effet autorisé, aucun commit.
- Connexion temporaire reset puis supprimée après capture durable.

**Problemes**
- Aucun problème système bloquant observé.

**Fix propose**
- Aucun fix requis pour ce run.
- Tests d'invariant attendus: conserver un test réel ou semi-réel qui vérifie `route_reason=clarification_required` au tour ambigu, puis `orientation_clarification_resolved_tool_skill` avec `note_information.target_dispatcher=prepare_attack_card` après réponse utilisateur.

## Verdict Global

Green. Le flow de clarification fonctionne sur cette trajectoire : il demande la bonne précision, porte vers le bon flow local, transmet une note exploitable, et ne commet aucun effet durable prématuré.
