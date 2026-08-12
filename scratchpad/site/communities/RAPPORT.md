# RAPPORT — agent 6 · `/communities` · le créateur d'une communauté payante

> **Date** 2026-08-12 · **Branche** `ff-001-quotidien-du-coach` · **Namespace** `communities`
> **Livrables** `frontend/src/keel/pages/CommunitiesPage.tsx` (489 lignes, contre 1007) ·
> `keys.en.ts` + `keys.fr.ts` (132 clés chacun, à parité) · 6 SVG · `preview-figures.html`

---

## 1. La recherche, en 5 lignes

1. **Sa métrique est le churn mensuel adossé au MRR**, et les taux qui circulent chez lui
   (7-11 %/mois côté Skool) viennent de **blogs d'éditeurs d'outils, sans échantillon ni
   méthode** — du folklore. Le seul repère adossé du domaine santé est le *HFA 2025
   Benchmarking Report* (66,4 % de rétention annuelle), et il porte sur des salles physiques.
2. **Son objection n°1 n'est jamais dite frontalement** : *« si un bot répond, plus personne
   ne se répond entre membres »*. L'IA menace précisément le mécanisme qu'il facture — le
   *2025 Community Trends Report* de Circle pose la communauté comme premier facteur de
   rétention, donc son argument de vente et sa peur sont le même objet.
3. **Son objection n°2 a un nom dans son milieu : le « tone flattening »** — la voix lisse et
   vaguement professionnelle qu'un modèle produit quand on le laisse seul. Suivent : « l'IA va
   dire une bêtise en mon nom », « je ne migre pas, mon MRR est là », « mes membres paient pour MOI ».
4. **Les concurrents ont déjà écrit leur promesse, presque mot pour mot** : Circle AI (Eclipse
   2026) vend des agents *« trained on your content »*, et les outils tiers Skool promettent
   *« in your voice, 24/7 »*. Répéter ce triptyque, c'est se faire confondre avec eux.
5. **Le levier « ajouter un palier au-dessus » est la doctrine du milieu**, mais tous les taux
   publiés sont internes et non auditables. Ce qui est défendable n'est pas un taux : c'est que
   le palier se vend à une base **dont l'acquisition est déjà payée**, sans toucher à la
   plateforme, au prix d'entrée, ni à la culture.

