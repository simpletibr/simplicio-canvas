"""Thin client for simplicio-mapper: one survey per invocation."""
import json
import subprocess


def survey(repo):
    """Ask Mapper for the project map; an unchanged tree is served from its cache."""
    completed = subprocess.run(["simplicio-mapper", "scan", repo, "--sync", "--await", "--json"], capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError("mapper_failed")
    return load_map(repo)


def load_map(repo):
    """Read the project map file that the survey wrote."""
    with open(f"{repo}/.simplicio-loop/project-map.json", encoding="utf-8") as handle:
        return json.load(handle)


def map_slice(project_map, target):
    """Keep only the part of the map that concerns one target file."""
    return {"files": [item for item in project_map["files"] if item["path"] == target]}
