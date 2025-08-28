{
  lib,
  rustPlatform,
  fetchCrate,
  nix-update-script,
  pkg-config,
  stdenv,
  darwin,
  openssl,
}:
let
  pname = "starship-jj";
  version = "0.5.1";
in
rustPlatform.buildRustPackage {
  inherit pname version;

  src = fetchCrate {
    inherit pname version;
    hash = "sha256-tQEEsjKXhWt52ZiickDA/CYL+1lDtosLYyUcpSQ+wMo=";
  };

  cargoHash = "sha256-+rLejMMWJyzoKcjO7hcZEDHz5IzKeAGk1NinyJon4PY=";

  nativeBuildInputs = [
    pkg-config
  ];

  buildInputs = [
    openssl
  ];

  doCheck = false;

  doInstallCheck = true;
  installCheckPhase = ''
    $out/bin/starship-jj --version 2>&1 | grep ${version};
  '';

  passthru.updateScript = nix-update-script { };

  meta = with lib; {
    homepage = "https://gitlab.com/lanastara_foss/starship-jj";
    description = "starship plugin for jj";
    mainProgram = "starship-jj";
    license = licenses.mit;
    maintainers = with maintainers; [
      cameronraysmith
    ];
  };
}
