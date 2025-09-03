import { z } from "zod";

export const UUID = z.string().uuid();

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const companyParamSchema = z.object({
  companyId: z.string().uuid(),
});
