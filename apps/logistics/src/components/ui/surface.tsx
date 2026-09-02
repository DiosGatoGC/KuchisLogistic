export function Surface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`surface ${className}`.trim()}>{children}</section>;
}
