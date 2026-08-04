# QA Run Report - Weekly Process R2

## 1. Contexte Du Test

- Date: 2026-06-17
- Run: `weekly-process-r2-partial_habits_mission_partial`
- Persona: connexion temporaire `qa-weekly-deep`
- Objectif: tester le flow weekly sur 5 tours minimum en demarrant par le prompt weekly genere par `process-checkins`.
- Trajectoire: fixture weekly isolee -> `scheduled_checkin` remis pending -> appel local `process-checkins` -> ouverture weekly systeme -> 5 tours utilisateur en `channel=whatsapp`, `scope=whatsapp`.
- Surfaces visees: `process-checkins`, `scheduled_checkins.message_payload.weekly_adaptive_review`, active state `weekly_adaptive_review_v1`, routing `/functions/v1/test-send-message`, `plan_patch.requires_confirmation`, EffectLedger.
- Cadre IA reel: local Supabase, `process-checkins` local pour l'ouverture, puis `/functions/v1/test-send-message` avec `force_full_ai=true`, `disable_debounce=true`, `channel=whatsapp`, hors sandbox. Aucun renderer deterministe ni fallback direct.
- Validite QA: valide pour diagnostiquer le flow weekly reel. Verdict fonctionnel: red, car l'active state weekly existe mais n'est jamais repris par le dispatcher.

Artefacts:
- Setup: `tmp/weekly-real-conversation-qa/weekly-process-r2-partial_habits_mission_partial/setup.json`
- Run brut: `tmp/weekly-real-conversation-qa/weekly-process-r2-partial_habits_mission_partial/whatsapp-run.json`
- Cleanup: `tmp/weekly-real-conversation-qa/weekly-process-r2-partial_habits_mission_partial/cleanup.json`

Opening systeme:
> C’est le moment du bilan de la semaine, et je vois qu’il y a eu un mélange de choses faites et de points restés un peu en suspens.
> Si tu devais résumer ta semaine en une phrase, tu la vivrais comment ?

Preuves setup:
- `process-checkins.success=true`, `processed=1`, `scheduled_checkin.status=sent`
- `scheduled_checkins.message_payload.weekly_adaptive_review` present
- `plan_patch.requires_confirmation=true`
- `week_strategy.decision=bridge_week`
- states presents avant cleanup:
  - `scope=whatsapp`, `skill=weekly_adaptive_review_v1`, `status=open`
  - `scope=weekly-deep-partial_habits_mission_partial-weekly-process-r2`, `skill=weekly_adaptive_review_v1`, `status=active`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Je la resume comme une semaine coupee en deux : debut plutot solide, puis grosse fatigue jeudi et vendredi. Je veux garder ce qui a marche, mais alleger la suite.

**Sophia**
> Oui, c’est une bonne lecture : solide au début, puis la fatigue a pris le dessus en fin de semaine. Le bon angle, c’est de garder les points qui ont tenu et de baisser un peu l’exigence là où ça a coincé 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- active_flow_arbitration: `active_owner=none`, `selected_owner=normal_reply`
- safety: `risk_band=none`
- direct_effects: []
- operation: none
- pending_confirmation: null
- executed_tools: []
- durable_effect: `EffectLedger.committed=0`

**Analyse si yellow/red**
- Symptome: l'ouverture weekly existe, mais le tour user n'est pas route vers `weekly_adaptive_review_v1`.
- Source amont probable: active flow arbitration ne lit pas ou ne priorise pas l'active state weekly du scope `whatsapp`.
- Owner runtime: dispatcher / active flow arbitration / weekly local dispatcher.
- Meilleure correction selon les guidelines: corriger la reprise d'active flow depuis `user_chat_states` et tracer l'etat charge; ne pas ajouter de detection lexicale.
- Pourquoi ce n'est pas un patch local: le state weekly est present en DB; le probleme est l'ownership runtime, pas le wording.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Oui, la fatigue est bien le blocage dominant. Dans le bilan weekly, est-ce que ca veut dire qu on part sur une semaine allegee plutot que refaire exactement la meme semaine ?

**Sophia**
> Oui, clairement : vu que la fatigue a bloqué la fin de semaine, l’idée la plus saine c’est d’alléger la suite plutôt que de rejouer la même charge. Garde ce qui a bien tenu, et baisse l’exigence sur ce qui a coincé 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- active_flow_arbitration: `active_owner=none`
- safety: `risk_band=none`
- direct_effects: []
- operation: none
- executed_tools: []
- durable_effect: `EffectLedger.committed=0`

