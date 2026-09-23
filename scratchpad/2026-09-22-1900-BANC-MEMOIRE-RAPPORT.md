# Banc mémoire — six passages réels sur le corpus de 56 notes (2026-09-22)

> Script : `scripts/2026-09-21-2200-banc-corpus-memoire.ts` — le VRAI classifieur
> (`gpt-5.6-luna`), le même lecteur que la production, aucune écriture en base.
> Rien n'est commité par l'agent.

## Le score, passage par passage

| passage | notes exactes | ce qui a été corrigé entre deux passages |
|---|---|---|
| 1 | **47/56** | 8 écarts sur 9 accusaient mes fixtures (pronoms sans référent, attendus écrits avant les lots B/C) ; 1 vrai trou : « plus de fruits à coque, **ça me rend malade** » → `clarify: who`. Règle ajoutée : *une raison à la première personne ne nomme pas une personne*. |
| 2 | **53/56** | `clarify` en trop : 5 → **0**. Deux fixtures reformulées (« j'aime pas trop » lu comme une quantité ; « plus de légumes » = l'ambiguïté que ma propre règle ordonne de lâcher). 1 vrai trou : « jamais de poisson **le jeudi** » rangé en interdiction de tous les jours. Règle ajoutée sur la ligne `kind` de la porte ① (le moment est le repas, pas le jour → mémo). |
| 3 | **55/56** | « lesoeuf ça convient pas à Christèle » : le modèle a écrit **la phrase entière** dans `text` ; le lecteur l'a refusée (`badText`) par UN caractère de trop — une note plus longue l'aurait gardée. Mesuré **2/6** sur cette note. Règle ajoutée sur la ligne `"text"` : *l'aliment, pas le verdict ni la personne — `kind` porte le verdict, `member_id` la personne*. Après : **0/6**. |
| 4 | **55/56** | « du muesli **plutôt qu'**un bol de céréales » : le perdant de la comparaison rangé en `food.exclude céréales, never`. Règle ajoutée sur la ligne `"force"` : *une comparaison n'est pas une interdiction, le perdant ne se range pas*. Après : **0/6**. |
| 5 | **55/56** | « plus de saumon » : direction indécidable correctement lâchée, mais **neuf listes vides sans motif** (1/6). La règle « DIRECTION FIRST » disait « leave the item out » sans dire où ; la règle qui exige de nommer un vide vit dans le tiroir 7, 180 lignes plus bas. Règle complétée : *… et le nommer dans `skipped` (7) avec `other`*. Après : **0/6**. |
| 6 | **54/56** | Les trois règles ont tenu. Deux nouveaux écarts, tous deux passés 5/5 avant : « j'ai envie de pâtes » rangé `food.prefer` au lieu de `craving` dans le bon encart, pour la bonne bouche (**1/7**, même portée, même effet — laissé tel quel) ; la note du 20 septembre entière : « léger » coché et les œufs rangés, mais **fruit et muesli laissés tomber sans être nommés** (**2/7**). Le tiroir `slots` donnait « very light in the morning » en exemple de taille et ne disait rien des aliments cités avec elle. Règle ajoutée : *la taille dit combien, les aliments disent quoi, aucun n'absorbe l'autre*. Après : **0/6**. |
| 7 | **56/56** | Les quatre règles ensemble. Aucun écart, aucun tiroir en trop. |

Aux passages 4, 5 et 6, les réparations d'avant ont **tenu** (aucun cas réparé n'est retombé).

## Ce que le banc a appris sur lui-même

`(rien)` cachait deux défauts sous un seul mot : un modèle qui ne range rien, et
un lecteur qui refuse ce que le modèle a rangé. Le banc imprime maintenant, sur
chaque écart, la ligne `lecteur: ok · preferences proposé 1 gardé 0 refusé
{badText:1}` (ou `REFUS GLOBAL <motif>`), et `--raw` ajoute la sortie brute du
modèle. C'est ce qui a permis de trancher le passage 3 sans relancer à
l'aveugle.

## Le tableau par tiroir, passage 7

```
tiroir          attendu    exact  en trop
cells                 3        3        0
clarify               6        6        0
next_plan             5        5        0
notes                 3        3        0
portions              1        1        0
preferences          32       32        0
settings              5        5        0
skipped              11       11        0
slots                 4        4        0
```

## Ce que ça dit, en trois réponses

