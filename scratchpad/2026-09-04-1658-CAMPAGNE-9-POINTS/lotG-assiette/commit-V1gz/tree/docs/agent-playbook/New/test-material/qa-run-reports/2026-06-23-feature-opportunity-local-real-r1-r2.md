# QA Run - Feature Opportunity Local Real R1/R2

## 1. Contexte Du Test

- Date: 2026-06-23, run execute en local Sophia.
- Run: `feature-opportunity-local-real-20260623-r1` puis variante `feature-opportunity-local-real-20260623-r2`.
- Persona: `qa-skill`, connexions temporaires dediees `feature_opportunity_feature-opportunity-local-real-20260623-r1` et `feature_opportunity_feature-opportunity-local-real-20260623-r2`.
- Objectif: verifier `feature_opportunity` apres alignement avec `coaching_recommendation`: input dispatcher -> skill visible, infos produit dans le visible prompt, absence de handoff local sauf sortie globale.
- Trajectoire: detection `initiatives`, suivi produit lie, sortie hors sujet vers global, detection `coach_preferences`, suivi produit lie.
- Surfaces visees: global dispatcher, active skill ownership, `feature_opportunity`, `coaching_recommendation`, visible agent, exit global, absence de tool/side effect.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback direct, pas de code fix pendant le run.
- Validite QA: valide. `supabase status` signalait des services auxiliaires arretes, mais API/Auth/Functions/DB etaient joignables. Les deux connexions temporaires et leurs donnees de test ont ete nettoyees en fin de run.
- Artefacts: `tests/real-personas/qa-skill/runs/feature_opportunity/feature-opportunity-local-real-20260623-r1.raw.json`, `tests/real-personas/qa-skill/runs/feature_opportunity/feature-opportunity-local-real-20260623-r2.raw.json`.

## 2. Tours De Conversation

### Variante N.1 - entree ambigue recurrente + demande produit explicite

#### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 - Mauvais owner selectionne.

**User**
> Tous les soirs, après avoir fermé mon ordi, je perds le fil du rituel de préparation du lendemain. Je sens qu’il faudrait que Sophia me soutienne sur ce moment qui revient souvent, mais je ne sais pas comment le poser.

**Sophia**
> Tu veux te débloquer par rapport à quoi exactement, dans ce rituel du soir ?

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `coaching_recommendation_signal`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: etat actif `coaching_recommendation`, `stage=understand_need`, `coaching_type=unclear`

**Analyse si yellow/red**
- Symptome: un contexte recurrent "tous les soirs" est capture comme demande de coaching, alors que l'opportunite `initiatives` etait plausible.
- Source amont probable: arbitrage global dispatcher entre `coaching_recommendation` et `feature_opportunity`.
- Owner runtime: global dispatcher / route policy.
- Meilleure correction selon les guidelines: renforcer le contrat d'arbitrage pour ne pas transformer tout "me soutenir" + contexte recurrent en coaching quand le besoin est surtout une surface produit recurrente.
- Pourquoi ce n'est pas un patch local: le mauvais owner est choisi avant `feature_opportunity`; corriger le visible prompt ne peut pas recuperer ce tour.

#### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-02 - Ancien flow capture une nouvelle intention.

**User**
> Pas vraiment me débloquer. Je veux surtout savoir quelle fonctionnalité de Sophia est faite pour suivre ce genre de rituel qui revient tous les soirs, sans créer juste un rappel ponctuel.

**Sophia**
> Pour t’orienter proprement, tu veux qu’on regarde quel moment précis du rituel du soir te bloque ?

**Trace courte**
- http_status: 200
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- route_reason: `active_coaching_recommendation`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: etat actif `coaching_recommendation` conserve, pas de sortie vers global, pas de `feature_opportunity`

