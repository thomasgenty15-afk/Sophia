# Global Run A9 - Normal Conversation 15T - N3 Strict R1

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global_run_A9_20260528_n3_strict_r1`
- Persona: user QA temporaire local `b74eb048-88be-403e-bc0e-fe1a4abab256`, cree via Auth local (`qa-normal-global_run_A9_20260528_n3_strict_r1-1779994433672@example.com`).
- Objectif: relancer le test global A1 apres nouvelles corrections pour verifier la synchronicite entre skills conversationnels et tool skills.
- Trajectoire: matinee brouillee -> micro-action Lea -> carte d'attaque -> rappel ponctuel -> aide produit -> preference coach -> memoire conversationnelle -> honte / soutien doux -> verification durable -> recap final.
- Surfaces visees: `execution_breakdown`, `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, memoire conversationnelle, `update_coach_preferences`, `emotional_repair`, no-tool guards, `select_state_potion` en opportunite/proposition non executee.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, `SOPHIA_CLIENT_NOW_ISO=2026-05-28T10:00:00.000+02:00`, aucun fallback deterministe.
- Validite QA: valide. Les 15 messages ont ete choisis tour par tour apres lecture de la reponse Sophia et de la trace courte precedente. Aucun message fixe pre-scripted n'a ete rejoue. Aucun code n'a ete modifie pendant le run. Nettoyage cible effectue et verifie apres le run.

## 2. Tours De Conversation

### Tour 1

**User**
> Salut Sophia. Je commence avec une matinee brouillee: un mail a Lea a finir, un paiement a verifier, et une envie tres forte de trier mes notes avant de repondre. Je veux sauver le prochain quart d'heure.

**Sophia**
> Ok, on sauve ce quart d'heure. Tu fais juste ca, dans cet ordre: ouvrir le mail a Lea et ecrire 2-3 phrases max, verifier seulement le statut du paiement, puis trier 5 minutes chrono uniquement ce qui sert aux reponses mails. Elle demande si le mail doit etre rapide ou plus complet.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- safety: `low`
- opportunity: `attack_card` / `prepare_attack_card`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 2

**User**
> Rapide reponse. Prepare une carte d'attaque complete. Action: envoyer deux phrases a Lea avant de trier mes notes. Piege: transformer le tri en preparation infinie. Signal visuel: le carnet bleu ferme. Phrase: carnet bleu ferme = deux phrases a Lea, pas de tri.

**Sophia**
> Voici ton brouillon :
> *Action Lea vs Tri* (Ancre visuelle)
> "Carnet bleu ferme = deux phrases a Lea, pas de tri."
> Place l'ancre dans ton environnement et utilise-la comme signal de depart.
> Je l'enregistre pour toi ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- safety: `low`
- tool_skill_intents: [`prepare_attack_card`]
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: aucun avant confirmation

### Tour 3

**User**
> Oui, enregistre cette carte maintenant.

**Sophia**
> C'est fait. J'ai cree cette carte d'attaque :
>
> Action Lea vs Tri
> Technique : Ancre visuelle
> Carnet bleu ferme = deux phrases a Lea, pas de tri.
>
> Mode d'emploi : Place l'ancre dans ton environnement et utilise-la comme signal de depart.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `immediate_mode_request_not_execution_breakdown`
- safety: `low`
- tool_execution: `success`
- executed_tools: [`prepare_attack_card`]
- durable_effect: carte creee, id `e0d50519-e529-4b41-b476-5c91d3dcb41a`, titre `Action Lea vs Tri`, technique `ancre_visuelle`, asset `Carnet bleu ferme = deux phrases a Lea, pas de tri.`

### Tour 4

**User**
> Mail a Lea envoye en version courte. Programme-moi un rappel aujourd'hui a 18h05: verifier si Lea a repondu, sans replonger dans mes notes.

**Sophia**
> C'est programme pour jeudi 28 mai a 18:05 : verifier si Lea a repondu, sans replonger dans mes notes. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_one_shot_reminder_priority`
- safety: `none`
- direct_effects: [`create_one_shot_reminder`]
- tool_execution: `success`
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: rappel cree, id `c3c3e97b-1536-43b8-9d98-331aa4bedebe`, `scheduled_for=2026-05-28T16:05:00+00:00` soit 18:05 Europe/Paris, status `pending`.

