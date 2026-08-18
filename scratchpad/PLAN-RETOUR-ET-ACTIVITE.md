# PLAN — le retour de fin de plan, et les recommandations d'activité

> Prompt autoportant pour un agent qui n'a PAS le contexte de la conversation.
> Repo : `/Users/ahmedamara/Dev/Sophia 2`.
>
> Deux chantiers indépendants, livrables séparément, dans cet ordre.
> **E** ferme la boucle du produit existant. **F** ouvre une surface nouvelle,
> et son §F.1 porte une contrainte de modèle produit qu'il faut lire avant tout.

---

## 0. Le produit, en cinq lignes

- **KEEL** : un coach écrit une **doctrine** 1:N ; c'est **l'élève** qui génère
  son plan de repas. Aucun canal 1:1. **Sophia n'a pas d'opinion propre quand
  un coach existe** — elle sert la méthode du coach.
- La sortie est **des plats avec recettes grammées**.
- Frontière des chiffres : **sur l'ALIMENT, jamais sur la PERSONNE**.
- **Plancher TCA** (`restriction_flag`) au-dessus de tout : rien qui compte à
  rebours, rien qui note quelqu'un.
- Le produit a **supprimé les scores, les séries et l'adhérence, exprès**.
  Aucun des deux chantiers ci-dessous ne les réintroduit, sous aucune forme.

Autorités : `docs/keel/MODEL.md`, `docs/keel/CONTRACT.md`, `docs/keel/LEGAL.md`.

## 1. La discipline du dépôt

Identique au chantier des unités de composition — lis
`scratchpad/PLAN-IMPLEMENTATION-UNITES-DE-COMPOSITION.md` §3 en entier. Les
points qui mordent le plus ici :

