# nixos mirror configurations

## overview

nixos mirror configurations (`configurations/nixos/stibnite-nixos.nix`, `configurations/nixos/blackphos-nixos.nix`) are linux equivalents of darwin configurations created for CI testing purposes.

## purpose

1. **CI validation on linux**: build and validate darwin config structure on ubuntu-latest runners (cheaper than macOS runners)
2. **cross-platform verification**: ensure core nix expressions evaluate correctly on linux
3. **architecture testing**: validate multi-user architecture implementation without darwin hardware
4. **fast feedback**: enable rapid iteration on configuration structure before local darwin deployment

## excluded darwin-only features

the following nix-darwin specific features are excluded from nixos mirror configs as they have no nixos equivalents:

### 1. homebrew integration

**darwin**:
```nix
custom.homebrew = {
  enable = true;
  additionalCasks = [
    "codelayer-nightly"
    "dbeaver-community"
    "docker-desktop"
    "gpg-suite"
    "inkscape"
    "keycastr"
    "meld"
    "postgres-unofficial"
  ];
  additionalMasApps = {
    save-to-raindrop-io = 1549370672;
  };
  manageFonts = false;
};
```

**nixos equivalent**: none - homebrew is macOS-specific package manager

**alternative on nixos**: use `environment.systemPackages` with nix packages instead

### 2. system.defaults (macOS preferences)

**darwin**:
```nix
system.defaults = {
  dock = {
    autohide = true;
    orientation = "bottom";
  };
  finder = {
    AppleShowAllExtensions = true;
    FXEnableExtensionChangeWarning = false;
  };
  NSGlobalDomain = {
    AppleKeyboardUIMode = 3;
    ApplePressAndHoldEnabled = false;
  };
};
```

**nixos equivalent**: none - these are macOS system preference domains

**alternative on nixos**: nixos has different system configuration modules (e.g., `services`, `hardware`, `boot`)

### 3. touchID authentication

**darwin**:
```nix
security.pam.services.sudo_local.touchIdAuth = true;
```

**nixos equivalent**: none - touchID is macOS hardware feature

**alternative on nixos**: standard PAM authentication or other biometric options if hardware supports

### 4. GUI applications

**darwin**: homebrew casks install native macOS applications
- docker desktop (macOS app)
- gpg suite (macOS keychain integration)
- mac app store applications

**nixos equivalent**: linux native alternatives exist but are different packages
- docker: `services.docker.enable = true` + docker cli
- gpg: `programs.gnupg.agent.enable = true`
- GUI apps: different applications or web versions

### 5. system.stateVersion

**darwin**: uses nix-darwin versioning (e.g., `system.stateVersion = 4;`)

**nixos**: uses different versioning scheme (e.g., `system.stateVersion = "23.11";`)

## included nixos-specific requirements

to make nixos configs valid, the following nixos-specific settings are added:

### 1. boot loader configuration

```nix
boot.loader.systemd-boot.enable = true;
boot.loader.efi.canTouchEfiVariables = true;
```

**purpose**: nixos requires boot loader configuration (not needed on darwin)

### 2. filesystem configuration

```nix
fileSystems."/" = {
  device = "/dev/disk/by-label/nixos";
  fsType = "ext4";
};

fileSystems."/boot" = {
  device = "/dev/disk/by-label/boot";
  fsType = "vfat";
};
```

**purpose**: nixos requires explicit filesystem mounts (darwin manages this automatically)

### 3. networking

```nix
networking.hostName = "stibnite-nixos";
```

**purpose**: explicit hostname configuration (darwin uses `system.computerName`)

## shared configuration

the following configuration elements work identically on both darwin and nixos:

1. **nixpkgs settings**:
   - `nixpkgs.hostPlatform` (different values: `aarch64-darwin` vs `x86_64-linux`)
   - `nixpkgs.config.allowUnfree`

2. **user management**:
   - `system.primaryUser` (custom attribute from shared modules)

3. **home-manager integration**:
   - both import respective modules (`darwinModules.default` vs `nixosModules.default`)
   - home-manager user configuration structure is identical

4. **nix expressions**:
   - `let` bindings, `inherit` statements
   - flake inputs and module imports

## usage in CI

### build-matrix job

```yaml
matrix:
  config:
    - type: nixos
      name: stibnite-nixos
      target: nixosConfigurations.stibnite-nixos.config.system.build.toplevel
      path: configurations/nixos/stibnite-nixos.nix
    - type: nixos
      name: blackphos-nixos
      target: nixosConfigurations.blackphos-nixos.config.system.build.toplevel
      path: configurations/nixos/blackphos-nixos.nix
```

### integration-tests job

validates that nixos mirror configs:
- build successfully on x86_64-linux
- match structure of darwin originals
- are independent (no cross-config dependencies)

## future enhancements

### enable darwin builds on macOS runners

after nixos mirrors validate successfully:

1. uncomment darwin configs in build-matrix:
   ```yaml
   - type: darwin
     name: stibnite
     target: darwinConfigurations.stibnite.system
     path: configurations/darwin/stibnite.nix
   ```

2. add macOS runner jobs:
   ```yaml
   runs-on: ${{ matrix.os }}
   strategy:
     matrix:
       os: [ubuntu-latest, macos-latest]
   ```

3. conditional steps based on runner.os

### package equivalence testing

create mapping of darwin homebrew packages to nixos alternatives:
- document which casks have nix package equivalents
- create shared package lists where possible
- identify darwin-only and linux-only packages

## maintenance

when updating darwin configurations:

1. **update corresponding nixos mirror** to maintain structural parity
2. **document new darwin-only features** if they cannot be mirrored
3. **validate CI still passes** with updated configs
4. **consider creating shared modules** for common configuration

## references

- darwin configurations: `configurations/darwin/{stibnite,blackphos}.nix`
- nixos mirrors: `configurations/nixos/{stibnite,blackphos}-nixos.nix`
- CI workflow: `.github/workflows/ci.yaml`
- architecture analysis: `docs/nix-config-architecture-analysis.md`
