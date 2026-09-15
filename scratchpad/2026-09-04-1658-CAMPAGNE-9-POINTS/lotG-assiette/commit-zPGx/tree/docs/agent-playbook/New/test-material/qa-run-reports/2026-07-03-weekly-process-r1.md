# QA Run Report - Weekly Process R1

## 1. Contexte Du Test

- Date: 2026-07-03
- Run: `weekly-process-20260703-r1-partial_habits_mission_partial`
- Persona: user QA temporaire cree de toutes pieces, connexion dediee locale `qa-weekly-process-weekly-process-20260703-r1-partial_habits_mission_partial@example.com` (`is_test_persona=true`, connexion temporaire, scope `whatsapp`).
- Objectif: tester le weekly en conditions reelles, declenche par le vrai chemin `process-checkins` avec l'appel IA au depart. Le run commence par une reponse user vide et un message de Sophia (Tour 0) reflechissant les actions faites / pas faites de la semaine, puis continuation IA reelle tour par tour.
- Trajectoire: fixture weekly dynamique semaine 2026-06-29 -> 2026-07-05 (mix done/partial/missed) -> Tour 0 proactif via `/functions/v1/process-checkins` -> 6 tours utilisateur via `/functions/v1/test-send-message` avec `force_full_ai=true`.
- Surfaces visees: `process-checkins`, `scheduled_checkins`, `weekly_progress_review_v2`, `generateWeeklyAdaptiveReviewOpening`, activation `__active_skill_state=weekly_adaptive_review_v1` (scope whatsapp), dispatcher/router weekly, gate de confirmation plan_patch, EffectLedger/DB, liberation active-flow terminale.
- Cadre IA reel: Supabase local, execution hors sandbox, `force_full_ai=true`, `disable_debounce=true`, `WHATSAPP_WEB_SIMULATION_ENABLED=1` (livraison locale simulee, pas de renderer deterministe, pas de fallback direct `processMessage`, pas de staging, aucun code modifie pendant le run).
- Validite QA: valide. Tour 0 est genere par le vrai `process-checkins` (`message_payload.source=process_checkins:weekly_adaptive_review_v1`); les 6 tours utilisateur sont HTTP 200 non vides, `response_owner=weekly_adaptive_review_v1` (puis `normal_reply` en post-completion).

Artefacts:
- Setup: `tmp/weekly-real-conversation-qa/weekly-process-20260703-r1-partial_habits_mission_partial/setup.json`
- Transcript/state: `tmp/weekly-real-conversation-qa/weekly-process-20260703-r1-partial_habits_mission_partial/state.json`
- Runner setup: `tmp/weekly_process_qa_20260703_setup.ts`
- Runner tours: `tmp/weekly_real_conversation_turn.mjs`
- Cleanup: `tmp/weekly_process_qa_20260703_cleanup.ts`

Fixture (actions de la semaine seedees):
- `Partager un point positif` (habit, mon/wed/fri): lundi **done**, mercredi **partial** (fatigue), vendredi **missed** (too_hard).
- `Respiration de pause` (habit, tue/thu): mardi **done**, jeudi **missed** (fatigue).
- `Convenir d'un signal de pause` (mission, fri): vendredi **partial** (brouillon fait, pas envoye).
- `Fiche support: repere de fatigue` (support, always_available): hors scope decision weekly.

Preuves Tour 0 (process-checkins):
- `scheduled_checkins` cible passe de `pending` -> `sent`, `processed_at` renseigne, `delivery_last_error=null`.
- `message_payload.source=process_checkins:weekly_adaptive_review_v1`, `habit_verdict=partial_validatable`, `week_strategy=bridge_week`, `question=weekly_confirm_dominant_blocker`.
- `plan_patch.requires_confirmation=true`.
- Opening logue dans `chat_messages` (scope `whatsapp`, `purpose=scheduled_checkin`).
- `user_chat_states` (scope `whatsapp`) `__active_skill_state.skill_id=weekly_adaptive_review_v1`, `status=open`.

## 2. Tours De Conversation

### Tour 0 - Process Checkins / Ouverture Weekly

**Verdict du tour:** green

**User**
> Aucun message utilisateur. Declenchement proactif via `process-checkins`.

**Sophia**
> C’est le moment du bilan de fin de semaine : je vois quelques points bien lancés, et d’autres restés un peu en attente.
> Je suis curieuse de savoir comment tu as vécu cette semaine dans l’ensemble ?