**Conséquence sur la page** : B31 (*« nous n'avons pas de chiffre de rétention à vous vendre »*)
cesse d'être une précaution honnête et devient **le différenciateur** — c'est la seule page de
son marché qui refuse de citer un chiffre que tout le monde invente. Et B33 (aucune surface
sociale) cesse d'être une limite pour devenir **la garantie anti-cannibalisation** : Sophia ne
peut pas devenir le lieu où ses membres se retrouvent, parce qu'il n'y a pas de lieu.

---

## 2. Le message, en 12 phrases

1. Vous répondez en public, au groupe.
2. Ce n'est pas un problème d'heures : un fil, par construction, n'a pas de destinataire.
3. Vos membres le vivent d'une seule façon — ils n'ont jamais de réponse à eux.
4. Sophia est la couche individuelle qui se pose sous votre communauté.
5. Chaque membre du palier coaché a son espace, sa semaine et ses réponses, composés à partir
   de votre méthode.
6. Vous ne migrez rien : même plateforme, même prix d'entrée, mêmes publications — vous ajoutez
   une ligne à votre page de vente, vendue à des gens que vous avez déjà acquis.
7. Vos membres ne se voient jamais entre eux ici : pas de fil, pas de salon, pas de commentaire,
   donc rien qui puisse remplacer ce que vous avez construit.
8. Vos lignes rouges ne sont pas une consigne de prompt : ce que Sophia écrit dans le chat est
   relu contre elles avant l'envoi, sans modèle dans cette boucle.
9. Et chaque ligne rouge porte ce que vous dites à la place, dans vos mots : votre membre ne
   reçoit jamais un refus.
10. Le lundi, une page : qui parle encore, comment la semaine a été vécue, combien se sont
    composé une semaine à partir de votre méthode — et les silencieux sont sur la première ligne.
11. 7 € par membre sur ce palier et par mois, rien pour les autres, 6 € pour un siège payé à
    l'année.
12. Nous n'avons pas de chiffre de rétention à vous vendre, et nous n'allons pas en inventer un.

---

## 3. ⛔ Le bloc « no calories » : **supprimé, confirmé**

**Confirmation explicite : les trois clés `communities.doctrine.no_calories_title`,
`.no_calories_body` et `.no_calories_body2` n'existent plus.** Elles ne sont ni dans
`keys.en.ts`, ni dans `keys.fr.ts`, ni citées par `CommunitiesPage.tsx`. Le composant `Doctrine`
qui les rendait a disparu avec elles.

```
$ grep -rc "no_calories" scratchpad/site/communities/ frontend/src/keel/pages/CommunitiesPage.tsx
→ 0 partout, hors les commentaires qui EXPLIQUENT la suppression
```

Trois phrases partaient avec : *« And no, Sophia doesn't count calories »*, *« A deterministic
filter strips any calorie or macro target the model produces anyway »*, *« The refusal is the
feature »*. Elles étaient fausses depuis FF-059 (`plan/EnergyReadout.tsx:42-45` rend un nombre
de kcal sur `/app/plan` et `/app/today`), `/` et `/gyms` avaient abandonné ce cadrage le
2026-08-06, et l'en-tête du bloc dans `en.ts` disait **par écrit** que les trois devaient bouger
ensemble. C'était le seul claim FAUX du site **déjà en ligne**.

**Ce qui le remplace** : la borne n°4 de la section palier, `communities.tier.not4_*`, qui est
C15 — *les chiffres d'énergie sont éteints par défaut sur le compte d'un membre
(`profiles.energy_display_enabled` default `false`), et une chaîne de gardes décide si on peut
les allumer*. Aucun nombre de gardes n'est cité (S8 : un chiffre a une source qu'on peut
montrer, ou il n'apparaît pas ; l'audit dit 5, le brief dit « une chaîne » — j'ai écrit « une
chaîne »). S11 tient toujours dans les deux sens : la page n'annonce ni comptage par photo, ni
refus de comptage.

Un commentaire ⛔ en tête de `CommunitiesPage.tsx` **et** en tête de `keys.en.ts` porte la
raison de la suppression, pour qu'un futur lecteur ne « répare » pas l'absence.

### Deux autres claims retirés, non demandés par le brief

- **`communities.doctrine.rule1_*`** — *« No adherence score, no percentage, no streak, no
  leaderboard of your members »*. **B15** : vrai en pratique (le cron évaluateur est déprogrammé
  en 1:N) mais **vivant en code** — `coach_synthesis.ts:571-575` émet encore *« Average adherence
  on core lines: X% »* dès qu'une ligne existe, et `risk_band` atteint l'écran. Une page de vente
  ne grave pas une règle que le code peut démentir au prochain déploiement. C'était pourtant la
  règle la plus séduisante pour cette cible, qui rêve d'un classement.
- **`communities.lock.lock1/lock2`** — *« Your method goes into the prompt, on every message »* et
  *« Every outgoing message is scanned against your red lines »*. Faux tous les deux (**B7**,
  **B8**). Réécrits en **B8b**, qui nomme les surfaces réelles.

---

## 4. La structure : 7 sections, 6 figures

| # | Section | L'idée, en un mot | Figure |
|---|---|---|---|
| 1 | Hero | un fil ne répond pas à une personne | **A** concept — une question, deux destinations |
| 2 | Le palier + les 4 bornes | vous ajoutez une ligne, vous ne refaites rien | **B** concept — la même offre, deux fois |
| 3 | Les rôles | gardez les pairs, ajoutez ce qu'un groupe ne fera jamais | **C** concept — le troisième jour |
| 4 | Le lundi | dans un fil, vous ne voyez que les dix qui postent | **D** maquette — la page du lundi |
| 5 | Sa voix | il répond avec vos mots | **E** maquette — la fiche de doctrine |
| 6 | Le double verrou (**seul bloc sombre**) | relu avant envoi, sans modèle dans la boucle | **F** concept `on-dark` — la relecture |
| 7 | Le prix et la sortie | 7 €, et aucun chiffre de rétention | la `PriceCard` |

