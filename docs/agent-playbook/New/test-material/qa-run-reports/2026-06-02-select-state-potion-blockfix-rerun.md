# QA Run Report - select_state_potion blockfix rerun

## 1. Contexte Du Test

- Date: 2026-06-02
- Runs:
  - `qa-potion-emorepair-blockfix-20260602-r1`
  - `qa-potion-emorepair-blockfix-20260602-r2`
  - `qa-potion-emorepair-blockfix-20260602-r3`
- Persona: users Auth QA temporaires locaux, dedies par run, nettoyes apres verification.
- Objectif: verifier les cas qui bloquaient apres correction `state_potion_platform_handoff_minimal_ready`.
- Trajectoire: ambiguite apaisement/clarte, clarification emotional-repair vs potion, demande "recommandation plateforme / tout de suite / sans suivi", repeat handoff, apply attempt.
- Surfaces visees: orientation clarification, `select_state_potion`, active handoff, renderer potion, no-mutation DB.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback `processMessage`.
- Validite QA: valide. Les messages ont ete choisis tour par tour apres lecture des reponses et traces courtes. Incident sandbox: deux appels initiaux ont ete bloques par `EPERM 127.0.0.1:54321`, puis relances avec autorisation reseau locale.

## 2. Tours De Conversation

### Run 1 - Tour 1

**Verdict du tour:** green

**User**
> Je suis en vrac et j'hésite entre apaisement et clarté. Je veux peut-être une potion, mais seulement une recommandation à reprendre dans la plateforme, pas un suivi.

**Sophia**
> Entre l'apaisement pour redescendre en pression et la clarté pour remettre de l'ordre, qu'est-ce qui t'aiderait le plus ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

### Run 1 - Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `a classifier` - renderer wording handoff.

**User**
> Plutôt clarté. Donne-moi la recommandation plateforme courte, sans suivi, pour m'aider à voir la prochaine action prioritaire.

**Sophia**
> Ce que je comprends : Je suis en vrac Plutôt clarté
>
> Je te conseille de choisir une potion de clarté. Le shift recommandé est de retrouver un fil simple plutôt que tout résoudre.
>
> Pourquoi cette potion : elle sert à retrouver un fil praticable quand tout est mélangé.
> Pas immédiat : écris une seule phrase: la prochaine action utile maintenant.
>
> À préserver : garder une recommandation courte, rester sur une action simple, garder ça ponctuel, sans suivi.
> À éviter : continuer à préciser si tu veux surtout te débloquer maintenant, programmer un suivi ou un rappel récurrent.
>
> Dans la plateforme, dans la section État / Potions, puis choisis la potion recommandée, active-la depuis la plateforme si elle te convient.
>
> Je ne lance pas de potion depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `same_operation_signal_continues_active_handoff`
- platform_handoff.reason_code: `state_potion_platform_handoff_minimal_ready`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: le blocage de slots est corrige, mais le renderer affiche `Pas immédiat`, ambigu en français car il peut se lire comme "not immediate".
- Source amont probable: renderer `select_state_potion`, libelle de `immediate_step`.
- Owner runtime: `select_state_potion` renderer.
- Meilleure correction selon les guidelines: renommer le libelle visible en `Petit pas immédiat` ou equivalent non ambigu, sans changer le flow.
- Pourquoi ce n'est pas un patch local: le contenu provient du renderer proprietaire du handoff; il faut corriger le libelle structurel du champ.

### Run 1 - Tour 3

**Verdict du tour:** green

**User**
> Ok vas-y active-la.

