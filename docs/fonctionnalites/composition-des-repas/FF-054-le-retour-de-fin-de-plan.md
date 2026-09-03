# FF-054 · Le retour de fin de plan — la vérité terrain du moteur

| | |
|---|---|
| **Identifiant** | `FF-054-le-retour-de-fin-de-plan` |
| **Statut** | 🟠 Livrée sur ses deux surfaces (écran + conversation), mais **l'ÉMETTEUR de la conversation est à corriger** : il part au message du soir, il doit partir à 22h30 le dernier jour du plan (décision du 2026-09-01, [FF-062](../conversation/FF-062-quand-sophia-parle-la-premiere.md)). Reste aussi le RGPD (§3) |
| **Date** | 2026-08-11 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) · [PLAN-RETOUR-ET-ACTIVITE](../../../scratchpad/PLAN-RETOUR-ET-ACTIVITE.md) |
| **Dépend de** | `_shared/keel/plan_feedback.ts` (livré) · `meal_plan_window.ts` · `deterministic_buttons.ts` · migration `20260811090000` (appliquée) |
| **Effort estimé** | noyau livré ; câblage ≈ 1,5 jour |

---

## 1. Le problème

Le moteur de composition produit des verdicts **sans aucune vérité terrain**.
Il sait qu'un plan respectait son enveloppe *sur le papier* ; il ignore
totalement si la personne a pu le cuisiner, si les portions étaient justes, ou
si elle a lâché le mercredi.

C'est le seul angle mort du moteur, et **aucune autre entrée du produit ne le
comble**.

### ⚠️ Le précédent qui gouverne cette fiche

Le point du dimanche (`keel-weekly-flow-v1`, six axes) a été **supprimé**. Pas
parce qu'il était mal fait : parce qu'il **collectait pour un lecteur qui
n'existait pas** — `coach_synthesis_io.ts` n'a jamais lu `biofeedback` (`git
log -S` : zéro commit).

> **Chaque question nomme son lecteur avant d'être posée.** La table
> `QUESTION_READERS` (`plan_feedback.ts`) le rend vérifiable, et un test
> parcourt le vocabulaire pour exiger l'entrée. Une question dont on ne peut
> pas écrire le lecteur ne se pose pas.

### Le recadrage qui rend le chantier sûr

« Comment ça s'est passé » est à un pas de « as-tu tenu » — une question de
conformité, dans un produit qui a supprimé les scores et les séries exprès.

> **On évalue LE PLAN, jamais la personne.**

C'est déjà la doctrine du bilan alimentaire : on interroge ce qui **manque au
plan**, jamais ce que la personne a ingéré. Un test lexical vérifie qu'aucun
libellé ne porte un registre de conformité, dans les deux langues.

---

## 2. Job stories

- **Quand** ma semaine de plan est finie et que je n'ai cuisiné que deux plats
  dessus, **je veux** pouvoir le dire en trois clics, **afin que** le prochain
  ne me demande pas encore une heure de cuisine par soir.
- **Quand** les portions étaient trop grosses, **je veux** que ça change,
  **afin de** ne pas jeter la moitié.
- **Quand** je ne veux pas répondre, **je veux** fermer et qu'on me lâche,
  **afin de** ne pas revoir la même question à chaque ouverture.

---

## 3. Périmètre

### Livré (2026-08-11)

- `_shared/keel/plan_feedback.ts` — module pur : le vocabulaire des questions,
  `QUESTION_READERS`, la 4ᵉ question par dynamique, la garde TCA,
  `feedbackIsDue`, `effectOf`. **12 tests verts.**
- Migration `20260811090000_meal_plan_feedback.sql` — table, `revoke`, RLS en
  lecture seule côté élève, unicité par plan. **Appliquée et ré-appliquée.**

### Livré (2026-08-… ) — L'ÉCRAN

`frontend/src/keel/api/planFeedback.ts` + `components/plan/PlanFeedbackDialog.tsx`,
ouverts depuis `StudentWeekPlanPage`. Le déclencheur est **paresseux** et
**jamais bloquant** : `planWindowState === "elapsed"`, non `retired_at`, sans
ligne de retour. Les trois destinations sont câblées (`cooked` → temps de
cuisson et difficulté ; `portions` → ré-ancrage de l'enveloppe ;
`never_again`/`make_again` → `reconcileFoodPreferencesFor`).

### Livré (2026-09-01) — LA CONVERSATION (§3.2)

