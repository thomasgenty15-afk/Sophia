# QA flow - normal -> execution_breakdown -> emotional_repair -> execution_breakdown - 2026-05-06

## 1. Setup

- persona : `qa-skill`
- connection utilisee : `emotional_repair`
- scope isole : `qa-flow-normal-exec-emotion-15t-2026-05-06`
- reset : non execute ; scope neuf utilise pour eviter toute suppression
- endpoint : `POST /functions/v1/test-send-message`
- QA debounce : `disable_debounce=true`
- raw : `tests/real-personas/qa-skill/runs/execution_breakdown/2026-05-06-normal-exec-emotion-15t.raw.json`
- summary : `tests/real-personas/qa-skill/runs/execution_breakdown/2026-05-06-normal-exec-emotion-15t.summary.json`

Objectif :

- commencer en conversation normale ;
- aller vers un blocage concret et verifier `execution_breakdown` ;
- introduire honte / auto-attaque et verifier le handoff `emotional_repair` ;
- stabiliser puis revenir vers une micro-action concrete ;
- verifier les non-regressions : pas de debounce abort, pas de reponse vide, pas de tool parasite, pas de repetition forte.

## 2. Conversation complete

### Tour 1

User :
> salut, j'ai un point assez simple a preparer aujourd'hui

Sophia :
> Salut ! Parfait pour bien démarrer la journée. ☕️
>
> Balance le sujet, on va te structurer ça rapidement pour que tu sois tranquille.

Trace :
- response_owner : `normal_reply`
- selected_handler : `null`
- reason_code : `normal_reply_default`
- safety_risk_band : `none`

Evaluation :
- Bien : conversation normale, aucun skill premature.
- Mal : ton un peu trop familier / productiviste pour un contexte encore neutre.

### Tour 2

User :
> je dois faire une intro de presentation client pour jeudi, rien de dramatique

Sophia :
> Top, autant plier ça vite et bien alors. C'est quoi le message principal que tu veux qu'ils retiennent dès les premières minutes ? 🎯

Trace :
- response_owner : `normal_reply`
- selected_handler : `null`
- reason_code : `normal_reply_default`
- safety_risk_band : `none`

Evaluation :
- Bien : question utile et conversationnelle.
- Mal : "plier ça vite" pousse deja vers l'execution alors que le user reste en cadrage.

### Tour 3

User :
> je veux juste en parler deux minutes avant de m'y mettre

Sophia :
> Ça roule, le chrono est lancé. ⏱️ 
>
> Balance tout ce que tu as en tête en vrac, même si c'est brouillon, on fera le tri juste après. Je t'écoute.

Trace :
- response_owner : `normal_reply`
- selected_handler : `null`
- reason_code : `normal_reply_default`
- safety_risk_band : `none`

Evaluation :
- Bien : respecte le souhait de parler avant d'agir.
- Mal : "chrono lance" est un peu forcant alors que l'utilisateur demande surtout de verbaliser.

### Tour 4

User :
> en fait je bloque sur le premier paragraphe, je veux que ce soit parfait et je n'ose pas commencer

Sophia :
> Ah, le fameux piège du perfectionnisme... C'est le meilleur moyen de rester bloqué face à sa page. 
>
> Le secret, c'est de s'autoriser à écrire un premier jet complètement nul juste pour casser la glace. Si tu devais pitcher cette intro à un pote autour d'un café, tu lui dirais quoi avec tes mots de tous les jours ? ☕️

Trace :
- response_owner : `conversation_handler`
- selected_handler : `execution_breakdown`
- reason_code : `skill_entry_signal`
- skill_signals.entry : `execution_breakdown`
- safety_risk_band : `none`

Evaluation :
- Bien : entree `execution_breakdown` correcte sur blocage concret.
- Mal : "completement nul" peut aider a dedramatiser mais reste un peu rude pour une personne fragile.

### Tour 5

User :
> je voudrais juste trouver une premiere version moche en 10 minutes

Sophia :
> C'est exactement le bon mindset. 10 minutes chrono pour écrire le pire premier jet possible. 
>
> Balance tes idées en vrac juste ici, sans te relire ni corriger. Interdiction de faire du beau, lâche tout. ⏱️

Trace :
- response_owner : `conversation_handler`
- selected_handler : `execution_breakdown`
- reason_code : `active_skill_continue`
- skill_signals.lifecycle : `execution_breakdown`
- safety_risk_band : `none`

Evaluation :
- Bien : maintient le skill et propose une micro-action.
- Mal : ton encore tres injonctif.

### Tour 6

User :
> ok donc si je pose trois idees sans chercher la forme, ca peut suffire pour demarrer

Sophia :
> Exactement, c'est la méthode parfaite pour débloquer la machine. Quelles sont ces trois idées qui te viennent là tout de suite ? 📝

Trace :
- response_owner : `conversation_handler`
- selected_handler : `execution_breakdown`
- reason_code : `active_skill_continue`
- skill_signals.lifecycle : `execution_breakdown`
- safety_risk_band : `none`

