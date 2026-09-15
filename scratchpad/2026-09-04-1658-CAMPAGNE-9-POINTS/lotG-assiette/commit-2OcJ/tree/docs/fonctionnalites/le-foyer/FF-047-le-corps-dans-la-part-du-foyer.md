# FF-047 · Le corps dans la part du foyer

| | |
|---|---|
| **Identifiant** | `FF-047-le-corps-dans-la-part-du-foyer` |
| **Statut** | 🟢 Livrée — commit `c95706ee` (2026-08-10) |
| **Date** | 2026-08-10 |
| **Autorité produit** | [CONTRACT.md](../../keel/CONTRACT.md) (les calories restent interdites) · [le-foyer/README.md](README.md) (F7, F8) · [FF-030](../composition-des-repas/FF-030-le-contexte-de-composition.md) (le corps sur le chemin individuel) |
| **Dépend de** | [FF-044](FF-044-la-bouche-sans-compte.md) (`member_id`, l'état d'âge) · `_shared/keel/restriction_runtime.ts` (le plancher TCA) · `_shared/keel/student_body_io.ts` |
| **Effort estimé** | livré — 1 jour |

---

## 1. Le problème

Réclamer son profil ne changeait **rien** à la portion servie par le foyer.

Le chemin individuel lit taille, bande d'âge, sexe, dernier poids et dernier
tour de taille, et les fait entrer dans la consigne
(`generate-meal-v1`, `loadStudentBody` + `mealBodyContextFrom`). Le chemin du
foyer n'en lisait **rien** : zéro occurrence de `loadStudentBody`, de
`mealBodyContextFrom` ou de `heightCm`. Même avec un compte, même avec un poids
suivi chaque semaine, le générateur du foyer ne connaissait d'une personne qu'un
jeton d'objectif et un état d'âge.

Le cran 2 du modèle — *« la frontière d'intake est le corps, pas le compte »* —
n'achetait donc rien là où on le vendait. On demandait un compte pour ouvrir un
cran qui n'existait pas côté foyer.

**Ce que ça coûte de ne rien faire.** [FF-048](FF-048-reclamer-son-profil.md) —
et le +2 €/mois qui va avec — se vend sur une promesse fausse : « ta part tient
compte de toi ». Une promesse de ce genre ne se découvre pas, elle s'use.

## 2. Job stories

> **Quand** je mesure 1,90 m et que ma compagne mesure 1,60 m, **je veux** que
> nos parts du même plat diffèrent, **pour que** ni l'un ni l'autre ne se
> resserve en douce.

> **Quand** je réclame mon profil et que je suis déjà mes pesées, **je veux**
> que ça change quelque chose dans mon assiette, **pour que** l'accès vaille
> son prix.

> **Quand** la consigne est lue à voix haute au dîner, **je veux** qu'elle dise
> quoi servir et jamais pourquoi, **pour que** personne à cette table n'apprenne
> mon poids.

## 3. Périmètre

### Dans le périmètre
- Le chargement du corps **par bouche qui a un compte**, une lecture par bouche,
  chacune sous son propre `try`.
- Le plancher TCA **par membre**, fail-closed.
- L'enrichissement de la ligne du membre dans le brief de portions.
- Le **rearmement de la ceinture de sortie** sur ce que le corps rend dicible.
- La **mesure** du coût, pas son estimation.

### ⚠️ Renversement partiel du 2026-08-12 — lire avant le reste de la fiche

> **Par qui** : l'utilisateur, en connaissance de cause, après que la contrainte
> et sa raison lui ont été exposées.
> **Contre quoi** : le premier point « hors périmètre » ci-dessous, et le
> **cran 2** de la table d'intake du [README](README.md) (« le corps : compte
> **requis** »).

> « il faut la taille le poids et l'âge et le gender **obligatoirement** (même
> quand ils ont pas de compte secondaire !) »

**Ce qui a changé : on COLLECTE.** Chaque bouche — mineure comprise, sans compte
comprise — porte désormais taille, poids et sexe, dans une table à part
(`household_member_bodies`, migration `20260812220000`). Ils servent à
**dimensionner dans le moteur** : le MIN du tronc commun et les add-ons par
bouche (voir [FF-043](FF-043-la-resolution-foyer.md)).

