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
pas de target_item_id clair -> pas de write.
source_message_id deja traite -> pas de write.
safety active -> pas de write.
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
operation_router = lifecycle operationnel.
pending confirmation bloque les nouveaux flows produit.
safety override tout.
```

Point a expliciter dans ce plan :

```text
ordre runtime cible avec always-on tools :
1. safety override
2. pending confirmation Oui/Non
3. always-on tools directs
4. operation_intent
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
Ce n'est pas une operation_intent.
Ce n'est pas un skill.
Ce n'est pas un recommendation_tool.
```

Pourquoi :

```text
Logger "j'ai fait / rate X" est une action courte et objective.
La faire passer par operation skill serait trop lourd.
La faire passer par recommendation_tool serait conceptuellement faux.
```

Ce qu'il faut faire :

```text
1. Garder track_progress_plan_item dans les always-on tools.
2. Le traiter apres safety et pending confirmation.
3. Ne jamais le transformer en operation skill.
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

Blocages obligatoires :

```text
safety_crisis actif -> no write
pending confirmation Oui/Non -> traiter la confirmation avant tout
target ambigu -> no write
```

Ce qu'il faut faire :

```text
1. Placer always-on tools apres safety et pending confirmation.
2. Autoriser tracking en parallele de emotional_repair / execution_breakdown / demotivation_repair.
3. Injecter le resultat du tracking au skill actif sous forme d'addon court.
4. Le skill ne doit pas relancer le tool.
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

runtime
  -> safety gate
  -> pending confirmation gate
  -> idempotence gate
  -> execute logPlanItemProgress si cible claire
  -> sinon produit needs_clarify

skill_router
  -> arbitre emotional_repair / execution_breakdown / demotivation_repair

skill actif
  -> recoit l'addon tracking
  -> ne relance pas le tool
  -> garde la bonne posture conversationnelle
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
recurring clair -> create_recurring_reminder_operation_skill.
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
always-on tools directs passent apres safety et pending confirmation.
create_one_shot_reminder n'est pas une operation skill.
```

Dans `conversation-skills-definitions.md` :

```text
create_recurring_reminder_operation_skill gere les rappels recurrents.
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
  -> create_recurring_reminder_operation_skill
  -> pending confirmation Oui/Non
```

Exemples :

```text
"rappelle-moi dans 30 minutes de faire une pause"
-> one-shot

"rappelle-moi demain a 9h d'appeler Paul"
-> one-shot

"rappelle-moi tous les matins de marcher"
-> recurring reminder operation skill

"chaque lundi, rappelle-moi de regarder mon plan"
-> recurring reminder operation skill
```

Pourquoi :

```text
Un one-shot est une action courte, reversible, ponctuelle.
Un recurring reminder cree une initiative durable, donc il doit passer par
operation skill + confirmation.
```

Ce qu'il faut faire :

```text
1. Garder create_one_shot_reminder comme always-on tool.
2. Router les recurrents vers create_recurring_reminder_operation_skill.
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
conversation-skills-definitions.md distingue one-shot reminder et recurring reminder operation skill.
```

### 3. Superposition des skills

```text
Comment s'assurer qu'un skill ne va pas se superposer a un autre ?
```

Questions a trancher :

- Quel est l'ordre de priorite exact entre safety, pending confirmation, tools always-on, operation intent et skill router ?
- Est-ce qu'un seul skill conversationnel peut etre actif a la fois ?
- Quels signaux peuvent interrompre un skill actif ?
- Est-ce qu'une operation intent directe peut interrompre un skill conversationnel ?
- Quand est-ce qu'on continue le skill actif au lieu d'en lancer un nouveau ?
- Comment eviter que le systeme switch trop vite sur une simple tournure ?
- Comment eviter l'inverse : rester bloque dans un skill alors que le user a change de sujet ?

Regle cible :

```text
safety override tout.
pending confirmation Oui/Non bloque les nouveaux flows produit.
un seul skill conversationnel actif.
operation intent explicite peut prendre la priorite, sauf safety.
```

### Reponse cible - superposition des skills

Cette section decrit le comportement cible, en lien avec :

```text
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
conversation-tools-definitions.md
```

#### Documents relies

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
skill_router = lifecycle conversationnel.
operation_router = lifecycle operationnel.
dispatcher = perception / signaux.
un active_skill_working_state garde le fil du skill actif.
pending confirmation bloque le demarrage d'un nouveau skill non-safety.
```

Dans `conversation-skills-definitions.md` :

```text
safety_crisis override tout.
emotional_repair passe avant execution_breakdown si l'emotion domine.
execution_breakdown passe avant demotivation_repair si une action concrete bloque.
product_help ne prend la main que sur demande produit explicite.
```

Dans `conversation-tools-definitions.md` :

```text
Les always-on tools peuvent tourner sans devenir des skills.
Ils ne doivent pas voler la reponse au skill conversationnel actif.
```

## Reponses par question - superposition des skills

### 1. Quel est l'ordre de priorite exact entre safety, pending confirmation, always-on tools, operation intent et skill router ?

Meilleure reponse theorique :

```text
Le systeme doit d'abord gerer ce qui peut etre dangereux ou irreversible,
puis seulement ensuite choisir le mode conversationnel.
```

Ordre cible :

```text
1. safety_crisis
2. pending_operation_confirmation
3. always-on tools directs
4. operation_intent
5. operation_router si operation forte
6. skill_router
7. recommendation_tool si demande par skill
8. memory writes async
```

Dans notre systeme cible :

```text
safety_crisis
  -> bloque tout

pending confirmation
  -> gere Oui/Non avant tout nouveau flow produit

always-on tools
  -> one-shot / tracking seulement

operation_intent forte
  -> operation_router

sinon
  -> skill_router
```

Ce qu'il faut faire :

```text
1. Garder cet ordre comme contrat runtime central.
2. Ne pas laisser skill_router demarrer avant pending confirmation.
3. Ne pas laisser operation_router demarrer si safety active.
4. Ne pas laisser always-on tools devenir proprietaires de la reponse.
```

### 2. Est-ce qu'un seul skill conversationnel peut etre actif a la fois ?

Meilleure reponse theorique :

```text
Oui. Un seul skill conversationnel actif a la fois.
```

Exception :

```text
safety_crisis peut interrompre n'importe quel skill.
```

Dans notre systeme cible :

```text
__active_conversation_skill_v1
```

Ce state doit contenir :

```text
skill_id
phase
summary
slots
missing_slots
last_question_asked
turn_count
max_turns
```

Pourquoi :

```text
Sans skill actif unique, Sophia peut repondre comme coach emotionnel,
diagnosticien execution et product helper dans la meme reponse.
```

Ce qu'il faut faire :

```text
1. Interdire deux active conversation skills.
2. Autoriser seulement des handoffs explicites.
3. Clear le skill actif a l'exit.
4. Garder une vue courte pour dispatcher et une vue complete pour skill.run().
```

### 3. Quels signaux peuvent interrompre un skill actif ?

Meilleure reponse theorique :

```text
Un skill actif ne doit etre interrompu que par un signal plus prioritaire,
une demande operationnelle explicite, ou un changement de sujet clair.
```

Interruptions autorisees :

```text
any_skill -> safety_crisis
  toujours

emotional_repair -> execution_breakdown
  seulement si emotion stabilisee + action concrete restante

execution_breakdown -> emotional_repair
  si honte / auto-attaque devient dominante

any_skill -> product_help
  seulement si demande produit explicite

any_skill -> operation_router
  si operation_intent explicite et forte

any_skill -> exit
  si changement de sujet clair ou objectif atteint
```

Interruptions interdites :

```text
switch sur signal faible
switch parce qu'un mot ressemble a une feature
switch vers product_help pendant detresse emotionnelle
switch vers recommendation_tool sans output structure du skill
```

Ce qu'il faut faire :

```text
1. Ajouter une table de transitions autorisees.
2. Exiger un niveau de confidence plus eleve pour interrompre que pour continuer.
3. Logger handoff_reason dans le state.
4. Si doute, continuer le skill actif plutot que switcher.
```

### 4. Est-ce qu'une operation intent directe peut interrompre un skill conversationnel ?

Meilleure reponse theorique :

```text
Oui, si la demande d'action est explicite, forte, et non-safety.
```

Exemple :

```text
active emotional_repair
user: "ok cree-moi une carte de defense pour ma marche"
-> operation_intent prepare_defense_card
-> operation_router
```

Mais :

```text
active safety_crisis
user: "cree-moi un rappel"
-> safety continue, pas operation
```

Dans notre systeme cible :

```text
operation_intent reste disponible meme dans un skill.
Mais le dispatcher devient centre sur le skill actif.
```

Regle :

```text
operation_intent forte > skill actif non-safety
safety > operation_intent
pending confirmation > nouvelle operation
```

Ce qu'il faut faire :

```text
1. Toujours detecter operation_intent, meme avec active_skill.
2. Donner au dispatcher le contexte du skill actif pour eviter les faux positifs.
3. Demarrer operation_router seulement si confidence >= seuil fort.
4. Sauver previous_skill_id pour reprendre apres Non si utile.
```

### 5. Quand continuer le skill actif au lieu d'en lancer un nouveau ?

Meilleure reponse theorique :

```text
Continuer si le nouveau message repond au meme probleme, au meme slot, ou a la
question posee par le skill.
```

Dans notre systeme cible :

```text
active_skill_working_state doit guider la continuation.
```

Continuer si :

```text
turn_count < max_turns
pas de safety
pas de operation_intent forte
pas de changement de sujet explicite
user repond a last_question_asked
ou user reste dans le meme target / emotion / blocage
```

Sortir si :

```text
objectif atteint
max_turns atteint
changement de sujet clair
operation pending creee
handoff valide
```

Ce qu'il faut faire :

```text
1. Injecter last_question_asked et missing_slots au skill.
2. Le skill retourne state_patch a chaque tour.
3. Le router compare nouveau signal + active state.
4. Par defaut, continuer si le message est compatible avec le state actif.
```

### 6. Comment eviter que le systeme switch trop vite sur une simple tournure ?

Meilleure reponse theorique :

```text
Utiliser une hysteresis de routing.
```

Principe :

```text
demarrer un skill = seuil normal
interrompre un skill actif = seuil plus haut
continuer un skill actif = priorite si coherent
```

Dans notre systeme cible :

```text
Les signaux dispatcher sont des signaux fins, mais le skill_router est
deterministe et arbitre avec le state actif.
```

Regles anti-switch :

```text
1. Ne pas switcher sur un signal low confidence.
2. Ne pas switcher vers product_help sur simple mot produit.
3. Ne pas switcher vers execution_breakdown si emotional_repair high.
4. Ne pas switcher vers demotivation_repair si une action concrete bloque clairement.
5. Ne pas appeler recommendation_tool directement depuis dispatcher.
```

Ce qu'il faut faire :

```text
1. Definir seuil_start et seuil_interrupt par skill.
2. Ajouter interrupt_reason obligatoire.
3. Garder max_turns courts pour eviter l'effet inverse.
4. Tracer decision continue / handoff / exit.
```

### 7. Comment eviter de rester bloque dans un skill alors que le user a change de sujet ?

Meilleure reponse theorique :

```text
Chaque skill doit avoir des exit rules simples et un max_turns.
```

Dans notre systeme cible :

```text
active_skill_working_state contient turn_count + phase + summary.
skill.run() retourne status continue / complete / exit / handoff.
```

Exit si :

```text
user change clairement de sujet
objectif atteint
max_turns atteint
operation_intent forte
pending confirmation creee
safety override
```

Ce qu'il faut faire :

```text
1. Chaque skill definition doit avoir max_turns MVP.
2. Chaque skill output doit contenir status + exit_reason.
3. Le router doit clear __active_conversation_skill_v1 sur exit.
4. Produire skill_run_summary pour observability / memorizer async.
```

### Synthese d'implementation cible - superposition des skills

Le systeme cible doit donc etre :

```text
dispatcher
  -> produit safety, operation_intent, skill_signals, memory hints

runtime gates
  -> safety
  -> pending confirmation
  -> always-on tools
  -> operation intent fort

skill_router
  -> continue active skill
  -> handoff si transition autorisee
  -> start nouveau skill seulement si aucun skill actif coherent
  -> exit si changement de sujet / objectif atteint / max_turns

skill.run()
  -> produit reply + state_patch + status + handoff_request/eventuel

runtime
  -> merge state_patch
  -> clear state si exit
  -> trace decision
```

Statut documentaire :

```text
conversation-skills-tools-dispatcher-alignment-plan.md contient deja l'ordre runtime, active_skill_working_state, pending confirmation, priorites et transitions.
conversation-skills-definitions.md contient deja les priorites et entry/exit rules par skill.
conversation-tools-definitions.md precise que les tools always-on ne volent pas la reponse aux skills.
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

