# Rapport — LOT H, l'écran des habitudes par bouche

> `scratchpad/SPEC-HABITUDES-ET-FORME-DE-CUISSON-20260814.md` §H.
> Branche `ff-001-quotidien-du-coach`. Lot G construit le moteur en parallèle.

## Le commit

`bb1d599d` — *« une bouche sans compte n'avait aucun endroit ou dire ce qu'elle
mange »*, 4 fichiers, 937 insertions. **Gate passé pour de bon** (jamais
`--no-verify`) : il a fallu **attendre ~9 min** que Lot G finisse d'aligner
`household_portions_test.ts` sur la nouvelle signature à 3 arguments de
`buildPortionBrief` — 26 `TS2554` qui n'étaient pas les miens bloquaient la
suite Deno.

## Ce qui est livré

| Fichier | État |
|---|---|
| `frontend/src/keel/api/householdHabits.ts` | **NEUF** — lecture, écriture, et les 4 décisions pures |
| `frontend/src/keel/api/householdHabits.int.test.ts` | **NEUF** — 26 cas |
| `frontend/src/keel/components/HouseholdHabitsCard.tsx` | **NEUF** — la carte, repliée par défaut |
| `frontend/src/keel/pages/HouseholdPage.tsx` | site de montage, dans `MemberRow` |

**Non commités, sur le disque seulement** (règle du lot) : `en.ts` (**16** clés
`household.habits.*` + **2** `household.error.*`), `fr.ts` (les 18 mêmes),
`planRefusals.ts` (`bad_slots`, `bad_note` dans `HOUSEHOLD_REFUSAL_KEYS`).
`catalog.ts` apparaît modifié : **ce n'est pas moi**, je ne l'ai pas ouvert.

⚠️ **Conséquence à connaître** : l'arbre COMMITÉ ne typecheck pas seul — les
clés `household.habits.*` n'existent que sur le disque, et `MessageKey` est
dérivé de `en.ts`. C'est la règle du lot (le chantier i18n d'une autre session
possède ces fichiers), et c'est le régime des trois lots précédents. Le gate,
lui, lit le disque : il passe.

## Ce qui est MESURÉ au navigateur

