# RAPPORT — `/gyms`, la salle indépendante · agent 5

> **Date** 2026-08-12 · **Branche** `ff-001-quotidien-du-coach` · **Namespace** `gyms`
> **Livrables** `frontend/src/keel/pages/GymsLandingPage.tsx` (490 lignes, contre 1041)
> · `keys.en.ts` · `keys.fr.ts` · cinq SVG · `mock.html` (maquette de jugement, ne va pas au dépôt)

---

## 1. La recherche, en 5 lignes

1. **Ce qui le fait acheter, dans cet ordre** : la rétention d'abord (un membre qui suit
   aussi sa nutrition churne nettement moins, d'après Two-Brain Business), puis l'ARM
   (revenu moyen par membre), puis la différenciation contre la salle low-cost.
2. **Ses chiffres de référence** : churn mensuel 5-7 % (< 3 % chez les meilleurs, PushPress
   / Gymdesk), rétention annuelle moyenne 66,4 % (HFA 2025), ARM ~50 $/mois, et la
   nutrition pèse déjà ~4-6 % du CA des box qui en font (Two-Brain, Box Pro).
3. **Ses objections** : « encore un outil à faire adopter », « mes coachs en parlent déjà »,
   « ça va me faire du support », et la peur juridique de prescrire sans diététicien.
4. **Ce que la concurrence lui dit** : Trainerize/ABC vend un add-on à 20-45 $/mois ;
   Working Against Gravity et Healthy Steps Nutrition vendent l'**externalisation**
   (« concentrez-vous sur votre salle ») ; Stronger U vendait la marque blanche et a fermé
   fin mars 2026. Personne ne vend « votre méthode, tenue par une machine ».
5. **Ses mots** : *members*, *retention*, *churn*, *ARM*, *ancillary / second revenue
   stream*, *accountability*. Jamais « patient », jamais « client ».

**Ce que j'en ai tiré** : le trou concurrentiel n'est pas l'externalisation — c'est
l'inverse. Tous ses fournisseurs lui proposent de confier la nutrition à quelqu'un
d'autre ; nous lui proposons de **prêter sa propre méthode**. D'où la section `Fit`, qui
refuse explicitement le gérant qui délègue l'entretien : c'est notre différence, et c'est
aussi notre mode d'échec si on la vend à l'envers.

---

## 2. Le message, en 12 phrases

1. Vos membres viennent changer de corps ; vous les coachez trois heures par semaine, et
   vingt et un repas se passent sans vous.
2. C'est là que le palier arrive, et un membre qui ne voit plus rien changer ne vient pas
   vous en parler : il vient moins, puis il ne vient plus.
3. Sophia est un palier nutrition au-dessus de votre abonnement, tenu par un agent qui
   répond tous les jours depuis votre méthode.
4. Vous enregistrez une fois comment vous nourrissez des athlètes ; il répond à tous.
5. Vous payez 7 € par membre rattaché et vous fixez ce qu'ils paient par-dessus.
6. Exemple : 250 membres, 15 % de prise, 37 × 25 € encaissés, 259 € payés, **666 € gardés
   chaque mois** — et l'étiquette « exemple » reste collée dessus.
7. Le soir, un tap dit comment la journée s'est passée ; dès que ce n'est pas « All good »,
   une relance demande si c'était l'énergie, la faim ou le sommeil.
8. Trois jours de silence, un seul message, puis ça se tait.
9. Le lundi, une page calculée — jamais rédigée par un modèle — nomme qui vaut un message
   aujourd'hui, et vous ne voyez que vos membres.
10. Votre méthode entre dans le chat, dans chaque semaine et dans chaque repas que Sophia
    rédige ; et ce qu'elle écrit dans le chat est relu contre vos lignes rouges avant
    d'être envoyé, sans modèle dans cette boucle.
11. Chaque ligne rouge porte ce que vous faites à la place, dans vos mots : votre membre ne
    reçoit jamais un refus.
12. Nous n'avons pas de chiffre de rétention à vous vendre, et nous n'allons pas en
    inventer un — essayez 14 jours, 3 membres.

---

## 3. ⛔ LES TROIS CLAIMS FAUX ONT DISPARU — confirmation explicite

