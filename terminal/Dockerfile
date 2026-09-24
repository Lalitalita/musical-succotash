# Gives a real, interactive shell in the browser (the "Terminal" app) -
# opt-in like everything else in this file, only reachable once
# docker-compose.dockerctl.yml is layered in (see README): THAT overlay is
# what actually mounts the Docker socket into this container, letting
# `docker`/`docker exec` reach every other container on the host from
# here. Without it, this container is still just a profile-gated no-op
# that never starts by default - and even started, an empty shell with no
# Docker access at all until the overlay is added.
FROM alpine:3.20

RUN apk add --no-cache ttyd bash docker-cli

EXPOSE 7681

# --base-path matches the prefix Nginx proxies this under (see
# frontend/nginx.conf's /api/terminal/ location) - ttyd needs to know its
# own prefix to emit correctly-prefixed asset/WebSocket URLs in the page it
# serves, since it's not reachable at the site root. No -W/--writable-only
# restriction: this shell is meant to be fully interactive (read+write),
# the same trade-off the rest of this opt-in feature makes.
CMD ["ttyd", "-p", "7681", "-i", "0.0.0.0", "-b", "/api/terminal", "bash"]
