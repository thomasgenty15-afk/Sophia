# FF-008 · Le poids annoncé

| | |
|---|---|
| **Identifiant** | `FF-008-le-poids-annonce` |
| **Statut** | 🟡 Spécifiée |
| **Date** | 2026-08-07 |
| **Autorité produit** | [CONTRACT.md](../../keel/CONTRACT.md) · la direction du domaine ([README](README.md)) T5, T7 |
| **Dépend de** | `_shared/keel/meal_declaration_floor.ts` (le patron) · `_shared/keel/week_review_io.ts` (l'écriture) · `_shared/keel/restriction_guard.ts` (la ceinture) · `_shared/keel/student_body_io.ts` (la lecture) |
| **Effort estimé** | 2 jours |

---

## 1. Le problème

Quelqu'un se pèse le mardi matin, ouvre l'app, écrit « je suis à 78 ». L'agent
répond quelque chose d'aimable. **Rien n'est enregistré.** Le poids n'existe que
s'il est saisi le dimanche soir, dans le formulaire hebdomadaire, à travers
`WeeklyCheckInDialog`.

La courbe de progression a donc des trous que l'élève croit avoir remplis. Il a
dit son poids ; il l'a vu confirmé par la réponse ; il ne le retrouve nulle
part. C'est l'accusé fantôme, déjà mesuré et déjà corrigé pour les repas.

**Ce que ça coûte.** Pas seulement une courbe incomplète. Le poids est l'entrée
n°1 de `restriction_guard.ts` : `rapid_weight_loss` compare
`outcomes.weight_7d_avg` sur une fenêtre glissante de 14 jours contre
`max_weekly_loss_pct = 1.2`. Un élève qui annonce sa perte **dans le chat** et
seulement là est un élève dont la perte rapide n'est **jamais détectée**. Le
coût de l'inaction n'est pas un confort manquant : c'est une ceinture de
sécurité qui ne voit pas passer la donnée qui l'arme.

## 2. Job stories

> **Quand** je viens de me peser un mardi matin, **je veux** pouvoir le dire là
> où je suis déjà en train d'écrire, **pour que** ça ne demande pas d'ouvrir un
> écran et d'attendre dimanche.

> **Quand** j'annonce un chiffre en passant dans une phrase, **je veux** être
> sûr qu'on ne se trompe pas sur ce que je viens de dire, **pour que** ma
> courbe ne raconte pas une progression qui n'a pas eu lieu.

> **Quand** je perds trop vite, **je veux** que le produit s'en aperçoive même
> si je n'ai jamais rempli le formulaire du dimanche.

## 3. Périmètre

### Dans le périmètre

- Un **plancher déterministe** `detectDeclaredBodyMeasure`, sur le modèle exact
  de `detectDeclaredMeal` : porte étroite, lexique fermé, `null` dès qu'il
  n'est pas sûr.
- Deux mesures : **poids** (kg, lb reconnues et converties) et **tour de
  taille** (cm, in).
- L'écriture **là où le point du dimanche écrit déjà**, donc lisible par
  `loadStudentBody`, par la courbe et par `restriction_guard`.
- Le branchement à la ceinture : une mesure venue du chat arme
  `rapid_weight_loss` comme n'importe quelle autre.
- La suspension sous plancher levé : ni renvoi de chiffre, ni relance.

### Hors périmètre — engageant

- ❌ **Le modèle ne reconnaît jamais un poids.** Il peut le commenter, jamais le
  déclencher. Mesuré sur les repas : la même phrase parfaite écrivait le fait
  une fois sur deux en français et jamais en anglais. Sur une donnée qui arme
  une ceinture, l'enjeu est plus grand, pas moins.
- ❌ **Aucune inférence depuis une variation.** « J'ai perdu 2 » n'écrit rien :
  il faudrait connaître le point de départ, et un poids déduit est un poids faux
  dans une ceinture de sécurité.
- ❌ **Aucune cible.** « Je veux atteindre 75 » n'est pas une mesure : l'une est
  une intention, l'autre un fait, et les confondre ferait lire une progression
  qui n'a jamais eu lieu. Le plancher doit désarmer sur la cible comme il
  désarme sur la négation et sur le tiers.
- ❌ **Aucun IMC, aucun besoin énergétique, aucun verdict.** L'en-tête de
  `student_body_io.ts` fait loi : « un IMC n'est pas une mesure de l'élève,
  c'est un verdict sur lui ».
- ❌ **Pas de nouvelle table.** Un second lieu de stockage du poids créerait un
  troisième modèle dans une table qui en porte déjà deux (`biofeedback.weight_kg`
  et `outcomes.weight_7d_avg`) — le bug écrivain/lecteur qui a laissé la carte
  poids vide.

## 4. Le circuit

```
   « je suis à 78 »  ─────────────────────────────┐
                                                  ▼
                              ┌─────────────────────────────────┐
                              │ detectDeclaredBodyMeasure       │  DÉTERMINISTE
                              │  · désarmes: négation, tiers,   │  avant le modèle
                              │    hypothèse, CIBLE, plage      │
                              │  · unité explicite ou défaut du │
                              │    profil                       │
                              │  · bornes 25–350 kg / 40–200 cm │
                              └─────────────────────────────────┘
                                       │ null            │ hit
                                       ▼                 ▼
                              rien n'est écrit    ┌──────────────────┐
                              (le tour continue)  │ écriture semaine │
                                                  │ courante, source │
                                                  │ = 'chat'         │
                                                  └──────────────────┘
                                                           │
                                    ┌──────────────────────┴──────────┐
                                    ▼                                 ▼
                         la courbe de progression         restriction_guard
                         (loadStudentBody)                (rapid_weight_loss)
                                                                     │
                                                       plancher levé ?
                                                                     │
                                                   ┌─────────────────┴────┐
                                                   ▼                      ▼
                                          réponse SANS chiffre     réponse normale
                                          et sans relance
```

**Le point qui gouverne le dessin** : la ceinture est branchée **sur le même
fil** que la lecture. Ouvrir le chemin d'écriture sans brancher la ceinture,
c'est désarmer une garde en croyant ajouter une commodité.

## 5. Modèle de données

Aucune table neuve. On écrit dans la ligne de revue de semaine courante, celle
que `week_review_io.ts` lit et écrit déjà.

| Champ | Origine | Écrit par |
|---|---|---|
| `biofeedback.weight_kg` | **saisi** (déclaration en conversation) | le plancher |
| `biofeedback.waist_cm` | **saisi** | le plancher |
| `biofeedback.source` | **dérivé** — `'chat'` | le plancher |
| `biofeedback.measured_at` | **dérivé** — l'instant du tour, en heure locale de l'élève | le plancher |
| `outcomes.weight_7d_avg` | **dérivé** — recalculé après écriture | le chemin existant |

Une mesure de la même semaine **remplace** la précédente : la revue du dimanche
n'a qu'un poids par semaine, et deux lignes créeraient une variation fantôme.
La dernière déclaration gagne, quelle que soit sa source — un élève qui se
corrige (« pardon, 78 pas 87 ») doit pouvoir le faire en parlant.

`biofeedbackAxes()` filtre déjà les clés de service (`source`, `weight_kg`,
`waist_cm`) hors des six axes notés : les mesures ne se rangent donc pas parmi
les notes du dimanche, et la lecture des axes reste propre.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | La reconnaissance est **déterministe** et passe **avant** le modèle | mesuré sur les repas : `[0, 3, 3, 0]` sur une phrase identique. Un tirage ne garde pas une ceinture |
| **R2** | Le plancher rend `null` dès qu'il n'est pas sûr | l'asymétrie s'inverse par rapport aux repas : sur-déclarer un repas est corrigeable, **sur-déclarer un poids fausse une ceinture de sécurité**. Ici, la porte est étroite des deux côtés |
| **R3** | Une variation (« j'ai perdu 2 ») n'écrit **rien** ; l'agent demande le chiffre **une fois** | un poids déduit est un poids faux, et l'agent ne relance pas deux fois (le chat ne réclame jamais — T3 du [README](README.md)) |
| **R4** | Une cible n'est **jamais** une mesure | « atteindre 75 » et « je suis à 78 » lus pareil feraient afficher une perte qui n'a pas eu lieu |
| **R5** | Les bornes sont celles du formulaire : 25–350 kg, 40–200 cm | une valeur hors bornes est refusée **explicitement**, pas silencieusement. Elle vient presque toujours d'une unité (`weight_7d_avg_kg = 170` en livres) et `restriction_guard` **jette** sur une valeur implausible : écrire silencieusement casserait la garde en aval |
| **R6** | L'unité est explicite, ou c'est celle du profil — jamais devinée du nombre | « 165 » est 165 lb ou 165 cm de tour de taille, jamais 165 kg. Le nombre seul ne tranche pas |
| **R7** | ⚠️ Une mesure venue du chat arme la ceinture **exactement** comme celle du dimanche | c'est la raison d'être de la fiche. Un test l'affirme sur le chemin réel, pas sur un mock |
| **R8** | Sous plancher levé, l'écriture a lieu, la **restitution** non | la garde suspend `weight_readout` partout ailleurs (`SUPPRESSED_STUDENT_SURFACES`). Une porte latérale par le chat annulerait la suspension. Mais ne pas écrire aveuglerait la ceinture au moment exact où elle compte |
| **R9** | Le plancher ne fait rien si le frame porte déjà l'effet | même règle que `detectDeclaredMeal` : le payload du modèle est plus riche, le plancher est un **plancher**, pas un remplaçant |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Le modèle tombe après le plancher | **la mesure est écrite**. On perd la formulation, jamais la donnée |
| « J'ai perdu 2 kg » | rien n'est écrit ; l'agent demande le chiffre absolu, **une fois**, et n'y revient pas |
| « Je fais entre 78 et 79 » | rien n'est écrit. Une plage n'est pas une mesure |
| « 165 » sans unité, profil métrique | rien n'est écrit — hors bornes kg, et un tour de taille de 165 cm est possible : l'ambiguïté ne se tranche pas au silence |
| Deux poids dans le même message | rien n'est écrit. Deux nombres = pas de mesure sûre |
| Poids déjà déclaré cette semaine | **remplacé**, pas ajouté. La revue du dimanche a un poids par semaine |
| L'écriture échoue | l'erreur **remonte** et est journalisée. Un chargeur qui avale son erreur raconte qu'un élève n'a rien saisi alors qu'on a échoué à écrire |
| Plancher de restriction levé | écriture faite, réponse sans chiffre, sans commentaire de progression, sans relance |
| Élève mineur | aucune mesure enregistrée depuis le chat, aucune mention. Un mineur n'a pas de cible nutritionnelle ; il n'a pas non plus de suivi de poids |

## 8. Critères d'acceptation

```gherkin
Étant donné un élève qui écrit « je suis à 78 kg »
Quand le tour se termine
Alors le poids est enregistré là où le point du dimanche le range
Et il apparaît dans la courbe de progression

Étant donné un élève qui écrit « I'm at 172 lbs this morning »
Quand le tour se termine
Alors le poids est enregistré converti en kilogrammes
Et la reconnaissance a réussi en anglais comme en français

Étant donné un élève qui écrit « je veux atteindre 75 kg »
Quand le tour se termine
Alors AUCUNE mesure n'est enregistrée

Étant donné un élève qui écrit « ma fille fait 32 kg »
Quand le tour se termine
Alors AUCUNE mesure n'est enregistrée

Étant donné un élève qui écrit « j'ai perdu 2 kg cette semaine »
Quand l'agent répond
Alors aucune mesure n'est enregistrée
Et l'agent demande le chiffre exact une seule fois

Étant donné un élève dont la perte franchit le seuil de sécurité
Quand ce franchissement vient d'un poids annoncé DANS LE CHAT
Alors restriction_guard lève le plancher exactement comme s'il venait du dimanche

Étant donné un élève sous plancher levé
Quand il écrit son poids
Alors la mesure est enregistrée
Et la réponse ne contient aucun chiffre, aucune progression, aucune relance

Étant donné un élève qui écrit « 42 kg » alors qu'il en fait 82
Quand le tour se termine
Alors la mesure est enregistrée telle quelle
Et si elle franchit le seuil, le plancher se lève — le produit ne se protège
     pas d'une valeur plausible sous prétexte qu'elle est surprenante
```

## 9. Rabbit holes

- **Le lexique des unités.** « kilos », « kg », « kilo », « lbs », « livres »,
  « pounds », « cm », « centimètres », « inches », « tour de taille », « ventre ».
  Fermé, écrit à la main, testé **dans les deux langues** — le dépôt a déjà payé
  une garde testée dans une seule langue (`not` ne couvrait pas `doesn't`).
- **La frontière mesure/cible.** Elle est linguistique et fine : « je suis à 78 »,
  « je fais 78 », « 78 ce matin » sont des mesures ; « objectif 78 », « je veux
  être à 78 », « d'ici juin 78 » sont des cibles. Chaque cas de la frontière
  s'écrit dans le test avant le code.
- **Les deux modèles de stockage.** `biofeedback.weight_kg` (dimanche) et
  `outcomes.weight_7d_avg` (chemin 1:1) coexistent dans la même table, et
  `restriction_guard` ne lit que le second. Écrire dans l'un sans regarder
  l'autre est exactement le bug qui a laissé la carte poids vide.
- **La tentation de commenter.** Un poids enregistré appelle une phrase sur la
  progression. Elle relève de FF-011 (soutien groundé) et de R8 ici — elle est
  interdite sous plancher levé, et sinon elle ne se produit pas dans cette
  fiche.

## 10. Ce qu'on mesure

- Part des mesures totales qui viennent du chat (attendu : significative — les
  gens se pèsent le matin, pas le dimanche soir)
- Nombre de levées de plancher dont le déclencheur est une mesure du chat —
  **s'il reste à zéro alors que le volume monte, le branchement R7 est mort**
- Refus explicites (hors bornes, ambiguïté), par motif

**Contre-mesure.** Le taux de correction (« pardon, 78 pas 87 ») et le taux de
suppression manuelle depuis l'écran. S'ils montent, le plancher mord trop large
et pollue une donnée de sécurité — ce qui est pire que de ne rien écrire.

## 11. Questions ouvertes

- Une mesure déclarée pour **un jour passé** (« lundi j'étais à 79 ») : on la
  range à la date dite, ou on refuse ? Aujourd'hui la revue est hebdomadaire et
  ne sait pas ranger un jour.
- Faut-il **accuser réception** de la mesure ? Le silence est cohérent avec
  « on ne sollicite pas », mais l'accusé fantôme est précisément le défaut qu'on
  corrige. Proposition : accusé minimal, une clause, jamais un commentaire.