| # | Le claim faux, tel qu'il était sur la page | État |
|---|---|---|
| **B2** | `gyms.pricing.annual` = « 6 € for a member who has paid for their year up front. » | **SUPPRIMÉ.** La clé `gyms.pricing.annual` n'existe plus. Remplacée par `gyms.price.annual` = **« 6 € for a seat paid for a year up front. »** / FR **« 6 € pour un siège payé à l'année. »** C'est la formulation **B3**. |
| **B16** | `gyms.data.p2_title` / `gyms.data.p2_body` = « Your method, at the scale of the room » / « Which parts of your method your members hold, which ones they drop, and what time of year they drop them. » | **SUPPRIMÉ SANS REMPLACEMENT.** Les deux clés n'existent plus, et aucune phrase de la page ne prétend mesurer l'adhésion aux convictions. |
| **B18** | `gyms.fit.body` = « …and it is your name on the messages your members read. » | **SUPPRIMÉ.** La phrase a été retirée de `gyms.fit.body`. Le nom du gérant n'apparaît plus qu'une fois sur toute la page, dans `gyms.lock.instead` — et uniquement là où il est vrai : la substitution du verrou 2 (B9, `keel_output_locks.ts:99-113`). **Aucune dérive white-label** (B19) : ni « votre marque », ni « sous votre nom », ni « personnalisé à vos couleurs». |

**Contrôle mécanique** (`grep -ric` sur la page + les deux packs de clés) : les chaînes
« member has paid for their year », « your name on the messages », « which parts of your
method », « white-label », « votre marque » ne subsistent **que dans les commentaires qui
interdisent de les réécrire**. Zéro occurrence dans une valeur de clé.

**Un quatrième claim faux trouvé en route, et corrigé** : `B20` n'était pas violé
explicitement, mais `gyms.money.body` disait « Nobody on **your team** writes a menu ».
Corrigé en « Nobody **at your gym** writes a menu » : il n'y a pas de roster, et la phrase
ouvrait la porte au glissement que le brief interdit.

---

## 4. Ce que j'ai gardé, et pourquoi

