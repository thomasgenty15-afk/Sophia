# Bug Sheet — adjust_plan_item handoff fix

Run: `adjust-plan-handoff-fix-20260601-r3`  
Date: 2026-06-01  
Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`

## Bugs

### R3-B01 — Clarification trop lourde apres scope semaine

- Tours: 2
- Famille: `BF-INTAKE-01`
- Domaine owner: `adjust_plan_item`
- Source amont: intake/coaching readiness
- Symptome visible: apres "toute cette semaine" + "moins d'energie" + "garder l'objectif", Sophia demande encore quels elements concrets alleger.
- Preuve systeme: `status=clarifying`, `missing_slots=["draft_generation_retry_needed"]`, no mutation.
- Correction attendue: autoriser un handoff prudent niveau courant quand scope, raison et preservation sont deja explicites, quitte a lister les decisions restantes comme non bloquantes.
- Statut: `open`
- Fix reference: a traiter apres J74
- Tests requis: scenario scope semaine avec raison energie et objectif preserve -> recommandation niveau courant sans over-clarification.

### R3-B02 — Renderer handoff mal formate

- Tours: 3
- Famille: `BF-TEST-01` faute de famille renderer dediee dans la taxonomie
- Domaine owner: `adjust_plan_item`
- Source amont: `renderer.ts`
- Symptome visible: listes concatenees par `;`, ponctuation double, destination Plan dupliquee.
- Preuve systeme: `handoff_delivered`, no mutation, mais reponse visible peu lisible.
- Correction attendue: renderer proprietaire avec listes en bullets et destination unique.
- Statut: `verified`
- Fix reference: `renderAdjustPlanHandoffDraft` nettoye; tour 10 du run r3 verifie le rendu bullet.
- Tests requis: renderer unit + QA repeat_handoff.

### R3-B03 — Repeat handoff ignore "version courte"

- Tours: 5
- Famille: `BF-INTAKE-03`
- Domaine owner: `adjust_plan_item`
- Source amont: active handoff repeat renderer/policy
- Symptome visible: le user demande une version courte, Sophia repete le handoff complet long.
- Preuve systeme: `status=repeat_handoff`, `reason_code=active_handoff_repeat`, no mutation.
- Correction attendue: ajouter un mode de rendu compact pour `repeat_handoff` quand le follow-up contient une contrainte de concision.
- Statut: `open`
- Fix reference: non traite dans ce lot
- Tests requis: "redis-moi en version courte" -> destination Plan + recommended_change + no-mutation, sans sections longues.

### R3-B04 — Revision active crash 502

- Tours: 6, 7
- Famille: `BF-STATE-01`
- Domaine owner: `adjust_plan_item`
- Source amont: `router.ts` active `revise_handoff`
- Symptome visible: reponse vide HTTP 502 quand le user demande une version plus legere.
- Preuve systeme: Edge Runtime redemarre, trace vide; avant fix `revise_handoff` relancait l'intake IA complet avec le draft actif.
- Correction attendue: reviser le `AdjustPlanHandoffDraft` actif localement en no-mutation, sans executor, token, writer ni re-run lourd.
- Statut: `verified`
- Fix reference: `reviseAdjustPlanHandoffDraft`, test `revise_handoff updates the recommendation without execution`, tours 8-9 verifies.
- Tests requis: active revise no-crash, no executedTools, no committed_effects, no pending confirmation.