- **Fiche FF avant code**, gabarit 11 sections, prochain numéro libre (vérifie
  l'index : FF-042 est pris). Un identifiant n'est **jamais** réutilisé.
- **Une entrée qui ne change aucune branche est décorative**, et pire que son
  absence.
- **Un paramètre de garde est REQUIS, jamais optionnel.**
- **Deux langues** (EN + FR) : `profiles.locale` vaut `fr-FR` par défaut.
- **Condition de désarmement testée par égalité de chaînes.**
- 🚫 **`supabase db reset` INTERDIT**, y compris en local, y compris en le
  demandant au propriétaire. `supabase migration up` ou psql
  (`docker exec supabase_db_Sophia_2 psql -U postgres -d postgres`).
  **Tes migrations doivent être ré-appliquables** — vérifie en les passant deux
  fois.
- Toute table neuve : `revoke` sur `authenticated`/`anon`, **et réclamation par
  le lifecycle RGPD** (les deux chantiers écrivent de la donnée utilisateur).
- Typecheck front : `npx tsc -p frontend/tsconfig.app.json --noEmit`.

---

# CHANTIER E · Le retour de fin de plan

## E.1 — Ce que ça ferme, et pourquoi maintenant

Le moteur de composition produit des verdicts **sans aucune vérité terrain**.
Il sait qu'un plan respectait son enveloppe *sur le papier*. Il ignore
totalement si la personne a pu le cuisiner, si les portions étaient justes, ou
si elle a lâché le mercredi.

C'est le seul angle mort du moteur, et aucune autre entrée du produit ne le
comble. **C'est le lecteur de ce chantier.**

### ⚠️ Le précédent qui doit gouverner ta façon d'écrire

Le point du dimanche (`keel-weekly-flow-v1`, six axes) **a été supprimé**. Pas
parce qu'il était mal fait : parce qu'il **collectait pour un lecteur qui
n'existait pas** — `coach_synthesis_io.ts` n'a jamais lu `biofeedback` (`git
log -S` : zéro commit), et la porte `my_biofeedback_has_reader()` collectait
pour personne.

> **Règle d'entrée : chaque question nomme SON ÉCRIVAIN et SON LECTEUR avant
> d'être posée.** Une question dont tu ne peux pas écrire les deux ne se pose
> pas. Sinon tu reconstruis, avec le même mécanisme, ce qui vient d'être retiré.

### Le recadrage qui rend le chantier sûr

« Comment ça s'est passé » est à un pas de « as-tu tenu » — une question de
conformité, dans un produit qui a supprimé les scores exprès.

> **On évalue LE PLAN, jamais la personne.**

C'est déjà la doctrine du bilan alimentaire : *on interroge ce qui manque,
jamais ce qui a été mangé.* Toute formulation que tu écris doit passer ce test :
si la réponse peut se lire comme une note sur l'élève, elle est mal écrite.

## E.2 — Le déclencheur

**Il existe déjà.** `_shared/keel/meal_plan_window.ts` :
`MealWindowState = "in_window" | "not_started" | "elapsed"`, et
`student_generated_meals` porte `starts_on`, `duration_days`, `ends_on`
(colonne générée), `retired_at`.

**Condition** : un plan dont l'état est `elapsed`, non `retired_at`, et sans
ligne de retour ⇒ le retour est *dû*.

**Pas de cron.** Deux surfaces, en paresseux :

1. **À l'ouverture de l'app** — le retour dû apparaît dans le chat, en boutons.
2. **Avant la génération suivante** — si un retour est dû, on le propose
   d'abord. **Proposé, jamais bloquant** : un questionnaire qui verrouille la
   génération est hostile, et le produit n'a aucun droit d'exiger une réponse.

Justification du choix : un cron ajoute une notification, un secret interne et
un mode de défaillance (le dépôt a déjà payé « crons KEEL : invoke ≠
x-internal-secret, 403 sur chaque envoi »). Le paresseux n'a aucun de ces
coûts, et le signal n'a aucune valeur de fraîcheur — il sert à la prochaine
génération, pas à l'instant.

**Une seule fois par fenêtre.** Si l'élève régénère en cours de route, on ne
redemande pas. Contrainte d'unicité en base, pas un `if` applicatif.

## E.3 — Les questions, et leur destination

Trois questions communes, **une** question propre à la dynamique. Jamais plus
de quatre : au-delà, c'est un formulaire, et un formulaire ne se remplit pas.

| Question | Forme | Lecteur — ce qu'elle change |
|---|---|---|
| Tu l'as cuisiné ? | oui / en partie / non | non ou en partie ⇒ `practical_constraints.cooking_time_min` et `recipe_difficulty` étaient faux ⇒ ajustement à la génération suivante |
| Les portions | trop / juste / pas assez | **la vérité terrain que l'enveloppe n'a pas** ⇒ alimente le ré-ancrage (`recalibration`) du moteur |
| Un plat à ne jamais refaire | choix parmi les plats du plan, ou rien | ⇒ `food_preferences`, via `reconcileFoodPreferencesFor` (**pipeline existant**, ne le réécris pas) |

La quatrième suit **l'axe qui gouverne la dynamique** — c'est la hiérarchie du
design, pas une invention :

| Dynamique | Question | Pourquoi celle-là |
|---|---|---|
| `fat_loss` | as-tu eu faim entre les repas ? | la satiété est l'axe gouvernant |
| `muscle_gain` | as-tu réussi à tout finir ? | l'obstacle est l'apport, pas la retenue |
| `recomposition` | idem `muscle_gain` | même axe |
| `health` | assez de variété ? | l'axe gouvernant est la diversité |
| `performance` | l'énergie autour des séances ? | l'axe gouvernant est le placement |
| `maintenance` | **aucune quatrième question** | l'objectif est l'écart minimal ; ajouter une question serait ajouter de la charge |

## E.4 — Les gardes

**Sous `restriction_flag`, le questionnaire dégrade** — paramètre **requis**,
fail-closed, jamais un `if` chez l'appelant :

- ❌ la question de portion (« trop ? » invite à la restriction)
- ❌ la question de faim (`fat_loss`)
- ✅ « tu l'as pu le cuisiner ? » et « un plat à ne jamais refaire » survivent —
  elles portent sur le plan, pas sur le corps

Et l'indiscernabilité : la version dégradée doit être **identique au caractère
près** à celle d'un élève dont on ne connaît pas la dynamique. Testée par
égalité de chaînes.

**Aucune question rétrospective sur ce qui a été mangé.** On demande ce qui a
manqué au plan, jamais ce que la personne a ingéré.

**Aucun score, aucun cumul, aucune série.** Trois réponses ne font pas une
tendance affichée. Le retour alimente la génération, il ne se montre jamais à
l'élève sous forme d'historique.

**Le coach ne voit rien de nominatif.** Si tu remontes quoi que ce soit au
coach, c'est agrégé, sous plancher d'anonymat k=5 (arbitrage A4).

## E.5 — Le modèle de données

Table `meal_plan_feedback` (migration : `revoke`, **réclamation RGPD**) :

```
id, user_id, meal_id (FK student_generated_meals), 
cooked: 'yes'|'partly'|'no',
portions: 'too_much'|'right'|'not_enough'|null,   -- null sous restriction_flag
axis_answer: text|null,                            -- la 4e, liste fermée par dynamique
dismissed_at: timestamptz|null,                    -- refuser est une réponse
created_at
unique (meal_id)                                   -- une seule fois par fenêtre
```

`dismissed_at` n'est pas cosmétique : sans lui, un élève qui ferme le
questionnaire se le voit reproposer à chaque ouverture. **Un refus est une
réponse, et il se stocke.**

## E.6 — L'UI

Dans le chat, via **`handleDeterministicButton`**
(`_shared/chat/deterministic_buttons.ts`) — la machinerie existe et est
consommée par `chat-inbound-v1`. **Ne construis pas un moteur de
questionnaire.**

- Une question à la fois, boutons, pas de champ libre (le champ libre invite à
  raconter ce qu'on a mangé, ce qu'on ne veut pas).
- Un bouton « pas maintenant » visible dès la première question ⇒ `dismissed_at`.
- Ton : on remercie, on ne félicite pas. « Noté » et pas « bravo ».

## E.7 — Tests

- plan `elapsed` sans retour ⇒ dû ; `in_window` ⇒ pas dû ; `retired_at` ⇒ pas dû
- une seule fois par fenêtre (l'unicité mord en base, testée)
- `dismissed_at` ⇒ plus jamais reproposé pour ce plan
- sous `restriction_flag` : portions et faim absentes, sortie **identique au
  caractère près** au cas dynamique-inconnue
- chaque réponse atteint réellement son lecteur : trois tests d'intégration,
  un par destination (préférences, contraintes pratiques, ré-ancrage)
- **désarmement** : aucun retour existant ⇒ la génération suivante est
  identique à aujourd'hui
- les deux langues

---

# CHANTIER F · Les recommandations d'activité

## F.1 — ⚠️ LIS CECI AVANT TOUT : deux versions, et la ligne qui les sépare

Le modèle KEEL dit que **Sophia n'a pas d'opinion propre quand un coach
existe** : elle sert la méthode du coach. Or la doctrine
(`doctrine.ts :: CoachDoctrine`) porte `beliefs`, `forbidden`, `vocabulary`,
`arbitrations`, `foods`, `qa`, `voice`, `dailyPractices` — **rien sur
l'entraînement**.

Si Sophia programmait de l'activité sans que le coach l'ait dit, elle
inventerait du contenu que le coach n'a jamais enseigné, sur le terrain même où
beaucoup de coachs ont une méthode forte. **Arbitrage du propriétaire
(2026-08-10) : il faut donc DEUX versions.**

### Version 1 — sans coach : le plancher de santé publique

> **Sophia relaie un plancher public. Elle ne programme pas d'entraînement.**

La différence est nette et testable — **écris ce tableau dans la fiche, c'est
le critère d'acceptation principal du chantier** :

| ✅ Plancher de santé publique | ❌ Programmation |
|---|---|
| « viser 30 minutes de marche la plupart des jours » | « 3×5 squats à 80 % » |
| « deux séances de renforcement musculaire par semaine » | « pousse jusqu'à l'échec sur la dernière série » |
| « bouger un peu chaque jour vaut mieux qu'une grosse séance le dimanche » | « fais ton cardio à jeun » |

La colonne de gauche est le consensus publié par les autorités (OMS :
150-300 min d'activité aérobie modérée par semaine **plus** deux séances de
renforcement). Ce n'est pas une méthode, c'est un repère public — Sophia peut le
relayer comme elle peut dire « vois un médecin » sans exercer la médecine.

### Version 2 — avec coach : sa doctrine gouverne (§F.1bis)

Le coach doit pouvoir renseigner sa position sur l'activité **dans sa
doctrine**, et elle remplace alors le plancher maison. Le modèle de données est
au §F.1bis.

### ⛔ Et la ligne qui vaut pour LES DEUX versions

**Même un coach ne fait pas programmer Sophia.** La colonne de droite du
tableau reste interdite quand un coach a parlé — parce que les jetons
exécutables sont une **liste fermée d'accents**, et qu'aucun accent de cette
liste ne peut produire une série, une charge ou un pourcentage.

Où va donc la méthode détaillée d'un coach qui programme ? **Dans ses
`beliefs`**, où elle est déjà possible aujourd'hui : citable dans le chat,
dans sa voix, tracée à sa doctrine. Un coach peut écrire « je fais faire du
renforcement trois fois par semaine à mes élèves » comme conviction ; le chat
la sert, et la section d'activité du plan n'en tire qu'un accent.

> **Le programme du coach est citable dans le chat, jamais exécuté comme
> prescription dans la section du plan.** C'est la même forme que tout le reste
> du produit.

---

## F.1bis — La section d'activité dans la doctrine

### Le patron à réutiliser, pas à réinventer

C'est **exactement** l'architecture du pilotage de composition
(`scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` §3, et `composition_steering.ts`
si livré) :

1. **Le coach répond à une question de doctrine**, dans ses mots, posée comme
   les débats du point de départ (`STARTER_FORKS`, `doctrine_starter.ts`) :
   « quelle place tient l'activité dans ta méthode ? »
2. **La publication écrit DEUX choses** : une `DoctrineBelief` ordinaire
   (citable, elle entre dans `compileDoctrineBlock`, le chat la sert) et
   l'entrée exécutable qui pointe vers elle par `belief_key`.
3. **Le moteur ne lit que le jeton ; le chat ne lit que la conviction.**
   **Aucun parseur de prose, nulle part.**
4. Le coach ne voit **jamais** les jetons : il voit sa question et l'effet de sa
   réponse en langage clair.

### Le modèle de données

Colonne `coach_doctrines.activity_stance jsonb NOT NULL DEFAULT '{}'`, parsée
strictement dans `parseCoachDoctrine` (entrée malformée **écartée et comptée**).

```ts
const ACTIVITY_EMPHASES = [
  "daily_movement",      // le volume quotidien, marche, pas
  "strength",            // renforcement musculaire
  "cardio",              // aérobie structurée
  "recovery",            // récupération, sommeil, jours sans
  "mobility",            // souplesse, amplitude
] as const;

interface ActivityStance {
  mode: "off" | "house" | "coach";
  goal_scope: GoalToken | null;        // parseGoalScope existant
  emphases: ActivityEmphasis[];        // ordre imposé, dédupliqué, max 2
  belief_key: string | null;           // la conviction citable (F.1bis §1)
}
```

**`mode: "off"` est le plus important des trois**, et c'est probablement le plus
demandé : un coach qui programme lui-même doit pouvoir dire **« Sophia ne dit
rien sur l'activité à mes élèves »**. Sans ce jeton, il n'aurait aucun moyen
d'empêcher le produit d'empiéter sur son métier, et il partirait.

**`emphases` est plafonné à 2.** Une section de trois lignes qui met cinq
choses en avant n'en met aucune.

**Aucun champ de volume, de série, de charge, de fréquence chiffrée.**
L'absence est la garde : ce qui n'existe pas dans le type ne peut pas être
prescrit. Même discipline que `deficit_style` sans token `aggressive`.

### Où ça vit — hash de cache intact

`activity_stance` suit `dailyPractices` (`doctrine.ts:307-320`) : porté par
`CoachDoctrine`, **exclu de `compileDoctrineBlock`**. Le hash du bloc chat reste
inchangé pour toute la base, zéro refragmentation — et c'est cohérent : le bloc
chat sert la *conviction* (via `belief_key`), la section d'activité sert le
*jeton*. Le test d'empreinte de cache existant doit rester vert octet pour octet.

### La préséance

1. **Plancher TCA** (`restriction_flag`) — silence total, **un coach ne peut pas
   le lever**. C'est la hiérarchie déjà établie : plancher TCA > coach > Sophia.
2. **Maladie déclarée** (`conditionRef`) — silence, un coach ne peut pas le lever
   non plus. C'est une frontière clinique, pas une préférence de méthode.
3. **Mineur** — rien qui dérive d'un objectif corporel.
4. `mode: "off"` du coach ⇒ **section absente**.
5. `mode: "coach"` ⇒ ses `emphases` gouvernent, **remplacent** le plancher
   maison (jamais de fusion, comme la doctrine de composition).
6. `mode: "house"` ou coach muet ⇒ voir le fork ci-dessous.

### 🔀 FORK POUR LE PROPRIÉTAIRE — le coach muet sur l'activité

Ce fork est le miroir exact de l'arbitrage **A2** du chantier de composition
(« sous un coach muet, seules les sentinelles s'appliquent — mécanisme produit,
pas contenu doctrinal »), et il mérite d'être tranché de la même main.

- **Option A (recommandée)** — le plancher public s'affiche, **attribué à
  personne** : présenté explicitement comme un repère de santé publique
  générique, pas comme la méthode du coach. L'attribution est ce qui résout le
  problème : on ne fait jamais parler le coach à sa place, et l'élève reçoit
  quand même quelque chose d'utile.
- **Option B** — silence pour tout élève coaché dont le coach n'a rien dit.
  Coût : la majorité des élèves coachés n'ont rien, alors que le repère est
  public et inoffensif.

**Recommandation : A**, avec la mention d'attribution obligatoire et testée (un
test qui vérifie que la section ne s'attribue pas au coach quand elle vient du
plancher).

### L'écran coach

La question apparaît dans l'éditeur de doctrine, avec **l'effet de chaque
réponse en langage clair** — « avec cette réponse, tes élèves liront une courte
section qui met la marche quotidienne en avant ; ils ne verront jamais de
séries ni de charges ». Le coach n'a jamais à cocher à l'aveugle dans une boîte
noire : c'est le contre-modèle explicite du produit.

## F.2 — Les trois gardes, dans l'ordre de gravité

**1. `restriction_flag` ⇒ AUCUNE recommandation d'activité. Zéro.**
L'exercice compulsif est un comportement compensatoire documenté des troubles
du comportement alimentaire. Recommander « plus de pas » à quelqu'un sous
plancher n'est pas une maladresse, c'est un dommage. Paramètre **requis**,
**fail-closed** (lecture en échec ⇒ on se tait), et la section n'existe pas —
elle n'est pas vidée, elle n'est pas rendue.

**2. Maladie déclarée (`conditionRef`) ⇒ la section se tait.**
La posture existante pour les maladies est écrite dans
`safetyConstraintsPromptBlock` : *« Do not prescribe for these… The clinician
who has their results decides that. »* Une recommandation d'activité à
quelqu'un qui a déclaré une pathologie cardiaque relève du clinicien. Même
frontière, même silence.

**3. Mineur ⇒ aucune recommandation liée à un objectif corporel.**
Un mineur n'a pas d'objectif (`student_age.ts`, `weekPlanAgeGate`). Il ne
reçoit donc rien qui dérive d'un objectif.

**Et la garde transverse, celle qui tue le produit si on la rate :**

> **On ne demande JAMAIS si ça a été fait.**

Une recommandation qu'on vérifie devient une note. Pas de case à cocher, pas de
« tu l'as fait ? » dans le questionnaire du chantier E, pas de compteur, pas de
série. C'est ce qui distingue une suggestion d'un contrôle — et c'est aussi ce
que l'utilisateur a demandé (« sans tracking ni rien »).

**Les gardes 1, 2 et 3 tiennent MÊME SI LE COACH A PARLÉ.** Un `activity_stance`
qui vaudrait `coach` ne lève ni le plancher TCA, ni le silence sur une maladie
déclarée, ni la règle du mineur. La hiérarchie est celle du produit :
**plancher TCA > coach > Sophia**, et elle se teste dans ce sens-là. Un test
nommé doit prouver qu'une doctrine ne peut pas ouvrir une de ces trois portes.

## F.3 — La forme : déterministe, la voix seule est générée

**Ne fais pas un appel de modèle libre.** Le contenu est un corpus fixe (le
plancher OMS, modulé par la dynamique et par ce que l'élève a déclaré de son
activité) — exactement le cas où ce dépôt a déjà tranché que le déterministe
bat le généré. Un modèle libre sur ce terrain inventera de la programmation, et
la garde F.1 passera son temps à la rattraper.

Donc : **sélection déterministe dans une table fermée**, et le modèle
n'intervient — s'il intervient — que pour la formulation, dans la voix du
coach. Même patron que le bloc de doctrine : le contenu est fixe et citable, la
tournure s'adapte.

**Appel séparé du plan de repas.** L'utilisateur a raison, et pour une raison
qui dépasse le désordre : la consigne de composition porte déjà des dizaines de
contraintes simultanées, dont les plus critiques (allergènes, régimes,
absences). Y ajouter l'activité la ferait **concourir pour l'attention du
modèle** avec ce qui ne doit jamais tomber. Et en domaine de défaillance
séparé : si l'activité échoue, **le plan de repas sort quand même**.

## F.4 — Le contenu MAISON, par dynamique

⚠️ Ce qui suit est **la version 1 (sans coach)**, et le repli quand le coach est
muet (fork F.1bis, option A). Quand `activity_stance.mode === "coach"`, ses
`emphases` **remplacent** cette table — jamais de fusion.

Table fermée, chaque entrée nommée, chaque entrée changeant une branche :

| Dynamique | L'accent | Exemple de repère (à écrire en toutes lettres dans la table) |
|---|---|---|
| `fat_loss` | le volume quotidien, pas l'intensité | marche régulière ; le renforcement préserve la masse maigre |
| `muscle_gain` | le renforcement d'abord | deux à trois séances ; le cardio ne s'y oppose pas |
| `recomposition` | renforcement + activité de fond | |
| `performance` | la récupération autant que la séance | |
| `health` | le plancher OMS, tel quel | |
| `maintenance` | ce qui existe déjà, sans ajout | la recommandation peut être « rien à changer » |

**Une dynamique dont tu n'écris pas la branche n'entre pas dans la table.**

Module pur `_shared/keel/activity_floor.ts`, testé, sans I/O ni horloge. Il
prend l'`ActivityStance` en **paramètre requis** (jamais optionnel : une garde
optionnelle est une garde désarmée) et rend soit une section, soit rien.

