# QA Run Report - select-state-potion-entry-guidance-r1

## 1. Contexte Du Test

- Date: 2026-06-05
- Run: `select-state-potion-entry-guidance-r1`
- Persona: `qa-skill`
- Connexions dediees: `statepotion_entry_guidance_n1_r1`, `statepotion_entry_guidance_n2_r1`, `statepotion_entry_guidance_n3_r1`
- Objectif: tester uniquement la porte d'entree "je veux une potion" puis l'aiguillage vers la bonne potion, avant passage au sous-skill de potion.
- Trajectoire: trois dialogues de difficulte croissante, jusqu'a identification de la potion: apaisement, courage, guerison.
- Surfaces visees: global dispatcher, `orientation_clarification`, `select_state_potion`, router potion, local flow actif, no-mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`; aucun fallback deterministe.
- Precision de verdict: les emojis sont acceptes dans ce run et ne sont pas comptes comme bug.
- Validite QA: valide. Trois runs IA reels ont obtenu HTTP 200 et des traces exploitables.

Artefacts bruts:

- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-05-select-state-potion-entry-guidance-n1-r1.summary.json`
- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-05-select-state-potion-entry-guidance-n2-r1.summary.json`
- `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-05-select-state-potion-entry-guidance-n3-r1.summary.json`

## 2. Tours De Conversation

### N.1 - Apaisement vs anti-decrochage

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Je crois que je veux une potion, mais je ne sais pas laquelle. J'ai l'impression d'être tendu et de perdre le fil, comme si je devais à la fois me calmer et me remettre en route.

**Sophia**
> Est-ce que tu veux choisir une potion pour changer d'état ou est-ce que tu cherches un soutien émotionnel ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- operation: none
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user dit deja vouloir une potion, mais le global demande encore potion vs soutien emotionnel.
- Source amont probable: global dispatcher / orientation clarification gate.
- Owner runtime: global dispatcher.
- Correction attendue: une demande explicite "je veux une potion" doit entrer dans `select_state_potion`; l'incertitude doit etre traitee par le router potion local.

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-04` - Ambiguite reconnue mais clarification trop orientee produit

**User**
> Oui, je veux bien choisir une potion. Je ne veux pas juste être rassuré, je veux trouver laquelle correspond à cet état.

**Sophia**
> Je comprends. Pour t'aider à choisir, est-ce que tu as plus besoin d'une Potion d'apaisement pour redescendre en pression, ou d'une Potion anti-décrochage pour te remettre en route ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `orientation_clarification_resolved_tool_skill`
- operation: `platform_handoff`, status `collecting`, reason `state_potion_handoff_collecting`
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: bon passage au skill et bonnes candidates, mais la clarification demande de choisir par nom de potion.
- Source amont probable: router potion / visible prompt de clarification.
- Owner runtime: `select_state_potion`.
- Correction attendue: poser une question par besoin reel: redescendre la pression maintenant vs se raccrocher a un rythme qui file.

#### Tours 3-5

**Verdict du bloc:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow; `BF-INTAKE-02` mineur

**User / Sophia**
> User T3: Là, c'est vraiment la pression d'abord. Mon corps reste en alerte, je suis serré, et si je repars trop vite je sens que je vais juste forcer.
>
> Sophia T3: Je comprends que tu te sens stressé. Qu'est-ce qui te met le plus sous pression là ? 🙂
>
> User T4: C'est surtout l'accumulation des messages et des attentes autour de moi. J'ai l'impression que tout arrive en même temps et que je n'ai plus d'espace.
>
> Sophia T4: Tu te sens plutôt comment ? 🙂
>
> User T5: Je me sens à cran, un peu comprimé, comme si je devais redescendre avant de pouvoir réfléchir correctement.
>
> Sophia T5: Je te conseille de choisir Potion d'apaisement. [...] Potion : Potion d'apaisement [...]

**Trace courte**
- http_status: 200 on all turns
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `active_handoff_field_confirmation` on T3-T5
- final operation: `handoff_delivered`, reason `state_potion_platform_handoff_delivered`
- final platform_inputs: `potion_type=apaisement`
- durable_effect: `user_potion_sessions=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`, `memory_items=0`

**Analyse si yellow/red**
- Symptome: la potion finale est correcte, mais le flow commence a collecter les champs d'apaisement avant d'annoncer clairement que la potion est identifiee.
- Source amont probable: contrat de transition entre router potion et sous-skill detail.
- Owner runtime: `select_state_potion` local flow / reducer.
- Correction attendue: des que le router selectionne `apaisement`, produire une sortie structurée `potion_selected` et passer le baton; le detail apaisement doit demarrer ensuite, pas etre melange a la selection.

