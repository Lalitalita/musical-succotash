"""Operational CLI for things you need when you can't log in at all - most
importantly, clearing a lockout. The security dashboard can't help here
since it requires being logged in as an admin in the first place. Run
inside the running backend container:

    docker compose exec backend python -m app.cli locks
    docker compose exec backend python -m app.cli locks --write /app/locked_accounts.txt
    docker compose exec backend python -m app.cli unlock ip 203.0.113.5
    docker compose exec backend python -m app.cli unlock user admin
    docker compose exec backend python -m app.cli unlock-all
"""
import argparse

from app import rate_limit


def cmd_locks(args) -> None:
    locks = rate_limit.list_active_locks()
    if not locks:
        print("Aucun blocage actif.")
    else:
        print(f"{'Type':<8} {'Cible':<40} {'Expire dans (s)'}")
        for lock in locks:
            print(f"{lock['scope']:<8} {lock['key']:<40} {lock['retry_after_seconds']}")

    if args.write:
        with open(args.write, "w", encoding="utf-8") as f:
            f.write("scope\tkey\tretry_after_seconds\n")
            for lock in locks:
                f.write(f"{lock['scope']}\t{lock['key']}\t{lock['retry_after_seconds']}\n")
        print(f"\nListe écrite dans {args.write}")


def cmd_unlock(args) -> None:
    ok = rate_limit.unlock(args.scope, args.key)
    print("Débloqué." if ok else "Rien à débloquer pour cette cible (déjà libre ?).")


def cmd_unlock_all(args) -> None:  # noqa: ARG001 - argparse passes args uniformly
    n = rate_limit.unlock_all()
    print(f"{n} clé(s) de blocage/limite supprimée(s).")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    p_locks = sub.add_parser("locks", help="Lister les blocages actifs")
    p_locks.add_argument("--write", metavar="PATH", help="Écrire aussi la liste dans un fichier")
    p_locks.set_defaults(func=cmd_locks)

    p_unlock = sub.add_parser("unlock", help="Débloquer une IP ou un compte précis")
    p_unlock.add_argument("scope", choices=["ip", "user", "mfa"])
    p_unlock.add_argument("key", help="L'adresse IP ou le nom d'utilisateur concerné")
    p_unlock.set_defaults(func=cmd_unlock)

    p_all = sub.add_parser("unlock-all", help="Débloquer TOUT (toutes les IP et tous les comptes)")
    p_all.set_defaults(func=cmd_unlock_all)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
