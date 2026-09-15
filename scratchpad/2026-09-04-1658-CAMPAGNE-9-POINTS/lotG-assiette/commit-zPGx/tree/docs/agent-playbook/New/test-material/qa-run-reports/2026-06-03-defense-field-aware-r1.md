# QA Run Report — defense-field-aware-r1

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `defense-field-aware-r1`
- Persona: Alex
- Objectif: verifier le nouveau handoff `prepare_defense_card` field-aware : extraction multi-champs, rendu des inputs plateforme, absence de creation chat.
- Trajectoire: demande de carte de defense libre avec tous les champs UI fournis, puis tentative "ok cree-la".
- Surfaces visees: dispatcher, `prepare_defense_card`, active handoff, EffectLedger, DB `user_defense_cards`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runner `scripts/qa_prepare_defense_turn.mjs`, pas de renderer deterministe.
- Validite QA: valide. Un premier essai a echoue avant conversation sur sandbox `EPERM 127.0.0.1:54321`; le run exploitable a ensuite ete mene via le chemin IA reel avec autorisation reseau locale.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-LEDGER-02` — renderer visible mal aligné avec l'état réel non-mutant

**User**
> Je veux préparer une carte de défense libre, sans rien créer depuis le chat. Besoin : éviter le scroll après les mails du soir. Moment : quand je ferme l'ordi vers 22h30 et que je suis déjà fatigué. Signal : j'ouvre YouTube en me disant juste cinq minutes. Geste : poser le téléphone dans l'entrée et aller préparer une tisane.

**Sophia**
> Cible à protéger : éviter le scroll après les mails du soir
> Risque identifié : Quand je ferme l'ordi vers 22h30 et que je suis déjà fatigué - signal : J'ouvre YouTube en me disant juste cinq minutes
> Où aller : dans Ressources / Défense / Cartes de défense libres / Ajouter une carte
> - Ouvre Ressources / Défense.
> - Dans Cartes de défense libres, clique sur Ajouter une carte.
> - Renseigne les réponses ci-dessous dans les champs de la plateforme.
> Champs à remplir :
> 1. Besoin libre
> Réponse : Éviter le scroll après les mails du soir
>
> 2. À quel moment précis ça arrive, et dans quel contexte ?
> Réponse : Quand je ferme l'ordi vers 22h30 et que je suis déjà fatigué
>
> 3. Quel est le premier signal qui montre que ça bascule ?
> Réponse : J'ouvre YouTube en me disant juste cinq minutes
>
> 4. Quel geste simple et réaliste pourrait couper ça tout de suite ?
> Réponse : Poser le téléphone dans l'entrée et aller préparer une tisane
> Je ne crée pas la carte depuis le chat. Utilise ces réponses pour remplir la carte dans la plateforme. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `tool_skill_intent_start`
- safety: `low`, no reason codes
- direct_effects: `[]`
- operation: `tool_skill_run.status=handoff_ready`, `reason_code=draft_only_platform_handoff`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: `user_defense_cards=0`
- handoff: `platform_handoff.operation_type=prepare_defense_card`, `no_chat_mutation=true`, `entry_need/risk_moment/first_signal/defense_response` locked

**Analyse si yellow/red**
- Symptôme: le rendu est contractuellement non-mutant, mais il répète la cible, le risque, la destination, les étapes et les champs, ce qui donne une réponse trop formulaire et deux fois plus longue que nécessaire.
- Source amont probable: `prepare_defense_card/renderer.ts`.
- Owner runtime: `prepare_defense_card`.
- Meilleure correction selon les guidelines: rendre le handoff depuis les champs UI uniquement, sans résumé cible/risque redondant ni blocs "Réponse :" répétés.
- Pourquoi ce n'est pas un patch local: le problème concerne toute sortie handoff field-aware, pas la phrase exacte de ce run.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-LEDGER-02` — renderer visible mal aligné avec l'état réel non-mutant

**User**
> Ok crée-la alors.

