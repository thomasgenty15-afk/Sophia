# MASTER PROMPT — les huit chantiers du 3 septembre, orchestrés

**Date** 2026-09-03 13:08 · **Branche de départ** `ff-001-quotidien-du-coach` (HEAD `5d630e4d`) ·
**Autorité produit** [CLAUDE.md](../CLAUDE.md) · [docs/keel/MODEL.md](../docs/keel/MODEL.md) ·
[le-foyer/README.md](../docs/fonctionnalites/le-foyer/README.md) ·
**Analyse d'entrée** [2026-09-03-1237-ANALYSE-8-POINTS-ET-PLAN-8-AGENTS.md](2026-09-03-1237-ANALYSE-8-POINTS-ET-PLAN-8-AGENTS.md)
(ci-après **l'ANALYSE**) — elle porte l'état du code ligne par ligne, la conception de chaque point
et le registre des décisions D1–D8. Ce document ne la répète pas ; il dit **qui fait quoi, dans
quel ordre, avec quelle preuve**.

> Ce document est un **prompt maître**. Il s'adresse d'abord à **l'ORCHESTRATEUR** (§1-§4), qui
> lance et suit les agents. Chaque agent reçoit **ce document entier** + **l'ANALYSE entière** +
> son prompt propre (§5). Il se lit dans l'ordre, et il s'exécute dans l'ordre.

---

## 0. Les huit points, en une ligne chacun

| # | Point | Lane | Nature |
|---|---|---|---|
| P1 | Courses et cuisson **la veille**, automatiques, coupure 18 h, avertissement « dès le matin » | CUISINE | serveur + migration + front |
| P2 | « Comment voulez-vous cuisiner ? » (3) et « Combien de courses ? » (1-3) remplacent la durée de session | CUISINE | serveur + migration + front |
| P3 | Retirer la **4e option** d'objectif (l'option vide) ; un mineur ne voit que « maintien » | RAPIDE | front |
| P4 | Retirer **« Idées de repas »** (`/app/meals`, bibliothèque du coach côté élève) | RAPIDE | front |
| P5 | La **page Foyer** : membres dépliables (infos / préférences), paramètres du foyer, ajout jusqu'à 8, invitation par ligne | FOYER | front |
| P6 | **« Le déjeuner en semaine »** quitte l'étape 3 pour les préférences de chaque membre | FOYER | front (le serveur part en CUISINE, D6.1/D6.2) |
| P7 | La **page de suivi** d'une personne : bloc permanent, tracker kcal, créneaux loupés, courbe de poids | SUIVI | edge fn + front |
| P8 | Le **membre à 1,99 €** déclare qu'il n'a pas mangé ; scénarios maître/membre ; le reste dans sa boîte | MEMBRE | serveur + migration + front |

---

## 1. L'ORCHESTRATEUR — ce que tu es, et les trois règles qui gouvernent ton travail

Tu es un agent qui ne code **pas**. Tu lances des agents, tu lis leurs rapports, tu fusionnes leurs
branches dans l'ordre, tu déclenches les runs réels et les vérifications, tu tiens un journal, et
tu t'arrêtes quand tout est prouvé ou quand une lane est bloquée deux fois de suite.

**Règle 1 — tu ne bloques qu'une fois.** L'humain n'est pas devant l'écran. Tu ne poses **aucune
question** en cours de route : toutes les décisions D1–D8 partent sur la **recommandation** de
l'ANALYSE (les défauts sont récapitulés en §3), et ton journal dit lesquelles ont été prises par
défaut. Le seul arrêt possible est **une lane bloquée deux fois** (§4.6) — tu la geles, tu
continues les autres, et tu le dis dans le rapport final.

**Règle 2 — développer en parallèle, prouver en série.** La pile Supabase locale est **unique**
(un seul `supabase_edge_runtime_Sophia_2`, une seule base, un seul Kong) et elle sert les fonctions
**de l'arbre principal**. Donc : chaque lane **développe dans son worktree** (suite Deno complète,
vitest, typecheck, mutations — tout ça marche hors de l'arbre principal), et **ne fait son run réel
et sa vérification navigateur qu'après fusion dans l'arbre principal**, dans l'ordre des fusions
(§4.3). Une lane ne restart jamais le runtime edge elle-même : **toi seul** le fais, entre deux
fenêtres de run.

**Règle 3 — rien ne sort du poste.** Jamais `git push`, jamais de fusion vers `main`, jamais une
commande de la liste bloquée ([AGENTS.md](../AGENTS.md)) : `supabase db reset/push`,
`functions deploy`, `secrets`, `config push`, `link`. Tout reste sur des branches locales
`chantier-0903/*` et sur la branche de départ.

---

## 2. Les règles transverses — elles s'appliquent à CHAQUE agent

Reprises du prompt maître du 17/08 (§2), vérifiées le 03/09, et augmentées de ce que les huit
explorations ont trouvé. Un agent qui en viole une a **tort**, quel que soit le résultat.

### 2.1 Le produit, et ce qu'on ne renégocie pas

1. **Lire avant d'écrire** : `CLAUDE.md`, `docs/keel/MODEL.md`, `le-foyer/README.md`, l'ANALYSE
   (ton chapitre **et** §0 et §9), puis les fichiers que ton mandat cite. Une affirmation d'absence
   se **re-vérifie** avant d'être citée (plusieurs sessions livrent en parallèle).
2. **Le coach ne produit rien de personnel ; aucun canal 1:1** (MODEL.md). Le chat que P8 ouvre
   au membre est **Sophia → la personne**, jamais membre ↔ maître.
3. **Une personne gouverne le menu ; une bouche n'a pas besoin d'un compte** (README foyer). Un
   profil réclamé lit, déclare pour lui, ne compose pas, ne décale rien (D8.4).
4. **Une consigne est une instruction, jamais un diagnostic** (F8, `FORBIDDEN_PORTION_TERMS`,
   bilingue). Aucun corps, aucun objectif, aucun « pourquoi » à côté d'un gramme.
5. **Un chiffre d'énergie porte sa base ou il n'existe pas** (`CALORIE_REVERSAL.md`, FF-059 R3).
   Les cinq portes (`energy_gate.ts`) se lisent **avant** tout calcul, côté serveur ; la garde
   côté client de `/app/progress` est **morte** (ANALYSE §7.1) — ne pas s'y fier.
6. **Jamais de matcher maison** sur du texte d'aliment (« laitue » ≠ « lait », 12/12 mesurés).
   Toute attribution = déclarée par le modèle, validée contre une liste fermée.
7. **Tout champ déclaré par le modèle a un compteur** dans `generated_from`
   (`{asked, declared, invalid}`). Sans lui, un lot désarmé ressemble à un lot qui marche.
