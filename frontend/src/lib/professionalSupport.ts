import type {
  ProfessionalSupportKey,
  ProfessionalSupportRecommendation,
  ProfessionalSupportRecommendationLevel,
  ProfessionalSupportRecommendationStatus,
  ProfessionalSupportTimingKind,
  ProfessionalSupportV1,
} from "../types/v2";

type ProfessionalDefinition = {
  label: string;
  shortLabel: string;
  category: "medical" | "mental" | "coaching" | "support" | "legal";
};

const PROFESSIONAL_SUPPORT_DEFINITIONS: Record<
  ProfessionalSupportKey,
  ProfessionalDefinition
> = {
  general_practitioner: {
    label: "Médecin généraliste",
    shortLabel: "Généraliste",
    category: "medical",
  },
  sports_physician: {
    label: "Médecin du sport",
    shortLabel: "Médecin du sport",
    category: "medical",
  },
  dietitian: {
    label: "Diététicien·ne",
    shortLabel: "Diététicien·ne",
    category: "medical",
  },
  nutrition_physician: {
    label: "Médecin nutritionniste",
    shortLabel: "Nutritionniste",
    category: "medical",
  },
  endocrinologist: {
    label: "Endocrinologue",
    shortLabel: "Endocrinologue",
    category: "medical",
  },
  cardiologist: {
    label: "Cardiologue",
    shortLabel: "Cardiologue",
    category: "medical",
  },
  gastroenterologist: {
    label: "Gastro-entérologue",
    shortLabel: "Gastro-entérologue",
    category: "medical",
  },
  sleep_specialist: {
    label: "Médecin du sommeil",
    shortLabel: "Spécialiste du sommeil",
    category: "medical",
  },
  ent_specialist: {
    label: "ORL",
    shortLabel: "ORL",
    category: "medical",
  },
  urologist: {
    label: "Urologue",
    shortLabel: "Urologue",
    category: "medical",
  },
  andrologist: {
    label: "Andrologue",
    shortLabel: "Andrologue",
    category: "medical",
  },
  gynecologist: {
    label: "Gynécologue",
    shortLabel: "Gynécologue",
    category: "medical",
  },
  midwife: {
    label: "Sage-femme",
    shortLabel: "Sage-femme",
    category: "medical",
  },
  fertility_specialist: {
    label: "Spécialiste fertilité / PMA",
    shortLabel: "Spécialiste fertilité",
    category: "medical",
  },
  sexologist: {
    label: "Sexologue",
    shortLabel: "Sexologue",
    category: "medical",
  },
  physiotherapist: {
    label: "Kinésithérapeute",
    shortLabel: "Kinésithérapeute",
    category: "medical",
  },
  pelvic_floor_physio: {
    label: "Kiné pelvi-périnéale",
    shortLabel: "Kiné pelvi-périnéale",
    category: "medical",
  },
  pain_specialist: {
    label: "Médecin de la douleur",
    shortLabel: "Médecin de la douleur",
    category: "medical",
  },
  psychologist: {
    label: "Psychologue",
    shortLabel: "Psychologue",
    category: "mental",
  },
  psychotherapist: {
    label: "Psychothérapeute",
    shortLabel: "Psychothérapeute",
    category: "mental",
  },
  psychiatrist: {
    label: "Psychiatre",
    shortLabel: "Psychiatre",
    category: "mental",
  },
  cbt_therapist: {
    label: "Thérapeute TCC",
    shortLabel: "Thérapeute TCC",
    category: "mental",
  },
  neuropsychologist: {
    label: "Neuropsychologue",
    shortLabel: "Neuropsychologue",
    category: "mental",
  },
  addiction_specialist: {
    label: "Addictologue",
    shortLabel: "Addictologue",
    category: "medical",
  },
  smoking_cessation_specialist: {
    label: "Tabacologue",
    shortLabel: "Tabacologue",
    category: "medical",
  },
  couples_therapist: {
    label: "Thérapeute de couple",
    shortLabel: "Thérapeute de couple",
    category: "mental",
  },
  relationship_counselor: {
    label: "Conseiller·e conjugal·e",
    shortLabel: "Conseiller conjugal",
    category: "support",
  },
  family_mediator: {
    label: "Médiateur·rice familial·e",
    shortLabel: "Médiateur familial",
    category: "support",
  },
  sports_coach: {
    label: "Coach sportif",
    shortLabel: "Coach sportif",
    category: "coaching",
  },
  strength_conditioning_coach: {
    label: "Préparateur·rice physique",
    shortLabel: "Préparateur physique",
    category: "coaching",
  },
  yoga_pilates_teacher: {
    label: "Prof de yoga / Pilates",
    shortLabel: "Yoga / Pilates",
    category: "coaching",
  },
  occupational_therapist: {
    label: "Ergothérapeute",
    shortLabel: "Ergothérapeute",
    category: "medical",
  },
  adhd_coach: {
    label: "Coach TDAH / fonctions exécutives",
    shortLabel: "Coach TDAH",
    category: "coaching",
  },
  career_coach: {
    label: "Coach carrière",
    shortLabel: "Coach carrière",
    category: "coaching",
  },
  work_psychologist: {
    label: "Psychologue du travail",
    shortLabel: "Psychologue du travail",
    category: "mental",
  },
  executive_coach: {
    label: "Coach exécutif / leadership",
    shortLabel: "Coach exécutif",
    category: "coaching",
  },
  speech_coach: {
    label: "Coach prise de parole",
    shortLabel: "Coach prise de parole",
    category: "coaching",
  },
  budget_counselor: {
    label: "Conseiller·e budget",
    shortLabel: "Conseiller budget",
    category: "support",
  },
  debt_advisor: {
    label: "Conseiller·e endettement",
    shortLabel: "Conseiller endettement",
    category: "support",
  },
  social_worker: {
    label: "Assistant·e social·e",
    shortLabel: "Assistant social",
    category: "support",
  },
  lawyer: {
    label: "Avocat·e",
    shortLabel: "Avocat",
    category: "legal",
  },
  notary: {
    label: "Notaire",
    shortLabel: "Notaire",
    category: "legal",
  },
};

