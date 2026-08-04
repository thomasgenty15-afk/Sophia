# 2026-06-08 - State Potion Other Flows Global R1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `state-potion-rappel-global-20260608-r2`, `state-potion-courage-global-20260608-r1`, `state-potion-guerison-global-20260608-r1`, `state-potion-apaisement-global-20260608-r1`
- Persona: utilisateurs QA temporaires dedies, scopes par run, nettoyage cible apres run.
- Objectif: tester les quatre flows potion restants hors Amour et Clarte, en entrant par le dispatcher global puis `select_state_potion`.
- Trajectoire: demande vague de potion -> clarification de potion -> sous-skill local -> handoff plateforme -> repeat handoff -> apply_attempt non-mutant.
- Surfaces visees: dispatcher global, `select_state_potion`, sous-skills Rappel/Courage/Guerison/Apaisement, local dispatcher, reducers, renderer handoff, no-mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback direct `processMessage`, aucune correction de code pendant les runs.
- Validite QA: valide. Deux incidents techniques 401 lies a des tokens de runner mal saisis ont ete documentes; les tours utiles ont ete repris via le meme chemin IA reel.

## 2. Tours De Conversation

### Rappel - Tour 1

**Verdict du tour:** green

**User**
> J'aimerais bien avoir une potion, mais je ne sais pas laquelle. Je sais que je veux ouvrir mon carnet le matin, mais je laisse filer et je repousse apres le cafe.

**Sophia**
> C'est souvent le moment le plus delicat, quand l'envie est la mais que le temps s'echappe apres le cafe. Est-ce que tu sens que tu as surtout besoin d'un coup de pouce pour ne pas laisser filer ton intention, ou est-ce qu'il y a une petite pointe d'apprehension qui te fait reculer devant ton carnet ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `normal_reply_default`
- operation: `status=clarifying`, `reason_code=state_potion_handoff_clarifying`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

### Rappel - Tour 2

**Verdict du tour:** green

**User**
> C'est surtout ne pas laisser filer mon intention d'ouvrir le carnet avant le cafe.

**Sophia**
> C'est exactement la que la Potion anti-decrochage intervient : elle est faite pour ces moments ou l'elan s'etire et finit par nous echapper. Pour l'utiliser, rends-toi dans la section Etat / Potions de ton espace. Tu pourras y renseigner ces elements : Par rapport a quoi tu sens que tu decroches ? : ouvrir le carnet avant le cafe et Tu decroches plutot comment ? : Je laisse filer. Ca t'aidera a rester ancre dans ton intention des le reveil ! 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.rappel`
- route_reason: `active_select_state_potion_local_dispatcher`
- operation: `status=handoff_delivered`, `reason_code=rappel_handoff_delivered`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

### Rappel - Tour 3

**Verdict du tour:** green

**User**
> Redis-moi juste quoi mettre dans la plateforme.

**Sophia**
> Pas de souci ! Pour configurer ta Potion anti-decrochage, rends-toi dans la section Etat / Potions de ton espace. Voici les elements a saisir : pour la question 'Par rapport a quoi tu sens que tu decroches ?', tu peux inscrire 'ouvrir le carnet avant le cafe'. Et pour 'Tu decroches plutot comment ?', selectionne 'Je laisse filer'. Ca te permettra de bien ancrer ton intention ! 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.rappel`
- route_reason: `active_rappel_local_dispatcher`
- operation: `status=repeat_handoff`, `reason_code=rappel_repeat_handoff`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

### Rappel - Tour 4

**Verdict du tour:** green

**User**
> Ok active-la.

**Sophia**
> J'aimerais beaucoup pouvoir le faire pour toi, mais je ne peux pas activer de potion directement depuis notre discussion. Pour lancer ta Potion anti-decrochage, il te suffit de te rendre dans la section Etat / Potions de ton espace. Une fois la-bas, tu pourras saisir ces elements : pour la question 'Par rapport a quoi tu sens que tu decroches ?', indique 'ouvrir le carnet avant le cafe', et pour 'Tu decroches plutot comment ?', selectionne 'Je laisse filer'. C'est ce qui permettra a la potion de bien t'epauler dans ta routine matinale ! 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.rappel`
- route_reason: `active_rappel_local_dispatcher`
- operation: `status=apply_attempt`, `reason_code=rappel_apply_attempt_no_chat_execution`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

