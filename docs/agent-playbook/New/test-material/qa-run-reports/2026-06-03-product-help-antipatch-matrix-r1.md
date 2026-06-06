# QA Run Report — Product Help Anti-Patching Matrix R1

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `product-help-antipatch-matrix-20260603-r1`
- Persona:
  `qa-normal-product-help-antipatch-matrix-20260603-r1-1780503694141@example.com`
- Objectif: rejouer la correction product_help selon la charte anti-patching QA:
  tour rouge, paraphrase, anti-faux-positif, mini-run multi-skill.
- Trajectoire: `product_help` comparaison -> paraphrase -> clarification
  attack/defense -> résolution vers tool skill sans exécution -> interruption
  product_help/status.
- Surfaces visees: dispatcher, product_help,
  clarification_tool/orientation_clarification, prepare_defense_card intake,
  active flow interruption, effects guard.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`,
  `force_full_ai=true`, aucun fallback déterministe, messages choisis tour par
  tour après lecture des réponses.
- Validite QA: valide; run local réel, réponse et traces issues de `state.json`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-RENDER-01` — Réponse incomplète ou
surface mal rendue

**User**

> Explique-moi la différence entre une carte d'attaque et une carte de défense.

**Sophia**

> Cartes d'attaque et de defense: Une carte d'attaque aide a demarrer ou
> preparer une action: elle reduit la friction avant de commencer et clarifie le
> premier geste. Une carte de defense protege un moment de risque: elle anticipe
> ce qui peut faire derailler l'action et prepare une reponse simple ou un plan
> B. En pratique, l'attaque repond a « comment je m'y mets ? »; la defense
> repond a « qu'est-ce qui risque de me faire devier, et quoi faire a ce
> moment-la ? ».
>
> Comment l'utiliser: Utilise une carte d'attaque quand l'action est voulue mais
> difficile a lancer, ou quand il faut preparer le terrain avant le moment
> d'action. Utilise une carte de defense quand le probleme est un piege sur le
> moment: evitement, impulsion, pression, fatigue, reaction automatique ou
> risque de craquer. Les deux peuvent coexister pour une meme action: attaque
> pour entrer dans l'action, defense pour tenir quand le contexte deraille.
>
> Ce que ca apporte:
>
> - Evite de confondre preparation de l'action et protection contre un risque.
> - Aide a choisir la bonne ressource selon le besoin actuel. 🙂

**Trace courte**

- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no clarification state
- executed_tools: `[]`
- durable_effect: aucun; `scheduled_checkins=[]`

**Analyse si yellow/red**

- Symptome: Sophia répond correctement au fond, mais répète quasiment texto la
  réponse du tour 1 alors que le user demande une aide de choix contextualisée.
- Source amont probable: renderer/intake `product_help` pour `compare_features`.
- Owner runtime: `product_help`.
- Meilleure correction selon les guidelines: rendre la réponse
  `compare_features` capable de répondre au besoin courant, sans retomber sur le
  bloc catalogue complet.
