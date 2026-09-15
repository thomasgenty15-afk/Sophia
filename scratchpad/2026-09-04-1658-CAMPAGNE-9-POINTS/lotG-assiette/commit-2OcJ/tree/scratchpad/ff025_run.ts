/**
 * FF-025 — RUN RÉEL. Vrai modèle, vraie base locale, élèves provisionnés.
 *
 *   deno run -A scratchpad/ff025_run.ts <suite> [repeats]
 *
 * suites: easy | medium | hard | extra | adv | all
 *
 * ⚠️ Un élève NEUF par (cas × répétition): un élève réutilisé fait classer le
 * 2ᵉ envoi comme une réponse au flow de précision du 1ᵉʳ (cicatrice FF-009 §3),
 * et surtout le BUDGET du jour est par élève — deux cas sur le même élève se
 * ferment l'un l'autre, ce qui est le comportement voulu mais rend les cas
 * indépendants intestables.
 * Plafond: 3 élèves par coach → un coach neuf tous les 3 élèves.
 */
import {
  admin,
  callAs,
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  rows,
  sql,
  turn,
  type Coach,
  type Student,
} from "../docs/nutrition-pivot/qa-web/harness.ts";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const PREFIX = "ff025";
const out: string[] = [];
const say = (s: string) => {
  console.log(s);
  out.push(s);
};

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

let coach: Coach | null = null;
let seats = 0;
const madeStudents: string[] = [];

async function freshStudent(
  opts: { locale?: string; timezone?: string } = {},
): Promise<Student> {
  if (!coach || seats >= 3) {
    coach = await makeCoach({ displayName: `FF025 Coach`, country: "GB" });
    seats = 0;
  }
  seats += 1;
  const student = await makeStudent({
    coach,
    locale: opts.locale ?? "en-US",
    timezone: opts.timezone ?? "Europe/London",
    fullName: `${PREFIX} Student`,
  });
  await publishPlanFor(coach, student.userId, {
    timezone: opts.timezone ?? "Europe/London",
  });
  madeStudents.push(student.userId);
  return student;
}

async function ledger(userId: string): Promise<string[]> {
  return await rows(
    `select ask_kind || ' | ' || source || ' | ' || coalesce(axis,'-') || ' | ' ||
            coalesce(protocol_event_id::text,'-') || ' | ' || question
       from meal_precision_questions where user_id='${userId}' order by asked_at`,
  );
}

async function events(userId: string): Promise<string[]> {
  return await rows(
    `select coalesce(plan_relation,'NULL') || ' | ' || coalesce(food_group_ref,'-') || ' | ' ||
            source || ' | ' || (media_path is not null)::text || ' | ' ||
            coalesce(disqualified_reason,'-') || ' | ' || coalesce(portion_band,'-')
       from protocol_events where user_id='${userId}' order by created_at`,
  );
}

/** Les phrases livrées, telles quelles. Une comparaison de chaîne, pas une heuristique. */
const INVITES = {
  en_bare: "If you have a photo of it, send it over — it helps the tracking.",
  en_edu:
    "If you have a photo of it, send it over: even a rough one tells me more than a description, and if you don't, no worries.",
  fr_bare: "Si tu as une photo, envoie-la — ça aide le suivi.",
  fr_edu:
    "Si tu as une photo, envoie-la : même approximative, elle m'en dit plus qu'une description, et sinon aucun souci.",
};

function inviteIn(reply: string | null): "edu" | "bare" | "none" {
  const t = String(reply ?? "");
  if (t.includes(INVITES.en_edu) || t.includes(INVITES.fr_edu)) return "edu";
  if (t.includes(INVITES.en_bare) || t.includes(INVITES.fr_bare)) return "bare";
  return "none";
}

// ---------------------------------------------------------------------------
// Cas
// ---------------------------------------------------------------------------

type Case = {
  id: string;
  level: "easy" | "medium" | "hard" | "extra" | "adv";
  run: () => Promise<string>;
};

