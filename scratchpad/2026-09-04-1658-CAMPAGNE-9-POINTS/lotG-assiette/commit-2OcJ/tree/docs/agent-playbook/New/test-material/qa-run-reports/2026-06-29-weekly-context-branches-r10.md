# Weekly Context Branches R10 - QA Run Report

## 1. Contexte Du Test

- Date: 2026-06-29
- Runs:
  - `weekly-qa-20260629-r10a-level-partial_habits_mission_partial`
  - `weekly-qa-20260629-r10b-nextweek-partial_habits_mission_partial`
- Persona: temporary QA users, connexions dediees locales.
- Objectif: verifier les deux branches weekly de contexte planning: `next_level_required` quand aucune semaine suivante n'est configuree, et `next_week_configured` quand une semaine suivante existe deja.
- Trajectoire: fixtures weekly dynamiques semaine 2026-06-15 -> 2026-06-21, Tour 0 via `/functions/v1/process-checkins`, puis conversation via `/functions/v1/test-send-message` avec `force_full_ai=true`.
- Surfaces visees: `process-checkins`, `weekly_adaptive_review_v1`, `weekly_planning_context`, `adjust_recommendation`, visible agents `weekly_synthesis`, `weekly_adjust_recommendation`, `weekly_closure`, active-flow completion.
- Cadre IA reel: Supabase local, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct, pas de staging, pas de code modifie pendant les runs.
- Validite QA: valide. Tour 0 a traite les deux checkins (`success=true`, `processed=2`). Le run B a ete prepare par patch cible du plan QA pour ajouter une semaine 2 `upcoming`.

## 2. Tours De Conversation

### Run A - `next_level_required`

#### Tour 0 - Opening proactive

**Verdict du tour:** green

**User**
> N/A - scheduled checkin weekly via `process-checkins`.

**Sophia**
> C’est le moment de faire le point sur ta semaine.
> J’ai vu quelques actions qui avancent bien et d’autres restées un peu en suspens, donc on peut regarder ça simplement.
> Comment tu l’as vécue dans l’ensemble ?

**Trace courte**
- endpoint: `/functions/v1/process-checkins`
- process_checkins: `success=true`, `processed=2` pour le batch R10
- scheduled_checkin.status: `sent`
- opening_source: `process-checkins:weekly_adaptive_review_opening`

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> Je l’ai vécue comme un progrès réel mais encore fragile. Le point positif a tenu surtout quand je finissais tôt, la respiration aussi, mais dès que je rentrais tard la version normale devenait trop lourde. Le signal de pause est resté en brouillon.

**Sophia**
> Sur cette semaine, qu’est-ce qui t’a le plus marqué dans ton expérience globale ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- empty_response: false
- aborted: false
- executed_tools: none observed
- durable_effect: none observed

**Analyse si yellow/red**
- Symptome: Sophia redemande l'experience globale alors que le user a deja donne ressenti, cause et actions.
- Source amont probable: capture trop prudente du gate `week_experience_status`.
- Owner runtime: `weekly_adaptive_review_v1` intake/gates.
- Meilleure correction selon les guidelines: capturer les signaux deja fournis dans les gates structurés sans regex metier.
- Pourquoi ce n'est pas un patch local: le probleme est la capture de slot, pas le texte exact.

#### Tour 2

**Verdict du tour:** green

**User**
> Ce qui m’a le plus marqué, c’est que ça tient seulement quand c’est très court. Dès que la journée déborde, je n’ai plus l’énergie pour la version complète. Donc je vois un progrès, mais pas encore un rythme installé.

**Sophia**
> Tu as bien vécu un progrès réel cette semaine, mais encore fragile. Les points qui tiennent sont la version courte quand tu finis tôt et la respiration de pause; dès que tu rentres tard, la version normale devient trop lourde et le signal de pause reste au brouillon. Ce que ça dit du cap global: tu avances, avec un rythme encore dépendant de la fin de journée.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- empty_response: false
- visible behavior: synthese courte
- durable_effect: none observed

#### Tour 3

**Verdict du tour:** green

**User**
> Dans ce cas, quelle intention précise je devrais renseigner dans la Validation du niveau ? Je veux juste la phrase utile, sans modifier le plan ici.

**Sophia**
> Je ne modifie pas le plan ici. En revanche, vu ce qu’on a vu cette semaine, l’ajustement utile à envisager serait de renseigner une intention centrée sur la stabilité d’une version courte quand la journée déborde. C’est la piste la plus cohérente avec le fait que ça tient surtout quand c’est très court et que la version normale devient trop lourde. Tu peux renseigner cette intention dans la Validation du niveau, au moment de valider le niveau.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- DB planning_mode: `next_level_required`
- DB adjustment_destination: `Validation du niveau`, `level_validation`
- DB adjust_recommendation: `status=surfaced`, `safe_to_surface=true`, `confidence=0.96`, `target_scope=next_level_inputs`, `surfaced_in_weekly=true`
- durable plan mutation: none observed

