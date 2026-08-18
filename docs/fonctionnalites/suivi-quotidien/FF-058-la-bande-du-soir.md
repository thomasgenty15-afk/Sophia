# FF-058 · La bande du soir

| | |
|---|---|
| **Identifiant** | `FF-058-la-bande-du-soir` |
| **Statut** | 🟡 Spécifiée |
| **Date** | 2026-08-12 |
| **Autorité produit** | [conversation/README.md](../conversation/README.md) (T1–T9) · `_shared/keel/daily_recap.ts` (« le fait est le compliment ») |
| **Dépend de** | `_shared/keel/meal_tick.ts` · `daily_recap*.ts` (le véhicule) · `daily_pulse.ts` (le patron de boutons) · `meal_plan_window.ts` · `daily_ask_budget.ts` (T4) |
| **Ouvre** | [FF-057](../composition-des-repas/FF-057-la-procedure-accident.md) — un `✗` de repas et un `Pas encore` de courses sont **deux** de ses quatre entrées |
| **Effort estimé** | 2 jours |

---

## 1. Le problème

La coche existe et elle est bonne : `quick_tap` → `protocol_events`, clé
`mealTickKey`, idempotence arbitrée par Postgres. **Mais elle coûte trop cher à
poser.** Il faut ouvrir l'app, trouver l'écran, retrouver les plats du jour,
cocher. Personne ne le fait tous les jours.

Résultat : les coches sont clairsemées, et **tout ce qui les lit devient faux
par absence**. Le fait du soir n'a pas de matière. L'adhérence est sous-estimée.
La vue coach montre un élève silencieux qui dîne pourtant tous les soirs. Et
[FF-056](../conversation/FF-056-la-divergence-constatee.md) — la divergence
constatée — ne peut rien conclure : elle compare un poids réel à des coches
absentes.

**Ce que ça coûte.** Ce n'est pas une donnée manquante, c'est une donnée
**fausse dans le sens flatteur ou accusateur selon le lecteur**. Un produit qui
construit ses décisions sur des coches clairsemées décide sur du bruit.

**Ce que ce n'est pas.** Une envie de tracker davantage. La donnée était déjà
voulue par la personne — c'est le **prix du geste** qui l'en empêchait.

## 2. Job stories

> **Quand** je vais me coucher, **je veux** dire en un geste que la journée
> s'est passée comme prévu, **pour que** je n'aie pas à ouvrir un écran et
> retrouver mes plats.

> **Quand** un seul repas a dérapé, **je veux** le signaler sans détailler les
> deux autres, **pour que** dire la vérité coûte moins cher que laisser courir.

> **Quand** je n'ai rien envie de dire, **je veux** pouvoir ignorer, **pour
> que** ça ne devienne pas un devoir du soir.

## 3. Périmètre

### Dans le périmètre

Dans le message du soir **qui existe déjà** — jamais un message de plus. Il
s'ouvre sur le fait du jour (gratuit à recevoir), puis **nomme les plats
prévus** et propose :

- **`[ ✓ Tout comme prévu ]`** — **un seul tap**, toutes les coches du jour
  écrites, terminé.
- **`[ Pas tout ]`** — les plats du jour apparaissent, ✓/✗ chacun.
- Un **✗** écrit la décoche et **ouvre FF-057** (la procédure accident).

Le cas majoritaire — la journée normale — coûte **un geste**. La déviation en
coûte deux ou trois.

### Le foyer — qui répond de quoi

Un plan de foyer est **une cuisson pour plusieurs bouches**, et une soirée y
porte deux natures de fait qui n'appartiennent pas à la même personne :

> **La cuisson est un fait du foyer. La consommation est un fait de personne.**

| Qui | Reçoit sa bande ? | Répond de quoi |
|---|---|---|
| **Le compte maître** (celui qui cuisine) | oui | sa propre consommation **et** le fait de foyer : le plat a-t-il été fait et servi comme prévu |
| **Un profil réclamé** (le conjoint, sur son app) | oui, **la sienne** | **lui seul**. Personne ne coche à sa place |
| **Une bouche sans compte** (les enfants) | non | rien — voir ci-dessous |