### Reponse cible - potions d'etat

Cette section decrit le comportement cible, en lien avec :

```text
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
conversation-tools-definitions.md
```

#### Documents relies

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
Invariant potion :
Potion activee = message immediat rassurant + recurring reminder 7 jours.
```

Dans `conversation-skills-definitions.md` :

```text
select_state_potion_operation_skill prepare l'activation.
Il passe par pending confirmation Oui/Non.
Le draft contient instant_support_message + follow_up duration_days = 7.
```

Dans `conversation-tools-definitions.md` :

```text
potion_session_selector prepare le draft.
activate_state_potion_executor cree/active la session, retourne le message
immediat et cree le recurring reminder 7 jours.
```

## Reponses par question - potions d'etat

### 1. Le chat doit-il envoyer un message immediat rassurant apres activation ?

Meilleure reponse theorique :

```text
Oui. Une potion sans message immediat perd sa valeur principale.
```

Raison :

```text
La potion sert d'abord a reguler un etat maintenant.
Le recurring reminder sert ensuite a maintenir le soutien dans les jours suivants.
```

Dans notre systeme cible :

```text
select_state_potion_operation_skill
-> potion_session_selector
-> draft.instant_support_message
-> pending confirmation Oui/Non
-> activate_state_potion_executor
-> ack contenant le message immediat
```

Regle de reponse :

```text
L'ack ne doit pas etre seulement :
"C'est fait."

Il doit inclure :
1. confirmation courte ;
2. message immediat rassurant ;
3. information sur le rappel 7 jours ;
4. ligne sophia-coach.ai.
```

Ce qu'il faut faire :

```text
1. Rendre draft.instant_support_message obligatoire.
2. Refuser l'execution si ce champ manque.
3. Injecter ce message dans l'ack user.
4. Tester que l'ack ne peut pas etre vide / purement technique.
```

### 2. Le recurring reminder est-il systematique ?

Meilleure reponse theorique :

```text
Oui, pour une potion activee.
```

Pourquoi :

```text
Une potion n'est pas seulement un contenu ponctuel.
C'est un mini soutien d'etat, donc le follow-up fait partie du produit.
```

Dans notre systeme cible :

```text
activate_state_potion_executor
-> user_potion_sessions
-> user_recurring_reminders
-> scheduled_checkins x 7
```

Le recurring reminder doit etre tagge :

```text
initiative_kind = potion_follow_up
source_kind = potion_generated
source_potion_session_id = potion_session.id
```

Ce qu'il faut faire :

```text
1. Ne pas traiter le follow-up potion comme optionnel.
2. Refuser l'execution si draft.follow_up.reminder_instruction manque.
3. Creer le recurring reminder dans le meme flow que l'activation.
4. Ne pas passer par create_recurring_reminder_operation_skill pour ce cas.
```

### 3. La duree est-elle toujours 7 jours ?

Meilleure reponse theorique :

```text
Oui au MVP.
```

Pourquoi :

```text
Une duree fixe simplifie le comportement, les tests, l'UX et l'alignement chat/plateforme.
```

Dans notre systeme cible :

```text
draft.follow_up.duration_days = 7
scheduled_checkins x 7
scheduled_duration_days = 7
scheduled_message_count = 7
```

Ce qu'il faut faire :

```text
1. Fixer duration_days a 7 dans le draft potion.
2. Refuser un draft avec duration_days different de 7.
3. Aligner plateforme et chat sur 7 jours.
4. Supprimer ou desactiver les choix 3 / 5 / 10 / 14 jours pour les potions si le comportement cible est confirme.
```

### 4. Qui choisit l'horaire dans le chat ?

Meilleure reponse theorique :

```text
L'IA choisit le meilleur horaire dans le chat MVP.
```

Pourquoi :

```text
Demander l'horaire ajouterait une friction et transformerait une potion en flow
administratif, alors que le user est souvent dans un etat fragile.
```

Dans notre systeme cible :

```text
potion_session_selector
-> follow_up.local_time_hhmm
-> follow_up.reason_for_time
```

Regles :

```text
si le contexte indique un moment pertinent -> utiliser ce moment.
si le probleme arrive surtout le soir -> choisir un horaire soir calme.
si rien n'est fiable -> default produit stable.
```

Defaults possibles :

```text
09:00 pour raccrocher la journee.
18:30 pour decompression / apaisement / fin de journee.
```

Ce qu'il faut faire :

```text
1. Documenter les defaults par type de potion.
2. Exiger reason_for_time dans le draft.
3. Ne pas demander l'horaire au user dans le chat MVP.
4. Permettre la modification ensuite dans l'espace Sophia.
```

### 5. Est-ce que le user doit confirmer avant creation ?

Meilleure reponse theorique :

```text
Oui.
```

Pourquoi :

```text
Une potion cree une session + un recurring reminder.
Il y a donc write DB et notifications futures.
Consentement Oui/Non necessaire.
```

Dans notre systeme cible :

```text
potion_session_selector
-> confirmation_message
-> [Oui] [Non]
-> __pending_operation_confirmation
-> executor seulement si Oui
```

Regles :

```text
Oui -> execute.
Non -> cancel, no write.
safety pendant pending -> override.
autre texte -> clear/cancel ou retour conversation normale selon router.
```

Ce qu'il faut faire :

```text
1. Ne jamais activer une potion sans pending confirmation.
2. Ne jamais creer le recurring reminder avant Oui.
3. Stocker le draft pendant pending confirmation.
4. Apres Oui, executer atomiquement session + reminder + checkins.
```

### 6. Est-ce que le comportement chat est aligne avec la plateforme ?

Meilleure reponse theorique :

```text
Oui, le meme invariant produit doit s'appliquer aux deux.
```

Invariant commun :

```text
potion activee = message immediat + recurring reminder 7 jours
```

Difference acceptable :

```text
plateforme
  -> questionnaire potion complet
  -> generation du message
  -> follow-up systematique

chat
  -> pas de questionnaire complet
  -> selection par IA depuis contexte / message
  -> confirmation Oui/Non
  -> follow-up systematique
```

Ce qu'il faut faire :

```text
1. Garder le meme modele de sortie : instant_response + follow_up.
2. Faire converger les writes : user_potion_sessions + user_recurring_reminders + scheduled_checkins.
3. S'assurer que les deux chemins taggent source_kind = potion_generated.
4. Tester plateforme et chat sur le meme invariant.
```

### 7. Est-ce que la plateforme doit encore laisser choisir 3 / 5 / 10 / 14 jours ?

Meilleure reponse theorique :

```text
Non si on valide l'invariant MVP 7 jours.
```

Pourquoi :

```text
Des durees variables creent une divergence entre chat et plateforme.
Elles compliquent aussi la promesse produit : "une potion = suivi court 7 jours".
```

Dans notre systeme cible :

```text
plateforme cible = questionnaire + message immediat + recurring reminder systematique 7 jours.
```

Donc :

```text
Le choix de duree plateforme devient soit :
- retire au MVP ;
- soit cache en avance produit future ;
- soit remplace par une simple information "suivi 7 jours".
```

Ce qu'il faut faire :

```text
1. Revalider la decision produit : 7 jours fixe.
2. Si oui, retirer les choix 3 / 5 / 10 / 14 jours de l'UI potion.
3. Aligner les default_follow_up_strategy sur 7 jours.
4. Garder la modification possible dans l'espace Sophia, mais pas dans le flow d'activation.
```

### Synthese d'implementation cible - potions d'etat

Le systeme cible doit donc etre :

```text
chat direct request
  -> operation_intent select_state_potion
  -> select_state_potion_operation_skill
  -> 1 question max si etat/type manquant
  -> potion_session_selector
  -> pending confirmation Oui/Non
  -> activate_state_potion_executor si Oui

chat recommendation path
  -> conversation_skill
  -> recommendation_tool recommend_operation select_state_potion avec payload suffisant
  -> potion_session_selector
  -> pending confirmation Oui/Non
  -> activate_state_potion_executor si Oui

executor
  -> user_potion_sessions
  -> user_recurring_reminders potion_follow_up
  -> scheduled_checkins x 7
  -> ack avec instant_support_message

plateforme
  -> questionnaire potion
  -> instant_response
  -> recurring reminder systematique 7 jours
```

Statut documentaire :

```text
conversation-skills-tools-dispatcher-alignment-plan.md contient deja l'invariant potion chat/plateforme.
conversation-skills-definitions.md contient deja select_state_potion_operation_skill avec confirmation et draft follow_up.
conversation-tools-definitions.md contient deja potion_session_selector et activate_state_potion_executor.
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

### Reponse cible - deux plans en meme temps

Cette section decrit le comportement cible, en lien avec :

```text
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
conversation-tools-definitions.md
```

#### Documents relies

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
operation_context_builder charge le contexte utile selon operation_type.
target_resolver identifie plan_item / personal_action / free_subject / global_plan.
si la cible reste floue apres 1 question -> fallback dashboard.
```

Dans `conversation-skills-definitions.md` :

```text
prepare_attack_card et prepare_defense_card ont un target_resolver.
adjust_plan_item a un scope_resolver.
execution_breakdown charge les actions actives pour identifier la cible.
```

Dans `conversation-tools-definitions.md` :

```text
track_progress_plan_item ne doit logger que si plan_id + transformation_id +
target_item_id sont resolus sans ambiguite.
```

## Reponses par question - deux plans en meme temps

### 1. Est-ce qu'il peut y avoir deux plans actifs ou semi-actifs ?

Meilleure reponse theorique :

```text
Le systeme doit partir du principe que oui, meme si le produit essaie d'avoir
un plan principal.
```

Pourquoi :

```text
Il peut exister :
- une transformation active ;
- une transformation en transition ;
- une ancienne transformation encore visible ;
- un plan courant et un plan candidat ;
- deux scopes produit qui cohabitent temporairement.
```

Dans notre systeme cible :

```text
Les context loaders ne doivent pas supposer "un seul plan existe".
Ils peuvent avoir un active_plan par defaut, mais doivent aussi gerer
candidate_plans si le message est ambigu.
```

Ce qu'il faut faire :

```text
1. Definir une notion de active_plan_id / active_transformation_id.
2. Definir quand un plan devient candidate_plan.
3. Passer candidate_plans aux resolvers seulement si ambiguite possible.
4. Ne jamais executer une operation plan-linked sur un plan implicite si plusieurs candidats sont plausibles.
```

### 2. Quel `active_plan_id` est utilise par defaut ?

Meilleure reponse theorique :

```text
Le plan par defaut doit etre le plan de la transformation active dans le cycle actif.
```

Mais :

```text
Ce default ne suffit pas si le user mentionne explicitement un autre plan,
une ancienne transformation, ou une action qui existe ailleurs.
```

Dans notre systeme cible :

```text
active_plan_context = {
  cycle_id,
  transformation_id,
  plan_id,
  phase_id/current_level_id,
  status
}
```

Ce qu'il faut faire :

```text
1. Ajouter active_plan_context aux context loaders operationnels.
2. Ajouter ce contexte aux payloads des operation skills plan-linked.
3. Exiger que les executors verifient plan_id/transformation_id avant write.
4. Si active_plan_context manque -> fallback dashboard / needs_clarify.
```

### 3. Comment identifier la bonne transformation si le user parle d'une action ?

Meilleure reponse theorique :

```text
Resolver d'abord la cible, puis rattacher la cible a une transformation.
```

Ordre cible :

```text
1. Chercher dans les actions du plan actif.
2. Si match unique -> utiliser active_plan_context.
3. Si pas de match ou match ambigu -> regarder candidate_plans.
4. Si match unique dans candidate_plans -> utiliser cette transformation.
5. Si plusieurs matchs -> clarification.
```

Dans notre systeme cible :

```text
target_resolver doit retourner :
- target_status ;
- target_kind ;
- plan_item_id ;
- plan_id ;
- transformation_id ;
- source ;
- confidence.
```

Ce qu'il faut faire :

```text
1. Etendre OperationTarget avec plan_id et transformation_id.
2. Garder le plan_item_snapshot groupe par plan/transformation si multi-plan.
3. Si le user dit "ma marche" et que deux marches existent, target_status = ambiguous.
4. Poser une question courte ou fallback dashboard.
```

### 4. Les context loaders incluent-ils `candidate_plans` quand c'est ambigu ?

Meilleure reponse theorique :

```text
Oui, mais uniquement dans la phase de resolution de cible.
```

Pourquoi :

```text
Charger tous les plans tout le temps rend les skills lourds et incoherents.
Mais ne pas charger candidate_plans rend la resolution impossible si le user
parle d'un autre plan.
```

Dans notre systeme cible :

```text
phase target_resolution
  -> active_plan_context
  -> plan_item_snapshot active
  -> candidate_plans courts si ambiguite

