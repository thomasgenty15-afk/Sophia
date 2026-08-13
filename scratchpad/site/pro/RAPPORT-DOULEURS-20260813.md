# `/pro` — rapport de refonte « par la douleur » du 2026-08-13

> Constructeur 8. Page: `frontend/src/keel/pages/ProPage.tsx` · namespace `pro` ·
> registre **VOUS** · CTA unique `/auth?role=coach`.
> Brouillons: `frontend/src/keel/i18n/drafts/pro.en.ts` et `pro.fr.ts`.
> **Rien n'est commité.**

---

## 1. Les chiffres

| | avant | après | plafond |
|---|---|---|---|
| **mots rendus (EN)** | **495** | **493** | ≤ 495 |
| clés | 37 | 50 | — |
| lignes de `ProPage.tsx` | 280 | **245** | ≤ 245 |
| figures | 1 | 1 | — |
| mots rendus (FR) | — | 523 | — (le compte de référence est l'anglais) |

Comptés avec le script du socle §9 sur `drafts/pro.en.ts` et `drafts/pro.fr.ts`.
Parité EN/FR: **50 clés des deux côtés**, `npx tsc -b` ne rend **aucune** erreur
sur `ProPage.tsx` ni sur `drafts/pro.*.ts` (le reste du typecheck est rouge à
cause des sept autres brouillons — non touchés).

Le namespace livré est **entier**: ce qui n'est pas dans les deux brouillons doit
disparaître d'`en.ts` / `fr.ts`.

---

## 2. La forme livrée

```
HÉROS (paper)      kicker · h1 · une phrase · CTA · la note de prix
LA GRILLE (paper)  six lignes, filets pleine largeur
                   cellule gauche = la douleur commune (n° + text-lede, ink)
                   cellule droite = la fonctionnalité (display + une phrase)
                   la ligne 03 porte la figure du double verrou
CLÔTURE (paper-2)  B31 · le CTA répété · les trois portes en compact
```

Le **numéro de ligne** n'est pas un ornement: les six lignes sont ordonnées par
force de vente (grille des douleurs), l'ordre porte donc une information, et la
page est une **fiche technique** — des champs numérotés, ce que la charte
appelle sa direction. La douleur est en `text-lede` `ink`, la réponse en
display: un lecteur qui ne lit que la colonne de gauche traverse la page **par ce
qui lui arrive à lui**.

---

## 3. Les six lignes et leurs ancres

| # | douleur | fonctionnalité | ancre écrite en commentaire JSX |
|---|---|---|---|
| 01 | ce qui doit être dit chaque jour ne peut pas dépendre de votre présence | une méthode posée une fois — **la vôtre, ou la nôtre** | `coaches.doctrine_source='house'` (migration `20260806230000`) · `_shared/keel/doctrine_delegation.ts`, câblé aux **deux** endroits qui signent (`doctrine_loader.ts`, `keel-coach-broadcast-v1`) · ⏳ contenu de la doctrine maison **en cours** — la ligne le dit |
| 02 | vos clients ont des questions entre deux séances | le quotidien tenu par la méthode, **quatre** points d'injection | B10 — `run.ts:1441,2503` · `generate-week-plan-v1:338,541` · `generate-meal-v1:576,1038` · `generate-household-meal-v1:1602,2249` |
| 03 | une IA qui parle en votre nom vous contredira | **le double verrou** (+ la figure) | B8b — `doctrine.ts:194`, `:788-789` (injection) · `findDoctrineViolations` `doctrine.ts:1077` (relecture du chat) · B9 pour l'`instead` |
| 04 | vous apprenez qu'un client a décroché une fois qu'il est parti | **le lundi en une page**, calculée | B11 cron `'0 6 * * 1'` (`20260803090000:90-116`) + `renderSynthesisText` pur (`coach_synthesis.ts:516-641`) · B14 seuils 48 h / 120 h (`:64-65`) · B17 cohorte scopée (`coach_synthesis_io.ts:171-187`) |
| 05 | comment savoir que c'est bien votre méthode qui est appliquée ? | **chaque ligne cite la conviction** | B27 — CHECK `student_week_plans_doctrine_traceable_check` (`20260803210000:87-113`) · portée **semaine seulement**, dit dans la copie |
| 06 | les plateformes facturent par palier | **le siège est le seul poste** | B1 (`stripe-create-checkout-session:120-125`, `legacyTierPriceId = null`) · B4 (`stripe-reconcile-seats:18-35`, recalcul depuis le ledger) |

Hors grille: la note de prix du héros porte **B5** (`20260727235000_keel_billing_seats.sql:110-136`, 14 jours / 3 clients) et **B1**; la clôture porte **B31** (aucun chiffre de rétention).

**12 blocs `fact:` / ancres** sont présents dans `ProPage.tsx`.

---

## 4. Ce que j'ai coupé, section par section

| coupé | pourquoi |
|---|---|
| **`pro.proof.*`** (kicker + titre + corps) — la bande sombre « Never a refusal. Never "ask your coach". » | Son titre disait **« student »**, mot interdit sur ce hall (ce sont des **clients** ici) — le correctif demandé. Et son fond (B9: chaque ligne rouge porte son `instead`, dans les mots du coach) est **déjà porté par les libellés de la figure** (`VOS LIGNES ROUGES / et ce que vous faites`, `RETENU / dans vos mots`). Le reste était un **silence** (S1), pas un argument de vente. |
| Le **héros en deux colonnes** avec la figure | La commande impose un héros court. La figure est descendue sur la **ligne 03**, le claim qu'elle prouve — une figure posée dans un héros illustre la page, posée sur sa ligne elle **démontre**. |
| **`pro.hero.lede`** (l'ancien paragraphe B8b de 60 mots) | Le double verrou est un argument de ligne, pas un chapô. Il est écrit **mot pour mot dans son sens imposé** sur la ligne 03. Le héros ne garde qu'une phrase. |
| **`pro.doors.kicker`** et les trois **`pro.door.*.label`** | Les portes descendent en **compact** dans la clôture: le titre (« Vous vendez une formation ») porte déjà le segment, l'étiquette au-dessus était une redite. |
| La **bande sombre** `bg-fig-950` | Arbitrage détaillé au §6. |

---

## 5. Ce que j'ai refusé d'écrire

- **« 6 € quand votre client a payé son année »** (B2) — FAUX, l'intervalle est celui du **coach**. Rien de cette forme n'apparaît; la ligne 06 dit « 7 € par client et par mois » et le tarif annuel n'est pas évoqué (B3 aurait été tenable, mais deux prix sur une ligne de hall, c'est une ligne ratée).
- **« quelles convictions vos clients tiennent ou lâchent »** (B16) — rien ne le calcule.
- **« c'est votre nom / votre marque sur les messages »** (B18/B19) — aucune personnalisation de marque n'existe.
- **« positif dès le premier client »** (B6) — un coach à zéro client est refusé au checkout.
- **Tout chiffre de rétention ou de churn** (B31, S8). La clôture le dit à la place.
- **Bande de risque, tuile « on track », score d'adhérence** (S9, B15).
- **« Chaque message sortant est vérifié »** et **« la doctrine entre à chaque message »** (B7/B8). La ligne 03 dit « **dans le chat** » et nomme les trois surfaces d'injection, jamais « chaque message ».
- **La note privée sur un client** (B26) et **le tap du soir** (B22/B23) — écartées du hall, comme commandé.
- **« suivi personnalisé »**, **« votre équipe »** (B20), tout canal 1:1 (S1). Vérifié par grep sur les chaînes des deux brouillons: aucun terme interdit.
- **Six figures, une par ligne.** Arbitrage au §6.

---

## 6. Trois arbitrages, et leur raison

### 6.1 Une figure, pas six

Le rappel « six petites figures valent mieux que six paragraphes » est
**conditionnel**; les deux plafonds ne le sont pas. Six SVG coûtaient ~50 lignes
de fichier et ~60 mots de libellés: la page cassait **les deux** barres. La
figure unique reste sur la ligne 03 — la seule des six moitiés qu'un lecteur **ne
peut pas obtenir d'un prompt**. Ses libellés sont ceux du 2026-08-12, **déjà
mesurés dans les deux langues**, et je les ai re-mesurés au rendu (§7).

### 6.2 Pas de bloc sombre sur cette page

La charte en autorise **au plus** un, elle n'en impose pas. Sur `bg-fig-950`, le
seul bouton de marque (`variant="brand"` = `bg-fig-700`) tombe à **2,4:1 contre
le fond**: son libellé reste à 9,98:1, mais la **limite du contrôle** échoue au
3:1 de WCAG 1.4.11. Les deux échappatoires étaient de détourner
`variant="secondary"` (dont l'intention est « geste secondaire ») pour le CTA
principal de la page, ou de dégrader le CTA répété en lien texte. Sur un hall
dont le CTA est tout le travail, aucune des deux ne vaut le contraste tonal. Le
rythme est porté à la place par trois choses: les filets pleine largeur, les
numéros en `fig-700`, et l'alternance `paper` / `paper-2` de la clôture.

### 6.3 ⚠️ `keel_output_locks.ts` **existe encore** — mon brief le disait supprimé

Le brief annonçait l'ancre `keel_output_locks.ts` comme périmée, « ce fichier
n'existe plus ». **C'est faux**: il a déménagé, et il est vivant à
`supabase/functions/sophia-brain/skills/_shared/keel_output_locks.ts:307`, où il
appelle `findDoctrineViolations`. J'ai cité les ancres demandées
(`doctrine.ts:194`, `:788-789`) plus `doctrine.ts:1077` pour la relecture; le
socle §11 dit que **le code gagne**, donc je le signale plutôt que de le taire.
Aucune copie n'en dépend.

Un quatrième point, mineur: la **colonne de gauche est écrite en VOUS**, alors
que la grille formule les douleurs en « je / ma ». Le registre de `/pro` est
imposé par l'en-tête de `fr.ts`; une citation à la première personne aurait
demandé des guillemets sur six lignes, soit du bruit typographique à chaque
rangée.

---

## 7. Ce que j'ai vu au navigateur

Serveur: **`frontend-a12` (5182) a refusé de démarrer** — « Maximum 5 dev servers
per folder reached; 3 belong to other chats ». J'ai vérifié sur un serveur déjà
en vie du même arbre de travail (**`http://localhost:5178/pro`**, onglet à moi,
`tab-6`), ce qui sert exactement les mêmes fichiers. `localStorage` n'a **pas**
été vidé; la bascule de langue s'est faite par l'interrupteur de la page.

Quatre passes: **320 px et 1280 px × EN et FR**.

| contrôle | 320 EN | 320 FR | 1280 EN | 1280 FR |
|---|---|---|---|---|
| `documentElement.scrollWidth <= innerWidth` | ✅ 320 | ✅ 320 | ✅ 1280 | ✅ 1280 |
| un seul `<h1>`, titres sans saut (h1 → h2 → h3 ×6 → h2 → h3) | ✅ | ✅ | ✅ | ✅ |
| `read_console_messages` (erreurs) | vide | vide | vide | vide |

- **Débordement:** rien ne dépasse hors de `.fig-scroll`. La figure défile dans
  sa propre boîte à 320 px (plancher 380 px, `margin-inline` négatif de
  `tokens.css`), la **page** ne défile pas. `min-w-0` est posé sur **les deux**
  cellules de chaque ligne, pas seulement celle qui porte la figure — c'est le
  piège mesuré de la charte §5.
- **Figure, largeur:** 560 px à 1280 (le plafond de `tokens.css`), pas 1070.
- **Libellés de figure, mesurés au rendu dans les deux langues** (budget: 164
  unités à gauche, 118 à droite, 80 au centre):
  `VOTRE MÉTHODE` 102/164 · `VOS LIGNES ROUGES` 124/164 · `et ce que vous faites`
  114/164 · `dans vos mots` 79/118 · `relu` 22/80 — et côté anglais le plus long,
  `and what you do instead` 134/164. **Aucun débordement dans aucune des deux
  langues.**
- **Clôture:** les trois « Voir pour… » sont **alignés** (colonne flex +
  `mt-auto`), y compris quand le corps de la porte du milieu passe à deux lignes.
- Le héros à 1280 laisse de l'air à droite du `h1` (colonne unique, la figure
  étant descendue sur la ligne 03). C'est assumé: un hall court avec un titre
  display de trois lignes, et non un héros à deux colonnes qui ferait remonter
  une preuve hors de sa ligne.

---

## 8. Deux clés `public.*` à traiter en phase 2 (je n'y ai pas touché)

1. **`public.footer.tagline` TUTOIE en français** — `fr.ts:104`: « **Ta** méthode,
   qui répond en **ton** absence. » Elle est rendue en pied de `/pro`, qui
   VOUVOIE, et de `/couples`, `/families`, `/gyms`, `/communities`, qui vouvoient
   aussi. Un seul pied de page pour deux registres: la couture se voit à l'œil.
   (`en.ts:2272` n'a pas le problème, l'anglais n'a qu'un registre.)
2. **En-tête à 320 px:** le mot-symbole « Sophia » et la pastille EN/FR se
   touchent presque (mesuré: quelques pixels). Ça n'appartient pas à ma page
   (`PublicHeader.tsx`), mais ça se voit sur les huit.

---

## 9. Fichiers livrés

- `frontend/src/keel/pages/ProPage.tsx` — 245 lignes, en-tête de commentaire
  **mis à jour** (ce qu'est un hall, le piège du vocabulaire, les deux
  fonctionnalités écartées, le renvoi B8b).
- `frontend/src/keel/i18n/drafts/pro.en.ts` — 50 clés, 493 mots.
- `frontend/src/keel/i18n/drafts/pro.fr.ts` — 50 clés, apostrophe U+2019 partout,
  15 espaces insécables U+00A0, **zéro U+202F**, zéro `→` dans les chaînes.
- `scratchpad/site/pro/RAPPORT-DOULEURS-20260813.md` — ce fichier.

La logique de redirection du connecté (`resolveHomePath`, `ServerUnreachable`,
`<Navigate>`) est **inchangée**, ligne pour ligne.
