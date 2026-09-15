# Bug sheet - product_help_stateful_server_owned_20260615_r1

## R1-B01 - Formulation visible trop littérale dans Prepare Attack Card

- **Tours concernés** : T4
- **Famille** : BF-INTAKE-02
- **Owner probable** : `prepare_attack_card`
- **Statut** : open

### Symptôme

Après le retour depuis une question Product Help inline, le flow `prepare_attack_card` reprend correctement, mais la réponse visible reformule les slots de façon trop littérale :

- Sophia dit `ranger mes papiers` comme si c'était son propre objectif ;
- le blocage utilisateur est repris en entier, sans synthèse ;
- la phrase générée est peu naturelle : `Je suis ravie de t'aider...`.

### Preuve système

Trace T4 :

- `response_owner`: `tool_skill`
- `selected_handler`: `prepare_attack_card`
- `route_reason`: `active_prepare_attack_card_local_dispatcher`
- `flow_action`: `confirm_technique_proposal`
- `visible_task.kind`: `ask_or_confirm_technique`
- durable effect: aucun

Le problème n'est pas Product Help : le parent `prepare_attack_card` est bien repris, l'état critique est conservé, et aucun effet durable faux n'est créé.

### Comportement attendu

Le prompt visible ou le `conversation_context` de `prepare_attack_card` doit recevoir des résumés prêts à être formulés naturellement :

- objectif en formulation neutre ou seconde personne ;
- blocage résumé ;
- pas de copie brute de longue phrase user ;
- pas de promesse d'aide artificielle avant stabilisation.

### Correction minimale recommandée

Corriger côté owner `prepare_attack_card`, sans regex métier ni renderer déterministe :

- enrichir le `conversation_context` visible avec des résumés courts et neutres ;
- préciser dans le prompt visible `ask_or_confirm_technique` de ne pas reprendre les slots bruts mot pour mot ;
- conserver les slots runtime inchangés pour ne pas casser les confirmations.

### Tests attendus

- cible utilisateur en première personne avec possessif : rendu visible en formulation neutre ou seconde personne ;
- blocage long : rendu sous forme résumée ;
- correction de technique après proposition : état critique conservé ;
- question Product Help inline dans un flow parent : retour parent conservé.
