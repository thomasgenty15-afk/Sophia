# QA Run Report — Human System 15t Post Compact Exit R1

## 1. Contexte Du Test

- Date: 2026-06-16
- Run: `qa-human-system-15t-post-compact-exit-20260616-r1`
- Persona: connexion QA temporaire locale `qa-phase2-qa-human-system-15t-post-compact-exit-20260616-r1@example.com`
- Objectif: verifier les fixes recents sur `emotional_repair` exit, intake compact des cartes de defense/attaque, normal reply non forcant, preference de questions basses, rappel ponctuel et recap status.
- Trajectoire: conversation normale fatigue/dossier -> emotional repair -> action concrete -> rappel -> preference coach -> status recap -> reformulation -> grignotage sans carte -> defense compact -> attaque compact -> abandon de carte.
- Surfaces visees: global dispatcher, active flow arbitration, `emotional_repair`, `create_one_shot_reminder`, `update_coach_preferences`, `status_recap`, `prepare_defense_card`, `prepare_attack_card`, normal reply, DB effects.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, messages choisis tour par tour apres lecture reponse/trace, aucun renderer deterministe appele directement, aucun fallback direct.
- Validite QA: valide. Incidents techniques avant T4: `node fetch` bloque par sandbox et deux formes de commande `curl` invalides; aucun tour Sophia duplique ni effet durable cree par ces essais. Le run exploitable est le transcript T1-T15 ci-dessous.
- LLM: 40/40 appels observes en `openai/gpt-5.4-mini`; 0 fallback Gemini observe dans `llm_usage_events`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je suis un peu rincé aujourd'hui. J'ai un dossier à ouvrir mais j'ai surtout envie qu'on en parle simplement.

**Sophia**
> Je vois, et franchement c’est cohérent : quand t’es rincé, l’idée d’ouvrir un dossier peut déjà peser lourd. On peut juste rester avec ça, sans chercher à forcer quoi que ce soit 🙂

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
> Oui. Et dès que je pense à ce fichier, j'ai l'impression d'être nul et en retard sur tout.

**Sophia**
> Le fichier peut être en retard, mais ça ne dit rien de ta valeur. Tu n’es pas nul, tu traverses juste un moment lourd.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- skill_signal: `emotional_repair.score=0.93`
- durable_effect: none

### Tour 3

**Verdict du tour:** green

**User**
> Ok. Là, si tu devais me dire juste le prochain geste raisonnable, ce serait quoi ?

**Sophia**
> Ouvre le dossier et écris juste le tout premier point flou à éclaircir, en une ligne. Rien de plus pour l’instant 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- active_flow: `none`
- memory_plan: targeted action `Clarifier le premier pas du dossier`
- durable_effect: none

### Tour 4

**Verdict du tour:** green

**User**
> Ok, mets-moi un rappel dans 20 minutes pour rouvrir le dossier.

**Sophia**
> C'est programmé pour mardi 16 juin à 16:14: je te ferai un rappel pour rouvrir le dossier.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- direct_effects: `create_one_shot_reminder`
- durable_effect: 1 `scheduled_checkins` pending, `scheduled_for=2026-06-16T14:14:00+00:00`, instruction `rouvrir le dossier`

### Tour 5

**Verdict du tour:** green

**User**
> Et garde un style plus direct avec moi, avec moins de questions à la fin.

**Sophia**
> C’est bien pris en compte : je passerai sur un ton plus direct et je te poserai moins de questions.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- durable_effect: preference runtime observee ensuite dans `companion_question_rhythm.preference=low`

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATUS-01` — projection DB mal lue / restitution status trop large

**User**
> Ok, donc concrètement qu est-ce qui a vraiment été créé ou noté depuis le début ? Réponds factuel.

**Sophia**
> Depuis le début, je vois surtout : un rappel ponctuel en attente, « rrouvrir le dossier », prévu à 16:14 ; quatre actions de plan actives, « Session focus courte » (1/4), « Marche de decompression » (0/3), « Bloquer les creneaux de la semaine » et « Clarifier le premier pas du dossier » ; et côté préférences coach, « Très direct » et « Peu de questions ». Je ne vois pas d’autre création ou note factuelle dans ce périmètre.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: status recap inclut les actions actives seedées alors que la demande porte sur ce qui a ete cree ou note pendant l'echange; libelle rappel rendu `rrouvrir le dossier`.
- Source amont probable: projection/restitution status recap, pas routing.
- Owner runtime: `status_recap`.
- Meilleure correction selon les guidelines: distinguer objets actifs disponibles et effets crees/notes pendant la conversation; restituer le libelle depuis `message_payload.reminder_instruction` sans alteration.
- Pourquoi ce n'est pas un patch local: la correction porte sur la projection status et le choix des objets dans la restitution, pas sur la phrase T6.

### Tour 7

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PREF-01` — preference non appliquee runtime

