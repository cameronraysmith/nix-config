# multi-user multi-machine nix configuration architecture analysis

## executive summary

**recommended pattern**: hybrid approach - integrated home-manager for admin users within system configurations (darwin/nixos), standalone home-manager configurations for non-admin users using `user@machine` naming.

**key finding**: both reference implementations (srid-nixos-config and mirkolenz-nixos) converge on this exact pattern, confirming it as the optimal nix architecture for multi-user systems.

**activation model**: admin users run `darwin-rebuild switch` (or `nix run . hostname`), non-admin users independently run `nix run . user@hostname` for their home-manager configs.

---

## 1. technical analysis of patterns

### 1.1 pattern comparison matrix

| aspect | srid-nixos-config | mirkolenz-nixos | current nix-config |
|--------|-------------------|-----------------|-------------------|
| framework | nixos-unified + autowiring | flake-parts direct | nixos-unified + autowiring |
| admin HM integration | ✓ in system config | ✓ in system config | ✓ in system config |
| non-admin HM pattern | standalone `user@machine` | standalone `user@machine` | ❌ not implemented |
| activation strategy | justfile with auto-detection | explicit per-config | implicit via autowiring |
| config location | `configurations/home/` | explicit in `flake-modules/home.nix` | `configurations/home/` ready |

### 1.2 srid-nixos-config pattern (nixos-unified author)

**key files analyzed**:
- `/Users/crs58/projects/nix-workspace/srid-nixos-config/modules/darwin/default.nix:11-18`
- `/Users/crs58/projects/nix-workspace/srid-nixos-config/modules/nixos/default.nix:11-16`
- `/Users/crs58/projects/nix-workspace/srid-nixos-config/configurations/home/srid@vixen.nix`
- `/Users/crs58/projects/nix-workspace/srid-nixos-config/justfile:9-21`

**implementation**:

1. **admin user integrated HM**:
```nix
# modules/darwin/default.nix
{
  users.users.${flake.config.me.username} = {
    home = "/Users/${flake.config.me.username}";
  };
  home-manager.users.${config.me.username} = { };
  home-manager.sharedModules = [
    self.homeModules.default
    self.homeModules.darwin-only
  ];
}
```

2. **standalone HM configs**: `configurations/home/srid@vixen.nix` for non-admin/remote systems

3. **intelligent activation** (justfile):
```bash
activate host="":
    @if [ -z "{{host}}" ]; then \
        if [ -f ./configurations/home/$USER@$HOSTNAME.nix ]; then \
            echo "Activating home env $USER@$HOSTNAME ..."; \
            nix run . $USER@$HOSTNAME; \
        else \
            echo "Activating system env $HOSTNAME ..."; \
            nix run . $HOSTNAME; \
        fi \
    fi
```

**pattern strength**: automatic detection based on file existence, minimal user friction, clear separation.

### 1.3 mirkolenz-nixos pattern

**key files analyzed**:
- `/Users/crs58/projects/nix-workspace/mirkolenz-nixos/flake-modules/modules.nix:93-102`
- `/Users/crs58/projects/nix-workspace/mirkolenz-nixos/flake-modules/home.nix:11-50`

**implementation**:

1. **admin user integrated HM** (modules.nix:93-102):
```nix
darwinModules.default = {
  imports = [
    self.systemModules.default
    inputs.home-manager.darwinModules.default
    inputs.determinate.darwinModules.default
    ../system/darwin
    {
      home-manager.users.${moduleArgs.user.login} = self.homeModules.darwin;
    }
  ];
};
```

2. **standalone HM modules** (modules.nix:56-78):
```nix
homeModules.linux-standalone = { pkgs, ... }: {
  nixpkgs = {
    config = self.nixpkgsConfig;
    overlays = [ self.overlays.default ];
  };
  imports = [
    self.homeModules.linux
    ../home/mlenz/standalone
  ];
  targets.genericLinux.enable = pkgs.stdenv.isLinux;
};

homeModules.darwin-standalone = {
  nixpkgs = {
    config = self.nixpkgsConfig;
    overlays = [ self.overlays.default ];
  };
  imports = [ self.homeModules.darwin ];
};
```

3. **explicit standalone configs** (flake-modules/home.nix:42-50):
```nix
flake.homeConfigurations = lib.mapAttrs mkHomeConfig {
  "lenz@gpu.wi2.uni-trier.de" = { system = "x86_64-linux"; };
  "eifelkreis@vserv-4514" = { system = "x86_64-linux"; };
  "compute@kitei-gpu" = { system = "x86_64-linux"; };
};
```

