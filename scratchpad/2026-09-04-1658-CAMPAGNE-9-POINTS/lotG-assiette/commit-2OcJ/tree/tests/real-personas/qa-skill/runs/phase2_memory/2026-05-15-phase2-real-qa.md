# QA Run Report - Phase 2 Action/Level Memory

## 1. Contexte Du Test

- Date: 2026-05-15
- Run: `phase2-real-20260515-c`
- Persona conversationnel: qa temporaire phase 2
- Compte technique: auth local temporaire, `is_test_persona=true`
- Objectif: tester en conversation reelle les ajouts phase 2: `action_reference`, `level_reference`, retrieval action/level, expansion famille d'habitude, exact-only mission/clarification, suppression action/level pendant daily/weekly actif.
- Trajectoire: 5 scenarios, 5 tours chacun, messages user improvises apres lecture de Sophia.
- Surfaces visees: `test-send-message`, dispatcher v2, memory_plan, active loader, skills conversationnels, tool-skill arbitration, direct effects.
- Cadre IA reel: Supabase local, endpoint local `test-send-message`, `force_full_ai=true`, aucun renderer deterministe, aucun fallback `processMessage` direct, aucun scenario pre-scripted ferme.
- Validite QA: valide techniquement. Les valeurs de plan/action/memoire ont ete creees dynamiquement au runtime.
- Artefacts bruts: `tmp/phase2-real-qa/phase2-real-20260515-c/state.json`, `tmp/phase2-real-qa/phase2-real-20260515-c/inspect.json`.

Donnees runtime principales:

- User id: `8a3bdfb9-d2d9-4fbb-bbba-0e4c83a6577d`
- Habit: `Session focus courte` / `b99a1821-8de1-4445-a4ad-9d0dcf85cbf9`
- Habit family seedee: `habit:session_focus`
- Mission: `Bloquer les creneaux de la semaine` / `43c3ce1f-f9de-43f4-803c-115807f840c7`
- Level handoff memory seedee: `level_execution_handoff:7fb3e12e-7694-410b-add7-712677a49917`
- DB apres run: 50 `chat_messages`, 25 traces, 4 `user_plan_item_entries`, 3 `memory_items`.

## 2. Tours De Conversation

### Scenario 1 - Memoire action habitude hors daily/weekly

Objectif: verifier que `Session focus courte` declenche `action_reference.status=identified`, `expansion_policy=exact_then_action_family_recent`, puis que Sophia utilise la memoire exacte/famille.

#### Tour 1

**User**
> Je veux parler de Session focus courte. J'ai réussi à la faire hier, mais je sens encore que le lancement me prend trop d'énergie. Tu te souviens de ce qui m'aide sur cette action ?

**Sophia**
> Yes, je vois ce que tu veux dire : même quand la Session focus courte est faite, le moment “lancement” peut te coûter cher. [...] Je peux aussi te la transformer en Carte d’attaque [...]

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- action_reference: `identified`, `habit`, `exact_then_action_family_recent`
- memory_plan: action target present
- direct_effects: `track_progress_plan_item completed`
- durable_effect: entry completed creee pour `Session focus courte`
- QA: warning. Le routage action est bon, mais la reponse ne cite pas le souvenir seed exact "fichier deja pret + minuteur 12 minutes".

#### Tour 2

**User**
> Oui mais je ne veux pas créer de carte maintenant. Je veux juste que tu repartes de ce que tu sais déjà sur cette action, pas des conseils génériques.

**Sophia**
> Ok, je pars de ce que j’ai déjà dans le contexte, pas de conseils génériques. Mais là [...] je n’ai pas la description concrète de “cette action” [...]

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- memory_plan: action target still present
- direct_effects: none
- QA: fail. Sophia dit ne pas avoir l'action, alors que le tour precedent et le plan l'identifiaient.

#### Tour 3

**User**
> L'action c'est Session focus courte. Je cherche surtout à retrouver le petit truc concret qui m'avait aidé, tu peux regarder dans la mémoire liée à cette action ?

**Sophia**
> Je peux te recoller le “petit truc concret”, mais là je n’ai pas assez de détails dans le contexte que j’ai sous les yeux [...]

**Trace courte**
- action_reference: `identified`
- memory_plan: action target exact + `exact_then_action_family_recent`
- QA: fail. Le retrieval est demande, mais Sophia ne restitue toujours pas le souvenir action.

