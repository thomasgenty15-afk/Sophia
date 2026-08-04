# PROGRESS — PLAN-INPUTS (append-only)

Journal du chantier « la direction du plan, et le corps auquel il s'adresse ».
Prompt : `docs/nutrition-pivot/PROMPT-PLAN-INPUTS.md`.

---

## 2026-08-04 — P0 : reconnaissance, avant d'écrire une ligne

Base : `main` @ `03cb9b32`. Arbre propre, rien à mettre en snapshot.

### Arbitrage de branche

Le prompt dit « branche `dewhatsapp` ». `git merge-base --is-ancestor dewhatsapp
main` → **vrai** : `main` contient `dewhatsapp` plus 5 commits (pivot KEEL,
suppression du produit grand public, dédoublonnage des migrations). Travailler
sur `dewhatsapp` reviendrait à repartir d'un état que `main` a dépassé et à
réintroduire les migrations en double. **Décision : `main`.** La référence à
`dewhatsapp` dans le prompt est périmée, pas fausse au moment où elle a été
écrite.

### Ce que le §2 dit, et ce que le dépôt dit

Vérifié contre le code ET contre la base locale (78/78 migrations appliquées,
`supabase_migrations.schema_migrations` à jour).

| Affirmation du prompt | Vérdict | Preuve |
|---|---|---|
| §2.1 `student_goals`, 1 ligne/élève, 5 tokens | ✅ exact | `20260803160000_pivot_student_week_plan.sql:32` |
| §2.2 l'UI écrit `goal` + `situation` et rien d'autre | ✅ exact | `StudentWeekPlanPage.tsx:185` — l'upsert ne cite que `goal`, `situation`, `content_locale` |
| §2.3 poids ET tour de taille collectés le dimanche | ✅ exact | `weekly_flow.ts:208,215` ; écriture vivante par `deterministic_buttons.ts:112` |
| §2.4 le générateur ne lit que `student_goals` | ✅ exact | `generate-week-plan-v1/index.ts:88` |
| §2.5 « l'âge : **aucune colonne**, vérifié sur toutes les migrations » | ❌ **FAUX** | voir ci-dessous |
| §2.5 le tour de taille n'est jamais montré | ✅ exact | aucun lecteur de `waist_cm` côté frontend |
| §2.5 aucun premier passage | ✅ exact | rien ne demande quoi que ce soit à un élève neuf |

### Divergence 1 — `profiles.birth_date` existe déjà

```
$ docker exec supabase_db_Sophia_2 psql -U postgres -d postgres \
    -c "select column_name, data_type from information_schema.columns
        where table_schema='public' and table_name='profiles'"
 birth_date | date
```

Déclarée en `20260522143735_squashed_schema.sql:4652`, jamais droppée. Et elle
est **déjà** traitée par le lifecycle RGPD, contrairement à ce que le P1
craignait :

- export : `account-export-v1/index.ts:440` la sélectionne, `:726` la rend sous
  `date_de_naissance` ;
- purge : `purge-deleted-accounts` supprime l'utilisateur auth, `profiles` part
  en cascade (en-tête du fichier, étape 4).

Il existe même déjà un dérivateur d'âge testé :
`sophia-brain/context/user_identity.ts:57` (`ageFromBirthDate`), avec ses tests.

**Conséquence sur le P1 :** la migration demandée n'a pas lieu d'être — ajouter
une colonne qui existe est au mieux un no-op, au pire une seconde source de
vérité. Le P1 se réduit à ce qui manque réellement : *personne ne demande jamais
la date de naissance à un élève KEEL, et rien ne décide ce qu'on fait d'un
mineur.* C'est la partie qui compte, et elle reste entière.

### Divergence 2 — le point du dimanche n'est plus un Flow Meta

`weekly_flow.ts` s'annonce « PIVOT C4 — LE POINT HEBDOMADAIRE, PAR UN WHATSAPP
FLOW » et l'en-tête de `keel-weekly-flow-v1` parle encore d'un
`KEEL_WEEKLY_FLOW_ID` publié chez Meta. Ces en-têtes ont survécu au chantier
de-whatsapp ; le code, lui, a bougé :

- la garde `flow_not_configured` a été **retirée** (`weekly_flow.ts:479`), parce
  que le formulaire vit maintenant dans l'app ;
- l'écriture passe par le pipeline in-app générique
  (`deterministic_buttons.ts:90`, `message.kind === "form"`).

Donc la collecte des mesures est **vivante**. La prémisse du P3 tient. J'ai
vérifié ce point précisément parce que, si elle avait été morte, « les dernières
mesures » aurait été une carte vide par construction et tout le P3 aurait porté
sur du vide.

### Divergence 3 — le coach ne peut pas lire `student_goals`

`pg_policies` : `student_goals_owner_all` et rien d'autre. Le P5 (« le coach voit
la direction ») demande donc une politique de lecture coach — c'est la seule
transformation de schéma réellement nécessaire du lot.

Et `coach_student_directory` est une vue à allowlist de colonnes qui **exclut
délibérément** la date de naissance (« never email, phone, birth date or any
billing column », `CoachStudentPage.tsx:~35`). Le P5 demande « l'âge » : je
l'exposerai **dérivé** (un entier), jamais la date. Une date de naissance est
une donnée d'identité ; un âge est ce dont le coach a besoin. Exposer la
première pour servir la seconde serait un élargissement gratuit d'une allowlist
écrite exprès.

### Ce que la reconnaissance ne dit pas encore

- où brancher l'âge et les mesures pour qu'elles **changent** la semaine :
  `week_plan_generation.ts` — `focusFor()` (branche nommée par objectif, `:181`)
  et le bloc `== THIS STUDENT ==` de `buildWeekPlanPrompt()` (`:406`). C'est là
  que se jouera le contre-factuel du §5.4.
