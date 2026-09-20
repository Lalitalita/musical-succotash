FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        dovecot-core dovecot-imapd dovecot-lmtpd dovecot-sieve dovecot-pigeonhole \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 5000 vmail \
    && useradd -u 5000 -g vmail -d /var/mail -s /usr/sbin/nologin vmail \
    && mkdir -p /var/mail && chown vmail:vmail /var/mail

COPY dovecot.conf /etc/dovecot/dovecot.conf
COPY global.sieve /etc/dovecot/global.sieve

# Precompile the global sieve script at build time (pigeonhole prefers the
# compiled .svbin and /etc/dovecot isn't writable by the dovecot user at
# runtime for it to compile lazily).
RUN sievec /etc/dovecot/global.sieve

EXPOSE 143 24

CMD ["dovecot", "-F"]
