# RAPPORT — `/` le hall du foyer · refonte « par la douleur » du 2026-08-13

Constructeur 7 · `frontend/src/keel/pages/HomePage.tsx` · namespace `home` ·
registre **VOUS** · brouillons `frontend/src/keel/i18n/drafts/home.{en,fr}.ts`.

---

## 1. Les chiffres

| mesure | avant | après | plafond | verdict |
|---|---|---|---|---|
| **mots rendus (EN)** | 414 | **447** | ≤ 450 | ✅ |
| mots rendus (FR) | — | 487 | — | (le FR est la langue longue) |
| **clés** | 34 | **54** | — | +20 clés, +33 mots |
| **lignes de fichier** | 285 | **245** | ≤ 245 | ✅ (−40) |
| figures | 1 | **1 + 5 marques** | — | |

Le compte est celui du script du socle §9, sur les valeurs **anglaises**.
`npx tsc -p tsconfig.app.json` : **zéro erreur** sur `HomePage.tsx` et sur mes
deux brouillons (le reste du chantier est rouge, comme prévu — pas touché).

⚠️ **Ma barre était un plafond absolu, pas une baisse relative** : la page passe
de 4 sections à 7 lignes ; +33 mots pour +3 sujets, c'est une compression de
40 % par sujet.

---

## 2. La forme retenue — une fiche, pas une grille de cartes

```
HÉROS         h1 · une phrase · CTA · le prix · la réserve d'entrée
LA FICHE      sept champs séparés par des FILETS (pas des cartes)
              [ la douleur | le mécanisme + sa réserve | la marque ]
              champ 04 = le seul à ouvrir sur la vraie figure (la casserole)
              champ 05 = le seul ESTAMPÉ SOMBRE (`fig-950`)
CLÔTURE       le CTA répété · les trois portes en bande compacte
```

**Pourquoi des filets et pas des cartes.** Sept cartes se lisent comme sept
produits ; sept champs bordés d'un filet se lisent comme **un document** — et le
document est la direction de la charte (§1, « la fiche technique »). C'est
exactement le contraire du gabarit « grille de fonctionnalités » à trois
colonnes, et c'est ce qui empêche le hall de ressembler à une septième page de
vente. La signature de la page, c'est **le champ estampé sombre au milieu de la
fiche** : le bloc `fig-950` est dépensé **SUR** le champ 05, jamais en plus.

**Le bloc sombre ne porte NI LIEN NI MARQUE**, et c'est calculé, pas esthétique :
`.on-dark` (tokens.css:199-202) ne remonte que `--ill-fig` et `--ill-ink-soft` —
`--ill-ink` resterait `#23191F`, invisible sur `#24101E`. Et l'anneau de focus
global `fig-600` (`#7E3C61`) tombe à **2,33:1** sur `fig-950`, sous le seuil de
3:1 : un bouton y serait focusable sans anneau visible. `CouplesPage.tsx:385-387`
avait déjà pris la même décision ; je la reprends et je l'écris dans l'en-tête.
⇒ **les trois portes sont donc dans la clôture claire, pas dans le bloc sombre.**

---

## 3. Les sept champs, et l'ancre de chaque claim

| # | champ | claim | ancre (dans le JSX) |
|---|---|---|---|
| 01 | `goal` | six objectifs déclarés, six consignes de service | **C4** — `SERVING_DIRECTION`, `_shared/keel/household_portions.ts:125` |
| 02 | `sessions` | la semaine arrive en sessions de cuisine | **C3** — `interface CookingSession`, `meal_generation.ts:518` (+ `runThrough`) |
| 03 | `waves` | un périssable s'achète au plus tôt 3 jours avant la casserole | **C5** — `MAX_FRIDGE_DAYS = 3` (`meal_generation.ts:730`), appliqué `grocery_waves.ts:211` |
| 04 | `pot` | un plat, la part de chacun, **en mots** | **C4** (`household_portions.ts:125,480`, `HouseholdPage.tsx:1838-1855`) |
| 04 | `pot.note` | l'allergie d'une bouche gouverne la casserole, **fail-closed** | **C9** — `generate-household-meal-v1:1643-1648, :1674-1680` (503 `safety_constraints_unreadable`) |
| 05 | `mouths` | une bouche sans compte ni écran · plafond 8 · la facture ne bouge pas | **C8** (`20260810260000:179-190`, `user_id = null`) + **C1** (`keel_household_max_mouths()` = 8, `:101-105`) |
| 06 | `claim` | +2 €/mois : lit le plan, pose **son** objectif | **FF-048 §3** + **C1** (`stripe-create-checkout-session:451-471`) |
| 07 | `chat` | lit le plan **du jour**, ce qui a été déclaré, et ce qui précède | **FF-010** — `_shared/keel/household_turn_context.ts:396` (`student_generated_meals`), `:549` (`household_food_restrictions`) |
| 07 | `chat.note` | fenêtre de **vingt** échanges | `loadRecentChatHistory`, `chat-inbound-v1:392,416` (réparé le 2026-08-10) |
| héros | `hero.price` | 12,99 €/mois le foyer, +2 € par accès réclamé | **C1** — `20260810260000:235-250` (maître jamais compté) |
| héros | `hero.reserve` | l'inscription ouvre quand le programme du coach maison est publié | **audit §10** — `/start` interroge `keel_free_signup_available` |
| clôture | `DOORS` | trois portes = trois branches réelles | **C13** — `onboarding.ts:84` `FunnelBranch = solo \| pair \| family` |