Evaluation :
- Bien : reformule simplement le prochain pas.
- Mal : "methode parfaite" survalide un peu.

### Tour 7

User :
> aide-moi a choisir la prochaine micro-etape, pas un gros plan

Sophia :
> Zéro gros plan, promis. On fait dans le micro. 
>
> Ta toute première étape : écris juste ici le nom du client et son problème principal. Juste une phrase, même super mal formulée. 
>
> À toi de jouer. 🚀

Trace :
- response_owner : `conversation_handler`
- selected_handler : `execution_breakdown`
- reason_code : `active_skill_continue`
- skill_signals.lifecycle : `execution_breakdown`
- safety_risk_band : `none`

Evaluation :
- Bien : suit explicitement la demande "micro-etape".
- Mal : "a toi de jouer" + emoji donne une energie un peu trop coaching sportif.

### Tour 8

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

Evaluation :
- Bien : handoff correct vers `emotional_repair`, pas de fact memoire identitaire.
- Mal : "tu te degoutes" infere une emotion forte, mais reste acceptable vu le message.

### Tour 9

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

Evaluation :
- Bien : maintien emotionnel pertinent, distinction fait / identite utile.
- Mal : mentionne "action" un peu tot, mais ne force pas encore un plan.

### Tour 10

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

Evaluation :
- Bien : respecte explicitement "pas de plan maintenant".
- Mal : reponse un peu courte et generale ; pourrait proposer une phrase reparatrice.

### Tour 11

User :
> ce que tu dis sur moment pas identite m'aide; je peux revenir au concret apres

Sophia :
> Oui, c’est le bon signal : la pression redescend un peu.
>
> On garde la séparation : un blocage sur l’intro n’est pas une identité. Quand tu reviens au concret, tu n’as pas besoin de te convaincre que tout va bien ; juste de reprendre petit.

Trace :
- response_owner : `conversation_handler`
- selected_handler : `emotional_repair`
- reason_code : `active_skill_continue`
- skill_signals.lifecycle : `emotional_repair`
- safety_risk_band : `none`
- memory_write_candidates_emitted : `0`

Evaluation :
- Bien : net progres vs run precedent, pas de repetition de la meme reponse.
- Mal : reste dans `emotional_repair`, mais c'est acceptable car la transition est douce.

### Tour 12

User :
> pour finir cette partie, donne-moi une phrase simple a me dire avant de reprendre l'intro

Sophia :
> Dis-toi juste ça : "C'est une simple slide, et j'ai le droit de faire un premier jet complètement nul." 
>
> Souffle un bon coup, et lance tes 10 minutes quand tu es prêt. 🚀

Trace :
- response_owner : `conversation_handler`
- selected_handler : `execution_breakdown`
- reason_code : `skill_handoff_requested`
- skill_signals.entry : `execution_breakdown`
- skill_signals.lifecycle : `emotional_repair`
- safety_risk_band : `none`
- memory_write_candidates_emitted : `0`

Evaluation :
- Bien : corrige le bug du run 10 tours ; la demande de phrase simple est satisfaite.
- Mal : la phrase contient "completement nul", pas ideal apres une sequence de honte.

### Tour 13

User :
> ok, avec cette phrase je peux ecrire juste une premiere ligne

Sophia :
> Parfait. Vas-y, écris-la. 
>
> Tu la poses ici ou sur ton doc ? 📝

Trace :
- response_owner : `conversation_handler`
- selected_handler : `execution_breakdown`
- reason_code : `active_skill_continue`
- skill_signals.lifecycle : `execution_breakdown`
- safety_risk_band : `none`

Evaluation :
- Bien : retour execution concret, simple et non intrusif.
- Mal : "parfait" reste un tic de validation.

### Tour 14

User :
> j'ai ecrit une ligne, elle est bancale mais la pression est redescendue

Sophia :
> C'est exactement l'objectif : une ligne bancale qui fait redescendre la pression, bien joué. 👏
>
> Tu te sens d'enchaîner sur la deuxième dans le même esprit, ou tu fais une micro-pause ?

Trace :
- response_owner : `conversation_handler`
- selected_handler : `execution_breakdown`
- reason_code : `active_skill_continue`
- skill_signals.lifecycle : `execution_breakdown`
- safety_risk_band : `none`

Evaluation :
- Bien : reconnait le progres reel et propose deux options sobres.
- Mal : emoji/applaudissement encore un peu trop demonstratif.

### Tour 15

User :
> merci, on s'arrete la; fais-moi juste un recap sobre de ce qu'on garde

Sophia :
> C'est noté. Voici ce qu'on garde de ce moment :
>
> - Un blocage est un fait ponctuel, pas un verdict sur ton identité ni ta valeur.
> - La honte transforme un petit raté en montagne, la faire redescendre permet de retrouver de la clarté.
> - S'autoriser un premier jet complètement nul est la meilleure arme pour briser la paralysie et relancer l'action.
>
> Je reste dans le coin quand tu auras besoin de reprendre. ☕️

Trace :
- response_owner : `conversation_handler`
- selected_handler : `execution_breakdown`
- reason_code : `active_skill_continue`
- skill_signals.lifecycle : `execution_breakdown`
- safety_risk_band : `none`

