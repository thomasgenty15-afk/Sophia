# Alex Observations

Document autonome pour piloter le rodage d'Alex. Ajouter ici les observations, corrections, bugs, choses a retester et decisions de test.

## Cadre

But du lab Alex : evaluer de maniere globale comment Sophia accompagne un vrai plan dans la duree, surtout les interactions matin / soir, le rapport aux actions actives, le debrief, la memoire et les corrections.

Alex doit rester un test realiste : l'humain peut introduire du random, mais l'agent doit garder la coherence avec `persona.md`, `current-plan.md` et `timeline.md`.

## Regles D'Annotation

Chaque observation doit etre ajoutee sous la date du jour avec :

- contexte : matin, soir, chat libre, action, debrief, correction
- ce qui etait attendu
- ce qui s'est passe
- preuve : trace_id, message, response, ou lien daily-log
- statut : a retester | bug probable | corrige | decision

## 2026-05-06 - Initialisation Du Vrai Alex

- contexte : creation du vrai user Alex et generation du plan V2.
- attendu : disposer d'un dossier de reference lisible avant les runs quotidiens.
- observe : plan actif trouve en base avec transformation sommeil et niveau "Installer un sas de dechargement mental".
- preuve : `current-plan.md`, plan_id `6947a352-42e6-44a6-9d9f-2d82bf096fce`.
- statut : decision.

## 2026-05-06 - Run WhatsApp Onboarding + Recommandation D'Outil

- contexte : reset WhatsApp sim, onboarding complet, puis conversation simple autour de la peur de ne pas tenir le plan.
- attendu : apres l'onboarding, Sophia doit pouvoir recommander un outil utile de maniere naturelle, sans question technique.
- observe : Sophia propose bien un outil conversationnel simple, `STOP-CHOISIS-EXECUTE`, et reste globalement coherente avec le plan. En revanche aucune trace `recommendation_tool_run` n'apparait dans `turn_summary_logs` et aucun nouveau row de recommandation n'est cree pendant le run. Les rows `user_level_tool_recommendations` visibles datent de la generation du plan, pas de la conversation.
- preuve : transcript `/chat` scope `whatsapp`, messages 16-21 du run `alex-recommend-run-*`; `turn_summary_logs.agent_tool=null`; requete `user_level_tool_recommendations` avec `generated_at=2026-05-06T06:24:32.544+00:00`.
- statut : bug probable / integration a verifier.

## 2026-05-06 - Blocage Emotionnel Apres Demande Concrete

- contexte : apres une sequence "je bloque / propose-moi le plus simple", Alex dit "Je me sens nul..." puis "Ok je veux juste un petit truc concret pour ce soir".
- attendu : Sophia repare brievement la honte, puis repond a la demande concrete suivante avec une micro-action.
- observe : Sophia reste bloquee en reparation emotionnelle et ne donne pas la micro-action demandee au dernier message.
- preuve : transcript `/chat` scope `whatsapp`, messages 22-25 du run `alex-recommend-run-*`.
- statut : a corriger / a retester.

## 2026-05-06 - Correction Recommendation Tool WhatsApp Sim

- contexte : Alex demande un outil simple apres demotivation et peur de lacher.
- attendu : le vrai `recommendation_tool` doit produire une recommandation produit observable, sans outil invente.
- observe : `recommendation_tool_run` est maintenant present dans `turn_summary_logs`; decision `recommend_operation`, `surface_id=plan_item.reduce`, `operation_type=adjust_plan_item`, consentement requis. Le chat affiche l'outil reel "Reduire une action" et demande confirmation avant execution.
- preuve : request_id `c4fa1efb-0c78-439d-982f-0ff76fe0017b`; dernier transcript `/chat` scope `whatsapp` : "On peut utiliser l'outil \"Reduire une action\"... Tu me confirmes que je lance la reduction maintenant ?".
- statut : corrige / a retester sur un run propre.

## 2026-05-06 - Run Stable Web Sim Avec Fallback Anti-Timeout

- contexte : relance complete Alex apres blocage local de `processMessage` dans `whatsapp-sim-inbound`.
- attendu : `/chat` doit afficher l'onboarding WhatsApp dans le bon ordre, enregistrer les 3 preferences, puis permettre une conversation post-onboarding.
- observe : le run stable affiche bien les messages dans l'ordre, enregistre `coach.tone=mix`, `coach.challenge_level=eleve`, `coach.question_tendency=tres_questionnant`, puis propose l'outil reel "Reduire une action" quand Alex demande une aide simple. Le vrai `processMessage` reste desactive par defaut dans le simulateur via fallback manuel, car il timeoute localement et peut continuer a ecrire des effets en arriere-plan.
- preuve : run `alex-improve-1..9`, transcript `/chat` scope `whatsapp` final du 2026-05-06 10:59 UTC; preferences `user_profile_facts` a confidence `1`.
- statut : corrige pour simulation UI / a retester avec `WHATSAPP_WEB_SIM_USE_PROCESS_MESSAGE=1` quand le timeout local du brain est resolu.

## 2026-05-06 - Run Full IA WhatsApp Sim Alex

