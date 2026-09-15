# Product Help Runtime R1

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `product-help-runtime-r1`
- Persona: `qa-skill`, connexion temporaire
  `product_help_product_help_20260602_r1`
- Objectif: tester `product_help` en runtime IA reel sur des questions de
  navigation produit, de Plan et de Ressources, sans creation ni mutation.
- Trajectoire: question Plan ambigue consultation/modification, correction vers
  consultation seule, question cartes sans creation, correction apres mauvais
  brouillon.
- Surfaces visees: `product_help`, arbitration product/status/tool, active flow
  policy, `adjust_plan_item`, `prepare_attack_card`, `one_shot_reminder`,
  EffectLedger.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`,
  `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe,
  aucun fallback direct `processMessage`.
- Validite QA: valide. Les 5 tours ont retourne HTTP 200, `empty_response=false`,
  `aborted=false`, `trace_error=null`. La connexion temporaire et les donnees du
  user QA ont ete nettoyees de facon ciblee en fin de run.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-03` - Product/status/tool mal
priorises, avec composante `BF-INTAKE-03` sur la contrainte "juste comprendre".

**User**
> Dans l'app Sophia, si je veux juste comprendre ou modifier ce qui est prevu cette semaine, je dois aller ou exactement ?

**Sophia**
> Je dois d'abord verrouiller la derniere precision : tu veux juste consulter ce qui est prevu cette semaine, ou tu veux deja modifier un element precis du niveau actuel ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `central_arbitrator_product_help_priority`
- safety: low
- direct_effects: `[]`
- operation: `adjust_plan_item`
- pending_confirmation: null
- memory_plan: none/minimal
- executed_tools: `[]`
- durable_effect: aucun commit; platform handoff `adjust_plan_item` delivered,
  `no_chat_mutation=true`

**Analyse si yellow/red**
- Symptome: Sophia transforme une demande "ou regarder / comprendre dans
  l'app" en clarification d'ajustement de plan, au lieu de rendre une aide
  produit sur Dashboard > Plan.
- Source amont probable: arbitration product/status/tool et intake
  `adjust_plan_item` trop agressif sur "modifier ce qui est prevu".
- Owner runtime: TurnAgenda / route arbitration + `adjust_plan_item` intake,
  avec contrat `product_help` comme invariant a respecter.
- Meilleure correction selon les guidelines: faire primer la lecture produit
  "ou/comment dans l'app" quand le message demande une destination UI, et ne
  laisser `adjust_plan_item` prendre la main que si le user demande vraiment de
  changer le plan.
- Pourquoi ce n'est pas un patch local: le contrat `product_help` dit que
  "ou retrouver / modifier / annuler dans l'app" reste non-mutant; corriger une
  phrase dans le renderer ne changerait pas la selection d'owner.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-02` - Ancien flow capture une
nouvelle intention.

**User**
> Juste consulter, pas modifier. Je veux savoir dans quelle partie du dashboard regarder la semaine en cours.

**Sophia**
> Pour te guider au bon endroit, il me manque juste le nom de la vue que tu vois dans ton dashboard : "semaine", "planning" ou "niveau actuel" ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `product_help_inline_resume_active_tool_skill`
- safety: low
- direct_effects: `[]`
- operation: `adjust_plan_item`
- pending_confirmation: null
- memory_plan: non pertinent
- executed_tools: `[]`
- durable_effect: aucun commit; ledger `proposed=1`, `delivered=1`, platform
  handoff `adjust_plan_item`, `no_chat_mutation=true`

**Analyse si yellow/red**
- Symptome: la correction explicite "pas modifier" ne sort pas du flow
  `adjust_plan_item`; Sophia redemande un slot UI au lieu de dire ou aller.
- Source amont probable: active flow arbitration / inline product help resume
  mal applique apres un mauvais owner initial.
- Owner runtime: active flow policy + TurnAgenda.
- Meilleure correction selon les guidelines: reconnaitre une negation/correction
  produit comme interruption du handoff actif et rerouter vers `product_help`.
- Pourquoi ce n'est pas un patch local: le probleme est la priorite du message
  courant sur l'ancien flow, invariant de la charte anti-patching.

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** `[]`

**User**
> Non, oublie la modification. Je veux juste le chemin de navigation dans l'app pour voir la semaine active.