**La question de session ne part qu'au maître.** « La session de dimanche a eu
lieu ? » — lui seul le sait, sa réponse engage tout le monde, et c'est elle qui
déclenche la cascade de [FF-057](../composition-des-repas/FF-057-la-procedure-accident.md).
La poser à un profil réclamé produirait du bruit : il n'en sait rien.

**Les bouches sans compte n'ont pas de coche.** Leur consommation individuelle
n'est lue par personne — pas d'objectif, pas de mesures, pas de ceinture. La
collecter violerait la règle mère (T1). Le tap du maître dit « le plat a été
fait et servi comme prévu, **moi compris** » ; il ne dit rien de chaque enfant,
et il n'a pas à le dire.

Conséquence directe et voulue : le maître peut taper `✓ Tout comme prévu`
pendant que le conjoint tape `✗ J'ai commandé`. **Ce n'est pas une
contradiction** — ce sont deux faits vrais sur deux personnes. Le plan lit le
fait de foyer chez le maître, et le fait de personne chez chacun.

### La vague de courses — le même geste, sur un autre objet

`grocery_waves.ts` calcule déjà, pour chaque vague, sa date d'achat (`buyOn`)
et la cuisson qu'elle sert (`servesCookOn`). **Personne ne sait jamais si elle
a été faite** : les coches de `ShoppingListPanel.tsx` sont du `React.useState`
(l. 125) — elles meurent au rechargement et n'atteignent jamais la base.

Le soir d'un `buyOn`, la bande porte donc une ligne de plus :

**`[ ✓ Courses faites ]` / `[ Pas encore ]`** — un tap, et l'état de la vague
est écrit.

C'est **un fait du foyer**, comme la cuisson (R10) : la question ne part
**qu'au compte maître**. Et c'est **une affordance**, pas une question : elle
ne consomme pas le budget T4.

Ce que devient un `Pas encore` — la **proposition de décalage** du plan —
appartient à [FF-057](../composition-des-repas/FF-057-la-procedure-accident.md).
Ici on constate, on ne répare pas.

### Hors périmètre — engageant

- ❌ **Jamais un second message.** La bande voyage dans le message du soir.
  Deux notifications, c'est le problème qu'on répare, doublé.
- ❌ **Aucune question sur le futur, nulle part.** La date des courses est
  **déjà dans le plan** (`buyOn`) : le jour venu on constate, et c'est tout. Ce
  qu'on fait d'un `Pas encore` se **propose** (FF-057), ça ne se demande pas.
- ❌ **La bande ne remplace pas la liste.** Cocher article par article reste le
  geste de l'écran, dans le magasin. La bande dit **une** chose : la vague est
  faite, ou pas.
- ❌ **Jamais une question.** `[✓ poulet-riz]` **offre** ; « t'as mangé le
  poulet ? » **interroge**. La frontière est dans la formulation, et c'est elle
  qui rend cette fiche compatible avec T3 (le chat n'initie jamais une
  collecte).
- ❌ **Aucune relance.** Ignorer n'a aucune conséquence, ni le soir même, ni le
  lendemain. Jamais « tu n'as pas coché hier ».
- ❌ **Aucun verdict, même positif.** Le `✓` n'obtient ni « bravo », ni « 3/3 »,
  ni série. Les ceintures du soir couvrent ce chemin comme les autres.
- ❌ **Aucun score, aucune série, aucun compte fondu.** Le volume de coches va
  monter ; il ne doit produire aucun pourcentage à l'écran
  (`adherence_score` est une surface supprimée).
- ❌ **Aucune coche automatique.** Le silence n'écrit rien, jamais.
- ❌ **Aucune conséquence sur le plan.** Ce que devient un `✗` appartient à
  FF-057. Cette fiche capte, elle ne répare pas.
- ❌ **Muet sous plancher de restriction.** Sous `restriction_flag`, pas de
  bande. Le plancher est **par personne** : un maître sous plancher ne reçoit
  pas de bande, ses co-membres continuent de recevoir la leur.
- ❌ **Le maître ne coche jamais pour un profil réclamé.** Remettre quelqu'un
  en position de déclarer ce qu'un autre adulte a mangé, c'est la surveillance
  qu'on a retirée — et c'est la raison d'être de la frontière de
  confidentialité qui rend l'honnêteté possible.