phase slot_filling
  -> uniquement plan/transformation cible

phase generation
  -> contexte minimal de la cible
```

Ce qu'il faut faire :

```text
1. Ajouter candidate_plans uniquement au context builder target_resolution.
2. Retirer candidate_plans des phases slot_filling et generation.
3. Garder un resume court par candidate : transformation_title, plan_id, 3-5 actions actives.
4. Ne jamais injecter deux plans complets dans generator.
```

### 5. Les target resolvers supposent-ils un seul plan actif ?

Meilleure reponse theorique :

```text
Non. Ils peuvent avoir un plan par defaut, mais leur schema doit supporter
multi-plan.
```

Dans notre systeme cible :

```ts
type OperationTarget = {
  target_status: "identified" | "ambiguous" | "missing";
  target_kind: "plan_item" | "personal_action" | "free_subject" | "global_plan" | "unknown";
  plan_item_id?: string | null;
  plan_id?: string | null;
  transformation_id?: string | null;
  title_hint?: string | null;
  confidence: number;
  source: "dispatcher_hint" | "plan_snapshot" | "memory" | "user_message";
};
```

Regle :

```text
target_kind = plan_item
-> plan_id et transformation_id requis avant generation/execution.
```

Ce qu'il faut faire :

```text
1. Mettre a jour le contrat OperationTarget.
2. Mettre a jour attack/defense/adjust target resolvers.
3. Mettre a jour readiness_gate : plan-linked target sans plan_id -> not ready.
4. Mettre a jour operation state pour stocker plan_id/transformation_id resolus.
```

### 6. Que faire si une operation cible une action presente dans deux plans ?

Meilleure reponse theorique :

```text
Ne pas choisir automatiquement.
```

Pourquoi :

```text
Une carte, un ajustement ou un log attache au mauvais plan pollue la DB et
casse la confiance user.
```

Dans notre systeme cible :

```text
target_status = ambiguous
operation_status = ask_question ou fallback_dashboard
```

Question possible :

```text
"Tu parles de la marche dans ton plan actuel, ou de celle de l'autre transformation ?"
```

Mais si l'operation est complexe :

```text
fallback_dashboard
```

Ce qu'il faut faire :

```text
1. Ne jamais auto-resoudre par proximite faible.
2. Poser 1 question max si direct_user_request.
3. Recommendation path avec cible multi-plan ambigue -> invalid_recommendation_payload.
4. Si toujours ambigu apres 1 question -> dashboard.
```

### 7. Les operations cards / plan adjustment / reminder portent-elles toujours le bon `transformation_id` ?

Meilleure reponse theorique :

```text
Oui, toute operation plan-linked doit porter explicitement le scope produit.
```

Operations concernees :

```text
prepare_attack_card
prepare_defense_card si target plan_item
adjust_plan_item
track_progress_plan_item
recurring_reminder si lie a une action / transformation
potion si related_plan_item_id existe
```

Payload minimal plan-linked :

```text
user_id
cycle_id
transformation_id
plan_id
plan_item_id si applicable
operation_source
trigger_message_id
```

Ce qu'il faut faire :

```text
1. Ajouter scope produit aux drafts/generator payloads plan-linked.
2. Ajouter verification executor : l'item appartient bien au plan_id.
3. Refuser les writes si transformation_id manque.
4. Ajouter tests : meme action title dans deux plans -> no write sans clarification.
```

### Synthese d'implementation cible - deux plans en meme temps

Le systeme cible doit donc etre :

```text
context loader
  -> active_plan_context par defaut
  -> candidate_plans courts seulement si ambiguity possible

target_resolver / scope_resolver
  -> resolvent target + plan_id + transformation_id
  -> ambiguous si plusieurs candidats

readiness_gate
  -> bloque toute operation plan-linked sans scope resolu

generator
  -> recoit uniquement le plan/scope cible

executor
  -> verifie que plan_item appartient au plan/transformation
  -> refuse si mismatch

fallback
  -> 1 question max en direct_user_request
  -> dashboard si toujours ambigu
```

Statut documentaire :

```text
conversation-skills-tools-dispatcher-alignment-plan.md decrit deja target_resolver et context narrowing, mais doit expliciter multi-plan.
conversation-skills-definitions.md decrit deja les context loaders par operation, mais doit ajouter active_plan_context / candidate_plans.
conversation-tools-definitions.md mentionne deja multi-plan pour tracking ; il faut aligner les operations plan-linked.
```

## Questions supplementaires de coherence

### 6. Ordre runtime global

```text
Dans quel ordre le systeme traite-t-il un message ?
```

Questions a trancher :

- Est-ce que safety est toujours la premiere verification ?
- Est-ce que pending confirmation est traite avant operation intent ?
- Les always-on tools passent-ils avant ou apres skill router ?
- Est-ce qu'un always-on tool peut s'executer en parallele d'une reponse skill ?
- Quand est-ce que le recommendation_tool peut etre appele ?
- Quand est-ce que les memory writes sont proposes ?

Ordre cible a confirmer :

```text
1. safety override
2. pending confirmation Oui/Non
3. always-on tools directs
4. operation_intent
5. operation_router si operation_intent forte
6. skill_router si aucune operation prioritaire
7. recommendation_tool si demande par skill
8. memory write candidates async
```

### Reponse cible - ordre runtime global

Cette section decrit l'ordre cible du traitement d'un message, en lien avec :

```text
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
conversation-tools-definitions.md
```

#### Documents relies

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
safety -> pending confirmation -> always-on tools -> operation_intent ->
operation_router -> skill_router.
```

Dans `conversation-skills-definitions.md` :

```text
safety_crisis override tout.
les skills conversationnels produisent state_patch, handoff, recommendation_need
et memory_write_candidates.
```

Dans `conversation-tools-definitions.md` :

```text
always-on tools = create_one_shot_reminder + track_progress_plan_item.
recommendation_tool ne repond pas au user et n'execute rien.
operation tools executent seulement apres confirmation Oui.
```

## Reponses par question - ordre runtime global

### 1. Est-ce que safety est toujours la premiere verification ?

Meilleure reponse theorique :

```text
Oui. Safety doit etre la premiere gate effective.
```

Pourquoi :

```text
Toute autre action peut devenir incoherente ou dangereuse si le user est en
crise : tool, operation, product_help, dashboard push, memory write, etc.
```

Dans notre systeme cible :

```text
safety_crisis detecte
-> bloque pending confirmation
-> bloque always-on tools
-> bloque operation_router
-> bloque recommendation_tool
-> lance safety_crisis
```

Ce qu'il faut faire :

```text
1. Mettre safety gate avant tous les tools et routers.
2. Autoriser safety a annuler/suspendre pending confirmation.
3. Interdire toute execution produit pendant safety.
4. Ne pas pousser dashboard/product_help pendant safety.
```

### 2. Est-ce que pending confirmation est traite avant operation intent ?

Meilleure reponse theorique :

```text
Oui. Une confirmation pending est un contrat ouvert avec le user.
```

Pourquoi :

```text
Si le user dit "oui" ou "non", le systeme doit d'abord savoir si cette reponse
vise une operation en attente.
```

Dans notre systeme cible :

```text
__pending_operation_confirmation existe
-> router traite Oui / Non / autre texte
-> pas de nouvelle operation non-safety avant resolution
```

Regles :

```text
Oui -> executor.
Non -> cancel, no write.
autre texte -> cancel/clear ou conversation normale selon contexte.
safety -> override.
```

Ce qu'il faut faire :

```text
1. Placer pending confirmation juste apres safety.
2. Bloquer operation_intent et skill_router tant que Oui/Non n'est pas resolu.
3. Garder previous_skill_id pour reprise eventuelle apres Non.
4. Clear pending apres Oui/Non/expiration.
```

### 3. Les always-on tools passent-ils avant ou apres skill_router ?

Meilleure reponse theorique :

```text
Avant skill_router, mais apres safety et pending confirmation.
```

Pourquoi :

```text
Les always-on tools capturent des intentions ponctuelles et objectives.
Ils doivent pouvoir s'executer sans transformer la conversation en flow lourd.
Mais ils ne doivent jamais voler la reponse au skill actif.
```

Dans notre systeme cible :

```text
always-on tools MVP :
- create_one_shot_reminder
- track_progress_plan_item
```

Ordre :

```text
safety
-> pending confirmation
-> always-on tools
-> operation_intent
-> operation_router / skill_router
```

Ce qu'il faut faire :

```text
1. Executer always-on tools seulement avec garde-fous stricts.
2. Injecter leur resultat comme addon au companion/skill actif.
3. Le skill actif garde la responsabilite de la reponse humaine.
4. Ne pas autoriser d'autres tools always-on sans validation explicite.
```

### 4. Est-ce qu'un always-on tool peut s'executer en parallele d'une reponse skill ?

Meilleure reponse theorique :

```text
Oui, si le tool est clair, non-safety, idempotent et non intrusif.
```

Exemples :

```text
"j'ai rate ma marche, je suis nul"
-> track_progress_plan_item log missed si cible claire
-> emotional_repair repond

"rappelle-moi dans 30 minutes de faire une pause, je suis a bout"
-> si pas safety, one-shot peut etre cree
-> skill emotionnel peut repondre avec posture adaptee
```

Dans notre systeme cible :

```text
tool result -> addon runtime -> skill.run()
```

Ce qu'il faut faire :

```text
1. Donner au skill l'information "tool already executed".
2. Interdire au skill de relancer le tool.
3. Interdire always-on tool pendant safety.
4. Garantir idempotence source_message_id / event_context.
```

### 5. Quand est-ce que le recommendation_tool peut etre appele ?

Meilleure reponse theorique :

```text
Seulement apres un skill conversationnel ou product_help/start_flow qui produit
une opportunite structuree.
```

Il ne doit pas etre appele :

```text
directement par le dispatcher
pendant safety
pour compenser un target_resolver incomplet
pour executer une operation
```

Dans notre systeme cible :

```text
skill.run()
-> recommendation_need structure
-> recommendation_tool
-> recommend_operation / no_recommendation / defer / invalid_input
```

Puis :

```text
recommend_operation avec payload suffisant
-> operation_router
-> generator
-> pending confirmation Oui/Non
```

Ce qu'il faut faire :

```text
1. Exiger recommendation_need dans le skill output.
2. Interdire recommendation_tool depuis dispatcher brut.
3. Refuser recommend_operation si payload insuffisant.
4. Laisser operation skill valider encore via readiness_gate.
```

### 6. Quand est-ce que les memory writes sont proposes ?

Meilleure reponse theorique :

```text
En fin de tour, apres la decision conversationnelle et sans bloquer la reponse.
```

Pourquoi :

```text
La memoire durable ne doit pas etre ecrite trop vite pendant une emotion,
une crise ou une operation non confirmee.
```

Dans notre systeme cible :

```text
dispatcher -> memory hints / retrieval plan
skill -> memory_write_candidates eventuels
operation executor -> event operationnel confirme
memorizer async -> decide quoi persister
```

Regles :

```text
safety content -> prudence stricte
emotion momentanee -> candidate faible, pas write direct
operation non confirmee -> pas de memoire de creation
operation confirmee -> memorizer peut noter l'evenement
```

Ce qu'il faut faire :

```text
1. Garder memory_write_candidates dans les outputs skills.
2. Envoyer au memorizer async apres la reponse.
3. Ne pas laisser dispatcher ecrire durablement seul.
4. Ajouter evidence + confidence + should_persist dans les candidates.
```

### Synthese d'implementation cible - ordre runtime global

Le systeme cible doit donc etre :

```text
message user
-> dispatcher perception
   safety_signals
   operation_intent
   skill_signals
   memory hints

runtime gates
-> 1 safety_crisis
-> 2 pending confirmation
-> 3 always-on tools directs
-> 4 operation_intent forte
-> 5 operation_router
-> 6 skill_router
-> 7 skill.run()
-> 8 recommendation_tool si skill le demande
-> 9 operation_router si recommendation acceptee
-> 10 response user
-> 11 memorizer async / observability
```

Statut documentaire :

```text
conversation-skills-tools-dispatcher-alignment-plan.md contient deja l'ordre
runtime principal et les gates.
conversation-tools-definitions.md decrit les always-on tools et operation tools.
conversation-skills-definitions.md decrit les outputs skills, recommendation_need
et memory_write_candidates.
```

### 7. Pending confirmation

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

Regle cible :

```text
Oui -> executor.
Non -> cancel, no write.
autre reponse -> clarifier ou sortir selon contexte.
safety -> override et annule/suspend.
```

### Reponse cible - pending confirmation

Cette section decrit le comportement cible, en lien avec :

```text
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
conversation-tools-definitions.md
```

