# Journal de nuit — chantier FOYER

Branche : `chantier-foyer` (depuis `main`, commit de départ à consigner ci-dessous).
Plan : `~/.claude/plans/bon-tu-veux-pas-reflective-nova.md`
Autorité produit : `docs/keel/PIVOT-FOYER.md`

Règle du journal : **rien d'affirmé sans trace**. Chaque phase consigne son verdict et la
commande qui le prouve. Un échec est écrit ÉCHOUÉE, jamais masqué.

---

## État de départ

- Fichiers tenus par une AUTRE session active, interdits de modification :
  `schema.sql`, `docs/keel/{CONTRACT,LEGAL,MODEL,PHOTO_QUANTIFICATION,VALEUR-COACH}.md`,
  `docs/keel/CALORIE_REVERSAL.md`,
  `supabase/functions/_shared/keel/{meal_analysis,meal_stretch,planned_dish_io}.ts`,
  `frontend/src/keel/api/mealStretch.ts`.
- Base locale PARTAGÉE : aucun `db reset`. Migrations par `docker exec … psql`.
  Fixtures préfixées `nightfoyer_`, nettoyées en fin de phase.

---

## Phase 0 — Audit de PIVOT-FOYER.md

Début : (en cours)
**Phase 0 — TERMINÉE.** Commit `19e01bd1`.
- `docs/keel/PIVOT-FOYER.md` réécrit: 14 sections + annexe, sommaire, préambule
  portant les deux décisions.
- Ajouts de fond: §7.8 la douve (graphe du foyer), §10.6 nature du marché + 3
  hypothèses, annexe concurrentielle datée, §10.4 encadré « le canal coach n'est
  pas un désert », §2 « méthode ≠ coach ». §5 « l'entrée est à 1 » promue.
- Vérif: `grep -o '§[0-9.]*'` → 21 renvois distincts, tous résolus.
  `grep '^## '` → numérotation continue 1..14 + annexe.
- Mémoire `pivot-foyer-b2c-first.md` complétée (douve, test n°1, canal occupé).

## Phase 1 — Le foyer en base

**TERMINÉE.** Migration `20260808000000_household_foundation.sql`, appliquée en
local par psql, version enregistrée dans `supabase_migrations.schema_migrations`.
Test `_shared/keel/household_rls_test.sql` : **35 PASS, 0 FAIL**, transaction
annulée (base partagée vérifiée intacte après coup : 0 foyer, 0 user résiduel).

### ⚠️ DÉFAUT RÉEL TROUVÉ ET CORRIGÉ — privilèges `authenticated`

Trouvé en creusant un faux rouge (l'assertion 10 attendait que l'UPDATE LÈVE ;
il ne levait pas, il touchait zéro ligne).

MESURÉ : `alter default privileges` de Supabase accorde **les sept privilèges**
à `authenticated` sur chaque table neuve de `public`. Un `grant select` posé
ensuite n'enlève rien. La première rédaction de la migration ne révoquait que
`from public, anon` — donc `authenticated` gardait INSERT/UPDATE/DELETE/TRUNCATE.

Pourquoi ça compte : **TRUNCATE n'est pas soumis à RLS**. Mesuré en conditions
réelles — un compte connecté a vidé `household_envy_submissions`. Corrigé
(`revoke ... from public, anon, authenticated` PUIS `grant select`), appliqué en
local, et pinné par les assertions 10b/10c.

PORTÉE DU DÉPÔT, mesurée : **126 tables publiques sur 136** donnent TRUNCATE à
`authenticated`. Hors périmètre de la nuit → tâche de fond proposée à
l'utilisateur (`task_d45376e7`). Nuance à ne pas perdre : PostgREST n'expose pas
de verbe TRUNCATE, donc le chemin d'exploitation réel reste à établir — c'est
un défaut de défense en profondeur tant que ce chemin n'est pas trouvé.

### Contrainte découverte, à honorer en Phase 3

`student_generated_meals_one_live_start_idx` = UNIQUE sur `(user_id, starts_on)`
where `retired_at is null`. Une personne n'a qu'UNE composition vivante par jour
de départ. Donc une composition de FOYER qui démarre le même jour qu'une
composition perso doit **retirer** l'ancienne, jamais s'ajouter à côté.
Constaté aussi : **personne n'écrit `retired_at` aujourd'hui** (trois lecteurs,
zéro écrivain) — le chemin d'écriture est soit dans le travail non commité de
l'autre session (`planned_dish_io.ts`, `mealStretch.ts` sont modifiés chez eux),
soit pas encore construit. Ne pas y toucher ; le générateur foyer retire
lui-même, explicitement.

## Phase 2 — Les modules purs du foyer

**TERMINÉE.** Quatre modules + 54 tests, tous verts. Suite `_shared/` complète :
**1955 passed, 0 failed, 18 ignored** (21 s). `deno check` propre sur les quatre.

