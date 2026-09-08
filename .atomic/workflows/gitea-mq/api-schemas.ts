import { Type } from "typebox";

export const App = Type.Object({
  id: Type.Integer(),
  slug: Type.String(),
  owner: Type.Object({ login: Type.String() }),
  permissions: Type.Record(Type.String(), Type.String()),
  events: Type.Array(Type.String()),
});
export const AppInstallation = Type.Object({
  app_id: Type.Integer(),
  installation_id: Type.Integer(),
  repositories: Type.Array(Type.String()),
});
export const Installation = Type.Object({
  id: Type.Integer(),
  app_id: Type.Integer(),
  app_slug: Type.String(),
  permissions: Type.Record(Type.String(), Type.String()),
  account: Type.Object({ login: Type.String() }),
});
export const InstallationPages = Type.Array(Type.Object({
  total_count: Type.Integer(),
  installations: Type.Array(Installation),
}));
export const RepositoryPages = Type.Array(Type.Object({
  total_count: Type.Integer(),
  repositories: Type.Array(Type.Object({ full_name: Type.String() })),
}));
export const CollaboratorPages = Type.Array(Type.Array(Type.Object({
  login: Type.String(),
  type: Type.String(),
  permissions: Type.Record(Type.String(), Type.Boolean()),
})));
export const CheckRun = Type.Object({
  id: Type.Integer(),
  name: Type.String(),
  status: Type.String(),
  conclusion: Type.Union([Type.String(), Type.Null()]),
  completed_at: Type.Union([Type.String(), Type.Null()]),
  app: Type.Object({ id: Type.Integer() }),
});
export const CheckPages = Type.Array(Type.Object({ check_runs: Type.Array(CheckRun) }));
export const Pull = Type.Object({
  number: Type.Integer(),
  head: Type.Object({ sha: Type.String() }),
  base: Type.Object({ ref: Type.String() }),
  labels: Type.Array(Type.Object({ name: Type.String() })),
  auto_merge: Type.Unknown(),
  merged_at: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export const EventPages = Type.Array(Type.Array(Type.Object({
  event: Type.String(),
  actor: Type.Object({ login: Type.String() }),
  created_at: Type.String(),
  label: Type.Optional(Type.Object({ name: Type.String() })),
})));
export const StatusPages = Type.Array(Type.Array(Type.Object({
  context: Type.String(),
  state: Type.String(),
  id: Type.Integer(),
})));
export const DnsPlan = Type.Object({
  resource_changes: Type.Array(Type.Object({
    mode: Type.String(),
    type: Type.String(),
    address: Type.String(),
    change: Type.Object({ actions: Type.Array(Type.String()), after: Type.Unknown() }),
  })),
});
export const DnsRecord = Type.Object({
  name: Type.Literal("mq.scientistexperience.net"),
  type: Type.Literal("CNAME"),
  content: Type.Literal("magnetite.scientistexperience.net"),
  proxied: Type.Literal(false),
});
export const S1Configuration = Type.Object({
  values: Type.Boolean(),
  service: Type.Boolean(),
  resources: Type.Boolean(),
  credentials: Type.Boolean(),
  bindings: Type.Boolean(),
  ownership: Type.Boolean(),
  environment: Type.Boolean(),
  appId: Type.Integer(),
  vhost: Type.Boolean(),
  nixbot: Type.Boolean(),
  pre: Type.Unknown(),
});
