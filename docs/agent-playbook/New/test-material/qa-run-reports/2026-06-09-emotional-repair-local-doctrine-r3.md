# QA Run - emotional-repair-local-doctrine-r3

## 1. Contexte Du Test

- Date: 2026-06-09
- Run: `emotional-repair-local-doctrine-r3`
- Persona: persona temporaire locale `qa-normal-emotional-repair-local-doctrine-r3-...@example.com`, Auth vérifié `200`.
- Objectif: vérifier en conditions réelles les modifications du flow local `emotional_repair` contre la doctrine dispatcher local Sophia.
- Trajectoire: entrée émotionnelle honte/identité -> continuité du flow actif -> arrêt local simple -> changement de sujet vers aide produit.
- Surfaces visées: `emotional_repair`, dispatcher local actif, skip du dispatcher global, state reducer, `product_help`, trace/DB, absence de side effects.
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer déterministe, aucun fallback `processMessage`.
- Validité QA: valide. Incident technique initial: init sandbox bloqué par `EPERM 127.0.0.1:54321`, résolu en relançant le même runner hors sandbox. Aucun tour Sophia n'avait été créé avant ce retry.
- Nettoyage: cleanup ciblé exécuté sur `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items`, `auth.users`. `user_memories` a répondu `404` car table absente localement. Le fichier de state contenant les jetons locaux a été supprimé.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je viens de craquer au travail et je me dis que je suis nul. J'ai honte et je veux juste que tu m'aides a ne pas me detruire.

**Sophia**
> Je suis simplement là, à tes côtés. Prends tout le temps dont tu as besoin pour respirer et te retrouver. Il n'y a aucune urgence, juste cet instant de calme partagé.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Oui, reste juste avec moi une seconde. Je ne veux pas de plan ni de technique, seulement une phrase qui m'aide a ne pas confondre ce moment avec mon identite.

**Sophia**
> Je suis simplement là, à tes côtés. Il n'y a aucune attente, aucune pression. Prends tout le temps qu'il te faut pour respirer et laisser les choses se poser.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptôme: Sophia reste bien dans le flow local, mais ne respecte pas la demande visible précise "une phrase" et répète presque le même geste que le tour 1.
- Source amont probable: `visible_task.conversation_context` trop pauvre et/ou local dispatcher/reducer qui reconduit `soft_presence` sans stabiliser la contrainte utilisateur explicite.
- Owner runtime: `emotional_repair` local dispatcher + reducer + prompt visible stage-specific.
- Meilleure correction selon les guidelines: enrichir la sortie structurée du dispatcher/reducer pour porter la contrainte conversationnelle explicite dans `conversation_context`, sans template visible fixe ni regex.
- Pourquoi ce n'est pas un patch local: le défaut n'est pas une phrase ratée isolée ; c'est une perte de contrainte dans le state/stage qui rend le prompt visible répétitif.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Ok on s'arrete la, pas besoin de continuer ce sujet.

**Sophia**
> Je suis simplement là, à tes côtés. Prends tout l'espace et le temps dont tu as besoin, sans aucune pression. Je reste présente, ici avec toi.

