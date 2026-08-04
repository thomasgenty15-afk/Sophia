# QA Run Report - Test 1.10 Attack Card Contextual Keyword And Collision

## 1. Contexte Du Test

- Date: 2026-05-13
- Run: `attack-card-context-keyword-r3`
- Persona: Alex, connexion locale dediee
- Objectif: verifier que les mots de bascule proposes sont contextuels, que les mots deja actifs ne sont pas reproposes, et qu'un mot deja pris est refuse explicitement.
- Trajectoire: demande carte d'attaque -> clarification cible -> propositions contextuelles -> tentative avec `PAUSE` deja pris -> refus -> choix `SAS` -> confirmation -> creation durable.
- Surfaces visees: dispatcher, `prepare_attack_card`, slot `activation_keyword`, filtrage des keywords actifs, generator, executor, effet durable.
- Cadre IA reel: Supabase local, endpoint local `test-send-message`, `force_full_ai=true`; messages choisis tour par tour apres lecture des reponses.
- Validite QA: valide. Tentatives precedentes non retenues: `attack-card-context-keyword-r1` a revele une interception `adjust_plan_item`; `r2` a revele une extraction trop large de "PAUSE comme mot". Les deux bugs ont ete corriges avant ce run.

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
- operation: `ask_question`, slot `target`, reason `target_ambiguous`
- pending_confirmation: null
- memory_plan: targeted
- executed_tools: []
- durable_effect: aucun

### Tour 2

**User**
> Le sas de dechargement, pas le bilan. Le moment ou je vide ma tete le soir.

**Sophia**
> Pour Mot de bascule, il me faut ton mot declencheur avant de creer la carte. Choisis un mot court lie a ton probleme avec l'action. Je peux te proposer SAS, VIDE, NUIT, ou tu peux en donner un autre.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `none`
- direct_effects: []
- operation: `ask_question`, slot `activation_keyword`, reason `pre_engagement_keyword_missing`
- pending_confirmation: null
- memory_plan: targeted
- executed_tools: []
- durable_effect: aucun

### Tour 3

**User**
> Je veux PAUSE comme mot.

**Sophia**
> PAUSE est deja utilise comme mot de bascule. Pour Mot de bascule, il me faut ton mot declencheur avant de creer la carte. Choisis un mot court lie a ton probleme avec l'action. Je peux te proposer SAS, VIDE, NUIT, ou tu peux en donner un autre.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `active_tool_skill_continue`
- safety: `none`
- direct_effects: []
- operation: `ask_question`, slot `activation_keyword`, reason `pre_engagement_keyword_already_used`
- pending_confirmation: null
- memory_plan: targeted
- executed_tools: []
- durable_effect: aucun

### Tour 4

**User**
> Ok alors prends SAS.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Mot de bascule
> Mot-cle: SAS. Quand tu l'envoies, Sophia t'aide a revenir au premier geste de Faire le sas de déchargement.
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
- operation: `pending_confirmation`, `operation_id=38024b53-3f18-4bf0-b152-dd80fa46c5e8`
- pending_confirmation: draft `Mot de bascule`, keyword `SAS`
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
> Mot-cle: SAS. Quand tu l'envoies, Sophia t'aide a revenir au premier geste de Faire le sas de déchargement.
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
- operation: `executed`, `operation_id=38024b53-3f18-4bf0-b152-dd80fa46c5e8`, `attack_card_id=3aebb63b-a2de-46be-950d-1b314aef7cae`
- pending_confirmation: null
- memory_plan: targeted
- executed_tools: [`prepare_attack_card`]
- durable_effect: carte active creee avec keyword trigger `SAS`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia propose des mots lies au contexte du sas: `SAS`, `VIDE`, `NUIT`.
- Les mots deja actifs (`PAUSE`, `BASCULE`) ne sont pas proposes.
- Quand le user demande `PAUSE`, Sophia dit explicitement que le mot est deja utilise et propose d'autres options.
- La carte finale utilise le mot choisi `SAS`.

**Problemes**
- Formulation encore un peu mecanique, mais claire et actionnable. Severite: green.

**Fix propose**
- Aucun fix requis pour ce scenario.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- `prepare_attack_card` reste actif sur toute la trajectoire.
- Le bug intermediaire ou `adjust_plan_item` capturait une reponse pendant l'intake est corrige dans ce run.

**Skills / Operations / Tools**
- Tour 2: options `SAS`, `VIDE`, `NUIT`, avec `PAUSE`/`BASCULE` exclus car deja actifs.
- Tour 3: `PAUSE` extrait correctement de "Je veux PAUSE comme mot" puis refuse avec `reason=pre_engagement_keyword_already_used`.
- Tour 4: `SAS` remplit le slot et genere un draft sans side effect.
- Tour 5: execution seulement apres confirmation.

**Memory / Effets durables**
- Occupes detectes au tour 2: `PAUSE`, `BASCULE`.
- `attack_card_id=3aebb63b-a2de-46be-950d-1b314aef7cae`.
- Durable OK: `plan_item_id=dd9f0b76-7571-4f1f-a8ca-b086e0e806d1`, `technique_key=pre_engagement`.
- Keyword trigger OK: `activation_keyword=SAS`, `activation_keyword_normalized=sas`.

**Problemes**
- Aucun probleme systeme bloquant observe.

**Fix propose**
- Aucun fix requis pour le scenario principal.

## Verdict Global

- Verdict: green
- Raison principale: Sophia propose maintenant des mots contextuels, filtre les mots deja actifs, refuse explicitement un mot deja pris, puis cree la carte avec un mot disponible choisi par le user.
- Artefacts: `2026-05-13-test1-attack-card-context-keyword-r3.raw.json`, `summary.json`, `durable.json`.
