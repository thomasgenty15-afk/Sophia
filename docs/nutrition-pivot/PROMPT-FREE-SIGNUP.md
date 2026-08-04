# MISSION — l'inscription libre, et la fin du numéro de téléphone

> Prompt d'exécution autonome. Repo `Sophia 2`, branche `dewhatsapp`.
> **À lancer quand la QA web est terminée** : ce lot touche exactement le chemin
> d'entrée élève que la QA est en train d'éprouver (lot L2).

---

## 1. LES DEUX BESOINS

**A. Le téléphone n'a plus lieu d'être.** Le produit a quitté WhatsApp ; le
numéro était l'identité du compte, il ne l'est plus. Le coach ajoute un élève,
l'élève reçoit un **email**, il clique, il a un compte. C'est déjà le cas sur le
chemin d'invitation — mais pas partout (§2).

**B. On doit pouvoir s'inscrire seul,** sans être poussé par un coach : pour les
testeurs de Thomas, et pour un curieux en B2C qui veut essayer. Aujourd'hui
c'est **impossible**, et pas pour une raison de plomberie (§3).

---

## 2. LE TÉLÉPHONE — ce qui reste, et c'est un mur

Le chemin d'invitation est déjà propre : `coach-invite-student-v1` envoie
l'email, `/join` (`frontend/src/keel/pages/JoinPage.tsx`) crée le compte en
email + mot de passe avec le `coach_invite_token`, aucun champ téléphone.

**Mais `frontend/src/pages/Auth.tsx` exige toujours un numéro** sur son chemin
d'inscription générique (`:490-520`). Le bloc n'est sauté que pour
`coachSignup`, et il porte une validation **française** : normalisation `+33`,
longueur exactement 12, message « 10 digits expected for France ».

Conséquence : un élève qui atterrit sur `/auth` au lieu de `/join` — il clique
« se connecter » depuis la landing, son client mail casse le lien, il revient
plus tard par la porte d'entrée — se heurte à un validateur de numéro français,
sur un produit en anglais qui vise les États-Unis. Ce n'est pas un champ
superflu : c'est un mur, et il est invisible dans les tests parce que tout le
monde passe par `/join`.

**Devient mort au passage**, à traiter proprement :
- le garde anti-collision de `handle_new_user`
  (`20260727200000_keel_invitation_rpcs.sql:409-426`) refuse une inscription si
  le numéro appartient à un compte avec `phone_verified_at` **ou**
  `whatsapp_opted_in = true` — cette seconde colonne est **gelée à `false`**
  depuis le pivot, donc la moitié de la garde ne peut plus jamais être vraie ;
- `profiles.phone_number` n'est plus alimenté sur aucun chemin élève.

**Ne DROPPE pas ces colonnes.** Elles portent l'historique B2C. Gèle-les,
documente-les par `comment on column`, et prouve qu'aucun lecteur vivant n'en
dépend (épreuve d'absence : code applicatif **+** `pg_proc.prosrc` **+** vues —
renommer/retirer une colonne sans les trois a déjà cassé l'ajout d'un élève par
un coach dans ce dépôt).

**⚠️ Le pays.** Le numéro servait à déduire le pays de l'élève, et le pays
décide de la hotline en cas de crise. La migration
`20260804180000_join_sets_student_locale_and_country.sql` a fermé ce trou **sur
le chemin d'invitation**. Toute nouvelle porte d'entrée que tu ouvres doit
écrire `profiles.country` **au même endroit et de la même façon** — sinon tu
rouvres, par la porte neuve, le défaut « élève britannique, hotline française »
que cette migration vient de fermer. C'est la première chose à tester.

---

## 3. L'INSCRIPTION LIBRE — pourquoi ce n'est pas un interrupteur

Un compte créé sans invitation se heurte à **trois dépendances dures**, et
aucune n'est un oubli : chacune tient un invariant du produit.

1. **`keel_role`** n'est posé que par `accept_coach_invitation`
   (`20260727200000:343`, et `20260804180000:198`). Sans lui,
   `KeelStudentRoute` refuse tout `/app/*`, et `resolveHomePath`
   (`frontend/src/keel/api/postLogin.ts`) renvoie sur `/account` — un cul-de-sac
   pour un testeur.
