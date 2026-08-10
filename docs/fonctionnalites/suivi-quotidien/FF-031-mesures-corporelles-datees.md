# FF-031 · Une mesure du corps est datée à l'instant, pas à la semaine

| | |
|---|---|
| **Identifiant** | `FF-031-mesures-corporelles-datees` |
| **Statut** | 🟠 En cours |
| **Date** | 2026-08-10 |
| **Autorité produit** | [`docs/keel/MODEL.md`](../../keel/MODEL.md), [`docs/keel/CONTRACT.md`](../../keel/CONTRACT.md) (R4 — stockage SI), [FF-021](../conversation/FF-021-le-plancher-de-restriction-alimentaire.md) le plancher TCA, [FF-008](../conversation/FF-008-le-poids-annonce.md) le poids annoncé |
| **Dépend de** | `restriction_guard.ts` (🟢 livré), `body_measure_floor.ts` (🟢 livré, câblé), `weekly_reviews` |
| **Effort estimé** | 3 jours |

---

## 1. Le problème

Un élève se pèse lundi (98,5), mercredi (98,1), vendredi (97,9). Le produit
n'en garde **qu'un seul chiffre** : 97,9. Les deux autres n'ont jamais existé.
Et l'écran ne lui rend même pas le vendredi : il lui rend « week of 3 Aug », le
lundi, parce que la seule adresse que le poids possède dans ce produit est une
**ligne de semaine**.

`weekly_reviews` est unique sur `(user_id, week_start_date) WHERE
plan_version_id IS NULL`. Le poids y vit dans `biofeedback.weight_kg`. Les trois
gestes qui l'écrivent — le point du dimanche, la carte des mesures de
`/app/plan`, la déclaration en conversation — écrivent tous **la même case**, et
`writeDeclaredBodyMeasure` porte le commentaire qui l'assume :

> La dernière déclaration gagne, quelle que soit sa source.

Ce que ça coûte de ne rien faire, dans l'ordre de gravité :

1. **Le plancher TCA est nourri au chiffre le plus bruyant de la semaine.**
   `restriction_guard` déclenche `rapid_weight_loss` au-dessus de 1,2 %/semaine
   sur 14 jours — soit ≈ 1,9 kg pour quelqu'un de 80 kg. La variation d'eau d'un
   jour à l'autre est **du même ordre**. Une pesée du vendredi soir contre une
   pesée du lundi matin fabrique ou efface une alerte, et personne ne peut le
   savoir après coup puisque les autres pesées n'ont pas été gardées.
2. **L'élève qui se pèse tous les jours travaille pour rien.** Six mesures sur
   sept sont détruites à l'écriture.
3. **La date affichée est fausse.** Une mesure du vendredi est présentée sous le
   lundi de sa semaine, sur `/app/plan` comme dans le tableau « Week by week ».

## 2. Job stories

- **Quand** je me pèse tous les matins parce que c'est mon rituel, **je veux**
  que chaque pesée reste, **pour que** ma courbe soit la mienne et pas un point
  par semaine tiré au sort par le hasard du jour où j'ai pensé à le dire.
- **Quand** je me trompe en tapant mon poids et que je le corrige dans la
  minute, **je veux** que la correction gagne, **pour que** le produit ne garde
  pas un chiffre que je viens de démentir.
- **Quand** je perds du poids trop vite sans m'en rendre compte, **je veux** que
  la ceinture qui doit le voir regarde une moyenne et pas un jour, **pour
  qu'**elle morde quand il faut et se taise quand il ne faut pas.

## 3. Périmètre

### Dans le périmètre

- Une table de **mesures corporelles datées** : `student_body_measures`.
- Les trois écrivains y écrivent, **en plus** de leur écriture actuelle
  (§6 R7 — double écriture transitoire, avec sa condition de retrait).
- Une **dérivation hebdomadaire** pure, qui rend au plancher TCA exactement la
  forme qu'il attend aujourd'hui.