**Ce qui n'a PAS changé, et c'est la moitié qui portait vraiment la règle : on
n'ÉNONCE pas.** La raison de l'interdit n'était pas de ne pas *savoir*, c'était
de ne pas *dire*. Cette moitié-là est intacte :

- ✅ `householdBodyFacts` rend toujours `[]` hors adulte — la suppression de
  `meal_body.ts:247-248` **reste en place**. Vérifié sur la chaîne du run réel du
  2026-08-12 : aucun des six chiffres corporels des deux enfants n'apparaît dans
  le brief de portions, et leurs lignes sont **exactement** celles d'avant
  (`- Lea: child-size share of the same dish`) ;
- ✅ aucun fait corporel de mineur à l'écran, ni dans un log nominatif ;
- ✅ aucune calorie, aucun besoin, aucun IMC, aucune cible, nulle part.

**Ce que le renversement coûte, écrit noir sur blanc.** Le cran 2 gardait le
corps derrière un compte pour une raison **technique** : `restriction_guard` — le
plancher TCA — a besoin d'une **série** de poids, et une bouche sans compte n'en
a pas. « Le produit ne collecte pas ce qu'il ne sait pas protéger. » On collecte
désormais un poids sans série, donc **sans plancher derrière**. La contrepartie
est structurelle et non déclarative : ce corps-là **n'achète qu'une maintenance**
(`maintenanceEnvelopeFromBody`, `childEnvelopeFromBody`, aucune des deux
n'accepte de paramètre d'objectif), et une maintenance ne peut ni creuser un
déficit ni poser un plafond de densité. Il n'y a rien à protéger d'une bande qui
ne retire rien.

### Hors périmètre — engageant
- ~~❌ **Aucun fait corporel pour un mineur, ni pour un âge inconnu** — même avec
  un compte.~~ **RENVERSÉ le 2026-08-12 pour la COLLECTE, maintenu pour
  l'ÉNONCIATION** (voir l'encadré ci-dessus). Poser « 152 cm, 41 kg » à côté du
  prénom d'un enfant rend la direction `fat_loss` **dérivable** sans qu'on l'ait
  demandée (`meal_body.ts:247`) — et c'est pourquoi ça n'entre toujours dans
  aucun prompt.
- ❌ **Aucun fait corporel pour qui est sous plancher TCA**
  (`meal_body.ts:248`).
- ❌ **Aucune calorie, aucun besoin énergétique, aucun IMC, aucune catégorie,
  aucune cible.** Taille + poids + âge + sexe est la signature d'entrée d'une
  formule de métabolisme de base, et un modèle sait la calculer sans qu'on le
  lui demande. Livrer un compteur par la porte de derrière serait pire que le
  livrer, puisque personne ne l'aurait décidé.
- ❌ **Aucune mention d'absence.** Pas de « height: not stated ». Voir R5.
- ❌ **Aucun fait corporel dans la SORTIE.** L'entrée gagne des faits, la sortie
  n'en gagne aucun (F7).

## 4. Le circuit

```
   generate-household-meal-v1
        │
        │  members = [{memberId, userId|null}, …]
        ▼
   loadHouseholdMemberBodies(db, {members, todayLocalDate})
        │   EN PARALLÈLE, un `try` par bouche
        │
        ├── userId == null ──────────────► body: null, ZÉRO requête
        │
        └── userId != null
              │  1. evaluateRestrictionForStudent → plancher TCA
              │     restrictionFlag = true AU DÉPART  ← FAIL-CLOSED
              │  2. loadStudentBody + mealBodyContextFrom(…, restrictionFlag)
              ▼
        byMember: Map<member_id, MealBodyContext>
        issues:   [] ordonnées comme les membres, jamais comme les promesses
        reads:    le compteur, épinglé par deux tests
        │
        ▼
   buildPortionBrief(members)          household_portions.ts
        │  householdBodyFacts(body, ageState)   ← LES DEUX GARDES SONT ICI
        │    minor|unknown → []                   pas chez l'appelant
        │    restrictionFlag → []
        ▼
   "- Léa: child-size share of the same dish"
   "- Marc: full protein share… [height 186 cm; age band …; weight 84 kg,
      measured week of 2026-08-03]"
   + BODY_FACTS_CAVEAT (seulement si AU MOINS une bouche porte des faits)
        │
        ▼  le modèle
   sanitizePortionNote(note)   ← FORBIDDEN_PORTION_TERMS, bilingue,
        │                        `allowNegatedMentions: false`
        ▼
   note valide  ·  ou `null` = part standard, jamais une phrase amputée
```

