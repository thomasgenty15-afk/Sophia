# Retrait des résidus grand public

> **Ceci n'est pas une fiche de fonctionnalité** — voir l'encadré de
> [RETRAIT-CARTE-DE-DEFENSE.md](RETRAIT-CARTE-DE-DEFENSE.md), même raison.
> Ce document a porté l'identifiant `FF-015` le 2026-08-07 ; l'identifiant est
> **brûlé** et ne sera jamais réattribué.

| | |
|---|---|
| **État** | 🟡 inventaire mesuré, **deux verdicts rendus**, retraits non commencés |
| **Date** | 2026-08-07 |
| **Autorité** | [MODEL.md](MODEL.md) |
| **Précédent** | [RETRAIT-CARTE-DE-DEFENSE.md](RETRAIT-CARTE-DE-DEFENSE.md) — même méthode, éprouvée d'abord sur un cas simple |
| **Effort estimé** | 3 à 5 jours, par lots (un commit par concept) |

---

## 1. Le problème

Le chat porte encore, **câblé et chargé à chaque tour**, un pan entier de
l'ancien produit grand public. Ce n'est pas une impression : c'est une mesure.
Les tables que `sophia-brain` interroge, hors KEEL et hors infrastructure :

| Table | Lectures | Concept |
|---|---|---|
| `user_plan_item_entries` | 8 | plans d'action |
| `user_plan_items` | 6 | plans d'action |
| `user_transformations` | 4 | transformations |
| `user_victory_ledger` | 3 | victoires |
| `user_metrics` | 2 | métriques personnelles |
| `user_recurring_reminders` | 2 | rappels récurrents |
| `planned_deviations` | 2 | écarts planifiés |
| `user_metric_entries` | 1 | métriques personnelles |
| `user_habit_week_plans` | 1 | habitudes |
| `user_habit_week_occurrences` | 1 | habitudes |
| `user_cycles` | 1 | cycles |
| `user_attack_cards` | 1 | cartes d'attaque |
| `user_architect_wishes` / `_stories` / `_reflections` | 3 | l'architecte |
| `user_potion_sessions` | 1 | potions |

### Verdicts déjà rendus — 2026-08-07

| Concept | Verdict | Preuve |
|---|---|---|
| `planned_deviations` | 🟢 **GARDÉ — vivant dans KEEL** | `evaluate-adherence-v1/index.ts:170` · `keel-cards-v1/index.ts:410` · `frontend/src/keel/pages/CoachStudentPage.tsx:224`. **Le piège n°1 de ce chantier** : la table figurait à l'inventaire et aurait été supprimée à tort |
| Les **cartes KEEL** (attaque/défense nutrition) | 🔴 **À RETIRER — lot 1** | route `/app/cards` démontée (`App.tsx:191`), cron débranché par `20260803030000_pivot_disable_b2c_crons.sql` (« `keel-cards-v1` est débranchée avec son cron »). Surface : `keel-cards-v1/` · `CardsPage.tsx` · `keel/api/cards.ts` · `card_templates` · `supabase/tests/keel/card_render_test.sql` · `20260727230000_keel_cards.sql`. ⚠️ nommée aussi dans `scripts/ci/wiring-check.mjs` et `frontend/src/edge/coverage-guard.int.test.ts` |

`plan_snapshot_runtime.ts` projette encore `user_plan_items` — une table avec un
compteur `current_reps` incrémental, un `mission_days` en français, et un statut
qui ne dit pas ce qui a été fait. `keel_plan_context.ts` dit déjà pourquoi c'est
dangereux de garder les deux : *« two plan blocks in one prompt is how a model
gets to pick the more flattering one »*.

**Ce que ça coûte.** Trois coûts, tous payés à chaque tour :

1. **Du budget de prompt.** Le compagnon tronque **par la queue** à 8 000 tokens,
   et le dépôt a déjà mesuré un bloc mémoire mort de cette façon. FF-010, FF-011
   et FF-013 veulent tous pousser de la matière dans ce même prompt.
2. **De la confusion de modèle.** Deux projections de plan, deux vocabulaires de
   progression, deux notions de victoire.
3. **Du temps humain.** Chaque chantier sur le chat traverse ces chemins et doit
   d'abord établir s'ils sont vivants.

## 2. Job stories

