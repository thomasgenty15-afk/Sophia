# QA Run Report - Adjust Plan Whole Plan - Rose

## 1. Contexte Du Test

- Date: 2026-05-18
- Runs: `whole-plan-r31-diagnostic`, `whole-plan-r32-review-boundary`, `whole-plan-r33-reject-boundary`
- Persona: Rose, Supabase local, connexion locale Rose
- Objectif: tester le flow `adjust_plan_item` scope `whole_plan`, avec cohérence vis-à-vis de l'objectif global `Retrouver l'harmonie dans mon couple`
- Trajectoire: brouillon whole-plan, validation explicite, refus de brouillon, frontière review/check-in sans ajustement
- Surfaces visees: routing tool_skill, intake whole_plan, draft review, confirmation, executor `writePlanAdjustmentPatch`, materialisation multi-items, cleanup DB
- Cadre IA reel: `/functions/v1/test-send-message`, `force_full_ai=true`, pas de renderer deterministe, pas de fallback `processMessage`
- Validite QA: valide pour les tours `200`; les tours `502` sont documentes comme incidents runtime et non utilises pour juger la qualite conversationnelle

Correctifs appliques pendant le run:
- `writePlanAdjustmentPatch` broad scope est maintenant rollback-safe: en cas d'echec apres update partiel, les items materialises sont restaures.
- `pause_action` sur `user_plan_items` n'ecrit plus le statut invalide `paused`; il ecrit `in_maintenance`. `remove_action_from_level` ecrit `deactivated`.
- Test ajoute: `writePlanAdjustmentPatch: materializes broad pause with V2 item status`.

## 2. Tours De Conversation

### Run R31 - Whole Plan Avec Validation

#### Tours 1-2

**User**
> Je veux ajuster le plan dans son ensemble pour deux semaines, en gardant l'objectif couple. Fais un brouillon: signal de pause en 5 minutes, point positif 2 fois par semaine sans horaire fixe, bilan du signal repoussé après deux semaines. Ne l'applique pas encore.

**Sophia**
> Reponse vide.

**Trace courte**
- http_status: 502 puis 502
- Validite: incident runtime, non exploitable comme tour conversationnel

#### Tour 3

**User**
> Juste pour vérifier, tu peux me répondre normalement ?

**Sophia**
> Oui, je suis bien là ! Pour que je puisse ajuster ton plan sur les deux prochaines semaines, dis-moi ce que tu souhaites obtenir : est-ce que tu as besoin d'alléger tes actions pour que ce soit plus facile à tenir, ou est-ce qu'il y a un aspect précis de ton objectif de couple que tu veux prioriser ?

**Trace courte**
- http_status: 200
- tool_execution: blocked
- executed_tools: []
- durable_effect: none

#### Tour 4

**User**
> Je veux alléger le plan entier sans changer l'objectif couple: signal de pause en 5 minutes, point positif 2 fois par semaine sans horaire fixe, bilan du signal repoussé après deux semaines. Prépare le brouillon sans appliquer.

**Sophia**
> Je te propose d'alléger ton plan pour les deux prochaines semaines tout en gardant ton objectif de couple. Voici ce que je prévois de modifier : l'action pour convenir d'un signal de pause sera limitée à 5 minutes pour être plus rapide, et l'habitude de partager un point positif passera à 2 fois par semaine sans horaire fixe. Le bilan sur le signal de pause sera quant à lui repoussé à dans deux semaines. Rien n'est encore appliqué, j'attends ton feu vert pour enregistrer ces changements.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- safety: none
- tool_execution: blocked
- executed_tools: []
- durable_effect: none

#### Tour 5

**User**
> Oui, j'applique maintenant ce brouillon. Je valide explicitement l'ajustement du plan entier.

**Sophia**
> C'est fait, j'ai ajusté ton plan pour qu'il soit plus tenable. J'ai réduit la durée pour convenir du signal de pause à 5 minutes et j'ai passé le partage de points positifs à 2 fois par semaine sans contrainte d'horaire. Le bilan est décalé de deux semaines pour te laisser le temps de tester le signal. Ces ajustements te permettent de garder le cap sans la pression du rythme initial.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- safety: none
- tool_execution: success
- executed_tools: [`adjust_plan_item`]
- durable_effect:
  - `Convenir d'un signal de pause`: description devient `Convenir d'un signal de pause en 5 minutes.`
  - `Partager un point positif`: `target_reps=2`, `cadence_label=2 jours / semaine`, `time_of_day=anytime`
  - `Cartographier les déclencheurs`: inchangé
  - `Faire le point sur le signal de pause`: description devient `Bilan du signal repoussé après deux semaines`

Cleanup R31: Rose restauree, `chat_messages=0`, `user_chat_states=0`.

### Run R32 - Frontière Review / Check-In

#### Tour 1

**User**
> Cette semaine j'ai seulement fait le point positif une fois et le signal de pause m'a semblé lourd. Je ne sais pas encore si je veux modifier le plan, j'essaie juste de comprendre ce que ça dit de mon rythme.

**Sophia**
> Ok, déjà je note deux trucs : tu as réussi à faire au moins 1 point positif, et tu sens que le “signal de pause” te pèse. Ça suffit largement pour lire ton rythme, sans te juger. [...] Pour avancer sans modifier tout de suite : prends une seule question et observe ta semaine en mode détective. Qu’est-ce qui a rendu le signal de pause lourd : le moment choisi, la difficulté à trouver un signal, ou le fait d’y penser trop souvent ?

**Trace courte**
- http_status: 200
- response_owner: conversation_handler
- selected_handler: null
- tool_execution: success
- executed_tools: [`track_progress_plan_item`]
- adjust_plan: non declenche
- durable_effect: une entree `user_plan_item_entries` partial creee pour `Partager un point positif`, nettoyee manuellement ensuite

Cleanup R32: entree de progression QA supprimee, Rose restauree, `chat_messages=0`, `user_chat_states=0`.

### Run R33 - Brouillon Refuse

#### Tours 1 et 3

**User**
> Je veux revoir le plan global, mais je ne suis pas sûre d'appliquer. Propose-moi seulement un brouillon pour alléger deux semaines: signal de pause plus court, point positif moins fréquent, et objectif couple conservé.

**Sophia**
> Reponse vide.

**Trace courte**
- http_status: 502 sur T1 et T3
- Validite: incidents runtime, retries effectues

#### Tours 2, 4, 5, 6

**Sophia**
> C'est entendu. Je vais préparer un brouillon [...] Est-ce que je peux te soumettre cette proposition ?

Puis Sophia demande la raison de l'allègement, puis la fréquence voulue pour `Partager un point positif`.

**Brouillon final**
> Je te propose d'ajuster ton plan global pour les deux prochaines semaines afin de réduire la pression [...] 1. Pour l'habitude 'Partager un point positif', je propose de passer à deux fois par semaine [...] 2. Pour l'action 'Faire le point sur le signal de pause', je réduis la durée à 5 minutes maximum [...]

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- tool_execution: blocked
- executed_tools: []
- durable_effect: none

#### Tour 7

**User**
> Non, n'applique pas. Le brouillon vise la mauvaise action pour le signal, donc on garde le plan actuel.

**Sophia**
> Ok, je n'applique pas cet ajustement. On garde ton plan tel quel pour l'instant; observe encore une journée, et si le besoin d'alléger se confirme, on reprendra proprement.

**Trace courte**
- http_status: 200
- response_owner: tool_skill
- tool_execution: blocked
- executed_tools: []
- durable_effect: aucun changement plan

Cleanup R33: Rose restauree, `chat_messages=0`, `user_chat_states=0`.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le flow R31 garde bien l'objectif couple et propose un plan plus doux sans changer l'identite du plan.
- Sophia bloque correctement l'application tant que le user n'a pas valide clairement.
- Le refus R33 est naturel et non insistant: Sophia confirme que rien n'est applique.
- R32 reste dans une posture coaching/review quand le user dit explicitement qu'il ne sait pas s'il veut modifier.

**Problemes**
- R31/R33: plusieurs `502` intermittents. Impact: run hache, UX non fiable. Severite: yellow.
- R33 T6: le brouillon vise `Faire le point sur le signal de pause` au lieu de `Convenir d'un signal de pause` quand le user dit "signal de pause plus court". Impact: mauvaise cible dans un brouillon whole-plan. Severite: yellow.
- R31/R33: Sophia redemande parfois l'autorisation de preparer un brouillon alors que le user a deja demande "brouillon sans appliquer". Impact: friction. Severite: yellow.
- R31/R33: quelques formulations "votre couple / votre plan" apparaissent. Ici c'est acceptable quand Sophia parle du couple, mais a surveiller pour eviter un vouvoiement direct.

