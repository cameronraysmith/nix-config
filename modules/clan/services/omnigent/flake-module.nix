{ config, ... }:
let
  nixosModules = config.flake.modules.nixos;
  darwinModules = config.flake.modules.darwin;
in
{
  clan.modules.omnigent =
    { lib, ... }:
    {
      _class = "clan.service";
      manifest = {
        name = "omnigent";
        description = "Omnigent server and outbound foreground hosts";
        categories = [ "AI" ];
        readme = builtins.readFile ./README.md;
      };

      perMachine.nixosModule.imports = [
        nixosModules.omnigent
        nixosModules.omnigent-host
      ];

      roles.server = {
        description = "Runs the Omnigent server behind nginx with Kanidm OIDC";
        interface = {
          options = {
            domain = lib.mkOption {
              type = lib.types.str;
              description = "Public HTTPS hostname of the server.";
            };
            port = lib.mkOption {
              type = lib.types.port;
              default = 6767;
              description = "Loopback HTTP port served behind nginx.";
            };
          };
        };
        perInstance =
          { instanceName, settings, ... }:
          {
            nixosModule =
              { config, ... }:
              {
                services.omnigent = {
                  enable = true;
                  inherit (settings) domain port;
                  cookieSecretGenerator = "omnigent-cookie-secret-${instanceName}";
                  oidc = {
                    issuer = "https://accounts.scientistexperience.net/oauth2/openid/omnigent";
                    clientId = "omnigent";
                  };
                  environmentFiles = [
                    config.clan.core.vars.generators.kanidm-oauth2-omnigent.files.env.path
                  ];
                };
              };
          };
      };

      roles.host = {
        description = "Connects a runner to the instance's single server";
        interface = {
          options = {
            extraPackages = lib.mkOption {
              type = lib.types.listOf lib.types.str;
              default = [ ];
              description = "Nixpkgs attribute names, including dotted paths, added to the host and runner PATH.";
            };
            environment = lib.mkOption {
              type = lib.types.attrsOf lib.types.str;
              default = { };
              description = "Non-secret environment values for the foreground host.";
            };
          };
        };
        perInstance =
          {
            roles,
            settings,
            machine,
            ...
          }:
          assert lib.assertMsg (
            lib.length (lib.attrNames roles.server.machines) == 1
          ) "Omnigent requires exactly one server";
          {
            nixosModule =
              { pkgs, ... }:
              {
                services.omnigent-host = {
                  enable = true;
                  serverUrl = "https://${(lib.head (lib.attrValues roles.server.machines)).settings.domain}";
                  user = "cameron";
                  hostName = machine.name;
                  extraPackages = map (
                    name: lib.getAttrFromPath (lib.splitString "." name) pkgs
                  ) settings.extraPackages;
                  inherit (settings) environment;
                };
              };
            darwinModule =
              { pkgs, ... }:
              {
                imports = [ darwinModules.omnigent-host ];
                services.omnigent-host = {
                  enable = true;
                  serverUrl = "https://${(lib.head (lib.attrValues roles.server.machines)).settings.domain}";
                  hostName = machine.name;
                  extraPackages = map (
                    name: lib.getAttrFromPath (lib.splitString "." name) pkgs
                  ) settings.extraPackages;
                  inherit (settings) environment;
                };
              };
          };
      };
    };
}
