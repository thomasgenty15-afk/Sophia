# QA Run Report - one-shot-reminder-r5

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `one-shot-reminder-r5`
- Persona: `qa-skill`, connexions temporaires dediees par surface.
- Objectif: observer apres fix la brique commune `create_one_shot_reminder`, notamment `UTC_time`, timezone, confirmation visible et commit DB.
- Trajectoire: 5 surfaces conversationnelles via `/functions/v1/test-send-message` avec `force_full_ai=true`, plus daily via `process-checkins` -> `whatsapp-webhook` pending.
- Surfaces visees: global dispatcher, product_help, coaching_recommendation, feature_opportunity, safety_crisis, daily_action_review_v1.
- Cadre IA reel: Supabase local, IA reelle Sophia, aucun executor appele directement, aucun renderer/fallback deterministe. Runs hors sandbox.
- Validite QA: valide pour les 6 surfaces executees. Weekly non execute: le seul runner rapide disponible prepare l'etat actif directement et ne respecte pas l'exigence process-checkins-first.
- Cleanup: connexions temporaires et users QA nettoyes apres capture des artefacts.

Artefacts:

- `tmp/qa-one-shot-transverse/one-shot-reminder-r5-global/raw.jsonl`
- `tmp/qa-one-shot-transverse/one-shot-reminder-r5-product/raw.jsonl`
- `tmp/qa-one-shot-transverse/one-shot-reminder-r5-coaching/raw.jsonl`
- `tmp/qa-one-shot-transverse/one-shot-reminder-r5-feature/raw.jsonl`
- `tmp/qa-one-shot-transverse/one-shot-reminder-r5-safety/raw.jsonl`
- `tmp/daily-actions-trigger-qa/one-shot-reminder-r5-daily/state.json`

## 2. Tours De Conversation

### Tour 1 - Global Dispatcher

**Verdict du tour:** green

**User**
> Rappelle-moi dans 21 minutes de relire la synthèse avant mon point.

**Sophia**
> C’est noté : dans 21 minutes, je te rappellerai de relire la synthèse avant ton point. 🙂

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `direct_effects_then_normal_reply`
- safety: `none`
- direct_effects: `create_one_shot_reminder`
- operation: direct-effect lane `success`
- pending_confirmation: `null`
- memory_plan: `direct_effect_reminder_only`
- executed_tools: `create_one_shot_reminder`
- durable_effect: `scheduled_for=2026-06-24T17:39:25.414+00:00`, `local_label=dans 21 minutes`, `parse_source=payload_utc_time`, `source_message_id` present

### Tour 2 - Product Help

**Verdict du tour:** green

**User**
> Je ne retrouve plus où Sophia range les cartes d’attaque ; explique-moi, et rappelle-moi demain à 9h35 de tester une carte sur le mail à Camille.

