import { cleanup, makeCoach, makeStudent, publishPlanFor, rows, sql, turn } from "../docs/nutrition-pivot/qa-web/harness.ts";

const coach = await makeCoach({ displayName: "FF025 locale", country: "GB" });
const s = await makeStudent({ coach, locale: "fr-FR", timezone: "Europe/Paris", fullName: "ff025 locale" });
await publishPlanFor(coach, s.userId, { timezone: "Europe/Paris" });

// Tour 1: n'importe quoi, pour que la ligne d'état existe telle que le produit la crée.
const t1 = await turn(s, "hello");
console.log("T1:", String(t1.reply ?? "").slice(0, 120));
console.log("ETAT:", await rows(`select scope || ' => ' || left(temp_memory::text, 160) from user_chat_states where user_id='${s.userId}'`));

// On ANCRE le fil en français, exactement comme le produit le fait lui-même
// (`withPersistedConversationLocale`), puis on rejoue.
await sql(
  `update user_chat_states set temp_memory = jsonb_set(temp_memory, '{conversation_locale}', '"fr-FR"') where user_id='${s.userId}'`,
);
console.log("APRES ANCRAGE:", await rows(`select scope || ' => ' || left(temp_memory::text, 120) from user_chat_states where user_id='${s.userId}'`));

const t2 = await turn(s, "j'ai commandé une pizza ce soir");
console.log("T2:", String(t2.reply ?? "").slice(0, 400));
console.log("ETAT2:", await rows(`select scope || ' => ' || left(temp_memory::text, 120) from user_chat_states where user_id='${s.userId}'`));
await cleanup(s.userId);
