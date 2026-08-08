# FF-009 · Le repas hors plan

| | |
|---|---|
| **Identifiant** | `FF-009-le-repas-hors-plan` |
| **Statut** | 🟡 Spécifiée |
| **Date** | 2026-08-07 |
| **Autorité produit** | la direction du domaine ([README](README.md)) · `_shared/keel/doctrine_starter.ts` clé `off_plan_meals` |
| **Dépend de** | `_shared/keel/meal_declaration_floor.ts` · `protocol_events` · `_shared/keel/forbidden_matcher.ts` (le verrou nomme déjà `cheat_meal`) |
| **Effort estimé** | 1,5 jour |

---

## 1. Le problème

Un élève saute le dîner prévu et commande une pizza. Il l'écrit. Aujourd'hui,
trois choses peuvent arriver, toutes mauvaises :

1. Le plancher ne mord pas (« pizza » n'est pas dans le lexique fermé) et **rien
   n'est enregistré** — la soirée disparaît ;
2. Le plancher mord sur un composant reconnu et écrit un `protocol_events` qui
   ressemble en tout point à un repas cuisiné comme prévu ;
3. L'élève, sachant que ça ne compte pas, **ne le dit plus**.

Le troisième est le pire. Le produit a déjà tranché la façon d'en **parler** :
`doctrine_starter.ts` porte le débat `off_plan_meals`, dont la position
`no_cheat_meal` interdit littéralement « cheat meal », « treat meal »,
« make up for it », « burn it off » — et le verrou déterministe mord dessus.
On a donc le vocabulaire, la posture et l'interdit. **Il manque le fait.**

**Ce que ça coûte.** Le coach lit une semaine où quatre dîners sont cuisinés et
trois soirs sont vides. Il en conclut que l'élève n'a rien mangé, ou qu'il n'a
rien dit. Les deux sont faux. La donnée qui expliquerait la semaine — *où* le
plan se défait, à quelle heure, quel jour — n'existe nulle part.

## 2. Job stories

> **Quand** j'ai commandé au lieu de cuisiner, **je veux** pouvoir le dire sans
> que ce soit un aveu, **pour que** ma semaine soit vraie plutôt que flatteuse.

> **Quand** je regarde ma semaine, **je veux** distinguer ce que j'ai cuisiné de
> ce que j'ai mangé ailleurs, **pour que** je sache où ça se défait.

> **Quand** j'étais à un mariage, **je veux** que ça compte comme un repas de
> ma vie, **pour que** le produit ne me fasse pas croire que ma semaine a un
> trou.

## 3. Périmètre

### Dans le périmètre

- Un repas déclaré peut porter une **relation au plan** : `as_planned` ·
  `off_plan` · `unknown`.
- Le plancher déterministe reconnaît les marqueurs de hors-plan
  (« commandé », « au resto », « livraison », « chez des amis », « ordered »,
  « takeout », « ate out »), y compris **sans aucun aliment reconnu** — c'est la
  différence avec `detectDeclaredMeal`, qui exige un composant.
- Trois comptes **séparés** et restitués séparément : cuisiné comme prévu ·
  hors plan · photographié.
- La réponse de l'agent reste sous le verrou de doctrine : le vocabulaire du
  hors-plan est celui du coach, pas celui du produit.
- La réponse **peut porter l'invitation à la photo** ([FF-025](FF-025-l-invitation-a-la-photo.md)) —
  une fois, sur le budget partagé, jamais de relance.

### Hors périmètre — engageant

- ❌ **Aucun jugement.** Ni « écart », ni « craquage », ni « rattrapage ». Le
  verrou interdit déjà les six formes de `cheat_meal` : le produit ne réintroduit
  pas par une étiquette ce que la doctrine interdit par les mots.
- ❌ **Aucun score fondu.** Les trois comptes ne se somment jamais en un
  « repas suivis cette semaine ». Fondus, ils donnent un chiffre que personne en
  aval ne peut plus défaire — et le coach le lira comme un fait (T-règles du [README](README.md)).
- ❌ **Aucune inférence d'aliments.** « J'ai commandé » n'écrit pas de
  `food_group_ref`. Un hors-plan sans détail **compte comme hors plan** et
  n'invente rien. Le lexique fermé de `meal_declaration_floor.ts` reste la règle :
  seul ce qui est nommé devient un fait.
- ❌ **Aucune décoche automatique du plat prévu.** Manger dehors ne prouve pas
  qu'on n'a pas cuisiné à midi. Rien n'est jamais inféré d'un silence.
- ❌ **Pas de relance.** Le produit n'ira jamais demander « et hier soir, tu as
  mangé quoi ? » (hors périmètre du domaine, voir [README](README.md)).

## 4. Le circuit

```
   « j'ai commandé une pizza »
              │
              ▼
   ┌────────────────────────────────────────────────┐
   │ detectDeclaredMeal   (composants)              │
   │ detectOffPlanMarker  (relation au plan) ← NEW  │  DÉTERMINISTE, avant le modèle
   └────────────────────────────────────────────────┘
              │
      ┌───────┴────────────────────────────┐
      │ marqueur seul,  │ marqueur         │ composants
      │ sans composant  │ + composants     │ seuls
      ▼                 ▼                  ▼
  off_plan          off_plan           as_planned
  aucun aliment     + aliments         (comportement actuel)
      │                 │                  │
      └────────┬────────┴──────────────────┘
               ▼
     protocol_events, source='chat'
     + relation au plan
               │
      ┌────────┴────────┬─────────────────┐
      ▼                 ▼                 ▼
  la journée        la semaine        la vue coach
  (daily_recap)     (week_review)     (déjà filtrée sur
   3 comptes         3 comptes         disqualified_reason)
```

## 5. Modèle de données

`protocol_events` porte déjà tout sauf la relation au plan. On ajoute **une
colonne, nullable**, sur le modèle exact de `disqualified_reason` (ajoutée par
`20260804160000_meal_photo_integrity.sql`) :

| Champ | Origine | Valeurs |
|---|---|---|
| `plan_relation` | **classifié déterministiquement** par le plancher | `as_planned` · `off_plan` · `null` (inconnu) |

`null` est un état, pas un défaut à combler : c'est ce que portent les millions
de lignes existantes, et les faire basculer d'office en `as_planned` fabriquerait
une adhérence rétroactive qui n'a jamais été mesurée.

Trois vérités déjà présentes qui ne changent pas :
- `source` (`'chat' | 'photo' | 'quick_tap' | …`) reste la **provenance**, pas la
  relation au plan. Une photo peut être un repas hors plan.
- `evidence_weight` (photo 1.0 / texte détaillé 0.8 / pouce 0.4) reste la
  **fiabilité**. Un hors-plan bien décrit est fiable.
- `disqualified_reason` reste la **rétractation**. Tout lecteur qui compte filtre
  déjà dessus, et ce filtre ne bouge pas.

Trois axes, trois colonnes, jamais fondus. La vue coach
(`20260804182000_coach_events_hide_disqualified.sql`) doit exposer
`plan_relation` — sans quoi le coach voit un repas de plus sans savoir lequel.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | La relation au plan est **classifiée déterministiquement**, jamais par le modèle | même raison que le plancher de repas : `[0, 3, 3, 0]` sur une phrase identique. Et ici la classification est plus facile à rater, parce qu'elle est lexicale et pas sémantique |
| **R2** | Un marqueur hors-plan **sans aucun aliment** produit quand même un fait | c'est le cas nominal (« j'ai commandé »). Exiger un composant, comme le fait `detectDeclaredMeal`, perdrait exactement ce qu'on cherche à capter |
| **R3** | Un hors-plan sans détail n'invente **aucun** `food_group_ref` | « only what the payload EXPLICITLY names becomes a fact ». Un plancher qui devine un groupe alimentaire est pire que pas de plancher |
| **R4** | Les trois comptes ne se somment **jamais** | irréversible en aval, et lu comme un fait par le coach |
| **R5** | `null` ne devient jamais `as_planned` par défaut | fabriquerait une adhérence rétroactive |
| **R6** | Le vocabulaire de restitution passe par le **verrou de doctrine** | `off_plan_meals` est un débat que le coach a tranché ; six formes sont déjà interdites. Le produit ne les réintroduit pas par une étiquette d'écran |
| **R7** | Aucune décoche, aucune annulation d'un repas prévu | rien n'est jamais inféré d'un silence ni d'une phrase ambiguë |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| « J'ai commandé » sans plus | un fait hors plan, sans aliment, sans quantité |
| « J'ai commandé une pizza margherita » | un fait hors plan **avec** les composants reconnus par le lexique |
| « Je vais commander ce soir » | **rien**. Le plancher désarme sur l'intention comme il désarme déjà sur l'hypothèse |
| « On a commandé pour les enfants » | **rien**. Le désarme « quelqu'un d'autre » existe déjà et couvre le cas |
| Le coach n'a pas tranché `off_plan_meals` | le fait est enregistré ; la restitution reste factuelle et sans étiquette de valeur |
| Le modèle tombe | le fait est déjà écrit. On perd la formulation, jamais la donnée |
| Une réponse contient « cheat meal » | le verrou déterministe la réécrit, comme aujourd'hui — l'ajout de la fonctionnalité ne desserre rien |

