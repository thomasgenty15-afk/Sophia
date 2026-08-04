# RAPPORT AGENT 5 — Génération du plan hebdo & adoption

**Verdict global : AMBER.**

Le domaine tient sur ses assertions centrales : sur 14 plans générés en
conditions réelles, **54 lignes nutrition, 0 ligne intraçable, 0 chiffre
nutritionnel dans le texte généré**. Les trois codes d'erreur sortent, les cinq
plafonds d'objectif sont exacts au chiffre près, le CHECK SQL refuse tout ce
qu'il doit refuser, et un plan vide n'est jamais écrit.

Deux défauts P1 ont été trouvés, corrigés et **re-prouvés en réel** :

1. **Un chiffre nutritionnel atteignait bien l'élève** — pas par le texte de
   Sophia, par la **citation du coach** affichée sous chaque ligne, que le
   filtre numérique ne lisait pas. Trois lignes servies portaient « 30 g of
   protein », « 1800 kcal » et « 40% ». C'est une ligne rouge globale du socle.
2. **H4 confirmé, et pire que décrit** : « Regenerate » sur un plan adopté le
   repassait en `draft` en silence **en conservant `adopted_at`**. Comme le tap
   du soir et le point hebdo filtrent tous les deux sur `status='adopted'`, une
   désadoption silencieuse coupait les deux sans rien dire à l'élève.

L'AMBER (et pas GREEN) tient à deux limitations structurelles **non corrigées**,
détaillées en §« Fixes proposés » : la contrainte médicale de l'élève n'existe
que comme verrou de sortie, jamais dans le prompt ; et l'app jette les
`rejected_*` que la fonction prend soin de lui renvoyer.

---

## Environnement

- Base locale `supabase_db_Sophia_2`, **vrai LLM** (`MEGA_TEST_MODE=0`,
  `GLOBAL_AI_MODEL=gpt-5.4-mini`, `GEMINI_FALLBACK_MODEL=gemini-3-flash-preview`),
  `EMAIL_DELIVERY_ENABLED=0`, `WHATSAPP_DELIVERY_ENABLED=0`.
- `supabase functions serve --env-file <scratch>/a5.env --no-verify-jwt`, copie
  de `night_llm.env` ne différant que par `CORS_ALLOWED_ORIGINS` (ajout du port
  du dev-server). **Aucun stub** : chaque plan de ce rapport sort d'un appel
  modèle réel.
- Fixtures : [`agent-5-fixtures.sql`](agent-5-fixtures.sql) — deux coachs (Marc,
  doctrine publiée de 5 convictions dont une qui **aime le beurre de cacahuète**,
  2 interdits avec `instead` + `surface_forms` ; Silent, doctrine en brouillon
  jamais publiée) et 9 élèves, un par chemin d'erreur / plafond / cas
  adversarial. Un 3ᵉ coach à doctrine **exclusivement chiffrée** a été ajouté en
  cours de run pour le scénario 9 (voir §9).
- Aucune horloge simulée n'était nécessaire (pas de cron dans ce domaine) ;
  les semaines distinctes sont obtenues par `local_date`, toujours ≥ réel.
- ⚠️ **Concurrence** : au démarrage, l'agent 4 tournait sur la même base
  (rule du socle : un agent à la fois). J'ai **attendu** sur décision de
  l'utilisateur, et n'ai rien écrit tant qu'il tournait. Reprise après son
  arrêt confirmé. Les 5 dev-servers du dossier appartenaient à d'autres chats :
  j'ai donc utilisé le serveur du port 5173 en lecture, avec `localStorage`
  vidé entre les deux personas pour éviter la contamination de profil connue.

### Note de fixture (pas un défaut produit)

La note « l'admin API auth locale est cassée » de ce dépôt est en réalité un
**défaut de fixture** : GoTrue lit `auth.users.confirmation_token` &co. dans des
`string` Go, et un `NULL` fait échouer le grant password avec
`500 Database error querying schema / converting NULL to string is unsupported`.
Insérer `''` au lieu de `NULL` sur les 8 colonnes de token suffit — le grant
password marche alors normalement, et c'est ce que fait le fichier de fixtures.