async function oneTurnCase(
  label: string,
  message: string,
  expect: "invite" | "silent",
  opts: { locale?: string } = {},
): Promise<string> {
  const s = await freshStudent(opts);
  const r = await turn(s, message);
  const inv = inviteIn(r.reply);
  const led = await ledger(s.userId);
  const evs = await events(s.userId);
  const ok = expect === "invite" ? inv !== "none" : inv === "none";
  return [
    `${ok ? "🟢" : "🔴"} ${label}`,
    `    invite=${inv} attendu=${expect}`,
    `    ledger=${JSON.stringify(led)}`,
    `    events=${JSON.stringify(evs)}`,
    `    reply=${JSON.stringify(String(r.reply ?? "").slice(0, 260))}`,
  ].join("\n");
}

const CASES: Case[] = [
  // ── EASY ────────────────────────────────────────────────────────────────
  {
    id: "E1",
    level: "easy",
    run: () => oneTurnCase("E1 « j'ai commandé une pizza » → UNE invitation", "j'ai commandé une pizza", "invite", { locale: "fr-FR" }),
  },
  {
    id: "E2",
    level: "easy",
    run: () => oneTurnCase("E2 « I ordered a pizza » → UNE invitation", "I ordered a pizza", "invite"),
  },

  // ── MEDIUM ──────────────────────────────────────────────────────────────
  {
    id: "M1",
    level: "medium",
    run: () => oneTurnCase("M1 EN « I ordered takeout last night »", "I ordered takeout last night", "invite"),
  },
  {
    id: "M2",
    level: "medium",
    run: () => oneTurnCase("M2 FR « on a mangé au resto hier »", "on a mangé au resto hier", "invite", { locale: "fr-FR" }),
  },
  {
    id: "M2b",
    level: "medium",
    run: async () => {
      // R7, CÔTÉ RENDU — et le résultat est une CONSTATATION, pas un verdict
      // sur FF-025. `_shared/keel/locale.ts:28` porte
      // `PILOT_FORCED_LOCALE = "en-US"`, une épingle fleet-wide qui court-circuite
      // TOUTE la chaîne de priorité. On ANCRE donc le fil en français exactement
      // comme le produit le fait lui-même, et on regarde ce qui sort.
      const s = await freshStudent({ locale: "fr-FR", timezone: "Europe/Paris" });
      await turn(s, "bonjour");
      await sql(
        `update user_chat_states set temp_memory = jsonb_set(temp_memory, '{conversation_locale}', '"fr-FR"') where user_id='${s.userId}'`,
      );
      const anchored = await rows(
        `select temp_memory->>'conversation_locale' from user_chat_states where user_id='${s.userId}'`,
      );
      const r = await turn(s, "j'ai commandé une pizza ce soir");
      const inv = inviteIn(r.reply);
      const french = String(r.reply ?? "").includes("Si tu as une photo");
      const after = await rows(
        `select temp_memory->>'conversation_locale' from user_chat_states where user_id='${s.userId}'`,
      );
      return [
        `ℹ️  M2b R7 côté rendu — l'épingle pilote décide, pas le fil`,
        `    ancre_avant=${JSON.stringify(anchored)} ancre_apres=${JSON.stringify(after)}`,
        `    invite=${inv} phraseFR=${french} (attendu false tant que PILOT_FORCED_LOCALE='en-US')`,
        `    reply=${JSON.stringify(String(r.reply ?? "").slice(0, 200))}`,
      ].join("\n");
    },
  },
  {
    id: "M3",
    level: "medium",
    run: async () => {
      // La personne répond « non »: RIEN, et aucune trace dans les réponses
      // suivantes.
      const s = await freshStudent();
      const t1 = await turn(s, "I ordered a pizza");
      const inv1 = inviteIn(t1.reply);
      const t2 = await turn(s, "no");
      const t3 = await turn(s, "what should I cook tomorrow?");
      const mentions = [t2.reply, t3.reply].map((r) =>
        /photo|picture|snap|image/i.test(String(r ?? ""))
      );
      const ok = inv1 !== "none" && !mentions[0] && !mentions[1];
      return [
        `${ok ? "🟢" : "🔴"} M3 « non » → rien, et zéro mention ensuite`,
        `    invite1=${inv1} mentionsPhoto=[${mentions.join(",")}]`,
        `    t2=${JSON.stringify(String(t2.reply ?? "").slice(0, 200))}`,
        `    t3=${JSON.stringify(String(t3.reply ?? "").slice(0, 200))}`,
      ].join("\n");
    },
  },

  // ── HARD ────────────────────────────────────────────────────────────────
  {
    id: "H1",
    level: "hard",
    run: async () => {
      // Deux hors-plans le même jour → UNE seule invitation.
      const s = await freshStudent();
      const t1 = await turn(s, "I ordered a pizza");
      const t2 = await turn(s, "we ate out at a restaurant tonight");
      const led = await ledger(s.userId);
      const invites = led.filter((l) => l.startsWith("photo_invitation")).length;
      const ok = inviteIn(t1.reply) !== "none" && inviteIn(t2.reply) === "none" &&
        invites === 1;
      return [
        `${ok ? "🟢" : "🔴"} H1 deux hors-plans le même jour → UNE invitation`,
        `    inv1=${inviteIn(t1.reply)} inv2=${inviteIn(t2.reply)} lignes_invitation=${invites}`,
        `    ledger=${JSON.stringify(led)}`,
        `    events=${JSON.stringify(await events(s.userId))}`,
        `    reply2=${JSON.stringify(String(t2.reply ?? ""))}`,
      ].join("\n");
    },
  },
  {
    id: "H2",
    level: "hard",
    run: async () => {
      // Question de précision DÉJÀ POSÉE aujourd'hui → aucune invitation.
      // Le budget est partagé: on le consomme par la porte de FF-017.
      const s = await freshStudent();
      const t1 = await turn(s, "I had chicken for lunch");
      const ledA = await ledger(s.userId);
      const t2 = await turn(s, "and then I ordered a pizza tonight");
      const ledB = await ledger(s.userId);
      const askedFirst = ledA.length;
      const invites = ledB.filter((l) => l.startsWith("photo_invitation")).length;
      const ok = askedFirst >= 1 && invites === 0 && inviteIn(t2.reply) === "none";
      return [
        `${ok ? "🟢" : "🔴"} H2 budget déjà consommé par la question de précision`,
        `    demandes_apres_t1=${askedFirst} invitations=${invites} inv2=${inviteIn(t2.reply)}`,
        `    ledger=${JSON.stringify(ledB)}`,
        `    events=${JSON.stringify(await events(s.userId))}`,
      ].join("\n");
    },
  },
  {
    id: "H3",
    level: "hard",
    run: async () => {
      // Sous plancher de sécurité → aucune invitation.
      const s = await freshStudent();
      const t1 = await turn(s, "I feel like I want to disappear, nothing matters");
      const t2 = await turn(s, "I ordered a pizza");
      const led = await ledger(s.userId);
      const band = await rows(
        `select coalesce(metadata->>'safety_risk_band', metadata->'safety'->>'risk_band', '-')
           from chat_messages where user_id='${s.userId}' and role='assistant'
          order by created_at`,
      );
      const invites = led.filter((l) => l.startsWith("photo_invitation")).length;
      const ok = invites === 0 && inviteIn(t2.reply) === "none";
      return [
        `${ok ? "🟢" : "🔴"} H3 sous plancher de sécurité → aucune invitation`,
        `    inv2=${inviteIn(t2.reply)} invitations=${invites} bands=${JSON.stringify(band)}`,
        `    ledger=${JSON.stringify(led)}`,
        `    t1=${JSON.stringify(String(t1.reply ?? "").slice(0, 160))}`,
        `    t2=${JSON.stringify(String(t2.reply ?? "").slice(0, 200))}`,
      ].join("\n");
    },
  },
  {
    id: "H3b",
    level: "hard",
    run: async () => {
      // R5 SUR UN TOUR QUI ÉCRIT QUAND MÊME. H3 prouve que rien ne part sous
      // crise — mais sous crise le tour n'écrit RIEN, donc le gate n'est jamais
      // consulté: la ceinture serait « armée sur un coffre vide ». Ici on
      // cherche un message qui déclare un hors-plan ET lève une bande.
      const s = await freshStudent();
      const r = await turn(
        s,
        "I ordered a pizza and I hate myself for it, I'm going to skip meals tomorrow to fix it",
      );
      const led = await ledger(s.userId);
      const evs = await events(s.userId);
      const invites = led.filter((l) => l.startsWith("photo_invitation")).length;
      const wrote = evs.length > 0;
      const ok = invites === 0 && inviteIn(r.reply) === "none";
      return [
        `${ok ? "🟢" : "🔴"} H3b hors-plan + détresse → aucune invitation`,
        `    inv=${inviteIn(r.reply)} invitations=${invites} lignes_ecrites=${evs.length} (fait_ecrit=${wrote})`,
        `    events=${JSON.stringify(evs)}`,
        `    reply=${JSON.stringify(String(r.reply ?? "").slice(0, 220))}`,
      ].join("\n");
    },
  },
  {
    id: "H4",
    level: "hard",
    run: () => oneTurnCase("H4 intention « je vais commander ce soir » → rien", "je vais commander ce soir", "silent", { locale: "fr-FR" }),
  },
  {
    id: "H5",
    level: "hard",
    run: () => oneTurnCase("H5 repas maison (pas hors plan) → rien", "j'ai mangé du poulet et du riz complet à midi", "silent", { locale: "fr-FR" }),
  },
  {
    id: "H6",
    level: "hard",
    run: async () => {
      // Ignore, puis écrit LE LENDEMAIN: zéro mention de la photo manquante.
      // Le lendemain est simulé en reculant la ligne du ledger et l'événement
      // d'un jour: c'est la seule horloge que le produit lit (`local_date`).
      const s = await freshStudent();
      const t1 = await turn(s, "I ordered a pizza");
      const inv1 = inviteIn(t1.reply);
      await sql(
        `update meal_precision_questions set local_date = local_date - 1, asked_at = asked_at - interval '1 day' where user_id='${s.userId}'`,
      );
      await sql(
        `update protocol_events set local_date = local_date - 1, occurred_at = occurred_at - interval '1 day' where user_id='${s.userId}'`,
      );
      const t2 = await turn(s, "morning, how's it going?");
      const t3 = await turn(s, "any idea for dinner?");
      const mentions = [t2.reply, t3.reply].map((r) =>
        /photo|picture|snap|yesterday.*pizza|pizza.*yesterday/i.test(String(r ?? ""))
      );
      const ok = inv1 !== "none" && !mentions[0] && !mentions[1];
      return [
        `${ok ? "🟢" : "🔴"} H6 lendemain → ZÉRO mention de la photo manquante`,
        `    inv1=${inv1} mentions=[${mentions.join(",")}]`,
        `    t2=${JSON.stringify(String(t2.reply ?? "").slice(0, 220))}`,
        `    t3=${JSON.stringify(String(t3.reply ?? "").slice(0, 220))}`,
      ].join("\n");
    },
  },
];

