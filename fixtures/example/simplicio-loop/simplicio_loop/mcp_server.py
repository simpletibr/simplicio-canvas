"""MCP server exposing simplicio-loop to any MCP host."""
from mcp.server.fastmcp import FastMCP

from simplicio_loop import mapper_client, turbo_cli

server = FastMCP("simplicio-loop")


@server.tool()
def simplicio_turbo(request: str, repo: str = ".") -> int:
    """Run a request through the turbo pipeline and return its exit code."""
    return turbo_cli.run_turbo_command(["--repo", repo, request])


@server.tool()
def simplicio_survey(repo: str = ".") -> dict:
    """Return the Mapper survey of a repository."""
    return mapper_client.survey(repo)


def serve():
    """Start the MCP server on stdio."""
    server.run()