### N.2 - Courage vs apaisement

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Je veux une potion, mais je ne sais pas laquelle. J'ai un truc à envoyer à quelqu'un et je tourne autour depuis deux jours, je sens de la pression mais aussi une vraie peur de le faire.

**Sophia**
> Est-ce que tu veux choisir une potion pour changer ton état d'esprit ou est-ce que tu veux un soutien pour gérer cette peur et cette pression ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- operation: none
- durable_effect: none

**Analyse si yellow/red**
- Symptome: meme probleme de porte d'entree: le global interpose une clarification alors que la demande de potion est explicite.
- Source amont probable: global dispatcher.
- Owner runtime: global dispatcher.
- Correction attendue: router directement vers `select_state_potion` quand le monde "potion" est clair, meme si la potion exacte ne l'est pas.

#### Tours 2-5

**Verdict du bloc:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-04`; `BF-STATE-01`

**User / Sophia**
> User T2: Je veux vraiment choisir une potion. Le soutien peut attendre, là je veux comprendre quelle potion correspond à ce blocage.
>
> Sophia T2: Laquelle de ces deux potions te semble la plus adaptée à ton blocage : la Potion de courage ou la Potion d'apaisement ? 🙂
>
> User T3: C'est plutôt la peur du passage. Je ne cherche pas juste à me calmer : j'évite d'appuyer sur envoyer parce que j'ai peur de la réaction.
>
> Sophia T3: Si je comprends bien, ce qui te bloque le plus, c'est la peur de la réaction des autres, de leur regard ? C'est bien ça ? 🙂
>
> User T4: Oui, c'est exactement ça. J'ai peur que la personne le prenne mal, et je repousse pour éviter cette sensation.
>
> Sophia T4: Je te suis. Qu'est-ce qui te pèse le plus là-dedans ? 🙂
>
> User T5: Ce qui me pèse, c'est l'anticipation du conflit. Je sais que ce message est juste, mais j'ai besoin de franchir le pas malgré l'inconfort.
>
> Sophia T5: Je te conseille de choisir Potion de courage. [...] Potion : Potion de courage [...]

**Trace courte**
- http_status: 200 on all turns
- T2 response_owner: `tool_skill`, selected_handler `select_state_potion`
- T3-T5 route_reason: `active_handoff_field_confirmation`
- final operation: `handoff_delivered`, reason `state_potion_platform_handoff_delivered`
- final platform_inputs: `potion_type=courage`
- durable_effect: `user_potion_sessions=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`, `memory_items=0`

**Analyse si yellow/red**
- Symptome: la selection finale est bonne; le systeme distingue correctement courage d'apaisement. Mais il collecte des champs de courage avant l'annonce visible de la potion.
- Source amont probable: local flow action taxonomy et reducer.
- Owner runtime: `select_state_potion`.
- Correction attendue: etat intermediaire `potion_selected` explicite; la collecte detail `courage` doit etre le flow suivant.

### N.3 - Guerison vs amour

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Je veux une potion, mais je ne sais pas laquelle. Hier j'ai complètement craqué sur mon plan, et depuis je me parle très durement. Je ne sais pas si j'ai besoin de me réparer de l'épisode ou d'un peu plus de douceur envers moi.

**Sophia**
> Est-ce que tu veux choisir une potion pour changer ton état ou as-tu besoin d'un soutien pour te réparer émotionnellement ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- operation: none
- durable_effect: none

**Analyse si yellow/red**
- Symptome: troisieme reproduction du meme probleme de porte d'entree.
- Source amont probable: global dispatcher.
- Owner runtime: global dispatcher.
- Correction attendue: le global doit deleguer au dispatcher/router potion local; "soutien libre vs potion" ne doit pas bloquer une demande explicitement potion.

#### Tours 2-4

**Verdict du bloc:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-04`; `BF-STATE-01`

**User / Sophia**
> User T2: Je veux choisir une potion. Je ne demande pas un soutien libre, je veux savoir laquelle correspond à cet état après le craquage.
>
> Sophia T2: Pour t'aider après ce craquage et cette dureté envers toi, tu préfères une Potion de guérison ou une Potion d'amour ? 🙂
>
> User T3: Je crois que c'est surtout après l'épisode. J'ai honte d'avoir craqué, j'ai envie de me relever proprement de ce moment plutôt que juste me parler gentiment.
>
> Sophia T3: Tu ressens surtout de la honte ? 🙂
>
> User T4: Oui, surtout de la honte, et aussi la peur que ce craquage veuille dire que je suis revenu en arrière.
>
> Sophia T4: Je te conseille de choisir Potion de guérison. [...] Potion : Potion de guérison [...]

