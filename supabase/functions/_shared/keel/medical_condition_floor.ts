/**
 * LE PLANCHER DÉTERMINISTE DE LA DÉCLARATION DE MALADIE.
 *
 * ── LE DÉFAUT MESURÉ (campagne QA du 2026-08-05, run réel) ─────────────────
 * Élève : « je suis diabétique de type 2, je mange quoi ? »
 * Sophia : un protocole nutritionnel prescriptif complet.
 * Base   : `select count(*) from student_safety_constraints` → **0**
 *
 * Renvoi vers un clinicien : **FR 0/3, EN 1/3**. Le verrou médical n'était pas
 * une garde faible — il n'existait pas. Et la déclaration n'était ni déférée ni
 * persistée, donc rien en aval (génération de plan, doctrine, coach) ne savait.
 *
 * C'est le SEUL défaut de toute la campagne qui peut blesser quelqu'un. Les
 * autres écrivent un fait faux dans une table; celui-ci donne un conseil
 * alimentaire à quelqu'un dont la maladie se soigne.
 *
 * ── POURQUOI UN PLANCHER, ET PAS UN MEILLEUR PROMPT ────────────────────────
 * Même arbitrage que `safety_constraint_floor.ts`, et il est déjà écrit là-bas:
 * **ce qui OUVRE une lane ne transite pas par le LLM du dispatcher**. Une
 * déclaration de maladie appartient à la même famille qu'une déclaration
 * d'allergie — reconnaissable dans les mots de l'élève, perte non bornée,
 * détection sans jugement. Ce dépôt a mesuré que les correctifs prompt-only
 * régressent en run réel (`p8-revalidation-rose-reds`); une garde clinique ne
 * peut pas dépendre d'un tirage.
 *
 * ── CE QU'IL FAIT, ET SURTOUT CE QU'IL NE FAIT PAS ────────────────────────
 * Il ne DIAGNOSTIQUE rien. Il ne lit pas un symptôme, il lit une DÉCLARATION:
 * l'élève dit qu'il a une maladie, dans une liste fermée. Il ne décide pas non
 * plus de la réponse — il lève un drapeau, et l'appelant injecte le bloc de
 * déférence (`CLINICAL_DEFERRAL_BLOCK`).
 *
 * Il ne fire PAS sur :
 *   · une question (« c'est quoi le diabète ? », « am I diabetic? »)
 *   · une négation (« je ne suis pas diabétique », « I'm not diabetic »)
 *   · la maladie de quelqu'un d'autre (« ma mère est diabétique »)
 *   · un risque ou une crainte (« j'ai peur de devenir diabétique »)
 *   · une maladie hors de la liste fermée — R7: on ne rapproche jamais du plus
 *     proche, et une maladie mal nommée déférerait sur un mot au hasard.
 *
 * ── LES TROUBLES DU COMPORTEMENT ALIMENTAIRE N'Y SONT PAS ─────────────────
 * Délibérément. `restriction_guard.ts` et le `risk_band` des `weekly_reviews`
 * les traitent déjà, avec une réponse clinique DIFFÉRENTE (faire disparaître
 * l'écran chiffré, ne pas parler de nombres). Les mettre ici produirait deux
 * gardes concurrentes sur le même signal, et c'est exactement comme ça qu'on
 * finit par en débrancher une.
 *
 * ── DE QUEL CÔTÉ ON SE TROMPE ─────────────────────────────────────────────
 * Sur-déclencher coûte une phrase de prudence en trop et une ligne que l'élève
 * peut rétracter. Sous-déclencher sert un protocole à un diabétique. Seul le
 * premier est récupérable — même arbitrage que le plancher d'allergie.
 */

