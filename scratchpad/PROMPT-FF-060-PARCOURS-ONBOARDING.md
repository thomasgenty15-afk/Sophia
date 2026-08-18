# Chantier FF-060 — Le parcours d'entrée

> **Mission en une phrase.** Quelqu'un qui vient de créer son compte doit
> arriver à **son premier plan** par un parcours qui lui pose les questions
> dont ce plan a besoin — ni plus, ni dans le désordre, ni derrière un bouton
> « Set up » qu'il faut deviner.

Tu es un agent autonome. Ce document est ta seule source : il porte l'état
mesuré du dépôt, la spécification, les défauts à refermer, les lots, et les
preuves à produire. **Ne redécouvre pas ce qui est déjà écrit ici — vérifie-le
et avance.**

---

## 0. Règles opératoires — non négociables

1. **Branche `ff-001-quotidien-du-coach`, et aucune autre.** Pas de `push`, pas
   de merge, pas de nouvelle branche.
2. **Commandes à risque : JAMAIS seul.** `supabase db push`, `db reset`,
   `functions deploy`, `secrets set/unset`, `config push`, `link`, et toute
   écriture de secrets par la Management API. Elles sont bloquées par
   `.claude/hooks/block-risky-commands.sh`. Si tu en as besoin : **arrête-toi,
   écris la commande exacte dans ton rapport, laisse l'humain l'exécuter.**
3. **La base locale est PARTAGÉE avec d'autres sessions.** Les migrations
   s'appliquent par
   `docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f <fichier>`
   puis enregistrement de la version dans `supabase_migrations.schema_migrations`.
   **Jamais de `db reset`.** Fixtures préfixées `ff060_`, nettoyées en fin de lot.
4. **`git add -A` est interdit.** D'autres agents écrivent dans ce dépôt en même
   temps que toi. Chaque commit liste **explicitement** les chemins que tu as
   touchés.
5. **Tests Deno** toujours avec l'environnement purgé, sinon 114 faux rouges :
   `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY deno test --allow-read --allow-env --no-check <cibles>`
6. **Typecheck frontend** : `npx tsc -b` (c'est `tsconfig.app.json` qui vérifie ;
   `tsconfig.json` est un fichier de solution avec `files: []`, il ne vérifie
   **rien**). Tests : `npx vitest --config vitest.config.ts run`.
7. **Le hook de commit typecheck TOUT le frontend.** Si le rouge vient d'un
   fichier qui n'est pas à toi (une autre session en vol), **ne le « répare »
   pas** : consigne-le, commite tes chemins, continue.
8. **Une décision bloquante se prend, elle ne s'attend pas.** Tranche, applique,
   et documente dans ton rapport final : la décision, les options rejetées, et
   pourquoi.

---

## 1. Ce qui existe déjà — vérifié dans le code le 2026-08-12

**Ce chantier est un assemblage, pas une construction.** Tous les champs
existent, toutes les RPC existent, l'écran d'ajout de bouches existe. Ce qui
manque, c'est **l'ordre, la branche, et le fait que ça se termine par un plan.**

### 1.1 Il n'y a aucun entonnoir

- `/start` ([`frontend/src/keel/pages/StartPage.tsx`](../frontend/src/keel/pages/StartPage.tsx))
  demande e-mail, mot de passe, **pays** (le pays sert la hotline de crise, il
  ne se déduit pas de la langue) — et rien d'autre.
- Ensuite l'élève atterrit via `resolveHomePath` (`frontend/src/keel/api/postLogin.ts`)
  sur `/app/today`.
- Tout le réglage vit derrière un bouton **« Set up »** dans une fenêtre de
  réglages de `/app/plan`
  ([`StudentWeekPlanPage.tsx:1607`](../frontend/src/keel/pages/StudentWeekPlanPage.tsx)),
  qui empile quatre `SetupSection` : objectif, rythme, capacité de cuisine,
  goûts.
- Le mot « onboarding » n'apparaît dans `frontend/src/keel` que dans trois
  commentaires, dont un qui désigne une route morte.
