# product_help Runtime Contract

## Mental Model

`product_help` est un conversation skill d'explication produit grounded. Il
répond aux questions de type "à quoi ça sert", "comment faire", "où retrouver",
"où modifier/annuler dans l'app", "quelles limites", et peut indiquer quel flow
outil utiliser.

Il n'est pas un tool, pas un status composer et pas un writer DB. Il ne crée,
modifie, annule, programme, active, enregistre ou applique jamais rien. Une
action demandée par le user devient au maximum une explication de destination
plateforme ou une clarification. Il n'expose pas de confirmation exécutable.

## Dépend De L'Architecture De product_help

Ce domaine dépend de :

- `UserTurnSnapshot` pour lire l'état complet du tour ;
- `TurnAgenda` pour distinguer reply/effects/status/memory/repair ;
- `Confirmation Contract` pour reconnaître qu'une approbation de handoff
  plateforme reste non exécutable ;
- `EffectLedger` pour ne jamais dire "c'est fait" sans effet committé ;
- le contrat local de `product_help` pour l'intake, la décision, le grounding,
  le bridge et le renderer.

Utilisation actuelle dans le code :

- le runtime global ne passe pas encore un objet `UserTurnSnapshot` unique au
  skill ; `runProductHelpSkill` reçoit un `SkillContext` composé dans
  `skills/_shared/skill_helpers.ts` et `context_loader.ts`, avec `turn_frame`,
  `recent_messages`, `active_skill_working_state`, `product_surfaces`,
  plan/memory projections et exclusions ;
- `TurnAgenda` reste propriétaire des conflits globaux. `product_help` ne décide
  pas seul de prendre le tour contre safety, status ou un tool explicite. Dans
  `router/run.ts`, `runConversationSkillForRecommendation` appelle seulement
  `runProductHelpSkill(input)` quand le route owner sélectionné est
  `product_help` ;
- `Confirmation Contract` n'est pas appliqué par `product_help`, car ce skill ne
  possède aucun pending exécutable. Une réponse "oui/non/change ça/explique"
  relative à un handoff actif appartient au platform handoff skill propriétaire
  ; si le user pose une vraie question produit inline, `product_help` ajoute la
  contrainte `preserve_active_flow` et ne valide pas le pending ;
- `EffectLedger` protège le wording global, mais `product_help` applique aussi
  son invariant local dans `enforceProductHelpReplyInvariants`: sans source
  committée/récente, les claims de type "j'ai créé", "c'est programmé", "j'ai
  modifié", "j'ai enregistré" sont neutralisés ;
- le contrat local est `skills/product_help/contract.ts`. Il définit
  `ProductHelpDecision`, `ProductHelpIntent`, `ProductHelpTargetKind`,
  `ProductHelpConstraint`, le bridge, le grounding et
  `validateProductHelpDecision`.

## Runtime Shape

```txt
router/run.ts
  -> runConversationSkillForRecommendation(...)
  -> skills/product_help/skill.ts::runProductHelpSkill(...)
  -> retrieval.ts::retrieveProductHelpCandidates(...)
  -> intake.ts::runProductHelpStructuredIntake(...)
       -> collectRecentProductObjectCandidates(...)
       -> defaultProductHelpIntakeModel(...) via generateWithGemini
       -> normalizeProductHelpDecision(...)
       -> conservativeProductHelpFallback(...) only on technical failure
  -> reducer.ts::reduceProductHelpTurn(...)
       -> contract.ts::validateProductHelpDecision(...)
       -> renderer.ts::renderProductHelpReply(...)
       -> renderer.ts::enforceProductHelpReplyInvariants(...)
  -> ConversationSkillOutput with operation_suggestions=[]
```

Il n'y a pas de reducer mutatif pour ce domaine. `reducer.ts` possède seulement
la transition locale non-mutante vers `ConversationSkillOutput`, le
`state_patch` diagnostique et les effets vides ou bloqués en cas d'échec
technique d'intake.

## File Ownership

- Contrat local :
  `supabase/functions/sophia-brain/skills/product_help/contract.ts`
  - `ProductHelpDecision`
  - `baseProductHelpDecision`
  - `validateProductHelpDecision`
- Intake structuré :
  `supabase/functions/sophia-brain/skills/product_help/intake.ts`
  - `ProductHelpStructuredIntakeInput`
  - `ProductHelpIntakeModel`
  - `collectRecentProductObjectCandidates`
  - `runProductHelpStructuredIntake`
  - `normalizeProductHelpDecision`
  - `legacyProductHelpHeuristicIntake`
