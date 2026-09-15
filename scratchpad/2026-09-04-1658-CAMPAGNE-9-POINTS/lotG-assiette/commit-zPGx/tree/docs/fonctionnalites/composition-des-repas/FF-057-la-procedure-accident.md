# FF-057 · La procédure accident

| | |
|---|---|
| **Identifiant** | `FF-057-la-procedure-accident` |
| **Statut** | 🟠 En cours — livrée par la CONVERSATION, à moitié par l'écran (voir §0) |
| **Date** | 2026-08-12 |
| **Autorité produit** | [README du domaine](README.md) · [conversation/README.md](../conversation/README.md) (T1–T9) · [CONTRACT.md](../../keel/CONTRACT.md) |
| **Dépend de** | [FF-009](../conversation/FF-009-le-repas-hors-plan.md) (le fait hors plan) · `_shared/keel/meal_tick.ts` (`MEAL_UNTICK_REASON`) · [FF-028](../conversation/FF-028-la-recommandation-quotidienne.md) (le canal des directives) · `meal_plan_window.ts` · `grocery_waves.ts` (`buyOn`, `servesCookOn`, `PERISHABLE_AISLES`, `MAX_FRIDGE_DAYS`) |
| **Déclenchée par** | [FF-058](../suivi-quotidien/FF-058-la-bande-du-soir.md) (un `✗` de repas, un `Pas encore` de courses) · une déclaration en conversation · une décoche sur l'écran |
| **Effort estimé** | 4 jours (V2 + le décalage temporel). V3 à part |

---

## 0. Où en est cette fiche — à lire AVANT de croire quoi que ce soit

⚠️ **Cette fiche est livrée en deux morceaux qui ne couvrent pas les mêmes
entrées.** Une garde à moitié livrée ressemble à une garde qui marche, et c'est
exactement le piège que cette section existe pour désamorcer.

### Ce qui EST construit — par la CONVERSATION (2026-08-12)

Les parties **A, B et C** existent et sont testées côté `_shared` :
`keel/accident.ts` (l'arbre de décision, les quatre refus nommés, la cascade,
l'espace de réalignement), `keel/accident_io.ts` (les écritures et le
glissement), `chat/accident_tap.ts` (le routage des taps). Elles sont
atteignables par la **bande du soir** (FF-058) et par la **conversation** —
c'est-à-dire par les entrées ① et ②, plus ④.

### Ce qui EST construit — par l'ÉCRAN (2026-08-18, lot L1)

**La partie A, et uniquement la partie A** : une décoche sur `/app/today` ou
`/app/plan` ouvre les trois tuiles sous le plat, et le motif est écrit sur la
ligne.

Le vocabulaire de la décoche est passé de un motif à quatre
(`_shared/keel/meal_tick.ts :: MEAL_UNTICK_REASONS`, migration
`20260818170000_la_decoche_dit_pourquoi.sql`) :

| Valeur | Ce que c'est |
|---|---|
| `food_not_eaten` | la décoche **nue** — écrite AVANT le formulaire, et seule si on l'ignore (§7) |
| `ordered` | « j'ai commandé / mangé dehors » |
| `no_time` | « pas eu le temps » |
| `ate_other` | « j'ai mangé autre chose » |

La même liste est lue par les trois couches (Postgres, Deno, navigateur) et
`frontend/src/keel/api/mealTicks.int.test.ts` fait rougir si l'une dérive.
Le formulaire de la conversation écrit désormais **lui aussi** son motif : ses
trois boutons posaient tous `food_not_eaten`, donc la réponse de la personne
était perdue à l'écriture.

### Ce qui n'est PAS construit — l'écran, et rien d'autre que l'écran

