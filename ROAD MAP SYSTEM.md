# System Road Map

This document is a handoff guide for coding agents working on this project. It describes the current system, where each part lives, and how to place changes without breaking the connections between the screens, PHP endpoints, and stored data.

## 1. System at a glance

The project is a browser-based sector dispatch and incident-response system. It has three main user-facing areas:

1. **Dispatch terminal** — the main operations screen for viewing heroes, map incidents, signals, threat level, and dispatch activity.
2. **Director/admin tools** — pages for authorizing and managing heroes, viewing signals, communicating with dispatch, and security/DEFCON monitoring.
3. **Civilian clients** — emergency and threat-reporting screens that submit signals to the backend.

The UI is mostly static HTML, CSS, and browser JavaScript. PHP scripts provide JSON endpoints. The current persistence layer is a local JSON file, not a SQL database.

```text
Browser pages (HTML/CSS/JavaScript)
        |
        | fetch() requests with JSON
        v
PHP JSON endpoints
        |
        | shared helper functions
        v
BACKEND/QUERY/db.json
```

## 2. Repository map: where to make changes

| Path | Responsibility | Put changes here when... |
|---|---|---|
| `index.php` | Root redirect to the dispatch terminal. | Changing the site's default entry page. |
| `FRONT-END/DESIGN/index.html` | Main dispatch/terminal UI, including the operational views and map. | Changing the core dispatcher experience, screen layout, or map presentation. |
| `FRONT-END/DESIGN/admin_panel.html` | Full director console for admin operations. | Changing advanced hero, signal, or director-console workflows. |
| `ADMIN_PANEL/index.html` | Compact hero authorization/deployment page. | Changing the simple admin landing page or its hero-creation form. |
| `CIVILIAN_CLIENT/index.html` | Civilian emergency reporting UI. | Changing the civilian emergency submission flow. |
| `FRONT-END/DESIGN/sos_emergency.html` | Emergency SOS form/page. | Changing the emergency report screen. |
| `FRONT-END/DESIGN/sos_threat.html` | Threat-reporting SOS form/page. | Changing the threat report screen. |
| `FRONT-END/DESIGN/civilian.html` | Additional civilian UI. | Changing this civilian-facing page; confirm its links and API use before editing. |
| `FRONT-END/DESIGN/security_center.html` | Security center interface. | Changing security monitoring or DEFCON controls. |
| `FRONT-END/DESIGN/soc_dashboard.html` | SOC dashboard interface. | Changing the security operations dashboard. |
| `classified_data.php` | Director-session-protected classified hero dossier view. | Changing the classified-data presentation or access control. |
| `FRONT-END/REQUEST/api_client.js` | Shared browser-side calls for authentication, chat, secure line, and hero deletion. | Changing one of the shared client request helpers or its response handling. |
| `FRONT-END/REQUEST/weather.js` | Weather widget request/behavior. | Changing weather display or its external API integration. |
| `BACKEND/CODE_PHP/*.php` | Server-side JSON API, business rules, and PHP helper modules. | Changing validation, authorization, state transitions, or API response shapes. |
| `BACKEND/CODE_PHP/db.php` | JSON persistence and shared data helpers. | Changing database structure, read/write behavior, or reusable data operations. |
| `BACKEND/QUERY/db.json` | Current persisted runtime state: heroes, signals, incidents, communications, and counters. | Inspecting or carefully migrating stored data; normally do not hand-edit for a feature. |
| `README.md` | Existing short project readme. | Updating the general project introduction or basic deployment notes. |

## 3. User-facing functions

### Dispatch terminal

The root `index.php` redirects visitors to `FRONT-END/DESIGN/index.html`. The dispatch terminal is the central operator interface. It brings together hero/operative data, active incidents and signals, threat level, and dispatch actions. Its browser code calls PHP endpoints to load or update state.

### Hero management

The compact admin page at `ADMIN_PANEL/index.html` and the full director console at `FRONT-END/DESIGN/admin_panel.html` create and manage heroes. Hero records include an ID, codename, skill, status, stats, and map position. `classified_data.php` requires a server-side director session before returning its dossier page. The admin console loads reserve dossier seed data from a director-session-protected endpoint rather than embedding it in public page source.

### Civilian reports

The civilian emergency and threat pages submit reports to `send_signal.php`. A report becomes a signal in the shared state and can then be reviewed through dispatch/admin screens.

