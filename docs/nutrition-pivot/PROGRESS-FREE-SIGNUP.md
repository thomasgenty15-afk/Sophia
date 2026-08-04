# PROGRESS — inscription libre & fin du téléphone

Journal d'exécution de `PROMPT-FREE-SIGNUP.md`. Ordre chronologique, un bloc par
phase. Rien n'est marqué vert sans la sortie du test collée dans ce fichier.

---

## P0 — arrivée, et une décision de branche

`git status` : propre. Aucun travail en cours, aucun agent en vol.

**La branche.** Le prompt dit `dewhatsapp`. Vérifié : `dewhatsapp` est un
ancêtre STRICT de `main` (`git merge-base --is-ancestor dewhatsapp main` → vrai),
et `main` porte 20 commits de plus — toute la QA web (L0→L10), donc en
particulier `20260804180000_join_sets_student_locale_and_country.sql`, qui est la
migration que le §2 de la mission désigne comme le trou de pays déjà fermé sur le
chemin d'invitation.

Travailler sur `dewhatsapp` telle quelle, c'était donc construire la nouvelle
porte d'entrée sur un arbre où le défaut « élève britannique, hotline
française » n'est pas corrigé — et le rouvrir sans le savoir. `dewhatsapp` a
été avancée en fast-forward sur `main` (aucune divergence à fusionner, aucun
commit perdu) et le travail se fait là.

```
$ git merge --ff-only main
 create mode 100644 supabase/migrations/20260804180000_join_sets_student_locale_and_country.sql
$ git log --oneline -1
849e69d1 QA web L10 + relectures a froid: deux defauts trouves par la seconde passe
```

`ls supabase/migrations | cut -d_ -f1 | sort | uniq -d` → vide (pas de version en
double : la lignée est applicable).

---

## P0-bis — l'état du terrain, mesuré et pas supposé

Tout ce qui suit est lu sur la base LOCALE (`docker exec supabase_db_Sophia_2
psql`), pas dans les fichiers de migration : ce qui compte est la définition
VIVANTE.

### Le téléphone

- `frontend/src/pages/Auth.tsx:496-542` : bloc téléphone obligatoire, sauté
  seulement pour `coachSignup`. Normalisation `+33`, longueur 12, message
  « 10 digits expected for France ».
- `handle_new_user()` (définition vivante, `pg_proc.prosrc`) porte bien la garde
  anti-collision `phone_verified_at is not null or whatsapp_opted_in = true`.
  `profiles.whatsapp_opted_in` existe toujours, `not null default false`, et plus
  aucun chemin ne l'écrit à `true` depuis le pivot → **la moitié de la garde est
  morte**, l'autre moitié (`phone_verified_at`) reste vivante pour les lignes
  legacy.
- Aucune route `/dashboard` ne subsiste (`App.tsx`), et `resolveHomePath` a déjà
  été recâblé sur `/account`. **Le « chemin B2C legacy » n'a plus de
  destination** : l'inscription générique de `/auth` ne mène nulle part de
  spécifique, elle mène au même endroit que tout le monde.

### Les trois dépendances dures de §3, vérifiées une par une

1. `keel_role` : posé uniquement par `accept_coach_invitation_for_user`
   (migration `20260804180000`, ligne 197). Confirmé.
2. Lien coach : `generate-week-plan-v1:127` → `409 no_coach`. Confirmé.
3. Doctrine publiée : `generate-week-plan-v1:158` → `409 coach_has_no_doctrine`
   si `coach_doctrines.beliefs` publié est vide. `meal-photo-upload-v1:384` →
   `409` sans `plan_versions` publiée — mais celle-là est **par élève**, produite
   par la boucle normale (génération + adoption), pas par le coach.

### Deux blocages que le prompt ne nomme pas, et qui auraient tué le lot

Trouvés en lisant les triggers, pas en lisant la mission :

- **`keel_coach_is_solvent(coach)`** exige un abonnement actif OU
  `trial_ends_at > now()`. `_trg_coaches_default_trial_end` pose
  `now() + 14 jours` à l'insertion. Un coach maison sans abonnement serait donc
  **insolvable à J+15**, et `recompute_profile_access_tier` ferait retomber
  `access_tier` de TOUS ses inscrits libres à `'none'` — paywall silencieux, deux
  semaines après la mise en service.
- **`_trg_coach_clients_enforce_trial_cap`** refuse le 4ᵉ lien vivant d'un coach
  non payant (`trial_seat_limit = 3`, `errcode check_violation`). Le **4ᵉ inscrit
  libre** serait refusé à l'écriture.

Les deux sont traités en P1 avec le test qui les prouve.

---

## P1 — le coach maison (commit contenu dans `ca5e7598`, tests dans `4dd39851`)

