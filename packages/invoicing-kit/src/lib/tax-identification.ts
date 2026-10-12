import { z } from "zod";

export const TAX_ID_MAX_LENGTH = 40;
export const TAX_ID_TYPE_MAX_LENGTH = 20;

export const taxIdSchema = z.string().max(TAX_ID_MAX_LENGTH);
export const taxIdTypeSchema = z.string().trim().min(1).max(TAX_ID_TYPE_MAX_LENGTH);
