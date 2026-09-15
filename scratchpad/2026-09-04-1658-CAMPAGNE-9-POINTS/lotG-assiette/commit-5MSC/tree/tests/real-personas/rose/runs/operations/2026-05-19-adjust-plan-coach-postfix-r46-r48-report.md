# QA Run Report - Adjust Plan Niveau + Whole Plan r46-r48

## 1. Contexte Du Test

- Date: 2026-05-19
- Runs: `r46-level-strict-postfix`, `r48-whole-plan-directional-postfix`
- Persona: Rose, connexion locale, login password vérifié.
- Objectif: retester les flows ajustement niveau et whole plan après correctifs 20/80.
- Trajectoire: allègement du niveau courant puis ajustement structurel du plan global.
- Surfaces visées: `adjust_plan_item`, scope routing, coach spécialisé, draft review, executor, séparation/régénération du plan.
- Cadre IA réel: endpoint local `test-send-message`, `force_full_ai=true`, Supabase local. Note: le endpoint a été servi via Deno local pour contourner le gateway local qui ne chargeait pas correctement les variables IA.
- Validité QA: valide. Les deux runs ont été pilotés tour par tour, sans fallback direct `processMessage`.
- Nettoyage: effectué après chaque run; état initial Rose restauré.

## 2. Tours De Conversation

### Run r46-level-strict-postfix

#### Tour 1

**User**
> Le niveau actuel me semble trop dense cette semaine. Je ne veux pas revoir tout le plan, juste alléger le niveau en gardant le signal de pause comme priorité.

**Sophia**
> Tu souhaites alléger le niveau actuel en gardant le signal de pause comme priorité. Pour cela, quelles actions ou habitudes aimerais-tu ajuster ? Par exemple, penses-tu à 'Partager un point positif' ou à d'autres éléments ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- executed_tools: []
- durable_effect: none

#### Tour 2

**User**
> Le plus lourd c'est 'Partager un point positif'. Je veux passer cette action à 2 jours cette semaine. Prépare un brouillon sans appliquer, et ne touche pas au signal de pause ni au reste.

**Sophia**
> Je te propose d'ajuster ton plan pour cette semaine. Pour alléger la charge que tu ressens avec l'habitude 'Partager un point positif', je te suggère de réduire sa fréquence de 3 jours par semaine à 2 jours par semaine, uniquement pour cette semaine. [...] Rien d'autre ne sera modifié [...] Qu'en penses-tu ? Rien n'est appliqué tant que tu n'as pas validé. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- executed_tools: []
- durable_effect: none

#### Tour 3

**User**
> Oui, j'accepte. Applique uniquement ça : 'Partager un point positif' à 2 jours cette semaine, et rien d'autre ne change.

**Sophia**
> C'est fait ! J'ai ajusté ton plan pour cette semaine. L'habitude 'Partager un point positif' est maintenant prévue pour 2 jours cette semaine, au lieu de 3. [...] Le reste de ton plan, y compris 'Convenir d'un signal de pause' et 'Faire le point sur le signal de pause', reste inchangé.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- executed_tools: [`adjust_plan_item`]
- durable_effect: `Partager un point positif` passe de `target_reps=3`, `cadence_label=3 jours / semaine` à `target_reps=2`, `cadence_label=2 jours / semaine`; les autres items restent inchangés.
- cleanup: 4 items restaurés, 1 plan actif restauré.

### Run r48-whole-plan-directional-postfix

#### Tour 1

**User**
> En regardant la suite du plan, j'ai un doute plus global : la troisième partie me paraît trop rapide, surtout l'étape suivante. Je ne parle pas d'une action de cette semaine, je veux revoir la trajectoire.

**Sophia**
> Pour que je puisse t'aider à revoir la trajectoire, qu'est-ce qui te donne l'impression que la troisième partie, ou l'étape suivante, est trop rapide ? Est-ce la quantité d'actions, leur complexité, l'intensité émotionnelle ou le temps alloué ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- executed_tools: []
- durable_effect: none

#### Tour 2

**User**
> C'est surtout la complexité et l'intensité émotionnelle. Je veux ralentir la transition avant les conversations plus sensibles. La suite devrait ajouter une étape intermédiaire autour de 'Convenir d'un signal de pause', 'Faire le point sur le signal de pause' et une réparation simple après conflit. L'objectif global reste le même.

