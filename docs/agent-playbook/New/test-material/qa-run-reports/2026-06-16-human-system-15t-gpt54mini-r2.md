# QA Run Report — Human/System 15T GPT 5.4 Mini R2

## 1. Contexte Du Test

- Date: 2026-06-16
- Run: `qa-human-system-15t-gpt54mini-20260616-r2`
- Persona: user QA temporaire local `62edc1b5-2d38-4f6b-ac37-1c034f376463`
- Objectif: evaluer si le passage des appels conversationnels a `gpt-5.4-mini` ameliore la fluidite humaine et le comportement systeme.
- Trajectoire: conversation simple -> emotional repair -> action concrete -> rappel -> preference coach -> status recap -> reformulation -> grignotage -> refus carte -> demande carte -> abandon flow -> recap final.
- Surfaces visees: dispatcher global, normal reply, emotional repair, create one-shot reminder, update coach preferences, status recap, prepare card, active flow exit, memory/action context.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, chemin IA reel, `force_full_ai=true` via driver QA, aucun fallback deterministe.
- Validite QA: valide. Le run a ete pilote tour par tour apres lecture des reponses et traces. Un smoke test precedent `r1` a ete ecarte car il avait utilise une liste de messages pre-ecrite.
- Verification modele: 38 appels LLM, 38 sur `openai/gpt-5.4-mini`, 0 fallback, 0 raw error.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je suis un peu rincé aujourd'hui. J'ai un dossier à ouvrir mais j'ai surtout envie qu'on en parle simplement.

**Sophia**
> Oui, je vois. T’es rincé, et là le vrai besoin c’est juste d’alléger un peu la pression, pas de te pousser à t’y mettre tout de suite 😌
>
> Le “dossier à ouvrir” peut attendre un moment ; déjà, le fait que tu le nommes sans te forcer, c’est souvent le signe que ça te pèse plus mentalement que techniquement.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- direct_effects: none
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Oui, c'est ça. Dès que je pense à ce fichier, j'ai l'impression d'être nul et en retard sur tout.

**Sophia**
> Le fait que ce fichier te mette une pression énorme ne dit pas que tu es nul. Ça dit que tu es submergé là, maintenant. Tu n’es pas ton retard.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- skill_signal: `emotional_repair`, high
- durable_effect: none

### Tour 3

**Verdict du tour:** red

**Famille de bugs:** `BF-ROUTE-02` — Ancien flow capture une nouvelle intention

**User**
> Ok. Là, si tu devais me dire juste le prochain geste raisonnable, ce serait quoi ?

**Sophia**
> Le fait que ce fichier te pèse ne dit pas que tu es nul. Ça dit juste que tu es submergé et en honte là, maintenant.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- durable_effect: none

**Analyse**
- Symptome: Sophia ignore la demande de prochain geste concret et repete la posture emotional repair.
- Source amont probable: local dispatcher / lifecycle policy de `emotional_repair`.
- Owner runtime: `emotional_repair.local_dispatcher`.
- Correction recommandee: renforcer la sortie `exit_to_global` ou `handoff_to_normal_reply` quand le user demande explicitement une action concrete apres validation emotionnelle.
- Pourquoi ce n'est pas un patch local: le probleme est une politique d'ownership active, pas une phrase ratee.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs:** `BF-ROUTE-02` — Ancien flow capture une nouvelle intention

**User**
> Je comprends, mais là je ne veux plus analyser l'émotion : dis-moi juste l'action à faire.

**Sophia**
> Le prochain geste concret, c’est d’ouvrir le dossier et de faire une seule correction utile, rien de plus.
>
> Ce que tu ressens peut être lourd, mais ça ne dit pas qui tu es.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- durable_effect: none

**Analyse**
- Symptome: reponse visible partiellement bonne, mais le flow emotionnel garde l'ownership malgre un refus explicite d'analyser l'emotion.
- Impact: faible a moyen visible, mais risque systeme pour les tours suivants.
- Correction recommandee: l'active skill doit sortir quand le user formule "je ne veux plus ce mode / dis-moi l'action".

### Tour 5

**Verdict du tour:** green

**User**
> Ok. Mets-moi un rappel dans 20 minutes pour rouvrir le dossier, s'il te plaît.

**Sophia**
> C'est programmé pour mardi 16 juin à 17:17: je te ferai un rappel pour rouvrir le dossier.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- direct_effects: `create_one_shot_reminder`, explicit high
- durable_effect: `scheduled_checkins=1`, pending, instruction `rouvrir le dossier`, scheduled_for `2026-06-16T15:17:46.488Z`

### Tour 6

**Verdict du tour:** green

**User**
> Et garde un style plus direct avec moi, avec moins de questions à la fin.

