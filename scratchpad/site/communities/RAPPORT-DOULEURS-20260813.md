# `/communities` — rapport de la refonte « par la douleur », 2026-08-13

> Constructeur 6. Page : `frontend/src/keel/pages/CommunitiesPage.tsx`.
> Brouillons : `frontend/src/keel/i18n/drafts/communities.{en,fr}.ts`.
> **Rien n'est commité.**

---

## 1. Le poids

| | avant | après | écart |
|---|---|---|---|
| **mots rendus (EN)** | **2 064** | **970** | **−53 %** |
| clés | 132 | **70** | −47 % |
| figures | 1 | **4** | ×4 |
| sections / bandes | 7 | **4** | −3 |
| lignes de page | 491 | 407 | −17 % |

Mots FR : 1 067 (le français est la langue longue, l'écart de 10 % est normal).

> ⚠️ La baseline du socle annonce **131 clés / 2 062 mots**. Mon script en compte
> **132 / 2 064** sur `git show HEAD:…/en.ts`, avec la définition du §9 (une clé =
> un littéral, les trous `{…}` retirés). L'écart d'une clé vient probablement d'une
> valeur concaténée comptée différemment. Les deux chiffres disent la même chose.

**La coupe se voit au premier coup d'œil** : quatre bandes, quatre figures, et aucune
section ne dépasse trois phrases après sa figure.

---

## 2. La forme livrée

```
BANDE 1  paper    douleur 01 — « un fil n'a pas de destinataire »
                  ├─ hero  + FIGURE A  (le fil / le palier)
                  └─ le palier + FIGURE B  (la même offre, une bande de plus)
BANDE 2  paper-2  douleur 02 — « si un agent répond, plus personne ne se répond »
                  └─ FIGURE C  (le maillage au-dessus, une ligne chacun en dessous)
BANDE 3  fig-950  douleur 03 — « un modèle lisse ma voix »   ← LE BLOC SOMBRE
                  └─ FIGURE D  (un message, relu)
BANDE 4  paper    le prix + la clôture (pas de figure : la carte de prix en est une)
```

Le **bloc sombre est unique** et il est **dépensé sur** la bande 3, pas ajouté à côté.
`ThreadBand` porte deux mouvements dans **une seule `<section>`**, séparés par un
`border-t` : le palier est la forme commerciale de la douleur 01, pas une cinquième bande.

**Rythme.** Trois bandes sur quatre posent la figure à droite ; la **bande 2 la passe
devant à `lg`** (`lg:order-first`). C'est la seule bande où l'argument *est* le dessin —
le texte ne fait que nommer ce que la structure montre. Sur téléphone l'ordre du DOM
tient, donc la phrase reste lue en premier.

---

## 3. Ce que j'ai coupé, section par section

| section morte | mots | pourquoi |
|---|---|---|
| **`MondaySection` + `fig_monday`** (24 clés) | ~330 | **Commandé.** Vraie (B11, B12, B14, B17) mais la grille l'a donnée à `/gyms` (douleur 02) et au hall `/pro` (ligne 04). Une bande sans ligne de grille meurt. |
| **`fig_third_day` + `roles.figure_caption`** (9 clés) | ~120 | **Décision propre.** La relance à 72 h (B21) sert « je les perds sans les voir partir » — la douleur d'une salle. Elle ne sert aucune des trois lignes de `/communities`. |
| **`fig_voice`** (13 clés, la maquette des 4 champs de doctrine) | ~110 | Repliée dans la figure D, qui dit la même chose **en montrant ce que le membre reçoit**. La phrase concrète du coach (« Trois vrais repas… ») survit là. |
| **`tier.not1..not4`** (9 clés, `dl` à 4 colonnes) | ~180 | Les quatre bornes tiennent en **une phrase** (`tier.reserve`), toujours **avant le prix** : un « non » découvert après le chiffre annule le chiffre. |
| **`roles.close`** (« un salon de plus ou un salaire de plus ») | 42 | Bonne ligne, mais c'était le **quatrième** bloc de texte de la bande 2. Cf. §6. |
| **`voice.traceable` / `voice.revise`** (B27, B28) | ~55 | Vraies. Coupées pour tenir la règle des trois phrases après la figure de la bande 3. Cf. §6. |
| `roles.*` → `layer.*` | — | Renommage : « les rôles » nommait un tableau à deux colonnes ; la bande nomme désormais une **structure**. |

**Ce qui a été gardé mot pour mot**, parce que ça marchait déjà :
le titre du hero (« A community is a thread. A thread can't answer one person. »),
`fig_lane` (la meilleure figure de l'ancienne page), l'exemple chiffré 750 €/mois avec
son étiquette « exemple », `pricing.no_number` (B31, **verbatim**), et la formulation
correcte du tarif annuel (B3).

---

## 4. Les claims, avec leur identifiant d'audit

| bande | claim | id | ancre |
|---|---|---|---|
| 1 | un fil répond à tout le monde, jamais à une personne | **B33** | absence de surface sociale |
| 1 | 14 jours / 3 membres, puis ça s'arrête | **B5** | `20260727235000_keel_billing_seats.sql:110-136,493-546` |
| 1 | invitation e-mail, aucun lien à copier | **B32** | `coach-invite-student-v1:5-32` |
| 1 | rien ne revient en boîte de réception | **S1** | `docs/keel/MODEL.md` |
| 1 | 500 membres, 3/10 → 750 €/mois | **B30** | arithmétique juste, étiquetée « exemple » |
| 1 | aucune intégration Skool/Circle/Discord/Kajabi | **C17 / B1bis** | — |
| 1 | aucun paiement demandé au membre | **S12** | `stripe-create-checkout-session` (aucun SKU membre) |
| 1 | chiffres d'énergie éteints par défaut | **C15** | ⚠️ **sans en écrire le nombre de gardes** — voir §6 |
| 2 | pas de fil, pas de salon, pas de commentaire | **B33** | aucune surface sociale |
| 3 | la méthode entre dans le chat, chaque semaine, chaque repas | **B10 / B8b** | `run.ts` · `generate-week-plan-v1` · `generate-meal-v1` · `generate-household-meal-v1` |
| 3 | le chat est relu contre les lignes rouges, sans modèle dans la boucle | **B8b** | `sophia-brain/skills/_shared/keel_output_locks.ts:307` |
| 3 | chaque ligne rouge porte son `instead`, dans vos mots, signé de votre nom | **B9** | `keel_output_locks.ts:191-200` (`signAsCoach`) · `_shared/keel/doctrine.ts:194, 788-789` |
| 4 | 7 €/membre/mois, aucun forfait plateforme | **B1** | `stripe-create-checkout-session:120-125,443-450` |
| 4 | **6 € pour un siège payé à l'année** | **B3** | formulation correcte conservée telle quelle |
| 4 | on arrête de payer le mois où on éteint un siège | **B4** | `stripe-reconcile-seats:18-35` |
| 4 | pas de chiffre de rétention, et on n'en invente pas | **B31** | **verbatim**, EN et FR |

Chaque claim porte son ancre **en commentaire JSX** dans la page.

---

## 5. Ce que j'ai refusé d'écrire

- ⛔ **« Jamais de calories »** — faux depuis FF-059 (§8 n°2, D4). Ce qui est écrit :
  *« les chiffres d'énergie sont éteints par défaut sur le compte d'un membre »*.
- ⛔ **Le nombre de gardes** qui décident de les rallumer. Le brief en annonce quatre,
  l'audit cinq selon ce qu'on compte (C15b) : **un chiffre sans source unique n'entre pas
  sur une page** (S8). J'ai écrit la garde sans la compter, et je l'ai noté dans l'en-tête.
- ⛔ **« Chaque message sortant est vérifié »** et **« la doctrine entre à chaque message »**
  (B7, B8). C'est la formulation **B8b** qui est écrite, mot pour mot, dans `voice.lock`.
- ⛔ **« C'est votre nom sur les messages »** (B18) et tout white-label (B19). Ce qui est
  écrit et vrai : *ce sont vos mots qui sortent, et ils partent signés de votre nom* —
  c'est le `instead`, pas la marque de l'agent, qui s'appelle Sophia partout.
- ⛔ **Aucune bande de risque, aucune tuile « on track », aucun score d'adhérence**
  (S9, B15) : la page du lundi étant coupée, l'occasion ne se présentait même plus.
- ⛔ **« Rien n'arrive la nuit »** (S5) : la relance a été coupée, donc les heures calmes
  aussi. Il ne reste **aucune** phrase sur les horaires — le silence le plus sûr.
- ⛔ **« Suivi personnalisé »**, **« élève »**, **« votre équipe »** : registre VOUS,
  vocabulaire **membres**, partout.
- ⛔ **Aucune démonstration interactive** : ce n'est pas ma page. Le budget est allé aux
  figures.
- ⛔ **Aucune photographie**, aucun cadre de téléphone. Les figures C et D sont des
  **concepts** ; A et B sont des schémas, jamais des captures paraphrasées.

---

## 6. Décisions prises seul (et assumées)

1. **La relance à 72 h sort de la page.** Elle est vraie (B21) mais elle sert la douleur
   d'une salle. *Une section = une ligne de la grille*, et je n'en ai que trois.
   Si le propriétaire la veut ici, elle rentre en **réserve d'une phrase** dans la bande 2,
   pas en figure.
2. **`roles.close` (« un salon de plus ou un salaire de plus ») est coupée.** C'est la
   meilleure ligne concurrentielle de l'ancienne page, mais c'était un **quatrième** bloc
   de texte dans une bande dont l'argument est le dessin. Elle se réinsère sans dégât si
   on l'estime plus utile que la brièveté.
3. **`voice.traceable` (B27, le CHECK en base) est coupée.** Vraie et forte, mais la
   bande 3 portait déjà corps + réserve du verrou + légende + clôture.
4. ⚠️ **L'audit se trompe sur une ancre, et le code gagne (socle §11).** Le brief m'a dit
   que `keel_output_locks.ts` « n'existe plus » : **il existe**, à
   `supabase/functions/sophia-brain/skills/_shared/keel_output_locks.ts`. Les deux ancres
   de B8b/B9 y sont vivantes (`:307` pour le scan, `:191-200` pour `signAsCoach`).
   Ce que le brief a raison de corriger, c'est que `_shared/keel/doctrine.ts:194,788-789`
   documente `instead` **et** l'injecte. J'ai ancré sur les deux.
5. **La géométrie de la figure B a bougé pour le français.** À 200 unités de large, la
   carte commençait à 140 et **« VOTRE COMMUNAUTÉ » (143 unités) lui rentrait dedans** :
   l'étiquette tient en anglais et déborde en français. Carte ramenée à 180, gouttière
   gauche portée à 152. Mesuré, pas supposé.

---

## 7. Ce que j'ai vu au navigateur

Serveur : **les cinq emplacements de `preview_start` étaient pris** (3 à d'autres sessions).
Comme les serveurs vivants servent **le même dépôt**, j'ai vérifié sur
`http://localhost:5179/communities`, dans **mon propre onglet** (`tabs_create`) — le premier
onglet partagé a été détourné en cours de route par une autre session.

Quatre passes, toutes vertes :

| | 320 px | 1280 px |
|---|---|---|
| **EN** | `scrollWidth 320 = innerWidth`, 4 figures, aucun texte de figure hors grille | figure B : `a lane of their own` 166..314 < 332 ✓ |
| **FR** | `scrollWidth 320 = innerWidth`, 4 figures | figure B : `VOTRE COMMUNAUTÉ` 24..138 < 152 ✓ |

- **Débordement horizontal** : `document.documentElement.scrollWidth <= window.innerWidth`
  vérifié à 320 px **dans les deux langues**. Les SVG dépassent 320 — c'est voulu, ils
  vivent dans `.fig-scroll`, et le débordement reste **borné au conteneur**.
- **Texte de figure** : aucune boîte englobante au-delà de `x=478` ni de `y=238`, dans les
  deux langues, sur les quatre figures (mesuré via `getBBox()`, pas regardé).
- **Console** : `read_console_messages` vide — donc aucune clé manquante (`t()` lève en dev).
- **Titres** : un seul `<h1>`, puis cinq `<h2>`, aucun saut de niveau.
- **CTA** : deux, tous les deux `/auth?role=coach` (hero et clôture) ; deux `/auth` de
  connexion. Aucun `/start`.
- **Le panneau ne repeint qu'à scroll 0** : les bas de page ont été atteints en décalant
  `body.marginTop`, et les positions ont été **mesurées** avant d'être regardées.
- **Défaut trouvé et corrigé au navigateur** : dans la figure C, `DANS SOPHIA` était posée
  sur la queue du trait de frontière et se lisait collée. Le trait s'arrête maintenant à
  372 et l'étiquette occupe la césure, à sa hauteur.

**Typecheck** : `npx tsc -b` → **0 erreur hors `TS2783`**. Les `TS2783` restants sont
l'artefact attendu du dispositif de brouillons (`...draftEn` réécrit des clés encore
présentes dans `en.ts`) et frappent **les huit namespaces**, pas le mien en particulier.
Ils disparaissent quand l'orchestrateur supprime l'ancien bloc `communities.` d'`en.ts`.

---

## 8. Contrôles de composition

- **U+202F : 0 occurrence** dans les trois fichiers.
- **U+2192 (`→`) : 0 occurrence** dans une chaîne rendue (il n'apparaît que dans des
  commentaires de code, jamais dans une valeur).
- **Espaces insécables U+00A0** : 34 dans le pack FR, vérifiés **par script** avant
  `: ; ! ? » € %` et après `«`, sur les 70 valeurs — **0 défaut**.
- **Apostrophes** : aucune `'` droite dans une valeur française.
- **Parité des clés** : 70 / 70, aucun doublon, aucune clé orpheline d'un côté.
- **Clés écrites en toutes lettres**, jamais construites par gabarit.
- **Aucune chaîne en dur** dans la page.

---

## 9. Pour l'orchestrateur

- **Aucune clé `public.*` n'est nécessaire.** L'en-tête et le pied de page suffisent tels
  quels ; le fil d'Ariane « Pour les pros › Communautés » existe déjà.
- **`Marketing.tsx`, `Button.tsx`, `tokens.css` : non touchés.** Les quatre figures et
  leurs primitives (`Figure`, `FigSvg`, `Tx`, `Key`, `Section`) sont **locales à la page**.
- **`.claude/launch.json` non touché** : `frontend-a8` n'a pas pu démarrer (plafond de
  cinq serveurs), la vérification s'est faite sur un serveur voisin du même dépôt.
- **Hors périmètre, à signaler** : l'ancre `keel_output_locks.ts` de l'audit **n'est pas
  périmée** — c'est son chemin qui a changé (`sophia-brain/skills/_shared/`). Le brief des
  huit constructeurs affirme le contraire ; il vaut mieux le corriger avant que quelqu'un
  supprime un claim vrai faute de retrouver le fichier.
