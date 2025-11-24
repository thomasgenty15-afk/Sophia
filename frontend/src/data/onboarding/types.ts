export type QuestionOption = {
  label: string;
  isOther?: boolean;
};

export type DetailQuestion = {
  id: string;
  question: string;
  options: QuestionOption[];
  type: 'single' | 'multiple';
};

export type Problem = {
  id: string;
  label: string;
  detailQuestions: DetailQuestion[];
};

export type Axis = {
  id: string;
  title: string;
  description: string;
  problemsTitle: string;
  problems: Problem[];
};

export type Theme = {
  id: string;
  title: string;
  shortTitle?: string;
  icon?: string;
  axes?: Axis[];
  // Propriétés optionnelles pour accommoder les objets Axis mal placés
  description?: string;
  problemsTitle?: string;
  problems?: Problem[];
};

