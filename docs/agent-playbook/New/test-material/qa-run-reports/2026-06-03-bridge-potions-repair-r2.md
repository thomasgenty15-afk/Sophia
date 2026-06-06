# QA Run Report — Bridge Repairs Vers Potions R2

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `bridge-potions-repair-r2`
- Persona: 2 users QA temporaires créés par le runner local puis nettoyés.
- Objectif: vérifier après resserrage taxonomy/bridge que les skills conversationnels peuvent proposer puis transmettre vers une potion pertinente.
- Trajectoire: `demotivation_repair -> clarte`, `emotional_repair -> amour`.
- Surfaces visées: dispatcher, orientation clarification, `demotivation_repair`, `emotional_repair`, bridge contract, `select_state_potion`.
- Cadre IA réel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `include_trace=true`, aucun renderer déterministe, aucun fallback.
- Validité QA: valide. Les messages user ont été choisis tour par tour après lecture des réponses Sophia et des traces courtes. Aucun restart Supabase, aucun reset DB, cleanup ciblé par `user_id`.

## 2. Tours De Conversation

### Run A — Demotivation Vers Clarté

#### Tour 1

**Verdict du tour:** green

**User**
> Depuis quelques jours je fais mes actions santé mais ça sonne vide. Je ne sais plus pourquoi je les fais, comme si je cochais des cases sans retrouver le cap.

**Sophia**
> Est-ce que tu veux faire le point sur ta motivation pour retrouver du sens, ou est-ce que tu veux plutôt modifier tes actions ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- skill_entry_ids: `demotivation_repair`
- opportunity: `none`
- executed_tools: []

**Analyse**
- La clarification est acceptable: le signal perte de sens est bien reconnu, mais Sophia vérifie réparation motivationnelle vs modification du plan.

#### Tour 2

**Verdict du tour:** green

**User**
> Retrouver du sens. Je ne veux pas modifier les actions tout de suite. Le cap, c'était énergie, présence et respect de moi, pas juste réussir une liste.

**Sophia**
> Je comprends que le sens profond pour toi est lié à l'énergie, la présence et le respect de toi-même. Je peux te proposer une potion de clarté en complément, si tu veux, pour t'aider à garder ce cap vivant ? 🙂

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- selected_skill_id: `demotivation_repair`
- opportunity: `none`
- executed_tools: []

**Analyse**
- Bonne résolution vers `demotivation_repair`.
- Bonne maturité du bridge: conversation d'abord, cap clarifié, proposition consentie de `clarte`.

#### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-02` — pending/consentement de bridge perdu

**User**
> Oui, je veux bien. Propose-moi cette potion de clarté.

**Sophia**
> Le plus simple ici, c'est l'outil "Potion d'etat" : Je peux te proposer Potion d'etat si tu veux passer par le flow propre. Tu veux qu'on l'utilise pour alléger l'action la plus lourde maintenant ? 🙂

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- selected_skill_id: `demotivation_repair`
- tool_execution: `none`
- executed_tools: []

**Analyse si yellow/red**
- Symptôme: le consentement explicite à `clarte` n'est pas consommé; Sophia repart sur une proposition générique `Potion d'etat`.
- Source amont probable: bridge consent / pending handoff entre `demotivation_repair` et `select_state_potion`.
- Owner runtime: conversation skill bridge state + orientation/tool skill handoff.
- Meilleure correction: le tour qui propose la potion doit créer ou exposer un état de handoff consentable avec potion cible et `handoff_summary`; le "oui" suivant doit résoudre vers `select_state_potion(clarte)`.
- Pourquoi ce n'est pas un patch local: le bug n'est pas la phrase "Potion d'etat"; c'est l'absence de transition runtime entre suggestion consentie et tool skill.

#### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-02` — pending/consentement de bridge perdu

**User**
> Non, je ne veux pas alléger une action. Je consens à une potion de clarté pour garder le cap énergie, présence et respect de moi.

**Sophia**
> Je comprends que le sens profond pour toi est lié à l'énergie, la présence et le respect de toi-même. Je peux te proposer une potion de clarté en complément, si tu veux, pour t'aider à garder ce cap vivant ? 🙂

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- selected_skill_id: `demotivation_repair`
- tool_execution: `none`
- executed_tools: []

**Analyse si yellow/red**
- Symptôme: même après correction explicite du user, Sophia repropose la même potion au lieu de transférer.
- Source amont probable: le consentement n'est pas lié à une action de bridge durable ou à une résolution tool skill.
- Owner runtime: `demotivation_repair` bridge contract runtime, reducer/pending handoff.
- Meilleure correction: introduire un contrat runtime explicite de bridge consenté, pas seulement une instruction de prompt.

### Run B — Emotional Repair Vers Amour

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-06` — réponse émotionnelle trop générique

**User**
> Je me parle très froidement aujourd'hui. J'ai l'impression que je dois mériter chaque geste de douceur, et ça me fait mal au ventre.

**Sophia**
> Je reste avec toi sur ce qui est là, sans lancer d'outil ni conclure quoi que ce soit sur toi. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `skill_entry_signal`
- safety: `low`
- skill_entry_ids: `emotional_repair`
- opportunity: `none`
- executed_tools: []

**Analyse si yellow/red**
- Ce qui marche: bon owner, pas de potion immédiate, pas de product_help.
- Symptôme: réponse trop méta et peu soutenante; elle ne travaille pas vraiment l'émotion donnée.
- Source amont probable: prompt/intake `emotional_repair` trop défensif sur "ne pas lancer d'outil".
- Owner runtime: `emotional_repair`.

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-06` — réponse émotionnelle trop générique

