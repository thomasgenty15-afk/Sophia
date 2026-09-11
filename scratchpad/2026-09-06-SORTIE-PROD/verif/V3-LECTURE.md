# V3 — la coupure à 150 s, mesurée sur le chemin réel

**Obtenue sans la chercher**, le 2026-09-06 à 23:27, sur `generate-household-meal-v1`,
foyer de cinq bouches, fenêtre de 3 jours, `intent: "draft"`.

| | |
|---|---|
| HTTP | **504** « The upstream server is timing out » |
| Durée | **150,008 s** |
| Contenu | aucun — le client n'a rien reçu du plan |

150,008 s n'est pas une durée de génération : c'est le `read_timeout` de Kong, **150 000 ms
par défaut, la même valeur qu'en hébergé**. Le patch local à 900 s
(`scripts/local_extend_kong_functions_timeout.sh`) ne survit pas à un `supabase stop && start`,
et il ne tournait pas ce soir. La fonction, elle, a continué côté serveur.

**Ce que ça prouve, et que personne n'avait vu**. Les campagnes précédentes tournaient toutes
sous Kong patché : leurs 170 s, 200 s et 230 s étaient des succès HTTP 200 qui, en production,
auraient été des 504. Le même tir, deux heures plus tôt et sous le même code, avait mis
**145 s** — sous la limite, mais de cinq secondes.

**Conséquence pour la sortie** : sur ce foyer, à trois jours, on est déjà à la limite. À sept
jours, ou à cinq bouches avec relances, on est au-dessus. Le job de fond n'est pas une
optimisation, c'est la condition pour que la génération aboutisse.

⚠️ Et un piège de banc : sans le patch Kong, toute campagne longue mesure la coupure de Kong,
pas le produit. Lancer `TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh`
avant les tirs FONCTIONNELS, et mesurer la latence séparément par `keel.*.wall`.

## Suite — le MÊME cas, trois fois, trois issues

Même fixture (foyer de cinq, `qa-9pts-cinq`), même requête, même code, dans l'heure :

| Tir | Durée | Issue |
|---|---|---|
| V1 (23:16) | 145 s | **200**, plan composé, refusé ensuite par la ceinture de groupe |
| V1d (23:27) | 150,008 s | **504** — `read_timeout` de Kong, valeur par défaut = celle de l'hébergé |
| V1d bis (23:33) | 301,2 s | **502** — la borne de l'appel modèle (`PLAN_HTTP_TIMEOUT_MS = 300 000`) |

**La variance est le résultat, pas le bruit.** Un facteur deux sur la durée du même prompt,
et deux des trois tirs n'auraient rien rendu en production. Une moyenne sur ce cas ne veut
rien dire ; ce qu'il faut publier est la part de tirs sous la barre.

⚠️ Conséquence de méthode pour la campagne RC1 : mesurer `keel.*.wall` sur CHAQUE tir et
rapporter la distribution, jamais une moyenne. Et ne pas conclure « corrigé » ni « pas
corrigé » sur un tir unique quand un tir sur trois n'aboutit pas pour une raison qui n'a rien
à voir avec ce qu'on teste.

**Ce que ça dit du lot « job de fond »** : il ne suffit pas de déplacer l'attente hors de la
requête HTTP. À 301 s le modèle lui-même a rendu la main ; le worker hébergé coupe à 400 s.
La marge est mince, et une relance de qualité peut la manger. Le brouillon persisté aide
doublement : il retire le SECOND appel modèle de l'adoption, qui était le plus proche de la
barre.
