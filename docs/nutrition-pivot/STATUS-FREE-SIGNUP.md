# STATUS — l'inscription libre, et la fin du numéro de téléphone

État au 2026-08-05. Branche `dewhatsapp`. **Rien n'est déployé** (§6.2 : aucun
`db push`, aucun `functions deploy`). Tout est vérifié en local, avec la sortie
des tests collée dans [PROGRESS-FREE-SIGNUP.md](PROGRESS-FREE-SIGNUP.md).

---

## 1. LA DÉCISION SUR LA DOCTRINE MAISON, EN CLAIR

**Qui la signe : KEEL, la société, sous le nom « KEEL Discovery ».**
`credential_type = 'none'` dans la base, et le programme se présente lui-même
comme générique dans sa propre doctrine (conviction
`this_is_a_discovery_program`).

**Pourquoi pas un coach fictif.** C'était l'alternative évidente — un prénom, un
titre, une biographie — et elle est refusée. Inventer une personne pour porter des
conseils nutritionnels, c'est fabriquer une autorité qui n'existe pas, sur le seul
sujet où ce produit ne doit jamais être l'autorité. Un utilisateur qui découvre
que « son coach » n'existe pas n'a pas rencontré un détail de rédaction : il a
rencontré un mensonge sur la nature du produit.

**Ce qu'elle contient.** Six convictions générales et vérifiables — nourriture
réelle, protéine à chaque repas, régularité plutôt que perfection, un changement à
la fois, une mauvaise journée est une information, et « ce programme ne vous
connaît pas ». Aucune quantité, aucun macro, aucun objectif de poids, aucune
pathologie.

**Ce qu'elle ne contient pas, délibérément.** `foods` est **vide des deux côtés**.
Recommander ou déconseiller des aliments nommés sans connaître la personne, c'est
exactement la posture qu'on refuse ; le verrou aliments n'a donc rien à faire
valoir ici, et c'est honnête plutôt que décoratif.

**Les deux interdits sont le cœur de la prudence**, parce qu'ils sont le seul
mécanisme du produit qui *garantit* quelque chose. Le verrou de sortie remplace
une réponse qui les endosse par le texte `instead`, mot pour mot :

| token | ce qu'il empêche |
|---|---|
| `promised_result_or_timeline` | promettre un résultat ou un délai à quelqu'un dont on ne sait rien |
| `advice_around_a_medical_condition` | habiller des principes généraux en soin d'une pathologie nommée |

Chaque `instead` renvoie vers un vrai coach, ce qui est la vérité : c'est là qu'est
le produit.

**L'alternative, pour mémoire.** Un programme maison *riche* — aliments
recommandés, arbitrages nombreux, une voix affirmée — aurait mieux « démontré » le
produit à un testeur. Elle est écartée : plus la doctrine maison est affirmée, plus
elle devient une prescription anonyme, et plus l'écart avec un vrai coach se
réduit dans l'esprit du testeur, ce qui dessert la thèse commerciale autant que la
prudence. Le choix est : **modeste et complète**, jamais riche et sans auteur.

**Comment on le désigne :** `coaches.coach_kind` en liste fermée
(`'human' | 'house'`) + un index unique partiel `coaches_one_house_coach` qui
garantit qu'il n'y en a **qu'un**. Pas d'UUID en dur dans le code, pas de variable
d'environnement : ni l'un ni l'autre ne survit à un `db reset` ou à un
environnement neuf. Les deux UUID en dur du chantier sont dans la seule migration
qui crée le coach ; tout le code résout par `coach_kind = 'house'`.

---

## 2. CE QUI EST CONSTRUIT

