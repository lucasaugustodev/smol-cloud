import { Link } from "react-router-dom";

const agents = [
  { slug: "code", icon: "\uD83D\uDCBB", name: "Code Assistant" },
  { slug: "spider", icon: "\uD83D\uDD77\uFE0F", name: "Web Scraper" },
  { slug: "chart", icon: "\uD83D\uDCCA", name: "Data Analyst" },
  { slug: "server", icon: "\uD83D\uDDA5\uFE0F", name: "System Admin" },
  { slug: "pencil", icon: "\u270F\uFE0F", name: "Content Writer" },
  { slug: "flask", icon: "\uD83E\uDDEA", name: "API Tester" },
  { slug: "folder", icon: "\uD83D\uDCC1", name: "File Organizer" },
  { slug: "search", icon: "\uD83D\uDD0D", name: "Research Agent" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 pt-32 pb-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          AI Agents API in one command.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-gray-400">
          Open source infrastructure for AI agents. Install, configure, deploy.
          Any model via OpenRouter.
        </p>
        <div className="mt-8 rounded-lg bg-gray-900 border border-gray-800 px-6 py-4 font-mono text-sm text-green-400">
          $ npx agentsincloud init
        </div>
        <div className="mt-8 flex gap-4">
          <Link
            to="/agents"
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-500 transition"
          >
            Get Started
          </Link>
          <a
            href="https://github.com/lucasaugustodev/smol-cloud"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-gray-700 px-6 py-3 font-medium text-gray-300 hover:border-gray-500 transition"
          >
            GitHub
          </a>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold">How it works</h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {[
            { step: "1", title: "Install", desc: "One command to set up everything" },
            { step: "2", title: "Configure", desc: "Add your OpenRouter API key" },
            { step: "3", title: "Use the API", desc: "REST API ready for your products" },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center"
            >
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold">
                {item.step}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-gray-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Agent templates */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold">Agent Templates</h2>
        <p className="mt-3 text-center text-gray-400">
          Pre-built agents ready to use
        </p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map((a) => (
            <Link
              key={a.slug}
              to={`/agents/${a.slug}`}
              className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-blue-500 transition"
            >
              <span className="text-2xl">{a.icon}</span>
              <span className="font-medium">{a.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold">Pricing</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8">
            <h3 className="text-xl font-bold">Self-Hosted</h3>
            <p className="mt-1 text-3xl font-bold">Free</p>
            <p className="mt-1 text-sm text-gray-400">forever</p>
            <ul className="mt-6 space-y-2 text-sm text-gray-300">
              <li>Unlimited agents</li>
              <li>Your own server</li>
              <li>MIT License</li>
            </ul>
          </div>
          <div className="rounded-xl border border-blue-600 bg-gray-900 p-8">
            <h3 className="text-xl font-bold">Cloud</h3>
            <p className="mt-1 text-3xl font-bold">Pay as you go</p>
            <p className="mt-1 text-sm text-gray-400">starting at $5</p>
            <ul className="mt-6 space-y-2 text-sm text-gray-300">
              <li>No infra needed</li>
              <li>Managed hosting</li>
              <li>Auto-scaling</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 text-center text-sm text-gray-500">
        <div className="flex items-center justify-center gap-6">
          <a
            href="https://github.com/lucasaugustodev/smol-cloud"
            target="_blank"
            rel="noreferrer"
            className="hover:text-gray-300 transition"
          >
            GitHub
          </a>
          <Link to="/docs" className="hover:text-gray-300 transition">
            Documentation
          </Link>
          <span>MIT License</span>
        </div>
      </footer>
    </div>
  );
}