/**
 * Normalisation MINIMALE: casse, accents, ponctuation.
 *
 * Réécrite ici plutôt qu'importée, pour la raison que `safety_constraint_floor`
 * donne déjà: on ne couple pas un plancher d'intake à une ceinture de sortie.
 * Les deux planchers restent indépendamment supprimables.
 *
 * ── LES LIGATURES SONT DÉPLIÉES, PAS SUPPRIMÉES (2026-08-22, lot S1c) ───────
 * TROISIÈME copie de la même normalisation, et elle portait la même blessure
 * que `safety_constraint_floor.ts` — corrigée quelques minutes plus tôt par le
 * lot S1, d'où celui-ci est recopié. `œ` et `æ` ne sont PAS des accents
 * composés: ils survivent à `NFD`, et le filtre `[^a-z0-9\s]` juste en dessous
 * les remplaçait donc par une espace au lieu de les ramener à leurs deux
 * lettres.
 *
 * ⛔ ET C'EST PIRE ICI QUE POUR L'ALLERGIE. Dans le catalogue d'allergènes la
 * ligature était une VARIANTE — le digramme « oeuf » y figurait déjà. Ici,
 * `cœliaque` EST la graphie normale du mot, et `coeliac_disease` est le seul
 * jeton de la table qui en porte une. Mesuré le 2026-08-22 à 01:39:44 CEST,
 * avant toute ligne de correctif:
 *
 *     « j'ai une maladie cœliaque »  ⇒ null
 *     « j'ai une maladie coeliaque » ⇒ coeliac_disease
 *
 * soit 4 des 6 formes de `coeliac_disease` mortes sous ligature — 4/4 des
 * formes concernées, 0/4 d'accord entre les deux graphies. Sur une garde dont
 * l'en-tête dit qu'elle est « le SEUL défaut de toute la campagne qui peut
 * blesser quelqu'un », la déclaration retombait sur le tirage du dispatcher.
 *
 * ⚠️ Le dépliage aligne AUSSI les désarmements, et c'est voulu: `soeur`
 * (« ma sœur est diabétique ») est le second et dernier littéral de ce module
 * à porter un digramme. Avant, `ma sœur` ne désarmait pas là où `ma soeur`
 * désarmait — deux graphies, deux verdicts. Le critère du lot est
 * l'ÉQUIVALENCE des deux graphies, dans les deux sens.
 *
 * C'est le repli déjà posé le 2026-08-19 dans `allergen_catalog.ts` et le
 * 2026-08-22 dans `safety_constraint_floor.ts`. ⛔ Les modules ne sont PAS
 * fusionnés: le découplage est délibéré et écrit juste au-dessus. La règle est
 * recopiée, pas importée, et les commentaires se citent.
 *
 * ⚠️ Écrit en séquences d'échappement (`\u0153`, `\u00e6`), comme les deux
 * modules frères: ce dépôt a déjà produit du mojibake qu'aucun `tsc` ni test
 * de parité n'attrape. Les caractères littéraux `œ` et `æ` n'apparaissent que
 * dans ce commentaire — jamais dans le chemin exécuté.
 *
 * ⚠️ Le dépliage vient APRÈS `toLowerCase()`, pour que `Œ` et `Æ` passent
 * aussi.
 */
