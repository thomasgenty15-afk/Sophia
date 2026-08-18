# FF-056 · La divergence constatée

| | |
|---|---|
| **Identifiant** | `FF-056-la-divergence-constatee` |
| **Statut** | 🟡 Spécifiée |
| **Date** | 2026-08-11 |
| **Autorité produit** | [README du domaine](README.md) (T1–T9) · [CONTRACT.md](../../keel/CONTRACT.md) (jamais de kcal) · [FF-021](FF-021-le-plancher-de-restriction-alimentaire.md) |
| **Dépend de** | [FF-008](FF-008-le-poids-annonce.md) + [FF-031](../suivi-quotidien/FF-031-mesures-corporelles-datees.md) (la série de poids) · `_shared/keel/daily_ask_budget.ts` (le budget T4) · [FF-028](FF-028-la-recommandation-quotidienne.md) (le canal des directives durables) · [FF-054](../composition-des-repas/FF-054-le-retour-de-fin-de-plan.md) (le moment à ne pas concurrencer) |
| **Effort estimé** | 3 à 4 jours |

---

## 1. Le problème

Quelqu'un suit un plan de perte — devant les autres. Le soir, seul, c'est
tartines ; le midi, de la crème dans le riz. Il coche, il dit que ça va, et
**il prend des kilos.**

Sur ce qu'il mange en cachette, il n'existe **aucun signal**, et il n'en
existera jamais : il ne déclarera rien, ne photographiera rien. Toute tentative
de le savoir serait de la surveillance — et elle échouerait quand même.

Mais il y a un signal, un seul, et il ne ment pas : **la balance**. Le produit
n'a pas besoin de savoir *ce qui* a été mangé ; il a besoin de constater que
**le résultat ne suit pas le plan** — puis d'aller chercher la cause auprès de
la seule personne qui la connaît. Sans spéculer : proposer une collation du
soir à quelqu'un dont le problème est le matin — ou un traitement, ou l'arrêt
du sport — c'est se tromper deux fois et perdre sa confiance.

**Ce que ça coûte de ne rien faire.** La personne échoue en silence pendant des
semaines, conclut que « le plan ne marche pas », et part. Le produit avait la
donnée (la série de poids), le moment, et le levier (changer le plan) — et il
n'a rien dit.

## 2. Job stories

> **Quand** mon poids ne suit pas alors que je crois suivre le plan, **je
> veux** qu'on m'en parle franchement, une fois, **pour que** ça change au lieu
> de continuer à rater en silence.

> **Quand** il y a une vraie raison — un traitement, l'arrêt du sport — **je
> veux** pouvoir la dire et qu'elle soit prise au sérieux, **pour que** le
> produit ne me traite pas comme un tricheur.

> **Quand** je ne sais pas moi-même où ça se joue, **je veux** un moyen simple
> et borné de le découvrir, **pour que** le plan puisse enfin viser juste.

> **Quand** je ne veux pas en parler, **je veux** que ça s'arrête là, **pour
> que** me peser ne devienne pas un interrogatoire.

## 3. Périmètre

### Le déclencheur — la divergence établie, jamais une pesée

Toutes les conditions, cumulatives :

- **2 à 3 mesures consécutives** qui vont contre la direction de l'objectif
  (`student_goals`), sur la série datée (FF-031). Le poids est bruyant — eau,
  sel, cycle — et une question déclenchée sur du bruit détruit le canal en un
  seul faux positif.
- **Des mesures régulières** : sans données, pas de constat, pas de question.
  Conséquence assumée : ce mécanisme ne couvre que les gens qui se pèsent.
- **Une personne encore active** (compose, coche, ou parle).
- **`restriction_flag` baissé** — au déclenchement ET à chaque tour du flow.
- **Majeur, titulaire du compte** (ou profil réclamé). Jamais un mineur, jamais
  une bouche sans compte : pas de mesures, pas de flow.
- **Cooldown expiré** : au moins un cycle de plan complet depuis le dernier
  épisode, deux après un refus.

### Le moment — calme, découplé du déclencheur

La divergence s'établit au rythme des pesées ; la question part dans une
**fenêtre calme** : environ deux jours après une fin de plan, jamais le jour du
retour de fin de plan (FF-054, qui possède ce moment-là), jamais dans les
heures calmes (21 h–8 h), et **sur le budget T4** — c'est une demande, elle
prend la place du jour ou attend.

### L'ouverture — la question honnête

> « Si tu manges ce qui est prévu, normalement ça devrait descendre.
> Qu'est-ce qui se passe ? »

