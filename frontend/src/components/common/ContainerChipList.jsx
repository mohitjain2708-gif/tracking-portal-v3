import {
  buildContainerDetails,
  getContainerOverflowCount,
  getDestuffingTone,
  getVisibleContainerDetails,
} from "../../lib/portalUtils";

export default function ContainerChipList({
  row,
  expanded = false,
  maxVisible = 5,
  className = "",
  showOverflowHint = true,
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
        {visibleDetails.map((detail) => {
          const tone = getDestuffingTone(detail.destuffing_label);
          return (
            <div
              key={detail.number}
              className={`container-text-row${tone ? ` is-${tone}` : ""}`}
            >
              <span className="container-text-number">{detail.number}</span>
              {detail.destuffing_label ? (
                <span className={`container-text-label${tone ? ` is-${tone}` : ""}`}>
                  {detail.destuffing_label}
                </span>
              ) : null}
            </div>
          );
        })}
        {overflowCount > 0 && !expanded ? (
          <div className="container-text-row container-text-more">+{overflowCount} more containers</div>
        ) : null}
      </div>
      {showOverflowHint && details.length > maxVisible ? (
        <p className="container-expansion-note">
          {expanded ? "Click again to open shipment details." : "Click once to view all containers."}
        </p>
      ) : null}
    </div>
  );
}
