# MISSION — le protocole du coach : ce qu'il recommande, en trois minutes

> Prompt d'exécution autonome. Repo `Sophia 2`, branche `dewhatsapp`.
> **À lancer quand la QA web a rendu la main** : ce lot réécrit les écrans que
> la QA est en train d'éprouver. Vérifie `git log` et `git status` en arrivant ;
> si un autre agent travaille, ne commence pas.

---

## 1. CE QU'ON CHANGE, ET POURQUOI

Aujourd'hui, pour que Sophia sache quoi vérifier dans l'assiette d'un élève, un
coach doit remplir des **engagements structurés** : polarité `do|avoid`, groupe
alimentaire, `target_op`, `target_min`, `evaluation_grain` (`day|week`),
`autonomy` (`strict|swap_within_policy|flexible`), créneau. Quinze lignes de ce
genre pour exprimer « je pousse les légumes, je ne veux pas d'huiles de graines,
des protéines à chaque repas ».

C'est un formulaire d'expert pour dire des choses simples. Et il vit sur **deux
écrans qui font le même travail** — `/coach/import` et `/coach/templates` —
qui écrivent la même table et publient tous les deux.

Pire : la publication se fait **par élève** (`plan_versions.student_id not null`).
Un coach de 200 élèves publie 200 copies. C'est le dernier résidu du modèle 1:1,
et il n'a plus lieu d'être : dans le modèle 1:N, le coach écrit UNE méthode, et
c'est l'élève qui compose sa semaine à partir d'elle et de son objectif.

**Ce que tu construis** : un écran unique, `/coach/protocol`, où le coach
exprime sa méthode par un **mapping d'aliments** et une poignée de **règles
temporelles** — et d'où les engagements structurés sont **dérivés
automatiquement**, sans qu'il ait à les écrire ni même à les connaître.

