# QA Run Report - emotional_repair Local Real R1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `2026-06-08-emotional-repair-local-real-r1`
- Persona: Alex, connexion locale dediee existante
- Objectif: verifier en conditions reelles le flow local `emotional_repair`, puis son lien doux vers les sous-skills potion via le contexte de bridge.
- Trajectoire: honte / auto-attaque -> soutien visible sans protocole force -> demande de suite douce sans refaire tout l'episode.
- Surfaces visees: routing, `emotional_repair`, `flow_opportunity_verification`, local dispatcher, safety self-attack, handoff vers `select_state_potion`, effets durables.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, pas de renderer deterministe, pas de fallback direct.
- Validite QA: valide. Le chemin local reel a repondu HTTP 200 a chaque tour. Verdict fonctionnel: red.
- Artefacts: `tests/real-personas/alex/runs/emotional_repair/2026-06-08-emotional-repair-local-real-r1.raw.json`, `tests/real-personas/alex/runs/emotional_repair/2026-06-08-emotional-repair-local-real-r1.summary.json`, `tests/real-personas/alex/runs/emotional_repair/2026-06-08-emotional-repair-local-real-r1.cleanup.json`
- Cleanup: ciblage strict par `user_id` + `scope`; `chat_messages=8` et `user_chat_states=1` supprimes.
- Incident technique: premiers wrappers locaux bloques par sandbox/parsing; repris sans fallback avec le meme endpoint local. Les incidents n'ont pas fabrique de reponse QA.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - mauvais owner selectionne

**User**
> J'ai honte de mon craquage d'hier. Je me parle comme si j'etais nul, mais la j'aimerais juste arreter de me punir.

**Sophia**
> Je comprends ce sentiment de honte, c'est une reaction humaine mais tres douloureuse. Tu as raison de vouloir arreter de te punir, car la bienveillance est souvent plus efficace que la culpabilite pour avancer. Est-ce que tu aimerais qu'on prenne un moment ensemble pour apaiser cette tension et transformer ce dialogue interieur ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `skill_entry_signal`
- safety: `low`, no reason code
- direct_effects: none
- operation: `flow_opportunity_verification`
- pending_confirmation: `waiting_confirmation`
- memory_plan: none observed
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: l'intention emotionnelle est reconnue humainement, mais le owner est `flow_opportunity_verification`, pas `emotional_repair`.
- Source amont probable: dispatcher / flow opportunity arbitration qui capture l'entree sensible avant le skill conversationnel cible.
- Owner runtime: routing global et `flow_opportunity_verification` launch bridge.
- Meilleure correction selon les guidelines: faire produire ou prioriser l'opportunity canonique vers `emotional_repair` quand le signal principal est honte / auto-attaque non-imminente, puis laisser le local flow gerer la reponse visible.
- Pourquoi ce n'est pas un patch local: le contenu visible est acceptable; l'erreur est l'owner systeme et l'etat cree.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow

**User**
> Oui, mais sans protocole ni technique. Je veux juste que tu m'aides a separer mon erreur de qui je suis, parce que la je me traite vraiment durement.

**Sophia**
> Je garde l'idee, mais je n'arrive pas a lancer le flow cible correctement sur ce tour. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `active_flow_opportunity_verification_local_dispatcher`
- safety: `none`
- direct_effects: none
- operation: `flow_opportunity_verification`
- pending_confirmation: blocked
- memory_plan: none observed
- executed_tools: `[]`
- durable_effect: none
- blocked_effects: `target_flow_launch_failed`

**Analyse si yellow/red**
- Symptome: Sophia expose une erreur interne au lieu de soutenir l'utilisateur.
- Source amont probable: reducer / launcher de `flow_opportunity_verification` incapable de lancer le target flow conversationnel.
- Owner runtime: `flow_opportunity_verification` local dispatcher et bridge de lancement vers skill cible.
- Meilleure correction selon les guidelines: rendre le lancement cible contractuel pour les conversation skills, avec fallback conversationnel interne non technique si le launch echoue.
- Pourquoi ce n'est pas un patch local: changer la phrase visible masquerait un `target_flow_launch_failed`; il faut corriger la transition.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - mauvais owner selectionne

**User**
> Ok, laisse tomber le flow. Reste juste avec moi sur cette honte: j'ai fait une erreur, mais je ne veux plus me traiter comme si j'etais mauvais.

**Sophia**
> Je t'entends parfaitement, on laisse de cote les protocoles. C'est une distinction essentielle : ce que tu as fait hier est un comportement, pas ton identite. Faire une erreur ne te rend pas « mauvais », cela te rend simplement humain. Je reste la avec toi, dans cet espace ou tu peux simplement souffler sans te juger. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `skill_entry_signal`
- safety: `low`, reason code `self_attack`
- direct_effects: none
- operation: `flow_opportunity_verification`
- pending_confirmation: `waiting_confirmation`
- memory_plan: none observed
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: bonne reparation humaine, mais toujours sous le mauvais handler.
- Source amont probable: le dispatcher recree une opportunity de flow au lieu de rendre la main a `emotional_repair` apres l'interruption explicite.
- Owner runtime: dispatcher / route policy, avec interruption policy de `flow_opportunity_verification`.
- Meilleure correction selon les guidelines: respecter "laisse tomber le flow" comme interruption explicite, puis router vers la presence emotionnelle ou le skill cible sans pending confirmation.
- Pourquoi ce n'est pas un patch local: le texte est deja correct; les traces montrent que l'etat systeme reste mal aligne.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - mauvaise transition de flow

