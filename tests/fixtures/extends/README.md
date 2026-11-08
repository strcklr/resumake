# `extends:` cases shared by the CLI and the web editor

Each folder is a small workspace. `expected.json` names the file to load (`entry`) and either the
merged result (`data`, before schema validation) or the kind of failure (`error`: `circular` or
`not found`).

Both implementations are checked against these: `tests/test_resumake.py` with `load_resume`, and
`web/src/lib/workspace.test.ts` with the browser's port. Add a case here when the merge rules change.