- Les lecteurs basculent sur la table : `restriction_runtime`,
  `student_body_io`, `bodyMeasures.datedMeasures`, le tableau « Week by week »
  de `/app/plan`.
- L'export RGPD (`account-export-v1`) et le contrat de cycle de vie
  (`keel_gdpr_lifecycle_test.PIVOT_TABLES`).
- La **migration de l'existant** : chaque `biofeedback.weight_kg` /
  `waist_cm` déjà écrit devient une mesure datée.

### Hors périmètre — engageant

- ❌ **On ne touche pas au point du dimanche.** Le flow continue d'exister,
  continue d'écrire, et continue de porter les six axes de vivabilité. Son
  retrait est un chantier séparé, instruit dans `docs/keel/` — un retrait n'est
  pas une fonctionnalité.
- ❌ **On ne touche pas aux six axes** (`WEEKLY_AXES` : energy, hunger, sleep,
  digestion, mood, training). Ce ne sont pas des mesures corporelles, ils
  alimentent `focus_axis`, ils restent sur `weekly_reviews`.
- ❌ **On ne change pas le contrat de `restriction_guard`.** Ni ses seuils, ni
  la forme de son `RestrictionSnapshot`, ni ses messages d'erreur. §6 R2.
- ❌ **Aucune nouvelle surface d'affichage.** Pas de graphe quotidien, pas de
  moyenne mobile montrée à l'élève, aucun chiffre de plus qu'aujourd'hui.
  `SUPPRESSED_STUDENT_SURFACES` s'applique inchangé : `weight_readout` reste
  suspendu quand la ceinture est armée.
- ❌ **Aucune mesure d'énergie, aucun IMC, aucune cible dérivée.** `CONTRACT.md`
  et l'en-tête de `student_body_io.ts` — « un IMC n'est pas une mesure de
  l'élève, c'est un verdict sur lui ».
- ❌ **On ne reconnaît pas de nouvelles grandeurs.** `weight` et `waist`, comme
  `BodyMeasureKind` aujourd'hui. Pas de masse grasse, pas de tour de hanches.

## 4. Le circuit

```
   ÉCRITURE — trois gestes, un seul endroit de vérité
   ───────────────────────────────────────────────────────────────────────
   point du dimanche          carte /app/plan            phrase en chat
   (deterministic_buttons     (deterministic_buttons     (router/run.ts
    → writeWeeklyFlowReply     → writeWeeklyFlowReply     → writeDeclaredBodyMeasure)
    origin=weekly_form)        origin=measures_card)
          │                          │                          │
          │  source='sunday_flow'    │  source='plan_card'      │  source='chat'
          └──────────────┬───────────┴──────────────┬───────────┘
                         ▼                          │
            ┌────────────────────────────┐          │
            │  student_body_measures     │          │  ⟵ MIROIR TRANSITOIRE
            │  (user_id, measured_at,    │          │     l'écriture actuelle
            │   kind, value_si, source)  │          │     dans biofeedback.*
            │  APPEND-ONLY               │          │     reste, inchangée
            └────────────┬───────────────┘          ▼
                         │                  weekly_reviews.biofeedback
                         │                  { weight_kg, waist_cm, … }
   LECTURE               │
   ───────────────────── ▼ ────────────────────────────────────────────────
        deriveWeeklyBodySeries()   ← PURE, aucune I/O
          1. par JOUR : la DERNIÈRE mesure gagne (une correction gagne)
          2. par SEMAINE : la MOYENNE des jours, au dixième
          3. union avec les semaines de weekly_reviews (adhérence, couverture)
          4. série ascendante, sans doublon, tous les lundis
                         │
          ┌──────────────┼───────────────┬──────────────────┐
          ▼              ▼               ▼                  ▼
   restriction_guard  student_body_io  bodyMeasures     account-export-v1
   (contrat INCHANGÉ)  (chat, semaine)  (/app/plan)      (RGPD)
```

