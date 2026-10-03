import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const journal = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/journal' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    date: z.string(),
    series: z.string().optional(),
    part: z.number().int().positive().optional(),
    diagram: z.object({
      title: z.string(),
      steps: z.array(z.object({ title: z.string(), detail: z.string() })),
      caption: z.string(),
    }),
    sources: z.array(z.string()),
  }),
});

export const collections = { journal };
