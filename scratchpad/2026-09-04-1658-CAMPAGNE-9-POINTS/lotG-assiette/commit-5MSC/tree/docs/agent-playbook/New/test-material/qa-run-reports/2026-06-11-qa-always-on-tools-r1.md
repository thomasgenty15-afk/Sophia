# QA Run Report - qa-always-on-tools-20260611-r1

## 1. Contexte Du Test

- Date: 2026-06-11
- Run: `qa-always-on-tools-20260611-r1`
- Persona: Rose, user test local `02dc9ae2-4128-412b-b0be-56712bf775a8`
- Objectif: verifier `create_one_shot_reminder` et `track_progress_plan_item` en run IA reel local.
- Trajectoire: demande de rappel ponctuel clair -> clarification demandee -> clarification absolue -> sortie du rappel -> log d'un progres de plan.
- Surfaces visees: dispatcher, direct effects always-on, `create_one_shot_reminder`, `track_progress_plan_item`, EffectLedger, DB `scheduled_checkins`, DB `user_plan_item_entries`, `system_runtime_snapshots`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `Authorization: Bearer <ANON_KEY>`, `x-user-authorization: Bearer <access_token>`. Aucun renderer deterministe ni fallback direct.
- Validite QA: valide. Auth locale Rose verifiee, compte marque `is_test_persona=true`, token accepte par `/auth/v1/user`.
- Nettoyage: effectue apres run. Supprimes: 1 `user_plan_item_entries`, 1 `system_runtime_snapshots`, 6 `chat_messages`, 1 `user_chat_states`. Aucun `scheduled_checkins` cree.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> Peux-tu me rappeler demain à 8h40 de sortir le tapis et faire le sas de décompression sans fumer ?

**Sophia**
> Il me manque le moment exact pour programmer ce rappel.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `risk_band=low`, side effects allowed
- direct_effects: `create_one_shot_reminder`, `explicitness=explicit`, `target_status=identified`, `confidence_band=high`
- operation: `create_one_shot_reminder`
- pending_confirmation: none observed
- memory_plan: not relevant
- executed_tools: `[]`
- durable_effect: none; `scheduled_checkins=[]`

**Analyse si yellow/red**
- Symptome: Sophia redemande le moment exact alors que le message contient `demain à 8h40` et que le TurnFrame extrait `when_hint="demain à 8h40"`.
- Source amont probable: intake / reducer local `one_shot_reminder`, incoherence entre payload structure et decision `needs_clarify`.
- Owner runtime: `tools/always_on/one_shot_reminder/*`, probablement intake/time parser ou reducer d'effet.
- Meilleure correction selon les guidelines: corriger la conversion structuree `when_hint` -> effet `scheduled_for` dans l'owner one-shot, puis couvrir une paraphrase relative locale (`demain a HH:mm`) et un anti-faux-positif ambigu.
- Pourquoi ce n'est pas un patch local: le dispatcher route correctement et fournit un hint; un guard dans `run.ts` ou une regex metier masquerait l'erreur d'intake proprietaire.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> Demain vendredi 12 juin 2026 à 08:40, heure de Paris. Tu peux le programmer.

**Sophia**
> Il me manque le moment exact pour programmer ce rappel.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- safety: `risk_band=low`, side effects allowed
- direct_effects: `create_one_shot_reminder`, `target_status=identified`, `when_hint="vendredi 12 juin 2026 à 08:40"`, instruction recuperee depuis le contexte
- operation: `create_one_shot_reminder`
- pending_confirmation: none observed
- executed_tools: `[]`
- durable_effect: none; `scheduled_checkins=[]`
- EffectLedger: requested 1, allowed 0, blocked 1, committed 0; blocked reason `missing_time`

**Analyse si yellow/red**
- Symptome: meme apres date absolue + heure + timezone, l'executor bloque `missing_time`.
- Source amont probable: mapping payload/intake vers `scheduled_for`, pas le routage global.
- Owner runtime: `tools/always_on/one_shot_reminder/time_parser.ts`, `intake.ts`, `router.ts` ou `executor.ts`.
- Meilleure correction selon les guidelines: faire echouer ou reussir de maniere coherente au niveau du contrat one-shot; si `when_hint` est high-confidence, le parser doit produire `scheduled_for`, sinon l'intake ne doit pas exposer `target_status=identified`.
- Pourquoi ce n'est pas un patch local: le ledger prouve une rupture contractuelle interne; la correction doit preserver EffectLedger et tests d'invariant, pas ajouter une phrase de confirmation.

