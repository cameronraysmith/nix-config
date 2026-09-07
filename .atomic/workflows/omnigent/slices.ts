import { Value } from "typebox/value";
import { Type } from "typebox";
import { Blocked, relativePath } from "../bump/types.js";
import { IMPL, Slice, validateModelPolicy, type Gate } from "./types.js";
import { additionalSlices } from "./s9-s10.js";

export const plan = "docs/notes/development/omnigent/deployment-plan.md";
export const identityDoc = "packages/docs/src/content/docs/development/operations/identity/kanidm.md";
export const domain = "omni.scientistexperience.net";
export const issuer = "https://accounts.scientistexperience.net/oauth2/openid/omnigent";
export const hostEnvironment = [
  "PI_ACP_PI_COMMAND=atomic", "PI_CODING_AGENT_DIR=/home/cameron/.atomic/agent",
  "OMNIGENT_RUNNER_ENV_PASSTHROUGH=PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR",
];
export const hardeningAbsent = ["RestrictNamespaces", "SystemCallFilter", "ProtectKernelTunables", "ProtectKernelLogs", "ProtectHostname", "ProcSubset"];
const flake = 'builtins.getFlake "__OMNIGENT_SOURCE__"';
export const fixture = `let f = ${flake}; in (f.nixosConfigurations.magnetite.extendModules { modules = [
  f.modules.nixos.omnigent
  ({ config, ... }: { services.omnigent = { enable = true; domain = "${domain}"; cookieSecretGenerator = "omnigent-cookie-secret-omnigent";
      oidc.issuer = "${issuer}"; oidc.clientId = "omnigent"; oidc.allowedDomains = [];
      environmentFiles = [ config.clan.core.vars.generators.kanidm-oauth2-omnigent.files.env.path ];
    }; })
]; }).config`;
const real = `(${flake}).nixosConfigurations.magnetite.config`;
export const acpAgent = { name: "Atomic", command: "bunx pi-acp@0.0.33", omnigent_mcp: false, inject_system_prompt: false, env_passthrough: ["PI_ACP_PI_COMMAND", "PI_CODING_AGENT_DIR"] } as const;
export const acpMarkers = ["agents=1", `name=${acpAgent.name}`, `command=${acpAgent.command}`, "omnigent_mcp=false", "inject_system_prompt=false", `env_passthrough=${acpAgent.env_passthrough.join(",")}`];
export const mergeScript = "modules/home/ai/omnigent/merge-config.sh";
export const runnerSettingsExpr = `${real}.home-manager.users.cameron.programs.omnigent.settings`;
const yqPrelude = `set -euo pipefail\nyq=$(nix build --no-link --print-out-paths --impure --expr '(${flake}).inputs.nixpkgs.legacyPackages.\${builtins.currentSystem}.yq-go')/bin/yq`;
const acpReadout = (file: string) => `printf 'agents=%s\\n' "$("$yq" '.acp.agents | length' ${file})"
for key in name command omnigent_mcp inject_system_prompt; do printf '%s=%s\\n' "$key" "$("$yq" ".acp.agents[0].$key" ${file})"; done
printf 'env_passthrough=%s\\n' "$("$yq" '.acp.agents[0].env_passthrough | join(",")' ${file})"`;
export const serverConfigHomeExpr = `let d = ${real}.systemd.services.omnigent.environment.OMNIGENT_CONFIG_HOME; in builtins.seq (builtins.readDir d) d`;
export const serverConfigProbe = `${yqPrelude}
dir=$(nix eval --no-write-lock-file --raw --impure --expr '${serverConfigHomeExpr}')
${acpReadout('"$dir/config.yaml"')}`;
export const mergeProbe = `${yqPrelude}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
nix eval --no-write-lock-file --json --impure --expr '${runnerSettingsExpr}' | "$yq" -p json -o yaml '.' > "$tmp/declared.yaml"
printf 'host:\\n  host_id: deadbeef\\n  name: magnetite\\n' > "$tmp/config.yaml"
PATH="$(dirname "$yq"):$PATH" bash __OMNIGENT_SANDBOX__/${mergeScript} "$tmp/declared.yaml" "$tmp/config.yaml"
printf 'host_id=%s\\n' "$("$yq" '.host.host_id' "$tmp/config.yaml")"
printf 'host_name=%s\\n' "$("$yq" '.host.name' "$tmp/config.yaml")"
${acpReadout('"$tmp/config.yaml"')}`;
export const ompResearch = "/Users/crs58/.atomic/agent/sessions/--Users-crs58-projects-vanixiets--/subagent-artifacts/omnigent-omp-acp-research.md";
export const ompAgent = { name: "Oh My Pi", command: "omp acp", omnigent_mcp: false, inject_system_prompt: false, env_passthrough: [] } as const;
export const s6Agents = [acpAgent, ompAgent];
const agentsReadout = (file: string) => `"$yq" -o json -I 0 '.acp.agents' ${file} | jq -e --argjson expected '${JSON.stringify(s6Agents)}' '. == $expected'`;
export const s6ServerConfigProbe = `${yqPrelude}
dir=$(nix eval --no-write-lock-file --raw --impure --expr '${serverConfigHomeExpr}')
${agentsReadout('"$dir/config.yaml"')}`;
export const s6MergeProbe = mergeProbe.replace(acpReadout('"$tmp/config.yaml"'), agentsReadout('"$tmp/config.yaml"'));
export const s6AgentsExpr = `(${flake}).lib.omnigentACP.agents`;
export const requiredOmpBinaryExpr = `let f = ${flake}; g = f.inputs.flake-parts.lib.mkFlake { inputs = f.inputs // { self = f; }; } {
  imports = [ (f.inputs.import-tree (f.outPath + "/modules")) ];
  clan.inventory.instances.omnigent.roles.host.settings.extraPackages = [ ];
}; c = g.nixosConfigurations.magnetite; omp = f.inputs.llm-agents.packages.x86_64-linux.omp;
in assert builtins.elem omp c.config.systemd.services.omnigent-host.path; f.inputs.nixpkgs.lib.getExe omp`;
export const tileUrl = "https://raw.githubusercontent.com/omnigent-ai/omnigent/ea89e38cb2488c003cec06ae123640be0c97eb5d/docs/images/omnigent-logo.svg";
export const tileHash = "sha256-ugW4JnZsXeq4nd/MTxbQnLg/7b7lVLUmceNcicj52fs=";
export const tileImageExpr = `${real}.services.kanidm.provision.systems.oauth2.omnigent.imageFile`;
export const tileSvgExpr = `let image = ${tileImageExpr}; in image != null && (let text = builtins.readFile image; in builtins.stringLength text > 0 && builtins.match ".*<svg[[:space:]>].*" text != null)`;
const s6Amendments = [
  ["Catalogue: Claude Code, Codex, Pi, Atomic-over-pi-acp and omp-over-its-own-ACP.", "Claude Code[\\s\\S]*Codex[\\s\\S]*Pi[\\s\\S]*Atomic[\\s\\S]*pi-acp[\\s\\S]*omp[\\s\\S]*(?:own|native)[- ]ACP"],
  ["PI_CODING_AGENT_DIR would send omp to Atomic state; deny-by-default ACP filtering and exactly empty env_passthrough prevent it.", "PI_CODING_AGENT_DIR[\\s\\S]*Atomic[\\s\\S]*deny-by-default[\\s\\S]*env_passthrough[\\s\\S]*empty"],
  ["Deliberately keep omp approvals on: ACP requests permission for bash and the runner executes unsandboxed as cameron.", "omp[\\s\\S]*approvals[\\s\\S]*on[\\s\\S]*bash[\\s\\S]*unsandboxed[\\s\\S]*cameron"],
  ["Generic ACP is expected to be superseded by the native omp RPC harness tracked at omnigent-ai/omnigent#6714 / #6695; #4917's stall does not apply with both flags false because #5234 shipped inject_system_prompt=false before 0.12.0.", "(?=[\\s\\S]*native[\\s\\S]*RPC)(?=[\\s\\S]*supersed)[\\s\\S]*6714[\\s\\S]*6695[\\s\\S]*4917[\\s\\S]*5234[\\s\\S]*inject_system_prompt[\\s\\S]*false[\\s\\S]*0\\.12\\.0"],
] as const;
const eq = (expr: string, value: unknown): Gate => ({ kind: "NixEval", target: { kind: "Expr", expr }, expect: { kind: "Equal", value } });
const configEq = (base: string, expr: string, value: unknown): Gate => eq(`let c = (${base}); lib = (${flake}).inputs.nixpkgs.lib; in ${expr}`, value);
const serverGates = (base: string): Gate[] => [
  configEq(base, "c.services.omnigent.enable", true),
  configEq(base, "c.services.omnigent.domain", domain),
  configEq(base, "c.services.omnigent.cookieSecretGenerator", "omnigent-cookie-secret-omnigent"),
  configEq(base, 'builtins.all (name: builtins.elem name c.services.postgresql.ensureDatabases) [ "omnigent" "matrix-synapse" "buildbot" ]', true),
  configEq(base, 'lib.hasPrefix "16." c.services.postgresql.package.version', true),
  configEq(base, 'builtins.elem "postgresql.target" c.systemd.services.omnigent.after', true),
  configEq(base, 'lib.hasInfix "postgresql+psycopg:///omnigent?host=/run/postgresql" (toString c.systemd.services.omnigent.serviceConfig.ExecStart)', true),
  configEq(base, 'lib.hasInfix "local all all              peer" c.services.postgresql.authentication', true),
  configEq(base, `c.services.nginx.virtualHosts."${domain}".locations."/".proxyWebsockets`, true),
  configEq(base, `builtins.all (s: lib.hasInfix s c.services.nginx.virtualHosts."${domain}".locations."/".extraConfig) [ "proxy_read_timeout 1d;" "proxy_send_timeout 1d;" "proxy_buffering off;" ]`, true),
  configEq(base, "c.services.kanidm.provision.systems.oauth2.omnigent.scopeMaps", { omnigent_users: ["openid", "profile", "email"] }),
  configEq(base, 'c.services.kanidm.provision.groups ? omnigent_users', true),
  configEq(base, 'builtins.all (n: builtins.hasAttr n c.clan.core.vars.generators) [ "kanidm-oauth2-omnigent" "omnigent-cookie-secret-omnigent" ]', true),
  configEq(base, 'c.systemd.services.omnigent.environment.WEB_CONCURRENCY', "1"),
  configEq(base, 'builtins.elem "postgresql.target" c.systemd.services.omnigent.requires', true),
  configEq(base, '[ c.systemd.services.omnigent.serviceConfig.MemoryHigh c.systemd.services.omnigent.serviceConfig.MemoryMax ]', ["2G", "3G"]),
  configEq(base, '!(c.systemd.services.omnigent.environment ? OMNIGENT_OIDC_ALLOWED_DOMAINS) && !(c.systemd.services.omnigent.environment ? OMNIGENT_OIDC_SKIP_EMAIL_VERIFICATION)', true),
  configEq(base, 'builtins.readFile c.systemd.services.omnigent.environment.OMNIGENT_ADMIN_LIST_PATH', "cameron.ray.smith@gmail.com\n"),
  configEq(base, `lib.hasInfix "--host 127.0.0.1" (toString c.systemd.services.omnigent.serviceConfig.ExecStart)`, true),
  configEq(base, `[ c.services.nginx.virtualHosts."${domain}".enableACME c.services.nginx.virtualHosts."${domain}".forceSSL ]`, [true, true]),
  configEq(base, `lib.hasPrefix "http://127.0.0.1:" c.services.nginx.virtualHosts."${domain}".locations."/".proxyPass`, true),
  configEq(base, 'c.services.kanidm.provision.systems.oauth2.omnigent.originUrl', `https://${domain}/auth/callback`),
  configEq(base, 'c.services.kanidm.provision.systems.oauth2.omnigent.originLanding', `https://${domain}`),
  configEq(base, 'c.services.kanidm.provision.systems.oauth2.omnigent.public or false', false),
];
const hookImportProbe = [
  'set -euo pipefail',
  'out=$(nix build --no-link --print-out-paths "__OMNIGENT_SOURCE__#packages.x86_64-linux.omnigent")',
  'py=$(ssh root@magnetite.zt "head -1 $out/bin/omnigent | sed -e \'s|^#!||\' -e \'s| .*||\'")',
  'ssh root@magnetite.zt "env -i $py -c \'import omnigent, omnigent.claude_native_hook; print(\\"omnigent-import-ok\\")\'"',
].join("\n");
export const secondServerExpr = `let f = ${flake}; g = f.inputs.flake-parts.lib.mkFlake { inputs = f.inputs // { self = f; }; } {
  imports = [ (f.inputs.import-tree (f.outPath + "/modules")) ];
  clan.inventory.instances.omnigent.roles.server.machines.cinnabar.settings = { domain = "${domain}"; port = 8080; };
}; in g.nixosConfigurations.magnetite.config.system.build.toplevel.drvPath`;
export const extraPackagesExpr = `let f = ${flake}; g = f.inputs.flake-parts.lib.mkFlake { inputs = f.inputs // { self = f; }; } {
  imports = [ (f.inputs.import-tree (f.outPath + "/modules")) ];
  clan.inventory.instances.omnigent.roles.host.settings.extraPackages = [ "hello" ];
}; c = g.nixosConfigurations.magnetite; in builtins.elem c.pkgs.hello c.config.systemd.services.omnigent-host.path`;
export const runtimeEnvironmentJustification = "Remove the late Claude settings TMPDIR/TMPPREFIX overrides introduced by 2e71149d3 (2026-02-12), which cited anthropics/claude-code #17989 and #22667. Both reports concern sandbox defects, not temp pollution; their suggested workaround was TMPPREFIX, never an ambient TMPDIR override, and neither remedy came from a maintainer. CHANGELOG 2.1.45 fixes the cwd/sandbox regression (#21654, underlying #22667); 2.1.47 fixes sandboxed zsh heredocs (#25990, same as #17989). Both predate deployed 2.1.263, whose sandbox child-environment construction sets TMPDIR, CLAUDE_CODE_TMPDIR and derived TMPPREFIX together. Our sandbox.enabled = false leaves that path inactive. mirkolenz/infra added the settings on February 3 (74202d94) and removed them on February 14 (9288d6ce). Deletion returns auxiliary audio clips, Chrome screenshots and history prefetch to the ambient temp directory; core prompt/staging storage uses CLAUDE_CODE_TMPDIR or literal /tmp and was never governed by TMPDIR.";
const runtimeEnvironmentRule = "Harness-visible environment is declared once at the service boundary (the unit, or the shared flake.lib.omnigentACP-style value), never inside an individual agent's own settings file: settings-file env is applied late by that agent alone and is invisible to peer processes that must agree on the same root.";
const claudeEnvironmentGates = (base: string, profile: "base" | "glm" | "cerebras"): Gate[] => {
  if (profile === "base") return [
    configEq(base, "let env = c.programs.claude-code.settings.env or {}; in !(env ? TMPDIR) && !(env ? TMPPREFIX)", true),
    configEq(base, '!(lib.hasInfix "/tmp/claude" (builtins.toJSON c.programs.claude-code.settings))', true),
  ];
  const activation = profile === "glm" ? "claudeGlmMutableSettings" : "claudeCerebrasMutableSettings";
  const source = `let c = (${base}); lib = (${flake}).inputs.nixpkgs.lib; in
    if c.programs.claude-code.mutableSettings then
      let script = c.home.activation.${activation}.data;
          line = builtins.head (builtins.filter (lib.hasInfix "install -Dm644 ") (lib.splitString "\\n" script));
      in builtins.appendContext (builtins.head (builtins.match ".*install -Dm644 ([^ ]+) .*" line)) (builtins.getContext script)
    else c.xdg.configFile."claude-${profile}/settings.json".source`;
  return [{ kind: "Command", argv: ["bash", "-c", `set -euo pipefail
file=$(nix build --no-link --print-out-paths --no-write-lock-file --impure --expr '${source}')
if [ -z "$file" ]; then echo "Claude ${profile} settings build returned no path" >&2; exit 1; fi
jq -e '(.env // {}) | (has("TMPDIR") or has("TMPPREFIX")) | not' "$file"
if grep -q '/tmp/claude' "$file"; then echo "Claude ${profile} settings retain /tmp/claude" >&2; exit 1; else status=$?; [ "$status" -eq 1 ]; fi`], expectExitZero: true }];
};
const amendments = [
  ["Host environment option and all three forwarding variables; foreground host --server, never daemonization; exact acp stanza and atomic catalogue entry.", "environment[\\s\\S]*PI_ACP_PI_COMMAND[\\s\\S]*PI_CODING_AGENT_DIR[\\s\\S]*OMNIGENT_RUNNER_ENV_PASSTHROUGH"],
  ["Foreground host command and explicit rejection of --background / host enable.", "foreground[\\s\\S]*--background"],
  ["Pinned ACP configuration and atomic beside pi in the harness catalogue.", "acp:[\\s\\S]*bunx pi-acp@0\\.0\\.33"],
  ["Inventory is modules/clan/inventory/services/omnigent.nix; no existing two-role precedent.", "modules/clan/inventory/services/omnigent\\.nix"],
  ["No two-role precedent exists in this repository.", "(?:no|neither)[^\\n]*two-role"],
  ["Allowed domains unset; admin roster is cameron.ray.smith@gmail.com; Kanidm group membership gates admission.", "OMNIGENT_OIDC_ALLOWED_DOMAINS[^\\n]*(?:unset|unconfigured)"],
  ["Admin roster names the operator's primary email.", "cameron\\.ray\\.smith@gmail\\.com"],
  ["One worker because cli-login tickets are in-memory.", "(?:single|one)[- ]worker"],
  ["Replace fork URL citations with local kanidm checkout and pin.", "/Users/crs58/ghq/github.com/kanidm/kanidm"],
  ["Restate R9: read_paths includes /nix/store and weakens isolation.", "read_paths[\\s\\S]*/nix/store"],
  ["Mobile WebView shell hands off through system browser and /auth/cli-login; one confidential client suffices.", "WebView[\\s\\S]*system browser[\\s\\S]*/auth/cli-login"],
] as const;

