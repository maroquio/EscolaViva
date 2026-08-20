# The Evolution of a SaaS — Reference Guide for AI Agents

> **Source:** the interactive course `Evolução de um SaaS` (`backend/bundles/saas-evolution/index.html`,
> constants `STAGES`, `C`, `LAYERS`, `TECH`, `GLOSSARY`).
> This document is the structured transcript of the course content, plus the compatibility rules an
> agent needs to follow in order to propose a system that survives all 14 stages without a rewrite.

---

## 1. What this document is for

This file is the *briefing* for an AI agent tasked with **proposing, designing or reviewing the
architecture of a SaaS**. The course describes a 14-stage trajectory, from 40 paying accounts to 700
thousand, in which **every component enters as the answer to a concrete pain** — never in
anticipation.

An agent instructed by this document must produce an architecture that satisfies, simultaneously, two
requirements that look contradictory:

1. **Start at Stage 01** — nothing beyond a web client, a monolithic application and a relational
   database.
2. **Be compatible with Stage 14** — each of the 13 stages that follow must be reachable by
   *addition*, not by rewrite.

The bridge between the two is **Section 5 (Compatibility Invariants)**: decisions that cost little on
day 1 and that, ignored, turn a future stage into a migration project.

### Suggested base prompt

```
You are going to propose the architecture of a SaaS for <domain>.

Read docs/SAAS_EVOLUTION.md and follow the pain-driven evolution model described in it:

1. Deliver Stage 01 in full (web client + modular monolith + relational database).
2. For each of the 14 stages, produce:
   - the pain trigger that authorises the component to enter in that context;
   - the metric or observable symptom that confirms the pain has arrived;
   - what changes in the code and in the infrastructure;
   - what stays deliberately out, and why.
3. Respect ALL the invariants in Section 5 from Stage 01 onward.
4. Never anticipate a component. If the component has no matching pain in the
   proposed stage, it does not enter — record it under "Deliberately left out".
```

---

## 2. The course's three principles

Every decision in the course derives from these three principles. The agent must be able to justify
any recommendation by citing one of them.

### 2.1 A component only enters after the pain

> "Simplicity here is not a shortcut, it is the right decision." — Stage 01

No component enters because of best practice, fashion or curriculum. Each stage starts with **what
hurt** (a concrete, measurable symptom) and only then introduces the component.

### 2.2 Every component charges permanent rent

> "Every component you add charges permanent rent: deploy, monitoring, on-call and somebody who
> understands it when it breaks."

The rent is paid forever and includes: one more deploy, one more monitoring target, one more entry in
the on-call rota, one more section of documentation, and the drag it puts on the next delivery. As
long as the rent is larger than the benefit, the component does not enter.

### 2.3 What stays out is a decision, not an oversight

Every stage of the course explicitly declares **what was deliberately left out**, with two pieces of
information: *why* and *enters when*. An architecture proposal without that list is incomplete — it
does not distinguish "we don't need this yet" from "we didn't think about it".

---

## 3. The layer model

The course diagram organises components into six layers. The first four form the system's vertical
axis; the last two are cross-cutting.

| # | Layer | What it is | Components |
|---|--------|---------|-------------|
| 01 | **Channels** | How the user gets in | Web Client |
| 02 | **Edge** | What answers before the application | CDN, Load Balancer, WAF and Rate Limiting, API Gateway |
| 03 | **Application** | Where the product happens | Monolithic Application, Message Queue, Async Worker, Extracted Service |
| 04 | **Data** | The source of truth and its supports | Relational Database, Object Storage, In-Memory Cache, Read Replica, Dedicated Search |
| — | **External** (integrations) | Third-party services | Payment Gateway, Messaging (E-mail/SMS) |
| — | **Operations** | How the system is observed and shipped | Observability, CI/CD and Tests, Distributed Tracing |

---

## 4. The 14 stages

### Overview

