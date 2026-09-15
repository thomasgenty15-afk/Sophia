# LOT J — une seule carte par personne à l'étape 3, le maître compris

Branche `ff-001-quotidien-du-coach`. Écrit le 2026-08-14, après pilotage réel du
navigateur sur `ff060_body@example.com` (foyer `493ca22c-ff7b-403d-a813-44a1cbfa17a6`,
deux bouches : **Ines**, maître, avec compte — **Marc**, sans compte).

---

## 1. Ce qui a changé, et pourquoi

### Le défaut, dit par l'écran d'avant

L'étape 3 portait **deux cadres qui ne se ressemblaient pas** :

* en tête, le régime **du titulaire** et une rangée « les moments de **LA
  MAISON** » ;
* en dessous, **une carte par AUTRE bouche** : ses moments (sans taille), son
  régime, et un dépliant « Ce qu'elle mange d'habitude » avec son bouton
  « Fermer » et sa phrase « Aucun moment de repas n'est encore posé pour cette
  personne ».

Conséquences mesurées :

1. le maître n'avait **pas de carte** — ses moments s'appelaient « la maison »,
   son régime vivait au-dessus des autres, et il n'avait **aucune ligne de
   préférences** ;
2. une autre bouche ne pouvait dire **que quand** elle mange, jamais **combien** ;
3. le dépliant demandait d'aller cocher des moments **ailleurs** alors qu'ils se
   cochent juste au-dessus.

### Ce qu'il y a maintenant

**Un composant, `PersonTableCard`, monté une fois par bouche, le maître
compris**, avec **trois blocs dans le même ordre pour tout le monde** :

1. **le régime** — `Je mange de tout / Végétarien / Végane / Pescatarien`
   (`DIET_ANSWERS`, libellés `setup.people.diet_*`, les mêmes sur toutes les
   cartes) ;
2. **les moments, AVEC leur taille** — six cases, et sur chaque moment coché
   `Petit / Moyen / Gros` (`MEAL_SIZES`) ;
3. **une zone de texte libre** — `household_member_habits.note`.

Le maître est une ligne `household_members` (rôle `owner`) : c'est ce qui rend
l'uniformité possible **sans inventer un second modèle**. Ce qui diffère est le
**chemin d'écriture**, décidé par la base (D1 : « pour une bouche avec compte,
son about-you fait autorité »), pas la carte :

| Bloc | Maître (a un compte) | Bouche sans compte |
|---|---|---|
| régime | `saveOwnDiet` → `student_safety_constraints` + `diet_asked`, au « Continuer » | `keel_household_set_member_diet`, au clic |
| moments + taille | `savePlanAnswers` → `practical_constraints.eating_rhythm`, au « Continuer » | `keel_household_set_member_rhythm`, au clic |
| texte libre | `keel_household_set_member_habits` | **la même RPC** (elle n'a pas de refus `has_account`) |

`keel_household_roster_for` tranche ensuite, une fois, pour tout le monde.
L'écran ne refait jamais cette résolution.

### Ce qui a été retiré

`HouseholdHabitsCard` **n'est plus montée dans l'entonnoir**. Elle reste sur
`/app/household`, qui est le bon endroit pour RELIRE. Sa **note** est reprise
telle quelle par la zone de texte libre — même table, même RPC, même plafond
(`DRAFT_NOTE_MAX_CHARS`, importé du serveur).

⚠️ **Les `slots` déjà saisis sont repassés tels quels** à chaque enregistrement
de la note. La RPC REMPLACE la ligne (`on conflict do update set slots =
excluded.slots`) : envoyer `[]` aurait effacé, en silence, les habitudes par
moment posées sur `/app/household`.

---

## 2. La taille atteint le prompt — sinon on collectait une donnée sans lecteur

C'est la faute que ce chantier a déjà corrigée deux fois (le régime, puis les
habitudes). Chaîne complète, bout à bout :