**User**
> Aide-moi à écrire à Nadia : je suis en retard sur le doc mais je le reprends cet après-midi.

**Sophia**
> Bien sûr 🙂  
> Tu peux écrire :
>
> Nadia, je suis en retard sur le doc, mais je le reprends cet après-midi.
>
> Si tu veux, je peux te faire une version plus pro ou plus naturelle.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- active_flow: `none`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: bonne reponse, mais ajoute une proposition optionnelle alors que la preference "moins de questions / plus direct" vient d'etre notee.
- Source amont probable: normal reply applique encore trop faiblement `question_tendency=low`.
- Owner runtime: companion / normal reply prompt policy.
- Meilleure correction selon les guidelines: preference low doit reduire les fins optionnelles non necessaires; s'arreter apres la formulation si la demande est satisfaite.
- Pourquoi ce n'est pas un patch local: invariant de style durable, pas formulation exacte.

### Tour 8

**Verdict du tour:** green

**User**
> Plus court, juste une phrase envoyable.

**Sophia**
> Nadia, je suis en retard sur le doc, mais je le reprends cet après-midi 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- durable_effect: none

### Tour 9

**Verdict du tour:** green

**User**
> Là je sens que je vais grignoter alors que je n ai même pas faim.

**Sophia**
> Oui, je vois le genre 😕 Ça ressemble plus à une envie de décharge qu’à une vraie faim. Prends juste 30 secondes avant de bouger, histoire de voir si l’envie retombe un peu.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- blocked_paths: none
- durable_effect: none

### Tour 10

**Verdict du tour:** green

**User**
> Oui, et ne me lance pas dans une carte pour ça, je veux juste rester dans la conversation.

**Sophia**
> Oui, je reste juste avec toi là-dessus 🙂 Ça ressemble bien à un truc de décharge plus qu’à une vraie faim, et c’est déjà utile de le voir.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- blocked_paths: none
- durable_effect: none

### Tour 11

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-01` — slot fourni mais redemande

**User**
> En fait, pour ce soir, je veux bien une carte de défense courte si l envie revient après le dîner. Avec ce que tu sais : je prends un thé, je quitte la cuisine, et je reviens au canapé.

**Sophia**
> Tu veux surtout l’aider à interrompre quoi : l’envie, le grignotage, ou le passage en cuisine ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- durable_effect: 0 `user_defense_cards`

**Analyse si yellow/red**
- Symptome: le user demande explicitement une carte courte et fournit moment + action; Sophia redemande un slot au lieu de proposer un brouillon/validation.
- Source amont probable: `prepare_defense_card.local_dispatcher` ne declenche pas le mode compact au premier tour; visible agent `ask_defense_goal_or_response` suit l'ancien intake.
- Owner runtime: `prepare_defense_card`.
- Meilleure correction selon les guidelines: l'intake compact doit etre un vrai mode structurel du dispatcher local/reducer: situation + action suffisent pour `confirm_support_need_proposal` ou `handoff_ready`, sans question de slot abstrait.
- Pourquoi ce n'est pas un patch local: corrige une famille "carte courte + infos suffisantes", pas la phrase grignotage.

### Tour 12

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` — contrainte explicite perdue

**User**
> Le grignotage. Mais fais avec ce que tu as, je veux une carte courte, pas une série de questions.

