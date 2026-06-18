import { z } from "zod";
import { DocumentType } from "../../types";

export const documentTypeParam = z.nativeEnum(DocumentType);

export const getSequenceQuery = z.object({
  documentType: documentTypeParam,
  prefix: z.string().max(20).optional(),
});

export const listSequencesQuery = z.object({ documentType: documentTypeParam });

export const upsertSequenceBody = z.object({
  documentType: documentTypeParam,
  prefix: z.string().max(20).nullable().optional(),
  label: z.string().max(100).nullable().optional(),
  nextNumber: z.number().int().positive(),
  padWidth: z.number().int().min(1).max(12).nullable().optional(),
});

export const sequenceResponse = z.object({
  documentType: documentTypeParam,
  prefix: z.string().nullable(),
  label: z.string().nullable(),
  nextNumber: z.number().int(),
  padWidth: z.number().int().nullable(),
});

export const sequenceListResponse = z.array(sequenceResponse);

export type SequenceResponse = z.infer<typeof sequenceResponse>;

export type UpsertSequenceBody = z.infer<typeof upsertSequenceBody>;
