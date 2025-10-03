# ./modules/flake-parts/config.nix
rec {
  # base identity data (no username)
  baseIdentity = {
    fullname = "Cameron Smith";
    email = "cameron.ray.smith@gmail.com";
    sshKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINdO9rInDa9HvdtZZxmkgeEdAlTupCy3BgA/sqSGyUH+";
  };

  # primary admin user on stibnite (and currently on blackphos)
  crs58 = baseIdentity // {
    username = "crs58";
    isAdmin = true;
  };

  # future admin user for blackphos (same identity, different username)
  cameron = baseIdentity // {
    username = "cameron";
    isAdmin = true;
  };

  # independent non-admin user on both stibnite and blackphos
  runner = {
    username = "runner";
    fullname = "GitHub Actions Runner";
    email = "runner@localhost";
    sshKey = baseIdentity.sshKey; # can share ssh key if desired
    isAdmin = false;
  };

  # independent non-admin user on blackphos only
  raquel = {
    username = "raquel";
    fullname = "Raquel Smith";
    email = "raquel@example.com";
    sshKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK7WyNT9pEl8JczNdl0rPzJPCB3cJaJL+Nq8b2z8h5xE"; # placeholder - replace with raquel's actual key
    isAdmin = false;
  };

  # container user (alias of base identity)
  jovyan = baseIdentity // {
    username = "jovyan";
  };

  # backward compatibility - me points to crs58
  me = crs58;
}
