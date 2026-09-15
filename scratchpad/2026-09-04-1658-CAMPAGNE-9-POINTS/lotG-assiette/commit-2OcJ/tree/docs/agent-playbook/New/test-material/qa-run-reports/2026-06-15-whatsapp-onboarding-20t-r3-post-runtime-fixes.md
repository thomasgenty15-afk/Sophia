# QA Run Report - 2026-06-15 WhatsApp Onboarding 20T R3

## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `onboarding-20t-20260615-r3`
- Persona: connexion temporaire WhatsApp `qa-wa-onb-onboarding-20t-20260615-r3-1781536575589@example.com`
- Objectif: verifier le comportement WhatsApp depuis onboarding jusqu'a conversation post-onboarding apres les fixes runtime recents.
- Trajectoire: attente plan -> reprise onboarding WhatsApp -> preferences coach -> premier pas plan -> normal reply -> progression -> status recap -> rappel ponctuel -> sortie de statut -> fin de conversation.
- Surfaces visees: `whatsapp_onboarding`, global dispatcher, normal reply, `track_progress_plan_item`, `status_recap`, `create_one_shot_reminder`, flow opportunities, effect ledger, metadata WhatsApp.
- Cadre IA reel: Supabase local, webhook WhatsApp local reel, responses Sophia via chemin IA reel, pas de renderer direct ni fallback `processMessage`.
- Validite QA: valide. Les messages user ont ete choisis tour par tour apres lecture de la reponse precedente et des traces courtes. Un seul incident technique: la commande CLI T18 etait deja terminee quand la session outil a ete reprise; l'etat persistant a ete relu et le run a continue depuis T19.
- Nettoyage: artefacts QA supprimes via `node tmp/qa_whatsapp_onboarding_turn.mjs cleanup --run-id onboarding-20t-20260615-r3`. `user_memories` a retourne 404 comme dans les runs precedents, les autres suppressions scoper run/user sont OK.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Salut Sophia, je viens d'arriver sur WhatsApp, on peut commencer ?

**Sophia**
> Salut ! Ravi de te retrouver ici. Je suis en train de finaliser la preparation de ton plan suite a ton onboarding sur le web. On attend juste que tout soit bien synchronise, je te fais signe des que c'est pret pour commencer !

**Trace courte**
- http_status: 200
- response_owner: onboarding WhatsApp
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_not_ready`
- durable_effect: aucun

### Tour 2

**Verdict du tour:** green

**User**
> Ok, j'ai genere le plan sur le site. Normalement c'est pret maintenant.

**Sophia**
> C'est parfait, j'ai bien ton plan sous les yeux ! Pour qu'on commence sur de bonnes bases, tu preferes que je sois plutot douce, directe, ou un mix des deux ?

**Trace courte**
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_ready_resume_preferences`
- durable_effect: aucun

### Tour 3

**Verdict du tour:** green

**User**
> Un mix, mais plutot direct si je commence a trop reflechir au lieu d'agir.

**Sophia**
> C'est bien note pour le ton, je saurai etre directe si je sens que tu commences a trop cogiter ! [...] Derniere petite question : quand tu decroches un peu, comment tu veux que je te challenge ?

**Trace courte**
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_preference_saved`
- durable_effect: `coach.tone=warm_direct` avec note explicite

### Tour 4

**Verdict du tour:** green

**User**
> Equilibre au depart. Mais si je trouve trois excuses d'affilee, tu peux me recadrer clairement.

**Sophia**
> C'est bien note pour le challenge, je saurai te recadrer si besoin ! [...] tu preferes que je pose peu de questions, que je creuse un peu, ou que je te questionne franchement quand ca peut aider ?

**Trace courte**
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_preference_saved`
- durable_effect: `coach.challenge_level=balanced` avec condition utilisateur

### Tour 5

**Verdict du tour:** green

**User**
> Pose peu de questions, sauf si une info manque vraiment pour avancer.

**Sophia**
> C'est bien note pour les questions, j'irai desormais a l'essentiel. Ton plan est pret : qu'est-ce que tu en penses, le resultat te convient ?

**Trace courte**
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_preference_saved`
- durable_effect: `coach.question_tendency=low`

### Tour 6

**Verdict du tour:** green

**User**
> Oui, ca me convient. C'etait un peu long a generer, mais le plan me parait clair et pas trop charge.

**Sophia**
> Top, ravie que le plan te convienne et te semble equilibre ! Desolee pour l'attente au moment de la generation. On commence par la ou tu as un autre sujet plus important a aborder pour l'instant ?

**Trace courte**
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_plan_feedback_received`
- durable_effect: feedback plan accepte

### Tour 7

**Verdict du tour:** green

**User**
> On commence par le plan, mais doucement. Je veux juste voir le premier pas concret.

