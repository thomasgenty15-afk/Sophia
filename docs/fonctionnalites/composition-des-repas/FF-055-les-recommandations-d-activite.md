# FF-055 · Les recommandations d'activité — un repère, jamais un programme

| | |
|---|---|
| **Identifiant** | `FF-055-les-recommandations-d-activite` |
| **Statut** | 🟠 Noyau livré et vert — câblage à faire (§3) |
| **Date** | 2026-08-11 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) · [LEGAL.md](../../keel/LEGAL.md) · [PLAN-RETOUR-ET-ACTIVITE](../../../scratchpad/PLAN-RETOUR-ET-ACTIVITE.md) |
| **Dépend de** | `_shared/keel/activity_floor.ts` · `activity_stance.ts` (livrés) · migration `20260811100000` (appliquée) |
| **Effort estimé** | noyau livré ; câblage ≈ 2 jours |

---

## 1. Le problème

Un plan de repas seul ne suffit pas à atteindre un objectif, et le produit n'en
dit rien. Mais **la doctrine du coach ne porte rien sur l'entraînement** :
`CoachDoctrine` a `beliefs`, `forbidden`, `vocabulary`, `arbitrations`,
`foods`, `qa`, `voice`, `dailyPractices` — et c'est tout.

Sophia qui recommanderait de l'activité sans que le coach l'ait dit
**inventerait du contenu qu'il n'a jamais enseigné**, sur le terrain même où
beaucoup de coachs ont une méthode forte. C'est exactement la violation que
tout le reste du produit s'interdit.

### La résolution : deux versions (arbitrage du propriétaire, 2026-08-10)

- **Sans coach** — le plancher de santé publique.
- **Avec coach** — sa posture, déclarée dans sa doctrine, qui **remplace** le
  plancher.

### ⛔ Et la ligne qui vaut pour les deux — le critère d'acceptation principal

| ✅ Plancher de santé publique | ❌ Programmation |
|---|---|
| « marcher la plupart des jours » | « 3×5 squats à 80 % » |
| « deux séances de renforcement par semaine » | « pousse jusqu'à l'échec » |
| « la récupération en fait partie » | « fais ton cardio à jeun » |

La colonne de gauche est le consensus publié par les autorités (OMS :
150-300 min d'activité aérobie modérée par semaine **plus** deux séances de
renforcement). Ce n'est pas une méthode, c'est un repère public — Sophia peut
le relayer comme elle peut dire « vois un médecin » sans exercer la médecine.
La colonne de droite appartient à un coach qui n'a rien demandé.

**Cette ligne tient même quand un coach a parlé** : `ActivityEmphasis` est une
liste fermée d'accents, sans aucun champ de volume, de série, de charge ou de
pourcentage. **Ce qui n'existe pas dans le type ne peut pas être prescrit** —
même discipline que `deficit_style` sans jeton `aggressive`.

> Où va la méthode détaillée d'un coach qui programme ? Dans ses `beliefs`, où
> elle est **déjà possible** : citable dans le chat, dans sa voix, tracée à sa
> doctrine. **Le programme du coach est citable dans la conversation, jamais
> exécuté comme prescription dans la section du plan.**

---

## 2. Job stories

- **Quand** je suis sédentaire et que je vise une perte de gras, **je veux**
  savoir ce qui compte le plus, **afin de** ne pas croire que l'assiette suffit.
- **Quand** mon coach programme lui-même mon entraînement, **je veux** que
  l'app se taise là-dessus, **afin de** ne pas recevoir deux consignes qui se
  contredisent.
- **Quand** j'ai déclaré une pathologie, **je veux** que l'app ne me prescrive
  rien, **afin de** garder cette conversation avec mon médecin.

---

## 3. Périmètre

### Livré (2026-08-11)

- `_shared/keel/activity_stance.ts` — la posture du coach : trois modes
  (`off` / `house` / `coach`), cinq accents fermés, plafond de 2, parse
  tolérant-et-comptant, validation de publication bruyante.
- `_shared/keel/activity_floor.ts` — les quatre portes, le contenu maison par
  dynamique, l'ouverture modulée par le niveau déclaré, `attributedToCoach`.
