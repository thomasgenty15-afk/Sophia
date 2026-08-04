# QA Run Report - One-Shot Reminder Seven Flows R2

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `one-shot-reminder-seven-flows-r2`
- Persona: `qa-skill` + fixture weekly dédiée
- Objectif: vérifier `create_one_shot_reminder` dans 7 chemins: global/normal, product_help, coaching_recommendation, feature_opportunity, safety_crisis, daily_action_review, weekly_adaptive_review.
- Trajectoire: runs locaux Sophia réels; daily et weekly déclenchés par process-checkin avant la réponse user.
- Surfaces visees: global dispatcher, active local flows, direct-effect lane, visible confirmation, `scheduled_checkins`, `whatsapp_pending_actions`, process-checkins.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message` avec `force_full_ai=true` pour les flows web; `process-checkins` + `whatsapp-webhook` pour daily; `process-checkins` + active weekly pour weekly. Aucun renderer déterministe, staging ou executor direct.
- Validite QA: valide, avec incident documenté sur le setup weekly initial: le script direct-Deno ne chargeait pas les clés LLM; relance faite en chargeant les env locaux puis passage par `process-checkins`.

Artifacts principaux:

- Raw global/product/coaching/feature/safety: `tmp/qa-one-shot-transverse/one-shot-reminder-seven-flows-r2-*/raw.jsonl`
- Raw daily: `tmp/daily-actions-trigger-qa/one-shot-reminder-seven-flows-r2-daily/state.json`
- Raw weekly: `tmp/weekly-real-conversation-qa/one-shot-reminder-seven-flows-r2-weekly-turns/state.json`

## 2. Tours De Conversation

### Flow 1 - Global / Normal Reply

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-03 - Payload durable faux

**User**
> Rappelle-moi demain à 09h10 de préparer mon sac de sport, et sinon réponds-moi juste normalement : je veux garder ça simple.

**Sophia**
> C’est noté pour demain à 09:10 : préparer ton sac de sport. Je te réponds simplement, comme demandé.

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- route_reason: `direct_effects_then_normal_reply`
- direct_effects: `create_one_shot_reminder`
- operation: `create_one_shot_reminder` success
- durable_effect: `scheduled_checkins.b5cfe203-...`, `scheduled_for=2026-06-25T09:10:00+00:00`, timezone payload `Europe/Paris`

**Analyse si yellow/red**
- Symptome: le rappel est créé, mais `09:10 Europe/Paris` est stocké comme `09:10Z` au lieu de `07:10Z`.
- Source amont probable: compilation/validation temporelle de la direct-effect lane sur comptes QA sans profil complet.
- Owner runtime: `create_one_shot_reminder` direct-effect lane.
- Meilleure correction selon les guidelines: centraliser la conversion timezone dans la lane, pas dans les prompts.

### Flow 2 - Product Help

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-03 - Payload durable faux

**User**
> Dans le dashboard Sophia, je cherche où voir mes cartes ressources. Et rappelle-moi demain à 14h20 de rouvrir l'onglet ressources.

**Sophia**
> Tu les vois dans Dashboard > Ressources. Les cartes ressources sont rangées là quand l’onglet est disponible, avec les ressources liées au plan. Et je te rappelle demain à 14:20 de rouvrir l’onglet ressources.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_with_direct_effects`
- direct_effects: `create_one_shot_reminder`
- operation: success
- durable_effect: `scheduled_for=2026-06-25T14:20:00+00:00`, timezone payload `Europe/Paris`

**Analyse si yellow/red**
- Symptome: bon owner + commit, mais heure durable non convertie depuis Paris.
- Source amont probable: même bug de payload temporel que Flow 1.
- Owner runtime: direct-effect lane.
- Correction recommandee: invariant d’intégration: une demande `demain à HH:mm` en timezone user doit persister l’instant UTC correspondant.

### Flow 3 - Coaching Recommendation

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-03 - Payload durable faux

**User**
> J'ai besoin d'une recommandation concrète pour éviter de repousser mon bloc de travail demain matin. Rappelle-moi aussi demain à 08h40 de lancer ce bloc sans téléphone.

**Sophia**
> C'est noté pour demain à 08h40 : je te rappellerai de lancer ce bloc sans téléphone. Pour te guider proprement, tu veux te débloquer par rapport à quoi exactement ?

**Trace courte**
- http_status: `200`
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- direct_effects: `create_one_shot_reminder`
- operation: success
- durable_effect: `scheduled_for=2026-06-25T08:40:00+00:00`, timezone payload `Europe/Paris`

**Analyse si yellow/red**
- Symptome: flow coaching maintenu et rappel commité, mais heure durable UTC incorrecte.
- Source amont probable: direct-effect lane.
- Owner runtime: `create_one_shot_reminder`.

### Flow 4 - Feature Opportunity

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-03 - Payload durable faux