### Tour 5

**User**
> Question produit: si je veux annuler ce rappel plus tard, je le retrouve ou dans Sophia ?

**Sophia**
> Le rappel ponctuel que je t'ai programme se gere cote Initiatives, dans les rappels cote chat pour ce type-la. Pour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 6

**User**
> Preference durable de coaching: quand je dis que je vais trier mes notes avant un mail, pose une seule question de tri, puis donne une seule action concrete de moins de deux minutes. Demande ma confirmation avant de l'enregistrer.

**Sophia**
> Bien recu. Pour la suite, je te proposerai une seule action concrete a la fois, avec moins de questions/options quand tu es vide ou bloque. Si c'est bien ca, je le garde comme preference. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- safety: `low`
- skill_entry_ids: [`execution_breakdown`, `product_help`]
- tool_skill_intents: [`update_coach_preferences`]
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: aucun avant confirmation

### Tour 7

**User**
> Oui, enregistre cette preference.

**Sophia**
> C'est fait. J'ai applique cette preference : je te proposerai une seule action concrete a la fois, avec moins de questions/options quand tu es vide ou bloque. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- tool_execution: `success`
- executed_tools: [`update_coach_preferences`]
- durable_effect: `coach.question_tendency=low`, source `explicit_user`, raison gardant le texte original de la demande.

### Tour 8

**User**
> Je reviens au fil: qu'est-ce que tu as retenu sur le carnet bleu ferme et mon envie de trier mes notes ?

**Sophia**
> J'ai retenu 2 trucs: le signal "carnet bleu ferme" signifie deux phrases a Lea, pas de tri tant que ces deux phrases ne sont pas envoyees; et le tri des notes devait rester cadre a 5 minutes seulement pour ce qui sert aux mails.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_recap_request_priority`
- safety: `low`
- skill_entry_ids: [`product_help`]
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 9

**User**
> Applique cette preference maintenant: je vois le carnet bleu ferme, j'ai envie de trier mes notes, et j'ai honte que mon mail a Lea soit trop sec. Une seule question de tri puis une seule action courte.

**Sophia**
> Ok, je te recadre direct : carnet bleu ferme = deux phrases a Lea, pas de tri. Elle nomme le piege "tri infini", reconnait la honte, puis pose une seule question de tri: choisir entre "excuse + clarification" ou "remercier + relancer".

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 10

**User**
> Remercier + relancer. Et la honte monte encore. Si tu vois un outil doux pour redescendre, propose-le, mais ne lance rien sans mon oui.

**Sophia**
> Ok, je te recadre : on ne relance rien tant que la honte est en train de monter. La on fait d'abord redescendre ton corps. Pour un outil doux de stabilisation, je te propose "exercice emotional_repair". Tu veux que je l'utilise (oui/non) ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_conversation_skill_continue`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun; proposition sans execution.

### Tour 11

**User**
> Non, ne lance rien. Avant de cloturer, verifie sans modifier: carte Action Lea vs Tri, rappel a 18h05, preference coach, et repere carnet bleu ferme / pas de tri.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : oui, elle est en place (Action Lea vs Tri).
> - Carte de defense : je n'en vois pas en place.
> - Rappels ponctuels : oui, il est programme a 18:05 (verifier si Lea a repondu, sans replonger dans mes notes).
> - Preferences coach : oui, moins de questions, challenge equilibre. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `status_only_request_blocks_tool_start`
- safety: `low`
- confirmation_kind: `no`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun; carte/rappel/preference retrouves, repere conversationnel oublie.

### Tour 12

**User**
> Tu as bien retrouve les effets durables. Ajoute juste le repere conversationnel: carnet bleu ferme = deux phrases a Lea avant tout tri.

**Sophia**
> Tu veux que je retienne quoi en premier: plus direct, ou plus court? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- safety: `none`
- tool_skill_intents: [`update_coach_preferences`]
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: aucun; faux pending de preference coach cree dans `__active_tool_skill_intake`.

### Tour 13

**User**
> Ni direct ni court: ne modifie pas la preference coach. Fais juste un recap conversationnel final: mail a Lea, rappel, carte, preference coach, et carnet bleu ferme = pas de tri avant deux phrases.

**Sophia**
> OK, recap final :
> - Mail a Lea : rester sur un message plus doux, sans en faire plus que necessaire.
> - Rappel : a 18h05, verifier si Lea a repondu, sans replonger dans les notes.
> - Carte active : Action Lea vs Tri.
> - Preference coach : une seule action concrete a la fois, avec moins d'options quand tu es vide/bloque.
> - Carnet bleu ferme : pas de tri avant deux phrases a Lea, point.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_recap_request_priority`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun; le faux pending est contourne sans execution.

