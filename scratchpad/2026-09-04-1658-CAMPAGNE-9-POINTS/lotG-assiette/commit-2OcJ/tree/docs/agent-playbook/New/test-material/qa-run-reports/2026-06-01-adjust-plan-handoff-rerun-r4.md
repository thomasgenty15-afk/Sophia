# QA Run Report — Adjust Plan Handoff R4

## 1. Contexte Du Test

- Date: 2026-06-01
- Runs:
  - `adjust-plan-action-20260601-r4`
  - `adjust-plan-level-20260601-r4`
  - `adjust-plan-whole-20260601-r4`
- Persona: `qa-skill`, connexions temporaires dediees:
  - `adjust_plan_handoff_action20260601_r4_action`
  - `adjust_plan_handoff_level20260601_r4_level`
  - `adjust_plan_handoff_whole20260601_r4_whole`
- Objectif: verifier post-fix les 3 scopes `adjust_plan_item`: action, niveau/semaine, whole plan.
- Trajectoire: clarification si besoin -> handoff Plan -> apply_attempt no-mutation -> destination-only/repeat -> revision -> repeat.
- Surfaces visees: dispatcher, active handoff arbitration, `adjust_plan_item` intake/handoff/renderer/state, no-mutation traces.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, pas de fallback deterministe.
- Validite QA: valide. Chaque run a 6 tours reels. Les connexions temporaires ont ete creees pour isoler l'etat.

Artefacts:

- `tmp/qa-adjust-plan-handoff-real-20260601/adjust-plan-action-20260601-r4/summary.json`
- `tmp/qa-adjust-plan-handoff-real-20260601/adjust-plan-level-20260601-r4/summary.json`
- `tmp/qa-adjust-plan-handoff-real-20260601/adjust-plan-whole-20260601-r4/summary.json`

## 2. Tours De Conversation

### Run Action — `adjust-plan-action-20260601-r4`

#### Tour 1

**Verdict du tour:** green

**User**
> Je veux alleger l'action Respiration de pause cette semaine, elle me parait trop lourde.

**Sophia**
> Sur « Respiration de pause » cette semaine, qu'est-ce qui est le plus lourd a alleger concretement : l'entree, la duree, ou le moment ou tu la fais ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- operation/status: `adjust_plan_item` / `clarifying`
- executed_tools: `[]`
- committed_effects: `[]`
- pending_confirmation: `null`

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` — Slot fourni mais redemande

**User**
> C'est surtout l'entree et la duree. Je veux la garder mais en version deux minutes, une seule fois les jours charges.

**Sophia**
> Quand tu dis l'entree, tu veux surtout simplifier le demarrage ou le rendre plus automatique ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `same_operation_signal_continues_active_handoff`
- operation/status: `adjust_plan_item` / `clarifying`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le user donne l'action, la duree, la frequence et la contrainte "jours charges", mais le skill redemande une precision sur l'entree.
- Source amont probable: intake/generator ne considere pas `version deux minutes + jours charges` comme draft-ready.
- Owner runtime: `adjust_plan_item` intake/handoff readiness.
- Meilleure correction: gate handoff action quand scope + levier + change concret sont deja presents.

#### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-01`

**User**
> Simplifier le demarrage : je lance juste un minuteur deux minutes, une respiration lente, puis je reprends.

**Sophia**
> Je n'ai pas une cible assez claire pour ajuster le plan depuis le chat. Tu peux le faire dans ton espace sur sophia-coach.ai.

**Trace courte**
- route_reason: `same_operation_signal_continues_active_handoff`
- operation/status: `adjust_plan_item` / `clarifying`
- missing_slots: `specific_plan_item.action_request_category`, `specific_plan_item.reason`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: la cible et le changement sont clairs, mais Sophia declare la cible insuffisante et produit une redirection generique.
- Source amont probable: mapping de slots action perd la cible active entre tours ou exige des slots non pertinents pour un handoff no-mutation.
- Owner runtime: `adjust_plan_item` intake/state merge.
- Meilleure correction: conserver `specific_plan_item` + `target_summary` dans l'etat clarifying et accepter le changement concret comme handoff-ready.

