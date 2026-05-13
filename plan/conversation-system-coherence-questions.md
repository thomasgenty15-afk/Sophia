# Questions de coherence - Dispatcher, skills et tools

## Objectif

Ce document liste les questions simples a se poser avant implementation pour
verifier que le systeme conversationnel reste coherent.

Le but n'est pas de redetailler toute l'architecture, mais de forcer les points
qui peuvent creer :

- des doubles executions ;
- des skills qui se superposent ;
- des operations lancees trop vite ;
- des ecritures DB sans consentement ;
- des incoherences entre chat et plateforme ;
- des context loaders trop lourds ou mal scopes.

## Revision 2026-05 - alignements integres

Cette revision integre :

```text
1. Renommage `operation_skill` -> `tool_skill`.
2. Toutes les regles "safety active -> pas de write" sont reformulees en
   "safety_pregate.risk_band >= medium -> pas de write" pour rappeler que
   la detection ne depend plus du seul prompt dispatcher LLM.
3. Toutes les regles "explicit X.Y" passent par les bandes interpretables
   (`explicit | implied | weak`, `low | medium | high`).
4. DirectEffectGate et confirmation_token sont mentionnes la ou ils
   s'appliquent.
5. La frontiere entre memoire et routing est rappelee (cf. Memory
   Influence Policy dans le doc dispatcher-alignment-plan).
```

## Questions posees au depart

### 1. Tracking tool

```text
Comment le dispatcher sait quand activer un tracking tool ?
```

Questions a trancher :

- Quel signal exact declenche `track_progress_plan_item` ?
- Comment s'assurer que l'action cible est identifiee sans ambiguite ?
- Que fait-on si le user dit "je l'ai fait" mais que l'action n'est pas claire ?
- Comment eviter de logger deux fois le meme message ?
- Est-ce qu'un tracking tool peut s'executer pendant un skill conversationnel actif ?
- Est-ce qu'un tracking tool peut coexister avec `emotional_repair` si le user dit "j'ai rate, je suis nul" ?

Regle cible :

```text
DirectEffectGate refuse -> pas de write. Conditions cumulatives :
- safety_pregate.risk_band in {none, low}
- explicit_intent_band in {explicit, implied_strong}
- target_status = identified (target_item_id resolu sans ambiguite)
- ambiguity = none
- autonomous_intent = true
- source_message_id non deja consomme (runtime + DB)
- pas de pending_tool_skill_confirmation active
```

### Reponse cible - tracking tool

Cette section ne decrit pas le code actuel comme source de verite. Elle decrit
ce qu'il faut faire dans le systeme cible defini par :

```text
conversation-tools-definitions.md
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
```

#### Documents relies

Dans `conversation-tools-definitions.md` :

