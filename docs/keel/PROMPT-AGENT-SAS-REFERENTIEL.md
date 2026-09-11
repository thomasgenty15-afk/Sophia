# Mission — un aliment inconnu doit entrer UNE fois, dans les deux langues, et servir tout de suite

> Autorité du mécanisme : `supabase/migrations/20260821030000_le_sas_des_aliments_inconnus.sql`
> Module : `supabase/functions/_shared/keel/composition_fill.ts` (+ `_io.ts`)

## L'objectif, en une phrase

Quand une génération rencontre un aliment que `food_composition_refs` ne connaît
pas, l'appel de secours doit produire **un seul aliment**, atteignable **par son
nom français ET par son nom anglais**, utilisable **immédiatement** par le plan
en cours **et** par tous les suivants — sans repayer l'appel.

---

## Ce qui existe déjà. Ne le réécris pas, branche-le.

| | |
|---|---|
| `repairPlanComposition` (`composition_fill_io.ts:355`) | demande les inconnus au modèle (`gpt-5.4-nano`) ou les dérive des bornes du groupe |
| `withFilledRefs` (`composition_fill.ts:689`) | **augmente l'index en vol** — le plan en cours est déjà pesé avec la valeur |
| `food_composition_pending` | le sas : `term, food_group_ref, label, energy_kcal, protein_g, carbs_g, fat_g, fiber_g, yield_class, fill_source, sightings, status, review_reason, promoted_at` |
| `promote_pending_food_compositions(p_min_sightings = 3, p_dry_run = false)` | la promotion vers `food_composition_refs`, **hors chemin chaud** |
| `loadPendingGroups` | relit le sas — mais **le groupe seulement**, jamais la valeur |
| `pg_cron` | installé, aucun job planifié |

---

## Le défaut, mesuré le 2026-09-10 sur 291 lignes de sas

**Chaque forme de surface devient son propre aliment.** Extrait réel :

```
puree d'amandes        nuts_seeds  531,1   1 vue
puree d'amande         nuts_seeds  531,1   6 vues
almond butter          nuts_seeds  531,1   1 vue      → 3 slugs, 1 aliment

poulet roti            poultry     215     5 vues  PROMU
cuisses de poulet avec peau        215     4 vues  pending
portion de poulet roti             215     1 vue   pending
haut de cuisse de poulet desosse   215     2 vues  pending
poulet                             215     2 vues  pending   → 5 slugs, 1 aliment

yaourt au soja nature  dairy_yogurt  54    4 vues  PROMU
unsweetened soya yoghurt            63    1 vue   pending    → même aliment,
                                                                DEUX valeurs
boisson de soja        legumes     206,7  12 vues
boisson soja           legumes     206,7   2 vues            → 2 slugs, 1 aliment
```

Trois conséquences, toutes vérifiables :

1. **On repaie l'appel modèle** à chaque forme, et à chaque plan : le sas ne rend
   que le *groupe*, pas la valeur.
2. **La règle des trois ne se déclenche jamais** : les vues se répartissent entre
   les variantes (`puree d'amande` 6, `puree d'amandes` 1) au lieu de s'additionner.
3. **Le même aliment peut porter deux valeurs** selon la langue — 54 en français,
   63 en anglais, l'un promu, l'autre non.

État aujourd'hui : `food_composition_refs` = **943 lignes**, sas = **291**, dont
252 `pending`. Le dry-run de la promotion à 3 vues rend **2 promus, 7
`alias_exists`, 12 `group_bounds_never_promoted`**.

---

## Ce qu'il faut livrer — trois lots, dans cet ordre

### Lot 1 · Un aliment, un slug, deux surfaces

L'appel de secours doit rendre, pour chaque terme inconnu :

- un **slug canonique** (`term.replace(/ /g, "_")` reste la règle, mais sur le
  terme **canonique**, pas sur la forme rencontrée) ;
- le **libellé français** et le **libellé anglais** de cet aliment ;
- la composition, comme aujourd'hui.

La forme rencontrée devient un **alias** vers ce slug. Les deux langues aussi.

⛔ **UN ALIAS NE SE DEVINE JAMAIS.** La migration l'interdit pour une raison
mesurée : un alias `laitue → lait` remplace un aliment par un autre, pour tout le
monde, définitivement, et ressemble à une donnée, pas à un bug — 12 faux positifs
sur 12. Donc :

- l'alias n'est écrit que si le terme **ne résout vers rien** aujourd'hui
  (`resolveIngredient` rend `null`) ;
- s'il résout déjà vers un **autre** slug ⇒ `needs_review`, jamais d'écrasement ;
- aucune correspondance floue, aucune distance d'édition, aucun préfixe.
  ⛔ **Jamais de matcher maison** — c'est une cicatrice du dépôt.

### Lot 2 · Le sas sert la VALEUR, pas seulement le groupe

