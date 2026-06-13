# QA Run Report - Weekly Full R7

## 1. Contexte Du Test

- Date: 2026-06-13
- Run: `weekly-full-20260613-r7-rose`
- Persona: Rose, connexion locale `tests/real-personas/rose/connection.json`
- Objectif: verifier le weekly complet apres patch R6: corrections action partielles, qualification defense, handoff defense lie au Plan, absence de claim sans commit, cloture durable meme tour.
- Trajectoire: weekly opening -> action review -> action blocker -> global progress feeling -> child flow `prepare_defense_card` -> retour weekly -> synthese -> cloture.
- Surfaces visees: `weekly_adaptive_review_v1`, `prepare_defense_card`, retour parent apres child flow, durable weekly, cleanup QA.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, hors sandbox pour les tours, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide avec incident. 10 tours reels, un tour fallback dispatcher au T2, reprise au T3, cleanup effectue. `remaining_scope_messages=0`, `preserved_created_user_chat_states=[]`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Oui, lançons le weekly. Cette semaine m’a laissée partagée : j’ai vu quelques vrais progrès, mais les fins de journée restent le moment où je me sens la plus fragile. J’aimerais qu’on fasse un bilan honnête, sans enjoliver.

**Sophia**
> C'est noté pour le matériel qui reste bien hors de vue. En revanche, cibler le joint réflexe a été partiel et le sas de décompression n'a pas pu se faire à cause de la fatigue. Qu'est-ce qui a manqué pour que l'action sur le joint réflexe soit plus simple à réaliser ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_review_local_dispatcher`
- visible_task: `review_action_gaps`
- committed_effects: `[]`

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition/continuation de flow local

**User**
> Action par action : le rangement du matériel, je l’ai tenu lundi, mardi et mercredi, puis jeudi et vendredi j’ai relâché et la boîte est revenue sur la table. Pour le joint réflexe, j’ai mieux identifié le moment : surtout après le dîner. Le sas de décompression, je l’ai fait seulement deux soirs ; quand je rentre épuisée, la version prévue me paraît trop longue.

**Sophia**
> Je garde le point weekly, mais je n'arrive pas a traiter correctement ce tour. Reessaie dans un instant.

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- status: `blocked`
- reason_code: `weekly_review_local_dispatcher_failed`
- blocked_effects: `local_dispatcher_failed`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le dispatcher local weekly echoue sur une reponse action-review riche et tombe sur le fallback technique.
- Source amont probable: robustesse du JSON dispatcher weekly apres ajout de `action_status_updates`, probablement sortie IA non parsee ou contrat trop lourd.
- Owner runtime: `weekly_adaptive_review_v1.local_dispatcher`.
- Meilleure correction selon guidelines: tracer la raw response dispatcher et durcir le contrat/schema local sans ajouter regex metier ni renderer deterministe.
- Pourquoi ce n'est pas un patch local: le probleme est la fiabilite de sortie structuree du dispatcher local, pas le wording visible.

### Tour 3

**Verdict du tour:** green

**User**
> Je reprends plus simplement : le rangement n’est pas une réussite complète, seulement trois jours. Le joint réflexe est surtout après le dîner. Le sas a marché deux soirs, mais il est trop long quand je suis épuisée.

**Sophia**
> C'est noté pour ces précisions. Le sas de décompression semble difficile à maintenir avec la fatigue en fin de semaine. Est-ce que c'est la durée de l'exercice qui pèse, ou le fait de devoir s'y mettre quand l'énergie manque ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `explore_action_blocker`
- committed_effects: `[]`

### Tour 4

**Verdict du tour:** green

**User**
> C’est surtout le moment où l’énergie manque. Je rentre, je vois la boîte, et là j’ai une envie très automatique d’ouvrir avant même d’avoir commencé le sas. Si je tiens les dix premières minutes, après ça se calme.

**Sophia**
> Au vu de ces défis avec la fatigue et cette fenêtre de dix minutes au retour, quel est ton sentiment sur ta progression globale vers ton objectif cette semaine ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `ask_global_progress_feeling`
- committed_effects: `[]`

### Tour 5

**Verdict du tour:** green

**User**
> Je dirais que j’ai un petit sentiment d’avancée, parce que je comprends beaucoup mieux le vrai moment dangereux. Mais émotionnellement je reste inquiète : j’ai peur que les soirs de fatigue me fassent retomber dans le pilote automatique.

**Sophia**
> C'est normal d'avoir cette crainte quand la fatigue s'installe. Pour sécuriser tes retours et éviter l'automatisme, on pourrait préparer une carte de défense spécifique pour ton sas de décompression. On fait ce petit détour pour renforcer ta protection et on termine le bilan juste après, ça te convient ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `qualify_solution_fit`
- target solution: `prepare_defense_card`
- committed_effects: `[]`

### Tour 6

**Verdict du tour:** green

**User**
> Oui, faisons ce détour défense. Je veux qu’elle protège précisément le retour à la maison, la boîte visible, et les dix premières minutes où je dois aller vers la douche plutôt que négocier avec moi-même.

**Sophia**
> Est-ce que c'est le simple fait de voir la boîte en arrivant qui est le signal le plus fort pour toi ?

**Trace courte**
- selected_handler: `prepare_defense_card`
- route_reason: `weekly_adaptive_review_v1_handoff_to_prepare_defense_card`
- status: `collecting`
- committed_effects: `[]`

### Tour 7

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PREF-01 - Preference/persona non appliquee runtime

**User**
> Oui, le signal principal c’est vraiment la boîte visible en rentrant. Ça déclenche la négociation intérieure : juste un peu, juste pour redescendre. La défense doit m’aider à casser ce pilote automatique pendant dix minutes.

**Sophia**
> Est-ce que ça te va comme formulation : « Quand je rentre fatigué et que je vois la boîte, pour casser la négociation intérieure pendant les 10 premières minutes. »

**Trace courte**
- selected_handler: `prepare_defense_card`
- status: `collecting`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: accord masculin `fatigué` pour Rose.
- Source amont probable: prompt visible/persona context de `prepare_defense_card`, pas weekly.
- Owner runtime: `prepare_defense_card.visible_agent`.
- Meilleure correction selon guidelines: transmettre le contexte persona ou imposer formulations neutres/feminines quand la persona est connue, sans regex de post-traitement.
- Pourquoi ce n'est pas un patch local: c'est une contrainte de persona/tone du visible agent, pas un remplacement de chaine.

### Tour 8

**Verdict du tour:** green

**User**
> Oui, le fond est bon. Je dirais juste “quand je rentre fatiguée” au féminin, et j’ajouterais que le but est de filer directement à la douche avant d’ouvrir la boîte.

**Sophia**
> Voici la formulation pour ta carte. Tu peux la copier dans le champ **Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?** :
>
> « Quand je rentre fatiguée et que je vois la boîte : filer directement à la douche pour casser la négociation des 10 premières minutes. »
>
> Il te suffit de l'ajouter dans l'action concernée du Plan, section Cartes de défense. Note bien que la carte n'est pas créée automatiquement ici, c'est à toi de l'ajouter manuellement.

**Trace courte**
- selected_handler: `prepare_defense_card`
- status: `handoff_delivered`
- tool_execution: `platform_handoff`
- platform_flow.route_kind: `plan_item_card`
- platform_destination: `dans l'action concernée du Plan, section Cartes de défense`
- no_chat_mutation: `true`
- committed_effects: `[]`

