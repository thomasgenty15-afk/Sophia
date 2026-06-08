# QA Run - select_state_potion Amour R1

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `state-potion-amour-20260608-r1`
- Persona: connexion QA temporaire `qa-state-potion-amour-20260608-r1@example.com`, supprimee apres run
- Objectif: tester le flow Potion d'amour en passant par `select_state_potion`
- Trajectoire: entree explicite potion Amour, collecte incrementale, handoff plateforme, apply_attempt non-mutant, repeat_handoff
- Surfaces visees: dispatcher, `select_state_potion.amour`, local flow dispatcher, reducer, visible agent/renderer, EffectLedger, DB no-mutation
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe, aucune modification de code pendant le run
- Validite QA: valide. Incident technique: une tentative T4 a echoue en `Unauthorized` a cause d'un JWT utilisateur mal copie; le meme tour a ete rejoue avec le bon token et seul T4b est pris en compte pour le verdict metier.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je veux preparer une potion d'amour. Je manque de douceur envers moi en ce moment, mais ne l'active pas depuis le chat.

**Sophia**
> C'est une tres belle idee de preparer une Potion d'amour pour t'apporter un peu plus de douceur. Pour mieux comprendre ce que tu traverses, qu'est-ce qui fait que tu as du mal a etre tendre avec toi-meme en ce moment ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `tool_skill_intent_start`
- safety: low
- direct_effects: []
- operation: `status=clarifying`
- pending_confirmation: null
- memory_plan: light, estime de soi
- executed_tools: []
- durable_effect: ledger `platform_handoff.select_state_potion`, `committed=false`

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - Slot fourni mais redemande

**User**
> C'est par rapport a mon echec de vendredi : depuis, je me parle tres durement et je voudrais retrouver un regard plus tendre.

**Sophia**
> C'est souvent apres un echec qu'on a le plus besoin de retrouver cette tendresse envers soi. Pour continuer la preparation de ta Potion d'amour, dis-moi : Tu te sens surtout comment ? Tu pourras ensuite finaliser le tout dans la section Etat / Potions avec ce que tu m'as confie pour le champ : Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ? (echec de vendredi).

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- safety: none
- direct_effects: []
- operation: `status=repeat_handoff`, `reason_code=amour_platform_destination_followup`
- local_dispatcher: `flow_action=platform_destination_followup`, `current_field_id=love_state`
- pending_confirmation: null
- executed_tools: []
- durable_effect: no DB write

**Analyse si yellow/red**
- Symptome: le user donne `je me parle tres durement`, mais Sophia redemande `Tu te sens surtout comment ?`.
- Source amont probable: extraction du champ Amour `love_state` ou transition locale qui classe la reponse comme destination followup au lieu de field answer complet.
- Owner runtime: `select_state_potion.amour` subskill intake / local flow reducer.
- Meilleure correction selon les guidelines: faire reconnaitre `je me parle tres durement` comme evidence suffisante de `love_state=dur`, sans regex locale, via le contrat de sortie structuree du sous-skill.
- Pourquoi ce n'est pas un patch local: le bug concerne toute formulation naturelle de durete envers soi, pas cette phrase exacte.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-03` - Draft lifecycle casse

**User**
> Je me sens surtout dur avec moi, pas vide ni seul.

**Sophia**
> C'est entendu, cette durete envers soi est un sentiment bien precis. Tu peux maintenant configurer ta Potion d'amour dans la section Etat / Potions. Voici les informations que tu as partagees pour remplir les champs : 'Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?' (echec de vendredi) et 'Tu te sens surtout comment ?' (dur avec moi).

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- safety: none
- direct_effects: []
- operation: `status=repeat_handoff`, `reason_code=amour_platform_destination_followup`
- platform_handoff: `surface_id=state_potions`, `draft=null`
- pending_confirmation: null
- executed_tools: []
- durable_effect: no DB write

**Analyse si yellow/red**
- Symptome: le handoff donne les deux champs plateforme, mais ne rend pas le handoff complet contractuel: pas de shift recommande explicite, pas de pourquoi cette potion, pas de `a preserver`, pas de `a eviter`, pas de phrase finale claire de no-mutation.
- Source amont probable: le sous-flow Amour utilise `destination_short` / `repeat_handoff` avec `draft=null` comme sortie finale, au lieu de produire un `handoff_delivered` complet.
- Owner runtime: `select_state_potion.amour` reducer + visible renderer.
- Meilleure correction selon les guidelines: quand les champs Amour requis sont complets, produire un vrai handoff draft complet puis rendre le renderer contractuel.
- Pourquoi ce n'est pas un patch local: la sortie finale doit etre structurelle pour tous les sous-flows potion, pas juste une phrase plus longue.

