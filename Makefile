# nix-config bootstrap makefile
#
# tl;dr:
#
# 1. Run 'make bootstrap' to install nix and direnv
# 2. Run 'make verify' to check your installation
# 3. Run 'make setup-user' to generate age keys for secrets (first time only)
# 4. Run 'nix develop' to enter the development environment
# 5. Use 'just ...' to run configuration tasks
#
# This Makefile helps bootstrap a development environment with nix and direnv.
# After bootstrap is complete, see the justfile for managing configurations.

.DEFAULT_GOAL := help

#-------
##@ help
#-------

# based on "https://gist.github.com/prwhite/8168133?permalink_comment_id=4260260#gistcomment-4260260"
.PHONY: help
help: ## Display this help. (Default)
	@grep -hE '^(##@|[A-Za-z0-9_ \-]*?:.*##).*$$' $(MAKEFILE_LIST) | \
	awk 'BEGIN {FS = ":.*?## "}; /^##@/ {print "\n" substr($$0, 5)} /^[A-Za-z0-9_ \-]*?:.*##/ {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

help-sort: ## Display alphabetized version of help (no section headings).
	@grep -hE '^[A-Za-z0-9_ \-]*?:.*##.*$$' $(MAKEFILE_LIST) | sort | \
	awk 'BEGIN {FS = ":.*?## "}; /^[A-Za-z0-9_ \-]*?:.*##/ {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

HELP_TARGETS_PATTERN ?= test
help-targets: ## Print commands for all targets matching a given pattern. Copy this example into your shell:
help-targets: ## Copy this example into your shell:
help-targets: ## eval "$(make help-targets HELP_TARGETS_PATTERN=bootstrap | sed 's/\x1b\[[0-9;]*m//g')"
	@make help-sort | awk '{print $$1}' | grep '$(HELP_TARGETS_PATTERN)' | xargs -I {} printf "printf '___\n\n{}:\n\n'\nmake -n {}\nprintf '\n'\n"

# catch-all pattern rule
#
# This rule matches any targets that are not explicitly defined in this
# Makefile. It prevents 'make' from failing due to unrecognized targets, which
# is particularly useful when passing arguments or targets to sub-Makefiles. The
# '@:' command is a no-op, indicating that nothing should be done for these
# targets within this Makefile.
#
%:
	@:

#-------
##@ bootstrap
#-------

.PHONY: bootstrap
bootstrap: ## Main bootstrap target that runs all necessary setup steps
bootstrap: install-nix install-direnv
	@printf "\n✅ Bootstrap of nix and direnv complete!\n\n"
	@printf "Next steps:\n"
	@echo "1. Start a new shell session (to load nix in PATH)"
	@echo "2. Run 'make verify' to check your installation"
	@echo "3. Run 'make setup-user' to generate age keys (first time setup)"
	@echo "4. Run 'nix develop' to enter the development environment"
	@echo ""
	@printf "Optional: Auto-activate development environment with direnv\n"
	@echo "  - See https://direnv.net/docs/hook.html to add direnv to your shell"
	@echo "  - Start a new shell session"
	@echo "  - cd out and back into the project directory"
	@echo "  - Run 'direnv allow' to activate"
	@echo ""
	@printf "For detailed documentation, see docs/new-user-host.md\n"

.PHONY: install-nix
install-nix: ## Install Nix using the Determinate Systems installer
	@echo "Installing Nix..."
	@if command -v nix >/dev/null 2>&1; then \
		echo "Nix is already installed."; \
	else \
		curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install --no-confirm; \
	fi

.PHONY: install-direnv
install-direnv: ## Install direnv (requires nix to be installed first)
	@echo "Installing direnv..."
	@if command -v direnv >/dev/null 2>&1; then \
		echo "direnv is already installed."; \
	else \
		. /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh && nix-env -iA nixpkgs.direnv; \
	fi
	@echo ""
	@echo "See https://direnv.net/docs/hook.html if you would like to add direnv to your shell"

#-------
##@ verify
#-------

