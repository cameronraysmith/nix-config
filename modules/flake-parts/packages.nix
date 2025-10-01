{ lib, self, ... }:
{
  perSystem =
    { pkgs, system, ... }:
    let
      # read .nix files from packages directory
      packagesDir = self + /packages;
      packageFiles = builtins.readDir packagesDir;

      # extract package names from files (remove .nix extension) and directories
      packageNames = lib.mapAttrsToList (
        name: type:
        if type == "regular" && lib.hasSuffix ".nix" name then
          lib.removeSuffix ".nix" name
        else if type == "directory" then
          name
        else
          null
      ) packageFiles;

      # filter out nulls and build attribute set
      allPackageNames = lib.filter (name: name != null) packageNames;

      # get packages from pkgs that exist and are derivations
      customPackagesPerSystem = lib.filterAttrs (
        name: value:
        value != null && lib.isDerivation value && lib.meta.availableOn { inherit system; } value
      ) (lib.genAttrs allPackageNames (name: pkgs.${name} or null));
    in
    {
      # export packages as flake outputs
      packages = customPackagesPerSystem;
    };
}
