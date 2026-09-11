# Petit banc de latence — Fast, effort, budget · 2026-09-10

Quatre requêtes **séquentielles**, corps de requête identique à celui de l'écran
(`planDraft.ts::composeDraft`), `intent: "draft"` — aucun plan écrit en base.

Relance : `python3 scratchpad/2026-09-10-BANC-FAST/00-banc.py [S1 S5 F1 F3]`

---

## Ce que le banc prouve, tout de suite

**① Fast atteint le fil, PAR APPEL, et le fournisseur le confirme.**

```
tier demandé = fast   (source: call)   rendu = priority
```

`source: call` est la moitié qui compte : le palier vient du **paramètre de
l'appel**, pas de `KEEL_OPENAI_SERVICE_TIER`, qui n'est posé nulle part. Avant ce
lot, le champ n'avait jamais été envoyé en vrai. `priority` en retour est le
comportement documenté du fournisseur — `fast` et `priority` renvoient tous deux
`priority` — et le journal distingue `service_tier_sent` de `service_tier_echoed`
pour qu'on ne le lise pas comme une dégradation.

**② Le palier ne déborde PAS sur le reste du produit.**

Sur S5, l'appel de remplissage de composition sort ainsi :

```
generate-meal-v1.composition_fill — gpt-5.4-nano — tier demandé = None (source: none) — rendu = default
```

C'est exactement le périmètre voulu : les lanes de plan demandent Fast, le reste
garde sa configuration. Un test de câblage le tient (`plan_call_wiring_test.ts`).

**③ Le budget de rattrapage tient, et il se voit.**
S1 a dépensé **un** rattrapage (`empty_slots_retry`) ; S5 **zéro**. Aucun refus
`repair_budget_exhausted` ni `time_budget_exhausted` sur ces deux cas.

---

## Les mesures

| cas | HTTP | mur | appels modèle | composition | rattrapage | jetons | sortie |
|---|---|---|---|---|---|---|---|
| **S1** solo simple, 3 j | 200 | **57,4 s** | 2 | 32,7 s · 15 820 j | `empty_slots_retry` 16,3 s · 10 244 j | 26 064 | 9 plats · 4 prép. · 2 sessions · 41 courses |
| **S5** solo 6 j, une session | 200 | **55,1 s** | 2 | 45,4 s · 20 988 j | *(aucun)* + `composition_fill` 1,6 s | 21 480 | 18 plats · 3 prép. · 1 session · 41 courses |
| **F1** foyer 4 adultes, 2 j | 200 | **187,6 s** | 2 | 63,8 s · 22 841 j | `dedicated_repair` 81,6 s · 24 799 j | 47 640 | 6 plats · 3 prép. · 1 session · 29 courses |
| **F3** foyer des extrêmes, 2 j | 200 | **219,2 s** | 3 | 120,8 s · 32 572 j | `dedicated_repair` 89,1 s · 27 731 j | 60 780 | 6 plats · 7 prép. · 2 sessions · 22 courses |

**Maximum mesuré : 219,2 s**, sous l'échéance de 380 s — et sous la coupure du
worker edge (400 s), dont il reste 180 s de marge.

**Un seul rattrapage par plan sur les quatre cas**, jamais deux. Le budget n'a
donc pas mordu ici : aucun `repair_budget_exhausted`, aucun `time_budget_exhausted`,
aucun `repair_reserved`. ⚠️ Ce n'est pas une preuve que la réserve de priorité
marche en réel — il aurait fallu un plan qui demande à la fois une réparation de
sécurité et une de densité. Cette moitié-là est tenue par les tests déterministes
(`plan_budget_test.ts`), pas par ce banc.

**Ce que `high` sur les rattrapages coûte, mesuré ici :** `dedicated_repair`
prend **81,6 s** (F1) et **89,1 s** (F3), contre 16,3 s pour un rattrapage solo à
`medium` (S1). C'est l'arbitrage A1, et c'est son prix.

⚠️ **Deux points ne font pas un p95.** On rapporte les durées individuelles et le
maximum, jamais un percentile.

---

## ⛔ LE 546, ET IL EST NOMMÉ

Le **premier** tir de S1 a rendu `546 WORKER_LIMIT` à 51,1 s, alors que l'appel
modèle, lui, avait abouti en 39,2 s. Motif exact, lu dans le journal du conteneur
et non déduit :

```
CPU time soft limit reached: isolate: a955583d-…
CPU time hard limit reached: isolate: a955583d-…
```

**C'est du CPU, pas du mur.** Fast raccourcit l'ATTENTE du modèle ; il ne réduit
ni le CPU dépensé à parser et à mesurer, ni la mémoire tenue. Le banc s'est donc
arrêté, comme prévu, au lieu de continuer et de mesurer la chance.

⛔ **ET IL EST ANTÉRIEUR À CE CHANTIER — mesuré, pas supposé.** La campagne du
même matin (02:00–02:15, avant la première ligne de ce lot) porte les mêmes
échecs dans ses propres fichiers :

```
plan-S2-20260910-020248.json   ok
plan-S2-20260910-020714.json   WORKER_LIMIT
plan-S2-20260910-021015.json   ok
plan-F3-20260910-021301.json   WORKER_LIMIT
```

Deux sur quatre. Le rejeu immédiat de S1, sans rien changer, est passé en 57,4 s.
C'est une **limite CPU locale intermittente**, et on ne l'a pas relevée pour
verdir le banc.

## ⚠️ CE QUI FAUSSE UN TIR, ET QUI EST DE NOUS

`policy = "per_worker"` fait surveiller `supabase/functions/**` au runtime : une
écriture dans CE dossier pendant un tir **recrée le conteneur**, et la requête en
vol rend `502`. C'est arrivé une fois ici (F1, trois essais, 147 s, zéro appel
modèle) parce qu'un fichier de test était édité au même moment.

⛔ **Règle du banc : on ne touche à rien sous `supabase/functions/` pendant un
tir.** Un 502 de cette famille n'est pas une mesure, c'est un tir perdu.
