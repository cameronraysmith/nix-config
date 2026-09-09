{ inputs, ... }:
{
  flake.modules.darwin.omnigent-host =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      cfg = config.services.omnigent-host;
      userHome = config.users.users.${cfg.user}.home;
      logDirectory = "${userHome}/.omnigent/logs/host";
      explicitPath =
        lib.makeBinPath (inputs.self.lib.omnigentRuntimePackages pkgs ++ cfg.extraPackages)
        + ":/usr/bin:/bin:/usr/sbin:/sbin";
    in
    {
      options.services.omnigent-host = {
        enable = lib.mkEnableOption "the foreground Omnigent host";
        package = lib.mkPackageOption pkgs "omnigent" { };
        serverUrl = lib.mkOption {
          type = lib.types.str;
          description = "HTTPS URL of the Omnigent server.";
        };
        user = lib.mkOption {
          type = lib.types.str;
          default = config.system.primaryUser;
          description = "Existing Home Manager account holding runner and vendor credentials.";
        };
        hostName = lib.mkOption {
          type = lib.types.str;
          default = config.networking.hostName;
          description = "Fleet name merged into host.name in ~/.omnigent/config.yaml.";
        };
        extraPackages = lib.mkOption {
          type = lib.types.listOf lib.types.package;
          default = [ ];
          description = "Additional packages on the host and runner PATH.";
        };
        environment = lib.mkOption {
          type = lib.types.attrsOf lib.types.str;
          default = { };
          description = "Non-secret environment values forwarded to the foreground host.";
        };
      };

      config = lib.mkIf cfg.enable {
        assertions = [
          {
            assertion =
              config.system.primaryUser != null
              && config.system.primaryUser != ""
              && builtins.hasAttr config.system.primaryUser config.users.users;
            message = "Omnigent requires a configured primary user.";
          }
          {
            assertion = cfg.user != "" && builtins.hasAttr cfg.user config.users.users;
            message = "Omnigent requires an existing selected account.";
          }
          {
            assertion =
              builtins.hasAttr cfg.user config.home-manager.users
              && config.home-manager.users.${cfg.user}.home.username == cfg.user
              && config.home-manager.users.${cfg.user}.home.homeDirectory == userHome;
            message = "Omnigent requires a Home Manager user matching the selected account and home.";
          }
        ];

        home-manager.users.${cfg.user} =
          { lib, ... }:
          {
            programs.omnigent = {
              enable = true;
              package = cfg.package;
              settings.host.name = cfg.hostName;
            };

            home.activation.omnigentHostLogDirectory =
              lib.hm.dag.entryBetween
                [ "setupLaunchAgents" ]
                [
                  "writeBoundary"
                  "omnigentMergeConfig"
                ]
                ''
                  run ${pkgs.coreutils}/bin/install -d -m 0700 ${lib.escapeShellArg logDirectory}
                '';

            launchd.agents.omnigent-host = {
              enable = true;
              domain = "user";
              waitForNixStore = true;
              config = {
                ProgramArguments = [
                  (lib.getExe cfg.package)
                  "host"
                  "--server"
                  cfg.serverUrl
                ];
                EnvironmentVariables = cfg.environment // {
                  HOME = userHome;
                  PATH = explicitPath;
                };
                WorkingDirectory = userHome;
                RunAtLoad = true;
                KeepAlive.SuccessfulExit = false;
                ThrottleInterval = 5;
                ProcessType = "Standard";
                StandardOutPath = "${logDirectory}/service.log";
                StandardErrorPath = "${logDirectory}/service.log";
              };
            };
          };
      };
    };
}
