# Lot C — un seul magasin de préférences, et le chat se ferme

**Autorité** : `docs/keel/NOMENCLATURE-MEMOIRE.md` §2.1 (deux sources), §2.2 ① (les
préférences), §2.6 (ce qui se ferme) · **Prompt maître** §6 · **Arbitrages** C1 α, C2
(séquencer), C4 (migrations `20260903180000`+).

## Ce que le lot ferme, en une phrase

« Tom n'aime pas le poisson » a aujourd'hui **trois lits** — `household_food_restrictions`
(une table de RÈGLE, avec un verrou de censure), `food_preferences` (le magasin plat du
chat), `retained_items` (le magasin structuré) — et deux d'entre eux mentent sur ce
qu'ils portent. Après ce lot il en a **un**.

## C1 · Le pont plat ne va plus nulle part (serveur)

**Mesure d'entrée**, comptée avant : `grep -c "memory_items\|food_preference_promotion_io"`
sur les deux générateurs, commentaires retirés.

- `generate-meal-v1` : `readFoodPreferences` ne prend plus qu'un argument et ne rend que
  les lignes STRUCTURÉES. `readFlatFoodPreferences`, `reconcileFoodPreferencesFor`,
  `persistReconciledFoodPreferences`, `foodPreferencesForPrompt` : partis.
- `generate-household-meal-v1` : idem, plus `loadHouseholdVoices`. Les voix du foyer ne
  portent plus que les items structurés du composeur.
- **Deux modules meurent, et c'est vérifié avant** (`grep` sur `supabase/` + `frontend/src`,
  commentaires retirés, zéro appelant vivant) :
  - `_shared/keel/household_voices_io.ts` (209 l.) + son test ;
  - `_shared/keel/food_preference_promotion_io.ts` (455 l.) + son test — ses **cinq**
    exports n'ont plus d'appelant.
  ⚠️ Les RPC SQL qu'ils appelaient restent en base : on retire l'appelant, pas le passé.

**Ce que la suppression coûte, écrit ici** : `persistReconciledFoodPreferences` était le
seul écrivain qui **élaguait** une préférence plate périmée. Le magasin `food_preferences`
devient une **archive gelée** : plus personne n'y écrit, plus personne ne l'élague, et la
carte le rend en lecture seule (« Anciennes notes », lot D). C'est voulu — un magasin
qu'on ferme et qu'on continue d'élaguer est un magasin qu'on n'a pas fermé.

**Les gardes qui scannaient les deux modules morts** (`household_voices_test.ts` ×4,
`meal_plan_integrity_test.ts` ×1) ne sont pas supprimées : elles **changent de cible**.
Une garde retirée avec son module est une propriété qu'on cesse de tenir sans le dire.
Elles deviennent : « aucun générateur ne nomme le magasin plat », avec le cas qui passe
(les items structurés arrivent bien).

## C2 · Le dialogue du foyer écrit une préférence, pas une règle

`MouthFormDialog::DislikeFields` → `mouthProfile.ts` → `writers.addRestriction` →
`household_food_restrictions`. **C'est la faute** : ce champ demande « ce qu'il n'aime
pas » et écrit dans la table dont `household_restriction_lock.ts` **censure le
« pourquoi »** des plats. Un dégoût déclaré par la personne elle-même devient une décision
domestique qu'il faut cacher.

- Le champ écrit `food.exclude` `subject=member:<uuid>` `source=written` dans
  `retained_items`. ✅ Vérifié : `canProduce("written", …)` rend `true` pour toute famille,
  et `keel_write_retained_items` écrit sur la ligne de l'APPELANT avec le sujet en donnée
  — donc **aucune migration** n'est nécessaire pour le sujet membre.
- ✅ Vérifié aussi : la ceinture par bouche est déjà armée (`exclusionTermsFor` filtre sur
  `item.subject`, déplie les mots de catégorie dans un seul sens), donc le lot branche un
  écrivain sur un lecteur qui existe — pas l'inverse.
- **Deux appelants**, pas un : le dialogue du foyer ET l'entonnoir (`SetupPage`, deux
  sites). Les deux passent par la même porte.
- La **restriction parentale** garde sa table, son verrou et ses tests : elle change de
  nom (« Interdit dans ce foyer ») et n'est proposée qu'en **mode famille sur un mineur**.
- ⏸ Les lignes locales de `household_food_restrictions` : aucune migration de données.
  Le sens (goût ou interdit) n'est pas déductible d'un `label`. Requête de liste au rapport.

## C3 · `/app/plan` ne demande plus de ranger le chat

`FoodPreferencesCard` démonté de `StudentWeekPlanPage`. Son API (`api/foodPreferences.ts`)
reste : le lot D la relit en archive.

## C4 · `rhythm.set` / `logistics.set`

Plus aucun écrivain (M5 a fermé les deux cellules côté `questionnaire` et `draft_note`).
Le lecteur reste **un cycle**, avec un compteur `served` journalisé. S'il rend 0 sur la
campagne finale, il part, et le rapport le nomme.

## Ce que le lot C ne fait pas
- La carte « Ce que Sophia sait » : lot D.
- `promote-candidate-memory-items` et le memorizer : hors périmètre, intacts.
- Le magasin `food_preferences` en base : pas de purge, pas de migration.
