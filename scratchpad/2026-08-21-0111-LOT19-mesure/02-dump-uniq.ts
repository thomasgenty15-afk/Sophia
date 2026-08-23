const dir = Deno.args[0];
type Row = { raw: string; norm: string; source: string; lane: string; mealId: string; locale: string; slug: string | null; hasAmount: boolean };
const rows = JSON.parse(Deno.readTextFileSync(`${dir}/terms.json`)) as Row[];
const core = rows.filter((r) => r.source === "dish" || r.source === "preparation");
const m = new Map<string, { n: number; slug: string | null; raw: string; lanes: Set<string>; meals: Set<string> }>();
for (const r of core) {
  const e = m.get(r.norm) ?? { n: 0, slug: r.slug, raw: r.raw, lanes: new Set<string>(), meals: new Set<string>() };
  e.n++; e.lanes.add(r.lane); e.meals.add(r.mealId);
  m.set(r.norm, e);
}
const out = [...m.entries()].sort((a, b) => b[1].n - a[1].n);
for (const [norm, e] of out) {
  console.log([e.n, e.slug ? "OK" : "MISS", e.slug ?? "", norm, e.raw, [...e.lanes].join("+"), e.meals.size].join("\t"));
}
