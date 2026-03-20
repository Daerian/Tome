import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import generate
from dotenv import load_dotenv

# Load environment variables from backend/.env when running locally.
# In production (Render) these are injected directly into the environment.
load_dotenv()

app = FastAPI()

# Build the list of allowed CORS origins from environment variables.
# FRONTEND_URL_LOCAL — local dev URL (set in .env, e.g. http://localhost:5173)
# FRONTEND_URL       — production URL (set in Render dashboard, e.g. https://tome.vercel.app)
origins = []
if os.getenv("FRONTEND_URL_LOCAL"):
    origins.append(os.getenv("FRONTEND_URL_LOCAL"))
if os.getenv("FRONTEND_URL"):
    origins.append(os.getenv("FRONTEND_URL"))

# CORS middleware lets the browser send requests from the frontend origin to this API.
# Without this, the browser blocks cross-origin requests.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,   # only the listed URLs may call this API
    allow_methods=["*"],     # allow GET, POST, etc.
    allow_headers=["*"],     # allow Content-Type, Authorization, etc.
)

# Mount all routes defined in routers/generate.py under the /api prefix.
# e.g. generate.router's POST /generate becomes POST /api/generate
app.include_router(generate.router, prefix="/api")


@app.get("/health")
async def health():
    """
    Health check endpoint for uptime monitoring and deployment verification.

    Returns the server status and whether TESTING_MODE is active. Useful for
    confirming the backend is reachable before running frontend tests.

    Returns
    -------
    dict
        ``{"status": "ok", "testing_mode": bool}``
    """
    return {
        "status": "ok",
        "testing_mode": os.getenv("TESTING_MODE", "false").lower() == "true",
    }