```text
track_progress_plan_item = always-on tool.
Il logge seulement une entree de suivi pour une action du plan.
Il ne modifie pas le plan, ne cree pas de carte, ne cree pas de reminder.
```

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
dispatcher = perception / signaux.
skill_router = arbitration conversationnelle.
tool_skill_router = lifecycle operationnel.
pending confirmation bloque les nouveaux flows produit.
safety override tout.
```

Point a expliciter dans ce plan :

```text
ordre runtime cible avec always-on tools :
0. safety_pregate (lexical + heuristique + recent context, hors LLM)
1. dispatcher LLM (peut elever, jamais abaisser, le risk_band)
2. tool_skill_router sur pending confirmation Oui/Non
3. always-on tools directs (sous DirectEffectGate)
4. tool_skill_intent
5. skill_router
6. recommendation_tool si demande par skill
7. memory write candidates async
```

Dans `conversation-skills-definitions.md` :

```text
safety_crisis override tout.
emotional_repair prend la main si honte / auto-attaque domine.
execution_breakdown prend la main si une action concrete bloque.
```

Donc le tracking tool doit etre compatible avec les skills, mais ne doit jamais
les remplacer.

## Reponses par question - tracking tool

### 1. Quel signal exact declenche `track_progress_plan_item` ?

Meilleure reponse theorique :

```text
Un seul signal dispatcher leger : track_progress_plan_item.
```

Le signal doit exprimer :

```text
- detected ;
- target_item_id ;
- target_title ;
- status_hint completed | missed | partial | unknown ;
- operation_hint add | set ;
- value_hint ;
- date_hint.
```

Dans notre systeme cible :

```text
Le dispatcher doit produire ce signal dans sa sortie de perception.
Ce n'est pas une tool_skill_intent.
Ce n'est pas un skill.
Ce n'est pas un recommendation_tool.
```

Pourquoi :

```text
Logger "j'ai fait / rate X" est une action courte et objective.
La faire passer par tool skill serait trop lourd.
La faire passer par recommendation_tool serait conceptuellement faux.
```

Ce qu'il faut faire :

```text
1. Garder track_progress_plan_item dans les always-on tools.
2. Le traiter apres safety et pending confirmation.
3. Ne jamais le transformer en tool skill.
4. Supprimer / ignorer track_progress_north_star du systeme cible.
```

### 2. Comment s'assurer que l'action cible est identifiee sans ambiguite ?

Meilleure reponse theorique :

```text
Le dispatcher ne peut logger que si une action du plan est resolue de facon unique.
```

Dans notre systeme cible :

```text
Le tracking tool doit utiliser le contexte plan charge pour le dispatcher :
- active_plan_id ;
- transformation_id ;
- plan_item_snapshot ;
- actions actives de la semaine / phase active si necessaire ;
- candidate_plans si plusieurs plans existent.
```

Regle de resolution :

```text
1 cible unique dans le plan actif -> target_item_id.
0 cible -> target_item_id null.
plusieurs cibles plausibles -> target_item_id null.
multi-plan ambigu -> target_item_id null.
```

Ce qu'il faut faire :

```text
1. Ajouter au context loader du dispatcher un bloc plan_item_snapshot fiable.
2. Si multi-plan possible, ajouter candidate_plans / active_plan_id.
3. Interdire tout write sans target_item_id issu du contexte.
4. Ne jamais accepter un target_item_id invente par l'IA.
5. Verifier cote executor que l'item appartient bien au plan/transformation cible.
```

### 3. Que faire si le user dit "je l'ai fait" mais que l'action n'est pas claire ?

Meilleure reponse theorique :

```text
Detecter l'intention de tracking, mais ne pas ecrire.
```

Sortie cible :

```text
track_progress_plan_item.detected = true
target_item_id = null
status_hint = completed
```

Dans notre systeme cible :

```text
Le runtime doit transformer ce cas en addon needs_clarify.
Le companion / skill actif peut poser une question courte si c'est pertinent.
```

Question autorisee :

```text
"Tu parles de quelle action du plan exactement ?"
```

Mais si un skill emotionnel est prioritaire :

```text
"je l'ai rate, je suis nul"
-> emotional_repair prioritaire dans la reponse
-> tracking seulement si cible claire
-> si cible ambigue, ne pas interrompre la regulation emotionnelle avec une question froide
```

Ce qu'il faut faire :

```text
1. Ajouter un etat runtime needs_clarify quand detected=true mais target_item_id=null.
2. Injecter cet addon au skill/companion.
3. Poser une seule question courte si le contexte conversationnel le permet.
4. Ne pas ecrire en DB.
```

### 4. Comment eviter de logger deux fois le meme message ?

Meilleure reponse theorique :

```text
Il faut une idempotence runtime + DB.
```

Dans notre systeme cible :

```text
runtime guard :
  source_message_id deja traite dans le tour / temp state -> no write

DB guard :
  source_message_id deja present pour ce user + plan_item + status -> no write
```

Pourquoi les deux :

```text
Le runtime guard evite les doubles executions dans le meme tour.
Le DB guard protege contre retries, race conditions, workers relances, ou messages retraités.
```

Ce qu'il faut faire :

```text
1. Stocker source_message_id dans l'entree de suivi.
2. Avant insert, verifier si une entree existe deja pour ce source_message_id.
3. Idealement ajouter une cle d'idempotence technique.
4. Si deja logge, retourner "logged" sans nouvel insert.
5. Injecter un addon au companion : "deja note, ne relance pas le tool".
```

### 5. Est-ce qu'un tracking tool peut s'executer pendant un skill conversationnel actif ?

Meilleure reponse theorique :

```text
Oui, sauf safety_crisis et pending confirmation.
```

Dans notre systeme cible :

```text
track_progress_plan_item est always-on.
Il peut tourner en parallele d'un skill conversationnel non-safety.
Le skill reste proprietaire de la reponse humaine.
```

Exemple :

```text
user: "j'ai rate ma marche, je sais pas pourquoi je bloque"

track_progress_plan_item
  -> log missed si "marche" cible une action claire

skill_router
  -> execution_breakdown si blocage domine
