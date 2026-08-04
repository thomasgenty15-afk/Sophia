# QA Run Report - normal-conversation-25t-20260613-r6-flow-pressure

## 1. Contexte Du Test

- Date: 2026-06-13.
- Run: `normal-conversation-25t-20260613-r6-flow-pressure`.
- Persona: utilisateur QA temporaire local `qa-normal-normal-conversation-25t-20260613-r6-flow-pressure-1781365026213@example.com`, supprimé en fin de run.
- Objectif: tester si Sophia garde une conversation normale légère sur 25 tours, sans forcing de flows/outils, tout en entrant dans un flow quand le user le demande explicitement.
- Trajectoire: conversation simple -> honte/évitement/grignotage -> faux positif reminder -> lecture simple -> rappel explicite -> status explicite -> sortie status -> demande explicite carte attaque -> abandon carte -> retour normal.
- Surfaces visées: normal_reply, emotional_repair, demotivation_repair, one_shot_reminder, status_recap, prepare_attack_card, active-flow exit, direct effects.
- Cadre IA réel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, `disable_debounce=true`, exécution hors sandbox, aucun renderer déterministe, aucun fallback direct.
- Artefacts bruts: `tmp/qa-normal-conversation/normal-conversation-25t-20260613-r6-flow-pressure/state.json`.
- Cleanup: ciblé par user QA. `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users` nettoyés. `user_memories` a renvoyé `404`, déjà observé sur les runs précédents.
- Validité QA: valide.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'ai envie de discuter simplement, sans qu'on parte dans un plan ou un outil. Je tourne un peu en rond aujourd'hui.

**Sophia**
> Je te suis. Aujourd’hui, ça ressemble à une journée où tu “tournes” parce que quelque chose cherche sa sortie, mais n’arrive pas encore à se poser. Et c’est ok que ça reste simple pour l’instant. [...] je t’aide à mettre des mots dessus sans te transformer ça en plan.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: `none`
- direct_effects: []
- executed_tools: []

### Tour 2

**Verdict du tour:** green

**User**
> Je crois que c'est surtout le dossier administratif. Il n'est pas énorme, mais dès que j'y pense j'ai envie d'aller grignoter ou de regarder autre chose.

**Sophia**
> Je vois le truc : ce “dossier administratif pas énorme” n’est pas tant la taille du truc... c’est plutôt le moment où ton cerveau le touche et que ça déclenche une envie de fuite (grignoter / checker autre chose). [...] Quand tu dis “ça m’a envie d’aller grignoter”, c’est plutôt : agacement, inquiétude, ou ennui sec ?

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- skill_entry_ids: []
- direct_effects: []

### Tour 3

**Verdict du tour:** green

**User**
> C'est plutôt l'ennui sec. Et aussi la petite honte de me dire que je repousse un truc bête depuis trois jours.

**Sophia**
> Je te comprends. L’ennui “sec”, c’est souvent le cerveau qui cherche une stimulation facile... et la honte, elle, arrive comme un second couvercle [...] Tu veux juste que je t’aide à mettre des mots sur la boucle [...] ou tu veux qu’on regarde comment la dénouer concrètement ?

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []

### Tour 4

**Verdict du tour:** green

**User**
> Pour l'instant juste mettre des mots. Je n'ai pas envie de transformer ça en méthode tout de suite.

**Sophia**
> Je te suis. Là, tu as surtout besoin que ça prenne une forme, pas d’être “optimisé”. [...] On peut rester sur les mots juste un peu [...]

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-TEST-01 / BF-ROUTE-01 — trace incohérente autour d'une opportunité bloquée

**User**
> Honte en premier. Réponds-moi juste franchement: tu crois que je dramatise ou que c'est vraiment un signal à prendre au sérieux ?

**Sophia**
> La honte est un signal puissant, pas une dramatisation. Si tu le ressens, c'est que quelque chose d'important se joue pour toi. On prend un moment pour apaiser ça ensemble ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `normal_reply_fit_dominates`
- safety: `low`
- skill_entry_ids: [`emotional_repair`]
- direct_effects: []

