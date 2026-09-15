# PLAN DE SUITE — les quatre chantiers qui attendaient le moteur

> Prompt autoportant pour un agent qui n'a PAS le contexte de la conversation.
> Repo : `/Users/ahmedamara/Dev/Sophia 2`.
>
> ⚠️ **Ce plan s'exécute APRÈS le chantier des unités de composition**
> (`scratchpad/PLAN-IMPLEMENTATION-UNITES-DE-COMPOSITION.md`). Ses quatre
> chantiers ont été délibérément différés parce qu'ils étaient **bloqués** par
> ce moteur — pas parce qu'ils étaient secondaires. Le §1 te dit comment
> vérifier qu'ils sont débloqués, et quoi faire s'ils ne le sont pas.

---

## 1. ⛔ PORTES D'ENTRÉE — à vérifier AVANT d'écrire une ligne

Chaque chantier a sa dépendance. Vérifie-les toutes en premier, note le
résultat, et **saute proprement** (en le disant dans le rapport) tout chantier
dont la porte est fermée. Ne construis jamais un substitut à une dépendance
manquante : c'est exactement ce que ces reports existaient pour éviter.

| Chantier | Porte | Comment vérifier |
|---|---|---|
| **A · Le banc d'essai des modèles** | étape 4 livrée | `supabase/functions/_shared/keel/meal_verdict.ts` existe **et** la table `meal_composition_verdicts` se remplit |
| **B · La B12 du végan** | étape 8 livrée | le système de sentinelles détecte les trous à la semaine et sait lever `coverage_unsatisfiable` |
| **C · Les apports fixes (« le shaker »)** | étapes 2 **et** 4 | `food_composition_refs` est peuplée, `food_composition.ts` résout, `meal_envelope.ts` rend des enveloppes |
| **D · Les propriétés de jour** | aucune | mais touche le prompt — se fait **en dernier**, voir §6 |

Commandes de vérification :

```bash
ls supabase/functions/_shared/keel/meal_verdict.ts supabase/functions/_shared/keel/meal_envelope.ts supabase/functions/_shared/keel/food_composition.ts
```

```bash
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c "select count(*) from food_composition_refs;" -c "select count(*) from meal_composition_verdicts;"
```

Lis aussi `scratchpad/RAPPORT-UNITES-COMPOSITION.md` s'il existe : il porte le
verdict de la gate des 80 % et te dira si la phase II a seulement démarré.

---

## 2. Le produit, en cinq lignes

- **KEEL** : un coach écrit une **doctrine** 1:N ; c'est **l'élève** qui génère
  son plan de repas. Aucun canal 1:1.
- La sortie est **des plats avec recettes grammées**. Rien ici ne change ce
  format.
- Frontière des chiffres : **sur l'ALIMENT, jamais sur la PERSONNE**.
  « 400 g de cuisses de poulet » est normal ; « ton objectif 1800 kcal » est
  interdit partout.
- **Plancher TCA** (`restriction_flag`) au-dessus de tout : ni poids, ni
  taille, ni mesure dans un prompt ; rien qui compte à rebours.
- Le moteur **calcule en interne** et **n'affiche jamais** ses nombres.
  Mesurer n'est pas piloter, et piloter n'est pas afficher.

Autorités : `docs/keel/MODEL.md`, `docs/keel/CONTRACT.md`,
`scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` (le contrat du moteur).

## 3. La discipline du dépôt (déjà payée, non négociable)

- **Fiche FF avant code**, gabarit à 11 sections, prochain numéro libre —
  **FF-042 est pris**, tu pars de **FF-043**. Mets à jour les deux index.
- **Un paramètre de garde est REQUIS, jamais optionnel.** La casse de
  compilation qui suit est le mécanisme qui recense les appelants.
- **Une garantie est tenue au prompt ET au parseur.**
- **Liste fermée + matcher** pour tout ce qui est exécutable. Le moteur est
  `forbidden_matcher.ts` (`normalizeForMatch`) — jamais une seconde
  normalisation.
- **Deux langues.** `profiles.locale` vaut `fr-FR` par défaut : une garde
  testée en anglais seul est une garde désarmée pour la majorité des élèves.
- **Condition de désarmement testée par égalité de chaînes** : l'élève qui n'a
  rien déclaré reçoit une consigne identique au caractère près.