.PHONY: verify
verify: ## Verify nix installation and environment setup
	@printf "\nVerifying installation...\n\n"
	@printf "Checking nix installation: "
	@if command -v nix >/dev/null 2>&1; then \
		printf "✅ nix found at %s\n" "$$(command -v nix)"; \
		nix --version; \
	else \
		printf "❌ nix not found\n"; \
		printf "Run 'make install-nix' to install nix\n"; \
		exit 1; \
	fi
	@printf "\nChecking nix flakes support: "
	@if nix flake --help >/dev/null 2>&1; then \
		printf "✅ flakes enabled\n"; \
	else \
		printf "❌ flakes not enabled\n"; \
		exit 1; \
	fi
	@printf "\nChecking direnv installation: "
	@if command -v direnv >/dev/null 2>&1; then \
		printf "✅ direnv found\n"; \
	else \
		printf "⚠️  direnv not found (optional but recommended)\n"; \
		printf "Run 'make install-direnv' to install\n"; \
	fi
	@printf "\nChecking flake validity: "
	@if nix flake metadata . >/dev/null 2>&1; then \
		printf "✅ flake is valid\n"; \
	else \
		printf "❌ flake has errors\n"; \
		exit 1; \
	fi
	@printf "\nChecking required tools in devShell: "
	@if nix develop --command bash -c 'command -v age-keygen && command -v ssh-to-age && command -v sops && command -v just' >/dev/null 2>&1; then \
		printf "✅ age-keygen, ssh-to-age, sops, just available\n"; \
	else \
		printf "❌ some tools missing from devShell\n"; \
		exit 1; \
	fi
	@printf "\n✅ All verification checks passed!\n\n"

#-------
##@ setup
#-------

.PHONY: setup-user
setup-user: ## Generate age key for sops-nix secrets (first time user setup)
	@printf "\nGenerating age key for secrets management...\n\n"
	@if [ -f ~/.config/sops/age/keys.txt ]; then \
		printf "⚠️  Age key already exists at ~/.config/sops/age/keys.txt\n"; \
		printf "To regenerate, manually delete the file first\n"; \
		printf "\nYour public key is:\n"; \
		age-keygen -y ~/.config/sops/age/keys.txt 2>/dev/null || printf "Error reading existing key\n"; \
	else \
		mkdir -p ~/.config/sops/age; \
		age-keygen -o ~/.config/sops/age/keys.txt; \
		chmod 600 ~/.config/sops/age/keys.txt; \
		printf "\n✅ Age key generated successfully!\n\n"; \
		printf "Your public key is:\n"; \
		age-keygen -y ~/.config/sops/age/keys.txt; \
		printf "\n⚠️  IMPORTANT: Back up your private key to Bitwarden!\n"; \
		printf "1. Copy the content of ~/.config/sops/age/keys.txt\n"; \
		printf "2. Store in Bitwarden as secure note: 'age-key-<username>'\n"; \
		printf "3. Send your PUBLIC key (shown above) to the admin\n"; \
		printf "\nSee docs/new-user-host.md for complete setup instructions\n"; \
	fi

.PHONY: check-secrets
check-secrets: ## Check if you can decrypt shared secrets (requires age key and admin setup)
	@printf "\nChecking secrets access...\n\n"
	@if [ ! -f ~/.config/sops/age/keys.txt ]; then \
		printf "❌ No age key found. Run 'make setup-user' first\n"; \
		exit 1; \
	fi
	@if nix develop --command sops -d secrets/shared.yaml >/dev/null 2>&1; then \
		printf "✅ Successfully decrypted shared secrets!\n"; \
		printf "You have proper access to the secrets system\n"; \
	else \
		printf "❌ Cannot decrypt shared secrets\n"; \
		printf "Possible reasons:\n"; \
		printf "1. Admin hasn't added your key to .sops.yaml yet\n"; \
		printf "2. Admin hasn't run 'sops updatekeys' after adding you\n"; \
		printf "3. Your age key is incorrect\n"; \
		printf "\nSend your public key to admin:\n"; \
		age-keygen -y ~/.config/sops/age/keys.txt; \
		exit 1; \
	fi

#-------
##@ clean
#-------

.PHONY: clean
clean: ## Clean any temporary files or build artifacts
	@echo "Cleaning up..."
	@rm -rf result result-*
