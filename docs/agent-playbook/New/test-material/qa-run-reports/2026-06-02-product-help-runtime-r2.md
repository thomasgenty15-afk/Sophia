# Product Help Runtime R2

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `product-help-runtime-r2`
- Persona: `qa-skill`, connexion temporaire
  `product_help_product_help_runtime_r2_20260602`
- Objectif: rerun IA reel de `product_help` apres analyse des faux routings
  Plan/Ressources/cartes/rappels, sans modification de code pendant le run.
- Trajectoire: question de navigation Plan avec mention de modification,
  correction consultation seule, comparaison cartes sans creation, localisation
  d'une carte deja generee et liee a une mission.
- Surfaces visees: `product_help`, dispatcher, TurnFrame, active flow policy,
  `adjust_plan_item`, `prepare_attack_card`, `one_shot_reminder`, EffectLedger.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`,
  `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe,
  aucun fallback direct `processMessage`.
- Validite QA: valide. Les 5 tours ont retourne HTTP 200, `empty_response=false`,
  `aborted=false`, `trace_error=null`. La connexion temporaire a ete nettoyee de
  facon ciblee en fin de run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - cible produit mal extraite
dans `product_help`.

**User**
> Dans Sophia, si je veux seulement savoir où consulter la semaine en cours, et éventuellement comprendre où ça se modifierait plus tard, je dois regarder quelle partie du dashboard ?

**Sophia**
> Clarifications: Les clarifications sont des elements guides du plan pour comprendre une situation, poser un repere ou clarifier un blocage avant d'agir.
>
> Comment l'utiliser: Dans le Plan, ouvre une carte de type Clarification ou Exercice de clarification. Selon l'item, tu peux ouvrir une fiche guidee ou un exercice structure.
>
> Ce que ca apporte:
> - Aide a ne pas executer trop vite quand le probleme est encore flou.
> - Transforme une confusion en information exploitable. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: low
- direct_effects: `[]`
- operation: none
- pending_confirmation: null
- memory_plan: non pertinent
- executed_tools: `[]`
- durable_effect: aucun ledger entry

**Analyse si yellow/red**
- Symptome: le routing est bon, mais `product_help` choisit
  `plan.clarifications` au lieu de la vue Plan/semaine active.
- Source amont probable: structured intake `product_help` cible trop fortement
  "comprendre" et ignore "semaine en cours / partie du dashboard".
- Owner runtime: `product_help` structured intake / catalog targeting.
- Meilleure correction selon les guidelines: corriger la selection de feature
  par intention de navigation UI, pas ajouter de regex locale.
- Pourquoi ce n'est pas un patch local: le renderer repond correctement a la
  mauvaise feature; le bug est l'extraction de cible.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - correction utilisateur non
prise en compte dans `product_help`.

**User**
> Non, pas les clarifications. Je cherche juste la vue du dashboard pour voir la semaine active et les éléments prévus, sans modifier quoi que ce soit.

**Sophia**
> Clarifications: Les clarifications sont des elements guides du plan pour comprendre une situation, poser un repere ou clarifier un blocage avant d'agir.
>
> Comment l'utiliser: Dans le Plan, ouvre une carte de type Clarification ou Exercice de clarification. Selon l'item, tu peux ouvrir une fiche guidee ou un exercice structure.
>
> Ce que ca apporte:
> - Aide a ne pas executer trop vite quand le probleme est encore flou.
> - Transforme une confusion en information exploitable. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: low
- direct_effects: `[]`
- operation: none
- pending_confirmation: null
- memory_plan: non pertinent
- executed_tools: `[]`
- durable_effect: aucun ledger entry

**Analyse si yellow/red**
- Symptome: la correction explicite "pas les clarifications" ne change pas la
  cible; Sophia repete la meme mauvaise fiche.
- Source amont probable: intake `product_help` ne traite pas la correction de
  cible produit dans le contexte immediat.
- Owner runtime: `product_help` structured intake / correction handling.
- Meilleure correction selon les guidelines: faire porter par l'intake structure
  la cible corrigee (`dashboard.plan` / semaine active) et une contrainte
  `non_mutating`.
