# QA Run Report — demotivation_repair local doctrine R3

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `2026-06-10-demotivation-repair-local-doctrine-r3`
- Persona: connexion temporaire locale `demotivationlocal_20260610_r3`, user id `94788d44-8dba-4d19-9202-2b2b83363acd`
- Objectif: verifier en conditions reelles le correctif `max_questions` du flow local `demotivation_repair`, et controler l'absence de potion prematuree.
- Trajectoire: demotivation liee a une action de fin de journee, reconnexion au sens, refus d'une carte, arret local.
- Surfaces visees: dispatcher global entree skill, dispatcher local `demotivation_repair`, visible agent stage-specific, bridge potion/action card, effets durables.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, messages QA choisis tour par tour apres lecture des reponses et traces.
- Validite QA: valide. Aucun renderer deterministe, aucun fallback direct, aucun run staging/remote. Connexion temporaire nettoyee apres run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je continue mon plan mais j'ai perdu le fil. Les actions avancent un peu, sauf que je ne sens plus pourquoi elles comptent, et ca me donne envie de tout laisser glisser.

**Sophia**
> C'est une sensation tres lourde... Si tu devais regarder un instant en arriere, quel etait l'impact ou le changement concret que tu esperais vraiment obtenir en commencant tout cela ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- flow_action: `restore_meaning`
- visible_task: `restore_meaning`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: none
- potion_bridge_status: `candidate`
- selected_potion: null
- conversation_context.max_questions: 1

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Au depart je voulais retrouver de la place dans ma tete et arreter de vivre mes journees comme une suite d'obligations. La, mes taches sont devenues correctes sur le papier mais elles ne me rendent pas plus disponible.

**Sophia**
> C'est epuisant... Parmi les choses qui occupent vos journees, laquelle vous donne le plus l'impression de travailler contre votre besoin de retrouver de la place dans votre tete ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: active flow continuation
- flow_action: `restore_meaning`
- visible_task: `restore_meaning`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: none
- potion_bridge_status: `candidate`
- selected_potion: null
- conversation_context.max_questions: 1

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> C'est le tri de fin de journee. Je le fais, mais je le vis comme une preuve que je n'ai jamais fini. En vrai j'aimerais le voir comme un moyen de fermer la journee et de choisir plus calmement demain.

**Sophia**
> Passer de la « preuve d'inacheve » a un rituel de fermeture change tout... Qu'est-ce que ce changement de regard modifie dans ton rapport a ce moment de la journee ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: active flow continuation
- flow_action: `restore_meaning`
- visible_task: `restore_meaning`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: none
- potion_bridge_status: `candidate`
- selected_potion: null
- last_offer: null
- conversation_context.max_questions: 1

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-03 — Product/status/tool mal priorises

**User**
> Ca le rend moins accusateur. Si je me dis que ce tri sert a poser la journee au lieu de me juger, je peux le faire en gardant l'idee que je recupere un peu de calme pour demain.

**Sophia**
> Ce passage du jugement a la protection de ton calme futur change tout. Le tri devient un rituel de fermeture qui preserve ta clarte mentale pour le lendemain. Je peux formaliser cette approche dans une carte de soutien pour t'aider a l'ancrer. Je preparerai ce support des reception de ton accord.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: active flow continuation
- flow_action: `action_card_candidate`
- visible_task: `action_card_candidate`
- response_intent: `action_card_ready`
- safety: none
- direct_effects: none
- operation: none
- operation_suggestions: []
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: none
- potion_bridge_status: `candidate`
- selected_potion: null
- last_offer: null
- conversation_context.max_questions: 0

**Analyse si yellow/red**
- Symptome: Sophia stabilise bien le sens retrouve, mais pousse ensuite une carte de soutien alors que le user n'a pas demande d'objet produit ni d'action.
- Source amont probable: dispatcher/reducer local `demotivation_repair`, seuil ou contrat de `action_card_candidate` trop permissif apres une reconnexion au sens.
- Owner runtime: `demotivation_repair`.
- Meilleure correction selon les guidelines: reserver `action_card_candidate` aux cas ou le user demande explicitement un support/action, ou quand l'opportunite produit est suffisamment explicite et conservee comme proposition non intrusive.
- Pourquoi ce n'est pas un patch local: le probleme est une decision de stage visible et non une phrase isolee; il faut corriger la decision structuree du dispatcher/reducer, pas seulement reformuler le message.

