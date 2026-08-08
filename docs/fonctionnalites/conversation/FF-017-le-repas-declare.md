# FF-017 · Le repas déclaré

| | |
|---|---|
| **Identifiant** | `FF-017-le-repas-declare` |
| **Statut** | 🟠 En cours — le plancher est livré ; la question d'approfondissement doit passer au plafond 1 et au budget partagé |
| **Date** | 2026-08-08 |
| **Autorité produit** | [CONTRACT.md](../../keel/CONTRACT.md) · la direction du domaine ([README](README.md)) T4, T5 |
| **Code** | `_shared/keel/meal_declaration_floor.ts` · `sophia-brain/router/run.ts` (~l. 3583) · outil `log_protocol_event` · table `protocol_events` · `_shared/keel/meal_precision.ts` (la question d'approfondissement — absorbe l'ex-FF-019) |
| **Effort estimé** | livrée + 0,5 jour (plafond 2→1 et budget partagé) |

---

## 1. Le problème

L'élève écrit « j'ai mangé du poulet ». C'est le geste le plus simple du
produit, et **c'est le fait qui fait le produit** : tout ce que le coach voit de
la semaine de son élève est construit là-dessus.

Confié au modèle du dispatcher, ce geste échouait. Mesuré en run réel le
2026-08-04, la même phrase jouée quatre fois sur quatre élèves neufs
correctement provisionnés :

| Phrase | Faits écrits |
|---|---|
| « j'ai mangé du poulet » | `[1, 1, 1, 1]` ✅ |
| « Poulet grillé, riz complet et brocolis à midi » | `[0, 3, 3, 0]` 🔴 |
| « Grilled salmon with quinoa and green beans for dinner » | `[0, 0, 0, 0]` 🔴 |

Une déclaration **complète, au passé, sans ambiguïté** — la meilleure qu'un
élève puisse écrire — n'était enregistrée qu'une fois sur deux en français et
**jamais** en anglais. Pendant ce temps la réponse confirmait le repas.

**Ce que ça coûte.** C'est l'accusé fantôme sur la donnée centrale : un élève
assidu qui dîne tous les soirs **apparaissait silencieux** au coach.

## 2. Job stories

> **Quand** je viens de dîner, **je veux** le dire en une phrase normale,
> **pour que** ça compte sans que j'aie à remplir un formulaire.

> **Quand** j'écris en anglais, **je veux** que ça marche autant qu'en
> français.

> **Quand** l'agent me confirme mon repas, **je veux** que ce soit vrai.

## 3. Périmètre

### Dans le périmètre

- Un **plancher déterministe** sur le message brut, **avant** le modèle.
- Un lexique d'aliments **fermé**, écrit à la main, appariement du terme le plus
  long d'abord et sans chevauchement.
- Des **désarmes** : négation, quelqu'un d'autre, hypothèse, consigne du coach
  rapportée, message de plus de 600 caractères (un copier-coller n'est pas une
  déclaration).
- Une **porte d'entrée** : verbe au passé, ou groupe nominal accompagné d'un
  créneau nommé.
