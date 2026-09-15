# `/coaches` — rapport du constructeur 4

> Refonte « par la douleur » du 2026-08-13. Branche `ff-001-quotidien-du-coach`.
> **Rien n'est commité.** Fichiers touchés :
> `frontend/src/keel/pages/CoachesPage.tsx`,
> `frontend/src/keel/i18n/drafts/coaches.en.ts`,
> `frontend/src/keel/i18n/drafts/coaches.fr.ts`, et ce rapport.

---

## 1. Le poids

| | clés | mots rendus (EN) | figures | sections | lignes de page |
|---|---|---|---|---|---|
| **avant** (`git show HEAD:…/en.ts`) | 107 | **1 361** | 4 SVG | 7 | 510 |
| **après** (`drafts/coaches.en.ts`) | **66** | **874** | 2 SVG + 1 démonstration | **4** | 593 |
| écart | −41 clés (−38 %) | **−487 mots (−36 %)** | −1 visuel | −3 | +83 (ancres et coupes commentées) |

Le pack français porte **66 clés / 962 mots** — parité de clés **exacte et dans le
même ordre** que l'anglais (vérifié par script).

Le chiffre de 874 est plus dur qu'il n'en a l'air : il **inclut** les ~95 mots de
la démonstration interactive, qui n'existait pas dans la baseline. Hors SEO et
hors `<title>`/`<desc>` d'accessibilité (non visibles), la prose visible passe
d'environ **1 115** à environ **710 mots**.

Script utilisé : celui du §9 du socle, recopié dans
`scratchpad/count.cjs` (l'échappement du heredoc du socle mangeait la regex ;
le contenu est identique).

---

## 2. La forme livrée — quatre bandes, une section = une ligne

| bande | ligne de la grille | ce qui la porte |
|---|---|---|
| **1 · `Hero`** | 01 « ma formation se termine, l'accompagnement meurt avec elle » | `h1` conservé (« Ta formation se termine. Ton coaching, non. »), chapô, CTA, réserve S1/B5/B32, **figure `AfterFigure` (neuve)** |
| **2 · `Day`** | 02 « mes élèves ont une question le mardi soir » | trois questions d'élève, prose, réserve S1+S3, **figure `MethodFigure` (les 4 points d'injection, B10)** |
| **3 · `Lock`** | 03 « une IA dira le contraire de ce que j'enseigne » | **le bloc sombre**, formulation B8b imposée, **la démonstration interactive**, réserve honnête |
| **4 · `Price`** | le prix **et** la clôture, fusionnés | `PriceCard` 7 €, ligne annuelle B3, corps B4/B6/S12, ligne B31, CTA |

- **Un seul `<h1>`**, trois `<h2>`, aucun saut de niveau (mesuré au DOM).
- **Un seul CTA**, `/auth?role=coach`, répété **deux** fois (héros + bande 4).
- **Le bloc sombre est dépensé SUR la bande 3**, pas en plus : c'est la seule
  bande de la page qui porte une **garantie** et pas une promesse.
- La clôture n'est plus une bande : **la phrase de clôture est devenue le `<h2>`
  de la bande prix**. C'est ce que « fusionnent » veut dire ici, et ça évite un
  cinquième bloc dont le seul contenu aurait été un bouton déjà présent.

---

## 3. Ce que j'ai coupé, nommément

### 3.1 `Monday` — « le lundi en une page » (13 clés + 22 clés de figure)

**Coupée. Elle n'est pas fausse** : B11 (cron `'0 6 * * 1'`, `renderSynthesisText`
pur), B12 (phrases verbatim), B14 (48 h / 120 h) tiennent tous. Elle est coupée
parce que **la grille ne l'a pas donnée à `/coaches`** : elle appartient à
`/gyms` (douleur 02, « je les perds sans les voir partir ») et au hall `/pro`
(ligne 04). Une section = une ligne, et cette page n'a que trois lignes.