2. **Le lien coach actif** : `generate-week-plan-v1:127-129` rend `409 no_coach`
   sans ligne `coach_clients` active. Pas de plan de la semaine.
3. **Le programme publié et la doctrine** : `meal-photo-upload-v1` rend `409`
   sans `plan_versions` publiée (`:390-411`), et `generate-week-plan-v1` rend
   409 si « the coach has not published any convictions yet » (`:162`).

Autrement dit : **sans coach, la boucle centrale est fermée.** Pas de photo, pas
de semaine, pas de doctrine — donc pas de produit, juste un chat générique.

Et c'est cohérent avec la thèse : la doctrine du coach est ce qui distingue
Sophia d'un bot nutrition. Un élève sans coach n'a pas « le produit en moins
bien », il a **autre chose**.

### La solution recommandée : un COACH MAISON

Ne rends pas le coach optionnel. **Fabrique-en un.** Un vrai enregistrement
`coaches`, avec un vrai programme publié et une vraie doctrine, auquel les
inscriptions libres se rattachent par un lien `coach_clients` ordinaire.

Pourquoi c'est nettement supérieur à « rendre le coach nullable » : les trois
dépendances ci-dessus restent satisfaites **sans une seule exception à
propager**. Rendre le coach optionnel obligerait à traiter le cas « élève sans
coach » dans le chemin photo, le générateur, la synthèse hebdo, la facturation,
les vues RLS et la garde d'accès — six endroits, six occasions d'oublier.

Ce que tu dois trancher et écrire dans le STATUS :

- **Qui signe la doctrine maison.** Elle doit être **attribuée** et
  **conservatrice** : des principes généraux d'alimentation, aucune prescription
  individuelle, aucune allégation de santé. Ce n'est pas un détail de rédaction —
  c'est ce qui évite que le produit devienne l'autorité nutritionnelle.
  *Recommandation : un programme volontairement générique et prudent, présenté
  comme « le programme de découverte KEEL », avec une invitation explicite à
  rejoindre un vrai coach.*
- **Comment on le désigne** : une colonne sur `coaches` (`is_house boolean` ou
  un `coach_kind` en liste fermée) plutôt qu'un UUID en dur dans le code ou une
  variable d'environnement. Un identifiant en dur ne survit pas à un
  `db reset` local ni à un environnement neuf.

### 🔴 La facturation — le piège de ce lot

Le modèle facture le coach **par élève actif** (`coach_billing_periods`,
`stripe-reconcile-seats`, `keel_student_interaction_count()`). Un inscrit libre
rattaché au coach maison ne doit **jamais** générer un siège facturable.

Prouve-le par un test dédié : crée dix inscrits libres, fais-les interagir, et
vérifie que le compteur de sièges du coach maison reste à zéro et qu'aucune
ligne de facturation n'est produite. C'est le genre de défaut qui ne se voit
qu'à la première facture.

### 🔴 Le passage au vrai coach

Un testeur ou un curieux finira par être invité par un **vrai** coach. Le
générateur prend `.limit(1)` sur les liens actifs (`generate-week-plan-v1:123`)
— donc deux liens actifs simultanés rendent le choix arbitraire et silencieux.

À construire explicitement : accepter une invitation d'un vrai coach **clôt** le
lien au coach maison. Et décide ce qu'il advient de l'historique — repas, plans,
mesures. *Recommandation : l'historique appartient à l'élève et le suit ; le
nouveau coach ne voit que ce qui suit son arrivée, faute de quoi on lui donne
accès à des semaines qu'il n'a pas encadrées.*

---

## 4. CE QUE TU CONSTRUIS

1. **Le coach maison** : migration (idempotente, rejouable) créant le coach, son
   programme publié et sa doctrine, plus la colonne qui le désigne. Aucun UUID
   en dur ailleurs que dans cette migration.
