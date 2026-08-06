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
 */
function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
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
  pregnancy: [
    "pregnant",
    "pregnancy",
    "breastfeeding",
    "enceinte",
    "grossesse",
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
  /\b(?:i am|i m|im)\s+not\s+/,
  /\bi\s+(?:do\s+not|don t|dont)\s+have\b/,
  /\bje\s+ne\s+suis\s+(?:pas|plus)\b/,
  /\bje\s+n\s*ai\s+(?:pas|plus)\b/,
  /\bpas\s+(?:diabetique|enceinte|coeliaque|hypertendue?)\b/,
  // Quelqu'un d'autre. Le sujet capturé ne suffit pas: « my mother is diabetic,
  // am I at risk? » contient les deux.
  /\b(?:my|his|her|their|our)\s+(?:son|daughter|child|kid|wife|husband|partner|mother|father|mum|mom|dad|friend|colleague|brother|sister)\b/,
  /\b(?:mon|ma|mes)\s+(?:fils|fille|enfant|femme|mari|conjoint|mere|pere|maman|papa|ami|amie|collegue|frere|soeur)\b/,
  // Une question n'est pas une déclaration.
  /\b(?:am i|is it|what is|what s|what causes|c est quoi|qu est ce que|est ce que je suis|est ce que j ai)\b/,
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

  for (const disarm of DISARM_PATTERNS) {
    if (disarm.test(text)) return null;
  }

  for (const pattern of DECLARATION_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
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