**Analyse si yellow/red**
- Symptôme: visible acceptable mais système étrange: owner `tool_skill` alors que la raison dit que normal_reply domine.
- Source amont probable: admission/trace de `flow_opportunity_verification`.
- Owner runtime: router / intervention policy / trace mapping.
- Meilleure correction: si `normal_reply_fit_dominates`, l'owner final et le handler ne doivent pas rester marqués comme `tool_skill` / `flow_opportunity_verification`, sauf si un vrai visible tool flow a été admis.

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 — mauvais owner / direct effect faux positif

**User**
> Pas forcément apaiser ensemble, juste parler deux minutes. J'ai surtout besoin que tu restes simple.

**Sophia**
> Il me manque le moment exact pour programmer ce rappel.
>
> Ce n'est ni une catastrophe, ni un signal alarmant sur qui tu es. [...]

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `emotional_repair`
- route_reason: `direct_effect_lane_message_intake`
- direct_effects: [`create_one_shot_reminder`]
- direct_effects_to_run: [`create_one_shot_reminder`]
- tool_execution: `blocked`
- executed_tools: []

**Analyse si yellow/red**
- Symptôme: Sophia parle d'un rappel alors que le user n'a jamais demandé de rappel.
- Source amont probable: direct-effect lane / one-shot reminder intake trop sensible à "deux minutes".
- Owner runtime: direct effect arbitrator + one_shot_reminder intake.
- Meilleure correction: l'effet `create_one_shot_reminder` doit exiger une intention explicite de rappel/notification, ou une demande temporelle attachée à une action de rappel. Une durée conversationnelle "parler deux minutes" doit être classée normal talk.
- Pourquoi ce n'est pas un patch local: il faut corriger l'admission structurée du direct effect, pas filtrer une phrase exacte.

### Tour 7

**Verdict du tour:** green

**User**
> Je n'ai pas demandé de rappel. Justement c'est ce genre de bascule qui me sort de la discussion.

**Sophia**
> Tu as raison, restons-en là. Je t'écoute simplement, sans outils ni méthodes. Je suis là avec toi pour ce moment.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- direct_effects: []

### Tour 8

**Verdict du tour:** green

**User**
> Ok. Autre sujet: j'ai relu une page d'un roman hier et ça m'a fait du bien. C'était calme.

**Sophia**
> Oh, j’aime beaucoup que tu aies retrouvé ce calme grâce au roman. [...] Si tu veux, tu peux juste me dire ce qui t’a le plus apaisé [...]

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`

### Tour 9

**Verdict du tour:** green

**User**
> Oui, surtout le fait de ne pas réfléchir. Ça m'a rappelé que je peux être autre chose qu'un tableau de tâches.

**Sophia**
> Oui... je vois exactement le genre de permission que ça te donne. [...] Tu n’es pas seulement la gestion, l’anticipation et la performance [...]

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`

### Tour 10

**Verdict du tour:** green

**User**
> Une évasion douce. Et là je ne veux pas forcément en faire une habitude suivie, juste reconnaître que ça existe.

**Sophia**
> Oui. Une évasion douce, c’est exactement ça [...] Pas besoin d’en faire une habitude au sens strict [...]

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- direct_effects: []

### Tour 11

**Verdict du tour:** green

**User**
> Oui, une phrase ça me va.

