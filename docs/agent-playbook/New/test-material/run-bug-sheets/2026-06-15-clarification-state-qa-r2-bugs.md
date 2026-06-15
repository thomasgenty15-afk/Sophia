# Bug Sheet - Clarification State QA R2 - 2026-06-15

## R2-B01 - Natural attack/defense tool ambiguity bypasses clarification

- Run: `clarif_state_qa_20260615_r2`
- Tours: N.1 T1-T2
- Famille: `BF-ROUTE-01 - Mauvais owner selectionne`
- Domaine owner probable: global dispatcher / clarification arbitrator entry condition
- Statut: open

### Symptome

Le user exprime une intention de preparer une carte et hesite entre deux cibles qui correspondent a deux flows locaux plausibles :

`Demain matin je veux preparer une carte, mais j'hesite : est-ce que je dois m'aider a sortir du lit ou me proteger du reflexe telephone au reveil ?`

Attendu : `orientation_clarification`, avec une question courte pour choisir entre `prepare_attack_card` et `prepare_defense_card`.

Obtenu : `normal_reply`, `selected_handler=null`, `route_reason=normal_reply_default`, avec une reponse explicative longue et aucun etat de clarification actif.

### Preuves

- T1 owner: `normal_reply`
- T1 route_reason: `normal_reply_default`
- T1 effet durable: aucun commit
- T2 owner: `tool_skill`
- T2 selected_handler: `prepare_defense_card`
- Durable N.1: pas de `__last_clarification_note_information` apres T1

Artifacts:

- `tests/real-personas/qa-skill/runs/clarification/2026-06-15-clarification-local-flow-clarif_state_qa_20260615_r2.raw.json`
- `tests/real-personas/qa-skill/runs/clarification/2026-06-15-clarification-local-flow-clarif_state_qa_20260615_r2.summary.json`
- `tests/real-personas/qa-skill/runs/clarification/2026-06-15-clarification-local-flow-clarif_state_qa_20260615_r2.durable.json`

### Correction attendue

Renforcer la detection structuree d'ambiguite tool quand le message combine :

- intention de preparer/creer une carte ;
- hesitation entre deux cibles ou strategies concurrentes ;
- deux candidats tool plausibles `prepare_attack_card` / `prepare_defense_card`.

La correction doit router vers `orientation_clarification` avec note_information exploitable, sans regex metier, sans renderer deterministe, et sans patch local de phrase.

### Tests a ajouter

- Paraphrase positive : hesitation naturelle entre carte d'attaque et carte de defense -> `orientation_clarification`.
- Anti-faux-positif : demande d'explication produit sur la difference attaque/defense -> `product_help` ou `normal_reply`, pas clarification tool.
- Integration reelle : T1 active clarification, T2 resolve vers `prepare_defense_card`.

## R2-B02 - Active clarification repeats choice despite strong candidate evidence

- Run: `clarif_state_qa_20260615_r2b`
- Tour: N.2 T2
- Famille: `BF-INTAKE-01 - Slot fourni mais redemande`
- Domaine owner probable: `clarification.local_dispatcher` / reducer visible task selection
- Statut: open

### Symptome

Apres une clarification active entre carte d'attaque et carte de defense, le user repond :

`Je ne sais pas trop, les deux me semblent utiles, mais le telephone me fait vraiment perdre du temps.`

Le flow conserve bien l'owner `orientation_clarification`, mais il repose quasiment la meme question :

`On commence par laquelle : la carte d'attaque ou la carte de defense ?`

Le signal `telephone` est fort pour le candidat defense. Le flow aurait du faire avancer la clarification, par exemple en confirmant/proposant la carte de defense, au lieu de redemander le meme choix.

### Preuves

- T2 owner: `orientation_clarification`
- T2 route_reason: `clarification_required`
- T2 selected_handler: `orientation_clarification`
- T2 effet durable: aucun commit
- T3 resolve correctement quand le user dit explicitement `Carte de defense`
- T3 note_information presente avec `target_dispatcher=prepare_defense_card`, `resolved_candidate=prepare_defense_card`, `rejected_candidates=[prepare_attack_card]`

Artifacts:

- `tests/real-personas/qa-skill/runs/clarification/2026-06-15-clarification-local-flow-clarif_state_qa_20260615_r2b.raw.json`
- `tests/real-personas/qa-skill/runs/clarification/2026-06-15-clarification-local-flow-clarif_state_qa_20260615_r2b.summary.json`
- `tests/real-personas/qa-skill/runs/clarification/2026-06-15-clarification-local-flow-clarif_state_qa_20260615_r2b.durable.json`

### Correction attendue

Quand une reponse reste hesitante mais apporte une evidence forte pour un candidat actif, le dispatcher/reducer doit produire un stage plus utile que la repetition brute du choix, par exemple `confirm_candidate`, avec un `visible_task.conversation_context` qui explique :

- candidat propose ;
- evidence utilisee ;
- incertitude restante ;
- question courte de confirmation.

La correction ne doit pas verrouiller automatiquement le candidat si le user reste ambigu. Elle doit permettre une correction naturelle au tour suivant.

### Tests a ajouter

- Clarification active + evidence forte defense mais formulation hesitante -> confirmation de defense, candidats conserves.
- Clarification active + evidence faible ou contradictoire -> question de clarification continue, sans mutation destructive.
- Correction explicite apres proposition -> remplace uniquement le candidat concerne et preserve le reste de l'etat.
