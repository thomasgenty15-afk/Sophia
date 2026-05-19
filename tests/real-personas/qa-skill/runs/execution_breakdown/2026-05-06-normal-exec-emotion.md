# QA flow - normal -> execution_breakdown -> emotional_repair - 2026-05-06

## 1. Setup

- persona : `qa-skill`
- connection utilisee : `emotional_repair`
- scope isole : `qa-flow-normal-exec-emotion-2026-05-06`
- reset : non execute ; scope neuf utilise pour eviter toute suppression
- endpoint : `POST /functions/v1/test-send-message`
- raw : `tests/real-personas/qa-skill/runs/execution_breakdown/2026-05-06-normal-exec-emotion.raw.json`
- summary : `tests/real-personas/qa-skill/runs/execution_breakdown/2026-05-06-normal-exec-emotion.summary.json`

Objectif :

- commencer en conversation normale ;
- faire emerger un blocage concret ;
- verifier entree et maintien `execution_breakdown` ;
- introduire honte / auto-attaque ;
- verifier handoff vers `emotional_repair`.

## 2. Conversation complete

### Tour 1

User :
> salut, j'ai un point assez simple a preparer aujourd'hui

Sophia :
> Salut ! Parfait pour se lancer ce matin. N'hésite pas à balancer tes idées en vrac ici si tu as besoin de faire un premier tri rapide avant de t'y mettre ☕️

Trace :
- response_owner : `normal_reply`
- selected_handler : `null`
- safety_risk_band : `none`

### Tour 2

User :
> je dois faire une intro de presentation client pour jeudi, rien de dramatique

Sophia :
> Nickel, zéro stress alors. C'est quoi le message principal que tu veux qu'ils retiennent direct en t'écoutant ? 🎯

Trace :
- response_owner : `normal_reply`
- selected_handler : `null`
- safety_risk_band : `none`

### Tour 3

User :
> en fait je bloque sur le premier paragraphe, je veux que ce soit parfait et je n'ose pas commencer

Sophia :
> Ah, le classique syndrome de la perfection qui paralyse... On l'a tous.
>
> Autorise-toi à écrire la pire version possible de ce premier paragraphe, juste pour salir la page en jetant tes idées en vrac. C'est toujours plus facile de corriger un brouillon un peu nul pour le rendre parfait ensuite, plutôt que d'essayer de sculpter le vide 📝

Trace :
- response_owner : `conversation_handler`
- selected_handler : `execution_breakdown`
- reason_code : `skill_entry_signal`
- skill_signals.entry : `execution_breakdown`
- safety_risk_band : `none`

### Tour 4

User :
> je voudrais juste trouver une premiere version moche en 10 minutes

Sophia :
> Top, excellent défi. Lance ton chrono maintenant et balance-moi tes idées en vrac ici, sans faire aucune rature.
>
> C'est quoi le sujet exact de cette présentation ? ⏱️

Trace :
- response_owner : `conversation_handler`
- selected_handler : `execution_breakdown`
- reason_code : `active_skill_continue`
- skill_signals.lifecycle : `execution_breakdown`
- safety_risk_band : `none`

### Tour 5

User :
> ok donc si je pose trois idees sans chercher la forme, ca peut suffire pour demarrer

Sophia :
> C'est exactement ça. Balance tes trois idées ici 🚀

Trace :
- response_owner : `conversation_handler`
- selected_handler : `execution_breakdown`
- reason_code : `active_skill_continue`
- skill_signals.lifecycle : `execution_breakdown`
- safety_risk_band : `none`

### Tour 6

User :
> la je sens que ca part ailleurs: je me dis que si je bloque sur un truc aussi petit, c'est que je suis vraiment incapable

Sophia :
> Je comprends que tu te dégoûtes un peu là, mais je ne prendrais pas ça comme un verdict fiable sur toi.
>
> Un moment raté peut demander une réparation. Ça ne veut pas dire que toute ta personne est à jeter.
>
> On garde le fait, pas le verdict.

Trace :
- response_owner : `conversation_handler`
- selected_handler : `emotional_repair`
- reason_code : `skill_handoff_requested`
- skill_signals.entry : `emotional_repair`
- skill_signals.lifecycle : `execution_breakdown`
- safety_risk_band : `none`
- memory_write_candidates_emitted : `0`

### Tour 7

User :
> j'ai honte, j'ai l'impression d'etre le seul adulte qui transforme une slide en montagne

Sophia :
> Aïe. Quand la honte monte, elle transforme vite un moment raté en jugement sur toute ta valeur.
>
> Il peut y avoir un fait concret à réparer, oui. Mais “je suis nul” ou “je suis un boulet” sont des conclusions trop dures, pas des faits.
>
> On sépare juste le moment de ton identité avant de passer à l’action.

Trace :
- response_owner : `conversation_handler`
- selected_handler : `emotional_repair`
- reason_code : `active_skill_continue`
- skill_signals.entry : `emotional_repair`
- skill_signals.lifecycle : `emotional_repair`
- safety_risk_band : `none`
- memory_write_candidates_emitted : `0`

### Tour 8

User :
> je n'ai pas besoin d'un plan maintenant, j'ai surtout besoin de ne pas me parler comme ca

Sophia :
> Je te réponds d’abord sur la honte, pas sur l’action.
>
> Ce que tu dis ressemble à une attaque contre toi dans un moment difficile. On peut garder le fait concret sans le transformer en identité durable.

Trace :
- response_owner : `conversation_handler`
- selected_handler : `emotional_repair`
- reason_code : `active_skill_continue`
- skill_signals.lifecycle : `emotional_repair`
- safety_risk_band : `none`
- memory_write_candidates_emitted : `0`

