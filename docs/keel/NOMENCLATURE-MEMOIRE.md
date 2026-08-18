# Nomenclature — ce que Sophia retient, et sous quelle forme

> Écrit le 2026-08-18. **Autorité** pour les trois prompts de classification
> (retour sur brouillon · questionnaire de fin de plan · memorizer sur la
> conversation) et pour la surface « Ce que Sophia sait de toi ».
>
> **Règle fondatrice, héritée de `plan_feedback.ts` :**
> *une catégorie dont aucun générateur ne sait quoi faire ne se crée pas.*
> Chaque famille ci-dessous a un lecteur, nommé en face.

---

## 1. Le défaut que ce document ferme

Aujourd'hui, le durable est **une liste plate de phrases** —
`practical_constraints.food_preferences`, des chaînes de texte libre. Ça a trois
conséquences mesurées :

1. **Le générateur ne peut rien filtrer.** Il reçoit tout, dans le désordre, et
   doit deviner ce qui est une exclusion et ce qui est un goût.
2. **L'écran ne peut rien ranger.** Une liste de phrases n'a pas de sections.
3. **La réconciliation est grossière** — c'est ce qui a produit, en run réel,
   `["Aime le brocoli s'il est rôti.", "N'aime pas le brocoli."]` dans le même
   prompt.

Et le questionnaire de fin de plan (`meal_plan_feedback`) n'entre nulle part :
**zéro lecteur backend**, vérifié le 2026-08-18.

---

## 2. Les trois axes — toute information retenue en porte trois

### Axe 1 · `kind` — de quoi on parle *(liste FERMÉE)*

Liste fermée, à la main, jamais inférée — même doctrine que `DIETARY_REGIMES` et
`SAFETY_CONSTRAINT_KINDS`. Une famille qui n'est pas ici ne s'écrit pas.

| `kind` | Ce que c'est | **Le lecteur** |
|---|---|---|
| `food.exclude` | un aliment ou un plat dont on ne veut plus | la consigne de composition |
| `food.prefer` | un aliment ou un plat qu'on veut revoir | la consigne de composition |
| `method.avoid` | une préparation qui ne passe pas (frit, cru, épicé) | la consigne de composition |
| `method.prefer` | une préparation qui plaît | la consigne de composition |
| `portion.adjust` | **une mesure**, pas un goût : trop / pas assez, **pour QUI** | l'enveloppe (`envelopeFor`) |
| `rhythm.set` | un moment qui existe ou n'existe pas, pour quelqu'un | le rythme alimentaire (6 moments) |
| `logistics.set` | jours de cuisine, temps, difficulté, variété, budget | `practical_constraints` |
| `craving` | une envie ponctuelle — « des fajitas la semaine prochaine » | le bloc d'envies |

⛔ **Il n'existe AUCUN `kind` de sécurité, et c'est structurel.** Une allergie, une
intolérance, un régime, une condition médicale ne peuvent **jamais** naître d'un
retour ou d'une conversation classée : elles ont leur table
(`student_safety_constraints`), synchrone, sans ranking, avec consentement. La
carte filtre déjà `sensitive`/`safety` **dans la requête**. Quelqu'un qui coche
« plus jamais » sur un plat aux arachides n'a pas déclaré une allergie.

### Axe 2 · `scope` — combien de temps ça vit

| `scope` | Durée | Où ça vit | Où ça se voit |
|---|---|---|---|
| `durable` | jusqu'à ce que la personne l'enlève, ou que la mémoire la démente | `practical_constraints` | « Ce que Sophia sait de toi », section par `kind` |
| `next_plan` | **jusqu'à la fin de la semaine ancrée** (`ancre + 6`), puis expire — tranché au §7 | `practical_constraints.retained_next_plan`, forme `[{item, anchor}]` | « Pour la semaine prochaine », avec sa date d'expiration |

⚠️ **Le `next_plan` ne vit PAS sur le canal d'envies** — ce document l'a dit
jusqu'au 2026-08-18, et c'était faux. `household_envy_submissions.household_id`
est `not null` et **une personne seule n'a pas de foyer** (`SetupPage.tsx` : « le
solo ne crée pas de foyer ») : un compte solo n'aurait jamais pu porter un seul
`next_plan`, alors que l'entrée du produit est à une bouche. Le canal d'envies
reste ce qu'il a toujours été : **la phrase libre du maître, pour tout le foyer**.
Un magasin par portée, identique pour un solo et pour un foyer.