#### Documents relies

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
__pending_operation_confirmation est traite juste apres safety.
Le router ne lance pas un nouveau skill non-safety tant qu'une confirmation est active.
```

Dans `conversation-skills-definitions.md` :

```text
Chaque operation skill cree une pending confirmation apres generator/selector.
Oui execute, Non annule, autre texte clear/cancel.
```

Dans `conversation-tools-definitions.md` :

```text
executor sans pending_confirmation Oui -> interdit.
executor pendant safety -> interdit.
```

## Reponses par question - pending confirmation

### 1. Est-ce que tout nouveau flow produit est bloque tant que la confirmation est active ?

Meilleure reponse theorique :

```text
Oui, sauf safety.
```

Pourquoi :

```text
Une pending confirmation signifie que Sophia attend une decision binaire sur une
operation precise. Lancer un autre flow produit pendant ce moment cree de la
confusion et peut executer la mauvaise action.
```

Dans notre systeme cible :

```text
__pending_operation_confirmation existe
-> safety gate reste prioritaire
-> sinon router traite Oui/Non/autre texte
-> pas de new operation_intent
-> pas de skill_router non-safety
-> pas de always-on tool si le message est une reponse de confirmation
```

Ce qu'il faut faire :

```text
1. Placer pending confirmation juste apres safety dans l'ordre runtime.
2. Bloquer operation_router start_intake tant que pending existe.
3. Bloquer skill_router non-safety tant que la reponse Oui/Non n'est pas resolue.
4. Autoriser safety a interrompre.
```

### 2. Que se passe-t-il si le user repond Oui ?

Meilleure reponse theorique :

```text
Oui execute exactement le draft confirme, puis clear pending.
```

Dans notre systeme cible :

```text
Oui
-> validate pending state
-> executor correspondant
-> DB write / action produit
-> ack user
-> clear __pending_operation_confirmation
-> clear __active_operation_intake_v1 si encore present
-> memorizer async si utile
```

Regles :

```text
L'executor ne doit pas regenerer le draft.
L'executor ne doit pas changer la proposition.
L'executor doit verifier safety avant write.
L'ack doit inclure "Tu peux modifier dans ton espace sur sophia-coach.ai." quand pertinent.
```

Ce qu'il faut faire :

```text
1. Stocker operation_type + draft + source + previous_skill_id dans pending.
2. Router Oui vers le bon executor.
3. Refuser Oui si pending expiree ou draft manquant.
4. Tracer executed_tools / operation_id.
```

### 3. Que se passe-t-il si le user repond Non ?

Meilleure reponse theorique :

```text
Non annule l'operation sans aucun write produit.
```

Dans notre systeme cible :

```text
Non
-> cancel
-> no write
-> clear pending
-> optional resume previous_skill_id si encore pertinent
```

Reponse user cible :

```text
"Ok, je ne le fais pas."
```

Puis :

```text
si previous_skill_id existe et le sujet continue
-> reprendre le skill precedent
sinon
-> conversation normale
```

Ce qu'il faut faire :

```text
1. Non doit etre un hard stop operationnel.
2. Interdire generator/executor apres Non.
3. Logger cancellation pour observability.
4. Ne pas repusher la meme operation dans le meme contexte immediat.
```

### 4. Que se passe-t-il si le user repond autre chose ?

Meilleure reponse theorique :

```text
Au MVP, autre texte annule/clear la pending, puis le message est traite comme
conversation normale.
```

Pourquoi :

```text
Essayer d'interpreter un texte libre comme Oui/Non peut creer des faux positifs.
Et maintenir la pending ouverte trop longtemps bloque la conversation.
```

Dans notre systeme cible :

```text
autre texte
-> clear pending ou cancel soft
-> traiter le message via runtime normal
```

Exception :

```text
Si le texte contient une safety concern, safety override.
```

Ce qu'il faut faire :

```text
1. Ne pas forcer une clarification Oui/Non au MVP.
2. Clear pending sur autre texte sauf cas produit explicitement decide.
3. Traiter ensuite le message comme nouveau tour.
4. Garder trace exit_reason = user_changed_context.
```

### 5. Est-ce qu'une confirmation expire ?

Meilleure reponse theorique :

```text
Oui. Une pending confirmation doit expirer vite.
```

Pourquoi :

```text
Un draft devient stale : contexte, plan, etat emotionnel ou intention peuvent changer.
```

Dans notre systeme cible :

```text
expires_after_turns = 2
ou expires_at court
```

Regles :

```text
expiration -> cancel
expiration -> no write
message apres expiration -> runtime normal
```

Ce qu'il faut faire :

```text
1. Ajouter expires_after_turns et/ou expires_at dans pending state.
2. Verifier expiration avant Oui.
3. Si expire, demander de relancer l'action si le user veut toujours.
4. Ne pas executer un draft expire.
```

### 6. Que faire si safety arrive pendant une pending confirmation ?

Meilleure reponse theorique :

```text
Safety override tout et suspend/annule la pending.
```

Dans notre systeme cible :

```text
message safety
-> safety_crisis
-> blocked_by_safety
-> clear/suspend pending
-> no executor
-> no product push
```

Pourquoi :

```text
La priorite est de securiser le moment present. Une operation produit devient
secondaire, meme si le user avait presque confirme.
```

Ce qu'il faut faire :

```text
1. Safety gate avant pending.
2. Si safety detecte, ne pas interpreter Oui/Non.
3. Marquer pending comme blocked_by_safety / cancelled.
4. Revenir au produit seulement apres sortie safety propre.
```

### 7. Est-ce que le skill precedent reprend apres Non ?

Meilleure reponse theorique :

```text
Oui seulement si c'est encore pertinent.
```

Dans notre systeme cible :

```text
pending.previous_skill_id
active_skill_working_state snapshot optionnel
```

Reprise possible si :

```text
previous_skill_id existe
le user reste dans le meme sujet
le skill n'a pas expire
pas de safety
pas de nouvelle operation_intent forte
```

Sinon :

```text
conversation normale / no active skill
```

Ce qu'il faut faire :

```text
1. Stocker previous_skill_id dans pending.
2. Ne pas reprendre automatiquement si le user dit Non + change de sujet.
3. Si reprise, reinjecter active_skill_working_state au skill.
4. Tracer resume_previous_skill = true/false.
```

### Synthese d'implementation cible - pending confirmation

Le systeme cible doit donc etre :

```text
generator / selector
-> draft
-> confirmation_message
-> [Oui] [Non]
-> __pending_operation_confirmation

tour suivant
-> safety gate
-> pending confirmation gate
   Oui -> executor -> ack -> clear
   Non -> cancel -> clear
   autre texte -> cancel/clear -> runtime normal
   expire -> cancel -> runtime normal

executor
-> verifie pending Oui
-> verifie safety inactive
-> applique exactement le draft
-> trace executed_tools/event
-> memorizer async si utile
```

Statut documentaire :

```text
conversation-skills-tools-dispatcher-alignment-plan.md contient deja l'etat
__pending_operation_confirmation et les regles Oui/Non/safety.
conversation-skills-definitions.md detaille le pending state dans les operation skills.
conversation-tools-definitions.md interdit tout executor sans confirmation Oui.
```

### 8. Operation skills

```text
Comment garantir qu'une operation skill ne cree rien sans infos suffisantes ?
```

Questions a trancher :

- L'operation vient-elle d'une demande directe ou du recommendation_tool ?
- Si elle vient du recommendation_tool, le payload est-il deja suffisant ?
- Si elle vient d'une demande directe, combien de questions peut-on poser ?
- Quels slots sont obligatoires pour chaque operation ?
- Que fait-on si la cible reste ambigue apres une question ?
- Quand fallback dashboard ?
- Est-ce que le generator peut ecrire en DB ?

Regle cible :

```text
recommendation_tool path = pas d'intake.
direct_user_request path = intake possible, max 1 question.
generator = draft seulement.
executor = write seulement apres Oui.
```

### Reponse cible - operation skills

Cette section decrit le comportement cible, en lien avec :

```text
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
conversation-tools-definitions.md
```

#### Documents relies

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
operation_intake -> operation_context_builder -> target_resolver ->
slot_extractor -> readiness_gate -> generator -> pending_confirmation -> executor.
```

Dans `conversation-skills-definitions.md` :

```text
Chaque operation skill distingue direct_user_request et recommendation_tool.
Le chemin recommendation_tool ne relance pas d'intake.
Le chemin direct peut poser 1 question maximum.
```

Dans `conversation-tools-definitions.md` :

```text
generators/builders ne font que produire un draft.
executors ecrivent seulement apres pending confirmation Oui.
```

## Reponses par question - operation skills

### 1. L'operation vient-elle d'une demande directe ou du recommendation_tool ?

Meilleure reponse theorique :

```text
Toute operation doit porter explicitement sa source.
```

Sources autorisees :

```text
direct_user_request
recommendation_tool
```

Pourquoi :

```text
La source determine si l'intake est autorise.
Une demande directe peut avoir des trous.
Une recommandation produit doit deja arriver avec un payload suffisant.
```

Dans notre systeme cible :

```text
source = direct_user_request
  -> operation_intake possible
  -> 1 question max

source = recommendation_tool
  -> pas d'intake
  -> readiness_gate direct
  -> invalid_recommendation_payload si insuffisant
```

Ce qu'il faut faire :

```text
1. Ajouter source obligatoire dans active_operation_intake.
2. Ajouter source obligatoire dans operation output.
3. Interdire intake si source = recommendation_tool.
4. Tracer source dans pending confirmation et executor.
```

### 2. Si elle vient du recommendation_tool, le payload est-il deja suffisant ?

Meilleure reponse theorique :

```text
Oui. Sinon recommendation_tool ne doit pas recommander l'operation.
```

Pourquoi :

```text
Le user n'a pas demande directement le flow. Si Sophia recommande une action
produit, elle doit deja avoir assez d'information pour proposer un draft clair.
```

Dans notre systeme cible :

```text
recommendation_tool
-> recommend_operation avec operation_input complet
-> operation skill readiness_gate
-> generator
-> pending confirmation
```

Si incomplet :

```text
invalid_recommendation_payload
-> no question user
-> retour au skill conversationnel ou no_recommendation
```

Ce qu'il faut faire :

```text
1. Definir minimum payload par operation.
2. Exiger target resolu pour attack/defense/adjust si plan-linked.
3. Refuser recommendation path si target/potion/preference/reminder incomplet.
4. Tester que recommendation path ne pose jamais de question d'intake.
```

### 3. Si elle vient d'une demande directe, combien de questions peut-on poser ?

Meilleure reponse theorique :

```text
Une question maximum au MVP.
```

Pourquoi :

```text
Les anciens flows a machine d'etat peuvent boucler ou devenir incoherents.
Une machine d'information avec un seul trou prioritaire est plus robuste.
```

Dans notre systeme cible :

```text
direct_user_request
-> slots remplis depuis message / contexte / memoire
-> si trou critique : 1 question courte
-> si toujours incomplet : fallback dashboard / product_help / exit
```

Ce qu'il faut faire :

```text
1. Stocker questions_asked dans __active_operation_intake_v1.
2. Bloquer ask_question si questions_asked >= 1.
3. Chaque operation declare la priorite de question.
4. Si encore incomplet apres reponse, fallback.
```

### 4. Quels slots sont obligatoires pour chaque operation ?

Meilleure reponse theorique :

```text
Chaque operation skill declare ses required_slots et minimum_viable_payload.
```

Dans notre systeme cible :

```text
prepare_attack_card
  -> target action concrete + blocker/angle + constraints

prepare_defense_card
  -> attachment cible ou free_risk_context + risk/trigger + strategy angle

adjust_plan_item
  -> scope + adjustment_type + reason + allowed_patch constraints

select_state_potion
  -> state identified + potion_type + no_safety_substitution

create_recurring_reminder
  -> cadence + time/window + reminder content + timezone

update_coach_preferences
  -> preference key + desired value + evidence
```

Slots plan-linked :

```text
plan_item target
-> cycle_id + transformation_id + plan_id + plan_item_id requis
```

Ce qu'il faut faire :

```text
1. Centraliser required_slots par operation.
2. Faire retourner readiness.missing_required_slots.
3. Bloquer generator si required slot manquant.
4. Ne pas cacher un slot manquant via une generation vague.
```

### 5. Que fait-on si la cible reste ambigue apres une question ?

Meilleure reponse theorique :

```text
Fallback dashboard.
```

Pourquoi :

```text
Continuer a questionner augmente le risque de boucle et d'erreur.
Choisir automatiquement peut ecrire au mauvais endroit.
```

Dans notre systeme cible :

```text
direct_user_request
-> 1 question max
-> cible encore ambiguous/missing
-> fallback_dashboard ou product_help selon operation
```

Recommendation path :

```text
cible ambiguous/missing
-> invalid_recommendation_payload
-> no user question
```

Ce qu'il faut faire :

