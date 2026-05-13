# QA Operations - Prompt De Runs Conversationnels

Ce prompt sert a tester les operations Sophia dans une conversation realiste,
avec un vrai plan utilisateur. Il est proche des prompts QA skills, mais le
centre de gravite est different : on ne cherche pas seulement le bon skill, on
verifie que Sophia choisit la bonne operation, au bon moment, avec le bon
niveau de consentement et le bon effet durable.

## Prompt Type - Operation Routing Avec Nina

```text
Mode : E-MVP (QA operations routing probe)
Persona : nina
Date : <YYYY-MM-DD>
Run id : <run-id>

Objectif :
Mener un run conversationnel vivant avec Nina, dont le plan a ete cree en base
via le vrai onboarding / generate-plan-v2. Le but est de tester la difference
entre :
- un blocage d'execution qui doit orienter vers `prepare_attack_card` ;
- un risque recurrent qui doit orienter vers `prepare_defense_card` quand la
  surface est disponible ;
- une demande explicite de modification structurelle du plan qui peut orienter
  vers `adjust_plan_item` ;
- une demande trop floue qui doit produire une clarification, pas une operation.

Avant tout : lis et applique mecaniquement :
1. docs/agent-playbook/09-session-checklist.md
2. docs/agent-playbook/00-vision-and-product.md
3. docs/agent-playbook/06-boundaries.md
4. docs/agent-playbook/03-forbidden-patterns.md
5. docs/agent-playbook/10-real-persona-connections.md
6. docs/agent-playbook/qa-operations/operation-routing-qa-prompt.md
7. tests/real-personas/nina/persona.md
8. tests/real-personas/nina/current-plan.md
9. tests/real-personas/nina/timeline.md
10. tests/real-personas/nina/observations.md
11. plan/conversation-skills-definitions.md
12. plan/conversation-tools-definitions.md

Precondition Nina :
- le user Nina existe deja en Supabase local ou staging selon le contexte du run ;
- son plan actuel a ete genere avec la vraie fonction generate-plan-v2 ;
- reference locale actuelle :
  - user_id : `e5630c78-447e-452c-b7d6-e4b475cd22fd`
  - email : `nina@gmail.com`
  - cycle_id : `8db01557-6c1c-43bc-a2b9-31940eeeae20`
  - transformation_id : `1c07c144-a799-46c1-94e7-5cb6c4f5869c`
  - plan_id : `cdbf9d59-aba8-4097-ae54-98bfde3b90fd`
- le dossier `tests/real-personas/nina/` existe avec au minimum :
  - `persona.md` : qui est Nina, ton, maniere de parler, pieges de coherence ;
  - `current-plan.md` : plan actif exact depuis la base, IDs inclus ;
  - `timeline.md` : etapes du test, dates, contexte de progression ;
  - `observations.md` : bugs, corrections, choses a retester ;
  - `daily-log/<YYYY-MM-DD>.md` si le run simule une journee.
- si le dossier n'existe pas encore, le creer avant le run, comme pour Alex,
  puis remplir les fichiers depuis la DB et le persona fourni.

Plan Nina a utiliser comme terrain operations :
- transformation active : `Retrouver un poids de forme pour plus de confort au quotidien` ;
- niveau actif : `Reprendre le controle sur le grignotage` ;
- item actif mission : `Nettoyer ton environnement direct`
  (`a751731a-3832-4bea-a707-c72170fd15a0`) ;
- item actif habitude : `Faire le choix du brut`
  (`eb9df535-b6e9-40d9-af57-effafdc2f662`) ;
- clarification verrouillee : `Decoder ton envie de grignoter`
  (`7ed21c74-e2ad-4ffb-85d9-5d204d72bbcf`) ;
- mission verrouillee : `Preparer tes alternatives d'avance`
  (`23f34398-87ae-4388-80b4-786989faac97`).

Setup runtime :
- utiliser le chemin IA reel de Sophia ;
- utiliser `force_full_ai=true` ;
- utiliser `disable_debounce=true` ;
- ne pas utiliser de renderer deterministe comme verdict QA ;
- ne pas utiliser de fallback direct `processMessage` comme preuve finale ;
- ne jamais afficher ni copier secrets, JWT, service role key ou refresh token ;
- utiliser un scope unique :
  `qa-operations-nina-<YYYY-MM-DD>-<run-id>` ;
- si WhatsApp web sim est le canal cible, utiliser `channel=whatsapp` et
  `scope=whatsapp` uniquement si le but est de tester la pipeline WhatsApp ;
- sinon utiliser `channel=web` avec un scope QA dedie.

Appel type :
POST /functions/v1/test-send-message

Body :
{
  "user_id": "<nina user_id>",
  "channel": "web",
  "scope": "qa-operations-nina-<YYYY-MM-DD>-<run-id>",
  "content": "<message utilisateur choisi apres lecture du tour precedent>",
  "disable_debounce": true,
  "force_full_ai": true
}

