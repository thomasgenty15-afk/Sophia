## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `state_potion_handoff_6flows_r1`
- Persona: connexion QA locale temporaire `qa-handoff-6potions-0603-r1@example.com`
- Objectif: relancer un flow conversationnel de minimum 3 tours pour chaque potion (`rappel`, `courage`, `guerison`, `clarte`, `amour`, `apaisement`).
- Trajectoire: demande potion -> clarification/intake -> handoff plateforme ou continuation active.
- Surfaces visees: dispatcher, orientation clarification, `select_state_potion`, sous-skills potion, active handoff, renderer no-mutation, EffectLedger.
- Cadre IA reel: Supabase local, endpoint `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, pas de renderer deterministe, pas de fallback direct.
- Validite QA: partielle. 17 tours ont retourne HTTP 200; `clarte` T3 a retourne HTTP 502 deux fois. Le run reste exploitable pour les bugs observes, mais `clarte` est red/incomplet au tour 3.
- Artefacts bruts: `/private/tmp/*_t01.json`, `/private/tmp/*_t02.json`, `/private/tmp/*_t03.json`, `/private/tmp/clarte_t03_retry.json`.
- Verification DB post-run: `user_potion_sessions=[]`, `user_recurring_reminders=[]`, `scheduled_checkins=[]` pour le user QA.

## 2. Tours De Conversation

### Potion rappel / anti-decrochage

#### Tour 1

**Verdict du tour:** green

**User**
> Sophia, je crois que j ai besoin d une potion anti-decrochage. Je sens que je laisse filer ma routine du soir, mais je veux garder ca simple.

**Sophia**
> Ok, tu sens que tu decroches de ta routine du soir. Et tu laisses filer, c'est bien ca ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- operation_status: `clarifying`
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: 0 session, 0 reminder, 0 checkin

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-RENDERER-01 / BF-GEN-01

**User**
> Oui, c est ca. Je decroche surtout de ma marche apres le diner et du rangement rapide du bureau.

**Sophia**
> Ce que je comprends : User explicitly mentioned 'anti-decrochage' User described 'laisse filer' and 'routine du soir'
>
> Je te conseille de choisir une potion de rappel...
>
> A mettre dans la plateforme :
> Potion : Potion anti-decrochage
> - Par rapport a quoi tu sens que tu decroches ? ma routine du soir
> - Tu decroches plutot comment ? Je laisse filer
>
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- operation_status: `handoff_delivered`
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: 0 session, 0 reminder, 0 checkin

**Analyse si yellow/red**
- Symptome: texte interne visible dans le renderer: `User explicitly mentioned...`.
- Source amont probable: generator/handoff draft `user_state_summary` non normalise en texte user-facing.
- Owner runtime: `select_state_potion/generator` ou renderer handoff.
- Correction recommandee: renforcer le contrat de sortie visible du generator et ajouter test wording interdisant les labels/evidence internes.

#### Tour 3

**Verdict du tour:** green

**User**
> Ok, active-la maintenant alors.

**Sophia**
> Je ne peux pas le creer/lancer depuis le chat.
> Tu peux le faire toi-meme dans la plateforme, dans la section Etat / Potions.
> Choisis : Potion anti-decrochage.
> A renseigner :
> - Par rapport a quoi tu sens que tu decroches ? ma routine du soir
> - Tu decroches plutot comment ? Je laisse filer

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- operation_status: `apply_attempt`
- reason: `state_potion_apply_attempt_no_chat_execution`
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: 0 session, 0 reminder, 0 checkin

### Potion courage

#### Tour 1

**Verdict du tour:** green

**User**
> Sophia, je veux preparer une potion de courage. J evite un message important et je tourne autour depuis hier.

**Sophia**
> Qu'est-ce qui bloque le plus ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- operation_status: `clarifying`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-RENDERER-01 / BF-GEN-01

**User**
> Ce qui bloque le plus, c est la peur que le message declenche un conflit et qu on me juge lourd.

**Sophia**
> Ce que je comprends : current_user_message
>
> Je te conseille de choisir une potion de courage...
>
> A mettre dans la plateforme :
> Potion : Potion de courage
> - Qu'est-ce que tu evites en ce moment ? un message important
> - Qu'est-ce qui bloque le plus ? La peur du conflit
>
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- operation_status: `handoff_delivered`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: `current_user_message` visible dans `Ce que je comprends`.
- Source amont probable: generator/handoff draft laisse passer un placeholder interne.
- Owner runtime: `select_state_potion/generator`.
- Correction recommandee: validation stricte du draft/handoff contre placeholders internes avant renderer.

#### Tour 3

**Verdict du tour:** green

**User**
> Ok, active-la maintenant.

**Sophia**
> Je ne peux pas le creer/lancer depuis le chat.
> Tu peux le faire toi-meme dans la plateforme, dans la section Etat / Potions.
> Choisis : Potion de courage.
> A renseigner :
> - Qu'est-ce que tu evites en ce moment ? un message important
> - Qu'est-ce qui bloque le plus ? La peur du conflit

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- operation_status: `apply_attempt`
- executed_tools: `[]`
- committed_effects: `[]`
- durable_effect: 0 session, 0 reminder, 0 checkin

### Potion guerison

#### Tour 1

**Verdict du tour:** green

**User**
> Sophia, j aurais besoin d une potion de guerison. J ai rate un bloc de travail hier et depuis je me parle assez violemment.

**Sophia**
> Est-ce que tu veux utiliser une potion de guerison ou est-ce que tu as besoin d'un soutien emotionnel ?

**Trace courte**
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 2

**Verdict du tour:** green

**User**
> Je veux bien preparer une potion de guerison. Ce qui m a fait mal, c est d avoir abandonne le bloc puis de me dire que je suis incapable.

**Sophia**
> Et tu ressens surtout de la honte, c'est ca ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- operation_status: `clarifying`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-RENDERER-01 / BF-GEN-01

**User**
> Oui, surtout de la honte et du decouragement, pas besoin d analyser plus que ca.

**Sophia**
> Ce que je comprends : user_message_describes_shame_guilt user_message_implies_self_attack
>
> Je te conseille de choisir une potion de reparation...
>
> A mettre dans la plateforme :
> Potion : Potion de guerison
> - Qu'est-ce qui t'a fait mal ou t'a fait retomber recemment ? d'avoir abandonne le bloc puis de te dire que tu es incapable
> - Tu ressens surtout quoi ? De la honte
>
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- operation_status: `handoff_delivered`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: evidence interne visible dans `Ce que je comprends`.
- Source amont probable: generator/handoff draft.
- Owner runtime: `select_state_potion/generator`.

### Potion clarte

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTING-01 / BF-STATE-01

**User**
> Sophia, je veux une potion de clarte. Mon plan commence a perdre son sens pour moi et je ne veux pas juste refaire une todo.

**Sophia**
> Est-ce que tu veux ajuster ton plan ou preferes-tu faire le point sur ta motivation ?

**Trace courte**
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: la clarification ne propose pas explicitement `potion de clarte` alors que le user l'a demandee et a donne le use case canonique.
- Source amont probable: orientation clarification candidates / dispatcher sensitivity pour clarte vs plan/motivation.
- Correction recommandee: corriger les candidats structurés upstream, pas regex locale.

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTING-02 / BF-FLOW-01

**User**
> Je ne veux pas ajuster le plan ni faire un bilan motivation. Je veux une potion de clarte parce que je ne vois plus le lien entre mes actions et mon pourquoi profond.

**Sophia**
> Ah je vois... et c'est frustrant quand tu fais des trucs "comme prevu", mais que ca ne touche plus ton "pourquoi"
>
> Ok, on va te donner de la clarte sans toucher au plan ni faire un bilan motivation...
> Envoie-moi juste les reponses pour l'etape 1 + 2...

**Trace courte**
- response_owner: `normal_reply`
- selected_handler: `null`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: sortie du flow `select_state_potion`, pas de sous-skill clarté, pas de champs plateforme.
- Source amont probable: resolution de clarification qui ne re-route pas vers `select_state_potion` apres correction explicite du user.
- Owner runtime: clarification resolver / agenda / active flow arbitration.
- Correction recommandee: la resolution de clarification doit produire une intention structuree `select_state_potion` avec `potion_type=clarte`.

#### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-RUNTIME-01

**User**
> Pour la plateforme, je mettrais: je ne vois plus le lien entre mes actions du plan et la raison profonde pour laquelle j ai commence.

**Sophia**
> [reponse vide: HTTP 502]

**Trace courte**
- http_status: 502
- error: `An invalid response was received from the upstream server`
- retry: meme contenu, nouveau request id, meme HTTP 502
- durable_effect: 0 session, 0 reminder, 0 checkin

**Analyse si yellow/red**
- Symptome: incident runtime sur le troisieme tour apres sortie du flow.
- Source amont probable: a investiguer via logs Edge/trace; le JSON reponse ne contient pas de diagnostic applicatif.
- Owner runtime: endpoint/runtime local ou branche downstream apres normal_reply.

### Potion amour

#### Tour 1

**Verdict du tour:** green

**User**
> Sophia, je pense a une potion d amour. En ce moment je manque de douceur envers moi, surtout quand je rate quelque chose.

**Sophia**
> Est-ce que tu veux preparer une potion d'amour ou est-ce que tu as besoin d'un soutien emotionnel pour etre plus doux avec toi-meme ?

**Trace courte**
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTING-02 / BF-FLOW-01

**User**
> Je veux preparer la potion d amour. C est par rapport a mes echecs repetes au travail que je me sens en manque d amour envers moi.

**Sophia**
> Ok, on fait la potion d'amour...
> On va la construire en 2 minutes, facon "je me parle comme a quelqu'un que j'aime"...
> Dis-moi juste : c'est quoi ton "X" le plus recent au travail ?

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: apres choix explicite `preparer la potion d'amour`, le flow part dans `emotional_repair`, pas dans `select_state_potion`.
- Source amont probable: resolution de clarification donne la priorite au soutien emotionnel alors que le user a choisi la potion.
- Owner runtime: clarification resolver / dispatcher / arbitration.

#### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-FLOW-01

**User**
> Le X recent, c est une presentation ratee lundi. Je me suis parle comme si ca prouvait que je ne suis pas a la hauteur.

**Sophia**
> Ah ouais... une presentation ratee lundi, et en plus ta tete t'a servi le verdict "je ne suis pas a la hauteur"...
> On met ca dans la potion, version vraie et douce...
> Tu me dis juste Y (le mot exact) ?

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: continue un pseudo-flow potion hors tool skill, sans champs UI attendus et sans renderer propriétaire.
- Owner runtime: `emotional_repair` prend le flow au lieu de restituer au handoff potion.

### Potion apaisement

#### Tour 1

**Verdict du tour:** green

**User**
> Sophia, je voudrais une potion d apaisement. Je suis sous pression depuis ce matin et j ai du mal a redescendre.

**Sophia**
> Est-ce que tu veux que je t'aide a choisir une potion d'apaisement ou est-ce que tu preferes un soutien emotionnel pour evacuer la pression ?

**Trace courte**
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 2

**Verdict du tour:** green

**User**
> Je veux choisir une potion d apaisement. Ce qui me met sous pression, c est une reunion et toutes les urgences qui s accumulent autour.

**Sophia**
> Tu te sens plutot comment ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- operation_status: `clarifying`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-RENDERER-01 / BF-GEN-01

**User**
> Je me sens surtout submerge et a cran, avec la machoire serree.

**Sophia**
> Ce que je comprends : current_user_message: Je veux choisir une potion d apaisement...
>
> Je te conseille de choisir une potion d'apaisement court...
>
> A mettre dans la plateforme :
> Potion : Potion d'apaisement
> - Qu'est-ce qui te met le plus sous pression la ? une reunion et toutes les urgences qui s'accumulent autour
> - Tu te sens plutot comment ? Submerge
>
> Je ne lance pas de potion depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- operation_status: `handoff_delivered`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: `current_user_message` visible dans le message final.
- Source amont probable: generator/handoff draft.
- Owner runtime: `select_state_potion/generator`.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**

- Les flows `rappel`, `courage`, `guerison` et `apaisement` finissent par fournir les champs plateforme attendus.
- Les `apply_attempt` de `rappel` et `courage` sont bons: Sophia refuse gentiment de lancer depuis le chat et redonne le chemin plateforme.
- Aucun wording d'activation du type "c'est active" / "j'ai lance" n'a ete observe.

**Problemes**

- `rappel`, `courage`, `guerison`, `apaisement`: le renderer/generator laisse passer des placeholders ou evidence internes (`current_user_message`, `User explicitly mentioned...`, `user_message_describes...`). Impact utilisateur: experience peu fiable et peu humaine. Severite: yellow.
- `clarte`: le flow ne reconnait pas assez la demande explicite de potion clarté liee au sens du plan, puis sort vers `normal_reply`. Impact utilisateur: le parcours UI potion n'est pas donne. Severite: red.
- `amour`: apres clarification explicite en faveur de la potion, le flow bascule vers `emotional_repair` et simule un mini-flow non proprietaire. Impact utilisateur: pas de champs plateforme, confusion entre soutien emotionnel et handoff potion. Severite: red.

**Fix propose**

- Source amont: clarification resolver / active flow arbitration pour `clarte` et `amour`; generator/handoff draft validation pour les placeholders visibles.
- Correction recommandee: produire une intention structuree `select_state_potion` apres resolution explicite de clarification potion, et bloquer/regen les drafts contenant des placeholders internes.
- Tests attendus: clarté explicite "perte de sens du plan" route vers `select_state_potion`; amour "je veux preparer la potion" ne reste pas en `emotional_repair`; aucun handoff ne contient `current_user_message`, `User explicitly`, `user_message_`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**

- `rappel`: route correcte vers `select_state_potion`, puis `apply_attempt` correct.
- `courage`: route correcte vers `select_state_potion`, puis `apply_attempt` correct.
- `guerison`: clarification emotion vs potion correcte, puis route correcte vers `select_state_potion`.
- `apaisement`: clarification emotion vs potion correcte, puis route correcte vers `select_state_potion`.
- `clarte`: clarification initiale non optimale, puis resolution vers `normal_reply` au lieu de `select_state_potion`.
- `amour`: clarification initiale correcte, puis resolution vers `emotional_repair` au lieu de `select_state_potion`.

**Skills / Operations / Tools**

- `select_state_potion` reste no-mutation: `executed_tools=[]`, `committed_effects=[]` sur les tours tool skill.
- `orientation_clarification` intervient de maniere acceptable pour les cas emotion vs potion, sauf clarté ou les candidats proposés ne reflètent pas la potion demandee.
- `emotional_repair` capte abusivement amour apres choix explicite de potion.

**Memory / Effets durables**

- Verification DB post-run pour le user QA:
  - `user_potion_sessions`: `[]`
  - `user_recurring_reminders`: `[]`
  - `scheduled_checkins`: `[]`
- Aucun terminal operationnel potion n'a ete observe.

**Problemes**

- BF-ROUTING/BF-FLOW: resolution de clarification ne restitue pas toujours au tool skill potion apres choix explicite.
- BF-RENDERER/BF-GEN: contenu interne non user-facing visible dans plusieurs handoffs.
- BF-RUNTIME: `clarte` T3 retourne HTTP 502 deux fois apres sortie de flow.

**Fix propose**

- Corriger la resolution de clarification et l'arbitrage active handoff en amont, pas par regex locale.
- Ajouter une validation de draft handoff no-mutation interdisant les placeholders/evidence internes visibles.
- Investiguer le 502 clarté via logs Edge locaux ou trace runtime.

## Verdict Global

- Verdict: red.
- Raison principale: no-mutation OK, mais deux flows (`clarte`, `amour`) ne tiennent pas le parcours tool-skill, et quatre handoffs exposent du texte interne.
- Priorite correction: `clarte` routing/resolution, `amour` clarification -> handoff, puis sanitizer/validation generator pour placeholders visibles.
