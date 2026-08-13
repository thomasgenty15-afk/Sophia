# REVUE 2 — LA RÈGLE DE COULEUR

> Mesuré au rendu, dans le navigateur, sur `http://revue2.localhost:5191` et
> `http://[::1]:5191` (deux origines, deux `localStorage`), à **1280 px** et à
> **320 px**. Aucun fichier de `frontend/` n'a été modifié. Aucun commit.
>
> ⚠️ **UN DÉFAUT DE MÉTHODE A ÉTÉ TROUVÉ ET CORRIGÉ EN COURS DE ROUTE, ET IL
> INVALIDE TOUTE MESURE DE COULEUR QUI NE LE CONNAÎT PAS.** Tailwind 4 rend sa
> palette intégrée en **`oklch()`**, pas en `rgb()` : `text-red-700` calcule
> `oklch(0.505 0.213 27.518)`. Les jetons de `tokens.css` (`fig-*`, `paper`,
> `ink`…) sont posés en hex et calculent en `rgb()`. **Un relevé qui parse
> `/rgba?\(/` voit donc toute la charte et AUCUNE couleur d'état** — il rend
> « zéro saturée » sur un écran qui en porte six. Mon premier passage a fait
> exactement ça. Les chiffres ci-dessous viennent du second, qui convertit toute
> couleur calculée en sRGB par un `canvas` 1×1 avant de la classer.
> **À quiconque remesure : c'est le premier piège, et il est silencieux.**

---

## 1. LE VERDICT

### Reste-t-il une saturée qui n'est pas un état ?

**Parmi les couleurs RÉELLEMENT RENDUES sur les dix-huit surfaces visitées :
NON. Aucune.** Dix valeurs saturées se calculent à l'écran, toutes dans trois des
quatre familles, toutes attachées à un fait nommable. Zéro violet, zéro `sky`,
zéro `rose`, zéro `lime`, zéro `orange`, zéro `teal`, zéro `cyan`, zéro `indigo`
— ni au rendu, ni dans le code vivant des 59 fichiers de la surface.

### Mais OUI dans le code vivant et atteignable, et c'est le bleu

**Cinq sites rendent une pastille `Badge tone="info"` sur quelque chose qui n'est
pas un état du système.** Aucun n'a pu être rendu avec les données locales (les
personas n'ont ni ligne « own week », ni contrainte déclarée par un coach, ni
aliment retenu), mais les cinq sont du code vivant, non gardé, sur des chemins
nominaux. Ce sont des **bloqueurs**, et il faut les tenir pour tels : la revue
mesure le rendu, elle ne peut pas déclarer sûr ce que le jeu de données a
seulement caché.

| # | fichier:ligne | ce que la pastille bleue porte | classement |
|---|---|---|---|
| B1 | `frontend/src/keel/pages/TodayPage.tsx:392` | `tone={item.kind === "nutrition" ? "info" : "neutral"}` → « De la méthode de ton coach » vs « Proposé par Sophia ». C'est une **PROVENANCE** | **BLOQUEUR** |
| B2 | `frontend/src/keel/pages/TodayPage.tsx:259` | `tone="info"` sur « Ta semaine » — un **titre de carte**. Aucun état | **BLOQUEUR** |
| B3 | `frontend/src/keel/pages/CoachProtocolPage.tsx:1106` | `<Badge tone="info">{pickedCount}</Badge>` — un **CHIFFRE** dans une pastille d'état | **BLOQUEUR** |
| B4 | `frontend/src/keel/components/StudentConstraintsCard.tsx:138` | `tone="info">You added this` — **provenance** (`declared_by === "coach"`) | **BLOQUEUR** |
| B5 | `frontend/src/keel/pages/StudentHealthPage.tsx:271-274` | `tone="info">{t("health.list.declared_by_coach")}` — la même provenance, vue d'en face | **BLOQUEUR** |

**Pourquoi ce sont des bloqueurs, mot pour mot selon le critère du chantier.**
Une provenance est une **marque** (qui a écrit la ligne). Un titre de carte est
une **catégorie**. `pickedCount` est un **chiffre**. Le critère de §5.2 les
exclut nommément tous les trois. Et le kit est encore plus précis contre eux :
`ui/Badge.tsx` définit `info` comme **« pending »** — or « De la méthode de ton
coach » n'est pas en attente de quoi que ce soit, et « 3 » encore moins.

**Et c'est une récidive exacte, pas une nuance.** Ce lot a supprimé
`KeelBadges.PriorityBadge` en écrivant « un RANG n'est pas un état du système ;
il n'a donc pas de pastille, il a une forme », et retiré les neuf teintes de
`ActivityChip` en écrivant « une famille est un DOMAINE, pas un état ». Une
**source** est de la même espèce qu'un domaine et qu'un rang. Les cinq sites
ci-dessus sont les seuls endroits du produit où cette leçon n'a pas été
appliquée — et ils sont tous sur la quatrième famille, celle que le brief
d'origine avait oubliée. La famille qu'on a rajoutée à la liste est la seule qui
serve encore de décor.

**Le geste, et il est petit :** `tone="info"` → `tone="neutral"` sur les cinq.
Le MOT porte déjà tout (« De la méthode de ton coach », « You added this »,
« Ta semaine ») ; c'est l'argument que `KeelBadges` emploie lui-même pour
justifier que `met` et `flex_used` partagent `positive` (« ce qui les sépare ici
est LE MOT »). Pour B3, la réponse est le neutre aussi — le compte n'est pas un
état, il est un compte.

⚠️ **Conséquence de couloir :** une fois les cinq passés au neutre, **`info`
(bleu) n'a plus aucun consommateur décoratif** et il ne reste que trois emplois
légitimes (`coach.billing.status_trialing`, `coach_clients.status='invited'`,
`trialActive` de `UserProfile`) — tous « en attente », donc tous justes. Le bleu
redevient lisible.

---

## 2. INVENTAIRE DES SATURÉES RENDUES, ÉCRAN PAR ÉCRAN

