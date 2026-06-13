# Bug Sheet — one-shot-reminder-confirmation-postfix-r1

## Run

- Date: 2026-06-13
- Run id: `one-shot-reminder-confirmation-postfix-20260613-r1`
- Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-13-one-shot-reminder-confirmation-postfix-r1.md`
- Verdict global: red
- Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer déterministe, aucun fallback direct `processMessage`.

## Bugs

### R1-B01 — Confirmation one-shot trop pauvre après commit

- Tours: 3, 6, 9
- Famille: BF-LEDGER-02 — Commit réel mal rendu
- Domaine owner: `one_shot_reminder`
- Source amont: `tools/always_on/one_shot_reminder/renderer.ts` et final response pipeline consommant `committed_effects`
- Symptome visible: Sophia répond seulement `C'est programmé pour samedi 13 juin à HH:mm.` sans reprendre le libellé complet du rappel ni adapter le ton du contexte.
- Preuve systeme: les tours 3, 6 et 9 ont `tool_execution=success`, `executed_tools=["create_one_shot_reminder"]`, `committed_effects` présents, et `direct_effect.confirmation_visible_agent` absent.
- Correction attendue: rendre les confirmations visibles depuis le commit du tour courant avec heure locale + instruction utile, en style final naturel et tutoyé, sans mini-agent transverse.
- Statut: open
- Fix reference: n/a
- Tests requis: create success simple; create success émotionnel léger; correction temporelle; assertion que la réponse visible contient l'instruction utile du commit et aucune phrase de vouvoiement interdite.

### R1-B02 — Second sujet absorbé dans le rappel durable

- Tours: 4, 10
- Famille: BF-INTAKE-02 — Extraction trop large ou polluée; BF-EFFECT-03 — Payload durable faux
- Domaine owner: `one_shot_reminder`
- Source amont: `instruction_parser.ts`, `intake.ts`, agenda multi-intention
- Symptome visible: Sophia reconnaît le second sujet, mais le rappel à 10:40 est créé avec `reminder_instruction="relire mes notes sur ce dossier, et après ça j'aimerais comprendre pourquoi je me crispe dès que j'y pense"`.
- Preuve systeme: tour 4 `committed_effects` id `b6188368-207a-48ad-9e57-c8318d7963c8`; tour 10 recap liste le même libellé pollué.
- Correction attendue: séparer l'instruction rappel de la suite conversationnelle avant commit; l'agenda doit porter la suite comme tâche conversationnelle non-mutante.
- Statut: open
- Fix reference: n/a
- Tests requis: rappel + "et après/on parlera de..." doit créer uniquement le libellé rappel; paraphrases avec "puis", "ensuite", "après ça"; anti-faux-positif où le texte utile contient volontairement "et".

### R1-B03 — Instruction émotionnelle tronquée à un seul mot

- Tours: 6, 10
- Famille: BF-EFFECT-03 — Payload durable faux
- Domaine owner: `one_shot_reminder`
- Source amont: `instruction_parser.ts` / payload compiler
- Symptome visible: demande "respirer doucement et boire un verre d'eau" confirmée, mais le rappel durable devient seulement `eau`.
- Preuve systeme: tour 6 `committed_effects` id `0adc4691-8fd2-4139-9afc-1294de872c33`, `reminder_instruction="eau"`, DB `event_context=one_shot_reminder:eau`; tour 10 recap `10:20 : eau`.
- Correction attendue: préserver l'instruction utile complète quand elle est non dégénérée; ne pas réduire un rappel à un nom final si le verbe et le contexte font partie de la demande.
- Statut: open
- Fix reference: n/a
- Tests requis: "respirer et boire de l'eau"; "me lever et ouvrir la fenêtre"; "appeler X et noter Y"; anti-faux-positif pour instruction volontairement courte "eau".

### R1-B04 — Demande sans temporalité faussement confirmée

- Tours: 7, 8
- Famille: BF-INTAKE-04 — Ambiguïté non reconnue; BF-LEDGER-01 — Claim sans commit
- Domaine owner: `one_shot_reminder`
- Source amont: `reducer.ts`, `router.ts`, isolation du commit courant dans EffectLedger adapter
- Symptome visible: user dit "Rappelle-moi de vérifier le fichier." sans horaire; Sophia répond "C'est programmé pour samedi 13 juin à 10:20." puis le status ne clarifie pas l'erreur.
- Preuve systeme: tour 7 `selected_handler=create_one_shot_reminder`, `tool_execution=success`; `committed_effects` réexpose le commit précédent `0adc4691...` / `eau`; aucune nouvelle ligne DB pour "vérifier le fichier".
- Correction attendue: si `scheduled_for` manque, produire `missing_time` / `needs_clarify`, `executed_tools=[]`, `committed_effects=[]`, et une question de précision temporelle. Un commit précédent ne doit jamais prouver le tour courant.
- Statut: open
- Fix reference: n/a
- Tests requis: demande sans heure -> clarification; demande sans instruction -> clarification; après un rappel existant, demande incomplète ne réutilise pas l'ancien commit; status suivant doit reconnaître qu'aucun nouveau rappel n'a été créé.

### R1-B05 — Clause de correction temporelle incluse dans le libellé

- Tours: 9, 10
- Famille: BF-INTAKE-02 — Extraction trop large ou polluée; BF-EFFECT-03 — Payload durable faux
- Domaine owner: `one_shot_reminder`
- Source amont: `time_parser.ts`, `instruction_parser.ts`, intake de correction/slot filling
- Symptome visible: "Pour vérifier le fichier, mets-le plutôt dans 30 minutes" crée un rappel dont le libellé est `vérifier le fichier, mets-le plutôt dans 30 minutes`.
- Preuve systeme: tour 9 `committed_effects` id `4e69c02f-bffe-44e5-87c3-2e32136b934b`, `scheduled_for=2026-06-13T08:30:00+00:00`, `reminder_instruction="vérifier le fichier, mets-le plutôt dans 30 minutes"`; tour 10 recap identique.
- Correction attendue: le parser temps consomme "dans 30 minutes" comme slot temporel, et l'instruction durable reste "vérifier le fichier".
- Statut: open
- Fix reference: n/a
- Tests requis: "mets-le dans 30 minutes"; "plutôt demain à 9h"; "calle ça à 17h"; anti-faux-positif où "dans 30 minutes" fait partie du texte cité explicitement.

### R1-B06 — Status recap ajoute une section hors scope

- Tours: 10
- Famille: BF-STATUS-01 — Projection DB mal lue ou hors scope
- Domaine owner: `status_recap`
- Source amont: projection/rendu status recap
- Symptome visible: à une demande "uniquement des rappels vraiment créés dans cette conversation", Sophia ajoute "Côté rappels récurrents, je n'en vois aucun de mon côté."
- Preuve systeme: tour 10 `selected_handler=status_recap`, `executed_tools=[]`, aucune mutation; réponse visible contient une catégorie non demandée.
- Correction attendue: respecter le scope explicite du status demandé; ne pas ajouter de catégories absentes si le user demande uniquement les rappels créés dans la conversation.
- Statut: open
- Fix reference: n/a
- Tests requis: recap one-shot strict; recap global quand explicitement demandé; anti-faux-positif où le user demande "tous mes rappels, ponctuels et récurrents".
