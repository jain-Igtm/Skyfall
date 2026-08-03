# Skyfall

Skyfall is a mobile-first first-person survival horror game set aboard Orison-9, an aging Imperial mining station on a moon orbiting a dead planet.

The first playable build includes:

- ASHFALL's primary mobile HUD and exact control layout/response
- a medium-sized, explorable mining station with collision and multiple districts
- emergency alarms and calm evacuation guidance
- a lightweight suit and clear breathing shield to collect
- weapon and tool pickups, three damaged critical systems, and repair objectives
- phasing space ghosts, escalating waves, combat, health, ammunition, and scoring
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