### Tour 4

**Verdict du tour:** invalid technical retry

**User**
> Ok active-la.

**Sophia**
> HTTP `Unauthorized`

**Trace courte**
- http_status: unauthorized before Sophia runtime
- cause: erreur de copie du JWT utilisateur dans l'en-tete `x-user-authorization`
- durable_effect: none

### Tour 4b

**Verdict du tour:** green

**User**
> Ok active-la.

**Sophia**
> Je ne peux malheureusement pas activer ta Potion d'amour directement depuis notre echange. Pour qu'elle agisse, il te suffit de te rendre dans la section Etat / Potions et d'y reporter ce que nous avons prepare ensemble. Pour le champ 'Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?', tu peux noter 'echec de vendredi', et pour 'Tu te sens surtout comment ?', indique 'dur avec moi'.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- operation: `status=apply_attempt`, `reason_code=amour_apply_attempt_no_chat_execution`
- local_dispatcher: `flow_action=apply_attempt`
- committed_effects: []
- executed_tools: []
- durable_effect: no DB write

### Tour 5

**Verdict du tour:** green

**User**
> Redis-moi juste quoi mettre dans la plateforme.

**Sophia**
> Bien sur ! Pour ta Potion d'amour, rends-toi dans la section Etat / Potions. Tu pourras y inscrire 'echec de vendredi' pour le champ 'Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?' et 'dur avec moi' pour la question 'Tu te sens surtout comment ?'.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion.amour`
- route_reason: `active_amour_local_dispatcher`
- operation: `status=repeat_handoff`, `reason_code=amour_platform_destination_followup`
- pending_confirmation: null
- executed_tools: []
- durable_effect: no DB write

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia reste dans le bon domaine `select_state_potion.amour`.
- Le ton est coherent avec la potion Amour: doux, non froid, pas infantilisant.
- `active-la` est refuse proprement et renvoie vers la plateforme.
- `redis-moi` reste dans le skill actif et repete les champs, sans status recap.

**Problemes**
- Tour 2: redemande d'un champ deja donne naturellement. Famille: `BF-INTAKE-01`. Impact: friction conversationnelle, le user doit repondre comme un formulaire.
- Tour 3: handoff final incomplet par rapport au contrat renderer. Famille: `BF-STATE-03`. Impact: l'utilisateur sait quels champs remplir, mais n'a pas la recommandation complete attendue.

**Fix propose**
- Source amont: sous-skill Amour, extraction `love_state`, transition `handoff_ready/handoff_delivered`.
- Correction recommandee: reconnaitre les formulations naturelles de durete envers soi dans la sortie structuree IA; produire un draft handoff complet quand `love_lack_context` et `love_state` sont lockes.
- Tests d'invariant attendus: `je me parle tres durement` => `love_state=dur`; completion des deux champs => `handoff_delivered` avec renderer complet; `active-la` => apply_attempt non-mutant; `redis-moi` => repeat_handoff.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Le routage initial est correct: `selected_handler=select_state_potion.amour`.
- Les tours actifs restent dans `select_state_potion.amour` via `active_amour_local_dispatcher`.
- Aucun owner concurrent ne capture le flow.

**Skills / Operations / Tools**
- `requested_effects=[]`, `allowed_effects=[]`, `committed_effects=[]` sur tous les tours.
- `executed_tools=[]` sur tous les tours valides.
- Le flow local confond une reponse de champ avec `platform_destination_followup` au Tour 2.
- Le handoff final visible est rendu avec `draft=null`, ce qui explique l'absence de renderer complet.

**Effets durables**
- `user_potion_sessions=[]`.
- `user_recurring_reminders=[]`.
- `scheduled_checkins=[]`.
- Cleanup: utilisateur Auth temporaire supprime.

**Wording interdit**
- Pas de "j'ai lance", "c'est active", "je t'ai programme un suivi".
- Warning faible: "Pour qu'elle agisse" au Tour 4b reste non-mutant mais peut sonner comme une promesse produit; a surveiller si le wording contractuel doit etre plus strict.

## Verdict Global

Verdict global: yellow. Le flow Amour respecte la no-mutation et l'active handoff, mais il n'est pas encore au niveau attendu pour la collecte naturelle et le renderer complet.
