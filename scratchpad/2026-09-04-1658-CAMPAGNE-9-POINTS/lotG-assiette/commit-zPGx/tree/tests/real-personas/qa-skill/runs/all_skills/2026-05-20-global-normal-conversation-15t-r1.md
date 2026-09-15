# QA Run Report - Global Normal Conversation 15t - r1

## 1. Contexte Du Test

- Date: 2026-05-20
- Run: global15_20260520_r1
- Persona: qa-skill, connexion temporaire all_skills_global15_20260520_r1, user_id 3cc23b63-8bfa-43a4-b05b-488b9d5973a0, email qa-qa-skill-all-skills-global15_20260520_r1@example.com
- Objectif: simuler une conversation lambda de 15 tours pour tester coexistence dispatcher, skills conversationnels, mémoire courte, aide produit, outil rappel, préférences coach.
- Trajectoire: démarrage de travail -> carte/micro-action -> honte légère -> rappel ponctuel -> aide produit -> rappel mémoire/contexte -> préférence coach -> récap.
- Surfaces visees: execution_breakdown, emotional_repair, product_help, create_one_shot_reminder, memory/retrieval conversationnel, update_coach_preferences attendu mais non déclenché.
- Cadre IA reel: local Supabase, /functions/v1/test-send-message, force_full_ai=true, disable_debounce=true, Authorization gateway anon + x-user-authorization user JWT, pas de renderer déterministe ni fallback processMessage. JWT non reporté.
- Artefacts: raw=/Users/ahmedamara/Dev/Sophia 2/tests/real-personas/qa-skill/runs/all_skills/2026-05-20-global-normal-conversation-15t-r1.raw.json; summary=/Users/ahmedamara/Dev/Sophia 2/tests/real-personas/qa-skill/runs/all_skills/2026-05-20-global-normal-conversation-15t-r1.summary.json; durable=/Users/ahmedamara/Dev/Sophia 2/tests/real-personas/qa-skill/runs/all_skills/2026-05-20-global-normal-conversation-15t-r1.durable.json; state_sanitized=/Users/ahmedamara/Dev/Sophia 2/tests/real-personas/qa-skill/runs/all_skills/2026-05-20-global-normal-conversation-15t-r1.state.json.
- Reset/cleanup: pass, nettoyage ciblé du user temporaire après inspection durable; connection.json supprimé; state sans jetons Auth.
- Validite QA: valide avec incident transport documenté au tour 13 tentative 1 (mauvaise clé anon côté runner, HTTP 401, aucun effet Sophia), puis retry du même message.

## 2. Tours De Conversation

### Tour 1

**User**
> Salut Sophia, j'ai une journée assez banale mais chargée: un dossier client à avancer et zéro envie de m'y mettre. Je veux juste démarrer sans me faire un grand plan.

**Sophia**
> Je vois tout à fait, c'est souvent le démarrage qui coûte le plus cher en énergie. Pour te lancer sans faire de grand plan, je peux te préparer une Carte d'attaque. Ça permet de viser un micro-objectif immédiat pour briser la glace. Tu veux qu'on tente ça ? 🚀

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: execution_breakdown
- route_reason: skill_entry_signal
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 2

**User**
> Oui, tente, mais en version ultra légère. Le dossier c'est relire deux pages de notes client; mon blocage c'est que je veux tout comprendre avant d'écrire la moindre ligne.

**Sophia**
> C'est le piège classique du perfectionnisme qui paralyse le mouvement. On va casser ça tout de suite avec un objectif minuscule : lis ces deux pages comme si c'était un simple article de blog, sans chercher à mémoriser ou structurer quoi que ce soit pour l'instant.
> 
> Je te prépare une Carte d'attaque basée sur cette approche pour que tu puisses juste déclencher l'action sans pression. Tu es prêt à ce que je la génère ? ⚡️

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: active_skill_exit_requested
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 3

**User**
> Oui, génère-la. Et garde en tête que mon piège récurrent c'est l'envie de comprendre parfaitement avant de produire quoi que ce soit.

