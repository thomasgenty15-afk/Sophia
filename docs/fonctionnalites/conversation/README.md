# conversation

Le dialogue et sa mémoire. Le cerveau, les compétences, le routage, la mémoire
longue et sa consolidation.

`sophia-brain` · `chat-inbound-v1` · `trigger-memorizer-daily` ·
`trigger-topic-compaction` · `promote-candidate-memory-items` · `ChatPage`

---

## La direction — arrêtée le 2026-08-08

> **On ne collecte une donnée que si quelque chose en aval la consomme** — le
> plan, une ceinture de sécurité, ou le coach. Une question dont la réponse ne
> change rien est de la charge mentale déguisée en attention.

C'est la règle mère. Tout ce dossier en découle, et chaque fiche y renvoie.

### Ce que le chat est, et ce qu'il n'est pas

La valeur qui retient les gens, c'est **la logistique des repas** — composer,
acheter, cuisiner. Le chat n'est pas le cœur de la valeur : il est **la porte
par laquelle la réalité rentre dans le plan**, et l'endroit où on obtient une
réponse juste en deux secondes. Peu de messages, chacun à fort levier.

Le chat faisait trois métiers, et deux étaient faux : il portait le produit
grand public (en cours de retrait), il était un **instrument de collecte**, et
il dérivait vers le **coaching de vie** — des questions d'état quotidien dont
personne ne consommait la réponse.

Le seul « coaching » que ce produit garde est celui dont la sortie change le
**plan** (FF-028) ou applique une **pratique prescrite** (FF-029). Un vrai
coach observe et propose ; il ne fait pas remplir des questionnaires.

**Ce que ça coûte de se tromper.** Un chat qui collecte fatigue et se fait
couper. Un chat qui questionne sans conséquence apprend qu'écrire ne sert à
rien. Dans les deux cas la porte se ferme — et un plan sans porte vers la
réalité meurt en silence.

### Le circuit d'ensemble

```
                     un message arrive
                            │
              ┌─────────────┴─────────────┐
              │  une compétence le        │
              │  réclame-t-elle ?         │
              └─────────────┬─────────────┘
                  oui       │        non
        ┌───────────────────┘         └──────────────┐
        ▼                                            ▼
  ┌───────────────┐                        ┌──────────────────┐
  │ crise (12)    │                        │ LA CONVERSATION  │
  │ plancher TCA  │                        │ NORMALE (14)     │
  │ question (1)  │                        │ — par défaut     │
  └───────────────┘                        └──────────────────┘
        │                                            │
        └─────────────┬──────────────────────────────┘
                      ▼
        ┌─────────────────────────────────────┐
        │  LES PLANCHERS DÉTERMINISTES        │  ← avant le modèle, jamais après
        │  repas déclaré (3) · hors plan (5)  │
        │  poids (7) · préférence (8)         │
        │  faim (9)                           │
        └─────────────────────────────────────┘
                      │
                      ▼
              la réponse sort, vérifiée
              contre la doctrine — et elle peut
              porter UNE chose au maximum :
              invitation photo (6), question
              d'approfondissement (3), pratique (11)
              ou recommandation (10)
```

**Les deux points qui gouvernent le dessin** : la reconnaissance d'un fait ne
se confie jamais au modèle — elle est déterministe et passe avant lui. Et le
chat ne porte jamais plus d'**une** demande par jour, toutes surfaces
confondues.

### Les règles transverses

| # | Règle | Pourquoi |
|---|---|---|
| **T1** | On ne collecte que ce qu'un aval consomme | la règle mère — tout le tri du 2026-08-08 en découle |
| **T2** | Un fait se reconnaît **déterministiquement**, jamais par le modèle | mesuré : la même déclaration parfaite était enregistrée une fois sur deux en français et **jamais** en anglais |
| **T3** | Le chat n'initie jamais une collecte | la différence entre une app de conseil et une app de surveillance |
| **T4** | Une seule demande par jour, toutes surfaces confondues | le budget est **partagé** entre approfondissement (FF-017), invitation photo (FF-025) et recommandation (FF-028). Trois compteurs séparés = trois demandes = un interrogatoire |
| **T5** | Toute demande est adossée à un fait que la personne **vient de donner** | c'est ce qui distingue approfondir de réclamer |
| **T6** | Ce qui est donné doit se voir dans le **plan suivant** | la boucle fermée est ce qui fait qu'on continue de parler |
| **T7** | Les planchers de sécurité priment sur tout | crise, TCA — hors débat, hors liste de valeur |
| **T8** | Le coach ne lit jamais le contenu des conversations | il voit le dernier contact et sa date |
| **T9** | Toute garde est testée dans **les deux langues** | la cicatrice `guard-tested-in-one-language-only` |

### Hors périmètre — engageant

- ❌ **La sollicitation alimentaire.** Jamais « t'as mangé quoi ? ».
- ❌ **Le « comment tu te sens ? » quotidien.** Le message du soir garde le
  **fait** ; il perd la question systématique. Personne ne consommait la
  réponse.
- ❌ **Les 6 axes du dimanche, en B2C.** Ils deviennent **B2B-only** — la
  synthèse coach les lit. Le point hebdo B2C se réduit à poids et tour de
  taille.
- ❌ **Le coaching de vie.** Pas de check émotionnel, pas de questionnaire de
  bien-être.
- ❌ **Aucun score, aucune série, aucun compte fondu.** Une coche est exacte,
  une photo est incertaine, une déclaration est autre chose.
- ❌ **Aucune coche automatique.** Rien n'est inféré d'un silence.

Le détail des retraits de comportement (plafond 2→1, rythme de question du
compagnon, réduction du point hebdo) est un chantier à part :
`scratchpad/PROMPT-RETRAIT-COMPORTEMENTS-CHAT.md`.

