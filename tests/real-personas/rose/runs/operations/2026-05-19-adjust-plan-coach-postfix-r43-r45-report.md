# QA Run Report - Adjust Plan Coach Postfix r43-r45

## 1. Contexte Du Test

- Date: 2026-05-19
- Runs: `r43-action-specific`, `r44-level-strict`, `r45-whole-plan-structural`
- Persona: Rose, connexion locale existante, login password vérifié.
- Objectif: vérifier les flows d'ajustement d'une action, d'ajustement de niveau, et de whole plan après les correctifs 20/80.
- Trajectoire: coaching relationnel de Rose, niveau courant autour du signal de pause et de l'allègement de charge.
- Surfaces visées: router, `adjust_plan_item`, sous-skill coach spécialisé, writer, validation, executor, effets durables DB.
- Cadre IA réel: local Supabase + endpoint local `test-send-message`, `force_full_ai=true`, réponses produites par Sophia. Note environnement: le gateway local Supabase ne chargeait pas correctement l'`OPENAI_API_KEY`; le endpoint a donc été servi localement via Deno, sans fallback direct `processMessage`.
- Correctifs appliqués avant run: contraintes strictes `affected_item/preserve` côté writer; autorisation d'un ajustement de niveau matérialisé sur un seul item quand l'utilisateur verrouille explicitement le scope à une seule action; whole plan orienté régénération/séparation de plan côté exécution.
- Validité QA: valide pour le routage et la conversation IA réelle; verdicts système ci-dessous incluent les échecs observés.
- Nettoyage: les 3 runs ont été nettoyés avec restauration des items/plans initiaux et suppression des messages/states QA.

## 2. Tours De Conversation

### Run r43-action-specific - ajustement d'une action

#### Tour 1

**User**
> L'action 'Partager un point positif' me met encore une pression bizarre. Je veux ajuster seulement cette action, pas le niveau : garder l'idée positive, mais que ça devienne un merci très concret au lieu d'un compliment réussi.

**Sophia**
> Si je comprends bien, tu souhaites ajuster l'action 'Partager un point positif' pour qu'elle devienne un 'merci très concret au lieu d'un compliment réussi', car l'approche actuelle te met une pression bizarre. Je peux te préparer une proposition pour ce changement. Est-ce que c'est bien ça ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- coaching_guidance_audit: `{scope:"action", source:"runner", status:"generated"}`
- executed_tools: []
- durable_effect: none

#### Tour 2

**User**
> Oui, prépare le brouillon sans appliquer. Je veux que l'instruction exacte soit : 'dire merci pour un truc concret', et garder 3 jours par semaine.

**Sophia**
> Je te propose d'ajuster l'habitude 'Partager un point positif' pour qu'elle soit plus simple et moins source de pression. Actuellement, l'instruction est 'écrire une phrase très simple, même imparfaite, plutôt que chercher un vrai point positif'. Je vais la modifier pour qu'elle devienne 'dire merci pour un truc concret'. [...] La fréquence de cette habitude restera bien de 3 jours par semaine, et aucune autre action de ton plan ne sera modifiée. Qu'en penses-tu ? Rien n'est appliqué tant que tu n'as pas validé. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- executed_tools: []
- durable_effect: none

#### Tour 3

**User**
> Ça me va, mais je veux être sûre que ce n'est pas interprété comme un allègement du niveau. On garde vraiment juste cette action, même fréquence, le reste intact ?

**Sophia**
> Je n'ai encore rien appliqué. Le brouillon actuel prévoit: 1. Partager un point positif: avant, écrire une phrase très simple [...] maintenant, dire merci pour un truc concret. [...] Ce qui reste inchangé: [...] la fréquence de 3 jours par semaine [...] Le reste de ton plan: Aucune autre action ou habitude n'est modifiée, et la trajectoire globale de ton plan reste stable. Si ça te va, dis-moi clairement de l'appliquer.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: null in summary, but tool-skill context preserved
- route_reason: `normal_reply_default`
- executed_tools: []
- durable_effect: none

#### Tour 4

**User**
> Oui, applique ce brouillon exactement : seulement 'Partager un point positif', instruction 'dire merci pour un truc concret', fréquence 3 jours, rien d'autre.

