# QA Run Report - Coaching Recommendation Three Modes R1

## 1. Contexte Du Test

- Date: 2026-06-18
- Runs:
  - `coachingrec-no-plan-20260618-r1`
  - `coachingrec-action-plan-20260618-r1`
  - `coachingrec-potion-20260618-r1`
- Persona: trois personas QA temporaires locales.
- Objectif: tester `coaching_recommendation` sur les trois modes attendus depuis le dispatcher global: action hors plan, action dans le plan, et potion/emotionnel.
- Trajectoire:
  - no-plan: mail hors plan -> demande carte libre -> changement vers action plan -> cloture du mail.
  - action-plan: action plan seedee "Preparer le dossier mutuelle" -> attack card -> guidance produit -> adjust plan -> defense card -> recap.
  - potion: stress fort -> potion -> destination -> refus carte -> changement vers action hors plan.
- Surfaces visees: dispatcher global, `dispatcher_signal_context`, local dispatcher `coaching_recommendation`, active flow state, visible agents `no_plan_coaching`, `action_plan_coaching`, `emotion_coaching`, `change_confirm_coaching_type`, product guidance, absence d'outils.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, aucun fallback deterministe. Aucun changement runtime pendant les runs; un helper QA temporaire `tmp/qa_seed_coaching_plan.mjs` a ete cree pour seed un vrai plan sur le run action-plan.
- Validite QA: valide. Chaque run a 5 tours. Cleanup cible effectue pour les trois users; `user_memories` retourne `404` car absent du schema local. Verification post-cleanup action-plan: `user_plan_items=[]`, `user_plans_v2=[]` pour le `qa_run_id`.

Raw states:

- `tmp/qa-normal-conversation/coachingrec-no-plan-20260618-r1/state.json`
- `tmp/qa-normal-conversation/coachingrec-action-plan-20260618-r1/state.json`
- `tmp/qa-normal-conversation/coachingrec-potion-20260618-r1/state.json`

## 2. Tours De Conversation

## Run A - No Plan

### Tour 1

**Verdict du tour:** green

**User**
> J'ai un mail a envoyer a Camille, mais ce n'est pas une action dans mon plan Sophia. Quand j'ouvre le brouillon je bloque et je pars faire autre chose. Aide-moi a choisir quoi faire, sans rien creer depuis le chat.

**Sophia**
> Ouvre le brouillon et écris juste l’objet, sans finir le mail. Ensuite tu t’arrêtes là.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun
- state: `coaching_type=no_plan_action`, `target_kind=free_action`, `candidate_features=[]`

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-03` - Product/status/tool mal priorises; `BF-INTAKE-05` - Semantique composite aplatie

**User**
> Ok. Mais si je veux une carte d'attaque libre pour ce mail hors plan, est-ce que c'est possible ou tu dois me renvoyer vers le plan ?

**Sophia**
> Commence par une seule ligne : l’objet du mail, puis une phrase d’ouverture très simple, par exemple « Salut Camille, je t’écris pour… ». Vise juste un brouillon assez bon pour partir, pas un mail parfait.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun
- state: `coaching_type=no_plan_action`, `candidate_features=[]`

**Analyse si yellow/red**
- Symptome: Sophia garde le bon owner mais ne repond pas a la question produit "carte d'attaque libre possible ou pas".
- Source amont probable: matrice locale no-plan trop restrictive ou prompt visible qui transforme une question produit libre en coaching classique.
- Owner runtime: `coaching_recommendation` local dispatcher/reducer + `no_plan_coaching`.
- Meilleure correction selon les guidelines: formaliser dans le contrat no-plan si les cartes libres sont autorisees, puis injecter la destination/limite correcte au visible agent.
- Pourquoi ce n'est pas un patch local: le bug vient du contrat de disponibilite feature par `coaching_type`, pas d'une phrase.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-03` - Product/status/tool mal priorises; `BF-INTAKE-03` - Contrainte explicite perdue

