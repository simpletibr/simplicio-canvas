# Architecture

`simplicio-loop turbo` surveys the repository once, asks the invoking agent (host mode) or the
provider for a find/replace plan, applies it through simplicio-dev-cli, then verifies it.

```mermaid
flowchart LR
  CLI --> Survey --> Plan --> Apply --> Verify --> Done
```
