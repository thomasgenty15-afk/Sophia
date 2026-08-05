# MISSION — une doctrine, plusieurs objectifs

> Prompt d'exécution autonome. Repo `Sophia 2`, branche `dewhatsapp`.
> **À lancer quand la QA web a rendu la main.** `git log` / `git status` en
> arrivant : plusieurs agents travaillent dans ce dépôt. Si un travail est en
> cours, ne commence pas.
>
> Lot voisin : `PROMPT-COACH-PROTOCOL.md` (le mapping alimentaire du coach).
> Les deux partagent le **même mécanisme de portée par objectif** — si l'autre
> est déjà passé, réutilise sa forme au lieu d'en inventer une seconde.

---

## 1. LE PROBLÈME

Un coach a **une** doctrine publiée (`coach_doctrines`, index unique
`one_published` par coach). Elle porte cinq choses :

| Champ | Ce que c'est | Varie selon l'objectif de l'élève ? |
|---|---|---|
| `voice` | tutoiement, longueur, emojis, langue | **Non** |
| `vocabulary` | les termes du coach et leur sens | **Non** |
| `forbidden` | ce que Sophia ne doit jamais **dire** | **Non** |
| `beliefs` | les affirmations + leur justification | **Oui, fortement** |
| `arbitrations` | les cas durs de l'interview (le few-shot) | **Oui, le plus** |

Les trois premiers sont le coach lui-même : il ne change ni de voix ni de
vocabulaire parce que son élève veut prendre du muscle plutôt que perdre du gras.

Les deux derniers, si. « Ne t'affole pas d'un plateau sur la balance » ne
s'adresse qu'à quelqu'un en perte de gras. « Mange plus que ce que tu crois » ne
vaut que pour une prise de muscle. Et l'arbitration « qu'est-ce que je réponds
quand quelqu'un me dit qu'il ne perd plus » n'existe que dans un cas.

Aujourd'hui tout est mélangé dans un seul bloc, servi identiquement à tous les
élèves d'un coach. Résultat : soit le coach écrit des croyances génériques et
perd ce qui fait sa valeur, soit il en écrit de spécifiques et Sophia les sert à
des élèves à qui elles ne s'adressent pas.

**Ce que tu construis** : la portée par objectif sur `beliefs` et
`arbitrations`, et une compilation qui produit **N prompts, à partir d'UNE
doctrine écrite**.

---

## 2. CE QUI EXISTE — À NE PAS RECONSTRUIRE

- **Le schéma** : `supabase/migrations/20260803031000_pivot_nutrition_tables.sql:137`.
  `beliefs` et `arbitrations` sont des **tableaux jsonb d'objets**
  (`[{claim, rationale}]`, `[{situation, coach_answer, source}]`) — donc ajouter
  un champ optionnel par entrée est un changement **non cassant**. C'est la
  bonne nouvelle de ce lot.
- **`compiled_prompt`** et **`compiled_prompt_hash`** : le bloc assemblé et sa
  **clé d'invalidation de cache côté fournisseur**. C'est ce qui rend la
  doctrine économiquement viable (relecture à ~90 % de remise à chaque tour).
- **Le chargeur** : `_shared/keel/doctrine_loader.ts` —
  `loadPublishedDoctrine()` (`:96`, lit `compiled_prompt, compiled_prompt_hash,
  content_locale, published_at`) et `doctrineBlockFor()` (`:200`).
- **Ses trois consommateurs** : `sophia-brain/router/run.ts`,
  `generate-week-plan-v1`, `generate-meal-v1`.
- **L'écriture** : `coach-doctrine-v1` + `frontend/src/keel/pages/CoachDoctrinePage.tsx`.
- **Le vocabulaire d'objectifs**, déjà fermé et suffisant :
  `student_goals.goal` ∈ `fat_loss | recomposition | performance | health |
  maintenance`.
- **Le verrou de sortie** : un filtre déterministe post-génération qui écrase le
  texte visible quand un `forbidden` est détecté. Voir §4, il porte un défaut
  connu.

---

## 3. LA CONCEPTION

### 3.1 Le principe : une écriture, N compilations

**Le noyau reste partagé et toujours actif** : `voice`, `vocabulary`,
`forbidden`. Ils ne prennent pas de portée — et le §4 explique pourquoi c'est
plus qu'une simplification pour `forbidden`.

**Chaque entrée de `beliefs` et d'`arbitrations` porte une portée facultative** :
un tableau d'objectifs, vide par défaut = vaut pour tout le monde.

```json
{ "claim": "...", "rationale": "...", "goal_scope": ["fat_loss"] }
{ "situation": "...", "coach_answer": "...", "source": "interview", "goal_scope": [] }
```

**La compilation produit une variante par objectif** : noyau + les entrées dont
la portée est vide ou contient cet objectif. Le coach écrit une fois ; le système
compile N fois.