#### Tour 4

**Verdict du tour:** green

**User**
> La cible est bien Respiration de pause. Je veux juste la remplacer cette semaine par : minuteur deux minutes, une respiration lente, puis je reprends.

**Sophia**
> Ce que je comprends : Respiration de pause bloque parce que l'entree est trop lourde.
>
> Ma recommandation : Respiration de pause: minuteur deux minutes, une respiration lente, puis je reprends
>
> ... Où le faire dans Plan : dans la section Plan. ... Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- operation/status: `adjust_plan_item` / `handoff_delivered`
- reason_code: `platform_handoff_no_chat_mutation`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 5

**Verdict du tour:** green

**User**
> Rends-la encore plus legere : seulement trente secondes avant de reprendre le travail.

**Sophia**
> Ma recommandation : Passe Respiration de pause sur une version plus legere : seulement trente secondes avant de reprendre le travail. Garde l'intention de l'action et ajuste seulement cette cible dans Plan.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_revise_handoff`
- operation/status: `adjust_plan_item` / `revise_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 6

**Verdict du tour:** green

**User**
> Redis-moi la version courte a reprendre dans Plan.

**Sophia**
> A reprendre dans Plan : Passe Respiration de pause sur une version plus legere : seulement trente secondes avant de reprendre le travail. Garde l'intention de l'action et ajuste seulement cette cible dans Plan.
>
> Où : dans la section Plan.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_repeat_handoff`
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

### Run Niveau — `adjust-plan-level-20260601-r4`

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03` — Contrainte/texte interne mal rendu

**User**
> Cette semaine est trop chargee au niveau actuel. Je veux garder le niveau, mais reduire le volume.

**Sophia**
> Ma recommandation : Orienter la reponse vers un allegement cible et temporaire du niveau actuel. Le sous-skill doit proposer une baisse de volume...
>
> ... Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- operation/status: `adjust_plan_item` / `handoff_delivered`
- reason_code: `current_level_partial_scope_platform_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: la reco est correcte sur le fond mais expose `Le sous-skill doit...`, langage interne non utilisateur.
- Source amont probable: `coaching_guidance.recommendation` passe trop directement au renderer.
- Owner runtime: handoff draft generation / renderer.
- Meilleure correction: nettoyer les instructions meta (`sous-skill`, `orienter la reponse`) ou les transformer en reco utilisateur.

#### Tour 2

**Verdict du tour:** green

**User**
> Je veux garder deux actions seulement et mettre le reste en maintien pour cette semaine.

**Sophia**
> Ma recommandation : Limite l'allegement a la periode concernee : garder deux actions seulement et mettre le reste en maintien pour cette semaine. Garde le niveau comme repere et ajuste seulement le volume actuel dans Plan.

**Trace courte**
- operation/status: `adjust_plan_item` / `revise_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 3

**Verdict du tour:** green

**User**
> Ok applique ca pour cette semaine.

**Sophia**
> [Repete la recommandation handoff.]
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_apply_attempt`
- operation/status: `adjust_plan_item` / `apply_attempt`
- executed_tools: `[]`
- committed_effects: `[]`
- pending_confirmation: `null`

#### Tour 4

**Verdict du tour:** green

**User**
> Redis-moi juste ou le faire dans Plan.

**Sophia**
> Dans Plan : dans la section Plan.
>
> - ouvre la section Plan
> - Ouvre le niveau ou la semaine concernee
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 5

**Verdict du tour:** green

**User**
> Plutot cette semaine seulement, pas le niveau complet.

**Sophia**
> Ma recommandation : Limite l'allegement a la periode concernee : cette semaine seulement, pas le niveau complet. Garde le niveau comme repere et ajuste seulement le volume actuel dans Plan.

**Trace courte**
- operation/status: `adjust_plan_item` / `revise_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 6

