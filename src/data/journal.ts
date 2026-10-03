import { getCollection } from 'astro:content';

export const seriesTitle = 'Building a Java API Automation Framework: Design Decisions in Practice';
export const frameworkSeriesId = 'framework-design';

export async function getJournalEntries() {
  const entries = await getCollection('journal');
  return entries.sort((a, b) => b.data.date.localeCompare(a.data.date));
}

export async function getFrameworkSeries() {
  const entries = await getJournalEntries();
  return entries
    .filter(entry => entry.data.series === frameworkSeriesId)
    .sort((a, b) => (a.data.part ?? 0) - (b.data.part ?? 0));
}

export async function getStandaloneJournalEntries() {
  const entries = await getJournalEntries();
  return entries.filter(entry => !entry.data.series);
}