### Courage - Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> J'aimerais bien avoir une potion, mais je ne sais pas laquelle. Je dois envoyer un message important, mais je l'evite parce que j'ai peur de la reaction.

**Sophia**
> Ah merde, je vois le piege : tu "dois" envoyer un message important, mais ta tete part direct sur "et si la reaction me detruisait ?" 😕 On va faire simple et efficace. Pour la "potion", je te propose un choix rapide (aucune magie, juste le bon levier) : 1) Potion Apaisement : si ta peur te paralyse / te fait procrastiner. 2) Potion Courage-Action : si tu sais quoi dire, mais tu bloques au moment d'appuyer "envoyer". 3) Potion Cadre & Message : si ton probleme c'est plutot la formulation...

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- operation: none
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: demande explicite de potion non rout ee vers `select_state_potion`; la reponse invente des noms non canoniques comme `Potion Courage-Action` et `Potion Cadre & Message`.
- Source amont probable: arbitration dispatcher global / route policy `select_state_potion` sur demande vague de potion avec contexte courage.
- Owner runtime: dispatcher global et garde normal_reply produit.
- Meilleure correction selon les guidelines: renforcer l'intention potion globale vers `select_state_potion` quand le user demande une potion sans savoir laquelle, et interdire a `normal_reply` d'inventer une nomenclature produit.
- Pourquoi ce n'est pas un patch local: le sous-skill Courage fonctionne une fois selectionne; le bug est en amont, avant entree dans le skill.

### Courage - Tour 2

**Verdict du tour:** green

**User**
> Je choisis la potion de courage : je sais quoi dire, mais je bloque au moment d'envoyer.

**Sophia**
> On part sur la Potion de courage alors, pour t'aider a franchir ce cap et enfin cliquer sur envoyer. Pour que ce soit vraiment efficace, ce message que tu evites, il est destine a qui ou il porte sur quoi ? ✍️

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.courage`
- route_reason: `tool_skill_intent_start`
- operation: `status=clarifying`, `reason_code=courage_field_needs_more_detail`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

### Courage - Tour 3

**Verdict du tour:** green

**User**
> C'est a mon associe, pour lui dire que je ne pourrai pas tenir le delai annonce et j'ai peur de sa reaction.

**Sophia**
> Je comprends, c'est toujours delicat d'annoncer un retard, surtout quand on redoute la reaction en face. Ta Potion de courage est prete pour t'aider a franchir ce cap. Tu peux aller la chercher dans la section Etat / Potions. Voici les elements que j'ai prepares pour toi : Qu'est-ce que tu evites en ce moment ? : Envoyer un message a mon associe pour lui dire que je ne pourrai pas tenir le delai annonce Qu'est-ce qui bloque le plus ? : La peur du resultat...

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.courage`
- route_reason: `active_courage_local_dispatcher`
- operation: `status=handoff_delivered`, `reason_code=courage_handoff_delivered`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

### Courage - Tour 4

**Verdict du tour:** green

**User**
> Redis-moi juste quoi mettre dans la plateforme.

**Sophia**
> Pas de souci, voici les infos a copier dans la section Etat / Potions pour ta Potion de courage : Qu'est-ce que tu evites en ce moment ? : Envoyer un message a mon associe pour lui dire que je ne pourrai pas tenir le delai annonce Qu'est-ce qui bloque le plus ? : La peur du resultat...

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.courage`
- route_reason: `active_courage_local_dispatcher`
- operation: `status=repeat_handoff`, `reason_code=courage_repeat_handoff`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

### Courage - Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> Ok active-la.

**Sophia**
> [reponse vide]

**Trace courte**
- http_status: 401
- response_owner: null
- selected_handler: null
- route_reason: null
- operation: none
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: echec HTTP 401 avant Sophia, lie a une saisie incorrecte du token de runner.
- Source amont probable: runner QA local, pas runtime Sophia.
- Owner runtime: test harness.
- Meilleure correction selon les guidelines: ne pas utiliser ce tour pour juger Sophia; reprendre le meme message avec authentification correcte et documenter l'incident.
- Pourquoi ce n'est pas un patch local: incident de test, non reproductible apres correction du token.

### Courage - Tour 6

**Verdict du tour:** green

**User**
> Ok active-la.

**Sophia**
> J'aimerais beaucoup pouvoir le faire pour toi, mais je ne peux pas lancer la potion directement depuis notre discussion. 😌 Pour l'activer, il faut que tu te rendes dans la section Etat / Potions de ton espace. Une fois la-bas, choisis la Potion de courage et reporte ces informations : Qu'est-ce que tu evites en ce moment ? : Envoyer un message a mon associe pour lui dire que je ne pourrai pas tenir le delai annonce Qu'est-ce qui bloque le plus ? : La peur du resultat...

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.courage`
- route_reason: `active_courage_local_dispatcher`
- operation: `status=apply_attempt`, `reason_code=courage_apply_attempt_no_chat_execution`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

