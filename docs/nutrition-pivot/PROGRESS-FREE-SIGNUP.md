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
