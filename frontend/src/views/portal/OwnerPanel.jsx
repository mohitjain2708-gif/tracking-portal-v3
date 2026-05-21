import ActionButton from "../../components/common/ActionButton";
import DashboardMetric from "../../components/dashboard/DashboardMetric";
import SectionHeader from "../../components/common/SectionHeader";
import { formatAuditActionLabel, formatDateTimeLabel } from "../../lib/portalUtils";

export default function OwnerPanel({
  adminOverview,
  adminLoading,
  refreshAdminOverview,
  handleViewOwnerUserShipments,
  ownerUserShipmentsLoading,
  ownerUserShipments,
  setOwnerDeleteUser,
  adminResetState,
  setAdminResetState,
  adminResetSubmitting,
  handleAdminResetPassword,
}) {
  return (
    <section className="surface owner-panel">
      <SectionHeader
        eyebrow="Owner View"
        title="Portal oversight"
        description="A quiet view of users, shipment volume, and recent portal activity."
        actions={
          <ActionButton type="button" tone="secondary" onClick={refreshAdminOverview} disabled={adminLoading}>
            {adminLoading ? "Refreshing..." : "Refresh owner view"}
          </ActionButton>
        }
        className="compact-heading owner-panel-heading"
      />

      <div className="owner-metric-grid">
        <DashboardMetric label="Users" value={adminOverview?.metrics?.total_users || 0} />
        <DashboardMetric label="Live Shipments" value={adminOverview?.metrics?.live_shipments || 0} />
        <DashboardMetric label="Completed" value={adminOverview?.metrics?.completed_shipments || 0} />
        <DashboardMetric label="Archived" value={adminOverview?.metrics?.archived_shipments || 0} />
      </div>

      <div className="owner-grid">
        <section className="owner-card">
          <div className="owner-card-head">
            <h3>People in the portal</h3>
            <p>See who has signed up and reset access when someone needs help getting back in.</p>
          </div>
          <div className="owner-user-list">
            {(adminOverview?.users || []).length === 0 ? (
              <div className="empty-state-panel">No users yet.</div>
            ) : (
              (adminOverview?.users || []).map((user) => (
                <article key={user.id} className="owner-user-row">
                  <div className="owner-user-copy">
                    <strong>{user.email}</strong>
                    <span>Joined {user.created_at ? formatDateTimeLabel(user.created_at) : "date not recorded"}</span>
                    <span>Last active {user.last_activity_at ? formatDateTimeLabel(user.last_activity_at) : "no activity yet"}</span>
                    <span>Last sign in {user.last_login_at ? formatDateTimeLabel(user.last_login_at) : "not recorded yet"}</span>
                    <span>
                      {user.shipment_count || 0} shipments, {user.source_batch_count || 0} imports
                      {user.password_reset_required ? " | password needs to be changed" : ""}
                    </span>
                  </div>
                  {!user.is_admin ? (
                    <div className="owner-user-actions">
                      <div className="owner-user-quick-actions">
                        <ActionButton
                          type="button"
                          tone="secondary"
                          compact
                          disabled={ownerUserShipmentsLoading}
                          onClick={() => handleViewOwnerUserShipments(user)}
                        >
                          {ownerUserShipmentsLoading && ownerUserShipments?.user?.id === user.id ? "Opening..." : "View shipments"}
                        </ActionButton>
                        <ActionButton type="button" tone="danger" compact onClick={() => setOwnerDeleteUser(user)}>
                          Remove user
                        </ActionButton>
                      </div>
                      <div className="owner-password-reset">
                        <input
                          type="password"
                          placeholder="Temporary password"
                          value={adminResetState.userId === user.id ? adminResetState.password : ""}
                          onChange={(event) => setAdminResetState({ userId: user.id, password: event.target.value })}
                        />
                        <ActionButton
                          type="button"
                          tone="ghost"
                          disabled={adminResetSubmitting}
                          onClick={() => handleAdminResetPassword(user.id)}
                        >
                          Reset password
                        </ActionButton>
                      </div>
                    </div>
                  ) : (
                    <span className="meta-pill">Owner</span>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="owner-card">
          <div className="owner-card-head">
            <h3>Recent activity</h3>
            <p>Recent changes across the portal, shown in plain language.</p>
          </div>
          <div className="owner-activity-list">
            {(adminOverview?.recent_activity || []).length === 0 ? (
              <div className="empty-state-panel">No recent activity yet.</div>
            ) : (
              (adminOverview?.recent_activity || []).map((entry) => (
                <article key={entry.id} className="owner-activity-row">
                  <strong>{formatAuditActionLabel(entry.action)}</strong>
                  <span>{entry.email || "Unknown user"}</span>
                  <span>{entry.bl_number || entry.container_number || "Portal activity"}</span>
                  <span>{formatDateTimeLabel(entry.created_at)}</span>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