### Guerison - Tour 1

**Verdict du tour:** green

**User**
> J'aimerais bien avoir une potion, mais je ne sais pas laquelle. Hier j'ai craque et abandonne mon engagement, et depuis je m'en veux beaucoup, avec pas mal de honte.

**Sophia**
> C'est pesant de porter cette honte apres avoir mis de cote ton engagement hier. Pour t'aider a rebondir, est-ce que tu preferes qu'on travaille a apaiser cette culpabilite pour repartir sur des bases saines, ou as-tu surtout besoin de retrouver un peu de douceur et de bienveillance envers toi-meme ? ✨

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `orientation_clarification_resolved_tool_skill`
- operation: `status=clarifying`, `reason_code=state_potion_handoff_clarifying`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

### Guerison - Tour 2

**Verdict du tour:** green

**User**
> Je veux surtout apaiser la culpabilite et repartir proprement, donc plutot une potion de guerison.

**Sophia**
> La Potion de guerison est tout a fait adaptee pour transformer cette culpabilite en un nouveau depart. Pour bien cibler le soin, est-ce que tu pourrais m'en dire un peu plus sur ce qui s'est passe hier ou sur la nature de cet engagement ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.guerison`
- route_reason: `active_select_state_potion_local_dispatcher`
- operation: `status=clarifying`, `reason_code=guerison_field_needs_more_detail`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

### Guerison - Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-05` - Semantique composite aplatie

**User**
> J'avais promis de faire une seance de sport apres le travail, mais je suis rentre vide et j'ai tout laisse tomber. Depuis je ressens surtout de la honte.

**Sophia**
> C'est tout a fait humain de se sentir vide apres une longue journee, et cette Potion de guerison va t'aider a apaiser cette honte pour repartir plus sereinement. Tu peux la retrouver dans la section Etat / Potions de la plateforme en utilisant ces precisions : Qu'est-ce qui t'a fait mal ou t'a fait retomber recemment ? J'avais promis de faire une seance de sport apres le travail, mais je suis rentre vide et j'ai tout laisse tomber. Tu ressens surtout quoi ? De la culpabilite 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.guerison`
- route_reason: `active_guerison_local_dispatcher`
- operation: `status=handoff_delivered`, `reason_code=guerison_handoff_delivered`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le rendu reconnait la honte dans le texte, mais le champ plateforme `Tu ressens surtout quoi ?` est rempli avec `De la culpabilite`.
- Source amont probable: selection canonique du champ `dominant_feeling` dans le sous-skill Guerison; l'ancien contexte `culpabilite` domine le dernier signal explicite `surtout de la honte`.
- Owner runtime: `select_state_potion.guerison` local intake / merge de champs.
- Meilleure correction selon les guidelines: prioriser la reponse courante explicite pour les champs fermes, surtout quand le user utilise `surtout`, et ajouter une regle de precedence semantique dans l'intake structure, pas une regex de phrase visible.
- Pourquoi ce n'est pas un patch local: repeat/apply_attempt repetent le meme champ faux; la source est l'etat structure, pas le renderer.

### Guerison - Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-05` - Semantique composite aplatie

**User**
> Redis-moi juste quoi mettre dans la plateforme.

