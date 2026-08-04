# QA Run Report - Global Normal Conversation 15T - R2

## 1. Contexte Du Test

- Date: 2026-05-20
- Run: `global15_20260520_r2`
- Persona: persona QA temporaire locale `all_skills_global15_r2`
- Objectif: relancer une conversation normale 15 tours apres patch 20/80 sur les regressions R1.
- Trajectoire: demarrage dossier client -> carte d'attaque -> soutien executionnel/emotionnel -> rappel ponctuel -> aide produit -> sortie product_help -> preference coach -> recap final.
- Surfaces visees: dispatcher v2, router, `execution_breakdown`, `emotional_repair`, `prepare_attack_card`, `product_help`, `create_one_shot_reminder`, `update_coach_preferences`, contexte recent, effets durables.
- Cadre IA reel: Supabase local, endpoint `test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback `processMessage` direct.
- Validite QA: valide, avec un incident technique documente au tour 4. Le premier serveur direct etait partage avec un autre run local; le retry a ete repris sur un port isole `8788`.
- Variante vs R1: memes objectifs QA, formulations utilisateur changees et trajectoire adaptee aux reponses reelles.
- Artifacts: `2026-05-20-global-normal-conversation-15t-r2.summary.json`, `2026-05-20-global-normal-conversation-15t-r2.raw.jsonl`, `2026-05-20-global-normal-conversation-15t-r2.durable.json`, `2026-05-20-global-normal-conversation-15t-r2.post-cleanup.json`.

## 2. Tours De Conversation

### Incident Avant Tour 4

**User**
> Oui, valide la carte. Je commence par lire deux minutes; là j'entends déjà: si tu ne comprends pas tout, ça ne vaut rien.

**Sophia**
> Reponse non recue cote driver: `fetch failed`.

**Trace courte**
- Cause observee: serveur direct `:8000` partage avec un autre run local; logs interleaves `qa-rose...`.
- Effet observe DB: message user ecrit, pas de reponse assistant, pas d'effet durable.
- Resolution: endpoint relance sur port isole `8788`; retry documente en `4r`.

### Tour 1

**User**
> Hello Sophia, j'ai un dossier client à relancer aujourd'hui. Rien de dramatique, mais je sens que je vais tourner autour au lieu d'ouvrir les notes. Je veux juste un départ simple.

**Sophia**
> Je vois très bien le genre, c'est souvent le démarrage qui coûte le plus cher en énergie.
>
> Pour casser cette résistance, je te suggère de te concentrer uniquement sur l'ouverture du fichier, sans même chercher à écrire quoi que ce soit pour l'instant. Je peux aussi te préparer une Carte d'attaque si tu veux qu'on pose un cadre hyper clair pour ce dossier.
>
> On tente ça ? 🚀

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- direct_effects: []
- executed_tools: []

### Tour 2

**User**
> Oui, fais-moi une version minimale. Le boulot c'est relire deux pages de compte rendu; mon réflexe c'est d'attendre d'avoir tout compris avant d'écrire une ligne.

**Sophia**
> C'est noté pour la relecture du compte rendu. Ton blocage ressemble à du perfectionnisme : tu veux tout maîtriser avant de te lancer. Pour ta version minimale, je te propose deux options : 'Le texte magique' pour recadrer cette pensée, ou le 'Mot de bascule' pour me signaler ton blocage en un mot. Qu'est-ce qui te semble le plus efficace ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- pending_confirmation: none
- executed_tools: []

### Tour 3

**User**
> Prends le texte magique. Et retiens le point important: mon piège c'est de vouloir comprendre parfaitement avant de produire une version imparfaite.

**Sophia**
> Voici ton brouillon pour : Relire deux pages de compte rendu.
> Technique : Le texte magique.
> "Je n'ai pas besoin de tout comprendre pour avancer. Je produis une version imparfaite maintenant pour libérer mon esprit."
> Lis ce texte dès que tu commences à trop réfléchir, puis ouvre le document.
> Est-ce que je valide cette carte ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- pending_confirmation: draft carte d'attaque
- executed_tools: []

### Tour 4r

**User**
> Je reprends après l'incident technique: oui, valide la carte. Je commence par lire deux minutes; là j'entends déjà: si tu ne comprends pas tout, ça ne vaut rien.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Relire deux pages de compte rendu
> Technique : Le texte magique
> Je n'ai pas besoin de tout comprendre pour avancer. Je produis une version imparfaite maintenant pour libérer mon esprit.
>
> Mode d'emploi : Lis ce texte dès que tu commences à trop réfléchir, puis ouvre le document.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque pour la relire et l'utiliser. Si c'est une carte Mot de bascule, le mot peut etre remplace depuis cette zone; pour changer le contexte, la technique ou le contenu, je peux preparer une nouvelle carte apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler` dans l'extrait court, effet direct execute
- direct_effects: `prepare_attack_card: success`
- executed_tools: [`prepare_attack_card`]
- durable_effect: carte d'attaque active observee en DB

### Tour 5

**User**
> Donne-moi une phrase courte, très terre-à-terre, pour ne pas suivre cette voix maintenant.

