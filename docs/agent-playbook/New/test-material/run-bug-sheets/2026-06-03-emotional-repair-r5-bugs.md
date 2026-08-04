# Bug Sheet - 2026-06-03 emotional-repair-r5

## R5-B01

- Tours: 1
- Famille: BF-INTAKE-03
- Domaine owner: `emotional_repair`
- Source amont: structured intake prompt/contract
- Symptome visible: reponse visible correcte mais generique, produite via `technical_intake_failure`.
- Preuve systeme: `skill_response_intent=technical_intake_failure`; `intake_trace.top_level_keys=["output_contract"]`; erreurs `invalid_*` sur les champs de decision.
- Correction attendue: supprimer l'ambiguite du prompt `output_contract` et contraindre la sortie a etre la decision elle-meme, ou introduire un schema de sortie non echoable; tracer les enveloppes invalides.
- Statut: open
- Fix reference: a venir
- Tests requis: decision racine valide; decision enveloppee valide; echo `output_contract` doit etre rejete avec diagnostic explicite; run reel honte/sans technique sans `technical_fallback`.

## R5-B02

- Tours: 2
- Famille: BF-INTAKE-03
- Domaine owner: orientation clarification / handoff arbitration
- Source amont: contrat de clarification entre active emotional support et demande d'action concrete
- Symptome visible: "Donne-moi une seule micro-action" declenche une clarification au lieu d'une micro-action non mutante.
- Preuve systeme: `response_owner=orientation_clarification`; `route_reason=clarification_required`; aucun tool execute.
- Correction attendue: representer `micro_action_non_mutating` comme sortie structuree admissible quand le user demande une action simple et refuse les outils.
- Statut: open
- Fix reference: a venir
- Tests requis: positif micro-action sans outil; paraphrase "un prochain geste seulement"; anti-FP demande explicite de carte conserve le handoff carte.

## R5-B03

- Tours: 3
- Famille: BF-ROUTE-01
- Domaine owner: clarification resolver / tool-skill arbitration
- Source amont: resolution de clarification vers owner operationnel
- Symptome visible: "une seule micro-action" est resolu vers `prepare_attack_card`.
- Preuve systeme: `response_owner=tool_skill`; `selected_handler=prepare_attack_card`; `route_reason=orientation_clarification_resolved_tool_skill`; missing slots de carte demandes.
- Correction attendue: la resolution de clarification ne doit pas choisir un tool skill engageant sans consentement outil ou intention d'artefact structuree.
- Statut: open
- Fix reference: a venir
- Tests requis: resolution clarification vers `execution_breakdown` ou reponse non mutante; anti-FP "prepare-moi une carte d'attaque" doit encore router vers `prepare_attack_card`.
