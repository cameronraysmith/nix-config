import { IMPL, type Gate, type Slice } from "./types.js";

const artifacts = "/Users/crs58/.atomic/agent/sessions/--Users-crs58-projects-vanixiets--/subagent-artifacts";
export const upgradeResearch = `${artifacts}/omnigent-0130-upgrade-delta.md`;
export const upgradeAmendment = `${artifacts}/omnigent-0130-amendment.md`;
export const environmentResearch = `${artifacts}/omnigent-direnv-acp-divergence.md`;
export const runtimePackagesFile = "modules/home/ai/omnigent/runtime-packages.nix";
export const runtimeHosts = ["magnetite", "pyrite", "stibnite"] as const;
export const runtimeHumanItems = ["an acp:atomic tool call such as ls succeeds on magnetite", "the same succeeds on pyrite", "an acp:oh-my-pi turn still works", "a session in a fresh worktree gets the project toolchain (e.g. just --version succeeds)"] as const;
const flake = 'builtins.getFlake "__OMNIGENT_SOURCE__"';
const eq = (expr: string, value: unknown = true): Gate => ({ kind: "NixEval", target: { kind: "Expr", expr }, expect: { kind: "Equal", value } });
const command = (argv: string[], markers: string[] = []): Gate => ({ kind: "Command", argv, expectExitZero: true, expectStdoutIncludes: markers });
const checkCommand = (flag: string) => command(["bash", "-c", `cd "__OMNIGENT_PRIMARY__" && node .atomic/workflows/omnigent/check.mjs --${flag}`]);
export const runtimeFixture = `let f = ${flake}; g = f.inputs.flake-parts.lib.mkFlake { inputs = f.inputs // { self = f; }; } {
  imports = [ (f.inputs.import-tree (f.outPath + "/modules")) ];
  clan.inventory.instances.omnigent.roles.host.settings.extraPackages = [ ];
};`;
export const hostBinding = (name: string) => `d = g.${name === "stibnite" ? "darwin" : "nixos"}Configurations.${name}; c = d.config; p = d.pkgs; u = c.services.omnigent-host.user; home = c.users.users.\${u}.home; h = c.home-manager.users.\${u};
path = ${name === "stibnite" ? "h.launchd.agents.omnigent-host.config.EnvironmentVariables.PATH" : "c.systemd.services.omnigent-host.environment.PATH"};`;
export const runtimePathExpr = (name: string) => `${runtimeFixture} ${hostBinding(name)}
required = [ p.bash p.which p.direnv p.nix ];
${name === "stibnite" ? `r = f.packages.aarch64-darwin; agents = f.inputs.llm-agents.packages.aarch64-darwin;
expected = p.lib.makeBinPath ([ r.claude-code r.atomic agents.codex agents.pi agents.omp p.bun p.nodejs_22 p.python3 p.tmux p.git p.uv ] ++ required) + ":/usr/bin:/bin:/usr/sbin:/sbin";
in c.services.omnigent-host.extraPackages == [] && path == expected
&& builtins.head h.launchd.agents.omnigent-host.config.ProgramArguments == p.lib.getExe c.services.omnigent-host.package` : `in c.services.omnigent-host.extraPackages == [] && builtins.all (x: builtins.elem "\${p.lib.getBin x}/bin" (p.lib.splitString ":" path)) required`}`;
export const direnvTomlExpr = (name: string) => `${runtimeFixture} ${hostBinding(name)}
file = h.xdg.configFile."direnv/direnv.toml" or null;
prefix = if file == null || !file.enable then [] else ((builtins.fromTOML (builtins.readFile file.source)).whitelist or {}).prefix or [];
in prefix == [ (home + "/projects") ]`;
export const direnvHomeExpr = (name: string) => direnvTomlExpr(name).replace(
  `d = g.${name === "stibnite" ? "darwin" : "nixos"}Configurations.${name};`,
  `base = g.${name === "stibnite" ? "darwin" : "nixos"}Configurations.${name}; selected = base.config.services.omnigent-host.user;
  d = base.extendModules { modules = [ ({ lib, ... }: {
    users.users.\${selected}.home = lib.mkOverride 10 "/${name === "stibnite" ? "Users" : "home"}/omnigent-runtime-fixture";
    home-manager.users.\${selected}.home.homeDirectory = lib.mkOverride 10 "/${name === "stibnite" ? "Users" : "home"}/omnigent-runtime-fixture";
  }) ]; };`
);
export const runtimeRegressionExpr = (name: string, domain: string, agents: unknown) => `${runtimeFixture} ${hostBinding(name)}
r = f.packages.\${p.stdenv.hostPlatform.system}; a = f.inputs.llm-agents.packages.\${p.stdenv.hostPlatform.system};
required = [ r.claude-code r.atomic a.codex a.pi a.omp p.bun p.nodejs_22 p.python3 p.tmux p.git p.uv ] ++ p.lib.optionals p.stdenv.hostPlatform.isLinux [ p.bubblewrap ];
env = ${name === "stibnite" ? "h.launchd.agents.omnigent-host.config.EnvironmentVariables" : "c.systemd.services.omnigent-host.environment"};
argv = ${name === "stibnite" ? "h.launchd.agents.omnigent-host.config.ProgramArguments" : "c.systemd.services.omnigent-host.serviceConfig.ExecStart"};
in c.services.omnigent-host.enable && c.services.omnigent-host.hostName == "${name}" && h.home.username == u && h.home.homeDirectory == home
&& env.HOME == home && env.PI_ACP_PI_COMMAND == "atomic" && env.PI_CODING_AGENT_DIR == home + "/.atomic/agent"
&& env.OMNIGENT_RUNNER_ENV_PASSTHROUGH == "PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR"
&& p.lib.hasInfix "--server https://${domain}" (toString argv) && !(p.lib.hasInfix "--background" (toString argv))
&& builtins.all (x: builtins.elem "\${p.lib.getBin x}/bin" (p.lib.splitString ":" path)) required
&& ${name === "stibnite" ? 'p.lib.hasSuffix ":/usr/bin:/bin:/usr/sbin:/sbin" path' : "c.systemd.services.omnigent-host.serviceConfig.User == u"}
&& h.programs.omnigent.settings.host.name == "${name}" && h.programs.omnigent.settings.acp.agents == builtins.fromJSON ${JSON.stringify(JSON.stringify(agents))}
&& (builtins.elemAt h.programs.omnigent.settings.acp.agents 1).env_passthrough == []
&& builtins.all (n: h.programs.\${n}.enable) [ "atomic" "claude-code" "codex" "pi-coding-agent" "omp" "bun" ]`;
export const upgradeAmendments = [
  ["D2 targets all three released 0.13.0 wheels and retains the interpreter environment.", "Package the released `v0\\.13\\.0`[\\s\\S]*buildPythonPackage[\\s\\S]*python3\\.withPackages[\\s\\S]*sibling[^\\n]*omnigent-client[^\\n]*omnigent-ui-sdk[^\\n]*0\\.13\\.0"],
  ["D2 preserves isolated sys.executable hook probes and rejects the old module.", "PYTHONPATH-only wrapper is superseded[\\s\\S]*sys\\.executable[\\s\\S]*omnigent\\.harnesses\\.claude_native\\.hook[\\s\\S]*removed `omnigent\\.claude_native_hook`[\\s\\S]*env -i"],
  ["Four migrations run automatically at server start, ga → gb → gc → gd → ge.", "Four new Alembic migrations run automatically at server start[^\\n]*ga1b2c3d4e5f[^\\n]*gb1b2c3d4e5f[^\\n]*gc1b2c3d4e5f[^\\n]*gd1b2c3d4e5f[^\\n]*ge1b2c3d4e5f"],
  ["Migration failure is fatal and causes a restart loop.", "Migration failure is fatal[^\\n]*restart loop"],
  ["0.12.0 rejects a newer database revision; binary rollback alone cannot recover.", "0\\.12\\.0 rejects a database at a newer revision[^\\n]*binary rollback alone cannot recover"],
  ["Do not build a PostgreSQL backup system now: only host registrations and session rows are held.", "do not build a PostgreSQL backup system now[^\\n]*only[^\\n]*host registrations and session rows"],
  ["Pre-deploy pg_dump is the rollback artifact and missing, empty or failed dumps block the update.", "pg_dump[^\\n]*immediately before each deploy[^\\n]*rollback artifact[\\s\\S]*before `clan machines update`[^\\n]*absent, zero-length or failed dumps block"],
  ["Real backups are a separate clan-native change alongside ZFS snapshot work.", "separate clan-native change alongside the existing ZFS snapshot work"],
  ["Restore-or-reset is accepted human recovery, costing new host_id per host, re-login everywhere and conversation history.", "accepted recovery[^\\n]*restore[^\\n]*reset[\\s\\S]*new `host_id` per host[^\\n]*re-login on every host[^\\n]*loss of conversation history[\\s\\S]*restore-or-reset"],
  ["Electron OIDC #4650/#4649 remain OPEN at 0.13.0.", "Electron system-browser OIDC[^\\n]*4650[^\\n]*4649[^\\n]*remain OPEN at 0\\.13\\.0"],
  ["Native omp RPC #6714/#6695 remain OPEN at 0.13.0.", "native omp RPC[^\\n]*6714[^\\n]*6695[^\\n]*remain OPEN at 0\\.13\\.0"],
  ["No NixOS, Darwin, Clan, OIDC or ACP configuration changes are needed for this upgrade.", "no NixOS, Darwin, Clan, OIDC or ACP configuration change"],
] as const;
export const environmentAmendments = [
  ["ACP inherits a shell-free enumerated PATH; Atomic PATH-resolves sh and which. Native tmux sessions are not login shells but recover profile PATH via /etc/zshenv; terminal sessions inherit the project devshell: three distinct environment shapes.", "ACP[^\\n]*shell-free[\\s\\S]*sh[\\s\\S]*which[\\s\\S]*tmux[\\s\\S]*not login shells[\\s\\S]*/etc/zshenv[\\s\\S]*three distinct environment shapes"],
  ["The pi-family direnv extension needs required direnv and nix; path-specific direnv allow blocks fresh worktrees, so HM direnv.toml whitelists the selected home + /projects. Bash and which remain unconditional for workspaces without .envrc.", "direnv[^\\n]*nix[\\s\\S]*path-specific[\\s\\S]*direnv\\.toml[\\s\\S]*/projects[\\s\\S]*Bash[^\\n]*which[^\\n]*without \\.envrc"],
  ["A named shared reviewed runtime package set closes the repeated python3, omp, sh, which defect class. curl and openssh remain reviewed exclusions, not an install-everything toolchain.", "shared[^\\n]*reviewed runtime package set[\\s\\S]*python3[^\\n]*omp[^\\n]*sh[^\\n]*which[\\s\\S]*curl[^\\n]*openssh[^\\n]*reviewed exclusions"],
  ["Accepted risk: every .envrc under whitelisted ~/projects executes arbitrary code as the unsandboxed runner user; the extension applies arbitrary exported keys directly to process.env with no protected-variable filter, including PATH, TMPDIR and credential variables. Hardening is a follow-up after the mechanism is proven, not part of S10.", "Accepted risk[^\\n]*\\.envrc[^\\n]*~/projects[^\\n]*arbitrary code[^\\n]*unsandboxed[\\s\\S]*process\\.env[^\\n]*no protected-variable filter[^\\n]*PATH[^\\n]*TMPDIR[^\\n]*credential variables[\\s\\S]*[Hh]ardening[^\\n]*follow-up[^\\n]*proven"],
] as const;
export const packageProbe = (system: string) => {
  const remote = system === "x86_64-linux";
  return `# shellcheck disable=SC2029
set -euo pipefail
out=$(nix eval --raw "__OMNIGENT_SOURCE__#packages.${system}.omnigent.outPath")
${remote ? 'py=$(ssh root@magnetite.zt "head -1 $out/bin/omnigent | cut -c3-")\nssh root@magnetite.zt "env -i $py -I -"' : 'py=$(head -1 "$out/bin/omnigent" | cut -c3-)\nenv -i "$py" -I -'} < __OMNIGENT_PRIMARY__/.atomic/workflows/omnigent/package-probe.py`;
};
export const configuredBashExpr = (name: string) => `${runtimeFixture} ${hostBinding(name)}
b = p.lib.getBin p.bash;
in assert c.services.omnigent-host.extraPackages == [];
assert builtins.elem "\${b}/bin" (p.lib.splitString ":" path);
{ drv = b.drvPath; outputName = b.outputName; pathOutput = toString b; }`;
export const bashProbe = (system: string) => (system === "x86_64-linux" ? ["magnetite", "pyrite"] : ["stibnite"]).map((name) => `# shellcheck disable=SC2029
set -euo pipefail
binding=$(nix eval --json --impure --expr '${configuredBashExpr(name)}')
drv=$(jq -er .drv <<< "$binding")
output_name=$(jq -er .outputName <<< "$binding")
path_output=$(jq -er .pathOutput <<< "$binding")
${system === "x86_64-linux" ? `nix copy --derivation --to ssh-ng://root@magnetite.zt "$drv"
out=$(ssh root@magnetite.zt "nix build --no-link --print-out-paths '$drv^$output_name'")` : `out=$(nix build --no-link --print-out-paths "$drv^$output_name")`}
printf '${name} PATH-bash=%s executable-bash=%s\\n' "$path_output" "$out"
test "$out" = "$path_output"
printf '${name} same-store-path=true; test -x %s/bin/sh && test -x %s/bin/bash\\n' "$out" "$out"
${system === "x86_64-linux" ? 'ssh root@magnetite.zt "test -x $out/bin/sh && test -x $out/bin/bash"' : 'test -x "$out/bin/sh" && test -x "$out/bin/bash" || exit 1'}
printf '${name} bash-and-sh-ok\\n'`).join("\n");
const closures: Gate[] = [
  ...["magnetite", "pyrite"].map((name): Gate => ({ kind: "NixBuildRemote", installable: `__OMNIGENT_SOURCE__#checks.x86_64-linux.nixos-${name}` })),
  command(["nix", "build", "--no-link", "__OMNIGENT_SOURCE__#checks.aarch64-darwin.darwin-stibnite"]),
];