**Sophia**
> C’est fait : j’ai mis ton ton en plus direct et réduit la tendance aux questions.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- tool_skill_intent: `update_coach_preferences`, explicit high

### Tour 7

**Verdict du tour:** yellow

**Famille de bugs:** `BF-STATUS-02` — Historique incomplet / rendu contradictoire

**User**
> Ok, donc là qu'est-ce qui a vraiment été créé ou noté ? Réponds factuel.

**Sophia**
> Je ne vois aucun effet récent commis pendant cet échange. En revanche, il y a un rappel ponctuel en attente : « rouvrir le dossier » à 17:17. Côté préférences coach explicites, je vois un ton très direct et peu de questions.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- durable_effect visible: rappel pending + preferences coach

**Analyse**
- Symptome: la premiere phrase nie les effets recents, puis la reponse liste un rappel et des preferences.
- Source amont probable: projection/restitution `status_recap.visible.recent_effects`.
- Correction recommandee: la restitution doit dire directement "Créé/noté: ..." quand des objets actifs existent, sans phrase negative globale.

### Tour 8

**Verdict du tour:** yellow

**Famille de bugs:** `BF-PREF-01` — Preference non appliquee runtime

**User**
> Ok. Aide-moi à écrire à Nadia : je suis en retard sur le doc mais je le reprends cet après-midi.

**Sophia**
> Bien sûr 🙂
> Tu peux écrire :
>
> Je suis en retard sur le doc, mais je le reprends cet après-midi.
>
> Si tu veux, je peux te le rendre plus poli, plus pro, ou plus naturel.

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`

**Analyse**
- Symptome: bonne reformulation, mais Sophia termine par une question/proposition optionnelle juste apres preference "moins de questions".
- Impact: faible mais visible.
- Correction recommandee: normal reply doit appliquer `question_tendency=low` plus strictement apres update preference.

### Tour 9

**Verdict du tour:** green

**User**
> Plus court, juste une phrase envoyable.

**Sophia**
> Bien sûr : Je suis en retard sur le doc, mais je le reprends cet après-midi 🙂

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- Analyse: le referent Nadia/doc est conserve correctement.

### Tour 10

**Verdict du tour:** green

**User**
> Là je sens que je vais grignoter alors que je n'ai même pas faim.

**Sophia**
> Oui, là c’est un vrai signal d’envie, pas de faim 🙂
> Pause 10 secondes et bois une gorgée d’eau avant de décider.

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- durable_effect: none
- Analyse: pas de forcing carte, bonne micro-aide.

### Tour 11

**Verdict du tour:** green

**User**
> Oui, et ne me lance pas dans une carte pour ça, je veux rester dans la conversation.

**Sophia**
> Oui, je reste avec toi dans la conversation 🙂
> On garde ça simple, sans carte ni mode action.

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- durable_effect: none

### Tour 12

**Verdict du tour:** yellow

**Famille de bugs:** `BF-ROUTE-01` — Mauvais owner selectionne

**User**
> En fait, pour ce soir, je veux bien une carte courte si l'envie revient après le dîner.

**Sophia**
> Pour ce moment-là, je te propose Mot de bascule. Tu veux partir là-dessus ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_skill_intent: `prepare_attack_card`, explicit high

**Analyse**
- Symptome: demande de carte explicite bien detectee, mais domaine grignotage/envie devrait probablement aller vers defense card plutot que attack card.
- Impact: moyen; la technique proposee peut etre utile, mais l'operation owner semble semantiquement fausse.
- Correction recommandee: classifier "si l'envie revient / grignoter / pas faim / apres diner" comme besoin de defense/prevention de craquage, sauf action proactive claire.

### Tour 13

**Verdict du tour:** red

**Famille de bugs:** `BF-INTAKE-01` — Slot fourni mais redemande

**User**
> Oui, mot de bascule. La phrase serait : thé, je quitte la cuisine, et je reviens au canapé.

**Sophia**
> Qu’est-ce qui te fait dérailler juste ce soir, après le dîner ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`

**Analyse**
- Symptome: user donne deja une phrase/action concrete pour carte courte, Sophia redemande un slot au lieu de proposer une carte courte ou une validation.
- Source amont probable: intake/local dispatcher `prepare_attack_card`.
- Correction recommandee: si technique + contexte + phrase/action sont fournis, passer a validation ou brouillon compact, pas clarification supplementaire.

### Tour 14

**Verdict du tour:** green

**User**
> Stop carte finalement. Dis-moi juste : je fais la marche ou le dossier d'abord ?