- 🚫 **`supabase db reset` est INTERDIT**, y compris en local, y compris « pour
  repartir propre », et il est hors périmètre de le demander au propriétaire.
  Utilise **`supabase migration up`** ou psql
  (`docker exec supabase_db_Sophia_2 psql -U postgres -d postgres`).
  **Conséquence : tes migrations doivent être ré-appliquables sur une base qui
  a déjà vécu** (`create table if not exists`, `add column if not exists`,
  `drop constraint if exists` avant `add constraint`). Vérifie-le en les
  appliquant **deux fois**.
- Versions de migration : strictement supérieures à la dernière posée. Vérifie
  `ls supabase/migrations | cut -d_ -f1 | sort | uniq -d` (les doublons
  cassent le lignage).
- **Toute table neuve** : `revoke` sur `authenticated`/`anon` (les privilèges
  par défaut Supabase donnent TOUT à `authenticated`), et réclamation par le
  lifecycle RGPD si elle porte une donnée utilisateur.
- **Typecheck front** : `npx tsc -p frontend/tsconfig.app.json --noEmit`
  (`frontend/tsconfig.json` est un solution-file qui ne vérifie rien).
- **Runtime edge local** : il sert des versions périmées des `_shared`
  modifiés — redémarre `supabase functions serve` avant tout run réel.
- **Fixture QA** : sans **plan publié**, aucun effet KEEL n'existe. Un run sur
  une fixture sans plan mesure le vide.
- Jamais un test paramétré par la constante qu'il teste : mute la constante
  pour prouver que le test mord.

---

# CHANTIER A · Le banc d'essai des modèles

**Pourquoi il attendait :** parce que le vérificateur **est** le banc d'essai.
Avant l'étape 4, comparer deux modèles revenait à lire des plans à la main et
à en discuter. Depuis, chaque génération produit un verdict, un compteur
d'issues, un taux de résolution et un taux de retry — c'est-à-dire une note.

**Ce qu'on ne fait pas :** choisir un modèle sur sa réputation ou sur des
classements généralistes. La tâche ici est très particulière (JSON structuré
long, des dizaines de contraintes simultanées dont beaucoup **négatives**), et
rien ne garantit qu'un modèle fort en général y soit fort.

### L'état actuel

`_shared/keel/generation_model.ts` : les fonctions de composition passent
`model: keelGenerationModel()`, défaut `gpt-5.6-sol`, **surchargeable par la
variable d'environnement `KEEL_GENERATION_MODEL`**. Changer de modèle pour un
run est donc une variable, pas un déploiement — c'est ce qui rend le banc
possible.

⚠️ Note le piège documenté dans ce module : pour un modèle OpenAI choisi par
l'appelant, `pickModelForAttempt` (`_shared/gemini.ts`) renvoie **le même
modèle à chaque tentative**. Un identifiant invalide ne dégrade pas, il
**arrête** — toutes les générations échouent. Vérifie chaque identifiant que tu
mets au banc avant de lancer une campagne, sur une seule génération.

### Ce que tu construis

Un harnais **rejouable** dans `scratchpad/` (pas un one-off jetable) :

1. **Un jeu de fixtures figé** — au moins 12 profils couvrant : les six
   dynamiques ; un élève sous `restriction_flag` ; un végan et un végétarien
   (les contraintes négatives sont le test discriminant) ; un foyer ; un élève
   avec des jours d'absence ; un élève avec un coach à doctrine publiée et un
   élève sans coach. **Chaque fixture a un plan publié.**
2. **Une boucle** : pour chaque modèle × chaque fixture, N générations
   (N ≥ 3, la variance entre deux appels du même modèle est réelle et il faut
   la mesurer, pas la subir).
3. **Un tableau de sortie**, une ligne par (modèle, fixture, run).

### Ce que tu mesures — et pourquoi chaque colonne

| Mesure | D'où elle vient | Ce qu'elle discrimine |
|---|---|---|
| **taux de violation de contrainte** | `issues` du parseur | la qualité brute |
| **adhérence aux contraintes NÉGATIVES** | issues d'absence, de régime, d'interdit doctrinal | **le test le plus discriminant** — un modèle de composition complète ce qu'on lui donne, c'est son métier ; refuser de remplir va contre sa pente |
| **taux de retry** | boucle de correction (étape 5) | combien de plans partent bons du premier coup |
| **couverture de résolution** | `resolution_coverage` | à quel point le modèle nomme les aliments d'une façon que le référentiel connaît |
| **fidélité structurelle JSON** | échecs de parse, champs manquants | la vraie difficulté de cette tâche |
| **verdicts hors bande** | `meal_verdict` | est-ce que le modèle sait viser une enveloppe qu'on ne lui donne jamais en chiffres |
| **latence p50 / p95** | horodatage de l'appel | un plan hebdo est une grosse génération, retry compris |
| **coût par génération** | tokens × tarif | ça tourne par élève et par semaine |