```
écran  →  household_members.eating_rhythm  (bouche sans compte)
       →  practical_constraints.eating_rhythm (compte)
              ↓  keel_household_roster_for  (tranche, D1)
              ↓  generate-household-meal-v1 → parseEatingRhythm  (plus de .map(s => s.slot))
              ↓  PortionMember.eatingSlots : readonly EatingOccasionSlot[] | null
              ↓  buildPortionBrief
       →  « - Marc: … — eats at breakfast (large for them), dinner only »
```

`(… for them)` est repris **mot pour mot** de `rhythmLines`
(`meal_generation.ts`, lane individuelle). Le possessif est load-bearing : sans
lui le modèle lit une portion absolue, alors qu'on décrit la journée de CETTE
personne. Deux formulations pour un seul fait se contrediraient dans le même
prompt, puisque foyer et individuel partagent le modèle.

⚠️ **L'union qui dimensionne la GRILLE du plan entre par le seul `slot`.**
`members.flatMap((m) => (m.eatingSlots ?? []).map((o) => o.slot))` : y laisser
entrer les objets ferait gagner la taille du DERNIER membre lu sur celle du
maître pour un même moment (`parseEatingRhythm` écrase, une chaîne nue n'écrase
pas). La taille d'une personne gouverne SA part, pas la maison.

---

## 3. La migration

`supabase/migrations/20260814120000_member_rhythm_size.sql` — appliquée à la main
(`docker exec … psql -f`), inscrite à la main dans
`supabase_migrations.schema_migrations`. **Aucun `db reset`, aucun `db push`.**
`ls supabase/migrations | cut -c1-14 | uniq -d` : aucun doublon.

Ce n'est **pas** une colonne qui change de type — le jsonb acceptait déjà
`{slot, size}` et le parseur le lisait déjà. Ce qui manquait est **la garde** :
la porte d'écriture ne validait QUE `slot`, donc `{"slot":"lunch","size":"huge"}`
entrait en base, y restait, et le parseur le rendait `size: null`. Un no-op
silencieux.

* le commentaire de colonne nomme `size`, sa liste fermée, et dit que `at` reste
  **toléré en lecture et non migré** ;
* `keel_household_set_member_rhythm` valide `size` (`null` / absent / `small` /
  `medium` / `large`) et refuse par **`bad_rhythm`** — pas de motif neuf : un
  `bad_size` serait un mot de plus à traduire pour une distinction que l'écran
  ne peut pas produire (trois boutons, pas un champ) ;
* **aucune ligne existante n'est réécrite.** `{"slot":"lunch","at":null}` se lit
  `size: null`, c'est-à-dire « personne n'a dit la taille » — ce qui est exact.
  Y poser une taille serait un fait indémentable.

Bloc de contrôle, joué puis `rollback` — et il **se donne une identité**
(`request.jwt.claims`), sinon tout rendrait `not_authenticated` et le bloc serait
vert en ne prouvant rien. Six cas, dont **trois qui PASSENT** :

```
NOTICE:  keel_household_set_member_rhythm: contrôle VERT
         (bad size, bad slot, empty, ok+taille relue, ok sans taille, ok forme `at`)
```

---

## 4. Ce que le navigateur a montré — champ par champ

Port **5186** (`frontend-a16`). Session ouverte **par le harnais documenté**
(`scratchpad/HARNAIS-SESSION-NAVIGATEUR-20260813.md`) : `signInWithPassword`
depuis Node, jeton injecté dans `localStorage`. Aucune écriture dans
`auth.sessions`, aucun secret lu dans un conteneur, aucun JWT fabriqué.

### 4.1 Les deux cartes portent les mêmes trois blocs, dans le même ordre

Mesuré (pas regardé), sur les libellés de section rendus :

```json
{"ines": ["Comment cette personne mange","Quand cette personne mange","Ses préférences, en toutes lettres"],
 "marc": ["Comment cette personne mange","Quand cette personne mange","Ses préférences, en toutes lettres"],
 "same": true}
```

