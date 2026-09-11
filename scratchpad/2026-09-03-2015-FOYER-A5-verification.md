# FOYER · A5 — la page Foyer — VÉRIFICATION (rejeu, aucun rapport cru)

**Date** 2026-09-03, 20:15 · **Vérificateur** worktree `/Users/ahmedamara/Dev/Sophia-2-chantiers/VERIF`,
détaché sur le HEAD de l'arbre principal `c7f7d2fe` · **Périmètre** les 13 commits de A5,
`694a616f` (exclu) → `22cad593` (inclus) · **Base d'antériorité** `31ee930f`.

> Journal écrit au fil de l'eau. Aucun mot de passe entré, aucun jeton forgé, aucune écriture en base.

---

## 0. Poste

- `git status --short` du worktree VERIF : **propre**. `git checkout --detach c7f7d2fe` → OK.
- `node_modules` et `frontend/node_modules` : **liens** vers l'arbre principal (vérifié `ls -la`).
- `frontend/.env.local` : présent (327 o).
- `22cad593` est bien **ancêtre de HEAD** (`git merge-base --is-ancestor` → 0). La fusion a eu lieu.
- Disque : 4,6 Gi libres. **Aucun worktree ouvert.**

---

## 1. Statique

### 1.1 Les 13 commits

```
22cad593 journal A5 complet, et la fixture du tag qa0903f jouée pour de vrai
c1932a9b le rythme et ce que sophia a retenu rejoignent la fiche de son propre compte
8427bb80 i18n chantier-0903/FOYER (A5, la fenêtre d'ajout)
944d42df ajouter quelqu'un tient dans une seule fenêtre, et le plafond ne s'écrit qu'une fois
9c0108da un membre réclamé édite sa ligne, et la dette d'A6 est payée avec
de7a01d9 i18n chantier-0903/FOYER (A5, l'accès depuis la ligne)
8e09129b l'accès se lit et se donne depuis la ligne de la personne
7e05bf5d i18n chantier-0903/FOYER (A5, paramètres du foyer)
a3984c96 les deux faits de maison quittent un entonnoir que personne ne rejoue
49b55705 journal A5 : le lot 2, ses trois mutations, et ce que la lettre du mandat coûterait
da9f91e2 i18n chantier-0903/FOYER (A5, cadres de la fiche)
c4aa7197 la fiche d'une bouche a deux cadres nommés, et chacun attend sa lecture
7f8c02f5 l'étape 2 monte la fiche du foyer, et il ne reste qu'un formulaire de personne
```
`git rev-list --count` = **13**. ✅ conforme à l'annonce.

### 1.2 `tsc -b --force`

`cd frontend && npx tsc -b --force` → **exit 0**. ✅ PROUVÉ.

_(suite écrite au fil des mesures)_

### 1.3 vitest, suite ENTIÈRE

`cd frontend && npx vitest run` → **2 130 verts / 2 155** (`5 failed | 20 skipped`, 133 fichiers).

Les 5 rouges, nommés :

| Rouge | Propriétaire | Preuve d'antériorité |
|---|---|---|
| `coverage-guard` › Edge Functions | étranger, nominatif dans `scripts/.vitest-red-baseline` | baseline |
| `coverage-guard` › DB triggers | idem | baseline |
| `household.int.test.ts › awayFrom` ×2 | idem | baseline |
| **`onboarding.int.test.ts › le catalogue des questions › résout chaque consommateur sur le disque`** | ⚠️ **PAS A5, et PAS le `mealBoxes` annoncé** | mesuré ci-dessous |

⚠️ **Le 5e rouge n'est pas celui que le journal annonce**, et il n'est pas non plus le
`mealBoxes` que l'orchestrateur me disait réparé. C'est un rouge **neuf**, et je l'ai attribué :

- Le consommateur cassé est `supabase/functions/_shared/keel/food_preference_promotion_io.ts#reconcileFoodPreferencesFor`
  (cité par `onboarding.ts:609-610`, question `food_preferences`).
- `git cat-file -e <sha>:<chemin>` : le fichier est **PRÉSENT** à `31ee930f`, à `694a616f`
  (base A5) **et à `22cad593` (pointe A5)** ; il est **ABSENT** à `c7f7d2fe` (HEAD).
- `git log --diff-filter=D` : il est supprimé par **`089f7fdf`** — *« orchestration : le disque
  plein, A1 vert, et le meme defaut de champ requis chez A8.1 »*, `2026-09-03 18:28`, **hors des
  13 commits d'A5** (`git log 694a616f..22cad593 | grep -c 089f7fdf` → 0), et **non ancêtre**
  de `694a616f`.
