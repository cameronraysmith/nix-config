import argparse
import json
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path


LABEL = "org.nix-community.home.omnigent-host"
SERVER = "https://omni.scientistexperience.net"


def command(argv, cwd):
    return subprocess.check_output(argv, cwd=cwd, text=True).strip()


def expectations(source, cwd, runtime_environment=False):
    expr = '''let
      f = builtins.getFlake SOURCE;
      d = f.darwinConfigurations.stibnite;
      c = d.config;
      p = d.pkgs;
      r = f.packages.aarch64-darwin;
      h = f.inputs.llm-agents.packages.aarch64-darwin;
      u = c.services.omnigent-host.user;
    in {
      home = c.users.users.${u}.home;
      executable = p.lib.getExe c.services.omnigent-host.package;
      install = "${p.coreutils}/bin/install";
      bins = builtins.map (x: { name = x.name; path = "${p.lib.getBin x.package}/bin"; }) ([
        { name = "claude-code"; package = r.claude-code; }
        { name = "atomic"; package = r.atomic; }
        { name = "codex"; package = h.codex; }
        { name = "pi"; package = h.pi; }
        { name = "omp"; package = h.omp; }
        { name = "bun"; package = p.bun; }
        { name = "nodejs"; package = p.nodejs_22; }
        { name = "python3"; package = p.python3; }
        { name = "tmux"; package = p.tmux; }
        { name = "git"; package = p.git; }
        { name = "uv"; package = p.uv; }
      ] ++ RUNTIME_BINS);
    }'''.replace("SOURCE", json.dumps(source)).replace("RUNTIME_BINS", "[ " + " ".join(
        '{ name = "' + name + '"; package = p.' + name + '; }'
        for name in (["bash", "which", "direnv", "nix"] if runtime_environment else [])
    ) + " ]")
    return json.loads(command(["nix", "eval", "--no-write-lock-file", "--json", "--impure", "--expr", expr], cwd))