Et la structure :

| | Ines (maître) | Marc (sans compte) |
|---|---|---|
| boutons de régime | 4 | 4 |
| rangées de moments | 6 | 6 |
| zone de texte libre | oui | oui |

### 4.2 L'indicateur de quantité, sur les deux

Il n'apparaît **que sur un moment coché** — une taille à côté d'un moment qu'on
ne prend pas est une question sans objet.

* Ines, trois moments cochés → trois rangées `[Petit, Moyen, Gros]` ;
* Marc, rien de coché → aucune rangée de taille, plus la phrase « Mange aux mêmes
  moments que la maison » (le `null` du produit, **jamais** des moments
  pré-cochés).

### 4.3 Plus aucune trace de l'ancien cadre

Vérifié sur le texte rendu de l'étape 3 :

```json
{"habitudeTitre": false, "fermer": false, "aucunMoment": false, "laMaison": false}
```

→ ni « Ce qu'elle mange d'habitude », ni « Fermer », ni « Aucun moment de repas
n'est encore posé », ni la rangée « LA MAISON ». Le libellé de la zone libre a
été renommé **exprès** (`Ses préférences, en toutes lettres`) : garder « ce
qu'elle mange d'habitude » aurait fait relire l'ancien bloc sous une autre forme.

`/app/household` est intact : le cadre complet (« CE QU'ELLE MANGE D'HABITUDE »,
« Fermer », les deux boutons radio par moment) y est toujours, et **il affiche la
note écrite depuis l'entonnoir** — preuve que les deux écrans lisent et écrivent
la même ligne.

### 4.4 L'aller-retour réel, sur les deux cartes

Gestes au navigateur, puis **rechargement complet de la page**, puis relecture.

| | Ines (maître) | Marc (sans compte) |
|---|---|---|
| régime posé | `Végétarien` | `Pescatarien` |
| moment + taille | Petit-déjeuner = **Petit**, Dîner = **Gros** | Petit-déjeuner = **Gros** |
| texte libre | « Le matin je mange des fruits, une pizza le vendredi soir. » | « Le samedi midi il mange ce qu'on vient d'acheter au marche. » |

Ce que la base porte après le geste :

```
student_goals.practical_constraints.eating_rhythm  (Ines)
  [{"size":"small","slot":"breakfast"},{"size":null,"slot":"lunch"},{"size":"large","slot":"dinner"}]
student_safety_constraints  (Ines) : kind=diet, diet_ref=vegetarian, status=active

household_members  (Marc)
  diet = pescatarian
  eating_rhythm = [{"at": null, "size": "large", "slot": "breakfast"}]

household_member_habits
  Ines : note = « Le matin je mange des fruits, une pizza le vendredi soir. »
  Marc : note = « Le samedi midi il mange ce qu'on vient d'acheter au marche. »
```

⚠️ **`size` sur la ligne d'Ines était impossible avant ce lot** : `savePlanAnswers`
écrivait `size: null` en dur pour tout le monde, donc une taille posée dans
« À propos de toi » était **effacée à chaque passage de l'entonnoir**, sans
qu'aucun écran ne le montre. Défaut fermé en passant.

Et ce que le **roster** rend — le seul lecteur qui compte :

```
 first_name |    diet     |                      eating_rhythm
------------+-------------+--------------------------------------------------------
 Ines       | vegetarian  | [{"size":"small","slot":"breakfast"}, …, {"size":"large","slot":"dinner"}]
 Marc       | pescatarian | [{"at": null, "size": "large", "slot": "breakfast"}]
```

Après rechargement, l'écran retrouve **exactement** ces valeurs sur les deux
cartes (régime allumé, taille `aria-pressed=true`, note dans le champ).

### 4.5 Le refus tombe sur le contrôle qui le lève

