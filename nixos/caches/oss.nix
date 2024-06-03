{
  nix.settings.trusted-public-keys = [
    "cameronraysmith.cachix.org-1:aC8ZcRCVcQql77Qn//Q1jrKkiDGir+pIUjhUunN6aio="
    "nammayatri.cachix.org-1:PiVlgB8hKyYwVtCAGpzTh2z9RsFPhIES6UKs0YB662I="
    #"nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
  ];
  nix.settings.substituters = [
    "https://cameronraysmith.cachix.org"
    "https://nammayatri.cachix.org?priority=42"
    #"https://nix-community.cachix.org"
  ];
}
