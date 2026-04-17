export interface PathLevel {
  levelId: number;
  title: string;
  cardName: string;
  question: string;
  advice: string;
}

export interface WeekPath {
  questionId: string;
  levels: PathLevel[];
}

