# Bug Sheet — 2026-07-02-rose-broadflow-r1

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-02-rose-broadflow-r1.md`
Persona: Rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`), plan « Arrêter le cannabis ».
Cadre: IA réelle locale, `test-send-message` + `force_full_ai=true`, scope isolé `qa-rose-broadflow-20260702-r1`.

---

## R1-B01 — Confirmation hallucinée d'un rappel inexistant (claim sans commit)

- **Bug id:** R1-B01
- **Tours:** T9, T10 (contexte: T8)
- **Famille:** BF-LEDGER-01
- **Domaine owner:** composition de la réponse finale (`final_response_pipeline` documenté dans `05-effect-ledger.md`, introuvable dans le code actuel) + routing des questions de statut sur un effet direct récent.
- **Source amont:** aucune lecture DB (`executed_tools=[]`) n'a été déclenchée pour répondre à "c'est bien programmé ?" ; la réponse invente un rappel à 21:00 qui n'existe dans aucune table (`whatsapp_pending_actions`, `scheduled_checkins`, `user_recurring_reminders` — 0 ligne créée). Le garde `rewriteUncommittedEffectClaims` documenté comme actif dans `router/final_response_pipeline.ts` (contrat `05-effect-ledger.md`) est introuvable par recherche exhaustive dans `supabase/functions/sophia-brain` (aucune occurrence du nom de fonction ni du fichier).
- **Symptome visible:** « Oui, tu as bien un rappel en attente pour ce soir à 21:00... » — persiste identique au tour suivant même après contestation directe de l'utilisateur ("tu peux vérifier ?").
- **Preuve systeme:** `response_owner=normal_reply`, `executed_tools=[]`, `effect_ledger` à 0 sur T9 et T10 ; vérification DB directe (`docker exec ... psql`) : 0 ligne dans les 3 tables de rappel pour Rose sur les 2 dernières heures.
- **Correction attendue:** (1) vérifier si le garde documenté a été supprimé/renommé sans mise à jour de contrat, et le rétablir si absent ; (2) router toute question de type statut ("c'est programmé ?", "j'ai bien X ?") portant sur un effet direct récent vers une lecture DB-grounded (status_recap ou équivalent), jamais vers `normal_reply` improvisant depuis le contexte conversationnel.
- **Statut:** requalifié (2026-07-02, contre-vérification DB) — PAS une hallucination. Le rappel de 21:00 décrit par Sophia **existe réellement** : `scheduled_checkins` `45d61e4c`, `status=pending`, `19:00Z` = 21:00 Paris, « faire mon sas de décompression » — la vérification QA n'avait porté que sur les créations des 2 dernières heures. Sophia était groundée sur cet effet réel (résumé des effets durables du contexte) et a correctement distingué (« si tu parles de 19h, ce n'est pas ce qui est listé ici »). Le défaut racine est en amont : le blocage `past_time` de T8 jamais annoncé (voir R1-B03, fix_applied). Note doc : le garde `rewriteUncommittedEffectClaims`/`final_response_pipeline.ts` documenté dans `05-effect-ledger.md` n'existe pas dans le code V2 — doc corrigée le 2026-07-02 (discipline de claim portée par les contrats de prompt + `direct_effect_confirmation_context`).
- **Fix reference:** couvert par le fix R1-B03 (raison de blocage exposée au composeur) + correction de `05-effect-ledger.md`.
- **Tests requis:** couverts par R1-B03 ; anti-faux-positif (rappel réellement committé ⇒ confirmation correcte avec bon horaire) conservé pour le rerun.

## R1-B02 — Demande de préférence coach supportée jamais appliquée (owner feature_opportunity au lieu de update_coach_preferences)