#### Tour 4

**Verdict du tour:** green

**User**
> C’est bon, j’ai ce qu’il faut. Tu peux clôturer le bilan weekly maintenant, sans répéter la recommandation.

**Sophia**
> Merci, j’ai bien ton bilan : tu as vu un progrès réel, mais encore fragile. Le bilan weekly est clos de mon côté.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- DB final: `status=completed`, `stage=closing`, `synthesis_status=complete`, `closure_status=complete`
- validation_unlock: `available`
- repeated recommendation: no

### Run B - `next_week_configured`

#### Tour 0 - Opening proactive

**Verdict du tour:** green

**User**
> N/A - scheduled checkin weekly via `process-checkins`.

**Sophia**
> C’est le moment du bilan de la semaine, et je vois qu’il y a eu des choses qui ont avancé, même si tout n’a pas été simple.
> Je suis curieuse de savoir comment tu l’as vécue dans l’ensemble.

**Trace courte**
- endpoint: `/functions/v1/process-checkins`
- process_checkins: `success=true`, `processed=2` pour le batch R10
- scheduled_checkin.status: `sent`
- opening_source: `process-checkins:weekly_adaptive_review_opening`
- fixture: plan QA patche avec `current_level_runtime.weeks[1].status=upcoming`

#### Tour 1

**Verdict du tour:** green

**User**
> Je l’ai vécue comme une semaine utile mais pas encore stable. Ça marche quand je fais une version très courte en fin de journée, mais les soirs tardifs cassent la version normale. Le point positif et la respiration ont tenu partiellement, le signal de pause est resté brouillon.

**Sophia**
> Je vois une petite avancée globale, mais encore fragile, surtout avec ta version courte qui tient mieux en fin de journée. Au fond, tu te sens plutôt comment par rapport à ton objectif cette semaine ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- empty_response: false
- durable_effect: none observed

#### Tour 2

**Verdict du tour:** green

**User**
> Par rapport à l’objectif, je me sens en progrès léger. Je n’ai pas installé le rythme complet, mais j’ai compris que la semaine prochaine doit garder une mini-version prévue pour les soirs tardifs.

**Sophia**
> Cette semaine, tu as vécu quelque chose d’utile, mais encore fragile : la version courte tient mieux, surtout en fin de journée. Les points positifs et la respiration ont avancé partiellement, mais le signal de pause reste brouillon, surtout quand tu rentres tard. Je vois quand même un progrès léger vers ton objectif global : tu as trouvé un format plus réaliste, sans perdre le rythme. Le point fragile, c’est la stabilité des soirs tardifs ; la version normale y casse encore trop vite. Voici la synthèse à garder pour la cloture.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- visible behavior: synthese
- durable_effect: none observed

#### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> Comme la semaine prochaine est déjà préparée, quelle intention précise je devrais reprendre dans Ajuster mon plan ? Je ne veux pas que tu modifies le plan ici, juste la formulation fiable à reporter.

**Sophia**
> Je ne modifie pas le plan ici. Vu ce que tu décris, l’intention utile est de stabiliser la version courte pour les soirs tardifs. Tu peux porter cette intention dans Ajuster mon plan, dans la partie Plan de la plateforme.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- DB planning_mode: `next_week_configured`
- DB next_week: `Semaine suivante configuree`, focus `stabiliser la version courte`
- DB adjustment_destination: `Ajuster mon plan`, `adjust_plan_platform`
- DB adjust_recommendation: `status=candidate`, `confidence=0.98`, `target_scope=next_week_plan`, `safe_to_surface=false`, `surfaced_in_weekly=false`, `why=[]`
- durable plan mutation: none observed

**Analyse si yellow/red**
- Symptome: la destination visible est correcte (`Ajuster mon plan`) et le chat ne modifie pas le plan, mais Sophia formule une "intention utile" alors que l'etat structure ne valide pas `safe_to_surface=true`.
- Source amont probable: incoherence dispatcher/reducer/visible: le dispatcher fournit assez de contenu visible mais omet `why`, le reducer degrade en candidate, et le visible rend quand meme la recommandation.
- Owner runtime: `weekly_adaptive_review_v1` dispatcher + visible guard.
- Meilleure correction selon les guidelines: ne rendre une recommandation d'ajustement que si le champ structure est vraiment safe; si `safe_to_surface=false`, répondre en constat factuel ou demander confirmation, sans "intention utile".
- Pourquoi ce n'est pas un patch local: la source amont est le contrat structure `adjust_recommendation`, pas une phrase contenant "Ajuster mon plan".