| # | Title | Components entering | Accounts | Team | Phase | Infra |
|---|--------|------------------------|--------|------|------|-------|
| 01 | The monolith that suffices | Web Client, Monolithic Application, Relational Database | 40 | 2 | Pre-seed | 1 server |
| 02 | Money enters the product | Payment Gateway | 300 | 3 | Pre-seed | 1 server |
| 03 | Files cannot live on the server | Object Storage | 900 | 4 | Seed | 1 server |
| 04 | The product needs to talk to the user | Messaging (E-mail/SMS) | 2,500 | 5 | Seed | 1 server |
| 05 | Take the slow thing out of the user's path | Message Queue, Async Worker | 6,000 | 7 | Seed | 2 servers |
| 06 | Bring the content closer to the user | CDN | 12,000 | 9 | Series A | 2 servers |
| 07 | Stop asking the database the same thing | In-Memory Cache | 25,000 | 12 | Series A | 3 servers |
| 08 | Stop having a single point of failure | Load Balancer | 45,000 | 18 | Series A | 6 instances |
| 09 | The edge becomes a target | WAF and Rate Limiting | 70,000 | 24 | Series B | 6 instances |
| 10 | Separate readers from writers | Read Replica | 110,000 | 30 | Series B | 6 instances |
| 11 | See what is happening | Observability | 180,000 | 40 | Series B | 12 instances |
| 12 | Ship without relying on heroics | CI/CD and Tests | 260,000 | 55 | Series B | 12 instances |
| 13 | Searching stops being filtering | Dedicated Search | 400,000 | 70 | Series C | 20 instances |
| 14 | The first service leaves the monolith | Extracted Service, API Gateway, Distributed Tracing | 700,000 | 110 across 9 teams | Series C | 40+ instances |

> The scale columns are an **order-of-magnitude reference**, not a trigger. The trigger is always the
> pain described under "What hurt". A B2B product with 400 very-high-value accounts may reach Stage 10
> before a B2C one with 200 thousand.

---

### Stage 01 — The monolith that suffices

**Enters:** Web Client · Monolithic Application · Relational Database
**Scale:** 40 active accounts · 2 people · Pre-seed · 1 server

**What hurt:** Nothing hurt yet. Two people, forty paying accounts and one support question a week.
The whole system fits in one repository, starts with one command and is debugged with one breakpoint.

**Why now:** Simplicity here is not a shortcut, it is the right decision. Every component you add
charges permanent rent: deploy, monitoring, on-call and somebody who understands it when it breaks.
As long as nobody feels pain, that rent is larger than the benefit.

**Deliberately left out:** Queue · Cache · Replica · Microservices
*Why:* none of them solves a problem this system has today.
*Enters when:* one at a time, when a concrete pain shows up — the thirteen stages that follow are
exactly those pains.

---

### Stage 02 — Money enters the product

**Enters:** Payment Gateway
**Scale:** 300 accounts · 3 people · Pre-seed · 1 server

**What hurt:** The product left the free plan behind and had to charge for subscriptions. Nobody on
the team wanted to store card numbers, or deal with fraud and chargebacks.

**Why now:** Payments are a regulated problem, with anti-fraud, instalments and disputes. The gateway
handles that and keeps the sensitive data off your server: the card goes from the browser straight to
them, and you are left with an opaque identifier and a webhook.

**Left out:** Message queue.
*Why:* the gateway's notification is processed inline, inside the same request — at this volume that
works. *Enters when:* processing takes long enough that the gateway assumes you did not answer and
resends the notification.

---

### Stage 03 — Files cannot live on the server

**Enters:** Object Storage
**Scale:** 900 accounts · 4 people · Seed · 1 server

**What hurt:** Users started attaching documents. The files went to the local disk — and vanished in
Tuesday's deploy, when the container was replaced by a new one.

**Why now:** An application server has to be disposable. Any state living on it is lost in the next
deploy and makes a second machine impossible.

**Left out:** CDN.
*Why:* the files are served by the application server itself; with small traffic concentrated in one
region, that does not hurt. *Enters when:* there are users far from the server, or when bandwidth
becomes a meaningful line on the bill.