**Le test titres + figures passe** : un lecteur qui ne lit que les sept titres et les six dessins
comprend l'offre entière — un fil ne répond pas à une personne / vous ajoutez un palier sans rien
bouger / ce qu'un groupe ne fera jamais / ce qu'un fil ne vous dit jamais / vos mots / relu avant
envoi / 7 €.

### Le motif de la page

**Le trait de 2 à gauche d'une rangée = quelque chose qui s'adresse à cette rangée-là.** Ce n'est
pas une invention : `CoachWeeklyPage.tsx:243` borde déjà d'un `border-l-2` chaque élève signalé.
C'est l'équerre de la charte à l'échelle d'une ligne, et il revient dans les six figures :
figure A l'établit (un trait pour quatre rangées / quatre traits pour quatre), la colonne
« passe dans sa ligne à lui » le porte en HTML, la figure C ouvre le message du troisième jour,
la figure E ouvre la fiche « et ce que vous dites à la place », la figure F ouvre le seul message
qui part.

---

## 5. Décisions

| # | Décision | Pourquoi |
|---|---|---|
| D1 | **Les bornes remontent DANS la section du palier**, elles ne sont plus une section à part | C'est la même idée que « vous ne changez rien », et un « non » découvert après le chiffre annule le chiffre. Deux sections en une, et le lecteur a sa réponse au moment où il se pose la question |
| D2 | **La section `compare` (« un salon de plus, ou un salaire de plus ») est fondue en une phrase** de clôture des rôles | L'objection mérite d'être traitée, pas développée : s'y attarder lui donne plus de place qu'elle n'en a |
| D3 | **La section `doctrine` (3 règles) disparaît** | Règle 1 supprimée (B15), règle 2 déplacée dans la voix (B27, où elle prouve quelque chose), règle 3 déplacée dans le lundi (elle commente ce chiffre-là) |
| D4 | **Le lien vers `/start` a sauté** | Un seul CTA. C'est une seconde offre, elle vise un autre acheteur, et cette porte dépend d'un programme publié (`keel_free_signup_available`) qu'aucune page ne doit supposer ouvert (AUDIT §10) |
| D5 | **`ButtonLink variant="primary"` est employé tel quel**, sans surcharge de couleur | `ui/Button.tsx` est encore sur la grise d'avant-charte. Une classe `bg-fig-700` en `extra` se battrait avec `bg-gray-900` selon l'ordre de la feuille Tailwind — non déterministe. Les six pages héritent ensemble le jour où l'orchestrateur restyle la primitive. **À faire côté intégration** |
| D6 | **Les figures sont dans la page, pas dans `ui/Marketing.tsx`** | Règle conservée de l'audit §2 : une maquette partagée change de sens sur deux pages quand on en édite une |
| D7 | **Le FR traduit aussi les libellés de maquette** (`Cette semaine`, `Décrochage`…) | Précédent maison : `landing.mock.*` est traduit dans `fr.public.ts`. Cohérence avant littéralité |
| D8 | **Chaque figure est fusionnée dans sa section** | Une figure = un appelant. L'indirection ne servait qu'à faire deux fonctions là où il en faut une, et coûtait 40 lignes |
| D9 | **Aucune clause sur les données d'entraînement**, alors que la recherche la donne pour *table stakes* | Rien dans l'audit ne la couvre. On ne promet pas ce qu'on n'a pas vérifié — **à signaler au propriétaire** : c'est un trou concurrentiel réel sur ce marché |

---

## 6. Les claims, et leur ancre d'audit

