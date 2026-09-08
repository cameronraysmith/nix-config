{ config, ... }:
let
  acp = config.flake.lib.omnigentACP;
in
{
  flake.modules.homeManager.ai =
    {
      config,
      lib,
      pkgs,
      osConfig ? null,
      ...
    }:
    let
      cfg = config.programs.omnigent;
      yamlFormat = pkgs.formats.yaml { };
      hostName = if osConfig == null then null else osConfig.networking.hostName;
      mergeConfig = pkgs.writeShellApplication {
        name = "omnigent-merge-config";
        runtimeInputs = [ pkgs.yq-go ];
        text = builtins.readFile ./merge-config.sh;
      };
      declared = yamlFormat.generate "omnigent-config.yaml" cfg.settings;
    in
    {
      options.programs.omnigent = {
        enable = lib.mkEnableOption "Omnigent and its runner configuration";
        package = lib.mkPackageOption pkgs "omnigent" { };
        settings = lib.mkOption {
          type = yamlFormat.type;
          default = { };
          description = ''
            Declarative subset of {file}`~/.omnigent/config.yaml`.
            Activation merges mappings and replaces sequences and scalars;
            undeclared runtime keys, including host.host_id, survive.
            Removing a declaration does not remove its previously merged value.
            Credentials belong in runtime state, not these store-visible settings.
          '';
        };
      };

      config = {
        programs.omnigent = {
          enable = lib.mkDefault true;
          settings = {
            inherit acp;
          }
          // lib.optionalAttrs (hostName != null && hostName != "") {
            host.name = lib.mkDefault hostName;
          };
        };

        home.packages = lib.mkIf cfg.enable [ cfg.package ];
        home.activation.omnigentMergeConfig = lib.mkIf (cfg.enable && cfg.settings != { }) (
          lib.hm.dag.entryAfter [ "writeBoundary" ] ''
            run ${lib.getExe mergeConfig} ${declared} ${lib.escapeShellArg "${config.home.homeDirectory}/.omnigent/config.yaml"}
          ''
        );
      };
    };
}
