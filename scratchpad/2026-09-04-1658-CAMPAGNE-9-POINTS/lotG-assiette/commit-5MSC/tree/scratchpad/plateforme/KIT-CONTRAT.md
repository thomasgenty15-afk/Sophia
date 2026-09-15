# LE CONTRAT DU KIT — ce que les huit primitives garantissent désormais

> Écrit par l'orchestrateur à la réception de la phase 1, après avoir **relu le
> diff et vérifié les contrastes au calcul**. C'est ce document que les sept
> familles suivent. Il remplace toute lecture du kit « au jugé ».

---

## 1. Le vocabulaire de rayon — deux valeurs, et c'est tout

La surface rendue portait **sept** valeurs concurrentes (`rounded` nu ×108,
`lg` ×88, `full` ×64, `xl` ×27, `md` ×22, `2xl` ×8, `3xl` ×3). Le kit en garde
**deux**, prises des jetons qui existaient déjà dans `tokens.css` :

| classe | jeton | valeur | usage |
|---|---|---|---|
| `rounded-card` | `--radius-card` | 12 px | une carte, un champ, une entrée de menu, un panneau |
| `rounded-full` | — | — | **un bouton et une pastille d'état, rien d'autre** |
| `rounded-fiche` | `--radius-fiche` | 16 px | une surface entière (`SetupSection`) |
| `rounded-part` | `--radius-part` | 4 px | une petite pièce **dans une figure** |

**Ce que ça vous impose :** remplacez `rounded-lg`, `rounded-md`, `rounded-xl`,
`rounded-2xl`, `rounded-3xl` et `rounded` nu par `rounded-card`. Gardez
`rounded-full` **uniquement** sur les boutons et les pastilles.
⚠️ `rounded-card` **n'est pas** un alias inventé : `--radius-card` existait déjà
dans `tokens.css`, et les huit pages publiques l'emploient (`StartPage`,
`Auth`, `CoachesPage`). Vous alignez l'app sur la vitrine, vous n'inventez rien.

## 2. `Button` — ce que chaque variante rend maintenant

| variante | rendu | quand |
|---|---|---|
| `primary` | **`bg-fig-700 text-paper`**, survol `fig-800` | **UNE action principale par vue rendue** |
| `secondary` | `border-line-strong bg-paper text-ink`, survol `fig-50` | tout le reste — **et c'est le DÉFAUT** |
| `ghost` | `text-ink-soft`, survol `fig-50` | le geste qu'on peut ignorer (Annuler) |
| `danger` | `border-red-200 bg-paper text-red-700` | destructeur — **c'est un état, inchangé** |
| `brand` | identique à `primary` | le geste commercial d'une page de vente |

⚠️ **`primary` porte désormais la marque.** Contrastes vérifiés au calcul :
`paper` sur `fig-700` = **9,98:1**, sur `fig-800` = **12,79:1**.

⛔ **LA CONTRAINTE QUI VOUS CONCERNE LE PLUS : une seule action figue par vue
rendue.** Deux boutons figue côte à côte, c'est zéro hiérarchie. Le relevé par
écran (`variant="primary"` explicite) :

| écran | `primary` | à faire |
|---|---:|---|
| `CoachProtocolPage` | **3** | garder l'action principale, passer les autres en `secondary` |
| `SetupPage` · `HouseholdPage` · `CoachHomePage` · `CoachBillingPage` | **2** | vérifier **au navigateur** si les deux sont rendus en même temps ; si oui, en démoter un |
| `TodayPage` · `ChatPage` · `StudentHealthPage` · `CoachMealsPage` · `TemplatesPage` | 1 | rien à faire |
| les 6 autres | 0 | rien à faire |

⚠️ **Le défaut de `<Button>` sans `variant` est `secondary`**, pas `primary`.
Un `<Button>` nu ne devient donc PAS figue — ne le « corrigez » pas.

## 3. `Badge` — n'y touchez pas, sauf pour arrêter d'en contourner un

Les **quatre familles d'état sont inchangées** : `positive` émeraude,
`info` **bleu**, `caution` ambre, `critical` rouge. Seul `neutral` a bougé :
`bg-gray-100 text-gray-600` → **`bg-line text-ink-soft`** (4,72:1, vérifié).

⛔ **Aucune classe `fig-*` n'entre dans une pastille.** C'est la garde du
chantier, et elle est une forme, pas une couleur.

**Ce que vous devez faire avec `Badge` :** partout où votre écran fabrique sa
propre pastille à la main (`<span className="rounded-full bg-…-50 text-…-700">`),
**remplacez-la par `<Badge tone="…">`**. C'est le geste qui supprime le plus de
saturées décoratives d'un coup, parce qu'une pastille maison est presque
toujours une couleur choisie sans état derrière.

## 4. `Field` — le défaut des 16 px est corrigé à la source