**User**
> Tu n'as pas vraiment repondu: je parle bien d'une carte libre, pas liee au plan. Je peux la preparer ou pas dans Sophia ?

**Sophia**
> Commence par une version moche : écris juste l’objet et 2 lignes très simples, sans chercher la bonne formulation. Si ça bloque encore, envoie-moi le but du mail en une phrase et je t’aide à le rendre plus direct.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le user corrige explicitement le manque de reponse, mais Sophia ignore encore la question "je peux la preparer ou pas".
- Source amont probable: `no_plan_action` bloque toute feature produit et le visible agent n'a pas de contexte pour cartes libres.
- Owner runtime: `coaching_recommendation` local reducer / feature matrix.
- Meilleure correction selon les guidelines: ajouter une branche explicite cartes libres hors plan si produit supporte ce cas; sinon repondre clairement que ce n'est pas disponible. Ne pas esquiver.
- Pourquoi ce n'est pas un patch local: il faut trancher le contrat produit no-plan.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - Ancien flow capture une nouvelle intention; `BF-STATE-01` - Mauvaise transition de flow

**User**
> En fait il y a aussi une autre action, 'preparer le dossier mutuelle', qui elle est dans mon plan. Je cherche peut-etre une solution pour celle-la aussi.

**Sophia**
> Oui, on reste sur du coaching simple pour débloquer ce mail. Dis-moi juste ce qui te bloque en premier quand tu ouvres le brouillon.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun
- state warning: `user_chat_states.temp_memory` vide apres ce tour dans le snapshot du runner.

**Analyse si yellow/red**
- Symptome: le user introduit une action de plan distincte, Sophia reste sur le mail hors plan.
- Source amont probable: active flow/local dispatcher ne detecte pas le changement de cible ou ne route pas vers `change_confirm_coaching_type`.
- Owner runtime: active flow policy + `coaching_recommendation` local dispatcher.
- Meilleure correction selon les guidelines: quand le dernier message contredit le `coaching_type` courant, produire `change_confirm_coaching_type` ou basculer avec confirmation.
- Pourquoi ce n'est pas un patch local: le probleme est une mise a jour de type/ownership en cours de flow.

### Tour 5

**Verdict du tour:** green

**User**
> Pour le mail hors plan, je veux juste un premier geste concret et apres on arrete ce sujet.

**Sophia**
> Ouvre le brouillon et écris seulement la première ligne utile du mail, puis arrête-toi là.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun
- state: nouveau state `coaching_type=no_plan_action`

## Run B - Action Dans Le Plan

Plan fixture: action active `Preparer le dossier mutuelle`, `plan_item_id=fc27a3db-34f6-4346-8461-33d6e1761462`, nettoyee apres run.

### Tour 1

**Verdict du tour:** green

**User**
> Dans mon plan Sophia, j'ai l'action 'Preparer le dossier mutuelle'. Je la repousse depuis deux jours: quand je l'ouvre, je ne sais pas par quel justificatif commencer. Est-ce que je devrais preparer une carte d'attaque, une defense, ou ajuster l'action ?

**Sophia**
> Le bon levier ici, c’est une carte d’attaque. Elle sert à préparer ta mission en amont et à rendre le premier geste plus simple, surtout quand tu bloques au démarrage. Pour ton dossier mutuelle, elle peut t’aider à clarifier le tout premier justificatif à traiter.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun
- state: `coaching_type=plan_action`, `target_kind=plan_action`, `action_title=Preparer le dossier mutuelle`

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-03` - Product/status/tool mal priorises

**User**
> Ok, si je veux la preparer moi-meme, je vais ou exactement ? Je ne veux pas que tu la crees depuis le chat.

**Sophia**
> La bonne piste ici, c’est une carte d’attaque. Elle t’aide à préparer le premier geste pour “Préparer le dossier mutuelle” et à rendre le démarrage plus simple. Si tu veux la retrouver, c’est dans l’espace des cartes d’attaque.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: la reponse parle de "retrouver" dans l'espace cartes au lieu de dire clairement que la preparation part de l'action concernee dans le plan.
- Source amont probable: visible agent `action_plan_coaching` / product guidance insuffisamment specifique.
- Owner runtime: `coaching_recommendation.visible.action_plan_coaching`.
- Meilleure correction selon les guidelines: pour une question "preparer moi-meme", rendre la destination "depuis l'action du plan"; reserver Ressources/cartes a la consultation.
- Pourquoi ce n'est pas un patch local: c'est la surface produit canonique du flow action-plan.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-05` - Semantique composite aplatie

