#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <sandbox-id>"
  echo "  Launches a Docker container with the sandbox filesystem mounted via davfs2."
  exit 1
fi

SANDBOX_ID="$1"
WEBDAV_PORT="${WEBDAV_PORT:-1900}"
WEBDAV_URL="http://host.docker.internal:${WEBDAV_PORT}/${SANDBOX_ID}/"

echo "Mounting sandbox '${SANDBOX_ID}' from ${WEBDAV_URL}"

exec docker run --rm -it --privileged \
  -e DEBIAN_FRONTEND=noninteractive \
  --add-host=host.docker.internal:host-gateway \
  debian:bookworm-slim \
  bash -c "
    apt-get update -qq && apt-get install -y -qq --no-install-recommends davfs2 >/dev/null 2>&1 && \
    mkdir -p /mnt/sandbox && \
    echo '${WEBDAV_URL} none none' >> /etc/davfs2/secrets && \
    mount -t davfs '${WEBDAV_URL}' /mnt/sandbox -o nointeractive && \
    echo 'Sandbox mounted at /mnt/sandbox' && \
    cd /mnt/sandbox && \
    exec bash
  "