> **Quand** je discute avec l'agent de mon coach, **je veux** qu'il ne me parle
> que de ce que mon coach a écrit, **pour que** sa voix reste la sienne.

> **Quand** j'ajoute de la matière au prompt du chat, **je veux** que la place
> soit occupée par ce qui sert, **pour que** le bloc doctrine ne meure pas par
> la queue.

> **Quand** je lis le routeur, **je veux** savoir ce qui est vivant, **pour
> que** je n'aie pas à le prouver à chaque fois.

## 3. Périmètre

### Dans le périmètre

- Rendre un **verdict écrit** sur chaque ligne du tableau ci-dessus : retiré, ou
  gardé exprès avec sa raison.
- Retirer, par lots indépendants et prouvés, ce qui est verdicté « retiré » :
  chargeurs, blocs de prompt, types, outils toujours-actifs, tests.
- Consigner ce qui est **gardé exprès** là où un lecteur le trouvera — la
  chaîne 1:1 (`plan_versions`, `/coach/import`, `/coach/templates`) est gardée
  volontairement et CLAUDE.md le dit déjà.

### Hors périmètre — engageant

- ❌ **Aucune suppression sans preuve d'absence.** Même méthode que pour la carte de défense :
  appelants (commentaires **retirés** du grep), crons, écrans, et l'autre projet
  Supabase pour ce qui ne se prouve pas d'ici.
- ❌ **On ne supprime pas la chaîne 1:1.** Elle est gardée exprès — c'est le mode
  1:1, ce n'est pas le modèle. La confondre avec un résidu est l'erreur que
  CLAUDE.md anticipe nommément.
- ❌ **On ne touche pas à l'infrastructure partagée.** `scheduled_checkins`,
  `pending_actions`, `chat_messages`, `user_chat_states`,
  `system_runtime_snapshots`, `memory_items` portent le chat lui-même.
- ❌ **Pas de gros lot.** Un diff de quinze tables est un diff que personne ne
  relit, et une preuve d'absence qu'on ne peut plus refaire.
- ❌ **Aucun déploiement seul.** `db push` reste une commande à validation
  humaine.
- ❌ **Les gardes écrites à cause de ces concepts survivent.** Comme pour la carte de défense,
  elles protègent contre une classe de défaut, pas contre un nom.

## 4. Le circuit

```
  Pour CHAQUE concept, dans cet ordre, et jamais deux en parallèle :

  ① VERDICT ÉCRIT      retiré | gardé exprès (+ la raison, dans le dépôt)
        │
        ▼
  ② PREUVES D'ABSENCE  · appelants réels (commentaires RETIRÉS du grep)
     bloquantes        · crons: select from cron.job
                       · écrans et routes
                       · prosrc des fonctions + définitions de vues
                       · l'autre projet Supabase → confirmation humaine
        │
        │  une preuve échoue ──► ON S'ARRÊTE. Le concept reste, le verdict
        │                        devient « gardé », avec sa raison.
        ▼
  ③ RETRAIT            code → prompt → types → tests → données
        │
        ▼
  ④ PREUVE FINALE      grep, prosrc, vues · suite complète · budget de prompt
        │
        ▼
  ⑤ UN COMMIT PAR CONCEPT
```

**Le point qui gouverne le dessin** : un lot par concept. Ce qui rend une
suppression relisible, c'est qu'on puisse rejouer sa preuve d'absence six mois
plus tard sur un diff qui ne parle que d'elle.

## 5. Modèle de données

Suppression, par lots. Chaque migration porte **dans son en-tête** les preuves
qui l'autorisent — la migration de la carte de défense est le gabarit : quatre preuves
numérotées, dont une confirmation humaine datée pour ce qui ne se prouve pas
depuis le dépôt.

