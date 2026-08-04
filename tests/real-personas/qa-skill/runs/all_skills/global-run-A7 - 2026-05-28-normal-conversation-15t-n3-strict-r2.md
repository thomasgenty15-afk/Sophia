## 1. Contexte Du Test

- Date: 2026-05-28
- Run: `global_run_A7_20260528_n3_strict_r2`
- Indicateur: `A7`, `r2` utilise car `global_run_A7_20260528_n3_strict_r1` a eu un HTTP 500 vide au tour 1 et a ete invalide.
- Persona: user QA temporaire local `bf5c3926-2ea3-414f-bf83-fb77f13cfe10`, email `qa-normal-global_run_A7_20260528_n3_strict_r2-1779989071461@example.com`.
- Objectif: verifier si les corrections apres A6 reglent la carte complete mal arbitree, la confirmation tool skill, la sortie product help vers preference, et le recap/status incomplet.
- Trajectoire: matinee brouillee -> carte d'attaque Maya -> rappel ponctuel -> product help -> preference coach -> memoire conversationnelle -> application preference -> honte / outil doux non execute -> refus d'outil + recap/status.
- Surfaces visees: `execution_breakdown`, `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, memoire conversationnelle, `update_coach_preferences`, `emotional_repair`, `status_recap_request_blocks_tool_start`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, `SOPHIA_CLIENT_NOW_ISO=2026-05-28T10:00:00.000+02:00`, aucun fallback deterministe.
- Validite QA: valide pour r2. Les 15 messages ont ete choisis tour par tour apres lecture de la reponse et de la trace courte precedente. Aucun code n'a ete modifie pendant le run.
- Verification DB: carte d'attaque, rappel ponctuel et preference coach verifies avant cleanup. Nettoyage cible r2 et tentative invalide r1 effectue; post-cleanup r2 verifie a 0 ligne pour `scheduled_checkins`, `user_attack_cards`, `user_profile_facts`, `user_recurring_reminders`, `chat_messages`, `user_chat_states`.

## 2. Tours De Conversation

### Tour 1

**User**
> Salut Sophia. Je demarre avec le cerveau en vrac: un message a envoyer a Maya, une facture a verifier, et la tentation de ranger mon bureau avant d'ecrire. Je veux sauver les 20 prochaines minutes.

**Sophia**
> Sophia propose un plan 20 minutes: message a Maya, facture, bureau limite a 5 objets hors champ. Elle demande de choisir Maya ou facture.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: opportunite `attack_card` / `prepare_attack_card`
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**User**
> Je choisis A. Prepare une carte d'attaque complete. Action: envoyer trois lignes a Maya avant de ranger. Piege: chercher un bureau net pour eviter d'ecrire. Signal visuel: la lampe verte allumee. Phrase: lampe verte = trois lignes a Maya, pas de rangement.

**Sophia**
> Sophia route vers `prepare_attack_card`, mais la reponse visible reste incomplete: "Carte d'attaque (mode lampe verte)" puis seulement le signal visuel. Pas de brouillon complet ni confirmation.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- safety: `low`
- direct_effects: `[]`
- operation: `prepare_attack_card`
- pending_confirmation: aucune confirmation visible
- memory_plan: n/a
- executed_tools: `[]`
- durable_effect: none, `tool_execution=none`

### Tour 3

**User**
> Il manque la confirmation. Brouillon attendu: titre Maya 3 lignes, technique ancre visuelle, phrase lampe verte = trois lignes a Maya, pas de rangement. Demande-moi si je veux la creer.

**Sophia**
> Regression: Sophia route en `product_help`, pas en tool skill. Elle commence a proposer de creer la carte "Lampe verte" mais la reponse est tronquee et ne contient pas la confirmation attendue.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `none`
- direct_effects: `[]`
- operation: mauvais owner product help
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: `[]`
- durable_effect: none

### Tour 4

**User**
> Oui, cree cette carte maintenant.

**Sophia**
> Sophia bascule a `prepare_attack_card`, mais perd le contexte et redemande l'action ou l'objectif.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `prepare_attack_card`
- pending_confirmation: contexte perdu
- memory_plan: n/a
- executed_tools: `[]`
- durable_effect: none, `tool_execution=blocked`

### Tour 5

**User**
> Action: envoyer trois lignes a Maya avant de ranger. Titre Maya 3 lignes. Technique ancre visuelle. Phrase: lampe verte = trois lignes a Maya, pas de rangement. Cree-la apres confirmation.

**Sophia**
> Sophia produit un brouillon correct: `Maya 3 lignes (Ancre visuelle)` avec ancre `lampe verte = trois lignes a Maya, pas de rangement`, mais ne demande toujours pas clairement "Je cree cette carte ?".

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `low`
- direct_effects: `[]`
- operation: `prepare_attack_card`
- pending_confirmation: confirmation attendue mais non visible
- memory_plan: n/a
- executed_tools: `[]`
- durable_effect: none, `tool_execution=blocked`

### Tour 6

**User**
> Oui, cree cette carte maintenant avec ce brouillon.

**Sophia**
> Sophia cree la carte d'attaque `Maya 3 lignes`, technique `Ancre visuelle`, phrase `lampe verte = trois lignes a Maya, pas de rangement`.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `prepare_attack_card`
- pending_confirmation: confirmation recue
- memory_plan: n/a
- executed_tools: `["prepare_attack_card"]`
- durable_effect: carte creee, id `684a13ed-f3bf-4afc-a221-b18cf1731138`

### Tour 7

**User**
> Message Maya envoye. Programme-moi un rappel aujourd'hui a 17h30: verifier si Maya a repondu, sans rouvrir tout le fil.

**Sophia**
> C'est programme pour jeudi 28 mai a 17:30 : verifier si Maya a repondu, sans rouvrir tout le fil.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: `["create_one_shot_reminder"]`
- operation: `create_one_shot_reminder`
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: rappel cree, id `560721ae-2193-4238-ad61-2dc62af61041`, `scheduled_for=2026-05-28T15:30:00+00:00`

### Tour 8

**User**
> Cote produit, ou je retrouve ce rappel si je veux l'annuler plus tard ?

**Sophia**
> Sophia repond en product help: le rappel ponctuel se gere cote Initiatives / rappels cote chat; pour modifier ou annuler, lui redire clairement ici.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `central_arbitrator_product_help_priority`
- safety: `low`
- direct_effects: `[]`
- operation: `product_help`
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: `[]`
- durable_effect: none

### Tour 9

**User**
> Preference durable de coaching: quand je nomme une envie de ranger pour eviter un message, pose une seule question de tri puis donne une seule action courte. Confirme avant de l'enregistrer.

**Sophia**
> Sophia sort correctement du product help et priorise la preference coach. Elle reformule en "moins de questions, plus courtes..." et demande confirmation.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- safety: `low`
- direct_effects: `[]`
- operation: `update_coach_preferences`
- pending_confirmation: oui/non
- memory_plan: n/a
- executed_tools: `[]`
- durable_effect: none, `tool_execution=blocked`

### Tour 10

**User**
> Oui, enregistre cette preference.

**Sophia**
> C'est fait. J'ai applique cette preference : je te poserai moins de questions, plus courtes, surtout quand tu es bloque.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: `[]`
- operation: `update_coach_preferences`
- pending_confirmation: confirmation recue
- memory_plan: n/a
- executed_tools: `["update_coach_preferences"]`
- durable_effect: `coach.question_tendency=low`

### Tour 11

**User**
> Je reviens a la conversation: qu'est-ce que tu as retenu sur la lampe verte et mon envie de ranger ?

**Sophia**
> La reponse visible est correcte: lampe verte = signal d'action pour envoyer 3 lignes a Maya et pas de rangement. Mais la trace route encore en product help.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: memoire conversationnelle visible, mauvais owner
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: `[]`
- durable_effect: none

### Tour 12

**User**
> Applique cette preference maintenant: je vois la lampe verte, j'ai envie de ranger, et j'ai honte que mon message a Maya soit brouillon. Une seule question puis une seule action courte.

**Sophia**
> Sophia active `emotional_repair`, pose une question et donne une action courte. Elle ne relance pas `update_coach_preferences`.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `emotional_repair` + application preference visible
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: `[]`
- durable_effect: none

### Tour 13

**User**
> J'ai envoye une version acceptable, mais la honte monte. Si tu as un outil doux pour redescendre, propose-le, mais ne lance rien sans mon oui.

**Sophia**
> Sophia propose un outil doux de regulation emotionnelle sans l'executer et demande oui/non.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_conversation_skill_continue`
- safety: `low`
- direct_effects: `[]`
- operation: proposition outil doux non executee
- pending_confirmation: oui/non conversationnel
- memory_plan: n/a
- executed_tools: `[]`
- durable_effect: none