**Ça classe.** 47 → 53 → 55 → 55 → 55 → 54 → **56/56**, chaque écart mesuré
puis fermé sur 6 tirages ciblés, et les réparations d'avant tenues à chaque
passage suivant. ⚠️ 56/56 est UN tirage : les passages 3 à 6 montrent qu'un
cas sur 56 peut retomber 1 fois sur 6 ou 7 sans qu'une règle ait bougé. Les quatre derniers trous avaient la même forme : une
règle qui dit *quoi* faire sans dire *où* ça va (le verdict, le perdant d'une
comparaison, l'item lâché, les aliments cités avec une taille).

**Ça pose les bonnes questions — au banc.** Les 6 cas qui doivent lever une
question la lèvent, 0 question parasite depuis le passage 2. **En production,
la question est désarmée depuis le 2026-09-07**
(`draft_note_classify_io.ts`, « LA QUESTION DE CLARIFICATION EST DÉSARMÉE ») :
`clarify.entries` est compté (`clarify_not_asked`) et perdu. Une seule question
survit, « c'est pour qui ? » sur une **part** (`DraftNoteQuestion.kind ===
"portion"`), posée sous le champ dans `PlanDraftDialog`, réponse par
`answerNote`. Les `about: who` sur un aliment et `about: what` sur une
catégorie n'ont pas ce canal. Ce n'est pas un bug de ce chantier : c'est une
décision datée, et le canal sous le champ existe pour l'étendre. **Non fait.**

**Le foyer est en place**, avec un reste : canal propre pour `subject:
household` dans le routage, refus `not_owner` à l'écriture (garde étroite,
1 437 comptes sans ligne de foyer non bloqués), remplacement à l'écriture
(`supersedes`), carte qui sépare foyer et personne. **Non fait** : l'état
lecture seule de la carte pour une bouche secondaire (le geste est offert puis
refusé) ; le sas pour les formes que le référentiel ne résout pas.

## État

- Suite `_shared/keel/` : **7 734 passés · 0 échec · 2 ignorés** ;
  `deno check` vert sur `generate-household-meal-v1` et `keel-read-note-v1`.
- Fichiers touchés aujourd'hui, en plus des lots A–D :
  `draft_note_classify.ts` (4 règles), `draft_note_classify_corpus_test.ts`
  (4 tests qui les épinglent, chacun avec la mesure qui l'a motivé),
  `scripts/2026-09-21-2200-banc-corpus-memoire.ts` (`lecteur:` + `--raw`).
- À faire par le propriétaire : `npx supabase db push --linked` (deux
  migrations : case « repas léger », refus `not_owner`) ; supprimer `stash@{0}`
  une fois vérifié.

---

# 2026-09-23 — Notes HORS corpus, et un run de bout en bout

> Le corpus a servi à ÉCRIRE les règles : 56/56 dessus mesure aussi l'ajustement.
> `scripts/2026-09-23-0100-banc-notes-libres.ts` rejoue des notes que personne n'a
> lues en écrivant une règle, et imprime ce qui est rangé — un humain juge.

## Trois jeux de notes neuves (30 notes, 5 → 12 par jeu)

| jeu | notes | propres | ce qui a été trouvé |
|---|---|---|---|
| 1 | 12 (5 simples, 7 composées) | 7 | **une catégorie énoncée en règle devenait le seul plat du plan** : « les enfants ne mangent pas de poisson sauf le saumon » → `food.exclude «Cabillaud vapeur»` **7/7** ; « moins de viande rouge » → «Bœuf braisé» 3/7. La règle WHAT (« si UN SEUL aliment du plan convient, range-le ») ne distinguait pas une réaction à un plat servi d'une règle sur une catégorie — alors que la ceinture DÉPLIE une catégorie en espèces toute seule. Règle bornée au plat SERVI, la catégorie reste la catégorie. Après : **12/12**. |
| 2 | 10 | 8 | **« moi » = toute la table** : « le petit dej c'est juste un café POUR MOI » → « léger » pour les quatre (6/6) ; « moi le soir je mange pas de féculents » → féculents retirés à quatre personnes (3/3) ; « Thomas et moi » → Christèle, devinée. Le rôle ne disait pas qui écrit. `DraftNoteMember.writes` (REQUIS, depuis `household_members.role = 'owner'`), rendu sur chaque ligne du rôle, règle WHO. Après : **12/12**. |
| — | corpus, run 9 | 52/58 | **la première règle débordait** : « je veux pas de tofu le matin », « j'ai envie de fajitas », « ça me va » rangés sur Thomas. Réécrite : *le cuisinier parle pour la table par défaut ; « moi » ne le désigne que quand la phrase le met À PART, ou parle de son corps ou de son assiette*. « j'ai encore faim » est désormais SA part (l'attendu « clarify » datait d'avant `writes`). Run 10 : **58/58** ; les 7 notes « moi » / régressées : 21/21. |
| 3 | 8 (dont « ma fille » avec deux filles, « tout le monde sauf moi », un composite à trois tiroirs, une saison) | **8/8** | rien à corriger. |

Ce qui reste observé sans être corrigé : « plus de X » avec un verbe de désir (« Thomas voudrait plus de protéines ») est lâché par prudence (la règle DIRECTION) ; « vendredi soir c'est pizza » lu comme une case de ce plan plutôt qu'un mémo (défendable) ; `craving` écrit `food.prefer` dans le bon encart ~1/7.

## Le corpus : 47 → 53 → 55 → 55 → 55 → 54 → 56 → 55 → 52 → **58/58**

Trois règles de plus qu'hier (catégorie, `writes`, cuisinier-par-défaut), chacune épinglée par un test qui porte sa mesure, plus `draft_note_members_io_test.ts` (la jointure `role = 'owner'` → `writes`, sans repli sur la première ligne) et une garde de type (`writes` absent ⇒ refus à la compilation).

## Bout en bout sur la pile locale (vrai `keel-read-note-v1`, vraie base, vraie composition)

1. Compte QA `qa-clarif-20260904` (Claire propriétaire, Léa, Tom, Marc, Zoé). Note : « Léa ne mange pas de poisson sauf le saumon, et pour moi le petit dej c'est juste un café ». **Écrit** : `food.exclude poisson` (Léa, never, ref null — catégorie), `food.prefer saumon` (Léa, ref `salmon`), `food.prefer café` (**Claire**, @breakfast, ref `coffee`), et la case « repas léger » cochée dans `household_member_habits.slots` pour Claire. Journal : `proposed 4 kept 4 refused 0 · ref_resolved 2/3 · ref_unresolved_forms ["poisson"] · slots_moves 1 · clarify_not_asked 0`.
2. Ce foyer est **gelé** (`402 household_frozen`) : composition refusée. Refaite sur `camp0909.f1` (4 adultes, `en-GB` — le modèle écrit donc « fish », « pasta » : la langue du compte, pas de la note). Note « pas de poisson le matin, et moins de pâtes pour tout le monde », puis `generate-household-meal-v1` (brouillon, 3 jours). ⚠️ `x-request-id` doit être un **uuid** : une chaîne libre fait tomber le verrou (`invalid input syntax for type uuid` → `503 generation_lock_unavailable`).
3. La composition a tourné 171 s et a fini `failed · plan_not_deliverable` au stade `repairing` (contrôles `cell_energy`/`protein_floor` incomplets — hors mémoire). **Les lecteurs de mémoire ont tourné quand même**, deux fois (composition + réparation) : `retained_honoured {items:2, checked:1, honoured:1, violated:0, unverifiable:1 (no_baseline — le « moins de pâtes », comme prévu), by_words:1}` ; ceinture d'exclusion `bites 0`.

## État

- Suite `_shared/keel/` : **7 805 passés · 0 échec · 2 ignorés** ; `deno check` vert sur `generate-household-meal-v1`, `keel-read-note-v1`, `keel-plan-feedback-v1`.
- Nouveaux fichiers : `draft_note_members_io_test.ts`, `scripts/2026-09-23-0100-banc-notes-libres.ts`. Modifiés en plus : `draft_note_members_io.ts` (`writes`), `generate-household-meal-v1/index.ts` (3 sites, `writes: m.isOwner`), `constant_pins_test.ts` (58).
- Toujours à faire par le propriétaire : `npx supabase db push --linked` ; supprimer `stash@{0}`. Rien n'est commité.

---

# 2026-09-23 (suite) — La question « pour qui ? » réarmée, par le canal sous le champ

## Ce qui a changé

- **Le lecteur garde le moment et la force d'une entrée `clarify`** (`DraftNoteClarifyEntry.occasion` / `.force`, requis-nullables, lus par `parseRetainedItem` avec un sujet de passage ; un jeton hors liste fait tomber l'entrée, compté `malformed`). Avant, « pas de poisson LE MATIN pour ma fille » serait devenu « pas de poisson » toute la journée une fois la fille désignée.
- **`DraftNoteQuestion` = `portion | who`.** La question `who` porte le morceau à écrire (`entry`: gate, kind, text, **note** entière, occasion, force, when) et les bouches candidates avec prénom. `what` reste hors de ce canal, exprès : `keel-read-note-v1` lit sans aliments du plan (`planFoods: []`), donc « lequel ? » ne peut pas naître ; une entrée `what` est comptée (`clarify_not_asked`), jamais transformée en bouton.
- **`answerDraftNoteWho`** : le morceau revient avec la bouche ; on ne rappelle pas le modèle ; on REBÂTIT la ligne et on la passe par **le même lecteur que la note** (`readDraftNoteClassification` : famille permise, jetons, bouche sur le rôle, plafond), puis **la même porte** (`resolveAndPersist` → `persistRetainedItemsFor`, référentiel compris) et la même bulle. Bouche hors rôle → `unknown_member` ; famille interdite, moment inventé, gate hors liste → `refused`, rien d'écrit. Journal `keel/draft_note_answer` avec `about`, `gate`, `kind`, `write_ok`, `durable_written`, `ref_resolved`.
- **`resolveAndPersist`** : le bloc résolution + écriture sorti de la fonction principale pour servir les deux chemins — le dupliquer aurait doublé chaque chaîne que le test de câblage MUTE, et `.replace` ne mute que la première (mesuré : ①②③ rouges avant l'extraction).
- **`keel-read-note-v1`** accepte `answer.kind = "who"` avec `member_id` + `entry`, porte le morceau sans l'interpréter.
- **Front** : `NoteQuestion`/`NoteAnswer` en unions, lecture de `who` avec son morceau opaque, `answerNote` envoie `{kind:"who", member_id, entry}` ; `PlanDraftDialog` : même JSX (« Tu as écrit « yaourt » — c'est pour qui ? », un bouton par bouche, « Personne de la liste »), `answerQuestion` construit la réponse par genre. Aucune clé i18n nouvelle.

## Mesuré sur la pile locale (vraie fonction, vraie base)

Compte `qa-clarif-20260904` (Claire propriétaire, Léa et Zoé mineures, Tom, Marc).
1. Note « ma fille ne veut plus de yaourt le matin » → `questions: [{kind: "who", text: "yaourt", entry: {gate: preferences, kind: food.exclude, occasion: breakfast, force: never, note: <la phrase>}, options: [Léa, Zoé]}]`, rien d'écrit.
2. Tap « Zoé » → `written`, accusé « yaourt · Zoé · preference ».
3. En base : `food.exclude yaourt · member:Zoé · breakfast · never · ref plain_yogurt · quote "ma fille ne veut plus de yaourt le matin"`. (Premier passage : la citation était « yaourt » — le morceau ; corrigé en portant la note entière dans `entry`, épinglé par le test.)

## Tests

- Serveur : lecteur (moment/force gardés, jeton hors liste tombe, mémo à null) ; io (question `who` avec prénoms et morceau, rien d'écrit ; option sans prénom tombe ; `what` compté, jamais une question) ; réponse (UNE écriture par la RPC de la note avec sujet/moment/force/citation, prénom dans l'accusé, aucun appel modèle) ; refus (bouche hors rôle, famille interdite, moment inventé, gate hors liste → zéro écriture) ; mémo et encart ; câblage de `keel-read-note-v1` (accepte `who`, porte sans interpréter, passe le référentiel).
- Front : `planDraftQuestion.int.test.ts` — même geste que la part, unions, lecture de `who`, réponse repart avec `entry` tel quel.
- Suite `_shared/keel/` : **7 818 passés · 0 échec** ; `deno check` vert sur les trois entrées ; `tsc` front vert. Deux rouges front **préexistants et étrangers** à ce lot (`mouthProfileReaders` : `<ActivitySessionsCard` retiré d'une page ; `energyBasis` : 6 clés kcal ajoutées) — travail non commité d'autres sessions sur `ActivityAxesTiles.tsx`, `tracking.ts`, `fr.ts`/`en.ts`.

## Ce qui reste hors de ce lot

`what` (« lequel ? ») sur ce canal demanderait de donner les aliments du plan courant à `keel-read-note-v1` — une décision (la note est lue AVANT de composer, exprès). Le chat reste désarmé. Rien n'est commité.