Le point où ça casse, et il est nommé : **l'union de l'étape 3**. La série que
le plancher lit doit contenir les semaines qui portent une mesure *et* les
semaines qui portent une adhérence. Ne garder que les secondes fait disparaître
une pesée de la ceinture ; ne garder que les premières fait disparaître le
déclencheur n° 4, qui a besoin de `self_rated_adherence` et de
`logging_coverage`. Ces deux données ne sont pas dans la même table et ne le
seront pas.

## 5. Modèle de données

### `public.student_body_measures` — neuve

| colonne | type | origine |
|---|---|---|
| `id` | `uuid pk` | `gen_random_uuid()` |
| `user_id` | `uuid not null → auth.users on delete cascade` | l'élève |
| `measured_at` | `timestamptz not null` | **saisi** : l'instant du geste, en heure LOCALE de l'élève résolue par le runtime. Jamais `now()` côté serveur |
| `local_date` | `date not null` | **saisi** : le jour de l'élève dans SON fuseau. Redondant avec `measured_at` et c'est voulu — voir R10 |
| `kind` | `text not null check in ('weight','waist')` | **saisi** : liste fermée, celle de `BodyMeasureKind` |
| `value_si` | `numeric not null` | **saisi**, en SI (kg, cm). CHECK de plausibilité par grandeur — R6 |
| `source` | `text not null check in ('sunday_flow','plan_card','chat')` | **dérivé** de l'écrivain. Liste fermée |
| `content_locale` | `text` | **saisi** quand une prose accompagne (chat) |
| `student_note` | `text` | **saisi** : les mots de l'élève, pour le chat. Auditabilité |
| `created_at` | `timestamptz not null default now()` | horloge serveur — c'est l'instant d'ÉCRITURE, distinct de `measured_at` |

**Aucune contrainte d'unicité.** La table est **append-only**, comme
`protocol_events` : une correction n'efface pas ce qu'elle corrige, elle
s'ajoute après. C'est la dérivation qui tranche (R3), pas la base.

Index : `(user_id, kind, local_date desc)` — la seule lecture qui existe.

### Ce qui NE bouge pas

`weekly_reviews.biofeedback` garde `weight_kg`, `waist_cm`, `source`,
`measured_at` et les six axes. Aucune colonne supprimée, aucune sémantique
changée. R7 porte la condition de retrait du miroir.

### La migration de l'existant

Chaque ligne `weekly_reviews` non-1:1 dont `biofeedback` porte un
`weight_kg` ou un `waist_cm` **dans les bornes** produit une ligne de mesure.
Le `measured_at` est reconstruit dans cet ordre :

1. `biofeedback.measured_at` s'il est lisible — c'est le cas des écritures de
   conversation, qui sont les seules à l'avoir jamais posé ;