**pattern strength**: explicit module separation (`-standalone` suffix), strong typing via `user@machine`, reuses base modules with standalone augmentation.

### 1.4 nixos-unified autowiring

**key documentation**: `/Users/crs58/projects/nix-workspace/nixos-unified/doc/guide/autowiring.md`

**autowiring rules**:
```
configurations/darwin/foo.nix   → darwinConfigurations.foo
configurations/home/foo.nix     → legacyPackages.${system}.homeConfigurations.foo
configurations/nixos/foo.nix    → nixosConfigurations.foo
```

**critical insight**: autowiring explicitly supports **both** patterns:
- system configs (darwin/nixos) with integrated HM
- standalone home configs with any naming (including `user@machine`)

**why `legacyPackages` for home configs**: home-manager requires `pkgs` instantiation, which doesn't fit into standard flake outputs. see [nixos-unified source](https://github.com/srid/nixos-unified/blob/47a26bc9118d17500bbe0c4adb5ebc26f776cc36/nix/modules/flake-parts/lib.nix#L97).

---

## 2. definitive answers to core questions

### 2.1 primary question: optimal multi-user darwin pattern

**question**: for nix-darwin with multiple users on a single machine (stibnite), should we:
- a) one admin user managing darwin with multiple `home-manager.users.${username}` entries?
- b) one darwin config + multiple standalone `user@machine` home-manager configs?
- c) another pattern?

**answer**: **hybrid of (a) and (b)** - this is not listed as option but emerges as the optimal pattern.

**specifically**:
- admin user (crs58): integrated `home-manager.users.crs58` in `configurations/darwin/stibnite.nix`
- non-admin user (runner): standalone `configurations/home/runner@stibnite.nix`

**rationale**:

1. **permission model**: only admin needs system-level darwin changes, integrating their HM makes sense
2. **independence**: non-admin users can activate their own HM without sudo/admin privileges
3. **maintenance**: runner can update their environment without touching system config
4. **established pattern**: both reference implementations use this exact approach
5. **nixos-unified design**: autowiring explicitly supports both outputs simultaneously

**rejected alternatives**:
- **all users in darwin config**: violates principle of least privilege, requires admin intervention for user env changes
- **all users standalone**: admin still needs darwin config, duplicates HM setup, more complex activation
- **separate darwin configs per user**: darwin is system-level, one config per machine is correct

### 2.2 admin vs non-admin activation

**question**: does only admin user run `darwin-rebuild switch`, or can non-admin users activate their own home-manager configs?

**answer**: **both patterns work simultaneously**:

| user | configuration type | activation command | requires sudo |
|------|-------------------|-------------------|---------------|
| crs58 (admin) | darwin + integrated HM | `nix run . stibnite` | yes (for darwin) |
| runner (non-admin) | standalone HM only | `nix run . runner@stibnite` | no |

**technical details**:

1. **darwin activation** (admin only):
   - runs `darwin-rebuild switch` under the hood
   - requires admin privileges for system changes
   - automatically activates admin's integrated home-manager config

2. **standalone HM activation** (any user):
   - runs `home-manager activate` under the hood
   - operates entirely in user's `$HOME`, no sudo needed
   - independent of system configuration state

**critical insight from srid's justfile** (line 10-21): the activation logic explicitly checks for `configurations/home/$USER@$HOSTNAME.nix` first, enabling this dual pattern.

**practical workflow**:
```bash
# admin deploys darwin + their HM
$ nix run . stibnite  # crs58 runs this

# runner activates their HM independently
$ nix run . runner@stibnite  # runner runs this from their account
```

### 2.3 optimal pattern alignment

**question**: which reference pattern best fits our use case?

**answer**: **srid-nixos-config pattern with nixos-unified autowiring**, supplemented with explicit standalone home modules inspired by mirkolenz.

**justification**:

1. **use case match**:
   - ✓ multi-user darwin (stibnite: crs58 + runner)
   - ✓ multi-machine darwin (stibnite, blackphos)
   - ✓ future nixos expansion (orb-nixos containers)
   - ✓ user aliasing (crs58/cameron/me)

2. **already using nixos-unified**: current nix-config uses autowiring, srid's pattern is native
3. **minimal refactoring**: can extend existing structure without breaking changes
4. **activation simplicity**: srid's justfile pattern provides excellent UX
5. **module reuse**: can follow mirkolenz's `-standalone` module pattern for better organization