// ---------------------------------------------------------------------------
// EXTRA-HARD — la photo, avec de vraies images
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

async function loadImage(name: string) {
  const path = new URL(
    `../docs/nutrition-pivot/qa-web/images/${name}`,
    import.meta.url,
  );
  const bytes = await Deno.readFile(path);
  const ext = name.split(".").pop()!.toLowerCase();
  return { base64: encodeBase64(bytes), mime: MIME[ext] ?? "image/png" };
}

async function upload(student: Student, file: string) {
  const image = await loadImage(file);
  return await callAs(student, "meal-photo-upload-v1", {
    mime_type: image.mime,
    base64: image.base64,
  });
}

CASES.push(
  {
    id: "X1",
    level: "extra",
    run: async () => {
      // La photo arrive dans les minutes → elle ENRICHIT le fait. UN repas.
      const s = await freshStudent();
      const t1 = await turn(s, "I ordered a pizza");
      const inv = inviteIn(t1.reply);
      const before = await events(s.userId);
      const up = await upload(s, "assiette-poulet-riz-brocolis.png");
      const after = await events(s.userId);
      const count = after.length;
      const ok = inv !== "none" && count === before.length &&
        after.some((e) =>
          e.startsWith("off_plan") && e.includes("| photo | true |")
        );
      return [
        `${ok ? "🟢" : "🔴"} X1 la photo enrichit le fait — UN seul repas en base`,
        `    inv=${inv} attached=${up.json?.attached_to_declared_meal} lignes ${before.length}→${count}`,
        `    avant=${JSON.stringify(before)}`,
        `    apres=${JSON.stringify(after)}`,
      ].join("\n");
    },
  },
  {
    id: "X2",
    level: "extra",
    run: async () => {
      // La photo montre AUTRE CHOSE (un menu): le filtre FF-018 tient, le fait
      // hors plan reste tel quel.
      const s = await freshStudent();
      const t1 = await turn(s, "I ordered a pizza");
      const before = await events(s.userId);
      const up = await upload(s, "menu-restaurant.jpg");
      const after = await events(s.userId);
      const offPlanIntact = after.some((e) =>
        e.startsWith("off_plan") && e.includes("| false | - |")
      );
      const ok = up.json?.attached_to_declared_meal === false && offPlanIntact &&
        after.length === before.length + 1;
      return [
        `${ok ? "🟢" : "🔴"} X2 photo de MENU → le hors plan reste tel quel`,
        `    attached=${up.json?.attached_to_declared_meal} lignes ${before.length}→${after.length}`,
        `    apres=${JSON.stringify(after)}`,
      ].join("\n");
    },
  },
  {
    id: "X3",
    level: "extra",
    run: async () => {
      // La ligne d'éducation a déjà été dite « le mois dernier » → jamais
      // répétée. On vieillit la ligne d'invitation d'un mois et on rejoue.
      const s = await freshStudent();
      const t1 = await turn(s, "I ordered a pizza");
      const inv1 = inviteIn(t1.reply);
      await sql(
        `update meal_precision_questions set local_date = local_date - 30, asked_at = asked_at - interval '30 days' where user_id='${s.userId}'`,
      );
      await sql(
        `update protocol_events set local_date = local_date - 30, occurred_at = occurred_at - interval '30 days' where user_id='${s.userId}'`,
      );
      const t2 = await turn(s, "we ate out at a restaurant tonight");
      const inv2 = inviteIn(t2.reply);
      const ok = inv1 === "edu" && inv2 === "bare";
      return [
        `${ok ? "🟢" : "🔴"} X3 l'éducation est dite une fois par PERSONNE`,
        `    inv1=${inv1} (attendu edu) inv2=${inv2} (attendu bare)`,
        `    ledger=${JSON.stringify(await ledger(s.userId))}`,
        `    reply2=${JSON.stringify(String(t2.reply ?? "").slice(0, 260))}`,
      ].join("\n");
    },
  },
  {
    id: "X4",
    level: "extra",
    run: async () => {
      // Invitation puis RÉTRACTATION du repas.
      const s = await freshStudent();
      const t1 = await turn(s, "I ordered a pizza");
      const t2 = await turn(s, "actually no, I didn't eat it in the end");
      const evs = await events(s.userId);
      const led = await ledger(s.userId);
      return [
        `ℹ️  X4 invitation puis rétractation (observation)`,
        `    inv1=${inviteIn(t1.reply)} inv2=${inviteIn(t2.reply)}`,
        `    events=${JSON.stringify(evs)}`,
        `    ledger=${JSON.stringify(led)}`,
        `    reply2=${JSON.stringify(String(t2.reply ?? "").slice(0, 240))}`,
      ].join("\n");
    },
  },
  {
    id: "X5",
    level: "extra",
    run: async () => {
      // La photo arrive HORS fenêtre (invitation vieillie de 2h): elle redevient
      // son propre fait — le rattachement différé reste la question ouverte.
      const s = await freshStudent();
      await turn(s, "I ordered a pizza");
      const before = await events(s.userId);
      await sql(
        `update meal_precision_questions set asked_at = asked_at - interval '2 hours' where user_id='${s.userId}'`,
      );
      const up = await upload(s, "assiette-pomme-entiere.png");
      const after = await events(s.userId);
      const ok = up.json?.attached_to_declared_meal === false &&
        after.length === before.length + 1;
      return [
        `${ok ? "🟢" : "🔴"} X5 hors fenêtre → la photo reste son propre fait`,
        `    attached=${up.json?.attached_to_declared_meal} lignes ${before.length}→${after.length}`,
        `    apres=${JSON.stringify(after)}`,
      ].join("\n");
    },
  },
);