### Les pièges

- **Ne compare que sur des fixtures identiques.** Une différence de fixture
  écrase toute différence de modèle.
- **Ne juge pas la « qualité culinaire » à l'œil.** C'est le seul axe non
  mesurable ici, et c'est celui sur lequel un humain croira le plus voir une
  différence. Si tu veux le couvrir, fais-en une note séparée et dis qu'elle
  est subjective.
- **Le modèle de repli n'est pas neutre.** Si un modèle échoue et bascule sur
  un autre, la ligne mesure les deux. Détecte et étiquette les bascules.
- **Un modèle peut être bon en anglais et mauvais en français.** Le produit
  sort en `fr-FR` par défaut : passe la moitié des fixtures en français.

### Livrable

`scratchpad/RAPPORT-BANC-MODELES.md` : le tableau, la recommandation **avec le
coût mensuel estimé aux volumes actuels**, et — si un modèle gagne — la commande
exacte à donner au propriétaire (les secrets te sont bloqués) :

```bash
supabase secrets set KEEL_GENERATION_MODEL=<le gagnant>
```

---

# CHANTIER B · La B12 du végan — signaler l'incouvrable

**Pourquoi il attendait :** c'est le système de sentinelles (étape 8) qui porte
la détection de trous. Sans lui, il n'y a nulle part où lever le drapeau.

**Le travail est petit** — la moitié existe déjà — mais la distinction qu'il
introduit est structurelle.

### Ce qui existe

`_shared/keel/dietary_regime.ts::uncoverableSentinelsFor(regime)` rend
`["b12_source"]` pour `vegan`, `[]` pour les autres. Écrit, testé, non branché.
Fiche : `docs/fonctionnalites/composition-des-repas/FF-042-les-regimes-alimentaires.md` §6 R6.

### La distinction à introduire — et le mode de défaillance si tu la rates

Il y a **deux** sortes de sentinelle manquante, et elles n'ont rien à voir :

1. **Trou conjoncturel** — « cette semaine ne porte pas de poisson gras ».
   *Réparable* : le jeton `place_missing_sentinel` place une recette.
2. **Trou structurel** — « cet élève est végan, la B12 n'existe pas dans le
   règne végétal en quantité utile ». **Irréparable par l'aliment.**

⚠️ Si le système traite le second comme le premier, **il boucle** : la
correction essaie de placer une recette qui apporterait de la B12, la
génération suivante ne la trouve pas non plus, et le retry se déclenche à
chaque plan. Un élève végan verrait son plan corrigé sans fin pour un trou
qu'aucun plat ne peut combler.

Donc : `uncoverableSentinelsFor` **retire** ses jetons de l'ensemble des trous
réparables **avant** que la boucle de correction ne les voie, et les verse dans
un canal distinct.

### La règle qui borne le signal (FF-042 R6)

> **On signale, on ne prescrit pas.** Recommander une supplémentation est un
> acte que `CONTRACT.md` réserve au clinicien — même frontière que pour les
> maladies déclarées : on nomme, on n'ordonne pas.

Concrètement : le drapeau part au **coach**, au niveau doctrine/dynamique,
jamais nominatif, et sous plancher d'anonymat k=5 (arbitrage A4). Rien
n'apparaît côté élève qui ressemble à un conseil médical. Si tu écris une
phrase visible par l'élève, elle nomme le fait et s'arrête — jamais un
« pense à prendre ».

Fer et zinc végétaux **ne sont pas** signalés : moins biodisponibles, mais
atteignables par l'aliment. Les ajouter crierait au loup sur des trous que le
plan sait combler.

### Tests

- végan ⇒ `b12_source` sort des trous réparables, **aucun retry déclenché
  dessus** (le test qui garde la boucle infinie) ;