**Verdict du tour:** green

**User**
> Redis-moi la version courte a reprendre.

**Sophia**
> A reprendre dans Plan : Limite l'allegement a la periode concernee : cette semaine seulement, pas le niveau complet. Garde le niveau comme repere et ajuste seulement le volume actuel dans Plan.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

### Run Whole Plan — `adjust-plan-whole-20260601-r4`

#### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-03`

**User**
> Je crois que tout mon plan est dans le mauvais ordre. Je ne veux pas tout jeter, mais il faut revoir la trajectoire globale.

**Sophia**
> avant de te montrer quoi que ce soit. Peux-tu me donner les etapes actuelles du plan, dans leur ordre prevu ?

**Trace courte**
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- operation/status: `adjust_plan_item` / `clarifying`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: clarification pertinente, mais la phrase commence par un fragment sans sujet.
- Source amont probable: generation/sanitizer de clarification handoff.
- Owner runtime: `adjust_plan_item` clarification renderer.

#### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01`

**User**
> Aujourd'hui c'est : gros chantier creatif, ensuite routine energie, puis clarifier mon cap. Je voudrais plutot commencer par clarifier le cap, ensuite routine energie, puis garder le chantier creatif apres.

**Sophia**
> Ma recommandation : Orienter la reponse vers un reordonnancement prudent du plan complet...
>
> Point a clarifier avant de le reprendre dans Plan : Quelle est la liste complete des etapes actuelles du plan, dans leur ordre prevu ?

**Trace courte**
- operation/status: `adjust_plan_item` / `handoff_delivered`
- reason_code: `platform_handoff_from_coaching_guidance`
- executed_tools: `[]`
- committed_effects: `[]`

**Analyse si yellow/red**
- Symptome: le user a donne la liste actuelle et l'ordre cible; le draft garde pourtant une decision manquante sur la liste complete.
- Source amont probable: `guidance.questions_to_clarify` non filtre quand `readiness=draft_ready` et recommendation exploitable.
- Owner runtime: handoff draft generation from context.

#### Tour 3

**Verdict du tour:** green

**User**
> Ok vas-y applique ce nouvel ordre.

**Sophia**
> [Repete le handoff whole-plan et la destination Plan.]
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- route_reason: `active_handoff_apply_attempt`
- operation/status: `adjust_plan_item` / `apply_attempt`
- executed_tools: `[]`
- committed_effects: `[]`
- pending_confirmation: `null`

#### Tour 4

**Verdict du tour:** green

**User**
> Redis-moi juste ou le faire dans Plan.

**Sophia**
> Dans Plan : dans la section Plan.
>
> - ouvre la section Plan
> - Ouvre la vue du plan global
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 5

**Verdict du tour:** green

**User**
> Rends la reco plus prudente : je veux tester cet ordre une semaine avant de tout reorganiser.

**Sophia**
> Ma recommandation : Rends la revision du plan plus prudente : tester cet ordre une semaine avant de tout reorganiser. Dans Plan, utilise cette version comme un test ou un brief de revision avant de modifier durablement toute la trajectoire.

