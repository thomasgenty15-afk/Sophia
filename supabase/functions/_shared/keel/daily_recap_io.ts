/**
 * LA COQUILLE D'I/O DU FAIT DU SOIR — lire la journée, la faire dire.
 *
 * `daily_recap.ts` DÉCIDE et JUGE (pur, testé). Ce module LIT et APPELLE le
 * modèle. Même frontière que partout dans `_shared/keel/`, et elle porte ici
 * une charge particulière: tout ce qui entre dans le message passe par
 * `loadDayFacts`, donc la surface de confabulation du produit tient dans une
 * seule fonction qu'on peut relire.
 *
 * ── CE QUI EST LU, ET POURQUOI DANS CET ORDRE ────────────────────────────
 *   1. `protocol_events` du jour local — LES FAITS. Les coches (`quick_tap` +
 *      clé `meal_tick:…`) et les photos. C'est la table des faits déclarés par
 *      l'élève; rien n'y est déduit.
 *   2. `student_generated_meals` via `loadPlannedDishContext` — le DÉNOMINATEUR
 *      seul (« 2 des 4 »). Les titres du plan ne remontent PAS: le modèle n'a
 *      aucune raison de nommer un plat que l'élève n'a pas coché, et lui donner
 *      les deux listes l'inviterait à les confondre.
 *
 * ── UNE LECTURE EN PANNE REND UNE JOURNÉE VIDE, JAMAIS UNE ERREUR ────────
 * Le pire cas est un soir sans fait — l'élève reçoit la question seule, ou
 * rien. Le pire cas de l'alternative serait un décompte faux, et un décompte
 * faux dans la bulle est indiscernable d'un vrai. L'asymétrie penche du même
 * côté que `doctrine_loader` et `planned_dish_io`, et pour la même raison.
 */

import {
  countDailyAsks,
  DAILY_ASK_BUDGET,
  recordDailyAsk,
} from "./daily_ask_budget.ts";
import {
  durablyIgnoredKeys,
  readPracticeAdherence,
  rotationPool,
} from "./daily_practice_adherence.ts";
import { loadPracticeAskRecords } from "./daily_practice_adherence_io.ts";
import {
  decidePracticeMode,
  type PracticeInjection,
  practiceInjectionFor,
  practiceKey,
  practicesFor,
  selectPracticeForEvening,
} from "./daily_practices.ts";
import {
  acceptComposedRecap,
  buildRecapSystemPrompt,
  buildRecapUserPrompt,
  type DayFacts,
  EMPTY_DAY_FACTS,
  renderDeterministicRecap,
} from "./daily_recap.ts";
import { loadPlannedDishContext } from "./planned_dish_io.ts";
import { parseMealTickKey } from "./meal_tick.ts";
import { doctrineBlockFor, loadPublishedDoctrine } from "./doctrine_loader.ts";
import { appendResponseLanguageBlock } from "./locale.ts";
import { generateWithGemini } from "../gemini.ts";

/** Structural type: les tests injectent un faux, la prod un SupabaseClient. */
// deno-lint-ignore no-explicit-any
type Db = any;

// Le préfixe et sa relecture vivent dans `meal_tick.ts`: une seconde copie du
// format de clé finirait par diverger de celle qui l'ÉCRIT.

/**
 * Les faits de la journée, tels que l'élève les a déclarés.
 *
 * ── LE TITRE VIENT DE LA COCHE, PAS DE LA COMPOSITION ────────────────────
 * `tickMeal` écrit `student_note = dish.title` au moment du geste. On relit
 * donc ce que l'élève a coché, à l'instant où il l'a coché — et non ce que la
 * composition COURANTE dit aujourd'hui du plat n°3. Une régénération de semaine
 * change les titres sous les clés; sans cette lecture directe, le message du
 * soir citerait un plat que l'élève n'a jamais vu.
 *
 * ── `local_date` ET PAS `occurred_at` ────────────────────────────────────
 * Une coche porte la date du jour où le plat SE MANGEAIT (`useMealTicks`: « le
 * passé se rattrape »). Rattraper mardi le dîner de lundi ne doit donc pas
 * faire apparaître ce dîner dans le message de mardi soir — il appartient à
 * lundi, et la colonne le dit déjà.
 */