**Sophia**
> Une évasion douce, c’est un endroit où ton cerveau ne gère plus, et où tu redeviens juste toi.

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`

### Tour 12

**Verdict du tour:** green

**User**
> Là par contre, crée-moi un rappel pour demain à 10h: relire deux pages du roman.

**Sophia**
> C'est programmé pour dimanche 14 juin à 10:00: je te rappellerai de relire deux pages du roman.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `central_arbitrator_one_shot_reminder_structured_effect`
- direct_effects: [`create_one_shot_reminder`]
- executed_tools: [`create_one_shot_reminder`]
- tool_execution: `success`
- durable_effect: `scheduled_checkins.id=5c8a3fd1-684d-4caf-bfd8-352a3e62b712`, `scheduled_for=2026-06-14T08:00:00+00:00`

### Tour 13

**Verdict du tour:** green

**User**
> Merci. Et après ce rappel, je veux qu'on revienne juste à la discussion, pas à un suivi lecture.

**Sophia**
> Avec plaisir. Oui, après ce rappel, on revient simplement à la discussion et on ne bascule pas en suivi lecture. [...] ton rappel est bien pour dimanche 14 juin à 10:00 [...]

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- direct_effects: []

### Tour 14

**Verdict du tour:** green

**User**
> Du coup, qu'est-ce qui a vraiment été créé pendant notre échange ? Réponds factuellement.

**Sophia**
> Pendant notre échange, j'ai uniquement programmé ton rappel pour demain à 10h00 : « relire deux pages du roman ». Aucune carte ni potion n'a été créée.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: `skill_entry_signal`
- skill_entry_ids: [`status_recap`]

### Tour 15

**Verdict du tour:** green

**User**
> Ok merci. Maintenant réponds juste comme une personne: tu trouves que c'est plutôt sain que je protège un moment de lecture ?

**Sophia**
> Oui, franchement : je trouve ça plutôt sain. [...] Te donner un moment de lecture, sans performance ni productivité [...]

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`

### Tour 16

**Verdict du tour:** green

**User**
> Et le dossier administratif, je sens que demain je risque encore de le repousser. Mais je ne te demande pas de carte, je veux juste comprendre le mécanisme.

**Sophia**
> Ce que tu décris ressemble à un cycle d'évitement. [...] Est-ce que c'est plutôt la peur de mal faire ou le côté répétitif du dossier qui te pèse le plus ?

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- skill_entry_ids: [`demotivation_repair`]
- direct_effects: []

### Tour 17

**Verdict du tour:** green

**User**
> Le répétitif, clairement. Mais changeons deux secondes: tu peux me dire si notre échange est resté assez léger jusque-là ?

**Sophia**
> Oui : jusque-là, notre échange est resté assez léger. [...] Et en même temps, je te sens arriver sur un point important [...]

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`

### Tour 18

**Verdict du tour:** green

**User**
> Ok, là je le demande explicitement: aide-moi à préparer une carte d'attaque courte pour ce dossier administratif.

**Sophia**
> On se concentre bien sur ton dossier administratif pour surmonter ce côté répétitif ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- tool_skill_intents: [`prepare_attack_card`]
- tool_execution: `blocked`

### Tour 19

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-03 — contrainte explicite perdue

**User**
> Oui. Le piège c'est: 'c'est répétitif donc je le ferai plus tard'. Je veux une carte courte, pas trois questions.

**Sophia**
> Pour ton dossier administratif, je te suggère le Mantra de force, c'est l'option la plus rapide. Ça te convient ou tu préfères Le texte magique ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`

**Analyse si yellow/red**
- Symptôme: Sophia continue un intake de technique alors que le user demande explicitement une carte courte et donne cible + piège.
- Source amont probable: prepare_attack_card local dispatcher / reducer ne dispose pas d'un mode compact ou ne priorise pas la contrainte "pas trois questions".
- Owner runtime: `prepare_attack_card`.
- Correction recommandée: quand `short_card/compact_intake` est fortement demandé et que cible + piège sont disponibles, choisir une technique par défaut avec justification courte ou produire une version brouillon validable, au lieu de multiplier les slots.

### Tour 20

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-01 — slot fourni mais redemandé

**User**
> Prends l'option la plus rapide.

**Sophia**
> C'est parti pour le Mantra de force. Par rapport à quelle action ou quel effort spécifique tu as besoin de devenir plus solide ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`

**Analyse si yellow/red**
- Symptôme: redemande l'action alors que "dossier administratif" est déjà la cible stabilisée depuis plusieurs tours.
- Source amont probable: slot filler local ne réutilise pas correctement `target_state.locked/proposed`.
- Owner runtime: `prepare_attack_card`.

### Tour 21

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-03 — contrainte user de non-redondance pas assez respectée

**User**
> Le dossier administratif, justement. Tu peux éviter de me refaire préciser ce que j'ai déjà dit ?