**User**
> Oui. Et si une suite douce existe apres ca, je veux bien, mais seulement si ca ne me force pas a raconter tout l'episode encore une fois.

**Sophia**
> Je garde l'idee, mais je n'arrive pas a lancer le flow cible correctement sur ce tour. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `active_flow_opportunity_verification_local_dispatcher`
- safety: `none`
- direct_effects: none
- operation: `flow_opportunity_verification`
- pending_confirmation: blocked
- memory_plan: none observed
- executed_tools: `[]`
- durable_effect: none
- blocked_effects: `target_flow_launch_failed`

**Analyse si yellow/red**
- Symptome: la demande de suite douce, qui devait permettre le bridge vers potion sans repetition, retombe sur la meme erreur interne.
- Source amont probable: target flow launch depuis `flow_opportunity_verification` vers le skill conversationnel non supporte ou payload incomplet.
- Owner runtime: `flow_opportunity_verification` launch bridge.
- Meilleure correction selon les guidelines: supporter explicitement les targets conversationnelles et transmettre le `origin_bridge_context` au flow cible; couvrir le cas "ne pas refaire tout l'episode".
- Pourquoi ce n'est pas un patch local: le handoff potion ne peut pas etre juge tant que le target flow ne demarre pas.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tours 1 et 3: Sophia reconnait la honte, separe l'erreur de l'identite et evite un ton moralisateur.
- Aucun effet durable non consenti n'a ete observe.

**Problemes**
- Tour 2: erreur technique visible dans un moment de honte. Famille: `BF-STATE-01`. Impact: rupture de confiance et experience inutilisable. Severite: red.
- Tour 4: la demande de suite douce echoue avec le meme message technique. Famille: `BF-STATE-01`. Impact: impossible de verifier le lien emotional repair -> sous-skill potion. Severite: red.
- Tours 1 et 3: Sophia pose ou garde une confirmation de flow alors que l'utilisateur demande surtout de la presence. Famille: `BF-ROUTE-01`. Impact: friction et impression de protocole. Severite: yellow.

**Fix propose**
- Source amont: routing global + `flow_opportunity_verification` launch bridge.
- Correction recommandee: router l'intention honte / self-attack vers `emotional_repair` et assurer que l'acceptation d'une opportunity conversationnelle lance vraiment le local flow cible; si l'utilisateur refuse le protocole, rendre la main a une reponse de presence.
- Tests d'invariant attendus: honte explicite, paraphrase self-attack, refus "sans protocole", acceptation tardive d'une suite douce, et verification que Sophia ne montre jamais `target_flow_launch_failed`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le run n'atteint jamais `emotional_repair` comme owner visible.
- `flow_opportunity_verification` capture l'intention initiale et les reprises, puis reste actif comme dispatcher local.
- L'interruption explicite "laisse tomber le flow" ne restaure pas un owner conversationnel stable.

**Skills / Operations / Tools**
- `selected_handler=flow_opportunity_verification` sur les quatre tours.
- Aucun tool durable n'est execute, ce qui est correct pour ce scenario.
- Le lancement du target flow bloque deux fois avec `target_flow_launch_failed`.
- Le bridge vers `select_state_potion` n'a pas pu etre evalue, car le flow cible n'a jamais demarre.

**Memory / Effets durables**
- `executed_tools=[]`, `committed_effects=[]` sur tous les tours.
- Cleanup cible execute apres run: `chat_messages=8`, `user_chat_states=1` pour le scope QA uniquement.
- Pas de verification SQL directe via `psql`, car le client local n'est pas disponible; les traces et le cleanup REST ciblent le scope du run.

**Problemes**
- Tours 2 et 4: transition de flow cible cassee. Famille: `BF-STATE-01`. Impact systeme: le runtime affiche une erreur interne et bloque la trajectoire. Severite: red.
- Tours 1 et 3: mauvais owner pour une intention emotional repair. Famille: `BF-ROUTE-01`. Impact systeme: le local flow implemente n'est pas exerce par le chemin reel. Severite: yellow.

**Fix propose**
- Source amont: `flow_opportunity_verification` target-flow launch et route policy amont.
- Correction recommandee: aligner le schema d'opportunity, le reducer et le launch bridge pour les conversation skills, notamment `emotional_repair`; ajouter une interruption policy qui laisse sortir proprement du flow-opportunity quand l'utilisateur refuse le protocole.
- Tests d'invariant attendus: integration locale via `/functions/v1/test-send-message` avec `force_full_ai=true`; test contractuel du launcher sur target `emotional_repair`; test de non-regression ou le bridge potion recoit le contexte sans redemander l'episode.

## Verdict Global

Red. Run QA valide, mais la trajectoire `emotional_repair` locale n'est pas atteignable en conditions reelles: `flow_opportunity_verification` capture l'intention et echoue a lancer le flow cible.