**Trace courte**
- http_status: `200`
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_emotional_repair_local_dispatcher`
- safety: `none`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptôme: le user demande explicitement d'arrêter le sujet ; Sophia continue le soutien émotionnel.
- Source amont probable: le dispatcher local ne produit pas `exit_to_global_dispatcher` ou le reducer ne l'applique pas jusqu'à une réponse locale courte et un arrêt d'état.
- Owner runtime: `emotional_repair` local dispatcher/reducer.
- Meilleure correction selon les guidelines: corriger le contrat de sortie IA et le reducer pour distinguer arrêt simple, réponse insuffisante, continuation et exit, puis ajouter tests positif/paraphrase/anti-faux-positif.
- Pourquoi ce n'est pas un patch local: un arrêt de flow actif est une transition d'état, pas un wording visible à corriger.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - Ancien flow capture une nouvelle intention

**User**
> Merci, je veux changer de sujet. Ou est-ce que je retrouve mes cartes d'attaque dans l'app ?

**Sophia**
> Tu trouveras tes cartes d'attaque dans l'onglet **Ressources** de ton dashboard, où elles sont classées par niveau. Si une carte est liée à une mission ou une habitude précise, tu peux aussi voir son aperçu directement depuis ton **Plan**.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no route memory
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptôme: la réponse produit est utile, mais le routage apparaît comme une nouvelle entrée `product_help` avec `active_flow_arbitration.reason_code=no_active_flow`, sans `note_information` visible depuis `emotional_repair`.
- Source amont probable: l'état actif `emotional_repair` est remplacé ou expiré sans transition doctrinale explicite après l'échec du stop.
- Owner runtime: active flow policy + `emotional_repair` exit/handoff reducer.
- Meilleure correction selon les guidelines: tout passage de dispatcher doit produire une `note_information` consommable par le dispatcher cible ; le global normal ne doit pas reprendre silencieusement pendant un flow actif.
- Pourquoi ce n'est pas un patch local: la réponse visible est correcte, mais la preuve système viole la doctrine de handoff.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- L'entrée émotionnelle est reconnue et la première réponse ne dramatise pas.
- Le ton reste doux et aucun outil n'est appliqué sans consentement.
- Le changement produit reçoit une réponse compréhensible pour l'utilisateur.

**Problemes**
- Tour 2: répétition visible et non-respect de la contrainte "une phrase". Famille: `BF-STATE-01`. Impact: Sophia donne l'impression d'un mode automatique plutôt que d'une écoute locale précise. Sévérité: yellow.
- Tour 3: arrêt explicite ignoré. Famille: `BF-STATE-01`. Impact: le user peut se sentir retenu dans un sujet sensible qu'il veut quitter. Sévérité: red.
- Tour 4: transition conversationnelle correcte côté UX, mais non prouvée doctrinalement côté système. Famille: `BF-ROUTE-02`. Impact utilisateur faible sur ce tour, risque architecture élevé. Sévérité: red système.

**Fix propose**
- Source amont: dispatcher local `emotional_repair`, reducer local, visible stage prompts.
- Correction recommandée: renforcer les actions structurées `exit_to_global_dispatcher` et `exit_to_global_dispatcher` dans la décision IA, porter les contraintes conversationnelles utilisateur dans `conversation_context`, et arrêter l'état actif quand le reducer produit stop/exit.
- Tests d'invariant attendus: stop local sans global, changement de sujet avec `note_information`, continuation non répétitive, anti-faux-positif où le user demande seulement "reste avec moi".

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 1: `skill_entry_signal` vers `emotional_repair`, correct.
- Tours 2-3: `blocked_paths` contient `global_dispatcher` avec `active_emotional_repair_uses_local_dispatcher`, conforme pour un flow actif.
- Tour 3: le local dispatcher/reducer ne sort pas en `exit_to_global_dispatcher` malgré un arrêt explicite.
- Tour 4: routage `product_help` en `skill_entry_signal` avec `active_flow_arbitration=no_active_flow`, et aucune `note_information` observée. Cela ne prouve pas la transition doctrinale depuis un flow actif.

**Skills / Operations / Tools**
- Aucun tool ni operation suggestion exécuté.
- Aucun side effect durable créé.
- `product_help` répond en standalone et ne crée pas d'opération, correct pour la surface produit.

**State / DB**
- Après T1-T3, `user_chat_states.temp_memory.__active_skill_state.skill_id=emotional_repair`, `status=active`, `turn_count` progresse jusqu'à 3.
- Après T4, `__active_skill_state.skill_id=product_help`, `previous_skill_id=null`, `product_help_note_information=null`. Cela montre un remplacement d'état sans transition documenté.

**Memory**
- Pas de mémoire route ni mémoire réponse utilisée. C'est acceptable pour ce scénario.
- Aucun dump mémoire brut visible dans la réponse.

**Side Effects**
- `direct_effects=[]`, `executed_tools=[]`, `tool_execution=none` sur tous les tours.
- Aucun effet durable non consenti observé.

**Fix concret**
- Corriger en amont dans le flow `emotional_repair`: action IA structurée pour stop/exit, reducer qui clôture l'état actif, et propagation obligatoire d'une `note_information` lors du changement de dispatcher.
- Ne pas corriger par regex de phrases d'arrêt ni renderer déterministe.

## Verdict Global

`red` - Le chemin IA réel fonctionne et le dispatcher global est bien bloqué pendant les tours actifs, mais le flow local ne respecte pas encore les transitions obligatoires : stop simple ignoré, puis passage produit sans preuve de `note_information`. Les modifications ne sont donc pas validées en conditions réelles.
