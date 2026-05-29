# Global Run A12 - Edge Skills 15T - N3 Strict R1

## 1. Contexte Du Test

- Date: 2026-05-29
- Run: `global_run_A12_20260529_edge_skills_r1`
- Persona: user QA temporaire local `7e48c175-9607-4d6b-a7fb-85791541c4af`, cree via Auth local (`qa-normal-global_run_A12_20260529_edge_skills_r1-1780006613873@example.com`).
- Objectif: rejouer les memes familles d'edge cases que A11 avec une variation de contexte, pour verifier si les corrections recentes ont ameliore rappel ambigu/clarifie, carte de defense, preference coach, no-tool, status-only et recap.
- Trajectoire: dossier client/budget -> rappel sans heure puis rappel unique precise -> product help rappel -> carte de defense budget -> product help carte -> preference coach apres carte -> proposition potion sans execution -> micro-action no-tool -> status/recap.
- Surfaces visees: `execution_breakdown`, `create_one_shot_reminder`, `prepare_defense_card`, `product_help`, `update_coach_preferences`, no-tool guards, `select_state_potion`, status-only, recap, nettoyage durable.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, `SOPHIA_CLIENT_NOW_ISO=2026-05-29T10:00:00.000+02:00`, aucun fallback deterministe.
- Validite QA: valide. Les 15 messages ont ete choisis tour par tour apres lecture de la reponse Sophia et de la trace courte precedente. Aucun message fixe pre-scripted n'a ete rejoue. Aucun code n'a ete modifie pendant le run. Nettoyage cible effectue et verifie apres le run.

## 2. Tours De Conversation

### Tour 1

**User**
> Salut Sophia. J'ai un dossier client a reprendre, une note budget a relire, et je veux que tu me rappelles le dossier plus tard, mais je n'ai pas encore decide l'heure. Aide-moi a cadrer sans partir dans dix directions.

**Sophia**
> C'est note, on va faire simple pour eviter que tu t'eparpilles. On se concentre sur le dossier client et la note budget.
>
> Pour ton rappel, des que tu as l'heure en tete, dis-le moi. Je ne peux pas le deviner, mais je peux le programmer des que tu es fixe.
>
> En attendant, par quoi tu commences pour te mettre dans le bain ?

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
> Je commence par le dossier client. Programme un rappel unique aujourd'hui a 15h25: reprendre le dossier client sans rouvrir la note budget.

**Sophia**
> C'est programme pour vendredi 29 mai a 15:25 : reprendre le dossier client sans rouvrir la note budget.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_one_shot_reminder_priority`
- safety: `low`
- skill_entry_ids: [`execution_breakdown`]
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: rappel cree, id `c5b8e532-46cd-40fa-8740-85163828bd41`, `scheduled_for=2026-05-29T13:25:00+00:00`, soit 15:25 Europe/Paris, status `pending`.

### Tour 3

**User**
> Question produit: le rappel est bien unique ? Et si je veux l'annuler, je passe par ou ?

**Sophia**
> Le rappel ponctuel que je t'ai programme se gere cote Initiatives, dans les rappels cote chat pour ce type-la.
>
> Pour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement, par exemple: "change le rappel de demain a 9h" ou "annule le rappel de demain".

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 4

**User**
> Prepare une carte de defense complete pour ce moment precis: quand j'ouvre le tableur budget et que je me dis 'je verifie juste une ligne', je finis par eviter le dossier client. Signal: curseur dans la colonne montant. Phrase de stop: colonne montant = je ferme le budget et je reviens au dossier client.