### Tour 14

**User**
> Non, ne lance rien. Avant de cloturer, verifie sans modifier: carte Maya 3 lignes, rappel a 17h30, preference coach, et repere lampe verte / rangement.

**Sophia**
> Sophia respecte le blocage tool mais ne verifie que la carte d'attaque et l'absence de carte de defense. Elle oublie rappel, preference et repere.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `status_recap_request_blocks_tool_start`
- safety: `low`
- direct_effects: `[]`
- operation: status-only incomplet
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: `[]`
- durable_effect: none

### Tour 15

**User**
> Tu as oublie le rappel, la preference coach et le repere. Refais seulement le recap final: carte Maya, rappel a 17h30, preference coach, lampe verte = pas de rangement.

**Sophia**
> Sophia recupere partiellement: carte d'attaque, pas de carte de defense, rappel ponctuel a 17:30, preferences coach. Elle oublie encore le repere "lampe verte = pas de rangement" et la trace route a tort vers `update_coach_preferences`.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `central_arbitrator_coach_preference_priority`
- safety: `low`
- direct_effects: `[]`
- operation: recap visible, mauvais owner tool skill
- pending_confirmation: none
- memory_plan: n/a
- executed_tools: `[]`
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 1: le besoin humain est compris et la micro-action est utile.
- Tours 7-10: rappel, product help puis preference coach s'enchainent proprement. La sortie de product help vers preference est confirmee.
- Tours 12-13: la honte est traitee avec un ton adapte; l'outil doux est propose sans execution.
- Tour 15: le rappel et la preference sont recuperes apres correction utilisateur.

