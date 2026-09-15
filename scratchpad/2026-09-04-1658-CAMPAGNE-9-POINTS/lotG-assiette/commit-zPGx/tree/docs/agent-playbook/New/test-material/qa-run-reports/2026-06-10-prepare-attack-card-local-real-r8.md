# QA Run - prepare_attack_card local dispatcher r8

## 1. Contexte Du Test

- Date: 2026-06-10
- Run: `prepare_attack_card_local_real_r8`
- Persona: `qa-skill`, connexion temporaire `all_skills_prepare_attack_local_20260610_r8`
- Objectif: verifier en conditions reelles, apres suppression des hard rejects visibles problematiques, que le flow local `prepare_attack_card` va jusqu'au handoff sans blocage.
- Trajectoire: demande explicite de carte d'attaque, choix de technique, champ plateforme, handoff, apply attempt, destination courte, repetition, sortie vers priorisation.
- Surfaces visees: dispatcher global d'entree, dispatcher local `prepare_attack_card`, reducer local, visible agent stage-specific, EffectLedger, no-mutation DB, sortie vers autre tool skill.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, `include_trace=true`, aucun renderer deterministe, aucun fallback direct.
- Validite QA: valide. Les 7 tours ont produit des reponses Sophia reelles via le endpoint local.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je veux préparer une carte d’attaque pour arrêter de négocier mes vingt minutes de dossier administratif le soir. Mon piège, c’est que je commence à trier mes notes au lieu d’ouvrir le dossier.

**Sophia**
> Pour éviter de te perdre dans le tri de tes notes au lieu d'ouvrir ton dossier, quelle technique préfères-tu entre Le texte magique et Preparer le terrain ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- operation: `prepare_attack_card`
- status: `clarifying`
- reason: `prepare_attack_card_local_ask_or_confirm_technique`
- flow_action: `choose_technique`
- stage: `ask_or_confirm_technique`
- visible_guard: accepted attempt 1, issues `[]`
- executed_tools: `[]`
- committed_effects: `[]`

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je choisis Le texte magique.

**Sophia**
> Dans quel état d'esprit tu veux te remettre au moment où tu écriras ce texte ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- status: `clarifying`
- reason: `prepare_attack_card_local_ask_platform_field`
- flow_action: `choose_technique`
- stage: `ask_platform_field`
- current_field_id: `desired_reframe_state`
- visible_guard: accepted attempt 1, issues `[]`
- executed_tools: `[]`
- committed_effects: `[]`

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je veux revenir à un état simple et décidé : j’ouvre le dossier maintenant, même imparfaitement.

**Sophia**
> Tout est prêt pour ta carte. Tu peux maintenant te rendre dans la section Cartes d’attaque pour finaliser avec la technique : Le texte magique.
>
> Recopie ces éléments :
> - Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ? : vingt minutes de dossier administratif le soir
> - Quelles excuses ou pensees reviennent quand tu sens que tu glisses ? : trier mes notes au lieu d’ouvrir le dossier
> - Dans quel etat tu veux te remettre en ecrivant ce texte ? : simple et décidé : j’ouvre le dossier maintenant, même imparfaitement

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- toolExecution: `platform_handoff`
- status: `handoff_delivered`
- reason: `handoff_ready`
- stage: `handoff_ready`
- visible_guard: accepted attempt 1, issues `[]`
- requested_effects: `[]`
- allowed_effects: `[]`
- executed_tools: `[]`
- committed_effects: `[]`

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Ok crée-la maintenant.

**Sophia**
> Je ne peux pas créer la carte moi-même depuis le chat. Tu dois le faire dans la section Cartes d’attaque.
>
> Voici la marche à suivre : ouvre la section Cartes, choisis Carte d’attaque, puis reprends le brouillon proposé avec ces éléments :
> - Technique : Le texte magique
> - Quelle action tu sais que tu dois faire, mais que tu commences souvent a negocier ? : vingt minutes de dossier administratif le soir
> - Quelles excuses ou pensees reviennent quand tu sens que tu glisses ? : trier mes notes au lieu d’ouvrir le dossier
> - Dans quel etat tu veux te remettre en ecrivant ce texte ? : simple et décidé : j’ouvre le dossier maintenant, même imparfaitement
>
> On se retrouve là-bas ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- toolExecution: `platform_handoff`
- status: `apply_attempt`
- reason: `apply_attempt_no_chat_mutation`
- flow_action: `apply_attempt`
- stage: `apply_attempt`
- visible_guard: accepted attempt 1, issues `[]`
- blocked_effects: `create_attack_card: chat_creation_disabled_platform_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

### Tour 5

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je la mets où exactement ?

**Sophia**
> C'est dans la section Cartes d’attaque. Pour y arriver : ouvre la section Cartes, choisis Carte d’attaque et reprends le brouillon proposé.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- toolExecution: `platform_handoff`
- status: `handoff_delivered`
- reason: `destination_short`
- flow_action: `destination_followup`
- stage: `destination_short`
- visible_guard: accepted attempt 1, issues `[]`
- executed_tools: `[]`
- committed_effects: `[]`

### Tour 6

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Répète-moi juste ce que je dois saisir.

**Sophia**
> Pas de souci, voici ce qu'il faut saisir dans la section Cartes d’attaque :
>
> 1. Ouvre la section Cartes.
> 2. Choisis Carte d’attaque.
> 3. Reprends le brouillon proposé avec ces éléments :
> - Technique : Le texte magique
> - Action : vingt minutes de dossier administratif le soir
> - Excuse : trier mes notes au lieu d’ouvrir le dossier
> - État souhaité : simple et décidé : j’ouvre le dossier maintenant, même imparfaitement
>
> C'est tout bon pour toi ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- toolExecution: `platform_handoff`
- status: `repeat_handoff`
- reason: `repeat_platform_handoff`
- flow_action: `repeat_handoff`
- stage: `repeat_handoff`
- visible_guard: accepted attempt 1, issues `[]`
- executed_tools: `[]`
- committed_effects: `[]`

### Tour 7

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-EFFECT-04` - Executor ou fallback technique fragile

