# SOCLE — le contrat commun des huit constructeurs

> Refonte « par la douleur » du 2026-08-13. Tu es **un** des huit. Ce fichier
> est ton contrat ; ton prompt porte ta page, ses trois douleurs, et ce qui
> t'est confié en propre.

---

## 0. Ce qui est en jeu

Les huit pages publiques existent, elles sont bilingues, illustrées et honnêtes
— mais elles sont organisées **par fonctionnalité**. Elles passent à **une
section = une douleur**, dans l'ordre qui convertit, avec **moins de texte**, et
des figures qui font le travail à la place des paragraphes.

Ta page **existe déjà**. Ton travail est de la **réorganiser**, de **couper**, et
de faire porter l'argument par la figure. Ce n'est pas une page neuve : ce qui
est déjà juste et ancré se garde.

---

## 1. Tes trois lectures, dans cet ordre

1. **`scratchpad/site/GRILLE-DOULEURS.md`** — **ta commande**. Trouve ta page :
   tu as trois douleurs, dans l'ordre. **Une section = une ligne.**
2. **`docs/keel/CHARTE-VITRINE.md`** — la forme. Palette, typo, équerre, les
   cinq jetons d'illustration, les pièges de débordement. Quand elle contredit
   `scratchpad/site/design/CHARTE.md`, **elle gagne**.
3. **`scratchpad/site/AUDIT-SITE.md` §6 à §10** — les faits (C1-C17, B1-B33),
   les **12 interdits** (§8) et les **12 silences** (§9). Ils te concernent
   tous, même ceux qui semblent appartenir à l'autre monde.

**Un fait absent de ces trois documents n'entre pas dans une page.**

Invoque aussi le skill **`frontend-design:frontend-design`** avant d'écrire : il
porte la discipline de composition et l'exigence que la page ne ressemble pas à
un gabarit. La charte fixe déjà la palette et la typo ; lui apporte le reste.

---

## 2. La forme de la page — décidée, non négociable

**Quatre bandes**, dans cet ordre :

```
BANDE 1 = douleur 01   ← le héros. C'est lui qui fait dire « c'est moi » en 5 s.
BANDE 2 = douleur 02
BANDE 3 = douleur 03
BANDE 4 = le prix + la clôture (un seul CTA, le même qu'en haut)
```

- Il n'y a **pas de cinquième bande**. Une section qui ne sert aucune des trois
  douleurs **meurt** ou se **replie** dans celle qu'elle sert.
- **Le bloc sombre** (`bg-fig-950`, un seul par page) se dépense **SUR** une des
  trois bandes, jamais **en plus**.
- **L'honnêteté ne meurt pas avec sa bande.** Les « ce qu'on ne fait pas / ce
  qu'on ne promet pas » se replient en **réserve** dans la section concernée —
  un paragraphe `text-ink-soft` sous la figure, comme
  `mealprep.waves.reserve` et `mealprep.moves.note` le font déjà. Les 12
  interdits et les 12 silences restent **intégralement** en vigueur.
- Deux exceptions, écrites dans les prompts concernés : les deux **halls**
  (`/` et `/pro`) sont une grille de lignes, pas quatre bandes.

---

## 3. La discipline de longueur — elle est mesurée

Ta page rend **moins de mots** qu'avant. Voici ta ligne de départ, comptée le
2026-08-13 sur les valeurs anglaises du catalogue :

| page | namespace | clés | **mots rendus** | figures |
|---|---|---|---|---|
| `/meal-prep` | `mealprep` | 52 | **544** | 3 |
| `/couples` | `couples` | 65 | **682** | 3 |
| `/families` | `families` | 95 | **1039** | 1 |
| `/coaches` | `coaches` | 106 | **1359** | 4 |
| `/gyms` | `gyms` | 110 | **1609** | 5 |
| `/communities` | `communities` | 131 | **2062** | 1 |
| `/` | `home` | 34 | **414** | 1 |
| `/pro` | `pro` | 37 | **495** | 1 |

**Compte tes mots à la fin et donne le chiffre dans ton rapport** (le script est
au §9). Une section qui a besoin de **plus de trois phrases** après sa figure est
une section dont **la figure est ratée**.

**Le test qui décide :** un lecteur qui ne lit **que** les titres et les figures
doit comprendre l'offre entière, et surtout **se reconnaître** dans la première
section en cinq secondes.

---

## 4. Où tes clés atterrissent — lis ce paragraphe deux fois

Tu **n'écris pas** dans `en.ts` ni dans `fr.ts` : sept autres agents travaillent
en même temps et vous vous écraseriez.

Tes clés vont dans **deux fichiers qui n'appartiennent qu'à toi** :

```
frontend/src/keel/i18n/drafts/<namespace>.en.ts
frontend/src/keel/i18n/drafts/<namespace>.fr.ts
```

