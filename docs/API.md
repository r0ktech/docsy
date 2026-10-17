# Docsy API reference

All endpoints live under `/api`, accept and return JSON (except where noted), and authenticate with the session cookie set by sign-in, sign-up or Google OAuth.

**Conventions**

- **Auth:** endpoints marked 🔒 return `401 UNAUTHORIZED` without a valid session.
- **CSRF:** `POST`/`PUT`/`PATCH`/`DELETE` requests must send an `Origin` header matching `APP_URL`. Browsers do this automatically.
- **Ownership:** resources owned by another user return `404 NOT_FOUND`.
- **Errors** share one shape:
  ```json
  { "error": { "code": "DOCUMENT_LIMIT_REACHED", "message": "You've reached the 25-document limit…", "details": {} } }
  ```
  Common codes: `VALIDATION_ERROR` (422), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `DUPLICATE_DOCUMENT` / `EMAIL_IN_USE` / `ANSWER_IN_PROGRESS` (409), `DOCUMENT_LIMIT_REACHED` / `STORAGE_LIMIT_REACHED` / `QUESTION_LIMIT_REACHED` (402), `RATE_LIMITED` (429, with `Retry-After`), `AI_NOT_CONFIGURED` / `AI_UNAVAILABLE` / `AI_RATE_LIMITED` / `DATABASE_UNAVAILABLE` (503), `INTERNAL_ERROR` (500).

## Auth

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/auth/sign-up` | `{ name, email, password }` | 201, sets the session cookie. Password must be 10–128 characters. |
| POST | `/auth/sign-in` | `{ email, password }` | Rate-limited per account and per IP. |
| POST | `/auth/sign-out` | — | Deletes the server-side session. |
| POST | `/auth/forgot-password` | `{ email }` | Always `200 { ok, emailConfigured }`, so it doesn't reveal whether an account exists. |
| POST | `/auth/reset-password` | `{ token, password }` | Single-use token. Signs out all sessions, then starts a new one. |
| GET | `/auth/google?next=/app` | — | Redirects to Google (PKCE). |
| GET | `/auth/google/callback` | — | OAuth callback. Redirects to `next`. |

## Uploads (3 steps)

1. 🔒 `POST /uploads` with `{ filename, size, sha256 }` → `201 { document, upload: { method, url, headers } }`.
   Validates type, size and plan limits, detects duplicates (`409 DUPLICATE_DOCUMENT` with `details.documentId`), and reserves a document in `UPLOADING` state.
2. Send the raw file bytes with `upload.method` to `upload.url`. This is a presigned S3 URL, or, with local storage, 🔒 `PUT /uploads/:id/content`.
3. 🔒 `POST /uploads/:id/complete` → `{ document }`.
   The server checks size, SHA-256 and file signature, then marks the document `QUEUED` and starts processing. Invalid files are deleted and rejected with `422`.

Document `status` moves `UPLOADING → QUEUED → PROCESSING → READY | FAILED`. Failed documents carry `errorCode` and `errorMessage` (for example `NO_EXTRACTABLE_TEXT`, `PDF_ENCRYPTED`, `FILE_CORRUPT`, `AI_UNAVAILABLE`).

## Documents 🔒

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/documents?q=&type=&status=&collectionId=&sort=&order=&page=&pageSize=` | Paginated list. `q` matches title, filename and extracted text. `sort` ∈ `createdAt`, `title`, `sizeBytes`. |
| GET | `/documents/:id` | Metadata, collections, citation count, suggested questions. |
| PATCH | `/documents/:id` | `{ title }` |
| DELETE | `/documents/:id` | Deletes the row, pages, chunks, job and stored file. Existing citations keep their excerpt; their `documentId` becomes `null`. |
| POST | `/documents/bulk-delete` | `{ ids: string[] }` (max 100) |
| POST | `/documents/:id/retry` | Only for `FAILED` documents. |
| GET | `/documents/:id/text` | `{ segments: [{ number, text }] }`: pages for PDFs, one segment for DOCX/TXT. |
| GET | `/documents/:id/file[?download=1]` | Streams the original file (`no-store`). |

## Collections 🔒

| Method | Path | Body |
| --- | --- | --- |
| GET | `/collections` | — |
| POST | `/collections` | `{ name, description? }` |
| GET / PATCH / DELETE | `/collections/:id` | PATCH: `{ name?, description? }`. Deleting never deletes the documents in it. |
| POST / DELETE | `/collections/:id/documents` | `{ documentIds: string[] }` |

## Conversations 🔒

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/conversations?q=&cursor=` | Cursor-paginated. `q` searches titles and message text. |
| POST | `/conversations` | `{ scope }` where `scope` is `{ type: "LIBRARY" }`, `{ type: "COLLECTION", collectionId }` or `{ type: "DOCUMENTS", documentIds }`. |
| GET | `/conversations/:id` | Messages with citations. |
| PATCH | `/conversations/:id` | `{ title }` |
| DELETE | `/conversations/:id` | |
| POST | `/conversations/:id/messages` | `{ question }` → **Server-Sent Events** (below). |
| POST | `/conversations/:id/regenerate` | `{ userMessageId }` (latest question only) → SSE. Atomically replaces the previous answer. |

### Answer stream (SSE)

Validation, limit and authorisation errors are returned as JSON before the stream starts. Once streaming begins, events are:

| Event | Data |
| --- | --- |
| `start` | `{ userMessage, assistantMessageId, title? }` |
| `status` | `{ stage: "searching" }`, then `{ stage: "generating", sources, documents }` |
| `delta` | `{ text }`: incremental answer text (citation numbers are provisional while streaming) |
| `done` | `{ message }`: final saved message with renumbered `[n]` markers and `citations[]` |
| `title` | `{ title }`: generated title (first exchange only) |
| `error` | `{ code, message, assistantMessageId }`: the answer is saved as `FAILED` |

Each citation contains `{ sourceIndex, documentId, documentName, pageNumber, segmentNumber, charStart, charEnd, excerpt }`. `pageNumber` is `null` when the format has no pages. To open the document at the passage, use `/app/documents/:documentId?page=&seg=&start=&end=`.

Generation continues even if the client disconnects, so the answer is saved either way.

## Account 🔒

| Method | Path | Body |
| --- | --- | --- |
| GET | `/account` | — |
| PATCH | `/account` | `{ name }` |
| DELETE | `/account` | `{ confirm: "DELETE" }`. Deletes everything, including stored files. |
| POST | `/account/password` | `{ currentPassword?, newPassword }`. `currentPassword` is required if a password exists. Signs out other sessions. |
| DELETE | `/account/sessions` | Signs out all other sessions. |
| GET | `/usage` | `{ usage: { documents, storageBytes, questionsThisMonth, tokensThisMonth, periodStart, limits } }` |

## Operations

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | `{ status, database, integrations }`. Reports what is configured, never secret values. |
| GET/POST | `/jobs/run` | Requires `Authorization: Bearer $CRON_SECRET`. Processes due jobs for up to about 50 s. |