8. **Versions de prompt** — « quelle population voit une consigne différente » : tronc =
   `MEAL_PROMPT_VERSION` (v24 aujourd'hui), enveloppe foyer = `HOUSEHOLD_PROMPT_VERSION`. Un bump
   par lot, **jamais deux lots fusionnés sous un bump**, un test byte-identique pour chaque lane
   qui ne doit pas bouger.
9. **Rang 2** (`SYNTHESE-GENERATION-PLAN.md §6`) : **rien de dérivé ne part sans une ligne de
   `plan_rationale`**. Une garde sans phrase se lit comme un bug ; une phrase qui affirme le
   contraire de ce que la garde a fait est pire.
10. **Les renversements s'écrivent là où la phrase inverse vit** (ANALYSE §0.2) : R1
    `MouthFormDialog.tsx:326-345`, R2 FF-031 §3, R3 `api/mealPhoto.ts:92-96`, R4 FF-048 §3,
    R5 `routeGuards.int.test.ts:50-59`. Un renversement silencieux est une faute, même juste.
11. **Hors périmètre, à ne pas réparer en passant** : la lane 1:1 (`plan_versions`), la fusion /
    prise de main (lue, jamais touchée), le gel 402 et Stripe, `keelGenerationModel()` sur la lane
    foyer, `HouseholdMergeCard.tsx:45` (`toLocaleDateString` laissé exprès), la bascule de langue
    explicite (`wont_fix`), le vérificateur de traditions, le foyer orphelin. On les **nomme** dans
    le rapport si on les croise.

### 2.2 Le poste de travail, et ses pièges mesurés

12. **Commandes à risque : jamais seul** (liste en §1, règle 3). Migrations locales :
    `supabase migration up` **seulement** ; avant de choisir un numéro, lire le registre
    (`select version from supabase_migrations.schema_migrations order by 1 desc limit 5`) — une
    migration hors ordre est **sautée en silence**. Doublons : `ls supabase/migrations | cut -d_ -f1
    | uniq -d` doit être vide. Précédent accepté sur ce poste si la CLI plante (`index out of
    range`) : appliquer par `psql` puis inscrire la version à la main.
13. **401 `Invalid JWT` local** : ne rien toucher — `./scripts/check-local-jwt-alg.sh` puis
    `docs/keel/JWT-HS256.md`. `supabase/signing_keys.local.json` reste `[]`.
14. **Le runtime edge sert des `_shared` périmés** : un fichier modifié n'est pas rechargé, une
    fonction créée après le démarrage rend 404. Seul l'orchestrateur restart
    (`docker restart supabase_edge_runtime_Sophia_2`), puis
    `TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh` (Kong retombe à 150 s,
    trop court pour une génération). 500/503 partout avec PostgREST OK = runtime éteint.
15. **`EMAIL_DELIVERY_ENABLED=1` avec une vraie clé Resend** : toute inscription jouée au
    navigateur **envoie un vrai mail**. Les comptes de test se créent **par SQL** (fixtures
    `docs/keel/qa-fixtures/*.sql`, colonnes de jeton `''` jamais NULL), mot de passe `1234567`.
    Chaque lane a **son tag** (`qa0903<lane>`), parce que `trial_seat_limit = 3`.
16. **Navigateur** : un port par lane (§4.1), `frontend/.env.local` copié dans le worktree,
    vérification à **320 px et 1280 px**, captures à scroll 0, mesures `document.scrollWidth`.
    Jamais viser un compte sans mot de passe connu ; jamais faire avancer un compte QA partagé.
17. **Typecheck et suites** : front = `cd frontend && npx tsc -b --force` (le `tsconfig.json`
    racine ne vérifie rien) puis `npx vitest run` ; serveur = `cd supabase/functions && deno test
    --allow-env --allow-read --allow-net` (jamais `--no-check`). Le gate de commit lance **toute**
    la suite vitest : un rouge que tu laisses bloque les commits des autres lanes. Rouges étrangers :
    prouver l'antériorité (worktree détaché sur le commit d'avant), les nommer, ne pas y toucher.
    **Aucune lane ne régénère une baseline** (`scripts/.vitest-red-baseline`,
    `.test-count-baseline`, `.tsc-test-red-baseline`) — E seul, en fin de chantier.
18. **Git** : jamais `git add -A` ni `commit -a` ; chaque commit liste ses chemins, relus par
    `git diff` avant stage ; **jamais `git stash`, `checkout <fichier>`, `reset`, `restore`** —
    défaire une mutation se fait par `cp` depuis une copie, jamais par git. Messages de commit dans
    le style du dépôt (minuscules, une phrase qui raconte).