- Retrieval/catalogue :
  `supabase/functions/sophia-brain/skills/product_help/retrieval.ts`
  - `retrieveProductHelpCandidates`
  - `getProductHelpFeature`
  - `pickCatalogFeatureForObject`
  - `choosePrimaryCatalogCandidate`
  - `catalogFeatureIds`
- Catalogue source :
  `supabase/functions/sophia-brain/skills/product_help/knowledge.ts`
  - `PRODUCT_HELP_FEATURES`
  - locations, limits, `sophia_must_not_claim`, `operation_bridge`
- Prompt intake :
  `supabase/functions/sophia-brain/skills/product_help/prompt.ts`
  - `PRODUCT_HELP_PROMPT`
  - `PRODUCT_HELP_PROMPT_VERSION`
- Renderer user-facing :
  `supabase/functions/sophia-brain/skills/product_help/renderer.ts`
  - `renderProductHelpReply`
  - `renderCatalog`
  - `enforceProductHelpReplyInvariants`
- Reducer non-mutant :
  `supabase/functions/sophia-brain/skills/product_help/reducer.ts`
  - `reduceProductHelpTurn`
  - `PRODUCT_HELP_REDUCER_INVARIANTS`
- Façade du skill :
  `supabase/functions/sophia-brain/skills/product_help/skill.ts`
  - `runProductHelpSkill`
- Context loader :
  `supabase/functions/sophia-brain/skills/product_help/context_loader.ts`
  - `loadProductHelpContext`
- Intégration globale : `supabase/functions/sophia-brain/router/run.ts`
  - `runConversationSkillForRecommendation`
  - `shouldRunRecommendationTool`
  - logging `skill_run` et effect ledger global.

## Inputs

- `user_message` courant ;
- `recent_messages` pour contexte conversationnel compact ;
- `active_skill_working_state` pour préserver un flow actif sans le valider ;
- `turn_frame` pour signals dispatcher, intents tool, direct effects,
  action/level references et user id ;
- `product_surfaces` venant du registry produit ;
- candidats catalogue issus de `retrieveProductHelpCandidates` ;
- candidats objets récents issus de `collectRecentProductObjectCandidates`.

Les candidats déterministes sont du recall, pas le cerveau métier. La décision
finale `intent / target / object_type / bridge / grounding requirement` vient du
JSON structuré de l'intake, puis de la normalisation du contrat.

## Outputs

- `ConversationSkillOutput.skill_id = "product_help"` ;
- `status = "complete"` ;
- `reply` user-facing grounded par catalogue + sources choisies ;
- `diagnosis.feature_id`, `intent`, `target`, `grounding`, `bridge`,
  `constraints`, `locations` ;
- `recommendation_need.needed = false` ;
- `operation_suggestions = []` toujours ;
- `state_patch.product_help_decision` pour observabilité.

`product_help` ne produit aucun `requested_effect`, `allowed_effect`,
`committed_effect`, `handoff_request` opérationnel ou DB write. Si une future
version ajoute un ledger local, il devra rester vide pour les mutations et ne
pourra porter que des traces diagnostiques non-mutantes.

## Responsibilities

Appartient à `product_help` :

- expliquer une feature produit depuis `knowledge.ts` ;
- distinguer aide produit générique vs question sur un objet réel ;
- répondre "où retrouver / modifier / annuler dans l'app" sans muter ;
- signaler les limites produit du catalogue ;
- proposer une explication de destination plateforme ;
- préserver un active flow quand la question produit est inline ;
- refuser d'affirmer l'existence ou l'état d'un objet réel sans source ;
- garder `operation_suggestions=[]`.

N'appartient pas à `product_help` :

- créer, modifier, annuler, programmer, activer ou enregistrer ;
- appliquer une confirmation pending ;
- rendre un status/recap DB complet ;
- décider globalement qu'un status doit céder à product_help ;
- écrire dans la DB ou appeler un writer DB ;
- remplir les slots d'un tool skill ;
- faire une recommandation produit indépendante après sa réponse.

## Reducer / State Transition

`product_help` n'a pas de reducer mutatif parce qu'il ne possède pas de workflow
durable. La transition locale se limite à :

1. intake structuré vers `ProductHelpDecision` ;
2. `validateProductHelpDecision` pour forcer les invariants ;
3. renderer pour produire la réponse ;
4. `state_patch` diagnostique.

`reducer.ts` existe aujourd'hui pour harmoniser la forme contractuelle avec les
autres conversation skills. Il ne crée pas de pending exécutable, n'interprète
pas de confirmation et ne convertit pas `decision.bridge` en effet.

## Effects Preparation

