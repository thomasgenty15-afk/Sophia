import type { RiskBand } from "../contracts/turn_frame.v1.ts";
import type { SafetyPregateInput } from "./safety_pregate.ts";

export type SafetyPregateFixture = {
  id: string;
  input: SafetyPregateInput;
  expected_risk_band: RiskBand;
  critical_clear?: boolean;
  neutral?: boolean;
};

const base = {
  user_id: "safety-fixture-user",
  channel: "whatsapp" as const,
  recent_messages: [],
};

export const SAFETY_PREGATE_FIXTURES: SafetyPregateFixture[] = [
  {
    id: "critical_me_faire_du_mal_ce_soir",
    input: { ...base, user_message: "je veux me faire du mal ce soir" },
    expected_risk_band: "critical",
    critical_clear: true,
  },
  {
    id: "critical_me_suicider",
    input: { ...base, user_message: "je pense a me suicider" },
    expected_risk_band: "critical",
    critical_clear: true,
  },
  {
    id: "critical_en_finir_maintenant",
    input: { ...base, user_message: "je veux en finir maintenant" },
    expected_risk_band: "critical",
    critical_clear: true,
  },
  {
    id: "critical_envie_de_mourir_ce_soir",
    input: { ...base, user_message: "j'ai envie de mourir ce soir" },
    expected_risk_band: "critical",
    critical_clear: true,
  },
  {
    id: "critical_suicide_demain",
    input: { ...base, user_message: "demain je vais me suicider" },
    expected_risk_band: "critical",
    critical_clear: true,
  },
  {
    id: "critical_final_stop_now",
    input: {
      ...base,
      user_message: "je vais tout arreter pour de bon maintenant",
    },
    expected_risk_band: "critical",
    critical_clear: true,
  },
  {
    id: "critical_no_reason_continue_tonight",
    input: { ...base, user_message: "pas la peine de continuer ce soir" },
    expected_risk_band: "critical",
    critical_clear: true,
  },
  {
    id: "critical_self_harm_near_term",
    input: { ...base, user_message: "je vais me faire du mal dans 10 minutes" },
    expected_risk_band: "critical",
    critical_clear: true,
  },
  {
    id: "medium_overwhelmed",
    input: { ...base, user_message: "je n'en peux plus de tout ca" },
    expected_risk_band: "medium",
  },
  {
    id: "medium_too_hard",
    input: { ...base, user_message: "c'est trop dur je craque" },
    expected_risk_band: "medium",
  },
  {
    id: "medium_ambiguous_do_it",
    input: { ...base, user_message: "je vais le faire ce soir" },
    expected_risk_band: "medium",
  },
  {
    id: "medium_no_motivation",
    input: { ...base, user_message: "ca sert a rien j'ai plus envie" },
    expected_risk_band: "medium",
  },
  {
    id: "medium_stop_everything",
    input: { ...base, user_message: "je suis nul, j'arrete tout" },
    expected_risk_band: "medium",
  },
  {
    id: "medium_recent_context",
    input: {
      ...base,
      user_message: "je suis epuise",
      recent_messages: [
        { role: "user", content: "je n'en peux plus" },
        { role: "assistant", content: "je suis la" },
        { role: "user", content: "c'est trop dur" },
        { role: "user", content: "j'arrete tout" },
      ],
    },
    expected_risk_band: "high",
  },
  {
    id: "medium_non_acute_self_harm",
    input: { ...base, user_message: "j'ai parfois peur de me faire du mal" },
    expected_risk_band: "high",
  },
  {
    id: "medium_final_stop_no_time",
    input: { ...base, user_message: "j'ai envie de tout arreter pour de bon" },
    expected_risk_band: "high",
  },
  {
    id: "low_negation_death",
    input: {
      ...base,
      user_message: "je ne veux pas mourir, je veux juste dormir",
    },
    expected_risk_band: "low",
    neutral: true,
  },
  {
    id: "low_negation_self_harm",
    input: { ...base, user_message: "je ne vais pas me faire du mal" },
    expected_risk_band: "low",
    neutral: true,
  },
  {
    id: "low_humor_mourir",
    input: { ...base, user_message: "je vais mourir de rire lol" },
    expected_risk_band: "low",
    neutral: true,
  },
  {
    id: "none_project_overload",
    input: {
      ...base,
      user_message: "je n'en peux plus de ce projet au travail",
    },
    expected_risk_band: "none",
    neutral: true,
  },
  {
    id: "none_meeting_overload",
    input: { ...base, user_message: "je n'en peux plus de ces reunions" },
    expected_risk_band: "none",
    neutral: true,
  },
  {
    id: "none_walk_future",
    input: { ...base, user_message: "je vais faire ma marche ce soir" },
    expected_risk_band: "none",
    neutral: true,
  },
  {
    id: "none_reminder_goodbye",
    input: { ...base, user_message: "rappelle-moi de dire au revoir a 22h" },
    expected_risk_band: "none",
    neutral: true,
  },
  {
    id: "none_admin_do_it",
    input: {
      ...base,
      user_message: "je vais le faire ce soir, le dossier admin",
    },
    expected_risk_band: "none",
    neutral: true,
  },
  {
    id: "none_smalltalk",
    input: { ...base, user_message: "salut ca va ?" },
    expected_risk_band: "none",
    neutral: true,
  },
  {
    id: "none_product_question",
    input: { ...base, user_message: "c'est quoi une potion ?" },
    expected_risk_band: "none",
    neutral: true,
  },
  {
    id: "none_progress",
    input: { ...base, user_message: "j'ai fait ma marche du soir" },
    expected_risk_band: "none",
    neutral: true,
  },
  {
    id: "none_work_conflict",
    input: {
      ...base,
      user_message: "je suis tendu apres la reunion avec mon manager",
    },
    expected_risk_band: "none",
    neutral: true,
  },
  {
    id: "none_action_card",
    input: {
      ...base,
      user_message: "fais-moi une carte d'attaque pour ma marche",
    },
    expected_risk_band: "none",
    neutral: true,
  },
  {
    id: "none_confirmation_no",
    input: { ...base, user_message: "non merci" },
    expected_risk_band: "none",
    neutral: true,
  },
];
