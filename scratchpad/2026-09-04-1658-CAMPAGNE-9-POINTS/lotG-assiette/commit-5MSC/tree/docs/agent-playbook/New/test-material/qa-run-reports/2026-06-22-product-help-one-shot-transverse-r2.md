# QA Run Report - Product Help One-Shot Reminder Transverse R2

## 1. Contexte Du Test

- Date: 2026-06-22
- Run: `product-help-one-shot-transverse-20260622-r2`
- Persona: `qa-skill`, connexions temporaires locales:
  - `product_help_product_help_one_shot_global_20260622_r2`
  - `product_help_product_help_one_shot_local_20260622_r2`
  - `product_help_product_help_one_shot_antifp_20260622_r2`
- Objectif: verifier sur 3 variantes que Product Help et `create_one_shot_reminder` cohabitent correctement entre dispatcher global, Product Help local et lane directe.
- Trajectoire:
  - R2.1: cold start global, question Product Help + rappel explicite.
  - R2.2: conversation Product Help en deux tours, puis question Product Help + rappel explicite.
  - R2.3: anti-faux-positif, duree conversationnelle sans demande de rappel.
- Surfaces visees: `/functions/v1/test-send-message`, `force_full_ai=true`, dispatcher global, `product_help`, direct-effect lane, `create_one_shot_reminder`, `scheduled_checkins`, trace courte.
- Cadre IA reel: Supabase local, auth locale par refresh token, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct, pas de staging/remote.
- Validite QA: valide. Les 3 variantes passent par le chemin IA reel local et conservent les artefacts bruts dans `tmp/qa-one-shot-transverse/`.

## 2. Tours De Conversation

### Run R2.1 - Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-02 - Commit reel mal rendu

**User**
> Dans Sophia, est-ce qu une carte d attaque sert plutot a demarrer une action ou a eviter un craquage ? Et rappelle-moi demain a 9h de relire ta reponse.

**Sophia**
> C'est programmé pour mardi 23 juin à 09:00: je te ferai un rappel pour relire ta reponse.
>
> Oui : une carte d’attaque sert surtout à démarrer ou préparer l’action. Pour éviter un craquage, c’est plutôt une carte de défense. C'est programmé pour mardi 23 juin à 09:00 : je te ferai un rappel pour relire ta réponse.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_with_direct_effects`
- active_flow_arbitration: `minimal_global_dispatcher`, `active_owner=none`, `selected_owner=product_help`
- safety: `none`
- direct_effects: `["create_one_shot_reminder"]`
- operation: direct-effect lane `create_one_shot_reminder`
- pending_confirmation: none
- memory_plan: `product_help_with_reminder`, `memory_mode=none`, `retrieval_policy=force_taxonomy`
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: `scheduled_checkins.id=e65a76c6-c113-437d-92f9-660f64667eb3`, `scheduled_for=2026-06-23T07:00:00+00:00`, instruction `relire ta reponse`

**Analyse si yellow/red**
- Symptome: le rappel est confirme deux fois dans la reponse visible.
- Source amont probable: composition final response / merge entre `visible_confirmation_hint` de la direct-effect lane et visible Product Help qui reformule aussi la confirmation.
- Owner runtime: final response composition ou guard visible direct-effect confirmation pour Product Help.
- Meilleure correction selon les guidelines: faire consommer `direct_effect_confirmation_context` de maniere idempotente: une seule couche doit rendre la confirmation user-facing.
- Pourquoi ce n'est pas un patch local: le commit est correct et Product Help repond au besoin produit; le bug est dans la composition transverse post-commit.

### Run R2.2 - Tour 1

**Verdict du tour:** green

**User**
> Je suis un peu perdu dans Sophia : a quoi sert exactement une carte d attaque par rapport a une carte de defense ?

**Sophia**
> Une carte d’attaque t’aide à entrer dans l’action : elle simplifie le premier pas et enlève de la friction. Une carte de défense sert à te protéger au moment où ça peut déraper : elle anticipe un risque et prépare une réponse simple.
>
> En bref : attaque = comment je m’y mets ; défense = comment je tiens si ça coince.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- active_flow_arbitration: `minimal_global_dispatcher`, `active_owner=none`, `selected_owner=product_help`
- safety: `none`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: `explain_product_surface_comparison`
- executed_tools: `[]`
- durable_effect: none

### Run R2.2 - Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-02 - Commit reel mal rendu

**User**
> Ok, et si je veux retrouver ce type de carte plus tard, c est ou dans l app ? Rappelle-moi dans 45 minutes de relire cette explication.

