import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/render-memory-inspect.mjs <bundle.json>");
  process.exit(2);
}

const bundle = JSON.parse(fs.readFileSync(file, "utf8"));
const snapshot = bundle.trace?.memory_snapshot ?? {};
const rows = [
  ...(Array.isArray(snapshot.global_memories) ? snapshot.global_memories : []),
  ...(Array.isArray(snapshot.event_memories) ? snapshot.event_memories : []),
];

const counts = new Map();
for (const row of rows) {
  const kind = String(row.kind ?? "unknown");
  counts.set(kind, (counts.get(kind) ?? 0) + 1);
}

console.log(`# Memory inspect - ${bundle.request?.user_id ?? "unknown"}`);
console.log("");
console.log(`- window: ${bundle.request?.from ?? "?"} -> ${bundle.request?.to ?? "?"}`);
console.log(`- hours: ${bundle.request?.used_hours ?? "custom"}`);
console.log(`- bundle: ${file}`);
console.log("");
console.log("## Counts by kind");
if (counts.size === 0) {
  console.log("- none");
} else {
  for (const [kind, count] of [...counts.entries()].sort()) {
    console.log(`- ${kind}: ${count}`);
  }
}
console.log("");
console.log("## Active memory_items");
console.log("| kind | sensitivity | status | observed_at | summary |");
console.log("|---|---|---|---|---|");
for (const row of rows.slice(0, 80)) {
  const summary = String(row.normalized_summary ?? row.content_text ?? "")
    .replace(/\s+/g, " ")
    .replace(/\|/g, "/")
    .slice(0, 140);
  const sensitivity = String(row.sensitivity_level ?? row.metadata?.sensitivity_level ?? "unknown");
  console.log(`| ${row.kind ?? ""} | ${sensitivity} | ${row.status ?? ""} | ${row.observed_at ?? row.created_at ?? ""} | ${summary} |`);
}