### Tour 9

**Verdict du tour:** green

**User**
> Ok, je l’ajouterai moi-même dans l’action du Plan. Reprenons le weekly : je veux que la synthèse dise bien que le rangement est partiel, que la carte est seulement préparée dans la conversation, et que l’objectif global avance un peu mais reste fragile.

**Sophia**
> La fatigue a pesé cette semaine, mais tu as maintenu tes efforts. Le rangement du matériel et le sas de décompression restent partiels : tu as réussi à les mettre en place en début de semaine avant que l'épuisement ne prenne le dessus. L'objectif global avance un peu, même si cela te semble encore fragile. Pour t'aider, les éléments de ta carte de défense ont été préparés pour que tu puisses les saisir dans ton Plan, section Cartes de défense. Est-ce que cette synthèse te semble juste pour clore la semaine ?

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- visible_task: `weekly_synthesis`
- committed_effects: `[]`
- child_flow_result: `created=false`, `available=false`, `user_must_create=true`

### Tour 10

**Verdict du tour:** green

**User**
> Oui, cette synthèse me semble juste. On peut clôturer ce weekly comme ça.

**Sophia**
> Le point weekly est terminé. La synthèse est cohérente, avec un léger progrès et un état de fin de semaine plutôt fatigué mais ok. Le sujet du sas de retour a été préparé pour que tu le saisisses dans la plateforme, puis on s’arrête là pour ce weekly.

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- status: `closed`
- reason_code: `weekly_review_local_complete_weekly_no_change`
- visible_task: `weekly_closure`
- durable: `active_status=completed`, `validation_unlock.status=available`, `closure_status=complete`
- committed_effects: `[]`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le weekly garde maintenant une vraie structure: actions/gaps, blocage, ressenti d'avancee globale, solution, detour, synthese, cloture.
- La proposition d'outil est plus intelligente: Sophia choisit directement une carte de defense pour un moment critique, sans drift attaque.
- La synthese respecte les statuts partiels et ne dit plus que la carte est disponible ou creee.
- Le retour du child flow vers weekly est fluide et comprehensible.
- La cloture visible correspond maintenant a une cloture durable.