⚠️ **Ne crée pas N lignes `coach_doctrines`.** L'index unique
`one_published_idx` existe pour qu'il y ait une réponse déterministe à « quelle
doctrine s'applique au prochain message ». Multiplier les lignes rouvre cette
question. Les variantes sont un **produit dérivé** de la ligne publiée : une
table de compilés (`coach_doctrine_compilations`, clé `(doctrine_id, goal)`) ou
une colonne jsonb indexée par objectif — tranche et justifie.

### 3.2 🔴 Le cache, et c'est le point technique du lot

`compiled_prompt_hash` est la clé de cache du fournisseur. Trois exigences,
chacune non négociable :

1. **Le hash inclut l'objectif.** Deux variantes différentes qui partagent un
   hash, c'est un élève qui reçoit la doctrine d'un autre objectif — sans trace,
   et sans que rien n'échoue.
2. **La sélection est déterministe et tracée.** À chaque tour, on sait quelle
   variante a servi, et ça se lit dans les logs. Une sélection implicite est
   indébogable le jour où un coach dit « Sophia ne dit pas ça à mes élèves ».
3. **La fragmentation est mesurée, pas supposée.** Un coach de 200 élèves sur
   trois objectifs garde des blocs sollicités par des dizaines d'élèves — donc
   rentables. Mais **mesure-le** et écris le chiffre dans le STATUS : nombre de
   variantes compilées, et taux de réutilisation observé.

### 3.3 L'objectif absent — à trancher, pas à découvrir

Trois situations où il n'y a pas d'objectif d'élève :