---

## Les 14 fonctionnalités

**Le service du plan** — *la raison d'ouvrir le chat*

| # | ID | Fiche | Statut |
|---|---|---|---|
| 1 | [FF-016](FF-016-la-question-d-alimentation.md) | La question d'alimentation | 🟠 En cours |
| 2 | [FF-010](FF-010-la-lecture-du-foyer.md) | La lecture du foyer | 🟡 Spécifiée |

**L'accueil de la réalité** — *ce qui empêche le plan de mourir en silence*

| # | ID | Fiche | Statut |
|---|---|---|---|
| 3 | [FF-017](FF-017-le-repas-declare.md) | Le repas déclaré | 🟠 En cours |
| 4 | [FF-018](FF-018-la-photo-de-repas.md) | La photo de repas | 🟠 En cours |
| 5 | [FF-009](FF-009-le-repas-hors-plan.md) | Le repas hors plan | 🟡 Spécifiée |
| 6 | [FF-025](FF-025-l-invitation-a-la-photo.md) | L'invitation à la photo | 🟡 Spécifiée |
| 7 | [FF-008](FF-008-le-poids-annonce.md) | Le poids annoncé | 🟡 Spécifiée |

**Ce qui nourrit les prochaines semaines** — *la boucle qui fait sentir qu'on est écouté*

| # | ID | Fiche | Statut |
|---|---|---|---|
| 8 | [FF-026](FF-026-la-preference-captee.md) | La préférence captée | 🟠 En cours |
| 9 | [FF-027](FF-027-la-faim-branchee-au-plan.md) | La faim branchée au plan | 🟡 Spécifiée |
| 10 | [FF-028](FF-028-la-recommandation-quotidienne.md) | La recommandation quotidienne | 🟡 Spécifiée (V1) |
| 11 | [FF-029](FF-029-les-pratiques-quotidiennes.md) | Les pratiques quotidiennes | 🟠 En cours |

**L'humain** — *rare, mais ce qui fait confiance*

| # | ID | Fiche | Statut |
|---|---|---|---|
| 12 | [FF-020](FF-020-l-accompagnement-de-crise.md) | L'accompagnement de crise | 🟢 Livrée |
| 13 | [FF-011](FF-011-le-soutien-grounde.md) | Le soutien groundé | 🟡 Spécifiée |
| 14 | [FF-023](FF-023-la-conversation-normale.md) | La conversation normale | 🟠 En cours |

## Le plancher

[FF-021 · Le plancher de restriction alimentaire](FF-021-le-plancher-de-restriction-alimentaire.md)
(🟢) n'est **pas** une fonctionnalité de valeur — c'est une ceinture, et elle
reste quoi qu'on décide. Elle est listée à part exprès : la mettre dans la
liste de valeur inviterait un jour à l'y arbitrer.

## L'ordre de construction

1. **FF-008** (sécurité — le poids arme la ceinture) puis **FF-009** :
   l'accueil d'abord.
2. Le **retrait des comportements**, puis **FF-017** (qui en dépend pour son
   plafond) et **FF-025**.
3. **FF-023** (la continuité — le trou `history: []`) : préalable de toute
   humanité perçue.
4. **FF-026 → FF-027 → FF-028** dans cet ordre : la recommandation consomme
   les deux premiers.
5. **FF-016** (les recommandés), **FF-010**, **FF-011**, **FF-029** :
   indépendants — FF-010/FF-011/FF-016/FF-023 partagent le budget de prompt et
   se relisent ensemble.

Le retrait passe **après** que l'accueil (1) existe : retirer la demande avant
de savoir accueillir, c'est perdre la donnée deux fois.

## Identifiants brûlés

Un identifiant ne se réutilise **jamais**, y compris quand la fiche disparaît.

| ID | Sort | Où est allé le contenu |
|---|---|---|
| `FF-007` | brûlé (2026-08-08) | « ce que le chat permet » n'est pas une fonctionnalité : c'est la direction, et elle vit dans ce README |
| `FF-012` | brûlé (2026-08-08) | la fin de la sollicitation → le chantier de retrait + « hors périmètre » ci-dessus |
| `FF-013` | brûlé (2026-08-08) | lire au lieu de redemander → FF-023 R2 + FF-027 ; les 6 axes → B2B-only |
| `FF-014` / `FF-015` | brûlés (2026-08-07) | retraits de code → [RETRAIT-CARTE-DE-DEFENSE.md](../../keel/RETRAIT-CARTE-DE-DEFENSE.md) · [RETRAIT-RESIDUS-GRAND-PUBLIC.md](../../keel/RETRAIT-RESIDUS-GRAND-PUBLIC.md) |
| `FF-019` | brûlé (2026-08-08) | la question de précision → absorbée par FF-017 §3 : c'est un approfondissement du repas déclaré, pas une fonctionnalité |
| `FF-022` | brûlé (2026-08-08) | la reprise après absence → fiche rétroactive retirée au tri de valeur ; le code (`reengagement*.ts`) reste l'autorité, une fiche se réécrira **quand on y retouchera** |
| `FF-024` | brûlé (2026-08-08) | le message du soir n'est pas une fonctionnalité, c'est **le véhicule** de FF-028 et FF-029 ; ses ceintures (« le fait est le compliment ») vivent dans `daily_recap.ts`, partagées par FF-011 |

Renommages **sans** changement d'identifiant :
`FF-016-la-question-de-plan` → `FF-016-la-question-d-alimentation` ·
`FF-023-le-compagnon` → `FF-023-la-conversation-normale` (2026-08-08,
périmètres élargis).