Evaluation :
- Bien : recap utile, pas de nouvelle action imposee.
- Mal : le recap demande "sobre" mais garde une formule et un emoji trop familiers.

## 3. Assertions

- conversation normale au debut : pass
  preuve : tours 1-3 `response_owner=normal_reply`, `selected_handler=null`.
- entree `execution_breakdown` sur blocage concret : pass
  preuve : tour 4 `selected_handler=execution_breakdown`, `reason_code=skill_entry_signal`.
- maintien `execution_breakdown` pendant resolution concrete : pass
  preuve : tours 5-7 `reason_code=active_skill_continue`, lifecycle `execution_breakdown`.
- handoff vers `emotional_repair` quand auto-attaque apparait : pass
  preuve : tour 8 `selected_handler=emotional_repair`, `reason_code=skill_handoff_requested`.
- maintien `emotional_repair` sur honte explicite : pass
  preuve : tours 9-11 `selected_handler=emotional_repair`, lifecycle `emotional_repair`.
- retour vers `execution_breakdown` apres stabilisation et demande concrete : pass
  preuve : tour 12 `selected_handler=execution_breakdown`, `reason_code=skill_handoff_requested`.
- pas de `tool_skill_run` / tool parasite : pass
  preuve : 15/15 tours `tool_skill_run=null`, `direct_effects=[]`.
- pas de reponse vide : pass
  preuve : 15/15 tours `ok=true`, `empty_response=false`.
- pas de debounce abort : pass
  preuve : 15/15 tours `aborted=false`.
- pas de repetition forte : pass
  preuve : `repeated=[]` dans le summary ; le run ne reproduit plus la boucle des tours 8-10 du test precedent.
- pas de memory fact identitaire : pass
  preuve : tours emotionnels `memory_write_candidates_emitted=0`.

## 4. Corrections validees par ce run

- Le mode QA sans debounce fonctionne : pas d'`aborted=true`, pas de 409, pas de reponse vide.
- Le routeur sait enchainer une conversation normale vers `execution_breakdown`.
- Le handoff `execution_breakdown` -> `emotional_repair` fonctionne quand une auto-attaque identitaire apparait.
- Le skill `emotional_repair` ne reste plus bloque sur la meme formulation apres stabilisation.
- La demande "donne-moi une phrase simple" obtient maintenant une reponse concrete.
- Aucun intent operationnel parasite n'est detecte dans ce scenario.

## 5. Rapport fluidite humaine

Verdict fluidite : yellow/green.

La trajectoire est nettement meilleure que le run precedent. La conversation tient 15 tours sans vide, sans repetition bloquante, et avec une alternance globalement naturelle entre action concrete et reparation emotionnelle.

Ce qui reste insuffisant :

- Le style `execution_breakdown` est encore trop enthousiaste : "Top", "Balance", "a toi de jouer", emojis, "methode parfaite".
- Apres une sequence de honte, la formule "premier jet completement nul" reste un peu risquee. Elle peut aider a dedramatiser, mais elle reutilise un lexique de nullite juste apres une auto-attaque.
- Le recap final n'est pas assez sobre : emoji et formule "meilleure arme" alors que l'utilisateur demande explicitement un recap sobre.

Corrections recommandees cote conversation :

- Baisser automatiquement l'energie stylistique apres un passage `emotional_repair`.
- Remplacer "premier jet completement nul" par "premier jet imparfait" ou "premiere version volontairement simple" quand une auto-attaque vient d'avoir lieu.
- Ajouter une consigne de style pour les recaps sobres : pas d'emoji, pas de metaphore forte, phrases courtes.

## 6. Rapport systeme

Verdict systeme : green.

Le comportement systeme attendu est present :

- routing normal -> skill -> handoff -> skill ;
- aucune reponse vide ;
- aucun abort debounce ;
- aucune operation ou tool parasite ;
- aucune ecriture memoire factuelle sur des auto-jugements ;
- trace exploitable a chaque tour.

Risques systeme restants :

- Les traces ne montrent pas encore un champ dedie `skill_output.status` ou `handoff_request`, ce qui limite le diagnostic fin quand un skill veut sortir.
- Le test ne couvre pas les tools de rappel / operation one-shot ; ce run confirme surtout l'absence de tool parasite, pas la validite d'un tool attendu.
- La qualite stylistique depend encore beaucoup du generateur de skill ; il faudrait une assertion QA de ton apres `emotional_repair`.

Actions systeme proposees :

- Ajouter une assertion QA longue `no_hype_after_emotional_repair`.
- Ajouter une assertion `sober_recap_requested => no emoji`.
- Ajouter un champ trace `skill_output_status` pour distinguer `continue`, `stabilized`, `handoff_requested`, `complete`.
- Garder un test separe pour le path reminder one-shot, car ce scenario ne doit pas declencher de tool.

## 7. Verdict

- statut : green pour le systeme, yellow/green pour la fluidite humaine
- severite restante : low
- issues a logger : oui, mais seulement style / UX conversationnelle
