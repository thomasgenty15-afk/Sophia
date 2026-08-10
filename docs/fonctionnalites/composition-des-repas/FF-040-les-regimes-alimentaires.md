# FF-040 · Les régimes alimentaires — un verrou, pas une préférence

| | |
|---|---|
| **Identifiant** | `FF-040-les-regimes-alimentaires` |
| **Statut** | 🟠 Fondations posées — câblage à faire (voir §3) |
| **Date** | 2026-08-10 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) · [DESIGN-UNITES-DE-COMPOSITION](../../../scratchpad/DESIGN-UNITES-DE-COMPOSITION.md) |
| **Dépend de** | `_shared/keel/dietary_regime.ts` (livré) · `_shared/keel/safety_constraints.ts` · `forbidden_matcher.ts` · migration `20260810140000` (appliquée) |
| **Voisine de** | [FF-037](FF-037-l-ancre-proteique.md) — même machinerie, sévérité opposée |
| **Effort estimé** | fondations livrées ; câblage ≈ 1 jour |

---

## 1. Le problème

`student_safety_constraints` porte cinq catégories — `allergy`, `intolerance`,
`medical`, `religious`, `dislike` — et **aucune ne dit « je suis végétarien »**.

Un végétarien n'est pas allergique, pas intolérant, pas malade, et son régime
n'est en général pas religieux. Le seul emplacement libre était `dislike`, de
sévérité `preference`. Or une préférence **classe** les plats ; elle ne les
**rejette** pas.

Conséquence, mesurable en production aujourd'hui : **un végan reçoit un plan
avec de la viande dedans, et rien dans le produit ne peut l'en empêcher.** Sa
seule voie est la prose libre de `student_goals.situation`, qu'un modèle
respecte « à peu près » — ce qui, pour un régime, veut dire pas du tout.

Le mot « vegan » n'apparaît qu'une fois dans tout le dépôt, dans le texte
descriptif d'un food pack. Et `medical_condition_floor_test.ts:250` acte
« je suis végétarien » comme un message qui ne doit **rien** déclencher :
correct pour le plancher médical, et il se trouve que rien d'autre ne le
rattrapait non plus.

### Ce qui rend ce trou différent d'un manque de fonctionnalité

Servir du poulet à un végan n'est pas une maladresse de classement. C'est une
réponse qui rend le produit inutilisable pour lui — et s'il l'a mangé sans le
voir, une trahison. C'est la seule catégorie d'erreur de ce produit qui se
mesure en confiance perdue d'un coup, pas en qualité dégradée.

---

## 2. Job stories

- **Quand** je m'inscris et que je suis végétarien depuis dix ans, **je veux**
  le dire une fois, dans une case, **afin de** ne jamais avoir à vérifier
  chaque plat qu'on me propose.
- **Quand** un plan me propose un wok « végétarien » au nuoc-mâm, **je veux**
  que le produit l'ait attrapé avant moi, **afin de** ne pas devoir lire chaque
  liste d'ingrédients avec méfiance.
- **Quand** je suis végan et que mon plan ne porte structurellement pas de B12,
  **je veux** le savoir, **afin de** poser la question à qui de droit — sans
  que le produit me prescrive quoi que ce soit.
- **Quand** je suis pescatarien, **je veux** que le poisson reste, **afin de**
  ne pas subir une exclusion trop large qui me priverait de la moitié de mes
  protéines.

---

## 3. Périmètre

### Livré (2026-08-10)

- `_shared/keel/dietary_regime.ts` — module pur : liste fermée des régimes,
  groupes exclus, formes de surface EN+FR, ligne de consigne, sentinelles
  incouvrables. **10 tests verts.**
- Migration `20260810140000_dietary_regime_constraint.sql` — catégorie `diet`,
  colonne `diet_ref`, liste fermée en base, sévérité contrainte, index
  d'unicité étendu. **Appliquée et vérifiée ré-appliquable.**

### À câbler — appartient à l'étape 1 du chantier des unités de composition

Ce câblage touche exactement les fichiers que [FF-037](FF-037-l-ancre-proteique.md)
ouvre déjà. Le faire séparément coûterait une seconde passe sur les mêmes
fichiers et un second bump de `MEAL_PROMPT_VERSION`.

1. `safety_constraints.ts` — `dietRef` dans le type, dans le `select` du
   loader, dans le mapping de ligne. ⚠️ **Jamais dans `safetyConstraintTokens()`**
   (voir §6).
2. `safetyConstraintsPromptBlock` — la ligne de régime en **tête** de consigne,
   via `dietaryRegimePromptLine`.
3. `parseGeneratedMeal` / `parseWeekPlan` — rejet dur de tout plat dont un
   ingrédient matche une forme exclue, via `forbidden_matcher`.
