# Chantier mémoire — d'abord une série de tests, puis le lecteur

> Prompt pour une session Claude Code sur `Sophia 2`, branche courante.
> Rien de ce lot n'est commité par l'agent ; le propriétaire commite.

## Mission

La mémoire du produit vient de DEUX producteurs : le questionnaire de fin de
plan (`questionnaire`) et la note écrite sur un brouillon (`draft_note`). Elle
est censée alimenter, sans que personne ne ressaisisse rien : les préférences
alimentaires, l'appétit, le rythme des repas, la logistique, les envies, et les
« choses importantes à retenir » d'un foyer. Aujourd'hui elle RETIENT mais
n'APPREND pas : une note est rangée telle quelle dans une famille approchante,
la composition la relit en prose, et rien ne mesure si le plan suivant l'a
honorée. Ce lot commence par une série de tests qui disent, cas par cas, ce que
la mémoire devrait retenir et ce que le plan suivant devrait en faire. Le code
ne bouge qu'après, guidé par ces tests.

## À lire avant d'écrire une ligne

- `CLAUDE.md` et `AGENTS.md` (commandes interdites, « KEEL » jamais sur une
  surface utilisateur, vocabulaires fermés, pas de matcher maison).
- `docs/keel/NOMENCLATURE-MEMOIRE.md` — l'autorité : les axes `kind`, `scope`,
  `subject`, `source`, la matrice `canProduce`, les cellules retirées.
- `docs/keel/RETOURS-ET-BILAN-CE-QUE-CA-CHANGE.md` — ce que le retour de fin
  de plan a le droit de changer.
- `supabase/functions/_shared/keel/retained_item.ts` (les 8 familles, les 2
  portées, les sujets, `canProduce`/`canHold`), `draft_note_classify.ts` +
  `_io.ts` (le lecteur de note : prompt, schéma, parseur),
  `plan_feedback.ts`, `plan_feedback_retained.ts` (le questionnaire → items),
  `retained_items_routing.ts` (les 5 destinations), `retained_items_io.ts`,
  `retained_next_plan.ts`, `memory_recap.ts`, `memory_clarification.ts`,
  `feedback_index.ts`, `energy_band_feedback.ts`.
- Dans `generate-household-meal-v1/index.ts` : `routeRetainedItems(` (~4315),
  le journal `keel.household_meal.retained_items` (~4730), et les lignes
  `said:` des cartes (`household_prompt_v34.ts`).
- Les mémoires de session pertinentes (dossier mémoire du projet) :
  `a-note-moves-the-words-not-the-grams`, `plan-feedback-allergy-becomes-an-
  expiring-preference`, `food-preference-memory-lifecycle`,
  `memorizer-to-generator-only-food-preferences`, `never-hand-roll-a-matcher-
  here`, `model-declared-fields-need-a-counter`, `optional-gate-params-are-
  disarmed-gates`, `promise-and-schema-key-must-be-adjacent`.

## Ce qui a été mesuré le 2026-09-21, sur un foyer réel en local

1. **Une note composite devient UN souvenir illisible.** Note : « Je veux pas
   de choses genre tofu, poissons au petit déjeuné ». Retenu : un seul
   `food.exclude`, `text: "tofu, poissons au petit déjeuné"`, `scope:
   durable`, `subject: household`. Le moment (« au petit déjeuner ») est
   enfermé dans le texte ; la liste n'est pas découpée. La ceinture
   d'exclusion n'a rien pu vérifier (`exclusion_belt.checked: 0`) parce que ce
   texte n'est pas un aliment. Le modèle a reçu la phrase en prose sur la
   carte de Thomas (`said: …`) et a servi « Tofu, pain complet et pêche » au
   petit-déjeuner partagé deux jours plus tard.
