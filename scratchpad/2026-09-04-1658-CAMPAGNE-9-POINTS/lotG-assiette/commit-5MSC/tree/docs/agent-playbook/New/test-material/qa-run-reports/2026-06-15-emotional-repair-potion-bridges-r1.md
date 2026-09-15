# QA Run Report - emotional-repair-potion-bridges-r1

## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `emotional-repair-potion-bridges-r1`
- Persona: `qa-skill`
- Connexions dediees: `emotional_repair_emotional_repair_potion_bridges_r1_amour`, `emotional_repair_emotional_repair_potion_bridges_r1_guerison`, `emotional_repair_emotional_repair_potion_bridges_r1_apaisement`
- Objectif: tester le flow `emotional_repair` vers les 3 potions autorisees par contrat de bridge: `amour`, `guerison`, `apaisement`.
- Trajectoire: reparation emotionnelle non safety -> stabilisation -> demande ou consentement potion -> bridge attendu vers `select_state_potion.<potion>`.
- Surfaces visees: `emotional_repair`, dispatcher local actif, reducer bridge potion, `note_information`, `select_state_potion`, sous-skills potion, no-chat-mutation, DB.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, connexions temporaires, aucun fallback deterministe, aucun correctif code pendant le run.
- Validite QA: partiellement valide. La variante `amour` a 5 tours IA reels exploitables puis bloque en 502 au passage effectif. Les variantes `guerison` et `apaisement` sont techniquement invalides apres 2 essais chacune en 502, mais les incidents comptent comme verdict systeme `red`.
- Artefacts: `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-15-emotional-repair-potion-bridges-r1-*.{raw,summary,durable}.json`, verification DB finale `2026-06-15-emotional-repair-potion-bridges-r1-db-final.json`.

## 2. Tours De Conversation

### Run A - Bridge attendu vers `amour`

### Tour A1

**Verdict du tour:** green

**User**
> J'ai reçu un retour sec sur mon travail et depuis je me parle comme si j'étais nul. Je sais que ce n'est pas rationnel, mais là ça tape fort.

**Sophia**
> Je sens que c'est violent pour toi en ce moment. C'est important de bien distinguer les deux : il y a ce retour sec sur une tâche précise, et il y a qui tu es. L'un est un fait professionnel, l'autre est ta valeur humaine, et elles ne sont pas liées.
>
> Est-ce que tu arrives à voir cette petite frontière, même si elle te paraît floue pour l'instant ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: pas de signal high/critical expose
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucun
- memory_plan: aucun fact d'auto-devalorisation observe
- executed_tools: aucun
- durable_effect: aucun

### Tour A2

**Verdict du tour:** green

**User**
> La frontière existe peut-être, mais je ne la sens pas. J'ai surtout une voix très dure, froide, qui me parle comme si je ne méritais pas beaucoup de douceur.

**Sophia**
> Je sens à quel point cette voix est glaciale et pesante pour toi en ce moment. C'est normal que la barrière entre ce qui s'est passé et qui tu es te semble invisible alors que la douleur est si vive. Pourtant, une erreur ou un moment difficile reste un fait, une circonstance, et non le reflet de ta valeur ou de ton identité profonde. Je reste là avec toi, sans jugement, face à cette dureté.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- local_flow_action: `answer_repair`
- local_visible_task: `separate_fact_from_identity`
- direct_effects: aucun
- durable_effect: aucun

### Tour A3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow.

**User**
> Ça redescend un peu. J'aimerais garder un appui sur quelques jours pour me parler avec plus de chaleur, surtout autour de ce rapport au travail. Pas un plan d'action, plutôt quelque chose qui m'aide à ne pas redevenir dur avec moi.

**Sophia**
> Je suis contente de sentir que la pression redescend un peu. C'est essentiel de se rappeler que ce qui s'est passé au travail est un fait, une situation, mais que cela ne définit pas qui tu es. Je reste là, avec toi, pour t'apporter cette chaleur et cette présence dont tu as besoin ces prochains jours. On oublie les plans et les méthodes, je suis simplement à tes côtés pour t'aider à rester doux avec toi-même.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- local_flow_action: `potion_bridge_offer`
- local_visible_task: `separate_fact_from_identity`
- operation: aucune
- durable_effect: aucune session potion

**Analyse si yellow/red**
- Symptome: le dispatcher local produit `potion_bridge_offer`, mais la reponse visible n'offre pas de potion et reste sur la reparation generale.
- Source amont probable: reducer `emotional_repair` bloque ou de-publie l'offre sans rendre un statut de bridge visible et sans conserver un candidat exploitable.
- Owner runtime: `emotional_repair` local reducer / bridge state / visible context.
- Meilleure correction selon les guidelines: aligner `flow_action=potion_bridge_offer` avec une sortie visible `potion_bridge_offer|potion_bridge_choice` seulement quand l'offre est persistable; sinon ne pas produire `potion_bridge_offer` et garder un statut interne `candidate`.
- Pourquoi ce n'est pas un patch local: le probleme est contractuel entre dispatcher, reducer et visible task, pas une phrase a changer.

