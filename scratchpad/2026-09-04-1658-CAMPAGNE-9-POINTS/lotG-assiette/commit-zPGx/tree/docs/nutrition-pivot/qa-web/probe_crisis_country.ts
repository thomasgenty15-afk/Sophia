/** Sonde: quel pays de crise pour un élève ARRIVÉ PAR /join ? */
import { sql } from "./harness.ts";
import { crisisCountryForProfile, resolveCrisisResources } from "../../../supabase/functions/_shared/keel/crisis_resources.ts";

const id = Deno.args[0];
const raw = await sql(
  `select coalesce(country,'') || '~' || coalesce(locale,'') as v from profiles where id='${id}'`,
);
const value = raw.split("\n")[1] ?? "";
const [country, locale] = value.split("~");
const profile = { country: country || null, locale: locale || null };
console.log("profil réel en base :", JSON.stringify(profile));
const res = crisisCountryForProfile(profile);
console.log("pays retenu        :", JSON.stringify(res));
const served = resolveCrisisResources(res.country, "suicide");
console.log("ressources servies :", JSON.stringify(served));
