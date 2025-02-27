{ flake, ... }: {
  virtualisation.podman.enable = true;

  users.users.${flake.config.me} = {
    extraGroups = [ "podman" ];
  };
}
