# QA flow - normal -> execution_breakdown -> emotional_repair + reminder tool - 2026-05-06

## 1. Setup

- persona : `qa-skill`
- connection utilisee : `emotional_repair`
- reset DB : non
- reset persona : non ; scopes isoles
- endpoint : `POST /functions/v1/test-send-message`
- QA debounce : `disable_debounce=true`
- runner : `tests/real-personas/qa-skill/runs/execution_breakdown/run_normal_exec_emotion_tool_15t_2026_05_06.mjs`

Runs principaux :

- r4 complet : `qa-flow-normal-exec-emotion-tool-15t-2026-05-06-r4`
- r4 raw : `tests/real-personas/qa-skill/runs/execution_breakdown/2026-05-06-normal-exec-emotion-tool-15t-r4.raw.json`
- r4 summary : `tests/real-personas/qa-skill/runs/execution_breakdown/2026-05-06-normal-exec-emotion-tool-15t-r4.summary.json`
- r6 relatif : `qa-flow-normal-exec-emotion-tool-15t-2026-05-06-r6`
- r6 summary : `tests/real-personas/qa-skill/runs/execution_breakdown/2026-05-06-normal-exec-emotion-tool-15t-r6.summary.json`

Objectif :

- verifier une conversation longue normale -> `execution_breakdown` -> `emotional_repair` ;
- inserer un vrai tool `create_one_shot_reminder` dans la conversation ;
- verifier que le tool n'ecrase pas toute la conversation ;
- verifier les non-regressions : no empty response, no debounce abort, trace presente, pas de memory fact identitaire.

## 2. Corrections appliquees avant / pendant le run

- `companion.ts` : ajout d'un fast-path pour confirmer un rappel ponctuel standalone sans repasser par le LLM apres succes outil.
- `run.ts` : les guardrails `emotional_repair` / `execution_breakdown` ne remplacent plus la reponse quand le message est un rappel ponctuel explicite.
- `run.ts` : contexte work elargi (`presentation`, `client`, `slide`, `intro`, `paragraphe`) pour eviter les handoffs/phrases relationnelles hors contexte.
- `run.ts` : recap sobre deterministe et reponse pression-redescendue sans emoji.
- `one_shot_reminder_tool.ts` : parse strict / hard-path pour les rappels absolus simples avant fallback IA.
- `one_shot_reminder_tool_test.ts` : ajout d'un test heure d'ete Paris pour `rappelle-moi demain a 18h...`.

Checks :

- `deno check` : pass
- `deno test one_shot_reminder_tool_test.ts` : 9 pass
- suite dispatcher/router/effect gate precedente : 36 pass

## 3. Conversation complete - run r4

### Tour 1

User :
> salut, j'ai un point assez simple a preparer aujourd'hui

Sophia :
> Ok nickel 😄 Dis-moi juste: c’est quoi le point, et tu veux le préparer pour quand (dans la journée, cette semaine, etc.) ?

Trace : `response_owner=normal_reply`, `selected_handler=null`, `risk_band=none`

Evaluation : normal OK ; ton encore trop familier.

### Tour 2

User :
> je dois faire une intro de presentation client pour jeudi, rien de dramatique

Sophia :
> Ok nickel 😄 Tu peux partir sur une intro courte en 3 blocs : qui tu es, le contexte (pourquoi tu interviens), et ce que le client va gagner à t’écouter.

Trace : `response_owner=normal_reply`, `selected_handler=null`, `risk_band=none`

Evaluation : question utile ; encore trop productiviste.

### Tour 3

User :
> je veux juste en parler deux minutes avant de m'y mettre

Sophia :
> OK, prends 2 minutes. 😄 Fais simple: tu poses le cadre de l’intro en 3 bouts, et après tu écris sans chercher beau.

Trace : `response_owner=normal_reply`, `selected_handler=null`, `risk_band=none`

Evaluation : respecte partiellement "en parler" ; pousse encore vers action.

### Tour 4

User :
> en fait je bloque sur le premier paragraphe, je veux que ce soit parfait et je n'ose pas commencer

Sophia :
> Ah je vois le piège 😄 Tu veux que le premier paragraphe soit “parfait”, du coup ton cerveau ne te laisse pas écrire le premier jet. On va viser une version simple et imparfaite.

Trace : `selected_handler=execution_breakdown`, `reason_code=skill_entry_signal`

Evaluation : entree `execution_breakdown` correcte ; style encore trop emoji.

### Tour 5

User :
> je voudrais juste trouver une premiere version moche en 10 minutes

Sophia :
> Parfait. On vise “mochissime mais envoyé” 😄 Set timer 10 minutes, et tu écris ton premier paragraphe sans filtrer.

Trace : `selected_handler=execution_breakdown`, `reason_code=active_skill_continue`

Evaluation : skill maintenu ; "mochissime" trop familier apres fragilite.

### Tour 6

User :
> ok donc si je pose trois idees sans chercher la forme, ca peut suffire pour demarrer

Sophia :
> Oui, carrément. Pose 3 idées brutes, sans chercher “la belle formulation” : c’est souvent le meilleur moyen de débloquer.

