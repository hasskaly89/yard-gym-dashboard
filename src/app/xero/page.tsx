export default function XeroPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gym-text">Xero</h1>
        <p className="text-gym-text-secondary text-sm mt-1">Financial overview and accounting</p>
      </div>
      <div className="bg-gym-surface border border-gym-border rounded-xl p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-gym-border rounded-2xl flex items-center justify-center mb-4">
          <span className="text-3xl">₿</span>
        </div>
        <h2 className="text-gym-text font-semibold text-lg mb-2">Xero Integration</h2>
        <p className="text-gym-muted text-sm max-w-sm">Connect your Xero account to view invoices, expenses, and financial reports.</p>
        <button className="mt-6 bg-gym-accent hover:bg-gym-accent-hover text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors">
          Connect Xero
        </button>
      </div>
    </div>
  );
}
