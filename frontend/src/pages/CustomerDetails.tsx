import CustomerTable from "../components/CustomerTable";

function CustomerDetails() {
  return (
    
    <section className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-white px-2 pt-2 pb-16 sm:px-3 sm:pt-3 md:px-4 md:pt-4">
      <CustomerTable />
    </section>
  );
}

export default CustomerDetails;