Trace : `selected_handler=execution_breakdown`, `reason_code=active_skill_continue`

Evaluation : bon micro-cadrage.

### Tour 7

User :
> aide-moi a choisir la prochaine micro-etape, pas un gros plan

Sophia :
> Yes, vas-y : on veut une micro-étape qui enlève le blocage, pas qui crée un chef-d’œuvre 😄 Choisis juste une première idée à écrire.

Trace : `selected_handler=execution_breakdown`, `reason_code=active_skill_continue`

Evaluation : respecte la micro-etape ; ton encore trop hype.

### Tour 8

User :
> la je sens que ca part ailleurs: je me dis que si je bloque sur un truc aussi petit, c'est que je suis vraiment incapable

Sophia :
> Je comprends que tu te dégoûtes un peu là, mais je ne prendrais pas ça comme un verdict fiable sur toi.
>
> Un moment raté peut demander une réparation. Ça ne veut pas dire que toute ta personne est à jeter.
>
> On garde le fait, pas le verdict.

Trace : `selected_handler=emotional_repair`, `reason_code=skill_handoff_requested`, `memory_write_candidates_emitted=0`

Evaluation : handoff correct, pas de fact identitaire.

### Tour 9

User :
> j'ai honte, j'ai l'impression d'etre le seul adulte qui transforme une slide en montagne

Sophia :
> Aïe. Quand la honte monte, elle transforme vite un moment raté en jugement sur toute ta valeur.
>
> Il peut y avoir un fait concret à réparer, oui. Mais “je suis nul” ou “je suis un boulet” sont des conclusions trop dures, pas des faits.
>
> On sépare juste le moment de ton identité avant de passer à l’action.

Trace : `selected_handler=emotional_repair`, `reason_code=active_skill_continue`, `memory_write_candidates_emitted=0`

Evaluation : bonne reparation emotionnelle ; formulation stable.

### Tour 10

User :
> je n'ai pas besoin d'un plan maintenant, j'ai surtout besoin de ne pas me parler comme ca

Sophia :
> Je te réponds d’abord sur la honte, pas sur l’action.
>
> Ce que tu dis ressemble à une attaque contre toi dans un moment difficile. On peut garder le fait concret sans le transformer en identité durable.

Trace : `selected_handler=emotional_repair`, `reason_code=active_skill_continue`

Evaluation : respecte "pas de plan" ; un peu generique.

### Tour 11

User :
> ce que tu dis sur moment pas identite m'aide; donne-moi une phrase simple a me dire avant de reprendre l'intro

Sophia :
> Ok. La phrase simple à te dire avant de reprendre l’intro, c’est : “Là, c’est un moment difficile, pas une preuve que je suis incapable.”

Trace : `selected_handler=execution_breakdown`, `reason_code=skill_handoff_requested`

Evaluation : retour concret OK ; phrase utile.

### Tour 12

User :
> ok, avec cette phrase je peux ecrire juste une premiere ligne

Sophia :
> Parfait 👍 Une seule mission là, maintenant : poser ta 1ère ligne, même moche.

Trace : `selected_handler=execution_breakdown`, `reason_code=active_skill_continue`

Evaluation : action concrete OK ; style encore trop demonstratif.

### Tour 13 - tool

User :
> rappelle-moi demain a 18h de reprendre l'intro pendant 20 minutes

Sophia :
> C’est programmé pour jeudi 07 mai à 21:00 : reprendre l'intro pendant 20 minutes.

Trace :
- `selected_handler=execution_breakdown`
- `direct_effects[0].effect_type=create_one_shot_reminder`
- `response_tool_execution=success`
- `response_executed_tools=["create_one_shot_reminder"]`
- `direct_effects=[{tool_id:create_one_shot_reminder,outcome:success}]`

Evaluation :
- Bien : le tool s'execute dans la conversation longue sans 502 sur r4.
- Mal : heure incorrecte. Le user demande 18h Paris, la reponse annonce 21h. C'est un bug systeme critique pour les rappels absolus.

### Tour 14

User :
> j'ai ecrit une ligne, elle est bancale mais la pression est redescendue

Sophia :
> C’est suffisant pour maintenant : une ligne imparfaite, et la pression qui baisse.
>
> Tu peux soit poser une deuxième ligne dans le même esprit, soit faire une pause courte. Les deux gardent le mouvement sans relancer le jugement.

Trace : `selected_handler=execution_breakdown`, `reason_code=active_skill_continue`

Evaluation : net progres, sobre, sans emoji.

### Tour 15

User :
> merci, on s'arrete la; fais-moi juste un recap sobre de ce qu'on garde

Sophia :
> On garde trois choses :
>
> - Un blocage est un fait ponctuel, pas un verdict sur ton identité.
> - Une première ligne imparfaite peut suffire à relancer le mouvement.
> - Reprendre petit protège mieux que se forcer à tout résoudre d’un coup.

Trace : `selected_handler=execution_breakdown`, `reason_code=active_skill_continue`

