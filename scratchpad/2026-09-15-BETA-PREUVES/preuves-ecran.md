# Preuves d'écran — 2026-09-15, version `62815cfe`

Navigateur intégré, front local sur `http://localhost:5173` (port imposé par `site_url` de l'auth
locale), connexion par **lien magique** généré par l'API d'administration locale — aucun mot de
passe saisi dans un formulaire.

| # | cas | compte de test | ce que l'écran montre | verdict |
|---|---|---|---|---|
| 1 | plan actif après connexion | `lotf.camp8.b15c` (N=2, végane + omnivore, tir 8) | `/app/plan` rend le plan écrit : Max 178 cm · 68 kg · prendre du muscle ; mardi 15 « 1881 kcal », courses 28 articles, session ~120 min | ✅ |
| 2 | **rechargement** de `/app/plan` | idem | le même plan revient, sans attente ni recomposition ; « Qui mange quoi » liste un plat par personne | ✅ B5 |
| 3 | **variante par personne à l'écran** | idem | dîner du mardi : « POUR LEA — Lentilles, orge, edamame, tofu, épinards et tahini · 318 kcal » et « POUR MAX — Porc, pommes de terre, tomate et pain complet · 507 kcal », chacun avec sa boîte nommée | ✅ B1 |
| 4 | **l'écart est nommé** | `lotf.camp9.b15b` (N=4, tir 9, `protein_floor_short`) | bandeau « Ce plan est utilisable, et voici ce qu'il ne tient pas — Une journée n'atteint pas sa protéine · 15 septembre 2026 · pour Paul. Il a été enregistré. Rien d'autre n'a changé. » | ✅ B3 / 2.4 |

Non fait à l'écran, et pourquoi : la phrase « composition périmée » (`plan_expired`) n'apparaît que
pendant une attente de composition dont l'échéance passe — la provoquer coûte un appel modèle et
un délai de 440 s ; sa couverture reste l'épreuve `planRecoveryExpiry.int.test.ts`. Un brouillon
mort en base ne rouvre AUCUNE attente au rechargement, par construction (lot 1), donc rien à voir.
Le refus « brouillon introuvable » est prouvé par l'API (lot 4) et sa phrase par le test de copie.
