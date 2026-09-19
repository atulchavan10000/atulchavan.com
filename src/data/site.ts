// Replace null with verified profile URLs, a mailto: URL, or a public resume path.
export const contacts: { label: string; detail: string; href: string | null }[] = [
  { label: 'GitHub', detail: 'Code, experiments, and engineering tools', href: null },
  { label: 'LinkedIn', detail: 'Professional background and connections', href: null },
  { label: 'Email', detail: 'Start a conversation', href: null },
  { label: 'Resume', detail: 'Experience and engineering background', href: null },
];
export interface Project {
  slug: string; number: string; title: string; category: string; description: string; tags: string[];
  visual: 'framework' | 'pipeline' | 'server' | 'nas' | 'triage';
}
export const projects: Project[] = [
  { slug: 'ai-test-framework', number: '01', title: 'AI Test Framework', category: 'Automation architecture',
    description: 'Designing a modern Java API automation framework with API client abstractions, interceptors, TestNG, reporting, data management, and AI-assisted test generation.',
    tags: ['Java', 'API Testing', 'TestNG', 'Architecture', 'AI'], visual: 'framework' },
  { slug: 'jenkins-fan-out', number: '02', title: 'Jenkins Fan-out Pipeline', category: 'Developer productivity',
    description: 'Built a Jenkins fan-out execution model to shard hundreds of tests and reduce regression execution time by around 90%.',
    tags: ['Jenkins', 'Groovy', 'CI/CD', 'Test Automation'], visual: 'pipeline' },
  { slug: 'photos-to-immich', number: '03', title: 'Google Photos → Immich', category: 'Self-hosted infrastructure',
    description: 'Self-hosted Immich on a Debian server as a private family photo backup platform, replacing reliance on Google Photos.',
    tags: ['Docker', 'Debian', 'Immich', 'Self Hosting', 'Tailscale'], visual: 'server' },
  { slug: 'raspberry-pi-nas', number: '04', title: 'Raspberry Pi Home NAS', category: 'Home lab',
    description: 'Built a Raspberry Pi based photo backup NAS with external storage, Samba shares, and family member isolation.',
    tags: ['Raspberry Pi', 'Linux', 'Samba', 'Home Lab'], visual: 'nas' },
  { slug: 'ai-jenkins-triage', number: '05', title: 'AI Jenkins Triage Agent', category: 'AI-assisted engineering',
    description: 'Built an AI-assisted failure triage workflow that groups Jenkins failures, searches contextual documentation, and helps identify root causes faster.',
    tags: ['AI', 'Jenkins', 'Automation', 'Developer Tools'], visual: 'triage' },
];
export const journal = [
  { category: 'Self hosting', title: 'Replacing Google Photos with Immich', description: 'Private photo storage, practical infrastructure, and the trade-offs of running it yourself.' },
  { category: 'Architecture', title: 'Building a Java API Automation Framework', description: 'Thinking through client abstractions, test data, and a framework that can grow.' },
  { category: 'CI/CD', title: 'Reducing Regression Time with Jenkins Fan-out', description: 'Notes on parallel execution, test sharding, and making feedback loops shorter.' },
  { category: 'AI in testing', title: 'AI in Testing: Practical Use Cases', description: 'Exploring where AI can support testing and where engineering judgment still matters.' },
  { category: 'Home lab', title: 'Building a Raspberry Pi NAS', description: 'Storage, Samba shares, and learning by building a family photo backup system.' },
  { category: 'Engineering', title: 'How I Think About Test Architecture', description: 'Designing tools and platforms that help teams build confidence in their software.' },
];