```

Blocages obligatoires (DirectEffectGate) :

```text
safety_pregate.risk_band >= medium -> no write
safety_crisis actif -> no write
pending confirmation Oui/Non -> traiter la confirmation avant tout
target ambigu -> no write
explicit_intent_band weak -> no write (needs_clarify)
ambiguity != none -> no write (needs_clarify)
non-autonomous intent -> no write
```

Ce qu'il faut faire :

```text
1. Placer always-on tools apres safety_pregate et pending confirmation.
2. Autoriser tracking en parallele de emotional_repair / execution_breakdown
   / demotivation_repair (skill garde la response_owner).
3. Injecter le resultat du tracking au skill actif sous forme d'addon court.
4. Le skill ne doit pas relancer le tool.
5. Tout write porte une cle d'idempotence sur source_message_id (runtime + DB).
```

### 6. Est-ce qu'un tracking tool peut coexister avec `emotional_repair` ?

Meilleure reponse theorique :

```text
Oui, et c'est meme necessaire.
```

Raison :

```text
Le tracking logge le fait objectif.
emotional_repair gere le rapport du user a lui-meme.
```

Exemple cible :

```text
user: "j'ai rate ma marche, je suis nul"

tracking:
  -> missed log si target_item_id clair

skill:
  -> emotional_repair prioritaire
```

Reponse attendue :

```text
Ne pas repondre seulement "c'est note".
Repondre d'abord a l'auto-attaque.
Mentionner le log en second plan si utile.
```

Exemple :

```text
"Je l'ai note pour ta marche. Et surtout, on ne va pas transformer ca en preuve contre toi."
```

Ce qu'il faut faire :

```text
1. Si emotional_repair.high + tracking clear, logger en parallele.
2. Donner la priorite de formulation a emotional_repair.
3. Ne pas proposer de plan adjustment / carte / potion automatiquement.
4. Laisser recommendation_tool intervenir seulement si emotional_repair produit une opportunite structuree.
```

### Synthese d'implementation cible - tracking

Le systeme cible doit donc etre :

```text
dispatcher
  -> detecte track_progress_plan_item
  -> cible uniquement depuis plan_item_snapshot
  -> recopie les ID, n'invente jamais

runtime
  -> safety_pregate (step 0)
  -> dispatcher LLM
  -> pending confirmation gate
  -> DirectEffectGate (idempotence runtime + DB, target identified,
      explicit/implied_strong, ambiguity none, autonomous_intent)
  -> execute logPlanItemProgress si toutes les conditions OK
  -> sinon produit needs_clarify (transmis au skill / companion)

skill_router
  -> arbitre emotional_repair / execution_breakdown / demotivation_repair

skill actif
  -> recoit l'addon tracking en parallele
  -> ne relance pas le tool
  -> garde la response_owner conversationnelle
```

Statut documentaire :

```text
conversation-tools-definitions.md contient deja la fiche tool.
conversation-skills-definitions.md contient deja les priorites safety/emotional/execution.
conversation-skills-tools-dispatcher-alignment-plan.md doit expliciter l'ordre runtime incluant always-on tools.
```

### 2. One-shot reminder

```text
Comment faire en sorte que one-shot reminder fonctionne ?
```

Questions a trancher :

- Comment distinguer one-shot reminder et recurring reminder ?
- Comment parser proprement "dans 30 minutes", "demain matin", "ce soir" ?
- Que faire si l'heure est ambigue ?
- Que faire si l'heure demandee est deja passee ?
- Ou est stocke le rappel ?
- Quel scheduler recontacte vraiment le user au bon moment ?
- Comment tracer que le rappel a bien ete programme ?
- Comment eviter de creer deux rappels si le meme message est retraite ?

Regle cible :

```text
one-shot clair -> create_one_shot_reminder.
recurring clair -> create_recurring_reminder_tool_skill.
horaire ambigu -> clarification courte, pas de write.
```

### Reponse cible - one-shot reminder

Cette section decrit le comportement cible, en lien avec :

```text
conversation-tools-definitions.md
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
```

#### Documents relies

Dans `conversation-tools-definitions.md` :

```text
create_one_shot_reminder = always-on tool.
Il programme un rappel ponctuel unique dans scheduled_checkins.
Il ne gere pas les rappels recurrents.
```

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
always-on tools directs passent apres safety_pregate et pending confirmation,
sous DirectEffectGate strict.
create_one_shot_reminder n'est pas une tool skill.
```

Dans `conversation-skills-definitions.md` :

```text
create_recurring_reminder_tool_skill gere les rappels recurrents.
product_help explique les reminders si le user demande comment ca marche.
safety_crisis bloque les tools non-safety.
```

## Reponses par question - one-shot reminder

### 1. Comment distinguer one-shot reminder et recurring reminder ?

Meilleure reponse theorique :