- Pourquoi ce n'est pas un patch local: le probleme est la cible catalogue, pas
  le wording de sortie.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - reponse partielle sur une
comparaison produit.

**User**
> Ok, laisse la vue semaine. Dans Ressources, quelle différence je dois comprendre entre une carte d’attaque et une carte de défense, sans me préparer de carte maintenant ?

**Sophia**
> Carte de defense: Une carte de defense sert quand quelque chose risque de faire derailler l'action: impulsion, piege, pression, evitement ou reaction automatique.
>
> Comment l'utiliser: Une carte de defense peut etre generee librement depuis Ressources, ou etre liee au plan depuis une mission ou une habitude. Elle se retrouve ensuite dans Ressources, ou elle peut etre consultee et utilisee. Processus: identifier un moment concret, reperer le piege observable, definir mon geste faisable en moins de 30 secondes, puis prevoir un plan B simple.
>
> Ce que ca apporte:
> - Donne une reponse simple pour les moments de risque.
> - Anticipe les pieges concrets.
>
> Important: une carte de defense peut etre ajustee depuis la plateforme/Ressources quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, on peut en preparer une nouvelle version apres confirmation. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: low
- direct_effects: `[]`
- operation: none
- pending_confirmation: null
- memory_plan: non pertinent
- executed_tools: `[]`
- durable_effect: aucun ledger entry

**Analyse si yellow/red**
- Symptome: forte amelioration de routing: aucun `prepare_attack_card`.
  Cependant, la reponse explique surtout la carte de defense et ne compare pas
  clairement attaque vs defense.
- Source amont probable: product_help target choisit `resources.defense_card`
  au lieu d'un intent `compare_features` sur `attack_card` + `defense_card`.
- Owner runtime: `product_help` structured intake / multi-feature comparison.
- Meilleure correction selon les guidelines: modeliser la comparaison comme une
  intention produit structuree, non mutante.
- Pourquoi ce n'est pas un patch local: la bonne sortie depend de deux features
  et d'une intention comparative, pas d'un texte fixe.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - cible objet durable mal
extraite.

**User**
> Je ne veux toujours rien créer. Si une carte a déjà été générée depuis une mission, je la retrouve où dans l’interface ?

**Sophia**
> Missions: Une mission est une action ponctuelle prevue par le plan pour faire avancer concretement la transformation.
>
> Comment l'utiliser: Dans le Plan, ouvre la semaine ou le niveau actif, trouve la mission, puis valide-la quand elle est faite.
>
> Ce que ca apporte:
> - Rend la transformation executable par petits gestes concrets.
> - Evite de transformer le plan en reflexion abstraite. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: low
- direct_effects: `[]`
- operation: none
- pending_confirmation: null
- memory_plan: non pertinent
- executed_tools: `[]`
- durable_effect: aucun ledger entry

**Analyse si yellow/red**
- Symptome: forte amelioration systeme: aucun `create_one_shot_reminder`,
  aucun requested effect. Mais Sophia explique `plan.missions` au lieu de dire
  ou retrouver la carte liee a une mission.
- Source amont probable: product_help target choisit le support contextuel
  "mission" plutot que l'objet principal "carte deja generee".
- Owner runtime: `product_help` structured intake / object relation targeting.
- Meilleure correction selon les guidelines: distinguer `object=card`,
  `relation=linked_to_mission`, `intent=where_is_it`.
- Pourquoi ce n'est pas un patch local: le bug est la representation de la
  question, pas la phrase de reponse.

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - correction de cible ignoree.

**User**
> Je parle de la carte elle-même, pas de valider la mission. Est-ce qu’elle est dans Ressources > Cartes, ou visible depuis la mission liée ?

**Sophia**
> Missions: Une mission est une action ponctuelle prevue par le plan pour faire avancer concretement la transformation.
>
> Comment l'utiliser: Dans le Plan, ouvre la semaine ou le niveau actif, trouve la mission, puis valide-la quand elle est faite.
>
> Ce que ca apporte:
> - Rend la transformation executable par petits gestes concrets.
> - Evite de transformer le plan en reflexion abstraite. 🙂

