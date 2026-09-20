#!/usr/bin/env python3
"""fetchmail MDA target: delivers the message on stdin to the local Dovecot
server over LMTP, plus-addressed so global.sieve files it into the right
per-account folder. See app/mail_config.py for how each account maps to
`<local-user> <folder>` arguments here.
"""
import smtplib
import sys


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: deliver-lmtp.py <local-user> <folder>", file=sys.stderr)
        sys.exit(1)

    user, folder = sys.argv[1], sys.argv[2]
    message = sys.stdin.buffer.read()

    lmtp = smtplib.LMTP("dovecot", 24)
    try:
        lmtp.mail("")
        code, resp = lmtp.rcpt(f"{user}+{folder}@local")
        if code >= 400:
            raise RuntimeError(f"RCPT refused: {code} {resp!r}")
        lmtp.data(message)
    finally:
        lmtp.quit()


if __name__ == "__main__":
    main()
