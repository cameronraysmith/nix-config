{
  myself = "crs58";
  users = rec {
    crs58 = {
      name = "Cameron Smith";
      email = "cameron.ray.smith@gmail.com";
      sshKeys = [
        "ecdsa-sha2-nistp384 AAAAE2VjZHNhLXNoYTItbmlzdHAzODQAAAAIbmlzdHAzODQAAABhBELOIffrlKEev80oL/azuYjR9rvgAgeDassoqpx+XL0DwwVNl0dMLNLGZN3elXrDrumagUhJOnRveQ8mmaPPxgnjpZ4KQEdtgE4ayf2wtrXQZ+KUADRKV9LzLtZYF18UZA=="
      ];
    };
    runner = crs58;
  };
}