- végan ⇒ drapeau levé une fois, dans le canal coach, jamais nominatif ;
- végétarien ⇒ **aucun** drapeau (œufs et laitages portent la B12) ;
- omnivore sans B12 cette semaine ⇒ trou **réparable**, recette placée
  (désarmement : le comportement d'avant est intact) ;
- aucune sortie visible par l'élève ne contient de conseil de supplémentation.

---

# CHANTIER C · Les apports fixes — « le shaker »

**Pourquoi il attendait :** c'est **le premier input qui alimente le calcul et
non la sélection**. Sans référentiel de composition, « je prends un shaker tous
les matins » ne peut être que de la prose dans `situation`, et le générateur
n'en fait rien de fiable. Avec, c'est des grammes qui comptent.

C'est le cas d'usage qui **prouve que le moteur valait le coup** — écris-le
dans la fiche.

### Le besoin

Un élève consomme déjà, tous les jours, quelque chose que le plan ne compose
pas : un shaker de protéines au réveil, un yaourt à 16 h, un café au lait le
matin. Aujourd'hui, le plan l'ignore. Trois conséquences, toutes fausses :

1. **Duplication** — shaker protéiné au réveil **et** œufs au petit-déjeuner
   dans le plan. L'élève mange deux petits-déjeuners ou en saute un.
2. **Plancher protéique mal compté** — le shaker apporte de la protéine, le
   plan empile la sienne par-dessus comme s'il n'existait pas.
3. **Enveloppe faussée** — l'énergie de l'apport fixe n'est nulle part.

### Le modèle de données

Suis le précédent d'`eating_rhythm` : `student_goals.practical_constraints`
est un **jsonb libre, et le rester** (la migration `20260805150000` écrit
pourquoi). Donc `practical_constraints.fixed_intakes`, un tableau :

```jsonc
{
  "food_ref": "whey_protein_powder",  // résolu contre food_composition_refs
  "label": "mon shaker",              // les mots de l'élève, JAMAIS matché (R1)
  "amount": 30, "unit": "g",
  "slot": "breakfast",                // ou null = hors moment nommé
  "days": ["mon","tue","wed","thu","fri"]  // vide = tous les jours
}
```

Contraintes de forme : liste fermée d'unités (celle du chantier des quantités
structurées), plafond d'entrées (≈ 8 — c'est un prompt), validation stricte
avec entrée malformée **écartée et comptée**, jamais devinée.

### Les trois branches à écrire

Chacune doit être une branche **nommée** : un apport fixe qui ne changerait
rien serait décoratif, donc pire que son absence.

1. **Non-duplication** — l'apport occupe (tout ou partie de) son `slot`. La
   consigne le dit en négatif explicite : *« they already have X at breakfast,
   every weekday — do not compose a breakfast that repeats it »*. Et le
   parseur le vérifie : un plat sur un slot entièrement pris par un apport fixe
   est une issue.
   ⚠️ **Décide et documente** : un apport fixe *remplace* le moment ou s'y
   *ajoute* ? Ma recommandation : il ne remplace un moment que si l'élève l'a
   dit — sinon un yaourt à 16 h supprimerait le goûter. Défaut = s'ajoute.
2. **Plancher protéique** — la protéine de l'apport, calculée via le
   référentiel, **compte** dans le plancher du jour. Un ingrédient non résolu
   propage **de l'inconnu, jamais du zéro** (règle du moteur) : un apport
   irrésolu ne doit pas faire croire à zéro protéine.
3. **Enveloppe** — même chose pour l'énergie.

### Les pièges

- ⚠️ **Sous `restriction_flag`**, l'enveloppe n'existe pas (mode
  `per_portion`) : les branches 2 et 3 n'ont structurellement rien à alimenter.
  **La branche 1 (non-duplication) survit** — elle est côté aliment, pas côté
  personne. Ne fabrique pas de chemin spécial : c'est le type `Envelope` qui
  rend l'état illégal irreprésentable.
- **`label` est de la prose et ne sert JAMAIS à matcher** (R1 du dépôt :
  identifiants, pas prose). Le calcul passe par `food_ref`.
- **Un apport fixe n'est pas une préférence ni un interdit.** Il ne verrouille
  rien, il ne classe rien : il *occupe*.
- **Ne le confonds pas avec le garde-manger** (`pantry`), qui dit ce qu'on a en
  stock. Un apport fixe dit ce qui est **déjà mangé**.

### Tests

- non-duplication : un shaker au petit-déjeuner ⇒ aucun petit-déjeuner composé
  ces jours-là ; les autres jours restent servis ;
- `days` respecté (weekend sans shaker ⇒ petit-déjeuner composé) ;
- protéine comptée : plancher atteint plus tôt, moins de protéine empilée ;
- apport non résolu ⇒ inconnu propagé, **pas** zéro, et compté ;
- sous `restriction_flag` : non-duplication active, aucune trace d'enveloppe ;
- désarmement : aucun apport fixe ⇒ consigne identique au caractère près.

---

# CHANTIER D · Les propriétés de jour

**Pourquoi en dernier :** rien ne le bloque, mais il touche le prompt (donc un
bump de `MEAL_PROMPT_VERSION`) et il est le moins urgent des quatre. Le faire
en dernier évite un bump de plus au milieu des autres.

### Le besoin

