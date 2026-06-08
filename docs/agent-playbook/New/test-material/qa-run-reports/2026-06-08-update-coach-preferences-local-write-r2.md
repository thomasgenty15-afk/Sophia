## 1. Contexte Du Test

- Date: 2026-06-08
- Run: 2026-06-08-update-coach-preferences-local-write-r2
- Persona: alex (alex12@gmail.com)
- Objectif: vérifier en conditions réelles le nouveau flow local write `update_coach_preferences`.
- Trajectoire: write durable clair -> status read-only -> demande unsupported sans write.
- Surfaces visees: dispatcher global, `update_coach_preferences.local_dispatcher`, reducer, writer `user_profile_facts`, visible agent, EffectLedger/runtime trace.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, login password local, aucun fallback deterministe.
- Validite QA: valide; auth verify 200; JWT non affiche.
- Limite identifiee apres revue: le Tour 2 teste une question de status apres
  l'echec du Tour 1, donc il observe surtout le routing direct `status_recap`.
  Le run ne couvrait pas encore le cas "question status ou product_help inline
  pendant un flow actif `update_coach_preferences`".

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-ROUTE-01 — mauvais owner sélectionné

**User**
> Pour la suite, limite vraiment les questions et réponds plus directement quand je suis bloqué.

**Sophia**
> Ok, compris. Quand tu es bloqué, je passe en mode direct: moins de questions, plus de solutions concrètes, tout de suite. 💪
> 
> Là, tu es bloqué sur quoi précisément ? (A ou B)

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `none`
- direct_effects: []
- operation: {"status":null,"reason_code":null,"flow_action":null,"visible_task_kind":null,"toolExecution":"none"}
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: []
- db_check: coach.question_tendency=not_low_or_missing

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-ROUTE-03 — product/status/tool mal priorisés

**User**
> Tu peux me dire ce que tu as comme préférences coach actives maintenant ?

**Sophia**
> Je peux. Là, j’ai une seule préférence coach explicitement enregistrée : ton = direct. 💪  
> Pour le reste, aucune autre préférence coach enregistrée.
> 
> Tu veux que je te liste aussi les réglages système (valeurs par défaut) ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: `low`
- direct_effects: []
- operation: {"status":null,"reason_code":null,"flow_action":null,"visible_task_kind":null,"toolExecution":"none"}
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: []

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Et je veux aussi que tu n'utilises jamais d'emoji et que tu répondes toujours en trois lignes.

**Sophia**
> Je ne dispose pas de réglages durables pour supprimer totalement les emojis ou fixer une longueur de réponse précise à trois lignes. Je peux par contre continuer à adapter mon ton ou ma réactivité selon les options disponibles. Est-ce qu'il y a un autre aspect de mon accompagnement que tu souhaiterais ajuster ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `update_coach_preferences`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: []
- operation: {"status":"collecting","reason_code":"update_coach_preferences_unsupported_preference","flow_action":"unsupported_preference","visible_task_kind":"unsupported_preference","toolExecution":"none"}
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: []

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 3 explique correctement qu’il n’existe pas de réglage durable pour zéro emoji / trois lignes.
- Le status du Tour 2 reste compréhensible pour l'utilisateur et ne produit pas de write durable.

**Problemes**
- Tour 1: Sophia répond comme si elle allait durablement changer son comportement, mais aucun write n’a eu lieu. Famille: BF-ROUTE-01, avec risque BF-LEDGER-01 côté claim visible. Impact: l’utilisateur croit que la préférence est appliquée alors que DB reste inchangée. Sévérité: red.
- Tour 2: la question de statut sur les préférences coach aurait dû armer `status_recap` / `status_only_no_mutation_check`. Elle reste servie par `normal_reply`, donc la réponse n'est pas passée par le runtime read-only DB-grounded attendu. Famille: BF-ROUTE-03. Sévérité: yellow.

