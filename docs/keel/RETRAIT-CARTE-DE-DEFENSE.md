# Retrait de la carte de défense

> **Ceci n'est pas une fiche de fonctionnalité.** Un retrait n'est pas une
> fonctionnalité : il n'a ni utilisateur, ni job story durable, ni métrique de
> succès au-delà de « zéro ». Ce document vit donc ici et pas dans
> `docs/fonctionnalites/` — c'est un chantier, et le dossier des fiches n'est
> pas un backlog.
>
> Il a porté l'identifiant `FF-014` pendant quelques heures le 2026-08-07.
> L'identifiant est **brûlé** et ne sera jamais réattribué.

| | |
|---|---|
| **État** | 🟠 retrait **commité** (`12490c03`), **non déployé** |
| **Date** | 2026-08-07 |
| **Autorité** | [MODEL.md](MODEL.md) |
| **Migration** | `20260808030000_drop_defense_card.sql` — écrite, **pas poussée** |
| **Reste à faire** | `npx supabase db push` par une main humaine. **Rien d'autre.** |

> **Vérifié le 2026-08-07, après commit.** Zéro référence exécutable dans
> `supabase/` et `frontend/`. Les occurrences restantes sont, et doivent rester :
> les **commentaires des gardes survivantes** (`response_visibility_formatting.ts`,
> `active_flow_state.ts`, `llm-usage.ts`), l'historique (`migrations_archive/`,
> schéma squashé) et la migration de retrait elle-même.
>
> **Le voisin n'est pas parti** : les *cartes KEEL* (`keel-cards-v1`,
> `CardsPage.tsx`, `keel/api/cards.ts`, `card_templates`,
> `supabase/tests/keel/card_render_test.sql`) sont un concept distinct, route
> démontée et cron débranché, **toujours dans le dépôt**. Elles sont le lot 1 de
> [RETRAIT-RESIDUS-GRAND-PUBLIC.md](RETRAIT-RESIDUS-GRAND-PUBLIC.md).

---

## 1. Le problème

La carte de défense — pulsions dominantes, déclencheurs, réponses de défense —
est une surface de **thérapie comportementale du produit grand public**. Elle
n'a aucun rôle en nutrition : ni le coach, ni l'élève, ni aucune boucle KEEL ne
la lit ou ne l'écrit.

Elle traversait pourtant encore le chat : le `defense_card_watcher`, le
formatage de visibilité, le `__active_defense_card_handoff` du flow actif, les
prompts de génération et d'enrichissement.

**Ce que ça coûte.** Un mort qui traverse le routeur n'est pas neutre. Il a déjà
produit un défaut visible — une liste `defense_card` confabulée **en texte
visible** par le composeur, contre laquelle il a fallu écrire une garde
(`response_visibility_formatting.ts`). Chaque chantier sur le chat le croise, le
lit, se demande s'il est vivant, et paie l'hésitation.

## 2. Job stories

> **Quand** je discute nutrition avec l'agent de mon coach, **je ne veux pas**
> qu'il me parle de pulsions et de déclencheurs, **pour que** je ne me demande
> pas dans quelle app je suis.

> **Quand** je touche au routeur du chat, **je veux** que ce que j'y lis soit
> vivant, **pour que** je n'aie pas à prouver l'inverse avant chaque
> modification.

## 3. Périmètre

### Dans le périmètre

- Retrait du code : `defense_card_watcher.ts`, `v2-defense-card-enrichment.ts`,
  `v2-prompts/defense-card.ts`, `exportDefenseCard.ts`, la branche de détection
  du watcher, le handoff dans `active_flow_state.ts`, les types et scripts QA.
- Retrait des données : `20260808030000_drop_defense_card.sql`.
- Retrait de la surface : `/app/cards` redirige déjà vers `/app/today`.

### Hors périmètre — engageant

- ❌ **On ne touche pas aux gardes écrites à cause d'elle.** La garde de
  `response_visibility_formatting.ts` a été posée parce qu'un composeur avait
  sorti une liste `defense_card` en texte visible. Le concept part, la garde
  reste : elle protège contre une classe de défaut, pas contre un nom.
- ❌ **On ne supprime pas les autres résidus grand public au passage.** Ils ont
  leur propre document ([RETRAIT-RESIDUS-GRAND-PUBLIC.md](RETRAIT-RESIDUS-GRAND-PUBLIC.md))
  et leurs propres preuves d'absence. Une suppression qui en profite pour en
  faire une autre est une suppression qu'on ne peut plus relire.
- ❌ **Rien n'est déployé sans validation humaine.** `supabase db push` est une
  commande à risque : elle est donnée à copier-coller, jamais exécutée seule.

## 4. Le circuit