**Les trois réserves écrites, pas tues** (`waves.note`, `pot.note` — qui est une
force et pas un défaut —, `chat.note`), plus `hero.reserve`.

---

## 4. Ce que j'ai coupé, section par section

| coupé | pourquoi |
|---|---|
| **la section `proof` entière** (`home.proof.kicker/.title/.body`, 3 clés, ~55 mots) | Un hall n'a **pas de sections**. Le fail-closed C9 est la preuve la plus forte du produit : il est **replié** dans `home.pot.note`, **sous** le champ qu'il prouve. Il n'est pas perdu, il est rattaché. |
| **la section `doors` en cartes** (`doors.title` + 3 × `title`/`body`/`cta` = 10 clés, ~130 mots) | Elle descend dans la clôture en **bande compacte** : un libellé de situation et une ligne. Elle reste le seul chemin en page vers les trois pages segment. |
| **`home.fig.caption`** (~26 mots) | La légende disait mot pour mot ce que dit maintenant `home.pot.body` : elle faisait doublon avec la phrase de son propre champ. |
| **`home.hero.lede` d'origine** (« Sophia compose votre semaine en sessions… ») | Le mécanisme est descendu dans le champ 02, qui est fait pour lui. Le lede annonce désormais la **structure** de la page (« sept choses qu'une maison cesse de porter »). |
| **~90 mots de rédaction** répartis sur tout le reste | Une ligne de hall = un titre, une phrase, une marque. Pas un paragraphe. |

**Ce qui a été gardé tel quel :** `PotFigure` (la casserole et ses deux parts,
libellés déjà mesurés en français), toute la logique de redirection du connecté
(`resolveHomePath` / `ServerUnreachable` / `<Navigate>`) — **inchangée à la
ligne près**, c'est du comportement.

---

## 5. Ce que j'ai REFUSÉ d'écrire

### 5.1 ⛔ « suivi en série datée » sur la ligne 06 — **la grille perd contre le code**

La grille (`GRILLE-DOULEURS.md:160`) commande pour la ligne 06 : *« objectif géré
par la personne, et **suivi en série datée** au lieu d'une valeur mise à jour par
un autre »*. **Je ne l'ai pas écrit, et j'ai coupé la seconde moitié**, comme le
prompt m'y autorisait. Trois sources concordantes :

1. **FF-048 §3, « hors périmètre — engageant »** : *« ❌ Le chat, et **les mesures
   corporelles**, dans cette version. »* Ce que le profil réclamé donne est
   énuméré juste au-dessus, et c'est **deux** choses : la lecture du plan, et le
   droit de poser **son** objectif.
2. **C16** : `household_member_bodies` (`20260812220000:118`) a `member_id` en
   **clé primaire** — **une ligne écrasée**, ni date ni série. Le commentaire de
   table dit en plus : *« Il ne sort JAMAIS — ni au prompt pour un mineur, ni à
   l'écran »*. **Aucune courbe n'existe nulle part.**
3. **§8 n°9** (« Suivez le poids de chacun ») et **S6** (silence délibéré sur le
   suivi de poids).