**specific adoption**:
- directory structure: srid's pattern (already in place via autowiring)
- activation: srid's justfile with auto-detection
- module organization: mirkolenz's standalone module separation
- user management: extend `config.nix` with per-user overrides

---

## 3. recommended architecture

### 3.1 directory structure

```
nix-config/
├── flake.nix                          # no changes needed, autowiring enabled
├── config.nix                         # REFACTOR: add per-user configs
├── configurations/
│   ├── darwin/
│   │   ├── stibnite.nix              # MODIFY: ensure admin user only
│   │   └── blackphos.nix             # MODIFY: ensure admin user only
│   ├── home/
│   │   ├── runner@stibnite.nix       # CREATE: standalone HM for runner
│   │   └── raquel@blackphos.nix      # CREATE: standalone HM for raquel
│   └── nixos/
│       └── ...                        # FUTURE: apply same pattern
├── modules/
│   ├── darwin/
│   │   └── default.nix               # no changes, already correct
│   ├── home/
│   │   ├── default.nix               # REFACTOR: base home module
│   │   ├── darwin-only.nix           # CREATE: darwin-specific HM
│   │   └── standalone.nix            # CREATE: standalone HM augmentation
│   └── nixos/
│       └── ...                        # FUTURE: apply same pattern
└── justfile                           # CREATE: activation helper
```

### 3.2 configuration ownership and parameters

#### current config.nix (problematic)
```nix
rec {
  me = { username = "crs58"; fullname = "Cameron Smith"; ... };
  jovyan = me // { username = "jovyan"; };
  runner = me // { username = "runner"; };  # ← problem: treats runner as alias
}
```

#### proposed config.nix (properly factored)
```nix
rec {
  # base user identity
  me = {
    fullname = "Cameron Smith";
    email = "cameron.ray.smith@gmail.com";
    sshKey = "ssh-ed25519 AAAAC3Nza...";
  };

  # primary admin user on stibnite
  crs58 = me // {
    username = "crs58";
    isAdmin = true;
  };

  # alias for blackphos (same person, different username)
  cameron = me // {
    username = "cameron";
    isAdmin = true;
  };

  # independent non-admin user on stibnite
  runner = {
    username = "runner";
    fullname = "GitHub Actions Runner";
    email = "runner@stibnite.local";
    sshKey = crs58.sshKey;  # can share ssh key if desired
    isAdmin = false;
    # runner-specific config
    shell = "bash";  # example: different from crs58's preference
  };

  # independent non-admin user on blackphos
  raquel = {
    username = "raquel";
    fullname = "Raquel Smith";
    email = "raquel@example.com";
    sshKey = "ssh-ed25519 AAAA...";  # raquel's own key
    isAdmin = false;
  };

  # container user (can still be an alias if needed)
  jovyan = me // { username = "jovyan"; };
}
```

**key changes**:
1. `me` becomes identity data without username
2. `crs58` and `cameron` are explicit admin users with same identity, different usernames
3. `runner` and `raquel` are fully independent users with their own configs
4. `isAdmin` flag clarifies user roles

### 3.3 machine configurations (darwin)

#### configurations/darwin/stibnite.nix (MODIFY)

```nix
{ flake, pkgs, ... }:
let
  inherit (flake) config inputs;
  inherit (inputs) self;
  adminUser = config.crs58;  # explicit admin user
in
{
  imports = [ self.darwinModules.default ];

  nixpkgs.hostPlatform = "aarch64-darwin";
  nixpkgs.config.allowUnfree = true;

  # declare admin user for darwin
  users.users.${adminUser.username} = {
    home = "/Users/${adminUser.username}";
  };

  # integrated home-manager for admin ONLY
  home-manager.users.${adminUser.username} = {
    imports = [ self.homeModules.default ];
    home.stateVersion = "23.11";
  };

  system.primaryUser = adminUser.username;

  custom.homebrew = {
    enable = true;
    additionalCasks = [ "codelayer-nightly" "docker-desktop" /* ... */ ];
    manageFonts = false;
  };

  security.pam.services.sudo_local.touchIdAuth = true;
  system.stateVersion = 4;
}
```

**critical**: removed any reference to `runner` from darwin config. runner gets standalone HM.

#### configurations/darwin/blackphos.nix (CREATE/MODIFY)

