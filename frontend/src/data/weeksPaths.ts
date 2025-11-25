import type { WeekPath } from './weeks/types';
import { week1Paths } from './weeks/week1';
import { week2Paths } from './weeks/week2';
import { week3Paths } from './weeks/week3';
import { week4Paths } from './weeks/week4';
import { week5Paths } from './weeks/week5';
import { week6Paths } from './weeks/week6';
import { week7Paths } from './weeks/week7';
import { week8Paths } from './weeks/week8';
import { week9Paths } from './weeks/week9';
import { week10Paths } from './weeks/week10';
import { week11Paths } from './weeks/week11';
import { week12Paths } from './weeks/week12';

// Export types
export type { WeekPath, PathLevel } from './weeks/types';

export const WEEKS_PATHS: Record<string, WeekPath> = {
  ...week1Paths,
  ...week2Paths,
  ...week3Paths,
  ...week4Paths,
  ...week5Paths,
  ...week6Paths,
  ...week7Paths,
  ...week8Paths,
  ...week9Paths,
  ...week10Paths,
  ...week11Paths,
  ...week12Paths,
};
