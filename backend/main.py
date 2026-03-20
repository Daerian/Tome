import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import generate
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

origins = ["http://localhost:5173"]
if os.getenv("FRONTEND_URL"):
    origins.append(os.getenv("FRONTEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generate.router, prefix="/api")