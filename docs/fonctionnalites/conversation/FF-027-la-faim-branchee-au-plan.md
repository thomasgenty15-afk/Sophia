# FF-027 · La faim branchée au plan

| | |
|---|---|
| **Identifiant** | `FF-027-la-faim-branchee-au-plan` |
| **Statut** | 🟡 Spécifiée |
| **Date** | 2026-08-08 |
| **Autorité produit** | la direction du domaine ([README](README.md)) T1, T6 · [CONTRACT.md](../../keel/CONTRACT.md) (jamais de kcal) |
| **Dépend de** | le tap du soir (`_shared/keel/daily_pulse.ts`, axe `hunger` — existe) · `_shared/keel/meal_generation.ts` (le consommateur) · [FF-021](FF-021-le-plancher-de-restriction-alimentaire.md) |
| **Effort estimé** | 1,5 jour |

---

## 1. Le problème

Quelqu'un tape « Rough → Hunger » trois soirs dans la semaine. Voilà ce qui se
passe ensuite : la ligne est écrite dans `student_daily_checkins`… et c'est
tout. En B2B, la synthèse coach la lira un jour. En B2C, **personne ne consomme
le signal** — et le plan de la semaine suivante est identique à celui qui
affamait.

C'est le cas d'école de la règle mère : une donnée collectée sans consommateur.
Deux issues : soit on coupe la question (et on perd un signal réellement
utile), soit **on la branche** — le signal de faim devient une entrée du
générateur de repas.

**Ce que ça coûte de ne pas brancher.** D'abord la donnée meurt : répondre à
une question sans conséquence, on arrête au bout de quatre soirs. Ensuite le
produit rate son levier le plus simple : quelqu'un qui a faim sur un plan de
perte de poids est quelqu'un qui va craquer, commander, puis quitter — alors
qu'un plan plus rassasiant à volume constant est exactement ce qu'un générateur
sait faire.

## 2. Job stories

> **Quand** je dis que j'ai eu faim, **je veux** que la semaine suivante ait
> réglé le problème, **pour que** répondre serve à quelque chose.

> **Quand** j'ai faim plusieurs soirs de suite, **je ne veux pas** devoir
> l'analyser moi-même et demander un changement, **pour que** le plan
> travaille à ma place.

