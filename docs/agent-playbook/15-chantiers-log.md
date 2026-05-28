# Chantiers Log

Append-only. Ce document tient le journal des **chantiers** déclenchés par les
runs QA. Un chantier = une intervention chirurgicale sur le code (un ou
plusieurs fichiers) qui répond à un bug ou une famille de bugs observée dans
un rapport de run.

Ce document est différent de :

- `07-decision-log.md` — décisions produit/architecture durables qui survivent
  au contexte d'une conversation.
- `13-architecture-skills` — doctrine architecturale stable (principes, couches
  L1-L6, règles par couche, contrats des Tool/Conversation Skills).
- `01-qa-run-report-structure.md` — structure attendue des rapports de run.

Pourquoi un journal séparé. Le doc architecture devait rester court, lisible et
doctrinal. Les chantiers grossissent au fil des runs et noyaient les principes
dans des détails de fix. On les sort ici, le doc architecture pointe vers eux
quand un exemple est utile.

## Convention d'entrée

Chaque chantier doit citer :

- le ou les runs déclencheurs (`A4-r6 T7`, `A2-codex-r6 T9`, …) ;
- la **couche du pipeline** touchée (L1 / L3 / L4 / L5 / L6, voir
  `13-architecture-skills`) ;
- la **décision** prise (1 paragraphe) ;
- les **fichiers** modifiés ;
- les **tests** ajoutés (toujours au moins un test de régression cité par tour) ;
- les **limites connues** et le hors-scope.

Si une garde transitionnelle est ajoutée à L3 ou L4, elle DOIT inclure un
**critère de suppression** (quel run QA + quels signaux permettent de l'enlever).

---

## Decision Log technique — 2026-05-28 (chantier 0)

Contexte. 4 runs QA (A2-r4, A3-r5, A4-r4, A6-r2) ressortent rouges malgré
l'ajout de `router/turn_intent_arbitrator.ts` par codex. Triage des 28 tours
rouges/jaunes consolidé.

Décisions prises.

1. Suppression des détecteurs `detectsHumanRecap` et `detectsHybridDurableRecap`
   dans `router/turn_intent_arbitrator.ts`. Raison : ils matchaient les mots
   `piege`/`honte`/`fragile` nus et écrasaient des décisions correctes du
   dispatcher (cas confirmé : A6-r2 T2). Impact : suppression de la régression
   visible ; aucune perte de fonctionnalité (composers `status_only` et
   `normal_reply` gèrent ces cas en aval).

2. Marquage des autres détecteurs (`detectsExplicitOneShotReminderCreate`,
   `detectsActiveToolCancellation`, `detectsDurableCoachPreference`,
   `detectsExplicitProductHelp`, `detectsExactDurableStatus`) comme
   **TRANSITIONNELS** dans le code, avec interdiction documentée d'en ajouter.
   Raison : ils violent le principe central mais leur retrait sec ferait
   régresser des tours actuellement verts. Ils doivent être remplacés par des
   few-shots dans le prompt du dispatcher au fur et à mesure.

3. Ajout d'une garde anti-faux-positif `looksLikeExplicitAttackCardRequest`
   dans `turn_intent_arbitrator.ts`. Tant qu'un détecteur transitionnel existe,
   cette garde court-circuite l'arbitre quand le user écrit une demande
   d'attack card structurée (verbe + « carte d'attaque » + marqueurs
   `Action:`/`Piège:`/`Signal:`/`Phrase:`). Défense en profondeur contre les
   régressions du type A6-r2 T2.

4. Correction du bug payload dans `rewriteForOneShotReminder` : `payload_hint`
   passe de `{}` à `{ raw_text: userMessage }`. Le runtime aval
   (`maybeCreateOneShotReminder`) a besoin du texte source pour extraire
   `scheduled_for` et l'instruction. Sans `raw_text`, le rappel n'est jamais
   créé alors que la route signale `central_arbitrator_one_shot_reminder_priority`
   (cas confirmé : A4-r4 T8/T9).