## 5. Modèle de données

**Néant.** Cette fiche ne persiste rien : elle **lit** ce que
[FF-031](../suivi-quotidien/FF-031-mesures-corporelles-datees.md) et le profil
écrivent déjà, et le fait entrer dans un prompt. Aucune migration, aucune
colonne.

Le seul état neuf est en mémoire : `HouseholdBodies { byMember, issues, reads }`
(`_shared/keel/household_bodies.ts`), clé **`member_id`** et jamais `user_id` —
`userId` dit **où chercher**, `memberId` dit **à qui rendre**. Un résultat clé
sur `user_id` serait introuvable pour le brief de portions, et le repli
silencieux serait « personne n'a de corps ».

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | **Le plancher TCA est fail-CLOSED** : `restrictionFlag` part à `true` et n'est abaissé que par une lecture **réussie** | Se fermer rend exactement le produit d'hier (une portion dimensionnée sans le corps) ; s'ouvrir met un poids sous les yeux du modèle pour quelqu'un qu'on n'a pas su évaluer. Les deux coûts ne sont pas du même ordre. |
| R2 | **Le corps est best-effort, jamais bloquant** | L'arbitrage est déjà écrit sur le chemin individuel : *« refuser le dîner de quelqu'un parce qu'on n'a pas su lire sa balance serait la mauvaise moitié de l'arbitrage »*. ⚠️ À ne pas confondre avec les **allergies** ([FF-046](FF-046-l-allergie-d-une-bouche-sans-compte.md)), fail-closed au sens fort : elles arrêtent la génération. |
| R3 | **Les deux gardes vivent dans `householdBodyFacts`, pas chez l'appelant** | Une garde qu'un appelant applique est une garde que le **prochain** appelant oublie (FF-030 R5). Les deux paramètres sont **requis et positionnels**, donc il n'existe pas d'appel « partiel ». |
| R4 | **Une bouche sans compte ne coûte aucune requête** | Elle n'a ni profil ni mesures : l'interroger quand même serait N requêtes garanties vides par génération. Épinglé par un test (`withLeo.reads == withoutLeo.reads`). |
| R5 | **Quatre absences produisent la MÊME ligne** — sans compte, lecture échouée, sous plancher, rien saisi | Une ligne qui annonce un manque invite le modèle à le commenter ; et surtout le plancher TCA deviendrait **observable** dans le brief. Un membre marqué « on ne vous dira rien de lui » est un membre **désigné**. |
| R6 | **Le brief reste homogène à table** | Le foyer mixte est le cas nominal. Un modèle à qui on donne plus de matière sur une personne écrit spontanément une consigne plus longue et plus personnelle pour elle. Cette asymétrie **se lit à table** : elle annonce qui a rempli son profil et laisse entendre que la précision est une faveur. `BODY_FACTS_CAVEAT` le dit explicitement, et n'est ajouté que si au moins une bouche porte des faits. |
| R7 | **La ceinture de sortie est rearmée en même temps que l'entrée** | Une ceinture armée sur ce qu'on donnait **hier** est une ceinture désarmée. Vérifié avant correction : « 1,5 part vu ta taille », « a bigger share for your height », « à ton âge », « ton tour de taille » et « BMI » **passaient toutes**, dans les deux langues. Trois groupes ajoutés (`height`, `measurements`, `age`) plus `bmi`/`imc`, en **formes possessives uniquement**. |
| R8 | **Les unités nues restent hors liste** (`kg`, `cm`) | « Coupe les carottes en morceaux de 3 cm » est une consigne de service parfaitement légitime, et une ceinture qui mord dessus met la personne en part standard sans que personne comprenne pourquoi. Une ceinture qui mord sur tout se fait désarmer dans la semaine. |
| R9 | **Pas de réécriture : une mise à `null`** | On ne retire pas le mot fautif pour sauver la phrase. Une consigne amputée est illisible, et bricoler du texte de modèle produit des phrases dont personne ne répond. `null` = part standard, ce qui est vrai, lisible, et rendu par l'écran dans sa langue. |
| R10 | **La date voyage avec la mesure** | « 78 kg » ne dit rien ; « 78 kg, semaine du 30 juin » dit quelque chose. La retirer pour raccourcir la ligne ferait servir en août une pesée de février comme si c'était celle d'aujourd'hui. |
| R11 | **L'ordre des `issues` suit les membres, pas l'ordre d'arrivée des promesses** | Deux générations du même foyer doivent produire la même ligne, sinon relire « pourquoi Marc a-t-il eu une part standard ? » trois jours plus tard dépend de qui a répondu le premier ce soir-là. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Le plancher TCA d'une bouche est illisible | `restrictionFlag` reste `true` ⇒ **aucun** fait corporel pour elle. Journalisé nommément (`keel.household_meal.restriction_floor_unreadable`) : sans cette ligne, un plancher qui échoue en boucle est indiscernable d'un membre qui n'a jamais saisi de mesure. |
| Le corps d'une bouche est illisible | Sa ligne perd ses faits, la génération continue (`keel.household_meal.member_body_unreadable`, effet : *portion composée sans corps*). Les autres bouches ne sont pas emportées : chacune a son `try`. |
| Le modèle écrit « pour tes 84 kg » | **NON MORDU.** Trou connu n°2 du [README](README.md), écrit en toutes lettres au-dessus de la liste (`household_portions.ts:270-277`). Le moteur apparie des **séquences de mots** ; il n'a aucun moyen d'exprimer « un nombre suivi d'une unité, rattaché à une personne ». Le refermer demande soit une seconde ceinture d'un autre genre (une expression régulière nombre+unité), soit d'accepter les faux positifs des unités nues. C'est une décision de produit, elle n'est pas prise. |
| Le modèle écrit « une part plus généreuse **vu ta taille** » | Mordu depuis ce lot. La consigne tombe à `null`, la personne reçoit une part standard, la violation est tracée. |
| Le modèle nie le sujet (« sans parler de ton poids ») | Mordu **quand même** : `allowNegatedMentions: false`. Ce qu'on interdit n'est pas d'encourager le sujet, c'est de l'**évoquer** devant toute la table. |
| Quatre fuseaux horaires dans un foyer | Un seul calendrier : celui du compte maître. Faire la moyenne produirait une date que personne n'habite. |