En décochant les trois moments d'Ines puis « Continuer » : l'étape **retient**
(reste « ÉTAPE 3 SUR 4 ») et le motif s'affiche **sur sa carte à elle**, sous ses
moments, et **nulle part ailleurs** :

```json
{"step":"ÉTAPE 3 SUR 4",
 "inesErr":["Les moments où tu manges, sur ta carte."],
 "marcErr":[]}
```

La phrase disait « Les moments où cette maison mange » : elle désignait un
contrôle global qui n'existe plus, et faisait chercher ailleurs. Réécrite.

### 4.6 320 px — mesuré dans une iframe de largeur fixe

`resize_window` ment sur la largeur, donc la mesure a été prise dans une **iframe
de 320 px** montée dans la page :

```json
{"vw": 320, "scrollW": 320, "nodeCount": 126, "over": []}
```

Aucun élément ne dépasse le bord droit, la page ne défile pas
horizontalement. **Un défaut réel a été trouvé et corrigé par cette mesure** :
la rangée moment + taille en une seule ligne (l'idiome d'`EatingRhythmCard`)
poussait « Gros » hors du cadre — la rangée est au fond de trois cadres (`Card`,
la fiche `p-4`, la rangée `px-3`). Elle est **empilée** : la case à cocher, puis
la taille en dessous.

---

## 5. Les règles du lot, et où chacune est tenue

* **Rien n'est pré-coché.** `null` = « personne n'a rien dit », jamais « il mange
  de tout » ni « portion moyenne ». Vérifié à l'écran sur Marc (aucun régime,
  aucun moment, aucune taille au premier rendu).
* **Aucun décompte** de qui a rempli quoi : ni pastille, ni total, ni ligne ambre.
* **Garde de chargement** : `habits === null` (la lecture n'a pas eu lieu) rend un
  ATTENDU et **aucun champ**. Le champ est monté dans un composant séparé
  (`NoteEditor`), remonté par une `key` qui signe la lecture — un formulaire figé
  au montage sur du vide l'écrase au premier Save.
* **La garde du texte libre est celle qui existe** (`plan_draft_note.ts`, côté
  serveur, plus `bad_note` 1..280 en base). **Aucune garde réécrite ici.**
* **Aucun paramètre optionnel** ajouté : `PortionMember.eatingSlots` reste
  REQUIS et nullable, et le changement de type a fait remonter tous les appelants
  au compilateur — c'est ce qui prouve que le lot est branché.
* **Les refus s'écrivent en littéral** : `bad_rhythm` est le jeton existant, dans
  la fonction, jamais calculé.

---

## 6. Vérification

```
env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
  deno test --allow-read --allow-env supabase/functions/_shared/keel/
  → ok | 3028 passed | 0 failed

cd frontend && npx tsc -b            → aucune erreur
cd frontend && npx vitest run        → 919 passed | 4 failed (PRÉEXISTANTS)
```

Deux cas neufs dans `household_portions_test.ts` :

* « la taille d'un moment se dit sur la ligne de la personne » ;
* « une taille absente n'invente RIEN sur la ligne » (la cicatrice
  `auto-tick-writes-undeniable-false-facts`, vue par le bout du prompt : écrire
  `(medium for them)` sur un moment muet poserait une contrainte que personne n'a
  exprimée — et le modèle la respecterait).

### Les 4 rouges sont préexistants, et la preuve

Aucun ne touche un fichier de ce lot :

| Test | Ce qu'il réclame | Origine |
|---|---|---|
| `coverage-guard` (fonctions) | `household-merge-notices-v1`, `keel-daily-recommendation-v1` | fonctions edge **non commitées** d'une autre session |
| `coverage-guard` (triggers) | `household_member_bodies_touch`, `student_daily_recommendations_set_updated_at` | migration **non trackée** `20260812220000_household_member_body_and_reference.sql` |
| `planRefusals.int.test.ts` | 7 clés `household.error.*` (corps, membre de référence) | `planRefusals.ts` **diffère de HEAD** — travail d'une autre session |
| `pageSeams.int.test.ts` | `allergen.*` sur 3 pages | fichier **non tracké** d'une autre session |

