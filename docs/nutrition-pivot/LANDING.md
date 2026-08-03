# LANDING — réalignement sur le modèle 1:N

> Commit `fd6ec993`. Périmètre touché : `frontend/src/keel/pages/LandingPage.tsx`,
> `frontend/src/keel/i18n/en.ts` (bloc `landing.*` + une clé `public.footer.*`),
> `.claude/launch.json` (un port de dev en plus, pour pouvoir ouvrir la page —
> les deux autres étaient pris par une session parallèle).
> **Aucun autre écran, aucune edge function, aucune migration.**

---

## 0. Le défaut qu'il fallait corriger en premier

`MondayMock()` était le premier visuel de la page. Il affichait
`coach.dashboard.risk.at_risk`, `coach.dashboard.risk.disengaged`,
`coach.dashboard.insufficient_data`, et « On track — no action needed : 22 »
avec 22 pastilles vertes.

Ces bandes viennent de l'évaluateur d'adhérence, **débranché du chemin 1:N** par
`20260803200000_pivot_disable_evaluator_for_cohorts.sql`. Le « 22 » est un
affichage d'adhérence : plus aucun code ne le calcule pour une cohorte. La page
de vente ouvrait donc sur une note qu'on ne donne plus et sur le tableau de bord
de conformité qu'on a délibérément supprimé.

Le panneau rend maintenant les trois axes que `_shared/keel/coach_synthesis.ts`
calcule vraiment, **dans son ordre de rendu** :

| Bloc | Source | Valeurs |
|---|---|---|
| Who's still talking | `classifyContact`, seuils 48 h / 120 h | In touch · Slipping · Silent |
| How the week felt | `summarizeLivability`, `LIVABILITY_MIN_TAPS = 3` | Holding up · Strained · Having a hard time · Not enough check-ins |
| What they set themselves | `CohortMetrics.planned` | « 21 of 34 wrote themselves a week » |

`unknown` est rendu comme une **abstention visible** : cinq anneaux creux, plus
une légende qui dit pourquoi ils ne sont pas dans la phrase de synthèse. C'est
l'honnêteté la plus vendable de la page et elle était invisible.

---

## 1. Le diff de positionnement, section par section

### Hero
| | |
|---|---|
| **Avant** | « You write the plan. Sophia makes sure it gets lived. » — « Sophia runs your protocol with your **client** … On Monday you get the few **clients** who actually need you. » |
| **Après** | « You can't answer two hundred students. Your method can. » — « Sophia learns how you coach … and answers **in your place**, on WhatsApp, all week. » |

