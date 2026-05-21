## 1. Contexte Du Test

- Date: 2026-05-20, timezone Europe/Paris.
- Run: `global15_20260520_r7`.
- Persona: `28c45978-9bb1-41f2-83e9-d5286aa2697b`, scope `qa-global-normal-conversation-15t-20260520-r7`.
- Objectif: relancer une conversation normale de 15 tours apres corrections 20/80 sur attack cards, rappel ponctuel, preference coach, et faux positifs de routing.
- Trajectoire: blocage perfectionniste sur compte rendu client -> carte d'attaque -> action concrete -> honte legere -> micro-geste -> rappel ponctuel -> aide produit -> memoire -> reformulation locale -> preference coach -> recap final.
- Surfaces visees: dispatcher, `execution_breakdown`, `emotional_repair`, `prepare_attack_card`, `create_one_shot_reminder`, `product_help`, memoire/retrieval, `update_coach_preferences`, pending confirmations.
- Cadre IA reel: Supabase local, endpoint local `test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback `processMessage`.
- Validite QA: valide. 15 tours completes, aucun incident runtime, cleanup cible effectue apres inspection.

Tentatives precedentes: R5 a expose un faux positif `update_coach_preferences` sur une demande de reformulation locale. R6 a expose un faux positif `update_coach_preferences` sur une verification de preference deja gardee. R7 est le run valide apres correction de ces deux points.

## 2. Tours De Conversation

### Tour 1

**User**
> Salut Sophia, j'ai un mini compte rendu client a reprendre aujourd'hui. Je sais quoi faire, mais je sens que je vais attendre d'avoir une vision parfaite avant d'ecrire. Je veux juste demarrer.

**Sophia**
> Sophia identifie le piege "vision parfaite", propose de lancer une version brouillon, puis donne un micro-geste en 3 etapes: ouvrir le doc, ecrire contexte/objectif, poser 3 puces brutes, s'arreter apres 5 lignes. Elle demande si le user veut le mode ultra rapide ou a deja le plan.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: null

### Tour 2

**User**
> Ultra rapide. Et prepare une carte d'attaque. Cible: relire la note et sortir trois puces imparfaites. Mon piege: vouloir comprendre toute la logique avant de poser un brouillon. Choisis la technique adaptee, pas un outil d'impulsion.

**Sophia**
> C'est note pour ton objectif : relire la note et sortir trois puces imparfaites. Pour contrer ton besoin de tout comprendre avant d'agir, je te propose ces trois approches. Laquelle preferes-tu ? 1. Le texte magique 2. Preparer le terrain 3. Ancre visuelle.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: null

### Tour 3

**User**
> Prends Le texte magique. Je veux une version tres courte qui m'aide a ouvrir le doc et ecrire les trois puces sans chercher la version propre.

**Sophia**
> Sophia propose un brouillon "Brouillon imparfait": "J'ouvre ce doc pour poser trois puces moches et imparfaites. Mon seul but est de sortir la matiere brute, pas de faire du propre. Je commence maintenant." Elle explique l'usage puis demande si elle cree la carte.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- direct_effects: []
- operation: null
- pending_confirmation: `prepare_attack_card`
- executed_tools: []
- durable_effect: null

### Tour 4

**User**
> Oui, cree cette carte. Et garde en tete ce piege: chercher a tout comprendre d'abord me bloque avant le brouillon.

**Sophia**
> Sophia ne cree pas encore la carte. Elle regenere un brouillon "Action Imparfaite" avec la phrase: "Je n'ai pas besoin de tout comprendre pour commencer. Je pose juste trois puces imparfaites maintenant, la clarte viendra apres l'action." Elle redemande validation.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `explicit_tool_intent_supersedes_active_conversation_skill`
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: null

### Tour 5

**User**
> Oui, valide cette carte exactement comme ca.

**Sophia**
> C'est fait. J'ai cree cette carte d'attaque : Action Imparfaite. Technique : Le texte magique. Sophia affiche le texte et le mode d'emploi, puis indique que la carte est disponible dans Ressources > Cartes d'attaque et qu'elle peut preparer une nouvelle carte apres confirmation.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `execution_breakdown`
- route_reason: `active_conversation_skill_continue`
- direct_effects: `prepare_attack_card` success
- operation: null
- pending_confirmation: null
- executed_tools: [`prepare_attack_card`]
- durable_effect: carte d'attaque creee

### Tour 6

**User**
> Je l'applique maintenant. Donne-moi une phrase courte qui me garde sur le brouillon, pas sur la version parfaite.

**Sophia**
> Je reste en brouillon: 3 puces moches, maintenant. La version parfaite, je la verrai apres.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_conversation_skill_continue`
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: null

### Tour 7