Trois migrations : `20260805090000` (désignation + identité + facturation),
`20260805091000` (moteur de rattachement + porte libre), `20260805092000`
(plancher d'historique).

Les deux blocages non nommés par la mission (§P0-bis) sont traités, chacun avec
sa **condition de désarmement** testée : un coach maison est solvable par nature
et hors plafond d'essai, mais un coach **humain** dont l'essai expire redevient
insolvable (A4) et son 4ᵉ siège lève toujours (B13).

```
free_signup_test.sql   → 50 PASS / 0 FAIL   (à ce stade)
billing_seats_test.sql → 39 PASS / 0        (non-régression)
tenancy_rls_test.sql   → 28 PASS / 0        (non-régression)
```

Deux migrations rejouées à la main : idempotentes, toujours **un** coach maison,
doctrine toujours publiée.

## P2 — la fin du téléphone + `/start` (commit `076ef215`)

`tsc` vert, **212** tests vitest verts (12 neufs sur `api/freeSignup.ts`).

Décision : `/auth` **perd** son inscription générique au lieu de la garder sans
validation de numéro. Retirer le champ en gardant le chemin aurait laissé une
inscription élève qui n'écrit pas `country`.

## P3 — épreuve de réel (commit `921e92ed`)

Parcours joué au navigateur, landing → `/start` → compte → chat, **zéro
invitation** (`select count(*) from coach_invitations where email=…` → 0).

Trois défauts trouvés là et nulle part ailleurs :

1. **La photo était refusée** (`409 No published plan`). `plan_versions` n'est
   pas une conséquence de la boucle : c'est le protocole que le coach publie,
   via `plan-publish-v1`, sous **JWT de coach** — que le coach maison n'a pas.
   → migration `20260805093000`.
2. **Le nouvel inscrit atterrissait sur un Today vide** qui affichait « Your
   coach is putting it together », phrase qui ne pouvait jamais devenir vraie.
3. Le pays, vérifié là où il compte (voir ci-dessous).

Boucle complète, mesurée en base :

```
goal      fat_loss + situation             (student_goals, écrit depuis /app/plan)
semaine   3 items, status draft            (student_week_plans)
photo     source=photo slot=lunch stored=t (protocol_events, analysée par
                                            gemini-3.1-pro-preview → not_food,
                                            correct: le PNG de test n'est pas
                                            un repas)
tap       overall=good                     (student_daily_checkins)
```

**Aucun `no_coach`, aucun `coach_has_no_doctrine`.** Et la doctrine maison
gouverne réellement la conversation — la réponse au café est l'entrée `qa` de la
migration, mot pour mot :

> « Not on its own. If it is replacing a meal, the meal is the thing worth
> looking at. »

### Le contre-factuel de facturation, resserré

Un compteur à zéro ne prouve rien si l'élève est sous le seuil. Après deux tours
de conversation supplémentaires :

```
interaction_count = 4   threshold = 3   link_status = active   seat_state = free
is_active_seat    = f   coach_billing_periods pour la maison = 0
```

Toutes les conditions d'un siège facturable sont réunies **sauf** `coach_kind`.

### Le pays — « la première chose à tester » (§2)

`crisisCountryForProfile` + `resolveCrisisResources` joués sur le profil **réel**
écrit par le parcours :

```
country=GB locale=en-US → { country: GB, source: profile_country }
                        → Samaritans (free, 24/7) — 116 123
et le log du produit imprime lui-même le contre-factuel :
  keel.crisis_resources.country_locale_divergence
    { served_country: GB, locale_would_have_served: US }
```

Parité, sur ce que le moteur écrit :

| `country` déclaré | résolu | source | numéro servi |
|---|---|---|---|
| GB | GB | profile_country | Samaritans 116 123 |
| FR | FR | profile_country | 3114 |
| US | US | profile_country | 988 |
| *(absent)* | **US** | **locale** | 988 — `fallbackUsed: false` |

La dernière ligne est le défaut : rien ne signale la dégradation. C'est pourquoi
le pays est **obligatoire** sur la porte libre (`country_required`).

## P4 — passe adversariale + relectures à froid (commit `77827cbe`)

17 assertions adversariales (`free_signup_adversarial_test.sql`), chacune avec sa
condition de désarmement. Les relectures à froid ont trouvé **trois** omissions,
dont une qui rendait mon propre commentaire de migration faux :

1. `/account` **éditait encore le téléphone** — et écrivait `phone_number`,
   `phone_verified_at`, `whatsapp_opted_in`, `whatsapp_state`… c'est-à-dire les
   colonnes que je venais de commenter « plus aucun chemin ne l'alimente ».
2. Les trois vues avaient **perdu `security_invoker = off`** : `create or replace
   view` ne conserve pas les reloptions. Comportement identique (`off` est le
   défaut), donc invisible à tout test — et c'est ce qui rend l'omission grave.
3. `version = 1` en dur dans le provisionnement du protocole.

### État final des tests

```
free_signup_test.sql              69 PASS / 0
free_signup_adversarial_test.sql  17 PASS / 0
billing_seats_test.sql            39 PASS / 0
student_week_plan_test.sql        22 PASS / 0
publish_tenancy_test.sql          12 PASS / 0
weekly_flow_schema_test.sql        6 PASS / 0
deno test _shared/               1415 PASS / 0 (17 ignored)
frontend                         tsc vert + 212 vitest
```

### Trois suites rouges qui ne sont PAS de ce lot

Vérifié : aucune de mes migrations ne mentionne ces objets.

- `a13_isolation_rls_test.sql` et `pivot_nutrition_tables_test.sql` — référencent
  `recurring_meals` / `student_facts`, **droppées** par
  `20260803161000_drop_dead_soft_memory_tables.sql`. Rouges avant ce lot.
- `provisioning_rpc_test.sql` — attend un cron `keel-provision-day` qui n'existe
  pas localement (7 crons `keel-*`, aucun de ce nom).
- `tenancy_rls_test.sql` est passé de 28 PASS à 13 **pendant** ce lot, et ce
  n'est pas moi : l'autre agent a ajouté
  `20260804191000_revoke_anon_on_pivot_tables.sql`, qui retire à `anon` tout
  privilège sur `plan_versions`/`plan_commitments`/`protocol_events`. Les trois
  assertions `anon reads … → 0 rows` **lèvent** désormais « permission denied »
  au lieu de rendre 0. La posture est plus stricte qu'avant ; seule la forme du
  test est périmée. Corriger leur fichier pendant qu'ils travaillent dessus
  aurait été une collision — c'est à eux.