export async function loadDayFacts(
  db: Db,
  args: { userId: string; localDate: string },
): Promise<DayFacts> {
  const userId = String(args.userId ?? "").trim();
  const localDate = String(args.localDate ?? "").trim();
  if (!userId || !localDate) return EMPTY_DAY_FACTS;

  let events: Array<Record<string, unknown>> = [];
  try {
    const { data, error } = await db
      .from("protocol_events")
      .select("source, student_note, source_message_id, plan_relation")
      .eq("user_id", userId)
      .eq("local_date", localDate)
      // Une ligne décochée SURVIT (`protocol_events` est append-only) et porte
      // `disqualified_reason='food_not_eaten'`. Tout lecteur qui COMPTE filtre
      // dessus — en oublier le filtre ferait féliciter pour un plat que
      // l'élève vient explicitement de retirer.
      .is("disqualified_reason", null);
    if (error) throw error;
    events = (data ?? []) as Array<Record<string, unknown>>;
  } catch (error) {
    console.warn("[keel/recap] day events unreadable", error);
    return EMPTY_DAY_FACTS;
  }

  const tickedTitles: string[] = [];
  // De quel PLAN vient chaque coche. Même longueur que `tickedTitles`: les deux
  // sont poussés ensemble, sur la même ligne d'événement.
  const tickedMealIds: string[] = [];
  let photoCount = 0;
  let offPlanCount = 0;
  for (const row of events) {
    const source = String(row.source ?? "");
    // FF-009 — LE HORS-PLAN SE COMPTE EN PREMIER ET SUR SON PROPRE AXE.
    // `plan_relation` n'est PAS `source`: une photo peut parfaitement être un
    // repas hors plan. On compte donc la relation au plan avant de brancher sur
    // la provenance, et un `continue` ici ferait disparaître la photo de son
    // propre compte — ce qui est exactement la fusion que R4 interdit.
    if (String(row.plan_relation ?? "") === "off_plan") offPlanCount++;
    if (source === "photo") {
      photoCount++;
      continue;
    }
    if (source === "quick_tap") {
      const parsed = parseMealTickKey(row.source_message_id);
      if (!parsed) continue;
      const title = String(row.student_note ?? "").trim();
      // Une coche sans titre reste un fait — elle compte dans le total, elle ne
      // se cite simplement pas. L'écarter fausserait le numérateur.
      tickedTitles.push(title);
      tickedMealIds.push(parsed.mealId);
    }
  }

  // Le dénominateur, et l'IDENTITÉ du plan dont il vient. Une composition
  // illisible ou hors fenêtre rend 0: le message dira « X cochés » sans ratio,
  // ce qui reste vrai.
  let plannedCount = 0;
  let plannedMealId: string | null = null;
  try {
    const planned = await loadPlannedDishContext(db, { userId, localDate });
    plannedCount = planned.dishes.length;
    plannedMealId = planned.mealId;
  } catch (error) {
    console.warn("[keel/recap] planned dishes unreadable", error);
  }

  return {
    // ⚠️ LE TOTAL COMPTE LES COCHES, PAS LES TITRES LISIBLES — d'où deux
    // champs. Une coche muette (titre vide en base) disparaîtrait du décompte
    // si on prenait la longueur de la liste filtrée, et « 2 des 4 » deviendrait
    // « 1 des 4 »: un chiffre faux issu d'une donnée manquante.
    tickedCount: tickedTitles.length,
    // ── LE NUMÉRATEUR DU RATIO EST SCOPÉ AU PLAN, `tickedCount` NON ────────
    // Les deux existent, et la distinction est délibérée:
    //
    //   `tickedCount` compte TOUTES les coches du jour. Une coche est un fait
    //   que l'élève a rapporté; la compter n'est jamais faux, et le message
    //   « tu as coché 3 choses » reste vrai quel que soit le plan visé.
    //
    //   `tickedForPlanCount` ne compte que celles du plan qui fournit le
    //   DÉNOMINATEUR. Sans ce filtre, un élève qui a un plan courant et un plan
    //   préparé voyait ses coches des deux additionnées face aux plats d'un
    //   seul: « 5 des 3 », dans le message du soir, sans qu'aucune erreur ne
    //   soit levée nulle part.
    tickedForPlanCount: plannedMealId
      ? tickedMealIds.filter((id) => id === plannedMealId).length
      : 0,
    tickedTitles: tickedTitles.filter((t) => t.length > 0),
    plannedCount: Math.max(plannedCount, 0),
    photoCount,
    offPlanCount,
  };
}

