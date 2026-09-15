# Bilan hebdomadaire alimentaire — statut au 2026-08-06

Branche `dewhatsapp`. **Codé, testé, éprouvé en run réel sur la base locale. NON DÉPLOYÉ.**

---

## Le trou qu'on ferme

L'élève remplissait huit champs le dimanche soir — six axes 1-5, un poids, un tour de
taille — et recevait :

> *« Got it — thanks for taking the two minutes. »*

Deux minutes de son temps contre une phrase, sur le seul moment de la semaine où il
s'arrête et regarde ce qu'il a fait. Le point hebdomadaire **mesurait, il ne rendait rien**.

---

## Les trois temps, et pourquoi cet ordre

| Quand | Qui | Quoi |
|---|---|---|
| **1. Avant l'envoi**, dimanche 18-21 h locale | `keel-weekly-flow-v1` | calcule la lecture de la semaine et la **GÈLE** dans `weekly_reviews.week_facts` |
| **2. Au retour du formulaire** (parfois le lendemain) | `_shared/chat/deterministic_buttons.ts` | **relit** le gel, y ajoute le biofeedback qui vient d'arriver, compose le bilan |
| **3. Toute la semaine suivante** | `sophia-brain/router/run.ts` | sert le **même** gel au contexte de chaque tour |

**Rien n'est recalculé, et c'est la décision structurante.** La question posée dans le
bilan est choisie par le calcul du temps 1. Entre l'envoi et la réponse, une nuit peut
passer et l'élève loguer son petit-déjeuner : recalculer ferait bouger le chiffre sous la
question déjà posée, et la conversation de la semaine suivante en citerait un troisième.
Chacune de ces valeurs serait juste ; ensemble elles sont indéfendables.

---

## Ce que le bilan lit, et contre quoi

