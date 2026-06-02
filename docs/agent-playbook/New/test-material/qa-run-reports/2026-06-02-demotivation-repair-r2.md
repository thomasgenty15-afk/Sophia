# QA Run — Demotivation Repair R2

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `20260602-r2`
- Persona: `qa-skill`, connexion temporaire locale `demotivation_repair_20260602-r1`
- Objectif: tester le chemin IA reel `demotivation_repair` sur fatigue motivationnelle, sans mutation durable.
- Trajectoire: decrochage motivationnel -> contrainte explicite no tool/no potion/no plan edit -> correction utilisateur -> micro-action deja choisie -> demarrage.
- Surfaces visees: dispatcher/orientation clarification, `demotivation_repair`, `select_state_potion`, `prepare_attack_card`, TurnAgenda, EffectLedger, no-mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe.
- Validite QA: valide pour le runtime reel. Rose/Nina/Alex n'etaient pas utilisables en Auth local; la connexion dediee `qa-skill` a ete utilisee.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — Mauvais owner selectionne

**User**
> Franchement aujourd'hui j'ai plus envie. Le plan de grignotage, les placards, tout ca, j'ai l'impression que ca ne sert a rien et que je vais encore tenir deux jours puis laisser tomber.

**Sophia**
> Est-ce que tu veux faire le point sur la motivation ou est-ce qu'on modifie le plan de grignotage ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- direct_effects: aucun
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: Sophia demande une clarification binaire alors que le signal motivationnel est deja explicite.
- Source amont probable: orientation clarification / arbitration entre `demotivation_repair` et plan edit.
- Owner runtime: dispatcher + clarification arbitrator.
- Meilleure correction selon les guidelines: laisser `demotivation_repair` posseder le diagnostic quand fatigue/perte de sens domine et que la modification plan n'est pas demandee.
- Pourquoi ce n'est pas un patch local: le contrat interdit de classifier cette semantique dans `run.ts`; l'arbitrage doit s'appuyer sur les skill signals.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-03` — Product/status/tool mal priorises

**User**
> Plutot motivation. Ne modifie pas le plan, ne lance pas de potion ni d'outil. J'ai juste besoin que tu m'aides a ne pas transformer ce ratage en preuve que je suis nulle.

**Sophia**
> Je ne l'active pas depuis le chat. Reprends cette recommandation dans la section État / Potions.

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `orientation_clarification_resolved`
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: contrainte explicite `pas de potion ni d'outil` ignoree dans le choix du handler; la reponse parle de potion.
- Source amont probable: orientation clarification resolved path mappe "motivation" vers `select_state_potion` au lieu de `demotivation_repair`.
- Owner runtime: clarification arbitrator + operation suggestion resolver.
- Meilleure correction selon les guidelines: les candidats conversationnels (`demotivation_repair`) doivent rester eligibles et prioritaires quand le user choisit "motivation"; `no_potion` doit supprimer `select_state_potion` avant resolution.
- Pourquoi ce n'est pas un patch local: le contrat `demotivation_repair` couvre deja `no_potion`; le bug est dans la resolution de l'orientation, pas dans le renderer.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-03` — Product/status/tool mal priorises

**User**
> Non justement, pas de potion. Je te demande de rester avec moi deux minutes sur la demotivation. Je me sens juste fatiguee et decouragee, pas en train de demander une action dans l'app.

**Sophia**
> Phrase de réparation : "Je reviens au prochain geste, pas a toute la montagne."
> Micro-action : ferme ce qui attire ton attention, rouvre seulement la tâche utile, et fais 90 secondes dessus. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `explicit_no_tool_request_blocks_tool_start`
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: reponse visible acceptable, mais trace incoherente: le selected handler reste `select_state_potion`.
- Source amont probable: final recovery/guard produit une reponse de reparation apres blocage tool, sans reassigner le owner runtime.
- Owner runtime: TurnAgenda / final response pipeline / operation runtime response handler.
- Meilleure correction selon les guidelines: quand `no_tool` bloque un tool et que le contenu demande explicitement demotivation, restaurer un owner conversationnel ou repasser par `demotivation_repair`.
- Pourquoi ce n'est pas un patch local: le probleme est un etat runtime incoherent, pas une phrase visible.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-AGENDA-02` — Interruption explicite mal restauree

**User**
> Ok. La micro-action que je peux faire maintenant, c'est juste ouvrir le placard le plus visible et enlever un seul paquet, pas plus. Aide-moi a lancer ca sans me refaire un grand plan.