```nix
{ flake, pkgs, ... }:
let
  inherit (flake) config inputs;
  inherit (inputs) self;
  adminUser = config.cameron;  # different admin user!
in
{
  imports = [ self.darwinModules.default ];

  nixpkgs.hostPlatform = "aarch64-darwin";  # or x86_64 if intel
  nixpkgs.config.allowUnfree = true;

  users.users.${adminUser.username} = {
    home = "/Users/${adminUser.username}";
  };

  home-manager.users.${adminUser.username} = {
    imports = [ self.homeModules.default ];
    home.stateVersion = "23.11";
  };

  system.primaryUser = adminUser.username;

  # blackphos-specific configuration
  custom.homebrew = {
    enable = true;
    additionalCasks = [ /* blackphos-specific apps */ ];
  };

  system.stateVersion = 4;
}
```

**key point**: uses `config.cameron` instead of `config.crs58`, but references same `me` identity in config.nix.

### 3.4 standalone home-manager configurations

#### modules/home/standalone.nix (CREATE)

```nix
# augmentation for standalone home-manager configs
# these run without nix-darwin integration
{ pkgs, lib, ... }:
{
  # standalone HM needs to set these explicitly
  home.sessionVariables = {
    NIX_PATH = "nixpkgs=${pkgs.path}";
  };

  # enable nix-index for standalone users
  programs.nix-index.enable = true;

  # standalone users may need explicit XDG paths
  xdg.enable = true;
}
```

#### configurations/home/runner@stibnite.nix (CREATE)

```nix
{ flake, pkgs, lib, ... }:
let
  inherit (flake) config inputs;
  inherit (inputs) self;
  user = config.runner;
in
{
  imports = [
    self.homeModules.default
    self.homeModules.darwin-only  # created below
    self.homeModules.standalone
  ];

  home.username = user.username;
  home.homeDirectory = "/Users/${user.username}";
  home.stateVersion = "23.11";

  # runner-specific home-manager configuration
  programs.bash.enable = true;  # runner prefers bash
  programs.git = {
    userName = user.fullname;
    userEmail = user.email;
  };

  # runner might want minimal dev tools
  home.packages = with pkgs; [
    git
    gh
    nixfmt-rfc-style
  ];

  # runner-specific programs
  # disable heavy tools that crs58 might have
  programs.lazyvim.enable = lib.mkForce false;
}
```

**activation**: `nix run . runner@stibnite` (run as runner user, no sudo)

#### configurations/home/raquel@blackphos.nix (CREATE)

```nix
{ flake, pkgs, lib, ... }:
let
  inherit (flake) config inputs;
  inherit (inputs) self;
  user = config.raquel;
in
{
  imports = [
    self.homeModules.default
    self.homeModules.darwin-only
    self.homeModules.standalone
  ];

  home.username = user.username;
  home.homeDirectory = "/Users/${user.username}";
  home.stateVersion = "23.11";

  programs.git = {
    userName = user.fullname;
    userEmail = user.email;
  };

  # raquel's preferred setup
  programs.zsh.enable = true;
  programs.starship.enable = true;

  home.packages = with pkgs; [
    # raquel's tools
  ];
}
```

**activation**: `nix run . raquel@blackphos` (run as raquel user, no sudo)

### 3.5 home module organization

#### modules/home/default.nix (CURRENT - minimal changes)

current structure is good, just ensure it's truly common config shared by all users.

#### modules/home/darwin-only.nix (CREATE)

```nix
# darwin-specific home-manager configuration
# imported by darwin-integrated and darwin-standalone configs
{ pkgs, lib, osConfig ? null, ... }:
{
  # darwin-specific home-manager settings
  programs.zsh.enable = lib.mkDefault true;  # darwin default shell

  # darwin-specific packages
  home.packages = with pkgs; lib.optionals pkgs.stdenv.isDarwin [
    # darwin-only tools
  ];
}
```

**note**: `osConfig ? null` allows this to work in both integrated (has osConfig) and standalone (no osConfig) contexts.

### 3.6 justfile activation helper (CREATE)

```bash
# nix-config/justfile

default:
    @just --list

# activate the appropriate configuration for current user and host
activate target="":
    @if [ -n "{{target}}" ]; then \
        echo "activating {{target}} ..."; \
        nix run . {{target}}; \
    elif [ -f ./configurations/home/$USER@$HOSTNAME.nix ]; then \
        echo "activating home configuration $USER@$HOSTNAME ..."; \
        nix run . $USER@$HOSTNAME; \
    else \
        echo "activating system configuration $HOSTNAME ..."; \
        nix run . $HOSTNAME; \
    fi

# update primary flake inputs
update:
    nix run .#update

# list available configurations
list:
    @echo "system configurations (darwin/nixos):"
    @find configurations/darwin configurations/nixos -name "*.nix" -not -name "hardware-configuration.nix" 2>/dev/null | sed 's/.*\//  - /' | sed 's/\.nix$//' || true
    @echo "\nhome configurations (standalone):"
    @find configurations/home -name "*.nix" 2>/dev/null | sed 's/.*\//  - /' | sed 's/\.nix$//' || true

# build configuration without activating
build target:
    nix build .#darwinConfigurations.{{target}}.system || \
    nix build .#nixosConfigurations.{{target}}.config.system.build.toplevel || \
    nix build .#homeConfigurations.{{target}}.activationPackage
```

