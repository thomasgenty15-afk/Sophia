# QA Run Report - Demotivation Repair R2

## 1. Contexte Du Test

- Date: 2026-06-02
- Run: `demotivation_repair_20260602_r2`
- Persona: `qa-skill`
- Connection: `demotivation_repair_20260602-r1` temporaire reutilisee apres reset cible
- Objectif: rerun IA reel de `demotivation_repair` avec charte anti-patching en tete, sans modification de code pendant le run.
- Trajectoire: perte d'elan -> refus outil/potion -> phrase anti-identitaire -> demande de micro-action sans outil -> correction utilisateur.
- Surfaces visees: dispatcher, `demotivation_repair`, `emotional_repair`, `execution_breakdown`, orientation clarification, final response/ledger guards, constraints `no_tool` et `no_potion`.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, pas de fallback deterministe.
- Validite QA: valide. Le run est conversationnel, tour par tour, avec raw JSON dans `tmp/demotivation_repair_20260602_r2/`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Je suis devant mon plan et je sens juste un gros blanc. Pas une crise, pas de danger, juste cette impression que tout ce que je relance finit par s'eteindre.

**Sophia**
> Ce blanc est souvent une réaction quand l'esprit sature de relancer des efforts qui semblent ne pas tenir. On ne va rien forcer ni modifier pour l'instant. Est-ce que cette impression que tout s'éteint arrive dès le premier geste ou après quelques jours ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `skill_entry_signal`
- skill_signal: `demotivation_repair`, high, `user_expresses_futility_and_loss_of_momentum`
- tool_skill_opportunity: `state_potion`, `should_offer=false`, `must_not_execute=true`
- executed_tools: `[]`
- durable_effect: none

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - slot fourni mais redemande

**User**
> C'est surtout apres deux ou trois jours. Je repars, puis ca retombe, et je conclus que ca ne sert a rien. Ne me propose pas de potion ni d'outil; reste juste avec moi sur ce decouragement.

**Sophia**
> Ce blanc est souvent une réaction quand l'esprit sature de relancer des efforts qui semblent ne pas tenir. On ne va rien forcer ni modifier pour l'instant. Est-ce que cette impression que tout s'éteint arrive dès le premier geste ou après quelques jours ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `demotivation_repair`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- skill_signal: lifecycle `demotivation_repair`, high
- tool_skill_opportunity: `none`, `must_not_execute=true`
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: Sophia repete quasiment T1 et repose exactement la question que l'utilisateur vient de traiter.
- Source amont probable: resolution de clarification vers skill conversationnel sans injection correcte du slot resolu dans le contexte/reponse.
- Owner runtime: clarification state / `demotivation_repair` context recovery.
- Meilleure correction: transmettre le slot resolu au skill et interdire la repetition de la question resolue.
- Pourquoi ce n'est pas un patch regex: la trace a deja la bonne intent; il faut corriger le contrat de clarification/context, pas matcher cette phrase.

### Tour 3

**Verdict du tour:** green

**User**
> Je viens de te repondre: apres deux ou trois jours. Ne me repose pas la question. Donne-moi juste une phrase courte pour ne pas transformer cette rechute en preuve que je suis foutu.

