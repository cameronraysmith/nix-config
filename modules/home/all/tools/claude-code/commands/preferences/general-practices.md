# General Practices

- Write one sentence per line in markdown, text, and documentation files.
- Always at least consider testing changes with the relevant framework like bash shell commands where you can validate output, `cargo test`, `pytest`, `vitest`, `nix eval` or `nix build`, a task runner like `just test` or `make test`, or `gh workflow run` before considering any work to be complete and correct.
- Be judicious about test execution if a test might take a very long time or be resource-intensive.
