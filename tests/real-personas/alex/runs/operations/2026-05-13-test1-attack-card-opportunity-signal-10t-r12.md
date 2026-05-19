# QA Run Report - Attack Card Opportunity Signal r12

## 1. Contexte Du Test

- Date: 2026-05-13
- Run: `attack-card-opportunity-signal-10t-r12`
- Persona: Alex, local
- Objectif: tester le signal `prepare_attack_card` depuis une friction de démarrage, puis acceptation, correction de draft, création, et question post-création.
- Trajectoire: friction action completed -> offre Carte d'attaque -> oui -> pending confirmation -> correction -> création -> product help factuel.
- Surfaces visees: dispatcher v2, tool_skill_opportunity, recommendation tool, `prepare_attack_card`, pending confirmation, product_help.
- Cadre IA reel: Supabase local via runner local, conversation menée tour par tour, pas de script fixe de réponses utilisateur.
- Validite QA: valide.

## 2. Tours De Conversation

### Tour 1

**User**
> Hier j'ai fait le sas, mais j'ai tourné autour du carnet au lieu de commencer tout de suite. Ce soir je veux couper ce moment d'hésitation.

**Sophia**
> Ok, donc hier tu as fait le sas, mais tu t’es “perdue” dans le carnet avant de démarrer. Ce soir, on coupe la boucle au tout début.
>
> Option simple (efficace) pour le démarrage : juste après le sas, tu fais une seule action de lancement pendant 2 minutes, sans ouvrir le carnet au préalable. Ensuite seulement, tu décides de la suite.
>
> Tu veux que les 2 minutes ce soit “ranger/installer”, “lister la première étape”, ou “écrire la première phrase/l’entrée” ?
>
> Concrètement, je parle d'une Carte d'attaque pour "Faire le sas de déchargement", à préparer seulement si tu confirmes.

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `skill_entry_signal`
- direct_effects: `track_progress_plan_item`
- operation: aucune opération lancée
- executed_tools: `track_progress_plan_item`
- durable_effect: action sas marquée/progressée, pas de carte créée.

### Tour 2

**User**
> Oui, prépare cette carte d'attaque pour le sas. Je choisis écrire la première phrase comme démarrage.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Preparer le terrain
> Prepare l'environnement de "Faire le sas de déchargement" pendant 2 minutes, sans obligation d'aller plus loin.
>
> Mode d'emploi: Prepare le terrain avant le moment vise, puis laisse l'environnement t'aider a demarrer.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `operation_intent_start`
- operation: `pending_confirmation`
- executed_tools: aucun
- durable_effect: aucune création avant confirmation.

### Tour 3

**User**
> Avant de créer, remplace par: ouvrir le carnet, écrire seulement une phrase, puis seulement après choisir si je continue.

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
>
> Preparer le terrain
> Version minuscule : ouvrir le carnet, puis écrire une phrase, puis décider après si je continue.
>
> Mode d'emploi: Prepare le terrain avant le moment vise, puis laisse l'environnement t'aider a demarrer.
>
> Tu veux que je cree cette carte ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `prepare_attack_card`
- route_reason: `confirmation_correction_to_pending`
- operation: `pending_confirmation_updated`
- executed_tools: aucun
- durable_effect: draft régénéré, pas de création.

### Tour 4

**User**
> Oui, crée cette version.

**Sophia**
> C'est fait. J'ai créé cette carte d'attaque :
>
> Carte d'attaque - Faire le sas de déchargement
> Technique : Preparer le terrain
> Version minuscule : ouvrir le carnet, puis écrire une phrase, puis décider après si je continue.
>
> Mode d'emploi : Prepare le terrain avant le moment vise, puis laisse l'environnement t'aider a demarrer.
>
> Tu peux la retrouver dans Ressources > Cartes d'attaque du plan pour la relire et l'utiliser. Elle ne se modifie pas directement; si elle ne convient plus, on peut en preparer une nouvelle version apres confirmation.

**Trace courte**
- http_status: 200
- response_owner: `pending_confirmation`
- selected_handler: `execute_confirmed`
- route_reason: `confirmation_yes`
- operation: `executed`
- executed_tools: `prepare_attack_card`
- durable_effect: carte créée `f8240553-5269-4fac-8ec7-f01f0f3c4a5c`.

### Tour 5

**User**
> Et je la retrouve où déjà ?

**Sophia**
> Tu la retrouves dans Dashboard > Ressources > Cartes d'attaque du plan.
>
> Cherche la carte liee a l'action concernee. Tu peux la consulter et l'utiliser; elle ne se modifie pas directement. Si elle ne convient plus, on peut en preparer une nouvelle version apres confirmation.

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_handoff_requested`
- operation: aucune
- executed_tools: aucun
- durable_effect: aucun nouvel effet.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tour 1: Sophia comprend la friction et ne lance pas directement une opération.
- Tour 3: la correction du draft est naturelle et le nouveau contenu reflète les contraintes du user.
- Tour 5: réponse factuelle propre, sans relancer une nouvelle opération.

**Problemes**
- Tour 1: Sophia propose d'abord des options de micro-action, puis nomme la Carte d'attaque via le garde-fou. Impact: utilisable, mais la proposition produit arrive un peu comme une seconde intention. Sévérité: yellow.
- Tour 2: le choix “écrire la première phrase” n'est pas intégré dans le premier draft; il faut le tour de correction pour l'obtenir. Impact: friction conversationnelle légère. Sévérité: yellow.

**Fix propose**
- Faire porter plus explicitement le `user_facing_offer` dans la réponse générée, pour éviter que le garde-fou visible soit nécessaire.
- Étendre l'extraction des premiers gestes à “écrire la première phrase” dès le tour d'acceptation.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Tour 1: `operation_intents=[]` et `tool_skill_opportunity=attack_card`, donc le système propose sans exécuter.
- Tour 2: accord explicite -> `operation_flow/prepare_attack_card/pending_confirmation`.
- Tour 3: correction priorisée dans le pending `prepare_attack_card`, pas détournée vers `adjust_plan_item`.
- Tour 4: confirmation oui -> exécution.
- Tour 5: question de localisation -> `product_help`, sans nouvelle opération.

**Skills / Operations / Tools**
- `track_progress_plan_item` s'exécute au tour 1 pour l'action faite.
- `prepare_attack_card` ne crée rien avant confirmation.
- Le draft corrigé conserve `ouvrir le carnet`, `écrire une phrase`, `décider après si je continue`.

**Memory / Effets durables**
- Effet durable attendu: une carte d'attaque créée après confirmation uniquement.
- Le message post-création précise correctement que les cartes générées ne se modifient pas directement.

**Problemes**
- Aucun problème système bloquant observé sur r12.

**Fix propose**
- Ajouter un test conversationnel pour le wording visible de l'offre afin d'éviter la régression `Carte d'attaque "Carte d'attaque"`.

## Verdict Global

- Verdict: yellow
- Raison principale: workflow système corrigé et valide, mais fluidité encore perfectible sur l'offre initiale et l'intégration du premier geste au tour d'acceptation.
- Follow-up prioritaire: intégrer directement “écrire la première phrase” comme step structuré dans le premier draft.