- **B30** — l'exemple chiffré, **avec** son étiquette. 250 membres, 15 % → 37 (arrondi vers
  le **bas** : arrondir vers le haut flatterait notre côté), 37 × 25 € = 925 €,
  37 × 7 € = 259 €, reste **666 €/mois ≈ 8 000 €/an**. La figure porte le mot « AN EXAMPLE »
  dans son titre, et la légende nomme les **deux inconnues** (le taux de prise et le prix
  qu'il fixe) plus le seul chiffre qui n'est pas une estimation (le nôtre).
- **B31** — *« nous n'avons pas de chiffre de rétention à vous vendre, et nous n'allons pas
  en inventer un »*, placée dans la section **argent** : c'est là qu'un chiffre inventé
  aurait le plus de valeur commerciale, donc c'est là que le refus se voit.
- **B17** — la cohorte est scopée : `gyms.monday.scope`, sur sa propre ligne, à l'équerre.
- **B32** — l'invitation par e-mail est présentée comme une **propriété**, pas un manque :
  « une adresse à la fois… il n'y a pas de lien à faire circuler, et c'est voulu. »
- **B8b** — la formulation tenable, au mot près, et **pas** celle des pages en ligne.
- **B23** — la relance part sur tout ce qui n'est pas « All good ». La copie dit exactement
  *« on anything other than All good »* / *« dès que la réponse n'est pas « All good » »*.
- **B24 / S5** — la page dit l'inverse de l'interdit : *« Cette relance-là s'abstient entre
  21 h et 8 h. Le tap du soir, lui, a sa propre fenêtre, et il peut tomber à 21 h 50. »*

---

## 5. Mes claims, avec leur identifiant d'audit

| Où | Claim | Ancre |
|---|---|---|
| Hero | essai 14 jours / 3 membres, puis ça s'arrête | **B5** |
| Hero | invitation e-mail, pas de lien partageable | **B32** |
| Hero | rien à connecter à votre logiciel de salle | **C17** |
| Argent | 7 €/membre rattaché, aucun forfait plateforme | **B1** |
| Argent | on cesse de payer le mois où on éteint un siège | **B4** |
| Argent | l'exemple chiffré, étiqueté exemple | **B30** |
| Argent | aucun chiffre de rétention, et on n'en invente pas | **B31** |
| Tous les jours | trois boutons le soir, une fois par jour | **B22** |
| Tous les jours | relance d'axe sur tout sauf « All good » | **B23** |
| Tous les jours | 3 jours de silence = un message, puis silence | **B21** |
| Tous les jours | heures calmes sur la relance seule, tap à 21 h 50 | **B24 / S5** |
| Tous les jours | la maquette du fil cite le produit mot pour mot | **S10** |
| Lundi | page hebdo calculée, rendue par gabarit | **B11** |
| Lundi | seuils 48 h / 120 h sur le dernier entrant | **B14** |
| Lundi | vous ne voyez que vos membres | **B17** |
| Lundi | la maquette cite `CoachWeeklyPage` mot pour mot | **S10** |
| Une fois | révision et rollback sans perdre l'historique | **B28** |
| Une fois | un compte coach = une méthode, pas de roster | **B20** |
| Verrou | la méthode entre dans chat + semaines + repas | **B10** |
| Verrou | ce qui sort du chat est relu contre les lignes rouges | **B8b** |
| Verrou | chaque ligne rouge porte son `instead`, signé | **B9** |
| Verrou | la base refuse une ligne de semaine sans conviction | **B27** |
| Prix | 6 € pour un **siège** payé à l'année | **B3** (correction de B2) |
| Prix | il faut au moins un membre rattaché pour s'abonner | **B6** |
| Prix | vous facturez vos membres vous-même | **S12** |

23 ancres `{/* fact: … */}` dans le TSX, une par claim (deux claims voisins partagent
parfois un commentaire, chacun nommé).

---

## 6. Mes décisions

1. **La douleur ouvre, le revenu suit immédiatement.** L'ancienne page ouvrait sur le
   revenu, avec un raisonnement documenté (un argument de charge de travail plafonne). Il
   reste juste — mais le brief nomme le churn, et « vingt et un repas sans vous » **est**
   la cause du churn et le territoire du produit à la fois. Le revenu arrive en section 2,
   sans avoir perdu son rang.
2. **Cinq figures, zéro photo.** L'ancienne page avait 0 SVG sur 1041 lignes. La figure du
   héros dessine une **relation** (ce que la salle tient / ce qu'elle ne tient pas), ce que
   la charte identifie comme le trou du voisinage.
3. **Les deux maquettes de produit citent l'anglais, et le FR ne les traduit pas.**
   L'app authentifiée est déclarée en anglais ; traduire « All good » ou « Worth a message »
   montrerait à un visiteur français un écran qui n'existe pas. La figure 5 (la trace), elle,
   **se traduit** : c'est un schéma, pas une capture.
4. **J'ai corrigé la maquette du soir contre le code.** L'ancienne page faisait dire au
   produit « How did today go? » et « Good / Mixed / Hard ». Le produit dit
   **« How was today? »** et **« All good / So-so / Rough »**
   (`daily_pulse.ts:85-88,114-115`). C'était une violation de S10 en place ; la nouvelle
   maquette est verbatim, jusqu'au champ de saisie (« Write to Sophia ») et au bouton
   (« Send »).
5. **La fausse photo d'assiette est partie.** Elle était peinte en `bg-emerald-300` et
   `bg-amber-200` — deux couleurs d'**état** employées comme décor, exactement ce que la
   charte interdit (F10/F14), et une image d'un plat que personne n'a cuisiné.
6. **Le bloc « The numbers » de la maquette du lundi n'est pas dessiné.** Le sujet de la
   figure est la **liste des noms** ; les compteurs étaient une seconde idée dans la même
   figure, et les seuils qu'ils illustraient sont déjà dans la copie (B14).
7. **Pas de second lien dans la clôture.** L'ancienne page proposait « Sign in » sous le
   CTA, et un lien `/start` (l'offre B2C) dans le héros. Les deux sont partis : un seul CTA
   `/auth?role=coach`, répété trois fois, et `PublicHeader` porte déjà la porte « Sign in ».
8. **Un CTA local plutôt que `ButtonLink`.** `ui/Button.tsx` n'est pas encore passé aux
   jetons (`primary` = `bg-gray-900`), et six agents travaillent en parallèle : je ne
   touche pas une primitive partagée. Le CTA de cette page pose `bg-fig-700` / `text-paper`
   (9,98:1, charte §2.2). **À l'orchestrateur** : quand `Button.tsx` passera aux jetons,
   `Cta` (l. 99-104) redevient un `ButtonLink variant="primary"` en trois lignes.

---

## 7. Vérifications faites

- **490 lignes** de TSX (barre : ≤ 490). L'ancienne page : 1041.
- **`npx tsc -p tsconfig.app.json`** : les seules erreurs de la page sont les clés `gyms.*`
  absentes de `en.ts` (attendu, l'orchestrateur intègre). Une **vraie** erreur a été trouvée
  et corrigée en route : les clés construites par gabarit (`` `gyms.fig.monday_n${i}` ``) ne
  se réduisent jamais à l'union `MessageKey`, et le `as` masquait le défaut au lieu de le
  régler — les tuples sont désormais littéraux.
- **Parité des packs** : 111 clés utilisées par la page, 111 en EN, 111 en FR, aucune
  orpheline d'aucun côté, **aucun trou d'interpolation** (donc parité triviale).
- **Composition FR** : zéro U+202F (l'espace fine sans glyphe), zéro « → » dans une valeur,
  une seule apostrophe droite dans une valeur FR — et c'est la chaîne produit citée
  (`gyms.fig.thread_sub`), donc correcte.
- **Contrôle des figures (charte §6)** : `--ill-fig` exactement **2 fois** dans chacun des
  cinq SVG ; aucune décimale de coordonnée ; aucune Bézier ; aucun `opacity`, filtre,
  dégradé ni ombre ; aucune couleur d'état (émeraude, ambre, rouge, bleu) ; `<title>` et
  `<desc>` référencés partout.
- **Débordement de texte, mesuré au navigateur** (`getComputedTextLength`) sur les cinq
  figures, **en EN et en FR** : 65 nœuds de texte, **0 débordement**, 0 collision
  libellé/valeur. Le pire cas est la fiche argent, dont les valeurs alignées à droite
  tombent pile sur leur ancre à x=436.
- **Rendu** : desktop 1280 et mobile — pas de défilement horizontal de page
  (`document.scrollWidth == window.innerWidth`) ; les figures défilent **dans leur propre
  conteneur** via `fig-scroll`, comme la charte le prévoit.
- **Deux défauts trouvés à l'œil et corrigés** : (a) le filet chaud du troisième bloc de la
  trace était dessiné **sous** le contour blanc, donc invisible — il est passé à
  l'intérieur, à x=40, ce qui est l'idiome exact de l'app (`border-l-2 … pl-4`) ; (b) la
  carte du lundi se terminait 47 unités sous sa dernière ligne — hauteur ramenée de 380 à
  248.

---

## 8. À l'attention de l'orchestrateur

1. **Retirer `gyms` de `PUBLIC_NAMESPACES_PENDING_TRANSLATION`** (`i18n/catalog.ts:54`)
   dans le même commit que la fusion du pack FR : c'est ce chantier qui ferme la dette.
2. **Aucune clé `gyms.*` de l'ancien pack n'est réutilisée telle quelle** — les noms de
   sections ont changé (`gyms.pricing.*` → `gyms.price.*`, `gyms.data.*` → `gyms.monday.*`,
   `gyms.diff.*` → `gyms.lock.*`, `gyms.mock.*` → `gyms.fig.*`, `gyms.closing.*` →
   `gyms.close.*`). **Remplacer le bloc entier**, ne pas fusionner clé par clé : deux clés
   au même nom porteraient deux copies différentes.
3. **Hors périmètre, à remonter** : `CoachBillingPage.tsx:93-94` porte encore le claim FAUX
   **B2** — « 6 € quand votre élève a payé son année » — **dans le produit payant**. Ma page
   ne peut pas le corriger, mais un gérant qui lit la vitrine puis son écran de facturation
   verra deux versions de la même remise, dont une fausse.
4. **`mock.html`** est une maquette de jugement (elle inline les jetons et les polices) :
   elle **ne va pas au dépôt**. Les cinq `.svg` sont la référence des figures.