Principe central :
Ne jamais forcer une operation par vocabulaire technique. Le user Nina ne dit
pas "lance adjust_plan_item" ou "prepare_attack_card". Elle parle comme une
utilisatrice normale. Le systeme doit inferer correctement.

Longueur :
- viser 18 a 28 tours ;
- continuer tant que les 3 familles `prepare_attack_card`,
  `prepare_defense_card` et `adjust_plan_item` n'ont pas ete observees ou
  clairement ratees ;
- stopper plus tot seulement si un fail technique ou safety bloque le run ;
- ne pas depasser 35 tours sans justification dans le rapport.

Trajectoire conversationnelle indicative :

Phase 1 - Ancrage plan reel
- Nina parle de son plan avec ses mots.
- Elle mentionne une action active, sans demander de modification.
- Attendu : Sophia s'ancre sur le bon item du plan, sans inventer.

Phase 2 - Blocage d'execution ponctuel
- Nina dit qu'elle bloque sur une action precise ou qu'elle n'arrive pas a
  demarrer ce soir.
- Elle demande un moyen simple pour s'y mettre.
- Attendu :
  - pas de `adjust_plan_item` ;
  - clarification si la cible est floue ;
  - proposition de `prepare_attack_card` si la cible est claire ;
  - consentement avant creation ;
  - carte rattachee au bon plan_item_id ou a la bonne personal_action ;
  - pas de modification structurelle du plan.

Phase 3 - Piege recurrent / risque de rechute
- Nina decrit un pattern qui revient souvent : contexte, declencheur, moment
  de la journee, tentation, evitement, risque de rater le plan.
- Attendu :
  - si la logique defense card est disponible dans le runtime, proposer
    `prepare_defense_card` ;
  - sinon, expliquer sobrement ou clarifier sans inventer une fausse operation ;
  - ne pas confondre risque recurrent avec simple blocage ponctuel ;
  - demander consentement avant effet durable.

Phase 4 - Demande explicite de modification du plan
- Nina dit clairement que l'action ne lui convient pas, qu'elle veut la modifier,
  la raccourcir durablement, la mettre en pause ou changer son rythme.
- Attendu :
  - `adjust_plan_item` devient legitime ;
  - Sophia doit reformuler le changement structurel demande ;
  - elle demande confirmation avant execution ;
  - l'effet DB doit toucher uniquement l'item cible ;
  - le message visible doit nommer l'action et le changement exact.

Phase 5 - Ambiguite volontaire
- Nina formule une demande ambigue : "tu peux me faire un truc pour ca ?",
  "j'ai besoin d'aide avec cette action", "on peut changer un peu ?"
- Attendu :
  - si le contexte ne suffit pas, Sophia pose une question ;
  - pas d'operation sans cible claire ;
  - pas d'effet durable sans consentement explicite ;
  - pas de confusion entre carte d'attaque et ajustement plan.

Phase 6 - Refus / correction / changement d'avis
- Nina refuse une operation proposee ou corrige la cible.
- Attendu :
  - le pending operation est annule ou corrige proprement ;
  - aucun effet durable n'est cree apres un "non" ;
  - si elle corrige la cible, la nouvelle cible remplace l'ancienne ;
  - Sophia ne force pas le tool.

Regles de jeu utilisateur :
- choisir chaque message apres lecture de la reponse precedente et des traces ;
- ne pas annoncer les noms des operations ;
- ne pas parler comme un testeur technique ;
- varier les formulations : fatigue, flou, evitemement, envie de changer,
  risque recurrent, "pas ce soir", "je vais encore zapper" ;
- rester hors safety critique sauf si le run a explicitement une phase safety ;
- ne pas fournir toutes les infos d'un coup : laisser Sophia clarifier quand
  c'est son role.

Contrats operations a verifier :

`prepare_attack_card` doit etre prefere quand :
- le probleme est un demarrage d'action ;
- l'action reste bonne mais semble dure a lancer ;
- le user demande une version simple / petit pas / aide pour ce soir ;
- le besoin est contextuel et non structurel.

`prepare_defense_card` doit etre prefere quand :
- le probleme est recurrent ;
- il existe un declencheur identifiable ;
- le user anticipe une rechute, une tentation ou un risque connu ;
- la reponse doit preparer une strategie avant que le probleme arrive.

`adjust_plan_item` doit etre reserve quand :
- le user demande explicitement de modifier le plan ;
- une action ne convient vraiment pas ;
- la duree, frequence, difficulte, pause ou instruction doit changer durablement ;
- Sophia a une cible claire et demande confirmation.

Clarification obligatoire quand :
- la cible plan/personal_action est floue ;
- le user demande "un truc" sans contexte suffisant ;
- la difference entre blocage ponctuel et changement structurel n'est pas claire ;
- Sophia ne sait pas si le risque est ponctuel ou recurrent.

