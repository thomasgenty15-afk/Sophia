# Le rejeu des six réponses archivées — avant / après le chantier

Commande (hors ligne, aucun appel modèle, aucune écriture en base) :

```bash
deno run --allow-read --allow-write=scratchpad/2026-09-11-CHANTIER-PREMIER-JET \
  scratchpad/2026-09-11-CHANTIER-PREMIER-JET/rejouer-apres.ts
```

## ① Le canari a mordu, et c'était son travail

`scratchpad/2026-09-11-ENQUETE-DEUX-DIRECTIONS/rejouer.ts` **lève** dès que le code courant ne
reproduit plus les 18 parts standards du journal archivé. Il a levé sur `perte fri/dinner`.
**C'est le comportement voulu** : la mesure a changé, et le README de l'enquête l'annonce.

⛔ Je ne l'ai pas désarmé. J'ai écrit un **jumeau** (`rejouer-apres.ts`) qui ne garde rien et se
contente de **mesurer** l'écart. L'original reste le gardien de l'enquête.

Une seule modification au gardien : son faux client de base rendait `undefined` sur une table
inconnue, et le lot A a ajouté une **troisième** lecture (les faux amis FR/EN). Le faux client
tolère désormais une table absente. **⛔ Conséquence à dire : ce rejeu ne mesure donc PAS l'effet
du lot A** — le référentiel figé de l'enquête ne contient pas cette table. L'impact du lot A est
mesuré à part (`lotA-impact.json`).

## ② Ce qui a changé : 11 parts sur 18, dont 9 pour un kcal

```
identiques: 7/18 · différentes: 11/18
```

**Neuf des onze bougent de −1 à 0 kcal et de 0 à 1 gramme.** C'est la correction du biais de la
pincée du lot B (les lignes sans `amount` comptaient entières dans chaque part). Il l'avait
annoncée à −0,46 % ; mesurée ici, elle est encore plus petite.

**Les deux autres ne sont pas des écarts de mesure : ce sont deux plats qui ont retrouvé leur
identité.**

| | avant | après |
|---|---|---|
| `gain sat/lunch` | titre **« Saumon avec couscous… »**, casseroles `lentil_ratatouille` + `couscous` | titre **« Lentilles, couscous, feta, amandes et pain »**, mêmes casseroles |
| `gain sat/dinner` | titre **« Lentilles, couscous, feta… »**, casseroles `salmon` + `couscous` + `roasted_vegetables` | titre **« Saumon, couscous, légumes rôtis et amandes »**, mêmes casseroles |

C'est **exactement** le défaut de l'enquête § 3 — « samedi déjeuner, titre *Saumon avec couscous*,
mais liens vers `prep_lentil_ratatouille` + `prep_couscous`, **aucun saumon** ». Le lot E refuse
désormais d'épisser une case dont l'ensemble de `uses` a changé (`uses_mismatch`), donc la case
garde le plat cohérent d'avant au lieu de recevoir un titre qui ne correspond plus à ce qu'elle
contient.

Les masses suivent : 811 → 1 027 g d'un côté, 991 → 846 g de l'autre. **Ce ne sont pas les mêmes
plats qu'on pèse.**

## ③ Ce que ce rejeu ne prouve pas

- **Rien sur le lot A** (référentiel figé sans la table des faux amis).
- **Rien sur le prompt** : aucun appel modèle. Le catalogue d'ingrédients, les couloirs par case
  et le nettoyage des consignes concurrentes ne peuvent pas être évalués ici.
- **Rien sur l'ajusteur du lot D branché** : le rejeu s'arrête avant le chemin où il est appelé.
  Son effet est mesuré à part, sur les cas réels, par son propre banc.
- Le rejeu ne rejoue ni la décision d'admission, ni les gardes de sécurité, ni l'écriture HTTP.
  Le README de l'enquête le dit déjà ; c'est toujours vrai.