- Le créneau vient de `slotKeyNamedIn`, jamais de l'heure qu'il est.
- **La question d'approfondissement** (absorbe l'ex-FF-019) : sur un fait
  déclaré **vague**, au plus **une** question par jour, en gabarits **fermés**
  par langue (« Il y avait quoi dedans ? », « Et tu as mangé quoi avec ? ») —
  des constantes testées contre un lexique de quantité FR+EN, jamais générées.
  Le gate est déterministe et refuse : sous `safety_band`, sur une intention
  future, sans fait committé, plafond atteint, flow déjà ouvert, ou si **aucune
  ligne encore ouverte du protocole du jour** ne dépend de la réponse — sans
  consommateur, « le fait imprécis vaut mieux qu'un élève qu'on a lassé ».
  Compteur illisible ou date locale absente ⇒ **refus** (un compteur cassé
  n'ouvre pas la porte). La question consomme le **budget partagé « une demande
  par jour »** (avec FF-025 et FF-028). Plafond décidé : **1** (le code est
  encore à 2 — voir le chantier de retrait des comportements).

### Hors périmètre — engageant

- ❌ **Le plancher ne remplace pas le dispatcher.** Si le frame porte déjà un
  `log_protocol_event`, il ne fait **rien** : le payload du modèle est plus
  riche (quantités, notes, liaison à un engagement).
- ❌ **Il ne devine aucun aliment.** Un mot absent du lexique ne devient pas un
  fait. Un plancher qui inventerait un groupe alimentaire serait **pire** que
  l'absence de plancher.
- ❌ **Il ne lit pas l'horloge**, et ne déduit donc jamais un créneau de l'heure.
- ❌ **Aucune quantité, aucune énergie.** Contrat, non-input #4.

## 4. Le circuit

```
   message brut de l'élève
            │
            ▼
   ┌──────────────────────────────────────────┐
   │ DÉSARMES (rendent null immédiatement)    │
   │  négation · quelqu'un d'autre ·          │
   │  hypothèse · consigne du coach ·         │
   │  > 600 caractères                        │
   └──────────────────────────────────────────┘
            │
            ▼
   ┌──────────────────────────────────────────┐
   │ PORTE   passé  OU  (nom + créneau nommé) │
   └──────────────────────────────────────────┘
            │
            ▼
   ┌──────────────────────────────────────────┐
   │ LEXIQUE FERMÉ, terme le plus long d'abord│
   │ zéro composant  ─►  null                 │
   └──────────────────────────────────────────┘
            │
            ▼
   le frame porte déjà log_protocol_event ? ──oui──► ne rien faire
            │ non
            ▼
   protocol_events  (source='chat')
```

## 5. Modèle de données

`protocol_events`, table **append-only**. Colonnes qui portent le sens :

| Champ | Origine |
|---|---|
| `source` | `'chat'` — la provenance (`'photo'`, `'quick_tap'`… pour les autres chemins) |
| `food_group_ref` | **le lexique fermé** — jamais une inférence |
| `student_note` | le message brut, tronqué |
| `slot_key` | `slotKeyNamedIn`, jamais l'horloge |
| `content_locale` | la langue de conversation de l'élève, passée par l'écrivain |
| `evidence_weight` | photo 1.0 · texte détaillé 0.8 · pouce 0.4 |
| `disqualified_reason` | la **rétractation** — une ligne décochée survit et porte `'food_not_eaten'` |

Tout lecteur qui **compte** filtre sur `disqualified_reason is null` — l'oublier
ferait féliciter pour un plat que l'élève vient de retirer.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Ce qui OUVRE un effet durable ne transite **pas** par le LLM du dispatcher | l'instabilité `[0, 3, 3, 0]` sur une phrase identique n'est pas une règle mal écrite, c'est un tirage. Et les correctifs prompt-only régressent en run réel |
| **R2** | Le lexique est **fermé** | seul ce que le payload nomme EXPLICITEMENT devient un fait |
| **R3** | Le plancher est un plancher, pas un remplaçant | le payload du modèle est plus riche quand il existe |
| **R4** | **L'asymétrie gouverne le réglage** | sur-déclarer écrit un fait de trop, que l'élève peut corriger ; sous-déclarer perd le repas **en silence** pendant que la réponse affirme le contraire. Seul le premier est récupérable → lexique **large** sur les aliments, porte **étroite** sur ce qui compte comme déclaration |
| **R5** | Aucune lecture d'horloge | un créneau déduit de l'heure est un créneau faux la moitié du temps |
| **R6** | La garde vaut dans les **deux langues** | c'est exactement l'échec mesuré : `[0,0,0,0]` en anglais |
| **R7** | Une rétractation ne supprime pas la ligne | table append-only ; c'est le filtre des lecteurs qui fait le travail |
| **R8** | La question d'approfondissement ne demande **jamais** une quantité | ligne rouge du contrat (non-input #4) ; le texte est une constante testée, pas un prompt — *un prompt est une intention, une constante est une garantie* |
| **R9** | Une question par jour, sur le budget partagé, adossée au fait donné | deux, c'était une relance ; et trois compteurs séparés seraient trois demandes par jour (T4 du [README](README.md)) |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| « je n'ai rien mangé » | **rien** — désarme négation |
| « ma fille a mangé des pâtes » | **rien** — désarme tiers |
| « si je mange du riz ce soir » | **rien** — désarme hypothèse |
| Aliment hors lexique | **rien** n'est inventé ; le tour continue |
| Le frame porte déjà l'effet | le plancher se tait |
| Le modèle tombe après le plancher | **le fait est écrit**. On perd la formulation, jamais la donnée |
| L'élève se corrige | le flow de correction existe et **amende sans doubler** |

## 8. Critères d'acceptation

```gherkin
Étant donné « Poulet grillé, riz complet et brocolis à midi »
Quand le tour se termine
Alors trois faits sont enregistrés — à chaque exécution, pas une sur deux

Étant donné « Grilled salmon with quinoa and green beans for dinner »
Quand le tour se termine
Alors les faits sont enregistrés — l'anglais vaut le français

Étant donné « je n'ai rien mangé aujourd'hui »
Quand le tour se termine
Alors AUCUN fait n'est enregistré

Étant donné un message de plus de 600 caractères
Quand le tour se termine
Alors aucun fait n'est enregistré — un copier-coller n'est pas une déclaration

Étant donné un frame portant déjà log_protocol_event
Quand le plancher s'exécute
Alors il ne fait rien

Étant donné une déclaration à 22 h sans créneau nommé
Quand le fait est écrit
Alors aucun créneau n'est déduit de l'heure
```

## 9. Rabbit holes

- **Élargir le lexique sans mesurer.** L'asymétrie R4 autorise un lexique large,
  pas un lexique bavard : un terme trop générique fabrique des faits.
- **Croire qu'un meilleur prompt suffirait.** Mesuré, et faux.
- **Oublier le filtre de rétractation** dans un nouveau lecteur. C'est la faute
  la plus facile à commettre et la plus gênante à voir.

## 10. Ce qu'on mesure

- Taux d'écriture sur une déclaration nette, **par langue** (cible : 100 %, les
  deux)
- Part des faits venus du plancher vs du dispatcher
- Corrections d'élève après écriture (proxy de la sur-déclaration)

**Contre-mesure.** Le taux de correction. S'il monte, la porte est trop large et
on pollue la donnée centrale du produit.

## 11. Questions ouvertes

- **Fiche écrite après coup.** Les chiffres de §1 sont ceux du run réel du
  2026-08-04 consignés dans l'en-tête du module ; ils ne sont pas re-mesurés ici.
- Le lexique n'a pas de procédure d'extension écrite : qui l'étend, sur quelle
  preuve, et qui vérifie qu'un terme ajouté ne fabrique pas de faits ?
- **L'ex-FF-019 (la question de précision) est absorbée ici** (2026-08-08) :
  la question d'approfondissement fait partie du repas déclaré, elle n'est pas
  une fonctionnalité à part. L'identifiant `FF-019` est brûlé. Le passage du
  plafond de 2 à 1 et le compteur partagé sont dans le chantier de retrait des
  comportements — tant qu'ils ne sont pas livrés, le code est à 2 et cette
  fiche est 🟠.
- L'élève qui **ignore** la question : rien, jamais — ni reformulation ni
  relance le lendemain. C'est déjà le comportement, et il ne doit pas bouger.