## 8. Critères d'acceptation

```gherkin
Étant donné un foyer où Marc a un compte, une taille et une pesée récente
Et où Léa, 8 ans, n'a pas de compte
Quand le foyer génère un repas
Alors la ligne de brief de Marc porte ses faits corporels entre crochets
Et la ligne de Léa est exactement celle d'avant ce lot
```

```gherkin
Étant donné un membre dont le plancher de restriction est illisible
Quand le brief est construit
Alors sa ligne ne porte AUCUN fait corporel
Et la génération n'échoue pas
```

```gherkin
Étant donné une consigne de service rendue par le modèle qui contient « vu ta taille »
Quand elle est assainie
Alors elle est remplacée par null
Et la violation est tracée
```

```gherkin
Étant donné un foyer de deux bouches avec compte et une bouche sans compte
Quand les corps sont chargés
Alors le nombre de lectures est le même qu'avec seulement les deux comptes
```

## 9. Rabbit holes

- **Écrire un second format de faits corporels.** `mealBodyBlocks` existe et a
  déjà arbitré quoi dire et comment. En écrire un deuxième, c'est deux
  vocabulaires à garder alignés et deux ceintures à armer.
- **Appliquer les gardes chez l'appelant.** Ça marche, une fois. Le deuxième
  appelant oublie.
- **Ajouter `kg` et `cm` à la liste interdite.** Ça semble refermer le trou n°2
  et met en réalité des gens en part standard pour une consigne de découpe.
