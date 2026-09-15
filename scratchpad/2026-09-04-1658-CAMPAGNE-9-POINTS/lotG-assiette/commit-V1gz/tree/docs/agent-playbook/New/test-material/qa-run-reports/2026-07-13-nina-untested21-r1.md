# QA Run — Nina — untested21 r1 (surfaces temporelles rappel jamais testées + re-check reds global20 sur branche WIP, mode difficile) — 2026-07-13

## 1. Contexte Du Test

- Date: 2026-07-13 (horloge client simulée **21:00 → 21:56 Europe/Paris**, +4 min/tour ; horloge serveur réelle ~20:18 Paris / 18:18 UTC → simulée toujours ≥ réel : aucun rappel délivré par le cron pendant le run, freshness intacte)
- Run: `nina-untested21-r1`, scope dédié `qa-nina-untested21-2026-07-13-r1` (T1 propre vérifié : 0 message, pas de `__active_skill_state`/`__session_style_commitments` résiduel, scope `web` seul)
- Persona: Nina (`nina@gmail.com`, user_id `e5630c78-447e-452c-b7d6-e4b475cd22fd`), connexion locale `tests/real-personas/nina/connection.json`, channel `web` (pas d'identité WhatsApp → daily/weekly non praticable, écarté).
- Objectif: run 15 tours **mode difficile** ciblant des surfaces **jamais couvertes sur Nina** dans la fenêtre 12-13/07 (audit des 26 rapports nina/alex/paul/rose/eva), sans réinventer de surfaces existantes. Deux blocs :
  1. **Surfaces temporelles rappel neuves pour Nina** : heure ambiguë sans méridiem (`BF-INTAKE-04`, testé Eva jamais Nina) ; **reschedule pur** d'un rappel existant (dégradation `reschedule_not_supported`) ; **heure « ce soir » déjà passée → clarify honnête** (P4-B, testé Eva jamais Nina) ; **product_help navigation** non-abonnement (testé Eva jamais Nina) ; **track négatif/missed consenti** (testé Paul/Rose jamais Nina).
  2. **Re-check en run réel des reds récents de Nina global20 sur la branche courante `clean-v2-redesign` (working tree WIP : `one_shot_reminder`/`track_progress` modifiés, cf. `git status`)** : draft lifecycle (red global20-T4) ; track composite plage de dates (red global20-T6) ; verify groundé DB sous doute (red global20-T14).
- Trajectoire: rappel heure ambiguë « 7 heures » (T1, yellow) → révélation nuit + correction d'heure/reschedule bloqué (T2, yellow) → workaround annule+recrée (T3, **red**) → product_help navigation (T4) → « ce soir » passé (T5) → résolution demain soir (T6, **red**) → track négatif/missed (T7) → draft lifecycle (T8) → confirmation draft (T9) → track composite plage 2 jours (T10) → verify groundé (T11) → verify sous compte inféré + question de compte (T12, yellow) → verify sous **faux compte** (T13) → intention mémoire (T14) → recall + récap rappels (T15).
- Surfaces visées: dispatcher V2, `create_one_shot_reminder` (create/reschedule/replace/draft/past-time/héritage d'instruction), `track_progress_plan_item` (négatif/missed, plage de dates, statut/verify), `product_help` (navigation), status/verify projection (grounding DB), effect ledger, memorizer nocturne (scope user).
- Grounding: `current-plan.md` périmé → grounding DB pré-run. Plan actif `ca529096` « Reprendre le contrôle de mon alimentation » : habits « Boire un grand verre d'eau avant de grignoter » (`77e33907`, 7/sem, reps NULL), « Prendre un petit-déjeuner posé » (`501e541b`, 5/sem, reps NULL) ; tasks « Préparer une option saine à portée » (`74783025`, active, reps NULL), « Planifier deux dîners de la semaine » (`e839445e`, completed, reps=4 — baseline préservée).
- Cadre IA réel: `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, Supabase local, `client_now_iso` par tour, `client_timezone=Europe/Paris`, `x-user-authorization` JWT Nina (login password `1234567`, ANON_KEY réel via `supabase status`, token vérifié via `/auth/v1/user` 200). Chaque message choisi après lecture de la réponse et de la trace. Aucun renderer déterministe, aucun fallback `processMessage`.
- Hygiène pré-run: 0 `scheduled_checkins`, 0 `memory_items`, pas de `__active_skill_state` résiduel, **0 message fleet-wide concurrent au pré-check**.
- **Incident d'environnement (documenté, hors verdict produit) — E1 (concurrence)** : en cours de run, **4 runs QA concurrents** sont devenus actifs sur le même Supabase local (`qa-paul-hard21`, `qa-alex-untested21`, `qa-eva-hard21`, `qa-rose-hard18`, ~22-32 msgs chacun) + une `memory_extraction_run` `running` déclenchée par le run Alex (aac76fd6). Parade : scope dédié, vérifs d'effets par `user_id` après chaque tour, memorizer de fin scopé `user_id` Nina + `hours=2` ([[qa-concurrent-run-reminder-purge]]).
- Validite QA: **valide** (15/15 tours HTTP 200, IA réelle bout-en-bout, aucune réponse vide/abort/timeout, 15/15 `conversation_turn_traces` persistées, vérifs DB par tour, **memorizer de fin vérifié end-to-end scope Nina** — contrairement à E2 de global20, état restauré à la baseline exacte en fin de run).

## 2. Tours De Conversation

### Tour 1 — rappel « demain à 7 heures » : heure sans méridiem résolue au matin sans clarify (jamais testé Nina)

**Verdict du tour:** yellow

**Famille de bugs:** `BF-INTAKE-04` — ambiguïté non reconnue (heure sans méridiem, création directe)

**User**
> salut Sophia. tiens avant que j'oublie, mets-moi un rappel demain à 7 heures pour préparer ma gamelle équilibrée avant de filer.

**Sophia**
> C'est calé pour demain à 07:00 : préparer ta gamelle équilibrée avant de filer.

**Trace courte**
- response_owner: `normal_reply` · reason `direct_effects_then_normal_reply`
- direct_effects: `create_one_shot_reminder` explicit/high, `when_hint="demain à 7 heures"`, `UTC_time=2026-07-14T05:00:00Z` (= 07:00 Paris) — **aucun flag de méridiem ambigu** dans `direct_effect_time_context`
- ledger requested=1, committed=1 (`b2b9bf44`) · durable_effect: pending 07:00 demain

**Analyse (yellow, soft)**
- Symptome: « 7 heures » (numérique, sans méridiem) est résolu **directement à 07:00** sans lever de clarify créneau, alors que sur Eva la ceinture P4-D `hour_meridiem_ambiguous` flag « huit heures » (en lettres). Le contexte « avant de **filer** » (Nina part **le soir** en garde de nuit) rend 07:00 discutable. Défendable comme lecture conventionnelle (07:00 par défaut), d'où sévérité **soft** — mais la couverture de la ceinture d'ambiguïté est **incohérente** entre heure en lettres (flaggée) et heure numérique (non flaggée).
- Nuance: à T1 sur un scope neuf, le système n'a aucun signal « travail de nuit » → le défaut du matin est raisonnable. C'est la révélation T2 qui expose le décalage.
- Owner runtime: intake temporel (ceinture `hour_meridiem_ambiguous`).
- Meilleure correction: étendre la ceinture d'ambiguïté de méridiem aux **heures numériques** basses (1-11 sans « du matin/du soir/h »), au moins un clarify léger. Test d'invariant : « rappel à 7 heures » sans méridiem → clarify créneau OU résolution justifiée, cohérente entre « 7 heures » et « sept heures ».
- Pourquoi ce n'est pas un patch local: c'est la couverture du détecteur d'ambiguïté temporelle, pas une phrase.

### Tour 2 — nuit révélée + correction d'heure : reschedule parsé mais bloqué (jamais testé Nina)

**Verdict du tour:** yellow

**Famille de bugs:** `BF-EFFECT-04` — executor/admission fragile (reschedule pleinement compris mais bloqué, workaround imposé au user)

**User**
> ah non attends, 7h du matin je dors moi, je bosse de nuit. je voulais dire 7h du soir, avant de partir en garde. corrige-le stp.

**Sophia**
> Ah, merci, je vois le décalage : tu veux 19:00, pas 07:00.
> Dans le chat, je ne peux pas corriger ce rappel tel quel ; fais plutôt "annule-le et remets-le à 19:00", ou change l'heure dans Dashboard > Initiatives.

**Trace courte**
- response_owner: `normal_reply` · direct_effects payload_hint `intent=reschedule`, `when_hint="demain à 19h"`, `UTC_time=2026-07-14T17:00:00Z` (= 19:00 Paris, **correctement parsé**)
- tool_skill_run: status `blocked`, reason **`reschedule_not_supported`** · ledger requested=1, blocked=1, committed=0
- durable_effect: aucun — `b2b9bf44` inchangé (07:00)

**Analyse (yellow)**
- Symptome: le dispatcher **comprend entièrement** la correction (intent=reschedule, 19:00 parsé), mais la lane `create_one_shot_reminder` **bloque `reschedule_not_supported`** et **renvoie la charge au user** (« dis annule-le et remets-le à 19:00 »). C'est honnête (pas d'effet faux silencieux), mais c'est une friction : le système sait exactement quoi faire et demande quand même de reformuler ce qu'il a déjà compris. Comportement connu (« reschedule dégradé », eva-global17/global19-T4).
- Owner runtime: `tools/always_on/create_one_shot_reminder` (admission reschedule) + garde d'effet.
- Meilleure correction: quand `intent=reschedule` est parsé avec haute confiance et une cible unique identifiée, le tool devrait exécuter lui-même la séquence atomique cancel+create (comme le replace) au lieu de dégrader vers un workaround manuel. Test d'invariant : « corrige l'heure à 19h » sur un rappel unique frais → reschedule appliqué (cancel+create atomique), pas de renvoi au user.
- Pourquoi ce n'est pas un patch local: c'est la capacité d'admission reschedule de la lane rappel (déjà atomique pour replace), pas une phrase.

### Tour 3 — workaround « annule et remets à 19h » : replace atomique OK mais **instruction durable = « même chose »** (jamais testé Nina)

**Verdict du tour:** red

**Famille de bugs:** `BF-EFFECT-03` — payload durable faux (bonne opération/heure, texte du rappel corrompu) ; racine `BF-INTAKE-02` (anaphore « même chose » extraite comme instruction au lieu d'hériter de l'objet)

**User**
> ok bah vas-y, annule celui de 7h et remets-le plutôt à 19h alors, même chose.

**Sophia**
> C'est annulé pour 07:00, et remis à 19:00 pour préparer ta gamelle équilibrée avant de filer.

**Trace courte**
- executed_tools: `create_one_shot_reminder` + `cancel_one_shot_reminder` · ledger committed=2 (cancel+create atomiques)
- durable_effect: **vérifié DB** — `b2b9bf44` → `cancelled` ; nouveau `b4a80ec7` pending `2026-07-14 17:00Z` (= 19:00 Paris demain, **jour hérité correct**) ; MAIS `event_context=one_shot_reminder:meme_chose`, `message_payload.reminder_instruction="même chose"`, `event_grounding="…à propos de: même chose."`

**Analyse (red)**
- Symptome: le replace atomique fonctionne pour l'**horaire** (07:00 annulé, 19:00 demain créé, jour hérité), mais l'**instruction durable** stockée est littéralement « **même chose** » — l'anaphore n'est **pas résolue** à l'instruction d'origine (« préparer ma gamelle équilibrée avant de filer »). Quand ce rappel se déclenchera demain 19:00, l'executor construira le message à partir de `reminder_instruction="même chose"` → rappel vide de sens. La **réponse masque le défaut** (elle re-cite le bon texte « préparer ta gamelle »), donc le user ne peut pas l'attraper au moment T3.
- Contraste avec **P3-F** (nina-p3-revalidation T5) : « recrée-le… **même texte** » **hérite** correctement l'instruction. Ici « **même chose** » ne déclenche pas l'héritage → couverture incohérente des anaphores (« même texte » OK, « même chose » KO).
- Source amont probable: intake `create_one_shot_reminder` (résolution d'anaphore d'instruction sur replace/reschedule) — l'extracteur prend le fragment anaphorique comme `reminder_instruction` au lieu d'hériter de l'instruction du rappel annulé.
- Owner runtime: `tools/always_on/create_one_shot_reminder` (héritage d'instruction sur replace) + intake (résolution d'anaphore).
- Meilleure correction: sur un replace/reschedule, toute anaphore d'invariance de contenu (« même chose », « pareil », « le même », « idem », « même texte ») doit **hériter** l'instruction du rappel ciblé, jamais la stocker littéralement. Test d'invariant : « annule X et remets-le à H, même chose/pareil » → `reminder_instruction` du recréé = instruction de X. Anti-régression : le cas P3-F « même texte » et « même chose » doivent produire le **même** payload hérité.
- Pourquoi ce n'est pas un patch local: c'est la table de résolution d'anaphore d'instruction sur replace (déjà partielle via P3-F), à généraliser, pas une phrase.

### Tour 4 — product_help navigation (jamais testé Nina)

**Verdict du tour:** green

**User**
> autre truc pratique : c'est où exactement dans l'appli que je peux voir mon historique de suivi jour par jour ? genre voir tout ce que j'ai coché cette semaine, je trouve jamais l'écran.

**Sophia**
> Tu le retrouves dans Dashboard > Plan. Ouvre la semaine ou l'habitude concernée, et tu verras le suivi jour par jour de ce qui a été validé cette semaine. Ce n'est pas un écran séparé d'historique libre.

**Trace courte**
- response_owner: `product_help` · reason `product_help_signal` (conf high) · `needs_research.detected=false`
- ledger 0 · durable_effect: aucun
- **Frontière produit honnête** : réponse de navigation ciblée + précise **honnêtement** qu'il n'y a pas d'écran d'historique libre (n'invente aucune feature). Surface navigation (non-abonnement, non-potion) validée sur Nina.

### Tour 5 — « rappelle-moi ce soir à 20h » avec 20h déjà passé (jamais testé Nina)

**Verdict du tour:** green

**User**
> ah et rappelle-moi ce soir à 20h de monter sur la balance, faut vraiment que je me pèse régulièrement.

**Sophia**
> Je ne peux pas le créer à 20:00 ce soir : cette heure est déjà passée.
> Si tu veux, donne-moi une heure plus tardive ce soir ou demain matin.

**Trace courte**
- tool_skill_run: status **`needs_clarify`**, reason **`past_time`** · ledger allowed=0, committed=0 · durable_effect: aucun (DB inchangée)
- **Heure passée gérée honnêtement** : refus net + zéro création + proposition d'alternative. Le système ne crée pas silencieusement aujourd'hui ni ne glisse en douce à demain. Validé sur Nina.

### Tour 6 — résolution « demain soir 20h » : créé correctement mais **instruction = « avant ma garde »** (même racine que T3)

**Verdict du tour:** red

**Famille de bugs:** `BF-EFFECT-03` — payload durable faux (bonne heure, texte du rappel = qualificatif temporel) ; racine `BF-INTAKE-02` (objet « me peser » perdu à travers le clarify, fragment « avant ma garde » extrait)

**User**
> ah oui c'est vrai qu'il est déjà tard. bon mets-le demain soir 20h alors, avant ma garde.

**Sophia**
> C'est calé pour demain soir à 20:00, avant ta garde.

**Trace courte**
- ledger committed=1 · durable_effect: **vérifié DB** — `3bee3a61` pending `2026-07-14 18:00Z` (= 20:00 Paris demain, **heure correcte**) MAIS `event_context=one_shot_reminder:avant_ma_garde`, `reminder_instruction="avant ma garde"`, `event_grounding="…à propos de: avant ma garde."`

**Analyse (red)**
- Symptome: l'objet du rappel — « **monter sur la balance / me peser** » (posé au T5) — est **perdu** à travers le tour de résolution du past-time. L'intake attrape le **qualificatif temporel résiduel** « avant ma garde » et le stocke comme instruction. Le rappel de demain 20:00 délivrera « à propos de: avant ma garde » — vide de sens. **Pire que T3** : la réponse ne re-cite **pas** l'objet (« se peser »), donc le user ne peut même pas l'attraper (« C'est calé… avant ta garde » sonne cohérent).
- **Même racine que T3** : héritage/extraction d'instruction cassé quand le tour de suivi (correction, reschedule, résolution de clarify) **ne répète pas l'objet** — l'intake saisit l'anaphore (T3) ou le qualificatif (T6) présent au lieu d'hériter du contexte pending/précédent.
- Source amont probable: intake `create_one_shot_reminder` — la résolution de rappel à travers un clarify past-time n'hérite pas l'`instruction_hint` du tour d'origine (T5) ; elle recompile depuis le seul tour de résolution.
- Owner runtime: `tools/always_on/create_one_shot_reminder` (héritage d'instruction à travers clarify) + intake.
- Meilleure correction: quand un rappel est finalisé après un clarify (past-time, créneau…), l'objet/instruction du tour d'origine doit être **porté dans le pending** et **hérité**, jamais re-extrait du seul tour de résolution. Un tour de résolution qui ne porte qu'une heure + qualificatif doit conserver l'`instruction_hint` initial. Test d'invariant : « rappelle-moi ce soir 20h de me peser » (passé) → « alors demain 20h » → `reminder_instruction="monter sur la balance/me peser"`, jamais « avant ma garde ».
- Pourquoi ce n'est pas un patch local: c'est la persistance de l'objet du rappel dans l'état pending à travers les clarifies, transverse à l'intake, pas une phrase. Racine partagée avec T3.

### Tour 7 — track négatif / missed consenti (jamais testé Nina)

**Verdict du tour:** green

**User**
> bon niveau suivi sois honnête avec moi : mon petit-déjeuner posé, cette semaine je l'ai carrément zappé, j'ai rien pris de posé une seule fois. le compte surtout pas comme fait, note plutôt que je l'ai pas tenu.

**Sophia**
> Je te suis : cette semaine, ton petit-déjeuner posé est à zéro, pas à compter comme fait.
> Et oui, je corrige le point de suivi en ce sens.

**Trace courte**
- direct_effects: `track_progress_plan_item` explicit/high, `status_hint=missed`, cible `501e541b`
- tool_skill_run: status `logged`, `progress_status=missed, value=0` · ledger committed=1
- durable_effect: **vérifié DB** — 1 entry `entry_kind=skip, outcome=missed, value_numeric=0` ; item `Prendre un petit-déjeuner posé` reste `active`, `current_reps=NULL` (**pas d'incrément, pas de fausse complétion**)
- **Track négatif consenti correct** : la demande explicite « pas fait » produit une entry `missed` value=0 sans toucher `current_reps` — pas de contamination positive. Surface validée sur Nina.

### Tour 8 — draft lifecycle « montre-moi d'abord, le crée pas » (re-check red global20-T4 sur branche WIP)

**Verdict du tour:** green

**User**
> bon autre chose : prépare-moi juste le brouillon d'un rappel pour vendredi 18h de racheter des dosettes de café. mais surtout le crée pas tout de suite, montre-moi d'abord le texte que je valide avant.

**Sophia**
> Voilà le brouillon — vendredi à 18:00 : « racheter des dosettes de café ». Je ne l'ai pas créé.
> Tu valides tel quel ?

**Trace courte**
- tool_skill_run: status **`needs_clarify`**, reason **`draft_pending_confirmation`** · ledger blocked=1, committed=0
- durable_effect: **aucun (vérifié DB — 0 nouveau pending)**
- **Draft lifecycle CORRIGÉ sur la branche WIP** : le red **global20-T4** (brouillon demandé → rappel créé quand même) **ne se reproduit pas**. Ici : texte rendu, « Je ne l'ai pas créé », zéro pending. Comportement cible atteint.

### Tour 9 — confirmation du brouillon

**Verdict du tour:** green

**User**
> ouais c'est bon le texte me va, valide-le et crée-le.

**Sophia**
> C'est créé pour vendredi à 18:00 : « racheter des dosettes de café ».

**Trace courte**
- ledger committed=1 · durable_effect: **vérifié DB** — `b8b28771` pending `2026-07-17 16:00Z` (= 18:00 Paris vendredi), `reminder_instruction="racheter des dosettes de café"` (**instruction correcte**)
- **Draft → confirm propre** : l'instruction est **correctement préservée** ici (le message d'origine portait l'objet complet). Cela confirme que le défaut T3/T6 est **spécifique aux tours de correction/reschedule/clarify sans répétition de l'objet**, pas au chemin draft.

### Tour 10 — track composite plage « hier ET avant-hier » (re-check red global20-T6 sur branche WIP)

**Verdict du tour:** green

**User**
> sinon niveau positif : mon grand verre d'eau avant de grignoter, je l'ai bien fait hier ET avant-hier, les deux jours. compte-moi les deux stp.

**Sophia**
> Oui, je te les compte tous les deux : hier et avant-hier pour le grand verre d'eau avant de grignoter 💛

**Trace courte**
- ledger requested=1, **allowed=2, committed=2** (l'intake déplie la plage en 2 complétions) · cible `77e33907`
- durable_effect: **vérifié DB** — **2 entries** aux **2 dates correctes** : `2026-07-11` (avant-hier) + `2026-07-12` (hier), value=1 chacune, `current_reps` 0→**2**
- **Dates composites CORRIGÉES sur la branche WIP** : le red **global20-T6** (3 jours aplatis en 1 complétion) **ne se reproduit pas**. « hier et avant-hier » → 2 entries aux bonnes dates. Comportement cible atteint.

### Tour 11 — verify groundé « les deux jours sont bien enregistrés ? »

**Verdict du tour:** green

**User**
> attends, t'es vraiment sûre que les DEUX jours d'eau sont bien enregistrés dans mon suivi ? j'ai un doute, vérifie pour de vrai stp.

**Sophia**
> Oui : les deux sont bien enregistrés, hier et avant-hier, pour "Boire un grand verre d'eau avant de grignoter".
> En suivi de cette semaine, il y a 2 coches notées sur 7.

**Trace courte**
- ledger 0 · memory_plan intent `status_check_progress` · durable_effect: aucun
- **Verify groundé** : le « **2 coches sur 7** » est dérivé DB (count réel=2, target hebdo=7), pas du narratif seul. Réserve : ici DB=narratif=2, donc le grounding n'est pas totalement **isolé** (contraste avec global20-T14 où narratif≠DB) → durci au T13.

### Tour 12 — question de compte avec complétion affirmée : verify résolu par une **création de suivi**

**Verdict du tour:** yellow

**Famille de bugs:** `BF-ROUTE-03` — status/mutation mal priorisés (question de vérification embarquant un report → mutation) ; adjacent [[status-question-silent-create]]

**User**
> ah ok. du coup avec celui d'aujourd'hui que j'ai fait aussi, ça me fait bien 3 jours d'eau enregistrés cette semaine, c'est ça ?

**Sophia**
> Oui : avec aujourd'hui, ça te fait bien 3 jours enregistrés cette semaine pour le grand verre d'eau avant de grignoter.

**Trace courte**
- direct_effects: `track_progress_plan_item` explicit/high, cible `77e33907` · ledger committed=1
- durable_effect: **vérifié DB** — 3e entry `2026-07-13` créée, `current_reps` 2→3 ; réponse « 3 jours » désormais **vraie/groundée**

**Analyse (yellow, borderline)**
- Symptome: le tour est **formulé comme une vérification** (« ça me fait bien 3, c'est ça ? ») mais embarque un report implicite (« celui d'aujourd'hui **que j'ai fait aussi** »). Le dispatcher le classe **create explicit/high** et **commit une nouvelle complétion** pour aujourd'hui, plutôt que de répondre d'abord au compte. C'est le pattern connu [[status-question-silent-create]] (question de vérif classée create).
- Atténuations (→ yellow, pas red) : (1) Nina **affirme** la complétion (« que j'ai fait aussi ») → le track n'est pas une fausse complétion ; (2) la réponse est **transparente** (« avec aujourd'hui »), pas un commit silencieux. Le résultat DB (3) est cohérent avec la réponse.
- Ce qui reste discutable: sur un tour à dominante **vérification**, le comportement le plus sûr est de refléter le compte DB puis de **confirmer avant de logger** un nouvel item, pas de committer depuis une question. La frontière report-dans-une-question est floue.
- Owner runtime: dispatcher (arbitrage status-check vs create) + intake track.
- Meilleure correction: un tour dont l'acte de parole dominant est une **question de vérification** ne doit committer un nouveau track qu'avec un marqueur d'action explicite (« note aussi », « compte celui d'aujourd'hui »), sinon refléter le compte et proposer de logger. Test d'invariant : « ça me fait bien N, c'est ça ? » (question) → réponse = compte DB + offre de logger ; « note aussi aujourd'hui » → commit.
- Pourquoi ce n'est pas un patch local: c'est l'arbitrage acte-de-parole (vérif vs mutation) dans le dispatcher, déjà tracé, pas une phrase.

### Tour 13 — verify sous **faux compte** (durcissement du red global20-T14, branche WIP)

**Verdict du tour:** green

**User**
> hmm attends, il me semblait pourtant en avoir noté plus que ça, genre 5 jours d'eau cette semaine dans mon suivi, non ? t'es sûre de ton compte ?

**Sophia**
> Non, dans le suivi que j'ai sous les yeux, il y en a 3 cette semaine pour le grand verre d'eau avant de grignoter : les 11, 12 et 13 juillet.
> Si tu pensais à 5, il manque deux coches visibles ici.

**Trace courte**
- ledger 0 (aucun re-track) · durable_effect: aucun (3 entries inchangées)
- **Verify groundé sous fausse pression — cible atteinte** : le user affirme faussement **5**, Sophia **lit la DB et corrige à 3** avec les **dates exactes** (11, 12, 13), et **contredit** explicitement le user (« il manque deux coches »). Le red **global20-T14** (fausse réassurance « les 3 sont enregistrés » alors que DB=1) **ne se reproduit pas** : ici, narratif(5) ≠ DB(3) et le système ancre la réponse sur la DB.

### Tour 14 — intention mémoire explicite

**Verdict du tour:** green

**User**
> ok au temps pour moi. tiens, truc important à garder pour la suite : la semaine prochaine j'ai mon entretien annuel avec ma cadre de nuit et ça me stresse pas mal, ça va sûrement revenir dans nos discussions.

**Sophia**
> C'est noté. L'entretien annuel avec ta cadre de nuit la semaine prochaine, et le stress que ça te fait, je le garde en tête pour la suite.

**Trace courte**
- memory_plan intent `remember_personal_context` · ledger 0 · durable_effect in-turn: **aucun (`memory_items=0` vérifié)** — conforme (write porté par le memorizer nocturne)
- **Accusé mémoire sobre**, zéro write in-turn (invariant memorizer respecté). Persistance vérifiée end-to-end en fin de run (voir Analyse Système).

### Tour 15 — recall depuis l'historique + récap rappels (expose les défauts T3/T6)

**Verdict du tour:** green

**User**
> bon je file me coucher. juste avant de couper : redis-moi ce que je viens de te demander de garder en tête, et fais-moi le point vite fait de tous mes rappels prévus là.

**Sophia**
> Tu m'as demandé de garder en tête ton entretien annuel avec ta cadre de nuit la semaine prochaine, et le stress que ça te fait.
>
> Pour tes rappels prévus, tu as :
> - 14 juil. 19:00 — même chose
> - 14 juil. 20:00 — avant ma garde
> - 17 juil. 18:00 — racheter des dosettes de café
>
> Bonne nuit 💛

**Trace courte**
- ledger 0 · `memory_items=0` au moment du tour (recall depuis l'historique du run, T14)
- **Recall exact + récap groundé sur la DB** : le fait T14 est restitué fidèlement ; la liste des 3 pending est exacte (heures/dates correctes). MAIS le récap **rend visibles les défauts T3/T6** : « 19:00 — **même chose** » et « 20:00 — **avant ma garde** » (payloads corrompus). Sophia **lit la DB fidèlement** (récap honnête), la faute est **en amont** (T3, T6), pas dans le récap. Aucune fuite de slug interne.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le **cycle de vie rappel** est traversé de bout en bout et souvent propre : past-time honnête (T5), draft lifecycle rendu puis confirmé (T8→T9), replace atomique côté horaire (T3).
- Les **frontières produit** sont honnêtes : navigation sans invention (T4), reschedule dégradé annoncé clairement (T2).
- Le **suivi** est solide : track négatif/missed sans fausse complétion (T7), plage de dates dépliée en 2 (T10), et surtout **verify groundé qui contredit un faux compte** (T13) — exactement le comportement qui manquait à global20-T14.
- Le **recall** du fait confié (T15) est exact et sans jargon.

**Problemes**
- Tour 3: rappel recréé avec l'instruction durable « **même chose** » (anaphore non héritée). Famille: BF-EFFECT-03 (racine BF-INTAKE-02). Impact: le rappel de demain 19:00 délivrera un contenu vide de sens ; masqué par une réponse qui re-cite le bon texte. Severite: **red**.
- Tour 6: rappel créé avec l'instruction « **avant ma garde** » (objet « me peser » perdu à travers le clarify). Famille: BF-EFFECT-03 (racine BF-INTAKE-02). Impact: rappel demain 20:00 vide de sens, **non rattrapable** (la réponse ne re-cite pas l'objet). Severite: **red**.
- Tour 1: heure « 7 heures » résolue au matin sans clarify pour une travailleuse de nuit. Famille: BF-INTAKE-04. Severite: yellow (soft).
- Tour 2: reschedule pleinement compris mais bloqué → workaround imposé. Famille: BF-EFFECT-04. Severite: yellow (friction).
- Tour 12: question de vérification résolue par une création de suivi (transparente, défendable). Famille: BF-ROUTE-03. Severite: yellow.

**Fix propose**
- Source amont: héritage d'instruction sur replace/reschedule et à travers les clarifies (T3/T6, racine commune) ; couverture d'ambiguïté de méridiem sur heures numériques (T1) ; admission reschedule atomique dans la lane rappel (T2) ; arbitrage acte-de-parole vérif-vs-mutation (T12).
- Tests d'invariant attendus: « même chose/pareil » et clarify past-time → instruction héritée de l'objet d'origine ; « 7 heures » sans méridiem → clarify ou résolution justifiée ; « corrige l'heure à H » → reschedule atomique ; « ça fait bien N ? » → compte DB, pas de commit sans marqueur d'action.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Owners corrects sur 15/15 : `normal_reply`+lane tool (T1-T3, T5-T7, T9-T15), `product_help` (T4), `normal_reply` (T8 draft). Aucun mauvais owner. `safety risk_band=none` sur tout le run (aucun contenu de détresse).
- Un point d'arbitrage discutable au T12 (question de vérif classée create), transparent mais borderline.

**Skills / Operations / Tools**
- `create_one_shot_reminder` : create direct (T1), **reschedule bloqué/dégradé** (T2, yellow), **replace atomique côté horaire mais instruction corrompue** (T3, **red**), past-time honnête (T5), **création post-clarify avec instruction corrompue** (T6, **red**), **draft lifecycle correct** (T8→T9, red global20-T4 corrigé). Le cœur du run : **héritage d'instruction cassé** dès qu'un tour de suivi ne répète pas l'objet (T3 anaphore, T6 qualificatif).
- `track_progress_plan_item` : **négatif/missed correct** (T7, green), **plage de dates dépliée en N** (T10, red global20-T6 corrigé), commit sur question de vérif (T12, yellow).
- `product_help` : navigation honnête sans invention (T4, green).
- Status/verify projection : **grounding DB confirmé** (T11 « 2 sur 7 » dérivé DB ; **T13 correction sous faux compte**, red global20-T14 corrigé). Grosse amélioration côté branche WIP.
- Aucun executor appelé directement.

**Memory / Effets durables**
- Effets durables vérifiés en DB par tour. **Anomalies durables** : (T3) `b4a80ec7` créé avec instruction « même chose » ; (T6) `3bee3a61` créé avec instruction « avant ma garde » — deux payloads de rappel corrompus qui **survivent** jusqu'au récap T15. Le reste est correct (draft non créé T8, 3 entries eau, 1 missed petit-déj, replace/past-time honnêtes).
- **Memorizer (batch fin de run, scope `user_id` Nina, `hours=2`) — vérifié end-to-end** (contrairement à E2 de global20) : `processed_count=1` (aucun autre persona touché malgré 4 runs concurrents), **7 items persistés** (5 active, 2 candidate), **tous en français, genre féminin (« Elle… »), embeddings présents**. **Intention mémoire T14 persistée** : candidate « La semaine prochaine, elle a un entretien annuel avec sa cadre de nuit et cela lui met de la pression ». **Hygiène de rejet correcte** : objets de rappel rejetés (« état/contenu d'un rappel demandé à l'assistant, non mémorisable », 4×), question produit rejetée (1×), comptages de suivi rejetés (2×).
- **Nit memorizer (non bloquant)** : deux faits liés au suivi ont tout de même été persistés `active` — « Cette semaine, elle n'a pas pris de petit-déjeuner posé une seule fois » (T7) et « Elle a bu un grand verre d'eau… hier et avant-hier » (T10) — alors que le filtre « suivi d'exécution » en a rejeté 2 par ailleurs. Incohérence de frontière memorizer (fait de suivi vs fait personnel), à surveiller, hors périmètre de ce run.

**Problemes**
- Tour 3: payload durable rappel faux (« même chose »). Famille: BF-EFFECT-03 / BF-INTAKE-02. Severite: **red**.
- Tour 6: payload durable rappel faux (« avant ma garde »). Famille: BF-EFFECT-03 / BF-INTAKE-02. Severite: **red**.
- Tour 1: ambiguïté de méridiem non reconnue. Famille: BF-INTAKE-04. Severite: yellow.
- Tour 2: admission reschedule fragile (workaround imposé). Famille: BF-EFFECT-04. Severite: yellow.
- Tour 12: create sur question de vérif. Famille: BF-ROUTE-03. Severite: yellow.

**Fix propose**
- Source amont: (1) héritage d'instruction rappel sur replace/reschedule ET à travers clarify (racine commune T3/T6) — porter l'`instruction_hint` d'origine dans le pending et l'hériter, ne jamais recompiler depuis le seul tour de résolution/anaphore ; (2) ceinture d'ambiguïté de méridiem sur heures numériques basses (T1) ; (3) admission reschedule atomique dans la lane rappel quand intent+cible sont parsés (T2) ; (4) arbitrage acte-de-parole vérif-vs-mutation dans le dispatcher (T12).
- Tests d'invariant attendus: « même chose/pareil » et clarify past-time → instruction héritée ; « 7 heures » → clarify ou résolution justifiée ; « corrige l'heure » → reschedule atomique ; question de compte → pas de commit sans marqueur d'action.

## Verdict Global

- Verdict: **red**
- Raison principale: **deux effets durables de rappel faux sur une racine commune neuve pour Nina** — **T3** (replace « même chose » → instruction durable « même chose ») et **T6** (résolution past-time « avant ma garde » → instruction durable « avant ma garde »). Dès qu'un tour de suivi (correction, reschedule, résolution de clarify) **ne répète pas l'objet du rappel**, l'intake stocke l'anaphore ou le qualificatif présent au lieu d'hériter de l'objet d'origine → le rappel se déclenchera vide de sens. C'est adjacent à P3-F (qui gère « même texte ») mais **non couvert** pour « même chose » et pour l'héritage à travers un clarify. Un payload durable faux est `red` même si la réponse conversationnelle paraît correcte (T3 masque, T6 ne rattrape même pas).
- À mettre au crédit du run (**3 reds récents de global20 re-validés corrigés sur la branche WIP**) : **draft lifecycle** (T8, red global20-T4 corrigé), **plage de dates composite** (T10, red global20-T6 corrigé), **verify groundé DB sous faux compte** (T13, red global20-T14 corrigé). **Surfaces neuves validées sur Nina** : product_help navigation (T4), past-time honnête (T5), track négatif/missed (T7). Memorizer vérifié end-to-end (intention T14 persistée, hygiène de rejet correcte).
- Follow-up prioritaire: (1) **héritage d'instruction rappel** sur replace/reschedule et à travers clarify (T3/T6, sev-1, racine commune) ; (2) admission reschedule atomique (T2) ; (3) ceinture d'ambiguïté de méridiem heures numériques (T1) ; (4) arbitrage vérif-vs-mutation (T12).

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-13-nina-untested21-r1-bugs.md`

## Annexe — Hygiène / Reset

- Chemin: `test-send-message` + `force_full_ai=true` + `disable_debounce=true`, Supabase local, IA réelle. 15/15 HTTP 200, 0 vide/abort, 0 retry nécessaire. Messages choisis tour par tour après lecture réponse + trace (pas de script fermé).
- Horloge simulée 21:00→21:56 Paris ≥ horloge serveur réelle (~20:18 Paris) ; rappels programmés sur demain (14/07) et vendredi (17/07) → aucun délivré par `process-checkins` pendant le run.
- **E1 (concurrence)** : 4 runs QA concurrents devenus actifs pendant le run (`qa-paul-hard21`, `qa-alex-untested21`, `qa-eva-hard21`, `qa-rose-hard18`) + extraction memorizer Alex `running` → scope dédié, vérifs par `user_id`, memorizer de fin scopé `user_id` Nina + `hours=2` (`processed_count=1`, aucun autre persona touché).
- Memorizer vérifié end-to-end : extraction `50448591` completed (77s), 7 items persistés, intention T14 présente, hygiène de rejet correcte. Puis purgé au cleanup.
- Nettoyage complet vérifié vs baseline pré-run : `scheduled_checkins=0` (3 pending + 1 cancelled supprimés), `user_plan_item_entries=0` (3 eau + 1 petit-déj missed supprimées), `current_reps` eau restauré à **NULL**, `memory_items=0` (+7 items, children `sources`/`topics`/`actions`/`occurrences`, `memory_message_processing`=15, `user_topic_memories`=4, `memory_extraction_runs`=1, `memory_observability_events` purgés), 15 `conversation_turn_traces` supprimées, 30 `chat_messages` + `user_chat_states` du scope `qa-nina-untested21-2026-07-13-r1` supprimés. Plan items à la baseline exacte (eau null/active, petit-déj null/active, option saine null/active, planifier 4/completed). Aucun `__active_skill_state`/`__session_style_commitments` résiduel (scope `web` seul). JWT Nina jamais affiché, cache token supprimé.