| Manque | Détail |
|---|---|
| **Le fait `off_plan` depuis l'écran** | `ordered` et `ate_other` n'écrivent AUCUN fait FF-009 quand ils viennent d'une décoche à l'écran. Arbitrage du 2026-08-18 (option a) : le motif seul ferme le trou du suivi, le fait hors plan attend son lot. La conversation, elle, l'écrit déjà (`writeOffPlanTapFact`) |
| **L'invitation photo depuis l'écran** | découle du point précédent : elle est gatée sur le fait hors plan |
| **La partie B depuis l'écran** | aucun réalignement n'est proposé après une décoche à l'écran. Le tap « pas eu le temps » n'ouvre rien de plus |
| **La partie C depuis l'écran** | pas de ligne de courses ni de proposition de décalage hors conversation |
| **« La session de cuisine a-t-elle eu lieu ? » depuis l'écran** | posée par la conversation uniquement (`sessionQuestionFor`) |
| **R9 sur l'écran** | ⚠️ **corrigé côté serveur le 2026-09-01, pas côté écran.** `accident_tap.ts` résout maintenant le plancher par `evaluateRestrictionForStudent` (une évaluation par tour, descendue dans les quatre branches, fail-closed), donc la procédure ne s'ouvre plus par la conversation pour quelqu'un sous plancher — `_shared/chat/accident_restriction_wiring_test.ts` le tient par son EFFET. L'écran, lui, ne lit toujours rien : le formulaire s'y ouvre pour tout le monde |

---

## 1. Le problème

Quand la vraie vie percute le plan, le produit **encaisse le fait et s'arrête
là**. La décoche existe (`MEAL_UNTICK_REASON = 'food_not_eaten'`), le repas
hors plan est capté (FF-009) — et personne ne répond à la seule question qui
compte : *« et maintenant, qu'est-ce que ça change pour la suite ? »*

[FF-002](FF-002-dire-son-absence.md) couvre l'absence annoncée **avant** la
composition. **Rien ne couvre l'accident après.**

Et il y a pire que le plat sauté. **La session de cuisine sautée est une bombe
silencieuse** : les trois ou quatre repas qui en dépendaient **n'existent
pas**, et le plan continue de les afficher comme s'ils étaient là. La personne
ouvre l'app mardi, on lui annonce un plat qui n'a jamais été cuisiné.

**Ce que ça coûte.** C'est le mode d'échec structurel de toutes les apps de
meal planning : le plan meurt au premier contact avec la vraie vie, et
l'utilisateur conclut que « ça ne marche pas ». Un plan qui ne sait pas
encaisser un accident est un plan qu'on abandonne — pas en le supprimant, en
cessant de l'ouvrir.

## 2. Job stories

> **Quand** j'ai commandé au lieu de cuisiner, **je veux** le dire en un tap
> plutôt qu'en trois phrases, **pour que** ce soit plus simple de dire la
> vérité que de laisser courir.

> **Quand** j'ai sauté ma session de cuisine du dimanche, **je veux** qu'on me
> dise ce que ça change pour la semaine, **pour que** je ne découvre pas mardi
> qu'il n'y a rien dans le frigo.

> **Quand** un plat sauté n'a aucune conséquence, **je veux** qu'on me le dise
> et qu'on n'en fasse pas une affaire.

## 3. Périmètre

### Les quatre entrées

Cette fiche est **déclenchée**, elle ne se déclenche pas elle-même :

