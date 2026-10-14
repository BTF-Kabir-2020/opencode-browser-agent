# Security Policy

## Supported versions

The latest release on `main` is supported.

## Reporting a vulnerability

Please use GitHub's private reporting: **Security -> Report a vulnerability**
on this repository. Do not open a public issue for security problems.

Include what you did, what happened, and what you expected. You will get an
acknowledgement as soon as possible, and credit in the changelog if you want it.

## Scope notes

This plugin drives the `agent-browser` CLI and your own browser profile:

- It never asks for credentials; logins are performed in the browser session.
- It must not kill an existing browser or close a session it did not create.
- Report anything that makes the agent leak cookies, local storage or session
  state outside the machine it runs on.