---

### Stage 04 — The product needs to talk to the user

**Enters:** Messaging (E-mail / SMS)
**Scale:** 2,500 accounts · 5 people · Seed · 1 server

**What hurt:** Sign-up confirmation, password reset and billing-failure notices became part of the
flow. The first attempts with a self-hosted mail server landed in spam.

**Why now:** Delivering e-mail reliably depends on IP and domain reputation, SPF and DKIM
authentication and relationships with providers. It is continuous work with no competitive edge.

**Left out:** Message queue · Worker.
*Why:* e-mail goes out inside the request; the user waits for the provider to answer.
*Enters when:* the first day the provider gets slow — that is the next stage.

---

### Stage 05 — Take the slow thing out of the user's path

**Enters:** Message Queue · Async Worker
**Scale:** 6,000 accounts · 7 people · Seed · 2 servers

**What hurt:** The e-mail provider had a bad afternoon and started answering in nine seconds. Because
sending happened inside the request, finishing sign-up began to time out. The entire product looked
down because of one e-mail.

**Why now:** The queue decouples whoever asks from whoever executes. The application writes, publishes
the task and answers immediately; the worker processes when it can and retries on failure. A
third-party failure stops turning into your failure.

**Left out:** Separate services.
*Why:* queue and worker run the same code, in the same repository and against the same database — only
the entry point changed. *Enters when:* different teams need to ship at different rhythms.

---

### Stage 06 — Bring the content closer to the user

**Enters:** CDN
**Scale:** 12,000 accounts · 9 people · Series A · 2 servers

**What hurt:** Customers in other regions reported slow pages, and measurement confirmed it: everything
came from a single region. The bandwidth bill was already the second-largest line.

**Why now:** The CDN keeps a copy of static content close to whoever is accessing it and absorbs most
requests before they reach the origin. You gain latency and capacity without changing the application.

**Left out:** Caching dynamic content.
*Why:* the CDN only holds static files. *Enters when:* repeated reads from the database become the
bottleneck — and then the answer is an in-memory cache, not a CDN.

---

### Stage 07 — Stop asking the database the same thing

**Enters:** In-Memory Cache
**Scale:** 25,000 accounts · 12 people · Series A · 3 servers

**What hurt:** The home dashboard runs the same heavy query on every load, and users reload it several
times an hour. The database was living above 85% CPU.

**Why now:** The cache holds the finished result and returns it in microseconds. That defers the much
larger cost of scaling the data layer. **The indexes were reviewed first: cache is what is left after
you have exhausted the cheap options.**

**Left out:** Caching critical data.
*Why:* balances, permissions and availability still come straight from the database. *Enters when:*
probably never — not every piece of data should be cached.

---

### Stage 08 — Stop having a single point of failure

**Enters:** Load Balancer
**Scale:** 45,000 accounts · 18 people · Series A · 6 instances

**What hurt:** Every deploy took the system down for three minutes, and deploys became daily. Worse:
there was only one server, so a hardware problem would have meant an entire morning offline.

**Why now:** The balancer spreads traffic across instances, runs a health check on each and pulls the
failing one out of rotation. It is what lets you bring the new version up before taking the old one
down, and survive the loss of a machine.

**Left out:** Database redundancy.
*Why:* the application now scales, the database does not — it is now the only single point of failure
left. *Enters when:* heavy reads and critical writes start competing for the same database.

---

### Stage 09 — The edge becomes a target

**Enters:** WAF and Rate Limiting
**Scale:** 70,000 accounts · 24 people · Series B · 6 instances

**What hurt:** A competitor started scraping public data en masse, and the login screen began taking
credential stuffing with leaked password lists. Some customer accounts were compromised.

**Why now:** Filtering that inside the application means paying the cost of processing the attack. The
WAF blocks known patterns and limits the rate per origin and per account before the request reaches
the server, protecting capacity and users at the same time.

