// PIVOT NUTRITION §1.3 — reengagement_io.ts.
//
// The tests that carry the doctrine:
//   * "the query and the decider share ONE threshold"
//   * "a doubtful episode read blocks the nudge (fail-closed on spam)"

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  composeReengageBody,
  decideForCandidates,
  KEEL_EPISODE_SOURCE,
  loadReengageCandidates,
  localHourFor,
  type ReengageCandidate,
} from "./reengagement_io.ts";
import {
  REENGAGE_AFTER_HOURS,
  reengageTemplateFor,
  renderReengageNudge,
} from "./reengagement.ts";

const NOW = new Date("2026-08-03T12:00:00.000Z");

function candidate(over: Partial<ReengageCandidate> = {}): ReengageCandidate {
  return {
    userId: "s1",
    phoneNumber: "+447700900001",
    firstName: "Iris",
    lastInboundAt: new Date(NOW.getTime() - 90 * 3600_000).toISOString(),
    localHour: 10,
    timezone: "Europe/Paris",
    hasActivePlan: true,
    optedOut: false,
    nudgedThisEpisode: false,
    lastNudgeAt: null,
    restrictionFlag: false,
    declaredHardWeek: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Une fausse base, juste assez pour que la SÉLECTION soit testable.
//
// Elle existe parce que les tests portaient tous sur `decideForCandidates` — le
// décideur — et aucun sur `loadReengageCandidates`, qui est la couche où
// `restrictionFlag` et `declaredHardWeek` étaient figés à `false`. Le décideur
// avait donc des tests verts pour la garde TCA, et la garde ne mordait sur
// personne. Un test de décideur ne prouve rien du câblage.
// ---------------------------------------------------------------------------
type Rows = Record<string, Array<Record<string, unknown>>>;

function fakeDb(rows: Rows) {
  const builder = (table: string) => {
    const q: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, v: unknown) => {
        q[col] = v;
        return chain;
      },
      gt: () => chain,
      is: () => chain,
      gte: () => chain,
      lte: () => chain,
      order: () => chain,
      limit: () => chain,
      then: (resolve: (r: unknown) => void) => {
        const all = rows[table] ?? [];
        const data = all.filter((r) =>
          Object.entries(q).every(([col, v]) => r[col] === v)
        );
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return chain;
  };
  return { from: (table: string) => builder(table) };
}

const STUDENT = {
  id: "s1",
  phone_number: "+447700900001",
  full_name: "Iris Bell",
  timezone: "Europe/London",
  proactive_muted_at: null,
  keel_role: "student",
};
const SILENT_INBOUND = {
  user_id: "s1",
  role: "user",
  created_at: new Date(NOW.getTime() - 100 * 3600_000).toISOString(),
};
const PUBLISHED_PLAN = { id: "p1", student_id: "s1", status: "published" };

Deno.test("the query and the decider share ONE threshold", async () => {
  // A selection query that pre-cuts at a different number than the decider
  // either burns a scan on candidates it will all refuse, or never presents
  // the ones it would accept. The module must import the constant, not restate
  // it.
  const src = await Deno.readTextFile(new URL("./reengagement_io.ts", import.meta.url));
  assert(src.includes("REENGAGE_AFTER_HOURS"), "the threshold must be imported");
  // And no second number may be hardcoded next to it.
  assert(!/const\s+\w*(CUTOFF|THRESHOLD)\w*\s*=\s*\d/.test(src));
  assertEquals(REENGAGE_AFTER_HOURS, 72);
});

Deno.test("a doubtful episode read blocks the nudge (fail-closed on spam)", () => {
  // `loadReengageCandidates` sets nudgedThisEpisode=true when the episode read
  // failed. The asymmetry is deliberate: one nudge missed beats two in a row.
  const out = decideForCandidates([candidate({ nudgedThisEpisode: true })], NOW);
  assertEquals(out[0].decision.decision, "skip");
  if (out[0].decision.decision === "skip") {
    assertEquals(out[0].decision.reason, "already_nudged_this_episode");
  }
});

Deno.test("an unreadable timezone becomes a quiet hour, never a spam hour", () => {
  assertEquals(localHourFor(NOW, "Europe/Paris"), 14);
  assertEquals(localHourFor(NOW, "America/New_York"), 8);
  assertEquals(localHourFor(NOW, ""), null);
  assertEquals(localHourFor(NOW, "Not/AZone"), null);

  // NaN localHour -> isQuietHour(NaN) === true -> defer, not send.
  const out = decideForCandidates([candidate({ localHour: Number.NaN })], NOW);
  assertEquals(out[0].decision.decision, "defer");
});

Deno.test("a candidate in the clear is armed with a tone", () => {
  const out = decideForCandidates([candidate()], NOW);
  assertEquals(out[0].decision.decision, "send");
  if (out[0].decision.decision === "send") {
    assertEquals(out[0].decision.tone, "gentle");
  }
});

// ---------------------------------------------------------------------------
// Le câblage — les tests qui manquaient
// ---------------------------------------------------------------------------

Deno.test("restriction_flag is READ from the DB, not hardcoded false", async () => {
  // Le défaut exact: `loadReengageCandidates` posait `restrictionFlag: false`
  // en dur pendant qu'un commentaire affirmait qu'il « EST câblé et mord
  // réellement ». Sur le même élève, `keel-weekly-flow-v1` écartait et la
  // relance armait. Un test de décideur ne pouvait pas le voir.
  const db = fakeDb({
    profiles: [STUDENT],
    chat_messages: [SILENT_INBOUND],
    plan_versions: [PUBLISHED_PLAN],
    reengagement_episodes: [],
    weekly_reviews: [{ user_id: "s1", risk_band: "restriction_flag" }],
    student_daily_checkins: [],
  });
  const [c] = await loadReengageCandidates(db, { now: NOW });
  assertEquals(c.restrictionFlag, true);

  const out = decideForCandidates([c], NOW);
  assertEquals(out[0].decision.decision, "skip");
  if (out[0].decision.decision === "skip") {
    assertEquals(out[0].decision.reason, "restriction_flag");
  }
});

Deno.test("a hard week is DECLARED by the student, and two days make a week", async () => {
  // `student_daily_checkins.overall = 'hard'` est une réponse de l'élève à
  // « How was today? ». Un seul jour reste dans la variance d'un rythme normal
  // — même raisonnement que le seuil de 72h.
  const base = {
    profiles: [STUDENT],
    chat_messages: [SILENT_INBOUND],
    plan_versions: [PUBLISHED_PLAN],
    reengagement_episodes: [],
    weekly_reviews: [],
  };
  const hard = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      user_id: "s1",
      overall: "hard",
      local_date: `2026-07-3${i}`,
    }));

  const [one] = await loadReengageCandidates(
    fakeDb({ ...base, student_daily_checkins: hard(1) }),
    { now: NOW },
  );
  assertEquals(one.declaredHardWeek, false, "un seul mauvais jour n'est pas une semaine");
  assertEquals(
    (decideForCandidates([one], NOW)[0].decision as { tone?: string }).tone,
    "gentle",
  );

  const [two] = await loadReengageCandidates(
    fakeDb({ ...base, student_daily_checkins: hard(2) }),
    { now: NOW },
  );
  assertEquals(two.declaredHardWeek, true);
  assertEquals(
    (decideForCandidates([two], NOW)[0].decision as { tone?: string }).tone,
    "lighter",
    "`lighter` doit être ATTEIGNABLE — il ne l'était pas",
  );
});