**User**
> J'ai une idée produit : quand Sophia crée un rappel, j'aimerais voir une petite ligne dans l'historique des effets. Rappelle-moi demain à 16h05 de noter l'exemple exact.

**Sophia**
> Ton rappel pour demain à 16h05 est bien pris en compte : noter l’exemple exact. Pour ton idée produit, la bonne surface est initiatives. Tu peux y préciser quoi dire, avant quel moment, l’horaire et le rythme si c’est récurrent.

**Trace courte**
- http_status: `200`
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- direct_effects: `create_one_shot_reminder`
- operation: success
- durable_effect: `scheduled_for=2026-06-25T16:05:00+00:00`, timezone payload `Europe/Paris`

**Analyse si yellow/red**
- Symptome: même problème de conversion temporelle durable.
- Note secondaire: la réponse feature est utilisable mais oriente un peu vite vers `initiatives`.

### Flow 5 - Safety Crisis

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-02 - Effet attendu absent

**Tour exploratoire non safety**

**User**
> Je suis très anxieux et j'ai peur de perdre le contrôle, mais je suis seul chez moi et je peux rester en sécurité. Rappelle-moi dans 30 minutes de boire un verre d'eau et de respirer deux minutes.

**Sophia**
> Je reste avec toi. Là, le plus important c’est juste de passer ce moment sans te brusquer. Pour le rappel, je ne peux pas le garantir ici dans ce chat. En attendant, pose un verre d’eau à côté de toi et lance un minuteur de 2 minutes pour respirer lentement maintenant.

**Trace courte**
- response_owner: `normal_reply`
- safety: `risk_band=none`
- operation: `create_one_shot_reminder` blocked, `reason=past_time`

**Tour safety réel**

**User**
> Là j'ai des pensées de me faire du mal ce soir. Je n'ai pas de moyen avec moi, je peux m'éloigner de la cuisine et appeler mon frère. Rappelle-moi dans 30 minutes d'envoyer un SMS à mon frère.

**Sophia**
> Éloigne-toi de la cuisine maintenant et appelle ton frère tout de suite. Si tu sens que tu peux passer à l’acte, appelle le 15 ou 112, ou le 3114, maintenant.

**Trace courte**
- http_status: `200`
- response_owner: `safety`
- selected_handler: `safety_crisis`
- route_reason: `safety_high_critical_priority`
- safety: `risk_band=high`
- direct_effects: `[]`
- durable_effect: aucun rappel créé

**Analyse si yellow/red**
- Symptome: quand safety est réellement propriétaire, le rappel explicite n’est pas exposé à la direct-effect lane.
- Source amont probable: `safety_crisis` local dispatcher / bridge direct-effect.
- Owner runtime: safety local flow + transverse direct-effect integration.
- Meilleure correction: respecter le contrat transverse: safety garde l’ownership mais doit exposer `create_one_shot_reminder` pour la lane standard.

### Flow 6 - Daily Action Review

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-02 - Commit réel mal rendu

**Tour 0 - process-checkins daily**

**Sophia**
> Je reviens sur tes deux actions du jour : 10 minutes de rangement ciblé et préparer un premier bloc de travail sans téléphone. Ça s’est passé comment pour toi ?

**Trace courte**
- response_owner: `process-checkins`
- selected_handler: `action_evening_review_v2`
- pending_confirmation: `whatsapp_pending_actions.chat_capability=daily_action_review`

**Tour 1 - réponse pending daily**

**User**
> Le rangement est fait, le bloc sans téléphone je l'ai seulement préparé à moitié parce que j'étais fatigué. Rappelle-moi demain à 18h15 de finir ce bloc.

**Sophia**
> C’est noté pour le rangement fait, et pour le bloc sans téléphone préparé à moitié.

**Trace courte**
- http_status: `200`
- selected_handler: `handleActionEveningReviewReply`
- pending_status: `done`
- entries: `2`
- durable_effect: one-shot reminder créé `scheduled_for=2026-06-25T16:15:00+00:00`, correct pour `18:15 Europe/Paris`

**Analyse si yellow/red**
- Symptome: l’effet durable est correct mais la réponse visible ne confirme pas le rappel.
- Source amont probable: intégration `direct_effect_confirmation_context` dans le chemin `whatsapp-webhook/handlers_pending.ts`.
- Owner runtime: pending daily response pipeline.
- Correction recommandee: après commit direct-effect, injecter le contexte de confirmation dans la réponse daily visible.

### Flow 7 - Weekly Adaptive Review

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATUS-03 - Temps/localisation mal rendus

**Tour 0 - process-checkins weekly**

**Sophia**
> C’est le moment du bilan de ta semaine : il y a eu du bon, avec quelques actions déjà faites, et d’autres qui sont restées plus lourdes ou en attente. Comment tu l’as vécue dans l’ensemble ?

**Trace courte**
- response_owner: `process-checkins`
- event_context: `weekly_progress_review_v2`
- active owner préparé: `weekly_adaptive_review_v1`