- l'élève n'a pas encore rempli `student_goals` (il vient d'arriver) ;
- le **coach en mode test** parle à son propre agent ;
- un chemin non-conversationnel (une génération de repas déclenchée par un cron).

**Recommandation : une variante `default` = noyau + entrées de portée vide
uniquement.** Aucune croyance ciblée ne fuit vers quelqu'un dont on ignore le
but. Pour le mode test, laisse le coach **choisir** la variante qu'il veut
éprouver — c'est précisément ce qu'il veut vérifier avant d'exposer un élève.

### 3.4 Le changement d'objectif en cours de route

Un élève passe de `fat_loss` à `maintenance`. La variante servie change au tour
suivant — ce qui est voulu, mais doit être **doux** : Sophia ne doit pas se
contredire d'un message à l'autre sans le reconnaître. Décide du comportement,
et teste-le. *Recommandation : la mémoire de conversation reste, seul le bloc de
doctrine change ; et un changement d'objectif est un fait que Sophia peut
nommer.*

---

## 4. 🔴 LE VERROU DES INTERDITS RESTE GLOBAL

`forbidden` **ne prend pas de portée**, et ce n'est pas un raccourci.

Un interdit borné à un objectif signifie que Sophia peut dire à un élève ce
qu'elle a interdiction de dire à un autre. C'est le contraire d'un interdit :
c'est une préférence. Et le jour où un coach interdit « jeûne intermittent »
pour `fat_loss` seulement, la même phrase sort pour un élève `health` — le coach
constate que son interdit ne tient pas, et il a raison.

**Le défaut connu à ne pas aggraver** : la QA a mesuré que le verrou de doctrine
**détruit des réponses honnêtes** — une explication du jeûne intermittent, puis
un récap alimentaire parfaitement fondé, remplacés par une ligne hors sujet
(`keel.output_lock.doctrine`, `violation_count: 2`). N variantes de doctrine
multiplient les occasions de déclencher ce verrou. **Avant de livrer, vérifie
que ton changement ne dégrade pas ce comportement**, et si tu peux le mesurer
avec les variantes, écris le chiffre.

---

## 5. L'UX — ne multiplie pas le travail du coach

Le lot voisin vise « une méthode écrite en moins de trois minutes ». Celui-ci ne
doit pas la faire exploser.

**Règle : divulgation progressive, comme le mapping.** Une croyance est globale
par défaut. Un petit marqueur optionnel sur l'entrée permet de la restreindre.
**Pas d'onglets par objectif, pas de colonnes par objectif** : ce serait
multiplier par cinq une saisie dont l'essentiel est commun.

Deux choses qui aident vraiment :

- **Un aperçu de ce que voit un élève donné.** Un sélecteur « montre-moi la
  doctrine telle que la reçoit un élève en perte de gras » qui affiche le bloc
  compilé. C'est le seul moyen pour le coach de vérifier ce que son marqueur a
  produit — le pendant exact de l'aperçu des engagements dérivés du lot voisin.
- **Un rappel de ce qui n'est jamais ciblé** : la voix, le vocabulaire et les
  interdits sont affichés comme communs, avec une phrase qui le dit. Sans ça, un
  coach cherchera pendant dix minutes comment restreindre un interdit.

Et pendant l'interview d'onboarding, quand le coach donne un cas dur, la
question « ça vaut pour tout le monde, ou seulement pour ceux qui cherchent à
perdre du gras ? » est **naturelle à poser sur le moment** — bien plus qu'un
marquage rétrospectif dans un formulaire.

---

## 6. CE QUE TU CONSTRUIS

1. **La migration** : le champ de portée sur les entrées de `beliefs` et
   `arbitrations` (non cassant : absent = global), et le stockage des compilés
   par objectif. Nouvelle migration, jamais la réécriture d'une ancienne.
2. **Le compilateur** : module **pur et testé** — doctrine + objectif → bloc
   compilé + hash. C'est le cœur du lot.
3. **La sélection au tour** : `loadPublishedDoctrine` / `doctrineBlockFor`
   prennent l'objectif de l'élève et rendent la bonne variante, pour les
   **trois** consommateurs (`run.ts`, `generate-week-plan-v1`,
   `generate-meal-v1`). Un consommateur oublié, c'est une lane qui sert la
   mauvaise doctrine — et ce dépôt a déjà payé « la doctrine ne gouvernait
   qu'une lane sur trois ».
4. **L'invalidation** : republier une doctrine recompile **toutes** les
   variantes. Une variante périmée qui survit est indétectable.
5. **L'UI** : le marqueur de portée et l'aperçu par objectif dans
   `CoachDoctrinePage`.
6. **La rétrocompatibilité** : toute doctrine déjà publiée doit continuer de
   fonctionner à l'identique — sans portée, toutes ses entrées sont globales, et
   la variante `default` est équivalente au bloc actuel. Prouve-le par un test
   de non-régression sur une doctrine existante.

---

## 7. LA MÉTHODE — le gantelet

Cinq épreuves par livrable :

1. **Tests exécutés**, sortie collée. Un test écrit et non lancé n'existe pas.
2. **Passe adversariale** : doctrine sans aucune portée (comportement identique
   à aujourd'hui) ; entrée portée sur un objectif inexistant ; élève sans
   `student_goals` ; élève qui change d'objectif entre deux tours ; coach en
   mode test ; deux élèves du même coach, objectifs différents, **dans le même
   intervalle** ; **FR et EN** ; doctrine republiée pendant qu'un tour est en
   cours.
3. **Épreuve de réel** : deux élèves du même coach, l'un `fat_loss` l'autre
   `recomposition`, posent **la même question**. Les réponses doivent différer
   sur le fond et **se ressembler sur la voix**. Colle les deux transcriptions.
4. **Contre-factuel** : prouve qu'une croyance portée sur `fat_loss` **n'atteint
   pas** un élève `health`. Et prouve qu'une croyance sans portée les atteint
   tous les deux. Une garde qu'on n'a pas vue mordre est une garde qu'on croit
   sur parole.
5. **Deux relectures à froid.**

**Le test qui porte la doctrine :** *« deux élèves du même coach, objectifs
différents : même voix, conseils différents, et aucune croyance ciblée ne
franchit la frontière »*.

```bash
deno test --allow-all supabase/functions/_shared/ supabase/functions/sophia-brain/
cd frontend && npx tsc -b --noEmit && npx vitest --config vitest.config.ts run
```

---

## 8. RÈGLES D'ENGAGEMENT

1. Branche `dewhatsapp`. Commit snapshot d'abord, un commit par phase verte.
2. **INTERDIT** : `functions deploy`, `db push`, secrets, tout écrit distant.
   Local autorisé, `db reset` compris. Toute transformation de schéma est une
   **nouvelle** migration.
3. Tu ne touches ni aux allergies, ni au contrat photo, ni à la facturation, ni
   à l'ordre des gardes du tour. `forbidden` reste global (§4).
4. Aucune colonne droppée sans les **trois** épreuves d'absence : code
   applicatif, `pg_proc.prosrc`, vues.
5. Journal : `docs/nutrition-pivot/PROGRESS-DOCTRINE-BY-GOAL.md`. Livrable :
   `docs/nutrition-pivot/STATUS-DOCTRINE-BY-GOAL.md`, avec le chiffre de
   fragmentation du cache, la décision sur la variante par défaut, et l'effet
   mesuré sur le verrou des interdits.
6. Règle des 30 minutes. Honnêteté : aucun « fait » sans le test qui le prouve.
7. Pièges locaux : Kong rend des 502 sans corps ; `EMAIL_DELIVERY_ENABLED=1`
   traîne ; `functions.invoke` n'envoie pas `x-internal-secret` ;
   `auth.admin.createUser` échoue par intermittence.

## 9. LA QUESTION À CHAQUE ARBITRAGE

> *Est-ce que le coach reconnaît sa voix dans les deux variantes, et son
> jugement dans une seule ?*

Si les deux variantes se ressemblent trop, la portée ne sert à rien. Si elles ne
se ressemblent plus du tout, le coach a cessé d'être une personne pour devenir
deux — et c'est sa personne qu'il vend.