**User**
> J'ai ecrit deux puces. La troisieme est moche, et j'ai honte de la laisser comme ca.

**Sophia**
> Sophia nomme la honte, la recadre comme une reaction de cerveau qui veut punir la production, puis propose une micro-reparation: rendre la puce utile, ajouter une marge de securite type "a verifier", puis la laisser. Elle invite le user a copier la puce pour proposer une version utile en une ligne.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_handoff_requested`
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: null

### Tour 8

**User**
> Pas besoin de copier-coller. Je la garde en info a verifier. Propose-moi juste le prochain micro-geste, sans liste longue.

**Sophia**
> OK, on fait simple. Relire 60 secondes, puis ecrire une seule phrase a la fin du doc: "A verifier avant envoi : (1 point)". Elle demande si ce point doit etre plutot "risque / incoherence" ou "decision / action".

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_conversation_skill_continue`
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: null

### Tour 9

**User**
> Decision/action. Fait. Programme-moi un rappel demain a 8h30: relire une fois, garder le brouillon, sortir trois puces telles quelles.

**Sophia**
> C'est programme pour jeudi 21 mai a 08:30 : ce que tu as prevu.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `active_skill_exit_requested`
- direct_effects: `create_one_shot_reminder` success
- operation: null
- pending_confirmation: null
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: rappel ponctuel programme pour `2026-05-21T06:30:00+00:00`

### Tour 10

**User**
> Ce rappel ponctuel que tu viens de programmer, je le retrouve ou si je veux juste verifier ou l'annuler plus tard ?

**Sophia**
> Sophia explique que le rappel ponctuel est garde comme rappel programme depuis le chat. Elle precise qu'il n'y a rien a remettre dans le Plan, et que le plus fiable est de demander clairement ici "change le rappel de demain a 9h" ou "annule le rappel de demain". Elle distingue les rappels recurrents cote Initiatives/Rappels.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: null

### Tour 11

**User**
> Ok, laisse l'interface de cote. Tu te souviens du piege de travail que je viens de te demander de garder en tete ?

**Sophia**
> Oui. Le piege est de chercher a tout comprendre avant d'ecrire, ce qui bloque avant le brouillon. L'antidote est de commencer avec des puces imparfaites et d'affiner apres l'action.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: null

### Tour 12

**User**
> Oui, formule-le en une version ultra courte que tu pourrais reutiliser quand je reparle d'un document a ecrire.

**Sophia**
> Je reste en brouillon : 3 puces moches, maintenant. Elle demande si la version doit etre plutot "pour commencer" ou "contre la honte".

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `local_text_revision_not_coach_preference`
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: null

### Tour 13

**User**
> Pour commencer. Et pour la suite, pose-moi une seule question courte a la fois; les listes longues me font decrocher quand je bloque.

**Sophia**
> Bien recu. Pour la suite, je te poserai moins de questions, plus courtes, surtout quand tu es bloque. Si c'est bien ca, je le garde comme preference.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- direct_effects: []
- operation: null
- pending_confirmation: `update_coach_preferences`
- executed_tools: []
- durable_effect: null

### Tour 14

**User**
> Oui, garde cette preference. Et ne cree rien d'autre.

**Sophia**
> C'est fait. J'ai applique cette preference : je te poserai moins de questions, plus courtes, surtout quand tu es bloque.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null
- route_reason: `normal_reply_default`
- direct_effects: `update_coach_preferences` success
- operation: null
- pending_confirmation: null
- executed_tools: [`update_coach_preferences`]
- durable_effect: `coach.question_tendency`

### Tour 15

**User**
> Ne cree rien de nouveau. Fais juste un recap sobre: ce que j'ai fait, ce qui est prevu demain, le piege a surveiller, et confirme si la preference une question courte est bien gardee.

**Sophia**
> Sophia fait un recap sobre: micro-structure brouillon avec 3 puces imparfaites, rappel ponctuel demain a 8h30, piege "chercher a tout comprendre avant d'ecrire", antidote "commencer avec du moche mais utile". Elle confirme que la preference est bien gardee: moins de questions, plus courtes, surtout quand le user bloque.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- direct_effects: []
- operation: null
- pending_confirmation: null
- executed_tools: []
- durable_effect: null

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les transitions principales sont naturelles: blocage -> action, action -> emotion, emotion -> micro-geste, micro-geste -> rappel, produit -> recap.
- La correction attack card est visible: Sophia ne propose plus `Mot de bascule` pour un blocage de demarrage/perfectionnisme. Les candidats sont plus adaptes: texte magique, preparer le terrain, ancre visuelle.
- Le rappel ponctuel est explique sobrement et Sophia ne redemande plus la timezone apres programmation.
- La reponse produit du tour 10 est nettement meilleure: elle distingue le rappel ponctuel gere depuis le chat et les rappels recurrents cote Initiatives/Rappels.
- Le recap final est coherent et respecte "ne cree rien de nouveau".