**usage examples**:
```bash
# admin on stibnite
$ just activate              # auto-detects stibnite system config
$ just activate stibnite     # explicit

# runner on stibnite
$ just activate              # auto-detects runner@stibnite home config
$ just activate runner@stibnite  # explicit

# admin on blackphos
$ just activate              # auto-detects blackphos system config
$ just activate blackphos    # explicit

# raquel on blackphos
$ just activate              # auto-detects raquel@blackphos home config
$ just activate raquel@blackphos  # explicit
```

---

## 4. migration plan

### 4.1 phase 1: refactor config.nix (no breakage)

**goal**: properly factor users while maintaining backward compatibility

**steps**:
1. backup current `config.nix`
2. implement new structure with `crs58`, `cameron`, `runner`, `raquel` users
3. keep `me` referencing `crs58` for backward compatibility: `me = crs58;`
4. test existing configurations still reference correct user

**validation**:
```bash
nix eval .#flake.config.crs58.username  # should output "crs58"
nix eval .#flake.config.cameron.username  # should output "cameron"
nix eval .#flake.config.runner.username  # should output "runner"
nix eval .#flake.config.me.username  # should output "crs58" (backward compat)
```

### 4.2 phase 2: update darwin configs (ensure single user)

**goal**: ensure darwin configs reference only their admin user

**stibnite**:
1. modify `configurations/darwin/stibnite.nix`
2. change `flake.config.me.username` to `config.crs58.username`
3. verify only crs58 is configured in `home-manager.users`

**blackphos**:
1. modify `configurations/darwin/blackphos.nix`
2. use `config.cameron.username` as admin user
3. verify only cameron is configured in `home-manager.users`

**validation**:
```bash
nix build .#darwinConfigurations.stibnite.config.home-manager.users
# should show only crs58

nix build .#darwinConfigurations.blackphos.config.home-manager.users
# should show only cameron
```

### 4.3 phase 3: create home module structure

**goal**: prepare home modules for both integrated and standalone use

**steps**:
1. create `modules/home/darwin-only.nix` with darwin-specific HM config
2. create `modules/home/standalone.nix` with standalone augmentations
3. update `modules/darwin/default.nix` to include `darwin-only` in sharedModules:
```nix
home-manager.sharedModules = [
  self.homeModules.default
  self.homeModules.darwin-only
];
```

**validation**:
```bash
nix build .#darwinConfigurations.stibnite.config.home-manager.users.crs58.home.activationPackage
```

### 4.4 phase 4: create standalone home configs

**goal**: implement runner@stibnite and raquel@blackphos configs

**steps**:
1. create `configurations/home/runner@stibnite.nix` as specified in section 3.4
2. create `configurations/home/raquel@blackphos.nix` as specified in section 3.4
3. autowiring will automatically create flake outputs

**validation**:
```bash
# check autowiring created the outputs
nix flake show | grep "runner@stibnite"
nix flake show | grep "raquel@blackphos"

# build the configs
nix build .#homeConfigurations."runner@stibnite".activationPackage
nix build .#homeConfigurations."raquel@blackphos".activationPackage
```

### 4.5 phase 5: implement justfile activation

**goal**: provide user-friendly activation with auto-detection

**steps**:
1. create `justfile` in nix-config root as specified in section 3.6
2. test activation from each user account:

**as crs58 on stibnite**:
```bash
just activate  # should detect and activate stibnite system config
```

**as runner on stibnite**:
```bash
just activate  # should detect and activate runner@stibnite home config
```

**testing**:
- verify admin activation requires sudo (for darwin system changes)
- verify non-admin activation does not require sudo (home-manager only)
- verify explicit targets work: `just activate runner@stibnite`

### 4.6 phase 6: nixos extension (future)

**goal**: apply the same pattern to nixos configurations

