# QA Run Report — Conversation Pulse V2 Real R3

## 1. Contexte Du Test

- Date: 2026-06-11
- Run: `pulse-v2-real-1781201255`
- Scope: `qa-pulse-v2-real-1781201255`
- Persona: Alex, connexion locale existante
- Objectif: verifier en conditions reelles que la migration debloque le nouveau chemin conversation pulse V2.
- Trajectoire: conversation emotionnelle recente -> vrai endpoint Sophia -> watcher reel -> `watcher_conversation_pulse_v2` -> `daily_conversation_pulse_v2` -> cleanup DB.
- Surfaces visees: `/functions/v1/test-send-message`, `runWatcher`, `buildDailyConversationPulse`, `system_runtime_snapshots`.
- Cadre IA reel: local Supabase, `force_full_ai=true` pour les tours, watcher avec `MEGA_TEST_MODE=0`, accord explicite utilisateur pour appels IA externes watcher/daily.
- Validite QA: valide pour conversation reelle, watcher reel, daily pulse reel, persistance DB V2 et anti-legacy snapshot. Le delivery morning nudge complet n'a pas ete declenche pour eviter une livraison check-in hors dry-run garanti.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J ai encore un peu la boule au ventre depuis hier soir avec ma soeur. Je pensais que ce serait passe ce matin, mais ca me prend encore de la place.

**Sophia**
> C'est frustrant de se reveiller avec cette meme boule au ventre alors qu'on esperait que la nuit ferait son oeuvre. C'est normal que l'interaction avec ta soeur prenne encore de la place ce matin ; ton corps a simplement besoin d'un peu de temps pour laisser l'emotion redescendre. Je suis la avec toi.

**Trace courte**
- http_status: 200
- request_id: `fdf942fd-0b62-494e-bbad-e0b7a56c5312`
- response_owner: conversation handler
- note_information: `global_dispatcher` -> `emotional_repair`
- safety: low, non declenche
- direct_effects: none
- durable_effect: messages DB crees dans scope `qa-pulse-v2-real-1781201255`

### Tour 2

**Verdict du tour:** yellow

**User**
> Oui c est exactement ca. Je n ai pas envie d en refaire tout un sujet, mais demain matin si Sophia me remet doucement un peu de force sans citer tous les details, ca m aiderait.

**Sophia**
> Il me manque le moment exact pour programmer ce rappel.

**Trace courte**
- http_status: 200
- request_id: `e7f2ad78-8638-496e-aed0-6719f5c1e149`
- response_owner: conversation handler
- note_information: `global_dispatcher` -> `create_one_shot_reminder`
- direct_effect: `create_one_shot_reminder`, confidence high
- safety: low, non declenche

**Analyse**
- Le systeme ne crashe pas et la note_information de handoff est presente.
- Le comportement produit est discutable: le message utilisateur demandait surtout un signal pour un morning nudge doux, sans details; Sophia l'a transforme en rappel ponctuel et demande une heure exacte.
- Ce n'est pas un blocage du conversation pulse V2, mais c'est un risque UX autour de l'ambiguite `demain matin` dans un contexte emotional presence / morning nudge.

## 3. Background Watcher / Daily

**Verdict du tour:** green

**Action QA**
> Appel direct du vrai `runWatcher` sur le scope QA, avec `MEGA_TEST_MODE=0`, watcher actif pour ce process, puis `buildDailyConversationPulse`.

**Trace courte**
- watcher_main_prompt_cache_ready: present
- gemini_result source `trigger-watcher-batch`: present
- scheduled_checkins_inserted: 1
- watcher_momentum_state_updated: present, state `friction_legere`
- gemini_result source `watcher_conversation_pulse_v2`: present
- watcher snapshot id: `00e1c9dd-5897-4d60-a418-d30ac342151e`
- daily snapshot id: `b7044829-c245-4cd1-b123-2c1ed25580a4`
- legacy `conversation_pulse` snapshots: 0

**Snapshot watcher V2**
- snapshot_type: `watcher_conversation_pulse_v2`
- pulse_kind: `watcher_4h`
- version: 2
- tone.dominant: `strained`
- tone.emotional_load: `medium`
- likely_need: `support`
- proactive_risk: `low`
- emotional_anchors_count: 1

**Snapshot daily V2**
- snapshot_type: `daily_conversation_pulse_v2`
- pulse_kind: `daily`
- version: 2
- source_pulse_ids: [`00e1c9dd-5897-4d60-a418-d30ac342151e`]
- tone.dominant: `strained`
- tone.emotional_load: `medium`
- likely_need: `support`
- proactive_risk: `low`
- emotional_anchors_count: 1

## 4. Analyse De Fluidite Humaine

**Verdict:** yellow

**Ce qui marche**
- Le premier tour repond correctement a la charge emotionnelle sans surjouer ni diagnostiquer.
- Le watcher detecte un besoin de soutien et construit un pulse recent exploitable.
- Le daily pulse agrege bien le watcher pulse et garde un ancrage emotionnel borne.

**Probleme observe**
- Tour 2: le routeur global privilegie un `create_one_shot_reminder` alors que le contexte produit vise plutot un signal de morning nudge/emotional presence. Famille: BF-ROUTING-01.

**Fix propose**
- Clarifier dans le routage/direct effect que `demain matin` + demande de soutien non horaire, dans un contexte emotional presence/morning nudge, ne doit pas forcement devenir un rappel ponctuel qui exige une heure.
- Garder la capacite de creer un rappel si le user demande explicitement une programmation actionable.

## 5. Analyse Systeme

**Verdict:** green pour pulse V2, yellow pour UX routing

**Routage**
- Entree initiale emotionnelle OK avec note_information vers `emotional_repair`.
- Handoff reminder au tour 2 techniquement conforme, mais produit discutable.

**Memory / Pulse**
- `watcher_conversation_pulse_v2` persiste correctement apres migration.
- `daily_conversation_pulse_v2` persiste correctement et reference le watcher pulse source.
- Aucun writer legacy `snapshot_type="conversation_pulse"` observe pendant ce run.

**Effets durables et cleanup**
- Artefacts crees par le run:
  - `scheduled_checkins`: 1 ligne creee par watcher
  - `system_runtime_snapshots`: 2 lignes V2 creees
  - `chat_messages`: 4 lignes creees
  - `user_chat_states`: 1 ligne creee
- Cleanup cible effectue:
  - `scheduled_checkins`: 1 ligne supprimee (`a550ee2a-c0d0-4f15-a606-c67fdf38b080`)
  - `system_runtime_snapshots`: 2 lignes supprimees
  - `chat_messages`: 4 lignes supprimees par scope QA
  - `user_chat_states`: 1 ligne supprimee par scope QA
- Verification post-cleanup:
  - checkins: 0
  - snapshots: 0
  - messages: 0
  - states: 0
- Aucun reset DB, aucun stop/restart Supabase, aucune suppression hors perimetre QA.

## Verdict Global

`yellow`: la correction DB est validee en conditions reelles pour le chemin conversation pulse V2. Le watcher et le daily pulse generent et persistent les nouveaux snapshots V2, sans fallback legacy. Un point UX/routing reste ouvert: une demande de soutien "demain matin" dans un contexte emotional presence est transformee trop vite en rappel ponctuel demandant une heure exacte.
