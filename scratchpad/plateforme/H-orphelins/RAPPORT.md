# FAMILLE H — LES ORPHELINS

> Les six fichiers atteignables depuis les seize écrans que le scan à un seul
> niveau de l'audit §4 n'avait attribués à personne. Vérifié **au rendu**, à
> 320 px et 1280 px, sur `http://[::1]:5191` (le port 5191 ne répond qu'en IPv6 :
> `127.0.0.1:5191` rend `000`, `[::1]:5191` rend `200` — c'est une origine à
> part, donc un `localStorage` à part, et aucune session voisine n'a été touchée).

---

## 1. `KeelBadges.tsx` — les six statuts, fait par fait

**La table maison est supprimée. `StatusBadge` rend désormais `<Badge tone>` du
kit**, avec la correspondance de `WeekView` reprise **teinte pour teinte**.

| clé | quel FAIT elle porte | ton du kit | ce qui partait |
|---|---|---|---|
| `met` | la journée devait quelque chose, et ça a tenu | `positive` | `bg-emerald-100 text-emerald-800` |
| `partial` | tenue à moitié : **il y a quelque chose à regarder** | `caution` | `bg-sky-100 text-sky-800` |
| `missed` | la journée devait quelque chose et ça n'a pas tenu | `critical` | `bg-rose-100 text-rose-700` |
| `unknown` | **aucun fait** : personne n'a répondu | `neutral` | `bg-gray-100 text-gray-600` |
| `not_applicable` | **aucun fait** : « Not counted », l'absence d'obligation | `neutral` | `bg-violet-100 text-violet-700` |
| `flex_used` | un fait **déclaré** : crédité, jamais exécuté | `positive` | `bg-violet-100 text-violet-700` |

**Pourquoi chacun :**
- `partial` → **ambre et pas bleu.** Le bleu est occupé par `Badge tone="info"` ;
  un `sky-100` à côté d'un `blue-50` donne deux bleus qui ne veulent pas la même
  chose, donc deux muets. Une journée à moitié tenue est une **attention**.
- `missed` → **rouge et pas rose.** `rose` est à 22° de `fig-700` : trop près de
  la marque. Le rouge d'échec est à 35°.
- `not_applicable` → **neutre.** Son propre libellé dit « Not counted » / « Non
  compté ». Ce n'est pas un état de l'élève, c'est l'absence d'obligation.
- `flex_used` → **famille émeraude**, sur l'arithmétique du modèle et pas sur une
  opinion : `WeekView.Highlight` calcule `met: summary.met + summary.flexUsed`.
  Une souplesse déclarée sort du dénominateur, pas de la semaine.
- **tout `violet-*` est parti** : c'est la marque du produit grand public
  supprimé, et ce n'est pas une famille d'état — il ne disait rien.
- **aucune figue nulle part** : un statut est un fait.

### Mon alignement avec `WeekView` (famille E)
**Aligné, sans invention.** J'ai lu `WeekView.tsx` (sans l'ouvrir en écriture) :
E avait déjà converti, sa règle est « la teinte = la famille du FAIT ; le
remplissage = ce que le jour DEVAIT », et son `DOT_STYLE` porte `amber-400` pour
`partial`, `red-500` pour `missed`, `bg-line` pour `unknown`, une **barre**
`line-strong` pour `not_applicable` et un **anneau** `emerald-500` pour
`flex_used`. La table de `KeelBadges` est exactement cette correspondance en tons
de `Badge`. Le commentaire de tête le dit et demande de changer les deux dans le
même geste. **La divergence signalée par E — « le même statut est un anneau
émeraude ici et une pastille violette là-bas » — est fermée.**

> ⚠️ **UN ÉCART ASSUMÉ, ET IL EST DANS LE FICHIER.** `Badge` n'a ni anneau ni
> barre : `met`/`flex_used` tombent tous deux sur `positive`, et
> `unknown`/`not_applicable` tous deux sur `neutral`. Là où E distingue par la
> **géométrie**, la pastille distingue par **le mot** — elle porte
> `statusLabel()`, distinct pour les six. Je n'ai pas ajouté de ton à
> `ui/Badge.tsx` : ce fichier n'est pas à moi. **Si l'orchestrateur veut la
> parité complète, c'est un `variant="ring"` dans le kit, pas ici.**

