{ flake, ... }: {
  virtualisation.docker.enable = true;

  users.users.${flake.config.me} = {
    extraGroups = [ "docker" ];
  };
}
