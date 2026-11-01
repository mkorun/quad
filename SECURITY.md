# Security

## Reporting a vulnerability

Report a vulnerability privately, through GitHub: the repository's **Security** tab, **Report a vulnerability**.
Please do not open a public issue for it. A report is answered within a week; a fix and an advisory follow, crediting
the reporter unless they ask not to be named.

## What quad guards

quad formats HTML a build made. A page must mean afterwards what it meant before: text stays text, an element ends
where it ended, and an attribute keeps its name and value, apart from what the README lists under "Normalization" and
"Fix tags". A change to any of these is a vulnerability.

Outside this boundary: quad is no sanitizer, and leaves a script in its input as it is. It is synchronous and has no
timeout, so run it in a Worker for HTML from a source you do not trust (README, "Untrusted input").

## Supported versions

Fixes go into the latest release.
