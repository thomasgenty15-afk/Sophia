/**
 * FF-023 — RUN RÉEL ADVERSARIAL sur l'historique daté.
 *
 * Trois hypothèses écrites AVANT d'être testées:
 *   A2. Un message d'un AUTRE `scope` (whatsapp) remonte-t-il dans le fil
 *       in-app ? (`loadRecentChatHistory` filtre `.eq("scope", …)` — vérifié
 *       par un faux client; jamais contre la vraie base.)
 *   A3. Le tour COURANT entre-t-il dans son propre historique ? (garde FF-023,
 *       `excluded_current` doit valoir 1 à chaque tour.)
 *   A6. Trois JOURS d'écart: la marque dit-elle « il y a 3 j », et le plancher
 *       de fraîcheur garde-t-il quand même le dernier échange ?
 *   A7. En ANGLAIS: la marque sort-elle bien en anglais, et le modèle s'en
 *       sert-il ? (cicatrice `guard-tested-in-one-language-only`)
 *
 * Un coach par élève: le harnais plafonne à 3 élèves par coach.
 */
import {
  admin,
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  sql,
  turn,
} from "./harness.ts";

const log = (...args: unknown[]) => console.log("[ff023:adv]", ...args);

async function scene(opts: {
  name: string;
  locale: string;
  timezone: string;
  country: string;
  first: string;
  probe: string;
  backdate: string;
  injectWhatsapp?: boolean;
}) {
  const coach = await makeCoach({ displayName: `FF023 adv ${opts.name}` });
  const student = await makeStudent({
    coach,
    timezone: opts.timezone,
    country: opts.country,
    locale: opts.locale,
    fullName: `FF023 adv ${opts.name}`,
  });
  await publishPlanFor(coach, student.userId, { timezone: opts.timezone });

  const t1 = await turn(student, opts.first);
  log(`${opts.name} · tour1`, t1.status);

  await sql(
    `update chat_messages set created_at = now() - interval '${opts.backdate}' ` +
      `where user_id = '${student.userId}'`,
  );

  if (opts.injectWhatsapp) {
    // A2 — une ligne d'un autre canal, RÉCENTE et très reconnaissable.
    const { error } = await admin().from("chat_messages").insert({
      user_id: student.userId,
      role: "user",
      content: "MARQUEUR_WHATSAPP_XYZZY: j'ai mangé un ananas violet",
      scope: "whatsapp",
      metadata: {},
    } as never);
    if (error) throw new Error(`injection whatsapp: ${error.message}`);
    log(`${opts.name} · ligne whatsapp injectée`);
  }

  const t2 = await turn(student, opts.probe);
  log(`${opts.name} · tour2`, t2.status, "| réponse:", JSON.stringify(t2.reply));

  if (opts.injectWhatsapp) {
    const fuite = String(t2.reply ?? "").toLowerCase();
    log(
      `${opts.name} · A2 fuite whatsapp:`,
      fuite.includes("ananas") || fuite.includes("xyzzy") ? "OUI (RED)" : "non",
    );
  }

  log(`${opts.name} · USER_ID`, student.userId);
  if (Deno.env.get("FF023_KEEP") !== "1") {
    await cleanup(student.userId);
    await cleanup(coach.userId);
  }
}

await scene({
  name: "A2A3-fr",
  locale: "fr-FR",
  timezone: "Europe/Paris",
  country: "FR",
  first: "Mon frère déménage à Lisbonne ce week-end.",
  probe: "Ça fait combien de temps que je t'ai parlé de mon frère ?",
  backdate: "3 hours",
  injectWhatsapp: true,
});

await scene({
  name: "A6-3jours",
  locale: "fr-FR",
  timezone: "Europe/Paris",
  country: "FR",
  first: "Mon frère déménage à Lisbonne ce week-end.",
  probe: "Ça fait combien de temps que je t'ai parlé de mon frère ?",
  backdate: "3 days",
});

await scene({
  name: "A7-en",
  locale: "en-US",
  timezone: "America/Los_Angeles",
  country: "US",
  first: "My brother is moving to Lisbon this weekend.",
  probe: "How long ago did I tell you about my brother?",
  backdate: "3 hours",
});