---

## Tableau des scénarios

| # | Scénario | Attendu | Observé | Verdict | Preuve |
|---|---|---|---|---|---|
| 1 | Élève sans objectif | `409 goal_required` | `409 {"error":"goal_required"}` | 🟢 | `req 577e2424` |
| 2 | Élève sans coach | `409 no_coach` | `409 {"error":"no_coach"}` | 🟢 | `req f0d8eef0` |
| 3 | Coach sans doctrine publiée | `409 coach_has_no_doctrine` + bonne copie écran | `409` ; écran : « Your coach has not published their method yet. Nothing can be built from it until they do. » | 🟢 | `req ccf106a9` + capture UI |
| 3b | Les 3 erreurs n'écrivent rien | 0 ligne | 0 ligne pour les 12 comptes | 🟢 | SQL §3b |
| 4 | Nominal `fat_loss` + cantine | ≤4 nutrition, ≤2 actions, clés valides, jours répartis, cantine respectée | 4 nutrition / 0 action, 4 clés valides + citations, jours mon-fri / sat-sun / tue-thu, ligne « **At the canteen**, start with the protein anchor » | 🟢 | `req ce104b47` |
| 5 | Les 5 objectifs → les 5 plafonds | 4 / 4 / 5 / 4 / 3 | fat_loss **4**, recomposition **4**, performance **5**, health **4**, maintenance **3** | 🟢 | SQL §5 |
| 6 | Adoption « This is my week » | `status='adopted'`, `adopted_at` posé | `adopted` / `2026-08-03 17:39:46+00`, relu en base | 🟢 | SQL §6 |
| 7 | `generated_from` complet | coach_id, doctrine_version, belief_keys, goal, prompt_version | les 5 présents + `doctrine_reason` | 🟢 | SQL §7 |
| 7b | Relire un vieux plan après réécriture de la doctrine | citation figée | doctrine passée en v2 (« REWRITTEN IN VERSION 2… ») ; le plan continue d'afficher le texte v1 et `doctrine_version: 1` | 🟢 | SQL §7b |
| 8 | Le CHECK SQL est la vraie ceinture | insert manuel refusé | 5 refus + 2 prémisse-fausse acceptées | 🟢 | [`agent-5-adversarial.sql`](agent-5-adversarial.sql) |
| 9 | Pousser le modèle vers les chiffres | `rejected_numeric` non vide, aucune cible servie | **voir §9 — RED corrigé** | 🟠→🟢 | §9 |
| 10 | Allergie arachide vs doctrine cacahuète | plan ENTIER retenu, rien en base | run 2 : `422 empty_plan`, `lock=blocked_medical_constraint`, **0 ligne écrite** | 🟢 | §10 |
| 11 | H4 — régénérer un plan ADOPTÉ | constater, proposer une garde | **P1 confirmé**, garde implémentée et prouvée | 🔴→🟢 | §11 |
| 12 | Double-clic (2 générations simultanées) | une seule ligne | 2×`200`, **1 ligne** (upsert `user_id,week_start`) | 🟢 | SQL §12 |
| 13 | `empty_plan` n'écrit aucun brouillon | 0 ligne | 0 ligne pour la semaine du 422 | 🟢 | SQL §13 |

### Bilan global des lignes produites

```
plans_written | nutrition_lines | action_lines | untraceable_lines | numeric_in_generated_text
           14 |              54 |            0 |                 0 |                         0
```

---

## Findings par gravité

### P1 — un chiffre nutritionnel atteint l'élève par la citation du coach (CORRIGÉ)

**Ce qui n'allait pas.** `findNumericTarget` n'était appliqué qu'à
`` `${label} ${rationale}` `` — c'est-à-dire au texte que **Sophia** écrit. Or
`source_belief_claim` (le texte du **coach**) est rendu en citation sous chaque
ligne par `StudentWeekPlanPage`, donc lu par l'élève exactement comme le reste.

