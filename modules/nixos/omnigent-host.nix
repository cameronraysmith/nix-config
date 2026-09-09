{ inputs, ... }:
{
  flake.modules.nixos.omnigent-host =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      cfg = config.services.omnigent-host;
      adminUsers = lib.filter (
        name:
        let
          user = config.users.users.${name} or { };
        in
        (user.isNormalUser or false) && lib.elem "wheel" (user.extraGroups or [ ])
      ) (lib.attrNames (config.home-manager.users or { }));
      userHome = config.users.users.${cfg.user}.home;
      hostEnvironment = cfg.environment // {
        HOME = userHome;
      };
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
          default =
            if lib.length adminUsers == 1 then
              lib.head adminUsers
            else
              throw "Set services.omnigent-host.user explicitly: Omnigent requires a unique normal wheel user with a Home Manager configuration for automatic selection";
          defaultText = lib.literalMD "The unique normal wheel user with a Home Manager configuration.";
          description = "Existing Unix account holding runner and vendor credentials; set explicitly when automatic selection is ambiguous.";
        };
        hostName = lib.mkOption {
          type = lib.types.str;
          default = config.networking.hostName;
          description = "Fleet name for the unit description and operator-seeded host.name in ~/.omnigent/config.yaml.";
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
        systemd.services.omnigent-host = {
          description = "Omnigent host ${cfg.hostName}";
          wantedBy = [ "multi-user.target" ];
          after = [ "network-online.target" ];
          wants = [ "network-online.target" ];
          path = inputs.self.lib.omnigentRuntimePackages pkgs ++ cfg.extraPackages;
          environment = hostEnvironment;
          serviceConfig = {
            Type = "simple";
            Environment = lib.mapAttrsToList (name: value: builtins.toJSON "${name}=${value}") hostEnvironment;
            ExecStart = lib.escapeShellArgs [
              (lib.getExe cfg.package)
              "host"
              "--server"
              cfg.serverUrl
            ];
            User = cfg.user;
            WorkingDirectory = userHome;
            Restart = "on-failure";
            RestartSec = 5;
            MemoryHigh = "6G";
            MemoryMax = "8G";
            NoNewPrivileges = true;
          };
        };
      };
    };
}
