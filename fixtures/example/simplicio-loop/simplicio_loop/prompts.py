"""Prompt text for plan requests."""
from simplicio_loop import mapper_client

PLAN_FORMAT = '{"operations":[{"path":"...","find":"...","replace":"..."}]}'


def build_plan_prompt(tasks, survey, repo):
    """Compose the plan request: a map slice for one task, the full map as a cached header for many."""
    header = survey if len(tasks) > 1 else mapper_client.map_slice(survey, tasks[0]["target"])
    parts = [f"Project map: {header}", render_tasks(tasks), read_files(repo, tasks), f"Reply with JSON only: {PLAN_FORMAT}"]
    return "\n\n".join(parts)


def render_tasks(tasks):
    """Number the tasks so the plan can refer to them."""
    return "\n".join(f"Task {task['index']}: {task['text']}" for task in tasks)


def read_files(repo, tasks):
    """Read the current contents of every file the tasks name."""
    chunks = []
    for task in tasks:
        for path in [task["target"], *task["context"]]:
            if path:
                chunks.append(f"--- {path}\n{open(f'{repo}/{path}', encoding='utf-8').read()}")
    return "\n".join(chunks)