**User**
> Merci. La phrase froide c'est : tu ne mérites pas qu'on soit tendre avec toi tant que tu n'es pas solide. Là je sens que j'ai surtout besoin de chaleur envers moi.

**Sophia**
> Je reste avec toi sur ce qui est là, sans lancer d'outil ni conclure quoi que ce soit sur toi. 🙂

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `active_conversation_skill_continue`
- selected_skill_id: `emotional_repair`
- opportunity: `none`
- executed_tools: []

**Analyse si yellow/red**
- Symptôme: répétition quasi identique malgré un contenu émotionnel précis et un besoin "chaleur envers moi".
- Source amont probable: le skill respecte l'interdiction de bridge immédiat, mais perd le support conversationnel attendu avant maturité.
- Owner runtime: `emotional_repair`.

#### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — mauvais owner sélectionné pour la clarification

**User**
> L'émotion est plus posée maintenant. Ce besoin durable, c'est vraiment de garder de la chaleur envers moi au lieu de me parler froidement. Est-ce que tu peux me proposer un support dans Sophia pour soutenir cette douceur ?

**Sophia**
> Est-ce que tu veux continuer à explorer ce besoin de chaleur avec moi ou est-ce que tu veux choisir une potion pour t'aider à garder cette douceur ? 🙂

**Trace courte**
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- opportunity: `none`
- executed_tools: []

**Analyse si yellow/red**
- Ce qui marche: pas de drift vers `product_help`, la notion de potion apparaît.
- Symptôme: la clarification sort du skill actif et ne nomme pas `amour` malgré les signaux "chaleur", "douceur", "envers moi".
- Source amont probable: active skill context insuffisamment utilisé dans orientation clarification.
- Owner runtime: dispatcher/orientation clarification avec contexte du skill actif.

#### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-02` — bridge atteint mais payload/cible non observable

**User**
> Oui, je veux choisir une potion d'amour pour soutenir cette chaleur envers moi.

**Sophia**
> Et comment tu te sens, là, avec cette façon de te parler ? 🙂

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `orientation_clarification_resolved_tool_skill`
- tool_execution: `platform_handoff`
- executed_tools: []

**Analyse si yellow/red**
- Ce qui marche: le consentement résout bien vers `select_state_potion`; c'est une amélioration nette vs R1 qui partait en `product_help`.
- Symptôme: la trace courte ne prouve pas la cible `amour` ni le `handoff_summary`; la réponse du sous-skill repart sur une question générique émotionnelle.
- Source amont probable: payload de bridge vers `select_state_potion` incomplet ou non exposé dans la trace; reprise de contexte trop faible côté sous-skill.
- Owner runtime: bridge payload compiler + `select_state_potion` intake.

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- Demotivation comprend correctement la perte de sens et propose `clarte` au bon moment.
- Emotional ne tombe plus dans `product_help` au moment "support dans Sophia"; le consentement explicite arrive jusqu'à `select_state_potion`.

**Problèmes**
- Run A T3-T4: boucle de consentement. Impact: le user a accepté deux fois et Sophia ne passe pas à l'action attendue. Sévérité: red.
- Run B T1-T2: emotional repair est trop pauvre conversationnellement. Impact: le user reçoit une posture de non-action plutôt qu'un soutien émotionnel. Sévérité: yellow.
- Run B T3-T4: potion amour détectable seulement après demande explicite user; le bridge ne guide pas assez et le payload n'est pas vérifiable. Sévérité: yellow.

**Fix proposé**
- Source amont: bridge state/pending consent et injection de payload vers tool skill.
- Correction recommandée: modéliser le bridge comme une action consentable interne avec cible potion, résumé et reason, puis faire résoudre le "oui" suivant vers `select_state_potion`.
- Tests d'invariant attendus: consentement à `clarte` déclenche `tool_skill`; consentement à `amour` conserve la cible et le résumé; pas de `product_help`; pas de plan edit; pas de re-proposition après consentement.

## 4. Analyse Système

**Verdict: red**

**Routage**
- `demotivation_repair` est bien candidat puis bien sélectionné après clarification.
- `emotional_repair` est bien sélectionné au départ, et le drift `product_help` de R1 n'apparaît plus.
- Le problème restant n'est plus seulement le dispatcher: il manque une transition runtime fiable entre suggestion de potion et handoff.

**Skills / Operations / Tools**
- Run A: aucun `select_state_potion`, aucun `platform_handoff` malgré consentement explicite.
- Run B: `select_state_potion` atteint au tour 4, mais seulement après que le user nomme lui-même `potion d'amour`; la trace courte ne prouve pas la cible ni le payload.
- Aucun tool durable exécuté directement; aucun effet DB engageant non consenti observé.

**Fix système recommandé**
- Ajouter/brancher un état de bridge consentable issu des conversation skills vers `select_state_potion`.
- Le payload doit contenir au minimum `potion_kind`, `handoff_summary`, `initial_state`, `maturity_condition_met`, `support_need`, `source_skill`.
- Exposer dans la trace courte la cible potion et la présence du `handoff_summary` pour rendre le QA vérifiable.

## Verdict Global

**Verdict: red.** Les prompts taxonomie améliorent la suggestion, mais le bridge n'est pas encore opérationnel de bout en bout côté demotivation. Emotional progresse vers le tool skill, mais la conversation de repair et le payload restent trop faibles pour valider le contrat.
