import type {
  Product,
  SimulationAddition,
  SimulationItem,
} from "@/types/catalog";

function createLineId(): string {
  return crypto.randomUUID();
}

export function normalizeAdditions(
  additions: SimulationAddition[],
): SimulationAddition[] {
  return [...additions].sort((left, right) => left.id.localeCompare(right.id));
}

export function haveSameAdditionIds(
  left: SimulationAddition[],
  right: SimulationAddition[],
): boolean {
  if (left.length !== right.length) return false;

  const normalizedLeft = normalizeAdditions(left);
  const normalizedRight = normalizeAdditions(right);

  return normalizedLeft.every(
    (addition, index) => addition.id === normalizedRight[index]?.id,
  );
}

export function hasSameConfiguration(
  item: SimulationItem,
  product: Product,
  additions: SimulationAddition[],
): boolean {
  return (
    item.product.id === product.id &&
    haveSameAdditionIds(item.additions, additions)
  );
}

export function addSimulationUnit(
  items: SimulationItem[],
  product: Product,
  additions: SimulationAddition[] = [],
): SimulationItem[] {
  const normalizedAdditions = normalizeAdditions(additions);
  const existingItem = items.find((item) =>
    hasSameConfiguration(item, product, normalizedAdditions),
  );

  if (existingItem) {
    return items.map((item) =>
      item.lineId === existingItem.lineId
        ? { ...item, quantity: item.quantity + 1 }
        : item,
    );
  }

  return [
    ...items,
    {
      lineId: createLineId(),
      product,
      quantity: 1,
      additions: normalizedAdditions,
    },
  ];
}

export function customizeSimulationUnit(
  items: SimulationItem[],
  sourceLineId: string,
  additions: SimulationAddition[],
): SimulationItem[] {
  const sourceItem = items.find((item) => item.lineId === sourceLineId);

  if (!sourceItem || haveSameAdditionIds(sourceItem.additions, additions)) {
    return items;
  }

  const itemsWithoutCustomizedUnit = items.flatMap((item) => {
    if (item.lineId !== sourceLineId) return [item];
    if (item.quantity === 1) return [];
    return [{ ...item, quantity: item.quantity - 1 }];
  });

  return addSimulationUnit(
    itemsWithoutCustomizedUnit,
    sourceItem.product,
    additions,
  );
}

export function incrementSimulationLine(
  items: SimulationItem[],
  lineId: string,
): SimulationItem[] {
  return items.map((item) =>
    item.lineId === lineId
      ? { ...item, quantity: item.quantity + 1 }
      : item,
  );
}

export function decrementSimulationLine(
  items: SimulationItem[],
  lineId: string,
): SimulationItem[] {
  return items.flatMap((item) => {
    if (item.lineId !== lineId) return [item];
    if (item.quantity === 1) return [];
    return [{ ...item, quantity: item.quantity - 1 }];
  });
}

export function removeSimulationLine(
  items: SimulationItem[],
  lineId: string,
): SimulationItem[] {
  return items.filter((item) => item.lineId !== lineId);
}

export function getSimulationUnitPrice(item: SimulationItem): number {
  return (
    Number(item.product.price) +
    item.additions.reduce(
      (total, addition) => total + Number(addition.price),
      0,
    )
  );
}

export function getSimulationLineTotal(item: SimulationItem): number {
  return getSimulationUnitPrice(item) * item.quantity;
}

export function getSimulationTotal(items: SimulationItem[]): number {
  return items.reduce(
    (total, item) => total + getSimulationLineTotal(item),
    0,
  );
}
