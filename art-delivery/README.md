# Approved game art delivery

This artifact-only staging directory contains the approved YurikaOnline integration archive as three losslessly split binary parts. It is intended for the game integration executor. No game source, images, or production configuration is changed by this delivery.

Contents: class weapons aligned with five books, Witch v3, Warrior v1, Archer, and skill effects. The original ZIP has 248 entries.

## Reconstruct

From the repository root:

```sh
cat art-delivery/YurikaOnline-game-integration.zip.part01 \
    art-delivery/YurikaOnline-game-integration.zip.part02 \
    art-delivery/YurikaOnline-game-integration.zip.part03 \
    > YurikaOnline-game-integration.zip
printf '%s  %s\n' \
  '4a57cd980d35ecb267a1bb3b974b3ec04c4dec857983fde418bb9884beee6651' \
  'YurikaOnline-game-integration.zip' | sha256sum -c -
```

The reconstructed archive must be exactly 18,585,144 bytes. See manifest.json for ordered part sizes and SHA256 checksums.

This branch stages delivery only. Integrate selected assets into the game through the normal development workflow; do not merge the archive parts into the production branch.