**Left out:** Two-factor authentication.
*Why:* the WAF reduces the volume of the attack, but does not stop a correct, leaked password from
working. *Enters when:* the data you hold justifies the extra friction at login.

---

### Stage 10 — Separate readers from writers

**Enters:** Read Replica
**Scale:** 110,000 accounts · 30 people · Series B · 6 instances

**What hurt:** Customers got reports and exports. Every month-end, the analytical queries locked the
database up and the product was slow for everyone for hours.

**Why now:** Reporting and operations have opposite requirements: one reads a lot and tolerates
seconds of lag, the other writes little and needs an immediate answer. The replica isolates the two.
As a bonus, it is a promotion candidate if the primary fails.

**Left out:** Data warehouse.
*Why:* the replica serves operational reporting, not historical analysis; cohort and retention queries
would overload the replica just the same. *Enters when:* there is a data team with questions the
product does not answer.

---

### Stage 11 — See what is happening

**Enters:** Observability
**Scale:** 180,000 accounts · 40 people · Series B · 12 instances

**What hurt:** A forty-minute incident was discovered through a customer e-mail. With a dozen
disposable instances, there was no longer anywhere to "log into the server and look at the log".

**Why now:** Centralised logs, metrics and alerts turn assumption into measurement. The goal is not a
pretty dashboard: it is reducing the time between the problem starting and somebody knowing about it,
and then the time until they understand the cause.

**Left out:** Distributed tracing.
*Why:* it is almost all a single process; the application profiler already answers where the time
went. *Enters when:* a request starts crossing more than one process.

---

### Stage 12 — Ship without relying on heroics

**Enters:** CI/CD and Tests
**Scale:** 260,000 accounts · 55 people · Series B · 12 instances

**What hurt:** With six teams touching the same code, a manual Friday deploy broke billing. The fix
took two hours because nobody knew for sure what had gone to production.

**Why now:** The pipeline runs the checks on every commit, produces an immutable artefact and ships
gradually, with a fast rollback. Deploying stops being an event and becomes routine — and it is the
routine that makes fast fixes possible when something slips through.

**Left out:** Full test coverage.
*Why:* testing everything is expensive and ages badly; the pipeline covers the critical path — sign in,
perform the main action, get charged. *Enters when:* never as a goal — coverage grows where there has
already been an incident.

---

### Stage 13 — Searching stops being filtering

**Enters:** Dedicated Search
**Scale:** 400,000 accounts · 70 people · Series C · 20 instances

**What hurt:** Search became the product's front door. With wildcard queries against the database, a
typo found nothing and every search scanned the whole table. It became the slowest endpoint in the
system.

**Why now:** An inverted index handles typo tolerance, synonyms, relevance and facets — things a
relational database was not designed to do. It only pays off when search is a core feature, not when
it is a list with a filter.

**Left out:** Search as the source of truth.
*Why:* the index is a copy updated with lag; if the price changed two seconds ago, search may still
show the old one. It exists so the user can find the item, but whoever decides price, availability and
permission at confirmation time is still the database.
*Enters when:* never — a copy does not become the source of truth.

---

### Stage 14 — The first service leaves the monolith

**Enters:** Extracted Service · API Gateway · Distributed Tracing
**Scale:** 700,000 accounts · 110 people across 9 teams · Series C · 40+ instances

**What hurt:** Billing had a dedicated team, its own change cycle and different compliance
requirements. Even so, every tweak queued behind the same deploy as the rest of the product.

**Why now:** The extraction happened **because of an organisational pain, not a fashion**. The chosen
domain had a clear boundary and a defined owner — the two criteria that matter. The gateway gives API
consumers a single door: the app keeps calling one address, without needing to know there are now two
systems behind it. And tracing recovers the visibility lost in the split: inside the monolith one
function called another and the profiler showed the whole path; now that call crosses the network.

**Left out:** The remaining domains.
*Why:* the rest of the system stays monolithic, by choice — each extracted service charges its own
deploy, on-call and coordination. *Enters when:* one at a time, and only when there is a team to pay
that bill.

---

