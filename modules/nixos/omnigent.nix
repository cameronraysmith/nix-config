{ config, ... }:
let
  acp = config.flake.lib.omnigentACP;
in
{
  flake.modules.nixos.omnigent =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      cfg = config.services.omnigent;
      stateDirectory = "/var/lib/omnigent";
      configDirectory = pkgs.writeTextDir "config.yaml" (builtins.toJSON { inherit acp; });
      adminList = pkgs.writeText "omnigent-admins" ''
        cameron.ray.smith@gmail.com
      '';
    in
    {
      options.services.omnigent = {
        enable = lib.mkEnableOption "the Omnigent server";
        package = lib.mkPackageOption pkgs "omnigent" { };
        domain = lib.mkOption {
          type = lib.types.str;
          description = "Public hostname used for HTTPS and the OIDC callback.";
        };
        port = lib.mkOption {
          type = lib.types.port;
          default = 6767;
          description = "Loopback HTTP port served behind nginx.";
        };
        environmentFiles = lib.mkOption {
          type = lib.types.listOf lib.types.str;
          default = [ ];
          description = "Runtime environment files, including the OIDC client secret carrier.";
        };
        cookieSecretGenerator = lib.mkOption {
          type = lib.types.str;
          default = "omnigent-cookie-secret";
          description = "Clan vars generator name for the server cookie secret.";
        };
        oidc = {
          issuer = lib.mkOption {
            type = lib.types.str;
            description = "OIDC issuer URL for the confidential server client.";
          };
          clientId = lib.mkOption {
            type = lib.types.str;
            description = "Confidential OIDC client identifier.";
          };
          allowedDomains = lib.mkOption {
            type = lib.types.listOf lib.types.str;
            default = [ ];
            description = "Optional email-domain restriction; an empty list leaves admission to the IdP.";
          };
        };
      };

      config = lib.mkIf cfg.enable {
        users.users.omnigent = {
          isSystemUser = true;
          group = "omnigent";
          home = stateDirectory;
        };
        users.groups.omnigent = { };

        services.postgresql = {
          enable = true;
          ensureDatabases = [ "omnigent" ];
          ensureUsers = [
            {
              name = "omnigent";
              ensureDBOwnership = true;
            }
          ];
        };

        clan.core.vars.generators.${cfg.cookieSecretGenerator} = {
          files.env = {
            secret = true;
            owner = "omnigent";
            group = "omnigent";
            mode = "0400";
            restartUnits = [ "omnigent.service" ];
          };
          runtimeInputs = [ pkgs.openssl ];
          script = ''
            secret="$(openssl rand -hex 32)"
            printf 'OMNIGENT_OIDC_COOKIE_SECRET=%s\n' "$secret" > "$out/env"
          '';
        };

        systemd.services.omnigent = {
          description = "Omnigent server";
          wantedBy = [ "multi-user.target" ];
          after = [
            "network-online.target"
            "postgresql.target"
          ];
          wants = [ "network-online.target" ];
          requires = [ "postgresql.target" ];
          environment = {
            HOME = stateDirectory;
            OMNIGENT_DATA_DIR = stateDirectory;
            OMNIGENT_CONFIG_HOME = configDirectory;
            OMNIGENT_AUTH_ENABLED = "1";
            OMNIGENT_AUTH_PROVIDER = "oidc";
            OMNIGENT_DOMAIN = cfg.domain;
            OMNIGENT_OIDC_ISSUER = cfg.oidc.issuer;
            OMNIGENT_OIDC_CLIENT_ID = cfg.oidc.clientId;
            OMNIGENT_ADMIN_LIST_PATH = adminList;
            # CLI-login tickets are process-local in Omnigent v0.12.0.
            WEB_CONCURRENCY = "1";
          }
          // lib.optionalAttrs (cfg.oidc.allowedDomains != [ ]) {
            OMNIGENT_OIDC_ALLOWED_DOMAINS = lib.concatStringsSep "," cfg.oidc.allowedDomains;
          };
          serviceConfig = {
            ExecStart = lib.escapeShellArgs [
              (lib.getExe cfg.package)
              "server"
              "--host"
              "127.0.0.1"
              "--port"
              (toString cfg.port)
              "--no-open"
              "--database-uri"
              "postgresql+psycopg:///omnigent?host=/run/postgresql"
              "--artifact-location"
              "${stateDirectory}/artifacts"
            ];
            User = "omnigent";
            Group = "omnigent";
            StateDirectory = "omnigent";
            StateDirectoryMode = "0700";
            WorkingDirectory = stateDirectory;
            EnvironmentFile = cfg.environmentFiles ++ [
              config.clan.core.vars.generators.${cfg.cookieSecretGenerator}.files.env.path
            ];
            Restart = "on-failure";
            RestartSec = 5;
            MemoryHigh = "2G";
            MemoryMax = "3G";
            UMask = "0077";
            NoNewPrivileges = true;
            PrivateTmp = true;
            ProtectSystem = "strict";
            ProtectHome = true;
            ProtectKernelTunables = true;
            ProtectKernelModules = true;
            ProtectKernelLogs = true;
            ProtectControlGroups = true;
            RestrictSUIDSGID = true;
            RestrictAddressFamilies = [
              "AF_UNIX"
              "AF_INET"
              "AF_INET6"
            ];
          };
        };

        services.nginx = {
          enable = true;
          virtualHosts.${cfg.domain} = {
            enableACME = true;
            forceSSL = true;
            locations."/" = {
              proxyPass = "http://127.0.0.1:${toString cfg.port}";
              proxyWebsockets = true;
              extraConfig = ''
                proxy_read_timeout 1d;
                proxy_send_timeout 1d;
                proxy_buffering off;
              '';
            };
          };
        };
      };
    };
}
