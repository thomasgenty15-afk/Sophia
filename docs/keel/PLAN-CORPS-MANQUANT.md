# Le corps d'une bouche n'atteint pas le brief — plan de vérification

**Le fait**, mesuré le 2026-08-19 sur le run `8bb9d62a`
(`llm_raw_response_events`, foyer `5600347f`) :

| | en base (`household_member_bodies`) | dans le brief envoyé |
|---|---|---|
| iku (compte) | 187 cm · 73 kg · male | `[height 187 cm; age band 18 to 29; gender male; weight 73 kg, measured week of 2026-08-17]` |
| Christèle (sans compte) | **169 cm · 59 kg · female · trains_some** | **rien** |

**Conséquence mesurable** : le modèle a écrit des grammages **identiques** pour
les deux (140/140, 180/180, 220/220). Il n'avait rien pour différencier.

**Ce qui est déjà écarté** : la RPC `keel_household_bodies_for` est correcte —
`left join` sur `member_id`, **aucun filtre `user_id`**, elle rend les deux
lignes. La perte est entre la RPC et `buildPortionBrief`.

---

## 1 · Trouver le saut manquant

> ## ✅ H1 CONFIRMÉE — 2026-08-19, preuve ci-dessous
>
> Il y a **DEUX chargeurs de corps** dans `generate-household-meal-v1` :
>
> | # | appel | clé | destination |
> |---|---|---|---|
> | 1 | `loadHouseholdMemberBodies(...)` → `bodies.byMember` (l. 1555) | **`userId`** | l. 1594 |
> | 2 | `keel_household_bodies_for` → `lineBodies` (l. 1860) | **`member_id`** | l. 2049, 4885 |
>
> Le crochet d'iku dit **« measured week of »** — cette phrase n'existe QUE dans
> `meal_body.ts` (`latestWeight.weekStart`), c'est-à-dire **`student_body_measures`,
> clavée sur `user_id`**. Le chargeur n°1 est donc celui qui a produit le crochet.
>
> Une bouche **sans compte n'a pas de `userId`** ⇒ aucune ligne ⇒ aucun crochet.
> Christèle est dans le chargeur n°2 (`169/59/female`, vérifié en base) — mais
> ce n'est pas lui qui écrit les crochets du brief.
>
> ⚠️ **RESTE À TRANCHER AVANT DE CORRIGER** : les deux maps alimentent des
> `body:` différents (l. 1594 contre l. 2049/4885). Établir **laquelle atteint
> `buildPortionBrief`** avant de fusionner — sinon on répare la branche qui
> marchait déjà. Un probe qui imprime `body` pour les deux bouches juste avant
> le rendu du brief répond en une exécution.
>
> **La forme du correctif** : un seul corps par bouche, `member_id` comme clé,
> et le compte comme **enrichissement** (la mesure hebdo est plus fraîche) —
> jamais comme condition d'existence. Deux maps pour une même question est la
> divergence que ce dépôt paie à chaque fois.

### H1 — deux sources, et une seule est branchée *(la plus probable)*

Le crochet d'iku dit **« measured week of 2026-08-17 »**. Cette notion de
*semaine de mesure* n'existe pas dans `household_member_bodies` (qui n'a qu'un
`recorded_at`) — elle sent `student_body_measures`, **clavée sur `user_id`**.

Si le corps du brief vient de là, alors une bouche **sans compte** n'a
structurellement aucune ligne, et le chemin `household_member_bodies` est mort
ou jamais fusionné. C'est le mode d'échec n°1 de ce dépôt.

```bash
grep -n "keel_household_bodies_for\|student_body_measures\|MealBodyContext" \
  supabase/functions/generate-household-meal-v1/index.ts
```

Suivre jusqu'à l'endroit où `PortionMember.body` est rempli, et répondre à
**une** question : *quelle table alimente ce champ, et sur quelle clé ?*

### H2 — la fusion existe mais une ligne incomplète est jetée en entier

