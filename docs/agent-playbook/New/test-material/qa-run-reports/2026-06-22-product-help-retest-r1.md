# QA Run Report - Product Help Retest R1

## 1. Contexte Du Test

- Date: 2026-06-22, Europe/Paris.
- Run: `product_help_retest_20260622_r1`.
- Persona: temp QA `qa-skill`, connexion `product_help_retest_product_help_retest_20260622_r1`.
- Objectif: verifier les fixes Product Help / Coaching Recommendation / one-shot reminder multi-intent.
- Trajectoire: Product Help initial, follow-up coaching naturel, question produit + rappel ponctuel, sortie coaching vers produit, anti-FP sans creation.
- Surfaces visees: global dispatcher, product_help, coaching_recommendation, active_skill_state, direct effect `create_one_shot_reminder`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer/executor appele directement, aucun redemarrage Supabase.
- Validite QA: valide. Messages choisis tour par tour apres lecture des reponses et traces courtes.
- Artefacts: `tests/real-personas/qa-skill/runs/product_help/product_help_retest_20260622_r1.*`.
- DB snapshot: `tests/real-personas/qa-skill/runs/product_help/product_help_retest_20260622_r1.db_after_t06.json` et `product_help_retest_20260622_r1.reminders_after_t06.json`.
- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-22-product-help-retest-r1-bugs.md`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> J'hésite entre ajuster mon plan et faire une carte d'attaque : dans Sophia, ça sert à quoi chacun ?

**Sophia**
> L’ajustement du plan sert quand le fond du plan ne colle plus : trop lourd, mal placé, devenu invalide ou à revoir.
> La carte d’attaque sert à préparer le passage à l’action : rendre le premier geste plus simple, plus clair et moins coûteux.
>
> En bref : plan à revoir = ajustement ; action à préparer = carte d’attaque.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- safety: `none`
- direct_effects: `[]`
- operation: none
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Ok, si mon but c'est juste de me remettre en mouvement tout de suite sans changer le plan, tu m'orientes vers quoi ?

**Sophia**
> Plutôt une carte d’attaque si tu veux te remettre en mouvement sans toucher au plan. Mais pour te guider proprement : c’est quoi l’action qui te bloque ?

**Trace courte**
- http_status: `200`
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- skill signal: `coaching_recommendation`, `coaching_type=plan_action`, `needs_type_confirmation=true`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: none

**Analyse**
- Le routing vers coaching est acceptable.
- Le fix visible est valide: la clarification ne liste plus les categories internes et demande l'action bloquee.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-LEDGER-02` / `BF-TEST-01`

**User**
> Petite question produit : une carte d'attaque, je peux la modifier après coup ? Et rappelle-moi demain à 9h de vérifier ça.

**Sophia**
> C'est programmé pour mardi 23 juin à 09:00: je te ferai un rappel pour vérifier ça.
>
> Une carte d’attaque ne se modifie pas librement après coup : si elle ne colle plus, il faut en refaire une nouvelle version. Et c’est noté pour mardi 23 juin à 09:00 : je te ferai un rappel pour vérifier ça. Par rapport à quelle mission ou habitude tu veux te débloquer ?

