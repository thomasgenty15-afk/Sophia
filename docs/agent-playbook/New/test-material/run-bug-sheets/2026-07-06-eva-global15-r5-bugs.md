# Bug Sheet — Eva Global15 r5 (2026-07-06)

Run: `qa-eva-global15-20260706-r5` (Eva, web, Europe/Paris, 15 tours, mode difficile)
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-06-eva-global15-r5.md`
Verdict global: **red** (2 red, 4 yellow, 9 green)

## R5-B01 — Faux claim de reschedule sans commit (T7→T8)

- Tours: T7 (source), T8 (contradiction remontée)
- Famille: `BF-LEDGER-01` (secondaire `BF-EFFECT-02` — reschedule non supporté)
- Domaine owner: `sophia-brain/router` — final response guard / EffectLedger guard (path `update_existing_one_shot_reminder_time_request`)
- Source amont: le renderer `normal_reply` produit « C'est noté : 21h30 ✅ » alors que `effect_ledger.committed=0`. L'extraction est conforme au contrat (`one_shot_reminder_prompt_contract.ts` l. 40: un décalage n'émet NI create NI cancel), mais le contrat exige aussi « la reponse l'explique honnetement » (l. 40, 248) et interdit tout claim non prouvé (l. 67, 232). Le guard anti-claim n'a pas couvert ce path.
- Symptome visible: Sophia affirme le rappel décalé à 21h30; au tour suivant elle dit 22h00 — contradiction non réparée. La DB reste `pending` à `2026-07-06T20:00:00Z`.
- Preuve système: `direct_effects=[]`, `effect_ledger requested/allowed/committed = 0/0/0`; `scheduled_checkins` id `06c34b6f…` inchangé à 22:00 (vérifié en DB); `response_intent=update_existing_one_shot_reminder_time_request`.
- Correction attendue: guard de réponse finale interdisant toute formule « c'est noté/fait/programmé/décalé » quand aucun effet n'est commité, en forçant le wording honnête « modification hors chat / dans la plateforme » pour un reschedule. Optionnellement, exposer un intent `reschedule` (cancel+recreate atomique sur le pending unique) pour offrir réellement la capacité. Régression par rapport à r4 (T12 honnête).
- Statut: `open`
- Fix reference: —
- Tests requis:
  - positif: `update_reminder_time` avec `committed=0` → réponse honnête « hors chat », jamais « ✅ 21h30 ».
  - paraphrase: « décale-le », « plutôt 21h30 », « mets-le plus tôt » → même comportement.
  - anti-faux-positif: reschedule pendant une création en cours de clarification (aucun commit sur le fil) → traité comme mise à jour de la demande, create avec la nouvelle heure (l. 40 fin).
  - intégration: status au tour suivant lit la DB et ne contredit jamais un claim précédent.

## R5-B02 — Flow coaching avale une demande de rappel + faux déni de capacité (T4)

- Tours: T4
- Famille: `BF-ROUTE-02` (ancien flow capture une nouvelle intention); clarification manquée `BF-INTAKE-04`
- Domaine owner: politique d'interruption / `active_flow_arbitration` + visible agent `skills/coaching_recommendation`
- Source amont: `active_flow_arbitration=continue_active` maintient le flow coaching; la lane direct-effect n'extrait pas `create_one_shot_reminder`. L'heure était ambiguë (« ce soir ou demain soir »), ce qui justifie l'absence de create par atomicité, mais la sortie aurait dû être une clarification de l'heure, pas un déni de capacité (« je ne peux pas programmer d'alerte ici »).
- Symptome visible: Sophia nie pouvoir poser une alerte; la capacité existe (create réussi au T5 dès reformulation explicite).
- Preuve système: `route_reason=active_coaching_recommendation`, `direct_effects=[]`; note de flow `user_need_summary` reconnaît « demande une alerte ponctuelle mais le moment exploitable reste flou »; T5 crée le rappel après exit.
- Correction attendue: appliquer le contrat `one_shot_reminder` (l. 34-36, 50-55 « Ne laisse jamais la reponse locale faire disparaitre le rappel ») — un rappel demandé pendant un flow local doit être exposé à la lane globale; si l'heure est ambiguë, router vers une clarification de slot. Interdire au visible agent coaching d'affirmer une inaptitude produit globale.
- Statut: `open`
- Fix reference: —
- Tests requis:
  - positif: demande de rappel pendant flow coaching actif → direct-effect exposé (ou clarification de slot), jamais un déni.
  - paraphrase: « une alerte », « une notif », « un petit rappel » pendant flow local → même comportement.
  - anti-faux-positif: pur besoin coaching sans demande de rappel pendant flow → reste dans le flow, aucun direct-effect.
  - intégration: heure ambiguë → question de clarification, puis create au tour de résolution.

## R5-B03 — Préférence de style (emoji/ton) non maintenue runtime (T13-T15)

- Tours: T13, T14, T15
- Famille: `BF-PREF-01` (préférence non appliquée runtime)
- Domaine owner: preference runtime policy (ton/emoji) du pipeline de réponse
- Source amont: la préférence « sois cash, sans emojis souriants » (T10) est appliquée T10-T11 puis perdue dès la bascule en mode support (T13 🙁, T14 🙂, T15 🙂). La préférence est correctement **captée en mémoire** au batch → défaut d'application, pas de capture.
- Symptome visible: réapparition d'emojis souriants malgré la demande explicite, y compris en contexte neutre (T15, safety none).
- Preuve système: réponses T13-T15 contiennent des emojis; item mémoire actif « Elle préfère qu'on lui parle de façon directe, sans petits emojis souriants à chaque phrase ».
- Correction attendue: appliquer la préférence de style de façon persistante en-session à travers tous les modes (support inclus), indépendamment du basculement safety.
- Statut: `open`
- Fix reference: —
- Tests requis:
  - positif: préférence emoji posée → aucun emoji sur les tours suivants, y compris support/safety.
  - paraphrase: « arrête les emojis », « pas de smileys » → adhérence maintenue.
  - anti-faux-positif: sans préférence posée, le ton par défaut reste inchangé.

## R5-B04 — Technique forcée par mot-clé adoptée sans doute (T2)

- Tours: T2
- Famille: `a classifier` (cohérence de technique d'operation suggestion; owner probable `skills/coaching_recommendation`, sélection de levier/technique)
- Domaine owner: `skills/coaching_recommendation` (sélection de technique / visible agent)
- Source amont: la technique suit le wording user (« mot de bascule / mantra ») sans pondérer la nature de l'action. Eva décrit un réflexe automatique (« zéro décision consciente ») sur un déclencheur précis, profil d'une carte de défense / repérage (cf. persona + `14-qa-test-guidelines.md` § Operation Suggestions).
- Symptome visible: Sophia propose directement une carte d'attaque « technique mantra de force » sans signaler qu'un réflexe automatique s'attrape mieux par une carte de défense, ni proposer l'alternative.
- Preuve système: `skill_signals.coaching_recommendation` (free_action_coaching, conf 0.86); réponse T2 = carte d'attaque mantra, aucun doute exprimé.
- Correction attendue: garder un doute quand le wording force une technique potentiellement incohérente avec la nature de l'action; expliquer simplement la différence et proposer les options les plus proches (mot de bascule vs carte de défense de repérage), laisser le user choisir.
- Statut: `open`
- Fix reference: —
- Tests requis:
  - positif: réflexe automatique sur déclencheur précis + wording « mantra » → Sophia propose l'option mais signale la carte de défense comme alternative adaptée.
  - anti-faux-positif: vraie fenêtre de rupture (« je vais craquer ») + « mot de bascule » → mot de bascule sans doute superflu.

## Note (green avec warning) — Descente de band safety collante (T14)

- Tours: T14
- Famille: `BF-SAFETY-01` (variante desescalade), sévérité verte/faible, non bloquant
- Observation: la band reste `medium` avec pour evidence des phrases de récupération (« t'as raison, désolée de m'emballer », « ça va aller »). Le soft landing sur le fond est correct; à surveiller si la stickiness bloque des besoins légitimes plus longtemps que nécessaire.
- Statut: `open` (observation, pas de fix prioritaire)