5. Tests de régression dans `router/turn_intent_arbitrator.test.ts` :
   `attack card request that contains 'piège'`,
   `attack card request that contains 'honte'`,
   `propagates raw_text in one_shot_reminder payload_hint`.

---

## Chantier 1 — Composer status_only : garde de format conversationnel (2026-05-28)

Couche. L5 (composer).

Contexte. ~6 tours rouges (A2-r4 T13/T14, A4-r4 T2/T14, A6-r2 T15) où le user
impose un format conversationnel explicite mais Sophia rend le panneau status
canonique à 4 lignes (`Carte d'attaque / Carte de défense / Rappels /
Préférences coach`). Le bug est en L5 (composer), pas en L3 : la
route_decision était souvent correcte, mais le runtime
`buildStatusOnlyNoMutationRuntime` était déclenché avant que le composer
normal_reply ne puisse répondre.

Décisions.

1. Ajout de `isExplicitConversationalFormatRequestForTest` dans `router/run.ts`.
   Détecte les contraintes de format dures et explicites du user : séquence
   « fait, prévu, fragile », « en X lignes » / « X lignes max » / « X lignes,
   sans … » / début de phrase « X lignes … », « en une phrase » / « une seule
   phrase », « pas de panneau » / « sans panneau », « pas de statut système »,
   « récap conversationnel ».

