# Revue nutritionnelle — 2026-08-11

Harnais : `scratchpad/qa_nutrition_review_20260811.ts`
Modèle : `gpt-5.6-sol` · référentiel `food_composition_refs` (208 aliments)

**Méthode.** Trois gabarits, même objectif, même doctrine, même consigne —
**seul le corps change**. Pour chaque plan généré, on ne juge pas à l'œil : on
**calcule** l'énergie et les protéines réelles de chaque journée en résolvant
chaque ingrédient contre le référentiel, puis on compare à l'enveloppe que le
moteur a lui-même calculée.

---

## 1. Le résultat

| Gabarit | Cible (enveloppe) | Servi (calculé) | Écart |
|---|---|---|---|
| Femme 55 kg · 162 cm · `fat_loss` | 1 460 kcal/j · ≥ 110 g P | **478 kcal/j · ~40 g P** | −67 % |
| Homme 92 kg · 186 cm · `fat_loss` | 2 390 kcal/j · ≥ 184 g P | **707 kcal/j · ~50 g P** | −70 % |
| Homme 92 kg · 186 cm · `muscle_gain` | 3 068 kcal/j · ≥ 147 g P | **838 kcal/j · ~55 g P** | −73 % |

> **Les plans servent environ un tiers de ce que l'enveloppe demande, sur les
> trois gabarits.** Le plancher protéique est manqué d'un facteur 3 à 4.

### Ce que le calcul n'a pas pu compter — et pourquoi ça ne sauve pas le constat

- **Non résolus** (absents du référentiel) : `wholegrain crispbreads`,
  `wholemeal pita`, `wholegrain tortilla`, `slaw mix`, `red bell pepper` —
  8 occurrences sur 27 plats.
- **Sans poids** (quantité non convertible) : `black pepper`, `lemon`,
  `parsley`, `lime` — énergie négligeable.

Même en recréditant généreusement les pains et tortillas manquants
(~150 kcal/jour), l'écart reste de **1 500 à 2 200 kcal/jour**. Le constat
tient.

### Les portions suivent le gabarit — un peu

Rapport 92 kg / 55 kg réellement servi : **×1,48** pour un attendu de ×1,64.
La direction est bonne, l'amplitude est correcte. **Le corps n'est pas
décoratif** — il module. Mais il module autour d'un niveau global beaucoup trop
bas.

---

## 2. La cause, et elle est structurelle

**L'enveloppe n'entre jamais dans la consigne.** C'est le contrat du produit :
*« les nombres vivent dans la boucle, le prompt ne reçoit que des mots »*. Le
modèle reçoit taille, poids, âge et sexe avec l'instruction *« ceci sert à UNE
chose : la TAILLE d'une portion »* — mais **aucune calibration**. Il ignore
qu'un homme de 92 kg vise 2 390 kcal, et compose donc des repas d'allure
raisonnable, systématiquement légers.

C'est un choix de design assumé, pas un bug. Sa conséquence est que **le seul
mécanisme capable de corriger les portions est la boucle de correction.**

---

## 3. La bonne nouvelle : la détection marche

Mesuré de bout en bout, avec le vrai référentiel :

```
ENVELOPPE : 2354–2426 kcal · protéines ≥ 184 g
VERDICT   : energy = "below"   (résolution 14/15 = 93 %)
CORRECTION: tokens = [raise_energy, place_missing_sentinel]
INSTRUCTION:
  Compose this again, keeping everything else — the same days, the same
  rhythm, the same method. Change only this:
  - make portions more generous, especially starch and added fats
  - include an oily fish once this week
```

Tout l'étage fonctionne : le référentiel résout, le verdict tranche, le jeton
est choisi, l'instruction est produite — **et elle ne porte aucun chiffre**,
conformément au contrat.

---

## 4. Le problème qui reste

**Un seul retry ne peut pas combler un écart de 65-70 %.**

« Make portions more generous » est une instruction qualitative. Elle
déplacera les portions de 20 %, peut-être 40 %. Elle n'a aucune chance de
tripler un plan — et la boucle est explicitement limitée à **une** relance
(design §2.5, « UNE relance »).

Trois pistes, par ordre de coût croissant :

1. **Mesurer d'abord le rendement d'un retry.** Combien de kcal le jeton
   `raise_energy` récupère-t-il réellement ? Si c'est +30 %, on passe de 700 à
   910 kcal — toujours à un tiers de la cible. C'est la mesure qui décide de
   tout le reste, et elle est cheap.
2. **Autoriser plusieurs relances tant que le verdict s'améliore**, avec un
   plafond dur. Le design interdit la relance infinie à raison ; il n'interdit
   pas deux ou trois passes bornées et mesurées.
3. **Donner au modèle une ancre de portion sans chiffre sur la personne.**
   La frontière du produit est « des chiffres sur l'ALIMENT, jamais sur la
   PERSONNE ». Or « pour cette personne, une portion de féculent pèse
   ~120 g cru » est un chiffre **sur l'aliment**. C'est la piste la plus
   prometteuse et elle ne viole pas le contrat — elle demande d'écrire une
   table de portions par gabarit, dérivée de l'enveloppe.

Ma recommandation : **1 d'abord** (une commande), puis **3** si le rendement
d'un retry est aussi faible que je le pense.

---

## 5. Le point sur les sentinelles

Le verdict remonte `missing: [fatty_fish, shellfish, white_fish]` sur un plan
d'un seul jour — ce qui est normal pour une fenêtre d'un jour, mais mérite
d'être vérifié sur 7 jours : une sentinelle « manquante » sur un jour n'a pas
de sens, la cadence est hebdomadaire.

---

## 6. Ce qui a été mesuré et va bien

- **Le corps module réellement** les portions (×1,48 entre 55 et 92 kg)
- **La direction de l'objectif est respectée** : `muscle_gain` sert plus que
  `fat_loss` à corps identique (838 vs 707)
- **Aucun chiffre d'énergie ne fuit vers la personne** dans aucune consigne
- **La résolution du référentiel est bonne** : 79 à 100 % selon les plans
- **Le plancher TCA tient** : sous `restriction_flag`, aucune mesure ne fuit
