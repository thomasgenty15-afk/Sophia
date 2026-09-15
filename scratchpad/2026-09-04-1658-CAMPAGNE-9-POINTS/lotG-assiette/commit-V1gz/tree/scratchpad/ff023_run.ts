/**
 * FF-023 — RUN RÉEL. La conversation normale (la continuité).
 *
 * Vrai modèle, vraie base locale, vrais élèves provisionnés (plan publié).
 * Chaque scénario tourne sur un élève NEUF. On relit le texte VISIBLE en base,
 * l'historique effectivement passé au tour (log edge `chat_inbound_history_*`)
 * et les blocs de contexte du tour (`memory_observability_events`, lus AVANT
 * le cleanup — la FK `ON DELETE CASCADE` les emporte avec l'utilisateur).
 *
 * Usage :
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     deno run -A scratchpad/ff023_run.ts <groupe> [repeats]
 *   groupes: easy | medium | hard | extra | all
 */
import {
  admin,
  cleanup,
  type Coach,
  makeCoach,
  makeStudent,
  publishPlanFor,
  rows,
  type Student,
  transcript,
  turn,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

const GROUP = (Deno.args[0] ?? "easy").trim();
const REPEATS = Number(Deno.args[1] ?? "3");

const DOCTRINE = {
  beliefs: [
    { claim: "Every meal is built on a protein anchor.", rationale: null },
    { claim: "Vegetables are the volume of the plate, not the garnish.", rationale: null },
  ],
  forbidden: [
    {
      token: "count_calories",
      surface_forms: ["count calories", "counting calories", "compter les calories"],
      reason: "numbers turn food into a score",
      instead: "We build the plate: a protein anchor, vegetables for volume.",
    },
  ],
  vocabulary: [{ term: "anchor meal", meaning: "the protein base of a plate" }],
  arbitrations: [],
  voice: { tone: "Direct, warm, never preachy." },
  foods: { recommended: [], discouraged: [] },
};

async function coachWithDoctrine(locale: string): Promise<Coach> {
  const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
  const { error } = await admin().from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    ...DOCTRINE,
    content_locale: locale.startsWith("fr") ? "fr" : "en",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  if (error) throw error;
  return coach;
}

async function newStudent(locale: string): Promise<{ coach: Coach; student: Student }> {
  const coach = await coachWithDoctrine(locale);
  const student = await makeStudent({
    coach,
    timezone: locale.startsWith("fr") ? "Europe/Paris" : "Europe/London",
    country: locale.startsWith("fr") ? "FR" : "GB",
    locale,
    fullName: "Sam",
  });
  await publishPlanFor(coach, student.userId);
  return { coach, student };
}

/** Les blocs de contexte VRAIMENT portés par les tours de cet élève. */
async function contextElements(userId: string): Promise<string[]> {
  return await rows(
    `select created_at, payload->>'elements_loaded', payload->>'estimated_tokens'
       from memory_observability_events
      where user_id='${userId}' and source_component='context_loader'
      order by created_at asc`,
  ).catch((e) => [`<${e.message}>`]);
}

type Case = {
  id: string;
  level: "easy" | "medium" | "hard" | "extra";
  locale: string;
  /** Les tours joués, dans l'ordre. */
  messages: string[];
  /**
   * Tokens attendus (au moins un) dans la réponse au dernier tour — la preuve
   * que le fil a été porté. Comparaison insensible à la casse/accents.
   *
   * ⚠️ BILINGUES PAR CONSTRUCTION. Cicatrice `reply-language-ignores-voice-
   * language` (T-2): un élève `fr-FR` reçoit encore des réponses en anglais.
   * Une liste de tokens uniquement français ferait donc lire un défaut de
   * LANGUE comme un défaut de CONTINUITÉ — ce qui est exactement le genre de
   * faux rouge qu'un rapport ne doit pas produire.
   */
  expectAny?: string[];
  /** Tokens INTERDITS dans la dernière réponse (confabulation). */
  forbidAll?: string[];
  /**
   * DÉRIVE: des tokens dont la présence prouve que la réponse a inventé un
   * sujet. C'est la forme EXACTE du RED de référence mesuré avant le
   * correctif — « About the lunch setup: … » sur une conversation qui parlait
   * du déménagement d'un frère.
   */
  driftTokens?: string[];
  note?: string;
};

/** La dérive alimentaire par défaut, pour les scénarios NON alimentaires. */
const FOOD_DRIFT = [
  "lunch setup",
  "your lunch",
  "the lunch",
  "protein anchor",
  "anchor meal",
  "the plate rule",
  "ton dejeuner",
  "ton déjeuner",
];

const CASES: Case[] = [
  // ── EASY : le cas nominal de la fiche ────────────────────────────────────
  {
    id: "E1-anaphore-EN",
    level: "easy",
    locale: "en-US",
    messages: [
      "My brother is moving to Lisbon next month and I'm the one helping him pack.",
      "and so, what do you think about it?",
    ],
    expectAny: [
      "lisbon", "brother", "moving", "move", "pack", "box", "relocat",
      "sibling",
    ],
    driftTokens: FOOD_DRIFT,
  },
  {
    id: "E2-anaphore-FR",
    level: "easy",
    locale: "fr-FR",
    messages: [
      "Mon frère déménage à Lisbonne le mois prochain et c'est moi qui l'aide à faire les cartons.",
      "et du coup, t'en penses quoi ?",
    ],
    expectAny: [
      "lisbonne", "lisbon", "frère", "frere", "brother", "déménag", "demenag",
      "moving", "move", "carton", "box", "pack",
    ],
    driftTokens: FOOD_DRIFT,
  },

  // ── MEDIUM : variantes ───────────────────────────────────────────────────
  {
    id: "M1-sonde-tour4-EN",
    level: "medium",
    locale: "en-US",
    messages: [
      "Quick thing: I work night shifts on Tuesdays and Thursdays.",
      "Anyway, the weather has been awful this week.",
      "I finally finished that book I was reading.",
      "Remind me — which days did I say were hard for me?",
    ],
    expectAny: ["tuesday", "thursday", "night"],
  },
  {
    id: "M2-sonde-tour8-FR",
    level: "medium",
    locale: "fr-FR",
    messages: [
      "Petite info : je travaille de nuit le mardi et le jeudi.",
      "Sinon il a plu toute la semaine.",
      "J'ai enfin fini mon bouquin.",
      "Mon chat a encore renversé une plante.",
      "Le week-end approche, ça fait du bien.",
      "J'ai repris le vélo lundi.",
      "Ma sœur vient dîner samedi.",
      "Rappelle-moi : quels jours je t'avais dit que c'était compliqué ?",
    ],
    expectAny: ["mardi", "jeudi", "nuit", "tuesday", "thursday", "night"],
  },
  {
    id: "M3-contradiction-EN",
    level: "medium",
    locale: "en-US",
    messages: [
      "I never eat breakfast, it's just not for me.",
      "Actually I do have breakfast every morning now, eggs usually.",
      "So what would you suggest for tomorrow morning?",
    ],
    // On croit le PRÉSENT, sans faire remarquer la contradiction.
    expectAny: ["egg", "breakfast", "morning"],
    forbidAll: [
      "you said you never",
      "you told me you never",
      "contradict",
      "earlier you said",
    ],
  },

  // ── HARD : les modes de défaillance de §7 ────────────────────────────────
  {
    id: "H1-hors-fenetre-EN",
    level: "hard",
    locale: "en-US",
    messages: [
      "__SEEDED_OLD__",
      // Un tour FRAIS est indispensable: `filterFreshMessages` garde toujours
      // le DERNIER échange, même vieux (plancher de continuité). Sans un tour
      // récent, l'échange de J-3 EST le dernier échange et reste injecté — le
      // scénario ne testerait alors rien du tout.
      "hey, quick one",
      "what was that odd story I told you a few days back?",
    ],
    note: "échange semé à J-3 + un tour frais ⇒ le vieux tombe hors fenêtre",
    forbidAll: ["scaffolding", "trombone", "reykjavik", "church"],
  },
  {
    id: "H2-photo-au-milieu-EN",
    level: "hard",
    locale: "en-US",
    messages: [
      "I've been stressed about a work presentation on Friday.",
      "__PHOTO__",
      "and so, about the presentation — any thoughts?",
    ],
    expectAny: ["presentation", "friday", "stress"],
  },

  // ── EXTRA-HARD : combinaisons ────────────────────────────────────────────
  {
    id: "X1-planchers-dans-le-fil-EN",
    level: "extra",
    locale: "en-US",
    messages: [
      "I had grilled chicken and broccoli for lunch.",
      "I weighed myself this morning, 78 kg.",
      "I really can't stand cooked mushrooms, by the way.",
      "so, going back to my lunch — was that alright?",
    ],
    expectAny: ["chicken", "broccoli", "lunch"],
  },
  {
    id: "X2-sujet-non-tranche-EN",
    level: "extra",
    locale: "en-US",
    messages: [
      "My cousin says creatine is a must. Does my coach have a view on supplements?",
    ],
    // Le coach n'a rien dit sur les compléments → l'agent doit le DIRE.
    expectAny: [
      "hasn't",
      "has not",
      "no view",
      "nothing",
      "not covered",
      "did not",
      "didn't",
      "own",
      "my own",
    ],
  },
];

/**
 * ⚠️ L'APOSTROPHE TYPOGRAPHIQUE EST UNE CICATRICE DU DÉPÔT, ET CE GRADEUR L'A
 * REJOUÉE. Le modèle écrit « hasn’t » (U+2019); un token « hasn't » (U+0027) ne
 * matche pas, et trois réponses PARFAITES ont été comptées AMBER. Même famille
 * exacte que `guard-tested-in-one-language-only`: une garde qui ne mord pas sur
 * la forme réellement produite est une garde désarmée — y compris quand la
 * « garde » est le gradeur.
 */
function norm(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[‘’ʼ`]/g, "'")
    .toLowerCase();
}

const out: string[] = [];
const say = (s: string) => {
  console.log(s);
  out.push(s);
};

/** Sème un échange VIEUX de 3 jours directement en base (hors fenêtre 12 h). */
async function seedOldExchange(userId: string) {
  const db = admin();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  await db.from("chat_messages").insert([
    {
      user_id: userId,
      scope: "app",
      role: "user",
      content:
        "By the way, I once climbed the scaffolding of a church in Reykjavik holding a trombone.",
      created_at: new Date(threeDaysAgo.getTime()).toISOString(),
      metadata: { channel: "in_app", kind: "text" },
    },
    {
      user_id: userId,
      scope: "app",
      role: "assistant",
      content: "That is a story. Noted.",
      created_at: new Date(threeDaysAgo.getTime() + 60_000).toISOString(),
      metadata: { channel: "in_app" },
    },
  ] as never);
}

/** Simule le passage PHOTO: les deux lignes que `meal-photo-upload-v1` écrit. */
async function seedPhotoExchange(userId: string) {
  const db = admin();
  const now = Date.now();
  await db.from("chat_messages").insert([
    {
      user_id: userId,
      scope: "app",
      role: "user",
      content: "[photo]",
      created_at: new Date(now).toISOString(),
      metadata: {
        channel: "in_app",
        kind: "media",
        media_ref: { path: "ff023/fake.jpg", content_type: "image/jpeg", size_bytes: 1 },
      },
    },
    {
      user_id: userId,
      scope: "app",
      role: "assistant",
      content: "Saved — that looks like chicken and rice. Logged against lunch.",
      created_at: new Date(now + 1000).toISOString(),
      metadata: { channel: "in_app", purpose: "keel_meal_photo_ack" },
    },
  ] as never);
}

const selected = CASES.filter((c) =>
  GROUP === "all" ? true : c.level === GROUP || c.id.startsWith(GROUP)
);
if (selected.length === 0) throw new Error(`aucun cas pour « ${GROUP} »`);

type Verdict = { id: string; run: number; verdict: string; proof: string };
const verdicts: Verdict[] = [];

for (const testCase of selected) {
  for (let run = 1; run <= REPEATS; run++) {
    const { coach, student } = await newStudent(testCase.locale);
    say(`\n${"=".repeat(78)}`);
    say(`▌ ${testCase.id} — run ${run}/${REPEATS} — élève ${student.userId}`);
    if (testCase.note) say(`▌ ${testCase.note}`);
    say("=".repeat(78));

    let lastReply = "";
    for (const message of testCase.messages) {
      if (message === "__SEEDED_OLD__") {
        await seedOldExchange(student.userId);
        say("SEED   : échange de J-3 inséré en base (hors fenêtre)");
        continue;
      }
      if (message === "__PHOTO__") {
        await seedPhotoExchange(student.userId);
        say("SEED   : échange PHOTO inséré (user [photo] + accusé assistant)");
        continue;
      }
      const t0 = Date.now();
      const r = await turn(student, message);
      lastReply = r.reply ?? "";
      say(`\nÉLÈVE  (${Date.now() - t0} ms, HTTP ${r.status}) : ${message}`);
      say(`SOPHIA : ${r.reply ?? "‼️ AUCUNE RÉPONSE ÉCRITE"}`);
    }

    // ── LE GRADEUR EST À DEUX ÉTAGES, ET C'EST DÉLIBÉRÉ ──────────────────
    //
    // Un gradeur lexical simple sur « la réponse porte sur ce que la personne
    // a raconté » produit des FAUX ROUGES: une réponse parfaitement ancrée
    // peut ne renommer aucun mot du sujet (« un casse-tête pratique, pas
    // dramatique: beaucoup de petites décisions et un délai »). La juger
    // rouge ferait passer une continuité qui marche pour une continuité
    // cassée — et un rapport qui compte ça comme un défaut est un rapport
    // faux.
    //
    // Donc: DÉRIVE = rouge sans appel (le modèle parle d'un sujet inventé,
    // c'est la confabulation, le RED le plus grave de la fiche). Ancrage
    // lexical absent SANS dérive = AMBER, jugé à la main et consigné comme
    // tel dans le rapport.
    const normalized = norm(lastReply);
    const hit = (testCase.expectAny ?? []).filter((t) => normalized.includes(norm(t)));
    const bad = (testCase.forbidAll ?? []).filter((t) => normalized.includes(norm(t)));
    const drift = (testCase.driftTokens ?? []).filter((t) => normalized.includes(norm(t)));
    const expectOk = !testCase.expectAny || hit.length > 0;
    const verdict = (bad.length > 0 || drift.length > 0)
      ? "RED"
      : expectOk
      ? "GREEN"
      : "AMBER";
    say(
      `\nVERDICT: ${verdict}  (ancrage: [${hit.join(", ")}]` +
        `${bad.length ? ` · INTERDITS: [${bad.join(", ")}]` : ""}` +
        `${drift.length ? ` · DÉRIVE: [${drift.join(", ")}]` : ""})`,
    );

    const elements = await contextElements(student.userId);
    for (const line of elements) say(`CTX    : ${line}`);
    const thread = await transcript(student.userId);
    say(`FIL    : ${thread.length} lignes chat_messages`);

    verdicts.push({
      id: testCase.id,
      run,
      verdict,
      proof: `${elements.length} tours de contexte · fil ${thread.length} lignes · reply="${lastReply.slice(0, 140).replace(/\n/g, " ")}"`,
    });

    await cleanup(student.userId);
    await cleanup(coach.userId).catch(() => {});
  }
}

say(`\n${"=".repeat(78)}`);
say("RÉCAPITULATIF");
say("=".repeat(78));
for (const v of verdicts) say(`${v.verdict.padEnd(6)} ${v.id} run${v.run} — ${v.proof}`);
const reds = verdicts.filter((v) => v.verdict === "RED");
const ambers = verdicts.filter((v) => v.verdict === "AMBER");
say(
  `\n${verdicts.length - reds.length - ambers.length}/${verdicts.length} GREEN, ` +
    `${ambers.length} AMBER (à juger), ${reds.length} RED`,
);

await Deno.writeTextFile(
  new URL(`./ff023-${GROUP}.txt`, import.meta.url),
  out.join("\n") + "\n",
);
await Deno.writeTextFile(
  new URL(`./ff023_${GROUP}_results.json`, import.meta.url),
  JSON.stringify(verdicts, null, 2),
);
console.log(`\n→ écrit scratchpad/ff023-${GROUP}.txt`);
