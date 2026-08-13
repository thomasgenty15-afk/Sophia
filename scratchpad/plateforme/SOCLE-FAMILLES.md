# SOCLE — le brief commun des sept familles

> Lu par les agents A à G de la phase 3. Ton prompt te donne **tes** écrans et
> **tes** composants partagés ; ce fichier-ci porte ce qui est vrai pour tous.
> En cas de contradiction entre ce fichier et ton prompt, **ton prompt gagne**.

---

## 1. Tes lectures, dans cet ordre, en entier

1. `docs/keel/CHARTE-VITRINE.md` — la charte **telle que construite**. Autorité.
2. `scratchpad/PROMPT-MASTER-PLATEFORME-20260813.md` §2 — la règle de couleur de l'app.
3. `scratchpad/plateforme/AUDIT-APP.md` — ce qui a été **compté sur tes écrans**,
   et les arbitrages §5.1/§5.2 qui te lient.
4. **`scratchpad/plateforme/KIT-CONTRAT.md` — LE PLUS IMPORTANT DES QUATRE.**
   Ce que les huit primitives garantissent désormais : le vocabulaire de rayon,
   ce que `primary` est devenu, le plafond d'une action figue par vue, et les
   quatre gestes que tu dois faire sur TES fichiers (pastilles maison → `Badge`,
   champs recopiés → `inputClass`, rayons locaux, saturées décoratives).
   **Tu t'y conformes ; tu ne le rediscutes pas.**
   Et `scratchpad/plateforme/kit/PLANCHE.html` — chaque primitive dans tous ses
   états, avant/après. Ouvre-la, ne devine pas.
5. `frontend/src/keel/components/ui/` — les huit primitives, déjà converties.
   Lis-les avant d'écrire une classe : c'est ce que tu dois **utiliser**.

## 2. Ce que ton travail EST

**Le kit est déjà passé à la charte.** Ton travail n'est donc pas de re-styler
chaque bouton. C'est, dans cet ordre :

1. **Supprimer les primitives locales** que ton écran a redéfinies (son propre
   bouton, sa propre carte, son propre champ, sa propre pastille) et les
   remplacer par celles du kit. L'audit §1 colonne `loc.` te dit combien tu en as.
2. **Retirer les classes locales qui contredisent le kit** — un `rounded-lg` sur
   une `Card` qui est déjà en `xl`, un `border-gray-200` sur un composant du kit.
3. **Balayer les neutres** (§3 ci-dessous).
4. **Retirer les saturées qui ne portent aucun état** (§4).
5. **Reprendre la mise en page là où elle ne tient plus** — aux deux largeurs.

## 3. Les neutres — l'essentiel du changement, et sans risque

`gray-50` → `paper` · `gray-100/200` → `line` · `gray-300` → `line-strong`
(bordure de **contrôle**) · `gray-500/600` → `ink-soft` · `gray-900` → `ink`.

⚠️ **`line` est à 1,30:1 : décoratif seulement.** Il ne borde **jamais** un
champ, une case ni un bouton — WCAG 1.4.11 exige 3:1 pour un composant
d'interface. Pour ça, `line-strong` (3,84:1).

⚠️ **`slate-*` existe aussi dans ce dépôt**, pas seulement `gray-*`. Le master ne
compte que `gray-*` ; balaie les deux. Vérifie avec :
```bash
grep -nE '\-(gray|slate|zinc|neutral|stone)-[0-9]{2,3}' <ton fichier>
```

## 4. La règle de couleur — la garde, et comment trancher

> **La teinte de marque marque la NAVIGATION et l'ACTION.
> Les couleurs d'état marquent les FAITS. Elles ne se croisent jamais.**

**La garde vérifiable, et elle est une forme, pas une couleur :**
un état est reconnaissable **à sa forme**, et **la figue n'entre jamais dans une
pastille**. Si tu ne sais pas trancher un cas, applique celle-là.