C'est la frontière que le dépôt a **déjà tranchée une fois** dans le prompt —
`situation` (stable) séparé de `context` (daté) — avec ce motif écrit : *« une
contrainte d'une semaine s'y lisait comme une propriété permanente »*. On
réutilise la frontière, on n'en invente pas une seconde.

⚠️ **`craving` est TOUJOURS `next_plan`.** Une envie qui devient durable cesse
d'être une envie et devient une habitude qu'on n'a pas demandée.
⚠️ **`portion.adjust` est TOUJOURS `durable`.** Un corps ne change pas d'une
semaine sur l'autre ; un ajustement qui expire ferait re-servir la mauvaise part
au plan suivant, et la personne devrait le redire chaque semaine.

### Axe 3 · `subject` — de qui on parle

| `subject` | Sens |
|---|---|
| `household` | tout le monde à table — **le défaut** |
| `member:<member_id>` | une bouche précise |

**Jamais un prénom, jamais un texte.** `member_id`, comme partout ailleurs : la
cicatrice du dépôt est écrite (« laitue » ≠ « lait », 12 faux positifs sur 12) et
« Poulet pour Zoé et Marc » ne se résout pas par un prénom dans un titre.

> ### ⚠️ La règle du sujet non précisé, et son exception
>
> **Si le sujet n'est pas précisé, ça concerne tout le monde** — ta règle, et
> elle est bonne : c'est le cas le plus fréquent et le moins surprenant.
>
> **UNE exception, et elle n'est pas négociable :** un `portion.adjust` **à la
> baisse** ne s'applique pas à un mineur sans sujet explicite. Réduire l'assiette
> d'un enfant en croissance à partir d'une remarque non attribuée d'un adulte est
> exactement le geste silencieux que le reste du produit interdit (plancher TCA,
> consentement de restriction). Le mineur est simplement exclu de l'ajustement ;
> rien n'échoue, et le constat le dit.

---

## 3. La forme écrite

Chaque élément retenu, quel que soit son producteur :

```jsonc
{
  "kind": "food.exclude",         // liste fermée, §2 axe 1
  "scope": "durable",             // durable | next_plan
  "subject": "household",         // household | member:<uuid>
  "text": "les rochers coco",     // CE QUE LA PERSONNE VOIT ET PEUT ÉDITER
  "value": null,                  // structuré, quand le kind en a un (§4)
  "source": "questionnaire",      // written | questionnaire | conversation | draft_note
  "at": "2026-08-18",             // le jour où ça a été dit
  "item": "…uuid…",               // le souvenir d'origine — "" si écrit à la main
  "confidence": 0.82              // seulement si source = conversation
}
```

**`text` est obligatoire et il est la vérité affichée.** Une entrée dont on ne
saurait pas écrire la phrase que la personne lira ne s'écrit pas — c'est ce qui
rend la promesse « rien d'opaque » vérifiable ligne à ligne.

**`item` vide protège l'entrée.** C'est déjà la règle en place : une ligne sans
`item` est réputée écrite par la personne, et le memorizer ne peut pas la retirer.
Elle lui appartient.

**`source` ne se déduit jamais d'un vide.** Le dépôt le dit déjà : l'absence
d'origine est ambiguë (« tapée à la main » autant que « lien perdu »), et s'en
servir comme signature rendrait les deux indiscernables pour toujours. On doit
pouvoir dire « ça, c'est toi qui l'as écrit » plutôt que « ça, je l'ai déduit de
ce que tu m'as dit mardi ».

---

## 4. Le champ `value`, par famille

Seules trois familles en ont un ; les autres se contentent de leur `text`.

| `kind` | `value` |
|---|---|
| `portion.adjust` | `{ "direction": "down" \| "up", "magnitude": "slight" \| "clear" }` |
| `rhythm.set` | `{ "occasion": "breakfast"…"before_bed", "present": true \| false }` |
| `logistics.set` | `{ "field": "cook_days" \| "cooking_time_min" \| "recipe_difficulty" \| "variety" \| "budget_amount", "value": … }` |