**Sophia**
> C'est fait ! J'ai ajusté l'habitude 'Partager un point positif' comme tu l'as demandé. Désormais, l'instruction est 'dire merci pour un truc concret'. [...] La fréquence de 3 jours par semaine est maintenue, et le reste de ton plan reste inchangé.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- executed_tools: [`adjust_plan_item`]
- durable_effect: correct item changed, cleanup restored 4 items and active plan.

### Run r44-level-strict - ajustement de niveau limité à une action

#### Tour 1

**User**
> Le niveau actuel me semble trop dense cette semaine. Je ne veux pas revoir tout le plan, juste alléger le niveau en gardant le signal de pause comme priorité.

**Sophia**
> Je comprends que tu souhaites alléger le niveau de cette semaine, tout en gardant le signal de pause comme priorité. Pour cela, quelle habitude ou mission te semble la plus lourde ou chronophage en ce moment ? [...]

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- coaching_guidance_audit: `{scope:"level", source:"runner", status:"generated"}`
- durable_effect: none

#### Tour 2

**User**
> Le plus lourd c'est 'Partager un point positif'. Je pensais aussi raccourcir 'Faire le point sur le signal de pause' à 5 minutes, mais finalement ne touche pas à 'Convenir d'un signal de pause'. Prépare un brouillon sans appliquer.

**Sophia**
> [...] Je vois que cette habitude est prévue 3 jours par semaine en général, mais pour cette semaine, elle est passée à 5 jours. Est-ce cette augmentation temporaire qui la rend si lourde pour toi ? Si on la ramène à 3 jours cette semaine, est-ce que ça te semblerait plus gérable [...] ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- coaching_guidance: warns not to touch signal-pause items and to keep frequency change temporary.
- durable_effect: none

#### Tour 3

**User**
> Oui, c'est bien cette charge. Je veux aller plus bas : 'Partager un point positif' à 2 jours cette semaine. Et pour être claire, seulement cette action change ; le signal de pause et le reste ne bougent pas.

**Sophia**
> Je comprends, je vais reprendre le brouillon en ajustant "Partager un point positif" à 2 jours pour cette semaine, et je m'assure que le reste de ton plan, y compris le signal de pause, ne bouge pas. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- durable_effect: none

#### Tour 4

**User**
> Montre-moi le brouillon final avant d'appliquer, avec uniquement ce changement : 'Partager un point positif' à 2 jours cette semaine, rien d'autre.

**Sophia**
> Je te propose d'alléger ton niveau actuel pour cette semaine [...] Je vais réduire la fréquence de l'habitude "Partager un point positif" de 3 jours par semaine à 2 jours cette semaine. [...] Le reste de ton plan, y compris les missions "Convenir d'un signal de pause" et "Faire le point sur le signal de pause", restera inchangé. [...] Est-ce que cela te convient ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- durable_effect: none
- warning: wording says "de 3 jours à 2 jours" while the previous turn established "5 jours cette semaine"; likely confusion between cadence générale and weekly reps.

#### Tour 5

**User**
> Oui, j'accepte. Applique exactement ça : uniquement 'Partager un point positif' à 2 jours cette semaine, et le signal de pause comme le reste restent inchangés.

**Sophia**
> [réponse vide]

**Trace courte**
- http_status: 409
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `active_tool_skill_continue`
- tool_skill_run.status: `draft_review_decision`
- executed_tools: []
- durable_effect: none
- incident: confirmation claire classée en draft review mais aucune réponse/exécution produite.

#### Tour 6

**User**
> Applique maintenant le brouillon validé : baisse uniquement 'Partager un point positif' à 2 jours cette semaine. Ne modifie aucune autre action.

**Sophia**
> [réponse vide]

**Trace courte**
- http_status: 409
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- executed_tools: []
- durable_effect: none
- incident: retry explicite reproduit le 409.

### Run r45-whole-plan-structural - ajustement whole plan

#### Tour 1

**User**
> En regardant la suite du plan, j'ai un doute plus global : la troisième partie me paraît trop rapide, surtout l'étape suivante. Je ne parle pas d'une action de cette semaine, je veux revoir la trajectoire.

**Sophia**
> Pour que je puisse bien comprendre, qu'est-ce qui rend cette troisième partie trop rapide pour toi, et en particulier cette "étape suivante" ? Est-ce le rythme, la complexité, ou autre chose qui te fait vouloir revoir la trajectoire ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- coaching_guidance_audit: `{scope:"whole_plan", source:"runner", status:"generated"}`
- durable_effect: none

