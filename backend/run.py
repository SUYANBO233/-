"""Run using the Python interpreter already installed in Codespaces."""
import argparse
import os
from pathlib import Path

import uvicorn

from app.config import Settings


def main() -> None:
    Settings.from_environment()
    parser = argparse.ArgumentParser()
    parser.add_argument('--reload', action='store_true')
    args = parser.parse_args()
    uvicorn.run(os.getenv('BACKEND_ASGI_APP', 'app.main:app'), host=os.getenv('BACKEND_HOST', '127.0.0.1'),
                port=int(os.getenv('BACKEND_PORT', '8000')), reload=args.reload,
                reload_dirs=[str(Path(__file__).resolve().parent / 'app'), str(Path(__file__).resolve().parent / 'data')] if args.reload else None)


if __name__ == '__main__':
    main()