## 5. Compatibility invariants

This is the operative section for the agent. These are the decisions that **must exist at Stage 01**
so that stages 02–14 are additions and not rewrites. All of them cost little on day 1.

| # | Invariant | Stage it unlocks | Cost if ignored |
|---|-----------|--------------------------|-------------------|
| I1 | **Modular monolith**: folders per domain (`billing/`, `identity/`, `scheduling/`) that only talk through public interfaces, with the rule checked by the build tooling | 14 | Extraction becomes a rewrite; "big ball of mud" within two years |
| I2 | **Stateless application**: no state in process memory or on the local disk; session in a signed cookie or a shared store | 03, 08 | Permanent sticky sessions; a second instance becomes impossible |
| I3 | **Side effects behind an interface** (`Mailer`, `FileStorage`, `PaymentGateway`): the synchronous call of Stage 04 becomes a queue publish at Stage 05 by swapping the implementation | 05 | Every send site has to be rewritten individually |
| I4 | **Idempotency on every external input**: webhooks and jobs record the event identifier before processing | 02, 05 | Double billing; queue redelivery corrupts data |
| I5 | **The database is the single source of truth**; cache, search index and replica are projections that never decide anything | 07, 10, 13 | Price, permission or balance read from a stale copy |
| I6 | **Versioned migrations** in the repository, applied in the same order in every environment, with a compatibility window (never drop a column the previous version still reads) | 08, 12 | Zero-downtime deploys become impossible |
| I7 | **Backup with a tested restore** (not just a backup) and point-in-time recovery | 01 → always | "An unverified backup is not a backup" |
| I8 | **Integrity in the database**: foreign keys, uniqueness and check constraints, not just in the application | 01 → always | Someone writes directly and the model breaks |
| I9 | **The object key, not the full URL**, stored in the database for files | 03, 06 | Storage-provider migration blocked |
| I10 | **Assets versioned in the filename** (`app.9f2c1b.js`) with a long TTL | 06 | Manual CDN purges; users on the old file for minutes |
| I11 | **Never cache an authenticated response without separating by user** | 06, 07 | Delivering one customer's data to another — the gravest mistake on the list |
| I12 | **`X-Forwarded-For` read correctly** as soon as any proxy sits in front | 06, 08, 09 | Rate limiting and abuse investigation stop working |
| I13 | **A `/health` that checks dependencies** (not just "I'm alive") + connection draining at shutdown | 08 | A broken instance stays in rotation |
| I14 | **Application timeout smaller than the balancer's** | 08 | The user sees a 504, the log records success, nobody finds the problem |
| I15 | **Explicit read/write routing per query** (one function, even if it always points at the primary at first) | 10 | A read after a write shows stale data to whoever just saved |
| I16 | **Correlation ID generated at the edge** and propagated through logs, HTTP headers and message metadata | 11, 14 | The trail breaks exactly at the asynchronous boundary |
| I17 | **Structured logs, with no personal data and no secrets** | 11 | A compliance problem created by observability itself |
| I18 | **Configuration from environment variables, secrets outside the repository** | 12 | A secret in a pipeline file, read by a lot of people |
| I19 | **Immutable, versioned artefact** (the same image in every environment) | 12 | "It works in staging" |
| I20 | **Distributed lock on every periodic job** | 05, 08 | The job runs twice when there are two instances |
| I21 | **Domain events published through an outbox** (same transaction as the data) once the queue arrives | 05, 14 | Data and events drift apart |
| I22 | **Real validation always on the server**; client-side validation is only quick feedback | 01 → always | Business rules visible, editable and unauditable |

---

## 6. Component catalogue

A condensed reference. For each component: when it enters, what it costs and the traps the course
highlights.

### Channels

**Web Client** — *Channel*
An interface in the browser. In the beginning it is HTML rendered by the monolith itself: no separate
project, no parallel build, no public API to version.
*When:* from day 1. The real question is when to split it out — the honest answer is usually "when
there is a front-end team".
*Costs:* a separate SPA doubles deploys and forces you to create a versioned public API.
*Traps:* trusting client-side validation; adopting an SPA **by default**; putting business rules in
the browser.
*Technologies:* HTML+CSS · htmx/Hotwire · React/Vue · Session cookies.