Deno.test("the first name is the FIRST name, never the full name", async () => {
  // Deux incidents de `{{1}}` mal câblé dans ce dépôt: un template qui disait
  // « Hello Thomas » à tout le monde, un bilan hebdo rempli avec le mauvais
  // champ. `{{1}}` ouvre la phrase — « Hi Iris Bell - … » n'est pas la même
  // chose que « Hi Iris - … ».
  const db = fakeDb({
    profiles: [STUDENT],
    chat_messages: [SILENT_INBOUND],
    plan_versions: [PUBLISHED_PLAN],
    reengagement_episodes: [],
    weekly_reviews: [],
    student_daily_checkins: [],
  });
  const [c] = await loadReengageCandidates(db, { now: NOW });
  assertEquals(c.firstName, "Iris");
  assertEquals(c.phoneNumber, "+447700900001");
});

Deno.test("DE-WHATSAPP: la relance part avec le corps EXACT qu'on a rendu", async () => {
  // ── CE TEST EST LE DESCENDANT DE « the nudge goes as a TEMPLATE » ─────────
  // L'ancêtre exigeait un template NOMMÉ, parce qu'à 72 h la fenêtre 24 h de
  // Meta est fermée par construction et qu'un purpose non mappé tombait sur
  // `global_reach_template` (« J'ai une info pour toi », en français) —
  // l'incident du 2026-07-12.
  //
  // Le TRANSPORT de cette exigence est mort avec Meta. Le CONCEPT survit, et
  // c'est lui qu'on teste ici: **ce que l'élève lit est exactement ce que la
  // ceinture a vérifié**, jamais un contenu choisi par une couche d'envoi.
  const src = await Deno.readTextFile(
    new URL("./reengagement_io.ts", import.meta.url),
  );
  const send = src.slice(
    src.indexOf("export async function sendReengageNudge"),
    src.indexOf("export async function closeKeelReengagementEpisodeOnInbound"),
  );

  // 1. La ceinture tourne AVANT la livraison, sur le corps réel.
  const beltAt = send.indexOf("assertNoGuiltTripping(body)");
  const deliverAt = send.indexOf("deliverChatMessage");
  assert(beltAt > 0, "la ceinture anti-culpabilisation doit tourner");
  assert(
    beltAt < deliverAt,
    "la ceinture doit mordre AVANT l'envoi, pas après",
  );

  // 2. Le corps livré EST celui qu'elle a vérifié — pas une variante.
  assert(
    /content:\s*body\b/.test(send),
    "le contenu livré doit être exactement `body`",
  );

  // 3. Plus aucune couche d'envoi ne peut substituer un contenu: ni template
  //    nommé, ni repli générique, ni composant Meta.
  //
  //    Les COMMENTAIRES sont retirés avant l'examen. Sans ça, la garde mordait
  //    sur l'en-tête qui EXPLIQUE que les templates sont morts — un test qui
  //    interdit de documenter ce qu'il vérifie finit par se faire désarmer.
  const code = send
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
  for (const forbidden of ["template", "global_reach", "components", "sendKeelWhatsApp"]) {
    assert(
      !code.includes(forbidden),
      `la relance ne doit plus rien savoir de « ${forbidden} »`,
    );
  }
});