**Sophia**
> Plan: Le Plan est l'espace principal d'execution d'une transformation active. Il montre les niveaux, les semaines, les elements du plan et l'avancement.
>
> Comment l'utiliser: Dans le dashboard, selectionne une transformation dans la colonne de gauche puis ouvre l'onglet Plan. Tu y vois le niveau actif, les semaines, les missions, habitudes, clarifications et elements a venir. Les bilans hebdomadaires ne se saisissent pas dans le Plan: ils se font par message WhatsApp le dimanche pour faire le point sur la semaine. Il n'existe pas d'endroit pour ajouter librement une action dans le dashboard.
>
> Ce que ca apporte:
> - Donne une vue claire de ce qui est a faire maintenant.
> - Evite de melanger les actions du moment avec toute la transformation. 🙂

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

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-03` - Contrainte explicite perdue,
avec `BF-ROUTE-03` sur la priorite product/help/tool.

**User**
> Et cote Ressources, comment je distingue une carte d'attaque d'une carte de defense sans en creer une maintenant ?

**Sophia**
> Cible/action comprise : Et cote Ressources, comment je distingue une carte d'attaque d'une carte de defense sans en creer une maintenant ?
>
> Obstacle ou piege identifie : Piege de demarrage ou d'evitement identifie pendant l'intake.
>
> Technique recommandee : Le texte magique
> Pourquoi : Cela permet de clarifier l'intention derriere chaque outil et de choisir la bonne posture.
>
> Brouillon de carte :
> Distinction Attaque vs Defense
> L'attaque prepare mon terrain avant l'obstacle. La defense me protege quand l'obstacle est la. Je choisis l'attaque pour ne pas avoir a me defendre.
> Mode d'emploi : Lis ce texte quand tu sens la resistance monter pour te rappeler pourquoi tu agis.
>
> A preserver :
> - L'attaque prepare mon terrain avant l'obstacle. La defense me protege quand l'obstacle est la. Je choisis l'attaque pour ne pas avoir a me defendre.
> - L'attaque est proactive
> - La defense est reactive
>
> A eviter :
> - Transformer ce brouillon en promesse trop longue.
> - Ajouter plusieurs techniques concurrentes dans la meme carte.
>
> Destination plateforme : dans la section Cartes d'attaque
> 1. ouvre la section Cartes
> 2. choisis Carte d'attaque
> 3. reprends le brouillon propose
>
> Je ne cree pas la carte depuis le chat. Voici la version a reprendre dans la section Cartes d'attaque. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `prepare_attack_card_interrupts_active_handoff`
- safety: low
- direct_effects: `[]`
- operation: `prepare_attack_card` platform handoff
- pending_confirmation: null
- memory_plan: non pertinent
- executed_tools: `[]`
- durable_effect: aucun commit; ledger delivered platform handoff
  `prepare_attack_card`, `no_chat_mutation=true`

**Analyse si yellow/red**
- Symptome: la demande explicite "sans en creer une" produit un brouillon de
  carte d'attaque et une destination plateforme, au lieu d'une comparaison
  Product Help simple.
- Source amont probable: intake `prepare_attack_card` ignore la contrainte
  negative et capture les mots "carte d'attaque".
- Owner runtime: arbitration product/tool + `prepare_attack_card` intake.
- Meilleure correction selon les guidelines: classer les questions "distinguer",
  "a quoi ca sert", "sans creer" comme `product_help.compare_features` ou
  `explain_feature`, et ajouter des tests anti-FP pour les demandes de creation
  reelles.
- Pourquoi ce n'est pas un patch local: le renderer de carte a suivi son owner;
  le bug est l'admission du mauvais domaine malgre une contrainte explicite.

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-03` - Product/status/tool mal
priorises, avec `BF-EFFECT-01` warning car un effet durable a ete demande avant
d'etre bloque.

**User**
> Stop, je ne veux pas de brouillon de carte. Dis-moi seulement ou je retrouve une carte deja generee si elle est liee a une mission.

**Sophia**
> Il me manque le moment exact pour programmer ce rappel. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `create_one_shot_reminder`
- route_reason: `skill_entry_signal`
- safety: low
- direct_effects: `[]`
- operation: `one_shot_reminder.create`
- pending_confirmation: null
- memory_plan: non pertinent
- executed_tools: `[]`
- durable_effect: ledger `requested=1`, `blocked=1`; effect
  `one_shot_reminder.create` blocked by `missing_time`, source `executor`

**Analyse si yellow/red**
- Symptome: "retrouve une carte" est interprete comme rappel a programmer.
- Source amont probable: one-shot reminder intake / router lexicalise "retrouve"
  ou le contexte recent au mauvais domaine, sans respecter "carte deja generee"
  ni "seulement ou".