> **The trap is the "by default", not the SPA.** EscolaViva at Stage 01 is a React SPA over
> `/api/v1`, and it paid the price named above line by line: two build artefacts, a contract with a
> version number, validation written twice, and a guardian who downloads JavaScript before the report
> card. What separates the decision from the trap is that the bill was read before it was signed and
> written down where the next reader finds it — Section 3 of
> [`ESCOLAVIVA_STAGE_01.md`](./ESCOLAVIVA_STAGE_01.md), with what was rejected alongside it and why.
> Adopting an SPA because it is what everybody uses is the trap; adopting one with the cost measured
> and recorded is a decision. The costs above did not become smaller by being chosen deliberately.

### Edge

**CDN** — *Stage 06*
Copies of static content close to whoever is accessing it; the first layer to receive the request.
*Costs:* a cache serves stale content when invalidation is wrong; one more layer between you and the
defect.
*Traps:* caching an authenticated response without separating by user; publishing a new file under the
same name and relying on a purge; a long TTL on content that changes; forgetting `X-Forwarded-For`.
*Technologies:* Cloudflare · CloudFront · Fastly · Cache-Control + version in the filename.

**Load Balancer** — *Stage 08*
Distributes requests across instances and pulls out the ones failing the health check.
*Costs:* forces the application to be stateless; multiplies the instances to observe.
*Traps:* a health check that does not check dependencies; missing draining; sticky sessions as a
permanent solution; a balancer timeout smaller than the application's.
*Technologies:* ALB/NLB · Nginx · HAProxy · Traefik.

**WAF and Rate Limiting** — *Stage 09*
An edge filter that inspects the request before it reaches the application.
*Costs:* an aggressive rule blocks a paying customer; it adds latency.
*Traps:* turning managed rules straight to blocking mode; treating the WAF as a substitute for secure
code; limiting by IP only; not recording what was blocked.
*Technologies:* Cloudflare WAF · AWS WAF · Token bucket · Bot management.

**API Gateway** — *Stage 14*
The single door of the public API: validates tokens, applies policy and routes.
*When:* only when there is more than one service behind the same API. With a single service, the load
balancer already does the job.
*Costs:* a central point of failure; one more network hop.
*Traps:* business rules in the gateway configuration; turning it into an integration bus; assuming
"behind the gateway" means secure.
*Technologies:* Kong · Amazon API Gateway · Envoy · JWT with scopes.

### Application

**Monolithic Application** — *Stage 01*
One process with all the business rules. One repository, one deploy, one transaction.
*When:* the correct starting point for practically every new product. You only leave when coordinating
deploys across teams hurts more than the network between services.
*Costs:* an isolated failure takes down the whole process; it scales as a single block.
*Traps:* confusing a monolith with a mess; swapping it for microservices to solve a code problem — the
network does not fix coupling.
*Technologies:* Rails/Django/Laravel · Spring Boot · .NET · Node+NestJS.

**Message Queue** — *Stage 05*
A durable intermediary between whoever asks and whoever executes.
*Costs:* trades an immediate answer for eventual consistency; one more stateful component.
*Traps:* assuming exactly-once delivery; not monitoring queue depth; ignoring the dead-letter queue;
passing large objects in the message instead of the identifier.
*Technologies:* RabbitMQ · NATS/JetStream · Amazon SQS · Redis+Sidekiq · DLQ.

**Async Worker** — *Stage 05*
Consumes the queue. The same application code, with a different entry point.
*Costs:* doubles the deploy surface; failures are invisible by default.
*Traps:* a new worker reading a task enqueued by the old code; a periodic job without a lock; a long
task with no resume point; treating the worker as a place without rules.
*Technologies:* Sidekiq/Celery · BullMQ · Distributed lock · Exponential backoff.