#### Tour 4

**User**
> Justement je ne veux pas l'inventer. Si tu ne retrouves pas le souvenir, dis-le-moi clairement et on le note comme problème de mémoire action.

**Sophia**
> T’as raison : si je ne retrouve pas le souvenir, je te le dis clairement. [...] Tu préfères qu’on cible quoi exactement ?

**Trace courte**
- memory_plan: action target + `habitudes.execution`
- direct_effects: none
- QA: fail. Elle accepte le probleme mais repose une question au lieu de conclure clairement.

#### Tour 5

**User**
> On s'arrête là pour cette action. Résume-moi simplement ce qui est sûr et ce qui manque dans ta mémoire pour Session focus courte.

**Sophia**
> Pour Session focus courte, voilà ce qui est sûr dans ma mémoire : t’as réussi à la faire hier, mais le lancement te coûte trop d’énergie. Ce qui manque encore [...]

**Trace courte**
- response_owner: `product_help`
- action_reference: `identified`
- memory_plan: action target
- QA: fail. Sophia prend le progress log du run comme memoire principale et ignore les `memory_items` seedes.

### Scenario 2 - Memoire faible de niveau / handoff

Objectif: verifier `level_reference` et utilisation du `level_execution_handoff`.

#### Tour 1

**User**
> On commence le nouveau niveau. Avant de repartir, qu'est-ce que tu gardes du niveau précédent pour ne pas refaire les mêmes erreurs ?

**Sophia**
> Pour éviter de retomber dans les mêmes pièges du niveau précédent, je garde 3 trucs très concrets [...]

**Trace courte**
- response_owner: `product_help`
- level_reference: `transition`, `include_level_execution_handoff`
- memory_plan: level targets present
- QA: warning. Signal systeme bon, reponse plausible mais generique.

#### Tour 2

**User**
> Je parle vraiment de la mémoire de fin de niveau, pas d'une règle générale. Est-ce que tu as un handoff concret du niveau précédent ?

**Sophia**
> je n’ai pas un “document de handoff” complet que je pourrais dérouler mot à mot ici. Par contre [...]

**Trace courte**
- level_reference: `transition`
- memory_plan: level targets present
- QA: fail. Le handoff existe en DB, mais Sophia ne le restitue pas.

#### Tour 3

**User**
> Ok, mais si tu ne vois pas le handoff, ne le reconstruis pas. Dis-moi seulement ce que le système a vraiment chargé pour le niveau.

**Sophia**
> ce qui est réellement présent côté “niveau” [...] Bloquer les créneaux [...] Session focus courte [...] repères de traction [...]

**Trace courte**
- level_reference: `current_level`
- memory_plan: level targets present
- QA: fail. Confusion entre handoff niveau precedent et contenu du plan actif.

#### Tour 4

**User**
> Non, je voulais la mémoire du niveau précédent, pas le contenu du plan actif. On va garder ce point comme doute. Qu'est-ce que tu proposerais sans appliquer de modification ?

**Sophia**
> je garde le doute [...] je te proposerais 3 actions “d’observation/alignement” [...]

**Trace courte**
- level_reference: `transition`
- direct_effects: none
- QA: warning. Bonne absence de side effect, mais reponse encore reconstruite.

#### Tour 5

**User**
> Option anti-piège, mais vraiment en brouillon conversationnel. Ne crée rien, ne change pas le plan.

**Sophia**
> Ok, j'arrête là. Je ne crée rien d'autre. Concrètement, je parle d'une Carte de defense [...]

**Trace courte**
- tool_skill_opportunity: `defense_card`, `should_offer=true`, no execution
- direct_effects: none
- QA: warning/fail UX. Le "ne cree rien" est respecte techniquement, mais Sophia bascule vers carte de defense alors que le user demandait un brouillon conversationnel.

### Scenario 3 - Mission exact-only

Objectif: verifier qu'une mission active ne declenche pas une expansion famille d'habitude et qu'aucun completed n'est ecrit.

#### Tour 1

**User**
> Je veux faire le point sur Bloquer les creneaux de la semaine. Je ne l'ai pas encore fait, mais je veux comprendre si on a déjà un contexte utile dessus avant d'en parler.

**Sophia**
> tout ce que j’ai [...] c’est juste le statut administratif: l’action est active, mais elle n’a jamais été commencée [...]