export const darwinResearch = "/Users/crs58/.atomic/agent/sessions/--Users-crs58-projects-vanixiets--/subagent-artifacts/omnigent-darwin-host-research.md";
export const darwinConfig = `(${flake}).darwinConfigurations.stibnite.config`;
export const darwinInventoryExpr = `builtins.attrNames (${flake}).clan.inventory.instances.omnigent.roles.host.machines`;
export const darwinAgentExpr = `let c = ${darwinConfig}; in c.home-manager.users.\${c.services.omnigent-host.user}.launchd.agents.omnigent-host`;
export const darwinAgentExistsExpr = `let a = (${darwinAgentExpr}); in a.enable && a.domain == "user" && a.waitForNixStore`;
const darwinEq = (expr: string, value: unknown): Gate => eq(`let c = ${darwinConfig}; u = c.services.omnigent-host.user; home = c.users.users.\${u}.home; h = c.home-manager.users.\${u}; a = h.launchd.agents.omnigent-host.config; lib = (${flake}).inputs.nixpkgs.lib; in ${expr}`, value);
export const darwinPathExpr = `let f = ${flake}; g = f.inputs.flake-parts.lib.mkFlake { inputs = f.inputs // { self = f; }; } {
  imports = [ (f.inputs.import-tree (f.outPath + "/modules")) ];
  clan.inventory.instances.omnigent.roles.host.settings.extraPackages = [ ];
}; d = g.darwinConfigurations.stibnite; c = d.config; p = d.pkgs; r = f.packages.aarch64-darwin; h = f.inputs.llm-agents.packages.aarch64-darwin;
a = c.home-manager.users.\${c.services.omnigent-host.user}.launchd.agents.omnigent-host.config;
expected = p.lib.makeBinPath [ r.claude-code r.atomic h.codex h.pi h.omp p.bun p.nodejs_22 p.python3 p.tmux p.git p.uv ] + ":/usr/bin:/bin:/usr/sbin:/sbin";
in c.services.omnigent-host.extraPackages == [] && a.EnvironmentVariables.PATH == expected && builtins.head a.ProgramArguments == p.lib.getExe c.services.omnigent-host.package`;
export const darwinHomeFixtureExpr = `let f = ${flake}; base = f.darwinConfigurations.stibnite; user = base.config.services.omnigent-host.user;
d = base.extendModules { modules = [ ({ lib, ... }: {
  users.users.\${user}.home = lib.mkForce "/Users/omnigent-home-fixture";
  home-manager.users.\${user}.home.homeDirectory = lib.mkForce "/Users/omnigent-home-fixture";
}) ]; }; c = d.config; a = c.home-manager.users.\${user}.launchd.agents.omnigent-host.config;
in a.EnvironmentVariables.PI_CODING_AGENT_DIR == c.users.users.\${user}.home + "/.atomic/agent" && a.EnvironmentVariables.HOME == c.users.users.\${user}.home && a.StandardOutPath == c.users.users.\${user}.home + "/.omnigent/logs/host/service.log" && a.StandardErrorPath == a.StandardOutPath && a.WorkingDirectory == c.users.users.\${user}.home`;
export const darwinAmendments = [
  ["Record the completed Darwin extension with HM-owned launchd and its proof gates.", "(?:completed|implemented) Darwin extension[\\s\\S]*launchd"],
  ["NoNewPrivileges has no launchd analogue.", "NoNewPrivileges[^\\n]*(?:no|without)[^\\n]*(?:equivalent|analogue)"],
  ["MemoryHigh/MemoryMax have no aggregate process-tree equivalent; per-process RSS is not a cgroup limit.", "MemoryHigh[\\s\\S]*MemoryMax[\\s\\S]*no[^\\n]*aggregate[\\s\\S]*(?:RSS|ResidentSetSize)[\\s\\S]*(?:not|neither)[^\\n]*cgroup"],
  ["A sleeping/offline laptop reconnects automatically on wake/network return; offline is expected, not a fault.", "(?:sleep|sleeping)[\\s\\S]*offline[\\s\\S]*reconnect[\\s\\S]*(?:wake|network)[\\s\\S]*expected"],
  ["Expired login after the roughly 30-day refresh grant can cause throttled foreground restart loops; logs diagnose it and omnigent login renews credentials.", "(?:expired|expiry)[\\s\\S]*30.day[\\s\\S]*throttl[\\s\\S]*log[\\s\\S]*omnigent login"],
] as const;