4. Front — la case dans « Basic info », écrivant une ligne `kind='diet'`.

### Hors périmètre, exprès

**Halal et casher** restent sur `religious` avec leurs substances. La licéité y
dépend autant du mode d'abattage et de la séparation des ustensiles que de
l'espèce : prétendre les tenir avec une liste d'aliments exclus rendrait une
garantie fausse, ce qui est pire que pas de garantie.

**Flexitarien, sans gluten, paléo, cétogène.** Le premier n'est pas un verrou ;
les trois autres relèvent soit d'`intolerance` (cœliaque : déjà couvert), soit
d'une méthode de coach, pas d'un régime d'identité.

---

## 4. Le circuit

```
élève déclare « je suis végan »
        ↓
student_safety_constraints (kind='diet', diet_ref='vegan', severity='strict')
        ↓
loadStudentSafetyConstraints  →  dietRef
        ↓
   ┌────┴─────────────────────────────────┐
   ↓                                      ↓
dietaryRegimePromptLine()      excludedSurfaceFormsFor()
   ↓                                      ↓
EN TÊTE DE CONSIGNE               liste d'évitement → forbidden_matcher
« no meat, no fish, no eggs,              ↓
  no dairy, no honey — et ça         REJET DUR au parseur
  vaut pour les fonds, sauces,       (pas un pass-with-issue)
  gras et garnitures »
                                          ↓
                            uncoverableSentinelsFor() → drapeau B12
```

**Les deux bouts, comme toujours dans ce dépôt.** La consigne dit la règle ; le
parseur la tient. Une règle qui n'existe que dans le prompt n'est pas une
garantie — et pour un régime, la moitié manquante se mange.

---

## 5. Modèle de données

```sql
kind      text  -- + 'diet'
diet_ref  text  -- check: vegetarian | vegan | pescatarian
severity  text  -- check: kind <> 'diet' or severity in ('strict','medical')
```

Le CHECK de sévérité est **toute la décision du chantier rendue non
contournable** : `preference` classe, `strict` verrouille. Une ligne de régime
en `preference` serait la version cochée du produit d'avant. `medical` reste
permis — une éviction stricte prescrite peut légitimement porter un régime.

La liste des régimes est fermée **en base autant qu'en TypeScript**. Un jeton
libre donnerait une ligne que `parseDietaryRegime` rendrait `null` côté code :
une contrainte enregistrée, affichée à l'élève comme respectée, et
silencieusement inerte au générateur.

---

## 6. Règles et garanties

### R1 — Le nom du régime n'entre JAMAIS dans la liste d'évitement

La règle est écrite au-dessus de `safetyConstraintTokens()` pour
`conditionRef`, et elle vaut ici mot pour mot. Le 2026-08-06, des lignes
difformes (`allergen_ref='diabetes'`) ont armé la ceinture de sortie sur le mot
« diabetes », et un message d'urgence — *« take fast-acting glucose now and
call emergency services »* — a été remplacé par un refus poli, **en run réel**.

Le même piège attend ici, en pire : armer la ceinture sur « vegan » ferait
rejeter toute réponse décrivant un plat comme végan — donc précisément les
bonnes réponses, et seulement pour les végans. Ce qui entre dans la liste,
c'est l'**expansion** du régime. Jamais le jeton. *Testé.*

### R2 — La garantie repose sur la prose, pas sur les groupes

`lean_protein` n'est délibérément **pas** dans les groupes exclus : il désigne
aussi bien un blanc de poulet qu'un tofu, et l'exclure interdirait le tofu à un
végétarien. Les groupes servent au choix **en amont** ; les formes de surface
tiennent le verrou **en aval**. *Testé.*

### R3 — Les fautes invisibles sont nommées, une par une

`allergen_surface_forms.ts` a mesuré la leçon : *« the nut butter option »*
est passé sur une allergie à l'arachide parce que la ceinture ne connaissait
que `peanut`. Ici c'est pire, parce que les fautes d'un régime sont
**ordinairement invisibles** — personne n'appelle « viande » le nuoc-mâm d'un
wok, la gélatine d'une panna cotta, le saindoux d'une pâte brisée, les anchois
d'une sauce Worcestershire, ou le bouillon de volaille d'une soupe « de
légumes ». Table écrite à la main, fermée, **jamais une inférence**. *Testé.*

### R4 — Les deux langues

`profiles.locale` vaut `fr-FR` par défaut : une liste qui ne connaît que
« bacon » laisse passer « lardons ». Chaque famille est écrite EN **et** FR.
*Testé sur six paires.*

### R5 — La monotonie des régimes

Végan ⊇ végétarien ⊇ pescatarien sur ce qui est exclu, et le pescatarien garde
le poisson. Une exclusion trop large est un bug aussi réel qu'une trop étroite.
*Testé.*

