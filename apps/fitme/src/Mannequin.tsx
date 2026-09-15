function Mannequin({ faded = false }: { faded?: boolean }) {
  return (
    <svg className="mannequin" viewBox="0 0 80 110" aria-hidden>
      <g fill={faded ? "#d1d5db" : "#c5b8a8"} opacity={faded ? 0.7 : 1}>
        <circle cx="40" cy="14" r="10" />
        <rect x="28" y="24" width="24" height="28" rx="10" />
        <rect x="14" y="28" width="12" height="32" rx="6" />
        <rect x="54" y="28" width="12" height="32" rx="6" />
        <rect x="26" y="50" width="12" height="42" rx="6" />
        <rect x="42" y="50" width="12" height="42" rx="6" />
      </g>
    </svg>
  );
}

export default Mannequin;
