import { Link } from "react-router-dom";

const iconMap: Record<string, string> = {
  code: "\uD83D\uDCBB",
  spider: "\uD83D\uDD77\uFE0F",
  chart: "\uD83D\uDCCA",
  server: "\uD83D\uDDA5\uFE0F",
  pencil: "\u270F\uFE0F",
  flask: "\uD83E\uDDEA",
  folder: "\uD83D\uDCC1",
  search: "\uD83D\uDD0D",
  bot: "\uD83E\uDD16",
};

interface Props {
  slug: string;
  name: string;
  model: string;
  category?: string;
}

export default function AgentCard({ slug, name, model, category }: Props) {
  const icon = iconMap[slug] ?? iconMap.bot ?? "\uD83E\uDD16";

  return (
    <Link
      to={`/agents/${slug}`}
      className="group rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-blue-500 transition"
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">{icon}</span>
        <div>
          <h3 className="font-semibold group-hover:text-blue-400 transition">
            {name}
          </h3>
          <p className="text-xs text-gray-500">{model}</p>
        </div>
      </div>
      {category && (
        <span className="mt-3 inline-block rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-400">
          {category}
        </span>
      )}
    </Link>
  );
}