2. **« Très léger le matin » ne touche jamais la taille du repas.** Note du
   2026-09-20 pour Christèle : « le matin c'est plutôt quelque chose de très
   léger… fruit, bol de muesli, mais les œufs ça lui convient pas ». Retenu :
   `food.prefer fruit`, `food.prefer bol de muesli`, `food.exclude lesoeufs`
   (la faute de frappe est gardée telle quelle). La taille du moment n'a pas
   de famille : le levier existe (`household_member_habits.light`,
   `LIGHT_SLOT_WEIGHT`, la case « repas léger » de la fiche) et aucun
   producteur ne l'écrit. Son petit-déjeuner est resté à 500 kcal.
3. **Un souvenir de foyer atterrit sur la carte d'une seule personne.**
   `subject: household` est rendu sous « == Thomas == ».
4. **Rien ne dit si un souvenir a été honoré.** Aucun compteur ne compare un
   `food.exclude` au plan livré. Le seul contrôle est la ceinture, qui ne
   voit que ce qu'elle sait résoudre en aliment.
5. **Le chemin questionnaire n'a pas été relu** dans cette session : ce qu'il
   écrit (`plan_feedback_retained.ts`), ce que `feedback_index.ts` et
   `energy_band_feedback.ts` en font, et si l'appétit (`portion.adjust` →
   `household_member_bodies.appetite`) suit. À auditer avec la même méthode.

## Étape 0 — la série de tests, avant tout code

Écrire un corpus fermé, en français tel que les gens tapent (fautes comprises),
et pour chaque entrée dire ce que la mémoire doit rendre. Trois niveaux, trois
fichiers, tous purs (aucun appel modèle dans un test) :

**A. Le lecteur** (`draft_note_classify_corpus_test.ts`, `plan_feedback_
retained_corpus_test.ts`). Table : `{ note, expected: RetainedItem[] }` — au
moins 40 notes de brouillon et les réponses du questionnaire. Chaque attendu
nomme `kind`, `scope`, `subject`, le texte DÉCOUPÉ (un aliment par item), le
moment quand la phrase en porte un, et la citation. Cas obligatoires :
- liste d'aliments + moment (« pas de tofu ni de poisson le matin ») → deux
  items, chacun scopé au petit-déjeuner ;
- taille d'un moment (« très léger le matin », « gros dîner ») → la famille
  qui écrit `light` ou la taille, pas un `food.prefer` ;
- appétit (« ma mère ne mange pas autant ») → `portion.adjust` sur la bonne
  bouche, jamais un chiffre ;
- allergie sur un retour de plan → préférence périssable, jamais la table de
  sécurité (mémoire `plan-feedback-allergy…`) ;
- faute de frappe (« lesoeufs ») → citation intacte, `text` normalisé par le
  modèle et jamais par un matcher ;
- phrase qui n'est pas un souvenir (« c'était bien ») → rien, et `skipped`
  nommé ;
- prénom ambigu, deux bouches → `clarify`, pas une devinette ;
- contre-ordre (« du poisson le matin ça me va ») → l'item qui rouvre ce que
  la règle du prompt ferme.
Le parseur est testé sur des SORTIES modèle en dur (JSON fixtures), pas sur le
modèle. Le prompt du classifieur est testé par câblage (chaque famille promise
est adjacente à sa clé de schéma).

**B. Le routage et la carte** (`retained_items_routing_corpus_test.ts`,
`household_prompt_v34` câblage). Pour chaque item du corpus : sa destination
(les 5 de `retained_items_routing.ts`), et la ligne rendue : un `subject:
household` ne sort JAMAIS sous une seule carte ; un item scopé à un moment est
rendu sur ce moment, dans la langue de la case (« breakfast »), pas en prose
française enfouie.

**C. L'effet sur le plan** (`retained_honoured_test.ts`, module pur nouveau).
Une fonction `retainedHonoured({ items, dishes, preparations, groupOf })` qui
lit la LIGNE ÉCRITE (boîtes servies, casseroles au prorata — même lecture que
`plan_food_quality.ts`) et rend, par item : honoré / violé / non vérifiable,
avec le plat fautif. Fixtures : le plan `e36d0bad` du 2026-09-21 (tofu au
petit-déjeuner de jeudi) doit sortir « violé ». Compteur
`generated_from.retained_honoured` avec dénominateur (« aucun souvenir » ≠
« aucun contrôle »).