Ce qui la rend non culpabilisante n'est pas le ton, c'est **le sujet de la
phrase** : elle énonce ce que *le plan* attend, pas ce que *la personne* a
fait. Et elle reste **vraiment ouverte** — pas « tu grignotes ? », pas « où ça
dérape ? » : chaque précision refermerait le champ sur la nourriture et
raterait les autres causes.

### Le sous-flow — patron `safety_crisis`

Une skill qui n'orchestre que, un **local dispatcher** qui classe la réponse
dans un **ensemble fermé de catégories**, un **reducer pur** testable hors
réseau, un **visible agent** qui valide le texte sortant, un état de tour en
tour. **2 à 3 tours maximum**, puis une action ou une sortie propre ;
expiration si la personne ne répond pas.

Les catégories, et ce qu'elles ouvrent :

| Réponse | Catégorie | Action (espace pré-calculé) |
|---|---|---|
| nomme un moment/aliment (« le matin je grignote », « je me ressers ») | `named_spot` | le plan absorbe **à l'endroit nommé** : vrai petit-déjeuner, portion revue, plat plus riche pour de vrai — via le canal de directives de FF-028 |
| ne suit pas le plan (cuisine autre chose, mange dehors) | `plan_mismatch` | contraintes pratiques + fenêtre de plan, pas une collation |
| l'activité a chuté (arrêt du sport, blessure) | `activity_drop` | consigné, intégré aux pratiques (FF-029). **Jamais de prescription d'exercice** |
| cause médicale (traitement, thyroïde) | `medical` | plancher médical : enregistrer, **ne pas interpréter**, orienter vers un médecin |
| sommeil, stress | `life_factor` | accusé honnête, **aucune promesse** de levier qu'on n'a pas |
| conteste ou relativise (muscle, eau, mauvaise pesée) | `not_a_divergence` | le flow sait conclure « **il n'y a rien à changer** » — branche essentielle |
| ne sait pas | `unknown` | la **fenêtre d'observation** (ci-dessous) |
| ne veut pas en parler | `declined` | sortie immédiate, propre, cooldown doublé |
| tout le reste | `other` | **obligatoire** — un classifieur qui force les cases produit des actions à côté, et une personne mal lue ne répond plus |

**Deux trappes vers le haut, à tout tour** : signes de rapport perturbé à la
nourriture → le flow rend la main au plancher TCA ; détresse → au chemin de
crise. Ce flow parle de poids : il lui faut une évacuation.

### La fenêtre d'observation — pour « je ne sais pas »

« Pendant trois jours, dis-moi juste ce que tu manges **en plus** de ce qui est
prévu, et je recale le plan. » Ce n'est pas du tracking : c'est **demandé,
borné (3 jours), avec un but énoncé et une fin annoncée** — et à la fin, ça
s'arrête tout seul et le plan est recalé. Les déclarations passent par les
planchers existants (FF-017, FF-009).

### Hors périmètre — engageant

- ❌ **Aucune détection de mensonge, jamais.** Ni « tu es sûr ? », ni
  recoupement coches/poids présenté à la personne. Traiter quelqu'un de
  menteur avec une formule polie reste le traiter de menteur.
- ❌ **Aucune estimation calorique de l'écart.** « Il te manque ~300 kcal » est
  interdit deux fois : par le contrat, et parce que ce serait faux.
- ❌ **Aucune remontée au foyer.** La divergence, l'épisode, la fenêtre
  d'observation : tout est au titulaire seul. *Ce qui touche le corps est à
  soi.*
- ❌ **Aucune prescription d'exercice.** Pas le métier du produit.
- ❌ **Aucune interprétation médicale.** Enregistrer, orienter, se taire.
- ❌ **Muet sous `restriction_flag`**, mineurs et bouches exclus — par
  construction, pas par consigne.
- ❌ **Pas un rendez-vous.** Cooldown long ; ce flow a le droit d'être rare.
  Mensuel, il devient une convocation.

## 4. Le circuit

```
   série de poids datée (FF-031)      student_goals (direction)
              └──────────────┬──────────────┘
                             ▼
              DÉTECTEUR PUR — divergence établie ?
              (2-3 mesures contre la direction, bruit filtré)
                             │ oui
                             ▼
        GATES : actif · majeur/titulaire · restriction_flag baissé
                · cooldown expiré · mesures régulières
                             │
                             ▼
        FENÊTRE CALME : ~J+2 après fin de plan · pas le jour de
        FF-054 · hors 21h-8h · budget T4 disponible (sinon attend)
                             │
                             ▼
   « Si tu manges ce qui est prévu, normalement ça devrait
     descendre. Qu'est-ce qui se passe ? »
                             │
                             ▼
        ┌─ SOUS-FLOW (skill · local dispatcher · reducer pur) ─┐
        │  classe en catégories FERMÉES · 2-3 tours MAX        │
        │  trappes permanentes : TCA ↑ · crise ↑               │
        └──────┬──────────────┬──────────────┬─────────────────┘
               ▼              ▼              ▼
        action durable   « rien à       fenêtre d'observation
        (canal FF-028,   changer »      3 jours, bornée
        confirmée par     — et on le    → recalage du plan
        un tap)           dit                │
               │                             │
               └──────────────┬──────────────┘
                              ▼
              LE PLAN SUIVANT PORTE LA TRACE  (T6)
              épisode clos · cooldown ≥ 1 cycle de plan
```

