# kanidm IdP for magnetite — server scaffold + nginx-fronted TLS + OAuth2 synapse client.
#
# Shape: nginx terminates public TLS via ACME (enableACME = true on the kanidm
# vhost) and reverse-proxies to kanidm bound on 127.0.0.1:8443. kanidm reads the
# same cert material from the filesystem at ${certs.directory}/{fullchain,key}.pem;
# access is granted by adding the kanidm service to the cert's ACL group via
# SupplementaryGroups = [ certs.group ]. This matches the canonical pattern in
# clan-infra/modules/web02/kanidm.nix and
# jfly-clan-snow/machines/fflewddur/kanidm/default.nix. Reading cert material from
# the filesystem rather than via LoadCredential avoids two nixpkgs ACME assertions
# that LoadCredential alone failed at deploy time, and provides no rotation
# downside since kanidm holds the TLS chain in process memory and requires restart
# for rotation either way. Hostname is a literal FQDN; package is pinned to
# kanidmWithSecretProvisioning_1_11.
#
# Clan-vars secret generators (admin-password, idm-admin-password, oauth2-synapse)
# declared inline below; admin passwords are wired into
# services.kanidm.provision.{admin,idmAdmin}PasswordFile, and the oauth2 secret
# is bound to services.kanidm.provision.systems.oauth2.synapse.basicSecretFile.
# The oauth2-synapse generator declares restartUnits = [ "kanidm.service"
# "matrix-synapse.service" ] per the LoadCredential snapshot-staleness invariant
# (memory: reference_loadcredential-snapshot-staleness). Both restarts are
# required: kanidm re-runs provision to update the OAuth2 RS database,
# matrix-synapse re-reads the secret via LoadCredential.
#
# Cameron's kanidm account is intentionally not declared via provision.persons
# (declarative person records are destructive on re-provision); creation is
# operational.
{
  config,
  inputs,
  ...
}:
let
  brandLogo = config.flake.brand.logo;
