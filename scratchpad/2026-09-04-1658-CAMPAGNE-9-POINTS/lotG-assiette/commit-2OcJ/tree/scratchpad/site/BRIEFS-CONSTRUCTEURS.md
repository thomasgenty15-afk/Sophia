# Les six briefs constructeurs — socle commun + brief segment

> Préparé en Phase 1 pendant que la charte se construit. Le socle est copié **en
> entier** dans chacun des six prompts, suivi du brief segment.
>
> ⚠️ Les briefs 1, 2 et 3 **divergent du MASTER** : trois de ses preuves sont fausses.
> Voir `AUDIT-SITE.md` §5. Les corrections sont intégrées ci-dessous.

---

## SOCLE COMMUN (copié dans les six)

**AVANT TOUT : invoque le skill `frontend-design:frontend-design`** (outil Skill,
`skill: "frontend-design:frontend-design"`). Tu construis une page de vente : sa méthode
— brainstorm, plan, critique, build, critique encore — est exactement ce qu'il faut ici.
La charte fixe déjà la palette et la typo ; ce que le skill t'apporte, c'est la
**discipline de composition** et l'exigence que la page ne ressemble pas à un gabarit.

**Tes deux entrées, à lire avant d'écrire une ligne :**
- `scratchpad/site/AUDIT-SITE.md` — les faits vérifiés. **Tu ne re-vérifies rien, tu
  consommes.** Un fait absent de ce document n'entre pas dans ta page.
- `scratchpad/site/design/CHARTE.md` + `tokens.css` + les 2 SVG étalons dans
  `scratchpad/site/design/` — la charte. **Tu l'appliques, tu ne la rediscutes pas.**

Tu construis UNE page de vente. Ton objectif n'est pas de décrire le produit, c'est de
**convertir ton acheteur** — et ton acheteur est défini dans ton brief segment, il est le
seul lecteur qui compte.

### La méthode, dans l'ordre

1. **Recherche** (~30 min max) : qu'est-ce qui fait agir CET acheteur ? Quelles objections,
   quels mots à lui, qu'est-ce que la concurrence lui dit déjà ? (WebSearch autorisé.)
   Consigne **5 lignes** de conclusions dans ton rapport — pas un mémoire.
2. **Le message minimal** : UNE douleur, UNE promesse, UNE preuve, UN geste. Écris d'abord
   la page en **12 phrases maximum** dans ton rapport. Si elle ne convainc pas en 12
   phrases, plus de texte ne la sauvera pas.
3. **La page** : chaque section = une idée, portée d'abord par une **figure** (SVG inline
   au style de la charte, ou maquette stylisée du produit), le texte en légende. **Jamais
   deux sections de texte consécutives sans figure.** Le lecteur qui ne lit QUE les titres
   et les figures doit comprendre l'offre entière — c'est le test.

### Contraintes dures

- **Chaque claim factuel porte son ancre en commentaire JSX** : `{/* fact: C8 — FF-044,
  20260810260000:179 */}`, en citant l'identifiant du tableau de l'audit (C1…C17, B1…B33).
  Un claim sans ancre sera supprimé en review — écris-le ancré ou ne l'écris pas. Le dépôt
  a une cicatrice récente : une page promettait « jamais de calories » trois centimètres
  au-dessus de trois chiffres.
- **On ne promet pas ce qui n'est pas livré.** Lis `AUDIT-SITE.md` §8 (les 12 interdits)
  et §9 (les silences délibérés S1-S12). Ils te concernent tous, même ceux qui semblent
  appartenir à l'autre monde.
- **CTA** : un seul CTA principal, répété, jamais deux offres concurrentes.
  B2C → `/start`. B2B → `/auth?role=coach`.
- **i18n** : AUCUNE chaîne en dur. Toutes les clés dans **ton** namespace, EN **et** FR
  livrés ensemble, **mêmes trous d'interpolation** (`{name}`) des deux côtés. Le FR est
  une **réécriture qui sonne juste**, pas un calque : c'est une page de vente. Marque,
  e-mails et prix ne se traduisent pas.