## 8. Critères d'acceptation

```gherkin
Étant donné un élève qui écrit « j'ai commandé une pizza ce soir »
Quand le tour se termine
Alors un repas HORS PLAN est enregistré
Et il ne se confond pas avec un repas cuisiné comme prévu

Étant donné un élève qui écrit « on a mangé au resto hier »
Quand le tour se termine
Alors un repas hors plan est enregistré
Et AUCUN groupe alimentaire n'est inventé

Étant donné un élève qui écrit « I ordered takeout last night »
Quand le tour se termine
Alors le fait est enregistré — la garde mord en anglais comme en français

Étant donné un élève qui écrit « je vais commander ce soir »
Quand le tour se termine
Alors RIEN n'est enregistré

Étant donné une semaine avec 4 repas cuisinés, 2 hors plan et 1 photo
Quand l'élève ou le coach regarde la semaine
Alors les trois comptes s'affichent séparément
Et aucune surface n'affiche leur somme

Étant donné un coach dont la doctrine tranche « il n'y a pas de cheat meal »
Quand l'agent parle d'un repas hors plan
Alors sa réponse ne contient aucune des formes interdites
```

## 9. Rabbit holes

- **Le lexique des marqueurs.** Fermé, bilingue, et plus difficile que celui des
  aliments : « chez ma mère » est hors plan, « chez moi » ne l'est pas ; « on est
  sortis » est ambigu. Chaque cas de frontière s'écrit dans le test d'abord.
