# FF-004 · Ce qui se garde, et le mot la veille

| | |
|---|---|
| **Identifiant** | `FF-004-conservation-et-decongelation` |
| **Statut** | 🔵 Idée — dépend de [FF-005](FF-005-strategie-de-courses.md) |
| **Date** | 2026-08-07 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) |
| **Dépend de** | `meal_generation.ts` (`MAX_FRIDGE_DAYS = 3`, `preparations`, `cooking_sessions`) · `_shared/chat/delivery_policy.ts` (`DAILY_UNSOLICITED_CAP = 2`) |
| **Effort estimé** | 2 à 3 jours |

---

## 1. Le problème

Le produit sait déjà **cuisiner une fois pour plusieurs repas** : `preparations`
porte le déroulé et le jour de cuisson, `cooking_sessions` porte la session.
Ce qu'il ne sait pas, c'est **ce qui arrive entre la cuisson et l'assiette**.

`MAX_FRIDGE_DAYS = 3` est la seule notion de conservation du moteur, et elle ne
sert aujourd'hui qu'à décider des vagues de courses. Rien ne dit à l'élève ce
qui va au congélateur, ce qui reste au frais, ni surtout **quand sortir quoi**.

Or une préparation du dimanche mangée jeudi n'est mangeable que si quelqu'un l'a
sortie mercredi soir. Personne ne le lui dit. Le plan est juste sur le papier et
faux dans la cuisine.

**Ce que ça coûte.** Le repas du jeudi n'existe pas — soit il est jeté parce
qu'il a passé trois jours au frais, soit il est encore congelé à 19h. Dans les
deux cas l'élève commande quelque chose, et la semaine préparée le dimanche
s'écroule sur son dernier tiers, qui est précisément la partie que ce produit
promet de sauver.

## 2. Job stories

> **Quand** je cuisine le dimanche pour toute la semaine, **je veux** savoir ce
> qui va au congélateur et ce qui reste au frigo, **pour que** rien ne soit à
> jeter mercredi.

> **Quand** un plat congelé est prévu pour demain, **je veux** qu'on me le dise
> ce soir, **pour que** je le sorte au lieu de le découvrir en bloc à 19h.

> **Quand** je n'ai pas de congélateur, **je ne veux pas** qu'on me propose un
> plan qui en suppose un, **pour que** le plan reste faisable chez moi.

## 3. Périmètre

### Dans le périmètre
- Un champ de **conservation par préparation** : au frais, au congélateur, à
  consommer le jour même.
- La **date de sortie** dérivée du jour de consommation prévu.
- **Un message la veille au soir**, porté par le canal proactif existant.
- La prise en compte de l'**absence de congélateur**, via `equipment_out` de
  [FF-003](FF-003-intake-structure.md).

### Hors périmètre — engageant
- ❌ **Aucune durée de conservation en jours affichée à l'élève.** Le produit ne
  dira jamais « se garde 4 jours » : c'est une affirmation de sécurité
  alimentaire qu'on ne peut pas tenir sans connaître la chaîne du froid réelle.
  On dit **où ranger** et **quand sortir**, jamais **combien de temps c'est
  bon**.
- ❌ **Pas de nouveau canal, pas de nouveau cron.** Le message de la veille
  passe par la livraison proactive existante ou il n'existe pas.
- ❌ **Pas de suivi de ce qui est effectivement au congélateur.** Le produit ne
  tient pas un inventaire du froid : il dirait faux dès le premier écart, et un
  inventaire faux est pire que pas d'inventaire.
- ❌ **Aucune mesure d'énergie ou de masse.** Rappel : le filtre de
  `meal_analysis.ts` s'applique. Un assouplissement est en cours
  ([CALORIE_REVERSAL.md](../../keel/CALORIE_REVERSAL.md)) — **le code applique
  encore l'interdiction totale, délibérément.**

## 4. Le circuit

