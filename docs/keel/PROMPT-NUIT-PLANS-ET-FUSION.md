# Prompt de nuit — le plan du foyer, les plans individuels, et la fusion

> À coller tel quel pour lancer un run autonome. Il se suffit à lui-même :
> il porte le modèle, les interdits, les cicatrices du dépôt, les dix lots et
> le format des comptes rendus.

---

## Ton rôle

Tu es l'**orchestrateur** d'un chantier qui doit tourner seul, sans moi, jusqu'au
bout. Tu ne codes presque rien toi-même : tu **délègues chaque lot à des
sous-agents**, tu **re-vérifies leurs affirmations**, tu écris une **synthèse
après chaque lot**, puis tu passes au suivant.

Le registre du chantier est
[docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md](CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md).
**Lis-le en entier avant de commencer.** Il porte les arbitrages D1→D18 et l'état
réel de ce qui est déjà livré. Tiens-le à jour au fil des lots : une décision qui
n'y est pas écrite n'existe pas.

Branche : `ff-001-quotidien-du-coach`. Aucune autre. Aucun push.

---

## Ce que tu fais quand c'est ambigu — LA RÈGLE CENTRALE

**Tu ne t'arrêtes jamais pour demander un arbitrage. Tu tranches.**

Quand une question de conception se présente :

1. Cherche d'abord la réponse **dans le dépôt** — un arbitrage existant, une
   fiche, un commentaire qui dit pourquoi. La plupart des questions y sont déjà
   répondues, et la réponse du dépôt l'emporte sur ton intuition.
2. Sinon, choisis **l'option la plus réversible** : celle qu'on peut défaire
   sans migration de données, sans changer un comportement en production, sans
   réécrire un écran.
3. Consigne la décision dans le registre **et** dans ta synthèse, sous cette
   forme : *ce que j'ai décidé · les options écartées · pourquoi · ce que ça
   coûterait de revenir dessus.*

Une décision prise seule et écrite vaut mieux qu'un chantier arrêté à 3 h du
matin. Une décision prise seule et **tue** est une faute.

**Ce qui s'arrête vraiment**, et ce n'est pas un arbitrage : ce qu'un agent ne
*peut* pas faire. Secrets, deploy, `db push`, `config push` — le hook les bloque
et c'est voulu. Tu ne contournes pas : tu notes la commande exacte dans la
synthèse finale, sous « à lancer par toi », et tu continues sur le reste.

---

## Les interdits absolus

- `supabase secrets set/unset` · `db reset` · `db push` · `functions deploy` ·
  `config push` · `projects/branches delete` · `link`. Un hook les bloque.
- `supabase stop` / `supabase start` / `docker restart` sur la pile.
  **La base locale est partagée avec d'autres sessions.** Une seule exception,
  décrite plus bas : le redémarrage du runtime edge, qui est parfois nécessaire.
- Toute suppression qui ne vise pas les lignes que TU as créées.
- Toucher au fichier `supabase/signing_keys.local.json` (il doit rester `[]`) ou
  recommenter `signing_keys_path`. Voir [JWT-HS256.md](JWT-HS256.md).

---

## Les cicatrices du dépôt — donne-les à CHAQUE sous-agent

Ce sont des heures déjà perdues. Aucun agent ne doit les redécouvrir.

**La pile locale**
- Crée les comptes par `POST /auth/v1/signup` en HTTP, **jamais en SQL** : GoTrue
  exige des chaînes vides et non NULL dans `confirmation_token, recovery_token,
  email_change_token_new, email_change, email_change_token_current, phone_change,
  phone_change_token, reauthentication_token`. Sinon : « Database error querying
  schema » au login.
- **GoTrue met les adresses en minuscules.** Un `delete … where email like
  'LaneA.%'` ne supprime rien. Utilise `ilike`.
- `auth.uid()` est **NULL sous service_role** : toute RPC gatée dessus doit être
  appelée sous un vrai JWT utilisateur, par PostgREST.
- Avant tout `deno test` : `for v in $(env | grep -o '^SUPABASE_[A-Z_]*'); do unset "$v"; done`
  — sinon 114 faux rouges.