#### Tour 4

**Verdict du tour:** green

**User**
> Ok, j’ai compris. Tu peux clôturer le bilan weekly maintenant, sans refaire la recommandation.

**Sophia**
> Le bilan de ta semaine est clos. Tu as avancé par petites touches, avec une version courte qui tient mieux quand les soirées débordent, et c’est le point le plus solide à garder.

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- DB final: `status=completed`, `stage=closing`, `synthesis_status=complete`, `closure_status=complete`
- DB planning_mode: `next_week_configured`
- validation_unlock: `available`
- repeated destination/recommendation: no

#### Tour 5 - Post-completion

**Verdict du tour:** green

**User**
> Merci, c’est bon pour moi.

**Sophia**
> Merci, j’ai bien le bilan de ta semaine : utile, avec un progrès léger, mais encore fragile sur les soirs tardifs. Le bilan weekly est clôturé.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- active weekly capture: no
- durable_effect: none observed

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les deux branches de destination sont visibles et distinctes:
  - Run A: `Validation du niveau`.
  - Run B: `Ajuster mon plan`.
- Sophia répète bien qu'elle ne modifie pas le plan dans le chat.
- Les clôtures ne répètent pas la recommandation en entier.
- Le post-completion ne garde plus `weekly_adaptive_review_v1` comme owner actif.

**Problemes**
- Run A Tour 1: Sophia redemande un slot deja fourni. Famille: BF-INTAKE-01. Impact: lourdeur conversationnelle. Severite: yellow.
- Run B Tour 3: la recommandation est visible alors que `adjust_recommendation.safe_to_surface=false` en DB. Famille: BF-PROACTIVE-01. Impact: la destination est bonne, mais le contrat de confiance n'est pas strictement respecte. Severite: yellow.

**Fix propose**
- Source amont: weekly dispatcher / reducer / visible guard.
- Correction recommandee: garantir que la reponse visible de recommandation n'utilise le wording "intention utile" / "ajustement utile" que si `adjust_recommendation.safe_to_surface=true`; sinon, rendre un constat ou demander une precision. Continuer a durcir la capture des slots deja fournis.
- Tests d'invariant attendus: `next_week_configured` avec recommandation incomplete (`why=[]`) -> pas de recommandation visible; `next_week_configured` safe complete -> destination `Ajuster mon plan`; `next_level_required` safe complete -> destination `Validation du niveau`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Les tours metier restent dans `weekly_adaptive_review_v1`.
- Apres completion R10B, `response_owner=normal_reply`; le fix active-flow terminal est donc verifie en run reel.

**Skills / Operations / Tools**
- Aucun tool execute observe.
- Aucun patch de plan applique.
- Run A: `adjust_recommendation.safe_to_surface=true`, `target_scope=next_level_inputs`.
- Run B: `weekly_planning_context.mode=next_week_configured`, `target_scope=next_week_plan`, mais `safe_to_surface=false`.

**Memory / Effets durables**
- Run A final: `status=completed`, `validation_unlock=available`.
- Run B final: `status=completed`, `validation_unlock=available`.
- Cleanup cible effectue et verifie independamment: `user_chat_states=0`, `chat_messages=0`, `profiles=0`, `scheduled_checkins=0` pour les deux users QA.
- Note cleanup script: son snapshot interne a retourne `user_chat_states.status=400`, mais la verification REST finale separee confirme `user_chat_states_count=0`.

**Problemes**
- Run A T1: gate/intake trop prudent. Famille: BF-INTAKE-01.
- Run B T3: rendu visible plus permissif que le champ `safe_to_surface`. Famille: BF-PROACTIVE-01.

**Fix propose**
- Source amont: contrat structure `adjust_recommendation` et prompt/guard visible weekly.
- Correction recommandee: le visible agent doit s'aligner sur `hard_constraints.can_surface_adjust_recommendation`; le dispatcher doit remplir `why` si la recommandation est réellement safe, ou rester en candidate sans wording de recommandation.
- Tests d'invariant attendus: positif safe complete, negatif candidate high-confidence incomplet, paraphrase "quoi mettre dans Ajuster mon plan", anti-faux-positif "cloture sans reco".

## Verdict Global

**yellow** - Les deux branches de contexte sont bien différenciées et aucune mutation de plan n'est appliquée depuis le chat. `next_level_required` rend correctement `Validation du niveau`; `next_week_configured` rend correctement `Ajuster mon plan` et le post-completion ne capture plus le weekly. Il reste un warning contractuel: en branche semaine suivante, Sophia rend une intention alors que le champ `adjust_recommendation` n'est pas `safe_to_surface=true`.
