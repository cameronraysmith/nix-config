# ./modules/flake-parts/config.nix
rec {
  me = {
    username = "crs58";
    fullname = "Cameron Smith";
    email = "cameron.ray.smith@gmail.com";
    sshKey = "ecdsa-sha2-nistp384 AAAAE2VjZHNhLXNoYTItbmlzdHAzODQAAAAIbmlzdHAzODQAAABhBELOIffrlKEev80oL/azuYjR9rvgAgeDassoqpx+XL0DwwVNl0dMLNLGZN3elXrDrumagUhJOnRveQ8mmaPPxgnjpZ4KQEdtgE4ayf2wtrXQZ+KUADRKV9LzLtZYF18UZA==";
  };
  jovyan = me // {
    username = "jovyan";
  };
  runner = me // {
    username = "runner";
  };
}
