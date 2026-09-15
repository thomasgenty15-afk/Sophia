# plan-5 — **PAS UNE MESURE**

Deux tentatives, **deux `546 WORKER_LIMIT`** (400 s chacune), après 5 puis
3 expirations à 60 s du modèle de repli. Aucun plan n'a été écrit.

Ce qui EXISTE ici, et rien de plus :
- `inputs.json` — les entrées relues en base au moment du run ;
- `request-body.json` — le corps POST ;
- `dump/prompt-system.txt`, `dump/prompt-user.txt` — le prompt **réellement
  envoyé** (la capture précède l'appel HTTP, donc un run qui échoue archive
  quand même son prompt) ;
- `http-response.json` / `FAILED-546-first-attempt.json` — les deux échecs ;
- `model.txt` — la preuve d'existence des lignes en base.

Ce qui MANQUE, et que je ne recopie pas d'un autre run : le plan.
`plan-payload.json` et `plan-written.json` ont été **supprimés** parce que la
requête « dernier plan du foyer » rendait le plan de **plan-4** — c'est le piège
exact qu'un run non abouti tend, et un `plan_id` en double est le seul moyen de
le voir. La règle des trois fichiers n'est pas tenue : **ce run ne compte pas.**

⚠️ Il compte en revanche comme mesure de POSTE : sur 7 tentatives de fenêtre
2 jours, 4 ont abouti.