Emportent avec elle : `coaches.monday.*` (5), `coaches.fig.monday.*` (22), et la
figure `MondayFigure` (56 lignes de SVG).

⚠️ **Pour l'orchestrateur** : c'était la seule maquette du dépôt qui citait
`CoachWeeklyPage` et `coach_synthesis` mot pour mot (S10). Si `/gyms` la reprend,
son constructeur a une base propre dans `git show HEAD:frontend/src/keel/pages/CoachesPage.tsx`
(lignes 444-508 pour la figure, `en.ts:3084-3127` pour les clés).

### 3.2 `Note` — la note 1:1 du coach sur un élève (10 clés)

**Coupée, et c'est la coupe la plus argumentée.** La grille l'a **explicitement
écartée du monde pro** (« deux fonctionnalités écartées du hall »). Le motif est
dans B26 : « utilisée, jamais citée » est une **promesse de prompt**
(`_shared/keel/coach_note.ts:126-128`) **sans vérificateur déterministe**.

Et il y a une raison de composition qui aggrave la première : la bande 3 de cette
page vend précisément la **différence entre une consigne et un mécanisme**.
Poser trois paragraphes plus bas une fonctionnalité dont la garantie est une
consigne déguisée aurait désarmé, sur la même page, l'argument le plus cher.

Emportent avec elle : `coaches.note.*` (10 clés) et la maquette HTML `NoteMock`.

### 3.3 `ChatFigure` — la journée dans le chat d'un élève (15 clés)

**Coupée, et ce n'était pas demandé — je le consigne donc.** Trois raisons :

1. Elle portait **B22/B23** (le tap du soir, trois boutons, relance sur
   « mitigé »). Le tap du soir n'est **aucune des trois lignes** de `/coaches`,
   et la grille l'écarte explicitement du hall `/pro` (« posé sur un hall, il
   ressemble à du suivi »). Le même risque existe ici.