- A5 ne touche **aucun** fichier sous `supabase/` : `git diff --name-only 694a616f..22cad593 -- supabase/`
  est **vide**. ⇒ Deno **non lancé**, conformément au mandat.

✅ **PROUVÉ : ce 5e rouge n'appartient pas à A5.** Il appartient à l'orchestration (`089f7fdf`),
qui a supprimé un module encore cité par le catalogue des questions.

### 1.4 `tsc -p tsconfig.test.json --noEmit` — A5 n'ajoute AUCUNE erreur

Mesure faite en détachant **mon propre worktree** sur la base puis sur la pointe d'A5 (aucun
worktree ouvert) :

| Arbre | Fichiers en erreur | Erreurs |
|---|---|---|
| `694a616f` (base A5) | 28 | **93** |
| `22cad593` (pointe A5) | 28 | **93** |
| `diff` par fichier | **VIDE** | — |

✅ **PROUVÉ : A5 n'ajoute pas une seule erreur de type de test.** `setupSituateStep` (3) et
`mouthFormDialog` (2) restent **exactement** à leur ligne de `scripts/.tsc-test-red-baseline`,
et `setupMouthsStep` reste à **0**.

À HEAD l'arbre en porte **110**. Le delta de **+17** par rapport à la pointe d'A5 est exactement,
et uniquement, la lignée A8.1 que l'orchestrateur me dit d'ignorer :

```
+ householdFlatLists.int.test.ts  2   (absent à 22cad593)
+ dishListByDay.int.test.ts       8   (absent à 22cad593)
  planByPersonModel.int.test.ts   6 → 13
```

### 1.5 Périmètre du diff — 22 fichiers, tous dans le mandat

`SetupPage.tsx` · `HouseholdPage.tsx` · `MouthFormDialog.tsx` · `TableStepPlanning.tsx` (supprimé)
· `api/household.ts` · `api/practicalConstraints.ts` · `lib/mouthForm.ts` · 9 fichiers de test ·
`i18n/{en,fr,catalog}.ts` · `docs/keel/qa-fixtures/40-foyer-a5.sql` · le journal.
**Aucun fichier hors mandat.** ✅

⚠️ **À nommer, pas un défaut de ce lot** : la règle §2.2 n°19 du MASTER PROMPT dit qu'une lane
« **ne commite pas** `en.ts`/`fr.ts`/`catalog.ts` dans ses lots ». A5 les commite, en 4 commits
i18n séparés (`da9f91e2`, `7e05bf5d`, `de7a01d9`, `8427bb80`). Mon mandat de vérification les
autorise explicitement (« les fichiers du mandat §5.4 **+ i18n** ») : la consigne a donc changé
en cours de chantier. Je le **nomme** sans le compter contre A5.

### 1.6 i18n — 15 clés, 1 valeur, `offer` déclaré, aucun mojibake

- **15 clés ajoutées**, identiques dans les deux packs (`household.access.{claimed,copied,copy,invite,invited,mail,mail_subject,resend}`,
  `household.add.open`, `household.member.{frame_identity,frame_identity_hint,frame_preferences,frame_preferences_hint}`,
  `household.mouth.frame_loading`, `household.settings.title`). ✅ conforme à l'annonce.
- **1 valeur changée**, la clé gardée : `setup.traditions.title` → « Les repas traditions » /
  « Tradition meals » (fr:2923, en:5060). ✅
- **Toutes les 15 sont DANS le bloc délimité** `// ── chantier-0903/FOYER — début/fin ──`
  (fr 6868-6930, en 8012-8065) : mesuré ligne par ligne. ✅
- `catalog.ts` déclare **`offer`** sur `/app/household` (:563). ✅
- **L'incident des échappements est bien réparé** : `git diff 694a616f..22cad593 -- en.ts` ne
  porte **qu'une seule ligne `-`**, et c'est le `setup.traditions.title` légitime. Les six lignes
  de commentaire de `en.ts:5804-5808` sont **toujours en `\uXXXX`**, c'est-à-dire dans leur état
  d'origine. ✅ **Aveu vérifié, et vrai.**
- **Mojibake** : aucun. `grep -P "Ã.|â€|Â\S|ï¿½"` ne ramène que des majuscules accentuées
  légitimes (`CÂBLÉ`, `Âge`). `iconv -f UTF-8 -t UTF-8` passe sur les deux packs.