**Sophia**
> Ok, on y va. 🧠✍️
> 
> Carte d’attaque ultra légère (dossier: relire 2 pages)
> 
> 1) 2 minutes de “lecture sans jugement”
> Tu lis les 2 pages, point. Sans surligner, sans ré-écrire, sans “comprendre parfaitement”. Objectif: te familiariser.
> 
> 2) 5 minutes: uniquement de la restitution brute
> Tu écris 3 puces maximum sur ce que tu as retenu (même si c’est incomplet). Style: notes “brouillon”, pas un texte final.
> 
> 3) Micro-frein à court-circuiter
> Dès que tu sens “je dois tout comprendre avant d’écrire”, tu te dis: “Je peux comprendre en écrivant.” Et tu continues les 3 puces.
> 
> Règle d’or: tu n’évalues pas la qualité, tu n’évalues que le fait d’avoir produit ces 3 puces.
> 
> Tu préfères commencer par lire (2 min) tout de suite, ou te caler 30 secondes de “préparation mentale” d’abord ? 🙂

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: normal_reply_default
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 4

**User**
> Je vais lire directement. Je mets un minuteur deux minutes, mais j'ai déjà la petite voix qui dit que ça ne sert à rien si je ne comprends pas tout.

**Sophia**
> Parfait. Là, ton cerveau essaie juste de te protéger… mais il te bloque. 😅
> 
> Mini-contre (pendant les 2 minutes) :
> 1) Tu acceptes “pas tout comprendre” comme règle du jeu (juste “me familiariser”).
> 2) Si la voix revient, tu notes mentalement “plus tard” et tu continues la lecture.
> 3) À la fin, tu ne relis pas: tu passes direct à la restitution brute.
> 
> Tu veux que je te donne une phrase “anti-voix” à te répéter exactement ? 😊

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: execution_breakdown
- route_reason: skill_entry_signal
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 5

**User**
> Oui, une phrase courte. Pas un mantra trop joli, juste un truc crédible que je peux me dire sans lever les yeux au ciel.

**Sophia**
> Ok. Dis-toi: “L’objectif, c’est d’avancer, pas de tout comprendre.” 🙂

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: product_help
- route_reason: skill_handoff_requested
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 6

**User**
> Ok, j'ai lu les deux pages. J'ai compris 60%, pas plus, et j'ai envie de repartir dans la lecture au lieu d'écrire les trois puces.

**Sophia**
> Ah parfait, t’as déjà fait la partie “sans pression” ✅ (même si ça te laisse sur ta faim). 😄
> 
> Là, on applique la règle anti-perfectionnisme: tu ne reviens pas en arrière tout de suite.
> Fais juste ça, maintenant: écris 3 puces ultra moches, en mode “ce que je me souviens” même si c’est incomplet (pas plus de 2 minutes), puis seulement après tu reliras si tu as encore besoin.
> 
> Tu préfères A: 3 puces “idées principales”, ou B: 3 puces “questions / zones floues” ?

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: active_skill_exit_requested
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 7

**User**
> Je prends A, mais je sens monter un truc nul: j'ai honte de galérer sur une tâche aussi simple. On peut rester deux secondes là-dessus avant que je continue ?

**Sophia**
> Oui. Stop deux secondes là-dessus. 😕
> 
> Ce que tu décris ressemble à une auto-attaque, pas à “un vrai fait”. Tu galères, donc ton cerveau traduit ça en “je suis nul / je suis une honte” pour te juger plus vite… et ça te vole l’élan.
> 
> Là, on retire la conclusion identitaire et on garde le signal utile : tu es sur une tâche simple, mais ton système est en mode blocage (parce que “tout comprendre avant d’écrire” te met une barrière). Ça veut dire que ton objectif doit être plus petit, pas que tu es nul.
> 
> Pose juste une main sur ton ventre ou ta poitrine 5 secondes, et dis-toi une phrase neutre : “Je bloque, c’est passager. Je peux faire le tout petit début.” 🙏
> 
> Tu veux que je te propose le tout premier micro-mouvement (encore plus léger que “relire”) pour casser la honte, oui ou non ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: emotional_repair
- route_reason: skill_entry_signal
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 8

