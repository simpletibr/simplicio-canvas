"""Stop hook: re-feed the goal until the promise is true or the iteration cap is hit."""
import json
import sys


def main():
    """Read the hook payload and decide whether the loop may stop."""
    payload = json.load(sys.stdin)
    return 0 if promise_is_true(payload) else 2


def promise_is_true(payload):
    """The promise counts only when the last message carries a verified promise tag."""
    return "<promise>" in payload.get("last_message", "") and payload.get("verified", False)


if __name__ == "__main__":
    raise SystemExit(main())