Le « plan » du coach n'existe plus : il n'écrit pas de programme par élève, il a
une philosophie (`week_plan_generation.ts`, en-tête : *« un coach de masterclass
n'écrit pas de programme »*). La note sous les CTA vend maintenant explicitement
**l'absence de canal 1:1** — « no one-to-one inbox for you to keep up with » —
au lieu de la subir.

### Problem
| | |
|---|---|
| **Avant** | « You only find out when they go quiet » + 3 cartes de statistiques + « They drift because nobody was there on Tuesday night. » |
| **Après** | « A masterclass sells your method. It can't sell your evenings. » + 3 questions d'élève + la même chute, réécrite pour le 1:N. |

**Les trois statistiques sont supprimées.** « Less than half of clients are still
logging by week 10 », « 5.4 → 1.4 days logged per week », « Shame, not churn
intent » : `grep` sur tout `docs/` ne trouve **aucune source** pour ces trois
chiffres, et les trois décrivent l'abandon du *logging* en suivi 1:1 — le modèle
qu'on ne vend plus. Elles sont remplacées par trois questions qu'un élève pose
vraiment le soir, qui sont du contenu et pas des données.

### HowItWorks
| | |
|---|---|
| **Avant** | pastilles 1 / 2 / 3 · « Drop in your plan » (import PDF) · « Your client lives it » · « Monday, you decide » |
| **Après** | cadence **Once / Every day / Every Monday** · « You record your method » · « Your students live it, on WhatsApp » · « You read one page » |

L'étape 1 ne parle plus d'import de PDF mais du **Doctrine Copilot** (entretien
guidé, relecture, publication, rollback). Les repères numérotés sont remplacés
par la cadence : les trois étapes *sont* une séquence, mais leur information
utile n'est pas « il y en a trois », c'est l'asymétrie *une fois → tous les
jours*, qui est l'argument commercial lui-même.

L'échange WhatsApp a **quitté le hero** pour s'installer dans l'étape « Every
day », où il illustre quelque chose. Il contient maintenant aussi le tap du
soir (trois boutons — la limite Meta, `daily_pulse.ts`), ce qui referme la
boucle : les trois boutons de l'étape 2 sont ce qui produit la bande de
vivabilité du panneau du lundi.

### Difference → **le double verrou**
| | |
|---|---|
| **Avant** | « The market builds AI for your desk. Sophia sits with your client. » + 3 pastilles, dont « Escalates to you with the client's words. You decide. » |
| **Après** | « An AI speaking in your name is a risk. We treat it as one. » + verrou 1 / verrou 2 + la trace d'un message retenu. |

C'est le changement le plus important après le mock. L'ancienne section vendait
une comparaison de marché ; la nouvelle vend la seule garantie structurelle
qu'on ait. La pastille « escalates to you » **devait** partir : elle promettait
exactement le canal 1:1 qui n'existe pas.

La trace montre le mécanisme au lieu de l'affirmer : la question d'un élève, le
brouillon barré avec la puce « Held by lock 2 », puis les mots du coach qui
partent à la place. Le texte de clôture est une traduction fidèle du commentaire
de `keel_output_locks.ts` : *« never gets "ask your coach" — in a masterclass
that points at a door which doesn't exist »*.

### Doctrine
Les trois règles étaient toutes fondées sur la prescription et l'adhérence.

| Avant | Après |
|---|---|
| « You write. Sophia never does. » — faux : Sophia **compose** les lignes, elle est interprète sous cadre. | « You teach. They decide. Nobody is graded. » |
| « No number without the days behind it » (barrière 4/7 jours, « insufficient data ») — c'est la doctrine de l'adhérence, débranchée. | « Every line names the conviction it came from. » (CHECK `..._doctrine_traceable_check`) |
| « A fact is never deduced from another. » | « Silence is never rounded up. » (`LIVABILITY_MIN_TAPS = 3`) |

Le bloc « no calories » est **renforcé**, pas seulement conservé : il porte
maintenant les chiffres réels de `PHOTO_QUANTIFICATION.md` (85 analyses
réelles, biais −26,6 %, IC90 du modèle qui ne couvre que 58 % — reformulé en
« barely more than half the time »), et il nomme le **filtre déterministe** qui
retire toute cible chiffrée produite par le modèle. Un refus tenu par du code
se vend mieux qu'un refus tenu par une promesse.

### Pricing
Prix inchangés (49 $ + 12 $, actif = 3 interactions/mois — vérifié :
`ACTIVE_STUDENT_MIN_INTERACTIONS = 3` dans `_shared/billing-tier.ts`, et le
commentaire de `20260727235000`). Le *pourquoi* change : au lieu de « you pay
for clients Sophia is keeping in your program », il dit **« Twenty students or
two hundred, you pay for the ones actually using it »** et ajoute que rien dans
le prix ne dépend des heures que le coach y met — la cohérence du modèle au
siège avec le 1:N, mise en avant plutôt que subie.

Ajout : `landing.pricing.trial_note` — « 14 days, up to 3 students, then it
stops on its own », qui est littéralement ce que fait le code
(`coaches.trial_seat_limit = 3`, essai 14 jours).

### ClosingCall
« Your next **client review** could be three decisions, not thirty tabs. » →
« You've already written the method. This is what makes it answer at 9pm. »

### Footer
`public.footer.tagline` : « Sophia runs the plan. You keep the pen. » →
« Your method, answering in your absence. » (« the plan » = vocabulaire 1:1.)

---

## 2. Les clés i18n

**99 clés `landing.*` déclarées, 99 utilisées, zéro orpheline** (vérifié par
`comm` entre les clés du dictionnaire et celles du JSX ; aucune clé `landing.*`
n'est référencée par un autre écran).

### Supprimées (15)
`landing.mock.needs_attention` · `landing.mock.on_track` ·
`landing.mock.insufficient` · `landing.mock.client_generic` ·
`landing.mock.logged` · `landing.mock.student_today` ·
`landing.problem.stat1_value` · `stat1_label` · `stat2_value` · `stat2_label` ·
`stat3_value` · `stat3_label` · `landing.diff.point1` · `point2` · `point3`

> `insufficient`, `client_generic` et `logged` étaient **déjà orphelines** avant
> ce travail — aucune n'était appelée par le JSX. Elles partent aussi, pour
> qu'un futur écran ne les ressuscite pas.

### Ajoutées (48)
- **Panneau du lundi (18)** : `mock.monday_subtitle`, `mock.contact_label`,
  `contact_line`, `contact_responsive` / `_slipping` / `_silent` + leurs trois
  `_hint`, `mock.felt_label`, `felt_line`, `felt_sustainable` / `_strained` /
  `_hard` / `_unknown`, `felt_caption`, `mock.intent_label`, `intent_line`,
  `mock.caption`.
- **Échange WhatsApp (6)** : `mock.wa_label`, `chat_evening`,
  `chat_tap_good` / `_mixed` / `_hard`, `chat_tap_caption`.
- **Double verrou (15)** : `diff.lock1_tag`, `lock1`, `lock2_tag`, `lock2`,
  `trace_label`, `trace_example`, `trace_ask`, `trace_ask_text`, `trace_draft`,
  `trace_draft_text`, `trace_held`, `trace_sent`, `trace_sent_text`,
  `trace_note`, `diff.close`.
- **Cadence (3)** : `how.step1_when`, `step2_when`, `step3_when`.
- **Problem (3)** : `problem.q1`, `q2`, `q3`.
- **Divers (3)** : `doctrine.no_calories_body2`, `pricing.trial_note`.

### Modifiées
Les **58 clés restantes** ont toutes vu leur texte réécrit à l'exception des
libellés purement mécaniques (`hero.cta_signin`, `pricing.base`,
`pricing.seat`, `closing.signin_link`, les quatre `public.footer.*` autres que
`tagline`, `brand.wordmark`).

### Choix de nommage à connaître
Le mock **n'emprunte plus** les clés `coach.dashboard.*`. Cet écran porte encore
le vocabulaire d'adhérence d'avant le pivot ; si la landing pointait dessus,
elle changerait silencieusement de sens le jour où quelqu'un corrige ces clés.
Les libellés du panneau sont donc `landing.*`, quitte à dupliquer trois mots.

---

## 3. ⚠️ Ce que j'ai VOLONTAIREMENT retiré ou adouci

**C'est la partie à lire.** Chaque ligne ci-dessous est une affirmation qui
aurait tenu sur la page mais qui repose sur quelque chose de non prouvé.

| Affirmation possible | Statut réel | Ce que la page dit à la place |
|---|---|---|
| « Ta synthèse du lundi t'est **envoyée**, tu n'ouvres même pas l'app » | `20260803230000` existe, mais **aucun template Meta n'est approuvé** et rien n'est déployé. Hors fenêtre 24 h, rien ne part. | « You read one page. » Aucune promesse de livraison, aucun canal nommé. C'est l'argument le plus vendeur de la doc business (« un coach qui n'ouvre jamais le dashboard mais lit sa synthèse est un client retenu ») et je l'ai **coupé**. |
| « Point hebdomadaire : 6 axes + poids + tour de taille, dans WhatsApp » | Le code existe (`weekly_flow.ts`), **l'objet Flow n'est pas créé chez Meta**. | Rien. La page ne mentionne pas le point hebdo. |
| « Suis le poids de tes élèves » | La chaîne est **cassée** : le formulaire écrit dans un champ que l'écran de progression ne lit pas. | Rien. Aucune mention de poids, de mesure, de progression chiffrée. |
| « Ton élève corrige l'analyse si elle se trompe » | Non branché. | Rien. |
| « Tes élèves sont relancés au jour 3 » | `REENGAGE_AFTER_HOURS = 72` est vrai et testé, mais l'envoi réel dépend de Meta. | La relance n'est **pas** un argument de vente sur la page. Elle n'apparaît qu'en creux (« no message that reaches them at night »), et cette clause-là est vérifiée : `QUIET_HOURS_START = 21`, `QUIET_HOURS_END = 8`, report et non abandon. |
| « −2 kg en 4 semaines », taux de rétention, nombre de coachs | Rien de tel n'existe. | Aucune projection de résultat, aucune preuve sociale, aucun logo, aucun témoignage. |
| Les 3 statistiques du bloc Problem | **Non sourcées dans le dépôt.** | Supprimées (voir §1). |

### Les seuls chiffres qui restent, et d'où ils viennent
| Chiffre | Source |
|---|---|
| −26,6 % de biais, 85 analyses, « barely more than half the time » | `docs/keel/PHOTO_QUANTIFICATION.md` (85 appels réels, vérité terrain USDA SR Legacy) |
| 49 $ / mois, + 12 $ / élève actif | `landing.pricing.*`, inchangés |
| « Active = 3 or more interactions that month » | `_shared/billing-tier.ts:242` |
| 14 jours / 3 élèves | `20260727235000_keel_billing_seats.sql` |
| 2 j / 5 j (contact), 3 taps (vivabilité) | `coach_synthesis.ts` (48 h / 120 h / `LIVABILITY_MIN_TAPS`) |
| La cohorte du mock (34 élèves, 25/6/3, 18/8/3/5) | **Exemple**, et la légende sous le panneau le dit : « the cohort is an example ». |

### 🚩 La contradiction que je signale
Le brief classe **« photos de repas analysées »** dans *construit et vérifié*.
Le dépôt dit l'inverse : `STATUS-MORNING.md` écrit que « le contrat photo v3 est
écrit, filtré et testé — **il n'a jamais lu une image** », et
`keel-pivot-business` liste la vision parmi les blocages vérifiés. Le chemin
existe et est testé, ce qui n'est pas prouvé c'est sa **justesse sur un vrai
modèle**.

Décision : j'ai gardé la photo, mais confinée. Elle n'est **pas** dans le hero,
elle n'apparaît qu'à l'étape « Every day » et dans le mock, et la réponse
montrée est délibérément modeste (« Greens and a protein, moderate portion »),
sans chiffre. **C'est l'affirmation la plus risquée de la page.** Si tu préfères
la couper, la phrase à changer est `landing.how.step2_body` : remplacer « They
send a photo of a plate or a sentence about their day » par « They send a
sentence about their day » et retirer `MockPlatePhoto` — dix minutes, aucun
autre impact.

### Une phrase que j'assume à la limite
`landing.doctrine.rule2_body` dit que « the database refuses a line that names
none ». C'est vrai (CHECK `..._doctrine_traceable_check`, migration
`20260803210000`). Mais l'en-tête de `week_plan_generation.ts` est explicite :
le code garantit la **traçabilité**, pas la **fidélité** de l'interprétation. La
copie ne prétend donc nulle part que la ligne est celle que le coach aurait
écrite — elle dit que l'élève voit la conviction sous la ligne « so you can both
judge whether it was a fair reading of you ». Le jugement est renvoyé à l'œil
humain, exactement comme le fichier le demande.

