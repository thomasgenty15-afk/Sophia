# Global Run A11 - Edge Skills 15T - N3 Strict R1

## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global_run_A11_20260528_edge_skills_r1`
- Persona: user QA temporaire local `0bc3fb6a-efa0-4baa-9374-3adbf4bdcedd`, cree via Auth local (`qa-normal-global_run_A11_20260528_edge_skills_r1-1780003495853@example.com`).
- Objectif: tester d'autres surfaces que les runs A8-A10, avec enchainements et edge cases: rappel ambigu puis clarifie, carte de defense, aide produit, preference coach conflictuelle, proposition de retour au calme sans execution, status-only et recap final.
- Trajectoire: surcharge reunion/devis -> rappel ambigu -> confirmation perdue -> rappel clarifie -> aide produit -> carte de defense -> aide produit carte -> preference coach conflictuelle -> pression emotionnelle -> opportunite `select_state_potion` non executee -> status/recap.
- Surfaces visees: `execution_breakdown`, `create_one_shot_reminder`, `prepare_defense_card`, `product_help`, `update_coach_preferences`, no-tool guards, `select_state_potion`, status-only, recap, nettoyage durable.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, `SOPHIA_CLIENT_NOW_ISO=2026-05-28T10:00:00.000+02:00`, aucun fallback deterministe.
- Validite QA: valide. Les 15 messages ont ete choisis tour par tour apres lecture de la reponse Sophia et de la trace courte precedente. Aucun message fixe pre-scripted n'a ete rejoue. Aucun code n'a ete modifie pendant le run. Nettoyage cible effectue et verifie apres le run.

## 2. Tours De Conversation

### Tour 1

**User**
> Salut Sophia. J'ai une reunion a preparer, un devis a relire, et je veux aussi que tu me le rappelles plus tard, mais je ne sais pas encore quand. Aide-moi a ne pas partir dans tous les sens.

**Sophia**
> Ah ok, la t'as 3 trucs qui se bousculent dans ta tete. On va verrouiller le demarrage, etape par etape.
>
> 1) Reunion d'abord: ouvre le doc/agenda et note juste 3 points.
> 2) Devis ensuite: relis uniquement "prix / perimetre / delais" et mets tes corrections en 3 lignes.
> 3) Pour le rappel "plus tard", on le planifie des que tu me donnes un repere de moment.
>
> Tu veux qu'on transforme "preparer la reunion ou relire le devis" en Carte d'attaque pour demarrer sans te disperser ?

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
> Ok pour le rappel: programme-le aujourd'hui a 16h40 avec le texte 'reprendre le devis sans rouvrir toute la reunion'.

**Sophia**
> Ok. Je programme le rappel aujourd'hui a 16h40 avec ce texte : "reprendre le devis sans rouvrir toute la reunion".
>
> Tu veux que je te le regle comme rappel unique (juste une fois), c'est bien ca ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_conversation_skill_continue`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun; clarification rappel unique demandee.

### Tour 3

**User**
> Oui, rappel unique, une seule fois aujourd'hui.

**Sophia**
> Je n'ai pas encore programme ce rappel : il me manque un moment futur clair.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_conversation_skill_continue`
- safety: `low`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: `[]`
- tool_execution: `blocked`
- durable_effect: aucun; l'heure `16h40` donnee au tour precedent n'a pas ete reprise.

### Tour 4

**User**
> Je precise: aujourd'hui 28 mai 2026 a 16h40, rappel unique: reprendre le devis sans rouvrir toute la reunion.

**Sophia**
> C'est programme pour jeudi 28 mai a 16:40 : reprendre le devis sans rouvrir toute la reunion.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `active_skill_exit_requested`
- safety: `low`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: rappel cree, id `57465dcb-98ac-4613-9d5d-1baf45b670ec`, `scheduled_for=2026-05-28T14:40:00+00:00`, soit 16:40 Europe/Paris, status `pending`.

### Tour 5

**User**
> Question produit: pourquoi tu m'as redemande l'heure alors que je venais de dire 16h40 ? Est-ce que le rappel existe bien maintenant ?

