# MASTER — La refonte du site public : 6 pages de vente, 2 mondes, 1 marque

> **Mission en une phrase.** Le site public devient un site **B2C d'abord**
> (trois landing pages pour trois cibles foyer) avec une porte
> « For professionals » vers le monde B2B existant (trois pages refaites) — le
> tout sous **une** charte graphique neuve, en **deux langues**, avec des pages
> qui **montrent** au lieu d'expliquer, et dont chaque section est jugée sur
> **la conversion de son segment**.

Tu es l'agent **orchestrateur**. Tu ne rédiges pas les six pages toi-même : tu
lances des sous-agents (l'outil Agent), tu intègres leurs livraisons, tu fais
tourner les reviews, et tu produis le rapport final. Ce document est ta seule
autorité — il contient l'état mesuré du dépôt, l'architecture cible, les briefs
de chaque agent, et les preuves exigées.

---

## 0. Règles opératoires — non négociables

1. **Branche `ff-001-quotidien-du-coach`**, aucune autre. Pas de push, pas de
   merge.
2. **`git add -A` interdit.** D'autres sessions écrivent dans ce dépôt en même
   temps. Chaque commit liste explicitement ses chemins. Un commit par phase.
3. **Commandes à risque : jamais seul** (`supabase db push/reset`,
   `functions deploy`, `secrets`, `link`). Ce chantier est 100 % frontend — tu
   ne devrais **jamais** en avoir besoin. Si un besoin apparaît, c'est un signal
   que tu sors du périmètre.
4. **Vérifications** : `npx tsc -b` (c'est `tsconfig.app.json` qui vérifie ;
   `tsconfig.json` est un solution file qui ne vérifie rien) et
   `npx vitest --config vitest.config.ts run`. Le hook de commit typecheck tout
   le frontend : si le rouge vient d'un fichier d'une autre session, ne le
   « répare » pas — consigne, commite tes chemins.
5. **Sous-agents et collisions.** Les six constructeurs tournent **en
   parallèle** mais n'écrivent **jamais** dans un fichier partagé (`en.ts`,
   `fr.public.ts`, `App.tsx`, `catalog.ts`, `sitemap.xml`, `Marketing.tsx`).
   Chacun écrit : son fichier de page (nom distinct → zéro collision) + ses
   fragments sous `scratchpad/site/<segment>/`. **Toi seul** intègres les
   fichiers partagés, en série, entre les phases.
6. **Navigateur** : `preview_start` (launch.json existe). Screenshots à
   `scroll 0` uniquement — le panneau ne repeint pas ailleurs ; pour montrer un
   bas de page, décale le contenu, ne scrolle pas. Teste à **320 px et
   1280 px**.
7. **Une décision bloquante se prend, elle ne s'attend pas.** Tranche, applique,
   documente dans le rapport (décision, options rejetées, pourquoi).
8. **Le skill `frontend-design` est OBLIGATOIRE.** Avant la Phase 1, vérifie
   qu'il apparaît dans la liste des skills disponibles (nom exact possiblement
   préfixé par son plugin). **S'il est absent : arrête-toi** et demande à
   l'humain d'installer le plugin `frontend-design` (via `/plugin` dans un
   `claude` interactif) — c'est une exigence explicite du propriétaire, pas une
   option. Une fois présent : l'agent designer (Phase 1) et **chacun** des six
   constructeurs (Phase 2) doivent le charger via l'outil Skill **avant
   d'écrire le moindre JSX ou CSS**, et le dire dans leur rapport. Le brief de
   la charte (§ Phase 1) complète ce skill, il ne le remplace pas.

---

## 1. L'état mesuré — 2026-08-12, vérifié dans le code

### 1.1 Ce qui existe

| Route | Fichier | Acheteur | Lignes |
|---|---|---|---|
| `/` | `keel/pages/LandingPage.tsx` | le coach qui vend une **formation** | 979 |
| `/gyms` | `keel/pages/GymsLandingPage.tsx` | la **salle** indépendante (churn) | 1041 |
| `/communities` | `keel/pages/CommunitiesPage.tsx` | la **communauté payante** | 1007 |

