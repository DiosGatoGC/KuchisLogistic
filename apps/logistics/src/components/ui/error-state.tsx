import { Button } from "./button";

export function ErrorState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="state-block state-block--error" role="alert">
      <span className="state-block__mark" aria-hidden="true">
        !
      </span>
      <h2>{title}</h2>
      <p>{message}</p>
      {actionLabel && onAction && (
        <Button type="button" variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
