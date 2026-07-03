# QA Run Report - Daily 4 actions / 2 plans + handoff coaching (D-4act.1)

## 1. Contexte Du Test

- Date: 2026-07-03
- Run: `daily-4act-20260703-r4`
- Persona: `qa-skill` (user temporaire cree de toutes pieces, `is_test_persona=true`, user_id `0c418eb2-52af-4c48-b127-efcdc7f4d001`)
- Objectif: daily en conditions reelles avec **2 plans, 2 actions par plan (4 au total) a checker aujourd'hui**, 2 faites / 2 non faites, puis une **demande d'aide** censee router vers `coaching_recommendation`.
- Trajectoire: seed dynamique (1 cycle -> 2 transformations -> 2 plans actifs -> 2 actions habit reviewables chacun -> 4 occurrences `planned` today) -> `schedule-whatsapp-v2-checkins` -> `process-checkins` -> pending `daily_action_review` (4 targets) -> daily multi-tours (focus 2 puis 2 restantes) -> demande d'aide post-daily.
- Surfaces visees: `process-checkins`, `whatsapp_pending_actions.chat_capability=daily_action_review`, selector daily (focus <=2 + `remaining_occurrence_ids`), `daily_action_review_v1`, dispatcher + `coaching_recommendation`, garde `track_progress` (fix R2-B01).
- Cadre IA reel: Supabase local, ouverture IA proactive, intake daily LLM, dispatcher/coaching IA reels, chemin loopback WhatsApp (`process-checkins` puis `/functions/v1/whatsapp-webhook`). Pas de `test-send-message`, pas de renderer deterministe, pas d'executor direct.
- Validite QA: valide. Pending genere par le systeme (4 targets sur 2 plan_id distincts), aucun ID/action/message hardcode, reponses user choisies apres lecture de Sophia.

Grounding dynamique:
- pending_id: `a66947f0-27b9-4bde-afc9-15f451964fe4`, status final `done`
- targets.length: `4` (2 par plan): Plan Sommeil `8fece82e` (respiration, marche aprem), Plan Focus `5dc1adea` (marche reveil, bloc sans telephone)
- local_date: `2026-07-03`, weekday `fri`
- Isolation: aucune file due hors scope au moment du run; cleanup complet (user supprime en cascade).

## 2. Tours De Conversation

### Tour 0 (ouverture proactive, reponse user vide)

**Verdict du tour:** green

**Sophia**
> Je repasse sur tes deux actions du jour : 10 min de respiration avant le déjeuner et 15 min de marche l'après-midi.
> Ça s'est passé comment pour toi aujourd'hui ?

**Trace courte**
- source: pending daily `process-checkins`, `chat_capability=daily_action_review`
- pending_status: `awaiting_user`, targets=4
- focus initial: 2 occurrences du **meme plan** (Plan Sommeil) — grouping selector `same_plan`; les 2 du Plan Focus sont en `remaining_occurrence_ids`
- direct_effects: aucun

Conforme: une seule question principale, focus borne a 2, les 2 actions du focus nommees et desambiguisees.

### Tour 1 (report du focus Sommeil)

**Verdict du tour:** green

**User**
> La marche de l'après-midi je l'ai bien faite. Par contre la respiration avant le déjeuner, non, j'ai zappé complètement.

**Sophia**
> Je vois. Du coup, pour « Faire 20 min de marche au réveil », est-ce que tu l'as faite aujourd'hui ?

**Trace courte**
- http_status: `200`, handler `daily_action_review_v1`
- review_state: marche aprem = `completed`, respiration = `missed` (`reason_category=forgot`, `still_relevant=true`), les 2 high confidence
- **avancement multi-tours**: le daily bascule le focus vers la paire restante (Plan Focus), demande l'outcome de la marche du reveil
- pending encore `pending`, entries=0 (commit differe a la cloture)

Conforme: le daily resout la 1re paire puis avance vers la 2e sans commit premature.

### Tour 2 (report du Plan Focus, cloture)

**Verdict du tour:** green

**User**
> La marche du matin oui, faite dès le réveil. Le bloc sans téléphone en fin de matinée par contre non, je décrochais toutes les 5 minutes pour regarder mon tel.

**Sophia**
> C'est noté pour les 4 actions du jour. Ton daily est clôturé.

**Trace courte**
- http_status: `200`, pending -> `done`
- effet durable: **4 entries `daily_action_review_v1`** — respiration `skip/missed`, marche aprem `checkin/completed`, marche reveil `checkin/completed`, bloc sans telephone `skip/missed` (`reason_category=other`, `still_relevant=true`)
- occurrences: marche aprem `done`, respiration `rescheduled`, marche reveil `done`, bloc `missed`
- "C'est noté" rendu **apres** commit complet (invariant EffectLedger respecte)

Conforme au scenario: 2 faites / 2 non, sur 2 plans, committe correctement.