Les tests A et C sont ROUGES sur le code d'aujourd'hui pour les cas 1 et 2 :
c'est voulu, ils décrivent la cible. Ne pas les mettre en `ignore` ; les
livrer dans le même lot que le code qui les fait passer, ou dans un lot
précédent en le disant.

## Étape 1 — le vocabulaire (après les tests, jamais avant)

- Un moment sur `food.exclude` / `food.prefer` / `method.*` : champ REQUIS et
  nullable (`occasion: RhythmOccasion | null`), jamais `?`. Le parseur refuse
  un jeton hors liste. `NOMENCLATURE-MEMOIRE.md` est mis à jour dans le même
  commit ; la matrice `canProduce` reste la seule porte.
- Découpage : une liste rend N items partageant `quote`. Fait par le modèle
  (le prompt le demande, le schéma est un tableau), jamais par un split sur
  la virgule.
- La taille d'un moment : décider avec la nomenclature entre une nouvelle
  famille (`slot.size`) et une valeur sur `rhythm.set` ; l'écrivain est
  `household_member_habits.light` (existant), pas une seconde vérité. Une
  seule destination, nommée dans `retained_items_routing.ts`.

## Étape 2 — la lecture par le plan

- La ceinture d'exclusion lit le moment : un `food.exclude` scopé au
  petit-déjeuner mord sur les cases `breakfast` et se compte séparément.
- La carte rend les souvenirs de foyer dans le bloc du foyer, et les souvenirs
  de bouche sur SA carte, avec leur moment.
- `retained_honoured` tourne sur le plan livré, entre dans `generated_from`,
  dans le journal, et sur la carte « ce qu'on sait de toi » (état : honoré,
  ignoré, non vérifiable — sans jamais nommer KEEL).

## Étape 3 — le chemin questionnaire

Même méthode : corpus des réponses fermées de `plan_feedback.ts` → items
attendus → destination → effet. Vérifier en particulier l'appétit, les plats
« encore / sans moi » (`feedback_index.ts`), la bande d'énergie
(`energy_band_feedback.ts`), et que `memory_recap.ts` relit ce qui a été écrit
et pas autre chose.

## Étape 4 — le banc (réel, compté, à part)

Un script de banc, comme `banc KEEL` (`--since` obligatoire), qui rejoue le
corpus A sur le VRAI classifieur et compte les écarts par famille — jamais un
test. Un run réel de composition sur le foyer local après une note, et lecture
de `retained_honoured` sur la ligne écrite.

## Contraintes, non négociables

- Vocabulaires fermés : chaque valeur nouvelle a sa branche nommée et son
  test qui l'épingle. Aucun `?` sur un champ de garde.
- Aucun matcher maison sur du texte libre (« laitue » ≠ « lait ») : le modèle
  classe, le référentiel résout, et l'échec de résolution se COMPTE.
- Chaque champ que le modèle déclare a un compteur avec dénominateur.
- Les nombres des tests sont écrits en dur, jamais recalculés par la fonction
  sous test ; les tests de câblage lisent la source.
- `db reset`, `db push`, `functions deploy`, secrets : jamais. Migrations en
  local par `migration up` seulement, et dire au propriétaire ce qui reste à
  pousser.
- Redémarrer `functions serve` après toute modification de `_shared/`.
- Rien de personnel dans les journaux (pas de `member_id` en face d'un
  grammage) ; « KEEL » n'apparaît sur aucune surface lue par une personne.

## Livrables et fin de lot

1. Les trois fichiers de tests de l'étape 0, avec leur corpus.
2. Le vocabulaire et le routage de l'étape 1, nomenclature à jour.
3. La lecture par le plan de l'étape 2, compteur compris.
4. L'audit du questionnaire (étape 3) : ce qui marche, ce qui manque, chiffré.
5. Un run réel en local après une note du type du cas 1, avec
   `retained_honoured` lu sur la ligne écrite, et le rapport au propriétaire :
   ce qui est fait, ce qui ne l'est pas, ce qui a été mesuré. Rien de commité.
