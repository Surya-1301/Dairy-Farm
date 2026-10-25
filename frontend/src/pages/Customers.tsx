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

function getCustomerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length > 0) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return "?";
}

const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-blue-600",
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
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
    if (label.includes("&") || label === "M/E") {
      return "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/40 border border-emerald-500/20";
    }
    if (label === "M") {
      return "bg-amber-500/10 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/40 border border-amber-500/20";
    }
    if (label === "E") {
      return "bg-violet-500/10 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800/40 border border-violet-500/20";
    }
    return "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400";
  };

  const totalCount = groupedCustomers.length;
  const bothCount = groupedCustomers.filter(
    (g) => g.some((c) => c.shift === "M") && g.some((c) => c.shift === "E"),
  ).length;
  const morningCount = groupedCustomers.filter((g) =>
    g.some((c) => c.shift === "M"),
  ).length;
  const eveningCount = groupedCustomers.filter((g) =>
    g.some((c) => c.shift === "E"),
  ).length;

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
      // Do not start a drag when interacting with a button or anchor link.
      if ((event.target as HTMLElement).closest("button, a")) {
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
          <h1 className="text-xl md:text-3xl font-bold text-slate-900 dark:text-white">
            Customers
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 md:text-sm">
            {filteredGroups.length} of {groupedCustomers.length} shown
          </p>
        </div>
        {!showForm && (
          <button
            onClick={handleAddClick}
            className="rounded-full bg-brand-500 px-4 md:px-5 py-2.5 md:py-3 text-xs md:text-sm text-white font-bold hover:bg-brand-600 active:scale-95 min-h-[44px] flex items-center justify-center shadow-card shrink-0 gap-1.5"
          >
            <span className="text-base leading-none">+</span> Add Customer
          </button>
        )}
      </div>

      {/* Glanceable KPI Summary Bar */}
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => setShiftFilter("All")}
          className={`flex flex-col items-center justify-center rounded-2xl p-2 md:p-3 text-center transition active:scale-95 ${
            shiftFilter === "All"
              ? "border border-brand-500/50 bg-brand-500/10 dark:bg-brand-500/20 ring-2 ring-brand-500/30"
              : "border border-slate-200 bg-white hover:border-slate-300 dark:border-[#2a2a2a] dark:bg-[#1c1c1c] shadow-xs"
          }`}
        >
          <span className="text-[10px] md:text-xs font-semibold text-slate-500 dark:text-slate-400">Total</span>
          <span className="text-base md:text-xl font-black text-slate-900 dark:text-white">{totalCount}</span>
        </button>

        <button
          type="button"
          onClick={() => setShiftFilter("Both")}
          className={`flex flex-col items-center justify-center rounded-2xl p-2 md:p-3 text-center transition active:scale-95 ${
            shiftFilter === "Both"
              ? "border border-emerald-500/50 bg-emerald-500/10 dark:bg-emerald-500/20 ring-2 ring-emerald-500/30"
              : "border border-slate-200 bg-white hover:border-slate-300 dark:border-[#2a2a2a] dark:bg-[#1c1c1c] shadow-xs"
          }`}
        >
          <span className="text-[10px] md:text-xs font-semibold text-slate-500 dark:text-slate-400">M & E</span>
          <span className="text-base md:text-xl font-black text-emerald-600 dark:text-emerald-400">{bothCount}</span>
        </button>

        <button
          type="button"
          onClick={() => setShiftFilter("M")}
          className={`flex flex-col items-center justify-center rounded-2xl p-2 md:p-3 text-center transition active:scale-95 ${
            shiftFilter === "M"
              ? "border border-amber-500/50 bg-amber-500/10 dark:bg-amber-500/20 ring-2 ring-amber-500/30"
              : "border border-slate-200 bg-white hover:border-slate-300 dark:border-[#2a2a2a] dark:bg-[#1c1c1c] shadow-xs"
          }`}
        >
          <span className="text-[10px] md:text-xs font-semibold text-slate-500 dark:text-slate-400">Morning</span>
          <span className="text-base md:text-xl font-black text-amber-600 dark:text-amber-400">{morningCount}</span>
        </button>

        <button
          type="button"
          onClick={() => setShiftFilter("E")}
          className={`flex flex-col items-center justify-center rounded-2xl p-2 md:p-3 text-center transition active:scale-95 ${
            shiftFilter === "E"
              ? "border border-violet-500/50 bg-violet-500/10 dark:bg-violet-500/20 ring-2 ring-violet-500/30"
              : "border border-slate-200 bg-white hover:border-slate-300 dark:border-[#2a2a2a] dark:bg-[#1c1c1c] shadow-xs"
          }`}
        >
          <span className="text-[10px] md:text-xs font-semibold text-slate-500 dark:text-slate-400">Evening</span>
          <span className="text-base md:text-xl font-black text-violet-600 dark:text-violet-400">{eveningCount}</span>
        </button>
      </div>

      {/* Sticky Search Bar */}
      <div className="sticky top-[57px] md:top-[65px] z-20 -mx-4 px-4 py-2 bg-slate-50/95 backdrop-blur dark:bg-[#121212]/95 md:static md:mx-0 md:px-0 md:py-0 md:bg-transparent">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, mobile or address..."
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-[14px] min-h-[48px] shadow-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-[#282828] dark:bg-[#1a1a1a] dark:text-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Add / Edit Drawer Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs md:items-center md:p-4" onClick={handleCancel}>
          <div
            className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-5 pb-[max(1.5rem,var(--safe-area-inset-bottom))] shadow-2xl md:rounded-3xl dark:border-[#2e2e2e] dark:bg-[#1a1a1a]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300 md:hidden dark:bg-slate-700" />
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:bg-brand-500/20 dark:text-blue-400 font-bold">
                  👤
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 md:text-lg dark:text-white">
                    {editingIds.length > 0 ? "Edit Customer" : "Add New Customer"}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {editingIds.length > 0 ? "Update delivery details" : "Save new delivery details & shift"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95 dark:bg-[#262626] dark:text-slate-400 dark:hover:bg-[#333]"
              >
                ✕
              </button>
            </div>

            {formError ? (
              <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {formError}
              </p>
            ) : null}

            <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3.5 overflow-y-auto md:max-h-none md:overflow-visible">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Customer Name *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">👤</span>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-[#333] dark:bg-[#222] dark:text-white dark:focus:border-brand-400"
                    placeholder="e.g. Ramesh Kumar"
                    autoComplete="name"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Phone Number (10 digits)
                </label>
                <div className="relative flex">
                  <span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-100 px-3 text-xs font-semibold text-slate-500 dark:border-[#333] dark:bg-[#262626] dark:text-slate-400">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className="w-full rounded-r-xl border border-slate-200 bg-slate-50/60 py-2.5 px-3 text-sm tracking-wider text-slate-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-[#333] dark:bg-[#222] dark:text-white dark:focus:border-brand-400"
                    placeholder="10-digit mobile"
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Milk Delivery Shift *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: "M/E", l: "Both M&E", icon: "🔄" },
                    { v: "M", l: "Morning", icon: "🌅" },
                    { v: "E", l: "Evening", icon: "🌇" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setFormData({ ...formData, shift: o.v })}
                      className={`flex flex-col items-center justify-center rounded-xl p-2.5 text-center transition active:scale-95 ${
                        formData.shift === o.v
                          ? "border-2 border-brand-500 bg-brand-50/60 text-brand-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300 font-bold"
                          : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-[#333] dark:bg-[#222] dark:text-slate-300"
                      }`}
                    >
                      <span className="text-sm">{o.icon}</span>
                      <span className="text-xs mt-0.5">{o.l}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Address / House No.
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-400">📍</span>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-[#333] dark:bg-[#222] dark:text-white dark:focus:border-brand-400"
                    placeholder="Village / street / house details..."
                    rows={2}
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 rounded-xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 dark:border-[#333] dark:text-slate-300 dark:hover:bg-[#262626] transition min-h-[48px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-[2] rounded-xl bg-brand-500 py-3 text-xs font-bold text-white shadow-md shadow-brand-500/20 hover:bg-brand-600 active:scale-95 transition min-h-[48px]"
                >
                  {editingIds.length > 0 ? "Update Customer" : "+ Add Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer List Section */}
      <div>
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card dark:border-[#282828] dark:bg-[#1a1a1a]">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-500 dark:border-[#333] dark:border-t-brand-400" />
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Loading customers...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-card dark:border-[#333] dark:bg-[#1a1a1a]">
            <p className="text-3xl">🐄</p>
            <p className="mt-2 text-sm font-bold text-slate-800 dark:text-white">No customers yet</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tap + Add Customer to add your first customer.</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card dark:border-[#282828] dark:bg-[#1a1a1a]">
            <p className="text-3xl">🔍</p>
            <p className="mt-2 text-sm font-bold text-slate-800 dark:text-white">No customers found</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">No matches for {searchQuery || shiftFilter}. Try clearing search or filters.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards - no side-scroll */}
            <div className="flex flex-col gap-2.5 md:hidden">
              {filteredGroups.map((group, groupIndex) => {
                const primary = group[0];
                const label = formatShiftLabel(group);
                const initials = getCustomerInitials(primary.name);
                const gradient = getAvatarGradient(primary.name);
                const cleanPhone = primary.mobile?.trim().replace(/\D/g, "") ?? "";

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
                    className={`rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-card select-none dark:border-[#282828] dark:bg-[#1c1c1c] transition ${
                      mobileDraggedSerial === primary.serialNumber
                        ? "opacity-60 ring-2 ring-brand-500 ring-inset"
                        : ""
                    } ${
                      mobileDropSerial === primary.serialNumber
                        ? "ring-2 ring-brand-500 ring-inset"
                        : ""
                    }`}
                  >
                    {/* Top Section: Grip + Avatar + Name/Phone/Address + Shift Badge */}
                    <div className="flex items-start gap-3">
                      <div
                        aria-hidden="true"
                        className="cursor-grab active:cursor-grabbing pt-1 text-slate-300 dark:text-slate-600 select-none"
                        title="Long press and drag to reorder"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="8" cy="6" r="2" />
                          <circle cx="16" cy="6" r="2" />
                          <circle cx="8" cy="12" r="2" />
                          <circle cx="16" cy="12" r="2" />
                          <circle cx="8" cy="18" r="2" />
                          <circle cx="16" cy="18" r="2" />
                        </svg>
                      </div>

                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white font-bold text-xs shadow-xs tracking-wider`}>
                        {initials}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <h3 className="truncate text-[15px] font-bold text-slate-900 dark:text-white">
                            {primary.name}
                          </h3>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${shiftBadgeStyle(label)}`}>
                            {label}
                          </span>
                        </div>

                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-brand-600 dark:text-brand-400">#{groupIndex + 1}</span>
                          {cleanPhone ? (
                            <>
                              <span>•</span>
                              <span className="font-medium tracking-wide">{primary.mobile}</span>
                            </>
                          ) : null}
                        </p>

                        {primary.address?.trim() ? (
                          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <span className="opacity-75">📍</span>
                            <span className="truncate">{primary.address.trim()}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {/* Bottom Action Bar: Edit, Delete */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-[#282828] grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditClick(group)}
                        className="flex min-h-[40px] items-center justify-center rounded-xl bg-blue-50 text-xs font-bold text-blue-700 active:scale-95 dark:bg-blue-950/50 dark:text-blue-300 dark:border dark:border-blue-900/40 transition"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(group.map((c) => c.serialNumber))}
                        className="flex min-h-[40px] items-center justify-center rounded-xl bg-red-50 text-xs font-bold text-red-600 active:scale-95 dark:bg-red-950/50 dark:text-red-300 dark:border dark:border-red-900/40 transition"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop / tablet table - kept for md+ */}
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card md:block dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-[#2a2a2a] dark:bg-[#202020] dark:text-slate-400">
                    <th className="px-4 py-3 text-center w-12">#</th>
                    <th className="px-6 py-3">Customer</th>
                    <th className="px-6 py-3">Contact</th>
                    <th className="px-6 py-3">Shift</th>
                    <th className="px-6 py-3">Address</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#252525]">
                  {filteredGroups.map((group, groupIndex) => {
                    const primary = group[0];
                    const isDragging = draggedSerial === primary.serialNumber;
                    const isDropTarget = dropSerial === primary.serialNumber;
                    const initials = getCustomerInitials(primary.name);
                    const gradient = getAvatarGradient(primary.name);
                    const label = formatShiftLabel(group);

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
                        className={`hover:bg-slate-50/70 dark:hover:bg-[#202020] transition ${
                          isDragging ? "opacity-50" : ""
                        } ${
                          isDropTarget ? "ring-2 ring-brand-500 ring-inset" : ""
                        } cursor-grab active:cursor-grabbing`}
                      >
                        <td className="px-4 py-3 text-center text-xs font-bold text-slate-400">
                          {groupIndex + 1}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white font-bold text-[11px]`}>
                              {initials}
                            </div>
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {primary.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-700 dark:text-slate-300">
                          {primary.mobile ? (
                            <span>{primary.mobile}</span>
                          ) : (
                            <span className="text-slate-400 italic text-xs">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${shiftBadgeStyle(label)}`}>
                            {label}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-600 dark:text-slate-400 truncate max-w-xs">
                          {primary.address || "—"}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleEditClick(group)}
                              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#282828] transition"
                              title="Edit"
                            >
                               Edit
                            </button>
                            <button
                              onClick={() =>
                                handleDelete(
                                  group.map((customer) => customer.serialNumber),
                                )
                              }
                              className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 transition"
                              title="Delete"
                            >
                               Delete
                            </button>
                          </div>
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

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-4 md:items-center" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#2e2e2e] dark:bg-[#1a1a1a]" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 mb-3 text-lg">
              🗑️
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Customer?</h3>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
              This will remove this customer and their shift records. This action cannot be undone.
            </p>
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border border-slate-300 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 dark:border-[#333] dark:text-slate-300 dark:hover:bg-[#262626] transition min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white hover:bg-red-700 active:scale-95 shadow-md shadow-red-500/20 transition min-h-[44px]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Customers;