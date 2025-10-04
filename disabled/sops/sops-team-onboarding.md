# sops-nix Team Onboarding Checklist

## New Team Member Setup

### Prerequisites
- [ ] Access to this repository
- [ ] Nix installed with flakes enabled
- [ ] nixos-unified development environment

### Step-by-Step Setup

#### 1. Development Environment
```bash
# Clone and enter repository
git clone <repo-url>
cd nix-config

# Enter development environment
nix develop
# Or if using direnv:
direnv allow
```

#### 2. Generate Age Key
```bash
# Create age key for secret access
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt

# Display public key (send this to admin)
echo "My public key:"
grep "public key:" ~/.config/sops/age/keys.txt
```

#### 3. Request Access
- [ ] Send public key to repository admin
- [ ] Wait for admin to add you to `.sops.yaml`
- [ ] Admin will notify when access is granted

#### 4. Test Your Access
```bash
# Test basic functionality
./scripts/test-sops-nixos-unified.sh

# Test secret decryption
sops -d secrets/test-secret.yaml
```

#### 5. Host-Specific Setup

**If you have a new host to add:**
```bash
# Get your host's SSH key
sudo cat /etc/ssh/ssh_host_ed25519_key.pub | ssh-to-age

# Send this key to admin to add to configuration
```

#### 6. Verification
- [ ] Can decrypt common secrets
- [ ] Can rebuild your host configuration
- [ ] All tests pass

### Admin Tasks (for admins)

#### Adding New Team Member
```bash
# 1. Edit .sops.yaml
sops secrets/.sops.yaml
# Add their public key under 'keys:' section
# Add reference in appropriate 'creation_rules:' sections

# 2. Update all existing secret files
find secrets -name "*.yaml" -not -name ".sops.yaml" -exec sops updatekeys {} \;

# 3. Test the new member can decrypt
# (have them run the test script)
```

#### Adding New Host
```bash
# 1. Get host key from new host
# ssh newhost "sudo cat /etc/ssh/ssh_host_ed25519_key.pub | ssh-to-age"

# 2. Add to .sops.yaml
sops secrets/.sops.yaml
# Add key under 'keys:' section
# Add to creation_rules for appropriate files

# 3. Update secrets for the new host
sops updatekeys secrets/common.yaml
# (repeat for other files the host should access)
```

## Common Issues

### "No keys found" error
**Solution**: Check that `~/.config/sops/age/keys.txt` exists and has correct permissions (600).

### "Cannot decrypt" after being added
**Solution**: Admin needs to run `sops updatekeys` on the secret files after adding your key.

### Host-specific secrets not working
**Solution**: Verify the host SSH key is correctly extracted and added to `.sops.yaml`.

### Development environment missing sops tools  
**Solution**: Make sure you're in the nix development shell: `nix develop`

## Security Reminders

- Never share your private age key (`~/.config/sops/age/keys.txt`)
- Never commit unencrypted secrets to the repository
- Store the admin recovery key in the team password manager
- Rotate secrets when team members leave
- Review changes to `.sops.yaml` carefully in PRs

## Getting Help

1. Run the test script: `./scripts/test-sops-nixos-unified.sh`
2. Check this documentation
3. Ask in the team channel
4. Create an issue in the repository

## Host-Specific Notes

### macbook-darwin
- Personal development environment
- Access to personal and shared secrets
- Use for testing changes before deploying to other hosts

### orb-nixos  
- NixOS container/VM environment
- Good for testing NixOS-specific configurations
- May need different secret access patterns than Darwin

### MGB033059
- Work environment with restricted access
- Work-specific secrets only
- May require VPN or special network access for some operations

## Development Workflow

### Making Changes
1. Edit secrets on any host where you have access
2. Test changes locally: `./scripts/test-sops-nixos-unified.sh`
3. Commit encrypted changes to git
4. Other hosts automatically get updates on next rebuild

### Secret Organization
- `secrets/common.yaml`: Shared across all hosts
- `secrets/hosts/*/`: Host-specific secrets  
- `secrets/services/*/`: Service-specific secrets
- Follow existing patterns when adding new secrets

### Testing Changes
Always test configuration changes before pushing:
```bash
# Check flake validity
nix flake check

# Test build without activation
sudo nixos-rebuild build --flake .#<host>  # NixOS
darwin-rebuild build --flake .#<host>     # Darwin  
home-manager build --flake .#<user>@<host> # Home Manager

# Full test of sops integration
./scripts/test-sops-nixos-unified.sh
```