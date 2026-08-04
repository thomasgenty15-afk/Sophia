# QA Run Report - Phase 2 Action/Level Memory + Review Routing

## 1. Contexte Du Test

- Date: 2026-05-15
- Run: `phase2-real-20260515-h`
- Persona: fixture locale type Rose/Paul, user dedie local `3fd540cc-185b-47a9-86ab-7b3bb96d0a56`
- Objectif: relancer, corriger, relancer les tests action memory / level handoff / daily-weekly review ownership jusqu'a stabilisation.
- Trajectoire: action memory hors review, level handoff nouveau niveau, daily actif, weekly actif, sortie explicite de flow.
- Surfaces visees: dispatcher, memory_plan, active loader V2, routers, active skill arbitration, direct effects, operation opportunity.
- Cadre IA reel: Supabase local, `test-send-message`, `force_full_ai=true`, pas de fallback `processMessage`, messages choisis tour par tour.
- Validite QA: valide, avec une erreur upstream 502 retentee sans fallback.

## 2. Tours De Conversation

### S1 - Action Memory

**User**
> Pour Session focus courte, souvenirs memorises uniquement : qu'est-ce qui aide au demarrage ?

**Sophia**
> D'après tes souvenirs mémorisés uniquement pour Session focus courte :
> - Sur Session focus courte, le user demarre mieux quand il ouvre directement un fichier deja pret et lance un minuteur de 12 minutes.
> - Pattern famille session_focus: quand la cible augmente, garder un demarrage sous 15 minutes evite que l'habitude devienne intimidante.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- direct_effects: []
- operation: `should_offer=false`
- memory_plan: action target exact `890eca2f...`, `memory_mode=light`
- durable_effect: aucun

### S2 - Level Memory

**User**
> Je commence un nouveau niveau : lis le handoff du niveau precedent. Quel signal exact tu dois garder ?

**Sophia**
> Reponse initiale trop generique: Sophia a demande au user de coller le handoff au lieu de l'utiliser.

**Trace courte**
- response_owner: `normal_reply`
- level_reference: `detected=true`, `status=transition`
- memory_plan: targets `level`, `memory_mode=light`
- durable_effect: aucun

**Correction appliquee**
- `loadLevelHandoffItems` a recu un fallback `metadata->>memory_type = level_execution_handoff`.
- Verification source locale: `loadMemoryV2Payload` charge bien 1 item level, avec le contenu handoff attendu.

**Retest User**
> Reprise courte : utilise le handoff du niveau precedent. Le signal attendu parle d'une seule prochaine action et d'eviter les gros blocs abstraits.

**Sophia**
> Le signal attendu, c’est une seule prochaine action hyper concrète [...] et tu évites de te perdre dans un bloc abstrait ou trop large.

**Trace courte**
- http_status: 200
- level_reference: `detected=true`
- memory events: handoff `b9add71b...` chargé dans le payload final
- incident: un tour intermediaire a eu un 502 upstream, retente sans fallback

### S3 - Daily Review Actif

**Setup**
`__active_skill_state.skill_id = daily_action_review_v1`

**User**
> Pour le check du soir : Session focus courte faite. Bloquer les creneaux de la semaine pas fait, j'etais trop fatigue, et je ne sais pas encore si ca vaut le coup de reporter.

**Sophia**
> Action adaptee a toi: une action de sept minutes, observable et concrete...

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `daily_action_review_v1`
- route_reason: `active_conversation_skill_continue`
- action_reference: suppressed, `review_skill_owns_action_context`
- level_reference: suppressed
- memory_plan: `memory_mode=none`, targets []
- direct_effects: []
- operation: none
- durable_effect: aucun report automatique, aucune entry creee

### S4 - Weekly Review Actif

**Setup**
`__active_skill_state.skill_id = weekly_adaptive_review_v1`

**User**
> Pour le bilan de semaine : les habitudes ont ete tenues, la mission pas faite. Je veux comprendre pourquoi avant de decider, pas ajuster le plan maintenant.