#### Tour 2

**User**
> C'est surtout la complexité. Avant de parler de sujets plus sensibles, j'ai besoin que le plan ajoute une étape intermédiaire pour stabiliser les signaux de pause et la réparation après conflit. Je veux garder l'objectif global, mais ralentir la transition.

**Sophia**
> Tu souhaites ajouter une étape intermédiaire [...] quelles actions ou missions de ton plan actuel sont liées à ces points ? Par exemple, penses-tu à : "Convenir d'un signal de pause", "Faire le point sur le signal de pause", "Partager un point positif", "Cartographier les déclencheurs" [...]

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- durable_effect: none

#### Tour 3

**User**
> Oui, ces trois repères sont la base : 'Convenir d'un signal de pause', 'Faire le point sur le signal de pause' et une réparation simple après conflit. Mais je ne veux pas bricoler seulement ces actions ; je veux que la suite du plan soit réorganisée autour de ça.

**Sophia**
> Je comprends que tu souhaites réorganiser la suite du plan autour de ces trois repères. Pour que je puisse te proposer un brouillon cohérent, peux-tu me dire ce que tu entends concrètement par "une réparation simple après conflit" ? [...]

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- durable_effect: none

#### Tour 4

**User**
> Pour moi ce serait : revenir au calme, dire ce qui a débordé sans accusation, puis choisir une petite réparation concrète. Je veux que la prochaine étape du plan prépare ça avant d'aller vers des conversations plus sensibles.

**Sophia**
> Je n'ai pas pu générer le brouillon pour l'instant car la "réparation simple après conflit" n'est pas encore une action concrète dans ton plan. [...] Est-ce une nouvelle mission ponctuelle, une habitude à pratiquer régulièrement, ou autre chose ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- durable_effect: none
- warning: bascule trop vite vers item concret, alors que la demande est structurelle.

#### Tour 5

**User**
> Plutôt une mission ponctuelle au début, puis une habitude plus tard si ça marche. Par exemple : choisir ensemble une réparation simple après un conflit, comme ranger un truc, envoyer un message calme ou reprendre une demande autrement. Prépare le brouillon sans appliquer.

**Sophia**
> Pour pouvoir te montrer un brouillon précis, j'ai besoin de comprendre comment tu imagines intégrer cette nouvelle mission de réparation après conflit dans le plan. Est-ce que tu la vois comme une nouvelle phase à part entière, ou plutôt comme une extension de la phase actuelle [...]

**Trace courte**
- http_status: 200
- durable_effect: none

#### Tour 6

**User**
> Plutôt une extension de la phase actuelle : on stabilise pause + réparation, puis seulement après on avance. Je ne veux pas créer un nouveau grand objectif, juste ralentir et réordonner la suite pour que ce soit cohérent.

**Sophia**
> [...] j'ai besoin de savoir comment tu vois l'intégration des actions actuelles comme "Partager un point positif" ou "Cartographier les déclencheurs" [...] Faut-il les adapter, les déplacer, ou les mettre en pause [...]

**Trace courte**
- http_status: 200
- durable_effect: none

#### Tour 7

**User**
> Garde 'Partager un point positif' et 'Cartographier les déclencheurs' comme soutien, sans les mettre en pause. Le changement global que je veux : insérer une étape intermédiaire de réparation simple avant les conversations plus sensibles. Fais-moi maintenant le brouillon, sans appliquer.

**Sophia**
> Je comprends que tu veuilles voir le brouillon. Pour que je puisse te le préparer correctement, j'ai besoin de savoir à quel moment tu souhaites insérer cette nouvelle mission de 'réparation simple' : est-ce qu'elle devrait arriver juste après avoir convenu du signal de pause, ou plutôt après avoir fait le point sur son utilisation ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- executed_tools: []
- durable_effect: none
- incident: après 7 tours, toujours aucun brouillon.

## 3. Analyse De Fluidité Humaine

**Verdict: red**

**Ce qui marche**
- Run action: conversation claire, bonne reformulation, brouillon lisible, confirmation avant exécution.
- Run niveau: Sophia pose une vraie question utile sur la différence entre cadence générale et charge de la semaine.
- Run whole plan: le routing verbal reconnaît correctement que la demande est structurelle et non une action isolée.

