from simplicio_loop.turbo_cli import build_tasks, mentioned_paths


def test_mentioned_paths_finds_files():
    assert mentioned_paths("add a field to cadastro.html") == ["cadastro.html"]


def test_build_tasks_numbers_tasks():
    tasks = build_tasks("fix a.py; fix b.py")
    assert [task["index"] for task in tasks] == [1, 2]
