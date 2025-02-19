{ flake, ... }: {
  virtualisation.lxd.enable = true;

  users.users.${flake.config.me} = {
    extraGroups = [ "lxd" ];
  };
}