export function additionalSlices(plan: string, domain: string, agents: unknown, regressionGates: readonly Gate[]): Slice[] {
  return [
    {
      id: 9, title: "upgrade-0-13-0", implModel: IMPL,
      allowedPaths: ["pkgs/by-name/omnigent", plan, ".atomic/workflows/omnigent/slices.ts", ".atomic/workflows/omnigent/deployment.ts", ".atomic/workflows/omnigent/deployment-checks.mjs"],
      reviewReads: [plan, upgradeResearch, upgradeAmendment],
      objective: `Deliver the already-authored 0.13.0 upgrade as NEW S9, never amend S0/S1 or earlier changes. Authoritative evidence: ${upgradeResearch} and ${upgradeAmendment}; read both fully. Preserve the existing implementation, interpreter environment and dependency set. All three wheels move from 0.12.0 to 0.13.0: omnigent sha256-IQvXOpMsN0iN7o9wzkJXMiCuioSjMf4SxP2D/1pAtxM=; omnigent-client sha256-+1SQVA5m+iW+oq2s8DrBswEtzWH/vVmRhsj0zyJITUc=; omnigent-ui-sdk sha256-rsAyaQqiY6yVTeBNAhzLjtGE8ErDkL1BNX94B3wikF8=. Follow the renamed omnigent.harnesses.claude_native.hook in derivation imports/subprocess probes and workflow hook/version gates; omnigent.claude_native_hook is absent. Keep CLI server/host help and isolated sys.executable checks. Amend D2 and every current version statement in the deployment plan, preserving explicitly historical citations. The deploy phase must take a fail-closed pg_dump before machine update, retaining a durable positive-size receipt; missing or zero-length output prevents update. This is workflow-owned behavior, checked through its controller tests, not a Nix module. Record every acceptance amendment below. Explicit non-goals: no NixOS, Darwin, Clan, OIDC or ACP module changes, no backup system, no migration/restore/reset execution, no earlier-slice rewrite. Real backups belong to their own clan-native change alongside existing ZFS snapshot work.`,
      acceptance: ["Both package versions and all three installed wheel metadata versions equal 0.13.0; new hook exists, removed module cannot resolve, isolated hook and CLI probes pass.", ...upgradeAmendments.map(([item]) => item), "All three machine closures build on their designated platforms; evaluations alone are not builds."],
      gates: [
        ...["x86_64-linux", "aarch64-darwin"].map((system): Gate => ({ kind: "NixEval", target: { kind: "Attr", attr: `__OMNIGENT_SOURCE__#packages.${system}.omnigent.version` }, expect: { kind: "Equal", value: "0.13.0" } })),
        { kind: "NixBuildRemote", installable: "__OMNIGENT_SOURCE__#packages.x86_64-linux.omnigent" },
        command(["nix", "build", "--no-link", "__OMNIGENT_SOURCE__#packages.aarch64-darwin.omnigent"]),
        ...["x86_64-linux", "aarch64-darwin"].map((system) => command(["bash", "-c", packageProbe(system)], ["0.13.0-wheels-new-hook-old-absent-cli-ok"])),
        checkCommand("s9-deployment"),
        ...upgradeAmendments.map(([, pattern]): Gate => ({ kind: "GrepAssert", file: plan, pattern })),
        ...closures,
        eq(`let f = ${flake}; installed = packages: builtins.any (p: p.name == "omnigent-0.13.0") packages; in [
          (installed f.nixosConfigurations.magnetite.config.home-manager.users.cameron.home.packages)
          (installed f.homeConfigurations."crs58@aarch64-darwin".config.home.packages)
        ]`, [true, true]),
      ],
    },
    {
      id: 10, title: "acp-runtime-environment", implModel: IMPL,
      allowedPaths: ["modules/nixos/omnigent-host.nix", "modules/darwin/omnigent-host.nix", runtimePackagesFile, "modules/home/ai/omnigent/default.nix", plan],
      reviewReads: [plan, environmentResearch, "modules/home/ai/agent-settings.nix", "modules/home/terminal/direnv.nix"],
      objective: `Implement the approved direnv mechanism on BOTH runner modules, using ${environmentResearch} as authoritative diagnosis. Its recommendation to require protected-output filtering first is superseded by the user's explicit accepted risk below; do NOT add a filter. ACP has no shell/profile loader; /bin/sh exists on NixOS but /bin is absent from unit PATH. Atomic resolves sh through PATH and shells out to which. The pi-family direnv/index.ts extension (modules/home/ai/agent-settings.nix:73) normally loads the flake devshell, but both direnv and nix are missing under ACP. direnv allow is path-specific local state, so fresh agent worktrees are blocked even after the executables are supplied. Native tmux launches are not login shells: /etc/zshenv recovers profile PATH, not a devshell. Preserve these three distinct environment shapes in the plan.

Create the NAMED shared reviewed flake.lib.omnigentRuntimePackages function in ${runtimePackagesFile}, parameterized by pkgs; both modules consume inputs.self.lib.omnigentRuntimePackages pkgs before cfg.extraPackages rather than hand-enumerating separate lists. Retain exactly the existing common packages (repository claude-code/atomic, llm-agents codex/pi/omp, pkgs bun/nodejs_22/python3/tmux/git/uv), add pkgs.bash, pkgs.which, pkgs.direnv and pkgs.nix unconditionally, and retain bubblewrap via lib.optionals pkgs.stdenv.hostPlatform.isLinux. Preserve the Darwin :/usr/bin:/bin:/usr/sbin:/sbin suffix. This closes the fourth same-shaped runtime omission (python3, omp, sh, which); curl, openssh and other audit omissions remain reviewed exclusions, not an install-everything patch.

Deliver a declarative Home Manager direnv/direnv.toml whose [whitelist] prefix is exactly [ <selected user's home>/projects ] for the selected runner user on every host. Verified constraint: the NixOS module's user default enumerates config.home-manager.users, so defining home-manager.users.\${cfg.user} inside modules/nixos/omnigent-host.nix is infinite recursion (nix eval on 2026-09-09: "while evaluating the option home-manager.users ... services.omnigent-host.user ... infinite recursion encountered"). Set the whitelist instead in the shared HM module modules/home/ai/omnigent/default.nix, which already reads osConfig for host.name: programs.direnv.config.whitelist.prefix = [ "\${config.home.homeDirectory}/projects" ] when osConfig.services.omnigent-host is enabled and its user equals config.home.username; both S7/S8 gates already require h.home.homeDirectory to equal config.users.users.\${cfg.user}.home, so this is the configured user's home. No account literals anywhere, no per-worktree direnv allow side effects, no DIRENV_CONFIG environment carrier (Omnigent's ACP filter drops DIRENV_* variables). Bash and which are a mandatory floor even with absent, blocked or cold-loading .envrc; extraPackages=[] must not disable any required package. Preserve per-machine user derivation, foreground --server without --background, all three PI environment carriers, all harness entries, both shared ACP rows, omp's exactly empty env_passthrough and all S7/S8 lifecycle/server regressions.

Accepted risk: every .envrc under whitelisted ~/projects executes arbitrary code as the unsandboxed runner user. The extension applies arbitrary exported keys directly to process.env with no protected-variable filter, including PATH, TMPDIR and credential variables; exports may replace or delete them after Omnigent filtering. Record this blast radius plainly in the plan as accepted now to prove the mechanism; hardening is a named follow-up once proven, not S10 work. No credentials, extension changes, unrelated tools, backup system, sleep policy or deployment. Human attestations, not evaluation, prove live ACP/toolchain success.`,
      acceptance: ["Required bash/which/direnv/nix store paths on all three effective runner PATHs with empty extras; realized Bash provides bin/sh and bin/bash.", "Rendered HM direnv.toml whitelist prefix equals configured user home + /projects, including changed-home fixtures.", "One bounded reviewed runtime package source serves both modules; Linux-only bubblewrap and Darwin system suffix survive.", ...environmentAmendments.map(([item]) => item)],
      gates: [
        ...runtimeHosts.flatMap((name) => [eq(runtimePathExpr(name)), eq(direnvTomlExpr(name)), eq(direnvHomeExpr(name)), eq(runtimeRegressionExpr(name, domain, agents))]),
        ...["x86_64-linux", "aarch64-darwin"].map((system) => command(["bash", "-c", bashProbe(system)], ["bash-and-sh-ok"])),
        ...["modules/nixos/omnigent-host.nix", "modules/darwin/omnigent-host.nix", runtimePackagesFile, "modules/home/ai/omnigent/default.nix"].map((file): Gate => ({ kind: "GrepAssert", file, pattern: "^(?![\\s\\S]*(?:cameron|crs58))[\\s\\S]*$" })),
        command(["python3", "__OMNIGENT_PRIMARY__/.atomic/workflows/omnigent/runtime-contract-checks.py", "__OMNIGENT_SANDBOX__"], ["shared-runtime-contract-ok"]),
        ...environmentAmendments.map(([, pattern]): Gate => ({ kind: "GrepAssert", file: plan, pattern })),
        ...regressionGates,
        ...closures.map((gate) => gate.kind === "Command"
          ? command(["python3", "__OMNIGENT_PRIMARY__/.atomic/workflows/omnigent/darwin-artifacts.py", "--runtime-environment", "__OMNIGENT_SANDBOX__", "__OMNIGENT_SOURCE__#checks.aarch64-darwin.darwin-stibnite"])
          : gate),
      ],
    },
  ];
}