### Incident dispatch

The dispatch backend handles assigning heroes to incidents and updating incident outcomes and threat level. `dispatch.php` is the endpoint associated with these actions. Check its current request/response fields and the terminal's caller before changing the dispatch contract.

### Chat and communications

`hero_channel.php` (which delegates to `chat.php`) accepts a message and optional hero/context data, including recent conversation history, then returns a JSON `reply`. It calls the Groq chat-completions API when configured and returns an explicit service error when the provider is unavailable rather than substituting a scripted reply. The browser retains recent conversations per hero in session storage. `secure_line.php` is used by the shared browser client and director console for secure-line communications.

### Security and system controls

The security pages interact with backend scripts such as `defcon.php` and `file_monitor.php`. Other backend scripts cover authentication, agent authorization, signal retrieval/clearing, state retrieval, action logging, and WAF checks. Follow the specific page's existing `fetch()` calls to identify the corresponding endpoint before modifying a workflow.

## 4. Backend and endpoint map

All PHP endpoints are in `BACKEND/CODE_PHP/`. The following is a file-purpose map based on endpoint names and observed client calls; inspect the PHP script and its callers before relying on undocumented fields.

| Endpoint/file | Apparent responsibility |
|---|---|
| `db.php` | Shared JSON storage, locking, and hero/data helpers; included by other PHP scripts. |
| `get_state.php` | Read overall system state for the terminal. |
| `get_heroes.php` | Return hero/operative records. |
| `add_hero.php`, `authorize_agent.php`, `delete_hero.php` | Create/authorize/remove hero records. |
| `dispatch.php` | Apply incident deployment/outcome actions. |
| `send_signal.php`, `get_signals.php`, `clear_signals.php` | Submit, retrieve, and clear civilian signals. |
| `chat.php`, `chat_admin.php` | Hero chat and admin chat functionality. |
| `secure_line.php` | Secure-line communications used by shared client helpers and admin UI. |
| `auth.php` | Shared authentication for the tactical terminal and director console; dispatcher access requires worker ID `123123` plus the existing dispatcher password. Accepts bounded JSON POST requests and compares passwords with `password_verify()` without running SQL. |
| `worker_accounts.php`, `worker_account_store.php` | Director-session-only dispatcher account creation, listing, and deletion. Passwords are stored as password hashes in protected `BACKEND/QUERY/worker_accounts.json`. |
| `auth_throttle.php` | File-backed login throttling: five failures per IP or worker ID in a rolling one-minute window, stored under protected `BACKEND/QUERY`. High Command displays the server-provided retry countdown. |
| `audit_log.php`, `audit_events.php` | Appends security events to `BACKEND/QUERY/audit.log`; only a director session can retrieve recent events. |
| `defcon.php` | DEFCON/threat-level controls. |
| `file_monitor.php`, `security_guard.php`, `waf.php` | Security monitoring, system-wide API lockdown enforcement, and request filtering/rate limiting. |
| `log_action.php` | Action logging. |
| `generate.php` | Data/content generation endpoint. |

**Important:** endpoint names and caller matches are a starting point, not a substitute for reading the implementation. Check HTTP method, expected JSON fields, validation, response shape, and every caller before changing or adding an endpoint.

All login screens submit to `auth.php`; credentials are checked against password hashes and are never interpolated into SQL. If authentication is later moved to a SQL database, use prepared statements for every credential lookup rather than relying on SQL-keyword filters.

## 5. Shared data and persistence

`BACKEND/CODE_PHP/db.php` stores state in `BACKEND/QUERY/db.json`. The state currently contains:

- `heroes`: operative records keyed by ID, with skill, status, stats, and coordinates.
- `signals`: civilian emergency/threat reports.
- `incidents`: active or completed dispatch incidents.
- `admin_comms`: director/dispatcher messages.
- `threat_level`: current threat level.
- `decorations`: map decoration records.
- `next_hero_id`, `next_signal_id`, and `next_comm_id`: ID counters.

The helper layer provides default initialization, reads, writes, and locked read-modify-write behavior. When changing stored data:

1. Read `db.php` and all affected endpoint callers first.
2. Preserve the existing JSON keys and response shape unless a coordinated migration is intended.
3. Update initialization/default data and any state-normalization logic if adding a field.
4. Keep write operations behind the existing database helpers; do not write around the shared locking logic.
5. Avoid committing live/test state changes in `db.json` unless data updates are specifically required.