2. sinon `weekly_reviews.created_at` s'il tombe dans `[week_start,
   week_start + 7 jours)` — c'est l'instant où le formulaire a atterri ;
3. sinon `week_start` à 12:00 UTC.

Le `source` est repris de `biofeedback.source` (`in_app_weekly_form` →
`sunday_flow`, `in_app_measures_card` → `plan_card`, `chat` → `chat`), et vaut
`sunday_flow` par défaut quand la clé est absente : c'était le seul écrivain
avant la carte des mesures. Une valeur hors bornes est **sautée et comptée**,
jamais tronquée ni écrite : elle vient d'une unité mal lue, et la faire entrer
casserait la ceinture en aval au lieu de la nourrir.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | La granularité de stockage d'une mesure corporelle est **l'instant**, jamais la semaine. Deux pesées le même jour produisent deux lignes. | C'est la décision du chantier. Toute agrégation est une LECTURE ; agréger à l'écriture détruit une donnée qu'on ne peut pas reconstituer. |
| **R2** | Le contrat de `restriction_guard.ts` ne change pas : ni `RestrictionSnapshot`, ni `RESTRICTION_THRESHOLDS`, ni ses `fail()`. La table le rejoint par une **fonction de dérivation**, pas par une modification du plancher. | C'est la ceinture la plus sensible du produit (`FF-021`, 🟢 livrée). Changer le stockage sous elle sans lui rendre la série hebdomadaire qu'elle exige la désarme — et une ceinture désarmée rend `restriction_flag: false`, c'est-à-dire « tout va bien ». |
| **R3** | La valeur hebdomadaire dérivée est la **moyenne des valeurs journalières** de la semaine, arrondie au dixième. Une journée vaut sa **dernière** mesure. | Le champ que le garde lit s'appelle `weight_7d_avg_kg` depuis le premier jour, et rien n'a jamais pu le calculer. Le bruit hydrique (±1–2 kg) est du même ordre que le seuil de 1,2 %/semaine : une moyenne le divise par √n, un point unique le laisse entier. **Une semaine à une seule mesure rend cette mesure** — donc toutes les données existantes et tous les cas de `restriction_guard_test.ts` gardent exactement leur résultat d'aujourd'hui. |
| **R4** | La série rendue au plancher est **l'union** des semaines qui portent une mesure et des semaines qui portent une ligne `weekly_reviews`. Une semaine sans mesure entre avec `weight_7d_avg_kg: null`. | Le déclencheur n° 1 lit le poids ; le n° 4 lit `self_rated_adherence` et `logging_coverage`, qui restent sur `weekly_reviews`. Ne lire qu'une source éteint l'un des deux **en silence**. |
| **R5** | La dérivation **jette** sur une série incohérente, exactement comme le garde : date illisible, doublon de semaine, ordre décroissant, semaine qui n'est pas un lundi. | R7 du CONTRACT, et la doctrine du plancher : « un garde qui rend `false` sur une entrée cassée est pire que pas de garde — c'est un garde qui rapporte que tout va bien ». |
| **R6** | Les bornes de plausibilité sont au **CHECK SQL** : 25–400 kg, 30–250 cm. Ce sont celles du formulaire (`weekly_flow.ts`, `weeklyCheckIn.ts`, `bodyMeasures.ts`, qui coïncident déjà et sont testées comme telles). | Un écran qui accepte ce que la base refuse fait saisir dans le vide. Les bornes plus étroites de `student_body_io` (25–350) et du plancher de chat (`BODY_MEASURE_BOUNDS`) restent des filtres de LECTURE et de RECONNAISSANCE — elles ne sont pas le stockage, et les confondre ferait échouer la migration sur des lignes déjà écrites. |
| **R7** | **Double écriture transitoire.** Les trois écrivains continuent d'écrire `biofeedback.weight_kg` / `waist_cm` exactement comme aujourd'hui, et écrivent **en plus** dans la table. **Condition de retrait du miroir** : quand aucun lecteur de `biofeedback.weight_kg` ne subsiste — vérifié par `grep` sur le code ET sur `pg_proc.prosrc` ET sur les vues, les trois épreuves d'absence — et pas avant. | Ce dépôt a déjà payé la bascule sèche : un écrivain déplacé, un lecteur oublié, une carte définitivement vide et une ceinture armée sur un coffre vide. Le miroir coûte une écriture ; son absence coûte une détection. Le retrait est un lot à part, avec sa preuve. |
| **R8** | L'écriture dans la table est **relue** avant d'être annoncée. Une écriture qu'on n'a pas vue atterrir n'est pas une écriture. | Vérité d'exécution. `writeDeclaredBodyMeasure` le fait déjà (`readBack`) ; le nouveau chemin ne relâche pas la règle. |
| **R9** | Une panne d'écriture dans la table **ne fait pas échouer** l'écriture miroir, et réciproquement. Chaque échec est journalisé nommément. | Tant que le miroir existe, perdre les deux pour une panne de l'un serait une régression sur un chemin qui marche aujourd'hui. Le contraire — avaler l'erreur en silence — est interdit par R5. |
| **R10** | `measured_at` et `local_date` viennent de l'**heure locale de l'élève**, résolue par le runtime. Jamais `now()` ni `current_date`. | Un fait dont la date dépend du serveur qui l'a écrit est la famille de bugs nocturnes que ce dépôt a déjà payée (`student_hunger_reports` porte le même commentaire). `local_date` est stockée plutôt que dérivée de `measured_at` pour que la dérivation ne refasse pas, en SQL ou en TS, une conversion de fuseau que l'écrivain avait déjà faite juste. |
| **R11** | La table entre dans l'**export RGPD** (`account-export-v1`) et dans `PIVOT_TABLES` de `keel_gdpr_lifecycle_test.ts`, dans le même lot que sa création. | Cicatrice connue et déjà payée deux fois : « une table s'ajoute en une migration, et rien dans le dépôt ne la réclame au cycle de vie ». La purge est couverte par `on delete cascade`. |
| **R12** | Aucune surface d'affichage nouvelle. Le poids reste suspendu (`weight_readout` ∈ `SUPPRESSED_STUDENT_SURFACES`) quand la ceinture est armée, y compris pour les mesures journalières. | Un produit qui refuse de montrer un poids à un élève à risque ne doit pas le lui rendre par la porte d'à côté. La granularité change ; la doctrine d'affichage ne change pas. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| **« Le plancher TCA ne mord plus et personne ne le voit. »** La dérivation rend une série vide, tronquée, ou sans les semaines qui portent un poids. `evaluateRestrictionGuard` rend `restriction_flag: false` sans lever quoi que ce soit, et l'écran de l'élève reste normal. | **C'est le mode qui compte, et il est silencieux par construction.** Trois filets, et aucun n'est un log : (1) la dérivation **jette** sur une série incohérente (R5) ; (2) un test bout-à-bout arme la ceinture depuis la table réelle, du geste d'écriture jusqu'au `restriction_flag: true` — le patron de `body_measure_arms_restriction_guard_test.ts`, qui existe précisément parce que « les trois maillons peuvent chacun être justes et la chaîne cassée » ; (3) le miroir `biofeedback` reste vivant (R7), donc le chemin d'aujourd'hui continue de nourrir le garde tant que le nouveau n'est pas prouvé. |
| Une semaine porte des mesures mais **aucune ligne `weekly_reviews`** (élève qui ne fait que parler à Sophia). | Elle entre dans la série avec son poids, `self_rated_adherence: null`, `logging_coverage_days: null` (R4). Le déclencheur n° 1 la voit ; le n° 4 se désarme faute de prémisse, ce qu'il fait déjà pour une semaine sans auto-évaluation. |
| Une semaine porte une ligne `weekly_reviews` mais **aucune mesure**. | Elle entre avec `weight_7d_avg_kg: null`. `weeklyLossPct` rend `null` sur un côté absent : la paire est ignorée, pas comptée comme une perte de 100 %. Comportement identique à aujourd'hui. |
| L'élève **se corrige** : « 87… pardon, 78 » dans le même tour ou dix minutes après. | Deux lignes existent, la dernière du jour gagne (R3). La moyenne de la semaine n'est **jamais** (87 + 78)/2 — c'est le piège exact que « la dernière du jour gagne » ferme, et il est testé. |
| L'élève **se pèse deux fois dans la journée** (matin et soir). | Le soir gagne, et c'est le coût assumé de la règle de correction : on ne sait pas distinguer une seconde pesée d'une correction. Assumé et écrit ici plutôt que découvert plus tard ; §11 le garde ouvert. |
| L'écriture dans la table **échoue** (contrainte, panne). | Le miroir `biofeedback` est écrit quand même, l'élève reçoit son accusé, et l'échec est journalisé nommément avec `user_id`, `kind` et le motif (R9). Le produit dégrade au comportement d'aujourd'hui, il ne perd pas la mesure. |
| L'écriture **miroir** échoue alors que la table a reçu la ligne. | Symétrique : la mesure est gardée, l'échec est journalisé. La dérivation lit la table, donc la ceinture reste nourrie. |
| La migration rencontre une valeur **hors bornes** déjà en base (unité mal lue historique). | La ligne est **sautée et comptée** (`RAISE NOTICE` avec le décompte). Elle n'est ni tronquée ni écrite : les lecteurs la filtrent déjà aujourd'hui, elle n'a donc jamais rien alimenté. |
| Deux écritures **concurrentes** pour le même élève au même instant. | Aucune contrainte d'unicité, donc aucun 23505 : les deux lignes entrent, la dérivation tranche à la lecture. C'est le bénéfice direct de l'append-only. |
| Le miroir et la table **divergent** (l'un écrit, l'autre pas, sur un chemin oublié). | Détectable et détecté : la dérivation lit la table, `datedMeasures` lit la table, et un écart se voit à l'écran. Le vrai risque est l'inverse — un lecteur oublié qui reste sur le miroir et affiche un chiffre périmé. C'est pour ça que R7 conditionne le retrait du miroir aux **trois** épreuves d'absence et pas à un `grep`. |

## 8. Critères d'acceptation

```gherkin
Étant donné un élève qui déclare 98,5 kg lundi, 98,1 mercredi et 97,9 vendredi
Quand on relit ses mesures
Alors les trois existent, chacune à sa date
Et la valeur dérivée de la semaine est 98,2 kg
```

```gherkin
Étant donné un élève qui n'a qu'une seule mesure dans la semaine
Quand la série hebdomadaire est dérivée
Alors la valeur de la semaine est exactement cette mesure
Et le résultat de restriction_guard est identique à celui d'avant ce chantier
```

```gherkin
Étant donné un élève qui tape 87 puis se corrige à 78 le même jour
Quand la valeur du jour est dérivée
Alors elle vaut 78
Et jamais 82,5
```

```gherkin
Étant donné un élève qui perd plus de 1,2 %/semaine sur 14 jours,
  et dont toutes les mesures ont été écrites depuis la conversation