**Analyse si yellow/red**
- Symptome: Sophia repond semantiquement, mais hors reducer weekly; aucune consommation structuree de `daily_evidence_summary`.
- Source amont probable: active flow arbitration.
- Owner runtime: dispatcher / weekly local dispatcher.
- Meilleure correction selon les guidelines: l'active state `weekly_adaptive_review_v1` doit prendre l'ownership apres une reponse au prompt proactive.
- Pourquoi ce n'est pas un patch local: la mention explicite "bilan weekly" ne suffit pas; le systeme ne voit toujours pas l'owner actif.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Dans ce bilan hebdo, propose-moi la version semaine allegee : garder les deux habitudes utiles, reduire la charge en fin de semaine, et laisser la mission signal de pause a finir. Ne l applique pas encore.

**Sophia**
> Oui — version semaine allégée :
> - garder les 2 habitudes utiles
> - baisser la charge surtout en fin de semaine
> - laisser la mission “signal de pause” à finir plus tard
>
> Je ne l’applique pas, je te propose juste le cadrage.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- active_flow_arbitration: `active_owner=none`
- safety: `risk_band=none`
- direct_effects: []
- operation: none
- executed_tools: []
- durable_effect: `EffectLedger.committed=0`

**Analyse si yellow/red**
- Symptome: la proposition visible est correcte en surface, mais n'est pas issue du `plan_patch` weekly et ne marque aucun `proposed` ledger.
- Source amont probable: routing / owner weekly absent.
- Owner runtime: dispatcher / weekly local dispatcher.
- Meilleure correction selon les guidelines: route vers `weekly_adaptive_review_v1`, puis renderer depuis `week_strategy`, `item_decisions` et `plan_patch.requires_confirmation`.
- Pourquoi ce n'est pas un patch local: une reponse visible plausible peut cacher l'absence de contrat, de confirmation et de ledger.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Avant de confirmer quoi que ce soit, dis-moi exactement ce qui serait modifie dans le plan weekly et ce qui reste pareil. Je veux juste verifier, pas valider.

**Sophia**
> Dans le weekly, ce qui changerait si tu confirmes, c’est surtout l’intensité : la semaine serait allégée en gardant les 2 habitudes utiles, avec une baisse de charge surtout en fin de semaine, et la mission “signal de pause” resterait à finir plus tard.
>
> Ce qui resterait pareil : le cadre de suivi de la semaine, les habitudes déjà en place, et le fait que je ne touche à rien tant que tu ne valides pas.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- active_flow_arbitration: `active_owner=none`
- safety: `risk_band=none`
- direct_effects: []
- operation: none
- executed_tools: []
- durable_effect: `EffectLedger.committed=0`

**Analyse si yellow/red**
- Symptome: Sophia parle de confirmation mais sans pending weekly ni trace `plan_patch`.
- Source amont probable: routing / confirmation contract non atteint parce que weekly n'est pas owner.
- Owner runtime: dispatcher / active flow arbitration.
- Meilleure correction selon les guidelines: restaurer le weekly owner avant la phase de confirmation; le renderer ne doit pas parler de modification de plan sans state/ledger associe.
- Pourquoi ce n'est pas un patch local: le probleme est la chaine owner -> reducer -> confirmation, pas la phrase "je ne touche a rien".

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Ok je valide le principe de la semaine allegee, mais je veux que tu me dises si tu as vraiment applique quelque chose ou si c est seulement une proposition a confirmer dans le plan.

**Sophia**
> C’est seulement une proposition à confirmer dans le plan, pas quelque chose de déjà appliqué. Tant que tu ne le valides pas explicitement, je garde juste le cadrage en l’état 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: `normal_reply_default`
- active_flow_arbitration: `active_owner=none`
- safety: `risk_band=none`
- direct_effects: []
- operation: none
- executed_tools: []
- durable_effect: `EffectLedger.committed=0`

