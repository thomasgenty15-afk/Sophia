# Bug Sheet - Weekly Full R5

## Contexte

- Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-weekly-full-r5.md`
- Run: `weekly-full-20260612-r5-rose`
- Persona: Rose
- Statut global: yellow
- Cadre: IA reelle locale, `/functions/v1/test-send-message`, `force_full_ai=true`, hors sandbox.

## Bugs

### R5-B01

- Bug id: `R5-B01`
- Tours: Tour 1
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: `weekly_review`
- Source amont: `weekly_gates`, reducer local ou prompt visible `review_action_gaps`
- Symptome visible: la reponse demande le ressenti global alors que la trace indique `visible_task=review_action_gaps` et que l'action review n'est pas encore complete.
- Preuve systeme: Tour 1, `visible_task=review_action_gaps`; Sophia demande `as-tu le sentiment d'avoir globalement avancé`.
- Correction attendue: rendre la gate action review prioritaire tant que les gaps action ne sont pas couverts; le ressenti global vient apres, sauf si deja fourni de maniere suffisante.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/skills/weekly_review/visible_agent.ts`, `supabase/functions/sophia-brain/skills/weekly_review/local_flow.ts`, `weekly_review_local_flow_test.ts`
- Tests requis: ouverture weekly avec ressenti vague; Sophia doit demander les actions/gaps avant de passer au ressenti global; anti-faux-positif avec user qui donne deja action review complete et ressenti complet. Couvert par `weekly visible context carries strict action review and synthesis constraints`.

### R5-B02

- Bug id: `R5-B02`
- Tours: Tours 4 et 9
- Famille: `BF-PREF-01` - Preference non appliquee runtime
- Domaine owner: visible agents weekly
- Source amont: `conversation_context` persona/style ou prompt visible
- Symptome visible: accords masculins `fatigué` et `encouragé` pour Rose.
- Preuve systeme: Tour 4 `quand tu es fatigué`; Tour 9 `Tu finis cette étape encouragé`.
- Correction attendue: transmettre un signal d'accord/persona fiable au visible prompt ou utiliser des formulations neutres si ce signal n'est pas garanti.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/skills/weekly_review/visible_agent.ts`, `supabase/functions/sophia-brain/skills/weekly_review/local_flow.ts`, `weekly_review_local_flow_test.ts`
- Tests requis: run Rose avec plusieurs reformulations emotionnelles; anti-faux-positif avec persona sans genre connu ou formulation neutre. Couvert contractuellement par `prefer_gender_neutral_wording_when_not_certain` et `do_not_use_gendered_adjectives_unless_conversation_context_confirms_gender`; a verifier en prochain run IA reel.

### R5-B03

- Bug id: `R5-B03`
- Tours: Tour 9
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: `weekly_review` synthesis
- Source amont: `weekly_synthesis` conversation_context / visible agent
- Symptome visible: synthese trop positive: `rigoureux sur le rangement`, alors que le user avait dit `je l’ai fait trois jours puis j’ai relâché`.
- Preuve systeme: Tour 2 user donne un statut partiel; Tour 9 synthese transforme ce statut en evaluation trop favorable.
- Correction attendue: le contexte de synthese doit conserver les statuts exacts par action, les limites et les incertitudes; le prompt doit interdire d'embellir une completion partielle.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/skills/weekly_review/visible_agent.ts`, `supabase/functions/sophia-brain/skills/weekly_review/local_flow.ts`, `weekly_review_local_flow_test.ts`
- Tests requis: action tenue partiellement; Sophia doit synthetiser `tenu X jours puis relache`, pas `rigoureux`; correction utilisateur doit mettre a jour la synthese. Couvert par le contexte `partial_statuses_must_remain_partial` et la consigne `weekly_synthesis`; a verifier en prochain run IA reel.

### R5-B04

- Bug id: `R5-B04`
- Tours: Durable apres Tour 11
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `weekly_review` durable state
- Source amont: coexistence entre nouveau `weekly_flow_state` et ancien sous-etat `weekly_adaptive_review.plan_patch`
- Symptome visible: pas visible directement; risque de legacy durable apres un flow pourtant clos.
- Preuve systeme: durable t11 contient `weekly_adaptive_review.plan_patch.requires_confirmation=true` avec des operations `carry_over_item`, alors que le V1 vise detours locaux et pas patch weekly legacy.
- Correction attendue: retirer ou neutraliser ce sous-etat legacy du runtime V1; ne garder que l'etat utile au local dispatcher et aux detours.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/skills/weekly_review/local_flow.ts`, `weekly_review_local_flow_test.ts`
- Tests requis: scan durable apres weekly closure; absence de `plan_patch` legacy ou presence strictement read-only documentee; aucun carry-over parasite. Couvert par `weekly local reducer continues normally with visible-safe context`.

### R5-B05

- Bug id: `R5-B05`
- Tours: Cleanup
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: runner QA `tmp/weekly_local_real_qa.mjs`
- Source amont: logique `createdScopes` du cleanup trop large
- Symptome visible: aucun cote user; cleanup supprime un scope QA qui ne correspond pas au run courant.
- Preuve systeme: cleanup r5 indique `deleted_created_user_chat_states` avec `qa-rose-2026-06-12-weekly-local-dispatcher-weekly-full-20260612-r5-rose` et `qa-product-help-to-adjust-plan-20260612-r1`.
- Correction attendue: le cleanup doit supprimer uniquement les scopes crees explicitement par ce run, ou exiger une allowlist de scopes avec le run id courant.
- Statut: `open`
- Fix reference: a renseigner.
- Tests requis: cleanup avec un scope concurrent cree apres snapshot; le runner ne doit pas le supprimer; cleanup normal du scope run courant reste vert.
