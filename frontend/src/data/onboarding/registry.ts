import type { Theme } from './types';

import { THEME_SLEEP } from './theme_sleep';
import { THEME_ENERGY } from './theme_energy';
import { THEME_CONFIDENCE } from './theme_confidence';
import { THEME_DISCIPLINE } from './theme_discipline';
import { THEME_RELATIONS } from './theme_relations';
import { THEME_SENSE } from './theme_sense';
import { THEME_PROFESSIONAL } from './theme_professional';
import { THEME_TRANSVERSE } from './theme_transverse';

export const ONBOARDING_THEMES: Theme[] = [
  THEME_SLEEP,
  THEME_ENERGY,
  THEME_CONFIDENCE,
  THEME_DISCIPLINE,
  THEME_PROFESSIONAL,
  THEME_RELATIONS,
  THEME_SENSE,
  THEME_TRANSVERSE,
];

export function getThemeById(themeId: string): Theme | undefined {
  return ONBOARDING_THEMES.find((t) => t.id === themeId);
}

/**
 * Returns a display label for a theme id (ex: "SLP" -> "Sommeil").
 * If it's not a known theme id (ex: mock/legacy values), we return the input as-is.
 */
export function getThemeLabelById(themeIdOrLabel: string): string {
  const t = getThemeById(themeIdOrLabel);
  return t?.shortTitle ?? t?.title ?? themeIdOrLabel;
}