Deno.test("the template body is what the belt actually checks", () => {
  // La ceinture n'avait AUCUN appelant de production: le seul texte qui part
  // vit chez Meta. Cette copie locale existe pour lui donner prise — donc elle
  // doit rester le corps réel de `keel_reengage_v1` (META-TEMPLATES.md §3).
  assertEquals(
    renderReengageNudge("Julie"),
    "Hi Julie - no rush, just checking in. How is the week going?",
  );
  // Paramètre vide: jamais « Hi , ».
  assert(!renderReengageNudge("").includes("Hi ,"));
  assert(renderReengageNudge("  ").includes("there"));
});

Deno.test("a tone the job cannot deliver is REPORTED, not silently dropped", () => {
  const noLighter = (n: string) =>
    n === "WHATSAPP_KEEL_REENGAGE_TEMPLATE_NAME_LIGHTER" ? "" : undefined;
  assertEquals(reengageTemplateFor("gentle", noLighter).toneDelivered, true);
  // `lighter` est décidé et écrit au ledger, mais tombe sur le template
  // `gentle` tant que Meta n'en a pas approuvé un second. Le job compte l'écart
  // (`tone_not_delivered`) au lieu de laisser croire que le ton est parti.
  const lighter = reengageTemplateFor("lighter", noLighter);
  assertEquals(lighter.toneDelivered, false);
  assertEquals(lighter.name, "keel_reengage_v1");

  const withTemplate = (n: string) =>
    n === "WHATSAPP_KEEL_REENGAGE_TEMPLATE_NAME_LIGHTER"
      ? "keel_reengage_lighter_v1"
      : undefined;
  assertEquals(reengageTemplateFor("lighter", withTemplate).toneDelivered, true);
});

Deno.test("an episode carries its producer, and dates its touch only after the send", async () => {
  const src = await Deno.readTextFile(
    new URL("./reengagement_io.ts", import.meta.url),
  );
  const open = src.slice(
    src.indexOf("export async function openReengagementEpisode"),
    src.indexOf("export const KEEL_EPISODE_SOURCE"),
  );
  assertEquals(KEEL_EPISODE_SOURCE, "keel_reengage");
  assert(open.includes("source: KEEL_EPISODE_SOURCE"));
  // `touch1_sent_at` posé à l'ouverture affirmait qu'un message était parti
  // avant tout envoi — y compris quand il ne partait jamais.
  assert(
    !/touch1_sent_at:\s*args\.at/.test(open),
    "la touche ne se date qu'une fois l'envoi accepté",
  );

  const close = src.slice(
    src.indexOf("export async function closeKeelReengagementEpisodeOnInbound"),
  );
  // Le closer KEEL ne doit fermer QUE ses épisodes: le winback legacy escalade
  // sur trois touches et referme les siens en lisant le contenu de la réponse.
  assert(close.includes('.eq("source", KEEL_EPISODE_SOURCE)'));
  assert(close.includes('.is("closed_at", null)'));
});