⛔ **Aucun gramme, aucune calorie dans `portion.adjust`.** Une personne dit « trop
gros », pas « −80 g ». Traduire son adverbe en nombre à la classification serait
fabriquer une précision qu'elle n'a pas donnée — et le produit refuse d'afficher
des nombres à qui n'en a pas demandé. C'est l'enveloppe qui traduit, en aval, où
le plancher TCA s'applique.

---

## 5. Qui a le droit d'écrire quoi — la matrice des trois prompts

C'est la partie que les trois prompts recopient.

| | `food.*` `method.*` | `portion.adjust` | `rhythm.set` | `logistics.set` | `craving` |
|---|---|---|---|---|---|
| **① Après retour sur le brouillon** | ✅ `next_plan` par défaut | ⛔ | ⛔ | ✅ | ✅ |
| **② Après le questionnaire de fin de plan** | ✅ `durable` | ✅ **seul producteur** | ✅ | ✅ | ⛔ |
| **③ Memorizer (conversation, minuit)** | ✅ **proposé**, jamais gardé d'office | ⛔ **renvoie au questionnaire** | ✅ proposé | ✅ proposé | ✅ |

### Pourquoi ces trois interdits

**① Le brouillon ne produit pas de durable par défaut.** Un retour sur un
brouillon parle de CE plan (« pas de poisson cette semaine »). Le promouvoir en
permanent transformerait une humeur de mardi en règle de vie. La personne peut
toujours le rendre durable depuis la carte, explicitement.

**② Le questionnaire est le SEUL producteur de `portion.adjust`, et c'est le point
central.** Une mesure a besoin d'un sujet, et **la conversation ne sait pas
l'attribuer** : « les portions étaient trop grosses », dans un foyer de quatre, ne
désigne personne. Le questionnaire, lui, pose la question avec la liste du foyer
sous les yeux — c'est une question fermée, pas une inférence. Fiable, et
attribuable.

**③ Quand le dispatcher détecte un retour de sizing en conversation, il ne classe
pas : il renvoie.** Une phrase, une seule, du type *« ça, note-le au bilan de fin
de plan — j'ai besoin de savoir pour qui. »* Le produit préfère une question de
plus à une part fausse.

⚠️ **Rien de ce que le memorizer propose n'entre sans un « Keep ».** C'est la
règle en place, et elle tient toute la transparence : `memory_items` est un
magasin **probabiliste** (confiance, ranking, statut `candidate`), et la
confirmation est ce qui transforme une inférence en fait déclaré. Le seuil de
promotion reste **0,70**, là où le memorizer s'autorise à créer dès 0,55.

---

## 6. « Ce que Sophia sait de toi » — la surface

⚠️ **Elle n'est montée aujourd'hui que sur `/app/plan`
(`StudentWeekPlanPage:2329`). Elle doit devenir une destination à elle**, sinon la
promesse « rien d'opaque » dépend du hasard d'un défilement.

Les sections suivent les `kind`, dans cet ordre :

1. **Ce que tu ne veux plus** — `food.exclude`, `method.avoid`
2. **Ce que tu veux revoir** — `food.prefer`, `method.prefer`
3. **Les portions** — `portion.adjust`, **groupées par personne**
4. **Ton rythme** — `rhythm.set`, par personne
5. **Ta cuisine** — `logistics.set`
6. **Pour la semaine prochaine** — tout le `next_plan`, **avec sa date
   d'expiration affichée**

Sur chaque ligne, trois choses **et pas moins** : d'où elle vient (`source` en
clair — « tu l'as écrit », « je l'ai retenu de mardi », « tu l'as coché au bilan »),
un moyen de l'éditer, un moyen de la supprimer.

**La section 6 affiche son expiration.** Une envie qui disparaît sans prévenir se
lit comme une perte de données ; une envie datée se lit comme une envie.

---

## 7. Ce que ce document ne tranche pas

