export default function DashboardMetric({ label, value, tone = "default", icon, customers = [], motionIndex = 0 }) {
  const getCount = (item) => item?.shipment_count ?? item?.container_count ?? 0;
  return (
    <article
      className={`dashboard-metric motion-stagger-item dashboard-metric-${tone}`}
      style={{ "--motion-index": motionIndex }}
      title={customers.length ? customers.map((item) => `${item.customer_name} - ${getCount(item)}`).join(", ") : ""}
    >
      <span className="dashboard-metric-icon">{icon}</span>
      <span className="dashboard-metric-copy">
        <strong>{label}</strong>
        <span>{value}</span>
      </span>
      {customers.length > 0 && (
        <div className="dashboard-metric-tooltip" role="tooltip">
          <p>{label}</p>
          <ul>
            {customers.map((item) => (
              <li key={item.customer_name}>
                <span>{item.customer_name}</span>
                <strong>{getCount(item)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