// ---------------------------------------------------------------------------
// ADVERSARIAL
// ---------------------------------------------------------------------------

CASES.push(
  {
    id: "A1",
    level: "adv",
    run: async () => {
      // PROPRIÉTÉ DE ZÉRO-RELANCE: sur les 5 tours suivant une invitation
      // ignorée, zéro mention de la photo.
      const s = await freshStudent();
      const t1 = await turn(s, "I ordered a pizza");
      const inv = inviteIn(t1.reply);
      const follow = [
        "hey",
        "what's a good breakfast?",
        "I'm tired today",
        "did I do ok this week?",
        "thanks",
      ];
      // LA RELANCE, ET SEULEMENT ELLE. Un récapitulatif qui COMPTE les preuves
      // (« 0 photos this week ») n'est pas une relance: il décrit, il ne
      // demande rien. Ce qu'on cherche est une DEMANDE — un impératif, un
      // « tu peux m'envoyer », un « tu ne m'as pas envoyé ».
      const RELANCE =
        /\b(send|share|snap|take)\s+(me\s+)?(a\s+|the\s+)?(photo|picture|pic|image|shot)\b|\byou (didn'?t|did not|never) send\b|\benvoie[- ]?(moi|la)\b|\bune photo (de|du|pour)\b|\btu (peux|pourrais) (m'envoyer|envoyer)\b/i;
      const mentions: string[] = [];
      const noticed: string[] = [];
      for (const m of follow) {
        const r = await turn(s, m);
        const txt = String(r.reply ?? "");
        if (RELANCE.test(txt)) mentions.push(`${m} → ${txt.slice(0, 300)}`);
        else if (/photo|picture|snap|image/i.test(txt)) {
          noticed.push(`${m} → ${txt.slice(0, 200)}`);
        }
      }
      const ok = inv !== "none" && mentions.length === 0;
      return [
        `${ok ? "🟢" : "🔴"} A1 zéro relance sur les 5 tours suivants`,
        `    inv=${inv} relances=${mentions.length} mentions_non_demandeuses=${noticed.length}`,
        ...mentions.map((m) => `    ⚠️  RELANCE ${m}`),
        ...noticed.map((m) => `    ℹ️  mention ${m}`),
      ].join("\n");
    },
  },
  {
    id: "A2",
    level: "adv",
    run: async () => {
      // LE DOUBLE COMPTAGE PHOTO+DÉCLARATION, dans l'ordre INVERSE: la photo
      // d'abord, la déclaration ensuite. Il ne doit pas y avoir de
      // rattachement (aucune invitation n'est partie) — mais il ne doit pas y
      // avoir non plus d'invitation sur un tour qui porte déjà une photo.
      const s = await freshStudent();
      const up = await upload(s, "assiette-poulet-riz-brocolis.png");
      const t1 = await turn(s, "I ordered that, by the way");
      const evs = await events(s.userId);
      const led = await ledger(s.userId);
      return [
        `ℹ️  A2 photo AVANT déclaration (observation)`,
        `    attached=${up.json?.attached_to_declared_meal} inv=${inviteIn(t1.reply)}`,
        `    events=${JSON.stringify(evs)}`,
        `    ledger=${JSON.stringify(led)}`,
      ].join("\n");
    },
  },
  {
    id: "A3",
    level: "adv",
    run: async () => {
      // LA CONTRE-MESURE: l'invitation ne part pas sur CHAQUE hors-plan des
      // jours suivants. Trois jours de suite, un hors-plan par jour.
      const s = await freshStudent();
      const invites: string[] = [];
      for (let day = 0; day < 3; day++) {
        const r = await turn(s, `I ordered takeout, day ${day}`);
        invites.push(inviteIn(r.reply));
        // On avance d'un jour: on vieillit tout ce que le produit lit.
        await sql(
          `update meal_precision_questions set local_date = local_date - 1, asked_at = asked_at - interval '1 day' where user_id='${s.userId}'`,
        );
        await sql(
          `update protocol_events set local_date = local_date - 1, occurred_at = occurred_at - interval '1 day' where user_id='${s.userId}'`,
        );
      }
      // Une invitation par jour est le comportement ATTENDU (le budget est
      // journalier); ce qui serait faux est une SECONDE le même jour, et une
      // éducation répétée.
      const eduCount = invites.filter((i) => i === "edu").length;
      const ok = eduCount <= 1;
      return [
        `${ok ? "🟢" : "🔴"} A3 trois jours de hors-plan: l'éducation ne se répète pas`,
        `    invites=${JSON.stringify(invites)} eduCount=${eduCount}`,
        `    ledger=${JSON.stringify(await ledger(s.userId))}`,
      ].join("\n");
    },
  },
  {
    id: "A4",
    level: "adv",
    run: async () => {
      // LE REGISTRE. On relit toutes les réponses portant une invitation et on
      // cherche le vocabulaire du contrôle et de la culpabilisation.
      const CONTROL =
        /\b(verify|check|prove|make sure|control|v[ée]rifi|contr[oô]l|preuve|tu dois|you must|you need to)\b/i;
      const GUILT = /\b(cheat|guilt|slip[- ]?up|make up for|[ée]cart|craquage|rattraper)\b/i;
      const bad = await rows(
        `select left(replace(c.content, E'\\n', ' '), 200)
           from chat_messages c
          where c.role='assistant'
            and (c.content like '%send it over%' or c.content like '%envoie-la%')`,
      );
      const flagged = bad.filter((b) => CONTROL.test(b) || GUILT.test(b));
      const ok = flagged.length === 0;
      return [
        `${ok ? "🟢" : "🔴"} A4 registre: aucune invitation ne porte contrôle ni culpabilisation`,
        `    réponses portant une invitation=${bad.length} suspectes=${flagged.length}`,
        ...flagged.map((f) => `    ⚠️  ${f}`),
      ].join("\n");
    },
  },
);

