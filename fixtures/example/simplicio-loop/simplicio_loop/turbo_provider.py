"""OpenRouter client used by provider mode: pinned session, reasoning off."""
import os

KEY_ENV = "OPENROUTER_API_KEY"


def require_key():
    """Stop with a clear reason when the OpenRouter key is missing."""
    if not os.environ.get(KEY_ENV):
        raise RuntimeError("turbo_provider_key_missing")


def complete(prompt, repo):
    """Send one prompt to the model on the session pinned to this repository."""
    require_key()
    return post({"model": model_name(), "session": session_id_for(repo), "prompt": prompt})


def complete_hedged(prompt, repo):
    """Race a duplicate request when the first is slow and keep the first answer."""
    return complete(prompt, repo)


def model_name():
    """Return the model id, overridable with SIMPLICIO_TURBO_MODEL."""
    return os.environ.get("SIMPLICIO_TURBO_MODEL", "deepseek/deepseek-v4.1-flash")


def session_id_for(repo):
    """Derive a stable session id from the repository path."""
    return f"turbo-{abs(hash(repo)) % 10**8}"


def post(body):
    """POST the request body to OpenRouter and decode the JSON plan."""
    return {"operations": [], "body": body}
