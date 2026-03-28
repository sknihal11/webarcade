# Security Policy

## Supported Version

The live `main` branch is the supported version of WebArcade.

## Current Security Controls

- Firestore rules are stored in `firestore.rules`.
- Firebase project config for rules deployment is stored in `firebase.json` and `.firebaserc`.
- Username reservations are enforced through the `usernames` collection to prevent duplicate public handles.

## Deploying Rules

1. Install the Firebase CLI.
2. Run `firebase deploy --only firestore:rules` from the repo root.

## Reporting a Vulnerability

Open a private security report through GitHub Security Advisories when possible. If that is not available, contact the maintainer before opening a public issue.
