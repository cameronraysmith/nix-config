# How Omnix `om ci` Works: Deep Dive

**Date:** 2025-10-03
**Purpose:** Understand exactly what nix commands `om ci` executes and how it determines what to build

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Core Mechanism: devour-flake](#the-core-mechanism-devour-flake)
3. [Step-by-Step Execution](#step-by-step-execution)
4. [Equivalent Nix Commands](#equivalent-nix-commands)
5. [What Makes Omnix Different](#what-makes-omnix-different)
6. [How Output Discovery Works](#how-output-discovery-works)
7. [Beyond Build and Eval](#beyond-build-and-eval)

---

## Executive Summary

**What `om ci run` actually does:**

```bash
# Step 1: Check flake.lock is up-to-date (if no override-inputs)
nix flake lock --no-update-lock-file <your-flake>

# Step 2: Build all outputs via devour-flake
nix build github:srid/devour-flake#json \
  -L --print-out-paths --no-link \
  --override-input flake <your-flake> \
  --override-input systems <systems-list>

# Step 3 (optional): Run custom steps
# nix run .#<app>
# nix develop .#<devShell> -c <command>

# Step 4 (optional, disabled by default): Run flake check
# nix flake check <your-flake>
```

**Key Innovation:** Instead of running `nix build .#a .#b .#c ...` separately for each output, Omnix uses devour-flake to evaluate your flake **once** and build everything in a single `nix build` invocation.

---

## The Core Mechanism: devour-flake

Omnix delegates the heavy lifting to [devour-flake](https://github.com/srid/devour-flake), a specialized flake that discovers and builds all outputs from another flake.

### What is devour-flake?

devour-flake is a "meta-flake" that:
1. Takes your flake as an input
2. Evaluates it to discover all outputs
3. Creates a "consumer" flake that depends on everything
4. Returns a JSON listing all built store paths

### Why devour-flake?

**Problem:** Running `nix build .#a .#b .#c ...` evaluates the flake multiple times:
```bash
# Inefficient: each build evaluates flake separately
nix build .#packages.x86_64-linux.foo
nix build .#packages.x86_64-linux.bar
nix build .#nixosConfigurations.myhost.config.system.build.toplevel
# Result: flake evaluated 3 times
```

**Solution:** devour-flake evaluates once:
```bash
# Efficient: single evaluation, single build
nix build github:srid/devour-flake#json \
  --override-input flake .
# Result: flake evaluated 1 time, all outputs built
```

This is especially impactful for flakes with expensive evaluations (e.g., large nixpkgs imports, complex overlays).

### devour-flake Source Code

Located at `/tmp/devour-flake/flake.nix`, the key logic is:

```nix
{
  inputs = {
    flake = { };  # Your flake as input
    systems.url = "github:srid/empty";  # Systems to build for
  };

  outputs = { ... }: {
    perSystem = { ... }: {
      packages = {
        # Schema defining how to extract buildable derivations
        flakeSchema = {
          perSystem = {
            # For per-system outputs: packages, checks, devShells, apps
            getDrv = {
              packages = _: x: [ x ];
              checks = _: x: [ x ];
              devShells = _: x: [ x ];
              apps = _: app: [ app.program ];
              legacyPackages = k: v:
                if k == "homeConfigurations"
                then lib.mapAttrsToList (_: cfg: cfg.activationPackage) v
                else [ ];
            };
          };
          flake = {
            # For flake-level outputs: nixos/darwin configurations
            getDrv = {
              nixosConfigurations = _: cfg:
                lib.optional (shouldBuildForSystem cfg)
                  cfg.config.system.build.toplevel;
              darwinConfigurations = _: cfg:
                lib.optional (shouldBuildForSystem cfg)
                  cfg.config.system.build.toplevel;
            };
          };
        };

        # Collect all paths and output as JSON
        json = pkgs.writeText "devour-output.json" (builtins.toJSON {
          outPaths = [ /* all discovered paths */ ];
          byName = { /* indexed by pname/name */ };
        });
      };
    };
  };
}
```

**Key Insight:** This is pure Nix evaluation code. It uses `builtins.attrNames`, `lib.mapAttrsToList`, and `lib.attrByPath` to traverse your flake's attribute set and extract derivations.

---

## Step-by-Step Execution

When you run `om ci run --systems "x86_64-linux"`, here's the exact sequence:

### Step 1: Lockfile Check (Enabled by Default)

**Source:** `omnix/crates/omnix-ci/src/step/lockfile.rs:10-19`

```rust
pub async fn nix_flake_lock_check(nixcmd: &NixCmd, url: &FlakeUrl) -> Result<()> {
    flake::command::lock(
        nixcmd,
        &FlakeOptions::default(),
        &["--no-update-lock-file"],
        url,
    )
    .await?;
    Ok(())
}
```

**Nix Command:**
```bash
nix flake lock --no-update-lock-file <your-flake>
```

**Purpose:** Verify that `flake.lock` is synchronized with `flake.nix`. Fails if lock file is outdated.

**Skip Condition:** If `override_inputs` is specified for the subflake, this step is skipped.

**Configuration:** Controlled by `flake.om.ci.default.ROOT.steps.lockfile.enable` (default: true)

### Step 2: Build Step (Enabled by Default)

**Source:** `omnix/crates/omnix-ci/src/step/build.rs:42-83`

```rust
pub async fn run(
    &self,
    nixcmd: &NixCmd,
    run_cmd: &RunCommand,
    url: &FlakeUrl,
    subflake: &SubflakeConfig,
) -> anyhow::Result<BuildStepResult> {
    // Run devour-flake to do the actual build
    tracing::info!("⚒️  Building subflake: {}", subflake.dir);

    let output = DevourFlake::call(
        nixcmd,
        self.impure.unwrap_or(false),
        None,  // pwd
        None,  // out_link (defaults to --no-link)
        nix_args,  // --override-input for subflake.override_inputs
        DevourFlakeInput {
            flake: url.sub_flake_url(subflake.dir.clone()),
            systems: run_cmd.systems.clone().map(|l| l.0),
        },
    )
    .await?
    .1;

    // Optionally fetch all dependencies
    if run_cmd.steps_args.build_step_args.include_all_dependencies {
        let all_paths = NixStoreCmd
            .fetch_all_deps(&output.out_paths)
            .await?;
        res.all_deps = Some(all_paths);
    }

    Ok(res)
}
```

**Core Call:** `DevourFlake::call` in `omnix/crates/nix_rs/src/flake/functions/core.rs:49-105`

```rust
async fn call(
    nixcmd: &NixCmd,
    impure: bool,
    pwd: Option<&Path>,
    m_out_link: Option<&Path>,
    extra_args: Vec<String>,
    input: Self::Input,
) -> Result<(PathBuf, Self::Output)> {
    // Build the nix build command
    let mut cmd = nixcmd.command(&["build"]);
    cmd.args([Self::flake(), "-L", "--print-out-paths"]);

    if impure {
        cmd.arg("--impure");
    }

    cmd.arg("--no-link");  // or --out-link if specified

    // Convert input struct to --override-input args
    let input_vec = to_vec(&input);  // DevourFlakeInput -> Vec<(key, value)>
    for (k, v) in input_vec {
        cmd.arg("--override-input");
        cmd.arg(k);
        cmd.arg(v);
    }

    cmd.args(extra_args);  // Additional --override-input from subflake config

    // Execute nix build
    let output = cmd.stdout(Stdio::piped()).spawn()?.wait_with_output().await?;

    if output.status.success() {
        let store_path = PathBuf::from(output.stdout.trim());
        let v: Self::Output = serde_json::from_reader(std::fs::File::open(&store_path)?)?;
        Ok((store_path, v))
    }
}
```

**DevourFlake Input Struct:**
```rust
pub struct DevourFlakeInput {
    pub flake: FlakeUrl,    // Your flake URL
    pub systems: Option<FlakeUrl>,  // Systems list flake URL
}
```

These become:
```bash
--override-input flake <your-flake>
--override-input systems <systems-list>
```

**Full Nix Command:**
```bash
nix build /nix/store/...-devour-flake-source#json \
  -L \
  --print-out-paths \
  --no-link \
  --override-input flake . \
  --override-input systems /nix/store/...-x86_64-linux-source
```

**What This Returns:**

A JSON file at `/nix/store/...-devour-output.json`:
```json
{
  "outPaths": [
    "/nix/store/7j8n0bndmb9c6dbw6a45z8hq8yibvsdf-home-manager-generation",
    "/nix/store/9p5qdacpbf3aw7srqshwxzzaipvzsskb-home-manager-generation",
    "/nix/store/s3b622szmmqqb8im37ki52qzdjmczj2k-home-manager-generation",
    "/nix/store/06dm0kqnxj53h0lv53sp3vlmnnaslq6x-nixos-system-blackphos-nixos-25.11.20250928.e9f00bd",
    "/nix/store/0md17n7ybbf1n62lay43p7nfhvr0j6yr-nixos-system-stibnite-nixos-25.11.20250928.e9f00bd"
  ],
  "byName": {
    "nixos-system-blackphos-nixos-25.11": "/nix/store/06dm0kqnxj53h0lv53sp3vlmnnaslq6x-nixos-system-blackphos-nixos-25.11.20250928.e9f00bd",
    "nixos-system-stibnite-nixos-25.11": "/nix/store/0md17n7ybbf1n62lay43p7nfhvr0j6yr-nixos-system-stibnite-nixos-25.11.20250928.e9f00bd"
  }
}
```

**Optional Dependency Resolution:**

If `--include-all-dependencies` is passed, Omnix runs:
```bash
nix-store --query --requisites <each-out-path>
```

This collects all build and runtime dependencies for pushing to caches.

**Configuration:** Controlled by `flake.om.ci.default.ROOT.steps.build.enable` (default: true)

### Step 3: Custom Steps (User-Defined)

**Source:** `omnix/crates/omnix-ci/src/step/custom.rs:50-103`

Custom steps can be:

#### Type A: Flake App

```nix
# flake.nix
{
  om.ci.default.ROOT.steps.custom = {
    my-custom-check = {
      type = "app";
      name = "check-closure-size";  # runs .#apps.x86_64-linux.check-closure-size
      args = [ "--max-size" "1GB" ];
    };
  };
}
```

**Nix Command:**
```bash
nix run .#check-closure-size -- --max-size 1GB
```

#### Type B: DevShell Command

```nix
{
  om.ci.default.ROOT.steps.custom = {
    cargo-test = {
      type = "devshell";
      name = "default";  # optional, defaults to "default"
      command = [ "cargo" "test" ];
    };
  };
}
```

**Nix Command:**
```bash
nix develop .#default -c cargo test
```

**Execution Details:**
- Custom steps run **after** the build step succeeds
- They run in a **temporary writeable directory** (if flake is in store)
- They respect `--override-input` from subflake config
- They can be limited to specific systems via `systems` whitelist

**Configuration:** Controlled by `flake.om.ci.default.ROOT.steps.custom = { }`

### Step 4: Flake Check (Disabled by Default)

**Source:** `omnix/crates/omnix-ci/src/step/flake_check.rs:23-42`

```rust
pub async fn run(
    &self,
    nixcmd: &NixCmd,
    url: &FlakeUrl,
    subflake: &SubflakeConfig,
) -> anyhow::Result<()> {
    tracing::info!("🩺 Running flake check on: {}", subflake.dir);
    let sub_flake_url = url.sub_flake_url(subflake.dir.clone());
    let opts = FlakeOptions {
        override_inputs: subflake.override_inputs.clone(),
        ..Default::default()
    };
    flake::command::check(nixcmd, &opts, &sub_flake_url).await?;
    Ok(())
}
```

**Nix Command:**
```bash
nix flake check <your-flake>
```

**Purpose:** Run additional evaluation checks that `nix build` doesn't perform.

**Note:** Disabled by default in your config:
```nix
# flake.nix:66-70
flake.om.ci.default.ROOT = {
  dir = ".";
  steps.flake-check.enable = false;  # <-- disabled
  steps.custom = { };
};
```

**Why Disabled?** `nix flake check` can be slow and only a handful of flakes need it. Most flakes get sufficient validation from the build step.

**Configuration:** Controlled by `flake.om.ci.default.ROOT.steps.flake-check.enable` (default: false)

---

## Equivalent Nix Commands

To replicate `om ci run --systems "x86_64-linux"` manually:

### Option 1: Using devour-flake Directly (Most Equivalent)

```bash
# This is what om ci actually runs
nix build github:srid/devour-flake#json \
  -L \
  --print-out-paths \
  --no-link \
  --override-input flake . \
  --override-input systems github:nix-systems/x86_64-linux

# View the results
cat result | jq .
```

This gives you exactly what `om ci` does: discover and build all outputs in a single command.

### Option 2: Manual Per-Output Builds (Less Efficient)

To build everything without devour-flake, you'd need to explicitly enumerate all outputs:

```bash
# Step 1: Discover what outputs exist
nix flake show --json . | jq -r '
  # Extract all buildable paths
  paths_to_build as $paths |
  $paths[]
'

# Step 2: Build each output individually (slow!)
# nixosConfigurations
nix build .#nixosConfigurations.stibnite-nixos.config.system.build.toplevel
nix build .#nixosConfigurations.blackphos-nixos.config.system.build.toplevel
nix build .#nixosConfigurations.orb-nixos.config.system.build.toplevel

# homeConfigurations
nix build '.#legacyPackages.x86_64-linux.homeConfigurations."runner@stibnite".activationPackage'
nix build '.#legacyPackages.x86_64-linux.homeConfigurations."runner@blackphos".activationPackage'
nix build '.#legacyPackages.x86_64-linux.homeConfigurations."raquel@blackphos".activationPackage'

# checks
nix build .#checks.x86_64-linux.pre-commit

# devShells
nix build .#devShells.x86_64-linux.default

# packages (if any)
# nix build .#packages.x86_64-linux.<name>

# apps (if any - build the programs)
# nix build .#apps.x86_64-linux.<name>.program
```

**Problems with this approach:**
1. **Repeated evaluation:** Each `nix build` evaluates the flake independently
2. **Manual maintenance:** You must update the list when adding/removing configs
3. **No automatic discovery:** You can't easily find all outputs programmatically
4. **Slower:** Linear execution vs. Nix's internal parallelization

### Option 3: Using `nix flake show` + Scripting (Hybrid)

```bash
#!/usr/bin/env bash
# Discover all outputs and build them

FLAKE="."
SYSTEM="x86_64-linux"

# Get all package outputs
PACKAGES=$(nix eval --json "$FLAKE#packages.$SYSTEM" --apply 'builtins.attrNames' | jq -r '.[]')
for pkg in $PACKAGES; do
  nix build "$FLAKE#packages.$SYSTEM.$pkg" --print-out-paths
done

# Get all checks
CHECKS=$(nix eval --json "$FLAKE#checks.$SYSTEM" --apply 'builtins.attrNames' | jq -r '.[]')
for check in $CHECKS; do
  nix build "$FLAKE#checks.$SYSTEM.$check" --print-out-paths
done

# Get all nixosConfigurations
NIXOS_CONFIGS=$(nix eval --json "$FLAKE#nixosConfigurations" --apply 'builtins.attrNames' | jq -r '.[]')
for config in $NIXOS_CONFIGS; do
  # Check if config builds for this system
  CONFIG_SYSTEM=$(nix eval --raw "$FLAKE#nixosConfigurations.$config.config.nixpkgs.system" 2>/dev/null || echo "")
  if [ "$CONFIG_SYSTEM" = "$SYSTEM" ] || [ "$CONFIG_SYSTEM" = "x86_64-linux" ]; then
    nix build "$FLAKE#nixosConfigurations.$config.config.system.build.toplevel" --print-out-paths
  fi
done

# Get all homeConfigurations
HOME_CONFIGS=$(nix eval --json "$FLAKE#legacyPackages.$SYSTEM.homeConfigurations" --apply 'builtins.attrNames' | jq -r '.[]')
for config in $HOME_CONFIGS; do
  nix build "$FLAKE#legacyPackages.$SYSTEM.homeConfigurations.\"$config\".activationPackage" --print-out-paths
done
```

**Still not equivalent because:**
- Multiple separate `nix eval` calls (slow)
- Multiple separate `nix build` calls (slow)
- Doesn't handle all output types (apps, devShells)
- Error handling is complex

### Summary: Why devour-flake is Better

| Approach | Evaluations | Maintenance | Discovery | Speed |
|----------|-------------|-------------|-----------|-------|
| **devour-flake** (om ci) | 1 | Automatic | Automatic | Fast |
| Manual per-output | N (one per output) | Manual | Manual | Slow |
| Scripted discovery | M+N (discover + build) | Semi-auto | Semi-auto | Medium |

---

## What Makes Omnix Different

### 1. Single Evaluation

**Traditional approach:**
```bash
# Each command evaluates flake.nix independently
$ nix build .#packages.x86_64-linux.foo   # eval 1
$ nix build .#packages.x86_64-linux.bar   # eval 2
$ nix build .#nixosConfigurations.host    # eval 3
# Total: 3 evaluations
```

**Omnix approach:**
```bash
# devour-flake evaluates your flake once
$ om ci run --systems "x86_64-linux"
# Total: 1 evaluation (devour-flake evaluates your flake once)
```

For flakes with expensive evaluations (e.g., nixpkgs imports, large overlays), this is a **massive** performance improvement.

### 2. Automatic Discovery

Omnix doesn't need a hardcoded list of outputs. devour-flake uses Nix's introspection:

```nix
# This is pseudo-code of what devour-flake does
let
  yourFlake = inputs.flake;  # Your flake as input

  # Discover all packages for a system
  packages = builtins.attrValues yourFlake.packages.${system};

  # Discover all checks
  checks = builtins.attrValues yourFlake.checks.${system};

  # Discover all nixos configs
  nixosConfigs = builtins.attrValues (
    lib.filterAttrs
      (name: cfg: cfg.config.nixpkgs.system == system)
      yourFlake.nixosConfigurations
  );

  # Discover all home configs
  homeConfigs = lib.mapAttrsToList
    (_: cfg: cfg.activationPackage)
    (yourFlake.legacyPackages.${system}.homeConfigurations or {});

  # Combine everything
  allOutputs = packages ++ checks ++ nixosConfigs ++ homeConfigs ++ ...;
in
  writeText "result.json" (toJSON { outPaths = allOutputs; })
```

This means:
- Add a new nixos config? Automatically built.
- Add a new home config? Automatically built.
- Add a new package? Automatically built.
- No CI configuration changes needed.

### 3. Structured Output

Omnix produces a JSON result with all built paths:

```json
{
  "outPaths": [
    "/nix/store/...-foo",
    "/nix/store/...-bar"
  ],
  "byName": {
    "foo": "/nix/store/...-foo",
    "bar": "/nix/store/...-bar"
  }
}
```

This enables:
- **Cachix integration:** `om ci run --include-all-dependencies | xargs cachix push mycache`
- **Result tracking:** Link to result JSON for garbage collection protection
- **Downstream processing:** Parse JSON to analyze what was built

### 4. Subflake Support

Omnix can build multiple "subflakes" in a monorepo:

```nix
{
  om.ci.default = {
    root = { dir = "."; };
    frontend = { dir = "./frontend"; };
    backend = { dir = "./backend"; };
  };
}
```

Each subflake:
- Has its own flake.nix
- Can override inputs independently
- Builds separately in CI

This is useful for monorepos with multiple independent flakes.

### 5. Extensibility via Custom Steps

Omnix lets you run additional checks beyond builds:

```nix
{
  om.ci.default.ROOT.steps.custom = {
    # Run tests
    test = {
      type = "devshell";
      command = [ "just" "test" ];
    };

    # Check formatting
    format-check = {
      type = "devshell";
      command = [ "treefmt" "--fail-on-change" ];
    };

    # Custom validation
    validate-docs = {
      type = "app";
      name = "check-docs";
    };
  };
}
```

This goes beyond what `nix build` or `nix eval` can do alone.

---

## How Output Discovery Works

devour-flake uses Nix's introspection capabilities to discover outputs. Here's exactly how:

### Per-System Outputs

For each system in the systems list, devour-flake looks at:

```nix
{
  packages.${system} = { ... };      # getDrv: _: x: [ x ]
  checks.${system} = { ... };        # getDrv: _: x: [ x ]
  devShells.${system} = { ... };     # getDrv: _: x: [ x ]
  apps.${system} = { ... };          # getDrv: _: app: [ app.program ]
  legacyPackages.${system} = { ... };  # Special handling below
}
```

**Discovery method:**
```nix
# From devour-flake/flake.nix:28-32
lookupFlake = k: flake:
  lib.flip builtins.map build-systems (sys:
    lib.attrByPath [ k sys ] { } flake
  );
```

This translates to:
```nix
# For packages
inputs.flake.packages.x86_64-linux or { }

# For checks
inputs.flake.checks.x86_64-linux or { }

# etc.
```

**Extraction method:**
```nix
# From devour-flake/flake.nix:33-42
getDrv = {
  packages = _: x: [ x ];  # Just return the derivation
  checks = _: x: [ x ];    # Just return the derivation
  devShells = _: x: [ x ]; # Just return the derivation
  apps = _: app: [ app.program ];  # Extract program attribute
  legacyPackages = k: v:
    if k == "homeConfigurations"
    then lib.mapAttrsToList (_: cfg: cfg.activationPackage) v
    else [ ];  # Ignore other legacyPackages
};
```

### Home-Manager Configurations

Special handling for home-manager:

```nix
# From devour-flake/flake.nix:38-42
legacyPackages = k: v:
  if k == "homeConfigurations"
  then lib.mapAttrsToList (_: cfg: cfg.activationPackage) v
  else [ ];
```

This looks for:
```nix
{
  legacyPackages.${system}.homeConfigurations."user@host" = {
    activationPackage = <derivation>;
    # ...
  };
}
```

And extracts the `activationPackage` attribute for each configuration.

### NixOS/Darwin Configurations

Flake-level outputs (not per-system):

```nix
# From devour-flake/flake.nix:45-52
flake = {
  lookupFlake = k: flake: [ (lib.attrByPath [ k ] { } flake) ];
  getDrv = {
    nixosConfigurations = _: cfg:
      lib.optional (configForCurrentSystem cfg)
        cfg.config.system.build.toplevel;
    darwinConfigurations = _: cfg:
      lib.optional (configForCurrentSystem cfg)
        cfg.config.system.build.toplevel;
  };
};
```

**System filtering:**
```nix
# From devour-flake/flake.nix:20-23
configForCurrentSystem = cfg:
  shouldBuildOn (getSystem cfg);

getSystem = cfg:
  cfg.pkgs.stdenv.hostPlatform.system;
```

This checks if the configuration's system matches the requested build systems.

### Putting It All Together

```nix
# From devour-flake/flake.nix:55-75
paths =
  lib.flip lib.mapAttrsToList flakeSchema (_: lvlSchema:
    lib.flip lib.mapAttrsToList lvlSchema.getDrv (kind: getDrv:
      builtins.concatMap
        (attr: lib.mapAttrsToList getDrv attr)
        (lvlSchema.lookupFlake kind inputs.flake)
    )
  );

result = {
  outPaths = lib.lists.flatten paths;
  byName = lib.foldl' (acc: path:
    let name = nameForStorePath path;
    in if name == null then acc else acc // { "${name}" = path; }
  ) { } outPaths;
};
```

**Translation:**
1. For each output type (packages, checks, nixosConfigurations, etc.)
2. Look up that output in your flake
3. Apply the appropriate `getDrv` function to extract derivations
4. Flatten all results into a single list
5. Index by name (pname or name attribute) for easy lookup

**Result:** A complete list of every buildable derivation in your flake.

---

## Beyond Build and Eval

Omnix does more than just `nix build` and `nix eval`:

### 1. Lock File Validation

```bash
nix flake lock --no-update-lock-file .
```

This is orthogonal to building. It verifies that:
- `flake.lock` exists
- `flake.lock` is consistent with `flake.nix`
- No stale lock file entries

### 2. Dependency Resolution

With `--include-all-dependencies`:

```bash
# For each output path
nix-store --query --requisites /nix/store/...-output
```

This uses `nix-store` (not `nix build` or `nix eval`) to find all runtime and build dependencies.

**Use case:** Pushing entire build closure to Cachix:
```bash
om ci run --include-all-dependencies | xargs cachix push mycache
```

### 3. Custom Step Execution

Running flake apps:
```bash
nix run .#check-closure-size -- --max-size 1GB
```

Running devShell commands:
```bash
nix develop .#default -c cargo test
```

These are different from building outputs. They execute arbitrary code in the nix environment.

### 4. GitHub Actions Integration

```bash
om ci gh-matrix --systems=x86_64-linux,aarch64-darwin
```

This generates GitHub Actions matrix JSON (not a nix command at all):
```json
{
  "system": ["x86_64-linux", "aarch64-darwin"],
  "subflake": ["ROOT", "frontend", "backend"]
}
```

This is pure Rust code that introspects your Omnix configuration.

### 5. Result Aggregation

Omnix collects all build outputs into a single result:
```bash
# The result symlink contains JSON
cat result
{
  "outPaths": [ ... ],
  "byName": { ... }
}
```

This is a custom data structure, not a standard nix output.

### 6. Remote Building (Experimental)

```bash
om ci run --on ssh://user@host ~/project
```

This:
1. Copies flake to remote host via SSH
2. Runs `om ci` remotely
3. Copies results back to local store

Uses `nix copy` under the hood, not `nix build`.

---

## Practical Example: Your Flake

For your nix-config with `om ci run --systems "x86_64-linux"`:

### What Gets Discovered

```nix
# Flake outputs that devour-flake sees
{
  checks.x86_64-linux = {
    pre-commit = <derivation>;
  };

  devShells.x86_64-linux = {
    default = <derivation>;
  };

  nixosConfigurations = {
    stibnite-nixos = { config.system.build.toplevel = <derivation>; };
    blackphos-nixos = { config.system.build.toplevel = <derivation>; };
    orb-nixos = { config.system.build.toplevel = <derivation>; };
  };

  legacyPackages.x86_64-linux.homeConfigurations = {
    "runner@stibnite" = { activationPackage = <derivation>; };
    "runner@blackphos" = { activationPackage = <derivation>; };
    "raquel@blackphos" = { activationPackage = <derivation>; };
  };

  darwinConfigurations = {
    # Skipped: not x86_64-linux system
  };
}
```

### What Gets Built

```json
{
  "outPaths": [
    "/nix/store/...-pre-commit-run",
    "/nix/store/...-nix-config-shell",
    "/nix/store/...-nixos-system-stibnite-nixos-25.11.20250928.e9f00bd",
    "/nix/store/...-nixos-system-blackphos-nixos-25.11.20250928.e9f00bd",
    "/nix/store/...-nixos-system-orb-nixos-25.11.20250928.e9f00bd",
    "/nix/store/...-home-manager-generation",  // runner@stibnite
    "/nix/store/...-home-manager-generation",  // runner@blackphos
    "/nix/store/...-home-manager-generation"   // raquel@blackphos
  ],
  "byName": {
    "pre-commit-run": "/nix/store/...-pre-commit-run",
    "nixos-system-stibnite-nixos-25.11": "/nix/store/...-nixos-system-stibnite-nixos-25.11.20250928.e9f00bd",
    "nixos-system-blackphos-nixos-25.11": "/nix/store/...-nixos-system-blackphos-nixos-25.11.20250928.e9f00bd",
    "nixos-system-orb-nixos-25.11": "/nix/store/...-nixos-system-orb-nixos-25.11.20250928.e9f00bd"
  }
}
```

### Equivalent Manual Commands

```bash
# Check lock file
nix flake lock --no-update-lock-file .

# Build all outputs individually (inefficient)
nix build .#checks.x86_64-linux.pre-commit
nix build .#devShells.x86_64-linux.default
nix build .#nixosConfigurations.stibnite-nixos.config.system.build.toplevel
nix build .#nixosConfigurations.blackphos-nixos.config.system.build.toplevel
nix build .#nixosConfigurations.orb-nixos.config.system.build.toplevel
nix build '.#legacyPackages.x86_64-linux.homeConfigurations."runner@stibnite".activationPackage'
nix build '.#legacyPackages.x86_64-linux.homeConfigurations."runner@blackphos".activationPackage'
nix build '.#legacyPackages.x86_64-linux.homeConfigurations."raquel@blackphos".activationPackage'
```

vs. Omnix (efficient):
```bash
om ci run --systems "x86_64-linux"
```

---

## Conclusion

**What `om ci` does:**
1. Validates flake.lock with `nix flake lock --no-update-lock-file`
2. Builds all outputs via devour-flake in a single `nix build` invocation
3. Optionally runs custom steps via `nix run` or `nix develop -c`
4. Optionally validates with `nix flake check`

**Why it's better than manual approaches:**
- **Single evaluation:** devour-flake evaluates your flake once, not N times
- **Automatic discovery:** No hardcoded output lists, uses Nix introspection
- **Future-proof:** New configs automatically discovered and built
- **Structured output:** JSON result for further processing
- **Extensible:** Custom steps for testing, formatting, validation

**Beyond nix build/eval:**
- Lock file validation
- Dependency resolution via nix-store
- Custom command execution in devShells
- GitHub Actions matrix generation
- Result aggregation and indexing

**The key innovation:** devour-flake treats your flake as data to be introspected, not just a build target. This enables comprehensive CI that adapts to your flake structure without manual configuration.

---

## Further Reading

- [devour-flake source](https://github.com/srid/devour-flake)
- [Omnix source](https://github.com/juspay/omnix)
- [Omnix CI documentation](/Users/crs58/projects/nix-workspace/omnix/doc/om/ci.md)
- Your local Omnix clone: `/Users/crs58/projects/nix-workspace/omnix/`
