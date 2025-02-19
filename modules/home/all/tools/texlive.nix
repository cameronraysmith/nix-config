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
      cm-super
      dvipng
      framed
      git-latexdiff
      latexdiff
      latexmk
      latexpand
      multirow
      ncctools
      placeins
      rsfs
      sttools
      threeparttable
      type1cm
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