**Fix propose**
- Source amont: dispatcher / arbitrage route tool-skill.
- Correction recommandee: renforcer la détection structurée `update_coach_preferences` pour les demandes durables explicites de style comportemental coach, sans ajouter de regex métier dans `run.ts`.
- Tests d'invariant attendus: paraphrases de “pour la suite, moins de questions / plus direct”, anti-faux-positif ponctuel “là maintenant sois direct”, status question directe “préférences coach actives” -> `status_recap`, question status inline pendant flow `update_coach_preferences` -> sub-skill `status_recap` sans global dispatcher, question produit inline -> sub-skill `product_help`, et intégration `test-send-message` qui vérifie `executed_tools=["update_coach_preferences"]` + DB pour les writes.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 1 aurait dû router vers `update_coach_preferences`, mais reste en `normal_reply`.
- Tour 2 aurait dû router vers le runtime `status_recap` via `status_only_no_mutation_check`, mais reste en `normal_reply`.
- Tour 3 ne produit pas de side effect durable pour une demande non supportée.
- Couverture manquante du run: si `update_coach_preferences` est actif et que
  le user demande ses préférences actuelles ou une explication des réglages, le
  dispatcher global doit rester skippe; le flow local doit appeler
  `status_recap` ou `product_help` comme sub-skill inline.

**Skills / Operations / Tools**
- Tour 1: executed_tools=[], committed_effect=[].
- Tour 2: executed_tools=[]; `toolSkillRun.selected_handler=status_recap` attendu mais absent.
- Tour 3: executed_tools=[].

**Memory / Effets durables**
- DB après Tour 1: `coach.question_tendency=low` observe=false.
- Cleanup fin de run: `coach.question_tendency` restauré automatiquement; `coach.tone` restauré ensuite manuellement après détection du cleanup incomplet. Vérification finale DB: `coach.tone=warm_direct`, `coach.question_tendency=normal`, `coach.challenge_level=balanced`.

**Problemes**
- Tour 1: mauvais owner `normal_reply` pour une demande durable claire. Famille: BF-ROUTE-01. Impact système: aucun `operation_flow_run`, aucun `executed_tools`, aucun `committed_effects`, DB inchangée.
- Tour 1: claim visible de changement durable sans commit. Famille secondaire: BF-LEDGER-01. Impact système: le final response guard ne peut pas corriger si l’intention tool n’est pas représentée.
- Tour 2: mauvais owner pour une question de statut réel. Famille: BF-ROUTE-03. Impact système: `status_recap` n'est pas armé, donc pas de projection DB-grounded officielle pour les préférences coach.

**Fix propose**
- Source amont: dispatcher v2 / tool-skill intent detection pour `update_coach_preferences`.
- Correction recommandee: corriger le prompt/contrat de routing afin que les formulations durables explicites de préférence coach soient représentées comme `tool_skill_intents.update_coach_preferences` et sélectionnent le handler.
- Correction complémentaire: corriger le signal status pour que les questions sur préférences coach actives, actions actives, cartes, potions et autres états réels routent vers `status_recap`, sans ajouter de parsing métier dans `run.ts`.
- Correction complémentaire runtime local: pendant un flow actif `update_coach_preferences`, router les questions de status vers le sub-skill `status_recap` et les questions d'explication produit vers le sub-skill `product_help`, en conservant `update_coach_preferences` comme owner.
- Tests d'invariant attendus: vérifier que les claims visibles de succès restent dépendants de `committed_effects`; vérifier que `toolSkillRun.selected_handler=status_recap` apparaît pour les questions de statut DB directes; vérifier que `toolSkillRun.subskill_run.skill_id=status_recap|product_help` apparaît pour les questions inline pendant le flow coach preferences.

## Verdict Global

- Verdict: red
- Raison principale: Tour 1 rate le routing vers `update_coach_preferences` et produit une promesse visible sans commit DB. Tour 2 expose aussi un mauvais owner pour les questions de statut, qui devraient passer par `status_recap`; le scénario ne couvrait pas encore les questions status/product_help inline pendant flow coach preferences actif.
- Follow-up prioritaire: corriger la détection routing amont, puis rejouer direct write + status_recap direct + status/product_help inline pendant flow actif + ponctuel anti-faux-positif + unsupported no-write.
- Correction locale post-run: ajout d'un few-shot dispatcher pour le Tour 1,
  mise à jour de la description active `update_coach_preferences`, et branchement
  sub-skill inline `status_recap` / `product_help` dans le flow local. Statut à
  confirmer par rerun QA réel.
