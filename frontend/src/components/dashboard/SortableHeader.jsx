export default function SortableHeader({ label, columnKey, sortConfig, onSort, className = "" }) {
  const isActive = sortConfig.key === columnKey;
  const indicator = !isActive ? "?" : sortConfig.direction === "asc" ? "?" : "?";

  return (
    <th className={className}>
      <button
        type="button"
        className={`header-sort ${isActive ? "is-active" : ""}`}
        onClick={() => onSort(columnKey)}
      >
        <span>{label}</span>
        <span className="header-sort-indicator">{indicator}</span>
      </button>
    </th>
  );
}