```text
one-shot = un rappel unique a un moment unique.
recurring = une serie / recurrence / initiative repetee.
```

Dans notre systeme cible :

```text
one-shot clair
  -> create_one_shot_reminder

recurring clair
  -> create_recurring_reminder_tool_skill
  -> pending confirmation Oui/Non
```

Exemples :

```text
"rappelle-moi dans 30 minutes de faire une pause"
-> one-shot

"rappelle-moi demain a 9h d'appeler Paul"
-> one-shot

"rappelle-moi tous les matins de marcher"
-> recurring reminder tool skill

"chaque lundi, rappelle-moi de regarder mon plan"
-> recurring reminder tool skill
```

Pourquoi :

```text
Un one-shot est une action courte, reversible, ponctuelle.
Un recurring reminder cree une initiative durable, donc il doit passer par
tool skill + confirmation.
```

Ce qu'il faut faire :

```text
1. Garder create_one_shot_reminder comme always-on tool.
2. Router les recurrents vers create_recurring_reminder_tool_skill.
3. Ne jamais utiliser le one-shot comme fallback pour une recurrence.
4. Ne pas demander Oui/Non pour un one-shot clair au MVP.
5. Demander Oui/Non pour un recurring reminder.
```

### 2. Comment parser proprement "dans 30 minutes", "demain matin", "ce soir" ?

Meilleure reponse theorique :

```text
Le parser doit convertir une expression temporelle en scheduled_for absolu,
avec timezone user.
```

Dans notre systeme cible :

```text
create_one_shot_reminder doit recevoir :
- message courant ;
- timezone user ;
- current time ;
- channel / scope ;
- user_id.
```

Regles :

```text
"dans 30 minutes" -> now + 30 min.
"demain a 9h" -> demain 09:00 timezone user.
"ce soir" -> horaire par defaut raisonnable si le produit l'autorise, sinon clarification.
"demain matin" -> horaire par defaut matin si convention produit explicite, sinon clarification.
```

Decision cible :

```text
Si l'expression a une convention produit stable, parser.
Si l'expression reste trop vague, needs_clarify.
```

Ce qu'il faut faire :

```text
1. Centraliser les conventions temporelles one-shot.
2. Toujours appliquer la timezone user.
3. Retourner scheduled_for ISO + label local user-facing.
4. Garder une sortie needs_clarify pour les cas non resolvables.
```

### 3. Que faire si l'heure est ambigue ?

Meilleure reponse theorique :

```text
Ne pas programmer.
Demander une seule precision courte.
```

Dans notre systeme cible :

```text
create_one_shot_reminder
-> status needs_clarify
-> no write scheduled_checkins
```

Exemples :

```text
"rappelle-moi de faire une pause"
-> "Tu veux que je te le rappelle quand ?"

"rappelle-moi demain"
-> si pas de convention produit, demander l'heure.
```

Relation skills :

```text
Si un skill conversationnel est actif, il peut poser la clarification courte.
Mais le tool ne doit pas lancer un nouveau skill.
```

Ce qu'il faut faire :

```text
1. Retourner needs_clarify avec reason missing_time / unsupported_time.
2. Injecter l'addon au companion ou skill actif.
3. Poser une seule question courte.
4. Ne pas ecrire en DB avant reponse claire.
```

### 4. Que faire si l'heure demandee est deja passee ?

Meilleure reponse theorique :

```text
Ne pas programmer dans le passe.
Clarifier ou ajuster uniquement si l'intention est non ambigue.
```

Dans notre systeme cible :

```text
"rappelle-moi il y a 10 minutes"
-> blocked / needs_clarify

"rappelle-moi a 9h" alors qu'il est 18h
-> demander si c'est demain a 9h, sauf convention explicite.
```

Ce qu'il faut faire :

```text
1. Refuser scheduled_for <= now.
2. Retourner reason past_time.
3. Demander une correction courte.
4. Ne jamais silently reporter au lendemain si ce n'est pas explicitement defini.
```

### 5. Ou est stocke le rappel ?

Meilleure reponse theorique :

```text
Dans une table de checkins/messages programmes, avec metadata source one-shot.
```

Dans notre systeme cible :

```text
scheduled_checkins
```

Payload attendu :

```text
origin = initiative
message_mode = dynamic
message_payload.source = companion_one_shot_reminder_tool
message_payload.reminder_kind = one_shot
status = pending
event_context = one_shot reminder context
scheduled_for = timestamp futur
```

Ce qu'il faut faire :

```text
1. Conserver scheduled_checkins comme destination.
2. Tagger clairement reminder_kind = one_shot.
3. Ne pas creer user_recurring_reminders.
4. Ne pas toucher au plan.
```

