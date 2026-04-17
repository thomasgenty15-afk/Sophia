import type {
  ProfessionalSupportKey,
  ProfessionalSupportV1,
  UserTransformationRow,
} from "./v2-types.ts";

export const PROFESSIONAL_SUPPORT_KEYS: ProfessionalSupportKey[] = [
  "general_practitioner",
  "sports_physician",
  "dietitian",
  "nutrition_physician",
  "endocrinologist",
  "cardiologist",
  "gastroenterologist",
  "sleep_specialist",
  "ent_specialist",
  "urologist",
  "andrologist",
  "gynecologist",
  "midwife",
  "fertility_specialist",
  "sexologist",
  "physiotherapist",
  "pelvic_floor_physio",
  "pain_specialist",
  "psychologist",
  "psychotherapist",
  "psychiatrist",
  "cbt_therapist",
  "neuropsychologist",
  "addiction_specialist",
  "smoking_cessation_specialist",
  "couples_therapist",
  "relationship_counselor",
  "family_mediator",
  "sports_coach",
  "strength_conditioning_coach",
  "yoga_pilates_teacher",
  "occupational_therapist",
  "adhd_coach",
  "career_coach",
  "work_psychologist",
  "executive_coach",
  "speech_coach",
  "budget_counselor",
  "debt_advisor",
  "social_worker",
  "lawyer",
  "notary",
];

export const PROFESSIONAL_SUPPORT_CATALOG_DESCRIPTION = `
- general_practitioner: médecin généraliste / médecin traitant
- sports_physician: médecin du sport
- dietitian: diététicien·ne
- nutrition_physician: médecin nutritionniste
- endocrinologist: endocrinologue
- cardiologist: cardiologue
- gastroenterologist: gastro-entérologue
- sleep_specialist: médecin du sommeil / somnologue
- ent_specialist: ORL
- urologist: urologue
- andrologist: andrologue
- gynecologist: gynécologue
- midwife: sage-femme
- fertility_specialist: spécialiste fertilité / PMA
- sexologist: sexologue
- physiotherapist: kinésithérapeute
- pelvic_floor_physio: kiné pelvi-périnéale
- pain_specialist: médecin de la douleur
- psychologist: psychologue
- psychotherapist: psychothérapeute
- psychiatrist: psychiatre
- cbt_therapist: thérapeute TCC
- neuropsychologist: neuropsychologue
- addiction_specialist: addictologue
- smoking_cessation_specialist: tabacologue
- couples_therapist: thérapeute de couple
- relationship_counselor: conseiller conjugal
- family_mediator: médiateur familial
- sports_coach: coach sportif
- strength_conditioning_coach: préparateur physique
- yoga_pilates_teacher: prof de yoga / Pilates
- occupational_therapist: ergothérapeute
- adhd_coach: coach TDAH / fonctions exécutives
- career_coach: coach carrière
- work_psychologist: psychologue du travail
- executive_coach: coach exécutif / leadership
- speech_coach: coach prise de parole
- budget_counselor: conseiller budget
- debt_advisor: conseiller endettement
- social_worker: assistant·e social·e
- lawyer: avocat·e
- notary: notaire
`.trim();

export function extractProfessionalSupport(
  handoffPayload: UserTransformationRow["handoff_payload"],
): ProfessionalSupportV1 | null {
  const onboardingV2 = extractOnboardingV2Payload(handoffPayload);
  const raw = onboardingV2.professional_support;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  return raw as ProfessionalSupportV1;
}

export function mergeProfessionalSupport(
  handoffPayload: UserTransformationRow["handoff_payload"],
  professionalSupport: ProfessionalSupportV1,
): Record<string, unknown> {
  const current = isRecord(handoffPayload) ? { ...handoffPayload } : {};
  const onboardingV2 = extractOnboardingV2Payload(handoffPayload);

  return {
    ...current,
    onboarding_v2: {
      ...onboardingV2,
      professional_support: professionalSupport,
    },
  };
}

export function extractOnboardingV2Payload(
  handoffPayload: UserTransformationRow["handoff_payload"],
): Record<string, unknown> {
  const onboardingV2 = (handoffPayload as
    | { onboarding_v2?: unknown }
    | null
    | undefined)?.onboarding_v2;
  return isRecord(onboardingV2) ? { ...onboardingV2 } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
