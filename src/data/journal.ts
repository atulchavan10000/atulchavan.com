import { getCollection } from 'astro:content';

export const seriesTitle = 'Building a Java API Automation Framework: Design Decisions in Practice';

export async function getFrameworkSeries() {
  const entries = await getCollection('journal');
  return entries.sort((a, b) => a.data.part - b.data.part);
}
