# FF-054 · Le retour de fin de plan — la vérité terrain du moteur

| | |
|---|---|
| **Identifiant** | `FF-054-le-retour-de-fin-de-plan` |
| **Statut** | 🟠 Noyau livré et vert — câblage à faire (§3) |
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

### À câbler

1. **Le déclencheur** — `planWindowState(row, today) === "elapsed"`, non
   `retired_at`, sans ligne de retour ⇒ `feedbackIsDue`. Deux surfaces, en
   **paresseux** : à l'ouverture de l'app, et avant la génération suivante.
   **Pas de cron** (le dépôt a déjà payé « crons KEEL : invoke ≠
   x-internal-secret, 403 sur chaque envoi »), et **jamais bloquant**.
2. **Le chat** — via `handleDeterministicButton`
   (`_shared/chat/deterministic_buttons.ts`). Une question à la fois, boutons,
   **aucun champ libre** (il inviterait à raconter ce qui a été mangé). Un
   « pas maintenant » visible dès la première question ⇒ `dismissed_at`.
3. **Les trois destinations** — c'est ce qui empêche de refaire le point du
   dimanche, et chacune a un test d'intégration à écrire :
   - `cooked` → `practical_constraints.cooking_time_min` / `recipe_difficulty`
   - `portions` → le ré-ancrage de l'enveloppe
   - `never_again` → `reconcileFoodPreferencesFor` (**pipeline existant**)
4. **RGPD** — réclamer `meal_plan_feedback` à l'export et à la suppression.
   Le dépôt a déjà payé « le lifecycle ne réclame pas les tables neuves ».

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
2. **Le foyer.** Qui répond pour un plan de foyer ? Le compositeur de la
   session, probablement — mais les portions concernent chaque membre. Non
   tranché ; à reprendre avec la lane foyer.