### Tour 5

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pas maintenant pour la carte. Je veux juste garder la phrase et m'arreter la pour aujourd'hui.

**Sophia**
> C'est entendu, nous nous arretons la pour aujourd'hui. L'essentiel est d'avoir redonne du sens a ce rituel de tri : il n'est plus une contrainte, mais un geste concret pour proteger ton calme futur. A bientot.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: active flow continuation
- skill_status: `complete`
- flow_action: `complete_flow`
- visible_task: `exit_or_cancel`
- response_intent: `exit_to_global_dispatcher`
- reason_code: `demotivation_repair_exit_to_global_dispatcher`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: none
- executed_tools: none
- durable_effect: none
- potion_bridge_status: `blocked`
- selected_potion: null
- target_dispatcher: null
- conversation_context.max_questions: 0

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia reste dans le flow de demotivation repair et travaille bien la perte de sens au lieu de basculer vers une reponse normale.
- Le correctif `max_questions` est valide en situation reelle: les tours 1 et 3 posent une question avec `conversation_context.max_questions=1`.
- La potion reste interne: `selected_potion=null`, aucune offre de potion visible et aucun handoff potion.
- Le refus de carte au tour 5 est respecte: arret local propre, sans dispatcher global sur le meme tour.

**Problemes**
- Tour 4: proposition de carte de soutien trop rapide apres une stabilisation conversationnelle. Famille: BF-ROUTE-03. Impact: l'utilisateur peut sentir une pression produit alors qu'il voulait surtout garder une phrase et conclure. Severite: yellow.
- Tour 2: leger frottement de ton, passage de `tu` a `vous`. Impact faible, pas bloquant systeme. Severite: green/yellow leger.

**Fix propose**
- Source amont: dispatcher/reducer local `demotivation_repair`, decision `action_card_candidate`.
- Correction recommandee: ne produire `action_card_candidate` que si le message courant demande ou accepte clairement un support, une carte, une formalisation actionnable, ou si une opportunite produit a ete rendue explicite sans interrompre la reparation conversationnelle.
- Tests d'invariant attendus: apres `restore_meaning` reussi sans demande produit, le prochain stage reste conversationnel ou termine localement; `action_card_candidate` exige un signal user explicite ou une opportunite qualifiee.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Entree initiale correcte via `skill_entry_signal` vers `demotivation_repair`.
- Pendant le flow actif, le dispatcher global normal ne reprend pas la main.
- L'arret local du tour 5 produit `complete_flow` / `exit_or_cancel` / `exit_to_global_dispatcher`, sans `target_dispatcher`.

**Skills / Operations / Tools**
- Aucun tool ni operation engageante n'est execute.
- Le bridge potion reste bloque/candidat interne et ne devient jamais une offre visible.
- Le bridge carte est visible au tour 4 sans effet durable, mais trop priorise par rapport a l'intention conversationnelle.

**Memory / Effets durables**
- Snapshot durable: `chat_messages` OK, `turn_summary_logs` OK.
- `memory_items_recent=0`, `scheduled_checkins_recent=0`.
- EffectLedger: zero effet sur tous les tours.
- Aucune confirmation pending exploitee ni operation appliquee.

**Problemes**
- Tour 4: `flow_action=action_card_candidate`, `visible_task=action_card_candidate`, `operation_suggestions=[]`, sans demande user de carte. Famille: BF-ROUTE-03. Impact systeme: stage produit/support choisi trop tot par le flow local. Severite: yellow.

**Fix propose**
- Source amont: decision locale `action_card_candidate`.
- Correction recommandee: renforcer les regles de remplissage du dispatcher local et/ou le reducer pour bloquer `action_card_candidate` tant que l'utilisateur n'a pas exprime une demande de support, une acceptation, ou une opportunite actionnable claire.
- Tests d'invariant attendus: conversation de demotivation avec sens retrouve ne propose pas automatiquement de carte; confirmation de carte impossible sans offre persistable; refus de carte reste `exit_to_global_dispatcher` si le user veut arreter.

## Verdict Global

**yellow**

Le correctif R2 est valide: les questions visibles sont maintenant alignees avec `conversation_context.max_questions=1`, et aucun `max_questions=0` n'a produit de question. Le flow reste techniquement sain et sans potion prematuree. Le warning restant est le tour 4: une carte de soutien est proposee trop tot, sans demande produit explicite.
