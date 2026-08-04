# Bug Sheet - Weekly Server-Owned Full R1

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1-B01 | T5 | `BF-EFFECT-03` | `prepare_defense_card` | Reducer/intake de payload platform handoff | La parade concrete du user (`poser le sac`, `boire un verre d'eau`, `aller direct sous la douche`) est resumee en `proteger le sas de decompression`; la carte manuelle risque d'etre moins actionable. | T5 `selected_handler=prepare_defense_card`, `status=handoff_delivered`, `prepared_fields.defense_action=proteger le sas de decompression`, `ritual_phrase=null`, `committed_effects=[]`. | Conserver une sequence de defense structuree dans le handoff, par exemple `defense_steps`, et l'inclure dans `card_draft_summary` sans creer la carte depuis le chat. | open |  | Positif: reducer defense avec sequence multi-gestes conserve tous les gestes. Anti-FP: objectif general sans gestes ne fabrique pas de sequence. Integration: mini-run defense/weekly detour verifie platform_handoff payload. |