**structure**:
```
configurations/nixos/
  ├── orb-nixos.nix              # system config with admin HM
  └── ...
configurations/home/
  ├── someuser@orb-nixos.nix     # standalone HM for container users
  └── ...
```

**module changes**:
- create `modules/home/linux-only.nix` (darwin analog)
- ensure `modules/nixos/default.nix` follows same pattern as darwin
- test in container before physical deployment

---

## 5. addressing specific requirements

### 5.1 stibnite multi-user support

**requirement**: crs58 (admin) + runner (non-admin)

**solution**:
- `configurations/darwin/stibnite.nix`: darwin config with crs58's integrated HM
- `configurations/home/runner@stibnite.nix`: runner's standalone HM
- runner can activate independently: `nix run . runner@stibnite`

**independence for runner**:
- runner's home-manager config is completely separate file
- runner activates without touching darwin config
- runner cannot accidentally break system config
- crs58's darwin updates don't require runner involvement

**shared darwin settings runner must tolerate**:
- system packages in `environment.systemPackages`
- nix daemon configuration
- homebrew apps (if `custom.homebrew.enable = true`)
- system-level defaults (keyboard, trackpad, etc.)
- installed fonts

**runner's full control**:
- shell configuration (bash/zsh/nushell)
- user-level packages (`home.packages`)
- dotfiles and programs (`programs.*`)
- git config, starship, direnv, etc.
- any home-manager module

### 5.2 blackphos multi-user support

**requirement**: cameron (admin, alias of crs58) + raquel (non-admin)

**solution**:
- `configurations/darwin/blackphos.nix`: darwin config with cameron's integrated HM
- `configurations/home/raquel@blackphos.nix`: raquel's standalone HM
- `config.nix`: cameron defined as `me // { username = "cameron"; }`

**cameron/crs58 identity mapping**:
```nix
# in config.nix
rec {
  me = {
    fullname = "Cameron Smith";
    email = "cameron.ray.smith@gmail.com";
    sshKey = "ssh-ed25519 ...";
  };

  crs58 = me // { username = "crs58"; isAdmin = true; };
  cameron = me // { username = "cameron"; isAdmin = true; };
}
```

**in blackphos.nix**:
```nix
let
  adminUser = config.cameron;  # explicitly use cameron
in
{
  users.users.${adminUser.username} = {
    home = "/Users/cameron";  # not /Users/crs58
  };
  home-manager.users.${adminUser.username} = {
    # cameron's HM config, same as crs58's but with cameron username
  };
}
```

**for raquel**: completely independent user with own config, activation, and parameters.

### 5.3 future nixos container support

**pattern extensibility**: the same pattern applies to nixos:

```
configurations/nixos/orb-nixos.nix:
  - nixos system config with admin's integrated HM
  - e.g., crs58 as admin

configurations/home/containeruser@orb-nixos.nix:
  - standalone HM for container users
  - activated independently within container
```

**container-specific considerations**:
- standalone HM configs work excellently in containers
- no sudo required for container users to activate HM
- system-level nixos config managed by host admin
- clear separation between host system and user environments

---

## 6. configurability at configurations/darwin level

**question**: is there sufficient configurability at configurations/darwin level to support these patterns?

**answer**: yes, with current nix-darwin structure.

**current architecture** allows:

1. **per-machine admin user selection**:
```nix
# in any configurations/darwin/MACHINE.nix
let
  adminUser = config.crs58;  # or config.cameron, or config.someoneelse
in
```

2. **per-machine home-manager integration**:
```nix
home-manager.users.${adminUser.username} = {
  imports = [ self.homeModules.default ];
  # machine-specific HM overrides here
};
```

3. **per-machine system configuration**:
```nix
custom.homebrew = {
  enable = true;
  additionalCasks = [ /* machine-specific apps */ ];
};
```

**what's configurable per-machine**:
- admin username (crs58 vs cameron)
- home-manager imports and overrides for admin
- homebrew packages
- system settings (keyboard, security, etc.)
- nixpkgs.hostPlatform (aarch64-darwin vs x86_64-darwin)
- any nix-darwin option

**what's NOT configurable per-machine** (by design):
- non-admin users (they get standalone HM configs)
- shared module structure (intentionally consistent)
- nixos-unified integration (flake-level)

**no additional abstraction needed**: current configuration level is optimal.

---

## 7. key architectural principles validated

### 7.1 separation of concerns

**system-level** (darwin/nixos):
- managed by admin user
- requires elevated privileges
- one per machine
- includes admin's home environment

