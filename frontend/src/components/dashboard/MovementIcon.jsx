export default function MovementIcon({ type }) {
  if (type === "Arrived Birgunj") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }

  if (type === "At Port") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="5" r="1.7" />
        <path d="M12 7v10" />
        <path d="M8 10h8" />
        <path d="M6 14a6 6 0 0 0 12 0" />
        <path d="M9 17l-2.5 2M15 17l2.5 2" />
      </svg>
    );
  }

  if (type === "On Rail") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4h10c1.7 0 3 1.3 3 3v7c0 1.7-1.3 3-3 3H7c-1.7 0-3-1.3-3-3V7c0-1.7 1.3-3 3-3Z" />
        <path d="M7 17l-2 3M17 17l2 3M8 20h8M7 8h10M7 12h10" />
        <circle cx="8" cy="15" r="1" />
        <circle cx="16" cy="15" r="1" />
      </svg>
    );
  }

  if (type === "Hi Seas") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 16h16M7 16V9l5-2 5 2v7M12 7v9" />
        <path d="M3 19c1 .8 2 .8 3.1 0 1.1-.8 2-.8 3.1 0 1.1.8 2 .8 3.1 0 1.1-.8 2-.8 3.1 0 1.1.8 2 .8 3.1 0" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

