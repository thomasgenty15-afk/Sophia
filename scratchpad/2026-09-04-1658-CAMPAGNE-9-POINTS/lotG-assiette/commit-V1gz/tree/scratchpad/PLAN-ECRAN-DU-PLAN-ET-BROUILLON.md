# PLAN — l'écran du plan, et le brouillon avec feedback

**Date :** 2026-08-11 · **Deux lots, une gate entre les deux**
**Fiches à écrire avant le code :** FF-053 (l'écran) · FF-054 (le brouillon)

---

## 0 · Le socle — ce que rien ici n'a le droit de casser

| Règle | Où elle est écrite | Ce qu'elle interdit ici |
|---|---|---|
| Le coach ne produit rien de personnel, aucun canal 1:1 | `MODEL.md` | le feedback de l'élève ne remonte **jamais** au coach, sous aucune forme |
| La doctrine ne s'affiche jamais | en-tête de `MealBuilder.tsx` | ni la grille, ni le bloc cuisine, ni une section ne montrent une croyance ou un interdit |
| Aucun chiffre **sur la personne** | `CONTRACT.md` | la zone de feedback est une **entrée d'élève** : la garde doit être à l'entrée, pas seulement à la sortie |
| Plancher TCA | FF-030 R5 | même zone pour tous, vocabulaire gardé, **même phrase de refus pour tout le monde** |
| Rien ne se coche hors d'aujourd'hui | `lib/useMealTicks.ts` | la grille et les sections n'ajoutent **aucune** case, aucun statut, aucune série |

---

## LOT 1 · L'écran du plan — front seul, livrable tout de suite

Aucune migration, aucun appel modèle, aucune surface de sécurité neuve. Toute la
donnée nécessaire est **déjà** dans ce que la fonction renvoie.

### Étape 1 — Extraire le rendu du résultat hors de `MealBuilder`

`MealBuilder.tsx` fait **1 019 lignes** et porte déjà le formulaire, le choix de
fenêtre, la grille de créneaux, le rendu du résultat, la liste de courses et
l'avertissement de chevauchement. Y ajouter trois niveaux d'affichage le rend
illisible.

**Mais la vraie raison n'est pas la longueur :** le rendu d'un plan devra être
monté **à deux endroits** — `/app/plan` et la pop-up du brouillon. Un rendu
dupliqué diverge.

- Nouveau `components/plan/PlanResult.tsx` — reçoit un plan, ne sait pas d'où il
  vient (adopté ou brouillon).
- `MealBuilder` garde le formulaire et l'appel ; il monte `PlanResult`.
- **Vérification :** l'écran est identique au pixel avant/après. Aucun
  comportement changé à cette étape.

### Étape 2 — La grille (la vue globale)

`components/plan/PlanGrid.tsx`.

- **Lignes** = les moments du rythme déclaré, **pas** six lignes fixes. Même
  source que `MealPickerGrid` : trois repas font trois lignes.
- **Colonnes** = les jours de la fenêtre **dans l'ordre du plan**
  (`stretchDayOrder`), jamais l'ordre du calendrier — une compo faite un mercredi
  ne remet pas lundi en tête.
- **Cellule** = le titre du plat, tronqué. Rien d'autre.
- **Géométrie** : `<table>` + colonne de créneaux collante + `overflow-x-auto` +
  `min-w`. C'est exactement ce que `MealPickerGrid` fait déjà, et c'est le seul
  patron de grille qui survive au mobile.

⚠️ **Ne pas recopier la géométrie.** Extraire le squelette commun
(`SlotDayTable`) et le faire servir aux deux. `MealPickerGrid.tsx` n'est pas
commité et appartient à une autre lane : **se coordonner avant de le toucher**,
ou dupliquer sciemment et l'écrire.

**Une cellule vide n'a pas une seule cause, et c'est le point.** Quatre raisons,
qui ne doivent pas se ressembler :

| Cellule | Pourquoi | D'où vient l'info |
|---|---|---|
| un plat | composé | `dishes` |
| « cantine » | l'élève n'est pas là | `away_days` (FF-002) — **déjà** un prop de `MealPickerGrid` |
| « ton shaker » | apport fixe remplaçant | `fixed_intakes` (FF-051) — **pas encore côté front** |
| « restes » | jour de restes | `day_properties` (FF-052) — **pas encore côté front** |
| vraiment vide | le modèle n'a rien mis | l'anomalie, et elle doit se voir |

**C'est la première fois que FF-002, FF-051 et FF-052 deviennent visibles à
l'écran.** Aujourd'hui un déjeuner de cantine est juste absent, sans explication.

**Point d'intégration à trancher (étape 2a) :** le front a `away_days`, pas les
deux autres. Soit la fonction les renvoie dans sa réponse, soit le front lit
`student_goals`. Je penche pour **la réponse de la fonction** : c'est elle qui
sait ce qu'elle a réellement lu — y compris les entrées qu'elle a écartées.

### Étape 3 — Le bloc cuisine, épinglé

`components/plan/KitchenBlock.tsx`, au-dessus des jours.

- Une ligne par `preparation` : titre, jour de cuisson, portions produites, et
  **quels jours elle nourrit** — dérivé des `dish.uses`, pas d'un champ neuf.
- Les `cooking_sessions` donnent l'ordre.
- **Aucune préparation ⇒ le bloc ne s'affiche pas.** Pas de titre orphelin.

C'est ce bloc qui rend le repli des jours acceptable : le lien « une casserole →
trois jours » ne dépend plus de voir les trois jours en même temps.

### Étape 4 — Les sections repliables + la barre de jours

- Une section par jour, **repliée sauf le jour courant** (ou le premier jour de
  la fenêtre si elle est entièrement à venir).
- En-tête : le libellé du jour, plus les marqueurs — *aujourd'hui* / *passé*
  (existent déjà), *absent*, *jour de lot*, *jour de restes*.
- Barre de jours collante pour sauter.

⚠️ **Mobile.** Deux états coupés à `lg`, la barre d'onglets élève réserve déjà
du padding. La barre de jours doit vivre avec, et se tester à **320 px**.

⚠️ **Un jour `leftovers` replié qui ne dit pas qu'il est un jour de restes
ressemble à un jour vide.** Les marqueurs ne sont pas de la décoration : ils sont
ce qui permet de décider s'il faut ouvrir.

### Étape 5 — Le marquage des lots

En grille, la répétition saute aux yeux — c'est ce qui rend le feedback possible.
Mais **trois cellules identiques peuvent être un lot intelligent ou un modèle
paresseux**, et à l'œil nu ça se ressemble.

La donnée sait les distinguer : `uses` non vide veut dire « ça vient d'une
préparation ». La grille **et** la carte doivent le porter (« du lot de
dimanche »), sinon on fera juger comme un défaut le comportement même que FF-052
cherche à produire.

### Vérification du lot 1

1. `npx tsc -p frontend/tsconfig.app.json --noEmit` — **c'est ce fichier-là**,
   `tsconfig.json` ne vérifie rien (`files: []`).
2. `npm run test:int` — tests vitest neufs : dérivation des lignes depuis le
   rythme, ordre des colonnes = ordre du plan, les cinq états de cellule, le
   bloc cuisine absent quand il n'y a pas de préparation.
3. `npm run test:e2e` — un scénario Playwright : le plan s'ouvre sur le jour
   courant, les autres sont repliés, la grille montre autant de colonnes que de
   jours, un jour de restes est marqué.
4. **À 320 px** : aucun scroll horizontal du `body` ; seule la grille scrolle,
   dans son propre conteneur.
5. `npm run lint`.

---

## GATE — mesurable, et elle commande le lot 2

> **Le lot 2 ne démarre que si une génération réelle de sept jours est sous
> 90 s au p50.**

Mesuré aujourd'hui : **180 s** sur `gpt-5.6-sol` (le défaut actuel), **75 s** sur
`gpt-5.6-terra`, **52 s** sur `gemini-3.6-flash`.

À 180 s, trois tours de feedback font **neuf minutes**. Un brouillon interactif à
neuf minutes n'existe pas — on livrerait une fonctionnalité que personne
n'utiliserait deux fois. Le changement de modèle n'est donc plus une
optimisation de coût : **c'est une condition d'existence.**

La commande est prête dans `RAPPORT-BANC-MODELES.md` §5 ; les secrets me sont
bloqués, c'est au propriétaire de la passer.

**Second pré-requis, indépendant :** la lane locale authentifiée est cassée
(GoTrue signe en ES256, le runtime vérifie en HS256). Sans elle, **aucun run
réel ni e2e du lot 2 n'est possible** — et les scripts QA du dépôt sont cassés
avec. Détail dans `RAPPORT-LIVENESS.md` §3.

---

## LOT 2 · Le brouillon et le feedback

### Étape 6 — `intent: "draft"`

`generate-meal-v1/index.ts:298` valide déjà `intent` contre une liste **fermée**
(`replace_current | prepare_next`). On y ajoute `draft`.

- En `draft` : tout tourne — prompt, parseur, verdict, correction — et **le RPC
  d'écriture n'est pas appelé**. Le plan revient au client, la base ne connaît
  que les plans adoptés.
- **Aucun état de brouillon en base.** La contrainte d'exclusion sur les fenêtres
  vivantes reste intacte, et il n'y a pas de deuxième cycle de vie à tenir.
- **Arbitrage à acter :** un brouillon **n'écrit pas** de ligne de verdict (elle
  exige un `meal_id`, qui n'existe pas encore). L'observation des brouillons
  passe par la trace de l'étape 9, pas par `meal_composition_verdicts`.

### Étape 7 — La zone de feedback, et sa garde d'entrée

Nouveau module **pur** `_shared/keel/plan_feedback.ts` :

```ts
parseFeedback(text, { restrictionFlag }) → { kept: string; refused: RefusalToken[] }
```

- `findNumericTarget` (déjà écrit, déjà utilisé en sortie) appliqué à l'**entrée**.
- Le lexique de restriction (`nutrition_lexicon.ts`) appliqué à l'entrée.
- **On refuse la clause, pas le texte entier**, et on le dit. Refuser tout le
  feedback parce qu'une phrase contenait un chiffre ferait recommencer l'élève à
  l'aveugle.
- Liste **fermée** de motifs de refus. **La même phrase pour tout le monde** : la
  garde ne doit pas désigner qui est sous plancher.
- Testé **EN et FR** — `profiles.locale` vaut `fr-FR` par défaut.

⚠️ **Le texte de l'élève atterrit dans le même prompt que la doctrine du coach.**
Quelqu'un peut écrire « ignore les règles du coach ». Le verrou de doctrine est
post-génération et le rattraperait ; c'est à écrire dans la fiche plutôt qu'à
découvrir.

### Étape 8 — La regénération, par le tuyau existant

**On ne construit pas une seconde machinerie de relance.** FF-040 en a déjà une :
verdict → jetons → `correctionRetryInstruction`, dont la forme impose de **dire
ce qu'il faut faire, jamais ce qui cloche**.

Le feedback humain entre par là : le prompt reçoit le plan précédent en référence
plus l'instruction dérivée du feedback, dans la même forme impérative.

- **Un seul** bump de `MEAL_PROMPT_VERSION`.
- Test de **désarmement par égalité de chaîne** : aucun feedback ⇒ consigne
  identique au caractère près à celle d'aujourd'hui.

### Étape 9 — Le plafond, et la trace qui spécifie la suite

- **Trois tours**, puis « adopte ou repars ». Le plafond est dit à l'écran, pas
  découvert en butant dedans.
- Nouvelle table `plan_feedback_rounds` : `user_id`, `round`, le texte **gardé**,
  les motifs refusés, adopté ou abandonné, l'horodatage.

**Cette trace est la spec de l'étape chirurgicale.** Si les gens écrivent
« change juste mardi », le ciblage se justifie tout seul ; si c'est « trop de
poulet », le tour complet suffit. On ne devine pas, on lit.

Discipline de table neuve, non négociable dans ce dépôt :
`revoke all from anon, authenticated` (les privilèges par défaut donnent **tout**
à `authenticated`), cascade RGPD sur `auth.users`, et la table **nommée** dans
`account-export-v1`.

### Étape 10 — La case « retenir ça »

Écrit directement dans `practical_constraints.food_preferences`.

**Elle ne passe pas par le pont mémoire.** `food_preference_promotion` est
calibré pour des items dérivés de la conversation : cinq clés de domaine et un
seuil de confiance de 0,7. Un élève qui coche explicitement est **plus fort que
n'importe quel score** — le faire transiter par la machinerie de confiance
reviendrait à pouvoir refuser ce qu'il vient d'affirmer.

**Arbitrage :** la case est proposée **décochée sur chaque feedback**, sans
essayer de deviner ce qui est durable. « Pas de poisson » et « trop de poulet
cette semaine » ne se distinguent pas de façon fiable, et deviner produirait des
règles que l'élève n'a pas posées.

### Étape 11 — L'adoption

- Écrit **exactement le plan qui a été montré** — aucune regénération à
  l'adoption.
- Passe par le RPC existant, avec `replaces` quand une fenêtre chevauche.
- Le brouillon vit côté client. **Arbitrage à acter :** fermer l'onglet le perd.
  Le persister réintroduirait l'état en base qu'on vient d'éviter ; on assume,
  et on le dit à l'écran.

### Vérification du lot 2

1. `deno test` complet sur `_shared/keel/`, **sans** `--no-check`.
2. `npx tsc -p frontend/tsconfig.app.json --noEmit`.
3. Migration appliquée **deux fois** (`if not exists`, `drop … if exists` avant
   `add`). Jamais de `db reset`.
4. **Run réel** : runtime edge redémarré d'abord (un `_shared` modifié n'est pas
   rechargé), timeout Kong étendu, `intent: draft` → feedback → regénération →
   adoption, et on vérifie qu'une seule ligne est écrite, à l'adoption.
