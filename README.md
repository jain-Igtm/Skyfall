# Skyfall

Skyfall is a mobile-first first-person survival horror game set aboard Orison-9, an aging Imperial mining station on a moon orbiting a dead planet.

The current playable build includes:

- ASHFALL's primary mobile HUD and exact control layout/response
- a dense, texture-driven station with dark gunmetal walls, working rooms, collision, and multiple districts
- a real service-lift ride into Shaft Four: ring catwalks, a molten excavation pit, and a pumping core drill
- a textured dead planet with a restrained atmospheric glow outside the observation glass
- a project-supplied one-minute emergency alarm that loops until all critical repairs are complete
- layered lift, machinery, grinding, and recorded weapon audio plus calm evacuation guidance
- a lightweight suit and clear breathing shield to collect
- textured weapon models and tool pickups, three damaged critical systems, and repair objectives spanning both levels
- phasing space ghosts, escalating waves, combat, health, ammunition, and scoring
- batched station geometry, simplified ghost rendering, and adaptive mobile resolution for stable play on lower-power phones
- environmental evidence of the Empire's long administrative decline
- a Capacitor Android target and GitHub Actions APK build

## Run locally

```bash
npm install
npm run dev
```

## Validate

```bash
npm test
npm run build
```

## Android

```bash
npm install
npm run build
npx cap add android
npm run configure:android
npx cap sync android
cd android && ./gradlew assembleDebug
```