```text
1. Readiness gate bloque si target ambiguous.
2. Si questions_asked >= 1, fallback.
3. Si multi-plan ambiguity, fallback dashboard.
4. Ne jamais generer carte/patch/reminder sur cible ambigue.
```

### 6. Quand fallback dashboard ?

Meilleure reponse theorique :

```text
Fallback dashboard quand le chat devient trop risque ou trop incomplet.
```

Cas cible :

```text
cible toujours ambigue apres 1 question
multi-plan ambigu
schedule_change / changement jour-date-horaire
patch plan trop large
preference trop vague
recurring reminder incomplet
operation safety-adjacent
```

Dans notre systeme cible :

```text
fallback_dashboard
-> pas de write
-> message court
-> orienter vers espace Sophia
```

Ce qu'il faut faire :

```text
1. Chaque operation declare fallback_conditions.
2. Readiness gate retourne fallback_to_dashboard.
3. Generator n'est pas appele si fallback.
4. La reponse user explique simplement qu'il vaut mieux le faire dans l'espace.
```

### 7. Est-ce que le generator peut ecrire en DB ?

Meilleure reponse theorique :

```text
Non, jamais.
```

Dans notre systeme cible :

```text
generator / builder
  -> draft seulement
  -> confirmation_message
  -> output_schema

executor
  -> write seulement apres Oui
```

Pourquoi :

```text
Separating generation from execution is the main consent and safety boundary.
```

Ce qu'il faut faire :

```text
1. Interdire tout DB write dans generator/builder.
2. Tester generator writes DB -> invalid.
3. Executor verifie pending confirmation Oui.
4. Executor applique exactement le draft confirme.
```

### Synthese d'implementation cible - operation skills

Le systeme cible doit donc etre :

```text
direct_user_request
-> operation_intake
-> context_builder
-> target_resolver / slot_extractor
-> readiness_gate
-> ask 1 question max si necessaire
-> fallback si toujours incomplet
-> generator
-> pending confirmation
-> executor si Oui

recommendation_tool
-> payload complet
-> readiness_gate
-> invalid_recommendation_payload si incomplet
-> generator
-> pending confirmation
-> executor si Oui
```

Invariants :

```text
pas de readiness_gate -> pas de generator
pas de generator -> pas de pending
pas de Oui -> pas d'executor
pas de scope plan-linked resolu -> pas de write
safety -> bloque tout
```

Statut documentaire :

```text
conversation-skills-tools-dispatcher-alignment-plan.md contient deja le pipeline operationnel canonique.
conversation-skills-definitions.md contient les fiches operation skills avec direct/recommendation path, slots, readiness et tests.
conversation-tools-definitions.md contient les regles communes generators/executors.
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

### Reponse cible - recommendation tool

Cette section decrit le comportement cible, en lien avec :

```text
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
conversation-tools-definitions.md
```

#### Documents relies

Dans `conversation-tools-definitions.md` :

```text
recommendation_tool choisit s'il faut proposer une fonctionnalite.
Il ne repond pas au user, ne genere pas de draft, n'execute rien.
```

Dans `conversation-skills-definitions.md` :

```text
Les conversation skills peuvent produire recommendation_need.
Les operation skills ne font pas d'intake si source = recommendation_tool.
```

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
dispatcher ne lance pas recommendation_tool directement.
recommendation_tool est appele seulement si le skill produit une opportunite structuree.
```

## Reponses par question - recommendation tool

### 1. Est-ce qu'il choisit une feature ou est-ce qu'il genere aussi le contenu ?

Meilleure reponse theorique :

```text
Il choisit une opportunite produit. Il ne genere pas le contenu final.
```

Dans notre systeme cible :

```text
recommendation_tool
-> recommend_operation / recommend_explanation / no_recommendation / defer / invalid_input

generator / builder
-> produit le draft concret

executor
-> applique apres Oui
```

Pourquoi :

```text
Si recommendation_tool choisit et genere, il devient trop lourd et melange
decision produit + production + execution.
```

Ce qu'il faut faire :

```text
1. Garder recommendation_tool limite au choix produit.
2. Interdire generation de carte / potion / patch / reminder dans ce tool.
3. Envoyer operation_input au bon operation skill si recommend_operation.
4. Laisser generator/builder produire le draft.
```

### 2. Peut-il appeler directement un executor ?

Meilleure reponse theorique :

```text
Non, jamais.
```

Dans notre systeme cible :

```text
recommendation_tool
-> operation_router
-> operation_skill
-> readiness_gate
-> generator
-> pending confirmation
-> executor si Oui
```

Pourquoi :

```text
L'executor est une frontiere de consentement. Le recommendation_tool ne doit
jamais bypasser le Oui/Non.
```

Ce qu'il faut faire :

```text
1. Interdire executor depuis recommendation_tool.
2. Exiger requires_confirmation = true pour recommend_operation.
3. Tester recommendation_tool -> executor direct = invalid.
4. Tracer operation_source = recommendation_tool dans pending.
```

### 3. Peut-il recommander une operation si le payload est incomplet ?

Meilleure reponse theorique :

```text
Non.
```

Dans notre systeme cible :

```text
payload suffisant
-> recommend_operation

payload incomplet
-> defer ou invalid_input / no_recommendation
```

Raison :

```text
Le chemin recommendation_tool ne relance pas d'intake conversationnel.
Donc une recommandation incomplete deviendrait une fausse promesse produit.
```

Ce qu'il faut faire :

```text
1. Definir minimum_operation_input par operation.
2. Bloquer recommend_operation si target/potion/preference/reminder incomplet.
3. Operation skill garde readiness_gate pour valider.
4. Si readiness_gate echoue sur recommendation path -> invalid_recommendation_payload.
```

### 4. Comment eviter qu'il pousse une feature pendant une emotion haute ?

Meilleure reponse theorique :

```text
Le tool doit respecter l'etat emotionnel et l'intrusivite maximale.
```

Dans notre systeme cible :

```text
skill_output.recommendation_need
+ emotional_state.intensity
+ constraints
+ recent_recommendations
-> decision timing now / later / watch
```

Regles :

```text
safety -> no_recommendation
honte high -> pas attack_card
auto-critique high -> emotional_repair d'abord
stress high -> potion ou defer, pas plan adjustment agressif
diagnostic flou -> defer
```

Ce qu'il faut faire :

```text
1. Inclure emotional_state dans input recommendation_tool.
2. Ajouter constraints venant du skill : no_pressure, ask_consent_first, do_not_push_action.
3. Utiliser presentation.level faible si emotion medium.
4. Retourner defer/no_recommendation si emotion high.
```

### 5. Comment prioriser potion / carte / reminder / plan adjustment ?

Meilleure reponse theorique :

```text
Prioriser selon le besoin dominant, pas selon la feature la plus impressionnante.
```

Priorite cible :

```text
safety -> aucune recommendation produit
emotion dominante -> potion ou defer
action claire + evitement -> attack_card
risque recurrent / rechute -> defense_card
plan trop lourd -> adjust_plan_item
besoin de rappel recurrent clair -> create_recurring_reminder
preference explicite -> update_coach_preferences
```

Dans notre systeme cible :

```text
conversation skill
-> diagnosis structure
-> recommendation_need.type
-> recommendation_tool
```

Ce qu'il faut faire :

```text
1. Garder une table de priorisation MVP.
2. Retourner do_not_recommend pour les features contre-indiquees.
3. Ne recommander qu'une operation principale.
4. Mettre les autres en alternatives non presentees si utile.
```

### 6. Que faire si plusieurs recommandations sont possibles ?

Meilleure reponse theorique :

```text
Choisir une seule recommandation principale, ou defer.
```

Pourquoi :

```text
Proposer trois features dans un moment conversationnel augmente la charge et
donne une impression de push produit.
```

Dans notre systeme cible :

```text
decision principale
alternatives internes
do_not_recommend explicite
```

Ce qu'il faut faire :

```text
1. Limiter a une recommendation user-facing.
2. Garder alternatives dans le JSON pour observability.
3. Si deux options sont proches mais aucune n'est nette -> defer.
4. Ne pas enchainer plusieurs operations dans le meme tour.
```

### Synthese d'implementation cible - recommendation tool

Le systeme cible doit donc etre :

```text
skill.run()
-> recommendation_need structure
-> recommendation_tool
-> decision
   recommend_operation avec payload suffisant
   recommend_explanation rare
   no_recommendation
   defer
   invalid_input

si recommend_operation
-> operation_router
-> readiness_gate
-> generator
-> pending confirmation
-> executor si Oui
```

Invariants :

```text
pas d'appel direct depuis dispatcher
pas de generation
pas d'execution
pas de payload incomplet
pas de recommendation pendant safety
une seule recommendation principale
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

### Reponse cible - context loaders

Cette section decrit le comportement cible, en lien avec :

```text
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
conversation-tools-definitions.md
```

#### Documents relies

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
conversation_skill_context_loader charge le contexte du skill actif.
operation_context_builder charge le contexte des operation skills.
Plus les slots sont remplis, moins le contexte est large.
```

Dans `conversation-skills-definitions.md` :

```text
Chaque skill definition precise le contexte charge et le narrowing.
```

Dans `conversation-tools-definitions.md` :

```text
Generators/builders recoivent un payload minimal, pas le thread complet.
```

## Reponses par question - context loaders

### 1. Quel contexte est charge au debut du skill ?

Meilleure reponse theorique :

```text
Juste assez de contexte pour identifier la cible, l'etat ou le scope.
```

Dans notre systeme cible :

```text
conversation skill
  -> recent messages
  -> signal courant
  -> active_skill_working_state si continuation
  -> memory hints/retrieval cible
  -> contexte produit seulement si utile

operation skill
  -> operation_type
  -> active_operation_intake
  -> target hints
  -> contexte operationnel large seulement en target_resolution
```

Ce qu'il faut faire :

```text
1. Definir un context loader par skill family.
2. Ne pas injecter catalogue produit dans human skills.
3. Ne pas injecter plan complet sauf operation qui en a besoin.
4. Inclure working_state complet pour skill.run().
```

### 2. Quel contexte est retire une fois la cible identifiee ?

Meilleure reponse theorique :

```text
Tout ce qui servait seulement a choisir la cible.
```

Exemples :

```text
action identifiee
-> retirer liste des autres actions

plan_item identifie
-> retirer candidate_plans

potion_type identifie
-> retirer hypotheses concurrentes

preference ciblee
-> retirer catalogue complet preferences
```

Ce qu'il faut faire :

```text
1. Decouper les phases : target_resolution / slot_filling / generation.
2. Appliquer context narrowing a chaque tour.
3. Garder seulement target + slots + evidence utile.
4. Ne pas rouvrir une ambiguite resolue sauf correction user.
```

### 3. Est-ce que le skill garde son working state entre deux tours ?

Meilleure reponse theorique :

```text
Oui. C'est indispensable pour eviter les boucles et les questions repetees.
```

Dans notre systeme cible :

```text
__active_conversation_skill_v1
  summary
  phase
  slots
  missing_slots
  last_question_asked
  last_response_intent
  turn_count
```

Operation skills :

```text
__active_operation_intake_v1
  operation_type
  slots
  missing_slots
  questions_asked
  previous_skill_id
```

Ce qu'il faut faire :

```text
1. Chaque skill.run retourne state_patch.
2. Runtime merge state_patch.
3. Context loader reinjecte working_state au tour suivant.
4. Le dispatcher ne voit qu'une vue courte.
```

### 4. Est-ce que le dispatcher voit seulement une vue courte ?

Meilleure reponse theorique :

```text
Oui.
```

Pourquoi :

```text
Le dispatcher route. Il ne doit pas devenir le prompt complet du skill.
```

Vue dispatcher :

```text
skill_id
phase
turn_count
summary court
primary_signal
```

Vue skill :

```text
working_state complet
slots
missing_slots
last_question_asked
recent messages utiles
retrieval cible
```

Ce qu'il faut faire :

```text
1. Separer dispatcher_view et skill_view.
2. Ne pas injecter toutes les slots au dispatcher si inutile.
3. Donner au skill IA la vue complete.
4. Tracer ce qui est injecte.
```

### 5. Est-ce que le skill IA recoit la vue complete ?

Meilleure reponse theorique :

```text
Oui. Le skill qui produit la reponse doit recevoir son working state complet.
```

Dans notre systeme cible :

```text
skill_context_loader
-> active_skill_working_state complet
-> skill.run()
```

Ce qu'il faut faire :

```text
1. Injecter summary, phase, slots, missing_slots.
2. Injecter last_question_asked pour eviter repetition.
3. Injecter last_user_answer_summary si disponible.
4. Ne pas dependancer le skill du dispatcher pour se souvenir.
```

### 6. Est-ce que le context loader evite d'injecter le plan complet inutilement ?

Meilleure reponse theorique :

