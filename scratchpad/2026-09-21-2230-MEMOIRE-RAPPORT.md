# Chantier mémoire — rapport de lot (2026-09-21)

> Rien n'est commité. Tout tourne en local.
> Suite `deno test … _shared/keel/` : **7 644 passés, 0 échec, 2 ignorés**
> (baseline avant le lot : 7 527 / 0 / 2).

---

## 1. Ce qui a été mesuré, et ce que ça a prouvé

### ① La note composite ressortait « honorée » — un FAUX VERT, pas un compteur absent

La ligne réelle : un seul `food.exclude`, `text: "tofu, poissons au petit déjeuné"`.
Le mécanisme est maintenant écrit et épinglé (`retained_honoured_test.ts`) :

- `isBarePhrase("tofu, poissons au petit déjeuné")` rend **`true`** — le texte n'a ni
  pronom, ni négation, ni verbe de goût ;
- une phrase nue ne mord **que si TOUS ses mots sont dans le plat** ;
- un petit-déjeuner au tofu n'en porte qu'un.

Sur le plan du jeudi (« Tofu, pain complet et pêche »), le souvenir tel qu'il était rangé
sort **`honoured`**, compteur `{items:1, checked:1, honoured:1, violated:0}`. Ce n'était
donc pas « rien ne vérifiait » : c'est « la vérification aurait dit vert ».

Découpé et scopé, le même souvenir sort **`violated`** en nommant le plat.

### ② « Très léger le matin » n'avait aucune destination

Le levier existait depuis le 2026-09-07 (`household_member_habits.slots[].light`, pesé par
`LIGHT_SLOT_WEIGHT` : 0,15 · 0,25 · 0,20) et **aucun producteur ne l'écrivait**.

### ③ Une règle de maison sortait sous le nom d'une personne

`compositionLinesByMouth` rangeait les lignes `subject: household` dans la voix du
**titulaire** — le modèle lisait une préférence personnelle. Et **sans titulaire à table,
elle tombait** dans `householdUnattached`, que l'appelant comptait
(`retained_lines_unattached:N`) et ne donnait à personne.

### ④ Le chemin questionnaire, lui, TIENT — et c'est mesuré

`plan_feedback_retained_corpus_test.ts` balaie les **17 jetons fermés** des cinq questions
à échelle. Résultat : **28 cas verts, aucun jeton décoratif**, chaque branche nommée.
Deux vérifications que la suite ne faisait pas :

- **le questionnaire ne produit aucun moment**, et c'est exact : aucune de ses questions ne
  porte sur un moment de la journée. Le trou est désormais ÉPINGLÉ (ajouter un moment au
  questionnaire deviendra une décision, pas un effet de bord) ;