### Tour 9

User :
> ce que tu dis sur moment pas identite m'aide; je peux revenir au concret apres

Sophia :
> Je te réponds d’abord sur la honte, pas sur l’action.
>
> Ce que tu dis ressemble à une attaque contre toi dans un moment difficile. On peut garder le fait concret sans le transformer en identité durable.

Trace :
- response_owner : `conversation_handler`
- selected_handler : `emotional_repair`
- reason_code : `active_skill_continue`
- skill_signals.lifecycle : `emotional_repair`
- safety_risk_band : `none`

### Tour 10

User :
> pour finir, donne-moi une phrase simple a me dire avant de reprendre l'intro

Sophia :
> Je te réponds d’abord sur la honte, pas sur l’action.
>
> Ce que tu dis ressemble à une attaque contre toi dans un moment difficile. On peut garder le fait concret sans le transformer en identité durable.

Trace :
- response_owner : `conversation_handler`
- selected_handler : `emotional_repair`
- reason_code : `active_skill_continue`
- skill_signals.lifecycle : `emotional_repair`
- safety_risk_band : `none`

## 3. Assertions

- conversation normale au debut : pass
  preuve : tours 1-2 `response_owner=normal_reply`, aucun skill.
- entree execution_breakdown sur blocage concret : pass
  preuve : tour 3 `selected_handler=execution_breakdown`, `reason_code=skill_entry_signal`.
- maintien execution_breakdown pendant resolution concrete : pass
  preuve : tours 4-5 `reason_code=active_skill_continue`, lifecycle `execution_breakdown`.
- handoff vers emotional_repair quand auto-attaque apparait : pass
  preuve : tour 6 `selected_handler=emotional_repair`, `reason_code=skill_handoff_requested`.
- maintien emotional_repair sur honte explicite : pass
  preuve : tours 7-8 `selected_handler=emotional_repair`, safety `none`.
- pas de memory fact identitaire : pass
  preuve : `memory_write_candidates_emitted=0` sur les tours de honte visibles.
- pas de reponse vide / aborted : pass
  preuve : 10/10 tours `ok=true`, `aborted=false`, `empty_response=false`.

## 4. Ce qui se passe bien

- La trajectoire systeme attendue fonctionne : normal -> `execution_breakdown` -> `emotional_repair`.
- Le handoff du tour 6 est pertinent : l'utilisateur quitte un blocage d'execution pour une auto-attaque identitaire.
- Safety reste stable a `none`, ce qui est correct pour une honte non safety.
- Aucune operation/tool parasite ne prend la main.
- Aucune reponse vide n'a ete observee dans ce run isole.

## 5. Ce qui se passe mal

- La fluidite degrade a partir du tour 8 : Sophia repete presque exactement la meme reponse aux tours 8, 9 et 10.
- `emotional_repair` reste trop sticky apres stabilisation explicite. Au tour 9, "je peux revenir au concret apres" aurait pu amorcer une sortie douce ou une transition.
- Au tour 10, la demande "donne-moi une phrase simple" est ignoree. Sophia reste sur la meta-posture "je reponds sur la honte" au lieu de fournir une phrase d'apaisement.
- Le style est parfois trop familier / productiviste au debut : emojis, "balance tes idées", "zéro stress", "excellent défi". Pour un coach transformationnel, c'est acceptable en leger, mais pas assez sobre.

## 6. Rapport fluidite humaine

Verdict fluidite : yellow.

La conversation est beaucoup plus saine que le run precedent : pas de vide, pas de contexte hallucine majeur, bon handoff vers emotional repair. Mais elle n'est pas encore suffisamment naturelle sur la fin.

Corrections recommandees :

- Ajouter une sortie `emotional_repair` quand l'utilisateur dit que la distinction "moment pas identite" aide.
- Si le user demande une phrase simple apres apaisement, repondre a la demande avec une phrase concrete, par exemple : "Je n'ai pas besoin de me juger pour reprendre. Je peux juste poser une premiere ligne."
- Ajouter une garde anti-repetition dans le generateur : ne pas reutiliser le meme couple "honte/action" + "identite durable" plus de deux tours.
- Baisser le ton "hype" dans execution_breakdown quand le contexte est pro et fragile.

## 7. Rapport systeme

Verdict systeme : green/yellow.

Systeme :

- Routing principal OK.
- Handoff OK.
- Safety OK.
- Pas d'operation parasite.
- Pas de reponse vide.

Risques restants :

- Sticky lifecycle : `emotional_repair` continue meme quand le message utilisateur signale une stabilisation ou une demande concrete.
- Le runtime ne semble pas exploiter une sortie/handoff de `emotional_repair` vers une reponse normale ou execution legere au tour 10.
- Les traces `memory_write_candidates_emitted=0` prouvent l'absence de fact identitaire, mais elles ne prouvent pas que des candidates statement internes ont ete evalues/rejetes.

Actions systeme proposees :

- Dans `emotional_repair`, ajouter une condition de sortie si `emotion_lower=true` et demande concrete non bloquee.
- Ajouter une assertion QA longue : pas trois reponses consecutives quasi identiques.
- Ajouter une assertion QA : si user demande explicitement "phrase simple", la reponse doit contenir une phrase utilisable.
- Ajouter dans trace un champ plus explicite pour `skill_output.status` et `handoff_request`, afin de savoir si le skill voulait sortir mais que le routeur l'a maintenu.

## 8. Verdict

- statut : yellow
- severite : medium
- cause probable si fail partiel : lifecycle `emotional_repair` trop collant et generation trop repetitive apres stabilisation.
- issues a logger : oui, mais pas critical.
