import CustomerTable from "../components/CustomerTable";

function CustomerDetails() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Data</h1>
        <p className="mt-1 text-sm text-slate-600">Open and manage the milk sheet here.</p>
      </div>
      <CustomerTable />
    </section>
  );
}

export default CustomerDetails;