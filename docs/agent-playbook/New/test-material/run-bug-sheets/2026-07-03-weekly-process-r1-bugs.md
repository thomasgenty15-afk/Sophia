# Bug Sheet - Weekly Process R1 (2026-07-03)

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-03-weekly-process-r1.md`

Run: `weekly-process-20260703-r1-partial_habits_mission_partial` — weekly declenche par le vrai `process-checkins` (Tour 0 IA proactif), 6 tours IA reels, systeme green, fluidite yellow.

## R1-B01 — Repetition integrale de la recommandation weekly sous pression user

- Bug id: `R1-B01`
- Tours: 4 (repete le Tour 3; le re-detail action par action revient aussi au Tour 5-6)
- Famille: `a classifier` — repetition du visible; aucune famille BF-* ne couvre la verbosite/repetition d'un visible agent (ce n'est ni un mauvais etat `BF-STATE`, ni un mauvais rendu de commit `BF-LEDGER-02`, ni une projection `BF-STATUS`). Couche fautive: renderer/visible.
- Domaine owner: `weekly_adaptive_review_v1` visible agent / dispatcher weekly.
- Source amont: le visible weekly re-rend synthese + recommandation completes quand le user pousse pour une application directe. `weekly_flow_state.last_visible_summary` existe dans l'etat mais n'est pas utilise comme contrainte anti-repetition.
- Symptome visible: le user dit "j'ai pas le temps, applique directement" et recoit le message le plus long du run, quasi identique au tour precedent (meme recommandation, meme destination), plus un recap action par action deja synthetise. Experience mecanique.
- Preuve systeme: `state.json` tours 3-4 (`response_owner=weekly_adaptive_review_v1`, `route_reason=active_weekly_adaptive_review`); aucune mutation DB (gate correct) — le probleme est purement le rendu visible.
- Correction attendue: alimenter le visible avec ce qui a deja ete surface (`last_visible_summary` / recommandation deja rendue) et contraindre structurellement: "ne pas re-rendre une recommandation deja donnee; repondre au point nouveau du tour" (ici: refus d'appliquer + destination, en une ou deux phrases). Pas de filtre de phrase.
- Cause racine confirmee: `hard_constraints.adjust_recommendation_already_surfaced` etait deja transmis au visible (`visible_agent.ts`), mais aucune regle du system prompt ne l'exploitait hors closure (`repeat_adjust_recommendation_forbidden` etait closure-only). Le stage `weekly_adjust_recommendation` pouvait donc re-rendre la recommandation complete a chaque tour.
- Fix applique:
  - `sophia-brain/skills/weekly_review/visible_agents.ts` — nouvelle regle commune: si `adjust_recommendation_already_surfaced=true` et pas de demande explicite de repetition, repondre au point nouveau du tour en 1-2 phrases (refus de muter + destination), sans re-derouler recommandation ni recap action par action.
  - `sophia-brain/skills/weekly_review/visible_agents.ts` — roleLine `weekly_adjust_recommendation`: si le user pousse pour appliquer depuis le chat, refus sobre en 1-2 phrases + destination, sans re-deroulement.
- Fix complementaire (apres rerun R2/R3): la re-surface au stage `weekly_synthesis` n'etait pas couverte. `visible_agent.ts` — `canSurfaceAdjustRecommendation` et `repeat_adjust_recommendation_forbidden` etendus de `weekly_closure` seul a `{weekly_synthesis, weekly_closure}` via `STAGES_BLOCKING_ALREADY_SURFACED_ADJUST_RECOMMENDATION`. La premiere surface au stage synthesis reste possible (`surfaced_in_weekly=false`). RoleLine synthesis ajoutee dans `visible_agents.ts`.
- Rerun R2/R3 (verification conversationnelle reelle):
  - R2 T4 (stage weekly_adjust_recommendation, push): refus concis 127 car. -> **fix effectif** a ce stage.
  - R2 T5 (stage synthesis, push): re-deroule 686 car. -> residu qui a motive l'extension synthesis (maintenant deterministe cote can_surface/repeat, verifie par tests unitaires).
  - R3 T5 (stage adjust sous push repete): re-deroule 294 car. -> residu NON couvert par le fix visible: au stage adjust la (re)surface reste autorisee par design; la consigne "push -> refus concis" est une heuristique de prompt non deterministe. Source amont reelle = dispatcher (voir R2-B03).
- Statut: `fixed` (fix visible synthesis/closure `fixed` et unit-teste; le residu push-au-stage-adjust est desormais couvert par R2-B03 — garde-fou deterministe `chat_plan_mutation_request`, verifie en run reel r4)
- Fix reference: `visible_agent.ts`, `visible_agents.ts`, tests `weekly_review_local_flow_test.ts` (62/62 verts) — dont "weekly synthesis does not re-surface an already surfaced recommendation" et "weekly synthesis first surface still renders when not yet surfaced".
- Tests requis: unit prompt-contract OK; rerun QA a refaire une fois R2-B03 (dispatcher) traite pour le cas push-au-stage-adjust.

## R1-B02 — normal_reply re-synthetise le weekly clos sur un tour de politesse

- Bug id: `R1-B02`
- Tours: 6
- Famille: `a classifier` — mismatch de registre du companion en post-completion; le routage est correct (`normal_reply_default`), donc pas `BF-ROUTE-02`; pas d'effet durable ni de claim, donc pas `BF-LEDGER-01`. Couche fautive: prompt contract companion.
- Domaine owner: companion / `normal_reply` prompt contract (`sophia-brain/agents/companion.ts`, `companion_prompt_contract_test.ts`).
- Source amont: ponderation de l'historique recent (messages de cloture weekly) au-dessus du registre du message courant dans le prompt companion. Verifie: aucun exit memo weekly n'est injecte (le mecanisme `exit_memo` existe pour `product_help`/`safety_crisis`, pas pour le weekly) — c'est bien l'historique conversationnel qui domine.
- Symptome visible: user: "Merci Sophia, bonne soirée." -> Sophia re-annonce "ton bilan weekly est clôturé" et re-synthetise le point fragile (3e repetition de la meme synthese sur les tours 4-5-6), au lieu de laisser de l'espace et de rendre le "bonne soirée".
- Preuve systeme: `state.json` tour 6: `response_owner=normal_reply`, `route_reason=normal_reply_default`, aucun effet durable; la liberation d'owner post-completion fonctionne (le bug n'est pas la capture, c'est le contenu).
- Correction attendue: invariant dans le contrat prompt companion: "tour de politesse/cloture sociale sans question -> reponse breve et sociale, sans re-synthese du flow clos". Hierarchiser registre du tour courant > residu de flow recent.
- Fix applique:
  - `sophia-brain/agents/companion.ts` — bloc `SILENCE_AND_REACTIONS`: "Après un flow terminé (bilan, exercice): sur une simple politesse/au revoir, rends la politesse en une phrase courte, sans ré-annoncer la clôture ni re-synthétiser le bilan terminé."
  - Budget de taille du prompt companion ajuste dans le contract test (12800 -> 13000): le prompt etait a 3 caracteres du plafond avant le fix; evolution deliberee du contrat, pas un contournement.
- Rerun R2/R3 (verification):
  - R2 T7 (post-completion, owner `normal_reply`): 77 car., rend "bonne soirée", plus de re-synthese du contenu de la semaine -> **fix effectif** quand l'owner est bien libere. Residu tres mineur: re-mention "bilan clôturé".
  - R3 T7 (post-completion): owner reste `weekly_adaptive_review_v1` (pas de liberation apres completion) donc le fix companion ne s'applique pas; le visible closure re-synthetise. -> revele une dependance a la fiabilite de la liberation active-flow (R2-B04).
- Statut: `fixed` pour l'invariant de registre companion (verifie R2 T7); la re-synthese post-completion residuelle depend de R2-B04 (release).
- Fix reference: `companion.ts` (SILENCE_AND_REACTIONS), test `companion_prompt_contract_test.ts` "companion normal reply keeps social register after a closed flow" (verts)
- Tests requis: prompt contract positif OK; verification conversationnelle OK (R2 T7); le cas R3 T7 releve de R2-B04, pas de cet invariant.

## R2-B03 — Push "applique/valide à ma place" mal classe (route stage recommandation)

- Bug id: `R2-B03`
- Tours: R3 T5 (et latent en R2 T5)
- Famille: `BF-ROUTE-03` (product/status/tool mal priorises).
- Domaine owner: dispatcher weekly / classification d'intention.
- Source amont: une demande d'application dans le chat ("valide-le à ma place", "fais-le pour moi") est routee vers le stage "quoi ajuster" (`weekly_adjust_recommendation` / `strategy_ready`), ou la (re)surface de la recommandation est autorisee par design. Le refus concis n'est alors qu'une heuristique de prompt non deterministe.
- Symptome visible: sous pression d'application, Sophia re-deroule la recommandation au lieu d'un refus court + destination.
- Preuve systeme: R3 `flow_stage=strategy_ready`, `surfaced_in_weekly=true`; reponse 294 car. re-derivee.
- Correction attendue: classer "appliquer/valider le changement depuis le chat" comme intention d'action refusee, avec reponse contrainte "je ne modifie pas ici + destination", independamment de l'etat de surface de la recommandation. Fix cote dispatcher/route policy, pas cote prompt visible.
- Fix applique (sortie structuree -> garde-fou deterministe, doctrine architecture):
  - `local_flow.ts` — nouveau champ dispatcher `chat_plan_mutation_request` (type + parsing dans `normalizeWeeklyReviewLocalDispatcherOutput` + regle et note de completion dans `dispatcherSystemPrompt` + schema sparse). Threade dans `known_values.chat_plan_mutation_request`.
  - `visible_agent.ts` — `chatPlanMutationRefusalRequired()`; quand true, `canSurfaceAdjustRecommendation` force `false` et le hard_constraint `chat_plan_mutation_refusal_required` est expose.
  - `visible_agents.ts` — regle commune: si `chat_plan_mutation_refusal_required=true`, refus concis (1-2 phrases) + destination, sans re-derouler recommandation/synthese/recap.
- Verification run reel (r4): push "applique/valide a ma place" -> T4 125 car. (refus + destination), T5 147 car. via `normal_reply` (le weekly s'etait cloture), aucun re-deroule. Contre r3 T5 = 294 car. re-derive.
- Statut: `fixed` (garde-fou deterministe cote structure; le classifieur dispatcher reste IA mais le visible ne peut plus re-derouler quand le flag est pose)
- Fix reference: `local_flow.ts`, `visible_agent.ts`, `visible_agents.ts`; tests `weekly_review_local_flow_test.ts` ("weekly dispatcher parses chat_plan_mutation_request", "weekly visible refuses chat plan mutation request without re-surfacing") — 103/103 verts.
- Tests requis: positif OK; paraphrase (run reel r4 T4/T5) OK; anti-faux-positif (vraie demande "quoi ajuster" garde `chat_plan_mutation_request=false` -> surface autorisee) OK.

## R2-B04 — Release active-flow post-completion non deterministe

- Bug id: `R2-B04`
- Tours: R3 T7 (contraste avec R2 T7 qui a bien libere)
- Famille: `a classifier` (ownership/handoff terminal; proche BF-ROUTE-02 mais c'est un defaut de liberation, pas une capture d'intention nouvelle).
- Domaine owner: active-flow lifecycle weekly / owner selection post-completion.
- Source amont: apres `closure_status=complete` / skill `status=completed`, le tour social suivant est parfois encore owne par `weekly_adaptive_review_v1` au lieu de `normal_reply`, ce qui laisse le visible closure re-synthetiser.
- Symptome visible: sur un "merci, bonne nuit" post-cloture, Sophia re-synthetise le bilan au lieu de rendre une politesse breve.
- Preuve systeme: R3 weekly `completed` + `closure_status=complete`, mais response_owner du tour = `weekly_adaptive_review_v1`. R2 meme scenario -> `normal_reply` (comportement attendu).
- Correction attendue: garantir la liberation de l'owner des que le weekly est complete, pour que le premier tour social post-completion soit traite par `normal_reply` (ou le fix companion R1-B02 s'applique).
- Cause racine confirmee: `isWeeklyAdaptiveReviewState` (dans `state.ts`) considerait un weekly actif des que `skill_id=weekly_adaptive_review_v1`, sans regarder `status`. Un weekly `completed` restait donc "actif" et le tour suivant y re-rentrait (R3). R2 avait libere seulement parce que le dispatcher weekly avait *choisi* de sortir — non deterministe.
- Fix applique:
  - `state.ts` — `isTerminalWeeklyReviewStatus()` (status `completed`); `weeklyAdaptiveReviewStateForTurn` ignore desormais un weekly termine (retourne null) sur toutes les sources (active_skill_state, cles canoniques/legacy, suspended). Un weekly termine n'est plus une capture active -> le tour repart vers le dispatcher global -> `normal_reply` (et le fix companion R1-B02 s'applique).
- Verification run reel (r4): apres cloture, T5 owner `normal_reply` (refus concis), T6 "merci, bonne nuit" -> owner `normal_reply`, 22 car. "Bonne nuit 🌙 À demain." (plus de re-synthese). Contre r3 T7 = owner weekly + re-synthese.
- Statut: `fixed`
- Fix reference: `state.ts`; tests `weekly_review_state_test.ts` ("weekly_state_completed_is_no_longer_active_for_routing", "weekly_state_open_stays_active_for_routing") — verts.
- Tests requis: integration runtime (tour post-completion -> owner `normal_reply`) OK (unit + run reel r4); rerun QA OK.
