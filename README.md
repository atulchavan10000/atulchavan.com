# atulchavan.com

Atul Chavan's personal engineering website. Built with Astro, TypeScript data, and plain CSS. All pages are statically generated; production pages ship no client-side JavaScript or external font requests.

## Local development

Use Node.js 24 and npm 11 (or a version satisfying package.json).

```sh
npm install
npm run dev -- --background
```

Open http://localhost:4321. `npm run dev` also starts the usual foreground server; this repository uses background mode for agent work.

```sh
npm run dev -- status
npm run dev -- logs
npm run dev -- stop
npm run build
npm run preview
```

On Windows, if npm is missing from PATH, open a terminal with Node.js installed or run `& 'C:\Program Files\nodejs\npm.cmd' run build` in PowerShell.

## Project structure

- `src/layouts/BaseLayout.astro`: shared page shell, navigation, footer, canonical URL, and social metadata.
- `src/styles/global.css`: palette, typography, responsive layout, focus styles, and reduced-motion support.
- `src/components/`: navbar, hero, reusable section title, project cards and illustrations, featured projects, current focus, journal preview, and footer.
- `src/pages/`: home, projects, engineering journal, about, and contact.
- `src/data/site.ts`: typed project summaries, planned journal entries, and contact configuration.
- `public/favicon.svg`: custom AC mark.
- `astro.config.mjs`: production site URL.

## Editing content

Edit project summaries, tags, and planned essays in `src/data/site.ts`. The first three projects and essays appear on the homepage. A project's optional `href` links its card to a full case study; other homepage cards link to the corresponding overview on `/projects`.

The Immich case study lives in `src/pages/projects/photos-to-immich.astro`, with three responsive diagrams in `src/components/ImmichDiagram.astro`. It covers the family photo cloud, migration, the 60% battery charge limit, and off-site recovery. Its Glacier section is written under the owner's requested assumption that Glacier is already in place; this edit did not deploy or verify a Glacier backup. Recovery testing is not claimed as completed.

Contact values intentionally start as `null`. Replace them with verified GitHub and LinkedIn URLs, `mailto:your-address`, and a resume URL (for example `/resume.pdf`, after adding that file under `public/`). The contact page automatically renders configured values as links. Unconfigured entries remain clearly labeled placeholders.

Journal topics are planned essays, not published articles. When the first writeups are ready, add Markdown files using Astro content collections and generate individual article routes. Avoid presenting unfinished drafts as published work.

## Design

Charcoal surfaces, off-white text, a restrained cyan accent, spacious typography, and lightweight engineering diagrams. The mobile navigation stays visible and wraps without JavaScript. Semantic landmarks, a skip link, active-page navigation, keyboard focus rings, and reduced-motion styles provide accessibility basics.

## Next steps

1. Add verified contact URLs and a resume.
2. Add project repository links and detailed case studies with evidence and architecture decisions.
3. Publish the first Markdown journal articles through content collections.
4. Add a social sharing image, sitemap, and RSS feed when publishing content.
5. Choose a host and deploy the generated `dist/` directory.
