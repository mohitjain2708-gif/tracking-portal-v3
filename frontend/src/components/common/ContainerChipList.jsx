import {
  buildContainerDetails,
  getContainerOverflowCount,
  getDestuffingTone,
  getVisibleContainerDetails,
} from "../../lib/portalUtils";

const SHORT_DESTUFFING_LABELS = {
  "Factory Destuffing": "FDS",
  "ICD Destuffing": "ICD",
  "Warehouse Destuffing": "WHD",
};

export default function ContainerChipList({
  row,
  expanded = false,
  maxVisible = 5,
  className = "",
  showOverflowHint = true,
  labelVariant = "full",
}) {
  const details = buildContainerDetails(row);
  const visibleDetails = getVisibleContainerDetails(row, expanded, maxVisible);
  const overflowCount = getContainerOverflowCount(row, maxVisible);

  if (!details.length) {
    return <span className="container-empty-label">No containers linked</span>;
  }

  return (
    <div
      className={`container-text-collection ${expanded ? "is-expanded" : "is-collapsed"} ${className}`.trim()}
    >
      <div className="container-text-list">
        {visibleDetails.map((detail, index) => {
          const tone = getDestuffingTone(detail.destuffing_label);
          const labelText =
            labelVariant === "short"
              ? SHORT_DESTUFFING_LABELS[detail.destuffing_label] || detail.destuffing_label
              : detail.destuffing_label;
          const showInlineOverflow =
            overflowCount > 0 && !expanded && index === visibleDetails.length - 1;
          return (
            <div
              key={detail.number}
              className={`container-text-row${tone ? ` is-${tone}` : ""}`}
            >
              <span className="container-text-number">{detail.number}</span>
              {labelText ? (
                <span
                  className={`container-text-label${tone ? ` is-${tone}` : ""}`}
                  title={labelVariant === "short" ? detail.destuffing_label : undefined}
                >
                  {labelText}
                </span>
              ) : null}
              {showInlineOverflow ? (
                <span className="container-text-overflow-inline">+{overflowCount} more</span>
              ) : null}
            </div>
          );
        })}
      </div>
      {showOverflowHint && details.length > maxVisible ? (
        <p className="container-expansion-note">
          {expanded ? "Click again to open shipment details." : "Click once to view all containers."}
        </p>
      ) : null}
    </div>
  );
}
