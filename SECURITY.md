# Security policy

## Reporting a vulnerability

Please report suspected security issues privately to the repository owner using
GitHub's **Report a vulnerability** feature on the repository's Security tab.
Do not post credentials, personal data, or an exploitable proof of concept in a
public issue. If private reporting is unavailable, open an issue asking for a
private contact method without including technical details.

This is a small, client-side educational application with no accounts, server-side
user data, or third-party runtime services. The optional local Node server is for
development, serves only the `ui/` and `src/` directories, and binds to loopback
by default. Do not set `HOST` to a network address or expose the server to the
public internet; the server has no authentication or TLS.

## Supported versions

The latest version on the default branch is the only version receiving security
fixes. Please include the affected commit or release and steps to reproduce in a
private report.