**Analyse si yellow/red**
- Symptome: le user corrige explicitement "pas me debloquer" et demande la fonctionnalite Sophia, mais l'active flow coaching continue a poser une question de blocage.
- Source amont probable: interruption/exit policy de `coaching_recommendation` face a une intention produit explicite.
- Owner runtime: `coaching_recommendation` local dispatcher / active flow policy.
- Meilleure correction selon les guidelines: autoriser la sortie vers global quand le user nie le cadre coaching et reformule vers une opportunite produit ou une question produit.
- Pourquoi ce n'est pas un patch local: le probleme est la propriete active du tour, pas la phrase visible.

### Variante N.2 - trajectoire cible feature_opportunity

#### Tour 1

**Verdict du tour:** green

**User**
> Le vendredi avant l’apéro avec mes collègues, je finis presque toujours par reprendre une clope alors que j’avais décidé de ne pas en acheter.

**Sophia**
> Le bon point d’entrée, c’est les initiatives : ton déclencheur est récurrent et très lié à un moment précis. On peut partir du vendredi avant l’apéro pour repérer ce qui te fait craquer juste avant.

**Trace courte**
- http_status: 200
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `feature_opportunity_signal`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: etat actif `feature_opportunity`, feature `initiatives`, `opportunity_kind=recurring_context`

#### Tour 2

**Verdict du tour:** green

**User**
> Initiative, ça veut dire quoi concrètement dans Sophia, et où est-ce que je la règle si je veux préparer ce moment moi-même ?

**Sophia**
> Concrètement, une initiative sert à préparer à l’avance un moment récurrent ou délicat, comme ton vendredi avant l’apéro.
>
> Tu peux la régler dans la section Initiatives de Sophia, avec l’instruction, le contexte, l’heure, les jours actifs et la destination.

**Trace courte**
- http_status: 200
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `active_feature_opportunity`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: etat actif `feature_opportunity` conserve, aucun tool appele

#### Tour 3

**Verdict du tour:** green

**User**
> Ok, autre sujet : c’est quoi la différence entre une carte d’attaque et une carte de défense ?

**Sophia**
> Une carte d’attaque sert à agir avant la tentation ou le problème, pour réduire le risque qu’il arrive.  
> Une carte de défense sert à réagir quand le moment critique est déjà là, pour éviter de céder ou limiter la casse.
>
> En gros :
> - attaque = prévention
> - défense = réponse sur le moment
>
> Si tu veux, je peux te donner un exemple concret sur ton vendredi avant l’apéro 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `feature_opportunity_exit_to_global`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: etat actif nettoye

#### Tour 4

**Verdict du tour:** green

**User**
> D’ailleurs, dans nos échanges, tu me poses souvent trop de questions. J’aimerais que Sophia soit plus directe quand je bloque.

**Sophia**
> Oui, ça relève de tes préférences de coaching. Tu peux régler Sophia pour qu’elle soit plus directe et qu’elle pose moins de questions quand tu bloques.

**Trace courte**
- http_status: 200
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `feature_opportunity_signal`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: etat actif `feature_opportunity`, feature `coach_preferences`, `opportunity_kind=coach_style_feedback`

#### Tour 5

**Verdict du tour:** green

**User**
> Et je règle ça où exactement ? Je veux juste savoir l’endroit, pas que tu l’appliques depuis le chat.

**Sophia**
> Ça se règle dans les préférences de coaching, sur le style d’accompagnement. Cherche l’option liée au ton, à la directivité ou au nombre de questions.

**Trace courte**
- http_status: 200
- response_owner: `feature_opportunity`
- selected_handler: `feature_opportunity`
- route_reason: `active_feature_opportunity`
- safety: non signalee
- direct_effects: aucun
- operation: aucune
- pending_confirmation: aucune
- memory_plan: non pertinent pour ce tour
- executed_tools: []
- durable_effect: etat actif `feature_opportunity` conserve, aucun tool appele

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Quand `feature_opportunity` est le owner, l'experience est lisible: Sophia nomme `initiatives`, donne la raison recurrente, explique la section produit, et ne pretend pas avoir cree ou sauvegarde quoi que ce soit.
- Le suivi produit lie reste naturel: le user peut demander "c'est quoi" et "ou le regler" sans sortir du flow.
- La sortie hors sujet est comprehensible pour l'utilisateur: Sophia repond a la nouvelle question et ne reste pas bloquee sur les initiatives.
- `coach_preferences` est reconnu proprement et ne promet pas d'application depuis le chat.

