# Bug Sheet — Potion Support J2/J3 Intersession R1 (2026-07-15)

Run: `potion_support_j2_j3_intersession_20260715_r1`  
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-15-potion-support-j2-j3-intersession-r1.md`  
Verdict global: **red**. Connexion temporaire nettoyée.

## R1-B01 — Refus de carte interprété comme annulation de campagne

- **Tours**: clarification intersession -> préparation J2
- **Famille**: `BF-INTAKE-05` — sémantique composite aplatie
- **Domaine owner**: reducer intersession potion / `preparePotionSupportOpening`
- **Source amont**: sortie LLM `user_boundaries` non ciblée ; absence de champ de portée et de validation post-LLM avant `skip_user_boundary`.
- **Symptome visible**: aucun message J2 alors que l'utilisateur a seulement refusé la préparation d'une carte.
- **Preuve systeme**: décision `skip_user_boundary` ; anchor « La personne ne veut pas préparer de carte ni créer quoi que ce soit » ; reminder archivé `cancelled_user_boundary` ; J2-J7 annulés.
- **Correction attendue**: représenter une boundary avec `target=potion_campaign|feature|conversation|unknown` et sa preuve ; autoriser la transition terminale uniquement pour `target=potion_campaign`. Une cible `unknown` ne doit pas annuler.
- **Tests requis**: positif vrai opt-out potion ; paraphrases « arrête ces messages » ; anti-FP refus de carte/rappel/conseil ; intégration réelle J1->J2.
- **Statut**: fixed
- **Fix reference**: `potion-support-runtime.ts` — boundary structurée `potion_campaign|conversation_session|other_feature|unknown`, preuve user fraîche obligatoire et default-deny sur toute décision terminale non ciblée. Tests ciblés dans `potion-support-runtime_test.ts` ; rerun réel encore requis pour passer à `verified`.

## R1-B02 — Mise à jour personnelle ownée par coaching_recommendation

- **Tours**: intersession J1 -> J2
- **Famille**: `BF-ROUTE-01` — mauvais owner sélectionné
- **Domaine owner**: dispatcher / arbitration Présence vs `coaching_recommendation`
- **Source amont**: la mention d'un événement concret et d'une difficulté de performance suffit à activer une lane produit, malgré l'absence de demande de levier ou d'artefact.
- **Symptome visible**: Sophia propose une carte de défense alors que l'utilisateur voulait seulement donner une mise à jour.
- **Preuve systeme**: `response_owner=coaching_recommendation`, zéro tool et zéro effet ; le tour suivant doit expliciter « je voulais juste te tenir au courant ».
- **Correction attendue**: une mise à jour émotionnelle ou expérientielle sans demande produit reste en Présence ; coaching seulement sur demande de méthode, artefact ou action concrète explicite.
- **Tests requis**: mise à jour pure -> Présence ; demande explicite de carte -> coaching ; paraphrases ; anti-FP sur une vraie demande de recommandation.
- **Statut**: open (hors scope du chantier Potion Support)
- **Fix reference**: aucune ; aucune modification du dispatcher global ou de `coaching_recommendation` dans ce correctif.