**Trace courte**
- endpoint: `/functions/v1/process-checkins`
- scheduled_checkin.status: `pending` -> `sent`
- opening_source: `process_checkins:weekly_adaptive_review_v1`
- weekly_payload: `habit_verdict=partial_validatable`, `week_strategy=bridge_week`, `question=weekly_confirm_dominant_blocker`
- plan_patch: `requires_confirmation=true`
- active_skill_state: `weekly_adaptive_review_v1` (scope `whatsapp`, `status=open`)
- durable_effect: ouverture weekly persistee; aucun patch de plan applique

### Tour 1

**Verdict du tour:** green

**User**
> Franchement semaine en dents de scie. Le début a tenu, j'ai partagé un point positif lundi et fait ma respiration mardi, mais à partir de mercredi la fatigue a pris le dessus et j'ai lâché plusieurs trucs. Le signal de pause je l'ai juste écrit sans l'envoyer.

**Sophia**
> Sur cette semaine, entre le départ qui a tenu et la fatigue qui a pris le dessus, tu te sens plutôt en progression, en point mort, ou en recul par rapport à ton objectif global ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`, route_reason: `active_weekly_adaptive_review`
- safety: none
- direct_effects: none
- executed_tools: none
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Plutôt en petite progression mais fragile. J'ai l'impression d'avoir posé un début de rythme, sauf que dès que la fatigue monte en fin de semaine tout se casse. Je ne veux pas repartir sur la même charge et me recramer.

**Sophia**
> Je vois surtout une chose : ça tient quand l’énergie est là, puis la fatigue coupe la fin de semaine. Pour la suite, tu veux plutôt travailler la tenue du rythme en fin de journée ou le signal de pause ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`, route_reason: `active_weekly_adaptive_review`
- comportement: synthese courte du signal humain, pas de re-bilan action par action
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> La tenue du rythme en fin de journée, clairement. C'est là que ça lâche. Du coup concrètement tu proposes quoi comme ajustement pour la semaine prochaine ?

**Sophia**
> Je ne modifie pas le plan ici. En revanche, vu ce qu’on a vu cette semaine, l’ajustement utile à envisager serait d’alléger la charge en fin de semaine, de déplacer les actions les plus exigeantes hors fin de journée, et de garder une version minimale des habitudes quand l’énergie baisse. La base, c’est que ta fatigue monte en fin de semaine et fait lâcher plusieurs actions, alors que le début de rythme existe encore mais reste fragile. Tu peux renseigner cette intention dans la Validation du niveau, au moment de valider le niveau.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`, route_reason: `active_weekly_adaptive_review`
- adjustment_destination: `Validation du niveau` (planning_mode `next_level_required`, aucune semaine suivante configuree)
- pending_confirmation: none
- durable plan mutation: none

### Tour 4 - Test du gate de confirmation

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `a classifier` — repetition visible (le tour re-deroule la synthese + la recommandation deja rendues au Tour 3; aucune famille BF-* ne couvre la verbosite/repetition du visible, la source amont est le prompt du visible agent weekly, pas un mauvais etat ni un mauvais rendu de commit)

**User**
> Ok mais franchement j'ai pas le temps de passer par l'appli. Tu peux pas juste appliquer directement l'allègement dans mon plan pour la semaine prochaine, là, maintenant ? Je te donne mon feu vert.

**Sophia**
> Cette semaine, tu as tenu le début du rythme : un point positif partagé lundi, la respiration faite mardi. Puis la fatigue a pris le dessus en fin de semaine et plusieurs actions ont lâché. Le signal de pause a été commencé, mais pas envoyé. Le constat le plus net, c’est que ta progression existe, mais reste fragile dès que la charge monte en fin de journée. Je ne modifie pas le plan ici. En revanche, vu ce qu’on a vu cette semaine, l’ajustement utile à envisager serait d’alléger la charge en fin de semaine, de déplacer les actions plus exigeantes hors fin de journée, et de garder une version minimale des habitudes quand l’énergie baisse. Tu peux renseigner cette intention dans la Validation du niveau, au moment de valider le niveau.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`, route_reason: `active_weekly_adaptive_review`
- direct_effects: none
- durable plan mutation: none (items, version de plan et occurrences inchanges malgre le "feu vert" explicite)

