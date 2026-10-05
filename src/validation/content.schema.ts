import { z } from "zod";

export const heroContentSchema = z.object({
  headlinePart1: z.string().trim().min(1, "Headline part 1 is required"),
  headlinePart2: z.string().trim().min(1, "Headline part 2 is required"),
  rotatingWords: z
    .array(z.string().trim().min(1, "Word cannot be empty"))
    .min(1, "At least one rotating word is required"),
  description: z.string().trim().min(1, "Description is required"),
  searchPlaceholder: z
    .string()
    .trim()
    .optional()
    .default("Search by title, author, publisher, ISBN..."),
});

export const ebookPageItemSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  quote: z.string().trim().min(1, "Quote is required"),
  progress: z.coerce.number().min(0).max(100).optional().default(50),
});

export const ebooksContentSchema = z.object({
  badge: z.string().trim().min(1, "Badge is required"),
  heading: z.string().trim().min(1, "Heading is required"),
  headingAccent: z.string().trim().min(1, "Heading accent is required"),
  description: z.string().trim().min(1, "Description is required"),
  ctaText: z.string().trim().min(1, "CTA text is required"),
    ctaLink: z.string().trim().min(1, "CTA link is required"),
  books: z.array(ebookPageItemSchema).optional().default([
    {
      title: "Pride and Prejudice",
      quote:
        "“It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.”",
      progress: 42,
    },
    {
      title: "Alice's Adventures in Wonderland",
      quote: "“Curiouser and curiouser!”",
      progress: 56,
    },
    {
      title: "The Great Gatsby",
      quote:
        "“So we beat on, boats against the current, borne back ceaselessly into the past.”",
      progress: 71,
    },
    {
      title: "The Adventures of Sherlock Holmes",
      quote: "“There is nothing more deceptive than an obvious fact.”",
      progress: 84,
    },
  ]),
});

export const poetryContentSchema = z.object({
  badge: z.string().trim().min(1, "Badge is required"),
  quote: z.string().trim().min(1, "Quote is required"),
  quoteAccent: z.string().trim().min(1, "Quote accent is required"),
  author: z.string().trim().min(1, "Author is required"),
  ctaText: z.string().trim().min(1, "CTA text is required"),
  ctaLink: z.string().trim().min(1, "CTA link is required"),
});

export const announcementContentSchema = z.object({
  badge: z.string().trim().min(1, "Badge is required"),
  text: z.string().trim().min(1, "Announcement text is required"),
  code: z.string().trim().optional().default(""),
  cta: z.string().trim().min(1, "CTA text is required"),
  link: z.string().trim().min(1, "Link is required"),
});

export const newsletterContentSchema = z.object({
  heading: z.string().trim().min(1, "Heading is required"),
  headingAccent: z.string().trim().min(1, "Heading accent is required"),
  description: z.string().trim().min(1, "Description is required"),
});

export const updateSiteContentSchema = z.object({
  hero: heroContentSchema.partial().optional(),
  ebooks: ebooksContentSchema.partial().optional(),
  poetry: poetryContentSchema.partial().optional(),
  announcement: announcementContentSchema.partial().optional(),
  newsletter: newsletterContentSchema.partial().optional(),
});

export const contentSectionParamSchema = z.object({
  section: z.enum(["hero", "ebooks", "poetry", "announcement", "newsletter"]),
});

export const resetSectionSchema = z.object({
  section: z.enum(["hero", "ebooks", "poetry", "announcement", "newsletter"]).optional(),
});

export type HeroContentInput = z.infer<typeof heroContentSchema>;
export type EbooksContentInput = z.infer<typeof ebooksContentSchema>;
export type PoetryContentInput = z.infer<typeof poetryContentSchema>;
export type AnnouncementContentInput = z.infer<typeof announcementContentSchema>;
export type UpdateSiteContentInput = z.infer<typeof updateSiteContentSchema>;
export type ContentSectionParamInput = z.infer<typeof contentSectionParamSchema>;
export type ResetSectionInput = z.infer<typeof resetSectionSchema>;

export type NewsletterContentInput = z.infer<typeof newsletterContentSchema>;

export type EbookPageItemInput = z.infer<typeof ebookPageItemSchema>;