**Sophia**
> C'est noté pour tes habitudes, bravo d'avoir tenu le rythme. Pour la mission Bloquer les créneaux de la semaine, on va regarder ça de plus près sans rien toucher au plan.

**Trace courte**
- response_owner: `conversation_handler`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_conversation_skill_continue`
- memory_plan: `memory_mode=none`, targets []
- direct_effects: []
- operation: none
- durable_effect: aucun ajustement de plan

### S5 - Sortie De Flow

**Setup**
`__active_skill_state.skill_id = weekly_adaptive_review_v1`

**User**
> On s'arrete la pour le bilan. Je veux juste revenir au fil normal.

**Sophia**
> C'est noté. On ferme la parenthèse du bilan et on reprend le cours des choses.

**Trace courte**
- route_reason avant correction: `active_skill_exit_requested`, arbitration `abandon_active`, mais `response_owner` restait `conversation_handler`.
- Correction appliquee: `routers.ts` retourne maintenant `normal_reply` quand arbitration=`abandon_active` et selected_owner=`normal_reply`.
- Tests unitaires router: green.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- S1 est net: Sophia restitue les souvenirs action exacts, sans inventer et sans proposer d'operation.
- S4 est fluide: le weekly garde le cadre, felicite les habitudes, ne force pas d'ajustement.
- S5 repond humainement a la sortie du bilan.

**Problemes**
- S2 initial: Sophia ne consomme pas correctement le handoff en conversation avant correction/retest. Impact: elle redemande au user une info deja stockee. Severite: yellow.
- S3: le contenu verbal du daily est encore trop generique parce que le vrai skill daily conversationnel n'est pas implemente dans ce chemin local; le routing, lui, est correct. Severite: yellow.

**Fix propose**
- Garder le fallback loader level ajoute.
- Ajouter un test d'integration source pour `level` scope + `level_execution_handoff`.
- Brancher le vrai renderer/runner de `daily_action_review_v1` au lieu de laisser Companion repondre generic quand le handler est selectionne.

## 4. Analyse Systeme

**Verdict: green avec warnings**

**Routage**
- Action memory hors review: memory target action exact, family key stable `habit:session_focus`, no direct effect.
- Daily/weekly actifs: action/level memory dispatcher desactivee, operation opportunities desactivees, direct effects vides.
- Active flow continuation: router renvoie bien le handler actif daily/weekly.
- Active flow exit: corrigé pour passer a `normal_reply` sur `abandon_active`.

**Skills / Operations / Tools**
- Aucune operation tool skill n'est lancee sans demande explicite.
- Aucun report/track progress n'est applique pendant daily/weekly actif.
- La simple confirmation action ne propose plus de carte d'attaque.

**Memory / Effets durables**
- Action memory: green, exact + family chargees et exploitees.
- Level handoff: source loader green apres fallback; conversation locale a montre un premier miss puis un retest exploitable.
- Effets durables: aucune entry creee sur S3/S4, conforme a l'attendu.

**Problemes**
- S2: le chargement level etait a 0 avant fallback JSONB. Impact systeme: handoff non injecte. Severite: yellow, corrige source.
- S5: shape exit sans `detected:true` n'etait pas absorbee. Impact systeme: flow actif pouvait rester owner. Severite: yellow, corrige source.

**Fix propose**
- Ajouter tests unitaires:
  - `memory loader level handoff from metadata->>memory_type`.
  - `router abandon_active returns normal_reply`.
  - `active review blocks direct_effects + operation opportunities`.

## Verdict Global

- Verdict: yellow
- Raison principale: les corrections source sont en place et les invariants critiques sont verts, mais le run conversationnel a expose deux warnings non totalement couverts par tests d'integration dedies.
- Follow-up prioritaire: ajouter les tests d'integration ci-dessus puis brancher le vrai runner daily/weekly pour eviter les reponses generic Companion.
