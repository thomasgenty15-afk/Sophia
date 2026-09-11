# MASTER PROMPT — la mémoire à trois destinations

> À donner tel quel à un agent, dans une session neuve sur `/Users/ahmedamara/Dev/Sophia 2`.
> Il conduit **cinq lots** de bout en bout (0 → A → B → C → D), puis une **campagne finale
> en conditions réelles**. Il s'arrête uniquement aux points nommés « ⏸ HUMAIN ».
>
> Écrit le 2026-09-03 à 13h31, après une campagne de mesure de trois jours dont les
> résultats sont dans `scratchpad/` et dans le rapport publié. Tout ce qui est affirmé
> ci-dessous a été **vérifié dans le code ou en base locale** ce jour-là ; la section 2
> dit où regarder pour le re-vérifier.

---

## 0. Ta mission, en une page

Le produit retient des choses sur une personne et sur son foyer, et les réinjecte dans
la composition des plans. Aujourd'hui cette mémoire est **éclatée sur sept magasins**,
dont **un seul** est visible sur l'écran « Ce que Sophia sait de toi », et le modèle
que le fondateur a énoncé de multiples fois **n'a jamais été écrit comme autorité**.
Chaque session est repartie de la nomenclature de 8 familles → 6 sections, et a
construit à côté du modèle voulu.

**Le modèle voulu, qui devient l'autorité au lot 0 :**

```
DEUX SOURCES, et pas une de plus
  1. Le retour sur le BROUILLON d'un plan   (draft_note, texte libre, classé par un modèle)
  2. Le BILAN de fin de plan                 (questionnaire envoyé via le chat, vocabulaire fermé)
  Le chat ordinaire n'écrit RIEN dans la mémoire du plan.

TROIS DESTINATIONS, sans recouvrement
  1. Les PRÉFÉRENCES ALIMENTAIRES  — par personne. Un aliment ou une préparation
                                     qu'on ne sert plus / qu'on veut revoir.
  2. Les INDICES                    — internes, « pour nous ». Quatre :
                                       · portion (position −2..+2, par personne)
                                       · capacité à cuisiner  (recipe_difficulty)
                                       · rapidité à cuisiner  (cooking_time_min)
                                       · variété              (variety)
  3. CE QUE SOPHIA SAIT             — ce qui n'est ni 1 ni 2 mais compte pour composer.
                                     Ex. « Léa danse le mardi soir : il lui faut une
                                     grosse part ce soir-là. » Par personne, daté,
                                     lisible, effaçable. JAMAIS un doublon de 1 ou 2.

UN ENCART « pour le prochain plan »
  En bas de « Ce que Sophia sait de toi ». N'apparaît QUE s'il y a quelque chose.
  Meurt quand le plan suivant est VALIDÉ (student_generated_meals.validated_at),
  pas au calendrier.

LA SÉCURITÉ (allergies, intolérances, régimes, médical) reste HORS de tout ça :
  ses tables, son écran, son canal. Rien ne change au lot ① de la campagne précédente.
```

**Ta règle de travail, pour chaque lot :**

```
note de conception (courte, dans scratchpad/)  →  tests qui ROUGISSENT  →  code  →
gate vert  →  banc en CONDITIONS RÉELLES (modèle appelé, base relue)  →  rapport chiffré
→  ⏸ HUMAIN : commit
```

Un lot n'est « fait » que quand son banc réel a rendu ses chiffres **et** que tu as relu
la base derrière. « Les tests passent » n'est pas un livrable ici — ce dépôt a payé
trois fois un banc qui rendait un verdict faux sur un produit correct (§1.4).

---

## 1. Les règles non négociables

### 1.1 Ce que tu ne fais JAMAIS seul (hook `.claude/hooks/block-risky-commands.sh`)

`supabase secrets set/unset` · `supabase db reset` (même en local, **interdit depuis
le 2026-08-10**) · `supabase db push` · `supabase functions deploy` · `supabase config
push` · `supabase link` · `supabase projects/branches delete` · toute écriture de
secret via la Management API. Quand tu en as besoin : tu t'arrêtes, tu donnes la
commande exacte, l'humain la lance. **`supabase migration up --local` est permis.**

### 1.2 Les pièges qui ont déjà coûté des journées

