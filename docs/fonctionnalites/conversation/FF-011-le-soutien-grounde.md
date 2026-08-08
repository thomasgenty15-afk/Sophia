# FF-011 · Le soutien groundé

| | |
|---|---|
| **Identifiant** | `FF-011-le-soutien-grounde` |
| **Statut** | 🟡 Spécifiée |
| **Date** | 2026-08-07 |
| **Autorité produit** | la direction du domaine ([README](README.md)) T6 · `_shared/keel/daily_recap.ts` (« le fait est le compliment ») |
| **Dépend de** | `findQualifyingVerdict` / `VERDICT_PATTERNS` / `allowedNumbers` (déjà écrits et partagés) · `daily_recap_io.ts` · `week_review_io.ts` |
| **Effort estimé** | 1,5 jour |

---

## 1. Le problème

Quelqu'un écrit « cette semaine a été horrible, j'ai rien tenu ». L'agent répond
quelque chose de chaleureux et de vide : *courage, demain est un autre jour, tu
vas y arriver.*

Ce produit a déjà tranché que c'est **interdit**, et il l'a écrit deux fois. Le
message du soir porte la règle en toutes lettres — « le fait est le
compliment » — avec une ceinture déterministe (`findQualifyingVerdict`) qui
refuse « bien joué », « continue comme ça », « tu gères », et un contrôle des
chiffres (`allowedNumbers`) qui refuse un nombre absent des faits. Le bilan
hebdomadaire partage **la même** liste de motifs, exprès, pour qu'elle ne
diverge pas.

**Le chat n'a rien de tout ça.** La même phrase interdite le soir à 20 h est
autorisée dans la conversation à 20 h 05, par le même agent, au même
utilisateur. Et c'est dans la conversation qu'elle fait le plus de dégâts, parce
que c'est là que la personne vient quand ça va mal.

**Ce que ça coûte.** Le coût est écrit dans `daily_recap.ts` et il n'est pas
réparable : « le soir où Sophia félicite pour une journée que l'élève sait
mauvaise, tout le canal devient non-crédible, et il n'y a pas de retour en
arrière ». Un encouragement creux ne rate pas sa cible : il **détruit** la
valeur de tous les messages suivants, y compris les vrais.

## 2. Job stories

> **Quand** ma semaine a été mauvaise et que je le dis, **je veux** qu'on me
> réponde avec quelque chose que je ne savais pas, **pour que** ça vaille la
> peine d'en avoir parlé.

> **Quand** je suis découragé, **je veux** qu'on me dise ce que j'ai réellement
> fait, **pour que** je puisse décider moi-même si c'est peu ou beaucoup.

> **Quand** il n'y a rien à dire de ma semaine, **je préfère** une réponse
> courte et sobre qu'une consolation, **pour que** je continue à croire ce
> qu'on me dit.

## 3. Périmètre

### Dans le périmètre

- Étendre la ceinture existante — `findQualifyingVerdict` + `allowedNumbers` —
  **à la réponse visible du chat**, sur les tours de détresse ou de découragement.
- Donner à l'agent la **matière** dont il a besoin pour être groundé : les faits
  de la journée (`loadDayFacts`) et de la semaine (`readWeekReview`), déjà
  chargeables, aujourd'hui absents du contexte du compagnon.
- La règle du **signal faible** : sans matière, la réponse est **courte et
  sobre**, jamais chaleureuse pour compenser.
- Une seule liste de motifs, partagée entre le soir, le bilan hebdo et le chat.

### Hors périmètre — engageant

- ❌ **Aucune seconde liste de motifs.** `VERDICT_PATTERNS` est déjà le point
  d'entrée partagé du soir et de l'hebdo, et son en-tête dit pourquoi : « deux
  vocabulaires pour une même règle produit ». Le chat s'y branche ou ne se
  branche pas ; il n'écrit pas la sienne.
- ❌ **Ceci n'est pas la crise.** `safety_crisis` et le plancher TCA ont leurs
  propres chemins, leurs ressources et leurs gardes. Cette fiche traite le
  découragement ordinaire, et **ne touche à aucun des deux**.
- ❌ **Aucun verdict sur la journée**, même positif, même vrai. Un décompte ne
  suggère pas de réponse ; un jugement, si.
