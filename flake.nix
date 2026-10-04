{
  description = "texthooker-ui";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        name = "texthooker-ui";
        src = ./.;
        pkgs = import nixpkgs {inherit system;};
        pnpm = pkgs.pnpm_9;
        nativeBuildInputs = [pkgs.nodejs_22 pnpm.configHook];
      in {
        # index.html will be located in the nix store
        # build with "nix build . --print-out-paths" to get the path
        packages.default = pkgs.stdenv.mkDerivation (finalAttrs: {
          inherit name nativeBuildInputs src;
          pname = name;

          pnpmDeps = pnpm.fetchDeps {
            pname = name;
            inherit src;
            hash = "sha256-7XhsCb10t2uRwFEnPpp7B732K3VFPqoaWiOMlhFn7M4=";
          };

          installPhase = ''
            pnpm run build
            cp -r ./docs $out
          '';
        });

        devShell = pkgs.mkShell {
          inherit nativeBuildInputs;
        };
      }
    );
}
