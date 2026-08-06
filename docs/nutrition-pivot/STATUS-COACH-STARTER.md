# ÉTAT — le point de départ du coach (débats + listes d'aliments)

> 2026-08-06. Branche **`dewhatsapp`**.
> **Rien n'est déployé.** Local uniquement.
> Voisin direct : [STATUS-COACH-DOCUMENT.md](STATUS-COACH-DOCUMENT.md).

---

## En une phrase

Un coach qui n'a rien écrit tape **son camp sur dix débats du métier** et repart
avec une doctrine ; il tape **une liste d'aliments par style** et repart avec un
protocole compilé. Ce qui est livré, ce sont les **questions et les camps qui
existent**, jamais une position que KEEL signerait à sa place.

---

## Ce qu'on ne livre pas, et pourquoi

**Pas de doctrine par défaut adoptable en un clic.** Deux raisons, et la
première n'est pas juridique.

1. **Les clones.** Le produit se vend sur « c'est MON agent, dans MA voix », à
   49$ + 12$/élève actif. Dix coachs qui adoptent le même bloc sans le retoucher,
   ce sont dix agents qui sortent les mêmes phrases — et le premier coach qui
   reconnaît son `instead` mot pour mot chez un concurrent arrête de payer. Le
   défaut est silencieux jusqu'à ce jour-là.
2. **Une doctrine est contrariante par construction.** L'interview demande
   littéralement « qu'est-ce que tu crois que la plupart des coachs de ton
   domaine contesteraient ? ». Une doctrine que tout le monde peut adopter est
   une doctrine que personne ne conteste — donc pas une doctrine.

**Ce qui est livré à la place :** les désaccords, avec leurs camps. Deux coachs
qui ne sont pas d'accord repartent avec deux doctrines différentes : les débats
sont le **générateur de variance**, pas un habillage.

C'est le geste que `/coach/protocol` avait déjà posé et qui était écrit à
l'écran : *« Methods like yours usually have something to say about: … What do
you think? »* — on livre le sujet, jamais la réponse.

---

## Les gardes, et ce qu'elles empêchent

| Garde | Ce qu'elle empêche | Preuve |
|---|---|---|
| **Un sujet n'est jamais une position** | KEEL affirmerait une position nutritionnelle sous le nom du coach | test lexical sur les dix sujets (`should`, `must`, `never`, `healthy`…) |
| **Chaque débat porte « je ne fais pas de règle »**, en dernier, et elle ne sème rien | Un coach coche une position qu'il ne tient pas pour finir l'écran | test structurel |
| **Un interdit semé porte TOUJOURS son `instead`** (> 20 car., ≥ 3 formulations) | Le pire des deux mondes : la règle sans la réponse, donc un refus sec à un élève qui n'a aucun canal pour insister | test structurel |
| **Un `instead` ne déclenche pas son propre verrou** | Le texte servi en remplacement se ferait re-attraper, et le coach verrait son agent bloquer sa propre réponse | test réel via `findDoctrineViolations` |
| **Aucune cible chiffrée** dans aucune position | Réintroduirait par la porte du préréglage ce que `meal_generation.ts` retire par construction | test lexical |
| **Un pack se nomme par un STYLE, jamais un résultat** | « Pack perte de gras » est une affirmation sur un corps, sous le nom du coach, sur un produit non médical | test lexical sur libellés **et** descriptions |
| **Chaque slug de pack existe** | Le catalogue vit dans une migration, les packs dans du code : la divergence sortirait en violation de FK devant le coach | le test **lit la migration**, il n'en recopie pas la liste |

---

## Le cliquet anti-clone

`source: "starter"` sur les entrées semées (croyances, interdits, arbitrations).
Trois propriétés, et chacune a coûté une décision :

1. **Éditer une PHRASE rend la ligne au coach.** Changer une *portée* ne la rend
   pas — le compteur promet « ces phrases sont encore les nôtres », et se
   déclencher sur un geste qui n'a rien réécrit serait le mensonge inverse.
2. **La décision vit dans `claimOnEdit`**, et `patchEntry` l'applique pour ses
   quinze appelants. Quinze endroits qui devraient penser à passer
   `source: null` sont quinze endroits où l'un oubliera — et l'oubli ne casse
   rien, il ment.
3. **Le compteur ne bloque pas.** *« 3 lignes sur 3 sont encore mot pour mot les
   nôtres. Commence par les `instead` : c'est le texte exact que tes élèves
   lisent. »* Un coach a le droit de publier un préréglage intact ; il ne doit
   pas pouvoir le faire sans le savoir.

**`source` n'entre jamais dans le bloc compilé** — `compileDoctrineBlock` ne rend
que `claim` et `rationale`, donc le hash de cache est inchangé et l'agent
n'apprend pas qu'une conviction de son coach vient d'un préréglage.