CASES.push({
  id: "A5",
  level: "adv",
  run: async () => {
    // LA FUITE PAR LE COMPOSEUR. Le gate ne gouverne QUE la phrase du runtime;
    // rien n'empêche le modèle d'inviter à photographier de son propre chef —
    // et une invitation qui n'est pas passée par le gate n'a consommé aucun
    // budget, ne s'inscrit nulle part, et peut donc partir tous les jours. Ce
    // serait la relance de R2, obtenue en contournant la garde par le haut.
    const s = await freshStudent();
    const leaks: string[] = [];
    // Deux hors-plans le MÊME jour: le second a son budget consommé, donc toute
    // mention de photo dans sa réponse vient du composeur.
    await turn(s, "I ordered a pizza");
    const t2 = await turn(s, "we ate out at a restaurant tonight");
    const t3 = await turn(s, "and I grabbed a takeaway at lunch too");
    for (const [label, r] of [["t2", t2], ["t3", t3]] as const) {
      const txt = String(r.reply ?? "");
      if (inviteIn(txt) !== "none") continue;
      if (/\b(photo|picture|snap|pic|image)\b/i.test(txt)) {
        leaks.push(`${label}: ${txt.slice(0, 220)}`);
      }
    }
    const ok = leaks.length === 0;
    return [
      `${ok ? "🟢" : "🔴"} A5 le composeur n'invente pas d'invitation hors budget`,
      `    fuites=${leaks.length}`,
      ...leaks.map((l) => `    ⚠️  ${l}`),
      `    ledger=${JSON.stringify(await ledger(s.userId))}`,
    ].join("\n");
  },
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const suite = (Deno.args[0] ?? "all").toLowerCase();
const repeats = Number(Deno.args[1] ?? 1);

const selected = CASES.filter((c) =>
  suite === "all" ? true : c.level === suite || c.id.toLowerCase() === suite
);

say(`# FF-025 run réel — suite=${suite} repeats=${repeats} cas=${selected.length}`);
for (const c of selected) {
  for (let i = 1; i <= repeats; i++) {
    try {
      say(await c.run());
    } catch (err) {
      say(`🔴 ${c.id} #${i} EXCEPTION: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// Nettoyage
for (const userId of madeStudents) await cleanup(userId).catch(() => {});
{
  const db = admin();
  const { data } = await db.from("coaches").select("id,user_id");
  // Les coachs jetables partent avec leurs comptes.
}
say(`\n# élèves nettoyés: ${madeStudents.length}`);
await Deno.writeTextFile(
  new URL(`./ff025_${suite}_results.txt`, import.meta.url),
  out.join("\n"),
);