---

## 4. La question de marque — **NON TRANCHÉE, rien changé**

Le `structuredData` déclare toujours `name: "Sophia"` et `sophia-coach.ai`, et
`brand.wordmark` vaut toujours « Sophia ». **Je n'y ai pas touché**, et voici
pourquoi le doute persiste dans les deux sens :

- **Pour KEEL** : `docs/keel/` est l'autorité et tous ses documents disent « le
  produit : … KEEL l'exécute » (`LEGAL.md`, `CONTRACT.md`, `DEPLOY.md` :
  « KEEL est un produit anglophone »).
- **Pour Sophia** : `brand.wordmark` est lu par `PublicHeader`, `PublicFooter`,
  et `/join` — tous **hors périmètre**. `public.footer.contact_email` est
  `sophia@sophia-coach.ai`, le `canonical` et le `logo` pointent sur ce domaine,
  et le composant `SEO` ajoute un suffixe « | Sophia Coach » que je n'ai pas
  ouvert. Renommer la seule landing produirait une page « KEEL » servie sur
  `sophia-coach.ai`, avec un en-tête « Sophia » juste au-dessus.
- **Un troisième usage existe** : dans la copie, « Sophia » est le nom de
  **l'agent** qui parle à l'élève (« And no, Sophia doesn't count calories »).
  Cet usage-là est cohérent quel que soit l'arbitrage sur la marque de
  l'entreprise, et c'est pour ça que je l'ai conservé partout.

**Ce qu'il me faut de toi** : une décision sur la marque *publique* (entreprise
et domaine). Si c'est KEEL, le chantier est : `brand.wordmark`,
`public.footer.contact_email`, `public.footer.copyright`, le suffixe du
composant `SEO`, `canonical` + `logo` + `structuredData` de la landing, et le
domaine lui-même — **six endroits, un seul commit, mais hors du périmètre que tu
m'as donné.**