**user-level** (standalone home-manager):
- managed by individual users
- no elevated privileges needed
- one per `user@machine` combination
- independent of system configuration

### 7.2 permission boundaries

**admin user**:
- can activate darwin/nixos system config
- can activate their own integrated HM (happens automatically)
- can modify system-level settings
- responsible for system maintenance

**non-admin user**:
- can activate only their standalone HM config
- cannot modify system configuration
- cannot affect admin or other users
- full control over their home environment

### 7.3 configuration reuse

**shared base**: `modules/home/default.nix`
- used by all users (integrated and standalone)
- common programs, tools, settings

**os-specific**: `modules/home/darwin-only.nix`, `modules/home/linux-only.nix`
- used by users on that OS
- os-specific programs and settings

**context-specific**: `modules/home/standalone.nix`
- augmentation for standalone HM
- handles differences from integrated HM (no osConfig, explicit XDG, etc.)

**user-specific**: `configurations/home/user@machine.nix`
- per-user customizations
- can override any base setting with `lib.mkForce`

### 7.4 activation independence

**admin activating system**:
```bash
# as crs58 on stibnite
$ nix run . stibnite
# activates darwin + crs58's home-manager
# requires sudo for darwin changes
```

**non-admin activating home**:
```bash
# as runner on stibnite
$ nix run . runner@stibnite
# activates only runner's home-manager
# no sudo required, isolated to /Users/runner
```

**no conflict**: these activations are completely independent operations.

---

## 8. challenging stated assumptions

### 8.1 "all users on darwin must be in darwin config"

**assumption status**: FALSE

**evidence**:
- srid has standalone `srid@vixen.nix` home config for linux machine
- mirkolenz has multiple `user@remote` home configs for non-darwin systems
- autowiring supports standalone home configs on any system
- home-manager activation is user-level, system-agnostic

**correct principle**: only admin user needs integration with darwin config.

### 8.2 "standalone HM configs are only for remote systems"

**assumption status**: FALSE

**evidence**:
- standalone HM works on local system where darwin is installed
- runner on stibnite can use standalone HM while crs58 uses integrated HM
- it's about **privilege level**, not **physical location**

**correct principle**: standalone HM configs are for non-admin users, whether local or remote.

### 8.3 "one pattern must be used exclusively"

**assumption status**: FALSE

**evidence**:
- srid's justfile explicitly supports both patterns simultaneously
- mirkolenz has both integrated (darwinModules.default) and standalone (homeModules.darwin-standalone)
- nixos-unified autowiring creates both output types from same flake

**correct principle**: hybrid pattern is not only possible but recommended.

### 8.4 "current nix-config structure is optimal starting point"

**assumption status**: PARTIALLY TRUE

**current strengths**:
- nixos-unified with autowiring already in place ✓
- flake-parts structure solid ✓
- module organization clear ✓
- configurations directory structured correctly ✓

**current weaknesses**:
- `config.nix` treats runner as alias instead of independent user ✗
- darwin configs would reference `me` which is ambiguous for blackphos ✗
- no standalone home configs exist yet ✗
- missing darwin-only and standalone home modules ✗

**verdict**: good foundation, needs targeted refactoring (phases 1-4 of migration plan).

---

## 9. comparison with alternatives not in references

### 9.1 alternative: all users in single darwin config

```nix
# hypothetical configurations/darwin/stibnite.nix
{
  home-manager.users.crs58 = { /* crs58 HM */ };
  home-manager.users.runner = { /* runner HM */ };
}
```

**problems**:
1. runner changes require crs58 to run darwin-rebuild (sudo needed)
2. runner cannot independently update their environment
3. monolithic config file harder to maintain
4. coupling between system admin and user environments
5. violates least privilege principle

**verdict**: REJECTED - worse on all dimensions

### 9.2 alternative: separate darwin configs per user

```
configurations/darwin/stibnite-crs58.nix
configurations/darwin/stibnite-runner.nix
```

**problems**:
1. darwin is system-level, not user-level - this is conceptually wrong
2. multiple darwin configs would conflict (one system config at a time)
3. massive duplication of system settings
4. unclear which user's darwin config is "active"

**verdict**: REJECTED - misunderstands darwin's role

### 9.3 alternative: everything standalone

```
configurations/home/crs58@stibnite.nix  # even admin
configurations/home/runner@stibnite.nix
# no darwin config?
```

**problems**:
1. someone still needs to manage darwin system config
2. admin's HM would be separate from darwin, but admin IS managing darwin
3. duplication between darwin setup and admin's HM
4. less convenient for admin (two separate activations)