**Sophia**
> Destination : dans Ressources / Défense / Cartes de défense libres.
>
> Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?
> Le grignotage
>
> Préparé pour la saisie :
> - risque : si l'envie de grignoter revient après le dîner
> - action de défense : prendre un thé, quitter la cuisine, revenir au canapé
> - repère temporel : ce soir, après le dîner
>
> La carte n'est pas créée depuis le chat.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_prepare_defense_card_local_dispatcher`
- durable_effect: 0 `user_defense_cards`

**Analyse si yellow/red**
- Symptome: le flow finit par preparer les bons champs, mais garde une question template incoherente et ne propose pas une validation naturelle.
- Source amont probable: visible agent `handoff_ready` assemble encore un bloc template d'intake.
- Owner runtime: `prepare_defense_card.visible_agent`.
- Meilleure correction selon les guidelines: quand local dispatcher choisit compact/handoff, le visible agent doit rendre un brouillon compact ou une validation finale, pas reutiliser la question canonique.
- Pourquoi ce n'est pas un patch local: correction de contrat entre action locale structuree et visible agent.

### Tour 13

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-01` — slot fourni mais redemande

**User**
> Ok laisse cette défense. Pour le dossier, je veux une carte d attaque courte avec Préparer le terrain : ouvrir le fichier, mettre le téléphone loin, lire seulement la première consigne.

**Sophia**
> Qu’est-ce qui te fait dérailler au moment de t’y mettre ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- durable_effect: 0 `user_attack_cards`

**Analyse si yellow/red**
- Symptome: bonne sortie de defense vers attaque, mais intake compact attaque ignore l'action cible et redemande le declencheur.
- Source amont probable: `prepare_attack_card.local_dispatcher` ne mappe pas "carte courte + technique + action" vers proposition de champ; visible agent `ask_blocker`.
- Owner runtime: `prepare_attack_card`.
- Meilleure correction selon les guidelines: compact attack doit accepter action cible + moment probable + technique explicite comme brouillon suffisant, et proposer le champ manquant sous forme d'hypothese si necessaire.
- Pourquoi ce n'est pas un patch local: invariant pour toutes demandes compactes d'attaque, pas ce dossier.

### Tour 14

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-01` — slot fourni mais redemande

**User**
> Le moment où je bloque, c est juste avant d ouvrir le fichier. Mais ne me demande plus de détail : propose la carte courte avec ça.

**Sophia**
> Pour ton premier pas sur le dossier, qu’est-ce qui te fait dérailler juste avant d’ouvrir le fichier ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- durable_effect: 0 `user_attack_cards`

**Analyse si yellow/red**
- Symptome: repetition de la question alors que le user vient de fournir exactement le moment de blocage et refuse les questions.
- Source amont probable: state/reducer local ne persiste pas ou ne reconnait pas le slot fourni; visible agent `ask_blocker` appele de nouveau.
- Owner runtime: `prepare_attack_card.local_dispatcher` + reducer/visible action selection.
- Meilleure correction selon les guidelines: slot fill depuis le dernier message doit remplacer l'ancienne question; contrainte "ne demande plus" doit forcer `confirm_platform_field_proposal` ou `handoff_ready`.
- Pourquoi ce n'est pas un patch local: corrige l'intake stateful et la contrainte compacte.

### Tour 15

**Verdict du tour:** green

**User**
> Stop pour les cartes, on laisse tomber. Reviens juste à une réponse simple : je fais quoi maintenant ?

**Sophia**
> Là, tu fais juste ça : ouvre le fichier et note en une ligne ce qui te bloque exactement. Ça suffit pour relancer le dossier 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- active_flow: `none`
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Emotional repair est beaucoup mieux: T2 repare l'auto-devalorisation, T3 sort proprement vers une action concrete sans rester colle au mode emotionnel.
- Normal reply est globalement plus naturel: T1, T8, T9, T10, T15 sont simples, non forcants et suivent le dernier message.
- Les demandes explicites de rappel et preference passent correctement, avec une confirmation visible acceptable.
- Le refus explicite de carte sur le grignotage est respecte.