- Owner runtime: product/tool arbitration + `one_shot_reminder` route guards.
- Meilleure correction selon les guidelines: renforcer l'exclusion
  `product_help`/objet carte pour les questions "ou retrouver", et bloquer
  l'admission reminder quand aucun moment n'est demande et que l'objet courant
  est une carte.
- Pourquoi ce n'est pas un patch local: le warning systeme vient d'une demande
  d'effet durable construite par le mauvais tool; le fix doit etre au route
  guard/intake et prouve par EffectLedger.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 3 donne enfin une reponse utile et non-mutante sur Dashboard > Plan.
- Les tours en erreur ne committent pas d'effet durable.

**Problemes**
- Tour 1: Sophia demande une clarification operationnelle alors que le besoin
  humain est "ou aller dans l'app". Famille: `BF-ROUTE-03`. Impact:
  l'utilisateur doit se defendre d'une intention de modification.
- Tour 2: la correction "pas modifier" n'est pas respectee. Famille:
  `BF-ROUTE-02`. Impact: frustration et impression que Sophia n'ecoute pas.
- Tour 4: une question comparative "sans creer" devient un brouillon de carte.
  Famille: `BF-INTAKE-03`. Impact: l'aide produit devient une action non
  demandee.
- Tour 5: une question "ou retrouver une carte" devient un rappel a programmer.
  Famille: `BF-ROUTE-03`. Impact: reponse incoherente et rupture de confiance.

**Fix propose**
- Source amont: arbitration product/status/tool, active flow interruption,
  intakes `adjust_plan_item`, `prepare_attack_card` et `one_shot_reminder`.
- Correction recommandee: formaliser au niveau TurnAgenda/route guards que
  "ou/comment dans l'app", "distinguer", "retrouver", "sans creer", "seulement
  ou" sont des signaux non-mutants `product_help`, sauf commande d'action
  explicite.
- Tests d'invariant attendus: run reel Product Help post-fix; tests route pour
  Plan navigation vs ajustement; cartes explain/compare sans creation vs vraie
  creation; "ou retrouver une carte" vs "programme-moi un rappel".

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le run montre trois mauvais owners sur cinq tours: `adjust_plan_item`,
  `prepare_attack_card`, puis `create_one_shot_reminder`.
- Le tour 2 montre une capture par active flow apres un mauvais tour initial.
- Le tour 3 prouve que `product_help` peut repondre correctement quand il est
  selectionne.

**Skills / Operations / Tools**
- Aucun executor ne commit d'effet, mais le tour 5 construit quand meme une
  demande durable `one_shot_reminder.create` avant blocage `missing_time`.
- Les handoffs plateforme des tours 1, 2 et 4 sont non-mutants mais hors
  intention utilisateur.
- `product_help` respecte son contrat uniquement au tour 3.

**Memory / Effets durables**
- Aucun effet durable committe.
- Connexion temporaire nettoyee par `qa-cleanup-run-connection.sh`.
- `tests/real-personas/qa-skill/reset-log.md` a ete mis a jour par le reset
  cible du user QA.

**Problemes**
- Tours 1-2: product help navigation capture par `adjust_plan_item`.
  Familles: `BF-ROUTE-03`, `BF-ROUTE-02`. Impact systeme: mauvais owner et
  mauvais handoff actif.
- Tour 4: contrainte "sans creer" perdue au profit de `prepare_attack_card`.
  Famille: `BF-INTAKE-03`. Impact systeme: handoff plateforme non demande.
- Tour 5: question carte capturee par `one_shot_reminder`. Familles:
  `BF-ROUTE-03`, warning `BF-EFFECT-01`. Impact systeme: effet durable demande
  par le mauvais domaine, heure manquante seulement au blocage.

**Fix propose**
- Source amont: TurnAgenda / route arbitration, route guards de tools, intake
  des tool skills concernes.
- Correction recommandee: appliquer le contrat `product_help` avant admission
  tool pour les demandes UI non-mutantes, puis faire respecter les contraintes
  negatives par les intakes tool avant toute construction d'effet ou handoff.
- Tests d'invariant attendus: `run_product_help_guard.test.ts` avec paraphrases
  de ce run, tests `skills_s3` Product Help non-mutant, tests anti-FP tools
  montrant que les commandes explicites continuent a router vers les tools.

## Verdict Global

- Verdict: red
- Raison principale: Product Help n'est pas proprietaire de plusieurs demandes
  produit explicites et non-mutantes; trois mauvais tool skills capturent le run.
- Follow-up prioritaire: corriger l'arbitration product/tool et les guards
  d'admission tool pour que les questions "ou/comment/distinguer/retrouver" ne
  deviennent jamais des handoffs ou effets sans commande explicite.