**Les deux points qui gouvernent le dessin** : le flow ne spécule jamais — il
demande, puis agit **à l'endroit nommé** ; et rien de durable ne s'écrit sans
confirmation de la personne (le tap est l'effet, jamais la classification).

## 5. Modèle de données

| Donnée | Origine |
|---|---|
| la divergence | **dérivée** à la lecture (série FF-031 × direction de l'objectif) — jamais stockée comme trait |
| l'épisode | une ligne : état (`proposed` / `in_flow` / `acted` / `nothing_to_change` / `declined` / `expired`), catégorie retenue, empreinte du plan, dates — c'est elle qui porte le cooldown |
| la directive durable | le canal de FF-028, confirmée par tap, relue (vérité d'exécution) |
| la fenêtre d'observation | état borné : ouverture, fin (J+3), et le recalage produit |

Rien de tout ça n'est visible du foyer, ni d'un coach en B2C.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Le déclencheur est une **divergence établie**, jamais une pesée | un faux positif sur du bruit détruit le canal — et fait arrêter de se peser |
| **R2** | Le sujet de la question est **le plan**, pas la personne | c'est ce qui la rend posable ; « qu'as-tu fait » est un procès |
| **R3** | La question est **ouverte** — aucune hypothèse dans la formulation | le produit ne sait pas si c'est le matin, le soir, un traitement ou le sport. Deviner, c'est se tromper deux fois |
| **R4** | Le LLM classe dans des catégories **fermées**, `other` incluse ; l'action vient d'un espace **pré-calculé** | rien de durable ne transite par un tirage ; une personne mal lue ne répond plus |
| **R5** | `not_a_divergence` existe et conclut « rien à changer » | un flow qui trouve toujours un problème fabrique de l'anxiété autour du poids — l'inverse exact du produit |
| **R6** | 2-3 tours max, puis action ou sortie ; expiration silencieuse | « discuter » sans borne devient une séance ; le précédent est le plafond de la précision de repas |
| **R7** | La sortie est **durable** et le plan suivant en porte la trace (T6) | une conversation qui s'évapore est du soutien sans conséquence — ce que le produit a cessé de faire |
| **R8** | Muet sous `restriction_flag`, trappes TCA/crise à chaque tour, jamais mineurs ni bouches | ce flow parle de poids qui ne descend pas : c'est le pire terrain du produit, les ceintures priment |
| **R9** | Une demande sur le budget T4, cooldown ≥ 1 cycle de plan (2 après refus) | rare est une propriété, pas un défaut ; répété, c'est un rendez-vous de comptes |
| **R10** | Le refus est respecté **immédiatement et durablement** | c'est ce qui rend la prochaine ouverture acceptable |
| **R11** | Aucun chiffre d'énergie, nulle part | contrat, et il serait faux de toute façon |
| **R12** | Rien n'est visible du foyer | *ce qui touche le corps est à soi* — sinon la personne cache aussi à l'app |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Poids bruyant sans tendance | pas de déclenchement — le seuil filtre, et c'est testé sur séries synthétiques |
| La personne ignore la question | expiration silencieuse, cooldown normal, aucune relance |
| Réponse inclassable | `other` → l'agent reformule UNE fois ou sort proprement ; jamais une action à côté |
| Réponse « j'ai un nouveau traitement » | `medical` : enregistré, zéro interprétation, orientation médecin si manifeste |
| `restriction_flag` se lève en cours de flow | trappe : le flow disparaît, le plancher prend le tour |
| La fenêtre d'observation ne reçoit rien | elle expire à J+3 sans reproche ; le recalage se fait avec ce qu'il y a |
| Le plan change pendant l'épisode | l'empreinte invalide l'épisode ; rien ne s'applique sur un plan disparu |
| Budget T4 déjà consommé le jour prévu | la question attend le prochain jour calme — elle ne double jamais |
| La personne arrête de se peser après un épisode | **le RED majeur** — voir §10 ; si le flow tue sa propre entrée, il est mal calibré |

## 8. Critères d'acceptation

```gherkin
Étant donné un objectif de perte et 3 mesures consécutives qui montent
Quand la fenêtre calme arrive et que le budget du jour est libre
Alors la question part, une fois, formulée sur le plan et ouverte

Étant donné une seule pesée en hausse dans une série stable
Quand le détecteur tourne
Alors rien ne part

Étant donné la réponse « le matin je grignote en me levant »
Quand l'épisode se conclut et que la personne confirme d'un tap
Alors une directive durable existe, relue
Et la composition suivante porte un vrai petit-déjeuner

Étant donné la réponse « j'ai commencé un traitement »
Quand l'épisode se conclut
Alors rien n'est interprété, l'information est enregistrée
Et la réponse oriente vers un médecin sans diagnostiquer

Étant donné la réponse « je me suis mis à la muscu »
Quand l'épisode se conclut
Alors le flow dit qu'il n'y a rien à changer

Étant donné la réponse « je ne sais pas »
Quand la personne accepte la fenêtre d'observation
Alors elle dure 3 jours, s'arrête seule, et le plan est recalé

Étant donné la réponse « je n'ai pas envie d'en parler »
Quand le tour se termine
Alors le flow sort immédiatement et ne revient pas avant deux cycles de plan

Étant donné un élève sous restriction_flag
Quand le détecteur trouve une divergence
Alors rien ne part — et si le drapeau se lève en cours de flow, le flow
     disparaît au profit du plancher

Étant donné un épisode en cours et un plan modifié entre-temps
Quand la personne confirme une action
Alors rien ne s'applique, et elle le sait en une phrase

Étant donné n'importe quel texte produit par ce flow, FR et EN
Quand on y cherche un chiffre de calories, « tu es sûr ? », ou un reproche
Alors il n'y en a aucun
```

## 9. Rabbit holes

- **Le seuil de bruit.** Trop sensible : faux positifs, canal mort. Trop
  sourd : le flow n'existe pas. Il se calibre sur des séries réelles, en
  constante exportée et testée — pas à l'intuition.
- **Le classifieur qui force les cases.** `other` est la soupape ; sans elle,
  chaque réponse inclassable produit une action à côté et la personne se sent
  mal lue. C'est la fin du flow.
- **La conversation qui s'allonge.** Chaque tour au-delà de trois transforme
  l'échange en séance. La borne est structurelle, pas une consigne.
- **La copie qui glisse vers le soupçon.** « Tu es sûr ? », « pourtant les
  chiffres… » — le framing « il ment » ne doit exister nulle part, y compris
  dans les prompts internes : ce qui entre dans un prompt finit par sortir.
- **La fenêtre d'observation qui devient du tracking.** Elle est bornée,
  demandée, finie d'avance. La prolonger « parce que ça marchait bien » recrée
  exactement la collecte que le produit a tuée.
- **Confondre ce flow avec FF-054.** Le retour de fin de plan est un
  questionnaire de qualité du plan ; ceci est une conversation d'écart au
  résultat. Les fusionner noierait la question dans un formulaire.

## 10. Ce qu'on mesure

- Taux de réponse à la question d'ouverture (LA santé du flow)
- Part des épisodes finissant en **action durable** ou **« rien à changer »**
  (les deux bonnes fins), vs expirés/refusés
- La trace dans le plan suivant : 100 % des actions confirmées (T6)
- La divergence à l'épisode suivant : baisse-t-elle après une action ?

**Contre-mesure — le RED majeur.** La **fréquence de pesée après un épisode**.
Si les gens arrêtent de se peser pour éviter la question, le flow détruit sa
propre entrée ET la ceinture de sécurité qui lit la même série. Ce chiffre se
surveille dès le premier utilisateur réel ; s'il baisse, on allonge le cooldown
ou on adoucit l'ouverture avant toute autre itération.

## 11. Questions ouvertes

- **B2B** : le coach voit la divergence dans sa synthèse — le flow tourne-t-il
  quand même pour ses élèves, ou l'escalade au coach le remplace-t-elle ? (Les
  deux sont défendables ; non tranché.)
- Les seuils exacts (nombre de mesures, amplitude, fenêtre) — à calibrer sur
  données réelles, pas dans l'abstrait.
- La fenêtre d'observation : ses déclarations passent par FF-017/FF-009 — leur
  suffit-il d'un marqueur « fenêtre ouverte » pour que le recalage les
  retrouve, ou faut-il un lien explicite à l'épisode ?
- La prise de masse : la divergence inverse (poids qui stagne sous un objectif
  de prise) est le même flow avec les mêmes catégories — vérifier qu'aucune
  formulation ne présuppose la perte.