Relevé des couleurs **calculées** (`getComputedStyle` → sRGB), sur tous les nœuds
posés (`getBoundingClientRect` non nul), donc y compris hors de la fenêtre —
aucune dépendance au scroll. Les six neutres de la charte (`paper`, `paper-2`,
`ink`, `ink-soft`, `line`, `line-strong`) sont exclus du tableau : ils portent la
teinte de marque à 8-27 % de saturation par construction (charte §2) et ne sont
pas des couleurs.

| écran | teinte calculée | élément | le fait qu'elle porte | fichier:ligne |
|---|---|---|---|---|
| `/app/today` | — | — | *aucune saturée rendue* : les 6 lignes du plan sont en `unknown`, donc `Badge tone="neutral"` (`bg-line`) | — |
| `/app/plan` | — | — | *aucune* | — |
| `/app/progress` | — | — | *aucune* | — |
| `/app/health` | — | — | *aucune* (ce persona n'a aucune ligne `student_safety_constraints`) | — |
| `/app/household` | `#FEF2F2` + `#C10007` (red-50/700) | `Badge tone="critical"` « peanut », pastille `rounded-full` | **OUI** — une allergie rejoint l'union de sécurité du générateur : rien ne se compose si on ne peut pas la lire. C'est un refus | `keel/pages/HouseholdPage.tsx:1246` |
| `/app/household` | `#C10007` (red-700) | texte « Les propositions n'ont pas pu… » | **OUI** — échec de lecture serveur | `keel/pages/HouseholdPage.tsx:1927` |
| `/app/chat` | — | — | *aucune* | — |
| `/account` | — | — | *aucune* | — |
| `/upgrade` | — | — | *aucune* (le bloc `fig-950` est de la charte, pas un état) | — |
| `/coach` | `#ECFDF5` + `#007A55` (emerald-50/700) | `Badge tone="positive"` « Active » | **OUI** — état du lien `coach_clients.status` | `keel/pages/CoachHomePage.tsx:821` + `838-843` |
| `/coach` | `#FEF2F2` + `#C10007` | `Badge tone="critical"` « Held » | **OUI** — escalade ouverte : `generate-week-plan-v1` ne produit **rien** pour cet élève tant que le coach n'a pas décidé. C'est un refus du système | `keel/pages/CoachHomePage.tsx:425` |
| `/coach` | `#FEF2F2` + `#C10007` | `Badge tone="critical"` « Silent » | **DISCUTABLE — voir §5** : c'est un état calculé, donc pas de la décoration ; mais la **famille** est fausse | `keel/pages/CoachHomePage.tsx:125` + `815` |
| `/coach/templates` | `#FEF2F2` + `#C10007` | 2 bandeaux « The vocabularies could not be… », « Your library could not be loaded » | **OUI** — échecs de chargement | `keel/pages/TemplatesPage.tsx:596` et `601` |
| `/coach/import` | `#FEF2F2` + `#C10007` | 1 bandeau « The vocabularies could not be… » | **OUI** — échec | `keel/pages/PlanImportPage.tsx:1167` |
| `/coach/doctrine` | `#FFFBEB` + `#FEE685` (amber-50/200) | `Card tone="warning"` « We could not read your doctrine » | **OUI** — avertissement, surface autorisée par §5.2 | `keel/components/ui/Card.tsx:41` ← `CoachDoctrinePage` |
| `/coach/billing` | `#FFFBEB` + `#FEE685` + `#7B3306` (amber-900) | `Card tone="warning"` + son texte | **OUI** — avertissement | `keel/components/ui/Card.tsx:41` · `keel/pages/CoachBillingPage.tsx:220` |
| `/coach/weekly` | — | — | *aucune* | — |
| `/coach/protocol` | — | — | *aucune* (aucun `coach_food_proposals` ni `coach_food_items` pour ce coach) | — |
| `/coach/meals` | — | — | *aucune* | — |
| `/coach/clients/:id` | `#00BC7D` (emerald-500) | disque plein 12×12 `rounded-full`, légende « Met » | **OUI** — statut dérivé | `keel/components/WeekView.tsx:590` |
| `/coach/clients/:id` | `#FFB900` (amber-400) | disque plein 12×12, « Partial » | **OUI** | `keel/components/WeekView.tsx:591` |
| `/coach/clients/:id` | `#FB2C36` (red-500) | disque plein 12×12, « Missed » | **OUI** | `keel/components/WeekView.tsx:592` |
| `/coach/clients/:id` | `#00BC7D` en **bordure seule** | anneau creux 12×12 (contour 2 px, intérieur 8 px de `paper`), « Flex used » | **OUI** | `keel/components/WeekView.tsx:594` |
| `/coach/clients/:id` | *neutre* | barre 12×2 `line-strong` (« Not counted ») et disque `line` (« Unknown ») | s.o. — délibérément hors des quatre familles | `keel/components/WeekView.tsx:589` et `593` |

**Total : 10 valeurs saturées distinctes rendues sur 18 surfaces.** Trois
familles sur quatre. **Le bleu n'a jamais été rendu** — ni comme état, ni comme
décor : les cinq bloqueurs de §1 sont tous restés derrière une condition de
données.

**Deux composites neutres à ne pas prendre pour des saturées** (mon premier
relevé les a signalés à tort) : `bg-ink/40` du voile de `/account` calcule
`#23191E` et `bg-paper/90` de l'en-tête de `/upgrade` calcule `#FBF8F9`. Ce sont
des jetons de la charte à alpha, pas des couleurs neuves.

### Le code vivant, au-delà de ce que les données ont montré

**152 lignes** portent encore une classe saturée dans les 59 fichiers,
commentaires retirés, pour **225 occurrences de classe**. Répartition par
famille : **rouge 81 · ambre 97 · émeraude 44 · bleu 3** — et **rien d'autre**.
Reproductible :

```bash
cd frontend/src && perl -0777 -pe 's{/\*.*?\*/}{ my $x=$&; $x =~ s/[^\n]/ /g; $x }gse; s{//[^\n]*}{}g' <fichier> \
  | grep -nE '(emerald|green|red|rose|amber|yellow|orange|blue|sky|indigo|violet|purple|fuchsia|pink|teal|cyan|lime)-[0-9]{2,3}'
```

⚠️ **Le blanchiment des commentaires doit préserver les retours à la ligne.** La
version qui les supprime (`s{/\*.*?\*/}{}gs`) décale tous les numéros de ligne du
fichier le mieux documenté — et c'est le piège dont ce dépôt a déjà une mémoire.

Les 3 occurrences bleues sont `ui/Badge.tsx:39` (la définition du ton `info`) et
`CommitmentLine.tsx:275` (`text-blue-700` sur « couvert par un écart déclaré » —
qui est bien de l'info : la ligne n'est ni tenue ni manquée). Les cinq bloqueurs
de §1 n'apparaissent pas dans ce grep : ils passent par `tone="info"`, donc par
le kit, et non par une classe écrite sur place. **Une mesure de couleur qui ne
grep que les classes rate donc entièrement cette faute** — il faut aussi
inventorier les `tone=` des appels de `Badge` et de `Card`.

Sur les 222 occurrences non-bleues, j'ai lu le contexte de chacune : **toutes portent un
échec de requête, un refus serveur, un enregistrement confirmé, une valeur
manquante que quelqu'un doit combler, ou un verdict dérivé.** Les quatre foyers
de fautes de l'audit (§2.1 `SetupAccent`, §2.2 l'échelle de priorité
lime/orange/amber, §2.3 la surface `sky-50` décorative, §2.4 le violet) **ont
tous disparu du code vivant** — vérifié par grep hors commentaires.

