# A real, plain SOCKS5 proxy: your own actual browser (Firefox, Chrome...)
# on any device connects to this and all its traffic exits through this
# Debian host - full native browser speed/quality/JS support, no
# server-side rendering or screenshotting involved at all. This is the
# answer to "I just want my Debian box to be a proxy, nothing more" -
# see README for how to point a browser at it. The in-app "Navigateur"
# (text/full mode) stays available separately for quick LAN access from a
# device that can't/shouldn't be configured with a proxy.
FROM alpine:3.20 AS build
RUN apk add --no-cache git build-base
RUN git clone --depth 1 https://github.com/rofl0r/microsocks /src \
    && cd /src && make

FROM alpine:3.20
COPY --from=build /src/microsocks /usr/local/bin/microsocks
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 1080

ENTRYPOINT ["/entrypoint.sh"]