2. C'était une **maquette de surface d'app** (bulles, en-tête d'écran). La bande
   3 porte désormais une fiche interactive ; deux surfaces qui imitent le produit
   sur la même page, c'est une page qui montre des écrans plutôt que des faits.
3. La douleur 02 est répondue par les **quatre points d'injection** (B10, « VRAI
   et sous-vendu » selon l'audit), pas par une capture de conversation.

### 3.4 Cinq clés du bloc `pricing`, renommé `price`

`coaches.pricing.*` → `coaches.price.*` (le préfixe `pricing` cohabitait mal avec
la fusion prix + clôture), et `coaches.closing.*` disparaît : `closing.title`
devient `price.title`, `closing.cta` est supprimée (le CTA de la bande est
`price.cta`).

⚠️ **L'orchestrateur doit supprimer d'`en.ts`/`fr.ts` TOUT le bloc `coaches.`**,
pas seulement les clés que je remplace : 41 clés disparaissent.

---

## 4. ⭐ La démonstration interactive — et la réparation d'ancre qu'elle a produite

### 4.1 ⚠️ L'ancre de B9 dans l'audit est PÉRIMÉE — voici la correction

L'audit écrit :

> | B9 | Chaque ligne rouge porte son **`instead`** … | **VRAI** | `keel_output_locks.ts:99-113` · `run.ts:2825-2834` |

**Deux corrections, et la première vaut pour tout le chantier :**

1. **`keel_output_locks.ts` n'est pas dans `_shared/keel/`.** Son chemin réel est
   **`supabase/functions/sophia-brain/skills/_shared/keel_output_locks.ts`**
   (343 lignes). Le module que l'audit décrit *comme s'il était* le siège de
   `instead` est en réalité **`supabase/functions/_shared/keel/doctrine.ts`**
   (1 179 lignes) : c'est là que le champ est déclaré et documenté. Les deux
   fichiers existent, ils sont distincts, et ils portent chacun **une moitié**
   du fait B9.
2. **`run.ts` non plus.** Le chemin réel est
   **`supabase/functions/sophia-brain/router/run.ts`**. Le numéro 2825 tombe
   juste par chance : `applyKeelOutputLocks({` y est bien à la ligne **2825**,
   et `coachDisplayName:` à la ligne **2839**.

**Ancres vérifiées le 2026-08-13, à substituer à celle de B9 :**

| ce qui est affirmé | ancre réelle |
|---|---|
| le champ `instead`, et pourquoi il existe | `_shared/keel/doctrine.ts:180-194` |
| `instead` est **littéralement** ce que l'élève lit quand le verrou remplace | `_shared/keel/doctrine.ts:196-203` |
| `instead` rendu dans le bloc de prompt | `_shared/keel/doctrine.ts:789` |
| la relecture est **déterministe, sans modèle dans la boucle** | `_shared/keel/doctrine.ts:17-19` · `findDoctrineViolations` `:1077` |
| les **exceptions de négation** sont ON par défaut, et c'est délibéré | `_shared/keel/doctrine.ts:25-36` et `:1072-1076` |
| le **message entier** est remplacé, jamais amputé | `…/skills/_shared/keel_output_locks.ts:27-41` |
| la substitution par l'`instead` du coach | `…/keel_output_locks.ts:183-201` (`resolveDoctrineReplacement`) |
| la **signature en suffixe**, et pas de nom ⇒ pas de signature | `…/keel_output_locks.ts:212-230` (`signAsCoach`) |
| le repli générique **n'est jamais signé** | `…/keel_output_locks.ts:202-209` · `DOCTRINE_BLOCK_FALLBACK_EN` `:163-164` |
| `coachDisplayName` est passé **par le chat seul**, pas par les générateurs | `…/keel_output_locks.ts:99-113` |
| la relecture du **chat** (une des 4 surfaces scannées, B8) | `…/keel_output_locks.ts:307` |
| le site d'appel dans le chat | `…/router/run.ts:2825` et `:2839` |

**Correction connexe, B10.** Les quatre points d'injection existent bien, mais
les numéros de l'audit sont périmés eux aussi. Vérifiés :
`sophia-brain/router/run.ts:2414` (`doctrineBlockFor`, le chat) ·
`generate-week-plan-v1/index.ts:618` · `generate-meal-v1/index.ts:1122` ·
`generate-household-meal-v1/index.ts:2338`.
Et `withKeelDoctrineBlock` est défini `router/run.ts:2353` avec **un seul**
appelant, `:7386` — B7 tient, formulé comme l'audit le formule.

### 4.2 Ce que la démonstration montre, et pourquoi elle a le droit

**Le mécanisme est du produit** et se montre tel quel : retenue déterministe,
remplacement du message **entier**, substitution par l'`instead`, signature en
suffixe. **L'exemple est un champ que le coach remplit** — il a donc la forme
d'une **fiche à champs remplis** (étiquette au-dessus, valeur en dessous, la
grammaire du `Field` de `MealPrepPage`), et **jamais** celle d'une capture : ni
barre d'app, ni bulle de chat, ni cadre de téléphone (S10, §8 n°12, CHARTE §5).

Les valeurs affichées ne sont pas inventées :

| valeur affichée | d'où elle vient |
|---|---|
| l'interdit « six petits repas » | `doctrine.ts:12` et `:30` — l'exemple canonique du module |
| l'`instead` « Trois vrais repas. Si tu as faim entre les deux, c'est que le repas d'avant était trop petit. » | **verbatim** `…/keel_output_locks.ts:216-218` (le commentaire de `signAsCoach`) |
| le brouillon qui mord, « Essaie six petits repas dans la journée. » | `doctrine.ts:1075` (« must fail ») |
| le brouillon qui passe, « Ton coach ne fait pas de six petits repas. » | `doctrine.ts:30` et `:1074`, `keel_output_locks.ts:55-56` (« must pass ») |
| la signature « — Marc » | `signAsCoach` `keel_output_locks.ts:226-230`, en **suffixe** |