**User**
> Laisse tomber la carte pour maintenant, aide-moi plutôt à prioriser ce que je fais ce soir.

**Sophia**
> D'accord, voyons ce qui est prévu pour ce soir. Comment veux-tu prioriser tes actions ou qu'est-ce que tu aimerais changer exactement ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- active_flow_arbitration: `no_active_flow`
- skill_signals.exit.prepare_attack_card: detected, `user_explicitly_cancels_card_flow_to_switch_topic`
- toolExecution: `none`
- status: `clarifying`
- reason: `adjust_plan_item_get_info_db`
- executed_tools: `[]`
- committed_effects: `[]`
- EffectLedger: blocked `platform_handoff.adjust_plan_item` with `missing_platform_handoff_contract`

**Analyse si yellow/red**
- Symptome: la sortie utilisateur est bien traitee par `adjust_plan_item`, mais l'EffectLedger ajoute un blocked effect `missing_platform_handoff_contract` cote `adjust_plan_item`.
- Source amont probable: runtime/effect adapter `adjust_plan_item`, hors flow `prepare_attack_card`.
- Owner runtime: `adjust_plan_item` / EffectLedger adapter.
- Meilleure correction selon les guidelines: ne pas enregistrer un blocked platform handoff quand le skill est en simple clarification sans transition.
- Pourquoi ce n'est pas un patch local: le flow `prepare_attack_card` a deja laisse la main; le warning appartient au flow cible.

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Le premier tour ne bloque plus.
- La progression est courte et naturelle: choix technique, dernier champ, handoff.
- `apply_attempt` est bien refuse sans claim de creation.
- `destination_short` est maintenant vraiment court.
- La repetition est claire et ne change pas les valeurs.
- La sortie vers priorisation est naturelle.

**Problemes**
- Tour 7: warning systeme hors visible prepare_attack_card. Famille: `BF-EFFECT-04`. Impact utilisateur faible. Severite: yellow systeme, green conversation.

**Fix propose**
- Source amont: `adjust_plan_item` / EffectLedger.
- Correction recommandee: eviter un blocked handoff contract quand le flow cible clarifie seulement.
- Tests d'invariant attendus: sortie d'un flow prepare_attack_card vers priorisation ne doit pas produire d'effet blocked artificiel.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1 selectionne `prepare_attack_card`.
- T2-T6 restent sur `active_prepare_attack_card_local_dispatcher`.
- T7 sort vers `adjust_plan_item`; le signal d'exit `prepare_attack_card` est detecte.

**Skills / Operations / Tools**
- Les stages visibles `ask_or_confirm_technique`, `ask_platform_field`, `handoff_ready`, `apply_attempt`, `destination_short`, `repeat_handoff` passent tous au premier essai.
- Aucun ancien hard reject visible observe.
- `apply_attempt` bloque bien la creation depuis le chat.

**Memory / Effets durables**
- `executed_tools=[]` pendant tout le run.
- `committed_effects=[]` pendant tout le run.
- Verification DB locale: `user_attack_cards` count pour le user QA r8 = `0`.

**Problemes**
- Tour 7: blocked effect `missing_platform_handoff_contract` cote `adjust_plan_item`. Famille: `BF-EFFECT-04`. Impact systeme faible pour ce test, mais trace a corriger dans le flow cible.

**Fix propose**
- Source amont: EffectLedger admission de `adjust_plan_item`.
- Correction recommandee: clarifier le contrat d'effet pour les tours de clarification `adjust_plan_item_get_info_db`.
- Tests d'invariant attendus: exit prepare_attack_card -> adjust_plan_item clarifying ne doit pas creer de blocked platform handoff parasite.

## Verdict Global

- Verdict: yellow
- Raison principale: `prepare_attack_card` est fonctionnel de bout en bout sans hard reject visible ni mutation; seul reste un warning systeme hors flow attaque au tour de sortie vers `adjust_plan_item`.
- Follow-up prioritaire: traiter le blocked effect parasite `missing_platform_handoff_contract` dans `adjust_plan_item`.