**Sophia**
> Bonne question. Quand tu as re-precise "aujourd'hui 28 mai 2026 a 16h40", j'ai juste besoin de recoller l'info au bon moment pour eviter toute ambiguite.
>
> Oui, le rappel existe bien maintenant : il est prevu pour jeudi 28 mai a 16:40 avec le texte "reprendre le devis sans rouvrir toute la reunion".

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `active_skill_exit_requested`
- safety: `low`
- skill_entry_ids: [`product_help`]
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 6

**User**
> Prepare une carte de defense complete pour ce moment precis: quand j'ouvre le dossier captures et que je me dis 'je classe juste deux minutes', je finis par eviter le devis. Signal: main sur la souris. Phrase de stop: souris = je ferme le dossier et je reviens au devis.

**Sophia**
> Voici ta carte de defense :
> Le moment : Ouverture du dossier captures
> Le piege : Main sur la souris et pensee je classe juste deux minutes
> Mon geste : Je ferme le dossier et je reviens au devis
> Plan B : Je m'eloigne de l'ordinateur une minute
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

### Tour 7

**User**
> Oui, valide et cree cette carte de defense.

**Sophia**
> C'est fait. J'ai cree la carte de defense "Dossier captures vs Devis" : Je ferme le dossier et je reviens au devis.
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
- durable_effect: carte de defense creee, id `8b0ba6ac-92b3-40af-adc9-3b532863deab`, trigger `Dossier captures vs Devis`, defense `Je ferme le dossier et je reviens au devis`.

### Tour 8

**User**
> Cote produit, ou je retrouve cette carte de defense et est-ce que je peux la modifier depuis le chat ?

**Sophia**
> Tu la retrouves ici cote produit : Dashboard > Ressources.
>
> Depuis le chat je ne peux pas modifier directement une carte de defense existante. Par contre, elle peut etre ajustee depuis la plateforme/Ressources quand l'option est disponible.
>
> Tu veux que je t'aide a la preparer pour un "moment piege" concret ?

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 9

**User**
> Preference durable de coaching: quand une carte de defense vient d'etre creee, ne me propose pas tout de suite une autre carte; commence par une verification simple de ce que je vais faire maintenant. Confirme avant d'enregistrer.

**Sophia**
> C'est bien note, je te demanderai de confirmer avant d'enregistrer et on fera le point sur ce que tu fais juste apres. Pour cette carte, quel est le moment de risque ou l'habitude que tu veux securiser ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_defense_card_intent_overrides_attack_card`
- safety: `low`
- tool_skill_intents: [`prepare_defense_card`, `update_coach_preferences`, `prepare_defense_card`]
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: aucun; mauvaise priorisation, la preference coach est captee par `prepare_defense_card`.

### Tour 10

**User**
> Non, je ne veux pas preparer une autre carte. Je parle d'une preference durable de coaching: apres une carte de defense, commence par une verification simple de mon action suivante. Enregistre-la seulement si je confirme.

**Sophia**
> C'est entendu, je ne prepare pas de nouvelle carte. J'ai bien note ta consigne : a l'avenir, apres une defense, je te demanderai de confirmer avant d'enregistrer ton action suivante. Qu'est-ce que tu aimerais faire maintenant ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `explicit_defense_card_intent_overrides_attack_card`
- safety: `low`
- tool_skill_intents: [`prepare_defense_card`, `update_coach_preferences`, `prepare_defense_card`]
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: aucun; le mauvais tool skill reste actif, pas de preference enregistree.

### Tour 11

**User**
> Ne cree rien et n'enregistre rien pour l'instant. Je sens la pression monter parce que j'ai deja perdu du temps avec ces clarifications. Si tu vois un outil de retour au calme, propose-le seulement, sans le lancer.

**Sophia**
> Ok je ne cree rien et je n'enregistre rien pour l'instant.
>
> Pour redescendre la pression, elle propose respiration 4-6 ou mise au calme express 20 secondes, en demandant de choisir A ou B.

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

### Tour 12

**User**
> B, mais ne lance aucun outil. Donne-moi juste la micro-action en une phrase, puis on revient au devis.

