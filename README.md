# Tome

A D&D campaign companion that helps Dungeon Masters and players manage sessions, characters, locations, story beats, and more. Tome uses AI (via the Anthropic API) to generate session recaps, preparation briefs, story beat extraction, and in-game reference lookups. DMs also get an in-app soundboard to browse and play ambient audio tracks, keeping the mood without leaving the app.

## Tech Stack

| Layer    | Technology                                      |
|----------|--------------------------------------------------|
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 7 |
| Backend  | FastAPI, PydanticAI, Anthropic SDK, Uvicorn       |
| Database | Supabase (PostgreSQL + Auth + RLS)                |
| Hosting  | Vercel (frontend), Render (backend)               |

## Repository Structure

```
tome/
  frontend/        React application (Vite + Tailwind)
    src/
      components/  Reusable UI components
      pages/       Route-level page components
      lib/         Supabase client, auth hooks
    public/        Static assets
  backend/         FastAPI application
    routers/       API route handlers (chat, recap, prep, reference, soundboard, …)
    tools/         AI tool definitions (campaign data, D&D references)
    tests/         Pytest test suite
  supabase/        Database migrations
  .github/         CI workflows, PR template, CODEOWNERS
```

## Prerequisites

Before setting up the project, make sure you have the following installed:

- **Node.js 20+** (check with `node --version`)
- **Python 3.11+** (check with `python --version`)
- **uv** (Python package manager by Astral; install via `pip install uv` or see [docs.astral.sh/uv](https://docs.astral.sh/uv))
- **Git**

You will also need:

- A **Supabase** project with the appropriate tables and RLS policies
- An **Anthropic API key** for Claude access

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Daerian/tome.git
cd tome
```

### 2. Set up the frontend

```bash
cd frontend
npm install
```

Create a local environment file by copying the example:

```bash
cp .env.example .env.local
```

Open `frontend/.env.local` and fill in your values:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_supabase_publishable_key
VITE_API_URL=http://localhost:8000
```

### 3. Set up the backend

```bash
cd backend
uv sync --extra dev
```

This creates a `.venv` virtual environment and installs all production and dev dependencies from the lockfile (`uv.lock`).

Create a local environment file by copying the example:

```bash
cp .env.example .env
```

Open `backend/.env` and fill in your values:

```
ANTHROPIC_API_KEY=your_anthropic_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_SECRET_KEY=your_supabase_service_role_key
TESTING_MODE=false
FRONTEND_URL_LOCAL=http://localhost:5173
FRONTEND_URL=https://your-app.vercel.app
```

> **Note:** The backend uses the Supabase **service role key** (not the publishable anon key) because it needs to bypass Row Level Security for server-side operations.

### 4. Run the app

Open two terminals from the project root:

**Terminal 1 (Frontend):**

```bash
cd frontend
npm run dev
```

**Terminal 2 (Backend):**

```bash
cd backend
uv run uvicorn main:app --reload --port 8000
```

The frontend will be available at `http://localhost:5173` and the backend API at `http://localhost:8000`. You can verify the backend is running by visiting `http://localhost:8000/health`.

## Running Tests

### Frontend

```bash
cd frontend
npm run test:run        # single run
npm run test            # watch mode (re-runs on file changes)
npm run test:coverage   # with coverage report
```

### Backend

```bash
cd backend
uv run pytest           # run all tests
uv run pytest -v        # verbose output
```

## Linting and Formatting

### Frontend

```bash
cd frontend
npm run lint            # check for lint errors (ESLint)
npm run lint:fix        # auto-fix lint errors
npm run format:check    # check formatting (Prettier)
npm run format          # auto-format all files
```

### Backend

```bash
cd backend
uv run ruff check .           # check for lint errors
uv run ruff check --fix .     # auto-fix lint errors
uv run ruff format --check .  # check formatting
uv run ruff format .          # auto-format all files
```

All checks run automatically in CI on every pull request.

## Available npm Scripts

| Script          | Description                          |
|-----------------|--------------------------------------|
| `dev`           | Start the Vite dev server            |
| `build`         | Production build                     |
| `preview`       | Preview the production build locally |
| `lint`          | Run ESLint                           |
| `lint:fix`      | Run ESLint with auto-fix             |
| `format`        | Format files with Prettier           |
| `format:check`  | Check formatting without writing     |
| `test`          | Run Vitest in watch mode             |
| `test:run`      | Run Vitest once                      |
| `test:coverage` | Run Vitest with coverage report      |

## Environment Variables Reference

### Frontend (`frontend/.env.local`)

| Variable                               | Description                          |
|----------------------------------------|--------------------------------------|
| `VITE_SUPABASE_URL`                    | Your Supabase project URL            |
| `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`| Supabase anon/public key             |
| `VITE_API_URL`                         | Backend API URL (`http://localhost:8000` for local dev) |

### Backend (`backend/.env`)

| Variable              | Description                                    |
|-----------------------|------------------------------------------------|
| `ANTHROPIC_API_KEY`   | Anthropic API key for Claude                   |
| `SUPABASE_URL`        | Your Supabase project URL                      |
| `SUPABASE_SECRET_KEY` | Supabase service role key (bypasses RLS)       |
| `TESTING_MODE`        | Set to `true` to enable debug output           |
| `FRONTEND_URL_LOCAL`  | Local frontend URL for CORS (`http://localhost:5173`) |
| `FRONTEND_URL`        | Production frontend URL for CORS               |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, commit message format, and pull request guidelines.

## License

This project is licensed under the terms in [LICENSE](LICENSE).