`product_help` ne prépare aucun effet exécutable. Le seul mécanisme proche d'un
effet est `decision.bridge`, qui décrit un flow possible :

- `prepare_attack_card`
- `prepare_defense_card`
- `select_state_potion`
- `create_recurring_reminder`
- `one_shot_reminder`
- `adjust_plan_item`
- `update_coach_preferences`

Ce bridge reste explicatif. Pour les flows complexes, il indique la destination
plateforme et ne doit jamais être converti en `operation_suggestions`,
`handoff_request`, `requested_effect` ou `allowed_effect` par `product_help`.

## Effects Application

Aucune application d'effet n'appartient à ce domaine. Les effets directs sont
appliqués uniquement par les chat executable tool skills propriétaires. Les
flows complexes deviennent des platform handoff skills sans mutation chat.

Si le user demande "crée/annule/programme/active/modifie", l'intake doit classer
`intent="tool_action_request"` et le renderer doit répondre par la destination
plateforme ou par le direct effect autorisé. Le skill ne doit pas faire plus.

## Renderer

`renderer.ts` est le seul propriétaire de la réponse user-facing pour ce skill :

- `renderProductHelpReply` choisit entre réponse catalogue, missing source,
  one-shot reminder grounded ou bridge tool ;
- `renderCatalog` utilise `knowledge.ts` pour explain/how_to/benefits/locations
  et limits ;
- `renderMissingSource` empêche les affirmations d'objet réel sans source ;
- `renderToolBridge` rend une réponse non-mutante pour les demandes d'action ;
- `enforceProductHelpReplyInvariants` neutralise le done-language non sourcé et
  respecte `sophia_must_not_claim`.

Le renderer ne lit pas la DB et ne décide pas le routage. Il rend uniquement une
décision déjà normalisée.

## Invariants

- `operation_suggestions` vaut toujours `[]`.
- `product_help` ne mute jamais.
- Aucun "j'ai créé", "j'ai annulé", "c'est programmé", "j'ai modifié", "j'ai
  enregistré", "c'est appliqué" sans source committée/récente explicite.
- Un `bridge` de flow complexe indique une destination plateforme et reste non
  exécutable.
- Un `bridge` reste diagnostique et visible seulement : il ne remplit pas
  `effects.requested`, `effects.allowed`, `operation_suggestions` ni
  `handoff_request`.
- `tool_action_request` ne déclenche pas le tool ; il explique le handoff.
- `object_status_question` ne devient pas une réponse catalogue générique.
- `db_sources_required=true` sans source récente/DB/active flow produit une
  réponse prudente, pas une affirmation d'existence.
- Si `target.kind` vaut `user_object` ou `recent_effect`, `object_type` doit
  être présent ou la cible est dégradée en `unknown`.
- Le message courant prime sur le contexte récent pour carte/rappel/potion.
- Le contexte récent ne résout un pronom que si le message courant est ambigu.
- Une question produit inline pendant un active flow ajoute
  `preserve_active_flow` et ne recopie pas le draft pending.
- Le prompt ne force pas d'emoji.

## Integration Points

- `router/run.ts::runConversationSkillForRecommendation` attend
  `runProductHelpSkill`.
- `router/run.ts` ne réoriente pas hors `product_help` depuis le texte brut.
  Une opération concurrente doit déjà exister dans `TurnFrame.tool_skill_intents`
  ou `direct_effects`; en conflit avec product_help, l'arbitrage global clarifie
  ou bloque au lieu de deviner.
- `status_recap` reste propriétaire des états réels et des blocs recap.
- Les chat executable tool skills restent propriétaires des effets directs.
- Les platform handoff skills restent propriétaires des recommandations
  complexes et de leurs destinations plateforme.
- `EffectLedger` global protège la réponse finale contre les claims non
  committés, en complément des invariants locaux du renderer.

## Allowed Changes

- Ajouter une feature dans `knowledge.ts`.
- Ajouter des aliases ou améliorer le recall dans `retrieval.ts`, tant que la
  décision finale reste dans l'intake structuré.
- Ajouter une location, limite, `sophia_must_not_claim` ou bridge catalogue.
- Ajouter un champ de diagnostic non-mutant dans `state_patch`.
- Renforcer `validateProductHelpDecision` ou le renderer pour bloquer une
  contradiction de contrat.
- Renforcer `reducer.ts` pour garder des effets vides/non-mutants.
- Ajouter des tests avec `intake_model` stubbé.

## Forbidden Changes

- Ajouter une regex métier de décision finale dans `run.ts`, L3/L4 ou
  `skill.ts`.
