# Bug Sheet — Potion Support J2/J3 Intersession R2 (2026-07-15)

Run: `potion_support_j2_j3_intersession_20260715_r2`\
Rapport:
`docs/agent-playbook/New/test-material/qa-run-reports/2026-07-15-potion-support-j2-j3-intersession-r2.md`\
Verdict global: **yellow**. Connexion temporaire nettoyée.

## R2-B01 — Opening J3 correct mais preuves structurées désalignées

- **Tours**: ouverture proactive J3
- **Famille**: `BF-PROACTIVE-01` — preuve -> décision proactive cassée
- **Domaine owner**: runtime potion / `preparePotionSupportOpening`
- **Source amont**: le contrat LLM autorise `opening_text` à synthétiser toutes
  les preuves, alors que la validation post-LLM vérifie seulement qu'un
  `anchor_fact` connu existe. Elle ne vérifie pas que les claims visibles sont
  couverts par les evidence ids déclarés.
- **Symptome visible**: aucun mensonge observé sur ce run, mais la phrase « je
  vais prendre un exemple concret » et la réussite face à une question surprise
  sont surfacées alors que `anchor_fact.evidence_refs` et
  `question_candidate.evidence_refs` pointent vers deux messages J1->J2 qui ne
  contiennent pas ces éléments.
- **Preuve systeme**: J3 `draft_message` reprend le repère post-J2 ;
  `rolling_evidence` contient bien le message user `34f21f6f-...` qui le prouve
  ; les champs structurés J3 ne citent que `6b2a9c58-...` et `e889aa8c-...`.
- **Correction attendue**: compiler l'ouverture uniquement depuis des unités
  structurées validées `{text,evidence_ids}` ou ajouter une validation de
  couverture claim-par-claim. Si la couverture n'est pas démontrée, retirer le
  claim ou appliquer `skip_no_grounding`.
- **Tests requis**: positif fait nouveau J2 cité avec son id ; paraphrase ;
  anti-FP assistant-only non surfacé comme fait user ; contradiction
  ancien/nouveau ; intégration réelle J3.
- **Statut**: fixed_in_code_pending_real_qa
- **Fix reference**:
  - `supabase/functions/_shared/potion-support-runtime.ts`: le reducer ne rédige
    plus `opening_text`; il sélectionne désormais `focus_decision` et
    `progress_facts`, tous deux liés à des preuves user/structurées connues. Un
    focus incompatible avec un `open_thread` user frais produit
    `skip_no_grounding` avant rendu.
  - `supabase/functions/_shared/potion-support-visible-agent.ts`: agent visible
    distinct, alimenté uniquement par le focus et les progrès validés ; les
    anciennes ouvertures servent exclusivement à éviter la répétition.
  - `supabase/functions/_shared/potion-support-context.ts`: provenance durable
    `opening_evidence_refs` + nature/fraîcheur/continuité du focus.
  - `supabase/functions/_shared/potion-support-runtime_test.ts`: régression J3
    stale-focus, chemin positif J3, preuve assistant-only, boundary voisine et
    absence de fallback textuel.
- **Validation**: tests locaux Potion/Présence verts ; rerun réel J2→J3 requis
  avant passage `closed`.

## Positifs vérifiés

- Gate 2 h réellement observée puis satisfaite.
- J2 intègre neuf messages cross-channel ; J3 en intègre onze nouveaux.
- « pour aujourd'hui » n'annule pas la campagne.
- Fermeture Presence locale sur web et WhatsApp sans annulation.
- Opt-out explicite J3 -> reminder archivé, J4-J7 annulés, aucun pending, aucun
  active flow.
- Tests ciblés runtime/cancellation/follow-up: 13/13 verts.
