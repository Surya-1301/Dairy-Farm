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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Add Customer</h1>
        {!showForm && (
          <button
            onClick={handleAddClick}
            className="rounded-lg bg-brand-500 px-4 py-2 text-white font-medium hover:bg-brand-600 transition"
          >
            + Add Customer
          </button>
        )}
      </div>

      {showForm && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">
            {editingId !== null ? "Edit Customer" : "Add New Customer"}
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Customer Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Enter customer name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Mobile Number
              </label>
              <input
                type="tel"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Enter mobile number"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Address
              </label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Enter address"
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-brand-500 px-4 py-2 text-white font-medium hover:bg-brand-600 transition"
              >
                {editingId !== null ? "Update" : "Add"} Customer
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        {customers.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <p>No customers added yet. Click "Add Customer" to get started.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">S.No</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Mobile</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Address</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {customers.map((customer) => (
                <tr key={customer.serialNumber} className="hover:bg-slate-50">
                  <td className="px-6 py-3 text-sm text-slate-700">{customer.serialNumber}</td>
                  <td className="px-6 py-3 text-sm text-slate-700">{customer.name}</td>
                  <td className="px-6 py-3 text-sm text-slate-700">{customer.mobile}</td>
                  <td className="px-6 py-3 text-sm text-slate-700">{customer.address}</td>
                  <td className="px-6 py-3 text-sm flex gap-2">
                    <button
                      onClick={() => handleEditClick(customer)}
                      className="text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(customer.serialNumber)}
                      className="text-red-600 hover:text-red-700 font-medium"
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