Session ouverte par l'API et jeton injecté (harnais du 2026-08-13), maître
`laneb-owner-…@test.dev`, foyer Bramble, port **5186** (vite lancé à la main :
le quota de `preview_start` était pris par 4 serveurs d'une session morte).

### Les trois pièges de §H2

| # | Règle | Mesure |
|---|---|---|
| 1 | **Rien n'est pré-coché** | Zoe (aucune ligne), écran réel : **6 boutons radio, `checkedCount = 0`**. Lea (une ligne) : petit-déjeuner = « their own » + « une pomme », déjeuner et dîner = « what the house cooks ». |
| 2 | **Aucun décompte** | Aucun texte de relance nulle part : `body.innerText` cherché sur `\d+ (people|left|remaining)`, `to complete`, `not filled`, `missing`, `still needs`, `remind` → **0 occurrence**. Pas de pastille d'absence, pas de total de foyer. |
| 3 | **Le formulaire attend sa lecture** | `loaded=false` : **0 radio, 0 input, 0 textarea** montés, seulement la ligne d'attente. Les champs vivent dans un composant séparé (`HabitsFields`) monté après la lecture — ses `useState` ne voient jamais du vide. |

### Les moments sont CEUX DE LA PERSONNE

Carte à `slots=["lunch","dinner"]` → **2 `<legend>`**, pas six. Pas de ligne
vide pour une collation que la personne ne prend pas.

### Le refus arrive en PHRASE

Les cinq motifs de §G2, rendus par `householdErrorText` (la même fonction que
tout le reste de l'écran) :

```
not_authenticated → You are not signed in any more.
not_a_member      → That person is not in your household.
bad_slots         → We could not read those habits. Every moment marked as their own needs a few words.
bad_note          → That note is either empty or too long (280 characters).
not_your_line     → You can only change your own line.
```

Aucun jeton nu. Le défaut que Lot C avait mesuré ne se reproduit pas.

### 320 px — mesuré, pas estimé

⚠️ **`resize_window` du Browser pane ment** : il a rapporté 320×900 pendant que
`window.innerWidth` valait 600. Mesure refaite **dans une iframe de 320 px**.

**Un débordement réel trouvé et corrigé.** Avec un `usual` de 39 signes
insécables (le gabarit du prénom qui a débordé chez Lot E) :

| | `documentElement.scrollWidth` | éléments hors cadre |
|---|---|---|
| avant | **600** (le `<span>` du résumé à 428 px) | 1 |
| après `break-words` | **320** | **0** |

`usual` et `note` sont du texte d'utilisateur : rien ne garantit une espace.
`break-words` est posé sur la liste du résumé et sur le paragraphe de la note.

Vérifié **aussi sur `/app/household` réel**, fiche de Lea ouverte et panneau des
habitudes déplié, dans une iframe de 320 px :
`documentElement.scrollWidth === 320`, **0 élément hors cadre**.

### Le contrat, de bout en bout contre les RPC réelles de Lot G

| Étape | Résultat |
|---|---|
| `keel_household_habits()` avant | `[]` — donc « personne n'a rien dit » |
| `select` PostgREST direct | **`permission denied`** ✓ (la table n'a aucun grant — la lecture DEVAIT être une RPC) |
| écriture de la pomme sur **Lea** (bouche sans compte) | `{"ok":true}` |
| relecture | `{member_id, slots:[{kind,slot,usual}], note}` — la forme exacte que le parseur attend |
| `bad_slots` (usual vide), `bad_slots` (kind inconnu), `bad_note` (281), `not_a_member` | les quatre motifs arrivent **littéralement** comme mappés |

Puis **round-trip par l'écran réel** : radio « their own » → le champ apparaît →
Save **inerte** avec le champ vide + erreur en ligne sous le champ → texte saisi
→ Save actif → clic → la fiche se rafraîchit et le résumé affiche
« Breakfast — un yaourt et du café ».

## Ce qui attend Lot G — et ce qui a bougé pendant la séance

1. ✅ **La table et les RPC ont atterri pendant le lot.** Table conforme à §G1
   (CHECK `note` 1..280, CHECK `slots` array ≤ 6, 3 FK, cascade).
2. ⚠️ **Le nom de la RPC de lecture n'était pas dans la spec.** J'avais écrit
   `keel_household_member_habits` par miroir de `…_member_bodies` ; le vrai nom
   est **`keel_household_habits()`**. Corrigé **après vérification contre la
   base**, pas deviné. Il existe aussi `keel_household_habits_for(p_user)`.
   👉 *Une RPC de lecture non nommée dans une spec est un trou : la carte serait
   restée muette sans qu'aucun test ne le dise.*
3. **Rien n'attend plus Lot G côté écran** : signature d'écriture, forme de
   `slots`, vocabulaire de refus — les trois sont vérifiés contre la base réelle.

### Un défaut de Lot G, trouvé et signalé (leur colonne, pas touchée)

Pendant ~15 min, **toute l'app était en écran blanc** :

```
ReferenceError: Cannot access 'EATING_OCCASIONS' before initialization
  _shared/keel/household_habits.ts
```

Cycle d'imports : `meal_generation.ts` → `household_portions.ts` (l.59) →
`household_habits.ts` → `meal_generation.ts`. Il atteint le navigateur parce que
`frontend/src/keel/api/servingDivergence.ts` importe déjà `household_portions.ts`
(import **préexistant**, pas le mien).

⚠️ `meal_generation.ts:85` portait le commentaire *« Aucun cycle :
`household_portions.ts` n'importe pas ce fichier »* — l'invariant exact que le
lot venait de casser. C'est la cicatrice *« une contrainte documentée survit à
sa cause — grep les COMMENTAIRES »*, prise sur le fait.

**Lot G l'a corrigé de lui-même à 16:01** (import retiré, contrainte
documentée). Je n'ai touché à rien.

## Rouges qui ne sont pas les miens — consignés

| Rouge | Statut |
|---|---|
| `planRefusals.int.test.ts` — 7 orphelins `household.error.*` | connu. **Mes 2 clés n'y sont pas** : elles sont atteignables. |
| `parity.int.test.ts` — `meals.form.window_span` identique fr/en | autre session (`meals.*`, jamais touché). |
| `coverage-guard.int.test.ts` ×2 | connu. |
| `groceryWaves.int.test.ts` | c'était le cycle de Lot G ci-dessus. |

**Un rouge était le mien et il est réparé** : `household.habits.loading` valait
`"…"` dans les deux langues, et `parity` refuse une valeur française identique à
l'anglaise. Devenu « Reading what they usually eat… » / « Lecture de ses
habitudes… ».

`npx tsc -b` : **vert**. Suite vitest : **893 passés**, 4 fichiers rouges, tous
ci-dessus. Mes 26 cas : verts.

## Ce que je n'ai PAS pu vérifier

- **Le refus rendu sur l'écran réel.** Le formulaire empêche les deux motifs
  atteignables (`maxLength=280` bloque `bad_note` ; le Save inerte bloque
  `bad_slots`). Vérifié autrement : les cinq motifs rendent une phrase par
  `householdErrorKey` + `t` (harnais + test), et la page passe par
  `householdErrorText`, le chemin déjà éprouvé de cet écran. **Aucun refus n'a
  été vu arriver du serveur jusqu'au bandeau rouge.**
- **Le chemin « compte réclamé qui remplit la sienne »** (§G2). La carte est
  montée dans `MembersCard`, branche **maître** — un membre non maître n'a pas
  de fiche à ouvrir sur cet écran. `not_your_line` est mappé et traduit, mais
  **aucune écriture n'a été tentée depuis un compte non maître**.
- **Le rendu Lot G du bloc de prompt** (§G4) : hors colonne, non lu.
- **La cascade RGPD et `account-export-v1`** (§G1) : hors colonne.

## État laissé dans la base locale (partagée)

- **Lea** (`fb50c0f7…`, bouche sans compte de Bramble) garde
  `[{breakfast, own_usual, "une pomme"}]` + note « Ne mange rien de réchauffé. »
  — **laissé exprès** : c'est le cas de la spec, utile à Lot G.
- **Zoe** : sa ligne d'essai (« un yaourt et du café ») a été **supprimée**, elle
  est revenue à *aucune ligne*.
- Fichiers de harnais (`frontend/habits-harness.html`,
  `frontend/src/habitsHarness.tsx`) : **supprimés**.
- Le serveur vite du port **5186** (lancé à la main, hors `launch.json`) est
  **arrêté**. Le port est libre.

## Hors spec, remonté

- **`preview_start` sature à 5 serveurs par dossier** ; 4 appartiennent à une
  session morte (`frontend-a20`, `-a8`, `-a12`, `-a15`, démarrés les 13 et 14).
  Personne ne les arrêtera tant qu'on ne le fait pas explicitement.
- **`resize_window` du Browser pane n'a pas redimensionné le viewport**
  (rapporte 320, la page lit 600). Toute mesure de largeur passée par lui est
  fausse. La mesure fiable est **une iframe de largeur fixe**.
- **`@supabase/supabase-js` ne s'importe pas en ESM depuis un script hors
  `frontend/`** : le build `dist/module` a des imports sans extension que Node
  refuse. Le build **CJS** (`dist/main/index.js`) marche par chemin absolu.