| Passe à la figue | N'y touche **JAMAIS** |
|---|---|
| Les liens | Une pastille `Badge` — **quelle qu'elle soit** |
| L'anneau de focus (`fig-600`) | Un état : ok, attention, échec, info |
| **Une** action principale par écran | **Un chiffre, une mesure, un verdict** |
| Les traits de figure (`--ill-fig`) | Une bordure de champ en erreur (rouge) |
| L'équerre, là où elle a un mot à sa droite | Un graphique de progression |

**Ce qui reste, et que tu n'appauvris pas** — ce sont des faits :
`bg-red-50 text-red-700` d'un message d'erreur · `bg-amber-50` d'un
avertissement · `text-emerald-700` d'un enregistrement confirmé · les quatre
familles de `Badge.tsx` (emerald=ok, **blue=info**, amber=attention, red=échec).

**Ce qui part** — une saturée qui ne correspond à **aucun état du système** :
- un **rang** ou une **catégorie** peints en lime/orange/amber ;
- une **frontière** entre sections peinte en rose/violet/sky/teal/orange ;
- un fond `bg-sky-50` « informatif » — le bleu est pris par `Badge tone="info"`,
  et une surface bleue décorative rend la pastille bleue muette ;
- **tout `violet-*`** : c'est la marque du produit grand public supprimé.

Quand tu retires une distinction que la couleur portait, **remplace-la par une
forme** : l'équerre `.eq` (elle « marque l'origine de ce qui est spécifié », et
**il y a toujours un mot à sa droite**), la taille du titre, l'espace, un
`Badge tone="neutral"` s'il s'agit d'un libellé.

## 5. Ce que tu ne fais pas — chacun a une raison mesurée

⛔ **Aucun changement de logique** : ni requête, ni garde, ni route, ni appel
d'API, ni valeur par défaut. Si tu trouves un défaut fonctionnel,
**signale-le dans ton rapport, ne le répare pas.**

⛔ **Tu ne touches à AUCUN fichier partagé** : rien dans `keel/components/ui/`,
ni `KeelAppShell.tsx`, ni `tokens.css`, ni `index.css`, ni `App.tsx`, ni
`keel/i18n/*`. Six autres agents travaillent en parallèle ; l'orchestrateur seul
touche aux partagés. **Si tu crois avoir besoin d'un changement dans le kit,
écris-le dans ton rapport** — l'orchestrateur l'intègre.

⛔ **Tu ne touches à aucun fichier qui n'est pas dans ta liste.** L'audit §4
attribue chaque composant partagé à **une** famille. Un composant qui n'est pas
dans ta liste appartient à quelqu'un d'autre, même si tu le vois laid depuis ton
écran.

⚠️ **L'APP EST BILINGUE DEPUIS LE 2026-08-13** — français **et** anglais. Ce
n'est plus « anglaise par choix » : un autre chantier a étendu la traduction au
produit connecté (`PublicMessages` est devenu `TranslatedMessages`, les packs
sont `en.ts` et `fr.ts`).
- **Ton lot est visuel. Tu ne traduis RIEN, tu ne déclares aucun namespace.**
- Toute chaîne que tu **ajouterais** devrait exister dans les deux packs avec
  les mêmes trous d'interpolation — donc **n'ajoute pas de chaîne**. Réutilise
  une clé existante, ou passe par la forme (une équerre, un titre) plutôt que
  par un nouveau mot.
- Une chaîne **en dur** que tu croises dans un écran déjà traduit est un
  **défaut** : signale-la, ne la traduis pas. Deux sessions qui écrivent dans
  `fr.ts` en parallèle, c'est le conflit assuré.
- ⚠️ **Si tu croises un commentaire qui affirme encore que « l'app est
  anglaise » ou que « le reste de KEEL est volontairement gris », RÉÉCRIS-LE.**
  Une contrainte documentée survit à sa cause, et le prochain lecteur
  « répare » ton travail en la remettant. Ce dépôt l'a déjà payé deux fois.