- ~~**La durée de vie exacte d'un `next_plan`**~~ — **TRANCHÉ le 2026-08-18
  (lot 1B) : jusqu'à la fin de la fenêtre du plan.**

  Un `next_plan` vit **jusqu'à la fin de la semaine à laquelle il est ancré** —
  le lundi ISO de son `anchor`, stocké à côté de l'item dans
  `practical_constraints.retained_next_plan` (forme `[{item, anchor}]`). Il est
  vivant tant que `jour ≤ ancre + 6` ; il n'est plus là à partir de `ancre + 7`.

  ⚠️ **L'ancre est la semaine VISÉE, jamais `item.at`.** `at` est le jour où la
  chose a été dite ; l'ancre est la semaine qu'elle vise. Quelqu'un qui écrit le
  dimanche pour la semaine suivante a `at = dimanche` et `anchor = lundi` : dater
  l'expiration sur `at` ferait mourir son envie le lendemain matin — sept jours
  annoncés, un seul rendu. C'est pour ça que l'ancre est **stockée**, et pas
  déduite.

  L'expiration est **calculée à la lecture** — `retained_next_plan.ts`,
  `isNextPlanItemAlive(item, writtenAt, today)`. **Aucune colonne `expired`,
  aucun `status`, aucun job de nettoyage, aucune suppression de ligne** : *« un
  second état à invalider est un état dont l'écrivain finit par disparaître »*
  (`accident.ts`). L'ancre n'est pas un état — c'est une donnée que personne n'a
  à venir corriger.

  **Motif, dans cet ordre.**
  ① **L'ancre est une donnée, pas un état.** « Cette ligne vise la semaine du
  24 » est un fait que personne n'a à venir corriger plus tard. C'est ce qui rend
  l'expiration calculable **sans écrivain** — et c'est la seule forme d'ancrage
  qui survit à un producteur qui tombe.
  ② **La date d'expiration est connue à l'écriture, donc affichable** — ce que le
  §6 exige mot pour mot (« avec sa date d'expiration affichée »).
  ③ **Régénérer deux fois la même semaine garde l'envie.** Le couple
  brouillon/relance est le geste le plus courant du produit. « J'ai demandé des
  fajitas cette semaine » est ce que la personne a voulu dire ; « pour exactement
  un appui de bouton » ne l'est pas.

  **Option écartée : « exactement une génération ».** Elle demande de *savoir*
  qu'une génération a eu lieu, et ça coûte l'une de ces deux choses — les deux
  refusées. Soit un drapeau `consumed` sur l'item : c'est le second état
  interdit, et son écrivain est un générateur dont ce dépôt a **mesuré** qu'il
  peut échouer *après* l'appel modèle (un run rendu `400` avait déjà touché la
  ligne) — l'item finirait consommé deux fois, ou jamais. Soit une comparaison
  avec la dernière ligne de `student_generated_meals` : celle-là est dérivée,
  donc honnête, et elle reste refusée pour une raison produit — l'envie
  disparaîtrait **entre deux clics du même bouton**, la seconde génération de la
  même minute composant sans elle, sans un mot. *« Une envie qui disparaît sans
  prévenir se lit comme une perte de données. »* Et dans les deux cas la date
  d'expiration est inconnue d'avance : le §6 tombe avec.

  **Le trou qui a fait déménager le magasin, et qui est refermé.** La première
  version de ce lot posait le `next_plan` sur le canal d'envies, comme le §2 axe
  2 le disait. Défaut mesuré pendant l'écriture : une personne **seule n'a pas de
  foyer** (`SetupPage.tsx` : « le solo ne crée pas de foyer ») et
  `household_envy_submissions.household_id` est `not null` — un compte solo
  n'aurait jamais pu porter un seul `next_plan`, alors que le lot 2B en produit
  **par défaut** et que l'entrée du produit est à une bouche. Ses retours sur
  brouillon auraient été soit refusés, soit basculés en `durable`, c'est-à-dire
  « une humeur de mardi transformée en règle de vie » — ce que le §5 interdit.
  Arbitrage humain du 2026-08-18 : le magasin déménage dans
  `practical_constraints`, sous une clé distincte du durable. Une seule clé de
  lecture — `user_id` — et le solo est servi **comme tout le monde**.
- **La déduplication entre producteurs** : si le questionnaire et le memorizer
  proposent la même exclusion le même jour, laquelle gagne ? Proposition : le
  questionnaire, parce qu'il est fermé et attribué — mais ce n'est pas mesuré.
- **La migration des `food_preferences` existantes** — des phrases plates, sans
  `kind`. Elles ne peuvent pas être reclassées automatiquement sans inférence.
  Proposition : elles restent lisibles telles quelles dans une section
  « Anciennes notes », et se reclassent quand la personne les édite. On ne devine
  pas rétroactivement.
