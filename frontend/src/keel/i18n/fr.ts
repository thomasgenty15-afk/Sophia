// KEEL — le pack FRANÇAIS.
//
// ⚠️ CE FICHIER S'APPELAIT `fr.public.ts`, ET LE NOM EST TOMBÉ AVEC LE LOT 2.
// Le pack ne couvrait que la vitrine; il couvre maintenant le couloir d'entrée
// (`/join`, `/join-household`, `/app/setup`), c'est-à-dire des écrans
// authentifiés. Un fichier qui promet « public » dans son nom pendant qu'il
// traduit le tunnel d'onboarding est un fichier qu'on relit de travers.
//
// Le lot 3 y a ajouté les ATOMES (les tables jeton → mot que `api/labels.ts`
// lit dynamiquement) et la COQUILLE de l'app connectée. Ni les uns ni l'autre
// n'appartiennent à un écran: c'est pour ça qu'ils entrent avant les pages.
//
// Le lot 4 a livré CINQ ÉCRANS D'ÉLÈVE — `/app/today`, `/app/chat`,
// `/app/meals`, `/app/health`, `/app/household` — et l'essentiel de son travail
// n'a pas été de traduire mais de RAPATRIER: cinq `COPY` locaux (166 phrases)
// réimplémentaient `t()` hors du seed, donc ni la garde de `t()` ni le scanner
// de coutures ne les voyaient, et aucun de ces écrans ne pouvait basculer quoi
// qu'on écrive ici. Voir les blocs `meals`, `health` et `today` en bas.
//
// Périmètre: les namespaces listés dans `TRANSLATED_NAMESPACES` (catalog.ts), et
// EXACTEMENT eux. Le type `TranslatedMessages` est dérivé du seed anglais: une clé
// ajoutée à `en.ts` sous un namespace traduit casse la compilation de ce fichier
// tant qu'elle n'est pas traduite. C'est la seule garantie qui tienne — un
// `Partial` avec repli anglais produirait un écran français avec une phrase
// anglaise au milieu, découvert par un client et pas par un test.
//
// CE N'EST PAS UNE TRADUCTION LITTÉRALE. Les pages de vente sont réécrites pour
// sonner juste en français, pas transposées mot à mot: les tournures anglaises
// (« Your course ends. Your coaching doesn't. ») ont un rythme qui ne survit
// pas au calque. Les écrans de produit suivent la même règle pour une autre
// raison — une phrase d'interface calquée se lit comme un logiciel mal traduit,
// et c'est la première chose qu'un client remarque.
//
// Le lot 5 a écrit le pack de TOUT l'espace coach — 557 clés — et n'en a
// déclaré que CINQ écrans sur neuf. Son travail s'est partagé comme celui du
// lot 4: cinq catalogues parallèles rapatriés (`CoachBillingPage.COPY` 39
// entrées, `copy/flagReasons.ts` 8, `GOAL_LABELS` d'`api/coachDoctrine.ts` 6,
// les phrases de `api/dailyPractices.ts` 7, `GROUP_LABELS` de
// `lib/weekInFood.ts` 4) et ~220 littéraux en dur, dont une majorité dans des
// attributs `placeholder`/`title`/`aria-label` — la classe que tout le monde
// oublie. Voir le bloc « LOT 5 » en bas, et `catalog.ts` pour les quatre écrans
// qui restent anglais alors que leurs clés sont écrites: leur corps vient d'une
// fonction edge, d'un module Deno partagé ou d'une migration.
//
// ── LE REGISTRE ────────────────────────────────────────────────────────────
// TUTOIEMENT PARTOUT depuis le 2026-09-25, sur demande: `/`, `/start`,
// `/auth`, `/email-verified`, `/app/setup`, l'app, l'espace coach, `/legal`.
// Un « vous » ne reste que s'il désigne plusieurs personnes (voir l'en-tête
// d'`auth.ts`). Seules les pages pro occultées (`/pro`, `/gyms`,
// `/communities`) vouvoient encore: elles s'adressent à une organisation, et
// se relisent si `VITE_B2C_ONLY` rouvre le pro. L'arbitrage d'avant (vouvoyer
// l'acheteur qu'on ne connaît pas, tutoyer qui est entré) est retiré.
//
// Ce qui NE se traduit pas: le nom de marque, l'adresse e-mail, et les prix
// (ce sont des faits commerciaux, pas de la langue).