| piège | règle |
|---|---|
| 401 `Invalid JWT` sur une edge function alors que PostgREST répond | **Ne touche à rien.** `./scripts/check-local-jwt-alg.sh`, puis lis `docs/keel/JWT-HS256.md`. `supabase/signing_keys.local.json` reste `[]`. Jamais `verify_jwt = false`. |
| `docker restart` sur le conteneur edge pendant `supabase functions serve` | **Jamais.** Boucle create→kill→destroy, 502 qui ressemblent à des pannes. |
| Un fichier `_shared/` modifié n'est pas rechargé par le runtime edge | Avant tout run réel après une édition : relancer `supabase functions serve` (pas le conteneur). |
| Le runtime edge est **recréé en boucle** (conteneur qui ne survit pas 20 s, 502 en rafale, zéro appel modèle) | Ce n'est pas une panne de fonction. Le watcher de `functions serve` voit `supabase/functions/node_modules/` bouger à chaque démarrage à froid, et **aucune option n'exclut un chemin du watch** (CLI 2.67.1, vérifié le 2026-09-03). Le watch couvre **tout `supabase/functions/`** : un `deno test` ou `deno check` lancé depuis l'arbre principal écrit dans son cache sous ce dossier et **recrée le conteneur** — quatre générations réelles perdues ainsi dans la nuit du 2 au 3. Règles : (1) **lance Deno depuis un worktree** (`EnterWorktree`), jamais depuis l'arbre principal pendant qu'un run réel tourne — le tien ou celui d'un autre ; (2) avant un run de 40–120 s, vérifie qu'aucune **autre session** n'appelle la pile (`docker logs --since 2m` du runtime : des appels qui ne sont pas les tiens = quelqu'un d'autre) ; (3) ne relance **jamais** `functions serve` pendant le run d'un autre — demande cinq minutes de pause par message inter-session, et préviens avant de relancer. |
| Quatre sessions écrivent dans le **même arbre** | `git commit -- <fichier>` commite le fichier **entier**, avec les lignes des autres. Relis `git diff` **fichier par fichier** avant tout commit, jamais seulement la liste des chemins ; si tu emportes des lignes d'autrui, déclare-le dans le message. Le disque était à **moins de 4 Go** sur 228 le 2026-09-03 : vérifie `df -h` avant un run long ou un worktree. |
| `git stash` / `git checkout` sur ce dépôt | **Jamais.** D'autres sessions y ont du travail non commité. Défaire une mutation par `cp` depuis une copie. |
| Sessions parallèles | Horodate tes fichiers de lane (`scripts/2026-09-XX-HHMM-…`, `scratchpad/…`) avant d'écrire. |
| Kong coupe à 60 s | `./scripts/local_extend_kong_functions_timeout.sh` **avant** tout run ; sinon des 502 = faux tours perdus. |
| `docker logs -f` rejoue l'historique | **Toujours `--since <horodatage absolu>`**, capturé juste avant l'appel, et gate le compteur sur le HTTP 200 de l'appel. |
| Le harnais QA plafonne à 3 sièges par coach d'essai | Le 4ᵉ élève plante le run (`keel_trial_seat_limit_reached`). Purge (`--purge`) avant de recréer. |
| `profiles.timezone` absent | 409 `local_day_unresolved`. La fixture le pose. |
| Migration hors ordre | Sautée en silence. Ta version doit être **postérieure** à la dernière du registre : `ls supabase/migrations | tail -1` et `select max(version) from supabase_migrations.schema_migrations`. Vérifie `uniq -d` sur les versions. |
| `jsonb default '[]'` | Cache « répondu vide » vs « pas demandé ». Un formulaire tap par tap saute ses questions. Distingue `null` (pas posé) de `[]` (posé, rien). |
| `[]` ≠ clé absente ; `=== true` referme un tri-état | Nomme les trois états quand il y en a trois. |
| CHECK adossé à un mot retiré | Le CHECK doit tomber **avant** le repli, sinon les données locales cachent la morsure. Deux listes pour une règle = la moins lue vieillit (défaut ⑥). Écris un **bloc de contrôle** qui compare les deux. |
| `create or replace view` perd `security_invoker` | Repose les reloptions explicitement. |
| RLS ne remplace pas `.eq("user_id")` | Sous `service_role`, `auth.uid()` est NULL : toute RPC gatée dessus est morte. |
| Privilèges par défaut Supabase | `authenticated` a TOUT sur une table neuve. `revoke` + `grant` nominatifs ; vérifie `has_table_privilege('anon', …)`. |
| Un matcher maison | **Jamais.** `laitue` ≠ `lait` : 12 faux positifs sur 12 mesurés. Utilise `findForbiddenMatches` et `termsOfInstruction` (`_shared/keel/`). |
| Promesse et clé de schéma | Doivent être **adjacentes** dans le prompt (< 300 caractères) et dans le **même** message (système ou utilisateur) : 0 % sinon. Un test d'adjacence par promesse. |
| Champ déclaré par le modèle | A **toujours** un compteur, et le **dénominateur** existe avant le numérateur. Un zéro doit distinguer « pas observé » de « observé, rien ». |
| `agent-gate` | Lance `deno check`, `deno test`, vitest (`node ≥ 20`) et `tsc -b --force` sur `frontend/tsconfig.app.json` (`tsconfig.json` ne vérifie rien : `files: []`). Liste nominative de rouges tolérés — n'y ajoute rien. |
| Insertion i18n | **Jamais** `unicode_escape`. `fr.ts` et `en.ts` en parité ; les deux se réparent par numéro de ligne. |
| Le générateur du foyer et `keelGenerationModel()` | Ne le branche pas : timeout 4 min mesuré. Il compose avec le modèle du chat, et c'est connu. |
| Un compte sans mot de passe | Ne vise jamais un compte réel. Fixtures : mdp `1234567`. |

### 1.3 Ce que tu ne changes pas

- **Le modèle produit** (`CLAUDE.md`, `docs/keel/MODEL.md`) : le coach ne produit rien
  de personnel ; c'est l'élève qui compose. Aucune copie ne fait attendre l'élève.
- **La sécurité par classification n'existe pas** : allergie, intolérance, régime,
  médical vont dans `student_safety_constraints` / `household_member_allergies` /
  `household_members.diet` par le canal du lot ① (`draft_note_safety*.ts`), avec le
  récap du soir (`memory_recap*.ts`). Tu le **conserves** tel quel.
- **`canProduce("conversation", …)` reste faux pour tout.**
- **Les deux autorités** (`docs/keel/PIVOT-FOYER.md` §8.5) : Sophia explique, le parent
  restreint. Une restriction parentale n'est pas une préférence, et le texte ne l'attribue
  jamais à Sophia (`household_restriction_lock.ts` le garde).
- La chaîne 1:1 (`plan_versions`, `/coach/import`) et `student_week_plans` : gardées exprès.

### 1.4 La discipline du banc (payée trois fois)

1. **Un compteur lu sans son contexte ment.** `--since` absolu, HTTP 200 gaté, le bon
   tag pour la bonne lane (`keel.meal.*` = solo, `keel.household_meal.*` = foyer).
2. **Un verdict a besoin de son plancher.** `composition` compte les durables **et** les
   périssables : attendre `0` après expiration est faux ; mesure une **différence**.
3. **Journalise le contrefactuel, pas deux runs.** Une génération, deux calculs
   (`unadjustedEnvelope`) : zéro variance de modèle.
4. **Une garde a besoin d'un cas qui passe.** Chaque test de refus a son jumeau qui
   accepte, sinon une garde cassée ressemble à une garde qui marche.
5. **Un test paramétré par sa propre constante reste vert quand on change la
   constante.** Mute-la pour prouver qu'il mord.

---

## 2. L'état du monde au 2026-09-03 (vérifie avant de toucher)

