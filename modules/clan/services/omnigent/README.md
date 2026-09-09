# Omnigent clan service

The `server` role enables the plain Omnigent NixOS module; the `host` role connects a foreground runner to that server's HTTPS domain.
Magnetite is the only server and the always-on host; stibnite is the second host.
Each host requires exactly one server in its instance.
On NixOS, `perMachine` imports both plain modules once even when a machine holds both roles.
On Darwin, the host role imports `flake.modules.darwin.omnigent-host` and selects the existing primary user by default.
The units have fixed names, so multiple Omnigent instances on one machine are not supported.

The server interface exposes `domain` and `port`.
It uses the confidential Kanidm client `omnigent`, the `kanidm-oauth2-omnigent` environment file, and an instance-scoped cookie generator.
The host interface exposes non-secret `environment` values and `extraPackages`, a list of nixpkgs attribute names that defaults to `[ ]`.
Use names such as `"hello"` or dotted paths such as `"python3Packages.requests"`; each platform resolves them against the host's `pkgs` and appends them to the required host and runner PATH.
Names keep the clan role interface JSON-serializable; the plain `services.omnigent-host.extraPackages` option accepts package values directly.
The shared inventory `extraModules` entry runs on both NixOS and Darwin and derives `PI_CODING_AGENT_DIR` from the selected account's actual home.
Role settings carry only the home-independent environment pair.

The NixOS host supplies the same environment through both `systemd.services.omnigent-host.environment` and `serviceConfig.Environment`.
The S3 contract inspects the latter, but pinned nixpkgs renders the former directly into unit text rather than populating that key (`nixos/lib/systemd-lib.nix:779-793`).
Both carriers derive from one attribute set and use nixpkgs' JSON quoting, so the repeated assignments have identical values.

## Runner state

The NixOS runner runs as the existing `cameron` account and reads that account's credentials.
The Darwin bridge derives HOME, working directory, Atomic state directory and log paths from `config.users.users.${cfg.user}.home`.
The machine boundary retains the existing account alias split; neither the bridge nor its Darwin clan role translates account names.
Home Manager enables `programs.omnigent` with the same package and merges `host.name` and the shared ACP definitions into writable `~/.omnigent/config.yaml`.
The merge preserves undeclared runtime state, including `host.host_id`; it must not become a Nix-store symlink.
Both hosts use the exact shared `Atomic` / `bunx pi-acp@0.0.33` and `Oh My Pi` / `omp acp` rows from `modules/home/ai/omnigent/acp.nix`.
Both rows disable `omnigent_mcp` and `inject_system_prompt`; Atomic allows `PI_ACP_PI_COMMAND` and `PI_CODING_AGENT_DIR`, while omp's `env_passthrough` is exactly empty so Atomic state does not reach omp.

The host environment carries `PI_ACP_PI_COMMAND=atomic`, `PI_CODING_AGENT_DIR=<selected-home>/.atomic/agent`, and `OMNIGENT_RUNNER_ENV_PASSTHROUGH=PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR`.
Do not set a conflicting `ATOMIC_CODING_AGENT_DIR`.
Credentials, sessions and host IDs remain local to each runner; never copy magnetite state to stibnite or publish tokens.

The NixOS module supplies memory limits and `NoNewPrivileges`.
Do not add namespace or mount restrictions that prevent unprivileged bubblewrap from running.
Native sessions are initially unsandboxed; Linux sandboxed sessions need `/nix/store` in `read_paths`, which exposes unrelated store contents and still requires a runtime test.

## Darwin lifecycle

Home Manager alone owns `launchd.agents.omnigent-host`, label `org.nix-community.home.omnigent-host`, in the selected user's `user/<uid>` domain.
It waits for `/nix/store` and executes the foreground argv `[ omnigent host --server <server-url> ]` using the configured package's absolute executable.
Do not run `omnigent host enable`, use `--background`, invoke upstream `service_entry`, or install a second plist.
The agent sets `RunAtLoad=true`, `KeepAlive.SuccessfulExit=false`, `ThrottleInterval=5`, and `ProcessType=Standard`.
Launchd's throttle limits respawning; it is not identical to systemd's post-exit `RestartSec` delay.
The user-domain session type may be `Background`, but process QoS must not be `ProcessType=Background`, which can starve runner deadlines.

The explicit store PATH always contains repository Claude Code and Atomic; llm-agents Codex, Pi and omp; and nixpkgs Bun, Node.js 22, Python 3, tmux, Git and uv.
Extra packages follow those requirements, then `/usr/bin:/bin:/usr/sbin:/sbin` supplies native macOS utilities.
Darwin gets no bubblewrap and relies on neither a profile PATH, shell initialization nor `launchctl setenv`.
Both output streams go to `<selected-home>/.omnigent/logs/host/service.log`.
Home Manager creates the private log directory with mode `0700` after `writeBoundary` and `omnigentMergeConfig`, before `setupLaunchAgents`.

A sleeping laptop shows offline and reconnects automatically on wake or network return; offline is expected, not a fault.
There is no network-state load restriction or disabled restart.
An expired login after the roughly 30-day refresh grant can cause throttled foreground restart loops, unlike upstream `service_entry`'s permanent-failure exit mapping.
Inspect the declared log and run `omnigent login https://omni.scientistexperience.net` again as the selected user to renew credentials.

`NoNewPrivileges` has no launchd analogue.
`MemoryHigh` and `MemoryMax` have no aggregate process-tree equivalent on launchd; per-process RSS is not a cgroup limit.
Neither changing plist owner nor setting `ResidentSetSize` restores those Linux guarantees.
Availability before first login, after logout/reboot, Keychain access and macOS Background Items approval remain runtime checks, not evaluation guarantees.

## Human activation and acceptance

Follow this order on stibnite after selecting the configured `services.omnigent-host.user`:

1. Inspect any existing `ai.omnigent.host` agent or manually launched host and deliberately retire competing lifecycle ownership without overwriting state.
2. Log in locally with `omnigent login https://omni.scientistexperience.net`, using the same Omnigent identity as magnetite.
3. Preserve and verify vendor logins, Pi's `~/.pi/agent`, Atomic's `~/.atomic/agent` and omp's `~/.omp/agent`; approve credential replacement explicitly.
4. Only after controller gates and independent review, activate the pinned stibnite configuration through the existing workstation process.
   This workflow's deploy phase still targets magnetite; it does not activate stibnite.
5. Inspect `launchctl print user/$(id -u)/org.nix-community.home.omnigent-host`, its argv/environment and the declared log without publishing tokens.
   Verify the writable configuration has name `stibnite` and a distinct persistent `host_id`, and that both hosts appear in the authenticated UI.
6. Explicitly select stibnite and test native Claude/Codex/Pi and ACP Atomic/omp turns, Files after Resume, approvals, independent state roots, sleep/network recovery and logout/reboot recovery.
   Record each outcome as human attestation; evaluations and builds do not prove runtime success.

The controller first builds `checks.aarch64-darwin.package-omnigent`, then `checks.aarch64-darwin.darwin-stibnite` locally after the evaluation gates pass.
The Darwin package and magnetite server configuration are unchanged by this extension.
Pyrite rollout, a dedicated runner account, and subsequent sandbox enforcement remain deferred.
See the [deployment plan](../../../../docs/notes/development/omnigent/deployment-plan.md) for the exact gates and platform acceptance limits.
