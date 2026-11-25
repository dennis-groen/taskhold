# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in taskhold, please **do not open a public GitHub issue**.

Instead, report it privately using [GitHub Security Advisories](https://github.com/dennis-groen/taskhold/security/advisories/new) on this repository. Include:

- A clear description of the issue and potential impact
- Steps to reproduce or a proof of concept
- Any suggested mitigation, if you have one

Reports will be reviewed and addressed as quickly as possible.

## Supported versions

Only the latest `main` is supported; it's what runs at https://taskhold.lunexa.dev. Fixes land there, with no backports.

## Testing

Please test against your own copy (see the README's "Getting started") or a demo household on the live site, which is yours alone and deleted after a day. Don't access other people's data, and don't run load or denial-of-service tests against the live site.

## Scope

Security-relevant areas of the codebase include:

- Authentication, sessions, and origin checks (`apps/api/src/features/auth/`, `apps/api/src/lib/same-origin.ts`)
- Household/user data isolation across API features (`apps/api/src/features/`)
- Demo mode: sealed demo households and their limits (`apps/api/src/features/demo/`)
- Web Push endpoint validation and subscription ownership (`apps/api/src/features/reminders/`)
- Content Security Policy and security headers (`apps/web/content-security-policy.ts`, `apps/api/src/server.ts`, `apps/api/src/app.ts`)