- `profiles.onboarding_completed` existe mais n'est lu que par
  `process-checkins/index.ts:2180` — un chemin legacy. **Ne le réutilise pas**
  (voir §5.5).

### 1.2 Les champs, et où ils vivent

| Ce qu'on demande | Où ça s'écrit |
|---|---|
| Prénom, naissance, sexe, taille, pays, langue | `profiles.full_name`, `birth_date`, `gender`, `height_cm`, `country`, `locale` |
| L'objectif | `student_goals.goal` (6 jetons) + `target_weight_kg` / `target_waist_cm` + `aspiration` + `focus_axis` + `situation` |
| Le rythme, la cuisine, le budget, les goûts, les absences | `student_goals.practical_constraints` : `eating_rhythm`, `cooking_days`, `cooking_time_min`, `budget_band` (`tight`/`normal`/`comfortable`), `food_preferences`, `away_days` |
| Les bouches | `household_members` : `member_id`, `first_name` (NOT NULL), `birth_date`, `goal`, `user_id` (**nullable**), `departs_with_account`, `away_days` |
| Les allergies d'une bouche | `household_member_allergies` (migration `20260810170000`) |
| Les allergies du maître | `student_safety_constraints` (clé sur `user_id`) |

**⚠️ Écriture dans `practical_constraints` : passe OBLIGATOIREMENT par
`mergePracticalConstraints`** (`frontend/src/keel/api/practicalConstraints.ts`).
PostgREST rend **204 sans erreur** à un `update` qui ne matche aucune ligne :
trois écrans ont déjà affiché « Saved » sur un no-op parfait. Cette fonction est
la parade, elle est déjà armée, elle jette quand zéro ligne est touchée.

### 1.3 Les RPC du foyer — toutes livrées

`keel_household_create(p_name)` · `keel_household_add_member(p_first_name, p_birth_date, p_goal)` ·
`keel_household_set_member_name` / `_birth_date` / `_goal` / `_body` / `_away` ·
`keel_household_add_allergy(p_member, p_label)` ·
`keel_household_invite(p_email, p_member)` ·
`keel_household_preview_invitation(p_token)` · `keel_household_join(p_token, p_country)` ·
`keel_household_max_mouths()` (plafond **8**, en base) · `keel_household_roster_for`.

Côté frontend, `frontend/src/keel/api/household.ts` expose déjà
`createHousehold`, `addHouseholdMember`, `setMemberBody`, `addAllergy`,
`inviteToHousehold`, `previewHouseholdInvitation`, `joinHousehold`,
`hasOwnerGoalRow`, `createOwnerGoalRow`, `generateHouseholdMeal`, `goalApplies`
(côté serveur : `_shared/keel/household.ts:115`).

### 1.4 L'écran d'ajout existe, et sa décision structurante aussi

Le **lot 4** du chantier foyer (`docs/keel/CHANTIER-FOYER-PROFILS.md`) a livré
« l'ajout en 90 secondes » — fiches
[FF-045](../docs/fonctionnalites/le-foyer/FF-045-decrire-son-foyer.md) et
[FF-046](../docs/fonctionnalites/le-foyer/FF-046-l-allergie-d-une-bouche-sans-compte.md).
Sa décision est celle sur laquelle ce chantier s'appuie :

> **Le maître est la première bouche du flux.** Il est un convive, pas un
> administrateur.

Effet de bord déjà obtenu : la falaise a disparu — la génération refusait de
démarrer sur `goal_required` **après** l'effort d'avoir saisi trois personnes.

**Le trou de sécurité de ce lot est refermé.** Le chantier notait au 2026-08-10
que l'écran collectait une allergie que **rien ne lisait côté serveur**
(`household_safety.ts` sans importeur). Vérifié le 2026-08-12 : à HEAD,
`generate-household-meal-v1/index.ts:123` **et**
`sophia-brain/router/run.ts:350` l'importent tous les deux. L'allergie d'un
enfant sans compte arme le générateur **et** le chat. Le doc est en retard sur
le code — **ne recode pas ça.**