export const pyriteResearch = "/Users/crs58/.atomic/agent/sessions/--Users-crs58-projects-vanixiets--/subagent-artifacts/omnigent-s8-pyrite-contract.md";
export const pyriteConfig = `(${flake}).nixosConfigurations.pyrite.config`;
export const pyriteInventoryExpr = darwinInventoryExpr;
export const pyriteUnitExpr = `let c = ${pyriteConfig}; s = c.systemd.services.omnigent-host; in c.services.omnigent-host.enable && s.enable && s.serviceConfig.Type == "simple" && s.serviceConfig.User == c.services.omnigent-host.user`;
const pyriteEq = (expr: string, value: unknown): Gate => eq(`let c = ${pyriteConfig}; lib = (${flake}).inputs.nixpkgs.lib; u = c.services.omnigent-host.user; home = c.users.users.\${u}.home; h = c.home-manager.users.\${u}; s = c.systemd.services.omnigent-host; in ${expr}`, value);
export const pyritePackages = "r.claude-code r.atomic h.codex h.pi h.omp p.bun p.nodejs_22 p.python3 p.tmux p.git p.uv p.bubblewrap";
export const pyritePathExpr = `let f = ${flake}; g = f.inputs.flake-parts.lib.mkFlake { inputs = f.inputs // { self = f; }; } {
  imports = [ (f.inputs.import-tree (f.outPath + "/modules")) ];
  clan.inventory.instances.omnigent.roles.host.settings.extraPackages = [ ];
}; d = g.nixosConfigurations.pyrite; c = d.config; p = d.pkgs; r = f.packages.x86_64-linux; h = f.inputs.llm-agents.packages.x86_64-linux;
s = c.systemd.services.omnigent-host; required = [ ${pyritePackages} ];
in c.services.omnigent-host.extraPackages == [] && builtins.all (x: builtins.elem x s.path && builtins.elem "\${p.lib.getBin x}/bin" (p.lib.splitString ":" s.environment.PATH)) required`;
export const pyriteUserFixtureExpr = `let f = ${flake}; g = f.inputs.flake-parts.lib.mkFlake { inputs = f.inputs // { self = f; }; } {
  imports = [ (f.inputs.import-tree (f.outPath + "/modules")) ];
  clan.inventory.instances.omnigent.roles.host.machines.pyrite.settings = f.inputs.nixpkgs.lib.mkForce { user = "omnigent-fixture"; environment = { PI_ACP_PI_COMMAND = "atomic"; OMNIGENT_RUNNER_ENV_PASSTHROUGH = "PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR"; }; };
  flake.modules.nixos."machines/nixos/pyrite" = { lib, ... }: {
    users.users.omnigent-fixture = { isNormalUser = true; home = "/home/omnigent-fixture"; };
    home-manager.users.omnigent-fixture.home = { username = "omnigent-fixture"; homeDirectory = "/home/omnigent-fixture"; stateVersion = "26.05"; };
  };
}; c = g.nixosConfigurations.pyrite.config; s = c.systemd.services.omnigent-host;
in c.services.omnigent-host.user == "omnigent-fixture" && s.serviceConfig.User == "omnigent-fixture" && s.environment.HOME == "/home/omnigent-fixture" && s.environment.PI_CODING_AGENT_DIR == "/home/omnigent-fixture/.atomic/agent" && g.nixosConfigurations.magnetite.config.services.omnigent-host.user == f.nixosConfigurations.magnetite.config.services.omnigent-host.user && g.darwinConfigurations.stibnite.config.services.omnigent-host.user == f.darwinConfigurations.stibnite.config.services.omnigent-host.user`;
export const pyriteLifecycle = `s.serviceConfig.Restart == "on-failure" && s.serviceConfig.RestartSec == 5 && builtins.elem "multi-user.target" s.wantedBy && builtins.elem "network-online.target" s.after && builtins.elem "network-online.target" s.wants && !(builtins.elem "network-online.target" (s.requires ++ s.bindsTo)) && !(s.unitConfig ? StartLimitIntervalSec) && !(s.unitConfig ? StartLimitBurst) && !(c.systemd.settings.Manager ? DefaultStartLimitIntervalSec) && !(c.systemd.settings.Manager ? DefaultStartLimitBurst) && builtins.all (t: !(builtins.elem t (s.conflicts ++ s.partOf ++ s.bindsTo))) [ "sleep.target" "suspend.target" "hibernate.target" "suspend-then-hibernate.target" ] && !(s.unitConfig.StopWhenUnneeded or false)`;
export const pyriteSettingsExpr = `let c = ${pyriteConfig}; in c.home-manager.users.\${c.services.omnigent-host.user}.programs.omnigent.settings`;
export const pyriteDeclaredExpr = `let c = ${pyriteConfig}; lib = (${flake}).inputs.nixpkgs.lib;
script = c.home-manager.users.\${c.services.omnigent-host.user}.home.activation.omnigentMergeConfig.data;
line = builtins.head (builtins.filter (lib.hasInfix "run ") (lib.splitString "\\n" script));
context = lib.filterAttrs (drv: _: lib.hasSuffix "-omnigent-config.yaml.drv" drv) (builtins.getContext script);
in assert builtins.length (builtins.attrNames context) == 1; builtins.appendContext (builtins.head (builtins.match ".*run [^ ]+ ([^ ]+) .*" line)) context`;
export const pyriteConfigProbe = `${yqPrelude}
declared=$(nix build --no-link --print-out-paths --impure --expr '${pyriteDeclaredExpr}')
test -f "$declared"
test "$("$yq" '.host.name' "$declared")" = pyrite
${agentsReadout('"$declared"')}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf 'host:\\n  host_id: deadbeef\\n  name: old-name\\n' > "$tmp/config.yaml"
PATH="$(dirname "$yq"):$PATH" bash __OMNIGENT_SANDBOX__/${mergeScript} "$declared" "$tmp/config.yaml"
test "$("$yq" '.host.host_id' "$tmp/config.yaml")" = deadbeef
test "$("$yq" '.host.name' "$tmp/config.yaml")" = pyrite
${agentsReadout('"$tmp/config.yaml"')}
printf 'pyrite-rendered-settings-and-merge-ok\\n'`;
export const pyriteAmendments = [
  ["Host roster: magnetite is server + co-located runner; stibnite is Darwin with a launchd user agent; pyrite is NixOS with systemd and intermittent availability.", "[Hh]ost roster[^\\n]*magnetite[^\\n]*server[^\\n]*co-located[^\\n]*stibnite[^\\n]*Darwin[^\\n]*launchd user agent[^\\n]*pyrite[^\\n]*NixOS[^\\n]*systemd[^\\n]*intermittent"],
  ["D1's pyrite/stibnite next increment is discharged by S7 and S8; implementation does not imply activation or runtime acceptance.", "D1[^\\n]*pyrite/stibnite[^\\n]*next increment[^\\n]*discharged[^\\n]*S7[^\\n]*S8"],
  ["Pyrite goes offline on suspend/hibernate and reconnects automatically on resume/network return without manual restart; network-online.target orders boot, not resume, and Restart=on-failure with RestartSec=5 retains crash recovery.", "[Pp]yrite[^\\n]*offline[^\\n]*suspend/hibernate[^\\n]*reconnects automatically[^\\n]*resume/network[^\\n]*without manual restart[^\\n]*network-online.target[^\\n]*boot[^\\n]*not resume[^\\n]*Restart=on-failure[^\\n]*RestartSec=5"],
  ["The separate pyrite-never-sleep change owns machine sleep policy; S8 neither depends on it nor changes that policy, and the runner must work whether or not pyrite sleeps.", "pyrite-never-sleep[^\\n]*owns[^\\n]*sleep policy[^\\n]*S8[^\\n]*neither depends[^\\n]*nor changes[^\\n]*whether or not pyrite sleeps"],
] as const;