**Trace courte**
- http_status: 200 on all turns
- T2 response_owner: `tool_skill`, selected_handler `select_state_potion`
- T3-T4 route_reason: `active_handoff_field_confirmation`
- final operation: `handoff_delivered`, reason `state_potion_platform_handoff_delivered`
- final platform_inputs: `potion_type=guerison`
- durable_effect: `user_potion_sessions=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`, `memory_items=0`

**Analyse si yellow/red**
- Symptome: bonne distinction guerison vs amour; pas de label "reparation" visible. Mais la clarification reste nom-produit et le detail commence avant un stage de selection explicite.
- Source amont probable: router potion visible task et reducer stage transition.
- Owner runtime: `select_state_potion`.
- Correction attendue: question naturelle par besoin reel, puis sortie `potion_selected=guerison` avant detail.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia converge vers les bonnes potions sur les trois cas: apaisement, courage, guerison.
- Elle ne force pas un choix arbitraire quand deux potions sont proches.
- Elle n'invente pas de mauvais labels comme "rappel" ou "reparation".
- Le ton reste doux et les emojis sont coherents avec la preference utilisateur.

**Problemes**
- Tous les T1: Sophia demande encore "potion ou soutien emotionnel" alors que le user dit explicitement vouloir une potion. Famille: `BF-ROUTE-01`. Impact: friction d'entree inutile.
- N.1 T2, N.2 T2, N.3 T2: clarification par noms produit. Famille: `BF-INTAKE-04`. Impact: moins naturel qu'une clarification par besoin.
- Tous les runs: la potion est annoncee seulement apres collecte de champs detail; pour l'objectif "select_state_potion = selection puis baton", c'est trop tard. Famille: `BF-STATE-01`. Impact: le flow selection et le sous-skill detail restent melanges.

**Fix propose**
- Source amont: global dispatcher + `select_state_potion` local flow contract.
- Correction recommandee: si le monde potion est explicite, le global route directement vers `select_state_potion`; le router local clarifie la potion par besoin; quand `selected_potion` est high confidence, il produit un stage `potion_selected` et un exit/handoff memo vers le sous-skill detail.
- Tests d'invariant attendus: "je veux une potion mais je ne sais pas laquelle" doit entrer en `tool_skill/select_state_potion`; clarification sans liste de noms si besoin suffisant; pas de collecte detail avant `potion_selected`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Point faible principal: le premier tour de chaque run est capture par `orientation_clarification`, pas par `select_state_potion`.
- Point fort: apres confirmation explicite, `orientation_clarification_resolved_tool_skill` route correctement vers `tool_skill/select_state_potion`.
- Une fois actif, le flow ne sort pas vers le global et garde le bon handler.

**Skills / Operations / Tools**
- `select_state_potion` converge vers les bons `platform_inputs.potion_type`: `apaisement`, `courage`, `guerison`.
- `executed_tools=[]`; le chat ne lance rien.
- `tool_execution=platform_handoff` mais sans effet durable.

**Memory / Effets durables**
- Verification REST ciblee: `user_potion_sessions=0`, `scheduled_checkins=0`, `user_recurring_reminders=0`, `memory_items=0` pour les trois users QA.
- Les seuls effets persistants sont les messages de chat du run QA.

**Problemes**
- Tous les T1: mauvais owner initial. Famille: `BF-ROUTE-01`. Impact systeme: la porte d'entree potion est trop conservatrice.
- T3-T5: `route_reason=active_handoff_field_confirmation` est utilise pour des reponses qui sont souvent des field answers ou du detail intake. Famille: `BF-STATE-01`. Impact systeme: traces locales trop peu discriminantes.
- Fin de run: le systeme livre un handoff complet au lieu de s'arreter a l'identification de potion. Famille: `BF-STATE-01`. Impact systeme: `select_state_potion` absorbe une partie du sous-skill detail.

**Fix propose**
- Source amont: global dispatcher route policy, local flow dispatcher actions, reducer stage model.
- Correction recommandee: ajouter/renforcer les actions `potion_world_entered`, `routing_clarification_answer`, `potion_selected`, `delegate_to_potion_detail`; conserver `platform_handoff` au sous-skill detail si c'est la nouvelle architecture cible.
- Tests d'invariant attendus: trois fixtures IA reelles couvrant apaisement/anti-decrochage, courage/apaisement, guerison/amour; assertion trace owner T1; assertion absence de handoff detail avant `potion_selected`.

## Verdict Global

- Verdict: yellow
- Raison principale: le systeme choisit les bonnes potions et reste non-mutant, mais la porte d'entree passe encore par `orientation_clarification`, et `select_state_potion` melange selection et detail.
- Follow-up prioritaire: corriger le global dispatcher pour router directement le monde potion, puis introduire un stage explicite `potion_selected` avant delegation au sous-skill de potion.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-05-select-state-potion-entry-guidance-r1-bugs.md`
