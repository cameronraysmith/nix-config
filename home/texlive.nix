{ pkgs, ... }:
let
  tex = pkgs.texlive.combine {
    inherit
      (pkgs.texlive)
      scheme-small
      algorithm2e
      algorithmicx
      algorithms
      algpseudocodex
      apacite
      appendix
      caption
      multirow
      ncctools
      rsfs
      sttools
      threeparttable
      vruler
      wrapfig
      xurl
      ;
  };
in
{
  home.packages = [
    tex
  ];
}