Ils sont déjà créés, vides, et déjà cousus au catalogue (`drafts/index.ts` est
importé par `en.ts` et `fr.ts`). **Conséquence : dès que tu écris une clé
dedans, `t()` la résout et ta page se rend au navigateur.** C'est tout l'intérêt
du dispositif — les défauts de ce chantier ne se voient qu'au rendu.

⚠️ **Ton fichier porte l'INTÉGRALITÉ de ton namespace, pas seulement les clés
neuves.** L'orchestrateur supprimera d'`en.ts`/`fr.ts` **tout** l'ancien bloc
`<namespace>.` et le remplacera par ton brouillon : **ce qui n'est pas dans ton
fichier n'existera plus**. Une clé que tu gardes se recopie.

Forme exacte, à respecter :

```ts
export const <namespace>En = { "<namespace>.hero.title": "…", … } as const;
export const <namespace>Fr = { "<namespace>.hero.title": "…", … } as const;
```

`fr.ts` est typé `TranslatedMessages` : **une clé anglaise sans sa française
casse `tsc`**. Livre les deux ensemble, toujours.

---

## 5. Les contraintes dures d'écriture

- **Chaque claim porte son ancre en commentaire JSX** —
  `{/* fact: C3 — meal_generation.ts:518 */}`. Un claim sans ancre sera
  supprimé en review.
- **Aucune chaîne en dur.** Tout passe par `t()`, EN et FR livrés ensemble,
  **mêmes trous d'interpolation** des deux côtés.
- **Le FR est une réécriture qui sonne juste, pas un calque.**
- **Le registre est fixé** (`fr.ts` en-tête) : `/`, `/pro`, `/couples`,
  `/families`, `/gyms`, `/communities` **VOUVOIENT** ; `/meal-prep`,
  `/coaches` et `/start` **TUTOIENT**. Ne l'invente pas, applique-le.
- **Apostrophe typographique `’` (U+2019)**, jamais `'`.
- **Espace insécable U+00A0** avant `:` `;` `!` `?` `»` `€` `%` et après `«`.
  ⛔ **JAMAIS U+202F** : mesurée sans glyphe dans les deux polices.
- ⛔ **Pas de `→` (U+2192)** : il n'existe dans aucune des deux familles. Dans
  une figure, **la flèche se dessine** (voir `MovesFigure` de `MealPrepPage`).
- **Les clés sont écrites en toutes lettres**, jamais construites par gabarit :
  ``t(`x.${k}.title`)`` compile et ne prouve plus rien.

## 6. Les fichiers que tu n'as PAS le droit de toucher

`en.ts` · `fr.ts` · `catalog.ts` · `App.tsx` · `Marketing.tsx` ·
`PublicHeader.tsx` · `Button.tsx` · `tokens.css` · `index.css` · la page d'un
autre · le brouillon d'un autre.

Tu écris : **ta page**, **tes deux brouillons**, et sous
`scratchpad/site/<segment>/`. Rien d'autre. Si tu crois avoir besoin d'une
primitive partagée, **fais-la locale à ta page** — une maquette partagée change
de sens sur deux pages quand on en édite une.

Si tu as besoin d'une clé de navigation, de pied de page ou d'en-tête
(`public.*`), **ne la crée pas** : signale-la dans ton rapport, l'orchestrateur
l'intègre en phase 2.

---

## 7. La mise en page — les pièges déjà mesurés dans ce dépôt

- **Mobile d'abord, composé à 320 px.**
- Une figure vit dans `.fig-scroll`, et **son enveloppe a besoin de `min-w-0`**
  — sinon `min-width: auto` remonte le plancher de 380 px à la piste de grille
  et c'est **la PAGE** qui défile en largeur (mesuré : 100 px de débordement).
- Un SVG de figure porte `className="… w-full max-w-[560px]"` : le plancher est
  dans `tokens.css`, **le plafond est à toi**. Sans lui, un SVG monte à 1070 px
  et son libellé passe devant le chapô.
- **Padding vertical en `pt`/`pb`, jamais en raccourci** : `padding: 84px 0`
  remet le padding horizontal à zéro et le titre sort de l'écran à 320 px.
- `flex-1` **ne rétrécit pas** un enfant : `min-width: auto` par défaut.
- **Un seul `<h1>`** par page. Ordre des titres sans saut.
- `aria-label` ou `<title>`/`<desc>` sur chaque figure. Focus visible partout.
- Grille de figure **480 unités**, deux épaisseurs (2 = contour d'une chose
  réelle, 1 = annotation), coordonnées entières, angles fermés, **une seule
  pièce chaude** (`--ill-fig`) par figure. Cinq jetons d'illustration, pas un de
  plus. Aucun dégradé, aucune ombre, aucune opacité, **aucune couleur d'état**.
- ⛔ **Aucune photographie**, aucun cadre de téléphone, aucune capture d'écran
  paraphrasée.