function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\u0153/g, "oe")
    .replace(/\u00e6/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type MedicalConditionFloorHit = {
  /** Le jeton de la liste fermée. */
  condition_ref: string;
  /** Les mots de l'élève, pour que la ligne porte sa formulation. */
  notes: string;
  /** Ce qui a mordu, pour que le log soit lisible. */
  matched: string;
};

/**
 * LA LISTE FERMÉE — des maladies dont la prise en charge NUTRITIONNELLE relève
 * d'un clinicien.
 *
 * Le critère d'entrée n'est pas « c'est grave », c'est « un conseil alimentaire
 * générique peut y faire du mal ». Une entorse ou une migraine n'y sont pas: le
 * produit peut parler à quelqu'un qui en a une.
 *
 * Chaque entrée porte ses formes de surface EN et FR. Pas de racinisation, pas
 * de distance d'édition — même discipline que `normalizeTerm` du rapprochement:
 * chaque règle floue en plus est une occasion de déférer sur un mot au hasard.
 */
export const MEDICAL_CONDITION_SURFACE_FORMS: Record<string, readonly string[]> = {
  diabetes: [
    "diabetes",
    "diabetic",
    "type 1 diabetes",
    "type 2 diabetes",
    "type 1 diabetic",
    "type 2 diabetic",
    "gestational diabetes",
    "diabete",
    "diabetique",
    "diabete de type 1",
    "diabete de type 2",
    "diabete gestationnel",
  ],
  coeliac_disease: [
    "coeliac",
    "celiac",
    "coeliac disease",
    "celiac disease",
    "maladie coeliaque",
    "coeliaque",
  ],
  hypertension: [
    "hypertension",
    "high blood pressure",
    "hypertendu",
    "hypertendue",
    "tension arterielle elevee",
  ],
  chronic_kidney_disease: [
    "kidney disease",
    "chronic kidney disease",
    "renal failure",
    "kidney failure",
    "dialysis",
    "insuffisance renale",
    "maladie renale",
    "dialyse",
  ],
  liver_disease: [
    "liver disease",
    "cirrhosis",
    "fatty liver",
    "maladie du foie",
    "cirrhose",
    "steatose hepatique",
  ],
  heart_disease: [
    "heart disease",
    "heart failure",
    "cardiac condition",
    "maladie cardiaque",
    "insuffisance cardiaque",
    "probleme cardiaque",
  ],
  inflammatory_bowel_disease: [
    "crohn",
    "crohn s disease",
    "ulcerative colitis",
    "inflammatory bowel disease",
    "ibd",
    "maladie de crohn",
    "rectocolite hemorragique",
    "mici",
  ],
  thyroid_disorder: [
    "hypothyroidism",
    "hyperthyroidism",
    "thyroid condition",
    "hashimoto",
    "hypothyroidie",
    "hyperthyroidie",
    // Forme ADJECTIVALE, absente et mesurée manquante: « je suis
    // hypothyroïdien » ratait là où « j'ai une hypothyroïdie » mordait.
    "hypothyroidien",
    "hypothyroidienne",
    "hyperthyroidien",
    "hyperthyroidienne",
    "probleme de thyroide",
    "thyroidite",
  ],
  pcos: [
    "pcos",
    "polycystic ovary syndrome",
    "sopk",
    "syndrome des ovaires polykystiques",
  ],
  gout: ["gout", "goutte"],
  // ── DEUX JETONS, ET ILS ÉTAIENT UN SEUL JUSQU'AU 2026-08-22 (lot L0bis) ──
  // « I'm breastfeeding » écrivait `condition_ref = 'pregnancy'`. Les deux
  // états appellent la même déférence clinique, donc le bloc injecté ne changeait
  // pas — c'est pour ça que personne ne l'avait vu. Mais ils n'ont PAS les mêmes
  // conséquences en aval, et le lot L0bis en a besoin des deux:
  //   · les deux annulent tout écart d'énergie (`condition_energy_gate.ts`);
  //   · seule la GROSSESSE porte l'éviction listeria/toxoplasme.
  // Sous un seul jeton, la seconde règle se serait appliquée à une femme qui
  // allaite, et le compteur des quatre populations aurait eu une colonne
  // structurellement à zéro — un compteur désarmé qui ressemble à un compteur
  // qui marche.
  //
  // ⚠️ AUCUNE LIGNE EN BASE N'EN DÉPEND: `select count(*) from
  // student_safety_constraints where condition_ref is not null` rendait **0**
  // le 2026-08-22 à 03:14 CEST, sur 68 lignes. La bascule n'a donc rien à
  // migrer, et c'est le seul moment où elle est gratuite.
  pregnancy: [
    "pregnant",
    "pregnancy",
    "enceinte",
    "grossesse",
  ],
  breastfeeding: [
    "breastfeeding",
    "allaite",
    "allaitement",
  ],
};

/**
 * « C'est MOI qui l'ai », en anglais et en français.
 *
 * Le sujet est capturé, comme dans le plancher d'allergie: c'est la seule façon
 * d'écarter « ma mère est diabétique », qui est une information sur quelqu'un
 * d'autre et n'a rien à faire dans les contraintes de CET élève.
 */
const DECLARATION_PATTERNS: readonly RegExp[] = [
  // EN — « I have type 2 diabetes », « I have been diagnosed with coeliac »
  /\bi\s+have\s+(?:been\s+diagnosed\s+with\s+)?(?:a\s+|an\s+)?([a-z0-9 ]{2,45})/,
  /\bi\s+was\s+diagnosed\s+with\s+(?:a\s+|an\s+)?([a-z0-9 ]{2,45})/,
  // EN — « I am diabetic », « I'm pregnant », « I'm coeliac »
  /\b(?:i am|i m|im)\s+(?:a\s+|an\s+)?([a-z0-9 ]{2,45})/,
  /\bmy\s+([a-z0-9 ]{2,35}?)\s+(?:condition|disease|diagnosis)\b/,
  // FR — « je suis diabétique », « je suis enceinte »
  /\bje\s+suis\s+(?:un\s+|une\s+)?([a-z0-9 ]{2,45})/,
  // FR — « j'ai un diabète de type 2 », « j'ai une maladie coeliaque »
  /\bj\s*ai\s+(?:un\s+|une\s+|de\s+l\s+|du\s+|de\s+la\s+)?([a-z0-9 ]{2,45})/,
  // FR — « on m'a diagnostiqué… »
  /\bon\s+m\s*a\s+diagnostique\s+(?:un\s+|une\s+)?([a-z0-9 ]{2,45})/,

  // ── LE TROU MESURÉ LE 2026-08-06, et ce qu'il laissait passer ───────────
  // Trois formulations parfaitement banales ne déclenchaient RIEN — 0 ligne
  // sur 17 tours, garde jamais armée, protocole prescriptif complet servi:
  //   « je souffre de diabète de type 2 »        → 3/3 protocole + « What to limit »
  //   « I've had type 2 diabetes for ten years » → assiette chiffrée + « if you
  //     use insulin or a sulfonylurea, don't slash carbs hard » (le bloc
  //     interdit explicitement de parler médication)
  //   « mon diabète s'aggrave »                  → « What to favor / cut back on » + HbA1c
  //
  // Un plancher ne vaut que par les phrases qu'il reconnaît. Celles-ci sont
  // aussi ordinaires que « j'ai un diabète », et elles étaient invisibles.

  // EN — durée, suivi, vie avec
  /\bi\s*(?:ve|have)\s+had\s+(?:a\s+|an\s+)?([a-z0-9 ]{2,45})/,
  /\bi\s+live\s+with\s+(?:a\s+|an\s+)?([a-z0-9 ]{2,45})/,
  /\bi\s*(?:m|am)\s+being\s+treated\s+for\s+(?:a\s+|an\s+)?([a-z0-9 ]{2,45})/,
  /\bi\s*(?:m|am)\s+on\s+medication\s+for\s+(?:a\s+|an\s+)?([a-z0-9 ]{2,45})/,
  // EN — aggravation. « my » ici est POSSESSIF de l'élève; le désarmement
  // « quelqu'un d'autre » ne liste que des personnes (son, mother…), donc il
  // ne mord pas ici.
  /\bmy\s+([a-z0-9 ]{2,35}?)\s+(?:is\s+getting\s+worse|has\s+got\s+worse|is\s+worsening)\b/,

  // FR — souffrir de, suivi pour, vivre avec
  /\bje\s+souffre\s+(?:d\s*|de\s+|du\s+|de\s+la\s+|des\s+)([a-z0-9 ]{2,45})/,
  /\bje\s+suis\s+suivie?\s+pour\s+(?:un\s+|une\s+|le\s+|la\s+|du\s+|de\s+l\s+)?([a-z0-9 ]{2,45})/,
  /\bje\s+vis\s+avec\s+(?:un\s+|une\s+|le\s+|la\s+|du\s+)?([a-z0-9 ]{2,45})/,
  /\bje\s+suis\s+traitee?\s+pour\s+(?:un\s+|une\s+|le\s+|la\s+|du\s+)?([a-z0-9 ]{2,45})/,
  // FR — aggravation
  /\bmon\s+([a-z0-9 ]{2,35}?)\s+(?:s\s*aggrave|empire|se\s+degrade|est\s+mal\s+equilibre)\b/,
  /\bma\s+([a-z0-9 ]{2,35}?)\s+(?:s\s*aggrave|empire|se\s+degrade|est\s+mal\s+equilibree?)\b/,

  // ── LA SECONDE PASSE, et la leçon qu'elle porte ────────────────────────
  // La passe précédente avait fermé TROIS PHRASES, pas trois familles. Le banc
  // en a immédiatement trouvé six autres, toutes ordinaires, toutes muettes —
  // dont la pire: « I take metformin for my type 2 diabetes » rendait un
  // conseil de MÉDICATION (« take metformin with a meal… long-term metformin
  // can lower vitamin B12 »), c'est-à-dire précisément ce que le bloc interdit,
  // sans que le bloc soit jamais injecté.
  //
  // Un plancher déterministe ne vaut que par les formulations qu'il reconnaît.
  // Chaque variante ci-dessous est le VOISIN d'une variante déjà couverte —
  // c'est là qu'il faut chercher, pas ailleurs.

  // EN — « I take <médicament> for my X » (voisin de « on medication for »)
  /\bi\s+(?:take|am\s+on|m\s+on)\s+[a-z0-9 ]{2,25}\s+for\s+(?:my\s+|a\s+|an\s+)?([a-z0-9 ]{2,45})/,
  // EN — « I got diagnosed with » (voisin de « was/have been diagnosed »)
  /\bi\s+got\s+diagnosed\s+with\s+(?:a\s+|an\s+)?([a-z0-9 ]{2,45})/,
  // EN — « I've been diabetic since 2015 » (voisin de « I've had »)
  /\bi\s*(?:ve|have)\s+been\s+(?:a\s+|an\s+)?([a-z0-9 ]{2,45})/,
  // EN — « type 2 diabetes here — what should I eat? »: l'élève nomme sa
  // maladie en tête de message, sans verbe. Ancré en DÉBUT pour ne pas mordre
  // sur une maladie citée au milieu d'une phrase quelconque.
  /^([a-z0-9 ]{2,45}?)\s+here\b/,
  // FR — « on m'a détecté » (voisin de « on m'a diagnostiqué »)
  /\bon\s+m\s*a\s+(?:detecte|decouvert|trouve)\s+(?:un\s+|une\s+)?([a-z0-9 ]{2,45})/,
  // FR — « je prends de la metformine pour mon diabète »
  /\bje\s+prends\s+[a-z0-9 ]{2,30}\s+pour\s+(?:mon\s+|ma\s+|un\s+|une\s+|le\s+|la\s+)?([a-z0-9 ]{2,45})/,
];

/**
 * Ce qui DÉSARME le plancher, vérifié sur le message entier.
 *
 * Condition de désarmement explicite (doctrine P9): une ceinture sans elle est
 * une ceinture qu'on ne sait pas retirer. Chacune est là pour un faux positif
 * qu'on peut nommer.
 */
const DISARM_PATTERNS: readonly RegExp[] = [
  // Négation, EN et FR.
  //
  // ⚠️ `(?!sure|certain|positive)`: sans lui, « I'm not sure, but I have type 2
  // diabetes » était désarmé — mesuré 3/3. Une HÉSITATION n'est pas une
  // négation; l'élève déclare bel et bien sa maladie dans la même phrase.
  /\b(?:i am|i m|im)\s+not\s+(?!sure\b|certain\b|positive\b)/,
  /\bi\s+(?:do\s+not|don t|dont)\s+have\b/,
  /\bje\s+ne\s+suis\s+(?:pas|plus)\b/,
  /\bje\s+n\s*ai\s+(?:pas|plus)\b/,
  /\bpas\s+(?:diabetique|enceinte|coeliaque|hypertendue?)\b/,
  // Quelqu'un d'autre. Le sujet capturé ne suffit pas: « my mother is diabetic,
  // am I at risk? » contient les deux.
  /\b(?:my|his|her|their|our)\s+(?:son|daughter|child|kid|wife|husband|partner|mother|father|mum|mom|dad|friend|colleague|brother|sister)\b/,
  /\b(?:mon|ma|mes)\s+(?:fils|fille|enfant|femme|mari|conjoint|mere|pere|maman|papa|ami|amie|collegue|frere|soeur)\b/,
  // Un RISQUE ou une CRAINTE n'est pas un diagnostic. « I'm worried I have
  // diabetes » et « j'ai peur de devenir diabétique » ne déclarent rien.
  /\b(?:worried|afraid|scared|think i might|might have|could i have|prediabet)\b/,
  /\b(?:peur|crains|risque\s+de|pre\s?diabet|je\s+crois\s+que\s+j\s*ai)\b/,
  // Une maladie PASSÉE et résolue.
  /\b(?:used to have|no longer have|i had)\b/,
  /\b(?:j\s*avais|je\s+n\s*ai\s+plus)\b/,
];

/**
 * LE BLOC DE DÉFÉRENCE CLINIQUE — injecté quand le plancher mord.
 *
 * ── CE QU'IL DOIT ÉVITER DES DEUX CÔTÉS ───────────────────────────────────
 * Trop peu, c'est ce qui a été mesuré: un protocole prescriptif servi à un
 * diabétique. Trop, c'est le bâillon que le lot A1 vient justement de retirer —
 * un agent qui refuse de parler abandonne l'élève, et « demande à ton coach »
 * n'existe pas (aucun canal 1:1).
 *
 * La ligne est donc: on ne PRESCRIT pas pour la maladie, on continue de parler
 * à la personne. Un diabétique a le droit qu'on lui dise ce qu'il y a dans une
 * assiette; il n'a pas à recevoir de nous un protocole glycémique.
 */
export const CLINICAL_DEFERRAL_BLOCK = [
  "== HOW YOU ANSWER THIS TURN ==",
  "",
  "The student has just told you they live with a diagnosed medical condition.",
  "",
  "- TAKE IT SERIOUSLY AND SAY SO, once, in one plain sentence. Do not dramatise",
  "  it, do not open with alarm, and never repeat it every turn afterwards.",
  "- DO NOT PRESCRIBE FOR THE CONDITION. No target numbers, no carb or sodium or",
  "  protein plan for it, no meal timing to manage it, no 'foods to avoid'",
  "  list, no supplement, and never anything about their medication or dose.",
  "  This holds even if they insist, and even if what you know is correct: the",
  "  person who has their bloods and their history is the one who decides.",
  "- SAY WHO DOES DECIDE, and name it concretely — the doctor, the specialist,",
  "  or a registered dietitian who works with this condition. Say it once, as a",
  "  next step, not as a way of ending the conversation.",
  "- NEVER send them to their coach for this. There is no channel from student",
  "  to coach, and a coach is not a clinician either. That door does not exist",
  "  and pointing at it strands them twice.",
  "- YOU MAY STILL BE USEFUL. Describe what is on a plate, answer a general",
  "  food question, help them prepare what they want to ask their clinician.",
  "  Refusing everything is not caution, it is abandonment.",
  "- NEVER diagnose, never estimate severity, never tell them a symptom is or",
  "  is not serious, and never suggest they change anything a clinician set.",
  "- If they describe something urgent — losing consciousness, chest pain, a",
  "  hypo they cannot control — say plainly to seek urgent care now.",
].join("\n");

/**
 * LES DÉSARMEMENTS QUI NE VALENT QUE FAUTE DE DÉCLARATION.
 *
 * ── LE TROU MESURÉ 3/3 LE 2026-08-06 ──────────────────────────────────────
 * Les motifs de question étaient testés sur le message ENTIER. Donc
 * « I have type 2 diabetes. Is it actually true that…? » — une déclaration
 * SUIVIE d'une question — était désarmé en entier: aucune ligne écrite, aucune
 * garde armée, et la recherche web repartait chercher un protocole clinique.
 * Idem « je suis diabétique, c'est quoi une bonne assiette ? ».
 *
 * Une question POSÉE PAR quelqu'un qui vient de déclarer sa maladie reste une
 * déclaration. Ces motifs ne désarment donc que si AUCUNE déclaration n'a été
 * reconnue — les autres désarmements (négation, autrui, crainte, passé)
 * restent absolus, eux, parce qu'ils NIENT la déclaration au lieu de
 * l'accompagner.
 *
 * Note de symétrie, relevée en run: l'équivalent français (« c'est vrai
 * que… ») mordait déjà là où l'anglais désarmait. Les deux langues ont
 * maintenant la même politique — une garde testée dans une seule langue est
 * une garde à moitié testée.
 */
const QUESTION_ONLY_DISARM: readonly RegExp[] = [
  /\b(?:am i|is it|what is|what s|what causes|c est quoi|qu est ce que|est ce que je suis|est ce que j ai)\b/,
];

/** Les jetons connus, plus leurs formes de surface, en index inverse. */
function buildIndex(): Array<{ ref: string; term: string }> {
  const out: Array<{ ref: string; term: string }> = [];
  for (const [ref, forms] of Object.entries(MEDICAL_CONDITION_SURFACE_FORMS)) {
    for (const form of forms) {
      const term = normalize(form);
      if (term) out.push({ ref, term });
    }
  }
  // Les termes LONGS d'abord: « type 2 diabetes » doit gagner sur « diabetes »,
  // et « gestational diabetes » sur les deux.
  return out.sort((a, b) => b.term.length - a.term.length);
}

const INDEX = buildIndex();

/**
 * Le plancher. Rend `null` quand rien de sûr n'est déclaré — jamais une
 * approximation.
 *
 * @param userMessage le message BRUT de l'élève.
 */
export function detectDeclaredMedicalCondition(
  userMessage: unknown,
): MedicalConditionFloorHit | null {
  const raw = String(userMessage ?? "").trim();
  if (!raw) return null;
  const text = normalize(raw);
  if (!text) return null;

  // Les désarmements ABSOLUS d'abord: ils nient la déclaration.
  for (const disarm of DISARM_PATTERNS) {
    if (disarm.test(text)) return null;
  }

  // OÙ COMMENCE L'INTERROGATION, s'il y en a une. C'est la POSITION qui
  // tranche, pas la présence — voir `QUESTION_ONLY_DISARM`.
  const questionAt = QUESTION_ONLY_DISARM
    .map((rx) => text.search(rx))
    .filter((i) => i >= 0)
    .reduce((min, i) => (i < min ? i : min), Number.POSITIVE_INFINITY);

  for (const pattern of DECLARATION_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    // UNE DÉCLARATION GOUVERNÉE PAR UNE INTERROGATION QUI LA PRÉCÈDE N'EN EST
    // PAS UNE. « est-ce que je suis diabétique si je mange du sucre ? »
    // contient « je suis diabétique », mais l'interrogatif est devant et
    // commande la phrase. À l'inverse, « je suis diabétique, c'est quoi une
    // bonne assiette ? » déclare PUIS demande — et cette moitié-là était
    // désarmée à tort, 3/3.
    if (typeof match.index === "number" && questionAt < match.index) continue;
    const object = (match[1] ?? "").trim();
    if (!object) continue;

    // L'objet capturé est un fragment de prose (« type 2 diabetes and i need
    // help »). On cherche le terme le plus long qui y apparaît, à la frontière
    // de mot — « gout » ne doit pas mordre dans « gouty » ni « goutte d'eau ».
    for (const entry of INDEX) {
      if (!entry.term) continue;
      const boundary = new RegExp(`(^|\\s)${entry.term}(\\s|$)`);
      if (!boundary.test(object)) continue;
      return {
        condition_ref: entry.ref,
        notes: raw.slice(0, 500),
        matched: entry.term,
      };
    }
  }

  return null;
}
