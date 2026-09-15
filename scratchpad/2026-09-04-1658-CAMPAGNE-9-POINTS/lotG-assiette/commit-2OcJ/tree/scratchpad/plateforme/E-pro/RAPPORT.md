# FAMILLE E — L'ESPACE PRO — rapport

> 10 fichiers, 4 écrans rendus (`/coach`, `/coach/weekly`, `/coach/billing`,
> `/coach/clients/:id`). Tout ce qui suit est **mesuré au navigateur**, aux deux
> largeurs, sur des données réelles de la base locale. Le persona utilisé est
> `qa-coach-1785881676286238a1a@test.dev` (1 élève actif, 11 engagements actifs,
> 1 synthèse hebdo) — le seul coach connectable dont la grille de `WeekView`
> rende sa table **et sa légende**.

---

## 1. L'ARBITRAGE DEMANDÉ : les statuts violets de `WeekView`

### La question, reformulée

`DOT_STYLE` peignait six statuts d'évaluation. Le produit n'a que **quatre**
familles d'état (`ui/Badge.tsx` : émeraude = ok, bleu = info, ambre = attention,
rouge = échec). Le fichier résolvait l'écart en **inventant une cinquième
teinte** : `not_applicable: bg-violet-300`, `flex_used: bg-violet-400`.

Et le violet n'était pas le seul problème du barème : `partial` était en `sky`
(le bleu appartient à `Badge tone="info"` — une surface bleue décorative rend la
pastille bleue muette) et `missed` en `rose`, à **22° de `fig-700`**, c'est-à-dire
là où un échec commence à ressembler à un lien.

### Réponse : « non applicable » et « souplesse utilisée » SONT-ils des états ?

**`flex_used` : oui, et il appartient à la famille « ok ». Le code le dit déjà,
et il le dit en arithmétique.** `Highlight`, quarante lignes plus bas dans le même
fichier, compte `met: summary.met + summary.flexUsed` — le modèle **additionne les
souplesses à ce qui a tenu**. Une souplesse déclarée à l'avance sort du
dénominateur, pas de la semaine. Ce n'est donc pas une opinion sur le produit,
c'est une lecture de son modèle : `flex_used` est émeraude.

**`not_applicable` : non.** Son libellé traduit se lit « Not counted » /
« Non compté » (`status.not_applicable`). Ce n'est pas un état de l'élève, c'est
**l'absence d'obligation** — et `StatusDot` marque déjà exactement ça d'un tiret
quand la ligne n'est pas programmée ce jour-là (`cell.scheduled === false`). Les
deux disent la même chose ; leur donner la même marque est honnête, et le `title`
de la case porte la nuance.

### Ce que j'ai livré : deux axes, quatre familles, trois formes

Je n'ai **ni repeint en figue** (une légende de statut est un fait, pas une
action, et la garde du chantier est que la figue n'entre jamais dans une pastille)
**ni inventé de teinte**. La seconde distinction est une **forme** :

| statut | marque | pourquoi |
|---|---|---|
| `met` | disque plein **émeraude** | ok, exécuté |
| `partial` | disque plein **ambre** | `caution` = « degraded » dans le vocabulaire du kit ; `sky` n'était dans aucune famille |
| `missed` | disque plein **rouge** | la famille échec du produit est `red`, pas `rose` |
| `flex_used` | **anneau émeraude** (`border-2`, sans remplissage) | famille ok par l'arithmétique du modèle ; l'anneau dit « créditée, jamais exécutée » |
| `not_applicable` | **barre neutre** 2 × 12 px (`line-strong`, `rounded-part`) | aucune obligation à juger : la case est **barrée**, pas peinte |
| `unknown` | disque plein **neutre** (`line`) | le seul neutre PLEIN : la journée devait quelque chose, personne n'a répondu |

La règle générale, énoncée dans le fichier : **la teinte dit la famille du fait,
le remplissage dit ce que la journée devait.** Plein = une obligation a reçu une
réponse. Anneau = créditée ou levée sans être exécutée. Barre = rien à juger.

**Mesuré sur la légende rendue** (les six marques y sont toutes, inconditionnellement) :