const COMPOSE_TIMEOUT_MS = 12_000;

export type RecapBodySource = "composed" | "fallback";

export interface ComposedRecapBody {
  /** `null` = aucun fait: le message du soir n'aura pas d'ouverture. */
  body: string | null;
  source: RecapBodySource;
  /** Motif du repli, vide quand le corps est composé. */
  reason: string;
  /**
   * FF-001 — CE QUI EST ARRIVÉ À LA PRATIQUE, rendu à l'appelant.
   *
   * `"none"` couvre les quatre situations que le compte-rendu du job doit
   * pouvoir distinguer: pas de doctrine, aucune pratique écrite, toutes hors
   * portée pour cet élève, ou toutes en attente de relecture. Sans ce champ,
   * « la fonctionnalité ne part jamais » et « elle part » produisent le même
   * compte-rendu — la panne silencieuse que `body_sources` existe déjà pour
   * empêcher un étage plus haut.
   */
  practiceMode: "remind" | "ask" | "none";
  /**
   * FF-029 — QUELLE pratique est partie (`practiceKey`), ou `null`.
   *
   * Elle sort d'ici pour être ÉCRITE dans le ledger par l'appelant, et pour
   * aucune autre raison. Sans elle, « une question de pratique est partie ce
   * soir » ne se rattache à aucune pratique trois semaines plus tard, et R7
   * (« une pratique ignorée durablement se remplace ») n'a rien à lire: le
   * remplacement deviendrait une intention écrite dans une fiche.
   */
  practiceKey: string | null;
}

/**
 * CE QUE L'APPELANT SAIT DE L'ÉLÈVE, ET QUE CE MODULE NE PEUT PAS DEVINER.
 *
 * Les trois champs sont REQUIS. Chacun est une garde, et une garde à paramètre
 * optionnel est une garde désarmée — la classe de défaut la plus fréquente de
 * ce dépôt, documentée dans `daily_pulse.ts` à propos de `safetyBand`.
 */
export interface RecapPracticeContext {
  /** Le jour local de l'élève, `YYYY-MM-DD`. La rotation en dépend (R6). */
  localDate: string;
  /** Dérivé de `profiles.birth_date`, jamais figé (`student_age.ts`). R5. */
  isMinor: boolean;
  /**
   * Le plancher TCA. R4.
   *
   * ⚠️ Son seul producteur (`isRestrictionFlagged`, sur
   * `weekly_reviews.risk_band`) a été retiré en L3 le 2026-08-08: la colonne
   * n'avait aucun écrivain. `keel-daily-pulse-v1` passe donc `false`. Le champ
   * reste REQUIS — c'est lui qui rendra le réarmement visible le jour où une
   * source alimentée sera rebranchée.
   */
  restrictionFlag: boolean;
  /** Le pulse pose-t-il SA question ce soir ? (`decideDailyPulse().ask`) R3. */
  pulseAsks: boolean;
}

/**
 * Le fait du soir, dans la voix du coach quand il en a une.
 *
 * Tout échec — pas de doctrine, modèle en panne, verdict négatif — rend le
 * texte DÉTERMINISTE. C'est l'arbitrage de `composeReengageBody`, repris tel
 * quel, et il est encore plus confortable ici: le repli n'est pas un texte
 * générique, c'est le décompte exact. On perd la voix, pas l'information.
 *
 * Le motif du repli est RENDU, jamais avalé. Sans lui, « le composeur ne sert
 * jamais » et « le composeur marche » produisent le même message et le même
 * compte-rendu — la panne silencieuse que ce dépôt a déjà payée avec
 * `toneDelivered`.
 */