- ❌ **Aucun chiffre inventé.** Un nombre qui n'est pas dans les faits chargés
  ne sort pas, exactement comme le soir.
- ❌ **Pas de réécriture des flows existants.** Le soir et l'hebdo passent déjà
  la ceinture ; on ne les retouche pas, on les **rejoint**.
- ❌ **Aucune sollicitation en guise de soutien.** « Raconte-moi ta journée »
  n'est pas du soutien, c'est de la collecte (T3 du [README](README.md)).

## 4. Le circuit

```
   « cette semaine a été horrible »
                │
                ▼
     ┌──────────────────────────┐
     │ crise / plancher TCA ?   │──oui──►  chemins existants, INCHANGÉS
     └──────────────────────────┘
                │ non
                ▼
     ┌────────────────────────────────────────┐
     │ MATIÈRE                    ← NOUVEAU   │
     │  loadDayFacts(aujourd'hui)             │
     │  readWeekReview(semaine courante)      │
     │  → recapGround: ticked | logged | none │
     └────────────────────────────────────────┘
                │
      ┌─────────┴──────────┐
      │ ground             │ none
      ▼                    ▼
  la réponse s'appuie   réponse COURTE ET SOBRE
  sur un fait cité      (pas de chaleur compensatoire)
      │                    │
      └─────────┬──────────┘
                ▼
     ┌────────────────────────────────────────┐
     │ CEINTURE, sur le texte visible         │
     │  findQualifyingVerdict  → réécrire     │
     │  allowedNumbers         → réécrire     │
     │  (mêmes motifs que le soir et l'hebdo) │
     └────────────────────────────────────────┘
                │
                ▼
     verrou de doctrine (inchangé) ──► la réponse sort
```

**Le point qui gouverne le dessin** : `recapGround` décide **avant** la
rédaction. On ne demande pas au modèle d'être groundé, on lui donne de la
matière ou on raccourcit sa laisse.

## 5. Modèle de données

**Néant.** Cette fiche ne persiste rien. Elle lit ce qui existe
(`protocol_events` via `loadDayFacts`, `week_reviews` via `readWeekReview`) et
elle **juge un texte**.

Une seule trace, en observabilité et pas en base métier : le motif de refus de
la ceinture (`qualifies_the_day`, `invented_number`), pour qu'on puisse mesurer
§10 sans lire les conversations — T8 du [README](README.md) : le coach ne lit jamais le
contenu.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Le soutien est **groundé ou court** | « courage, demain ira mieux » est la tendresse non groundée que ce produit proscrit ; et un canal non crédible ne se répare pas |
| **R2** | Une seule liste de motifs pour les trois surfaces | deux vocabulaires pour une même règle divergent, toujours |
| **R3** | La ceinture mord **dans les deux langues** | la cicatrice est écrite dans `VERDICT_PATTERNS` : `/\bbien\s+jou[ée]\b/` ne mordait pas sur « Bien joué, » — `\b` ne se calcule pas sur « é ». Le motif existait, était testé nulle part, et laissait passer la formule la plus courante |
| **R4** | Aucun chiffre qui ne soit dans les faits chargés | un chiffre inventé dans une réponse de soutien est un mensonge sur la vie de quelqu'un |
| **R5** | Sans matière : **court et sobre**, jamais chaleureux | mémoire `proactive-tone-no-ungrounded-tenderness` : signal faible = court et sobre. La chaleur compensatoire est précisément le réflexe à couper |
| **R6** | Aucun verdict sur la journée, **même positif** | l'ouverture énonce des faits et n'a pas le droit de rendre un verdict — sinon elle biaise ce que la personne va répondre |
| **R7** | La crise n'est pas concernée | elle a ses chemins, ses ressources par pays et ses gardes. On ne les traverse pas |
| **R8** | Quand la ceinture mord, on **réécrit**, on ne bloque pas | un tour muet est pire qu'un tour sobre ; le repli est un texte déterministe, pas un silence |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Aucun fait de la semaine | réponse courte, sobre, sans consolation. Elle **peut** dire qu'elle ne sait pas |
| Le chargement des faits échoue | traité comme « aucun fait » — jamais comme « aucune activité ». La nuance est journalisée ; un échec silencieux ferait dire « tu n'as rien fait » à quelqu'un d'assidu |
| La ceinture mord | le passage fautif est réécrit ; le motif est journalisé |
| La ceinture mord à chaque tour | c'est un **défaut de prompt**, pas un repli acceptable. Le repli qui devient le cas nominal est un composeur mort déguisé en composeur prudent — §10 doit le rendre visible |
| Le plancher de restriction est levé | pas de chiffre, pas de progression, pas d'adhérence. `SUPPRESSED_STUDENT_SURFACES` gouverne, et la matière est filtrée **avant** d'entrer dans le prompt |
| Élève mineur | aucun chiffre de quantité — la garde `minor_quantity` du soir vaut ici pour la même raison |

