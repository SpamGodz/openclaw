import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend'))

from mangum import Mangum
from server import app  # noqa: F401

handler = Mangum(app, lifespan="off")
