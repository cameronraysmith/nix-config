# ./modules/flake-parts/config.nix
rec {
  # base identity (no username)
  baseIdentity = {
    fullname = "Cameron Smith";
    email = "cameron.ray.smith@gmail.com";
    sshKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINdO9rInDa9HvdtZZxmkgeEdAlTupCy3BgA/sqSGyUH+";
  };

  # admin user
  cameron = baseIdentity // {
    username = "cameron";
    isAdmin = true;
  };

  # github actions runner alias
  runner = baseIdentity // {
    username = "runner";
    fullname = "GitHub Actions Runner";
    email = "runner@localhost";
    sshKey = baseIdentity.sshKey;
    isAdmin = false;
  };

  # jupyter alias of base identity
  jovyan = baseIdentity // {
    username = "jovyan";
  };

  # backward compatibility
  crs58 = baseIdentity // {
    username = "crs58";
    isAdmin = true;
  };

  me = crs58;

  # non-admin user on blackphos
  raquel = {
    username = "raquel";
    fullname = "Someone Local";
    email = "raquel@localhost";
    sshKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK7WyNT9pEl8JczNdl0rPzJPCB3cJaJL+Nq8b2z8h5xE";
    isAdmin = false;
  };
}