- `household.ts` (14 tests) — `canRestrict` rend un MOTIF, pas un booléen (une
  policy RLS ne dit jamais POURQUOI, et l'écran doit le dire). L'ordre des refus
  n'est pas arbitraire : le mode du foyer passe en premier, sinon une colocation
  s'entend dire « tu n'es pas le compte maître » et va chercher un pouvoir qui
  n'existe pas chez elle. Réutilise `BirthDateVerdict` de `student_age.ts` —
  jamais un `isMinor` recalculé.
- `household_portions.ts` (20 tests) — la bifurcation. `buildPortionBrief`
  produit des directions de service DIFFÉRENTES par objectif sur la MÊME
  cuisson, et interdit explicitement au modèle de proposer deux plats.
  `sanitizePortionNote` réutilise `forbidden_matcher.ts` avec
  `allowNegatedMentions: false` — la lecture absolue, parce qu'ici on n'interdit
  pas d'ENCOURAGER le sujet mais de l'ÉVOQUER devant toute la table.
  Réconciliation à trois traitements : membre manquant → complété (ne jamais
  perdre la cuisson du samedi pour une consigne absente) ; membre fantôme →
  jeté ; consigne fautive → null + tracée.
- `household_envies.ts` (10 tests) — le silence est une réponse valide, et le
  bloc le DIT au modèle (« never wait for them, never invent a request »).
  Les envies contradictoires partent toutes les deux ; l'arbitrage appartient au
  générateur, avec obligation de le dire. Troncature d'un foyer démesuré
  ANNONCÉE, jamais muette.
- `grocery_waves.ts` (10 tests) — les vagues déduites de `cook_on` +
  `MAX_FRIDGE_DAYS` **importée** de `meal_generation.ts`, pas recopiée.
  Propriété centrale testée : **rien ne disparaît** (total conservé), un terme
  non rattaché part en première vague. `frozen` volontairement hors des rayons
  périssables, `produce` volontairement dedans — les deux choix sont pinnés.

## Phase 3 — generate-household-meal-v1

**TERMINÉE.** Suite `_shared/` : **1975 passed, 0 failed**. `deno check` propre.
`tsc -b` propre. Garde de couverture mise à jour et verte.

### Ce qui a été construit
- `20260808001000_meal_plan_write_household.sql` — `write_student_meal_plan`
  étendue **additivement** (deux clés optionnelles). Vérifié en base : l'ancien
  appelant écrit `hh=NULL mp=[]`, exactement comme avant.
  Raison : un insert direct heurterait `student_generated_meals_one_live_start_idx`
  au premier usage réel, et réimplémenter la troncature dupliquerait la partie
  délicate.
- `_shared/keel/household_meal_generation.ts` (11 tests) — les trois blocs
  greffés au prompt. Les règles de maison passent **en dernier**, après les
  envies : ce sont elles qui doivent survivre à une envie contradictoire.
- `generate-household-meal-v1/index.ts` — owner only, objectif lu pour les
  majeurs **seulement** (filtre sur la requête, pas sur son résultat), union
  des contraintes de sécurité du foyer, écriture par la RPC partagée.

### ⚠️ DÉFAUT RÉEL TROUVÉ PAR LE RUN RÉEL — la règle de maison commentée

Premier run réel, restriction « nutella » sur l'enfant. Le plat était
**parfaitement conforme** — aucun nutella nulle part — et le modèle l'a justifié :

> « Honore la demande de pâtes de Lea avec une sauce protéinée, **sans Nutella**. »

La substance était juste ; le texte annonce à l'enfant que sa demande a été
refusée et l'attribue **au plan** plutôt qu'à son parent. C'est exactement le
mensonge que PIVOT-FOYER §8.5 règle 4 interdit. Le prompt l'interdisait déjà en
toutes lettres — **une consigne de prompt régresse en réel**.

Correctif : `_shared/keel/household_restriction_lock.ts` (9 tests), verrou
déterministe à **deux lectures** :
- la SUBSTANCE (ingrédients, méthode), négation TOLÉRÉE → violation, on refuse ;
- le COMMENTAIRE (titre, pourquoi), négation REFUSÉE → on efface le `why`, on trace.
Le test pinne la **phrase réelle qui a fui**, mot pour mot.

### Deux autres bugs corrigés avant livraison
- **`as any` sur un type étranger** : la première union des contraintes de
  sécurité traitait `loadStudentSafetyConstraints` comme un objet portant
  `.constraints`. Elle rend un TABLEAU. Le cast désarmait le typecheck qui
  l'aurait dit (leçon `as-cast-on-foreign-type-disarms-typecheck`, commise à
  nouveau). Et le `catch` silencieux devenait ici bien pire que sur le chemin
  individuel : il aurait retiré le verrou d'allergène à TOUT le foyer, enfants
  compris. On refuse la composition (503) au lieu de cuisiner sans ceinture.

### Contre-épreuves du run réel (2e passe, verrou câblé)
```
✓ aucun objectif lu pour un mineur (lecture filtrée en amont)
✓ aucune consigne ne porte de raison ni de vocabulaire de corps
✓ l'enfant a une consigne : « Portion adaptée à un enfant… »
✓ l'aliment restreint n'apparaît nulle part dans les plats
✓ les consignes DIVERGENT (3 distinctes pour 3 membres)
✓ la RPC refuse nommément `plan_overlaps_existing` sur un doublon de fenêtre
```
Ligne relue en base au 1er run : `household_id` posé, `member_portions` à trois
membres avec des consignes distinctes, `silent` tracé.