**Trace courte**
- action_reference: `identified`, `mission`, `exact_action_only`
- memory_plan: exact action target
- direct_effects: none
- QA: pass.

#### Tour 2

**User**
> C, le blocage. Mais je ne veux pas que tu la reportes ou que tu modifies le plan, juste qu'on comprenne pourquoi je repousse.

**Sophia**
> on ne touche pas au plan. On décortique juste le “pourquoi je repousse” [...]

**Trace courte**
- selected_handler: `execution_breakdown`
- tool_skill_opportunity: `attack_card`, `should_offer=false`
- direct_effects: none
- QA: pass.

#### Tour 3

**User**
> Plutôt A et B. Je ne sais pas quels créneaux mettre, donc j'ouvre le calendrier et je referme.

**Sophia**
> On ne change rien au plan: on casse juste le moment de décision [...]

**Trace courte**
- selected_handler: `execution_breakdown`
- direct_effects: none
- QA: pass.

#### Tour 4

**User**
> Ce que je veux protéger. Et garde bien que c'est un diagnostic, pas une validation de mission faite.

**Sophia**
> je le garde comme diagnostic, pas comme une mission validée [...]

**Trace courte**
- direct_effects: none
- QA: pass, malgre un owner `product_help` discutable.

#### Tour 5

**User**
> B et C. On clôture ici : dis-moi ce qui est retenu, sans cocher l'action.

**Sophia**
> Voici ce qui est retenu de “B et C” (sans cocher d’action) [...]

**Trace courte**
- direct_effects: none
- durable_effect: aucune entree completed/missed pour la mission
- QA: warning. Pas de side effect, mais Sophia reformule B/C de facon un peu differente des options precedentes.

### Scenario 4 - Daily actif, suppression action/level

Objectif: verifier que `daily_action_review_v1` actif supprime `action_reference`, `level_reference` et action/level memory targets.

#### Tour 1

**User**
> Pour le check du soir : Session focus courte, je l'ai faite, mais j'ai encore tourné autour avant de commencer.

**Sophia**
> Bien vu de le faire [...] On va juste améliorer le “départ” [...]

**Trace courte**
- selected_handler: `daily_action_review_v1`
- action_reference: `none`, reason `review_skill_owns_action_context`
- level_reference: `none`, reason `review_skill_owns_level_context`
- memory_plan: `none`, targets `[]`
- direct_effects: `track_progress_plan_item completed`
- QA: pass suppression, warning side effect parallel tracking.

#### Tour 2

**User**
> Plutôt trop de choix dans la tête. Mais reste dans le bilan daily, je ne veux pas lancer une carte d'attaque maintenant.

**Sophia**
> Entendu, on reste focus sur ton bilan [...] la carte d'attaque, on la laisse de côté [...]

**Trace courte**
- selected_handler: `daily_action_review_v1`
- memory_plan: none
- tool_skill_opportunity: none
- QA: pass.

#### Tour 3

**User**
> Il y avait aussi Bloquer les creneaux de la semaine : pas fait [...]

**Sophia**
> tu viens de repérer la vraie chaîne [...] tu bloques maintenant 1 seul créneau [...]

**Trace courte**
- response_owner: `normal_reply`
- action/level references still suppressed
- direct_effects: missed mission
- QA: warning/fail. Suppression OK, mais le flow daily actif ne reste pas proprietaire et propose une action immediate au lieu de juste capturer le bilan.

#### Tour 4

**User**
> Demain, mais je confirme juste le statut du daily : pas fait aujourd'hui. Ne le considère pas comme fait.

**Sophia**
> Ok, demain seulement. Je note: le daily n’est pas fait aujourd’hui [...]

**Trace courte**
- memory_plan: none
- direct_effects: missed mission
- QA: warning. Interprete "daily pas fait" de facon confuse, mais pas de completed faux sur la mission.

#### Tour 5

**User**
> On clôture le bilan : Session focus faite, créneaux pas faits. Résume sans autre proposition.

**Sophia**
> C'est noté [...] session focus validée mais blocage des créneaux non réalisé.

**Trace courte**
- memory_plan: none
- direct_effects: completed habit + missed mission
- DB: 4 entries au total, toutes `router_parallel_tracking_v2`, toutes completed sur `Session focus courte`; aucune entry mission observee dans `inspect`.
- QA: warning/fail. Les traces annoncent missed mission mais DB n'a pas l'effet correspondant dans l'export; entries completed habit dupliquees.