Evaluation : recap sobre OK.

## 4. Assertions

- conversation normale au debut : pass
  preuve : tours 1-3 `response_owner=normal_reply`, `selected_handler=null`.
- entree `execution_breakdown` sur blocage concret : pass
  preuve : tour 4 `selected_handler=execution_breakdown`, `reason_code=skill_entry_signal`.
- maintien `execution_breakdown` : pass
  preuve : tours 5-7 lifecycle `execution_breakdown`.
- handoff vers `emotional_repair` : pass
  preuve : tour 8 `selected_handler=emotional_repair`, `reason_code=skill_handoff_requested`.
- maintien `emotional_repair` sur honte : pass
  preuve : tours 9-10 lifecycle `emotional_repair`.
- retour vers concret : pass
  preuve : tour 11 `selected_handler=execution_breakdown`, `reason_code=skill_handoff_requested`.
- tool `create_one_shot_reminder` execute : pass
  preuve : tour 13 `response_tool_execution=success`, `response_executed_tools=["create_one_shot_reminder"]`.
- trace presente : pass
  preuve : r4 15/15 `trace_error=null`, `trace_id` present.
- no empty response : pass sur r4
  preuve : r4 15/15 `empty_response=false`.
- no debounce abort : pass
  preuve : r4 15/15 `aborted=false`.
- pas de memory fact identitaire : pass
  preuve : tours emotionnels `memory_write_candidates_emitted=0`.
- heure correcte sur rappel absolu : fail
  preuve : tour 13 demande `18h`, reponse `21:00`.

## 5. Observations r6

Run r6 a remplace le tour tool par :

> rappelle-moi dans 20 minutes de reprendre l'intro

Resultat :

- tour 13 : pass tool, `response_tool_execution=success`, reponse `C’est programmé pour mercredi 06 mai à 09:58 : reprendre l'intro.`
- tour 14 : fail, HTTP 502 apres le tool sur `j'ai ecrit une ligne...`
- preuve : `2026-05-06-normal-exec-emotion-tool-15t-r6.summary.json`, tour 14 `status=502`, `empty_response=true`.

Interpretation :

- le tool relatif fonctionne mieux que le rappel absolu ;
- il reste une instabilite endpoint apres certains tours tool / LLM ;
- le run r4 prouve un 15/15 complet, mais r6 prouve que la stabilite n'est pas encore garantie.

## 6. Rapport fluidite humaine

Verdict fluidite : yellow.

Points positifs :

- la trajectoire conversationnelle est comprehensible ;
- le passage honte -> reparation emotionnelle est sain ;
- le recap final r4 est sobre ;
- le tour 14 r4 est nettement meilleur que les versions precedentes.

Points insuffisants :

- le debut reste trop familier et trop energie coaching : `Ok nickel`, emojis, `mochissime`, `Yes`.
- Sophia pousse parfois trop vite vers des options et plans alors que l'utilisateur dit vouloir parler.
- r6 montre une derive relationnelle hors contexte aux tours 11-12, avec une phrase adressee a "l'autre", alors que le contexte est une intro client.

Actions conversation recommandees :

- baisser l'energie de `execution_breakdown` apres un signal de honte ;
- interdire les emojis dans les 3 tours suivant `emotional_repair` ;
- ajouter une assertion QA : `work_context_after_emotional_repair` ne doit pas produire de phrase relationnelle si aucun lien/personne blessee n'est mentionne.

## 7. Rapport systeme

Verdict systeme : yellow/red.

Ce qui marche :

- `test-send-message` QA debounce fonctionne sur les runs complets ;
- traces presentes quand request_id unique ;
- `direct_effects` detecte bien `create_one_shot_reminder` ;
- le tool peut ecrire `scheduled_checkins` ;
- le guardrail ne doit plus ecraser la reponse tool apres correction.

Problemes restants :

- critical : rappel absolu `demain a 18h` programme/annonce une heure locale incorrecte sur l'endpoint local, malgre tests unitaires Deno OK.
- high : instabilite 502 observee apres tool dans r6.
- medium : l'Edge Runtime local semble parfois diverger du comportement Deno CLI, donc les tests unitaires ne suffisent pas pour valider le path edge.

Actions systeme recommandees :

- ajouter un test integration edge pour `POST /functions/v1/test-send-message` avec `rappelle-moi demain a 18h...`, assertion sur `scheduled_checkins.scheduled_for=16:00Z` en `Europe/Paris`.
- tracer dans `OneShotReminderToolOutcome` la source du parse : `strict_absolute | local_parser | ai_fallback`.
- bloquer l'AI fallback si un horaire absolu simple est present mais non parse ; mieux vaut `needs_clarify` qu'une mauvaise heure.
- ajouter une assertion long QA : apres `response_tool_execution=success`, le tour suivant ne doit pas retourner 5xx.

## 8. Verdict

- statut : yellow/red
- severite : high
- raison : le flow conversationnel et le tool passent, mais l'heure absolue du rappel est fausse et un run relatif a expose un 502 apres tool.
- issues a logger : oui