**User**
> En fait l'action me parait peut-etre trop grosse: il y a carte vitale, facture, mutuelle, message a ecrire. Dans ce cas je garde la carte d'attaque ou j'ajuste l'action du plan ?

**Sophia**
> Je te conseille une carte d’attaque pour cette mission. Elle sert à rendre le premier geste plus simple et à t’aider à démarrer sans te disperser. Ici, le bon levier est de préparer le dossier en amont, pas de réajuster le plan.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun
- state warning: cause reste `unclear` / recommandation stale attack-card alors que le message indique action trop grosse.

**Analyse si yellow/red**
- Symptome: signal fort `too_hard`/action trop large, mais Sophia refuse `adjust_plan`.
- Source amont probable: local dispatcher ne met pas a jour `failure_mode`/`cause_analysis` apres une nouvelle evidence utilisateur.
- Owner runtime: `coaching_recommendation` local dispatcher/reducer.
- Meilleure correction selon les guidelines: en action-plan, `too_hard`, `rhythm_mismatch`, `misaligned_action` doivent pouvoir remplacer la recommandation active par `adjust_plan`.
- Pourquoi ce n'est pas un patch local: c'est le mapping cause -> feature et la mise a jour d'etat.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-05` - Semantique composite aplatie

**User**
> Le moment ou je decroche, c'est quand je vois qu'il manque un justificatif: je ferme tout et je me dis que je le ferai plus tard. La, une carte de defense serait plus adaptee ?

**Sophia**
> Pour cette mission, la bonne piste c’est une carte d’attaque. Elle t’aide à préparer le premier geste et à rendre le démarrage plus simple. Ici, l’idée est de clarifier le tout premier justificatif à traiter.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le user donne un moment de rupture concret, mais Sophia reste sur attack card au lieu de defense card.
- Source amont probable: `risk_moment` n'est pas reconnu en cours de flow ou recommendation active trop sticky.
- Owner runtime: `coaching_recommendation` local dispatcher/reducer.
- Meilleure correction selon les guidelines: `risk_moment`, abandon, craquage, fermeture du flux doivent prioriser defense card quand l'action est plan-bound.
- Pourquoi ce n'est pas un patch local: le reducer doit accepter une nouvelle cause et changer de levier.

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow; `BF-INTAKE-05` - Semantique composite aplatie

**User**
> Donc si je comprends bien, attaque pour demarrer, defense si je risque de fermer quand il manque une piece, et ajuster le plan si l'action est trop grosse. Tu confirmes ou tu gardes seulement attaque ?

**Sophia**
> Pour cette mission, le bon levier est la carte d’attaque : elle aide à préparer le démarrage et à rendre le premier geste plus simple. Ici, l’idée est de clarifier le premier justificatif à traiter pour réduire la friction au moment de commencer.
>
> Si tu veux la préparer, ça se fait depuis l’action concernée dans le plan, pas depuis Ressources.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: meme quand le user formule la matrice correcte, Sophia persiste sur `attack_card` uniquement.
- Source amont probable: recommandation active stale et local dispatcher incapable de reclasser les nouveaux signaux.
- Owner runtime: `coaching_recommendation` state/reducer.
- Meilleure correction selon les guidelines: le local dispatcher doit pouvoir remplacer `current_recommendation` quand le user apporte une evidence contradictoire.
- Pourquoi ce n'est pas un patch local: c'est une regle de lifecycle de recommandation.

