"""Command line entry point of simplicio-loop."""
import sys

from simplicio_loop import orchestrator, report, turbo_cli

COMMANDS = ("turbo", "orient")


def main(argv=None):
    """Dispatch the command line to the sub-command that was asked for."""
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] not in COMMANDS:
        return print_usage()
    command, rest = args[0], args[1:]
    if command == "turbo":
        return turbo_cli.run_turbo_command(rest)
    return orchestrator.orient(rest)


def print_usage():
    """Print the list of commands and return the exit code for a bad command line."""
    report.emit({"schema": "simplicio.usage/v1", "commands": list(COMMANDS)})
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