**Sophia**
> Voici ta carte de defense :
> Le moment : Quand j'ouvre le budget
> Le piege : Curseur dans la colonne montant
> Mon geste : Je ferme le budget et je reviens au dossier client
> Plan B : Je m'eloigne de l'ecran 1 minute
> On valide ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_defense_card_intent_overrides_attack_card`
- safety: `low`
- tool_skill_intents: [`prepare_defense_card`, `prepare_defense_card`]
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: aucun avant confirmation

### Tour 5

**User**
> Oui, valide et cree cette carte de defense.

**Sophia**
> C'est fait. J'ai cree la carte de defense "Dossier client" : Je ferme le budget et je reviens au dossier client.
>
> Tu peux la retrouver dans Ressources > Cartes de defense pour la relire, l'utiliser et l'ajuster depuis la plateforme quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_defense_card_intent_overrides_attack_card`
- safety: `low`
- tool_execution: `success`
- executed_tools: [`prepare_defense_card`]
- durable_effect: carte de defense creee, id `d540e7b9-3f78-4148-8e06-251e8f62e4c1`, trigger `Dossier client`, defense `Je ferme le budget et je reviens au dossier client`.

### Tour 6

**User**
> Cote produit, ou je retrouve cette carte de defense et est-ce que le chat peut modifier celle qui existe deja ?

**Sophia**
> Tu la retrouves cote produit ici :
> 1) Dashboard > Ressources
> 2) Dashboard > Plan si elle est liee a une mission/habitude
>
> Depuis le chat, je ne peux pas modifier directement une carte existante. Elle peut etre ajustee cote plateforme dans Resources quand l'option est disponible, ou on peut preparer une nouvelle version apres confirmation.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 7

**User**
> Preference durable de coaching: quand une carte de defense vient d'etre creee, ne me propose pas tout de suite une autre carte; commence par verifier simplement mon action suivante. Demande confirmation avant d'enregistrer.

**Sophia**
> Bien recu. Pour la suite, je prendrai plus souvent le temps de te questionner avant de trancher. Si c'est bien ca, je le garde comme preference.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- safety: `none`
- tool_skill_intents: [`prepare_defense_card`, `update_coach_preferences`]
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: aucun avant confirmation; bon owner mais mauvais resume semantique.

### Tour 8

**User**
> Oui, enregistre cette preference.

**Sophia**
> C'est fait. J'ai applique cette preference : je prendrai plus souvent le temps de te questionner avant de trancher.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- tool_execution: `success`
- executed_tools: [`update_coach_preferences`]
- durable_effect: preference enregistree `coach.question_tendency=high`, source `explicit_user`, reason contenant la demande originale.

### Tour 9

**User**
> Ne cree rien d'autre maintenant. Je sens la pression monter parce que j'ai peur d'avoir choisi la mauvaise preference. Si tu vois un outil de retour au calme, propose-le seulement, sans le lancer.

**Sophia**
> Ok, je te ralentis la tout de suite.
> Tu veux qu'on utilise la Potion d'etat pour redescendre la pression, avant meme de reparler preference/action ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- safety: `low`
- opportunity: `state_potion`
- opportunity_operation: `select_state_potion`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun; opportunite detectee mais non executee.

### Tour 10

**User**
> Non, ne lance pas la potion. Donne-moi juste une micro-action en une phrase pour revenir au dossier client.

**Sophia**
> D'accord, on fait tres court. Pour choisir la bonne micro-action pour ton dossier client, tu sens que tu decroches (Rappel) ou que tu evites le sujet (Courage) ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- safety: `low`
- skill_entry_ids: [`execution_breakdown`]
- direct_effects: `[]`
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun; no-tool respecte, mais pas de micro-action en une phrase.

### Tour 11

**User**
> J'evite le sujet. Une seule phrase d'action, sans outil.

**Sophia**
> Ok: des que tu evites, ecris tout de suite une ligne "La prochaine micro-action sur le dossier client = ..." et fais-la 2 minutes.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `attack_card_cancelled_to_conversation`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 12

