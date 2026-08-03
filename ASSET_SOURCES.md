# Skyfall asset sources

The texture assets in `public/assets/textures/` were generated specifically for Skyfall with OpenAI's built-in image generation workflow on 2026-08-03, then cropped and converted to mobile-sized WebP files. Generated surfaces carry no text, marks, or baked directional lighting.

## Original station atlas and ghost surface

Prompt summary: a front-facing old-industrial science-fiction texture atlas of cold-gray wall panels, ribbed steel floor, oxidized trim, and mineral-stained ceiling panels, plus a separate seamless cold blue-gray ectoplasm surface with vapor wisps, smoke veins, pale filaments, void patches, and interference bands.

Retained assets:

- `rusted-trim.webp`
- `station-ceiling.webp`
- `ghost-ectoplasm.webp`

## Shaft Four industrial atlas

Prompt summary: a seamless 2-by-2 material atlas of charcoal armored wall panels, gunmetal tread flooring, blackened grated iron, and molten cracked ore; heavily used lunar mining machinery; neutral diffuse material reference light; no scenery or perspective.

Derived assets:

- `station-wall.webp`
- `station-floor.webp`
- `catwalk-grate.webp`
- `molten-ore.webp`

## Dead planet surface

Prompt summary: a seamless 2:1 equirectangular surface map for an airless dead planet, with cratered charcoal rock, extinct basins, subtle mineral variation, and only faint deep-red fissures; no stars, atmosphere, labels, or directional lighting.

Derived asset:

- `dead-planet.webp`

## Weapon material atlas

Prompt summary: a seamless 2-by-2 material atlas for battered Imperial mining firearms: matte black receiver alloy, chipped oxblood enamel, scratched steel mechanisms, and heat-darkened barrel metal; neutral reference light and no weapon silhouette.

Derived assets:

- `weapon-black.webp`
- `weapon-red.webp`
- `weapon-steel.webp`
- `weapon-barrel.webp`

## Project-supplied station alarm

`public/assets/audio/station-alarm.ogg` was transcoded from the project owner's uploaded `Spaceship Echoing Alarm HQ Sound Effect.mp3`. It is bundled locally and loops until the third critical system is repaired.

- Duration: 67.918 seconds
- SHA-256: `201248c23947122ac2b8dfeadb4f85f5baed6a7896ba981f78b3208441d70fa7`

## Recorded weapon report

`public/assets/audio/weapon-shot.ogg` is a mobile-sized edit of BigSoundBank's "Rifle: Shot #1," recorded by Joseph SARDIN and offered under CC0 1.0 / public domain.

- Source page: `https://bigsoundbank.com/rifle-shot-1-s2853.html`
- Original audio: `https://bigsoundbank.com/UPLOAD/mp3/2853.mp3`
- Downloaded: 2026-08-03
- Edited duration: 0.700 seconds
- SHA-256: `edaa96ea5ba2103c2bf54957640ebcae49ec481f0335d4c576f0842f10ff2b84`