---

## 7. Ce qui n'a PAS été vérifié, et ce qui reste ouvert

* **Aucun run modèle.** La taille arrive jusqu'à `buildPortionBrief` — prouvé par
  test unitaire sur la chaîne rendue, et par la relecture du roster en SQL. Ce
  qu'un modèle en FAIT n'a pas été mesuré.
* **Le cas d'une bouche RÉCLAMÉE (autre compte)** n'existe pas dans ce foyer. Sa
  carte est écrite (mêmes trois blocs, régime et moments en lecture seule avec
  `setup.table.from_profile`, note écrivable), mais **elle n'a pas été vue à
  l'écran**. Le dire plutôt que de prétendre l'avoir vue.
* **Le compte SOLO** (sans foyer) : la zone de texte libre **n'est pas rendue** —
  `household_member_habits` est clée sur un `member_id`, et rendre un champ qui
  ne peut pas s'enregistrer serait pire que son absence. Non vu à l'écran non
  plus.
* **Asymétrie de geste, assumée.** Sur une bouche sans compte, re-cliquer la
  réponse de régime l'efface (`setMemberDiet(null)`). Sur le maître, non :
  `saveOwnDiet` est en **rétractation seule** (trigger
  `student_safety_constraints_retraction_only`), et l'entonnoir n'est pas
  l'endroit pour changer d'avis — `/app/health` l'est. La CARTE est identique;
  ce chemin-là ne l'est pas, et la base en décide.
* **`bad_rhythm` / `empty_rhythm` ne sont pas traduits** dans
  `HOUSEHOLD_REFUSAL_KEYS` : ils sortiraient en jeton brut. **Défaut préexistant,
  laissé tel quel** — l'écran ne peut pas les produire (liste fermée de boutons),
  et `planRefusals.ts` est sur la liste des fichiers à ne pas commiter.
* **Décocher un moment emporte sa taille.** Choix, pas oubli : chaque clic EST
  l'écriture, et garder de côté une taille qu'aucun contrôle n'affiche plus pour
  la réécrire ensuite sur la ligne de quelqu'un est exactement le fait
  indémentable qu'on refuse partout ailleurs. **Ce qui est à l'écran est ce qui
  sera écrit.**

---

## 8. Fichiers

**Commités**

```
supabase/migrations/20260814120000_member_rhythm_size.sql      (neuf)
supabase/functions/_shared/keel/household_portions.ts
supabase/functions/_shared/keel/household_portions_test.ts
supabase/functions/generate-household-meal-v1/index.ts
frontend/src/keel/api/household.ts
frontend/src/keel/api/onboarding.ts
frontend/src/keel/api/onboarding.int.test.ts
frontend/src/keel/pages/SetupPage.tsx
frontend/src/keel/pages/HouseholdPage.tsx
frontend/src/keel/components/MealBuilder.tsx
```

**Sur le disque, JAMAIS commités** (`fr.ts` n'existe pas dans HEAD — travail
i18n non commité d'une autre session) :

```
frontend/src/keel/i18n/en.ts
frontend/src/keel/i18n/fr.ts
```

Clés ajoutées : `setup.table.moments_label` · `setup.table.moments_hint` ·
`setup.table.size_small|medium|large` · `setup.table.note_label` ·
`setup.table.note_hint` · `setup.table.note_placeholder`.
Clés réécrites : `setup.table.intro` · `setup.missing.eating_rhythm`.
Deviennent orphelines : `setup.table.each_title` · `setup.table.each_intro` ·
`setup.table.house_label` — **laissées en place**, elles ne coûtent rien et un
lot i18n en cours les lit peut-être.
