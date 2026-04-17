import sys
import os

# Add the backend directory to sys.path so its modules can be imported
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, backend_dir)

# Vercel's Python runtime looks for a variable named 'app' in the entrypoint.
# Import the FastAPI app from the backend.
from server import app  # noqa: E402, F401