| § mission | livrable | où |
|---|---|---|
| 4.1 | coach maison, doctrine publiée, colonne de désignation | `20260805090000` |
| 4.2 | porte libre, un seul moteur de rattachement | `20260805091000` + `/start` |
| 4.3 | fin du téléphone (`/auth`, `/account`, garde morte, colonnes gelées) | `20260805091000`, `Auth.tsx`, `UserProfile.tsx` |
| 4.4 | exclusion de facturation + son test | `20260805090000`, `free_signup_test.sql` §C |
| 4.5 | transfert vers un vrai coach + son test | `20260805091000`/`093000`, §D et §F |
| 4.6 | le premier passage tient sur la porte neuve | vérifié en réel, §P3 |
| — | *(hors mission)* protocole publié de l'inscrit libre | `20260805093000` |

### Le moteur unique, et pourquoi il compte

`keel_attach_student_to_coach()` écrit **tout** ce qu'être rattaché veut dire :
lien `coach_clients`, `keel_role`, `locale`, `country`, et — pour la maison — le
protocole publié. Les deux portes (invitation, inscription libre) l'appellent.

C'est la réponse structurelle au défaut que `20260804180000` vient de corriger :
un fait écrit par une porte et oublié par l'autre. Une porte future qui oublierait
le pays devrait pour cela **ne pas appeler le moteur**, c'est-à-dire ne pas créer
de lien coach, c'est-à-dire ne pas fonctionner.

### Deux blocages que la mission ne nommait pas

Trouvés en lisant les triggers avant d'écrire une ligne. Chacun aurait tué le lot
en silence, et chacun est corrigé **avec sa condition de désarmement** testée :

1. `keel_coach_is_solvent` exigeait un abonnement ou un essai en cours, et
   `_trg_coaches_default_trial_end` pose 14 jours à l'insertion → le coach maison
   devenait insolvable à **J+15**, et `recompute_profile_access_tier` faisait
   retomber l'`access_tier` de tous ses inscrits à `'none'`. Paywall silencieux
   sur des comptes gratuits.
2. `_trg_coach_clients_enforce_trial_cap` refuse le 4ᵉ lien vivant d'un coach non
   payant → le **4ᵉ inscrit libre** était refusé à l'écriture.

### La facturation, mise là où elle se définit

`is_active_seat` dans `keel_coach_seat_ledger()` est la définition **unique** de
« siège facturable » du dépôt. L'exclusion maison est posée là, et pas dans
`stripe-reconcile-seats` : toute surface future (page de facturation du coach, un
futur export comptable) l'hérite au lieu de devoir s'en souvenir.

L'activité reste **comptée** — on nie la facturabilité, pas l'usage. Et l'accès
n'est pas la facturation : `recompute_profile_access_tier` ne lit pas `seat_state`,
donc un siège gratuit donne accès exactement comme un siège facturé.

---

## 3. LA PREUVE QUE LA MISSION DEMANDE

> *« un inscrit libre traverse la boucle complète — direction, semaine générée,
> photo analysée, tap du soir — sans qu'un seul 409 `no_coach` ni un seul siège
> facturable n'apparaisse. »*

**Tenu**, joué au navigateur sans jamais passer par une invitation
(`coach_invitations` pour cette adresse : 0 ligne) :

```
goal      fat_loss + situation              student_goals
semaine   3 items, traçables aux clés de conviction de la doctrine maison
photo     stored=t, analysée par gemini-3.1-pro-preview
tap       overall=good                      student_daily_checkins

interaction_count = 4  ≥  threshold = 3   link_status = active
is_active_seat    = f      coach_billing_periods (maison) = 0
```

La dernière ligne est le contre-factuel resserré : **toutes** les conditions d'un
siège facturable sont réunies sauf `coach_kind`. Et l'inverse mord — le même élève
sous un coach humain **est** un siège facturable (§C15).

### Le pays, « la première chose à tester »

Sur le profil réel écrit par le parcours : `country=GB` → Samaritans **116 123**,
et le produit imprime lui-même le contre-factuel
(`locale_would_have_served: "US"`). Sans pays déclaré, la hotline est déduite de la
langue avec `fallbackUsed: false` — rien ne signale la dégradation. C'est pourquoi
le pays est **obligatoire** sur la porte libre.

---