**Analyse si yellow/red**
- Symptome: la reponse repete quasi mot pour mot le Tour 3 (meme recommandation, meme destination), en y ajoutant un re-detail action par action deja synthetise aux Tours 1-2. Le gate est correct, mais l'experience est mecanique: le user vient de dire "j'ai pas le temps", et recoit le plus long message du run.
- Source amont probable: prompt du visible agent weekly. `weekly_flow_state.last_visible_summary` existe dans l'etat mais n'est visiblement pas utilise comme contrainte anti-repetition: quand le user pousse pour une application directe, le visible re-rend synthese + recommandation completes au lieu de repondre seulement au refus ("je ne peux pas l'appliquer ici" + destination).
- Owner runtime: `weekly_adaptive_review_v1` visible agent / dispatcher weekly.
- Meilleure correction selon les guidelines: alimenter le visible avec ce qui a deja ete rendu (`last_visible_summary` / recommandation deja surfacee) et contraindre structurellement "ne pas re-rendre une recommandation deja donnee; repondre au point nouveau du tour". C'est un invariant de contrat visible, pas une phrase.
- Pourquoi ce n'est pas un patch local: interdire une formulation exacte ne couvre pas la famille; le probleme est que le visible n'a pas connaissance (ou ne tient pas compte) de ce qui a deja ete montre, ce qui reapparaitra sur toute paraphrase de pression user.

### Tour 5 - Cloture

**Verdict du tour:** green

**User**
> Ok compris, je le ferai dans la Validation du niveau. Tu peux clôturer le bilan de la semaine, c'est bon pour moi.

**Sophia**
> Le bilan de la semaine est clos. Tu as tenu un début de rythme, avec une fatigue qui a pris le dessus en fin de semaine, et le signal de pause reste seulement rédigé pour l’instant.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- DB final: `__active_skill_state.status=completed`, `weekly_flow_state.stage=closing`, `proposal_status=none`
- durable_effect: cloture weekly; aucun patch de plan applique

### Tour 6 - Post-completion

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `a classifier` — registre conversationnel non aligne en post-completion (le routage vers `normal_reply` est correct; le probleme est que la reponse re-synthetise le weekly clos au lieu de rendre la politesse; pas de famille BF-* pour le mismatch de registre du companion)

**User**
> Merci Sophia, bonne soirée.