**Les faits** : `protocol_events` de la fenêtre, `disqualified_reason is null` (une coche
retirée survit en base — sans ce filtre on félicite pour un plat que l'élève vient d'enlever).
Les groupes d'aliments viennent de **deux sources dédupliquées par ligne** : la colonne
`food_group_ref` (déclaration explicite, une ligne par composant nommé) et
`recognized.food_groups_present` (ce que la vision a vu — une photo ne crédite qu'un groupe
en colonne alors qu'elle en montre souvent trois).

**Le mètre-étalon** : `coach_food_rules` + `coach_timing_rules`, compilés et **déjà filtrés
sur l'objectif de cet élève** par `loadPublishedProtocol`. Cinq verdicts par ligne :
`honoured` / `short` / `absent` / `over` / `unknown`.

`unknown` n'est pas un raté du calcul : « à chaque repas » n'est ni vérifiable ni réfutable
sur des faits qui ne portent pas de repas — seule l'absence l'est. Les règles d'horaire
(`no_group_after`, `group_at_slot`) ne sont **pas jugées** et sont **comptées**
(`unevaluatedRules`) : la majorité des faits arrive sans créneau, et un verdict d'horaire
rendu sur le quart des faits serait faux dans le sens qui accuse.

---

## Les décisions produit, et pourquoi elles sont là

### 1. Le dénominateur est ce qu'on a vu, jamais sept
Un élève qui logue 5 jours sur 7 n'a pas « raté deux jours » : il a deux jours dont on ne
sait rien. Toutes les phrases comptent sur les jours **observés** et le disent (« 2 des 5
jours que j'ai vus »). Le seuil de lecture existait déjà et n'a pas été redoublé :
`LOGGING_COVERAGE_MIN_DAYS = 4`, un jour lu = ≥ 2 faits. **Sous le seuil, la semaine
alimentaire n'est pas lue du tout** — pas de description, pas de direction, pas de question,
et surtout pas « tu n'as pas assez logué », qui est un reproche passif.

### 2. On n'interroge JAMAIS ce qui a été mangé
`Q6_NUTRITION_LAYER.md` §2.5 : le consensus international (n=87) classe le monitoring type
comptage et la prescription rigide parmi les stratégies qui **augmentent** le risque de TCA.
« Pourquoi as-tu mangé X » est un interrogatoire ; « qu'est-ce qui a rendu X difficile » est
du coaching. La question porte donc toujours sur ce qui **manque** (`absent` avant `short`,
`core` avant `secondary`), jamais sur un dépassement — celui-ci se constate. Une seule par
bilan, et **jamais deux semaines de suite sur le même groupe**.

### 3. Un compte n'est pas un score
`MODEL.md` §3 : sans prescription individuelle, l'adhérence n'a pas d'objet. La ceinture
`adherence_language` refuse pourcentage, score, série, observance, compliance. « 4 des 5
lignes de ton coach, soit 80 % » est composé de nombres tous vrais et reste hors modèle.

### 4. Le fait est la félicitation — la ligne du 06/08 tient
La ceinture `qualifies_the_week` est **la même liste** que celle du message du soir
(`findQualifyingVerdict`, importée et non recopiée) : pas de « belle semaine », pas de
« bravo », pas de « continue comme ça ». Sa condition de désarmement voyage avec elle :
qualifier un **aliment** reste permis.

C'est un arbitrage explicite contre la formulation initiale de la demande (« si c'est dans
la bonne direction alors félicitation »). La reconnaissance passe par le fait et la
conviction du coach qu'il honore — *« les légumes verts sur 5 des 5 jours que j'ai vus,
c'est exactement ce sur quoi ton coach construit les assiettes »* — ce qui est une meilleure
félicitation, et qui ne se transforme pas en papier peint en quatre semaines. **À rouvrir
si l'usage montre que c'est trop sec.**

### 5. On n'ouvre jamais sur un évitement tenu
Trouvé en run réel : le bilan s'ouvrait sur *« sweetened_beverage : 0 des 5 jours que j'ai
vus, c'est ce que ton coach demande »*. Un décompte à zéro se lit comme un échec, et
féliciter quelqu'un de ne pas avoir bu de soda est creux. L'ouverture porte ce que l'élève
**a fait**.

---

## Il n'y a PAS de machine à états de sous-flow

C'était la demande (« un sous flow qui permette de discuter de la semaine »), et la réponse
est un **contexte**, pas un état. Le bloc du bilan vit dans chaque tour de la semaine
suivante, il porte la question posée et le « pourquoi » du coach sur la ligne concernée, et
la conversation continue normalement — mémoire, safety, doctrine, tout inchangé.

Deux raisons : la question est **ouverte** (la contraindre à trois boutons fabriquerait la
raison au lieu de l'entendre, et c'est précisément la raison qu'on veut voir arriver dans la
mémoire) ; et un flow est un piège à fermer — ce dépôt en a déjà payé un
(`safety-crisis-flow-no-exit-on-denial`).

Le bloc est **le dernier des cinq** injectés par `withKeelDoctrineBlock` : le budget de
prompt tronque par la queue, et l'ordre est un classement par coût de perte (verrou clinique
→ allergènes → doctrine → note du coach → bilan). Il **porte ses dates** et interdit
explicitement « cette semaine » hors de la plage : il survit toute la semaine suivante, et
un chiffre exact rattaché à la mauvaise période est un chiffre faux que rien ne permet de
contester.

---

## Ce qui a été éprouvé, et comment

**Tests** : 44 assertions dans `_shared/keel/week_review_test.ts`. Suite complète
`_shared/keel/` + `_shared/chat/` : **1279 verts, 0 rouge**.

**Jointure code↔base** (la classe de défaut n°1 de ce dépôt) :
`_shared/keel/weekly_flow_schema_test.sql` rejoue la séquence exacte de l'écrivain contre la
vraie base — colonnes SELECTionnées, INSERT, relecture du jsonb par la requête du contexte
de tour, UPDATE-par-id au second passage. **11 assertions PASS.**