**Fix propose**
- Ameliorer le slot carry-over apres retry/incident 502: les contraintes deja donnees doivent rester dans l'intake.
- Renforcer la resolution de cible: `signal de pause plus court` doit pointer vers `Convenir d'un signal de pause`, pas vers le bilan.
- Etendre la logique "user demande explicitement un brouillon review-only" au scope `whole_plan` pour eviter la double permission.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- R31: routing vers `tool_skill` / `adjust_plan_item` correct pour un scope whole-plan explicite.
- R32: pas de routing adjust-plan quand le user donne un etat sans demander de modification. Correct.
- R33: routing whole-plan correct, mais slot filling fragile apres incidents/retries.

**Skills / Operations / Tools**
- R31: `adjust_plan_item` execute correctement apres validation explicite.
- R32: `track_progress_plan_item` s'execute en parallele car le user dit avoir fait l'habitude une fois. Ce n'est pas un bug adjust-plan, mais c'est un side effect a prendre en compte dans ce type de test.
- R33: le rejet annule proprement le pending draft, aucun tool d'ajustement n'est execute.

**Memory / Effets durables**
- R31 durable avant cleanup conforme:
  - `Convenir d'un signal de pause` simplifie a 5 minutes.
  - `Partager un point positif` passe a 2 jours/semaine, sans horaire fixe.
  - `Cartographier les déclencheurs` reste inchangé.
  - `Faire le point sur le signal de pause` est repousse dans sa description.