**Deux cas, et le second est l'argument.** Un pro qui ne voit que la morsure
conclut « c'est un filtre de mots-clés, il rendra mon agent muet sur ma propre
méthode ». La phrase qui **passe** ferme cette objection, et elle est vraie :
`allowNegatedMentions` vaut `true` par défaut, délibérément, épinglé par
`doctrine_test.ts` — **le danger est le plaidoyer, pas le mot**.

### 4.3 Le plancher technique, vérifié

- **État initial déjà juste sans geste** : le cas qui mord est sélectionné au
  montage (`useState(true)`).
- **De vrais `<input type="radio">`** partageant un `name` (`useId`) : le groupe
  est **une** tabulation, les flèches naviguent (**vérifié** : `ArrowUp` fait
  passer de `[false,true]` à `[true,false]` et met à jour la sortie), et
  `aria-checked` est natif — l'état est **annoncé**, pas seulement coloré.
- **La sortie est un `role="status" aria-live="polite"`** : la bascule annonce
  « Retenu, et remplacé. » / « Envoyé tel quel. » — le verdict est **un mot**,
  jamais une couleur.
- **Anneau de focus** : le plancher global de `tokens.css` est `fig-600`, qui
  tombe à **2,3:1** sur `fig-950` — et de toute façon `:where(a, button,
  [tabindex])` ne couvre pas un `<input>`. Remplacé localement par `fig-300`
  (**8,06:1**) via `has-[:focus-visible]:`. **Vérifié au navigateur** : les trois
  utilitaires sont générés par Tailwind 4 et le calculé donne
  `2px solid rgb(201, 163, 184)`, offset 2 px.
- **Bordures** : `fig-300` pour les **contrôles** (8,06:1, WCAG 1.4.11 exige 3),
  `fig-700` pour les **séparateurs décoratifs** (1,7:1). Même partage que
  `line` / `line-strong` en clair.
- **`prefers-reduced-motion`** : rien à neutraliser — zéro transition, zéro
  animation dans la page (grep à blanc).
- **Zéro dépendance ajoutée**, tient à 320 px, une seule démonstration.

---

## 5. Mes claims et leurs identifiants

