# Bug Sheet - coachingrec-novice-confused-postfix-20260619-r1

## R1-B01

- Bug id: R1-B01
- Tours: 4
- Famille: BF-TEST-01 - Trace/test incoherent ou suite malsaine
- Domaine owner: runtime local / edge function QA
- Source amont: incident HTTP local ponctuel pendant `/functions/v1/test-send-message`.
- Symptome visible: le tour renvoie `http_status=502`, assistant vide, `response_owner=null`, `selected_handler=null`.
- Preuve systeme:
  - T4 `http_status=502`
  - T4 `assistant=""`
  - T4 `executed_tools=[]`
  - T5 retry du meme message reussit avec `response_owner=coaching_recommendation`.
- Correction attendue: si le 502 se reproduit, analyser les logs runtime local; ne pas masquer par fallback dans les runs QA.
- Statut: open
- Fix reference: none
- Tests requis:
  - Rerun d'un tour coaching actif avec question novice concrete.
  - Verifier que les erreurs 502 ne produisent aucun effet durable et que le retry ne duplique pas de tool.
