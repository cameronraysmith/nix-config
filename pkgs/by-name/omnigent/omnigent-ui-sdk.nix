{
  lib,
  buildPythonPackage,
  fetchPypi,
  omnigent-client,
  prompt-toolkit,
  pyyaml,
  rich,
  version,
}:
buildPythonPackage {
  pname = "omnigent-ui-sdk";
  inherit version;
  format = "wheel";

  src = fetchPypi {
    pname = "omnigent_ui_sdk";
    inherit version;
    format = "wheel";
    python = "py3";
    dist = "py3";
    platform = "any";
    hash = "sha256-n9sxlaIIC/hMtSCFfJjKehbaPfsTnNZdnD86KQYxapk=";
  };

  dependencies = [
    omnigent-client
    prompt-toolkit
    pyyaml
    rich
  ];

  meta = {
    description = "Terminal UI SDK for Omnigent";
    homepage = "https://omnigent.ai";
    license = lib.licenses.asl20;
  };
}