- Faire d'un candidat catalogue le choix final sans intake structuré.
- Faire du fallback technique un ancien arbre lexical complet.
- Ajouter `operation_suggestions` ou `executedTools`.
- Convertir `decision.bridge` en `handoff_request`, `requested_effect` ou
  `allowed_effect`.
- Écrire en DB depuis `product_help`.
- Appliquer une confirmation pending ou un handoff complexe.
- Rendre un status complet.
- Affirmer un objet réel sans source choisie dans `grounding.db_sources_used`.
- Forcer un emoji ou une question finale de style.

## Legacy Exceptions

`intake.ts::legacyProductHelpHeuristicIntake` reste exporté temporairement pour
les tests de compatibilité et les comparaisons d'urgence. Il protège les
scénarios historiques carte/rappel/pronom/catalogue pendant que l'intake IA est
déployé.

Conditions de suppression :

- les tests `skills_s3.test.ts` doivent tous utiliser des décisions structurées
  stubbées ou des fixtures JSON sans appeler le legacy ;
- au moins un run QA réel doit confirmer les paraphrases carte/rappel/pronom,
  status vs help, tool action vs bridge, et active flow inline ;
- aucune dépendance de production ne doit référencer
  `legacyProductHelpHeuristicIntake`.

Le fallback production autorisé est seulement `conservativeProductHelpFallback`,
déclenché par échec technique ou JSON inexploitable. Il ne doit pas inventer de
bridge ou d'objet réel.

## Required Tests

Tests principaux dans `supabase/functions/sophia-brain/skills/skills_s3.test.ts`
:

- `product_help uses structured intake model decision`
- `product_help intake failure uses non-mutating conservative fallback`
- `product_help prompt does not force emoji`
- `product_help legacy heuristic intake is not the default structured path`
- `product_help scenarios never start operations`
- `product_help tool action requests are bridge only, never execution` (incluant
  `effects.requested=[]`, `effects.allowed=[]` et aucun `handoff_request`)
- `product_help status question is not rendered as generic catalog help`
- `product_help modify/cancel location stays product help and non-mutating`
- `product_help catalog covers defense free creation and potion follow-up`
- `product_help catalog reflects dashboard action corrections`
- `product_help explanation then ok fais-le routes through dispatcher tool skill
  intent`
- `product_help: user asks about the card when context has a recent reminder`
- `product_help: user asks about the reminder only`
- `product_help: current reminder mention wins over recent card`
- `product_help: user pronoun 'la' for the recently created card still resolves
  to card`
- `product_help active flow is preserved for inline product question`
- `product_help no done language without committed source`

Tests d'intégration route dans
`supabase/functions/sophia-brain/router/run_product_help_guard.test.ts` :

- `conversation skill reply override lets product_help own its factual answer`
- `one-shot reminder management question gets factual product wording`
- `one-shot reminder management handles pronominal follow-up`
- `'où je vais modifier/supprimer dans l'app' est du product_help, pas une
  modification`
- `C1: status detector still fires on A2-r7 T4, so the product_help guard is
  what protects it`
- guards anti-FP sur annulation, status, recap et product-help exit.

Commandes minimales :

```txt
deno test --allow-env --allow-net --allow-read --filter "product_help" supabase/functions/sophia-brain/skills/skills_s3.test.ts
deno test --allow-env --allow-net --allow-read supabase/functions/sophia-brain/router/run_product_help_guard.test.ts
deno check supabase/functions/sophia-brain/skills/product_help/skill.ts supabase/functions/sophia-brain/skills/product_help/contract.ts supabase/functions/sophia-brain/skills/product_help/intake.ts supabase/functions/sophia-brain/skills/product_help/retrieval.ts supabase/functions/sophia-brain/skills/product_help/renderer.ts supabase/functions/sophia-brain/router/run.ts
```

## Suivi Des Décisions Architecturales

| Date       | Décision                                                                                                                                                | Statut | Référence                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------- |
| 2026-05-29 | Product help est un skill d'explication grounded, pas un tool ni status.                                                                                | Active | `15-chantiers-log.md` J13 |
| 2026-05-29 | L'intake IA structuré devient le chemin normal ; le déterministe reste recall/fallback conservateur seulement.                                          | Active | `15-chantiers-log.md` J22 |
| 2026-05-30 | Le contrat runtime de `product_help` devient la base opérationnelle pour empêcher regex métier, fallback legacy production et mutation depuis ce skill. | Active | `15-chantiers-log.md` J50 |
| 2026-05-30 | `product_help/reducer.ts` est propriétaire d'une transition non-mutante ; un bridge reste diagnostic/rendu et ne devient pas un effet conversationnel.  | Active | `15-chantiers-log.md`     |
