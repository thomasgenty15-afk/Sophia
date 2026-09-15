# MASTER PROMPT — ③ traditions · ⑤ appétit · ④ répertoire · ⑥ retour · ⑦ poids

**2026-08-20** · branche `ff-001-quotidien-du-coach`
**Cadre produit** : `scratchpad/2026-08-20-0200-DESIGN-habitudes-et-signaux.md`
**Lots ① et ②** : `scratchpad/2026-08-20-0230-MASTER-PROMPT-LOTS-1-ET-2.md`

Cinq lots. Ils sont **ordonnés et fermés par des portes** : chacun ne démarre
que si le précédent a rendu son chiffre. ⑦ remplace ⑤ à terme — ce n'est pas une
duplication, c'est une succession.

## ⛔ LA RÈGLE QUI GOUVERNE LES CINQ

> **Le produit ne change pas ce qu'on mange.** Il fait gagner du temps sur la
> planification et la préparation, et rééquilibre à la marge.

Trois conséquences, à tenir dans chaque lot :

1. **On change les quantités AVANT les aliments.**
2. **Une seule substitution à la fois.** Jamais trois.
3. **Un plat nouveau par semaine au maximum.** Jamais un plan entier neuf.

Un plan nutritionnellement meilleur qui ne sera pas cuisiné vaut zéro.

---

## ⛔ CE QUI EXISTE DÉJÀ — NE CONSTRUIS RIEN À CÔTÉ

Trois découvertes faites avant d'écrire ce document. **Chacune évite un doublon.**

### `household_member_habits` — la moitié du répertoire est déjà là
Table par bouche, avec par MOMENT : `household_dish` (elle mange le plat du
foyer) ou `own_usual` (elle mange son truc, décrit en toutes lettres). Elle
atteint **déjà** le prompt (`habitFragment`, `HABIT_CONSEQUENCE`, lus par
`household_portions.ts:1242`).

⛔ **Le lot ④ ÉTEND cette table, il n'en crée pas une seconde.** Deux endroits
qui décrivent « ce que cette personne mange habituellement » divergeront au
premier ajustement.

### `food_preference_promotion.ts` — le patron obligatoire de tout ce qui est APPRIS
Son en-tête pose une règle d'architecture, et elle n'est pas négociable :

> `memory_items` est un **magasin probabiliste** (confiance, ranking, statut
> `candidate`). La promotion passe donc par un écran : l'élève **confirme**, et
> une inférence devient un fait déclaré.

⛔ **Rien d'appris n'atteint le générateur sans être passé par une confirmation
humaine.** Cicatrice citée dans le fichier lui-même : une allergie n'avait
laissé qu'un `memory_item` `candidate`, « le magasin probabiliste que
l'architecture interdit précisément pour ça ». Vaut pour ④ et ⑥.

### `hunger_signal.ts` — la boucle de retour existe, dans UN SEUL SENS
`detectHungerReport`, `countHungerDays`, `satietyPromptBlock`. Fenêtre glissante,
aucun compteur stocké, aucun trait « gros mangeur » écrit sur personne, consigne
de silence pour que le chiffre ne ressorte jamais dans un texte.

**Elle sait qu'on a eu faim. Elle ne sait pas qu'on a laissé la moitié.** Le
lot ⑥ ajoute le sens manquant — dans le MÊME module, avec les MÊMES gardes.

---

# LOT ③ — LES JOURS DE TRADITION  *(le premier, le moins cher)*

## Ce que c'est
« Le dimanche c'est rôti », « vendredi poisson », « samedi soir on commande ».
Deux ou trois cases, au niveau du **foyer**, une seule fois.

## Pourquoi en premier
Casser un de ces jours fait fermer l'app — **pas parce que le plat est mauvais,
parce qu'il est déplacé**. C'est le meilleur rapport valeur/coût des cinq, et
c'est le seul qui protège l'adhésion sans rien calculer.

## Où
- **Écran** : début de l'étape 3, sur la fiche FOYER (décision du propriétaire :
  c'est là que ça se dilue le mieux).