**Extracted Service** — *Stage 14*
The first piece pulled out of the monolith, with its own database, deploy and team.
*When:* when distinct teams contend for the same deploy and one part has different scale, compliance or
rhythm requirements. Extracting for fashion is the most expensive mistake on the list.
*Costs:* local transactions become distributed coordination; a function call becomes a network call.
*Traps:* extracting and keeping a shared database (the worst of both worlds); slicing by technical
layer; synchronous call chains; starting with ten services at once.
*Technologies:* Versioned contract · Domain events · Database per service · Outbox pattern.

### Data

**Relational Database** — *Stage 01*
The source of truth, with transactions and constraints.
*When:* from day one. It solves more cases, for longer, than the public discussion about scalability
suggests.
*Costs:* it is the stateful component; it becomes the natural bottleneck — nearly every later evolution
exists to take load off it.
*Traps:* a backup that is never restored; integrity only in the application; a destructive migration
with no compatibility window; a missing index discovered only in production.
*Technologies:* PostgreSQL · MySQL · Backup + point-in-time recovery · Versioned migrations.

**Object Storage** — *Stage 03*
Remote disk for files; each file becomes a URL. It gives the server back its disposability.
*Costs:* it is not a filesystem; egress is a surprise on the bill.
*Traps:* a "temporarily" public bucket; trusting the file extension instead of the actual content;
storing the full URL instead of the key; routing every upload through the application server,
reintroducing the very bottleneck the component came to remove.
*Technologies:* Amazon S3 · Cloudflare R2 · MinIO · Pre-signed URLs.

**In-Memory Cache** — *Stage 07*
Key-value in memory for expensive, repeated responses.
*When:* when measurement shows the same read repeating. **Before that, a well-placed index solves the
same problem for far less.**
*Costs:* invalidation is a hard problem; it creates a path where the system works "almost always".
*Traps:* using a cache to hide a badly written query; a cache with no expiry; cache stampedes; caching
data that has to be correct (balance, permission, stock).
*Technologies:* Redis · Memcached · Cache-aside · TTL with jitter.

**Read Replica** — *Stage 10*
A copy of the primary that serves queries only.
*Costs:* replication lag; the application now decides query by query; doubled cost in the most
expensive layer.
*Traps:* reading from the replica right after writing to the primary; **confusing a replica with a
backup** — it copies the mistake faithfully, including the `DELETE` without a clause; not monitoring
lag; promoting without a rehearsed procedure.
*Technologies:* Streaming replication · Read/write splitting · Automatic failover · Lag monitor.

**Dedicated Search** — *Stage 13*
An inverted index specialised in text.
*When:* when search becomes a core feature. Before that, PostgreSQL's native full-text search does the
job very well.
*Costs:* one more copy of the data, which will drift; its own operations (shards, replicas,
reindexing); relevance is continuous tuning.
*Traps:* treating the index as the source of truth; having no full reindex; syncing through a
synchronous write trigger; exposing the query language to the end user.
*Technologies:* OpenSearch/Elasticsearch · Meilisearch · Event-driven sync · Scheduled reindexing.

### External

**Payment Gateway** — *Stage 02*
Processes cards, bank slips and Pix. Card data never touches your server.
*Costs:* a per-transaction fee, permanently; you inherit the vendor's availability; migrating gateways
later is a project, not a configuration change.
*Traps:* a webhook without idempotency; treating the webhook as the source of truth without
reconciling against the API; storing any part of the card; modelling a subscription as a boolean on the
user and then being unable to explain the billing history.
*Technologies:* Stripe · Mercado Pago · Pagar.me · Idempotent webhooks.

**Messaging (E-mail / SMS)** — *Stage 04*
Delivers transactional e-mail and short messages.
*Costs:* a per-message cost; deliverability is accumulated reputation.
*Traps:* mixing marketing and transactional on the same domain; sending synchronously inside the
request; not handling hard bounces; sensitive data in the e-mail body.
*Technologies:* Amazon SES/Resend · Twilio · SPF+DKIM+DMARC · Versioned templates.