- **Bug id:** R1-B02
- **Tours:** T5, T6
- **Famille:** BF-ROUTE-01
- **Domaine owner:** dispatcher global (arbitrage product/tool) + `update_coach_preferences/local_dispatcher.ts`.
- **Source amont:** la demande ("plus direct, moins de questions, à partir de maintenant") mappe exactement sur `coach.tone=direct` et `coach.question_tendency=low`, clés fermées documentées dans `runtime-contracts/tools/update-coach-preferences.md` comme write-skill léger à déclenchement direct sur demande claire/durable/supportée. Le dispatcher global route pourtant vers `feature_opportunity`, y compris après refus explicite de l'utilisateur d'aller lui-même dans les réglages (T6).
- **Symptome visible:** « la bonne piste c'est les préférences de coaching... tu peux chercher ça dans les Preferences coach » — répété quasi identique au tour suivant malgré "applique le direct toi".
- **Preuve systeme:** `response_owner=feature_opportunity`, `reason_code=feature_opportunity_signal` sur T5 et T6 ; `direct_effects=[]`, `executed_tools=[]` ; `user_profile_facts.coach.*` vérifié inchangé en DB (timestamps antérieurs au run, 2026-06-02).
- **Correction attendue (révisée, décision produit 2026-07-02, option a):** le write-skill `update_coach_preferences` a été **retiré** dans le redesign V2 — le contrat `update-coach-preferences.md` sur lequel s'appuyait ce bug était périmé (mis à jour avec un en-tête STATUT V2). Le routage vers `feature_opportunity` → redirection Preferences coach est le comportement voulu. Résiduel UX traité : ne jamais répéter la même redirection verbatim après un refus explicite (« applique-le toi ») — dire honnêtement que le réglage durable ne se fait pas depuis le chat et confirmer l'adaptation du style dans la conversation.
- **Statut:** resolved_by_design (redirect = design V2 assumé) + fix_applied pour le résiduel anti-répétition (rerun requis)
- **Fix reference:** doctrine anti-répétition dans `skills/feature_opportunity/visible_agent.ts` (productGuidancePromptLines) ; contrat `update-coach-preferences.md` mis à jour (statut V2).
- **Tests requis:** positif (demande claire "sois plus direct/moins de questions" ⇒ owner `update_coach_preferences`, write `user_profile_facts` ou confirmation explicite) ; paraphrase ("moins de blabla", "vas droit au but") ; anti-faux-positif (demande de style non supportée, ex. "jamais d'emoji" ⇒ traitement explicite non supporté, pas silence produit) ; intégration runtime.

## R1-B03 — Effet bloqué (past_time) non signalé à l'utilisateur

