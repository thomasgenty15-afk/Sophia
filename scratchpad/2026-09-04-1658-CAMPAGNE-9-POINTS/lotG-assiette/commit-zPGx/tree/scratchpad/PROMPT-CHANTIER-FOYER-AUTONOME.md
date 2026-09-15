# Prompt — Finir le chantier foyer en autonomie

> À coller tel quel dans une session neuve. Le dépôt est
> `/Users/ahmedamara/Dev/Sophia 2`, branche `ff-001-quotidien-du-coach`.

---

Tu finis le **chantier foyer** de Sophia/KEEL. Le plan est écrit, arbitré, et
son autorité est **`docs/keel/CHANTIER-FOYER-PROFILS.md`** — lis-le en premier,
en entier. Les lots 0 et 1+2+3 sont livrés ; il reste 3B, 4, 6, 5, 8, 7 et 9.

## ⚠️ TU ES UN ORCHESTRATEUR, PAS UN IMPLÉMENTEUR

**C'est la contrainte n°1, et elle n'est pas négociable.** Un seul contexte ne
tient pas sept lots : tu t'arrêteras en route, au milieu d'un fichier, et tu
laisseras le dépôt dans un état intermédiaire — ce qui est le pire résultat
possible ici, parce que ce chantier touche le schéma.

Donc :

- **Un sous-agent par lot.** Tu délègues l'implémentation avec l'outil `Agent`
  (`subagent_type: "general-purpose"`), tu reçois son rapport, tu **vérifies
  toi-même**, tu commites, tu passes au suivant.
- **Toi, tu ne lis jamais un gros fichier.** Ton contexte sert à : lire le plan,
  écrire les briefs, faire tourner des vérifications courtes (`grep`, tests,
  typecheck), lire les rapports, committer. Rien d'autre.
- **Séquentiel, jamais en parallèle.** Deux sous-agents qui écrivent chacun une
  migration choisissent la même heure ronde et cassent la lignée — ce dépôt
  vient d'y passer une heure (`20260808060000` en double). Et les lots 4 et 6
  touchent tous les deux `HouseholdPage.tsx`.
- **Tu commites entre chaque lot.** Un lot = un commit. Jamais deux lots dans un
  commit, jamais un lot à moitié commité.

## Ta posture

- **Vérifie avant d'affirmer.** Un sous-agent qui dit « c'est vert » n'est pas
  une preuve. Tu relances les tests toi-même, et tu greppes ce qu'il prétend
  avoir fait. Ce dépôt a une histoire documentée de code « livré » qui était
  faux en run réel.
- **La vérité est en base, jamais dans un typecheck.** Le front a son PROPRE
  univers de types : il compile parfaitement en appelant une RPC dont la
  signature a changé. Sur le lot précédent, `keel_household_join` a été cassée
  pendant que le typecheck restait vert — c'est le test SQL qui l'a trouvée.
- **Ne tranche pas une question ouverte en silence.** S'il en reste une, tu
  t'arrêtes et tu demandes à l'humain.

---

## L'état exact du dépôt

