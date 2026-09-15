# clarification_tool Runtime Contract

## Mental Model

`clarification_tool` est un outil LLM transverse et non-mutant. Il clarifie une
ambiguïté à partir de candidats déjà préparés par le dispatcher ou par un
skill/flow actif. Il ne connaît pas les règles métier des domaines et ne fait
aucun routing produit définitif.

Son rôle est limité à deux issues sûres :

- choisir un candidat fourni quand le modèle est suffisamment confiant ;
- poser une seule question discriminante quand l'ambiguïté reste réelle.

Le code runtime ne décide jamais avec des mots-clés métier. Il valide le JSON du
modèle, vérifie que l'id choisi appartient aux candidats fournis, normalise les
questions et retombe sur une question neutre si la sortie LLM est invalide.

## Runtime Shape

Chemin canonique :

1. Le dispatcher ou le skill appelant construit une `ClarificationRequest` avec
   `buildClarificationRequest`.
2. L'appelant fournit une liste fermée de `ClarificationCandidate`.
3. `runClarificationTool` appelle un `ClarificationLlmRunner` en mode JSON.
4. Le résultat est sécurisé dans `ClarificationToolOutput`.
5. Si nécessaire, l'appelant persiste un `ClarificationState` temporaire via
   `writeClarificationState`.
6. `renderClarificationQuestion` rend uniquement la question utilisateur pour
   `ask` ou `still_ambiguous`.

## File Ownership

- `supabase/functions/sophia-brain/clarification/contract.ts` possède les types
  publics et le helper de construction de requête.
- `supabase/functions/sophia-brain/clarification/tool.ts` possède le prompt LLM,
  l'appel runner et la validation/sécurisation de sortie.
- `supabase/functions/sophia-brain/clarification/renderer.ts` possède le rendu
  de question et le fallback générique à partir des labels candidats.
- `supabase/functions/sophia-brain/clarification/state.ts` possède l'état
  conversationnel temporaire.
- `supabase/functions/sophia-brain/clarification/clarification_tool_test.ts`
  couvre les sorties LLM valides et invalides.

## Inputs

- `clarification_id`.
- `owner` : dispatcher, skill ou flow appelant.
- `ambiguity_kind` : intent, target, scope, surface, timing, confirmation ou
  handoff readiness.
- Message utilisateur courant.
- Historique récent, limité aux 8 derniers messages.
- Contexte connu et état de flow actif, optionnels.
- Candidats fermés fournis par l'appelant.
- Contraintes forcées : `no_chat_mutation: true`, `max_questions: 1`,
  `avoid_internal_terms: true`.

## Outputs

`ClarificationToolOutput` contient :

- `status`: `ask`, `resolved`, `still_ambiguous`, `cancelled` ou `topic_change`.
- `selected_candidate_id`: uniquement `null` ou un id de candidat fourni.
- `confidence`: `low`, `medium` ou `high`.
- `question`: obligatoire pour `ask` et `still_ambiguous`.
- `user_goal_summary`, `reasoning_summary` et `handoff_notes` optionnels.

`reasoning_summary`, `candidate_id`, `surface_id` et `operation_type` ne doivent
pas être rendus côté utilisateur.

## Invariants

- Aucune mutation de chat, de DB, de plan ou d'outil exécutable.
- Aucun pending confirmation exécutable n'est créé.
- `resolved` exige un `selected_candidate_id` valide.
- `confidence=low` ne peut pas rester `resolved`.
- `ask` et `still_ambiguous` doivent contenir une seule question courte.
- `topic_change` et `cancelled` sont acceptés sans candidat.
- Un candidat absent ne peut jamais être inventé par le modèle puis accepté.

## Integration Points

- Dispatcher hors flow : ambiguïté entre candidats préparés, par exemple deux
  familles d'action ou une demande produit vs action.
- Skill/flow actif : ambiguïté interne de cible, scope, timing, readiness de
  handoff ou confirmation conversationnelle.
- Temp memory : stockage purement conversationnel sous
  `__clarification_state_v1`.

## Allowed Changes

- Ajouter des champs de contexte non-mutants à `known_context`.
- Ajouter des owners spécifiques.
- Ajouter des tests de validation LLM et de fallback.
- Ajuster les limites de longueur et la normalisation de question.
- Brancher progressivement le dispatcher ou un skill appelant, tant que les
  candidats restent fournis par l'appelant.

## Forbidden Changes

- Ajouter une décision déterministe métier dans `clarification_tool`.
- Résoudre une intention avec des mots-clés utilisateur.
- Créer, modifier ou supprimer des données métier.
- Déclencher un outil d'action depuis ce module.
- Rendre des termes internes, ids techniques ou reasoning utilisateur.
- Faire du routing produit définitif dans le tool.

## Legacy Exceptions

Aucune. Le module est nouveau et doit rester indépendant des flows métier
existants.

## Required Tests

- `ask` valide avec question.
- `resolved` valide avec candidate id existant.
- `resolved` avec candidate id inconnu sécurisé en question/fallback.
- `confidence=low` avec `resolved` converti en non-résolu.
- JSON invalide sécurisé en question neutre.
- `topic_change` accepté sans candidate.
- `cancelled` accepté sans candidate.
- Plusieurs questions visibles normalisées.
- `no_chat_mutation` toujours vrai dans l'état temporaire.

## Suivi Des Décisions Architecturales

| Date       | Décision                                                                                                       | Statut | Référence                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------- |
| 2026-06-01 | Création de `clarification_tool` comme primitive LLM transverse, non-mutante et indépendante des flows métier. | Active | `supabase/functions/sophia-brain/clarification` |