**Sophia**
> Pour ton dossier administratif, pourquoi est-ce si important pour toi d'arrêter de reculer là-dessus ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`

**Analyse si yellow/red**
- Symptôme: Sophia reconnaît la cible mais continue à poser un slot supplémentaire.
- Impact: le user doit lutter contre le flow pour obtenir une carte courte.
- Correction recommandée: le flow doit traiter "évite de me refaire préciser" comme contrainte d'intake, pas seulement comme contenu conversationnel.

### Tour 22

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-INTAKE-03 — contrainte explicite perdue

**User**
> Parce que ça me libérerait mentalement. Mais là ça devient trop laborieux, donne-moi juste la carte courte avec ce que tu as.

**Sophia**
> Je comprends, on va à l'essentiel : pour ton Mantra de force, tu préfères un ton calme, noble ou percutant ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`

**Analyse si yellow/red**
- Symptôme: contradiction visible: Sophia dit "on va à l'essentiel" puis demande encore un choix de ton.
- Source amont probable: prepare_attack_card rend certains champs obligatoires même quand la contrainte user demande une sortie compacte.
- Owner runtime: `prepare_attack_card`.
- Correction recommandée: ajouter une policy compacte dans le local flow: si le user demande explicitement "avec ce que tu as", générer un brouillon minimal ou une validation finale avec valeurs par défaut, en indiquant ce qui reste ajustable.

### Tour 23

**Verdict du tour:** green

**User**
> Stop pour la carte, laisse tomber. Je préfère revenir à une discussion normale.

**Sophia**
> Ok, je laisse tomber la carte. Revenir à une discussion normale, c’est un vrai choix. [...] On peut rester sur le mécanisme, sans plan d’action [...]

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- direct_effects: []

### Tour 24

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PREF-01 — contrainte de légèreté/longueur partiellement ignorée

**User**
> Je préfère parler de demain sans faire de stratégie. J'aimerais juste me sentir moins en dette avec moi-même.