const precedingSlices = [
  {
    id: 0, title: "amend-plan", implModel: IMPL,
    allowedPaths: ["docs/notes/development/omnigent", identityDoc, "openspec/changes/deploy-omnigent-magnetite", "openspec/linear.yaml"],
    objective: "Amend the deployment plan and Kanidm access runbook, and bind OpenSpec S0–S10 to a Linear story in the omnigent-magnetite project.",
    acceptance: [...amendments.map(([item]) => item), "Document yopass.se and workstation clan vars get as accepted practice, grant-existing-person procedure, scope-mapped /ui/apps tile and originLanding."],
    gates: [
      { kind: "Command", argv: ["openspec", "validate", "deploy-omnigent-magnetite"], expectExitZero: true },
      ...amendments.map(([, pattern]) => ({ kind: "GrepAssert" as const, file: plan, pattern })),
      ...["yopass\\.se", "clan vars get", "grant an existing person access to a new app", "omnigent_users", "/ui/apps", "originLanding"].map((pattern) => ({ kind: "GrepAssert" as const, file: identityDoc, pattern })),
      { kind: "Command", argv: ["bash", "-c", `! grep -q 'github:cameronraysmith/kanidm@' ${plan}`], expectExitZero: true },
      { kind: "Command", argv: ["python3", "__OMNIGENT_PRIMARY__/.atomic/workflows/omnigent/linear-readback.py", "__OMNIGENT_SANDBOX__"], expectExitZero: true },
    ],
  },
  {
    id: 1, title: "package", implModel: IMPL, allowedPaths: ["pkgs/by-name/omnigent", plan],
    objective: "Package the PyPI v0.12.0 wheels with buildPythonApplication, pythonRelaxDeps, and a PYTHONPATH-only wrapper per D2, amended: (a) verified wheel hashes — omnigent-0.12.0-py3-none-any.whl sha256-cDiE5p/7lE51VEo7OVoepm+nNZmIQ62uk8qtvxajt0Q=, omnigent_client-0.12.0-py3-none-any.whl sha256-zNBLQ4pfYLPKzMk/yIq10gRyF4Rj0+UFgq9FMqjVjJY=, omnigent_ui_sdk-0.12.0-py3-none-any.whl sha256-n9sxlaIIC/hMtSCFfJjKehbaPfsTnNZdnD86KQYxapk= (fetchPypi format=wheel, python=py3, dist=py3, platform=any); `nix store prefetch-file` and PyPI metadata reads are permitted network reads for this slice; (b) D2's `psycopg[binary]` is satisfied in nixpkgs by `python3Packages.psycopg` (propagates psycopg-c against Nix libpq); record that one-line D2 amendment in the deployment plan's D2 section; omnigent-client and omnigent-ui-sdk are packaged as sibling wheel derivations inside pkgs/by-name/omnigent (not exposed as top-level packages).",
    acceptance: ["Version is 0.12.0.", "Remote x86_64-linux package builds.", "Built CLI --help includes server and host.", "deployment-plan.md D2 records the nixpkgs psycopg substitution."],
    gates: [
      { kind: "NixEval", target: { kind: "Attr", attr: "__OMNIGENT_SOURCE__#packages.x86_64-linux.omnigent.version" }, expect: { kind: "Equal", value: "0.12.0" } },
      { kind: "NixBuildRemote", installable: "__OMNIGENT_SOURCE__#packages.x86_64-linux.omnigent" },
      { kind: "Command", argv: ["bash", "-c", 'p=$(nix eval --raw "__OMNIGENT_SOURCE__#packages.x86_64-linux.omnigent.outPath"); ssh root@magnetite.zt "$p/bin/omnigent" --help'], expectExitZero: true, expectStdoutIncludes: ["server", "host"] },
    ],
  },
  {
    id: 2, title: "server", implModel: IMPL,
    allowedPaths: ["modules/nixos/omnigent.nix", "modules/nixos/kanidm.nix", "modules/terranix/cloudflare.nix"],
    objective: "Implement D3–D6 with S0 amendments (live-deploy amendment: the server unit must pass `--database-uri postgresql+psycopg:///omnigent?host=/run/postgresql`, because the packaged driver is psycopg 3 and the bare `postgresql://` scheme selects SQLAlchemy's psycopg2 dialect, observed as ModuleNotFoundError psycopg2 on magnetite 2026-09-08): shared PostgreSQL 16 peer auth, confidential OIDC, generator carriers, unproxied CNAME, nginx SSE, single worker, allowed-domains unset, primary-email admin roster. Gates enable the server through extendModules, not the not-yet-written clan binding.",
    reviewReads: [plan, identityDoc, "__OMNIGENT_PRIMARY__/.atomic/workflows/omnigent/evidence/kanidm-person-cameron-20260907.txt"],
    acceptance: ["Server fixture satisfies every §3 server, PostgreSQL, nginx, Kanidm and generator assertion.", "D3–D6 retain existing services and configure single-worker serving and the admin roster.", "terraform-validate passes; toplevel drvPath evaluates without a closure build."],
    gates: [
      ...serverGates(fixture),
      { kind: "Command", argv: ["nix", "build", "--no-link", "__OMNIGENT_SOURCE__#checks.aarch64-darwin.terraform-validate"], expectExitZero: true },
      { kind: "NixEval", target: { kind: "Expr", expr: `(${fixture}).system.build.toplevel.drvPath` }, expect: { kind: "Matches", pattern: "^/nix/store/.*\\.drv$" } },
    ],
  },
  {
    id: 3, title: "host-clan", implModel: IMPL, reviewReads: [plan, identityDoc],
    allowedPaths: ["modules/nixos/omnigent-host.nix", "modules/clan/services/omnigent", "modules/clan/inventory/services/omnigent.nix"],
    objective: "Implement the plain foreground host module with environment option and two-role clan composition. Bind server and host to magnetite; preserve all three forwarding variables, user cameron and the exact ACP stanza. No runner namespace hardening incompatible with bubblewrap.",
    acceptance: ["Real magnetite server and runner configurations match §3; both inventory roles target magnetite alone.", "Host ExecStart uses --server https://omni.scientistexperience.net in foreground; three required environment values survive.", "User cameron, NoNewPrivileges true; six incompatible hardening keys absent.", "clan.modules exposes omnigent; a second server fails with an exactly-one-server assertion.", "The single machine closure build succeeds remotely."],
    gates: [
      ...serverGates(real),
      configEq(real, "c.services.omnigent-host.enable", true),
      configEq(real, "c.services.omnigent-host.serverUrl", `https://${domain}`),
      configEq(real, "c.services.omnigent-host.user", "cameron"),
      configEq(real, "c.systemd.services.omnigent-host.serviceConfig.User", "cameron"),
      configEq(real, "c.systemd.services.omnigent-host.serviceConfig.NoNewPrivileges", true),
      configEq(real, `builtins.all (s: lib.hasInfix s (builtins.toJSON c.systemd.services.omnigent-host.serviceConfig.Environment)) [ ${hostEnvironment.map((s) => JSON.stringify(s)).join(" ")} ]`, true),
      configEq(real, `lib.hasInfix "--server https://${domain}" c.systemd.services.omnigent-host.serviceConfig.ExecStart && !(lib.hasInfix "--background" c.systemd.services.omnigent-host.serviceConfig.ExecStart)`, true),
      configEq(real, `builtins.all (k: !(builtins.hasAttr k c.systemd.services.omnigent-host.serviceConfig)) [ ${hardeningAbsent.map((s) => JSON.stringify(s)).join(" ")} ]`, true),
      eq(`builtins.elem "omnigent" (builtins.attrNames (${flake}).clan.modules)`, true),
      ...["server", "host"].map((role) => eq(`builtins.attrNames (${flake}).clan.inventory.instances.omnigent.roles.${role}.machines`, ["magnetite"])),
      { kind: "Command", argv: ["nix", "eval", "--impure", "--json", "--expr", secondServerExpr], expectExitZero: false, failureDiagnostic: "Omnigent requires exactly one server" },
      { kind: "NixEval", target: { kind: "Expr", expr: extraPackagesExpr }, expect: { kind: "Equal", value: true } },
      { kind: "NixBuildRemote", installable: "__OMNIGENT_SOURCE__#checks.x86_64-linux.nixos-magnetite" },
    ],
  },
  {
    id: 4, title: "declarative-config", implModel: IMPL, reviewReads: [plan, identityDoc],
    allowedPaths: ["modules/nixos/omnigent.nix", "modules/home/ai/omnigent", "modules/home/ai/atomic", "pkgs/by-name/omnigent", plan],
    objective: `Derive ONE shared ACP agent definition in Nix and deliver it to both consumers of ~/.omnigent/config.yaml. Verified facts: the UI harness dropdown is GET /v1/harnesses -> harness_catalog() (/Users/crs58/ghq/github.com/omnigent-ai/omnigent/omnigent/harness_plugins.py:1165), whose acp:<slug> rows come from acp_agents() at :1196-1209 reading the config file of the serving process; config resolution is omnigent/config.py:13-22 (OMNIGENT_CONFIG_HOME env, else $HOME/.omnigent/config.yaml); the server unit runs as user omnigent with HOME=/var/lib/omnigent and that directory has no config.yaml, which is why Atomic is absent from the UI while omni setup as cameron shows it. The runner's config.yaml IS runtime-written (omnigent/host/identity.py:170-185 and :220-235 persist host.host_id and host.name via yaml.safe_dump), so the runner-side file must not be a read-only store symlink; the server never writes it, so a read-only store path is correct there. The agent is exactly ${JSON.stringify(acpAgent)} (currently live in /home/cameron/.omnigent/config.yaml). (a) Server, in modules/nixos/omnigent.nix: render the acp block to a store directory containing config.yaml and set systemd.services.omnigent.environment.OMNIGENT_CONFIG_HOME to that directory, so the serving process's harness catalog gains the acp:atomic row; do not write into /var/lib/omnigent. (b) Runner, in modules/home/ai/omnigent/: add programs.omnigent.settings (pkgs.formats.yaml type) carrying the same acp block plus host.name = "magnetite" when the NixOS host name is known (osConfig), and an activation entry after writeBoundary that merges the declared YAML into ~/.omnigent/config.yaml through modules/home/ai/omnigent/merge-config.sh with the same usage contract as modules/home/ai/omp/merge-config.sh (<declared.yaml> <target.yaml>, yq-go, mappings merge key by key, sequences and scalars replaced), never clobbering runtime keys, above all host.host_id. Express the agent once (a shared Nix value both modules read, e.g. a flake-level attribute or a lib helper under the allowed paths) rather than duplicating the YAML. Do not put PI_ACP_PI_COMMAND, PI_CODING_AGENT_DIR, or OMNIGENT_RUNNER_ENV_PASSTHROUGH here; those stay on the S3 systemd unit. Leave modules/home/ai/atomic untouched unless a concrete need for omnigent-driven use is documented in the summary.

SECOND, INDEPENDENT DEFECT IN THE SAME SLICE (packaging; fix it in pkgs/by-name/omnigent). Observed live on magnetite: a Claude Code session started from the Omnigent UI fails every Stop hook with "No module named 'omnigent'" from /nix/store/...-python3-3.14.6/bin/python3.14, and consequently the agent's response never renders in the web view while the terminal view still shows it. Root cause, verified in the pinned source at /Users/crs58/ghq/github.com/omnigent-ai/omnigent: build_hook_settings composes the hook argv as python_executable or sys.executable (omnigent/claude_native_bridge.py:1496 and :1575), i.e. <python> -m omnigent.claude_native_hook, and the Stop hook is what relays turn results (:1611). Our derivation finishes with wrapProgram "$program" --prefix PYTHONPATH (pkgs/by-name/omnigent/package.nix:93), which puts omnigent on PYTHONPATH only for the omnigent process; sys.executable stays the bare store interpreter, and Claude Code spawns hooks as fresh subprocesses that do not inherit that PYTHONPATH. This is not a missing dependency -- every dependency is present -- it is the wrong delivery mechanism for a program that re-invokes sys.executable from foreign processes. FIX: make sys.executable an interpreter that already has omnigent and its dependencies in site-packages, so nothing depends on environment inheritance -- build the library as a buildPythonPackage and expose the application through a python environment (python3.withPackages / toPythonApplication) whose interpreter is the console script's shebang; drop the PYTHONPATH wrapper if it becomes redundant. Do not weaken or skip the existing version/build/--help gates. Also record in deployment-plan.md's D2 section that the PYTHONPATH-only wrapper decision is superseded by this evidence, citing the two source locations above and the observed hook failure.`,
    acceptance: ["The packaged omnigent's own interpreter imports omnigent under a scrubbed environment (env -i), and `-m omnigent.claude_native_hook` resolves there.", "deployment-plan.md D2 records that the PYTHONPATH-only wrapper is superseded, with the sys.executable evidence.", "The server unit's OMNIGENT_CONFIG_HOME/config.yaml parses to exactly one agent whose name, command, omnigent_mcp, inject_system_prompt, and env_passthrough match the contract.", "programs.omnigent.settings for cameron on magnetite carries the same agent and host.name magnetite; the merge script keeps an existing host.host_id and adds the acp block.", "home.packages still contains omnigent-0.12.0 for cameron on magnetite and for crs58@aarch64-darwin.", "modules/home/ai/atomic is unchanged unless a stated need is documented.", "The single machine closure build succeeds remotely."],
    gates: [
      { kind: "Command", argv: ["bash", "-c", serverConfigProbe], expectExitZero: true, expectStdoutIncludes: acpMarkers },
      eq(`let s = ${runnerSettingsExpr}; in [ (builtins.length s.acp.agents) s.host.name ]`, [1, "magnetite"]),
      eq(`builtins.any (p: p.name == "omnigent-0.12.0") ${real}.home-manager.users.cameron.home.packages`, true),
      eq(`builtins.any (p: p.name == "omnigent-0.12.0") (${flake}).homeConfigurations."crs58@aarch64-darwin".config.home.packages`, true),
      { kind: "Command", argv: ["bash", "-c", mergeProbe], expectExitZero: true, expectStdoutIncludes: ["host_id=deadbeef", "host_name=magnetite", ...acpMarkers] },
      { kind: "Command", argv: ["bash", "-c", hookImportProbe], expectExitZero: true, expectStdoutIncludes: ["omnigent-import-ok"] },
      { kind: "GrepAssert", file: plan, pattern: "sys\\.executable|PYTHONPATH-only wrapper is superseded" },
      { kind: "NixBuildRemote", installable: "__OMNIGENT_SOURCE__#checks.x86_64-linux.nixos-magnetite" },
    ],
  },
  {
    id: 5, title: "runtime-environment", implModel: IMPL, reviewReads: [plan, identityDoc],
    allowedPaths: ["modules/home/ai/claude-code", "modules/nixos/omnigent-host.nix", plan],
    objective: `Fix two diagnosed defects in our runtime configuration, not upstream Omnigent. Defect A: modules/home/ai/claude-code/default.nix sets settings.env.TMPDIR=/tmp/claude and TMPPREFIX=/tmp/claude/zsh; wrappers.nix inherits them for GLM and Cerebras. Claude applies these to process.env after exec, so its hooks validate a bridge root under /tmp/claude while the runner created it under /tmp. Omnigent derives roots through tempfile.gettempdir() (omnigent/claude_native_bridge.py:88-92, validator :490-519); validation fails before hooks.jsonl/state.json, the cursor stays zero, and the forwarder gates message_deltas.jsonl on transcript_path. DELETE both settings from the base and ensure neither survives in the inherited wrapper profiles; inheritance should carry the deletion without a replacement override or filter. Do not introduce a shared TMPDIR, tmpfiles rule, or unit Environment=TMPDIR. Deletion removes the coupling so session peers inherit the same ambient temp root. ${runtimeEnvironmentJustification}

Defect B: Files becomes empty after Resume because runner/environment_filesystem.py:560-584 shells out to python3 through os_env.shell, but the runner unit PATH lacks Python. Reproduction with runner PATH: exit 127, zero stdout; with bare Python: exit 0, 32 entries. inner/os_env.py:1492-1497 turns nonzero status into an error, and environment_filesystem.py:585-586 raises before the JSON fallback at :590-592; do not describe this as successful empty JSON. The asleep producer is a different host-tunnel WorkspaceReader. The listing subprocess imports only os and json, both standard library; bare pkgs.python3 suffices, without a withPackages environment. Add it to modules/nixos/omnigent-host.nix's REQUIRED runtime path list before ++ cfg.extraPackages, not a host-only extraPackages addition.

${runtimeEnvironmentRule} Both defects violate this boundary: one agent rewrites a shared root late, and a required peer executable is absent from the service runtime. Amend deployment-plan.md with this rule, both diagnoses, the deletion justification (including 2.1.45/2.1.47), Python sufficiency, and deletion's auxiliary-temp cost. The controller records the deletion justification in the S5 commit message; do not mutate jj from the writer.

Record only, do not change behavior: modules/home/ai/agent-settings.nix:73 enables direnv for Pi and Atomic; the deployed extension copies every direnv export json key into process.env without a protected-root filter. A project .envrc exporting TMPDIR, HOME or an XDG root can reproduce this class of ACP session failure, and Atomic is now a live Omnigent harness. Record two candidate remedies (filter protected variables, or scope the extension) with the decision explicitly deferred to the operator. Preserve service isolation, sandbox scratch handling, ownership checks and forwarding restrictions.`,
    acceptance: ["For crs58@aarch64-darwin and cameron on magnetite: the evaluated base Claude settings attrset carries neither TMPDIR nor TMPPREFIX, and the rendered GLM and Cerebras settings.json contain no /tmp/claude text. The base profile is proven at the attrset because its rendered file is installed by an activation script whose store path pure evaluation cannot realize; the deployed base settings.json is proven separately by the deploy-phase probe probe-claude-hook-env.", "Bare pkgs.python3 reaches the runner unit path unconditionally, proven by an evaluation in which extraPackages is empty, so it cannot be satisfied by an optional extraPackages entry; the listing subprocess uses only os and json.", "The plan records the deletion provenance, 2.1.45/2.1.47 fixes, disabled sandbox, auxiliary-temp cost, service-boundary architectural rule, and direnv hazard with operator-deferred candidate remedies.", "No shared TMPDIR, tmpfiles rule, agent-local replacement root or direnv behavior change is introduced.", "The single machine closure build succeeds remotely."],
    gates: [
      ...[`(${flake}).homeConfigurations."crs58@aarch64-darwin".config`, `${real}.home-manager.users.cameron`].flatMap((base) => (["base", "glm", "cerebras"] as const).flatMap((profile) => claudeEnvironmentGates(base, profile))),
      configEq(real, 'builtins.any (p: builtins.match "/nix/store/[^/]*-python3[^/]*" (toString p) != null) c.systemd.services.omnigent-host.path', true),
      eq(`let f = ${flake}; g = f.inputs.flake-parts.lib.mkFlake { inputs = f.inputs // { self = f; }; } {
  imports = [ (f.inputs.import-tree (f.outPath + "/modules")) ];
  clan.inventory.instances.omnigent.roles.host.settings.extraPackages = [ ];
}; c = g.nixosConfigurations.magnetite.config; in builtins.any (p: builtins.match "/nix/store/[^/]*-python3[^/]*" (toString p) != null) c.systemd.services.omnigent-host.path`, true),
      { kind: "GrepAssert", file: plan, pattern: "2\\.1\\.45[\\s\\S]*2\\.1\\.47" },
      { kind: "GrepAssert", file: plan, pattern: "[Hh]arness-visible environment[\\s\\S]*declared once[\\s\\S]*service boundary[\\s\\S]*never[\\s\\S]*settings file" },
      { kind: "NixBuildRemote", installable: "__OMNIGENT_SOURCE__#checks.x86_64-linux.nixos-magnetite" },
    ],
  },
  {
    id: 6, title: "omp-acp-and-tile", implModel: IMPL, reviewReads: [plan, identityDoc, ompResearch],
    allowedPaths: ["modules/home/ai/omnigent", "modules/nixos/omnigent-host.nix", "modules/nixos/kanidm.nix", plan],
    objective: `Implement two independent additions. Authoritative ACP research: ${ompResearch}, especially sections 1–4 and 6 (Omnigent v0.12.0 and omp v18.1.13 source citations).

First, append ${JSON.stringify(ompAgent)} to the SAME flake.lib.omnigentACP.agents list in modules/home/ai/omnigent/acp.nix, preserving ${JSON.stringify(acpAgent)}. The display name yields slug oh-my-pi and harness id acp:oh-my-pi. Both the server's read-only store config selected by OMNIGENT_CONFIG_HOME and the runner's merge-on-activation ~/.omnigent/config.yaml must receive both entries by construction, not duplication. Preserve runtime-minted host.host_id. Require a module comment beside the omp row: omp resolves its state directory from PI_CODING_AGENT_DIR (oh-my-pi packages/utils/src/dirs.ts:438-473), which the runner sets to /home/cameron/.atomic/agent for Atomic; ACP child environments are deny-by-default and this row's exactly empty env_passthrough prevents Atomic's state directory from reaching omp. Adding PI_CODING_AGENT_DIR here would silently share Atomic state. Do not add a spec-level passthrough bypass.

Add inputs.llm-agents.packages.\${system}.omp to modules/nixos/omnigent-host.nix's REQUIRED runtime package list before ++ cfg.extraPackages, beside the existing harness packages and S5's python3, using the same input as modules/home/ai/omp/default.nix. No new unit Environment= and no OMNIGENT_RUNNER_ENV_PASSTHROUGH additions are needed. Preserve all existing Atomic values. Do NOT add --auto-approve or permission-mode bypass: approvals stay on deliberately because omp ACP still requests permission for bash (packages/coding-agent/src/session/session-tools.ts:697-719) and the runner executes unsandboxed as cameron; the two false integration flags do not disable ACP permission requests (omnigent/inner/acp_executor.py:970-1033).

Second, give services.kanidm.provision.systems.oauth2.omnigent imageFile = pkgs.fetchurl { url = "${tileUrl}"; hash = "${tileHash}"; }, following the matrix client precedent in modules/nixos/kanidm.nix. Require a comment explaining the artwork: docs/images/omnigent-logo.svg is the 1024x1024 square mark; the platform-assets 1734x454 wordmark renders poorly in a square tile, while favicon/vscode copies are only 32x32. Keep the commit pin and verified hash.

Amend deployment-plan.md briefly with all four acceptance items below. Cite omnigent-ai/omnigent#6714 / #6695 for the expected future native omp RPC replacement, not a shipped feature; #4917 is not a reason to wait because #5234 merged inject_system_prompt=false before 0.12.0 and disabling MCP avoids its session/new stall. This contract authorizes a controlled generic-ACP trial, not a claim of live turn success.`,
    acceptance: ["One shared ACP list contains exactly Atomic and Oh My Pi with the exact commands, flags and passthrough lists; both carriers match it and runner merge preserves host.host_id.", "The omp module comment records the shared PI_CODING_AGENT_DIR hazard and why env_passthrough must stay empty.", "The required runner PATH contains an executable omp even when extraPackages = [ ]; no forwarding or environment additions and no auto-approval bypass.", "The pinned Kanidm imageFile resolves to a nonempty SVG and its comment explains the square-mark choice over the wordmark and low-resolution copies.", ...s6Amendments.map(([item]) => item), "The remote magnetite closure builds. UI dropdown, completed acp:oh-my-pi turn and Kanidm icon appearance require human attestation, not inference from these gates."],
    gates: [
      eq(s6AgentsExpr, s6Agents),
      eq(`(${runnerSettingsExpr}).acp.agents`, s6Agents),
      { kind: "Command", argv: ["bash", "-c", s6ServerConfigProbe], expectExitZero: true, expectStdoutIncludes: ["true"] },
      { kind: "Command", argv: ["bash", "-c", s6MergeProbe], expectExitZero: true, expectStdoutIncludes: ["host_id=deadbeef", "host_name=magnetite", "true"] },
      { kind: "NixEval", target: { kind: "Expr", expr: requiredOmpBinaryExpr }, expect: { kind: "Matches", pattern: "^/nix/store/[^/]+/bin/omp$" } },
      { kind: "NixBuildRemote", installable: "__OMNIGENT_SOURCE__#checks.x86_64-linux.nixos-magnetite" },
      { kind: "Command", argv: ["bash", "-c", `set -euo pipefail
binary=$(nix eval --no-write-lock-file --raw --impure --expr '${requiredOmpBinaryExpr}')
# shellcheck disable=SC2029
ssh root@magnetite.zt "test -x $binary"`], expectExitZero: true },
      { kind: "NixEval", target: { kind: "Expr", expr: `let image = ${tileImageExpr}; in if image == null then "" else toString image` }, expect: { kind: "Matches", pattern: "^/nix/store/[^/]+\\.svg$" } },
      eq(tileSvgExpr, true),
      ...s6Amendments.map(([, pattern]) => ({ kind: "GrepAssert" as const, file: plan, pattern })),
      { kind: "GrepAssert", file: "modules/home/ai/omnigent/acp.nix", pattern: "(?=[\\s\\S]*#[^\\n]*PI_CODING_AGENT_DIR)(?=[\\s\\S]*#[^\\n]*Atomic)(?=[\\s\\S]*#[^\\n]*deny-by-default)(?=[\\s\\S]*#[^\\n]*env_passthrough)(?=[\\s\\S]*#[^\\n]*empty)" },
      { kind: "GrepAssert", file: "modules/nixos/kanidm.nix", pattern: "(?=[\\s\\S]*#[^\\n]*1024)(?=[\\s\\S]*#[^\\n]*1734)(?=[\\s\\S]*#[^\\n]*32)" },
      { kind: "GrepAssert", file: "modules/nixos/kanidm.nix", pattern: "ea89e38cb2488c003cec06ae123640be0c97eb5d/docs/images/omnigent-logo\\.svg" },
      { kind: "GrepAssert", file: "modules/nixos/kanidm.nix", pattern: "sha256-ugW4JnZsXeq4nd/MTxbQnLg/7b7lVLUmceNcicj52fs=" },
    ],
  },
  {
    id: 7, title: "darwin-host", implModel: IMPL, reviewReads: [plan, darwinResearch, "modules/nixos/omnigent-host.nix", "modules/home/users/aliases.nix"],
    allowedPaths: ["modules/darwin/omnigent-host.nix", "modules/clan/services/omnigent/flake-module.nix", "modules/clan/inventory/services/omnigent.nix", "modules/clan/services/omnigent/README.md", plan],
    objective: `Attach stibnite as the second host of the existing magnetite server. Authoritative specification: ${darwinResearch}, sections (a), (b), (c), with pinned source evidence in sections 1–7. Explicit non-goals: NO magnetite server-side change and NO package change; the existing Darwin package evaluates without Linux derivations. Do not alter shared HM ACP definitions, credentials, host_id, aliases, machine inventory or flake inputs.

Add flake.modules.darwin.omnigent-host in modules/darwin/omnigent-host.nix, mirroring the NixOS typed enable/package/serverUrl/user/hostName/extraPackages/environment options, with user default config.system.primaryUser. Select the user once; derive home from config.users.users.\${cfg.user}.home and every HM attribute, HOME, WorkingDirectory, PI_CODING_AGENT_DIR and log path from that binding. No literal stibnite account name in the new module or clan service. Preserve the cameron/crs58 alias split at the existing machine boundary, not in the bridge. Assert the selected account/HM user exists and the primary user is usable.

Implement roles.host.perInstance.darwinModule: capture the Darwin deferred modules, import omnigent-host, enable it, derive the existing server URL, set hostName = machine.name, resolve dotted extraPackages against Darwin pkgs and forward settings.environment. Add only stibnite host membership and the same home-independent environment pair; retain the shared inventory extraModule deriving PI_CODING_AGENT_DIR from the configured user's home.

Emit home-manager.users.\${cfg.user}.programs.omnigent with the same package and launchd.agents.omnigent-host, domain=user, waitForNixStore=true. Foreground argv is [ (lib.getExe cfg.package) "host" "--server" cfg.serverUrl ]; never host enable, --background, upstream service_entry or a second plist owner. Use RunAtLoad=true, KeepAlive.SuccessfulExit=false, ThrottleInterval=5, ProcessType=Standard (never Background). A sleeping host simply shows offline and reconnects on wake; this is expected, not a fault. No network-state load restriction, fatal offline condition or disabled restart. Foreground CLI differs from service_entry on permanent failures: expired ~30-day login can cause throttled restart loops. Keep these diagnosable through the declared log and restart policy and document the remedy omnigent login again.

Set EnvironmentVariables = cfg.environment // { HOME = userHome; PATH = explicitPath; }; carry PI_ACP_PI_COMMAND=atomic, PI_CODING_AGENT_DIR=<selected-home>/.atomic/agent and OMNIGENT_RUNNER_ENV_PASSTHROUGH=PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR. Explicit store PATH must contain repository claude-code/atomic, llm-agents codex/pi/omp, pkgs bun/nodejs_22/python3/tmux/git/uv unconditionally before extras, then /usr/bin:/bin:/usr/sbin:/sbin; no bubblewrap or profile/shell/launchctl-setenv dependency. Both log destinations are <selected-home>/.omnigent/logs/host/service.log. Create the private directory in home.activation.omnigentHostLogDirectory after writeBoundary and omnigentMergeConfig and before setupLaunchAgents.

Replace the clan README Darwin stub, correct its NixOS-only extraModules wording, and document HM operation, lifecycle/logs and platform gaps. Amend the deployment plan with the acceptance items and exact gates. Do not invent NoNewPrivileges or cgroup-equivalent memory limits on launchd. Preserve the same two shared ACP rows and omp's exactly empty env_passthrough to keep Atomic state out of omp.

Record research (c)'s ordered human procedure: inspect/retire competing host lifecycle deliberately; login locally as the selected user with the same Omnigent identity as magnetite; preserve/verify vendor and Atomic/omp credentials; only after controller gates/review activate the pinned stibnite configuration via the existing workstation process (this workflow's deploy phase still targets magnetite); inspect user-domain launchctl, logs and distinct persistent host_id without publishing tokens. Never copy magnetite state. Test native and ACP turns, Files after Resume, approvals, independent state roots, sleep/network and logout/reboot recovery. Runtime success requires human attestation, not these evaluations.`,
    acceptance: ["stibnite is the second host; magnetite remains the only server.", "Selected-user home derivation, user-domain foreground launchd lifecycle, ordered private logs and unconditional hermetic PATH satisfy the gates.", "Both shared ACP rows match magnetite exactly; omp receives no Atomic state variables.", "Magnetite runner and single-worker server regressions pass unchanged.", ...darwinAmendments.map(([item]) => item), "The controller builds the Darwin package check and stibnite closure locally; runtime and laptop recovery require the human checklist."],
    gates: [
      eq(darwinInventoryExpr, ["magnetite", "stibnite"]),
      eq(`builtins.attrNames (${flake}).clan.inventory.instances.omnigent.roles.server.machines`, ["magnetite"]),
      darwinEq(`[ c.services.omnigent-host.enable c.services.omnigent-host.serverUrl c.services.omnigent-host.hostName (u == c.system.primaryUser) ]`, [true, `https://${domain}`, "stibnite", true]),
      eq(darwinAgentExistsExpr, true),
      ...["modules/darwin/omnigent-host.nix", "modules/clan/services/omnigent/flake-module.nix"].map((file) => ({ kind: "GrepAssert" as const, file, pattern: "^(?![\\s\\S]*crs58)[\\s\\S]*$" })),
      darwinEq(`a.EnvironmentVariables.PI_CODING_AGENT_DIR == home + "/.atomic/agent" && h.home.homeDirectory == home && a.EnvironmentVariables.HOME == home`, true),
      eq(darwinHomeFixtureExpr, true),
      darwinEq(`[ a.RunAtLoad a.KeepAlive.SuccessfulExit a.ThrottleInterval a.ProcessType ]`, [true, false, 5, "Standard"]),
      darwinEq(`builtins.filter (k: a.KeepAlive.\${k} != null) (builtins.attrNames a.KeepAlive) == [ "SuccessfulExit" ] && (a.Disabled or null) != true && (a.LimitLoadToHosts or null) == null && (a.LimitLoadFromHosts or null) == null`, true),
      eq(darwinPathExpr, true),
      darwinEq(`builtins.tail a.ProgramArguments`, ["host", "--server", `https://${domain}`]),
      darwinEq(`a.WorkingDirectory == home && a.StandardOutPath == home + "/.omnigent/logs/host/service.log" && a.StandardErrorPath == a.StandardOutPath`, true),
      darwinEq(`[ a.EnvironmentVariables.PI_ACP_PI_COMMAND a.EnvironmentVariables.OMNIGENT_RUNNER_ENV_PASSTHROUGH ]`, ["atomic", "PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR"]),
      darwinEq(`let x = h.home.activation.omnigentHostLogDirectory; in builtins.elem "setupLaunchAgents" x.before && builtins.all (n: builtins.elem n x.after) [ "writeBoundary" "omnigentMergeConfig" ]`, true),
      darwinEq(`h.programs.omnigent.settings.host.name`, "stibnite"),
      darwinEq(`h.programs.omnigent.settings.acp.agents`, s6Agents),
      darwinEq(`h.programs.omnigent.settings.acp == (${runnerSettingsExpr}).acp && (builtins.elemAt h.programs.omnigent.settings.acp.agents 1).env_passthrough == []`, true),
      configEq(real, `[ c.services.omnigent-host.user c.systemd.services.omnigent-host.serviceConfig.User ]`, ["cameron", "cameron"]),
      configEq(real, `builtins.removeAttrs c.systemd.services.omnigent-host.environment [ "PATH" ]`, { HOME: "/home/cameron", PI_ACP_PI_COMMAND: "atomic", PI_CODING_AGENT_DIR: "/home/cameron/.atomic/agent", OMNIGENT_RUNNER_ENV_PASSTHROUGH: "PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR" }),
      eq(`let f = ${flake}; d = f.nixosConfigurations.magnetite; p = d.pkgs; h = f.inputs.llm-agents.packages.x86_64-linux; r = f.packages.x86_64-linux; in builtins.all (x: builtins.elem x d.config.systemd.services.omnigent-host.path) [ r.claude-code r.atomic h.codex h.pi h.omp p.bun p.nodejs_22 p.python3 p.tmux p.git p.uv p.bubblewrap ]`, true),
      configEq(real, `c.systemd.services.omnigent.environment.WEB_CONCURRENCY`, "1"),
      { kind: "Command", argv: ["nix", "eval", "--impure", "--json", "--expr", secondServerExpr], expectExitZero: false, failureDiagnostic: "Omnigent requires exactly one server" },
      ...darwinAmendments.map(([, pattern]) => ({ kind: "GrepAssert" as const, file: plan, pattern })),
      { kind: "Command", argv: ["nix", "build", "--no-link", "__OMNIGENT_SOURCE__#checks.aarch64-darwin.package-omnigent"], expectExitZero: true },
      { kind: "Command", argv: ["python3", "__OMNIGENT_PRIMARY__/.atomic/workflows/omnigent/darwin-artifacts.py", "__OMNIGENT_SANDBOX__", "__OMNIGENT_SOURCE__#checks.aarch64-darwin.darwin-stibnite"], expectExitZero: true },
    ],
  },
  {
    id: 8, title: "pyrite-host", implModel: IMPL, reviewReads: [plan, pyriteResearch, "modules/nixos/omnigent-host.nix", "modules/home/users/aliases.nix"],
    allowedPaths: ["modules/clan/inventory/services/omnigent.nix", "modules/clan/services/omnigent/flake-module.nix", "modules/nixos/omnigent-host.nix", "modules/clan/services/omnigent/README.md", plan],
    objective: `Attach pyrite as the THIRD host, reusing S3's existing NixOS runner module, not a new platform module. Research and gate evidence: ${pyriteResearch}. Pyrite is the existing x86_64-linux bare-metal laptop, deploy.targetHost=root@pyrite.zt. No machine-file edits, new server, package changes, credentials, host_id, aliases, or flake input changes. The deploy phase still activates ONLY magnetite; pyrite activation is a later human-controlled pinned clan update, not an effect of authoring this slice.

roles.host currently hardcodes user="cameron" in its NixOS branch. Introduce a JSON-serializable per-machine user setting (null by default, meaning use the platform default); forward a non-null setting on both platforms, leaving Darwin's primary-user default intact. Replace the NixOS module's literal default with the unique existing normal wheel user that has a Home Manager configuration; require an explicit user if that selection is ambiguous rather than choosing an arbitrary account. Both magnetite and pyrite select cameron today, while stibnite selects crs58. The aliases map reuses crs58's HM content under cameron, not the Unix account name. Derive every unit/HOME/PI path from the selected account. No account literals in the clan role or NixOS module, even though both Linux machines share the same name; the per-machine override fixture must change pyrite without changing either other host.

perMachine.nixosModule.imports already supplies omnigent and omnigent-host to any role member; perInstance.nixosModule enables the host, derives serverUrl from the sole server's domain and hostName from machine.name. Add only pyrite's host inventory binding with the existing two home-independent PI variables, keeping the shared selected-home PI_CODING_AGENT_DIR extraModule. No server-side change is needed. Its cameron already imports the same ai and languages aggregates as magnetite: Atomic, Claude Code, Codex, Pi, omp and the Bun runtime. A systemd system unit never sees the user profile: preserve the full explicit required store package PATH (${pyritePackages}), unconditionally with extraPackages = [ ], plus existing foreground --server, environment carriers and bubblewrap-compatible hardening omissions.

The laptop is an intermittent remote worker: offline on suspend/hibernate, automatic reconnection on resume/network return, never a manual restart for ordinary network loss. Preserve Restart=on-failure, RestartSec=5, multi-user.target enablement and After/Wants=network-online.target, without sleep conflicts or network BindsTo/Requires. network-online.target orders initial startup only; it does not trigger a resume reconnect. The foreground host's own remote reconnection loop handles outages while the process survives suspend; systemd retries nonzero exits. Default start limiting (10 seconds, burst 5) is not exhausted by five-second restarts. Authentication expiry remains a separate human login-renewal requirement, not an offline failure. Do not add sleep hooks or inhibit suspend. The separate in-flight pyrite-never-sleep OpenSpec change owns machine sleep policy: do not edit, depend on, or assume it; this runner must be correct whether or not pyrite ever sleeps. A genuine conflict requires a replan, not a silent policy change.

The shared HM mechanism already derives host.name from osConfig and renders the same flake.lib.omnigentACP for every machine. Do not duplicate or alter it: pyrite must get host.name=pyrite and exactly ${JSON.stringify(s6Agents)}, with omp env_passthrough exactly [ ] to prevent PI_CODING_AGENT_DIR from sharing Atomic state on this third machine. Inspect the actual HM activation's store YAML once and rehearse its merge preserving runtime-minted host.host_id; never copy another host's state. The controller builds checks.x86_64-linux.nixos-pyrite once via NixBuildRemote on magnetite, not pyrite; no second machine build for artifact inspection.

Amend D1 and the deferred-work roster in deployment-plan.md in place so pyrite rollout is no longer deferred, and add the four acceptance amendments below. Update the clan README's two-host/deferred-pyrite wording and describe per-machine user selection and intermittent NixOS lifecycle. Implementation does not imply activation or live acceptance. Before later human activation as the selected user, preserve/verify Omnigent login under the same identity as magnetite and local vendor/Atomic/omp credentials, avoid competing host lifecycles, and verify a distinct persistent host_id without publishing tokens. Human checklist alone confirms UI online state, a completed pyrite turn, and automatic suspend/resume return.`,
    acceptance: ["Exactly three hosts in attrNames order magnetite, pyrite, stibnite; magnetite remains the sole server.", "Pyrite uses its configured HM admin account by default and honors per-machine user override; no account literal in the role or Linux module.", "Pyrite's foreground unit, environment, hermetic PATH with empty extras, and intermittent lifecycle satisfy the evaluated gates.", "Rendered pyrite settings and merge retain the shared two ACP rows, empty omp passthrough and runtime host_id.", "Magnetite and stibnite host settings and single-worker server remain unchanged.", ...pyriteAmendments.map(([item]) => item), "The remote pyrite closure check builds; live acceptance remains human-attested."],
    gates: [
      eq(pyriteInventoryExpr, ["magnetite", "pyrite", "stibnite"]),
      eq(`builtins.attrNames (${flake}).clan.inventory.instances.omnigent.roles.server.machines`, ["magnetite"]),
      eq(pyriteUnitExpr, true),
      pyriteEq(`[ c.services.omnigent-host.serverUrl c.services.omnigent-host.hostName ]`, [`https://${domain}`, "pyrite"]),
      pyriteEq(`let admins = builtins.attrNames (lib.filterAttrs (name: _: c.users.users.\${name}.isNormalUser && builtins.elem "wheel" c.users.users.\${name}.extraGroups) c.home-manager.users); in admins == [ u ] && h.home.username == u && h.home.homeDirectory == home`, true),
      eq(pyriteUserFixtureExpr, true),
      ...["modules/clan/services/omnigent/flake-module.nix", "modules/nixos/omnigent-host.nix"].map((file) => ({ kind: "GrepAssert" as const, file, pattern: "^(?![\\s\\S]*(?:cameron|crs58))[\\s\\S]*$" })),
      pyriteEq(`builtins.all (v: builtins.elem (builtins.toJSON v) s.serviceConfig.Environment) [ "PI_ACP_PI_COMMAND=atomic" "PI_CODING_AGENT_DIR=\${home}/.atomic/agent" "OMNIGENT_RUNNER_ENV_PASSTHROUGH=PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR" ] && s.environment.HOME == home && s.serviceConfig.WorkingDirectory == home`, true),
      pyriteEq(`lib.hasInfix "--server https://${domain}" s.serviceConfig.ExecStart && !(lib.hasInfix "--background" s.serviceConfig.ExecStart)`, true),
      pyriteEq(`builtins.all (k: !(builtins.hasAttr k s.serviceConfig)) ${JSON.stringify(hardeningAbsent).replaceAll(",", " ")} && s.serviceConfig.NoNewPrivileges`, true),
      eq(pyritePathExpr, true),
      pyriteEq(pyriteLifecycle, true),
      eq(`(${pyriteSettingsExpr}).host.name`, "pyrite"),
      eq(`(${pyriteSettingsExpr}).acp.agents`, s6Agents),
      eq(`(${pyriteSettingsExpr}).acp == (${runnerSettingsExpr}).acp && (builtins.elemAt (${pyriteSettingsExpr}).acp.agents 1).env_passthrough == []`, true),
      { kind: "Command", argv: ["bash", "-c", pyriteConfigProbe], expectExitZero: true, expectStdoutIncludes: ["pyrite-rendered-settings-and-merge-ok"] },
      configEq(real, `[ c.services.omnigent-host.enable c.services.omnigent-host.user c.services.omnigent-host.hostName c.services.omnigent-host.serverUrl c.systemd.services.omnigent.serviceConfig.User c.systemd.services.omnigent.environment.WEB_CONCURRENCY ]`, [true, "cameron", "magnetite", `https://${domain}`, "omnigent", "1"]),
      eq(`(${runnerSettingsExpr}).acp.agents`, s6Agents),
      eq(`(${runnerSettingsExpr}).host.name`, "magnetite"),
      darwinEq(`[ c.services.omnigent-host.enable u c.services.omnigent-host.hostName c.services.omnigent-host.serverUrl h.programs.omnigent.settings.host.name ]`, [true, "crs58", "stibnite", `https://${domain}`, "stibnite"]),
      darwinEq(`h.programs.omnigent.settings.acp.agents`, s6Agents),
      eq(darwinPathExpr, true),
      configEq(real, `builtins.removeAttrs c.systemd.services.omnigent-host.environment [ "PATH" ]`, { HOME: "/home/cameron", PI_ACP_PI_COMMAND: "atomic", PI_CODING_AGENT_DIR: "/home/cameron/.atomic/agent", OMNIGENT_RUNNER_ENV_PASSTHROUGH: "PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR" }),
      eq(pyritePathExpr.replace("d = g.nixosConfigurations.pyrite;", "d = g.nixosConfigurations.magnetite;"), true),
      darwinEq(`[ a.RunAtLoad a.KeepAlive.SuccessfulExit a.ThrottleInterval a.ProcessType a.EnvironmentVariables.PI_ACP_PI_COMMAND a.EnvironmentVariables.OMNIGENT_RUNNER_ENV_PASSTHROUGH (a.EnvironmentVariables.PI_CODING_AGENT_DIR == home + "/.atomic/agent") ]`, [true, false, 5, "Standard", "atomic", "PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR", true]),
      ...pyriteAmendments.map(([, pattern]) => ({ kind: "GrepAssert" as const, file: plan, pattern })),
      { kind: "GrepAssert", file: plan, pattern: "^(?![\\s\\S]*pyrite[^\\n]*(?:rollout remains deferred|runner rollout;))[\\s\\S]*$" },
      { kind: "NixBuildRemote", installable: "__OMNIGENT_SOURCE__#checks.x86_64-linux.nixos-pyrite" },
    ],
  },
] as const satisfies readonly Slice[];

