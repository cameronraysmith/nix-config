# ./modules/flake-parts/config.nix
rec {
  me = {
    username = "crs58";
    fullname = "Cameron Smith";
    email = "cameron.ray.smith@gmail.com";
    sshKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINdO9rInDa9HvdtZZxmkgeEdAlTupCy3BgA/sqSGyUH+";
  };
  jovyan = me // {
    username = "jovyan";
  };
  runner = me // {
    username = "runner";
  };
}
