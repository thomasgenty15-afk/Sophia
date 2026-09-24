// KEEL frontend i18n — English seed (R1: all UI copy in English for the pilot).
// Flat keys, snake-free dotted namespaces: <screen>.<element>.
// This object is the single source of truth for the MessageKey type in t.ts.
//
// ⟳ 2026-09-24 — UN FICHIER PAR NAMESPACE. Les clés vivent dans `en/<namespace>.ts`
// (la clé `household.x` dans `en/household.ts`); ce fichier ne fait que les
// assembler. Avec `...`, une clé présente dans deux morceaux ne casserait plus
// la compilation — la dernière gagnerait en silence: `dictionaryChunks.int.test.ts`
// refuse ce cas. Les imports portent `.ts` parce que `scripts/prerender.mjs`
// charge ce fichier avec `node`, qui ne résout pas un chemin sans extension.

import { enCoach } from "./en/coach.ts"
import { enImport } from "./en/import.ts"
import { enCommon } from "./en/common.ts"
import { enReview } from "./en/review.ts"
import { enSafety } from "./en/safety.ts"
import { enEditor } from "./en/editor.ts"
import { enTemplates } from "./en/templates.ts"
import { enToday } from "./en/today.ts"
import { enPhoto } from "./en/photo.ts"
import { enSentence } from "./en/sentence.ts"
import { enWhen } from "./en/when.ts"
import { enAmount } from "./en/amount.ts"
import { enUnit } from "./en/unit.ts"
import { enDay } from "./en/day.ts"
import { enFoodGroup } from "./en/food_group.ts"
import { enSubstance } from "./en/substance.ts"
import { enQuestion } from "./en/question.ts"
import { enSlot } from "./en/slot.ts"
import { enEvent } from "./en/event.ts"
import { enStatus } from "./en/status.ts"
import { enTiming } from "./en/timing.ts"
import { enPriority } from "./en/priority.ts"
import { enPart } from "./en/part.ts"
import { enFoodSection } from "./en/food_section.ts"
import { enActivity } from "./en/activity.ts"
import { enAutonomy } from "./en/autonomy.ts"
import { enDeviation } from "./en/deviation.ts"
import { enWeek } from "./en/week.ts"
import { enApp } from "./en/app.ts"
import { enChat } from "./en/chat.ts"
import { enBilling } from "./en/billing.ts"
import { enInvite } from "./en/invite.ts"
import { enJoin } from "./en/join.ts"
import { enAttack } from "./en/attack.ts"
import { enStart } from "./en/start.ts"
import { enBrand } from "./en/brand.ts"
import { enPublic } from "./en/public.ts"
import { enServerUnreachable } from "./en/server_unreachable.ts"
import { enShell } from "./en/shell.ts"
import { enAuth } from "./en/auth.ts"
import { enOffer } from "./en/offer.ts"
import { enHome } from "./en/home.ts"
import { enPro } from "./en/pro.ts"
import { enCoaches } from "./en/coaches.ts"
import { enGyms } from "./en/gyms.ts"
import { enCommunities } from "./en/communities.ts"
import { enHousehold } from "./en/household.ts"
import { enHouseholdClaim } from "./en/household_claim.ts"
import { enUnsubscribe } from "./en/unsubscribe.ts"
import { enPlan } from "./en/plan.ts"
import { enSetup } from "./en/setup.ts"
import { enAllergen } from "./en/allergen.ts"
import { enMeals } from "./en/meals.ts"
import { enStudentProgress } from "./en/student_progress.ts"
import { enMoment } from "./en/moment.ts"
import { enKnown } from "./en/known.ts"
import { enTracking } from "./en/tracking.ts"
import { enLegal } from "./en/legal.ts"
import { enAccount } from "./en/account.ts"
import { enInstallApp } from "./en/install_app.ts"

export const en = {
  ...enCoach,
  ...enImport,
  ...enCommon,
  ...enReview,
  ...enSafety,
  ...enEditor,
  ...enTemplates,
  ...enToday,
  ...enPhoto,
  ...enSentence,
  ...enWhen,
  ...enAmount,
  ...enUnit,
  ...enDay,
  ...enFoodGroup,
  ...enSubstance,
  ...enQuestion,
  ...enSlot,
  ...enEvent,
  ...enStatus,
  ...enTiming,
  ...enPriority,
  ...enPart,
  ...enFoodSection,
  ...enActivity,
  ...enAutonomy,
  ...enDeviation,
  ...enWeek,
  ...enApp,
  ...enChat,
  ...enBilling,
  ...enInvite,
  ...enJoin,
  ...enAttack,
  ...enStart,
  ...enBrand,
  ...enPublic,
  ...enServerUnreachable,
  ...enShell,
  ...enAuth,
  ...enOffer,
  ...enHome,
  ...enPro,
  ...enCoaches,
  ...enGyms,
  ...enCommunities,
  ...enHousehold,
  ...enHouseholdClaim,
  ...enUnsubscribe,
  ...enPlan,
  ...enSetup,
  ...enAllergen,
  ...enMeals,
  ...enStudentProgress,
  ...enMoment,
  ...enKnown,
  ...enTracking,
  ...enLegal,
  ...enAccount,
  ...enInstallApp,
} as const
