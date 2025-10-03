# Values set in repo root 'config.nix'.
{ lib, ... }:
let
  userSubmodule = lib.types.submodule {
    options = {
      username = lib.mkOption {
        type = lib.types.str;
      };
      fullname = lib.mkOption {
        type = lib.types.str;
      };
      email = lib.mkOption {
        type = lib.types.str;
      };
      sshKey = lib.mkOption {
        type = lib.types.str;
        description = ''
          SSH public key
        '';
      };
      isAdmin = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = ''
          Whether this user is an admin/system user
        '';
      };
    };
  };

  baseIdentitySubmodule = lib.types.submodule {
    options = {
      fullname = lib.mkOption {
        type = lib.types.str;
      };
      email = lib.mkOption {
        type = lib.types.str;
      };
      sshKey = lib.mkOption {
        type = lib.types.str;
        description = ''
          SSH public key
        '';
      };
    };
  };
in
{
  imports = [
    ../../config.nix
  ];
  options = {
    baseIdentity = lib.mkOption {
      type = baseIdentitySubmodule;
      description = "Base identity data shared across user aliases";
    };
    me = lib.mkOption {
      type = userSubmodule;
      description = "Primary user (backward compatibility, points to crs58)";
    };
    crs58 = lib.mkOption {
      type = userSubmodule;
      description = "Admin user on stibnite";
    };
    cameron = lib.mkOption {
      type = userSubmodule;
      description = "Future admin user on blackphos (alias of crs58)";
    };
    jovyan = lib.mkOption {
      type = userSubmodule;
      description = "Container user";
    };
    runner = lib.mkOption {
      type = userSubmodule;
      description = "Non-admin user on stibnite and blackphos";
    };
    raquel = lib.mkOption {
      type = userSubmodule;
      description = "Non-admin user on blackphos";
    };
  };
}