## F.5 — L'entrée manquante

Le produit ne sait rien de l'activité actuelle de l'élève. Une recommandation
sans ce point de départ est soit triviale, soit inadaptée.

Ajoute **une** question, dans « Basic info », liste fermée :
`sedentary | lightly_active | active | very_active`. Une seule, pas un
questionnaire d'activité — et **elle n'est pas requise** : sans elle, on rend
le plancher générique, ce qui reste honnête.

⚠️ Cette valeur ne doit **pas** entrer dans un calcul de dépense énergétique
affiché. Elle module la recommandation, rien d'autre.

## F.6 — L'UI

Une **courte** section, sous le plan, visuellement distincte de la nourriture —
elle ne fait pas partie de la recette. Trois lignes au maximum. Pas
d'interaction, pas de case, pas de bouton « fait ». Elle se lit et c'est tout.

Réutilise `SetupSection` (`frontend/src/keel/components/ui/SetupSection.tsx`)
et son jeu d'accents fermé plutôt qu'un composant neuf.

## F.7 — Tests

**Les gardes, et elles priment :**

- `restriction_flag` ⇒ **section absente**, pas vide (testé par l'absence de la
  clé, pas par une chaîne vide)
- lecture de `restriction_flag` en échec ⇒ section absente (fail-closed)
- `conditionRef` non nul ⇒ section absente
- mineur ⇒ section absente
- **une doctrine `mode: "coach"` ne lève AUCUNE des quatre gardes ci-dessus** —
  un test nommé par garde, c'est la hiérarchie plancher TCA > coach > Sophia
  rendue vérifiable