**Problemes**
- Tour 4: le user dit clairement "Oui, cree cette carte" mais ajoute une note memoire. Sophia regenere un brouillon et demande une seconde validation. Impact: friction visible; le user doit parler comme un testeur pour declencher la creation. Severite: yellow.
- Tour 9: le rappel est bien programme, mais la reponse visible dit "ce que tu as prevu" au lieu de reprendre "relire une fois, garder le brouillon, sortir trois puces telles quelles". Impact: perte de confiance sur le contenu exact du rappel. Severite: yellow.
- Tours 7-8: la reparation emotionnelle est utile, mais encore un peu longue au tour 7 et continue par une question au tour 8 alors que le user demande "sans liste longue". Impact faible, mais le style pourrait etre plus compact. Severite: low yellow.

**Fix propose**
- Prioriser la confirmation pending quand le message commence par une approbation explicite ("oui, cree", "oui, valide") meme si le user ajoute une note secondaire. La note secondaire peut etre stockee ou ignoree, mais ne doit pas relancer le draft.
- Pour `one_shot_reminder`, conserver une extraction textuelle stricte du contenu apres les deux-points et l'utiliser dans la reponse visible et `reminder_instruction`; eviter le placeholder "ce que tu as prevu" quand une instruction concrete existe.
- En `emotional_repair`, si le user demande explicitement "sans liste longue", limiter la reponse a une action et eviter la question de choix sauf necessite.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Le dispatcher choisit les bons owners sur les surfaces principales: `conversation_handler` pour coaching/action, `tool_skill` pour attack card et preference coach, `product_help` pour la question produit, `normal_reply` pour recap et verification.
- Correction validee au tour 12: la demande de reformulation locale route en `normal_reply` avec `route_reason=local_text_revision_not_coach_preference`, pas en `update_coach_preferences`.
- Correction validee au tour 15: la verification "confirme si la preference est bien gardee" ne declenche plus de nouvelle operation `update_coach_preferences`.

**Skills / Operations / Tools**
- `prepare_attack_card` choisit maintenant une famille de techniques adaptee au blocage d'action. `Mot de bascule` n'apparait ni dans les propositions du tour 2, ni dans l'ack de creation du tour 5.
- `create_one_shot_reminder` s'execute directement au tour 9, avec date correcte: le 20 mai 2026 + "demain a 8h30" Europe/Paris donne jeudi 21 mai 2026 a 08:30, soit `2026-05-21T06:30:00+00:00`.
- `update_coach_preferences` gere correctement la confirmation avec side request au tour 14: execution du patch et aucun autre objet cree.

**Memory / Effets durables**
- Avant cleanup: 1 `scheduled_checkins`, 1 `user_attack_cards`, `coach.question_tendency=low`, 15 traces.
- Carte creee: title `Action Imparfaite`, technique `texte_recadrage`, target `Relire la note et sortir trois puces imparfaites`.
- Preference creee: `coach.question_tendency=low`, source explicite utilisateur.
- Cleanup cible R7 effectue apres inspection: `scheduled_checkins=0`, `user_attack_cards=0`, `user_profile_facts=[]`, `traces=0`.

**Problemes**
- Tour 4: la pending confirmation de `prepare_attack_card` n'est pas priorisee face a un message compose "oui + note secondaire". Impact systeme: mauvais etat conversationnel; operation retardee d'un tour. Severite: yellow.
- Tour 9: l'effet durable de rappel contient `request_text` complet, mais `reminder_instruction` vaut "ce que tu as prevu". Impact systeme: le payload utile est moins precis que la demande user. Severite: yellow.

**Fix propose**
- Ajouter pour `prepare_attack_card` un review deterministe similaire a celui de `update_coach_preferences`: approbation si message commence par confirmation explicite et ne contient pas de refus/annulation.
- Modifier l'extracteur `one_shot_reminder` pour preferer le segment apres `:` ou apres le verbe de rappel comme instruction, et tester le cas "Programme-moi un rappel demain a 8h30: X".
- Ajouter un test de regression sur le tour 4: "Oui, cree cette carte. Et garde en tete..." doit executer la creation ou au minimum conserver la confirmation sans regenerer.

## Verdict Global

- Verdict: yellow
- Raison principale: les corrections demandees sont globalement validees sur R7, mais il reste deux frictions systeme visibles: confirmation attack card avec note secondaire et rappel ponctuel au libelle trop generique.
- Follow-up prioritaire: corriger la confirmation composee de `prepare_attack_card`, puis renforcer l'extraction du contenu exact du rappel ponctuel.