### 6. Quel scheduler recontacte vraiment le user au bon moment ?

Meilleure reponse theorique :

```text
Un worker / scheduler commun lit scheduled_checkins pending et envoie le message
quand scheduled_for est arrive.
```

Dans notre systeme cible :

```text
create_one_shot_reminder ne doit pas envoyer le message lui-meme.
Il cree seulement le scheduled_checkin.
Le scheduler d'outreach/checkins doit ensuite le prendre en charge.
```

Ce qu'il faut verifier dans l'implementation :

```text
1. scheduled_checkins pending est bien consomme par le scheduler.
2. event_context one-shot n'est pas ignore.
3. le channel cible est clair.
4. les retries / failed / processed_at sont geres.
5. le message envoye reprend reminder_instruction.
```

Ce qu'il faut faire :

```text
1. Documenter le worker responsable de scheduled_checkins.
2. Ajouter un test end-to-end : demande chat -> scheduled_checkin -> outreach.
3. S'assurer que one-shot et recurring partagent la meme infra d'envoi.
```

### 7. Comment tracer que le rappel a bien ete programme ?

Meilleure reponse theorique :

```text
Le tool doit remonter un outcome explicite + executed_tools + statut.
```

Dans notre systeme cible :

```text
success
  -> executed_tools ["create_one_shot_reminder"]
  -> tool_execution success
  -> inserted_checkin_id
  -> scheduled_for
  -> scheduled_for_local_label

needs_clarify
  -> tool_execution blocked

failed
  -> tool_execution failed
```

Ce qu'il faut faire :

```text
1. Logger outcome tool dans la trace du tour.
2. Injecter l'ack au companion pour eviter une promesse non fondee.
3. Ne jamais dire "c'est programme" sans inserted_checkin_id.
4. Exposer scheduled_for_local_label dans la reponse user.
```

### 8. Comment eviter de creer deux rappels si le meme message est retraite ?

Meilleure reponse theorique :

```text
Idempotence sur user_id + event_context + scheduled_for, plus source_message_id
si disponible.
```

Dans notre systeme cible :

```text
upsert scheduled_checkins
onConflict = user_id,event_context,scheduled_for
```

Ce qu'il faut renforcer :

```text
1. event_context doit etre stable pour le meme message.
2. source_message_id doit etre stocke si disponible.
3. si un rappel identique existe deja, retourner success/idempotent au lieu de recreer.
4. le companion doit recevoir "deja programme / programme" sans relancer le tool.
```

### Synthese d'implementation cible - one-shot reminder

Le systeme cible doit donc etre :

```text
dispatcher / tool detector
  -> detecte demande explicite de rappel ponctuel
  -> rejette recurrence

runtime
  -> safety gate
  -> pending confirmation gate
  -> create_one_shot_reminder si temps resolu
  -> needs_clarify si temps ambigu / passe / unsupported

tool
  -> parse time avec timezone user
  -> upsert scheduled_checkins
  -> retourne outcome structure

companion / skill actif
  -> confirme seulement si success
  -> pose une question courte si needs_clarify
  -> ne relance pas le tool

scheduler
  -> lit scheduled_checkins pending
  -> envoie le message au bon moment
  -> marque processed / failed selon resultat
```

Statut documentaire :

```text
conversation-tools-definitions.md contient deja la fiche one-shot.
conversation-skills-tools-dispatcher-alignment-plan.md contient l'ordre runtime avec always-on tools.
conversation-skills-definitions.md distingue one-shot reminder et recurring reminder tool skill.
```

### 3. Superposition des skills

```text
Comment s'assurer qu'un skill ne va pas se superposer a un autre ?
```

Questions a trancher :

- Quel est l'ordre de priorite exact entre safety, pending confirmation, tools always-on, tool skill intent et skill router ?
- Est-ce qu'un seul skill conversationnel peut etre actif a la fois ?
- Quels signaux peuvent interrompre un skill actif ?
- Est-ce qu'une tool skill intent directe peut interrompre un skill conversationnel ?
- Quand est-ce qu'on continue le skill actif au lieu d'en lancer un nouveau ?
- Comment eviter que le systeme switch trop vite sur une simple tournure ?
- Comment eviter l'inverse : rester bloque dans un skill alors que le user a change de sujet ?

Regle cible :

```text
safety override tout.
pending confirmation Oui/Non bloque les nouveaux flows produit.
un seul skill conversationnel actif.
tool skill intent explicite peut prendre la priorite, sauf safety.
```

### 4. Potions d'etat