**User**
> Oui. Pas de morale, juste un micro-mouvement qui me remet devant le fichier.

**Sophia**
> OK, micro-mouvement, pas de morale. 😌
> 
> Fais juste ça maintenant:
> 1) Ouvre le fichier
> 2) Mets-toi sur la première ligne
> 3) Lis 10 secondes, puis stop (même si c’est frustrant)
> 4) Retourne sur la même ligne 2 secondes plus tard (juste pour “rester accroché”)
> 
> Quand tu l’auras fait, tu fais quoi: tu me dis “fait” ou tu me dis où ça coince ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: emotional_repair
- route_reason: active_conversation_skill_continue
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 9

**User**
> Fait. Ça m'a débloqué un peu. Peux-tu me rappeler demain à 8h30 de reprendre ce dossier client par trois puces moches, pas plus ?

**Sophia**
> C’est programmé pour jeudi 21 mai à 08:30 : reprendre ce dossier client par trois puces moches, pas plus. 🙂

**Trace courte**
- http_status: 200
- response_owner: normal_reply
- selected_handler: null
- route_reason: active_skill_exit_requested
- safety: risk_band=none, allow_side_effects=true
- direct_effects: [{"effect_type":"create_one_shot_reminder","explicitness":"explicit","payload_hint":{"raw_text":"reprendre ce dossier client par trois puces moches, pas plus","time_hint":"demain à 8h30","target_date":"2026-05-21","target_time":"08:30"},"target_status":"identified","confidence_band":"high"}]
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: ["create_one_shot_reminder"]
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 10

**User**
> Cool. Au passage, dans l'app je retrouve ce rappel où ? Je ne sais jamais si c'est dans le dashboard ou ailleurs.

**Sophia**
> Dans l’app, tu le retrouves selon le type de rappel : souvent dans le coin “Rappels / Notifications” (ou “Rendez-vous” si c’est un truc planifié), et sinon dans “Dashboard” si c’est rangé côté suivi. 😊
> 
> Là, comme tu parles d’un rappel spécifique “où je retrouve ce rappel”, dis-moi juste : c’est un rappel ponctuel (une date/heure) ou une habitude récurrente ? (A/B)

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: skill_entry_signal
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 11

**User**
> Ponctuel, celui que tu viens de programmer pour demain matin.

**Sophia**
> Yes ✅ Je te confirme juste le point pratique : pour demain matin, c’est bien un rappel ponctuel (pas un rendez-vous récurrent). ⏰
> 
> Dis-moi juste l’heure exacte demain matin (ex: 8h15), et dans quel format tu veux le message : court ou “motivations + action” ? 🙂

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: skill_entry_signal
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 12

**User**
> Non, tu l'as déjà mis à 8h30. Je demande juste où je peux le voir ou le modifier dans le produit.

**Sophia**
> OK, je vois ce que tu veux : savoir où consulter ou ajuster. 👌
> 
> Dans le produit, tu peux voir et ouvrir la vue Plan via Dashboard > Plan. Tu y retrouves le niveau actif, les semaines, missions/habitudes/clarifications et les éléments à venir.
> 
> Par contre, pour ajouter librement une action ou pour saisir les bilans hebdos, ça ne se fait pas dans le Plan : les bilans se font par message WhatsApp le dimanche. Et il n’existe pas d’endroit “ajout libre” d’action dans le dashboard. 🙂
> 
> Tu parles de quoi exactement : un rappel ponctuel ou une habitude/missions dans le Plan ?

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: skill_entry_signal
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 13 - tentative échouée runner

**User**
> Laisse tomber pour l'interface. Tu te souviens du piège que je t'ai demandé de garder en tête tout à l'heure ?

**Sophia**
> [réponse vide]

**Trace courte**
- http_status: 401
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: risk_band=null, allow_side_effects=null
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":null}
- executed_tools: []
- durable_effect: null
- empty_response: yes
- aborted: no

### Tour 13 - retry valide

**User**
> Laisse tomber pour l'interface. Tu te souviens du piège que je t'ai demandé de garder en tête tout à l'heure ?