---

## 3. LA GARDE : UNE FIGUE EST-ELLE ENTRÉE DANS UNE PASTILLE D'ÉTAT ?

**NON. La garde tient, aux deux bouts.**

**Côté code** — aucun `fig-*` ne remplit une pastille d'état. Les trois tables
qui définissent les marques d'état sont propres :

- `keel/components/ui/Badge.tsx:36-42` — 5 tons, zéro `fig-*`.
- `keel/components/WeekView.tsx:588-595` (`DOT_STYLE`) — 6 marques, zéro `fig-*`.
- `keel/components/KeelBadges.tsx:51-65` (`STATUS_TONE`) — 6 statuts, aucun style
  propre : il délègue à `Badge`. Il ne peut donc plus dériver.

Le seul `fig-*` de `WeekView.tsx` est ligne **165** : `rounded-full px-3 py-1
text-xs text-fig-700 underline hover:bg-fig-50` — « revenir à la semaine en
cours ». **Encre figue, pas de remplissage.** C'est un lien de navigation dans un
nœud `rounded-full` sans aplat : la forme qui porte la garde est le
**REMPLISSAGE**, pas le rayon, et il n'y en a pas.

**Côté rendu** — j'ai relevé tout nœud dont `borderRadius` vaut `9999px` **et**
dont le fond calculé est l'un des sept jetons figue, sur les 18 surfaces. Sept
familles de nœuds sortent, et **chacune a droit au rayon** :

| nœud rendu | ce que c'est | droit au `rounded-full` |
|---|---|---|
| `ShellLink` actif, `bg-fig-700` | onglet de navigation | oui — contrôle |
| libellé de l'onglet du bas actif, `bg-fig-700` | onglet de navigation | oui — contrôle |
| `MenuLink` actif, `bg-fig-700` (`rounded-card`) | entrée de menu | oui, et ce n'est même pas `full` |
| `Button variant="primary"` | action | oui — bouton |
| chip de portée de `/coach/doctrine` et `/coach/protocol` | contrôle de choix (`aria-pressed`) | oui |
| « 7 jours » de `/app/progress`, interrupteur de fuseau de `/account` (`UserProfile.tsx:945-947`) | contrôles de choix | oui |
| avatar de `/account`, `bg-fig-100 text-fig-700`, 40×40 (`UserProfile.tsx:425`) | avatar | oui — nommément |

**Aucune de ces sept n'est une pastille d'état.** Et symétriquement : les 6
pastilles d'état effectivement rendues (« peanut », « Held », « Silent »,
« Active », et les 4 marques de la grille de `WeekView`) sont toutes en
emerald/amber/red. Les deux vocabulaires ne se touchent pas.

---

## 4. LES APLATS FIGUE PAR VUE RENDUE

Un « aplat » = un nœud posé, visible, dont le **fond calculé** est `fig-700`
`#632C4C`, `fig-800` `#4A2039` ou `fig-950` `#24101E`.

### À 1280 × 900

| écran | aplats | ce qu'ils sont |
|---|---:|---|
| `/app/today` (au repos) | **1** | onglet nav « Aujourd'hui » |
| **`/app/today`, dialogue d'écart ouvert** | **4** | onglet nav « Aujourd'hui » · chip « Repas dehors » · chip « Aujourd'hui » · bouton « Déclarer » |
| `/app/plan` | 1 | onglet nav |
| `/app/progress` | 2 | onglet nav + « 7 jours » |
| `/app/health` | 2 | onglet nav + « Ajouter » |
| `/app/household` | 2 | onglet nav + « Composer pour le foyer » (+ 4 liens `text-fig-700` « Modifier », sans aplat) |
| `/app/chat` | 2 | onglet nav + « Envoyer » |
| `/account` | 2 | onglet « Account » + « Save » (+ avatar `fig-100`, + interrupteur `fig-700` quand il est armé) |
| `/upgrade` | 1 | le bloc sombre `fig-950` — pas un bouton, c'est « le bloc sombre, un seul par page » de la charte |
| `/coach` | 2 | onglet nav « Students » + « Invite a student » |
| `/coach/doctrine` | 2 | onglet nav + chip de portée « Fat loss » |
| `/coach/weekly` | 1 | onglet nav |
| `/coach/protocol` | 2 | onglet nav + chip de portée « Fat loss » |
| `/coach/meals` | 2 | onglet nav + « Add it to the library » |
| `/coach/templates` | 0 | (écran en erreur de chargement) |
| `/coach/billing` | 0 | (idem) |
| `/coach/import` | 1 | « Decompose the plan » |
| `/coach/clients/:id` | 1 | « Save » de la note (+ lien texte « Back ») |