### Tour 14

**User**
> Dernier check: ne lance aucun outil. Donne-moi juste la prochaine micro-action si je reviens trier mes notes pour eviter Lea.

**Sophia**
> OK, prochaine micro-action si tu reviens trier : carnet bleu ferme = ecris juste 2 phrases a Lea, douces, pas de tri tant que ce n'est pas envoye. Elle propose aussi de coller les phrases ici pour reformulation.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_status_exact_priority`
- safety: `low`
- skill_entry_ids: [`execution_breakdown`]
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 15

**User**
> On s'arrete la pour ce cycle. Resume en une phrase ce qui est le plus important a garder.

**Sophia**
> Carnet bleu ferme = tu ecris seulement 2 phrases douces a Lea, sans trier ni relancer tant que tu n'as pas envoye. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `none`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le debut de conversation est naturel: Sophia reduit vite la charge, propose un ordre concret, puis accepte de transformer le piege en carte d'attaque.
- Grosse amelioration au tour 2: le brouillon de carte affiche enfin une confirmation claire ("Je l'enregistre pour toi ?").
- L'aide produit du tour 5 est lisible et sans side effect.
- La montee de honte est geree sans lancement d'outil non consenti; Sophia propose un outil doux et attend un oui.
- Le recap final du tour 13 recupere correctement mail, rappel, carte, preference et repere carnet bleu.

**Problemes**
- Tour 6: Sophia simplifie encore une preference precise ("une question de tri puis une action de moins de deux minutes") en preference plus generale ("moins de questions/options"). Impact: perte de fidelite pour le coaching futur. Severite: yellow.
- Tour 9: la preference active n'est pas completement appliquee. Sophia pose une seule question, mais ne donne pas l'action courte demandee dans le meme tour. Impact: l'utilisateur doit repondre au slot avant d'avoir l'action. Severite: yellow.
- Tour 10: apres le choix "remercier + relancer", Sophia bloque toute relance au nom de la honte. C'est protecteur, mais elle ne revient pas a l'action courte promise. Impact: l'action concrete est differee. Severite: yellow.
- Tour 11: la verification sans modification oublie encore le repere conversationnel "carnet bleu ferme / pas de tri". Impact: l'utilisateur doit corriger Sophia. Severite: yellow.
- Tour 12: la correction du repere est comprise comme une preference coach ambigue. Impact: conversation deraillee pendant un tour, meme si aucun write durable n'est applique. Severite: yellow.

**Fix propose**
- Conserver et restituer les preferences coach complexes comme regles textuelles exactes en plus des flags canoniques.
- Lorsqu'une preference dit "question puis action", produire les deux elements dans le meme tour, sauf si la question rend l'action impossible.
- Distinguer explicitement "repere conversationnel du fil" de "preference durable de coaching", surtout apres une phrase qui commence par "Tu as bien retrouve les effets durables".
- Dans les verifications status-only, inclure les items conversationnels explicitement nommes, pas seulement les artefacts durables.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- `prepare_attack_card` est nettement meilleur qu'en A8: tour 2 route en `tool_skill`, affiche le brouillon et demande confirmation visible; tour 3 execute apres oui.
- Le rappel du tour 4 a maintenant une raison claire `central_arbitrator_one_shot_reminder_priority`; l'effet durable est exact.
- `product_help` au tour 5 reste correctement priorise et ne declenche aucun outil.
- La demande memoire du tour 8 ne sort plus en `response_owner=product_help`; elle passe en `normal_reply` avec `central_arbitrator_recap_request_priority`. Il reste seulement un bruit `skill_entry_ids=[product_help]`.
- Le faux positif majeur est le tour 12: une demande de repere conversationnel devient `tool_skill` / `update_coach_preferences`, avec pending collecte. L'execution reste bloquee, mais le routing est incorrect.