**La ligne programmation/plancher :**

- aucune sortie ne contient de programmation : test lexical sur **toute** la
  table fermée **et** sur toutes les sorties possibles du chemin coach (séries,
  répétitions, charges, %, RPE, « à jeun », « échec ») — en EN et FR
- aucun `emphasis` de la liste fermée ne peut produire un chiffre de volume

**Les deux versions :**

- pas de coach ⇒ plancher maison de la dynamique
- `mode: "coach"` ⇒ ses `emphases` gouvernent, la table maison **n'apparaît
  pas** (remplacement, jamais fusion)
- `mode: "off"` ⇒ section absente
- coach muet ⇒ plancher rendu **sans attribution au coach** (fork F.1bis
  option A : un test vérifie que la section ne se présente pas comme sa méthode)
- `emphases` à plus de 2 entrées ⇒ rejeté à la publication, compté, montré à
  l'écran coach
- entrée `activity_stance` malformée ⇒ écartée **et comptée**, le reste de la
  doctrine vit

**Le reste :**

- hash du bloc chat **octet-identique** avant/après pour un coach avec et sans
  `activity_stance` (l'exclusion de `compileDoctrineBlock` est tenue)
- niveau d'activité absent ⇒ plancher générique rendu, jamais une supposition
- échec de l'appel activité ⇒ **le plan de repas sort quand même** (domaine de
  défaillance séparé, testé)
