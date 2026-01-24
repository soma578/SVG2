type Props = {
  label: string
  href?: string
}

export default function CreditBadge({ label, href }: Props) {
  const content = (
    <span className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-medium text-gray-700 bg-white/90 border border-gray-200 rounded-full shadow-sm">
      {label}
    </span>
  )
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="pointer-events-auto hover:shadow transition"
    >
      {content}
    </a>
  ) : content
}
