# Gives a real, interactive shell in the browser (the "Terminal" app),
# active by default - docker-compose.yml's `terminal` service mounts the
# Docker socket into this container directly, letting `docker`/`docker exec`
# reach every other container on the host from here (see that file's
# comment on the mount, and the README's "Terminal et Docker" section for
# the security trade-off this makes).
FROM alpine:3.20

RUN apk add --no-cache ttyd bash docker-cli

EXPOSE 7681

# --base-path matches the prefix the backend proxies this under (see
# app/routers/terminal.py) - ttyd needs to know its own prefix to emit
# correctly-prefixed asset/WebSocket URLs in the page it serves, since it's
# not reachable at the site root. No -W/--writable-only restriction: this
# shell is meant to be fully interactive (read+write).
CMD ["ttyd", "-p", "7681", "-i", "0.0.0.0", "-b", "/api/terminal", "bash"]
