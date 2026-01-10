
export interface Student {
  id: string;
  name: string;
}

export interface ExamConfig {
  subject: string;
  totalQuestions: number;
  answerKey: string[];
  students: Student[];
}

export interface ExamResult {
  studentId: string;
  studentName: string;
  score: number;
  total: number;
  detectedAnswers: string[];
  scanDate: string;
}

export enum AppState {
  SETUP = 'SETUP',
  SCANNING = 'SCANNING',
  REVIEW = 'REVIEW',
  COMPLETED = 'COMPLETED'
}
