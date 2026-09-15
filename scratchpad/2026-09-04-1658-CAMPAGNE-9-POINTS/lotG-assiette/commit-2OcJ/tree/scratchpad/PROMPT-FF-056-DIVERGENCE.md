# Prompt — Construire FF-056 · La divergence constatée

> À donner tel quel à l'agent responsable du chat. Le prompt complet =
> **LE SOCLE COMMUN** de `scratchpad/PROMPTS-REALIGNEMENT-CHAT.md` (l. 16-143,
> à coller en premier) **+ ce bloc**. Ne donne jamais ce bloc sans le socle.

---

# BLOC · FF-056 — La divergence constatée

**Fiche** : `docs/fonctionnalites/conversation/FF-056-la-divergence-constatee.md`
— lis-la **en entier** avant d'écrire une ligne. Elle est l'autorité ; ce bloc
est son mode d'emploi.

## Le contexte produit — pourquoi cette fonctionnalité existe

Le cas fondateur est réel : quelqu'un suit un plan de perte *devant les
autres*, mange en cachette (tartines à 23 h, crème dans le riz), coche, dit que
ça va — et prend des kilos. Sur ce qu'il mange en cachette il n'existe **aucun
signal**, et il n'en existera jamais. Mais un signal ne ment pas : **la
balance**. Le produit constate que le résultat ne suit pas le plan, puis va
chercher la cause **auprès de la personne** — sans spéculer (la cause peut être
le matin comme le soir, la nourriture comme un traitement ou l'arrêt du sport),
sans accuser, une fois, et il en fait quelque chose de durable.

Trois décisions produit encadrent tout :
1. **On demande honnêtement d'abord** — « Si tu manges ce qui est prévu,
   normalement ça devrait descendre. Qu'est-ce qui se passe ? ». Le sujet de la
   phrase est LE PLAN, jamais la personne. La question est VRAIMENT ouverte.
2. **Le sans-aveu est le repli, pas le premier geste** : si la personne ne
   sait pas ou ne veut pas dire, on propose des changements qu'elle peut
   accepter sans rien confesser.
3. **La preuve que ça marche n'est pas la conversation, c'est le plan
   suivant** (règle T6 du domaine).

## L'état du dépôt — ce qui existe déjà, à vérifier puis réutiliser

Tout ce dont tu as besoin a été construit par les chantiers récents. **Vérifie
chaque pièce avant de t'appuyer dessus** (état réel, pas commentaires) :

- **La série de poids datée** : `body_measure_floor.ts` (livré, câblé — le
  poids annoncé en chat arrive en base) + FF-031 (`suivi-quotidien/`, 🟠 — les
  mesures sont datées à l'instant). C'est l'entrée de ton détecteur.
- **La direction de l'objectif** : `student_goals`.
- **Le budget T4** : `_shared/keel/daily_ask_budget.ts` — « une demande par
  jour, toutes surfaces ». Ta question d'ouverture EST une demande : elle
  réserve sa place par ce module, dans l'ordre que son en-tête contractualise
  (la ligne d'abord, la demande ensuite). Ne crée pas un second compteur.
- **Le canal des directives durables** : `daily_recommendation_engine.ts` /
  `daily_recommendation_io.ts` (FF-028) — espace d'actions pré-calculé,
  confirmation par tap au payload déterministe, écriture relue (vérité
  d'exécution), empreinte du plan qui périme la proposition. Tes actions
  `named_spot` passent par LÀ, pas par un canal à toi.
- **Le patron du sous-flow** : `sophia-brain/skills/safety_crisis/` (skill
  mince + `local_dispatcher.ts` + `reducer.ts` pur + `visible_agent.ts` + état
  de tour en tour) et `disordered_eating_guard/` (l'entrée du flow ne transite
  jamais par le turn frame — le runtime la calcule et la passe par un canal
  dédié). Copie cette forme.
- **Les planchers à ne pas traverser** : `restriction_guard.ts` /
  `restriction_runtime.ts` (TCA), le chemin de crise, le plancher médical
  (`medical_condition_floor.ts`). Ton flow leur REND LA MAIN, il ne les
  réimplémente pas.
- **Le moment à ne pas concurrencer** : FF-054 (le retour de fin de plan,
  `composition-des-repas/`) possède le jour de fin de plan. Toi : ~J+2, jamais
  le même jour. Heures calmes 21 h–8 h (le patron est dans `reengagement.ts`).
- **La borne de conversation** : le précédent est le flow de précision
  (`MEAL_PRECISION_MAX_TURNS = 2`, timeout 30 min). Même discipline : 2-3
  tours max, expiration.

## Ce que tu construis — dans cet ordre

**① Le détecteur pur** — `_shared/keel/weight_divergence.ts` + test.
Entrée : la série datée + la direction de l'objectif. Sortie : un verdict
nommé (`divergence_established` / `noisy` / `insufficient_data` /
`wrong_direction_but_single` …), seuils en **constantes exportées** que les
tests pinnent. Zéro I/O, zéro horloge (le caller passe `now`). Teste sur des
séries synthétiques : bruit (eau/sel/cycle simulés par oscillations), tendance
réelle, données trop espacées, prise de masse (la divergence inverse — aucune
formulation ne présuppose la perte).

**② Le déclencheur** — dans le batch du soir existant (le moteur de
recommandation tourne déjà chaque soir : greffe-toi sur ce passage, ne crée pas
un second cron). Gates DANS L'ORDRE : divergence établie → personne active →
majeur/titulaire → `restriction_flag` baissé → cooldown expiré → fenêtre calme
(pas le jour de FF-054, ~J+2 après fin de plan) → place T4 réservée. Chaque
refus a un motif nommé et journalisé (`skipped_by_reason`, le patron du dépôt).

**③ L'épisode** — une table (migration additive) : état
(`proposed`/`in_flow`/`acted`/`nothing_to_change`/`declined`/`expired`),
catégorie retenue, empreinte du plan, dates. C'est elle qui porte le cooldown
(≥ 1 cycle de plan, 2 après refus). RLS : titulaire seul. Vérifie
`has_table_privilege('anon', …)` et les privilèges par défaut d'`authenticated`.

**④ La skill** — `sophia-brain/skills/weight_divergence/` sur le patron
`safety_crisis` :
- `contract.ts` : les 9 catégories de la fiche (§3, tableau), FERMÉES,
  `other` incluse ;
- `local_dispatcher.ts` : classe la réponse dans ces catégories — le LLM
  choisit DANS l'ensemble, un choix hors ensemble = `other` ;
- `reducer.ts` : PUR — décide le tour suivant (approfondir une fois, agir,
  conclure « rien à changer », sortir) ; 2-3 tours max ; les trappes TCA et
  crise **à chaque tour** (l'entrée arrive par le canal runtime, jamais par le
  turn frame) ;
- `visible_agent.ts` : valide le texte — jamais de chiffre d'énergie, jamais
  « tu es sûr ? », jamais un reproche ; repli déterministe si le modèle échoue
  (un tour de ce flow n'est jamais vide ni accusateur).
- Câblage dans `routers.ts` / `run.ts` : même forme que les skills voisines.

**⑤ Les actions** — par catégorie, via l'existant :
- `named_spot` → une directive durable par le canal FF-028 (proposition + tap
  + relecture). L'espace d'actions est PRÉ-CALCULÉ depuis le plan réel.
- `plan_mismatch` → pointe vers contraintes pratiques / fenêtre de plan.
- `activity_drop` → consigné vers les pratiques (FF-029). JAMAIS de
  prescription d'exercice.
- `medical` → enregistré sans interprétation, orientation médecin si
  manifeste (le plancher médical existe).
- `not_a_divergence` → le flow le DIT et clôt. C'est une bonne fin.
- `unknown` → la fenêtre d'observation : ⑥.
- `declined` → sortie immédiate, cooldown doublé, zéro trace dans les
  réponses suivantes.

**⑥ La fenêtre d'observation** — état borné (ouverture, J+3, fini d'avance,
but énoncé dans le message d'ouverture). Pendant la fenêtre, les déclarations
passent par les planchers EXISTANTS (FF-017, FF-009) — tu ne crées pas un
canal de saisie. À J+3 : recalage du plan avec ce qu'il y a (même vide),
message de clôture d'une phrase, et c'est fini. La question ouverte de la
fiche (§11 : marqueur vs lien explicite à l'épisode) : tranche-la au plus
simple et documente ton choix dans l'en-tête du module.

## Tests en conditions réelles — tes niveaux

- **easy** : objectif perte + 3 mesures qui montent (fixture datée) → la
  question part au bon moment, sur le budget T4, formulée sur le plan ;
  réponse « le matin je grignote » → directive, tap, plan suivant avec un vrai
  petit-déjeuner. 3/3, FR et EN.
- **medium** : chaque catégorie du tableau, une par une, avec sa bonne fin ;
  une seule pesée en hausse → rien ; série bruitée sans tendance → rien ;
  budget T4 déjà pris → la question attend ; prise de masse qui stagne → même
  flow, formulations neutres.
- **hard** : chaque mode de défaillance de la fiche (§7) — dont : la personne
  ignore → expiration silencieuse, AUCUNE relance aux tours suivants ;
  `restriction_flag` levé au déclenchement ET en cours de flow → muet /
  trappe ; plan modifié pendant l'épisode → l'empreinte invalide ; réponse
  détresse → trappe crise.
- **extra-hard** : divergence + faim récurrente (FF-027) le même soir → une
  seule demande part (T4) et les deux signaux ne produisent pas deux
  propositions contradictoires ; épisode en cours + repas déclaré + poids
  annoncé dans le même message → les planchers écrivent ET le flow garde son
  fil ; fenêtre d'observation ouverte + question d'approfondissement FF-017 →
  le budget tient ; « je ne sais pas » puis silence total pendant la fenêtre →
  clôture propre à J+3 ; l'utilisateur répond en anglais à une question
  française.

## Revue adversariale — tes angles imposés (trouves-en d'autres)

- **Le framing « il ment ».** Cherche-le partout, y compris dans TES prompts
  internes : ce qui entre dans un prompt finit par sortir. « Pourtant tes
  coches disent… » est interdit même en pensée.
- **Le flow qui trouve toujours un problème.** Force `not_a_divergence` et
  vérifie que la conclusion est bien « rien à changer », sans « mais garde un
  œil dessus » qui ré-ouvre l'anxiété.
- **La question qui se re-pose.** Après expiration, après refus, après action :
  rejoue 5 tours ordinaires et cherche toute mention résiduelle de l'épisode.
- **Le chiffre qui revient.** kcal en toutes lettres, FR et EN (« environ
  trois cents calories ») — le filtre de FF-018 a déjà été percé comme ça.
- **La fuite au foyer.** Un membre du foyer (bouche réclamée) pose une
  question dans son propre chat → rien de l'épisode du titulaire ne doit être
  dans son contexte (preuve par `context_elements`).
- **La confabulation de cause.** Si la personne dit « je sais pas », vérifie
  que Sophia ne DEVINE pas (« c'est sûrement le soir ») — c'est le défaut
  exact que cette fonctionnalité existe pour éviter.
- **Le RED majeur de la fiche (§10)** : après un épisode, la personne
  continue-t-elle à se peser ? Tu ne peux pas le mesurer en local — mais tu
  peux vérifier que RIEN dans les textes ne lie la pesée à la question
  (« puisque tu t'es pesé… » est interdit : c'est ce qui apprend à ne plus se
  peser).

## Ton rapport

`scratchpad/RAPPORT-FF-056.md`, structure du socle. En plus : la liste des
seuils choisis pour le détecteur (avec le raisonnement), le choix fait sur la
question ouverte §11 de la fiche, et — si tu as touché au moindre arbitrage
produit — la proposition d'amendement de la fiche SANS l'appliquer.

## Les interdits absolus de ce chantier

Muet sous `restriction_flag`, par construction. Jamais mineurs, jamais bouches
sans compte. Jamais de détection de mensonge ni de « tu es sûr ? ». Jamais un
chiffre d'énergie. Jamais de remontée au foyer ni au coach en B2C. Jamais de
prescription d'exercice ni d'interprétation médicale. Le refus sort
immédiatement et durablement. **Si un de ces interdits te semble bloquer une
bonne idée, consigne l'idée et n'y touche pas — l'humain tranche.**
