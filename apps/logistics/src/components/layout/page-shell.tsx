export function PageShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`page-shell ${className}`.trim()}>{children}</div>;
}