### `PriorityBadge` : retiré
**Zéro importeur, vérifié hors commentaires** sur `frontend/src` **et**
`frontend/e2e` : les quatre occurrences restantes du nom sont des commentaires
(`CommitmentLine`, `TemplatesPage`, `PlanImportPage`) qui racontent son
remplacement. La famille F l'a remplacé par `CommitmentLine.PriorityMark`, une
marque **ordinale** (trois pièces remplies de gauche à droite).
Il était faux deux fois en plus d'être mort : l'émeraude de `core` était un
**faux « ok »** — un engagement principal n'est pas un engagement tenu, et sur
`/app/today` cette fausse coche touchait la vraie dans la même rangée — et le
`sky` de `secondary` prenait le bleu d'`info`. Un **rang** n'est pas un état :
il n'a pas de pastille, il a une forme. Le retrait et sa raison sont écrits dans
le fichier, avec l'interdiction de le recréer.

### `TimingNote` : l'ambre reste, et ce n'est pas une pastille
« Fait au mauvais moment » est une **attention** — un fait. Elle reste une
**note** au milieu de trois autres notes de sa rangée (`CommitmentLine`) : lui
donner un remplissage en ferait le seul objet d'un autre genre de la ligne, à
côté de la seule pastille qui s'y trouve. Le cran de 11 px est celui de ses
voisines (`ActivityChip`, `PriorityMark`), pas un oubli.

---

## 2. `DataPrivacySection.tsx` — 554 lignes, et ce que `isArchitect` faisait

### La réponse : **une peau morte, et rien d'autre**
`isArchitect` ne pilotait plus que le second habillage — **sombre et en
émeraude** : `bg-emerald-900/30`, `border-emerald-800`, `text-emerald-400`,
`bg-emerald-900/50`, `placeholder-emerald-700`, `bg-red-950/30`,
`border-red-900/50`, `text-red-300`… **24 des 45 couleurs saturées du fichier.**
Aucun autre effet : ni requête, ni garde, ni route, ni valeur par défaut.
Et cette peau était **morte avant d'être hors charte** : elle ne se déclenche pas
sur un palier d'abonnement mais sur un `?mode=architecte` dans l'URL
(`pages/Account.tsx`) que **rien dans le dépôt ne pose** — revérifié hors
commentaires sur `frontend/src` et `frontend/e2e`, ce qui confirme le relevé de
la famille G.

**Ce que j'ai fait :** la peau part, **la signature ne change pas.** `Props`
porte toujours `isArchitect: boolean`, le site d'appel `UserProfile:1008` compile
sans être touché, et le drapeau est déstructuré en `_dead` avec un
`eslint-disable-next-line @typescript-eslint/no-unused-vars` (vérifié : la
directive est **utilisée**, ESLint 9 aurait signalé une directive inutile).
Le `Props` porte les trois raisons et le mode d'emploi de la suppression finale.

> ⚠️ **À l'orchestrateur : `mode`, `isArchitect` et cette prop peuvent maintenant
> partir ensemble** — la peau qui les justifiait n'existe plus ni chez G ni chez
> moi. C'est un lot de **suppression**, un fichier de plus que les miens
> (`pages/Account.tsx` lit le `?mode=`), donc je ne l'ai pas fait.

### Le geste destructeur
`Button variant="danger"`, et **jamais la figue**. Il rendait un `bg-red-600`
aplati (blanc sur rouge) dans une ligne `p-4 rounded-xl justify-between` ; il rend
maintenant le `danger` du kit — `border-red-200 bg-paper text-red-700`, mesuré au
navigateur : `oklch(0.505 0.213 27.518)` sur `rgb(251,248,250)`, contour
`oklch(0.885 0.062 18.334)`. **Non adouci** : c'est la valeur du kit, celle que
`UserProfile` attendait explicitement en retirant le rouge de « Sign out » juste
au-dessus. Les trois autres boutons du parcours sont rangés par ce qu'ils font :
`danger` pour l'escalade (« I understand, continue », un `bg-red-600` maison
avant), `danger` pour la destruction, `ghost` pour « Cancel », `secondary` partout
ailleurs.

