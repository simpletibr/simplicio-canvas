import json, time, uuid
import httpx

def logging_client(trace, **kwargs):
    """An httpx.Client that records every /chat/completions call as an llm_call event."""
    def start(request):
        request.extensions["t0"] = time.time()

    def done(response):
        if not str(response.request.url).endswith("/chat/completions"):
            return
        response.read()
        t0, t1 = response.request.extensions["t0"], time.time()
        body = response.json() if response.is_success else {}
        usage, sent = body.get("usage", {}), json.loads(response.request.content or b"{}")
        reply = ((body.get("choices") or [{}])[0].get("message") or {}).get("content", "")
        trace.write({"id": uuid.uuid4().hex[:8], "parent": trace.stack[-1] if trace.stack else None, "kind": "llm_call",
                     "name": body.get("model") or sent.get("model", "llm call"), "start": t0, "end": t1,
                     "status": "ok" if response.is_success else "error",
                     "attrs": {"model": body.get("model"), "prompt_tokens": usage.get("prompt_tokens"),
                               "completion_tokens": usage.get("completion_tokens"), "latency_s": round(t1 - t0, 3),
                               "prompt_preview": str((sent.get("messages") or [{}])[-1].get("content", ""))[:500],
                               "response_preview": reply[:500]}})

    return httpx.Client(event_hooks={"request": [start], "response": [done]}, **kwargs)