### 2.1 Le travail non commité que tu trouves dans l'arbre

La campagne des 1ᵉʳ–3 septembre a laissé **tout son travail non commité** : cinq
modules neufs (`draft_note_safety*.ts`, `memory_recap*.ts`, `food_exclusion_belt.ts`),
cinq fichiers modifiés (`draft_note_classify.ts`, `meal_generation.ts`,
`dietary_regime.ts`, les deux générateurs, `keel-daily-pulse-v1`), deux migrations
appliquées **en local seulement** (`20260901180000`, `20260901233000`), six scripts de
banc. 5 596 tests verts sur `_shared/`.

**⏸ HUMAIN — première chose à faire** : proposer les commits de ce travail, en lots
lisibles (canal sécurité + récap ensemble ; classifieur ; ceinture d'exclusion ;
migrations ; bancs). Tu ne commites qu'avec son accord. Tu ne stash rien.

### 2.2 Les sept magasins (et qui les lit)

| magasin | contenu | écrit par | lu par le générateur | sur la carte |
|---|---|---|---|---|
| `student_goals.practical_constraints.retained_items` | 8 familles : `food.exclude`, `food.prefer`, `method.avoid`, `method.prefer`, `portion.adjust`, `rhythm.set`, `logistics.set`, `craving` ; `subject` = `household` ou `member:<uuid>` ; `source` ∈ written / conversation (mort) / questionnaire / draft_note | bilan (déterministe), carte | oui (`retained_items_routing.ts`) | oui, 5 sections |
| `…retained_next_plan` | `[{item, anchor}]`, vit jusqu'à `ancre + 6` | retour sur brouillon (modèle) | oui | « Pour la semaine prochaine », lecture seule |
| `…food_preferences` (+ `_origin`, `_dismissed`) | **texte libre**, souvenirs du **chat** promus par « Keep » | `FoodPreferencesCard` sur `/app/plan` (« Ce que tu m'as dit ») | **oui, dans les deux prompts**, avec relecture de `memory_items` à chaque génération (`food_preference_promotion_io.ts:233`) | « Anciennes notes » |
| `…memo` | 5 lignes libres (M4) | **personne** — lecteur sans écrivain | oui (`memoLinesForPrompt`) | « Ce que Sophia a retenu d'autre », vide |
| `…cooking_time_min`, `recipe_difficulty`, `variety`, `cook_days`, `budget_amount`, `eating_rhythm` + `field_changes` | les réglages, et le journal M5 | Setup, bilan (M5 écrit le champ) | oui | « Ce qui vient de changer » |
| `household_food_restrictions` | « Aliments refusés » par bouche (dialogue Préférences alimentaires, placeholder « champignons ») | `keel_household_add_restriction` | oui — `household_restriction_lock.ts`, **conçu pour l'interdit parental** (Nutella) | non |
| `household_member_habits.slots` + `.note` | habitudes par créneau + **texte libre** (« Ne mange rien de réchauffé ») | dialogue | oui, `— usually: …` dans le prompt, **sans ceinture** | non |
| `household_members.eating_rhythm`, `away_days`, `work_lunch`, `fixed_intakes` | cadre par bouche | dialogue | oui — **union** avec `rhythm.set` | non |
| `household_traditions` | un **plat** par créneau | carte traditions | oui | non |
| sécurité : `student_safety_constraints`, `household_member_allergies`, `household_members.diet` | | fiche santé, dialogue, canal ① | oui (ceinture régime) | non (voulu) |

**Les doublons concrets** : « Tom n'aime pas le poisson » a trois lits (restriction /
`food.exclude member:Tom` / `habits.note`) et trois ceintures différentes ; « je n'aime
pas le brocoli » en a deux (`food_preferences` / `food.exclude`), tous deux au prompt ;
le rythme et la cuisine ont chacun un item ET un champ.

### 2.3 Le bilan aujourd'hui

`keel_plan_feedback_submit(p_meal_id, p_cooked, p_portions, p_never_again jsonb,
p_make_again jsonb, p_axis_question, p_axis_answer, p_portions_subject)`.
Vocabulaires : `cooked ∈ yes|partly|no` ; `portions ∈ way_too_much|too_much|right|
not_enough|way_not_enough` ; `never_again`/`make_again` = **titres exacts de plats** ;
un seul axe posé selon l'objectif (`AXIS_QUESTION` dans `plan_feedback.ts`) parmi
`enough_variety`, `hunger_between_meals`, `could_finish`. Livré via le chat par
`keel-proactive-v1` → `plan_feedback_chat_io.ts`. **Capacité et rapidité ne sont pas
demandées** : elles sont déduites de `cooked = partly|no`.

### 2.4 Le retour sur brouillon aujourd'hui

`draft_note_classify.ts` (prompt + parse pur) et `draft_note_classify_io.ts`
(persistance). Écrit **uniquement** en `next_plan`, cinq familles (`portion.adjust`,
`rhythm.set`, `logistics.set` interdites — `DRAFT_NOTE_FORBIDDEN_KINDS`). Roster injecté
avec `called`, `age` (`minor|adult`, **null sous 18 ans pour `ageBand`**, attention) et
`sex`. Canal sécurité à côté (`safety[]`). Compteurs : `keel/draft_note_classify`
(`proposed`, `kept`, `refused_*`, `write_refused`), `keel/draft_note_safety`.

### 2.5 La carte aujourd'hui

`/app/about-you` → `StudentKnownPage.tsx` → `KnownAboutYouCard.tsx` (1 131 lignes),
`api/retainedItems.ts` (2 253 lignes). Une seule lecture (`practical_constraints`),
écriture par `keel_write_retained_items` avec snapshot (`stale_snapshot`). Le port
d'écriture (`20260818240000`, `20260818250000`) **est appliqué** en local — le
commentaire de la page qui dit le contraire est périmé : corrige-le au lot D.

### 2.6 Les bancs disponibles

