const DEFAULT_FLOORS = ["Piso 1", "Piso 2", "Piso 3", "Piso 4", "Piso 5"];

export function getFloorList(floor) {
  return String(floor || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getFloorNumber(floor) {
  const match = String(floor || "").match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

function sortFloors(a, b) {
  const numberA = getFloorNumber(a);
  const numberB = getFloorNumber(b);

  if (numberA !== null && numberB !== null && numberA !== numberB) {
    return numberA - numberB;
  }

  return String(a).localeCompare(String(b), "es", { numeric: true });
}

export function getFloorOptions(items = [], defaults = DEFAULT_FLOORS) {
  const floors = items.flatMap((item) => getFloorList(item.floor));
  return [...new Set([...defaults, ...floors])].sort(sortFloors);
}

export function itemHasFloor(itemFloor, selectedFloor, scopeType) {
  if (!selectedFloor) return true;
  const lowerSelected = String(selectedFloor).toLowerCase();
  if (lowerSelected === "vertical el" || lowerSelected === "vertical_el") {
    return scopeType === "vertical_el";
  }
  if (lowerSelected === "vertical tc" || lowerSelected === "vertical_tc") {
    return scopeType === "vertical_tc";
  }
  if (lowerSelected === "vertical cd" || lowerSelected === "vertical_cd") {
    return scopeType === "vertical_cd";
  }
  return getFloorList(itemFloor).includes(selectedFloor);
}

export function summarizeFloorList(floor) {
  const floors = getFloorList(floor).sort(sortFloors);

  if (floors.length === 0) {
    return {
      count: 0,
      label: "Sin piso",
      floors: [],
    };
  }

  const numbered = floors
    .map((value) => ({
      value,
      number: getFloorNumber(value),
    }))
    .filter((entry) => entry.number !== null);

  const nonNumbered = floors.filter((value) => getFloorNumber(value) === null);

  if (numbered.length !== floors.length) {
    const preview = floors.slice(0, 3).join(", ");
    const suffix = floors.length > 3 ? ` +${floors.length - 3}` : "";

    return {
      count: floors.length,
      label: `${preview}${suffix}`,
      floors,
    };
  }

  const ranges = [];
  let start = numbered[0].number;
  let previous = numbered[0].number;

  numbered.slice(1).forEach((entry) => {
    if (entry.number === previous + 1) {
      previous = entry.number;
      return;
    }

    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = entry.number;
    previous = entry.number;
  });

  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);

  const labelPrefix = ranges.length === 1 && !ranges[0].includes("-") ? "Piso" : "Pisos";

  return {
    count: floors.length,
    label: `${labelPrefix} ${ranges.join(", ")}`,
    floors: [...numbered.map((entry) => entry.value), ...nonNumbered],
  };
}