in
{
  flake.modules.nixos.kanidm =
    {
      config,
      pkgs,
      lib,
      ...
    }:
    let
      domain = "accounts.scientistexperience.net";
      certs = config.security.acme.certs."${domain}";
    in
    {
      # Admin password: auto-generated via xkcdpass at >80 bits entropy
      # (7 words × ~12.82 bits/word ≈ 89.7 bits, well above the 80-bit floor for
      # passphrases with any online attack surface). restartUnits propagates
      # secret rotation into a kanidm.service restart, so the postStartScript's
      # `kanidmd scripting recover-account` re-runs with the new file contents
      # at deploy time rather than waiting for the next reboot. Without this,
      # `clan machines update magnetite` would leave the new password on disk
      # while the running kanidm still has the old password in its database.
      clan.core.vars.generators.kanidm-admin-password = {
        files."password" = {
          secret = true;
          owner = "kanidm";
          group = "kanidm";
          mode = "0440";
          restartUnits = [ "kanidm.service" ];
        };
        runtimeInputs = [ pkgs.xkcdpass ];
        script = ''
          xkcdpass --numwords 7 --delimiter - > "$out/password"
        '';
      };

      # idm_admin password: auto-generated via xkcdpass at >80 bits entropy
      # (7 words × ~12.82 bits/word ≈ 89.7 bits). idm_admin is the operator-tier
      # account used by kanidm-provision (kanidm.service ExecStartPost) for
      # declarative entity management (oauth2 systems, groups). restartUnits
      # ensures rotation re-runs provision against the new credential.
      clan.core.vars.generators.kanidm-idm-admin-password = {
        files."password" = {
          secret = true;
          owner = "kanidm";
          group = "kanidm";
          mode = "0440";
          restartUnits = [ "kanidm.service" ];
        };
        runtimeInputs = [ pkgs.xkcdpass ];
        script = ''
          xkcdpass --numwords 7 --delimiter - > "$out/password"
        '';
      };

      # Synapse OAuth2 client basic-auth secret: openssl-random hex. Owned by
      # kanidm:kanidm because kanidm-provision (kanidm.service ExecStartPost)
      # reads the file directly as the kanidm user to upload the basic_secret
      # to the OAuth2 resource server. The matrix-synapse OIDC client consumes
      # the same file via LoadCredential in modules/nixos/matrix.nix;
      # LoadCredential is staged by systemd as root before privilege drop, so
      # the source-file ownership does not constrain the client side.
      # restartUnits propagates secret rotation through two channels: kanidm.service
      # restarts so kanidm-provision (ExecStartPost) re-uploads the new basic_secret
      # to kanidm's OAuth2 resource server database; matrix-synapse.service restarts
      # so the synapse OIDC client picks up the new secret via LoadCredential (which
      # snapshots at unit-start). Without the kanidm.service restart, the rotated
      # secret reaches matrix-synapse but kanidm's database still holds the old
      # secret, breaking OAuth2 token exchange with invalid_client. (memory:
      # reference_loadcredential-snapshot-staleness).
      clan.core.vars.generators.kanidm-oauth2-synapse = {
        files."secret" = {
          secret = true;
          owner = "kanidm";
          group = "kanidm";
          mode = "0400";
          restartUnits = [
            "kanidm.service"
            "matrix-synapse.service"
          ];
        };
        runtimeInputs = [ pkgs.openssl ];
        script = ''
          openssl rand -hex 32 > "$out/secret"
        '';
      };

      clan.core.vars.generators.kanidm-oauth2-omnigent = {
        files = {
          secret = {
            secret = true;
            owner = "kanidm";
            group = "kanidm";
            mode = "0400";
            restartUnits = [
              "kanidm.service"
              "omnigent.service"
            ];
          };
          env = {
            secret = true;
            owner = "omnigent";
            group = "omnigent";
            mode = "0400";
            restartUnits = [
              "kanidm.service"
              "omnigent.service"
            ];
          };
        };
        runtimeInputs = [ pkgs.openssl ];
        script = ''
          secret="$(openssl rand -hex 32)"
          printf '%s' "$secret" > "$out/secret"
          printf 'OMNIGENT_OIDC_CLIENT_SECRET=%s\n' "$secret" > "$out/env"
        '';
      };

      services.kanidm = {
        package = pkgs.kanidmWithSecretProvisioning_1_11;

        server.enable = true;

        server.settings = {
          inherit domain;
          origin = "https://${domain}";

          # Loopback bind; nginx fronts public TLS.
          bindaddress = "127.0.0.1:8443";

          # See real client IPs through the nginx reverse-proxy hop on 127.0.0.1.
          # V2 schema (nixpkgs forces version = "2"): legacy boolean
          # trust_x_forward_for was removed; trust is now expressed as a list
          # of CIDRs from which X-Forwarded-For is honored.
          http_client_address_info = {
            x-forward-for = [ "127.0.0.1" ];
          };

          # Cert material read directly from the ACME state directory; access
          # granted via SupplementaryGroups on the kanidm unit (see below). This
          # matches clan-infra/web02 and jfly-clan-snow/fflewddur.
          tls_chain = "${certs.directory}/fullchain.pem";
          tls_key = "${certs.directory}/key.pem";

          # nixpkgs emits path and schedule, but defaults versions to 0, which the
          # module treats as "backups disabled" (nixos/modules/services/security/
          # kanidm.nix: enableServerBackup gates on versions != 0).
          online_backup.versions = 7;
        };

        provision = {
          enable = true;

          # Destructive removal of state-only entities is disabled until cameron's
          # account is migrated.
          autoRemove = false;

          # Admin / idm_admin passwords from clan-vars generators above.
          adminPasswordFile = config.clan.core.vars.generators.kanidm-admin-password.files."password".path;
          idmAdminPasswordFile =
            config.clan.core.vars.generators.kanidm-idm-admin-password.files."password".path;

          groups = {
            # Group declared as a stub (members = [ ]) so it exists in entitiesByName for
            # scopeMaps.matrix_users to reference (nixpkgs kanidm.nix:876 referential check).
            # Membership is managed operationally via
            # `kanidm group add-members matrix_users <user>` because cameron's person record
            # is operational, and the nixpkgs assertion forbids declarative members that
            # reference non-declared entities. overwriteMembers = false preserves
            # operationally-added members across re-provisions. Reference patterns:
            # clan-infra/modules/web02/kanidm.nix:38-39 ("Don't declare any users here") and
            # jfly-clan-snow/fflewddur/kanidm:71 (overwriteMembers = false for imperative mgmt).
            matrix_users = {
              members = [ ];
              overwriteMembers = false;
            };
            omnigent_users = {
              members = [ ];
              overwriteMembers = false;
            };
          };

          systems.oauth2.synapse = {
            displayName = "Matrix";
            originUrl = "https://matrix.scientistexperience.net/_synapse/client/oidc/callback";
            # Direct matrix_users from the kanidm WebUI app tile to Cinny with
            # this homeserver pre-populated. Cinny documents a /login/<homeserver>
            # URL convention that selects the homeserver in one click (no manual
            # entry on first visit); the equivalent convention is not documented
            # for app.element.io. The client choice (Cinny) is decoupled from the
            # tile branding (see imageFile below) so the latter remains valid if
            # the landing target is later changed to a different matrix client.
            originLanding = "https://app.cinny.in/login/matrix.scientistexperience.net";
            # Client-agnostic matrix protocol logo for the tile: the tile name is
            # "Matrix" (the protocol) and the click destination is one specific
            # matrix client (Cinny today, possibly another later). Using the
            # protocol logo rather than a client-specific icon decouples the tile
            # branding from the client choice. Pinned to a recent commit of
            # matrix-org/matrix.org's own static asset (stable repo path,
            # permissively published as matrix.org's site branding).
            imageFile = pkgs.fetchurl {
              url = "https://raw.githubusercontent.com/matrix-org/matrix.org/683992f213311a672e3d52451ee3a2d70278a92e/static/images/matrix-logo.svg";
              hash = "sha256-Pt1BGbGmfQWJh8KWJ6/hs0uMgKc5K2JttggHaDQsNoM=";
            };
            preferShortUsername = true;
            scopeMaps.matrix_users = [
              "openid"
              "profile"
              "email"
            ];
            basicSecretFile = config.clan.core.vars.generators.kanidm-oauth2-synapse.files."secret".path;
          };

          systems.oauth2.omnigent = {
            displayName = "Omnigent";
            originUrl = "https://omni.scientistexperience.net/auth/callback";
            originLanding = "https://omni.scientistexperience.net";
            preferShortUsername = true;
            scopeMaps.omnigent_users = [
              "openid"
              "profile"
              "email"
            ];
            basicSecretFile = config.clan.core.vars.generators.kanidm-oauth2-omnigent.files.secret.path;
          };
        };
      };

      # Single ACME cert serves both nginx (public leg) and kanidm (loopback leg).
      # postRun restarts kanidm so cert rotation is picked up by the in-process TLS
      # loop (LoadCredential snapshots cert material at unit-start).
      security.acme.certs.${domain} = {
        postRun = "systemctl restart kanidm.service";
      };

      # Order kanidm after the ACME cert unit; grant filesystem access to the
      # cert material via SupplementaryGroups (clan-infra/web02 pattern).
      systemd.services.kanidm = {
        after = [ "acme-${domain}.service" ];
        serviceConfig.SupplementaryGroups = [ certs.group ];
      };

      # Site-level branding (display name + logo) is not exposed by kanidm-provision,
      # so it's applied imperatively via the admin REST API after kanidm-provision
      # completes. The unit reads the admin password via systemd LoadCredential and
      # uses the kanidm CLI's KANIDM_PASSWORD env-var (non-interactive). Display name
      # is a single space to suppress the default "Kanidm <domain>" header text; the
      # logo carries the brand alone.
      systemd.services.kanidm-site-branding = {
        description = "Apply kanidm site-level branding (display name + logo)";
        after = [ "kanidm.service" ];
        wants = [ "kanidm.service" ];
        wantedBy = [ "multi-user.target" ];
        path = [
          # Upstream requires the CLI to match the server minor exactly, so this
          # derives from the server package rather than pinning independently.
          config.services.kanidm.package
          pkgs.curl
        ];
        environment = {
          KANIDM_URL = "https://${domain}";
          KANIDM_NAME = "admin";
          KANIDM_TOKEN_CACHE_PATH = "%t/kanidm-site-branding/tokens";
          KANIDM_CA_PATH = "${certs.directory}/fullchain.pem";
        };
        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
          LoadCredential = "admin-password:${
            config.clan.core.vars.generators.kanidm-admin-password.files."password".path
          }";
          RuntimeDirectory = "kanidm-site-branding";
          RuntimeDirectoryMode = "0700";
        };
        script = ''
          export KANIDM_PASSWORD
          KANIDM_PASSWORD="$(< "$CREDENTIALS_DIRECTORY/admin-password")"

          for _ in $(seq 30); do
            if curl -sSf --max-time 1 --cacert "$KANIDM_CA_PATH" \
                "https://${domain}/status" >/dev/null 2>&1; then
              break
            fi
            sleep 1
          done

          kanidm login
          kanidm system domain set-displayname " "
          kanidm system domain set-image ${brandLogo}
        '';
      };

      services.nginx.virtualHosts.${domain} = {
        enableACME = true;
        forceSSL = true;
        locations."/" = {
          proxyPass = "https://127.0.0.1:8443";
          proxyWebsockets = true;
          extraConfig = ''
            # kanidm's loopback TLS uses an ACME cert valid only for the public
            # name; proxy_ssl_verify off avoids upstream-cert hostname checks
            # against 127.0.0.1.
            proxy_ssl_verify off;
          '';
        };
      };
    };
}