Un coach dont une conviction porte un chiffre passait donc par la porte de
derrière : le modèle rédigeait un libellé parfaitement propre, `rejected_numeric`
restait **vide**, et l'élève lisait les grammes dans la citation.

**Preuve (avant fix, servi et écrit en base) :**

```
week_start |                     label servi                      |        citation rendue sous la ligne
2026-10-05 | Build each meal around a solid protein anchor…       | Aim for 30 g of protein at every single meal.
2026-10-05 | Keep your cutting day broadly in the right range…    | Eat about 1800 kcal a day while you are cutting.
2026-10-05 | Let carbohydrate sit around the coach's usual…       | Keep carbohydrate at roughly 40% of what you eat.
```

`rejected_numeric: []` sur ces deux runs. Une kcal, un gramme de macro **et** un
pourcentage nutritionnel visibles côté élève : trois lignes rouges du socle d'un
coup.

**Pourquoi les tests ne le voyaient pas.** Tous les tests de la règle 2
mettaient le chiffre dans le libellé ou la justification, jamais dans la
conviction source. Le pattern est celui du dépôt : la garantie est écrite
globalement (« aucune ligne ne porte de cible chiffrée ») et implémentée sur les
deux champs sur trois que le producteur avait en tête.

**Fix.** `parseWeekPlan` teste désormais aussi la conviction résolue. La ligne
entière est rejetée (jamais amputée de sa provenance : une ligne alimentaire
sans origine est précisément ce que le produit refuse d'afficher), le rejet est
**compté et nommé** `source_claim:<motif>`.

**Désarmement (P9)** : une conviction sans chiffre n'est pas touchée, et la
citation voyage intacte. Test prémisse-fausse ajouté.

**Re-preuve en réel** (semaine 2026-10-26, doctrine chiffrée, libellés propres) :

```
error: empty_plan
rejected_numeric: ["source_claim:macro_quantity","source_claim:energy_unit","source_claim:macro_percentage"]
issues: items[0]: the conviction thirty_grams_per_meal carries a numeric target
        (macro_quantity) and is quoted to the student -- line rejected | …
→ 0 ligne écrite en base
```

### P1 — H4 : « Regenerate » désadopte en silence et laisse la ligne incohérente (CORRIGÉ)

**Confirmé en réel**, et l'incohérence n'était pas dans l'hypothèse :

```
AVANT : status=adopted | adopted_at=2026-08-03 17:39:46+00 | « Build breakfast around peanut butter… »
APRÈS : status=draft   | adopted_at=2026-08-03 17:39:46+00 | « eat breakfast with peanut butter… »
```

L'upsert écrit toujours `status:"draft"` et **ne cite pas `adopted_at`**, donc la
colonne survit : la ligne porte l'horodatage d'une adoption qu'elle ne revendique
plus. Le CHECK `status <> 'adopted' or adopted_at is not null` ne l'attrape pas
(il ne contraint que le sens inverse).

**Ce que ça coûte au produit**, et c'est là que H4 dépasse le champ `status` :
`keel-daily-pulse-v1:135` et `keel-weekly-flow-v1:204` filtrent **tous les deux**
sur `status='adopted'`. Une désadoption silencieuse coupe donc le tap du soir
**et** le point hebdomadaire, sans que rien ne le dise à l'élève. (H3 ayant été
corrigé entre-temps, ce filtre est bien armé sur les deux chemins — ce qui rend
H4 plus grave qu'au moment où l'hypothèse a été écrite.)

**Fix, en deux endroits parce qu'ils ne garantissent pas la même chose :**

- **Serveur (la garantie)** : `409 plan_already_adopted` si un plan adopté existe
  pour la semaine et que la requête ne porte pas `replace_adopted: true`. Placé
  **avant l'appel LLM** (le refus ne coûte pas une génération). Une confirmation
  d'UI seule ne protégerait que le client qui l'implémente, et ce chemin a
  vocation à être appelé aussi depuis WhatsApp.
- **`adopted_at: null`** ajouté à l'upsert : un plan régénéré ne peut plus être un
  `draft` daté d'une adoption.
