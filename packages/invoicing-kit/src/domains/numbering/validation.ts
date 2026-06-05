import { z } from "zod";

export const documentTypeParam = z.enum(["INVOICE", "QUOTE"]);

export const getSequenceQuery = z.object({ documentType: documentTypeParam });

export const upsertSequenceBody = z.object({
  documentType: documentTypeParam,
  prefix: z.string().max(20).nullable().optional(),
  nextNumber: z.number().int().positive(),
  padWidth: z.number().int().min(1).max(12).nullable().optional(),
});

export const sequenceResponse = z.object({
  documentType: documentTypeParam,
  prefix: z.string().nullable(),
  nextNumber: z.number().int(),
  padWidth: z.number().int().nullable(),
});

export type SequenceResponse = z.infer<typeof sequenceResponse>;

export type UpsertSequenceBody = z.infer<typeof upsertSequenceBody>;