---

## Le défaut trouvé en vérifiant (et pourquoi il compte)

`toEditorShape` rendait la provenance des croyances et des interdits, **pas celle
des arbitrations**. `parseCoachDoctrine` la ramenait à `null` de son côté (le
jeton n'était pas dans sa liste admise).

**Mesuré à l'écran :** le compteur affichait `2 of 3` avant enregistrement et
`1 of 3` après rechargement — il annonçait une appropriation que le coach
n'avait pas faite, ce qui est exactement le mensonge que ce compteur existe pour
éviter.

C'est la classe de bug que le commentaire de `goal_scope` décrit déjà dans ce
fichier (« l'oubli serait silencieux »), rencontrée une deuxième fois. Corrigé
aux deux endroits, **et le test qui ne vérifiait que deux sections sur trois a
été élargi** — c'est lui le vrai correctif.

---

## Ce qui marche, et comment on le sait

| Livrable | Preuve |
|---|---|
| Les dix débats, le semis, la fusion, le cliquet | `doctrine_starter_test.ts` — 27/27 |
| Les quatre packs | `food_packs_test.ts` — 7/7 |
| Aucune régression | `deno test _shared/keel/` — **1065/1065** |
| Front | `tsc --noEmit` propre ; `token-lint` OK (280 fichiers) ; `wiring-check` OK |
| Chaîne complète, vraie base | run navigateur ci-dessous |

### Le run navigateur (2026-08-06, local)

- **un tap** sur « Three meals, and the kitchen closes in between » écrit
  **trois** lignes : la croyance, l'arbitration mot pour mot (« ton plan c'est
  trop de nourriture ») et l'interdit `six_small_meals` avec son `instead`
- compteur : `3 of 3 lines above are still word-for-word ours`
- réécriture d'une croyance ⇒ `2 of 3` **immédiatement**
- enregistrement ⇒ en base : croyance `source: null`, interdit et arbitration
  `"starter"`
- **rechargement ⇒ `2 of 3`** (après correctif ; `1 of 3` avant)
- pack « Minimal cooking » : **21 lignes**, toutes `encouraged`, toutes
  `why_source: 'seeded'` avec le `why` du catalogue, sur 11 groupes — et le
  panneau de droite compile **11 règles** que Sophia vérifiera. D'un écran vide
  à un protocole en un tap.

---

## Décisions à connaître avant d'y toucher

- **Les packs ne posent que des `encouraged`.** Ce qu'un coach garde HORS de
  l'assiette est bien plus personnel — c'est souvent le cœur de sa méthode, et
  c'est ce que le verrou déterministe fera respecter mot pour mot. Corollaire
  utile : un pack ne peut pas créer de conflit de groupe, donc jamais désarmer
  une règle existante.
- **`why_source: 'seeded'`** sur un pack, pas `'coach'` : tant que le coach n'y
  a pas touché ce ne sont pas ses mots, et c'est ce qui autorise `draft_why` à
  les réécrire **depuis sa doctrine**. C'est l'inverse exact du choix fait pour
  une citation de document (`'coach'`, cf. STATUS-COACH-DOCUMENT), et les deux
  sont justes : là-bas le texte EST du coach, ici non.
- **Aucun pack n'est indexé par `GoalToken`.** `AXES_BY_GOAL` propose des SUJETS
  par objectif et laisse le coach répondre ; proposer des ALIMENTS par objectif
  serait la même façade avec la réponse écrite dedans.
- **Changer de camp ne détruit jamais une ligne retouchée.** Les lignes encore
  marquées `starter` disparaissent ; celles que le coach a réécrites restent, et
  l'écran le lui dit.

---

## Ce qui reste ouvert

- **Non déployé.** `supabase functions deploy coach-doctrine-v1` (le
  `toEditorShape` corrigé y est). Aucune migration dans ce lot.
- **Le contenu est un premier jet à relire.** Dix débats, vingt-trois positions,
  quatre packs. Il vit dans deux modules purs — une correction est une ligne, et
  les gardes lexicales tiennent pendant la relecture.
- **Le contenu n'est qu'en anglais.** Les positions sont de la prose (R2/R3) ;
  un coach francophone les lira en anglais avant de les réécrire. Acceptable
  tant qu'on l'attend de lui, à revoir si les packs partent tels quels.
- **Aucun test d'intégration automatisé** sur le parcours écran : la
  vérification ci-dessus est un run manuel reproductible.
- Antérieur à ce lot : `coverage-guard.int.test.ts` échoue toujours sur
  `student_coach_notes_touch_updated_at` (migration non commitée d'un autre
  chantier).
