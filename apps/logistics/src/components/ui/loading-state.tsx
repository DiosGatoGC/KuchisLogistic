export function LoadingState({
  label,
  fullScreen = false,
}: {
  label: string;
  fullScreen?: boolean;
}) {
  return (
    <div
      className={fullScreen ? "state-screen" : "state-block"}
      role="status"
      aria-live="polite"
    >
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