**Problèmes**
- r44 Tour 5-6: réponse vide 409 au moment exact de la validation. Impact: le user valide clairement mais Sophia ne répond pas et n'applique rien. Sévérité: red.
- r45 Tours 4-7: boucle de clarification whole plan. Impact: le user donne progressivement assez d'informations pour un brouillon directionnel, mais Sophia continue à demander un degré de détail produit trop élevé. Sévérité: red.
- r44 Tour 4: formulation "de 3 jours à 2 jours cette semaine" alors que Sophia venait d'identifier une charge hebdo à 5 jours. Impact: confusion utilisateur sur ce qui sera réellement modifié. Sévérité: yellow.
- r43 Tour 3: trace courte repasse par `normal_reply_default` malgré un contexte de tool-skill encore actif. Impact UX faible, mais observabilité confuse. Sévérité: yellow.

**Fix proposé**
- Priorité 1: réparer la sortie `draft_review_decision` pour confirmation explicite: si la décision est `approve`, le router doit soit exécuter le pending draft, soit produire une réponse de validation impossible, jamais une réponse vide 409.
- Priorité 2: whole plan doit accepter un brouillon directionnel dès que la trajectoire, le prérequis, la contrainte de préservation et le type d'insertion sont clairs. Les micro-détails peuvent rester en champ "à préciser au moment de générer".
- Priorité 3: dans les messages niveau, distinguer explicitement `cadence générale` et `charge de cette semaine` pour éviter le "3 -> 2" quand l'item est temporairement à 5.

## 4. Analyse Système

**Verdict: red**

**Routage**
- r43: routing action correct, `selected_handler=adjust_plan_item`, scope coach `action`.
- r44: routing niveau correct, scope coach `level`; les contraintes de préservation sont bien présentes dans la guidance.
- r45: routing whole plan correct, scope coach `whole_plan`; Sophia ne confond pas avec action/niveau au niveau router.

**Skills / Operations / Tools**
- r43: `adjust_plan_item` exécute correctement après confirmation, avec un seul item modifié.
- r44: le correctif single-item level a permis de produire un brouillon mono-action sans modifier les items préservés. En revanche, le passage confirmation -> exécution casse dans `draft_review_decision`.
- r45: le skill reste en collecte et ne produit jamais de draft, malgré une demande explicite "fais-moi le brouillon". Le coach spécialisé est appelé, mais il ne suffit pas à débloquer la génération.

**Memory / Effets durables**
- r43: effet durable correct avant cleanup; cleanup restaure 4 items et le plan actif.
- r44: aucun effet durable appliqué à cause du 409; cleanup restaure l'état initial.
- r45: aucun effet durable appliqué; cleanup restaure l'état initial.

**Problèmes**
- r44 Tour 5: `tool_skill_run.status=draft_review_decision` avec `http_status=409`, réponse vide et aucun tool exécuté. Impact système: validation utilisateur claire non traitée. Sévérité: red.
- r45 Tours 4-7: missing-slot policy trop stricte pour `whole_plan`; elle exige de résoudre des décisions de design internes avant de générer un brouillon. Impact système: le flow whole plan ne passe pas le seuil de proposition. Sévérité: red.
- Environnement: le gateway Supabase local ne chargeait pas l'`OPENAI_API_KEY`; le run a utilisé le même endpoint servi via Deno local. Impact: run toujours IA réel, mais à noter pour reproductibilité. Sévérité: yellow.

**Fix proposé**
- Ajouter un garde déterministe dans la gestion `draft_review_decision`: `approve + pending draft + no new restriction` doit appeler l'executor; `approve + new restriction` doit réviser puis redemander validation; aucun chemin ne doit retourner vide.
- Ajouter un mode `whole_plan_directional_draft_ready`: quand le user a donné objectif global, problème structurel, direction de changement et contraintes de préservation, générer un brouillon même si le placement exact reste une option à confirmer.
- Pour level, propager `weekly_reps/current weekly load` dans le writer message pour que le texte reflète "5 cette semaine -> 2 cette semaine" et non "3 -> 2".

## Verdict Global

- Verdict: red
- Raison principale: action passe, mais le flow niveau casse à la validation et le flow whole plan reste bloqué en clarification sans brouillon.
- Follow-up prioritaire: réparer `draft_review_decision` approval -> execution, puis assouplir la readiness whole plan pour générer un brouillon directionnel.