```text
Oui. Le plan complet est l'exception, pas la norme.
```

Dans notre systeme cible :

```text
execution_breakdown target_resolution
  -> actions actives courtes

attack/defense target_resolution
  -> actions actives + candidate_plans si besoin

adjust_plan scope_resolution
  -> resume global + phase + actions

apres target
  -> cible seulement
```

Ce qu'il faut faire :

```text
1. Interdire plan complet dans generation.
2. Limiter candidate_plans a target_resolution.
3. Garder 2-3 evidence items maximum.
4. Ajouter tests de contexte pour les operations plan-linked.
```

### 7. Est-ce que le context loader sait gerer multi-plan ?

Meilleure reponse theorique :

```text
Oui, mais seulement pendant la resolution.
```

Dans notre systeme cible :

```text
active_plan_context par defaut
candidate_plans courts si ambiguite possible
plan_id + transformation_id requis si target_kind = plan_item
```

Ce qu'il faut faire :

```text
1. Ajouter active_plan_context dans les loaders plan-linked.
2. Ajouter candidate_plans uniquement si besoin.
3. Retirer candidate_plans apres target identifiee.
4. Bloquer readiness si plan/transformation non resolus.
```

### Synthese d'implementation cible - context loaders

Le systeme cible doit donc etre :

```text
dispatcher
  -> vue courte + memory hints

conversation_skill_context_loader
  -> working_state complet
  -> recent messages utiles
  -> retrieval cible
  -> contexte narrow selon phase

operation_context_builder
  -> target_resolution large mais court
  -> slot_filling cible
  -> generation minimal

generator / builder
  -> payload minimal structure
  -> pas de thread complet
```

Invariants :

```text
le skill recoit la vue complete
le dispatcher recoit une vue courte
pas de plan complet apres target identification
pas de candidate_plans hors target_resolution
pas de contexte produit dans safety/emotional repair sauf demande explicite
```

### 11. Memoire

```text
La memoire reste-t-elle operationnelle quand un skill est actif ?
```

Questions a trancher :

- Le dispatcher continue-t-il a produire des memory hints ?
- Le skill peut-il demander un retrieval cible ?
- Quelles couches memoire sont autorisees par skill ?
- Est-ce que core identity reste desactive ?
- Les memory write candidates sont-ils valides async ?
- Comment eviter qu'une emotion momentanee devienne une memoire durable trop vite ?

Regle cible :

```text
dispatcher = memory hints courts.
skill = retrieval cible si besoin.
memorizer = seul responsable des writes durables.
core identity desactive.
```

### Reponse cible - memoire

Cette section decrit le comportement cible, en lien avec :

```text
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
conversation-tools-definitions.md
memory-v2-mvp-consolidated-architecture-plan.md
memory-v2-implementation-roadmap.md
```

#### Documents relies

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
Le context loader ne remplace pas Memory V2.
Les skills utilisent Memory V2 avec un profil de retrieval adapte.
Le memorizer async decide seul des writes durables.
```

Dans `conversation-skills-definitions.md` :

```text
Les skills peuvent produire memory_write_candidates.
Ils ne doivent pas ecrire directement en memoire durable.
core_identity n'est pas charge par defaut.
```

Dans `conversation-tools-definitions.md` :

```text
Les operation tools peuvent declencher memorizer async seulement si utile,
apres confirmation / execution.
```

## Reponses par question - memoire

### 1. Le dispatcher continue-t-il a produire des memory hints ?

Meilleure reponse theorique :

```text
Oui. Le dispatcher garde une perception memoire courte pour router.
```

Dans notre systeme cible :

```text
dispatcher
-> memory hints / topic hints / retrieval intent leger
-> skill_router / operation_router
```

Il ne doit pas :

```text
charger toute la memoire
faire le coaching profond
ecrire durablement
remplacer le context loader du skill
```

Ce qu'il faut faire :

```text
1. Garder memory hints dans la sortie dispatcher.
2. Limiter ces hints au routing et au contexte court.
3. Laisser le skill_context_loader faire le retrieval cible.
4. Ne pas reintegrer core_identity.
```

### 2. Le skill peut-il demander un retrieval cible ?

Meilleure reponse theorique :

```text
Oui. C'est meme le bon modele.
```

Pourquoi :

```text
Le dispatcher a besoin d'une memoire courte pour router.
Le skill a besoin d'une memoire specialisee pour repondre correctement.
```

Dans notre systeme cible :

```text
conversation_skill_context_loader
-> skill_id
-> active_skill_working_state
-> dispatcher memory hints
-> Memory V2 retrieval cible
-> skill.run()
```

Exemples :

```text
emotional_repair
  -> events recents + topic memories du sujet + preferences de posture si disponibles

execution_breakdown
  -> actions / tentatives / blockers lies a l'action cible

demotivation_repair
  -> trajectoire courte + frictions recurrentes + feedbacks recents
```

Ce qu'il faut faire :

```text
1. Definir un retrieval profile par skill.
2. Charger moins apres target identification.
3. Ne pas injecter memoire profonde par defaut.
4. Tracer retrieval profile utilise.
```

### 3. Quelles couches memoire sont autorisees par skill ?

Meilleure reponse theorique :

```text
Chaque skill doit declarer ses couches autorisees.
```

Dans notre systeme cible :

```text
safety_crisis
  -> derniers messages + safety notes tres recentes si disponibles
  -> pas de product memory, pas de plan complet, pas de core_identity

emotional_repair
  -> recent messages, topic actif, event memories recentes, topic memories utiles
  -> pas de plan complet, pas de catalogue produit

execution_breakdown
  -> action target, tentatives recentes, blockers, topic memories liees
  -> plan large seulement en target_resolution

demotivation_repair
  -> trajectoire courte, phase summary, feedbacks/frictions recentes
  -> pas de detail complet de toutes les actions

product_help
  -> feature sheets / registry produit
  -> pas de Memory V2 profond par defaut

operation skills
  -> contexte operationnel strict selon phase
```

Ce qu'il faut faire :

```text
1. Formaliser memory_policy par skill.
2. Interdire core_identity.
3. Interdire plan complet sauf scope_resolution justifiee.
4. Limiter evidence items en generation.
```

### 4. Est-ce que core identity reste desactive ?

Meilleure reponse theorique :

```text
Oui, tant que la decision produit est de le garder desactive.
```

Pourquoi :

```text
Core identity est une couche lente et lourde. Mal utilisee, elle peut figer le
user dans une identite ou sur-personnaliser les reponses.
```

Dans notre systeme cible :

```text
core_identity desactive.
pas d'overlay core_identity dans safety/emotional/execution par defaut.
```

Ce qu'il faut faire :

```text
1. Retirer core_identity des context loaders actifs.
2. Ne pas l'inclure dans les retrieval profiles.
3. Laisser seulement une mention explicite "desactive" dans les docs.
4. Ajouter un test / guard si un loader tente de l'injecter.
```

### 5. Les memory write candidates sont-ils valides async ?

Meilleure reponse theorique :

```text
Oui. Les skills proposent, le memorizer decide.
```

Dans notre systeme cible :

```text
skill.run()
-> memory_write_candidates
-> response user
-> memorizer async
-> validation / persistence eventuelle
```

Les candidates doivent porter :

```text
kind
content
confidence
evidence
should_persist
sensitivity_level si necessaire
```

Ce qu'il faut faire :

```text
1. Standardiser le schema memory_write_candidates.
2. Interdire write direct depuis skill.
3. Envoyer au memorizer apres la reponse.
4. Tracer accepted/rejected memory writes.
```

### 6. Comment eviter qu'une emotion momentanee devienne une memoire durable trop vite ?

Meilleure reponse theorique :

```text
Ne jamais persister une conclusion identitaire depuis un seul moment emotionnel.
```

Dans notre systeme cible :

```text
emotion momentanee
-> event candidate faible ou no write

pattern recurrent avec evidence
-> candidate medium

preference explicite / operation confirmee
-> candidate plus forte
```

Regles :

```text
"je suis nul" -> ne pas memoriser comme identite.
"quand je rate, je pars vite en auto-critique" -> possible pattern si recurrent.
operation acceptee -> event operationnel possible.
refus feature repete -> recommendation history, pas memoire identitaire.
```

Ce qu'il faut faire :

```text
1. Ajouter une rule anti-identity-freeze.
2. Exiger evidence multi-turn pour patterns emotionnels.
3. Mettre should_persist=false par defaut pour emotion high du moment.
4. Laisser memorizer async arbitrer.
```

### Synthese d'implementation cible - memoire

Le systeme cible doit donc etre :

```text
dispatcher
  -> memory hints courts

context_loader
  -> retrieval cible par skill / operation

skill.run()
  -> utilise working_state + retrieval cible
  -> propose memory_write_candidates si utile

runtime
  -> reponse user
  -> memorizer async

memorizer
  -> valide / rejette / persiste
```

Invariants :

```text
core_identity desactive
pas de write durable depuis dispatcher/skill/tool generator
operation write memoire seulement apres confirmation/execution
emotion momentanee != memoire durable
```

### 12. Direct tools toujours actifs

```text
Quels tools peuvent etre detectes a tout moment ?
```

Questions a trancher :

- `create_one_shot_reminder` est-il actif hors safety ?
- `track_progress_plan_item` est-il actif hors safety ?
- Y a-t-il d'autres tools directs a garder ?
- Les tools directs doivent-ils etre annules si une operation intent forte est detectee ?
- Comment tracer `executed_tools` ?

Regle cible :

```text
always-on tools = tres limites.
one-shot reminder et track_progress_plan_item seulement.
pas de North Star tracking.
```

### Reponse cible - direct tools toujours actifs

Cette section decrit le comportement cible, en lien avec :

```text
conversation-tools-definitions.md
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
```

#### Documents relies

Dans `conversation-tools-definitions.md` :

```text
Outils always-on MVP :
create_one_shot_reminder
track_progress_plan_item

track_progress_north_star est retire / hors scope.
```

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
always-on tools passent apres safety et pending confirmation.
Ils peuvent produire un addon au skill actif.
```

Dans `conversation-skills-definitions.md` :

```text
safety_crisis bloque tout outil non-safety.
Les skills restent proprietaires de la reponse humaine.
```

## Reponses par question - direct tools toujours actifs

### 1. `create_one_shot_reminder` est-il actif hors safety ?

Meilleure reponse theorique :

```text
Oui, si la demande de rappel ponctuel est explicite et le temps resolu.
```

Dans notre systeme cible :

```text
hors safety
pas de pending confirmation active
demande one-shot claire
temps futur resolu
-> create_one_shot_reminder
```

Ce qu'il faut faire :

```text
1. Garder one-shot comme always-on tool.
2. Bloquer pendant safety et pending confirmation.
3. Router les recurrents vers create_recurring_reminder_operation_skill.
4. Tracer executed_tools.
```

### 2. `track_progress_plan_item` est-il actif hors safety ?

Meilleure reponse theorique :

```text
Oui, si action cible et statut sont clairs.
```

Dans notre systeme cible :

```text
hors safety
pas de pending confirmation active
target_item_id clair
status_hint completed/missed/partial
idempotence OK
-> log progress
```

Ce qu'il faut faire :

```text
1. Garder tracking comme always-on tool.
2. Bloquer si target ambigu.
3. Bloquer si source_message_id deja traite.
4. Permettre coexistence avec emotional_repair / execution_breakdown.
```

### 3. Y a-t-il d'autres tools directs a garder ?

Meilleure reponse theorique :

```text
Non au MVP.
```

Pourquoi :

```text
Chaque always-on tool augmente le risque de faux positif et d'execution
invisible. Il faut garder cette famille tres petite.
```

Dans notre systeme cible :

```text
always-on tools MVP :
1. create_one_shot_reminder
2. track_progress_plan_item
```

Explicitement hors scope :

```text
track_progress_north_star
planning changes
cartes
potions
recurring reminders
coach preferences
```

Ce qu'il faut faire :

```text
1. Ne pas ajouter de nouvel always-on tool sans ADR.
2. Garder les creations produit dans operation skills.
3. Retirer les references runtime/documentaires a North Star si restantes.
4. Tester que les actions complexes ne passent pas en always-on.
```

### 4. Les tools directs doivent-ils etre annules si une operation intent forte est detectee ?

Meilleure reponse theorique :

```text
Pas toujours. Ils passent avant operation_intent, mais seulement si leur
intention est autonome et claire.
```

Exemples :

```text
"rappelle-moi dans 30 minutes et cree une carte d'attaque"
-> one-shot peut etre programme
-> operation_intent prepare_attack_card peut ensuite demarrer si clair

"oui cree-la"
avec pending confirmation
-> pending gagne, pas one-shot/tracking

"j'ai fait ma marche, cree une carte"
-> tracking peut log si clair
-> operation_intent peut demarrer ensuite
```

Regle :

