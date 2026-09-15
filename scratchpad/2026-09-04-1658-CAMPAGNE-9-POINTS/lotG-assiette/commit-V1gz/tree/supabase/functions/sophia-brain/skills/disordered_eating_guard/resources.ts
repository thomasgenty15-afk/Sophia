/**
 * Eating-disorder resources for the clinical flow — a thin adapter over the
 * W3.3 registry.
 *
 * CLINICAL, NOT CRISIS. This is the point of the whole skill: a suicide hotline
 * is the wrong referral for someone restricting, and reciting 988 at them
 * teaches the product that "safety" has one shape. Someone showing
 * disordered-eating signals needs an ED-specific line and a human clinician,
 * routed through their coach. When a suicidal signal is ALSO present, the
 * router hands the turn to `safety_crisis` instead — that branch outranks this
 * one, and the visible-agent validator actively rejects a suicide line emitted
 * from here.
 *
 * NO SEED LIVES IN THIS FILE, on purpose. `_shared/keel/crisis_resources.ts`
 * (W3.3) is the single source of truth, mirrored from the `crisis_resources`
 * migration and drift-tested against it. A second hardcoded list of helplines
 * here would be two normalizations of the same data that can disagree — the
 * exact failure class CONTRACT R7 exists to prevent, on data where being stale
 * means sending someone to a number that no longer answers (the NEDA helpline
 * closed in 2023; that is how Tessa happened).
 *
 * This file therefore only does three things: pin the `eating_disorder` kind,
 * shape the rows for the reply path, and expose which numeric strings the
 * post-generation validator may let through.
 */

import {
  type CrisisResource,
  type CrisisResourceResolutionSource,
  resolveCrisisResources,
} from "../../../_shared/keel/crisis_resources.ts";

export type EatingDisorderResourceResolution = {
  /** Country actually served — a seeded one, or 'ZZ' (international fallback). */
  country: string;
  /** True when the student's own country could not be served. Logged upstream. */
  fallbackUsed: boolean;
  resolutionSource: CrisisResourceResolutionSource;
  /** Never empty: the registry always answers (R7 — no silent nothing). */
  resources: CrisisResource[];
};

/**
 * Resolves the ED resources for a country.
 *
 * Never throws and never returns empty — both by delegation. A throw here would
 * land in the reply path of a clinical turn and produce a silent message, the
 * failure this skill exists to prevent; and an empty list would mean a referral
 * that refers nowhere. Degradation is loud instead: `fallbackUsed` travels into
 * the visible task and the skill diagnosis, so a student served the
 * international directory instead of their own country's line is visible in the
 * logs rather than indistinguishable from a normal turn.
 */
export function resolveEatingDisorderResources(
  country: unknown,
): EatingDisorderResourceResolution {
  const resolution = resolveCrisisResources(
    country == null ? null : String(country),
    "eating_disorder",
  );
  return {
    country: resolution.country,
    fallbackUsed: resolution.fallbackUsed,
    resolutionSource: resolution.resolutionSource,
    resources: resolution.resources,
  };
}

/** One line per resource, for the visible message and the deterministic fallback. */
export function renderResourceLines(
  resolution: EatingDisorderResourceResolution,
): string[] {
  return resolution.resources.map((r) => `${r.label}: ${r.contact}`);
}

/**
 * Every string that may legitimately carry a digit into a clinical reply.
 *
 * The validator subtracts these from the message and then asserts that not one
 * digit is left — that is how "give them the helpline" and "never say a
 * calorie, weight or adherence figure" coexist without a hand-maintained
 * allowlist that someone has to remember to update.
 *
 * WHOLE strings only, never their digit fragments: allowing "1" because
 * "1-866-662-1235" contains it would let any stray figure through. The prompt
 * requires the contact verbatim, and a reformatted number simply fails
 * validation and falls back to the deterministic message — which carries the
 * correct one. Failing toward the fixed text is the safe direction.
 */
export function allowedNumericStrings(
  resolution: EatingDisorderResourceResolution,
): string[] {
  const out: string[] = [];
  for (const r of resolution.resources) {
    out.push(r.contact);
    // Labels and URLs carry digits of their own ("Beat helpline (under 18s)",
    // "988lifeline.org"). They are registry content, never a student metric.
    out.push(r.label);
    if (r.url) out.push(r.url);
  }
  return out.sort((a, b) => b.length - a.length);
}