**Sophia**
> Tu veux découper cette action ou préparer ton démarrage ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- tool_execution: `none`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: Sophia redemande une clarification alors que l'action, la taille et l'intention "demarrage" sont donnees.
- Source amont probable: handoff readiness / TurnAgenda ne reconnait pas action deja choisie.
- Owner runtime: clarification arbitrator + `demotivation_repair` handoff readiness.
- Meilleure correction selon les guidelines: action_readiness `ready/already_chosen` doit autoriser une reponse de demarrage ou handoff execution non-mutant.
- Pourquoi ce n'est pas un patch local: ajouter une phrase "un paquet" en regex serait trop local; il faut corriger l'intake readiness.

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-03` — Product/status/tool mal priorises

**User**
> Prepare juste mon demarrage. Pas besoin de decouper plus : un paquet, maintenant, puis je reviens.

**Sophia**
> Je n'ai pas pu préparer cette carte depuis le chat pour l'instant. 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `orientation_clarification_resolved_tool_skill`
- tool_execution: `blocked`
- executed_tools: `[]`
- durable_effect: aucun

**Analyse si yellow/red**
- Symptome: "preparer mon demarrage" est resolu en carte d'attaque bloquee, alors que le user demandait une aide conversationnelle immediate.
- Source amont probable: orientation clarification transforme un slot conversationnel en tool skill.
- Owner runtime: clarification arbitrator + operation suggestion resolver.
- Meilleure correction selon les guidelines: distinguer `prepare_attack_card` explicite de "preparer mon demarrage" dans un flow `demotivation_repair`; garder execution_breakdown/demarrage court comme reponse non-mutante.
- Pourquoi ce n'est pas un patch local: la distinction doit venir du contrat de readiness et de l'owner, pas du wording exact.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Aucun message ne moralise la demotivation.
- Aucun effet durable n'est applique.
- Le tour 3 contient une phrase courte exploitable.

**Problemes**
- Tour 1: clarification prematuree. Famille: `BF-ROUTE-01`. Impact: Sophia demande au user de choisir une architecture interne au lieu de reparer la demotivation.
- Tour 2: potion proposee malgre "pas de potion". Famille: `BF-ROUTE-03`. Impact: rupture de confiance forte.
- Tour 4: clarification inutile alors que la micro-action est claire. Famille: `BF-AGENDA-02`. Impact: friction au moment ou l'utilisateur est pret.
- Tour 5: carte d'attaque bloquee au lieu d'un demarrage. Famille: `BF-ROUTE-03`. Impact: le flow finit par parler d'une erreur produit plutot que d'aider.

**Fix propose**
- Source amont: orientation clarification + TurnAgenda readiness.
- Correction recommandee: prioriser `demotivation_repair` quand fatigue/perte de sens/no_tool/no_potion sont explicites; ne mapper "motivation" ou "preparer mon demarrage" vers tool skill que si le user demande clairement une surface produit.
- Tests d'invariant attendus: run reel ou "motivation, pas de potion ni outil" produit `selected_handler=demotivation_repair`; "un paquet maintenant" produit reply/handoff execution non-mutant, pas `prepare_attack_card`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- `demotivation_repair` n'est jamais selectionne pendant le run reel.
- `orientation_clarification` capture le premier tour, puis resolve vers `select_state_potion` et `prepare_attack_card`.
- Les contraintes explicites `no_potion` et `no_tool` bloquent l'execution, mais trop tard: le mauvais handler est deja choisi.

**Skills / Operations / Tools**
- `select_state_potion` apparait aux tours 2-3 sans demande de potion.
- `prepare_attack_card` apparait au tour 5 sans demande de carte.
- `executed_tools=[]` et `tool_execution=blocked` aident a eviter les mutations, mais produisent une mauvaise experience.

**Memory / Effets durables**
- DB avant cleanup cible: 10 `chat_messages` dans le scope du run.
- Aucun `scheduled_checkins`, aucune `user_potion_sessions`, aucune `user_attack_cards`, aucune `memory_items` observee pour ce user QA.
- Test contractuel local: `/usr/local/bin/deno test --allow-env --allow-net --allow-read --filter "demotivation_repair" supabase/functions/sophia-brain/skills/skills_s3.test.ts` -> 15 passed, 0 failed.

**Problemes**
- Tours 2 et 5: mauvais tool owner malgre contraintes. Famille: `BF-ROUTE-03`. Impact systeme: route incoherente et final response issue d'un tool bloque.
- Tour 3: selected handler incoherent avec reponse visible. Famille: `BF-TEST-01` secondaire possible, mais source principale `BF-ROUTE-03`.
- Tour 4: action readiness non reconnue. Famille: `BF-AGENDA-02`. Impact systeme: clarification superflue au lieu d'un handoff/reply.

**Fix propose**
- Source amont: `clarification_candidate_builder`, `clarification_arbitrator`, orientation resolved path et `operation_suggestion_resolver`.
- Correction recommandee: quand la clarification porte sur une intention conversationnelle, conserver les candidates conversationnelles comme owners finals; appliquer les contraintes `no_tool/no_potion` avant promotion de candidate tool; brancher le handoff `demotivation_repair -> execution_breakdown` pour action prete.
- Tests d'invariant attendus: positif `demotivation_repair no_potion real route`, paraphrase "je veux juste motivation", anti-faux-positif "active une potion courage", integration "preparer mon demarrage" dans flow demotivation.

## Verdict Global

Red. Le contrat local `demotivation_repair` est vert, mais le run IA reel ne route jamais vers ce skill et transforme la reparation de demotivation en potion/carte bloquees.