- ❌ **Aucune coche par bouche sans compte.** Personne ne la lit ; la collecter
  violerait T1.

## 4. Le circuit

```
   LE MESSAGE DU SOIR — celui qui existe déjà
   ① le fait du jour (inchangé, gratuit à recevoir)
   ② « Aujourd'hui : poulet-riz · soupe · yaourt-fruits »
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
  [✓ Tout comme prévu]      [Pas tout]
        │                        │
   toutes les coches        les plats, ✓/✗ chacun
   du jour écrites               │
   UN SEUL TAP              un ✗ → décoche écrite
   bonne nuit                    │
                                 ▼
                        ┌────────────────────┐
                        │ FF-057 · ACCIDENT  │
                        │ (fiche à part)     │
                        └────────────────────┘
```

**Le point qui gouverne le dessin** : le geste nominal coûte **un tap**. Trois
questions oui/non par soir seraient le formulaire quotidien que ce produit a
retiré — et dont il a mesuré la fin : *« un formulaire quotidien se fait
ignorer, puis couper ; la mesure elle-même finissait par se détruire »*.

## 5. Modèle de données

**Aucune table neuve.** Strictement le chemin de l'écran :

| Donnée | Où |
|---|---|
| la coche | `protocol_events`, `source='quick_tap'`, `source_message_id = mealTickKey(mealId, dishIndex)` |
| la décoche | ligne append-only + `disqualified_reason = MEAL_UNTICK_REASON` |
| **l'état d'une vague de courses** | **à porter** — la seule donnée neuve |

**L'état de vague est neuf, et il n'a aucun équivalent.** Les coches de la
liste sont du `React.useState` (`ShoppingListPanel.tsx:125`) : elles ne
survivent pas à un rechargement et n'atteignent jamais la base. Ce qu'il faut
écrire est minimal — **la vague (plan + `buyOn`) est faite ou non, et quand** —
et surtout pas un état par article : personne ne le lit, et une liste
partiellement cochée n'est pas une information exploitable en aval.

L'index unique partiel `(user_id, source_message_id)` rend le double tap
idempotent **côté Postgres** — rien à coder.