**Sophia**
> Je ne l'active pas depuis le chat.
> Reprends cette recommandation dans la plateforme, dans la section État / Potions. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_apply_attempt`
- platform_handoff.reason_code: `state_potion_apply_attempt_no_chat_execution`
- safety: `none`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

### Run 2 - Tour 1

**Verdict du tour:** green

**User**
> Je crois que j'ai besoin d'une potion de clarté, mais je suis aussi un peu fragile. Je veux juste me débloquer maintenant, sans rappel ni suivi.

**Sophia**
> Tu veux une potion de clarté, un soutien émotionnel ou de l'aide pour découper une action ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

### Run 2 - Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `a classifier` - renderer wording handoff.

**User**
> Potion de clarté. Je veux juste la recommandation plateforme, tout de suite, sans rappel ni suivi.

**Sophia**
> Ce que je comprends : Potion de clarté
>
> Je te conseille de choisir une potion de clarté. Le shift recommandé est de retrouver un fil simple plutôt que tout résoudre.
>
> Pourquoi cette potion : elle sert à retrouver un fil praticable quand tout est mélangé.
> Pas immédiat : écris une seule phrase: la prochaine action utile maintenant.
>
> À préserver : garder une recommandation courte, rester sur une action simple, garder ça ponctuel, sans suivi.
> À éviter : continuer à préciser si tu veux surtout te débloquer maintenant, programmer un suivi ou un rappel récurrent.
>
> Dans la plateforme, dans la section État / Potions, puis choisis la potion recommandée, active-la depuis la plateforme si elle te convient.
>
> Je ne lance pas de potion depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `orientation_clarification_resolved_tool_skill`
- platform_handoff.reason_code: `state_potion_platform_handoff_minimal_ready`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: handoff livre au bon moment, mais le libelle `Pas immédiat` est maladroit.
- Source amont probable: renderer `select_state_potion`.
- Owner runtime: `select_state_potion` renderer.
- Meilleure correction selon les guidelines: libelle visible non ambigu pour le petit pas immediat.
- Pourquoi ce n'est pas un patch local: meme champ visible reproduit sur plusieurs runs.

### Run 2 - Tour 3

**Verdict du tour:** green

**User**
> Redis-moi où je la lance et laquelle choisir.

**Sophia**
> Ce que je comprends : Potion de clarté
>
> Je te conseille de choisir une potion de clarté. Le shift recommandé est de retrouver un fil simple plutôt que tout résoudre.
>
> Pourquoi cette potion : elle sert à retrouver un fil praticable quand tout est mélangé.
> Pas immédiat : écris une seule phrase: la prochaine action utile maintenant.
>
> À préserver : garder une recommandation courte, rester sur une action simple, garder ça ponctuel, sans suivi.
> À éviter : continuer à préciser si tu veux surtout te débloquer maintenant, programmer un suivi ou un rappel récurrent.
>
> Dans la plateforme, dans la section État / Potions, puis choisis la potion recommandée, active-la depuis la plateforme si elle te convient.
>
> Je ne lance pas de potion depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_repeat_handoff`
- safety: `low`
- skill_entry_ids: `["product_help"]`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

### Run 3 - Tour 1

**Verdict du tour:** green

**User**
> J'ai la boule au ventre et je pensais à une potion, mais je ne sais pas si j'ai besoin d'être rassuré ou d'un reset court dans la plateforme. Pas de relance.

**Sophia**
> Est-ce que tu veux un soutien émotionnel pour te rassurer ou préfères-tu utiliser une potion pour faire un reset ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

### Run 3 - Tour 2

**Verdict du tour:** green

**User**
> Je préfère une potion de reset court à reprendre dans la plateforme, pas un suivi. Je veux juste redescendre maintenant.

**Sophia**
> On va s'occuper de cette boule au ventre. Qu'est-ce qui te met le plus sous pression en ce moment ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `orientation_clarification_resolved_tool_skill`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

### Run 3 - Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `a classifier` - renderer wording handoff.

**User**
> La pression vient surtout du fait que je dois choisir la prochaine action. Je veux la recommandation plateforme maintenant, sans suivi ni rappel.

