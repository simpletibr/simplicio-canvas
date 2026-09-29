"""The turbo engine: plan, apply, repair."""
from simplicio_loop import dev_cli, plan_store, prompts, turbo_provider


def apply_plan(repo, plan_path):
    """Apply the plan written by the host model through simplicio-dev-cli."""
    plan = plan_store.read_plan(plan_path)
    return dev_cli.apply_operations(repo, plan["operations"])


def run_with_provider(repo, tasks, survey):
    """Provider mode: the engine calls the model itself, one call per lane."""
    lanes = split_lanes(tasks)
    if len(tasks) > 3:
        warm_up(repo, lanes[0], survey)
    operations = []
    for lane in lanes:
        prompt = prompts.build_plan_prompt(lane, survey, repo)
        operations.extend(turbo_provider.complete_hedged(prompt, repo)["operations"])
    return dev_cli.apply_operations(repo, operations)


def split_lanes(tasks):
    """Group up to three tasks per lane; tasks on the same file stay together."""
    return [tasks[start:start + 3] for start in range(0, len(tasks), 3)]


def warm_up(repo, lane, survey):
    """Send the first lane alone so the other lanes read the map header from the prompt cache."""
    prompt = prompts.build_plan_prompt(lane, survey, repo)
    return turbo_provider.complete(prompt, repo)


def repair_plan(repo, tasks, result):
    """Send the failing test output back to the model once, then apply the fixed plan."""
    prompt = prompts.build_plan_prompt(tasks, {}, repo) + "\n\n" + result["verify"]["output_tail"]
    fixed = turbo_provider.complete(prompt, repo)
    return dev_cli.apply_operations(repo, fixed["operations"])
