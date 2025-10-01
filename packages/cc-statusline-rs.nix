{
  lib,
  rustPlatform,
  fetchFromGitHub,
  pkg-config,
  openssl,
}:
let
  pname = "cc-statusline-rs";
  version = "0.1.0";
in
rustPlatform.buildRustPackage {
  inherit pname version;

  src = fetchFromGitHub {
    owner = "khoi";
    repo = pname;
    rev = "98e3440888504d6f014885f337101bc51b2281f2";
    hash = "sha256-4yU/GP2tPGrH2i2zGB2RkjqSP+KNCF7tu79eYOpTeuQ=";
  };

  cargoHash = "sha256-HqI38QUs11/5CQyGzH9csKnLaE7RVtq/l6U+WfLuJng=";

  nativeBuildInputs = [ pkg-config ];

  buildInputs = [ openssl ];

  doCheck = false;

  meta = with lib; {
    description = "Claude Code statusline implementation in Rust";
    mainProgram = "statusline";
    license = licenses.mit;
    maintainers = [ ];
  };
}