def inspect(generation, expected):
    generation = Path(generation)
    rows = []

    def record(name, passed, observed):
        rows.append({"check": name, "passed": bool(passed), "observed": observed})

    plist_path = generation / "LaunchAgents" / f"{LABEL}.plist"
    record("plist-path", plist_path.is_file(), str(plist_path))
    try:
        plist = json.loads(command(["plutil", "-convert", "json", "-o", "-", str(plist_path)], generation))
        record("plist-valid", isinstance(plist, dict), "parsed with plutil to JSON")
        if not isinstance(plist, dict):
            return rows
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        record("plist-valid", False, "plutil/JSON parse failed")
        return rows
    record("label", plist.get("Label") == LABEL, plist.get("Label"))
    argv = plist.get("ProgramArguments")
    foreground = False
    if isinstance(argv, list) and len(argv) == 3 and argv[:2] == ["/bin/sh", "-c"] and isinstance(argv[2], str):
        try:
            foreground = shlex.split(argv[2]) == ["/bin/wait4path", "/nix/store", "&&", "exec", expected["executable"], "host", "--server", SERVER]
        except ValueError:
            pass
    record("foreground-wait-exec", foreground, argv)
    env = plist.get("EnvironmentVariables", {})
    required_env = {
        "HOME": expected["home"],
        "PI_ACP_PI_COMMAND": "atomic",
        "PI_CODING_AGENT_DIR": expected["home"] + "/.atomic/agent",
        "OMNIGENT_RUNNER_ENV_PASSTHROUGH": "PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR",
    }
    record("environment-names", all(key in env for key in [*required_env, "PATH"]), sorted(env))
    for key, value in required_env.items():
        record(f"environment-{key}", env.get(key) == value, env.get(key))
    path = env.get("PATH", "").split(":")
    record("PATH", isinstance(env.get("PATH"), str), env.get("PATH"))
    for item in expected["bins"]:
        record(f"PATH-{item['name']}", item["path"] in path, {"required": item["path"], "present": item["path"] in path})
    prefix = [item["path"] for item in expected["bins"]]
    record("PATH-order", path[:len(prefix)] == prefix and path[-4:] == ["/usr/bin", "/bin", "/usr/sbin", "/sbin"] and all(entry.startswith("/nix/store/") and entry.endswith("/bin") for entry in path[:-4]), {"requiredPrefix": path[:len(prefix)] == prefix, "systemSuffix": path[-4:]})
    for key, value in {"RunAtLoad": True, "KeepAlive": {"SuccessfulExit": False}, "ThrottleInterval": 5, "ProcessType": "Standard"}.items():
        observed = plist.get(key)
        record(key, type(observed) is type(value) and observed == value and (key != "KeepAlive" or observed["SuccessfulExit"] is False), observed)
    for key, value in {"WorkingDirectory": expected["home"], "StandardOutPath": expected["home"] + "/.omnigent/logs/host/service.log", "StandardErrorPath": expected["home"] + "/.omnigent/logs/host/service.log"}.items():
        record(key, plist.get(key) == value, plist.get(key))
    domain_path = generation / "LaunchAgentDomains" / f"{LABEL}.domain"
    domain = domain_path.read_text().strip() if domain_path.is_file() else None
    record("user-domain", domain == "user", {"path": str(domain_path), "value": domain})
    activation_path = generation / "activate"
    activation = activation_path.read_text() if activation_path.is_file() else ""
    names = ["writeBoundary", "omnigentMergeConfig", "omnigentHostLogDirectory", "setupLaunchAgents"]
    markers = [(i, match[1]) for i, line in enumerate(activation.splitlines(), 1) if (match := re.fullmatch(r'_iNote "Activating %s" "([^"]+)"', line))]
    selected = [(i, name) for i, name in markers if name in names]
    record("activation-order", [name for _, name in selected] == names, {"path": str(activation_path), "markers": selected})
    steps = [i for i, name in markers if name == "omnigentHostLogDirectory"]
    excerpt = []
    if len(steps) == 1:
        start = steps[0]
        end = next((i - 1 for i, _ in markers if i > start), len(activation.splitlines()))
        excerpt = [line.strip() for line in activation.splitlines()[start:end] if line.strip()]
    expected_step = ["run", expected["install"], "-d", "-m", "0700", expected["home"] + "/.omnigent/logs/host"]
    try:
        mode_ok = len(excerpt) == 1 and shlex.split(excerpt[0]) == expected_step
    except ValueError:
        mode_ok = False
    record("activation-private-directory", mode_ok, excerpt[:3])
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-environment", action="store_true")
    parser.add_argument("cwd")
    parser.add_argument("installable")
    args = parser.parse_args()
    cwd, installable = args.cwd, args.installable
    source, attr = installable.rsplit("#", 1)
    if attr != "checks.aarch64-darwin.darwin-stibnite":
        raise ValueError("Expected the stibnite Darwin closure check")
    started = time.monotonic()
    system = command(["nix", "build", "--no-link", "--print-out-paths", installable], cwd)
    elapsed = time.monotonic() - started
    expected = expectations(source, cwd, args.runtime_environment)
    closure = command(["nix-store", "--query", "--requisites", system], cwd).splitlines()
    generations = [path for path in closure if path.endswith("-home-manager-generation") and (Path(path) / "LaunchAgents" / f"{LABEL}.plist").is_file()]
    bound = len(generations) == 1
    rows = [{"check": "generation-in-built-closure", "passed": bound, "observed": generations}]
    if bound:
        rows.extend(inspect(generations[0], expected))
    print(json.dumps({"source": source, "system": system, "buildSeconds": round(elapsed, 3)}), flush=True)
    for row in rows:
        print(json.dumps(row), flush=True)
    return 0 if all(row["passed"] for row in rows) else 1


if __name__ == "__main__":
    sys.exit(main())