---

## 2. Les trois écarts assumés — motif VÉRIFIÉ ou DÉMENTI

### 2.1 Écart (a) — les cadres montent les contrôles existants, pas `MouthCoreFields`/`MouthPreferencesFields`

**Motif du bâtisseur** : `persistMouth` n'a **aucun écrivain pour RETIRER une allergie**.

✅ **MOTIF VÉRIFIÉ, et vérifié dans les quatre directions :**

1. `api/mouthProfile.ts:631-632` — `MouthWriters` ne porte que
   `addAllergy: (memberId, label)` et `addRestriction: (memberId, label)`. **Aucun `remove*`.**
   `grep -E "remove_allergy|removeAllergy|remove_restriction"` sur `api/mouthProfile.ts` : **zéro**.
2. `api/mouthProfile.ts:851-856` — `persistMouth` **boucle en AJOUT** sur `mouth.allergies` et
   `mouth.dislikes`, et son propre pavé (`:848-850`) le dit : « les allergies et les dégoûts
   s'ajoutent, ils ne remplacent pas ».
3. Le retrait **existe ailleurs et par un autre chemin** : `api/household.ts:1549 removeAllergy(id)`
   → `keel_household_remove_allergy(p_id uuid)` (migration `20260810170000`, ligne 237). Il prend
   **l'id de la LIGNE d'allergie**, pas `(memberId, label)` : il n'est pas branchable dans
   `MouthWriters` sans changer la forme du port. `MemberRow` s'en sert bien aujourd'hui
   (`HouseholdPage.tsx:961 onRemoveAllergy={(id) => run(() => removeAllergy(id))}`). **Le bouton
   « retirer » par allergie existe donc réellement, et il serait réellement perdu.**
4. Le second membre du motif tient aussi : `setHabits(memberId, slots, note)`
   (`mouthProfile.ts:598-602`) prend la **liste complète** — c'est un remplacement ;
   `setTarget(memberId, targetWeightKg|null, paceKgPerWeek|null)` (`:563-567`) **efface à
   `(null, null)`**.
5. Et la sortie de secours qu'il annonce est vraie : `loadMemberTargets` (`mouthProfile.ts:918`) et
   `loadMemberBirthDates` (`household.ts:2118`) ne sont importés que par **`SetupPage.tsx`**
   (`:31`, `:149`). `HouseholdPage.tsx` ne les lit **pas**. Monter `MouthCoreFields` sur une bouche
   existante **effacerait sa cible au premier Enregistrer** — exactement l'interdit du mandat.

### 2.2 Écart (b) — `KnownAboutYouCard` non montée, `known` non déclaré

**Motif du bâtisseur** : « quatre lectures que la page ne fait pas — `store`, `members`, `roster`,
`today` — plus son écrivain ».

✅ **CONCLUSION VÉRIFIÉE** — ⚠️ **mais le compte est faux, et il SOUS-ESTIME le coût.**

`KnownAboutYouCardProps` (`components/KnownAboutYouCard.tsx:230-272`) réclame **six données** et
**trois écrivains** :

| Prop | `/app/household` la lit-elle ? |
|---|---|
| `store: KnownStore` | ❌ non (`grep KnownStore\|loadKnown\|retainedItems` sur `HouseholdPage.tsx` : **zéro**) |
| `members: ReadonlyMap<string,string>` | ❌ non sous cette forme |
| `roster: readonly PortionAdjustMember[]` | ❌ non (`PortionAdjustMember` absent du fichier) |
| `today: string` | ✅ **oui** — la page porte `weekStart`, passé partout en `todayLocalIso` |
| `fieldChanges: readonly FieldChange[]` | ❌ non — **non nommé par le motif** |
| `memo: readonly MemoLine[]` | ❌ non — **non nommé par le motif** |
| `onSave` · `onRemoveMemoLine` · `onUndoFieldChange` | ❌ trois écrivains, pas un |

**Le motif reste juste** (au moins `store` manque, donc la monter serait bien « un cadre monté sur
une lecture non faite »), mais sa formulation est inexacte dans les deux sens : `today` est **déjà
là**, et deux lectures + deux écrivains de plus sont **passés sous silence**. Ce n'est pas une
excuse fausse ; c'est un chiffre approximatif dans un journal qui, partout ailleurs, compte juste.

### 2.3 Écart (c) — `SelfStep` reste à part