import type { TranslatedMessages } from "./catalog";
import { frBrand } from "./fr/brand.ts";
import { frPublic } from "./fr/public.ts";
import { frAuth } from "./fr/auth.ts";
import { frOffer } from "./fr/offer.ts";
import { frHome } from "./fr/home.ts";
import { frPro } from "./fr/pro.ts";
import { frCoaches } from "./fr/coaches.ts";
import { frGyms } from "./fr/gyms.ts";
import { frCommunities } from "./fr/communities.ts";
import { frStart } from "./fr/start.ts";
import { frApp } from "./fr/app.ts";
import { frBilling } from "./fr/billing.ts";
import { frServerUnreachable } from "./fr/server_unreachable.ts";
import { frInvite } from "./fr/invite.ts";
import { frJoin } from "./fr/join.ts";
import { frHouseholdClaim } from "./fr/household_claim.ts";
import { frUnsubscribe } from "./fr/unsubscribe.ts";
import { frHousehold } from "./fr/household.ts";
import { frPlan } from "./fr/plan.ts";
import { frSetup } from "./fr/setup.ts";
import { frAllergen } from "./fr/allergen.ts";
import { frCommon } from "./fr/common.ts";
import { frSafety } from "./fr/safety.ts";
import { frPhoto } from "./fr/photo.ts";
import { frSentence } from "./fr/sentence.ts";
import { frWhen } from "./fr/when.ts";
import { frAmount } from "./fr/amount.ts";
import { frUnit } from "./fr/unit.ts";
import { frDay } from "./fr/day.ts";
import { frFoodGroup } from "./fr/food_group.ts";
import { frSubstance } from "./fr/substance.ts";
import { frQuestion } from "./fr/question.ts";
import { frSlot } from "./fr/slot.ts";
import { frEvent } from "./fr/event.ts";
import { frStatus } from "./fr/status.ts";
import { frTiming } from "./fr/timing.ts";
import { frPriority } from "./fr/priority.ts";
import { frPart } from "./fr/part.ts";
import { frFoodSection } from "./fr/food_section.ts";
import { frActivity } from "./fr/activity.ts";
import { frAutonomy } from "./fr/autonomy.ts";
import { frDeviation } from "./fr/deviation.ts";
import { frShell } from "./fr/shell.ts";
import { frChat } from "./fr/chat.ts";
import { frMeals } from "./fr/meals.ts";
import { frToday } from "./fr/today.ts";
import { frCoach } from "./fr/coach.ts";
import { frImport } from "./fr/import.ts";
import { frReview } from "./fr/review.ts";
import { frEditor } from "./fr/editor.ts";
import { frTemplates } from "./fr/templates.ts";
import { frWeek } from "./fr/week.ts";
import { frStudentProgress } from "./fr/student_progress.ts";
import { frMoment } from "./fr/moment.ts";
import { frKnown } from "./fr/known.ts";
import { frTracking } from "./fr/tracking.ts";
import { frLegal } from "./fr/legal.ts";
import { frAccount } from "./fr/account.ts";
import { frInstallApp } from "./fr/install_app.ts";

// ⟳ 2026-09-24 — UN FICHIER PAR NAMESPACE (`fr/<namespace>.ts`), assemblés ici.
// Chaque morceau est vérifié complet sur son namespace par son `satisfies`; le
// type ci-dessous garde la vérification d'ensemble. Une clé dans deux morceaux:
// `dictionaryChunks.int.test.ts`.
export const fr: TranslatedMessages = {
  ...frBrand,
  ...frPublic,
  ...frAuth,
  ...frOffer,
  ...frHome,
  ...frPro,
  ...frCoaches,
  ...frGyms,
  ...frCommunities,
  ...frStart,
  ...frApp,
  ...frBilling,
  ...frServerUnreachable,
  ...frInvite,
  ...frJoin,
  ...frHouseholdClaim,
  ...frUnsubscribe,
  ...frHousehold,
  ...frPlan,
  ...frSetup,
  ...frAllergen,
  ...frCommon,
  ...frSafety,
  ...frPhoto,
  ...frSentence,
  ...frWhen,
  ...frAmount,
  ...frUnit,
  ...frDay,
  ...frFoodGroup,
  ...frSubstance,
  ...frQuestion,
  ...frSlot,
  ...frEvent,
  ...frStatus,
  ...frTiming,
  ...frPriority,
  ...frPart,
  ...frFoodSection,
  ...frActivity,
  ...frAutonomy,
  ...frDeviation,
  ...frShell,
  ...frChat,
  ...frMeals,
  ...frToday,
  ...frCoach,
  ...frImport,
  ...frReview,
  ...frEditor,
  ...frTemplates,
  ...frWeek,
  ...frStudentProgress,
  ...frMoment,
  ...frKnown,
  ...frTracking,
  ...frLegal,
  ...frAccount,
  ...frInstallApp,
};