```text
Lorsqu'une potion est creee par le chat, est-ce que ca cree bien un recurring reminder pendant une semaine ?
```

Questions a trancher :

- Le chat doit-il envoyer un message immediat rassurant apres activation ?
- Le recurring reminder est-il systematique ?
- La duree est-elle toujours 7 jours ?
- Qui choisit l'horaire dans le chat ?
- Est-ce que le user doit confirmer avant creation ?
- Est-ce que le comportement chat est aligne avec la plateforme ?
- Est-ce que la plateforme doit encore laisser choisir 3 / 5 / 10 / 14 jours ?

Regle cible :

```text
potion activee = message immediat rassurant + recurring reminder 7 jours.
chat MVP = l'IA choisit l'horaire.
plateforme cible = questionnaire + message immediat + recurring reminder systematique 7 jours.
```

### 5. Deux plans en meme temps

```text
Est-ce que le systeme gere correctement deux plans / transformations en meme temps ?
```

Questions a trancher :

- Est-ce qu'il peut y avoir deux plans actifs ou semi-actifs ?
- Quel `active_plan_id` est utilise par defaut ?
- Comment identifier la bonne transformation si le user parle d'une action ?
- Les context loaders incluent-ils `candidate_plans` quand c'est ambigu ?
- Les target resolvers supposent-ils un seul plan actif ?
- Que faire si une operation cible une action presente dans deux plans ?
- Les operations cards / plan adjustment / reminder portent-elles toujours le bon `transformation_id` ?

Regle cible :

```text
aucune operation plan-linked sans plan/transformation resolu.
ambiguite multi-plan -> clarification ou dashboard.
```

## Questions supplementaires de coherence

### 6. Ordre runtime global

```text
Dans quel ordre le systeme traite-t-il un message ?
```

Questions a trancher :

- Est-ce que safety est toujours la premiere verification ?
- safety_pregate (couches deterministes) precede-t-elle le dispatcher LLM ?
- Est-ce que pending confirmation est traite avant tool skill intent ?
- Les always-on tools passent-ils avant ou apres skill router ?
- Est-ce qu'un always-on tool peut s'executer en parallele d'une reponse skill ?
- Quand est-ce que le recommendation_tool peut etre appele ?
- Quand est-ce que les memory writes sont proposes ?

Ordre cible :

```text
0. safety_pregate (lexical + heuristique + recent context, hors LLM)
1. dispatcher LLM (peut elever, jamais abaisser, le risk_band)
2. tool_skill_router sur pending confirmation Oui/Non
3. always-on tools directs (sous DirectEffectGate)
4. dispatcher.tool_skill_intent
5. tool_skill_router sur tool_skill_intent fort
6. skill_router si aucune operation prioritaire
7. recommendation_tool si demande par skill
8. memorizer async (memory write candidates)
```

Invariants :

```text
- risk_band final = max(safety_pregate.risk_band, dispatcher_llm.risk_band)
- risk_band >= medium bloque les writes durables
- risk_band >= high bloque aussi recommendation_tool
- risk_band = critical force safety_crisis
```

### 7. Pending confirmation et confirmation token

```text
Que se passe-t-il quand une operation attend Oui/Non ?
```

Questions a trancher :

- Est-ce que tout nouveau flow produit est bloque tant que la confirmation est active ?
- Que se passe-t-il si le user repond Oui ?
- Que se passe-t-il si le user repond Non ?
- Que se passe-t-il si le user repond autre chose ?
- Est-ce qu'une confirmation expire ?
- Que faire si safety arrive pendant une pending confirmation ?
- Est-ce que le skill precedent reprend apres Non ?
- Est-ce que l'executor verifie cryptographiquement la confirmation ?

Regle cible :

```text
Oui -> creation confirmation_token signe -> executor verifie token + draft_hash
   -> write si OK, refus si verification echoue.
Non -> cancel, no write.
autre reponse -> clarifier ou sortir selon contexte.
safety_pregate.risk_band >= medium -> override et annule/suspend.
expiration token (typiquement 10 min) -> cancel.
```

Invariant cryptographique :

```text
Le draft execute doit avoir le meme draft_hash que celui signe dans le token.
Le token est single-use (consomme apres write).
Un retry ne peut PAS reutiliser le token : il faut un nouveau Oui user.
```

### 8. Tool skills

```text
Comment garantir qu'une tool skill ne cree rien sans infos suffisantes ?
```

Questions a trancher :

