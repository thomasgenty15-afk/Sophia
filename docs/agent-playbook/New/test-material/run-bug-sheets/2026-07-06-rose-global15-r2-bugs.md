# Run Bug Sheet — Rose global15 r2 (2026-07-06)

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-06-rose-global15-r2.md`
Taxonomie: `docs/agent-playbook/New/test-material/familly-bugs.md`

## R2-B01 — Go-ahead explicite non converti dans le flow carte de défense

- Bug id: `R2-B01`
- Tours: T5 (racine visible aussi sur la séquence T4→T5→T6)
- Famille: `BF-INTAKE-03` — Contrainte/intention explicite perdue (borderline ; le
  garde-fou produit « pas de write de carte depuis le chat » est légitime, c'est la
  progression du flow sur go-ahead qui pèche).
- Domaine owner: skill `coaching_recommendation`
  (`supabase/functions/sophia-brain/skills/coaching_recommendation/local_flow.ts`,
  policy de resume/progression du flow actif).
- Source amont: la policy d'un flow de recommandation actif ne distingue pas un
  go-ahead explicite (« oui vas-y, cadre-moi ») d'une simple relance ; l'intent de
  progression est conflaté avec l'intent de write produit → re-proposition de la
  même offre (« si tu veux je peux t'aider à formuler ») au lieu du livrable.
- Symptome visible: l'utilisateur dit « oui vas-y » mais doit re-préciser au tour
  suivant pour obtenir la formulation courte ; trailing offer répété 3 tours de
  suite (tic structurel).
- Preuve systeme: T5 `owner=coaching_recommendation`,
  `reason_code=active_coaching_recommendation`,
  `active_flow_arbitration=continue_active/resume_active`, `skill_run=continue`,
  aucun effet durable (attendu). Livraison effective seulement au T6 après
  re-formulation utilisateur.
- Correction attendue: dans le flow actif, mapper un go-ahead explicite (« vas-y »,
  « cadre-moi », « fais-le ») vers l'étape livrable suivante (formulation courte
  personnalisée) ; conserver le garde-fou « pas d'écriture de carte depuis le chat »
  strictement sur l'action de write, pas sur l'aide à la formulation ; éviter de
  ré-émettre un trailing offer identique à l'étape précédente.
- Statut: `open`
- Fix reference: —
- Tests requis:
  - positif: proposition de carte → « oui vas-y » → formulation courte livrée
    directement (pas de re-offre).
  - paraphrase: « fais-le », « cadre-moi ça », « donne » traités identiquement.
  - anti-faux-positif: « remplis-la dans le plan » / demande d'écriture réelle →
    reste renvoyé vers le produit (garde-fou intact).
  - integration: séquence complète carte de défense sans répétition du trailing offer.

## Incident environnement (non-bug produit)

- Type: batch memorizer local — 1er `trigger-memorizer-daily` → HTTP 502
  (wall-clock Kong 150 000 ms sur extraction LLM). A laissé 15
  `memory_message_processing=completed` + 1 `memory_extraction_runs` orphelin
  `running` (0 persisté) → retry « no_unprocessed_messages ».
- Impact QA: aucun sur le chemin conversationnel (T9 correct). Vérification mémoire
  différée jusqu'à résolution.
- Résolution: `scripts/local_extend_kong_functions_timeout.sh` (600 000 ms, reload
  Kong sans restart) + purge artefact orphelin + re-trigger → `persisted_count=7`,
  fait T9 présent.
- Suivi: procédure ops — étendre le timeout Kong avant le 1er trigger memorizer
  post-run. Pas de ligne BF-* (pas un bug produit).