**Sophia**
> Je te comprends. Quand tu dis “sans stratégie” [...] [réponse longue avec distinction en deux dettes, puis question finale].

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`

**Analyse si yellow/red**
- Symptôme: pas de flow, mais réponse longue et structurante malgré "sans stratégie".
- Impact: lourdeur conversationnelle légère, surtout après une friction flow.
- Correction recommandée: normal_reply devrait pondérer la longueur et réduire les questions quand le user vient explicitement de demander une discussion normale après un flow abandonné.

### Tour 25

**Verdict du tour:** green

**User**
> Je me reproche de toujours recommencer la même boucle. Termine juste par une phrase courte, pas plus.

**Sophia**
> Je te vois te juger pour une boucle—et juste le fait de la nommer, ça casse déjà le cercle.

**Trace courte**
- response_owner: `normal_reply`
- route_reason: `normal_reply_default`
- safety: `none`

## 3. Analyse De Fluidité Humaine

**Verdict: red**

**Ce qui marche**
- La conversation simple est bien protégée au début: T1-T4 restent en `normal_reply` malgré grignotage, honte, évitement et demande "pas de méthode".
- Le signal explicite "pas de carte" est respecté à T16: pas de carte proposée.
- Le rappel explicite de T12 fonctionne bien et la suite T13 revient en normal.
- `status_recap` sort proprement: T14 status explicite, T15 retour à un avis humain normal.
- Après abandon explicite de la carte, T23 revient en `normal_reply`.
- Quand le user demande une phrase courte, T11 et T25 respectent bien la contrainte.

**Problèmes**
- T6: Sophia invente un besoin de rappel alors que le user dit seulement "parler deux minutes". Impact fort: c'est exactement le genre de bascule qui rend la conversation lourde. Sévérité red.
- T19-T22: `prepare_attack_card` devient laborieux. Le user demande "carte courte", "pas trois questions", "avec ce que tu as"; Sophia continue à poser des slots. Sévérité red.
- T5: trace système incohérente et visible légèrement orienté repair ("apaiser ça ensemble") alors que le user demande juste une réponse directe. Sévérité yellow.
- T24: normal_reply reste sans outil mais répond trop long après "sans stratégie". Sévérité yellow faible.

**Fix proposé**
- Source amont 1: direct-effect arbitration / one_shot_reminder intake.
- Correction recommandée 1: un `create_one_shot_reminder` ne doit jamais partir d'une durée conversationnelle sans intention explicite de rappel/notification. Ajouter un invariant anti-faux-positif: "parler deux minutes", "reste deux minutes", "attends cinq minutes" sans action de rappel => normal_reply.
- Source amont 2: `prepare_attack_card` local dispatcher/reducer.
- Correction recommandée 2: ajouter une voie `compact_intake` ou `draft_with_defaults` quand le user demande explicitement une carte courte et fournit déjà cible + piège + raison. Cette voie ne doit pas créer en DB; elle doit produire un brouillon court ou une validation courte.
- Source amont 3: normal_reply visible prompt.
- Correction recommandée 3: après abandon explicite d'un flow, réduire la longueur par défaut et éviter de relancer une question cadrante sauf besoin clair.
- Tests d'invariant attendus:
  - "Juste parler deux minutes" ne crée pas de direct_effect reminder.
  - "Je ne demande pas de carte" bloque toute opportunité carte.
  - "Aide-moi explicitement à préparer une carte" démarre bien `prepare_attack_card`.
  - "Carte courte, pas trois questions" + cible + piège produit un brouillon court ou une validation courte, pas trois slots.
  - "Stop pour la carte" sort du flow au tour suivant.

## 4. Analyse Système

**Verdict: red**

**Routage**
- T1-T4, T8-T11, T13, T15, T17, T23-T25: `normal_reply` fonctionne correctement.
- T12: demande explicite de rappel route correctement vers `create_one_shot_reminder`.
- T14: status explicite route correctement vers `status_recap`.
- T15: sortie de `status_recap` vers normal_reply réussie.
- T16: `demotivation_repair` est admis, mais il ne colle pas à T17; comportement acceptable.
- T18: demande explicite de carte attaque route correctement vers `prepare_attack_card`.
- T6: direct-effect lane admet `create_one_shot_reminder` sans demande de rappel; c'est le bug système le plus grave du run.
- T5: trace incohérente: `response_owner=tool_skill`, handler `flow_opportunity_verification`, mais `route_reason=normal_reply_fit_dominates`.

**Skills / Operations / Tools**
- `one_shot_reminder`: succès propre à T12, confirmation bien formulée, DB correcte (`scheduled_for=2026-06-14T08:00:00+00:00`, soit 10:00 Europe/Paris).
- `one_shot_reminder`: faux positif bloqué à T6; pas d'effet durable, mais réponse visible polluée.
- `status_recap`: bon T14, factuel et complet.
- `prepare_attack_card`: entrée explicite OK, sortie explicite OK, mais intake trop rigide T19-T22.

**Effets durables**
- Effet durable attendu: un rappel ponctuel créé à T12.
- Effets durables indésirables: aucun commit observé à T6 malgré faux direct_effect; tool_execution `blocked`.
- Cleanup: rappel et user QA supprimés après le run.

**Conclusion système**
- L'économie d'intervention globale est nettement meilleure qu'au début des runs précédents: les opportunities implicites de carte ne capturent plus la conversation normale.
- Il reste deux sources de lourdeur: faux positif direct-effect reminder et rigidité interne de `prepare_attack_card`.
- Verdict global: red pour l'objectif spécifique "ne pas faire trop de forcing / ne pas rendre la conversation lourde", même si la majorité des tours conversationnels sont verts.

## Verdict Global

**Red.**

Sophia est beaucoup moins intrusive sur les opportunités implicites de flow: pas de carte non demandée sur grignotage/évitement, status sort correctement, rappel explicite fonctionne, et les active repairs ne collent pas trop. Mais T6 montre encore un faux forcing d'outil très visible, et T19-T22 montrent qu'un flow explicitement demandé peut devenir trop laborieux au point que le user abandonne.