**Trace courte**
- http_status: `200`
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation_with_direct_effects`
- skill signal: `product_help`, reason `product_help_question_with_one_shot_reminder`
- direct_effects: `create_one_shot_reminder`, explicit, identified, high
- direct_effects_to_run: `["create_one_shot_reminder"]`
- tool_skill_run: `create_one_shot_reminder`, `status=success`
- committed_effect: id `85ed82df-97b2-47b2-a5f1-83ff90f4ec6e`, scheduled_for `2026-06-23T07:00:00+00:00`, local `mardi 23 juin à 09:00`
- DB projection: `scheduled_checkins.status=pending`, `event_context=one_shot_reminder:verifier_ca`
- effect_ledger: counts all `0`

**Analyse si yellow/red**
- Symptome: le fix principal marche: rappel detecte, execute et present en DB. Mais la confirmation visible du rappel est dupliquee.
- Source amont probable: final response merge entre direct effect content et visible coaching reply.
- Owner runtime: final response / direct-effect confirmation context.
- Meilleure correction selon les guidelines: le visible agent local doit savoir qu'un commit direct effect a deja ete rendu ou le merge final doit dedupliquer la confirmation commitee.
- Pourquoi ce n'est pas un patch local: le rappel est transverse et peut se combiner avec plusieurs skills; la dedup doit vivre dans la pipeline de rendu/ledger, pas dans une phrase Product Help.

### Tour 4

**Verdict du tour:** green

**User**
> Je change de sujet : question produit seulement, quand Sophia propose une carte d'attaque, est-ce que ça modifie mon plan ou c'est séparé ?

**Sophia**
> C’est séparé : une carte d’attaque sert à te remettre en mouvement sans modifier ton plan.  
> Si elle ne colle plus, tu la refais ; ton plan, lui, reste inchangé 🙂

**Trace courte**
- http_status: `200`
- response_owner: `normal_reply`
- route_reason: `coaching_recommendation_exit_to_global`
- skill_run: `coaching_recommendation`, `status=exit`, `exit_target=global`
- incoming signal: `product_help`
- direct_effects: `[]`
- executed_tools: `[]`

**Analyse**
- Le comportement est acceptable sur ce tour: le flow actif sort vers global et repond au sujet produit.
- Le point critique est verifie au tour suivant: l'active state ne doit pas rester stale.

### Tour 5

**Verdict du tour:** green

**User**
> Question produit seulement : où est-ce que je retrouve mes cartes d'attaque une fois préparées ?

**Sophia**
> Tu les retrouves dans Dashboard > Ressources, rangées par niveau. Si la carte d’attaque vient d’une mission ou d’une habitude du Plan, elle apparaît aussi sur l’item concerné.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- direct_effects: `[]`
- executed_tools: `[]`
- durable_effect: none
- DB active_state apres run: `null`

**Analyse**
- Le bug precedent `active_coaching_recommendation` stale est corrige conversationnellement.

### Tour 6

**Verdict du tour:** green

**User**
> Et si je veux juste consulter mes cartes existantes sans rien créer, c'est une vue ou ça lance une nouvelle carte ?

**Sophia**
> Tu la retrouves dans Dashboard > Ressources. C’est l’endroit pour consulter tes cartes existantes, pas pour en lancer une nouvelle. Certaines cartes ne sont visibles que si elles ont déjà été générées.

**Trace courte**
- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_signal`
- direct_effects: `[]`
- direct_effects_to_run: `[]`
- executed_tools: `[]`
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Product Help repond clairement aux questions produit.
- Le follow-up coaching T2 est naturel et ne sort plus une taxonomie interne.
- Apres sortie coaching, les questions Product Help suivantes ne sont plus capturees.
- Le rappel T3 est vraiment programme et la reponse ne ment pas sur le commit.

**Problemes**
- Tour 3: rappel confirme deux fois. Famille: `BF-LEDGER-02`. Impact: reponse lourde et un peu mecanique. Severite: yellow.
- Tour 3: la reponse produit sur la modification de carte semble ferme ("ne se modifie pas librement") mais reste plausible selon le comportement plateforme observe; a verifier avec source produit canonique si necessaire.

**Fix propose**
- Source amont: final response merge / direct effect confirmation context.
- Correction recommandee: quand `operationRuntime.content` confirme deja un direct effect committe, le visible skill ne doit pas re-confirmer le meme commit; il peut seulement traiter la question produit/coaching restante.
- Tests d'invariant attendus: multi-intent product_help + reminder avec commit unique dans le visible; anti-FP sans reminder; skill actif + direct effect.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- T1 product_help: OK.
- T2 coaching_recommendation: OK, besoin coaching identifiable.
- T3: OK sur le fix principal. Le dispatcher produit `product_help` + `create_one_shot_reminder`; le router execute le direct effect pendant que coaching garde l'ownership.
- T4: OK, exit local vers global.
- T5/T6: OK, Product Help reprend; active state final `null`.

**Skills / Operations / Tools**
- `create_one_shot_reminder` execute en T3 avec `tool_skill_run.status=success`.
- DB confirme `scheduled_checkins` pending id `85ed82df-97b2-47b2-a5f1-83ff90f4ec6e`.
- Aucun effet durable en T1/T2/T4/T5/T6.

**Warnings systeme**
- `conversation_turn_traces` retourne 0 ligne via REST pour ce user, comme sur le run precedent.
- `effect_ledger` dans la trace courte affiche counts `0` au T3 malgre `tool_skill_run.committed_effects` et DB OK. Famille: `BF-TEST-01` / observabilite ledger.

## Verdict Global

YELLOW.

Les corrections principales sont validees: Product Help initial OK, clarification coaching naturelle, one-shot reminder multi-intent detecte et committe, active state stale corrige, anti-faux-positif sans creation OK. Le run n'est pas green a cause du rendu visible duplique du rappel et de l'observabilite ledger incoherente sur le commit.
