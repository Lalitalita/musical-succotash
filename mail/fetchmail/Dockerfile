FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends fetchmail \
    && rm -rf /var/lib/apt/lists/*

ENV HOME=/var/lib/fetchmail
RUN mkdir -p "$HOME" && chmod 700 "$HOME"

COPY deliver-lmtp.py /usr/local/bin/deliver-lmtp.py
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/deliver-lmtp.py /usr/local/bin/entrypoint.sh

CMD ["/usr/local/bin/entrypoint.sh"]
