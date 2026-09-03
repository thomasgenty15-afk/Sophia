/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  decideAskCadence,
  decideDailyPulse,
  renderPulseMessage,
} from "../_shared/keel/daily_pulse.ts";
import {
  loadAskCadence,
  loadPulseDay,
  PULSE_ASKED_METADATA_KEY,
  wasPulseSentToday,
} from "../_shared/keel/daily_pulse_io.ts";
import {
  PRACTICE_KEY_METADATA_KEY,
  PRACTICE_MODE_METADATA_KEY,
} from "../_shared/keel/daily_practice_adherence_io.ts";
import { hasRecapGround } from "../_shared/keel/daily_recap.ts";
import { composeRecapBody, loadDayFacts } from "../_shared/keel/daily_recap_io.ts";
import {
  buildEveningStrip,
  buildShoppingStep,
} from "../_shared/keel/evening_strip.ts";
import { memoryRecapFor } from "../_shared/keel/memory_recap_io.ts";
import { sweepLapsedClarifications } from "../_shared/keel/memory_clarification_io.ts";
// FF-061 — la chaîne des trois étapes, et la question de cuisson qui n'avait
// jusqu'ici AUCUN émetteur: elle ne partait qu'après une décoche.
import { buildSessionQuestion } from "../_shared/keel/accident.ts";
import {
  type DayReviewPending,
  openingStep,
} from "../_shared/keel/day_review.ts";
import {
  loadEveningStripContext,
  respondsForHousehold,
} from "../_shared/keel/evening_strip_io.ts";
import { isFrenchLocale, resolveArtifactLocale } from "../_shared/keel/locale.ts";
// A8.0 — L'AUDIENCE: les élèves, PUIS les profils réclamés (le membre existe
// pour le produit). Le balayage `keel_role = 'student'` a quitté ce fichier
// pour vivre à côté de la seconde requête d'audience, qui ne le porte JAMAIS.
import {
  audiencesFrom,
  loadAudiencePage,
  parsePulseAudience,
  type PulseAudience,
} from "../_shared/keel/pulse_audience.ts";
// ⚠️ LE PLANCHER TCA, ET C'EST LA MÊME PORTE QUE LA COMPOSITION.
// `generate-meal-v1` et `meal-photo-upload-v1` l'appellent déjà; ce job passait
// `false` en dur. Une seule évaluation pour tout le produit — deux définitions
// du plancher, c'est celle qu'on regarde le moins qui décide.
import { evaluateRestrictionForStudent } from "../_shared/keel/restriction_runtime.ts";
// FF-054 §3.2 — le retour de fin de plan, dont ce job est le VÉHICULE.
import {
  localDateFor,
  localHourFor,
} from "../_shared/keel/reengagement_io.ts";
import { assessBirthDate } from "../_shared/keel/student_age.ts";
import { resolveStudentFollowing } from "../_shared/keel/following_io.ts";
// `weekStartOf` vit dans `weekly_flow_io.ts` et n'y est pas propriétaire du
// point hebdomadaire: c'est le lundi d'une date locale, point. On l'importe
// plutôt que d'en recopier trois lignes — deux définitions du lundi finissent
// par diverger, et celle-ci borne désormais la fraîcheur des repas composés.
import { weekStartOf } from "../_shared/keel/weekly_flow_io.ts";
import { deliverChatMessage } from "../_shared/chat/delivery.ts";

/**
 * PIVOT NUTRITION — N2 : le job du soir.
 *
 * Balayage HORAIRE, parce que la fenêtre (20h-22h) est en heure LOCALE de
 * l'élève : un job quotidien ne pourrait servir correctement qu'un seul fuseau.
 * C'est le même raisonnement que `keel-reengage-v1`, et c'est le bug latent
 * n°2 documenté dans BUILD_PLAN W1.3 (« planificateur cassé hors Europe »).
 *
 * ── CE QU'IL ENVOIE A CHANGÉ DE NATURE ───────────────────────────────────
 * Il posait une question, tous les soirs. Il envoie maintenant un message qui
 * s'ouvre sur un FAIT de la journée — ce que l'élève a coché, ce qu'il a
 * photographié — et qui ne porte la question que lorsqu'elle est due.
 *
 * Le motif produit, en une ligne: le message ne donnait rien, il prenait. Un
 * formulaire quotidien se fait ignorer puis couper, et la mesure qu'il servait
 * se détruisait elle-même. Le raisonnement complet est dans `daily_recap.ts`;
 * la cadence de la question dans `decideAskCadence`.
 *
 * TROIS DÉCISIONS, DANS CET ORDRE, et chacune est pure et testable seule:
 *   1. `hasRecapGround(facts)` — y a-t-il un fait sur quoi ouvrir ?
 *   2. `decideAskCadence(...)` — la question est-elle due ?
 *   3. `decideDailyPulse(...)` — envoie-t-on, et la question part-elle avec ?
 *
 * CE QU'IL N'ÉCRIT PAS : la réponse. C'est le webhook qui la reçoit, parce
 * qu'elle arrive par un bouton, des minutes ou des heures plus tard.
 *
 * `dry_run: true` décide sans envoyer : le mode qui permet de voir QUI serait
 * sollicité avant d'ouvrir la vanne.
 */

const FN_NAME = "keel-daily-pulse-v1";
const PAGE = 200;
const DEFAULT_BUDGET_MS = 45_000;