```
Done            12×12  bg oklch(.696 .17 162)  (emerald-500)  radius full
Partly done     12×12  bg oklch(.828 .189 84)  (amber-400)    radius full
Missed          12×12  bg oklch(.637 .237 25)  (red-500)      radius full
Flex used       12×12  bg transparent · border 2px emerald-500 · radius full
Not counted      2×12  bg rgb(142,120,134) = line-strong · radius 4px
Not logged yet  12×12  bg rgb(227,218,224) = line            radius full
```

Deux effets de bord assumés, tous deux documentés dans le fichier :

1. **La géométrie est passée DANS `DOT_STYLE`.** Une marque qui n'est pas un
   disque ne peut pas être décrite par une couleur seule, et un `h-*` d'appelant
   aurait battu celui de la table (même couche, même spécificité : l'ordre de
   génération de Tailwind tranche — le piège que la charte documente pour
   `hidden` contre `inline-flex`).
2. **La légende rend la marque à sa taille réelle (12 px, plus 8).** À 8 px un
   anneau de 2 px de contour se referme en disque : la légende aurait dit
   exactement ce que la grille ne montre pas.

### Les trois autres violets de `WeekView`

| ligne | avant | après | la forme qui remplace |
|---|---|---|---|
| 259 | `text-violet-700` sur « Declared » dans une case de jour | `text-ink-soft` | **le mot lui-même** — c'est le seul mot de la case, sur une grille qui tient déjà trois teintes sur sept colonnes à 320 px |
| 427 | `border-violet-200 bg-violet-50 text-violet-900` sur **toute** la liste des écarts | `rounded-card border border-line-strong bg-paper text-ink` | **l'endroit** : la section s'appelle littéralement « déclaré à l'avance », plus une case tracée sur la fiche (l'idiome de `ui/Card.tsx`) |
| 434 | `bg-violet-200` sur une pastille fabriquée à la main | **`<Badge tone="neutral">`** | la pastille du kit. `positive` féliciterait un écart, `caution` le reprocherait — le produit ne fait ni l'un ni l'autre |

### ⚠️ CE QUE JE SIGNALE, ET QUI EST LE PLUS IMPORTANT DE CE RAPPORT

**`keel/components/KeelBadges.tsx` porte la MÊME table et garde le violet — et il
n'est attribué à AUCUNE famille dans l'audit §4.**

```
STATUS_STYLE = {
  partial:        "bg-sky-100 text-sky-800",
  missed:         "bg-rose-100 text-rose-700",
  not_applicable: "bg-violet-100 text-violet-700",   ⛔
  flex_used:      "bg-violet-100 text-violet-700",   ⛔
}
```

Le commentaire de `WeekView` promettait explicitement le miroir — *« the same
status must not be emerald in a badge and blue in a grid »* — et il avait raison.
**Je l'ai réécrit sur place** plutôt que de laisser une promesse fausse : sans ça
le prochain lecteur « répare » ma table en y remettant le violet.

`KeelBadges` est monté par `CommitmentLine` → `TemplatesPage`, `PlanImportPage`,
**`TodayPage`**. Le même statut est donc aujourd'hui un anneau émeraude sur
`/coach/clients/:id` et une pastille violette sur `/app/today`.
**La réparation est de porter ma table dans `KeelBadges.tsx`.** Ce n'est pas mon
fichier, et il n'est le fichier de personne : `PRIORITY_STYLE` du même fichier
porte en plus un code-couleur de **rang** (`core`/`secondary`/`optional` en
émeraude/sky/gris), exactement le motif que l'audit §2.2 condamne ailleurs.
**À attribuer.**

`ProgressPage.tsx` monte aussi `WeekView` : conformément à la consigne je ne l'ai
ni stylé ni supprimé (mort, zéro importeur).

---

## 2. LES DEUX `StatTile`

**Alignés à l'identique, au caractère** — vérifié par `diff` sur les deux corps de
fonction, qui sort vide. Ils ne sont **pas** factorisés : le kit appartient à
l'orchestrateur pendant que sept familles écrivent à côté, et un nouveau fichier
partagé dans `keel/components/` risquait d'être créé deux fois (l'autre session
touche aussi ces deux pages).

Le corps commun :