**Sophia**
> C'est programmé pour lundi 22 juin à 21:54: je te ferai un rappel pour relire cette explication.
>
> C’est programmé pour lundi 22 juin à 21:54 : je te ferai un rappel pour relire cette explication.
>
> Pour retrouver ce type de carte, va dans Dashboard > Ressources. Si elle est liée à une mission ou une habitude, tu peux aussi la voir depuis Dashboard > Plan, puis retrouver la carte dans Ressources.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_with_direct_effects`
- active_flow_arbitration: `minimal_global_dispatcher`, `active_owner=none`, `selected_owner=product_help`
- safety: `none`
- direct_effects: `["create_one_shot_reminder"]`
- operation: direct-effect lane `create_one_shot_reminder`
- pending_confirmation: none
- memory_plan: `answer_product_location_question_and_acknowledge_reminder`
- executed_tools: `["create_one_shot_reminder"]`
- durable_effect: `scheduled_checkins.id=88f21651-9ff0-4c23-9a2c-152b8c441417`, `scheduled_for=2026-06-22T19:54:43.754+00:00`, instruction `relire cette explication`

**Analyse si yellow/red**
- Symptome: meme double confirmation que R2.1, mais le produit reste correctement repondu apres le commit.
- Source amont probable: final response merge entre confirmation directe et visible Product Help.
- Owner runtime: final response composition / direct-effect confirmation rendering.
- Meilleure correction selon les guidelines: dedupliquer la confirmation apres commit; le visible agent doit soit recevoir un contexte indiquant que la confirmation a deja ete rendue, soit ne jamais la rendre si la composition globale l'ajoute.
- Pourquoi ce n'est pas un patch local: le probleme se reproduit sur deux variantes et depend du merge transverse direct-effect + Product Help, pas d'une phrase exacte.

### Run R2.3 - Tour 1

**Verdict du tour:** green

**User**
> J ai deux minutes, explique-moi vite ou se trouvent les cartes d attaque dans Sophia.

**Sophia**
> Les cartes d’attaque sont dans Dashboard > Ressources. Tu peux aussi les voir depuis Dashboard > Plan, sur la mission ou l’habitude concernée. La carte est rangée par niveau.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- active_flow_arbitration: `minimal_global_dispatcher`, `active_owner=none`, `selected_owner=product_help`
- safety: `none`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: `Explain where attack cards are located in Sophia`
- executed_tools: `[]`
- durable_effect: none; `scheduled_checkins=[]`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia comprend bien les deux intentions: question Product Help + demande de rappel.
- Les reponses produit sont courtes, utiles et dans le bon domaine.
- L'anti-faux-positif est bon: "J ai deux minutes" n'est pas transforme en rappel.

**Problemes**
- Run R2.1 T1 et R2.2 T2: la confirmation du rappel est repetee deux fois. Famille: BF-LEDGER-02. Impact: friction visible, impression de bug de composition, mais pas de faux effet durable. Severite: yellow.

**Fix propose**
- Source amont: composition finale entre direct-effect lane et visible Product Help.
- Correction recommandee: rendre la confirmation de `create_one_shot_reminder` exactement une fois. Une option propre: la lane directe fournit `visible_confirmation_hint`, puis le visible Product Help recoit un contexte `already_rendered` ou une consigne de ne pas repeter la confirmation si la composition globale l'ajoute deja.
- Tests d'invariant attendus: Product Help + one-shot commit => une seule occurrence de la confirmation; Product Help sans commit => aucune confirmation; anti-FP duree conversationnelle => aucun scheduled_checkin.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- R2.1: le dispatcher global selectionne bien `product_help` avec `direct_effects_to_run=["create_one_shot_reminder"]`.
- R2.2: le second tour re-selectionne correctement `product_help` avec direct effect, et ne laisse pas le rappel absorber la question produit.
- R2.3: Product Help reste Product Help, sans direct effect.

**Skills / Operations / Tools**
- `product_help` repond au besoin produit dans les 3 variantes.
- La direct-effect lane execute `create_one_shot_reminder` dans les deux variantes explicites.
- Aucun executor n'est appele dans l'anti-faux-positif.

**Memory / Effets durables**
- R2.1 cree exactement un `scheduled_checkins` pending pour `relire ta reponse`.
- R2.2 cree exactement un `scheduled_checkins` pending pour `relire cette explication`.
- R2.3 ne cree aucun `scheduled_checkins`.

**Problemes**
- Run R2.1 T1 et R2.2 T2: commit reel mal rendu par double confirmation visible. Famille: BF-LEDGER-02. Impact systeme: le durable est correct, mais le rendu final consomme deux sources de confirmation. Severite: yellow.

**Fix propose**
- Source amont: final response pipeline / merge direct-effect runtime into visible Product Help runtime.
- Correction recommandee: introduire ou respecter une regle d'idempotence du rendu de confirmation depuis `direct_effect_confirmation_context`; le commit peut exister dans la trace et la DB, mais une seule couche ecrit la phrase visible.
- Tests d'invariant attendus: test runtime Product Help + direct effect avec assertion textuelle "une seule confirmation", plus run QA post-fix R2.1/R2.2.

## Verdict Global

- Verdict: yellow
- Raison principale: le routage et les effets durables sont corrects, y compris Product Help + `create_one_shot_reminder`, mais la confirmation visible est dupliquee sur les deux cas positifs.
- Follow-up prioritaire: dedupliquer la confirmation post-commit dans la composition finale direct-effect + Product Help, puis relancer R2.1/R2.2.

## Note Post-Fix

- Statut: bug `PH-OS-R2-B01` verifie corrige.
- Fix: suppression des prefixes visibles deterministes dans `operation_runtime_pipeline` et `router/run.ts`; le runtime conserve ledger/trace, le visible agent formule depuis `committed_effects`.
- Rerun: `product-help-one-shot-postfix2-20260622-r4`.
- Resultat: `executed_tools=["create_one_shot_reminder"]`, `scheduled_checkins.id=db3fccb2-a628-409b-a230-2919c7b23345`, reponse Product Help naturelle avec une seule confirmation: "Et je te le rappelle mardi 23 juin à 11:00 pour revoir cette nuance."