- **12 tests verts**, dont le test de programmation sur **toutes** les sorties
  possibles, avec le matcher du dépôt.
- Migration `20260811100000_doctrine_activity_stance.sql` — colonne, CHECK de
  forme (mode fermé, 2 accents max). **Appliquée et ré-appliquée.**

### À câbler

1. **`doctrine.ts`** — `activityStance` sur `CoachDoctrine`, parsé par
   `parseCoachDoctrine` via `parseActivityStance`.
   ⚠️ **EXCLU de `compileDoctrineBlock`** (même statut que `dailyPractices`) :
   le hash du bloc chat doit rester inchangé pour toute la base. Un test
   d'empreinte doit le prouver octet pour octet.
2. **Un appel séparé** du plan de repas. La consigne de composition porte déjà
   des dizaines de contraintes simultanées, dont les plus critiques
   (allergènes, régimes, absences) : y ajouter l'activité la ferait **concourir
   pour l'attention du modèle** avec ce qui ne doit jamais tomber. Et en
   **domaine de défaillance séparé** — si l'activité échoue, le plan sort quand
   même. *Testé côté module ; à tenir côté appelant.*
3. **Le niveau d'activité** — une question dans « Basic info », liste fermée
   (`sedentary`…`very_active`), **non requise**. ⚠️ Elle ne doit entrer dans
   **aucun** calcul de dépense énergétique affiché.
4. **L'UI** — une courte section sous le plan, visuellement distincte de la
   nourriture, **trois lignes au maximum**, aucune interaction. Réutiliser
   `SetupSection` plutôt qu'un composant neuf.
5. **L'écran coach** — la question posée comme un débat du point de départ
   (`STARTER_FORKS`), avec **l'effet de chaque réponse en langage clair**. Le
   coach ne coche jamais à l'aveugle dans une boîte noire.

### Hors périmètre

Toute forme de suivi. **On ne demande jamais si ça a été fait** — une
recommandation qu'on vérifie devient une note.

---

## 4. Le circuit

```
restriction_flag ? ──oui──> RIEN (section absente, pas vide)
maladie déclarée ? ──oui──> RIEN
mineur ?          ──oui──> RIEN
stance.mode=off ? ──oui──> RIEN
        │ non
        ↓
  mode === "coach" ?
   ├─ oui → ses emphases        (attributedToCoach = true)
   └─ non → plancher maison     (attributedToCoach = FALSE, même si un
             par dynamique       coach existe mais n'a rien dit)
        ↓
openingLine(level) + une ligne par accent, dans la locale
```

---

## 5. Modèle de données

`coach_doctrines.activity_stance jsonb NOT NULL DEFAULT '{}'` :

```jsonc
{ "mode": "off" | "house" | "coach",
  "emphases": ["daily_movement"|"strength"|"cardio"|"recovery"|"mobility"],  // 2 max
  "belief_key": "…" }
```

**`mode: "off"` est le plus important des trois**, et probablement le plus
demandé : un coach qui programme lui-même doit pouvoir dire « Sophia ne dit
rien sur l'activité à mes élèves ». Sans ce jeton, il n'aurait aucun moyen
d'empêcher le produit d'empiéter sur son métier — et il partirait.

**Aucun champ de volume, série, charge ou pourcentage.** L'absence *est* la
garde.

---

## 6. Règles et garanties