**Sophia**
> Ok. Tiens une phrase courte, béton : “Je lis juste deux minutes, ensuite je fais le prochain pas.” 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- direct_effects: []

### Tour 6

**User**
> J'ai lu les deux pages. J'ai compris seulement une partie et j'ai envie de retourner lire au lieu d'écrire les trois puces.

**Sophia**
> Ah oui, le cerveau fait encore son cinéma “si c’est pas compris, j’écris pas”. 😅
> Là, ton prochain pas n’est pas d’écrire 3 puces. C’est juste de noter 1 phrase brute sur ce que tu as compris.
>
> Tu me la donnes en une phrase, telle qu’elle vient (même imparfaite) ? ✅

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- direct_effects: []

### Tour 7

**User**
> La phrase brute: le client attend surtout qu'on clarifie les risques et les prochaines dates. Et je sens la honte monter: je me trouve ridicule de bloquer sur ça.

**Sophia**
> Ouh… la honte qui monte, c’est un signal que tu prends ça au sérieux, pas que tu es “ridicule”. 😕
> Quand tu as honte, ton cerveau confond “je bloque” avec “je suis nul”.
>
> Là, on revient au concret, parce que le client attend juste le utile :
> “J’ai listé les risques clés + les prochaines dates. Je te l’envoie dans la foulée.”
>
> Tu veux plutôt envoyer ces 2 trucs comme :
> A) 3 risques + 3 dates (ultra direct)
> B) 3 risques + 1 date de validation (plus cadré) ?

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- direct_effects: []

### Tour 8

**User**
> Option A. Et propose-moi juste un micro-geste qui me remet devant le fichier, sans grande explication.

**Sophia**
> Parfait, Option A. 👌🙂
>
> Micro-geste: ouvre le fichier et mets-toi sur “page 1” seulement, curseur dans le document, sans rien écrire.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- direct_effects: []

### Tour 9

**User**
> Fait. Ça a desserré un peu le truc. Rappelle-moi demain à 8h30 de reprendre le dossier client par trois puces moches, pas plus.

**Sophia**
> C’est programmé pour jeudi 21 mai à 08:30 : reprendre le dossier client par trois puces moches, pas plus. 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: none
- direct_effects: `create_one_shot_reminder: success`
- executed_tools: [`create_one_shot_reminder`]
- durable_effect: `scheduled_checkins.status=pending`, `scheduled_for=2026-05-21T06:30:00Z`

### Tour 10

**User**
> Merci. Et ce rappel ponctuel que tu viens de programmer, je le retrouve ou je le modifie où dans Sophia ?

**Sophia**
> De rien 😊
>
> Le rappel ponctuel que je t’ai “programmé” se gère côté Initiatives (dans les rappels côté chat, pour ce type-là). Pour le modifier/annuler, le plus fiable c’est de me le redire ici clairement, par exemple “change le rappel de jeudi 21 mai à 09:00” ou “annule-le”.
>
> Tu veux le modifier à quelle date/heure (et le texte exact du rappel, si tu veux changer) ? ⏱️

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- direct_effects: []
- durable_effect: none

### Tour 11

**User**
> Non, pas maintenant. Laisse l'interface de côté: tu te souviens du piège de travail que je t'ai demandé de garder en tête ?

**Sophia**
> Oui 🙂 Je me souviens du piège de travail que tu veux éviter: quand tu ne comprends pas tout, ton cerveau te dit “donc je n’écris pas / je n’avance pas”, et tu te retrouves à tourner en rond.
>
> La sortie du piège, c’était: lire un tout petit morceau (2 minutes) puis produire une version imparfaite mais utile, sans chercher la perfection avant d’agir. 🎯
>
> Tu veux que je te le reformule en 1 phrase ultra-courte pour que tu puisses t’y recoller tout de suite ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: none
- product_help: sorti proprement
- direct_effects: []

### Tour 12

**User**
> Oui, formule-le en une phrase courte.

**Sophia**
> Je te la formule direct : « Je fais juste le prochain pas, même imparfait, sans attendre de tout comprendre. » 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- direct_effects: []

### Tour 13

**User**
> Pour la suite, préfère me poser une seule question courte à la fois; les longues listes me font décrocher quand je suis bloqué.

**Sophia**
> Je peux régler ma façon de répondre: j'utiliserai moins de questions. Tu veux que je l'applique ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- pending_confirmation: preference coach
- executed_tools: []

### Tour 14

**User**
> Oui, applique cette préférence.

**Sophia**
> C'est fait. J'ai appliqué cette préférence : j'utiliserai moins de questions. 🙂

**Trace courte**
- http_status: 200
- direct_effects: `update_coach_preferences: success`
- executed_tools: [`update_coach_preferences`]
- durable_effect: `user_profile_facts.coach.question_tendency=low`
- Note trace: l'extrait court du driver remonte `conversation_handler`, mais la trace DB complete indique bien `response_owner=tool_skill` et `tool_skill_run.status=executed`.

### Tour 15

**User**
> On s'arrête là. Fais-moi un récap sobre: ce que j'ai fait, ce qui est prévu demain, et le piège à surveiller.

