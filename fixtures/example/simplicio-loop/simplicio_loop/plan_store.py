"""Where the host model leaves its plan."""
import json


def read_plan(plan_path):
    """Read the JSON plan the invoking agent wrote."""
    with open(plan_path, encoding="utf-8") as handle:
        return json.load(handle)
