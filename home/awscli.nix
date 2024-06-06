{
  programs.awscli = {
    enable = true;
    settings = {
      "default" = {
        region = "us-east-1";
        output = "json";
      };
    };
  };
}