**Motif du bâtisseur** : les bornes de `profiles` (90-250, 25-400) diffèrent de celles d'une bouche
(30-260, 2-400).

✅ **LES DEUX JEUX SONT DANS LE CODE, ET LA BASE LES CONFIRME :**

| Jeu | Taille | Poids | Où |
|---|---|---|---|
| titulaire (`SelfStep`) | `min={90} max={250}` | `min={25} max={400}` | `SetupPage.tsx:4412-4413, 4428-4429` |
| bouche (`MouthCoreFields`) | `min={30} max={260}` | `min={2} max={400}` | `MouthFormDialog.tsx:891-892, 905-906` |
| **la base** | `p_height_cm < 30 or > 260` | `p_weight_kg < 2 or > 400` | `20260812220000_household_member_body_and_reference.sql:273, 276` |

❌ **MAIS LE « CAS QUI PASSE » NE LES MESURE PAS TOUS LES DEUX — voir DÉFAUT 2.**
`setupMouthsStep.int.test.ts:707-712` ne tient que la **taille** :

```
expect(selfHtml()).toMatch(/min="90"[\s\S]*max="250"/);
expect(html()).toMatch(/min="30"[\s\S]*max="260"/);
```

Les bornes de **poids** — `25` contre `2`, celles que le motif invoque pour dire « une bouche peut
être un enfant de trois ans » — ne sont **jamais assertées**. Le seul nombre qui dise vraiment
« enfant » n'est pas gardé.

---

## 3. Les mutations — neuf jouées, neuf rouges vus, neuf restaurations prouvées par `cmp`

Les trois obligatoires du mandat de vérification sont les nᵒˢ **1, 2a, 3**.

| # | Mutation (commande) | Rouge vu (nom du cas) | Restauration |
|---|---|---|---|
| **1** *(obligatoire)* | `SheetFrame` : `!loaded` → `false` (`HouseholdPage.tsx:2574`) | **2** — « `loaded` faux: aucun champ, et une phrase qui dit qu'on lit » · « la garde passe AVANT le contenu, même ouvert » (`memberSheetFrames`, 2 failed / 16 passed) | `cp` + `cmp` OK |
| **2a** *(obligatoire)* | le plafond **lu deux fois** : `const HOUSEHOLD_MAX_MEMBERS = 8;` réintroduite localement, `count >= HOUSEHOLD_MAX_MEMBERS` | **1** — « `HOUSEHOLD_MAX_MEMBERS` n'existe plus » (`addMouthWindow`) | `cp` + `cmp` OK |
| **2b** | `HOUSEHOLD_MAX_MOUTHS = 8` → `9` (`api/onboarding.ts:888`) | **1** — « le plafond annoncé est celui de la base » → `expected 9 to be 8` | `cp` + `cmp` OK |
| **3** *(obligatoire)* | `token_hash` **ajouté à la projection** de `loadLiveInvitations` (`api/household.ts:1395`) | **1** — « la lecture des invitations ne demande pas `token_hash` » (`memberAccess`) | `cp` + `cmp` OK |
| **4** *(=M14)* | le montant **recopié** : `amount: "1,99 €"` au lieu de `formatPrice(PRICES.claimedProfile)` | **1** — « le prix vient de la source unique, jamais d'un littéral » | `cp` + `cmp` OK |
| **5** *(=M17)* | un **second `Modal`** imbriqué autour d'`AddMouthForm` | **1** — « la carte n'ouvre qu'UNE fenêtre » → `expected 2 to be 1` | `cp` + `cmp` OK |
| **6** *(=M8)* | `const [bodies, setBodies] = useState<…\|null>(new Map())` | **1** — « la lecture des corps sait dire qu'elle n'a pas eu lieu » | `cp` + `cmp` OK |
| **7** *(la mienne)* | `loadLiveInvitations` **perd** `.eq("household_id", householdId)` | **1** — le cas `token_hash` porte AUSSI le scope, et il tombe | `cp` + `cmp` OK |
| **8** *(la mienne)* | `MemberAccess` **exclut les mineurs** : `if (member.ageState === "minor") return null;` | **1** — « une bouche mineure garde son bouton d'invitation » → `expected '' to contain 'Invite'` | `cp` + `cmp` OK |

`git status --short` du worktree après les neuf : **vide**. Aucune mutation n'a survécu.

⚠️ Écart de comptage sans conséquence : le journal annonce **2** rouges pour M17 ; ma variante de
la même mutation en produit **1**. Les deux mutations ne sont pas identiques au caractère près.

