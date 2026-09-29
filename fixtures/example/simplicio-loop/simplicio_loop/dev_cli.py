"""Adapter for simplicio-dev-cli: compile find/replace plans and apply them."""


def apply_operations(repo, operations):
    """Apply every find/replace operation and report which tasks were applied."""
    rejected = []
    for operation in operations:
        reason = compile_operation(repo, operation)
        if reason:
            rejected.append(reason)
    return {"status": "failed" if rejected else "ok", "applied_all": not rejected, "failed": rejected}


def compile_operation(repo, operation):
    """Check one operation and write it; return the rejection reason or None."""
    path = f"{repo}/{operation['path']}"
    try:
        text = open(path, encoding="utf-8").read()
    except FileNotFoundError:
        return "plan_path_not_found"
    reason = check_unique(text, operation["find"])
    if reason:
        return reason
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text.replace(operation["find"], operation["replace"], 1))
    return None


def check_unique(text, needle):
    """A find string must match exactly once, otherwise the plan is rejected."""
    count = text.count(needle)
    if count == 0:
        return "plan_find_not_found"
    if count > 1:
        return "plan_find_not_unique"
    return None
