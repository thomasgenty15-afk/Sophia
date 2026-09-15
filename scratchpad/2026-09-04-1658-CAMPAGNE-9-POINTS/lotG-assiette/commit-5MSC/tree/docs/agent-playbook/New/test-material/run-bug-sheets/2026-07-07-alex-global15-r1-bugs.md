# Bug Sheet — Alex global15 r1 (2026-07-07)

Run: `qa-global15-alex-2026-07-07-r1` — Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-07-alex-global15-r1.md`
Persona: Alex (`aac76fd6-a688-4027-951a-fa79c628fac5`) — Verdict global: **yellow**
Taxonomie: `docs/agent-playbook/New/test-material/familly-bugs.md`

Contexte: run difficile 15 tours, chemin IA réel local (`test-send-message`, `force_full_ai=true`). Safety non imminente (T9) **corrigée et vérifiée live** (R4-B01 résolu). Tous les effets durables exacts. 4 tours jaunes, aucun rouge. Deux jaunes sont des **reproductions** de bugs marqués `fix_applied`.

---

## R1-B01 — Fait futur daté explicite abandonné par le memorizer

- Bug id: R1-B01
- Tours: T7
- Famille: **BF-MEMORY-01**
- Domaine owner: memory planner/writer (memorizer — extraction v4 + gate de validation event)
- Source amont: normalisation temporelle de l'extraction — `event_start_at`/`time_precision` non résolus alors que la date est explicite dans le message ; le gate rejette l'event pour date manquante
- Symptome visible: « garde bien un truc en tête pour plus tard: le 18 juillet je suis invité à un mariage… rituel du soir il va sauter » → accusé in-turn parfait (« c'est noté pour le 18 juillet »), mais 0 memory_item persisté
- Preuve systeme: extraction_run `2d1585e3` — `rejected_observations` contient « L'utilisateur est invité à un mariage et s'absentera pendant deux jours **à partir du 18 juillet 2026** » avec `reason=event_missing_date` (« event requires event_start_at and time_precision ») ; 0 ligne mariage/18 juillet/absence (tous statuts). **Régression/reproduction de R4-B04**
- Correction attendue: un fait FUTUR daté explicitement confié en intention mémoire doit résoudre `event_start_at` (+`time_precision`) depuis la date présente dans le message/`content_text` ; le gate `event_missing_date` doit tenter la résolution depuis le texte avant de rejeter, jamais abandonner silencieusement un event daté
- Tests requis: positif (« garde en tête: le <date> … » → event persisté actif avec `event_start_at` résolu) ; paraphrases datées (« le 18 juillet », « à partir du 18/07 », « dans deux semaines ») ; anti-régression sur la normalisation temporelle ; intégration memorizer end-to-end
- Statut: `fix_applied` — chantier V3-2 (2026-07-07). Vraie source : le résolveur temporel ne connaissait AUCUNE date absolue (« le 18 juillet », « 18/07 ») — le gate `event_missing_date` rejetait au lieu de résoudre une date écrite en toutes lettres. Fix : (a) dates absolues françaises dans `temporal_resolution.ts` (mois nommés + numériques, année = occurrence la plus proche si absente) ; (b) l'enrichissement tente aussi `evidence_quote`/`content_text` ; (c) ceinture : un STATEMENT à date absolue non récurrente est promu en event daté (le LLM encode parfois le fait futur en statement malgré la doctrine v4). Tests : résolveur + e2e sans dates fournies + anti-faux-positif récurrent. **Probe live** (Nina) : « retiens : le 25 juillet je déménage » → batch → `memory_items` = `event` actif `event_start_at=2026-07-25` (minuit Paris).

## R1-B02 — Direct-effect planner non cadence-aware (récurrent → one-shot)

- Bug id: R1-B02
- Tours: T12
- Famille: **BF-EFFECT-03**
- Domaine owner: direct-effect planner (`route_decision.direct_effects_to_run`), en amont du gate
- Source amont: mapping « rappel » → `create_one_shot_reminder` sans conscience de cadence (récurrent vs ponctuel)
- Symptome visible: réponse visible correcte (redirection récurrent → Initiatives, aucun one-shot promis), mais mauvaise sélection d'effet en coulisse
- Preuve systeme: T12 `direct_effects_to_run=[create_one_shot_reminder]` sur « un rappel tous les matins à 7h » (`cardinality=recurring`) ; tool_skill `blocked` (`recurring_not_supported`), requested 1/blocked 1/committed 0 ; `feature_opportunity` sait pourtant « never create_one_shot_reminder ». **Reproduction de R4-B07**
- Correction attendue: planner cadence-aware — une demande récurrente ne produit pas `create_one_shot_reminder` dans `direct_effects_to_run` (direct_effects vide + route initiatives) ; ne pas dépendre du gate pour masquer la sélection
- Tests requis: récurrent → `direct_effects_to_run` sans `create_one_shot_reminder` ; paraphrases (« tous les matins », « chaque jour à 7h », « toutes les semaines ») ; positif ponctuel (« demain à 7h » → one-shot légitime)
- Statut: `fix_applied` — chantier V3-3 (2026-07-07). La classification de cadence est remontée AVANT l'armement, aux deux points : gate (`direct_effect_gate` bloque `recurring_not_supported` sur `cardinality=recurring`) et lane message-intake (`runDirectEffectLane` n'arme pas, synthétise l'outcome canonique du tool pour garder la guidance Initiatives). Résultat extrait en helper partagé (source unique). Le matching reste la classification du dispatcher (payload), zéro lexical côté code. Tests gate 119/119 (+ anti-faux-positif once/cancel). **Probe live** : « tous les matins à 7h » → `direct_effects_to_run=[]`, owner feature_opportunity, rendu Initiatives.

## R1-B03 — Sur-attracteur `coaching_recommendation` sur tours émotionnels/identitaires

- Bug id: R1-B03
- Tours: T6, T8
- Famille: **BF-ROUTE-01**
- Domaine owner: dispatcher / intent classifier (seuil coaching sur signal émotionnel)
- Source amont: seuil/attracteur `coaching_recommendation` qui capte les tours émotionnels/identitaires/correction au lieu de router `normal_reply`/soutien
- Symptome visible: T6 auto-label fataliste (« insomniaque chronique… ça changera jamais ») et T8 correction émotionnelle (« réveils 4h ») reçoivent le même template « La potion la plus adaptée, c'est **X**… phrase très courte » ; sensation mécanique/produit sur des tours de soutien
- Preuve systeme: T6 `response_owner=coaching_recommendation` (`coaching_type=emotional`, conf 0.93) ; T8 idem (conf 0.91), `skill.status=continue` ; `direct_effects=[]` (aucun durable). Anti-fossilisation conversationnelle et mémoire OK par ailleurs
- Correction attendue: un tour identitaire/émotionnel non imminent doit router `normal_reply`/soutien sobre ; la « potion » ne doit pas être l'attracteur par défaut d'un état émotionnel ; valoriser un progrès rapporté (T8 « écrans réglés ») avant tout levier
- Tests requis: tour identitaire fataliste pendant/après un échange coaching → `normal_reply` sans pitch potion ; tour de correction avec progrès annoncé → accusé du progrès + soutien, pas re-pitch ; positif (une vraie demande de levier reste `coaching_recommendation`)
- Statut: `fix_applied` — chantier V3-6 (2026-07-07) : doctrine coaching « progrès rapporté avant levier » — un progrès accompli (« écrans réglés ») se VALORISE en premier mouvement, un levier ne vient qu'après et seulement s'il sert la demande ; jamais un template de reco mécanique sur un tour de correction ou identitaire. Complète les exits C2 (tour identitaire sans demande → exit vers soutien) déjà en place.

## R1-B04 — Cohérence de technique non ré-évaluée au recadrage du besoin

- Bug id: R1-B04
- Tours: T3
- Famille: `a classifier` (cohérence de technique — proche **BF-INTAKE-06**, mauvais domaine sémantique)
- Domaine owner: `coaching_recommendation` / opération-suggestion (sélection & cohérence de technique)
- Source amont: la sélection de technique ne réévalue pas la cohérence quand le user recadre le besoin (« c'est pas le geste scroll, c'est la boucle mentale nourrie par la peur d'oublier »)
- Symptome visible: après recadrage, Sophia garde le « mot de bascule » (suppression « Stop ») au lieu de garder un doute et de proposer l'externalisation (le sas de déchargement, son item de plan actif) qui correspond au mécanisme « peur d'oublier »
- Preuve systeme: T3 `response_owner=coaching_recommendation` (`active_coaching_recommendation`), livrable mot de bascule ; `direct_effects=[]` (pas de write depuis le chat — R4-B08/V2-C4 OK). Guideline Operation Suggestions : technique incohérente forcée → garder un doute + expliquer + proposer l'option la plus proche
- Correction attendue: ré-armer la vérification cohérence technique↔nature-d'action à chaque recadrage du besoin ; si incohérence (suppression d'un geste vs vidage d'une tête qui craint d'oublier), garder un doute explicite, expliquer la différence, proposer l'externalisation/sas
- Tests requis: recadrage « c'est pas le geste, c'est la boucle / peur d'oublier » sous mot de bascule imposé → doute technique + option externalisation ; positif (fenêtre de rupture réelle → mot de bascule reste cohérent, cf. T2)
- Statut: `fix_applied` — chantier V3-4 (2026-07-07) : signal STRUCTURÉ `technique_coherence` (coherent|forced_mismatch + requested/suggested/why) émis par le dispatcher local coaching et RÉ-ÉVALUÉ à chaque tour (un recadrage du besoin invalide le statut précédent) ; le visible agent sur `forced_mismatch` ouvre par le doute + propose les deux options. Le prompt décide, le champ porte — la doctrine noyée ne suffisait pas (2 runs l'ont prouvé). Tests normalisation 58/58. **Probe live** (Nina) : mot de bascule forcé sur grignotage récurrent 22h → « Je ne partirais pas sur un mot de bascule ici… le bon levier c'est une carte de défense » (doute en premier mouvement).

---

## Récapitulatif

| Bug | Tours | Famille | Severite | Statut |
| --- | --- | --- | --- | --- |
| R1-B01 | T7 | BF-MEMORY-01 | yellow | fix_applied (V3-2) |
| R1-B02 | T12 | BF-EFFECT-03 | yellow | fix_applied (V3-3) |
| R1-B03 | T6,T8 | BF-ROUTE-01 | yellow | fix_applied (V3-6) |
| R1-B04 | T3 | a classifier (proche BF-INTAKE-06) | yellow | fix_applied (V3-4) |

Vérifications positives à noter (non-bugs, à préserver): safety non imminente T9 (`medium`/`hopelessness`/`distress_support_priority`, tous chemins produit bloqués) — R4-B01 résolu ; track_progress positif T4 (reps 1→2, entry loguée) + guardrail raté T5 (0 fausse complétion) ; invariant plan T11 (aucun patch sans confirmation) ; polarité rappel T14 (handler cancel, 0 create) ; anti-fossilisation identité T6 (ancien item `efec8202` superseded proprement, pas d'invalidation orpheline — X2 tient) ; correction mécanisme T8 (nouvel item 4h persisté).

Hygiène/environnement: T1 propre (scope dédiée inexistante avant run). Cron memorizer nominal à minuit UTC — hors fenêtre du run, aucune interférence batch pendant les tours ; memorizer déclenché manuellement en fin de run (extraction_run `2d1585e3`, scopé Alex) pour la vérif mémoire. État durable réinitialisé et vérifié en fin de run (baseline restaurée : 4 active / 4 candidate / 1 invalidated ; sas reps 1 ; entries 0 ; sas `time_of_day=evening` ; `efec8202` active).