---

## 4. Ce que le mandat interdisait, relu dans le code

| Interdit §5.4 | Mesure | Verdict |
|---|---|---|
| deux `Modal` imbriqués | `grep -c "<Modal"` : **1** dans `HouseholdPage.tsx` (`:1629`), **1** dans `MouthFormDialog.tsx` (`:515`) ; `AddMouthForm` est un **corps exporté** (`:1681`), pas le chrome | ✅ tenu (mutation 5 le garde) |
| un cadre monté sur une lecture non faite | `SheetFrame` porte `loaded: boolean` requis ; `bodies`/`habits`/`invitations`/`practicalConstraints` sont tous `… \| null` avec `null` = « pas lu » | ✅ tenu (mutations 1, 6) |
| **un montant recopié** | `HouseholdPage.tsx:2443` rend `t("offer.extra", { amount: formatPrice(PRICES.claimedProfile) })`. La chaîne `1,99` n'apparaît qu'**une fois** dans le fichier, `:2322`, **dans un commentaire** qui explique pourquoi ne pas la recopier. Aucun `2,00` / `2.00` nulle part | ✅ tenu (mutation 4) |
| restreindre l'invitation d'une bouche mineure | `MemberAccess` ne teste **jamais** `ageState`. Fixture : **Tom, mineur, invitable**. Cas `memberAccess.int.test.ts:139` | ✅ tenu (mutation 8) |
| toucher `HouseholdMergeCard.tsx:45` | `git diff 694a616f..22cad593 -- …/HouseholdMergeCard.tsx` : **vide** | ✅ intact |

---

## 5. L'invitation (§5.5)

| Exigence | Mesure | Verdict |
|---|---|---|
| trois états **dérivés des faits** | `MemberAccess` (`HouseholdPage.tsx:2340`) : ③ `if (member.userId)` · ② `invitationsLoaded && invitation !== null` · ① sinon. Aucun drapeau, aucune colonne d'état | ✅ |
| le maître ne rend rien | `if (member.role === "owner") return null;` (`:2361`) | ✅ |
| lecture scopée `.eq("household_id")` | `api/household.ts:1396`, plus `.is("consumed_at", null)` et `.gt("expires_at", now)` | ✅ (mutation 7) |
| **jamais `token_hash`** | `.select("member_id, email, created_at, expires_at, consumed_at")` (`:1395`). La colonne existe pourtant bien en base (`token_hash` est la 4ᵉ de `household_invitations`) : l'omission est délibérée, pas fortuite | ✅ (mutation 3) |
| « retirer l'accès » ≠ « retirer » | deux RPC (`detachHouseholdMember` / `removeHouseholdMember`), deux clés (`household.member.detach` « Retirer son accès » / `.remove` « Retirer du foyer »), deux endroits | ✅ |
| détacher offert **une seule fois** | `grep -c 'household.member.detach"'` → **1** (`:2398`) | ✅ |
| aucun envoi d'e-mail | le geste est `mailto:` ; cas « le geste de courrier est un `mailto:`, pas un envoi » | ✅ |

❌ **MAIS** : voir **DÉFAUT 1** — `MemberAccess` ne sait pas **qui regarde**.

---

## 6. Cohérence (C6, C7)

| Invariant | Mesure | Verdict |
|---|---|---|
| **C7** · trois étapes | `funnelSteps(branch)` seule source (`SetupPage.tsx:1123, 1264`) | ✅ |
| **C7** · `canGenerate` seule source du bouton | `SetupPage.tsx:1277, 2965` ; le pavé `:210` le dit | ✅ |
| **C7** · l'étape 2 **et** la fenêtre d'ajout montent le MÊME `MouthCoreFields` | `SetupPage.tsx:4879` et `HouseholdPage.tsx:1707` montent le même composant importé de `MouthFormDialog` | ✅ |
| **C7** · plus de `TableStepPlanning` | fichier **supprimé** ; `existsSync(...)` → `false` mesuré par `householdSettings.int.test.ts:182` **et** `memberWorkLunchCard.int.test.ts:468` | ✅ |
| **C7** · plus de `WorkLunchCard` à l'étape 3 | `SetupPage.tsx` n'en porte plus qu'une **mention en commentaire** (`:3266`) | ✅ |
| **C6** · l'aperçu et le validé rendent le même `PlanResult` | `setupDraftWiring.int.test.ts` → **11/11 verts** | ✅ |