### ⚠️ La décision qui demande votre accord : **aucune figue dans ce fichier**
Deux raisons cumulées, et la seconde compte plus que la première :
1. **La contrainte du kit.** L'onglet « Settings » qui est **derrière** ce voile a
   déjà dépensé sa figue sur « Save » (`UserProfile:966`, commentée « l'action
   marquée de CET onglet, et la seule »). Mesuré à 1280 px : `Save` est le seul
   `bg-fig-700` de la vue rendue, et la fenêtre de suppression laisse voir les
   deux bords du panneau — ce n'est pas un autre écran pour le lecteur.
2. **La teinte de marque ne doit pas mener un parcours irréversible.** Les seuls
   boutons marqués du parcours sont **rouges**. Deux choix de même poids se
   départagent par leur **ordre** et leur libellé : « Download my data first »
   est offert le premier parce que c'est le seul geste qui ne pourra plus être
   fait après.

### ⚠️ La fenêtre n'est PAS `ui/Modal`, et c'est un choix contraint
`ui/Modal` appelle `onClose` sur Échap **et** sur le voile, sans condition, et
rend toujours son bouton « Close ». Or la fermeture est **gardée deux fois** ici :
pas pendant l'appel réseau (`deleteLoading`), et **pas du tout** à l'étape `done`,
où la seule sortie doit passer par `handleAfterDeletion` (révocation de la session
locale + navigation). Avec le kit, **Échap à l'étape `done` laisserait un compte
supprimé connecté jusqu'au rechargement** : c'est un changement de garde, donc
hors de mon périmètre. La fenêtre a donc été **rhabillée sur place** aux valeurs
de `ui/Modal` (voile `bg-ink/40`, `rounded-fiche`, fronton `paper-2` + trait
`line`, corps `p-4`).
→ **Besoin de kit signalé au §6.**

### Les primitives locales supprimées
| avant (six classes maison, toutes branchées sur `isArchitect`) | après |
|---|---|
| `cardClass` (`p-4 rounded-xl border bg-slate-50`) | `ui/Card` |
| `labelClass` (`text-xs font-medium text-slate-500`) | l'étiquette de `ui/Field` (`text-label`) |
| `inputClass` **local** (`rounded-lg text-sm focus:border-blue-500`) | `inputClass` **importé** de `ui/Field` |
| `primaryBtn` (`rounded-lg text-xs font-bold bg-slate-900`) | `ui/Button` |
| `mutedText` (`text-slate-500`) | `ink-soft` |
| `errorBox` (`border-red-100 text-red-600 bg-red-50`) | `red-200` / `red-50` / `red-700` |
| le `h3` `text-xs tracking-widest text-slate-400` (**2,8:1**) | `ui/Card.SectionLabel` → **l'équerre**, mesurée : 11 px, +1,1 px, `padding-left: 18px` |
| la carte ambre maison (`border-amber-100 text-amber-900`) | `Card tone="warning"` (un état qui porte un fait, audit §5.2) |
| le lien d'archive en **émeraude pleine** | `buttonClass("secondary","md","w-full")` sur l'`<a download>` |

**Trois défauts corrigés au passage, tous mesurés au navigateur :**
- les **trois champs** (deux mots de passe + le mot de confirmation) faisaient
  14 px et portaient `focus:border-blue-500`, c'est-à-dire l'anneau de focus dans
  la teinte de `Badge tone="info"`. Mesuré après : **16 px** (`font-size: 16px` à
  320 px), bordure `rgb(142,120,134)` = `line-strong`, anneau `fig-600` ;
- les `<label>` n'avaient **aucun `htmlFor`** : cliquer sur l'étiquette ne donnait
  pas le focus et un lecteur d'écran annonçait un champ sans nom. Trois `id`
  ajoutés (`account-export-password`, `account-delete-password`,
  `account-delete-word`), vérifiés au rendu ;
