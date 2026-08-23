# LOT B — les trois tentatives de run réel, et pourquoi aucune n'est une mesure

**Aucun des trois n'a produit de plan.** Deux ont atteint le modèle, aucune n'a
rendu de sortie. Consigné ici parce qu'« un run dont on n'a pas les trois
fichiers n'est pas une mesure », et qu'un dossier de run à moitié rempli se
relit trois jours plus tard comme un résultat.

| tentative | request_id | HTTP | durée | modèle |
|---|---|---|---|---|
| `lotb-1` | `b0000001-…-000000000001` | **500** | 5 s | aucun appel |
| `lotb-2` | `b0000002-…-000000000002` | **502** | 12 s | `attempt_start` 10:10:54, jamais de `success` |
| `lotb-3` | `b1000019-1200-4000-8000-00000000b001` | **502** | 16 s | `attempt_start` 10:13:37, jamais de `success` |

## La cause, mesurée et non supposée

Le conteneur `supabase_edge_runtime_Sophia_2` est **recréé toutes les 30 à
70 secondes** par le `functions serve` d'une session voisine. Relevé sur
`docker inspect -f '{{.State.StartedAt}}'`, six sondes à 20 s d'intervalle :

```
10:13:56  running
10:13:56  running
(inspect échoue — le conteneur n'existe plus)
10:15:01  running
10:15:01  running
10:15:28  running
```

Une génération de foyer prend 30 à 60 s. Les deux appels sont donc morts en
plein vol, à 12 s et à 16 s. **Ce n'est ni le produit ni Kong** (patché à 600 s,
revérifié avant la première tentative), et le briefing commun le nomme
explicitement : « ne conclus jamais rien d'un 502 ».

## ⚠️ Le piège de l'instrument, rencontré ici

Les request_id `b0000001` à `b0000005` **avaient déjà servi la nuit du
2026-08-18**. `model.txt` de `lotb-1` et `lotb-2` affichait donc des lignes
d'appels d'hier — un vidage qui a l'air plein sur un run qui n'a rien appelé.
Vérifié par `select … where created_at > '2026-08-19 10:05'`, qui rend une seule
ligne. **Toujours horodater la contre-épreuve, jamais se fier au request_id
seul.**

## Ce qui remplace le run

Le branchement (`sizingFactors` passé à `attachSizedQuantities`, porte du
recollage ouverte sur `shared_scaled`) est tenu par un **test de source** sur
`generate-household-meal-v1/index.ts` —
`household_body_share_test.ts`, « LE GÉNÉRATEUR PASSE BIEN LES FACTEURS À LA
PHRASE ». Il ne dépend pas du poste, et il a sa prémisse (la source a bien été
lue) vérifiée avant ses assertions.

Le reste est prouvé par **rejeu des plans archivés** :
`scratchpad/qa-generation/2026-08-19-1200-lotB-replay.ts`.