Les **10 fichiers de test** touchés ou créés par A5 : **250/250 verts**.

---

## 7. Le poste, la base, la fixture

`docs/keel/qa-fixtures/40-foyer-a5.sql` **lue en SQL, non rejouée**. La base locale porte
exactement ce que le journal §7 annonce :

```
Claire|owner |compte|1992-09-03|adult
Léa   |member|—     |1997-09-03|adult
Nour  |member|compte|1995-09-03|adult
Tom   |member|—     |2017-09-03|minor
invitation → Léa · lea.qa0903f@keeltest.dev · 2026-09-01 → 2026-09-08 · non consommée · vivante=t
```

✅ **L'aveu du §7 point 1 est VRAI** : `select … from information_schema.columns where
column_name='is_test_persona'` rend **zéro ligne** dans toute la base. La consigne du chantier cite
bien une colonne qui n'existe nulle part. **À remonter à l'orchestrateur.**

---

## 8. DÉFAUTS

### ❌ DÉFAUT 1 — un membre réclamé voit, sur SA ligne, un bouton « Retirer son accès » que la base lui refuse

**Fichiers et lignes**

- `frontend/src/keel/pages/HouseholdPage.tsx:2340-2351` — la signature de `MemberAccess` ne porte
  **aucun fait sur qui regarde** : `{ member, invitation, invitationsLoaded, busy, onDetach, onInvited }`.
  Ni `viewerIsOwner`, ni `isOwner`, ni `isMe`.
- `frontend/src/keel/pages/HouseholdPage.tsx:2837` — `<MemberAccess>` est monté dans `MemberRow`
  **sans aucune garde** : les 700 caractères qui précèdent ne contiennent pas `viewerIsOwner`.
- `frontend/src/keel/pages/HouseholdPage.tsx:2388-2404` — pour `member.userId` non nul, il rend le
  badge **et** un `<button onClick={onDetach}>` portant `household.member.detach`.
- `frontend/src/keel/pages/HouseholdPage.tsx:1933-1934` — dans la branche **non-maître**,
  `onDetach={() => onDetach(m.memberId)}` est bien câblé.

**Ce qui est faux**

`/app/household` monte la ligne d'un membre réclamé avec `viewerIsOwner={false}` (point 6). Sa
propre ligne a `role = 'member'` et `user_id` non nul ⇒ `MemberAccess` tombe dans l'état ③ et rend
le bouton. Ce bouton appelle `keel_household_detach_member`, qui répond **`not_owner`**
(`supabase/migrations/20260811040000_household_detachment.sql:236-237`). C'est un **bouton mort**,
et le dépôt a une cicatrice nommée pour ça (`refusal-far-from-the-gesture-reads-as-a-dead-button`).

**Mesuré, pas lu.** Sonde jetable montée dans mon worktree isolé puis supprimée
(`ls` après `rm` → *No such file*, `git status --short` → vide) :

```
SIGNATURE: export function MemberAccess( | { member, invitation, invitationsLoaded, busy, onDetach, onInvited }
RENDU:  <div …><span …>Has their own access</span>
        <button type="button" class="text-ink-soft underline disabled:opacity-50">Remove their access</button>
        <span …>Removing their access signs them out of this household…</span></div>
AVANT LE MONTAGE (700 car.): "…inviter et retirer un accès sont des GESTES, pas des réponses à un formulaire. */}\n      "
```

**Trois textes affirment le contraire du code**

1. ANALYSE §5.5 : « **Le maître seul voit ces boutons (`isOwner`).** »
2. Journal A5 §9, pour le secondaire réclamé : « **aucun** bouton d'invitation, **aucun** retrait ».
3. `HouseholdPage.tsx:1905-1907`, dans la branche non-maître elle-même :
   « Il ne voit aucune invitation : `MemberAccess` ne rend rien sur sa propre ligne réclamée
   **qu'un état**, et le geste qui l'inverse est au maître. » — il rend un état **et un bouton**.

**Pourquoi aucun test ne l'a vu.** `memberOwnRow.int.test.ts:58` s'intitule « le corps, le régime,
les contraintes, **le retrait** et la fusion sont gardés », mais sa liste ne contient que
`t("household.member.remove")` — « Retirer **du foyer** ». `t("household.member.detach")` —
« Retirer **son accès** » — n'y figure pas. **La garde nommée ne garde que ce qu'elle nomme**
(cicatrice `named-gate-lists-only-guard-what-they-name`).

**Ce que le bâtisseur doit faire**

1. Ajouter `viewerIsOwner: boolean` (**requis, jamais `?`**) à `MemberAccess` et le passer depuis
   `MemberRow` ; quand il est faux, rendre au plus le **badge d'état**, jamais le bouton.
2. Ajouter `["retirer l'accès", 't("household.member.detach")']` à la liste gardée de
   `memberOwnRow.int.test.ts:58`, et un cas de rendu sur `MemberAccess` avec un viewer non-maître.
3. Corriger le commentaire `HouseholdPage.tsx:1905-1907`, qui décrit un comportement que le
   fichier n'a pas.

### ❌ DÉFAUT 2 — le « cas qui passe » des bornes ne tient que la taille, pas le poids

**Fichier et lignes** : `frontend/src/keel/pages/setupMouthsStep.int.test.ts:707-712`.

**Ce qui est faux** : le cas `⛔ le titulaire garde ses bornes, la bouche garde les siennes` — que
le journal §1.4 présente comme **le** cas qui protège le motif de l'écart (c) — n'asserte que
`min="90"…max="250"` et `min="30"…max="260"`. Les bornes de **poids** (`25`–400 côté `profiles`,
`2`–400 côté bouche), pourtant nommées dans le motif à quatre reprises (journal §1.4 ; commentaire
`setupMouthsStep.int.test.ts:506-508` ; commentaire `MouthFormDialog.tsx:882-883` ; ce rapport
§2.3), ne sont **jamais mesurées**. Or c'est **la seule des quatre paires** qui porte l'argument :
un enfant de trois ans pèse ~14 kg, et `min={25}` le refuserait ; `min={90}` cm ne le refuserait
pas beaucoup mieux, mais c'est le poids qui mord en premier.

**Ce que le bâtisseur doit faire** : ajouter au même cas
`expect(selfHtml()).toMatch(/min="25"[\s\S]*max="400"/)` et
`expect(html()).toMatch(/min="2"[\s\S]*max="400"/)`.

---

## 9. NON PROUVÉ — ROUGE, geste humain requis

**Aucune session n'existe sur `http://localhost:5209`.** Mesuré : `Object.keys(localStorage)` →
`["sophia.ui_locale"]`, aucune clé d'authentification. Les trois routes d'A5 redirigent :

```
/app/household → /auth?redirect=%2Fapp%2Fhousehold
/app/setup     → /auth?redirect=%2Fapp%2Fsetup
/app/about-you → /auth?redirect=%2Fapp%2Fabout-you
```

Aucun mot de passe n'a été entré, aucun jeton forgé, `auth.sessions` jamais touchée, aucun secret
de conteneur lu. **Tout ce qui vit derrière la garde est donc ROUGE**, y compris les mesures
`document.scrollWidth` à **320 px** et **1280 px** dans les **deux langues** : elles n'ont **pas**
été faites, et l'agent bâtisseur ne les avait pas faites non plus.

### Le scénario exact à jouer (repris du §9 du journal, à ne pas réinventer)

La fixture est **déjà en base** (§7 ci-dessus) ; mot de passe des comptes de test : `1234567`.

**Sur `qa0903f.master@keeltest.dev` (le maître Claire), `/app/household` :**
1. chaque ligne ouvre **deux cadres nommés, ouverts** ; replier « Préférences alimentaires » laisse
   « Déjà renseigné : … » ; recharger et ouvrir une ligne **avant** la fin des lectures ⇒ « Lecture
   de ce qui est déjà renseigné… », **aucun champ vide** ;
2. ligne de **Léa** : « Invitation envoyée le 01/09 à lea.qa0903f@… » + **Renvoyer** ; ligne de
   **Tom** (mineur) : **Inviter** ; ligne de **Nour** : « A son accès » + « Retirer son accès » ;
3. « Inviter » → la phrase de l'offre affiche le montant **de `PRICES`** ; le lien apparaît,
   « Copier le lien » et « Écrire le message » (un **brouillon**, aucun envoi) ;
4. « Ajouter une personne » ⇒ **une seule fenêtre**, préférences en accordéon **replié** ; ajouter
   jusqu'à 8 bouches ⇒ la **9e refusée** (`household_full` traduit) ;
5. « Paramètres du foyer » : équipement **puis** repas traditions, au maître seul ;
6. la ligne de Claire porte le **rythme** et « ce que Sophia a retenu » ; celles des autres non ;
7. `/app/setup` étape 2 : la fiche d'ajout rend **trois blocs nommés**, des **étiquettes** sur
   taille/poids/sexe, la phrase « Taille, poids et sexe vont ensemble », l'**appétit** ; étape 3 :
   **l'équipement seul**.

**Sur `qa0903f.member@keeltest.dev` (Nour, secondaire réclamé) :** sa ligne s'ouvre et s'édite
(prénom, date, habitudes, absences, **déjeuner**) ; Claire, Léa et Tom restent des pastilles ;
**aucun** cadre de corps.
➕ **Et le point que ce rapport ajoute** : regarder l'**en-tête de sa propre ligne**. S'il y lit
« A son accès » suivi d'un lien cliquable « **Retirer son accès** », **DÉFAUT 1 est confirmé à
l'écran** — cliquer doit rendre `not_owner`.

À chaque écran : **320 px et 1280 px**, `document.scrollWidth === window.innerWidth`, captures à
scroll 0, **fr et en**.

### Autres ROUGE

- **Deno non lancé** — et c'est **prouvé légitime** : `git diff --name-only 694a616f..22cad593 --
  supabase/` est **vide**. Le seul ajout sous `docs/` est la fixture SQL, que la suite n'exécute pas.
- **`wiring-check` / `agent-gate`** non rejoués : le gate s'arrête de toute façon avant les
  contrôles front sur `deno test --no-run _shared/keel/` (18 erreurs TS étrangères), ce qui est la
  raison des commits `--no-verify` d'A5, et ce n'est pas une dette de ce lot.

---

## 10. Ce que je nomme sans le compter contre A5

1. **Le 5e rouge vitest de l'arbre n'appartient à personne dans les huit lanes** : `089f7fdf`
   (orchestration, 18:28) supprime `supabase/functions/_shared/keel/food_preference_promotion_io.ts`
   alors que `api/onboarding.ts:609-610` le cite encore comme consommateur de la question
   `food_preferences`. **Un lot, quelque part, va le prendre pour le sien.** À réparer par
   l'orchestrateur : retirer ou repointer le `consumer`.
2. **`profiles.is_test_persona` n'existe nulle part** (vérifié : zéro ligne dans
   `information_schema.columns`, tous schémas). La consigne du chantier la demande aux fixtures.
3. **A5 commite `en.ts`/`fr.ts`/`catalog.ts`**, ce que la règle §2.2 n°19 interdit — mais mon
   propre mandat de vérification les autorise. La consigne a changé en cours de route ; à
   trancher une fois pour toutes avant que E ne « fusionne » des packs déjà fusionnés.
4. **`setup.mouths.add_confirm` n'a plus de monteur** (annoncé par le journal §1.8). Vérifié :
   la clé vit toujours dans les deux packs, aucun composant ne la rend. Pour E.
5. **Le renversement D5.1 est écrit à `MouthFormDialog.tsx:355`**, pas à `:326-345` comme le
   mandat le prescrivait — le fichier a bougé. Le pavé est bien là et il est explicite.

---

## 11. Verdict

**Prouvé** : les 13 commits · `tsc -b --force` exit 0 · **zéro** erreur de type de test ajoutée
(93 → 93, diff par fichier vide) · vitest 2 130/2 155 avec les 4 rouges de baseline **et un 5e
prouvé étranger** · périmètre de 22 fichiers tous dans le mandat · i18n 15 clés + 1 valeur, dans
le bloc, `offer` déclaré, **aucun mojibake, incident d'échappements réellement réparé** · les
**cinq interdits** tenus · l'invitation conforme à §5.5 sur six de ses sept exigences · C6 et C7
tenus · **neuf mutations, neuf rouges, neuf restaurations `cmp`** · la fixture en base conforme.

**Les trois écarts** : motif (a) **VÉRIFIÉ** dans les quatre directions · motif (b) **VÉRIFIÉ dans
sa conclusion**, mais son décompte est inexact (six données + trois écrivains, pas « quatre
lectures + son écrivain », et `today` est déjà là) · motif (c) **VÉRIFIÉ dans le code et
jusqu'en base**, mais son cas qui passe n'en tient que la moitié (**DÉFAUT 2**).
**Aucun motif d'écart n'est faux.**

**Défauts** : **2** — un membre réclamé voit un bouton « Retirer son accès » que la base lui refuse
(DÉFAUT 1, contredit trois textes dont un commentaire du fichier lui-même) ; le cas qui passe des
bornes ne mesure pas le poids (DÉFAUT 2).

# ROUGE