**Problemes**
- Tour 6: recap status trop large et libelle altere. Famille: `BF-STATUS-01`. Impact: le user peut croire que des actions seedées ont ete creees pendant l'echange. Severite: yellow.
- Tour 7: normal reply pose encore une option finale non necessaire juste apres preference "moins de questions". Famille: `BF-PREF-01`. Impact faible mais contraire a la preference. Severite: yellow.
- Tours 11-14: les deux cartes compactes restent laborieuses. Familles: `BF-INTAKE-01`, `BF-INTAKE-03`. Impact fort: l'utilisateur demande "carte courte / avec ce que tu as / pas de questions", mais Sophia continue l'intake slot par slot. Severite: red.

**Fix propose**
- Source amont: local dispatchers/reducers de `prepare_defense_card` et `prepare_attack_card`, puis visible agents associes.
- Correction recommandee: transformer le "compact intake" en champ/action structurel de flow, pas seulement une consigne prompt. Le local dispatcher doit sortir explicitement `compact_intake=true`, `provided_slots`, `inferred_slots`, `missing_slots_allowed_as_hypothesis`, puis choisir `confirm_*_proposal` ou `handoff_ready`. Le visible agent doit respecter ce choix et ne jamais rebasculer vers une question canonique quand `compact_intake=true`.
- Tests d'invariant attendus:
  - defense: "carte courte + moment + action" -> pas de question slot; brouillon/validation.
  - defense: paraphrase grignotage/apres diner/the/cuisine -> meme resultat.
  - attaque: "carte courte + technique + action cible" -> pas de question blocker si un moment plausible est donne ou inferable; proposer hypothese.
  - attaque actif: user repond au slot + "ne me demande plus" -> pas repetition; proposition compacte.
  - anti-faux-positif: demande vague de carte sans moment/action -> clarification autorisee.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Global dispatcher est globalement sain dans ce run: normal reply gagne quand il doit gagner; rappel, preference, status, defense explicite et attaque explicite sont routes vers les bons owners.
- Emotional repair exit est verifie positivement: T3 appelle le local dispatcher emotional repair, qui rend la main au global; response owner final `normal_reply`.
- Active flow exit attaque est bon au T15: message "Stop pour les cartes" -> `normal_reply_default`, pas capture par `prepare_attack_card`.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: effet DB correct; `scheduled_checkins` contient l'instruction `rouvrir le dossier`, heure locale rendue correctement a 16:14. Warning mineur: T4 trace `blocked_paths` contient `tool_skill_flow` alors que l'effet est admis; la semantique du champ reste confuse.
- `update_coach_preferences`: routing et confirmation corrects; preference runtime observee ensuite `companion_question_rhythm.preference=low`.
- `status_recap`: owner correct mais projection trop large au T6.
- `prepare_defense_card`: owner correct mais compact intake non respecte au premier tour; handoff partiel au second tour avec question template parasite.
- `prepare_attack_card`: owner correct mais compact intake non respecte, puis repetition du meme slot malgre reponse utilisateur.

**DB / Side Effects**
- Rappel ponctuel: 1 pending checkin cree.
- Cartes defense: 0 creee.
- Cartes attaque: 0 creee.
- Plan entries: 0 nouvelle entree observee.
- LLM usage: 40 appels, tous `openai/gpt-5.4-mini`.

**Fix systeme prioritaire**
- Source amont: contrat local flow cartes.
- Correction recommandee: ajouter un vrai mode structurel `compact_intake` dans les sorties des local dispatchers defense/attaque et brancher les visible agents sur ce mode. Le prompt seul n'a pas suffi: le run prouve que les actions visibles restent `ask_defense_goal_or_response` / `ask_blocker`.
- Tests d'invariant attendus: unitaires prompt + tests local dispatcher sur sorties JSON + integration `/test-send-message force_full_ai=true` pour defense compact et attaque compact.

## Verdict Global

**red.** Les fixes emotional repair / normal reply / refus de flow sont convaincants, et GPT-5.4-mini est bien utilise sur tout le run. Mais l'objectif principal de ce run, l'intake compact des cartes defense et attaque, n'est pas valide en conditions reelles: les local flows continuent a poser des questions de slot au lieu de proposer un brouillon ou une validation.