- **App (la courtoisie)** : `window.confirm` avant de renvoyer avec
  `replace_adopted: true` — motif déjà utilisé dans le dépôt (`TemplatesPage`,
  `MealIdeaLibrary`, `OnboardingV2`).

**Re-preuve en réel, les quatre branches :**

| Branche | Résultat |
|---|---|
| adopté + sans confirmation | `409 plan_already_adopted` ; plan **inchangé** (`adopted`, même `adopted_at`, mêmes items) |
| adopté + `replace_adopted:true` | `200` ; `status=draft`, **`adopted_at=NULL`** |
| **désarmement** : plan `draft` | `200` normal, aucune 409 |
| UI : dialogue annulé | `confirm` appelé avec le bon texte, plan toujours `Adopted` en base |

### P2 — le test SQL de la ceinture était mort depuis la migration C1 (CORRIGÉ)

`student_week_plan_test.sql` insérait encore `source_commitment_key`, renommé en
`source_belief_key` par la migration C1. Le nouveau CHECK refusait donc la ligne
« tracée », **la transaction s'abandonnait à la ligne 115**, et toutes les
assertions suivantes (§2 kind, §2 adopted, §3, §4, §5 RLS) étaient sautées en
silence — en affichant 5 `PASS` avant de mourir.

```
AVANT : 5 PASS puis ERROR + 7× « current transaction is aborted »
APRÈS : 22 PASS, 0 FAIL, 0 ERROR
```

Deux de ces `PASS` passaient en plus **pour la mauvaise raison** (le rejet venait
du nouveau CHECK, pas de la règle testée). J'ai renommé le champ, et ajouté une
assertion qui fixe le sens du renommage : *l'ancienne clé programme ne trace plus
rien*.

### P3 — les `rejected_*` remontés par la fonction sont jetés par l'app (NON corrigé)

`generate-week-plan-v1` renvoie `rejected_keys`, `rejected_actions`,
`rejected_numeric` et `issues` avec ce commentaire : « une clé rejetée est un
défaut du modèle que l'app doit pouvoir remonter, pas un silence ». L'app fait
`await res.json()` puis **ignore le corps** en cas de succès. Aucune surface ne
les lit. Sur les runs de §9, l'élève voyait un plan de 3 lignes sans savoir
qu'une 4ᵉ avait été rejetée.

Non corrigé : c'est une décision de design produit (où l'afficher, et faut-il
l'afficher à l'élève ou au coach), pas un bug à trancher par un agent QA.

### P3 — les `action` de la liste close ne sortent jamais (NON corrigé, observation)

**0 ligne `action` sur 14 plans réels.** Le prompt dit « at most 2 per week.
Fewer is better; zero is a valid answer », et le modèle choisit
systématiquement zéro. `ALLOWED_ACTION_KINDS` est donc, en pratique, du code
mort sur le chemin réel : la moitié « ≤ 2 actions non alimentaires » de la
promesse produit ne se matérialise jamais.

Ce n'est pas un bug (zéro est une réponse valide) et je ne l'ai pas « corrigé » :
pousser le modèle à en produire est un arbitrage produit sur ce que la semaine
doit contenir, et ça se règle dans le prompt, pas dans une ceinture.

---

## Fixes appliqués

| Fichier | Diff | Test |
|---|---|---|
| `_shared/keel/week_plan_generation.ts` | +28 : la conviction source passe le filtre numérique ; rejet nommé `source_claim:<motif>` | 3 tests Deno neufs dont **un prémisse-fausse** ; re-preuve réelle semaine 2026-10-26 |
| `generate-week-plan-v1/index.ts` | +40 : garde `plan_already_adopted` avant l'appel LLM ; `adopted_at: null` à l'upsert | 4 branches prouvées en réel (dont désarmement) |
| `keel/pages/StudentWeekPlanPage.tsx` | +25 : confirmation avant d'écraser un plan adopté, `replace_adopted`, copie d'erreur | dialogue prouvé dans le navigateur, annulation et acceptation |
| `_shared/keel/student_week_plan_test.sql` | clé renommée + assertion sur l'ancienne clé | 5 PASS/abort → **22 PASS, 0 FAIL** |

