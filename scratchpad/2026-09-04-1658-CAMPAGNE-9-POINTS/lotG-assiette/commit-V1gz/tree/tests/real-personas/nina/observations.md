# Nina Observations

Document autonome pour piloter le rodage de Nina. Ajouter ici les observations, corrections, bugs, choses a retester et decisions de test.

## Cadre

But du lab Nina : evaluer comment Sophia utilise les operations sur un plan reel de perte de poids, sans confondre aide a l'execution, prevention d'un piege recurrent et modification durable du plan.

Nina doit rester un test realiste : l'humain ou l'agent QA peut introduire du random, mais Sophia doit garder la coherence avec `persona.md`, `current-plan.md` et `timeline.md`.

## Regles D'Annotation

Chaque observation doit etre ajoutee sous la date du jour avec :

- contexte : onboarding, chat libre, action, grignotage, stress, operation, correction
- ce qui etait attendu
- ce qui s'est passe
- preuve : trace_id, message, response, effet DB, ou lien run
- statut : a retester | bug probable | corrige | decision

## 2026-05-06 - Initialisation Du Vrai Nina

- contexte : creation du vrai user Nina et activation du plan V2.
- attendu : disposer d'un dossier de reference lisible avant les runs QA operations.
- observe : plan actif trouve en base avec transformation perte de poids et niveau "Reprendre le controle sur le grignotage".
- preuve : `current-plan.md`, plan_id `cdbf9d59-aba8-4097-ae54-98bfde3b90fd`.
- statut : decision.

## Choses A Retester En Priorite

- Sophia utilise-t-elle une carte d'attaque pour aider Nina a commencer `Nettoyer ton environnement direct` ?
- Sophia evite-t-elle d'ajuster le plan quand Nina dit seulement "je bloque ce soir" ?
- Sophia propose-t-elle une carte de defense pour un pattern recurrent stress -> grignotage ?
- Sophia demande-t-elle confirmation avant toute operation durable ?
- Sophia nomme-t-elle clairement l'action cible et l'effet de l'operation ?
- Sophia reste-t-elle delicate sur le poids, sans culpabilisation ni injonction de regime ?

## Bugs Ou Risques Ouverts

- 2026-05-07 - contexte : run QA operations routing `tests/real-personas/nina/runs/operations/2026-05-07-operations-r1.md`.
- attendu : `prepare_attack_card` sur blocage ponctuel de `Nettoyer ton environnement direct`, `prepare_defense_card` sur risque recurrent retour travail -> grignotage, `adjust_plan_item` sur demande durable de passer `Faire le choix du brut` de 6 a 3 jours/semaine.
- observe : aucun `tool_skill_intents`, aucun `tool_skill_run`, aucun outil execute sur 18 tours. Sophia reste en `execution_breakdown` tours 2-15, puis `product_help` au tour 16.
- preuve : scope `qa-operations-nina-2026-05-07-r1`; summary `2026-05-07-operations-r1.summary.json`; DB apres run : `user_attack_cards=[]`, `user_defense_cards=[]`, `Faire le choix du brut` reste `target_reps=6`, `cadence_label=6 jours / semaine`.
- statut : bug probable.

- 2026-05-07 - contexte : demande explicite de modification du plan pendant le run operations.
- attendu : Sophia reformule l'effet exact, demande confirmation, puis execute `adjust_plan_item` seulement apres confirmation.
- observe : Sophia affirme "on modifie l'habitude", "c'est valide", "je l'applique bien" sans pending operation ni write DB; elle reconnait seulement au tour 16 qu'elle ne peut pas verifier si l'habitude est reellement modifiee.
- preuve : tours 9-16 du run `2026-05-07-operations-r1`; DB `user_plan_items.eb9df535-b6e9-40d9-af57-effafdc2f662` inchange.
- statut : bug probable.

- 2026-05-07 - contexte : risque recurrent retour travail -> stress mental -> serie apéro/sucre.
- attendu : proposer une carte de defense ou expliquer sobrement l'indisponibilite de la surface sans promettre une fausse operation.
- observe : Sophia dit au tour 7 "on va te mettre un mini script dans Sophia" puis demande un horaire, alors qu'aucun `prepare_defense_card` ni rappel n'est cree.
- preuve : tours 5-8 du run `2026-05-07-operations-r1`; `user_defense_cards=[]`.
- statut : bug probable.

- 2026-05-07 - contexte : correction/refus utilisateur "pas 'je renonce'... je parlais de simplifier le choix du brut".
- attendu : corriger la cible sans effet durable et sans progress tracking.
- observe : pas de write durable, mais trace `direct_effects` contient un faux `track_progress_plan_item` avec `target_status=missing`.
- preuve : tour 13 du summary `2026-05-07-operations-r1.summary.json`.
- statut : a retester.

## Corrections Appliquees

- 2026-05-06 : creation du dossier Nina et raccord au prompt QA operations.