- **la case à cocher du foyer n'avait aucune classe** — donc elle était rendue en
  **bleu système**, la teinte d'`info`. C'est la case la plus lourde du produit
  (elle décide si la place d'une personne dans un foyer disparaît avec son
  compte). Elle porte `accent-ink` : mesuré `accent-color: rgb(35,25,31)`.
- la croix de fermeture n'avait **pas d'`aria-label`** ; ajouté.

---

## 3. Les quatre autres fichiers

**`DeletionPendingScreen.tsx`** — l'audit le comptait à **zéro** parce qu'il ne
cherchait que `gray-*` : cet écran était en `stone-*` avec un fond
**`bg-[#f7f6f2]` écrit en dur**, un `rounded-[28px]` et une ombre de 90 px.
Onze neutres et quatre rayons passés à la charte ; la fiche est
`rounded-fiche border-line bg-paper-2` (l'idiome de `/auth`), le `h1` passe en
`font-display text-title` **sans graisse** (Young Serif n'a qu'un poids), la
boîte d'icône devient une **boîte tracée** (`line-strong`) au lieu d'un aplat
`stone-100`, `p-8` descend à `p-6` sous `sm` (32 px de marge ne laissaient que
256 px de mesure à 320 px), et les deux boutons recopiés à la main deviennent
`Button` : `primary` sur « Restore my account » — **l'action que cet écran existe
pour offrir, et la seule figue de la vue** — `secondary` sur « Sign out », les
deux à `min-h-11` (44 px, la cible tactile confortable de l'original ; le `md` du
kit est à ~36 px, et un `py-3` aurait perdu contre celui de la primitive).

**`ShoppingListPanel.tsx`** — 16 neutres, dont **deux sous le seuil** : le titre
de rayon en `gray-400` (**2,8:1**) devient `text-label` + `ink-soft` (6,11:1), et
la quantité rayée en `gray-300` (**1,7:1**) disparaît — la rature est portée par
le `line-through` du parent, **vérifié à la capture** : la barre traverse le terme
**et** la quantité. `divide-gray-100` → `divide-line`, mesuré 1 px
`rgb(227,218,224)`. Le lien du PDF passe à la **figue** (`fig-700`, 9,98:1) : la
charte y fait passer les liens, et il héritait d'`ink` jusqu'ici. `red-600` →
`red-700`. **La case à cocher** perd `rounded border-gray-300` (inertes : sans
`@tailwindcss/forms` l'`appearance` reste native) et prend `accent-ink` +
l'anneau `fig-600` — mesuré `accent-color: rgb(35,25,31)`, 16×16.

**`CookingSessions.tsx`** — 13 neutres, **zéro saturée avant comme après** : cette
fenêtre ne rend aucun état. Le déclencheur « Recipe » reste **neutre et souligné**
(la forme que `ui/Modal` emploie pour sa propre fermeture) plutôt que figue :
déplier une recette n'est ni une navigation ni l'action principale de la fenêtre,
et le soulignement porte l'affordance. Le commentaire de tête interdit désormais
d'y introduire une teinte pour distinguer les sessions entre elles.

**`TakeTheHandCard.tsx`** — 4 neutres ; le `red-700` du refus **reste** (c'est un
fait). ⚠️ **Son bouton passe de `primary` à `secondary`**, et c'est la contrainte
du kit : sur `/app/plan`, la figue est déjà prise par « composer la semaine »
(`MealBuilder:740`, `type="submit"`), et les deux sont rendus **ensemble** dès
qu'on rouvre le formulaire au-dessus d'un plan existant — `showForm` ne dépend pas
de cette carte. L'audit ne l'avait pas vu parce que son recensement des `primary`
se faisait **par page**, et ces deux boutons vivent dans deux composants.

---

## 4. Avant / après, **mesuré hors commentaires**

Compté par un script qui retire `//`, `/* */` et `{/* */}` (les greps naïfs
comptaient mes propres commentaires). « avant » = `git show HEAD:<chemin>`.

| fichier | `gray/slate/stone` | saturées | rayons divergents |
|---|---|---|---|
| `DataPrivacySection.tsx` | **37 → 0** | **45 → 9** | `lg`×14 `xl`×4 `2xl`×1 → **0** |
| `DeletionPendingScreen.tsx` | **11 → 0** | 3 → 3 | `[28px]`×1 `2xl`×3 `xl`×1 → **0** |
| `KeelBadges.tsx` | **5 → 0** | **17 → 1** | `rounded` nu ×2 → **0** |
| `ShoppingListPanel.tsx` | **16 → 0** | 1 → 1 | `rounded` nu ×1 → **0** |
| `CookingSessions.tsx` | **13 → 0** | 0 → 0 | — |
| `TakeTheHandCard.tsx` | **4 → 0** | 1 → 1 | — |
| **total** | **86 → 0** | **67 → 15** | **26 → 0** |

**Les 15 saturées qui restent portent toutes un fait** : 6 bandeaux/boutons rouges
(échec, refus, geste irréversible), 1 `text-emerald-700` (« Done » : la demande a
été enregistrée), 2 ambres (`Card tone="warning"` « ce qui est conservé », et
« fait au mauvais moment »), et les valeurs de contour associées. **Zéro `violet`,
zéro `sky`, zéro `rose`, zéro `blue` décoratif, zéro figue dans une pastille.**

Rayons après : `rounded-card`×5, `rounded-fiche`×2, `rounded-full`×1 — plus les
`rounded-full` que les primitives posent elles-mêmes.

---

## 5. Vérifié au rendu

Session posée par `qa-session.sh house` (`ff060_house@example.com`), plus un jeton
frappé à la main pour `ff060_spouse@example.com` — un membre de foyer **non
maître**, trouvé par un `SELECT` en lecture seule — parce qu'aucun des quatre
personas du script n'atteint la branche « prendre la main ».

| écran | à 320 px | à 1280 px |
|---|---|---|
| `/account?tab=settings` | `scrollWidth` **320**, équerre « MY DATA » (11 px, +1,1 px, `pl:18px`), `Card` `paper`/`line-strong`/12 px, « Delete my account » **rouge** 415→287 px de large, champ d'export **16 px** | `scrollWidth` **1280**, `Save` est le **seul** `bg-fig-700` de la vue |
| la fenêtre de suppression | voile `oklab(… /0.4)` = `ink/40`, dialogue 288 px, `rounded-fiche` 16 px, **le corps défile en interne** (`936` de contenu dans `753`) et « Cancel » est atteignable | dialogue 448 px, capture jointe : même langage de fiche que le panneau |
| `/app/today` | `StatusBadge` `unknown` rendu par le kit : `bg-line text-ink-soft`, `rounded-full`, 12 px (les cinq autres statuts sont absents des données de ce persona ; les cinq tons du kit résolvent bien, vérifiés un à un) | — |
| `/app/plan` — liste de courses | rayon 11 px `ink-soft`, cases `accent-color: rgb(35,25,31)`, séparateurs 1 px `line`, **rature traversant terme et quantité** (capture) | — |
| `/app/plan` — sessions de cuisine | corps `ink`, métadonnées `ink-soft`, séparateurs `line`, « Recipe » souligné `ink-soft` | — |
| `/app/plan` — prendre la main | branche **maître** : `ink-soft` sur carte pointillée `line-strong`/12 px, `ButtonLink` `sm` à 24 px (le plancher WCAG du kit) ; branche **non-maître** : équerre + `ink-soft`, **aucun bouton** (`plan === null`), et **un seul `bg-fig-700` dans la vue** — « Compose » | — |

Aucun débordement horizontal (`scrollWidth === clientWidth`) sur aucune des deux
largeurs, sur aucun des trois écrans.

**Non atteint, et je le dis plutôt que de le supposer :** la branche « non-maître
**avec** un plan non validé » — celle qui rend le bouton que j'ai démoté. Elle
demande de générer un plan pour ce compte (un appel de modèle), ce qui sort du
lot. Le changement porte sur un seul jeton de variante, et `secondary` a été
mesuré sur cinq autres boutons de la même session.

---

## 6. Ce que je signale, et n'ai pas réparé

**Besoin de kit (l'orchestrateur seul peut le faire) :**
1. **`ui/Modal` a besoin d'être refusable.** Un `dismissible?: boolean` (ou un
   `onClose` qu'on laisse décider) et un `closeLabel?: null` permettraient à la
   fenêtre de suppression d'utiliser le kit sans perdre ses deux gardes. En
   l'état, ce dialogue reste sans Échap, sans verrou de défilement, sans focus
   entrant et sans `role="dialog"`/`aria-modal` — quatre manques hérités, pas
   introduits.
2. **`ui/Badge` n'a pas de marque creuse.** C'est ce qui force
   `met`/`flex_used` et `unknown`/`not_applicable` à se confondre par paires ici,
   là où `WeekView` les distingue par la géométrie. Un `variant="ring"` fermerait
   l'écart. **À ne pas faire à la légère** : ça touche la forme qui porte la garde
   du chantier.

**Défauts fonctionnels et reliquats (signalés, pas réparés) :**
3. **`mode` / `isArchitect` / la prop sont prêts à être supprimés ensemble** —
   plus aucune peau ne les justifie (voir §2). Touche `pages/Account.tsx`,
   `components/UserProfile.tsx` et `DataPrivacySection.tsx`.
4. **`DataPrivacySection` et `DeletionPendingScreen` sont entièrement en anglais
   en dur**, dans un produit bilingue : ~40 phrases, dont « in 7 days » que
   `formatDeletionDate` rend quand la date manque, et le nom
   `frenchExportError()` qui rend des chaînes anglaises. Mesuré au rendu :
   le persona `ff060_spouse` a `/app/plan` **en français** et `/account` **en
   anglais**, dans la même session. C'est un lot de traduction.
5. **Les bandeaux d'erreur n'ont pas de `role="alert"`** (les trois de mes deux
   fichiers de compte) : ils apparaissent après un clic, donc ne sont pas annoncés.
   Même remarque que `ui/Field`, et la même raison de ne pas le faire seul.
6. **`ui/Card.SectionLabel` rend un `<h2>`** : la conversion du `h3` « My data » a
   donc changé le niveau du titre. C'est **cohérent** ici — « Preferences » juste
   au-dessus est déjà un `SectionLabel`, et le panneau n'a pas de `h1` — mais
   `UserProfile` rend un `<h2>` pour le nom du compte (ligne 438) : trois `h2` de
   rôles différents dans le même panneau. Ordre correct, sémantique perfectible.
7. **`MealBuilder` rend `variant="primary"` sur les DEUX boutons d'onglet** du
   contrôle segmenté (lignes 776 et 818, fichier de la famille C). C'est
   défendable — la charte donne la marque au **lien actif**, donc à l'onglet
   sélectionné — mais un seul des deux est actif à la fois, donc il n'y a jamais
   deux aplats : **rien à corriger, je le note pour que la review ne le compte pas
   comme une violation.**

**Suite verte, sauf trois rouges qui ne sont pas à moi :** `npx tsc -b` **passe
sur tout le frontend**, `eslint` passe sur mes six fichiers. `vitest` :
`816 passed, 3 failed` — `src/edge/coverage-guard.int.test.ts` (×2, sur
`supabase/functions/*` modifiés par d'autres sessions) et
`src/keel/copy/planRefusals.int.test.ts` (les clés `household.error.*`, avec
`keel/pages/HouseholdPage.tsx` modifié par une autre session). Aucun des trois ne
touche mes fichiers. **Consigné, pas réparé.**

**Ce qui restait laid et que je n'ai pas réglé :** dans `CookingSessions`, le
déclencheur « Recipe » de la première préparation passe à la ligne quand le titre
et le nombre de portions remplissent la rangée (`flex-wrap justify-between`), là
où les suivants restent à droite. C'est du ressort de la mise en page du composant
et pas de la charte ; le corriger demanderait de repenser cette rangée, ce qui
déplace la lecture d'un écran qui n'est pas en cause.