**Sophia**
> Ce que je comprends : boule au ventre redescendre maintenant
>
> Je te conseille de choisir une potion d'apaisement court. Le shift recommandé est de redescendre la pression avant de reprendre.
>
> Pourquoi cette potion : Pour calmer la sensation physique de blocage liée à l'indécision et au besoin de choisir une action.
> Pas immédiat : Prends juste une grande inspiration. Cette boule au ventre, c'est ton corps qui essaie de tout résoudre d'un coup. On va juste desserrer l'étau pour que tu puisses y voir plus clair.
>
> À préserver : rester sur une action simple, garder le format court, garder ça ponctuel, sans suivi.
> À éviter : en faire un gros rituel, programmer un suivi si tu voulais seulement te poser maintenant.
>
> Dans la plateforme, dans la section État / Potions, puis choisis la potion recommandée, active-la depuis la plateforme si elle te convient.
>
> Je ne lance pas de potion depuis le chat. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `same_operation_signal_continues_active_handoff`
- platform_handoff.reason_code: `state_potion_platform_handoff_delivered`
- safety: `low`
- direct_effects: `[]`
- operation: `platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: handoff livre sans boucle timing/detail, mais meme libelle `Pas immédiat`.
- Source amont probable: renderer `select_state_potion`.
- Owner runtime: `select_state_potion` renderer.
- Meilleure correction selon les guidelines: corriger le libelle du champ immediat.
- Pourquoi ce n'est pas un patch local: probleme recurrent dans le renderer.

**Verification DB des 3 runs avant cleanup**
- `qa-potion-emorepair-blockfix-20260602-r1`: `user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`
- `qa-potion-emorepair-blockfix-20260602-r2`: `user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`
- `qa-potion-emorepair-blockfix-20260602-r3`: `user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0`

**Cleanup**
- Nettoyage cible lance apres verification DB.
- `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`: OK.
- `user_memories`: 404 dans le runner local, aucune donnee nettoyable observee via ce chemin.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le blocage principal est corrige: les demandes "recommandation plateforme", "tout de suite", "sans rappel ni suivi" livrent un handoff au lieu de boucler sur timing/detail.
- Les clarifications initiales sont naturelles quand l'utilisateur hesite entre soutien emotionnel et potion.
- "Ok vas-y active-la" ne promet pas d'activation.
- "Redis-moi ou je la lance" reste dans le handoff potion, pas dans `product_help` generique.

**Problemes**
- Tours R1-T2, R2-T2, R3-T3: `Pas immédiat` est un libelle ambigu. Famille: `a classifier` / renderer. Impact: comprehension degradee mais contenu correct. Severite: yellow.

**Fix propose**
- Source amont: `select_state_potion` renderer.
- Correction recommandee: remplacer le libelle `Pas immédiat` par `Petit pas immédiat` ou `À faire maintenant`.
- Tests d'invariant attendus: wording handoff contient un libelle immediat non ambigu; ne contient pas `Pas immédiat :`.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- `select_state_potion` conserve l'ownership des continuations actives.
- R2-T3 contient un signal `product_help`, mais le routeur garde `active_handoff_repeat_handoff`, ce qui evite la regression "ou je la lance ?" vers aide produit generique.
- Les clarifications d'orientation restent propres pour emotional repair vs potion.

**Skills / Operations / Tools**
- `platform_handoff.reason_code=state_potion_platform_handoff_minimal_ready` observe sur les cas cibles R1-T2 et R2-T2.
- `state_potion_apply_attempt_no_chat_execution` observe sur R1-T3.
- `executed_tools=[]` sur tous les tours.
- `direct_effects=[]` et `pending_confirmation=null` sur tous les tours.

**Effets durables**
- Aucun insert DB potion/follow-up observe:
  - `user_potion_sessions=0`
  - `user_recurring_reminders=0`
  - `scheduled_checkins=0`
- Le handoff reste `no_chat_mutation=true` dans les traces.

**Fix propose**
- Le bug `ER-POT-20260602-B01` peut passer en `verified`.
- Ouvrir un bug mineur de renderer pour le libelle `Pas immédiat`.

## Verdict Global

`yellow` pour wording renderer mineur. Le blocage fonctionnel des slots `recommandation plateforme / tout de suite / sans suivi` est corrige et verifie en run reel.
