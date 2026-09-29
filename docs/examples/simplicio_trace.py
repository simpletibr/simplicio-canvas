import json, time, uuid
from contextlib import contextmanager

class Trace:
    """Append simplicio.trace/v1 events (one JSON object per line) to a file."""
    def __init__(self, path, now=time.time, new_id=lambda: uuid.uuid4().hex[:8], **header):
        self.out, self.now, self.new_id, self.stack = open(path, "a", buffering=1), now, new_id, []
        self.write({"schema": "simplicio.trace/v1", **header})

    def write(self, record):
        self.out.write(json.dumps(record, ensure_ascii=False) + "\n")

    @contextmanager
    def span(self, kind, name, **attrs):
        event = {"id": self.new_id(), "parent": self.stack[-1] if self.stack else None,
                 "kind": kind, "name": name, "start": round(self.now(), 6), "attrs": attrs}
        self.stack.append(event["id"])
        try:
            yield event["attrs"]          # the caller adds tokens, cost, previews...
            bad = event["attrs"].get("returncode", 0) != 0 or event["attrs"].get("passed", True) is False
            event["status"] = "error" if bad else "ok"
        except Exception as error:
            event["status"], event["attrs"]["error"] = "error", repr(error)
            raise
        finally:
            self.stack.pop()
            event["end"] = round(self.now(), 6)
            self.write(event)              # written when the span ends: children come before parents