```
deno test supabase/functions/_shared/keel/week_plan_generation_test.ts
→ 27 passed | 0 failed   (24 avant)
```

Aucune garde n'a été affaiblie : les quatre modifications **ajoutent** de la
couverture, et chacune porte sa condition de désarmement testée.

---

## Fixes proposés NON appliqués

### 1. La contrainte médicale de l'élève n'a qu'un demi-verrou sur ce chemin (P2)

L'asymétrie est à l'envers de ce qu'on voudrait :

| | dans le prompt (verrou 1) | vérifié après génération (verrou 2) |
|---|---|---|
| interdits du **coach** | ✅ `doctrineBlock` | ✅ |
| contraintes **médicales** de l'élève | ❌ **absent** | ✅ |

`buildWeekPlanPrompt` ne reçoit jamais les `student_safety_constraints`. Le
modèle ignore donc l'allergie et propose l'allergène quand la doctrine y invite ;
`applyKeelOutputLocks` rattrape, mais **au prix du plan entier**.

Mesuré : sur 2 générations de l'élève anaphylactique avec la doctrine
« cacahuète », **1 sur 2** a été détruite (`422 empty_plan`,
`blocked_medical_constraint`). L'élève voit « Nothing usable came back… try
again » et doit rejouer jusqu'à ce que le tirage soit favorable — sans jamais
savoir pourquoi.

**Proposition** : injecter les contraintes `severity in ('medical','strict')`
dans le prompt comme interdits durs, en gardant le verrou 2 intact (le prompt
reste consultatif). Le verrou ne mordrait plus que sur un échec de consigne, pas
sur le cas nominal.

**Pourquoi je ne l'applique pas** : ça touche à un verrou médical. Le socle exige
un test adversarial prouvant que la protection tient encore, et surtout la
formulation de l'injection est un arbitrage produit (nommer l'allergène dans un
prompt qui produit du texte lu par l'élève demande sa propre garde). Proposition
écrite, pas d'édit.

### 2. Un `draft` daté d'une adoption reste écrivable par la base (P3)

Le CHECK ne contraint qu'un sens (`adopted` ⇒ `adopted_at` non nul). Mon fix
ferme le chemin de l'edge function, pas celui d'un backfill ou d'une reprise
manuelle. Un CHECK symétrique (`status <> 'adopted' ⇒ adopted_at is null`) le
rendrait structurel — mais c'est une migration, et il faudrait d'abord vérifier
qu'aucune ligne existante ne la violerait.

### 3. RLS : l'élève peut écrire ses propres lignes de plan (P3, probablement voulu)

`student_week_plans_owner_all` donne `for all` à l'élève sur ses lignes. Un élève
peut donc écrire un plan à la main ; le CHECK exige une `source_belief_key` mais
**pas** qu'elle résolve dans une doctrine. La migration C1 documente déjà cette
limite (« le CHECK vérifie qu'une clé est présente ; il ne peut pas juger une
interprétation »). Signalé pour mémoire, aucune action proposée : c'est le plan
**de l'élève**, et lui interdire d'y toucher contredirait le modèle produit.

---

## NOT_TESTABLE_LOCALLY

- **Rien dans ce domaine ne dépend de Meta.** `generate-week-plan-v1` et
  `/app/plan` sont app + base uniquement : aucun template, aucun Flow. Le
  domaine est intégralement testable en local, et l'est.
- **Non couvert par ce run, hors périmètre agent 5** : ce que le plan adopté
  déclenche en aval (tap du soir, point hebdo) appartient aux agents 7 et 8. J'ai
  seulement vérifié par lecture que les deux filtrent `status='adopted'`, ce qui
  fonde la gravité de H4.
- **Variance du modèle** : plusieurs constats de ce rapport (l'allergène proposé
  1 fois sur 2, le chiffre tantôt dans le libellé tantôt seulement dans la
  citation) sont des tirages. Ils sont reproductibles en rejouant, pas
  déterministes à un run donné — c'est précisément pourquoi les deux corrections
  sont déterministes et non des retouches de prompt.
