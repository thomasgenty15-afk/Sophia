/**
 * QUELLES SURFACES LE VERROU DE SORTIE LIT-IL VRAIMENT ? — mesure sur les
 * octets d'un plan réel, pas lecture de code.
 *
 * `meal_generation.ts:4885-4890` construit le foin donné à
 * `applyKeelOutputLocks` ainsi:
 *
 *     dishes.map(d => `${d.title}. ${d.method} ${d.why} ${ingrédients}`)
 *     + shopping_list.map(s => s.term)
 *
 * On le reconstruit à l'identique sur `separate_sessions/run-2` et on demande:
 * la phrase « roast on the other half of the CHICKEN tray », écrite par le
 * modèle dans la MÉTHODE D'UNE PRÉPARATION, y est-elle ?
 *
 *   deno run --allow-read lock-surface-probe.ts
 */
const path =
  "/Users/ahmedamara/Dev/Sophia 2/scratchpad/qa-generation/03-foyer-modes/separate_sessions/run-2/http-response.json";
const plan = JSON.parse(await Deno.readTextFile(path));

type Ing = { term?: string };
type Dish = { title?: string; method?: string; why?: string; ingredients?: Ing[] };
type Prep = { id?: string; title?: string; method?: string; ingredients?: Ing[] };

const rendered = [
  ...(plan.dishes ?? []).map((d: Dish) =>
    `${d.title}. ${d.method} ${d.why} ${(d.ingredients ?? []).map((i) => i.term).join(", ")}`
  ),
  ...(plan.shopping_list ?? []).map((s: { term?: string }) => s.term),
].join("\n");

const needle = "chicken tray";
console.log(`foin du verrou (dishes + courses) : ${rendered.length} caractères`);
console.log(`  contient « ${needle} » ? ${rendered.toLowerCase().includes(needle)}`);

const prepText = (plan.preparations ?? []).map((p: Prep) =>
  `${p.title}. ${p.method} ${(p.ingredients ?? []).map((i) => i.term).join(", ")}`
).join("\n");
console.log(`texte des PRÉPARATIONS            : ${prepText.length} caractères`);
console.log(`  contient « ${needle} » ? ${prepText.toLowerCase().includes(needle)}`);

// Combien du texte des préparations se retrouve dans le foin ?
let prepTitlesInHay = 0;
for (const p of (plan.preparations ?? []) as Prep[]) {
  if (rendered.includes(String(p.title ?? ""))) prepTitlesInHay++;
}
console.log(
  `titres de préparation présents dans le foin : ${prepTitlesInHay}/${(plan.preparations ?? []).length}`,
);

const notes = (plan.member_portions ?? []).map((p: { portion_note?: string }) =>
  String(p.portion_note ?? "")
);
const notesInHay = notes.filter((n: string) => n && rendered.includes(n)).length;
console.log(`portion_note présentes dans le foin         : ${notesInHay}/${notes.length}`);