**Sophia**
> C'est entendu, on y va en douceur. Voici le programme pour ta routine de contacts pro [...] Pour commencer, on va simplement lister cinq contacts prioritaires. Est-ce que tu as deja ces noms en tete ?

**Trace courte**
- selected_handler: `whatsapp_onboarding`
- route_reason: `whatsapp_onboarding_complete_to_plan`
- durable_effect: fin onboarding WhatsApp, entree dans conversation plan

### Tour 8

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PREF-01` - Preference non appliquee runtime

**User**
> J'ai Nadia en tete, mais je trouve ca un peu genant parce qu'on ne s'est pas parle depuis longtemps.

**Sophia**
> Je te comprends... [...] Tu peux partir sur quelque chose du style : "Hey Nadia ! Ca fait un moment. J'espere que tu vas bien [...]" Si tu veux, dis-moi juste le ton que tu preferes.

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: bonne reponse globale, mais trop longue et finit par une question alors que la preference explicite est "peu de questions".
- Source amont probable: application runtime des preferences coach dans normal reply.
- Owner runtime: normal reply prompt/context policy.
- Meilleure correction: renforcer l'usage des preferences explicites recentes comme contraintes de style, sans router ni regex.
- Pourquoi ce n'est pas un patch local: la correction doit s'appliquer a tout normal reply post-onboarding, pas a Nadia.

### Tour 9

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `a classifier` - normal reply context grounding / short-term context carry

**User**
> Fais plus court stp, juste une phrase que je pourrais envoyer.

**Sophia**
> Je te comprends : envoie juste « C'est pret, je lance ca maintenant. » 🙂

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: la reponse oublie le contexte Nadia/contact et produit une phrase generique inappropriee.
- Source amont probable: normal reply ne s'ancre pas assez dans les derniers messages utiles quand le user demande une reformulation courte.
- Owner runtime: normal reply context grounding.
- Meilleure correction: instruction systemique: quand le dernier message est une demande de raccourcir/reformuler, conserver l'objet conversationnel actif des tours immediats.
- Pourquoi ce n'est pas un patch local: ce n'est pas une phrase a corriger, c'est une regle de grounding conversationnel.

### Tour 10

**Verdict du tour:** green

**User**
> Je l'ai prepare dans ma tete, mais je ne l'ai pas encore envoye. Humainement, ca compte un peu ou pas ?

**Sophia**
> Oui, ca compte un peu 🙂 Parce que tu as deja fait une partie du chemin [...] Mais en pratique, l'impact reel commence quand c'est envoye.

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- durable_effect: aucun

### Tour 11

**Verdict du tour:** green

**User**
> Ok, la je viens vraiment de l'envoyer a Nadia.

**Sophia**
> C'est note : Envoyer un message simple a une personne est marque comme fait.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `track_progress_plan_item`
- route_reason: `normal_reply_default`
- executed_tools: `track_progress_plan_item`
- durable_effect: 1 `user_plan_item_entries` `checkin`

### Tour 12

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATUS-02` - Historique incomplet

**User**
> Qu'est-ce qui a ete cree ou note exactement depuis le debut ? Reponds juste factuel.

**Sophia**
> Depuis le debut de notre echange, j'ai simplement note ton avancee sur une etape de ton plan. C'est le seul element qui a ete enregistre pour le moment.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- durable_effect: aucun nouveau

**Analyse si yellow/red**
- Symptome: le recap ne mentionne pas les preferences coach explicitement enregistrees pendant l'onboarding, alors que le user demande "depuis le debut".
- Source amont probable: projection status recap trop centree sur operation/effect history et pas assez sur facts explicites quand scope temporel large.
- Owner runtime: `status_recap` projection/read scope.
- Meilleure correction: distinguer "effets operationnels" et "informations/preferences notees", puis restituer les deux quand le user demande "cree ou note depuis le debut".
- Pourquoi ce n'est pas un patch local: correction de projection DB par scope, pas wording de tour.

### Tour 13

**Verdict du tour:** green

**User**
> Ok, hors recap maintenant : est-ce que je dois attendre sa reponse ou relancer quelqu'un d'autre ?

**Sophia**
> A ta place, j'attendrais un peu pour elle [...] Relancer quelqu'un d'autre, seulement si ton objectif a toi depend d'un retour "maintenant" [...]

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- durable_effect: aucun