- **Tu n'écris QUE** : `frontend/src/keel/pages/<TaPage>.tsx` + tout sous
  `scratchpad/site/<segment>/` (`keys.en.ts`, `keys.fr.ts`, `RAPPORT.md`, tes SVG).
  **Tu ne touches ni `en.ts`, ni `fr.public.ts`, ni `App.tsx`, ni `catalog.ts`, ni
  `sitemap.xml`, ni `Marketing.tsx`, ni `PublicHeader.tsx`** — l'orchestrateur intègre.
  Ta page importe `t()` et cite ses clés comme si elles existaient déjà ; l'intégration
  les y mettra. **Ta page ne compilera pas seule, et c'est normal.**
- **Mobile d'abord** : compose à 320 px, élargis ensuite. `flex-1` ne rétrécit pas un
  input (`min-width: auto`) — teste à 320.
- **Accessibilité** : hiérarchie de titres réelle (un seul `<h1>`), `alt`/`aria-label` sur
  chaque figure, focus visible, `aria-hidden` sur le décor pur.
- **Longueur** : ≤ 490 lignes de TSX. L'ancienne page en faisait ~1000. Si tu débordes,
  c'est que tu expliques au lieu de montrer.

### Livrables

La page, `keys.en.ts`, `keys.fr.ts`, tes SVG, et `RAPPORT.md` — qui contient : la recherche
en 5 lignes, le message en 12 phrases, tes décisions, et la **liste de tes claims avec
leur identifiant d'audit**.

---

## BRIEF 1 — `/meal-prep` · le solo · namespace `mealprep`

**Ton acheteur.** Il fait déjà du meal prep, ou veut s'y mettre. Il veut perdre ou prendre
du poids. Son comportement actuel **EST** l'unité du produit : la session de cuisine.

**Sa douleur.** La charge de décider quoi cuisiner. La lassitude du dimanche. Les plans qui
ignorent son objectif.