### Operations

**Observability** — *Stage 11*
Centralised logs, metrics and alerts.
*Costs:* log volume gets expensive fast; too many alerts create fatigue and the team stops looking.
*Traps:* alerting on causes instead of symptoms (alert that user latency went up, not that CPU is at
80%); recording personal data in logs; a dashboard with no alert; averages only — they hide tail
latency.
*Technologies:* Grafana+Prometheus · OpenTelemetry · Datadog · Sentry.

**CI/CD and Tests** — *Stage 12*
Automatic checks on every commit and delivery with no manual step.
*Costs:* a test suite is code and ages; a slow pipeline makes the team route around it.
*Traps:* flaky tests; chasing coverage as a number; a secret in the pipeline file; a rollback that has
never been executed under pressure.
*Technologies:* GitHub Actions · GitLab CI · Jenkins · Argo CD · Canary deploy · Feature flags.

**Distributed Tracing** — *Stage 14*
An identifier that crosses gateway, services, queue and database, producing a timeline.
*Costs:* instrumentation has to exist in every service; sampling is mandatory at high volume; storing
traces is expensive at scale.
*Traps:* propagating context over the API but not over the queue, cutting the trail at the asynchronous
boundary; uniformly low sampling; instrumenting only the edge; sensitive data in span attributes.
*Technologies:* OpenTelemetry · Jaeger/Tempo · Context propagation · Tail-based sampling.

---

## 7. Antipatterns the agent must refuse

Direct refusals, with the justification the course offers:

1. **Starting with microservices.** "The network does not fix coupling — it makes it more expensive."
   An extracted service is Stage 14, and for an organisational pain.
2. **Cache before index.** "Cache is what is left after you have exhausted the cheap options."
3. **A queue before anything slow sits in the user's path.** The Stage 05 queue exists because an
   external provider started answering in nine seconds.
4. **A CDN to solve database load.** A CDN holds static files; repeated database reads are a cache
   problem.
5. **Dedicated search for a list with a filter.** PostgreSQL's native full-text search handles it very
   well before that.
6. **A replica as a backup strategy.** The replica copies the mistake faithfully.
7. **An API Gateway with a single service behind it.** The load balancer already does the job.
8. **Distributed tracing in a monolith.** The local profiler already answers the question.
9. **Chasing test coverage as a number.** Covering the critical path is worth more.
10. **Extracting a service while keeping a shared database.** Monolith coupling with network latency.

---

## 8. Expected output format from the agent

For each proposed stage, the agent must deliver exactly these fields — the same skeleton the course
uses:

```markdown
### Stage NN — <short, concrete title>

**Enters:** <components>
**Reference scale:** <accounts> · <team> · <phase> · <infra>

**What hurt:** <observable symptom, with a number where possible>
**Measurement signal:** <the metric that confirms the pain — p95, database CPU, queue depth…>

**Why now:** <why this component and not another; what it removes from the path>

**What changes:**
- Code: <concrete changes>
- Infrastructure: <new resources>
- Operations: <what enters the on-call rota and the monitoring>

**Permanent rent:** <the ongoing cost being taken on>

**Deliberately left out:** <list>
- *Why:* <justification>
- *Enters when:* <concrete trigger>

**Invariants exercised:** <I1, I4, I16…>
```

---

## 9. Where this content lives in the repository

| Artefact | Path |
|----------|---------|
| Interactive bundle (source of truth for the content) | `backend/bundles/saas-evolution/index.html` |
| Bundle packaging and CSP notes | `backend/bundles/saas-evolution/README.md` |
| Course seed in the LMS | `backend/src/infrastructure/database/seeds/seedSaasEvolutionCourse.ts` |
| Full-bleed rendering in the portal | `frontend/src/utils/courseExperience.ts` (`isSingleArtifactCourse`) |

Whenever the course content changes (`STAGES`, `C`, `GLOSSARY` in `index.html`), this document goes
stale — update both together.
