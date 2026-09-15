// MESURE AVANT — LE MÉCANISME des trois normalisations (lot S1d).
// Les trois chaînes sont recopiées des trois modules, à l'identique, pour
// montrer CE QUE DEVIENT la ligature dans chacune. ⛔ Elles ne sont pas
// importées: les trois `normalize()` sont privées, et c'est délibéré.
const DEC = "";
const body = (t: string) =>
  String(t ?? "").toLowerCase().normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/(\d)[.,](\d)/g, `$1${DEC}$2`)
    .replace(/['’]/g, " ")
    .replace(new RegExp(`[^a-z0-9\\s${DEC}]`, "g"), " ")
    .replace(new RegExp(DEC, "g"), ".")
    .replace(/(\d)([a-z])/g, "$1 $2").replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ").trim();
const meal = (t: string) =>
  String(t ?? "").toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const safety = (t: string) =>
  String(t ?? "").normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .toLowerCase().replace(/[\r\n]+/g, " . ").replace(/\s+/g, " ").trim();

for (
  const s of [
    "ma sœur",
    "des œufs",
    "du bœuf",
    "un nævus",
    "MA SŒUR",
  ]
) {
  console.log(
    JSON.stringify(s),
    "\n   body_measure_floor    ->",
    JSON.stringify(body(s)),
    "\n   meal_declaration_floor->",
    JSON.stringify(meal(s)),
    "\n   safety_lexicon        ->",
    JSON.stringify(safety(s)),
  );
}
console.log(
  "\nNFD(oe-ligature).length =",
  "œ".normalize("NFD").length,
  " NFD(e-accent-aigu).length =",
  "é".normalize("NFD").length,
);
