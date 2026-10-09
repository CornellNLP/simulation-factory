# Public Assistant Toolkit

A web toolkit, built by [CornellNLP](https://www.cs.cornell.edu/~cristian/), for authoring and running **mediated multi-party conversation simulations**. Researchers use it to design LLM **agents**, **public assistants**, and **private assistants** as reusable YAML templates, pair them into experiments, and run those experiments on the external **ConvoArena** platform. Completed experiments can be exported as [ConvoKit](https://convokit.cornell.edu/) corpora for analysis via the companion [`convokit-service`](./convokit-service/README.md).

## Toolkits

The app is organized as a set of authoring toolkits that share one Next.js codebase:

- **Simulation** (`/simulation`) — pair agents, public assistants, and private assistants into an experiment, then run and export it.
- **Public Assistant** (`/public-assistant`) — author public assistant prompts that referee a discussion.
- **Agent Participant** (`/agent-participant`) — author LLM personas that take part in a conversation.
- **Private Assistant** (`/private-assistant`, `/private-assistant-reddit`, `/private-assistant-wp`) — author assistants that privately help one human participant, including domain-specific variants for Reddit (ChangeMyView-style) and Wikipedia talk-page discussions.

## Architecture

1. A researcher authors agent/public-assistant/private-assistant templates in the relevant toolkit and saves them to their personal library (Firestore).
2. In the Simulation toolkit, templates are paired together into an experiment definition.
3. `app/api/create-experiment` (`generator.ts` + `parsers/*`) assembles a full experiment payload and sends it to the external **ConvoArena** backend (Firebase Cloud Functions), authenticated with `DL_API_KEY`. TrAuSt is the engine that actually runs the conversation (human-human, human-agent, or agent-agent) — it lives in a separate repository, not this one.
4. The toolkit polls experiment progress (`app/api/simulation-status`) and exports results (`app/api/export-experiment`).
5. Exported results can optionally be converted into a ConvoKit corpus by the standalone Python **`convokit-service`** microservice — see [`convokit-service/README.md`](./convokit-service/README.md) for details on that service.

Firebase (Firestore + Auth) is used throughout for sign-in and for storing each user's library of saved agents, public assistants, private assistants, and templates.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router), React 19, TypeScript, Tailwind CSS 4
- Firebase (client SDK + Admin SDK) for Auth and Firestore
- `js-yaml` for template parsing, `driver.js` for onboarding tours
- Deployed via [Vercel](https://vercel.com) or Docker/Cloud Run

## Prerequisites

- Node.js 22+
- A Firebase project (or the local emulators described below)
- An API key for the TrAuSt / ConvoArena backend (`DL_API_KEY`)
- Optionally, a running instance of `convokit-service` if you want to exercise corpus export locally

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the example environment file and fill in your values:
   ```bash
   cp .env.example .env
   ```
   See [Environment variables](#environment-variables) below for what each one does.
3. If you have a sibling checkout of the `TrAuSt` repo, `npm run dev` will automatically sync `DL_API_KEY` from `../TrAuSt/.env` into this project's `.env` via `scripts/sync-dl-key.mjs` (override the source path with `DL_ENV_PATH`). This is purely a convenience — if you set `DL_API_KEY` manually in `.env`, you can ignore it; the sync step warns but does not fail if the sibling repo isn't present.
4. Optionally, run the Firebase emulators for local development instead of a live Firebase project (configured in `firebase.json`: Firestore on port 8080, Auth on port 9099). Which backend URLs the app calls is controlled by `NODE_ENV` in `app/api/create-experiment/config.ts`.

## Running locally

```bash
npm run dev     # start the dev server at http://localhost:3000
npm run build   # production build
npm run start   # run the production build
npm run lint    # eslint
```

To run the web app together with `convokit-service` (e.g. to test export end-to-end), use Docker Compose from the repo root instead:

```bash
docker compose up
```

This builds and starts both the `web` service (port 3000) and the `convokit` service (port 8080), and points the web app at the local `convokit` container automatically.

## Project structure

| Path | Contents |
|---|---|
| `app/` | Next.js App Router pages and components for each toolkit |
| `app/api/` | Server-side route handlers — experiment creation (`create-experiment/`), status polling, export, ConvoKit proxy, template/agent CRUD, quota, auth |
| `app/lib/` | Shared domain logic: Firebase clients, agents/public assistants/private assistants/templates models, drafts/autosave |
| `app/components/` | Shared UI components (pairings editor, prompt editor, nav, etc.) |
| `convokit-service/` | Standalone Python/FastAPI microservice that exports experiments to ConvoKit corpora |
| `scripts/` | Dev helper scripts (e.g. `sync-dl-key.mjs`) |
| `public/templates/` | Default and topic-specific YAML templates for experiments, agents, public assistants, and private assistants |

## Environment variables

| Variable | Purpose |
|---|---|
| `DL_API_KEY` | Authenticates requests to the external TrAuSt / ConvoArena backend. Required to create or run experiments. |
| `CONVOKIT_SERVICE_URL` | Base URL of the `convokit-service` instance used for corpus export. Defaults to `http://127.0.0.1:8080` if unset. |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service account JSON (single line) used by the Admin SDK for server-side Firestore/Auth access. |
| `DL_ENV_PATH` | Optional. Overrides the path `scripts/sync-dl-key.mjs` reads `DL_API_KEY` from (defaults to `../TrAuSt/.env`). |

## Deployment

- **Vercel** (`vercel.json`) is the primary deployment target for the Next.js app.
- **Docker / Cloud Run**: the root `Dockerfile` builds a standalone Next.js image; `docker-compose.yml` runs it alongside `convokit-service` for local or self-hosted deployment.

## Testing & CI

There is currently no automated test suite or CI pipeline in this repository.