## 4. CE QUI RESTE OUVERT, ET C'EST À LIRE AVANT DE DÉPLOYER

1. **`db reset` complet non joué.** Le hook `block-risky-commands.sh` l'interdit à
   un agent, y compris en local. Les quatre migrations ont été appliquées par
   `supabase migration up --local` puis **rejouées à la main** (idempotentes), mais
   la lignée n'a pas été rejouée **depuis zéro**. C'est la seule épreuve du lot
   qu'un humain doit lancer :

   ```bash
   npx supabase db reset --local
   ```

   Puis rejouer les deux gantelets (commandes en tête de chaque fichier de test).

2. **Le copy de `/app/today` pour un inscrit libre.** L'écran dit « Your coach is
   putting it together » quand aucun plan hebdo n'est adopté. Pour un élève du
   coach maison, personne n'est en train de rien préparer : c'est **lui** qui
   génère sa semaine depuis `/app/plan`. La phrase n'est pas fausse au sens
   technique, elle est trompeuse. *Recommandation : un texte conditionné à
   `coach_kind`, qui envoie vers `/app/plan` au lieu de faire attendre.* Non fait :
   c'est du copy sur une page hors périmètre de ce lot, et le faire à la volée
   aurait été une modification non testée d'un écran que la QA web vient de
   valider.

3. **`authenticated` garde INSERT/UPDATE/DELETE sur `coach_student_contact` et
   `coach_student_pulse`** (privilèges Supabase par défaut). Ce sont des vues
   d'agrégat, donc non modifiables en pratique — mais c'est exactement le motif
   « revoke from public laisse anon » que le dépôt s'est déjà fait mordre.
   Pré-existant, pas introduit ici. `coach_student_events` n'a que SELECT, donc
   quelqu'un a déjà resserré celle-là.

4. **Trois suites rouges qui ne sont pas de ce lot**, détaillées en fin de
   PROGRESS : `a13_isolation_rls_test.sql` et `pivot_nutrition_tables_test.sql`
   (tables droppées par le pivot), `provisioning_rpc_test.sql` (cron absent), et
   `tenancy_rls_test.sql` (cassé **pendant** ce lot par
   `20260804191000_revoke_anon_on_pivot_tables.sql`, ajouté par un autre agent :
   la posture est plus stricte, seule la forme du test est périmée).

5. **Deux agents ont travaillé sur `dewhatsapp` en parallèle.** Mes trois premières
   migrations et le journal ont été emportés dans les commits `ca5e7598` et
   `74b16b88` d'un autre agent qui committe avec `git add -A`. Rien n'est perdu et
   l'historique est linéaire, mais les frontières de commits de ce lot ne sont pas
   fiables — la liste des fichiers de ce chantier est la table du §2 ci-dessus.

---

## 5. LA QUESTION DE §7, HONNÊTEMENT

> *Est-ce qu'un inscrit libre vit la même boucle qu'un élève de coach, ou une
> version dégradée qui donnera une fausse idée du produit ?*

**La même boucle, mécaniquement.** Même conversation, même photo analysée par le
même modèle, même tap, même génération de semaine, même verrou de doctrine, même
résolveur de crise. Aucun chemin du produit ne sait qu'il sert un inscrit libre :
c'est ce que le coach maison achète.

**Et une doctrine volontairement plus pauvre**, ce qui est un choix et non une
dégradation cachée : le programme dit lui-même, en toutes lettres et dans sa propre
doctrine, qu'il ne connaît pas la personne et qu'un vrai coach est autre chose. Un
testeur qui essaie ça ne rend pas un avis sur un produit qui n'existe pas — il
rend un avis sur la découverte, et la page `/start` lui a dit ce que c'était avant
qu'il tape un mot de passe.

Le seul endroit où l'illusion se fissure encore est le point 4.2 ci-dessus (le
Today qui parle d'un coach qui prépare quelque chose). C'est une phrase, elle est
identifiée, et elle est le premier geste à faire après ce lot.
