export default function DashboardPage() {
  const stats = [
    { label: "Active Members", value: "—", sub: "Connect MindBody" },
    { label: "Monthly Revenue", value: "—", sub: "Connect Xero" },
    { label: "Ad Spend", value: "—", sub: "Connect Meta Ads" },
    { label: "Open Leads", value: "—", sub: "Connect GoHighLevel" },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gym-text">Dashboard</h1>
        <p className="text-gym-text-secondary text-sm mt-1">Welcome to The Yard Gym business dashboard</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-gym-surface border border-gym-border rounded-xl p-5">
            <p className="text-gym-muted text-xs font-semibold uppercase tracking-wider mb-2">{stat.label}</p>
            <p className="text-3xl font-bold text-gym-text mb-1">{stat.value}</p>
            <p className="text-gym-muted text-xs">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Integrations */}
      <div className="bg-gym-surface border border-gym-border rounded-xl p-6">
        <h2 className="text-gym-text font-semibold mb-4">Integrations</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {["MindBody", "Xero", "Meta Ads", "GoHighLevel"].map((name) => (
            <div key={name} className="border border-gym-border rounded-lg p-4 flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-gym-border rounded-lg flex items-center justify-center">
                <span className="text-gym-muted text-lg">⊡</span>
              </div>
              <p className="text-gym-text-secondary text-sm">{name}</p>
              <span className="text-xs bg-gym-border text-gym-muted px-2 py-0.5 rounded-full">Not Connected</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
