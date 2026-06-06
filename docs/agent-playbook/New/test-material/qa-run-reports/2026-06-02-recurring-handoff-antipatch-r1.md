# QA Run Report — Recurring Handoff Anti-Patching R1

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `recurring-handoff-antipatch-20260602-r1`
- Persona: user QA temporaire local `qa-normal-recurring-handoff-antipatch-20260602-r1-1780411324832@example.com`, nettoye en fin de run.
- Objectif: verifier le flow `create_recurring_reminder` apres retrait des fallbacks regex metier: ambiguite ponctuel/recurrent, handoff plateforme, revision, apply attempt non-mutant, sortie one-shot explicite.
- Trajectoire: clarification initiale -> handoff recurring -> revision active -> demande de programmation -> sortie ponctuelle.
- Surfaces visees: dispatcher, orientation clarification, `create_recurring_reminder`, active handoff arbitration, one-shot reminder, durable effects.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback `processMessage`.
- Validite QA: valide. Incident technique pre-run: API locale d'abord timeout puis revenue; tentative init sandbox bloquee `EPERM`, relance avec acces local autorise. Aucun code modifie pendant le run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J’ai besoin que Sophia me relance pour mon point d’équipe demain en fin de journée... enfin peut-être plutôt tous les jeudis vers 18h, je ne suis pas sûr. Le message serait : envoyer mon résumé d’équipe.

**Sophia**
> Est-ce que tu veux que je programme ce rappel uniquement pour demain ou pour tous les jeudis ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- direct_effects: `[]`
- operation: none
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Plutôt tous les jeudis à 18h, heure de Paris. Garde le contenu : envoyer mon résumé d’équipe.

**Sophia**
> Ok, je te prépare ça pour la section Rappels.
>
> Pour le rappel, garde le message « envoyer mon résumé d’équipe ». Il doit revenir chaque semaine, le jeudi, à 18:00, Europe/Paris.
>
> Dans la plateforme, va dans la section Rappels, puis crée un rappel récurrent avec ces éléments.
>
> Je ne crée pas de rappel récurrent depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_recurring_reminder`
- route_reason: `central_arbitrator_recurring_reminder_structured_intent`
- tool_skill_intents: `["create_recurring_reminder"]`
- direct_effects: `[]`
- operation: `platform_handoff`
- executed_tools: `[]`
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Change juste l’heure à 18h30 et mets le texte : préparer puis envoyer mon résumé d’équipe. Même jeudi.

**Sophia**
> Oui, je te mets la version à jour pour la section Rappels.
>
> Pour le rappel, garde le message « préparer puis envoyer mon résumé d’équipe ». Il doit revenir chaque semaine, le jeudi, à 18:30, Europe/Paris.
>
> Dans la plateforme, va dans la section Rappels, puis crée un rappel récurrent avec ces éléments.
>
> Je ne crée pas de rappel récurrent depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_recurring_reminder`
- route_reason: `same_operation_signal_continues_active_handoff`
- tool_skill_intents: `["create_recurring_reminder"]`
- direct_effects: `[]`
- operation: `platform_handoff`
- executed_tools: `[]`
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` — mauvaise transition de flow

**User**
> Ok programme-le alors.

**Sophia**
> Je ne peux pas programmer de rappels récurrents ici. Veux-tu que je crée un rappel unique pour cette fois ou que je te redonne les étapes pour le faire dans la section Rappels ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_recurring_reminder`
- route_reason: `same_operation_signal_continues_active_handoff`
- tool_skill_intents: `["create_recurring_reminder"]`
- direct_effects: `[]`
- operation: `platform_handoff`
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: no-mutation respectee, mais l'`apply_attempt` n'est pas trace comme tel et Sophia repose une alternative au lieu de redonner directement le handoff plateforme.
- Source amont probable: clarification/action handoff du skill recurring ou dispatcher structured intent pour demande d'application sur handoff actif.
- Owner runtime: `create_recurring_reminder` handoff clarification / reducer local.
- Meilleure correction selon les guidelines: produire un signal structure `apply_attempt` ou le selectionner via clarification tool, puis renderer la destination plateforme sans mutation.
- Pourquoi ce n'est pas un patch local: ne pas detecter "programme-le" par regex; le fix doit venir du contrat de clarification/dispatcher ou de la transition structured handoff.

