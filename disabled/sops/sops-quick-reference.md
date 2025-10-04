# sops-nix Quick Reference

## Essential Commands

### Daily Operations
```bash
# View secrets (decrypted)
sops -d secrets/shared.yaml

# Edit secrets
sops secrets/shared.yaml

# Add a new secret to existing file
sops secrets/shared.yaml
# Then add your key: value pair

# Test decryption
sops -d secrets/shared.yaml > /dev/null && echo "Success!"
```

### Key Management
```bash
# Show your public age key
age-keygen -y ~/.config/sops/age/keys.txt

# Get host's age public key
sudo cat /etc/ssh/ssh_host_ed25519_key.pub | ssh-to-age

# Rotate keys for all secrets
find secrets -name "*.yaml" -exec sops rotate -i {} \;
```

### In Nix Configurations
```nix
# Access a secret in a systemd service
systemd.services.myservice = {
  script = ''
    export TOKEN=$(cat ${config.sops.secrets.github-token.path})
    # Use $TOKEN
  '';
};

# Access in home-manager
home.sessionVariables = {
  GITHUB_TOKEN = "$(cat ${config.sops.secrets.github-token.path})";
};
```

## File Locations

| Item | Location |
|------|----------|
| User age key | `~/.config/sops/age/keys.txt` |
| Host age key | Auto-generated from `/etc/ssh/ssh_host_ed25519_key` |
| Secrets config | `secrets/.sops.yaml` |
| Shared secrets | `secrets/shared.yaml` |
| Host secrets | `secrets/hosts/<hostname>.yaml` |
| Service secrets | `secrets/services/<service>.yaml` |
| Runtime secrets | `/run/secrets/<secret-name>` (on NixOS/Darwin) |

## Emergency Recovery

If you lose access to secrets:

1. **Recover with admin key from Bitwarden:**
```bash
# Export admin private key from Bitwarden
export SOPS_AGE_KEY="AGE-SECRET-KEY-1..."

# Decrypt secrets
sops -d secrets/shared.yaml

# Re-encrypt with new keys if needed
sops rotate -i secrets/shared.yaml
```

2. **Recover with backup user key:**
```bash
# Restore backup key
cp /path/to/backup/keys.txt ~/.config/sops/age/keys.txt
chmod 600 ~/.config/sops/age/keys.txt

# Test access
sops -d secrets/shared.yaml
```

## Troubleshooting

### "Could not decrypt file"
- Check key file exists: `ls -la ~/.config/sops/age/keys.txt`
- Verify permissions: Should be 600
- Confirm key is in .sops.yaml

### "No matching creation rules"
- Check .sops.yaml path_regex matches your file
- Ensure file is in correct directory

### Secret not available at runtime
- Verify sops module is enabled in configuration
- Check secret name matches exactly
- Rebuild and switch: `nix run .#activate`

### CI/CD failures
- Ensure SOPS_AGE_CI_KEY is set in GitHub secrets
- Verify CI key is included in .sops.yaml

## Migration from Teller

```bash
# Quick migration (interactive)
./docs/sops-migration-script.sh

# Or manual steps:
1. just export                     # Export from teller
2. age-keygen > admin-key.txt      # Generate admin key
3. vim secrets/.sops.yaml          # Configure keys
4. sops secrets/shared.yaml        # Create encrypted secrets
5. nix run .#activate              # Deploy configuration
```

## Security Checklist

- [ ] Admin key stored in Bitwarden
- [ ] User key backed up securely
- [ ] No private keys in git repo
- [ ] .gitignore includes `*.dec.yaml` and `*.age`
- [ ] Regular key rotation scheduled
- [ ] Team members have documented access
- [ ] Emergency recovery procedure tested

## Best Practices

1. **Separate secrets by scope:**
   - Shared: API tokens, shared credentials
   - Host-specific: Machine-specific configs
   - Service-specific: Per-service credentials

2. **Use runtime paths, not build-time:**
   ```nix
   # Good - secret loaded at runtime
   environment.GITHUB_TOKEN_FILE = config.sops.secrets.github-token.path;
   
   # Bad - would embed secret in nix store
   environment.GITHUB_TOKEN = builtins.readFile config.sops.secrets.github-token.path;
   ```

3. **Rotate regularly:**
   - Quarterly for standard secrets
   - Immediately after personnel changes
   - After any security incident

4. **Document everything:**
   - Which secrets are where
   - Who has access
   - Recovery procedures