### Tour 3 (demande d'aide -> routing coaching)

**Verdict du tour:** green (apres 1 retry, cf. Incident)

**User**
> Écoute, le bloc de travail sans téléphone, j'y arrive vraiment pas, je décroche sans arrêt pour checker mon tel. Tu peux m'aider à tenir ce créneau ?

**Sophia**
> Je partirais sur une carte de défense pour ce bloc : tu décroches pendant le créneau, donc il faut protéger le moment où tu attrapes ton téléphone. L'idée, c'est de repérer le piège, prévoir un retour en moins de 30 secondes, et garder un plan B simple pour revenir au travail. Si tu veux, on la prépare sur ce bloc sans téléphone.

**Trace courte**
- http_status: `200`
- `response_owner: coaching_recommendation`, `selected_handler: coaching_recommendation`, `reason_code: coaching_recommendation_signal`
- direct_effects: `[]`; effect_ledger `committed=0 / allowed=0 / blocked=0`
- entries inchangees = 4 (aucun `track_progress` parasite sur ce message qui mentionne le bloc deja `missed`) — le fix R2-B01 tient sur ce tour aussi

Conforme: la demande de levier sur une action precise bloquee route vers `coaching_recommendation`; la technique proposee (carte de defense) correspond a la nature de l'action (moment de rupture identifie: attraper le telephone), conforme aux guidelines operation-suggestions.

### Incident (Tour 3, 1re tentative)

- 1re tentative du tour 3: **HTTP 502** du webhook ("invalid response from upstream server"). Le worker edge (`supabase_edge_runtime_Sophia_2`, policy `per_worker`) a crashe puis **redemarre seul** (`Up 4 seconds`).
- Verification avant retry: le message user avait ete logge en `chat_messages` mais **aucune reponse assistant** et **aucun effet durable** (entries toujours 4). Pas de duplicate.
- Retry du meme tour: 200, reponse coaching correcte. Incident traite comme flake infra local (crash/restart worker), non rattache a une famille `BF-*`. Autorisation utilisateur explicite de continuer malgre les 502.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Ouverture claire, focus 2 actions, pas de surcharge malgre 4 actions du jour.
- Avancement naturel vers la 2e paire, une question a la fois.
- Cloture non culpabilisante malgre 2 ratees.
- Handoff vers l'aide fluide: la reponse coaching cible precisement le moment de rupture et propose un levier concret, sans jargon.

**Problemes**
- Aucun blocant cote fluidite.

**Fix propose**
- Rien cote fluidite.

## 4. Analyse Systeme

**Verdict: green** (1 observation mineure jaune non bloquante)

**Routage**
- Tours 0-2: `process-checkins` -> pending daily -> `handleActionEveningReviewReply` -> `daily_action_review_v1`. Focus borne a 2 (selector `same_plan`), avancement multi-tours via `remaining_occurrence_ids`, commit differe a la cloture.
- Tour 3: dispatcher -> `coaching_recommendation` (`reason_code=coaching_recommendation_signal`), correct pour une demande de levier sur action precise bloquee.

**Skills / Operations / Tools**
- Daily: 4 outcomes corrects (2 completed / 2 missed), reasons captures (`forgot`, `other`), `still_relevant` sur les missed, 4 entries `daily_action_review_v1`.
- Coaching: technique = carte de defense, coherente avec un point de rupture identifie; propose de la preparer (pas d'effet durable committe sans suite, conforme).
- `track_progress`: aucun effet parasite sur les tours conversationnels (fix R2-B01 confirme une 2e fois).

**Memory / Effets durables**
- 4 entries daily, pending `done`. Coherence intention/effet: exacte.

**Observation mineure (jaune, non bloquante)**
- Les 2 actions `missed` avec `still_relevant=true` recoivent des statuts d'occurrence differents: respiration -> `rescheduled`, bloc -> `missed`. La difference semble corrélée au `reason_category` (`forgot` vs `other`). A verifier si c'est un choix de contrat (reschedule si oubli, missed sec sinon) ou une divergence. N'affecte pas les entries ni le verdict.

**Fix propose**
- Investiguer la regle de mapping `outcome=missed + still_relevant=true -> occurrence.status` (rescheduled vs missed) selon `reason_category`, cote executor/effects daily. Aucun changement requis pour ce run.

## Verdict Global

- Verdict: green
- Raison principale: le daily multi-tours couvre 4 actions sur 2 plans (2 faites / 2 non), commit complet et fidele; la demande d'aide route correctement vers `coaching_recommendation` avec une technique coherente; aucun effet durable parasite (fix R2-B01 tenu).
- Follow-up prioritaire: (1) infra: surveiller le crash/restart du worker edge local sur le chemin coaching (502 transitoire); (2) mineur: clarifier le mapping occurrence-status pour un missed encore pertinent.