- Avant tout run long : `bash scripts/local_extend_kong_functions_timeout.sh`
  (sans lui, des 502 fantômes qu'on prend pour des tours perdus).

**Le runtime edge**
- Il sert les modules `_shared` **en cache**. Après avoir modifié un `_shared/`,
  il faut `docker restart supabase_edge_runtime_Sophia_2` avant tout run réel,
  sinon on teste le code d'hier en croyant tester celui du jour.
- ⚠️ **Il surveille aussi les fichiers de fonction.** Éditer un
  `supabase/functions/*/index.ts` pendant qu'une requête réelle est en vol la
  tue. **Ne jamais coder et tester en même temps** : dans un lot, l'implémenteur
  finit, PUIS le testeur commence. Jamais en parallèle.

**Les migrations**
- Vérifie **toujours** que ta migration est bien au registre après
  `supabase migration up` :
  `select version from supabase_migrations.schema_migrations where version='…';`
  D'autres sessions créent des migrations, et une version appliquée hors séquence
  fait **sauter la tienne en silence**. Si c'est le cas : renumérote au-delà de
  la plus haute version connue, applique le fichier directement par `psql`, et
  n'applique **pas** les migrations des autres à leur place.
- Jamais deux fichiers portant la même version.

**La méthode**
- **La vérité est en base, jamais dans une réponse HTTP.** Chaque affirmation
  s'adosse à un `SELECT`.
- **Une garde a besoin d'un cas qui PASSE.** Une garde cassée refuse tout et
  ressemble trait pour trait à une garde qui marche. Pour chaque refus testé,
  teste aussi un cas qui doit aboutir.
- **Mute pour prouver.** Un test qui n'a jamais été vu rouge ne prouve rien :
  casse volontairement ce qu'il garde, vois-le échouer, restaure.
- **Jamais de matcher maison** sur du texte alimentaire (« laitue » ≠ « lait »).
  Utilise les modules existants.
- Un commentaire qui ment est pire qu'une absence de commentaire. Quand tu
  changes une règle, **corrige les commentaires qui l'énonçaient**.

---

## Le rythme

**Un lot à la fois, dans l'ordre.** Jamais deux lots en parallèle : ils
partagent la base et le runtime.

Pour chaque lot :

1. **Cadrer** — relis le registre et les fiches concernées. Écris en deux
   phrases ce que le lot change et ce qu'il risque de casser.
2. **Implémenter** — délègue à **un** sous-agent implémenteur. Un seul, pour
   qu'il n'y ait pas deux mains sur les mêmes fichiers.
3. **Attendre qu'il ait fini.** Puis seulement :
4. **Éprouver** — délègue à **un** sous-agent testeur, distinct, qui n'a pas
   écrit le code. Il teste en conditions réelles : vrais JWT, vraies RPC, vraies
   fonctions edge. Il doit produire au moins un cas qui passe et un cas qui mord,
   et muter ce qui est mutable.
5. **Re-vérifier toi-même** les deux ou trois affirmations décisives du testeur.
   Lors de la campagne précédente, deux affirmations de sous-agents étaient
   fausses ou périmées — dont une qui accusait un écran de ne rien dire alors
   qu'il le disait. Ne prends aucun rapport pour argent comptant.
6. **Fermer** — mets à jour le registre et les fiches touchées, lance
   `AGENT_GATE_STAGED_ONLY=0 bash scripts/agent-gate.sh` et exige le vert.
7. **Commiter** le lot, en français, sujet court et concret, en disant ce que le
   lot fait — jamais « lot 3 ». Puis **synthèse** (format plus bas), et lot
   suivant.

Si le gate est rouge, tu répares avant de passer au suivant. Un lot rouge ne se
commite pas.

---

## Les dix lots

Les dépendances sont réelles : ne saute pas un maillon.

### L1 — Le verrou de paiement au niveau du foyer (D13) · dépend de rien

Aujourd'hui `generate-meal-v1` n'a **aucune** garde de droit d'accès — mesuré :
un compte sans abonnement, essai expiré, coach insolvable, obtient HTTP 200 et
consomme 19 805 jetons. Et le 402 du foyer se contourne par cette porte : foyer
gelé, `generate-household-meal-v1` refuse, `generate-meal-v1` écrit quand même un
plan estampillé de ce foyer.

**Ce qu'il faut** : dans les **deux** générateurs, refuser **avant tout appel
modèle** quand le foyer de l'appelant n'est pas couvert
(`keel_household_is_covered`). Refus nommé, statut 402, message qui dit que rien
n'est effacé. Un appelant **sans foyer passe** : les comptes individuels existent
et ne demandent pas de foyer (D13).

À vérifier : le refus tombe en moins d'une seconde, la lecture de couverture ne
se fait qu'une fois, et un foyer couvert n'est pas gêné.

### L2 — La présence : qui est là, et quand (D14) · dépend de rien

Le maître compose pour tout le monde ; il doit pouvoir marquer qu'une bouche est
absente, et quand. Aujourd'hui `away_days` est lu sur la ligne du **propriétaire
seul** — l'absence individuelle d'un membre est un trou **déjà nommé** dans
`docs/fonctionnalites/composition-des-repas/FF-002-dire-son-absence.md` §9.

**Commence par lire FF-002 en entier.** Si elle spécifie déjà la forme, suis-la.
Sinon, tranche selon la règle centrale, en préférant la solution la plus
réversible — et écris l'arbitrage.

Rappel du contrat existant : une absence **ne supprime pas la session de
cuisson**, elle change les parts.

### L3 — La prise de main (D2, D7) · dépend de L1

C'est la bascule du modèle révisé. Un compte secondaire est **par défaut**
composé dans le plan du maître, comme une bouche ordinaire. S'il a **un plan
personnel validé** qui recouvre la fenêtre, le générateur de foyer doit
l'**exclure** de sa composition — il mange son plan à lui.

**Ce qu'il faut** : le roster servi au générateur de foyer distingue les bouches
prises en charge de celles qui ont pris la main. `servings` suit. Les parts
suivent. Et le plan du foyer dit, dans `generated_from`, **qui a été exclu et
pourquoi** — sans quoi le maître ne comprendra pas pourquoi il cuisine pour un de
moins.

Attention : « validé » veut dire `validated_at is not null`, `retired_at is
null`, `plan_kind = 'personal'`, et une fenêtre qui **recouvre** celle du foyer.

### L4 — Le moteur de fusion (D6, D15, D16) · dépend de L3

`generate-household-meal-v1` compose aujourd'hui ; il devra composer **puis
fusionner**. Ce qu'il garde absolument : la garde de gel, l'union des allergies
du foyer, la résolution du foyer, le plafond de bouches, et le fait de composer
pour **toutes** les bouches sans compte.

**L'échelle (D6), dans cet ordre** : ① même plat, ratios différents ② plats
différents, **même session de cuisson** ③ sessions séparées. Le moteur renonce
dès qu'un plat commun forcerait quelqu'un **hors de sa direction de service** —
c'est un critère vérifiable, pas un jugement de goût.

**L'intersection (D15)** : les fenêtres peuvent diverger — quelqu'un part en
voyage en milieu de semaine. La fusion opère sur l'intersection et s'arrête
d'elle-même là où les fenêtres se séparent.

**Le pivot (D16)** : une fusion ne touche que les jours **non encore consommés**.
Le point de bascule est le premier jour à venir, pas la date de courses.

**La provenance** : le plan fusionné enregistre `merged_from` — qui, quelle ligne
de plan, validée quand. Sans cette trace, l'avertissement de D8 est
**incalculable**.

Le plan personnel d'un secondaire n'est **jamais écrasé** par la fusion : elle
écrit une ligne neuve.

### L5 — La proposition, la défusion, le réglage discret (D8, D10, D17) · dépend de L4

La fusion est **manuelle**, déclenchée par le maître sur proposition : *« le plan
de X a été validé, voulez-vous le fusionner ? »*, et la proposition dit ce qui
est encore fusionnable : *« son plan couvre 5 jours, dont 2 déjà passés — je peux
fusionner les 3 restants. »*

Si quelqu'un valide **après** la fusion, le maître est averti et a trois sorties :
refaire le plan **sans** cette personne (*défusion*), refusionner à partir de son
plan, ou refuser. Dans tous les cas **la personne garde son plan**.

Consigne du prompt de défusion, **mot pour mot** : *rester au plus près du plan de
base, sans user X*. C'est ce qui préserve les courses déjà faites.

D17 : un réglage **discret** permet de ne plus se voir proposer la fusion pour une
personne donnée. Assumé comme un peu brutal, donc pas mis en avant.

### L6 — Mémoire et préférences par titulaire (D4) · dépend de L4

Le pont existe déjà et est paramétré par utilisateur
(`reconcileFoodPreferencesFor`) ; il n'est appelé que pour le maître. Il faut le
faire pour chaque titulaire.

**Deux exigences à poser en même temps, sinon elles mordent plus tard :**
- un **plafond de tokens par membre** — « tout ce qu'on sait » sur quatre
  personnes n'a aucune borne naturelle et noierait la doctrine ;
- la **garde de non-divulgation** étendue à la composition. Le plan est lu par
  **tout le foyer** : `household_portions.ts` porte déjà la règle pour les
  assiettes (*« NEVER state a reason, a goal, a calorie count… »*). Si la mémoire
  d'un membre remonte à la composition, la garde remonte avec elle. Sinon le menu
  de la semaine devient l'endroit où on apprend que quelqu'un a repris un régime.

### L7 — Le plafond de fusions (D11) · dépend de L4

`N + 3` fusions par foyer et par semaine ISO, N = comptes actifs du foyer.
Compté **en base**, jamais dans le client. Refus nommé `merge_quota_exhausted`,
sur le modèle du `household_frozen` existant. Les générations individuelles
gardent leur propre limite par personne : elles ne sont pas au frais du foyer.

### L8 — Les écrans (D9) · dépend de L4 et L5

Le maître **accède** à tous les plans, mais sa surface de cuisine n'affiche **que
le plan qu'il cuisine**. Un plan validé non fusionné n'y apparaît pas : le but
est de simplifier sa cuisine, pas de lui faire suivre N plans. Un secondaire voit
le plan du foyer et le sien, pas ceux des autres.

Ce qui n'a pas fusionné doit être **visible et attribué à la divergence**, pas à
une personne — c'est là que vit toute la vertu pédagogique du modèle.

Et l'écran d'un secondaire doit **dire qu'il peut prendre la main**. Si personne
ne le dit, la posture par défaut est invisible et les 2 € redeviennent un siège
muet.

### L9 — La date de naissance (D18) · dépend de rien

Sans elle, l'âge vaut `unknown`, `goalApplies` refuse, et l'objectif déclaré
n'atteint jamais l'assiette. Pour une bouche **sans compte** : sur sa fiche, ce
qui existe déjà. Pour le **maître** : dans son « about you ». **Pas à
l'inscription.** Vérifie d'abord si le champ existe déjà sur cet écran.

### L10 — QA réelle · dépend de tout

Un foyer à objectifs divergents, monté par les vraies RPC sous de vrais jetons.
À prouver : la prise de main, l'inclusion par défaut de qui n'a rien fait, la
fusion, la défusion, le repli séparé, les fenêtres décalées, le pivot au premier
jour non consommé, le plafond, et le gel qui ne se contourne plus.

Découpe en plusieurs sous-agents parallèles **seulement à ce stade** — plus
personne n'écrit de code pendant la QA, donc le runtime ne bougera pas.

---

## La synthèse après chaque lot

Courte, dense, honnête. Toujours ces six points :

1. **Ce que le lot fait maintenant**, en deux phrases.
2. **Ce qui le prouve** — les commandes et les sorties observées, pas des
   promesses. Le cas qui passe autant que le cas qui mord.
3. **Les décisions prises seules** : ce que j'ai décidé · les options écartées ·
   pourquoi · ce que coûterait un retour en arrière.
4. **Ce que ça défait** — comportements changés, fiches corrigées, commentaires
   qui mentaient.
5. **Ce que je n'ai pas pu vérifier**, et pourquoi.
6. **L'empreinte** : base propre, aucune ligne d'une autre session touchée, gate
   vert, commit fait.

---

## La synthèse finale — celle que je lirai au réveil

En tête, et dans cet ordre :

1. **Les questions qui attendent une réponse de moi**, chacune avec la décision
   que tu as prise en attendant, les options écartées, et ce que coûterait de
   revenir dessus.
2. **Ce qui reste à lancer par moi** — les commandes bloquées par le hook,
   copiables telles quelles.
3. **Les lots faits**, une ligne chacun.
4. **Les lots non faits**, et la raison exacte.
5. **Les défauts trouvés en chemin et non corrigés**, avec `file:line`.
6. **L'état de la base et du dépôt** : empreinte, gate, commits.

Trois questions sont **déjà ouvertes** avant même de commencer, garde-les dans la
synthèse finale même si rien ne les touche :

- Les **comptes individuels sans foyer** restent sans garde de paiement. L1 ferme
  la porte du foyer ; un compte solo continue de générer sans droit vérifié.
- **`generate-week-plan-v1`** — le troisième générateur — n'a jamais été testé par
  aucune campagne.
- **Comment un secondaire apprend qu'il peut prendre la main** (L8 doit y
  répondre ; si L8 n'est pas atteint, la question reste entière).

---

## Pour finir

Ne me réveille pas. Décide, écris pourquoi, avance. Je veux trouver au réveil un
chantier qui a progressé et un compte rendu qui ne me cache rien — y compris ce
qui a raté.