**Tes preuves** (et leurs identifiants d'audit) :
- **C3** — le plan est fait de **sessions de cuisine**, pas de plats. C'est l'unité, et
  c'est un objet réel du code jusqu'à l'écran.
- **C5** — les courses tombent en **vagues** qui suivent la fraîcheur (`MAX_FRIDGE_DAYS = 3`).
  ⚠️ Réserve honnête : les vagues sont masquées quand il n'y en a qu'une.
- **C7** — ⚠️ **CORRECTION DU MASTER.** Le MASTER te disait d'écrire « le swap en cours de
  semaine ». **Ce mécanisme n'existe pas** (audit §5.1). Ce qui existe, et qui est un
  meilleur argument : **décaler un plat, décaler une session, ou déclarer qu'on ne cuisine
  pas ce soir** — trois gestes réels. La semaine encaisse l'imprévu **sans être refaite**.
- **C13** — la branche `solo` du parcours d'entrée existe : ta page mène à un tunnel qui
  l'attend.
- **C15** — l'angle anti-tracker : Sophia n'est **pas** une app de comptage. Pas de score,
  pas de série, pas de pesée publique. ⚠️ **NE PAS écrire « jamais de calories »** — c'est
  faux depuis FF-059. Formulation tenable : *les chiffres sont éteints par défaut, et
  quatre verrous décident si on peut les allumer.*
- **PIVOT-FOYER §5** — « l'entrée est à 1 » : le produit livre sa valeur entière à une
  seule personne dès le premier jour. La famille est l'upgrade, jamais le ticket d'entrée.

**Prix** : le foyer à 12,99 €/mois **couvre une personne seule** — c'est un produit
complet, pas une version amputée (C1). ⚠️ **Aucune durée d'essai, aucun bouton d'achat**
(audit §8 n°1).

---

## BRIEF 2 — `/couples` · les objectifs divergents · namespace `couples`

**Ton acheteur.** Un couple dont les deux objectifs divergent : lui prend du muscle, elle
perd du gras — ou l'inverse, et ta copie ne doit pas figer les rôles.

**Sa douleur.** Deux régimes = deux casseroles = abandon en quinze jours.

**C'est LA démonstration unique du produit** : *une seule cuisine, deux directions.*
Ta figure centrale est évidente — **un plat, deux assiettes annotées**.

**Tes preuves :**
- **C4** — ⚠️ **CORRECTION DU MASTER, à formuler au mot près.** La bifurcation est réelle
  (`SERVING_DIRECTION` sur 6 objectifs, tronc commun = MIN, deltas calculés), **mais ce qui
  atteint l'écran est une PHRASE, jamais un gramme** — et sur `/app/household` seulement
  (audit §5.3). Donc : ta figure annote les deux assiettes **en mots** (« une part plus
  généreuse de la protéine », « plus de légumes sur cette assiette »), **jamais en
  grammes**. Et **pas de « garanti »** : rien ne vérifie que le modèle a différencié.
- **C8 / FF-048** — le **profil réclamé** (+2 €/mois) donne à l'autre son accès, son
  objectif et sa ligne à lui. Le maître n'est jamais compté (C1).
- **C3** — une session de cuisine, un plat, deux parts : personne ne cuisine deux fois.
- **C13** — la branche `pair` du parcours existe.

**Prix** : 12,99 € le foyer + 2 € pour le second profil réclamé (C1). Mêmes réserves qu'en
brief 1 sur l'essai et l'achat.

---

## BRIEF 3 — `/families` · la famille · namespace `families`

**Ton acheteur.** La personne qui porte la **charge mentale** de nourrir 3+ bouches aux
besoins différents.

**Sa douleur.** Le « on mange quoi ? » quotidien. Les allergies qui font peur. Les enfants
difficiles. Cuisiner triple.

**Tes preuves :**
- **C8** — les **bouches sans compte** : les enfants existent dans le plan **sans écran ni
  compte**. C'est un argument parents/écrans, et il est entièrement vrai.
- **C9** — **l'allergie d'une bouche gouverne TOUTE la casserole**, en **fail-closed** :
  si les contraintes sont illisibles, la génération **refuse** (503), elle ne devine pas.
  C'est ta preuve la plus forte — traite-la comme telle.
  ⚠️ Trou nommé : la réponse `plan_question` ne relit pas l'union du foyer. Donc ne pas
  écrire « partout » ni « dans chaque réponse ».
- **C10** — les portions suivent l'âge **sans jamais mettre un enfant au régime** :
  ceinture structurelle, un mineur n'est **jamais** une cible nutritionnelle.
- **C12** — ⚠️ **CORRECTION DU MASTER.** Le MASTER te disait d'écrire « le conseil de
  famille : chacun dit son envie, le plan arbitre **et dit ce qu'il a arbitré** ».
  **Ce mécanisme est mort** (audit §5.2) : aucune récolte par membre, aucun arbitrage en
  code, et l'arbitrage n'est jamais restitué. Ce qui existe : **une ligne d'envie de la
  semaine, écrite par le maître, que le générateur lit et avec laquelle il compose.**
  Écris ça, et rien de plus.
- **C14** — ⚠️ **PAS de « 90 secondes »** : non mesuré dans le dépôt (règle S8). Dis ce
  qu'on demande pour ajouter une bouche : prénom, date de naissance, objectif, allergies.
- **C13** — la branche `family` du parcours existe.

**Prix** : **12,99 € le foyer entier**, le maître jamais compté, plafond 8 bouches (C1).
C'est ton argument commercial le plus net : *le produit ne te punit pas d'être une famille.*
Mêmes réserves sur l'essai et l'achat.

---

## BRIEF 4 — `/coaches` · celui qui vend une formation · namespace `coaches`

**Ton acheteur.** Un praticien qui vend une formation et veut que sa méthode réponde à
toute sa cohorte sans qu'il écrive un message.

La page actuelle `/` déménage ici **et se refait** : même acheteur, même argument central,
mais au format de la refonte — de ~980 lignes à un tiers, les murs de texte deviennent des
figures. Lis `frontend/src/keel/pages/LandingPage.tsx` et ses clés `landing.*` dans
`frontend/src/keel/i18n/en.ts` : c'est ta matière première.

**Ce qui SURVIT sans discussion** : les silences délibérés S1-S12 de l'audit §9. Ils sont
l'en-tête du fichier actuel. **Recopie-les dans l'en-tête de ta nouvelle page.**

**Tes preuves :**
- **B7 + B8 → utilise la formulation B8b, PAS celle des pages actuelles.** Le « double
  verrou » est le meilleur argument du produit **et** les deux pages le sur-vendent :
  la doctrine n'est injectée qu'à **un** endroit (le composeur), et « chaque message
  sortant » est faux (4 surfaces scannées, 4 non scannées). Écris **B8b** :
  *« votre méthode entre dans le chat, dans chaque semaine et dans chaque repas que Sophia
  rédige ; et ce qu'elle écrit dans le chat est relu contre vos lignes rouges avant d'être
  envoyé — sans modèle dans cette boucle. »*
- **B9** — chaque ligne rouge porte son **`instead`**, dans les mots du coach, signé de son
  nom. L'élève ne reçoit **jamais** un refus.
- **B10** — 4 points d'injection. C'est **sous-vendu** aujourd'hui : sers-t'en.
- **B11 / B12 / B14** — le lundi en une page : cron hebdo, texte rendu par **gabarit**,
  jamais narré par un modèle. Les phrases citées sont **verbatim** — ⚠️ **B13** : le moteur
  dit « **built** », pas « wrote ». Si tu cites, cite juste.
- **B27** — la base **refuse** une ligne de semaine qui ne cite aucune conviction. Contrainte,
  pas convention.
- **B26** — la note 1:1, 1 500 caractères, utilisée jamais citée, incluse à l'export RGPD.
  ⚠️ « jamais citée » est une promesse de **prompt** sans vérificateur : ne pas la mettre au
  même rang que les lignes rouges.
- **B28** — révision et rollback sans perdre l'historique.
- **B1 / B4 / B5** — 7 €/élève/mois, pas de forfait plateforme ; on arrête de payer le mois
  où on éteint un siège ; essai 14 jours / 3 élèves. ⚠️ **B6** : ne pas écrire « positif dès
  le premier » sans dire qu'il faut au moins un élève inscrit pour s'abonner.
- **B31** — *« nous n'avons pas de chiffre de rétention à vous vendre, et nous n'allons pas
  en inventer un »*. **À conserver, c'est la meilleure ligne des trois pages.**

**⛔ Interdits spécifiques** : B15 (« pas de score d'adhérence » est vrai en pratique mais
vivant en code — ne pas en faire une règle gravée), B16, B18, B19, B25 (pas d'inbox).

---

## BRIEF 5 — `/gyms` · la salle indépendante · namespace `gyms`

**Ton acheteur.** Le propriétaire d'une salle indépendante — box, salle de force, studio
hybride. **Un compte coach = une salle** (B20) : ne dérive **jamais** vers « votre équipe ».

**Sa douleur.** Le **churn** : l'abonné vient pour maigrir, ne voit rien changer dans son
assiette, et part. La salle veut offrir un accompagnement nutrition **sans embaucher un
nutritionniste**.

Refonte **sur place** : lis `GymsLandingPage.tsx` et ses clés `gyms.*`. Même discipline —
faits ancrés, figures, copie au tiers.

**Tes preuves** : les mêmes B7-B12, B27, B28 que le brief 4, plus :
- **B30** — l'exemple chiffré (250 membres, 15 % de prise, 37 × 25 € − 259 € = 666 €/mois,
  ≈ 8 000 €/an). L'arithmétique est **juste** et la page l'étiquette « exemple » — garde
  les deux.
- **B17** — les cohortes **sont** scopées par coach : une salle ne voit que ses membres.
- **B32** — les membres entrent par **invitation e-mail** ; il n'existe pas de « copier le
  lien », et c'est une propriété de sécurité, pas un manque.
- **B21 / B22 / B23 / B24** — la cadence. ⚠️ **B23** : la relance du soir part aussi sur
  « mitigé », pas seulement sur « dur ». ⚠️ **B24** : ne **jamais** écrire « rien n'arrive
  la nuit » (S5) — le tap du soir peut tomber à 21 h 50.

**⛔ Le claim FAUX à supprimer, il est sur TA page** : **B2** — *« 6 € quand votre membre a
payé son année »*. L'intervalle annuel est celui **du coach**, jamais du membre. Écris
**B3** : *« 6 € pour un siège payé à l'année »*.
**⛔ Et B16**, qui est aussi sur ta page : *« quelles parties de votre méthode vos membres
tiennent, lesquelles ils lâchent, à quelle saison »* — **rien ne calcule ça**. Supprime.
**⛔ B18** : *« c'est votre nom sur les messages »* — faux, zéro personnalisation de marque.

---

## BRIEF 6 — `/communities` · la communauté payante · namespace `communities`

**Ton acheteur.** Le créateur d'une communauté payante, qui a déjà le récurrent.

**Sa douleur.** Un fil ne répond pas à une personne. C'est un problème **d'architecture**,
pas de charge de travail — et c'est la formulation qui convertit : il n'a pas besoin de
travailler plus, il a besoin d'une autre forme.

Refonte **sur place** : lis `CommunitiesPage.tsx` et ses clés `communities.*`.

**Tes preuves** : B7-B12, B27, B28 comme les briefs 4 et 5, plus :
- **B30** — l'exemple chiffré (500 membres, 30 % de prise, 150 × 12 € − 150 × 7 € =
  750 €/mois). Juste, étiqueté exemple.