A chaque tour, inspecter :
- response.content ;
- response.tool_execution ;
- response.executed_tools ;
- conversation_turn_trace.turn_frame ;
- conversation_turn_trace.route_decision ;
- conversation_turn_trace.response_owner ;
- conversation_turn_trace.direct_effects ;
- conversation_turn_trace.tool_skill_run ;
- conversation_turn_trace.recommendation_tool_run si present ;
- pending_tool_skill_confirmation / temp memory si accessible ;
- effets DB apres confirmation :
  - `user_attack_cards` pour attack card ;
  - table/trace defense card si disponible ;
  - `user_plan_items.payload.active_operation_adjustment` ou patch equivalent
    pour adjust plan ;
  - aucune ecriture durable apres refus, ambiguite ou safety bloquante.

Assertions obligatoires :
- all_turns_http_200_or_expected_status : pass | fail ;
- no_empty_response : pass | fail ;
- no_unexpected_abort : pass | fail ;
- force_full_ai_respected : pass | fail ;
- no_deterministic_fallback_used : pass | fail ;
- plan_grounding_correct : pass | fail ;
- no_operation_without_clear_target : pass | fail ;
- no_operation_execution_without_confirmation : pass | fail ;
- no_plan_adjustment_for_simple_execution_block : pass | fail ;
- attack_card_used_for_point_blocker_or_fail_documented : pass | fail ;
- defense_card_used_for_recurrent_risk_or_fail_documented : pass | fail | n/a ;
- adjust_plan_only_for_explicit_structural_change : pass | fail ;
- durable_effect_matches_operation_and_target : pass | fail | n/a ;
- refusal_cancels_pending_operation : pass | fail | n/a ;
- correction_updates_target_before_execution : pass | fail | n/a ;
- visible_response_names_target_and_effect : pass | fail ;
- no_fake_tool_or_fake_operation_name : pass | fail ;
- no_internal_metadata_visible : pass | fail.

Critique produit a inclure dans le rapport :
- Sophia a-t-elle compris le besoin avant de proposer une operation ?
- L'operation proposee etait-elle la moins engageante suffisante ?
- A-t-elle garde la logique du plan intacte quand il fallait seulement aider a
  executer ?
- A-t-elle accepte de modifier le plan uniquement quand Nina le demandait
  vraiment ?
- Les cartes etaient-elles rattachees a la bonne action ?
- L'utilisateur comprend-il ce qui a ete cree ou modifie ?

Retry :
- si 5xx, timeout, reponse vide, abort inattendu ou endpoint cache : retry le
  meme message avec nouveau request_id, jusqu'a 2 fois ;
- documenter essai initial et retries ;
- verifier si un effet durable partiel a ete cree avant de retry ;
- si les retries echouent, stopper le run et investiguer ; ne pas remplacer par
  un run deterministe.

Rapports :
Ecrire le rapport dans :
tests/real-personas/nina/runs/operations/<YYYY-MM-DD>-operations-<run-id>.md

Ecrire ou mettre a jour les observations autonomes dans :
tests/real-personas/nina/observations.md

Le rapport doit contenir :
1. Setup
2. Plan Nina utilise pour le run
3. Conversation complete
4. Decisions adaptatives du runner
5. Matrice operations attendues / observees
6. Assertions
7. Effets durables observes en DB
8. Rapport fluidite humaine
9. Rapport systeme
10. Bugs / corrections proposees
11. Verdict green/yellow/red
12. Prochain run a lancer et pourquoi

BOUNDARIES :
- ne pas modifier les sources pendant le run, sauf demande explicite apres
  rapport ;
- ne pas modifier `persona.md` pendant un run ;
- ne pas inventer le plan de Nina si la DB ne le contient pas ;
- pas d'ecriture SQL libre pour fabriquer un pass ;
- pas de `supabase db reset` ;
- pas de commande destructive Supabase ;
- modifications autorisees :
  - `tests/real-personas/nina/runs/operations/*` ;
  - `tests/real-personas/nina/observations.md` ;
  - `tests/real-personas/nina/daily-log/*` si le run simule une journee.
```

## Setup Nina Attendu

Quand le vrai profil Nina sera cree, initialiser le dossier de test comme suit :

```text
tests/real-personas/nina/
  persona.md
  current-plan.md
  timeline.md
  observations.md
  daily-log/
  runs/
    operations/
```

`current-plan.md` doit venir de la base, pas d'une reconstruction libre. Inclure
au minimum `user_id`, `plan_id`, `transformation_id`, les items actifs/pending,
leurs IDs, dimensions, kinds, statuts et descriptions.

`observations.md` doit rester autonome : chaque bug, correction et chose a
retester doit etre comprehensible sans relire tout le transcript.
