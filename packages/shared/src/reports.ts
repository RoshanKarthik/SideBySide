import { z } from 'zod';

/*
 * AI post-interview reports (spec F5). The model is asked for JSON matching these schemas; the
 * server validates it before storing, so the pages can trust the shape.
 */

const text = (max: number) => z.string().trim().min(1).max(max);
const list = (max: number, items: number) => z.array(text(max)).max(items);

export const interviewerReportSchema = z.object({
  summary: text(1200),
  approach: text(1200),
  correctness: text(1000),
  complexity: text(800),
  codeQuality: text(1000),
  hintsUsage: text(600),
  keyMoments: z.array(z.object({ time: z.string().trim().max(12), text: text(300) })).max(10),
  integrity: text(800),
  suggestedScores: z
    .array(
      z.object({
        criterion: text(80),
        score: z.number().int().min(1).max(4),
        reasoning: text(500),
      }),
    )
    .max(8),
  openQuestions: list(300, 8),
});
export type InterviewerReport = z.infer<typeof interviewerReportSchema>;

export const candidateReportSchema = z.object({
  wentWell: list(400, 6),
  toImprove: list(400, 6),
  conceptsToStudy: list(200, 8),
  referenceApproach: text(2500),
  complexityNotes: text(800),
});
export type CandidateReport = z.infer<typeof candidateReportSchema>;

export const REPORT_KINDS = ['interviewer', 'candidate'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_STATUSES = ['pending', 'ready', 'failed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface ReportView<T> {
  status: ReportStatus;
  content: T | null;
  error: string | null;
  model: string | null;
  generatedAt: string | null;
}

/** `GET /rooms/:id/reports?round=n`, filtered for the caller. */
export interface SessionReports {
  /** False when no AI provider is configured on this server; the pages hide the feature. */
  enabled: boolean;
  round: number;
  /** Interviewers of the round only. */
  interviewer: ReportView<InterviewerReport> | null;
  /** Interviewers, and the candidate when the report is shared with them. */
  candidate: ReportView<CandidateReport> | null;
  /** Whether the caller may ask for the reports to be written again. */
  canRegenerate: boolean;
}