- contexte : reset WhatsApp Alex, relance opt-in, puis parcours onboarding + peur de lacher + demande d'outil simple + consentement d'execution.
- attendu : tous les tours doivent passer par le vrai brain (`direct_process_message`), sans fallback manuel, sans note interne visible, avec preferences stockees et outil reel execute.
- observe : 19 messages en scope `whatsapp`, `manual_fallback=0`, `timeout_fallback=0`, `fil_rouge visible=0`. Les trois preferences sont stockees (`coach.tone=mix`, `coach.challenge_level=eleve`, `coach.question_tendency=tres_questionnant`). La demande d'outil simple recommande `Reduire une action`, puis le consentement execute `adjust_plan_item` et ecrit un ajustement sur `Préparer ta zone de déchargement` (`duration_minutes=5`, `difficulty=low`).
- qualite : onboarding nettement meilleur qu'en fallback, avec emojis et ton plus naturel. Reste a polir : reponse a "je vais encore lacher" encore un peu diagnostique/froide, et formulation de recommandation outil a surveiller.
- preuve : run `alex-improve-1..9` du 2026-05-06 13:15 UTC; `user_plan_items.id=a6da07a3-55f0-463c-8ed0-c1d5a7f7961e`, `operation_id=9cbe2c76-d7d1-42af-b9e4-3474be76ea01`.
- statut : valide / a ameliorer sur qualite post-onboarding.

## 2026-05-06 - Clarification Execution Reduire Une Action

- contexte : apres consentement "Oui vas-y, utilise-le pour ce soir", Sophia repond "J'ai reduit cette action" sans nommer l'action.
- attendu : la reponse visible doit dire quelle action a ete modifiee et ce qui a change, sinon l'utilisateur ne peut pas verifier l'effet du tool.
- observe : `adjust_plan_item` a bien tourne et a reduit `Préparer ta zone de déchargement` a `duration_minutes=5`, `difficulty=low`. `prepare_attack_card` n'a pas tourne dans ce flow.
- correction : la proposition avant consentement et l'ack apres execution nomment maintenant l'action cible quand elle est disponible.
- preuve : request_id `alex-improve-9`, `operation_id=9cbe2c76-d7d1-42af-b9e4-3474be76ea01`, patch `sophia-brain/router/run.ts`.
- statut : corrige / a retester sur prochain run outil.

## 2026-05-06 - Decision Produit Blocage Action Vs Ajustement Plan

- contexte : Alex est demotive et demande un outil simple pour ne pas decrocher.
- attendu : si le user bloque sur l'execution d'une action, Sophia doit orienter vers `prepare_attack_card` ou clarifier la cible. `adjust_plan_item` doit rester reserve aux demandes explicites de modification structurelle du plan.
- observe : le run precedent utilisait `adjust_plan_item` trop vite et appliquait une reduction de duree sur une mission one-shot, ce qui melangeait "deblocage d'execution" et "edition du plan".
- correction : `recommendation_tool` route maintenant `motivation_repair` vers `attack_card` quand une action cible est resolue, demande clarification si la cible manque, et marque `plan_item.reduce` comme non recommande sans demande explicite de changement structurel. Le router sait maintenant executer une `prepare_attack_card` issue d'une recommandation apres consentement.
- preuve : tests `recommendation_tool.test.ts`, `deno check`; code `recommendation_tool.ts`, `router/run.ts`, `demotivation_repair/skill.ts`.
- statut : corrige / a retester dans `/chat` avec Alex.

## Choses A Retester En Priorite

- Encouragement du soir : Sophia parle-t-elle explicitement du carnet, des ecrans et des 5 minutes ?
- Debrief du lendemain : Sophia verifie-t-elle le sas sans punir l'echec ?
- Plan grounding : Sophia cite-t-elle les bons items actifs au lieu d'inventer une action sommeil generique ?
- Progression : apres 3 completions, l'exercice "Reperer les pieges de l'hypervigilance" devient-il pertinent ?
- Memoire : eviter tout fact durable du type "Alex est insomniaque" ou "Alex est naturellement deregle".
- Recommendation tool : refaire un run propre et verifier que le premier message "outil simple" nomme directement l'outil reel, sans attendre une reformulation explicite.
- Web sim brain path : retester avec `WHATSAPP_WEB_SIM_USE_PROCESS_MESSAGE=1` et verifier que `processMessage` ne timeoute plus avant de considerer le fallback comme inutile.

## Bugs Ou Risques Ouverts

- Emotional repair trop collant : apres une reparation de honte, Sophia peut ignorer la demande concrete suivante.
- `processMessage` appele depuis le simulateur local timeoute avant de produire une reponse; le fallback manuel evite de bloquer `/chat`, mais ne valide pas encore le vrai dispatcher sur ces tours.

## Corrections Appliquees

- 2026-05-06 : `recommendation_tool` branche dans `sophia-brain/router/run.ts` pour les skills conversationnels, catalogue surfaces embarque en TypeScript pour Edge Runtime, `whatsapp-sim-inbound` rendu asynchrone avec polling frontend, polish WhatsApp pour retirer les champs techniques visibles.
- 2026-05-06 : `whatsapp-sim-inbound` stabilise avec onboarding state-machine local, persistance des preferences via intake `update_coach_preferences`, fallback manuel anti-timeout par defaut, et option `WHATSAPP_WEB_SIM_USE_PROCESS_MESSAGE=1` pour rebrancher le vrai brain quand le runtime local est fiable.
- 2026-05-06 : `adjust_plan_item` nomme l'action cible dans la proposition d'outil et dans l'accuse d'execution pour eviter les reponses vagues du type "cette action".
- 2026-05-06 : `motivation_repair` ne recommande plus `adjust_plan_item` par defaut; les blocages d'action passent par `prepare_attack_card` ou clarification de cible.
