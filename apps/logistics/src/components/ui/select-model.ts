export interface SelectModelOption {
  value: string;
  disabled?: boolean;
}

function enabledIndexes(options: readonly SelectModelOption[]) {
  return options.flatMap((option, index) => option.disabled ? [] : [index]);
}

export function initialSelectIndex(
  options: readonly SelectModelOption[],
  value: string,
) {
  const selected = options.findIndex((option) => option.value === value && !option.disabled);
  if (selected >= 0) return selected;
  return enabledIndexes(options)[0] ?? -1;
}

export function moveSelectIndex(
  options: readonly SelectModelOption[],
  currentIndex: number,
  direction: 1 | -1,
) {
  const enabled = enabledIndexes(options);
  if (enabled.length === 0) return -1;
  const position = enabled.indexOf(currentIndex);
  if (position < 0) return direction === 1 ? enabled[0]! : enabled.at(-1)!;
  return enabled[(position + direction + enabled.length) % enabled.length]!;
}

export function selectValueAt(
  options: readonly SelectModelOption[],
  index: number,
) {
  const option = options[index];
  return option && !option.disabled ? option.value : null;
}

export function selectedOptionLabel(
  options: readonly (SelectModelOption & { label: string })[],
  value: string,
  placeholder: string,
) {
  return options.find((option) => option.value === value)?.label ?? placeholder;
}