```
   PREUVES D'ABSENCE (étape 0, bloquante)
   ──────────────────────────────────────
   1. aucun cron ne l'alimente
      → trigger-watcher-batch déprogrammé par 20260803030000
      → select from cron.job where command ilike '%watcher%'  → 0 ligne  ✅
   2. le code était déjà à moitié débranché
      → maybeLogDefenseCardWinParallel: AUCUN appelant
      → v2-prompts/defense-card.ts, v2-defense-card-enrichment.ts,
        exportDefenseCard.ts: AUCUN importeur                            ✅
   3. l'écran est démonté (/app/cards → /app/today)                      ✅
   4. l'AUTRE projet Supabase — ce qui ne se prouve pas d'ici —
      confirmation humaine explicite, 2026-08-07                         ✅
                    │
                    ▼
   RETRAIT  code → données → surface
                    │
                    ▼
   PREUVE D'ABSENCE FINALE
   grep, prosrc des fonctions, définitions de vues
   (renommer/supprimer demande trois épreuves, pas une)
```

## 5. Modèle de données

Suppression. `20260808030000_drop_defense_card.sql` retire les tables du concept.
Aucune donnée KEEL n'y fait référence : c'est ce qu'établit l'étape 0.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Les preuves d'absence sont **bloquantes** et viennent **avant** | mémoire `verify-before-delete` : une suppression legacy se prouve, elle ne se suppose pas |
| **R2** | Un audit d'appelants **retire les commentaires** avant de conclure | un `grep` naïf compte les mentions en commentaire comme des appelants vivants |
| **R3** | Une suppression se prouve sur **trois surfaces** : code, `prosrc` des fonctions, définitions de vues | un nom peut survivre dans le corps d'une fonction SQL ou d'une vue, invisible au grep du code applicatif |
| **R4** | Les gardes écrites à cause du concept **survivent** au concept | elles protègent contre une classe de défaut. Les retirer avec lui rouvrirait la porte sous un autre nom |
| **R5** | Aucun déploiement sans validation humaine | `db push` est une commande à risque, listée dans AGENTS.md |
| **R6** | Ce qui ne se prouve pas depuis ce dépôt se fait **confirmer** | l'autre projet Supabase existe ; on ne conclut pas sur ce qu'on ne peut pas lire |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Une preuve d'absence échoue | **on s'arrête**. On ne supprime pas « en attendant » |
| Un appelant apparaît après coup | la migration est réversible tant qu'elle n'est pas poussée ; c'est la raison pour laquelle le commit et le push sont deux gestes distincts |
| Un test référence le concept | il est retiré avec lui — sauf s'il teste une garde qui survit (R4), auquel cas il est **renommé**, pas supprimé |
| L'autre projet en avait besoin | c'est précisément ce que couvre la confirmation humaine du 2026-08-07 |

## 8. Critères d'acceptation

```gherkin
Étant donné le dépôt après retrait
Quand on cherche « defense_card » dans le code applicatif
Alors il ne reste aucune référence exécutable
Et les seules occurrences restantes sont des commentaires historiques assumés

Étant donné le dépôt après retrait
Quand on cherche le concept dans prosrc et dans les définitions de vues
Alors il n'apparaît nulle part

Étant donné la suite de tests complète
Quand on l'exécute après retrait
Alors aucun rouge nouveau n'apparaît

Étant donné la garde de formatage de visibilité
Quand on relit le code après retrait
Alors elle est toujours en place et toujours testée

Étant donné un tour de conversation ordinaire
Quand on lit le contexte assemblé
Alors il ne contient aucune trace du concept
```

## 9. Rabbit holes

- **Le grep qui compte les commentaires.** Le dépôt a déjà payé ça : un audit
  d'appelants naïf déclare vivants des modules dont seules des mentions en
  commentaire subsistent.
- **La garde jetée avec le concept.** Elle porte le nom du concept dans son
  commentaire ; c'est ce qui la fera supprimer par erreur.
- **Les trois épreuves d'absence.** Code, `prosrc`, vues. Deux sur trois, c'est
  zéro.
- **Le voisinage.** Le retrait croise en permanence les autres résidus grand
  public. La tentation de « pendant qu'on y est » rend le diff illisible et la
  preuve d'absence impossible à refaire.

## 10. Ce qu'on mesure

- Références restantes dans le code exécutable : **zéro**
- Rouges nouveaux dans la suite : **zéro**
- Lignes de contexte assemblées par tour (attendu : en baisse)

**Contre-mesure.** Un incident en production imputable au retrait. Il n'y en a
aucun de prévisible — c'est justement ce qu'établissent les quatre preuves — mais
c'est la seule chose qui rendrait le retrait mauvais, et elle mérite d'être
nommée plutôt que supposée impossible.

## 11. Questions ouvertes

- Le retrait est **fait mais non commité**. Reste : la relecture du diff, le
  commit, puis `npx supabase db push` par une main humaine.