**Sophia**
> Ok. Là on fait sobre. 🙂📝
>
> Ce que t’as fait :
> - Tu as choisi Option A et tu t’es remis devant le fichier avec le micro-geste (page 1, curseur posé, sans écrire).
> - Ça a desserré le blocage.
>
> Ce qui est prévu demain :
> - Reprendre le dossier client à 8h30.
> - Format ultra court : “par trois puces moches”, pas plus.
>
> Le piège à surveiller :
> - Quand tu ne comprends pas tout, ton cerveau te dit “alors je n’écris pas / je n’avance pas”, et tu tournes en rond.
> - Sortie du piège : lire un tout petit morceau (2 minutes) et faire juste le prochain pas.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: none
- direct_effects: []
- memory/context: recap correct grace au contexte recent injecte

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les handoffs principaux sont naturels: demarrage concret, carte d'attaque, shame repair, rappel, aide produit, retour conversationnel, preference coach.
- Le tour 11 corrige le probleme R1: Sophia sort bien de `product_help` et se souvient du piege de travail.
- Le tour 15 corrige le probleme R1: recap contextualise, pas de "je n'ai pas le contexte".
- Le ton reste globalement aidant et actionnable; Sophia ne force pas un plan lourd quand l'utilisateur demande du petit.

**Problemes**
- Tour 7: Sophia aide correctement la honte, mais repart avec deux options A/B alors que l'utilisateur demande surtout "aide-moi deux secondes". Impact: legere charge cognitive. Severite: yellow faible.
- Tour 10: reponse produit nettement meilleure que R1, mais la derniere question lance presque une modification de rappel alors que l'utilisateur demandait surtout ou le retrouver/modifier. Impact: petite friction UX, pas d'effet durable incorrect. Severite: yellow faible.
- Incident technique avant 4r: le run a necessite un retry a cause d'une collision de serveur local. Impact QA documente, pas un bug conversationnel Sophia. Severite: yellow technique.

**Fix propose**
- Product help: terminer les reponses "ou modifier" par une phrase de capacite, pas une question de slot, sauf si l'utilisateur exprime explicitement vouloir modifier maintenant.
- Emotional repair: quand l'utilisateur demande "sans grande explication" ou "deux secondes", limiter les choix multiples.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tours 1, 5, 6, 12: `execution_breakdown` intervient sur les demandes de demarrage/reformulation.
- Tours 2-4r: `prepare_attack_card` collecte le slot technique, demande confirmation, puis execute la carte.
- Tour 7-8: `emotional_repair` prend la main sur la honte, sans side effect.
- Tour 9: l'intention rappel explicite sort du flow actif et execute `create_one_shot_reminder`.
- Tour 10: `product_help` est selectionne uniquement pour la question produit.
- Tour 11: sortie de product_help vers `normal_reply`, comportement attendu apres patch.
- Tour 13-14: `update_coach_preferences` passe par confirmation et execute apres "Oui".
- Tour 15: `normal_reply` recap sans reprendre product_help ni execution_breakdown.

**Skills / Operations / Tools**
- `prepare_attack_card`: effet durable observe, carte active `out_of_plan`, technique `texte_recadrage`.
- `create_one_shot_reminder`: effet durable correct, `scheduled_for=2026-05-21T06:30:00Z` soit 08:30 Europe/Paris, status `pending`.
- `product_help`: diagnostic attendu dans trace complete: `one_shot_reminder.chat`, contraintes `do_not_restart_reminder_slot_filling`, aucun side effect.
- `update_coach_preferences`: `coach.question_tendency=low` persiste en `user_profile_facts` avec source `explicit_user`.

**Memory / Effets durables**
- Memoire durable conversationnelle: pas d'item promu, ce qui est acceptable pour un run court et sensible; le recap utilise le contexte recent.
- Effets durables observes avant cleanup: 1 carte d'attaque, 1 rappel ponctuel, 1 preference coach explicite.
- Cleanup cible effectue: user temporaire supprime, tables QA verifiees vides apres cleanup.

**Problemes**
- Trace courte du driver sur tour 14 etait ambigue (`conversation_handler`), mais la trace DB complete confirme `response_owner=tool_skill` et `tool_skill_run.status=executed`. Impact systeme produit: aucun; impact observabilite driver: yellow faible.
- Le premier endpoint direct sur `:8000` etait partage avec un autre run. Impact: un user message orphelin avant retry. Resolution: port configurable `PORT` pour `test-send-message` et serveur isole `:8788`.

**Fix propose**
- Garder `PORT` configurable dans `test-send-message` pour isoler les runs QA paralleles.
- Ameliorer l'extracteur `trace_short` du driver pour privilegier `conversation_turn_trace.response_owner` final quand un tool skill execute sur confirmation.

## Verdict Global

**Verdict: yellow**

Le patch 20/80 corrige les regressions critiques du R1: plus de sticky product_help, rappel ponctuel explique avec contexte, preference coach executee et persistee, recap final contextualise. Le run reste `yellow` a cause d'un incident technique de serveur local et de deux frictions UX faibles, pas a cause d'un effet durable incorrect.
