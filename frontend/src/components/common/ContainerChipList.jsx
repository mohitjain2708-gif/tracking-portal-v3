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
    <div className={`container-chip-collection ${className}`.trim()}>
      <div className="container-chip-list">
        {visibleDetails.map((detail) => {
          const tone = getDestuffingTone(detail.destuffing_label);
          return (
            <span
              key={detail.number}
              className={`container-chip${tone ? ` is-${tone}` : ""}`}
            >
              <span className="container-chip-number">{detail.number}</span>
              {detail.destuffing_label ? (
                <span className="container-chip-tag">{detail.destuffing_label}</span>
              ) : null}
            </span>
          );
        })}
        {overflowCount > 0 && !expanded ? (
          <span className="container-chip container-chip-more">+{overflowCount} more</span>
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