- **Base** : il n'existe **aucune** table de préférences de foyer.
  `households` porte `id, name, created_by, reference_member_id, free_until`.
  ⚠️ `household_envy_submissions` existe mais est **hebdomadaire** — ce n'est pas
  le bon support pour un fait permanent. Crée le support qui manque.

## Ce que ça fait au générateur
Une case de tradition est une **contrainte dure sur une case du plan** : ce jour,
ce moment, ce plat-là. Le modèle ne compose pas cette case, ou la compose
autour.

⚠️ **Ce n'est PAS une préférence à glisser dans le prompt en espérant.** Le dépôt
a mesuré plusieurs fois qu'un champ facultatif décrit dans le prompt est un champ
que le modèle n'écrit pas. Si la case est verrouillée, elle doit être verrouillée
**après** le modèle, de façon déterministe, comme `sizeBoxesFromTarget` le fait
pour les grammes.

## Recette
- Un run réel avec une tradition posée : la case est respectée.
- Un run réel sans : le plan est **identique à l'octet près** à celui d'avant le
  lot.

---

# LOT ⑤ — L'APPÉTIT  *(petit, et destiné à mourir)*

## Ce que c'est
Trois crans sur la fiche de chaque bouche : `petit` · `moyen` · `gros`, qui
corrigent l'**estimation** d'entretien de ±10 %.

## La justification, et elle doit être écrite dans le code
±10 % est la variation inter-individuelle réelle autour d'une équation de
prédiction (Mifflin-St Jeor). Ce n'est pas un curseur de confort : c'est
l'incertitude de la formule, rendue réglable par la personne qui se connaît.

## ⛔ LES TROIS GARDES
- **Bornée et symétrique.** 0,90 / 1,00 / 1,10. Pas d'échelle ouverte.
- **Le plancher TCA reste dessous, intact.** Impossible de s'en servir pour se
  sous-alimenter — vérifie-le par un test, pas par un raisonnement.
- **Elle corrige l'ESTIMATION, jamais les grammes.** Un multiplicateur posé sur
  les grammes se composerait avec l'ancrage; posé sur l'entretien, il traverse
  toute la chaîne existante (bornes comprises) sans rien doubler.

⚠️ **Écris dans le code qu'il est TRANSITOIRE.** Le lot ⑦ le remplace : ce n'est
pas une vérité permanente, c'est une valeur de départ qu'on oublie.

## Où
Fiche de chaque bouche (`MouthFormDialog`), à côté de l'activité du lot ②.
Colonne : même patron que `goal` — `household_members` pour les bouches sans
compte, `student_goals` pour celles qui en ont, résolu par
`keel_household_roster_for` (`case when hm.user_id is null then hm.x else sg.x end`).

## Recette
- Les trois crans donnent trois grammages distincts sur un run réel.
- **Contre-épreuve** : `petit` sur une bouche sous plancher TCA ne descend pas
  d'un gramme.
- Vide ⇒ `moyen` = ×1,00, **un neutre vrai**, et compté comme « pas répondu ».

---

# LOT ④ — LE RÉPERTOIRE  *(la plus grosse valeur, le plus gros chantier)*

## ⛔ LA QUESTION OUVERTE — À TRANCHER AVANT D'ÉCRIRE UNE LIGNE

**Le répertoire se saisit-il à l'inscription, ou se construit-il en observant ?**

- **saisi** — juste tout de suite, coûte de la conversion ;
- **appris** — gratuit, met un mois, et le premier plan reste étranger ;
- **mixte** — trois plats à l'inscription pour amorcer, le reste appris.

Le propriétaire penche pour le mixte **sans l'avoir tranché**. ⛔ **Demande-lui
avant de construire.** Ce lot n'a pas de bonne exécution sans cette réponse.

## Ce que c'est
Les 10-15 plats qu'un foyer sait faire et refait en boucle. Court, et tout le
monde en a un.