**Sophia**
> Bien sur, voici les elements a reporter dans la section Etat / Potions pour ta Potion de guerison : Pour la question "Qu'est-ce qui t'a fait mal ou t'a fait retomber recemment ?", tu peux ecrire : J'avais promis de faire une seance de sport apres le travail, mais je suis rentre vide et j'ai tout laisse tomber. Et pour "Tu ressens surtout quoi ?", choisis : De la culpabilite...

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.guerison`
- route_reason: `active_guerison_local_dispatcher`
- operation: `status=repeat_handoff`, `reason_code=guerison_repeat_handoff`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: repeat_handoff repete le mauvais champ `De la culpabilite`.
- Source amont probable: etat handoff deja pollue au tour precedent.
- Owner runtime: `select_state_potion.guerison` state / renderer.
- Meilleure correction selon les guidelines: corriger le champ source et couvrir repeat_handoff par invariant.
- Pourquoi ce n'est pas un patch local: le renderer repete fidelement l'etat; changer le wording cacherait l'erreur.

### Guerison - Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-05` - Semantique composite aplatie

**User**
> Ok active-la.

**Sophia**
> Je ne peux pas lancer la potion directement depuis notre discussion, mais tu peux le faire en un instant dans la section Etat / Potions de la plateforme. Il te suffit de selectionner la Potion de guerison et d'y copier ces elements : Pour "Qu'est-ce qui t'a fait mal ou t'a fait retomber recemment ?" : J'avais promis de faire une seance de sport apres le travail, mais je suis rentre vide et j'ai tout laisse tomber. Pour "Tu ressens surtout quoi ?" : De la culpabilite...

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.guerison`
- route_reason: `active_guerison_local_dispatcher`
- operation: `status=apply_attempt`, `reason_code=guerison_apply_attempt_no_chat_execution`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: apply_attempt reste non-mutant, mais repete le mauvais champ.
- Source amont probable: handoff state pollue.
- Owner runtime: `select_state_potion.guerison` state / renderer.
- Meilleure correction selon les guidelines: le champ `dominant_feeling` doit etre corrige avant livraison du handoff; apply_attempt doit simplement repeter les champs locked exacts.
- Pourquoi ce n'est pas un patch local: le comportement no-mutation est bon, l'erreur est la valeur de champ.

### Apaisement - Tour 1

**Verdict du tour:** green

**User**
> J'aimerais bien avoir une potion, mais je ne sais pas laquelle. La je suis sous pression avec trop de decisions a prendre et je me sens completement submerge.

**Sophia**
> C'est vrai que quand on est submerge par les decisions, on finit par se sentir etouffe. Est-ce que tu as surtout besoin d'un moment pour relacher cette pression et souffler, ou d'un coup de pouce pour y voir plus clair dans tes choix ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- operation: `status=clarifying`, `reason_code=state_potion_handoff_clarifying`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

### Apaisement - Tour 2

**Verdict du tour:** green

**User**
> J'ai surtout besoin de relacher la pression et de souffler, donc une potion d'apaisement.

**Sophia**
> C'est une excellente idee, la Potion d'apaisement est parfaite pour t'aider a souffler un peu. Tu peux la retrouver dans la section Etat / Potions de la plateforme. Voici les elements que nous avons identifies ensemble : Qu'est-ce qui te met le plus sous pression la ? : trop de decisions a prendre Tu te sens plutot comment ? : Submerge...

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.apaisement`
- route_reason: `active_select_state_potion_local_dispatcher`
- operation: `status=handoff_delivered`, `reason_code=apaisement_handoff_delivered`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

### Apaisement - Tour 3

**Verdict du tour:** green

**User**
> Redis-moi juste quoi mettre dans la plateforme.

**Sophia**
> Pas de souci, voici les informations a saisir dans la section Etat / Potions pour ta Potion d'apaisement : Qu'est-ce qui te met le plus sous pression la ? : trop de decisions a prendre Tu te sens plutot comment ? : Submerge...

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.apaisement`
- route_reason: `active_apaisement_local_dispatcher`
- operation: `status=repeat_handoff`, `reason_code=apaisement_repeat_handoff`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

### Apaisement - Tour 4

**Verdict du tour:** green

**User**
> Ok active-la.

**Sophia**
> Je ne peux pas activer la potion directement d'ici, mais tu peux le faire tres facilement dans la section Etat / Potions de la plateforme. Voici les informations exactes a saisir pour ta Potion d'apaisement : Qu'est-ce qui te met le plus sous pression la ? : trop de decisions a prendre Tu te sens plutot comment ? : Submerge...

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.apaisement`
- route_reason: `active_apaisement_local_dispatcher`
- operation: `status=apply_attempt`, `reason_code=apaisement_apply_attempt_no_chat_execution`
- pending_confirmation: null
- executed_tools: []
- durable_effect: aucun

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Rappel et Apaisement passent naturellement par une clarification globale, selectionnent le bon sous-skill, livrent les champs plateforme, puis capturent `redis-moi` et `ok active-la`.
- Les sous-skills Courage et Guerison restent non-mutants apres handoff; aucun `ok active-la` ne cree de potion depuis le chat.
- La question de detail Courage au tour 2 est pertinente: le user avait donne une intention claire mais pas assez de contexte pour un champ efficace.