```
  Génération (appel de composition)
      ↓
  preparations[] — chacune reçoit `keeps` :
      "same_day" | "fridge" | "freezer"
      ↓
  Séquencement : pour chaque portion, on connaît
  le jour de CUISSON (cook_on) et le jour de
  CONSOMMATION (via dishes[].day)
      ↓
      ├─ écart ≤ MAX_FRIDGE_DAYS ─────→ "fridge", rien à dire
      │
      └─ écart > MAX_FRIDGE_DAYS ─────→ "freezer"
                 ↓
          date de sortie = jour de consommation − 1
                 ↓
  ┌──────────────────────────────────────────────┐
  │  LE SOIR DE LA VEILLE                        │
  │  livraison proactive existante               │
  │  · consomme un créneau du plafond 2/jour     │
  │  · les bilans réservent déjà leurs slots     │
  │  · gaté par time_of_day                      │
  └──────────────────────────────────────────────┘
                 ↓
        « Sors le chili du congélateur ce soir —
          c'est le dîner de demain. »
```

Le point de friction est en bas : **le plafond proactif**. Ce message entre en
concurrence avec des messages qui existent déjà et qui ont leur raison d'être.
C'est l'arbitrage de la §11.

## 5. Modèle de données

Sur la ligne `student_generated_meals`, dans le jsonb `preparations` déjà
présent — **aucune colonne neuve** :

| Champ | Origine | Note |
|---|---|---|
| `preparations[].keeps` | **dérivé** du modèle, **revérifié** au parseur | Liste fermée : `same_day`, `fridge`, `freezer`. |
| `preparations[].take_out_on` | **calculé**, jamais du modèle | Jour de consommation − 1. Une date que le modèle propose est une date qu'il peut se tromper de semaine. |

`take_out_on` est **calculé côté produit** et pas demandé au modèle, pour la
même raison que `inPantry` sur les ingrédients : c'est une dérivation
arithmétique, et une dérivation arithmétique confiée à un modèle est une
dérivation qui sera fausse un jour sans qu'on sache lequel.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | `keeps` est une liste **fermée**, rejetée au parseur si inconnue | Une valeur inventée est un rangement que l'écran ne sait pas nommer, donc une consigne que l'élève ne lit pas. |
| R2 | `take_out_on` est **calculé**, jamais lu du modèle | Voir §5. |
| R3 | Une préparation consommée à plus de `MAX_FRIDGE_DAYS` de sa cuisson **doit** être `freezer` | Sinon le plan propose de manger quelque chose qui n'est plus mangeable, et c'est la seule règle de cette fiche qui touche à la santé. |
| R4 | `freezer` dans `equipment_out` ⇒ **aucune** préparation `freezer` | Un plan qui suppose un appareil absent est un plan infaisable. Le générateur doit alors raccourcir les écarts, pas ignorer la contrainte. |
| R5 | Le message de la veille **ne dit pas de durée de conservation** | Hors périmètre engageant. On dit un geste, pas une garantie sanitaire. |
| R6 | Aucun message si `take_out_on` est déjà passé | Un rappel pour hier apprend à ignorer les rappels. |
| R7 | Le message respecte le plafond proactif et **ne préempte pas un bilan** | Le plafond existe parce qu'il a été violé ; l'ajout d'un émetteur ne le rouvre pas. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Le modèle rend un `keeps` inconnu | Écarté ; la préparation est traitée par R3 sur la seule arithmétique des dates. Le plan reste valide. |
| Le plafond proactif est plein le soir de la veille | **Le message tombe.** Il n'est pas reporté au lendemain matin : sorti trop tard, il est faux. L'information reste visible sur l'écran du plan, qui est la source, pas le message. |
| L'élève n'a pas de congélateur mais le plan en suppose un | R4 mord à la génération. Si la contrainte arrive après coup, le plan n'est pas réécrit — voir [FF-006](FF-006-cycle-de-vie-du-plan.md). |
| Le plan est régénéré après l'envoi du message | Le message déjà parti est faux. **Accepté et assumé** : la contrepartie serait de tenir un registre des messages à annuler, ce qui coûte plus que le cas ne pèse. À revoir si la régénération tardive devient fréquente. |
| Une préparation est cuisinée le jour même de sa consommation | `same_day`, aucun message. |

