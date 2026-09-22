import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  addCustomer,
  deleteCustomer,
  deleteCustomers,
  getCustomers,
  moveCustomerToPosition,
  subscribeCustomersChanged,
  updateCustomer,
} from "../utils/customerData";
import type { Customer } from "../firebase/data";

function groupCustomersByName(customers: Customer[]): Customer[][] {
  const groups: Customer[][] = [];
  const groupIndexByKey = new Map<string, number>();

  for (const customer of customers) {
    const key = customer.name.trim().toLowerCase();
    const existingIndex = key ? groupIndexByKey.get(key) : undefined;

    if (existingIndex !== undefined) {
      groups[existingIndex].push(customer);
    } else {
      if (key) {
        groupIndexByKey.set(key, groups.length);
      }
      groups.push([customer]);
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

function getGroupShiftPriority(group: Customer[]): number {
  const hasMorning = group.some((customer) => customer.shift === "M");
  const hasEvening = group.some((customer) => customer.shift === "E");

  if (hasMorning && hasEvening) return 0; // Both shifts first
  if (hasMorning) return 1; // Morning-only second
  if (hasEvening) return 2; // Evening-only third
  return 3;
}

function sortCustomerGroups(groups: Customer[][]): Customer[][] {
  return [...groups].sort((a, b) => {
    const priorityDifference =
      getGroupShiftPriority(a) - getGroupShiftPriority(b);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return a[0].serialNumber - b[0].serialNumber;
  });
}

function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [draggedSerial, setDraggedSerial] = useState<number | null>(null);
  const [dropSerial, setDropSerial] = useState<number | null>(null);
  const [mobileDraggedSerial, setMobileDraggedSerial] = useState<number | null>(null);
  const [mobileDropSerial, setMobileDropSerial] = useState<number | null>(null);
  const mobileDragTimerRef = useRef<number | null>(null);
  const mobilePointerIdRef = useRef<number | null>(null);
  const mobileDraggingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingIds, setEditingIds] = useState<number[]>([]);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [deleteTarget, setDeleteTarget] = useState<number[] | null>(null);
  const pendingScrollToSerial = useRef<number | null>(null);
  const shouldScrollBack = useRef(false);
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    address: "",
    shift: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [shiftFilter, setShiftFilter] = useState<"All" | "M" | "E" | "Both">("All");
  const [formError, setFormError] = useState("");
  const groupedCustomers = sortCustomerGroups(groupCustomersByName(customers));
  const filteredGroups = groupedCustomers.filter((group) => {
    const primary = group[0];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const hay = `${primary.name} ${primary.mobile} ${primary.address}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (shiftFilter === "All") return true;
    const hasM = group.some((c) => c.shift === "M");
    const hasE = group.some((c) => c.shift === "E");
    if (shiftFilter === "Both") return hasM && hasE;
    if (shiftFilter === "M") return hasM;
    return hasE;
  });
  const shiftBadgeStyle = (label: string) => {
    if (label.includes("&") || label === "M/E") return "bg-emerald-100 text-emerald-700";
    if (label === "M") return "bg-amber-100 text-amber-700";
    if (label === "E") return "bg-violet-100 text-violet-700";
    return "bg-slate-100 text-slate-500";
  };

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
    const row = cardRefs.current[serialNumber] ?? rowRefs.current[serialNumber];
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
    setFormError("");
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
      shift: group.length > 1 ? "M/E" : (primary.shift ?? ""),
    });
    setShowForm(true);

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formData.name.trim()) {
      setFormError("Customer name is required.");
      return;
    }
    if (!formData.shift) {
      setFormError("Please select a shift (Both / Morning / Evening).");
      return;
    }

    const isEditing = editingIds.length > 0;

    if (formData.shift === "M/E") {
      if (isEditing && editingIds.length === 2) {
        for (const id of editingIds) {
          const original = customers.find((c) => c.serialNumber === id);
          await updateCustomer(
            id,
            formData.name,
            formData.mobile,
            formData.address,
            original?.shift || "M",
          );
        }
      } else if (isEditing) {
        await updateCustomer(
          editingIds[0],
          formData.name,
          formData.mobile,
          formData.address,
          "M",
        );
        await addCustomer(
          formData.name,
          formData.mobile,
          formData.address,
          "E",
        );
      } else {
        await addCustomer(
          formData.name,
          formData.mobile,
          formData.address,
          "M",
        );
        await addCustomer(
          formData.name,
          formData.mobile,
          formData.address,
          "E",
        );
      }
    } else {
      if (isEditing && editingIds.length === 2) {
        const originals = editingIds.map((id) =>
          customers.find((c) => c.serialNumber === id),
        );
        let keepIndex = originals.findIndex((c) => c?.shift === formData.shift);
        if (keepIndex === -1) keepIndex = 0;

        await updateCustomer(
          editingIds[keepIndex],
          formData.name,
          formData.mobile,
          formData.address,
          formData.shift,
        );
        await deleteCustomer(editingIds[1 - keepIndex]);
      } else if (isEditing) {
        await updateCustomer(
          editingIds[0],
          formData.name,
          formData.mobile,
          formData.address,
          formData.shift,
        );
      } else {
        await addCustomer(
          formData.name,
          formData.mobile,
          formData.address,
          formData.shift,
        );
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
    setDeleteTarget(serialNumbers);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    // Delete all linked shift records (e.g. Morning + Evening) in a single
    // atomic operation so one record can never be dropped without the other.
    await deleteCustomers(deleteTarget);
    setDeleteTarget(null);
  };

  const getCustomerKey = (customer: Customer) =>
    `${customer.name.trim().toLowerCase()}::${customer.shift}`;

  const moveCustomerGroupToPosition = async (
    sourceGroup: Customer[],
    targetGroup: Customer[],
    position: "before" | "after",
  ) => {
    if (sourceGroup.length === 0 || targetGroup.length === 0) return;

    const sourceKeys = new Set(sourceGroup.map(getCustomerKey));
    const targetKeys = new Set(targetGroup.map(getCustomerKey));

    if ([...sourceKeys].some((key) => targetKeys.has(key))) return;

    const sourceOrder =
      position === "after" ? [...sourceGroup].reverse() : sourceGroup;

    for (const sourceCustomer of sourceOrder) {
      const latestCustomers = await getCustomers();
      const latestSource = latestCustomers.find(
        (customer) =>
          getCustomerKey(customer) === getCustomerKey(sourceCustomer),
      );
      const latestTargetGroup = latestCustomers.filter((customer) =>
        targetKeys.has(getCustomerKey(customer)),
      );
      const latestTarget =
        position === "after"
          ? latestTargetGroup[latestTargetGroup.length - 1]
          : latestTargetGroup[0];

      if (!latestSource || !latestTarget) continue;

      await moveCustomerToPosition(
        latestSource.serialNumber,
        latestTarget.serialNumber,
        position,
      );
    }

    setCustomers(await getCustomers());
  };

  const handleMove = async (group: Customer[], direction: "up" | "down") => {
    if (group.length === 0) return;

    const currentGroupIndex = groupedCustomers.findIndex((item) =>
      item.some((customer) => customer.serialNumber === group[0].serialNumber),
    );

    if (currentGroupIndex === -1) return;

    const targetGroupIndex =
      direction === "up" ? currentGroupIndex - 1 : currentGroupIndex + 1;
    if (targetGroupIndex < 0 || targetGroupIndex >= groupedCustomers.length)
      return;

    await moveCustomerGroupToPosition(
      groupedCustomers[currentGroupIndex],
      groupedCustomers[targetGroupIndex],
      direction === "up" ? "before" : "after",
    );
  };

  const handleDragStart =
    (serialNumber: number) => (event: React.DragEvent<HTMLTableRowElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(serialNumber));
      setDraggedSerial(serialNumber);
    };

  const handleDragOver =
    (serialNumber: number) => (event: React.DragEvent<HTMLTableRowElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropSerial(serialNumber);
    };

  const handleDrop =
    (serialNumber: number) =>
    async (event: React.DragEvent<HTMLTableRowElement>) => {
      event.preventDefault();
      const sourceSerial =
        draggedSerial ?? Number(event.dataTransfer.getData("text/plain"));

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

      const sourceGroup = groupedCustomers.find((group) =>
        group.some((customer) => customer.serialNumber === sourceSerial),
      );
      const targetGroup = groupedCustomers.find((group) =>
        group.some((customer) => customer.serialNumber === serialNumber),
      );

      if (
        !sourceGroup ||
        !targetGroup ||
        sourceGroup[0].serialNumber === targetGroup[0].serialNumber
      ) {
        setDraggedSerial(null);
        setDropSerial(null);
        return;
      }

      const rect = targetRow.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      await moveCustomerGroupToPosition(
        sourceGroup,
        targetGroup,
        insertAfter ? "after" : "before",
      );
      setDraggedSerial(null);
      setDropSerial(null);
    };

  const handleDragEnd = () => {
    setDraggedSerial(null);
    setDropSerial(null);
  };

  const clearMobileDragState = () => {
    if (mobileDragTimerRef.current !== null) {
      window.clearTimeout(mobileDragTimerRef.current);
      mobileDragTimerRef.current = null;
    }

    mobilePointerIdRef.current = null;
    mobileDraggingRef.current = false;
    setMobileDraggedSerial(null);
    setMobileDropSerial(null);
  };

  const handleMobilePointerDown =
    (serialNumber: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      // Do not start a drag when interacting with a button.
      if ((event.target as HTMLElement).closest("button")) {
        return;
      }

      mobilePointerIdRef.current = event.pointerId;
      mobileDraggingRef.current = false;
      setMobileDraggedSerial(null);
      setMobileDropSerial(null);

      mobileDragTimerRef.current = window.setTimeout(() => {
        mobileDraggingRef.current = true;
        setMobileDraggedSerial(serialNumber);

        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is not available in every browser.
        }
      }, 260);
    };

  const handleMobilePointerMove =
    (serialNumber: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (mobilePointerIdRef.current !== event.pointerId) {
        return;
      }

      // Cancel a pending long-press drag if the user is scrolling.
      if (!mobileDraggingRef.current) {
        const movement =
          Math.abs(event.movementX) + Math.abs(event.movementY);
        if (movement > 8) {
          clearMobileDragState();
        }
        return;
      }

      event.preventDefault();

      const pointTarget = document.elementFromPoint(
        event.clientX,
        event.clientY,
      ) as HTMLElement | null;

      const targetCard = pointTarget?.closest<HTMLElement>(
        "[data-mobile-customer-serial]",
      );

      if (!targetCard) {
        setMobileDropSerial(null);
        return;
      }

      const targetSerial = Number(
        targetCard.dataset.mobileCustomerSerial ?? "",
      );

      if (!Number.isFinite(targetSerial) || targetSerial === serialNumber) {
        setMobileDropSerial(null);
        return;
      }

      setMobileDropSerial(targetSerial);
    };

  const handleMobilePointerUp =
    (serialNumber: number) => async (event: ReactPointerEvent<HTMLDivElement>) => {
      if (mobilePointerIdRef.current !== event.pointerId) {
        return;
      }

      if (mobileDragTimerRef.current !== null) {
        window.clearTimeout(mobileDragTimerRef.current);
        mobileDragTimerRef.current = null;
      }

      if (!mobileDraggingRef.current) {
        mobilePointerIdRef.current = null;
        return;
      }

      event.preventDefault();

      const sourceGroup = groupedCustomers.find((group) =>
        group.some((customer) => customer.serialNumber === serialNumber),
      );
      const targetSerial = mobileDropSerial;
      const targetGroup = targetSerial
        ? groupedCustomers.find((group) =>
            group.some((customer) => customer.serialNumber === targetSerial),
          )
        : undefined;

      if (
        sourceGroup &&
        targetGroup &&
        sourceGroup[0].serialNumber !== targetGroup[0].serialNumber
      ) {
        const targetCard = cardRefs.current[targetSerial as number];
        const rect = targetCard?.getBoundingClientRect();
        const insertAfter = rect
          ? event.clientY > rect.top + rect.height / 2
          : false;

        await moveCustomerGroupToPosition(
          sourceGroup,
          targetGroup,
          insertAfter ? "after" : "before",
        );
      }

      clearMobileDragState();
    };

  const handleMobilePointerCancel = () => {
    clearMobileDragState();
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormData({ name: "", mobile: "", address: "", shift: "" });
    setEditingIds([]);
    setFormError("");
  };

  return (
    <div className="flex flex-col gap-3 md:gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-slate-900">
            Customers
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">{filteredGroups.length} of {groupedCustomers.length} shown</p>
        </div>
        {!showForm && (
          <button
            onClick={handleAddClick}
            className="rounded-full bg-brand-500 px-5 py-3 text-sm text-white font-semibold hover:bg-brand-600 active:scale-95 min-h-[48px] flex items-center justify-center shadow-card shrink-0"
          >
            + Add
          </button>
        )}
      </div>

      <div className="sticky top-[57px] md:top-[65px] z-20 -mx-4 px-4 py-2 bg-slate-50/95 backdrop-blur dark:bg-[#161616]/95 md:static md:mx-0 md:px-0 md:py-0 md:bg-transparent">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">🔍</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name / mobile..."
              className="w-full rounded-full border border-slate-200 bg-white pl-10 pr-4 py-3 text-[15px] min-h-[48px] focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 md:flex-wrap">
          {(["All", "M", "E", "Both"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setShiftFilter(f)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold min-h-[36px] active:scale-95 ${shiftFilter === f ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white text-slate-600 border border-slate-200 dark:bg-[#212121] dark:border-[#333] dark:text-slate-300"}`}
            >
              {f === "All" ? "All" : f === "Both" ? "M&E" : f === "M" ? "Morning" : "Evening"}
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:p-4" onClick={handleCancel}>
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-4 pb-[max(1.5rem,var(--safe-area-inset-bottom))] shadow-2xl md:rounded-3xl md:p-6 dark:bg-[#212121]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 md:hidden" />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 md:text-xl dark:text-white">
                {editingIds.length > 0 ? "Edit Customer" : "Add New Customer"}
              </h2>
              <button
                type="button"
                onClick={handleCancel}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-500 active:scale-95 dark:bg-white/10 dark:text-slate-300"
              >
                ×
              </button>
            </div>
            {formError ? (
              <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">{formError}</p>
            ) : null}
            <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto md:max-h-none md:overflow-visible">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g. Amit Verma"
                  autoComplete="name"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base min-h-[48px] tracking-wider focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="10-digit mobile"
                  autoComplete="tel"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Address
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base min-h-[88px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Village / street..."
                  rows={2}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Shift *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: "M/E", l: "Both M&E" },
                    { v: "M", l: "Morning" },
                    { v: "E", l: "Evening" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setFormData({ ...formData, shift: o.v })}
                      className={`rounded-2xl border px-2 py-3 text-[13px] font-semibold min-h-[48px] active:scale-95 ${formData.shift === o.v ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-white/10 dark:text-white" : "border-slate-200 bg-white text-slate-600 dark:bg-white/5 dark:border-[#444] dark:text-slate-300"}`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-1 flex gap-2.5">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 min-h-[52px] active:scale-[0.98] dark:border-[#444] dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-[2] rounded-2xl bg-brand-500 px-4 py-3 text-sm font-bold text-white min-h-[52px] shadow-card active:scale-[0.98]"
                >
                  {editingIds.length > 0 ? "Update" : "+ Add"} Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div>
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-500" />
            <p className="mt-3 text-sm text-slate-500">Loading customers...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-card">
            <p className="text-3xl">🐄</p>
            <p className="mt-2 text-sm font-semibold text-slate-800">No customers yet</p>
            <p className="mt-1 text-xs text-slate-500">Tap + Add to add your first customer.</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
            <p className="text-sm text-slate-500">No matches for {searchQuery || shiftFilter}. Try clearing search.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards - no side-scroll */}
            <div className="flex flex-col gap-2.5 md:hidden">
              {filteredGroups.map((group, groupIndex) => {
                const primary = group[0];
                const label = formatShiftLabel(group);
                const initial = (primary.name.trim().charAt(0) || "?").toUpperCase();
                return (
                  <div
                    key={primary.serialNumber}
                    ref={(node) => {
                      cardRefs.current[primary.serialNumber] = node;
                    }}
                    data-mobile-customer-serial={primary.serialNumber}
                    onPointerDown={handleMobilePointerDown(primary.serialNumber)}
                    onPointerMove={handleMobilePointerMove(primary.serialNumber)}
                    onPointerUp={handleMobilePointerUp(primary.serialNumber)}
                    onPointerCancel={handleMobilePointerCancel}
                    style={{
                      touchAction: mobileDraggedSerial === primary.serialNumber ? "none" : "pan-y",
                    }}
                    className={`rounded-2xl border border-slate-200 bg-white p-3.5 shadow-card select-none ${
                      mobileDraggedSerial === primary.serialNumber
                        ? "opacity-60 ring-2 ring-brand-500 ring-inset"
                        : ""
                    } ${
                      mobileDropSerial === primary.serialNumber
                        ? "ring-2 ring-brand-500 ring-inset"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-slate-400 dark:text-slate-500"
                        title="Long press and drag to reorder"
                      >
                        ⋮⋮
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-[15px] font-bold text-slate-900">{primary.name}</p>
                        </div>
                        {(primary.mobile?.trim() || primary.address?.trim()) ? (
                          <p className="selectable mt-0.5 truncate text-xs text-slate-500">
                            {primary.mobile?.trim() ? primary.mobile.trim() : null}
                            {primary.mobile?.trim() && primary.address?.trim() ? " • " : ""}
                            {primary.address?.trim() ? primary.address.trim() : null}
                          </p>
                        ) : null}
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${shiftBadgeStyle(label)}`}>
                        {label}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleEditClick(group)}
                        className="flex min-h-[44px] items-center justify-center rounded-xl bg-brand-50 text-[13px] font-bold text-brand-700 active:scale-95 dark:bg-blue-950/40 dark:text-blue-300"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(group.map((c) => c.serialNumber))}
                        className="flex min-h-[44px] items-center justify-center rounded-xl bg-red-50 text-[13px] font-bold text-red-600 active:scale-95 dark:bg-red-950/40 dark:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Desktop / tablet table - kept for md+ */}
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card md:block">
              <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-900">
                  S.No
                </th>
                <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-900">
                  Name
                </th>
                <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-900">
                  Mobile
                </th>
                <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-900">
                  Shift
                </th>
                <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-900">
                  Address
                </th>
                <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-900">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredGroups.map((group, groupIndex) => {
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
                    <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700">
                      {groupIndex + 1}
                    </td>
                    <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700 font-medium">
                      {primary.name}
                    </td>
                    <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700">
                      {primary.mobile}
                    </td>
                    <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700">
                      {formatShiftLabel(group)}
                    </td>
                    <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm text-slate-700 truncate">
                      {primary.address}
                    </td>
                    <td className="px-2 md:px-6 py-2 md:py-3 text-xs md:text-sm flex gap-2 md:gap-3 flex-col sm:flex-row">
                      <button
                        onClick={() => handleEditClick(group)}
                        className="text-brand-600 hover:text-brand-700 active:text-brand-800 font-medium px-3 py-2 rounded hover:bg-brand-50 active:bg-brand-100 transition min-h-[40px] flex items-center justify-center"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() =>
                          handleDelete(
                            group.map((customer) => customer.serialNumber),
                          )
                        }
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
            </div>
          </>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-[#212121]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Customer?</h3>
            <p className="mt-1 text-[13px] text-slate-500">This will remove this customer. This cannot be undone.</p>
            <div className="mt-4 flex gap-2.5">
              <button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold min-h-[52px] active:scale-[0.98]">Cancel</button>
              <button type="button" onClick={() => void confirmDelete()} className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white min-h-[52px] active:scale-[0.98]">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Customers;