- **Bug id:** R1-B03
- **Tours:** T8
- **Famille:** BF-LEDGER-02
- **Domaine owner:** renderer du direct effect `create_one_shot_reminder` (contrat transverse `one-shot-reminder-transverse-direct-effect-contract.md`).
- **Source amont:** l'`effect_ledger` marque correctement l'effet `blocked` (`reason_code=past_time`), mais la réponse visible ne reflète pas ce blocage et reformule la demande comme si elle restait valable, sans proposer un horaire futur.
- **Symptome visible:** « je ne peux pas le programmer moi-même ici, mais le rappel que tu veux, c'est bien pour ce soir à 19h... » — aucune mention explicite que l'heure est passée et que rien n'a été créé.
- **Preuve systeme:** `effect_ledger.counts = {requested:1, allowed:0, blocked:1}`, `entries[0].reason_code="past_time"` ; DB inchangée (0 nouvelle ligne).
- **Correction attendue:** mapper explicitement `blocked/past_time` vers un message clair ("cette heure est déjà passée aujourd'hui, tu veux un autre horaire ou demain ?") dans le renderer du direct effect, avant le passage au style/emoji final.
- **Statut:** fix_applied (rerun requis)
- **Fix reference:** cause racine identifiée — le contexte de confirmation passé au composeur vidait les `blocked_effects` sans exposer la raison : le composeur savait « pas de commit » mais pas « pourquoi », d'où le refus ambigu. Fix : `blocked_one_shot_reminder.reason_code` exposé dans `direct_effect_local_context.ts` (buildDirectEffectConfirmationContext) + doctrine canonique (`one_shot_reminder_prompt_contract.ts`) : past_time ⇒ « rien n'a été créé, l'heure est passée, autre horaire ou demain ? », jamais de reformulation de la demande bloquée comme si valide, et réponse au reste du message (pas de réponse déterministe : le composeur garde la main sur le multi-intention, le reply du router n'est qu'un fallback — lui aussi corrigé). Tests : « blocked past_time yields an explicit no-creation reply » + contrat canonique.
- **Tests requis:** positif (heure passée ⇒ message explicite de blocage + proposition d'horaire futur) ; anti-régression (heure future valide ⇒ commit et confirmation normale inchangés).

## R1-B04 — Frontière feature_opportunity / coaching_recommendation floue sur blocage de démarrage d'habitude

- **Bug id:** R1-B04
- **Tours:** T7
- **Famille:** BF-ROUTE-03 (à classifier — confiance moyenne)
- **Domaine owner:** policy d'arbitrage dispatcher entre `feature_opportunity` et `coaching_recommendation`.
- **Source amont:** un pattern de blocage de démarrage automatique sur une habitude active du plan a été traité par `feature_opportunity` ("initiatives"/rappel programmé) alors qu'une trace réelle antérieure du même compte (scope `whatsapp`, 2026-06-29) traitait un pattern très proche par `coaching_recommendation` (`attack_card`, `launch_blocker`).
- **Symptome visible:** proposition de fonctionnalité "initiatives" sans qu'une carte d'attaque (technique de démarrage) soit évaluée en concurrence.
- **Preuve systeme:** `response_owner=feature_opportunity`, `reason_code=active_feature_opportunity`.
- **Correction attendue:** clarifier la priorité d'arbitrage quand le signal ressemble à un `launch_blocker` sur un item `habits` actif — évaluer `coaching_recommendation` en concurrence avant de conclure `feature_opportunity`.
- **Statut:** open (confiance modérée — à revérifier par un run ciblé)
- **Fix reference:** —
- **Tests requis:** paraphrase du même pattern de blocage sur plusieurs habitudes différentes pour voir si `feature_opportunity` est systématique ou contextuel.

## R1-B05 — direct_effect classifié one-shot pour une demande explicitement récurrente

- **Bug id:** R1-B05
- **Tours:** T15
- **Famille:** BF-EFFECT-03 (à classifier — impact utilisateur faible)
- **Domaine owner:** compilateur de payload du direct effect `create_one_shot_reminder`.
- **Source amont:** la demande ("tous les soirs à 20h... chaque jour pareil") est explicitement récurrente, mais le direct effect détecté est `create_one_shot_reminder` (ponctuel), bloqué `past_time`. La réponse visible reste correcte (redirection vers "Initiatives" pour du récurrent), donc sans impact utilisateur direct dans ce tour, mais la trace interne est incohérente avec l'intention.
- **Symptome visible:** aucun impact visible ce tour (réponse honnête), mais risque de confusion si un futur payload de ce type était un jour committé tel quel (rappel unique au lieu de récurrent).
- **Preuve systeme:** `direct_effects[0].effect_type="create_one_shot_reminder"`, `payload_hint.when_hint="tous les soirs a 20h"`.
- **Correction attendue:** détecter le marqueur de récurrence ("tous les soirs", "chaque jour") et ne pas classifier en `create_one_shot_reminder` — la doctrine existe déjà (bloc canonique + frontière initiatives, fix du 2026-07-02) et la réponse visible était correcte ; le résiduel est l'émission du direct effect dans la trace malgré la doctrine (désobéissance LLM sans conséquence : bloqué en aval).
- **Statut:** open (basse priorité — surveiller au rerun ; si l'émission persiste, ajouter le champ structurel `cardinality` au contrat du payload pour un blocage déterministe au gate)
- **Fix reference:** doctrine déjà en place (`one_shot_reminder_prompt_contract.ts`, `dispatcher.prompts.ts` — exemple « relancer tous les soirs » ⇒ feature_opportunity).
- **Tests requis:** positif (marqueur de récurrence explicite ⇒ pas de `create_one_shot_reminder` proposé) ; anti-régression (demande ponctuelle claire ⇒ comportement actuel inchangé).

## Note Environnement — Collision Multi-Run (hors classification bug produit)

Pendant ce run, 3 autres sessions QA actives en parallèle ont été détectées sur le même `user_id` Rose (scopes `qa-run-20260702-r1`, `qa-rose-2026-07-02-globaleval15-r1`, `qa-multiflow2-20260702-r1`), créant leurs propres `user_plan_item_entries`/`scheduled_checkins` sur le plan partagé pendant la fenêtre de ce run. Chaque effet a été vérifié par `turn_id`/`committed_id`/timestamp avant d'être attribué ou explicitement laissé de côté (voir run report §1). Ce n'est pas un bug conversationnel mais un risque d'hygiène inter-runs : l'isolation par `connection.json`/`scope` de chat ne protège pas les effets métier au niveau `user_id` (plan, mémoire) contre des runs concurrents sur le même compte de test partagé. Recommandation opérationnelle (pas un fix code) : éviter de lancer plusieurs runs QA globaux simultanés sur la même persona, ou prévoir des personas de test dédiées par run parallèle.