**verdict**: REJECTED - admin integration makes sense

**conclusion**: the recommended hybrid pattern emerges as optimal after considering alternatives.

---

## 10. summary and next steps

### 10.1 confirmed optimal pattern

**hybrid approach**:
- admin users: integrated home-manager within system config (darwin/nixos)
- non-admin users: standalone home-manager configs with `user@machine` naming
- activation: intelligent selection based on user and available configs
- independence: non-admin users activate without sudo/admin involvement

**validated by**:
- srid-nixos-config (nixos-unified author's own config)
- mirkolenz-nixos (comprehensive flake-parts implementation)
- nixos-unified autowiring design (explicitly supports both)
- established nix community patterns

### 10.2 implementation checklist

**phase 1**: refactor config.nix
- [ ] create independent user configs (crs58, cameron, runner, raquel)
- [ ] maintain backward compatibility with `me` reference
- [ ] add `isAdmin` flag to clarify roles
- [ ] validate user references work correctly

**phase 2**: update darwin configs
- [ ] modify stibnite.nix to use `config.crs58` explicitly
- [ ] modify blackphos.nix to use `config.cameron` explicitly
- [ ] remove any runner/raquel references from darwin configs
- [ ] verify each darwin config has exactly one admin user

**phase 3**: create home module structure
- [ ] create `modules/home/darwin-only.nix`
- [ ] create `modules/home/standalone.nix`
- [ ] update darwin sharedModules to include darwin-only
- [ ] test admin HM still works after refactor

**phase 4**: create standalone home configs
- [ ] create `configurations/home/runner@stibnite.nix`
- [ ] create `configurations/home/raquel@blackphos.nix`
- [ ] verify autowiring creates legacyPackages outputs
- [ ] test building standalone configs

**phase 5**: implement justfile
- [ ] create justfile with activate recipe
- [ ] add auto-detection logic (user@host first, then host)
- [ ] add helper commands (update, list, build)
- [ ] test from each user account

**phase 6**: document and deploy
- [ ] add README with activation instructions
- [ ] document user onboarding process
- [ ] deploy to stibnite, test both users
- [ ] deploy to blackphos, test both users

### 10.3 future extensions

**nixos container support**:
- apply same pattern to `configurations/nixos/`
- create `modules/home/linux-only.nix`
- test in orb-nixos container environment

**additional users**:
- pattern scales to arbitrary number of users
- each non-admin user gets `configurations/home/user@machine.nix`
- no changes to system configs needed

**cross-machine user management**:
- users can have configs on multiple machines
- e.g., `runner@stibnite.nix` and `runner@blackphos.nix`
- shared config via `modules/home/default.nix`

### 10.4 validation after deployment

**admin user (crs58 on stibnite)**:
```bash
just activate
# should activate darwin + integrated HM
# verify system settings applied
# verify crs58's home environment configured
```

**non-admin user (runner on stibnite)**:
```bash
just activate
# should activate standalone HM only
# verify no sudo required
# verify runner's home environment configured
# verify independence from crs58's config
```

**admin user (cameron on blackphos)**:
```bash
just activate
# should activate darwin + integrated HM
# verify username is cameron, not crs58
# verify same identity data (email, ssh key, etc.)
```

**non-admin user (raquel on blackphos)**:
```bash
just activate
# should activate standalone HM only
# verify raquel's independent config
# verify no interaction with cameron's system config
```

---

## 11. conclusion

the optimal nix architecture for multi-user multi-machine configurations with nix-darwin and home-manager is a **hybrid pattern** that:

1. **integrates** home-manager for admin users within system configurations
2. **separates** home-manager for non-admin users into standalone `user@machine` configs
3. **enables** independent activation without privilege escalation
4. **maintains** clear boundaries between system and user concerns
5. **scales** to multiple users and multiple machines
6. **reuses** common configuration via shared modules

this pattern is **not speculative** - it's the established pattern used by the nixos-unified author and other sophisticated nix configurations. the migration path is clear, the benefits are substantial, and the implementation is straightforward using existing tools and conventions.

the critical insight is that **permission levels, not physical location**, determine whether a user should have integrated or standalone home-manager configuration. admin users managing the system naturally integrate their home environment with system configuration. non-admin users naturally use standalone configurations they can manage independently.

**this architecture directly addresses all stated requirements** and provides a solid foundation for future expansion to nixos systems while maintaining the benefits of nixos-unified's autowiring and consistent interface.