- **B33** — les membres **ne se voient jamais entre eux** : pas de fil, pas de salon, pas de
  commentaire. ⚠️ Ne pas élargir en « personne ne partage jamais d'espace » (le foyer en est
  un).
- **B1bis** — il n'y a **aucune** intégration Skool / Circle / Discord / Kajabi, et la page
  le dit déjà. C'est vrai (C17) : garde-le, c'est désarmant.
- **B3** — ta page est la **seule des trois** qui formule correctement le 6 € annuel
  (« un siège payé à l'année »). **Garde ta formulation**, c'est `/gyms` qui a tort.
- **B5bis** — *« une couche qui tourne sous la communauté que vous avez déjà, et qui tient
  vos lignes pendant que vous dormez »* — vrai (chat toujours ouvert, relances différées
  hors 21 h-8 h).
- **B31** — la ligne sur l'absence de chiffre de rétention. À conserver.

**⛔ LE CLAIM FAUX N°1 DU SITE, ET IL EST SUR TA PAGE** : le bloc
`communities.doctrine.no_calories_*` — *« And no, Sophia doesn't count calories. » / « The
refusal is the feature. »* **C'est faux depuis FF-059** : le produit affiche des kcal
(`EnergyReadout.tsx:42`). `/` et `/gyms` ont abandonné ce cadrage le 2026-08-06 ; ta page est
la seule restée en arrière, alors que `en.ts:2409-2412` dit **par écrit** que ces blocs
doivent bouger ensemble. **Supprime ce bloc.** Si tu veux garder un argument sur les
chiffres, c'est **C15** : *éteints par défaut, quatre verrous pour les allumer.*
**⛔ B18** : pas de « votre marque » — zéro personnalisation.
