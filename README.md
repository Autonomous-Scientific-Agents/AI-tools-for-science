# AI Tools Directory

[![Deploy to GitHub Pages](https://github.com/Autonomous-Scientific-Agents/AI-tools-for-science/actions/workflows/deploy.yml/badge.svg)](https://github.com/Autonomous-Scientific-Agents/AI-tools-for-science/actions/workflows/deploy.yml)
[![Website](https://img.shields.io/badge/website-live-196b63)](https://autonomous-scientific-agents.github.io/AI-tools-for-science/)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-deployed-222222?logo=githubpages)](https://autonomous-scientific-agents.github.io/AI-tools-for-science/)

Public AI tools directory built with React, TypeScript, Vite, Tailwind CSS, and Supabase.

Live site: https://autonomous-scientific-agents.github.io/AI-tools-for-science/

This project started as a curated list of AI tools for students in the [Intro to HPC Undergraduate Bootcamp](https://intro-hpc-bootcamp.alcf.anl.gov/).

The directory imports all tools from `AI_Tools_Updated_with_Open_Science.xlsx`. Ratings, comments, and use counts are not seeded; they are collected from visitors through Supabase.

## Features

- Searchable and filterable AI tool cards
- Category filters from the spreadsheet
- Tool detail pages with source and official links
- 1-5 star ratings with one editable rating per user or anonymous identity
- Average rating, rating count, comment count, and "I use this" count
- Guest browsing, guest ratings, and guest comments through Supabase anonymous auth
- Optional email account linking and magic-link sign-in
- Suggest a Tool form
- Admin moderation for comments and submitted tools
- GitHub Pages deployment workflow

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

Without Supabase env vars, the app runs in local demo mode using the spreadsheet seed data and browser local storage. With Supabase configured, it signs guests in anonymously and persists activity to the database.

## Supabase Setup

1. Create a Supabase project.
2. In Authentication settings, enable Anonymous Sign-Ins.
3. Run `supabase/schema.sql` in the SQL editor.
4. Run `supabase/seed.sql` in the SQL editor.
5. Copy the project URL and public anon key into `.env`.

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_BASE_PATH=/
```

Anonymous users are still authenticated identities in Supabase, so RLS policies allow them to rate, comment, mark usage, and suggest tools without a login form.

## Admin Access

After signing in once, promote the account in Supabase SQL:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@example.com';
```

Admins can open `#/admin` to approve or reject comments and submitted tools. Approving a tool suggestion creates an approved record in `public.tools`.

## Database Files

- `supabase/schema.sql` creates tables, indexes, RLS policies, admin helper functions, and the `tool_metrics` view.
- `supabase/seed.sql` imports the 30 spreadsheet tools only.
- `supabase/normalize_categories.sql` updates an existing database from the original spreadsheet category labels to the simplified public labels.
- `scripts/extract_tools.py` regenerates `src/data/seedTools.ts` and `supabase/seed.sql` from the workbook.

To regenerate after editing the workbook:

```bash
npm run import:tools
```

## GitHub Pages Deployment

The workflow in `.github/workflows/deploy.yml` builds and deploys `dist` to GitHub Pages on pushes to `main`.

Set these repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

In GitHub repository settings, set Pages source to GitHub Actions.

For project pages, the workflow sets `VITE_BASE_PATH` to `/${{ github.event.repository.name }}/`. For a custom domain, override the workflow env to `/`.

## Build

```bash
npm run build
```