```
scripts/2026-09-01-fixture-foyer-retours.ts   --email <e> [--service] [--purge]   foyer de 3 bouches par les RPC de l'écran
scripts/2026-09-01-banc-retour-plan.sh         <anon> [n°]                          les 10 phrases du retour
scripts/2026-09-01-banc-bilan-plan.sh          <anon> [cas A..I]                   un plan réel par cas
scripts/2026-09-01-banc-bilan-rapide.sh        <anon>                              même cas sur un plan (raccourci assumé)
scripts/2026-09-01-banc-4-cycles.sh            <anon> [email] [cycle de départ]     plan → retour → bilan → plan, ×4
scripts/2026-09-03-sonde-expiration-next-plan.sh <anon> <email>                    le lecteur d'expiration
```

Clé anon : `supabase status -o env | grep ANON_KEY`. Fixture : `qa-cycles2@keeltest.dev`
existe ; crée un compte neuf pour la campagne finale. Le foyer de la fixture : Claire
(titulaire, maintien), Léa (mineure, danse le mardi), Tom (mineur, végétarien, n'aime pas
le poisson).

---

## 3. LOT 0 — écrire le modèle comme autorité

**But** : qu'aucune session future ne reparte des huit familles.

### 3.1 Livrables

1. **`docs/keel/NOMENCLATURE-MEMOIRE.md`** — réécrire **§2** (les axes) et **§6** (la
   surface), amender **§5** (la matrice) ; encadré daté en tête : « Modèle à trois
   destinations, 2026-09-XX, remplace les 8 familles → 6 sections ». Ne supprime pas
   l'historique : les sections remplacées passent en annexe « ce que c'était », parce
   que le code les porte encore jusqu'au lot D.
2. **`docs/keel/MODEL.md`** — un paragraphe pointant vers la nomenclature : « la mémoire
   du plan a deux sources et trois destinations ».
3. **Une mémoire** dans `/Users/ahmedamara/.claude/projects/-Users-ahmedamara-Dev-Sophia-2/memory/`
   (`memory-three-destinations-is-the-authority.md`, type `project`) + sa ligne dans
   `MEMORY.md` — courte, < 200 caractères d'index.

### 3.2 Ce que le texte doit trancher, noir sur blanc

- **Définition de chaque destination** avec un test d'appartenance en une phrase :
  - *Préférence* : « je peux la réduire à (personne, aliment|préparation, exclure|revoir) sans perdre de sens ».
  - *Indice* : « c'est une position sur une échelle fermée que le générateur lit sans texte ».
  - *Ce que Sophia sait* : « ni l'un ni l'autre, et le générateur en a besoin pour composer ».
- **La règle anti-doublon** : un fait qui **passe** le test de préférence ne va **jamais**
  en 3 ; un mouvement d'indice n'apparaît **jamais** comme une ligne de 3. La carte ne
  montre une chose qu'une fois.
- **Le sujet** : toute ligne des destinations 1 et 3 porte une personne
  (`member:<uuid>`) ou la table (`household`). L'abstention est permise, le repli sur
  « tout le monde » est interdit quand la phrase nommait quelqu'un.
- **Les quatre indices**, leur échelle fermée, leur lecteur nommé, et **qui les bouge** :
  - portion : `feedback_index.ts`, position −2..+2, par personne, `slight=1 / clear=2 cran(s)`, lue par `meal_envelope.ts` ; les mineurs sont **exclus par motif**, pas par erreur.
  - capacité : `recipe_difficulty ∈ simple|normal|keen`.
  - rapidité : `cooking_time_min` (entier, plancher `atFloor`).
  - variété : `variety ∈ repeat|some|varied`.
  Chaque mouvement écrit une ligne de journal `field_changes` (M5) — c'est le seul
  endroit où un indice se voit, et il sert au **Défaire**.
- **L'encart** : contenu = ce que le retour sur brouillon a classé « pour le prochain
  plan » ; visible seulement s'il est non vide ; **mort à `validated_at` du plan
  suivant**. Définis « plan suivant » : la première ligne de `student_generated_meals`
  du même `user_id` avec `validated_at IS NOT NULL` et `created_at >` la date de la
  ligne d'encart. Écris aussi ce qui se passe si aucun plan n'est jamais validé (l'encart
  reste ; il se retire à la main).
- **La sécurité** : hors périmètre, canal ①, inchangé.
- **Ce qu'on ferme** : le pont chat → `food_preferences` (Keep), les familles
  `rhythm.set`, `logistics.set`, `craving`, `method.*` comme *sections* (les préparations
  deviennent une préférence au même titre qu'un aliment ; l'envie devient une ligne
  d'encart).
- **Ce qu'on ne tranche pas** (§7) : `habits.note` texte libre ; les traditions.

### 3.3 Critères d'acceptation

- Les trois définitions passent sur les **10 phrases** du banc du retour et sur les
  **9 cas** du banc du bilan : pour chacun, le doc dit **où ça va**, sans hésitation. Mets
  ce tableau **dans le doc** (§ « exemples de routage ») — c'est lui que le lot A teste.
- ⏸ **HUMAIN** : relecture du doc avant le lot A. C'est le seul arrêt long du chantier.

---

## 4. LOT A — le retour sur brouillon route vers trois portes

**But** : une phrase libre sur un brouillon atterrit dans la bonne destination, attribuée
à la bonne personne, et la troisième porte existe enfin.

### 4.1 Conception (note courte dans `scratchpad/2026-09-XX-HHMM-A-trois-portes.md`)

Le classifieur rend un objet à **quatre listes** (la quatrième existe déjà) :

```jsonc
{
  "preferences": [ { "subject": "member:<uuid>|household", "polarity": "exclude|prefer",
                     "target": { "food": "…" } | { "method": "…" },
                     "text": "…", "quote": "…" } ],
  "notes":       [ { "subject": "member:<uuid>|household", "text": "…", "quote": "…",
                     "when": { "weekday": "tue", "slot": "dinner" } | null } ],
  "next_plan":   [ { "subject": "…", "text": "…", "quote": "…" } ],
  "safety":      [ … inchangé … ]
}
```

- **`preferences`** → `retained_items` durable, `food.exclude|prefer` /
  `method.avoid|prefer`, `source: "draft_note"`. **Nouveau** : le retour sur brouillon
  peut écrire du **durable** — c'est ce que le modèle veut (« mon fils n'aime pas le
  poisson » n'est pas pour une semaine). Mets à jour `canProduce` et sa matrice §5.
- **`notes`** → **le mémo devient la destination 3** : `memo.ts` prend un `subject`, un
  `at`, un `when` optionnel, une `quote`. Plafond : 5 par personne (pas 5 au total).
  Identité de contenu pour le doublon (`contentIdentityOf`), jamais sur `written`.
- **`next_plan`** → `retained_next_plan`, forme inchangée, **plus d'ancre calendaire
  comme règle de vie** : l'item porte `anchor` (pour l'affichage) **et** meurt à
  `validated_at` (lecteur `retained_next_plan.ts::isNextPlanItemAlive` à réécrire ; il
  reçoit la date de validation du plan suivant, ou `null`).
