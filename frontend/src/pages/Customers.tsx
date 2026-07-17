import { useEffect, useRef, useState } from "react";
import {
  addCustomer,
  deleteCustomer,
  getCustomers,
  moveCustomerToPosition,
  subscribeCustomersChanged,
  updateCustomer
} from "../utils/customerData";
import type { Customer } from "../firebase/data";

function groupCustomersByName(customers: Customer[]): Customer[][] {
  const groups: Customer[][] = [];
  let currentKey: string | null = null;

  for (const customer of customers) {
    const key = customer.name.trim().toLowerCase();
    if (key && key === currentKey) {
      groups[groups.length - 1].push(customer);
    } else {
      groups.push([customer]);
      currentKey = key || null;
    }
  }

  return groups;
}

function formatShiftLabel(group: Customer[]): string {
  if (group.length > 1) {
    const shifts = group.map((c) => c.shift).filter(Boolean);
    return shifts.length > 0 ? shifts.join(" & ") : "M & E";
  }

  return group[0].shift || "—";
}

function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [draggedSerial, setDraggedSerial] = useState<number | null>(null);
  const [dropSerial, setDropSerial] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingIds, setEditingIds] = useState<number[]>([]);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const pendingScrollToSerial = useRef<number | null>(null);
  const shouldScrollBack = useRef(false);
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    address: "",
    shift: ""
  });
  const groupedCustomers = groupCustomersByName(customers);

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

  useEffect(() => {
    if (
      showForm ||
      !shouldScrollBack.current ||
      pendingScrollToSerial.current == null
    ) {
      return;
    }

    const serialNumber = pendingScrollToSerial.current;
    const row = rowRefs.current[serialNumber];
    if (!row) return;

    const frame = window.requestAnimationFrame(() => {
      row.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      shouldScrollBack.current = false;
      pendingScrollToSerial.current = null;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [customers, showForm]);

  const handleAddClick = () => {
    setEditingIds([]);
    setFormData({ name: "", mobile: "", address: "", shift: "" });
    setShowForm(true);
  };

  const handleEditClick = (group: Customer[]) => {
    const [primary] = group;
    pendingScrollToSerial.current = primary.serialNumber;
    setEditingIds(group.map((customer) => customer.serialNumber));
    setFormData({
      name: primary.name,
      mobile: primary.mobile,
      address: primary.address,
      shift: group.length > 1 ? "M/E" : primary.shift ?? ""
    });
    setShowForm(true);

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Customer name is required");
      return;
    }

    const isEditing = editingIds.length > 0;

    if (formData.shift === "M/E") {
      if (isEditing && editingIds.length === 2) {
        for (const id of editingIds) {
          const original = customers.find((c) => c.serialNumber === id);
          await updateCustomer(id, formData.name, formData.mobile, formData.address, original?.shift || "M");
        }
      } else if (isEditing) {
        await updateCustomer(editingIds[0], formData.name, formData.mobile, formData.address, "M");
        await addCustomer(formData.name, formData.mobile, formData.address, "E");
      } else {
        await addCustomer(formData.name, formData.mobile, formData.address, "M");
        await addCustomer(formData.name, formData.mobile, formData.address, "E");
      }
    } else {
      if (isEditing && editingIds.length === 2) {
        const originals = editingIds.map((id) => customers.find((c) => c.serialNumber === id));
        let keepIndex = originals.findIndex((c) => c?.shift === formData.shift);
        if (keepIndex === -1) keepIndex = 0;

        await updateCustomer(editingIds[keepIndex], formData.name, formData.mobile, formData.address, formData.shift);
        await deleteCustomer(editingIds[1 - keepIndex]);
      } else if (isEditing) {
        await updateCustomer(editingIds[0], formData.name, formData.mobile, formData.address, formData.shift);
      } else {
        await addCustomer(formData.name, formData.mobile, formData.address, formData.shift);
      }
    }

    const targetSerial = editingIds[0] ?? null;
    if (targetSerial != null) {
      pendingScrollToSerial.current = targetSerial;
      shouldScrollBack.current = true;
    }

    setShowForm(false);
    setFormData({ name: "", mobile: "", address: "", shift: "" });
    setEditingIds([]);
  };

  const handleDelete = async (serialNumbers: number[]) => {
    const message =
      serialNumbers.length > 1
        ? "Are you sure you want to delete this customer (both shifts)?"
        : "Are you sure you want to delete this customer?";

    if (window.confirm(message)) {
      for (const serialNumber of serialNumbers) {
        await deleteCustomer(serialNumber);
      }
    }
  };

  const handleMove = async (serialNumber: number, direction: "up" | "down") => {
    await moveCustomerToPosition(
      serialNumber,
      direction === "up" ? serialNumber - 1 : serialNumber + 1,
      direction === "up" ? "before" : "after"
    );
  };

  const handleDragStart = (serialNumber: number) => (event: React.DragEvent<HTMLTableRowElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(serialNumber));
    setDraggedSerial(serialNumber);
  };

  const handleDragOver = (serialNumber: number) => (event: React.DragEvent<HTMLTableRowElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropSerial(serialNumber);
  };

  const handleDrop = (serialNumber: number) => async (event: React.DragEvent<HTMLTableRowElement>) => {
    event.preventDefault();
    const sourceSerial = draggedSerial ?? Number(event.dataTransfer.getData("text/plain"));

    if (!Number.isFinite(sourceSerial) || sourceSerial === serialNumber) {
      setDraggedSerial(null);
      setDropSerial(null);
      return;
    }

    const targetRow = rowRefs.current[serialNumber];
    if (!targetRow) {
      setDraggedSerial(null);
      setDropSerial(null);
      return;
    }

    const rect = targetRow.getBoundingClientRect();
    const insertAfter = event.clientY > rect.top + rect.height / 2;
    await moveCustomerToPosition(sourceSerial, serialNumber, insertAfter ? "after" : "before");
    setDraggedSerial(null);
    setDropSerial(null);
  };

  const handleDragEnd = () => {
    setDraggedSerial(null);
    setDropSerial(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormData({ name: "", mobile: "", address: "", shift: "" });
    setEditingIds([]);
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
            {editingIds.length > 0 ? "Edit Customer" : "Add New Customer"}
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
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base min-h-[48px] leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base min-h-[48px] leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base leading-normal focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[120px]"
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
                {editingIds.length > 0 ? "Update" : "Add"} Customer
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
              {groupedCustomers.map((group, groupIndex) => {
                const primary = group[0];
                const isDragging = draggedSerial === primary.serialNumber;
                const isDropTarget = dropSerial === primary.serialNumber;

                return (
                  <tr
                    key={primary.serialNumber}
                    ref={(node) => {
                      rowRefs.current[primary.serialNumber] = node;
                    }}

                    draggable
                    onDragStart={handleDragStart(primary.serialNumber)}
                    onDragOver={handleDragOver(primary.serialNumber)}
                    onDrop={handleDrop(primary.serialNumber)}
                    onDragEnd={handleDragEnd}
                    className={`hover:bg-slate-50 ${isDragging ? "opacity-50" : ""} ${isDropTarget ? "ring-2 ring-brand-500 ring-inset" : ""} cursor-grab active:cursor-grabbing`}

                  >
                    <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700">{groupIndex + 1}</td>
                    <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700 font-medium">{primary.name}</td>
                    <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700 hidden md:table-cell">{primary.mobile}</td>
                    <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700 hidden sm:table-cell">{formatShiftLabel(group)}</td>
                    <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700 hidden lg:table-cell truncate">{primary.address}</td>
                    <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm flex gap-2 md:gap-3 flex-col sm:flex-row">
                      <button
                        onClick={() => handleEditClick(group)}
                        className="text-brand-600 hover:text-brand-700 active:text-brand-800 font-medium px-3 py-2 rounded hover:bg-brand-50 active:bg-brand-100 transition min-h-[40px] flex items-center justify-center"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(group.map((customer) => customer.serialNumber))}
                        className="text-red-600 hover:text-red-700 active:text-red-800 font-medium px-3 py-2 rounded hover:bg-red-50 active:bg-red-100 transition min-h-[40px] flex items-center justify-center"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Customers;