5. Une sonde de la garde d'entrée sur un élève sous `restriction_flag`.

---

## Les arbitrages à acter dans les fiches

| # | Question | Ma recommandation |
|---|---|---|
| A1 | Le front lit `fixed_intakes` / `day_properties` où ? | dans la **réponse de la fonction** — elle seule sait ce qu'elle a lu et ce qu'elle a écarté |
| A2 | Un brouillon écrit-il un verdict ? | **non** — pas de `meal_id`. La trace de l'étape 9 le remplace |
| A3 | Le brouillon survit-il à la fermeture de l'onglet ? | **non**, et c'est dit à l'écran |
| A4 | La case « retenir ça » est-elle proposée toujours ? | **oui, décochée** — deviner produirait des règles non posées |
| A5 | Un jour replié porte-t-il un résumé ? | **non** — la grille est le sommaire. À revoir si l'usage dit le contraire |
| A6 | Squelette de table partagé avec `MealPickerGrid` ? | **oui**, après coordination avec la lane qui le possède |

---

## Interdits absolus

- Le feedback ne remonte **jamais** au coach, sous aucune forme.
- **Aucun chiffre sur la personne**, y compris dans un message de refus.
- Aucune case à cocher, aucun statut, aucune série ajoutés par ces écrans.
- La doctrine ne s'affiche pas.
- Pas de seconde machinerie de relance.
- 🚫 `supabase db reset`, jamais, ni en le demandant.
- Ne pas toucher `generation_model.ts`, `dietary_regime.ts`, ni les migrations
  appliquées.
- **Ne pas committer `supabase/config.toml`** : il porte le travail non commité
  d'une autre session.
- Ni push, ni deploy, ni `db push`.

---

## Livrables

| Lot | Livrable |
|---|---|
| — | `FF-053-l-ecran-du-plan.md`, `FF-054-le-brouillon-et-le-feedback.md` |
| 1 | `PlanResult`, `PlanGrid`, `KitchenBlock`, sections + barre de jours, marquage des lots, tests vitest + e2e |
| gate | la mesure de latence, ou le constat que la gate n'est pas passée |
| 2 | `plan_feedback.ts` + tests, `intent: draft`, la regénération, la table de trace + sa migration, la case « retenir ça », l'adoption |
| fin | `scratchpad/RAPPORT-ECRAN-ET-BROUILLON.md` — ce qui est livré, ce qui est mesuré, ce qui est resté fermé |

**Un commit par étape**, message français en minuscules.
