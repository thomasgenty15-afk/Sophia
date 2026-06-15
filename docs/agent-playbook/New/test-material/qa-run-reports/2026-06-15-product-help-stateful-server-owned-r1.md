# QA Run Report - product-help-stateful-server-owned-r1

## 1. Contexte Du Test

- Date: 2026-06-15
- Run: `product_help_stateful_server_owned_20260615_r1`
- Persona: `qa-skill`, connexion temporaire `product_help_product_help_stateful_server_owned_20260615_r1`, user local `31427658-4bed-43e9-b80e-41f69ed763d0`
- Objectif: verifier en conditions reelles locales que `product_help` reste non-mutant, ne capture pas durablement la suite, repond en inline sans ecraser un flow parent, et expose l'audit server-owned.
- Trajectoire: question produit -> demande operationnelle carte d'attaque -> question produit inline pendant flow actif -> reprise parent -> correction technique -> confirmation -> changement de sujet produit.
- Surfaces visees: dispatcher global, `product_help`, `prepare_attack_card`, handoff local, inline product help, reducer state/audit, active state/temp memory, effets durables.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, pas de renderer deterministe, pas de fallback direct `processMessage`.
- Validite QA: valide. Incident technique initial: premiere invocation Node locale invalide avant appel HTTP; retry effectue sans tour Sophia cree. Supabase local signale certains services annexes arretes (`imgproxy`, `analytics`, `vector`, `pooler`), mais les Edge Functions et PostgREST ont repondu `200`.
- Raw/summaries: `tests/real-personas/qa-skill/runs/product_help/product_help_stateful_server_owned_20260615_r1.t*.raw.json` et `.summary.json`
- Cleanup: effectue via `scripts/qa-cleanup-run-connection.sh qa-skill product_help_product_help_stateful_server_owned_20260615_r1`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Dans Sophia, c'est quoi la différence entre une carte d'attaque et une carte de défense ?

**Sophia**
> C'est assez simple : la carte d'attaque t'aide à réduire la friction avant de commencer (comment je m'y mets ?), alors que la carte de défense te protège contre un piège ou une impulsion sur le moment (comment je ne déraille pas ?). L'une prépare le terrain, l'autre assure tes arrières. Est-ce que l'un de ces deux besoins te parle plus qu'un autre en ce moment ?

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- flow_action: `compare_features`
- visible_task: `compare_features`
- durable_effect: none
- state_mutation_audit: present, no rejected changes

### Tour 2

**Verdict du tour:** green

**User**
> Oui, là j'ai besoin que tu me prépares une carte d'attaque pour ranger mes papiers demain matin, en version 10 minutes.

**Sophia**
> C'est une excellente cible pour demain matin. D'après toi, qu'est-ce qui risque de te faire dérailler ou de te freiner au moment de t'y mettre ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `tool_skill_intent_start`
- operation: `prepare_attack_card`
- active target: `ranger mes papiers demain matin (version 10 minutes)`
- durable_effect: none
- state_mutation_audit: present on `prepare_attack_card`, no rejected changes

### Tour 3

**Verdict du tour:** green

**User**
> Avant de répondre au piège : une carte d'attaque comme ça, ça modifie mon Plan ou c'est juste une aide à part ?

**Sophia**
> C'est une aide à part. La carte d'attaque ne modifie pas ton Plan : elle sert simplement à rendre le démarrage plus facile et moins coûteux. Une fois prête, tu la retrouveras rangée dans tes Ressources.

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- flow_action parent: `get_info_product`
- subskill_run: `product_help`, `mode=inline`, `status=complete`
- preserve_active_flow: `true`
- product_help audit: `cleared_fields=["product_help_local_state"]`, no rejected changes
- parent audit: `preserved_fields` include target/blocker/technique state; `rejected_changes=[target_state blocked_by_constraint]`
- durable_effect: none

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-02 - Extraction trop large ou polluee

**User**
> Le piège, c'est que je vais vouloir tout trier parfaitement et ça va me bloquer dès la première pile.

**Sophia**
> Je suis ravie de t'aider à **ranger mes papiers demain matin (version 10 minutes)** sans te laisser piéger par l'envie de **vouloir tout trier parfaitement et ça va me bloquer dès la première pile**. Est-ce que **Le texte magique** te semble être la bonne technique pour tes **Cartes d'attaque** ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- target_state: preserved, locked
- blocker_state: locked with user blocker
- technique_state: proposed `texte_recadrage`
- subskill_history: preserved
- durable_effect: none

**Analyse si yellow/red**
- Symptome: formulation visible maladroite et trop litterale; Sophia reprend le contenu utilisateur comme si c'etait son propre objet ("mes papiers") et incorpore une phrase longue de blocker en gras.
- Source amont probable: visible context / visible agent de `prepare_attack_card`, pas `product_help`.
- Owner runtime: `prepare_attack_card` visible stage `ask_or_confirm_technique`.
- Meilleure correction selon les guidelines: normaliser le point de vue et resumer les slots visibles avant rendu, sans changer le routing ni ajouter de regex.
- Pourquoi ce n'est pas un patch local product_help: l'inline product_help a rendu la main correctement au parent; la friction apparait dans le message visible du parent.

