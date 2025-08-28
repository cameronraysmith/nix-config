{ flake, ... }:
{
  programs.jujutsu = {
    enable = true;

    settings = {
      user = {
        name = flake.config.me.fullname;
        email = flake.config.me.email;
      };

      signing = {
        behavior = "own";
        backend = "gpg";
        key = "FF043B368811DD1C";
      };

      ui = {
        editor = "nvim";
        color = "auto";
        diff-formatter = ":git";
        pager = "delta";
      };
    };
  };
}
