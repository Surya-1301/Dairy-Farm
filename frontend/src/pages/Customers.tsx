import { useEffect, useState } from "react";
import {
  addCustomer,
  deleteCustomer,
  getCustomers,
  subscribeCustomersChanged,
  updateCustomer
} from "../utils/customerData";
import type { Customer } from "../firebase/data";

function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    address: "",
    shift: ""
  });

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        setCustomers(await getCustomers());
      } finally {
        setLoading(false);
      }
    };

    void loadCustomers();

    const unsubscribe = subscribeCustomersChanged(() => {
      void getCustomers().then(setCustomers);
    });

    return unsubscribe;
  }, []);

  const handleAddClick = () => {
    setEditingId(null);
    setFormData({ name: "", mobile: "", address: "", shift: "" });
    setShowForm(true);
  };

  const handleEditClick = (customer: Customer) => {
    setEditingId(customer.serialNumber);
    setFormData({
      name: customer.name,
      mobile: customer.mobile,
      address: customer.address,
      shift: customer.shift ?? ""
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Customer name is required");
      return;
    }

    if (formData.shift === "M/E") {
      if (editingId !== null) {
        await updateCustomer(editingId, formData.name, formData.mobile, formData.address, "M");
        await addCustomer(formData.name, formData.mobile, formData.address, "E");
      } else {
        await addCustomer(formData.name, formData.mobile, formData.address, "M");
        await addCustomer(formData.name, formData.mobile, formData.address, "E");
      }
    } else {
      if (editingId !== null) {
        await updateCustomer(editingId, formData.name, formData.mobile, formData.address, formData.shift);
      } else {
        await addCustomer(formData.name, formData.mobile, formData.address, formData.shift);
      }
    }

    setShowForm(false);
    setFormData({ name: "", mobile: "", address: "", shift: "" });
  };

  const handleDelete = async (serialNumber: number) => {
    if (window.confirm("Are you sure you want to delete this customer?")) {
      await deleteCustomer(serialNumber);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormData({ name: "", mobile: "", address: "", shift: "" });
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

            <div>
              <label className="block text-xs md:text-sm font-medium text-slate-700 mb-2">
                Shift
              </label>
              <select
                value={formData.shift}
                onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base min-h-[48px] leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                <option value="">Select shift</option>
                <option value="M">Morning (M)</option>
                <option value="E">Evening (E)</option>
                <option value="M/E">Both (M/E)</option>
              </select>
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
        {loading ? (
          <div className="p-6 md:p-8 text-center text-slate-500 text-xs md:text-sm">
            <p>Loading customers...</p>
          </div>
        ) : customers.length === 0 ? (
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
                <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-900 hidden sm:table-cell">Shift</th>
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
                  <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700 hidden sm:table-cell">{customer.shift || "—"}</td>
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
