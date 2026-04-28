import { useEffect, useState } from "react";
import {
  addCustomer,
  deleteCustomer,
  getCustomers,
  subscribeCustomersChanged,
  updateCustomer,
  type Customer
} from "../utils/customerData";

function Customers() {
  const [customers, setCustomers] = useState<Customer[]>(getCustomers());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    address: ""
  });

  useEffect(() => {
    const unsubscribe = subscribeCustomersChanged(() => {
      setCustomers(getCustomers());
    });

    return unsubscribe;
  }, []);

  const handleAddClick = () => {
    setEditingId(null);
    setFormData({ name: "", mobile: "", address: "" });
    setShowForm(true);
  };

  const handleEditClick = (customer: Customer) => {
    setEditingId(customer.serialNumber);
    setFormData({
      name: customer.name,
      mobile: customer.mobile,
      address: customer.address
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.mobile.trim() || !formData.address.trim()) {
      alert("Please fill all fields");
      return;
    }

    if (editingId !== null) {
      updateCustomer(editingId, formData.name, formData.mobile, formData.address);
    } else {
      addCustomer(formData.name, formData.mobile, formData.address);
    }

    setShowForm(false);
    setFormData({ name: "", mobile: "", address: "" });
  };

  const handleDelete = (serialNumber: number) => {
    if (window.confirm("Are you sure you want to delete this customer?")) {
      deleteCustomer(serialNumber);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormData({ name: "", mobile: "", address: "" });
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl md:text-3xl font-bold text-slate-900">Add Customer</h1>
        {!showForm && (
          <button
            onClick={handleAddClick}
            className="rounded-lg bg-brand-500 px-4 py-3 text-sm text-white font-medium hover:bg-brand-600 active:bg-brand-700 transition w-full sm:w-auto min-h-[48px] flex items-center justify-center"
          >
            + Add Customer
          </button>
        )}
      </div>

      {showForm && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 md:p-6">
          <h2 className="mb-4 text-base md:text-xl font-semibold text-slate-900">
            {editingId !== null ? "Edit Customer" : "Add New Customer"}
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 md:gap-5">
            <div>
              <label className="block text-xs md:text-sm font-medium text-slate-700 mb-2">
                Customer Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base min-h-[48px] leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Enter customer name"
                autoComplete="name"
              />
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium text-slate-700 mb-2">
                Mobile Number
              </label>
              <input
                type="tel"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base min-h-[48px] leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Enter mobile number"
                autoComplete="tel"
              />
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium text-slate-700 mb-2">
                Address
              </label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[120px]"
                placeholder="Enter address"
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end flex-col-reverse sm:flex-row">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-700 font-medium hover:bg-slate-100 active:bg-slate-200 transition min-h-[48px] flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-brand-500 px-4 py-3 text-sm text-white font-medium hover:bg-brand-600 active:bg-brand-700 transition min-h-[48px] flex items-center justify-center"
              >
                {editingId !== null ? "Update" : "Add"} Customer
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        {customers.length === 0 ? (
          <div className="p-6 md:p-8 text-center text-slate-500 text-xs md:text-sm">
            <p>No customers added yet. Click "Add Customer" to get started.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-900">S.No</th>
                <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-900">Name</th>
                <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-900 hidden md:table-cell">Mobile</th>
                <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-900 hidden lg:table-cell">Address</th>
                <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {customers.map((customer) => (
                <tr key={customer.serialNumber} className="hover:bg-slate-50">
                  <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700">{customer.serialNumber}</td>
                  <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700 font-medium">{customer.name}</td>
                  <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700 hidden md:table-cell">{customer.mobile}</td>
                  <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700 hidden lg:table-cell truncate">{customer.address}</td>
                  <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm flex gap-2 md:gap-3 flex-col sm:flex-row">
                    <button
                      onClick={() => handleEditClick(customer)}
                      className="text-brand-600 hover:text-brand-700 active:text-brand-800 font-medium px-3 py-2 rounded hover:bg-brand-50 active:bg-brand-100 transition min-h-[40px] flex items-center justify-center"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(customer.serialNumber)}
                      className="text-red-600 hover:text-red-700 active:text-red-800 font-medium px-3 py-2 rounded hover:bg-red-50 active:bg-red-100 transition min-h-[40px] flex items-center justify-center"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Customers;