- **Interdits qui tombent** : `rhythm.set` / `logistics.set` / `portion.adjust` restent
  interdits **comme familles** (elles disparaissent), mais leur **contenu** n'est plus
  refusé : « les recettes sont trop compliquées » → `notes` (ou, si tu peux le réduire à
  un indice, **rien** — un indice ne se bouge pas depuis un texte libre ; note-le dans le
  prompt : « ne déduis jamais un réglage, dis-le en note »).
- **Le roster** : garde `called`, `age`, `sex`. Corrige le piège `ageBand null sous 18`
  si tu le rencontres.
- **Le prompt** : reconstruit depuis la matrice (les descriptions **rendues** depuis le
  code, jamais écrites deux fois — défaut ②). Promesse et clé adjacentes. Une phrase
  qui interdit le repli « tout le monde ». Le bloc sécurité inchangé.
- **Les compteurs** : `keel/draft_note_classify` rend `proposed`, `kept`, `refused_*`,
  `write_refused` **par porte** (`preferences`, `notes`, `next_plan`) — trois
  dénominateurs. Une phrase qui ne produit rien rend `nothing_to_file` avec la porte
  tentée.

### 4.2 Les lecteurs (sinon la porte 3 est une case vide de plus)

- Les deux générateurs lisent le mémo **par sujet** : une note de Léa va dans le brief
  de Léa (`household_voices_io.ts` / le bloc par bouche du générateur foyer), une note
  `household` dans le brief commun. Compteur `keel.*.notes {lines, served}` mesuré sur
  le `userMessage` construit — pas sur l'intention.
- Une note avec `when` est rendue **au jour nommé** : « Tuesday dinner — Léa: needs a
  big portion (dance) ». Souviens-toi : *nommer le jour et contredire l'a priori du
  modèle*, pas seulement lui donner la donnée.
- `food_exclusion_belt.ts` lit les préférences durables par bouche exactement comme il
  lit déjà les périssables (`exclusionTermsFor` sur `routedRetained.composition`) —
  vérifie que la route durable y arrive.

### 4.3 Tests (rouges d'abord)

- Parse : chaque porte, chaque refus, un cas qui **passe** par refus.
- Adjacence promesse/clé pour chaque porte (< 300 caractères, même message).
- Descriptions rendues depuis la matrice : un test qui **ferme** une famille et vérifie
  que le prompt ne la mentionne plus.
- `canProduce("draft_note", food.exclude)` vrai ; `canProduce("conversation", *)` faux.
- Mémo : plafond par personne, doublon, `withoutMemoLine` par position, `subject` requis.
- `isNextPlanItemAlive` : vivant sans validation, mort avec `validated_at` postérieur,
  vivant avec `validated_at` antérieur à `at`.
