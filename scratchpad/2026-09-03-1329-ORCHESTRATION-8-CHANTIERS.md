# Journal d'orchestration — les huit chantiers du 3 septembre

**Ouvert** 2026-09-03 13:29 · **Orchestrateur** agent (ne code pas) · **Branche de départ** `ff-001-quotidien-du-coach`
**HEAD à l'ouverture** `5d630e4d` · **Master prompt** [2026-09-03-1308-MASTER-PROMPT-8-CHANTIERS.md](2026-09-03-1308-MASTER-PROMPT-8-CHANTIERS.md) ·
**Analyse** [2026-09-03-1237-ANALYSE-8-POINTS-ET-PLAN-8-AGENTS.md](2026-09-03-1237-ANALYSE-8-POINTS-ET-PLAN-8-AGENTS.md)

---

## §3 — Les décisions prises PAR DÉFAUT (recopiées du master prompt, aucune question posée)

| Décision | Défaut appliqué |
|---|---|
| D1.1 | la veille **dans** la fenêtre ; migration cap 8 / exclusion sur les jours mangés / RPC |
| D1.2, D1.3, D1.4, D1.6 | oui, 8 autorisé, fuseau du compositeur, garde symétrique à l'adoption |
| D1.5 | FF-005 passe 🔴, remplacée par P2 |
| D2.1, D2.6 | durable, fait de maison sur la ligne du maître |
| D2.2 | « Le moins possible — je réchauffe » · « Un juste milieu » · « J'aime cuisiner, envoie » |
| D2.3, D2.4, D2.5 | le style plafonne les sessions ; `weeklyCookingMinutes` réveillé et **dit** ; le retour de plan descend le style |
| D3.1, D3.2, D3.3 | l'option vide est la cible ; un mineur ne voit que « Manger normalement » ; `null` en base reste valide |
| D4.1 | `/app/meals` est la cible |
| D5.1 … D5.6 | dépliable renversé par écrit ; Modal unique avec accordéon ; étape 2 unifiée ; `about-you` rejoint le cadre préférences des comptes ; `/app/health` renommée « Sécurité » ; le corps d'un membre reste `not_owner`, dit à l'écran |
| D5.7, D5.8, D5.9 | lien + copier + `mailto:` (pas d'envoi) ; **aucun montant recopié**, l'écran lit `offer.extra` — le chiffre 1,99/2,00 reste à l'humain ; renvoyer = nouveau jeton |
| D6.1, D6.2, D6.3 | oui (lane CUISINE), oui (lane CUISINE), namespace `setup.work_lunch.*` gardé |
| D7.1 … D7.12 | `/app/progress` = « Suivi », `/app/health` = « Sécurité » ; effectué = ≥ 1 coche ; `shifts[]` tracé par P8 ; **deux chiffres mesurés, aucune convention de temps** ; total à base la plus faible + « estimé » ; les 6 occasions ; `declared_quantities` si la personne écrit des quantités ; `SLOT_DAY_WEIGHT` réutilisé, en-tête réécrit ; fonction edge neuve ; FF-031 §3 renversée par écrit ; courbe aussi en maintien ; `ProgressPage.tsx` supprimée |
| D8.1 … D8.7 | chat Sophia → membre ; « pas de nouvelles » se **lit** (base `assumed`), ne s'écrit pas ; contradiction structurelle, la ligne de la personne gagne ; aucun glissement depuis un membre ; le maître marque les bouches **sans compte** ; pas de lecture des questions courses/cuisson pour le membre ; `enable_confirmations` = geste humain, nommé au rapport final |

---

## Lot 0 — le poste

- **13:29** Ouverture. `git status --short | wc -l` = 371 (attendu ~369). Pile Docker debout depuis 12–22 h ;
  `functions serve --env-file supabase/.env` déjà en cours (pid 9201, depuis 15:20 la veille).
- **13:29** `./scripts/check-local-jwt-alg.sh` → ✅ HS256, une seule clé, `signing_keys.local.json` vide.
- **13:29** Registre des migrations (docker exec, `psql` absent du PATH) : disque == registre, zéro doublon.
  Cinq derniers : `20260902100000`, `20260902090000`, `20260901233000`, `20260901220000`, `20260901200000`.
- **13:29** Comptes QA existants : `qa1v.coach@`, `qa1v.foyer@`, `qa1v.solo@keeltest.dev` (1 356 users en base). Aucun `qa0903*`.
- Exclusions du commit (c) : `scratchpad/2026-08-23-EVAL-QUALITE/*.json` (26 sorties brutes de plans/corps/rosters) — le reste du dossier (scripts, RAPPORT.md, .log) entre.
- **13:33** Commit (a) `1556c9b2` — lot énergie stagé tel quel (19 fichiers). Commit (b) `0543d6ea` — packs i18n
  (8 fichiers, +2 671/−815). Commit (c) `fa422747` — 365 chemins (dont 6 suppressions). Tous `--no-verify`, motif dans le message.
  Restent non suivis, exprès : 26 `.json` de sortie brute de `scratchpad/2026-08-23-EVAL-QUALITE/` (+ 1 `.log` gitignoré).
- **13:36** Kong : `read_timeout` functions-v1 → 900 000 ms (ligne 173 de kong.yml).
- **13:37** `.claude/launch.json` : cinq entrées `frontend-<lane>` avec **cwd absolu** vers le worktree, commit `bfecdc28`.
  **`bfecdc28` est la base des cinq worktrees.**
- **13:38** Worktrees créés sous `/Users/ahmedamara/Dev/Sophia-2-chantiers/<LANE>`, branches `chantier-0903/<LANE>`,
  `node_modules` (racine + frontend) en lien symbolique vers l'arbre principal, `frontend/.env.local` copié.

### Ports, tags, numéros de migration (réservés après lecture du registre, dernier = `20260902100000`)

| Lane | Worktree | Port | Tag QA | Migrations réservées |
|---|---|---|---|---|
| RAPIDE | `…/RAPIDE` | 5203 (`frontend-rapide`) | `qa0903r` | aucune |
| FOYER | `…/FOYER` | 5204 (`frontend-foyer`) | `qa0903f` | aucune |
| CUISINE | `…/CUISINE` | 5206 (`frontend-cuisine`) | `qa0903c` | A1 `20260903140000` (cap 8 / lead_days / exclusion / RPC) · A2 `20260903141000` (commentaire de colonne + liste fermée) |
| MEMBRE | `…/MEMBRE` | 5207 (`frontend-membre`) | `qa0903m` | A8.2 `20260903142000` (`meal_share_outcomes`) |
| SUIVI | `…/SUIVI` | 5208 (`frontend-suivi`) | `qa0903s` | aucune |

**Règle ajoutée par l'orchestrateur sur les migrations** (la base locale est UNIQUE et partagée) : en phase worktree, une
lane valide sa migration par `docker exec supabase_db_Sophia_2 psql -U postgres` dans une transaction **annulée**
(`begin; \i …; rollback;` — le bloc `do $$` de contrôle tourne, rien ne s'inscrit). Le `supabase migration up` réel se fait
**seulement** pendant sa fenêtre de run, sur l'arbre principal, dans l'ordre des fusions (A1 → A2 → A8.2) — sinon
une migration hors ordre est sautée en silence.

---

## T1 — lane RAPIDE (A3 puis A4, en série)

**Écart au §2.2 n°19, décidé par l'orchestrateur, motivé** : avec des worktrees, un fichier non commité ne traverse pas la
fusion — l'arbre principal ne compilerait plus après chaque merge (les clés typées depuis `en.ts` manqueraient). Donc chaque
lane commite ses packs (`en.ts`, `fr.ts`, `catalog.ts`) dans **un commit séparé par lot**, nommé
`i18n chantier-0903/<LANE> (<lot>)`, qui ne contient que ces trois fichiers, avec les clés dans le bloc délimité. Les
lots eux-mêmes ne les touchent pas. E fusionne, retire les délimiteurs, rejoue `parity`. Les conflits attendus à la fusion
(les blocs en fin de pack) se résolvent en gardant les deux blocs.

- **13:41** Lancement de **A3** (RAPIDE, la 4e option d'objectif), au premier plan.
- **14:30** **A3 rendu — « prêt à prouver »** (agent `ad8206c7890aad028`, 45 min). Commits sur `chantier-0903/RAPIDE` :
  `7739857a` (i18n), `bfceefa6` (journal v1), `f1c2ea37` (lot, 19 fichiers), `9aaa9877`, `c0731332` (journal v2/v3).
  tsc exit 0 ; vitest 2 066 tests, 5 rouges tous étrangers (`coverage-guard` ×2, `awayFrom` ×2 en baseline ;
  `mealBoxes.int.test.ts › un contenant sans bouche…` hors baseline, **rouge à `bfecdc28`** prouvé sur worktree détaché).
  Mutations : option vide réintroduite → 15 rouges ; `unknown` lu mineur → 10 ; ordre fixe → 2 ; pli retiré → 1.
  Clés i18n : +`household.goal.minor_maintenance`, `.minor_only`, `.minor_switched`, `household.error.goal_not_for_minor`,
  `.target_not_for_minor` ; −`household.member.goal_none`, `setup.mouths.goal_none` (×2 packs).
  Journal : `RAPIDE/scratchpad/2026-09-03-1345-RAPIDE-A3-quatrieme-option-objectif.md`. **ROUGE : rien vu au navigateur.**

### Trois faits de poste remontés par A3, vérifiés par l'orchestrateur

1. **Le gate de commit s'arrête sur Deno dès la base** : `deno test --no-run _shared/keel/` à `bfecdc28` = 18 erreurs TS dans
   dix fichiers de test (`daily_pulse_test` 10, `draft_note_classify_test` 5, `daily_pulse_locale_test` 5, `pot_demand_test` 2…).
   Rien sous `supabase/` n'est touché par A3. Conséquence pour TOUTES les lanes : les contrôles front (`tsc -b --force`,
   `npx vitest run`) et les tests Deno **ciblés** se lancent à la main avant chaque commit ; les commits passent en
   `--no-verify` avec le motif écrit. Sur l'arbre principal (sale, cf. 3), le même `--no-run` compte 54 erreurs.
2. **`preview_start` refuse un cwd absolu.** Réparé : `.worktrees/<LANE>` (lien symbolique local, `.git/info/exclude`),
   cwd relatif dans `launch.json`, commit `3315799b`. `frontend-rapide` démarre sur 5203 (vérifié).
3. **Aucun agent n'entre de mot de passe dans un formulaire** (règle de sécurité du harnais, non négociable) et le
   classifieur a bloqué un appel `admin/generate_link` avec la clé service_role (14:36). Donc : **toute preuve au navigateur
   qui exige une session est un GESTE HUMAIN** — l'humain se connecte une fois par origine (port) dans le Browser pane avec
   la fixture du tag ; les agents pilotent ensuite l'onglet connecté. Tant que ce geste n'est pas fait, les preuves
   navigateur et les runs réels sous JWT élève sont consignés ROUGE. Les scripts de banc du dépôt
   (`scripts/2026-09-01-banc-*.sh`, `qa-create-run-connection.sh`) font eux-mêmes le `grant_type=password` : c'est le
   harnais du projet, une lane peut les LANCER, jamais réécrire un appel qui porte le mot de passe.

### Session parallèle sur l'arbre principal (découverte 14:30)

`git status` de l'arbre principal porte des modifications étrangères : le chantier **« la mémoire à trois destinations »**
(prompt maître 13:31, journal 13:46, lot A 14:25 — session `sophia-2-59` probable). Son journal me nomme. Il touche
`MODEL.md`, `NOMENCLATURE-MEMOIRE.md`, `api/retainedItems.ts`, `_shared/keel/{memo,retained_*,meal_generation,memory_recap_io}`,
les deux `generate-*-v1` (annoncé), migration `20260903120000`. **Collisions attendues** : `MODEL.md:28` (A4),
`meal_generation.ts` / `generate-*-v1` / `retained_item.ts` (CUISINE). Message de coordination envoyé 14:40 (commits au fil
de l'eau, annonce des restarts, ordre des migrations, bumps de version, Deno rouge à la base).
- **14:40** Lancement de **A4** (RAPIDE, les idées de repas), au premier plan.
- **15:02** **A4 rendu — « prêt à prouver »** (agent `a76116b8cf7488a58`, 20 min). Commits : `abbd9d8d` (lot), `86dac467` (i18n),
  `a994f0f9`, `31ee930f` (journal). tsc 0 ; vitest 2 072 tests, 5 rouges étrangers (les mêmes) ; `deno check meal-document-v1` 0.
  Test neuf `mealIdeasRemoved.int.test.ts`, 3 mutations rouges (route, onglet, catalogue → 1/1/2). **Sept clés retirées sur huit** :
  `meals.loading` gardée (deux appelants vivants sur `/app/plan` — la liste du mandat venait d'un motif de noms). Catalogue :
  `/app/meals` retiré. **Prouvé sans session** : `/app/meals` → 404 du produit à 320 et 1280 px. **ROUGE** : barre à 4 onglets
  derrière une session. Journal : `RAPIDE/scratchpad/2026-09-03-1445-RAPIDE-A4-idees-de-repas.md`.
- **T1 terminé.** `chantier-0903/RAPIDE` HEAD = **`31ee930f`**.

### Réponse de la session parallèle (`sophia-2-59`, 14:55) et ce que j'en fais
- Elle **ne commite qu'avec l'accord de l'humain** (règle de son prompt maître) : ses fichiers restent sales « quelques heures ».
  ⇒ **La fusion de RAPIDE dans l'arbre principal est différée** jusqu'à son commit (`MODEL.md` sale bloque `git merge`).
  Elle me préviendra par message. Rien ne bloque T2 : **les quatre lanes partent de `31ee930f` (fast-forward des quatre
  branches sur `chantier-0903/RAPIDE`, 15:03)**. Le launch.json (`3315799b`) reste sur la branche principale seulement —
  `preview_start` lit celui de l'arbre principal.
- Migration `20260903120000` **inscrite au registre** (14:58). `keel_write_retained_items_for` passe à 7 paramètres.
  Mes réservations `20260903140000/141000/142000` restent en ordre.
- Aucun bump de version de prompt chez elle ; un prompt sans note est byte-identique.
- **Amendement au §2.2 n°14 (runtime)** : sous `functions serve` (pid 9201), `docker restart` déclenche la boucle
  create→kill→destroy et des 502 (mémoire du dépôt, confirmée par la session parallèle). Avant chaque fenêtre de run, je
  **relance `supabase functions serve --env-file supabase/.env`** (kill du pid courant, relance en arrière-plan depuis
  l'arbre principal) puis le script Kong, et je l'annonce aux deux sessions.
- Ses régions dans les fichiers que CUISINE touchera : `meal_generation.ts` (bloc `args.memo`, ~10 lignes),
  `household_meal_generation.ts` (`HouseholdPromptInput.notes`, `notesServed`, `notesBlock()` avant
  `buildHouseholdPromptBlocks`, une ligne dans la liste des parts), `generate-meal-v1/index.ts` (~l.1965, compteur
  `keel.meal.notes`), `generate-household-meal-v1/index.ts` (~l.4151, `notes: memberNoteLines`, compteur),
  `retained_item.ts` (`defaultScopeFor("draft_note")` → durable). Transmis à CUISINE.

---

## T2 — quatre lanes en parallèle (base `31ee930f`)

- **15:05** Lancement en arrière-plan de **FOYER** (A6→A5), **CUISINE** (A1→A2), **MEMBRE** (A8.0→A8.1→A8.2), **SUIVI** (A7).
  Chaque lane annonce ses lots à l'orchestrateur par `SendMessage` vers `main` ; les fenêtres de run s'ouvrent en série,
  dans l'ordre A8.0 → A6 → A1 → A2 → A5 → A8.1 → A8.2 → A7, après la fusion de RAPIDE.
- **15:12** La session parallèle a commité son lot 0 : `3f2af62a` (MODEL.md, NOMENCLATURE-MEMOIRE.md, 2 scratchpads). Ses fichiers
  du lot A restent sales (liste au 14:55).
- **15:15** **Fusion de RAPIDE dans l'arbre principal** : `git merge --no-ff chantier-0903/RAPIDE` → **`f3eea513`**, aucun conflit,
  aucun fichier sale dans la fusion (comm sur `git status` avant). MODEL.md porte les deux changements. Puis `d4972302` :
  entrée `frontend-verif` (5209) pour un **worktree détaché de vérification** `Sophia-2-chantiers/VERIF` (recréé à chaque
  fusion au commit de fusion) — le vérificateur ne rejoue jamais sur l'arbre principal, qui porte le travail non commité de
  l'autre session. Session parallèle prévenue.
- **15:16** Lancement du **vérificateur RAPIDE (A3+A4)** sur `VERIF@f3eea513`, port 5209, tag `qa0903r`.

### 16:0x — les cinq agents tués par la limite de session (reset 16:50)

Les quatre lanes et le vérificateur ont été terminés par une erreur d'API (`rate_limit`, 429, « session limit »), après
10 à 20 tours chacun. **Aucun n'avait commité** ; leur travail est dans leurs worktrees, non commité, intact
(rien n'est perdu : aucun `stash`, aucun `reset`). État relevé à 17:02 :

| Lane | HEAD | Travail non commité |
|---|---|---|
| FOYER | `31ee930f` | A6 bien avancé : `PersonWorkLunch.tsx`, `MemberWorkLunchCard.tsx` + son test (neufs), `WorkLunchCard.tsx` et `workLunchRoster*` supprimés, `TableStepPlanning.tsx`, `HouseholdPage.tsx`, `SetupPage.tsx`, `presenceRoster*`, `workLunchCommit.ts`, packs i18n |
| CUISINE | `31ee930f` | A1 commencé : `plan_hours.ts`, `meal_plan_window.ts`, `grocery_waves.ts` |
| MEMBRE | `31ee930f` | A8.0 bien avancé : `pulse_audience.ts` (neuf), `KeelHouseholdRoute.tsx`, `routeGuards.int.test.ts`, `App.tsx`, `evening_strip_io.ts`, `planned_dish_io.ts`, `accident_io.ts`, `keel-daily-pulse-v1`, `household_plan_kind_readers_test.ts`, FF-048 / FF-058 / README foyer |
| SUIVI | `31ee930f` | rien (l'agent était encore en lecture) |

**Le vérificateur RAPIDE, lui, avait fini** : rapport complet, ligne finale **VERT**
(`scratchpad/2026-09-03-1530-RAPIDE-A3A4-verification.md`) — statique, 9 mutations rejouées, C7, docs ↔ base, 404 de
`/app/meals` à 320/1280 px en deux langues ; seuls ROUGE : les quatre gestes qui exigent une session. Aucun défaut de lot.
Trois écarts de périmètre nommés, sans logique (commentaires de `MealBuilder.tsx` / `StudentWeekPlanPage.tsx`, doc FF-044) :
**acceptés** par l'orchestrateur — ils accompagnent le retrait, ils ne l'étendent pas.

**Économie décidée pour la reprise** : les agents relancés ne relisent plus le MASTER PROMPT et l'ANALYSE **en entier**
(~34 k jetons chacun, 5 fois) mais leurs sections nommées. Motif : la limite de session est la ressource rare du chantier,
et chaque agent tué recommence par ces lectures.

### Lot A de la session parallèle : commité `7f451a8f` (16:5x)

Trois signatures **changées** dans l'arbre principal, qui mordront à la fusion des lanes (aucune n'est dans leur base
`31ee930f`) : `memoLinesForPrompt(pc, {subject, who})` (ancienne signature supprimée), `isNextPlanItemAlive(entry, plans)`
(ancienne à 3 arguments supprimée), et surtout **`HouseholdPromptInput.notes` REQUIS** — tout appelant qui construit cet
objet doit passer `notes: []`, sinon `tsc` rougit. Transmis à CUISINE (qui construit cet objet en A2/D6.2).
Son lot B (en cours) touchera `plan_feedback_retained.ts`, qui est la région de **D2.5** (CUISINE) : elle préviendra.
Deux constats de son run réel, utiles aux bancs : `keel_household_set_member_diet` et `keel_household_add_allergy`
rendent `not_authenticated` sous `service_role` ; le conteneur edge s'est fait **recréer par son superviseur** en cours de
run (502 puis `Up 55 seconds`) sans que personne ne le restart.
- **17:05** Relance des quatre lanes en **reprise** (leur worktree porte déjà leur travail).
- **17:05** Quatre lanes relancées en reprise (FOYER, CUISINE, MEMBRE, SUIVI). Chacune reçoit : l'état exact de son
  worktree, l'ordre de **commiter tôt et souvent** (un agent tué sans commit fait tout recommencer), des lectures
  **ciblées** au lieu des documents entiers, et l'attribution `Co-Authored-By: Claude Opus 5`.
  Le vérificateur RAPIDE n'est **pas** relancé : son rapport est complet et VERT.

## 17:2x — A6 fusionné, et la convention `_for` réglée avec la session parallèle

- **17:2x** `ecf57adc` : mes deux fichiers d'orchestration (journal + rapport de vérification RAPIDE) commités.
- **17:2x** **Fusion de A6** : `git merge --no-ff chantier-0903/FOYER` (à `694a616f`) → **`4d3aabc8`**, aucun conflit, aucun
  chevauchement avec les fichiers sales de la session parallèle (vérifié par `comm` avant : elle tient `plan_feedback.ts`
  et `plan_feedback_retained.ts`, A6 ne touche que du front et les packs i18n).
  A6 annonce : tsc 0, vitest 2 060/2 085 avec **exactement** les 5 rouges étrangers connus, 3 mutations rejouées par
  l'agent de reprise lui-même, **aucune clé i18n ajoutée ni retirée** (4 valeurs changées en place), `catalog.ts` intact.
  **ROUGE** : rien au navigateur (scénario écrit pour la fenêtre).
- **Écart d'ordre assumé** : le master prompt fusionnait A8.0 avant A6. A8.0 n'était pas prêt, et **aucune dépendance ne
  les lie** (MEMBRE a interdiction de toucher `HouseholdPage.tsx`). L'ordre était une liste de dépendances, pas un rituel.
  A6 est donc passé devant. La contrainte réelle est ailleurs : **A8.0 doit tomber tôt pour la lane SUIVI**, qui code
  contre son contrat.
- **17:2x** Worktree `VERIF` recréé, détaché sur `4d3aabc8` ; vérificateur A6 lancé. Incident sans conséquence : le
  `git worktree remove --force` précédent avait laissé un dossier résiduel de 2 fichiers (cache Vite, 8 ko) qui bloquait
  la recréation — inspecté avant retrait, `node_modules` de l'arbre principal vérifié intact.
- **Dette nommée, acceptée** : dans `HouseholdPage`, la lecture du déjeuner est keyée sur `meRole === "owner"`. Juste
  aujourd'hui (un non-maître ne voit aucune ligne), **fausse dès que A5 point 6 ouvrira la ligne d'un membre réclamé**.
  À réparer **dans A5**, écrit au journal de A5 comme dette héritée. Ce n'est pas un défaut de A6.

### La convention `_for(p_user)` : elle existait déjà, je n'en ai pas inventé une seconde

La session parallèle demandait quelle forme retenir pour la jumelle serveur d'une RPC gatée `auth.uid()`. Réponse
trouvée **dans le dépôt**, pas décidée : `keel_write_retained_items_for` (`20260818250000_the_server_had_no_write_port.sql`,
étendue par sa propre `20260903120000`). Forme : nom du port `auth.uid()` suffixé `_for` ; `p_user uuid` en premier
paramètre ; `security definer` ; `set search_path to ''` ; `revoke all … from public, anon, authenticated, service_role`
puis `grant execute … to service_role` — **`service_role` seul**, parce qu'un `p_user` accordé à `authenticated` est un
paramètre qu'on peut mentir ; refus nommé sur `p_user is null` ; contrôle par `has_function_privilege('anon', …)`,
jamais par lecture du fichier. Point de fond transmis : l'en-tête de `20260818250000` dit que ce port **ne donne aucun
pouvoir neuf** (`service_role` peut déjà tout écrire), il contraint une **forme** — donc « `p_user` est le titulaire du
foyer » n'est pas une garde de sécurité, c'est la **traduction fidèle du refus `not_owner`**, et elle doit s'écrire comme
un refus nommé, pas comme un `where` qui ne touche aucune ligne (un `update` à zéro ligne rend 204).
C'est le patron que la lane MEMBRE suit pour `meal_share_outcomes`.

### Collision réelle révélée par son message : son lot B ↔ mon D2.5

Son lot B réécrit `plan_feedback_retained.ts`, qui est la région de **D2.5** (CUISINE). **Décidé** : son lot B passe
**avant** A2 ; CUISINE construit D2.5 par-dessus, changement minimal et localisé. Deux signatures de son lot B
transmises à CUISINE : `questionsFor(restrictionFlag)` perd `goal`, et `FEEDBACK_QUESTIONS` perd `hunger_between_meals`
et `could_finish` (`axis_question` / `axis_answer` restent lues).

## 17:4x — A8.0 fusionné : le contrat est réel

- **17:4x** `43a53f49` (journal) puis **fusion de A8.0** : `git merge --no-ff chantier-0903/MEMBRE` (à `31148a5a`) →
  **`cf2b8558`**, aucun conflit, aucun chevauchement avec les fichiers sales de la session parallèle. Puis `a948f8a2` :
  un **second** dev server de vérification (`frontend-verif2`, 5211) et un second worktree détaché `VERIF2` — deux lots
  peuvent être en vérification en même temps, et le worktree du premier vérificateur ne se déplace plus sous ses pieds.
- A8.0 annonce : audience du cron en deux phases (`pulse_audience.ts`, neuf ; maîtres avant membres ; jamais `keel_role`) ;
  `resolvePlanScope` dans les deux lecteurs (`.eq("plan_kind","household")` **et** `.eq("household_id")`) ; `/app/chat`
  et `/app/progress` sous `KeelHouseholdRoute` ; R4, R5 et FF-058 §11 écrits ; `generated_from.shifts[]` apposé par
  `applyPlanShift` (D7.3). tsc 0, vitest 2 048 verts, 144 tests Deno verts, 5 mutations jouées et restaurées par `cp`+`cmp`.
  Antériorité des 13 erreurs Deno de `daily_pulse_test` / `daily_pulse_locale_test` prouvée **par identité** (byte-identiques
  à `31ee930f`) — toutes sur `renderPulseMessage` sans la propriété `memory` (`daily_pulse.ts:655`), ce qui ressemble à
  une signature élargie par le chantier mémoire de la session parallèle : question posée, personne n'y touche en attendant.
- **17:4x** Contrat transmis à la lane SUIVI (« A8.0 commité : `31148a5a`, fusionne-le »), avec les précisions qu'il
  apporte au §5.10 et le rappel que `meal_share_outcomes` n'existe pas encore (⇒ « boîtes restées » = **inconnu**, jamais zéro).
- **17:4x** Vérificateur A8.0 lancé sur `VERIF2@cf2b8558`. Consignes renforcées, parce que ce lot est un **contrat** :
  chercher un **troisième** lecteur de `student_generated_meals` que le lot aurait oublié ; rejouer le run adversarial H2
  **en test** (jamais en réseau : `pulse_audience.ts` est neuf, le runtime ne le sert pas encore et rendrait un faux
  résultat) ; vérifier que les renversements sont **écrits et datés**, pas seulement effacés ; vérifier lui-même la preuve
  d'antériorité par identité ; et une section à part pour toute **déviation du contrat §5.10**, plus grave qu'un défaut
  ordinaire puisqu'une autre lane code dessus.

**État des fusions** : RAPIDE (A3, A4) ✅ vérifiée VERT · A6 ✅ en vérification · A8.0 ✅ en vérification.
**En cours** : CUISINE A1 · MEMBRE A8.1 · FOYER A5 · SUIVI A7 (front, puis fusion de A8.0 dans sa base).

## 18:0x — A6 vérifié VERT, et le gate de commit réparé

**Vérification A6 : VERT, aucun défaut** (`scratchpad/2026-09-03-1713-FOYER-A6-verification.md`). Le vérificateur a
rejoué et non cru : 16 fichiers tous au mandat, **0 sous `supabase/`**, `presenceMarks` intact, tsc 0, vitest 2 060/2 085
avec exactement les 5 rouges étrangers, `pageSeams` et `parity` verts. Les jeux de clés i18n extraits aux deux commits et
comparés : **aucune clé ajoutée ni retirée**, exactement les 4 valeurs annoncées, pas de mojibake. Les trois gardes lues
dans le code (garde contre le `saved` **serveur** dans un module pur, relecture câblée avant `onSaved`, `null` ≠ `Map`
vide aux deux endroits), **zéro `useEffect`**. Les 3 mutations du mandat rougissent au compte exact, **plus deux à lui**
(filtre `age_state` désarmé → 3 rouges ; carte déplacée sous la grille → 1 rouge), 36/36 restaurations prouvées par `cmp`.
Correction utile d'un chiffre du mandat : les lignes 144-277 portaient **7** `it`, pas 10 — les 7 sont déplacés avec toutes
leurs assertions, les 3 autres réécrits, **aucun perdu**. En prime, une lecture SQL montre que la porte
`keel_away_with_work_lunch` retire puis réécrit les cinq midis à chaque écriture (la garde M1 est bien porteuse) et
**n'oppose aucun refus `has_account`**, ce qui valide l'arbitrage de ne pas filtrer sur le compte.
Deux points nommés, non imputables à A6 : les packs i18n commités par la lane (**pour E**), et la dette `meRole === "owner"`
(**pour A5**), vérifiée « juste aujourd'hui » — un non-maître ne reçoit aucune `MemberRow`, et la porte SQL autorise déjà
un membre réclamé à écrire sa propre ligne.

### Le gate de commit revient — 18 était un chiffre faux, et la dernière erreur n'était à personne

Mesure sur un **worktree propre détaché** (l'arbre principal est pollué par le lot B en vol : il rendait 54 puis 58) :
**14 erreurs**, pas 18 — le lot A de la session parallèle en avait déjà réparé 5 (`draft_note_classify_test`).
Sur ces 14 : **13** sont ses `renderPulseMessage` sans `memory`, qu'elle a réparées ; **la 14e était seule**,
`pot_demand_test.ts:21` — un aide-test construisant un `AnchorFactor` sans `extrasFloored`, requis depuis que
`mouth_anchor.ts:661` porte le compteur du plafond des extras. Lignée : `fa422747`, **mon propre instantané** — elle
n'appartenait à aucun chantier, ce qui explique qu'elle ait survécu à tout le monde.
Réparée par l'orchestrateur : **`a0eb7b76`**, une ligne, `extrasFloored: false` dans le défaut de l'aide-test — la valeur
que les trois constructeurs de production posent hors ancrage (`mouth_anchor.ts:788, 809, 848`) et que le commentaire du
type nomme comme exacte. Aucun test ne la surchargeait ; les 12 du fichier passent.
**Pourquoi l'orchestrateur et pas une lane** : ce n'est ni un lot ni une lane, c'est le poste. Sans ce geste, huit lots
commitent `--no-verify` et le gate ne tourne pour personne. Le chiffre « 18 » cité dans tous les prompts de lane est donc
**périmé** : au prochain commit de la session parallèle, il ne devrait rester **zéro**. À revérifier sur arbre propre.

## 18:0x-18:3x — LE GATE DE COMMIT EST RENDU (`agent-gate.sh` exit 0)

Pour la première fois du chantier. Chemin, en quatre gestes, tous mesurés **sur worktree détaché** — l'arbre principal
est pollué par le lot B de la session voisine et rendait 54 puis 58 erreurs là où l'arbre propre en rend 93 :

1. **Le chiffre « 18 » était faux.** Sur arbre propre : 14, pas 18 (le lot A de la voisine en avait déjà réparé 5).
2. **13 étaient à elle** (`renderPulseMessage` sans `memory`) — réparées par elle, `dfb56909`.
3. **La 14e n'était à personne** : `pot_demand_test.ts:21`, un `AnchorFactor` sans `extrasFloored`. Lignée `fa422747`,
   mon propre instantané. Réparée : **`a0eb7b76`**. ⇒ `deno test _shared/keel` compile en bloc, **4 996 verts, 0 rouge**.
4. **Le dernier rouge vitest hors liste n'était pas un défaut mais un test PÉRIMÉ.** `mealBoxes.int.test.ts` exigeait
   qu'un contenant sans bouche soit jeté ; `readBoxV4` a cessé de le jeter le **2026-09-01**, avec sa mesure (un plan
   solo réel portant onze contenants affichait un dépliant de session VIDE, la lane individuelle écrivant des boîtes
   sans nom par construction). La garde n'est pas perdue : elle est **remontée** côté serveur dans `parseGeneratedMeal`
   sous `soloBoxes` (`meal_generation.ts:6902`), tenue par `solo_boxes_test.ts`. **Deux tests du dépôt affirmaient donc
   l'inverse l'un de l'autre** — celui-ci rouge, `oneCookingSessionField.int.test.ts` vert. Retourné avec son motif daté,
   **muté** (remettre la règle d'avant dans le lecteur fait rougir 3 tests) : **`349602a3`**.
   ⚠️ **J'avais d'abord conclu à un vrai défaut** — le commentaire du code affirmait une garde « remontée » dont je ne
   trouvais aucune trace. C'était mon `grep` qui échouait (zsh, `--include`). Vérifier avant d'alerter : la garde existe,
   avec son test dédié. La leçon vaut d'être écrite : une affirmation d'absence se re-vérifie, y compris la mienne.
5. **Sept lignes de baseline périmées**, remesurées à `bfecdc28` : deux hausses (`mealBoxes` 14→16, `meCardSheet` 9→10),
   une baisse (`setupMouthsStep` 6→0, rouge réparé par A3, que le fichier demande lui-même d'annoncer), et **quatre
   fichiers qui manquaient purement à la liste** (`groceryWaves`, `householdHabits`, `planWeekCarriedDays`,
   `shoppingAisles`, une erreur chacun, identique à la base et à HEAD). Commits `fb686a62` et suivant. Les hausses sont
   écrites dans le fichier comme **dette à réduire**, pas comme plafond acquis.

**Pourquoi l'orchestrateur et pas E** : un gate qui refuse tout ne dit plus rien, et huit lots commitaient `--no-verify`
en le citant. Le motif « 18 erreurs à la base » donné dans les cinq prompts de lane est désormais **périmé** ; dit aux lanes.
`agent-gate.sh` final : `vitest 2086 tests, 4 rouges, 4 tolérés, 0 hors liste` · `typecheck 93/93` · `deno check` vert · **pass**.

### Vérification A8.0 : ROUGE, deux défauts, corrigés dans l'heure

Le vérificateur a trouvé deux gardes **réelles que rien ne tenait** — « la FORME prouvée, pas l'EFFET » :
**D1** la cascade du maître sur la bande du membre (remettre `args.userId` à la place de `args.statesOwnerId` laissait
4 936 tests verts) ; **D2** `generated_from.shifts[]` écrit mais sans un seul test (faire rendre `{...base}` à
`withShiftTrace` laissait tout vert) — **une clause du contrat §5.10**, donc la cicatrice « lecteur sans écrivain »
réintroduite dans le contrat lui-même. Son propre run adversarial H2, écrit sur le chemin d'**écriture** que le bâtisseur
n'éprouvait pas, montre en revanche la garde porteuse.
Correctif MEMBRE `5650ed9d` : un fichier de test neuf, 6 épreuves, **aucun code de production modifié**. La cause de D1
vaut d'être retenue : **la doublure rendait ses lignes quel que soit le filtre**, ce qui rendait l'échange des deux clés
structurellement invisible — le défaut était la doublure, pas l'épreuve manquante. Idem D2 : une doublure figée rendait
`unverified`, un vert de façade sur un chemin qui n'atteint jamais le payload.

### Les numéros de migration ne réservent pas l'avenir

La voisine ayant appliqué `20260903150000`, mes trois réservations (`…140000`, `…141000`, `…142000`) étaient passées
**sous** la tête du registre : elles auraient été **sautées en silence**. CUISINE l'avait déjà écrite sur le disque.
Renumérotées : **`20260903170000`** (A1), **`20260903171000`** (A2), **`20260903172000`** (A8.2) ; `20260903180000` et
au-dessus laissés à la voisine. **Règle posée** : un numéro n'est valide que s'il est supérieur à la tête du registre
**au moment où il s'applique**, jamais au moment où on le réserve ; la base locale est partagée, personne ne peut
réserver l'avenir. Chacun relit le registre avant d'appliquer et prévient l'autre.

### Fusions bloquées, et pourquoi je n'insiste pas

CUISINE A1 (`2b57bfa9`) et MEMBRE A8.1 + correctif (`7c403607`, `5650ed9d`) sont prêts. `git merge` refuse : la voisine
tient sales `i18n/en.ts`, `i18n/fr.ts` et `StudentWeekPlanPage.tsx`, que les deux fusions touchent. Demandé, sans urgence
artificielle — mieux vaut attendre que d'hériter d'un lot à moitié posé. **Piège de méthode à ne pas répéter** : mon
premier test de chevauchement pour MEMBRE utilisait `git diff <merge>..<branche>`, qui compare deux états et fait
apparaître **tout ce que l'arbre principal a en plus** ; le bon test est le diff depuis la **base de fusion**.

### ROUGE produit assumé, remonté par CUISINE (A1)

**Un plan de SEPT jours mangés n'a pas de veille automatique.** Pas à cause de la base (elle accepte `duration_days = 8`)
mais de l'**alphabet des jetons de jour** : une fenêtre de 8 donnerait au jour de cuisine le jeton du dernier jour mangé,
et le parseur jetterait les plats de ce jour. Le refus est **nommé**, rendu comme `same_morning`, expliqué dans
`plan_rationale`. Levée = adresser les sessions par **date** et non par jeton — hors périmètre A1, à nommer au rapport final.
Deux pièges trouvés par CUISINE, à faire circuler : `plan_kind` est dans la clé de l'exclusion **et** de l'index unique
depuis `20260811080000` et **non** `20260807090000` comme l'ANALYSE l'affirme (recréer d'après le vieux fichier
supprimerait la séparation perso/foyer) ; et `eatenSpan` avait été livrée par l'agent tué **sans aucun appelant**,
documentée « les deux lanes l'appellent » — garde morte, corrigée par un champ requis.

### SUIVI : front prêt, non fusionné exprès

`fd47c04c` — `ProgressPage.tsx` retiré, 36 clés mortes retirées, nav renommée, agrégat pur `tracking_window.ts` (24 tests
Deno), page complète, A8.0 fusionné dans sa base **sans conflit**. **Non fusionné** : la page appelle `keel-tracking-v1`,
qui n'existe pas encore, et l'échec est **délibérément fail-closed** (la ceinture TCA vit dans la réponse serveur ;
l'ancienne lisait `weekly_reviews.risk_band`, colonne morte depuis le 08/08). Fusionner maintenant casserait
`/app/progress` dans l'arbre principal jusqu'au lot serveur. Attendra son tour, comme prévu.
