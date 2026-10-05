import { z } from "zod";

export const subscribeNewsletterSchema = z.object({
  email: z
    .string({
      message: "Email address is required",
    })
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address"),
  source: z.string().trim().optional().default("footer"),
  preferences: z
    .object({
      newReleases: z.boolean().optional().default(true),
      priceDrops: z.boolean().optional().default(true),
      offers: z.boolean().optional().default(true),
    })
    .optional()
    .default({
      newReleases: true,
      priceDrops: true,
      offers: true,
    }),
});

export type SubscribeNewsletterInput = z.infer<
  typeof subscribeNewsletterSchema
>;

export const unsubscribeNewsletterSchema = z.object({
  email: z
    .string({
      message: "Email address is required",
    })
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address"),
});

export type UnsubscribeNewsletterInput = z.infer<
  typeof unsubscribeNewsletterSchema
>;

export const newsletterQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(20),
  search: z.string().trim().optional(),
  isSubscribed: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  sortBy: z.enum(["createdAt", "email"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type NewsletterQueryInput = z.infer<typeof newsletterQuerySchema>;