---

## 2. Les deux défauts mesurés que ce chantier DOIT refermer

Sans eux, l'entonnoir livre une régression au lieu d'une amélioration. Les deux
viennent du même endroit : **la résolution de l'objectif d'une bouche.**

### D1 — Un objectif sans date de naissance est SILENCIEUSEMENT ignoré

```ts
// supabase/functions/_shared/keel/household.ts:115
export function goalApplies(member: { ageState: MemberAgeState; goal: string | null }): boolean {
  return member.ageState === "adult" && member.goal !== null && member.goal !== "";
}
```

`ageState` dérive de `birth_date`. **Une bouche sans date n'est pas `"adult"`** —
la garde refuse deux cas, le mineur *et* l'âge inconnu, et le second est celui
qui mord ici : depuis que le maître saisit des bouches à la main, une ligne peut
n'avoir aucune date.

**Conséquence directe sur l'entonnoir.** Si le parcours demande l'objectif du
conjoint sans demander sa date de naissance, la bifurcation des portions — *la
démonstration entière de la cible « couple à objectifs divergents »* — est
muette au premier plan, **sans aucun message.** L'utilisateur voit un plan
uniforme et conclut que le produit ne fait pas ce qu'il promet.

➡️ **Pour un adulte dont l'objectif doit s'appliquer, la date de naissance est
« faux si absent », pas « moins bon ».** C'est une correction de la spec par le
code, elle n'est pas négociable.

### D2 — Réclamer son profil peut PERDRE l'objectif saisi par le maître

```
// generate-household-meal-v1/index.ts:211-217
⚠️ CORRIGÉ LE 2026-08-11 (D1): dès que la bouche A UN COMPTE, son objectif
vient de SON « about you » (student_goals), pas de sa ligne.
```

Et [FF-048](../docs/fonctionnalites/le-foyer/FF-048-reclamer-son-profil.md) R8
le dit sans détour :

> **un titulaire qui ne remplit jamais son « about you » n'a aucun objectif**,
> pas un objectif de repli ; son assiette est celle de qui n'a rien déclaré.

**C'est exactement la séquence que ce chantier fabrique** : le maître saisit
l'objectif de son conjoint dans l'entonnoir → il l'invite → le conjoint réclame
son profil → **l'objectif saisi cesse d'être lu**, et la portion se dégrade sans
que personne ne l'ait demandé. Le geste qui devait récompenser l'engagement le
punit.

➡️ **À refermer dans ce chantier** (lot 3B). Trois options, ma recommandation
d'abord :