| Ancre | Ce que la page en dit | Où |
|---|---|---|
| **B1** | 7 €/membre/mois, aucun forfait plateforme | `pricing.seat*` |
| **B3** | *« 6 € pour un siège payé à l'année »* — formulation correcte, **conservée contre celle de `/gyms`** (B2) | `pricing.annual` |
| **B4** | on arrête de payer le mois où on éteint un siège | `pricing.why` |
| **B5** | essai 14 jours / 3 membres, puis ça s'arrête | `hero.note`, `pricing.trial_note` |
| **B8b** | *votre méthode entre dans le chat, dans chaque semaine et dans chaque repas ; et ce qu'elle écrit dans le chat est relu contre vos lignes rouges avant envoi, sans modèle dans cette boucle* | `lock.lock1`, `lock.lock2` |
| **B9** | chaque ligne rouge porte son `instead`, dans les mots du coach ; le membre ne reçoit jamais un refus | `lock.trace_note`, `lock.close`, figure F |
| **B10** | quatre points d'injection : chat, semaine, repas individuel, repas foyer | `lock.lock1` |
| **B11** | le lundi, une page rendue **par gabarit**, jamais narrée par un modèle | `monday.body` |
| **B13** | la figure dit **« built »**, le mot du moteur — jamais « wrote » | `fig_monday.intent_line` |
| **B14** | seuils réels : 2 jours ouvrent `slipping`, 5 jours ouvrent `silent`, mesurés sur le dernier entrant | `fig_monday.*_hint`, `monday.figure_caption` |
| **B21** | 72 h de silence ⇒ **un** message, puis ça se tait ; un par épisode, au plus un par semaine | `roles.figure_caption`, figure C |
| **B24** | la relance ne part pas entre 21 h et 8 h — **et rien d'autre n'est dit sur la nuit** (S5) | `roles.agent_body` |
| **B27** | la base **refuse** une ligne de semaine qui ne cite aucune conviction | `voice.traceable` |
| **B28** | révision et rollback sans perdre ce que les membres ont reçu | `voice.revise` |
| **B30** | 500 membres, 3 sur 10 : 150 × 12 € − 150 × 7 € = **750 €/mois**, étiqueté exemple | `tier.example`, `tier.example_caption` |
| **B31** | *« nous n'avons pas de chiffre de rétention à vous vendre, et nous n'allons pas en inventer un »* — **conservée** | `pricing.no_number` |
| **B32** | entrée par invitation e-mail, **aucun lien à copier** : propriété de sécurité | `hero.note`, `tier.not1_body` |
| **B33** | les membres ne se voient jamais entre eux : pas de fil, pas de salon, pas de commentaire. **Non élargi** | `tier.not2_body`, `roles.body`, figure A |
| **C15** | les chiffres d'énergie sont éteints par défaut, une chaîne de gardes décide si on peut les allumer | `tier.not4_body` |
| **C17 / B1bis** | **aucune** intégration Skool / Circle / Discord / Kajabi, dit à voix haute | `tier.not1_body` |
| **S12** | aucun membre ne paie Sophia ; il n'existe aucun tunnel de paiement membre | `tier.billing`, `tier.not3_body` |

**Ce que la page ne dit nulle part** : aucun taux de rétention, aucune durée chiffrée, aucun
score d'adhérence, aucune bande de risque, aucune « votre marque » ni « votre nom sur les
messages » (B18), aucun « rien n'arrive la nuit » (S5), aucune boîte de réception (S1), aucune
application à installer (S4 — la borne n°1 dit l'absence d'intégration **positivement**, sans
jamais promettre qu'il n'y a « rien à installer »).

---

## 7. Les six figures, et les contrôles de la charte

Fichiers autonomes : `fig-a-lane.svg`, `fig-b-tier.svg`, `fig-c-third-day.svg`,
`fig-d-monday.svg`, `fig-e-doctrine.svg`, `fig-f-readback.svg`. Ils sont la référence ; la page
les rend avec des props alimentées par les clés i18n.

**Les neuf contrôles de CHARTE §6 passent sur les six** : `--ill-fig` exactement 2 fois · zéro
décimale dans les coordonnées · zéro Bézier · zéro `opacity`/`filter`/`gradient`/`shadow` · zéro
émeraude/ambre/rouge/bleu · épaisseurs 1 et 2 seulement · `<title>` **et** `<desc>` référencés ·
chaque chaîne est une chaîne produit ou un mot de la page · aucune taille de forme n'affirme une
mesure absente de l'audit.