### Scenario 5 - Weekly actif, suppression action/level et non-escalade plan

Objectif: verifier que weekly actif garde la main, ne recharge pas action/level via dispatcher et ne bascule pas trop vite en `adjust_plan_item`.

#### Tour 1

**User**
> Pour le bilan de semaine : Session focus courte a été faite plusieurs fois, mais Bloquer les creneaux de la semaine n'a pas été fait. Avant de décider, je veux qu'on parle de pourquoi.

**Sophia**
> C'est noté pour la session focus [...] pour le blocage des créneaux, on va creuser [...]

**Trace courte**
- selected_handler: `weekly_adaptive_review_v1`
- action/level references: suppressed
- memory_plan: none
- direct_effects: completed habit + missed mission
- QA: pass suppression, fail side-effect policy for weekly-style discussion.

#### Tour 2

**User**
> Quand j'ai pensé à le faire, j'ai eu l'impression que si je bloquais des créneaux je me piégeais moi-même. Donc j'ai laissé ouvert.

**Sophia**
> Bloquer des créneaux peut donner l’impression de “se mettre des chaînes” [...]

**Trace courte**
- action/level references: still suppressed
- memory_plan: domain_key only
- tool_skill_opportunity: defense_card, `should_offer=false`
- QA: pass suppression.

#### Tour 3

**User**
> Les deux, mais surtout me sentir enfermé. Les habitudes ont avancé, donc je ne veux pas répéter toute la semaine pour cette mission.

**Sophia**
> je peux vous proposer une version simplifiée ou plus flexible de cette action [...] Est-ce que je prépare cette proposition ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- memory_plan: action target reappears
- QA: fail. Weekly actif perd la main; le user demandait une decision weekly, pas un tool skill d'ajustement.

#### Tour 4

**User**
> Non, pas une proposition d'ajustement tout de suite. Je veux d'abord décider dans le weekly : avancer la semaine prochaine et juste reporter cette mission ou non.

**Sophia**
> Je te propose de simplifier l'action [...] Est-ce que cela te convient ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- memory_plan: action + level targets
- skill_signals.exit says user rejected adjustment, but active tool continues
- QA: fail. Sophia ignore le refus et continue l'ajustement.

#### Tour 5

**User**
> Non. Stop l'ajustement de plan. Réponds juste au bilan weekly [...]

**Sophia**
> Ok, j'arrête là. Je ne crée rien d'autre.

**Trace courte**
- response_owner: `normal_reply`
- no direct effects
- QA: fail UX. Elle stoppe enfin mais ne repond pas a la question weekly.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Les conversations ne sont pas vides, pas de 5xx, pas d'abort.
- Sophia sait rester supportive dans les tours daily/mission simples.
- Sur la mission exact-only, elle respecte globalement "diagnostic, pas validation".
- Pendant daily actif, elle ne propose pas de carte quand le user demande explicitement de rester dans le bilan.

**Problemes**
- S1 tours 2-5: Sophia demande au user de redonner une info que le systeme devrait avoir. Impact: la promesse "memoire action intelligente" n'est pas tenue. Severite: red.
- S2 tours 1-4: Sophia reconstruit un pseudo-handoff generique et confond niveau precedent avec plan actif. Impact: confiance faible dans la memoire niveau. Severite: red.
- S2 tour 5: "ne cree rien" est respecte, mais elle parle quand meme de carte de defense. Impact: glissement produit inutile. Severite: yellow.
- S4 tours 3-5: le daily simule devient une conversation normale avec propositions d'action, moins strict qu'un bilan. Impact: UX daily trop coach/proposition au lieu de capture. Severite: yellow.
- S5 tours 3-5: le weekly sort vers `adjust_plan_item`, puis ignore le refus. Impact: experience confuse et contraire a la logique weekly. Severite: red.