**Sophia**
> Ouais je vois le piège que tu m’as demandé de garder en tête tout à l’heure 😄
> 
> C’était celui du “tout comprendre avant d’écrire” : ton cerveau veut te mettre la barre trop haut, et dès que tu bloques, il transforme ça en jugement identitaire du style “je suis nul / j’ai honte”, ce qui te fait perdre l’élan.
> 
> Le contre-mouvement, c’est : avançer avec des 3 puces moches, pas pour être “juste”, mais pour rester au contact du fichier.
> 
> Tu veux que je te reformule le piège en une phrase ultra-courte pour que tu l’aies sous les yeux ? 👌

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: skill_entry_signal
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 14

**User**
> Oui. Et pour la suite, préfère me poser une seule question courte à la fois. Les listes longues me font décrocher quand je suis déjà bloqué.

**Sophia**
> Bien noté 🙂 Une seule question courte à la fois, promis.  
> 
> Pour qu’on avance quand tu es bloqué: je te proposerai des micro-actions ultra petites en priorité, et je ne te demanderai une question que si c’est vraiment nécessaire. Quand tu veux, on reprend sur la suite du dossier client : tu préfères que je te fasse une prochaine micro-étape “à faire maintenant” ou une micro-étape “pour demain 8h30” ?

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: skill_entry_signal
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

### Tour 15

**User**
> On s'arrête là. Fais-moi un récap très sobre: ce que j'ai fait, ce qui est prévu demain, et le piège à surveiller.

**Sophia**
> Ok, on stop là. 🙂 Voici le récap sobre, mais je n’ai pas assez de contenu dans ce chat pour dire précisément “ce que tu as fait” et “ce qui est prévu demain”.
> 
> 1) Ce que tu as fait : je n’ai pas les étapes/résultats sous les yeux ici.
> 2) Ce qui est prévu demain : je n’ai pas les tâches/heure exacte dans ce chat.
> 3) Piège à surveiller : je peux te proposer un piège générique, mais je préfère que tu me dises le contexte (projet/sujet) pour viser juste.
> 
> Tu veux me répondre juste en 3 lignes (fait / demain / piège), ou tu me dis le sujet et je te formule le piège le plus probable ?
> 
> Concrètement, je parle d'une Preferences coach, à préparer seulement si tu confirmes.

**Trace courte**
- http_status: 200
- response_owner: product_help
- selected_handler: product_help
- route_reason: skill_entry_signal
- safety: risk_band=none, allow_side_effects=true
- direct_effects: []
- operation: null
- pending_confirmation: null
- memory_plan: {"retrieval_policy":null,"write_candidates_emitted":0}
- executed_tools: []
- durable_effect: null
- empty_response: no
- aborted: no

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tours 1-4: Sophia répond au besoin réel de démarrage sans grand plan et propose des micro-actions concrètes.
- Tours 7-8: le handoff émotionnel est naturel; elle ralentit, dégonfle la honte et revient à un micro-mouvement sans moraliser.
- Tour 9: le rappel est confirmé simplement, avec date et heure correctes pour demain matin.
- Tour 13 retry: malgré un mauvais owner dans la trace, Sophia se souvient correctement du piège conversationnel.

**Problemes**
- Tour 3: Sophia dit générer une carte d'attaque mais la sort comme texte conversationnel, sans indiquer si elle est enregistrée ou seulement proposée. Impact: ambiguïté produit; l'utilisateur peut croire qu'un artefact existe. Severite: yellow.
- Tours 10-12: product_help ne tire pas parti du rappel qui vient d'être créé; elle redemande si c'est ponctuel puis dérive vers Plan/WhatsApp. Impact: l'utilisateur corrige Sophia deux fois et n'obtient pas où voir/modifier le rappel. Severite: red.
- Tour 14: Sophia promet une préférence coach, mais aucune confirmation ni effet durable n'apparaît. Impact: promesse de personnalisation non fiable. Severite: yellow.
- Tour 15: Sophia affirme ne pas avoir assez de contexte pour résumer ce qui vient d'être fait, le rappel de demain et le piège, puis ajoute une phrase parasite sur Preferences coach. Impact: rupture de confiance en fin de conversation. Severite: red.