### Tour 5

**Verdict du tour:** green

**User**
> Non finalement crée juste un rappel unique demain à 18h30 pour préparer puis envoyer mon résumé d’équipe.

**Sophia**
> C'est programmé pour samedi 23 mai à 18:30. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `create_one_shot_reminder_interrupts_active_handoff`
- direct_effects: `["create_one_shot_reminder"]`
- direct_effects_to_run: `["create_one_shot_reminder"]`
- operation: `success`
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: 1 `scheduled_checkins` ponctuel, `scheduled_for=2026-05-23T16:30:00+00:00`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- La clarification initiale est naturelle et courte.
- Le handoff recurring est lisible, moins robotique, avec destination Rappels et no-mutation explicite.
- La revision est fluide et conserve contenu, cadence, heure locale.
- La sortie ponctuelle explicite est claire et execute le one-shot autorise.

**Problemes**
- Tour 4: Sophia respecte la no-mutation, mais demande au user de choisir entre one-shot et etapes. Impact: petite friction, car le user vient de demander "programme-le" sur un rappel recurrent; attendu preferable: rappeler directement que le chat ne peut pas le faire et redonner les etapes Rappels. Famille: `BF-STATE-01`. Severite: yellow.

**Fix propose**
- Source amont: clarification/action handoff recurring.
- Correction recommandee: renforcer le contrat structure `apply_attempt` pour handoff actif recurring, via dispatcher/clarification tool, sans regex locale.
- Tests d'invariant attendus: apply attempt apres handoff actif; paraphrase "vas-y mets-le en place"; anti-FP "non juste demain" sort vers one-shot; invariant `executed_tools=[]` pour recurring.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tour 1: `orientation_clarification` avec candidats ponctuel/recurrent, no mutation.
- Tour 2: `create_recurring_reminder` via `central_arbitrator_recurring_reminder_structured_intent`, pas de direct effect.
- Tour 3: `same_operation_signal_continues_active_handoff`, `tool_skill_intents=["create_recurring_reminder"]`; regression initiale corrigee en QA reelle.
- Tour 4: reste `create_recurring_reminder` et non-mutant, mais ne passe pas en statut visible `apply_attempt`.
- Tour 5: interruption explicite one-shot via `direct_effects` structure, execution autorisee.

**Skills / Operations / Tools**
- `create_recurring_reminder` ne cree aucun rappel recurrent.
- `create_one_shot_reminder` execute seulement au tour 5 apres intention ponctuelle explicite.

**Memory / Effets durables**
- Avant cleanup: `user_recurring_reminders=[]`.
- Avant cleanup: 1 `scheduled_checkins` ponctuel cree au tour 5.
- Cleanup cible effectue: `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`. `user_memories` retourne 404 dans cet environnement.

**Problemes**
- Tour 4: `apply_attempt` non structure/renderer non optimal. Famille: `BF-STATE-01`. Impact systeme: pas de mutation incorrecte, mais statut handoff moins auditable.

**Fix propose**
- Source amont: clarification/action reducer du handoff recurring.
- Correction recommandee: faire selectionner `apply_attempt` par sortie structuree du clarification tool ou signal dispatcher sur handoff actif; renderer no-mutation avec destination plateforme.
- Tests d'invariant attendus: trace `toolSkillRun.status=apply_attempt`, `executed_tools=[]`, `committed_effects=[]`, destination Rappels presente, no "c'est programmé" pour recurring.

## Verdict Global

- Verdict: yellow
- Raison principale: le flow recurring handoff est non-mutant et la revision est bien conservee par signaux structures, mais `ok programme-le` n'est pas audite/rendu comme `apply_attempt`.
- Follow-up prioritaire: corriger le contrat structure `apply_attempt` du handoff recurring via dispatcher/clarification, sans regex locale.
