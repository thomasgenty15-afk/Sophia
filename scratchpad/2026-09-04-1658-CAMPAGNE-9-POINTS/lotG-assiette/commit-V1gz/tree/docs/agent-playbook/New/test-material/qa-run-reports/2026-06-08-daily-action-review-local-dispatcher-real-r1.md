# QA Run Report - Daily Action Review Local Dispatcher R1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `daily-action-review-local-dispatcher-real-r1`
- Persona: Rose, connexion locale `tests/real-personas/rose/connection.json`
- Objectif: verifier en conditions reelles locales que le daily action review free-text passe par le dispatcher local, comprend une action faite, commit l'effet durable, puis repond naturellement.
- Trajectoire: absence de pending daily existant -> fixture dynamique depuis DB -> `process-checkins` local -> pending `daily_action_review` -> reponse user via `whatsapp-webhook` loopback.
- Surfaces visees: `scheduled_checkins`, `whatsapp_pending_actions`, `whatsapp-webhook`, `daily_action_review_v1`, entry writer, occurrence update, rendu post-commit.
- Cadre IA reel: Supabase local, generation d'ouverture par `process-checkins`, dispatcher local et visible agent reels; pas de renderer deterministe, pas de `processMessage` fallback, pas de staging/deploy. `force_full_ai=true` non applicable ici car le chemin teste est le pending WhatsApp reel, pas `/functions/v1/test-send-message`.
- Validite QA: valide. Le message user a ete choisi apres lecture de l'ouverture Sophia. Les incidents pre-conversationnels sont documentes ci-dessous et ne remplacent pas le run.

Grounding dynamique:

- Aucun pending daily n'existait pour Rose au depart.
- Fixture generee depuis occurrence ouverte DB du 2026-06-08: `14fdee14-ccb0-47b9-a5ce-5693a657b97b`.
- Action cible: `Faire un sas de decompression (sans fumer)`.
- `scheduled_checkin_id`: `5bcabb84-c055-4efb-a148-796ea5227167`.
- `pending_id`: `5172c1e6-4875-4156-8155-2f7f3d3fe35d`.
- Raw local: `tests/real-personas/rose/runs/daily-weekly/daily-action-review-local-dispatcher-real-r1.raw.json`.

Incidents de preparation:

- Premiere tentative: diagnostic du script QA demandait `scheduled_checkins.error_message`, colonne inexistante. Corrige dans le script temporaire uniquement.
- Deuxieme tentative: le checkin daily a ete differe par la quiet window, puis un rappel recurrent Rose deja du a ete envoye dans le meme batch. Le run conversationnel n'a commence qu'apres isolation du daily.
- Cleanup execute: entry/pending/checkin/messages QA supprimes, occurrence restauree `planned`, deux checkins Rose temporairement repousses remis a leur `scheduled_for` original. Le profil WhatsApp Rose a ete restaure approximativement avec `whatsapp_last_inbound_at=null` et `whatsapp_last_outbound_at=null`, car le snapshot initial exact n'avait pas ete ecrit avant le crash de preparation.

## 2. Tours De Conversation

### Tour 0

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**Sophia**
> Je repense a ton "Faire un sas de decompression (sans fumer)" ce soir.  
> Tu en es ou avec ca, qu'est-ce qui s'est passe pour toi ?

**Trace courte**
- http_status: `200` via `process-checkins`
- response_owner: `scheduled_checkin`
- selected_handler: `process-checkins:daily_action_review`
- route_reason: `event_context=action_evening_review_v2`
- safety: aucun signal observe
- direct_effects: pending cree
- operation: ouverture daily, aucun commit
- pending_confirmation: `whatsapp_pending_actions.status=pending`
- memory_plan: action context lookup tente par le generateur d'ouverture
- executed_tools: aucun tool conversationnel
- durable_effect: `chat_capability=daily_action_review`, `review_state.status=collecting`, `targets.length=1`

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-02 - Commit reel mal rendu

**User**
> Oui, je l'ai fait. En rentrant j'ai pris une douche et mis de la musique pendant presque une heure, sans fumer.

