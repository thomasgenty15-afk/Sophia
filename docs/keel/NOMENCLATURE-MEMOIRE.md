# Nomenclature — ce que Sophia retient, et sous quelle forme

> Écrit le 2026-08-18. **Amendé le 2026-09-01 (lot M1) : le memorizer n'est
> plus un producteur — voir le §5.** Autorité pour les **deux** prompts de
> classification qui restent (retour sur brouillon · questionnaire de fin de
> plan) et pour la surface « Ce que Sophia sait de toi ».
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
`RetainedItem` : elles ont leur table (`student_safety_constraints`), synchrone,
sans ranking. La carte filtre déjà `sensitive`/`safety` **dans la requête**.
Quelqu'un qui coche « plus jamais » sur un plat aux arachides n'a pas déclaré une
allergie.

> ### ⚠️ CE QUE CETTE RÈGLE NE DIT PLUS — arbitrage du 2026-09-01
>
> Elle disait aussi : « … ne peuvent jamais naître d'un retour **ou d'une
> conversation classée** ». **C'est renversé, et c'est une décision produit
> explicite**, prise après mesure.
>
> **Ce qui a été mesuré.** Sur un tour réel, « Je suis allergique aux
> arachides » écrit dans un retour de plan donnait :
> `food.exclude · scope=next_plan · sujet=household`, **zéro** ligne dans
> `student_safety_constraints`, et `keel/safety_fallback fell_back=true`. Trois
> pertes en une : aucune ceinture en sortie (ce magasin nourrit un prompt, rien
> ne vérifie le résultat), aucune attribution, **et ça expirait le dimanche
> suivant**. La même phrase dite **en conversation** écrivait correctement dans
> la table. C'était donc la SURFACE qui décidait du sort d'une allergie.
>
> **La décision.** *« Si une personne parle d'une allergie, en vérité c'est une
> allergie. »* Le classifieur du retour de plan la range désormais **dans la
> table de sécurité**, pour la personne ou pour la bouche qu'elle nomme.
>
> **Ce qui remplace le consentement synchrone, et c'est la moitié qui compte.**
> La garantie n'est plus « on ne l'écrit pas sans demander », elle est
> **« on l'écrit, on le DIT, et ça se défait en un geste »** :
> · la personne est prévenue par la notification du soir (un ÉNONCÉ, qui ne
>   consomme pas le budget de demande — voir §T4) ;
> · le retrait existe déjà et il est à elle : `StudentHealthPage` +
>   `retract_student_safety_constraint`, et la table n'accepte QUE la
>   rétractation (`student_safety_constraints_retraction_only`).
>
> ⛔ **Les deux moitiés ne se livrent pas séparément.** Écrire sans prévenir
> serait une contrainte médicale posée dans le dos de quelqu'un ; prévenir sans
> pouvoir défaire serait pire. Un lot qui ne livrerait que l'écriture doit être
> refusé.
>
> ⚠️ **Ce qui NE change pas** : aucun `RetainedItem` ne porte de sécurité. La
> liste des huit `kind` reste fermée, et le classifieur continue de refuser d'y
> ranger une allergie. C'est un SECOND canal, à côté, vers une table qui a sa
> ceinture — pas un neuvième `kind`.

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
  "source": "questionnaire",      // written | questionnaire | draft_note
                                  //   + `conversation`, LU mais plus produit (§5)
  "at": "2026-08-18",             // le jour où ça a été dit
  "item": "…uuid…",               // le souvenir d'origine — "" si écrit à la main
  "confidence": 0.82,             // seulement si source = conversation (lignes anciennes)
  "quote": "…"                    // LOT M2 — la phrase de la personne qui a
                                  //   causé cette ligne. `null` pour `written`
                                  //   et pour les lignes d'avant M2.
}
```

> ### ⛔ `quote` — SANS ELLE, « DÉFAIRE » EST UN PARI (lot M2, 2026-09-01)
>
> Une ligne qui dit *« Poulet — aliments évités »* et rien d'autre pose à la
> personne une question à laquelle elle ne peut pas répondre : enlever, c'est
> peut-être défaire une erreur du produit, peut-être perdre une chose qu'elle a
> vraiment demandée trois semaines plus tôt. **Devant ce doute, on ne touche à
> rien — et le magasin ne décroît jamais.** C'est le mécanisme exact de la
> boule de neige.
>
> Avec la citation, la ligne devient *« parce que tu as dit “trop de poulet
> cette semaine” »*, et le geste est évident dans les deux sens. **C'est aussi
> ce qui donne la traçabilité gratuitement** : « pourquoi il n'y a pas de
> poulet ? » se répond en montrant un écran.
>
> **Les mots de la personne, verbatim.** Jamais une reformulation : une
> citation reformulée est une citation fausse, et elle est pire que pas de
> citation — elle lui fait croire qu'elle a dit une chose qu'elle n'a pas dite.
> · retour sur brouillon → la note telle qu'elle l'a tapée ;
> · bilan de fin de plan → *« la question qu'elle a lue » → « la réponse
> qu'elle a cliquée »*, dans sa langue, depuis `QUESTION_LABELS` /
> `OPTION_LABELS`. Le bilan répond par des JETONS (`too_much`) : citer le jeton
> ne citerait personne.
>
> ⚠️ **La citation est FIGÉE dans la langue du moment.** Elle n'est pas
> retraduite si la personne change de langue plus tard : ce sont les mots
> qu'elle a réellement lus et cliqués, et les traduire les falsifierait.
>
> ⛔ **L'obligation est à la PORTE D'ÉCRITURE, pas au parseur.**
> `parseRetainedItem` accepte `null` — sinon le lot effacerait toutes les
> lignes d'avant lui. C'est `persistRetainedItemsFor` qui refuse une écriture
> serveur non citée (`unquoted`, le 5ᵉ motif) : **rien de neuf n'entre sans sa
> cause, rien d'ancien ne disparaît.**
>
> ⛔ **Une citation sur une ligne `written` est un REFUS.** Son `text` EST sa
> phrase. Et surtout : `canProduce("written", …)` autorise TOUT, donc un
> producteur serveur qui se déclarerait `written` contournerait la matrice
> entière par un seul mot — sa citation le trahit.

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

## 5. Qui a le droit d'écrire quoi — la matrice des DEUX prompts

> ### ⛔ LA LIGNE ③ A ÉTÉ VIDÉE LE 2026-09-01 — lot M1
>
> **Le memorizer n'est plus un producteur.** Le chat ne classe plus rien : il
> **renvoie** vers le champ où la chose se pose. Autorité de la décision :
> `scratchpad/2026-08-21-DESIGN-MEMOIRE.md` §2.3 et §3.5 M1, qui contredit
> délibérément ce document sur ce point et le dit en toutes lettres.
>
> **Le motif, et ce n'est pas la qualité du classement.** Le modèle classait
> bien. Une phrase de chat n'a pas de **dénominateur** : « c'était trop » ne dit
> ni de quoi ni pour qui, « j'aime pas trop ça » ne nomme pas un plat. Le
> raisonnement du point ② ci-dessous — *une mesure a besoin d'un sujet* — vaut
> en réalité de **chaque** famille, pas seulement de `portion.adjust`. Et comme
> la règle du dépôt interdit de réécrire ce que quelqu'un a renseigné, le
> magasin que la conversation alimentait ne pouvait que **grandir**.
>
> **Ce que ça coûte, écrit ici pour que personne ne le redécouvre :** le chat
> cesse d'apprendre. *« Plus jamais de topinambour »* dit en passant demande
> désormais un geste. C'est un vrai coût, assumé : on perd de la captation
> passive, on gagne un système dont chaque décision s'explique en montrant un
> écran. Le cas de la personne qui ne suit jamais la redirection **reste
> ouvert** — c'est le seul endroit où ce design recule (design §2.10).
>
> ⚠️ **Le producteur est retiré, la `source` ne l'est pas.** Des lignes portent
> `source: "conversation"` en base : elles restent **lues**, visibles sur la
> carte avec leur origine, et retirables par la personne. C'est
> `canHold`/`couldProduce` (`retained_item.ts`) qui tient cette moitié.
> Supprimer la `source` les ferait disparaître sans un mot.
>
> ⛔ **Ne « rebranche » pas une famille par symétrie.** Une règle avec une
> exception n'est pas une règle : si le chat peut réécrire un aliment évité,
> pourquoi pas l'équipement — et six mois plus tard il écrit tout à nouveau,
> un bouton à la fois, sans que personne ne voie qu'on a reconstruit ce qu'on
> venait de supprimer.

C'est la partie que les prompts recopient.

| | `food.*` `method.*` | `portion.adjust` | `rhythm.set` | `logistics.set` | `craving` |
|---|---|---|---|---|---|
| **① Après retour sur le brouillon** | ✅ `next_plan` par défaut | ⛔ | ⛔ | ⛔ **écrit le champ** | ✅ |
| **② Après le questionnaire de fin de plan** | ✅ `durable` | ✅ **seul producteur** | ⛔ **écrit le champ** | ⛔ **écrit le champ** | ⛔ |
| **③ ~~Memorizer (conversation, minuit)~~** | ⛔ **renvoie au champ** | ⛔ **renvoie au bilan** | ⛔ **renvoie au champ** | ⛔ **renvoie au champ** | ⛔ |

> ### ⛔ `rhythm.set` ET `logistics.set` ONT QUITTÉ LE MAGASIN — lot M5, 2026-09-01
>
> Ils ne se RETIENNENT plus : ils **changent le champ que la personne voit** dans
> ses réglages (`_shared/keel/field_change.ts`, port
> `keel_write_field_changes_for`).
>
> **Le défaut fermé, et il était muet.** Un `logistics.set` retenu n'écrivait
> rien : les deux générateurs le posaient **en mémoire, à la lecture**, juste
> avant de composer (`logisticsOverlayFor`). La personne ouvrait ses réglages, y
> lisait **45 min**, et son plan était composé sur **30**. Aucun écran ne le
> disait, rien ne pouvait le défaire, et la seule façon de le découvrir était de
> relire deux prompts côte à côte. **Une décision du produit qu'aucun écran ne
> montrait.**
>
> **Écrire un champ que quelqu'un a rempli n'est acceptable qu'à trois
> conditions**, et les trois sont livrées :
> ① ça se **voit** — le champ, et le fil « ce qui vient de changer » ;
> ② ça se **justifie** — la citation (lot M2) ;
> ③ ça se **défait** — `previous`, la valeur d'avant, en un clic.
>
> ⚠️ **Écrire dans un champ FORCE le journal, et ce n'est pas un choix
> d'architecture.** Le fil de M2 est une VUE sur les lignes retenues : « défaire »
> y est trivial, la ligne se retire. Un scalaire n'a pas cette propriété —
> `cooking_time_min: 30` ne se retire pas, il faut savoir qu'il valait **45**.
> D'où `practical_constraints.field_changes`, **plafonné à 20** : c'est la seule
> chose de ce chantier qui grossisse sans que la personne l'ait demandé.
>
> ⛔ **Le journal ne part JAMAIS au modèle** (`constraintsForPrompt` le retire).
> Ce qu'il journalise est déjà servi — ce sont les champs eux-mêmes — et il porte
> l'ANCIENNE valeur : la donner inviterait le modèle à composer entre les deux.
>
> ⚠️ **Les lignes déjà en base restent LUES.** `canHold` porte une liste de
> **cellules retirées** (`RETIRED_CELLS`) à côté des sources retirées de M1 : un
> producteur vivant peut perdre une famille sans que son passé s'efface. Sans
> elle, fermer la cellule aurait fait tomber au parseur la ligne
> `questionnaire × logistics.set` mesurée en base au moment du lot — disparue de
> la carte entre deux chargements, sans un mot.
>
> ⛔ **Ce qui n'a PAS bougé, et pourquoi.** `food.*` / `method.*` restent dans le
> magasin structuré. Le design les voulait « proposés à un champ » ; ce champ
> **n'existe pas** sous forme structurée. `food_preferences` est une liste de
> phrases plates, sans polarité, sans sujet, sans date — y verser des items
> structurés perdrait `kind`, `subject` et `at`, et alimenterait exactement la
> contradiction que le design cite comme le défaut *(« Aime le brocoli s'il est
> rôti » et « N'aime pas le brocoli » dans le même prompt, toujours en base)*.
> L'autre destination possible, `household_food_restrictions`, est un acte
> **attribué** (« la maison ne sert pas X à Y ») qu'une extraction ne devrait pas
> décider seule. **C'est une décision produit à prendre, pas un reste de lot.**

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

**③ Quand le dispatcher détecte quoi que ce soit en conversation, il ne classe
pas : il renvoie.** Une phrase, une seule, qui dit **qu'on n'a rien rangé** et
**où ça se pose**. Cinq destinations, chacune un écran qui existe : le bilan de
fin de plan pour une part, « Ce que Sophia sait de toi » pour un aliment, les
réglages pour l'équipement, le rythme et la logistique.

⛔ **ET LA FORMULATION EST UNE GARDE, PAS UN DÉTAIL.** Sophia ne doit **jamais**
laisser croire que c'est enregistré : pas de « je le note », pas de « j'en tiens
compte », pas de « c'est bon ». C'est exactement la phrase qui a coûté cher à ce
dépôt — `student_safety_constraints` avait six lecteurs armés et zéro écrivain,
et quelqu'un qui déclarait une anaphylaxie recevait *« Noted, I'll keep it in
mind »* pendant que la base restait vide. **Un lecteur sans écrivain ressemble
trait pour trait à une fonctionnalité qui marche ; ici, le mensonge était une
phrase rassurante.** La règle est tenue par un test
(`conversation_redirect_test.ts`), dans les deux langues, sur les dix phrases.

⚠️ **CE QUI RESTE : le chemin PLAT, et il propose sans jamais ranger.**
`memory_items` alimente encore la carte des propositions
(`FoodPreferencesCard`), et **rien n'entre sans un « Keep »** : la personne tape,
sinon rien n'est écrit. C'est un magasin **probabiliste** (confiance, ranking,
statut `candidate`), et la confirmation est ce qui transforme une inférence en
fait déclaré. Le seuil de promotion reste **0,70**, là où le memorizer
s'autorise à créer dès 0,55. Ce chemin-là n'est pas visé par M1 — il ne viole pas
« le chat n'écrit pas », puisqu'il ne fait que **proposer, à l'écran**. C'est le
lot **M5** qui le fera écrire dans les CHAMPS plutôt que dans un magasin à part.

---

## 4-bis. `portion.adjust` — une POSITION qui converge (lot M3, 2026-09-01)

> ### ⛔ CE LOT NE ROUVRE PAS « LE CUMUL EST REFUSÉ » — IL Y RÉPOND
>
> `meal_envelope.ts` portait un refus explicite, et il faut le lire avant celui-ci :
> *« un facteur qui se compose, c'est une dérive vers le bas sans borne : trois
> "trop gros" donneraient ×0,729 au lieu de ×0,90 […] et le plafond qu'il
> faudrait inventer pour borner la somme serait exactement la borne fabriquée que
> cette cicatrice interdit. »*
>
> **Ce refus est juste, et il porte sur des FACTEURS QUI SE COMPOSENT.** Un
> indice n'en est pas un : on accumule des **CRANS** sur une échelle bornée, et
> le facteur sort de la position finale en **une** opération. ×0,729 reste
> inatteignable — non parce qu'on l'a plafonné, mais parce que **rien ne se
> multiplie**.
>
> ⛔ **Et la borne n'est pas fabriquée, c'est la condition de cette réponse.**
> `INDEX_MAX × PORTION_ADJUST_STEP.slight` = 2 × 0,05 = **0,10**, c'est-à-dire
> exactement `PORTION_ADJUST_STEP.clear` — le pire cas que le module servait
> déjà. L'indice n'atteint **rien de neuf** : il rend le chemin progressif et
> réversible au lieu d'un saut suivi d'un oubli. Un test épingle cette égalité.
>
> ### Le défaut fermé
>
> « Le dernier gagne » est **sans état**. La personne dit « un peu trop » (−5 %),
> le plan suivant est composé à −5 %, elle redit « un peu trop » **du plan déjà
> corrigé**, et on lui redonne le même −5 %. Elle n'avançait jamais. Mesuré :
>
> | réponses | position | enveloppe |
> |---|---|---|
> | aucune | 0 | 2442–2700 |
> | « un peu trop » | −1 | 2320–2565 |
> | deux fois | −2 | 2198–2430 |
> | quatre fois | −2 *(brut −4)* | 2198–2430 — **la borne mord** |
> | « trop » puis « pas assez » | 0 | 2442–2700 — **ça revient** |
>
> ### Ni table ni colonne
>
> Les `portion.adjust` **sont** l'historique : déjà écrits, déjà datés, déjà
> visibles sur la carte avec leur citation (M2), déjà retirables un par un. La
> position s'en dérive. Conséquence directe et bonne : **retirer une ligne
> déplace l'indice** — la personne peut défaire une réponse, pas seulement en
> ajouter une.
>
> ⚠️ **« Ce qu'il fallait » ne bouge PAS l'indice, et c'est correct.** La
> question porte sur le plan qu'elle vient d'avoir — **déjà composé avec
> l'indice**. « Ce qu'il fallait » dit donc « la visée actuelle est bonne », pas
> « reviens au milieu ». La convergence vient des réponses opposées, qui
> s'annulent.
>
> ⛔ **Et une question non posée ne bouge rien non plus.** `portions` est retirée
> sous plancher TCA (`RESTRICTED_OUT`) : « ce qu'il fallait » et « la question
> n'a pas été posée » rendent le **même** `null` dans `effectOf`. Les confondre
> ferait bouger un indice sur la population la plus vulnérable, à partir d'une
> question qu'on a délibérément décidé de ne pas lui poser. Le module ne voit
> jamais l'ambiguïté : il ne lit que des `portion.adjust` écrits, et sous
> plancher il n'en existe aucun.
>
> ### ⚠️ La copie d'écran mentait — dans l'autre sens
>
> `known.section.portions.not_wired` annonçait *« les ajustements de portion
> n'atteignent pas encore le calcul des parts »*. C'était **faux depuis le lot
> 1G** : l'enveloppe les reçoit. Son propre commentaire disait qu'elle devait
> disparaître le jour où elle cesserait d'être vraie. Elle est remplacée par la
> **position**, par bouche — ce que le générateur fait vraiment de ces réponses.
>
> ### ⛔ Les trois autres indices ne sont PAS livrés, et le motif est net
>
> Le design en nomme quatre : rapidité, compétence, variété, portions. Seules les
> **portions** sont livrées, parce que ce sont les seules dont le lot **M5 n'a
> pas déjà décidé autrement**. M5 fait écrire « c'était trop long » dans
> `cooking_time_min` ; M3 dirait qu'un **degré** va dans un indice, pas dans un
> champ (§1 règle 2). **Les deux ne peuvent pas coexister sur le même champ** —
> ce serait compter deux fois la même réponse. Trancher demande une décision
> produit : le champ **cliquette** vers le bas et ne remonte que si la personne
> le remarque ; l'indice est borné et converge. Le design dit l'indice ; ce
> n'est pas à un lot de le décider en passant.

---

## 4-ter. Le mémo — cinq lignes, pour ce qu'aucune famille ne porte (lot M4)

> ### ⛔ C'est la pièce la plus dangereuse du chantier, et il faut le dire
>
> *« Un champ texte CACHÉ, SANS PLAFOND, INJECTÉ DANS CHAQUE PROMPT, c'est
> exactement le magasin qu'on supprime, avec un autre chapeau. Et c'est la chose
> la plus difficile à déboguer du produit : le jour où un plan part de travers,
> personne ne peut dire pourquoi. »*
>
> Les trois mots de cette phrase sont les trois gardes, et chacune est
> **vérifiée** plutôt que promise :
> · **caché** → il se **voit**, sur la carte, avec sa cause (M2) ;
> · **sans plafond** → **cinq** lignes, et la sixième est **refusée** ;
> · **chaque prompt** → il y va — c'est sa raison d'être — mais c'est le seul
> bloc de texte libre sans famille que le produit injecte, et c'est pour ça
> qu'il est court.
>
> ### ⛔ Le plafond REFUSE. Il ne fait pas tomber la plus ancienne.
>
> *« Un plafond force une décision. »* Faire tomber la plus ancienne serait une
> **troisième** voie, pire que les deux : la consigne disparaîtrait sans que
> personne ne l'ait décidé, et la personne découvrirait qu'une chose qu'elle
> avait demandée a cessé d'agir, sans un mot.
>
> ⚠️ **C'est la différence assumée avec le journal de M5**, qui lui jette le plus
> ancien. Le journal est une **trace** de ce qui a eu lieu ; le mémo est une
> **consigne** qui agit. Perdre une trace coûte un « défaire » ; perdre une
> consigne change l'assiette.
>
> ### Les trois conditions, et laquelle est vérifiable
>
> **factuelle** · **actionnable** · **inexprimable dans un champ ou un indice**.
>
> ⛔ **Les deux premières sont des consignes de prompt, et c'est avoué.** Le
> socle ne sait pas lire « factuel » ; les prétendre tenues en code serait la
> ceinture armée sur un coffre vide.
>
> ⚠️ **La troisième est structurelle, et c'est la seule qui se vérifie** : le
> mémo est le **résidu** d'une classification — ce à quoi le producteur n'a su
> donner aucune famille.
>
> ⚠️ **Et « 100 % sûr » n'est pas un critère** : c'est un jugement que l'IA porte
> sur elle-même. Aucune confiance n'entre donc ici — ni champ, ni seuil. Une
> ligne est dedans ou dehors.
>
> ### Ce qui n'est PAS encore livré
>
> ⛔ **Le producteur automatique.** Le mémo est lu par les deux générateurs,
> visible, plafonné, cité et retirable ; ce qui manque est le classifieur qui le
> REMPLIT — le résidu du retour sur brouillon. Sans lui, seul un écrivain direct
> peut y poser une ligne. **C'est nommé plutôt que déguisé** : un mémo sans
> producteur n'est pas un mémo cassé, c'est un mémo vide — et il ne peut rien
> casser tant qu'il l'est.

---

## 5-bis. La session de cuisine — ce que la coche constate déjà

> ### ⛔ `cooking_session_states` À ZÉRO N'ÉTAIT PAS UNE CHAÎNE CASSÉE (lot M8, 2026-09-01)
>
> Le diagnostic évident était faux, et il faut l'écrire pour que personne ne le
> refasse. **La chaîne marche** — mesurée de bout en bout sur un plan réel :
> décoche → formulaire d'accident → « pas eu le temps » → la question sort → la
> réponse s'écrit → la cascade retire 8 repas et propose un décalage.
>
> Ce qui manquait : **`writeSessionState` n'avait qu'UN SEUL appelant**, le
> formulaire d'accident. La question n'était donc atteignable qu'à **quatre taps
> de profondeur**, et seulement pour quelqu'un qui venait de signaler un accident
> sur un plat puisant dans cette session.
>
> Pendant ce temps, la personne coche « j'ai mangé le poulet » chaque soir. Ce
> plat puise dans la préparation faite dimanche. **Donc dimanche a eu lieu** — et
> personne ne l'écrivait.
>
> ⛔ **On n'ajoute AUCUNE collecte, et c'est la condition du lot.** La bande du
> soir est une **affordance, pas une question** (FF-058, R2/T3 : « le chat
> n'initie jamais une collecte »). Y poser « la session de dimanche a-t-elle eu
> lieu ? » ferait tomber cette frontière et toute la fiche avec. On lit donc le
> tap que la personne fait déjà.
>
> ⛔ **Une coche est une preuve positive. Une décoche n'est preuve de rien.**
> « J'ai mangé le plat » ⇒ la préparation existait ⇒ la session a eu lieu. « Je
> ne l'ai pas mangé » ne dit RIEN de la session : la personne a pu commander sur
> une préparation parfaitement faite. C'est pour ça que le formulaire **pose** la
> question au lieu de la déduire — et déduire l'inverse **retirerait des repas**
> sur une inférence fausse. Le module n'écrit donc **jamais** `happened: false`.
>
> **Trois gardes**, et le test les prouve une par une : jamais une session du
> futur ; jamais par-dessus une ligne existante (une inférence ne remplace pas un
> témoignage) ; le lien **écrit** (`preparationIds`), jamais la proximité des
> dates.
>
> ⚠️ **Et le zéro reste illisible sans compteur.** `keel.evening_strip.sessions_confirmed`
> part à chaque coche, pas seulement quand une session est constatée : sans
> dénominateur, « 0 session constatée » ne se distingue pas de « 0 soir observé »
> — la forme exacte sous laquelle ce lot est resté invisible, et sous laquelle sa
> table à zéro s'est lue « la chaîne ne marche pas ».

---

## 5-ter. La question vaut révocation (lot M6, 2026-09-01)

> **Une exclusion qu'on interroge est une exclusion morte.** Personne ne demande
> pourquoi il n'y a jamais de ce qu'il ne veut pas. Renvoyer la personne vers un
> écran sans rien lui dire, c'est lui faire payer deux fois une préférence
> qu'elle n'a plus.
>
> ### ⛔ « Propose de la lever LÀ » — et le chat n'écrit toujours pas
>
> Le §2.9 dit *« propose de la lever là »* ; le §2.8 dit *« le chat n'écrit
> JAMAIS, pas même en un tap »*, avec la raison qui tranche : *« s'il peut
> écrire une allergie en un tap, pourquoi pas un aliment évité ? »*. **La
> seconde règle nomme le cas de la première, donc elle gagne.**
>
> Le runtime **retrouve** la ligne, la **cite** (avec sa cause, lot M2), et dit
> **où** elle se lève. ⚠️ **Et le gain reste entier** : ce qui coûtait cher
> n'était pas le tap, c'était *« d'arriver sur un écran et de devoir chercher où
> mettre la chose »*. Ici la ligne est nommée — la personne sait ce qu'elle va
> enlever avant d'y aller.
>
> ### La lane ne lisait RIEN — mesuré
>
> `sophia-brain` ne lit **jamais** `practical_constraints` : zéro occurrence.
> Sophia, dans le chat, n'avait aucune idée des règles stockées. Deux façons de
> le changer :
> ① charger à **chaque** tour et mettre les règles dans le prompt, pour que le
> modèle en nomme une — du budget sur tous les tours, pour un cas rare ;
> ② charger **seulement** sur le tour où la question tombe, et chercher le mot
> du modèle dans les lignes stockées. **⇒ ②.**
>
> ⚠️ **② n'interdit pas de le DIRE au modèle.** Ce qu'elle refuse, c'est le coût
> sur *tous* les tours. Sur le tour où la question tombe, le chargement a déjà
> eu lieu : la règle trouvée entre donc dans le contexte de **ce** tour-là. Voir
> la réparation ci-dessous — elle est née d'un run réel, pas d'une relecture.
>
> ### ⛔ Aucun matcher maison — le moteur du dépôt, utilisé comme il est fait
>
> Retrouver « poulet » dans « plus jamais de poulet le soir » est exactement le
> travail de `findForbiddenMatches` : un **token** contre de la **prose**. Il
> échappe la regex et pose des frontières de mot, donc **« lait » ne matche pas
> dans « laitue »** — la cicatrice chiffrée, 12 faux positifs sur 12. Mode
> **audit** (`allowNegatedMentions: false`), pour la même raison qu'au lot M7 :
> une exclusion s'écrit au négatif, et le mode ceinture rendrait le chercheur
> aveugle à ce qu'il cherche.
>
> ### ⚠️ La limite, nommée et MESURABLE
>
> La règle est stockée **dans la langue où elle a été écrite**. Quelqu'un dont
> les lignes sont en anglais et qui demande « pourquoi jamais de fenouil ? »
> reçoit le **silence** — vérifié sur un compte réel. C'est le bon échec :
> traduire serait un matcher inter-langues, précisément ce que le dépôt
> interdit. Et le compteur porte le **mot demandé**, donc l'écart se lit dans
> les logs au lieu de se deviner.
>
> ⛔ **Et rien n'est inventé.** Un aliment qu'aucune règle ne nomme rend le
> silence : dire « tu as demandé ça » à quelqu'un qui ne l'a pas demandé est le
> pire mensonge possible ici — il porte sur ses propres mots.
>
> ### ⛔ La réparation que seuls les tours réels ont trouvée (2026-09-01)
>
> Le lot était câblé, armé, compté, **et la réponse se contredisait elle-même**,
> sur 2 armements sur 2 :
>
> > *« Because fennel probably hasn't been put in the meal options you're being
> > given, **not because it's blocked here**. »*
> > puis, collé dessous : *« It comes from one line you have: "L3C — no fennel,
> > from the conversation". »*
>
> Cause structurelle, pas un caprice : la lane ne lit pas
> `practical_constraints`, donc le modèle ne pouvait que **deviner** — et il
> devinait le contraire de la phrase qu'`appendRedirect` allait coller sous lui.
> **Une annotation ne se rattache pas à un texte par la proximité** : c'est la
> cicatrice `portion-note-contradicts-the-lid`, un étage plus haut.
>
> ⇒ `ruleQuestionContextBlock()` : la règle trouvée entre dans `injectedContext`
> **avant** la génération. Même liste et mêmes portes que la phrase visible — si
> l'un s'arme sans l'autre, on recrée le défaut. Compteur `told_model`, distinct
> d'`armed`, parce que depuis cette réparation un tour peut avoir sa phrase sans
> son bloc, **et c'est ça la régression**.
>
> ⚠️ **Et la réparation a créé son propre défaut, mesuré au tour suivant** :
> instruit de la ligne, le modèle la **citait**, et la phrase la citait à
> nouveau — la réponse bégayait. Le bloc interdit donc explicitement de la
> citer : **la ligne reste portée par la phrase déterministe** (c'est le
> plancher : elle sort même si le modèle dérape), et le modèle se contente d'une
> clause. Résultat mesuré :
>
> > *« It's deliberate: you've set an exclusion, so fennel gets left out of your
> > plans. »* + la phrase, qui donne la ligne et où elle se lève.
>
> ⚠️ **Coût nul sur les tours ordinaires** : `rules_found=0` ⇒ ni bloc ni
> phrase, vérifié sur un tour réel (« broccoli »).

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