```text
si le message est principalement une confirmation Oui/Non -> pending gate gagne.
si safety -> aucun tool direct.
si tool direct clair et independant -> peut s'executer puis addon.
si tool direct ambigu -> no write.
```

Ce qu'il faut faire :

```text
1. Garder pending confirmation avant tools.
2. Autoriser tools directs seulement si intent autonome.
3. Ne pas executer un tool direct si cela change le sens de l'operation intent.
4. Tracer les deux decisions si tool + operation dans le meme tour.
```

### 5. Comment tracer `executed_tools` ?

Meilleure reponse theorique :

```text
Chaque tool direct doit produire un outcome structure et une trace.
```

Dans notre systeme cible :

```text
success
-> executed_tools [tool_name]
-> tool_execution success

blocked / needs_clarify
-> executed_tools [tool_name]
-> tool_execution blocked

failed
-> executed_tools [tool_name]
-> tool_execution failed

none
-> executed_tools []
-> tool_execution none
```

Trace minimale :

```text
tool_name
status
reason
source_message_id
target / scheduled_for si applicable
created_row_id si write
idempotent true/false
```

Ce qu'il faut faire :

```text
1. Standardiser DirectToolOutcome.
2. Injecter addon au skill actif si tool execute.
3. Ne pas laisser le skill relancer le tool.
4. Ajouter tools_executed dans observability du tour.
```

### Synthese d'implementation cible - direct tools toujours actifs

Le systeme cible doit donc etre :

```text
runtime
-> safety gate
-> pending confirmation gate
-> direct tools gate
   create_one_shot_reminder
   track_progress_plan_item
-> operation_intent
-> skill_router

direct tool
-> execute seulement si clair
-> idempotence
-> outcome structure
-> addon au skill/companion
-> trace executed_tools
```

Invariants :

```text
seulement 2 always-on tools au MVP
pas de North Star tracking
pas de creation produit complexe en direct tool
safety/pending bloquent
ambiguite -> no write
```

### 13. Planning depuis le chat

```text
Quelles modifications de planning sont interdites depuis le chat MVP ?
```

Questions a trancher :

- Peut-on changer le jour d'une action ?
- Peut-on changer une heure precise ?
- Peut-on deplacer une action dans la semaine ?
- Peut-on modifier une recurrence ?
- Quand rediriger vers dashboard ?

Regle cible :

```text
changement jour/date/horaire fin -> dashboard.
chat MVP = pas de planning fin.
```

### Reponse cible - planning depuis le chat

Cette section decrit le comportement cible, en lien avec :

```text
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
conversation-tools-definitions.md
```

#### Documents relies

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
Changer le jour / planning d'une action -> fallback dashboard.
```

Dans `conversation-skills-definitions.md` :

```text
adjust_plan_item_operation_skill detecte schedule_change et fallback_dashboard.
create_recurring_reminder_operation_skill gere les rappels recurrents, pas le
planning fin des actions.
```

Dans `conversation-tools-definitions.md` :

```text
Les tools ne doivent pas changer un jour, deplacer une action ou reconfigurer
le planning fin d'une action au MVP.
```

## Reponses par question - planning depuis le chat

### 1. Peut-on changer le jour d'une action ?

Meilleure reponse theorique :

```text
Non au MVP.
```

Pourquoi :

```text
Changer le jour d'une action touche au planning fin du plan. C'est facile a mal
comprendre dans le chat et risque de deplacer la mauvaise action, le mauvais
plan ou la mauvaise recurrence.
```

Dans notre systeme cible :

```text
"mets ma marche mardi"
"change cette action de jour"
"deplace ca a vendredi"
-> schedule_change
-> fallback_dashboard
```

Ce qu'il faut faire :

```text
1. Garder schedule_change comme scope interdit dans adjust_plan_item.
2. Bloquer generator si schedule_change.
3. Repondre avec une redirection simple vers l'espace Sophia.
4. Ne pas poser plusieurs questions pour essayer de le faire par chat.
```

### 2. Peut-on changer une heure precise ?

Meilleure reponse theorique :

```text
Non pour une action du plan au MVP.
Oui seulement pour un rappel, si c'est un reminder operation distinct.
```

Distinction :

```text
changer l'heure d'une action du plan
  -> dashboard

creer/modifier un reminder recurrent
  -> create_recurring_reminder_operation_skill si demande claire

creer un one-shot
  -> create_one_shot_reminder si ponctuel
```

Ce qu'il faut faire :

```text
1. Ne pas confondre action schedule et reminder.
2. Si le user parle de l'heure d'une action -> dashboard.
3. Si le user demande un rappel -> reminder flow.
4. Si ambigu action vs reminder -> une clarification courte ou dashboard.
```

### 3. Peut-on deplacer une action dans la semaine ?

Meilleure reponse theorique :

```text
Non au MVP.
```

Pourquoi :

```text
Deplacer une action est un changement de calendrier, pas un ajustement de
difficulte ou de formulation.
```

Dans notre systeme cible :

```text
"deplace ma marche a jeudi"
-> fallback_dashboard

"reduis ma marche a 5 minutes"
-> adjust_plan_item possible
```

Ce qu'il faut faire :

```text
1. Autoriser reduce/clarify/simplify/split/pause si scope clair.
2. Interdire move/reschedule/day change.
3. Ajouter no_schedule_day_change aux constraints.
4. Tester que "a mardi" ou "jeudi" n'entre pas dans patch plan.
```

### 4. Peut-on modifier une recurrence ?

Meilleure reponse theorique :

```text
Non pour la recurrence d'une action du plan au MVP.
Oui pour creer un recurring reminder si c'est bien un rappel.
```

Dans notre systeme cible :

```text
"fais cette action 3 fois par semaine au lieu de 5"
-> dashboard

"rappelle-moi tous les lundis de faire le point"
-> create_recurring_reminder_operation_skill
```

Ce qu'il faut faire :

```text
1. Distinguer recurrence action vs recurrence reminder.
2. Recurrence action -> dashboard.
3. Recurrence reminder -> operation skill + confirmation.
4. Ne pas modifier plan schedule depuis reminder builder.
```

### 5. Quand rediriger vers dashboard ?

Meilleure reponse theorique :

```text
Des qu'une demande touche au calendrier fin d'une action du plan.
```

Cas dashboard :

```text
changer jour/date
changer heure precise d'une action
deplacer dans la semaine
changer recurrence/frequence d'une action
modifier plusieurs actions de planning
plan ou action ambigu apres une question
```

Reponse cible :

```text
"Pour ce type de changement de planning, fais-le directement dans ton espace Sophia : ce sera plus fiable."
```

Ce qu'il faut faire :

```text
1. Ajouter fallback_dashboard clair dans adjust_plan_item.
2. Ne pas creer de pending confirmation pour schedule_change.
3. Ne pas proposer de draft partiel.
4. Garder l'ajustement chat sur la difficulte / clarté / reduction, pas le calendrier.
```

### Synthese d'implementation cible - planning depuis le chat

Le systeme cible doit donc etre :

```text
message user
-> dispatcher.operation_intent adjust_plan_item ou reminder
-> scope_resolver

si action schedule / day / date / time / recurrence
  -> fallback_dashboard
  -> no generator
  -> no pending confirmation
  -> no write

si reminder ponctuel clair
  -> create_one_shot_reminder

si recurring reminder clair
  -> create_recurring_reminder_operation_skill

si ajustement non-calendrier clair
  -> adjust_plan_item_operation_skill
```

Invariants :

```text
chat MVP = pas de planning fin des actions
reminder != action schedule
schedule_change -> dashboard
no_schedule_day_change dans generators/executors
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

Regle cible :

```text
Non = cancel operation, no write.
correction = update slots/state_patch.
opposition explicite = ne pas repusher la meme chose dans le meme contexte.
```

### Reponse cible - Non, opposition et corrections user

Cette section decrit le comportement cible, en lien avec :

```text
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
conversation-tools-definitions.md
```

#### Documents relies

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
Non -> cancel.
correction explicite peut rouvrir une ambiguite deja resolue.
previous_skill_id peut reprendre si encore pertinent.
```

Dans `conversation-skills-definitions.md` :

```text
Les skills et operation skills retournent state_patch.
Les pending confirmations indiquent Non -> cancel, aucun write.
```

Dans `conversation-tools-definitions.md` :

```text
Non -> no write.
executor sans Oui -> interdit.
```

## Reponses par question - Non, opposition et corrections user

### 1. Est-ce qu'un Non annule seulement l'operation ou aussi le skill actif ?

Meilleure reponse theorique :

```text
Non annule l'operation. Il n'annule pas automatiquement le skill conversationnel.
```

Dans notre systeme cible :

```text
pending confirmation + Non
-> cancel operation
-> no write
-> clear pending
-> reprendre previous_skill_id seulement si encore pertinent
```

Cas :

```text
Non a une carte proposee
-> ne pas creer la carte
-> execution_breakdown peut reprendre si le user veut continuer a parler du blocage

Non + changement de sujet
-> cancel operation
-> exit skill / conversation normale
```

Ce qu'il faut faire :

```text
1. Distinguer cancel_operation et exit_skill.
2. Stocker previous_skill_id dans pending.
3. Reprendre seulement si le message reste coherent avec le skill.
4. Ne jamais executer apres Non.
```

### 2. Est-ce qu'une correction user met a jour les slots ?

Meilleure reponse theorique :

```text
Oui. Une correction explicite du user doit primer sur les hypotheses IA.
```

Dans notre systeme cible :

```text
user: "non je parlais de la marche du matin, pas du soir"
-> update target slot
-> target.status re-identifie
-> state_patch corrige
```

Regle :

```text
ne pas rouvrir une ambiguite resolue sauf correction explicite.
si correction explicite -> rouvrir / remplacer le slot concerne.
```

Ce qu'il faut faire :

```text
1. Ajouter correction_detected dans router/skill output si utile.
2. Les slots doivent avoir source + confidence.
3. Correction user remplace source IA/plan si plausible.
4. Repasser readiness_gate apres correction.
```

### 3. Est-ce qu'une opposition doit etre memorisee ?

Meilleure reponse theorique :

```text
Pas automatiquement en memoire durable.
```

Distinction :

```text
refus ponctuel
  -> recommendation history / runtime trace
  -> pas memoire durable

preference explicite
  -> memory candidate possible

opposition repetee a une approche
  -> candidate possible avec evidence
```

Exemples :

```text
"non pas de carte maintenant"
-> trace recommendation declined

"je ne veux jamais que tu me proposes des cartes quand je suis mal"
-> preference candidate possible
```

Ce qu'il faut faire :

```text
1. Ne pas memoriser chaque Non comme preference durable.
2. Tracer declined/ignored dans recommendation history.
3. Proposer memory_write_candidate seulement si preference explicite ou pattern recurrent.
4. Laisser memorizer async decider.
```

### 4. Comment eviter d'insister apres un refus ?

Meilleure reponse theorique :

```text
Mettre un cooldown local sur la recommendation/opération refusee.
```

Dans notre systeme cible :

```text
Non
-> cancel operation
-> recommendation history: declined
-> cooldown court sur operation_type + contexte
```

Regle :

```text
ne pas repusher la meme operation dans le meme contexte immediat.
```

Ce qu'il faut faire :

```text
1. Stocker declined operation_type + reason/context.
2. recommendation_tool lit recent_recommendations/cooldowns.
3. Si decline recent -> do_not_recommend ou defer.
4. Autoriser seulement si le user redemande explicitement.
```

### 5. Quand reprendre le skill precedent ?

Meilleure reponse theorique :

```text
Quand le refus concerne seulement l'operation et que le probleme conversationnel
est toujours actif.
```

Reprendre si :

```text
previous_skill_id existe
pas de safety
pas de changement de sujet
user continue a parler du meme blocage/emotion
skill state pas expire
```

Ne pas reprendre si :

```text
user change de sujet
user exprime opposition au coaching lui-meme
operation etait la conclusion naturelle du skill et le user veut arreter
max_turns atteint
```

Ce qu'il faut faire :

```text
1. Conserver previous_skill_id et eventuel skill snapshot.
2. Apres Non, router decide resume_previous_skill true/false.
3. Si reprise, reinjecter working_state au skill.
4. Si pas reprise, clear skill state.
```

### Synthese d'implementation cible - Non, opposition et corrections user

Le systeme cible doit donc etre :

```text
Non sur pending
-> cancel operation
-> no write
-> recommendation declined/cooldown
-> resume previous skill si pertinent

correction user
-> update slots/state_patch
-> rerun readiness_gate si operation active
-> ne pas executer tant que pas reconfirme