| | Option | Verdict |
|---|---|---|
| ① | **Au moment de la réclamation, semer** `household_members.goal` **dans la ligne `student_goals` créée pour le titulaire** | ✅ recommandé — la source unique reste `student_goals` (la décision D1 du 2026-08-11 n'est pas défaite), elle est seulement **amorcée** au lieu de naître vide |
| ② | Bloquer l'écran de réclamation tant que l'« about you » n'est pas rempli | ❌ punit celui qui s'engage, exactement ce qu'on veut éviter |
| ③ | Faire retomber le roster sur la ligne de foyer quand le titulaire n'a pas de `student_goals` | ❌ recrée les **deux sources qui divergent sans arbitre** que D1 a délibérément supprimées |

L'option ① touche `keel_household_join` — donc une **migration**, appliquée par
`psql` selon le protocole du §0.3. Si tu juges le rayon d'explosion trop large,
tu as le droit de t'arrêter — mais alors **l'entonnoir doit dire à l'écran**, au
moment de l'invitation, ce que la réclamation va coûter. Ce qui est interdit,
c'est de perdre la donnée en silence.

---

## 3. La spécification

### 3.1 La règle qui trie chaque question

> **Si la réponse manque, le premier plan est-il FAUX, ou seulement MOINS BON ?**
> **Faux** → dans l'entonnoir. **Moins bon** → après le plan, au moment où on
> peut montrer le plat que ça change.

§6.1 de `docs/keel/PIVOT-FOYER.md` liste **huit** attributs par personne
(objectif, contraintes médicales, intolérances, allergies, goûts, dégoûts,
niveau en cuisine, temps). Huit × quatre personnes = 32 champs avant de voir
quoi que ce soit. **C'est ça qui tue l'activation, pas la famille.**

Le sous-ensemble « faux si absent » en fait **trois par personne** : le prénom
(sans lui la portion disparaît en silence), l'âge **et/ou** l'objectif (voir D1),
les allergies (sécurité — une allergie manquante au premier plan n'est pas une
imprécision, c'est un danger et une confiance perdue pour toujours).

Et la règle mère du dépôt s'applique ici comme au chat :

> **On ne collecte une donnée que si quelque chose en aval la consomme.**

Elle devient du **code** au lot 1 : chaque question porte, dans son descripteur,
le **nom de son consommateur**. Une question sans consommateur ne se pose pas.

### 3.2 Les trois étapes

**Étape 1 — situer.** Une seule question : **« Pour combien de personnes tu
cuisines ? »** → `1` / `2` / `3+`. Ce n'est pas une case « persona » : les trois
réponses *sont* les trois cibles (le solo en meal prep, le couple à objectifs
divergents, la famille), et le nombre est ce qui dimensionne le plan.

**Étape 2 — les gens.**
- **Toi, toujours en premier** (le maître est la première bouche) : prénom, date
  de naissance, taille, sexe, objectif, **tes** allergies.
- **Les autres, seulement si l'étape 1 a répondu ≥ 2** : par personne, prénom +
  (date de naissance **et** objectif si adulte / date de naissance si enfant) +
  allergies. **Trois champs, pas huit.**

**Étape 3 — le plan.** Rythme des repas, jours de cuisine, temps par session,
budget. **Posé une seule fois, pour le foyer** — ça appartient à qui cuisine,
pas à chaque bouche. C'est ce qui fait que la branche famille ne coûte qu'une
minute de plus que la branche solo, et pas quatre fois plus.

**La dernière action de l'étape 3 EST la génération.** Pas un « merci », pas un
« ton plan arrive » : le bouton compose et l'écran suivant est le plan.

### 3.3 Le branchement

| | `1` — solo | `2` — couple | `3+` — famille |
|---|---|---|---|
| Foyer créé ? | **non** | oui | oui |
| Générateur | `generate-meal-v1` | `generate-household-meal-v1` | `generate-household-meal-v1` |
| Étape 2b | absente | 1 personne | jusqu'à 7 (plafond 8 en base) |

**Le solo ne crée pas de foyer.** Le chemin individuel fonctionne déjà sans, et
créer un foyer d'une personne ajoute un objet à maintenir pour zéro service.
C'est aussi §5 de `PIVOT-FOYER.md` — *« l'entrée est à 1, la famille est
l'upgrade »* — pris au mot.

**Question annexe autorisée, sous condition** : au solo, on *peut* demander
« tu vis avec d'autres personnes ? ». Elle ne change pas le premier plan ; elle
sert à proposer le foyer plus tard. **Elle n'est donc légitime que si ce "plus
tard" existe vraiment** — un écran, un message, quelque chose qui lit la
réponse. Si tu ne peux pas nommer ce consommateur dans le code, **tu ne poses
pas la question.** C'est la règle mère, appliquée à toi.

### 3.4 Le vocabulaire — et pourquoi ce n'est PAS un choix entre deux choses

C'est le point que l'entonnoir doit rendre limpide, et le dépôt a déjà tranché
le mécanisme : `keel_household_invite(p_email, **p_member**)` vise une **ligne
qui existe déjà**, et `keel_household_join` **attache** `user_id` à cette ligne
— `member_id` inchangé, prénom, allergies et portions préservés
([FF-048](../docs/fonctionnalites/le-foyer/FF-048-reclamer-son-profil.md) §1).

> **Ce ne sont pas deux natures de personne. C'est le même objet à deux stades.**
> On ajoute **toujours** une bouche. L'accès est un **ajout par-dessus**, jamais
> une alternative.

Donc **l'entonnoir ne présente jamais une fourche** « bouche ou compte ? ». Il
ajoute la personne, puis propose l'accès. Les noms, en réutilisant le
vocabulaire déjà écrit dans `frontend/src/keel/i18n/en.ts` (ne fabrique pas un
troisième vocabulaire) :

| | Libellé à l'écran (EN) | Interne (FR) |
|---|---|---|
| Sans compte | **« Someone who eats here »** | une bouche à table |
| Avec compte | **« … with their own access »** | un profil réclamé / un titulaire |

Copie existante à réutiliser telle quelle, elle est déjà juste :

- `household.invite.body` — *« Their portions, their allergies and what this
  house does not serve are already on their line. Claiming it attaches their
  account to that same line — nothing is created, nothing is lost. »*
- `household.invite.grants` — *« What they get: they read the household plan and
  set their own direction. Not: composing, adding or removing anyone, or
  deciding what the house does not serve. »*

Et **la phrase qui manque**, celle qui répond à la question posée par ce
chantier (« est-ce qu'il faut attendre qu'elle s'inscrive ? ») — à écrire, en
clé neuve :

> **Nothing waits for them.** Their place at the table exists the moment you add
> them, and tonight's plan already counts them in. The access only lets them
> take that place over.

➡️ **Règle dure : l'invitation ne bloque JAMAIS la génération.** Un plan se
compose avec les bouches saisies, invitation envoyée ou non, acceptée ou non.
Un test le prouve (§4, lot 3).

### 3.5 Ce que l'entonnoir ne fait jamais

- ❌ **Il ne demande pas les goûts, les dégoûts, le niveau de cuisine ou les
  contraintes médicales des autres.** Après le plan, devant le plat concerné.
- ❌ **Il ne demande pas le nom du foyer.** Zéro consommateur au moment où on le
  demanderait. Dérive un défaut, renommable sur `/app/household`.
- ❌ **Il ne réclame pas de compte pour les enfants.** Un mineur n'a jamais
  d'objectif nutritionnel individuel — la ceinture d'âge est structurelle
  (`goalApplies`, `weekPlanAgeGate`), pas un réglage.
- ❌ **Il n'affiche aucune calorie.** Le contrat en vigueur et la chaîne de
  portes de [FF-059](../docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md)
  ne sont pas touchés par ce chantier.
- ❌ **Il ne se termine pas sur une erreur.** Voir lot 4 : les refus nommés des
  générateurs sont fermés **par les questions**, pas rattrapés par un message.

---

## 4. Les lots

Chaque lot est **livrable et commité seul**. Si le chantier s'arrête au milieu,
ce qui est commité tient debout.

### Lot 1 — Le module pur de l'entonnoir

**Fichier** : `frontend/src/keel/api/onboarding.ts` + `onboarding.int.test.ts`
(patron du dépôt : décisions pures + IO fine, comme `coachSeat.ts`).

C'est **ici** que la règle de tri devient du code, pas dans le JSX.

```ts
export type FunnelBranch = "solo" | "pair" | "family";

export interface FunnelQuestion {
  id: FunnelQuestionId;
  /**
   * OBLIGATOIRE, et ce n'est pas décoratif: le module ou le chemin qui LIT la
   * réponse. La règle mère du dépôt — on ne collecte que ce qu'un aval
   * consomme — n'est tenable que si elle est écrite à côté de la question.
   */
  consumer: string;
  /**
   * `wrong`  = sans la réponse, le premier plan est FAUX      → dans l'entonnoir
   * `better` = sans la réponse, il est seulement MOINS BON     → après le plan
   */
  weight: "wrong" | "better";
}

export function funnelSteps(branch: FunnelBranch): FunnelStep[];
export function nextIncomplete(state: FunnelState, branch: FunnelBranch): FunnelStep | null;
export function canGenerate(
  state: FunnelState,
  branch: FunnelBranch,
): { ok: true } | { ok: false; missing: FunnelQuestionId[] };
```

**Contraintes de conception :**

- `canGenerate` est la **seule** source qui active le bouton de fin. L'écran ne
  refait pas le calcul « à peu près » — deux vérités divergentes sur ce qui
  manque, c'est le bug de six mois plus tard.
- **Aucun paramètre optionnel sur `canGenerate`.** Cicatrice du dépôt : *un
  paramètre de garde optionnel est une garde désarmée* — `safetyBand` n'a jamais
  été passé nulle part et personne ne l'a vu.
- `canGenerate` refuse **`adult_without_birth_date`** : toute bouche adulte
  portant un objectif sans `birth_date` (défaut **D1**). Le motif est nommé, il
  n'est pas un booléen.
- Seules les questions `weight: "wrong"` apparaissent dans l'entonnoir. Les
  `better` sont déclarées dans le même tableau (c'est la liste de ce qui se
  demandera après), mais `funnelSteps` ne les rend jamais.

**Preuve d'acceptation :**

1. Un test échoue si une question est déclarée sans `consumer` non vide.
2. Un test échoue si une question `weight: "wrong"` nomme un consommateur qui
   n'existe pas dans le dépôt (résolution par chemin de fichier).
3. Table de vérité de `canGenerate` sur les trois branches, **motifs nommés**
   inclus.
4. Le cas D1 : adulte + objectif + **pas de date** → `ok: false`, `missing`
   contient `adult_without_birth_date`. **Mute la garde pour le prouver** — un
   test paramétré par sa propre constante reste vert quand on change la
   constante.
5. `npx tsc -b` exit 0 · `npx vitest run` vert.

### Lot 2 — L'écran, et sa reprise

**Route** : `/app/setup` (vérifie l'absence de collision dans
`frontend/src/App.tsx` ; `/start` est la porte publique, ne la touche pas).

- Les trois étapes du §3.2, une par écran, avec un fil de progression honnête
  (« 2 sur 3 », pas une barre décorative).
- **Reprise** : on peut fermer et revenir. L'état se **dérive des faits en base**
  (ligne `student_goals`, bouches, plan existant), pas d'un drapeau de progression
  — voir §5.5.
- **Gate de montage obligatoire** : aucun formulaire rendu avant la fin de la
  lecture. Cicatrice `mount-snapshot-forms-need-a-loading-gate` — un formulaire
  figé au montage affiche du vide non lu, puis l'écrase au Save.
- **Sortie de secours** : « Skip for now » → `/app/today`, et un point d'entrée
  visible pour revenir. Personne n'est retenu dans un couloir.
- **320 px ET 1280 px.** `flex-1` ne rétrécit pas un input (`min-width: auto`) —
  teste vraiment à 320.

**Preuve d'acceptation :** parcours navigateur complet en solo, capture d'écran
aux deux largeurs (à `scroll 0` — le panneau du navigateur ne repeint pas
ailleurs, décale le body plutôt que de scroller), plus une reprise à mi-parcours
après rechargement.

### Lot 3 — L'étape 2b : les bouches et l'accès

**Réutilise** `addHouseholdMember`, `addAllergy`, `inviteToHousehold` — n'écris
pas une seconde voie d'écriture. Le maître est saisi en premier (décision du lot
4 du chantier foyer), puis les bouches **en rafale**, pas une modale par
personne.

Par bouche : prénom (obligatoire) → enfant/adulte (date de naissance) → objectif
si adulte → allergies → **« Give them their own access? »** (optionnel, e-mail).

La copie du §3.4 est la spécification du texte. Trois règles dures :

- **R1 — l'invitation ne bloque jamais la génération.** Test : deux bouches, une
  invitation envoyée et non consommée → le plan se compose et compte les deux.
- **R2 — en local, aucun e-mail ne part.** `EMAIL_DELIVERY_ENABLED=1` en local
  est un **pistolet chargé** : ne l'arme pas. L'écran rend le lien
  (`household.invite.link_ready` existe déjà et son `{name}` est *load-bearing* :
  le maître émet plusieurs liens dans la même minute).
- **R3 — l'allergie n'est pas une règle de maison.** Trois natures distinctes,
  déjà tranchées (FF-046) : **allergie** (médicale → union de sécurité,
  fail-closed) / **règle de maison** (parentale → verrou qui tait le pourquoi) /
  **aversion** (goût → préférence). L'entonnoir ne collecte que la première.

**Preuve d'acceptation :** un foyer `ff060_` de 4 bouches (1 maître, 1 conjoint
adulte avec objectif divergent, 2 enfants dont un allergique) créé **par
l'écran**, chronométré. Cible : **sous 3 minutes** de bout en bout. Consigne le
temps réel, même s'il dépasse.

### Lot 3B — Refermer D2 (l'objectif perdu à la réclamation)

Voir §2. Option ① recommandée : semer `household_members.goal` dans la ligne
`student_goals` créée au moment de `keel_household_join`.

**Preuve d'acceptation :** en base, une bouche avec objectif `muscle_gain` →
invitation → réclamation → la ligne `student_goals` du titulaire porte
`muscle_gain`, et `keel_household_roster_for` rend toujours le même objectif
**avant et après** la réclamation. **Ce test est le lot** : sans lui, la
correction n'est pas prouvée.

Si tu renonces à ce lot : l'écran d'invitation doit **dire** ce que la
réclamation va coûter, et ton rapport doit le nommer comme trou ouvert.

### Lot 4 — La sortie : le bouton qui compose

- Routage : `generate-household-meal-v1` si le foyer a ≥ 2 bouches, sinon
  `generate-meal-v1`.
- **Le bouton ne doit pas pouvoir échouer sur un refus que l'entonnoir aurait pu
  fermer.** Méthode : **énumère** les refus nommés des deux fonctions
  (`grep -n 'error: "' supabase/functions/generate-meal-v1/index.ts supabase/functions/generate-household-meal-v1/index.ts`)
  et, pour chacun, prouve **soit** que l'entonnoir collecte ce qu'il exige,
  **soit** qu'il est rendu comme une **étape** et non comme une erreur.
  `goal_required` et `coach_has_no_doctrine` sont les deux connus ; il y en a
  d'autres, va les chercher.
- `coach_has_no_doctrine` est un cas à part : c'est **notre** coach maison qui
  n'est pas prêt, pas l'utilisateur. `/start` refuse déjà de créer un compte dans
  ce cas (`keel_free_signup_available`) — aligne-toi sur cette décision, ne
  fabrique pas un troisième comportement.
- L'atterrissage est **le plan**, pas `/app/today`.

**Preuve d'acceptation :** le tableau refus → traitement, complet, dans ton
rapport. Plus un **run réel local** du générateur sur le foyer `ff060_`. Si la
clé modèle est absente ou la fonction en 404 (le registre du routeur edge est
figé au démarrage du CLI, et le runtime sert des `_shared` périmés — **redémarre
la stack avant tout run réel**), consigne « run réel différé » : **ne mocke pas
en silence.**

### Lot 5 — La couture, et la fiche

- **Qui envoie vers l'entonnoir** : `resolveHomePath` et les états vides. Un
  écran élève vide porte la sortie vers là où il compose — c'est déjà la règle du
  dépôt, l'entonnoir devient cette sortie pour qui n'a rien.
- **On n'y retourne pas une fois fini** : dérivé des faits, pas d'un drapeau.
- **L'élève d'un coach** (`/join`) suit le **même** entonnoir. La seule
  différence est le propriétaire de doctrine, que l'entonnoir ne touche pas.
  Une phrase dans la fiche, pas une branche dans le code.
- **La fiche produit** : `docs/fonctionnalites/acquisition-et-acces/FF-060-le-parcours-d-entree.md`,
  au format de `docs/fonctionnalites/TEMPLATE.md`, **écrite depuis ce qui a été
  construit** (pas l'inverse), et indexée dans les deux README.
  **Avant d'écrire : `grep -rho 'FF-[0-9]\{3\}' docs/ | sort -u | tail -5`** —
  d'autres sessions numérotent en parallèle et une collision d'identifiant a déjà
  coûté un renommage complet. Si FF-060 est pris, prends le suivant libre et
  dis-le.

---

## 5. Les pièges du dépôt qui mordent précisément ici

1. **`profiles.locale` vaut `fr-FR` par défaut.** Une fixture qui ne l'écrit pas
   ment sur la langue. Et la langue de réponse a déjà divergé de `voice.language`
   une fois.
2. **`auth.uid()` est NULL sous `service_role`.** Toute RPC gatée dessus se teste
   au JWT, pas au client admin.
3. **Une garde a besoin d'un cas qui PASSE.** Cassée, elle bloque tout et
   ressemble à une garde qui marche.
4. **Un test paramétré par sa propre constante reste vert quand la constante
   change.** Mute pour prouver.
5. **`create or replace view` perd `security_invoker`**, et c'est invisible aux
   tests.
6. **`revoke from public` laisse `anon`** : vérifie
   `has_table_privilege('anon', …)` sur toute table neuve.
7. **Toute garde se teste dans les DEUX langues.** `not` ne couvre pas `doesn't`.
8. **Le runtime edge sert des `_shared` périmés** : un fichier *modifié* n'est
   pas rechargé. Redémarre avant tout run réel.
9. **401 « Invalid JWT » en local** : ton seul geste autorisé est
   `./scripts/check-local-jwt-alg.sh`, puis lire `docs/keel/JWT-HS256.md`. Ne
   passe **jamais** une fonction en `verify_jwt = false`, n'écris **jamais** dans
   `supabase/signing_keys.local.json` (il doit rester `[]`).
10. **`git stash` sur ce dépôt emporte les fichiers des autres sessions.** Utilise
    `git show HEAD~1:<chemin>` pour comparer.

---

## 6. Ce que tu dois décider seul, et documenter

1. **Le nom de la route** (`/app/setup` proposé) et l'absence de collision.
2. **Le nom par défaut du foyer** (l'entonnoir ne le demande pas).
3. **La forme de l'étape 1** : trois cartes ou un sélecteur de nombre.
4. **La question annexe au solo** (« tu vis avec d'autres ? ») : **posée
   seulement si tu peux nommer son consommateur**. Si tu ne peux pas, retire-la
   et dis-le.
5. **Lot 3B** : option ① appliquée, ou renoncement assumé avec le trou nommé.

Pour chacune : la décision, **les options rejetées**, et pourquoi.

---

## 7. Hors périmètre — exprès

- ❌ La refonte de `/start` et de `/auth`. L'entonnoir commence **après** le
  compte.
- ❌ Le paiement, le plafond de sièges, l'essai. `keel_household_trial_days` et
  `free_until` existent ; l'entonnoir ne les touche pas.
- ❌ Les envies de la semaine et le conseil de famille (FF-050) : c'est le rituel
  du week-end, pas l'entrée.
- ❌ Les calories (FF-059) et toute la chaîne de portes.
- ❌ Le déploiement. Tout reste local ; les commandes à risque partent dans ton
  rapport, pas dans ton terminal.

---

## 8. Le rapport final

`scratchpad/FF-060-RAPPORT.md` :

1. **Lot par lot** : livré / partiel / échoué, avec la **preuve** (sortie de
   test, ligne en base, capture). Rien d'affirmé sans trace.
2. **Le tableau des refus** du lot 4 : refus → fermé par quelle question, ou
   rendu comme quelle étape.
3. **Le chronomètre** du lot 3 : temps réel pour un foyer de 4, même s'il dépasse
   la cible.
4. **Les décisions du §6**, avec les options rejetées.
5. **Ce que tu n'as pas pu vérifier**, nommé — et ce qui reste ouvert.
6. **Les commandes à risque** à faire exécuter par l'humain, prêtes à
   copier-coller.

**Un échec ne se masque pas.** Un lot rouge se consigne rouge, et tu passes au
lot indépendant suivant.
