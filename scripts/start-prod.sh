#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${APP_ENV_FILE:-${ENV_FILE:-}}"

if [[ -z "${ENV_FILE}" ]]; then
  echo "[start-prod] APP_ENV_FILE is required" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[start-prod] Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
. "${ENV_FILE}"
set +a

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-${APP_PORT:-3002}}"

cd "${PROJECT_ROOT}"
exec bun src/index.ts serve
