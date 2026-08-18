# PROMPT — La doctrine maison de Sophia, établie par la preuve

> **À quoi sert ce document.** C'est le brief de recherche à donner à un agent pour
> déterminer, **d'après les études**, la doctrine que Sophia adopte par défaut — celle
> qu'une salle de sport (ou un coach qui n'a rien d'écrit) sélectionne pour que tout se
> remplisse d'un coup.
>
> Il est écrit pour produire un livrable **chargeable dans le produit**, pas un mémoire.
> Les noms de champs ci-dessous sont ceux du code, vérifiés le 2026-08-13.

---

## Le prompt à donner à l'agent

Tu établis la **doctrine nutritionnelle par défaut** d'un produit qui compose les repas
d'un foyer et répond à ses utilisateurs tous les jours. Cette doctrine sera adoptée telle
quelle par des professionnels qui n'en ont pas — typiquement une salle de sport, qui vend
une salle et non une méthode. Elle doit donc être **défendable par la preuve**, pas par
une opinion d'auteur.

### Ce que tu produis

Un fichier `scratchpad/site/doctrine-maison/RECHERCHE.md` (le raisonnement et les sources)
**et** un fichier `scratchpad/site/doctrine-maison/doctrine-maison.json` (le livrable
chargeable). Les deux, pas l'un ou l'autre.

### Partie 1 — Trancher les dix débats

Le produit livre dix débats du métier, chacun avec deux ou trois camps nommés. Ils sont
définis dans `supabase/functions/_shared/keel/doctrine_starter.ts`, constante
`STARTER_FORKS` — **lis-les avant de chercher**, avec l'intitulé exact de chaque camp.

Les dix clés : `meal_frequency` · `breakfast` · `hunger` · `portions` · `counting` ·
`the_scale` · `evening` · `off_plan_meals` · `eating_out` · `quick_fixes`.

Pour **chacun**, rends :