**User**
> Avant de finir, verifie sans modifier: rappel 15h25, carte de defense Budget vs dossier client, aucune carte supplementaire apres mon refus, preference coach enregistree, aucun outil de retour au calme lance.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de defense : oui, elle est en place (carte de defense).
> - Rappels ponctuels : oui, il est programme a 15:25 (reprendre le dossier client sans rouvrir la note budget).
> - Preferences coach : oui, plus de questions, challenge equilibre.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_cancel_active_tool_flow`
- safety: `low`
- tool_skill_intents: [`prepare_defense_card`]
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun; status sans side effect, mais faux signal carte et details incomplets.

### Tour 13

**User**
> Recap final precis: ce qui existe vraiment, ce qui n'a pas ete cree ou lance, et la prochaine action dossier client en une phrase.

**Sophia**
> Ce qui existe : ton rappel de 15h25, ta carte de defense Budget vs Dossier, et ta preference coach (te questionner avant de trancher).
> Ce qui n'a pas ete cree/lance : aucune carte d'attaque supplementaire, aucune autre preference, et aucune Potion d'etat.
> Micro-action : ecris maintenant la ligne "La prochaine micro-action sur le dossier client = ..." et traite-la pendant 2 minutes.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_recap_request_priority`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 14

**User**
> Dernier check sans outil: si je vois le tableur budget ouvert, quelle est la regle la plus importante a garder ?

**Sophia**
> Si le tableur budget est ouvert, la regle la plus importante c'est : ne rien modifier sans que tu puisses expliquer en une phrase pourquoi.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun; reponse non alignee avec la carte de defense active.

### Tour 15

**User**
> On s'arrete la. Resume en une phrase ce qui compte le plus pour le dossier client.

