# BRIEFING COMMUN — chantier QA « génération de plan » (2026-08-18)

Lis ce fichier en entier avant de commencer. Il porte ce qui est vrai pour tous
les agents du chantier. Ton prompt ne répète que ce qui t'est propre.

## Le modèle produit
Le coach écrit une **doctrine** pour toute sa cohorte ; c'est l'**élève** qui
compose sa semaine. **Aucun canal 1:1.** Aucune copie ne doit faire attendre
l'élève. Détail : `CLAUDE.md`, `docs/keel/MODEL.md`.

## Les trois lanes de génération
| Lane | Fonction edge | Modèle | Repli |
|---|---|---|---|
| solo repas | `supabase/functions/generate-meal-v1/index.ts` | `keelGenerationModel()` = `gpt-5.6-sol`, timeout 240 s | **oui** |
| solo semaine | `supabase/functions/generate-week-plan-v1/index.ts` | idem (`index.ts:798`) | **oui** |
| foyer | `supabase/functions/generate-household-meal-v1/index.ts` | `GLOBAL_AI_MODEL` = `gpt-5.4-mini` | non |

⚠️ **CORRECTION du 2026-08-18, une version antérieure de ce briefing disait
l'inverse.** Ce sont les lanes **solo** qui portent le modèle de composition et
qui peuvent **replier** ; la lane **foyer saute `keelGenerationModel()`** et part
directement sur le modèle du **chat**. Vérifié : `generate-meal-v1:1839`,
`generate-week-plan-v1:798` l'appellent, `generate-household-meal-v1` non.

✅ **Le repli est inoffensif pour la mesure** : prouvé par empreintes SHA-256
relevées sur la socket, l'appel qui expire et celui qui produit portent le
**même** prompt, y compris d'un fournisseur à l'autre. Le prompt archivé est
bien celui qui a fabriqué la sortie. Seule scorie : la ligne de prompt nomme le
modèle **échoué** — le script de vidage, lui, annonce le bon.

Point de passage **unique** vers le modèle :
`generateWithGemini(systemPrompt, userMessage, ...)` — `supabase/functions/_shared/gemini.ts:146`.

## ⛔ DÉCISION DU 2026-08-19 — LE PÉRIMÈTRE « SOLO » EST UNE SEULE LANE
Les étapes ② et ④ ne travaillent que sur **`generate-meal-v1`**.
`generate-week-plan-v1` **sort du chantier**.

Pourquoi, mesuré : la lane du repas est vivante et c'est l'écran de composition
lui-même qui l'appelle —
`MealBuilder.tsx:788` → `generateMeal()` (`api/mealGeneration.ts:615`) →
`invoke("generate-meal-v1")`. La lane de la semaine, elle, n'a **aucun appelant
vivant** : `generateWeekPlan` (`api/weekPlan.ts:137`) n'est appelée par aucun
écran ni module, et côté serveur les seules occurrences restantes sont six
fichiers de test et une ligne d'aide de script. Ses appels en base sont ceux des
agents de QA, pas d'un usage.

⚠️ **Ne la supprime pas et ne la « rebranche » pas** : ce dépôt garde exprès des
chemins qui ressemblent à du code mort, et `student_week_plans` est nommée dans
le modèle produit. La question « code mort ou lane à rebrancher ? » est posée
ailleurs, à un humain.

⚠️ Conséquence à connaître : le correctif « régime alimentaire absent du prompt
de semaine » livré par l'agent 1A porte sur cette lane inatteignable. Il est
juste, il n'a simplement aucun effet pour un utilisateur aujourd'hui.

📌 **Le chat ne génère aucun repas.** Les seules mentions d'une lane de
génération dans `sophia-brain` sont un harnais de test. Il n'existe pas de porte
« repas sur le tas » par la conversation.

## Ce qui est déjà mesuré — ne le redécouvre pas
- **Les lanes solo peuvent expirer à 4 min** puis replier. N'alourdis jamais le
  prompt sans nécessité mesurée ; lis toute latence avec ça en tête.
- **La promesse et la clé doivent se toucher.** Un champ dont la *promesse* vit
  dans le message utilisateur et la *clé* dans le prompt système sort à **0 %**.
  Mesuré deux fois. Rapprochés + **nombre attendu** + **échappatoire nommée** ⇒
  0→11 plats, 0→38 % de notes.
