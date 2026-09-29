"""One compact JSON document per invocation."""
import json


def emit(document):
    """Print a document as one line of JSON."""
    print(json.dumps(document, separators=(",", ":")))
