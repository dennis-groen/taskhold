# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in taskhold, please **do not open a public GitHub issue**.

Instead, report it privately using [GitHub Security Advisories](https://github.com/dennis-groen/taskhold/security/advisories/new) on this repository. Include:

- A clear description of the issue and potential impact
- Steps to reproduce or a proof of concept
- Any suggested mitigation, if you have one

Reports will be reviewed and addressed as quickly as possible.

## Scope

Security-relevant areas of the codebase include:

- Authentication, sessions, and origin checks (`apps/api/src/features/auth/`, `apps/api/src/lib/same-origin.ts`)
- Household/user data isolation across API features (`apps/api/src/features/`)
- Web Push endpoint validation and subscription ownership (`apps/api/src/features/reminders/`)
- Content Security Policy and security headers (`apps/web/content-security-policy.ts`, `apps/api/src/server.ts`, `apps/api/src/app.ts`)