**R1 — Les quatre portes, dans l'ordre de gravité.** `restrictionFlag`
(l'exercice compulsif est un comportement compensatoire documenté des TCA),
maladie déclarée (frontière clinique, même posture que
`safetyConstraintsPromptBlock`), mineur, `mode: "off"`. Tous **requis**,
fail-closed. *Testé.*

**R2 — Aucune doctrine ne lève une porte.** La hiérarchie est **plancher TCA >
coach > Sophia**, et un test nommé le prouve pour chacune des trois premières
avec une posture `coach` pleinement remplie. *Testé.*

**R3 — La section est ABSENTE, pas vide.** `null`, pas `{lines: []}` : une
section vide occupe le rang d'une section et invite à la commenter, après quoi
l'élève lit « je ne peux rien te dire sur l'activité » — exactement
l'information qu'on refusait de donner. *Testé.*

**R4 — Aucune programmation, sur aucun chemin.** Test lexical avec
`findForbiddenMatches` (**le matcher du dépôt, jamais un `includes` maison** —
la première version de ce test mordait sur « repères » en cherchant « rep »),
plus l'absence de tout chiffre, sur toutes les sorties possibles des deux
chemins et des deux langues. Avec un canari qui prouve que le matcher mord.
*Testé.*

**R5 — Le coach remplace, il ne fusionne pas.** *Testé.*

**R6 — Un coach muet ne se voit jamais attribuer le repère public.**
`attributedToCoach` reste `false` : faire parler un coach à sa place est ce que
le modèle interdit. C'est ce qui rend l'option A du fork tenable. *Testé.*

**R7 — Le niveau ne se devine pas.** Absent ⇒ ouverture générique. Deviner
« sédentaire » chez quelqu'un qui n'a rien dit produirait un conseil
condescendant et faux. *Testé.*

**R8 — On ne demande jamais si ça a été fait.** Aucun identifiant de suivi,
aucune case, aucun compteur — et rien dans FF-054 n'interroge cette section.

---

## 7. Modes de défaillance

| Défaillance | Protection |
|---|---|
| Prescription d'exercice sous plancher TCA | R1 + R2, fail-closed |
| Un coach lève une garde | R2, un test par porte |
| Programmation qui sort | R4, matcher du dépôt + canari |
| « je ne peux rien te dire » lisible | R3 (absente, pas vide) |
| Repère attribué à un coach muet | R6 |
| L'activité fait tomber le plan de repas | appel séparé, domaine distinct |
| Le niveau devient un calcul de dépense | interdit §3.3, à tenir au câblage |

---

## 8. Critères d'acceptation

- [x] Deux modules purs, 12 tests verts
- [x] Migration appliquée **et ré-appliquée**
- [x] Test de programmation sur les deux chemins et les deux langues
- [x] Test « aucune doctrine ne lève une porte »
- [ ] `activityStance` parsé, **hors `compileDoctrineBlock`** (hash prouvé)
- [ ] Appel séparé ; échec ⇒ le plan de repas sort quand même
- [ ] Niveau d'activité dans « Basic info », non requis
- [ ] Section UI ≤ 3 lignes, sans interaction
- [ ] Écran coach avec l'effet de chaque réponse en clair
- [ ] Désarmement : aucune posture, aucun niveau ⇒ sortie identique au
      caractère près au plancher générique

---

## 9. Rabbit holes

**Le programme complet.** La demande viendra (« mets-moi un vrai plan
d'entraînement »). C'est le métier d'un coach, et le produit a un modèle qui
l'interdit. La route légitime est la doctrine — accents, pas séries.

**Les pas comptés.** « 10 000 pas » est un chiffre populaire et sans base
solide. Le nommer inviterait au comptage, donc au tracking.

**La dépense énergétique.** Taille + poids + âge + sexe + niveau est la
signature d'entrée d'une formule de métabolisme, et un modèle sait la calculer
sans qu'on le lui demande. C'est la porte de derrière d'un compteur de
calories, dans un produit qui en refuse un.

---

## 10. Ce qu'on mesure

- Part des coachs qui répondent, et répartition des trois modes — **si `off`
  domine, le produit empiète et il faut le savoir.**
- Part des élèves à qui la section est absente, par porte : c'est la mesure que
  les gardes fonctionnent.
- Taux d'échec de l'appel séparé, et vérification que le plan sort quand même.

---

## 11. Questions ouvertes

1. **Le fork du coach muet est tranché en option A** (repère affiché, non
   attribué). À revoir si des coachs remontent que le repère contredit leur
   méthode sans qu'ils aient eu à parler.
2. **Le foyer.** La section est-elle par membre ? Elle dérive d'un objectif,
   donc oui — mais elle ne doit pas divulguer l'objectif d'un membre aux
   autres. Non tranché ; à reprendre avec la lane foyer.
3. **La voix.** Le noyau est déterministe. Faut-il passer les lignes au modèle
   pour les mettre dans la voix du coach ? Ça rouvre le risque de
   programmation ; à ne faire qu'avec la garde R4 appliquée **en sortie**.