Les tables gardées exprès reçoivent un `comment on table` qui dit **pourquoi**.
Une contrainte documentée survit à sa cause ; une table gardée sans raison
écrite sera re-proposée à la suppression dans six mois — ou supprimée à tort.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Un verdict écrit **avant** toute suppression | « ce n'est plus utilisé » n'est pas un verdict, c'est une impression |
| **R2** | Preuves d'absence bloquantes | mémoire `verify-before-delete` |
| **R3** | Le grep d'appelants **retire les commentaires** | sinon il compte des faux vivants |
| **R4** | Trois épreuves : code, `prosrc`, vues | un nom survit dans le corps d'une fonction SQL, invisible au grep applicatif |
| **R5** | Un lot = un concept = un commit | c'est ce qui rend la preuve rejouable |
| **R6** | Ce qui est gardé exprès porte sa raison **dans le dépôt** | sinon la décision se reperd |
| **R7** | Les gardes survivent aux concepts | elles protègent contre une classe de défaut |
| **R8** | Le budget de prompt est mesuré **avant et après** chaque lot | c'est le bénéfice principal ; non mesuré, il est invérifiable |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Une preuve d'absence échoue | le concept **reste**, le verdict devient « gardé exprès », avec sa raison. Ce n'est pas un échec du chantier |
| Un chemin KEEL s'appuie sur un résidu | verdict « gardé », et une ligne dans le dépôt qui dit qui l'utilise |
| Un test devient rouge | on s'arrête sur ce lot. Les autres lots sont indépendants par construction |
| Un concept a des liens de base vers un autre | les deux se retirent dans **un seul** lot, ou aucun. Un `on delete cascade` traversé sans le savoir supprime plus que prévu |
| Le budget de prompt ne baisse pas | le lot n'a rien libéré : il faut le dire, pas le supposer |

## 8. Critères d'acceptation

```gherkin
Étant donné le tableau d'inventaire
Quand le chantier commence
Alors chaque ligne porte un verdict écrit et daté

Étant donné un concept verdicté « retiré »
Quand on cherche ses appelants, commentaires exclus
Alors il n'en reste aucun

Étant donné un concept verdicté « retiré »
Quand on cherche dans prosrc et dans les définitions de vues
Alors il n'apparaît nulle part

Étant donné un lot retiré
Quand on exécute la suite complète
Alors aucun rouge nouveau n'apparaît

Étant donné un lot retiré
Quand on mesure le contexte assemblé d'un tour type
Alors il est strictement plus court qu'avant le lot

Étant donné un concept verdicté « gardé exprès »
Quand un lecteur ouvre la table ou le module
Alors il y trouve la raison, sans avoir à la reconstituer

Étant donné la chaîne 1:1 (plan_versions, /coach/import, /coach/templates)
Quand le chantier se termine
Alors elle est intacte
```

## 9. Rabbit holes

- **Confondre « gardé exprès » et « résidu ».** C'est l'erreur que CLAUDE.md
  anticipe nommément pour la chaîne 1:1. Le verdict écrit est la parade.
- **Le lot qui grossit.** « Pendant qu'on y est » transforme quatre suppressions
  prouvées en un diff illisible.
- **Les cascades.** Ces tables ont des liens entre elles ; retirer l'une peut en
  vider une autre par `on delete cascade`, sans erreur et sans bruit.
- **Les privilèges par défaut.** Toute table de ce dépôt donne tout à
  `authenticated`, et `revoke from public` laisse `anon`. Une suppression qui
  s'arrête à mi-chemin laisse une table orpheline grande ouverte.
- **Croire que le prompt maigrit tout seul.** Un chargeur retiré dont le bloc de
  prompt reste, c'est un bloc vide qui coûte encore ses lignes. La mesure
  avant/après est ce qui l'attrape.

## 10. Ce qu'on mesure

- Lignes du tableau avec un verdict écrit : **toutes**, avant le premier retrait
- Longueur du contexte assemblé sur un tour type, **avant et après chaque lot**
- Rouges nouveaux : **zéro**, par lot

**Contre-mesure.** Le nombre de retraits qu'il faut annuler. Un seul suffit à
prouver que la méthode de preuve était trop lâche — et c'est plus important à
savoir que le nombre de tables gagnées.

## 11. Questions ouvertes

- `user_attack_cards` et `user_potion_sessions` ont reçu du travail **récent**
  (mots-clés d'attaque câblés, sas d'admission des potions) qui n'est pas
  déployé. Résidus ou chantiers en pause ? Le verdict demande une décision
  humaine, pas une lecture de code.
- `planned_deviations` ressemble beaucoup à ce que la fiche « le repas hors plan » construit sous un
  autre nom. À regarder **avant** de la construire, pas après.
- `user_recurring_reminders` : les rappels sont une commodité réelle. Le verdict
  n'est pas évident, et la question est produit, pas technique.