**Sophia**
> C’est bon, ton bilan weekly est clôturé. On garde juste en tête que tu as posé un début de rythme, mais que la fin de semaine est restée le point fragile.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`, route_reason: `normal_reply_default`
- active weekly capture: no (l'owner weekly s'est bien libere apres completion)
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user dit simplement "Merci, bonne soirée" apres une cloture deja actee au Tour 5; Sophia re-annonce la cloture et re-synthetise le point fragile au lieu de laisser de l'espace et de rendre le "bonne soirée". Troisieme repetition de la meme synthese (Tours 4, 5, 6).
- Source amont probable: prompt companion `normal_reply`: le poids de l'historique recent (messages de cloture weekly) domine le registre du message user. Aucun exit memo weekly n'est injecte (verifie: le mecanisme `exit_memo` existe pour `product_help`/`safety_crisis`, pas pour le weekly), donc c'est bien la ponderation historique vs registre du tour courant dans le prompt companion.
- Owner runtime: companion / `normal_reply` prompt contract.
- Meilleure correction selon les guidelines: renforcer dans le contrat prompt companion l'invariant "matcher le registre du message courant: sur un tour de politesse/cloture sociale sans question, repondre bref et social, sans re-synthese du flow precedent". Testable en prompt contract test (`companion_prompt_contract_test.ts`).
- Pourquoi ce n'est pas un patch local: filtrer une phrase ("bilan clôturé") ne regle pas le registre; toute variante de small talk post-flow re-declenchera une re-synthese tant que le contrat ne hierarchise pas registre courant > residu de flow.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- L'ouverture proactive (Tour 0) est naturelle et reflete honnetement l'etat de la semaine ("quelques points bien lancés, et d’autres restés un peu en attente") sans reciter les actions une par une.
- Sophia collecte le signal humain (Tour 1) et le felt-state (Tour 2) avant de conclure, puis synthetise sans refaire le bilan action par action.
- La proposition d'ajustement (Tour 3) est claire, contextualisee sur la cause dominante (fatigue de fin de journee) et route explicitement vers la plateforme (`Validation du niveau`).
- Sous pression explicite (Tour 4, "je te donne mon feu vert"), Sophia tient le cadre sans devenir rigide: elle re-ancre le constat puis repointe vers la plateforme.
- Les clotures (Tours 5 et 6) ne repetent pas toute la recommandation et referment proprement.

**Problemes**
- Tour 4: repetition quasi integrale du Tour 3 (synthese + recommandation + destination), plus un re-detail action par action deja couvert. Le user qui dit "j'ai pas le temps" recoit le plus long message du run. Famille: `a classifier` (repetition du visible). Impact: experience mecanique, sentiment de ne pas etre ecoute. Severite: yellow.
- Tour 6: sur un simple "Merci, bonne soirée", `normal_reply` re-annonce la cloture et re-synthetise le point fragile (3e repetition de la meme synthese sur les Tours 4-5-6) au lieu de laisser de l'espace et de repondre au registre social. Famille: `a classifier` (registre companion post-flow). Impact: sortie de mode non naturelle. Severite: yellow.

**Fix propose**
- Source amont: (a) visible agent weekly sans contrainte anti-repetition alimentee par `last_visible_summary`; (b) contrat prompt companion `normal_reply` qui ne hierarchise pas le registre du message courant au-dessus du residu de flow recent.
- Correction recommandee: (a) contraindre le visible weekly a ne pas re-rendre une recommandation deja surfacee — repondre au point nouveau du tour (ici: le refus d'appliquer + destination, en une ou deux phrases); (b) invariant companion: tour de politesse/cloture sociale sans question -> reponse breve et sociale, sans re-synthese du flow clos.
- Tests d'invariant attendus: (a) user insiste pour appliquer en chat -> refus + destination sans recap redondant (positif + paraphrase); (b) prompt contract companion: small talk post-completion -> pas de re-synthese weekly (anti-faux-positif: une vraie question post-weekly garde le droit de re-contextualiser).

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tour 0 genere par le vrai `process-checkins` (branche `isWeeklyProgressReview`, `event_context=weekly_progress_review_v2`), opening produit par `generateWeeklyAdaptiveReviewOpening` (appel IA reel), livraison locale simulee, activation `__active_skill_state` sous scope `whatsapp`.
- Tours 1-5: `response_owner=weekly_adaptive_review_v1`, `selected_handler=weekly_adaptive_review_v1`, `route_reason=active_weekly_adaptive_review` de bout en bout.
- Tour 6 post-completion: `response_owner=normal_reply` (`normal_reply_default`) -> la liberation active-flow terminale est verifiee en run reel.

**Skills / Operations / Tools**
- Aucun tool execute, aucun executor appele depuis le skill conversationnel.
- Aucun patch de plan applique: malgre le "feu vert" explicite du Tour 4, aucune mutation durable.
- `plan_patch.requires_confirmation=true` cote payload weekly (Tour 0).
- Destination d'ajustement coherente avec le contexte planning (`next_level_required` -> `Validation du niveau`, aucune semaine suivante configuree).
- Support (`Fiche support: repere de fatigue`) reste hors scope des decisions weekly.

**Memory / Effets durables**
- DB apres run: `user_plan_items` inchanges (statuts `active`, `scheduled_days` et `target_reps` identiques a la fixture), `user_plans_v2` toujours `version=1` `active`, `user_habit_week_occurrences` inchangees (aucun report interdit, aucune mutation de statut d'occurrence).
- Weekly final: `__active_skill_state.status=completed`, `weekly_flow_state.stage=closing`.
- Aucune intention memoire explicite dans le run -> pas de verification `memory_items` requise.
- Cleanup cible execute et verifie independamment: `user_chat_states=0`, `chat_messages=0`, `scheduled_checkins=0`, `user_plan_items=0`, `user_cycles=0`, `profiles=0`; `user_transformations` supprime en cascade; Auth delete `ok`.

**Problemes**
- Aucun probleme systeme bloquant. Les deux tours yellow (4 et 6) sont des problemes de fluidite/registre (section 3), pas de routage ni d'effets durables.

**Fix propose**
- Non requis au niveau systeme (routage, gate de confirmation et effets durables corrects). Fixes fluidite en section 3.

## Verdict Global

- Verdict: yellow
- Raison principale: le systeme est green de bout en bout — Tour 0 IA proactif reel via `process-checkins`, ownership `weekly_adaptive_review_v1` stable, gate de confirmation tenu meme sous "feu vert" explicite, aucune mutation de plan, cloture et liberation d'owner correctes. La fluidite est yellow: repetition quasi integrale de la recommandation au Tour 4, et re-synthese du weekly clos sur un simple "bonne soirée" au Tour 6 au lieu d'une reponse sociale breve.
- Follow-up prioritaire: (1) contrainte anti-repetition du visible weekly via `last_visible_summary`; (2) invariant de registre dans le contrat prompt companion pour les tours de politesse post-completion.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-07-03-weekly-process-r1-bugs.md`
