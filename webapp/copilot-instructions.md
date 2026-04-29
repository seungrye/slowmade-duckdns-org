# Copilot Instructions

This repository uses a Copilot instruction file to enforce project workflow rules.

- When making any code changes, always add or update tests that cover the change.
- After modifying code, run the test suite and confirm it passes before finishing the task.
- If this repository has no test setup, propose and add a minimal testing framework and test scripts.
- Write tests for bug fixes, new features, and behavior changes.
- Prefer unit tests for library logic and API tests for route behavior.
- If a code change impacts architecture, document the change in the relevant docs under `docs/`.
- Do not leave code changes without corresponding verified tests.
- When reporting completion, include the test command(s) used.