- Wiring : un test qui lit le **source** des deux générateurs et exige `memoLinesForPrompt`
  **avec** un sujet (pas la signature d'avant).

### 4.4 Banc en conditions réelles

Mets à jour `scripts/2026-09-01-banc-retour-plan.sh` en `scripts/2026-09-XX-HHMM-banc-retour-trois-portes.sh`
avec **la matrice du lot 0** comme attendu :

| # | phrase | porte attendue | sujet | vérification en base |
|---|---|---|---|---|
| 1 | « c'est trop long à cuisiner » | notes (ou rien) | household | aucune ligne `retained_items` ; 0 ou 1 note |
| 2 | « les recettes sont trop compliquées » | notes (ou rien) | household | idem |
| 3 | « j'aime pas le poulet » | preferences · exclude · food | household | `food.exclude` durable, `text` fidèle, `quote` présent |
| 4 | « mon fils n'aime pas le poisson » | preferences · exclude · food | member:Tom | sujet = Tom, **jamais** household |
| 5 | « les parts sont trop grosses » | **rien** (indice ≠ texte libre) | — | `nothing_to_file`, indice de portion **inchangé** |
| 6 | « ma fille a danse le mardi soir, il lui faut un vrai repas » | **notes** avec `when = tue/dinner` | member:Léa | 1 ligne mémo, sujet Léa, `when` posé |
| 7 | « l'après-midi elle mange toujours des compotes » | notes (ou preferences · prefer) | member:Léa | tranche-le au lot 0 ; le banc vérifie ce que le doc dit |
| 8 | « je suis allergique aux arachides » | safety | household | `student_safety_constraints` +1 ; **0** préférence |
| 9 | « mon fils est devenu végétarien » | safety | member:Tom | `household_members.diet` ; 0 préférence |
| 10 | « j'ai envie de fajitas cette semaine » | next_plan | household | `retained_next_plan` +1 |

Puis **une génération** après la phrase 6 et **une** après la phrase 4 :
- phrase 6 : `keel.household_meal.notes served=1`, la ligne « Tuesday dinner — Léa … »
  **dans le `userMessage`**, et la boîte de Léa au dîner du mardi porte un grammage
  **supérieur** à celle du lundi (compare `boxes[].grams` — c'est mesurable, pas une
  impression).
- phrase 4 : `exclusion_belt` bites=0 sur le plan, poisson absent des boîtes de Tom.

Rapport : `scratchpad/2026-09-XX-HHMM-A-rapport.md` avec la matrice attendu/obtenu et les
compteurs bruts.

### 4.5 ⏸ HUMAIN

Commit du lot A. Si la phrase 7 a tranché autrement que le doc, montre-le avant.

---

## 5. LOT B — le questionnaire de fin de plan nourrit les indices et la porte 3

**But** : les quatre indices se règlent depuis des **questions posées**, pas déduites ;
le « plus jamais » devient un aliment ; une réponse libre rejoint la porte 3.

### 5.1 Conception

Nouveau questionnaire (vocabulaire fermé, une question par bulle, comme aujourd'hui) :

| question | réponses | destination |
|---|---|---|
| `cooked` | `yes / partly / no` | contexte (garde) |
| `portions` (+ `portions_subject`) | 5 crans, inchangés | indice portion |
| **`difficulty`** *(nouveau)* | `too_hard / fine / could_do_more` | indice capacité : `too_hard` ↓ un cran, `could_do_more` ↑ un cran |
| **`speed`** *(nouveau)* | `too_long / fine / had_more_time` | indice rapidité : `too_long` ↓ (plancher), `had_more_time` ↑ |
| `variety` | `enough_variety` inchangé | indice variété |
| **`never_again`** *(changé)* | des **aliments** proposés depuis les plats du plan (`dish.uses` → ingrédients principaux, chips), plus « tout le plat » | préférence · exclude · **food**, sujet demandé |
| `make_again` | idem, en `prefer` | préférence · prefer |
| **`anything_else`** *(nouveau)* | texte libre, facultatif | **le classifieur du lot A**, porte `notes` / `preferences` / `safety` — **réutilise-le**, n'en écris pas un second |

- Un mouvement d'indice écrit **une ligne** `field_changes` avec `quote` = la question
  telle que posée (M2 : la citation est la garde).
- `hunger_between_meals` / `could_finish` : garde-les si l'objectif les demande, mais
  **nomme leur lecteur** ; s'il n'y en a pas, retire-les (règle fondatrice de la
  nomenclature : une catégorie sans lecteur ne se crée pas).

### 5.2 Migration (une seule, version postérieure au registre)

- `meal_plan_feedback` : colonnes `difficulty`, `speed`, `anything_else`, `never_again`
  passe d'une liste de titres à une liste d'objets `{food, subject}` (ou nouvelle
  colonne ; ne casse pas la lecture des lignes existantes — écris le lecteur des deux
  formes, avec un test sur une ligne ancienne réelle copiée de la base locale).
- CHECKs sur les nouveaux vocabulaires. **Bloc de contrôle** en fin de migration qui
  compare la liste de la RPC à celle du CHECK, pour chaque colonne (défaut ⑥).
- `keel_plan_feedback_submit` : nouveaux paramètres, tous **nullable** ; `null` = pas
  posé, distinct de `[]` = posé vide. Le marqueur `answered` continue de fonctionner.
- Rappelle-toi : *« appliquée en local » ≠ le contrôle a tourné* — le `db push` distant
  est le premier vrai run du bloc de contrôle. Dis-le dans le rapport.

### 5.3 Le chat

`plan_feedback_chat.ts` / `plan_feedback_chat_io.ts` : les nouvelles bulles, dans les
deux langues, avec les boutons. La question `anything_else` est **la dernière**, et son
absence de réponse ne bloque pas la clôture. Vérifie le budget de tours de
`keel-proactive-v1` (le bilan prend la place de la bande du soir ce jour-là — vérifie
que la bande ne part pas en plus).

### 5.4 Tests

- Vocabulaires fermés : un test par colonne qui lit **le CHECK réel** (`pg_get_constraintdef`)
  et le compare à la constante TS — pas une troisième copie.
- Indices : `portionIndexMoves` inchangé ; capacité/rapidité/variété : un test par
  direction, un test de plancher/plafond, un test de journal (`quote` = la question).
- `never_again` : ancienne forme (titres) et nouvelle forme (aliments) lues par le même
  lecteur ; l'aliment atterrit en `food.exclude` avec le sujet ; un titre absent du plan
  est refusé (`notInPlan`).
- `anything_else` → le classifieur du lot A : test de câblage qui lit le source.

### 5.5 Banc en conditions réelles

`scripts/2026-09-XX-HHMM-banc-bilan-v2.sh <anon> [cas]`, **un plan réel par cas** (le
« rapide » est un raccourci que le produit ne fait jamais — garde-le à part si tu le
gardes) :

| cas | entrée | attendu |
|---|---|---|
| A | `cooked=partly` | rien sur les indices (plus de déduction) ; journal vide |
| C | `portions=too_much, household` | indice portion −1 pour Claire, mineurs exclus par motif |
| D | `way_too_much` + `member:Claire` | −2, `ok=true` (défaut ⑥ toujours fermé) |
| E | C puis `not_enough` | retour à 0, enveloppe ×1,00 (contrefactuel) |
| **J** | `difficulty=too_hard` | `recipe_difficulty` descend d'un cran + 1 ligne journal avec la question citée |
| **K** | `speed=too_long` | `cooking_time_min` descend ; au plancher : `atFloor`, journal quand même |
| **L** | `anything_else="Léa doit bien manger le mardi, elle a danse"` | 1 note mémo, sujet Léa, `when=tue/dinner` ; **0** préférence |
| **M** | `never_again=[{food:"saumon", subject:"member:Tom"}]` | `food.exclude` sujet Tom ; génération suivante : saumon absent des boîtes de Tom, bites=0 |
| G | aliment absent du plan | refus nommé, rien écrit |
| I | deux bilans sur le même plan | `already_answered`, aucun double effet |

Chaque cas : relire `meal_plan_feedback`, `practical_constraints` (champs + journal +
`retained_items` + `memo`), puis **une génération** et les compteurs `keel.*.envelope`,
`keel.*.notes`, `exclusion_belt`.

### 5.6 ⏸ HUMAIN

`supabase db push` de la migration du lot B (et des deux en attente). Commit.

---

## 6. LOT C — un seul magasin de préférences, et le chat se ferme

**But** : « Tom n'aime pas le poisson » n'a plus qu'un lit ; le chat ne nourrit plus le
plan.

### 6.1 Le dialogue « Préférences alimentaires » du foyer

- Le champ **« Aliments refusés »** (`MouthFormDialog.tsx::DislikeFields`,
  `mouthProfile.ts` → `writers.addRestriction`) écrit désormais un `food.exclude`
  `subject=member:<uuid>` `source=written` dans `retained_items`, via
  `keel_write_retained_items` (vérifie que la RPC accepte un sujet membre et un
  appelant qui est le titulaire du foyer ; sinon migration).
- La **restriction parentale** garde sa table et son verrou, mais change de nom et de
  place : « Interdit dans ce foyer » / « Not available in this household », **visible
  uniquement en mode famille et sur un mineur** (§8.5 règle 1 — le défaut doit être
  *restriction impossible sur un majeur*). Ce n'est pas une préférence : elle
  n'apparaît pas sur la carte de la personne restreinte comme un goût, mais comme
  « pas disponible dans ce foyer, décidé par <prénom> » (règle 3).
- Les 7 lignes locales de `household_food_restrictions` : ne migre rien en base
  automatiquement — le sens (goût ou interdit) n'est pas déductible. Écris une requête
  qui les liste et laisse l'humain trancher (⏸).

### 6.2 Fermer le pont du chat

- Démonter `FoodPreferencesCard` de `/app/plan` (« Ce que tu m'as dit ») et sa section.
- Retirer `foodPreferencesForPrompt` et `reconcileFoodPreferencesFor` des **deux**
  générateurs et de `household_voices_io.ts`. Après ce lot : `grep -rn memory_items
  supabase/functions/generate-*` rend **zéro** ligne, et un test de câblage l'exige.
- `food_preferences` existant : reste lisible sur la carte (« Anciennes notes ») pour que
  la personne le **range** (en préférence) ou l'**enlève** ; il n'atteint **plus** le
  prompt. Mets ce fait dans l'intro de la section.
- `promote-candidate-memory-items` et le memorizer : hors périmètre, ne touche pas.

### 6.3 `rhythm.set` et `logistics.set`

- Plus aucun écrivain : le bilan écrit le champ (M5), la carte ne propose plus ces
  familles au « Ranger dans ». Le lecteur (`retained_items_routing.ts` :
  `rhythmOverlayFor`, `logisticsOverlayFor`) reste **un cycle** pour les lignes
  existantes, avec un compteur `served` ; s'il rend 0 sur la campagne finale, retire-le
  et nomme-le dans le rapport. (Une ligne locale `questionnaire · logistics.set` existe.)

### 6.4 Tests

- Le dialogue écrit une préférence : test d'intégration front (`*.int.test.ts`, comme
  `habitWriters.int.test.ts`) qui suit l'écriture jusqu'à `retained_items`.
- Zéro lecteur de `memory_items` dans les générateurs (test qui lit le source).
- `household_restriction_lock.ts` inchangé, ses tests verts.
- Un test qui écrit la **même** normalisation d'aliment (`termsOfInstruction`) dans le
  dialogue et via un retour, et vérifie **une** ligne (identité de contenu).

### 6.5 Banc en conditions réelles

Sur la fixture : poser « saumon » sur Tom **par le dialogue** (la RPC que l'écran
appelle, pas un insert), générer, lire `exclusion_belt` : `mouths=1 checked=N kept=N
refused=0`, saumon absent des boîtes de Tom, présent ailleurs si le plan en sert. Puis
la requête anti-doublon :

```sql
-- zéro ligne attendue : un même aliment normalisé pour une même bouche dans deux magasins
with r as (select member_id, lower(label) f from household_food_restrictions),
     p as (select split_part(e->>'subject',':',2)::uuid member_id, lower(e->'value'->>'food') f
           from student_goals g, jsonb_array_elements(g.practical_constraints->'retained_items') e
           where e->>'kind'='food.exclude' and e->>'subject' like 'member:%')
select * from r join p using (member_id, f);
```

### 6.6 ⏸ HUMAIN

Le sort des 7 restrictions locales ; commit.

---

## 7. LOT D — la carte montre trois choses, une fois chacune

**But** : « Ce que Sophia sait de toi » = trois sections + l'encart, **groupées par
personne**, sans doublon visible.

### 7.1 La page

1. **Préférences alimentaires** — par personne (Claire / Léa / Tom / « toute la table »),
   deux listes : *à ne plus servir*, *à revoir* ; aliments **et** préparations ensemble
   (une préparation est une préférence). Source en clair, éditer, enlever — comme
   aujourd'hui.
2. **Ce que je sais d'autre** — les notes (mémo), par personne, datées, avec le `when`
   rendu (« le mardi soir »), et la citation. Éditer le texte, enlever.
3. **Réglages ajustés** — le journal des indices (`field_changes`) tel quel, compact,
   avec **Défaire**. C'est la seule face visible de la destination 2, et elle existe
   pour le retour en arrière, pas comme « savoir ». Les portions y figurent (position
   par personne, phrase actuelle `known.index.portions.*`).
4. **Pour le prochain plan** — l'encart, **seulement s'il est non vide** ; « jusqu'à ce
   que ton prochain plan soit validé » à la place de la date ; lecture seule + enlever.
5. **Anciennes notes** — tant qu'il en reste ; intro qui dit qu'elles n'atteignent plus
   le plan (lot C).

Disparaissent : « Ton rythme », « Ta cuisine », « Ce que Sophia a retenu d'autre » (fusionné
en 2), les sections `method.*` séparées, `craving`.

### 7.2 Le code

- `api/retainedItems.ts` : `KnownStore` porte `preferences[]`, `notes[]`, `fieldChanges[]`,
  `nextPlan[]`, `legacyNotes[]`, groupés par sujet ; `persistKnownStore` inchangé dans
  son principe (snapshot, refus nommés).
- `KnownAboutYouCard.tsx` : réécrit autour des quatre blocs ; garde les gardes existantes
  (gate de chargement, `stale_snapshot` rendu sous le bouton, `store_unreadable`,
  `refused.body`).
- i18n `known.*` en parité fr/en ; supprime les clés mortes (un test de parité existe :
  `catalog.ts`).
- Corrige le commentaire périmé « ÉCRITE ET NON LANCÉE » de `StudentKnownPage.tsx`.
- Le récap du soir (`memory_recap.ts`) annonce aussi une **note** neuve et une
  **préférence** neuve écrites par le retour ou le bilan (« J'ai noté pour Léa : … ») —
  c'est la moitié « on le dit » du modèle.

### 7.3 Tests

- vitest sur le mapping magasin → blocs (chaque famille restante a un bloc, aucune en a
  deux).
- Un test qui rend la carte avec **un même aliment** en préférence et en note et
  **échoue** — la règle anti-doublon a un test, pas seulement une phrase.
- `tsc -b --force` sur `tsconfig.app.json`.
- Vérification navigateur (`preview_start`, launch.json) : `/app/about-you` à 320 px et
  desktop, clair et sombre ; l'encart absent quand vide, présent après une phrase 10 du
  banc A ; screenshot **hors scroll 0** = décaler le body (piège connu du pane).

### 7.4 ⏸ HUMAIN

Commit. Puis `supabase functions deploy` de tout le chantier quand la campagne finale
est verte.

---

## 8. CAMPAGNE FINALE — quatre cycles sur un compte neuf

**But** : prouver que la boucle apprend selon le modèle, et qu'aucun magasin ne double
un autre.

### 8.1 Préparation

- Compte neuf (`qa-3dest-<date>@keeltest.dev`), fixture par les RPC de l'écran, foyer
  Claire/Léa/Tom, **mémoire vide** (vérifie : 0 `retained_items`, 0 mémo, 0 restriction).
- `./scripts/local_extend_kong_functions_timeout.sh`, `supabase functions serve` frais,
  JWT renouvelé entre cycles (~1 h).

### 8.2 Les quatre cycles (`scripts/2026-09-XX-HHMM-banc-4-cycles-v2.sh`)

```
cycle 1  plan → retour « mon fils n'aime pas le poisson »        → bilan portions=too_much (Claire), difficulty=too_hard
cycle 2  plan → retour « ma fille a danse le mardi soir, il lui faut un vrai repas »
                                                                   → bilan speed=too_long, never_again=[{poulet, household}]
cycle 3  plan → retour « j'ai envie de fajitas cette semaine »     → bilan portions=not_enough (Claire), anything_else="on mange tard le vendredi"
cycle 4  plan (validé : poser validated_at)                        → vérifier que l'encart du cycle 3 est MORT
```

### 8.3 Les grandeurs, par cycle (toutes en base ou en compteurs, jamais « à l'œil »)

| grandeur | source | attendu |
|---|---|---|
| préférences tenues | `exclusion_belt` bites ; boîtes de Tom sans poisson ; plan sans poulet dès le cycle 3 | 100 % dès le cycle qui suit l'écriture |
| note de Léa servie | `keel.household_meal.notes served` + ligne du mardi dans le `userMessage` | dès le cycle 3 ; grammage du dîner du mardi de Léa > lundi |
| indice portion | `portion_applied` / `portion_excluded` (lane foyer !) | −1 (c1) → 0 (c3) ; mineurs exclus par motif à chaque cycle |
| capacité, rapidité | `practical_constraints` + `field_changes` | bougent **une fois** chacun, avec la question citée ; pas de dérive aux cycles suivants |
| encart | `retained_next_plan` + carte | présent au cycle 3, **absent** après `validated_at` du cycle 4 (`sonde-expiration` réécrite sur `validated_at`) |
| anything_else | mémo, sujet household | 1 note « on mange tard le vendredi » ; 0 préférence, 0 indice |
| doublons | la requête du §6.5 + une seconde sur mémo × préférences (même aliment normalisé) | **0 ligne** |
| sécurité | `student_safety_constraints`, `household_member_*` | inchangés (aucune phrase de sécurité dans cette campagne — c'est voulu, on l'a prouvé au lot ①) |
| répétition de plats | titres d'un cycle à l'autre | à reporter, pas à juger (pas de répertoire) |

### 8.4 Le rapport final

`scratchpad/2026-09-XX-HHMM-RAPPORT-trois-destinations.md` :
- par lot : ce qui a changé, les compteurs bruts avant/après, les fichiers ;
- la campagne : le tableau §8.3 rempli ;
- les fois où **ton banc** s'est trompé (il y en aura) et ce que tu as corrigé ;
- ce qui reste ouvert, **nommé** ; ce qui attend l'humain (`db push`, `deploy`, commits).

Puis mets à jour la mémoire du projet (une mémoire par fait non dérivable du code — pas
un résumé de session) et la ligne d'index correspondante.

---

## 9. Ordre, arrêts, et ce qui te fait t'arrêter

```
0 ─⏸─ A ─⏸─ B ─⏸(db push)─ C ─⏸─ D ─⏸─ campagne ─⏸(deploy)
```

Tu t'arrêtes aussi, sans attendre le point ⏸ suivant, si :
- un run réel rend un chiffre que tu ne sais pas expliquer (§1.4 : instruis-le avant de
  conclure) ;
- une décision **produit** apparaît que le lot 0 n'a pas tranchée (exemple : que faire
  d'une note qui contredit une préférence) — tu la nommes, tu proposes, tu attends ;
- un refus de hook.

Tu ne t'arrêtes **pas** pour : un choix de nom, une structure de fichier, un vocabulaire
fermé dont le lot 0 donne la règle, une migration de forme.

Tout ce que tu affirmes dans un rapport doit pouvoir être **relu en base** ou **rejoué
par un script** du dépôt. Sinon, ne l'affirme pas.