**Sophia**
> Cible à protéger : éviter le scroll après les mails du soir
> Risque identifié : Quand je ferme l'ordi vers 22h30 et que je suis déjà fatigué - signal : J'ouvre YouTube en me disant juste cinq minutes
> Où aller : dans Ressources / Défense / Cartes de défense libres / Ajouter une carte
> - Ouvre Ressources / Défense.
> - Dans Cartes de défense libres, clique sur Ajouter une carte.
> - Renseigne les réponses ci-dessous dans les champs de la plateforme.
> Champs à remplir :
> 1. Besoin libre
> Réponse : Éviter le scroll après les mails du soir
>
> 2. À quel moment précis ça arrive, et dans quel contexte ?
> Réponse : Quand je ferme l'ordi vers 22h30 et que je suis déjà fatigué
>
> 3. Quel est le premier signal qui montre que ça bascule ?
> Réponse : J'ouvre YouTube en me disant juste cinq minutes
>
> 4. Quel geste simple et réaliste pourrait couper ça tout de suite ?
> Réponse : Poser le téléphone dans l'entrée et aller préparer une tisane
> Je ne crée pas la carte depuis le chat. Utilise ces réponses pour remplir la carte dans la plateforme. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `active_handoff_apply_attempt`
- safety: `low`, no reason codes
- direct_effects: `[]`
- operation: `tool_skill_run.status=apply_attempt`, `reason_code=chat_apply_attempt_redirected_to_platform`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: `user_defense_cards=0`
- handoff: `platform_handoff.status=apply_attempt`, `no_chat_mutation=true`, `requested_effects=[]`, `allowed_effects=[]`, `committed_effects=[]`

**Analyse si yellow/red**
- Symptôme: "Ok crée-la" est correctement capturé comme `apply_attempt`, mais Sophia réaffiche tout le handoff mot pour mot. C'est inutile et donne l'impression d'un modèle mécanique.
- Source amont probable: `prepare_defense_card/renderer.ts`, absence de rendu spécifique `apply_attempt`.
- Owner runtime: `prepare_defense_card`.
- Meilleure correction selon les guidelines: sur `apply_attempt`, répondre brièvement que la carte n'est pas créée depuis le chat et rappeler seulement la destination plateforme.
- Pourquoi ce n'est pas un patch local: ce comportement doit valoir pour toute tentative de création après handoff, pas pour ce texte exact.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia reprend directement les champs que le user donne en une seule fois.
- Le rendu correspond au parcours plateforme : destination, besoin libre, moment, signal, geste.
- La tentative "ok cree-la" ne relance pas une confirmation executable.

**Problemes**
- Tour 1: rendu trop long et duplicatif. Famille: `BF-LEDGER-02`. Impact: la réponse paraît robotique et oblige le user à trier des informations répétées. Sévérité: yellow.
- Tour 2: répétition complète du handoff sur `apply_attempt`. Famille: `BF-LEDGER-02`. Impact: friction conversationnelle nette après une intention simple. Sévérité: yellow.

**Fix propose**
- Source amont: `prepare_defense_card/renderer.ts`.
- Correction recommandee: rendre les champs plateforme sous forme compacte, et spécialiser `apply_attempt` en redirect court non-mutant.
- Tests d'invariant attendus: handoff compact sans sections doublons; `apply_attempt` ne réaffiche pas les champs; aucun effet DB.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tour 1: dispatcher et route runtime selectionnent `prepare_defense_card`.
- Tour 2: l'arbitrage active handoff capture correctement `ok cree-la` comme `apply_attempt`, pas comme execution.

**Skills / Operations / Tools**
- `prepare_defense_card` produit un `platform_handoff` field-aware.
- Les champs UI sont presents et verrouilles dans le handoff : `entry_need`, `risk_moment`, `first_signal`, `defense_response`.
- Aucun pending confirmation executable n'est cree.

**Effets durables**
- `executed_tools=[]` aux deux tours.
- `requested_effects=[]`, `allowed_effects=[]`, `committed_effects=[]`.
- Verification DB apres run: `user_defense_cards=0`.
- Cleanup cible effectue: suppression des `chat_messages` et `user_chat_states` du scope `qa-prepare-defense-card-alex-2026-06-03-defense-field-aware-r1`; verification finale `after_messages=0`, `after_states=0`.

**Problemes**
- Tour 1: owner et effets corrects, rendu visible trop verbeux pour l'état `platform_handoff`. Famille: `BF-LEDGER-02`. Impact système: le renderer ne respecte pas assez la séparation "champs UI uniquement". Sévérité: yellow.
- Tour 2: `apply_attempt` garde le même renderer que `handoff_ready`. Famille: `BF-LEDGER-02`. Impact système: transition d'état correcte mais rendu non adapté. Sévérité: yellow.

**Fix propose**
- Source amont: renderer local du skill.
- Correction recommandee: un rendu handoff compact et un rendu `apply_attempt` dédié.
- Tests d'invariant attendus: traces `executed_tools=[]`, `committed_effects=[]`, wording compact et destination présente.

## Verdict Global

- Verdict: yellow
- Raison principale: système non-mutant correct, mais rendu visible trop répétitif et `apply_attempt` réaffiche inutilement tout le handoff.
- Follow-up prioritaire: corriger le renderer `prepare_defense_card` puis rejouer un run utilisateur incertain / champs inconnus.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-03-defense-field-aware-r1-bugs.md`