1. Un **`✗`** dans la bande du soir ([FF-058](../suivi-quotidien/FF-058-la-bande-du-soir.md)) ;
2. Une **déclaration en conversation** (« j'ai commandé une pizza ») que le
   plancher de FF-009 a déjà captée ;
3. Une **décoche sur l'écran** Today ;
4. **Une vague de courses déclarée non faite** le jour où elle était prévue —
   la seule entrée qui menace le plan **entier**, et pas un seul repas.

Aucune n'est privilégiée, et **elle survit à la disparition de n'importe
laquelle** — c'est ce qui justifie qu'elle soit une fiche à part.

### A — Le formulaire accident

Sur une entrée, trois boutons fermés, jamais un champ libre obligatoire :

| Bouton | Ce que ça écrit | Ce que ça ouvre |
|---|---|---|
| **J'ai commandé / mangé dehors** | décoche + fait `off_plan` (FF-009) | invitation photo (FF-025) si le budget T4 est libre |
| **Pas eu le temps** | décoche seule | B — la nourriture existe peut-être encore |
| **J'ai mangé autre chose** | décoche + fait `off_plan` **sans aliment inventé** | rien de plus |

Et le cas grave, posé **une fois par session** et jamais par plat :
**« La session de cuisine de dimanche a eu lieu ? »** → si non, B en mode
cascade.

### B — Le réalignement (V2 seulement)

Ce que le plan répond à l'accident. **Additif et sûr**, borné à quatre actions
dont l'espace est **pré-calculé** depuis le plan réel :

1. **Décaler** un plat non cuisiné vers un jour libre — si la fenêtre frigo le
   permet (`MAX_FRIDGE_DAYS`).
2. **Signaler un reste disponible** — le plat sauté est encore au frigo, il
   devient une option pour demain.
3. **Proposer une solution sans cuisson** quand la session est tombée et que
   rien n'est prêt.
4. **Ne rien faire, et le dire** — un plat sauté un mardi ne justifie souvent
   aucune action. C'est une **fin normale**, pas un échec.
5. **Décaler la session et ce qui en dépend** — le glissement temporel de C,
   avec ses trois motifs de refus nommés.

La sortie durable passe par **le canal des propositions durables** (proposition
→ tap → écriture relue → empreinte du plan qui périme la proposition). Aucun
canal neuf.

⚠️ **Ce canal s'appelait « celui de FF-028 », et FF-028 est abandonnée depuis le
2026-09-01.** Le canal lui, **survit** : `student_daily_recommendations`, les
boutons `KEEL_RECO_*` et `handleRecommendationTap` sont **gardés exprès** et
appartiennent désormais à [FF-056](../conversation/FF-056-la-divergence-constatee.md),
qui les utilise déjà (`openDurableProposal`). Ce qui a été retiré est le MOTEUR
de proposition quotidienne, pas la plomberie du tap — la confondre avec le
canal ferait disparaître la seule sortie durable de cette fiche.

### C — Les courses, et le décalage temporel

Un repas sauté est un fait dont la conséquence est locale. **Une course non
faite est un prérequis manquant** : sans elle, la cuisson ne peut pas avoir
lieu, et tout ce qui en dépend tombe.

Le plan **porte déjà la date** : `grocery_waves.ts` calcule `buyOn` (quand
acheter) et `servesCookOn` (quelle cuisson cette vague sert), plus
`PERISHABLE_AISLES` et `MAX_FRIDGE_DAYS`. Il n'y a donc **rien à demander sur
le futur** : le jour du `buyOn`, on constate (c'est la ligne de FF-058), et
c'est tout.

**Le déclenchement** : un `Pas encore` sur la vague, le soir de son `buyOn`.

**Ce qui suit n'est pas une question, c'est une proposition.** Le produit sait
calculer le plus petit décalage viable ; il l'offre, la personne accepte d'un
tap :

> « Les courses ne sont pas faites. On décale la cuisson à mardi ? »
> `[ Oui ]` `[ Non, je gère ]`

Ne **jamais** demander « tu peux y aller quand ? » : c'est une question ouverte
sur une intention, elle demande une réponse en texte libre, et le produit a un
meilleur outil — l'espace d'action pré-calculé, comme partout ailleurs.

**La cinquième action : décaler la session et ce qui en dépend.** Le plan
glisse du plus petit décalage viable : la cuisson, les repas qu'elle nourrit,
et les vagues recalculées (`buyOn = cookOn − MAX_FRIDGE_DAYS`).

**Le système est auto-limitant, et c'est voulu.** Si la personne accepte, le
nouveau `buyOn` fait réapparaître la ligne de courses à sa nouvelle date —
cadence normale, pas relance. Si elle refuse, le `buyOn` est passé et la ligne
**ne revient pas** (FF-058 R15). Personne n'est harcelé.

⚠️ **Décaler un plan non commencé n'est PAS V3.** V3 recompose un plan en cours
sous contrainte de ce qui est déjà cuit. Ici rien n'est cuit : c'est un
**glissement de dates**, pas une re-composition. C'est ce qui le rend sûr — et
c'est exactement pour ça qu'il faut vérifier que rien n'est cuit.

**Le glissement se refuse, avec un motif nommé, dans trois cas :**

| Motif | Quand |
|---|---|
| `perishables_at_risk` | une vague **antérieure a déjà été faite** et son périssable dépasserait `MAX_FRIDGE_DAYS` après le décalage. Faire glisser la cuisson ferait pourrir ce qui est déjà au frigo |
| `outside_plan_window` | le décalage pousse un repas au-delà d'`ends_on` — on planifierait hors de la fenêtre du plan |
| `already_cooked` | une préparation de cette session a déjà été faite. On ne décale pas ce qui existe |

Refusé, on ne reste pas muet : on propose ce qui reste — une solution sans
cuisson pour tenir, ou « rien à changer » si la personne y va demain matin.

### Hors périmètre — engageant

- ❌ **V3, la replanification des jours restants** (recomposer sous contraintes
  de ce qui est déjà cuit et déjà acheté) — chantier séparé, exprès. La cascade
  plan-courses-cuissons est l'endroit où un état devient incohérent **sans
  erreur visible**.
- ❌ **Aucune capture.** La bande du soir, les coches, leur coût : c'est
  FF-058. Ici on **répare**, on ne mesure pas.
- ❌ **Aucun champ libre obligatoire.** Les boutons suffisent ; le texte reste
  possible, jamais requis.
- ❌ **Aucun jugement de vocabulaire.** Le verrou de doctrine gouverne :
  `off_plan_meals` interdit déjà « cheat meal » et ses cinq voisins.
- ❌ **Aucun aliment inventé.** « J'ai mangé autre chose » n'écrit aucun
  `food_group_ref` — la règle du plancher de repas vaut ici.
- ❌ **Aucune relance.** Un réalignement refusé ne se repropose pas.
- ❌ **Muet sous plancher de restriction.**

## 4. Le circuit

```
   TROIS ENTRÉES
   ① ✗ dans la bande du soir (FF-058)
   ② « j'ai commandé » en conversation (FF-009)
   ③ décoche sur l'écran Today
                    │
                    ▼
   ┌──────────────────────────────────┐
   │ A — FORMULAIRE ACCIDENT          │
   │ [commandé] [pas eu le temps]     │
   │ [mangé autre chose]              │
   │ + « la session a eu lieu ? »     │
   │   (une fois par session)         │
   └──────────────────────────────────┘
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
   plat sauté               session sautée
   la nourriture existe     3-4 repas N'EXISTENT PAS
   → décalage, péremption   → cascade : invalider EXACTEMENT
                              ceux qui en dépendaient
       └────────────┬────────────┘
                    ▼
   ┌──────────────────────────────────┐
   │ B — RÉALIGNEMENT V2              │
   │ espace PRÉ-CALCULÉ, 4 actions :  │
   │ décaler · reste · sans-cuisson · │
   │ ne rien faire (et le dire)       │
   └──────────────────────────────────┘
                    │
     canal durable : tap → écrit → relu
                    ▼
        le plan affiché dit la vérité
```

**Le point qui gouverne le dessin** : **plat sauté ≠ session sautée**. Le
premier décale ; le second fait disparaître des repas du réel sans que l'écran
s'en aperçoive.

## 5. Modèle de données

Presque rien de neuf :

| Donnée | Où | Note |
|---|---|---|
| la décoche | `protocol_events` + `disqualified_reason` ∈ `MEAL_UNTICK_REASONS` | existe |
| **le motif de la décoche** | la même colonne, quatre valeurs au lieu d'une (`20260818170000`) | ajouté le 2026-08-18 — §0 |
| le hors-plan | `plan_relation = 'off_plan'` (FF-009) | existe |
| **la session sautée** | un marqueur sur la session de cuisine du plan | **la seule donnée qui manque** |
| le réalignement | le canal durable (proposition, empreinte du plan, tap relu) — anciennement « de FF-028 », désormais propriété de FF-056 | existe |

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | **Plat sauté ≠ session sautée** | l'un décale, l'autre supprime des repas du réel. Les confondre laisse le plan annoncer des plats qui n'existent pas |
| **R2** | La cascade invalide **exactement** les repas de la session | trop large : on efface une semaine correcte. Trop étroit : le plan continue de mentir |
| **R3** | L'espace d'action est **pré-calculé** ; le modèle choisit dedans | un LLM qui invente une action produit des actions inapplicables |
| **R4** | « Ne rien faire » est une **bonne fin** | un flow qui trouve toujours quelque chose à réparer transforme chaque écart en incident |
| **R5** | Trois entrées, aucune indispensable | la fiche survit au retrait de FF-058, et c'est ce qui justifie la séparation |
| **R6** | Une action se confirme par un tap et s'écrit **relue** | un « c'est fait » sans ligne relue est l'accusé fantôme |
| **R7** | L'empreinte du plan périme la proposition | une action calculée sur un état disparu est un bug, pas une commodité |
| **R8** | Aucun aliment inventé, aucun jugement de vocabulaire | les règles du plancher de repas et du verrou de doctrine s'appliquent telles quelles |
| **R9** | Muet sous `restriction_flag` | le plancher prime, par construction |
| **R10** | V3 reste fermé tant qu'il n'a pas sa fiche | la cascade cuissons/courses casse un état sans lever d'erreur |
| **R11** | On **propose un décalage**, on ne demande **jamais** « tu peux y aller quand ? » | la date des courses est déjà dans le plan ; le produit sait calculer le décalage viable. Une question ouverte sur une intention rend du texte libre à classer, là où un espace d'action pré-calculé rend un tap |
| **R12** | La proposition suit un tap : elle ne consomme **pas** le budget T4 | c'est la réponse à un geste que la personne vient de faire, pas une demande non sollicitée. Mais **une seule chose à la fois** : jamais la proposition de décalage ET l'invitation photo dans le même échange |
| **R13** | **Décaler un plan non commencé n'est pas V3** | V3 recompose sous contrainte de ce qui est cuit ; ici rien n'est cuit, c'est un glissement de dates. C'est ce qui le rend sûr — donc il faut le **vérifier**, pas le supposer |
| **R14** | Le glissement se refuse avec un **motif nommé** : `perishables_at_risk`, `outside_plan_window`, `already_cooked` | un refus muet donne l'impression que le produit n'a pas compris ; un refus nommé montre qu'il a regardé |
| **R15** | Un refus n'est jamais un silence | on propose ce qui reste, ou on dit qu'il n'y a rien à changer |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Réalignement proposé et refusé | rien ne s'applique, aucune insistance, aucune reproposition |
| Le plan a changé entre la proposition et le tap | l'empreinte invalide l'action ; la personne le sait en une phrase |
| Fenêtre frigo dépassée pour le plat décalé | « décaler » n'est **pas proposé** — il sort de l'espace pré-calculé |
| Session déclarée non faite mais plats déjà cochés | on croit la **coche** (un fait) plutôt que la déclaration de session |
| Aucune action pertinente | « rien à changer », dit explicitement |
| Le formulaire s'ouvre sans plan courant | il se referme sans rien écrire — il n'y a rien à réaligner |
| La personne ignore le formulaire | la décoche reste écrite (elle précède le formulaire) ; rien d'autre |
| `Pas encore` sur la vague | le décalage viable est **calculé** et proposé en deux boutons. Aucune question ouverte |
| Aucun décalage viable | on le **dit** avec son motif, et on propose ce qui reste (sans cuisson, ou rien à changer) |
| Vague 1 faite, vague 2 non, décalage de 3 jours | `perishables_at_risk` — le frais de la vague 1 ne tiendra pas. Refus nommé |
| Le décalage sortirait de `ends_on` | `outside_plan_window`. On ne planifie pas hors de la fenêtre |
| Une préparation de la session est déjà faite | `already_cooked`. On ne décale pas ce qui existe |
| La personne tape « Non, je gère » | rien ne change, aucune insistance. Le plan reste tel quel |
| Elle ne répond ni oui ni non | rien. Et la ligne **ne revient pas** : le `buyOn` est passé (FF-058 R15) |
| Décalage accepté | le nouveau `buyOn` fait réapparaître la ligne à sa nouvelle date — cadence normale, pas relance |
| Vague marquée faite après coup | le danger disparaît ; aucune action résiduelle ne part |

## 8. Critères d'acceptation

```gherkin
Étant donné une décoche sur le dîner
Quand la personne tape « J'ai commandé »
Alors la décoche et un fait hors plan sont écrits
Et l'invitation photo part si et seulement si le budget du jour est libre

Étant donné « j'ai mangé autre chose »
Quand le fait est écrit
Alors AUCUN groupe alimentaire n'est inventé

Étant donné un ✗ « pas eu le temps » sur un plat cuisinable demain
Quand le réalignement s'exécute
Alors « décaler à demain » est proposé
Et il ne l'est PAS si la fenêtre frigo est dépassée

Étant donné une session de cuisine déclarée non faite
Quand le réalignement s'exécute
Alors les repas qui en dépendaient ne sont plus annoncés comme disponibles
Et les repas d'autres sessions ne sont PAS touchés
Et une solution sans cuisson est proposée pour le soir

Étant donné une session déclarée non faite dont un repas a déjà été coché
Quand la cascade s'exécute
Alors le repas coché survit

Étant donné un plat sauté un mardi sans conséquence sur la suite
Quand le réalignement s'exécute
Alors il conclut qu'il n'y a rien à changer, et le dit

Étant donné une déclaration en conversation « j'ai commandé une pizza »
Quand le tour se termine
Alors la procédure accident s'ouvre — sans passer par la bande du soir

Étant donné un élève sous plancher de restriction
Quand une décoche arrive
Alors aucun formulaire ni réalignement ne se déclenche

Étant donné un « Pas encore » sur la vague, le soir de son buyOn
Quand la procédure s'ouvre
Alors un décalage CALCULÉ est proposé en deux boutons
Et aucune question ouverte du type « tu peux y aller quand ? » n'est posée

Étant donné ce décalage accepté, rien d'acheté ni de cuisiné
Quand le réalignement s'exécute
Alors la session et les repas qui en dépendent glissent
Et les vagues sont recalculées sur la nouvelle date de cuisson
Et la ligne de courses réapparaît au nouveau buyOn

Étant donné un « Non, je gère »
Quand les jours suivants passent
Alors rien ne change et la ligne de courses ne revient pas

Étant donné une première vague déjà faite dont le frais ne tiendrait pas
Quand le glissement est calculé
Alors il est refusé avec le motif `perishables_at_risk`
Et une solution de repli est proposée

Étant donné un glissement qui pousserait un repas au-delà de ends_on
Quand il est calculé
Alors il est refusé avec le motif `outside_plan_window`

Étant donné une préparation de la session déjà cuisinée
Quand le glissement est calculé
Alors il est refusé avec le motif `already_cooked`

Étant donné qu'aucun décalage viable n'existe
Quand la procédure s'ouvre
Alors elle le dit avec son motif
Et elle propose ce qui reste, sans rester muette
```

## 9. Rabbit holes

- **La cascade de la session.** Décider qu'une session n'a pas eu lieu doit
  invalider les repas qui en dépendaient — et **seulement** eux. C'est le
  calcul le plus délicat de la fiche, et il se teste sur une session dont un
  repas a déjà été mangé.
- **V3 par la petite porte.** « Tant qu'on y est, on recompose les trois jours
  restants » — c'est exactement le pas à ne pas faire sans fiche. L'état
  devient incohérent sans erreur visible : les courses sont déjà faites, une
  préparation nourrit trois repas futurs.
- **Le champ libre.** « Autre chose » appelle un texte. Une fois ouvert, il
  devient obligatoire dans la tête des gens, et le coût du geste remonte.
- **Le formulaire qui devient un questionnaire.** Trois boutons, pas cinq. Un
  quatrième cas se traite par « autre chose », pas par une nouvelle branche.
- **La question ouverte qui revient.** « Tu peux y aller quand ? » paraît plus
  attentionnée ; elle rend du texte libre à classer, elle demande une intention
  que le produit ne sait pas vérifier, et elle remplace un tap par une phrase.
  Le décalage se **calcule**.
- **Le rappel de corvée.** La ligne de courses n'apparaît **que** le soir d'un
  `buyOn` (FF-058 R15). La faire réapparaître « tant que ce n'est pas fait »
  est du harcèlement domestique, et c'est ce que l'auto-limitation empêche.
- **Le glissement qui devient V3.** « Tant qu'on décale, autant recomposer » —
  non. Un glissement **déplace des dates** ; il ne rechoisit aucun plat, ne
  retouche aucune quantité, et ne rappelle **jamais** le modèle.
- **Le glissement sur un frigo plein.** Le piège le plus coûteux de la fiche :
  rien n'échoue, rien ne lève, et la personne trouve du poulet gâté trois jours
  plus tard. `perishables_at_risk` se calcule depuis la date d'achat **réelle**
  de la vague faite, jamais depuis le `buyOn` théorique.

## 10. Ce qu'on mesure

- Part des accidents qui reçoivent une action **acceptée** vs **« rien à
  changer »** — les deux bonnes fins
- Sessions de cuisine déclarées non faites — un chiffre que personne n'a jamais
  eu, et qui dit si le plan est trop ambitieux
- Répartition des quatre entrées (bande, conversation, écran, courses) — elle
  dira laquelle porte réellement le flux
- **Glissements proposés / acceptés / refusés, par motif** — si
  `perishables_at_risk` domine, les vagues sont mal calées ; si
  `outside_plan_window` domine, les plans sont trop serrés en fin de fenêtre

**Contre-mesure.** Le volume de décoches. Si ouvrir un formulaire après chaque
`✗` fait **baisser** le nombre de décoches, les gens ont appris que signaler
déclenche une procédure — et ils cessent de signaler. C'est le pire résultat
possible et il se voit vite.

## 11. Questions ouvertes

- Le marqueur de **session non faite** est la seule donnée neuve : sur la
  session dans le payload du plan, ou une table à part ? Le plus simple gagne,
  et le choix se documente dans l'en-tête du module.
- **V3** — replanifier les jours restants sous contraintes (déjà cuit, déjà
  acheté, fenêtre frigo) mérite sa fiche. Celle-ci lui donne son déclencheur,
  pas son contenu.
- Le **foyer** : une session sautée concerne tout le monde. Faut-il prévenir
  les profils réclamés, ou seul le titulaire décide et les autres voient
  simplement le plan à jour ?
- **De combien décale-t-on ?** Le plus petit décalage viable est le pari de
  départ (+1 jour quand c'est possible). Faut-il plutôt viser le prochain jour
  « libre » du plan ? À trancher sur des vrais plans, pas dans l'abstrait.
- **Qui fait les courses n'est pas toujours qui cuisine.** Aujourd'hui la
  question part au maître parce que c'est lui qui porte le plan. Le jour où la
  liste de courses devient une surface partageable, cette entrée méritera d'y
  déménager.
- L'état de vague est écrit par [FF-058](../suivi-quotidien/FF-058-la-bande-du-soir.md).
  Si cette fiche-là est gelée, **cette entrée-ci disparaît** — les trois autres
  survivent, et c'est le sens du découpage.
