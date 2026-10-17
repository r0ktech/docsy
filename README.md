# Docsy

**Ask your documents. Check every answer.**

Docsy is an AI document-intelligence app. You upload PDFs, Word files and text files. Docsy extracts and indexes them, then answers questions in plain language using only your documents. Every claim links to the exact passage, and the page when there is one, so you can check it.

Built with Next.js (App Router), PostgreSQL + pgvector, Prisma, and a pluggable LLM/embedding layer (Anthropic Claude, OpenAI, Voyage).

---

## Contents

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Quick start (local)](#quick-start-local)
- [Configuration](#configuration)
  - [Database and pgvector](#database-and-pgvector)
  - [File storage](#file-storage)
  - [AI providers](#ai-providers)
  - [Authentication and Google OAuth](#authentication-and-google-oauth)
  - [Password-reset email](#password-reset-email)
  - [Background jobs](#background-jobs)
  - [Plan limits](#plan-limits)
- [Deploying to Vercel](#deploying-to-vercel)
- [Testing](#testing)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Security model](#security-model)
- [Design notes](#design-notes)
- [Known limitations](#known-limitations)
- [API reference](docs/API.md)

---

## What it does

- **Upload** PDF, DOCX and TXT/Markdown files with progress, server-side content validation, size limits and duplicate detection.
- **Process** each file in the background: extract text page by page, split it into overlapping passages, embed them, and store them in Postgres. A document is only marked *Ready* once every step succeeds. Scanned PDFs without a text layer fail with a clear explanation, because there's no OCR yet. They are never marked as processed.
- **Ask** questions across your whole library, one collection, or hand-picked documents. Answers stream in, cite their sources, and say plainly when the documents don't contain the answer.
- **Verify**: clicking a citation opens the document beside the conversation, at the cited page, with the passage highlighted. Word and text files open in a clean text reader with the same highlighting.
- **Organise** documents into collections, search by name or by text inside documents, filter, sort, switch between grid and list views, and bulk delete.
- **Continue** conversations later. They get automatic titles, can be renamed, searched and deleted, and support follow-up questions and regenerate.
- **Track usage**: documents, storage, questions per month and AI tokens, with free-plan limits enforced on the server.

## How it works

```
 Upload                         Process (background job)                       Ask
 ──────                         ────────────────────────                       ───
 browser ─sha256─► /api/uploads   extract text per page (unpdf / mammoth)       question ──► rewrite follow-up
   │  (reserve row, limits,       ─► normalise, keep page boundaries                       into standalone query
   │   duplicate check)           ─► chunk ~400 tokens, 60 overlap,             embed query
   ├─PUT bytes─► S3 presigned       never crossing pages, char offsets kept     hybrid retrieval in Postgres:
   │            (or local route)  ─► embed (1024-d)                               pgvector cosine (HNSW)
   └─► /complete: verify size,    ─► one transaction: replace pages + chunks,   + full-text (tsvector, GIN)
       checksum, magic bytes         mark READY                                  ─► reciprocal rank fusion
       ─► QUEUED + enqueue job    ─► suggested questions (non-fatal)             ─► token-budgeted context
                                                                                 grounded prompt ─► stream answer
                                                                                 validate [n] markers against
                                                                                 retrieved chunks ─► persist
                                                                                 message + citations
```

**Retrieval.** Each query runs two searches over the user's own chunks: pgvector cosine similarity (catches paraphrases) and Postgres full-text search (catches exact names, numbers and codes that embeddings miss). The results are merged with Reciprocal Rank Fusion. Both queries filter on the requesting user and on `READY` documents in the conversation's scope. On pgvector ≥ 0.8, `hnsw.iterative_scan` keeps per-user filtering accurate with the HNSW index.

**Grounding.** Retrieved passages go to the model inside `<source id="n">` tags and are declared *untrusted content*: text inside them is evidence, never instructions, and attempts to forge or close tags are escaped. The system prompt requires a citation after every claim, verbatim quotes only, explicit labelling of inferences, and a plain "not enough information" answer when the evidence is missing. Conversation history is used only to resolve references and is never treated as evidence.

**Citations.** The model writes `[n]` markers. The server keeps only markers that point at sources actually supplied, renumbers them 1..k, and builds each citation from the retrieved chunk: document, page, character offsets and an excerpt chosen from the chunk text. Nothing in a citation comes from the model's own output. If nothing gets retrieved, no LLM call is made and the user is told the documents don't cover the question.

## Tech stack

| Area | Choice |
| --- | --- |
| App | Next.js 15 (App Router), React 19, JavaScript only |
| Styling | Tailwind CSS v4 with CSS-variable design tokens, light and dark themes, Radix primitives for menus and dialogs, Lucide icons |
| Database | PostgreSQL + pgvector, Prisma ORM with hand-tuned SQL migration (HNSW + GIN indexes, generated `tsvector`) |
| Auth | Custom: Argon2id passwords, opaque DB-backed sessions (SHA-256 hashed), Google OIDC with PKCE |
| AI | Anthropic Claude (default `claude-opus-5-5`, `claude-haiku-5-5` for utility tasks) or OpenAI; embeddings from OpenAI `text-embedding-3-small` or Voyage `voyage-3.5`, both at 1024 dimensions |
| Parsing | `unpdf` (pdf.js, serverless-friendly), `mammoth` (DOCX) |
| Viewer | `react-pdf` with text-layer passage highlighting |
| Storage | S3-compatible (AWS S3, Supabase Storage, Cloudflare R2, MinIO) or local disk for development |
| Jobs | Durable Postgres job queue (`FOR UPDATE SKIP LOCKED`), run after responses via Next.js `after()` and by Vercel Cron |
| Validation | Zod, with the same schemas shared by client and server |
| Tests | Vitest (unit + integration against real Postgres/pgvector via PGlite), Playwright (end-to-end) |

## Quick start (local)

Requirements: Node.js 20.9+ (tested on 24). Docker and a native Postgres build are **not** required.

```bash
npm install
cp .env.example .env          # then edit: see "Configuration"
npm run db:local              # terminal 1: Postgres + pgvector (PGlite) on :54329
npm run db:migrate            # apply migrations
npm run dev                   # terminal 2: http://localhost:3000
npm run db:seed               # optional, terminal 3: demo account + sample documents
```

`npm run db:local` runs [PGlite](https://pglite.dev) (Postgres compiled to WebAssembly) with the pgvector extension and serves it over the Postgres wire protocol. It's a development convenience. Use a real managed Postgres in production. The default `DATABASE_URL` in `.env.example` points at it. If you already run Postgres with pgvector, point `DATABASE_URL` there instead.

**Trying it without AI keys.** Set `LLM_PROVIDER=mock` and `EMBEDDING_PROVIDER=mock`. The mock providers are deterministic stand-ins used by the test suite. Search uses keyword-hashed vectors, and "answers" quote the retrieved passages verbatim. The app shows a banner whenever they're active, and they refuse to run in production unless `ALLOW_MOCK_AI=true`.

**Demo data.** `npm run db:seed` signs up `demo@docsy.local` / `docsy-demo-password`. It uploads the three fictional sample documents in `samples/` through the real upload API, labels them *Sample*, and groups them in a "Sample documents" collection.

## Configuration

Every variable is listed with comments in [`.env.example`](.env.example). Configuration is validated with Zod on first use. Optional integrations report whether they're configured (see `GET /api/health`), and the UI says what's missing instead of pretending a feature works.

### Database and pgvector

Docsy needs PostgreSQL 15+ with the `vector` extension (pgvector **0.8+** recommended for iterative index scans). The first migration runs `CREATE EXTENSION IF NOT EXISTS vector`.

| Provider | Setup |
| --- | --- |
| **Supabase** | Dashboard → Database → Extensions → enable `vector` (or let the migration do it). Use the **session pooler** or direct connection string (port 5432) and append `?sslmode=require`. |
| **Neon** | pgvector is available on all plans. Use the pooled connection string with `?sslmode=require`. |
| **Self-hosted** | Install pgvector ([instructions](https://github.com/pgvector/pgvector#installation)), then `CREATE EXTENSION vector;` as a superuser if the app role can't. |

Apply migrations with `npm run db:migrate` (`prisma migrate deploy`). The migration in `prisma/migrations/0001_init` is generated from `prisma/schema.prisma`, plus hand-written SQL for the HNSW index, GIN index, and generated `tsvector` column.

The embedding column is `vector(1024)`. All supported providers are configured to output 1024 dimensions. If you change the embedding **model**, reprocess documents, because chunks record the model that embedded them and retrieval only compares vectors from the same model.

For the local PGlite server, keep `pgbouncer=true` in the URL. It makes Prisma use unnamed prepared statements, which PGlite's connection multiplexer needs. It's harmless with PgBouncer/Supavisor too.

### File storage

`STORAGE_DRIVER=local` stores files under `LOCAL_STORAGE_DIR`. It's for development only, because serverless filesystems are ephemeral.

`STORAGE_DRIVER=s3` works with any S3-compatible provider. Create a **private** bucket and set `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and for non-AWS providers `S3_ENDPOINT` (plus `S3_FORCE_PATH_STYLE=true` for Supabase and MinIO).

- **Supabase:** Storage → create a private bucket → Settings → S3 Connection → enable and create access keys. Endpoint `https://<project-ref>.supabase.co/storage/v1/s3`, region = your project region.
- **Cloudflare R2:** create a bucket and an API token with object read/write. Endpoint `https://<account-id>.r2.cloudflarestorage.com`, region `auto`.
- **AWS S3:** keep *Block all public access* on. Grant the IAM user `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on the bucket.

Browsers upload straight to the bucket with a 10-minute presigned `PUT`, which avoids serverless request-size limits. Allow it with a CORS rule on the bucket:

```json
[{ "AllowedOrigins": ["https://your-app.example"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3000 }]
```

Downloads always go through `/api/documents/:id/file`, which checks ownership and streams the object, so no public or presigned read URLs are ever handed out.

### AI providers

| Variable | Default | Notes |
| --- | --- | --- |
| `LLM_PROVIDER` | `anthropic` | `anthropic`, `openai` (or any OpenAI-compatible endpoint via `OPENAI_BASE_URL`), `mock` |
| `LLM_MODEL` | `claude-opus-5-5` / `gpt-4.1` | Model that writes answers |
| `LLM_FAST_MODEL` | `claude-haiku-5-5` / `gpt-4.1-mini` | Titles, follow-up query rewriting, suggested questions |
| `LLM_EFFORT` | `medium` | Anthropic effort level for answers |
| `EMBEDDING_PROVIDER` | `openai` | `openai`, `voyage`, `mock` |
| `EMBEDDING_MODEL` | `text-embedding-3-small` / `voyage-3.5` | Must support 1024-dimensional output |

With Anthropic on supported models, Docsy enables the API's server-side refusal fallback (`fallbacks: "default"`). Answers stream over Server-Sent Events. Provider failures are mapped to clear, retryable messages (rate limited, unavailable, misconfigured), and failed answers are saved so the user can retry.

Anthropic doesn't offer an embeddings API, so the default setup pairs Claude for answers with OpenAI or Voyage for embeddings. You need **two** keys, for example `ANTHROPIC_API_KEY` + `OPENAI_API_KEY`.

### Authentication and Google OAuth

Email/password works with no extra setup. To enable Google sign-in:

1. Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* → Web application.
2. Authorized redirect URI: `${APP_URL}/api/auth/google/callback` (for example `http://localhost:3000/api/auth/google/callback`).
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The Google button appears only when both are set.

When a Google sign-in matches an existing account whose email was never verified, the account is linked. Its password and sessions are then revoked, because Google just proved who owns the address. This prevents pre-registration account takeover.

### Password-reset email

Set `RESEND_API_KEY` and `EMAIL_FROM` (on a domain verified in [Resend](https://resend.com)). Without them, the forgot-password page says email isn't configured. In development, the reset link is printed to the server log. Reset tokens are single-use, hashed at rest, expire after an hour, and revoke all sessions when used.

### Background jobs

Document processing runs as a job in the `Job` table:

- **Inline:** after an upload completes, `after()` processes queued jobs once the response has been sent (`INLINE_JOBS=true`, the default).
- **Cron:** `GET /api/jobs/run` (protected by `Authorization: Bearer $CRON_SECRET`) picks up anything left over, including retries scheduled with backoff. `vercel.json` schedules it daily, which is the most frequent schedule Vercel's Hobby plan allows. On Pro, change it to `*/5 * * * *`.
- **Self-hosting:** `CRON_SECRET=… npm run jobs:work` polls the endpoint every 5 seconds.

Jobs are claimed with `FOR UPDATE SKIP LOCKED`, so overlapping runners never process the same document twice. Stale locks are reclaimed after 10 minutes. Re-enqueueing reuses the job's row, and processing replaces a document's chunks in a single transaction, so retries never create duplicates.

### Plan limits

`MAX_UPLOAD_MB`, `FREE_MAX_DOCUMENTS`, `FREE_MAX_STORAGE_MB`, `FREE_MAX_QUESTIONS_PER_MONTH` and `MAX_PAGES_PER_DOCUMENT` are enforced on the server and shown on the landing page, dashboard and settings. Concurrent uploads are serialised per user with a Postgres advisory lock, so parallel requests can't race past a limit. `User.plan` and `planLimits()` are the hook for a billing provider: a webhook that sets `plan` is all it takes to unlock a different tier. No payment flow is implemented.

## Deploying to Vercel

1. Provision Postgres with pgvector (Supabase or Neon) and an S3-compatible bucket (see above).
2. Import the repository in Vercel. The build command `npm run build` runs `prisma generate` first.
3. Add the environment variables from `.env.example`. At minimum: `APP_URL` (your production URL), `DATABASE_URL`, `STORAGE_DRIVER=s3` with the `S3_*` values, the AI keys, and `CRON_SECRET`.
4. Run migrations against the production database once, from your machine or a CI step:
   ```bash
   DATABASE_URL="postgres://…" npm run db:migrate
   ```
5. Deploy. Check `https://your-app/api/health`, which reports database connectivity and which integrations are configured.
6. If you use Google sign-in, add the production redirect URI in Google Cloud Console.

Upload completion and chat routes set `maxDuration` of 60–120 s for long documents and streamed answers. Your Vercel plan's limits apply.

## Testing

```bash
npm test              # Vitest: unit + integration (93 tests)
npm run test:e2e      # Playwright: full user journey in Chromium
npm run lint
npm run build
```

- **Integration tests** start an in-memory Postgres with pgvector (PGlite), apply the real migration, and call the real services and route handlers. They cover authentication and sessions, CSRF, rate limiting, ownership isolation for documents, chunks, files, conversations and collections, upload validation (extension, magic bytes, checksum, oversized bodies), duplicate detection, extraction and chunking, idempotent processing and retries, scanned-PDF failure, embedding failures, retrieval and citation provenance, follow-ups, scope restriction, regenerate without duplicates, usage-limit enforcement, and deletion cleanup down to stored files.
- **E2E** (`tests/e2e`) starts an isolated database and app with mock AI. It then signs up, uploads a PDF, waits for processing, asks a question, opens the citation in the PDF viewer, and revisits the conversation from history.
- No test calls a paid API: AI providers are replaced by the deterministic `mock` providers.

Install the Playwright browser once with `npx playwright install chromium`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development, production build (runs `prisma generate`), production server |
| `npm run db:local` | Local Postgres + pgvector via PGlite (`PGLITE_DATA_DIR=memory://` for ephemeral) |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Demo account + labelled sample documents (app must be running) |
| `npm run db:studio` | Prisma Studio |
| `npm run jobs:work` | Poll the job runner (self-hosting / `INLINE_JOBS=false`) |
| `npm test`, `npm run test:e2e`, `npm run lint` | Tests and linting |
| `samples/build-samples.sh` | Rebuild sample PDF/DOCX from text sources (macOS) |

## Project structure

```
prisma/                 schema.prisma, migrations (incl. HNSW / GIN / tsvector SQL)
samples/                fictional, clearly labelled demo documents (+ text sources)
scripts/                local-db (PGlite), seed, worker
src/
  app/
    (marketing)/        landing, privacy, terms, contact
    (auth)/             sign-in, sign-up, forgot / reset password
    app/                authenticated app: overview, documents, collections, chat, chats, settings
    api/                route handlers (auth, uploads, documents, collections, conversations, account, jobs, health)
  components/
    ui/                 design-system primitives (button, field, dialog, menu, toast, status…)
    app/                shell, upload queue, library, collections, settings
    chat/               chat view, markdown + citation rendering, source panel
    viewer/             PDF viewer (react-pdf) and text viewer with highlighting
    marketing/, auth/, brand/
  lib/                  client-safe helpers: zod schemas, API client, SSE reader, formatting
  server/
    auth/               sessions, Argon2id, Google OIDC
    ai/                 providers (Anthropic/OpenAI/Voyage/mock), prompt, citations
    processing/         file sniffing, extraction, chunking, pipeline
    retrieval/          hybrid search, scope resolution
    services/           documents, collections, conversations, chat, usage, account, auth
    storage/            S3 and local drivers
    jobs/               durable queue + after() kick
    config.js, db.js, http.js, ratelimit.js, errors.js, log.js
tests/                  unit, integration (real SQL), e2e (Playwright)
```

## Security model

- **Authorisation on the server for every operation.** Every query that touches documents, chunks, pages, files, conversations, messages or collections is scoped by the session user's id. Resources belonging to other users return 404, so their existence isn't revealed. Retrieval SQL filters on both the chunk's and the document's owner. Hiding UI is never the protection.
- **Sessions:** 256-bit random tokens, stored only as SHA-256 hashes. The cookie is `HttpOnly`, `SameSite=Lax`, `Secure`, with the `__Host-` prefix over HTTPS. Sessions expire and slide, password changes and resets revoke other sessions, and users can sign out other devices.
- **CSRF:** cookie-authenticated mutations require a same-origin `Origin` header, on top of `SameSite=Lax`.
- **Rate limits** (Postgres-backed, so they hold across instances): sign-in per account and per IP, sign-up and password reset per IP, questions and uploads per user.
- **Uploads:** extension allow-list, server-side size limits, magic-byte content sniffing, SHA-256 verification against the declared checksum, sanitised filenames, and storage keys that contain no user input. Files are served with `nosniff`, `no-store`, `Content-Disposition`, and a sandbox CSP for non-PDF types.
- **Prompt injection:** document text is delimited, escaped and declared untrusted. The model is instructed never to follow instructions found in documents, and citations are validated against the retrieved sources server-side.
- **Errors:** users see stable codes and friendly messages. Stack traces and provider errors stay in structured server logs. Secrets live only in server code (`server-only` imports enforce this), never in client bundles.

## Design notes

The interface uses cool paper neutrals with slate ink and a single accent: a highlighter yellow reserved for evidence. It marks citations, highlighted passages, the brand mark and focus rings. Type pairs Newsreader (reading and display) with Schibsted Grotesk (interface). The landing page's one animation is a highlighter sweeping across a cited passage, which is the product's core interaction. The app supports light, dark and system themes, keyboard navigation with visible focus states, reduced-motion preferences, and responsive layouts from 360 px up.

## Known limitations

- **No OCR.** Scanned PDFs fail with an explanation. Adding OCR (for example Tesseract, or a vision model) at the extraction step is the natural next feature.
- **DOCX files have no page numbers.** Word documents have no fixed pagination, so their citations point to the exact passage in the extracted-text reader rather than a page.
- **Billing** is structured for, but not implemented. Only the free plan exists.
- **Background processing on serverless** relies on `after()` plus cron. Very large documents on short function limits may need the standalone worker or a queue service.
- The local PGlite database is for development and tests only.