**Sophia**
> L'essentiel, c'est de garder ton rappel de 15h25 comme seul point de bascule pour agir sans rouvrir ton budget.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_ponctual_response_format`
- safety: `none`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le rappel ambigu du tour 1 est correctement attendu, puis le rappel precise du tour 2 est cree directement. C'est une amelioration nette par rapport a A11.
- La carte de defense est fluide: brouillon clair, validation demandee, creation confirmee, aide produit correcte.
- Le conflit preference durable / carte de defense est mieux arbitre qu'en A11: Sophia selectionne `update_coach_preferences` au lieu de rester bloquee dans `prepare_defense_card`.
- La demande no-tool du tour 9 est respectee: Sophia propose une Potion d'etat sans la lancer.
- Le recap du tour 13 distingue les effets existants et les non-effets.

**Problemes**
- Tour 3: la question "le rappel est bien unique ?" ne recoit pas de "oui" explicite, seulement une explication generique des rappels ponctuels. Impact: reponse produit incomplete. Severite: yellow leger.
- Tours 7-8: la preference demandee est mal reformulee. "Ne me propose pas tout de suite une autre carte; verifie mon action suivante" devient "me questionner plus souvent avant de trancher". Impact: preference durable contraire ou trop large. Severite: yellow fort.
- Tour 10: l'utilisateur demande une micro-action en une phrase sans outil; Sophia pose une question de tri. Impact: friction, micro-action differee au tour 11. Severite: yellow.
- Tour 12: status-only ne confirme pas explicitement "aucun outil de retour au calme lance" et conserve un faux signal `prepare_defense_card`. Impact: verification incomplete. Severite: yellow.
- Tour 14: Sophia oublie la regle de defense principale ("fermer le budget et revenir au dossier client") et propose une regle budget differente. Impact: memoire conversationnelle/action active mal exploitee. Severite: yellow.
- Tour 15: le resume final met le rappel comme seul point de bascule au lieu de la carte de defense budget -> dossier client. Impact: cloture moins alignee avec l'objectif action. Severite: yellow.

**Fix propose**
- Product help rappel: repondre explicitement au type ("oui, c'est un rappel ponctuel/unique") avant les instructions d'annulation.
- Preference coach: conserver le texte exact comme regle comportementale, pas seulement mapper vers `coach.question_tendency=high`.
- No-tool micro-action: quand l'utilisateur demande "une phrase", ne pas reclarifier sauf manque critique.
- Recap/status: inclure les non-effets demandes et restituer le nom/titre exact de la carte de defense.
- Quand une carte de defense active existe, les derniers checks doivent reprendre son geste principal avant toute regle alternative.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- `create_one_shot_reminder` fonctionne mieux qu'en A11: la demande precise du tour 2 est routee par `central_arbitrator_one_shot_reminder_priority` et executee sans perte de slot.
- `prepare_defense_card` fonctionne correctement aux tours 4-5: `tool_skill`, confirmation visible, execution apres oui, durable correct.
- `product_help` est propre aux tours 3 et 6.
- `update_coach_preferences` gagne l'arbitrage au tour 7 malgre la presence de `prepare_defense_card` dans `tool_skill_intents`, ce qui corrige la regression A11.
- `explicit_no_tool_request_blocks_tool_start` fonctionne au tour 9 avec opportunite `select_state_potion` non executee.
- Tour 12 garde un faux intent `prepare_defense_card` dans un status-only, mais aucun side effect n'est execute.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: success complet; `scheduled_for=2026-05-29T13:25:00+00:00`, soit 15:25 Europe/Paris.
- `prepare_defense_card`: success complet; carte durable active `Dossier client`, defense `Je ferme le budget et je reviens au dossier client`.
- `update_coach_preferences`: execution apres confirmation, mais mapping durable discutable: `coach.question_tendency=high` alors que la demande portait surtout sur "ne pas proposer une autre carte" et "verifier l'action suivante".
- `select_state_potion`: opportunite detectee, non executee.
- Aucun outil n'est execute apres les refus/no-tool des tours 9-12.

**Memory / Effets durables**
- Avant nettoyage:
  - `scheduled_checkins`: 1 rappel pending, id `c5b8e532-46cd-40fa-8740-85163828bd41`;
  - `user_defense_cards`: 1 carte active, id `d540e7b9-3f78-4148-8e06-251e8f62e4c1`;
  - `user_attack_cards`: 0;
  - `user_profile_facts`: preference explicite `coach.question_tendency=high`, source `explicit_user`, reason contenant la demande originale;
  - `user_recurring_reminders`: 0.
- Apres nettoyage cible, verification REST locale: `scheduled_checkins`, `user_attack_cards`, `user_defense_cards`, `user_profile_facts`, `user_recurring_reminders`, `chat_messages`, `user_chat_states`, `user_topic_memories`, `memory_items` retournent 0 ligne pour le persona A12.

**Problemes**
- Tour 7: `tool_skill_intents` contient encore `prepare_defense_card` avec `update_coach_preferences`. Impact systeme: bruit d'arbitrage, meme si le bon handler gagne. Severite: yellow leger.
- Tours 7-8: mapping preference durable vers `coach.question_tendency=high`. Impact systeme: effet durable semantiquement faux ou trop large. Severite: yellow fort.
- Tour 10: `explicit_no_tool_request_blocks_tool_start` bloque bien les tools, mais la reponse ne respecte pas la forme demandee. Impact systeme/UX: no-tool OK, generation conversationnelle incomplete. Severite: yellow.
- Tour 12: status-only route `central_arbitrator_cancel_active_tool_flow` avec faux `prepare_defense_card`. Impact systeme: contexte carte pas totalement nettoye. Severite: yellow.
- Tours 14-15: retrieval/action active ne priorise pas la defense card dans les reponses finales. Impact systeme: memoire/action durable sous-exploitee. Severite: yellow.

**Fix propose**
- Ajouter un modele de preference coach plus expressif que `question_tendency` pour les regles "apres une carte, ne propose pas X; verifie Y".
- Nettoyer les intents carte residuels dans les tours status-only/no-tool apres creation de defense card.
- En recap final, prioriser la carte de defense active lorsque l'utilisateur mentionne le signal/piege lie.
- Ajouter une validation semantique post-intake pour empecher un mapping contraire au texte de la preference.

## Verdict Global

**yellow**

Run valide. Les corrections ont nettement ameliore deux points A11: le rappel precis ne perd plus son slot et la preference durable n'est plus capturee par `prepare_defense_card`. Le run ne passe pas `green` parce que la preference est enregistree avec un mapping durable semantiquement faux (`coach.question_tendency=high`), les status/recaps restent incomplets, et la carte de defense active est mal reutilisee dans les derniers checks.