**Ce qui NE change pas, et c'est délibéré** : les engagements continuent
d'exister en base. C'est contre eux que l'analyse photo se compare
(`commitment_matches`, l'allowlist des `commitment_id`), que l'évaluateur note,
et que `generate-week-plan-v1` construit la semaine. On change la **saisie**,
pas la structure. Supprimer la structure obligerait à réécrire ces trois
consommateurs et retirerait à Sophia tout ce contre quoi elle vérifie une photo.

---

## 2. LE BRIEF UX — la partie qui décide de la réussite du lot

Un écran d'écriture de méthode qui prend vingt minutes ne sera pas rempli. Un
écran rempli à moitié produit un agent qui ne sait rien vérifier. **L'objectif
est qu'un coach exprime sa méthode complète en moins de trois minutes**, et
qu'il y revienne volontiers.

### 2.1 La donnée qui commande le design

Le vocabulaire d'aliments est **fermé et petit** : **30 groupes, répartis en
9 classes** (`protein` 8, `beverage` 4, `vegetable` 4, `discretionary` 3,
`fruit` 3, `fat` 3, `dairy` 2, `grain` 2, `legume` 1). Table `public.food_groups`,
colonnes `slug` et `class`.

Trente, ce n'est pas cinq cents. **Ne conçois pas pour une taxonomie
imaginaire** : un coach peut passer sur l'ensemble en deux minutes, et le lui
montrer entièrement a une vertu — ça lui fait exprimer des opinions qu'il
n'aurait pas pensé à formuler devant un champ de recherche vide.

### 2.2 Le modèle d'interaction recommandé

**Neuf cartes de classe, dépliables, chacune contenant ses groupes sous forme de
pastilles tri-état.** Un tap sur une pastille fait défiler :

```
neutre  →  encouragé  →  déconseillé  →  exclu  →  neutre
```

Pourquoi ça et pas autre chose :

- **Un tap par décision**, pas un menu déroulant ni trois boutons radio. Trente
  décisions à un tap se font en deux minutes ; trente menus déroulants, jamais.
- **Neutre est le défaut, et c'est une vraie valeur** — pas « non rempli ».
  L'écrasante majorité des groupes n'appelle aucune opinion, et un coach ne doit
  pas avoir l'impression de laisser le travail inachevé.
- **Groupé par classe** parce que c'est comme ça qu'un coach pense (« les
  matières grasses », « les féculents »), et parce que ça permet de ne déplier
  que ce qui l'intéresse.
- **Ça marche au pouce.** Un coach édite depuis son téléphone entre deux
  clients ; un tableau large ne survit pas à 375 px, une grille de pastilles si.

**Une recherche en complément, jamais en remplacement** : un champ qui filtre
les pastilles pour le coach qui sait déjà ce qu'il cherche. Il accélère l'expert
sans imposer la page blanche au débutant.

### 2.3 Les alternatives à écarter, et pourquoi

Écris ces refus dans le journal ; s'ils ne sont pas motivés, ils reviendront.

- **Une liste plate de 30 lignes avec 3 radios** : un mur. La densité visuelle
  tue la complétion avant la première ligne.
- **Recherche seule, page blanche au départ** : rapide pour l'expert, mais le
  débutant n'exprime que ce qui lui vient — donc un protocole incomplet dont
  personne ne sait qu'il l'est.
- **Du texte libre** : casse le vocabulaire fermé, donc la jointure avec
  l'analyse photo, donc tout l'intérêt. Voir §2.5 pour la vraie réponse au
  besoin qu'il exprime.
- **Des grammes, des calories, des macros** : interdits par le contrat
  (non-input #4). Aucun champ numérique de quantité, nulle part.

### 2.4 L'aperçu de ce qui est produit — non négociable

Puisque les engagements deviennent **dérivés**, le coach doit voir en
permanence, à côté de ses coches, les lignes qui en sortent :

> « Légumes verts — au moins 1 portion par jour, souple »
> « Huiles de graines — à éviter, strict »

Sans cet aperçu, il coche à l'aveugle dans une boîte noire qui écrit sa méthode
à sa place, et il ne fera pas confiance au résultat. C'est aussi le seul moyen
pour lui de repérer qu'une case a produit une ligne qu'il ne voulait pas.

**L'aperçu vit à côté de l'édition, pas sur un autre écran.**

### 2.5 🔴 « Le coach doit pouvoir en ajouter » — la tension à résoudre

Le vocabulaire est fermé **pour une raison** : `protocol_events.food_group_ref`
porte une FK vers `food_groups(slug)` ; le prompt de vision liste les slugs et
interdit d'en inventer ; `parseFoodGroupRef` rejette l'inconnu, et son
commentaire dit pourquoi — « persister un slug inconnu casserait la FK trois
couches plus loin, sur une donnée qui a l'air valide ». C'est cette fermeture
qui rend la jointure photo↔protocole possible **sans modèle**.

Si un coach crée un slug privé, deux choses cassent : le modèle de vision ne
sait pas le détecter (il faudrait l'injecter dans le prompt, qui deviendrait
per-coach et ferait exploser le cache de prompt), et la jointure devient
partielle sans que personne ne le voie.

**La résolution, et elle est déjà à moitié dans le schéma** : le coach ajoute un
**terme**, pas un slug. Le terme est libre (« kéfir », « huiles de graines »,
« bouillon d'os »), et il est **rattaché à un groupe existant** du vocabulaire
partagé. Le pipeline continue de travailler sur le groupe de base ; le coach voit
et écrit dans ses mots.

C'est exactement le patron de `coach_doctrines.vocabulary`
(`[{term, meaning}]`), qui existe déjà — réutilise l'idée, ne réinvente pas un
second mécanisme de vocabulaire.

Deux exigences là-dessus :

1. **La transparence.** Quand le coach ajoute « kéfir », l'écran affiche
   explicitement « traité comme *produits laitiers fermentés* ». Il doit pouvoir
   corriger le rattachement. Un rattachement silencieux est un mensonge sur ce
   que Sophia vérifiera vraiment.
2. **Le signal.** Chaque terme ajouté qui ne se rattache à rien de satisfaisant
   est enregistré comme une **demande d'extension du vocabulaire partagé** —
   pas créé à la volée. Le vocabulaire grandit **globalement et de façon
   curée**, jamais par coach. Prévois la table et la trace ; l'ajout effectif
   d'un slug reste une migration.

### 2.6 Les règles temporelles

Ce qu'un mapping ne sait pas dire : la **fréquence** et le **moment**.
« Des protéines à chaque repas », « des baies une fois par jour », « rien après
21 h ». Elles se comptent sur les doigts d'une main — ne construis pas un éditeur
de règles générique.

**Des gabarits fermés, à trous**, pas du texte libre : le texte libre ne se
compile pas de façon déterministe.

```
[au moins | au plus] [1..N] portion(s) de [groupe] par [jour | semaine]
[groupe] à chaque repas
pas de [groupe] après [heure]
[groupe] au [petit-déjeuner | déjeuner | dîner]
```

Chaque gabarit se compile en un engagement dont tu documentes la correspondance
champ par champ (`target_op`, `target_min`, `evaluation_grain`, `slot_key`).

### 2.7 Brouillon et publication

Le mapping se sauvegarde en continu, mais **il ne s'applique pas en continu** :
un coach au milieu d'une modification ne doit pas pousser une demi-méthode à
200 élèves. Donc brouillon → publication explicite, comme la doctrine.

**Au moment de publier, montre le diff en langage humain** : « 3 lignes
ajoutées, 1 retirée — ça change ce que Sophia vérifie pour 47 élèves actifs ».
Publier à l'aveugle sur une cohorte est le geste le plus risqué de cet écran.

---

## 3. LES TROIS OBJECTIFS D'ÉLÈVE — le raffinement optionnel

Les élèves d'une même cohorte n'ont pas le même but. Le vocabulaire existe déjà :
`student_goals.goal` ∈ `fat_loss | recomposition | performance | health |
maintenance` — les trois cas cités par Thomas (maigrir, être en bonne santé,
prendre du muscle) sont `fat_loss`, `health`, `recomposition`.

**Une entrée du mapping peut être GLOBALE (défaut) ou LIMITÉE à un ou plusieurs
objectifs.** Un coach dit « les féculents autour de l'entraînement » pour
`recomposition` seulement, et « volume de légumes » pour `fat_loss`.

### La règle d'UX qui compte ici

**Ne fais PAS de l'objectif une dimension de premier plan.** Trois colonnes ou
trois onglets tripleraient le travail de saisie pour un besoin minoritaire, et
la plupart des lignes d'un coach sont vraies pour tout le monde.

**Divulgation progressive** : une entrée est globale par défaut ; un petit
marqueur optionnel sur l'entrée permet de la restreindre. Le cas simple reste
simple, le cas expert reste possible.

### La question de départ, et le piège des préréglages

Le pire ennemi d'un écran d'écriture est la page blanche. Un préréglage aide —
mais **si KEEL livre des contenus nutritionnels tout faits, KEEL devient
l'autorité nutritionnelle**, avec la responsabilité qui va avec, sur un produit
qui n'est pas médical.

**La sortie recommandée : des préréglages de STRUCTURE, pas de CONTENU.** Au
lieu de pré-cocher des aliments, l'écran propose au coach les axes sur lesquels
un protocole de ce type dit habituellement quelque chose :

> « Les protocoles orientés perte de gras prennent en général position sur :
> les protéines à chaque repas · les matières grasses ajoutées · les calories
> liquides · le volume de légumes. Qu'en dis-tu, toi ? »

Ce sont des **questions**, pas des réponses. Le coach reste l'auteur, la page
blanche disparaît, et personne ne prescrit à sa place. Tranche et documente ; si
tu choisis autre chose, écris pourquoi dans le STATUS.

---

## 4. 🔴 CE QUI NE DOIT SURTOUT PAS ÊTRE CONFONDU

Un « exclu » de coach n'est **pas** une allergie d'élève.

Les allergies vivent dans `student_safety_constraints`, sont déclarées par
l'élève, jamais inférées, et portent un double verrou (prompt + écran
déterministe post-génération). Le mapping du coach est une **méthode**, avec une
sévérité de méthode.

Si les deux partagent un mécanisme, l'un des deux défauts arrive : l'aversion du
coach pour les laitages est appliquée avec la rigueur d'un risque
anaphylactique, ou — bien pire — une allergie est ramollie au rang de
préférence. **Deux tables, deux sévérités, deux verrous.** Écris un test qui le
prouve dans les deux sens.

---

## 5. CE QUE TU CONSTRUIS

1. **Le modèle de données** : une table de mapping (`coach_food_rules` ou
   équivalent) — `coach_id`, `food_group_ref` (FK), `stance`
   (`encouraged|discouraged|excluded`), `goal_scope` (tableau vide = global),
   `rationale` (le « pourquoi », facultatif, qui donne à Sophia de quoi
   expliquer au lieu d'asséner), `content_locale`. Plus la table des règles
   temporelles, plus la table des termes de coach et leur rattachement, plus la
   trace des demandes d'extension. Versionné et publiable comme la doctrine.
2. **Le compilateur** : un module **pur et testé** qui transforme mapping +
   règles temporelles en `plan_commitments`. C'est le cœur du lot. Chaque champ
   dérivé doit être justifié par un test : quel `stance` produit quel
   `autonomy`, quel gabarit produit quel `target_op`/`evaluation_grain`.
3. **L'écran `/coach/protocol`**, conforme au §2, qui remplace `/coach/templates`
   dans la navigation.
4. **L'absorption de `/coach/import`** : l'import d'un PDF devient une **action
   d'amorçage** de cet écran (« pré-remplis mon mapping depuis ce document »),
   pas un écran parallèle. Un seul endroit où l'on écrit sa méthode.
5. **La fin de la publication par élève** : `plan_versions` cesse d'être portée
   par `student_id`. Tous les lecteurs qui font « le plan publié de CET élève »
   passent par son rattachement. ⚠️ Renommer/retirer une colonne dans ce dépôt
   demande **trois** épreuves d'absence — code applicatif, `pg_proc.prosrc`,
   et vues. L'oubli de la deuxième a déjà empêché un coach d'ajouter un élève.
6. **La migration des coachs existants** : ceux qui ont déjà des engagements
   écrits à la main ne doivent rien perdre. Décide et documente : conversion
   automatique vers le mapping quand c'est possible, conservation en lecture
   seule sinon.

---

## 6. LA MÉTHODE — le gantelet

Cinq épreuves par livrable :

1. **Tests exécutés**, sortie collée. Un test écrit et non lancé n'existe pas.
2. **Passe adversariale** : coach sans aucune règle (le protocole vide doit
   produire un état lisible, pas un plantage) ; 30 groupes tous marqués ; un
   terme de coach qui ne se rattache à rien ; deux onglets éditant en même
   temps ; publication pendant qu'un élève génère sa semaine ; **FR et EN** ;
   375 px ; un élève dont l'objectif n'a aucune règle qui le vise.
3. **Épreuve de réel** : au navigateur, un coach neuf écrit son protocole
   **chronomètre en main**. Note le temps. S'il dépasse trois minutes pour une
   méthode simple, l'interface est à revoir — c'est un critère d'acceptation,
   pas une observation.
4. **Contre-factuel** : prouve que le mapping **change réellement** ce que
   l'élève reçoit. Deux protocoles différents sur le même élève → deux semaines
   générées différentes, et une même photo jugée différemment. Si la sortie ne
   bouge pas, tout ce lot est décoratif et c'est un P0.
5. **Deux relectures à froid.**

**Le test qui porte la doctrine :** *« ce que le coach coche est exactement ce
que Sophia vérifie »* — du mapping jusqu'à `commitment_matches` sur une vraie
photo.

```bash
deno test --allow-all supabase/functions/_shared/ supabase/functions/sophia-brain/
cd frontend && npx tsc -b --noEmit && npx vitest --config vitest.config.ts run
```

---

## 7. RÈGLES D'ENGAGEMENT

1. Branche `dewhatsapp`. `git log`/`git status` en arrivant — plusieurs agents
   travaillent ici. Commit snapshot d'abord, un commit par phase verte.
2. **INTERDIT** : `functions deploy`, `db push`, secrets, tout écrit distant.
   Local autorisé, `db reset` compris. Toute transformation de schéma est une
   **nouvelle** migration ; on ne réécrit jamais une ancienne.
3. Tu ne touches ni au contrat photo v3, ni aux allergies, ni à la facturation,
   ni à l'ordre des gardes du tour.
4. Aucune colonne droppée sans les trois épreuves d'absence.
5. Journal : `docs/nutrition-pivot/PROGRESS-COACH-PROTOCOL.md`. Livrable :
   `docs/nutrition-pivot/STATUS-COACH-PROTOCOL.md`, avec les décisions UX
   écartées et leur motif, la décision sur les préréglages, et la stratégie de
   migration des coachs existants.
6. Règle des 30 minutes. Honnêteté : aucun « fait » sans le test qui le prouve.
7. Pièges locaux : Kong rend des 502 sans corps ; `EMAIL_DELIVERY_ENABLED=1`
   traîne ; `functions.invoke` n'envoie pas `x-internal-secret` ;
   `auth.admin.createUser` échoue par intermittence.

## 8. LA QUESTION À CHAQUE ARBITRAGE

> *Est-ce qu'un coach qui découvre cet écran exprime sa méthode entière sans
> aide, en moins de trois minutes — et reconnaît-il sa méthode dans l'aperçu ?*

Si non, simplifie. Une méthode à moitié écrite produit un agent qui ne vérifie
rien, et c'est pire qu'un écran qu'on aurait jugé trop simple.