Vérifier qu'un corps sans `age_years` (ou sans `activity_level`) n'annule pas
`height`/`weight`. ⚠️ **Christèle a une date de naissance** (1971-08-18) donc
son âge est calculable — si H2 est la cause, c'est un autre champ qui manque.

### H3 — le brief a une garde de complétude muette

Chercher dans `buildPortionBrief` un `if` qui n'écrit les crochets que si
**tous** les champs sont là. Le brief serait alors correct pour iku et muet
pour elle sans qu'aucun compteur ne bouge.

**Preuve à produire** : une ligne de log ou un probe qui montre, pour ce foyer,
ce que `PortionMember.body` vaut pour chacune des deux bouches **avant** le
rendu du brief.

---

## 2 · Les tests, dans cet ordre

### a. Le test qui tombe aujourd'hui (à écrire avant le correctif)

`household_meal_generation_test.ts` — `buildPortionBrief` avec **deux bouches
dont une SANS COMPTE portant un corps complet** :

```ts
assert(brief.includes("169 cm"));   // le corps de la bouche sans compte
assert(brief.includes("59 kg"));
```

⚠️ **Le cas qui passe, dans le même test** : une bouche **sans corps du tout**
ne rend **aucun crochet** — c'est légitime, et sans ce cas une règle qui
inventerait des crochets vides passerait pour la bonne.

### b. Le test de câblage — celui que (a) ne peut pas voir

(a) prouve le **rendu** avec le corps qu'on lui donne ; il ne prouve pas que
quelqu'un le lui donne. Épingler que la lane foyer lit bien
`keel_household_bodies_for` et que le champ traverse — le patron de
`planDaySeparation.int.test.ts` §« le câblage ».

### c. Le compteur, obligatoire

`bodies_known / mouths` dans la trace, à côté de `boxes` et `vague_portions`.
Sans lui, « le corps est passé » et « on n'a rien mesuré » rendent le même
silence — cicatrice `model-declared-fields-need-a-counter`. Sur ce foyer il
devait valoir **1/2** et personne ne l'a vu.

### d. La mutation

Retirer le corps de la bouche sans compte doit faire **rougir (a)**. Une garde
qu'aucune mutation ne fait mordre n'est pas une garde.

### e. Le run réel — la seule preuve qui compte

Redémarrer le runtime (`supabase functions serve --env-file supabase/.env`),
composer, puis :

```sql
select (user_message like '%169 cm%') as body_reached_the_prompt
from public.llm_raw_response_events
where source = 'generate-household-meal-v1'
order by created_at desc limit 1;
```

Puis lire les boîtes de la réponse : **les grammages des deux bouches doivent
différer**. S'ils sont encore identiques, le corps passe mais ne dimensionne
pas — c'est alors `LOT L8` qu'il faut regarder, pas le chargeur.

---

## 3 · Ce qui ne doit pas bouger

- Aucun **chiffre de corps** ne sort vers l'écran : `member_portions` est
  lisible par tout le foyer. Les crochets vivent dans le PROMPT, jamais dans
  une consigne rendue.
- Les crochets servent à **une** chose — la taille d'une portion. Pas d'énergie
  quotidienne, pas de calories, pas d'IMC, pas de catégorie.
  ⚠️ **La portée de cette ligne est la lane FOYER, et il faut le lire ainsi**
  (ajouté le 2026-09-01, après un audit où elle a été comptée comme une position
  produit). Elle dit que `member_portions` — lisible par tout le foyer — ne
  porte aucun chiffre de corps. Elle **ne dit pas** que le produit refuse les
  calories : FF-059 en affiche à l'élève sur sa propre surface, derrière
  `energy_gate.ts`. Les deux tiennent ensemble parce que ce ne sont pas les
  mêmes écrans ni les mêmes lecteurs.
- Une bouche **réellement** sans corps reste servie, sans crochet et sans
  excuse : le brief le dit déjà, et cette phrase-là est vraie.
