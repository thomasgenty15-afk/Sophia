# Run Bug Sheet - rose-nav-frontieres-r1

## Metadata

- Date: 2026-07-10
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-07-10-rose-nav-frontieres-r1.md`
- Run id: rose-nav-frontieres-r1
- Persona / scenario: rose, 10 scénarios frontière navigation normal_reply / presence_conversation / coaching_recommendation (20 tours, IA réelle locale, force_full_ai)
- Verdict run: red
- Validite QA: valide (0 tour vide, 0 fallback, cleanup complet)
- Agent owner: Claude (session presence-flow)

## Synthese

- Familles dominantes: BF-ROUTE-02 (flow coaching actif capture les dépôts de fond), BF-ROUTE-01 (entrée présence trop précoce), BF-INTAKE-03 (refus d'outil ignoré)
- Bug le plus bloquant: NAV-B01 — le dispatcher LOCAL coaching ne sort jamais vers le global sur un dépôt de fond (`skill_run.status=continue` en B6/B7); il monétise chaque dépôt vulnérable, y compris après refus explicite. L'exit-vers-global existe déjà (`run.ts:1852`, même mécanique que weekly) mais n'est jamais déclenché
- Fix architectural prioritaire: (1) critère d'`exit_to_global_dispatcher` sur « dépôt discursif profond / désengagement outil / je veux juste parler » dans le dispatcher local coaching; (2) `shouldPreserveDispatcherExit` (`local_flow.ts:614`) autorise cette sortie (aujourd'hui bloquée en `active_flow_non_critical_exit_blocked`); (3) supprimer la branche `enter_presence` de routers.ts (design parent→enfant, inatteignable, hors architecture). PAS de regex, PAS de règle de phrase: on aligne les critères de sortie du flow, là où l'archi place la décision d'owner
- Rerun requis: FAIT (run r2 du 2026-07-10, verdict green — `qa-run-reports/2026-07-10-rose-nav-frontieres-r2.md`): B6/B7 rejoués → sortie coaching 2/2 + entrée présence même tour; NAV-B03 revalidé; 2 bugs de robustesse découverts+fixés+revalidés en itération (NAV-B05 kind omis, NAV-B06 flag re-dispatch). Reste ouvert: NAV-B04 (relance, observation) + échantillonnage fiabilité kind tool_pull

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NAV-B01` | B6-T5, B7-T3 | `BF-ROUTE-02` | coaching local dispatcher + exit guard | dispatcher local coaching classe le dépôt émotionnel comme « coaching à poursuivre » (jamais d'`exit_to_global_dispatcher`); doctrine contradictoire (3169 action→emotion = cible locale; 3179 reco active interdit l'exit) | dépôt émotionnel fort pendant coaching actif → potion poussée au lieu d'écoute/bascule présence | trace `skill_run.status="continue"` sur B6/B7 (le flow ne tente pas de sortir); `reason=active_coaching_recommendation`. Exit-vers-global existant et non déclenché: `run.ts:1852` | (1) règle prioritaire « DEPOT DISCURSIF PROFOND » → `exit_to_global_dispatcher` dans le prompt du dispatcher local coaching + exceptions aux invariants 3169/3179/3194; (2) garde: aucune modif code nécessaire (`isCoherentDispatcherExit` préserve déjà une sortie propre — prouvé par test); (3) entrée présence déplacée après les continuations dans routers.ts (préemption parent→enfant supprimée) | `fixed` | commit à venir (branche clean-v2-redesign, 2026-07-10) | FAITS: prompt-anchor test NAV-B01, test reducer « clean discursive exit preserved despite standing recommendation », tests routers flippés (coaching actif garde le tour; entrée post-purge; entrée > signal coaching frais). Live r2: 2/2 sorties + entrée présence même tour |
| `NAV-B02` | B7-T4 | `BF-INTAKE-03` (aggravé par NAV-B01) | coaching_recommendation prompt/état | état coaching reste en mode recommandation; règle anti-réoffre de `visible_agents/shared.ts` non tenue sur potion refusée au tour précédent | « Non j'ai pas envie d'une potion » → potion clarté re-proposée au tour suivant sur souvenir intime | transcript B7-T3→T4; coaching actif turn_count=3→4 | portée par NAV-B01: la sortie discursive supprime le contexte de vente (le refus+dépôt SORT du flow au lieu d'y rester) | `fixed` | via NAV-B01 | Live r2 B7'-T3: refus potion + dépôt → exit, zéro produit sur les tours suivants |
| `NAV-B03` | B2-T1 | `BF-ROUTE-01` | dispatcher global (doctrine présence) | calibration `confidence_band` dans `dispatcher.prompts.ts`: « annonce d'un sujet sans contenu » classée high | entrée présence immédiate sur « il y a un truc qui me tourne dans la tête » (attendu: normal_reply T1, entrée T2 sur dépôt) | trace: band=high kind=maintain sur annonce vague; `presence_conversation_entry` T1 | anti-faux-positif doctrine: annonce/teasing sans contenu déposé = medium max; entrée au tour du vrai dépôt | `fixed` | dispatcher.prompts.ts (doctrine confidence_band) | Live r2 B2': annonce → medium/normal_reply, dépôt T2 → entrée high |
| `NAV-B04` | B8-T1 | `a classifier` (note style, non bloquant) | presence_conversation prompt | mandat « UNE vraie question » non tenu sur 1 tour/9 | réponse longue sans relance après dépôt lourd | transcript B8-T1 (se termine sur une affirmation) | observation seulement; si récurrent, renforcer la ligne relance du mandat présence | `open` |  | échantillonnage sur prochains runs présence |
| `NAV-B05` | r2 B6'-T2/T3 | `BF-ROUTE-01` | dispatcher global (contrat flow présence actif) | le dispatcher émettait coaching_recommendation SANS le signal presence_conversation quand la présence était active → kind incalculable → collant par défaut, tool_pull explicite absorbé | « prépare-moi la carte dans l'app » (2×) répondu en conversation au lieu de router coaching | trace r2 B6'-T3: `presence_signal=none` + `coaching_signal=high` avec présence active | contrat durci dans dispatcher.prompts.ts: signal présence + context.kind OBLIGATOIRES à chaque tour de flow actif, y compris en double émission (émettre coaching sans kind=tool_pull = violation) | `fixed` | dispatcher.prompts.ts (FLOW PRESENCE ACTIF) | Live r2 B6'-T4: kind=tool_pull revenu, handoff coaching OK. Robustesse probabiliste: échantillonner |
| `NAV-B06` | r2 B6'-T5 | `BF-ROUTE-01` | run.ts (re-dispatch de sortie de flow local) | les `runConversationRouters` des re-dispatchs de sortie (weekly + génériques) omettaient `presence_flow_enabled`, et l'entrée présence n'était pas appliquée en cours de boucle (`presenceApplyResult` requis par le site de génération) | sortie coaching réussie mais atterrissage en `normal_reply_default` malgré presence_signal=high; état non collant | trace r2 B6'-T5: skill_run exit + presence high + owner normal_reply; état AUCUN | passer `presence_flow_enabled` aux deux sites + `applyPresenceEntryAfterLocalFlowExit()` (transition enter appliquée sur le tour de re-dispatch) | `fixed` | run.ts | Live r2 B6b-T2: owner presence même tour, log `transition=enter after_local_flow_exit`, T3 collant (turns=2) |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-10 | Correction NAV-B01 via `exit_to_global_dispatcher` du dispatcher LOCAL coaching (pas de préemption parent→enfant, pas de dé-skip global) | l'exit-vers-global existe déjà (`run.ts:1852`), 1 appel dispatcher/tour hors tour de sortie; conforme à la règle « tout sort vers le dispatcher global, pas de passation flow→flow sauf daily » (confirmé user 10/07) et charte cmd 17/9 | à valider user | rapport §2 B6/§4 |
| 2026-07-10 | Supprimer la branche `enter_presence` de routers.ts:432 | design parent-préempte-enfant hors architecture + inatteignable (signal présence absent du turn_frame quand le dispatcher global est sauté). Erreur de conception de ma part corrigée après clarification user | à valider user | rapport §2 B6 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-07-10 | NAV-B01 | trace `skill_run.status="continue"` sur B6/B7-T3/T4 (le coaching ne tente pas de sortir) + lecture `run.ts:1852` (exit-vers-global existant) + `contract.ts:27` (`exit_to_global_dispatcher` déjà défini) + `local_flow.ts:614` (garde bloquant) | cause reclassée: choix du dispatcher local coaching, PAS trou de plomberie | rapport B6/B7 §2 |
| 2026-07-10 | NAV-B01/B02 | run live r2: B7'-T3 (refus+dépôt plan social) et B6b-T2 (dépôt proprio/père) → `skill_run.status="exit"` 2/2, notes de handoff fidèles, zéro potion; B6b-T2 → owner présence LE MÊME tour + collant T3 | fixé et revalidé | rapport r2 |
| 2026-07-10 | NAV-B03 | run live r2 B2': annonce vague → band=medium → normal_reply; dépôt T2 → entrée | fixé et revalidé | rapport r2 |
| 2026-07-10 | NAV-B05/B06 | découverts EN r2, fixés en itération, revalidés dans le même run (B6'-T4, B6b-T2/T3) + 303 tests unitaires verts (2 échecs préexistants hors périmètre) | fixés | rapport r2 |