---

## 5. Les choix de design

Le kit `frontend/src/keel/components/ui/` fait autorité : `Card`, `Badge`
(ses tons), `Button`. Aucun second système visuel, aucune police ajoutée, mode
clair uniquement.

**Aucune teinte d'accent nouvelle.** C'est le choix structurant. Toute couleur
saturée de la page est déjà un **état** (emerald = ça tient, amber = attention,
red = critique, gris = on ne sait pas — exactement les tons du `Badge`). Ajouter
une couleur de marque rendrait la décoration indiscernable du sens sur une page
dont l'argument entier est qu'elle rapporte au lieu de décorer. L'emphase passe
donc par l'échelle typographique et par **un seul** bloc sombre.

### Ce que le crible anti-défauts a corrigé
| Travers repéré | Verdict | Action |
|---|---|---|
| Sections alternées blanc / gris-50 / sombre / blanc… | **Remplissage.** L'alternance n'encodait rien. | Les fonds encodent le registre : blanc = l'argument, gris-950 = **la garantie** (le double verrou), gris-50 = les conditions commerciales. Trois sections blanches consécutives, séparées par des filets ; la variété vient de la forme du contenu. |
| Pastilles numérotées 1 / 2 / 3 | **Séquence réelle**, mais le numéro n'apportait rien. | Remplacées par la cadence (Once / Every day / Every Monday), qui est l'information. |
| 12 cartes arrondies identiques | **Remplissage** pour 9 d'entre elles. | Les 3 cartes de stats, les 3 cartes d'étapes et les 3 pastilles de « diff » disparaissent au profit de listes à filets et de lignes. Restent les cartes qui sont vraiment des objets : le panneau du lundi, les deux prix, l'encadré pointillé « no calories ». |
| Section sombre isolée | **Garde**, mais déplacée. | Elle servait un « why us » générique ; elle sert maintenant le double verrou. |
| Bloc de risque du hero | **Mensonge produit.** | Reconstruit (voir §0). |