### Tour 14

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PREF-01` - Preference non appliquee runtime

**User**
> 24h ca me va. Ne me fais pas de rappel, je veux juste garder ca en tete.

**Sophia**
> Ok, 24h ca me parait coherent 👍 et je ne te mettrai aucun rappel. Tu veux que ta relance soit plutot "simple check-in" [...] ?

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- durable_effect: aucun rappel cree

**Analyse si yellow/red**
- Symptome: bon blocage du rappel, mais nouvelle question alors que le user a demande peu de questions et vient de dire qu'il veut juste garder en tete.
- Source amont probable: normal reply reste trop coaching/question.
- Owner runtime: normal reply style policy.
- Meilleure correction: si preference `coach.question_tendency=low`, transformer les follow-ups non necessaires en proposition courte ou silence conversationnel.
- Pourquoi ce n'est pas un patch local: invariant global de posture.

### Tour 15

**Verdict du tour:** green

**User**
> Simple check-in. Et pas besoin de question, propose-moi juste une formulation courte.

**Sophia**
> Bien sur 🙂 Voila une phrase courte que tu peux envoyer : "Hey Nadia, je pensais a toi et j'espere que tu vas bien !"

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- durable_effect: aucun

### Tour 16

**Verdict du tour:** green

**User**
> Par contre la oui, programme-moi un rappel demain a 9h pour verifier si Nadia a repondu.

**Sophia**
> C'est programme pour mardi 16 juin a 09:00: je te ferai un rappel pour verifier si Nadia a repondu.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- executed_tools: `create_one_shot_reminder`
- durable_effect: `scheduled_checkins` pending pour `2026-06-16T07:00:00+00:00`, instruction `verifier si Nadia a repondu`

### Tour 17

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATUS-02` - Historique incomplet

**User**
> Et maintenant, qu'est-ce qui a vraiment ete cree ou note ? Reponds factuel, sans explication.

**Sophia**
> Voici ce qui a ete enregistre : un rappel a ete cree et ton progres sur le plan a ete note.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- durable_effect: aucun nouveau

**Analyse si yellow/red**
- Symptome: le recap est correct mais trop generique; il devrait restituer le libelle et l'horaire du rappel ainsi que l'item de progression.
- Source amont probable: status recap projection ne donne pas assez de details sur les effets confirmes.
- Owner runtime: `status_recap` projection/render context.
- Meilleure correction: quand le user demande "vraiment cree ou note", inclure les details stables des effets durables confirmes.
- Pourquoi ce n'est pas un patch local: invariant de restitution des effets durables.

### Tour 18

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - Ancien flow capture une nouvelle intention

**User**
> Ok, hors statut maintenant. Je me sens un peu bete d'avoir eu besoin de tout ca pour envoyer un message.

**Sophia**
> C'est tout a fait normal de chercher un peu de soutien, meme pour des choses qui semblent simples. Est-ce que tu veux qu'on prenne un petit moment pour en parler ?

**Trace courte**
- metadata response_owner: `tool_skill`
- metadata selected_handler: `flow_opportunity_verification`
- route_decision.response_owner: `normal_reply`
- route_decision.reason_code: `normal_reply_fit_dominates`
- route_decision.blocked_paths: `conversation_skill.emotional_repair`
- tool_skill_run.status: `waiting_confirmation`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: reponse visible acceptable, mais trace incoherente: route decision dit normal reply, alors qu'un `tool_skill_run` `flow_opportunity_verification` reste attache.
- Source amont probable: pipeline runtime cree ou preserve un etat de flow opportunity malgre `normal_reply_fit_dominates`.
- Owner runtime: admission/cleanup de `flow_opportunity_verification`.
- Meilleure correction: si la route finale est normal reply et que l'opportunite est bloquee, ne pas materialiser `tool_skill_run`, ne pas poser d'active local flow, et tracer seulement un `blocked_path`.
- Pourquoi ce n'est pas un patch local: correction d'ownership/admission, pas de texte visible.

### Tour 19

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - Ancien flow capture une nouvelle intention

**User**
> Merci. Pour finir, donne-moi juste une phrase simple a me repeter si je bloque encore demain.

**Sophia**
> Tu peux simplement te repeter : « Je rencontre une difficulte, mais cette difficulte ne definit pas qui je suis. »

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `emotional_repair`
- route_reason: `active_flow_opportunity_verification_local_dispatcher`
- route_decision.blocked_paths: `global_dispatcher`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: visible bon, mais le tour est encore capture par l'active `flow_opportunity_verification` du tour precedent.
- Source amont probable: active flow opportunity local dispatcher conserve l'ownership sur une demande qui aurait du etre normal reply.
- Owner runtime: active local flow exit policy pour `flow_opportunity_verification`.
- Meilleure correction: une demande "juste une phrase simple" doit faire sortir le flow opportunity si aucun effet/confirmation explicite n'est en cours.
- Pourquoi ce n'est pas un patch local: il faut corriger la politique d'interruption active-flow.

### Tour 20

**Verdict du tour:** green

**User**
> Ok merci, on s'arrete la pour aujourd'hui. Ne lance rien de plus.