| section | claim | id |
|---|---|---|
| Hero | 14 jours / 3 élèves, puis ça s'arrête | **B5** |
| Hero | entrée sur invitation e-mail, pas de lien à copier | **B32** |
| Hero | aucune boîte de réception côté coach (à l'affirmative) | **S1** |
| Hero | révision et rollback sans perdre l'historique | **B28** (`doctrine.ts:38-43`, `coach-doctrine-v1:1262-1295`) |
| Day | la méthode entre dans **quatre** choses composées | **B10** |
| Day | rien ne revient ; l'espace de l'élève est en pull | **S1 + S3** |
| Lock | un prompt est une consigne, pas une garantie | **B8/B8b** (`doctrine.ts:11-15`) |
| Lock | **formulation imposée** du double verrou | **B8b** — écrite mot pour mot dans son sens |
| Lock démo | chaque ligne rouge porte son `instead`, signé | **B9**, ancres corrigées §4.1 |
| Lock démo | relecture déterministe, aucun modèle dans la boucle | **B8** (`keel_output_locks.ts:307`) |
| Lock réserve | le repli générique n'est **jamais** signé | `keel_output_locks.ts:202-209` |
| Lock réserve | jamais « demande à ton coach » | **S1** (`keel_output_locks.ts:151-164`) |
| Price | 7 €/élève/mois, le siège est le seul poste | **B1** |
| Price | 6 € le **siège** payé à l'année, échéance **du coach** | **B3** (et **jamais B2**) |
| Price | on arrête de payer le mois où l'on éteint un siège | **B4** |
| Price | il faut au moins un élève rattaché pour s'abonner | **B6** |
| Price | nous ne facturons jamais ton élève | **S12** |
| Price | pas de chiffre de rétention, et on n'en inventera pas | **B31** (conservée verbatim) |

Chaque claim porte son ancre en commentaire JSX dans la page.

---

## 6. Ce que j'ai refusé d'écrire

| refusé | pourquoi |
|---|---|
| « chaque message sortant est vérifié » | **B8** : 4 surfaces scannées sur 8. La formulation B8b est celle qui est écrite. |
| « ta méthode entre à chaque message » | **B7** : `withKeelDoctrineBlock` a **un** appelant. La page dit « quatre endroits ». |
| « 6 € quand ton élève a payé son année » | **B2 FAUX** : `body.interval` vient des boutons **du coach**. La page dit « c'est ton échéance à toi, pas celle de ton élève ». |
| « c'est ton nom sur les messages » | **B18 FAUX**. L'agent s'appelle Sophia partout. Le nom du coach n'apparaît qu'à la substitution du verrou — c'est **exactement** ce que la démonstration montre, et rien de plus. |
| white-label, « sous ta marque » | **B19** : jamais réclamé, le rester. |
| « quelles parties de ta méthode tes élèves tiennent ou lâchent » | **B16** : rien ne le calcule. |
| bande de risque, tuile « on track », score d'adhérence | **S9** : l'évaluateur est débranché du 1:N. |
| un chiffre de rétention, ou tout chiffre sans source | **S8 / B31**. La page ne porte que 14, 3, 7 € et 6 €, tous ancrés. |
| « positif dès le premier élève » | **B6** : un coach à zéro élève est **refusé** au checkout. La page écrit la réserve à la place. |
| « suivi personnalisé » | **S2**, interdit partout, sans exception. |
| « rien à ouvrir / rien à installer » | **S4**. |
| « rien n'arrive la nuit » | **S5**. |
| le tap du soir, la relance | pas une des trois lignes de cette page, et sur une page de vente ça ressemble à du suivi. |
| un montant dessiné dans la figure du héros | « ce qui se vendait une fois devient ce qu'on paie chaque mois » est une phrase du chapô ; une courbe de revenus aurait été un chiffre sans source (**S8**). |

**Le vocabulaire.** Cette page dit **« élèves » / « students »** — la seule du
monde pro à le faire (S2 amendé). Aucune occurrence de « client » ni de
« ton équipe ». L'en-tête de commentaire de `CoachesPage.tsx` porte S1-S12 **mis
à jour**, pas jeté : S1, S3, S8, S9 et S10 ont gagné une phrase qui dit **où** ils
mordent dans la page refondue.

---

## 7. Ce que j'ai vu au navigateur

Serveur `frontend-alt4` (port 5178). Quatre passes : **320 px et 1280 px × EN et
FR**. Le panneau ne repeignant qu'à scroll 0, tout ce qui suit est **mesuré**
(`javascript_tool`), pas seulement regardé.

- **Débordement horizontal, 320 px, EN et FR** :
  `document.documentElement.scrollWidth (320) <= window.innerWidth (320)` → **vrai**.
  Zéro élément dépassant `window.innerWidth` **hors** `.fig-scroll` (les deux SVG
  y débordent à 400 px, borné au conteneur : c'est le plancher voulu).
- **Texte des figures dans la grille de 480, dans les deux langues** : aucun
  `getBBox()` hors du `viewBox`. Le libellé le plus large est le français
  « elle répond, jour après jour » (droite à **432** / 480).
- **Console / build** : le module se transforme proprement
  (`GET /src/keel/pages/CoachesPage.tsx` → **200**). Le tampon de console du
  panneau garde des erreurs HMR **horodatées d'états intermédiaires d'édition**
  et ne se vide jamais ; l'état courant est propre. `t()` LÈVE en dev sur une clé
  inconnue — la page se rend dans les deux langues, donc les 66 clés résolvent
  des deux côtés.
- **Structure** : 4 `<section>` dans `<main>`, 1 `<h1>`, 3 `<h2>`, sans saut ;
  2 figures avec `<title>` + `<desc>` + `aria-labelledby` ; 2 liens, tous deux
  `/auth?role=coach` ; 1 région `aria-live` ; 2 radios.
- **Démonstration** : clic et **flèches** basculent le cas, la région live
  change (« Retenu, et remplacé. » ↔ « Envoyé tel quel. »), la signature
  « — Marc » n'apparaît **que** sur le cas remplacé, et l'anneau de focus est
  bien `fig-300` 2 px offset 2.

### Un défaut trouvé au navigateur, et réparé

⚠️ **`PriceCard` a besoin d'un parent à elle** — mesuré à **320 px** :
`PriceCard` rend un `Card` en `h-full` (`height: 100%`). Posée en enfant
**direct** d'un élément de grille qui porte aussi un frère (la ligne « 6 € le
siège… »), la hauteur en pourcentage se résout contre la piste, la piste se
dimensionne sur la **carte seule**, et le frère **déborde sous l'élément
suivant** : 291 px de contenu dans une piste de 247 px, soit **44 px de
chevauchement** du paragraphe voisin — invisible au 1280 px, illisible au 320.

Réparé en local (un `<div>` intermédiaire à hauteur automatique referme le
cycle) et commenté sur place. **Signalé à l'orchestrateur** : `PriceCard` est
partagée par les six pages de vente, et toute page qui pose un frère à côté
d'elle dans un élément de grille a le même défaut. Le correctif de fond
serait de retirer `h-full` de `PriceCard` (la primitive interdit déjà une
seconde carte, donc l'égalisation de hauteur qu'il servait n'a plus d'objet),
mais `Marketing.tsx` ne m'appartient pas.

---

## 8. Pour l'orchestrateur

1. **Aucune clé `public.*` réclamée.** L'en-tête, le pied de page et la
   navigation rendent déjà juste dans les deux langues.
2. **Le repli en phase 2 doit SUPPRIMER l'intégralité du bloc `coaches.`**
   d'`en.ts` (l. 2990-3174) et de `fr.ts` (l. 708-861) avant d'y coller les
   brouillons : 41 clés meurent, dont `coaches.monday.*`, `coaches.fig.monday.*`,
   `coaches.note.*`, `coaches.fig.chat.*`, `coaches.fig.lock.*`,
   `coaches.pricing.*` et `coaches.closing.*`.
3. **`npx tsc -b`** : zéro erreur sur `CoachesPage.tsx` et sur mes deux
   brouillons. Les 568 erreurs `TS2783` du dépôt sont la **duplication voulue**
   du dispositif (le brouillon écrase l'ancien bloc à l'exécution parce que
   `...draftEn` est en dernier) ; elles disparaissent avec la suppression du n°2.
4. **Réparation d'ancre à propager** : `scratchpad/site/AUDIT-SITE.md` B9 et B10
   citent des chemins et des lignes périmés. Le détail est au **§4.1** ci-dessus
   et vaut pour tout constructeur qui touche au double verrou (`/pro`, `/gyms`,
   `/communities`).
5. **`PriceCard` / `h-full`** : voir §7. C'est un piège de primitive partagée,
   pas un défaut de ma page.
6. **Si `/gyms` reprend « le lundi en une page »**, sa maquette verbatim vit dans
   `git show HEAD:frontend/src/keel/pages/CoachesPage.tsx` (l. 444-508) et ses
   clés dans `git show HEAD:frontend/src/keel/i18n/en.ts` (l. 3084-3127). Elles
   étaient les seules du dépôt à citer `CoachWeeklyPage` et `coach_synthesis`
   mot pour mot ; les réécrire au lieu de les reprendre rouvrirait B13.