Socle §11 : *« Si la grille et l'audit se contredisent, l'audit gagne. »*
La ligne dit donc exactement : **« Un compte à soi — 2 € de plus par mois : cette
personne lit le plan et pose son objectif. »** Rien qui puisse se lire comme une
courbe.

### 5.2 ⚠️ « la semaine en cours » sur la ligne 07 — vérifié, et **c'est vrai**, mais pas par le chemin que je croyais

La mémoire du dépôt (`week-plan-invisible-to-conversation`) dit que
`student_week_plans` n'a **aucun lecteur** dans `sophia-brain` — et c'est encore
vrai (`grep` → 0). Un `grep student_generated_meals supabase/functions/sophia-brain/`
rend **0** lui aussi. J'allais donc refuser la ligne.

**Elle tient quand même**, par **FF-010** : le chargeur vit dans
`_shared/keel/household_turn_context.ts`, importé par `router/run.ts:344`, et il
lit `student_generated_meals` (`:396`, filtré `plan_kind = 'household'`,
`retired_at is null`, fenêtre qui **couvre `localDate`**) plus
`household_food_restrictions` (`:549`).

⇒ J'écris **« le plan du jour »** et non « la semaine » : le chargeur ne rend que
les plats **du jour courant** (`// JOUR COURANT D'ABORD, ET SEULEMENT LUI`).
`keel_plan_context.ts` (`plan_versions`/`plan_commitments`) est bien mort en 1:N,
mais ce n'est pas lui qui porte cette promesse.

### 5.3 Les autres refus

- ⛔ **L'accusé de réception d'une photo** — hors moteur, en anglais figé. Absent
  de la page, et l'interdit est écrit au-dessus du champ 07.
- ⛔ **Toute durée d'essai, tout bouton d'achat** (§8 n°1) : le prix se dit, la
  date et le geste non.
- ⛔ **« jamais de calories »** (C15), **application mobile** (C17), **« rien à
  installer »** (S4) : ces trois-là n'ont **aucun point d'accroche sur la page**,
  donc rien ne les rappellerait ; ils sont nommés dans l'en-tête du fichier.
- ⛔ **Un chiffre sans source** (S8) : les seuls chiffres de la page sont
  12,99 €, 2 €, **huit** bouches, **trois** jours de frigo, **vingt** échanges,
  **six** objectifs — chacun avec son ancre au-dessus de son champ.
- ⛔ **Aucun « 90 secondes »** (C14), aucune entrée promise comme immédiate (§10,
  d'où `hero.reserve`).
- ⛔ **Aucune promesse de cadence de courses sur un plan court** :
  `wavesAreMeaningful` (`ShoppingListPanel.tsx:128`) **masque** les vagues quand
  il n'y en a qu'une ⇒ `waves.note`.

---

## 6. La décision de figure qui s'écarte du socle §7 — et pourquoi

Le socle impose « grille de 480 unités » et `.fig-scroll` (plancher 380 px). **Les
cinq marques de champ n'ont ni l'un ni l'autre** : `viewBox="0 0 120 80"`,
`w-[120px]`, pas de `.fig-scroll`.

Les deux règles existent pour **une seule** raison, écrite dans la charte §5 :
garder lisible **le TEXTE d'une figure** (« du texte à 9-13 unités sur 480 »
tombe à 5-7 px sur un téléphone). **Une marque qui ne porte aucun texte n'a
besoin d'aucune des deux** — et imposer le plancher de 380 px à cinq marques
poserait **cinq barres de défilement horizontales** sur un écran de 320 px.

Corollaire gagné, et il n'est pas mince : **aucun libellé à re-mesurer en
français**. Le piège déjà mesuré sur cette page (`home.fig.*`) ne peut pas se
rejouer sur les marques.

La seule vraie figure de la page — `PotFigure`, 480 × 236, dans `.fig-scroll`,
plafonnée à 560 px — garde évidemment les deux règles. Les cinq marques
respectent tout le reste : deux épaisseurs (2 = contour d'une chose réelle, 1 =
annotation), coordonnées entières, angles fermés, **une seule pièce chaude**
`--ill-fig` par marque, `<title>` sur chacune, aucun dégradé, aucune ombre.

---

## 7. Ce que j'ai vu au navigateur

Serveur : **`frontend-a10` (5180) n'a pas pu démarrer** — « Maximum 5 dev servers
per folder reached; 3 belong to other chats ». Vérifié sur **`localhost:5178`**,
même dépôt, même `cwd`, dans un onglet à moi (`tab-7`) après qu'un autre agent
eut détourné l'onglet partagé deux fois.