- L'operation vient-elle d'une demande directe ou du recommendation_tool ?
- Si elle vient du recommendation_tool, le payload est-il deja suffisant ?
- Si elle vient d'une demande directe, combien de questions peut-on poser ?
- Quels slots sont obligatoires pour chaque operation ?
- Que fait-on si la cible reste ambigue apres une question ?
- Quand fallback dashboard ?
- Est-ce que le generator peut ecrire en DB ?
- Est-ce que l'executor exige un confirmation_token ?

Regle cible :

```text
recommendation_tool path = pas d'intake (payload suffisant ou refus).
direct_user_request path = intake possible, max 1 question.
generator = draft seulement, jamais d'ecriture.
executor = write seulement apres Oui ET confirmation_token verifie.
```

### 9. Recommendation tool

```text
A quoi sert le recommendation_tool exactement ?
```

Questions a trancher :

- Est-ce qu'il choisit une feature ou est-ce qu'il genere aussi le contenu ?
- Peut-il appeler directement un executor ?
- Peut-il recommander une operation si le payload est incomplet ?
- Comment eviter qu'il pousse une feature pendant une emotion haute ?
- Comment prioriser potion / carte / reminder / plan adjustment ?
- Que faire si plusieurs recommandations sont possibles ?

Regle cible :

```text
recommendation_tool = choix produit structure.
Il ne genere pas, n'execute pas, ne repond pas au user.
Il retourne recommend_operation seulement si le payload est suffisant.
```

### 10. Context loaders

```text
Est-ce que chaque skill charge le bon contexte, au bon moment ?
```

Questions a trancher :

- Quel contexte est charge au debut du skill ?
- Quel contexte est retire une fois la cible identifiee ?
- Est-ce que le skill garde son working state entre deux tours ?
- Est-ce que le dispatcher voit seulement une vue courte ?
- Est-ce que le skill IA recoit la vue complete ?
- Est-ce que le context loader evite d'injecter le plan complet inutilement ?
- Est-ce que le context loader sait gerer multi-plan ?

Regle cible :

```text
debut = contexte assez large pour identifier.
apres target = contexte narrow.
skill view = working state complet.
dispatcher view = resume court.
```

### 11. Memoire et Memory Influence Policy

```text
La memoire reste-t-elle operationnelle quand un skill est actif ?
Et : peut-elle decider seule de la posture conversationnelle ?
```

Questions a trancher :

- Le dispatcher continue-t-il a produire des memory hints ?
- Le skill peut-il demander un retrieval cible ?
- Quelles couches memoire sont autorisees par skill ?
- Est-ce que core identity reste desactive ?
- Les memory write candidates sont-ils valides async ?
- Comment eviter qu'une emotion momentanee devienne une memoire durable trop vite ?
- La memoire peut-elle, a elle seule, ouvrir un skill humain ?
- Comment empecher la memoire de pousser Sophia a sur-interpreter un message neutre ?

Regle cible :

```text
- La memoire ne peut JAMAIS, seule, declencher un skill humain.
- Le message courant doit fournir le signal principal.
- La memoire peut aider a resoudre une reference ou identifier une cible.
- La memoire peut enrichir un skill deja ouvert mais pas en ouvrir un nouveau.
- Toute memoire utilisee pour router est tracee par item_id.
- Une memoire avec sensitivity_level >= sensitive ne peut pas etre signal
  d'entree de routing.
- Une memoire avec status != active ne peut pas etre utilisee.
- Une correction utilisateur invalide immediatement le payload memoire en
  cours.
```

Hierarchie de signal pour routing (cf. Memory Influence Policy dans
`conversation-skills-tools-dispatcher-alignment-plan.md`) :

```text
1. message courant
2. correction utilisateur
3. etat actif
4. donnees produit fraiches
5. memoire atomique recente
6. vues globales
7. patterns inferes
```

Schema strict des memory_write_candidates :

```text
- evidence_source_ids obligatoires
- sensitivity_level explicite
- should_persist_default (false par defaut en emotion haute)
- anti_identity_freeze_checked = true requis
- "je suis nul" -> JAMAIS un fact identitaire
```

### 12. Direct tools toujours actifs

```text
Quels tools peuvent etre detectes a tout moment ?
```

Questions a trancher :

- `create_one_shot_reminder` est-il actif hors safety ?
- `track_progress_plan_item` est-il actif hors safety ?
- Y a-t-il d'autres tools directs a garder ?
- Les tools directs doivent-ils etre annules si une tool skill intent forte est detectee ?
- Comment tracer `executed_tools` ?
- Tous les writes always-on passent-ils par DirectEffectGate ?

Regle cible :