### À 320 × 760

La barre du haut passe `hidden` sous `lg`, la barre du bas la remplace côté
élève, et le coach n'en a pas :

| écran | aplats |
|---|---:|
| `/app/today` (au repos) | 1 (onglet du bas) |
| **`/app/today`, dialogue ouvert** | **4** (position mesurée : y = 14, 444, 505, 679 — les quatre tiennent dans la fenêtre) |
| `/app/plan` · `/app/health` · `/app/household` | 1 |
| `/app/progress` · `/app/chat` | 2 |
| `/coach` · `/coach/import` · `/coach/clients/:id` | 1 |
| `/coach/templates` · `/coach/doctrine` · `/coach/billing` | 0 |

**Aucun débordement horizontal** : `document.documentElement.scrollWidth ===
innerWidth` sur les 18 surfaces, aux deux largeurs.

**Le régime normal est donc 1 onglet de navigation + 1 action = 2 aplats**, ce
qui est exactement la règle (« la teinte marque la NAVIGATION *et* l'ACTION ») et
se lit sans ambiguïté : l'un est dans la barre, l'autre dans la page. **La seule
vue hors budget est `/app/today` avec le dialogue d'écart, à 4** — voir §5,
point 1.

---

## 5. LES HUIT POINTS CHAUDS, UN PAR UN

### 1. `primary` passée à la figue — « une seule par vue rendue »

**Tenu partout sauf à un endroit, et il est mesuré.** Sur 17 des 18 surfaces,
au plus une action figue est rendue en même temps que l'onglet de navigation.

**`/app/today`, dialogue d'écart ouvert : 4 aplats figue simultanés**, aux deux
largeurs. Trois sont dans le dialogue, et **deux des trois ne sont pas des
actions** : `DeviationDialog.tsx:82-83` rend le choix sélectionné par
`variant="primary"`, donc le motif « Repas dehors » et la date « Aujourd'hui »
sont deux aplats de marque qui **disent une valeur, pas un geste**. Le troisième,
« Déclarer », est la vraie action.

Et le résultat concret est pire que le compte : **le chip de date sélectionné
porte le mot « Aujourd'hui » en `paper` sur `fig-700`, et l'onglet de navigation
actif porte le mot « Aujourd'hui » en `paper` sur `fig-700`.** Deux objets
identiques au pixel, deux sens sans rapport, dans la même fenêtre. À 320 px ils
sont à 430 px l'un de l'autre.

**Ce que je conteste, précisément :** le commentaire de `DeviationDialog.tsx:201-204`
affirme « l'action figue de cet écran, et la seule. `/app/today` en rendait zéro
dans cet état : le budget d'une action de marque par vue est donc tenu ». Le
raisonnement compte les `variant="primary"` **explicites de la page** et oublie
(a) ceux que le composant fabrique lui-même par `chip()`, (b) l'onglet du shell.
Le budget n'est pas tenu : il est dépassé de 3.

**Le geste :** un choix sélectionné n'est pas une action principale. `aria-pressed`
est déjà là et porte l'état pour le lecteur d'écran ; visuellement, la sélection
peut se dire par le trait (contour `line-strong` → contour `fig-700` sans aplat)
ou par le remplissage neutre `fig-50`. La figue reste sur « Déclarer ».
**Sans ça, le geste le plus important de l'écran a le même poids visuel que
le choix « Repas dehors ».**

### 2. Le compteur de non-lus reste neutre dans ses quatre emplacements

**VÉRIFIÉ. Aucune figue, y compris sur l'onglet actif.** Les quatre appels de
`UnreadBadge` passent `bg-ink text-paper` (barre du haut inactive, bouton Menu,
menu, barre du bas + `ring-2 ring-paper`) ou `bg-paper text-ink` (barre du haut
et menu **actifs**, où le badge s'inverse pour rester visible sur `fig-700`).

Les trois combinaisons rendues, mesurées dans la page réelle :

| classe rendue | fond calculé | encre | est-ce une figue ? |
|---|---|---|---|
| `… rounded-full … bg-ink text-paper` | `#23191F` (`ink`) | `#FBF8FA` | **non** |
| `… rounded-full … bg-paper text-ink` | `#FBF8FA` (`paper`) | `#23191F` | **non** |
| `… bg-ink text-paper ring-2 ring-paper` | `#23191F` | `#FBF8FA` | **non** |

Le compteur n'a pas pu être rendu en situation (`getUnreadCount()` vaut 0 pour
ce persona) ; les trois classes ont donc été injectées **dans la page vivante**
et mesurées là. Le résultat est le même que la lecture du code
(`KeelAppShell.tsx:304, 398, 447-449, 590-592`), et la définition unique du badge
(`464-483`) garantit qu'il n'y a pas de cinquième emplacement.

**C'est juste, et pour la raison écrite ligne 445 :** un chiffre n'est ni une
navigation ni une action. Un badge figue sur un onglet figue serait en plus
invisible — le fichier le dit et le mesure.

### 3. La règle de `WeekView` : teinte = famille du fait, remplissage = ce que le jour devait

**RÈGLE JUSTE, ET C'EST LA MEILLEURE DÉCISION DU LOT.** Rendue et mesurée sur
`/coach/clients/6fa19cca-…` : les six marques de la légende sortent en 12×12,
`met` = disque `#00BC7D`, `partial` = disque `#FFB900`, `missed` = disque
`#FB2C36`, `flex_used` = **anneau** `#00BC7D` (contour 2 px, intérieur 8 px de
`paper`), `not_applicable` = barre 12×2 `line-strong`, `unknown` = disque `line`.

Ce que je valide, et pourquoi :

- **Six statuts sur quatre familles est un problème réel**, et inventer une
  cinquième teinte était la mauvaise sortie. Le second axe devait être une forme.
- **`flex_used` en émeraude creuse est une lecture du code, pas une opinion.**
  `Highlight` compte `met: summary.met + summary.flexUsed` : le modèle range déjà
  la souplesse avec ce qui a tenu. La teinte suit l'arithmétique, l'anneau dit le
  reste. C'est vérifiable, donc défendable.
- **`not_applicable` en barre neutre est cohérent avec ce que `StatusDot` faisait
  déjà** d'une ligne non programmée (un tiret). Deux silences, deux marques du
  même genre.
- **`partial` de `sky` vers ambre** ferme une collision : le bleu appartient à
  `info`. **`missed` de `rose` vers rouge** supprime une cinquième famille à 22°
  de la marque.
- **La légende rend la marque à sa taille réelle** (12 px, et non 8 comme avant).
  C'est indispensable : à 8 px un anneau de 2 px se referme en disque et la
  légende dirait le contraire de la grille. Le commentaire ligne 656-661 a raison
  et la mesure le confirme.

**La seule réserve :** dans la grille, `met` et `flex_used` sont **la même
teinte**, et les distinguer demande de voir un trou de 8 px dans un disque de 12.
Sur sept colonnes à 320 px c'est fin. Le `title` porte le libellé, la légende est
juste en dessous, et le choix survit au daltonisme — donc **acceptable**, mais
c'est le point à re-regarder si un coach se plaint un jour de « ne pas voir la
différence ». Ce n'est pas un défaut de la règle, c'est son coût.

### 4. `KeelBadges` aligné sur `WeekView` — les deux disent-ils la même chose ?

**OUI pour le rendu. NON pour la documentation, et la documentation va faire
défaire le travail.**

Table pour table, `STATUS_TONE` (`KeelBadges.tsx:51-65`) et `DOT_STYLE`
(`WeekView.tsx:588-595`) concordent :

| statut | `KeelBadges` | `WeekView` | même famille ? |
|---|---|---|---|
| `met` | `positive` (émeraude) | disque émeraude | oui |
| `flex_used` | `positive` | **anneau** émeraude | oui — la géométrie diffère, la teinte non |
| `partial` | `caution` (ambre) | disque ambre | oui |
| `missed` | `critical` (rouge) | disque rouge | oui |
| `unknown` | `neutral` | disque `line` | oui |
| `not_applicable` | `neutral` | **barre** `line-strong` | oui |

Le violet et le `sky` ont disparu ; `PriorityBadge` — la pastille de RANG — est
supprimé et son absence est documentée avec ses deux fautes (le faux « ok »
émeraude de `core`, le `sky` volé à `info`). L'écart assumé est bien posé : deux
paires se confondent ici (`met`/`flex_used`, `unknown`/`not_applicable`) parce
que `Badge` n'a ni anneau ni barre, et **c'est le MOT qui les sépare**
(`statusLabel()` est distinct pour les six). Ce raisonnement est le bon, et il est
le même que celui qui justifie de ne pas colorer une provenance — d'où §1.

**⛔ Ce qui ne va pas : `WeekView.tsx:573-581` décrit un monde qui n'existe
plus.** Le commentaire dit encore, au présent :

> « `components/KeelBadges.tsx` porte encore `not_applicable` et `flex_used` en
> `violet-100/700`, plus `partial` en `sky` […] Le même statut est donc pour
> l'instant un anneau émeraude ici et une pastille violette là-bas. La
> réparation est de porter CETTE table dans `KeelBadges.tsx` — un fichier qui
> appartient à un autre lot. »

**C'est faux depuis que `KeelBadges` a été réécrit, le même jour.** Le fichier
n'a plus une seule classe violette. Et ce n'est pas un commentaire périmé
anodin : il **prescrit une réparation déjà faite**, il désigne un fichier
nommément, et il classe la divergence comme « à signaler, pas à réparer ici ». Le
prochain lecteur qui l'ouvre part vérifier une divergence inexistante, ou —
pire — conclut que les deux tables ont bien divergé et en « répare » une.
**C'est exactement le mécanisme que ce dépôt a déjà payé deux fois.** À réécrire
en même temps que la prochaine ligne touchée dans ce fichier.

### 5. `/app/today` : « aujourd'hui » n'est plus peint

**VÉRIFIÉ, et rien ne subsiste.** Aucune saturée ne porte une position dans le
temps, ni sur `/app/today` ni dans les quatre composants de
`keel/components/plan/` :

- `PlanResult.tsx:168` et `:173` distinguent « aujourd'hui » et « passé » **sans
  aucune classe de couleur** — le grep saturé ne remonte rien sur ce fichier.
- `PlanGrid.tsx` calcule `isToday` (ligne 60) et **ne s'en sert pour aucune
  teinte** ; sa seule saturée est ligne 142, `text-amber-700` sur
  `cell.kind === "empty"` — un **trou dans le plan**, c'est-à-dire un défaut à
  combler, donc un fait.
- `EnergyReadout.tsx:98` : `energy.complete ? "text-ink-soft" : "text-amber-700"`
  — une somme d'énergie incomplète est une valeur manquante, pas une date.
- `KitchenBlock.tsx` : zéro saturée.
- `KitchenToday.tsx:209` : `day.shop.when === "overdue" ? "text-amber-800"` — une
  course **en retard**. C'est un fait sur une échéance, ce qui n'est pas la même
  chose que peindre « aujourd'hui » : le retard est un défaut, la position dans
  le temps n'en est pas un. Je le valide.

Au rendu, `/app/today` sort à **zéro saturée** dans son état nominal — l'écran
qui portait 47 classes saturées avant le chantier.

### 6. L'échelle de priorité devenue marque ordinale — est-ce que ça se lit ?

**OUI, et c'est le bon échange.** `CommitmentLine.PriorityMark` rend un SVG
13×8 : trois rectangles de 3×7, remplis de gauche à droite en `currentColor`,
contour 1 px, `fill="none"` pour les vides. Mesuré sur `/app/today` : trois
`<rect>` avec `fill` **et** `stroke` à `#23191F` (`ink`) pour une ligne `core`,
et le mot (« Essentiel ») écrit à droite.

Ce que je valide :

- **La forme est ordinale, ce que les trois couleurs n'étaient même pas.**
  `lime → orange → amber` n'a aucun sens d'ordre, et `orange`/`amber` sont à 30°
  l'un de l'autre : l'échelle ne se lisait pas comme une échelle. Trois cases
  remplies de gauche à droite, si.
- **Aucun aplat de fond, et c'est la garde.** Un remplissage fait une pastille et
  la pastille appartient aux états. Le rang ne peut plus être confondu avec un
  verdict — ce qui était le défaut le plus net : sur `/app/today`, une fausse
  coche émeraude « Core » touchait la vraie pastille de statut dans la même
  rangée, à 11 px.
- **Le mot reste écrit.** La marque n'a pas à porter seule ; elle accélère le
  balayage, elle ne remplace pas le libellé.
- Le `core` prend en plus le seul `font-semibold` de la rangée. Deux signaux
  redondants pour le rang qui compte.

**La réserve, honnête :** 3×7 px est petit, et la différence entre un rectangle
plein et un rectangle en contour de 1 px se joue sur ~9 px². À `text-ink-soft`
(`#6A5A64`) pour les rangs 1 et 2, le contraste plein/vide est plus faible encore.
Ça reste lisible parce que **les trois pièces se comparent entre elles** dans le
même glyphe — on lit un profil, pas un pixel — et parce que le mot est là. Je ne
demande pas de changement ; je note que si un jour on veut le renforcer, c'est la
hauteur du glyphe (8 → 10) qu'il faut monter, pas la couleur qu'il faut remettre.

### 7. La seule saturée AJOUTÉE : l'accusé de déviation en émeraude. Est-ce un fait ?

**OUI. Je tranche pour l'émeraude, et la justification donnée est même
sous-vendue.**

L'accusé n'est pas dans `DeviationDialog` mais dans `TodayPage.tsx:1462-1466` :
`bg-emerald-50 … text-emerald-900`, alimenté par `setFlash()` à la ligne 1105 —
juste après `declareDeviation()` — avec la chaîne `deviation.declared` :
**« Déclaré : {kind} le {date}. »**, dont les deux paramètres sont lus **sur la
ligne retournée par la base** (`row.kind`, `row.local_date`), et non sur ce que
l'utilisateur avait tapé.

Pourquoi c'est un fait, et pas un compliment :

1. **C'est un enregistrement confirmé**, précisément le cas que le socle nomme
   comme un fait qui reste (`text-emerald-700` d'un enregistrement confirmé).
2. **Il est groundé au sens fort du dépôt** : le message ne peut pas exister si
   la ligne n'existe pas, et il cite la ligne. Une déclaration refusée part dans
   la branche `catch` et sort en rouge (`DeviationDialog.tsx:196`). Les deux
   familles disent donc deux issues opposées de la même requête — c'est du
   vocabulaire d'état, pas de la décoration.
3. **La cohérence interne au fichier est réelle.** `PhotoOutcomePanel`
   (`TodayPage.tsx:585`) dit déjà « la photo est enregistrée » en
   `emerald-50/emerald-200/emerald-900`. Deux enregistrements confirmés dans le
   même écran ne peuvent pas être l'un vert et l'autre gris.
4. **Le violet ne disait rien** : ni un état (déclarer n'est ni ok, ni attention,
   ni échec, ni info), ni la marque actuelle.

**L'objection qu'il fallait écarter, et pourquoi elle tombe.** On pourrait
craindre que l'émeraude *félicite un écart*, ce que le produit refuse de faire
(`WeekView` met `Badge tone="neutral"` sur « Souplesse utilisée » exactement pour
ça, et l'écrit). La distinction tient : l'émeraude ne porte pas ici le jugement
« ton écart est bien », elle porte « **ta déclaration est enregistrée** ». Ce sont
deux propositions différentes, et c'est la seconde qui est écrite dans la phrase
— « Déclaré : … le … », pas un mot d'approbation. La preuve par l'autre bout :
les **bandeaux d'écarts déjà déclarés**, juste en dessous
(`TodayPage.tsx:1470-1493`), sont **neutres** (`paper-2` + trait `line`), et le
commentaire dit pourquoi — « ce n'est ni ok, ni attention, ni échec, c'est une
note au dossier ». Le produit colore donc **l'acte d'enregistrement**, jamais
**l'écart**. C'est la bonne ligne, et elle est tenue des deux côtés dans le même
fichier.

**Conclusion : l'unique saturée ajoutée par le chantier est légitime.**

### 8. Les surfaces d'état qui restent portent-elles toutes quelque chose ?

**OUI. Aucune ne porte rien.** Les trois familles de surfaces autorisées par
§5.2, vérifiées au rendu quand les données l'ont permis et au code sinon :

- **`Card tone="warning"`** (`ui/Card.tsx:41`, `amber-200`/`amber-50`) — 20 sites
  d'appel. Rendue et mesurée sur `/coach/doctrine` (« We could not read your
  doctrine ») et `/coach/billing` (« Your billing could not be loaded »). Chaque
  autre appel lu : escalade de siège (`CoachSeatCard:206`), doctrine illisible
  (`CoachDoctrinePage:509, 1683, 1770`), invitation non partie
  (`InviteDialog:118`), action échouée (`DoctrineStartDialog:291`), rythme
  incohérent (`EatingRhythmCard:336`), ce qui est conservé après suppression
  (`DataPrivacySection:517`), ligne non typée (`TodayPage:765`,
  `TemplatesPage:173-175`, `PlanImportPage:687-689`). **Tous des faits.**
- **Les bandeaux rouges** (`bg-red-50 text-red-700`) — 21 sites. Rendus et
  mesurés sur `/coach/templates` (×2), `/coach/import`, `/app/household`. Tous
  branchés sur une variable `error` / `failure` / `formError`, c'est-à-dire sur
  un refus effectivement reçu. **Aucun bandeau rouge décoratif.**
- **`Button variant="danger"`** (`ui/Button.tsx:49`) — `border-red-200 bg-paper
  text-red-700`. **Un point de doctrine à énoncer, parce que c'est la seule
  exception du produit :** c'est une couleur d'état sur une **ACTION**, donc les
  deux vocabulaires se croisent une fois. Je l'accepte, pour une raison de forme
  et non de convention : `danger` **n'a pas d'aplat**. C'est un contour rouge sur
  `paper`, là où `primary` est un aplat de marque. La garde du chantier est le
  remplissage ; elle n'est donc pas entamée, et un bouton destructeur reste
  distinguable d'un bouton d'action au premier coup d'œil. Si un jour quelqu'un
  donne à `danger` un fond `bg-red-600`, **c'est ce jour-là que la règle casse**,
  pas aujourd'hui.
- **`Badge tone="critical"` sur « peanut »** (`HouseholdPage:1246`) et sur
  « Medical » (`StudentHealthPage:267`, `StudentConstraintsCard:137`) : une
  allergie entre dans l'union de sécurité du générateur et **bloque la
  composition**. C'est un refus du système, pas une catégorie — et la preuve est
  que la **règle de maison** juste à côté (`HouseholdPage:1249`) est `neutral`.
  Le fichier a fait le tri lui-même, et il l'a fait juste.
- **`STANCE_PILL`** (`CoachProtocolPage:163-166`, `encouraged`/`discouraged`/
  `excluded` en emerald-500/amber-500/red-500) : une **posture est un verdict**
  que le coach a rendu sur un aliment, et `excluded` a une conséquence mécanique
  (l'aliment est refusé). Je valide la teinte. **Mais voir la tension ci-dessous.**

---

## 6. LES TENSIONS À ARBITRER (pas des bloqueurs, et il faut les nommer)

**T1 — « Silent » en rouge contredit la règle que ce lot vient d'écrire.**
`CoachHomePage.tsx:122-126` : `CONTACT_TONE = { responsive: positive, slipping:
caution, silent: critical }`. Rendu et mesuré sur `/coach` : la pastille
« Silent » sort en `#FEF2F2`/`#C10007`, la famille « échec / refus ».

Or `KeelBadges.tsx:27-29` écrit, pour justifier de garder `unknown` en neutre :

> « CE QUI N'A PAS CHANGÉ, ET QUI ÉTAIT DÉJÀ JUSTE : `unknown` est NEUTRE, pas
> rouge. Une journée non renseignée n'est pas une journée manquée, et la couleur
> ne doit pas le dire avant que l'évaluateur ait parlé. »

« Silent » **est** l'absence de donnée : l'élève n'a pas écrit. Le produit tient
donc deux règles opposées sur le même phénomène, à un onglet de distance — et
c'est le coach, pas l'élève, qui voit la version accusatoire. Accessoirement,
`responsive / slipping / silent` est un **rang à trois crans** posé sur trois
familles d'état, exactement la structure que le lot a supprimée pour la priorité.

Pas un bloqueur : le silence **est** un état calculé du système, donc la teinte
ne porte pas rien. Mais la famille est fausse, et l'incohérence est nommable.
`caution` pour `silent` et `neutral` pour `slipping` remettraient les deux
lecteurs d'accord.

**T2 — un chip de choix sélectionné est figue ici et une couleur d'état
là-bas.** `DeviationDialog.tsx:82-83` peint le choix retenu en
`variant="primary"` (figue). `CoachProtocolPage.tsx:1126` et `:1331` peignent le
choix retenu avec `STANCE_PILL`, donc en emerald/amber/red. Même objet de
formulaire, deux idiomes. Chacun se défend seul — là-bas la couleur *est* la
valeur choisie — mais un lecteur qui apprend l'un désapprend l'autre. À trancher
une fois, ailleurs qu'ici.

**T3 — `encouraged` peint un fait qu'aucun lecteur ne consomme.** Le dossier du
dépôt note que seul le **groupe** d'aliments atteint le runtime, pas les
`coach_food_items` encouragés. L'émeraude affirme donc au coach une posture qui
ne change rien à ce qui est généré. Ce n'est pas un problème de couleur — la
posture existe bien en base — mais la teinte donne du poids à une décision sans
effet. Hors périmètre de cette revue ; signalé.

---

## 7. LES CLASSES INERTES

**Zéro. 200 jetons saturés testés en situ, 200 vivants.**

**Méthode**, parce que le résultat ne vaut que par elle. Pour chacun des 126
littéraux de `className` du code vivant qui contient une classe saturée
(+ 25 composites que l'extraction ne peut pas voir : la valeur d'une table du kit
concaténée avec la base de son enveloppe — `Badge` × ses 4 tons, `Card
tone="warning"` × sa base, `Button variant="danger"` × sa base, `DOT_STYLE` ×
`inline-block align-middle`, `STANCE_PILL` × ses 3 enveloppes…), j'ai injecté
**dans la page vivante** deux nœuds : l'un portant **la liste de classes
complète**, l'autre **le seul jeton saturé**. Puis j'ai comparé la propriété
calculée correspondante (`color`, `backgroundColor`, `borderTopColor`,
`borderLeftColor`, `fill`, `stroke`). **Si les deux diffèrent, le jeton est écrit
mais battu** — c'est-à-dire inerte en situ, le défaut annoncé par le brief.
Aucune différence sur 200.

Le cas le plus exposé passe : `PlanImportPage.tsx:353` porte
`border-l-4 border-l-amber-400 border-y border-r border-line-strong` — un
`border-color` de raccourci (qui écrit les **quatre** côtés) écrit **après** un
`border-left-color`, à spécificité égale. Mesuré : `borderLeftColor` vaut bien
`amber-400`. Tailwind 4 génère `border-color` avant `border-*-color`, et l'ordre
de génération tranche en faveur du plus précis. **Ce n'est pas une garantie de
l'auteur, c'est un ordre de génération** — donc à re-mesurer si la version de
Tailwind bouge, pas à supposer.

**Deux angles morts que je déclare** :

- **`ring-*` n'est pas mesurable par cette méthode** (il passe par `box-shadow`,
  pas par une propriété de couleur). `ChatPage.tsx:778` — `ring-1 ring-red-300`
  sur un message dont l'envoi a échoué — n'est donc **pas vérifié**. C'est le
  seul site `ring` saturé du produit, et le seul emploi de `red-300`.
- Les variantes préfixées (`hover:bg-red-50` de `Button variant="danger"`) sont
  exclues : elles ne se calculent pas sans l'état.

---

## 8. LES COMMENTAIRES INERTES — ce qui va faire « réparer » le kit

Il n'y a pas de classe morte, mais il y a **deux affirmations mortes**, et dans
ce dépôt c'est le même risque : le prochain lecteur les suit et remet la couleur.

| # | fichier:ligne | ce qui est écrit | ce qui est vrai | ce que le lecteur va faire |
|---|---|---|---|---|
| C1 | `frontend/src/keel/components/WeekView.tsx:573-581` | « `KeelBadges.tsx` porte **encore** `not_applicable` et `flex_used` en `violet-100/700`, plus `partial` en `sky` […] la réparation est de porter CETTE table dans `KeelBadges.tsx` » | `KeelBadges` a été réécrit le même jour : zéro violet, zéro `sky`, et les six tons concordent teinte pour teinte | partir chercher une divergence inexistante — ou conclure que les tables ont divergé et en « réparer » une |
| C2 | `frontend/src/keel/pages/TodayPage.tsx:448-450` | « Each family carries an icon **and a tint** (`ActivityChip`), the same one on the line, on the section header and in the day tally » | `ActivityChip` a perdu ses neuf teintes : il ne rend plus qu'un glyphe, sans fond ni cadre | remettre les teintes de famille — **et `CommitmentLine.tsx:55-57` avait nommément demandé de réécrire cette phrase**, en désignant ce fichier. Ça n'a pas été fait |

C2 est le plus grave des deux, parce que la consigne de réparation existe déjà,
au bon endroit, et qu'elle a été lue puis laissée en plan. Un dossier qui dit
« va corriger la ligne 448 » et une ligne 448 intacte, c'est un dossier dont on
cesse de croire les avertissements.

**Ce qui est propre, pour éviter qu'on y touche :** `index.css` ne porte plus
aucune règle `.sophia-action-skin` / `.sophia-violet-surface` — seulement le récit
de leur suppression en commentaire, avec les classes citées. C'est **volontaire
et il faut le garder** (une purge silencieuse fait réinventer le contournement),
et c'est aussi pourquoi tout comptage de ce dépôt doit blanchir les commentaires
avant de compter.

---

## 9. CE QUE JE N'AI PAS PU MESURER

Par honnêteté, et parce qu'une revue qui ne dit pas ses trous se fait croire.

1. **`commitment_evaluations` est VIDE en base** (`select count(*)` = 0). La
   grille de `WeekView` n'a donc rendu **aucune cellule** de statut : les six
   marques n'ont été mesurées que dans la **légende**, qui les rend toutes les
   six inconditionnellement et à taille réelle. La règle est vérifiée ; sa
   lisibilité *en grille de sept colonnes* ne l'est pas.
2. **Les cinq bloqueurs de §1 n'ont pas pu être rendus** : aucune ligne « own
   week », aucun `student_safety_constraints` avec `declared_by='coach'` (12
   lignes en base, toutes `student`), aucun aliment retenu pour ce coach. Le
   classement repose sur la lecture du code et sur la chaîne i18n citée.
3. **`/app/setup` n'a pas été rendu** : le persona `house` a un `student_goals`,
   la garde d'entrée le redirige. Sans conséquence pour cette revue —
   `SetupPage.tsx` porte **zéro** classe saturée.
4. **`/coach/templates` et `/coach/billing` étaient en erreur de chargement** chez
   ce coach. Utile pour mesurer les bandeaux d'échec, inutile pour mesurer les
   surfaces ambre « unsorted » / « issues » de `TemplatesPage` et de
   `PlanImportPage`, qui restent classées sur lecture.
5. **Le compteur de non-lus était à 0** : les trois combinaisons de classes ont
   été mesurées par injection dans la page vivante, pas en situation.
6. **`ring-red-300`** (`ChatPage.tsx:778`) : non vérifiable par ma méthode, voir §7.
7. Le navigateur est **partagé avec d'autres sessions de revue** : un onglet a été
   déplacé sous moi, un `window.__M` écrasé, et la fenêtre redimensionnée deux
   fois en cours de boucle. Chaque relevé porte donc son `location.pathname`, son
   `h1` et son `innerWidth` — tous ceux cités ici ont été recoupés. Aucun
   `localStorage` n'a été vidé, aucune session tierce déconnectée : j'ai travaillé
   sur `revue2.localhost:5191`, une origine à moi.

---

## 10. RÉSUMÉ EXÉCUTABLE

| question | réponse |
|---|---|
| Une saturée rendue qui n'est pas un état ? | **Non**, sur 18 surfaces × 2 largeurs |
| Une saturée **vivante** qui n'est pas un état ? | **Oui, 5** — toutes `Badge tone="info"`, §1 B1-B5 |
| La figue est-elle entrée dans une pastille d'état ? | **Non**, ni au code ni au rendu |
| Cinquième famille (violet, `sky`, `rose`, `lime`…) ? | **Aucune**, ni au rendu ni dans les 152 sites vivants |
| Aplats figue par vue | **1 à 2 partout**, sauf `/app/today` + dialogue d'écart : **4** |
| Débordement horizontal à 320 px | **aucun** (`scrollWidth === innerWidth` × 18) |
| Classes inertes | **0 / 200** jetons testés en situ |
| Commentaires inertes | **2**, dont un qui prescrit une réparation déjà faite |

**Les trois gestes, par ordre de coût croissant :**

1. `tone="info"` → `tone="neutral"` sur les cinq sites de §1. Cinq mots.
2. Réécrire `WeekView.tsx:573-581` et `TodayPage.tsx:448-450` (§8). Deux
   paragraphes.
3. Sortir les chips de choix de `DeviationDialog` de `variant="primary"` (§5,
   point 1) — le seul qui touche au rendu, et le seul qui répare un dépassement
   mesuré du budget de marque.
