import { FormEvent, ReactNode, useMemo, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Database,
  ExternalLink,
  Home,
  ListFilter,
  LogIn,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  User,
  Users,
  X,
} from "lucide-react";
import { useDirectoryData } from "./lib/useDirectoryData";
import type {
  AuthStatus,
  DirectoryMode,
  DirectoryTool,
  SortKey,
  ToolComment,
  ToolMetrics,
  ToolSuggestion,
} from "./types";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "highest-rated", label: "Highest Rated" },
  { value: "most-rated", label: "Most Rated" },
  { value: "most-used", label: "Most Used" },
  { value: "newest", label: "Newest" },
];

function metricFor(
  metrics: Record<string, ToolMetrics>,
  toolId: string,
): ToolMetrics {
  return (
    metrics[toolId] ?? {
      toolId,
      averageRating: null,
      ratingCount: 0,
      useCount: 0,
      commentCount: 0,
    }
  );
}

function formatRating(metric: ToolMetrics): string {
  return metric.ratingCount > 0 && metric.averageRating !== null
    ? metric.averageRating.toFixed(1)
    : "New";
}

function formatDate(value: string | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function statusTone(status: string): string {
  if (status === "Beta") return "border-saffron/50 bg-saffron/10 text-amber-800";
  if (status === "Initiative") return "border-coral/40 bg-coral/10 text-red-800";
  return "border-spruce/35 bg-spruce/10 text-spruce";
}

function App() {
  const directory = useDirectoryData();
  const [authOpen, setAuthOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function runAction(action: () => Promise<void>, success?: string) {
    try {
      await action();
      if (success) setToast(success);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Action failed");
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Header
        auth={directory.auth}
        mode={directory.mode}
        onAuthOpen={() => setAuthOpen(true)}
      />
      {(directory.notice || toast) && (
        <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6">
          <div className="flex items-start justify-between gap-3 rounded-md border border-saffron/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>{toast ?? directory.notice}</span>
            <button
              type="button"
              className="rounded p-1 hover:bg-amber-100"
              aria-label="Dismiss notice"
              onClick={() => setToast(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <Routes>
        <Route
          path="/"
          element={
            <DirectoryPage
              categories={directory.categories}
              comments={directory.comments}
              loading={directory.loading}
              metrics={directory.metrics}
              ratings={directory.ratings}
              tools={directory.tools}
              uses={directory.uses}
              onRate={(toolId, rating) =>
                runAction(() => directory.rateTool(toolId, rating))
              }
              onToggleUse={(toolId) =>
                runAction(() => directory.toggleUse(toolId))
              }
            />
          }
        />
        <Route
          path="/tools/:slug"
          element={
            <ToolDetailPage
              auth={directory.auth}
              comments={directory.comments}
              metrics={directory.metrics}
              ratings={directory.ratings}
              tools={directory.tools}
              uses={directory.uses}
              onAddComment={(toolId, displayName, body) =>
                runAction(
                  () => directory.addComment(toolId, displayName, body),
                  directory.mode === "supabase"
                    ? "Comment submitted for moderation."
                    : "Comment added."
                )
              }
              onRate={(toolId, rating) =>
                runAction(() => directory.rateTool(toolId, rating))
              }
              onToggleUse={(toolId) =>
                runAction(() => directory.toggleUse(toolId))
              }
            />
          }
        />
        <Route
          path="/suggest"
          element={
            <SuggestPage
              categories={directory.categories}
              onSubmit={(suggestion) =>
                runAction(
                  () => directory.submitSuggestion(suggestion),
                  "Suggestion submitted for review."
                )
              }
            />
          }
        />
        <Route
          path="/admin"
          element={
            <AdminPage
              auth={directory.auth}
              comments={directory.comments}
              suggestions={directory.suggestions}
              tools={directory.tools}
              onModerateComment={(commentId, status) =>
                runAction(() => directory.moderateComment(commentId, status))
              }
              onModerateSuggestion={(suggestionId, status) =>
                runAction(() => directory.moderateSuggestion(suggestionId, status))
              }
              onRefresh={() => runAction(() => directory.refresh())}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {authOpen && (
        <AccountPanel
          auth={directory.auth}
          mode={directory.mode}
          onClose={() => setAuthOpen(false)}
          onSignIn={(email) =>
            runAction(
              () => directory.signIn(email),
              "Sign-in link sent. Check your email."
            )
          }
          onSignOut={() =>
            runAction(() => directory.signOut(), "Returned to guest session.")
          }
          onUpgrade={(email) =>
            runAction(
              () => directory.upgradeAnonymous(email),
              "Verification link sent. Confirm it to preserve this guest account."
            )
          }
        />
      )}
    </div>
  );
}

function Header({
  auth,
  mode,
  onAuthOpen,
}: {
  auth: AuthStatus;
  mode: DirectoryMode;
  onAuthOpen: () => void;
}) {
  return (
    <header className="section-band sticky top-0 z-30 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-spruce text-white">
            <Database className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold sm:text-lg">AI Tools Directory</p>
            <p className="hidden text-xs text-ink/60 sm:block">
              Science, research, coding, writing, and creative workflows
            </p>
          </div>
        </Link>
        <nav className="flex items-center gap-2">
          <Link className="btn hidden sm:inline-flex" to="/" title="Directory">
            <Home className="h-4 w-4" />
            Directory
          </Link>
          <Link className="btn" to="/suggest" title="Suggest a tool">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Suggest</span>
          </Link>
          {auth.isAdmin && (
            <Link className="btn" to="/admin" title="Admin moderation">
              <ShieldCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
          <button className="btn" type="button" onClick={onAuthOpen}>
            {auth.isAnonymous ? <User className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            <span className="hidden sm:inline">
              {mode === "local"
                ? "Local Guest"
                : auth.email ?? (auth.loading ? "Loading" : "Guest")}
            </span>
          </button>
        </nav>
      </div>
    </header>
  );
}

function DirectoryPage({
  categories,
  comments,
  loading,
  metrics,
  ratings,
  tools,
  uses,
  onRate,
  onToggleUse,
}: {
  categories: string[];
  comments: ToolComment[];
  loading: boolean;
  metrics: Record<string, ToolMetrics>;
  ratings: Record<string, number>;
  tools: DirectoryTool[];
  uses: Record<string, boolean>;
  onRate: (toolId: string, rating: number) => void;
  onToggleUse: (toolId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortKey>("highest-rated");

  const approvedComments = comments.filter((comment) => comment.status === "approved");
  const newestDate = tools
    .map((tool) => tool.lastChecked)
    .sort()
    .at(-1);

  const filteredTools = useMemo(() => {
    const terms = normalize(query)
      .split(/\s+/)
      .filter(Boolean);
    return tools
      .filter((tool) => {
        const categoryMatch = category === "All" || tool.category === category;
        if (!categoryMatch) return false;
        if (terms.length === 0) return true;
        const haystack = normalize(
          [
            tool.name,
            tool.category,
            tool.bestFor,
            tool.pricing,
            tool.strengths,
            tool.caveats,
            tool.status,
          ].join(" "),
        );
        return terms.every((term) => haystack.includes(term));
      })
      .sort((a, b) => {
        const aMetric = metricFor(metrics, a.id);
        const bMetric = metricFor(metrics, b.id);
        if (sort === "most-rated") {
          return bMetric.ratingCount - aMetric.ratingCount || a.name.localeCompare(b.name);
        }
        if (sort === "most-used") {
          return bMetric.useCount - aMetric.useCount || a.name.localeCompare(b.name);
        }
        if (sort === "newest") {
          return b.lastChecked.localeCompare(a.lastChecked) || a.name.localeCompare(b.name);
        }
        const aRating = aMetric.averageRating ?? 0;
        const bRating = bMetric.averageRating ?? 0;
        return (
          bRating - aRating ||
          bMetric.ratingCount - aMetric.ratingCount ||
          a.name.localeCompare(b.name)
        );
      });
  }, [category, metrics, query, sort, tools]);

  return (
    <main>
      <section className="section-band">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <h1 className="sr-only">AI Tools Directory</h1>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <span className="pill">
                <Database className="h-3.5 w-3.5 text-spruce" />
                {tools.length} tools
              </span>
              <span className="pill">
                <MessageSquare className="h-3.5 w-3.5 text-coral" />
                {approvedComments.length} comments
              </span>
              <span className="pill">
                <RefreshCw className="h-3.5 w-3.5 text-saffron" />
                Checked {formatDate(newestDate)}
              </span>
            </div>
            <div className="panel p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px] lg:grid-cols-[minmax(0,1fr)_280px]">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-ink/40" />
                  <input
                    className="control pl-10"
                    placeholder="Search tools, strengths, pricing"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label className="relative">
                  <ListFilter className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-ink/40" />
                  <select
                    className="control pl-10"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortKey)}
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <div className="flex gap-2 overflow-x-auto pb-3">
          {["All", ...categories].map((item) => (
            <button
              type="button"
              key={item}
              className={`min-w-24 shrink-0 rounded-md border px-4 py-2 text-sm font-semibold transition ${
                category === item
                  ? "border-spruce bg-spruce text-white"
                  : "border-line bg-white text-ink hover:border-spruce/70"
              }`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mb-4 flex items-center justify-between gap-3 text-sm text-ink/65">
          <span>
            {loading ? "Loading" : `${filteredTools.length} matching tools`}
          </span>
          {category !== "All" && (
            <button className="btn h-9" type="button" onClick={() => setCategory("All")}>
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredTools.map((tool) => (
            <ToolCard
              key={tool.id}
              metric={metricFor(metrics, tool.id)}
              rating={ratings[tool.id] ?? 0}
              tool={tool}
              used={Boolean(uses[tool.id])}
              onRate={onRate}
              onToggleUse={onToggleUse}
            />
          ))}
        </div>
        {filteredTools.length === 0 && (
          <div className="panel mt-8 p-8 text-center">
            <p className="font-semibold">No tools matched.</p>
            <p className="mt-1 text-sm text-ink/65">Adjust search or category filters.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function ToolCard({
  metric,
  rating,
  tool,
  used,
  onRate,
  onToggleUse,
}: {
  metric: ToolMetrics;
  rating: number;
  tool: DirectoryTool;
  used: boolean;
  onRate: (toolId: string, rating: number) => void;
  onToggleUse: (toolId: string) => void;
}) {
  return (
    <article className="panel flex min-h-[320px] flex-col p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/tools/${tool.slug}`}
            className="text-lg font-bold leading-snug hover:text-spruce"
          >
            {tool.name}
          </Link>
          <p className="mt-1 text-sm text-ink/60">{tool.category}</p>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-bold ${statusTone(tool.status)}`}>
          {tool.status}
        </span>
      </div>
      <p className="text-sm font-semibold text-spruce">{tool.bestFor}</p>
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-ink/78">
        {tool.strengths}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="pill">{tool.pricing}</span>
        <span className="pill">{formatDate(tool.lastChecked)}</span>
      </div>
      <div className="mt-auto pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-ink/50">Rating</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xl font-bold">{formatRating(metric)}</span>
              <span className="text-xs text-ink/55">({metric.ratingCount})</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase text-ink/50">Users</p>
            <p className="mt-1 text-xl font-bold">{metric.useCount}</p>
          </div>
        </div>
        <StarInput value={rating} onChange={(value) => onRate(tool.id, value)} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn" type="button" onClick={() => onToggleUse(tool.id)}>
            {used ? <Check className="h-4 w-4 text-spruce" /> : <Users className="h-4 w-4" />}
            {used ? "Using" : "I use this"}
          </button>
          <a
            className="btn"
            href={tool.websiteUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-4 w-4" />
            Visit
          </a>
        </div>
      </div>
    </article>
  );
}

function StarInput({
  value,
  onChange,
  size = "sm",
}: {
  value: number;
  onChange: (value: number) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex items-center gap-1" aria-label="Rate from 1 to 5 stars">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className="rounded-md p-1 text-saffron transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-saffron/30"
          title={`Rate ${star} star${star === 1 ? "" : "s"}`}
          onClick={() => onChange(star)}
        >
          <Star
            className={size === "md" ? "h-7 w-7" : "h-5 w-5"}
            fill={star <= value ? "currentColor" : "none"}
          />
        </button>
      ))}
    </div>
  );
}

function ToolDetailPage({
  auth,
  comments,
  metrics,
  ratings,
  tools,
  uses,
  onAddComment,
  onRate,
  onToggleUse,
}: {
  auth: AuthStatus;
  comments: ToolComment[];
  metrics: Record<string, ToolMetrics>;
  ratings: Record<string, number>;
  tools: DirectoryTool[];
  uses: Record<string, boolean>;
  onAddComment: (toolId: string, displayName: string, body: string) => void;
  onRate: (toolId: string, rating: number) => void;
  onToggleUse: (toolId: string) => void;
}) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const tool = tools.find((item) => item.slug === slug);

  if (!tool) return <Navigate to="/" replace />;

  const metric = metricFor(metrics, tool.id);
  const toolComments = comments.filter((comment) => comment.toolId === tool.id);
  const visibleComments = toolComments.filter(
    (comment) =>
      comment.status === "approved" ||
      comment.userId === auth.userId ||
      auth.isAdmin,
  );

  return (
    <main>
      <section className="section-band">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <button className="btn mb-5" type="button" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="pill">{tool.category}</span>
                <span className={`rounded-md border px-2 py-1 text-xs font-bold ${statusTone(tool.status)}`}>
                  {tool.status}
                </span>
              </div>
              <h1 className="text-3xl font-bold leading-tight sm:text-5xl">{tool.name}</h1>
              <p className="mt-4 max-w-3xl text-lg font-semibold text-spruce">
                {tool.bestFor}
              </p>
              <p className="mt-4 max-w-3xl leading-7 text-ink/78">{tool.strengths}</p>
            </div>
            <div className="panel p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <MetricBox label="Rating" value={formatRating(metric)} detail={`${metric.ratingCount} votes`} />
                <MetricBox label="Using" value={`${metric.useCount}`} detail="people" />
                <MetricBox label="Reviews" value={`${metric.commentCount}`} detail="approved" />
              </div>
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-2 text-sm font-semibold">Your rating</p>
                <StarInput
                  value={ratings[tool.id] ?? 0}
                  onChange={(value) => onRate(tool.id, value)}
                  size="md"
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="btn" type="button" onClick={() => onToggleUse(tool.id)}>
                  {uses[tool.id] ? <Check className="h-4 w-4 text-spruce" /> : <Users className="h-4 w-4" />}
                  {uses[tool.id] ? "Using" : "I use this"}
                </button>
                <a className="btn btn-primary" href={tool.websiteUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Visit
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <InfoBlock title="Access and Caveats">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-semibold text-ink/55">Access / Pricing</dt>
                <dd className="mt-1 font-semibold">{tool.pricing}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-ink/55">Last Checked</dt>
                <dd className="mt-1 font-semibold">{formatDate(tool.lastChecked)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm font-semibold text-ink/55">Caveats / Notes</dt>
                <dd className="mt-1 leading-7 text-ink/78">{tool.caveats}</dd>
              </div>
            </dl>
          </InfoBlock>
          <InfoBlock title="Comments">
            <CommentForm onSubmit={(displayName, body) => onAddComment(tool.id, displayName, body)} />
            <div className="mt-5 space-y-3">
              {visibleComments.map((comment) => (
                <CommentItem key={comment.id} comment={comment} />
              ))}
              {visibleComments.length === 0 && (
                <p className="rounded-md border border-line bg-white p-4 text-sm text-ink/65">
                  No approved comments yet.
                </p>
              )}
            </div>
          </InfoBlock>
        </div>
        <aside className="space-y-5">
          <InfoBlock title="Links">
            <div className="space-y-2">
              <a className="btn w-full justify-between" href={tool.websiteUrl} target="_blank" rel="noreferrer">
                Official site
                <ExternalLink className="h-4 w-4" />
              </a>
              <a className="btn w-full justify-between" href={tool.sourceUrl} target="_blank" rel="noreferrer">
                Source / verified
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </InfoBlock>
          <InfoBlock title="Category">
            <Link className="btn w-full justify-between" to="/">
              {tool.category}
              <Home className="h-4 w-4" />
            </Link>
          </InfoBlock>
        </aside>
      </section>
    </main>
  );
}

function MetricBox({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-line bg-paper/70 p-3">
      <p className="text-xs font-semibold uppercase text-ink/50">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="text-xs text-ink/55">{detail}</p>
    </div>
  );
}

function InfoBlock({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="panel p-4">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function CommentForm({
  onSubmit,
}: {
  onSubmit: (displayName: string, body: string) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [body, setBody] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(displayName, body);
    setBody("");
  }

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <input
        className="control"
        placeholder="Display name (optional)"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
      />
      <textarea
        className="control min-h-28 py-3"
        placeholder="Share a comment or review"
        required
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <button className="btn btn-primary justify-self-start" type="submit">
        <MessageSquare className="h-4 w-4" />
        Submit
      </button>
    </form>
  );
}

function CommentItem({ comment }: { comment: ToolComment }) {
  return (
    <article className="rounded-md border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{comment.displayName || "Guest"}</p>
        <div className="flex items-center gap-2">
          {comment.status !== "approved" && (
            <span className="rounded-md border border-saffron/40 bg-saffron/10 px-2 py-1 text-xs font-semibold text-amber-800">
              {comment.status}
            </span>
          )}
          <time className="text-xs text-ink/50">
            {new Intl.DateTimeFormat(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            }).format(new Date(comment.createdAt))}
          </time>
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap leading-7 text-ink/78">{comment.body}</p>
    </article>
  );
}

function SuggestPage({
  categories,
  onSubmit,
}: {
  categories: string[];
  onSubmit: (
    suggestion: Omit<ToolSuggestion, "id" | "userId" | "status" | "createdAt">,
  ) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    category: categories[0] ?? "",
    bestFor: "",
    pricing: "",
    websiteUrl: "",
    notes: "",
    displayName: "",
    contactEmail: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      name: form.name.trim(),
      category: form.category.trim(),
      bestFor: form.bestFor.trim(),
      pricing: form.pricing.trim(),
      websiteUrl: form.websiteUrl.trim(),
      notes: form.notes.trim(),
      displayName: form.displayName.trim() || null,
      contactEmail: form.contactEmail.trim() || null,
    });
    setForm({
      name: "",
      category: categories[0] ?? "",
      bestFor: "",
      pricing: "",
      websiteUrl: "",
      notes: "",
      displayName: "",
      contactEmail: "",
    });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link className="btn mb-5" to="/">
        <ArrowLeft className="h-4 w-4" />
        Directory
      </Link>
      <section className="panel p-5">
        <h1 className="text-2xl font-bold">Suggest a Tool</h1>
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <Field label="Tool name">
            <input
              className="control"
              required
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </Field>
          <Field label="Category">
            <select
              className="control"
              value={form.category}
              onChange={(event) => update("category", event.target.value)}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Best for">
            <input
              className="control"
              required
              value={form.bestFor}
              onChange={(event) => update("bestFor", event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Access / Pricing">
              <input
                className="control"
                value={form.pricing}
                onChange={(event) => update("pricing", event.target.value)}
              />
            </Field>
            <Field label="Official link">
              <input
                className="control"
                required
                type="url"
                value={form.websiteUrl}
                onChange={(event) => update("websiteUrl", event.target.value)}
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              className="control min-h-28 py-3"
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name">
              <input
                className="control"
                value={form.displayName}
                onChange={(event) => update("displayName", event.target.value)}
              />
            </Field>
            <Field label="Contact email">
              <input
                className="control"
                type="email"
                value={form.contactEmail}
                onChange={(event) => update("contactEmail", event.target.value)}
              />
            </Field>
          </div>
          <button className="btn btn-primary justify-self-start" type="submit">
            <Plus className="h-4 w-4" />
            Submit for Review
          </button>
        </form>
      </section>
    </main>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      {children}
    </label>
  );
}

function AdminPage({
  auth,
  comments,
  suggestions,
  tools,
  onModerateComment,
  onModerateSuggestion,
  onRefresh,
}: {
  auth: AuthStatus;
  comments: ToolComment[];
  suggestions: ToolSuggestion[];
  tools: DirectoryTool[];
  onModerateComment: (
    commentId: string,
    status: "approved" | "rejected",
  ) => void;
  onModerateSuggestion: (
    suggestionId: string,
    status: "approved" | "rejected",
  ) => void;
  onRefresh: () => void;
}) {
  const pendingComments = comments.filter((comment) => comment.status === "pending");
  const pendingSuggestions = suggestions.filter(
    (suggestion) => suggestion.status === "pending",
  );
  const toolNameById = Object.fromEntries(tools.map((tool) => [tool.id, tool.name]));

  if (!auth.isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <section className="panel p-6">
          <ShieldCheck className="h-8 w-8 text-spruce" />
          <h1 className="mt-3 text-2xl font-bold">Admin Moderation</h1>
          <p className="mt-2 text-ink/70">Admin role required.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Admin Moderation</h1>
          <p className="mt-1 text-sm text-ink/65">
            {pendingComments.length} comments and {pendingSuggestions.length} tool suggestions pending
          </p>
        </div>
        <button className="btn" type="button" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="mb-4 text-lg font-bold">Comments</h2>
          <div className="space-y-3">
            {pendingComments.map((comment) => (
              <ModerationItem
                key={comment.id}
                title={toolNameById[comment.toolId] ?? "Tool"}
                meta={comment.displayName ?? "Guest"}
                body={comment.body}
                onApprove={() => onModerateComment(comment.id, "approved")}
                onReject={() => onModerateComment(comment.id, "rejected")}
              />
            ))}
            {pendingComments.length === 0 && <EmptyModeration />}
          </div>
        </section>
        <section className="panel p-4">
          <h2 className="mb-4 text-lg font-bold">Tool Suggestions</h2>
          <div className="space-y-3">
            {pendingSuggestions.map((suggestion) => (
              <ModerationItem
                key={suggestion.id}
                title={suggestion.name}
                meta={`${suggestion.category} · ${suggestion.websiteUrl}`}
                body={suggestion.notes || suggestion.bestFor}
                onApprove={() => onModerateSuggestion(suggestion.id, "approved")}
                onReject={() => onModerateSuggestion(suggestion.id, "rejected")}
              />
            ))}
            {pendingSuggestions.length === 0 && <EmptyModeration />}
          </div>
        </section>
      </div>
    </main>
  );
}

function ModerationItem({
  body,
  meta,
  onApprove,
  onReject,
  title,
}: {
  body: string;
  meta: string;
  onApprove: () => void;
  onReject: () => void;
  title: string;
}) {
  return (
    <article className="rounded-md border border-line bg-white p-4">
      <p className="font-bold">{title}</p>
      <p className="mt-1 break-words text-xs text-ink/55">{meta}</p>
      <p className="mt-3 whitespace-pre-wrap leading-6 text-ink/75">{body}</p>
      <div className="mt-4 flex gap-2">
        <button className="btn btn-primary" type="button" onClick={onApprove}>
          <Check className="h-4 w-4" />
          Approve
        </button>
        <button className="btn btn-danger" type="button" onClick={onReject}>
          <X className="h-4 w-4" />
          Reject
        </button>
      </div>
    </article>
  );
}

function EmptyModeration() {
  return (
    <p className="rounded-md border border-line bg-paper/60 p-4 text-sm text-ink/65">
      Nothing pending.
    </p>
  );
}

function AccountPanel({
  auth,
  mode,
  onClose,
  onSignIn,
  onSignOut,
  onUpgrade,
}: {
  auth: AuthStatus;
  mode: DirectoryMode;
  onClose: () => void;
  onSignIn: (email: string) => void;
  onSignOut: () => void;
  onUpgrade: (email: string) => void;
}) {
  const [email, setEmail] = useState("");

  function submit(action: (email: string) => void) {
    action(email);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/30 p-3 sm:place-items-center">
      <section className="panel w-full max-w-md p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Account</h2>
            <p className="mt-1 text-sm text-ink/60">
              {mode === "local"
                ? "Local browser session"
                : auth.email ?? "Anonymous Supabase session"}
            </p>
          </div>
          <button className="btn h-9 w-9 p-0" type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {mode === "local" ? (
          <p className="rounded-md border border-line bg-paper/70 p-4 text-sm text-ink/70">
            Add Supabase env vars to enable persistent guest identities and account sign-in.
          </p>
        ) : auth.isAnonymous ? (
          <div className="space-y-4">
            <div className="grid gap-3">
              <input
                className="control"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => submit(onUpgrade)}
              >
                <User className="h-4 w-4" />
                Preserve Guest
              </button>
              <button className="btn" type="button" onClick={() => submit(onSignIn)}>
                <LogIn className="h-4 w-4" />
                Email Link
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="rounded-md border border-line bg-paper/70 p-4 text-sm font-semibold">
              {auth.email}
            </p>
            <button className="btn w-full" type="button" onClick={onSignOut}>
              Sign Out
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
