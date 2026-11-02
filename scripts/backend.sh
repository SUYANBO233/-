#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
BACKEND_PYTHON="${BACKEND_PYTHON:-python3}"
case "${1:-dev}" in
  install) exec "${BACKEND_PYTHON}" -m pip install --no-cache-dir -r backend/requirements.txt ;;
  dev) exec "${BACKEND_PYTHON}" backend/run.py --reload ;;
  start) exec "${BACKEND_PYTHON}" backend/run.py ;;
  test) cd backend; exec "${BACKEND_PYTHON}" -m unittest discover -s tests -v ;;
  *) echo '用法：backend.sh install|dev|start|test' >&2; exit 2 ;;
esac