**Sophia**
> Si je comprends bien, tu souhaites ralentir la transition avant les conversations plus sensibles en ajoutant une étape intermédiaire [...] tout en gardant l'objectif global du plan. Est-ce que je peux te préparer une proposition concrète pour cela ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- executed_tools: []
- durable_effect: none

#### Tour 3

**User**
> Oui, prépare le brouillon sans appliquer. Pour réparation simple, je veux dire : revenir au calme, dire ce qui a débordé sans accusation, puis choisir une petite réparation concrète. Garde l'objectif global du plan.

**Sophia**
> Je peux te proposer d'ajuster le plan global en gardant le même objectif, mais en insérant une étape intermédiaire avant les conversations plus sensibles. Cette étape consoliderait le signal de pause et une réparation simple après conflit. Rien n'est appliqué tant que tu ne valides pas. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- tool_skill_run.status: `draft_review`
- draft: present
- executed_tools: []
- durable_effect: none

#### Tour 4

**User**
> Oui, je valide. Applique cet ajustement global : garder le même objectif, mais insérer une étape intermédiaire de signal de pause + réparation simple avant les conversations sensibles.

**Sophia**
> C'est fait: j'ai ajusté la trajectoire du plan pour ralentir la transition et consolider le signal de pause avec une réparation simple avant les conversations plus sensibles. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- executed_tools: [`adjust_plan_item`]
- durable_effect: plan initial `fe37bd40...` archivé; nouveau plan actif `6b381c05...` version 2 créé; 4 nouveaux items créés.
- cleanup: nouveau plan et 4 nouveaux items supprimés; plan initial restauré actif.

## 3. Analyse De Fluidité Humaine

**Verdict: yellow**

**Ce qui marche**
- Niveau: conversation courte, scope clair, préservation du signal de pause respectée, validation explicite avant exécution.
- Whole plan: ne boucle plus 7 tours; Sophia demande une clarification utile, puis produit un brouillon à valider.
- Le tutoiement est respecté.

**Problèmes**
- r46 Tour 2: Sophia parle de "3 jours -> 2 jours" alors que les runs précédents avaient montré une possible charge weekly à 5 jours. Impact: wording encore fragile sur cadence générale vs charge de la semaine. Sévérité: yellow.
- r48 Tour 3: le brouillon whole plan est un peu trop synthétique; il valide la direction mais ne liste pas clairement les éléments inchangés ni les implications de régénération. Impact: acceptable pour un brouillon directionnel, mais moins rassurant. Sévérité: yellow.

**Fix proposé**
- Enrichir le message whole plan directionnel avec 3 blocs courts: changement proposé, ce qui reste stable, ce qui sera régénéré.
- Pour le niveau, préférer "ramener cette semaine à 2 jours" plutôt que "de 3 à 2" quand la source weekly exacte peut être ambiguë.

## 4. Analyse Système

**Verdict: green avec warnings UX**

**Routage**
- Niveau: `adjust_plan_item`, scope niveau, exécution après validation.
- Whole plan: `adjust_plan_item`, scope whole plan, draft review puis exécution.

**Skills / Operations / Tools**
- Niveau: le correctif single affected item fonctionne; le draft n'est plus bloqué en `materialized_changed_items`.
- Whole plan: le fallback directionnel whole plan évite le blocage du writer et crée un draft review exploitable.
- Exécution whole plan: validation déclenche bien `adjust_plan_item` et provoque une séparation/régénération du plan.

**Memory / Effets durables**
- Niveau: effet durable limité au seul item demandé.
- Whole plan: séparation observée: ancien plan archivé, nouveau plan actif version 2, nouveaux items créés.
- Cleanup: tous les changements DB du run ont été annulés.

**Problèmes**
- r48: le brouillon directionnel est produit par un fallback déterministe quand le writer échoue à matérialiser. Impact système: robuste pour éviter le blocage, mais la qualité conversationnelle dépend d'un template plus pauvre que le writer. Sévérité: yellow.

**Fix proposé**
- Faire évoluer le writer whole plan pour produire lui-même ce brouillon directionnel au lieu de dépendre du fallback.

## Verdict Global

- Verdict: yellow
- Raison principale: les deux flows passent techniquement, y compris la séparation de plan en whole plan, mais le wording reste à polir.
- Follow-up prioritaire: améliorer le texte du brouillon whole plan directionnel et clarifier cadence générale vs fréquence de cette semaine.