2. Pourquoi cette regex est légitime malgré la règle anti-sémantique. Cette
   détection ne porte pas sur l'**intention** (carte vs rappel vs préférence).
   Elle porte sur un **contrat de format** imposé par le user. La regex est
   volontairement étroite et accompagnée d'anti-faux-positifs explicites
   (titres de cartes, objets d'action).

3. `statusOnlyNoMutationRuntime` n'est plus produit si
   `isExplicitConversationalFormatRequestForTest(userMessage) === true`. La
   réponse passe par les composers aval (`normal_reply`).

4. Anti-faux-positifs documentés. La regex
   `(une|deux|trois|quatre|cinq|1|2|3|4|5)\s+ligne(s)?` exige un contexte sans
   ambiguïté : préposition `en`, suffixe `max/maximum/seulement`, virgule +
   `sans`, ou début de message. Sans cette contrainte, « carte Samir 3
   lignes » ou « envoyer trois lignes à Samir » seraient matchés à tort.

5. 12 tests dans `router/run_product_help_guard.test.ts`.

Limite. Ne corrige pas A6-r2 T13 (4 items dont 1 conversationnel). Le composer
status_only doit être paramétrique ou délégué à un LLM (chantier ultérieur).

---

## Chantier 2 — Lookup DB des effets durables dans les handlers (2026-05-28)

Couche. L5 (skill) + contexte LLM companion.

Contexte. ~3 tours rouges (A2-r4 T7/T9) où Sophia répond à côté du sujet ou
nie un effet durable existant. Le handler ne consulte pas la DB et se base sur
des heuristiques internes ou sur le contexte conversationnel.

Phase A. Disambiguation `product_help` direct replies entre carte et rappel.

- Helpers `currentMessageTargetsAttackCard` / `currentMessageTargetsOneShotReminder`
  qui regardent uniquement le **message courant** (pas le contexte récent).
- `directOneShotReminderReply` exige que le message courant mentionne
  explicitement le rappel ; sinon renvoie null pour laisser
  `directAttackCardLocationReply` répondre.
- `directAttackCardLocationReply` symétrique.
- Réordonnancement dans `runProductHelpSkill` : attack card AVANT one_shot
  reminder.
- Tests dans `skills/skills_s3.test.ts` (A2-r4 T7 + negative control +
  pronominal).

Phase B. Injection d'un résumé DB dans le contexte du LLM companion.

- Nouvelle fonction `loadDurableEffectsSummary(supabase, userId)` dans
  `context/loader.ts`. Interroge en parallèle `user_attack_cards`,
  `user_defense_cards`, `scheduled_checkins`, `user_profile_facts` (préfixe
  `coach.%`) et produit un bloc texte compact.
- Champ `durableEffectsSummary?: string` dans `LoadedContext`.
- Déclenchement uniquement en mode `companion`.
- Position dans `buildContextString` : après `facts`, avant
  `whatsappFilRouge`/`memoryV2Payload`.
- Consigne explicite : « Ne dis JAMAIS "on n'a pas validé/créé X" si la ligne
  correspondante est présente. »

Pourquoi ce n'est pas un détecteur sémantique. Cette injection n'examine pas
le message user, ne décide d'aucun routing. Elle fournit un état de DB
vérifiable au LLM + consigne anti-hallucination.

Tests dans `context/loader_durable_effects_test.ts` (6 cas).

Limite. A2-r4 T8 reste hors scope : `prepare_attack_card` AI intake nie
l'existence d'une carte fraîche parce que son contexte d'entrée ne contient
pas la DB. Traité au chantier 4.

---

## Chantier 3 — Few-shots dispatcher pour migration L3 → L1 (2026-05-28)

Couche. L1 (dispatcher prompt).

Contexte. `router/turn_intent_arbitrator.ts` contient 5 détecteurs
transitionnels qui violent la règle architecturale anti-sémantique de L3. Le
chantier 3 prépare leur suppression en transférant la sémantique vers le
dispatcher LLM sous forme de few-shots.

Décisions.

1. Mise à jour de `DISPATCHER_V2_PROMPT_VERSION` :
   `dispatcher_v2_prompt_2026_05_s16` → `dispatcher_v2_prompt_2026_05_s17_l3_migration`.

2. Ajout de 5 few-shots dans `critical_routing_examples`. Un par détecteur L3
   transitionnel. Chaque few-shot contient un `user_message`, les `expected`
   signaux à produire, et une `note` qui explicite le piège à éviter.

3. Mapping détecteur → few-shot :

   - `detectsExplicitOneShotReminderCreate` → "Programme-moi un rappel
     ponctuel demain à 11h35 pour payer la facture."
   - `detectsActiveToolCancellation` → "Non, pas de carte. Annule ce flow…"
   - `detectsDurableCoachPreference` → "Pour la suite, enregistre une
     préférence durable : quand je dis 'court', zéro emoji…"
   - `detectsExplicitProductHelp` → "Où est-ce que je retrouve cette carte
     d'attaque dans l'app ? Juste l'emplacement…"
   - `detectsExactDurableStatus` → "Sans rien modifier, vérifie ce qui est
     vraiment en place côté carte, rappel et préférence coach."

4. Conservation des détecteurs L3 en filet de sécurité. Sans run QA Gemini
   réel, on ne peut valider que le dispatcher LLM obéit aux few-shots de
   manière fiable.

5. 4 tests dans `dispatcher/dispatcher.test.ts` (version, présence des
   few-shots, `payload_hint.raw_text` non vide, signaux exit pour
   cancellation).

Critère de suppression d'un détecteur L3 (sessions ultérieures).

- Lancer un run QA real-persona qui couvre les 5 cas (~15-25 tours).
- Pour chaque détecteur, vérifier dans les traces que le `TurnFrame` produit
  par le dispatcher contient les bons signaux SANS intervention de L3
  (`arbitrate` retourne `changed=false`).
- Si OK sur 2 runs consécutifs, supprimer le détecteur + tests associés.
- Documenter chaque suppression dans le bloc « Historique de suppression » en
  tête de `router/turn_intent_arbitrator.ts`.

---

## Chantier 4 — Garde-fou DB anti-doublon dans `prepare_attack_card` (2026-05-28)

Couche. L5 (handler tool skill).

Contexte. A2-r4 T8 : Sophia a créé une carte au tour 6, et au tour 8 le user
demande "Donne juste l'emplacement de la carte que tu viens de créer". Le
dispatcher route à tort vers `prepare_attack_card`, le handler démarre un
nouveau slot filling, et Sophia répond "Je n'ai pas encore créé de carte
d'attaque" — directement contradictoire avec la DB.

Décisions.

- Helper DB `loadRecentActiveAttackCardForUser` (exporté, testable) dans
  `router/run.ts` : interroge `user_attack_cards` (status=active, ordre desc,
  limite 1), parse l'âge, retourne `{id, title, technique, ageSeconds}` ou
  `null` selon une fenêtre temporelle paramétrable (défaut 300s = 5 min).
- Détecteur narrow `userExplicitlyAsksForNewAttackCardForTest` : matche
  seulement les expressions explicites d'une volonté de **nouvelle/autre**
  carte ("nouvelle carte", "une autre carte", "deuxième carte", "encore une
  carte", "carte supplémentaire"). NE matche PAS "cette carte", "la carte",
  "ma carte".
- Branchement dans `maybeRunPrepareAttackCardOperation`, branche "fresh start"
  (avant le 4ème appel à `runAttackCardIntake`) : si carte active < 5 min ET
  pas de demande explicite de nouvelle, on court-circuite et on renvoie une
  clarification.
- Statut `toolSkillRun.status = "duplicate_active_attack_card_guard"`.
- 11 tests dans `run_product_help_guard.test.ts`.

Justification architecturale.

1. N'est PAS un détecteur sémantique au sens L3. S'appuie sur un fait DB
   binaire + une regex narrow sur la demande explicite de nouvelle.
2. Ne route pas. Intervient uniquement quand `prepare_attack_card` a déjà été
   choisi.
3. Préserve la création légitime d'une seconde carte.
4. Coût plafonné : 1 tour de clarification dans le pire cas.

Critère de suppression. Un run QA confirme que le dispatcher (avec les
few-shots du chantier 3) route systématiquement vers `product_help` dans le
cas A2-r4 T8 sans que la garde L5 ne déclenche.

---

## Chantier 5 — Rapatriement de la glue layer dans le module skill (2026-05-28)

Couche. Refactor structurel (déplacement physique, pas de logique modifiée).

Contexte. La fonction d'orchestration `maybeRunPrepareAttackCardOperation`
vivait dans `router/run.ts` et représentait ~970 lignes pour ce seul tool.
Multiplié par 5 tools, ~5K lignes de "glue layer" dans un fichier de 20K
lignes — la cause racine du sentiment "run.ts me fait peur à éditer".

Décisions.

- Création de `tools/operations/prepare_attack_card/router.ts` (~1026 lignes)
  qui contient désormais la fonction dans son intégralité avec ses 4 branches
  (pending_review, active_target_candidate, pending_recommendation,
  fresh_start).
- `router/run.ts` : fonction supprimée, remplacée par un thin re-export.
  `run.ts` passe de 20146 lignes à 19185 lignes (-961, ~5%).
- 20 helpers utilisés par la fonction marqués `export` dans `run.ts` (pas
  déplacés physiquement pour limiter le risque).
- Aucune logique modifiée. `deno check` 0 erreur, 151/151 tests verts.

Plan de continuité.

- Répliquer le pattern sur les 4 autres tools (`prepare_defense_card`,
  `create_recurring_reminder`, `select_state_potion`,
  `update_coach_preferences`).
- Quand les 5 tools sont migrés, `run.ts` devrait peser ~13-14K lignes.
- Plus tard : déplacer les helpers attack-card-only dans le module du tool,
  formaliser un module partagé `tools/operations/_shared.ts`. Cible :
  `run.ts` ~2-3K lignes.

---

## Chantiers 6-10 — Méga-plan post runs r5-r6 (2026-05-28)

Couche. L3 (transitionnel) + L5 (contexte loader + tool extractor).

Contexte. Après les chantiers 1-5, 4 runs (A2-codex-r4, A3-r6, A4-r5, A7-r2)
restent rouges. 5 nouvelles familles de bugs identifiées, chacune avec un
fix surgical.

### C6 — `loadDurableEffectsSummary` détaille TOUS les rappels en attente

A4-r5 T11. Avec deux rappels en DB, Sophia répondait "non confirmé / non
confirmé" car le summary ne détaillait que le premier. Fix : list jusqu'à 5
rappels avec scheduled_for + instruction, renforcement de la consigne LLM.

Fichiers. `context/loader.ts`, `context/loader_durable_effects_test.ts`.

### C7 — Anaphore "le même texte" pour reminder

A4-r5 T6 ("le même rappel"), A6-r2 T11 ("comme tout à l'heure"). Détection
d'une anaphore (`ANAPHORA_REMINDER_PATTERN`) + résolution depuis le dernier
rappel pending du user.

Fichiers. `tools/always_on/one_shot_reminder/one_shot_reminder_tool.ts`
(`detectsReminderAnaphora`, `loadLastReminderInstructionForUser`,
`isGenericOrAnaphoricInstruction`) + 6 tests régression.

### C8 — Détecteur multi-entity status pour éviter le hijack par product_help

A4-r5 T10, A7-r2 T11. "quelle carte / quels rappels / quelle préf ?" tombait
sur `detectsExplicitProductHelp`. Nouveau `detectsMultiEntityDurableStatus`
plugué AVANT `detectsExplicitProductHelp`.

Fichiers. `router/turn_intent_arbitrator.ts` + 7 tests régression.

### C9 — Continuation d'un brouillon `prepare_attack_card` mid-flow

A4-r5 T9, A3-r6 T7. Quand une correction de slot ("change la technique en
ancre visuelle") arrive alors qu'un `prepare_attack_card` est actif/pending,
la couche product_help la captait. Fix : `looksLikeAttackCardSlotCorrection`
+ `rewriteForPendingAttackCardContinuation` qui force la continuation.

Fichiers. `router/turn_intent_arbitrator.ts` + 5 tests régression.

### C10 — Détecteur recap qui bloque `update_coach_preferences`

A7-r2 T15. "Fais un récap final" était routé vers `update_coach_preferences`
parce que la phrase contenait des mots de préférence. Nouveau
`detectsRecapRequest` plugué AVANT `detectsDurableCoachPreference` (force
normal_reply, bloque tool_skill).

Fichiers. `router/turn_intent_arbitrator.ts` + 3 tests régression.

---

## Chantiers 11-19 — Méga-plan post runs r6-r7 (2026-05-28)

Couche. L3 (transitionnel) + L5 (contexte loader + reminder extractor +
product_help anti-contamination).

Contexte. Runs `A3-r7`, `A4-r6`, `A8-r1`, `A2-codex-r6`. Deux passent
red→yellow (A3-r7, A8-r1), deux restent red avec un mix de bugs persistants
et nouveaux. 11 familles identifiées, 8 chantiers exécutés, 1 différé (C17).

### C11 — Reorder arbitrator : multi-entity-status AVANT coach_preference

A4-r6 T10. "Statut fiable sans rien modifier : quelle carte / quels rappels /
quelle préférence coach ?" — `detectsDurableCoachPreference` matchait
"préférence coach" et firait avant `detectsMultiEntityDurableStatus` (C8). Fix :
inverser l'ordre dans `arbitrateTurnIntent`. Une question d'état durable est
une lecture, jamais une mutation.

Fichiers. `router/turn_intent_arbitrator.ts` + 1 test régression.

### C12 — Heures locales `user_timezone` dans `durableEffectsSummary`

A4-r6 T15. Récap affiche "09:21/09:37" (UTC) au lieu de "11:21/11:37"
Europe/Paris. Fix : fetch `profiles.timezone` en parallèle, formater chaque
horaire via `Intl.DateTimeFormat` en local (`28 mai, 11:21 (Europe/Paris)`),
garder l'ISO entre crochets pour traçabilité, consigne anti-UTC renforcée.

Fichiers. `context/loader.ts` + 2 tests régression.

### C13 — `extractReminderInstruction` priorise les quotes "texte exact 'X'"

A4-r6 T7. "rappel ponctuel aujourd'hui à 11h37, texte exact 'envoyer à Noa…'"
→ DB stocke la méta-instruction complète. Fix : nouveau
`extractQuotedReminderInstruction` appelé EN PREMIER dans
`extractReminderInstruction`. Si une quote labelée existe, elle est la seule
source.

Fichiers. `tools/always_on/one_shot_reminder/one_shot_reminder_tool.ts` + 5
tests régression.

### C14 — Product help rappel : "où vérifier/annuler dans l'app" prime sur modification-detector

A2-r6 T4/T8, A3-r7 T3. `isExplicitOneShotReminderModificationRequestForTest`
matchait "change" dans "ne change rien". Fix : garde anti-faux-positif
(négations explicites + marqueurs question produit).

Fichiers. `router/run.ts` + 4 tests régression.

### C15 — Garde inverse de C9 : "crée le deuxième rappel" force `create_one_shot_reminder`

A4-r6 T5. Dispatcher hijack vers `prepare_attack_card` (carte récente) parce
que `detectsExplicitOneShotReminderCreate` ne matchait pas "crée le deuxième
rappel". Fix : élargir `createSignal` aux ordinaux/déterminants (`un autre`,
`un second`, `le deuxième`, `le troisième`, …). Effet de bord : `normalizeText`
convertit aussi les tirets en espace → "fais-moi un rappel" matche
désormais comme "fais moi un rappel".

Fichiers. `router/turn_intent_arbitrator.ts` + 3 tests régression.

### C16 — Détecteur memory-recap + opt-out status explicite

A2-r6 T9. "Résume ce que tu dois retenir de mon piège de ce matin, pas les
statuts système" — routé sur status resolver. Fix : `detectsRecapRequest`
étendu + nouveau `detectsExplicitNoStatusRequest` ("pas les statuts système"),
plugué EN TOUT PREMIER après les gardes de sécurité avec reason_code
`central_arbitrator_explicit_no_status_request`. Force `normal_reply` et
bloque `status_only` + `tool_skill.update_coach_preferences` +
`tool_skill_flow`.

Fichiers. `router/turn_intent_arbitrator.ts` + 4 tests régression.

### C17 — DIFFÉRÉ : composer guard "c'est fait/programmé" sans exécution

A4-r6 T6. Sophia annonce le rappel "correspond bien à ce que j'ai déjà
indiqué" alors que `executed_tools=[]`. `direct_effects` finit vide en aval.
Quelque chose entre L3 (arbitre) et L5 (exécuteur) perd l'effet.

Pourquoi différé. Nécessite instrumentation traceur entre
`arbitrateTurnIntent` et `maybeCreateOneShotReminder`. Approche
text-postprocess (rewrite "c'est programmé" si executed_tools vide) est
risquée pour les cas légitimes. À traiter en session dédiée avec un test
end-to-end ciblé.

### C18 — `extractReminderInstruction` capture "pour relire X avant Y" complet

A3-r7 T2. "Mets-moi un rappel demain à 9h05 pour relire ce mail client avant
de l'envoyer" → DB stocke `"l'envoyer"`. Dans la cascade de regex, `\bde\s+(.+)$`
était testé AVANT `\bpour\s+(.+)$`, donc le trailing "de l'envoyer" gagnait.
Fix : inverser l'ordre. Le pattern explicite "pour me dire/rappeler/faire
penser" reste prioritaire.

Fichiers. `tools/always_on/one_shot_reminder/one_shot_reminder_tool.ts` + 2
tests régression.

### C19 — Anti-contamination `product_help` ← draft `update_coach_preferences`

A4-r6 T13. `response_owner=product_help` correct mais Sophia répond avec le
draft confirmation `update_coach_preferences` du tour précédent. Fix : quand
`rewriteForProductHelp` fire, on nettoie aussi la `tempMemory` (suppression
de `__pending_tool_skill_confirmation`, `pending_tool_skill_confirmation`,
`__active_tool_skill_intake`, `active_tool_skill_intake`,
`__pending_recommendation_operation`). On ajoute
`tool_skill.update_coach_preferences` + `tool_skill_flow` aux `blocked_paths`.

Fichiers. `router/turn_intent_arbitrator.ts` + 1 test régression.

### Bilan tests C11-19

- `turn_intent_arbitrator.test.ts` : 32 verts (+13 nouveaux).
- `run_product_help_guard.test.ts` : 60 verts (+4 nouveaux).
- `loader_durable_effects_test.ts` : 9 verts (+2 nouveaux).
- `one_shot_reminder_tool_test.ts` : 34 verts (+7 nouveaux).
- Total touché : 135 verts, 0 nouveau rouge.

Trois échecs pré-existants dans `run_test.ts` (attack card opportunity, adjust
plan, writePlanAdjustmentPatch) confirmés AVANT et APRÈS le chantier via
`git stash` → régressions antérieures hors scope.

---

## Familles de bugs identifiées mais hors scope

Référence pour les prochaines sessions, classées par couche et par effort.

### F8 — `prepare_attack_card` slot filler ignore "une seule proposition"

Couche. L5 (generator du skill). Effort. ~2-3h.

A3-r7 T11. User demande "une seule proposition, pas trois options", Sophia
propose deux options. Le générateur ne lit pas la contrainte de forme.

### F9/F10 — Composer recap "fait/prévu/fragile" et hallucination "c'est fait"

Couche. L5 (composer) + traçage runtime. Effort. ~2-3h.

A2-codex T13/T14. Le composer pose une question au lieu de rendre quand le
user fournit les labels explicites + "pas de question".

A4-r6 T6 (C17 différé). Sophia annonce une exécution qui n'a pas eu lieu.
Nécessite instrumentation entre L3 et L5.

### Préférences conditionnelles structurées en `user_profile_facts`

Couche. Schema + migration DB. Effort. session dédiée.

Aujourd'hui, une préférence comme "quand je dis 'court', zéro emoji, trois
lignes max" est stockée comme texte libre. Pour qu'elle s'applique réellement
en aval, il faut un schema `(trigger, action_sequence, scope)` testable.

### Stabilisation infra (HTTP 502 upstream)

Couche. Infra. Prérequis à toute validation QA fiable.

### Migration finale L3 → L1

Couche. L1 (dispatcher prompt). Effort. variable.

Quand le dispatcher (avec les few-shots des chantiers 3, 8, 9, 10, 11, 15, 16)
prouve sur 2 runs QA consécutifs qu'il produit nativement les bons signaux,
supprimer les détecteurs L3 correspondants un par un. Voir critère de
suppression du chantier 3.

### Refactor des 4 autres tools sur le pattern du chantier 5

Couche. Refactor structurel. Effort. ~1 tool/session.

`prepare_defense_card`, `create_recurring_reminder`, `select_state_potion`,
`update_coach_preferences`.

### Composer `status_only` paramétrique ou délégué à un LLM

Couche. L5. Effort. ~1-2j.

Reste du levier sur les cas multi-items (~1-2 tours par run).

### `UserTurnSnapshot` unifié

Couche. Refactor du contexte. Effort. structurel.

Consolider tous les reads DB de début de tour dans un objet unique et le
propager à toutes les couches. Évite les divergences entre ce que voit
l'arbitre, le composer et le skill.