- R33 durable avant cleanup conforme au refus: aucun item modifie.
- Tous les runs ont ete nettoyes. L'entree de progression creee par R32 a ete supprimee explicitement.

**Problemes**
- Avant correctif, R28/R29/R30 montraient un risque critique: echec d'application avec effet durable partiel sur `Partager un point positif`. Corrige par rollback broad scope.
- Avant correctif, `pause_action` tentait d'ecrire `status=paused`, invalide pour `user_plan_items`. Corrige vers `in_maintenance`.
- Le detail de brouillon pre-validation ne repond pas toujours a la question exacte du user sur les items inchanges/deplaces; il recite seulement deux changed_items. Severite: yellow.

**Fix propose**
- Ajouter une reponse detaillee deterministe/LLM qui cite aussi `preserved_items` et les changed_items non affiches quand le user demande "ce qui reste inchangé / ce qui est décalé".
- Ajouter un test unitaire de resolution de cible pour `signal de pause` vs `bilan du signal`.
- Ajouter un test conversationnel future pour whole-plan sans incident runtime, avec 4 tours propres minimum.

### Verification Technique

- `deno fmt supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/router/run_test.ts`
- `deno check supabase/functions/sophia-brain/index.ts supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/router/run_test.ts`
- `deno test --allow-all supabase/functions/sophia-brain/router/run_test.ts --filter "broad pause"`
- `deno test --allow-all supabase/functions/sophia-brain/router/run_test.ts --filter "level frequency"`

## Verdict Global

**yellow**

Le coeur systeme `whole_plan` fonctionne maintenant sur le cas principal: routing, brouillon, validation explicite, application multi-items et cleanup sont corrects. Le run n'est pas `green` a cause des `502` intermittents, de la mauvaise cible dans un brouillon refuse, et de la friction "permission de brouillon" encore visible.