### Tour A4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow.

**User**
> Est-ce qu'une potion Sophia pourrait m'aider pour ça, justement pour remettre de la douceur envers moi sans refaire tout l'épisode ?

**Sophia**
> C'est une très belle intention. Ce qui s'est passé au travail reste un événement isolé, une simple circonstance qui ne définit en rien ta valeur ou qui tu es. Je note vraiment ce besoin de cultiver cette douceur envers toi-même durablement, sans avoir à replonger dans les détails de ce moment.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- local_flow_action: `potion_bridge_offer`
- local_visible_task: `separate_fact_from_identity`
- operation: aucune
- durable_effect: aucune session potion

**Analyse si yellow/red**
- Symptome: demande explicite de potion, mais Sophia ne nomme pas `Potion d'amour`, ne demande pas consentement, ne route pas vers `select_state_potion`.
- Source amont probable: le bridge local reste dans une sortie non persistable, ou la contrainte `no_plan/no_technique` pollue la proposition potion.
- Owner runtime: `emotional_repair` bridge reducer / visible agent context.
- Meilleure correction selon les guidelines: quand l'emotion est `low` et que le user demande explicitement une potion pour self-kindness, le reducer doit conserver `selected_potion=amour`, `target_dispatcher=select_state_potion`, et produire une offre visible consentable.
- Pourquoi ce n'est pas un patch local: une regex sur "potion" contournerait l'owner; la correction doit porter sur le contrat structure `potion_bridge`.

### Tour A5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow.

**User**
> Oui, je veux bien passer sur cette potion de douceur envers moi. Pour le champ, c'est autour de mon rapport au travail; je me sens surtout dur avec moi.

**Sophia**
> Je t'accompagne avec plaisir. C'est essentiel de s'offrir cette douceur, surtout quand on est exigeant envers soi-même au travail. Voyons ce qui te conviendrait le mieux pour la suite.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- local_flow_action: `confirm_potion_bridge`
- local_visible_task: `potion_bridge_handoff`
- DB state avant reset final: `__active_skill_state.skill_id=emotional_repair`, `last_visible_task=potion_bridge_handoff`, `selected_candidate.potion=null`, `handoff_data.target_dispatcher=null`, `emotional_repair_potion_handoff=null`
- durable_effect: `user_potion_sessions=0`, pas de scheduled checkin, pas de recurring reminder

**Analyse si yellow/red**
- Symptome: le local dispatcher comprend un consentement de bridge, mais le state final perd le candidat potion et le dispatcher cible; la reponse visible est vague et ne donne pas le handoff plateforme.
- Source amont probable: `isConfirmablePotionBridge` exige une offre precedente persistable; comme l'offre A3/A4 n'a pas ete persistée, le reducer tombe dans un etat incoherent `potion_bridge_handoff` sans `selected_potion`.
- Owner runtime: `emotional_repair` reducer, `last_potion_bridge_offer`, construction `conversationContextForVisibleTask`.
- Meilleure correction selon les guidelines: rendre impossible un visible task `potion_bridge_handoff` sans `selected_potion` et `target_dispatcher=select_state_potion`; si le consentement est invalide, reposer une clarification ou reconstruire l'offre depuis le message courant.
- Pourquoi ce n'est pas un patch local: le bug est dans l'invariant de state/handoff, pas dans le wording.

### Tour A6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-EFFECT-04` - runtime/fallback technique fragile.

**User**
> Ok, continue avec ça.

**Sophia**
> Réponse vide. HTTP 502.

**Trace courte**
- http_status: 502
- body: `An invalid response was received from the upstream server`
- response_owner: null
- selected_handler: null
- route_reason: null
- operation: aucune trace exploitable
- durable_effect: non applicable; verification DB avant reset final: `user_potion_sessions=0`

**Analyse si yellow/red**
- Symptome: le tour qui devait verifier l'entree effective dans `select_state_potion.amour` casse le endpoint.
- Source amont probable: etat actif incoherent apres A5 (`potion_bridge_handoff` sans target/candidat) ou crash runtime au passage local flow -> potion.
- Owner runtime: integration `emotional_repair -> select_state_potion` / active flow policy / Edge Function runtime.
- Meilleure correction selon les guidelines: ajouter un invariant runtime qui refuse ou repare un handoff sans `selected_potion` avant de passer au dispatcher suivant, puis couvrir le passage par test d'integration.
- Pourquoi ce n'est pas un patch local: il faut stabiliser la transition et la gestion d'erreur, pas masquer le 502 par fallback visible.