2. **L'inscription libre** : une porte d'entrée qui crée le compte, pose
   `keel_role='student'`, écrit `country` et `locale` comme le fait `/join`, et
   crée le lien `coach_clients` vers le coach maison. Réutilise le RPC existant
   plutôt que d'écrire un second chemin qui divergera.
3. **La fin du téléphone** : le bloc de `Auth.tsx` retiré pour tout ce qui n'est
   pas le chemin B2C legacy, la garde morte de `handle_new_user` nettoyée, les
   colonnes gelées et commentées.
4. **L'exclusion de facturation** du coach maison, avec son test.
5. **Le transfert** vers un vrai coach, avec son test.
6. **Le premier passage** (direction, date de naissance, pays) doit fonctionner
   à l'identique pour un inscrit libre — c'est le chantier
   `PROMPT-PLAN-INPUTS.md`, ne le réécris pas, vérifie qu'il tient sur cette
   nouvelle porte.

---

## 5. LA MÉTHODE — le gantelet

Cinq épreuves par livrable :

1. **Tests exécutés**, sortie collée. Un test écrit et non lancé n'existe pas.
2. **Passe adversariale** : inscription libre pendant que le coach maison n'a pas
   de programme publié ; deux inscriptions simultanées ; email déjà utilisé ;
   inscrit libre invité ensuite par un vrai coach, puis par un second ;
   invitation acceptée alors que le lien maison est déjà clos ; **FR et EN** ;
   `country` absent ; élève supprimé puis réinscrit.
3. **Épreuve de réel** : parcours joué au navigateur, de la page d'accueil à la
   première photo analysée, sans jamais passer par une invitation. Puis le même
   compte invité par un vrai coach, et la bascule vérifiée **en SQL**.
4. **Contre-factuel** : montre qu'un inscrit libre ne facture rien, et qu'un
   élève d'un vrai coach facture bien. Une garde qu'on n'a pas vue mordre est
   une garde qu'on croit sur parole.
5. **Deux relectures à froid.**

**Le test qui porte la doctrine :** *« un inscrit libre traverse la boucle
complète — direction, semaine générée, photo analysée, tap du soir — sans qu'un
seul 409 `no_coach` ni un seul siège facturable n'apparaisse. »*

```bash
deno test --allow-all supabase/functions/_shared/ supabase/functions/sophia-brain/
cd frontend && npx tsc -b --noEmit && npx vitest --config vitest.config.ts run
```

---

## 6. RÈGLES D'ENGAGEMENT

1. Branche `dewhatsapp`. **Vérifie `git log` et `git status` en arrivant** : ce
   dépôt a plusieurs agents. Si un travail est en cours, ne commence pas.
   Commit snapshot d'abord, un commit par phase verte.
2. **INTERDIT** : `functions deploy`, `db push`, secrets, tout écrit distant.
   Local autorisé, `db reset` compris. Toute transformation de schéma est une
   **nouvelle** migration.
3. Tu ne droppes aucune colonne : tu gèles et tu commentes. Toute suppression
   demande les **trois** épreuves d'absence (code, `pg_proc.prosrc`, vues).
4. Journal : `docs/nutrition-pivot/PROGRESS-FREE-SIGNUP.md`. Livrable :
   `docs/nutrition-pivot/STATUS-FREE-SIGNUP.md`, avec la décision sur la
   doctrine maison écrite en clair, et son alternative.
5. Règle des 30 minutes. Honnêteté : aucun « fait » sans le test qui le prouve.
6. Pièges locaux : Kong rend des 502 sans corps ; `EMAIL_DELIVERY_ENABLED=1`
   traîne ; `functions.invoke` n'envoie pas `x-internal-secret` ;
   `auth.admin.createUser` échoue par intermittence (repli `signUp` anon +
   `update profiles`).

## 7. LA QUESTION À CHAQUE ARBITRAGE

> *Est-ce qu'un inscrit libre vit la même boucle qu'un élève de coach, ou une
> version dégradée qui donnera une fausse idée du produit ?*

Un testeur qui essaie une version amoindrie rend un avis sur un produit qui
n'existe pas. Mieux vaut une doctrine maison modeste et **complète** qu'un mode
libre à moitié branché.
