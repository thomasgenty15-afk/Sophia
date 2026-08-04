#!/usr/bin/env node
// ===========================================================================
// pixel-check.mjs — KEEL W10.4: ZERO third-party tracking pixel, ever.
//
// WHY THIS SCRIPT EXISTS
// KEEL processes what a human eats, what they weigh, what supplements a
// clinician ordered, and — through the restriction floor — signals of a
// possible eating disorder. In the United States that makes it a vendor of
// "personal health records" under the FTC Health Breach Notification Rule.
// Every published HBNR enforcement action to date has had the same shape: a
// health app embedded the Meta pixel or the Google Analytics tag, and identifiers
// left for an advertiser without the user ever agreeing. GoodRx, BetterHelp,
// Premom, Cerebral. Not one of them was breached. They all just shipped a tag.
//
// So this is not a style rule. It is the single highest-probability enforcement
// path against this product, and the only reliable defence is that the tag is
// never in the bundle at all — not "consented", not "conditionally loaded",
// not "anonymized". A pixel that a config flag can turn on is a pixel that will
// be turned on.
//
// WHAT IT SCANS
//   frontend/src  — every authenticated surface, plus the public landing (a
//                   pixel on the landing page follows the visitor INTO the app
//                   through the same cookie; splitting the rule by page is how
//                   this leaks).
//   frontend/index.html and any other frontend HTML entry point.
//
// It reads the SOURCE, not the built bundle: a source-level grep is the check
// a reviewer can reason about, and a tag cannot enter the bundle without
// entering the source or package.json first (both are covered).
//
// WHAT IT DOES NOT DO
// It does not ban analytics as a category. Self-hosted, first-party
// instrumentation that never leaves our infrastructure is a product decision,
// not an HBNR risk. What is banned is a THIRD-PARTY beacon: a request to a
// domain we do not control, carrying an identifier we did not strip.
//
// Usage:  node scripts/ci/pixel-check.mjs
// Exit 1 with a file:line list on any hit.
// ===========================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Each rule: a name, a regex, and the sentence a reviewer needs in order to
// decide in ten seconds whether the hit is real.
const RULES = [
  {
    id: "meta-pixel",
    re: /\bfbq\s*\(|connect\.facebook\.net|facebook-jssdk|\bFacebookPixel\b|react-facebook-pixel/i,
    why: "Meta pixel. The GoodRx and BetterHelp HBNR actions were both this exact tag.",
  },
  {
    id: "google-analytics",
    re: /\bgtag\s*\(|googletagmanager\.com|google-analytics\.com|\bga\s*\(\s*['"](create|send)['"]|react-ga\b/i,
    why: "Google Analytics / GTM. Ships the page URL, which on this product names a health surface.",
  },
  {
    id: "google-ads",
    re: /googleadservices\.com|googlesyndication\.com|\bAW-\d{6,}/i,
    why: "Google Ads conversion tag.",
  },
  {
    id: "tiktok-pixel",
    re: /analytics\.tiktok\.com|\bttq\s*\.\s*(load|track|page)\b/i,
    why: "TikTok pixel.",
  },
  {
    id: "other-ad-networks",
    re: /snap\.licdn\.com|_linkedin_partner_id|sc-static\.net\/scevent|\bsnaptr\s*\(|bat\.bing\.com|\buetq\b|static\.ads-twitter\.com|\btwq\s*\(|pixel\.reddit\.com|redditstatic\.com\/ads/i,
    why: "LinkedIn / Snap / Bing / X / Reddit ad pixel.",
  },
  {
    id: "session-replay",
    re: /\bhotjar\b|static\.hotjar\.com|\bhj\s*\(|fullstory\.com|\bFS\s*\.\s*identify\b|\bclarity\s*\(\s*['"]|clarity\.ms|\bmouseflow\b|cdn\.smartlook\.com|\blogrocket\b/i,
    why:
      "Session replay. Worse than a pixel here: it records the student's own words about food and weight.",
  },
  {
    id: "third-party-product-analytics",
    re: /\bmixpanel\b|\bamplitude\b|\bposthog\b|\bheap\s*\.\s*(track|identify)\b|segment\.com\/analytics\.js|\banalytics\s*\.\s*identify\s*\(/i,
    why:
      "Third-party product analytics. Even without ads, this exports identified health events to a processor with no DPA.",
  },
];

// Where a hit is allowed to live. Keep this list SHORT and justified: an
// exemption is the mechanism by which this check stops working.
const EXEMPT_FILES = new Set([
  // This file names every tag it bans.
  "scripts/ci/pixel-check.mjs",
]);

function isExemptPath(rel) {
  if (EXEMPT_FILES.has(rel)) return true;
  // Tests that assert the ban exists must be able to name the tags.
  if (/pixel[-_.]?check/i.test(rel)) return true;
  return false;
}

const SCAN_TARGETS = [
  { dir: path.join(ROOT, "frontend", "src"), exts: /\.(ts|tsx|js|jsx|html)$/ },
  { dir: path.join(ROOT, "frontend", "public"), exts: /\.(html|js)$/ },
];

const SCAN_FILES = [
  path.join(ROOT, "frontend", "index.html"),
  path.join(ROOT, "frontend", "package.json"),
  path.join(ROOT, "package.json"),
];

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out);
    else if (exts.test(entry.name)) out.push(full);
  }
  return out;
}

const files = [
  ...SCAN_TARGETS.flatMap((t) => walk(t.dir, t.exts)),
  ...SCAN_FILES.filter((f) => fs.existsSync(f)),
];

const violations = [];

for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (isExemptPath(rel)) continue;

  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      // Reset lastIndex defensively; these regexes carry no /g but stay cheap.
      if (rule.re.test(line)) {
        violations.push({
          file: rel,
          line: i + 1,
          rule: rule.id,
          why: rule.why,
          excerpt: line.trim().slice(0, 140),
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error("");
  console.error("pixel-check FAILED — third-party tracking found on a KEEL surface.");
  console.error("");
  console.error(
    "  KEEL handles health data. A third-party beacon on any surface, authenticated",
  );
  console.error(
    "  or not, is the FTC Health Breach Notification Rule fact pattern (GoodRx,",
  );
  console.error(
    "  BetterHelp, Premom, Cerebral). Remove the tag. Do not gate it behind consent.",
  );
  console.error("");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
    console.error(`      ${v.why}`);
    console.error(`      > ${v.excerpt}`);
  }
  console.error("");
  process.exit(1);
}

console.log(`pixel-check OK (${files.length} files scanned, ${RULES.length} rules)`);
