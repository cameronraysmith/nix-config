{
  nix.settings.trusted-public-keys = [
    "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
    "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
    "cameronraysmith.cachix.org-1:aC8ZcRCVcQql77Qn//Q1jrKkiDGir+pIUjhUunN6aio="
    "poetry2nix.cachix.org-1:eXpeBJl0EQjO+vs9/1cUq19BH1LLKQT9HScbJDeeHaA="
  ];
  nix.settings.substituters = [
    "https://cache.nixos.org"
    "https://nix-community.cachix.org"
    "https://cameronraysmith.cachix.org"
    "https://poetry2nix.cachix.org"
  ];
}