| passe | `scrollWidth ≤ innerWidth` | débordement hors `.fig-scroll` | note |
|---|---|---|---|
| **320 px · EN** | 320 ≤ 320 ✅ | **0 élément** | 1 `<h1>`, 8 `<h2>`, aucun saut de niveau |
| **320 px · FR** | 320 ≤ 320 ✅ | **0 élément** | bloc sombre en pleine largeur : `left 0 → right 320` |
| **1280 px · EN** | 1280 ≤ 1280 ✅ | **0 élément** | 7 champs à `left 96`, `w 1088` — ils lisent comme un document |
| **1280 px · FR** | 1280 ≤ 1280 ✅ | **0 élément** | idem, `PotFigure` à son plafond de 560 px |

- Le **seul** contenu qui dépasse à 320 px est le SVG de la casserole (420 px)
  **à l'intérieur** de son `.fig-scroll` : c'est le comportement voulu par le
  plancher, pas un défaut. La PAGE ne défile pas.
- **Marques** : les cinq rendent exactement `120 × 80` px, dans une cellule de
  280 px à 320 et de 120 px à 1280. Aucune n'est étirée.
- **Libellés de `PotFigure` en français**, mesurés au `getBBox()` : le plus long
  (`plus de féculents`) s'arrête à **x = 422** sur une grille de 480 — 58 unités
  de marge. Rien ne sort.
- **Bloc sombre** : `backgroundColor rgb(36, 16, 30)` = `#24101E`, et
  **`querySelectorAll('a,button,[tabindex]')` y rend 0**.
- `read_console_messages` (onlyErrors) : **aucun message**. Donc aucune clé
  manquante (`t()` lève en dev).
- Panneau qui ne repeint qu'à scroll 0 : contourné en décalant `body.marginTop`,
  et **toutes les assertions ci-dessus sont des mesures**, pas des regards.
- ⚠️ Je n'ai **pas** vidé `localStorage`. Bascule de langue par l'interrupteur
  de la page ; elle est restée en **FR** à la fin (elle l'était déjà à mon
  arrivée).

---

## 8. Ce dont j'ai besoin de l'orchestrateur

### 8.1 `PublicHeader.tsx` — les libellés de navigation (fichier interdit)

La grille impose « on nomme la **situation**, pas le segment ». **Je l'ai
appliqué à mes trois portes**, mais l'en-tête ne m'appartient pas et rend encore
les anciens noms. Il faut donc corriger, en `public.*` :

| lien | EN aujourd'hui | EN à poser | FR aujourd'hui | FR à poser |
|---|---|---|---|---|
| `/meal-prep` | Meal prep | **Just me** | Batch cooking | **Pour moi seul** |
| `/couples` | Couples | **The two of us** | En couple | **À deux** |
| `/families` | Families | **The whole family** | En famille | **En famille** |

(Ce sont exactement les valeurs de `home.door.*.label` de mes brouillons : les
recopier garantit que l'en-tête et la clôture disent la même chose.)

### 8.2 Aucune autre clé `public.*` demandée

### 8.3 Le repli des brouillons

`drafts/home.en.ts` et `drafts/home.fr.ts` portent **l'intégralité** du namespace
`home.` (54 clés, parité EN/FR vérifiée par script : listes de clés
**identiques**). L'ancien bloc `home.` d'`en.ts` (l. 2536-2588) et de `fr.ts`
(l. 271-317) est à **supprimer entièrement** — les 17 `TS2783` « specified more
than once » que `tsc` remonte aujourd'hui sont exactement la couture temporaire,
et ils disparaissent avec lui.

### 8.4 Typographie française vérifiée par script

`drafts/home.fr.ts` : **10 × U+00A0**, **0 × U+202F**, **0** espace simple avant
`: ; ! ? % € »`, **0** `→`, apostrophes typographiques U+2019 partout dans les
valeurs.

---

## 9. Rien n'est commité

Trois fichiers touchés, aucun `git add`, aucun commit, aucun push :

- `frontend/src/keel/pages/HomePage.tsx`
- `frontend/src/keel/i18n/drafts/home.en.ts`
- `frontend/src/keel/i18n/drafts/home.fr.ts`