### ⚠️ Ce qui N'A PAS été exercé, et pourquoi
Le run réel passe par les **modules réels, la vraie base et un vrai appel
modèle**, mais **pas par le routeur HTTP**. Le runtime edge lit
`FUNCTIONS_CONFIG_STRING`, une liste **figée à la création du conteneur** :
servir une fonction neuve exige de recréer la pile, ce qui couperait la session
voisine qui partage cette base. Non exercé : l'enveloppe HTTP/CORS/JWT — recopiée
mot pour mot de `generate-meal-v1`. À rejouer par HTTP après un
`npx supabase stop && npx supabase start` fait par l'utilisateur.

Fixture `f0ed1111…` entièrement nettoyée (0 user, 0 foyer, 0 repas résiduels).

## Phases 4 & 5 — API et écrans

**TERMINÉES.**
- `frontend/src/keel/api/household.ts` (19 tests) — `restrictionBlock` rend un
  MOTIF ; `isMinorBirthDate` est le 3e jumeau de la règle mineur (avec la base
  et `student_age.ts`), et les trois sont testés séparément.
- `HouseholdPage.tsx` + route `/app/household` + entrée de nav + clés i18n.
- **Vérifié au navigateur** : connexion réelle d'un élève, création réelle d'un
  foyer par la RPC, les cinq cartes rendues, zéro erreur console.
- Ça a trouvé un défaut de copie : « Add a food » affiché deux fois (le libellé
  du sélecteur et le bouton partageaient une clé). Corrigé.
- **320 px MESURÉ** (`scrollWidth > innerWidth` → false), pas regardé.
- Piège d'outillage à retenir : les clics `computer` en coordonnées de CAPTURE
  (800 px) ne tombent pas sur un viewport de 1280 px. Passer par les `ref`.
  Et `form_input` remplit le DOM sans réveiller l'état React d'un input
  contrôlé — le bouton restait fermé. Seul le clic par `ref` + `type` marche.

## Phase 6 — La couture de vérité

**TERMINÉE.**
- `following_io.ts` : source `household_meals` ajoutée, ADDITIVE. Sans elle, un
  membre non-maître n'a AUCUNE ligne à son nom et aurait été écarté du tap du
  soir en silence — le défaut d'origine de ce module, reproduit sur du neuf.
  4 tests neufs ; les 2 tests d'ordre existants mis à jour (l'ordre est une
  propriété : le compte maître ne paie jamais la lecture du foyer).
- **La coche est DÉJÀ compatible — vérifié, pas supposé.** `mealTicks.ts` écrit
  dans `protocol_events`, clé sur `user_id`, policy `auth.uid() = user_id`.
  Chaque membre coche ses propres lignes ; rien à changer.

---

# RÉCAPITULATIF DE NUIT

**7 commits sur `chantier-foyer`, aucun push.**

| Vérification | Résultat |
|---|---|
| Suite Deno `_shared/` + `sophia-brain/` | 3167 passed, **1 failed** (préexistant, voir ci-dessous) |
| Suite frontend | 478 passed, 0 failed |
| `tsc -b` | propre |
| RLS foyer (psql) | 35 PASS, 0 FAIL |
| Fichiers de l'autre session touchés | **aucun** |
| Migrations enregistrées | 20260808000000, 20260808001000 |
| Fixtures résiduelles | 0 foyer, 0 membre, 0 user `nightfoyer` |

## Le rouge, et pourquoi il n'est pas de cette nuit
`sophia-brain/router/run_keel_conversation_loop_test.ts` échoue. **Prouvé
préexistant** : `git stash -u` puis relance → même échec sans aucun de mes
changements. Le mot « following » n'apparaît pas une seule fois dans ce test ni
dans son module. Non corrigé : ce n'est pas le chantier de cette nuit.

## Ce qui reste à faire, et qui le fait

**L'utilisateur, parce que je ne peux pas :**
```
npx supabase db push                 # 2 migrations
npm run functions:deploy:changed     # generate-household-meal-v1
```
Puis, pour exercer le routeur HTTP en local (voir §Phase 3) :
```
npx supabase stop && npx supabase start
```

**Chantiers de jour, exclus exprès du plan :**
- La **UX du conseil de famille** (récolte asynchrone, validation
  collective/individuelle, « Sophia explique pourquoi » en ligne).
- Les **vagues de courses à l'écran** : `grocery_waves.ts` existe et est testé
  côté serveur, mais **aucune surface ne le rend encore**. Le module miroir
  frontend et l'affichage restent à faire.
- La **composition foyer depuis `/app/meals`** : la fonction existe, l'API
  frontend aussi (`generateHouseholdMeal`), mais aucun bouton ne l'appelle.
- Panier externe, tarification foyer, livraison proactive.