`loadPendingGroups` devient un vrai cache : si le terme (ou l'un de ses alias)
est déjà dans le sas avec une composition, **on ne rappelle pas le modèle** — on
augmente l'index avec la valeur du sas.

⚠️ **Et le compteur de vues ne bouge pas dans ce cas.** La règle des trois compte
les plans où le modèle **s'est prononcé** ; une lecture de cache n'est pas un
avis. Les deux mécanismes sont indépendants, et il faut qu'ils le restent.

Compteur attendu dans le journal : `sas_value_reused`, à côté de
`sas_group_armed` qui existe déjà.

### Lot 3 · La promotion tourne toute seule

Un job `pg_cron` hebdomadaire appelle
`promote_pending_food_compositions(3, false)`.

⛔ **Le chemin chaud n'écrit toujours PAS `food_composition_refs`.** La migration
dit pourquoi : « une génération qui écrit le référentiel qu'elle vient de lire
rend le résultat du plan suivant dépendant du tirage du précédent ». Cette règle
ne bouge pas.

Les deux refus actuels se traitent différemment :

- `alias_exists` (7 lignes) ⇒ après le lot 1, ce n'est plus un refus : on écrit
  l'**alias** vers le slug existant, et on ne crée pas d'aliment ;
- `group_bounds_never_promoted` (12 lignes) ⇒ **ça ne change pas**. Une bande de
  groupe n'est pas une mesure ; elle dépanne un plan, elle n'entre pas dans le
  référentiel.

---

## Les tests exigés

Style du dépôt : **chaque test a un cas qui PASSE, et une mutation qui le fait
ROUGIR.** Un test qui ne peut pas échouer ne prouve rien.

1. **Deux langues, un aliment.** `almond butter` et `purée d'amande` résolvent
   vers le **même slug**, avec la **même** composition.
   *Mutation :* retirer l'écriture de l'alias anglais ⇒ rouge.

2. **Les vues s'additionnent.** Trois plans qui écrivent `puree d'amande`,
   `puree d'amandes` et `almond butter` font **3 vues sur une ligne**, pas 1+1+1
   sur trois lignes.
   *Mutation :* revenir à un slug par forme ⇒ rouge.

3. **Le cache ne rappelle pas le modèle.** Deux générations d'affilée sur le même
   terme inconnu ⇒ **un seul** appel `askCompositionFill`, et `sas_value_reused = 1`
   sur la seconde.
   *Mutation :* débrancher la lecture de valeur ⇒ deux appels ⇒ rouge.

4. **Le cache ne compte pas une vue.** La seconde génération laisse `sightings`
   inchangé.
   *Mutation :* incrémenter à la lecture ⇒ rouge.

5. **⛔ Aucun alias deviné.** Un terme qui résout déjà vers un autre slug sort en
   `needs_review` et **n'écrit rien**. Le cas `laitue` / `lait` est le test.
   *Mutation :* accepter une correspondance par préfixe ⇒ rouge.

6. **Le chemin chaud n'écrit pas `food_composition_refs`.** Test de source : les
   deux lanes de génération ne contiennent aucune écriture vers cette table.
   *Mutation :* ajouter un `insert` dans la lane ⇒ rouge.

7. **Le plan en cours est pesé avec la valeur.** `withFilledRefs` reste branché :
   une génération avec un terme inconnu sort `measured: true` et
   `shares.table + shares.model + shares.group_bounds == 1`.
   *Mutation :* rendre l'index de base au lieu de l'index augmenté ⇒ rouge.

8. **Le cron existe et appelle la bonne fonction.** Test SQL : un job `pg_cron`
   nommé, dont la commande contient `promote_pending_food_compositions`.

Et le gate du dépôt doit rester vert : `bash scripts/agent-gate.sh`.

---

## Ce qu'il ne doit PAS faire

- ⛔ écrire `food_composition_refs` depuis une lane de génération ;
- ⛔ créer un alias par ressemblance, distance, préfixe ou « ça se ressemble » ;
- ⛔ promouvoir une ligne `group_bounds` ;
- ⛔ toucher aux valeurs déjà promues (27 lignes) sans les avoir relues ;
- ⛔ lancer `supabase db push`, `db reset`, `functions deploy` ou poser un secret
  (voir `AGENTS.md`) — il donne la commande, l'humain la lance ;
- ⛔ élargir le périmètre : le dimensionnement des plans, le couloir de densité et
  la lane solo ne sont **pas** de ce lot.

---

## Comment vérifier que ça a servi

Avant / après, sur la même base :

```sql
select count(*) from food_composition_refs;                         -- 943 aujourd'hui
select status, count(*) from food_composition_pending group by 1;   -- pending 252
select * from promote_pending_food_compositions(3, true);           -- dry-run
```

Et sur un plan réel : le journal `keel.meal.composition_fill` doit montrer
`requested` qui **baisse** d'une génération à l'autre sur le même foyer, avec
`sas_value_reused` qui monte.
