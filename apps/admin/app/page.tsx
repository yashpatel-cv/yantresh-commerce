const checkpoints = [
  "Payload is intentionally not installed in Phase 0.",
  "The admin lane exists so hub wiring and GHCR flow have a real target.",
  "Phase 1 replaces this shell with the actual config surface."
];

export default function Page() {
  return (
    <main className="shell">
      <section className="card">
        <p className="eyebrow">Phase 0 placeholder</p>
        <h1>Admin shell, not the real control plane yet.</h1>
        <p>
          This surface exists to keep the deployment topology honest while the source of truth
          stays in <code>docs/schema.sql</code> and <code>docs/contracts.ts</code>.
        </p>
        <h2>What stays deferred</h2>
        <ul>
          {checkpoints.map((checkpoint) => (
            <li key={checkpoint}>{checkpoint}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
