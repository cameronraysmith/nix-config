import copy
import importlib.util
import json
import plistlib
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("darwin_artifacts", Path(__file__).with_name("darwin-artifacts.py"))
artifacts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifacts)
label = artifacts.LABEL
expected = {
    "home": "/Users/fixture",
    "generation": "/nix/store/fixture-home-manager-generation",
    "executable": "/nix/store/fixture-omnigent/bin/omnigent",
    "install": "/nix/store/fixture-coreutils/bin/install",
    "bins": [{"name": name, "path": f"/nix/store/fixture-{name}/bin"} for name in ["claude-code", "atomic", "codex", "pi", "omp", "bun", "nodejs", "python3", "tmux", "git", "uv", "bash", "which", "direnv", "nix"]],
}
plist = {
    "Label": label,
    "ProgramArguments": ["/bin/sh", "-c", f"/bin/wait4path /nix/store && exec {expected['executable']} host --server {artifacts.SERVER}"],
    "EnvironmentVariables": {
        "HOME": expected["home"],
        "PI_ACP_PI_COMMAND": "atomic",
        "PI_CODING_AGENT_DIR": expected["home"] + "/.atomic/agent",
        "OMNIGENT_RUNNER_ENV_PASSTHROUGH": "PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR",
        "PATH": ":".join([item["path"] for item in expected["bins"]] + ["/usr/bin", "/bin", "/usr/sbin", "/sbin"]),
    },
    "RunAtLoad": True,
    "KeepAlive": {"SuccessfulExit": False},
    "ThrottleInterval": 5,
    "ProcessType": "Standard",
    "WorkingDirectory": expected["home"],
    "StandardOutPath": expected["home"] + "/.omnigent/logs/host/service.log",
    "StandardErrorPath": expected["home"] + "/.omnigent/logs/host/service.log",
}
activation = '\n'.join([
    '_iNote "Activating %s" "writeBoundary"',
    '_iNote "Activating %s" "omnigentMergeConfig"',
    '_iNote "Activating %s" "omnigentHostLogDirectory"',
    f"run {expected['install']} -d -m 0700 {expected['home']}/.omnigent/logs/host",
    '_iNote "Activating %s" "setupLaunchAgents"',
])
if len(sys.argv) in (3, 4):
    source, generation = sys.argv[1:3]
    expected = artifacts.expectations(source, Path.cwd(), runtime_environment="--runtime-environment" in sys.argv[3:])
    root = Path(generation)
    plist = plistlib.loads((root / "LaunchAgents" / f"{label}.plist").read_bytes())
    activation = (root / "activate").read_text()
    print(f"Mutation baseline: actual generation {generation} at {source}")

with tempfile.TemporaryDirectory(prefix="omnigent-darwin-artifacts-") as directory:
    root = Path(directory)
    (root / "LaunchAgents").mkdir()
    (root / "LaunchAgentDomains").mkdir()
    plist_path = root / "LaunchAgents" / f"{label}.plist"
    domain_path = root / "LaunchAgentDomains" / f"{label}.domain"

    def reset():
        plist_path.write_bytes(plistlib.dumps(plist))
        domain_path.write_text("user\n")
        (root / "activate").write_text(activation)

    def rejects(name, description):
        rows = {row["check"]: row for row in artifacts.inspect(root, expected)}
        assert name in rows and not rows[name]["passed"], (name, description, rows)
        print(f"PASS discrimination {name}: {description}")

    reset()
    baseline = artifacts.inspect(root, expected)
    assert all(row["passed"] for row in baseline), baseline
    print(f"PASS baseline: {len(baseline)} rendered artifact assertions")
    for name, mutate in [
        ("plist-path", lambda: plist_path.unlink()),
        ("plist-valid", lambda: plist_path.write_text("not a plist")),
        ("user-domain", lambda: domain_path.write_text("gui\n")),
        ("activation-order", lambda: (root / "activate").write_text(activation.replace('"writeBoundary"', '"afterBoundary"'))),
        ("activation-private-directory", lambda: (root / "activate").write_text(activation.replace("-m 0700", "-m 0755"))),
    ]:
        reset()
        mutate()
        rejects(name, "missing or wrong realized file content")
    for key, value, check in [
        ("Label", "wrong.label", "label"),
        ("RunAtLoad", False, "RunAtLoad"),
        ("KeepAlive", {"SuccessfulExit": True}, "KeepAlive"),
        ("KeepAlive", {"SuccessfulExit": 0}, "KeepAlive"),
        ("KeepAlive", {"SuccessfulExit": False, "NetworkState": True}, "KeepAlive"),
        ("ThrottleInterval", None, "ThrottleInterval"),
        ("ProcessType", "Background", "ProcessType"),
        ("WorkingDirectory", "/wrong", "WorkingDirectory"),
        ("StandardOutPath", "/wrong", "StandardOutPath"),
        ("StandardErrorPath", "/wrong", "StandardErrorPath"),
        ("ProgramArguments", [expected["executable"], "host", "--server", artifacts.SERVER], "foreground-wait-exec"),
        *[("ProgramArguments", [*plist["ProgramArguments"][:2], plist["ProgramArguments"][2] + suffix], "foreground-wait-exec") for suffix in [" --background", " host enable", "; service_entry"]],
        ("ProgramArguments", [*plist["ProgramArguments"][:2], plist["ProgramArguments"][2].replace(artifacts.SERVER, "https://wrong.invalid")], "foreground-wait-exec"),
    ]:
        reset()
        changed = copy.deepcopy(plist)
        changed[key] = value
        if value is None:
            del changed[key]
        plist_path.write_bytes(plistlib.dumps(changed))
        rejects(check, f"{key}={value!r}")
    for key in plist["EnvironmentVariables"]:
        reset()
        changed = copy.deepcopy(plist)
        del changed["EnvironmentVariables"][key]
        plist_path.write_bytes(plistlib.dumps(changed))
        rejects("environment-names", f"missing {key}")
        if key != "PATH":
            rejects(f"environment-{key}", f"missing {key}")
    for item in expected["bins"]:
        reset()
        changed = copy.deepcopy(plist)
        changed["EnvironmentVariables"]["PATH"] = ":".join(entry for entry in changed["EnvironmentVariables"]["PATH"].split(":") if entry != item["path"])
        plist_path.write_bytes(plistlib.dumps(changed))
        rejects(f"PATH-{item['name']}", f"missing {item['name']}")
        rejects("PATH-order", f"missing {item['name']}")
    reset()
    changed = copy.deepcopy(plist)
    changed["EnvironmentVariables"]["PI_CODING_AGENT_DIR"] = "/Users/wrong/.atomic/agent"
    plist_path.write_bytes(plistlib.dumps(changed))
    rejects("environment-PI_CODING_AGENT_DIR", "wrong home in rendered value")
    reset()
    for old, new, check in [
        ('"setupLaunchAgents"', '"writeBoundary"', "activation-order"),
        ("-m 0700", "-m 0700 /wrong", "activation-private-directory"),
    ]:
        (root / "activate").write_text(activation.replace(old, new))
        rejects(check, "wrong order or directory")
        reset()

with patch.object(sys, "argv", ["darwin-artifacts.py", str(Path.cwd()), "git+file:///fixture?rev=fixture#checks.aarch64-darwin.darwin-stibnite"]), patch.object(artifacts, "expectations", return_value=expected), patch.object(artifacts, "command", side_effect=["/nix/store/fixture-system", "/nix/store/unrelated-generation"]):
    assert artifacts.main() == 1
    print("PASS discrimination generation-in-built-closure: unrelated generation is rejected")
