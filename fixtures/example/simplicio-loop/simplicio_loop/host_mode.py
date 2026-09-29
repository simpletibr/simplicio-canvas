"""Host mode: the invoking agent's model writes the plan; the loop makes no LLM call."""
from simplicio_loop import prompts, report


def request_plan(repo, tasks, survey):
    """Print the plan request (needs_plan) that the invoking agent answers."""
    prompt = prompts.build_plan_prompt(tasks, survey, repo)
    report.emit({"schema": "simplicio.turbo-request/v1", "status": "needs_plan", "mode": "host", "prompt": prompt})
    return 0