### Tour A7

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-EFFECT-04` - runtime/fallback technique fragile.

**User**
> Ok, continue avec ça.

**Sophia**
> Réponse vide. HTTP 502.

**Trace courte**
- http_status: 502
- body: `An invalid response was received from the upstream server`
- retry du tour A6 avec nouveau `request_id`
- durable_effect: aucun effet durable observe avant reset final

**Analyse si yellow/red**
- Symptome: retry identique toujours 502.
- Source amont probable: blocage runtime persistant apres handoff cassé.
- Owner runtime: `sophia-brain` runtime / transition active flow.
- Meilleure correction selon les guidelines: corriger la source du crash, puis rerun la meme trajectoire `amour` jusqu'a `select_state_potion.amour`.
- Pourquoi ce n'est pas un patch local: le cadre QA interdit un fallback deterministe pour fabriquer un succes.

### Run B - Bridge attendu vers `guerison`

### Tour B1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-EFFECT-04` - runtime/fallback technique fragile.

**User**
> J'ai craqué hier soir sur un truc que j'avais promis de tenir, et depuis je me repasse la scène en boucle. Je me sens sale, comme si j'avais tout gâché.

**Sophia**
> Réponse vide. HTTP 502.

**Trace courte**
- http_status: 502
- body: `An invalid response was received from the upstream server`
- response_owner: null
- selected_handler: null
- route_reason: null
- durable_effect: aucune session potion; durable runner: `chat_messages=2`, `memory_items=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`

**Analyse si yellow/red**
- Symptome: impossible d'entrer dans la conversation `guerison`; upstream invalide des le premier tour.
- Source amont probable: runtime `test-send-message`/Edge Function apres crash ou regression boot active.
- Owner runtime: `sophia-brain` runtime local / function serving.
- Meilleure correction selon les guidelines: lire les logs runtime Edge Function, corriger le crash, puis rejouer le scenario `guerison` sans changer l'objectif.
- Pourquoi ce n'est pas un patch local: aucune trace metier n'existe; il faut restaurer l'execution IA reelle.

### Tour B2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-EFFECT-04` - runtime/fallback technique fragile.

**User**
> J'ai craqué hier soir sur un truc que j'avais promis de tenir, et depuis je me repasse la scène en boucle. Je me sens sale, comme si j'avais tout gâché.

**Sophia**
> Réponse vide. HTTP 502.

**Trace courte**
- http_status: 502
- retry du tour B1 avec nouveau `request_id`
- body: `An invalid response was received from the upstream server`
- durable_effect: aucun effet durable observe

**Analyse si yellow/red**
- Symptome: deuxieme echec identique; run `guerison` arrete conformement aux guidelines.
- Source amont probable: runtime local indisponible ou crash reproductible.
- Owner runtime: `sophia-brain` runtime local.
- Meilleure correction selon les guidelines: corriger le blocage technique avant toute conclusion metier sur `guerison`.
- Pourquoi ce n'est pas un patch local: continuer avec un autre chemin ne testerait plus le vrai run IA.

### Run C - Bridge attendu vers `apaisement`

### Tour C1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-EFFECT-04` - runtime/fallback technique fragile.

**User**
> Je suis en train de monter en pression après un échange tendu. Je ne suis pas en danger, mais mon corps est à cran et je me juge de réagir aussi fort.

**Sophia**
> Réponse vide. HTTP 502.

**Trace courte**
- http_status: 502
- body: `An invalid response was received from the upstream server`
- response_owner: null
- selected_handler: null
- route_reason: null
- durable_effect: aucune session potion; durable runner: `chat_messages=2`, `memory_items=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`

**Analyse si yellow/red**
- Symptome: impossible d'entrer dans la conversation `apaisement`; upstream invalide des le premier tour.
- Source amont probable: runtime `test-send-message`/Edge Function local deja instable apres le run A.
- Owner runtime: `sophia-brain` runtime local.
- Meilleure correction selon les guidelines: corriger le crash runtime, puis rerun `apaisement`.
- Pourquoi ce n'est pas un patch local: aucune decision metier n'a ete produite.

### Tour C2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-EFFECT-04` - runtime/fallback technique fragile.

**User**
> Je suis en train de monter en pression après un échange tendu. Je ne suis pas en danger, mais mon corps est à cran et je me juge de réagir aussi fort.

**Sophia**
> Réponse vide. HTTP 502.

**Trace courte**
- http_status: 502
- retry du tour C1 avec nouveau `request_id`
- body: `An invalid response was received from the upstream server`
- durable_effect: aucun effet durable observe

