import { z } from 'zod';

export const DreQuerySchema = z.object({
    tenantId: z.string(),
    from: z.string(), // YYYY-MM
    to: z.string(), // YYYY-MM
    basis: z.enum(['caixa', 'competencia']),
    currency: z.string().default('BRL')
});

export type DreQuery = z.infer<typeof DreQuerySchema>;
