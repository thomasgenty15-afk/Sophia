# Run Bug Sheet - qa-paul-bascule-hard-20260717-r1

## Metadata

- Date: 2026-07-17
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-17-attack-keyword-bascule-r1.md`
- Run id: `qa-paul-bascule-hard-20260717-r1`
- Persona / scenario: Paul — mot de bascule durci (flow actif, normalisation, effet durable, re-trigger)
- Verdict run: yellow
- Validite QA: valide (IA réelle, `test-send-message` + `force_full_ai=true`, local)
- Agent owner: Claude (chantier attack_keyword_support)

## Synthese

- Familles dominantes: aucune famille BF exacte — 1 friction UX de cécité de session
- Bug le plus bloquant: PAUL-BASC-B01 (non bloquant pour le déploiement)
- Fix architectural prioritaire: enrichir le contrat d'entrée de
  `renderAttackKeywordSupportReply` avec les derniers messages user verbatim
- Rerun requis: FAIT 17/07 — run réel `qa-paul-basc-fixval-20260717-r1`
  (6 tours IA réels + 2 tentatives t3 en erreur gateway documentées, reprises
  sans effet résiduel) : invariant validé, bug clos. Observation hors périmètre
  relevée au T5 du rerun : accord au féminin (« tu t'es arrêtée ») pour Paul
  dans une réponse présence — générateur companion/présence, pas le module mot
  de bascule ; à traiter dans un chantier style/identité si récurrent.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PAUL-BASC-B01` | T5 | à classifier (plus proche par symptôme: BF-STATUS-01, mais la projection en cause n'est pas une lecture DB) | `renderAttackKeywordSupportReply` (`_shared/attack-keyword-support.ts`) + bloc owner `router/run.ts` | prompt spécialisé volontairement limité au payload de la carte (anti-confabulation) → aveugle à l'état de session sur re-trigger | « Ouvre maintenant le dossier » re-prescrit alors que le user a déclaré le dossier ouvert (T3) et le travail commencé (T4/T6) | trace T5: owner/handler `attack_keyword_support`, `generated`, routage et présence corrects — seule la formulation ignore la session | ajouter au task payload un champ déterministe `derniers_messages_user` (derniers messages user verbatim, écho du mot exclu, tronqués) + règle de prompt « ne re-propose jamais un geste déclaré fait, propose le plus petit geste suivant » | `fixed` | `sanitizeRecentUserMessages` + contrat d'entrée élargi dans `_shared/attack-keyword-support.ts`, câblage `history` dans le bloc owner de `router/run.ts` (17/07) | FAITS 17/07 — unitaires: sanitize (écho/troncature/ordre), payload avec messages, froid sans champ (14/14 verts) ; run réel `qa-paul-basc-fixval-20260717-r1`: T1 froid inchangé, T4 re-trigger → « Garde le dossier compta ouvert… 2 minutes sur la première pièce » (geste suivant, plus de re-prescription), T6 paraphrase après pause → « Tu as déjà avancé… la prochaine pièce » ; zéro fait inventé ; état reset à zéro |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-17 | Pas de correctif pendant le run (guideline 14) ; fix proposé en amont, non appliqué | le run QA valide l'état livré ; la friction est UX, le système est vert | Claude | rapport §Run 2 T5 |