function cleanText(v: unknown, fb = ""): string {
  const t = String(v ?? "").trim();
  return t || fb;
}

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// `localDateFor` vient de `_shared/keel/reengagement_io.ts`. Elle était copiée
// ici; le webhook en avait une troisième copie et lisait un profil SANS la
// colonne `timezone`, donc rangeait le tap au jour UTC pendant que ce job
// interrogeait le jour local. Une seule implémentation, un seul jour.

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const guard = ensureInternalRequest(req);
    if (guard) return guard;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const nowIso = cleanText(body.now);
    const cand = nowIso ? new Date(nowIso) : new Date();
    const now = Number.isFinite(cand.getTime()) ? cand : new Date();
    const dryRun = body.dry_run === true;
    const budgetRaw = Number(body.budget_ms);
    const budgetMs = Number.isFinite(budgetRaw) && budgetRaw > 0
      ? Math.min(budgetRaw, 120_000)
      : DEFAULT_BUDGET_MS;

    const admin = adminClient();
    const startedAt = Date.now();

    // ── LE BALAYAGE DES QUESTIONS PÉRIMÉES ────────────────────────────────
    //
    // ⚠️ CE N'EST PAS DU MÉNAGE, C'EST LE COMPTEUR DU SILENCE. Une question de
    // clarification qui n'a jamais été tapée n'écrit rien — voulu. Mais sans
    // ce balayage, « personne ne répond » et « la question ne part jamais » se
    // ressemblent trait pour trait, et on ne saurait pas si la relance mérite
    // d'exister. Son nombre est la seule mesure de ce qu'elle coûte.
    //
    // ⚠️ ICI PLUTÔT QUE DANS SON PROPRE CRON: ce job tourne déjà toutes les
    // heures et voit toute la flotte, y compris les maîtres de foyer que
    // `keel-proactive-v1` ne balaie pas (`keel_role = 'student'` seulement).
    // Une fonction de plus pour un `update` serait une fonction de plus à
    // déployer, à surveiller, et à oublier.
    //
    // ⛔ AVANT LA BOUCLE, ET SANS `dry_run`: fermer une ligne morte ne dit rien
    // à personne et n'envoie rien. Ce qu'un `dry_run` protège est l'ENVOI.
    await sweepLapsedClarifications(admin, { nowIso: now.toISOString() });

    // ── A8.0 · LE CURSEUR PORTE SA PHASE ──────────────────────────────────
    // `after_user_id` seul ne dit pas dans quelle audience on s'est arrêté;
    // l'appelant repasse `audience` + `after_user_id` tels que le compte-rendu
    // les a rendus. Sans `audience`, on repart des élèves, comme avant.
    const startAudience = parsePulseAudience(body.audience);
    let audience: PulseAudience = startAudience;
    let cursor = cleanText(body.after_user_id);
    let scanned = 0;
    let sent = 0;
    /**
     * A8.0 — LES PROFILS RÉCLAMÉS, COMPTÉS À PART. `scanned: 40, sent: 12`
     * ne dit pas si un seul membre a été atteint; `members_scanned: 0` sur une
     * base qui en porte est le défaut que ce lot ferme, revenu par la porte
     * d'à côté. `members_already_student` compte ceux qu'on a écartés parce
     * qu'ils ont été servis en première phase.
     */
    let membersScanned = 0;
    let membersSent = 0;
    let membersAlreadyStudent = 0;
    /** Messages partis AVEC la question. `sent - asked` = les faits seuls. */
    let asked = 0;
    /**
     * FF-058 — messages partis AVEC la bande, et ceux qui portaient en plus la
     * ligne de courses.
     *
     * Comptés séparément pour la même raison que `body_sources`: « aucun élève
     * n'a de plan pour aujourd'hui » et « la bande ne se construit jamais »
     * produisent le même `sent`, et sans ces deux compteurs la panne se lirait
     * comme un produit qui marche.
     */
    let stripsSent = 0;
    let stripShoppingLines = 0;
    /** FF-061 — laquelle des trois étapes a ouvert, par élève examiné. */
    const reviewOpenings: Record<string, number> = {};
    /**
     * LE PLANCHER TCA, COMPTÉ — parce qu'un plancher qui ne mord jamais et un
     * plancher débranché rendent le MÊME compte-rendu.
     *
     * `restriction_raised` est le nombre d'élèves de la fenêtre pour qui le
     * plancher est levé (aucune bande, aucune pratique). `restriction_unreadable`
     * est le nombre d'évaluations en panne — elles retombent en fail-closed, donc
     * elles font disparaître la bande, et sans ce chiffre une panne de lecture
     * ressemblerait à une cohorte sans plats prévus.
     */
    let restrictionRaised = 0;
    let restrictionUnreadable = 0;
    /**
     * FF-054 §3.2 — combien de PREMIÈRES questions de retour sont parties ce
     * tick. `0` sur une cohorte dont des fenêtres viennent de s'achever est une
     * panne; `sent` ne l'aurait jamais dit, puisque ces messages EN SONT.
     */
    /**
     * D'où venait l'ouverture: voix du coach, ou décompte déterministe.
     *
     * Compté pour la même raison que `body_sources` dans `keel-reengage-v1`:
     * composé et replié produisent tous deux un envoi réussi, et sans ce compte
     * un composeur qui ne sert JAMAIS — doctrine absente sur la cohorte, modèle
     * en panne, ceinture qui refuse tout — se lit comme un composeur qui marche.
     */
    const bodySources: Record<string, number> = {};
    const fallbackReasons: Record<string, number> = {};
    /**
     * FF-001 — la voix du coach sur ses GESTES a-t-elle porté, et sous quelle
     * forme ? `{"remind":30,"ask":12,"none":4}` se lit; l'absence de ce compteur
     * rendrait « aucun coach n'a écrit de pratique » indiscernable de « la
     * sélection ne sert jamais », qui est la panne que `body_sources` a déjà
     * appris à ce job à rendre visible.
     */
    const practiceModes: Record<string, number> = {};
    /** Pourquoi la question n'est pas partie, ou pourquoi elle est partie. */
    const cadenceReasons: Record<string, number> = {};
    const bySkip: Record<string, number> = {};
    const failures: string[] = [];
    let outOfBudget = false;

    // ── A8.0 · DEUX AUDIENCES, DANS CET ORDRE ─────────────────────────────
    //
    // Les ÉLÈVES d'abord (`keel_role = 'student'` — le balayage d'origine,
    // déplacé dans `pulse_audience.ts`), puis les PROFILS RÉCLAMÉS de foyer
    // (`household_members.role = 'member' and user_id is not null`, et rien
    // d'autre: ils portent `keel_role = NULL` exprès, FF-048 R14). L'ordre est
    // le produit (FF-061 §11): la cuisson que le maître déclare ratée doit
    // amputer la bande ③ du conjoint servie dans le même tick.
    //
    // Le corps de la boucle est le MÊME pour les deux: la bifurcation
    // maître/membre vit dans `respondsForHousehold` (① et ② au maître seul) et
    // dans `loadPlannedDishContext` (le plan `household` de SON foyer pour un
    // membre). Une seconde copie du corps aurait divergé au premier lot.
    phases:
    for (const phase of audiencesFrom(startAudience)) {
      audience = phase;
      if (phase !== startAudience) cursor = "";
      while (true) {
        // `birth_date` (FF-001 R5): le mineur se DÉRIVE à chaque lecture, il
        // ne se fige jamais — un entier `age` est faux le lendemain de
        // l'anniversaire et personne ne repasse derrière (`student_age.ts`).
        const page = await loadAudiencePage(admin, {
          audience: phase,
          afterUserId: cursor,
          page: PAGE,
        });
        membersAlreadyStudent += page.skippedAlreadyStudent;
        // Plus rien dans cette audience: la suivante, ou la fin.
        if (page.cursorEnd === null) break;
        const rows = page.rows as unknown as Array<Record<string, unknown>>;

      for (const row of rows) {
        cursor = String(row.id ?? "");
        scanned++;
        if (phase === "members") membersScanned++;

        const tz = row.timezone ? String(row.timezone) : null;
        const localHour = localHourFor(now, tz);
        const localDate = localDateFor(now, tz);

        // La fenêtre d'abord: c'est le filtre le moins cher, et il écarte
        // l'écrasante majorité des élèves à chaque tick.
        if (localHour === null || localHour < 20 || localHour >= 22) {
          bySkip.outside_window = (bySkip.outside_window ?? 0) + 1;
          continue;
        }

        try {
          const day = await loadPulseDay(admin, { userId: cursor, localDate });

          // « RIEN À SUIVRE, RIEN À DEMANDER » — la garde reste, ce qu'elle
          // REGARDE a changé.
          //
          // Elle lisait ici, en dur, `plan_versions` publié OU
          // `student_week_plans` en 'adopted'. Le commit 99697610 a remplacé la
          // semaine de méthode par le constructeur de repas: plus personne
          // n'écrit 'adopted', et aucun coach ne publie de plan_version en 1:N.
          // LES DEUX CONDITIONS ÉTAIENT DEVENUES IMPOSSIBLES — donc ce tap ne
          // partait plus pour personne, en silence, sans une seule erreur.
          //
          // La définition vit maintenant dans `following_io.ts`, partagée avec
          // `keel-weekly-flow-v1` qui portait la même garde écrite deux fois.
          // Une seule définition de « suivre quelque chose »: c'est ce qui
          // empêche les deux surfaces de re-diverger au prochain pivot.
          const following = await resolveStudentFollowing(
            admin,
            cursor,
            weekStartOf(localDate),
          );

          // ── LA GARDE « UN SEUL MESSAGE PAR SOIR » A PERDU SON OBJET ─────
          //
          // Ce bloc lisait `wasRecommendationSentToday` et se retirait quand la
          // recommandation quotidienne avait parlé dans la fenêtre 19h-20h.
          // FF-028 est ABANDONNÉE (décision du 2026-09-01: il n'y a pas de
          // recommandation en plein milieu de plan), donc il n'y a plus rien
          // qui puisse parler avant ce message.
          //
          // ⚠️ CE QUI DISPARAÎT AVEC ELLE, ET QUI DEVRA ÊTRE REPRIS AILLEURS:
          // c'était le SEUL endroit du dépôt où deux canaux proactifs
          // s'arbitraient. FF-062 le remplace par un ordonnanceur — un point
          // unique qui sait ce qui est déjà parti aujourd'hui — parce que six
          // gardes séparées ne peuvent pas répondre à « combien de messages
          // cette personne a-t-elle reçus ». Tant que cet ordonnanceur n'existe
          // pas, ce job est de nouveau seul à décider de son soir.

          // ── LES DEUX LECTURES QUI NOURRISSENT LA DÉCISION ───────────────
          // Les faits d'abord: ils décident s'il y a quelque chose à DIRE. La
          // cadence ensuite: elle décide s'il y a quelque chose à DEMANDER.
          // Les deux sont indépendantes, et c'est ce qui garantit qu'une
          // journée vide n'annule jamais une question due.
          const facts = await loadDayFacts(admin, { userId: cursor, localDate });
          const cadence = decideAskCadence(
            await loadAskCadence(admin, {
              userId: cursor,
              localDate,
              timezone: tz,
              now,
            }),
          );

          // ── FF-058 · LA BANDE DU SOIR ───────────────────────────────────
          //
          // Construite AVANT la décision, parce qu'elle en est une entrée: une
          // soirée sans fait et sans question due peut quand même porter la
          // bande (§7), et c'est même le soir où elle sert le plus.
          //
          // ⚠️ ELLE NE CONSOMME PAS LE BUDGET T4 (R6). Elle n'appelle jamais
          // `recordDailyAsk`, et elle ne lit jamais le compteur: une affordance
          // n'est pas une demande. La pratique (FF-029) et la recommandation
          // (FF-028), elles, restent adossées au budget, dans le code qu'elles
          // avaient déjà — c'est structurel, pas une discipline.
          //
          // ⚠️ ELLE COÛTE UNE SECONDE RÉSOLUTION DU PLAN DU JOUR. `loadDayFacts`
          // a déjà appelé `loadPlannedDishContext` pour son DÉNOMINATEUR, mais
          // il n'en rend que le compte. Faire remonter les plats jusqu'ici
          // demanderait d'élargir `DayFacts`, dont le test appartient à un autre
          // chantier cette nuit. Le coût est borné aux élèves de la fenêtre
          // 20h-22h, et le noter ici vaut mieux qu'une optimisation non relue.
          // ── LA LANGUE DU SOIR, RÉSOLUE UNE FOIS ET DESCENDUE ──────────────
          //
          // Elle était résolue TROIS fois dans cette boucle — une par
          // consommateur — et le troisième consommateur, la question elle-même,
          // n'existait pas: `renderPulseMessage` n'avait pas de locale et
          // écrivait « How was today? » sous un fait français. Une résolution
          // unique par élève est ce qui empêche un quatrième consommateur de
          // repartir sur son propre défaut (R3: on résout au propriétaire du
          // tour, on passe le résultat).
          const artifactLocale = resolveArtifactLocale({
            studentProfile: String(row.locale ?? "").trim() || null,
            tenantDefault: null,
          });
          // `buildEveningStrip` prend un `StripLanguage` fermé, pas un tag
          // BCP-47: on traverse par `isFrenchLocale`, LE prédicat unique du gel.
          const stripLanguage = isFrenchLocale(artifactLocale)
            ? "fr" as const
            : "en" as const;
          // ── LE PLANCHER TCA DURABLE — BRANCHÉ SUR SA SOURCE VIVANTE ──────
          //
          // ⚠️ CE FUT UN LITTÉRAL `false` DU 2026-08-08 AU 2026-09-01, ET IL
          // DÉSARMAIT LA GARDE. L'ancien lecteur (`isRestrictionFlagged`)
          // interrogeait `weekly_reviews.risk_band`, colonne sans écrivain; on
          // a donc retiré le lecteur et laissé le littéral, en le disant. Le
          // résultat était le pire des deux mondes: R8 était armée et testée
          // dans `buildEveningStrip`, et elle ne recevait JAMAIS `true` — la
          // bande du soir nommait des plats à quelqu'un sous plancher, et la
          // pratique du soir partait pareil.
          //
          // La source alimentée existait pourtant déjà, et deux fonctions de
          // production l'appellent: `evaluateRestrictionForStudent`. Ses quatre
          // déclencheurs lisent des tables VIVANTES dans le modèle pivot —
          // `student_body_measures` (perte de poids rapide, FF-031) et la prose
          // de l'élève (vocabulaire compensatoire). Ce n'est donc pas un lecteur
          // de remplacement branché par symétrie: c'est celui que la composition
          // de repas utilise depuis le premier jour.
          //
          // ── FAIL-CLOSED, ET C'EST L'ARBITRAGE DE `generate-meal-v1` ───────
          // Se fermer coûte la bande du soir à un élève qui va bien. S'ouvrir
          // nomme des plats à un élève qu'on n'a pas su évaluer. Les deux coûts
          // ne sont pas du même ordre (T7: les planchers priment sur tout), et
          // la panne est COMPTÉE juste en dessous — un fail-closed silencieux
          // serait la disparition invisible de la fonctionnalité du soir.
          //
          // ── LE COÛT, BORNÉ ET DÉLIBÉRÉ ───────────────────────────────────
          // Quatre lectures de plus par élève. Elles ne sont payées QUE dans la
          // fenêtre 20h-22h locale (le filtre le moins cher passe en premier,
          // 150 lignes plus haut) et après les gardes de cadence: sur un tick
          // horaire, c'est une fraction de la cohorte.
          let restrictionFlag = true;
          try {
            const floor = await evaluateRestrictionForStudent(admin as never, {
              userId: cursor,
              asOfLocalDate: localDate,
            });
            restrictionFlag = floor.restriction_flag === true;
          } catch (error) {
            restrictionUnreadable++;
            console.warn(JSON.stringify({
              tag: "keel.daily_pulse.restriction_floor_unreadable",
              user_id: cursor,
              local_date: localDate,
              // ⚠️ Les quatre champs, pas `String(error)`: une erreur
              // PostgREST n'est pas une `Error`, et le journal ne dirait que
              // « [object Object] » — le défaut nommé cinquante lignes plus bas.
              error: error instanceof Error ? error.message : [
                (error as { code?: string })?.code,
                (error as { message?: string })?.message,
                (error as { details?: string })?.details,
                (error as { hint?: string })?.hint,
              ].filter(Boolean).join(" — ") || String(error),
              effect:
                "fail-closed: ni bande du soir ni pratique pour cet eleve ce soir",
            }));
          }
          if (restrictionFlag) restrictionRaised++;
          const stripContext = await loadEveningStripContext(admin, {
            userId: cursor,
            localDate,
          });
          // ══ FF-061 — LA CHAÎNE DES TROIS ÉTAPES ═════════════════════════
          //
          // ⟳ CE QUI A CHANGÉ LE 2026-09-02, ET POURQUOI. La bande portait les
          // plats ET la ligne de courses dans la MÊME bulle. C'était juste tant
          // que les deux étaient indépendantes; FF-061 les rend dépendantes:
          // déclarer « pas encore » aux courses invalide la cuisson que la
          // vague sert, donc les plats qui en descendent. Les afficher ensemble
          // reviendrait à nommer des plats qu'on est en train de rendre
          // impossibles, avec leurs boutons armés.
          //
          // Le message OUVRE donc à la première étape qui a lieu d'être, et la
          // suite se calcule sur l'état ÉCRIT, dans l'accusé du tap (R1: ② et ③
          // sont des réponses, jamais des notifications).
          //
          // ⛔ `masterOnly` EST LU UNE FOIS. Deux lectures de « qui répond des
          // faits du foyer » finiraient par diverger, et c'est celle qu'on
          // regarde le moins qui laisserait un profil réclamé répondre d'une
          // vague de courses.
          const masterOnly = await respondsForHousehold(admin, cursor);
          const reviewPending: DayReviewPending = {
            // Une vague tombe aujourd'hui ET personne ne l'a déclarée.
            // `shoppingAnswered !== null` la ferme pour de bon.
            shopping: Boolean(stripContext.shopping) &&
              stripContext.shoppingAnswered === null && masterOnly &&
              !restrictionFlag,
            cooking: stripContext.cookOn !== null && masterOnly &&
              !restrictionFlag,
            meals: stripContext.dishes.length > 0 && !restrictionFlag,
          };
          const opening = stripContext.mealId
            ? openingStep(reviewPending)
            : null;

          // ── L'ÉTAPE QUI OUVRE, RENDUE ─────────────────────────────────────
          //
          // Les trois renderers portent chacun leur propre ceinture
          // (`acceptStripText` pour ① et ③, `acceptAccidentText` pour ②) et
          // rendent `null` plutôt qu'un texte qui interroge. Un `null` ici fait
          // retomber le message sur ce qu'il était: le fait du jour, et la
          // question du pouls si elle est due.
          let strip: { line: string; buttons: { id: string; title: string }[] } | null =
            null;
          if (opening === "shopping" && stripContext.mealId && stripContext.shopping) {
            strip = buildShoppingStep({
              mealId: stripContext.mealId,
              buyOn: stripContext.shopping.buyOn,
              language: stripLanguage,
              masterOnly,
              restrictionFlag,
            });
          } else if (opening === "cooking" && stripContext.mealId && stripContext.cookOn) {
            const question = buildSessionQuestion({
              mealId: stripContext.mealId,
              cookOn: stripContext.cookOn,
              language: stripLanguage,
              restrictionFlag,
            });
            if (question) {
              strip = { line: question.body, buttons: question.buttons };
            }
          } else if (opening === "meals" && stripContext.mealId) {
            strip = buildEveningStrip({
              mealId: stripContext.mealId,
              dishes: stripContext.dishes,
              language: stripLanguage,
              // ⛔ `null`, TOUJOURS. La ligne de courses est devenue l'étape ①,
              // qui a son propre renderer et son propre tour. La laisser ici
              // ferait réapparaître une question DÉJÀ répondue — c'est le seul
              // chemin par lequel `opening === "meals"` est atteint quand une
              // vague tombe aujourd'hui.
              shopping: null,
              masterOnly,
              restrictionFlag,
            });
          }
          reviewOpenings[opening ?? "none"] =
            (reviewOpenings[opening ?? "none"] ?? 0) + 1;

          // ⟳ FF-062 — LE RETOUR DE FIN DE PLAN A QUITTÉ CE JOB LE 2026-09-02.
          //
          // Il vivait ici et PRENAIT LA PLACE du message du soir, le lendemain
          // de la clôture d'un plan. Deux choses n'allaient pas, et la fiche
          // les nomme: il n'est pas quotidien (l'accrocher au message quotidien
          // lui faisait hériter d'une fenêtre et d'une garde qui ne sont pas
          // les siennes), et il COÛTAIT le bilan du jour — or le dernier jour
          // d'un plan porte encore des courses, une cuisson et des repas à
          // déclarer.
          //
          // Il part maintenant à 22h, le dernier jour, depuis
          // `keel-proactive-v1` (`runPlanFeedbackStep`), sous son PROPRE
          // purpose. Ne pas le remettre ici: les deux se disputeraient la
          // soirée, et c'est exactement ce qui vient d'être défait.

          // ⚠️ LA GARDE « DÉJÀ SORTI » RESTE, et elle est hissée parce que la
          // décision du pouls en a besoin. Le cron est horaire et la fenêtre
          // fait deux heures: sans elle, le silence de l'élève valait relance
          // une heure plus tard.
          const pulseSentToday = await wasPulseSentToday(admin, {
            userId: cursor,
            localDate,
            timezone: tz,
            now,
          });

          const decision = decideDailyPulse({
            localHour,
            answeredToday: day.answeredToday,
            // Hissé au-dessus: le chemin du retour de fin de plan en a besoin
            // aussi, et deux lectures du même fait finiraient par diverger.
            sentToday: pulseSentToday,
            hasGround: hasRecapGround(facts),
            askDue: cadence.ask,
            // FF-058, puis FF-061 — LA TROISIÈME RAISON DE PARLER.
            //
            // ⟳ Elle ne veut plus dire « il y a des plats à offrir » mais
            // « il reste UNE DES TROIS ÉTAPES à poser »: les courses, la
            // cuisson, ou les repas. `null` couvre donc R10 en entier — zéro
            // vague, zéro cuisson ET zéro plat — et pas seulement R7 de FF-058.
            //
            // ⚠️ C'EST CE QUI FAIT PARLER LE SOIR OÙ TOUS LES PLATS SONT
            // ÉTEINTS. Une journée dont la cascade a tout invalidé est
            // précisément une journée où ① ou ② a lieu d'être; l'ancienne
            // lecture s'y taisait.
            hasStrip: strip !== null,
            // Le mode `attach` demande le dernier échange; ce job ne l'a pas
            // sous la main et l'attachement se décide côté conversation. Ici
            // on envoie toujours en standalone, ce qui est le cas nominal du
            // soir (l'élève n'écrit pas à 20h dans la majorité des cas).
            minutesSinceLastExchange: null,
            // ⚠️ DÉCLARATION, PAS OUBLI — et la garde reste inactive ici.
            //
            // Ce champ était omis, et l'omission était invisible: la garde
            // `safety_active` de ce job était testée, verte, et ne pouvait pas
            // mordre. Le champ est devenu REQUIS pour que ça ne puisse plus
            // arriver en silence.
            //
            // Il vaut `null` parce que ce dépôt n'a AUCUN état de crise
            // persisté et interrogeable: la bande vit dans le tour, pas dans
            // une table. La câbler pour de bon demande de décider où cet état
            // s'écrit — une décision de conception, pas une ligne de code, et
            // elle est remontée telle quelle dans STATUS-MORNING.
            safetyBand: null,
            // ── DE-WHATSAPP — LE MUTE VIENT DU RÉGLAGE PRODUIT, PAS DE META ──
            //
            // 🔴 LE DÉFAUT QUE CETTE LIGNE CORRIGE, MESURÉ EN LOCAL LE 2026-08-04:
            // la condition était
            //     Boolean(row.whatsapp_opted_out_at) || row.whatsapp_opted_in === false
            // et `profiles.whatsapp_opted_in` vaut `false` par défaut. Un élève
            // KEEL n'a JAMAIS donné d'opt-in Meta — il n'y a pas de parcours qui
            // le lui demande. **Tous les élèves KEEL étaient donc `opted_out`**,
            // et le tap du soir n'atteignait personne.
            //
            // Constaté sur la base locale: 14 profils sur 108 écartés en
            // `opted_out`, dont l'élève de la vérification au navigateur. La
            // colonne était le vestige d'une obligation réglementaire Meta; la
            // lire à l'envers (« pas d'opt-in ⇒ muet ») faisait taire toute la
            // base du produit qu'on est en train de construire.
            //
            // `proactive_muted_at` est le réglage produit: il n'est posé QUE
            // quand l'élève coupe ses relances (migration 20260804121000, dont
            // le backfill est délibérément asymétrique pour cette raison exacte).
            optedOut: Boolean(row.proactive_muted_at),
            hasActivePlan: following.following,
          });

          if (decision.decision === "skip") {
            bySkip[decision.reason] = (bySkip[decision.reason] ?? 0) + 1;
            continue;
          }

          // La cadence n'est comptée QUE sur les élèves réellement servis: la
          // compter avant les gardes ferait ressembler une cohorte entière hors
          // fenêtre à une cohorte qu'on a décidé de ne pas questionner.
          cadenceReasons[cadence.reason] = (cadenceReasons[cadence.reason] ?? 0) + 1;

          if (!dryRun) {
            // LE PLANCHER TCA (FF-001 R4) est résolu PLUS HAUT, avant la
            // bande du soir qui en dépend aussi (FF-058 R8). Le pavé qui
            // explique pourquoi il vaut `false` est à sa déclaration.
            //
            // Ce que ce `false` COÛTE quand la bande était renseignée, mesuré
            // 3/3: la pratique CHIFFRÉE du coach repasse dans la sélection
            // (2 pratiques au lieu d'1) et le mode redevient `ask` au lieu de
            // `remind`. Le raisonnement complet et la façon de réarmer sont
            // dans le pavé de `_shared/keel/reengagement_io.ts`.

            // ── LE MINEUR (FF-001 R5) ──────────────────────────────────────
            // Dérivé de la date de naissance À CHAQUE LECTURE, sur le jour LOCAL
            // de l'élève — un élève à Auckland a dix-huit ans douze heures avant
            // que le serveur ne l'admette. Une date absente n'est PAS un mineur:
            // c'est la condition de désarmement écrite dans `student_age.ts`, et
            // aucun élève d'avant ce champ n'en porte une.
            const isMinor = assessBirthDate(row.birth_date, localDate).status === "minor";

            // L'OUVERTURE, dans la voix du coach quand il en a une. Tout
            // échec — pas de doctrine, modèle en panne, ceinture qui refuse —
            // rend le décompte déterministe: on perd la voix, jamais
            // l'information.
            const recap = await composeRecapBody(admin, {
              userId: cursor,
              firstName: String(row.full_name ?? "").trim().split(/\s+/)[0] ?? "",
              facts,
              // R2/R3 — un message de job est un ARTEFACT: aucun fil à ancrer,
              // donc `resolveArtifactLocale` et pas `resolveResponseLocale`.
              contentLocale: artifactLocale,
              // FF-001 — LA PRATIQUE ENTRE DANS L'APPEL QUI A DÉJÀ LIEU.
              // `pulseAsks` vient de la décision prise trois lignes plus haut:
              // c'est ELLE qui fait l'alternance (R3), et pas une seconde
              // cadence qui pourrait entrer en collision avec la première.
              practiceContext: {
                localDate,
                isMinor,
                restrictionFlag,
                pulseAsks: decision.ask,
              },
              requestId,
            });
            bodySources[recap.source] = (bodySources[recap.source] ?? 0) + 1;
            if (recap.source === "fallback" && recap.reason) {
              const key = recap.reason.split(":").slice(0, 2).join(":");
              fallbackReasons[key] = (fallbackReasons[key] ?? 0) + 1;
            }
            practiceModes[recap.practiceMode] = (practiceModes[recap.practiceMode] ?? 0) + 1;

            // ── CE QU'ON A RETENU AUJOURD'HUI ────────────────────────────
            //
            // ⛔ C'EST LA MOITIÉ « ON LE DIT » DE L'ARBITRAGE DU 2026-09-01.
            // Le produit a cessé d'exiger un consentement synchrone pour
            // écrire une allergie déclarée sur un retour de plan; ce qui
            // remplace ce consentement est « on l'écrit, on le DIT, et ça se
            // défait ». Retirer cet appel retire la justification de
            // l'écriture — pas seulement une ligne de message.
            //
            // ⚠️ UN ÉNONCÉ, PAS UNE DEMANDE: il n'est PAS écrit au registre
            // `meal_precision_questions` et ne consomme donc pas
            // `DAILY_ASK_BUDGET`. T4 borne les demandes, pas les comptes rendus.
            const memory = await memoryRecapFor({
              admin,
              userId: cursor,
              localDate,
              language: stripLanguage === "fr" ? "fr" : "en",
            });
            const message = renderPulseMessage({
              recapBody: recap.body,
              memory,
              ask: decision.ask,
              strip,
              locale: artifactLocale,
            });
            // FF-058 §10 / R6 — LA MESURE DU SAPIN DE NOËL, dans le journal du
            // job. Longueur du message et nombre d'éléments interactifs sont les
            // deux chiffres qui disent si l'ajout reste lisible; sans eux, « le
            // message est devenu illisible » n'est constatable que par un humain
            // qui regarde une bulle, c'est-à-dire jamais.
            if (strip) {
              stripsSent++;
              if (opening === "shopping") stripShoppingLines++;
              console.info(JSON.stringify({
                tag: "keel.evening_strip.sent",
                user_id: cursor,
                local_date: localDate,
                language: stripLanguage,
                // ⟳ L'ÉTAPE QUI A OUVERT, et c'est ce qu'il faut mesurer
                // maintenant: `dishes` seul ne disait plus lequel des trois
                // rendus était parti.
                review_step: opening,
                dishes: stripContext.dishes.length,
                carries_shopping: opening === "shopping",
                practice_mode: recap.practiceMode,
                pulse_asked: decision.ask,
                message_chars: message.body.length,
                interactive_count: message.buttons.length,
              }));
            }
            // DE-WHATSAPP — la livraison est une ÉCRITURE, plus un appel Graph.
            //
            // Ce qui disparaît avec Meta, et ce que ça supprime de complexité:
            //   * `sendKeelWhatsApp` + `x-internal-secret` (les 403 silencieux
            //     qui comptaient chaque envoi en `failures` sans rien envoyer);
            //   * le 409 « fenêtre 24h fermée », qui était le cas NOMINAL de ce
            //     job — l'élève qu'on veut mesurer est justement celui qui n'a
            //     pas écrit depuis la veille;
            //   * le repli template et ses payloads de boutons voyageant par
            //     index, avec le risque de divergence de libellés qui allait
            //     avec.
            // Il ne reste qu'une ligne écrite dans la bulle, et Realtime.
            const delivered = await deliverChatMessage(admin, {
              userId: cursor,
              content: message.body,
              purpose: "keel_daily_pulse",
              buttons: message.buttons.map((b) => ({
                payload: b.id,
                label: b.title,
              })),
              requestId,
              // ⚠️ LE DRAPEAU DONT DÉPEND TOUTE LA CADENCE.
              //
              // Le récapitulatif et la question partent sous le MÊME purpose
              // (`keel_daily_pulse` est dans `GUARANTEED_PURPOSES`; un purpose
              // neuf serait silencieusement plafonné). Sans ce drapeau,
              // `loadAskCadence` compterait chaque récapitulatif comme une
              // question posée, `daysSinceLastAsk` vaudrait éternellement 0, et
              // **la question ne repartirait jamais** — pendant que le job
              // continuerait à compter un envoi par élève et par jour.
              //
              // `body_source` voyage pour la même raison que dans la relance:
              // un message dont on ne peut plus dire, trois semaines plus tard,
              // s'il portait la voix du coach ou le texte de secours est un
              // message qu'on ne peut pas juger.
              metadata: {
                [PULSE_ASKED_METADATA_KEY]: decision.ask,
                body_source: recap.source,
                body_fallback_reason: recap.reason || null,
                // ── FF-029 — CE QUE CE MESSAGE PORTAIT COMME PRATIQUE ─────
                //
                // Deux clés, écrites parce qu'elles seront RELUES: R7 (« une
                // pratique ignorée durablement se remplace, ne se répète pas »)
                // demande de savoir, trois semaines plus tard, quelle pratique
                // a été QUESTIONNÉE et si l'élève a écrit après. Sans cette
                // trace, la règle est une intention dans une fiche.
                //
                // C'est un FAIT (ce qui est parti), jamais un score: le compte
                // n'existe nulle part en base, il se dérive à la lecture
                // (`daily_practice_adherence.ts`). `adherence_score` est l'une
                // des quatre surfaces qu'une pratique n'a pas le droit d'être;
                // la fabriquer en coulisse serait la même chose sans le nom.
                [PRACTICE_MODE_METADATA_KEY]: recap.practiceMode,
                [PRACTICE_KEY_METADATA_KEY]: recap.practiceKey,
              },
              // L'HORLOGE DU JOB EST AUSSI CELLE DE SES EFFETS.
              // Sans ce passage, `now` gouvernait la DÉCISION (fenêtre 20-22 h
              // locales) et l'horloge réelle gouvernait l'ÉCRITURE: la ligne
              // était estampillée à une heure que le job n'avait pas choisie, et
              // le plafond quotidien se comptait sur une AUTRE date locale que
              // celle qui avait autorisé l'envoi. En production les deux
              // coïncident; en rejeu — le seul moment où on peut éprouver ce
              // job — elles divergent, et une question posée « dans le futur »
              // n'est jamais armée.
              now,
            });
            if (!delivered.delivered) {
              // Un refus de livraison N'EST PAS une panne: mute, plafond ou
              // état périmé sont des décisions produit. On les compte par motif
              // pour qu'un soir « rien n'est parti » soit lisible, au lieu de
              // ressembler à un incident ou — pire — à un succès.
              bySkip[`delivery:${delivered.reason}`] =
                (bySkip[`delivery:${delivered.reason}`] ?? 0) + 1;
              continue;
            }
          }
          sent++;
          if (phase === "members") membersSent++;
          if (decision.ask) asked++;
        } catch (error) {
          // Une erreur PostgREST n'est PAS une `Error`: sans ces champs, le
          // journal ne dit que « [object Object] ». C'est exactement ce qui a
          // masqué un 42P10 permanent dans le point hebdo, et ce qui a rendu
          // illisible la panne du 2026-08-04 quand une vue de compat a été
          // droppée sous les pieds de ce job.
          const err = error as {
            message?: string;
            code?: string;
            details?: string;
            hint?: string;
          };
          failures.push(
            `${cursor}: ${
              error instanceof Error ? error.message : [
                err?.code,
                err?.message,
                err?.details,
                err?.hint,
              ].filter(Boolean).join(" — ") || String(error)
            }`,
          );
        }
        if (Date.now() - startedAt > budgetMs) {
          outOfBudget = true;
          break;
        }
      }
        if (outOfBudget) break phases;
        // La page entière a été parcourue: on avance au dernier identifiant
        // PARCOURU, pas au dernier servi (un membre écarté doit être dépassé).
        cursor = page.cursorEnd;
      }
    }
    // « Épuisé » = les deux audiences parcourues jusqu'au bout dans le budget.
    const exhausted = !outOfBudget;

    return jsonResponse(req, {
      ok: true,
      dry_run: dryRun,
      scanned,
      sent,
      // A8.0 — la seconde audience, comptée à part (voir sa déclaration).
      members_scanned: membersScanned,
      members_sent: membersSent,
      members_already_student: membersAlreadyStudent,
      // `sent` compte les MESSAGES, `asked` les questions. Les confondre était
      // possible tant que le message ÉTAIT la question; ça ne l'est plus, et un
      // soir où « 40 messages sont partis » ne dit rien de ce qui a été mesuré.
      asked,
      // FF-058 — combien de bandes sont parties, et combien portaient la ligne
      // de courses. `strips_sent: 0` sur une cohorte qui a des plans est une
      // panne; `sent: 40` ne l'aurait jamais dit.
      strips_sent: stripsSent,
      strip_shopping_lines: stripShoppingLines,
      // ⟳ FF-061 — LAQUELLE DES TROIS ÉTAPES A OUVERT. `strips_sent` seul ne
      // distingue plus les trois rendus, et c'est précisément le chiffre qui
      // dira si la chaîne est câblée: `cooking: 0` sur une cohorte qui a des
      // sessions de cuisine veut dire que l'étape ② n'est pas atteinte — le
      // défaut qu'elle vient de fermer (elle n'avait AUCUN émetteur avant
      // aujourd'hui, seulement un lecteur).
      review_openings: reviewOpenings,
      // Le plancher TCA. `restriction_raised: 0` sur une cohorte entière est
      // lisible (personne n'est à risque ce soir); `restriction_unreadable: 40`
      // dit que la bande a disparu pour une panne, pas pour une décision.
      restriction_raised: restrictionRaised,
      restriction_unreadable: restrictionUnreadable,
      // FF-054 §3.2 — les messages du soir qui portaient une question de retour
      // À LA PLACE de la bande. Ils sont comptés dans `sent`, et ici à part:
      // sans ce chiffre, un soir « 40 messages » ne dit pas si 12 d'entre eux
      // étaient des questionnaires.
      // ⟳ `feedback_opened` A DISPARU DE CE COMPTE-RENDU LE 2026-09-02: le
      // retour de fin de plan est parti dans `keel-proactive-v1`, et c'est SON
      // compte-rendu qui le porte désormais. Le garder ici à zéro aurait été un
      // chiffre qui dit « aucun retour ouvert » à propos d'un canal que ce job
      // ne regarde plus.
      // La voix du coach a-t-elle porté ? `{"composed":8,"fallback":2}` se lit;
      // `sent: 10` ne dit rien de ce que les élèves ont reçu.
      body_sources: bodySources,
      body_fallback_reasons: fallbackReasons,
      // FF-001 — la répartition rappel / question / rien, qui est l'une des
      // quatre mesures que la spécification demande (§10).
      practice_modes: practiceModes,
      // Pourquoi la question est partie, ou pas. `{"too_soon": 30}` est un
      // produit qui se tient; `{"backing_off": 30}` est une cohorte qui décroche.
      ask_cadence_reasons: cadenceReasons,
      skipped_by_reason: bySkip,
      exhausted,
      // A8.0 — le curseur porte sa phase: l'appelant repasse les deux.
      audience,
      next_audience: exhausted ? null : audience,
      next_after_user_id: exhausted ? null : cursor || null,
      failures: failures.slice(0, 50),
      request_id: requestId,
    }, { includeCors: false });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: FN_NAME,
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(req, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500, includeCors: false });
  }
});
