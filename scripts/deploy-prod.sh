#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
CONFIG_FILE="${DEPLOY_CONFIG_FILE:-${PROJECT_ROOT}/.deploy.prod.env}"

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "[deploy] Missing deploy config: ${CONFIG_FILE}" >&2
  echo "[deploy] Copy ${PROJECT_ROOT}/.deploy.prod.env.example to ${PROJECT_ROOT}/.deploy.prod.env and fill it first." >&2
  exit 1
fi

set -a
. "${CONFIG_FILE}"
set +a

DEPLOY_HOST="${DEPLOY_HOST:-zzclub-prod}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/root/server/blog-wx-bun-service-prod}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-/root/envs/blog-wx-bun-service/prod.env}"
PM2_APP_NAME="${PM2_APP_NAME:-blog-wx-bun-service-prod}"
APP_PORT="${APP_PORT:-3002}"
HEALTHCHECK_PATH="${HEALTHCHECK_PATH:-/ready}"
LOCAL_CHECK_CMD="${LOCAL_CHECK_CMD:-bun test}"
REMOTE_INSTALL_CMD="${REMOTE_INSTALL_CMD:-bun install --frozen-lockfile}"
REMOTE_TMP_DIR="${REMOTE_APP_DIR}.incoming"

echo "[deploy] project: ${PROJECT_ROOT}"
echo "[deploy] host: ${DEPLOY_HOST}"
echo "[deploy] app dir: ${REMOTE_APP_DIR}"
echo "[deploy] pm2 name: ${PM2_APP_NAME}"
echo "[deploy] port: ${APP_PORT}"

if [[ -n "${LOCAL_CHECK_CMD}" ]]; then
  echo "[deploy] running local checks"
  bash -lc "cd '${PROJECT_ROOT}' && ${LOCAL_CHECK_CMD}"
fi

echo "[deploy] uploading source bundle"
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.data' \
  --exclude='.backup' \
  --exclude='var' \
  --exclude='.deploy.prod.env' \
  -czf - \
  -C "${PROJECT_ROOT}" \
  . | ssh "${DEPLOY_HOST}" "set -euo pipefail
  rm -rf '${REMOTE_TMP_DIR}'
  mkdir -p '${REMOTE_TMP_DIR}'
  tar -xzf - -C '${REMOTE_TMP_DIR}'"

echo "[deploy] installing and restarting on server"
ssh "${DEPLOY_HOST}" \
  "set -euo pipefail
   cd '${REMOTE_TMP_DIR}'
   ${REMOTE_INSTALL_CMD}
   test -f '${REMOTE_ENV_FILE}'
   set -a
   . '${REMOTE_ENV_FILE}'
   set +a
   bun src/index.ts migrate
   rm -rf '${REMOTE_APP_DIR}.prev'
   if [ -d '${REMOTE_APP_DIR}' ]; then
     mv '${REMOTE_APP_DIR}' '${REMOTE_APP_DIR}.prev'
   fi
   mv '${REMOTE_TMP_DIR}' '${REMOTE_APP_DIR}'
   APP_ENV_FILE='${REMOTE_ENV_FILE}' APP_PORT='${APP_PORT}' PM2_APP_NAME='${PM2_APP_NAME}' pm2 describe '${PM2_APP_NAME}' >/dev/null 2>&1 \
     && APP_ENV_FILE='${REMOTE_ENV_FILE}' APP_PORT='${APP_PORT}' PM2_APP_NAME='${PM2_APP_NAME}' pm2 restart pm2.config.cjs --only '${PM2_APP_NAME}' --update-env \
     || APP_ENV_FILE='${REMOTE_ENV_FILE}' APP_PORT='${APP_PORT}' PM2_APP_NAME='${PM2_APP_NAME}' pm2 start pm2.config.cjs --only '${PM2_APP_NAME}' --update-env
   for attempt in 1 2 3 4 5 6 7 8 9 10; do
     if curl --fail --silent 'http://127.0.0.1:${APP_PORT}${HEALTHCHECK_PATH}' >/dev/null; then
       exit 0
     fi
     sleep 1
   done
   exit 1"

echo "[deploy] deploy completed"