⛔ **Pas de `tailwind.config.*`** : il n'y en a pas dans ce dépôt, et il ne faut
pas en créer un. Tailwind 4 lit les `@theme` du graphe d'import.

## 6. Typographie

Young Serif **uniquement** en display, **jamais sous 20 px**, **une seule
graisse** — jamais `font-bold` dessus : le navigateur simulerait le gras et
épaissirait les contours. Public Sans partout ailleurs.
`text-label` (0.6875rem, +0,1em, capitales) pour l'étiquette de champ.
Mesure de lecture : **62 caractères au plus**.

⛔ **Pas de `→` (U+2192)** en texte courant : il n'existe dans aucune des deux
familles. ⛔ **Jamais U+202F** (espace fine insécable) : sans glyphe, mesurée.
En français : apostrophe typographique `’`, insécable U+00A0 avant `: ; ! ? »`.

## 7. Mobile d'abord, et les deux pièges qui vont te mordre

Compose à **320 px**, élargis ensuite. Vérifie à **320 px et 1280 px**.

1. ⚠️ **`flex-1` ne rétrécit pas un enfant** : `min-width: auto` par défaut, il
   refuse d'être plus étroit que son contenu. C'est ce qui fait **défiler la
   page entière** de 100 px à 320. Il faut `min-w-0` sur l'enfant **et** sur son
   enveloppe si elle est elle-même enfant de grille/flex.
2. ⚠️ **`behavior:'smooth'` n'est pas garanti** — no-op mesuré. N'en dépends pas.

Un seul `h1` par écran. Focus visible partout. `aria-label` sur tout contrôle
sans texte. Les champs à **16 px sous `lg`** (Safari iOS zoome sinon au focus et
**ne dézoome pas**).

## 8. Vérifie au navigateur, sur un écran RENDU

**Pas en relisant ton TSX.** Les défauts de ce chantier sont des défauts de mise
en page : ils ne se voient qu'au rendu, aux deux largeurs.

`preview_start` — `.claude/launch.json` porte plusieurs ports, prends-en un
libre. ⚠️ **Le panneau ne repeint qu'à scroll 0** : pour juger un bas d'écran,
décale le contenu ou **mesure en JavaScript**, ne scrolle pas.
⚠️ **Le profil navigateur est partagé avec d'autres sessions** : ne vide pas
`localStorage`, ne déconnecte personne, ne ferme pas les onglets des autres.

Mesurer un contraste ou une taille de police réels, plutôt que de les croire :
```js
getComputedStyle(document.querySelector('input')).fontSize
```

## 9. Vérification et livraison

```bash
cd frontend && npx tsc -b && npx vitest --config vitest.config.ts run
```
`tsc -b` utilise `tsconfig.app.json` ; **`tsconfig.json` est un solution file
qui ne vérifie RIEN**. Si le rouge vient d'un fichier qui n'est pas à toi,
**ne le répare pas** — d'autres sessions écrivent dans ce dépôt — consigne-le.

**Pas de commit, pas de `git add`, pas de push : l'orchestrateur commite.**
⛔ **Jamais `git stash`** : il emporterait 200+ fichiers d'autres sessions. Pour
comparer, `git show HEAD:<chemin>`.
⛔ Aucune commande à risque (`supabase *`). Ce lot est frontend ; si tu crois
avoir besoin de SQL, tu es sorti du périmètre — arrête-toi et dis-le.

**Livre** : tes fichiers, et `scratchpad/plateforme/<famille>/RAPPORT.md` avec
- les primitives locales supprimées et par quoi du kit tu les as remplacées ;
- les saturées retirées, et **par quelle forme** tu as remplacé la distinction ;
- les avant/après **mesurés** (`gray-*`, saturées, rayons) par fichier ;
- ce qui restait laid et que tu n'as pas pu régler sans toucher à la logique ;
- les chaînes en dur, défauts fonctionnels et besoins de kit que tu signales.