Aujourd'hui un jour ne peut être que **absent** (`awayDays`, FF-002) ou **sans
cuisine** (`no_cook_days`). Il ne peut jamais **porter une opportunité**. C'est
le pendant **positif** de ce qui existe déjà en négatif.

### La discipline, et elle est stricte ici

Liste **fermée**, et chaque propriété a une **branche nommée** qui change ce
que l'élève trouve dans son assiette. Le test du dépôt s'applique sans pitié
(`student_body.ts` en tête) : *« est-ce que cette information change ce que
l'élève trouvera dans son assiette cette semaine ? »* Une propriété sans
branche est décorative, et pire que son absence — elle fait croire que le
produit en tient compte.

Candidates à instruire (retiens **seulement** celles dont tu écris la branche) :

| Propriété | La branche qu'elle doit changer |
|---|---|
| `market` | les produits frais et périssables se placent ce jour-là ou juste après ; ancre une vague de courses |
| `batch_cook` | une session de cuisson longue atterrit là ; les plats à réchauffer en découlent |
| `leftovers` | aucun plat neuf composé ; on consomme ce qui existe |
| `guests` | portions élargies, plat qui tient à plusieurs |

Ne les prends pas toutes. **Deux propriétés qui mordent valent mieux que quatre
qui décorent.**

### Ce qui existe déjà et qu'il ne faut pas dupliquer

- `awayDays` / `parseAwayDays` / `isAway` (`meal_generation.ts`) — le négatif ;
- `no_cook_days`, `cook_days` dans `practical_constraints` ;
- les vagues de courses (`grocery_waves.ts` + son jumeau front) et
  **FF-005**, qui traite déjà « une course ou deux » — `market` doit s'y
  brancher, pas réinventer une stratégie de courses ;
- la grille repas×jour côté front.

### Tests

- chaque propriété a un test qui prouve que la sortie **change** quand elle est
  posée (mute la propriété, la sortie doit bouger) ;
- `market` s'articule avec les vagues existantes sans les contredire ;
- deux propriétés sur le même jour : comportement défini et testé ;
- une propriété inconnue est **écartée seule**, jamais avec les autres (patron
  `parseAwayDays`) ;
- désarmement : aucune propriété ⇒ consigne identique au caractère près.

---

## 4. Ordre de travail recommandé

1. **A · le banc d'essai** — c'est de la mesure, ça ne change rien au produit,
   et son résultat peut informer tout le reste. Le moins cher, le plus tôt.
2. **B · la B12** — petit, ferme FF-042, et son mode de défaillance (la boucle
   infinie) mérite d'être écarté vite.
3. **C · le shaker** — le plus gros, et celui qui rapporte le plus.
4. **D · les propriétés de jour** — dernier, un seul bump de version.

Si le temps manque, **livre moins de chantiers, complètement** — jamais quatre
à moitié. Un chantier non fait est une ligne de rapport ; un chantier à moitié
est un piège pour le suivant.

## 5. Vérification et rapport

1. `deno test` complet sur `supabase/functions/_shared/keel/` (pas de
   `--no-check`).
2. `npx tsc -p frontend/tsconfig.app.json --noEmit`.
3. Run réel local : **redémarre le runtime edge d'abord**, fixture **avec plan
   publié**, et vérifie chaque branche livrée dans une vraie sortie.
4. Migrations appliquées **deux fois** (pas de reset pour rattraper).
5. Un commit par chantier, message français en minuscules. **Ni push, ni
   deploy, ni `db push`** — le propriétaire s'en charge.
6. `scratchpad/RAPPORT-SUITE-ENTREES-ET-MODELE.md` : par chantier, ce qui est
   livré, ce qui est mesuré (surtout le tableau du banc d'essai), les portes
   trouvées fermées et pourquoi, ce que tu n'as pas fait.

## 6. Interdits absolus

- Aucun chiffre d'énergie/macro/mesure **sur la personne**, nulle part —
  y compris dans un message d'erreur ou un log lisible par l'élève.
- **Aucun conseil de supplémentation** (chantier B) : on nomme, on n'ordonne
  pas.
- Aucun verdict qui bloque : seuls les verrous de sécurité vident un repas.
- Aucun substitut à une dépendance manquante : porte fermée ⇒ chantier sauté
  et déclaré.
- 🚫 `supabase db reset`, jamais, ni en le demandant au propriétaire.
- Ne touche pas `dietary_regime.ts`, `generation_model.ts`, ni les migrations
  déjà appliquées.
- Ne supprime rien du legacy 1:1 (`plan_versions`, `/coach/import`) : gardé
  exprès.