> ⚠️ **LE VÉHICULE EST À CORRIGER — décision du 2026-09-01, APRÈS le lot.**
>
> Ce lot a accroché la première question au **message du soir**
> (`keel-daily-pulse-v1`, 20h-22h), en remplacement de la bande. C'était le bon
> arbitrage sous T4 tel qu'il était écrit ce matin-là ; il ne l'est plus.
>
> **Le retour de fin de plan part à 22h30, le dernier jour de la fenêtre du
> plan** — une seule fois, à la fermeture. Deux raisons :
>
> 1. un questionnaire de bilan qui arrive à 21h30 se remet à demain, et demain
>    il entre en concurrence avec le bilan du jour ([FF-061](../suivi-quotidien/FF-061-le-bilan-du-jour.md)) ;
> 2. T4 a été amendée le même jour ([FF-062](../conversation/FF-062-quand-sophia-parle-la-premiere.md)) :
>    le budget d'une demande par jour ne s'applique plus aux canaux adossés à un
>    fait du plan. Le retour n'a donc plus besoin de prendre la place de la
>    bande — il peut avoir son propre moment.
>
> **Ce qui reste juste dans le lot livré** : le vocabulaire de boutons, l'état
> dérivé de la ligne, l'écriture progressive, le marqueur `answered`, le routage
> des taps. Seul **l'émetteur** change de moment.
>
> 22h30 et pas minuit : « quand la fenêtre s'achève » est une borne de
> calendrier, pas une heure où l'on pose une question. Et 22h30 est **après** le
> bilan du jour (20h-22h), donc le dernier soir porte les deux — le bilan ferme
> la journée, le retour ferme la semaine.

| Morceau | Où |
|---|---|
| Le vocabulaire, l'état, le rendu | `_shared/keel/plan_feedback_chat.ts` (PUR) |
| Les lectures et l'écriture progressive | `_shared/keel/plan_feedback_chat_io.ts` |
| Le routage des taps | `_shared/chat/plan_feedback_tap.ts` + la 6ᵉ famille (`KEEL_FEEDBACK_`) dans `deterministic_buttons.ts` |
| L'émission | `keel-daily-pulse-v1` (compteur `feedback_opened`) |
| Le marqueur `answered` | migration `20260901160000` |

**Une question à la fois, boutons, aucun champ libre.** « Pas maintenant » n'est
offert que sur la **première** question ⇒ `dismissed_at`, et rien ne revient.

**Ce que la conversation ne pose pas** : « une envie pour la suite ? »
(`newEnvyIsAsked`) reste à l'écran — elle écrit dans
`household_envy_submissions`, en **texte libre**, que §3.2 interdit ici.

**Réduction assumée** : un seul plat par question de plat (l'écran en laisse
cocher plusieurs). Enchaîner « et un autre ? » serait l'interrogatoire que §3.2
refuse.

**Pourquoi la conversation n'appelle PAS `keel_plan_feedback_submit`** : la RPC
est gatée sur `auth.uid()`, qui est **NULL en `service_role`** — le chemin
déterministe du chat y rendrait `not_authenticated` à chaque tap, en silence.
Elle est aussi `on conflict do nothing`, donc incompatible avec un remplissage
tap après tap.

### À câbler

1. **RGPD** — réclamer `meal_plan_feedback` à l'export et à la suppression.
   Le dépôt a déjà payé « le lifecycle ne réclame pas les tables neuves ».
2. **Le déclencheur « avant la génération suivante »** — prévu par cette fiche,
   jamais construit. L'ouverture de l'app et le message du soir le couvrent
   aujourd'hui.

### Hors périmètre

Aucun historique montré à l'élève. Trois réponses ne font pas une tendance
affichée : le retour alimente la génération, il ne se rend jamais.

---

## 4. Le circuit

```
fenêtre écoulée (planWindowState === "elapsed")
        ↓  feedbackIsDue()
questionsFor(goal, restrictionFlag)   ← la garde vit ICI, une seule fois
        ↓
chat, boutons déterministes, 3 ou 4 questions
        ↓
meal_plan_feedback (une ligne, ou dismissed_at)
        ↓  effectOf()
   ┌────┴──────────────┬─────────────────────┐
   ↓                   ↓                     ↓
cooking_time_min   ré-ancrage           food_preferences
recipe_difficulty  d'enveloppe          (pipeline existant)
```

---

## 5. Modèle de données

Voir la migration. Les deux colonnes qui méritent une note :

**`dismissed_at`** — un refus est une réponse, et il se stocke. Sans elle,
fermer le questionnaire le fait revenir à chaque ouverture : on transforme un
« non merci » en harcèlement.

**`axis_question`** — stockée **avec** la réponse, parce que `no` est ambigu
sans elle (« pas eu faim » pour `hunger_between_meals`, « pas fini » pour
`could_finish`). `effectOf` refuse d'ailleurs de deviner et rend `null`.

---

## 6. Règles et garanties

**R1 — Chaque question a son lecteur.** `QUESTION_READERS` est parcourue par un
test. *Testé.*

**R2 — On évalue le plan, jamais la personne.** Test lexical sur toute la table
de libellés, EN et FR : aucun « as-tu tenu », « respecté », « suivi »,
« adhérence », « qu'as-tu mangé ». *Testé.*

**R3 — Sous `restriction_flag`, la sortie est indiscernable.** Les questions de
portion et de faim disparaissent, **et aucune question d'axe n'est ajoutée** —
sinon le questionnaire deviendrait lui-même un oracle (« on ne m'a pas demandé
les portions, donc je suis marqué »). Égalité de chaînes contre le cas
dynamique-inconnue, pour les six dynamiques. *Testé.*