- ⚠️ **Les libellés de figure se mesurent DANS LES DEUX LANGUES** : le français
  est la langue longue, et une étiquette qui tient en anglais sort de la grille
  en français (déjà mesuré sur `HomePage`).

---

## 8. Si l'orchestrateur t'a confié une démonstration interactive

Trois pages sur huit en ont une. Si ce n'est pas la tienne, **n'en ajoute pas**
— trois pages de gadgets et la marque devient un jouet.

> ### ⛔ La limite, et elle est absolue
> **Une démonstration ne peut montrer que des valeurs que le produit produit
> RÉELLEMENT.** Avant d'écrire, **va lire la constante ou la fonction qui
> produit ces valeurs, et copie-les.** Si tu ne trouves pas la source, la
> démonstration n'a pas le droit d'exister.

Son plancher technique :

- **Elle fonctionne sans elle.** Sans JavaScript, ou sans un geste du lecteur,
  l'état initial est **déjà lisible et déjà juste**.
- **Accessible** : atteignable au clavier, focus visible, `aria` correct, l'état
  courant **annoncé** — pas seulement coloré. Un groupe de choix se fait en
  `role="radiogroup"` / `aria-checked`, ou en vrais `<input type="radio">`.
- **`prefers-reduced-motion` respecté.**
- **Bilingue** comme le reste — aucune chaîne en dur.
- **Elle ne pèse rien** : pas de bibliothèque, pas de dépendance ajoutée. React
  et le CSS suffisent.
- **Elle tient à 320 px.**
- **Une seule par page.**

---

## 9. Vérifier — et la commande qui compte tes mots

**Au navigateur, obligatoire.** `preview_start` avec le nom de serveur que ton
prompt te donne (chaque agent a le sien). Puis :

- **320 px et 1280 px**, **EN et FR** — quatre passes.
- ⚠️ Le panneau **ne repeint qu'à scroll 0** : pour voir le bas d'une page,
  décale le corps ou **mesure** (`javascript_tool`) plutôt que de regarder.
- ⚠️ **Ne vide pas `localStorage`** : le profil est partagé avec d'autres
  sessions. Pour basculer la langue, utilise l'interrupteur de la page.
- Contrôle du débordement horizontal, à 320 px, **sur chaque page** :
  `document.documentElement.scrollWidth <= window.innerWidth`.
- `read_console_messages` : `t()` **lève** en dev sur une clé inconnue. Une page
  blanche = une clé manquante, pas un bug de rendu.

**Le typecheck :** `cd frontend && npx tsc -b`.
⚠️ **Il sera ROUGE pendant tout le chantier** — sept autres agents ont des
brouillons à moitié écrits. Ne cherche que **tes** erreurs (chemins contenant
ton namespace ou ta page). **Ne répare jamais l'erreur d'un autre.**

**Compter tes mots** (remplace `<namespace>`) :

```bash
cd frontend/src/keel/i18n && node -e '
const fs=require("fs"),NS=process.argv[1];
const src=fs.readFileSync("drafts/"+NS+".en.ts","utf8");
const re=new RegExp("\""+NS+"\\\\.[^\"]+\":\\\\s*((?:\"(?:[^\"\\\\\\\\]|\\\\\\\\.)*\"\\\\s*\\\\+?\\\\s*)+)","g");
let m,w=0,k=0;while((m=re.exec(src))){k++;let t="";const s=/"((?:[^"\\\\]|\\\\.)*)"/g;let x;
while((x=s.exec(m[1])))t+=x[1];
w+=t.replace(/\\{[^}]*\\}/g," ").trim().split(/\s+/).filter(Boolean).length;}
console.log(NS,k,"clés",w,"mots");' <namespace>
```

---

## 10. Ce que tu livres

1. **Ta page** — réorganisée, coupée, ancrée.
2. **`drafts/<namespace>.en.ts`** et **`drafts/<namespace>.fr.ts`** — le
   namespace **entier**.
3. Tes SVG **dans ta page** (locaux, pas partagés).
4. **`scratchpad/site/<segment>/RAPPORT-DOULEURS-20260813.md`** :
   - le nombre de **mots avant / après**, et de clés ;
   - **ce que tu as coupé, et pourquoi** — nommément, section par section ;
   - la liste de tes **claims avec leur identifiant d'audit** (C-/B-/S-) ;
   - ce que tu as **vu au navigateur**, aux deux largeurs, dans les deux langues ;
   - ce que tu as **refusé d'écrire** et pourquoi ;
   - toute clé `public.*` dont tu as besoin (l'orchestrateur l'intègre).

⛔ **Tu ne commites rien. Tu ne pousses rien.** L'orchestrateur commite.

---

## 11. Une décision bloquante se prend, elle ne s'attend pas

Si la grille et le code se contredisent, **le code gagne** et tu l'écris dans ton
rapport. Si la grille et l'audit se contredisent, **l'audit gagne**. Si tu ne
trouves pas la source d'un fait, **le fait ne s'écrit pas**.