**Trace courte**
- operation/status: `adjust_plan_item` / `revise_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

#### Tour 6

**Verdict du tour:** green

**User**
> Redis-moi la version courte a reprendre dans Plan.

**Sophia**
> A reprendre dans Plan : Rends la revision du plan plus prudente : tester cet ordre une semaine avant de tout reorganiser. Dans Plan, utilise cette version comme un test ou un brief de revision avant de modifier durablement toute la trajectoire.
>
> Je ne modifie pas ton plan depuis le chat.

**Trace courte**
- operation/status: `adjust_plan_item` / `repeat_handoff`
- executed_tools: `[]`
- committed_effects: `[]`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les revisions R3 sont nettement meilleures: plus de `avec cette contrainte : <message user>`, pas de double ponctuation, repeat propre.
- Destination-only marche sur niveau et whole-plan, et repeat court marche sur les trois scopes.
- Les messages `ok applique` ne promettent jamais d'application.
- Le user sait ou aller dans Plan dans tous les handoffs aboutis.

**Problemes**
- Action T2/T3: sur-clarification puis redirection generique alors que la cible et le changement sont fournis. Famille: `BF-INTAKE-01`. Impact: experience frustrante, oblige le user a repeter explicitement la cible.
- Niveau T1: wording interne `Le sous-skill doit...`. Famille: `BF-INTAKE-03`. Impact: experience moins humaine, mais flow correct.
- Whole-plan T1: phrase de clarification commence par un fragment. Famille: `BF-INTAKE-03`. Impact: friction UX.
- Whole-plan T2/T3: point a clarifier obsolete sur la liste complete des etapes. Famille: `BF-INTAKE-01`. Impact: reco utile mais contradictoire.

**Fix propose**
- Source amont:
  - Action: readiness gate / missing slots `specific_plan_item`.
  - Niveau/whole-plan: nettoyage des `coaching_guidance.recommendation` et `questions_to_clarify`.
- Correction recommandee:
  - accepter un handoff action quand target + levier + changement concret sont presents;
  - transformer les recommandations meta en texte utilisateur;
  - filtrer les questions de clarification satisfaites par le message courant.
- Tests d'invariant attendus:
  - pas de `sous-skill`, `orienter la reponse`, fragment `avant de...`;
  - whole-plan avec trois etapes + ordre cible => pas de `missing_decisions`;
  - action avec cible + duree + frequence => handoff sans clarification supplementaire.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Tous les tours restent `response_owner=tool_skill`, `selected_handler=adjust_plan_item`.
- L'arbitrage active handoff capture bien `repeat_handoff`, `revise_handoff`, `apply_attempt`.
- Aucun follow-up ne part vers status recap, product help generique ou normal reply.

**Skills / Operations / Tools**
- `durable_effect=platform_handoff` sur tous les tours.
- `executed_tools=[]` sur les 18 tours.
- `committed_effects=[]` sur les 18 tours.
- `pending_confirmation=null` sur les 18 tours.

**Memory / Effets durables**
- Aucun effet durable plan observe.
- Les connexions temporaires QA isolent l'etat de conversation.
- Les runs testent le runtime handoff/no-mutation; ils ne valident pas une mutation DB, volontairement interdite pour ce skill.

**Problemes**
- Action: l'intake conserve ou reconstruit mal les slots actifs apres clarification, d'ou un blocage incorrect. Famille: `BF-INTAKE-01`. Impact systeme: handoff retarde alors que la recommandation est possible.
- Whole-plan: `questions_to_clarify` non re-evaluees apres handoff-ready. Famille: `BF-INTAKE-01`. Impact systeme: `missing_decisions` contient une decision deja fournie.
- Renderer/handoff: texte guidance meta non sanitise totalement. Famille: `BF-INTAKE-03`.

**Fix propose**
- Source amont: `adjust_plan_item` intake readiness + `buildAdjustPlanHandoffDraftFromContext`.
- Correction recommandee: reducer de handoff qui filtre les questions satisfaites, nettoie les instructions meta et ne bloque pas un handoff no-mutation sur des slots executables inutiles.
- Tests d'invariant attendus: no executor/no writer/no token inchanges, plus tests des cas de sur-clarification.

## Verdict Global

**yellow** — Les corrections de revision R3 sont verifiees en IA reelle, et l'invariant no-mutation est green sur 18/18 tours. Il reste des bugs d'intake/rendu: sur-clarification action, `missing_decisions` obsolete en whole-plan, et fuite de wording interne dans certains handoffs.