```tsx
<Card>
  <div className="text-label font-semibold uppercase text-ink-soft">{label}</div>
  <div className="mt-1 text-3xl font-semibold tabular-nums text-ink">{value}</div>
  {hint && <p className="mt-2 text-xs leading-5 text-ink-soft">{hint}</p>}
</Card>
```

- **⛔ aucune figue** — un chiffre est un fait. Sur `/coach/billing` c'est plus
  qu'une règle de style : la page promet qu'un coach « peut pointer un nom et voir
  le nombre qui l'a mis sur la facture ». Un nombre peint comme un bouton se lirait
  comme un geste.
- **Public Sans sur le chiffre**, pas Young Serif : la charte §3 attribue
  « texte, **chiffres**, libellés » à la famille de texte, et le dépôt a déjà
  mesuré que la display rend mal un nombre (`PriceCard` a perdu `tabular-nums`
  parce que « 12,99 € » sortait « 1 2,99 € »).
- `text-xs … tracking-wide` → **`text-label`** (le cran d'étiquette de la charte).
  `tracking-wide` retiré : `text-label` porte déjà son approche, les deux sur le
  même nœud se battraient.

**Chacune des deux copies porte le même bloc de commentaire** qui dit qu'elle a un
jumeau, où il est, et qu'il faut modifier les deux ensemble.
**Besoin de kit signalé : une `StatTile` dans `keel/components/ui/`.**

---

## 3. `variant="primary"` — VÉRIFIÉ AU NAVIGATEUR, ET L'AUDIT SOUS-COMPTAIT

Le relevé du KIT-CONTRAT compte les `primary` **par fichier de page**. Il rate
donc ceux que les **composants montés** posent. Mesuré en calculant
`backgroundColor === rgb(99,44,76)` sur chaque `button`/`a` de l'écran rendu :

| écran rendu | avant (mesuré) | après (mesuré) |
|---|---|---|
| `/coach` (cohorte pleine) | **2** — « Inviter » + « Envoyer à tous » (`CoachBroadcastCard`) | **1** — « Inviter » |
| `/coach` (cohorte vide) | 1 — `EmptyState` | 1 |
| `/coach/clients/:id` | **2** — « Save » (`CoachNoteCard`) + « Réactiver » ou l'intervalle (`CoachSeatCard`) | **1** — « Save » |
| `/coach/billing` | 1 (branches exclusives) | 1 |
| `/coach/weekly` | 0 | 0 |
| `InviteDialog` ouvert | 1 (bouton maison `bg-gray-900`) | 1 (`primary`) |

*(la pastille figue « Students » / « This week » du bandeau est celle du shell —
le lien actif, que la règle de couleur autorise nommément.)*

Ce que j'ai démoté, et pourquoi :

- **`CoachBroadcastCard` « Envoyer à tous » → `secondary`.** L'en-tête de
  `CoachHomePage` dit lui-même *« l'invitation est la SEULE action de cet
  écran »*. Le geste ne perd rien : il est désactivé la plupart du temps (cadence
  d'un mot par semaine tenue en base) et un contour de contrôle sous une zone de
  saisie se lit comme le bouton d'envoi de cette zone.
- **`CoachSeatCard` « Réactiver » → `secondary`.** La note est la seule écriture
  **routinière** de `/coach/clients/:id` ; l'état `paused` est rare.
- **`CoachSeatCard` confirmation « fermer le siège » : `primary` → `danger`.**
  Le kit a une variante pour un geste destructeur. Un aplat de marque sur « oui,
  retire son accès » **recommandait** l'action au lieu de la nommer.
  (L'en-tête du fichier disait « le bouton est `secondary` et demande
  confirmation » : c'est du **déclencheur** qu'il parlait, inchangé. J'ai étendu
  le commentaire pour que la distinction survive.)
- **`InviteDialog` submit : `primary`, et il ne compte pas contre celui de
  `/coach`.** Une fenêtre modale **est** la vue rendue : voile `ink/40`, verrou de
  défilement, `aria-modal` — le bouton d'invitation qui l'a ouverte n'est ni
  visible ni atteignable au clavier.

---

## 4. LE CAS QUI M'A FAIT DÉVIER DE MON BRIEF — mesuré, pas déduit

Mon brief disait : *« l'ambre de `CoachHomePage:301/303` et
`CoachBillingPage:220/222` est un bandeau d'avertissement → c'est un état, il
reste »*. **La ligne 301/220 est vraie et l'ambre y reste. La ligne 303/222 ne
rendait rien.**

Le bouton « Réessayer » portait
`className="mt-3 border-amber-300 text-amber-900 hover:bg-amber-100"` sur un
`<Button>` dont la variante par défaut est `secondary`. Calculé sur l'écran rendu :

```
borderColor: rgb(142, 120, 134)   = line-strong  (et non amber-300)
color:       rgb( 35,  25,  31)   = ink          (et non amber-900)
```

Les classes du kit **gagnent** : même couche, même spécificité, l'ordre de
génération de Tailwind tranche. C'est le piège que la charte documente déjà en §9
nº 4 pour `hidden` contre `inline-flex`.

**J'ai retiré les trois classes mortes** (en gardant `mt-3`), parce que les
laisser est pire que ne rien écrire : le prochain lecteur croit le bouton ambre et
« répare » le kit pour le rendre. Le fait reste porté par la carte
(`tone="warning"`, `amber-50` + `amber-200`) et par **sa phrase** (`text-amber-900`,
juste au-dessus) ; le bouton est une **action**, l'autre moitié de la règle de
couleur. `ink` sur `amber-50` = 15,1:1, `line-strong` sur `amber-50` = 3,8:1.

**`CoachHomePage:628/634` — vérifié, chacun porte bien un fait opposé.**
628 : `text-emerald-700` = l'email est parti / `text-amber-800` = l'invitation
existe mais rien n'a été envoyé. Ce n'est pas décoratif : c'est la seule chose qui
distingue « c'est fait » de « relance-le à la main ». **Les deux restent.**
634 : `text-rose-700` → **`text-red-700`**. C'est un échec, donc ça reste une
couleur d'état — mais la famille échec du produit est le **rouge**
(`Badge tone="critical"`, `Field`, `Button variant="danger"` : tous en `red-700`)
et `rose` n'était dans aucune des quatre. Même correction dans `InviteDialog`.

---

## 5. PRIMITIVES LOCALES SUPPRIMÉES → CE QUI DU KIT LES REMPLACE

| fichier | primitive maison | remplacée par | ce que ça corrige en plus du style |
|---|---|---|---|
| `InviteDialog` | **fenêtre entière** (`fixed inset-0` maison) | **`ui/Modal`** | Échap ne fermait pas · la page défilait sous le voile · ni `role="dialog"` ni `aria-modal` (un lecteur d'écran annonçait l'écran recouvert) · la tabulation sortait dans la cohorte cachée · pas de portail (un `transform` parent l'aurait enfermée) |
| `InviteDialog` | champ + étiquette recopiés | **`ui/Field` + `inputClass`** | `text-sm` = **14 px** → Safari iOS zoome au focus et ne dézoome pas. Bordure `gray-300` (1,86:1) → `line-strong` (3,84:1), WCAG 1.4.11. **Aucun** anneau de focus (la règle `:focus-visible` de `tokens.css` ne couvre pas un `input`) |
| `InviteDialog` | 3 boutons `bg-gray-900` / bordés | **`ui/Button`** (`primary`/`ghost`) | états désactivés et survols du kit |
| `WeekView` | `NavButton` | **`ui/Button variant="secondary"`** | contour désactivé `gray-200` = **1,24:1**, sous le seuil 3:1 · pas de `disabled:opacity` · survol `bg-white` hors palette · cible tactile `py-1` → `py-2` |
| `WeekView` | `Metric` (tuile `bg-gray-50`) | **`ui/Card`** | la tuile se lisait parce qu'elle était plus sombre que la page ; ce levier n'existe plus (ground = `paper`) |
| `WeekView` | 3 pastilles maison (`adherence_locked`, `facts_photo`, `deviation_flex`) | **`ui/Badge tone="neutral"`** | 1 violet + 2 rectangles à petit rayon là où le kit réserve `rounded-full` aux pastilles |
| `CoachStudentPage` | pastille « Lecture seule » (`<span className="rounded border-gray-300">`) | **`ui/Badge tone="neutral"`** | géométrie du kit ; la garde tient (aucune figue dans une pastille) |
| `CoachStudentPage` | `Frame` (`bg-white`) | conservé, **`bg-paper`** | la charte refuse le blanc pur — c'est le neutre sans température qu'elle écarte. C'était la seule surface coach à rendre l'ancien ground, et les cartes posées dessus perdaient leur contraste. `Page` du kit **n'est pas** appelée ici : elle rend un `<div>` et ce nœud est le `<main>` de la page — je n'échange pas un repère d'accessibilité contre une ligne de moins |
| `CoachStudentPage` | `h1` `text-2xl font-semibold` | **`font-display text-title`** (pas de graisse) | Young Serif n'a qu'une graisse : `font-semibold` la faisait simuler. Mesuré : 43,2 px / `font-weight: 400` |
| `CoachStudentPage` | `BackLink` en `gray-500` | **`text-fig-700 underline`** | un lien déguisé en légende. Mesuré : `rgb(99,44,76)`, `underline` |
| ×5 : `CoachSeatCard`, `CoachNoteCard`, `StudentConstraintsCard`, `CoachBroadcastCard`, `CoachStudentPage` (×2) | étiquette `<p className="text-xs font-semibold uppercase tracking-wide text-gray-400">` | **`ui/Card → SectionLabel`** | `gray-400` sur blanc = **2,84:1**, sous le seuil 4,5 du texte. Le kit rend `text-label` + `ink-soft` = 6,11:1, en `h2`, **avec l'équerre** |

**Sur le placement de l'équerre — j'ai fait un aller-retour, et la version
livrée est la seconde.** J'avais d'abord sorti les deux étiquettes de
`CoachStudentPage` au-dessus de leurs cartes. Au rendu, ça créait un **troisième**
motif sur le même écran, à côté des sections nues de `WeekView` (étiquette dehors,
pas de carte) et des trois cartes voisines (étiquette dedans). Deux motifs disent
deux objets différents ; trois disent qu'on n'a pas tranché. Les étiquettes sont
donc **dans** leurs cartes, ce que la charte §4 autorise nommément (« une section,
une **fiche**, une figure ») — une carte autonome est une fiche.
Chaque site porte l'avertissement `.eq` : **pas de `px-*` sur ce nœud**
(`padding-left: 1.125rem` posé hors de toute couche CSS). Mesuré : `18px` intact.

---

## 6. LES SATURÉES RETIRÉES, ET PAR QUELLE FORME

| saturée | où | remplacée par |
|---|---|---|
| `violet-300` / `violet-400` (statuts) | `WeekView` `DOT_STYLE` | **anneau émeraude** + **barre neutre** (§1) |
| `violet-700` (« Declared ») | `WeekView` case de jour | **le mot**, en `ink-soft` |
| `violet-200/50/900` (liste des écarts) | `WeekView` | **une case tracée** + le titre de section |
| `violet-200` (pastille flex) | `WeekView` | **`Badge tone="neutral"`** |
| `sky-400` (`partial`) | `WeekView` | **ambre** — la famille `caution`, que le kit définit comme « degraded ». Le bleu appartient à `Badge tone="info"` |
| `rose-400` (`missed`) | `WeekView` | **rouge** — la famille `critical` |
| `rose-700` (échec d'envoi) | `CoachHomePage`, `InviteDialog` | **`red-700`** — même raison, et `rose` était à 22° de la marque |
| `amber-300/900/100` (bouton) | `CoachHomePage`, `CoachBillingPage` | **rien : elles ne rendaient rien** (§4) |
| `bg-gray-900 text-white` (segment actif) | `CoachWeeklyPage` sélecteur de semaine | **`bg-fig-700 text-paper`** — c'est de la **navigation** entre rapports, le même vocabulaire que la pastille active du shell |
| `bg-gray-900 text-white` (segment actif) | `CoachSeatCard` intervalle | **`bg-line text-ink`** — voir ci-dessous |

**Le cas le plus fin, et il a été tranché AU RENDU.** J'avais d'abord mis les deux
sélecteurs (semaine, intervalle) en `fig-700`. Mesuré sur
`/coach/clients/:id` : **deux pastilles figue**, celle-ci et le « Save » de la
note. La sortie n'était pas d'arbitrer laquelle gagne, c'était de voir que le
segment d'intervalle **n'est pas une action** : « ce siège est au mois » est un
**réglage enregistré**, un fait sur le siège. Il porte donc le remplissage neutre
du produit (`bg-line`, celui de `Badge tone="neutral"`), et c'est le segment qu'on
**peut presser** qui garde un contour de contrôle — la sélection se lit à la
forme : un fond sans contour d'un côté, un contour sans fond de l'autre, et le
courant est de toute façon `disabled`.
Le sélecteur de semaine garde la figue : là, c'est bien « où je suis ».
Mesuré sur les trois variantes injectées dans la page rendue :
`bg-fig-700` → `rgb(99,44,76)` / texte `rgb(251,248,250)` (9,98:1) ·
outline → `bg-paper` + ring `rgb(142,120,134)` 1px (3,84:1) ·
courant → `bg-line` `rgb(227,218,224)` + `ink`. Hauteur 28 px, `rounded-full`.

### Une saturée AJOUTÉE, et c'est une correction

`CoachWeeklyPage:193/194` écrivait `text-gray-900` / `text-gray-600` **dans un
`Card tone="warning"`** — de l'encre neutre sur un aplat d'état, la seule
combinaison du coach où l'avertissement était peint sans que sa phrase le soit.
Les trois autres bandeaux (`/coach`, `/coach/billing`, `WeekView`) écrivent tous
en `amber-900`. Celui-ci les rejoint : **+2 saturées, et ce sont des faits.**

### Ce qui reste, et que je n'ai pas appauvri

35 saturées vivantes sur les 10 fichiers, **toutes** dans les quatre familles :
émeraude (jour qui compte pour la couverture, ligne qui a tenu, `met`,
`flex_used`, enregistrement confirmé), ambre (les quatre bandeaux
d'avertissement, ligne qui a glissé, `partial`, « moins de 100 caractères »,
« en ses propres mots », boîte de confirmation), rouge (`missed`, échecs
d'écriture, erreur de checkout), bleu (uniquement via `Badge tone="info"`).
**Zéro `violet`, `sky`, `rose`, `lime`, `orange`, `teal`.**

---

## 7. AVANT / APRÈS MESURÉS, PAR FICHIER

`gray` = `-(gray|slate|zinc|neutral|stone)-\d+`. « vivant » = commentaires retirés
(un grep naïf compte les valeurs que mes commentaires **citent** pour expliquer ce
qui est parti). `sat` = saturées hors `Badge.tsx`.

| fichier | lignes | `gray` avant → **vivant** | `sat` avant → **vivant** | rayons après |
|---|---:|---:|---:|---|
| `pages/CoachHomePage.tsx` | 772 → 856 | 19 → **0** | 7 → **4** | — |
| `pages/CoachWeeklyPage.tsx` | 365 → 395 | 18 → **0** | 0 → **2** ¹ | `full` |
| `pages/CoachStudentPage.tsx` | 652 → 710 | 27 → **0** | 0 → **0** | — |
| `pages/CoachBillingPage.tsx` | 476 → 530 | 17 → **0** | 5 → **2** | — |
| `components/WeekView.tsx` | 652 → 779 | **55 → 0** | **21 → 15** ² | `card`, `full`, `part` |
| `components/CoachSeatCard.tsx` | 237 → 304 | 13 → **0** | 3 → **4** ³ | `full`, `card` |
| `components/CoachNoteCard.tsx` | 165 → 183 | 6 → **0** | 2 → **2** | — |
| `components/StudentConstraintsCard.tsx` | 148 → 157 | 5 → **0** | 2 → **2** | — |
| `components/CoachBroadcastCard.tsx` | 174 → 197 | 9 → **0** | 1 → **1** | — |
| `components/InviteDialog.tsx` | 164 → 201 | 9 → **0** | 3 → **3** | `card` |
| **TOTAL** | 3 805 → 4 312 | **178 → 0** | **44 → 35** | **3 valeurs, toutes du kit** |

¹ les 2 ambres ajoutées de §6. ² les 15 restantes sont les quatre familles d'état.
³ +1 : le texte de la boîte de confirmation passe de `gray-700` à `amber-900`,
même correction qu'en ¹.

**Vocabulaire de rayon** : `rounded-lg` ×7, `rounded-xl` ×2, `rounded-md` ×1,
`rounded` nu ×5 → **`rounded-card` · `rounded-full` · `rounded-part`**, et rien
d'autre. Aucun `rounded-*` hors kit ne subsiste.

---

## 8. LES DÉFAUTS DE MISE EN PAGE TROUVÉS AU RENDU (et corrigés)

Aucun des deux ne se voyait dans un diff.

1. **`/coach`, la ligne d'un élève à 320 px : le nom disparaissait.**
   `flex items-center justify-between` avec une colonne de pastilles en
   `flex-shrink-0` : les trois pastilles + « Ouvrir » réclament ~250 px sur les
   288 disponibles, et la colonne du nom — qui porte `min-w-0` — se laissait
   comprimer à ~10 px. **Mesuré : « Sam » s'affichait « S », et « Client since
   5 Aug 2026 » « C ».** L'identité est le sujet de la ligne ; c'est la dernière
   chose qui doit céder. Le nom prend maintenant toute la première ligne sous `sm`
   (`basis-full sm:basis-auto`) et les pastilles passent dessous.
   Après : nom 254 px, ligne 92 px de haut à 320 ; **60 px et une seule ligne à
   1280** — la mise en page large est inchangée. Même correction appliquée à la
   liste des élèves retenus (escalade mineur), pour la même raison.

2. **`/coach`, l'étiquette « STUDENTS » collée au bord de la carte au-dessus.**
   `CoachBroadcastCard` ne posait aucune marge basse alors que toutes les sections
   de l'écran se séparent par `mb-8`. Mesuré : **6 px** entre le trait de la carte
   et l'équerre de l'étiquette. Invisible tant que l'étiquette était un `<p>` gris
   clair ; la signature l'a rendu criant. Après : **32 px**, le rythme de l'écran.

**Zéro débordement horizontal** sur les quatre écrans, aux deux largeurs :
`document.documentElement.scrollWidth === clientWidth` (320 et 1280), et aucun
élément hors viewport sauf **à l'intérieur** du `overflow-x-auto` voulu de la
grille hebdo (288 px visibles / 512 px défilables).
**Champs à 16 px sous `lg`** : vérifié sur l'`input` d'`InviteDialog` (16 px à
320, 14 px à 1280) et le `textarea` de la note (16 px à 320).

---

## 9. CE QUE JE SIGNALE ET N'AI PAS RÉPARÉ

### Défauts fonctionnels (hors lot visuel)

1. **⛔ `/coach/billing` est cassé pour TOUS les coachs, et ce n'est pas visuel.**
   `keel_my_seat_ledger()` lève
   `42804 — structure of query does not match function result type:
   Number of returned columns (7) does not match expected column count (6)`.
   Vérifié en appelant la RPC directement avec le JWT d'un coach actif
   (`keel_my_billing_summary` répond normalement à côté). `loadBilling` jette sur
   `ledgerRes.error`, donc l'écran rend **toujours** son bandeau d'erreur.
   **Conséquence pour la review : l'état `ready` de `/coach/billing` — les deux
   `StatTile`, `PlanState`, `LedgerRow`, l'encart explicatif — n'est pas
   atteignable au navigateur aujourd'hui.** J'ai vérifié son état d'erreur au
   rendu, et sa `StatTile` est identique au caractère à celle de `/coach`, dont le
   rendu est vérifié. C'est une dérive de signature `RETURNS TABLE` en base : hors
   de mon périmètre (aucune commande `supabase`), et à traiter avant toute QA de
   facturation.
2. **`/coach/weekly` imprime `null` à l'écran.** « mean core adherence pct :
   **null** » dans la section « The numbers » : `String(v)` sur une valeur `jsonb`
   absente. Dire `null` à un coach est pire que d'omettre la ligne. Le fichier
   documente déjà que cette table de métriques appartient au lot qui rendra
   l'écran traduisible ; le repli sur l'absence en fait partie.

### Typographie / i18n

3. **`coach.weekly.period` contient `→` (U+2192).** Mesuré sur l'écran rendu :
   « WEEK OF 2026-07-27 → 2026-08-02 », codepoint confirmé `U+2192`. La charte
   l'interdit en texte courant — le glyphe n'existe dans **aucune** des deux
   familles, il sort en repli système au milieu d'une ligne en capitales espacées,
   et ça se voit. La clé vit dans `en.ts`/`fr.ts` : **fichiers partagés, je n'y
   touche pas.** À remplacer par « to » / « au », ou par un tiret demi-cadratin.
4. **Trois de mes composants sont 100 % en dur, sur des écrans traduits.**
   `CoachNoteCard.tsx` (7 chaînes : titre, chapô, `placeholder`, compteur,
   « Saved. », « Saving… », note RGPD), `StudentConstraintsCard.tsx` (6 chaînes
   + la table `KIND_LABEL` : Allergy / Intolerance / Medication / Religious or
   ethical / Dislike). `/coach/clients/:id` est par ailleurs entièrement `t()`.
   **Signalé, pas traduit** : deux sessions qui écrivent dans `fr.ts` en parallèle,
   c'est le conflit assuré.

### Besoins de kit (pour l'orchestrateur)

5. **`StatTile` dans `keel/components/ui/`** — deux copies identiques aujourd'hui
   (§2), et la duplication est réelle.
6. **`KeelBadges.tsx` n'appartient à personne** et contredit maintenant
   `WeekView` (§1). Il porte en plus un code-couleur de **rang** dans
   `PRIORITY_STYLE` (émeraude/sky/gris pour core/secondary/optional), le motif que
   l'audit §2.2 condamne dans `TemplatesPage`/`PlanImportPage`.
7. **`Card` n'a pas de ton « positive ».** `WeekView.Highlight` doit donc garder
   son `border-emerald-200 bg-emerald-50` en local. Légitime (c'est un état sur
   une surface), mais c'est le seul endroit du lot où une surface d'état est
   écrite à la main.
8. **`ui/Modal` vole le focus au champ.** Son `dialogRef.current?.focus()`
   s'exécute après le commit React, donc après l'`autoFocus` de l'`input` :
   mesuré, `document.activeElement` est le `<div role="dialog">`. C'est le
   comportement recommandé pour un lecteur d'écran (la fenêtre est annoncée) et
   c'est **un** clic de plus pour tout le monde. Arbitrage à rendre dans le kit,
   pas ici ; j'ai laissé `autoFocus` en place.

### Environnement (pour les autres sessions)

9. **Le profil navigateur est partagé et `localStorage` est disputé.** La clé
   `sb-127-auth-token` a été **écrasée trois fois** pendant ma passe par d'autres
   personas (`ff060_gate@example.com`, un autre coach), ce qui a fait rendre à
   `/coach` l'écran « ce compte n'a pas de profil coach » au milieu d'une mesure.
   Repose ton jeton **juste avant** chaque mesure, et ne conclus rien d'un écran
   sans avoir relu `…user.email`. Je n'ai vidé aucun `localStorage`, déconnecté
   personne, fermé aucun onglet.
10. **Le serveur 5191 sert un arbre écrit par sept sessions.** J'ai vu
    `ui/Marketing.tsx` puis `SetupPage.tsx` en erreur de parse (500), ce qui
    **blanchit l'app entière** — `App.tsx` importe toutes les pages. Ce n'est pas
    ton écran qui est cassé ; attends et recharge.

### Vérification

```
npx tsc -b                → 0 erreur (tsconfig.app.json)
npx vitest … run          → 2 fichiers rouges, AUCUN à moi:
  src/edge/coverage-guard.int.test.ts      (54 vs 52 objets edge/migrations)
  src/keel/copy/planRefusals.int.test.ts   (7 clés `household.error.*` —
                                            HouseholdPage.tsx est à +410/−50
                                            dans l'arbre, lot de la famille D)
  836 tests passent, dont coachBroadcast, coachSeat, coachBilling, labels,
  pageSeams, pageFrontier, parity.
```

Aucun des deux rouges ne référence un de mes dix fichiers ni un module qu'ils
importent. **Rien n'est commité, aucun `git add`, aucun `git stash`, aucune
commande `supabase`.**