Le diagnostic du propriétaire est exact et mesurable : ~1000 lignes par page,
presque tout est du texte, zéro illustration, zéro schéma. Le B2C n'a **aucune**
page de vente — `/start` est un formulaire d'inscription, pas un argument.

### 1.2 Les conventions en vigueur (décisions, pas accidents)

- **Un namespace i18n par page, jamais de clé partagée** — même texte ⇒ deux
  clés. Une clé commune imposerait en silence à deux pages l'ajustement fait
  pour la troisième.
- **`keel/components/ui/Marketing.tsx`** porte les seules primitives partagées
  (`Kicker`, `SectionTitle`, `PriceCard`). Les maquettes restent locales à leur
  page.
- **Redirection du visiteur connecté sur `/` seulement** — jamais sur les pages
  secondaires : ce sont des liens qu'on envoie, renvoyer le lecteur connecté
  dans son espace ferait passer le lien pour cassé.
- **« keel » n'apparaît jamais dans une URL**, aucun nom de plateforme non plus
  (pas d'intégration Skool/Circle/Discord).
- **Nouvelle page = namespace + route dans `App.tsx` + entrée dans
  `frontend/public/sitemap.xml`.**
- **Palette actuelle : clair uniquement, aucune teinte de marque** — toute
  couleur saturée est un ÉTAT (émeraude/ambre/rouge du kit Badge). ⚠️ C'est une
  décision **écrite** (en-tête de `LandingPage.tsx`) que ce chantier **renverse
  consciemment** — voir Phase 1. Une contrainte documentée survit à sa cause :
  celui qui la renverse doit réécrire les commentaires qui la portent, sinon le
  prochain lecteur « répare » la couleur.

### 1.3 Le mécanisme i18n — il est bon, on le garde tel quel

- `keel/i18n/catalog.ts` : `PUBLIC_NAMESPACES` liste les namespaces de la
  vitrine ; le type `PublicMessages` en dérive ; `fr.public.ts` **ne compile
  pas** s'il manque une clé. C'est la seule garantie qui tienne — pas de
  `Partial`, pas de repli anglais silencieux.
- `parity.int.test.ts` garde en plus : pas de clé française orpheline, et les
  **mêmes trous d'interpolation** (`{name}`) des deux côtés.
- Aujourd'hui `gyms`, `communities`, `start`, `join`, `invite` sont dans
  `PUBLIC_NAMESPACES_PENDING_TRANSLATION` : `/gyms` et `/communities` restent en
  anglais quand la vitrine est en français. **Ce chantier ferme cette dette pour
  les six pages de vente** : puisque la copie est réécrite minimale, le pack
  français s'écrit en même temps que l'anglais — c'est le moment le moins cher
  de toute l'histoire du produit pour le faire.
- Le FR n'est **pas une traduction littérale** : c'est une page de vente,
  réécrite pour sonner juste (l'en-tête de `fr.public.ts` fait loi). Marque,
  e-mails, prix ne se traduisent pas.

### 1.4 Les faits commerciaux — à lire dans le code, pas à inventer

| Fait | Source d'autorité |
|---|---|
| B2C : **12,99 €/mois** le foyer + **2,00 €/mois** par profil réclamé ; le maître n'est jamais compté ; plafond 8 bouches | `docs/fonctionnalites/le-foyer/FF-049-le-prix-du-foyer.md` + `household.ts` |
| B2B coach : **7 €/élève/mois** (6 € si l'élève paie à l'année), **plus de forfait plateforme** | `CoachBillingPage.tsx:94` |
| Le produit B2C | `docs/keel/PIVOT-FOYER.md` (sessions de cuisine, portions par objectif, vagues de courses, conseil de famille) + `docs/fonctionnalites/le-foyer/` |
| Le produit B2B | `docs/keel/MODEL.md` + `docs/keel/VALEUR-COACH.md` |

---

## 2. L'architecture cible

```
                              ┌──────────────────────────────┐
   B2C  (le défaut)           │   For professionals ⇄ For you │        B2B
                              └──────────────────────────────┘
  /            l'accueil B2C — le produit foyer, et les 3 portes
  /meal-prep   CIBLE 1 · le solo qui fait du meal prep (perte/prise de poids)
  /couples     CIBLE 2 · le couple à objectifs divergents
  /families    CIBLE 3 · la famille avec enfants

  /pro         l'accueil B2B — la méthode du pro, et les 3 portes
  /coaches     CIBLE 4 · celui qui vend une formation   (ex-contenu de /)
  /gyms        CIBLE 5 · la salle indépendante           (refonte sur place)
  /communities CIBLE 6 · la communauté payante           (refonte sur place)
```

**Décisions déjà prises — ne pas rouvrir :**

1. **`/` devient B2C.** Le contenu coach actuel déménage vers `/coaches`.
   Redirection 301-like (`<Navigate replace>`) de rien : `/` change de contenu,
   c'est tout. Les anciens liens profonds (`/gyms`, `/communities`) ne bougent
   pas.
2. **L'interrupteur est dans le header, les deux sens.** Côté B2C : « For
   professionals » → `/pro`. Côté B2B : « For your household » → `/`. C'est de
   la navigation de **marque** : un lien discret mais toujours visible, pas un
   toggle d'application.
3. **Redirection du connecté : sur `/` et `/pro` seulement.** Les quatre pages
   segment sont des liens qu'on envoie — pas de redirect (convention existante).
4. **Deux accueils courts, quatre + deux pages segment.** `/` et `/pro` sont des
   **halls** : la promesse commune, la preuve la plus forte, et les trois portes
   avec « c'est pour moi si… ». Une page segment fait l'argument complet de SON
   acheteur. Un hall ne dépasse pas la moitié de la longueur d'une page segment.
5. **Le sélecteur de langue EN/FR reste dans le header** (`LocaleSwitch`
   existe), et **les six pages + les deux halls sortent bilingues** — aucune
   entrée dans `PENDING_TRANSLATION` pour une page de vente à la fin du
   chantier.

---

## 3. Les phases

```
Phase 0        Phase 1           Phase 2                Phase 3            Phase 4
AUDIT     →    CHARTE       →    6 CONSTRUCTEURS   →    REVIEWS       →    CORRECTIONS
(toi)          (1 agent)         (parallèle)            (8 agents)         + PREUVES
               + validation      + ton intégration      3 lentilles        (toi)
               humaine si                               × vagues
               possible
```

### Phase 0 — L'audit (toi, ~1 h)

Produis `scratchpad/site/AUDIT-SITE.md` :

1. **Inventaire des claims factuels** des trois pages actuelles : chaque
   affirmation vérifiable (prix, mécanisme, promesse de sécurité), avec son
   ancre repo si elle existe, marquée `VRAI / FAUX / NON PROUVÉ`. Ce tableau est
   l'héritage que les constructeurs reçoivent — ils ne re-vérifient pas, ils
   consomment.
2. **Inventaire des primitives UI** réutilisables (`Marketing.tsx`, `Button`,
   `Card`, `SEO`, `PublicHeader`, `LocaleSwitch`, `legalEntity.ts`).
3. **Le poids** : lignes par page, ratio texte/visuel (compte les blocs `<p>` vs
   les blocs figures/maquettes). C'est la baseline que la refonte doit écraser.
4. **Les pièges du header mobile** : l'en-tête actuel a été **mesuré** (bloc de
   droite 275 px déconnecté, nom de page empilé sous la marque, « Legal » masqué
   sous `sm`). La refonte du header hérite de ces mesures ou les refait — elle
   ne les ignore pas.

### Phase 1 — La charte graphique (1 agent, puis toi)

**Agent « designer »** — son brief, à copier dans son prompt :

> **Avant tout : charge le skill `frontend-design` (outil Skill).** Il porte les
> exigences de direction esthétique de ce chantier ; tout ce qui suit s'y
> ajoute. Si tu ne le trouves pas dans ta liste de skills, arrête-toi et
> dis-le à l'orchestrateur — ne continue pas sans lui.
>
> Tu définis la charte graphique du site public de Sophia — un produit qui
> compose les repas d'un foyer (sessions de cuisine, portions par objectif,
> courses en vagues) et, côté pro, prête la méthode d'un coach à une IA fidèle.
>
> **Recherche d'abord.** Regarde ce que font les marques dont l'un ou l'autre
> monde est proche (planification de repas, cuisine familiale, coaching,
> logiciels sérieux à visage humain) — pour t'en démarquer en connaissance de
> cause, pas pour copier. Nomme 3 directions possibles, choisis-en une, dis
> pourquoi les deux autres perdent.
>
> **Contraintes dures :**
> - La charte doit couvrir **les deux mondes** : même marque sur `/families` et
>   `/coaches`. Ce qui peut varier entre B2C et B2B : la température (imagerie,
>   ton). Ce qui ne varie jamais : logo, palette, typo, primitives.
> - **Dans l'app**, la couleur saturée est réservée au SENS (émeraude = ok,
>   ambre = attention, rouge = échec). La teinte de marque de la vitrine ne doit
>   pas entrer en collision avec ces trois-là — sinon le jour où la charte entre
>   dans l'app, un bouton de marque ressemblera à un état.
> - Clair d'abord ; le sombre est hors périmètre.
> - Accessibilité : chaque couple texte/fond de la charte passe AA. Vérifie au
>   calcul, pas à l'œil.
> - Typographie : au plus deux familles, chargées localement (pas de CDN — le
>   dépôt bundle tout). Dis lesquelles, où les mettre, et le coût en Ko.
> - **Style d'illustration** : c'est la moitié de ta mission. Le site actuel est
>   un aplat de texte ; la refonte vit par ses figures. Définis UN style de SVG
>   inline (trait, aplats, grille, coins, épaisseur) que six agents différents
>   pourront appliquer sans se ressembler par accident ni diverger par
>   négligence. Livre 2 SVG d'exemple (une illustration de concept, une maquette
>   de produit stylisée) qui servent d'étalon.
>
> **Livrables** (tout sous `scratchpad/site/design/`) :
> 1. `CHARTE.md` — la direction, les couleurs (avec leurs rôles et leurs ratios
>    de contraste), la typo, l'échelle d'espacement, le style d'illustration,
>    et ce que chaque monde a le droit de faire varier.
> 2. `tokens.css` ou l'extension Tailwind (le dépôt est en Tailwind 4) — prête à
>    poser dans `frontend/src/`.
> 3. Les 2 SVG étalons.
> 4. Une maquette d'un hero (HTML statique dans le scratchpad, pas dans l'app)
>    pour juger la direction sur pièce.