export function extractProfessionalSupport(
  handoffPayload: Record<string, unknown> | null,
): ProfessionalSupportV1 | null {
  const onboardingV2 = (handoffPayload?.onboarding_v2 as
    | Record<string, unknown>
    | undefined) ?? null;
  const raw = onboardingV2?.professional_support;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.should_recommend !== "boolean" ||
    (candidate.recommendation_level !== "optional" &&
      candidate.recommendation_level !== "recommended") ||
    !Array.isArray(candidate.recommendations)
  ) {
    return null;
  }

  return {
    should_recommend: candidate.should_recommend,
    recommendation_level: candidate
      .recommendation_level as ProfessionalSupportRecommendationLevel,
    summary: typeof candidate.summary === "string" ? candidate.summary : null,
    recommendations: candidate.recommendations.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];

      const key = typeof (item as { key?: unknown }).key === "string"
        ? (item as { key: string }).key
        : typeof (item as { professional_key?: unknown }).professional_key === "string"
        ? (item as { professional_key: string }).professional_key
        : null;

      if (
        !key ||
        !Object.prototype.hasOwnProperty.call(PROFESSIONAL_SUPPORT_DEFINITIONS, key) ||
        typeof (item as { reason?: unknown }).reason !== "string"
      ) {
        return [];
      }

      return [{
        key: key as ProfessionalSupportRecommendation["key"],
        reason: (item as { reason: string }).reason,
        priority_rank:
          typeof (item as { priority_rank?: unknown }).priority_rank === "number"
            ? (item as { priority_rank: number }).priority_rank
            : null,
        timing_kind:
          typeof (item as { timing_kind?: unknown }).timing_kind === "string"
            ? (item as { timing_kind: ProfessionalSupportTimingKind }).timing_kind
            : null,
        target_phase_id:
          typeof (item as { target_phase_id?: unknown }).target_phase_id === "string"
            ? (item as { target_phase_id: string }).target_phase_id
            : null,
        target_level_order:
          typeof (item as { target_level_order?: unknown }).target_level_order === "number"
            ? (item as { target_level_order: number }).target_level_order
            : null,
        timing_reason:
          typeof (item as { timing_reason?: unknown }).timing_reason === "string"
            ? (item as { timing_reason: string }).timing_reason
            : null,
      }];
    }),
  };
}

export function getProfessionalDefinition(key: ProfessionalSupportKey) {
  return PROFESSIONAL_SUPPORT_DEFINITIONS[key];
}

export function getProfessionalSupportLevelLabel(
  value: ProfessionalSupportRecommendationLevel,
) {
  return value === "recommended" ? "Recommandé" : "Optionnel";
}

export function getProfessionalSupportTimingLabel(
  timingKind: ProfessionalSupportTimingKind,
  displayLevelOrder: number | null,
) {
  if (timingKind === "now") return "A envisager maintenant";
  if (timingKind === "after_phase1") return "A envisager après ton socle";
  if (timingKind === "if_blocked") return "À utiliser si ça bloque";
  if (timingKind === "before_next_level") {
    return displayLevelOrder
      ? `À prévoir avant le niveau ${displayLevelOrder}`
      : "À prévoir avant le prochain niveau";
  }
  return displayLevelOrder
    ? `Plutôt pendant le niveau ${displayLevelOrder}`
    : "Plutôt pendant le niveau cible";
}

export function getProfessionalSupportStatusLabel(
  status: ProfessionalSupportRecommendationStatus,
) {
  if (status === "completed") return "C'est fait";
  if (status === "booked") return "Rendez-vous pris";
  if (status === "not_needed") return "Pas nécessaire";
  return "En attente";
}
