# Omnigent clan service

The `server` role enables the plain Omnigent NixOS module; the `host` role connects a foreground runner to that server's HTTPS domain.
Each host requires exactly one server in its instance.
Both roles currently target only magnetite, and `perMachine` imports both plain modules once even when a machine holds both roles.
The units have fixed names, so multiple Omnigent instances on one machine are not supported.

The server interface exposes `domain` and `port`.
It uses the confidential Kanidm client `omnigent`, the `kanidm-oauth2-omnigent` environment file, and an instance-scoped cookie generator.
The host interface exposes non-secret `environment` values and `extraPackages`, a list of nixpkgs attribute names that defaults to `[ ]`.
Use names such as `"hello"` or dotted paths such as `"python3Packages.requests"`; the NixOS module resolves them against the host's `pkgs` and adds the packages to the host and runner PATH.
Names keep the clan role interface JSON-serializable; the plain `services.omnigent-host.extraPackages` option still accepts package values directly.
The inventory uses a NixOS `extraModules` entry for `PI_CODING_AGENT_DIR` so it follows the selected user's actual home; role settings have no NixOS user configuration.

The host supplies the same environment through both `systemd.services.omnigent-host.environment` and `serviceConfig.Environment`.
The S3 contract inspects the latter, but pinned nixpkgs renders the former directly into unit text rather than populating that key (`nixos/lib/systemd-lib.nix:779-793`).
Both carriers derive from one attribute set and use nixpkgs' JSON quoting, so the repeated assignments have identical values.

## Runner state

The runner runs as the existing `cameron` account and reads that account's credentials.
The plain host module supplies HOME, an explicit PATH including Atomic and Bun, memory limits, and `NoNewPrivileges`.
Do not add namespace or mount restrictions that prevent unprivileged bubblewrap from running.
Native sessions are initially unsandboxed; sandboxed sessions need `/nix/store` in `read_paths`, which exposes unrelated store contents and still requires a runtime test.

Before starting sessions, the operator must log in to Omnigent and the vendor CLIs as the runner user, prepare authenticated Atomic state, and merge the following into `~/.omnigent/config.yaml` without replacing existing settings or credentials:

```yaml
host:
  name: magnetite
acp:
  agents:
    - name: Atomic
      command: bunx pi-acp@0.0.33
      omnigent_mcp: false
      inject_system_prompt: false
      env_passthrough: [PI_ACP_PI_COMMAND, PI_CODING_AGENT_DIR]
```

`services.omnigent-host.hostName` labels the unit and records the intended `host.name`; it does not rewrite the mutable YAML or replace a persisted host identity.
The Atomic entry appears as `acp:atomic`, alongside native Pi.
Its environment requires `PI_ACP_PI_COMMAND=atomic`, `PI_CODING_AGENT_DIR` pointing to the selected user's `.atomic/agent`, and `OMNIGENT_RUNNER_ENV_PASSTHROUGH=PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR`.
Do not set a conflicting `ATOMIC_CODING_AGENT_DIR`.
Do not run `omnigent host enable` or use `--background`: the declarative system unit owns the foreground process, and daemonization drops the required `PI_*` values.

## Deferred runners

The host role's `darwinModule` is an empty stub, not a functioning Darwin runner.
Do not add stibnite until its Home Manager launchd implementation exists.
Pyrite rollout, a dedicated runner account, and subsequent sandbox enforcement remain deferred.

See the [deployment plan](../../../../docs/notes/development/omnigent/deployment-plan.md) for the decisions and controller-owned deployment gates.