### Le panneau du lundi comme information design
- L'état se lit **avant** d'être lu : bandeau vertical coloré sur chaque ligne de
  contact, cellule pleine ou anneau creux pour la vivabilité.
- **Une cellule = un élève, pas une part.** Une barre empilée aurait eu la
  grammaire du pourcentage, à un pas de ce que le produit refuse d'afficher. Les
  cellules se comptent, donc `unknown` se lit comme cinq personnes dont on ne
  répond pas, et pas comme une tranche mince.
- La couleur ne voyage **jamais seule** : chaque groupe est légendé avec son mot
  et son compte, et chaque groupe porte un `aria-label` (« 5 Not enough
  check-ins to say »).
- `tabular-nums` sur tous les comptes et sur les prix.

### Vocabulaire
Pas de « livability band » ni de « coverage » à l'écran. Un coach lit *Who's
still talking*, *How the week felt*, *What they set themselves*, *In touch*,
*Slipping*, *Silent*, *Holding up*, *Strained*, *Having a hard time*, *Not
enough check-ins to say*.

---

## 6. Ce que j'ai observé en ouvrant la page

Serveur de dev local, **déconnecté**, `http://localhost:5176/`, en 1280 px et en
375 px. Console propre (zéro erreur, zéro warning applicatif).

Six défauts n'étaient visibles qu'à l'écran :

