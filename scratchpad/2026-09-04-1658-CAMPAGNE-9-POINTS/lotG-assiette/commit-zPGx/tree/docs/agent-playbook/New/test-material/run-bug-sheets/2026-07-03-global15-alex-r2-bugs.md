# Bug Sheet — Global15 Alex R2 (2026-07-03)

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-global15-alex-r2.md`
Persona: Alex (`aac76fd6-a688-4027-951a-fa79c628fac5`), scope `qa-global15-2026-07-03-alex-r2` (plan V2 cloné depuis Rose, supprimé en fin de run).

Taxonomie: `docs/agent-playbook/New/test-material/familly-bugs.md`.

---

## R2-B01 — Flow actif capture une nouvelle intention (stickiness)

- Tours: T3 (coaching → track_progress), T11 (feature_opportunity → mémoire)
- Famille: **BF-ROUTE-02**
- Domaine owner: active flow / interruption policy + dispatcher re-arbitration
- Source amont: la policy de flow actif ne ré-arbitre pas l'owner face à une nouvelle intention hétérogène; la détection direct-effect (track_progress) et l'intention mémoire sont court-circuitées tant que le flow tient (`active_coaching_recommendation`, `active_feature_opportunity`).
- Symptôme visible: T3 report d'action « soirée zéro vide faite » ignoré (0 effet); T11 « je veux que tu le retiennes » non accusé, redirigé vers « initiatives »; il faut forcer « laisse tomber les initiatives » (T12) pour débloquer.
- Preuve système: T3 `route_reason=active_coaching_recommendation`, `direct_effects=[]`; T11 `route_reason_code=active_feature_opportunity`, `memory_write_candidates_emitted=0`; T12 `skill_status=exit` puis accusé correct.
- Correction attendue: ré-évaluer direct-effect + intention mémoire à chaque tour, avec priorité d'interruption sur la continuité d'un flow skill non pertinent.
- Tests requis: track_progress détecté sous flow coaching (positif + paraphrase); intention mémoire sous flow feature_opportunity → accusé + candidat; anti-faux-positif (small talk sous flow ne casse pas le flow).
- Statut: fix_applied (rerun requis)
- Fix reference: (1) doctrine « hors périmètre » explicite dans les dispatchers locaux `coaching_recommendation` et `feature_opportunity` (`local_flow.ts`) : report d'action accomplie/ratée et demande de mémorisation ⇒ `exit_to_global_dispatcher`, jamais absorbés ni accusés verbalement sans commit ; (2) nouvelle lane de ré-exécution `track_progress` après sortie de flow local (`router/run.ts`, miroir de celle des rappels, via `runTrackProgressRuntimeLane` extraite du pipeline) — le dispatcher global étant sauté sous flow actif, le commit se fait au redispatch du même tour ; idempotence par `source_message_id` (pas de double commit).

## R2-B02 — Complétion d'item mission détectée+routée mais non commitée

- Tours: T4 (secondairement T3)
- Famille: **BF-EFFECT-02** (secondaire **BF-LEDGER-02**)
- Domaine owner: `track_progress_plan_item` executor + admission d'effet (branche mission/task) + final response guard
- Source amont: pour un item mission/task, l'effet `track_progress_plan_item` est admis au routing (`direct_effects_to_run=["track_progress_plan_item"]`) mais aucun write n'est produit; le renderer verbalise un refus « je ne peux pas la cocher ici ». Différentiel prouvé vs habit (T5 commit OK) sur le même plan.
- Symptôme visible: demande explicite « coche-la », item reste `active`, 0 entry; réponse = refus.
- Preuve système: T4 turn_frame.direct_effects contient track_progress (explicit/high, item `3c5c8aff`), colonne DB `direct_effects=[]`, item `completed_at` null, 0 entry. T5 (habit): entry créée, reps 1/3→2/3.
- Correction attendue: unifier le commit mission avec le commit habit (entry + transition statut), ou émettre un `pending_confirmation`/proposé au ledger si un consentement plateforme est requis — jamais un `direct_effects_to_run` fantôme rendu par un refus.
- Tests requis: commit complétion mission (positif + paraphrase), cohérence route↔ledger↔renderer, anti-faux-positif (mention vague ≠ commit).
- Statut: fix_applied partiel (rerun requis)
- Fix reference: reproduction en probe réel contrôlé (2026-07-03, persona Rose — seul plan réel disponible, Alex n'ayant plus de plan ; run unique, zéro concurrence) : le commit mission **fonctionne** (entry + committed=1) mais le composeur **niait l'effet réel** (« je ne peux pas la cocher ici ») — le contexte de confirmation n'exposait que les rappels. Fix : `track_progress` committé exposé dans `direct_effect_confirmation_context` (`direct_effect_local_context.ts`) + règles canoniques/EN « ne dis jamais que tu ne peux pas cocher/marquer/tracker depuis le chat » quand `track_progress.committed=true`. Le zéro-commit spécifique du T4 d'Alex (plan cloné supprimé) reste non reproduit ; le fix P3 (raisons de blocage tracées) le rendra visible au rerun s'il persiste.

## R2-B03 — Confirmation de rappel incohérente avec l'effet créé

- Tours: T6
- Famille: **BF-LEDGER-02** (secondaire **BF-INTAKE-04**)
- Domaine owner: renderer/confirmation `create_one_shot_reminder` + intake temporel
- Source amont: le rendu relit l'état après création et présente le rappel qu'il vient de créer comme « déjà en attente », tout en affirmant « rien créé » pour le jour demandé; l'ambiguïté « demain à 21h » (à 2h du matin) n'est pas explicitée.
- Symptôme visible: un unique rappel créé (aujourd'hui 21h) présenté comme préexistant + « demain rien créé », alors que l'user demandait demain 21h.
- Preuve système: `scheduled_checkins` `935e7b93` unique, `created_at` = ce tour, baseline 0; direct_effect `when_hint="demain à 21h"` résolu à `2026-07-03T19:00Z`.
- Correction attendue: message de confirmation dérivé de l'EffectLedger du tour (« créé pour aujourd'hui 21h »); si le jour est ambigu, confirmer avant/à la création.
- Tests requis: reminder render = effet du tour; ambiguïté jour → clarification; pas de « déjà existant » sur un effet du tour courant.
- Statut: fix_applied (rerun requis)
- Fix reference: (1) règle nocturne dans le bloc canonique dispatcher (`one_shot_reminder_prompt_contract.ts`) : entre 00:00 et 06:00 locale, « ce soir » = jour civil courant, « demain » = J+1 strict, ambiguïté ⇒ pas d'émission ; (2) rendu : un commit du tour est présenté « comme venant d'être créé — jamais comme déjà en attente/préexistant » (ligne canonique committedThisTurn + règles EN companion).

## R2-B04 — Rappel récurrent: owner off + récurrence aplatie en one-shot passé

- Tours: T10
- Famille: **BF-ROUTE-01** (secondaire **BF-INTAKE-02 / BF-EFFECT-03**)
- Domaine owner: routing reminder/initiative + intake `create_one_shot_reminder` (garde-fou récurrence)
- Source amont: pas de chemin de création de rappel récurrent depuis le chat; la demande est routée `feature_opportunity` et l'intake mappe « tous les soirs » sur un one-shot à une date passée (2026-07-02) — non commité (bon garde-fou final).
- Symptôme visible: « colle-moi un rappel tous les soirs à 21h » → redirect « Initiatives », `user_recurring_reminders=0`.
- Preuve système: `response_owner=feature_opportunity`; direct_effect `create_one_shot_reminder UTC_time=2026-07-02T19:00Z` (passé), aucun checkin créé.
- Correction attendue: reconnaître l'intention « récurrent » et la router vers un owner reminder/initiative dédié ou surfacer le gap sans fabriquer un one-shot daté au passé.
- Tests requis: intention récurrente → owner correct/gap explicite; anti-aplatissement récurrence→one-shot; pas de one-shot au passé.
- Statut: fix_applied (rerun requis)
- Fix reference: escalade structurelle actée — `payload_hint.cardinality` obligatoire (`once`) dans le contrat dispatcher ; si le LLM émet malgré tout un one-shot pour une demande récurrente avec `cardinality=recurring`, le gate du router (`tools/always_on/one_shot_reminder/router.ts`) bloque `recurring_not_supported` avec réponse dédiée vers Initiatives, au lieu de créer un ponctuel aplati (ou daté au passé). Tests : « cardinality=recurring blocks the one-shot... » + contrat dispatcher.

## R2-B05 — Clarification coaching alors que le slot situation est fourni

- Tours: T1
- Famille: **BF-INTAKE-01** (variante BF-INTAKE-04)
- Domaine owner: `coaching_recommendation` intake/clarify gate
- Source amont: `coaching_type=ambiguous` déclenche une question de cadrage générique alors que le turn_frame contient déjà situation + déclencheur (substance_use_urge, « seul/ennui/soir »).
- Symptôme visible: « Tu veux te débloquer par rapport à quelle situation exactement ? » sur un message déjà explicite.
- Preuve système: T1 `coaching_type=ambiguous` conf 0.84, safety medium (substance_use_urge, time_critical_urge).
- Correction attendue: pré-remplir le slot situation depuis le turn_frame; n'appeler la clarification que si le slot est réellement vide.
- Tests requis: contexte fourni → pas de re-clarification; contexte vraiment vide → clarification.
- Statut: fix_applied (rerun requis)
- Fix reference: doctrine du dispatcher local coaching (`coaching_recommendation/local_flow.ts`) : ne jamais re-clarifier un slot déjà fourni — si `dispatcher_signal_context` (reason/action_context) ou le message contient déjà situation + déclencheur, entrer directement dans le coaching du type correspondant ; la clarification est réservée aux cas où la situation est réellement absente.

## R2-B06 — Timeout gateway sur tour coaching lent (fiabilité)

- Tours: T2
- Famille: **BF-EFFECT-04** (fragilité technique/latence; hors taxo métier stricte)
- Domaine owner: pipeline `coaching_recommendation` (latence) + gateway local Kong (timeout)
- Source amont: latence skill coaching 16–29s > timeout gateway ~15s → `502` réponse vide, sur un tour de rechute imminente.
- Symptôme visible: 2×502 avant succès (retry), réponse vide pour l'user au pire moment.
- Preuve système: 2 appels `502`, 3e `200` ~20s; `skill_latency 16.7s`. Aucun effet durable, orphelins nettoyés.
- Correction attendue: réduire/streamer la latence coaching (tier/budget adapté à un tour de présence) et/ou marge de timeout pour ces tours; un moment de risque ne doit jamais renvoyer du vide. (Reboot interdit pendant le run — non tenté.)
- Tests requis: p95 latence coaching sous le seuil gateway; pas de réponse vide sur tour safety-adjacent.
- Statut: open (infra, hors périmètre code Sophia) — latence coaching 16-29 s vs timeout gateway ~15 s : à traiter côté configuration (timeout Kong local / budget de modèle du skill coaching), aggravé pendant les runs par la saturation du LLM local partagé. Aucun fix code appliqué.

---

### Récap verdicts tours

| Tour | Verdict | Famille |
| --- | --- | --- |
| T1 | yellow | BF-INTAKE-01 |
| T2 | yellow | BF-EFFECT-04 |
| T3 | red | BF-ROUTE-02 |
| T4 | red | BF-EFFECT-02 / BF-LEDGER-02 |
| T5 | green | — |
| T6 | yellow | BF-LEDGER-02 / BF-INTAKE-04 |
| T7 | green | — |
| T8 | green | — |
| T9 | green | — |
| T10 | yellow | BF-ROUTE-01 / BF-INTAKE-02 |
| T11 | red | BF-ROUTE-02 |
| T12 | green | — |
| T13 | green | — |
| T14 | green | — |
| T15 | green | — |

Global: **red** (analyse système red — effets durables faux/absents sur intention explicite).