- **désarmement** : aucune doctrine, aucun niveau déclaré ⇒ sortie identique au
  caractère près au plancher générique
- les deux langues

---

## 2. Ordre, vérification, rapport

**Ordre** : E d'abord (il ferme une boucle existante et n'ouvre aucune surface
nouvelle), F ensuite.

**Vérification** : `deno test` complet sur `_shared/keel/` sans `--no-check` ;
`npx tsc -p frontend/tsconfig.app.json --noEmit` ; migrations appliquées
**deux fois** ; run réel local après **redémarrage du runtime edge**, sur une
fixture **avec plan publié** (sans lui, aucun effet KEEL n'existe).

**Rapport** dans `scratchpad/RAPPORT-RETOUR-ET-ACTIVITE.md` : par chantier, ce
qui est livré, **la preuve que chaque question atteint son lecteur** (c'est le
critère qui a tué le point du dimanche), ce que tu n'as pas fait et pourquoi.

**Commits** : un par chantier, message français en minuscules. Ni push, ni
deploy, ni `db push`.

## 3. Interdits absolus

- Aucun score, aucune série, aucun cumul affiché — sur aucun des deux chantiers.
- Aucune question sur ce qui a été **mangé** ; aucune question sur ce qui a été
  **fait** en activité.
- Aucune programmation d'entraînement (F.1) : plancher de santé publique, ou
  silence.
- Sous `restriction_flag` : questionnaire dégradé (E), activité **absente** (F).
- Aucun questionnaire bloquant : « pas maintenant » est toujours accessible.
- **Aucune doctrine ne lève le plancher TCA, le silence sur maladie déclarée,
  ou la règle du mineur.** Un coach gouverne sa méthode, pas les gardes.
- **Aucun champ de volume, série, charge ou pourcentage** dans
  `ActivityStance` : ce qui n'existe pas dans le type ne peut pas être prescrit.
- 🚫 `supabase db reset`, jamais.