**Trace courte**
- http_status: 200
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: low
- direct_effects: `[]`
- operation: none
- pending_confirmation: null
- memory_plan: non pertinent
- executed_tools: `[]`
- durable_effect: aucun ledger entry

**Analyse si yellow/red**
- Symptome: la correction "carte elle-même, pas mission" est ignoree et la
  meme fiche `Missions` est repetee.
- Source amont probable: intake `product_help` ne gere pas correctement les
  corrections de cible au sein du skill et conserve `plan.missions`.
- Owner runtime: `product_help` structured intake / correction handling.
- Meilleure correction selon les guidelines: prioriser la cible corrigee du
  message courant sur la cible precedente, sans handoff ni effet durable.
- Pourquoi ce n'est pas un patch local: le diagnostic produit reste faux.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia ne force plus l'utilisateur dans un outil operationnel.
- Aucun brouillon de carte ni demande de rappel n'apparait.
- Les reponses restent non mutantes et relativement sobres.

**Problemes**
- Tours 1-2: Sophia reste sur `Clarifications` alors que l'utilisateur demande
  la vue de la semaine active. Famille: `BF-INTAKE-03`. Impact: l'utilisateur
  doit corriger sans obtenir la bonne destination. Severite: red.
- Tour 3: la comparaison attaque/defense devient enfin non mutante, mais la
  reponse est incomplete. Famille: `BF-INTAKE-03`. Impact: aide partielle.
  Severite: yellow.
- Tours 4-5: Sophia ne retrouve pas la cible "carte" et repond "Missions".
  Famille: `BF-INTAKE-03`. Impact: la question de localisation produit reste
  sans reponse malgre correction explicite. Severite: red.

**Fix propose**
- Source amont: `product_help` structured intake / catalog target selection.
- Correction recommandee: ajouter des sorties structurees pour
  `where_is_it`, `compare_features`, `object_relation`, et correction de cible
  intra-skill, sans regex de routing.
- Tests d'invariant attendus: Plan semaine active, carte liee a mission,
  comparaison attaque/defense, avec paraphrases et anti-FP vraies demandes de
  modification/creation.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tous les tours passent par `response_owner=product_help` et
  `selected_handler=product_help`.
- `tool_skill_intents=[]` et `direct_effects=[]` sur les cinq tours.
- Les anciens faux routings `adjust_plan_item`, `prepare_attack_card` et
  `create_one_shot_reminder` ne se reproduisent pas dans cette variante.

**Skills / Operations / Tools**
- `product_help` s'execute correctement comme skill conversationnel non mutant.
- `product_help` produit cependant des diagnostics de feature incorrects:
  `plan.clarifications` pour la semaine active, puis `plan.missions` pour une
  carte liee a une mission.
- Tour 3 cible `resources.defense_card` au lieu d'une comparaison multi-feature
  `resources.attack_card` + `resources.defense_card`.

**Memory / Effets durables**
- `executed_tools=[]` sur tous les tours.
- EffectLedger: `requested=0`, `allowed=0`, `blocked=0`, `committed=0` sur tous
  les tours.
- Aucun effet durable errone n'a ete demande ni bloque.

**Problemes**
- Tours 1-5: routing global assaini, mais intake produit trop approximatif.
  Famille: `BF-INTAKE-03`. Impact systeme: mauvais `feature_id` dans le skill
  final, reponses catalogue a cote de la question. Severite: yellow/red selon
  le tour.

**Fix propose**
- Source amont: `skills/product_help/intake.ts` et contrat de sortie structuree
  du skill.
- Correction recommandee: mieux representer les questions de localisation et de
  comparaison dans l'intake IA, et faire porter les corrections utilisateur par
  le message courant.
- Tests d'invariant attendus: integration `force_full_ai` Product Help avec
  verification `response_owner=product_help`, `effect_ledger.counts.requested=0`
  et feature cible correcte.

## Verdict Global

- Verdict: yellow
- Raison principale: les faux routings operationnels observes en R1 ne se
  reproduisent pas, mais `product_help` repond encore avec de mauvaises cibles
  catalogue.
- Follow-up prioritaire: corriger `product_help` structured intake pour les
  intents `where_is_it`, `compare_features`, cible corrigee, et relation
  carte-mission.
