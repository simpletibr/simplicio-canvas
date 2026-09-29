from simplicio_loop.dev_cli import check_unique


def test_check_unique_rejects_missing_and_repeated_text():
    assert check_unique("abc", "x") == "plan_find_not_found"
    assert check_unique("aa", "a") == "plan_find_not_unique"
    assert check_unique("abc", "b") is None