**R4 — Quatre questions au maximum.** Au-delà c'est un formulaire, et un
formulaire ne se remplit pas. `maintenance` n'a **pas** de 4ᵉ question : son
objectif est l'écart minimal. *Testé.*

**R5 — `none` n'est jamais un plat.** Versé dans les préférences, il créerait un
aliment refusé fantôme que le générateur éviterait à vie. *Testé.*

**R6 — Aucun accent suggéré ne porte de chiffre.** `NUMERIC_TARGET_PATTERNS`
rejette en sortie toute masse accolée à une macro : un accent chiffré
produirait des lignes systématiquement filtrées, donc une génération dégradée
par le retour censé l'améliorer. *Testé.*

**R7 — Une seule fois par fenêtre**, garanti en base (`unique (meal_id)`) et non
par un `if` applicatif — deux surfaces proposent ce questionnaire.

---

## 7. Modes de défaillance

| Défaillance | Protection |
|---|---|
| Question sans lecteur | R1 + test sur le vocabulaire |
| Questionnaire qui note l'élève | R2 + test lexical bilingue |
| Le questionnaire trahit le flag TCA | R3 + égalité de chaînes |
| « non merci » redemandé sans fin | `dismissed_at` compté dans `feedbackIsDue` |
| Deux retours pour un plan | `unique (meal_id)` |
| `none` pollue les préférences | R5 |
| Réponse ambiguë ⇒ accent inversé | `effectOf` rend `null` plutôt que deviner |

---

## 8. Critères d'acceptation

- [x] Module pur, 12 tests verts
- [x] Migration appliquée **et ré-appliquée** (pas de `db reset`)
- [x] `revoke` sur `anon`/`authenticated`, prouvé dans la sonde
- [ ] Déclencheur branché sur `planWindowState`, en paresseux, non bloquant
- [ ] Questionnaire rendu dans le chat via `handleDeterministicButton`
- [ ] Les trois destinations atteintes — un test d'intégration chacune
- [ ] `meal_plan_feedback` réclamée par le lifecycle RGPD
- [ ] Désarmement : aucun retour ⇒ génération identique à aujourd'hui

---

## 9. Rabbit holes

**Le champ libre.** Tentant, et c'est exactement par là que rentre « j'ai mangé
une pizza jeudi » — donc du tracking, que le produit refuse. Boutons seulement.

**Le score de satisfaction.** Une note sur cinq serait lisible, agrégeable, et
deviendrait une métrique d'adhérence déguisée.

**Le rappel.** Une notification pour un questionnaire est le premier pas vers
la relance, et le produit a déjà retiré ce genre de boucle.

---

## 10. Ce qu'on mesure

- Taux de réponse et taux de `dismissed_at` — si le second domine, le
  questionnaire est mal placé ou trop long.
- Distribution de `portions` : si « trop » domine structurellement, les
  enveloppes sont mal calibrées et c'est le moteur qu'il faut corriger.
- Corrélation entre `cooked: "no"` et le `cooking_time_min` déclaré.

---

## 11. Questions ouvertes

1. **Où exactement à l'ouverture de l'app ?** Le chat s'impose, mais un plan
   écoulé depuis trois semaines mérite-t-il encore la question ? Un délai de
   péremption (au-delà de X jours, on laisse tomber) n'est pas tranché.
2. ~~**Le foyer.** Qui répond pour un plan de foyer ?~~ ✅ **Tranché le
   2026-09-03 (chantier P8, lot A8.2), et tranché par une PROPRIÉTÉ, pas par
   une règle qu'il aurait fallu écrire.**

   `meal_plan_feedback` est `unique(meal_id)` : **il n'y a qu'un retour par
   plan**, et c'est celui de la personne qui a composé — le **maître**, pour un
   plan `household`. Un profil réclamé (FF-048) **n'est jamais interrogé** en
   fin de fenêtre.

   ⚠️ **Ce n'est pas un oubli, et c'est pour ça que ça s'écrit ici.** Depuis
   A8.0 le membre reçoit sa bande du soir, depuis A8.1 il coche ses plats,
   depuis A8.2 il déclare le sort de sa boîte : trois surfaces où il parle. La
   quatrième lui est fermée, et un lecteur qui constate ce silence doit trouver
   la raison plutôt que de conclure à un trou. La raison est que le retour de
   fin de plan **gouverne la composition suivante** — il descend le style de
   cuisine, les rejets, la difficulté (§4). C'est un geste de **celui qui
   compose**, et « une seule personne gouverne le menu » (le-foyer/README, F1).
   Interroger le membre produirait soit une réponse qui ne change rien — la
   pire des questions —, soit un second gouvernail.

   Ce qui **remonte** du membre au plan suivant passe par les faits qu'il écrit
   pour lui (`protocol_events`, `meal_share_outcomes`), pas par un avis. Un fait
   n'a pas besoin d'être arbitré.

   ⛔ **Ce qui reste vrai malgré tout** : la contrainte est une propriété du
   schéma, donc elle tomberait en silence si quelqu'un la retirait. Aucune garde
   ne la tient aujourd'hui — c'est nommé au rapport A8.2 comme dette, pas
   comme acquis.