**Sophia**
> La marche d’abord 🙂 ça t’aide à faire redescendre la pression, puis tu attaques le dossier avec un peu plus de clarté.

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- memory_plan targets: `Marche de decompression`, `Clarifier le premier pas du dossier`
- Analyse: sortie de flow propre, reponse directe, bon grounding action.

### Tour 15

**Verdict du tour:** green

**User**
> Ok, résume ce qu'on garde vraiment depuis le début, sans me proposer autre chose.

**Sophia**
> Depuis le début, on garde surtout ça : la marche pour faire redescendre la pression, puis clarifier le premier pas du dossier. Et il y a aussi le rappel de rouvrir le dossier aujourd’hui à 17:17 🙂

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- durable_effect referenced: reminder `rouvrir le dossier`
- Analyse: respecte "sans proposer autre chose".

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Conversation normale beaucoup plus fluide qu'avant: T1, T10, T11 et T15 restent simples, sans forcing de flow.
- Les demandes explicites passent bien: rappel T5, preference T6, carte T12.
- Les exits explicites marchent mieux: T14 sort proprement du flow carte.
- La reformulation contextuelle est meilleure: T9 garde correctement Nadia/doc.
- Le ton global est plus humain: moins mecanique, plus direct, moins de lourdeur de flow sur les signaux faibles.

**Problemes**
- T3: emotional repair reste colle et ne repond pas au besoin "prochain geste raisonnable". Famille: `BF-ROUTE-02`. Impact: le user doit se repeter pour obtenir l'action concrete. Severite: red.
- T7: recap factuel contient une contradiction. Famille: `BF-STATUS-02`. Impact: leger doute sur ce qui a vraiment ete cree. Severite: yellow.
- T8: question optionnelle malgre preference "moins de questions". Famille: `BF-PREF-01`. Impact: friction faible mais recurrente. Severite: yellow.
- T13: carte courte devient laborieuse. Famille: `BF-INTAKE-01`. Impact: le user donne assez d'infos mais Sophia redemande. Severite: red.

**Fix propose**
- Source amont: lifecycle/exit des local conversation skills, projection status recap, application runtime des preferences, intake compact des cartes.
- Correction recommandee: renforcer les sorties de flow quand le user demande action concrete; nettoyer la phrase negative globale de status recap; appliquer `question_tendency=low` comme contrainte visible; permettre a prepare card de passer en brouillon compact quand le user donne deja phrase + contexte.
- Tests d'invariant attendus:
  - "prochain geste raisonnable" apres de-shame -> reponse action concrete ou handoff normal reply.
  - status recap avec rappel + preference -> "Créé/noté: ..." sans contradiction.
  - preference fewer questions -> pas de question finale optionnelle sur reformulation simple.
  - carte courte + phrase fournie -> brouillon/validation, pas slot redemande.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tres nette amelioration du dispatcher global: `normal_reply` gagne sur les tours simples et les refus de carte.
- Les intents explicites sont bien admis: reminder, preference, status recap, carte.
- Probleme restant: active local skill `emotional_repair` garde l'ownership trop longtemps a T3/T4.
- Probleme restant: grignotage/envie apres diner route vers `prepare_attack_card` au lieu d'un owner defense/prevention plus naturel.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: green. DB: `scheduled_checkins=1`, `event_context=one_shot_reminder:rouvrir_le_dossier`, scheduled for 17:17 Europe/Paris.
- `update_coach_preferences`: routing green, application visible partielle seulement.
- `status_recap`: bon handler, restitution a corriger.
- `prepare_attack_card`: admission explicite correcte, mais mauvais domaine possible et intake trop questionnant.

**LLM / Modeles**
- 38 appels LLM.
- `openai/gpt-5.4-mini`: 38/38.
- Fallback Gemini: 0.
- Raw errors: 0.
- Sources principales:
  - `dispatcher-v2-llm`: 13 appels.
  - `sophia-brain:companion`: 7 appels.
  - `emotional_repair.*`: 7 appels.
  - `prepare_attack_card.*`: 5 appels.
  - autres tool skills/status/preferences: 6 appels.

**Side Effects**
- `scheduled_checkins`: 1, correct.
- `user_attack_cards`: 0.
- `user_defense_cards`: 0.
- `user_plan_item_entries`: 0.
- Aucun effet durable non consenti observe.

## Verdict Global

**Verdict: yellow.**

Le passage a `gpt-5.4-mini` ameliore clairement la conversation et le systeme: plus aucun fallback, meilleur maintien en normal reply, moins de forcing de flow, meilleure gestion des demandes explicites et des exits. Ce n'est pas encore green: les flows locaux restent la principale faiblesse, surtout `emotional_repair` qui garde trop longtemps l'ownership et `prepare_attack_card` qui redemande des slots malgré une demande de carte courte deja exploitable.