// ---------------------------------------------------------------------------
// LA VOIX DU COACH, ET SON REPLI
//
// La relance était le SEUL message du produit composé nulle part: un texte figé,
// parce que Meta imposait un template hors fenêtre 24 h. La contrainte est
// partie avec Meta et l'écart lui a survécu six semaines. Ces tests portent la
// propriété qui compte maintenant: **le repli existe, il part, et il se
// NOMME.** Un composeur qui ne sert jamais et un composeur qui marche
// produisent le même envoi réussi — c'est exactement la panne que ce dépôt a
// déjà payée avec `toneDelivered`.
// ---------------------------------------------------------------------------

/**
 * Une base qui répond correctement, et qui n'a rien à dire.
 *
 * Distincte de `fakeDb` EXPRÈS: `fakeDb` ne connaît pas `.maybeSingle()`, donc
 * il éprouve le cas « la lecture explose ». Celle-ci éprouve le cas nominal —
 * l'élève n'a pas de coach — et les deux doivent produire le même repli, par
 * deux chemins différents. Les confondre laisserait un des deux sans test.
 */
function emptyDoctrineDb() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    gt: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (r: unknown) => void) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return { from: () => chain };
}

Deno.test("pas de coach ⇒ repli, sans jamais consulter le modèle", async () => {
  // Il n'y a pas de voix à porter: un appel de modèle paierait pour réécrire un
  // texte figé, en moins bien et sans le déterminisme qui allait avec. Le test
  // tourne d'ailleurs sans réseau joignable — un appel produirait une erreur
  // dans le motif au lieu de `no_doctrine`.
  const out = await composeReengageBody(emptyDoctrineDb(), {
    userId: "s1",
    firstName: "Iris",
    tone: "gentle",
  });

  assertEquals(out.source, "fallback");
  assertEquals(out.body, renderReengageNudge("Iris"));
  assert(
    out.reason.startsWith("no_doctrine:"),
    `motif inattendu: ${out.reason}`,
  );
});

Deno.test("une lecture de doctrine qui explose ne fait pas taire la relance", async () => {
  // `fakeDb` ne sait pas répondre à `.maybeSingle()`. Le chargeur est fail-soft
  // (il journalise et rend `no_coach`), et ce test épingle la conséquence qui
  // nous intéresse: la boucle de décrochage garde son message. Une panne de
  // lecture côté COACH ne doit jamais coûter le message à l'ÉLÈVE.
  const out = await composeReengageBody(fakeDb({}), {
    userId: "s1",
    firstName: "Iris",
    tone: "gentle",
  });

  assertEquals(out.source, "fallback");
  assertEquals(out.body, renderReengageNudge("Iris"));
  // LE MOTIF EST OBLIGATOIRE. Un repli muet est indiscernable d'une réussite,
  // et c'est comme ça qu'on découvre six semaines plus tard que la voix du
  // coach n'a jamais porté.
  assert(out.reason.length > 0, "un repli doit toujours nommer sa cause");
});

Deno.test("l'ordre est composer → ceinture → livrer, et il n'est pas commutatif", async () => {
  // Même famille que « la relance part avec le corps EXACT qu'on a rendu »: ce
  // qui est vérifié ici est un ORDRE, et un ordre ne se teste pas en observant
  // une sortie. Composer APRÈS la ceinture ferait passer un texte que personne
  // n'a inspecté; livrer avant la ceinture la rendrait décorative.
  const src = await Deno.readTextFile(
    new URL("./reengagement_io.ts", import.meta.url),
  );
  const send = src.slice(
    src.indexOf("export async function sendReengageNudge"),
    src.indexOf("export async function closeKeelReengagementEpisodeOnInbound"),
  );
  const composeAt = send.indexOf("composeReengageBody(db, args)");
  const beltAt = send.indexOf("assertNoGuiltTripping(body)");
  const deliverAt = send.indexOf("deliverChatMessage");

  assert(composeAt > 0, "la relance doit passer par le composeur");
  assert(composeAt < beltAt, "la ceinture doit inspecter le texte COMPOSÉ");
  assert(beltAt < deliverAt, "la ceinture doit mordre avant l'envoi");
});

Deno.test("the gates still apply through the IO layer", () => {
  const cases: Array<[Partial<ReengageCandidate>, string]> = [
    [{ optedOut: true }, "opted_out"],
    [{ hasActivePlan: false }, "no_active_plan"],
    [{ restrictionFlag: true }, "restriction_flag"],
    [{ lastInboundAt: new Date(NOW.getTime() - 3600_000).toISOString() }, "recent_contact"],
  ];
  for (const [patch, expected] of cases) {
    const out = decideForCandidates([candidate(patch)], NOW);
    assertEquals(out[0].decision.decision, "skip", expected);
    if (out[0].decision.decision === "skip") {
      assertEquals(out[0].decision.reason, expected);
    }
  }
});