**Tour 1 - réponse weekly + rappel**

**User**
> Je l'ai vécue comme une semaine correcte mais fatigante : j'ai gardé une partie du rythme, et la fin de semaine m'a vidé. Rappelle-moi demain à 10h30 de relire la synthèse weekly.

**Sophia**
> J’ai bien pris en compte ton rappel pour demain à 8h30 : relire la synthèse weekly. Sur l’ensemble de la semaine, tu as l’impression d’avancer un peu vers ton objectif global, ou plutôt pas trop ?

**Trace courte**
- http_status: `200`
- response_owner: `weekly_adaptive_review_v1`
- route_reason: `direct_effect_lane_message_intake`
- operation: `create_one_shot_reminder` success
- durable_effect: `scheduled_for=2026-06-25T08:30:00+00:00`, correct pour `10:30 Europe/Paris`

**Analyse si yellow/red**
- Symptome: le commit DB est correct, mais le visible affiche `8h30` au lieu de `10h30`.
- Source amont probable: rendu visible depuis `scheduled_for` UTC au lieu du `local_label` / timezone utilisateur.
- Owner runtime: weekly visible/direct-effect confirmation formatter.
- Correction recommandee: le visible doit confirmer avec l’heure locale demandée, pas l’instant UTC brut.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Product, coaching, feature, daily et weekly gardent le besoin principal au lieu de laisser le rappel absorber tout le tour.
- Safety réel donne une réponse de crise courte, prioritaire et correcte.
- Weekly continue le bilan après commit du rappel.

**Problemes**
- Flows 1-4: confirmations visibles cohérentes en texte, mais l’effet durable est probablement à la mauvaise heure sur comptes QA sans profil complet. Famille: BF-EFFECT-03. Impact: le user croit avoir une heure locale, le rappel partira plus tard.
- Flow 6: daily crée le rappel mais ne le dit pas. Famille: BF-LEDGER-02. Impact: le user peut croire que la demande de rappel a été ignorée.
- Flow 7: weekly confirme l’heure UTC au lieu de l’heure locale. Famille: BF-STATUS-03. Impact: confusion immédiate malgré un commit DB correct.

**Fix propose**
- Source amont: runtime direct-effect + formatters visibles par flow.
- Correction recommandee: un seul formatter canonical local-time pour confirmations; une seule validation timezone dans la lane.
- Tests d'invariant attendus: `demain à HH:mm` en Europe/Paris doit persister le bon UTC et afficher le HH:mm local demandé dans chaque flow.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Global, product, coaching, feature: bon owner et direct-effect lane lancée.
- Daily: process-checkin ouvre bien le pending, webhook traite le pending, et le rappel est commité.
- Weekly: process-checkin ouvre bien le weekly; active owner `weekly_adaptive_review_v1` maintenu.
- Safety: owner safety correct au tour 2, mais la direct-effect lane n’est pas appelée malgré demande explicite.

**Skills / Operations / Tools**
- `create_one_shot_reminder` est exécuté avec succès dans 6/7 flows.
- Safety réel: `direct_effects_to_run=[]`, donc 0/1 sur safety.
- Weekly trace montre un doublon dans `requested_effects/committed_effects` mais un seul `scheduled_checkins` durable.

**Memory / Effets durables**
- Daily: rappel durable correct `2026-06-25T16:15:00Z` pour `18:15 Europe/Paris`.
- Weekly: rappel durable correct `2026-06-25T08:30:00Z` pour `10:30 Europe/Paris`.
- Global/product/coaching/feature: rappel durable créé mais heure UTC semble égale à l’heure locale demandée, donc offset CEST non appliqué.

**Problemes**
- Flows 1-4: payload durable faux. Famille: BF-EFFECT-03. Severite: red.
- Flow 5: safety ne transmet pas le rappel explicite. Famille: BF-EFFECT-02. Severite: red.
- Flow 6: commit daily non rendu. Famille: BF-LEDGER-02. Severite: yellow.
- Flow 7: heure locale mal affichée. Famille: BF-STATUS-03. Severite: yellow.

**Fix propose**
- Source amont: direct-effect lane, safety bridge, visible confirmation context.
- Correction recommandee: imposer le contrat transverse `one-shot-reminder-transverse-direct-effect-contract.md` comme invariant runtime, pas comme règle de prompt isolée.
- Tests d'invariant attendus: 7 intégrations réelles ou contractuelles: normal, product, coaching, feature, safety, daily pending, weekly active owner.

## Verdict Global

- Verdict: red
- Raison principale: la lane est bien branchée sur la majorité des flows, mais safety ne la lance pas et plusieurs chemins ont des erreurs heure/confirmation.
- Follow-up prioritaire: corriger safety direct-effect bridge + formatter/validation timezone canonical, puis relancer les 7 flows.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-24-one-shot-reminder-seven-flows-r2-bugs.md`