**Fix propose**
- Donner priorité au contexte conversationnel récent dans product_help et dans les récaps de fin de session, surtout après un tool exécuté dans les 3-5 tours précédents.
- Séparer clairement “carte générée dans le chat” vs “carte enregistrée dans le produit” et router vers tool skill si un artefact durable est attendu.
- Pour les préférences coach explicites, déclencher update_coach_preferences ou répondre que ce n'est pas enregistré; ne pas promettre implicitement.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- execution_breakdown: entrée correcte tours 1 et 4, mais sortie en normal_reply tours 2, 3 et 6 alors que la conversation reste sur le même skill. Ce n'est pas bloquant côté UX au début.
- emotional_repair: entrée et maintien corrects tours 7-8; side effects non déclenchés pendant le moment émotionnel.
- product_help: correct au tour 10 en intention, puis devient sticky/hijack tours 13-15 alors que les demandes relèvent de mémoire, préférence coach et recap.
- Trace incohérente: tour 5 route product_help pour une phrase anti-voix; tours 13-15 route product_help malgré contenu hors aide produit.

**Skills / Operations / Tools**
- create_one_shot_reminder: appelé au tour 9 avec direct_effect create_one_shot_reminder et executed_tools=["create_one_shot_reminder"].
- Effet durable vérifié avant cleanup: scheduled_checkins=1, status pending, scheduled_for=2026-05-21T06:30:00+00:00, instruction="reprendre ce dossier client par trois puces moches, pas plus". Cela correspond à jeudi 21 mai 2026 08:30 Europe/Paris.
- update_coach_preferences: attendu au tour 14 pour “préfère me poser une seule question courte”, mais aucun tool, pending_confirmation ou effet durable observé.
- Carte d'attaque: pas de tool ni direct_effect; sortie utilisable comme coaching, mais ambiguë si le produit attend des cartes persistées.

**Memory / Effets durables**
- Mémoire durable avant cleanup: memory_items=0, user_topic_memories=0. Le piège est retrouvé au tour 13 par contexte/historique, pas par persistance durable.
- user_chat_states.temp_memory contient un état momentum/conversation, mais pas de payload mémoire utile pour résumer le run; __memory_payload_state_v2.items=[] au moment de l'inspection.
- chat_messages=30 avant cleanup, donc le contexte conversationnel existait en DB; le tour 15 ne devait pas déclarer “je n’ai pas les étapes/résultats sous les yeux”.

**Problemes**
- Tour 10-12: product_help perd l'objet rappel récemment créé. Impact système: mauvais grounding entre tool output, historique et aide produit. Severite: red.
- Tour 13-15: dispatcher/owner reste product_help après sortie explicite de l'interface. Impact système: mauvais owner, réponses hors contrat, recap invalide. Severite: red.
- Tour 15: mention parasite “Preferences coach” sans pending confirmation exploitable. Impact système: fuite d'intention/tool skill dans une réponse finale. Severite: red.
- Tour 13 tentative 1: HTTP 401 causé par header QA mal saisi; retry validé avec même message. Impact système Sophia: nul; impact run: incident documenté. Severite: low.

**Fix propose**
- Ajouter un guard de sortie product_help quand le user dit “laisse tomber pour l’interface” ou demande un recap/mémoire/préférence.
- Injecter les tool outputs récents dans product_help, avec type d’objet, date, heure et emplacement produit si connu.
- Ajouter une assertion e2e: après create_one_shot_reminder puis question “où le voir/modifier”, Sophia ne doit pas redemander les slots déjà exécutés.
- Corriger le handoff update_coach_preferences: promesse seulement après pending/executed, ou formulation non durable (“je vais essayer dans cette conversation”).

## Verdict Global

- Verdict: red
- Raison principale: le système crée correctement le rappel, mais product_help prend le contrôle puis perd le contexte récent, ce qui casse l'aide produit, la préférence coach et le récap final.
- Follow-up prioritaire: corriger le routing/handoff de product_help et le grounding des tool outputs récents avant de relancer une variante N.2.