**Commits déjà en place** (dans l'ordre) :

- `73115206` — lignée de migrations réparée (doublon levé, 5 versions
  réconciliées).
- `9dc442d2` — **lots 1+2+3** : `member_id` devient la clé du foyer, `user_id`
  optionnel, prénom/date/objectif sur la ligne membre, âge à trois états
  (`minor|adult|unknown`), consentement + `households.kind` + colocation
  supprimés, plafond de 8 en base.

**Ce qui existe déjà et que tu ne dois pas reconstruire** : les RPC
`keel_household_add_member`, `keel_household_remove_member`,
`keel_household_set_member_goal`, `keel_household_member_age`, et le roster
(`keel_household_roster` / `_for`) qui rend
`member_id, user_id, first_name, age_state, role, goal`.

### 🛑 Trois pièges d'état, à donner à CHAQUE sous-agent

1. **Deux rouges PRÉEXISTENT et ne sont pas à toi.** Ne les corrige pas, ne les
   chasse pas, ne t'en inquiète pas :
   - `supabase/functions/_shared/chat/recent_history_test.ts` — 2 échecs
     (chantier chat d'une autre session) ;
   - `frontend/src/edge/coverage-guard.int.test.ts` — 2 échecs
     (`keel-daily-recommendation-v1` et son trigger, chantier FF-028).

   **Conséquence à garder en tête** : le garde de couverture étant déjà rouge,
   il ne t'avertira PAS si tu ajoutes une edge function ou un trigger. Vérifie à
   la main.

2. **Du travail non commité d'autres sessions traîne dans l'arbre.** Ne
   l'emporte JAMAIS dans un commit sans le dire. Notamment
   `frontend/src/keel/components/KitchenToday.tsx` et `MealPickerGrid.tsx`
   (non suivis), plus une dizaine de fichiers modifiés côté `frontend/src/keel`
   sans rapport avec le foyer. **Avant chaque commit : `git status --porcelain`,
   et tu stages fichier par fichier, jamais `git add -A`.**

3. **La base locale est PARTAGÉE** avec d'autres sessions. Jamais de
   `db reset`.

---

## Les règles opérationnelles

1. **Jamais seul** : `supabase db push`, `db reset`, `functions deploy`,
   `secrets set/unset`, `link`. Un hook les bloque. Si un lot en a besoin,
   **arrête-toi** et donne la commande à l'humain.
2. **En local, `migration up` est autorisé** :
   `npx supabase migration up --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres`
   (ajoute `--include-all` si le CLI refuse à cause d'une version antérieure).
3. **Avant d'écrire une migration**, vérifie l'absence de doublon :
   `ls supabase/migrations/*.sql | xargs -n1 basename | cut -d_ -f1 | sort | uniq -d`
4. **Tests Deno avec l'environnement purgé**, sinon 114 faux rouges :
   `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
5. **Typecheck frontend** : `cd frontend && npx tsc -b` (le tsconfig racine ne
   vérifie rien).
6. **Tests frontend** : `cd frontend && npx vitest run`.
7. **Test RLS du foyer** (36 assertions, sur la vraie base) :
   `docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/functions/_shared/keel/household_rls_test.sql`
8. **Code edge modifié** → `docker restart supabase_edge_runtime_Sophia_2`.
   Le runtime sert des `_shared` périmés sinon.
9. **Branche `ff-001-quotidien-du-coach`, aucune autre, aucun push.**
10. Message de commit : français, sans accents, une phrase descriptive en
    titre, un corps qui explique le POURQUOI. Termine par
    `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Un hook
    (`agent-gate`) tourne au commit et fait typecheck + deno check ; s'il
    échoue, le commit n'a pas eu lieu.

---

## Les pièges que ce dépôt a déjà payés

À recopier dans **chaque** brief de sous-agent :

- Un morceau construit, testé, déployé, **dont personne n'a rebranché le fil**.
  Mode d'échec n°1. Toute fonction sans appelant est un défaut, pas un actif.
- Une garde testée dans **une seule langue** est à moitié désarmée.
- Un **paramètre de garde optionnel** est une garde désarmée.
- `create or replace view` **perd `security_invoker`** — invisible aux tests.
- `revoke from public` **laisse `anon`** — vérifier `has_table_privilege`.
- Toute table neuve donne **tout** à `authenticated` par défaut, `TRUNCATE`
  compris, et `TRUNCATE` échappe à RLS.
- Une **fixture qui ment** rend une fonctionnalité verte sans qu'elle marche
  (`cookOn` ≠ `cook_on`). Dans un décor de test, les identifiants de MEMBRE
  doivent différer des identifiants de COMPTE, sinon un appariement resté sur
  `user_id` passe.
- Un test **paramétré par sa propre constante** reste vert quand on change la
  constante. Mute la règle pour prouver que le test la mesure.
- Les fonctions SQL `language sql` créent une **dépendance sur les colonnes
  citées** : il faut les dropper AVANT de supprimer une colonne.

---

## Les lots, dans l'ordre

Chaque brief que tu écris doit contenir : l'objet du lot, **ce qui est déjà
décidé** (le sous-agent ne re-débat pas), les fichiers d'entrée, la preuve
d'acceptation, les règles opérationnelles et les pièges ci-dessus.

### Lot 3B — le corps sur le générateur du foyer

**Décidé.** On branche le corps. C'est ce qui rend le cran 2 réel : réclamer son
profil doit changer l'assiette, pas seulement l'accès.

**Le fait qui commande.** `generate-household-meal-v1` ne lit **aucun** corps ;
le chemin individuel le lit à `generate-meal-v1:514-521` (`loadStudentBody` +
`mealBodyContextFrom` → taille, bande d'âge, sexe, dernier poids, dernier tour
de taille), le passe en `body:` à `buildMealPrompt`, rendu par `mealBodyBlocks`.

**Le travail.** Charger le corps **par membre qui a un `user_id`** (les autres
portent `null`), best-effort et jamais bloquant — l'arbitrage est déjà écrit à
`generate-meal-v1:511-532`. `PortionMember` gagne `body: MealBodyContext | null`.
`buildPortionBrief` enrichit la ligne. `restrictionFlag` **par membre et
fail-closed**, comme l'individuel où il part à `true` (`generate-meal-v1:492`).

**La règle qui tient le lot :** *l'entrée gagne des faits, la sortie n'en gagne
aucun.* Le brief se termine déjà par « NEVER state … anything about a person's
body », et `FORBIDDEN_PORTION_TERMS` (`household_portions.ts:152`, appliquée en
`:215`) est la ceinture bilingue. Brancher le corps augmente mécaniquement la
pression sur elle : le modèle aura enfin de quoi dire « pour ton poids ».

**Preuve d'acceptation.** Un foyer MIXTE (des bouches avec corps, d'autres sans)
où la consigne d'un membre avec corps diffère de celle du même membre sans
corps, et la ceinture verte sur les deux sorties, **dans les deux langues**.

### Lot 4 — l'ajout en 90 secondes + les allergies de foyer

**Décidé.** Le maître est la **première bouche** du flux (ça supprime la falaise
`goal_required` de `generate-household-meal-v1:267-271`). Champs : prénom
obligatoire, âge et objectif facultatifs.

**Les allergies sont un trou de sécurité, pas un confort.** Elles vivent dans
`student_safety_constraints` (`20260727090000:617`), **clée sur `user_id`** :
une bouche sans compte n'a nulle part où porter la sienne. Le générateur en fait
l'union qui arme le prompt (`generate-household-meal-v1:390`) et **s'arrête**
si la lecture échoue. **Décidé** : une contrainte de foyer clée sur `member_id`,
avec un `kind` explicite qui sépare **allergie** (médicale, fail-closed) et
**règle de maison** (parentale — son verrou
`household_restriction_lock.ts:26-38` EFFACE le pourquoi du plat, ce qui serait
catastrophique pour un allergène).

**À nettoyer dans ce lot** : les clés i18n devenues mortes après les lots 1+2+3
— `household.create.kind.*`, `household.consent.*`,
`household.restriction.blocked.*`. Vérifié : plus aucun appelant hors `i18n/`.

### Lot 6 — la réclamation de profil

**Décidé.** Version minimale, maintenant. `household_invitations` et
`keel_household_join` **changent de rôle** : `join` ne doit plus CRÉER une ligne
mais **attacher un `user_id` à une ligne existante**. Ce qu'elle livre : le
lien, l'attachement, la lecture du plan, et l'usage de
`keel_household_set_member_goal` par la personne sur SA ligne (la RPC existe
déjà et rend `not_your_line` sinon). Ce qu'elle ne livre pas : composer,
ajouter, retirer, restreindre.

⚠️ `keel_household_join` a été recorrigée dans la migration
`20260810120000` pour seeder `first_name` — lis-la avant de la réécrire.

### Lot 5 — les envies, version maître

**Décidé.** `household_envy_submissions` **survit** avec son ancrage
`week_start` (sans lui, on sert des envies vieilles de six semaines) ; écriture
réservée au maître ; `mergeEnvies` et la carte « qui a parlé, qui s'est tu »
partent. ⚠️ Contrairement aux fonctions mortes du lot 2, `mergeEnvies` est
**appelée pour de vrai** (`household_meal_generation.ts:135`) : ce lot retire du
code d'un chemin vivant.

### Lot 8 — les résidus (vagues de courses)

**Décidé.** Le backend `_shared/keel/grocery_waves.ts` devient la source, le
front consomme. Motif : toutes les surfaces envisagées (PDF du frigo, liste
partageable sans compte, widget) sont **hors navigateur**. La copie front
`api/groceryWaves.ts:31` (`MAX_FRIDGE_DAYS = 3` en dur) part.

**Sous-décision recommandée** : vagues calculées à la lecture, pas stockées —
`cook_on` et la liste de courses sont déjà dans la ligne du plan, et un
troisième état serait un état de plus à invalider.

⚠️ Le consommateur `KitchenToday.tsx` est **non commité** (autre session).
Touche-le avec précaution et dis ce que tu as changé.

### Lot 7 — Stripe (la seconde moitié)

Le plafond de 8 est **déjà livré en base**. Reste : entitlement foyer 12,99 €,
et **+2 €/mois par profil réclamé sur l'abonnement du MAÎTRE** (décidé :
une seule carte). `stripe-reconcile-seats` sait déjà pousser une **quantité**
sur un item d'abonnement (`:27,54,230`), sans proration, avec idempotence.
Vérifié : **zéro occurrence de `household`** dans `stripe-*` et
`_shared/billing-tier.ts` aujourd'hui.

⚠️ Ce lot est **détachable** : s'il coince, tu livres tout le reste et tu le
dis. Une décision commerciale réversible ne doit jamais bloquer le chantier.

### Lot 9 — les documents

`docs/fonctionnalites/le-foyer/README.md` : la **direction du domaine**, sur le
modèle de `docs/fonctionnalites/conversation/README.md`. Puis les fiches, une
par fonctionnalité retouchée — identifiants libres à partir de **FF-032**
(FF-031 est le dernier pris ; FF-042 est réservé dans le template). Vérifie
avant d'attribuer : `grep -rho 'FF-[0-9]\{3\}' docs/ | sort -u`

---

## Ce que tu fais entre deux lots

Ne fais pas confiance au rapport. Pour chaque lot, **toi**, tu :

1. `git status --porcelain` — rien d'étranger n'a bougé ?
2. `cd frontend && npx tsc -b` — propre ?
3. La suite deno purgée sur `supabase/functions/_shared/keel/` — verte ?
   (baseline : **1750 tests** après le lot 1+2+3)
4. `npx vitest run` — seuls les 2 rouges connus du garde de couverture ?
5. Le test RLS SQL — **36 assertions**, aucun FAIL ?
6. `grep` sur ce que le sous-agent prétend avoir supprimé : est-ce vraiment
   parti, et sans appelant orphelin ?
7. `docker restart supabase_edge_runtime_Sophia_2` si du code edge a bougé.
8. Stage fichier par fichier, commit, puis lot suivant.

Si une vérification échoue : **tu ne commites pas**. Tu renvoies le sous-agent
avec le constat précis (`SendMessage` sur son id garde son contexte), ou tu
corriges toi-même si c'est une ligne.

## Quand tu t'arrêtes et tu demandes

- Une commande bloquée par le hook est nécessaire → donne-la à l'humain.
- Une décision produit non tranchée apparaît → pose la question, ne devine pas.
- Un lot casse un chemin que tu ne peux pas réparer sans élargir le périmètre →
  livre le reste, dis ce que tu laisses et pourquoi.

## À la fin

Mets `docs/keel/CHANTIER-FOYER-PROFILS.md` à jour (chaque lot livré porte son
état et ses preuves), et rends un récapitulatif court : ce qui est livré, ce qui
ne l'est pas, ce qui reste à déployer, et les commandes exactes que l'humain
doit lancer lui-même.