**Analyse si yellow/red**
- Symptome: bonne prudence visible, mais aucune confirmation contractuelle weekly n'est traitee.
- Source amont probable: active flow absent du dispatcher.
- Owner runtime: dispatcher / weekly local dispatcher.
- Meilleure correction selon les guidelines: "je valide le principe" doit etre interprete par le reducer weekly comme confirmation insuffisante ou confirmation selon contrat, avec pending/ledger explicites.
- Pourquoi ce n'est pas un patch local: sans owner weekly, le systeme ne peut ni appliquer ni bloquer correctement selon le contrat.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia comprend le sens humain du bilan: fatigue dominante, ne pas repartir de zero, alleger la semaine.
- Elle ne culpabilise pas.
- Elle ne pretend pas avoir applique un changement.

**Problemes**
- Tours 1-5: la conversation reste generique et ne donne jamais le sentiment d'un vrai flow weekly structure. Famille: `BF-ROUTE-01`. Impact: l'utilisateur obtient une reponse plausible, mais pas le workflow produit attendu. Severite: red systeme, yellow humain.
- Tour 3-5: Sophia parle de proposition/confirmation, mais sans statut produit clair sur la validation weekly. Famille: `BF-ROUTE-01`. Impact: risque de confusion entre "proposition conversationnelle" et "patch weekly pret a confirmer". Severite: yellow.

**Fix propose**
- Source amont: active flow arbitration / weekly local dispatcher.
- Correction recommandee: apres un check-in weekly envoye, la reponse utilisateur sur `channel=whatsapp`, `scope=whatsapp` doit reprendre `weekly_adaptive_review_v1` et rendre une proposition depuis le state weekly, pas depuis `normal_reply`.
- Tests d'invariant attendus: ouverture `process-checkins` -> T1 user naturel -> `selected_handler=weekly_adaptive_review_v1`; paraphrases "semaine allegee", "bilan hebdo"; anti-faux-positif pour une sortie explicite hors bilan.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- `process-checkins` cree bien le prompt weekly et le payload.
- DB avant cleanup: `scope=whatsapp` contient `__active_skill_state.skill_id=weekly_adaptive_review_v1`, `status=open`, avec `weekly_adaptive_review`.
- Pourtant, T1-T5 ont tous `response_owner=normal_reply`, `selected_handler=null`, `active_flow_arbitration.active_owner=none`.

**Skills / Operations / Tools**
- `weekly_adaptive_review_v1` n'est jamais appele.
- Aucun tool execute.
- Aucune operation `apply_weekly_plan_patch` n'est proposee via ledger.

**Memory / Effets durables**
- `scheduled_checkin.message_payload.weekly_adaptive_review.plan_patch.requires_confirmation=true`.
- `week_strategy.decision=bridge_week`.
- `EffectLedger.committed=0` sur tous les tours: aucun patch applique sans confirmation.
- Cleanup cible OK pour `weekly-process-r2`: `errors=[]`, Auth delete `200`.
- Cleanup cible OK aussi pour la tentative contaminee `weekly-process-r1`.

**Problemes**
- Tours 1-5: active state weekly ignore malgre presence DB. Famille: `BF-ROUTE-01`. Impact systeme: le flow weekly ne consomme pas son state, ne passe pas par son reducer, ne produit pas sa confirmation, et ne peut pas etre valide.

**Fix propose**
- Source amont: active flow state loader / active flow arbitration dans le dispatcher.
- Correction recommandee: verifier la lecture `user_chat_states` pour `user_id + scope=whatsapp`, la compatibilite du shape `weekly_adaptive_review_v1`, et l'ordre de priorite active-flow vs `normal_reply`.
- Tests d'invariant attendus:
  - `process-checkins` weekly sent -> `user_chat_states.whatsapp.__active_skill_state.weekly_adaptive_review` present.
  - premier `/test-send-message` `channel=whatsapp`, `scope=whatsapp` -> `selected_handler=weekly_adaptive_review_v1`.
  - `plan_patch.requires_confirmation=true` reste vrai.
  - `EffectLedger.committed=0` avant confirmation explicite.

## Verdict Global

- Verdict: red
- Raison principale: le flow demarre correctement par `process-checkins`, mais le dispatcher ignore l'active state weekly et route les 5 tours vers `normal_reply`.
- Point sain: aucune mutation durable n'a ete appliquee sans confirmation.
- Follow-up prioritaire: corriger la reprise d'active flow weekly sur `channel=whatsapp` apres `process-checkins`, puis relancer ce meme scenario.
