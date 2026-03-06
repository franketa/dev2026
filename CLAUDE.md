# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monorepo of client landing pages deployed independently to Coolify. Each client lives in `clients/<client-name>/`. The primary language is Spanish (Argentina) — all user-facing text should be in Spanish.

## Architecture

There are two types of client projects:

1. **Static HTML sites** (majority): Single `index.html` with `assets/` folder (CSS, JS, images). No build step — just open `index.html` or serve with any static server. Examples: tienda-box, haven-gym, broncomateriales, santorinienespanol, prohousetattoo, estudio-juridico-ridao, maria-laura-rizzo, estudio-arquitectura-cata.

2. **Next.js apps**: Full React/Next.js projects with `package.json`. Example: `presto-chivilcoy` (Next.js 16, React 19, Tailwind CSS 4, Supabase, TypeScript).

3. **Data-driven static sites**: Static HTML but with external data (JSON files) and multiple pages. Example: `inmobiliaria-diiorio` (index.html, property.html, admin.html with JSON property data).

A `templates/base-template/` directory exists for scaffolding new clients.

## Commands

### Static HTML clients
No build commands. Preview by opening `index.html` directly or using a local server:
```bash
cd clients/<client-name>
npx serve .
```

### Next.js clients (e.g., presto-chivilcoy)
```bash
cd clients/presto-chivilcoy
npm install
npm run dev      # Development server
npm run build    # Production build
npm run lint     # ESLint
```

## Conventions

- **Branch naming**: `claude/<client-name>` for feature branches (e.g., `claude/tienda-box`)
- **Deployment**: Each client folder is deployed independently to Coolify by pointing to its subdirectory
- **Static sites use BEM-style CSS** with component-scoped class names (e.g., `nav__logo`, `nav__toggle`)
- **Google Fonts** are loaded via `<link>` tags, not self-hosted
- **Mobile-first**: Sites target 90%+ mobile/tablet users — always prioritize responsive design
- **Images**: Should be optimized for web; use appropriate formats (jpg, webp, png)