| Champ | Contenu |
|---|---|
| `fork` | la clé du débat |
| `position` | la clé du camp retenu, **telle qu'elle existe dans le code** |
| `grade` | `A` (méta-analyses / ECR concordants) · `B` (ECR isolés ou cohortes solides) · `C` (observationnel, mécanistique, consensus d'experts) · `D` (pas de preuve utilisable) |
| `why` | 2 à 4 phrases, en français, lisibles par un gérant de salle — pas par un chercheur |
| `sources` | 2 à 5 références réelles et vérifiables : auteurs, année, revue, DOI ou URL. Une source par affirmation qui porte |
| `dissent` | ce que dit le camp que tu n'as pas retenu, et pourquoi la preuve ne le soutient pas autant. **Obligatoire** |

⚠️ **`no_rule` est une réponse légitime, et c'est même la bonne quand la preuve est
équivoque.** La constante existe (`NO_RULE`). Un camp choisi sur une preuve de grade D est
pire qu'une absence de règle : il engage le nom d'un professionnel sur une affirmation que
le premier client informé démontera. **Le silence n'est pas une position** — si tu prends
`no_rule`, dis-le explicitement et dis pourquoi, ne laisse pas le champ vide.

### Partie 2 — La posture sur les aliments

Le produit a un **vocabulaire fermé de 30 groupes**. Tu ne peux ni en ajouter, ni en
renommer :

```
leafy_greens · cruciferous_veg · non_starchy_veg · starchy_veg · berries · citrus ·
other_fruit · legumes · whole_grain · refined_grain · lean_protein · poultry · red_meat ·
white_fish · fatty_fish · shellfish · eggs · tofu_tempeh · dairy_yogurt · dairy_cheese ·
nuts_seeds · olive_oil · other_added_fat · fried_food · sugar_sweets · sweetened_beverage ·
sauce_dressing · alcohol · coffee_tea · water
```

Pour chaque groupe, rends une posture parmi **exactement** : `encouraged` ·
`discouraged` · `excluded`, avec un `why` (une à deux phrases) et ses sources.

⚠️ **`excluded` est très fort** : il retire l'aliment de tout ce que le produit compose.
Réserve-le à ce qu'une preuve solide justifie d'exclure pour *tout le monde* — ce qui est
probablement une liste vide ou presque. Une exclusion qui relève d'un choix personnel
(la viande rouge, le gluten) n'appartient pas à une doctrine par défaut : c'est au
professionnel de la poser s'il le veut.

**Règle de fréquence — facultative, et à gabarits fermés.** Tu peux ajouter à un groupe
une règle parmi : `amount_per_period` (avec `direction` ∈ `at_least`/`at_most`, `amount`,
`amount_unit` ∈ `portion`/`g`/`ml`/`unit`, `period` ∈ `day`/`week`), `every_meal`,
`not_after` (avec une heure), `at_slot`. **Rien d'autre n'est stockable.**

⚠️ **La contrainte qui décide de tout ici : l'analyse d'une photo de repas rend des
GROUPES, jamais des aliments.** Une règle posée sur un aliment précis n'est donc pas
vérifiable, et une règle invérifiable est une promesse qui se casse en silence. Reste au
niveau du groupe. Et n'ajoute une règle de fréquence que si la preuve porte réellement sur
une quantité : la majorité des groupes n'aura **aucune** règle, et c'est le cas normal.

### Partie 3 — Les lignes rouges

Une ligne rouge est ce que l'agent ne doit **jamais** dire. Chacune porte obligatoirement :

- `token` — l'idée interdite, en un mot-clé
- `surfaceForms` — les formulations réelles à attraper, **dans les deux langues**
- `reason` — pourquoi c'est interdit
- `instead` — **ce qu'on dit à la place, rédigé, prêt à être envoyé tel quel**

⚠️ **`instead` n'est pas optionnel et ne peut pas être vide.** C'est ce qui part à
l'utilisateur quand la ligne rouge mord : sans lui, il reçoit un refus, et un refus est
exactement ce que le produit s'interdit. Écris-le comme une phrase complète, pas comme une
consigne.

Vise 5 à 10 lignes rouges maximum : ce sont les erreurs qui font du mal, pas un catalogue.

### Les contraintes non négociables

1. **Aucune prescription médicale.** La doctrine décrit une pratique alimentaire générale.
   Elle ne traite rien, ne diagnostique rien, ne s'adresse à aucune pathologie. Si une
   preuve solide ne vaut que sous encadrement médical, elle n'entre pas.
2. **Aucune règle qui vise un mineur.** Le produit porte une ceinture structurelle :
   un mineur n'est jamais une cible nutritionnelle. Une doctrine qui poserait un objectif
   de poids pour un enfant serait refusée par le code — n'en écris pas.
3. **Ne jamais annoncer un comptage calorique par photo**, ni un suivi de macros par
   photo. C'est une règle marketing non négociable du produit (`docs/keel/LEGAL.md` §6.4).
   Le débat `counting` porte sur la *pratique* du comptage, pas sur cette capacité.
4. **Pas de liste « aliments recommandés » comme champ de doctrine.** Le produit sépare
   volontairement deux choses : le **catalogue global** porte la *grammaire* d'un aliment
   (à quel groupe il appartient, comment il se compte), et le professionnel porte
   l'*opinion*. Ta partie 2 est de l'opinion, et elle s'exprime en postures de groupe.
5. **Une source par affirmation qui porte.** Pas de « des études montrent que ». Si tu ne
   trouves pas de source citable, la position est `no_rule` et le grade est `D`.
6. **Écris pour un gérant de salle.** Chaque `why` doit être compréhensible par quelqu'un
   qui n'a pas fait de nutrition, et défendable devant un adhérent qui conteste.

### La forme du livrable

`doctrine-maison.json` :

```json
{
  "version": 1,
  "establishedOn": "2026-08-13",
  "forks": [
    { "fork": "meal_frequency", "position": "<clé exacte>", "grade": "B",
      "why": "…", "sources": ["…"], "dissent": "…" }
  ],
  "foods": [
    { "group": "leafy_greens", "stance": "encouraged", "why": "…", "sources": ["…"],
      "frequency": null }
  ],
  "forbidden": [
    { "token": "…", "surfaceForms": ["…"], "reason": "…", "instead": "…" }
  ]
}
```

Les dix débats et les trente groupes doivent **tous** être présents — y compris ceux que
tu laisses en `no_rule` ou sans règle de fréquence. Une case absente se lira comme un
oubli ; une case remplie avec « pas de position, voici pourquoi » est une décision.

### Ce que tu rends en plus, dans `RECHERCHE.md`

- Ta méthode de recherche, et où tu as cherché.
- **Les trois positions dont tu es le moins sûr**, et ce qu'il faudrait pour trancher.
- Les endroits où la littérature est en désaccord avec la pratique courante des salles de
  sport — c'est là que le gérant se fera contester, et il doit être prévenu.
- Ce que tu n'as **pas** pu établir.

---

## Ce que ce prompt ne demande pas, exprès

- **Pas de doctrine « perte de gras » ou « prise de muscle » séparée.** Les six objectifs
  du produit pilotent déjà les *parts servies* ; la doctrine porte la pratique, pas
  l'objectif.
- **Pas de plan de repas ni de recettes.** C'est le générateur qui compose.
- **Pas de chiffres de résultat.** Le produit n'a aucune mesure de rétention contre témoin
  et s'interdit d'en inventer une.