⛔ **« Ce qu'il aime » est une MAUVAISE question.** Les gens répondent en idéal
(« j'aime le poisson »), pas en réalité (une fois par mois). On demande ce qui
est **fait**, pas ce qui est aimé.

## La forme de saisie, et elle est mesurée
⚠️ **Ne demande jamais de se RAPPELER 15 plats** — c'est épuisant, les gens en
trouvent quatre et abandonnent. **3 plats saisis, puis 20 courants à cocher.**
La reconnaissance coûte infiniment moins cher que le rappel.

## Ce que ça donne au produit, d'un coup
- de quoi composer **sans rien inventer** — donc sans rejet ;
- les **vraies portions**, observées et non dérivées (ça rend une partie du
  chantier grammage caduque) ;
- la **structure réelle du repas** ;
- un **débit de nouveauté contrôlé** : un plat neuf par semaine.

## Où, et l'avertissement le plus important du document
⛔ **ÉTENDS `household_member_habits`.** Elle porte déjà, par moment, « le plat du
foyer » ou « son truc habituel » en toutes lettres, et elle atteint déjà le
prompt. Un second magasin de « ce que cette personne mange » divergera.

Vérifie d'abord si le pont existant (`food_preference_promotion.ts`) peut porter
un répertoire **avant** d'en créer un second à côté.

---

# LOT ⑥ — LA BOUCLE DE RETOUR  *(elle fait vivre ④ sans le demander)*

## Ce que c'est
Après un plan : **« tu l'as fait ? »** et **« c'était trop / pas assez ? »**.
Aujourd'hui, ni l'une ni l'autre n'existe.

## Pourquoi ça compte plus qu'il n'y paraît
C'est le seul mécanisme qui construit le répertoire **sans rien demander à
l'inscription**, et qui corrige les portions sur du réel plutôt que sur une
formule. C'est aussi ce qui manquait pour Christèle : le produit sait détecter
la faim, pas le trop-plein.

## Où
⛔ **DANS `hunger_signal.ts`, PAS À CÔTÉ.** Le module a des gardes coûteuses et
justes qu'il ne faut pas réinventer :
- fenêtre glissante, **aucun compteur stocké** — « le signal décrit une FENÊTRE,
  pas une personne » ;
- **aucun nombre dans le prompt** : un bloc qui porte N escalade avec N, et une
  personne qui rapporte de la faim chaque semaine ferait grossir son plan
  indéfiniment ;
- **consigne de silence** : « ne mentionne jamais la faim, l'appétit ou cet
  ajustement dans ta sortie ».

Le sens « trop » doit hériter des trois. Symétrique, borné, muet.

## ⛔ La garde propre à ce lot
Un retour « c'était trop » répété **ne doit pas pouvoir faire descendre
indéfiniment**. Le plancher TCA est en dessous, mais il ne suffit pas : une
spirale douce vers le bas est exactement le mode d'échec d'un produit
alimentaire. **Borne l'effet cumulé, et teste la borne.**

---

# LOT ⑦ — LA BOUCLE DE POIDS  *(elle finit par tout remplacer)*

## Ce que c'est
Si quelqu'un est **stable** à 58 kg, alors ce qu'il mange **est** sa
maintenance, par définition. Mifflin rend une *estimation* ; sa stabilité est une
*mesure*. **La mesure gagne toujours.**

La boucle : *si le poids ne bouge pas alors qu'on sert X, alors la maintenance
est X — corrige l'estimation, pas le poids.*

## Les briques existent
- `student_body_measures` — la série de pesées datées (`local_date`, `kind`,
  `value_si`) ;
- `student_weight_divergence_episodes` + `weight_divergence_engine.ts` ;
- `plan_energy.ts` / `mouth_energy.ts` — ce que le plan a réellement servi.

## ⛔ LA LIMITE À DIRE TOUT DE SUITE
`student_body_measures` est clavetée sur **`user_id`**. **Une bouche sans compte
n'a aucune série de pesées** — c'est le cas de Christèle, et c'est le cas nominal
d'un foyer.

Donc ⑦ ne couvre **que les comptes**. Ce n'est pas un défaut à réparer en
passant : soit le foyer gagne un moyen de peser une bouche sans compte, soit ⑤
reste la seule correction pour elles. **Dis-le dans le rapport, ne le contourne
pas en silence.**

## ⛔ Les gardes
- **Ne jamais corriger sur une fenêtre courte.** Le poids d'un jour est du bruit
  (eau, sel, cycle). Le module de divergence porte déjà des seuils : lis-les,
  ne les réinvente pas.
- **Ne corriger que si le plan a été SUIVI.** Corriger la maintenance sur une
  semaine où personne n'a cuisiné le plan mesure autre chose. C'est le lot ⑥ qui
  donne cette information — ⑦ ne démarre donc **pas avant** ⑥.

---

# CE QUI VAUT POUR LES CINQ

## ⛔ TOUT EST OPTIONNEL — et chaque vide a un comportement ÉCRIT

| champ vide | comportement |
|---|---|
| ③ traditions | aucune contrainte, plan identique à aujourd'hui |
| ⑤ appétit | `moyen` ×1,00, un neutre vrai |
| ④ répertoire | le modèle compose librement, comme aujourd'hui |
| ⑥ aucun retour | aucun ajustement, et c'est le cas nominal |
| ⑦ pas de série | l'estimation reste, et ⑤ garde la main |

⚠️ **Chaque repli se COMPTE dans `generated_from`, avec TROIS états** : *répondu*
/ *pas répondu* / *pas posé* (fiche antérieure au lot). Deux nombres pour trois
états, c'est le zéro ambigu que ce chantier paie en boucle.

## Le poste
- `supabase migration up` **uniquement**. ⛔ `db reset`, `db push`,
  `functions deploy`, `secrets`, `config push`, `link` sont bloqués — donne la
  commande à l'utilisateur si tu en as besoin. Lignée : `uniq -d` vide, disque ==
  `supabase_migrations.schema_migrations`.
- **Le runtime edge sert des `_shared` périmés.** Après toute modification :
  `docker restart supabase_edge_runtime_Sophia_2`, attendre ~7 s. Ça a coûté
  trois runs la nuit du 19-20.
- `deno test --allow-all supabase/functions/_shared/keel/` entièrement vert
  (**3 887** au lancement). Front : `npx tsc -b --force tsconfig.app.json`
  (⚠️ `tsconfig.json` ne vérifie rien) puis `npx vitest run` — **`agent-gate` ne
  lance PAS vitest**. **4 rouges antérieurs et étrangers** : ne les compte pas,
  ne les répare pas.
- ⚠️ Aucune variable `SUPABASE_*` exportée : 114 faux rouges mesurés.
- ⛔ Jamais `git stash`, ne commite rien. Les fichiers i18n portent du travail
  non commité d'autres sessions : livre sur le disque, ne `git add` jamais, et
  dis-le.

## ⛔ LA VÉRIFICATION EN SITUATION RÉELLE
Comme pour ① et ②, les tests unitaires ne suffisent pas : ces lots changent ce
qu'un humain voit. Outillage prêt dans
`/private/tmp/claude-502/-Users-ahmedamara-Dev-Sophia-2/d6c9ff1f-ab2c-4b73-98e1-f0c60f4e98a9/scratchpad/` :
`run.sh` (connexion `iku@gmail.com` / `12345678` + génération 3 jours),
`diag.ts`, `bloq.ts`, `appar.ts`. Regénère les dumps si tu touches la base.

Pour chaque lot : **photo AVANT · fiches réellement renseignées · photo APRÈS ·
contre-épreuve fiches vides** (le plan doit être identique à l'octet près).

## Rapport
`scratchpad/`, horodaté. Les photos, les tables de convention avec leur
dérivation, les compteurs de repli, la contre-épreuve, et **ce que tu laisses
ouvert**.

⚠️ **Si un lot te paraît faux en le construisant, arrête-toi et rapporte.** Le
plan de la nuit du 19-20 s'est corrigé quatre fois, à chaque fois parce qu'une
mesure contredisait une intention. C'est le comportement attendu.
