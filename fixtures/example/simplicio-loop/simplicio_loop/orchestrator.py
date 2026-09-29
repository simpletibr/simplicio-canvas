"""Orientation before a run: what the repository is and what to do next."""
from simplicio_loop import mapper_client, report


def orient(argv):
    """Survey the repository and print the commands card."""
    repo = argv[0] if argv else "."
    survey = mapper_client.survey(repo)
    report.emit({"schema": "simplicio.orient/v1", "files": len(survey.get("files", []))})
    return 0