### R6 — La B12 se signale, ne se prescrit pas

Un plan végan sans B12 est **carencé**, pas médiocre : elle n'existe pas dans
le règne végétal en quantité utile. Se taire livrerait la carence en silence.
Le produit **signale** (drapeau de couverture) ; recommander une
supplémentation est un acte que `CONTRACT.md` réserve au clinicien — même
frontière que pour les maladies déclarées : on nomme, on n'ordonne pas.

Fer et zinc végétaux ne sont **pas** signalés : moins biodisponibles, mais
atteignables par l'aliment. Les inclure crierait au loup sur des trous que le
plan sait combler.

### R7 — Sortie stable

`excludedSurfaceFormsFor` rend une liste triée et dédupliquée. Un ordre qui
bouge casse le cache de prompt et rend les tests d'égalité de chaînes
impossibles à écrire. *Testé.*

---

## 7. Modes de défaillance

| Défaillance | Ce qui se passe | Protection |
|---|---|---|
| Régime hors liste en base | ligne refusée à l'insert | CHECK fermé |
| Régime en `preference` | ligne refusée | CHECK de sévérité |
| Ligne `diet` sans jeton | ligne refusée | `ref_check` étendu |
| Jeton du régime dans la ceinture | les bonnes réponses rejetées | R1 + test |
| Plat au nuoc-mâm pour un végétarien | plat rejeté au parseur | R3 |
| Plan français, garde anglaise | exclusion ratée | R4 |
| Végan sans B12 | carence livrée en silence | R6 |
| Double déclaration du même régime | deux lignes actives | index d'unicité étendu |

---

## 8. Critères d'acceptation

- [x] `dietary_regime.ts` pur, 10 tests verts
- [x] Migration appliquée **et ré-appliquée** sans erreur (pas de `db reset`)
- [x] Sonde interne : 4 refus + 1 désarmement vérifiés dans la transaction
- [x] Les cinq catégories d'avant passent toujours (désarmement)
- [ ] `dietRef` chargé par le loader, **absent** de `safetyConstraintTokens()`
- [ ] Ligne de régime en tête de consigne
- [ ] Plat contenant une forme exclue → **rejeté**, pas signalé
- [ ] Un élève sans régime : consigne identique **au caractère près**
- [ ] Case à l'écran, écrivant `severity='strict'`

---

## 9. Rabbit holes

**Deviner le régime depuis la conversation.** « Je ne mange pas de viande en ce
moment » n'est pas une déclaration de régime. Un verrou posé par inférence est
un verrou qu'on ne peut pas retirer sans comprendre pourquoi il est là.
L'élève coche, ou rien.

**Étendre la table par IA.** La tentation d'un LLM qui complète les formes de
surface. `allergen_surface_forms.ts` a tranché : liste plate, fermée, écrite à
la main. Une forme absente garde le comportement d'avant ; une forme inventée
rejette des plats légitimes.

**Le végétarisme « avec exceptions ».** Le poisson le dimanche, la charcuterie
chez les parents. Réel, et hors périmètre : un verrou conditionnel n'est plus
un verrou. Le pescatarien couvre le cas le plus fréquent.

**La présure des fromages.** Un végétarien strict évite les fromages à présure
animale. L'information n'est pas dans les tables de composition et rarement sur
l'emballage. On ne peut pas la garantir, donc on ne la promet pas.

---

## 10. Ce qu'on mesure

- Nombre d'élèves avec une ligne `kind='diet'` (l'existence du besoin)
- Taux de rejet au parseur pour cause de régime, par régime — **s'il ne baisse
  pas après quelques semaines, la consigne ne mord pas** et c'est le prompt
  qu'il faut corriger, pas le parseur
- Répartition des formes qui matchent : si `nuoc-mam` ou `gelatine`
  apparaissent souvent, la consigne les nomme mal
- Drapeaux B12 émis, et ce que le coach en fait

---

## 11. Questions ouvertes

1. **Le régime au foyer.** Un végan à table dans un foyer omnivore : le tronc
   commun devient-il végan, ou le végan reçoit-il un tronc à part ? La règle
   additive du design (§4) dit que la base se cuisine à l'intersection — ce qui
   rendrait tout le foyer végan. Défendable pour un repas, lourd pour une
   semaine. **À trancher à l'étape 7**, pas avant.
2. **Le coach végan.** Une doctrine peut-elle porter un régime pour toute sa
   cohorte ? Le modèle 1:N dit oui en principe, mais un élève omnivore chez un
   coach végan n'a rien demandé. Penche pour non : le régime est une propriété
   de l'élève.
3. **La rétractation.** Redevenir omnivore passe par la fonction SECURITY
   DEFINER existante. Non vérifié pour `kind='diet'`.