> ⚠️ **La liste de colonnes de ce test avait DÉRIVÉ.** Elle nommait encore
> `whatsapp_opted_in`, `whatsapp_opted_out_at`, `phone_number` — les trois colonnes que le
> chantier de-whatsapp a sorties du SELECT — pendant que le code lisait `proactive_muted_at`.
> Le test restait vert en gardant une liste que plus personne ne lisait : la panne qu'il
> existe pour attraper, un cran plus haut. Corrigée pour les deux crons.

**Run réel** (`docs/nutrition-pivot/qa-web/W1_week_review_real_run.ts`, rejouable, avec son
seed `W1_week_review_seed.sql`) : élève réel, coach réel avec 5 règles alimentaires + 1 règle
temporelle, objectif `fat_loss`. Chaîne complète lue-calculée-gelée-relue-composée. Le bilan
composé, dans la langue de l'élève :

> *« Amara, tu as rapporté de la protéine maigre sur les 5 jours renseignés. Les œufs
> apparaissent 0 fois dans tes 10 repas. Qu'est-ce qui a rendu la consommation d'au moins
> 1 œuf par jour difficile pour toi ? »*

La question est tombée sur les œufs (`absent`), **pas** sur les fritures ni les céréales
raffinées (`over`) — la décision produit n°2, vérifiée sur de vraies données.

Trois défauts trouvés par ce run et corrigés (aucun n'était visible aux tests) : l'ouverture
sur un évitement tenu, le slug de base de données rendu tel quel dans la bulle
(`sweetened_beverage:` — le titre compilé retombe sur le slug quand le coach n'a posé aucun
terme), et l'énumération des six lignes d'affilée par le modèle, qui donne un tableau et pas
un bilan.

---

## Ce qui reste ouvert

1. **Rien n'est déployé.** La migration `20260806210000` n'est appliquée qu'en local.
   Fonctions à déployer : `keel-weekly-flow-v1`, `chat-inbound-v1`, `sophia-brain`.

2. **Le budget de composition est mesuré sur un modèle local instable.**
   `COMPOSE_TIMEOUT_MS = 45_000`, contre 12 s pour le fait du soir et la relance — parce que
   celles-là composent dans un cron qui balaie la base, alors qu'ici on répond à quelqu'un
   qui attend. Trois mesures locales : 79 s, 39 s, 37 s. À 12 s le composeur ne serait
   **jamais** parti. **À re-mesurer en production** : si la latence réelle est ≪ 45 s, le
   plafond doit redescendre ; si elle dépasse, le repli déterministe devient le cas nominal
   et il faut le savoir (`body_source` est journalisé pour ça).

3. **La portée du bloc s'arrête au composeur générique.** `withKeelDoctrineBlock` a un seul
   appelant alors que `finalVisibleText` en a six : sur une lane de skill, la conversation ne
   voit pas le bilan. C'est la cicatrice `keel-doctrine-injected-one-lane-locked-six`, elle
   n'est pas refermée par ce lot.

4. **La boucle mémoire → génération n'est PAS bouclée.** C'est le point le plus important de
   la liste. Le memorizer captera la raison que l'élève donne (« je ne cuisine pas le matin »),
   le recall la ressortira en conversation — et `generate-meal-v1` / `generate-week-plan-v1`
   **ne liront rien** : leur seul pont vers la mémoire est
   `food_preference_promotion` → `student_goals.practical_constraints.food_preferences`, qui
   exige un « Keep » explicite de l'élève sur une carte. La suite naturelle est d'étendre ce
   pont (une clé de plus dans le même jsonb, même mécanique d'origine), pas d'ouvrir un
   second magasin — cf. `student_facts` / `recurring_meals`, droppées pour ça.

5. **Le rouge de `run_keel_conversation_loop_test.ts`** (« a reported fact writes ONE
   protocol_events row ») **préexiste** à ce lot : vérifié en remettant mes fichiers de côté.
   `token-lint` a 7 violations, toutes dans `labels.fr.ts`, également antérieures.