### Tour 3

**Verdict du tour:** green

**User**
> Laisse tomber le rappel pour l'instant. Côté plan, j'ai fait le sas de décompression sans fumer ce soir : tapis sorti, respiration faite, aucune cigarette.

**Sophia**
> Note pour Faire un sas de décompression (sans fumer): fait.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `track_progress_plan_item`
- route_reason: `normal_reply_default`
- safety: `risk_band=low`
- direct_effects: `track_progress_plan_item`, `target_item_id=3db6278b-bd59-4401-bbdf-80b575ee14bb`, `target_title="Faire un sas de décompression (sans fumer)"`, `status_hint=completed`, `confidence_band=high`
- operation: `track_progress_plan_item`
- pending_confirmation: none observed
- executed_tools: `["track_progress_plan_item"]`
- durable_effect: `user_plan_item_entries.id=c5c9f645-2af7-48fe-8ef5-d2b847a58b62`, `entry_kind=checkin`, `outcome=completed`, `value_numeric=1`
- EffectLedger: requested 1, allowed 1, committed 1, blocked 0, failed 0; committed id `c5c9f645-2af7-48fe-8ef5-d2b847a58b62`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le tour 3 est naturel: le user peut sortir du rappel et reporter un progres de plan en une phrase.
- La reponse track progress est courte et factuelle, sans sur-explication.

**Problemes**
- Tours 1-2: Sophia redemande le moment exact deux fois, y compris apres une date absolue. Famille: BF-INTAKE-01. Impact: le user ne peut pas creer un rappel ponctuel pourtant explicite. Severite: red.

**Fix propose**
- Source amont: runtime `one_shot_reminder` intake/time parser/reducer.
- Correction recommandee: aligner `when_hint` high-confidence avec `scheduled_for`; ne pas produire une question `missing_time` quand le temps extrait est exploitable.
- Tests d'invariant attendus: creation avec `demain a 8h40`, creation avec date absolue + timezone, blocage quand l'heure est vraiment absente, anti-faux-positif pour demande read-only "ou voir mes rappels demain ?".

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le routage global detecte correctement `create_one_shot_reminder` aux tours 1-2 et `track_progress_plan_item` au tour 3.
- Le bug n'est pas un mauvais owner: `selected_handler=create_one_shot_reminder` est correct.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: echec systeme. Direct effect identifie, mais aucun commit; EffectLedger bloque `missing_time`.
- `track_progress_plan_item`: succes systeme. Direct effect explicite, cible de plan correcte, status `completed`, writer DB et ledger commit alignes.

**Memory / Effets durables**
- `scheduled_checkins`: 0 ligne creee.
- `user_plan_item_entries`: 1 ligne creee puis nettoyee.
- `system_runtime_snapshots`: 1 snapshot `plan_item_entry_logged_v2` cree puis nettoye.
- `chat_messages` et `user_chat_states` du scope QA nettoyes.

**Problemes**
- Tours 1-2: `create_one_shot_reminder` expose un payload temporel mais bloque `missing_time`. Famille: BF-INTAKE-01. Impact systeme: effet durable attendu absent. Severite: red.

**Fix propose**
- Source amont: contrat local one-shot reminder, parser temporel et mapping effect plan.
- Correction recommandee: renforcer le contrat requested/allowed/committed de `one_shot_reminder` pour que `when_hint` ne soit pas perdu avant l'executor; ajouter tests unitaires du parser + integration EffectLedger.
- Tests d'invariant attendus: `executed_tools=["create_one_shot_reminder"]` seulement avec `committed_effects`, `scheduled_checkins.scheduled_for` correct en Europe/Paris, pas de claim "programme" sans commit, pas de redemande de slot deja fourni.

## Verdict Global

Red. `track_progress_plan_item` fonctionne correctement sur ce run. `create_one_shot_reminder` ne fonctionne pas pour une demande ponctuelle claire: le temps est extrait mais perdu avant l'execution, donc aucun rappel n'est cree.