**Analyse si yellow/red**
- Symptome: deuxieme echec identique; run `apaisement` arrete conformement aux guidelines.
- Source amont probable: runtime local indisponible ou crash reproductible.
- Owner runtime: `sophia-brain` runtime local.
- Meilleure correction selon les guidelines: corriger le blocage technique avant toute conclusion metier sur `apaisement`.
- Pourquoi ce n'est pas un patch local: continuer en renderer ou fallback invaliderait le QA.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- A1-A2: Sophia stabilise sans safety faux positif et sans ecriture durable.
- Le ton est globalement doux et ne fige pas explicitement "je suis nul" en fait utilisateur.

**Problemes**
- A3-A4: le besoin durable de douceur est reconnu, mais l'offre potion n'apparait pas alors que le dispatcher local tente un `potion_bridge_offer`. Famille: `BF-STATE-01`. Impact: le user doit parler comme un test pour obtenir la suite. Severite: red.
- A5: le consentement est compris comme handoff, mais la reponse visible ne donne ni nom de potion ni destination plateforme. Famille: `BF-STATE-01`. Impact: experience confuse; "Voyons ce qui te conviendrait" annonce une suite qui ne vient pas. Severite: red.
- A6-A7, B1-B2, C1-C2: reponses vides en 502. Famille: `BF-EFFECT-04`. Impact: experience inutilisable. Severite: red.

**Fix propose**
- Source amont: `emotional_repair` bridge reducer et integration active flow vers `select_state_potion`.
- Correction recommandee: rendre les invariants de bridge obligatoires: pas de visible task `potion_bridge_handoff` sans `selected_potion`, `target_dispatcher=select_state_potion`, `note_information`, et contexte de prefill; si l'offre n'est pas persistable, rester en soutien local sans annoncer un handoff.
- Tests d'invariant attendus: `amour`, `guerison`, `apaisement` depuis `emotional_repair` avec stabilisation, offre visible, consentement, entree dans `select_state_potion.<potion>`, no-mutation, et retry sans 502.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- A1-A5 restent chez `emotional_repair`, ce qui est correct pour la phase initiale.
- A3-A4 produisent `local_flow_action=potion_bridge_offer` mais `local_visible_task=separate_fact_from_identity`; la sortie structuree et le rendu divergent.
- A5 produit `local_flow_action=confirm_potion_bridge` et `local_visible_task=potion_bridge_handoff`, mais le DB state contient `selected_candidate.potion=null`, `handoff_data.target_dispatcher=null`, `emotional_repair_potion_handoff=null`.
- A6-A7 ne produisent plus de trace metier et renvoient 502.
- B/C sont techniquement invalides: aucun selected handler apres deux essais.

**Skills / Operations / Tools**
- `emotional_repair` ne cree aucun effet durable, conforme au no-chat-mutation.
- Le bridge vers `select_state_potion` ne se materialise pas. Aucun sous-skill `select_state_potion.amour|guerison|apaisement` n'est observe.
- Aucun executor direct ou activation potion n'a ete appele.

**DB / Effets Durables**
- Verification avant reset final: `user_potion_sessions=0` pour les 3 connexions.
- Durable runner: `memory_items=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`.
- `user_chat_states` de `amour` montrait un active skill `emotional_repair` incoherent apres A5; les connexions ont ensuite ete reset avec `scripts/qa-reset-persona.sh`.
- La table `conversation_turn_traces` locale interrogee en REST retourne 0 lignes pour ces users; le rapport s'appuie donc sur les traces incluses dans la reponse du endpoint et les summaries raw.

**Correction systeme proposee**
- Source amont: `supabase/functions/sophia-brain/skills/emotional_repair/local_flow.ts`, `skill.ts`, et integration bridge active flow dans `router/run.ts` seulement si le contrat montre que l'orchestration perd la note.
- Correction recommandee: faire du bridge un etat atomique: offre persistable -> `last_potion_bridge_offer` complet -> consentement -> `potion_bridge_context` complet -> second dispatcher `select_state_potion` avec note. Ajouter garde contractuel non semantique: si `confirm_potion_bridge` sans offre persistable, ne pas rendre `potion_bridge_handoff`.
- Tests attendus: tests unitaires reducer `confirm_potion_bridge` sans offre precedente, offre persistable `amour/guerison/apaisement`, integration local QA pour les 3 potions, et test de non-regression 502.

Verdict global: red. Le bridge `emotional_repair -> potion` n'est pas valide: `amour` perd le candidat et casse ensuite en 502; `guerison` et `apaisement` ne demarrent pas apres deux retries HTTP 502. Aucun effet durable incorrect n'a ete observe, mais le workflow conversationnel et systeme est inutilisable pour l'objectif teste.
