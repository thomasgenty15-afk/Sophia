/**
 * FIXTURES D'IMAGE POUR L4 — générées par un modèle d'image.
 *
 * Le prompt de mission exige de VRAIES images, « pas des PNG 1×1 ». Le dépôt
 * n'en contient aucune. Elles sont donc générées ici, une fois, et versionnées
 * dans `qa-web/images/` — la QA doit être rejouable sans regénérer, et le
 * verdict d'un filtre de sujet ne veut rien dire si l'image change entre deux
 * runs.
 *
 * ⚠️ CE QUE CES IMAGES SONT, ET CE QU'ELLES NE SONT PAS. Ce sont des images de
 * synthèse photoréalistes, pas des photos prises au téléphone par un élève.
 * Elles éprouvent le filtre de sujet et la stabilité du verdict ; elles
 * n'éprouvent pas le bruit d'un vrai capteur (flou de bougé, contre-jour,
 * compression d'un MMS). C'est écrit ici pour que personne ne prenne l'un pour
 * l'autre.
 *
 * USAGE : deno run --allow-all gen_images.ts [nom-du-cas ...]
 */
const KEY = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
if (!KEY) throw new Error("GEMINI_API_KEY manquante");

const MODEL = Deno.env.get("IMAGE_MODEL") ?? "gemini-2.5-flash-image";

type Fixture = { name: string; prompt: string; why: string };

const FIXTURES: Fixture[] = [
  {
    name: "assiette-poulet-riz-brocolis",
    why: "le cas NOMINAL: une assiette qui doit compter",
    prompt:
      "A realistic overhead smartphone photo of a home dinner plate on a wooden kitchen table: " +
      "a grilled chicken breast, a portion of brown rice, and steamed broccoli florets. " +
      "Natural window light, slight shadows, a fork resting on the table, casual and unstyled, " +
      "as if taken quickly by someone about to eat. Photographic, not illustration.",
  },
  {
    name: "assiette-saumon-sauce-luisante",
    why: "l'assiette qui CACHE quelque chose: sauce/huile visible, une question de clarification est attendue",
    prompt:
      "A realistic overhead smartphone photo of a dinner plate: a salmon fillet glistening under a " +
      "glossy butter sauce, with sautéed green beans shining with oil and a small pile of couscous. " +
      "Visible sheen and small pools of sauce on the plate. Home kitchen table, natural light, " +
      "casual unstyled snapshot. Photographic, not illustration.",
  },
  {
    name: "assiette-pomme-entiere",
    why: "l'assiette qui ne cache RIEN: aucune question ne doit partir",
    prompt:
      "A realistic close-up smartphone photo of a single whole red apple on a plain white plate, " +
      "on a light kitchen counter. Nothing else on the plate. Natural daylight, casual snapshot. " +
      "Photographic, not illustration.",
  },
  {
    name: "rayon-supermarche",
    why: "filtre de sujet: un rayon n'est pas un repas",
    prompt:
      "A realistic smartphone photo taken inside a supermarket aisle, shelves stacked with " +
      "packaged groceries and cereal boxes receding into the distance, fluorescent overhead " +
      "lighting, a shopping trolley handle visible at the bottom of the frame. " +
      "Photographic, not illustration.",
  },
  {
    name: "selfie",
    why: "filtre de sujet: un visage n'est pas un repas",
    prompt:
      "A realistic front-facing smartphone selfie of a smiling adult woman in her thirties " +
      "in a living room, arm slightly visible holding the phone, soft indoor lighting, " +
      "casual everyday snapshot. Photographic, not illustration.",
  },
  {
    name: "paysage",
    why: "filtre de sujet: un paysage n'est pas un repas",
    prompt:
      "A realistic smartphone photo of a green hillside landscape at golden hour, " +
      "rolling fields, a few trees on the ridge, distant clouds. No people, no food. " +
      "Photographic, not illustration.",
  },
];

const only = Deno.args.filter((a) => !a.startsWith("--"));
const dir = new URL("./images/", import.meta.url);

for (const fixture of FIXTURES) {
  if (only.length > 0 && !only.includes(fixture.name)) continue;
  const target = new URL(`${fixture.name}.png`, dir);
  try {
    await Deno.stat(target);
    console.log(`= ${fixture.name}.png existe déjà, on ne regénère pas`);
    continue;
  } catch { /* à générer */ }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fixture.prompt }] }],
      }),
    },
  );
  const json = await res.json();
  if (!res.ok) {
    console.error(`✗ ${fixture.name}: ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
    continue;
  }
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find((p: Record<string, unknown>) => p.inlineData ?? p.inline_data);
  const data = (inline?.inlineData ?? inline?.inline_data)?.data;
  if (!data) {
    console.error(`✗ ${fixture.name}: aucune image rendue — ${JSON.stringify(json).slice(0, 300)}`);
    continue;
  }
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  await Deno.writeFile(target, bytes);
  console.log(`✓ ${fixture.name}.png  ${bytes.length} octets  — ${fixture.why}`);
}
