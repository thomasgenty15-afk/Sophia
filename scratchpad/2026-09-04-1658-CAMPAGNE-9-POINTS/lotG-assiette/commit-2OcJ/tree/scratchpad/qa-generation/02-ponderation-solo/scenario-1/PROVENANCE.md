# Scénario 1 — TOUT REMPLI
`prompt-*.txt` et `inputs.json` : état **v15** (dernière itération), construits
par `harness/build_scenarios.ts` (déterministe, aucun appel modèle).
`output.json` : run réel **v13**, `request_id` `2a000000-1100-4000-8000-000000000001`,
`gpt-5.6-sol`. La réponse HTTP est morte en 502 Kong ; la sortie MODÈLE, elle,
a bien été écrite en base et c'est celle-ci. Pas de verdict `200/422` pour ce run.
Runs v14/v15 : **bloqués** — voir `../RAPPORT.md` §7 (compte OpenAI sans crédit).
