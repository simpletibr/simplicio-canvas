"""`simplicio-loop turbo`: the default way to run a task."""
import re

from simplicio_loop import host_mode, mapper_client, report, turbo, verify

PATH_TOKEN = re.compile(r"[\w./-]+\.[A-Za-z][A-Za-z0-9]{0,7}")


def run_turbo_command(argv):
    """Survey the repository, plan each task, apply the plans and verify the result."""
    options = parse_options(argv)
    tasks = build_tasks(options["request"])
    survey = mapper_client.survey(options["repo"])
    if options["apply"]:
        result = turbo.apply_plan(options["repo"], options["plan_path"])
    elif options["provider"]:
        result = turbo.run_with_provider(options["repo"], tasks, survey)
    else:
        return host_mode.request_plan(options["repo"], tasks, survey)
    if options["verify"] and result["applied_all"]:
        result["verify"] = verify.run_verify(options["verify"], options["repo"])
        if not result["verify"]["passed"]:
            result = turbo.repair_plan(options["repo"], tasks, result)
    report.emit(result)
    return 0 if result["status"] == "ok" else 1


def parse_options(argv):
    """Read --repo, --apply, --provider and --verify from the command line."""
    options = {"repo": ".", "apply": False, "provider": None, "verify": None, "plan_path": None, "request": ""}
    words = list(argv)
    while words:
        word = words.pop(0)
        if word == "--repo":
            options["repo"] = words.pop(0)
        elif word == "--apply":
            options["apply"] = True
        elif word == "--provider":
            options["provider"] = words.pop(0)
        elif word == "--verify":
            options["verify"] = words.pop(0)
        else:
            options["request"] = f"{options['request']} {word}".strip()
    options["plan_path"] = f"{options['repo']}/.simplicio-loop/turbo-plan.json"
    return options


def build_tasks(request):
    """Split the request into tasks; tasks that touch the same file keep their order."""
    tasks = []
    for index, text in enumerate(split_request(request), start=1):
        files = mentioned_paths(text)
        tasks.append({"index": index, "text": text, "target": files[0] if files else None, "context": files[1:]})
    return tasks


def split_request(request):
    """Cut a request into one text per task."""
    return [part.strip() for part in re.split(r"\n|;", request) if part.strip()]


def mentioned_paths(text):
    """List the file paths named in a task text."""
    return PATH_TOKEN.findall(text)