19. **i18n** : `en.ts` est le seed du type, `fr.ts` la suit, parité tenue par
    `i18n/parity.int.test.ts` (mêmes clés, mêmes `{trous}`, pas de copie de l'anglais). Chaque lane
    écrit ses clés **dans un bloc délimité** en fin de pack :
    `// ── chantier-0903/<LANE> — début ──` … `// ── chantier-0903/<LANE> — fin ──`, dans les
    **deux** packs, et **ne commite pas** `en.ts`/`fr.ts`/`catalog.ts` dans ses lots — elle liste
    les clés au rapport. E fusionne. ⛔ Jamais `unicode_escape` (mojibake invisible à `tsc` et à la
    parité) ; éditer en UTF-8 par numéro de ligne ; les jetons ASCII vivent dans `api/`, les mots
    dans le composant (`pageSeams` rougit sinon).
20. **Écrans** : Tailwind v4 sans config (`frontend/src/tokens.css`) ; figue = navigation/action ;
    couleurs d'état = états ; « aujourd'hui » se dit par la forme ; tout débordement défile dans
    son conteneur ; `break-words` sur tout texte venu du modèle ; cibles ≥ 24 px ; pas de primitive
    `Tabs`/`Accordion` neuve avant un troisième usage ; `Modal` rend `null` fermé **sans démonter**
    et passe par `createPortal(document.body)` — les tests montent les **corps**, jamais le chrome.

### 2.3 La preuve, et sa discipline

21. **Chaque garde neuve est MUTÉE** : on la casse, on voit le rouge, on restaure (par `cp`).
22. **Aucun test paramétré par sa propre constante** : muter la constante fait tomber le test.
23. **Une garde a besoin d'un cas qui passe** — sinon elle bloque tout et ressemble à une garde qui
    marche.
24. **Ce qui n'a pas été vu en run réel ou au navigateur est consigné ROUGE** dans le rapport,
    jamais présenté comme prouvé. Le format des rapports du 17-18/08 fait foi
    (`scratchpad/2026-08-18-*-verification-*.md`).
25. **Le journal s'écrit au fil de l'eau** : l'infrastructure coupe parfois les sessions ; un
    rapport écrit à la fin n'existe pas. Chaque agent écrit `scratchpad/2026-09-JJ-HHMM-<LANE>-<lot>-<sujet>.md`
    dès son premier commit, et le complète à chaque morceau.

### 2.4 Les invariants de cohérence — la grille de E, rejouée par chaque vérificateur sur ce que son lot touche

- **C1 — la fenêtre** : chaque jour de `windowDayOrder` apparaît une fois, dans l'ordre du plan ;
  avec une veille (P1), le rang 0 est `cookOnlyDay`, porte une session et **aucun repas**,
  `daysToEat` = `duration_days − lead_days` ≤ 7.
- **C2 — la jointure cuisine** : `dish.uses[].preparation_id` résout ; une préparation consommée un
  jour J a été cuisinée un jour ≤ J ; le nombre de sessions = celui que `deriveCookingPlan` a
  demandé (P2), et la rationale le dit.
- **C3 — les courses** : `shopping_list[].buy_on` toutes datées ; nombre de vagues = sessions ;
  la première vague tombe sur le rang 0 ; `servesCookOn` n'est **pas** `null` sur les vagues
  suivantes (piège P1).
- **C4 — les personnes** : au moment M, chaque bouche présente a un plat commun ou dédié ; un
  membre réclamé voit **sa** part, avec **ses** cases (P8) ; le maître ne voit jamais la coche
  d'un profil réclamé.
- **C5 — les ceintures** : aucune calorie sans base, aucun terme de `FORBIDDEN_PORTION_TERMS`,
  aucun objectif/poids dans une vue, dans **les deux langues** ; sous plancher TCA, la page de suivi
  ne rend **aucun** chiffre ni courbe (P7).
- **C6 — les deux surfaces** : l'aperçu (`PlanDraftDialog`) et le validé (`/app/plan`) rendent le
  même corps de plan (`PlanResult` monté deux fois — verrouillé par `setupDraftWiring.int.test.ts`).
- **C7 — l'entonnoir** : trois étapes, `canGenerate` seule source du bouton, l'étape 2 et la
  pop-up d'ajout du Foyer montent le **même** `MouthCoreFields` (P5), plus aucune case « la
  veille » ni « durée de session » (P1, P2), plus de `WorkLunchCard` à l'étape 3 (P6).
- **C8 — le foyer à deux comptes** : le même soir, deux bandes, la question de courses et de
  cuisson **au maître seul**, ③ à chacun ; un ✗ du membre écrit sa ligne et jamais celle du maître.

---

## 3. Les décisions — ce qui part par défaut

L'ANALYSE porte pour chaque D une recommandation. Voici ce que **les agents appliquent sans
demander**, et ce que l'orchestrateur écrit en tête de son journal :

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

## 4. Le plan d'exécution — ce que fait l'orchestrateur, étape par étape

### 4.1 Lot 0 — le poste (toi, ~1 h)

1. **Journal** : crée `scratchpad/2026-09-JJ-HHMM-ORCHESTRATION-8-CHANTIERS.md`, écris-y §3 tel
   quel, puis chaque événement horodaté (lancement, fusion, restart, rouge, gel).
2. **L'arbre** : `git status --short | wc -l` (attendu ~369). Fais **trois commits par
   pathspec**, `--no-verify`, motif dans le message (« instantané de l'arbre du 2026-09-03 avant
   les huit chantiers ; gate sauté parce que ce commit ne fait qu'enregistrer un état ») :
   (a) ce qui est **stagé** tel quel (le lot énergie) ; (b) `frontend/src/keel/i18n/` ;
   (c) tout le reste des modifiés **et** des non suivis, sauf `scratchpad/**/sorties-*`,
   `*.json` de sortie brute, `tmp/`, `feat/Commande sensibles` (gitignoré de toute façon).
   Relis `git diff --cached --stat` avant chaque commit. Ce que tu commites, tu ne le juges pas ;
   tu l'enregistres. **Jamais `git add -A`.** Après : `git status --short` doit être vide.
   Note le nouveau HEAD dans le journal : c'est la base des worktrees.
3. **La pile** : `./scripts/check-local-jwt-alg.sh` ; `./scripts/supabase_local.sh start`
   (jamais `supabase start` nu) ; `npx supabase status` ; `functions serve --env-file supabase/.env`
   en arrière-plan ; le script Kong (§2.2 n°14). Vérifie disque == registre des migrations et zéro
   doublon. Note les cinq derniers numéros du registre.
4. **Les worktrees** : `mkdir -p "/Users/ahmedamara/Dev/Sophia-2-chantiers"` puis, pour chaque
   lane L de {RAPIDE, FOYER, CUISINE, MEMBRE, SUIVI} :
   `git worktree add "/Users/ahmedamara/Dev/Sophia-2-chantiers/L" -b chantier-0903/L`,
   `ln -s "/Users/ahmedamara/Dev/Sophia 2/node_modules" …/L/node_modules`,
   `ln -s "/Users/ahmedamara/Dev/Sophia 2/frontend/node_modules" …/L/frontend/node_modules`
   (le gate en worktree exige le `node_modules` racine), `cp "frontend/.env.local"` dans chaque.
5. **Les ports et les tags** : dans **chaque** worktree, ajoute à `.claude/launch.json` une entrée
   `frontend-<lane>` (`npm run dev -- --port <p> --strictPort`) : RAPIDE 5203, FOYER 5204, CUISINE
   5206, MEMBRE 5207, SUIVI 5208. Tags QA : `qa0903r`, `qa0903f`, `qa0903c`, `qa0903m`, `qa0903s`.
6. **Les numéros de migration** : réserve, dans le journal, un horodatage par lane **après**
   lecture du registre, espacés de dix minutes, dans l'ordre des fusions (§4.3) : CUISINE
   (deux : cap/exclusion, puis commentaire de colonne + liste fermée), MEMBRE (une :
   `meal_share_outcomes`), SUIVI (aucune). Passe-les aux agents dans leur prompt.

### 4.2 T1 — la lane RAPIDE (A3 puis A4, en série, ~4 h)

Lance **A3** dans le worktree RAPIDE, `run_in_background: false` (la suite en dépend). Puis
**A4** dans le même worktree. Puis fusionne `chantier-0903/RAPIDE` dans la branche de départ
(§4.3), **avant** de lancer T2 : ils touchent `SetupPage`, `HouseholdPage`, `App.tsx`,
`KeelAppShell`, que toutes les autres lanes reprennent. Rebase les quatre autres worktrees sur le
nouveau HEAD (`git rebase` dans chacun — ils sont vides, c'est trivial).

### 4.3 T2 — quatre lanes en parallèle, fusion et preuve en série

**Lancement** — en **une seule** réponse, quatre `Agent` en arrière-plan, chacun avec son worktree,
son port, son tag, ses numéros de migration :

| Lane | Agent(s), en série interne | Dépend de |
|---|---|---|
| FOYER | **A6** → **A5** | T1 |
| CUISINE | **A1** → **A2** | T1 |
| MEMBRE | **A8.0** → **A8.1** → **A8.2** | T1 |
| SUIVI | **A7** (front d'abord, sur le contrat de A8.0 ; serveur ensuite) | T1, **contrat A8.0** (§5.10) |

Chaque lane est **un agent** qui enchaîne ses lots (il garde son contexte ; il commite entre
deux lots ; il écrit son journal à chaque lot). Tu attends les notifications ; tu ne fais rien
d'autre pendant ce temps que tenir le journal.

**Le contrat A8.0 → A7** : dès que MEMBRE annonce A8.0 commité (message dans son rapport « A8.0
commité : <sha> »), tu **fusionnes A8.0 seul** dans la branche de départ (cherry-pick des commits
de A8.0), tu rebases SUIVI dessus, et tu envoies à A7 par `SendMessage` : « A8.0 est dans ta base,
rebase faite, la garde `KeelHouseholdRoute` sur `/app/progress` est disponible ». A7 n'attend pas
pour commencer son front : il code contre le contrat écrit en §5.10.

**Fusion et preuve, dans cet ordre**, chaque fois qu'une lane annonce un lot **prêt à prouver**
(sa suite Deno et vitest vertes, typecheck vert, mutations faites, rapport écrit) :

```
ordre des fusions :  A8.0 → A6 → A1 → A2 → A5 → A8.1 → A8.2 → A7 → E
```

Pour chaque lot, dans cet ordre, **jamais deux à la fois** :
1. `git merge --no-ff chantier-0903/<LANE>` (ou cherry-pick du lot) dans l'arbre principal,
   branche de départ. Conflits attendus : `SetupPage.tsx` (régions distinctes : étape 2 pour
   FOYER, étape 3 pour CUISINE, sélecteurs pour RAPIDE), `HouseholdPage.tsx` (FOYER seul),
   `App.tsx` / `KeelAppShell.tsx` (RAPIDE, MEMBRE, SUIVI). Les packs i18n ne sont **pas** dans les
   lots (§2.2 n°19) — pas de conflit là. Résous **sans réécrire une ligne de logique** ; si un
   conflit demande une décision, renvoie-le à la lane par `SendMessage` avec le hunk.
2. `docker restart supabase_edge_runtime_Sophia_2` puis le script Kong. Journalise l'heure : les
   autres lanes savent qu'un run réel est **en cours** et n'en lancent aucun.
3. Envoie à la lane : « fenêtre de run réel ouverte sur l'arbre principal, jusqu'à <heure> ». La
   lane fait ses runs réels et sa vérification navigateur **sur l'arbre principal** (port 5174), et
   corrige **sur l'arbre principal** par un commit de suite s'il le faut (puis reporte le commit dans
   son worktree par `git cherry-pick`, jamais par copie de fichier).
4. Lance le **vérificateur** de ce lot (§5.11, prompt générique) sur l'arbre principal.
   Vert → journal, lane suivante. Rouge → §4.6.

### 4.4 T3 — E, la cohérence de bout en bout (1 agent, 1 jour)

Après la dernière fusion : fusion des packs i18n (§5.12), puis le run entier de §5.12. E est le
seul autorisé à toucher les baselines du gate.

### 4.5 La fin

Ton rapport final (`scratchpad/…-ORCHESTRATION-8-CHANTIERS.md`, dernière section) dit : les
commits de chaque lane, ce qui est prouvé, ce qui est rouge, les décisions prises par défaut, les
gestes **humains** qui restent (le chiffre 1,99/2,00 ; `enable_confirmations` ; les cinq gestes
Stripe de FF-049 ; le push). Les cinq worktrees restent en place ; tu ne les supprimes pas.

### 4.6 Quand ça casse

- **Un vérificateur est rouge** : tu renvoies son rapport au bâtisseur de la lane
  (`SendMessage`), qui corrige et re-annonce. Le vérificateur rejoue. **Deux rouges de suite sur
  le même lot** : tu **gèles la lane** (journal : « gelée à <lot>, motif »), tu ne fusionnes pas
  ce lot, et les lanes qui en dépendent (§4.3 tableau) sont gelées aussi. Les autres continuent.
- **Le gate refuse un commit à cause d'un rouge étranger** : la lane prouve l'antériorité
  (worktree détaché sur le commit d'avant), commite avec `--no-verify` et **le motif écrit dans le
  message** (précédent : rapport D6 du 18/08). Elle ne touche pas au test étranger.
- **Le runtime ne revient pas** après un restart (500/503 partout, PostgREST OK) : relance
  `functions serve`, pas un second restart. Si `Invalid JWT` : §2.2 n°13, et rien d'autre.
- **Une migration a été appliquée hors ordre** (disque ≠ registre) : arrête la lane concernée,
  journalise, et **n'applique rien d'autre** tant que ce n'est pas réconcilié par la lane
  (inscription manuelle au registre, précédent du 18/08).
- **Un agent ne répond plus** (pas de notification en 90 min sur un lot annoncé à 3 h) : envoie
  un `SendMessage` « où en es-tu ? » ; sans réponse en 15 min, relance **un nouvel agent** sur le
  même worktree avec le même prompt + « reprends depuis le journal `<fichier>` et `git log` ».

---

## 5. Les prompts des agents

Chaque prompt commence par : *« Tu reçois le MASTER PROMPT (2026-09-03-1308) et l'ANALYSE
(2026-09-03-1237) en entier. Ton worktree est `<chemin>`, ta branche `chantier-0903/<LANE>`, ton
port `<p>`, ton tag QA `<tag>`, tes numéros de migration `<…>`. Tu travailles **uniquement** dans
ce worktree tant que l'orchestrateur ne t'a pas ouvert une fenêtre de run réel. Tu écris ton journal
`scratchpad/2026-09-JJ-HHMM-<LANE>-<lot>-<sujet>.md` dès ton premier commit. »*

### 5.1 A3 — la 4e option d'objectif (lane RAPIDE, ½ jour)

**Mandat** : ANALYSE §3. Retirer l'option vide « Aucune direction particulière » des cinq sites
(`SetupPage.tsx:4358, 4925, 5602, 5137`, `HouseholdPage.tsx:983, 993`) ; sélecteur → trois tuiles
radio sans pré-sélection (patron `MouthFormDialog.tsx:956-978`) ; `goalsForAge(ageState)` filtre
enfin (`api/household.ts:266-270`) : un `minor` ne voit que `maintenance` libellé « Manger
normalement » (clé neuve), un `unknown` voit les trois ; quand une date saisie rend quelqu'un
mineur avec `fat_loss`/`muscle_gain`, le formulaire bascule à `maintenance` **et le dit** ;
`persistMouth` écrit `setGoal` **avant** `setBirthDate` dans ce cas (sinon `goal_not_for_minor`) ;
traduire `goal_not_for_minor` et `target_not_for_minor` dans `copy/planRefusals.ts` + i18n ;
aligner `le-foyer/README.md:164`, FF-045, PIVOT-FOYER §8.4 sur la migration `20260822041500`.
Retirer les 4 clés `goal_none` (dans ton bloc délimité : les retraits se listent aussi).

**Interdits** : toucher aux `CHECK` SQL ; ajouter un 4e jeton ; masquer une tuile par `display:none`
(c'est un filtre de liste, testé sur la valeur rendue).

**Preuve** : `household.int.test.ts:355-380` et `setupMouthsStep.int.test.ts:170` **se retournent**
(ils affirmaient « adulte = enfant » et « mineur porteur des trois ») ; `:438-486` reste vert ;
mutation : réintroduire l'option vide → rouge ; faire lire `unknown` comme mineur → rouge.
Navigateur (après fusion, port 5174) : une bouche mineure avec `fat_loss` en base → l'écran montre
« Manger normalement » coché et la phrase de bascule ; le Save passe.

### 5.2 A4 — les idées de repas (lane RAPIDE, ½ jour)

**Mandat** : ANALYSE §4. Supprimer `pages/mealPlan/StudentMealPlanPage.tsx` et `copy.ts`, la route
(`App.tsx:483-491`), l'entrée de nav (`KeelAppShell.tsx:116-121`), `loadStudentRecipes`
(`api/mealPlanModel.ts:82-99`), l'entrée `/app/meals` de `PAGE_NAMESPACES` (`catalog.ts:529-534`),
les 8 clés (`meals.title|subtitle|list.*|loading|error`, `app.nav.meals(.short)`) — listées au
rapport, retirées dans ton bloc. Corriger FF-010 R6 (vers `/app/plan`), le commentaire de
`meal-document-v1/index.ts:236`, `MODEL.md:28`.

**Interdits** : toucher au namespace `meals` (vocabulaire du moteur, ~120 clés) ; toucher au côté
coach (`CoachMealsPage`, `/coach/meals`, `coach-recipe-image-v1`, la table `meal_ideas`).

**Preuve** : `tsc -b --force` exit 0 ; `pageSeams`/`parity` verts ; navigateur : la barre du bas à
4 onglets tient à 320 px sans débordement ; `/app/meals` rend le 404 du produit.

### 5.3 A6 — le déjeuner en semaine quitte l'étape 3 (lane FOYER, 1 jour)

**Mandat** : ANALYSE §6, **partie front seulement** (D6.1/D6.2 sont en CUISINE, A2). Extraire
`PersonWorkLunch` (`WorkLunchCard.tsx:202`) en composant mono-personne ; le monter dans le panneau
`MemberRow` de `HouseholdPage.tsx` **au-dessus de `MealPickerGrid`** (`:1983`), pour les bouches
`adult` du roster (`age_state`, jamais un `kind`), comptes ou pas ; retirer la carte de
`TableStepPlanning.tsx:153-166` (états `:94-118`, imports, prop `people`, moitié « déjeuner » de
l'en-tête `:32-54`) et `SetupPage.tsx:3194-3202` ; `lib/workLunchRoster.ts` devient supprimable ;
réécrire les libellés « à l'étape suivante » (`fr.ts:3487, 3490`, `setup.request.presence_intro`)
dans ton bloc, **deux langues**.

**Les trois gardes à reproduire au nouveau site** (ANALYSE §6.2 n°4) : `workLunchWriteIsNeeded`
contre le `saved` serveur ; relecture **avant** `onSaved` (`workLunchCommit.ts:48-52`) ; repli
`answers === null` ≠ `Map` vide dans un module pur. Aucun `useEffect` qui écrit.

**Interdits** : mettre le bloc dans le brouillon de `MouthPreferencesFields` (il écrit tout de
suite, et `mouthFormDialog.int.test.ts` refuse une fiche conditionnée à l'âge) ; toucher
`presenceMarks.int.test.ts:200-340` ; renommer le namespace.

**Preuve** : les 10 cas de `tableStepPlanning.int.test.ts:144-277` **déplacés** vers un test du
nouveau site, verts ; `tableStepPlanning.int.test.ts` réduit à l'ordre des deux cartes restantes ;
mutations : retirer `workLunchWriteIsNeeded` → rouge ; replier `null` sur `new Map()` → rouge.
Navigateur : répondre « dehors » sur une bouche → les cinq midis apparaissent cochés dans la grille
juste en dessous ; décocher mardi à la main, rouvrir la carte, ne rien changer → mardi **reste**
décoché.

### 5.4 A5 — la page Foyer (lane FOYER, 4,5 jours, après A6)

**Mandat** : ANALYSE §5 entier, §5.2 pour la cible, §5.5 pour l'invitation. Dans l'ordre :
1. **Unifier l'étape 2** : `MouthsStep` (`SetupPage.tsx:4488`, champs recopiés `:4801-5010`) monte
   `MouthCoreFields` + `MouthPreferencesButton` — un seul formulaire dans le dépôt. C'est la
   moitié du lot ; le faire **en premier**, commit à part.
2. `MemberRow` → deux cadres repliables nommés (« Informations personnelles » = `MouthCoreFields` ;
   « Préférences alimentaires » = `MouthPreferencesFields` + la carte déjeuner de A6 +
   `FoodPreferencesCard` en `embedded` pour les bouches avec compte), ouverts par défaut sur la
   ligne qu'on vient d'ouvrir, récapitulatif `filledPreferenceBlocks` visible replié. **Une garde
   de chargement par cadre** (`habits === null` ⇒ rien de rendu). Écrire le renversement dans
   `MouthFormDialog.tsx:326-345`.
3. La pop-up d'ajout : **un** `Modal` autour de `MouthCoreFields` + les préférences en accordéon
   dedans ; `persistMouth` avec `addMember` ; plafond lu **une fois** (unifier `HOUSEHOLD_MAX_MOUTHS`
   / `HOUSEHOLD_MAX_MEMBERS`), le 9e refusé `household_full` traduit.
4. « Paramètres du foyer » : `KitchenEquipmentCard` (la **même** carte reste aussi dans
   l'entonnoir) et `HouseholdTraditionsCard` renommée par la **valeur** de `setup.traditions.title`
   (« Les repas traditions » / « Tradition meals »), déplacées depuis `TableStepPlanning` (qui
   disparaît) ; `SetupPage.tsx:3180-3211` ne monte plus que l'équipement.
5. L'invitation par ligne (§5.5) : trois états dérivés des faits, `[Inviter]` → e-mail + phrase
   `offer.extra` + « ce que ça donne / ne donne pas » + lien + copier + `mailto:` ; `[Renvoyer]` ;
   `[Retirer l'accès]` (détacher, distinct de retirer). Lecture des invitations vivantes par
   `select member_id, email, created_at, expires_at, consumed_at` scopé `.eq("household_id")`,
   **jamais `token_hash`**. `InviteCard` disparaît.
6. Pour un **membre réclamé** : sa ligne éditable sur ce que la base accepte (`MouthSubject.hasAccount`
   + `isSelf`), les autres = prénom et état, **jamais** un cadre « personne n'a de corps ».
7. Rapatrier `EatingRhythmCard` pour le maître ; laisser `CookingCapacityCard` à `/app/plan`
   (A2 la remplace) ; `/app/about-you` : `KnownAboutYouCard` rejoint le cadre préférences des
   comptes, la route reste. `catalog.ts` : déclarer `known` (et `health` si tu montes des
   contraintes) sur `/app/household` — dans ton bloc, non commité.

**Interdits** : deux `Modal` imbriqués ; un cadre monté sur une lecture non faite ; recopier un
montant (D5.8) ; restreindre l'invitation d'une bouche mineure ; toucher à `HouseholdMergeCard.tsx:45`.

**Preuve** : `mouthFormDialog.int.test.ts` (« la MÊME pour tout le monde ») vert ;
`setupMouthsStep.int.test.ts` réécrit sur `MouthCoreFields` ; `meCardSheet.int.test.ts` ;
`tableStepPlanning.int.test.ts` réduit ; mutations : un cadre sans garde de chargement → rouge ;
la pop-up qui n'appelle pas `persistMouth` → rouge ; le lien qui affiche `token_hash` → rouge.
Navigateur (maître `qa1v.foyer@keeltest.dev` + un secondaire réclamé sur ton tag) à 320/1280 :
ajouter jusqu'à 8, le 9e refusé ; inviter une bouche → lien → (compte créé par SQL) → réclamation
→ la ligne passe à « a son accès » → « retirer l'accès » → la bouche garde allergies et part ; le
secondaire voit sa ligne éditable et les autres en prénom seul.

### 5.5 A1 — la veille automatique (lane CUISINE, 3 jours)

**Mandat** : ANALYSE §1 entier. `leadDayFor` dans `plan_hours.ts` (§1.2, avec `hourNow = null` ⇒
`null`, jamais deviné) ; les deux lanes appellent `withCookDayBefore` avec `asked` **dérivé** ;
migration (ton premier numéro) : `lead_days smallint not null default 0 check (lead_days in (0,1))`,
`duration_days between 1 and 8`, `check (duration_days - lead_days between 1 and 7)`, exclusion
sur `daterange(starts_on + lead_days, starts_on + duration_days)`, la boucle de chevauchement de
`write_student_meal_plan` et `firstBlockingPlan` alignées **dans la même migration** (bloc `do $$`
qui monte un plan N et un plan N+1 avec veille et vérifie que ça passe, puis deux plans qui se
chevauchent sur un jour mangé et vérifie le refus) ; `grocery_waves.ts:317` → `serves` sur
`buyOn > firstBuyOn` ; `timing` dans la réponse et `generated_from`, rendu en tête de `PlanResult`
(aperçu **et** validé), `KitchenToday`, une ligne dans `meal_pdf.ts` ; retrait de `CookDayBeforeField`
(11 sites) ; rationale : « tout est cuisiné {la veille | ce soir} », « courses et cuisson dès le
matin » ; bump `MEAL_PROMPT_VERSION` v24 → v25 (+ foyer si l'enveloppe bouge) avec test
byte-identique de la lane qui ne bouge pas.

**Interdits** : un `new Date().getHours()` côté front ; un quatrième `addDays` ; retirer le `.eq`
sur `startsOn` dans `grocery_waves.ts` (la borne reste juste : la veille EST `startsOn`) ; amputer
la fin d'un plan.

**Preuve** : `cook_the_day_before_test.ts` (15) retourné ; `grocery_waves_test.ts` (~30) ;
`oneCookingSessionField.int.test.ts:86-110` **retourné** (il exigeait la case) ; `wave_cascade_test`,
`accident_test` (le `find` de `:1081` rend une vague), `evening_strip_test`, `day_review_test`,
`plan_rationale_test`, `planDraft.int.test.ts:188`, `meal_pdf_locale_test`,
`constant_pinning_gate_test.ts:842` (nouvelle constante épinglée) ; mutation : `serves` remis sur
`> startsOn` → rouge ; `hourNow` deviné → rouge. **Run réel** (fenêtre de l'orchestrateur, `intent:
"draft"`, tag `qa0903c`) : (a) avant 18 h pour demain → fenêtre reculée d'un jour, rang 0 sans
plat, `shopping_waves` daté du rang 0, bande du soir du rang 0 pose la question de courses ; (b)
après 18 h pour demain → pas de veille, `timing = same_morning`, la phrase rendue dans l'aperçu ;
(c) le jour même ; (d) 7 jours mangés → fenêtre 8 acceptée, puis un plan N+1 dont la veille est le
dernier jour de N → **écrit**. Compteurs SQL au rapport.

### 5.6 A2 — style de cuisine et nombre de courses (lane CUISINE, 3 jours, après A1)

**Mandat** : ANALYSE §2 entier + **D6.1 et D6.2** (§6.3). `cooking_style` et `grocery_runs` dans
`practical_constraints` (clé absente = jamais demandé) ; module pur `_shared/keel/cooking_plan.ts`
(`deriveCookingPlan`, table de §2.2, `sessions = min(runs, 3, cap(style))`, `cookDays` dérivés :
rang 0 = la veille de A1 puis espacés de `MAX_FRIDGE_DAYS` sur les repas à couvrir) réexporté côté
front sans règle ; `cookingTimeMin`, `recipe_difficulty`, `variety` dérivés du style ; « 1 course »
⇒ `one_cooking_session` par la porte existante (refus nommé sans congélateur) ; `cook_days` dérivés
écrits à la composition (réveil **dit** des trois lecteurs) ; foyer : le style plafonne
`cooking_shape` via `capCookingShape` ; l'effet FF-054 `cooked: no` descend le style ; migration
(ton second numéro) : commentaire de colonne + liste fermée `20260901180000:87-93` +
`WRITABLE_FIELDS` des deux côtés ; entonnoir : `setup.plan.time` remplacé (`SetupPage.tsx:6844-6871`),
`cooking_style`/`grocery_runs` en `wrong`, `cooking_time_min` en `better` ; `MealBuilder.tsx:1341-1372`
monte les **mêmes** composants (`CookingStyleField`, `GroceryRunsField`, patron `CookingShapeField`) ;
équipement **avant** style, mesuré sur le HTML rendu ; rationale : « 2 courses : jeudi et dimanche »
etc. **D6.1** : `generate-meal-v1` lit `household_members.away_days` du roster (union avec
`practical_constraints.away_days`, comme la lane foyer), test de câblage par lecture de source sur
les deux lanes. **D6.2** : bloc de prompt « transportable ; bon froid sans micro-ondes » à côté
de `eatingOutBlock` (`household_meal_generation.ts:1604`), compteur. Bump v25 → v26 (+ foyer).

**Interdits** : un champ « jours de cuisine » à l'écran (`oneCookingSessionField.int.test.ts:73`
l'interdit) ; une seconde définition de `hasFreezerDeclared` ; forcer une session non demandée ;
un `CHECK` SQL sur la valeur ; modifier `readCookingCapacity` d'une lane sans l'autre (écrire le
test qui compare les deux).

**Preuve** : `one_cooking_session_test.ts:338`, `cook_the_day_before_test.ts:236` (bumps) ;
`plan_feasibility_test`, `kitchen_equipment_solo_lane_test.ts:126` (« au caractère près » sans
réponse), `retained_item_test.ts:304`, `plan_feedback_retained_test.ts:103` (regex sur la source),
`onboarding.int.test.ts:345-349, 454-460, 759-795`, `cookingShape.int.test.ts`, `freezerMirror`,
`eatingRhythm.int.test.ts:148-158`, `retainedItems.int.test.ts` ; mutations : style absent lu
comme `minimal` → rouge ; `sessions` non plafonné à 3 → rouge ; D6.1 débranché → rouge. **Run
réel** (`qa0903c`) : « le moins possible » + 1 course + congélateur → 1 session au rang 0,
`uses_kept_freezer` > 0, une vague ; « un juste milieu » + 2 → 2 sessions, 2 vagues ; « j'aime
cuisiner » + 3 sur 7 jours → 3 sessions, 3 vagues ; 1 course **sans** congélateur → refus nommé,
2 sessions, rationale qui le dit ; un solo « je déjeune dehors » → les cinq midis **absents** de
son plan (D6.1 vu en train de mordre).

### 5.7 A8.0 — le membre existe pour le produit (lane MEMBRE, 1,5 jour) — **le contrat de §5.10**

**Mandat** : ANALYSE §8.2 lot 8.0. `KeelHouseholdRoute` sur `/app/chat` et `/app/progress`
(le palier `household_member`), renversement écrit dans FF-048 §3 et `routeGuards.int.test.ts:50-59`
(le test **se retourne** : « un profil réclamé atteint `/app/chat` et `/app/progress`, jamais
`/app/today` ») ; `keel-daily-pulse-v1` : seconde requête d'audience
(`household_members.role='member' and user_id is not null`), **jamais** `keel_role='student'`,
maîtres traités **avant** membres dans le même tick ; `loadPlannedDishContext`
(`planned_dish_io.ts:85-140`) et `loadPlanForTick` (`evening_strip_io.ts:483`) : pour un membre, le
plan du jour est le plan `household` de **son** foyer — `.eq("plan_kind","household").eq("household_id",
keel_household_of(user))`, jamais le retrait nu du `.eq("user_id")` (run adversarial H2,
`evening_strip_io.ts:468-482`) ; rejoindre `READERS` de `household_plan_kind_readers_test.ts` ;
`generated_from.shifts[]` écrit par `applyPlanShift` (D7.3, trois lignes). Écris dans ton journal
**la ligne** « A8.0 commité : <sha> » dès que c'est prouvé en tests : l'orchestrateur la fusionne
seule.

**Interdits** : écrire `keel_role` ; un `onBehalfOf` ; toucher `applyPlanShift` au-delà de la trace.

**Preuve** : `routeGuards` retourné ; `evening_strip_test`, `day_review_test`,
`household_plan_kind_readers_test` (nouveau lecteur listé) ; mutation : lecteur sans
`.eq("household_id")` → rouge (rejouer H2 : charge forgée citant le plan d'un autre foyer → `stale`).
**Run réel** (`qa0903m`, deux comptes) : le cron du soir atteint le membre ; il reçoit ③ **sans**
① ni ② ; le maître reçoit les trois.

### 5.8 A8.1 — la coche du membre sur le plan du foyer (lane MEMBRE, 1 jour)

**Mandat** : ANALYSE §8.2 lot 8.1. `useMealTicks` lié au `householdMealId` pour un membre, plats
filtrés par `dishIsFor` ; cases dans `MyShareCard` (garder `sharePresentedTo`) ; sa bande ③ bâtie
depuis le plan du foyer, ses plats seulement ; un ✗ ouvre le formulaire A de FF-057 puis
l'invitation photo ; `writeOffPlanTapFact` et `meal-photo-upload-v1` tels quels. **Aucune
migration.**

**Preuve** : `myShare.int.test.ts` (des cases, et `isOwner` ferme toujours la carte au maître),
`mealTicks.int.test.ts` ; mutation : la coche du membre écrite sous le `user_id` du maître → rouge.
**Run réel** : maître ✓ « tout comme prévu », membre ✗ « j'ai commandé » le même soir → deux lignes
`protocol_events`, aucune n'écrase l'autre, la photo du membre s'enregistre sous **son** `user_id`.

### 5.9 A8.2 — les scénarios, et le reste dans sa boîte (lane MEMBRE, 2,5 jours)

**Mandat** : ANALYSE §8.2 lot 8.2 et tableau des cas. Migration (ton numéro) :
`meal_share_outcomes(generated_meal_id, dish_index, member_id, declared_by, outcome, shifted_to_day,
answered_local_date)`, clé sur les quatre premiers, **revoke `authenticated`** dès la migration,
RLS (chacun ses lignes ; le maître en plus celles des bouches **sans compte**), jumelle `_for(p_user)`,
export RGPD **dans la même migration**, bloc `do $$` de contrôle ; le maître ✗ → nouvelle étape
« Qui n'a pas mangé ? » `[moi] [tout le foyer] [choisir…]` (cases = bouches sans compte seulement),
« tout le foyer » ⇒ `shift_dish` existant ; le membre ✗ → proposition **à lui seul** « ta boîte de
{jour} : {jour+n} ? / au congélateur / jetée » (dans `MAX_FRIDGE_DAYS`, congélateur si déclaré),
écrite dans la table, **jamais** un glissement du plan ; `leftover` gagne son lecteur : la vue de
la part (`MyShareCard`, bloc jour du maître) rend « boîte de {jour}, encore au frigo » ; le
lecteur résout par bouche : la ligne déclarée par la personne gagne. Écrire dans FF-054 §11 que le
membre n'a pas le retour de fin de plan (`unique(meal_id)`). Écrire D8.2 (« pas de nouvelles » se
lit, ne s'écrit pas) là où P7 lira.

**Interdits** : une coche automatique ; corriger la ligne du maître ; un paramètre de bouche sur
`applyPlanShift` ; lire les faits d'un profil réclamé côté maître.

**Preuve** : `accident_test` (l'action rentre, avec un cas qui passe et un qui refuse) ;
`evening_strip_test` (l'étape « qui » n'apparaît que chez un maître avec des bouches sans compte) ;
mutations : `declared_by` du maître qui écrase une ligne `self` → rouge ; RLS : un membre lit la
ligne d'un autre → 0 (test SQL en transaction annulée, patron `household_rls_test.sql`). **Run
réel** : maître ✗ « tout le foyer » → `shift_dish` proposé ; membre ✗ → sa boîte proposée à
jeudi ; les deux le même soir ; la page du membre montre sa boîte, celle du maître ne montre rien
du membre.

### 5.10 Le contrat A8.0 → A7 (ce que A7 code avant de l'avoir)

- Route : `/app/progress` sous `KeelHouseholdRoute` ; garde de données : **toujours**
  `.eq("user_id", me)` en plus de RLS.
- Faits : `protocol_events` de **la personne**, préfixes `meal_tick:<planId>:<idx>`,
  `accident_off_plan:<planId>:<idx>`, `slot_meal:<date>:<slot>`, `plan_relation`,
  `disqualified_reason`, `recognized.energy_estimate{kcal,basis,confidence_band}`.
- Plans de la personne : ses `student_generated_meals` **et**, pour un membre, les plans
  `household` de son foyer (policy existante) avec sa part (`member_portions`).
- Après A8.2 seulement : `meal_share_outcomes` (via la RPC `_for`) — avant, A7 rend le compte
  « boîtes restées » comme **inconnu**, jamais zéro.
- `generated_from.shifts[]` (A8.0) pour « plans modifiés ».

### 5.11 A7 — la page de suivi (lane SUIVI, 5 jours)

**Mandat** : ANALYSE §7 entier, D7.1-D7.12 par défaut. **Front d'abord** (worktree, contrat
§5.10, données mockées par un module pur) : `/app/progress` devient « Suivi » (nav), `/app/health`
« Sécurité » (nav + `health.title`) ; supprimer `ProgressPage.tsx` et ses 32 clés ; le bloc
permanent (plans effectués = fenêtre écoulée **et** ≥ 1 coche ; plans modifiés = `shifts[]` ∪
faits `accident_off_plan` ∪ états `happened=false`/`done=false` ; « repas décidés pour toi » et
« cuisiné K fois pour M repas » — **aucune convention de temps**) ; le bloc objectif (direction
≠ null) : total jour/semaine/plan avec la **base la plus faible** et la mention « estimé » ; par
jour : plats du plan avec coche, photos (vignettes existantes), créneaux loupés = les **six**
occasions déclarées sans plat ni fait, bouton « Décrire » ; estimation d'un créneau non renseigné
= `maintenanceRange`/`directedRange` × `SLOT_DAY_WEIGHT[slot]`, milieu arrondi aux 50, base
`slot_estimate`, « modifiable dans la journée » ; courbe de poids six périodes (SVG, dernière du
jour, `student_body_measures`, `.eq("user_id")`), aussi en maintien. **Serveur ensuite** (après
fusion A8.0) : `keel-tracking-v1`, `loadEnergyGate` **en tête** (plancher TCA ⇒ réponse sans un
seul champ numérique ni la série de poids), une passe sur `[from,to]`, `verify_jwt` conforme à
`deploy-manifest-check` ; « Décrire » → chemin texte de l'analyse, `declared_quantities` si la
personne a écrit des quantités (`quantity_from_prose.ts`), sinon estimé — **sans** passer par
`meal_precision.ts`. Renversements **écrits** : FF-031 §3 (courbe), `mealPhoto.ts:92-96`
(somme à base faible), l'en-tête de `SLOT_DAY_WEIGHT` (extension de sens). Membre : ses lignes,
sa part.

**Interdits** : « il te reste X kcal » ; un `%` d'adhérence ; une somme sans base ; un chiffre
stocké ; Mifflin dans `energy_target.ts` (un test le refuse) ; lire `weekly_reviews.risk_band` ;
un nombre de minutes « économisées » inventé.

**Preuve** : `routeGuards` (retourné par A8.0), `no_calorie_to_student_property_test` vert (rien
sans base), `energy_target_test`, `body_measure_series_test`, `energy_gate_test` ; mutations : la
fonction sans `loadEnergyGate` en tête → rouge ; un total qui prend la base la plus forte → rouge ;
la courbe rendue sous plancher → rouge. **Run réel** (`qa0903s`) : une fixture à objectif avec
plan, deux photos, un créneau loupé → le jour rend trois bases distinctes et un total « estimé » ;
une fixture **sous plancher** (série de poids à −1,5 %/semaine sur 14 jours) → la réponse ne porte
ni kcal ni courbe, et la page le dit ; une fixture à 60 pesées → la courbe sur 12 mois ; le membre
réclamé de `qa0903m` voit **ses** stats et pas celles du maître.

### 5.12 E — la cohérence de bout en bout (1 jour)

1. **i18n** : fusionner les blocs délimités des cinq lanes dans `en.ts`/`fr.ts`/`catalog.ts`
   (ordre : RAPIDE, FOYER, CUISINE, MEMBRE, SUIVI), retirer les délimiteurs, `parity`, `pageSeams`,
   `pageFrontier`, `npm run lint:i18n`, puis **un** commit des trois fichiers.
2. **Baselines** : rejouer `agent-gate.sh` ; ne toucher aux baselines que pour retirer un rouge
   **réparé** — jamais pour en tolérer un neuf.
3. **La grille C1-C8** (§2.4) sur l'arbre principal, en SQL et à l'écran.
4. **Le parcours entier, au navigateur, deux comptes** : inscription par SQL → `/app/setup` (trois
   étapes, l'étape 2 sur `MouthCoreFields`, l'étape 3 sans veille ni durée, style + courses,
   équipement avant) → aperçu (timing rendu) → adopter → `/app/plan` (rang 0, sessions, vagues) →
   `/app/household` (cadres, ajout, invitation, traditions) → le soir : bande du maître (①②③ + « qui
   n'a pas mangé ») et bande du membre (③ seul) → ✗ du membre → boîte décalée → `/app/progress`
   des deux → 320 px partout.
5. **Rapport final** : prouvé / rouge / décisions par défaut / gestes humains restants.

### 5.13 Le vérificateur générique — instancié par l'orchestrateur après chaque fusion

*« Tu vérifies le lot `<lot>` de la lane `<LANE>` sur l'arbre principal, après fusion. Tu ne crois
aucun rapport : tu rejoues. (1) Statique : `git diff <base>..HEAD --stat` ne touche que les fichiers
du mandat, aucun pack i18n ; `tsc -b --force` exit 0 ; vitest et Deno verts (rouges étrangers
prouvés antérieurs) ; `wiring-check` ; les versions de prompt ont bougé du bon axe et d'un seul cran.
(2) Mutations : rejoue **chacune** de celles du rapport, plus une que tu choisis. (3) Cohérence :
les lignes de §2.4 que le lot touche. (4) Navigateur, 320 et 1280 px, deux langues, sur les
personas du tag. (5) Run réel si le mandat en prévoit un : rejoue-le avec des paramètres
**différents** du rapport. Ce que tu ne peux pas rejouer, tu le consignes rouge. Rapport
`scratchpad/2026-09-JJ-HHMM-<LANE>-<lot>-verification.md` : prouvé / non prouvé / défauts, et une
ligne finale VERT ou ROUGE. »*

---

## 6. Ce que ce chantier ne fait PAS

- Il ne pousse rien, ne déploie rien, ne pose aucun prix Stripe, ne touche pas `enable_confirmations`.
- Il ne tranche pas 1,99 € contre 2,00 € : il lit la source unique.
- Il ne construit pas l'envoi d'e-mail d'invitation (D5.7), ni une balance connectée, ni le
  vérificateur sémantique des traditions, ni le foyer orphelin.
- Il ne rebranche pas `keelGenerationModel()` sur la lane foyer, ne touche ni à la fusion ni à la
  prise de main, ni au mode 1:1.
- Il ne réactive pas `FF-005 single_run` : P2 la remplace, et la fiche le dit.