## 6. How to add a feature safely

For a new or changed workflow, keep each layer's responsibility clear:

1. **UI:** edit the relevant page under `FRONT-END/DESIGN/`, `ADMIN_PANEL/`, or `CIVILIAN_CLIENT/`.
2. **Browser requests:** reuse or update `FRONT-END/REQUEST/api_client.js` when the request is shared; otherwise keep the page's existing request conventions consistent.
3. **API:** implement validation and business rules in the relevant script under `BACKEND/CODE_PHP/`. Return JSON in the format expected by the caller and report failures explicitly.
4. **Persistence:** use `db.php` helpers for data reads/writes and update defaults/normalization when the stored schema changes.
5. **Other consumers:** search for the endpoint, state key, or response field across all pages and scripts. A shared state change can affect the dispatch screen, both admin screens, civilian reports, and classified views.
6. **Verification:** run the project through a PHP-capable web server (not by opening the HTML file directly), then exercise both success and failure cases in the relevant UI. Check browser console/network responses and PHP logs.

Keep changes focused, preserve the existing visual theme and endpoint conventions, and avoid unrelated rewrites.

## 7. Local startup and configuration notes

- Serve the repository from a PHP-capable web server with the repository root as the web root. The pages call root-relative URLs such as `/BACKEND/CODE_PHP/...`; if deployed under a subdirectory, those paths may need configuration or correction.
- Ensure PHP can read and write `BACKEND/QUERY/db.json`.
- `BACKEND/QUERY` denies direct web access through its Apache `.htaccess` and IIS `web.config`. For Nginx or another server, configure an equivalent deny rule for this directory; these files do not remove the tracked JSON from source control or protect data returned by API endpoints.
- Classified dossiers require a PHP session established by director authentication. The director login defaults to the previous credential; set `DIRECTOR_PASSWORD_HASH` on the server to a `password_hash()` result for a strong, unique password to override it. The default is retained for compatibility and should be changed before public deployment. Serve the site over HTTPS so the session cookie is protected in transit.
- Create named dispatcher accounts from the director console's Worker Accounts & Audit panel. New passwords must be at least 12 characters; account hashes, login-throttle state, and the audit log are stored under `BACKEND/QUERY`, which must be writable by PHP and denied by the web server. The legacy shared dispatcher ID `123123` remains enabled for compatibility.
- Login attempts are limited to five failures per client IP or worker ID within ten minutes. The director console can view recent audit events, including authentication, account changes, classified-data access, dispatch actions, and DEFCON changes. Protect and back up audit data as operational records.
- Configure `SENTINEL_OVERRIDE_CODE` in the PHP server environment. The Sentinel page uses it to activate or restore DEFCON-1; do not put the value in source control.
- `security_guard.php` is included by the API endpoints. During DEFCON-1 it rejects API writes while preserving selected read-only status/monitoring endpoints. This does not block static website access or protect the web server/host itself.
- Weather display uses the external Open-Meteo API through `FRONT-END/REQUEST/weather.js`.
- Chat's external provider integration requires cURL and a Groq API key. Prefer the server environment variable `GROQ_API_KEY`; on InfinityFree, where environment variables may not be available, store a PHP file at `BACKEND/QUERY/groq_config.php` that returns the key as a string. This directory is denied by the included Apache/IIS rules. Never put a key in browser code, a public page, or a committed file.
- Review the Apache/IIS deny rules in `BACKEND/QUERY` and configure an equivalent deny rule for the production web server. Before public deployment, verify that direct requests for `db.json`, `worker_accounts.json`, `login_attempts.json`, and `audit.log` are denied; local checks do not verify the production host or proxy configuration.
- The project does not show a package manifest or automated test suite at the repository root. Before adding tools or dependencies, check whether the task truly needs them.

## 8. Priority checks for the next coding AI

Before implementing a feature, inspect the actual caller and endpoint together. In particular:

- Confirm root-relative paths work in the intended deployment environment.
- Keep secrets server-side. Review `chat.php` and admin authorization flows before deployment; credentials or shared authorization values must not be embedded in public HTML/PHP source.
- Preserve validation and authorization at the PHP endpoint. UI-only checks are not security controls.
- Avoid hiding server errors or returning success-shaped responses on failed storage/API operations.
- Treat `db.json` as live application state, not a disposable fixture.
- After changing an API, update every browser caller and test the full request/response path.
