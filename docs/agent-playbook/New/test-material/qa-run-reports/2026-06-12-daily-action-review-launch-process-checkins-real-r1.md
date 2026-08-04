# QA Run Report - Daily Action Review Launch Process Checkins Real R1

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `daily-launch-process-checkins-real-20260612120705-r1`
- Persona: Rose
- Objectif: verifier que le prompt de lancement daily est bien execute par le chemin reel `process-checkins`, sans fixture visible ni deuxieme tour utilisateur.
- Trajectoire: scheduled checkin QA `action_evening_review_v2` -> `/functions/v1/process-checkins` local -> generation IA d'ouverture -> `whatsapp-send` local simule -> `whatsapp_pending_actions`.
- Surfaces visees: `process-checkins`, `generateDailyActionReviewOpening`, `whatsapp-send`, `scheduled_checkins`, `whatsapp_pending_actions`, `chat_messages`, bridge `initial_note_information`.
- Cadre IA reel: Supabase local, appel reel `process-checkins`, generation LLM reelle `gpt-5.2`, aucun renderer deterministe, aucun fallback `processMessage`, aucun message user envoye apres ouverture.
- Validite QA: valide pour tester le lancement proactive daily. Le run est volontairement limite a l'ouverture, donc il ne valide pas la reponse utilisateur ni le commit daily.

Grounding dynamique:

- Connexion locale: `tests/real-personas/rose/connection.json`
- Targets decouvertes depuis la DB Rose:
  - `Faire un sas de decompression (sans fumer)` / occurrence `14fdee14-ccb0-47b9-a5ce-5693a657b97b`
  - `Faire un sas de decompression (sans fumer)` / occurrence `3be65289-e810-4a73-b48a-26e0fc8b45ac`
- Scheduled checkin QA: `eeb92c72-2cd0-43c9-a8e9-500dea9fc2c9`
- Pending QA: `4cb2e726-4f00-4c10-96c2-44685ef44e2a`
- Artefacts locaux: `tmp/daily-launch-process-checkins-real-20260612120705-r1/`
- Cleanup: effectue et verifie; scheduled checkin QA, pending QA et message QA supprimes; profil Rose et checkins dus preexistants restaures.

## 2. Tours De Conversation

### Tour 0 - Ouverture Proactive

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - ouverture daily techniquement correcte mais wording interne visible

**User**
> N/A - ouverture proactive declenchee par `process-checkins`, sans message utilisateur sur ce tour.

**Sophia**
> Je reviens sur “Faire un sas de décompression (sans fumer)” (les deux occurrences à passer en revue).
> Comment ça s’est passé pour toi ?

**Trace courte**
- http_status: `200`
- request_id: `daily-launch-process-checkins-real-20260612120705-r1-process`
- process_response: `success=true`, `processed=1`
- generation_owner: `process-checkins` / `scheduled_checkins:dynamic_whatsapp`
- model: `gpt-5.2`
- checkin_status: `awaiting_user`
- pending_status: `pending`
- chat_capability: `daily_action_review`
- review_state: `status=collecting`, `skill_id=daily_action_review_v1`
- initial_note_information: present, `source_flow_id=process_checkins.action_evening_review_v2`, `target_dispatcher=daily_action_review_v1`
- durable_effect: 1 assistant WhatsApp message log + 1 pending daily; no daily entry committed

**Analyse si yellow/red**
- Symptome: l'ouverture est generee par le vrai prompt de lancement et le pending est exploitable, mais le texte visible expose le terme interne "occurrences".
- Source amont probable: prompt/generation d'ouverture daily ou contexte de grouping pour deux occurrences du meme plan item.
- Owner runtime: proactive daily launch / `generateDailyActionReviewOpening`.
- Meilleure correction selon les guidelines: conserver le chemin IA reel, mais contraindre l'ouverture a parler en langage utilisateur quand plusieurs occurrences d'une meme action sont groupees.
- Pourquoi ce n'est pas un patch local: remplacer une phrase fixe serait invalide; la correction doit vivre dans le prompt d'ouverture ou le contexte IA fourni a ce prompt.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- L'ouverture est courte, non culpabilisante et pose une seule question.
- Elle ne propose pas de solution, carte, potion ou changement de plan avant la reponse user.
- Le sujet daily est clair: Sophia demande comment s'est passee l'action selectionnee.

**Problemes**
- Tour 0: "les deux occurrences" est un terme technique visible. Famille: `BF-PROACTIVE-01`. Impact: comprehension possible, mais experience moins naturelle. Severite: yellow.

**Fix propose**
- Source amont: prompt/contexte `generateDailyActionReviewOpening`.
- Correction recommandee: ajouter une regle de wording pour les doublons de meme action, par exemple parler de "les deux fois prevues cette semaine" ou demander "pour les fois prevues cette semaine" sans exposer `occurrence`.
- Tests d'invariant attendus: lancement daily avec deux occurrences du meme plan item; lancement avec deux actions differentes; anti-faux-positif ou le prompt ne doit pas dedupliquer les IDs dans le pending.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Le chemin teste est bien le chemin de lancement: `process-checkins` a trouve exactement 1 checkin du, l'a traite, puis l'a mis en `awaiting_user`.
- Le dispatcher global normal n'intervient pas sur l'ouverture; le pending porte la note de bridge vers `daily_action_review_v1` pour le prochain message user.
- La `note_information` initiale contient `source_flow_id`, `target_dispatcher`, `handoff_reason`, `collected_state`, `unresolved_questions`, `confidence`, `evidence` et `recommended_next_focus`.

**Skills / Operations / Tools**
- `whatsapp_pending_actions.payload.chat_capability=daily_action_review`.
- `review_state.skill_id=daily_action_review_v1`, `status=collecting`, `effect_plan.allowed=false`.
- Les contraintes initiales sont presentes: `one_question_max`, `no_solution_first`, `no_tool_suggestion`, `no_plan_adjustment`, `no_potion`, `no_guilt`, `do_not_mark_without_evidence`.
- Aucun commit daily n'a ete applique pendant l'ouverture, ce qui est attendu.

**Memory / Effets durables**
- Effets produits pendant le run: 1 `scheduled_checkins` QA cree puis traite, 1 `whatsapp_pending_actions` QA, 1 `chat_messages` assistant WhatsApp simule.
- Cleanup cible verifie: `qaCheckins=0`, `qaPendings=0`, `qaMessages=0`; profil Rose restaure; deux checkins dus preexistants restaures a leurs timestamps initiaux.

**Problemes**
- Aucun probleme systeme bloquant observe sur le lancement.
- Warning UX seulement: wording interne "occurrences" dans le message visible.

**Fix propose**
- Source amont: generation proactive daily opening.
- Correction recommandee: renforcer le prompt d'ouverture pour interdire le vocabulaire technique visible (`occurrence`, ID, pending, checkin) et preferer une formulation utilisateur quand les targets sont deux occurrences du meme item.
- Tests d'invariant attendus:
  - `process-checkins` cree un pending daily avec `initial_note_information`.
  - `chat_messages.content` ne contient pas de jargon technique pour une ouverture daily.
  - aucun effet daily n'est commite avant reponse utilisateur.

## Verdict Global

- Verdict: yellow
- Raison principale: le prompt de lancement fonctionne bien sur le plan runtime et cree le pending daily attendu; la seule reserve est un wording visible trop technique.
- Follow-up prioritaire: corriger le prompt de lancement daily pour eviter "occurrences" dans le texte user, puis rerun le meme test a un seul tour.