**Problemes**
- Tours 2-6: le flow carte reste laborieux. La demande initiale est complete, mais Sophia ne produit pas un draft complet avec confirmation visible; elle route meme un tour de correction en product help et perd le contexte au tour suivant. Impact: l'utilisateur doit piloter l'operation. Severite: red.
- Tour 11: la reponse visible de memoire est correcte, mais la trace product help indique une synchronisation systeme encore fragile. Severite: yellow.
- Tour 14: le status recap oublie trois des quatre elements explicitement demandes. Impact: l'utilisateur ne peut pas faire confiance au recap. Severite: red.
- Tour 15: le recap corrige le rappel et la preference, mais oublie encore le repere lampe verte / rangement. Severite: yellow.

**Fix propose**
- Pour `prepare_attack_card`, afficher directement le `confirmation_message` complet quand il est disponible dans metadata.
- Eviter que les demandes de "confirmation / brouillon attendu / demande-moi si je veux creer" soient classees en `product_help`.
- Etendre `status_recap_request_blocks_tool_start` pour couvrir toutes les entites nommees dans la demande: cartes, rappels, preferences, reperes conversationnels.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 2: ameliore par rapport a A6 car `prepare_attack_card` est bien selectionne, mais la sortie visible reste incomplete et `tool_execution=none`.
- Tour 3: regression: correction de confirmation routee en `product_help`.
- Tours 4-6: le tool skill cree finalement la carte, mais apres contexte perdu puis re-slotting.
- Tour 8: product help correct.
- Tour 9: `central_arbitrator_coach_preference_priority` corrige bien la capture product help pour preference durable.
- Tour 11: mauvais owner product help sur une demande de memoire conversationnelle.
- Tour 14: status-only bloque les tools mais ne restitue pas tous les elements demandes.
- Tour 15: mauvais owner `tool_skill/update_coach_preferences` pour un recap; aucun tool execute, mais trace trompeuse.

**Skills / Operations / Tools**
- `prepare_attack_card`: success durable au tour 6, carte id `684a13ed-f3bf-4afc-a221-b18cf1731138`. Mais confirmation UX et maintien de contexte restent mauvais.
- `create_one_shot_reminder`: success durable, rappel id `560721ae-2193-4238-ad61-2dc62af61041`, `scheduled_for=2026-05-28T15:30:00+00:00`.
- `product_help`: correct au tour 8; incorrect au tour 3 et tour 11.
- `update_coach_preferences`: success apres confirmation, `coach.question_tendency=low`; mauvais owner au tour 15.
- `emotional_repair`: correct aux tours 12-13.
- Outil doux / `select_state_potion`: toujours non surface comme `opportunity_operation`.

**Memory / Effets durables**
- Memoire conversationnelle: reponse correcte au tour 11, mais mauvais owner.
- Carte d'attaque: verifiee avant cleanup dans `user_attack_cards`, id `684a13ed-f3bf-4afc-a221-b18cf1731138`, asset `lampe verte = trois lignes a Maya, pas de rangement`.
- Rappel ponctuel: verifie avant cleanup dans `scheduled_checkins`, id `560721ae-2193-4238-ad61-2dc62af61041`, `scheduled_for=2026-05-28T15:30:00+00:00`.
- Preference coach: verifiee avant cleanup dans `user_profile_facts`, `coach.question_tendency=low`.
- Cleanup: post-cleanup verifie a 0 ligne sur les tables controlees.

**Problemes**
- Tour 3: mauvais owner product help pour une correction de confirmation carte. Severite: red.
- Tour 4: contexte de carte perdu apres confirmation. Severite: red.
- Tour 14: recap/status incomplet malgre demande explicite multi-surface. Severite: red.
- Tour 15: mauvais owner `update_coach_preferences` pour recap final. Severite: yellow.
- Tour 11: product help selectionne pour memoire conversationnelle. Severite: yellow.

**Fix propose**
- Ajouter des tests d'arbitrage pour confirmations/brouillons `prepare_attack_card` contenant "demande-moi si je veux creer", "cree cette carte", "avec ce brouillon".
- Persister l'operation draft active de `prepare_attack_card` sur le thread pour que "oui cree" ne perde pas l'action.
- Enrichir `status_recap_request_blocks_tool_start` avec retrieval durable + temp memory conversationnelle.
- Ajouter une regle: un recap final ne doit jamais selectionner `update_coach_preferences` si aucune nouvelle preference n'est demandee.

## Verdict Global

**red**

Les corrections ont partiellement fait leur travail: la preference durable sort correctement de product help, le rappel est cree et retrouve au recap corrige, et le refus d'outil est respecte. Mais le run reste red: le flow `prepare_attack_card` reste instable, un tour de correction de carte part en product help, le contexte est perdu sur confirmation, et le recap/status oublie encore des elements explicites.