**Sophia**
> "C'est note pour ton sas de decompression. Une heure de musique et une douche, c'est un beau moment pour soi. Comment t'es-tu senti apres ce temps calme ?"

**Trace courte**
- http_status: `200`
- response_owner: `whatsapp_pending_actions`
- selected_handler: `daily_action_review`
- route_reason: pending `chat_capability=daily_action_review`
- safety: aucun signal observe
- direct_effects: entry inseree, pending cloture
- operation: `log_daily_action_review`
- pending_confirmation: `status=done`, `processed_at=2026-06-08T15:56:42.364+00:00`
- memory_plan: metadata user `structured_extraction_source=daily_action_review_v1`
- executed_tools: aucun tool externe
- durable_effect: `user_plan_item_entries.id=1d891e0f-d128-4dd5-8acb-0d33aab6a0ef`, `outcome=completed`, `metadata.source=daily_action_review_v1`, `reason_category=none`, `reschedule_decision=null`, occurrence `status=done`

**Analyse si yellow/red**
- Symptome: la reponse post-commit est humainement bonne, mais elle est envoyee avec des guillemets litteraux autour de tout le texte.
- Source amont probable: visible agent / rendu final du flow local daily, qui laisse passer une chaine JSON-stringifiee au lieu du contenu nettoye.
- Owner runtime: `daily_action_review.local_flow` visible agent ou wrapper WhatsApp pending post-commit.
- Meilleure correction selon les guidelines: normaliser la sortie visible agent au contrat texte avant envoi, au niveau du renderer/adapter du flow, avec test anti-regression sur les guillemets de serialization.
- Pourquoi ce n'est pas un patch local: le commit DB et le reducer sont corrects; corriger une phrase precise ne traiterait pas la fuite de serialization.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- L'ouverture est claire, cible la bonne action, et ne suggere pas de solution avant d'avoir demande le bilan.
- La reponse post-commit reconnait correctement l'effort et relance avec une question humaine.

**Problemes**
- Tour 1: guillemets litteraux autour de la reponse Sophia. Famille: BF-LEDGER-02. Impact: donne une impression de bug technique visible dans WhatsApp. Severite: yellow.

**Fix propose**
- Source amont: rendu visible post-commit du flow `daily_action_review_v1`.
- Correction recommandee: imposer que la sortie visible finale soit un texte brut nettoye, jamais une valeur JSON-stringifiee.
- Tests d'invariant attendus: completion free-text single target; visible agent mock qui retourne une string JSON; verification que le message envoye ne commence ni ne finit par des guillemets de serialization.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Le pending `chat_capability=daily_action_review` a bien capture la reponse free-text.
- Le flow local daily a interprete l'intention comme `answer_review`, cible unique resolue, confidence `high`.

**Skills / Operations / Tools**
- `effect_plan.allowed=true`.
- Effet `log_daily_action_review` compile avec `outcome=completed`, `source=daily_action_review_v1`, `reason_category=none`.
- Aucun executor externe ni fallback deterministic observe.

**Memory / Effets durables**
- Entry creee avec `metadata.source=daily_action_review_v1`.
- Occurrence passee a `done`.
- Pending passe a `done`.
- Pas de report interdit: `reschedule_decision=null`, `rescheduled_to=null`.

**Problemes**
- Le systeme reussit le commit, mais le rendu visible post-commit est degrade par les guillemets litteraux.

**Fix propose**
- Source amont: boundary visible agent -> WhatsApp response.
- Correction recommandee: ajouter une validation de contrat `visible_text` dans le flow local daily, pas dans le prompt seul.
- Tests requis: test unitaire local flow + test integration webhook pending free-text qui verifie le contenu assistant persiste dans `chat_messages`.

## Verdict Global

- Verdict: yellow
- Raison principale: workflow daily et effet durable corrects, mais reponse visible post-commit polluee par des guillemets de serialization.
- Follow-up prioritaire: corriger le rendu visible post-commit du flow local daily et rerun ce scenario.
