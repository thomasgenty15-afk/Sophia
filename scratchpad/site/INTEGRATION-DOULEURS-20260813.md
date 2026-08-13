# Phase 2 — le carnet d'intégration

> Tenu par l'orchestrateur au fil des livraisons. Ce qui est ici est **à moi**,
> pas à un constructeur : fichiers partagés, décisions transverses, et ce qui
> remonte au propriétaire.

---

## A. La liste des gestes d'intégration

1. **Replier les huit brouillons** dans `en.ts` et `fr.ts`, à la place des huit
   anciens blocs. La zone est **contiguë** dans les deux fichiers :
   `home` → `pro` → `mealprep` → `couples` → `families` → `coaches` → `gyms` →
   `communities`.
   - `en.ts` : de la fin du bloc `auth.coach_link.*` jusqu'à `"household.title"`.
   - `fr.ts` : même ordre, entre les mêmes voisins.
2. **Retirer la couture** : les deux imports `draftEn`/`draftFr`, l'indirection
   `enBase`/`frBase`, les deux spreads. Puis **supprimer `drafts/`**.
3. **⚠️ Le commentaire orphelin `// Landing — hero`** (≈24 lignes, avant le bloc
   `home` d'`en.ts`) raconte pourquoi la page vend un revenu et non une fatigue
   évitée. La page qu'il décrit a déménagé vers `/coaches` (D3). Soit il suit
   son contenu dans le bloc `coaches`, soit il tombe — mais il ne reste pas là
   où il est, à décrire un hall qu'il ne décrit plus.
4. **Les libellés de navigation** : `public.nav.mealprep` / `.couples` /
   `.families` deviennent **la situation, pas le segment** — « Pour moi seul ·
   À deux · En famille ». Aujourd'hui : « Batch cooking · En couple ·
   En famille ». `PublicHeader.tsx` et le pied de page les rendent tous les deux.
5. **`sitemap.xml`** : les huit entrées sont déjà justes, seul `lastmod` bouge
   (2026-08-12 → 2026-08-13).
6. **`parity.int.test.ts`** : sa liste `legitimatelyIdentical` cite des clés que
   la refonte **supprime**. À réviser après le repli.
7. `npx tsc -b` puis `npx vitest --config vitest.config.ts run`, et les huit
   pages × 2 largeurs × 2 langues.

---

## A-bis. Les libellés de navigation — la formulation retenue

Proposée par le constructeur 7, identique à ses `home.door.*.label`, pour que
l'en-tête et la clôture du hall ne se contredisent pas :

| clé | avant (EN / FR) | après |
|---|---|---|
| `public.nav.mealprep` | Meal prep / Batch cooking | **Just me** / **Pour moi seul** |
| `public.nav.couples` | Couples / En couple | **The two of us** / **À deux** |
| `public.nav.families` | Families / En famille | **The whole family** / **En famille** |

Le constructeur 2 signale la même contradiction vue de sa page : son kicker dit
« À deux » sous un onglet qui dit « En couple ».

---

## B. Les défauts transverses trouvés par les constructeurs

### B1 — L'équerre qui flotte seule *(trouvé sur `/gyms`, reproductible partout)*

`.eq::before` est posé à `top: 0.18em` **de la boîte**. Mettre `eq`,
`border-t` et `pt-6` **sur le même élément** pousse donc l'équerre 24 px
au-dessus de son mot — et **une équerre sans libellé à sa droite est un défaut**,
pas une décoration (CHARTE §4). La règle appartient à l'**enveloppe**, jamais à
l'élément qui porte aussi le padding.
→ **À vérifier sur les huit pages en phase 3** (lentille 3).

### B2 — Le pied de page tutoie sous six pages qui vouvoient

`public.footer.tagline` = « Ta méthode, qui répond en ton absence. »
Deux défauts dans une seule ligne, et ils sont indépendants :

1. **Le registre.** Six pages sur huit vouvoient ; deux tutoient
   (`/meal-prep`, `/coaches`). Le pied de page est le même partout.
2. **L'acheteur.** « Ta méthode » est la promesse **pro**, servie telle quelle
   sous `/`, `/couples` et `/families`, où le lecteur n'a pas de méthode.

⚠️ **Une ligne par monde ne répare pas le premier défaut** : `/meal-prep`
tutoie et est un foyer, `/coaches` tutoie et est pro — le monde et le registre
ne se recouvrent pas. La seule sortie est une ligne **sans adresse au lecteur**.

### B0 — ✅ RÉPARÉ — l'anneau de focus disparaissait dans le bloc sombre

Trouvé **trois fois séparément** (constructeurs 2, 4 et 7), contourné trois fois
séparément : chacun a gardé tout lien **hors** de sa bande sombre et l'a écrit
dans son en-tête. Un défaut de jeton était devenu une contrainte de composition
sur trois pages.

Mesuré : `fig-600` sur `fig-950` = **2,32:1**, sous le 3:1 que WCAG 1.4.11 exige
d'un indicateur non textuel. La charte §7 déclarait le plancher de qualité
**sur le papier** et ne l'avait jamais mesuré sur le seul fond qui n'en est pas.

Réparé dans `tokens.css` : `.on-dark …:focus-visible` remonte l'anneau à
`fig-300`, **8,06:1** — la même remontée que `.on-dark` fait déjà pour l'équerre
et pour la pièce chaude des figures, trois lignes plus haut.

### B0-bis — Le bouton de marque sur fond sombre : mesuré, PAS réparé

`variant="brand"` est `bg-fig-700` ; son **bord** contre `fig-950` calcule à
**1,71:1**. Son libellé va bien (paper sur fig-700 = 9,98:1) ; c'est la forme du
contrôle qui ne se détache pas.

**Aucune des huit pages n'en pose un sur du sombre aujourd'hui** — vérifié. Le
constructeur 8 a d'ailleurs renoncé à son bloc sombre en partie pour ça.
Je ne touche donc **pas** à `Button.tsx` : ajouter une variante à une primitive
pour un cas que personne n'a est exactement la dette qu'on paie plus tard.
**C'est écrit ici pour que le prochain qui en veut un sache ce qu'il coûte** :
un filet `fig-300` sur le bouton (8,06:1) est la réparation minimale.

### B3 — Un prix français dans un pack anglais *(trouvé sur `/families`)*

`prices.ts` documente le défaut exact : un prix **encastré dans une phrase de
vente** reste au catalogue, donc il est **dupliqué par langue**, donc il peut
diverger — et il avait déjà divergé **dans la même langue**. Le pack EN de
`families` servait « 12,99 € », la convention **française**, à un lecteur
anglophone.

Réparé sur `/families`. ⚠️ **`drafts/home.en.ts:42` porte encore le même
défaut** : « 12,99 € a month for the household. Claiming your own access adds
2 €. » → doit lire « €12.99 » et « €2 ». **À vérifier au repli**, sur les huit.

### B4 — ⚠️ Ma propre erreur, et il faut la défaire sur deux pages

J'ai écrit dans les briefs 4, 6 et 8 que l'ancre B9 de l'audit
(`keel_output_locks.ts`) pointait un fichier **supprimé**. **C'est faux.** Mon
grep était borné à `supabase/functions/_shared/` ; le fichier vit à
`supabase/functions/sophia-brain/skills/_shared/keel_output_locks.ts`, et il
est **vivant** :

| fait | ancre vérifiée |
|---|---|
| B9 — l'`instead` du coach, signé de son nom | `keel_output_locks.ts:185-200`, `signAsCoach` |
| B8 — le scan déterministe avant l'envoi | `keel_output_locks.ts:306+`, `findDoctrineViolations` |

`_shared/keel/doctrine.ts` est le module **voisin** (il définit `instead`
en `:194` et compile le bloc en `:788-789`), pas un remplaçant.

Et ce fichier porte une ligne qui vaut pour tout le chantier : le repli
générique **n'est jamais signé** — signer notre phrase du nom du coach serait
lui faire dire ce qu'il n'a pas écrit.

→ **Le constructeur 6 l'a corrigé de lui-même. À vérifier chez les
constructeurs 4 (`/coaches`) et 8 (`/pro`) au repli** : s'ils ont écrit ma
correction fausse dans un commentaire ou un rapport, elle se défait.

---

## B-final. Ce que la phase 3 a trouvé, et ce que j'en ai fait

**Trois erreurs de fait, réparées.**

| # | Où | Ce qui était écrit | Pourquoi c'est faux |
|---|---|---|---|
| 1 | `/` premier écran | « réclamer son propre accès ajoute 2 € » | `keel_household_billable_profiles` exclut `role = 'owner'`. La migration nomme le piège : *« 14,99 € pour un foyer d'une personne — un nombre plausible, donc invisible »* |
| 2 | `/` ligne 07 | « vingt échanges » | `RECENT_HISTORY_MESSAGE_LIMIT = 20` est en **messages** (~10 échanges) **et** c'est un **plafond**, pas une fenêtre : les consommateurs recoupent à 15, 8, 6 |
| 3 | `/coaches` bande 2 | « et c'est déjà répondu » | Rien ne pré-répond. L'élève demande, l'agent répond |

**Deux contradictions internes.** `/couples` titrait sa bande 3 « un seul de vous
deux a besoin de s'en occuper » — la douleur — pendant que son paragraphe disait
« la charge se partage au lieu de se déléguer ». `/meal-prep` écrivait « aucun
plat n'est choisi à ta place », ce qui nie le produit : c'est le plat **de
remplacement** qui n'existe pas.

**Une règle qui avait survécu à sa cause.** La figure du lundi de `/gyms` restait
en anglais sous une légende jurant que c'étaient les mots du produit, au nom
d'une exception de parité qui disait « l'app authentifiée est anglaise ». Vrai
jusqu'au lot 5. Huit chaînes traduites depuis leur clé produit, l'exception
retirée, et l'en-tête de la rubrique réécrit — il portait la prémisse périmée.

**Un trou dans ma propre consigne, prouvé par mutation.** Les six chaînes étaient
épinglées ; la **grammaire qui les lit** était portée à la main dans deux pages,
sans garde. `servingDirections.int.test.ts` compare maintenant `QUALIFIERS`,
`AXIS_WORDS` et le raccourci `component` des deux portages à ceux du module.
Vérifié en mutant `QUALIFIERS.generous` : les deux portages rougissent, module
restauré au bit près.

**33 apostrophes droites** dans le pack anglais contre 10 courbes, mélangées à
l'intérieur d'une même page. Normalisées ; vérifié au rendu, plus une seule.

### ⚠️ Une recommandation de review que j'ai REFUSÉE, et pourquoi

La lentille de cohérence demande de retirer « your billing interval, not your
student's » de `/coaches`, au motif que **deux** chaînes de l'app disent le
contraire (`coach.billing.interval_hint`, `coach.seat.interval_hint`).

**C'est l'inverse.** `stripe-create-checkout-session:124` lit `body.interval`, et
`body.interval` est posé par les boutons du coach lui-même
(`CoachBillingPage.tsx:181-187`, `openCheckout("monthly" | "yearly")`). L'élève
n'entre jamais dans ce chemin. `/coaches` a raison ; **c'est l'app qui porte le
claim faux B2**, et elle le porte **deux fois**.

Que deux chaînes in-app concordantes aient suffi à retourner un reviewer est la
meilleure mesure du coût de ce défaut : il est devenu la version qui a l'air
vraie.

### Ce que j'ai laissé aux reviewers, sans agir

- **Le registre de `/meal-prep`** (tutoiement) : arbitrage documenté en tête de
  `fr.ts`, antérieur à ce chantier. Pas à moi de le renverser.
- **La réserve de la démo de `/couples`** (« rien ne vérifie ») : une lentille
  voulait l'adoucir, l'autre l'appelle *la meilleure ligne des huit pages*. Sur
  une question d'honnêteté, l'honnêteté gagne.
- **`/pro` hiérarchise la fonctionnalité au-dessus de la douleur** (H3 contre
  `<p>`), ce qui le fait lire comme un catalogue. Vrai, et c'est une refonte de
  structure, pas une phrase.
- **La seconde option de la démo de `/coaches`** — celle qui montre la garde
  **s'abstenir** — est atténuée au point de ressembler à une case désactivée.
- **`/communities` fig2** porte trois marques `--ill-fig` là où le fichier en
  autorise deux : le maillage et ses nœuds sont **un** sujet peint en deux `<g>`,
  mais un grep dira trois.

---

## C. Ce qui remonte au propriétaire — hors périmètre, mais mesuré

1. **`en.ts` porte 1 836 lignes non commitées d'un autre chantier**, et `fr.ts`
   est un fichier entièrement neuf, non suivi, du même chantier. Je **ne les
   commite pas** : ce serait balayer le travail d'une autre session dans un
   commit qui prétend porter le mien. Mes clés fusionnées vivent donc dans
   l'arbre de travail, comme les leurs.
2. **Le claim FAUX B2 est dans le produit payant, et il y est DEUX fois** — pas
   une, comme l'audit le laissait croire :
   - `coach.billing.interval_hint` — « 6 € **when your student has paid for the
     year** »
   - `coach.seat.interval_hint` — « Pick yearly only when **this student has
     paid you for the year** »

   L'intervalle est celui **du coach** : `stripe-create-checkout-session:124`
   lit `body.interval`, posé par `openCheckout("monthly" | "yearly")`
   (`CoachBillingPage.tsx:181-187`). L'élève n'entre jamais dans ce chemin.
   Retiré de la vitrine pour la seconde fois ; **jamais du produit**. Et il est
   maintenant assez convaincant pour avoir retourné un reviewer contre la page
   qui dit vrai — voir §B-final.
3. Les deux fichiers de test déjà rouges à la baseline (`household.*`)
   appartiennent à un autre chantier et le sont restés.

5. **Un élève lit « ta question est partie chez lui, mot pour mot »** sur une
   escalade de remplacement, et **aucun écran coach ne la reçoit** : le seul
   lecteur de `contract_change_requests` filtre `reason_code = 'minor_student'`
   (`CoachHomePage.tsx:174`). Trouvé par la lentille d'honnêteté, hors périmètre
   de ce chantier.

6. **`start.price` porte la convention française dans le pack anglais**
   (« 12,99 € a month ») — le même défaut que celui corrigé sur 25 clés des huit
   pages. `/start` appartient au couloir d'entrée, pas à ce chantier, et une
   autre session y travaille : laissé tel quel, signalé ici.
