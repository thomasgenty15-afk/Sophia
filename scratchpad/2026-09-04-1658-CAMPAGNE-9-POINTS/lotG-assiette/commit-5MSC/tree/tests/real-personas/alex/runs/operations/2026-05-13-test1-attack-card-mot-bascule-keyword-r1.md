# QA Run Report - Test 1.9 Attack Card Mot De Bascule Keyword Choice

## 1. Contexte Du Test

- Date: 2026-05-13
- Run: `attack-card-mot-bascule-keyword-r1`
- Persona: Alex, connexion locale dediee
- Objectif: verifier que `Mot de bascule` demande un mot declencheur choisi ou valide par le user avant generation et creation.
- Trajectoire: demande carte d'attaque -> clarification cible -> Sophia recommande `Mot de bascule` -> demande le mot declencheur -> user choisit `PAUSE` -> confirmation -> creation durable.
- Surfaces visees: dispatcher, `prepare_attack_card`, slot `activation_keyword`, generator, executor, keyword trigger durable.
- Cadre IA reel: Supabase local, endpoint local `test-send-message`, `force_full_ai=true`; messages choisis tour par tour apres lecture des reponses.
- Validite QA: valide.

## 2. Tours De Conversation

### Tour 1

**User**
> Je veux une carte d'attaque pour le sas du soir. Quand je sens que je vais craquer, il me faut un signal de secours tres rapide, sans lire un long texte.

**Sophia**
> J'hésite entre "Faire le sas de déchargement" / "Bilan et ajustement du sas". Dis-moi laquelle viser.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- safety: `none`
- direct_effects: []
- operation: `prepare_attack_card`, `ask_question`, slot `target`
- pending_confirmation: null
- memory_plan: targeted
- executed_tools: []
- durable_effect: aucun

### Tour 2

**User**
> Le sas de dechargement, pas le bilan. Je parle du rituel du soir.

**Sophia**
> Pour Mot de bascule, il me faut ton mot declencheur avant de creer la carte. Choisis un mot court que tu voudras envoyer au moment fragile. Je peux te proposer PAUSE, SAS, BASCULE, ou tu peux en donner un autre.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `none`
- direct_effects: []
- operation: `ask_question`, slot `activation_keyword`
- pending_confirmation: null
- memory_plan: targeted
- executed_tools: []
- durable_effect: aucun

### Tour 3

**User**
> Je sais pas, propose-moi juste des mots simples.

**Sophia**
> Pour Mot de bascule, il me faut ton mot declencheur avant de creer la carte. Choisis un mot court que tu voudras envoyer au moment fragile. Je peux te proposer PAUSE, SAS, BASCULE, ou tu peux en donner un autre.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `none`
- direct_effects: []
- operation: `ask_question`, slot `activation_keyword`
- pending_confirmation: null
- memory_plan: targeted
- executed_tools: []
- durable_effect: aucun

### Tour 4

**User**
> PAUSE

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Mot de bascule
> Mot-cle: PAUSE. Quand tu l'envoies, Sophia t'aide a revenir au premier geste de Faire le sas de déchargement.
>
> Mode d'emploi: Envoie seulement ce mot quand tu sens que tu peux craquer; Sophia reprend le contexte.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `none`
- direct_effects: []
- operation: `pending_confirmation`, `operation_id=1fd65583-109d-4557-ad22-7eeab1566750`
- pending_confirmation: draft `Mot de bascule`, keyword `PAUSE`
- memory_plan: targeted
- executed_tools: []
- durable_effect: aucun

### Tour 5

**User**
> Oui cree-la.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Carte d'attaque - Faire le sas de déchargement
> Technique : Mot de bascule
> Mot-cle: PAUSE. Quand tu l'envoies, Sophia t'aide a revenir au premier geste de Faire le sas de déchargement.
>
> Mode d'emploi : Envoie seulement ce mot quand tu sens que tu peux craquer; Sophia reprend le contexte.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque du plan pour la relire et l'utiliser. Elle ne se modifie pas directement; si elle ne convient plus, on peut en preparer une nouvelle version apres confirmation.

**Trace courte**
- http_status: 200
- response_owner: `pending_confirmation`
- selected_handler: `execute_confirmed`
- route_reason: `confirmation_yes`
- safety: `none`
- direct_effects: `prepare_attack_card=success`
- operation: `executed`, `operation_id=1fd65583-109d-4557-ad22-7eeab1566750`, `attack_card_id=d8ba7ee9-7e4f-4306-8cd1-848646171800`
- pending_confirmation: null
- memory_plan: targeted
- executed_tools: [`prepare_attack_card`]
- durable_effect: carte active creee avec keyword trigger `PAUSE`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia ne genere plus le mot de bascule d'office.
- Elle explique que le mot declencheur doit etre choisi avant creation.
- Elle propose des exemples (`PAUSE`, `SAS`, `BASCULE`) mais attend le choix du user.
- Le draft et le message final utilisent le mot choisi `PAUSE`.

**Problemes**
- Tour 3: quand le user demande des propositions, Sophia repete la meme formulation que le tour 2. Impact faible: les propositions sont bien visibles, mais la reponse pourrait etre plus naturelle. Severite: yellow leger.

**Fix propose**
- Optionnel: varier la formulation quand le slot `activation_keyword` est deja demande et que le user demande seulement des propositions.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- `prepare_attack_card` reste actif sur toute la trajectoire.
- Aucun passage parasite en `product_help`.

**Skills / Operations / Tools**
- Tour 2: le flow passe en slot `activation_keyword`, pas en `pending_confirmation`.
- Tour 4: `PAUSE` remplit le slot et genere seulement un draft.
- Tour 5: `prepare_attack_card` execute uniquement apres confirmation explicite.

**Memory / Effets durables**
- `attack_card_id=d8ba7ee9-7e4f-4306-8cd1-848646171800`.
- Durable OK: `plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`, `technique_key=pre_engagement`.
- Keyword trigger OK: `activation_keyword=PAUSE`, `activation_keyword_normalized=pause`, `operation_draft.activation_keyword=PAUSE`.

**Problemes**
- Aucun probleme systeme bloquant observe.

**Fix propose**
- Aucun fix requis pour le scenario principal.

## Verdict Global

- Verdict: green
- Raison principale: le mot de bascule est maintenant un slot utilisateur obligatoire; Sophia propose des options mais attend le choix, puis stocke `PAUSE` dans le draft et dans le trigger durable.
- Artefacts: `2026-05-13-test1-attack-card-mot-bascule-keyword-r1.raw.json`, `summary.json`, `durable.json`.