export async function composeRecapBody(
  db: Db,
  args: {
    userId: string;
    firstName: string;
    facts: DayFacts;
    /** R2/R3 — locale de l'ARTEFACT, résolue par l'appelant. Requis. */
    contentLocale: string;
    /** FF-001 — ce que l'appelant sait de l'élève. Requis. */
    practiceContext: RecapPracticeContext;
    requestId?: string;
  },
): Promise<ComposedRecapBody> {
  const deterministic = renderDeterministicRecap(args.facts);
  const fallback = (reason: string): ComposedRecapBody => ({
    body: deterministic,
    source: "fallback",
    reason,
    // Le repli déterministe ne porte AUCUNE pratique, et c'est délibéré: il
    // compte, il n'a pas de voix. Y coller une phrase de coach écrite à la main
    // serait la phrase figée que tout ce lot refuse.
    practiceMode: "none",
    practiceKey: null,
  });

  // Pas de sol, pas de message: rien à composer, et surtout rien à inventer.
  // C'est ici que se tient la promesse « une journée vide n'a pas d'ouverture »
  // — le modèle n'est jamais appelé sur une journée qu'il devrait meubler.
  if (deterministic === null) {
    return {
      body: null,
      source: "fallback",
      reason: "no_ground",
      practiceMode: "none",
      practiceKey: null,
    };
  }

  let doctrineBlock: string;
  let practice: PracticeInjection | null = null;
  let chosenKey: string | null = null;
  try {
    const loaded = await loadPublishedDoctrine(db, args.userId);
    // PAS DE COMPOSITION SANS DOCTRINE: sans méthode publiée il n'y a aucune
    // voix à porter, donc la composition paierait un appel de modèle pour
    // réécrire un décompte — moins fiable, et sans le déterminisme qui allait
    // avec. Même règle, mot pour mot, que la relance.
    if (loaded.reason !== "loaded") return fallback(`no_doctrine:${loaded.reason}`);
    doctrineBlock = doctrineBlockFor(loaded);

    // ── LA PRATIQUE DU SOIR (FF-001) ──────────────────────────────────────
    //
    // Elle se choisit ICI, dans la lecture de doctrine qui a DÉJÀ lieu: aucune
    // requête de plus, aucun cron de plus, aucun appel de modèle de plus. C'est
    // la contrainte n°1 de FF-001, et elle tient parce que les pratiques vivent
    // sur la même ligne que le reste de la méthode.
    //
    // `loaded.goal` est la variante servie à CET élève — la même que celle qui
    // a filtré les croyances. Relire l'objectif ailleurs produirait une seconde
    // définition de « à qui s'adresse cette entrée », et c'est exactement la
    // divergence que la portée par objectif a déjà coûté une fois.
    const eligible = practicesFor(
      loaded.doctrine?.dailyPractices ?? [],
      loaded.goal,
      args.practiceContext.isMinor,
      args.practiceContext.restrictionFlag,
    );

    // ── FF-029 R7 — LA ROTATION PASSE À CÔTÉ DE CE QUI NE PORTE PLUS ──────
    //
    // La lecture n'a lieu QUE s'il y a une pratique à servir: sur l'écrasante
    // majorité des coachs, qui n'en ont écrit aucune, elle ne coûte rien. Elle
    // ne remonte jamais — une panne rend « rien d'ignoré », donc la rotation
    // d'avant FF-029, à l'identique.
    const pool = eligible.length > 0
      ? rotationPool(
        eligible,
        durablyIgnoredKeys(
          readPracticeAdherence(
            await loadPracticeAskRecords(db, {
              userId: args.userId,
              todayLocalDate: args.practiceContext.localDate,
            }),
          ),
        ),
      )
      : { practices: eligible, allIgnored: false };

    const chosen = selectPracticeForEvening({
      practices: pool.practices,
      userId: args.userId,
      localDate: args.practiceContext.localDate,
    });

    // ── T4 — LE BUDGET DE DEMANDE, LU AVANT DE DÉCIDER DU MODE ────────────
    //
    // UNE demande par jour, TOUTES surfaces confondues. Sans cette lecture, une
    // question de précision partie à midi (FF-017) et une question de pratique
    // partie à 20h30 font deux demandes dans la journée — obtenues en
    // respectant deux fois une règle qui en interdit une.
    //
    // Elle ne se paie que s'il y a une pratique à servir, et `countDailyAsks`
    // est fail-closed: une lecture en panne rend le plafond ATTEINT, donc un
    // RAPPEL. On perd la question, jamais la voix du coach.
    const askBudgetSpent = chosen
      ? (await countDailyAsks(db, {
        userId: args.userId,
        localDate: args.practiceContext.localDate,
      })).count >= DAILY_ASK_BUDGET
      : true;

    practice = practiceInjectionFor({
      practice: chosen,
      mode: chosen
        ? decidePracticeMode({
          pulseAsks: args.practiceContext.pulseAsks,
          restrictionFlag: args.practiceContext.restrictionFlag,
          askBudgetSpent,
          practiceIgnored: pool.allIgnored,
          practice: chosen,
        })
        : "none",
      isMinor: args.practiceContext.isMinor,
    });
    chosenKey = practice && chosen ? practiceKey(chosen.label) : null;
  } catch (error) {
    return fallback(
      `doctrine_load_failed:${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const system = appendResponseLanguageBlock(
    buildRecapSystemPrompt({ doctrineBlock, facts: args.facts, practice }),
    // La doctrine porte `write in <language>`; le laisser gagner ferait sortir
    // le fait du soir dans une langue que la conversation n'utilise pas. La
    // langue vient de l'appelant — un message de job est un ARTEFACT, il n'a
    // pas de fil sur lequel s'ancrer.
    args.contentLocale,
  );

  let raw: unknown;
  try {
    raw = await Promise.race([
      generateWithGemini(
        system,
        buildRecapUserPrompt(args.firstName),
        // Bas, et plus bas que la relance (0.6): ici le texte porte des
        // CHIFFRES. La fantaisie ne produit pas de la chaleur, elle produit des
        // rejets `invented_number` — donc du repli déterministe, donc moins de
        // voix du coach, pas plus.
        0.4,
        false,
        [],
        "auto",
        { requestId: args.requestId, userId: args.userId, source: "keel_daily_recap" },
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("compose_timeout")), COMPOSE_TIMEOUT_MS)
      ),
    ]);
  } catch (error) {
    return fallback(
      `llm_failed:${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // `generateWithGemini` peut rendre un appel d'outil. On n'en demande aucun;
  // recevoir autre chose qu'une chaîne est une anomalie, pas un cas.
  if (typeof raw !== "string") return fallback("llm_returned_non_text");

  const verdict = acceptComposedRecap(raw, args.facts, practice);
  if (!verdict.ok) return fallback(`rejected:${verdict.reason}:${verdict.detail}`);

  // ── T4 — LA PLACE EST PRISE AVANT QUE LA DEMANDE NE PARTE ───────────────
  //
  // L'ordre est le contrat de `daily_ask_budget.ts`, mot pour mot: « une demande
  // hors compteur rend le plafond décoratif ». La réservation a lieu APRÈS le
  // verdict — une composition refusée ne porte aucune question, donc lui faire
  // consommer une place condamnerait au silence une surface qui, elle, aurait
  // parlé.
  //
  // ⚠️ ÉCHOUER ICI FAIT REPLIER TOUT LE MESSAGE, et c'est délibéré. Le texte
  // composé porte DÉJÀ le point d'interrogation: on ne peut plus le retirer sans
  // réécrire la phrase du modèle. Entre « une demande non comptée » et « un soir
  // sans la voix du coach », c'est la seconde qui est réparable — et la première
  // est exactement l'élève à huit demandes par jour.
  //
  // La clé d'idempotence est la journée locale et pas un message entrant: il n'y
  // en a pas ici. Un rejeu du job le même soir retombe sur `alreadyRecorded` et
  // ne consomme pas une seconde place.
  if (practice?.mode === "ask") {
    const recorded = await recordDailyAsk(db, {
      userId: args.userId,
      localDate: args.practiceContext.localDate,
      kind: "practice_question",
      source: "chat",
      // `axis: null` OBLIGATOIRE: le CHECK conditionnel en base refuse un axe
      // sur tout autre genre que la question de précision.
      axis: null,
      text: verdict.text,
      protocolEventId: null,
      askedForMessageId: `practice:${args.practiceContext.localDate}`,
    });
    if (!recorded.ok) return fallback("ask_record_failed");
  }

  return {
    body: verdict.text,
    source: "composed",
    reason: "",
    practiceMode: practice?.mode ?? "none",
    practiceKey: chosenKey,
  };
}