## 8. Critères d'acceptation

```gherkin
Étant donné une préparation cuisinée le dimanche
Et dont une portion est prévue pour le jeudi
Quand le plan est écrit
Alors cette préparation porte keeps = "freezer"
Et take_out_on vaut le mercredi
```

```gherkin
Étant donné une préparation cuisinée le dimanche
Et dont la dernière portion est prévue pour le mardi
Quand le plan est écrit
Alors cette préparation porte keeps = "fridge"
Et aucun message de sortie n'est programmé
```

```gherkin
Étant donné un élève qui a déclaré ne pas avoir de congélateur
Quand il génère une semaine de sept jours
Alors aucune préparation ne porte keeps = "freezer"
```

```gherkin
Étant donné une préparation dont take_out_on est demain
Et un plafond proactif déjà atteint pour ce soir
Quand la livraison du soir tourne
Alors aucun message de sortie n'est envoyé
Et le plafond n'est pas dépassé
```

## 9. Rabbit holes

- **Le plafond proactif est une ressource rare, et ce message est récurrent.**
  Une semaine bien préparée peut produire trois ou quatre sorties de
  congélateur. À deux messages non sollicités par jour, dont les bilans
  réservent leur part, ce message peut manger tout le budget d'attention. La
  sortie possible : **grouper** — un seul message le dimanche soir qui liste les
  sorties de la semaine — mais un rappel pour jeudi lu dimanche ne sert à rien.
  C'est le vrai arbitrage de cette fiche.
- **La sécurité alimentaire est un terrain où l'on n'a pas le droit d'être
  approximatif.** D'où le hors-périmètre sur les durées. La tentation d'écrire
  « ça se garde jusqu'à mercredi » sera forte parce que c'est utile ; elle est
  interdite parce qu'on ne connaît pas la chaîne du froid de cette cuisine.
- **`MAX_FRIDGE_DAYS` est aujourd'hui une constante de courses.** L'utiliser
  aussi comme frontière de conservation lui donne un second métier. Si l'un des
  deux usages veut la changer, l'autre bouge en silence. La nommer deux fois, ou
  l'assumer explicitement dans son commentaire.
- **Le foyer.** Une préparation nourrit plusieurs personnes à des jours
  différents (`member_portions`). La dernière portion consommée décide de
  `keeps`, pas la première. Se tromper de bout produit exactement le mauvais
  rangement.

## 10. Ce qu'on mesure

- **La mesure :** part des repas cochés parmi ceux dont la préparation est
  `freezer` — comparée aux `fridge`. C'est le chiffre qui dit si la fin de
  semaine tient.
- **La contre-mesure :** taux de désabonnement du canal proactif, et part des
  bilans du soir qui **n'ont pas pu partir** parce que le plafond était pris.
  Si les sorties de congélateur commencent à évincer les bilans, cette
  fonctionnalité coûte plus qu'elle ne rapporte, et c'est le regroupement de la
  §9 qu'il faut construire — ou rien.

## 11. Questions ouvertes

1. **Un message par sortie, ou un récapitulatif hebdomadaire ?** Voir §9. C'est
   la question la plus lourde de la fiche et elle n'est pas tranchée.
2. **`MAX_FRIDGE_DAYS = 3` est-il la bonne frontière pour la conservation ?**
   Elle a été choisie pour les courses. Trois jours est prudent pour un plat
   cuisiné, peut-être trop pour certaines préparations et pas assez pour
   d'autres. Ne pas la faire varier par plat sans une raison qu'on sait défendre.
3. **Cette fiche suppose la stratégie « une course, on congèle » de
   [FF-005](FF-005-strategie-de-courses.md).** En mode vagues, il y a beaucoup
   moins de congélation — donc beaucoup moins de messages. Les deux fiches se
   lisent ensemble.