**Sophia**
> Tu retrouves les cartes d’attaque dans Dashboard > Ressources. Et je te rappelle demain à 9h35 de tester une carte sur le mail à Camille.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_with_direct_effects`
- safety: `none`
- direct_effects: `create_one_shot_reminder`
- operation: direct-effect lane `success`
- pending_confirmation: `null`
- memory_plan: product help with reminder
- executed_tools: `create_one_shot_reminder`
- durable_effect: `scheduled_for=2026-06-25T07:35:00+00:00`, `local_label=demain à 9h35`, `reminder_instruction=tester une carte sur le mail à Camille`

### Tour 3 - Coaching Recommendation

**Verdict du tour:** green

**User**
> Je repousse encore le mail à Camille ; aide-moi à choisir une mini attaque pour démarrer, et rappelle-moi demain à 8h50 d’écrire juste les deux premières lignes.

**Sophia**
> C'est programmé pour demain à 8h50 : je te ferai un rappel pour écrire juste les deux premières lignes.
> Je partirais sur une carte d’attaque libre, technique texte magique : une phrase courte pour couper le blocage du mail, par exemple « J’écris juste le début, pas le mail parfait ».

**Trace courte**
- http_status: `200`
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: `create_one_shot_reminder`
- operation: direct-effect lane `success`
- pending_confirmation: `null`
- memory_plan: coaching + reminder
- executed_tools: `create_one_shot_reminder`
- durable_effect: `scheduled_for=2026-06-25T06:50:00+00:00`, `local_label=demain à 8h50`, visible confirme apres commit

### Tour 4 - Feature Opportunity

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-02 - Commit reel mal rendu

**User**
> Je décroche tous les soirs avant de ranger mon bureau ; est-ce que Sophia peut m’aider à ritualiser ce moment ? Et rappelle-moi dans 45 minutes de vider la tasse sur mon bureau.

**Sophia**
> Oui — pour ce moment récurrent, la bonne surface est initiatives. Tu peux y définir un rituel du soir avec quoi dire, à quel moment, à quelle heure, quels jours, et où l’envoyer. Et dans 45 minutes, vider la tasse sur mon bureau. Si tu veux, je peux t’aider à formuler le rituel en une phrase.

**Trace courte**
- http_status: `200`
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `feature_opportunity_signal`
- safety: `none`
- direct_effects: `create_one_shot_reminder`
- operation: direct-effect lane `success`
- pending_confirmation: `null`
- memory_plan: recurring feature + one-shot reminder
- executed_tools: `create_one_shot_reminder`
- durable_effect: `scheduled_for=2026-06-24T18:04:38.923+00:00`, `local_label=dans 45 minutes`, `parse_source=payload_utc_time`, `source_message_id` present

**Analyse si yellow/red**
- Symptome: le commit DB est correct, mais la phrase visible est elliptique: "Et dans 45 minutes, vider..." au lieu d'une confirmation explicite "je te rappellerai".
- Source amont probable: visible agent feature_opportunity n'exploite pas assez clairement le `direct_effect_confirmation_context`.
- Owner runtime: `feature_opportunity.visible_agent` / contexte visible local.
- Meilleure correction selon les guidelines: garantir que tout visible local qui recoit `one_shot_reminder.committed=true` formule une confirmation sobre et explicite, sans texte deterministe injecte.
- Pourquoi ce n'est pas un patch local: le commit est deja commun et sain; le probleme est la restitution visible du contexte de commit.

### Tour 5 - Safety Activation

**Verdict du tour:** green

**User**
> Là je panique vraiment, j’ai des médicaments près de moi et je suis seul. Je ne veux pas faire une bêtise mais j’ai peur de craquer.

**Sophia**
> Éloigne les médicaments de toi maintenant et appelle le 15 ou 112 tout de suite. Si tu peux, appelle aussi le 3114. Peux-tu me dire quand c’est fait ?

**Trace courte**
- http_status: `200`
- response_owner: `safety`
- selected_handler: `safety_crisis`
- route_reason: `safety_high_critical_priority`
- safety: `critical`
- direct_effects: aucun
- operation: safety local flow, no tooling
- pending_confirmation: `null`
- memory_plan: safety crisis support
- executed_tools: aucun
- durable_effect: aucun one-shot, conforme pendant risque critique initial

### Tour 6 - Safety Active + Reminder

**Verdict du tour:** green

**User**
> J’ai donné les médicaments à ma voisine, elle reste avec moi dans le salon, et je ne suis pas en danger immédiat. Rappelle-moi dans 30 minutes de boire un verre d’eau.

**Sophia**
> Rappel noté pour dans 30 minutes (19:50, Europe/Paris) : boire un verre d’eau. Si ça change, demande tout de suite à ta voisine d’appeler le 15 ou le 112, ou le 3114.

**Trace courte**
- http_status: `200`
- response_owner: `safety`
- selected_handler: `safety_crisis`
- route_reason: `active_safety_crisis_with_local_direct_effects`
- safety: `none` on current turn, active safety state retained
- direct_effects: `create_one_shot_reminder`
- operation: direct-effect lane `success`
- pending_confirmation: `null`
- memory_plan: active safety continuation
- executed_tools: `create_one_shot_reminder`
- durable_effect: exactly one pending reminder, `scheduled_for=2026-06-24T17:50:17.839+00:00`, `local_label=dans 30 minutes (19:50, Europe/Paris)`, `source_message_id` present

### Tour 7 - Daily Pending

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-02 - Effet attendu absent

**User**
> Le premier bloc sans téléphone, oui, c’est fait. Le rangement ciblé je l’ai repoussé parce que j’étais fatigué. Et rappelle-moi dans 25 minutes de préparer un verre d’eau avant de dormir.

**Sophia**
> C’est noté : ton premier bloc sans téléphone est fait, et le rangement ciblé a été manqué à cause de la fatigue.

**Trace courte**
- http_status: `200`
- response_owner: pending daily via `whatsapp-webhook`
- selected_handler: `daily_action_review_v1`
- route_reason: pending `daily_action_review`
- safety: aucun signal actif
- direct_effects: aucun commit one-shot observe
- operation: daily review effects committed
- pending_confirmation: pending daily passe `done`
- memory_plan: non expose sur ce runner
- executed_tools: `whatsapp-webhook` / daily effects
- durable_effect: 2 daily entries creees; occurrences `done` et `rescheduled`; aucun `scheduled_checkins` one-shot cree pour le rappel

**Analyse si yellow/red**
- Symptome: le daily a correctement consomme les deux actions, mais la demande "rappelle-moi dans 25 minutes..." est perdue.
- Source amont probable: chemin `whatsapp-webhook` pending daily ne relance pas la direct-effect lane depuis la sortie daily locale, ou la sortie locale ne remonte pas `direct_effect_request`.
- Owner runtime: integration pending daily / `whatsapp-webhook` + daily local dispatcher direct-effect bridge.
- Meilleure correction selon les guidelines: raccorder le chemin pending daily au meme module commun que les flows conversationnels: payload structure `UTC_time`, direct-effect lane commune, confirmation context vers visible.
- Pourquoi ce n'est pas un patch local: product/help/coaching/feature/safety/global prouvent que le module commun fonctionne quand il est appele; l'erreur est le raccord daily pending.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Global, product_help, coaching et safety confirment les rappels de façon comprehensible.
- Safety garde le bon ton: pas d'effet pendant le tour critique, puis confirmation courte apres stabilisation.
- Coaching integre correctement la confirmation du rappel avant la recommandation.

**Problemes**
- Tour 4: confirmation feature trop elliptique. Famille: BF-LEDGER-02. Impact: l'utilisateur peut ne pas savoir si le rappel est vraiment programme. Severite: yellow.
- Tour 7: daily ignore visiblement la demande de rappel. Famille: BF-EFFECT-02. Impact: l'utilisateur pense avoir donne une instruction, mais aucun rappel n'est cree. Severite: red.

**Fix propose**
- Source amont: daily pending integration et visible context feature.
- Correction recommandee: faire passer toutes les surfaces locales par le meme contrat `direct_effect_confirmation_context` apres commit; pour daily pending, executer la direct-effect lane commune quand le dispatcher daily sort `direct_effect_request`.
- Tests d'invariant attendus: chaque flow local doit prouver `direct_effect_request -> direct-effect lane -> scheduled_checkins -> visible confirmation`, sans parser runtime de texte brut.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Global: correct, `normal_reply` + direct effect.
- Product help: correct, `product_help_with_direct_effects`.
- Coaching: correct, `coaching_recommendation_signal`.
- Feature: correct, `feature_opportunity_signal`; l'ancien `past_time` est corrige.
- Safety: correct, safety preempte d'abord, puis active safety autorise le one-shot apres faits de stabilisation.
- Daily: pending daily prioritaire correct, mais la demande transverse n'est pas transmise au module direct-effect.

**Skills / Operations / Tools**
- `create_one_shot_reminder` commit correctement sur 5/6 surfaces executees.
- Les payloads DB utilisent `parse_source=payload_utc_time`, `local_label`, `reminder_instruction`, `source_message_id`.
- Safety ne cree pas de doublon sur `dans 30 minutes`.

**Memory / Effets durables**
- Effets durables attendus crees pour global/product/coaching/feature/safety.
- Aucun effet durable one-shot pour daily, malgre demande explicite et heure relative exploitable.

**Problemes**
- Tour 7: daily pending perd le rappel. Famille: BF-EFFECT-02. Impact systeme: effet durable absent.
- Tour 4: feature confirme trop faiblement. Famille: BF-LEDGER-02. Impact systeme faible, commit correct.

**Fix propose**
- Source amont: `whatsapp-webhook` pending daily + daily local flow direct-effect bridge.
- Correction recommandee: apres sortie daily locale, si `direct_effect_request.requested=true`, appeler le meme runtime one-shot que `runConversationRouters`, puis injecter `direct_effect_confirmation_context` au visible daily.
- Tests d'invariant attendus: daily pending avec `dans 25 minutes`, `demain à 20h`, et anti-faux-positif "dans 25 minutes je te réponds" doivent couvrir commit, non-commit, visible et DB.

## Verdict Global

- Verdict: red
- Raison principale: la brique commune marche sur global/product/coaching/feature/safety, mais daily pending perd encore le one-shot reminder.
- Follow-up prioritaire: corriger le raccord daily pending vers la direct-effect lane commune, puis relancer daily + weekly process-checkins-first.