**Fix propose**
- Faire passer le `action_context` charge dans le contexte des skills conversationnels, pas seulement dans `memory_plan`.
- Rendre visible dans le prompt final les lignes `ACTION_OCCURRENCE`, `ACTION_FAMILY_PATTERN`, `LEVEL_EXECUTION_HANDOFF`, et tester que le companion/skill les cite.
- Ajouter une regle active weekly: tant que `weekly_adaptive_review_v1` est actif, ne pas demarrer `adjust_plan_item` sauf demande explicite de modification hors weekly.
- Ajouter une reponse de sortie: si le user refuse l'ajustement, reprendre la question weekly, pas seulement "j'arrête".

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- `action_reference` fonctionne sur action explicite:
  - habit `Session focus courte`: `identified`, `action_type=habit`, `exact_then_action_family_recent`.
  - mission `Bloquer les creneaux`: `identified`, `action_type=mission`, `exact_action_only`.
- `level_reference` fonctionne sur references de niveau:
  - `transition` avec `include_level_execution_handoff`.
- Suppression daily/weekly fonctionne au depart:
  - S4 T1-T2: `memory_mode=none`, targets `[]`, reason `review_skill_owns_action_context`.
  - S5 T1-T2: action/level suppressed.

**Skills / Operations / Tools**
- S1: `execution_breakdown` prend la main et perd l'information action/retrieval dans la reponse.
- S2: `product_help` prend la main sur les questions de memoire niveau, mais ne consomme pas le handoff seed.
- S3: `execution_breakdown` est acceptable pour analyser le blocage mission sans modifier le plan.
- S5: `adjust_plan_item` demarre trop tot et continue apres refus explicite.

**Memory / Effets durables**
- Les `memory_plan.targets` sont produits, mais `memory_loader` n'apparait pas dans la trace courte exportee et Sophia n'utilise pas les `memory_items` seedes.
- La family key calculee par `action_reference` est `habit:session_focus_courte`, alors que la memoire seedee a `habit:session_focus`. Cela peut expliquer pourquoi le pattern famille n'est pas retrouve. L'exact item aurait quand meme du charger le souvenir exact.
- Entries DB apres run:
  - 4 entries `router_parallel_tracking_v2`, toutes `completed` pour `Session focus courte`.
  - Aucune entry mission visible dans `inspect`, malgre plusieurs traces `missed` pour mission.
- Le progress direct effect s'est declenche dans des scenarios de bilan/daily/weekly simules, avec doublons completed habit.

**Problemes**
- S1: `memory_plan` cible l'action, mais la reponse ne consomme pas la memoire action. Impact systeme: retrieval/action_context non injecte ou non lisible par le skill final. Severite: red.
- S2: `level_reference` cible le handoff, mais la reponse ne consomme pas `level_execution_handoff`. Impact systeme: handoff cross-level non operationnel en conversation. Severite: red.
- S4/S5: direct effects `track_progress_plan_item` restent actifs pendant review actif. Impact systeme: risque de doublons et d'ecritures hors contrat daily/weekly. Severite: red.
- S5: active weekly peut etre supplante par `adjust_plan_item` sans demande explicite. Impact systeme: mauvais owner et mauvaise discussion. Severite: red.
- Traces: `memory_loader` non expose dans le resume driver, et possiblement absent du trace schema. Impact: observabilite insuffisante pour prouver ce qui a ete charge. Severite: yellow.

**Fix propose**
- Dans le router, bloquer `direct_effects.track_progress_plan_item` quand `active_skill_state.skill_id` vaut `daily_action_review_v1` ou `weekly_adaptive_review_v1`; laisser ces skills produire leurs effets canoniques.
- Propager `action_reference.expansion_policy` et `action_family_key` depuis le plan item payload quand disponible dans le `plan_snapshot`; eviter que la family key derivee du titre diverge de la key canonique.
- Ajouter au trace final les metriques exactes du loader: scopes charges, item ids, labels `ACTION_*` / `LEVEL_EXECUTION_HANDOFF`.
- Ajouter test integration real-ish: action memory seeded -> user asks "tu te souviens" -> assistant must mention exact seeded detail.
- Ajouter test integration weekly active: user parle carry-over mission -> no `adjust_plan_item` unless user says explicitement "modifie/ajuste le plan".

## Verdict Global

- Verdict: red
- Raison principale: les signaux dispatcher phase 2 sont crees, mais la memoire action/level n'est pas consommee correctement en conversation reelle, et weekly peut sortir vers ajustement de plan trop tot.
- Follow-up prioritaire: corriger l'injection/consommation `action_context` et `level_execution_handoff` dans les skills/companion, puis bloquer direct effects et tool-skill starts pendant daily/weekly actif sauf demande explicite.