Quand le plancher TCA est évalué sur la série dérivée
Alors restriction_flag est true
Et le déclencheur rapid_weight_loss est présent
```

```gherkin
Étant donné une série dérivée qui contiendrait deux fois la même semaine
Quand on la construit
Alors la dérivation jette
Et le message nomme la semaine dupliquée
```

```gherkin
Étant donné une semaine qui porte une auto-évaluation mais aucune mesure
Quand la série est dérivée
Alors la semaine est présente avec weight_7d_avg_kg à null
Et self_rated_adherence et logging_coverage_days sont ceux de weekly_reviews
```

```gherkin
Étant donné un élève dont la base porte déjà des poids dans biofeedback
Quand la migration est appliquée
Alors chaque poids dans les bornes est devenu une mesure datée
Et la date est celle de biofeedback.measured_at quand elle existait
```

```gherkin
Étant donné un élève qui demande l'export de ses données
Quand l'archive est produite
Alors elle contient ses mesures corporelles datées
Et keel_gdpr_lifecycle_test réclame la table dans PIVOT_TABLES
```

## 9. Rabbit holes

- **Réécrire `restriction_guard` « tant qu'on y est ».** La tentation est
  réelle : le garde compare des semaines alors qu'il pourrait comparer des
  moyennes glissantes sur n'importe quelle fenêtre. C'est un autre chantier,
  avec sa propre revue clinique. Ici on lui rend sa série et rien d'autre —
  R2. Le premier symptôme qu'on y est tombé : un fichier de test de
  `restriction_guard` modifié.
- **Faire de la dérivation un lecteur de base.** Elle doit être **pure**, comme
  le garde. Tout ce qui peut être faux (SQL, jsonb, fuseaux) vit dans la couche
  IO ; tout ce qui décide reste testable sans base. C'est la frontière de tout
  `_shared/keel/`, et c'est elle qui rend les cas limites atteignables.
- **La moyenne, et la semaine à une mesure.** La forme naïve — moyenner sans
  passer par le jour — transforme une correction en milieu de gué. La forme qui
  tient est en deux temps : dernier du jour, puis moyenne des jours. Les deux se
  ressemblent et ne donnent pas le même résultat.
- **Le lundi.** `restriction_guard` exige que l'écart entre deux semaines soit un
  multiple de 7 jours. La seule façon de le garantir est que **toutes** les clés
  de semaine soient des lundis ISO. `weekStartOfLocalDate` le fait déjà ; le
  refaire à la main dans la dérivation, en SQL ou en JS, est l'endroit où le
  décalage d'un jour entre.
- **Le fuseau de `measured_at`.** Une `timestamptz` écrite depuis l'heure locale
  et relue en UTC change de jour pour la moitié de la planète. D'où
  `local_date` stockée à côté (R10) : la dérivation groupe sur elle, jamais sur
  une conversion refaite après coup.
- **Croire que la double écriture protège de tout.** Elle protège des lecteurs
  oubliés ; elle ne protège pas d'un écrivain oublié. L'audit des écrivains se
  fait sur les **appelants**, commentaires retirés — le `grep` naïf compte des
  morts pour des vivants, cicatrice connue.

## 10. Ce qu'on mesure

**Que ça marche :**

- Le nombre de mesures par élève actif et par semaine. Aujourd'hui il vaut ≤ 1
  par construction ; s'il ne dépasse jamais 1 après livraison, le chantier n'a
  rien apporté à personne et le problème n'était pas celui-là.
- La part des semaines dont la valeur dérivée s'appuie sur ≥ 3 jours. C'est la
  part où le bruit hydrique est réellement amorti — c'est-à-dire la part où le
  plancher TCA lit enfin ce que son champ promettait.
- Zéro écart entre la série dérivée et la série lue depuis `biofeedback` pour
  les élèves à une mesure par semaine, en continu tant que le miroir existe.
  C'est la preuve vivante que la bascule n'a rien changé là où elle ne devait
  rien changer.

**La contre-mesure, celle qui dirait que ça coûte plus que ça ne rapporte :**

- **Le nombre de déclenchements `rapid_weight_loss` par élève et par mois.**
  S'il *baisse* après livraison alors que les trajectoires n'ont pas changé, la
  moyenne a **amorti une détection** au lieu d'amortir du bruit — et c'est le
  seul résultat de ce chantier qui serait pire que de n'avoir rien fait. Il se
  surveille sur les mêmes élèves avant/après, pas sur la flotte.
- Le nombre d'échecs d'écriture journalisés (R9). Non nul en régime établi =
  la table est plus fragile que la case qu'elle remplace.

## 11. Questions ouvertes

1. **Deux pesées volontaires le même jour.** « La dernière gagne » est la règle
   de correction, et elle écrase la pesée du matin par celle du soir. La forme
   correcte demanderait de distinguer une correction d'une seconde mesure —
   par une fenêtre de temps courte, ou par un geste explicite. Rien n'est
   décidé ; la règle actuelle est écrite en R3 et son coût en §7.
2. **Le retrait du miroir `biofeedback`.** R7 en donne la condition, pas la
   date. C'est un lot à part, et il ne s'ouvre pas avant que la table ait tourné
   en réel.
3. **Les mesures du passé.** « La semaine dernière je pesais 85 kg » est
   aujourd'hui **refusée** par `body_measure_floor` (`DISARM`), parce que la
   revue de semaine ne savait pas ranger un passé. Cette table, elle, sait :
   `measured_at` accepte n'importe quelle date. Rouvrir ce refus est tentant et
   n'est **pas** fait ici — le plancher devrait alors extraire une date en plus
   d'une valeur, ce qui est une reconnaissance d'un autre ordre. La question
   reste ouverte, et le refus reste en place tant qu'elle l'est.
4. **La fenêtre de la moyenne.** Elle est calée sur la semaine ISO parce que
   c'est ce que le garde compare. Une vraie moyenne glissante sur 7 jours
   (n'importe quels 7 jours) serait plus juste et sortirait du contrat R2.
   Voir « rabbit holes ».