### Tour 5

**Verdict du tour:** green

**User**
> Pas trop le texte magique. Je préfère une carte avec un premier geste très concret : poser trois papiers sur la table, pas plus.

**Sophia**
> Je suis ravie de voir que tu as déjà une idée concrète en tête. Pour ton geste de poser ces trois papiers sur la table, la technique Preparer le terrain me semble idéale. Est-ce que ça te convient ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- flow_action: `choose_technique`
- technique_state: changed from `texte_recadrage` to `preparer_terrain`
- target_state: preserved
- blocker_state: preserved
- subskill_history: preserved
- durable_effect: none

### Tour 6

**Verdict du tour:** green

**User**
> Oui, ça me convient. Garde ce premier geste de trois papiers, et surtout pas plus.

**Sophia**
> C'est entendu pour les trois papiers. Pour que tout soit fluide, qu'est-ce qui devrait déjà être prêt autour de toi quand le moment sera venu ?

**Trace courte**
- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_prepare_attack_card_local_dispatcher`
- technique_state: locked `preparer_terrain`
- locked_fields: `action_to_simplify=ranger mes papiers`, `prep_in_advance=poser trois papiers sur la table, pas plus`
- current_field: `ready_environment`
- durable_effect: none

### Tour 7

**Verdict du tour:** green

**User**
> Finalement laisse tomber la carte pour l'instant. Dis-moi plutôt où je retrouve les rappels récurrents dans Sophia.

**Sophia**
> Entendu, on laisse la carte de côté. Tu retrouveras tes rappels récurrents (que j'appelle des **Initiatives**) dans ton **Dashboard**, sous l'onglet **Initiatives**. C'est là que tu peux les consulter, les modifier ou en créer de nouveaux.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- flow_action: `answer_destination`
- mode: `inline`
- state_mutation_audit: `cleared_fields=["product_help_local_state"]`, no rejected changes
- DB post-tour: `active_skill_id=null`, no active flow left
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le passage question produit -> tool flow est naturel.
- La question produit pendant la carte d'attaque est traitee sans casser la carte en cours.
- La reprise du parent apres l'inline est comprehensible.
- La correction de technique au tour 5 est acceptee naturellement.
- Le changement de sujet au tour 7 sort proprement du flow actif.

**Problemes**
- Tour 4: Sophia reprend les slots de facon trop litterale et avec mauvais point de vue ("mes papiers" dans la bouche de Sophia). Famille: BF-INTAKE-02. Impact: friction UX faible a moyenne; le systeme reste correct mais le message est moins humain.
- Tour 5: "Je suis ravie" est un peu excessif, mais n'affecte pas le routage ni l'etat. Impact faible.

**Fix propose**
- Source amont: visible agent / conversation_context de `prepare_attack_card`, stage `ask_or_confirm_technique`.
- Correction recommandee: fournir au visible agent des slots deja reformules en point de vue utilisateur neutre et des resumes courts, afin d'eviter le copier-coller de valeurs longues.
- Tests d'invariant attendus: reprise de blocker long -> rendu court, pas de changement de pronom, correction technique toujours acceptee.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1 route correctement vers `product_help`.
- T2 route correctement vers `prepare_attack_card` au lieu de rester en Product Help.
- T3 reste owner `prepare_attack_card`, appelle `product_help` en inline, puis conserve le parent.
- T7 laisse le flow actif et repond en `product_help`; verification DB post-tour: aucun active skill restant.

**Skills / Operations / Tools**
- `product_help` reste non-mutant.
- `prepare_attack_card` collecte les slots sans executer d'effet durable.
- Inline Product Help produit `subskill_run` et conserve `subskill_history`.
- Les audits de mutation sont presents sur Product Help et Prepare Attack Card.

**Memory / Effets durables**
- Aucun `direct_effect`.
- Aucun `requested_effects`, `allowed_effects` ou `committed_effects` durable dans les tours observes.
- Cleanup cible de la connexion temporaire effectue.

**Problemes**
- Aucun probleme systeme bloquant observe.
- Warning systeme faible: `supabase status` signale des services annexes arretes (`imgproxy`, `analytics`, `vector`, `pooler`), sans impact observe sur ce run.

**Fix propose**
- Pas de fix Product Help requis sur ce run.
- Fix UX parent a traiter dans `prepare_attack_card` visible stage, voir bug sheet associee.

## Verdict Global

- Verdict: yellow
- Raison principale: systeme Product Help / server-owned / inline parent valide en conditions IA reelles, mais une friction visible parent `prepare_attack_card` reste observee au Tour 4.
- Follow-up prioritaire: corriger le rendu visible `prepare_attack_card` pour reformuler les slots longs et eviter les inversions de point de vue.