**Sophia**
> Parfait, on s'arrete la pour aujourd'hui. Prends soin de toi et reviens quand tu veux 🫶

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- route_decision.blocked_paths: `emotional_repair.local_visible_reply` bloque par `local_exit_to_global_dispatcher_blocks_local_reply`
- durable_effect: aucun

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- L'onboarding WhatsApp T1-T7 est coherent et recupere bien les preferences.
- Le faux positif de tracking sur "ca compte ou pas ?" est corrige: T10 reste en normal reply et ne propose pas de noter.
- Le rappel ponctuel T16 est correct: heure locale affichee, DB UTC correcte, libelle sans apostrophe parasite.
- T20 respecte la cloture explicite sans lancer de flow.

**Problemes**
- Tour 9: perte de contexte immediate sur la phrase Nadia. Famille: `a classifier`. Impact: reponse inutilisable malgre bon owner. Severite: red.
- Tours 8 et 14: Sophia pose encore trop de questions apres preference explicite "peu de questions". Famille: `BF-PREF-01`. Impact: conversation un peu lourde. Severite: yellow.
- Tours 12 et 17: recaps factuels trop generiques/incomplets. Famille: `BF-STATUS-02`. Impact: le user n'obtient pas exactement "ce qui a ete cree ou note". Severite: yellow.
- Tours 18 et 19: visible acceptable, mais active flow opportunity contamine l'ownership. Famille: `BF-ROUTE-02`. Impact: risque de forcing futur et traces trompeuses. Severite: yellow.

**Fix propose**
- Source amont: normal reply context grounding, normal reply style policy, `status_recap` projection, active flow opportunity admission/exit.
- Correction recommandee: garder l'objet conversationnel actif lors des demandes de reformulation courte; appliquer `coach.question_tendency=low` comme contrainte de style; restituer les effets durables avec libelle/horaire/details; supprimer tout active flow opportunity quand la route finale est `normal_reply_fit_dominates`.
- Tests d'invariant attendus:
  - "fais plus court" apres une proposition de message relationnel -> meme domaine, phrase raccourcie.
  - preference "peu de questions" -> pas de question sauf slot necessaire.
  - status recap "vraiment cree ou note" -> rappel avec heure/libelle + plan item + preferences explicites si scope "depuis le debut".
  - normal reply dominant -> aucun `tool_skill_run` ni active flow local opportunity.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Les fixes runtime sont partiellement verifies en conditions reelles.
- T10 prouve que `track_progress_plan_item` ne capture plus une question conceptuelle.
- T16 prouve que l'explicite rappel passe encore correctement.
- T18-T19 montrent une incoherence restante: `route_decision.response_owner=normal_reply`, mais metadata finale et `tool_skill_run` gardent `flow_opportunity_verification`, puis T19 passe par `active_flow_opportunity_verification_local_dispatcher`.

**Skills / Operations / Tools**
- `whatsapp_onboarding`: OK.
- `track_progress_plan_item`: effet correct; wording visible moins mecanique qu'en R2, encore un peu template mais acceptable.
- `status_recap`: ne divulgue plus les blocked/internal paths, mais la projection reste trop pauvre.
- `create_one_shot_reminder`: OK sur le cas explicite "demain a 9h"; DB `scheduled_for=2026-06-16T07:00:00+00:00` pour Europe/Paris.
- `flow_opportunity_verification`: warning systeme; il ne devrait pas etre materialise quand la route finale est normal reply.

**Effets durables observes avant nettoyage**
- `user_profile_facts`: preferences explicites T3-T5 bien stockees (`tone`, `challenge_level`, `question_tendency`).
- `user_plan_item_entries`: 1 entree `checkin` creee apres T11.
- `scheduled_checkins`: 1 rappel pending cree apres T16, instruction `verifier si Nadia a repondu`.
- `user_chat_states.temp_memory`: pas d'active attack card en fin de run; status recap sorti vers global; trace active opportunity presente seulement dans metadata T18-T19, pas comme carte durable.

**Fix systeme recommande**
- Source amont: pipeline de materialisation des opportunities apres arbitrage.
- Correction: quand `routeDecision.response_owner === "normal_reply"` et `reason_code === "normal_reply_fit_dominates"`, la runtime ne doit pas lancer ni persister `flow_opportunity_verification`; elle doit seulement conserver le blocage dans `blocked_paths`.
- Tests: integration WhatsApp T18-like avec emotion legere + `normal_reply_fit_score=0.95`; assertion metadata `response_owner=normal_reply`, `selected_handler=null`, `tool_skill_run=null`, puis tour suivant normal reply/global dispatcher.

## Verdict Global

Verdict global: `yellow`.

Le run est exploitable et nettement meilleur que R2: les effets indus principaux sont bloques, le rappel explicite fonctionne, le tracking implicite ne capture plus la question humaine, et le status recap n'expose plus les blocked paths. Il reste un red visible sur grounding normal reply T9 et un yellow systeme important sur `flow_opportunity_verification` T18-T19.
