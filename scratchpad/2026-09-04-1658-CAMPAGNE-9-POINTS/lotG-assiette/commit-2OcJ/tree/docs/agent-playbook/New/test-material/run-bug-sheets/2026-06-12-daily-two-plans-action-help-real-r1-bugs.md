# Bug Sheet - daily-two-plans-action-help-real-r1

## R1-B01

- Bug id: `R1-B01`
- Tours: 1, 2
- Famille: `BF-PROACTIVE-01`
- Domaine owner: `daily_action_review_v1`
- Source amont: dispatcher local / reducer daily, regles de preuve pour `outcome`
- Symptome visible: Sophia comprend "j'ai oublie l'action, c'est quoi ?" comme "je n'ai pas realise l'action" et affirme ensuite que les deux actions n'ont pas ete faites.
- Preuve systeme: apres T1, `review_state.items[respiration].outcome=missed`, `reason_category=forgot`; apres T2, les deux actions sont `missed`; aucun effet durable n'est encore applique, mais le visible agent s'appuie sur cet etat faux.
- Correction attendue: distinguer explicitement oubli de consigne / demande de definition / "je dois faire quoi" de l'oubli d'execution. Ne stabiliser `outcome=missed` que si le message contient une preuve d'action non faite, pas une demande d'aide sur le contenu de l'action.
- Statut: `open`
- Fix reference: none
- Tests requis: test positif "j'ai oublie ce que c'est" -> aide sans `outcome`; anti-faux-positif "j'ai oublie de le faire" -> `missed`; run integration webhook daily avec deux actions dans deux plans.

## R1-B02

- Bug id: `R1-B02`
- Tours: preflight
- Famille: `BF-TEST-01`
- Domaine owner: `whatsapp-webhook` / TypeScript hygiene
- Source amont: type-check strict du webhook local
- Symptome visible: `deno check supabase/functions/whatsapp-webhook/index.ts` echoue avec 82 erreurs TypeScript, meme si l'endpoint runtime a servi le run.
- Preuve systeme: preflight `deno check` en erreur; HTTP minimal sur `whatsapp-webhook` puis tours reels HTTP 200.
- Correction attendue: restaurer un type-check propre du webhook pour eviter que les runs QA dependent d'un runtime qui boote malgre des erreurs statiques.
- Statut: `open`
- Fix reference: none
- Tests requis: `deno check supabase/functions/whatsapp-webhook/index.ts` vert, puis rerun daily webhook.
