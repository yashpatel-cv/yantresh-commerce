const checkpoints = [
  "Root workspace, db bootstrap, and hub fragments are in place.",
  "This placeholder is the first deployable storefront surface.",
  "Next slice should add tenant resolution before real commerce wiring."
];

function readEnv(name: string): string {
  return process.env[name] ?? "unset";
}

export default function Page() {
  const storesHost = readEnv("STORES_ADDRESS");
  const apiHost = readEnv("SHOP_API_ADDRESS");
  const adminHost = readEnv("SHOP_ADMIN_ADDRESS");

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Phase 0 placeholder</p>
        <h1>Shared storefront, one repo, zero fake plumbing.</h1>
        <p className="lede">
          This app is the shared runtime shell for Yantresh Commerce. It exists to prove the
          repo has a real storefront target before tenant resolution, Medusa bindings, and
          plugin slots land.
        </p>
      </section>

      <section className="panel">
        <h2>Hub addresses</h2>
        <dl className="grid">
          <div>
            <dt>Stores</dt>
            <dd>{storesHost}</dd>
          </div>
          <div>
            <dt>Shop API</dt>
            <dd>{apiHost}</dd>
          </div>
          <div>
            <dt>Shop Admin</dt>
            <dd>{adminHost}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2>Current checkpoint</h2>
        <ul className="checklist">
          {checkpoints.map((checkpoint) => (
            <li key={checkpoint}>{checkpoint}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