opposition forte
-> ne pas repush meme operation
-> memory candidate seulement si preference explicite/recurrente
```

Invariants :

```text
Non != write
Non != memory durable automatique
correction explicite > hypothese IA
refus recent -> cooldown recommendation
reprise skill seulement si encore coherent
```

### 15. Observability

```text
Comment debugger une reponse incoherente ?
```

Questions a trancher :

- Trace-t-on le signal dispatcher choisi ?
- Trace-t-on l'operation_intent ?
- Trace-t-on le skill actif ?
- Trace-t-on les exits / handoffs ?
- Trace-t-on les tools executes ?
- Trace-t-on les writes confirmes vs refuses ?
- Trace-t-on le context loader utilise ?

Regle cible :

```text
chaque tour doit laisser une trace minimale :
dispatcher_decision, active_skill, operation_state, tools_executed, memory_hints.
```

### Reponse cible - observability

Cette section decrit le comportement cible, en lien avec :

```text
conversation-skills-tools-dispatcher-alignment-plan.md
conversation-skills-definitions.md
conversation-tools-definitions.md
```

#### Documents relies

Dans `conversation-skills-tools-dispatcher-alignment-plan.md` :

```text
l'ordre runtime doit etre trace a chaque tour :
safety, pending confirmation, always-on tools, operation_intent, skill_router,
skill.run, recommendation_tool, memory candidates.
```

Dans `conversation-skills-definitions.md` :

```text
chaque skill doit produire un status, un state_patch, une exit_reason ou
handoff_request quand il sort / passe la main.
```

Dans `conversation-tools-definitions.md` :

```text
chaque tool doit retourner un outcome traceable :
executed, blocked, duplicate, needs_clarify, pending_confirmation, failed.
```

## Reponses par question - observability

### 1. Trace-t-on le signal dispatcher choisi ?

Meilleure reponse theorique :

```text
Oui, mais sous forme de decision courte, pas en loggant tout le raisonnement.
```

Raison :

```text
Quand une reponse est incoherente, la premiere question est :
"Pourquoi le systeme est-il parti dans cette direction ?"
```

Dans notre systeme cible :

```text
dispatcher_decision = {
  safety_signal,
  operation_intent,
  skill_signals,
  memory_hints,
  selected_runtime_path,
  confidence,
  reason_codes
}
```

Ce qu'il faut faire :

```text
1. Tracer le signal retenu et les signaux ignores importants.
2. Tracer la priorite appliquee.
3. Ne pas tracer de longue analyse libre.
4. Utiliser des reason_codes stables pour debugger.
```

Exemples de reason_codes :

```text
safety_override
pending_confirmation_first
always_on_tool_explicit
operation_intent_strong
continue_active_skill
new_skill_signal
normal_reply
```

### 2. Trace-t-on l'operation_intent ?

Meilleure reponse theorique :

```text
Oui, toujours quand il est detecte, meme s'il n'est pas execute.
```

Raison :

```text
Un operation_intent peut etre detecte puis bloque par safety, pending
confirmation, ambiguite, ou skill actif.
```

Dans notre systeme cible :

```text
operation_intent_trace = {
  detected: true | false,
  operation_type,
  strength: "weak" | "medium" | "strong",
  explicitness,
  source_message_id,
  blocked_by,
  next_path
}
```

Ce qu'il faut faire :

```text
1. Distinguer detecte de lance.
2. Tracer blocked_by si l'operation ne demarre pas.
3. Ne pas remplir les slots detailles dans le dispatcher.
4. Passer a l'operation skill seulement si intent fort et autorise.
```

### 3. Trace-t-on le skill actif ?

Meilleure reponse theorique :

```text
Oui. Sans trace du skill owner, impossible de savoir qui possedait la reponse.
```

Dans notre systeme cible :

```text
active_skill_trace = {
  skill_id,
  status_before,
  status_after,
  turn_index,
  working_state_summary,
  response_owner,
  exit_reason,
  handoff_request
}
```

Regle :

```text
response_owner doit etre explicite.
```

Valeurs possibles :

```text
dispatcher
conversation_skill
operation_skill
pending_confirmation
safety
tool_ack
```

Ce qu'il faut faire :

```text
1. Tracer le skill actif avant et apres le tour.
2. Tracer quand le skill continue.
3. Tracer quand le skill sort.
4. Tracer quand un autre composant prend la reponse.
```

### 4. Trace-t-on les exits / handoffs ?

Meilleure reponse theorique :

```text
Oui, parce que les incoherences viennent souvent d'une sortie trop rapide
ou d'un handoff mal justifie.
```

Dans notre systeme cible :

```text
handoff_trace = {
  from_skill_id,
  to_skill_id_or_operation,
  reason,
  allowed_by_policy: true | false,
  safety_override: true | false
}
```

Exit reasons cibles :

```text
resolved
user_changed_topic
max_turns
operation_started
pending_confirmation_started
safety_override
handoff_requested
handoff_denied
low_relevance
```

Ce qu'il faut faire :

```text
1. Interdire les handoffs silencieux.
2. Tracer un handoff_request meme s'il est refuse.
3. Tracer pourquoi le router a accepte/refuse.
4. Garder previous_skill_id si une pending confirmation interrompt un skill.
```

### 5. Trace-t-on les tools executes ?

Meilleure reponse theorique :

```text
Oui, avec idempotency key et source_message_id.
```

Raison :

```text
La question critique est souvent :
"Est-ce que le tool a ete appele deux fois ?"
```

Dans notre systeme cible :

```text
tools_executed = [
  {
    tool_name,
    family: "always_on" | "recommendation" | "generator" | "executor",
    source_message_id,
    idempotency_key,
    outcome,
    target_id,
    write_ids
  }
]
```

Outcomes cibles :

```text
executed
blocked_by_safety
blocked_by_pending
duplicate
needs_clarify
pending_confirmation_created
failed
```

Ce qu'il faut faire :

```text
1. Chaque write doit etre relie a un source_message_id.
2. Chaque tool direct doit avoir une idempotency_key.
3. Les generators doivent tracer draft_id, pas write_id.
4. Les executors doivent tracer confirmation_id + write_ids.
```

### 6. Trace-t-on les writes confirmes vs refuses ?

Meilleure reponse theorique :

```text
Oui. C'est indispensable pour verifier le consentement.
```

Dans notre systeme cible :

```text
pending_confirmation_trace = {
  pending_id,
  operation_type,
  draft_id,
  previous_skill_id,
  user_decision: "yes" | "no" | "expired" | "cancelled_by_topic_change",
  executor_called: true | false,
  write_ids
}
```

Invariants :

```text
Non -> executor_called false
Non -> write_ids []
expired -> executor_called false
Oui -> executor_called true seulement si draft_id valide
```

Ce qu'il faut faire :

```text
1. Tracer chaque pending confirmation creee.
2. Tracer la decision user.
3. Tracer no_write explicitement apres Non.
4. Tester qu'un executor ne peut pas tourner sans Oui.
```

### 7. Trace-t-on le context loader utilise ?

Meilleure reponse theorique :

```text
Oui, mais on trace le profil de contexte, pas tout le contenu charge.
```

Raison :

```text
Pour debugger, il faut savoir si Sophia a charge le mauvais contexte :
mauvais plan, mauvaise action, trop de catalogue produit, pas assez de memoire.
```

Dans notre systeme cible :

```text
context_loader_trace = {
  profile,
  plan_ids_available,
  selected_plan_id,
  transformation_id,
  target_resolution_status,
  memory_layers_used,
  product_catalog_sections,
  narrowed: true | false,
  removed_context
}
```

Ce qu'il faut faire :

```text
1. Tracer le profile utilise : route_message, skill_execution_breakdown,
   operation_prepare_attack_card, product_help, etc.
2. Tracer selected_plan_id si operation liee au plan.
3. Tracer target_resolution_status.
4. Tracer quand le contexte est narrowed.
5. Ne pas logger inutilement tout le contenu sensible.
```

### 8. Comment debugger une reponse incoherente ?

Meilleure reponse theorique :

```text
Il faut pouvoir reconstruire le tour en 60 secondes avec une trace unique.
```

Questions de debug :

```text
1. Quel message user a declenche la decision ?
2. Est-ce que safety etait active ?
3. Y avait-il une pending confirmation ?
4. Un always-on tool a-t-il ecrit ?
5. Une operation intent a-t-elle ete detectee ?
6. Quel skill etait actif ?
7. Qui a possede la reponse ?
8. Quel contexte a ete charge ?
9. Quelles memoires ont ete proposees / ecrites ?
10. Quel write DB a ete fait, refuse ou bloque ?
```

Ce qu'il faut faire :

```text
1. Creer une conversation_turn_trace par tour.
2. Relier toutes les traces par turn_id + source_message_id.
3. Avoir un niveau minimal toujours actif.
4. Ajouter un mode debug plus verbeux en staging/evals.
```

### Synthese d'implementation cible - observability

Trace minimale cible par tour :

```text
conversation_turn_trace = {
  turn_id,
  conversation_id,
  user_id,
  source_message_id,
  runtime_order_version,

  dispatcher_decision,
  safety_signal,
  pending_confirmation_state,
  always_on_tools,
  operation_intent,
  active_skill,
  operation_state,
  recommendation_decision,

  context_loader_profile,
  memory_hints,
  memory_write_candidates,

  response_owner,
  response_intent,
  tools_executed,
  writes_confirmed,
  writes_refused,
  exit_or_handoff
}
```

Cas de debug que cette trace doit couvrir :

```text
mauvais skill declenche
skill qui sort trop vite
operation lancee alors que cible ambigue
tool execute deux fois
write apres Non
mauvais plan selectionne
feature poussee pendant emotion fragile
memoire durable creee depuis un signal ponctuel
```

Invariants :

```text
pas de write invisible
pas de handoff invisible
pas de tool invisible
pas de contexte plan-linked sans plan_id explicite
pas de memory write durable sans memorizer async
```

## Checklist courte avant implementation

Avant de coder un nouveau flow, verifier :

```text
1. Est-ce que safety peut l'interrompre ?
2. Est-ce que le flow peut ecrire en DB ?
3. Si oui, y a-t-il confirmation Oui/Non ?
4. Comment evite-t-on les doublons ?
5. Quel skill ou tool en est proprietaire ?
6. Quel contexte est charge au debut ?
7. Quel contexte est retire apres identification ?
8. Que fait-on si la cible est ambigue ?
9. Que fait-on si le user dit Non ?
10. Que fait-on si le user change de sujet ?
11. Est-ce que le flow marche avec deux plans ?
12. Est-ce que le comportement chat est aligne avec la plateforme ?
```

### Utilisation de la checklist

La checklist sert a valider un flow avant implementation, pas apres coup.

Regle :

```text
si une question n'a pas de reponse claire, le flow est trop flou pour etre code.
```

### Checklist detaillee cible

Ownership :

```text
1. Qui possede la reponse user sur ce tour ?
2. Est-ce un dispatcher path, un conversation skill, un operation skill,
   une pending confirmation ou un tool ack ?
3. Quel composant peut interrompre ce flow ?
```

Safety / priorite :

```text
4. Safety peut-il override a chaque tour ?
5. Que se passe-t-il si safety apparait pendant une operation pending ?
6. Que se passe-t-il si safety apparait pendant un skill conversationnel ?
```

Operation / write :

```text
7. Le flow ecrit-il en DB ?
8. Si oui, le write est-il always-on direct ou confirmation Oui/Non ?
9. Quel executor est autorise a ecrire ?
10. Quelle idempotency_key evite les doublons ?
```

Contexte :

```text
11. Quel context_loader est utilise au debut ?
12. Quel contexte est retire apres target resolution ?
13. Le flow a-t-il besoin d'un plan_id / transformation_id ?
14. Que fait-on si plusieurs plans sont candidats ?
```

Skills :

```text
15. Quel signal peut entrer dans le skill ?
16. Quelles sont les exit rules ?
17. Quels handoffs sont autorises ?
18. Le skill conserve-t-il un working_state_summary pour le tour suivant ?
```

User control :

```text
19. Que fait-on si le user dit Non ?
20. Que fait-on si le user corrige Sophia ?
21. Que fait-on si le user change de sujet ?
22. Que fait-on si le user demande une action hors scope chat ?
```

Memoire :

```text
23. Quelles memory layers sont chargees ?
24. Est-ce que core_identity reste desactive ?
25. Est-ce que le flow propose des memory_write_candidates ?
26. Est-ce que seul memorizer async peut persister ?
```

Observability :

```text
27. Quel turn_trace permet de debugger la decision ?
28. Trace-t-on les tools executes / bloques / duplicates ?
29. Trace-t-on les pending confirmations confirmees/refusees ?
30. Trace-t-on le context_loader_profile et le narrowing ?
```

Alignement produit :

```text
31. Le comportement chat est-il aligne avec la plateforme ?
32. Le flow respecte-t-il les interdits MVP ?
33. Le user sait-il ou modifier dans sophia-coach.ai apres execution ?
```
