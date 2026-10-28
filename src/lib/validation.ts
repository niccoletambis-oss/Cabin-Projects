import { z } from "zod";
const count = z.coerce.number().int().min(0).max(1_000_000);
export const itemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "SKU may contain letters, numbers, dashes and underscores",
    )
    .transform((v) => v.toUpperCase()),
  unit: z.string().trim().min(1).max(20),
  quantity: count,
  minimumStock: count,
  unitCost: z.coerce
    .number()
    .min(0)
    .max(1_000_000)
    .refine(
      (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001,
      "Use at most two decimal places",
    ),
  categoryId: z.string().min(1),
  locationId: z.string().min(1),
});
export const stockSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(["IN", "OUT"]),
  quantity: z.coerce.number().int().positive().max(1_000_000),
  note: z
    .string()
    .trim()
    .min(3, "Please provide a reason (at least 3 characters)")
    .max(240),
});
