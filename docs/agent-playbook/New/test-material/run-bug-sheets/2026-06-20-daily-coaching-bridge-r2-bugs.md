# Run Bug Sheet - qa-daily-coaching-bridge-2026-06-19T234041857Z

## Bug 1 - Daily ne consolide pas les 3 statuts explicites apres reprise coaching

- Verdict: yellow
- Famille: BF-STATE-01 / BF-UX-01
- Surface: `daily_action_review_v1`, pending WhatsApp daily
- Evidence: tours 2 a 6 du rapport `2026-06-20-daily-coaching-bridge-r2.md`

Le user dit explicitement:

> Merci, j'ai mon levier. On reprend le daily: Ranger le matériel hors de vue est fait; Cibler le joint réflexe est fait; Faire un sas de décompression (sans fumer) est fait.

Le flow daily devrait resoudre les 3 targets en un seul tour. A la place, Sophia redemande plusieurs confirmations sur des actions deja marquees comme faites dans le meme message, puis commit seulement au tour 6 apres repetition.

### Impact

- Le bridge daily -> coaching fonctionne.
- Le retour fonctionnel vers daily fonctionne.
- Le commit final fonctionne pour les 3 actions.
- Mais la reprise daily est trop laborieuse et donne une impression de non-comprehension.

### Fix attendu

Quand le message contient une reprise explicite daily + une liste de statuts par titre, le dispatcher/reducer daily doit:

- matcher toutes les targets citees;
- appliquer `completed` a chaque target clairement marquee comme faite;
- ne pas redemander une confirmation pour une target deja couverte;
- committer en un seul tour si toutes les targets sont resolues.

### Regression attendue

Scenario: daily -> coaching_recommendation -> user dit `on reprend le daily` avec 3 statuts explicites.

Attendu:

- un seul tour de reprise daily;
- `entries_before_cleanup=3`;
- `pending_status=done`;
- aucune clarification redondante.

## Bug 2 - Pas de memo coaching -> daily observe

- Verdict: yellow
- Famille: BF-ROUTING-01
- Surface: `coaching_recommendation`, `user_chat_states.temp_memory`

Le run observe un retour fonctionnel par reprise explicite du pending daily, mais pas de `__last_coaching_recommendation_exit_memo` vers `daily_action_review_v1`.

### Impact

Le cas explicite fonctionne, mais un retour implicite ou moins direct pourrait rester fragile.

### Fix attendu

Quand `coaching_recommendation` est lance depuis daily avec `return_to_parent`, une recommandation livree devrait produire un memo de completion vers `daily_action_review_v1`, ou alors le contrat doit assumer officiellement que la reprise explicite du pending daily est le mecanisme prioritaire.