⚠️ Un plan **courant** et un plan **suivant** coexistent, et leurs coches
portent le même préfixe. Le rattachement passe par `parseMealTickKey` et le
`mealId`, jamais par `startsWith` — sinon un numérateur mélange deux plans face
à un dénominateur venu d'un seul, et le message du soir affiche « 5 des 3 »
sans que rien ne le signale.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Le cas nominal coûte **un tap** | trois oui/non par soir, c'est le formulaire quotidien : il se fait ignorer, puis couper, et la mesure se détruit elle-même |
| **R2** | Une **affordance**, pas une question | c'est ce qui la distingue de la collecte que le produit s'interdit (T3) ; la formulation reste non interrogative, et ça se teste sur le texte |
| **R3** | Le silence est une réponse | zéro relance, zéro remarque, aucune conséquence |
| **R4** | Aucun verdict, même positif | féliciter une journée que la personne sait mauvaise détruit tout le canal, sans retour possible |
| **R5** | **Exactement** le chemin d'écriture de l'écran | deux implémentations d'une même coche divergent sur les bords, et la divergence se lit « l'écran dit mardi, la conversation dit mercredi » sans qu'on sache laquelle ment |
| **R6** | La bande **ne consomme pas** le budget T4 ; toute **question** oui | affordance ≠ demande. Mais le même soir ne porte alors une pratique-question (FF-029) ou une recommandation (FF-028) **que si le budget est libre** — sinon on recharge le soir petit à petit, et dans six mois c'est un sapin de Noël |
| **R7** | Zéro plat prévu ⇒ **aucune bande** | le message du soir reste exactement ce qu'il est |
| **R8** | Muet sous `restriction_flag`, **par personne** | le plancher prime, et il ne se propage pas d'un membre à l'autre |
| **R9** | Ce que devient un `✗` n'est pas ici | la capture et la réparation sont deux fiches, et elles doivent pouvoir se retirer séparément |
| **R10** | **La cuisson est un fait du foyer ; la consommation est un fait de personne** | c'est la règle qui répartit les questions. La session ne se pose qu'au maître (lui seul sait, et sa réponse engage tout le monde) ; la coche ne se pose qu'à soi |
| **R11** | Le maître ne coche **jamais** pour un profil réclamé | sinon la mère déclare ce que le père a mangé : c'est la surveillance qu'on a retirée, et ça détruit la raison d'être du profil réclamé |
| **R12** | Une bouche sans compte n'a **aucune** coche individuelle | personne ne la lit — T1. Le tap du maître dit « fait et servi comme prévu, moi compris », rien de plus |
| **R13** | Maître `✓` et conjoint `✗` **ne se contredisent pas** | deux faits vrais sur deux personnes ; aucun des deux ne corrige l'autre |
| **R14** | La vague de courses est **un fait du foyer** : la ligne ne part qu'au maître | même nature que la cuisson (R10). Un profil réclamé n'a pas à savoir si les courses sont faites — et sa réponse serait du bruit |
| **R15** | La ligne de courses n'apparaît **que le soir d'un `buyOn`** | sinon c'est un rappel quotidien de corvée, et la bande devient une liste de reproches |
| **R16** | On écrit **l'état de la vague**, jamais un état par article | personne ne lit une liste à moitié cochée ; T1 |
| **R17** | On constate, on ne demande rien sur le futur | la date est déjà dans le plan. Ce qu'on fait d'un `Pas encore` se propose (FF-057) — jamais une question ouverte sur une intention |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Personne ne répond | rien n'est écrit, rien n'est inféré, aucune relance |
| Tap `✓` puis correction dans l'app | la décoche gagne — append-only, `disqualified_reason` |
| Double tap / tap rejoué | idempotent : une coche par plat et par jour |
| Aucun plat prévu ce jour-là | aucune bande |
| Deux plans coexistants | `parseMealTickKey` rattache au bon ; jamais de ratio > 100 % |
| Le plan change entre l'envoi et le tap | les **coches** restent valides (elles disent un fait passé) ; c'est l'**action** de FF-057 que l'empreinte invalide |
| Le message part sans matière (pas de fait du jour) | la bande peut porter le message seule, si des plats sont prévus |
| Le maître tape `✓` et le conjoint `✗` le même soir | les deux sont écrits tels quels — aucun n'écrase l'autre, aucun ne déclenche de question de cohérence |
| Le maître ne répond pas, un profil réclamé si | on sait ce qu'a fait le conjoint, on ne sait pas si la cuisson a eu lieu. **Inconnu, pas échoué** |
| Un profil réclamé reçoit la question de session | **c'est un bug** — elle ne part qu'au maître |
| Le maître est sous plancher, pas le conjoint | le conjoint reçoit sa bande normalement |
| Le foyer n'a aucun profil réclamé | une seule bande, celle du maître — le cas nominal aujourd'hui |
| Aucune vague ne tombe ce soir | aucune ligne de courses ; la bande ne parle que des plats |
| Deux vagues le même jour | une seule ligne — la question porte sur « les courses du jour », pas sur chaque vague |
| `Pas encore` tapé et la cuisson est dans 4 jours | rien de plus ce soir. **Le danger n'est pas là**, et FF-057 ne s'ouvre pas |
| Vague marquée faite puis la personne se ravise | la dernière réponse gagne ; l'état de vague n'est pas append-only, il est un état |

## 8. Critères d'acceptation