export const slices = [...precedingSlices, ...additionalSlices(plan, domain, s6Agents, [
  eq(darwinHomeFixtureExpr, true),
  ...precedingSlices[8].gates.filter((gate) => gate.kind !== "GrepAssert" && gate.kind !== "NixBuildRemote" && !(gate.kind === "NixEval" && gate.target.kind === "Expr" && gate.target.expr === darwinPathExpr)),
  ...precedingSlices[3].gates.filter((gate) => gate.kind === "Command" && "failureDiagnostic" in gate && gate.failureDiagnostic === "Omnigent requires exactly one server"),
])] as const satisfies readonly Slice[];

type GateReference = { slice: number; index: number; identity: string; gate: Gate };
type GateSupersession = { superseded: GateReference; superseding: GateReference; property: string; falseAtJoin: string };
const gateReference = (slice: number, index: number, identity: string): GateReference => ({ slice, index, identity, gate: slices[slice]!.gates[index]! });
export const joinGateSupersessions: readonly GateSupersession[] = [
  {
    superseded: gateReference(1, 0, "Linux package version equals 0.12.0"),
    superseding: gateReference(9, 0, "Linux package version equals 0.13.0"),
    property: "Exact version of packages.x86_64-linux.omnigent; the later equality is equally strict.",
    falseAtJoin: "S9 upgrades that same package to 0.13.0, so its version cannot equal 0.12.0.",
  },
  ...([
    [0, "Server enabled"],
    [1, "Server domain equals omni.scientistexperience.net"],
    [2, "Cookie-secret generator equals omnigent-cookie-secret-omnigent"],
    [3, "Omnigent, Matrix and Buildbot databases retained"],
    [4, "PostgreSQL version has prefix 16."],
    [5, "Server ordered after postgresql.target"],
    [6, "Server uses the psycopg Unix-socket database URI"],
    [7, "PostgreSQL peer authentication retained"],
    [8, "nginx proxy websockets enabled"],
    [9, "nginx one-day read/send timeouts and no buffering"],
    [12, "Both Omnigent secret generators exist"],
    [13, "WEB_CONCURRENCY equals one"],
    [14, "Server requires postgresql.target"],
    [15, "Server MemoryHigh/MemoryMax equal 2G/3G"],
    [16, "Neither OIDC allowed-domain nor email-verification bypass variable exists"],
    [17, "Rendered admin list equals the primary email and newline"],
    [18, "Server binds loopback"],
    [19, "nginx ACME and forced SSL enabled"],
    [20, "nginx proxyPass uses HTTP loopback"],
  ] as const).map(([index, property]): GateSupersession => ({
    superseded: gateReference(2, index, `Synthetic server fixture: ${property}`),
    superseding: gateReference(3, index, `Real inventory configuration: ${property}`),
    property: `${property}; identical serverGates predicate and expectation, now over inventory-bound magnetite rather than an explicitly enabled fixture.`,
    falseAtJoin: "S3 binds the module through inventory; S2's extendModules fixture imports it again, so the old gate fails with an already-declared option rather than yielding its expected value. The service property itself is not false; the obsolete fixture carrier is invalid at the join.",
  })),
  {
    superseded: gateReference(2, 25, "Synthetic server fixture toplevel evaluates to a store derivation path"),
    superseding: gateReference(3, 37, "Real inventory magnetite toplevel derivation evaluates and builds remotely"),
    property: "Magnetite system.build.toplevel has an evaluable store drvPath; modules/checks/machines.nix aliases checks.nixos-magnetite directly to that toplevel, and NixBuildRemote evaluates its drvPath before copying the derivation and building it, stronger than path evaluation alone.",
    falseAtJoin: "S3 binds the module through inventory; S2's explicit re-import makes the fixture toplevel fail with an already-declared option instead of returning a .drv path. The replacement retains and builds the real inventory toplevel.",
  },
  {
    superseded: gateReference(3, 34, "Host roster equals magnetite alone"),
    superseding: gateReference(8, 0, "Host roster equals magnetite, pyrite, stibnite"),
    property: "Exact host-role inventory membership, including absence of extra hosts; both compare the same attrNames expression.",
    falseAtJoin: "S7 and S8 add stibnite and pyrite to the host role, making the one-host equality false.",
  },
  {
    superseded: gateReference(4, 0, "Rendered server config has exactly one Atomic ACP row"),
    superseding: gateReference(6, 2, "Rendered server config has exactly Atomic and Oh My Pi ACP rows"),
    property: "Server OMNIGENT_CONFIG_HOME/config.yaml ACP roster with exact names, commands, flags and passthrough; S6 compares the complete JSON array, stronger than S4's field markers.",
    falseAtJoin: "S6 appends Oh My Pi while preserving Atomic, so the rendered server agent count is two, not one.",
  },
  {
    superseded: gateReference(4, 1, "Runner ACP count and declared host.name equal one and magnetite"),
    superseding: gateReference(10, 3, "Magnetite runtime regression including declared host.name and exact Atomic/Oh My Pi array"),
    property: "Declared magnetite runner host.name and exact ACP roster; S10 retains the name equality and strengthens the count check to complete two-agent array equality with empty extras.",
    falseAtJoin: "S6 appends Oh My Pi, so the runner agent count is two, not one; the declared host.name remains magnetite.",
  },
  {
    superseded: gateReference(4, 2, "Magnetite cameron home contains omnigent-0.12.0"),
    superseding: gateReference(9, 22, "Both Linux and standalone Darwin homes contain omnigent-0.13.0"),
    property: "Installed package name membership in magnetite's cameron Home Manager home.packages; S9 uses the same any/name equality and additionally checks the Darwin home.",
    falseAtJoin: "S9 upgrades the installed package to omnigent-0.13.0; the old omnigent-0.12.0 name is absent from this home.",
  },
  {
    superseded: gateReference(4, 3, "Standalone crs58@aarch64-darwin home contains omnigent-0.12.0"),
    superseding: gateReference(9, 22, "Both Linux and standalone Darwin homes contain omnigent-0.13.0"),
    property: "Installed package name membership in homeConfigurations.crs58@aarch64-darwin.config.home.packages; S9 uses the same any/name equality and additionally checks the Linux home.",
    falseAtJoin: "S9 upgrades the installed package to omnigent-0.13.0; the old omnigent-0.12.0 name is absent from this home.",
  },
  {
    superseded: gateReference(4, 4, "Runner merge preserves host_id/name with exactly one Atomic ACP row"),
    superseding: gateReference(6, 3, "Runner merge preserves host_id/name with exactly Atomic and Oh My Pi ACP rows"),
    property: "The same merge script and fixture preserve host_id=deadbeef and host_name=magnetite; S6 replaces count/first-row markers with complete two-agent array equality.",
    falseAtJoin: "S6 appends Oh My Pi, so the merged agent count is two, not one, while both preserved host markers remain unchanged.",
  },
  {
    superseded: gateReference(4, 5, "Isolated Linux console interpreter imports omnigent.claude_native_hook"),
    superseding: gateReference(9, 4, "Isolated Linux console interpreter imports and invokes omnigent.harnesses.claude_native.hook; old module absent"),
    property: "Console-script interpreter resolves the supported Claude hook without inherited environment; S9 retains env -i, adds -I and a subprocess hook invocation, and verifies old-module absence and wheel metadata.",
    falseAtJoin: "0.13.0 removes omnigent.claude_native_hook and relocates it to omnigent.harnesses.claude_native.hook, so the old import raises ModuleNotFoundError.",
  },
  {
    superseded: gateReference(7, 0, "Host roster equals magnetite and stibnite"),
    superseding: gateReference(8, 0, "Host roster equals magnetite, pyrite, stibnite"),
    property: "Exact host-role inventory membership, including absence of extra hosts; both compare the same attrNames expression.",
    falseAtJoin: "S8 adds pyrite to the host role, making the two-host equality false.",
  },
  ...([[7, 10], [8, 22]] as const).map(([slice, index]): GateSupersession => ({
    superseded: gateReference(slice, index, "Darwin empty-extras PATH equals the eleven original harness/runtime bins plus system suffix; executable equals configured package"),
    superseding: gateReference(10, 8, "Darwin empty-extras PATH equals the eleven original bins plus bash/which/direnv/nix and system suffix; executable equals configured package"),
    property: "Exact ordered stibnite launchd EnvironmentVariables.PATH with empty extraPackages, including exclusion of unreviewed entries and the Darwin system suffix, plus ProgramArguments[0] equality to the configured package executable. S10:8 retains every conjunct and adds the four approved runtime bins to the exact equality.",
    falseAtJoin: "S10 inserts bash, which, direnv and nix before the unchanged system suffix, so the old eleven-bin PATH equality is false. Witness at join 0dc755bc8830f172a40cce5dc8c55c31396b10a2 (also chain tip 9aaba60b9611e03881344d96c4f0ff756333f3f1): old NixEval returns false with exit 0; empty extras and executable equality remain true. Strengthened S10:8 returns true with exit 0 at that join (logs/omnigent-s7-witness-7d6ad349.log).",
  })),
];

export const joinGateManifest = slices.flatMap((slice) => slice.gates.map((gate, index) => ({
  slice: slice.id, title: slice.title, index, gate,
  supersession: joinGateSupersessions.find(({ superseded }) => superseded.slice === slice.id && superseded.index === index) ?? null,
})));
export const joinSlices: readonly Slice[] = slices.map((slice) => ({
  ...slice, gates: joinGateManifest.filter((entry) => entry.slice === slice.id && !entry.supersession).map(({ gate }) => gate),
}));

export function validateSlices(): void {
  if (!Value.Check(Type.Array(Slice), slices)) throw new Blocked("Invalid slice contract");
  for (const [id, slice] of slices.entries()) {
    if (slice.id !== id || slice.allowedPaths.some((p) => !relativePath(p))) throw new Blocked("Invalid slice identity or path");
    validateModelPolicy(slice.implModel);
    for (const gate of slice.gates) if (gate.kind === "Command" && !gate.expectExitZero && !("failureDiagnostic" in gate && gate.failureDiagnostic)) throw new Blocked("Negative gate requires its exact assertion diagnostic");
  }
}
