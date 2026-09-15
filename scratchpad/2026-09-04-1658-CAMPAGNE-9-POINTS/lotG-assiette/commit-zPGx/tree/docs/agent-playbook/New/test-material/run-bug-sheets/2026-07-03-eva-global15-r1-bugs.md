# Bug Sheet — Eva Global 15 tours (R1) — 2026-07-03

Run: `eva-global15-20260703-r1` — persona Eva — scope `qa-eva-global15-20260703-r1`.
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-eva-global15-r1.md`.
Verdict run: yellow (0 red).

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptôme visible | Preuve système | Correction attendue | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1-B01 | T1 | BF-INTAKE-06 | coaching_recommendation skill / dispatcher altitude | policy premier tour: entrée émotionnelle lue comme signal de recommandation produit | Ouverture « je suis pathétique / soirée perdue » → Sophia propose direct une carte de défense + instructions UI, sans beat émotionnel | response_owner=coaching_recommendation, route_reason=coaching_recommendation_signal, safety.risk_band=low, direct_effects=[] | Gate d'altitude « valider/soutenir avant d'offrir » sur tours à charge émotionnelle ; offre produit ≠ ordre UI | fix_applied (rerun requis) — dispatcher global règle 5 (`dispatcher.prompts.ts`) : charge émotionnelle basse sans demande de levier ⇒ aucun signal coaching, réponse normale d'accueil d'abord ; règles visibles coaching (`visible_agents/shared.ts`) : beat de validation avant tout levier, jamais d'instructions UI au 1er tour émotionnel. Tests : contrat dispatcher + `local_flow_test.ts` |
| R1-B02 | T4 | à classifier (qualité génération) | pipeline génération / final response | contamination de script LLM (hébreu) dans sortie française | Mot `בדיוק` inséré dans « elle vise בדיוק le piège » — présent dans le message assistant persisté | contenu DB chat_messages assistant T4 contient `בדיוק`; routing product_help correct | Garde-fou langue de sortie (détection script non-latin non attendu → régénération/nettoyage), pas une regex ad hoc | open |
| R1-B03 | T5 | BF-ROUTE-01 | dispatcher/route policy + tool skill défense | intention d'exécution « préparer carte » non reconnue → fallback normal_reply ; item cible en cards_status=not_required | « aide-moi à la préparer maintenant » → carte improvisée en texte libre, rien créé | response_owner=normal_reply, tool_skill=null, ledger=0, user_defense_cards=0, defense_card_id NULL partout | Router vers tool skill défense (collecte slots) OU déflection honnête si l'action ne supporte pas de carte ; interdire à normal_reply de simuler un livrable | open |
| R1-B04 | T12 | BF-ROUTE-01 (+ BF-EFFECT-02) | dispatcher/route policy + update_coach_preferences ; renderer feature_opportunity | intention « tuning coach » non reconnue comme domaine préférence ; rendu exposant des clés config | Feedback « plus direct, moins de relances » → routé feature_opportunity, expose `coach.tone = direct` / `coach.question_tendency`, renvoie l'user régler ça « dans la plateforme », aucune application | response_owner=feature_opportunity, direct_effects=[], ledger=0, aucun write préférence | Router préférence-de-style → update_coach_preferences (capture + application runtime) ; ne jamais rendre de clés config brutes | open |

## Notes non bloquantes (pas des bugs)

- T8: « le soir vers 22h » interprété en one-shot pour ce soir plutôt que rappel récurrent — lecture défendable, non bloquant. Surveiller si le pattern « le soir » doit proposer un récurrent.
- Mémoire (T6): `memory_items` corrects mais écriture in-turn/async (messages `memory_message_processing=primary/completed` pendant les tours), rendant `trigger-memorizer-daily` no-op. Diverge de la doctrine « pas de write in-turn ». À confirmer: feature flag d'extraction inline attendu en local ? Owner: memory planner/writer.
  - **Résolu (audit code 2026-07-03)** : il n'existe aucun chemin d'écriture mémoire in-turn — `memory_items`/`memory_message_processing` ne sont écrits que par le batch (`trigger-memorizer-daily` → `persistMemoryWrites`). Les writes observés « pendant les tours » = un batch déclenché en parallèle du run (trigger externe/cron local) : incident d'hygiène d'environnement QA, pas un bug produit. Consigné dans `14-qa-test-guidelines.md` §Mémoire.

## Tests requis (par bug)

- R1-B01: positif (ouverture émotionnelle → 0 instruction UI, présence d'un beat de validation) ; anti-faux-positif (demande produit explicite → l'offre carte reste permise).
- R1-B02: garde de langue (sortie assistant → 0 caractère de script non-latin non attendu) ; paraphrase multilingue non déclenchante.
- R1-B03: positif (« prépare la carte » → owner tool skill défense OU déflection sans carte fabriquée) ; anti-faux-positif (simple question « c'est quoi une carte » → product_help, pas d'exécution).
- R1-B04: positif (« sois plus direct / moins de questions » → owner update_coach_preferences, préférence appliquée, 0 clé config rendue) ; intégration (préférence appliquée persiste sur les tours suivants).
