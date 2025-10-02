# adding new users and hosts to nix-config

comprehensive guide for adding users and hosts with proper secrets management using sops-nix, compatible with the multi-user multi-host architecture defined in [`docs/nix-config-architecture-analysis.md`](./nix-config-architecture-analysis.md).

---

## table of contents

1. [architecture overview](#architecture-overview)
2. [prerequisites](#prerequisites)
3. [adding a new admin user](#adding-a-new-admin-user)
4. [adding a new non-admin user](#adding-a-new-non-admin-user)
5. [adding a new darwin host](#adding-a-new-darwin-host)
6. [adding a new nixos host](#adding-a-new-nixos-host)
7. [secrets management workflow](#secrets-management-workflow)
8. [ssh key management with bitwarden](#ssh-key-management-with-bitwarden)
9. [troubleshooting](#troubleshooting)
10. [security checklist](#security-checklist)

---

## architecture overview

### user types

**admin user** (integrated home-manager):
- manages system configuration (darwin/nixos)
- home-manager integrated in system config
- requires sudo for activation
- one per host (e.g., crs58 on stibnite, cameron on blackphos)

**non-admin user** (standalone home-manager):
- manages only their home environment
- standalone `user@host` configuration
- no sudo required for activation
- can be multiple per host (e.g., runner@stibnite, raquel@blackphos)

### directory structure

```
nix-config/
├── config.nix                         # user definitions
├── .sops.yaml                         # sops encryption rules
├── configurations/
│   ├── darwin/
│   │   ├── stibnite.nix              # host config (admin only)
│   │   └── blackphos.nix             # host config (admin only)
│   ├── home/
│   │   ├── runner@stibnite.nix       # standalone home-manager
│   │   └── raquel@blackphos.nix      # standalone home-manager
│   └── nixos/
│       └── orb-nixos.nix             # nixos host config
├── secrets/
│   ├── .sops.yaml                    # encryption rules
│   ├── shared.yaml                   # shared secrets
│   ├── users/
│   │   └── {username}/               # user-specific secrets
│   ├── hosts/
│   │   └── {hostname}/               # host-specific secrets
│   └── services/
│       └── {service}/                # service-specific secrets
└── modules/
    ├── darwin/default.nix            # darwin common
    ├── home/
    │   ├── default.nix               # home-manager common
    │   ├── darwin-only.nix           # darwin-specific HM
    │   ├── linux-only.nix            # linux-specific HM
    │   └── standalone.nix            # standalone HM augmentation
    └── nixos/default.nix             # nixos common
```

---

## prerequisites

### essential tools

ensure you have the following installed and configured:

```bash
# verify nix with flakes enabled
nix --version
nix flake --help

# verify required tools in dev shell
nix develop
which age-keygen ssh-to-age sops
```

### bitwarden ssh agent setup

this configuration uses bitwarden as the ssh agent. ensure:

1. bitwarden desktop app installed (via homebrew MAS on darwin)
2. bitwarden ssh agent enabled in settings
3. ssh keys stored in bitwarden vault as "SSH Key" items

**location of bitwarden ssh agent socket:**
- **darwin**: `~/Library/Containers/com.bitwarden.desktop/Data/.bitwarden-ssh-agent.sock`
- **linux**: `~/.bitwarden-ssh-agent.sock`

the configuration automatically sets `SSH_AUTH_SOCK` via [`modules/home/all/core/bitwarden.nix`](../modules/home/all/core/bitwarden.nix).

### admin recovery key

the admin recovery key must be stored securely in bitwarden. this key can decrypt all secrets and is used for emergency recovery.

**verify admin key exists:**
```bash
# admin key should be in bitwarden vault as secure note
# public key: age1vy7wsnf8eg5229evq3ywup285jzk9cntsx5hhddjtwsjh0kf4c6s9fmalv
```

---

## adding a new admin user

admin users manage system configurations and have integrated home-manager.

### step 1: define user in config.nix

edit [`config.nix`](../config.nix):

```nix
rec {
  # base identity (shared attributes)
  me = {
    fullname = "Cameron Smith";
    email = "cameron.ray.smith@gmail.com";
    sshKey = "ssh-ed25519 AAAAC3Nza...";  # from bitwarden
  };

  # existing admin users
  crs58 = me // { username = "crs58"; isAdmin = true; };
  cameron = me // { username = "cameron"; isAdmin = true; };

  # NEW ADMIN USER EXAMPLE
  newadmin = me // {
    username = "newadmin";
    isAdmin = true;
    # can override any field from `me`
    email = "newadmin@example.com";  # if different
  };

  # OR: completely independent admin user
  alice = {
    username = "alice";
    fullname = "Alice Anderson";
    email = "alice@example.com";
    sshKey = "ssh-ed25519 AAAA...";  # alice's key from bitwarden
    isAdmin = true;
  };
}
```

### step 2: generate age key for user

the admin user needs an age key for sops secret decryption:

```bash
# as the new admin user
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
chmod 600 ~/.config/sops/age/keys.txt

# display public key (needed for .sops.yaml)
age-keygen -y ~/.config/sops/age/keys.txt
# example output: age1whsxa8rlfm8c9hgjc2yafq5dvuvkz58pfd85nyuzdcjndufgfucs7ll3ke
```

**store private key securely:**
1. copy private key content: `cat ~/.config/sops/age/keys.txt`
2. save in bitwarden as secure note: "age-key-{username}"
3. verify backup: delete local key, restore from bitwarden, test decryption

### step 3: add age key to .sops.yaml

edit [`.sops.yaml`](../.sops.yaml):

```yaml
keys:
  # existing keys
  - &admin age1vy7wsnf8eg5229evq3ywup285jzk9cntsx5hhddjtwsjh0kf4c6s9fmalv
  - &crs58 age1whsxa8rlfm8c9hgjc2yafq5dvuvkz58pfd85nyuzdcjndufgfucs7ll3ke

  # NEW ADMIN USER KEY
  - &newadmin age1abc...xyz  # public key from step 2

creation_rules:
  # add to user-specific secrets
  - path_regex: users/newadmin/.*\.yaml$
    key_groups:
      - age:
        - *admin
        - *newadmin

  # update existing rules to include new admin (if needed)
  - path_regex: .*\.yaml$
    key_groups:
      - age:
        - *admin
        - *crs58
        - *newadmin  # add if admin needs access to all secrets
```

### step 4: create host configuration

if admin is primary user on a new host, see [adding a new darwin host](#adding-a-new-darwin-host) or [adding a new nixos host](#adding-a-new-nixos-host).

if admin is primary user on **existing** host, update that host's configuration:

**example: change admin on blackphos from cameron to alice**

edit `configurations/darwin/blackphos.nix`:

```nix
{ flake, pkgs, ... }:
let
  inherit (flake) config inputs;
  inherit (inputs) self;
  adminUser = config.alice;  # CHANGE: was config.cameron
in
{
  imports = [ self.darwinModules.default ];

  nixpkgs.hostPlatform = "aarch64-darwin";

  users.users.${adminUser.username} = {
    home = "/Users/${adminUser.username}";
  };

  home-manager.users.${adminUser.username} = {
    imports = [ self.homeModules.default ];
    home.stateVersion = "23.11";
  };

  system.primaryUser = adminUser.username;

  # rest of config...
}
```

### step 5: update secrets for new admin

```bash
# re-encrypt all secrets to include new admin's key
find secrets -name "*.yaml" -not -name ".sops.yaml" -exec sops updatekeys {} \;

# verify new admin can decrypt
sops -d secrets/shared.yaml
```

### step 6: activation

**as admin user on their host:**

```bash
# using justfile auto-detection
just activate

# OR explicit
nix run . hostname
```

---

## adding a new non-admin user

non-admin users get standalone home-manager configurations and cannot manage system settings.

### step 1: define user in config.nix

edit [`config.nix`](../config.nix):

```nix
rec {
  # existing base and admin users...

  # existing non-admin users
  runner = {
    username = "runner";
    fullname = "GitHub Actions Runner";
    email = "runner@stibnite.local";
    sshKey = crs58.sshKey;  # can share if appropriate
    isAdmin = false;
  };

  # NEW NON-ADMIN USER EXAMPLE
  bob = {
    username = "bob";
    fullname = "Bob Builder";
    email = "bob@example.com";
    sshKey = "ssh-ed25519 AAAA...";  # bob's key from bitwarden
    isAdmin = false;
    # user-specific settings
    shell = "zsh";  # preferred shell
  };
}
```

### step 2: generate age key for user

```bash
# as the new non-admin user
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
chmod 600 ~/.config/sops/age/keys.txt

# display public key
age-keygen -y ~/.config/sops/age/keys.txt
```

**store private key in bitwarden** (same process as admin).

### step 3: add age key to .sops.yaml

edit [`.sops.yaml`](../.sops.yaml):

```yaml
keys:
  # existing keys...

  # NEW NON-ADMIN USER KEY
  - &bob age1def...uvw

creation_rules:
  # user-specific secrets rule
  - path_regex: users/bob/.*\.yaml$
    key_groups:
      - age:
        - *admin  # admin can always access for recovery
        - *bob

  # if user needs access to shared secrets, add to that rule:
  - path_regex: shared\.yaml$
    key_groups:
      - age:
        - *admin
        - *crs58
        - *bob  # grant bob access to shared secrets
```

### step 4: create standalone home-manager configuration

create `configurations/home/{username}@{hostname}.nix`:

**example: bob@stibnite.nix**

```nix
{ flake, pkgs, lib, ... }:
let
  inherit (flake) config inputs;
  inherit (inputs) self;
  user = config.bob;
in
{
  imports = [
    self.homeModules.default       # common home-manager config
    self.homeModules.darwin-only   # darwin-specific (or linux-only for linux)
    self.homeModules.standalone    # standalone HM augmentation
  ];

  home.username = user.username;
  home.homeDirectory = "/Users/${user.username}";  # darwin
  # home.homeDirectory = "/home/${user.username}";  # linux
  home.stateVersion = "23.11";

  # user-specific configuration
  programs.git = {
    userName = user.fullname;
    userEmail = user.email;
  };

  programs.zsh.enable = true;  # bob's preferred shell
  programs.starship.enable = true;

  # user packages (independent of system)
  home.packages = with pkgs; [
    git
    gh
    jq
    ripgrep
  ];

  # disable or override admin's heavy tools if needed
  programs.lazyvim.enable = lib.mkForce false;
}
```

**example: bob@orb-nixos.nix** (nixos version)

```nix
{ flake, pkgs, lib, ... }:
let
  inherit (flake) config inputs;
  inherit (inputs) self;
  user = config.bob;
in
{
  imports = [
    self.homeModules.default
    self.homeModules.linux-only    # linux-specific
    self.homeModules.standalone
  ];

  home.username = user.username;
  home.homeDirectory = "/home/${user.username}";
  home.stateVersion = "23.11";

  programs.git = {
    userName = user.fullname;
    userEmail = user.email;
  };

  # linux-specific config
  programs.bash.enable = true;
  home.packages = with pkgs; [
    git
    htop
  ];
}
```

### step 5: update secrets for new user

```bash
# re-encrypt secrets bob has access to
sops updatekeys secrets/shared.yaml  # if added to shared
sops updatekeys secrets/users/bob/*.yaml  # bob's secrets

# verify bob can decrypt
sops -d secrets/shared.yaml
```

### step 6: activation

**as non-admin user:**

```bash
# using justfile auto-detection (checks for user@host config first)
just activate

# OR explicit
nix run . bob@stibnite
```

**key difference from admin**: no sudo required, operates entirely in `$HOME`.

---

## adding a new darwin host

### step 1: get host ssh key and derive age key

**on the new darwin host:**

```bash
# extract ssh host public key and convert to age
sudo cat /etc/ssh/ssh_host_ed25519_key.pub | ssh-to-age

# example output:
# age18rgyca7ptr6djqn5h7rhgu4yuv9258v5wflg7tefgvxr06nz7cgsw7qgmy
```

**if host doesn't have ssh key yet:**

```bash
# generate ssh host key
sudo ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ""

# then convert to age as above
sudo cat /etc/ssh/ssh_host_ed25519_key.pub | ssh-to-age
```

### step 2: add host key to .sops.yaml

edit [`.sops.yaml`](../.sops.yaml):

```yaml
keys:
  # existing keys...

  # NEW HOST KEY
  - &newhostname age18rgyca7ptr6djqn5h7rhgu4yuv9258v5wflg7tefgvxr06nz7cgsw7qgmy

creation_rules:
  # host-specific secrets
  - path_regex: hosts/newhostname/.*\.yaml$
    key_groups:
      - age:
        - *admin
        - *crs58  # or appropriate admin user
        - *newhostname

  # add to service secrets if host needs them
  - path_regex: services/.*\.yaml$
    key_groups:
      - age:
        - *admin
        - *crs58
        - *newhostname

  # update catch-all if needed
  - path_regex: .*\.yaml$
    key_groups:
      - age:
        - *admin
        - *crs58
        - *newhostname
```

### step 3: create host configuration

create `configurations/darwin/{hostname}.nix`:

```nix
{ flake, pkgs, ... }:
let
  inherit (flake) config inputs;
  inherit (inputs) self;
  adminUser = config.crs58;  # or appropriate admin
in
{
  imports = [ self.darwinModules.default ];

  nixpkgs.hostPlatform = "aarch64-darwin";  # or x86_64-darwin
  nixpkgs.config.allowUnfree = true;

  # define admin user
  users.users.${adminUser.username} = {
    home = "/Users/${adminUser.username}";
  };

  # integrated home-manager for admin
  home-manager.users.${adminUser.username} = {
    imports = [ self.homeModules.default ];
    home.stateVersion = "23.11";
  };

  system.primaryUser = adminUser.username;

  # host-specific configuration
  custom.homebrew = {
    enable = true;
    additionalCasks = [
      # host-specific apps
      "docker-desktop"
    ];
  };

  security.pam.services.sudo_local.touchIdAuth = true;
  system.stateVersion = 4;
}
```

**nixos-unified autowiring** will automatically create `darwinConfigurations.{hostname}` from this file.

### step 4: create host-specific secrets (if needed)

```bash
# create host secrets directory
mkdir -p secrets/hosts/newhostname

# create and encrypt host-specific secrets
sops secrets/hosts/newhostname/config.yaml
```

### step 5: bootstrap activation

**on the new host, as admin user:**

```bash
# clone nix-config
git clone <repo-url> ~/nix-config
cd ~/nix-config

# bootstrap darwin (first time only)
just darwin-bootstrap newhostname

# OR using nixos-unified
nix run . newhostname
```

**subsequent activations:**

```bash
just activate
# OR
nix run . newhostname
```

### step 6: verify secrets access

```bash
# test sops can decrypt host secrets
sops -d secrets/hosts/newhostname/config.yaml

# test secret paths available at runtime
ls -la /run/secrets/  # darwin secret paths
```

---

## adding a new nixos host

process is similar to darwin but with nixos-specific considerations.

### step 1: get host ssh key and derive age key

**on the new nixos host:**

```bash
# extract ssh host public key and convert to age
sudo cat /etc/ssh/ssh_host_ed25519_key.pub | ssh-to-age

# OR: generate if missing
sudo ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ""
sudo cat /etc/ssh/ssh_host_ed25519_key.pub | ssh-to-age
```

**alternatively, use sops-nix auto-generated key:**

nixos can auto-generate an age key at `/var/lib/sops-nix/key.txt` on first boot if configured. add this to your nixos configuration:

```nix
{
  sops.age.generateKey = true;
  sops.age.keyFile = "/var/lib/sops-nix/key.txt";
}
```

then after first activation:

```bash
sudo age-keygen -y /var/lib/sops-nix/key.txt
# age1609ngcyxj8x5fyjkdctkzxdws9e38yy28l88lvs0echtv0kdy5aslcqm3w
```

### step 2: add host key to .sops.yaml

same as darwin - see [step 2 in adding darwin host](#step-2-add-host-key-to-sopsyaml).

### step 3: create nixos configuration

create `configurations/nixos/{hostname}/default.nix`:

```nix
{ flake, pkgs, ... }:
let
  inherit (flake) config inputs;
  inherit (inputs) self;
  adminUser = config.crs58;  # or appropriate admin
in
{
  imports = [
    self.nixosModules.default
    ./hardware-configuration.nix  # generated by nixos-generate-config
  ];

  # basic system config
  networking.hostName = "newhostname";

  # admin user
  users.users.${adminUser.username} = {
    isNormalUser = true;
    extraGroups = [ "wheel" "networkmanager" ];
    home = "/home/${adminUser.username}";
    openssh.authorizedKeys.keys = [ adminUser.sshKey ];
  };

  # integrated home-manager for admin
  home-manager.users.${adminUser.username} = {
    imports = [ self.homeModules.default ];
    home.stateVersion = "23.11";
  };

  # nixos system settings
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  networking.networkmanager.enable = true;
  time.timeZone = "America/New_York";

  services.openssh = {
    enable = true;
    settings.PasswordAuthentication = false;
  };

  system.stateVersion = "23.11";
}
```

also create `configurations/nixos/{hostname}/hardware-configuration.nix`:

```bash
# on the nixos host
sudo nixos-generate-config --root /mnt  # if installing
# OR
sudo nixos-generate-config --show-hardware-config > hardware-configuration.nix
```

### step 4: bootstrap nixos

**remote bootstrap** (from your dev machine):

```bash
# copy config to new host
rsync -avz --exclude='.direnv' --exclude='result' \
  ~/nix-config/ newhost:/tmp/nix-config/

# ssh to new host and activate
ssh newhost
cd /tmp/nix-config
sudo nixos-rebuild switch --flake .#newhostname
```

**OR use justfile helper:**

```bash
# from dev machine
just nixos-vm-sync user newhost
ssh user@newhost "cd ~/nix-config && sudo nixos-rebuild switch --flake .#newhostname"
```

### step 5: configure sops-nix for nixos

ensure your nixos configuration includes sops-nix module:

```nix
# in configurations/nixos/{hostname}/default.nix
{
  imports = [
    self.nixosModules.default
    inputs.sops-nix.nixosModules.sops
    ./hardware-configuration.nix
  ];

  # sops configuration
  sops.defaultSopsFile = ../../../secrets/hosts/${config.networking.hostName}/config.yaml;
  sops.age.keyFile = "/var/lib/sops-nix/key.txt";
  # OR use host ssh key directly:
  # sops.age.sshKeyPaths = [ "/etc/ssh/ssh_host_ed25519_key" ];

  # example secret usage
  sops.secrets."github-token" = {
    owner = config.users.users.${adminUser.username}.name;
  };
}
```

### step 6: verify

```bash
# test sops can decrypt
sops -d secrets/hosts/newhostname/config.yaml

# verify runtime secrets
ls -la /run/secrets/
```

---

## secrets management workflow

### creating secrets

#### shared secrets

```bash
# edit shared secrets file
sops secrets/shared.yaml

# add new key-value pairs:
# github-token: ghp_xxxxxxxxxxxx
# api-key: sk-xxxxxxxxxxxx
```

#### user-specific secrets

```bash
# for user bob
mkdir -p secrets/users/bob
sops secrets/users/bob/config.yaml

# or hash-encrypted user secrets (content-based naming)
just hash-encrypt ~/Downloads/bob-config.yaml bob
```

#### host-specific secrets

```bash
# for host newhostname
mkdir -p secrets/hosts/newhostname
sops secrets/hosts/newhostname/config.yaml
```

### updating encryption keys

when adding new users/hosts to `.sops.yaml`, re-encrypt secrets:

```bash
# update specific file
sops updatekeys secrets/shared.yaml

# update all secrets
find secrets -name "*.yaml" -not -name ".sops.yaml" -exec sops updatekeys {} \;

# verify all secrets decrypt
just validate-secrets
```

### accessing secrets in nix

#### in nixos/darwin system config

```nix
{
  sops.secrets."github-token" = {
    owner = config.users.users.${adminUser.username}.name;
    mode = "0400";
  };

  # use in systemd service
  systemd.services.myservice = {
    script = ''
      TOKEN=$(cat ${config.sops.secrets."github-token".path})
      echo "Using token: $TOKEN"
    '';
  };
}
```

#### in home-manager

```nix
{
  sops.secrets."api-key" = {
    path = "${config.home.homeDirectory}/.config/myapp/api-key";
  };

  # use in program config
  programs.myapp.settings = {
    api_key_file = config.sops.secrets."api-key".path;
  };
}
```

### secret rotation

```bash
# rotate all secrets (re-encrypt with latest keys)
find secrets -name "*.yaml" -exec sops rotate -i {} \;

# rotate specific secret file
sops rotate -i secrets/shared.yaml
```

### justfile commands for secrets

```bash
# show decrypted secrets
just show

# edit secret file
just edit-secret secrets/shared.yaml

# create new secret file
just new-secret secrets/users/newuser/config.yaml

# get specific secret value
just get-shared-secret github-token

# run command with secrets as env vars
just run-with-secrets 'echo $GITHUB_TOKEN'

# validate all secrets can decrypt
just validate-secrets

# hash-encrypt a file (content-based naming)
just hash-encrypt ~/Downloads/sensitive.yaml username

# verify hash integrity
just verify-hash original.yaml secrets/users/crs58/ABC123-config.yaml
```

---

## ssh key management with bitwarden

this configuration uses bitwarden as the primary ssh agent, providing centralized key management across all hosts.

### creating ssh keys for new users

**recommended workflow:**

1. **generate ssh key locally:**
```bash
# use ed25519 for modern security
ssh-keygen -t ed25519 -C "user@hostname" -f ~/.ssh/id_ed25519_user

# display public key
cat ~/.ssh/id_ed25519_user.pub
```

2. **store in bitwarden:**
- create new "SSH Key" item in bitwarden vault
- name: `ssh-key-{username}-{hostname}`
- paste private key: `cat ~/.ssh/id_ed25519_user`
- paste public key in notes: `cat ~/.ssh/id_ed25519_user.pub`

3. **configure bitwarden ssh agent:**
- in bitwarden desktop app: Settings → SSH agent
- enable "Use SSH agent"
- add the ssh key item to authorized keys list

4. **update config.nix with public key:**
```nix
{
  newuser = {
    username = "newuser";
    sshKey = "ssh-ed25519 AAAA... user@hostname";  # from bitwarden
  };
}
```

### using ssh keys from bitwarden

once configured, ssh operations automatically use bitwarden:

```bash
# verify bitwarden ssh agent is active
echo $SSH_AUTH_SOCK
# darwin: /Users/{user}/Library/Containers/com.bitwarden.desktop/Data/.bitwarden-ssh-agent.sock

# list available keys
ssh-add -L

# ssh operations use bitwarden automatically
ssh git@github.com
git clone git@github.com:user/repo.git
```

### converting ssh keys to age keys

for sops-nix, we use age keys (not ssh keys directly):

```bash
# derive age public key from ssh public key (informational only)
ssh-to-age < ~/.ssh/id_ed25519_user.pub
# age1abc...xyz

# BUT: we generate separate age keys for sops
age-keygen -o ~/.config/sops/age/keys.txt

# store age private key in bitwarden as secure note
# name: "age-key-{username}"
```

**important**: ssh keys and age keys serve different purposes:
- **ssh keys**: authentication (stored in bitwarden, used via ssh agent)
- **age keys**: secrets encryption (stored in `~/.config/sops/age/keys.txt`, backed up in bitwarden)

### host ssh keys

host ssh keys are used for:
1. ssh server identity
2. deriving age keys for sops-nix host encryption

```bash
# on host, get ssh public key
sudo cat /etc/ssh/ssh_host_ed25519_key.pub

# convert to age public key for .sops.yaml
sudo cat /etc/ssh/ssh_host_ed25519_key.pub | ssh-to-age
```

**backup host private ssh key to bitwarden:**

```bash
# on host, copy private key
sudo cat /etc/ssh/ssh_host_ed25519_key

# store in bitwarden vault as secure note:
# name: "ssh-host-key-{hostname}"
# note: THIS IS SENSITIVE - host identity key
```

---

## troubleshooting

### sops decryption fails

**symptom**: `error: no key found`

**solutions:**

1. verify age key exists and has correct permissions:
```bash
ls -la ~/.config/sops/age/keys.txt
# should be: -rw------- (600)
chmod 600 ~/.config/sops/age/keys.txt
```

2. verify your public key is in `.sops.yaml`:
```bash
age-keygen -y ~/.config/sops/age/keys.txt
grep $(age-keygen -y ~/.config/sops/age/keys.txt) .sops.yaml
```

3. verify admin updated keys after adding you:
```bash
# admin should run:
sops updatekeys secrets/shared.yaml
```

### bitwarden ssh agent not working

**symptom**: `SSH_AUTH_SOCK` not set or ssh fails

**solutions:**

1. verify bitwarden desktop app is running
2. check ssh agent is enabled in bitwarden settings
3. verify socket exists:
```bash
# darwin
ls -la ~/Library/Containers/com.bitwarden.desktop/Data/.bitwarden-ssh-agent.sock

# linux
ls -la ~/.bitwarden-ssh-agent.sock
```

4. manually set SSH_AUTH_SOCK if needed:
```bash
# darwin
export SSH_AUTH_SOCK="$HOME/Library/Containers/com.bitwarden.desktop/Data/.bitwarden-ssh-agent.sock"

# linux
export SSH_AUTH_SOCK="$HOME/.bitwarden-ssh-agent.sock"
```

### activation fails for non-admin user

**symptom**: `permission denied` or `sudo required`

**solution**: ensure using standalone home-manager config:

```bash
# correct: standalone home-manager (no sudo)
nix run . user@hostname

# incorrect: trying to activate system config (needs sudo)
nix run . hostname  # only admin can do this
```

### host secrets not accessible

**symptom**: `/run/secrets/{secret}` doesn't exist

**solutions:**

1. verify host age key is in `.sops.yaml`:
```bash
# on host
sudo cat /etc/ssh/ssh_host_ed25519_key.pub | ssh-to-age

# check in .sops.yaml
grep $(sudo cat /etc/ssh/ssh_host_ed25519_key.pub | ssh-to-age) .sops.yaml
```

2. verify host is in appropriate creation_rules:
```bash
# check .sops.yaml has rule for hosts/{hostname}/*
```

3. re-encrypt host secrets:
```bash
sops updatekeys secrets/hosts/{hostname}/config.yaml
```

4. rebuild system:
```bash
# darwin
nix run . hostname

# nixos
sudo nixos-rebuild switch --flake .#hostname
```

### autowiring not detecting configs

**symptom**: `nix flake show` doesn't list expected configurations

**solutions:**

1. verify file naming:
   - darwin: `configurations/darwin/{hostname}.nix` or `configurations/darwin/{hostname}/default.nix`
   - home: `configurations/home/{user}@{hostname}.nix`
   - nixos: `configurations/nixos/{hostname}.nix` or `configurations/nixos/{hostname}/default.nix`

2. verify flake has autowiring enabled:
```nix
# in modules/flake-parts/nixos-flake.nix
{
  imports = [
    inputs.nixos-unified.flakeModules.default
    inputs.nixos-unified.flakeModules.autoWire
  ];
}
```

3. check for syntax errors:
```bash
nix flake check
```

### age key recovery

**if you lose your age key:**

1. retrieve from bitwarden backup:
```bash
# find secure note: "age-key-{username}"
# copy private key content
mkdir -p ~/.config/sops/age
cat > ~/.config/sops/age/keys.txt
# paste key, ctrl-d
chmod 600 ~/.config/sops/age/keys.txt
```

2. verify recovery:
```bash
age-keygen -y ~/.config/sops/age/keys.txt
sops -d secrets/shared.yaml
```

3. if no backup exists, admin can re-encrypt secrets with your new key:
```bash
# generate new key
age-keygen -o ~/.config/sops/age/keys.txt
age-keygen -y ~/.config/sops/age/keys.txt  # send to admin

# admin updates .sops.yaml with new key
# admin runs: sops updatekeys secrets/shared.yaml
```

---

## security checklist

### for admin

when adding new users/hosts:

- [ ] verify user identity before adding to secrets
- [ ] add only necessary keys to `.sops.yaml` creation rules (principle of least privilege)
- [ ] run `sops updatekeys` on all relevant secret files
- [ ] verify new user can decrypt before committing
- [ ] store admin recovery key in bitwarden
- [ ] document which users have access to which secrets
- [ ] review `.sops.yaml` changes carefully in PRs

when removing users:

- [ ] remove user's age key from `.sops.yaml`
- [ ] rotate all secrets user had access to
- [ ] run `sops updatekeys` to re-encrypt without removed key
- [ ] revoke user's ssh access to hosts
- [ ] audit for any remaining references to user

### for users

- [ ] generate strong age key: `age-keygen -o ~/.config/sops/age/keys.txt`
- [ ] backup age private key to bitwarden immediately
- [ ] verify backup by restoring and testing decryption
- [ ] set correct permissions: `chmod 600 ~/.config/sops/age/keys.txt`
- [ ] never commit private keys to git
- [ ] never share private keys (only public keys)
- [ ] use bitwarden ssh agent for all ssh operations
- [ ] regularly test secret decryption: `sops -d secrets/shared.yaml`

### for hosts

- [ ] verify host ssh key exists before deriving age key
- [ ] backup host ssh private key to bitwarden (labeled clearly)
- [ ] never regenerate host ssh key without updating all encrypted secrets
- [ ] verify host can decrypt its secrets after configuration
- [ ] monitor `/run/secrets/` for unexpected secret access
- [ ] rotate host keys periodically (requires re-encrypting all host secrets)

### general

- [ ] audit `.sops.yaml` changes in every PR
- [ ] never commit unencrypted secrets (check with `git diff` before committing)
- [ ] verify `.gitignore` includes `*.dec.yaml`, `*.age`, `keys.txt`
- [ ] schedule quarterly secret rotation
- [ ] document emergency recovery procedures
- [ ] test recovery procedures periodically
- [ ] use content-based naming (`just hash-encrypt`) for sensitive config files
- [ ] keep admin recovery key and SOPS_AGE_CI_KEY current in bitwarden

---

## quick reference

### adding admin user on new darwin host

```bash
# 1. define in config.nix
# newadmin = { username = "newadmin"; ... }

# 2. generate age key
age-keygen -o ~/.config/sops/age/keys.txt
age-keygen -y ~/.config/sops/age/keys.txt  # note public key

# 3. backup to bitwarden
# store private key as "age-key-newadmin"

# 4. get host ssh key
sudo cat /etc/ssh/ssh_host_ed25519_key.pub | ssh-to-age  # note output

# 5. admin updates .sops.yaml with both keys

# 6. create configurations/darwin/newhostname.nix

# 7. admin re-encrypts secrets
find secrets -name "*.yaml" -exec sops updatekeys {} \;

# 8. activate
nix run . newhostname
```

### adding non-admin user on existing host

```bash
# 1. define in config.nix
# bob = { username = "bob"; isAdmin = false; ... }

# 2. generate age key
age-keygen -o ~/.config/sops/age/keys.txt
age-keygen -y ~/.config/sops/age/keys.txt  # note public key

# 3. backup to bitwarden
# store private key as "age-key-bob"

# 4. admin updates .sops.yaml with user key

# 5. create configurations/home/bob@hostname.nix

# 6. admin re-encrypts relevant secrets
sops updatekeys secrets/shared.yaml

# 7. activate (as bob, no sudo)
nix run . bob@hostname
```

### emergency secret recovery

```bash
# 1. retrieve admin key from bitwarden
export SOPS_AGE_KEY="AGE-SECRET-KEY-1..."

# 2. decrypt secrets
sops -d secrets/shared.yaml

# 3. if needed, create new key and re-encrypt
age-keygen -o ~/.config/sops/age/keys.txt
# update .sops.yaml
sops rotate -i secrets/shared.yaml
```

### useful commands

```bash
# verify configuration
nix flake check

# list all configurations
nix flake show

# test build without activation
nix build .#darwinConfigurations.hostname.system
nix build .#homeConfigurations."user@hostname".activationPackage

# validate all secrets
just validate-secrets

# show all users in config.nix
nix eval .#flake.config --apply builtins.attrNames

# check who can decrypt a secret
sops -d --verbose secrets/shared.yaml 2>&1 | grep "age"
```

---

## further reading

- [nix-config-architecture-analysis.md](./nix-config-architecture-analysis.md) - multi-user/host architecture design
- [sops-quick-reference.md](./sops-quick-reference.md) - sops-nix daily operations
- [sops-team-onboarding.md](./sops-team-onboarding.md) - team collaboration with sops
- [nixos-unified autowiring](https://github.com/srid/nixos-unified/blob/main/doc/guide/autowiring.md) - configuration discovery
- [sops-nix documentation](https://github.com/Mic92/sops-nix) - official sops-nix docs
- [age encryption](https://github.com/FiloSottile/age) - age encryption tool