## 8. Critères d'acceptation

```gherkin
Étant donné un élève qui dit que sa semaine a été difficile
Et qu'il a coché 5 dîners sur 7
Quand l'agent répond
Alors sa réponse s'appuie sur un fait de la semaine
Et ne contient aucun encouragement non groundé

Étant donné un élève sans aucun fait sur la semaine
Quand il dit que ça a été dur
Alors la réponse est courte et sobre
Et elle ne contient ni compliment ni consolation

Étant donné une réponse générée contenant « bien joué »
Quand la ceinture s'applique
Alors le passage est réécrit
Et le motif « qualifies_the_day » est journalisé

Étant donné une réponse générée contenant « Bien joué, » avec la virgule
Quand la ceinture s'applique
Alors elle mord — la frontière de mot ne se calcule pas sur « é »

Étant donné une réponse générée citant « 4 repas » alors que les faits en
     portent 2
Quand la ceinture s'applique
Alors le chiffre est refusé

Étant donné un élève sous plancher de restriction
Quand il dit que sa semaine a été dure
Alors la réponse ne contient aucun chiffre d'adhérence ni de progression

Étant donné un tour de crise
Quand l'agent répond
Alors le chemin de crise s'applique tel quel, sans passer par cette fiche
```

## 9. Rabbit holes

- **Élargir la liste de motifs.** Chaque faux négatif observé donnera envie
  d'ajouter un motif. La liste est partagée par trois surfaces : un motif trop
  large refusera des textes corrects sur le message du soir, et le repli
  deviendra le cas nominal en silence — le défaut exact que `sanitizeComposedNudge`
  documente.
- **La frontière découragement / détresse.** Elle est réelle et floue. Cette
  fiche ne la déplace pas : elle s'applique **après** que les gardes de crise ont
  dit non, et elle ne décide jamais qu'un tour n'est pas une crise.
- **Grounder par la mémoire longue.** Tentant, et hors sujet : la mémoire porte
  des préférences et des souvenirs, pas des faits comptés. Un « tu m'avais dit
  que tu aimais cuisiner le dimanche » n'est pas du soutien groundé, c'est du
  rappel.
- **Le budget de prompt.** Ajouter les faits du jour et de la semaine au
  compagnon coûte des tokens dans un prompt qui tronque **par la queue**. La
  matière entre **bornée**, et le bloc doctrine ne perd pas sa place.

## 10. Ce qu'on mesure

- Part des tours de découragement dont la réponse **cite un fait**
- Taux de morsure de la ceinture, par motif — **s'il est élevé, c'est le prompt
  qu'il faut corriger, pas la ceinture qu'il faut desserrer**
- Part des réponses « courtes et sobres » (attendu : non nulle — si elle est
  nulle, ou bien tout le monde a de la matière, ou bien la règle R5 n'est pas
  appliquée)

**Contre-mesure.** Le nombre de tours où la personne **repart** après une
réponse sobre. Si la sobriété fait fuir plus qu'elle ne crédibilise, la règle
est bonne en principe et mal calibrée en pratique — et il faut le savoir par un
chiffre, pas par une intuition.

## 11. Questions ouvertes

- Une réponse groundée doit-elle citer **un** fait ou **le** fait le plus
  favorable ? Choisir le plus favorable est un verdict déguisé.
- Le taux de morsure doit-il **alerter** au-delà d'un seuil, comme un cron de
  santé ? Ce serait la première ceinture du dépôt à s'auto-surveiller.