```text
always-on tools = tres limites.
one-shot reminder et track_progress_plan_item seulement.
pas de North Star tracking.
DirectEffectGate strict obligatoire (cf. doc tools-definitions).
Idempotence runtime + DB obligatoire.
```

### 13. Planning depuis le chat

```text
Quelles modifications de planning sont interdites depuis le chat MVP ?
```

Decision 2026-05 :

- Le changement de jour/horaire n'est plus une surface produit separee.
- Si le user parle de jour/date/horaire, rester dans `adjust_plan_item`.
- Le chat clarifie la cible ou le perimetre du plan et respecte les gates de
  confirmation avant tout write.
- Ne pas rediriger vers une ancienne mecanique de planning fin.

Regle cible :

```text
timing -> ajustement du plan existant + clarification/confirmation.
```

### 14. Non, opposition et corrections user

```text
Que fait le systeme quand le user refuse ou corrige Sophia ?
```

Questions a trancher :

- Est-ce qu'un Non annule seulement l'operation ou aussi le skill actif ?
- Est-ce qu'une correction user met a jour les slots ?
- Est-ce qu'une opposition doit etre memorisee ?
- Comment eviter d'insister apres un refus ?
- Quand reprendre le skill precedent ?
- Une correction sur un fact memoire doit-elle invalider le payload immediat ?

Regle cible :

```text
Non = cancel operation, no write, token revoque.
correction = update slots/state_patch.
opposition explicite = ne pas repusher la meme chose dans le meme contexte.

correction d'un item memoire :
  - skill emet correction_note candidate
  - runtime invalide immediatement l'item dans __memory_payload_state_v1
  - runtime cree un memory_operation type="correction" en async
  - context cache bust pour ce tour
  - au tour suivant, l'ancien item ne doit PAS reapparaitre
```

Refus / cooldown produit :

```text
Un refus de recommandation ne va PAS dans Memory V2 durable par defaut.
Il alimente product_interaction_history / recommendation_cooldowns.
Memory V2 durable recoit seulement les preferences explicites repetitives.
```

### 15. Observability

```text
Comment debugger une reponse incoherente ?
```

Questions a trancher :

- Trace-t-on le signal dispatcher choisi ?
- Trace-t-on safety_pregate ?
- Trace-t-on l'tool_skill_intent ?
- Trace-t-on le skill actif ?
- Trace-t-on les exits / handoffs ?
- Trace-t-on les tools executes ?
- Trace-t-on les writes confirmes vs refuses ?
- Trace-t-on le context loader utilise ?
- Trace-t-on les confirmation_token et leur outcome de verification ?
- Trace-t-on memory_used_for_route et memory_item_ids_used_for_route ?

Regle cible :

```text
Chaque tour doit laisser une trace minimale et structuree :

- safety_pregate_run_id, risk_band, layer_contributions
- dispatcher LLM signal et risk_band (max'd avec pregate)
- TurnFrame (tool_skill_intent, skill_signals, product_signal, memory_cues)
- RouteDecision (response_owner, blocked_paths, reason_code)
- memory_used_for_route, memory_item_ids_used_for_route
- direct_effects_run, tool_skill_run, skill_run, recommendation_tool_run
- confirmation_token verifications (ok | expired | mismatch | refused)
- writes_confirmed / writes_refused
- context_loader_profile par appel
- memory_write_candidates emis (rejetes ou acceptes par memorizer)
- response_owner final
```

Les reason_codes sont des chaines stables et versionnees pour faciliter
le replay et le debug.

## Checklist courte avant implementation

Avant de coder un nouveau flow, verifier :

```text
1. Est-ce que safety_pregate peut l'interrompre (risk_band >= medium) ?
2. Est-ce que le flow peut ecrire en DB ?
3. Si oui : confirmation Oui/Non + confirmation_token verifie cote executor ?
4. Si write direct (always-on) : DirectEffectGate strict applique ?
5. Comment evite-t-on les doublons ? (idempotence runtime + DB)
6. Quel skill ou tool en est proprietaire (response_owner unique) ?
7. Quel contexte est charge au debut ?
8. Quel contexte est retire apres identification ?
9. Que fait-on si la cible est ambigue ?
10. Que fait-on si le user dit Non ?
11. Que fait-on si le user change de sujet ?
12. Est-ce que le flow marche avec deux plans ? (plan_id + transformation_id)
13. Est-ce que le comportement chat est aligne avec la plateforme ?
14. Est-ce que la memoire peut, seule, declencher ce flow ? (Si oui : bug)
15. Quels memory_write_candidates ce flow peut emettre ? Schema strict ?
16. Quels reason_codes versionnes pour observability / replay ?
```
