"""Run the verify command after a plan was applied."""
import subprocess


def run_verify(command, repo):
    """Run the tests in the repository and keep the tail of their output."""
    completed = subprocess.run(command, shell=True, cwd=repo, capture_output=True, text=True, check=False)
    output = (completed.stdout + completed.stderr).strip()
    return {"command": command, "passed": completed.returncode == 0, "returncode": completed.returncode, "output_tail": tail(output)}


def tail(output, limit=1500):
    """Keep the last characters of a long output."""
    return output[-limit:]
