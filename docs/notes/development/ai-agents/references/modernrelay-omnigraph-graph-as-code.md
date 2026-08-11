---
title: "Omnigraph: a graph database designed for agents"
source: https://modernrelay.com/articles/graph-as-code
publication: Modern Relay
date: 2026-07-24
retrieved: 2026-08-11
extraction: trafilatura 2.2.0 --markdown --formatting --links
note: >
    Verbatim extraction. Bare language-label lines emitted by the site
    (for example a line reading "[pg]") were folded into the following code fence info string.
---

[← All articles](https://modernrelay.com/articles)

07.24.26 · Modern Relay

# Omnigraph: a graph database designed for agents

Databases were built around a separation of user, workflow, and operator. Agents collapse all three into one caller — so the whole database becomes a declarative surface.

Databases have long assumed a separation of concerns. A user issues queries. A workflow moves data on a schedule someone else defined. An operator owns the schema, the indexes, the permissions, and the deployment. The three roles run on different clocks, answer to different people, and touch the system through different surfaces.

An agent is all three at once. It reads like a user, executes multi-step work like a workflow, and — given the chance — alters schemas, adds indexes, and requests permissions like an operator. The separation that shaped database design for decades collapses into a single caller. That raises a design question worth taking seriously: what should a database look like when one participant occupies every role?

Our answer is Omnigraph, and the shape of the answer is that the database stops being a service you operate through side channels and becomes a declarative definition you can read.

## Graph as code

The reference point is infrastructure as code. Terraform did not make servers easier to click through; it made the desired state of an entire environment a text artifact that could be diffed, reviewed, and applied. Omnigraph applies the same move to a graph database. One declarative definition covers the schema, the named queries, the policies, the embedding providers, the dashboards, and the deployment topology.

This matters for agents for a specific reason: the whole definition fits in a context window. An agent does not have to discover the system by probing it. It reads the definition, reasons about what exists, and proposes a change to the same artifact a human would review. The database definition becomes the primary operating surface rather than documentation that trails behind the real configuration.

## Schema as code

A schema file declares node and edge types with their properties, constraints, cardinality, and embeddings. It is a checked artifact, not a convention:

```pg
node Person {
  name: String
  role: String?
  bio: String?
  bio_vec: Vector(1536) @embed("bio")
  @key(name)
  @index(role)
}
node Document {
  title: String
  body: String
  @key(title)
}
edge Wrote: Person -> Document @card(0..*)
```
Two properties of this arrangement matter for agents. The first is inspection before action: an agent can read the schema and know what is representable before it writes anything, instead of discovering constraints by triggering errors. The second is that types bound improvisation. An agent cannot invent a property that does not exist or attach an edge between types the schema forbids, because the write is rejected at the boundary rather than absorbed into the data.

The schema also serves a second function that is easy to miss. It is the reasoning ontology — the vocabulary the agent thinks in. Changes to it are diffs against a declared state, planned and applied, rather than hand-written migrations executed out of band.

## Context as code

Agents need stable ways to assemble context, not ad-hoc query strings regenerated on every run. Named queries are declared alongside the schema, type-checked against it, and versioned with it. Each one becomes a tool an agent can call by name:

```gq
query find_experts($topic: String) {
  match { $p: Person { } }
  return {
    $p.name,
    $p.role,
    rrf( nearest($p.bio_vec, $topic), bm25($p.bio, $topic) ) as score
  }
  order { score desc }
  limit 10
}
```
Retrieval modes compose in one runtime. A single query can traverse relationships, run a vector search, score text with BM25, and fuse the two rankings with reciprocal rank fusion. The agent does not orchestrate three systems and reconcile their results; it calls one declared capability and gets a ranked answer.

Because the query is named and versioned, its behavior is reviewable. When context assembly changes, the change appears as a diff in the same repository as the schema, rather than as a modified prompt somewhere in an agent's source.

## Branches

Every agent works on its own branch. Useful work merges; the rest is discarded. This is the mechanism that makes agent writes safe to permit at all:

```bash
omnigraph branch create agent/enrich-q3 graph.omni
omnigraph load --data findings.jsonl --mode append \
  --branch agent/enrich-q3 graph.omni
omnigraph branch merge agent/enrich-q3 --into main graph.omni
```
An agent that can be wrong on an isolated branch can be given far more surface than one whose every write lands in shared state. The cost of a mistake falls to the cost of not merging it.

Branching also blurs a distinction the industry has treated as fixed. An agent loop reads context, traverses relationships, runs searches, and writes results back — analytical and transactional work in the same session, against the same graph, without an export step between them.

## Policy as code

Governance is declarative and versioned like everything else. A policy states who may do what, on which graph and branch, under which identity:

```yaml
version: 1
groups:
  agents: [act-research-agent, act-enrichment-agent]
protected_branches: [main]
rules:
  - id: agents-read-and-write-off-main
    allow:
      actors: { group: agents }
      actions: [read, change]
      branch_scope: unprotected
  - id: agents-may-open-and-propose
    allow:
      actors: { group: agents }
      actions: [branch_create, branch_merge]
      target_branch_scope: unprotected
```
Writing policy this way changes what happens when an agent is blocked. In a system where permissions live in an admin console, a denial is an opaque wall. Here the agent can read the policy that denied it, identify the missing grant, and propose the change as a reviewable diff. The permission boundary becomes part of the workflow rather than a hidden gate outside it.

## Interface as code

A system whose schema changes often cannot be served by a hand-built interface; the interface is stale the week after it ships. So the interface is generated from the same definitions. A dashboard is declared, not implemented:

```yaml
version: 1
title: Open decisions
cells:
  - lens: table
    query:
      kind: Decision
      where: status = "open"
      order_by: [urgency desc]
      project: [title, owner, urgency, updated_at]
    props:
      columns: [title, owner, urgency, updated_at]
```
People still need to see records, correct them, and review what agents proposed. Deriving those surfaces from the schema and the queries means they track the model automatically instead of falling behind it.

## Deployment and sovereignty

Because the whole deployment is declared, where it runs becomes a configuration choice rather than a product decision. The same definition can be applied to a managed cluster, an air-gapped environment, or a hybrid of the two:

```yaml
version: 1
metadata:
  name: company-brain
storage: s3://acme-knowledge/clusters/company-brain
graphs:
  knowledge:
    schema: knowledge.pg
    queries: queries/
policies:
  base:
    file: base.policy.yaml
    applies_to: [cluster, knowledge]
```
Storage and compute scale independently, since the graph lives on object storage. The same graph can be served through different surfaces, and the whole deployment can be recreated from its definition with a single apply.

This is also what makes the sovereignty claim concrete rather than rhetorical. The data sits in the company's own bucket in an open format; the definition sits in the company's own repository; the engine is open source. Nothing about the arrangement requires trusting a vendor to remain reasonable.

The through-line is a single idea: when one participant is user, workflow, and operator at once, every part of the system it touches should be a declarative artifact it can read, reason about, and propose changes to. Schema, context, policy, interface, and deployment stop being separate consoles and become one reviewable definition.