**Toi, à la réception** : si l'humain est joignable, montre-lui la maquette et
attends son go (c'est LA décision de goût du chantier — elle lui appartient).
S'il ne répond pas et que la nuit doit avancer : choisis, consigne, et signale
en tête du rapport final que la charte n'a pas été validée humainement.
Ensuite : intègre les tokens dans le frontend, mets à jour `Marketing.tsx` (et
son commentaire d'en-tête sur « aucune teinte de marque » — voir §1.2), commite.

### Phase 2 — Les six constructeurs (parallèle) + ton intégration

Lance les six agents **en parallèle**. Chacun reçoit : le socle commun
ci-dessous + son brief segment + `CHARTE.md` + `AUDIT-SITE.md`.

#### Le socle commun des six (à copier dans chaque prompt)

> **Avant tout : charge le skill `frontend-design` (outil Skill), avant d'écrire
> le moindre JSX ou CSS.** S'il est absent de ta liste, arrête-toi et dis-le à
> l'orchestrateur. La charte (`CHARTE.md`) te donne les décisions de marque ; le
> skill te donne le niveau d'exécution attendu — les deux s'appliquent.
>
> Tu construis UNE page de vente. Ton objectif n'est pas de décrire le produit,
> c'est de **convertir ton acheteur** — et ton acheteur est défini plus bas, il
> est le seul lecteur qui compte.
>
> **La méthode, dans l'ordre :**
> 1. **Recherche** (~30 min max) : qu'est-ce qui fait agir CET acheteur ? Quelles
>    objections, quels mots à lui, qu'est-ce que la concurrence lui dit déjà ?
>    (WebSearch autorisé.) Consigne 5 lignes de conclusions dans ton rapport —
>    pas un mémoire.
> 2. **Le message minimal** : UNE douleur, UNE promesse, UNE preuve, UN geste.
>    Écris d'abord la page en 12 phrases maximum dans ton rapport. Si elle ne
>    convainc pas en 12 phrases, plus de texte ne la sauvera pas.
> 3. **La page** : chaque section = une idée, portée d'abord par une **figure**
>    (SVG inline au style de la charte, ou maquette stylisée du produit), le
>    texte en légende. Jamais deux sections de texte consécutives sans figure.
>    Le lecteur qui ne lit QUE les titres et les figures doit comprendre l'offre
>    entière — c'est le test.
>
> **Contraintes dures :**
> - **Chaque claim factuel porte son ancre repo en commentaire JSX** (`{/* fact:
>   FF-049 §… */}`). L'audit (`AUDIT-SITE.md`) te donne les faits vérifiés. Un
>   claim sans ancre sera supprimé en review — écris-le comme tel ou ne l'écris
>   pas. Le dépôt a une cicatrice récente : une page promettait « jamais de
>   calories » trois centimètres au-dessus de trois chiffres.
> - **On ne promet pas ce qui n'est pas livré.** Pas de calories (la décision
>   d'affichage existe mais le code ne l'applique pas encore), pas de canal 1:1
>   coach→élève (il n'existe pas, par design), pas d'app mobile native, pas
>   d'intégration de plateforme.
> - **CTA** : `/start` pour le B2C, l'essai coach pour le B2B — celui qui existe.
>   Un seul CTA principal, répété, jamais deux offres concurrentes.
> - **i18n** : AUCUNE chaîne en dur. Toutes les clés dans ton namespace
>   (`<segment>.*`), EN et FR livrés ensemble, mêmes trous d'interpolation. Le
>   FR est une réécriture qui sonne juste, pas un calque.
> - **Tu n'écris QUE** : `frontend/src/keel/pages/<TaPage>.tsx` + tout sous
>   `scratchpad/site/<segment>/` (`keys.en.ts`, `keys.fr.ts`, `RAPPORT.md`,
>   SVG). **Tu ne touches ni `en.ts`, ni `fr.public.ts`, ni `App.tsx`, ni
>   `catalog.ts`, ni `sitemap.xml`, ni `Marketing.tsx`** — l'orchestrateur
>   intègre. Ta page peut importer tes clés comme si elles existaient déjà dans
>   le mécanisme ; l'intégration les y mettra.
> - Mobile d'abord : compose à 320 px, élargis ensuite. `flex-1` ne rétrécit pas
>   un input (`min-width: auto`).
> - Page accessible : hiérarchie de titres réelle, `alt`/`aria` sur les figures,
>   focus visible.
>
> **Livrables** : la page, les deux fichiers de clés, les SVG, et
> `RAPPORT.md` (recherche en 5 lignes, le message en 12 phrases, les décisions).

#### Les six briefs segment

**Agent 1 — `/meal-prep` (B2C · le solo).** Il fait déjà du meal prep ou veut
s'y mettre ; il veut perdre ou prendre du poids. Son comportement actuel EST
l'unité du produit : la session de cuisine. Sa douleur : la charge de décider
quoi cuisiner, la lassitude, les plans qui ignorent son objectif. Ses preuves :
le plan par sessions (pas par plats), les portions calées sur SON objectif, les
courses en vagues qui suivent la fraîcheur (`MAX_FRIDGE_DAYS`), le swap en cours
de semaine. Angle anti-tracker : Sophia n'est **pas** une app de comptage — pas
de score, pas de série, pas de pesée publique. Prix : produit complet à une
personne (§5 de PIVOT-FOYER : « l'entrée est à 1 »).

**Agent 2 — `/couples` (B2C · le couple à objectifs divergents).** LA
démonstration unique du produit : **une seule cuisine, deux directions** — même
plat, portions bifurquées (lui prend du muscle, elle perd du gras, personne ne
cuisine deux fois). Sa douleur : deux régimes = deux casseroles = abandon en
quinze jours. Preuves : la bifurcation des portions par objectif (le générateur
foyer le fait, `member_portions`), le profil réclamé (+2 €) qui donne à l'autre
son accès, son objectif et son suivi de poids À LUI. La figure centrale de cette
page est évidente : un plat, deux assiettes différentes, annotées.

**Agent 3 — `/families` (B2C · la famille).** L'acheteur : la personne qui porte
la charge mentale de nourrir 3+ bouches aux besoins différents. Douleur : le
« on mange quoi ? » quotidien, les allergies qui font peur, les enfants
difficiles, cuisiner triple. Preuves : les bouches sans compte (les enfants
existent dans le plan sans écran ni compte — argument parents/écrans), l'allergie
d'une bouche gouverne TOUTE la casserole (fail-closed, FF-046), les portions par
âge sans jamais mettre un enfant au régime (ceinture structurelle : un mineur
n'est jamais une cible nutritionnelle), le conseil de famille (chacun dit son
envie de la semaine, le plan arbitre et **dit ce qu'il a arbitré**), l'ajout en
90 secondes. Prix : 12,99 € le foyer entier, le maître jamais compté.

**Agent 4 — `/coaches` (B2B · celui qui vend une formation).** La page actuelle
`/` déménage ici et **se refait** — même acheteur, même argument central, mais
au format de la refonte : sa copie passe de ~980 lignes à un tiers, ses murs de
texte deviennent des figures. Garde les faits déjà vrais (le double verrou de
doctrine, le lundi en une page, 7 €/élève, l'absence de canal 1:1 **comme
produit**), garde les silences délibérés (l'en-tête du fichier actuel liste ce
que la page s'interdit de promettre — ces interdits SURVIVENT à la refonte).

**Agent 5 — `/gyms` (B2B · la salle indépendante).** Refonte sur place. Douleur :
le churn — l'abonné qui vient pour maigrir, ne voit rien changer dans son
assiette, et part. La salle offre un accompagnement nutrition sous SA marque
sans embaucher un nutritionniste. Même discipline : faits ancrés, figures,
copie au tiers.

**Agent 6 — `/communities` (B2B · la communauté payante).** Refonte sur place.
Douleur : un fil ne répond pas à une personne (architecture, pas charge de
travail). Le créateur a déjà le récurrent ; Sophia rend son accompagnement
individuel-en-apparence à l'échelle, fidèle à sa méthode, vérifié contre ses
lignes rouges. Même discipline.

#### Ton intégration (en série, après réception)

1. Fusionne les clés dans `en.ts` et `fr.public.ts`, ajoute les namespaces à
   `PUBLIC_NAMESPACES` (et retire `gyms`/`communities` de
   `PENDING_TRANSLATION`). La compilation te dira ce qui manque — c'est le
   mécanisme qui travaille pour toi.
2. Routes dans `App.tsx` : `/` → nouvelle page B2C hub, `/coaches` → l'ex-`/`,
   `/pro` → hub B2B, les quatre segments. Redirect connecté sur `/` et `/pro`
   seulement.
3. **Les deux halls (`/` et `/pro`) : tu les construis toi-même** à partir des
   six pages livrées — la promesse commune, la preuve la plus forte de chaque
   segment, les portes « c'est pour moi si… ». C'est un travail de synthèse,
   pas de création : il exige d'avoir lu les six.
4. **Le header** : l'interrupteur des deux mondes + la nav des portes du monde
   courant + `LocaleSwitch`. Hérite des mesures mobiles de l'audit (§ Phase 0.4).
5. `sitemap.xml`, `SEO` (title/description par page, dans les deux langues),
   `robots.txt` inchangé.
6. `npx tsc -b` + vitest (la parité i18n doit être verte) + parcours navigateur
   des 8 pages aux 2 largeurs × 2 langues. Commit.

### Phase 3 — Les reviews (le travail que personne ne saute)

Trois lentilles, chacune par un agent frais qui n'a **pas** construit ce qu'il
juge. Lance la vague 1 en parallèle (6 agents), puis les vagues 2 et 3 (1 agent
chacune) sur le site intégré.

**Vague 1 — conversion, un agent par page.** Brief :

> Tu es un directeur de conversion sceptique. Tu regardes la page `<URL>` au
> navigateur (320 px puis 1280 px, EN puis FR — les quatre). Tu es l'acheteur
> suivant : `<définition du segment>`. Rends `scratchpad/site/review-<segment>.md` :
> - Le test des 5 secondes : capture du hero seul — que comprend-on ? Pour qui ?
>   Quel geste ?
> - Le chemin de l'objection : où la page perd-elle CET acheteur ? Cite la
>   section.
> - Le test titres+figures : masque mentalement les paragraphes — l'offre
>   tient-elle debout ?
> - CTA : visible sans scroller ? Répété ? Un seul ?
> - FR : est-ce que ça sonne écrit en français, ou traduit ?
> - Verdict par section : GARDER / COUPER / REFAIRE, avec une ligne de raison.
>   Une page dont on ne coupe rien n'a pas été relue.

**Vague 2 — l'honnêteté (1 agent, le plus important).** Brief :

> Parcours les 8 pages. Pour CHAQUE claim factuel : retrouve son ancre en
> commentaire, ouvre-la, et vérifie que le produit fait ce que la phrase dit —
> aujourd'hui, pas dans un chantier en cours. Rends la liste des claims
> `CONFIRMÉ / EXAGÉRÉ / FAUX / SANS ANCRE`. Les trois derniers sont des
> bloqueurs de mise en ligne. Cherche particulièrement : promesses de calories
> (le code refuse encore de les afficher), promesses de canal 1:1, promesses de
> suivi que le produit ne fait pas, prix qui divergent du code de facturation.

**Vague 3 — la cohérence de marque (1 agent).** Brief :

> Les 8 pages côte à côte (screenshots aux deux largeurs). Est-ce UNE société ?
> Palette, typo, style de figures, ton — liste chaque divergence avec sa page.
> Puis le chemin croisé : un visiteur B2C qui clique « For professionals »
> comprend-il en 5 secondes qu'il est au même endroit, côté pro ? Et l'inverse ?
> Enfin l'a11y : contrastes réels des pages rendues (pas de la charte), ordre
> des titres, alt des figures, navigation clavier du header.

### Phase 4 — Corrections et preuves (toi)

1. Applique les verdicts : chaque COUPER/REFAIRE de la vague 1, chaque
   EXAGÉRÉ/FAUX/SANS ANCRE de la vague 2, chaque divergence de la vague 3. Si
   un verdict te semble faux, tu peux le rejeter — **par écrit, avec la
   raison**, dans le rapport.
2. Re-vérifie : tsc, vitest, parité i18n, les 8 pages × 2 largeurs × 2 langues
   au navigateur.
3. Commit final + `scratchpad/site/RAPPORT-FINAL.md` :
   - avant/après mesuré : lignes par page, ratio texte/figures, nombre de claims
     ancrés ;
   - les décisions prises seul (charte non validée ? verdicts rejetés ?), avec
     les options écartées ;
   - ce qui reste ouvert (ex. traductions `start`/`join` hors périmètre) ;
   - les captures des 8 héros, deux langues.

---

## 4. Hors périmètre — exprès

- ❌ `/start`, `/join`, `/join-household`, `/auth` : les portes fonctionnelles ne
  bougent pas (leur traduction FR reste en dette déclarée, c'est un autre lot).
- ❌ L'app authentifiée (`/app/*`, `/coach/*`) : rien, pas même la charte — elle
  y entrera par un chantier à elle.
- ❌ `/le-plan` (legacy) et `/legal` : intouchés.
- ❌ Le mode sombre.
- ❌ Toute promesse produit nouvelle : la refonte change la **forme**, les faits
  restent ceux du code.
- ❌ Photos stock, vidéos, scripts externes, fonts CDN : tout est bundlé, tout
  est SVG/local.

---

## 5. La barre de qualité — ce que « fini » veut dire

1. Les 8 pages passent le **test titres+figures** (l'offre se comprend sans lire
   un paragraphe).
2. **Zéro claim sans ancre**, zéro claim FAUX ou EXAGÉRÉ survivant à la vague 2.
3. FR et EN complets sur les 8 pages, parité verte, et le FR se lit comme du
   français.
4. 320 px et 1280 px propres sur les 8, header compris.
5. La baseline de l'audit est **écrasée** : chaque page refondue fait au plus la
   moitié des lignes de l'ancienne, avec plus de figures que l'ancienne n'en
   avait en tout.
6. tsc + vitest verts, un commit par phase, rapport final complet.
