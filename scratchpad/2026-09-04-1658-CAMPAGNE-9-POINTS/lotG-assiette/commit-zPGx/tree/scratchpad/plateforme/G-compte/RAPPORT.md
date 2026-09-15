# FAMILLE G — LE COMPTE

> Trois fichiers : `pages/Account.tsx` (la coque), `components/UserProfile.tsx`
> (l'écran réel), `pages/UpgradePlan.tsx` (`/upgrade`).
> Chaque nombre de ce rapport est reproductible ; les commandes sont en §9.

---

## 0. Le résultat qui change le plus la lecture du chantier

**Le prompt et l'audit se trompaient sur la répartition du violet, et l'écart est
inversé.** Ils annonçaient « `UserProfile` ~40 `violet-*` · `UpgradePlan` ~30 ».
Mesuré à `HEAD` :

| fichier | `violet-*` |
|---|---:|
| `components/UserProfile.tsx` | **6** |
| `pages/UpgradePlan.tsx` | **34** |
| **total** | **40** |

Le total était juste, la répartition à l'envers. Ce que l'audit avait pris pour du
violet dans `UserProfile`, c'est **81 `emerald-*`** — et c'est le vrai gros
morceau du lot :

| famille, à `HEAD` | `UserProfile` | `UpgradePlan` |
|---|---:|---:|
| emerald | **81** | 12 |
| slate | 63 | 53 |
| red | 24 | 7 |
| amber | 14 | 5 |
| violet | 6 | **34** |
| blue | 4 | 0 |

**Les 81 émeraudes sont une PEAU ENTIÈRE**, pas des états : `UserProfile` rendait
deux habillages, et le second (`mode === 'architecte'`) était un panneau sombre en
`bg-emerald-950 / border-emerald-800 / text-emerald-400`. Décision en §2.

---

## 1. Avant / après mesurés, par fichier

`mesure.sh` compte **aussi les commentaires**. Les deux colonnes sont donc
données : brute (ce que le script de l'orchestrateur rendra) et **hors
commentaires** (ce qui est réellement rendu au navigateur). Voir §8, point 1.

| fichier | | gris | saturées | `rounded` | « mort » | lignes |
|---|---|---:|---:|---:|---:|---:|
| `components/UserProfile.tsx` | avant (`HEAD`) | **63** | **125** | 29 | 7 | 845 |
| | après, brut | 6 | 22 | 11 | 3 | 1 038 |
| | **après, hors commentaires** | **0** | **13** | **11** | **0** | — |
| `pages/UpgradePlan.tsx` | avant (`HEAD`) | **53** | **55** | 18 | 34 | 548 |
| | après, brut | 1 | 8 | 6 | 3 | 669 |
| | **après, hors commentaires** | **0** | **6** | **6** | **0** | — |
| `pages/Account.tsx` | avant (`HEAD`) | 1 | 0 | 0 | 0 | 38 |
| | après, brut | 1 | 0 | 0 | 0 | 42 |
| | **après, hors commentaires** | **0** | 0 | 0 | 0 | — |

**Gris : 117 → 0.** **Violet : 40 → 0.** **« Powered by IKIZEN » : 1 → 0.**

Les 19 saturées qui restent sont **toutes des états**, et il n'y en a que trois
sortes : `border-red-200 bg-red-50 text-red-700` (échec),
`border-emerald-200 bg-emerald-50 text-emerald-700` (ok), et les tons de `Badge`
qui viennent du kit.

### Le vocabulaire de rayon — 5 valeurs → 2

| | avant (`HEAD`) | après |
|---|---|---|
| `UserProfile` | `rounded` ×1 · `lg` ×11 · `xl` ×6 · `2xl` ×1 · `full` ×10 | **`card` ×5 · `full` ×6** |
| `UpgradePlan` | `md` ×5 · `xl` ×5 · `3xl` ×3 · `full` ×5 | **`card` ×3 · `full` ×3** |

Les `rounded-full` restants sont des boutons, des pastilles, deux disques
(initiales, écusson) et deux pistes d'interrupteur — exactement ce que le kit
réserve au cercle complet. Aucune valeur intermédiaire ne subsiste.

---

## 2. ⚠️ LA DÉCISION LA PLUS LOURDE : la peau sombre « architecte » est supprimée

**Décision.** `UserProfile` ne rend plus qu'un habillage, celui de la charte. La
prop `mode` et le drapeau `isArchitect` **restent en place** (voir « exécution »).

**Pourquoi, trois raisons cumulées :**

1. **L'émeraude est la famille d'état « ok »** dans tout le produit
   (`ui/Badge.tsx`). Une peau entière dans cette teinte rend un enregistrement
   confirmé indistinguable d'un fond de panneau — c'est le cœur de la règle de
   couleur du chantier, et 81 des 125 saturées du fichier étaient là pour ça.
2. **`architecte` est un palier du produit grand public supprimé**
   (`keel/components/CoachRoute.tsx` : « legacy French subscription tiers »). Et
   cette peau **ne se déclenche même pas sur le palier** : elle vient d'un
   `?mode=architecte` dans l'URL (`pages/Account.tsx:21`). **Vérifié hors
   commentaires sur `frontend/src` et `frontend/e2e` : rien dans le dépôt ne pose
   ce paramètre.** Aucun lien, aucun test, aucune redirection.
3. **La charte ne nomme qu'un fond sombre**, `fig-950`, et « un seul par page »
   (charte §2). Deux thèmes n'y entrent pas.

**Options rejetées.**
- *Convertir la peau sombre en `fig-950`* — la charte n'autorise **qu'un** bloc
  sombre par page, et le panneau en contient déjà un (la carte de palier). Deux
  thèmes charte, c'est la même dette avec de meilleures couleurs.
- *Supprimer la prop `mode`* — `DataPrivacySection` la reçoit encore
  (`isArchitect`), et ce fichier n'est pas de ce lot. Le type serait cassé pour
  une autre famille.
- *Garder les deux branches et ne convertir que la claire* — laisse 81 saturées
  décoratives dans le fichier que ce lot existe précisément pour nettoyer.

**Exécution.** `isArchitect` est toujours calculé et **toujours passé tel quel** à
`DataPrivacySection` : je ne change aucune valeur qui traverse la frontière d'un
fichier qui n'est pas à moi. **Conséquence assumée et signalée : avec
`?mode=architecte`, l'écran rend un panneau clair et un bloc RGPD sombre.** Cette
URL n'est atteignable qu'à la main, et le jour où `DataPrivacySection` passe à la
charte, `mode`, `isArchitect` et la prop partent ensemble — lot de suppression.

---

## 3. Le violet, occurrence par occurrence — action, état, ou rien

40 occurrences retirées. Trois destinations, et pas deux : le prompt en prévoyait
deux (figue / neutre), mais **trois violets marquaient un FAIT** — ils vont donc à
la famille d'état correcte, pas à la figue.

### 3.1 Il marquait une ACTION ou la NAVIGATION → figue (11)

| fichier:ligne (`HEAD`) | classe | ce qu'elle marquait | devenu |
|---|---|---|---|
| `UserProfile`:628 | `bg-violet-600` `hover:bg-violet-500` | « Move up a tier » — action principale de l'onglet | `Button variant="primary"` (`fig-700` → `fig-800`) |
| `UserProfile`:674 | `bg-violet-600` `hover:bg-violet-500` | idem, branche sans abonnement | `Button variant="primary"` |
| `UpgradePlan`:226 | `selection:bg-violet-100` `selection:text-violet-900` | la marque, jusque dans la sélection de texte | `selection:bg-fig-100 selection:text-ink` |
| `UpgradePlan`:269 | `bg-violet-600` | interrupteur mensuel/annuel, état actif | `bg-fig-700` (forme copiée de `pages/Auth.tsx`) |
| `UpgradePlan`:320 | `hover:border-violet-600` `hover:text-violet-600` | survol d'une offre disponible | `Button variant="secondary"` (`hover:bg-fig-50`) |
| `UpgradePlan`:408 | `bg-violet-600` `hover:bg-violet-500` | l'action de l'offre mise en avant | **figue inversée** : `bg-paper text-ink` sur le bloc sombre (voir §6) |

### 3.2 Il marquait un ÉTAT → la famille d'état correcte (12)

| fichier:ligne | classe | le fait porté | devenu |
|---|---|---|---|
| `UpgradePlan`:288 ×3 | `bg-violet-50 border-violet-100 text-violet-800` | **le bandeau de SUCCÈS** | `border-emerald-200 bg-emerald-50 text-emerald-700` |
| `UpgradePlan`:319 ×3 | `bg-violet-50 border-violet-200 text-violet-700` | « Plan actuel » / « Inclus » (Le Système) | `Button secondary disabled` + **`Badge tone="positive">Plan actuel`** dans l'en-tête de carte |
| `UpgradePlan`:496 ×3 | idem | idem (L'Architecte) | idem |
| `UpgradePlan`:407 ×3 | `bg-violet-500/20 border-violet-500/30 text-violet-200` | idem, sur le bloc sombre | `border border-fig-300 text-paper` + la même pastille |

Le cas 288 est le plus parlant : **la seule saturée de `/upgrade` qui portait
vraiment un fait le portait dans la couleur de la marque morte.** Un succès est
un état ; il devient émeraude, jamais figue.

Et c'est là que la pastille « votre offre actuelle » du prompt a été appliquée :
`Badge tone="positive"` dans l'en-tête des trois cartes, sur
`currentPaidTier === <tier>`. **Aucune chaîne ajoutée** — « Plan actuel » existait
déjà dans le fichier.

### 3.3 Il ne marquait RIEN → neutres, et la distinction passe à une forme (17)

| fichier:ligne | classe | ce que c'était | devenu, et par quelle forme |
|---|---|---|---|
| `UserProfile`:628, 674 | `shadow-violet-200` ×2 | ombre teintée | **supprimée**, sans remplacement |
| `UpgradePlan`:255 | `text-violet-600` | un mot du `h1` (« supérieure ») | `text-ink` — **la display porte l'emphase** |
| `UpgradePlan`:327, 334, 504 | `bg-violet-600` ×3 | vignette carrée derrière une coche | **une coche nue** ; le mot suffisait |
| `UpgradePlan`:415, 422 | `bg-violet-500 text-violet-950` ×2 | idem sur fond sombre | idem |
| `UpgradePlan`:518 ×2 | `bg-violet-100 text-violet-600` | disque derrière une coche | idem |
| `UpgradePlan`:360, 364, 368 | `text-violet-600` ×3 | icônes de fonctionnalité | `text-ink-soft` — **l'icône et la rature** portent l'inclusion |
| `UpgradePlan`:384 | `bg-violet-600` | « Le plus populaire » | **`Badge tone="neutral"`** — un libellé commercial n'est pas un état, et la figue n'entre jamais dans une pastille |
| `UpgradePlan`:405 | `shadow-violet-900/50` | ombre portée | **supprimée** |

---

## 4. « Powered by IKIZEN » — traité comme le pied de `/auth`

`UserProfile.tsx:873` rendait `Sophia v2.4.0 • Powered by IKIZEN`.

**Devenu** un lien vers `/legal`, exactement ce que fait `pages/Auth.tsx` (~ligne
268), dont le commentaire dit déjà pourquoi :

```jsx
<Link to="/legal" className="text-ink-soft transition-colors hover:text-ink hover:underline">
  {t("public.footer.legal")}
</Link>
```

- `lib/legalEntity.ts` reste la source unique du nom ; `/legal` est la page.
- La clé `public.footer.legal` **existe déjà dans les deux paquets**
  (`fr.ts:105`, `en.ts:2273`) : aucune chaîne ajoutée, et c'est le seul `t()` du
  fichier — assumé, le reste du fichier est de l'anglais en dur (§8).
- **« Sophia v2.4.0 » part aussi** : le numéro était écrit en dur et **rien dans
  le dépôt ne définit ce numéro** (vérifié, y compris `package.json`). Un fait
  invérifiable affiché à chaque visiteur.

---

## 5. Les émeraudes et les ambres de `/upgrade` — quel fait chacune portait

Réponse courte : **aucune n'en portait, et aucune n'est gardée.** Détail :

| ligne (`HEAD`) | classe | fait prétendu | verdict |
|---|---|---|---|
| 277 | `text-emerald-500` « (-20%) » | une **remise** | pas un état du système : c'est un fait de PRIX → `Badge tone="neutral">-20 %` (la forme remplace la couleur) |
| 310, 398, 487 | `text-emerald-500/400` « Facturé 94,90 € par an » | un **montant** | idem, et doublement interdit : « un chiffre, une mesure » ne prend jamais une couleur de marque ni d'état → `text-ink-soft` |
| 451 | `bg-emerald-500/20 text-emerald-400` | disque derrière une coche | décoration → coche nue en `fig-300` |
| 457, 458 | `text-emerald-400` + `animate-pulse` | « Sophia au quotidien (24/7) » | une **fonctionnalité incluse**, pas un état → icône `fig-300`, emphase par la graisse. `animate-pulse` retiré (§7) |
| 461, 465 | `text-emerald-400` ×2 | icônes de fonctionnalité | décoration → `fig-300` |
| 497 | `hover:border-emerald-600` `hover:text-emerald-600` | survol du bouton « L'Architecte » | **la couleur de « ok » employée comme teinte de marque d'une carte** → `Button secondary` |
| 524, 528, 532, 536 | `text-amber-500` ×4 | icônes de fonctionnalité | ambre = ATTENTION dans tout le produit : ces icônes disaient « attention » à propos de ce qu'on achète → `text-ink-soft` |
| 525 | `text-amber-600 font-bold` | « Messages illimités avec Sophia » | idem → `text-ink font-semibold` |

**Ce qui reste saturé sur `/upgrade` (6 occurrences)** : le bandeau d'erreur
(rouge = échec) et le bandeau de succès (émeraude = ok, après conversion depuis le
violet). Plus les tons de `Badge` fournis par le kit : `positive` pour « Plan
actuel », `neutral` pour « -20 % » et « Le plus populaire ».

### Et sur `UserProfile`

| avant | fait prétendu | verdict |
|---|---|---|
| **la coche `emerald-600` sur le champ e-mail** | « adresse vérifiée » | **RETIRÉE : fait faux indémentable.** Rendue inconditionnellement ; aucune ligne de cet écran ne lit `email_confirmed_at`. Elle affirmait une vérification que rien n'avait faite, pour tout le monde. Le `pr-10` qui lui réservait la place part avec elle |
| **le bloc ambre « Level: Initiate / Member for N days »** | une **ancienneté** | l'ambre part : un rang n'est pas un avertissement. La distinction passe à `Badge tone="neutral"` + encre secondaire |
| `bg-amber-500/20 blur-[50px]` (« Background Decor ») | rien | **retiré** : un halo saturé posé derrière un verdict d'abonnement, c'est-à-dire à l'endroit exact où une couleur est lue comme un signal |
| `text-amber-400` sur l'éclair de la carte de palier | rien | `text-fig-300` — la pièce chaude du bloc sombre (8,06:1) |
| `bg-red-*` / `text-emerald-*` des bandeaux | échec / ok | **gardés**, alignés sur les valeurs du kit (`red-700` au lieu de `red-600`) |
| **le rouge de « Sign out »** | ni échec, ni destruction | **retiré** → `Button variant="secondary"`. Voir §6 |
| `text-blue-600` de l'onglet actif, `bg-blue-600` de l'interrupteur | rien | le bleu appartient à `Badge tone="info"` : une NAVIGATION et un CONTRÔLE portaient la couleur d'un état → `fig-700` |

---

## 6. Le geste destructeur garde le rouge, et il est le seul

Le prompt insiste : la suppression de compte est destructrice, donc
`variant="danger"`, jamais la figue. **Le bouton de suppression est dans
`components/account/DataPrivacySection.tsx`, qui n'est pas dans mon lot** (§8,
point 2) : il rend toujours `bg-red-600 text-white`, non touché.

Ce que j'ai fait de mon côté pour que ce rouge **reste distinguable** :

- **« Sign out » n'est plus rouge.** Se déconnecter ne détruit rien et se défait
  en se reconnectant. Surtout, `DataPrivacySection` rend « Delete my account »
  **juste en dessous, en rouge** : deux lignes rouges empilées, et l'irréversible
  ne se distingue plus de l'ordinaire. Le `ChevronRight` part avec — il annonçait
  un écran suivant, or ce bouton agit sur place.
- **« Cancel my subscription » n'a plus de survol rouge.** Ce bouton n'annule
  rien : il appelle `openPortal`, comme celui du dessus. Un rouge promettrait une
  destruction que le geste ne fait pas.
- **Les deux « Repasser sur cet abonnement » de `/upgrade`** : même raisonnement,
  même traitement (lien neutre souligné).

### Une seule action marquée par vue rendue — vérifié onglet par onglet

| vue rendue | actions figue | note |
|---|---|---|
| `/account` onglet **Account** | 1 (« Save ») | quand l'éditeur d'e-mail est ouvert, « Confirm » est **`secondary`** exprès : les deux boutons sont rendus en même temps |
| `/account` onglet **Plan** | 1 (« Move up a tier » / « Switch to annual ») | « Manage billing » est `secondary`, « Cancel » est un lien |
| `/account` onglet **Options** | 1 (« Save ») | + les boutons de `DataPrivacySection`, qui n'est pas converti (§8) |
| `/upgrade` | **0 aplat figue** | l'action de l'offre mise en avant est la figue **inversée** sur le bloc sombre : `fig-700` sur `fig-950` disparaîtrait. `paper` sur `fig-950` = 17,05:1 |

L'onglet actif du panneau est en `bg-fig-700` : c'est de la **navigation**, la
colonne de gauche du tableau du master, et c'est la forme exacte de `ShellLink`
dans `KeelAppShell.tsx`.

---

## 7. Ce que j'ai retiré parce que ça mentait, et la vérification faite avant

### 7.1 Les deux interrupteurs de notification (`UserProfile`, ex-lignes 829-848)

Le bloc affichait **« Email notifications » ALLUMÉ** et **« Weekly newsletter »
ÉTEINT**. Vérifié avant suppression, hors commentaires, sur tout `frontend/src` et
`supabase/` :

- **aucun `onClick`, aucun état, aucune requête** : les deux « interrupteurs »
  étaient des `<div>` avec un `cursor-pointer` et une position de pouce **en
  dur** ;
- **« newsletter » n'apparaissait nulle part ailleurs dans le dépôt**, et aucune
  colonne ni préférence de notification n'existe pour stocker ces deux réglages.

Donc : une interface qui affirmait à chaque visiteur l'état de deux réglages que
le produit n'a jamais eus, dans le `blue-600` de `Badge tone="info"`.

**Pourquoi supprimer plutôt que repeindre :** repeindre à la charte aurait fait
passer un mensonge visiblement *legacy* pour une décision de design. C'est le
motif « la coche automatique écrit des faits faux indémentables », que ce dépôt a
déjà refusé de livrer une fois. Il n'y a **aucune logique** à changer ici — pas de
handler, pas d'état, pas d'appel.

### 7.2 La coche verte du champ e-mail

Voir §5. Même motif, même vérification : `email_confirmed_at` n'est lu nulle part
dans ce fichier.

### 7.3 Le logo violet EN IMAGE de `/upgrade`

`/apple-touch-icon.png` est **l'ancien yin-yang violet** du produit grand public.
La barre de `/upgrade` le rendait en 32×32 à côté du mot « Sophia ». **Aucun
`grep violet-` ne le trouve : la marque morte y est un pixel, pas une classe.**
Remplacé par le mot-symbole de la charte (l'équerre `.eq` collée au nom, comme la
barre de `/auth`). Le fichier lui-même est signalé en §8, point 3.

### 7.4 `animate-pulse` sur une icône de `/upgrade`

Une icône qui bat en permanence est du bruit, pas une information — rien ne change
à l'écran quand elle clignote. L'emphase passe à la graisse du texte.

---

## 7bis. Ce qui a été vérifié AU RENDU, et le défaut de mise en page corrigé

Persona `house` **et** persona `coach` (`UserProfile` sert les deux rôles ; le
coach y voit sa facturation), sur `/account`, `/account?tab=subscription`,
`/account?tab=settings` et `/upgrade`, à **320 px et 1280 px**.

| mesuré | valeur |
|---|---|
| débordement horizontal, `/account` à 320 px | **aucun** (`scrollWidth` 320 = `clientWidth` 320, 0 élément hors cadre) |
| débordement horizontal, `/upgrade` à 320 px | **aucun** |
| taille de police des champs à 320 px | **16 px** — la protection anti-zoom de Safari iOS tient enfin (elle était contournée par le `text-sm` local) |
| bordure de champ | `rgb(142,120,134)` = `#8E7886` = `line-strong`, 3,84:1 |
| bouton « Sign out » | fond `rgb(251,248,250)` = `paper`, bordure `line-strong` → c'est bien `secondary` |
| pied de panneau à 320 px | visible, bas à **742 px** dans une fenêtre de 760 |

### ⚠️ Le défaut de mise en page qui était là et que personne ne pouvait voir en relisant le TSX

La colonne intérieure du panneau était en **`h-[calc(100%-80px)]`** — c'est-à-dire
« cet en-tête mesure 80 px », écrit en dur. Or l'en-tête d'origine portait `p-6`
(24 px de marge intérieure en haut **et** en bas) autour d'un disque de 40 px :
**88 px minimum**, plus le trait de séparation. La colonne dépassait donc le bas du
panneau d'environ 9 px, et **c'est le pied qui sortait de l'écran** — pas le
contenu, qui défile. Un nom un peu long qui passe sur deux lignes aggrave l'écart
d'une ligne entière.

Corrigé par le flux, pas par une autre constante : `container` en
`flex h-full flex-col`, en-tête et pied en `shrink-0`, colonne en
`min-h-0 flex-1`. **Mesuré après : l'en-tête fait 65 px et le pied est visible.**
Plus aucune hauteur en dur.

### La suite de tests

`npx vitest --config vitest.config.ts run` → **3 échecs, exactement les 3 que
`BASELINE-VERT.md` §31 enregistre comme déjà rouges** avant le lot
(`edge/coverage-guard.int.test.ts` ×2, un chantier backend ;
`keel/copy/planRefusals.int.test.ts` ×1, le chantier foyer). 816 tests passent.
`npx eslint` sur mes trois fichiers : **0 erreur**. `npx tsc -b` : **0 erreur sur
mes trois fichiers** (le rouge du dépôt vient de `DeviationDialog.tsx`,
`CoachBroadcastCard.tsx` et `StudentConstraintsCard.tsx`, fichiers d'autres
sessions en cours d'écriture — non touchés, non réparés).

---

## 8. Signalé, PAS réparé

1. ⚠️ **`mesure.sh` compte les commentaires, et ça faussera le rapport final du
   chantier.** Mes trois fichiers rendent **0 gris, 0 violet, 0 « Powered by
   IKIZEN »** ; le script en trouvera pourtant `gris=8`, `mort=6`, parce que mes
   commentaires **citent les classes retirées** — ce qui est délibéré (une
   contrainte documentée survit à sa cause : sans le nom exact, le prochain
   lecteur remet la couleur). Les emplacements exacts, tous en commentaire :
   `UserProfile.tsx` gris 406, 487, 621, 682, 846 · mort 768, 769 ·
   `UpgradePlan.tsx` gris 480 · mort 248, 287, 518 ·
   `Account.tsx` gris 25. **La commande qui déduit les commentaires est en §9** ;
   je recommande de l'ajouter à `mesure.sh`, sinon les sept familles vont livrer
   un résidu fantôme et le rapport final annoncera un violet qui n'existe plus.

   Et deux défauts du script lui-même, pendant qu'on y est :
   `RAYON='rounded(-(none|sm|md|lg|xl|2xl|3xl))?\b'` compte **aussi**
   `rounded-full`, `rounded-card` et `rounded-fiche` (le `\b` tombe sur le tiret),
   donc il mesure « toutes les occurrences de rayon » et pas « les rayons
   divergents » : un fichier parfaitement aligné sur les deux valeurs du kit ne
   descendra jamais à zéro. Et `SAT` ne couvre ni `shadow-`, ni `decoration-`,
   ni `hover:decoration-`, alors que `GRIS` les couvre — trois `shadow-violet-*`
   et deux `hover:decoration-red-*` de mon lot échappaient donc au comptage des
   saturées tout en étant bien du violet et du rouge rendus.

2. ⛔ **`components/account/DataPrivacySection.tsx` (554 lignes) et
   `components/account/DeletionPendingScreen.tsx` (~120 lignes) ne sont attribués
   à AUCUNE famille, et ils sont RENDUS dans `/account?tab=settings`.** Ils
   n'apparaissent ni dans `AUDIT-APP.md` §1, ni dans son §4, ni dans la liste des
   49 fichiers de `mesure.sh`. C'est **exactement le même angle mort que
   `UserProfile`** : l'audit a compté la coque et pas le contenu, une deuxième
   fois. Mesuré : `DataPrivacySection` porte **37 `slate-*`, 45 saturées, 20
   rayons divergents**, son propre `inputClass` local qui masque celui du kit, et
   **le bouton de suppression de compte** (`bg-red-600 text-white`).
   **Conséquence immédiate et visible : l'onglet Options est à moitié converti.**
   Mon panneau est à la charte, le bloc RGPD qui s'affiche dedans est en slate.
   Il faut l'attribuer.

3. ⚠️ **Le violet survit comme ASSET, dans 8 endroits, et aucun grep de couleur
   ne le voit.** `/apple-touch-icon.png` (l'ancien logo violet) est référencé par
   `index.html` (`apple-touch-icon`, `og:image`, `twitter:image`),
   `components/SEO.tsx:17` (`DEFAULT_IMAGE` — donc **l'aperçu social de tout le
   site**), `lib/legalEntity.ts:100` (le `logo` du nœud JSON-LD `Organization`,
   c'est-à-dire ce qu'un examinateur d'App Store regarde),
   `components/Footer.tsx:12`, `pages/ResetPassword.tsx:108`,
   `pages/InstallAppGuide.tsx:33`, `pages/ProductPlan.tsx:49`,
   `components/YinYangLoader.tsx:24`. Tous hors de mon lot. **C'est probablement
   le plus gros reliquat restant du produit supprimé.**

4. **Les deux « Powered by IKIZEN » hors des seize sont intacts, comme demandé** :
   `components/Footer.tsx:15` et `pages/ResetPassword.tsx:111`, tous deux en
   `text-slate-400`. Non touchés. Le patron de remplacement est celui du §4.

5. **`/upgrade` est un écran du produit grand public supprimé, rendu et
   atteignable.** Trois paliers en euros (« Le Système », « L'Alliance »,
   « L'Architecte »), copie **entièrement en français en dur** (zéro `t()`) dans
   une app bilingue, et un discours (« Sophia au quotidien », « Dashboard
   d'Actions », « Module Architecte ») qui ne décrit plus le produit. Je l'ai mis
   à la charte parce qu'il est dans mon lot, mais **c'est un écran dont la
   question est s'il doit exister**, pas comment il doit être peint.

6. **Défaut fonctionnel : `UpgradePlan.handleBack()` navigue vers `/dashboard`**
   (ligne ~224), une route **démontée** avec le produit grand public
   (`App.tsx:453`). Le bouton « Retour » de `/upgrade` mène donc à la page
   « introuvable ». Non réparé : c'est une route, donc de la logique.

7. **Code mort : le bandeau de succès de `/upgrade` ne peut pas s'afficher.**
   `setSuccess` n'est jamais appelé avec autre chose que `null` (deux sites).
   Converti quand même, mais signalé.

8. **`/account` n'a aucun `h1`.** Le composant est une **fenêtre** (voile, clic du
   fond qui ferme) montée comme une **page** ; j'ai gardé le titre en `h2`, comme
   `ui/Modal.tsx`. Le corriger demande de décider si cet écran est une page ou un
   dialogue — c'est de la structure, pas de la couleur.

9. **`UserProfile` n'est pas traduit du tout** : toutes ses chaînes sont de
   l'anglais en dur (« Account », « Plan », « Options », « Save », « Sign out »,
   « Personal details »…). Je n'ai traduit ni ajouté aucune chaîne. Les trois
   `aria-label` que j'ai posés (« Close », « New email address », et
   « Facturation annuelle » sur `/upgrade`) suivent la langue de leur écran, parce
   que **ces contrôles n'avaient aucun nom accessible du tout**.

10. **Pluriel faux** : `Member for {n} day{n > 1 ? 's' : ''}` rend **« Member for
    0 day »** le jour de l'inscription (mesuré sur le compte de QA `house`).
    Et l'échelle « Initiate → Apprentice → Journeyman → Builder → Architect →
    Master Builder » est du vocabulaire de gamification du produit supprimé, où
    « Architect » désigne en plus un palier d'abonnement mort. Couleur retirée,
    contenu gardé : c'est un lot de copie.

11. **`keel/i18n` : aucun namespace déclaré, aucune clé ajoutée.** Le seul `t()`
    que j'introduis réutilise `public.footer.legal`.

12. ⚠️ **UNE INSÉCABLE BRUTE DANS DU TEXTE JSX EST REFUSÉE PAR LE GATE — les six
    autres familles vont tomber dessus.** La charte §3 exige U+00A0 avant `:` et
    `%` et dans les guillemets français ; la règle eslint
    `no-irregular-whitespace` du dépôt la **rejette** dans du texte JSX
    (`skipJSXText` vaut `false` par défaut), tout en l'autorisant dans un
    littéral de chaîne (`skipStrings` vaut `true`). Mesuré : **11 erreurs eslint**
    sur `/upgrade` avant correction. La seule écriture qui satisfait les deux
    autorités est l'**entité** : `&nbsp;` `&laquo;` `&raquo;` (vérifié au
    navigateur : elles rendent de vrais U+00A0 et « »). Aucune autre `.tsx` du
    dépôt n'emploie ces entités — parce que les pages converties écrivent leur
    français dans `fr.ts`, où la règle ne mord pas. **Toute famille qui a du
    français en dur dans son JSX est concernée.**

13. **Deux libellés en doublon sur la carte de palier** (pré-existant) : la
    pastille et le titre rendent le même mot — « Trial » / « Trial » pour un
    compte en essai, « Read-only » / « Read-only » ensuite. `Badge` et
    `accessTierToPlanLabel(accessTier)` disent la même chose. C'est de la copie,
    pas de la couleur.

14. **`/upgrade` recharge la page à la première visite d'un compte en essai.**
    Le `useEffect` « best-effort billing sync » (ligne ~112) appelle
    `window.location.reload()` dans son `finally` dès que `accessTier` vaut
    `none` ou `trial`. Constaté au navigateur : le pas de facturation qu'on vient
    de basculer revient à « Mensuel » tout seul. Une fois par session
    (`sessionStorage`), donc invisible en QA répétée. Non touché : c'est de la
    logique.

### Méthode — un piège de l'outil, pas du code

⚠️ **`getComputedStyle` via `javascript_tool` rend des valeurs PÉRIMÉES juste
après un changement de classe React.** Mesuré : l'interrupteur de `/upgrade`
portait `bg-fig-700` dans son `className` et `getComputedStyle` rendait encore
`rgb(142,120,134)` (`line-strong`) ; `translate-x-6` rendait `translate: 0px`.
Les mêmes utilitaires posés sur un élément-sonde créé à la volée rendaient les
bonnes valeurs, et **la capture d'écran montrait le rendu correct**. Le mémo du
dépôt dit « mesure plutôt que regarde » ; ici c'est l'inverse qui était vrai.
Conclusion pratique : pour un état qui vient de changer, **regarde** ; pour une
grandeur stable (taille de police, couleur de bordure au chargement, débordement
horizontal), **mesure**.

### Besoin de kit — un seul

**Il manque une variante de `Button` posée sur le bloc sombre.** `fig-700` sur
`fig-950` disparaît (les deux sont sombres), donc l'action de la carte mise en
avant de `/upgrade` est écrite à la main : `bg-paper text-ink hover:bg-fig-100`
(17,05:1 et 16,18:1). C'est la seule primitive que j'ai dû recopier. Nom suggéré :
`variant="inverse"`. Deux autres écrans du chantier auront le même besoin dès
qu'ils poseront un bouton sur `fig-950`.

---

## 9. Reproduire les mesures

```bash
cd "$(git rev-parse --show-toplevel)/frontend/src"

# Le motif de l'orchestrateur, MAIS hors commentaires — c'est le seul comptage
# qui décrit ce qui est rendu au navigateur.
strip() { python3 -c "
import re,sys,io
s=io.open(sys.argv[1],encoding='utf-8').read()
s=re.sub(r'/\*.*?\*/','',s,flags=re.S)      # blocs, y compris les {/* JSX */}
s=re.sub(r'^\s*//.*$','',s,flags=re.M)
sys.stdout.write(s)" "$1"; }

GRIS='(bg|text|border|ring|from|to|via|divide|placeholder|decoration|outline|shadow|accent|caret|fill|stroke)-(gray|slate|zinc|neutral|stone)-[0-9]{2,3}'
SAT='(bg|text|border|ring|from|to|via|divide|fill|stroke|hover:bg|hover:text|hover:border)-(emerald|green|red|rose|amber|yellow|orange|blue|sky|indigo|violet|purple|fuchsia|pink|teal|cyan|lime)-[0-9]{2,3}'
MORT='(violet|indigo|purple|fuchsia)-[0-9]{2,3}|#7c3aed|Powered by IKIZEN|YinYang'

for f in components/UserProfile.tsx pages/UpgradePlan.tsx pages/Account.tsx; do
  echo "$f  gris=$(strip $f|grep -cE "$GRIS")  sat=$(strip $f|grep -hoE "$SAT"|wc -l)  mort=$(strip $f|grep -hoE "$MORT"|wc -l)"
done

# le vocabulaire de rayon, avant/après
grep -hoE 'rounded(-(none|sm|md|lg|xl|2xl|3xl|full|card|fiche|part))?\b' <fichier> | sort | uniq -c
```

Vérification au navigateur : `bash scratchpad/plateforme/qa-session.sh house`,
puis `/account`, `/account?tab=subscription`, `/account?tab=settings`, `/upgrade`,
à **320 px et 1280 px** — plus le persona `coach`, `UserProfile` servant les deux
rôles.

⚠️ **Astuce d'isolement, utile aux autres familles :** le profil du navigateur est
partagé, et poser le jeton de QA sur `http://localhost:<port>` **déconnecte les
autres sessions** (même origine, même `localStorage`). J'ai servi la même app sur
**`http://app.localhost:<port>`** — hôte différent, donc **origine différente,
donc `localStorage` séparé**. Aucun jeton d'autrui touché.