**Problemes**
- Tour 2: fallback technique du dispatcher local sur une reponse action-review riche. Famille: BF-STATE-01. Impact: rupture conversationnelle nette. Severite: red pour le tour, yellow pour le run car reprise possible.
- Tour 7: accord masculin `fatigué` pour Rose. Famille: BF-PREF-01. Impact: baisse de finesse/personnalisation. Severite: yellow.

**Fix propose**
- Source amont: weekly local dispatcher JSON robustness; `prepare_defense_card` visible context/persona.
- Correction recommandee: tracer/inspecter la raw response T2 et simplifier ou renforcer le schema `action_status_updates`; propager une contrainte de genre/persona ou formulations neutres au visible agent defense.
- Tests d'invariant attendus: action-review riche multi-action ne bloque pas; defense visible n'utilise pas d'adjectif genré incorrect pour Rose.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Global dispatcher normal skippe le flow actif: `blocked_paths` inclut `global_dispatcher` au T1, puis `active_weekly_review_local_dispatcher` sur les tours weekly.
- Handoff local correct au T6 vers `prepare_defense_card`.
- Retour parent weekly correct au T9.

**Skills / Operations / Tools**
- `prepare_defense_card` livre un `platform_handoff` non mutant.
- `route_kind=plan_item_card` et destination visible sont maintenant alignes: `dans l'action concernée du Plan, section Cartes de défense`.
- Aucun tool executable ni effet durable engageant n'est appele.

**Memory / Effets durables**
- Durable T10: `active_status=completed`, `validation_unlock.status=available`, `weekly_gates.closure_status=complete`.
- Durable T10: `child_flow.result_details.created=false`, `available=false`, `user_must_create=true`, `committed_effect_count=0`.
- Durable T10: `user_corrected_action_statuses` contient `Ranger le matériel hors de vue=partial` et `Faire un sas de décompression=partial`.
- Cleanup: scope courant supprime, messages restants `0`, aucun scope hors run supprime.
- Warning testability: requete REST `conversation_turn_traces` retourne encore `400`; les traces exploitees sont celles renvoyees inline par chaque response.

**Problemes**
- T2: `weekly_review_local_dispatcher_failed`. Famille: BF-STATE-01. Severite: red localisee.
- T7: persona/genre mal transmis dans visible defense. Famille: BF-PREF-01. Severite: yellow.

**Fix propose**
- Source amont: `weekly_adaptive_review_v1.local_dispatcher`, `prepare_defense_card.visible_agent`.
- Correction recommandee: ajouter un test IA/fixture sur reponse action-review longue avec corrections multiples; ajouter contexte persona/tone constraints au visible defense.
- Tests d'invariant attendus: no dispatcher fallback on multi-action weekly correction; no wrong gendered adjective in defense visible proposal.

## Verdict Global

- Verdict: yellow
- Raison principale: les fixes R6 sont confirmes, mais un fallback dispatcher T2 empeche un green complet.
- Follow-up prioritaire: rendre le dispatcher weekly robuste aux corrections action-review riches, puis corriger la personnalisation de genre dans `prepare_defense_card`.