## Run C - Potion

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-03` - Product/status/tool mal priorises

**User**
> Je suis dans un etat de stress tres fort, je tourne en boucle et je n'arrive pas a redescendre. Je ne cherche pas une action du plan, je veux savoir quel type de potion pourrait m'aider dans Sophia.

**Sophia**
> Dans ton cas, la potion d’apaisement est la plus adaptée : elle aide quand la pression monte, que ça tourne en boucle et que tu n’arrives pas à redescendre. Si tu veux, ouvre Ressources et choisis l’apaisement.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun
- state: `coaching_type=emotional`, `primary_cause=emotional_overload`

**Analyse si yellow/red**
- Symptome: bonne potion, mais Sophia force une navigation produit alors que le user demandait quel type, pas ou la trouver.
- Source amont probable: `emotion_coaching` visible agent encore trop prompt a rendre la destination.
- Owner runtime: `coaching_recommendation.visible.emotion_coaching`.
- Meilleure correction selon les guidelines: rendre la destination uniquement si la demande contient une vraie question d'emplacement.
- Pourquoi ce n'est pas un patch local: il faut respecter le contrat "ne pas forcer navigation produit".

### Tour 2

**Verdict du tour:** green

**User**
> Ok, et si je veux la trouver moi-meme dans Sophia, je vais ou exactement ? Ne lance rien depuis le chat.

**Sophia**
> Va dans Ressources, puis ouvre les Potions. Vu ton stress très fort, la potion d’apaisement est la plus adaptée pour t’aider à redescendre.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun

### Tour 3

**Verdict du tour:** green

**User**
> Et si je preparais plutot une carte d'attaque pour me forcer a redescendre vite, ce serait mieux qu'une potion ?

**Sophia**
> Pour ce que tu décris, la potion d’apaisement est la plus adaptée. Elle aide quand la pression monte, que la rumination tourne en boucle et que tu n’arrives pas à redescendre. Si tu veux, je peux aussi t’aider à voir si c’est plutôt apaisement ou guérison selon ce qui te pèse le plus.

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun

### Tour 4

**Verdict du tour:** green

**User**
> En fait il y a aussi une action: je dois appeler ma banque, et c'est surtout ca qui me bloque. On peut passer sur une solution pour cette action ?

**Sophia**
> Tu veux qu’on traite ça comme une action du plan, une action hors plan, ou plutôt comme un état émotionnel ?

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun
- state: `coaching_type=emotional`, user_need_summary reconnait une action precise hors plan; visible confirmation attendue

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - Slot fourni mais redemande; `BF-STATE-01` - Mauvaise transition de flow

**User**
> Hors plan. L'appel a la banque n'est pas dans mon plan, je veux juste savoir comment demarrer sans paniquer.

**Sophia**
> Tu veux qu’on traite ça comme une action de ton plan, une action hors plan, ou plutôt comme un état émotionnel ?

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: `none`
- direct_effects: []
- operation: none
- pending_confirmation: none
- executed_tools: []
- durable_effect: aucun
- state warning: `coaching_type` reste `emotional`, alors que le slot "hors plan" a ete fourni.

**Analyse si yellow/red**
- Symptome: Sophia redemande exactement le type alors que le user a fourni "hors plan".
- Source amont probable: `change_confirm_coaching_type` n'ecrit pas la transition vers `no_plan_action` ou le local dispatcher ne consomme pas la reponse de confirmation.
- Owner runtime: `coaching_recommendation` local dispatcher/state reducer.
- Meilleure correction selon les guidelines: apres une reponse claire au visible agent de confirmation, mettre a jour `coaching_type` et router vers l'agent cible.
- Pourquoi ce n'est pas un patch local: c'est la transition state machine du flow.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Les trois premiers signaux globaux sont globalement bien identifies: no-plan -> coaching classique, action plan -> attack card, emotionnel -> potion.
- Aucun outil n'est execute, aucun effet durable non consenti n'est observe.
- L'ownership reste majoritairement `coaching_recommendation`; pas de saut vers `product_help` ni tool skill.
- Le run potion maintient correctement `state_potion` contre une mention de carte d'attaque au tour 3.

**Problemes**
- No-plan T2-T3: Sophia esquive deux fois la question explicite sur carte d'attaque libre hors plan. Famille: `BF-ROUTE-03` / `BF-INTAKE-03`. Impact: le user ne sait pas si la feature existe. Severite: red.
- No-plan T4: changement vers action du plan ignore, Sophia reste sur le mail. Famille: `BF-ROUTE-02`. Impact: changement de sujet non respecte. Severite: red.
- Action-plan T3-T5: recommandation `attack_card` trop sticky; `adjust_plan` et `defense_card` ne prennent jamais le relais malgre signaux forts. Famille: `BF-INTAKE-05` / `BF-STATE-01`. Impact: mauvais conseil produit. Severite: red.
- Potion T1: navigation produit forcee. Famille: `BF-ROUTE-03`. Impact: friction faible mais visible. Severite: yellow.
- Potion T5: le flow redemande le type apres une reponse claire. Famille: `BF-INTAKE-01` / `BF-STATE-01`. Impact: boucle de clarification. Severite: red.

**Fix propose**
- Source amont: `coaching_recommendation` local dispatcher/reducer et prompts visibles specialises.
- Correction recommandee:
  - definir explicitement la matrice no-plan pour cartes libres: autorisees ou non, avec destination et limites;
  - permettre au dispatcher local de mettre a jour `cause_analysis` et `recommendation` quand le user apporte une evidence contradictoire;
  - consommer la reponse de `change_confirm_coaching_type` pour changer `coaching_type`;
  - rendre la guidance produit seulement quand la demande porte sur l'emplacement.
- Tests d'invariant attendus:
  - no-plan: "carte libre hors plan possible ?" recoit une reponse explicite;
  - action-plan: "action trop grosse" -> `adjust_plan`; "je ferme tout quand X arrive" -> `defense_card`;
  - change type: emotionnel -> "hors plan" bascule vers `no_plan_coaching` au tour suivant;
  - potion: pas de destination produit sans question d'emplacement.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Les owners initiaux sont corrects: `response_owner=coaching_recommendation`, `selected_handler=coaching_recommendation` sur les 15 tours.
- No-plan et action-plan restent dans `active_coaching_recommendation`, mais la state machine ne traite pas correctement les changements de cible ou de cause.
- Potion T4 route bien vers une question de confirmation, mais T5 ne consomme pas la reponse "hors plan".

**Skills / Operations / Tools**
- `selected_skill_id=coaching_recommendation` sur tous les tours.
- Aucun `tool_skill_intents`, aucune operation, aucun direct effect.
- `executed_tools=[]` sur tous les tours.

**Memory / Effets durables**
- Aucun `scheduled_checkin` cree.
- Action-plan: un plan fixture temporaire a ete seed pour le user QA; cleanup verifie `user_plan_items=[]` et `user_plans_v2=[]` apres run.
- Cleanup des trois users: `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users` OK; `user_memories=404` attendu dans ce schema.

**Problemes**
- La recommandation active devient stale dans action-plan.
- Le changement de `coaching_type` n'est pas systematiquement applique apres confirmation.
- La matrice no-plan actuelle n'est pas alignee avec l'hypothese produit "cartes attaque/defense creatables en mode libre".

**Fix propose**
- Ajouter un invariant reducer: une evidence nouvelle peut remplacer `primary_cause` et `current_recommendation` dans le meme `coaching_type`.
- Ajouter une transition explicite `pending_type_change -> coaching_type` apres reponse user claire.
- Clarifier le contrat produit no-plan pour `attack_card` / `defense_card` libres, puis adapter reducer, prompts et tests.

## Verdict Global

Red. Le premier signal dispatcher marche pour les trois modes, et l'ownership reste dans `coaching_recommendation`. Mais le flow n'est pas encore robuste: no-plan ne sait pas repondre aux cartes libres, action-plan reste trop colle a `attack_card`, et `change_confirm_coaching_type` ne consomme pas toujours la reponse utilisateur.