- **Un compteur à deux nombres ment.** `{demandé, attribué}` rend le même zéro
  pour « jamais déclaré » et « déclaré puis refusé ». Toujours
  **déclaré / valide / refusé**, et rendu sur l'aperçu aussi.
- **Aucun matcher maison** sur les titres ou les aliments : 12 faux positifs sur
  12 mesurés (« laitue » ≠ « lait »). Tout est **déclaré par le modèle** et
  validé contre une **liste fermée**.
- **Aucune calorie dans le texte d'un plan.** Les grammes d'**aliment** sont
  voulus ; les kcal et les chiffres de **corps**, jamais. « Vise 700 » est une
  consigne ; « il te reste 680 » est la phrase d'un tracker.
- **Le corps d'un mineur ne s'énonce jamais.** On calcule avec, on ne le dit pas.
- **Un champ collecté sans lecteur ressemble exactement à un champ ignoré.**
  Trois fois mesuré. C'est le piège central de ce chantier.
- **Un `grep` naïf compte des commentaires comme des lecteurs vivants.** Ce dépôt
  est très commenté : retire les commentaires avant de conclure qu'un appelant existe.

## Poste de travail — règles dures
- ⛔ **INTERDIT seul** : `supabase db push`, `db reset`, `functions deploy`,
  `secrets set/unset`, `config push`, `link`, et toute écriture de secrets par la
  Management API. Un hook les bloque. **Seul `supabase migration up` est autorisé.**
  Si tu en as besoin : arrête-toi et donne la commande exacte à copier-coller.
- ⚠️ **Le runtime edge sert des `_shared` PÉRIMÉS.** Un fichier modifié n'est pas
  rechargé. Après toute modification de `_shared/` : sonde
  `docker logs --tail 40 --timestamps supabase_edge_runtime_Sophia_2` ; si seuls
  des crons tournent, fais **exactement** `docker restart supabase_edge_runtime_Sophia_2`.
  **Prouve la fraîcheur par une observation**, jamais par la confiance.
- ⚠️ **Migration hors ordre = sautée en silence.** Compare le disque
  (`ls supabase/migrations/`) et le registre
  (`select version from supabase_migrations.schema_migrations order by version desc limit 5;`).
- **401 « Invalid JWT » en local** : ne touche à rien, lance
  `./scripts/check-local-jwt-alg.sh` et lis `docs/keel/JWT-HS256.md`. Ne passe
  **jamais** une fonction en `verify_jwt = false`, n'écris **jamais** dans
  `supabase/signing_keys.local.json` (il doit rester `[]`).
- **Kong 502** = faux tours perdus : lance `scripts/local_extend_kong_functions_timeout.sh`
  avant tout run long.
