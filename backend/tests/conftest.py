"""
Pytest configuration — sets required environment variables before any
module-level code (e.g. Agent initialisation) runs during test collection.
"""

import os
import sys

# Ensure the backend root is on the path so imports like `from main import app`
# and `from routers import generate` resolve correctly regardless of where
# pytest is invoked from.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# Set a dummy key so the Agent can be instantiated without a real API call.
# All tests that hit the agent mock it out anyway.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-dummy")
os.environ.setdefault("FRONTEND_URL_LOCAL", "http://localhost:5173")