**Problemes**
- Variante N.1 T1: l'entree naturelle avec "rituel qui revient souvent" + "Sophia me soutienne" bascule en coaching. Famille: BF-ROUTE-01. Impact: le user doit parler comme un test pour obtenir `feature_opportunity`. Severite: red.
- Variante N.1 T2: meme apres "pas vraiment me debloquer" et "quelle fonctionnalite", Sophia continue a chercher le blocage. Famille: BF-ROUTE-02. Impact: recuperation conversationnelle impossible depuis le mauvais flow. Severite: red.
- Variante N.2 T3: la reponse se termine par une proposition de retour a l'ancien contexte, avec emoji. C'est mineur et non bloquant, mais la transition aurait pu etre plus sobre. Severite: green.

**Fix propose**
- Source amont: arbitrage dispatcher + active flow exit policy de `coaching_recommendation`.
- Correction recommandee: ajouter une regle contractuelle et des tests d'integration pour les formulations recurrentes non demandantes de levier coaching, et une sortie active quand le user nie explicitement le cadre coaching puis demande une fonctionnalite/surface.
- Tests d'invariant attendus: paraphrases avec "me soutenir", "rituel", "moment qui revient"; contre-exemples ou le user demande vraiment un levier coaching; follow-up actif "pas me debloquer, quelle fonctionnalite" qui doit sortir vers global ou `feature_opportunity`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- N.1 T1 choisit `coaching_recommendation` avec `coaching_recommendation_signal` au lieu de `feature_opportunity`; c'est un mauvais owner upstream.
- N.1 T2 reste en `active_coaching_recommendation` malgre une correction explicite du user vers une question produit/opportunite.
- N.2 T1, T2, T4, T5 valident le routage `feature_opportunity` et la conservation d'ownership sur les suivis produit lies.
- N.2 T3 valide la sortie hors sujet: `reason_code=feature_opportunity_exit_to_global`, `response_owner=normal_reply`, active state nettoye. Aucun handoff local product_help/safety n'est observe.

**Skills / Operations / Tools**
- `feature_opportunity` n'appelle aucun tool et ne cree aucun effet durable, conforme au contrat.
- Les infos produit attendues sont bien presentes dans le visible: `section Initiatives`, instruction, contexte, heure, jours actifs, destination; puis preferences de coaching/style/directivite/questions.
- Aucun nom interne `recurring_reminder` n'apparait dans les reponses visibles.
- Aucun side effect n'est demande, autorise ou commis.

**Memoire / DB**
- Les etats actifs temporaires correspondent aux flows observes.
- Les deux connexions temporaires ont ete nettoyees apres capture des artefacts raw/summary.

**Correction concrete**
- Owner primaire: global dispatcher pour l'arbitrage initial `coaching_recommendation` vs `feature_opportunity`.
- Owner secondaire: `coaching_recommendation` active flow policy pour sortir quand le user refuse le cadre coaching et reformule vers une surface produit.
- Ne pas corriger par phrase visible: le visible agent de `feature_opportunity` fonctionne sur N.2; l'echec se produit avant qu'il soit appele.

## 5. Verdict Global

**Verdict global: red**

Le flow `feature_opportunity` est valide une fois declenche: pas de handoff local, visible prompt produit utile, pas de tool, sortie globale propre. En revanche le run n'est pas green, car une formulation naturelle d'opportunite recurrente part dans `coaching_recommendation` et le follow-up produit ne permet pas de recuperer.