- `scripts/agent-gate.sh` **ne lance pas vitest** — lance-le toi-même.
  `npx tsc -b --force` (2 s ; l'incrémental invente des erreurs).
  `frontend/tsconfig.json` ne vérifie rien (`files: []`) → `tsconfig.app.json`.
- DB locale : `docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c "..."`.
- ⚠️ **Ne laisse jamais des exports `SUPABASE_*` dans ton shell** avant de lancer
  la suite de tests : 114 faux rouges mesurés.

## L'instrument, et ses trois pièges mesurés
Le prompt réellement envoyé est dans `public.llm_raw_response_events`
(`system_prompt`, `user_message`, `_chars`, `_truncated`). Vidage :
`node scripts/export_llm_prompt_dump.mjs --request-id <id> --out <dossier>`.

1. ⚠️ **Un vidage vide n'est PAS une preuve d'absence.** L'instrument a déjà été
   MORT sans le dire : un `revoke insert … from service_role` a fait refuser
   **52 écritures, sans un signal** — le code ne lit pas le `.error` de son
   insert. Avant de cocher, **prouve que la ligne de ton run existe** :
   `select source, status, system_prompt_chars from llm_raw_response_events where request_id='<id>';`
2. ⚠️ **`--source` sans correspondance vide silencieusement une AUTRE lane**,
   code de sortie 0. Vérifie que le dossier produit porte la lane visée.
3. ⛔ **Le mode JSON réécrit le prompt APRÈS la capture** (`gemini.ts:549-567`,
   mesuré 77→102 caractères). L'écart est **nul aujourd'hui** parce que le mot
   « json » figure déjà dans les trois prompts — mais **rien ne le garde**.
   Conséquence directe pour quiconque RÉÉCRIT un prompt : si ta réécriture fait
   disparaître ce mot, l'instrument se met à mentir **en silence**. Vérifie-le
   après chaque modification de prompt.

## Le poste partagé — quatre pièges mesurés le 2026-08-18
1. ⚠️ **Le conteneur edge est recréé toutes les 2–3 minutes** par le
   `functions serve` d'une session voisine : des runs meurent en **502 Kong**
   en plein vol. Ce n'est ni le produit ni Kong (patché à 600 s, revérifié).
   Relance — et ne conclus **jamais rien** d'un 502.
2. ⚠️ **Le panneau de navigateur est partagé** entre agents. `computer.left_click`
   peut cesser d'atteindre la page — aucun `mousedown` reçu par un écouteur en
   capture — alors que le survol et le clavier passent. Repli légitime :
   `form_input` + clic programmatique **sur les vrais boutons de l'écran**
   (mêmes gestionnaires, mêmes validations, mêmes appels réseau). **Dis-le**
   dans ton rapport si tu l'utilises.
3. ⚠️ **Sur la lane foyer, un `request_id` porte souvent DEUX appels**
   (`.protein_anchor_retry`) : `--source` est **obligatoire** au vidage.
4. ⚠️ **Quatre tests front sont rouges et ÉTRANGERS à ce chantier**
   (`coverage-guard` : 55 fonctions edge contre 52 déclarées ;
   `household.int.test.ts:323`). Ne les réparent pas, ne les compte pas contre toi.

## Comptes et fixtures
- Personas QA : `tests/real-personas/` — `qa-skill`, `paul`, `eva`, `alex`,
  `rose`, `nina`. Mot de passe `1234567`.
- **Ne vise JAMAIS un compte dont tu n'as pas le mot de passe** : l'agent finit
  par forger des JWT et écrire dans `auth.sessions`. Nomme une fixture.
- Fixtures : `docs/keel/qa-fixtures/00-base.sql`, `10-make-coach-cohort.sql`,
  `20-publish-doctrine.sql`. ⚠️ **Sans plan publié, aucun effet KEEL** — la
  fixture de doctrine publiée est obligatoire.
- ⚠️ **Le harnais QA plafonne à 3 sièges d'essai** : le 4ᵉ élève plante le run.
- ⚠️ **Profil de navigateur partagé** = même origine, donc **auth partagée**
  entre onglets. Deux personas dans deux onglets se contaminent.
- ⚠️ `profiles.locale` vaut `fr-FR` par défaut : une fixture qui ne l'écrit pas
  produit un faux défaut de langue.
- ⚠️ **La langue de l'écran ne prouve rien sur le compte** : l'UI suit
  `navigator.languages`.

## Discipline de dépôt — 550 fichiers modifiés viennent d'AUTRES sessions
- ⛔ **JAMAIS `git add -A`. JAMAIS `git stash`** (il emporte 200+ fichiers d'autres lanes).
- Pour commiter : index privé, `git apply --cached` sur **tes** hunks seulement,
  commit, puis `git reset -- <chemins>`.
- **Horodate** tes fichiers de scratchpad : `2026-08-18-HHMM-<lot>-<sujet>.md`.
- Reste dans **ton périmètre**. Si un correctif est commun à deux agents, il
  appartient à celui que ton prompt désigne, et l'autre attend.

## La règle des trois fichiers
À chaque run : **les données d'entrée, le prompt envoyé, la sortie obtenue.**
Un run dont on n'a pas les trois **n'est pas une mesure**.

## L'itération, telle qu'elle est demandée
Tu **corriges et tu recommences** ; tu ne rends pas un constat. Ce qui t'arrête :
ton critère de sortie est atteint, **ou** tu as mesuré que le modèle n'obéit pas
malgré un prompt bien construit — et c'est alors **un résultat**, consigné avec
les octets, jamais maquillé. **Numérote et garde chaque itération** : on veut la
trajectoire, pas seulement le dernier état.

## Hors chantier — n'y touche pas
Les écrans (sauf si un champ ne s'écrit pas), la garde TCA, les portes d'énergie,
le contrat C1→C9, le modèle de la lane foyer. Et **on ne « répare » jamais un
plan à la main** : on corrige le **prompt** et le **branchement**, jamais la sortie.