**Skills / Operations / Tools**
- `prepare_attack_card`: slots suffisants, confirmation visible, execution apres confirmation, carte durable correcte.
- `create_one_shot_reminder`: execution correcte; `scheduled_for=2026-05-28T16:05:00+00:00` correspond bien a 18:05 Europe/Paris.
- `update_coach_preferences`: confirmation respectee et durable cree au tour 7. La DB garde le texte original dans `reason`, mais le champ canonique applique seulement `coach.question_tendency=low`.
- `emotional_repair`: selection pertinente aux tours 9 et 10; aucun side effect n'est execute sans consentement.
- `select_state_potion`: pas d'execution observee. La proposition d'outil doux reste verbale et non engageante.

**Memory / Effets durables**
- Avant nettoyage, les effets attendus etaient presents:
  - carte `Action Lea vs Tri`, id `e0d50519-e529-4b41-b476-5c91d3dcb41a`, technique `ancre_visuelle`;
  - rappel ponctuel `pending`, id `c3c3e97b-1536-43b8-9d98-331aa4bedebe`, a 18:05 Europe/Paris;
  - preference `coach.question_tendency=low`, source `explicit_user`;
  - aucun rappel recurrent.
- Le tour 12 laisse un etat `__active_tool_skill_intake` / `__suspended_flow_v1` pour `update_coach_preferences` malgre le refus du tour 13. Il n'y a pas de write durable faux, mais l'etat conversationnel interne est pollue avant nettoyage.
- Apres nettoyage cible, verification REST locale: `scheduled_checkins`, `user_attack_cards`, `user_profile_facts`, `user_recurring_reminders`, `chat_messages`, `user_chat_states`, `user_topic_memories`, `memory_items` retournent 0 ligne pour le persona A9.

**Problemes**
- Tour 3: execution `prepare_attack_card` sous `response_owner=normal_reply`. Impact systeme: effet correct, trace owner moins explicite. Severite: yellow.
- Tour 6: `skill_entry_ids` contient `execution_breakdown` et `product_help` alors que le selected handler est `update_coach_preferences`. Impact systeme: bruit d'arbitrage, sans effet durable incorrect. Severite: yellow.
- Tour 7: execution `update_coach_preferences` sous `response_owner=normal_reply`. Impact systeme: effet correct, owner trace imparfait. Severite: yellow.
- Tour 8: `skill_entry_ids` contient encore `product_help`, mais l'owner est corrige en `normal_reply`. Impact systeme: warning faible. Severite: yellow.
- Tour 12: faux positif `update_coach_preferences` sur un repere conversationnel. Impact systeme: pending inutile, question hors sujet, et etat `__active_tool_skill_intake` conserve. Severite: yellow fort.

**Fix propose**
- Ajouter une garde d'arbitrage: les formulations "repere conversationnel", "ajoute juste le repere", "dans le fil" ne doivent pas entrer dans `update_coach_preferences` sans intention explicite de preference durable.
- Nettoyer l'active tool skill intake lorsqu'un tour suivant dit explicitement "ne modifie pas la preference" et route vers recap/status.
- Alignement trace: quand un tool est execute depuis une confirmation, exposer un `response_owner` ou handler qui reflete l'operation executee.
- Rendre les fields durables de preference capables de porter une regle comportementale precise, pas seulement un niveau de questionnement.

## Verdict Global

**yellow**

Les corrections ont fait une partie importante du travail: confirmation visible de `prepare_attack_card`, meilleur routing du rappel, meilleure sortie de `product_help` sur la memoire conversationnelle, no-tool guards respectes et aucun side effect non consenti. Le run ne passe pas `green` a cause d'un faux positif `update_coach_preferences` au tour 12, de la preference coach encore trop simplifiee, et d'owners de trace encore imparfaits sur les executions confirmees.
