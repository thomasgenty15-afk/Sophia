# Bug Sheet — qa-research-routing-20260613-r1

## Contexte

- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-13-research-routing-r1.md`
- Run: `qa-research-routing-20260613-r1`
- Date: 2026-06-13
- Persona: `qa-skill`, connexion temporaire `all_skills_researchqa0613r1`
- Verdict global: yellow

## Bugs

### R1-B01 — commentaire interne visible dans les reponses utilisateur

- Tours: 1, 2
- Famille: `a classifier` — renderer/final-response comment leak. La taxonomie actuelle ne contient pas de code dedie `BF-RENDER`; source amont la plus proche: renderer / final response pipeline.
- Domaine owner: final response renderer / sanitation output utilisateur.
- Source amont: sortie companion ou post-processing final avant persistance et retour API.
- Symptome visible: les reponses contiennent `<!--fil_rouge_whatsapp: ...-->`.
- Preuve systeme:
  - `tmp/qa-research-routing-20260613-r1/turn1.raw.json`
  - `tmp/qa-research-routing-20260613-r1/turn2.raw.json`
  - `db_after_turn2.json` montre les commentaires internes persistes dans `chat_messages.content`.
- Correction attendue: ajouter un garde-fou transversal qui supprime ou transforme les marqueurs internes avant `chat_messages` et avant `response.content`.
- Statut: open
- Fix reference: n/a
- Tests requis:
  - positif: normal_reply avec fil rouge interne ne retourne aucun commentaire HTML.
  - paraphrase: meme invariant sur une reponse conversation skill.
  - anti-faux-positif: ne pas supprimer du contenu utilisateur legitime hors marqueur interne si le user parle de HTML.
  - integration: `/functions/v1/test-send-message force_full_ai=true` confirme absence de `<!--` et `fil_rouge_whatsapp` dans `response.content`.