- **Estimer le coût au lieu de le mesurer.** La lecture du code disait **6**
  allers-retours par bouche avec compte ; le vrai chiffre est **7** — la lecture
  des mesures datées est cachée deux niveaux plus bas, dans la dérivation
  FF-031. Deux tests-cliquets épinglent le chiffre (`7`, `14` pour deux, `8`
  quand la bouche porte un engagement `measure='energy'`).
- **Les N lectures en série.** Elles ajouteraient N fois la latence d'un
  aller-retour à une composition qui attend déjà un modèle.

## 10. Ce qu'on mesure

- **La mesure :** part des consignes de service qui **diffèrent** entre deux
  membres d'un même foyer, adultes avec corps. Si elle est basse, le corps entre
  et ne change rien — donc la promesse de FF-048 reste creuse.
- **La contre-mesure :** taux de `sanitizePortionNote → null`. Chaque `null` est
  une personne qui reçoit une part standard **parce que le modèle a mal parlé**.
  Un taux qui monte avec l'arrivée du corps dit que la ceinture paie le lot plus
  cher qu'il ne rapporte.
- **Le coût :** 7 allers-retours par bouche avec compte, 0 sans. Un foyer de 8
  dont 4 comptes ⇒ 28 lectures par génération.

## 11. Questions ouvertes

1. **L'écho numérique nu.** Trou n°2, non refermé, et c'est une décision produit
   à prendre : seconde ceinture regex, ou faux positifs assumés.
2. **Aucun run réel avec appel Gemini.** Il faudrait une fixture avec foyer
   publié et deux comptes portant des mesures. Les quatre garanties du lot sont
   prouvées **au niveau où elles se décident** (six mutations donnent six
   rouges : plancher désarmé, appariement sur `user_id`, plancher fail-open,
   ligne sans faits, fil débranché, groupe `height` retiré) — pas au niveau du
   texte que le modèle produit.
3. ~~**Le mineur avec compte ne reçoit aucun fait corporel.**~~ **Tranché à
   moitié le 2026-08-12** : son corps est désormais **collecté** et **calculé**
   (il pèse dans le MIN et reçoit des add-ons), et il n'est toujours **pas
   énoncé** — `householdBodyFacts` rend `[]` hors adulte. Ce qui reste ouvert est
   plus étroit qu'avant : personne n'a mesuré ce que coûte, à un adolescent de
   seize ans qui suit son poids, de ne pas voir ses pesées entrer dans la
   consigne de service — seulement dans son dimensionnement.
4. **Le corps d'une bouche sans compte n'a pas de plancher TCA derrière lui.**
   C'est le prix nommé du renversement (encadré §3). La contrepartie retenue est
   structurelle — ce corps n'achète qu'une **maintenance** — et pas un contrôle.
   Ce qui n'est pas décidé : que faire le jour où un maître saisirait des poids
   décroissants pour un enfant. Rien ne le lit, rien ne le voit, rien ne
   l'alerte.
5. ~~**La table des corps est HORS de l'export RGPD.**~~ **Refermé le
   2026-08-12**, quelques heures après avoir été nommé — trou n°10 du
   [README](README.md), désormais partiel.
   - **Export** : `household_member_bodies` sort dans `mon_foyer.json`, clé
     `mon_corps_pour_les_parts`, **scopée sur SA ligne** (les `member_id` viennent
     de la lecture déjà filtrée sur `user_id = <lui>`, jamais du roster —
     exporter le roster des corps ferait de l'archive de l'un une divulgation
     médicale sur ses enfants). Vérifié en run réel : sur un foyer où trois
     bouches ont un corps, l'archive du maître en porte **une**.
   - **Purge** : `keel_household_purge_user` efface le corps dans ses **deux**
     branches — arbitrage différent de celui de `birth_date`, écrit dans la
     migration.
   - **Et l'archive le DIT** : `ce_qui_est_efface` était absent à côté de
     `ce_qui_survit_a_la_suppression`. Un export qui n'énumère que ce qu'il garde
     laisse croire qu'il garde tout.

   Ce qui reste ouvert du n°10 : **cinq** tables de foyer, dont
   `household_member_allergies` — une donnée de santé, sans `user_id`, qui
   entrerait par le même chemin que le corps.