**Sophia**
> C'est entendu, je ne lance pas la preparation de la carte. On reprend pour ton devis : qu'est-ce que tu aimerais faire maintenant ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_ponctual_response_format`
- safety: `low`
- tool_skill_intents: [`prepare_attack_card`]
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: aucun; reponse hors sujet et faux intent `prepare_attack_card` bloque.

### Tour 13

**User**
> Avant de finir, verifie sans modifier: rappel 16h40, carte de defense Dossier captures vs Devis, aucune nouvelle carte apres mon refus, aucune preference coach enregistree, aucun outil de retour au calme lance.

**Sophia**
> Sans rien modifier :
> - Carte d'attaque : je n'en vois pas en place.
> - Carte de defense : oui, elle est en place (carte de defense).
> - Rappels ponctuels : oui, il est programme a 16:40 (reprendre le devis sans rouvrir toute la reunion).
> - Preferences coach : oui, challenge equilibre, ton bienveillant ferme.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `status_only_request_blocks_tool_start`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun; status sans side effect, mais verification incomplete et ambiguite sur preferences par defaut.

### Tour 14

**User**
> Recap final en restant precis: ce qui existe vraiment, ce qui n'a pas ete cree, et la prochaine action devis en une phrase.

**Sophia**
> Recap precis :
> Ce qui existe vraiment : carte de defense active "carte de defense"; rappel ponctuel en attente aujourd'hui a 16:40.
> Ce qui n'a pas ete cree : aucune nouvelle carte; aucune autre preference coach enregistree en plus.
> Prochaine action : a 16:40, reprendre le devis directement, sans rouvrir toute la reunion.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_recap_request_priority`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

### Tour 15

**User**
> On s'arrete la. Resume en une phrase la regle la plus importante a garder.

**Sophia**
> Regle la plus importante a garder : apres une carte de defense, tu ne crees/ n'enregistres rien tant que tu n'as pas confirme exactement ton action suivante.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `central_arbitrator_ponctual_response_format`
- safety: `low`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: aucun

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- L'ambiguite initiale du rappel est bien traitee au tour 1: Sophia n'invente pas d'heure et demande un repere.
- La carte de defense fonctionne humainement aux tours 6-7: moment, piege, geste et plan B sont comprehensibles, avec validation avant creation.
- L'aide produit du tour 8 est claire et bien contextualisee.
- Le tour 11 respecte la demande "propose seulement, sans lancer": Sophia propose un retour au calme sans side effect.
- Le recap final du tour 14 corrige une partie des confusions: il distingue les choses creees et non creees.

**Problemes**
- Tour 3: apres confirmation du rappel unique, Sophia perd l'heure `16h40` donnee juste avant et redemande implicitement un moment futur. Impact: friction forte sur un flow de confirmation simple. Severite: yellow.
- Tour 5: l'explication produit justifie la re-demande mais ne reconnait pas vraiment que l'heure etait deja presente. Impact: reparative mais pas transparente. Severite: yellow.
- Tour 9: demande explicite de preference durable capturee comme nouvelle carte de defense. Impact: l'utilisateur doit corriger fortement. Severite: yellow fort.
- Tour 10: meme apres correction, Sophia reste dans le mauvais cadre `prepare_defense_card` et formule "j'ai bien note" sans confirmation durable ni enregistrement. Impact: ambiguite entre noter conversationnellement et preference durable. Severite: yellow fort.
- Tour 12: l'utilisateur demande une micro-action de calme en une phrase; Sophia repond a cote et parle de "preparation de la carte". Impact: sortie emotionnelle peu fluide. Severite: yellow.
- Tour 13: status-only ne repond pas explicitement a "aucune preference coach enregistree" et liste les defaults comme "preferences coach : oui". Impact: confusion durable/non durable. Severite: yellow.

**Fix propose**
- Faire porter l'heure/date du rappel dans l'etat pending quand Sophia demande seulement "rappel unique ?", afin que le oui suffise.
- Dans product help apres erreur de flow, reconnaitre clairement "j'avais bien l'heure, mais je n'ai pas conserve le slot".
- Prioriser `update_coach_preferences` sur les formulations explicites "Preference durable de coaching", meme si le texte contient "carte de defense".
- Apres un refus "pas de nouvelle carte", vider le pending `prepare_defense_card` avant de traiter la preference ou le no-tool suivant.
- En status-only, distinguer preferences par defaut et preferences explicitement enregistrees pendant le run.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Bon routage `execution_breakdown` au tour 1, avec opportunite `prepare_attack_card` non executee.
- `create_one_shot_reminder` est correctement bloque au tour 3 si le slot manque, mais le slot ne devrait pas manquer: l'heure du tour 2 n'est pas conservee dans le pending.
- `prepare_defense_card` est propre aux tours 6-7: confirmation visible, execution apres oui, durable correct.
- `product_help` est propre au tour 8. Tour 5 a seulement `skill_entry_ids=[product_help]` mais `response_owner=normal_reply`, probablement a cause du flow actif precedent.
- Gros conflit aux tours 9-10: `prepare_defense_card` gagne contre `update_coach_preferences` malgre une intention explicite de preference durable.
- `explicit_no_tool_request_blocks_tool_start` fonctionne au tour 11: `select_state_potion` est seulement une opportunite, non executee.
- Tour 12 cree un faux signal `prepare_attack_card` bloque sur une demande no-tool/micro-action, sans side effect mais avec mauvaise reponse.