`inputClass` est désormais :
```
block w-full min-w-0 rounded-card border border-line-strong bg-paper px-3 py-2.5
text-base text-ink placeholder-ink-soft transition-colors
focus:border-fig-600 focus:outline-none focus:ring-2 focus:ring-fig-600
disabled:bg-paper-2 disabled:text-ink-soft disabled:opacity-60 lg:text-sm
```

Quatre choses vous concernent :
1. **`text-base … lg:text-sm`** — 16 px sous `lg`, 14 px au-dessus. La cause
   réelle du défaut : la règle `font-size:16px` d'`index.css` vit dans
   `@layer base`, et **un utilitaire la bat**. La protection était donc
   contournée sur les cent champs du produit sans avoir été retirée.
   ⛔ **Ne remettez jamais `text-sm` nu sur un champ.**
   **Vérifié au navigateur** : les 4 champs de `/app/health` à 320 px calculent
   `16px`, bordure `rgb(142,120,134)` = `#8E7886` = `line-strong`.
2. **`border-line-strong`** (3,84:1) et jamais `border-line` (1,30:1) sur un
   contrôle — WCAG 1.4.11.
3. **`min-w-0` est déjà là** : un champ en `flex-1` ne rétrécissait pas
   (`min-width:auto`) et faisait défiler la page à 320 px.
4. **L'anneau de focus est explicite** (`fig-600`, 7,36:1) parce que la règle
   `:focus-visible` de `tokens.css` ne couvre que `a`, `button` et `[tabindex]` —
   un champ n'en fait pas partie.

**Ce que vous devez faire :** partout où votre écran a recopié sa propre classe
de champ, **importez `inputClass` de `ui/Field.tsx`** au lieu de la maintenir.

## 5. `SetupSection` — la prop `accent` n'existe plus

Les cinq accents décoratifs (`rose` `violet` `sky` `teal` `orange`) sont
supprimés, type compris. La frontière entre sections est maintenant portée par
la **forme** : un fronton `bg-paper-2` fermé par un trait `line`, et
**l'équerre `.eq` collée au titre**.

⚠️ **Les cinq sites d'appel de `StudentWeekPlanPage.tsx` sont déjà corrigés**
(lignes 1747/1770/1938/1957/1975). **Famille C : ne les réintroduisez pas.**

⚠️ **Un piège mesuré si vous posez une équerre** : `.eq` pose
`padding-left: 1.125rem` **hors de toute couche CSS**, donc elle bat un
utilitaire `px-*` de même spécificité. **Ne mettez pas de `px-*` sur le nœud qui
porte `.eq`** — mettez-le sur son parent.

## 6. `Card`, `Page`, `Modal`, `Marketing`

- **`Card`** : `rounded-card border border-line`, `tone="warning"` garde son
  ambre (**c'est un état, il porte un fait**), `tone="dashed"` en
  `border-line-strong`. `SectionLabel` passe en `text-label` + `ink-soft`.
- **`Page` / `PageHeader`** : le `h1` est en `font-display` — c'est de là que
  vient le titre en Young Serif que vous voyez sur vos écrans.
  ⚠️ **Un seul `h1` par écran** : si votre page en pose un deuxième à la main,
  c'est le vôtre qui part.
- **`Modal`** : neutres à la charte, rien d'autre.
- **`Marketing`** : **comment seulement** — l'autorité citée pointait le
  brouillon (`scratchpad/site/design/CHARTE.md`) au lieu de la charte construite
  (`docs/keel/CHARTE-VITRINE.md`). Aucun changement de rendu.

## 7. Ce que le kit ne fait PAS pour vous

Le kit gouverne le **châssis**. Il ne peut pas deviner :
- vos **pastilles maison** (§3) ni vos **champs recopiés** (§4) ;
- vos **saturées décoratives** — le code-couleur de catégorie, la surface
  `bg-sky-50` « informative », le violet du produit supprimé ;
- vos **rayons locaux** (§1) ;
- votre **mise en page à 320 px**.

C'est exactement le travail de la phase 3.

## 8. La preuve

`scratchpad/plateforme/kit/PLANCHE.html` — chaque primitive dans tous ses états,
avant/après. Ouvrez-la, ne devinez pas.

**Contrastes revérifiés indépendamment par l'orchestrateur** (calcul WCAG 2.1) :
`ink`/`paper` 16,18:1 · `ink-soft`/`paper` 6,11:1 · `fig-700`/`paper` 9,98:1 ·
`line-strong`/`paper` 3,84:1 · `fig-600`/`paper` 7,36:1 · `line`/`ink-soft`
4,72:1 · `red-700`/`paper` 6,13:1 · `ink`/`fig-50` 15,39:1 ·
`ink-soft`/`fig-50` 5,81:1. **Aucun échec.**
