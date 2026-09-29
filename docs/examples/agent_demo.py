"""Writes fixtures/traces/agent-demo.trace.jsonl with the emitter from docs/trace-format.md.

The run is synthetic: the "model" is a stub and the clock is fake, so the file is reproducible.
    python3 docs/examples/agent_demo.py fixtures/traces/agent-demo.trace.jsonl
"""
import itertools, sys
from simplicio_trace import Trace

clock = [1_790_000_000.0]
def now(): return clock[0]
def advance(seconds): clock[0] += seconds

out = sys.argv[1] if len(sys.argv) > 1 else "agent-demo.trace.jsonl"
open(out, "w").close()
ids = (f"e{n}" for n in itertools.count(1))
trace = Trace(out, now=now, new_id=lambda: next(ids), title="Agent fixes a failing test (synthetic sample)", source="docs/examples/agent_demo.py", synthetic=True)

def llm(name, model, prompt, response, prompt_tokens, completion_tokens, latency, cost):
    with trace.span("llm_call", name) as attrs:
        advance(latency)
        attrs.update(model=model, provider="example-provider", prompt_tokens=prompt_tokens, cached_tokens=0, completion_tokens=completion_tokens,
                     cost_usd=cost, latency_s=latency, prompt_preview=prompt, response_preview=response)

with trace.span("step", "Fix the failing test in tests/test_cart.py"):
    with trace.span("tool", "read_file tests/test_cart.py", tool="read_file", path="tests/test_cart.py"):
        advance(0.02)
    with trace.span("command", "pytest -q tests/test_cart.py", command="pytest -q tests/test_cart.py") as attrs:
        advance(0.9)
        attrs.update(returncode=1, output_tail="FAILED tests/test_cart.py::test_total - assert 30 == 32\n1 failed in 0.31s")
    llm("Plan the fix", "example-model-large", "Test test_total fails: expected 32, got 30. Source: cart.py ...", "The discount is applied twice in Cart.total(); remove the second call.", 1840, 96, 2.6, 0.0041)
    with trace.span("file_edit", "Edit cart.py", path="cart.py", op="replace") as attrs:
        advance(0.05)
        attrs.update(diff_preview="-        total = self.apply_discount(total)\n         return total")
    with trace.span("verify", "pytest -q", command="pytest -q") as attrs:
        advance(1.1)
        attrs.update(passed=True, returncode=0, output_tail="6 passed in 0.28s")
    llm("Summarize the change", "example-model-small", "Summarize the diff for the pull request description.", "Remove the duplicate discount in Cart.total(); the test now passes.", 420, 31, 0.8, 0.0003)