**Sophia**
> Ok. Quand ça retombe au bout de 2-3 jours, ce n’est pas “je suis foutu”, c’est juste “ça ne tient pas encore”, et on ne conclut pas avant d’avoir tenu le prochain petit segment. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `emotional_repair`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- skill_signals: entry `emotional_repair`, high; lifecycle `demotivation_repair`, high
- tool_skill_opportunity: `none`, `must_not_execute=true`
- executed_tools: `[]`
- durable_effect: none

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-LEDGER-01` - guard ledger/final response hors contexte

**User**
> La phrase m'aide. Maintenant je veux juste un premier geste de 90 secondes, choisi par toi, sans outil et sans reclarification.

**Sophia**
> Je ne l'ai pas modifié. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- skill_signal: entry `execution_breakdown`, high, `user_requests_micro_step_to_break_friction`
- tool_skill_opportunity: `none`, `must_not_execute=true`
- executed_tools: `[]`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le routing est coherent (`execution_breakdown`), mais la reponse visible est un message de non-modification hors sujet.
- Source amont probable: final response guard / ledger guard injecte une phrase de non-commit alors que le user demande une action conversationnelle non mutante.
- Owner runtime: final response pipeline / EffectLedger guard admission.
- Meilleure correction: un guard "no mutation" ne doit parler que si une mutation etait demandee, annoncee ou ambigue; il ne doit pas remplacer une reponse conversationnelle attendue.
- Pourquoi ce n'est pas un patch regex: le dispatcher a reconnu la micro-action; la correction est un invariant de pipeline, pas une detection de mots.

### Tour 5

**Verdict du tour:** green

**User**
> Je ne t'ai pas demande de modifier quoi que ce soit. Je veux juste le geste de 90 secondes a faire maintenant.

**Sophia**
> Ouvre ton plan, choisis la toute première ligne et note juste un mot ou fais un clic pour marquer ta présence dessus. C'est ton geste de 90 secondes pour briser le blanc sans rien relancer de lourd. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `active_conversation_skill_continue`
- skill_signal: lifecycle `execution_breakdown`, high
- tool_skill_opportunity: `none`, `must_not_execute=true`
- executed_tools: `[]`
- durable_effect: none

## 3. Analyse De Fluidite Humaine

**Verdict: yellow/red**

**Ce qui marche**
- Le run ne reproduit pas la capture visible par `select_state_potion`.
- Le refus "pas de potion ni d'outil" est respecte cote tool/effects.
- T3 et T5 sont humainement utiles et actionnables.

**Problemes**
- T2: repetition forte et question deja resolue. Famille: `BF-INTAKE-01`. Impact: l'utilisateur doit se repeter.
- T4: reponse hors sujet "Je ne l'ai pas modifié" au lieu du geste demande. Famille: `BF-LEDGER-01`. Impact: rupture du flow juste au moment de retour au concret.
- Latence: T1-T4 prennent plusieurs dizaines de secondes. Impact: warning technique pour un run conversationnel.

**Fix propose**
- Source amont: clarification state/context recovery et final response pipeline.
- Correction recommandee: propager le slot resolu vers le skill; limiter les guards ledger/no-mutation aux tours ou une mutation est en jeu.
- Tests d'invariant attendus: clarification resolue ne repose pas la meme question; demande de micro-action non mutante ne peut pas etre remplacee par une phrase de non-modification.

## 4. Analyse Systeme

**Verdict: yellow/red**

**Routage**
- T1-T2: `demotivation_repair` high confidence et owner conversationnel.
- T3: bascule `emotional_repair` justifiable par auto-attaque explicite, avec `demotivation_repair` encore high en lifecycle.
- T4-T5: `execution_breakdown` high confidence pour micro-action, routage coherent.
- Aucun tour ne route vers `select_state_potion`; l'ancienne capture potion du R1 n'est pas reproduite.

**Skills / Operations / Tools**
- `demotivation_repair`: entree correcte, mais repetition apres clarification resolue.
- `emotional_repair`: reponse utile sur auto-attaque.
- `execution_breakdown`: route correcte; T4 rendu casse, T5 rendu correct.
- Tools/effects: aucun outil execute.

**DB**
- Avant cleanup:
  - `chat_messages`: 10 dans le scope du run.
  - `scheduled_checkins`: 0.
  - `user_potion_sessions`: 0.
  - `user_cycles`: 0.
  - `memory_items`: 0.
  - `user_topic_memories`: 0.
  - `user_profile_facts`: 9 facts systeme par defaut.

**Anti-Patching**
- La meilleure lecture n'est pas "ajouter une regex".
- T2: le dispatcher/clarification a la bonne destination, mais la reponse ne consomme pas le slot resolu.
- T4: le dispatcher a la bonne intent `execution_breakdown`; la reponse visible est ecrasee par un guard/final pipeline hors contexte.

## Verdict Global

Yellow/red. Le bug R1 `select_state_potion` n'est pas reproduit, mais le rerun revele deux problemes amont plus larges: clarification resolue qui ne nourrit pas correctement le skill, et final response/ledger guard qui peut remplacer une reponse conversationnelle non mutante.