```gherkin
Étant donné une journée avec trois plats prévus
Quand le message du soir part et que la personne tape « Tout comme prévu »
Alors trois coches sont écrites en base, par le même chemin que l'écran
Et la réponse ne contient aucun compliment, aucun score, aucune série

Étant donné la même journée
Quand la personne tape « Pas tout »
Alors les trois plats apparaissent avec ✓/✗
Et un ✗ écrit la décoche puis passe la main à FF-057

Étant donné un double tap sur la même case
Quand on lit la base
Alors il n'y a qu'une ligne

Étant donné une journée sans aucun plat prévu
Quand le message du soir part
Alors il ne porte aucune bande

Étant donné un plan courant et un plan suivant qui coexistent
Quand les coches sont comptées
Alors chacune est rattachée à son plan, et aucun ratio ne dépasse 100 %

Étant donné une personne qui ignore le message trois soirs de suite
Quand le quatrième message part
Alors il ne mentionne rien des trois précédents

Étant donné un élève sous plancher de restriction
Quand le message du soir part
Alors il ne porte aucune bande

Étant donné un foyer avec un compte maître et un profil réclamé
Quand le soir arrive
Alors chacun reçoit SA bande, sur son propre budget
Et la question de session ne part QU'AU MAÎTRE

Étant donné que le maître tape « Tout comme prévu »
Et que le profil réclamé tape « ✗ j'ai commandé »
Quand on lit la base
Alors les deux faits coexistent
Et aucun ne corrige ni n'écrase l'autre

Étant donné un foyer avec deux enfants sans compte
Quand le maître tape « Tout comme prévu »
Alors aucune coche individuelle n'est écrite pour les enfants

Étant donné un maître sous plancher de restriction et un conjoint qui ne l'est pas
Quand le soir arrive
Alors le maître ne reçoit aucune bande
Et le conjoint reçoit la sienne

Étant donné une vague de courses dont le buyOn est aujourd'hui
Quand le message du soir part au maître
Alors il porte la ligne « Courses faites ? »
Et il ne la porte PAS le lendemain si rien ne tombe

Étant donné un foyer avec un profil réclamé
Quand la ligne de courses part
Alors elle ne part QU'AU MAÎTRE

Étant donné un tap sur « Courses faites »
Quand on lit la base
Alors l'état de la vague est écrit, avec sa date
Et aucun état par article n'est écrit

Étant donné un tap sur « Pas encore » et une cuisson prévue dans quatre jours
Quand le tour se termine
Alors rien d'autre ne se déclenche ce soir-là

Étant donné un soir où une recommandation et une pratique-question sont dues
Quand le message est composé
Alors le budget T4 tranche, et le message reste lisible
```

## 9. Rabbit holes

- **Le sapin de Noël du soir.** Fait + bande + pratique + recommandation +
  invitation photo : chaque ajout paraît petit, et le message devient
  illisible. R6 est la parade, et elle se **mesure** — longueur du message et
  nombre d'éléments interactifs, avant/après.
- **L'affordance qui redevient une question.** « Tu as bien mangé le poulet ? »
  au lieu de `[✓ poulet-riz]`. Ça se teste sur le texte produit, FR et EN.
- **La coche qui devient un score.** Rendre le geste facile fait exploser le
  volume. Quelqu'un voudra en faire un pourcentage — c'est exactement ce que le
  produit a supprimé.
- **Les deux plans.** Le piège est déjà documenté dans `meal_tick.ts` et il a
  déjà produit un « 5 des 3 » en production de test.

## 10. Ce qu'on mesure

- **Densité des coches** avant / après — c'est le bénéfice, et il conditionne
  la justesse de FF-056 et de l'adhérence
- Part des soirs complétés **en un seul tap** (la santé de l'entonnoir)
- Longueur du message du soir et nombre d'éléments interactifs

**Contre-mesure — et c'est la raison d'être de cette fiche séparée.** Le taux
de réponse au message du soir **dans son ensemble**. Si l'ajout de la bande le
fait baisser, elle cannibalise le canal qui la porte — et le canal prime.
Cette fiche doit alors pouvoir passer ⚪ **Gelée** sans toucher à FF-057, qui
garde ses deux autres entrées.

## 11. Questions ouvertes

- **La réclamation de profil n'existe pas encore.** Les règles R10–R13 sont
  écrites maintenant parce qu'elles coûtent zéro à poser et cher à rattraper —
  mais **la bande d'un profil réclamé ne se construit que le jour où les
  profils réclamés existent**. Aujourd'hui : une bande, celle du maître.
- Si un jour la consommation d'un enfant devient lue par quelque chose (un
  coach ? un suivi de croissance ?), R12 se rouvre — **par une décision
  écrite**, pas par un besoin de tableau.
- L'ordre exact dans le message (fait puis bande) est posé ici par principe —
  à confirmer sur un vrai run, en lisant le message tel qu'il sort.
