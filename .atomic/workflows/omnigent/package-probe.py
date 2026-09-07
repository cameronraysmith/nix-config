import importlib.metadata
import importlib.util
import pathlib
import subprocess
import sys

import omnigent
import omnigent.harnesses.claude_native.hook

root = pathlib.Path(omnigent.__file__).parent
assert (root / "harnesses/claude_native/hook.py").is_file()
assert importlib.util.find_spec("omnigent.claude_native_hook") is None
for name in ("omnigent", "omnigent-client", "omnigent-ui-sdk"):
    version = importlib.metadata.version(name)
    assert version == "0.13.0", (name, version)
    print(f"{name}: {version}")
subprocess.run(
    [sys.executable, "-I", "-m", "omnigent.harnesses.claude_native.hook", "--help"],
    env={},
    check=True,
)
help_text = subprocess.check_output(
    [sys.executable, "-I", "-m", "omnigent", "--help"], env={}, text=True
)
assert "server" in help_text and "host" in help_text
print(help_text)
print("0.13.0-wheels-new-hook-old-absent-cli-ok")