**Problemes**
- Courage T1: Sophia ne passe pas par `select_state_potion`, invente des potions non canoniques, et force le user a choisir dans une liste hors contrat. Famille: `BF-ROUTE-01`. Impact: l'utilisateur peut apprendre une mauvaise nomenclature produit. Severite: red.
- Guerison T3-T5: Sophia comprend verbalement la honte mais remplit le champ plateforme avec culpabilite. Famille: `BF-INTAKE-05`. Impact: le user risque de renseigner une potion moins adaptee que ce qu'il a explicitement dit. Severite: red.

**Fix propose**
- Source amont: dispatcher global pour Courage; intake/merge du champ ferme `dominant_feeling` pour Guerison.
- Correction recommandee: router toute demande `j'aimerais une potion mais je ne sais pas laquelle` vers `select_state_potion`, meme quand le contexte pointe fortement vers Courage; pour Guerison, prioriser le dernier signal explicite de champ ferme dans le message courant.
- Tests d'invariant attendus: vague potion + peur d'envoyer un message -> `select_state_potion` clarifying; `surtout de la honte` apres contexte culpabilite -> champ plateforme honte; repeat/apply_attempt repetent la valeur corrigee.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Rappel, Guerison et Apaisement entrent correctement par `select_state_potion` au premier tour.
- Courage T1 reste `response_owner=normal_reply`, `selected_handler=null`, `route_reason=normal_reply_default`, alors que l'intention potion globale etait explicite. C'est le principal bug systeme.
- Rappel T1 a un warning de trace: `response_owner=tool_skill` et `selected_handler=select_state_potion`, mais `route_reason=normal_reply_default`. Le visible est bon, mais la trace est ambigue.

**Skills / Operations / Tools**
- Les sous-skills actifs capturent correctement `Redis-moi juste quoi mettre dans la plateforme` comme `repeat_handoff`.
- Tous les `Ok active-la` valides produisent `apply_attempt_*_no_chat_execution`; aucun chemin executable n'est declenche.
- Courage a un incident QA technique T5 en HTTP 401, repris au T6 avec succes.

**Memory / Effets durables**
- Pour les quatre runs valides, `executed_tools=[]`, `committed_effects=[]`, `pending_confirmation=null`.
- Dumps durables: `user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`.
- Nettoyage des utilisateurs QA temporaires effectue.

**Problemes**
- Courage T1: mauvais owner global. Famille: `BF-ROUTE-01`. Impact systeme: le contrat `select_state_potion` est contourne. Severite: red.
- Guerison T3-T5: champ ferme pollue par contexte precedent. Famille: `BF-INTAKE-05`. Impact systeme: le handoff state stocke une valeur non alignee avec le dernier message utilisateur. Severite: red.
- Rappel T1: route_reason incoherent avec owner/handler. Famille: `BF-TEST-01`. Impact systeme: warning trace, non bloquant pour l'experience. Severite: yellow.

**Fix propose**
- Source amont: dispatcher global, local intake Guerison, trace mapping.
- Correction recommandee: route policy globale potion avant normal_reply; precedence du message courant dans les field patches; aligner `route_reason` quand `selected_handler=select_state_potion`.
- Tests d'invariant attendus: un test global par potion restante, avec entree vague; un test Guerison avec conflit culpabilite/honte; un test de trace `tool_skill + select_state_potion` sans `normal_reply_default`.

## Verdict Global

- Verdict: red
- Raison principale: Courage ne route pas au bon owner au premier tour global, et Guerison livre un champ plateforme faux malgre une evidence utilisateur explicite.
- Follow-up prioritaire: corriger le routage global potion vers `select_state_potion`, puis la precedence d'extraction du champ `dominant_feeling` dans `select_state_potion.guerison`.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-08-state-potion-other-flows-global-r1-bugs.md`