- **l'appétit et l'indice de part ne se cumulent PAS**, contrairement à ce qu'on pouvait
  craindre. Mesuré sur une enveloppe réelle (femme 62 kg, 168 cm, `on_feet`, maintenance) :

  | levier | effet sur l'énergie |
  |---|---|
  | base | 2 185 kcal |
  | appétit `small` seul (écrit par la note) | 2 185 kcal — **0 %** |
  | indice de part `−1` seul (écrit par le bilan) | 2 076 kcal — **−4,99 %** |
  | les deux | 2 076 kcal — **−4,99 %** |

  Raison : l'appétit d'un ADULTE ne touche pas l'énergie (`void args.appetite`,
  `meal_envelope.ts`), il déplace les **bornes de masse de l'assiette**
  (`portion_sizing.ts:657`) — même cible, servie plus dense ou plus volumineuse. C'est
  documenté et délibéré.

  ⚠️ **Mais la consigne du tiroir 4 dit le contraire au modèle** : « the same one notch a
  closed question moves at the end of a plan ». C'est faux — une question fermée déplace
  l'ÉNERGIE de 5 %, une note déplace le VOLUME de 10 % à énergie constante. Ça ne change
  rien à ce que le modèle rend (il ne rend qu'une direction), donc **laissé tel quel** :
  le corriger est une décision de rédaction, pas un correctif.

---

## 2. Étape 0 — les tests, écrits AVANT le code

| fichier | ce qu'il tient |
|---|---|
| `draft_note_corpus.ts` | **47 notes** en français tel qu'on tape, fautes comprises, avec les souvenirs attendus |
| `draft_note_classify_corpus_test.ts` | le lecteur, cas par cas + le câblage de la consigne — **57 cas** |
| `plan_feedback_retained_corpus_test.ts` | le questionnaire, jeton par jeton — **28 cas** |
| `retained_items_routing_corpus_test.ts` | la destination et la carte — **8 cas** |
| `retained_honoured_test.ts` | l'effet sur le plan + le câblage — **14 cas** |

**Les huit cas obligatoires sont nommés, pas comptés** : `liste-et-moment`, `matin-leger`,
`appetit-nomme`, `allergie-sur-un-retour`, `faute-de-frappe`, `pas-un-souvenir`,
`prenom-ambigu`, `contre-ordre`. Un test épingle leur présence — un corpus de 47 notes qui
aurait perdu « le moment » resterait de la bonne taille et ne prouverait plus rien.

Au premier lancement, **16 cas étaient ROUGES**, tous sur les deux défauts mesurés
(8 sur `occasion`, 4 sur `slots`, 4 sur le câblage de la consigne). Ils décrivaient la
cible ; ils ne sont jamais passés en `ignore`.

---

## 3. Étape 1 — le vocabulaire

- **`occasion` sur les quatre familles d'aliments** (`retained_item.ts`) : champ **REQUIS
  et nullable**, jamais `?`. Un jeton hors des six moments fait tomber l'item entier —
  aucun repli sur `null`, qui élargirait une règle du matin à la journée. Les quatre autres
  familles portent `occasion?: never` (l'échappatoire est NOMMÉE : une envie n'a pas de
  créneau, une part est un fait de corps, un rythme porte déjà son moment dans `value`).
  Sérialisé même à `null`, et **seulement** pour les quatre familles.
- **Le découpage est demandé SUR la ligne de `text`** : « ONE FOOD PER ENTRY, ALWAYS ».
  Fait par le modèle, jamais par un `split` sur la virgule.
- **Un sixième tiroir `slots`** dans le classifieur, inséré en 6 (`skipped` 6→7,
  `clarify` 7→8, `cells` 8→9). ⛔ **Ce n'est PAS une neuvième famille** : c'est la règle du
  lot M5 appliquée une fois de plus — un souvenir serait une COPIE du réglage. La phrase
  déplace **le champ que la personne voit**.
- **Trois moments seulement** (`LIGHT_BEARING_SLOTS`). Proposer les six aurait fait un
  **tiroir muet** : le modèle rangerait « léger au goûter », le lecteur garderait,
  `parseMemberLight` jetterait sans un mot. Un test le tient dans les deux sens.
- **Deux renvois de `clarify` étaient PÉRIMÉS avant ce lot** (`(see 5)`, `(see 7)` pour un
  tiroir qui était le 7ᵉ) — corrigés au passage. Invisibles au typecheck comme à la parité.
- `NOMENCLATURE-MEMOIRE.md` est à jour dans le même geste (encadré de tête, §4, §5).

---

## 4. Étape 2 — la lecture par le plan

- **La ceinture lit le moment.** `dishBitesExclusion` prend `slot`, **REQUIS** (`null` =
  « ce plat n'a pas de moment lisible », le comportement d'avant). 15 appelants mis à jour.
  Défaut trouvé PAR le test au passage : la clé de dédoublonnage de `exclusionTermsFor` ne
  portait pas le moment — « pas de pain le matin » et « pas de pain le soir » se
  réduisaient à UNE règle, la seconde tombait entièrement, **en silence**.
- **`because` ne montre plus la clé de règle.** `ruleId` porte désormais `texte@moment` :
  le rendre à la personne lui ferait lire une phrase qu'elle n'a pas écrite.
- **La table a son canal.** `compositionLinesByMouth` rend `household`, jamais sous une
  carte, avec ou sans titulaire ; la lane le verse dans le mémo du tronc (`memoLines`).
  `ownerMemberId` est **retiré** — un argument que rien ne lit est un argument qu'un
  appelant croira branché. `retained_lines_unattached` est retiré : la perte qu'il
  observait n'existe plus.
- **Le moment sort sur la ligne** : ` -- ONLY AT breakfast`, dans le jeton du schéma, pas
  en prose française noyée.
- **`retained_honoured` tourne sur le plan livré** et entre dans
  `generated_from.retained_honoured` + le journal `keel.household_meal.retained_honoured`
  + une `issue` par violation. Aucun texte de souvenir, aucun `member_id` dans le journal.

**La chaîne complète, vérifiée en pur, sur la note réelle :**

```
items ceinture: 2 | occasions: [breakfast, breakfast]
termes: tofu@breakfast, poisson@breakfast + 58 espèces dépliées, toutes @breakfast
ceinture @breakfast : MORD sur "tofu" (because: "tofu")
ceinture @dinner    : aucune morsure
constat: {items:2, checked:2, honoured:1, violated:1, unverifiable:0}
lignes : tofu=violated @thu/breakfast · « Tofu, pain complet et pêche » | poisson=honoured
```

---

## 5. L'écrivain de la taille d'un moment

`supabase/migrations/20260921210000_une_note_coche_la_case_repas_leger.sql` —
`keel_household_set_slot_light_for(p_user, p_member, p_slot, p_light)`.

- `_for` **obligatoire** : la fonction de l'écran lit `auth.uid()`, NULL sous `service_role`.
- Elle **FUSIONNE** dans `slots`, elle ne réécrit pas : une phrase sur le matin ne doit pas
  effacer ce que la personne a déclaré pour le soir.
- `service_role` seul.

**Appliquée en local (`migration up`), et les branches ont TOURNÉ** — pas seulement
appliquées. Neuf cas exercés sur la vraie base, dans une transaction **rollbackée**
(rien d'écrit) :

```
no_user      -> {"ok": false, "reason": "no_user"}
bad_light    -> {"ok": false, "reason": "bad_light"}
bad_slot     -> {"ok": false, "reason": "bad_slot"}       (snack_pm refusé)
no_household -> {"ok": false, "reason": "no_household"}
set light    -> {"ok": true, ...}   slots: [{"kind":"own_usual","slot":"breakfast","light":true,"usual":"a spoonful of blackcurrant jam on toast"}]
recoche      -> {"ok": false, "reason": "unchanged"}
decoche      -> {"ok": true, ...}   light: false, `kind` et `usual` INTACTS
creation     -> {"ok": true, ...}   slots: [{"slot":"dinner","light":true}]  (sans `kind`, voulu)
autre foyer  -> {"ok": false, "reason": "not_a_member"}
```

**⛔ RESTE À POUSSER — commande pour le propriétaire :**

```bash
npx supabase db push --linked
```

Défaut trouvé par le test au passage : la porte « rien à ranger » du classifieur ne
connaissait pas le sixième tiroir. Une note qui ne disait QUE la taille d'un moment
ressortait `nothing_to_file`, la case n'était jamais cochée — exactement le défaut que la
quatrième porte avait déjà payé le 2026-09-08.

---

## 6. Étape 4 — le banc

`scripts/2026-09-21-2200-banc-corpus-memoire.ts` : rejoue les 47 notes sur le **VRAI**
classifieur et compte les écarts **par tiroir**, avec dénominateur (`attendu` / `exact` /
`en trop`, séparés — un tiroir jamais rempli et un tiroir rempli de travers ne sont pas le
même défaut).

- Il **n'écrit rien** : ni base, ni compte, ni fixture. Consigne → modèle → lecteur.
- Il **REFUSE de démarrer sans clé** plutôt que de rendre 47 échecs d'appel, qui
  ressembleraient trait pour trait à un prompt qui ne range rien. Vérifié.

```bash
OPENAI_API_KEY=… deno run --allow-env --allow-net --allow-read \
  scripts/2026-09-21-2200-banc-corpus-memoire.ts
```

---

## 7. ⛔ CE QUI N'A PAS ÉTÉ FAIT

1. **Le banc n'a pas tourné.** La clé de modèle vit dans le runtime des fonctions edge,
   pas dans ce shell, et je ne suis pas allé la chercher dans le conteneur. Une ligne pour
   le propriétaire (ci-dessus).
2. **Aucun run réel de composition.** Le runtime edge tourne (`functions serve`, HTTP 401
   attendu), mais **j'ai modifié une dizaine de fichiers `_shared/`** et la cicatrice du
   dépôt est nommée : un fichier modifié n'est pas rechargé, un run réel lirait des modules
   périmés. Le redémarrage est le geste du propriétaire (et `docker restart` est interdit
   sous `functions serve`).
3. **La carte « Ce que Sophia sait » ne rend pas le moment comme tel.** Le front a sa
   propre copie du socle (`frontend/src/keel/api/retainedItems.ts`), qui ignore `occasion`.
   ⚠️ Vérifié : **aucune disparition silencieuse** — son parseur ne refuse pas les clés
   inconnues (89 cas de parité verts), et la carte affiche déjà la **citation** sous chaque
   ligne, donc « le matin » reste lisible par la phrase d'origine. « Défaire » n'est pas un
   pari. C'est un lot d'écran, pas un trou de mémoire.
4. **Les deux lints de CI étaient DÉJÀ rouges** (`token-lint` 73, `ci:wiring` 26) et le
   restent. Mon lot n'en ajoute **aucun** : deux exemptions nommées ont été posées pour le
   corpus (jours français dans des phrases tapées par des gens ; fixture lue par des tests
   seuls), sur le modèle de `labels.fr.ts` et `labels.en.ts`. `agent-gate.sh` ne lance
   aucun des deux.

---

## 8. Fichiers

**Neufs** — `draft_note_corpus.ts`, `draft_note_classify_corpus_test.ts`,
`plan_feedback_retained_corpus_test.ts`, `retained_items_routing_corpus_test.ts`,
`retained_honoured.ts`, `retained_honoured_test.ts`,
`20260921210000_une_note_coche_la_case_repas_leger.sql`,
`2026-09-21-2200-banc-corpus-memoire.ts`.

**Modifiés** — `retained_item.ts`, `draft_note_classify.ts`, `draft_note_classify_io.ts`,
`retained_items_routing.ts`, `food_exclusion_belt.ts`, `meal_generation.ts`,
`final_plan_gate.ts`, `memory_recap.ts`, `generate-household-meal-v1/index.ts`,
`NOMENCLATURE-MEMOIRE.md`, plus les tests qui épinglaient ce qui a bougé
(`draft_note_classify_test.ts`, `retained_items_routing_test.ts`,
`retained_items_wiring_test.ts`, `retained_items_io_test.ts`, `constant_pins_test.ts`,
`food_exclusion_belt_test.ts`, `moteur_unique_contre_exemples_test.ts`),
`scripts/ci/token-lint.mjs`, `scripts/ci/wiring-check.mjs`.

## 9. Vérifications

```
deno test --parallel --allow-read --allow-env supabase/functions/_shared/keel/
  → 7 644 passés · 0 échec · 2 ignorés      (baseline : 7 527 · 0 · 2)
deno check  (les 4 entrypoints du gate)     → vert
tsc -p frontend/tsconfig.app.json --noEmit  → vert
npx vitest run src/keel/api/retainedItems.int.test.ts → 89 passés (parité front ↔ back)
npx supabase migration up --local           → appliquée
```