> **Quand** je le dis en passant dans le chat (« j'ai eu trop faim
> aujourd'hui »), **je veux** que ça compte autant que le tap.

## 3. Périmètre

### Dans le périmètre

- **Deux sources**, même signal : l'axe `hunger` du tap du soir (existe), et la
  faim **déclarée spontanément** en conversation (« j'ai eu trop faim », « je
  crève la dalle tous les soirs ») — reconnue déterministiquement, comme les
  autres planchers.
- Un signal **éphémère** : fenêtre glissante (7–14 jours), il décroît, il ne
  devient jamais une mémoire durable.
- **Un seul consommateur** : à la prochaine composition, le prompt du
  générateur reçoit un bloc — « faim rapportée N soirs sur les 7 derniers
  jours → priorité satiété : portions plus généreuses, protéines, fibres,
  légumes à volonté ».
- ~~Le signal alimente aussi l'analyse de FF-028.~~ **Caduc depuis le
  2026-09-01** : [FF-028](FF-028-la-recommandation-quotidienne.md) est
  abandonnée — il n'y a plus de recommandation en plein milieu de plan. Le
  signal n'a donc qu'**un seul** consommateur, celui du dessus. Un changement
  de structure (un vrai petit-déjeuner, une collation) reste possible par deux
  chemins qui, eux, existent : le
  [retour de fin de plan](../composition-des-repas/FF-054-le-retour-de-fin-de-plan.md),
  et la [divergence constatée](FF-056-la-divergence-constatee.md) quand elle
  ouvre une proposition durable.

### Hors périmètre — engageant

- ❌ **Jamais un chiffre.** Ni kcal, ni grammes, ni « +20 % ». La satiété se
  dit en aliments et en volume, jamais en énergie (CONTRACT, non-input #4).
- ❌ **Jamais la direction inverse.** Le signal de faim ne produit **que** du
  « plus rassasiant ». Aucun chemin ne transforme « pas faim » en « moins de
  nourriture » — l'absence de faim n'est pas un signal, et un plan qu'on
  réduit automatiquement est la zone exacte du risque TCA.
- ❌ **Pas de modification de la semaine en cours.** Le signal se consomme à la
  **prochaine** composition. ⚠️ Ce no-go est désormais **sans exception** : le
  milieu de semaine n'appartient à personne depuis l'abandon de FF-028
  (2026-09-01). Il ne renvoie donc plus à un « V2+ » qui viendrait le lever.
- ❌ **Pas de mémoire durable.** « Cette personne a souvent faim » comme trait
  permanent serait faux le mois suivant — le signal décrit une fenêtre, pas
  une personne.
- ❌ **Pas de conversation sur la faim.** Le chat ne demande jamais « tu as eu
  faim ? » — il lit le tap et accueille le spontané (T3 du [README](README.md)).

## 4. Le circuit

```
   tap du soir : Rough → Hunger          « j'ai eu trop faim aujourd'hui »
        │ (existe)                              │ (plancher à construire)
        └──────────────┬────────────────────────┘
                       ▼
          SIGNAL ÉPHÉMÈRE — fenêtre 7-14 j
          (student_daily_checkins + faits de
           conversation ; décroît ; pas une mémoire)
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
  PROCHAINE COMPOSITION         ANALYSE DU SOIR (FF-028)
  bloc satiété dans le          « faim récurrente + 2 repas/j
  prompt du générateur           → proposer un petit-déj ? »
        │
        ▼
  un plan PLUS RASSASIANT
  (jamais un chiffre, jamais « moins »)
        │
        ▼
  la faim rapportée BAISSE la semaine suivante
  ← c'est LA mesure de la fiche
```

**Le point qui gouverne le dessin** : la seule direction possible est « plus
rassasiant ». La garde n'est pas une consigne de prompt — le chemin « moins »
**n'existe pas** dans le code.

## 5. Modèle de données

| Donnée | Origine | Statut |
|---|---|---|
| axe `hunger` du tap | `student_daily_checkins` | ✅ existe |
| faim déclarée en chat | plancher déterministe → un fait éphémère daté | 🔴 à construire |
| le décompte fenêtré | **dérivé** à la lecture (N sur 7-14 jours), jamais stocké comme trait | 🔴 à construire |
| le bloc satiété | dérivé au moment de la génération | 🔴 à construire |

Le décompte est **recalculé**, pas entretenu : un compteur stocké divergerait
de sa fenêtre.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Le signal a un consommateur, sinon la question meurt | c'est la raison d'être de la fiche — la règle mère du domaine ([README](README.md)) |
| **R2** | Direction unique : plus rassasiant. Le chemin inverse **n'existe pas** | « moins de nourriture » automatique est la zone TCA exacte ; une garde par construction, pas par convention |
| **R3** | Jamais un chiffre d'énergie | contrat, non-input #4, partout |
| **R4** | Éphémère : fenêtre glissante, décroissance, pas un trait | « a souvent faim » comme trait permanent serait faux le mois suivant |
| **R5** | Sous plancher de restriction : le signal s'enregistre, la satiété s'applique, **rien ne s'affiche** | plus rassasiant est protecteur — c'est la seule adaptation compatible avec le plancher ; mais aucun message n'en parle |
| **R6** | La reconnaissance du spontané est déterministe, deux langues | même règle que tous les planchers ; le dispatcher seul = un tirage |
| **R7** | La mesure de succès est la **décroissance de la faim rapportée** | un bloc dans un prompt ne prouve rien ; seule la semaine suivante prouve |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Aucun signal sur la fenêtre | aucun bloc — le générateur compose comme aujourd'hui |
| Un seul soir de faim isolé | pas de bloc (seuil : la récurrence, pas l'occurrence) |
| « J'ai faim » au présent, à 18 h | ce n'est pas un signal de fenêtre, c'est une conversation — FF-023 répond, rien ne s'écrit ou un fait daté au plus |
| « Mon fils a eu faim » | désarme tiers — comme tous les planchers |
| Signal présent mais génération inchangée | le zéro de R7 ; la mesure §10 le rend visible |
| Plancher de restriction levé | R5 — appliqué en silence, jamais affiché ni commenté |

## 8. Critères d'acceptation

```gherkin
Étant donné trois taps « Rough → Hunger » sur la semaine
Quand la semaine suivante est composée
Alors le prompt du générateur porte le bloc satiété
Et le plan produit est visiblement plus rassasiant (volume, protéines, fibres)

Étant donné « j'ai eu trop faim ces derniers jours » dit en conversation
Quand la boucle se déroule
Alors le signal compte comme un tap
Et en anglais aussi

Étant donné aucun signal de faim sur la fenêtre
Quand la semaine est composée
Alors aucun bloc satiété n'apparaît

Étant donné un unique soir de faim il y a dix jours
Quand la semaine est composée
Alors aucun bloc — la fenêtre et le seuil tiennent

Étant donné un élève sous plancher de restriction
Quand son plan est composé avec un signal de faim
Alors la satiété s'applique
Et aucun message n'en parle, aucun chiffre ne sort

Étant donné n'importe quel chemin de cette fiche
Quand on cherche un chiffre de kcal dans ce qui est visible
Alors il n'y en a aucun
```

## 9. Rabbit holes

- **La symétrie tentante.** « S'il a faim on augmente, s'il n'a pas faim on
  diminue » — la seconde moitié est interdite par construction (R2). Quelqu'un
  la proposera ; la réponse est dans cette fiche.
- **Le trait de personnalité.** Transformer la fenêtre en « profil gros
  mangeur » — c'est faux, stigmatisant, et durable là où le signal est
  éphémère.
- **La sur-réaction.** Un soir de faim → un plan bouleversé. Le seuil de
  récurrence est la parade ; il se règle avec des données, pas à l'intuition.
- **Le chiffre qui revient par la satiété.** « Ajoute 150 g de légumes » dans
  le prompt va bien ; « vise 400 kcal de plus » jamais — même dans le prompt,
  parce que ce qui entre dans un prompt finit par sortir dans un texte.

## 10. Ce qu'on mesure

- Part des compositions qui ont consommé un signal de faim
- **La faim rapportée à S+1 après une adaptation** — LA mesure : si elle ne
  baisse pas, le bloc satiété ne marche pas
- Taux de réponse au tap du soir (doit **monter** : répondre sert enfin à
  quelque chose)

**Contre-mesure.** Les plans qui gonflent sans fin : une personne qui rapporte
de la faim chaque semaine ferait grossir le plan indéfiniment. Le bloc satiété
plafonne (volume et composition, pas escalade), et une faim qui persiste malgré
deux adaptations est un signal pour FF-028 (proposer un changement de
structure) — pas pour un troisième agrandissement.

## 11. Questions ouvertes

- Le seuil exact de récurrence (2 sur 7 ? 3 sur 7 ?) — à calibrer sur les
  premières données réelles, constante exportée et testée.
- La fenêtre (7 ou 14 jours) — même méthode.
- Le tap du soir survit en B2C **grâce à** ce branchement (il a enfin un
  consommateur) ; sa cadence exacte après le retrait des comportements est
  arbitrée dans le chantier de retrait, pas ici.