- Pourquoi ce n'est pas un patch local: le défaut concerne la forme de réponse
  du skill pour toute comparaison suivie d'une demande de choix, pas cette
  phrase exacte.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-RENDER-01` — Réponse incomplète ou
surface mal rendue

**User**

> Ok, dit autrement : attaque vs défense, je choisis quoi quand je veux juste me
> mettre à l'action ?

**Sophia**

> Cartes d'attaque et de defense: Une carte d'attaque aide a demarrer ou
> preparer une action: elle reduit la friction avant de commencer et clarifie le
> premier geste. Une carte de defense protege un moment de risque: elle anticipe
> ce qui peut faire derailler l'action et prepare une reponse simple ou un plan
> B. En pratique, l'attaque repond a « comment je m'y mets ? »; la defense
> repond a « qu'est-ce qui risque de me faire devier, et quoi faire a ce
> moment-la ? ».
>
> Comment l'utiliser: Utilise une carte d'attaque quand l'action est voulue mais
> difficile a lancer, ou quand il faut preparer le terrain avant le moment
> d'action. Utilise une carte de defense quand le probleme est un piege sur le
> moment: evitement, impulsion, pression, fatigue, reaction automatique ou
> risque de craquer. Les deux peuvent coexister pour une meme action: attaque
> pour entrer dans l'action, defense pour tenir quand le contexte deraille.
>
> Ce que ca apporte:
>
> - Evite de confondre preparation de l'action et protection contre un risque.
> - Aide a choisir la bonne ressource selon le besoin actuel. 🙂

**Trace courte**

- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `skill_entry_signal`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: no clarification state
- executed_tools: `[]`
- durable_effect: aucun; `scheduled_checkins=[]`

**Analyse si yellow/red**

- Symptome: Sophia répond avec une fiche catalogue complète au lieu de répondre
  directement à “où je la retrouverai si elle existe”.
- Source amont probable: renderer `product_help` pour `where_is_it` /
  localisation conditionnelle.
- Owner runtime: `product_help`.
- Meilleure correction selon les guidelines: utiliser l'intent structuré
  `where_is_it` et le contrat `must_include_location` pour rendre une réponse
  courte de localisation + limite d'existence.
- Pourquoi ce n'est pas un patch local: le défaut concerne le renderer de
  localisation produit, pas une formulation particulière du user.

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**

> Maintenant ce n'est plus une explication : j'aimerais créer une carte de
> défense et une carte d'attaque.

**Sophia**

> Par laquelle de ces deux cartes veux-tu commencer : l'attaque ou la défense ?
> 🙂

**Trace courte**

- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: `__clarification_state_v1` présent; candidats
  `prepare_defense_card` + `prepare_attack_card`; `no_chat_mutation=true`
- executed_tools: `[]`
- durable_effect: aucun; `scheduled_checkins=[]`

**Analyse si yellow/red**

- n/a

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**

> La défense d'abord.

**Sophia**

> Ok, pour quelle action ou quel contexte veux-tu préparer une carte de défense
> ? 🙂

**Trace courte**

- http_status: `200`
- response_owner: `tool_skill`
- selected_handler: `prepare_defense_card`
- route_reason: `orientation_clarification_resolved_tool_skill`
- safety: `low`
- direct_effects: `[]`
- operation: `prepare_defense_card` intake seulement
- pending_confirmation: `null`
- memory_plan: `__active_tool_skill_intake` présent; slots manquants
  `attachment`, `risk_situation`
- executed_tools: `[]`
- durable_effect: aucun; `scheduled_checkins=[]`; `tool_execution=blocked`

**Analyse si yellow/red**

- n/a

### Tour 5

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**

> Stop pour la création, je veux juste savoir où je retrouverai une carte
> d'attaque si elle existe.

**Sophia**

> Carte d'attaque: Une carte d'attaque sert a preparer l'action en amont. Elle
> rend le bon geste plus simple, plus naturel et moins couteux au moment de
> passer a l'action. Elle peut s'appuyer sur 6 techniques: Le texte magique,
> Mantra de force, Ancre visuelle, Meditation de 5 minutes, Preparer le terrain,
> Mot de bascule.
>
> Comment l'utiliser: Depuis une mission ou une habitude, tu peux generer des
> cartes liees au plan si l'option est disponible. La carte d'attaque se
> retrouve ensuite dans Ressources, rangee par niveau. Processus: choisir la
> technique adaptee, repondre a son mini-questionnaire, generer l'objet concret,
> puis l'utiliser selon son mode d'emploi.
>
> Ce que ca apporte:
>
> - Reduit la friction avant l'action.
> - Clarifie le premier geste et le mode d'emploi.
>
> Important: une carte d'attaque generee ne se modifie pas librement; seul le
> mot peut etre remplace sur une carte Mot de bascule depuis Ressources. Pour
> changer le contexte, la technique ou le contenu, il faut preparer une nouvelle
> carte apres confirmation. 🙂

**Trace courte**

- http_status: `200`
- response_owner: `product_help`
- selected_handler: `product_help`
- route_reason: `product_help_inline_resume_active_tool_skill`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- memory_plan: active tool flow suspendu; `__suspended_flow_v1` présent
- executed_tools: `[]`
- durable_effect: aucun; `scheduled_checkins=[]`

**Analyse si yellow/red**

- n/a

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**

- La réponse comparative est complète sur le tour original.
- Sophia ne vouvoie pas.
- La demande de création des deux cartes n'est pas capturée par `product_help`;
  elle passe par `orientation_clarification`.
- La clarification pose une seule question discriminante et stocke un état
  non-mutant.
- La résolution vers `prepare_defense_card` collecte les slots manquants sans
  exécution.
- L'interruption “Stop pour la création” est respectée: retour à `product_help`,
  flow suspendu, aucun effet durable.

**Problemes**

- Tour 2: répétition texto du tour 1 au lieu d'une réponse contextualisée.
  Famille: `BF-RENDER-01`. Impact: Sophia paraît mécanique et ne répond pas à
  “je choisis quoi”. Severite: yellow.
- Tour 5: réponse catalogue complète au lieu d'une réponse directe de
  localisation conditionnelle. Famille: `BF-RENDER-01`. Impact: réponse trop
  longue, et la limite “si elle existe” n'est pas assez frontale. Severite:
  yellow.

**Fix propose**

- Source amont: `product_help` intake/renderer.
- Correction recommandee: réponse `compare_features` contextualisée quand le
  modèle fournit une `reply`; fallback court pour comparaison; renderer dédié
  pour `where_is_it` avec localisation + limite d'existence, sans bloc catalogue
  complet.
- Tests d'invariant attendus: conserver la ressource comparative product_help,
  préserver `orientation_clarification` pour action attack+defense, garder les
  tool skills non exécutés tant que slots/confirmation manquent, éviter les
  réponses identiques sur follow-up.

## 4. Verdict Global

yellow — routing et non-mutation sont corrects, mais `product_help` doit encore
corriger deux défauts de rendu.