**Skills / Operations / Tools**
- `create_one_shot_reminder`: un rappel durable est cree apres re-precision au tour 4; `scheduled_for=2026-05-28T14:40:00+00:00`, soit 16:40 Europe/Paris.
- `prepare_defense_card`: une seule carte durable est creee, `Dossier captures vs Devis`, avec trigger et defense conformes.
- `update_coach_preferences`: jamais execute, ce qui est correct apres absence de confirmation, mais le routing n'a pas su prendre la main sur la demande explicite.
- `select_state_potion`: opportunite detectee au tour 11, non executee comme demande.
- Aucun outil n'est execute apres les refus explicites des tours 10-13.

**Memory / Effets durables**
- Avant nettoyage:
  - `scheduled_checkins`: 1 rappel pending, id `57465dcb-98ac-4613-9d5d-1baf45b670ec`;
  - `user_defense_cards`: 1 carte active, id `8b0ba6ac-92b3-40af-adc9-3b532863deab`;
  - `user_attack_cards`: 0;
  - `user_profile_facts`: seulement les 9 defaults, aucune preference explicite nouvelle;
  - `user_recurring_reminders`: 0.
- Apres nettoyage cible, verification REST locale: `scheduled_checkins`, `user_attack_cards`, `user_defense_cards`, `user_profile_facts`, `user_recurring_reminders`, `chat_messages`, `user_chat_states`, `user_topic_memories`, `memory_items` retournent 0 ligne pour le persona A11.

**Problemes**
- Tour 3: perte de slot temporel entre demande de confirmation et confirmation. Impact systeme: pending incomplet, tool bloque a tort. Severite: yellow fort.
- Tour 5: `product_help` detecte mais pas owner. Impact systeme: trace moins claire. Severite: yellow leger.
- Tour 9: mauvais arbitrage entre `prepare_defense_card` et `update_coach_preferences`. Impact systeme: mauvais tool skill bloque, UX deraillee. Severite: yellow fort.
- Tour 10: refus de nouvelle carte ne vide pas le mauvais contexte `prepare_defense_card`. Impact systeme: flow collant. Severite: yellow.
- Tour 12: faux intent `prepare_attack_card` sur une demande no-tool. Impact systeme: pas de side effect, mais mauvais signal. Severite: yellow.
- Tour 13: status-only ne verifie pas les non-effets explicitement demandes. Impact systeme: QA/status incomplet. Severite: yellow.

**Fix propose**
- Serialiser les slots extraits dans le pending de rappel avant de demander confirmation "unique ou recurrent".
- Ajouter une regle d'arbitrage: "Preference durable de coaching" doit primer sur les mots "carte de defense/attaque" quand l'intention grammaticale porte sur le comportement de Sophia.
- Sur refus explicite "je ne veux pas preparer une autre carte", nettoyer le pending tool skill de carte.
- Bloquer les faux intents carte quand `explicit_no_tool_request_blocks_tool_start` ou une demande de micro-action courte est active.
- Etendre status-only pour verifier les non-effets: aucune nouvelle carte, aucune preference explicite, aucun outil lance.

## Verdict Global

**yellow**

Run valide et utile pour les edge cases. Les effets durables critiques sont corrects et aucun side effect non consenti n'a ete applique. Les points solides sont `prepare_defense_card`, `product_help` carte, no-tool guard avec opportunite `select_state_potion`, et nettoyage DB. Le run reste `yellow` fort a cause de trois blocages systeme: perte du slot horaire au moment de confirmer le rappel, preference durable capturee par `prepare_defense_card`, et faux intent carte/no-tool au tour 12.