Deux gardes structurelles méritent d'être nommées :

- **Figure B** — les deux offres sont le **même `<g id="offer">`, appelé deux fois par `<use>`**.
  On ne *peut* pas dessiner « le palier est plus gros » : la promesse *« ce que vous vendez déjà
  ne bouge pas »* est tenue par la structure du fichier, pas par la vigilance du relecteur. C'est
  le geste des deux assiettes de `etalon-concept.svg`.
- **Figure D** — les nombres tombent juste et concordent avec l'exemple de revenu :
  71 + 34 + 45 = 150, 58 + 26 + 11 + 55 = 150, et 150 = les trois membres sur dix d'une
  communauté de 500. Un coach qui compte le vérifie en dix secondes.

**Figure F, la seule sur fond sombre**, est un **concept** et jamais une maquette : F12 interdit
de poser une surface de produit sur du sombre, parce que le produit est en clair uniquement.
`.on-dark` remonte `--ill-fig` et `--ill-ink-soft` à `fig-300` (8,06:1 sur `fig-950`) mais **ne
touche pas `--ill-ink`**, qui serait invisible — d'où l'absence totale du jeton `INK` dans cette
figure, et l'emploi de `--ill-paper` (17,05:1) pour le texte clair.

**Vérifié à l'écran** (`preview-figures.html`, servi par le dev serveur, capturé à 900 px et à
320 px) : les six figures se lisent, le bloc sombre tient son contraste, la pastille creuse
« held » se distingue sans couleur, et à 320 px le plancher de 380 px de `fig-scroll` fait
défiler **le conteneur** de la figure — la page, elle, ne défile jamais en largeur.

---

## 8. Contrôles mécaniques

```
lignes de TSX ........................ 490   (cible ≤ 490 ; 1007 avant)
figures SVG .......................... 6     (0 avant)
clés i18n ............................ 132 EN, 132 FR, parité exacte  (143 avant, 0 FR)
trous d'interpolation ................ 0 des deux côtés
<h1> ................................. 1
ancres `fact:` ....................... 16
`tsc -p tsconfig.app.json --noEmit` .. 0 erreur hors « clé absente de en.ts »
typographie FR ....................... 33 lignes portant U+00A0 · 0 U+202F · 0 apostrophe droite
```

Les ~130 erreurs `tsc` restantes sont toutes de la forme *« "communities.x" is not assignable to
MessageKey »* : elles disparaissent à la fusion du pack. C'était attendu — la page ne compile pas
seule.

---

## 9. À l'attention de l'orchestrateur

1. **`communities` doit sortir de `PUBLIC_NAMESPACES_PENDING_TRANSLATION`** (`i18n/catalog.ts:54`)
   et entrer dans `PUBLIC_NAMESPACES` : le pack FR est complet, c'est ce chantier qui ferme la dette.
2. **`ui/Button.tsx` est encore sur la grise d'avant-charte** (`bg-gray-900`). Tant qu'il n'est pas
   restylé en `fig-700`, le CTA des six pages est gris. Voir D5 — je n'ai pas surchargé la classe,
   parce que la victoire entre `bg-gray-900` et `bg-fig-700` dépend de l'ordre de la feuille
   Tailwind et pas de l'ordre des classes. Même remarque, plus tiède, pour `ui/Card.tsx`
   (`border-gray-200 bg-white`), que `PriceCard` traîne sur mon fond `paper-2`.
3. **Hors périmètre, mais à signaler** : la recherche donne la clause « vos données ne servent pas
   à entraîner » pour *table stakes* sur ce marché (Circle la met en avant explicitement). Rien
   dans l'audit ne la couvre, donc la page n'en dit rien — c'est un trou concurrentiel réel.
4. `preview-figures.html` est un **banc de jugement**, il ne va pas au dépôt. Il ne s'ouvre pas en
   `file://` (accès refusé) : il faut le servir. Vite refuse `/@fs` hors racine (403 mesuré) — je
   l'ai copié temporairement dans `frontend/public/`, capturé, puis **supprimé** ; `frontend/public`
   est propre.
