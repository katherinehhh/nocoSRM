import { z } from 'zod';
export const aiPurposes = [
  'quoteDecision',
  'requestDraft',
  'qualityReturn',
] as const;
export const AiAnalyzeInput = z
  .object({
    purpose: z.enum(aiPurposes),
    kind: z.enum(['rfq', 'inspection']),
    id: z.string().uuid(),
    version: z.number().int().positive(),
    text: z.string().max(8000).default(''),
    requestKey: z.string().uuid(),
  })
  .strict();
export type AiAnalyze = z.infer<typeof AiAnalyzeInput>;
export const AiSuggestion = z
  .object({
    summary: z.string().min(1).max(2000),
    reason: z.string().max(2000),
    findings: z
      .array(
        z
          .object({
            evidence: z.string().max(500),
            observation: z.string().max(1000),
          })
          .strict(),
      )
      .max(20),
    uncertainties: z.array(z.string().max(500)).max(20),
    selectedQuoteId: z.string().uuid().nullable(),
    lines: z
      .array(
        z
          .object({
            id: z.string().max(64),
            materialId: z.string().max(64),
            quantity: z.number().int().positive().max(100000),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type AiOutput = z.infer<typeof AiSuggestion>;
export interface AiProposal {
  id: string;
  purpose: AiAnalyze['purpose'];
  kind: AiAnalyze['kind'];
  recordId: string;
  recordName: string;
  version: number;
  createdAt: string;
  expiresAt: string;
  model: { modelService: string; model: string };
  suggestion: AiOutput;
  canApply: boolean;
  status: 'pending' | 'applied';
  result?: { id: string; kind: string; path: string };
}