- **La tentation du taux.** « 71 % de repas comme prévu » arrivera dans la
  conversation dès la première démo. C'est un score d'adhérence déguisé, et
  `adherence_score` est déjà dans `SUPPRESSED_STUDENT_SURFACES`.
- **La rétroactivité.** Quelqu'un voudra remplir `plan_relation` sur l'existant
  par une requête. Il n'y a aucune donnée pour le faire honnêtement.
- **La confusion avec `disqualified_reason`.** Un repas hors plan est un repas
  **mangé**. Un repas décoché est un repas **non mangé**. Les deux colonnes
  vivent côte à côte et un lecteur pressé les confondra.

## 10. Ce qu'on mesure

- Nombre de faits hors plan par élève et par semaine — **s'il reste à zéro,
  l'affordance est invisible**, pas la vie de l'élève sans écart
- Part des hors-plan **sans aucun aliment** (attendu : élevée — c'est le cas
  nominal, et une part faible signalerait que le plancher exige encore un
  composant)
- Nombre de jours entièrement vides (attendu : en baisse)

**Contre-mesure.** Le volume de repas déclarés **comme prévu**. Si l'ouverture
du hors-plan fait basculer des repas cuisinés vers le hors-plan sans que le
total bouge, on n'a pas capté de la vie : on a déplacé une étiquette.

## 11. Questions ouvertes

- Un hors-plan **remplace-t-il** le repas prévu du même créneau dans la
  restitution, ou coexiste-t-il avec lui ? Les deux sont défendables ; aucune
  n'est tranchée.
- Le coach doit-il voir le hors-plan **au niveau du créneau** (« les mardis
  soir ») ou seulement au compte hebdomadaire ? Le premier est bien plus utile
  et bien plus proche de la surveillance.