1. **Les cartes de prix cassaient.** « + $12 » et « per active student per
   month » partageaient une ligne de base dans une carte demi-largeur : le
   « + » se retrouvait orphelin au-dessus du « $12 ». Refait en `PriceCard`,
   prix / période / libellé empilés.
2. **Le bloc sombre avait un trou.** La colonne des deux verrous est bien plus
   courte que la trace ; la phrase de clôture en pleine largeur laissait un vide
   d'un paragraphe. Elle est passée dans la colonne de gauche, sous le verrou 2
   dont elle est la conséquence.
3. **Les cellules `unknown` en pointillés rendaient du flou.** Une bordure
   `dashed` sur un cercle de 10 px se lit comme un bug de rendu, pas comme une
   absence délibérée. Passées en anneau plein 2 px.
4. **Le brouillon barré était trop pâle** (`text-gray-500` barré sur gris-950) :
   or tout l'intérêt est qu'on puisse **lire** ce qui allait partir. Remonté en
   `gray-400`.
5. Le hero tient sans scroll en 1280×720 ; le panneau du lundi et la colonne de
   texte sont à peu près de même hauteur.
6. En 375 px tout s'empile proprement : la grille de cellules passe sur deux
   lignes, la légende sur une colonne, l'échange WhatsApp prend la pleine
   largeur, la trace du verrou reste lisible.

**Ce que je n'ai PAS fait** : `preview_start` a refusé les deux ports du dépôt
(pris par une session parallèle), d'où le troisième port ajouté à
`launch.json`. Les captures d'écran de la page **scrollée** revenaient vides —
le panneau navigateur était masqué et le moteur ne repeignait pas. J'ai donc
inspecté les sections en masquant celles du dessus en JS pour les amener en haut
du viewport, à `scrollY = 0`. La page a bien été lue en entier, à l'écran, dans
les deux largeurs, mais **pas par un scroll continu** — si une soudure entre
deux sections ne va pas au défilement, je ne l'aurais pas vue.

Vérifications automatiques : `npx tsc --noEmit` propre ; `agent-gate` du commit
(typecheck frontend + eslint sur les fichiers modifiés + `deno check`) au vert ;
`grep` final sur la copie — les seules occurrences de *score*, *streak*,
*percentage*, *adherence*, *inbox* sont des **négations** (« No adherence score,
no percentage, no streak »), *calorie* et *macro* n'existent que dans la section
qui les refuse, et le seul `%` de la page est le **−26,6 % de biais photo**,
sourcé. Zéro occurrence de « client ».

---

## 7. Écrans qui restent désalignés — signalés, **pas touchés**

| Écran / fichier | Ce qui ne va plus |
|---|---|
| `coach.dashboard.*` (i18n) | « Weekly adherence at a glance », `adherence_label`, `coverage_label`, `insufficient_data`, les six `risk.*` — tout le vocabulaire de l'évaluateur débranché. |
| `coach.home.since` | « Client since {date} » |
| `import.paste_placeholder` | « exactly as you wrote it for your client » — et l'import de plan lui-même n'a plus d'objet en masterclasse. |
| `part.hint.food` / `part.hint.actions` / la 3ᵉ | « What your **client** eats / does », « Tracked, not scored » |
| `frontend/src/components/SEO.tsx` | ajoute un suffixe « \| Sophia Coach » au titre — dépend de l'arbitrage §4. |
| `PublicHeader.tsx` | Je ne l'ai **pas** modifié : son texte était déjà aligné (wordmark + Sign in + Start free trial), et une session parallèle y travaillait au même moment (ajout d'un `audience="student"` pour `/join`). Seul `public.footer.tagline` est passé par moi, dans le dictionnaire. |

---

## 8. Reste ouvert

1. **La marque** (§4) — bloquant pour six endroits, aucun dans mon périmètre.
2. **La photo** (§3) — garder confinée, ou couper ? La phrase exacte est donnée.
3. **La synthèse poussée** — le jour où un template Meta est approuvé, la
   promesse « elle arrive chez toi, tu n'ouvres rien » devient vraie et vaut
   d'être ajoutée à `landing.how.step3_body`. Aujourd'hui elle serait fausse.
